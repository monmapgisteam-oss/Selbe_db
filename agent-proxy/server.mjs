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
import Anthropic from "@anthropic-ai/sdk";
import { callClaudeCode, claudeBin, selfTest, stats, ClaudeCodeError } from "./claudeCode.mjs";

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
if (BACKEND === "claude-code") {
  const check = async () => {
    ready = await selfTest();
    console.log(`[agent-proxy] Claude Code бэлэн: ${ready.ok ? "тийм" : `ҮГҮЙ — ${ready.reason}`}`);
  };
  check();
  setInterval(check, 10 * 60 * 1000).unref();
}

/**
 * ArcGIS нэвтрэлт — `worker.mjs`-ийн ижил дүрэм. `ARCGIS_ORG_ID` тохируулсан
 * үед л шаардана.
 * ⚠️ Энэ PC-г Cloudflare Tunnel-ээр НИЙТЭД гаргах бол ЗААВАЛ тохируулна —
 *    эс бөгөөс хаягийг олсон хэн ч энэ PC-ийн Claude бүртгэлийг зарцуулна.
 */
const ARCGIS_ORG_ID = process.env.ARCGIS_ORG_ID?.trim() || "";
const ARCGIS_PORTAL = (process.env.ARCGIS_PORTAL || "https://www.arcgis.com").replace(/\/+$/, "");
const verified = new Map();
async function checkArcGIS(token) {
  if (!token) return { ok: false, reason: "Нэвтрэлтийн мэдээлэл алга" };
  const hit = verified.get(token);
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
    return { ok: false, reason: "Нэвтрэлт шалгах үйлчилгээ хариу өгсөнгүй" };
  }
  if (!data || data.error || !data.username) return { ok: false, reason: "Нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна" };
  if (data.orgId !== ARCGIS_ORG_ID) return { ok: false, reason: "Танай байгууллагад энэ үйлчилгээ нээгдээгүй байна" };
  verified.set(token, { username: data.username, until: Date.now() + 5 * 60 * 1000 });
  return { ok: true, username: data.username };
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-arcgis-token");
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
const RATE_LIMIT = 40;
const RATE_WINDOW = 60 * 1000;
const hits = new Map();
let lastSweep = 0;
function rateLimited(key) {
  const now = Date.now();
  /* Хуучирсан түлхүүрийг цонх тутам нэг удаа цэвэрлэнэ — санах ой өсөхгүй */
  if (now - lastSweep > RATE_WINDOW) {
    for (const [k, a] of hits) {
      if (!a.length || now - a[a.length - 1] >= RATE_WINDOW) hits.delete(k);
    }
    lastSweep = now;
  }
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > RATE_LIMIT;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  /* Эрүүл мэндийн шалгалт — реле асаалттай эсэхийг эндээс мэднэ.
     ⚠️ Дотоод тохиргоог (model/effort) ЗАДЛАХГҮЙ — `worker.mjs`-ийн ижил
        дүрэм: хаягийг олсон хэн ч тохиргоог тандах ёсгүй. */
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    if (rateLimited(`health:${origin || "anon"}`)) {
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
     хэрэглэгч 127.0.0.1 болж нэг хязгаар хуваалцана. */
  const ip =
    req.headers["cf-connecting-ip"] ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress || "anon";
  if (rateLimited(`pre:${ip}`)) {
    json(res, 429, { error: "Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.", retryable: true });
    return;
  }

  const isBot = Boolean(BOT_SECRET) && req.headers["x-bot-secret"] === BOT_SECRET;
  let caller = `ip:${ip}`;
  if (isBot) {
    /* ⚠️ Тогтмол түлхүүр — ботын бүх хэрэглэгч нэг хязгаар хуваалцана (worker-тэй ижил) */
    caller = "bot";
  } else if (ARCGIS_ORG_ID) {
    const auth = await checkArcGIS(req.headers["x-arcgis-token"]);
    if (!auth.ok) {
      json(res, 401, { error: auth.reason, retryable: false });
      return;
    }
    caller = auth.username;
  }
  if (rateLimited(caller)) {
    json(res, 429, { error: "Хэт олон хүсэлт — минутад 40 хүсэлт", retryable: true });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    if (e?.status === 413) {
      json(res, 413, { error: e.message, retryable: false });
      return;
    }
    json(res, 400, { error: `Биеийг уншиж чадсангүй: ${e.message}` });
    return;
  }

  const { system, messages, tools } = payload ?? {};
  if (!Array.isArray(messages) || !messages.length) {
    json(res, 400, { error: "`messages` хоосон байна" });
    return;
  }

  /* ── Claude Code горим ── */
  if (BACKEND === "claude-code") {
    const bin = claudeBin();
    if (!bin) {
      json(res, 500, { error: "Энэ PC дээр Claude Code олдсонгүй — `CLAUDE_BIN` орчны хувьсагчид claude.exe-ийн замыг заана уу.", retryable: false });
      return;
    }
    try {
      const t0 = Date.now();
      const out = await callClaudeCode({ system, messages, tools, model: MODEL, effort: EFFORT, bin });
      const st = stats();
      console.log(`[agent-proxy:claude-code] ${caller} ${out.cached ? "кэш" : `${Date.now() - t0}мс`} ${out.stop_reason} · ажиллаж ${st.running} · дараалал ${st.queued}`);
      if (!out.cached) ready = { ok: true };
      json(res, 200, out);
    } catch (err) {
      const e = err instanceof ClaudeCodeError ? err : new ClaudeCodeError(err?.message ?? "Тодорхойгүй алдаа", { status: 500 });
      console.error("[agent-proxy:claude-code]", caller, e.message);
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
    });

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
    const msg = err?.message ?? "Тодорхойгүй алдаа";
    console.error("[agent-proxy]", msg);

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
    json(res, err instanceof Anthropic.APIError ? (err.status ?? 502) : 500, {
      error: msg,
      retryable,
    });
  }
});

// ⚠️ ЗӨВХӨН loopback (127.0.0.1) — энэ реле API түлхүүр барьдаг ба токен
//    шалгадаггүй тул бүх интерфейс (0.0.0.0)-д сонсвол LAN-ийн хэн ч Origin-гүй
//    хүсэлтээр түлхүүр зарцуулна. Локал хөгжүүлэлтэд хостын машин л хандана.
server.listen(PORT, '127.0.0.1', () => {
  if (BACKEND === "claude-code") {
    console.log(`[agent-proxy] хөдөлгүүр=claude-code  ${claudeBin() ?? "⚠️ claude олдсонгүй (CLAUDE_BIN тохируул)"}`);
    if (!ARCGIS_ORG_ID) console.warn("[agent-proxy] ⚠️ ARCGIS_ORG_ID тохируулаагүй — нийтэд (tunnel) гаргах бол ЗААВАЛ тохируулна.");
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[agent-proxy] ⚠️ ANTHROPIC_API_KEY тохируулаагүй байна — хүсэлт бүр татгалзана.",
    );
  }
  console.log(
    `[agent-proxy] http://localhost:${PORT}  хөдөлгүүр=${BACKEND}  загвар=${MODEL}  effort=${EFFORT}`,
  );
  console.log(`[agent-proxy] зөвшөөрсөн эх: ${ALLOWED.join(", ")}`);
});
