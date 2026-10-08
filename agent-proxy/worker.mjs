/**
 * Сэлбэ AI туслах — LLM РЕЛЕ, Cloudflare Worker хувилбар.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: портал `output: 'export'` буюу бүрэн статик тул GitHub
 * Pages дээр сервер тал ОГТ ажиллахгүй. Anthropic-ийн түлхүүрийг статик build-д
 * шингээвэл JS багцаас хэн ч уншина. Тиймээс түлхүүр ЗӨВХӨН энд, Cloudflare-ийн
 * нууц хадгалалтад байна — хэрэглэгч юу ч бичихгүй.
 *
 * ⚠️ `server.mjs`-ийн ТОЛИН ХУВИЛБАР (локал хөгжүүлэлтэд тэрийг хэвээр
 * ашиглана). Загвар, effort, кэшлэлт, алдааны мессеж ижил байх ёстой —
 * аль нэгийг өөрчилвөл НӨГӨӨГ нь хамт засна.
 *
 * ⚠️ ЭНЭ ФАЙЛ АГЕНТЫН ЛОГИКГҮЙ. Хэрэгсэл гүйцэтгэх, давхаргын бүртгэл унших,
 * эрх шалгах бүхэн browser талд (`src/lib/agent/*`) явна. Ингэснээр давхарга
 * нэмэгдэх/хасагдахад релег огт засахгүй (гол шаардлага №3).
 *
 * ⚠️ SDK-гүй, зөвхөн `fetch` — Worker дээр багц угсрах алхам нэмэхгүйн тулд.
 *
 * Байршуулах:
 *   cd agent-proxy
 *   npx wrangler secret put ANTHROPIC_API_KEY     # нэг удаа
 *   npx wrangler deploy
 */

/* ⚠️ 2026-10-01: хурдны хязгаар `server.mjs`-тэй ХУВААЛЦСАН модуль — wrangler багцлахдаа оруулна */
import {
  createLimiter, LIMITS, WINDOW_MS, createBudget, budgetFromEnv, budgetDay, usageTokens, BUDGET_MSG, upstreamErrorText,
} from './rateLimit.mjs';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

const DEFAULTS = {
  MODEL: 'claude-opus-5',
  EFFORT: 'low',
  /**
   * ⚠️ Opus 5-д бодолт анхнаасаа асаалттай ба `max_tokens` нь бодолт + хариу
   * ХОЁУЛАНГ хамарна.
   *
   * ⚠️ 8000 → 10000 (2026-09-15-ны аудит): `server.mjs` нь 10000 байсан тул
   * локалд бүтэн гардаг урт хариулт (олон багцын хүснэгт + график) байршуулсан
   * Worker дээр таслагдаж, хөгжүүлэгч локалд давтаж чаддаггүй эвдрэл үүсдэг
   * байв. Хоёр файл нь толин хувилбар — тоонууд ЗААВАЛ ижил байна.
   */
  MAX_TOKENS: 10000,
  PORTAL: 'https://www.arcgis.com',
};

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

/**
 * Шалгагдсан ArcGIS токены КЭШ.
 *
 * ⚠️ Токен бүрийг ArcGIS руу дахин шалгуулбал асуулт бүрд нэмэлт 200–400мс
 * саатна (гол шаардлага №1 — хурд). Worker-ийн isolate богино настай тул энэ нь
 * зөвхөн ойрын хүсэлтүүдийг хурдасгах бөгөөд эрх хураахад 5 минутын дотор
 * хүчинтэй байдал дуусна.
 */
const TOKEN_TTL = 5 * 60 * 1000;
/**
 * ⚠️ 2026-09-30: кэшийн ДЭЭД ХЭМЖЭЭ (хамгийн хуучныг хаяна) ба нэвтрэлт УНАСАН
 *    токеныг кэшээс ШУУД хасна — ArcGIS 498/401 (хугацаа дууссан, хураагдсан)
 *    хариулсан агшнаас тэр токен дахин шалгагдана, 5 минут хүчинтэй үлдэхгүй.
 */
const VERIFIED_MAX = 500;
/* ⚠️ 2026-10-09 (аудит №4, `server.mjs`-ийн толин): кэшийн ТҮЛХҮҮР нь токены SHA-256 хэш —
   isolate-ийн санах ойд түүхий амьд токен хадгалахгүй; зөвхөн хэш + хэрэглэгчийн нэр. */
const verified = new Map();

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

/**
 * ⚠️ 2026-09-30: НУУЦ ТҮЛХҮҮРИЙГ ТОГТМОЛ ХУГАЦААНД харьцуулна (`x-bot-secret`).
 *    `===` нь эхний зөрсөн байтад зогсдог тул хариу өгөх хугацаанаас нууцыг
 *    байт байтаар таах онолын боломж (timing attack) үлддэг. Урт зөрвөл ч бүх
 *    байтыг гүйлгэнэ — хугацаа зөвхөн `a`-гийн уртаас хамаарна.
 *    (`server.mjs`-д `crypto.timingSafeEqual` — толин хувилбар.)
 */
function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % b.length] ?? 0);
  return diff === 0;
}

/**
 * ⚠️ БУЛААЛТААС ХАМГААЛАХ — нэг дуудагчийн (баталгаажсан ArcGIS хэрэглэгч, эс
 * бөгөөс эх) минут доторх хүсэлтийг хязгаарлана. Түлхүүр барих реле рүү хязгааргүй
 * дуудалт хийхээс сэргийлнэ.
 *
 * ⚠️ Worker-ийн isolate богино настай тул энэ нь ЗӨВХӨН ойрын хүсэлтэд үйлчилнэ
 * (isolate солигдоход тоолол тэглэгдэнэ) — нэг дуудагчийн хурц үерийг барих
 * хамгаалалт. Бат бэх, тархсан хязгаарлалт хэрэгтэй бол Cloudflare KV эсвэл
 * Durable Object-оор тоолуур хийнэ.
 */
/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): тоолуур (хуучирсан түлхүүрийн цэвэрлэгээтэй)
   ба хязгаарууд `rateLimit.mjs`-д — `server.mjs`-тэй ХУВААЛЦСАН: баталгаажсан
   хэрэглэгч минутад 40 · IP таг 300 (оффисын NAT) · амжилтгүй нэвтрэлт IP-д 20. */
const limiter = createLimiter();

/**
 * ⚠️ 2026-10-09 (аудит №5): ISOLATE ХООРОНДЫН ТООЛУУР — `RL_KV` KV холбосон үед л
 *    (`wrangler.toml`-ийн `[[kv_namespaces]]` жишээ). Дээрх санах ойн тоолуур isolate
 *    солигдоход тэглэгдэж, олон байршил/isolate дээр тархсан үерийг бүрэн барьдаггүй байв.
 *    · Санах ойн тоолуур ХЭВЭЭР эхэлж ажиллана (хурдан, KV руу явахгүй); KV нь нэмэлт давхарга.
 *    · KV нь EVENTUALLY CONSISTENT ба нэг түлхүүрт секундэд ~1 бичилт — тоолол ОЙРОЛЦОО
 *      (тогтмол минутын цонх, уралдаанд нэг хоёр алдагдана). Нарийн хязгаар хэрэгтэй бол
 *      Durable Object / Rate Limiting binding.
 *    · IP таг (300/мин) KV-д ОРОХГҮЙ — нэг түлхүүрт секундэд 5 бичилт KV-ийн хязгаарыг давна.
 *    · KV алдаа (хязгаар, түр саатал) хүсэлтийг УНАГААХГҮЙ — санах ойн тоолуур л үлдэнэ.
 *    KV холбоогүй бол зан урьдынхаар (зөвхөн isolate тус бүр).
 */
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
  /* ⚠️ `waitUntil` — хариуг бичилтээр саатуулахгүй */
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

/**
 * ⚠️ 2026-10-09 (аудит №1): ӨДРИЙН ТОКЕНЫ ТӨСӨВ (`rateLimit.mjs`-ийн ⚠️, `DAILY_TOKEN_BUDGET`).
 *    `RL_KV` холбосон бол KV-д (`budget:<УБ өдөр>:<дуудагч>`, 2 хоногийн TTL) — isolate
 *    хооронд хуваалцана (ойролцоо, дээрх KV-ийн ⚠️). Холбоогүй бол isolate тус бүрийн санах ойд:
 *    isolate солигдоход тэглэгдэх тул хэрэглэгч төсвөөс илүү зарцуулж БОЛНО — production-д
 *    KV холбохыг зөвлөнө.
 */
const memBudget = createBudget();
const budgetKey = (caller) => `budget:${budgetDay(Date.now())}:${caller}`;
async function budgetOver(env, caller, limit) {
  if (!limit) return false;
  if (env.RL_KV) return (await kvNum(env, budgetKey(caller))) >= limit;
  return memBudget.over(caller, limit);
}
function budgetAdd(env, ctx, caller, n) {
  if (!(n > 0)) return;
  if (!env.RL_KV) {
    memBudget.add(caller, n);
    return;
  }
  const p = (async () => {
    const k = budgetKey(caller);
    await kvPut(env, null, k, (await kvNum(env, k)) + n, 2 * 86400);
  })().catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(p);
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
    // ⚠️ `x-arcgis-token` — эс бөгөөс browser preflight-д унана
    // ⚠️ 2026-10-09: `x-prompt-sig` — `PROMPT_HMAC`-ийн гарын үсэг
    'Access-Control-Allow-Headers': 'Content-Type, x-arcgis-token, x-prompt-sig',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/**
 * ArcGIS токеныг ПОРТАЛААС шалгана.
 *
 * ⚠️ Токеныг зөвхөн «хоосон биш» гэж үзэж болохгүй — хүчинтэй эсэхийг ArcGIS
 * өөрөөр нь баталгаажуулж, шаардвал байгууллагын харьяаллыг нь шалгана.
 * Эс бөгөөс релег хэн ч дурын мөр илгээж ашиглана.
 *
 * @returns {Promise<{ok: true, username: string} | {ok: false, reason: string}>}
 */
async function checkArcGIS(token, env) {
  if (!token) return { ok: false, reason: 'Нэвтрэлтийн мэдээлэл алга' };

  const key = await sha256Hex(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return { ok: true, username: hit.username };

  const portal = (env.ARCGIS_PORTAL || DEFAULTS.PORTAL).replace(/\/+$/, '');
  let data;
  try {
    /*
     * ⚠️ Токеныг URL query-д БИЧИХГҮЙ — query string нь ArcGIS-ийн вэб сервер,
     * завсрын proxy/CDN-ийн access log-д бүрэн хадгалагддаг тул амьд токен
     * гуравдагчийн логт задарна (CWE-598). ArcGIS REST бүх endpoint дээр
     * POST + form-urlencoded биед `token`-ийг албан ёсоор хүлээж авдаг.
     */
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

  // ⚠️ ArcGIS буруу токенд ч HTTP 200 буцаадаг — биед нь `error` ирнэ
  if (!data || data.error || !data.username) {
    verified.delete(key);
    return { ok: false, reason: 'Нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна' };
  }

  const wantOrg = env.ARCGIS_ORG_ID?.trim();
  if (wantOrg && data.orgId !== wantOrg) {
    verified.delete(key);
    return { ok: false, reason: 'Танай байгууллагад энэ үйлчилгээ нээгдээгүй байна' };
  }

  /* ⚠️ Дээд хэмжээ — Map оруулсан дарааллаа хадгалдаг тул эхнийх нь хамгийн хуучин */
  verified.delete(key);
  while (verified.size >= VERIFIED_MAX) verified.delete(verified.keys().next().value);
  verified.set(key, { username: data.username, until: Date.now() + TOKEN_TTL });
  return { ok: true, username: data.username };
}

export default {
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
     *
     * ⚠️ ДОТООД ТОХИРГООГ ЗАДЛАХГҮЙ (2026-09-15-ны аудит). Урьд нь `model` ба
     *    `effort`-ыг нэвтрэлт, хурдны хязгаар ХОЁУЛАНГААС нь ӨМНӨ буцаадаг
     *    байсан тул хаягийг олсон хэн ч дотоод тохиргоог хязгааргүй тандаж
     *    чаддаг байв. Порталын UI-д зөвхөн «амьд эсэх» л хэрэгтэй.
     *
     * ⚠️ Хурдны хязгаарт ч оруулна — эс бөгөөс энэ зам нь хязгааргүй хүсэлт
     *    хүлээж авах цорын ганц нүх болно.
     */
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      /* ⚠️ 2026-09-25 (аудит 8): түлхүүр нь IP (`cf-connecting-ip`), origin биш — доорх
         `pre:` хязгаартай нэг дүрэм; origin зохиосон хэн ч тойрдог байв. */
      if (limiter.hit(`health:${request.headers.get('cf-connecting-ip') || origin || 'anon'}`, LIMITS.ip)) {
        return json(429, { error: 'Хэт олон хүсэлт' }, cors);
      }
      return json(200, { ok: true }, cors);
    }

    if (request.method !== 'POST' || !url.pathname.startsWith('/chat')) {
      return json(404, { error: 'Ийм зам байхгүй' }, cors);
    }

    // ⚠️ Танихгүй эхээс ирсэн хүсэлтийг татгалзана: browser CORS-ыг тойрч
    //    curl-ээр дуудаж болох тул серверт ч шалгана.
    if (origin && !allowedOrigins(env).includes(origin)) {
      return json(403, { error: 'Энэ эх сурвалжид зөвшөөрөл алга' }, cors);
    }

    /*
     * ⚠️ BROWSER-ГҮЙ ҮЙЛЧЛҮҮЛЭГЧ (Telegram бот). Бот нь ArcGIS хэрэглэгч БИШ тул
     * `x-arcgis-token` байхгүй — оронд нь `BOT_SECRET` тохируулсан бол
     * `x-bot-secret` толгойгоор батална. Тохирвол ArcGIS шалгалтыг алгасна.
     * Ботын хэн ашиглах эрхийг ботын ӨӨРИЙН цагаан жагсаалт (`tools/telegram-bot.mjs`)
     * барина. `BOT_SECRET` тохируулаагүй бол зан төлөв огт өөрчлөгдөхгүй.
     */
    const isBot = Boolean(env.BOT_SECRET) && secretMatches(request.headers.get('x-bot-secret'), env.BOT_SECRET);

    /*
     * ⚠️ ArcGIS НЭВТРЭЛТ. `ARCGIS_ORG_ID` тохируулсан үед л шаардана — ингэснээр
     * локал хөгжүүлэлт (`server.mjs`, тохиргоогүй) хэвээр ажиллана.
     */
    /* ⚠️ ArcGIS шалгалтаас ӨМНӨ IP-ээр хязгаарлана (2026-09-17): хүчингүй
       токентой үер бүр `/community/self` руу тус тусдаа хүсэлт үүсгэдэг байв
       (амжилтгүйг кэшлэдэггүй) — доорх нэрээр хязгаарлагч тэнд хүрдэггүй. */
    /* ⚠️ 2026-10-01: IP-ийн хязгаар 40 → ТАГ 300 — гол хязгаар нь доорх баталгаажсан хэрэглэгчийнх */
    const ip = request.headers.get('cf-connecting-ip') || origin || 'anon';
    if (limiter.hit(`ipcap:${ip}`, LIMITS.ip)) {
      return json(429, { error: 'Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
    }
    let caller = isBot ? 'bot' : `origin:${origin || 'anon'}`;
    if (env.ARCGIS_ORG_ID && !isBot) {
      /* ⚠️ 2026-10-01: амжилтгүй нэвтрэлт IP-д минутад 20 — хүрсэн бол ArcGIS руу шалгалт ЯВУУЛАХГҮЙ */
      /* ⚠️ 2026-10-09: + KV (isolate хооронд, дээрх KV-ийн ⚠️) */
      if (limiter.full(`authfail:${ip}`, LIMITS.authFail) || await kvFull(env, `authfail:${ip}`, LIMITS.authFail)) {
        return json(429, { error: 'Хэт олон амжилтгүй нэвтрэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
      }
      const auth = await checkArcGIS(request.headers.get('x-arcgis-token'), env);
      if (!auth.ok) {
        limiter.hit(`authfail:${ip}`, LIMITS.authFail);
        await kvHit(env, ctx, `authfail:${ip}`, LIMITS.authFail);
        return json(401, { error: auth.reason, retryable: false }, cors);
      }
      caller = `user:${auth.username}`;
    }

    // ⚠️ Дуудагч тус бүрд хурдны хязгаар — түлхүүр барих реле рүү үер хийхээс сэргийлнэ
    /* ⚠️ 2026-10-09: + KV (isolate хооронд) — санах ойнх эхэлж, хэтэрвэл KV руу явахгүй */
    if (limiter.hit(caller, LIMITS.user) || await kvHit(env, ctx, caller, LIMITS.user)) {
      return json(429, { error: 'Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.', retryable: true }, cors);
    }
    /* ⚠️ 2026-10-09: ӨДРИЙН ТОКЕНЫ ТӨСӨВ — бот ЧӨЛӨӨТ (`server.mjs`-ийн ⚠️: бүх ботын хэрэглэгч
       нэг `bot` түлхүүр хуваалцана, хандалтыг ботын цагаан жагсаалт барина) */
    const dailyBudget = budgetFromEnv(env.DAILY_TOKEN_BUDGET);
    if (!isBot && await budgetOver(env, caller, dailyBudget)) {
      return json(429, { error: BUDGET_MSG, code: 'daily_budget', retryable: false }, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json(500, {
        error: 'AI үйлчилгээний түлхүүр тохируулагдаагүй байна. Системийн администраторт хандана уу.',
        retryable: false,
      }, cors);
    }

    // ⚠️ Биеийг бүтэн уншихаас ӨМНӨ зарласан хэмжээгээр (content-length, БАЙТ)
    //    таслана — эс бөгөөс том ачаалал бүхэлдээ санах ойд буусны ДАРАА л
    //    шалгагдана. (raw.length нь UTF-16 нэгж тул байтын хязгаартай яг таарахгүй.)
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      return json(413, { error: 'Хүсэлтийн бие хэт том' }, cors);
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'Хүсэлтийн бие хэт том' }, cors);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      /* ⚠️ 2026-10-09 (аудит №7): задлагчийн мессеж зөвхөн логт */
      console.warn('[agent] бие уншигдсангүй:', caller, e?.message);
      return json(400, { error: 'Хүсэлтийн биеийг уншиж чадсангүй (JSON биш).' }, cors);
    }

    const { system, messages, tools } = payload ?? {};
    if (!Array.isArray(messages) || !messages.length) {
      return json(400, { error: '`messages` хоосон байна' }, cors);
    }

    /*
     * ⚠️ 2026-10-09 (аудит №1): СИСТЕМИЙН ЗААВРЫН ГАРЫН ҮСЭГ — `PROMPT_HMAC` (нууц) тохируулсан
     * үед л. `server.mjs`-ийн ⚠️-ийг үз: browser-т түлхүүр ИЛ тул энэ нь зөвхөн саад, хил биш; бот чөлөөт.
     * Тохируулаагүй бол зан огт өөрчлөгдөхгүй.
     */
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

    let res;
    let body;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: DEFAULTS.MAX_TOKENS,
          // ⚠️ Загвар, effort-ыг СЕРВЕР ТАЛ тогтооно — browser-оос ирсэн утгыг
          //    хэрэглэвэл хэн ч дурын үнэтэй тохиргоогоор токен зарцуулна.
          //
          // ⚠️ Haiku ЭНЭ ПАРАМЕТРИЙГ ДЭМЖДЭГГҮЙ — илгээвэл бүх хүсэлт
          //    «This model does not support the effort parameter» гэж унана.
          //    Тиймээс дэмждэггүй загвар дээр ба `AGENT_EFFORT` хоосон үед ОГТ
          //    илгээхгүй. (Батлагдсан: claude-haiku-4-5, 2026.08.13)
          ...(withEffort ? { output_config: { effort: EFFORT } } : {}),
          // ⚠️ Системийн зааврыг КЭШЛЭНЭ. Тэр нь давхаргын бүртгэл (мянган токен)
          //    агуулдаг бөгөөд яриа бүрт давтагдана — кэшгүй бол удаан ба үнэтэй.
          system: system
            ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
            : undefined,
          tools,
          messages,
        }),
      });
      body = await res.json();
    } catch (e) {
      /* ⚠️ 2026-10-09 (аудит №7): дэлгэрэнгүй зөвхөн логт (`wrangler tail`) */
      console.error('[agent] AI үйлчилгээтэй холбогдож чадсангүй:', caller, e?.message);
      return json(502, { error: 'AI үйлчилгээтэй холбогдож чадсангүй — дахин оролдоно уу.', retryable: true }, cors);
    }

    if (!res.ok) {
      const msg = body?.error?.message ?? `AI үйлчилгээний алдаа (HTTP ${res.status})`;
      /* ⚠️ 2026-10-09 (аудит №7): API-ийн түүхий мессеж (`msg`) зөвхөн логт — клиентэд
         статусаас ЕРӨНХИЙ мөр (`server.mjs`-тэй ижил, `rateLimit.upstreamErrorText`). */
      console.error('[agent] AI үйлчилгээний алдаа:', caller, res.status, msg);
      const authErr = res.status === 401 || res.status === 403;
      return json(res.status, {
        error: authErr
          ? 'AI үйлчилгээний түлхүүр буруу эсвэл хүчингүй байна. Системийн администраторт хандана уу.'
          : upstreamErrorText(res.status),
        // 429 (хэт олон хүсэлт) ба 5xx — дахин оролдоход утгатай
        retryable: res.status === 429 || res.status >= 500,
      }, cors);
    }

    // ⚠️ Аюулгүйн ангилагч татгалзвал HTTP 200 боловч `content` хоосон/дутуу
    //    ирнэ — `content[0]`-ыг шууд уншвал эвдэрнэ.
    if (body.stop_reason === 'refusal') {
      return json(200, {
        stop_reason: 'refusal',
        content: [],
        note: 'Хүсэлтийг аюулгүй байдлын шалгуур татгалзлаа.',
      }, cors);
    }

    if (!isBot) budgetAdd(env, ctx, caller, usageTokens(body.usage));
    return json(200, {
      stop_reason: body.stop_reason,
      content: body.content,
      usage: body.usage,
    }, cors);
  },
};
