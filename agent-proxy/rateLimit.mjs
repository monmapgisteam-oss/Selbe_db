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
 */

export const WINDOW_MS = 60 * 1000;

export const LIMITS = Object.freeze({
  /** Баталгаажсан хэрэглэгч (эсвэл баталгаажуулалтгүй горимд IP) — минутад */
  user: 40,
  /** IP-ийн таг — оффисын NAT-ын ард олон хэрэглэгч хуваалцана */
  ip: 300,
  /** Амжилтгүй нэвтрэлт IP бүрд */
  authFail: 20,
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
 * Санах ойн өдрийн тоолуур. Өдөр солигдоход БҮГД тэглэгдэнэ (Map өсөхгүй).
 *   · `over(key, limit)` — төсөв ДУУССАН эсэх (`limit` 0 бол ямагт `false`);
 *   · `add(key, n)` — хариу ирсний ДАРАА бодит хэрэглээг нэмнэ.
 * ⚠️ Хүсэлтийн ӨМНӨ шалгаж, ДАРАА нь нэмнэ — нэг хүсэлт төсвийг бага зэрэг (≤ `MAX_TOKENS`
 *    + оролт) давж болно; энэ нь хүлээн зөвшөөрсөн нарийвчлал.
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
export function upstreamErrorText(status) {
  if (status === 429) return 'AI үйлчилгээ ачаалалтай байна — түр хүлээгээд дахин оролдоно уу.';
  if (status === 400 || status === 413) return 'AI үйлчилгээ хүсэлтийг хүлээж авсангүй — яриаг ⟲ дарж шинээр эхлүүлээд дахин оролдоно уу.';
  if (status >= 500 || !status) return 'AI үйлчилгээ түр ажиллахгүй байна — хэсэг хүлээгээд дахин оролдоно уу.';
  return `AI үйлчилгээний алдаа (HTTP ${status}) — дахин оролдоно уу.`;
}
