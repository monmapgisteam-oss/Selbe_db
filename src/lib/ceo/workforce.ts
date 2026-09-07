/**
 * CEO САМБАР — «ХҮН · ЦАГ · ТЕХНИК»: талбай дээрх ажилтны тоо, өмнөх тайлангаас
 * хэдээр өөрчлөгдсөн, компани тус бүрээр.
 *
 * Эх сурвалж: ХАБЭА-гийн өдрийн хүн хүчний тайлан (`HABEA.labor`, Survey123).
 * НЭГ мөр = НЭГ өдрийн НЭГДСЭН тайлан; гүйцэтгэгч бүр өөрийн дагавартай
 * баганын бүлэгтэй (`laborCompanyFields(sfx)`), толгойд нь нийт дүн бий.
 *
 * ⚠️ АЛБАН ЁСНЫ ТОО = КОМПАНИУДЫН НИЙЛБЭР, толгойн `Niit_ajiltan` БИШ.
 *    Толгойн дүнг маягт бөглөгч гараар засдаг тул компанийн нийлбэртэй ЯГ
 *    таардаггүй (Habea.tsx: 231,568 ↔ 231,926). Компанийн задаргаа нь
 *    хүснэгттэйгээ нийлэх ёстой тул түүнийг нь ЭХ гэж авна; толгойн дүнг
 *    `detail.headerWorkers`-д ил үлдээнэ (зөрвөл хэрэглэгч харна).
 *    Хүн-цаг нь ЗӨВХӨН толгойд байдаг (`Hun_tsag`) тул тэндээс уншина.
 *
 * ⚠️ ӨДРИЙН ТҮЛХҮҮР — УЛААНБААТАРЫН (+08:00) ХУАНЛИЙН ӨДӨР. `toISOString()`
 *    UTC-ээр огтолдог тул УБ-ын 00:00–08:00-д тэмдэглэсэн тайлан ӨМНӨХ өдөрт
 *    унана. Хөтчийн бүсэд ч найдахгүй (гадаадаас нээвэл өөр өдөр гарна).
 *
 * ⚠️ НЭГ ӨДӨРТ ОЛОН МӨР байж болно (засвар, давхар илгээлт — амьд өгөгдөлд
 *    228 өдрийн 3 нь давхар). Нийлбэрлэвэл тэр өдөр давхар тоологдоно
 *    (Habea.tsx-ийн `byDaySeries` ингэдэг); ЭНД өдөр бүрээс ХАМГИЙН СҮҮЛИЙН
 *    мөрийг л авна — «сүүлийн тайлан» бол засварласан хувилбар нь.
 *
 * ⚠️ «СҮҮЛИЙН» = max `Ognoo` → тэнцвэл max `EditDate` → тэнцвэл max `objectid`.
 *    `Ognoo` нь ОГНОО-л (амьд 231 мөрийн 229 нь яг 04:00Z = УБ 12:00) тул
 *    давхар өдрийн мөрүүд ЯГ ИЖИЛ `Ognoo`-той — зөвхөн түүгээр таслах
 *    боломжгүй, «эхэнд ирсэн» нь серверийн тогтворгүй эрэмбэ (2026-09-06:
 *    ижил query `resultRecordCount`-той/гүй үед oid263/266-г өөр дарааллаар
 *    буцаав). 2026-08-21-нд oid255 (247 ажилтан) сонгогдож, засварласан
 *    oid256 (389, EditDate их)-г алгасаж байв. Survey123-ийн `EditDate` нь
 *    засвар бүрд шинэчлэгддэг (давхар 3 өдөрт max EditDate = max objectid),
 *    `objectid` нь дахин илгээлтэд өснө. Хэдэн мөр давхарласныг `rowsInDay`-д,
 *    сонгосон мөрийн дугаарыг `oid`-д хадгална. Серверийн эрэмбэ ч мөн
 *    `Ognoo DESC, objectid DESC` — 2000 мөр давахад хуудаслалт тогтвортой.
 *
 * ⚠️ ГҮЙЦЭТГЭГЧ ТАЙЛАНГҮЙ ≠ 0 АЖИЛТАНТАЙ. Маягтын `Niit_ajiltan_<SFX>` нь
 *    гүйцэтгэгч репитэд ороогүй үед ч 0 гэж (null БИШ) бичигддэг тул
 *    «хоосон эсэх»-ийг талбараас мэдэх боломжгүй. Тиймээс сүүлийн тайланд
 *    ажилтан ч, техник ч 0 боловч өмнөх 7 хоногт нэг ч удаа тоотой байсан
 *    компанийг «тайлангүй» гэж ТУСАД НЬ тэмдэглэнэ — нийлбэрт 0-оор орно
 *    (тайлан дээр байхгүй = талбай дээр тоологдоогүй), харин issue-д гарна.
 *
 * ⚠️ `null` ≠ 0: сүүлийн мөрөнд НЭГ Ч компанийн ажилтны талбар байхгүй бол
 *    ажилтны нийлбэр `null` («—»), 0 биш. Техник нь ТУСДАА туг — бүх
 *    `Tehnik_<SFX>` хоосон бол техник `null`, ажилтан бөглөгдсөн ч гэсэн
 *    (2026-09-06-ны хяналт: нэг туг хуваалцвал техник 0 гэж худал гардаг байв).
 *    Хүн-цаг хоосон бол мөн `null`.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { queryFeatures, type Row } from '@/lib/query';
import { HABEA, laborCompanyFields } from '@/lib/services';
import { blank, num, pct } from '@/lib/format';
import {
  cell, table, worstOf, daysBetween, type KpiResult, type KpiIssue, type Level, type Cell,
} from './kpi';

/* ══════════════ Босго ══════════════ */

/**
 * ⚠️ САНАЛ (2026-09-06) — хэрэглэгч батлаагүй. Өмнөх тайлангаас ажилтны тоо
 *    10%-иар буурвал анхаарах, 25%-иар буурвал яаралтай. Хувь нь СӨРӨГ
 *    (бууралт), өсөлт нь дохио биш.
 */
export const WORKFORCE_DROP_WARN = -10;
export const WORKFORCE_DROP_BAD = -25;
/**
 * ⚠️ САНАЛ — сүүлийн тайлан 3 хоногоос хуучин бол хамгийн багадаа «анхаарах»:
 *    өдрийн тайлан амралтын өдөр ч ирдэг тул 3 хоног дуугүй = тайлан зогссон.
 */
export const WORKFORCE_STALE_DAYS = 3;
/** «Тайлангүй» гэж тооцох ХАЙХ цонх — сүүлийн тайлангаас өмнөх 7 хоног */
export const WORKFORCE_LOOKBACK_DAYS = 7;
/** Хоёрдугаар хүснэгтийн цонх — сүүлийн тайлангаас өмнөх 14 хоног */
export const WORKFORCE_TREND_DAYS = 14;
/**
 * ⚠️ САНАЛ — компанийн бууралтыг ЗӨВХӨН өмнөх өдөр 10+ ажилтантай байсан үед
 *    дохиолно: 2 → 1 хүн нь −50% боловч мэдээлэл биш, чимээ.
 */
export const WORKFORCE_COMPANY_MIN_PREV = 10;

/* ══════════════ Хэлбэрүүд ══════════════ */

export type CompanyDay = {
  /** Ажилтан — `Niit_ajiltan_<SFX>`, хоосон/0 бол монгол+гадаад (Habea.tsx-ийн дүрэм) */
  workers: number;
  technik: number;
  mongol: number | null;
  gadaad: number | null;
  bagts: string | null;
};

export type WorkforceDay = {
  /** YYYY-MM-DD, Улаанбаатарын хуанлиар */
  key: string;
  /** Сонгосон мөрийн `Ognoo`, epoch ms */
  at: number;
  /** Сонгосон мөрийн `objectid` — давхар өдөрт аль хувилбар үлдсэнийг мөшгөхөд */
  oid: number | null;
  /** Энэ өдөрт хэдэн мөр давхарласан (1 = хэвийн) */
  rowsInDay: number;
  /** Маягтын ТОЛГОЙН дүн — зөвхөн мэдээлэлд, албан ёсны тоо биш */
  header: { workers: number | null; manHours: number | null; technik: number | null };
  /** sfx → компанийн утга (12 компани бүгд, ороогүй нь 0/null) */
  comp: Record<string, CompanyDay>;
  /** Σ компани — нэг ч компанийн ажилтны талбар (нийт/монгол/гадаад) байхгүй бол null */
  workers: number | null;
  /** Σ компани — нэг ч `Tehnik_<SFX>` байхгүй бол null (ажилтнаас ХАМААРАХГҮЙ) */
  technik: number | null;
};

export type WorkforceCompanyRow = {
  sfx: string;
  label: string;
  bagts: string | null;
  workers: number;
  technik: number;
  mongol: number | null;
  gadaad: number | null;
  /** Өмнөх өдөр — өмнөх тайлан огт байхгүй бол null */
  prev: number | null;
  delta: number | null;
  /** 0–100 (сөрөг = бууралт); өмнөх 0 бол null */
  deltaPct: number | null;
  /** Сүүлийн тайланд 0 боловч өмнөх 7 хоногт тоотой байсан */
  unreported: boolean;
};

export type WorkforceDetail = {
  latestKey: string | null;
  prevKey: string | null;
  workersLatest: number | null;
  workersPrev: number | null;
  delta: number | null;
  deltaPct: number | null;
  manHours: number | null;
  technik: number | null;
  /** Толгойн `Niit_ajiltan` — компанийн нийлбэртэй зөрвөл хэрэглэгч мэдэх ёстой */
  headerWorkers: number | null;
  staleDays: number | null;
  /** Сүүлийн тайланд ороогүй компанийн `sfx`-үүд */
  unreported: string[];
  companies: WorkforceCompanyRow[];
  days: WorkforceDay[];
};

export type WorkforceKpi = KpiResult & { detail: WorkforceDetail };

/* ══════════════ Туслахууд ══════════════ */

const UB_OFFSET_MS = 8 * 3_600_000;

/** epoch ms → «YYYY-MM-DD» Улаанбаатарын (+08:00) хуанлиар — `toISOString` UTC-ээр огтолдог */
export const ubDayKey = (ms: number): string => (
  new Date(ms + UB_OFFSET_MS).toISOString().slice(0, 10)
);

/** ArcGIS утга → тоо; null/''/тоо биш бол null (0 БИШ) */
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const F = HABEA.labor.fields;
const COMPANIES = HABEA.labor.companies;

function companyDay(r: Row, sfx: string, bagtsFixed: string | null): CompanyDay {
  const f = laborCompanyFields(sfx);
  const niit = numOrNull(r[f.niitAjiltan]);
  const mongol = numOrNull(r[f.mongol]);
  const gadaad = numOrNull(r[f.gadaad]);
  const technik = numOrNull(r[f.niitTehnik]);
  /* ⚠️ Habea.tsx `laborState`-ийн дүрэм: нийт нь хоосон/0 бол монгол+гадаад.
     Хоёулаа хоосон бол 0 — компани тайланд ороогүй. */
  const split = mongol != null || gadaad != null ? (mongol ?? 0) + (gadaad ?? 0) : null;
  const workers = niit != null && niit > 0 ? niit : (split ?? 0);
  const bagtsRaw = r[f.bagts];
  return {
    workers, technik: technik ?? 0, mongol, gadaad,
    bagts: bagtsFixed ?? (blank(bagtsRaw) ? null : String(bagtsRaw).trim()),
  };
}

/** Нэг мөр → өдрийн бүртгэл (компанийн нийлбэрийг энд бодно) */
function dayOf(r: Row, at: number, oid: number | null, rowsInDay: number): WorkforceDay {
  const comp: Record<string, CompanyDay> = {};
  /* ⚠️ ХОЁР ТУСДАА туг. Ажилтны талбар бөглөгдсөн ч `Tehnik_<SFX>` бүгд хоосон
     байж болно (мөн эсрэгээр) — нэг тугаар явбал хоосон тал 0 гэж худал гарна. */
  let anyWorkers = false;
  let anyTechnik = false;
  let workers = 0;
  let technik = 0;
  for (const c of COMPANIES) {
    const f = laborCompanyFields(c.sfx);
    if (!blank(r[f.niitAjiltan]) || !blank(r[f.mongol]) || !blank(r[f.gadaad])) anyWorkers = true;
    if (!blank(r[f.niitTehnik])) anyTechnik = true;
    const d = companyDay(r, c.sfx, c.bagts);
    comp[c.sfx] = d;
    workers += d.workers;
    technik += d.technik;
  }
  return {
    key: ubDayKey(at),
    at,
    oid,
    rowsInDay,
    header: {
      workers: numOrNull(r[F.niitAjiltan]),
      manHours: numOrNull(r[F.hunTsag]),
      technik: numOrNull(r[F.niitTehnik]),
    },
    comp,
    /* ⚠️ null ≠ 0 — нэг ч компанийн талбар байхгүй мөр «0 ажилтан»/«0 техник» БИШ */
    workers: anyWorkers ? workers : null,
    technik: anyTechnik ? technik : null,
  };
}

/**
 * ArcGIS-ийн системийн талбарууд — `outFields`-д ил нэрлэнэ (`*` биш).
 * ⚠️ Survey123 давхаргад `editFieldsInfo.editDateField = 'EditDate'`,
 *    `objectIdField = 'objectid'` (жижиг үсэг) — 2026-09-06-нд амьдаар баталсан.
 */
export const EDIT_DATE_FIELD = 'EditDate';
export const OID_FIELD = 'objectid';

type DayPick = { r: Row; at: number; edited: number; oid: number; n: number };

/**
 * `a` нь `b`-ээс «сүүлийнх» үү — max `Ognoo` → max `EditDate` → max `objectid`.
 * ⚠️ Оролтын дараалалд ОГТ хамаарахгүй: гурвуулаа тэнцвэл л эхэнд ирсэн нь
 *    үлдэнэ (объект давхардсан гэсэн үг — бодит өгөгдөлд гарахгүй).
 */
const newer = (a: DayPick, b: DayPick): boolean => (
  a.at !== b.at ? a.at > b.at
    : a.edited !== b.edited ? a.edited > b.edited
      : a.oid > b.oid
);

/**
 * Түүхий мөрүүд → өдрийн бүртгэлүүд, ШИНЭЭС ХУУЧИН руу.
 * Огноогүй/0 огноотой мөр (дуусаагүй маягт) хасагдана; нэг өдөрт олон мөр
 * байвал `newer`-ийн дүрмээр сүүлийнх нь үлдэнэ (толгойн ⚠️).
 */
export function groupDays(rows: Row[]): WorkforceDay[] {
  const best = new Map<string, DayPick>();
  for (const r of rows) {
    const at = numOrNull(r[F.ognoo]);
    if (at == null || at <= 0) continue;
    /* ⚠️ Зөвхөн ЭРЭМБЭЛЭХЭД — хэмжилт биш тул хоосон бол 0 (ямар ч бодит
       тамгаас бага) гэж үзэж болно; `null ≠ 0` дүрэм энд хамаарахгүй. */
    const cand: DayPick = {
      r, at, edited: numOrNull(r[EDIT_DATE_FIELD]) ?? 0, oid: numOrNull(r[OID_FIELD]) ?? 0, n: 1,
    };
    const key = ubDayKey(at);
    const cur = best.get(key);
    if (!cur) best.set(key, cand);
    else {
      cand.n = cur.n + 1;
      if (newer(cand, cur)) best.set(key, cand);
      else cur.n = cand.n;
    }
  }
  return [...best.values()]
    .sort((a, b) => b.at - a.at)
    .map((x) => dayOf(x.r, x.at, numOrNull(x.r[OID_FIELD]), x.n));
}

/** Бууралтын хувь ба тайлангийн шинэлэг байдлаас нэгдсэн түвшин */
export function workforceLevel(deltaPct: number | null, staleDays: number | null): Level {
  /* ⚠️ Өмнөх тайлангүй (deltaPct null) бол дүгнэлтгүй — `neutral`, «сайн» биш */
  const drop: Level = deltaPct == null ? 'neutral'
    : deltaPct <= WORKFORCE_DROP_BAD ? 'bad'
      : deltaPct <= WORKFORCE_DROP_WARN ? 'warn' : 'good';
  const stale: Level = staleDays == null ? 'unknown'
    : staleDays > WORKFORCE_STALE_DAYS ? 'warn' : 'good';
  return worstOf([drop, stale]);
}

const UNIT = () => tr('хүн ажиллаж байна');

const EMPTY_DETAIL = (): WorkforceDetail => ({
  latestKey: null, prevKey: null, workersLatest: null, workersPrev: null,
  delta: null, deltaPct: null, manHours: null, technik: null, headerWorkers: null,
  staleDays: null, unreported: [], companies: [], days: [],
});

/* ══════════════ Цэвэр тооцоо ══════════════ */

export function computeWorkforce(rows: Row[], now: number): WorkforceKpi {
  const days = groupDays(rows);
  const latest = days[0];
  if (!latest) {
    return {
      value: '—', unit: UNIT(), facts: [], level: 'unknown', tables: [], issues: [],
      asOf: null, failedSources: [], detail: EMPTY_DETAIL(),
    };
  }
  const prev = days[1] ?? null;

  /* ── Компани тус бүр ── */
  const lookbackFrom = latest.at - WORKFORCE_LOOKBACK_DAYS * 86_400_000;
  const lookback = days.filter((d) => d.at < latest.at && d.at >= lookbackFrom);
  const companies: WorkforceCompanyRow[] = COMPANIES.map((c) => {
    const cur = latest.comp[c.sfx];
    const p = prev?.comp[c.sfx] ?? null;
    const prevW = p ? p.workers : null;
    const delta = prevW == null ? null : cur.workers - prevW;
    const deltaPct = prevW == null || prevW === 0 || delta == null ? null : (delta / prevW) * 100;
    const activeBefore = lookback.some((d) => {
      const x = d.comp[c.sfx];
      return !!x && (x.workers > 0 || x.technik > 0);
    });
    const unreported = cur.workers === 0 && cur.technik === 0 && activeBefore;
    return {
      sfx: c.sfx, label: c.label,
      bagts: cur.bagts ?? p?.bagts ?? null,
      workers: cur.workers, technik: cur.technik, mongol: cur.mongol, gadaad: cur.gadaad,
      prev: prevW, delta, deltaPct, unreported,
    };
  });
  const unreported = companies.filter((c) => c.unreported).map((c) => c.sfx);

  /* ── Нийт ── */
  const workersLatest = latest.workers;
  const workersPrev = prev ? prev.workers : null;
  const delta = workersLatest == null || workersPrev == null ? null : workersLatest - workersPrev;
  const deltaPct = delta == null || !workersPrev ? null : (delta / workersPrev) * 100;
  const staleDays = daysBetween(latest.at, now);

  /* ── Баримтууд — зөвхөн тоо ── */
  const facts: string[] = [];
  if (delta != null) {
    const sgn = delta > 0 ? '+' : '';
    facts.push(deltaPct == null
      ? tr('{0} хүн өмнөх тайлангаас', `${sgn}${num(delta)}`)
      : tr('{0} хүн өмнөх тайлангаас ({1})', `${sgn}${num(delta)}`, `${sgn}${pct(deltaPct)}`));
  }
  if (latest.technik != null) facts.push(tr('техник {0}', num(latest.technik)));
  if (latest.header.manHours != null) facts.push(tr('хүн-цаг {0}', num(latest.header.manHours)));
  facts.push(prev ? tr('{0} · өмнөх {1}', latest.key, prev.key) : latest.key);
  if (unreported.length) facts.push(tr('{0} компани тайлангүй', unreported.length));

  /* ── Хүснэгт 1: компаниар, хамгийн их бууралт эхэнд ── */
  const compRows = companies
    .filter((c) => c.unreported || c.workers > 0 || c.technik > 0 || (c.prev ?? 0) > 0
      || (prev?.comp[c.sfx]?.technik ?? 0) > 0)
    .sort((a, b) => {
      if (a.delta == null && b.delta == null) return b.workers - a.workers;
      if (a.delta == null) return 1;
      if (b.delta == null) return -1;
      return a.delta - b.delta || b.workers - a.workers;
    })
    .map((c): Cell[] => [
      cell(c.unreported ? `${c.label} (${tr('тайлангүй')})` : c.label),
      cell(c.bagts),
      cell(c.workers, 'count'),
      cell(c.prev, 'count'),
      cell(c.delta, 'count'),
      cell(c.technik, 'count'),
      cell(c.mongol, 'count'),
      cell(c.gadaad, 'count'),
    ]);
  const byCompany = table(
    tr('Компаниар — сүүлийн тайлан'),
    [tr('Компани'), tr('Багц'), tr('Ажилтан'), tr('Өмнөх'), tr('Зөрүү'), tr('Техник'), tr('Монгол'), tr('Гадаад')],
    compRows,
  );

  /* ── Хүснэгт 2: сүүлийн 14 хоног, нийт ── */
  const trendFrom = latest.at - WORKFORCE_TREND_DAYS * 86_400_000;
  const trend = table(
    tr('Сүүлийн 14 хоног — нийт'),
    [tr('Огноо'), tr('Ажилтан'), tr('Техник'), tr('Хүн-цаг')],
    days
      .filter((d) => d.at >= trendFrom)
      .map((d): Cell[] => [
        cell(d.key),
        cell(d.workers, 'count'),
        cell(d.technik, 'count'),
        cell(d.header.manHours, 'count'),
      ]),
  );

  /* ── Анхааруулга — нэрээр ── */
  const issues: KpiIssue[] = [];
  companies
    .filter((c) => !c.unreported && c.deltaPct != null && c.deltaPct <= WORKFORCE_DROP_BAD
      && (c.prev ?? 0) >= WORKFORCE_COMPANY_MIN_PREV)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))
    .forEach((c) => issues.push({
      tone: 'warn',
      text: tr('{0} — {1} → {2} хүн', c.label, num(c.prev), num(c.workers)),
    }));
  companies
    .filter((c) => c.unreported)
    .forEach((c) => issues.push({ tone: 'warn', text: tr('{0} — сүүлийн тайланд орсонгүй', c.label) }));

  const level: Level = workersLatest == null ? 'unknown' : workforceLevel(deltaPct, staleDays);

  return {
    value: num(workersLatest),
    unit: UNIT(),
    facts,
    level,
    tables: [byCompany, trend],
    issues,
    asOf: latest.at,
    failedSources: [],
    detail: {
      latestKey: latest.key,
      prevKey: prev?.key ?? null,
      workersLatest, workersPrev, delta, deltaPct,
      manHours: latest.header.manHours,
      technik: latest.technik,
      headerWorkers: latest.header.workers,
      staleDays,
      unreported,
      companies,
      days,
    },
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ `outFields`-д БАЙХГҮЙ талбар бичвэл ArcGIS 400 «'outFields' parameter is
 *    invalid» буцаана (2026-09-06-нд амьдаар баталсан). `Bagts_<SFX>` нь
 *    зөвхөн багц заасан 7 компанид бий — бусдынхыг жагсаалтад оруулахгүй.
 */
function outFields(): string[] {
  const out: string[] = [OID_FIELD, EDIT_DATE_FIELD, F.ognoo, F.niitAjiltan, F.hunTsag, F.niitTehnik];
  for (const c of COMPANIES) {
    const f = laborCompanyFields(c.sfx);
    out.push(f.mongol, f.gadaad, f.niitAjiltan, f.niitTehnik);
    if (c.bagts) out.push(f.bagts);
  }
  return out;
}

/**
 * Ганц эх сурвалж — унавал ЮУ Ч ачаалагдаагүй тул шидэнэ (`cached` унасан
 * амлалтыг хадгалдаггүй, дараагийн дуудалт дахин оролдоно).
 */
export const loadWorkforceKpi = cached(async (): Promise<KpiResult> => {
  const rows = await queryFeatures(HABEA.labor.url, {
    outFields: outFields(),
    /* ⚠️ Хоёрдогч түлхүүр ЗААВАЛ — ижил `Ognoo`-той мөрүүдийн эрэмбэ эс бөгөөс
       хуудас бүрд өөр (толгойн ⚠️); `groupDays` өөрөө ч эрэмбэд найддаггүй. */
    orderBy: `${F.ognoo} DESC, ${OID_FIELD} DESC`,
  });
  return computeWorkforce(rows, Date.now());
}, 5 * 60_000, ['HABEA']);
