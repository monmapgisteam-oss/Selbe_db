/**
 * РЕЛЕНИЙ ХУРДНЫ ХЯЗГААР — `server.mjs` ба `worker.mjs`-ийн ХУВААЛЦСАН цөм (⚠️ 2026-10-01).
 *
 * ⚠️ ШИЙДВЭР («хэрэглэгч: бүгдийг зас»):
 *    · БАТАЛГААЖСАН ArcGIS ХЭРЭГЛЭГЧ бүрд минутад 40 (`LIMITS.user`) — гол хязгаар;
 *    · IP бүрд минутад 300 (`LIMITS.ip`) — ӨНДӨР таг. Урьд IP-ийн «урьдчилсан»
 *      хязгаар ч 40 байсан тул НЭГ IP-ийн ард (оффисын NAT) суугаа бүх ажилтан нийлээд
 *      минутад 40-д баригдаж (агентын нэг асуулт 2–5 хүсэлт), 10 хүн зэрэг асуухад
 *      429 авдаг байв;
 *    · АМЖИЛТГҮЙ НЭВТРЭЛТ IP бүрд минутад 20 (`LIMITS.authFail`) — хүчингүй токентой
 *      үер бүр ArcGIS-ийн `/community/self` руу хүсэлт үүсгэдэг тул (амжилтгүйг
 *      кэшлэдэггүй) хязгаарт хүрсэн IP-ийн шалгалтыг ArcGIS руу ЯВУУЛАХГҮЙ.
 * ⚠️ Санах ойн тоолуур — Worker-ийн isolate солигдоход тэглэгдэнэ (`worker.mjs`-ийн ⚠️).
 * ⚠️ Хуучирсан түлхүүрийг цонх тутам нэг удаа цэвэрлэнэ — Map өсөхгүй (2026-09-15-ны аудит).
 * ⚠️ 2026-10-09: мөн ӨДРИЙН ТОКЕНЫ ТӨСӨВ (`createBudget`) ба клиентэд харагдах ЕРӨНХИЙ алдааны
 *    мессеж (`upstreamErrorText`) энд — хоёр реле толин дүрмээр хуваалцана (файлын доод хэсэг).
 * ⚠️ 2026-10-09 (2-р ээлж): төсвийн УРЬДЧИЛСАН ТООЦОО (`estimateInputTokens`/`reserveTokens`/
 *    `settleTokens`), дуудагчийн ЗЭРЭГ хүсэлтийн таг (`createConcurrency`), ботын хэрэглэгчийн
 *    түлхүүр (`botCaller`) ба дээд үйлчилгээ рүү явах `tools`/`messages`-ийн цагаан жагсаалт
 *    (`sanitizeChat`) — бүгд энд, хоёр реле ижил.
 */

export const WINDOW_MS = 60 * 1000;

export const LIMITS = Object.freeze({
  /** Баталгаажсан хэрэглэгч (эсвэл баталгаажуулалтгүй горимд IP) — минутад */
  user: 40,
  /** IP-ийн таг — оффисын NAT-ын ард олон хэрэглэгч хуваалцана */
  ip: 300,
  /** Амжилтгүй нэвтрэлт IP бүрд (Worker ба TRUSTED_PROXY-гүй server.mjs: IP + токены хэш бүрд) */
  authFail: 20,
  /**
   * ⚠️ 2026-10-09: амжилтгүй нэвтрэлтийн IP-ийн ТАГ (токены хэшээс үл хамааран) — `authFail` нь
   * IP + токены хэшээр түлхүүрлэгдэх үед санамсаргүй токен бүр өөрийн 20-той болдог тул ArcGIS
   * руу явах шалгалтын үерийг энэ таг барина. Оффисын NAT-ын ард нэг хуучирсан таб бүх хүнийг
   * хаахгүйн тулд `authFail`-ээс ӨНДӨР.
   */
  authFailIp: 100,
  /**
   * ⚠️ 2026-10-09: нэг дуудагчийн ЗЭРЭГ (давхцсан) хүсэлт. Минутын хязгаар (40) нь эхлэх
   * хүсэлтийг л тоолдог тул нэг хүн 40 урт хүсэлтийг ЗЭРЭГ илгээж өдрийн төсвийг шалгалт
   * бүрийг давж (төсөв хариу ирсний ДАРАА нэмэгддэг байв) хэтрүүлж чаддаг байв.
   * Агентын гогцоо дараалсан (нэг асуулт = нэг зэрэг хүсэлт) — 2 нь хоёр таб/цонхонд хүрэлцэнэ.
   */
  concurrent: 2,
  /** ⚠️ 2026-10-09: `x-bot-user`-гүй (хуучин) ботын НИЙТЛЭГ `bot` түлхүүр — бүх ботын хэрэглэгч хуваалцана */
  botConcurrent: 6,
});

/**
 * Гулсах цонхтой тоолуур. `now` — тестэд цаг солих.
 *   · `hit(key, limit)` — хүсэлтийг ТООЛООД хязгаар ХЭТЭРСЭН эсэх (`true` → 429);
 *   · `full(key, limit)` — ТООЛОХГҮЙгээр хязгаарт ХҮРСЭН эсэх (амжилтгүй нэвтрэлтийн
 *     шалгалтыг ArcGIS руу явуулахаас ӨМНӨ).
 */
export function createLimiter({ windowMs = WINDOW_MS, now = Date.now } = {}) {
  const hits = new Map();
  let lastSweep = 0;
  const sweep = (t) => {
    if (t - lastSweep <= windowMs) return;
    for (const [k, arr] of hits) {
      if (!arr.length || t - arr[arr.length - 1] >= windowMs) hits.delete(k);
    }
    lastSweep = t;
  };
  const recent = (key, t) => (hits.get(key) || []).filter((x) => t - x < windowMs);
  return {
    hit(key, limit) {
      const t = now();
      sweep(t);
      const arr = recent(key, t);
      arr.push(t);
      hits.set(key, arr);
      return arr.length > limit;
    },
    full(key, limit) {
      const t = now();
      sweep(t);
      return recent(key, t).length >= limit;
    },
    size: () => hits.size,
  };
}

/**
 * ⚠️ 2026-10-09: ДУУДАГЧ БҮРИЙН ЗЭРЭГ ХҮСЭЛТИЙН ТООЛУУР (`LIMITS.concurrent`).
 *   · `acquire(key, limit)` — слот авбал СУЛЛАХ функц, дүүрсэн бол `null` (→ 429 `code: 'concurrent'`);
 *   · суллах функц ДАВТАН дуудагдахад аюулгүй (нэг л удаа хасна) — `finally` ба `close` хоёулаа дуудаж болно.
 * ⚠️ Санах ойд — `server.mjs` нь нэг процесс тул бүрэн; Worker-д isolate тус бүрд (isolate хооронд
 *    хуваалцахгүй, `worker.mjs`-ийн ⚠️). Бодит хил хэрэгтэй бол Durable Object.
 */
export function createConcurrency() {
  const active = new Map();
  return {
    acquire(key, limit) {
      const n = active.get(key) || 0;
      if (n >= limit) return null;
      active.set(key, n + 1);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const m = (active.get(key) || 1) - 1;
        if (m > 0) active.set(key, m);
        else active.delete(key);
      };
    },
    active: (key) => active.get(key) || 0,
    size: () => active.size,
  };
}

/** Зэрэг хүсэлтийн хязгаарт хүрсэн үеийн мессеж — хоёр реле ИЖИЛ */
export const CONCURRENT_MSG =
  'Өмнөх асуултын хариу хүлээгдэж байна — дуусахыг хүлээгээд дахин оролдоно уу.';

/**
 * ⚠️ 2026-10-09: БОТЫН ДУУДАГЧИЙН ТҮЛХҮҮР. Бот (`x-bot-secret` БАТЛАГДСАН үед л) Telegram
 * хэрэглэгчийн ID-г `x-bot-user` толгойгоор илгээвэл `bot:<id>` — хурдны хязгаар, зэрэг хүсэлт,
 * ӨДРИЙН ТӨСӨВ Telegram хэрэглэгч тус бүрд. Толгой алга/буруу (хуучин бот) бол урьдынх шиг
 * нийтлэг `bot` (төсвөөс чөлөөт). ⚠️ Толгойг зөвхөн нууц таарсны ДАРАА уншина — эс бөгөөс хэн
 * ч өөрийгөө `bot:` гэж зарлаж чадна.
 */
export function botCaller(raw) {
  const s = String(raw ?? '').trim();
  return /^\d{1,20}$/.test(s) ? `bot:${s}` : 'bot';
}

/* ═══════════════ Өдрийн токены төсөв (⚠️ 2026-10-09) ═══════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ӨДРИЙН ТОКЕНЫ ТӨСӨВ — `server.mjs` ба `worker.mjs`-ийн ХУВААЛЦСАН цөм.
 *
 * ⚠️ ЯАГААД (аудит 2026-10-09, №1): минутын хязгаар (40) нь үерийг л барина — байгууллагын
 *    аль ч гишүүн релег ЕРӨНХИЙ ЗОРИУЛАЛТЫН LLM прокси болгон (дурын `system`/`messages`)
 *    өдөржин 40/мин-ээр Opus зарцуулж чаддаг байв. Өдрийн төсөв нь нэг хүний нийт зардлыг
 *    хязгаарлана. Хэтэрвэл 429 + `code: 'daily_budget'` (клиент тусгай мессеж харуулна).
 * ⚠️ `DAILY_TOKEN_BUDGET` орчны хувьсагч — анхдагч 300 000; `0` = төсөвгүй (унтраана).
 * ⚠️ ӨДӨР нь УЛААНБААТАРЫН цагаар (UTC+8) — UTC-ээр бол төсөв өглөөний 8 цагт тэглэгдэнэ.
 * ⚠️ Тооцоо (`usageTokens`): оролт + гаралт + кэш бичилт + кэш уншилтын 1/10 — кэш
 *    уншилт ~10 дахин хямд тул бүтнээр тоолбол урт системийн заавартай хэрэглэгч
 *    хэдхэн асуултаар төсвөө дуусгана.
 * ⚠️ Санах ойн хувилбар — `server.mjs` (нэг процесс) ба KV-гүй Worker (isolate тус бүр,
 *    `worker.mjs`-ийн ⚠️). KV холбосон Worker нь `worker.mjs` дотор KV-ээр тоолно.
 */
export const DAILY_TOKEN_BUDGET_DEFAULT = 300_000;

/** Орчны утгыг уншина: хоосон/буруу → анхдагч, `0` → унтраалттай */
export function budgetFromEnv(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DAILY_TOKEN_BUDGET_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DAILY_TOKEN_BUDGET_DEFAULT;
}

/** Messages API / `claude -p`-ийн `usage`-ээс тоологдох токен (дээрх ⚠️) */
export function usageTokens(u) {
  if (!u || typeof u !== 'object') return 0;
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return n(u.input_tokens) + n(u.output_tokens) + n(u.cache_creation_input_tokens)
    + Math.ceil(n(u.cache_read_input_tokens) / 10);
}

/** Улаанбаатарын (UTC+8) өдөр — `YYYY-MM-DD` */
export const budgetDay = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);

/** Хэрэглэгчид харагдах мессеж — хоёр реле ИЖИЛ */
export const BUDGET_MSG =
  'Өнөөдрийн AI хэрэглээний хязгаар (токены төсөв) дууслаа — маргааш дахин оролдоно уу. ' +
  'Яаралтай бол системийн администраторт хандана уу.';

/**
 * ⚠️ 2026-10-09: УРЬДЧИЛСАН ТООЦОО (pre-debit). Урьд төсөв хариу ирсний ДАРАА л нэмэгддэг
 *    байсан тул ЗЭРЭГ илгээсэн олон хүсэлт бүгд «төсөв дуусаагүй» шалгалтыг давж, хариу
 *    ирэхэд төсвийг олон дахин хэтрүүлдэг байв. Одоо дээд үйлчилгээ рүү явахаас ӨМНӨ тооцоог
 *    (`reserveTokens`) хасаж, хариу ирсний дараа БОДИТ хэрэглээгээр тааруулна (`adjust`).
 *
 * Оролтын тооцоо (`estimateInputTokens`): биеийн БАЙТ / 2 (кирилл UTF-8 2 байт ≈ 1 тэмдэгт —
 * токеноос ихэвчлэн ИЛҮҮ, өөрөөр хэлбэл болгоомжтой). Системийн заавар нь КЭШЛЭГДДЭГ
 * (`cache_control`) тул түүний хэсгийг `usageTokens`-ийн дүрмээр 1/10 жинтэй тоолно — эс бөгөөс
 * урт давхаргын бүртгэлтэй хэрэглэгч цуцалсан асуулт бүрд төсвийн томоохон хэсгийг алдана.
 */
export function estimateInputTokens(bodyBytes, systemBytes = 0) {
  const b = Math.max(0, Number(bodyBytes) || 0);
  const s = Math.min(b, Math.max(0, Number(systemBytes) || 0));
  return Math.ceil((b - s) / 2 + s / 20);
}

/** Урьдчилан хасах дүн = оролтын тооцоо + гаралтын дээд хэмжээ (`MAX_TOKENS`) */
export const reserveTokens = (inputEstimate, maxTokens) =>
  Math.max(0, Number(inputEstimate) || 0) + Math.max(0, Number(maxTokens) || 0);

/**
 * Хүсэлтийн ЭЦСИЙН төлбөр (урьдчилсан тооцоог үүгээр тааруулна):
 *   · `usage` ирсэн (амжилттай, ТАТГАЛЗСАН ч) → бодит `usageTokens`;
 *   · `usage` алга/0 (цуцлагдсан, холболт тасарсан, процесс унасан) → ОРОЛТЫН тооцоо — дээд
 *     үйлчилгээ оролтыг аль хэдийн боловсруулсан байж болзошгүй.
 * ⚠️ Дээд үйлчилгээ HTTP АЛДААГААР (4xx/5xx хариу) татгалзсан бол дуудагч 0 өгнө —
 *    Anthropic тийм хүсэлтэд төлбөр авдаггүй; манай саатлыг хэрэглэгчийн төсвөөс хасахгүй.
 */
export function settleTokens(usage, inputEstimate) {
  const n = usageTokens(usage);
  return n > 0 ? n : Math.max(0, Number(inputEstimate) || 0);
}

/** UTF-8 байтын урт — Worker ба Node-д ижил */
export const utf8Bytes = (s) => (typeof s === 'string' ? new TextEncoder().encode(s).byteLength : 0);

/**
 * Санах ойн өдрийн тоолуур. Өдөр солигдоход БҮГД тэглэгдэнэ (Map өсөхгүй).
 *   · `over(key, limit)` — төсөв ДУУССАН эсэх (`limit` 0 бол ямагт `false`);
 *   · `add(key, n)` — эерэг хэрэглээг нэмнэ;
 *   · `adjust(key, delta)` — урьдчилсан тооцоог тааруулах (сөрөг байж болно, 0-ээс доош орохгүй).
 * ⚠️ 2026-10-09: хүсэлтийн ӨМНӨ `over` шалгаад тооцоог ХАСНА (`reserveTokens`), ДАРАА нь бодитоор
 *    тааруулна — зэрэг хүсэлтүүд урьдчилсан тооцоог хардаг. Нэг хүсэлт төсвийг бага зэрэг давж
 *    болно (шалгалт нь «дуусаагүй» эсэх л) — хүлээн зөвшөөрсөн нарийвчлал.
 */
export function createBudget({ now = Date.now } = {}) {
  let day = '';
  const used = new Map();
  const roll = () => {
    const d = budgetDay(now());
    if (d !== day) { day = d; used.clear(); }
  };
  return {
    over(key, limit) {
      if (!limit) return false;
      roll();
      return (used.get(key) || 0) >= limit;
    },
    add(key, n) {
      roll();
      if (n > 0) used.set(key, (used.get(key) || 0) + n);
    },
    adjust(key, delta) {
      roll();
      if (!Number.isFinite(delta) || !delta) return;
      const v = Math.max(0, (used.get(key) || 0) + delta);
      if (v > 0) used.set(key, v);
      else used.delete(key);
    },
    used(key) { roll(); return used.get(key) || 0; },
    size: () => used.size,
  };
}

/* ═══════════════ Клиентэд харагдах алдааны мессеж (⚠️ 2026-10-09) ═══════════════ */

/**
 * Дээд үйлчилгээний (Anthropic API) алдааг ЕРӨНХИЙ монгол мессеж болгоно.
 * ⚠️ ЯАГААД (аудит №7): урьд SDK/API-ийн түүхий англи мессеж (`err.message`,
 *    `body.error.message`) клиент рүү шууд очдог байв — дотоод тохиргоо, загварын нэр,
 *    хүсэлтийн бүтцийн дэлгэрэнгүй задардаг. Дэлгэрэнгүйг ЗӨВХӨН хостын логт бичнэ.
 * ⚠️ Хоёр реле (`server.mjs`, `worker.mjs`) ИЖИЛ мессеж буцаана — толин дүрэм.
 */
/**
 * ⚠️ 2026-10-09 (аудит №6): ДЭЭД ҮЙЛЧИЛГЭЭНИЙ ТҮЛХҮҮРИЙН АЛДАА — хоёр реле ИЖИЛ бие.
 *    Урьд `server.mjs` (`Anthropic.AuthenticationError`) 401, `worker.mjs` (Anthropic 401/403)
 *    мөн статусыг нь ЯГ хэвээр клиентэд буцаадаг байв. Клиент (`src/lib/agent/client.ts`
 *    `callRelay`) 401-ийг «ArcGIS токен хуучирсан» гэж ойлгож токеноо шинэчлээд дахин илгээж,
 *    хэрэглэгчид «хуудсыг дахин ачаалж нэвтэрнэ үү» гэж худал хэлдэг байв. Одоо 502 +
 *    `code: 'upstream_auth'` — клиент токен-давталт хийхгүй, «серверийн тохиргооны алдаа» гэнэ.
 *    502 тул портал нөөц хост руу шилжинэ (`relayFetch`) — нөгөө хостын тохиргоо зөв байж болно.
 */
export const UPSTREAM_AUTH = Object.freeze({
  error: 'Туслахын серверийн тохиргооны алдаа',
  code: 'upstream_auth',
  retryable: false,
});

export function upstreamErrorText(status) {
  if (status === 429) return 'AI үйлчилгээ ачаалалтай байна — түр хүлээгээд дахин оролдоно уу.';
  if (status === 400 || status === 413) return 'AI үйлчилгээ хүсэлтийг хүлээж авсангүй — яриаг ⟲ дарж шинээр эхлүүлээд дахин оролдоно уу.';
  if (status >= 500 || !status) return 'AI үйлчилгээ түр ажиллахгүй байна — хэсэг хүлээгээд дахин оролдоно уу.';
  return `AI үйлчилгээний алдаа (HTTP ${status}) — дахин оролдоно уу.`;
}

/* ═══════════════ Дээд үйлчилгээ рүү явах хүсэлтийн шалгалт (⚠️ 2026-10-09) ═══════════════ */

/**
 * `tools` ба `messages`-ийг ЦАГААН ЖАГСААЛТААР дахин угсарна — хоёр реле ИЖИЛ дүрэм.
 *
 * ⚠️ ЯАГААД: урьд browser-оос ирсэн `tools`/`messages`-ийг Anthropic руу ЯГ хэвээр нь дамжуулдаг
 *    байсан тул байгууллагын аль ч гишүүн СЕРВЕРИЙН хэрэгсэл (`{type: 'web_search_…'}`,
 *    `code_execution`, `web_fetch` …) — нэмэлт төлбөртэй, гадаад сүлжээнд хандах — эсвэл
 *    зураг/PDF/`document` блок (их хэмжээний оролт) илгээж релег дурын зориулалтаар ашиглаж
 *    чаддаг байв.
 *    · `tools` — зөвхөн `{name, description, input_schema}` (клиентийн хэрэгсэл). `type` талбартай
 *      хэрэгсэл (бүх серверийн/суурилагдсан хэрэгсэл) → 400.
 *    · `messages` — зөвхөн `text`, `tool_use` (assistant), `tool_result` (user; агуулга нь мөр
 *      эсвэл `text` блок) блокууд.
 *    · ⚠️ `thinking` / `redacted_thinking` — ЗӨВХӨН assistant-д зөвшөөрнө: агентын гогцоо
 *      (`src/lib/agent/client.ts`) загварын хариуг «ЯГ ИРСЭН ХЭВЭЭР» түүхэд буцааж хийдэг бөгөөд
 *      бодолт асаалттай загварт tool_use-ийн өмнөх бодолтын блок (гарын үсэгтэй) ЗААВАЛ буцах
 *      ёстой. Тэдгээрийг хасвал агент хэрэгсэл дуудсан дараагийн эргэлт бүрд 400 авна.
 *    · Блок бүрийг МЭДЭГДЭХ талбаруудаар нь дахин угсарна (`cache_control`, `citations`,
 *      `source` … хасагдана).
 * @returns {{ok: true, tools: object[]|undefined, messages: object[]} | {ok: false, error: string}}
 */
export const MAX_TOOLS = 32;
export const MAX_MESSAGES = 400;
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function sanitizeTools(tools) {
  if (tools === undefined || tools === null) return { ok: true, tools: undefined };
  if (!Array.isArray(tools) || tools.length > MAX_TOOLS) return { ok: false, error: '`tools` буруу бүтэцтэй байна' };
  const out = [];
  for (const t of tools) {
    if (!isPlain(t)) return { ok: false, error: '`tools` буруу бүтэцтэй байна' };
    if (has(t, 'type')) return { ok: false, error: 'Серверийн хэрэгсэл (`type`) зөвшөөрөгдөхгүй' };
    if (typeof t.name !== 'string' || !TOOL_NAME.test(t.name)) return { ok: false, error: 'Хэрэгслийн нэр буруу' };
    if (t.description !== undefined && typeof t.description !== 'string') return { ok: false, error: 'Хэрэгслийн тайлбар буруу' };
    if (!isPlain(t.input_schema) || t.input_schema.type !== 'object') return { ok: false, error: 'Хэрэгслийн `input_schema` буруу' };
    out.push({
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
      input_schema: t.input_schema,
    });
  }
  return { ok: true, tools: out.length ? out : undefined };
}

function cleanBlock(b, role) {
  if (!isPlain(b)) return null;
  switch (b.type) {
    case 'text':
      return typeof b.text === 'string' ? { type: 'text', text: b.text } : null;
    case 'tool_use':
      if (role !== 'assistant' || typeof b.id !== 'string' || typeof b.name !== 'string' || !isPlain(b.input)) return null;
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result': {
      if (role !== 'user' || typeof b.tool_use_id !== 'string') return null;
      let content;
      if (b.content === undefined || typeof b.content === 'string') content = b.content;
      else if (Array.isArray(b.content)) {
        content = [];
        for (const c of b.content) {
          if (!isPlain(c) || c.type !== 'text' || typeof c.text !== 'string') return null;
          content.push({ type: 'text', text: c.text });
        }
      } else return null;
      return {
        type: 'tool_result',
        tool_use_id: b.tool_use_id,
        ...(content !== undefined ? { content } : {}),
        ...(b.is_error === true ? { is_error: true } : {}),
      };
    }
    case 'thinking':
      if (role !== 'assistant' || typeof b.thinking !== 'string' || typeof b.signature !== 'string') return null;
      return { type: 'thinking', thinking: b.thinking, signature: b.signature };
    case 'redacted_thinking':
      if (role !== 'assistant' || typeof b.data !== 'string') return null;
      return { type: 'redacted_thinking', data: b.data };
    default:
      return null;
  }
}

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
    return { ok: false, error: '`messages` хоосон эсвэл буруу байна' };
  }
  const out = [];
  for (const m of messages) {
    if (!isPlain(m) || (m.role !== 'user' && m.role !== 'assistant')) {
      return { ok: false, error: '`messages` буруу бүтэцтэй байна' };
    }
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) return { ok: false, error: '`messages` буруу бүтэцтэй байна' };
    const blocks = [];
    for (const b of m.content) {
      const c = cleanBlock(b, m.role);
      if (!c) return { ok: false, error: 'Зөвшөөрөгдөөгүй агуулгын блок (зөвхөн text · tool_use · tool_result)' };
      blocks.push(c);
    }
    out.push({ role: m.role, content: blocks });
  }
  return { ok: true, messages: out };
}

/** `tools` + `messages` хоёуланг нь — нэгийг нь ч давахгүй бол `{ok:false, error}` */
export function sanitizeChat({ tools, messages } = {}) {
  const m = sanitizeMessages(messages);
  if (!m.ok) return m;
  const t = sanitizeTools(tools);
  if (!t.ok) return t;
  return { ok: true, tools: t.tools, messages: m.messages };
}
