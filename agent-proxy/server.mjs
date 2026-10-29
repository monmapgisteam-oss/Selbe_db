/**
 * Сэлбэ AI туслах — LLM РЕЛЕ (proxy).
 *
 * Ажиллуулах:  cd agent-proxy && npm install && npm start
 */

process.env.TZ ||= "Asia/Ulaanbaatar";

import { createServer } from "node:http";
import { timingSafeEqual, createHash, createHmac } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { callClaudeCode, claudeBin, selfTest, stats, ClaudeCodeError } from "./claudeCode.mjs";
import {
  createLimiter, LIMITS, createBudget, budgetFromEnv, BUDGET_MSG, upstreamErrorText, UPSTREAM_AUTH,
  createConcurrency, CONCURRENT_MSG, botCaller, sanitizeChat,
  estimateInputTokens, reserveTokens, settleTokens, utf8Bytes,
  THINKING_UPDATES_BETA, thinkingUpdatesFor,
} from "./rateLimit.mjs";

/**
 * АРЫН ХӨДӨЛГҮҮР (2026-09-17):
 *   · `api`         — ANTHROPIC_API_KEY-ээр Messages API (урьдын зан)
 *   · `claude-code` — энэ PC дээр нэвтэрсэн Claude Code (`claude -p`),
 *                     түлхүүргүй. Дэлгэрэнгүйг `claudeCode.mjs`-ээс.
 */
const BACKEND =
  process.argv.find((a) => a.startsWith("--backend="))?.slice(10) ||
  process.env.AGENT_BACKEND ||
  (process.env.ANTHROPIC_API_KEY ? "api" : "claude-code");
/**
 * БЭЛЭН БАЙДАЛ — Claude Code нэвтэрсэн эсэхийг эхлэхэд ба 10 мин тутам шалгана.
 */
let ready = { ok: BACKEND !== "claude-code", reason: "шалгаж байна" };
let recheckSoon = () => {};
if (BACKEND === "claude-code") {
  const READY_MS = 10 * 60 * 1000;
  const RETRY_MS = 30 * 1000;
  let timer = null;
  const check = async () => {
    const was = ready.ok;
    ready = await selfTest();
    if (was !== ready.ok || timer === null) {
      console.log(`[agent-proxy] Claude Code бэлэн: ${ready.ok ? "тийм" : `ҮГҮЙ — ${ready.reason}`}`);
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, ready.ok ? READY_MS : RETRY_MS);
    timer.unref();
  };
  recheckSoon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, RETRY_MS);
    timer.unref();
  };
  check();
}

/**
 * ArcGIS нэвтрэлт — `worker.mjs`-ийн ижил дүрэм. `ARCGIS_ORG_ID` тохируулсан
 * үед л шаардана.
 */
const ARCGIS_ORG_ID = process.env.ARCGIS_ORG_ID?.trim() || "";

/**
 * ИТГЭМЖЛЭГДСЭН ПРОКСИ (2026-09-25) — `TRUSTED_PROXY=cloudflare|tailscale`.
 */
const TRUSTED_PROXY = (process.env.TRUSTED_PROXY || "").trim().toLowerCase();
if (TRUSTED_PROXY && !["cloudflare", "tailscale"].includes(TRUSTED_PROXY)) {
  console.error(`[agent-proxy] ⛔ TRUSTED_PROXY="${TRUSTED_PROXY}" танигдаагүй (cloudflare | tailscale).`);
  process.exit(1);
}
if (TRUSTED_PROXY && !ARCGIS_ORG_ID) {
  console.error("[agent-proxy] ⛔ TRUSTED_PROXY тохируулсан (нийтийн тунель) атал ARCGIS_ORG_ID алга — реле асахгүй.");
  process.exit(1);
}
/** Прокси дамжсан хүсэлт мөн эсэх — тохиргооноос ҮЛ ХАМААРАН толгойгоор таньна. */
const viaProxy = (req) =>
  Boolean(req.headers["cf-connecting-ip"] || req.headers["cf-ray"] || req.headers["x-forwarded-for"]);
/** Хурдны хязгаарын IP — толгойг зөвхөн итгэмжлэгдсэн прокси тохируулсан үед. */
const clientIp = (req) => {
  const peer = req.socket.remoteAddress || "anon";
  if (TRUSTED_PROXY === "cloudflare") {
    return String(req.headers["cf-connecting-ip"] || "").trim() || peer;
  }
  if (TRUSTED_PROXY === "tailscale") {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return xff[xff.length - 1] || peer;
  }
  return peer;
};
const ARCGIS_PORTAL = (process.env.ARCGIS_PORTAL || "https://gis.selbecity.mn/geoportal").replace(/\/+$/, "");
const ARCGIS_PERMS_URL = (process.env.ARCGIS_PERMS_URL || "https://gis.selbecity.mn/map/rest/services/Hosted/SYS_Selbe_Permissions/FeatureServer/230").replace(/\/+$/, "");
const VERIFIED_MAX = 500;
const tokenHash = (token) => createHash("sha256").update(String(token ?? "")).digest("hex");
const verified = new Map();
function verifiedUser(key) {
  const hit = verified.get(key);
  return hit && hit.until > Date.now() ? hit.username : null;
}
/** SQL мөрийн литерал — `'` → `''` */
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
async function hasPortalRow(token, username) {
  const name = String(username ?? "").trim();
  const lo = name.toLowerCase();
  const where = lo === name ? `username = ${sqlStr(lo)}` : `username = ${sqlStr(lo)} OR username = ${sqlStr(name)}`;
  let data;
  try {
    const r = await fetch(`${ARCGIS_PERMS_URL}/query`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ f: "json", where, outFields: "username,role,views", returnGeometry: "false", resultRecordCount: "5", token }).toString(),
    });
    data = await r.json();
  } catch {
    return { ok: false, reason: "Порталын эрхийн хүснэгт шалгагдсангүй — түр хүлээгээд дахин оролдоно уу", status: 503 };
  }
  if (!data || data.error || !Array.isArray(data.features)) {
    return { ok: false, reason: "Порталын эрхийн хүснэгт шалгагдсангүй — түр хүлээгээд дахин оролдоно уу", status: 503 };
  }
  const live = data.features.some((f) => f?.attributes && String(f.attributes.views ?? "") !== "removed");
  return live ? { ok: true } : { ok: false, reason: "Порталд бүртгэлгүй аккаунт — админаас эрх авна уу", status: 403 };
}
async function checkArcGIS(token) {
  if (!token) return { ok: false, reason: "Нэвтрэлтийн мэдээлэл алга" };
  const key = tokenHash(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return { ok: true, username: hit.username };
  let data;
  try {
    const r = await fetch(`${ARCGIS_PORTAL}/sharing/rest/community/self`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ f: "json", token }).toString(),
    });
    data = await r.json();
  } catch {
    verified.delete(key);
    return { ok: false, reason: "Нэвтрэлт шалгах үйлчилгээ хариу өгсөнгүй" };
  }
  if (!data || data.error || !data.username) {
    verified.delete(key);
    return { ok: false, reason: "Нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна" };
  }
  if (data.orgId !== ARCGIS_ORG_ID) {
    verified.delete(key);
    return { ok: false, reason: "Танай байгууллагад энэ үйлчилгээ нээгдээгүй байна" };
  }
  const row = await hasPortalRow(token, data.username);
  if (!row.ok) {
    verified.delete(key);
    return { ok: false, reason: row.reason, status: row.status };
  }
  verified.delete(key);
  while (verified.size >= VERIFIED_MAX) verified.delete(verified.keys().next().value);
  verified.set(key, { username: data.username, until: Date.now() + 5 * 60 * 1000 });
  return { ok: true, username: data.username };
}

function secretMatches(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * BROWSER-ГҮЙ ҮЙЛЧЛҮҮЛЭГЧ (Telegram бот) — `worker.mjs`-ийн ИЖИЛ дүрэм
 * (2026-09-25, аудит №6).
 */
const BOT_SECRET = process.env.BOT_SECRET?.trim() || "";

/**
 * СИСТЕМИЙН ЗААВРЫН ГАРЫН ҮСЭГ (2026-10-09, аудит №1) — `PROMPT_HMAC` тохируулсан үед л.
 * Клиент (`src/lib/agent/client.ts` → `relayFetch`) `system`-ийн HMAC-SHA256 (hex)-ыг
 * `x-prompt-sig` толгойгоор илгээнэ; таарахгүй бол 403. Тохируулаагүй бол зан огт өөрчлөгдөхгүй.
 */
const PROMPT_HMAC = process.env.PROMPT_HMAC?.trim() || "";
const promptSig = (system) => createHmac("sha256", PROMPT_HMAC).update(system, "utf8").digest("hex");

/** Өдрийн токены төсөв — `rateLimit.mjs` (`DAILY_TOKEN_BUDGET`, 0 = унтраалттай) */
const DAILY_TOKEN_BUDGET = budgetFromEnv(process.env.DAILY_TOKEN_BUDGET);
const budget = createBudget();

const PORT = Number(process.env.PORT || 8787);

/**
 * `ALLOW_ORIGIN`-д таслалаар тусгаарлан жагсаана. Анхдагч нь зөвхөн локал dev.
 */
const ALLOWED = (
  process.env.ALLOW_ORIGIN || "http://localhost:8123,http://127.0.0.1:8123"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
const MAX_TOKENS = 10000;
const EFFORT = process.env.AGENT_EFFORT || "medium";
/** `effort` дэмждэг эсэх — `worker.mjs`-тэй ижил дүрэм байх ёстой */
const WITH_EFFORT = Boolean(EFFORT) && !/haiku/i.test(MODEL);
const WITH_UPDATES = thinkingUpdatesFor(MODEL);

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

const client = new Anthropic();

const cors = (res, origin) => {
  if (origin && ALLOWED.includes(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-arcgis-token, x-prompt-sig");
  res.setHeader("Access-Control-Max-Age", "86400");
};

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

/**
 * Хүсэлтийн биеийг цуглуулна — хэмжээнээс хэтэрвэл 413.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const tooBig = () =>
      Object.assign(new Error("Хүсэлтийн бие хэт том — яриа хэт урт болсон тул ⟲ дарж шинээр эхлүүлнэ үү."), { status: 413 });
    /* Зарласан хэмжээгээр (content-length, БАЙТ) шууд — үлдсэнийг Node хариу
       илгээсний дараа өөрөө хаяж уншина (keep-alive). */
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      reject(tooBig());
      return;
    }
    let size = 0;
    let over = false;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (over) {
        if (size > MAX_BODY * 4) req.destroy();
        return;
      }
      if (size > MAX_BODY) {
        over = true;
        chunks.length = 0;
        reject(tooBig());
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * ХУРДНЫ ХЯЗГААР — worker.mjs-ийн ижил дүрэм (2026-09-15-ны аудит).
 *
 * Урьд нь локал реле нь ХЯЗГААРГҮЙ байв. 127.0.0.1-д л сонсдог нь эрсдэлийг
 * бууруулдаг ч бүрэн хаадаггүй: хөгжүүлэгчийн машин дээр ажиллаж буй дурын
 * локал процесс (өөр devtool, өргөтгөл, Origin толгойгүй скрипт) хязгааргүй
 * хүсэлтээр Anthropic түлхүүрийг зарцуулж чадна — Origin байхгүй үед доорх
 * цагаан жагсаалтын шалгалт бүхэлдээ алгасагддаг.
 */
const limiter = createLimiter();
const inflight = createConcurrency();

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!ARCGIS_ORG_ID && viaProxy(req)) {
    json(res, 403, { error: "Реле нийтэд гаргахаар тохируулагдаагүй байна", retryable: false });
    return;
  }

  /* Эрүүл мэндийн шалгалт — реле асаалттай эсэхийг эндээс мэднэ. */
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    if (limiter.hit(`health:${clientIp(req)}`, LIMITS.ip)) {
      json(res, 429, { error: "Хэт олон хүсэлт" });
      return;
    }
    json(res, ready.ok ? 200 : 503, { ok: ready.ok });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/chat")) {
    json(res, 404, { error: "Ийм зам байхгүй" });
    return;
  }

  if (origin && !ALLOWED.includes(origin)) {
    json(res, 403, { error: "Энэ эх сурвалжид зөвшөөрөл алга" });
    return;
  }

  const ip = clientIp(req);
  if (limiter.hit(`ipcap:${ip}`, LIMITS.ip)) {
    json(res, 429, { error: "Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.", retryable: true });
    return;
  }

  const isBot = Boolean(BOT_SECRET) && secretMatches(req.headers["x-bot-secret"], BOT_SECRET);
  let caller = `ip:${ip}`;
  if (isBot) {
    caller = botCaller(req.headers["x-bot-user"]);
  } else if (ARCGIS_ORG_ID) {
    const token = req.headers["x-arcgis-token"];
    const cachedUser = token ? verifiedUser(tokenHash(token)) : null;
    if (cachedUser) {
      caller = `user:${cachedUser}`;
    } else {
      const failKey = TRUSTED_PROXY
        ? `authfail:${ip}`
        : `authfail:${ip}:${tokenHash(token).slice(0, 16)}`;
      const ipFailCapped = Boolean(TRUSTED_PROXY) || !/^(127\.|::1$|::ffff:127\.)/.test(ip);
      if (limiter.full(failKey, LIMITS.authFail) || (ipFailCapped && limiter.full(`authfailip:${ip}`, LIMITS.authFailIp))) {
        json(res, 429, { error: "Хэт олон амжилтгүй нэвтрэлт — түр хүлээгээд дахин оролдоно уу.", retryable: true });
        return;
      }
      const auth = await checkArcGIS(token);
      if (!auth.ok) {
        const status = auth.status ?? 401;
        if (status !== 503) {
          limiter.hit(failKey, LIMITS.authFail);
          if (ipFailCapped) limiter.hit(`authfailip:${ip}`, LIMITS.authFailIp);
        }
        json(res, status, { error: auth.reason, retryable: status === 503 });
        return;
      }
      caller = `user:${auth.username}`;
    }
  }
  if (limiter.full(caller, LIMITS.user)) {
    json(res, 429, { error: "Хэт олон хүсэлт — минутад 40 хүсэлт", retryable: true });
    return;
  }
  const budgeted = caller !== "bot" && DAILY_TOKEN_BUDGET > 0;
  if (budgeted && budget.over(caller, DAILY_TOKEN_BUDGET)) {
    json(res, 429, { error: BUDGET_MSG, code: "daily_budget", retryable: false });
    return;
  }
  const release = inflight.acquire(caller, caller === "bot" ? LIMITS.botConcurrent : LIMITS.concurrent);
  if (!release) {
    json(res, 429, { error: CONCURRENT_MSG, code: "concurrent", retryable: true });
    return;
  }
  limiter.hit(caller, LIMITS.user);
  try {
    await relayChat(req, res, { caller, isBot, budgeted });
  } finally {
    release();
  }
});

/**
 * `/chat`-ийн үлдсэн хэсэг (бие унших → шалгах → төсөв урьдчилан хасах → дээд үйлчилгээ).
 */
async function relayChat(req, res, { caller, isBot, budgeted }) {
  let raw;
  let payload;
  try {
    raw = await readBody(req);
    payload = JSON.parse(raw);
  } catch (e) {
    if (e?.status === 413) {
      json(res, 413, { error: e.message, retryable: false });
      return;
    }
    console.warn("[agent-proxy] бие уншигдсангүй:", caller, e?.message);
    json(res, 400, { error: "Хүсэлтийн биеийг уншиж чадсангүй (JSON биш)." });
    return;
  }

  const { system } = payload ?? {};
  if (system != null && typeof system !== "string") {
    json(res, 400, { error: "`system` мөр байх ёстой", retryable: false });
    return;
  }
  const clean = sanitizeChat(payload ?? {});
  if (!clean.ok) {
    console.warn("[agent-proxy] хүсэлт шалгалтад унав:", caller, clean.error);
    json(res, 400, { error: clean.error, retryable: false });
    return;
  }
  const { messages, tools } = clean;
  if (PROMPT_HMAC && !isBot) {
    const sysText = system == null ? "" : system;
    if (typeof sysText !== "string" || !secretMatches(req.headers["x-prompt-sig"], promptSig(sysText))) {
      console.warn("[agent-proxy] системийн зааврын гарын үсэг таарсангүй:", caller);
      json(res, 403, { error: "Системийн зааврын гарын үсэг таарсангүй — хуудсыг дахин ачаална уу.", retryable: false });
      return;
    }
  }

  const inputEst = estimateInputTokens(Buffer.byteLength(raw, "utf8"), utf8Bytes(system));
  const reserved = budgeted ? reserveTokens(inputEst, MAX_TOKENS) : 0;
  if (reserved) budget.add(caller, reserved);
  let charge = inputEst;
  try {
    await callUpstream(res, { caller, system, messages, tools, inputEst, setCharge: (n) => { charge = n; } });
  } finally {
    if (reserved) budget.adjust(caller, charge - reserved);
  }
}

/** Дээд үйлчилгээ (Claude Code эсвэл Messages API) — `setCharge` нь төсвийн эцсийн дүнг өгнө */
async function callUpstream(res, { caller, system, messages, tools, inputEst, setCharge }) {
  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });

  /* ── Claude Code горим ── */
  if (BACKEND === "claude-code") {
    const bin = claudeBin();
    if (!bin) {
      setCharge(0);
      json(res, 500, { error: "Энэ PC дээр Claude Code олдсонгүй — `CLAUDE_BIN` орчны хувьсагчид claude.exe-ийн замыг заана уу.", retryable: false });
      return;
    }
    try {
      const t0 = Date.now();
      const out = await callClaudeCode({ system, messages, tools, model: MODEL, effort: EFFORT, bin, signal: ac.signal });
      const st = stats();
      console.log(`[agent-proxy:claude-code] ${caller} ${out.cached ? "кэш" : `${Date.now() - t0}мс`} ${out.stop_reason} · ажиллаж ${st.running} · дараалал ${st.queued}`);
      if (out.cached) {
        setCharge(0);
      } else {
        ready = { ok: true };
        setCharge(settleTokens(out.usage, inputEst));
      }
      json(res, 200, out);
    } catch (err) {
      if (ac.signal.aborted) {
        console.log(`[agent-proxy:claude-code] ${caller} цуцлагдсан (клиент хаасан)`);
        return;
      }
      const e = err instanceof ClaudeCodeError
        ? err
        : new ClaudeCodeError("AI туслах хариу өгч чадсангүй — дахин оролдоно уу.", { status: 500, detail: err?.message });
      console.error("[agent-proxy:claude-code]", caller, e.message, e.detail ? `— ${e.detail}` : "");
      if (e.status === 401) {
        ready = { ok: false, reason: e.message };
        recheckSoon();
        json(res, 502, UPSTREAM_AUTH);
        return;
      }
      json(res, e.status, { error: e.message, retryable: e.retryable, upstream: true });
    }
    return;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(WITH_EFFORT ? { output_config: { effort: EFFORT } } : {}),
      ...(WITH_UPDATES ? { thinking: { type: "adaptive", display: "updates" } } : {}),
      system: system
        ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
        : undefined,
      tools,
      messages,
    }, {
      signal: ac.signal,
      ...(WITH_UPDATES ? { headers: { "anthropic-beta": THINKING_UPDATES_BETA } } : {}),
    });

    setCharge(settleTokens(response.usage, inputEst));

    if (response.stop_reason === "refusal") {
      json(res, 200, {
        stop_reason: "refusal",
        content: [],
        note: "Хүсэлтийг аюулгүй байдлын шалгуур татгалзлаа.",
      });
      return;
    }

    json(res, 200, {
      stop_reason: response.stop_reason,
      content: response.content,
      usage: response.usage,
    });
  } catch (err) {
    if (ac.signal.aborted) {
      console.log(`[agent-proxy] ${caller} цуцлагдсан (клиент хаасан)`);
      return;
    }
    if (err instanceof Anthropic.APIError && err.status) setCharge(0);
    const msg = err?.message ?? "Тодорхойгүй алдаа";
    console.error("[agent-proxy]", caller, msg);

    //
    //
    if (
      err instanceof Anthropic.AuthenticationError ||
      /could not resolve authentication|api key|authentication/i.test(msg)
    ) {
      setCharge(0);
      console.error("[agent-proxy] ⛔ AI үйлчилгээний түлхүүр тохируулагдаагүй эсвэл буруу — `agent-proxy/.env.local`-д `ANTHROPIC_API_KEY=…` бичээд `npm start`.");
      json(res, 502, UPSTREAM_AUTH);
      return;
    }

    const retryable =
      err instanceof Anthropic.RateLimitError ||
      (err instanceof Anthropic.APIError && err.status === 529);
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 500;
    json(res, status, {
      error: upstreamErrorText(err instanceof Anthropic.APIConnectionError ? 502 : status),
      retryable,
      upstream: true,
    });
  }
}

server.listen(PORT, '127.0.0.1', () => {
  if (BACKEND === "claude-code") {
    console.log(`[agent-proxy] хөдөлгүүр=claude-code  ${claudeBin() ?? "⚠️ claude олдсонгүй (CLAUDE_BIN тохируул)"}`);
    if (!ARCGIS_ORG_ID) console.warn("[agent-proxy] ⚠️ ARCGIS_ORG_ID тохируулаагүй — тунелээр ирсэн хүсэлтийг 403-аар татгалзана (зөвхөн локал).");
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[agent-proxy] ⚠️ ANTHROPIC_API_KEY тохируулаагүй байна — хүсэлт бүр татгалзана.",
    );
  }
  if (ARCGIS_ORG_ID && !TRUSTED_PROXY) {
    console.warn("[agent-proxy] ⚠️ TRUSTED_PROXY тохируулаагүй — тунелийн хэрэглэгчид IP-ийн хурдны хязгаарыг нэг түлхүүрээр хуваалцана.");
  }
  console.log(
    `[agent-proxy] http://localhost:${PORT}  хөдөлгүүр=${BACKEND}  загвар=${MODEL}  effort=${EFFORT}`,
  );
  console.log(`[agent-proxy] зөвшөөрсөн эх: ${ALLOWED.join(", ")}`);
  console.log(`[agent-proxy] өдрийн төсөв: ${DAILY_TOKEN_BUDGET ? `${DAILY_TOKEN_BUDGET} токен/хэрэглэгч` : "унтраалттай"} · заавар гарын үсэг: ${PROMPT_HMAC ? "асаалттай" : "унтраалттай"}`);
});
