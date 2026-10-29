/**
 * CEO ҮЗҮҮЛЭЛТ — «ХУВААРИЙН ХОЦРОГДОЛ»: багц бүрийн ТӨЛӨВЛӨСӨН vs БОДИТ биет
 * гүйцэтгэл (пункт) ба цаг хугацааны хоцрогдол (сар).
 *
 * Эх сурвалж (бүгд бэлэн, багцын түвшинд) — ГАНЦ ачаалагч `loadFinData`:
 *   · гэрээний мөрүүд (Cashflow_0909) + IPC + биет гүйцэтгэл
 *   · `contractMonths` / `lagOf` / `lagLevel` (`Finance.tsx`) — сар бүрийн
 *     цэг, хоцрогдол (төл. − бодит, пп), 10/5 босго
 *   · хуваарийн муруй (`planProgress.loadPlanCurve`) — `loadFinData` ДОТОР
 *     татагдаж Finance-ийн модуль-түвшний `planCurveCache`-д хадгалагдана;
 *     энэ файл түүнийг `lagOf`-оор УНШИНА (доорх), ӨӨРӨӨ ДАХИН ТАТАХГҮЙ.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached, SESSION_TTL_MS } from '@/lib/live';
import { num, text, monthKey } from '@/lib/format';
import { CASHFLOW_NEW, pkgKeyOf } from '@/lib/services';
import { FIN_XL_TOTAL_CODE_FIELD } from '@/lib/finExcelLayout';
import { coverageOk, type PlanPoint } from '@/lib/planProgress';
import { levelLabel, type Level } from '@/lib/kpiLevels';
import type { MonthPt } from '@/modules/Finance';
import { cell, table, kpiComplete, type Cell, type KpiIssue, type KpiResult } from './kpi';
import { gapPts } from '@/lib/gdash';

/* ══════════════ Төрөл ══════════════ */

/**
 * `lagOf`-ийн үр дүн — сар · төлөвлөсөн % · бодит % · зөрүү (төл. − бодит, пп).
 */
export type Lag = { month: string; planned: number; actual: number; gap: number; coverage?: number | null };

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
  coverage: number | null;
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
 */
const r1 = (v: number): number => (Math.round(v * 10) / 10) || 0;


/**
 * САРЫН ХОЦРОГДОЛ — бодит гүйцэтгэлийн хувьд хуваариар ХЭЗЭЭ хүрэх ёстой
 * байсныг олж, хэмжилтийн сартай зөрүүлнэ.
 *
 * ДҮРЭМ (санаатай шийдвэрүүд, 2026-09-06):
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

/**
 * epoch ms → «YYYY-MM» ОРОН НУТГИЙН сар — `Finance.lagOf`-ийн `nowYm` (`monthKey`)-тэй
 * ЯГ ИЖИЛ дүрэм.
 */
export const ymOf = (ms: number): string => monthKey(ms);

/**
 * `lagOf`-оор муруйг УНШИХ зохиомол цэг: `phys = 0` (хэмжилт, null биш —
 * `lagOf` тэр сарыг сонгоно), `planned` = тухайн сар, тухайн багцын хуваарийн
 * %. `pkg` байхгүй бол төслийн нийт муруй.
 */
export const lagPoint = (label: string, pkg?: string): MonthPt[] => (
  pkg == null ? [{ label, given: 0, phys: 0, physAt: `${label}-31` }] : [{ label, given: 0, phys: 0, physAt: `${label}-31`, pkg }]
);

/**
 * FINANCE-ИЙН МУРУЙН КЭШИЙГ СОРИХ ЦЭГ (толгой-г унш) — өнөөдрийн сар,
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
 * алга»-г ялгахад). Толгой «МУРУЙГ lagOf-ООР УНШИХ»-ийг унш.
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
    pts.unshift({ label, pct: r.planned, vol: null });
    label = prevYm(label);
  }
  return pts.length ? pts : undefined;
}

/**
 * Гэрээний мөрүүд → багц бүрийн хоцрогдол (дедупласан).
 */
export function collectPkgLags<R extends Record<string, unknown>>(
  contracts: readonly R[],
  monthsOf: (r: R) => MonthPt[],
  lagOfFn: LagOfFn,
  prefer?: (r: R) => boolean,
): PkgLag[] {
  const C = CASHFLOW_NEW.fields;
  /** түлхүүр → төлөөлөгч мөр (`prefer` тэнцсэн нь давуу) */
  const rep = new Map<string, { r: R; preferred: boolean }>();
  for (const r of contracts) {
    const key = pkgKeyOf(r[C.pkg2]) || pkgKeyOf(r[C.pkg]);
    if (!key) continue;
    const preferred = prefer ? prefer(r) : false;
    const cur = rep.get(key);
    if (!cur) rep.set(key, { r, preferred });
    else if (preferred && !cur.preferred) rep.set(key, { r, preferred });
  }
  const out: PkgLag[] = [];
  for (const [key, { r }] of rep) {
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
 * БАРИЛГА УГСРАЛТЫН МӨР МӨН ҮҮ — Excel-ийн 1-р түвшний код «2» (`bagts_tuvshin1`).
 */
export const FIN_XL_BUILD_CODE = '2';
export const isBuildRow = (r: Record<string, unknown>): boolean =>
  String(r[FIN_XL_TOTAL_CODE_FIELD] ?? '').trim() === FIN_XL_BUILD_CODE;

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
 * Багцуудын хоцрогдол → картын бүтэн үр дүн. Сүлжээгүй, `Date.now`-гүй.
 *
 * @param curves багцын түлхүүр → муруйн хэсэг (`collectCurves`); байхгүй
 *   түлхүүр = муруй алга → сарын хоцрогдол `null`.
 * @param lagLevelFn `Finance.lagLevel` — босго ГАНЦ эх сурвалжтай үлдэхийн
 *   тулд функцээр авна (дээрх тайлбар).
 * @param now зөвхөн `asOf`-ыг ирээдүй рүү гаргахгүйн тулд.
 * @param finCurveMissing Finance-ийн `planCurveCache` хоосон гэж сорилоор
 *   тогтоогдсон (толгой) — биет бичилттэй багцын шалтгааныг ялгахад.
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
  const partial: SchedulePkg[] = [];
  const noData: PkgLag[] = [];
  for (const p of pkgs) {
    if (!p.lag) { noData.push(p); continue; }
    const judged = coverageOk(p.lag.coverage);
    (judged ? measured : partial).push({
      key: p.key,
      label: p.label,
      month: p.lag.month,
      planned: p.lag.planned,
      actual: p.lag.actual,
      gap: p.lag.gap,
      slipMonths: judged ? slipMonthsOf(curves.get(p.curveKey), p.lag.actual, p.lag.month) : null,
      tone: judged ? lagLevelFn(p.lag.gap) : null,
      coverage: p.lag.coverage ?? null,
    });
  }
  /* Хамгийн муу нь дээр; тэнцвэл нэрээр */
  measured.sort((a, b) => (b.gap - a.gap) || a.label.localeCompare(b.label));

  const red = measured.filter((m) => m.tone === 'red').length;
  const yellow = measured.filter((m) => m.tone === 'yellow').length;
  const worstGap = measured.length ? Math.max(...measured.map((m) => m.gap)) : null;
  const avgGap = measured.length
    ? measured.reduce((s, m) => s + m.gap, 0) / measured.length
    : null;

  /* ── Баримт: зөвхөн тоо бүхий богино хэсгүүд ── */
  const facts: string[] = [];
  if (measured.length) {
    facts.push(tr('{0} яаралтай · {1} анхаарах', num(red), num(yellow)));
    if (worstGap != null) facts.push(tr('хамгийн муу {0}', gapPts(worstGap)));
    if (avgGap != null && measured.length > 1) facts.push(tr('дундаж {0}', gapPts(avgGap)));
  }
  if (partial.length) facts.push(tr('{0} багцын хуваарь дутуу — дүгнээгүй', num(partial.length)));
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
    /* Бичилт бий, гэвч Finance-ийн муруй ирээгүй → `lagOf` бүгдэд null (толгой) */
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
  if (partial.length) {
    tables.push(table(
      tr('Хуваарь дутуу — дүгнээгүй'),
      [tr('Багц'), tr('Сар'), tr('Төлөвлөсөн %'), tr('Бодит %'), tr('Хуваарийн хамралт')],
      [...partial]
        .sort((a, b) => (a.coverage ?? -1) - (b.coverage ?? -1) || a.label.localeCompare(b.label))
        .map((m) => [cell(m.label), cell(m.month), cell(m.planned, 'pct'), cell(m.actual, 'pct'), cell(m.coverage, 'pct')]),
    ));
  }

  /* ── Анхааруулга: улаан багц бүр нэрээр ── */
  const issues: KpiIssue[] = measured
    .filter((m) => m.tone === 'red')
    .map((m) => ({
      text: tr('{0} — төл. {1}% / бодит {2}% · {3}', m.label, num(m.planned, 1), num(m.actual, 1), gapPts(m.gap)),
      tone: 'bad' as const,
    }));

  /* ── asOf: хамгийн сүүлийн хэмжилтийн сарын эцэс, ирээдүй рүү гаргахгүй ── */
  let asOf: number | null = null;
  for (const m of [...measured, ...partial]) {
    const ms = monthEndMs(m.month);
    if (ms != null && (asOf == null || ms > asOf)) asOf = ms;
  }
  if (asOf != null && asOf > now) asOf = now;

  return {
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
/** Finance.tsx-ийн ДОТООД муруйн кэш — сорилоор илэрдэг (толгой) */
const SRC_FIN_CURVE = () => tr('Хуваарийн муруй (Санхүүжилт)');

export const loadScheduleKpi = cached(async (): Promise<KpiResult> => {
  const F = await import('@/modules/Finance');
  let fin: Awaited<ReturnType<typeof F.loadFinData>>;
  try {
    fin = await F.loadFinData();
  } catch {
    throw new Error(tr('{0} уншигдсангүй', SRC_FIN()));
  }
  const now = Date.now();
  const nowYm = ymOf(now);
  const finCurveMissing = F.lagOf(curveProbe(nowYm)) == null;
  const failed = finCurveMissing ? [SRC_FIN_CURVE()] : [];
  const pkgs = collectPkgLags(fin.contracts, (r) => F.contractMonths(r, fin), F.lagOf, isBuildRow);
  const curves = collectCurves(pkgs, F.lagOf, nowYm);
  return computeSchedule(pkgs, curves, F.lagLevel, now, failed, finCurveMissing);
}, SESSION_TTL_MS, ['BAGTS_SHEET', 'CASHFLOW_NEW', 'HO_IPC', 'HUVAARI_OBYEM'], kpiComplete);
