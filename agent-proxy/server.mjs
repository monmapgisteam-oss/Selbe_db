/**
 * Сэлбэ AI туслах — LLM РЕЛЕ (proxy).
 *
 * ⚠️ ЯАГААД ТУСДАА ҮЙЛЧИЛГЭЭ ВЭ: портал нь `output: 'export'` (бүрэн статик) бөгөөд
 * GitHub Pages дээр байрладаг — тэнд сервер тал ОГТ ажиллахгүй тул Next-ийн route
 * handler бичих боломжгүй. Мөн API түлхүүр browser-т ХЭЗЭЭ Ч гарч болохгүй.
 * Тиймээс энэ реле тусдаа процесс, тусдаа `package.json`-той: `npm ci`/`npm run build`
 * үүнийг огт хөндөхгүй тул одоогийн deploy эвдрэхгүй.
 *
 * ⚠️ ЭНЭ ФАЙЛ АГЕНТЫН ЛОГИКГҮЙ. Хэрэгсэл гүйцэтгэх, давхаргын бүртгэл унших,
 * эрх шалгах бүхэн browser талд (`src/lib/agent/*`) явна — учир нь тэнд `LAYERS`,
 * `VIEWS`, `query.ts` нь порталтай ЯГ ижил кодоор ажиллана. Ингэснээр давхарга
 * нэмэгдэх/хасагдахад релег огт засахгүй (гол шаардлага №3).
 *
 * Ажиллуулах:  cd agent-proxy && npm install && npm start
 */

import { createServer } from "node:http";
import { timingSafeEqual, createHash, createHmac } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { callClaudeCode, claudeBin, selfTest, stats, ClaudeCodeError } from "./claudeCode.mjs";
import {
  createLimiter, LIMITS, createBudget, budgetFromEnv, BUDGET_MSG, upstreamErrorText,
  createConcurrency, CONCURRENT_MSG, botCaller, sanitizeChat,
  estimateInputTokens, reserveTokens, settleTokens, utf8Bytes,
} from "./rateLimit.mjs";

/**
 * АРЫН ХӨДӨЛГҮҮР (2026-09-17):
 *   · `api`         — ANTHROPIC_API_KEY-ээр Messages API (урьдын зан)
 *   · `claude-code` — энэ PC дээр нэвтэрсэн Claude Code (`claude -p`),
 *                     түлхүүргүй. Дэлгэрэнгүйг `claudeCode.mjs`-ээс.
 * ⚠️ Анхдагч нь ТҮЛХҮҮР БАЙВАЛ `api`, байхгүй бол `claude-code` — нэг
 *    PC дээр хоёулаа тохирсон үед урьдын зан өөрчлөгдөхгүй.
 */
/* ⚠️ `--backend=claude-code` аргумент (`npm run start:claude-code`) — Windows дээр
   `VAR=x cmd` синтакс ажиллахгүй тул орчны хувьсагчаас гадна аргументаар ч сонгоно. */
const BACKEND =
  process.argv.find((a) => a.startsWith("--backend="))?.slice(10) ||
  process.env.AGENT_BACKEND ||
  (process.env.ANTHROPIC_API_KEY ? "api" : "claude-code");
/**
 * БЭЛЭН БАЙДАЛ — Claude Code нэвтэрсэн эсэхийг эхлэхэд ба 10 мин тутам шалгана.
 * ⚠️ `/health` нь ҮҮНИЙГ буцаана: портал `relayAlive()`-аар товчоо идэвхжүүлдэг
 *    тул PC дээр Claude-ээс гарсан (logout) үед товч «ажиллаж байгаа» мэт
 *    харагдаад дарахад унадаг байдлаас сэргийлнэ.
 */
let ready = { ok: BACKEND !== "claude-code", reason: "шалгаж байна" };
/* ⚠️ 2026-09-28: ДАСАН ЗОХИЦСОН давтамж — урьд ямагт 10 минут байв. Реле нь PC
   АЧААЛАХАД (нэвтрэхийг хүлээлгүй) асдаг болсон тул эхний шалгалт сүлжээ/
   Tailscale бэлэн болоогүй үед явж уналаа гэхэд дараагийнх нь 10 минутын дараа
   болно — тэр хугацаанд `/health` нь 503 буцааж портал дээр AI товч
   идэвхгүй үлддэг байв. Одоо бэлэн БИШ үед 30 секунд тутам, бэлэн болсны
   дараа 10 минут тутам шалгана. */
if (BACKEND === "claude-code") {
  const READY_MS = 10 * 60 * 1000;
  const RETRY_MS = 30 * 1000;
  let timer = null;
  const check = async () => {
    const was = ready.ok;
    ready = await selfTest();
    /* ⚠️ Зөвхөн ТӨЛӨВ СОЛИГДОХОД хэвлэнэ — эс бөгөөс бэлэн бус PC-ийн лог
       30 секунд тутмын ижил мөрөөр дүүрнэ. */
    if (was !== ready.ok || timer === null) {
      console.log(`[agent-proxy] Claude Code бэлэн: ${ready.ok ? "тийм" : `ҮГҮЙ — ${ready.reason}`}`);
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, ready.ok ? READY_MS : RETRY_MS);
    timer.unref();
  };
  check();
}

/**
 * ArcGIS нэвтрэлт — `worker.mjs`-ийн ижил дүрэм. `ARCGIS_ORG_ID` тохируулсан
 * үед л шаардана.
 * ⚠️ Энэ PC-г Cloudflare Tunnel-ээр НИЙТЭД гаргах бол ЗААВАЛ тохируулна —
 *    эс бөгөөс хаягийг олсон хэн ч энэ PC-ийн Claude бүртгэлийг зарцуулна.
 */
const ARCGIS_ORG_ID = process.env.ARCGIS_ORG_ID?.trim() || "";

/**
 * ИТГЭМЖЛЭГДСЭН ПРОКСИ (2026-09-25) — `TRUSTED_PROXY=cloudflare|tailscale`.
 * ⚠️ `cf-connecting-ip` / `x-forwarded-for`-ыг ЗӨВХӨН энэ тохируулсан үед уншина.
 *    Урьд толгойг ямагт итгэдэг байсан тул хүсэлт бүрд санамсаргүй IP бичээд
 *    хурдны хязгаарыг бүрмөсөн тойрох боломжтой байв.
 * ⚠️ Прокси тохируулсан (= нийтэд гарсан) атал `ARCGIS_ORG_ID` алга бол реле
 *    АСАХГҮЙ — урьд зөвхөн анхааруулга хэвлээд нээлттэй (fail-open) үйлчилдэг байв.
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
    /* ⚠️ Хамгийн БАРУУН утга — прокси өөрөө нэмсэн; зүүн талынхыг клиент бичиж болно. */
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return xff[xff.length - 1] || peer;
  }
  return peer;
};
const ARCGIS_PORTAL = (process.env.ARCGIS_PORTAL || "https://www.arcgis.com").replace(/\/+$/, "");
/* ⚠️ 2026-09-30 (`worker.mjs`-тэй ижил): кэшийн дээд хэмжээ (хамгийн хуучныг хаяна) ба
   нэвтрэлт УНАСАН токеныг кэшээс шууд хасна — ArcGIS 498/401 хариулсан агшнаас тэр
   токен дахин шалгагдана, 5 минут хүчинтэй үлдэхгүй. */
const VERIFIED_MAX = 500;
/**
 * ⚠️ 2026-10-09 (аудит №4): кэшийн ТҮЛХҮҮР нь токены SHA-256 хэш — урьд ТҮҮХИЙ токен
 *    байсан тул процессын санах ойд (dump, дибаг) 500 хүртэл амьд ArcGIS токен 5 минут
 *    хадгалагдаж байв. Одоо зөвхөн хэш + хэрэглэгчийн нэр үлдэнэ; токен өөрөө зөвхөн
 *    тухайн хүсэлтийн хүрээнд (ArcGIS руу шалгуулахад) амьдарна.
 * ⚠️ Хост нь хүсэлт бүрийн амьд токеныг ХАРДАГ хэвээр (зохион байгуулалтаараа) — итгэмжлэгдсэн
 *    хостын жагсаалт: `docs/system/07-gadaad-erschim.md` §1.4.
 */
const tokenHash = (token) => createHash("sha256").update(String(token ?? "")).digest("hex");
const verified = new Map();
/** ⚠️ 2026-10-09: кэшээс л (ArcGIS руу явахгүй) — хүчинтэй бол хэрэглэгчийн нэр, эс бөгөөс `null` */
function verifiedUser(key) {
  const hit = verified.get(key);
  return hit && hit.until > Date.now() ? hit.username : null;
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
  verified.delete(key);
  while (verified.size >= VERIFIED_MAX) verified.delete(verified.keys().next().value);
  verified.set(key, { username: data.username, until: Date.now() + 5 * 60 * 1000 });
  return { ok: true, username: data.username };
}

/**
 * ⚠️ 2026-09-30: НУУЦ ТҮЛХҮҮРИЙГ ТОГТМОЛ ХУГАЦААНД харьцуулна (`x-bot-secret`).
 *    `===` нь эхний зөрсөн байтад зогсдог тул хариу өгөх хугацаанаас нууцыг байт
 *    байтаар таах онолын боломж (timing attack) үлддэг. `timingSafeEqual` ижил урттай
 *    буферт л ажиллана — урт зөрвөл шууд `false` (урт нь нууц биш).
 *    (`worker.mjs`-д гар аргаар тогтмол хугацааны гүйлт — толин хувилбар.)
 */
function secretMatches(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * BROWSER-ГҮЙ ҮЙЛЧЛҮҮЛЭГЧ (Telegram бот) — `worker.mjs`-ийн ИЖИЛ дүрэм
 * (2026-09-25, аудит №6).
 * ⚠️ Бот нь ArcGIS хэрэглэгч БИШ тул `x-arcgis-token` байхгүй. Урьд нь энд
 *    энэ салбар байгаагүй тул `ARCGIS_ORG_ID`-тай хост реле дээр ботын бүх
 *    асуулт 401 «Нэвтрэлтийн мэдээлэл алга» болдог байв (`/health` нэвтрэлтгүй
 *    тул бот асахдаа үүнийг илрүүлдэггүй). `BOT_SECRET` тохируулсан бөгөөд
 *    `x-bot-secret` таарвал ArcGIS шалгалтыг алгасна; ботын хандалтыг ботын
 *    ӨӨРИЙН цагаан жагсаалт барина. Ботод ижил утгыг `AGENT_BOT_SECRET`-ээр.
 *    Тохируулаагүй бол зан төлөв огт өөрчлөгдөхгүй.
 */
const BOT_SECRET = process.env.BOT_SECRET?.trim() || "";

/**
 * СИСТЕМИЙН ЗААВРЫН ГАРЫН ҮСЭГ (⚠️ 2026-10-09, аудит №1) — `PROMPT_HMAC` тохируулсан үед л.
 * Клиент (`src/lib/agent/client.ts` → `relayFetch`) `system`-ийн HMAC-SHA256 (hex)-ыг
 * `x-prompt-sig` толгойгоор илгээнэ; таарахгүй бол 403. Тохируулаагүй бол зан огт өөрчлөгдөхгүй.
 * ⚠️ ХИЛ БИШ, ЗӨВХӨН СААД: browser-т түлхүүр нь `NEXT_PUBLIC_AGENT_PROMPT_HMAC`-аар JS багцад
 *    ИЛ тул шийдсэн хүн гарын үсгийг өөрөө тооцож чадна. Санамсаргүй curl/скриптээр релег
 *    ерөнхий LLM прокси болгохыг л хүндрүүлнэ; бодит хязгаар нь өдрийн төсөв (доор).
 *    Бот (`x-bot-secret`) энэ шалгалтаас ЧӨЛӨӨТ — өөрийн нууцаар аль хэдийн батлагдсан.
 * ⚠️ Заавар СЕРВЕР ТАЛД угсрагдахгүй — агентын логик browser-т (файлын толгойн ⚠️).
 */
const PROMPT_HMAC = process.env.PROMPT_HMAC?.trim() || "";
const promptSig = (system) => createHmac("sha256", PROMPT_HMAC).update(system, "utf8").digest("hex");

/** Өдрийн токены төсөв — `rateLimit.mjs`-ийн ⚠️ (`DAILY_TOKEN_BUDGET`, 0 = унтраалттай) */
const DAILY_TOKEN_BUDGET = budgetFromEnv(process.env.DAILY_TOKEN_BUDGET);
const budget = createBudget();

const PORT = Number(process.env.PORT || 8787);

/**
 * ⚠️ CORS — портал өөр эх (`localhost:8123`, `smart.selbecity.mn`)-ээс дуудна.
 *    ⚠️ 2026-09-09: порталын домэйн `selbe.monmap.mn` → `smart.selbecity.mn`
 *    болов. Жагсаалт нь РЕПОД БИШ, байршуулсан релейн `ALLOW_ORIGIN` орчны
 *    хувьсагчид байдаг тул домэйн солиход ТЭНД шинэ хаягийг нэмэх ёстой —
 *    эс бөгөөс шинэ домэйн дээр AI туслах чимээгүй хаагдана (403).
 * `ALLOW_ORIGIN`-д таслалаар тусгаарлан жагсаана. Анхдагч нь зөвхөн локал dev.
 */
const ALLOWED = (
  process.env.ALLOW_ORIGIN || "http://localhost:8123,http://127.0.0.1:8123"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * ⚠️ ЗАГВАР БА ТОХИРГООГ СЕРВЕР ТАЛ ТОГТООНО — browser-оос ирсэн утгыг ХЭРЭГЛЭХГҮЙ.
 * Эс бөгөөс хэн ч энэ релег дуудаж дурын үнэтэй тохиргоогоор токен зарцуулна.
 *
 * ⚠️ АНХДАГЧ нь `claude-opus-5` — хамгийн зөв дүгнэлт гаргана. ТУРШИЛТЫН үед
 * зардал хэмнэхийг хүсвэл `AGENT_MODEL=claude-haiku-4-5` (≈5 дахин хямд).
 *
 * ⚠️ `effort: 'low'` — хариултын ХУРД гол шаардлага (№1). Агентын ажил нь «зөв
 * давхарга сонгож, тоог ArcGIS-д бодуулаад үг болгох» тул гүн бодох шаардлагагүй.
 * Чанар дутвал 'medium' болгоно.
 *
 * ⚠️ Claude Opus 5-д бодох (thinking) нь АНХНААСАА асаалттай бөгөөд `max_tokens`
 * нь бодолт + хариу ХОЁУЛАНГ хамарна — тиймээс хариултын уртаас хамаагүй өгөөмөр.
 */
const MODEL = process.env.AGENT_MODEL || "claude-opus-5";
/* ⚠️ `worker.mjs`-ийн `DEFAULTS.MAX_TOKENS`-тай ЗААВАЛ ижил байна. 2026-09-15
   хүртэл 10000 vs 8000 гэж зөрж байсан тул локалд бүтэн гардаг урт хариулт
   байршуулсан Worker дээр таслагдаж, хөгжүүлэгч давтаж чаддаггүй байв. */
const MAX_TOKENS = 10000;
const EFFORT = process.env.AGENT_EFFORT || "low";
/** `effort` дэмждэг эсэх — `worker.mjs`-тэй ижил дүрэм байх ёстой */
const WITH_EFFORT = Boolean(EFFORT) && !/haiku/i.test(MODEL);

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

/* ⚠️ claude-code горимд түлхүүргүй ч SDK үүсгэх нь алдаа шидэхгүй — хүсэлт явуулах үед л шалгадаг. */
const client = new Anthropic();

const cors = (res, origin) => {
  if (origin && ALLOWED.includes(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  // ⚠️ `x-arcgis-token` ЗААВАЛ — портал нэвтэрсэн хэрэглэгчийн токеныг энэ
  //    толгойгоор илгээдэг. Жагсаалтад байхгүй бол хөтөч preflight-д татгалзаж,
  //    чат «Failed to fetch» гэж унана (сервер тал огт дуудагдахгүй).
  //    Локал реле токеныг ШАЛГАХГҮЙ ч зөвшөөрөх ЁСТОЙ.
  /* ⚠️ 2026-10-09: `x-prompt-sig` — `PROMPT_HMAC`-ийн гарын үсэг (жагсаалтад байхгүй бол preflight унана) */
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-arcgis-token, x-prompt-sig");
  res.setHeader("Access-Control-Max-Age", "86400");
};

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

/**
 * Хүсэлтийн биеийг цуглуулна — хэмжээнээс хэтэрвэл 413.
 *
 * ⚠️ 2026-09-25 (аудит №6): урьд нь хэтэрмэгц `req.destroy()` хийдэг байсан
 *    тул доорх алдааны хариу ҮХСЭН socket руу бичигдэж, хөтөч зөвхөн «Failed
 *    to fetch» хардаг байв (урт яриа 2 МБ давахад дараагийн асуулт бүр).
 *    Одоо цуглуулахаа зогсоож үлдсэнийг ХАЯЖ уншина — socket амьд тул 413
 *    хүрнэ. Зөвхөн хэт их (MAX_BODY×4) үед л тасална.
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
/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): тоолуур ба хязгаарууд `rateLimit.mjs`-д
   (worker-тэй хуваалцана) — хэрэглэгч 40 · IP таг 300 · амжилтгүй нэвтрэлт IP-д 20. */
const limiter = createLimiter();
/* ⚠️ 2026-10-09: дуудагчийн ЗЭРЭГ хүсэлтийн таг (`LIMITS.concurrent` = 2) — нэг процесс тул бүрэн */
const inflight = createConcurrency();

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  /* ⚠️ 2026-09-25: FAIL-CLOSED — тунелээр (прокси толгойтой) ирсэн хүсэлтийг
     `ARCGIS_ORG_ID`-гүй бол үйлчлэхгүй. `TRUSTED_PROXY` тохируулаагүй ч
     cloudflared/Funnel эдгээр толгойг нэмдэг тул энд барина. */
  if (!ARCGIS_ORG_ID && viaProxy(req)) {
    json(res, 403, { error: "Реле нийтэд гаргахаар тохируулагдаагүй байна", retryable: false });
    return;
  }

  /* Эрүүл мэндийн шалгалт — реле асаалттай эсэхийг эндээс мэднэ.
     ⚠️ Дотоод тохиргоог (model/effort) ЗАДЛАХГҮЙ — `worker.mjs`-ийн ижил
        дүрэм: хаягийг олсон хэн ч тохиргоог тандах ёсгүй. */
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    /* ⚠️ 2026-09-25 (аудит 8): түлхүүр нь IP (`clientIp`), origin БИШ — origin-гүй
       (curl/бот) бүх хүсэлт нэг «anon» саванд орж бие биенээ хаадаг, харин
       origin-оо зохиосон хэн ч хязгаарыг тойрдог байв. `/chat`-тай нэг дүрэм. */
    /* ⚠️ 2026-10-01: IP-ийн таг (300) — оффисын NAT-ын ард олон browser зэрэг шалгана */
    if (limiter.hit(`health:${clientIp(req)}`, LIMITS.ip)) {
      json(res, 429, { error: "Хэт олон хүсэлт" });
      return;
    }
    /* ⚠️ Шалтгааныг ЗАДЛАХГҮЙ — зөвхөн бэлэн эсэх */
    json(res, ready.ok ? 200 : 503, { ok: ready.ok });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/chat")) {
    json(res, 404, { error: "Ийм зам байхгүй" });
    return;
  }

  // ⚠️ Танихгүй эхээс ирсэн хүсэлтийг татгалзана: browser CORS-ыг тойрч
  //    curl-ээр дуудаж болох тул серверт ч шалгана.
  if (origin && !ALLOWED.includes(origin)) {
    json(res, 403, { error: "Энэ эх сурвалжид зөвшөөрөл алга" });
    return;
  }

  /* ⚠️ ХУРДНЫ ХЯЗГААР — Origin БАЙХГҮЙ (скрипт, curl) үед дээрх шалгалт
     бүхэлдээ алгасагддаг тул энэ нь тэр нүхийг хаана. */
  /* ⚠️ ХЯЗГААРЫН ТҮЛХҮҮР (2026-09-17): урьд нь `origin` байсан тул production-д
     БҮХ хэрэглэгч «https://smart.selbecity.mn» нэг түлхүүр хуваалцаж, нийлээд
     минутад 40 хүсэлтэд хязгаарлагдаж байв (агентын нэг асуулт 2–5 хүсэлт).
     Одоо эхлээд IP-ээр (Cloudflare Tunnel `cf-connecting-ip` дамжуулна), дараа
     нь ArcGIS хэрэглэгчээр. */
  /* ⚠️ Tailscale Funnel нь `x-forwarded-for`-оор дамжуулна — эс бөгөөс бүх
     хэрэглэгч 127.0.0.1 болж нэг хязгаар хуваалцана.
     ⚠️ 2026-09-25: толгойг зөвхөн `TRUSTED_PROXY` тохируулсан үед итгэнэ (`clientIp`). */
  /* ⚠️ 2026-10-01: IP-ийн «урьдчилсан» хязгаар 40 → ТАГ 300 (`rateLimit.mjs`-ийн ⚠️) —
     гол хязгаар нь доорх БАТАЛГААЖСАН хэрэглэгчийнх. */
  const ip = clientIp(req);
  if (limiter.hit(`ipcap:${ip}`, LIMITS.ip)) {
    json(res, 429, { error: "Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.", retryable: true });
    return;
  }

  const isBot = Boolean(BOT_SECRET) && secretMatches(req.headers["x-bot-secret"], BOT_SECRET);
  let caller = `ip:${ip}`;
  if (isBot) {
    /* ⚠️ Тогтмол түлхүүр — ботын бүх хэрэглэгч нэг хязгаар хуваалцана (worker-тэй ижил) */
    /* ⚠️ 2026-10-09: бот `x-bot-user` (Telegram ID) илгээвэл `bot:<id>` — хязгаар, зэрэг хүсэлт,
       өдрийн төсөв хэрэглэгч тус бүрд (`rateLimit.botCaller`). Толгойг НУУЦ ТААРСНЫ ДАРАА л уншина. */
    caller = botCaller(req.headers["x-bot-user"]);
  } else if (ARCGIS_ORG_ID) {
    const token = req.headers["x-arcgis-token"];
    /* ⚠️ 2026-10-09: БАТАЛГААЖСАН ТОКЕНЫ КЭШ ЭХЛЭЭД — урьд амжилтгүй нэвтрэлтийн хязгаар кэшээс
       ӨМНӨ шалгагддаг байсан тул нэг IP-ийн ард (TRUSTED_PROXY-тэй үед) хэн нэг нь хүчингүй
       токеноор 20 удаа унахад ХҮЧИНТЭЙ токентой бүх хэрэглэгч 429 авдаг байв. */
    const cachedUser = token ? verifiedUser(tokenHash(token)) : null;
    if (cachedUser) {
      caller = `user:${cachedUser}`;
    } else {
      /* ⚠️ 2026-10-01: амжилтгүй нэвтрэлт IP-д минутад 20 — хүрсэн бол ArcGIS руу шалгалт ЯВУУЛАХГҮЙ */
      /* ⚠️ 2026-10-09 (аудит №3): `TRUSTED_PROXY` АЛГА бол тунелийн БҮХ хэрэглэгч нэг IP
         (127.0.0.1) хуваалцдаг тул нэг муу клиент (хуучирсан токентой таб) 20 удаа унахад
         бүх хүн 429 авдаг байв. Тэр үед түлхүүрт ТОКЕНЫ ХЭШ нэмнэ — хүчингүй токен бүр
         өөрийн 20-той. Санамсаргүй токенуудаар үерлэх нь доорх `authfailip` таг (100) ба IP-ийн
         тагаар (300) хязгаарлагдана. */
      const failKey = TRUSTED_PROXY
        ? `authfail:${ip}`
        : `authfail:${ip}:${tokenHash(token).slice(0, 16)}`;
      /* ⚠️ 2026-10-09: IP-ийн амжилтгүй нэвтрэлтийн ТАГ (`LIMITS.authFailIp`, `worker.mjs`-тэй ижил) */
      if (limiter.full(failKey, LIMITS.authFail) || limiter.full(`authfailip:${ip}`, LIMITS.authFailIp)) {
        json(res, 429, { error: "Хэт олон амжилтгүй нэвтрэлт — түр хүлээгээд дахин оролдоно уу.", retryable: true });
        return;
      }
      const auth = await checkArcGIS(token);
      if (!auth.ok) {
        limiter.hit(failKey, LIMITS.authFail);
        limiter.hit(`authfailip:${ip}`, LIMITS.authFailIp);
        json(res, 401, { error: auth.reason, retryable: false });
        return;
      }
      caller = `user:${auth.username}`;
    }
  }
  if (limiter.hit(caller, LIMITS.user)) {
    json(res, 429, { error: "Хэт олон хүсэлт — минутад 40 хүсэлт", retryable: true });
    return;
  }
  /* ⚠️ 2026-10-09: ӨДРИЙН ТОКЕНЫ ТӨСӨВ (`rateLimit.mjs`-ийн ⚠️). Нийтлэг `bot` түлхүүр (хуучин,
     `x-bot-user`-гүй бот) ЧӨЛӨӨТ — бүх ботын хэрэглэгч нэг түлхүүр хуваалцдаг тул нэг төсөв бүгдийг
     хаана; `bot:<id>` нь хэрэглэгч бүрийн төсөвтэй. */
  /* ⚠️ 2026-10-09: төсөв унтраалттай (`DAILY_TOKEN_BUDGET=0`) бол тооцоо ОГТ хийхгүй */
  const budgeted = caller !== "bot" && DAILY_TOKEN_BUDGET > 0;
  if (budgeted && budget.over(caller, DAILY_TOKEN_BUDGET)) {
    json(res, 429, { error: BUDGET_MSG, code: "daily_budget", retryable: false });
    return;
  }
  /* ⚠️ 2026-10-09: ЗЭРЭГ ХҮСЭЛТИЙН ТАГ (`LIMITS.concurrent`, `rateLimit.createConcurrency`-ийн ⚠️) —
     слотыг хариу бүрэн дуусах (эсвэл цуцлагдах) хүртэл барина. */
  const release = inflight.acquire(caller, caller === "bot" ? LIMITS.botConcurrent : LIMITS.concurrent);
  if (!release) {
    json(res, 429, { error: CONCURRENT_MSG, code: "concurrent", retryable: true });
    return;
  }
  try {
    await relayChat(req, res, { caller, isBot, budgeted });
  } finally {
    release();
  }
});

/**
 * `/chat`-ийн үлдсэн хэсэг (бие унших → шалгах → төсөв урьдчилан хасах → дээд үйлчилгээ).
 * ⚠️ 2026-10-09: тусдаа функц — дуудагч зэрэг хүсэлтийн слотыг `finally`-д ЗААВАЛ суллана.
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
    /* ⚠️ 2026-10-09 (аудит №7): задлагчийн мессеж зөвхөн логт */
    console.warn("[agent-proxy] бие уншигдсангүй:", caller, e?.message);
    json(res, 400, { error: "Хүсэлтийн биеийг уншиж чадсангүй (JSON биш)." });
    return;
  }

  const { system } = payload ?? {};
  if (system != null && typeof system !== "string") {
    json(res, 400, { error: "`system` мөр байх ёстой", retryable: false });
    return;
  }
  /* ⚠️ 2026-10-09: `tools`/`messages`-ийг ЦАГААН ЖАГСААЛТААР дахин угсарна (`rateLimit.sanitizeChat`-ийн ⚠️) —
     серверийн хэрэгсэл, зураг/документ блок дээд үйлчилгээ рүү ХҮРЭХГҮЙ. */
  const clean = sanitizeChat(payload ?? {});
  if (!clean.ok) {
    console.warn("[agent-proxy] хүсэлт шалгалтад унав:", caller, clean.error);
    json(res, 400, { error: clean.error, retryable: false });
    return;
  }
  const { messages, tools } = clean;
  /* ⚠️ 2026-10-09: `PROMPT_HMAC` (дээрх ⚠️) — `system` нь мөр (эсвэл алга) байх ёстой; гарын
     үсгийг ТОГТМОЛ ХУГАЦААНД харьцуулна. */
  if (PROMPT_HMAC && !isBot) {
    const sysText = system == null ? "" : system;
    if (typeof sysText !== "string" || !secretMatches(req.headers["x-prompt-sig"], promptSig(sysText))) {
      console.warn("[agent-proxy] системийн зааврын гарын үсэг таарсангүй:", caller);
      json(res, 403, { error: "Системийн зааврын гарын үсэг таарсангүй — хуудсыг дахин ачаална уу.", retryable: false });
      return;
    }
  }

  /* ⚠️ 2026-10-09: ТӨСВИЙГ УРЬДЧИЛАН ХАСНА (`rateLimit.estimateInputTokens`-ийн ⚠️) — оролтын тооцоо +
     `MAX_TOKENS`. Доорх `finally` нь `charge`-аар тааруулна:
       · амжилттай / татгалзсан → бодит `usage` (`settleTokens`);
       · цуцлагдсан, холболт тасарсан, Claude Code унасан → ОРОЛТЫН тооцоо (боловсруулагдсан байж болзошгүй);
       · Anthropic HTTP алдаагаар татгалзсан, кэшийн хариу, claude олдоогүй → 0. */
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
  /* ⚠️ 2026-10-06: КЛИЕНТ ХААСАН үед (чат хаасан, ⟲, Esc, табаа хаасан) загварын дуудлагыг
     цуцална. Урьд нь `res.on('close')`-ыг сонсдоггүй тул процесс/API дуудлага 180с хүртэл
     слот барьж, бусад хэрэглэгч 429 авдаг байв. ⚠️ `res` нь хариу ДУУССАНЫ дараа ч 'close'
     өгдөг — `writableEnded` бол цуцлахгүй. `req.on('close')` БИШ: Node ≥16-д бие уншигдмагц
     өгдөг тул хүсэлт бүр шууд цуцлагдана. */
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
        /* ⚠️ 2026-10-09: кэшээс ирсэн хариу бүртгэлийг зарцуулаагүй — төсөвт тоолохгүй */
        setCharge(0);
      } else {
        ready = { ok: true };
        setCharge(settleTokens(out.usage, inputEst));
      }
      json(res, 200, out);
    } catch (err) {
      /* ⚠️ 2026-10-06: клиент хаасан — бичих socket алга, зөвхөн лог (төсөвт оролтын тооцоо үлдэнэ) */
      if (ac.signal.aborted) {
        console.log(`[agent-proxy:claude-code] ${caller} цуцлагдсан (клиент хаасан)`);
        return;
      }
      /* ⚠️ 2026-10-09 (аудит №7): `e.message` нь клиентэд харагдах ЕРӨНХИЙ мөр; процессын
         stderr/stdout зэрэг дэлгэрэнгүй нь `e.detail` — ЗӨВХӨН логт. */
      const e = err instanceof ClaudeCodeError
        ? err
        : new ClaudeCodeError("AI туслах хариу өгч чадсангүй — дахин оролдоно уу.", { status: 500, detail: err?.message });
      console.error("[agent-proxy:claude-code]", caller, e.message, e.detail ? `— ${e.detail}` : "");
      if (e.status === 401) ready = { ok: false, reason: e.message };
      json(res, e.status, { error: e.message, retryable: e.retryable });
    }
    return;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // ⚠️ Haiku ЭНЭ ПАРАМЕТРИЙГ ДЭМЖДЭГГҮЙ — илгээвэл бүх хүсэлт
      //    «This model does not support the effort parameter» гэж унана.
      ...(WITH_EFFORT ? { output_config: { effort: EFFORT } } : {}),
      // ⚠️ Системийн зааврыг КЭШЛЭНЭ. Тэр нь давхаргын бүртгэл (мянган токен)
      //    агуулдаг бөгөөд яриа бүрт давтагдана — кэшгүй бол удаан ба үнэтэй.
      system: system
        ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
        : undefined,
      tools,
      messages,
    }, { signal: ac.signal });

    /* ⚠️ 2026-10-09: ТАТГАЛЗСАН хариу ч токен зарцуулсан — урьд нь төсөвт нэмэхээс ӨМНӨ буцдаг
       байсан тул татгалзуулах хүсэлтээр төсвийг тойрох боломжтой байв. */
    setCharge(settleTokens(response.usage, inputEst));

    // ⚠️ Аюулгүйн ангилагч татгалзвал HTTP 200 боловч `content` хоосон/дутуу
    //    ирнэ — `content[0]`-ыг шууд уншвал эвдэрнэ.
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
    /* ⚠️ 2026-10-06: клиент хаасан (`APIUserAbortError`) — бичих socket алга, зөвхөн лог */
    if (ac.signal.aborted) {
      console.log(`[agent-proxy] ${caller} цуцлагдсан (клиент хаасан)`);
      return;
    }
    /* ⚠️ 2026-10-09: Anthropic HTTP СТАТУСТАЙ алдаагаар татгалзсан бол төлбөр авдаггүй — төсвөөс
       хасахгүй. Холболтын алдаа (`APIConnectionError`, статусгүй) — оролтын тооцоо үлдэнэ. */
    if (err instanceof Anthropic.APIError && err.status) setCharge(0);
    const msg = err?.message ?? "Тодорхойгүй алдаа";
    console.error("[agent-proxy]", caller, msg);

    // ⚠️ ИТГЭМЖЛЭЛИЙН алдааг ТУСГАЙЛАН барина — SDK-ийн англи техник мессежийг
    //    дамжуулбал хэрэглэгч юу хийхээ ойлгохгүй. Windows дээрх түгээмэл
    //    шалтгаан нь `$env:…`-ыг релеэс ӨӨР цонхонд тавьсан явдал.
    //
    // ⚠️ Урьдчилж `ANTHROPIC_API_KEY`-г шалгах ЁСГҮЙ: `ant auth login`-оор
    //    нэвтэрсэн бол орчны хувьсагч хоосон ч SDK диск дээрх профайлаас уншина.
    if (
      err instanceof Anthropic.AuthenticationError ||
      /could not resolve authentication|api key|authentication/i.test(msg)
    ) {
      setCharge(0);
      json(res, 401, {
        error:
          "AI үйлчилгээний түлхүүр тохируулагдаагүй эсвэл буруу байна. " +
          "`agent-proxy/.env.local` файлд `ANTHROPIC_API_KEY=…` бичээд `npm start` ажиллуулна уу.",
        retryable: false,
      });
      return;
    }

    const retryable =
      err instanceof Anthropic.RateLimitError ||
      err instanceof Anthropic.InternalServerError ||
      err instanceof Anthropic.APIConnectionError;
    /* ⚠️ 2026-10-09 (аудит №7): SDK-ийн түүхий мессеж (`msg`) зөвхөн дээрх логт — клиентэд
       статусаас ЕРӨНХИЙ мөр (`worker.mjs`-тэй ижил, `rateLimit.upstreamErrorText`). */
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 500;
    json(res, status, {
      error: upstreamErrorText(err instanceof Anthropic.APIConnectionError ? 502 : status),
      retryable,
    });
  }
}

// ⚠️ ЗӨВХӨН loopback (127.0.0.1) — энэ реле API түлхүүр барьдаг ба токен
//    шалгадаггүй тул бүх интерфейс (0.0.0.0)-д сонсвол LAN-ийн хэн ч Origin-гүй
//    хүсэлтээр түлхүүр зарцуулна. Локал хөгжүүлэлтэд хостын машин л хандана.
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
