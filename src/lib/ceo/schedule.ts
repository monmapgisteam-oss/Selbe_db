/**
 * CEO ҮЗҮҮЛЭЛТ — «ХУВААРИЙН ХОЦРОГДОЛ»: багц бүрийн ТӨЛӨВЛӨСӨН vs БОДИТ биет
 * гүйцэтгэл (пункт) ба цаг хугацааны хоцрогдол (сар).
 *
 * ⚠️ ХОЁР үзүүлэлт НЭГ картад (`registry.ts`-ийн шийдвэр, 2026-09-06):
 *    «гүйцэтгэлийн зөрүү» (пп) ба «төлөвлөгөө/гүйцэтгэлийн хоцрогдол» (сар)
 *    хоёул НЭГ эх сурвалжаас (`lagOf`) гардаг тул тусдаа карт болговол нэг
 *    зүйлийн тухай хоёр өөр тоо зэрэгцэн зогсоно.
 *
 * Эх сурвалж (бүгд бэлэн, багцын түвшинд) — ГАНЦ ачаалагч `loadFinData`:
 *   · гэрээний мөрүүд (Cashflow_0904) + IPC + биет гүйцэтгэл
 *   · `contractMonths` / `lagOf` / `lagLevel` (`Finance.tsx`) — сар бүрийн
 *     цэг, хоцрогдол (төл. − бодит, пп), 10/5 босго
 *   · хуваарийн муруй (`planProgress.loadPlanCurve`) — `loadFinData` ДОТОР
 *     татагдаж Finance-ийн модуль-түвшний `planCurveCache`-д хадгалагдана;
 *     энэ файл түүнийг `lagOf`-оор УНШИНА (доорх ⚠️), ӨӨРӨӨ ДАХИН ТАТАХГҮЙ.
 *
 * ⚠️ `Finance.tsx`-ийг ДИНАМИК импортлоно (`await import`). Тэр файл .tsx
 *    (React) тул Node-ийн `--experimental-transform-types` ачаалж чадахгүй —
 *    статик импортлбол `schedule.check.mjs` энэ файлыг огт нээж чадахгүй.
 *    Ачаалагчийн бие л Finance-ыг дуудна; цэвэр тооцоо (`computeSchedule`)
 *    түүнээс хамаарахгүй. `lagLevel` босгыг ЭНД ХУУЛБАРЛАХГҮЙ — функцээр
 *    дамжуулна (`kpiLevels.ts`: «`lagLevel` нь Finance.tsx-д үлдэнэ»).
 *
 * ⚠️ `lagOf` нь `Finance.tsx`-ийн МОДУЛЬ-ТҮВШНИЙ `planCurveCache`-ээс уншдаг
 *    бөгөөд тэр кэш `loadFinData()` дотор бөглөгддөг. Тиймээс `lagOf`-ыг
 *    ЗААВАЛ `loadFinData()` амжилттай дууссаны ДАРАА дуудна — эс тэгвээс
 *    бүх багц «хэмжилтгүй» болно (Finance.tsx-ийн тайлбар).
 *
 * ⚠️ МУРУЙГ `lagOf`-ООР УНШИХ (2026-09-06, хяналтын олдвор): урьд нь энэ
 *    файл `loadPlanCurve`-ийг ӨӨРӨӨ ДАХИН татдаг байв (10 хуудас ×
 *    (loadSchema + query) — `loadFinData` дотор аль хэдийн татагдсаныг
 *    давхардуулж), мөн хоёр тусдаа татсан муруй хооронд засвар орвол
 *    зөрж, доорх сорил худал «унасан» гэж дүгнэх байв. `planCurveCache` нь
 *    экспортлогдоогүй (Finance.tsx энэ агентын эзэмшилд биш) тул муруйг
 *    `lagOf`-ийн НИЙТИЙН гэрээгээр уншина: `[{label, phys: 0, pkg}]` гэсэн
 *    зохиомол нэг цэг өгвөл `planned` = тэр сар, тэр багцын хуваарийн % —
 *    хэмжилтийн сараас сар сараар УХАРЧ `null` болтол (муруйн эхлэл, `pct
 *    ≤ 0`) уншвал багцын муруйн эхлэлээс хэмжилтийн сар хүртэлх ХЭСЭГ
 *    гарна (`curveViaLag`). Сарын хоцрогдолд яг энэ хэсэг л хэрэгтэй:
 *    лавлах сар нь хэмжилтийн сараас хойш байвал хоцрогдол 0 угаасаа.
 *    Ингэснээр муруй ГАНЦ эх сурвалжтай (Finance-ийн кэш) — пп-ийн зөрүү ба
 *    сарын хоцрогдол нэг муруйнаас, давхар сүлжээний дуудлагагүй.
 *    Хуваарийн муруй ӨССӨН (монотон) — ухарч `null` таарвал түүнээс өмнөх
 *    сарууд ч 0 гэж үзнэ; `planProgress.planAt` шугаман интерполяци тул
 *    энэ таамаг баталгаатай.
 *
 * ⚠️ FINANCE-ИЙН МУРУЙ ДУУГҮЙ УНАДАГ: `loadFinDataRaw` нь `loadPlanCurve`-ийн
 *    алдааг ЗАЛГИЖ `planCurveCache = null` үлдээдэг (санаатай — санхүүгийн
 *    бүх дата хуваарийн улмаас унах ёсгүй). Тэр үед `lagOf` БҮХ багцад
 *    `null` буцаана: карт «—» / unknown / бүх багц «хэмжилтгүй» болох ч
 *    `loadFinData` өөрөө амжилттай тул `failedSources` ХООСОН үлдэх байв —
 *    `kpi.ts` хэсэгчилсэн уналтыг нуухыг хориглодог. Кэшийн төлөвийг
 *    СОРИЛООР илрүүлнэ (`curveProbe`): ӨНӨӨДРИЙН сар, `phys = 0`, `pkg`
 *    байхгүй (→ төслийн нийт муруй) гэсэн нэг цэгийг `lagOf`-д өгнө; `null`
 *    ирвэл кэш хоосон ЭСВЭЛ төслийн хуваарь өнөөдрийг хүртэл огт эхлээгүй —
 *    аль ч тохиолдолд ЯМАР Ч багцын хоцрогдол бодогдох боломжгүй (муруй
 *    өссөн тул өнөөдөр 0 бол өмнөх сар бүр 0) тул хоёуланг нь «муруй
 *    уншигдсангүй» гэж НЭГ шалтгаанд нэгтгэнэ — `failedSources`-д
 *    «Хуваарийн муруй (Санхүүжилт)» нэрлэгдэж, биет бичилттэй багцуудын
 *    шалтгаан «хоцрогдлын муруй уншигдсангүй» болно. Нуухаас илүү нэрлэх нь
 *    дээр гэсэн санаатай сонголт.
 *
 * ⚠️ `null` ≠ 0: `lagOf` `null` буцаасан багц нь «хэмжилтгүй» — хоцрогдол 0
 *    БИШ. Тэднийг тусдаа хүснэгтэд НЭРЭЭР нь жагсаана, тоолуурт оруулахгүй.
 *    Зөвхөн 7 барилга угсралтын багц биет гүйцэтгэлтэй; дэд бүтцийн гэрээнүүд
 *    «хэмжилтгүй» гарах нь ХҮЛЭЭГДСЭН зан.
 *
 * ⚠️ Хувийн масштаб: `lag.planned` / `lag.actual` хоёул 0–100 (`PlanPoint.pct`
 *    ба `MonthPt.phys` — `(sum/cnt)*100`). `pct()` 100-аар үржүүлдэггүй тул
 *    шууд дамжуулна.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { num, text } from '@/lib/format';
import { CASHFLOW_NEW, pkgKeyOf } from '@/lib/services';
import type { PlanPoint } from '@/lib/planProgress';
import { levelLabel, type Level } from '@/lib/kpiLevels';
import type { MonthPt } from '@/modules/Finance';
import { cell, table, type Cell, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════ Төрөл ══════════════ */

/** `lagOf`-ийн үр дүн — сар · төлөвлөсөн % · бодит % · зөрүү (төл. − бодит, пп) */
export type Lag = { month: string; planned: number; actual: number; gap: number };

/** `lagLevel`-ийн үр дүн: ≥10 пп улаан, 5–10 шар, бусад нь дохио биш */
export type LagTone = 'red' | 'yellow' | null;

/** `Finance.lagOf`-ийн хэлбэр — ачаалагч жинхэнэ, шалгуур хуулбар өгнө */
export type LagOfFn = (months: MonthPt[]) => Lag | null;

/** Багцын түлхүүр (`PkgLag.curveKey`) → муруйн ХЭСЭГ (эхлэлээс хэмжилтийн сар хүртэл) */
export type CurveMap = ReadonlyMap<string, readonly PlanPoint[]>;

/** Нэг багц (гэрээний мөрөөр дедупласан) — ачаалагч угсарна, тооцоо уншина */
export type PkgLag = {
  /** `pkgKeyOf(pkg2) || pkgKeyOf(pkg)` — дедуплах түлхүүр */
  key: string;
  /**
   * Хуваарийн муруйг ХАЙХ түлхүүр — `MonthPt.pkg` (`lagOf` яг үүгээр хайдаг).
   * ⚠️ `key`-ээс ЯЛГААТАЙ байж болно: `contractMonths` нь биет гүйцэтгэл
   *    ОЛДСОН багцын түлхүүрийг тавьдаг (`phys.has(k2) ? k2 : k3`). Сарын
   *    хоцрогдлыг `lagOf`-ийн хэрэглэсэн муруйгаас л бодох ёстой.
   */
  curveKey: string;
  /** Дэлгэцийн нэр — `pkg2 || pkg` текст */
  label: string;
  /** `null` = хэмжилтгүй (хоцрогдол 0 БИШ) */
  lag: Lag | null;
  /** Ямар нэг сард биет хэмжилт бий юу — «хэмжилтгүй»-н шалтгааныг ялгахад */
  hasPhys: boolean;
};

/** Хэмжигдсэн нэг багцын мөр */
export type SchedulePkg = {
  key: string;
  label: string;
  month: string;
  planned: number;
  actual: number;
  /** төл. − бодит, пп (эерэг = хоцорсон) */
  gap: number;
  /** Сарын хоцрогдол — муруй байхгүй бол null */
  slipMonths: number | null;
  tone: LagTone;
};

/* ══════════════ Цэвэр туслахууд ══════════════ */

/** «YYYY-MM» хоёрын сарын зөрүү (to − from); эвдэрсэн шошго бол null */
export function monthsBetween(from: string, to: string): number | null {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (![fy, fm, ty, tm].every((v) => Number.isFinite(v))) return null;
  return (ty - fy) * 12 + (tm - fm);
}

/** «YYYY-MM» → тухайн сарын СҮҮЛИЙН өдөр, UTC ms; эвдэрсэн бол null */
export function monthEndMs(label: string): number | null {
  const [y, m] = label.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return Date.UTC(y, m, 0);
}

/** «YYYY-MM» → ӨМНӨХ сар; эвдэрсэн бол null */
export function prevYm(label: string): string | null {
  const [y, m] = label.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * 1 орны нарийвчлал.
 * ⚠️ `|| 0` нь `-0`-ийг арилгана — `num(-0)` нь «-0» гэж хэвлэдэг.
 */
const r1 = (v: number): number => (Math.round(v * 10) / 10) || 0;

/** Тэмдэгтэй пункт: −12.3 · +2.0 · 0.0 (U+2212 хасах тэмдэг) */
const pp = (v: number): string => {
  const x = r1(v);
  return x < 0 ? `−${num(-x, 1)}` : x > 0 ? `+${num(x, 1)}` : num(0, 1);
};

/**
 * САРЫН ХОЦРОГДОЛ — бодит гүйцэтгэлийн хувьд хуваариар ХЭЗЭЭ хүрэх ёстой
 * байсныг олж, хэмжилтийн сартай зөрүүлнэ.
 *
 * ДҮРЭМ (⚠️ санаатай шийдвэрүүд, 2026-09-06):
 *   1. Муруйн ЭХЛЭЛ = `pct > 0` болсон эхний сар. Тэнхлэг нь төслийн бүх
 *      хуваарийн хамгийн эрт огнооноос эхэлдэг тул хожуу эхлэх багцын муруй
 *      урд талдаа 0-үүдтэй (`planAt` эхлэхээс өмнө 0 буцаадаг). Тэднийг
 *      тоолбол «төсөл эхлэхээс өмнөх» саруудыг хоцрогдол гэж худал нэмнэ.
 *   2. Лавлах сар = эхлэлээс хойш `pct ≥ actual` болсон ЭХНИЙ сар.
 *      `slip = хэмжилтийн сар − лавлах сар`, сөрөг бол 0 (түрүүлж байна).
 *   3. Бодит нь эхний цэгээс ч доогуур (жиш. 0%) → лавлах сар нь муруйн
 *      эхлэл өөрөө → хоцрогдол = хуваарь эхэлснээс хойшхи сарууд
 *      («хуваарь эхэлсэн, юу ч хийгдээгүй»). Энэ нь 2-р дүрмээс өөрөө гарна.
 *   4. Бодит нь муруйн БҮХ цэгээс дээш → 0 (бүхэл хуваариасаа түрүүлсэн).
 *      ⚠️ `curveViaLag`-ийн ХЭСЭГ муруй (хэмжилтийн сар хүртэл) дээр ч энэ
 *      дүрэм зөв: лавлах сар хэмжилтийн сараас хойш байвал зөрүү сөрөг → 0.
 *   5. Муруй байхгүй / бүхэлдээ 0 / шошго эвдэрсэн → `null` (0 БИШ).
 */
export function slipMonthsOf(
  series: readonly PlanPoint[] | undefined,
  actual: number,
  month: string,
): number | null {
  if (!series?.length) return null;
  const start = series.findIndex((p) => p.pct > 0);
  if (start < 0) return null;
  let ref: string | null = null;
  for (let i = start; i < series.length; i += 1) {
    const p = series[i];
    if (p && p.pct >= actual) { ref = p.label; break; }
  }
  if (ref == null) return 0;
  const d = monthsBetween(ref, month);
  return d == null ? null : Math.max(0, d);
}

/** Дохио → түвшин: улаан = яаралтай, шар = анхаарах, бусад нь хэвийн */
const toneLevel = (t: LagTone): Level => (t === 'red' ? 'bad' : t === 'yellow' ? 'warn' : 'good');

/** epoch ms → «YYYY-MM» (UTC) — `lagOf`-ийн `nowYm`-тэй ИЖИЛ дүрэм */
export const ymOf = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

/**
 * `lagOf`-оор муруйг УНШИХ зохиомол цэг: `phys = 0` (хэмжилт, null биш —
 * `lagOf` тэр сарыг сонгоно), `planned` = тухайн сар, тухайн багцын хуваарийн
 * %. `pkg` байхгүй бол төслийн нийт муруй.
 * ⚠️ `given: 0` нь зөвхөн төрлийн шаардлага — `lagOf` мөнгийг огт уншдаггүй.
 * ⚠️ `label ≤ өнөөдөр` байх ёстой — `lagOf` ирээдүйн сарыг үл тоодог.
 */
export const lagPoint = (label: string, pkg?: string): MonthPt[] => (
  pkg == null ? [{ label, given: 0, phys: 0 }] : [{ label, given: 0, phys: 0, pkg }]
);

/**
 * FINANCE-ИЙН МУРУЙН КЭШИЙГ СОРИХ ЦЭГ (толгойн ⚠️-г унш) — өнөөдрийн сар,
 * төслийн нийт муруй. `lagOf` `null` буцаавал кэш хоосон (эсвэл хуваарь
 * өнөөдрийг хүртэл эхлээгүй — аль ч үед хоцрогдол бодогдохгүй).
 */
export const curveProbe = (nowYm: string): MonthPt[] => lagPoint(nowYm);

/** `curveViaLag`-ийн ухрах дээд хязгаар — `planProgress`-ийн тэнхлэгийн 120 сартай ижил */
export const CURVE_CAP = 120;

/**
 * Багцын хуваарийн муруйн ХЭСГИЙГ Finance-ийн кэшээс `lagOf`-оор угсарна:
 * `month`-оос сар сараар ухарч, `lagOf` `null` (муруй эхлээгүй / багцад
 * хуваарь алга / кэш хоосон) болтол. Үр дүн нь [эхлэл … `month`], бүх
 * цэг `pct > 0`; юу ч уншигдаагүй бол `undefined` (хоосон массив БИШ — «муруй
 * алга»-г ялгахад). Толгойн ⚠️ «МУРУЙГ lagOf-ООР УНШИХ»-ийг унш.
 *
 * ⚠️ `month` нь өнөөдрөөс хойш байж болохгүй (`lagOf` ирээдүйг үл тоодог) —
 *    дуудагч `lag.month` (үргэлж ≤ өнөөдөр) эсвэл `ymOf(now)` өгнө.
 */
export function curveViaLag(
  lagOfFn: LagOfFn,
  curveKey: string,
  month: string,
  cap = CURVE_CAP,
): PlanPoint[] | undefined {
  const pts: PlanPoint[] = [];
  let label: string | null = month;
  for (let i = 0; i < cap && label != null; i += 1) {
    const r = lagOfFn(lagPoint(label, curveKey));
    if (!r) break;
    /* ⚠️ `vol` нь ЭНД хамаарахгүй — KPI зөвхөн хувийг хардаг */
    pts.unshift({ label, pct: r.planned, vol: null });
    label = prevYm(label);
  }
  return pts.length ? pts : undefined;
}

/**
 * Гэрээний мөрүүд → багц бүрийн хоцрогдол (дедупласан).
 *
 * ⚠️ `execMetrics`-ийн хуучин гогцоотой ИЖИЛ дүрэм: түлхүүр нь
 *    `pkgKeyOf(pkg2) || pkgKeyOf(pkg)`; `pkgKeyOf` (bagtsKey БИШ) — «БАГЦ 1-4»
 *    мэт диапазон мөр хоосон түлхүүртэй болж алгасагдана (эс тэгвээс
 *    «БАГЦ14» болж бодит Багц 14-ийн оронд тоологддог байв). Нэг багцад олон
 *    гэрээ (зураг төсөл + ажил) → ЭХНИЙ мөр л үлдэнэ.
 *
 * ⚠️ `monthsOf`/`lagOfFn`-ийг ГАДНААС авна (Finance.tsx динамик импорт) —
 *    тиймээс энэ функц Node дээр туршигдана. Мөрийн төрөл нь Finance-ийн
 *    `Record<string, unknown>` (`query.Row`-оос өргөн) тул генерик.
 */
export function collectPkgLags<R extends Record<string, unknown>>(
  contracts: readonly R[],
  monthsOf: (r: R) => MonthPt[],
  lagOfFn: LagOfFn,
): PkgLag[] {
  const C = CASHFLOW_NEW.fields;
  const seen = new Set<string>();
  const out: PkgLag[] = [];
  for (const r of contracts) {
    const key = pkgKeyOf(r[C.pkg2]) || pkgKeyOf(r[C.pkg]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const months = monthsOf(r);
    out.push({
      key,
      curveKey: months.find((m) => m.pkg)?.pkg ?? key,
      label: text(r[C.pkg2], '') || text(r[C.pkg], ''),
      lag: lagOfFn(months),
      hasPhys: months.some((m) => m.phys != null),
    });
  }
  return out;
}

/**
 * Багц бүрийн муруйн хэсгийг `lagOf`-оор уншиж угсарна (`curveViaLag`).
 * Хэмжигдсэн багцад хэмжилтийн сар хүртэл, хэмжилтгүйд өнөөдөр хүртэл —
 * сүүлийнх нь зөвхөн «хуваарь алга» шалтгааныг ялгахад хэрэгтэй.
 */
export function collectCurves(pkgs: readonly PkgLag[], lagOfFn: LagOfFn, nowYm: string): CurveMap {
  const out = new Map<string, readonly PlanPoint[]>();
  for (const p of pkgs) {
    if (out.has(p.curveKey)) continue;
    const s = curveViaLag(lagOfFn, p.curveKey, p.lag?.month ?? nowYm);
    if (s) out.set(p.curveKey, s);
  }
  return out;
}

/* ══════════════ Цэвэр тооцоо ══════════════ */

/**
 * Багцуудын хоцрогдол → картын бүтэн үр дүн. Сүлжээгүй, `Date.now()`-гүй.
 *
 * @param curves багцын түлхүүр → муруйн хэсэг (`collectCurves`); байхгүй
 *   түлхүүр = муруй алга → сарын хоцрогдол `null`.
 * @param lagLevelFn `Finance.lagLevel` — босго ГАНЦ эх сурвалжтай үлдэхийн
 *   тулд функцээр авна (дээрх тайлбар).
 * @param now зөвхөн `asOf`-ыг ирээдүй рүү гаргахгүйн тулд.
 * @param finCurveMissing Finance-ийн `planCurveCache` хоосон гэж сорилоор
 *   тогтоогдсон (толгойн ⚠️) — биет бичилттэй багцын шалтгааныг ялгахад.
 */
export function computeSchedule(
  pkgs: readonly PkgLag[],
  curves: CurveMap,
  lagLevelFn: (gap: number) => LagTone,
  now: number,
  failedSources: readonly string[] = [],
  finCurveMissing = false,
): KpiResult {
  const measured: SchedulePkg[] = [];
  const noData: PkgLag[] = [];
  for (const p of pkgs) {
    if (!p.lag) { noData.push(p); continue; }
    measured.push({
      key: p.key,
      label: p.label,
      month: p.lag.month,
      planned: p.lag.planned,
      actual: p.lag.actual,
      gap: p.lag.gap,
      slipMonths: slipMonthsOf(curves.get(p.curveKey), p.lag.actual, p.lag.month),
      tone: lagLevelFn(p.lag.gap),
    });
  }
  /* Хамгийн муу нь дээр; тэнцвэл нэрээр */
  measured.sort((a, b) => (b.gap - a.gap) || a.label.localeCompare(b.label));

  const red = measured.filter((m) => m.tone === 'red').length;
  const yellow = measured.filter((m) => m.tone === 'yellow').length;
  /* ⚠️ Хэмжилтгүй бол null — 0 гэж «хоцрогдолгүй» гэсэн худал дүгнэлт болно */
  const worstGap = measured.length ? Math.max(...measured.map((m) => m.gap)) : null;
  const avgGap = measured.length
    ? measured.reduce((s, m) => s + m.gap, 0) / measured.length
    : null;

  /* ── Баримт: зөвхөн тоо бүхий богино хэсгүүд ── */
  const facts: string[] = [];
  if (measured.length) {
    facts.push(tr('{0} яаралтай · {1} анхаарах', num(red), num(yellow)));
    if (worstGap != null) facts.push(tr('хамгийн муу {0} пп', pp(-worstGap)));
    if (avgGap != null && measured.length > 1) facts.push(tr('дундаж {0} пп', pp(-avgGap)));
  }
  if (noData.length) facts.push(tr('{0} багц хэмжилтгүй', num(noData.length)));

  /* ── Түвшин ── */
  const level: Level = red > 0 ? 'bad' : yellow > 0 ? 'warn' : measured.length ? 'good' : 'unknown';

  /* ── Хүснэгт 1: хэмжигдсэн БҮХ багц, хамгийн муу нь дээр ── */
  const rows: Cell[][] = measured.map((m) => [
    cell(m.label),
    cell(m.month),
    cell(m.planned, 'pct'),
    cell(m.actual, 'pct'),
    /* Тэмдэгтэй: сөрөг = хоцорсон (баримт/анхааруулгын «−пп»-тэй ижил хэл) */
    cell(r1(-m.gap), 'count'),
    cell(m.slipMonths, 'count'),
    cell(levelLabel(toneLevel(m.tone))),
  ]);

  /* ── Хүснэгт 2: хэмжилтгүй багц бүр НЭРЭЭР, шалтгаантай ── */
  const reasonOf = (p: PkgLag): string => {
    if (!p.hasPhys) return tr('гүйцэтгэлийн бичилт алга');
    /* Бичилт бий, гэвч Finance-ийн муруй ирээгүй → `lagOf` бүгдэд null (толгойн ⚠️) */
    if (finCurveMissing) return tr('хоцрогдлын муруй уншигдсангүй');
    /* Бичилт бий, өнөөдрийг хүртэл энэ багцад хуваарийн % уншигдсангүй */
    if (!curves.get(p.curveKey)?.length) return tr('хуваарь алга');
    return tr('хуваарь эсвэл гүйцэтгэлийн бичилт алга');
  };
  const noRows: Cell[][] = [...noData]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((p) => [cell(p.label), cell(reasonOf(p))]);

  const tables = [
    table(
      tr('Багц бүрээр'),
      [tr('Багц'), tr('Сар'), tr('Төлөвлөсөн %'), tr('Бодит %'), tr('Зөрүү пп'), tr('Хоцрогдол (сар)'), tr('Түвшин')],
      rows,
    ),
    table(tr('Хэмжилтгүй багц'), [tr('Багц'), tr('Шалтгаан')], noRows),
  ];

  /* ── Анхааруулга: улаан багц бүр нэрээр ── */
  const issues: KpiIssue[] = measured
    .filter((m) => m.tone === 'red')
    .map((m) => ({
      text: tr('{0} — төл. {1}% / бодит {2}% · −{3} пп', m.label, num(m.planned, 1), num(m.actual, 1), num(m.gap, 1)),
      tone: 'bad' as const,
    }));

  /* ── asOf: хамгийн сүүлийн хэмжилтийн сарын эцэс, ирээдүй рүү гаргахгүй ── */
  let asOf: number | null = null;
  for (const m of measured) {
    const ms = monthEndMs(m.month);
    if (ms != null && (asOf == null || ms > asOf)) asOf = ms;
  }
  if (asOf != null && asOf > now) asOf = now;

  return {
    /* ⚠️ Хэмжигдсэн багц огт байхгүй бол «—» — «0 багц хоцорсон» гэж худал хэлэхгүй */
    value: measured.length ? num(red + yellow) : '—',
    unit: tr('багц хоцорсон'),
    facts,
    level,
    tables,
    issues,
    asOf,
    failedSources: [...failedSources],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

const SRC_FIN = () => tr('Санхүүжилт (Cashflow · IPC · гүйцэтгэл)');
/** Finance.tsx-ийн ДОТООД муруйн кэш — сорилоор илэрдэг (толгойн ⚠️) */
const SRC_FIN_CURVE = () => tr('Хуваарийн муруй (Санхүүжилт)');

/**
 * ⚠️ Санхүүжилт (гэрээ + биет гүйцэтгэл + муруй) нь ГАНЦ ачаалагч
 *    (`loadFinData`) — уншигдахгүй бол ШИДНЭ, тооцох зүйл огт үлдэхгүй.
 *    Finance-ийн ДОТООД муруй унавал (алдаа нь залгигддаг) `loadFinData`
 *    амжилттай ч пп-ийн зөрүү, сарын хоцрогдол хоёул гарахгүй — сорилоор
 *    илрүүлж `failedSources`-д нэрлэнэ, карт «—»/unknown гарна.
 * ⚠️ Таг: `loadFinData`-ийнхтай ИЖИЛ (IPC · Cashflow · бөглөх хуудас) —
 *    муруй нь бөглөх хуудасны хуваариас тул `BAGTS_SHEET` бичилт үүнийг ч
 *    хүчингүй болгоно.
 */
export const loadScheduleKpi = cached(async (): Promise<KpiResult> => {
  /* ⚠️ Динамик — толгойн тайлбарыг унш (Finance.tsx нь .tsx) */
  const F = await import('@/modules/Finance');
  let fin: Awaited<ReturnType<typeof F.loadFinData>>;
  try {
    fin = await F.loadFinData();
  } catch {
    throw new Error(tr('{0} уншигдсангүй', SRC_FIN()));
  }
  const now = Date.now();
  const nowYm = ymOf(now);
  /* ⚠️ `lagOf`-ыг `loadFinData` ДУУССАНЫ дараа — planCurveCache бөглөгдсөн */
  const finCurveMissing = F.lagOf(curveProbe(nowYm)) == null;
  const failed = finCurveMissing ? [SRC_FIN_CURVE()] : [];
  const pkgs = collectPkgLags(fin.contracts, (r) => F.contractMonths(r, fin), F.lagOf);
  const curves = collectCurves(pkgs, F.lagOf, nowYm);
  return computeSchedule(pkgs, curves, F.lagLevel, now, failed, finCurveMissing);
}, 60_000, ['BAGTS_SHEET', 'CASHFLOW_NEW', 'IPC_LOG']);
