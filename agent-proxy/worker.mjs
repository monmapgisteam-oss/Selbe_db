/**
 * Сэлбэ AI туслах — LLM РЕЛЕ, Cloudflare Worker хувилбар.
 *
 * Байршуулах:
 *   cd agent-proxy
 *   npx wrangler secret put ANTHROPIC_API_KEY     # нэг удаа
 *   npx wrangler deploy
 */

import {
  createLimiter, LIMITS, WINDOW_MS, createBudget, budgetFromEnv, budgetDay, BUDGET_MSG, upstreamErrorText, UPSTREAM_AUTH,
  createConcurrency, CONCURRENT_MSG, botCaller, sanitizeChat,
  estimateInputTokens, reserveTokens, settleTokens, utf8Bytes,
  THINKING_UPDATES_BETA, thinkingUpdatesFor,
} from './rateLimit.mjs';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

const DEFAULTS = {
  MODEL: 'claude-opus-5-5',
  EFFORT: 'medium',
  MAX_TOKENS: 10000,
  PORTAL: 'https://gis.selbecity.mn/geoportal',
  PERMS: 'https://gis.selbecity.mn/map/rest/services/Hosted/SYS_Selbe_Permissions/FeatureServer/230',
};

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

/**
 * Шалгагдсан ArcGIS токены КЭШ.
 */
const TOKEN_TTL = 5 * 60 * 1000;
const VERIFIED_MAX = 500;
const verified = new Map();
function verifiedUser(key) {
  const hit = verified.get(key);
  return hit && hit.until > Date.now() ? hit.username : null;
}

/** SQL мөрийн литерал — `'` → `''` (хэрэглэгчийн нэр `where`-д орно) */
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
async function hasPortalRow(token, username, env) {
  const url = (env.ARCGIS_PERMS_URL || DEFAULTS.PERMS).replace(/\/+$/, '');
  const name = String(username ?? '').trim();
  const lo = name.toLowerCase();
  const where = lo === name ? `username = ${sqlStr(lo)}` : `username = ${sqlStr(lo)} OR username = ${sqlStr(name)}`;
  let data;
  try {
    const res = await fetch(`${url}/query`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ f: 'json', where, outFields: 'username,role,views', returnGeometry: 'false', resultRecordCount: '5', token }).toString(),
    });
    data = await res.json();
  } catch {
    return { ok: false, reason: 'Порталын эрхийн хүснэгт шалгагдсангүй — түр хүлээгээд дахин оролдоно уу', status: 503 };
  }
  if (!data || data.error || !Array.isArray(data.features)) {
    return { ok: false, reason: 'Порталын эрхийн хүснэгт шалгагдсангүй — түр хүлээгээд дахин оролдоно уу', status: 503 };
  }
  const live = data.features.some((f) => f?.attributes && String(f.attributes.views ?? '') !== 'removed');
  return live ? { ok: true } : { ok: false, reason: 'Порталд бүртгэлгүй аккаунт — админаас эрх авна уу', status: 403 };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** Мөрийн SHA-256 (hex) — Web Crypto (Worker ба Node ≥19-д ижил) */
async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? ''))));
}
/** HMAC-SHA256 (hex) — `PROMPT_HMAC`-ийн гарын үсэг (`server.mjs`-ийн `promptSig`-тэй ИЖИЛ үр дүн) */
async function hmacHex(key, text) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}

function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % b.length] ?? 0);
  return diff === 0;
}

const limiter = createLimiter();
const inflight = createConcurrency();

const kvWindow = () => Math.floor(Date.now() / WINDOW_MS);
async function kvNum(env, key) {
  try {
    return Number(await env.RL_KV.get(key)) || 0;
  } catch (e) {
    console.warn('[agent] KV уншилт унав:', e?.message);
    return 0;
  }
}
function kvPut(env, ctx, key, value, ttl) {
  const p = Promise.resolve()
    .then(() => env.RL_KV.put(key, String(value), { expirationTtl: ttl }))
    .catch((e) => console.warn('[agent] KV бичилт унав:', e?.message));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  return p;
}
/** KV-ийн минутын цонхонд хязгаарт ХҮРСЭН эсэх (тоолохгүй) */
async function kvFull(env, key, limit) {
  if (!env.RL_KV) return false;
  return (await kvNum(env, `rl:${kvWindow()}:${key}`)) >= limit;
}
/** KV-ийн минутын цонхонд ТООЛООД хэтэрсэн эсэх */
async function kvHit(env, ctx, key, limit) {
  if (!env.RL_KV) return false;
  const k = `rl:${kvWindow()}:${key}`;
  const n = (await kvNum(env, k)) + 1;
  kvPut(env, ctx, k, n, 120);
  return n > limit;
}

const memBudget = createBudget();
const NO_KV_BUDGET_SHARE = 0.5;
let warnedNoKv = false;
function budgetCapFor(env, configured) {
  if (env.RL_KV || !configured) return configured;
  if (!warnedNoKv) {
    warnedNoKv = true;
    console.warn('[agent] ⚠️ RL_KV холбоогүй — өдрийн төсөв/хурдны хязгаар зөвхөн isolate тус бүрд (production-д wrangler.toml [[kv_namespaces]] ЗААВАЛ); isolate доторх төсвийг ½ болгов');
  }
  return Math.max(1, Math.floor(configured * NO_KV_BUDGET_SHARE));
}
const pendingBudget = createBudget();
const budgetKey = (caller) => `budget:${budgetDay(Date.now())}:${caller}`;
async function budgetOver(env, caller, limit) {
  if (!limit) return false;
  if (env.RL_KV) return (await kvNum(env, budgetKey(caller))) + pendingBudget.used(caller) >= limit;
  return memBudget.over(caller, limit);
}
/** Урьдчилсан тооцоо — KV руу БИЧИХГҮЙ (дээрх) */
function budgetReserve(env, caller, n) {
  if (!n) return;
  if (env.RL_KV) pendingBudget.add(caller, n);
  else memBudget.adjust(caller, n);
}
/** Тааруулалт — тооцоог санах ойгоос хасаж, бодит зарцуулалтыг (>0 бол) KV-д НЭГ удаа бичнэ */
function budgetSettle(env, ctx, caller, reserved, charge) {
  if (env.RL_KV) {
    pendingBudget.adjust(caller, -reserved);
    if (Number.isFinite(charge) && charge > 0) void budgetAdd(env, ctx, caller, charge);
    return;
  }
  memBudget.adjust(caller, charge - reserved);
}
async function budgetAdd(env, ctx, caller, n) {
  if (!Number.isFinite(n) || !n) return;
  if (!env.RL_KV) {
    memBudget.adjust(caller, n);
    return;
  }
  const p = (async () => {
    const k = budgetKey(caller);
    await kvPut(env, null, k, Math.max(0, (await kvNum(env, k)) + n), 2 * 86400);
  })().catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(p);
  return p;
}

const json = (code, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

/** Зөвшөөрсөн эхийн жагсаалт — таслалаар */
const allowedOrigins = (env) =>
  (env.ALLOW_ORIGIN || 'http://localhost:8123,http://127.0.0.1:8123')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function corsHeaders(origin, env) {
  const h = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-arcgis-token, x-prompt-sig',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/**
 * ArcGIS токеныг ПОРТАЛААС шалгана.
 *
 * @returns {Promise<{ok: true, username: string} | {ok: false, reason: string}>}
 */
async function checkArcGIS(token, env, key) {
  if (!token) return { ok: false, reason: 'Нэвтрэлтийн мэдээлэл алга' };

  key ||= await sha256Hex(token);
  const cachedUser = verifiedUser(key);
  if (cachedUser) return { ok: true, username: cachedUser };

  const portal = (env.ARCGIS_PORTAL || DEFAULTS.PORTAL).replace(/\/+$/, '');
  let data;
  try {
    const res = await fetch(`${portal}/sharing/rest/community/self`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ f: 'json', token }).toString(),
    });
    data = await res.json();
  } catch {
    verified.delete(key);
    return { ok: false, reason: 'Нэвтрэлт шалгах үйлчилгээ хариу өгсөнгүй' };
  }

  if (!data || data.error || !data.username) {
    verified.delete(key);
    return { ok: false, reason: 'Нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна' };
  }

  const wantOrg = env.ARCGIS_ORG_ID?.trim();
  if (wantOrg && data.orgId !== wantOrg) {
    verified.delete(key);
    return { ok: false, reason: 'Танай байгууллагад энэ үйлчилгээ нээгдээгүй байна' };
  }
  const row = await hasPortalRow(token, data.username, env);
  if (!row.ok) {
    verified.delete(key);
    return { ok: false, reason: row.reason, status: row.status };
  }

  verified.delete(key);
  while (verified.size >= VERIFIED_MAX) verified.delete(verified.keys().next().value);
  verified.set(key, { username: data.username, until: Date.now() + TOKEN_TTL });
  return { ok: true, username: data.username };
}

const handler = {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const MODEL = env.AGENT_MODEL || DEFAULTS.MODEL;
    const EFFORT = env.AGENT_EFFORT || DEFAULTS.EFFORT;
    const withEffort = Boolean(EFFORT) && !/haiku/i.test(MODEL);

    /*
     * Эрүүл мэндийн шалгалт — порталын UI реле асаалттай эсэхийг эндээс мэднэ.
     */
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      if (limiter.hit(`health:${request.headers.get('cf-connecting-ip') || origin || 'anon'}`, LIMITS.ip)) {
        return json(429, { error: 'Хэт олон хүсэлт' }, cors);
      }
      return json(200, { ok: true }, cors);
    }

    if (request.method !== 'POST' || !url.pathname.startsWith('/chat')) {
      return json(404, { error: 'Ийм зам байхгүй' }, cors);
    }

    if (origin && !allowedOrigins(env).includes(origin)) {
      return json(403, { error: 'Энэ эх сурвалжид зөвшөөрөл алга' }, cors);
    }

    const isBot = Boolean(env.BOT_SECRET) && secretMatches(request.headers.get('x-bot-secret'), env.BOT_SECRET);

    if (!env.ARCGIS_ORG_ID?.trim() && !isBot) {
      console.error('[agent] ⛔ ARCGIS_ORG_ID тохируулагдаагүй — реле нэвтрэлтгүй ажиллахгүй (wrangler.toml / .dev.vars)');
      return json(503, { error: 'Реле нэвтрэлтгүй тохируулагдсан байна — администраторт хандана уу', retryable: false }, cors);
    }

    const ip = request.headers.get('cf-connecting-ip') || origin || 'anon';
    if (limiter.hit(`ipcap:${ip}`, LIMITS.ip)) {
      return json(429, { error: 'Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
    }
    let caller = isBot ? botCaller(request.headers.get('x-bot-user')) : `origin:${origin || 'anon'}`;
    if (env.ARCGIS_ORG_ID && !isBot) {
      const token = request.headers.get('x-arcgis-token');
      const hash = token ? await sha256Hex(token) : '';
      const cachedUser = hash ? verifiedUser(hash) : null;
      if (cachedUser) {
        caller = `user:${cachedUser}`;
      } else {
        const failKey = `authfail:${ip}:${hash.slice(0, 16)}`;
        const ipFailKey = `authfailip:${ip}`;
        if (limiter.full(failKey, LIMITS.authFail) || limiter.full(ipFailKey, LIMITS.authFailIp)
          || await kvFull(env, failKey, LIMITS.authFail) || await kvFull(env, ipFailKey, LIMITS.authFailIp)) {
          return json(429, { error: 'Хэт олон амжилтгүй нэвтрэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
        }
        const auth = await checkArcGIS(token, env, hash);
        if (!auth.ok) {
          const status = auth.status ?? 401;
          if (status !== 503) {
            limiter.hit(failKey, LIMITS.authFail);
            limiter.hit(ipFailKey, LIMITS.authFailIp);
            await kvHit(env, ctx, failKey, LIMITS.authFail);
            await kvHit(env, ctx, ipFailKey, LIMITS.authFailIp);
          }
          return json(status, { error: auth.reason, retryable: status === 503 }, cors);
        }
        caller = `user:${auth.username}`;
      }
    }

    if (limiter.full(caller, LIMITS.user) || await kvFull(env, caller, LIMITS.user)) {
      return json(429, { error: 'Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
    }
    const dailyBudget = budgetCapFor(env, budgetFromEnv(env.DAILY_TOKEN_BUDGET));
    const budgeted = caller !== 'bot' && dailyBudget > 0;
    if (budgeted && await budgetOver(env, caller, dailyBudget)) {
      return json(429, { error: BUDGET_MSG, code: 'daily_budget', retryable: false }, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      console.error('[agent] ⛔ ANTHROPIC_API_KEY тохируулагдаагүй — `npm run deploy:secret`');
      return json(502, UPSTREAM_AUTH, cors);
    }

    const release = inflight.acquire(caller, caller === 'bot' ? LIMITS.botConcurrent : LIMITS.concurrent);
    if (!release) {
      return json(429, { error: CONCURRENT_MSG, code: 'concurrent', retryable: true }, cors);
    }
    limiter.hit(caller, LIMITS.user);
    await kvHit(env, ctx, caller, LIMITS.user);
    try {
      return await relayChat(request, env, ctx, { cors, caller, isBot, budgeted, MODEL, EFFORT, withEffort });
    } finally {
      release();
    }
  },
};
export default handler;

async function readBodyCapped(request, max) {
  if (!request.body) return { text: '', bytes: 0 };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      try { await reader.cancel(); } catch { /* хаягдсан урсгал */ }
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return { text: new TextDecoder().decode(buf), bytes: size };
}

/**
 * `/chat`-ийн үлдсэн хэсэг (бие унших → шалгах → төсөв урьдчилан хасах → Anthropic).
 */
async function relayChat(request, env, ctx, { cors, caller, isBot, budgeted, MODEL, EFFORT, withEffort }) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return json(413, { error: 'Хүсэлтийн бие хэт том' }, cors);
  }
  const read = await readBodyCapped(request, MAX_BODY);
  if (!read) return json(413, { error: 'Хүсэлтийн бие хэт том' }, cors);

  let payload;
  try {
    payload = JSON.parse(read.text);
  } catch (e) {
    console.warn('[agent] бие уншигдсангүй:', caller, e?.message);
    return json(400, { error: 'Хүсэлтийн биеийг уншиж чадсангүй (JSON биш).' }, cors);
  }

  const { system } = payload ?? {};
  if (system != null && typeof system !== 'string') {
    return json(400, { error: '`system` мөр байх ёстой', retryable: false }, cors);
  }
  const clean = sanitizeChat(payload ?? {});
  if (!clean.ok) {
    console.warn('[agent] хүсэлт шалгалтад унав:', caller, clean.error);
    return json(400, { error: clean.error, retryable: false }, cors);
  }
  const { messages, tools } = clean;

  const promptKey = typeof env.PROMPT_HMAC === 'string' ? env.PROMPT_HMAC.trim() : '';
  if (promptKey && !isBot) {
    const sysText = system == null ? '' : system;
    const good = typeof sysText === 'string'
      && secretMatches(request.headers.get('x-prompt-sig'), await hmacHex(promptKey, sysText));
    if (!good) {
      console.warn('[agent] системийн зааврын гарын үсэг таарсангүй:', caller);
      return json(403, { error: 'Системийн зааврын гарын үсэг таарсангүй — хуудсыг дахин ачаална уу.', retryable: false }, cors);
    }
  }

  const inputEst = estimateInputTokens(read.bytes, utf8Bytes(system));
  const reserved = budgeted ? reserveTokens(inputEst, DEFAULTS.MAX_TOKENS) : 0;
  if (reserved) budgetReserve(env, caller, reserved);
  let charge = inputEst;
  const updates = thinkingUpdatesFor(MODEL);
  try {
    let res;
    let body;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': VERSION,
          ...(updates ? { 'anthropic-beta': THINKING_UPDATES_BETA } : {}),
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: DEFAULTS.MAX_TOKENS,
          //
          ...(withEffort ? { output_config: { effort: EFFORT } } : {}),
          ...(updates ? { thinking: { type: 'adaptive', display: 'updates' } } : {}),
          system: system
            ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
            : undefined,
          tools,
          messages,
        }),
      });
      body = await res.json();
    } catch (e) {
      console.error('[agent] AI үйлчилгээтэй холбогдож чадсангүй:', caller, e?.message);
      return json(502, { error: 'AI үйлчилгээтэй холбогдож чадсангүй — дахин оролдоно уу.', retryable: true, upstream: true }, cors);
    }

    if (!res.ok) {
      charge = 0;
      const msg = body?.error?.message ?? `AI үйлчилгээний алдаа (HTTP ${res.status})`;
      console.error('[agent] AI үйлчилгээний алдаа:', caller, res.status, msg);
      if (res.status === 401 || res.status === 403) {
        console.error('[agent] ⛔ ANTHROPIC_API_KEY буруу эсвэл хүчингүй — `npm run deploy:secret`');
        return json(502, UPSTREAM_AUTH, cors);
      }
      return json(res.status, {
        error: upstreamErrorText(res.status),
        retryable: res.status === 429 || res.status === 529,
        upstream: true,
      }, cors);
    }

    charge = settleTokens(body?.usage, inputEst);

    if (body?.stop_reason === 'refusal') {
      return json(200, {
        stop_reason: 'refusal',
        content: [],
        note: 'Хүсэлтийг аюулгүй байдлын шалгуур татгалзлаа.',
      }, cors);
    }

    return json(200, {
      stop_reason: body?.stop_reason,
      content: body?.content,
      usage: body?.usage,
    }, cors);
  } finally {
    if (reserved) budgetSettle(env, ctx, caller, reserved, charge);
  }
}
