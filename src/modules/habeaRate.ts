/**
 * ОСЛЫН ДАВТАМЖ — 1 САЯ ХҮН-ЦАГТ (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * Тооцоо: давтамж = осол ÷ хүн-цаг × 1,000,000 (ХАБЭА-гийн нийтлэг хэмжүүр —
 * өөр өөр хэмжээтэй багц/сарыг шууд харьцуулна). Багцаар ба сараар.
 *
 * ⚠️ ХҮН-ЦАГ НЬ ЗӨВХӨН МАЯГТЫН ТОЛГОЙД (`Hun_tsag`) — гүйцэтгэгчээр задардаггүй
 *    (`ceo/workforce.ts`-ийн толгойн ⚠️). Тиймээс БАГЦЫН хүн-цаг нь ТООЦОО: тухайн
 *    өдрийн толгойн хүн-цагийг гүйцэтгэгчдийн АЖИЛТНЫ ТООНЫ ЖИНГЭЭР хуваарилна
 *    (гүйцэтгэгч ↔ багц 1:1, `HABEA.labor.companies.bagts`). Дэлгэцэд «тооцоо»
 *    гэж ИЛ бичнэ. Сарын нийт нь толгойн бодит нийлбэр (тооцоо биш), харин багц
 *    шүүлттэй үед сар ч хуваарилсан утгаар.
 * ⚠️ null ≠ 0: `Hun_tsag` хоосон/0 өдөр нь хүн-цагт 0 БИШ — тооцоонд ОРОХГҮЙ.
 *    Хүн-цаггүй сар/багцын давтамж ЗУРАГДАХГҮЙ (∞ эсвэл 0 гэж худал гарахгүй);
 *    тэнд унасан ослын тоог `unmatched`-аар ил хэлнэ.
 * ⚠️ Ажилтны тоо — `companyDay`-ийн дүрэм (`Niit_ajiltan_<SFX>` > 0, эс бөгөөс
 *    монгол + гадаад). Тайлан өгөөгүй гүйцэтгэгч (0) жин авахгүй.
 * ⚠️ REACT/СҮЛЖЭЭГҮЙ — `habeaRate.check.mjs` шууд импортлоно.
 */
import type { Row } from '@/lib/query';
import { HABEA, laborCompanyFields } from '@/lib/services';

/** Давтамжийн суурь — 1 сая хүн-цаг */
export const RATE_BASE = 1_000_000;

export type HourDay = {
  /** `Ognoo`, epoch ms */
  ms: number;
  /** Толгойн `Hun_tsag` — бодит */
  total: number;
  /** Гүйцэтгэгч (sfx) → хуваарилсан хүн-цаг (ТООЦОО). Ажилтны тоо 0 бол `null`. */
  byCo: Record<string, number> | null;
};

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Гүйцэтгэгчийн тухайн өдрийн ажилтан — `ceo/workforce.companyDay`-ийн ижил дүрэм */
const workersOf = (r: Row, sfx: string): number => {
  const f = laborCompanyFields(sfx);
  const niit = numOrNull(r[f.niitAjiltan]);
  if (niit != null && niit > 0) return niit;
  return Math.max(0, (numOrNull(r[f.mongol]) ?? 0) + (numOrNull(r[f.gadaad]) ?? 0));
};

/**
 * ӨДӨР БҮРИЙН ХҮН-ЦАГ. Огноогүй ба `Hun_tsag` хоосон/≤0 мөр ОРОХГҮЙ.
 * ⚠️ Дуудагч өдөрт НЭГ мөр өгнө (`latestRowPerDay`) — давхар мөрийг энд нийлбэрлэхгүй.
 */
export function hoursByDay(rows: readonly Row[]): HourDay[] {
  const L = HABEA.labor.fields;
  const out: HourDay[] = [];
  for (const r of rows) {
    const ms = numOrNull(r[L.ognoo]);
    const total = numOrNull(r[L.hunTsag]);
    if (ms == null || ms <= 0 || total == null || total <= 0) continue;
    const w: Record<string, number> = {};
    let sum = 0;
    for (const c of HABEA.labor.companies) {
      const x = workersOf(r, c.sfx);
      if (x > 0) { w[c.sfx] = x; sum += x; }
    }
    let byCo: Record<string, number> | null = null;
    if (sum > 0) {
      byCo = {};
      for (const [sfx, x] of Object.entries(w)) byCo[sfx] = (total * x) / sum;
    }
    out.push({ ms, total, byCo });
  }
  return out;
}

export type RateItem = {
  key: string;
  label: string;
  incidents: number;
  hours: number;
  /** осол / 1 сая хүн-цаг */
  rate: number;
};

/**
 * САРЫН давтамж — ⚠️ 2026-10-09: хүн-цаггүй (тэнхлэгийн завсрын) сард `hours`/`rate` нь
 * `null` (цоорхой, 0 БИШ).
 */
export type RateMonthItem = Omit<RateItem, 'hours' | 'rate'> & { hours: number | null; rate: number | null };

type IncLike = { d: number; bagtsK: string };

/** «YYYY-MM» → дараагийн сар */
const nextYm = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Багцын хуваарилсан хүн-цаг — тухайн өдрийн, сонгосон багцуудын */
const pkgHours = (
  day: HourDay, pkgOfCo: ReadonlyMap<string, string>, pkgs: ReadonlySet<string>,
): number | null => {
  if (!day.byCo) return null;
  let s = 0;
  for (const [sfx, h] of Object.entries(day.byCo)) {
    const k = pkgOfCo.get(sfx);
    if (k && pkgs.has(k)) s += h;
  }
  return s;
};

/**
 * САРААР. `pkgs` өгвөл (багцын шүүлт) хүн-цаг нь тэдгээр багцын ХУВААРИЛСАН утга.
 * Осол нь дуудагчийн шүүсэн олонлог (огноогүй осол тоологдохгүй).
 * @returns `items` — эхний хүн-цагтай сараас сүүлийнх хүртэл ТАСРАЛТГҮЙ сарын тэнхлэг
 *          (хуучнаас шинэ), `unmatched` — хүн-цаггүй сард эсвэл огноогүй унасан ослын тоо.
 * ⚠️ 2026-10-09: ТАСРАЛТГҮЙ ТЭНХЛЭГ — урьд нь зөвхөн хүн-цагтай сарууд гардаг тул завсрын
 *    сар алга болж муруй 2026.06 → 2026.09 руу шууд үсэрч, хоёр сарын хоорондох «тасралт»
 *    харагддаггүй байв. Завсрын сар `rate: null` — дуудагч цоорхой болгож зурна (`Series lines`).
 */
export function rateByMonth(
  days: readonly HourDay[],
  incs: readonly IncLike[],
  opts: {
    ymOf: (ms: number) => string;
    pkgOfCo: ReadonlyMap<string, string>;
    pkgs: ReadonlySet<string> | null;
  },
): { items: RateMonthItem[]; unmatched: number } {
  const hours = new Map<string, number>();
  for (const day of days) {
    const h = opts.pkgs ? pkgHours(day, opts.pkgOfCo, opts.pkgs) : day.total;
    if (h == null || h <= 0) continue;
    const ym = opts.ymOf(day.ms);
    hours.set(ym, (hours.get(ym) ?? 0) + h);
  }
  const n = new Map<string, number>();
  let unmatched = 0;
  for (const x of incs) {
    const ym = x.d > 0 ? opts.ymOf(x.d) : '';
    if (!ym || !hours.has(ym)) { unmatched += 1; continue; }
    n.set(ym, (n.get(ym) ?? 0) + 1);
  }
  const keys = [...hours.keys()].sort();
  const items: RateMonthItem[] = [];
  if (keys.length) {
    const last = keys[keys.length - 1];
    /* ⚠️ Хамгаалалт: буруу формат (`ymOf`) мөнхийн давталт үүсгэхгүй — 1200 сар (100 жил) */
    for (let ym = keys[0], i = 0; i < 1200; ym = nextYm(ym), i += 1) {
      const h = hours.get(ym);
      const k = n.get(ym) ?? 0;
      items.push(h == null
        ? { key: ym, label: ym.replace('-', '.'), incidents: k, hours: null, rate: null }
        : { key: ym, label: ym.replace('-', '.'), incidents: k, hours: h, rate: (k / h) * RATE_BASE });
      if (ym >= last) break;
    }
  }
  return { items, unmatched };
}

/**
 * БАГЦААР — хүн-цаг нь хуваарилсан ТООЦОО. Ажилтны багана БАЙХГҮЙ багцын осол
 * (`pkgOfCo`-д үгүй) давтамжгүй — `unmatched`-д тоологдоно.
 * Эрэмбэ: давтамж буурахаар.
 */
export function rateByPkg(
  days: readonly HourDay[],
  incs: readonly IncLike[],
  pkgOfCo: ReadonlyMap<string, string>,
  labelOf: (pkgKey: string) => string,
): { items: RateItem[]; unmatched: number } {
  const hours = new Map<string, number>();
  for (const day of days) {
    if (!day.byCo) continue;
    for (const [sfx, h] of Object.entries(day.byCo)) {
      const k = pkgOfCo.get(sfx);
      if (!k) continue;
      hours.set(k, (hours.get(k) ?? 0) + h);
    }
  }
  const n = new Map<string, number>();
  let unmatched = 0;
  for (const x of incs) {
    if (!x.bagtsK || !(hours.get(x.bagtsK) ?? 0)) { unmatched += 1; continue; }
    n.set(x.bagtsK, (n.get(x.bagtsK) ?? 0) + 1);
  }
  const items = [...hours.entries()]
    .filter(([, h]) => h > 0)
    .map(([k, h]) => {
      const c = n.get(k) ?? 0;
      return { key: k, label: labelOf(k), incidents: c, hours: h, rate: (c / h) * RATE_BASE };
    })
    .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label));
  return { items, unmatched };
}

/**
 * ЯВАГДАЖ БУЙ (дуусаагүй) САР — сарын цуваанд тэмдэглэнэ.
 * ⚠️ 2026-10-01: сарын нийлбэр (хүн-өдөр, үзлэгийн тоо) нь сарын дунд ДУТУУ тул
 *    сүүлийн багана «унасан» мэт уншигддаг байв. Шошгонд «*», тайлбарт ил хэлнэ.
 */
export const CUR_MONTH_MARK = '*';
export const markCurMonth = <T extends { key: string; label: string }>(items: T[], curYm: string): T[] =>
  items.map((x) => (x.key === curYm ? { ...x, label: `${x.label}${CUR_MONTH_MARK}` } : x));

/* ══════════════ LTI — осолгүй ажилласан хүн-цаг ══════════════ */

/**
 * ХӨДӨЛМӨРИЙН ЧАДВАР ТҮР АЛДСАН (LTI) ОСОЛ — ослын ТӨРЛИЙН талбараас (`incident.turul`).
 *
 * ⚠️ 2026-10-09 (аудит): «Хөдөлмөрийн чадвар түр алдсан осолгүй ажилласан цаг» KPI нь
 *    урьд нь зүгээр Σ `Hun_tsag` (төслийн эхнээс) байсан — LTI гарсан ч тэглэгддэггүй тул
 *    шошгоо худал хэлдэг байв. Шошгыг захиалагч шийдсэн (`Habea.tsx` KPI-ийн ⚠️) тул тоог
 *    нь шошгод нийцүүлэв.
 * ⚠️ ТӨРӨЛ НЬ ЧӨЛӨӨТ БИЧВЭРТЭЙ домэйн («Ноцтой осол», «Амь нас эрсдэж болзошгүй байсан» …),
 *    LTI гэсэн тусдаа талбар/алдсан хоногийн талбар БАЙХГҮЙ. Иймд түлхүүр үгээр: ноцтой /
 *    үйлдвэрлэлийн осол, «чадвар … алдсан», нас барсан, «lost time». Осолд ДӨХСӨН,
 *    БОЛЗОШГҮЙ, эд хөрөнгийн ХОХИРОЛ нь LTI БИШ.
 * ⚠️ 2026-10-09 АМЬДААР БАТАЛСАН (`field_7` домэйн 8 + бодит 8 утга): LTI = «Ноцтой осол»,
 *    «Үйлдвэрлэлийн осол». LTI БИШ = «Амь нас/Хүний амь эрсдэж болзошгүй …», «Ноцтой байдалд
 *    хүргэж болзошгүй», «Осол дөхсөн тохиолдол», «Эд хөрөнгө(ийн)/өмчийн хохирол», «Галын
 *    тохиолдол», «Бусад», мөн «Эмнэлгийн/Эмнэлэгийн тусламж авсан (гэмтэл)» ба «Анхны тусламж
 *    авсан …» (MTI/FAI — хоног алдаагүй), «Моторт тээврийн хэрэгсэлийн осол» (хүний гэмтэл
 *    тодорхойгүй). Шинэ төрөл нэмэгдвэл ЭНД нэм.
 */
export const LTI_RE = /чадвар[^,;.]*алд|ноцтой\s*осол|үйлдвэрлэлийн\s*осол|нас\s*барс|амь\s*нас(аа)?\s*алд|lost[\s-]*time|\bLTI\b/i;
const NOT_LTI_RE = /болзошгүй|дөхсөн|near[\s-]*miss|хохирол/i;
/** Төрлийн ҮНДСЭН хэсэг — эхний хаалт/таслал/зураас хүртэл («Ноцтой осол (эд хөрөнгийн хохиролтой)» → «Ноцтой осол») */
const mainPart = (t: string): string => t.split(/[(,;/]|\s[—–-]\s/)[0] ?? t;
/**
 * ⚠️ 2026-10-09: ЭРЭМБЭ — «LTI биш» үг нь ҮНДСЭН төрөлд байвал л хасна. Урьд нь мөрийн ХААНА ч
 *    «хохирол» гарвал хасдаг тул «Үйлдвэрлэлийн осол, эд хөрөнгийн хохиролтой» LTI-ээс унах
 *    байв. Үндсэн хэсэг LTI бол дагалдах тайлбар хасахгүй; LTI үг зөвхөн дагалдах хэсэгт
 *    байвал (жиш. «Осол дөхсөн (ноцтой осол болох байсан)») хуучин дүрмээр бүтэн мөрийг шалгана.
 *    Амьд 14 төрлийн ангилал ӨӨРЧЛӨГДӨӨГҮЙ (`habeaRate.check`): LTI = «Ноцтой осол»,
 *    «Үйлдвэрлэлийн осол».
 */
export const isLtiType = (type: string): boolean => {
  if (!LTI_RE.test(type)) return false;
  const main = mainPart(type);
  if (LTI_RE.test(main)) return !NOT_LTI_RE.test(main);
  return !NOT_LTI_RE.test(type);
};

/**
 * СҮҮЛИЙН LTI-ЭЭС ХОЙШ ажилласан хүн-цаг — Σ `Hun_tsag`, `Ognoo` > сүүлийн LTI-ийн ӨДӨР.
 * LTI огт алга бол төслийн эхнээс (урьдын Σ-тэй ижил).
 * ⚠️ Огноогүй LTI байвал хил тодорхойгүй → `hours: null` («—», 0 БИШ).
 * ⚠️ Өдрийг `dayOf`-оор (Улаанбаатарын `ubDayKey`) — LTI гарсан өдрийн хүн-цаг ОРОХГҮЙ.
 * ⚠️ Дуудагч өдөрт НЭГ мөр өгнө (`latestRowPerDay`).
 * ⚠️ 2026-10-09: ИРЭЭДҮЙН огноотой LTI (`d > now` — бөглөхдөө оныг/сарыг андуурсан) ХИЛ
 *    БОЛОХГҮЙ — урьд нь «сүүлийн LTI» нь ирээдүйд гарч KPI 0 хэвээр гацдаг байв. Тоог
 *    `futureLti`-д буцаана — дуудагч ил тэмдэглэнэ.
 */
export function ltiFreeHours(
  labor: readonly Row[],
  incidents: readonly { d: number; type: string }[],
  dayOf: (ms: number) => string,
  now: number = Date.now(),
): { hours: number | null; since: number | null; undatedLti: boolean; futureLti: number } {
  const L = HABEA.labor.fields;
  const all = incidents.filter((x) => isLtiType(x.type));
  const futureLti = all.filter((x) => x.d > now).length;
  const lti = all.filter((x) => !(x.d > now));
  if (lti.some((x) => !(x.d > 0))) return { hours: null, since: null, undatedLti: true, futureLti };
  const since = lti.length ? Math.max(...lti.map((x) => x.d)) : null;
  const cut = since == null ? null : dayOf(since);
  let hours = 0;
  for (const r of labor) {
    const h = numOrNull(r[L.hunTsag]);
    if (h == null) continue;
    if (cut != null) {
      const ms = numOrNull(r[L.ognoo]);
      if (ms == null || ms <= 0 || dayOf(ms) <= cut) continue;
    }
    hours += h;
  }
  return { hours, since, undatedLti: false, futureLti };
}
