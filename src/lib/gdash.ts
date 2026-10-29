'use client';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ӨГӨГДЛИЙН ДАВХАРГА.
 *
 * `GeneralDash.tsx` нь ЗӨВХӨН зурна; тоо бодох ажил бүхэлдээ энд байна.
 * Шалтгаан: цонхны бүрэлдэхүүн болгонд `useMemo` дотор дүн бодуулбал (а)
 * шүүлт солигдох бүрд бүх карт дахин бодогдож, (б) тэр тооцоог ТЕСТЭЛЖ
 * болохгүй болно. Энд бүгд ЦЭВЭР ФУНКЦ — мөрүүд орж, чартын мөр гарна.
 */

import { queryFeatures, type Row } from '@/lib/query';
import { cached, SESSION_TTL_MS } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import {
  CASHFLOW_NEW, CF_WORK_WHERE, CF_MONTH_WHERE, CF_MONTH, HABEA, bagtsKey, isPkgRange,
  BUILDING, laborCompanyFields,
} from '@/lib/services';
import { latestLaborRow, laborHeadOf, EDIT_DATE_FIELD, OID_FIELD, ubDayKey } from '@/lib/ceo/workforce';
import { isClearedStatus } from '@/lib/land';
import { stageProjectPct } from '@/lib/negtgel';
import {
  FIN_XL_TOTAL_CODE_FIELD, FIN_XL_TOTAL_SKIP, FIN_XL_CHART_FIELDS, finXlChartCat,
  FIN_XL_WORK_SKIP,
} from '@/lib/finExcelLayout';
import type { LiveProgress } from '@/lib/projectPlanInputs';

const loadLiveProgressLazy = (): Promise<ReadonlyMap<number, LiveProgress> | null> =>
  import('@/lib/projectPlanInputs').then((m) => m.loadLiveProgress()).catch(() => null);

/**
 * `Cashflow_start` (сарын мөрийн эхлэл, epoch мс) → «YYYY-MM» — порталын НЭГ дүрэм.
 */
export const cfStartKeyOf = (ms: unknown): string => {
  const t = Number(ms);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  if (t % 86_400_000 === 0) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ══════════════════════ CASHFLOW — талбарууд ══════════════════════ */

export const CF = {
  url: CASHFLOW_NEW.url,
  /**
   * WBS-ТАЙ ТААРУУЛАХ ТАЛБАР — 2-р түвшин.
   */
  type: 'ajil_tuvshin2',
  /**
   * ЧАРТЫН АНГИЛАЛ — 1-р түвшин («ТЭЗҮ, ЗУРАГ ТӨСӨЛ» · «БАРИЛГА
   * УГСРАЛТ» · «НИЙГМИЙН ДЭД БҮТЭЦ» · «ГАЗАР ЧӨЛӨӨЛӨЛТ…» · «БОНДЫН ХҮҮ»).
   */
  chartType: 'ajil_tuvshin1',
  project: 'ajil_tuvshin1',
  pkg: 'bagts',
  pkg2: 'bagts',
  /** Урьдчилсан төсөвт өртөг — БҮХ мөнгөн тооцооны эх */
  cost: 'ho_dun_geree',
  /**
   * АЖЛЫН БҮТЭН НЭР — «Багц 74» жагсаалтад (2026-09-15).
   */
  detail: 'ajil_uilchilgee',
  /**
   * ХЭСГИЙН КОД — Excel-ийн E баганы «1 · 2 · 5 · 6 · 7».
   */
  code1: FIN_XL_TOTAL_CODE_FIELD,
  /** Хөрөнгө оруулалтын дүнгийн тайлбар — «Гэрээлсэн дүн» г.м. */
  note: 'ho_dungiin_tailbar',
  start: 'ehleh_ognoo',
  end: 'duusah_ognoo',
  /**
   * НИЙТ ХӨРӨНГӨ ОРУУЛАЛТАД ЭЗЛЭХ ХУВЬ (0–100), 78 мөрийн нийлбэр = 100.
   */
  share: 'tusuld_ezleh_huvi_dun',
  contract: 'geree_dun',
  decree: 'zahiramj_niit_dun',
  /** Гүйцэтгэлийн хувь — ТЕКСТ талбар («19.01») */
  progress: 'guitsetgel_huvi',
  /**
   * САРЫН ТӨЛӨВЛӨГӨӨТЭЙ ХОЛБОХ ДУГААР.
   */
  cfId: 'cashflow_id',
} as const;

/** Захирамжийн дүнгийн ЭХ ҮҮСВЭРҮҮД — 3-р чартын ангилал (Category) */
export const CF_SOURCES = [
  { field: 'zahiramj_niislel_tusuv', get label() { return tr('Нийслэлийн төсөв'); } },
  { field: 'zahiramj_nzd_nuuts', get label() { return tr('НЗД нөөц хөрөнгө'); } },
  { field: 'zahiramj_unet_tsaas', get label() { return tr('Үнэт цаасны хөрөнгө'); } },
  { field: 'zahiramj_borluulalt_dun', get label() { return tr('Төслийн орлого'); } },
] as const;

/**
 * ХӨНДЛӨН ШҮҮЛТИЙН ХЭМЖЭЭС — чартын мөр дарахад бусад чартыг нарийсгана.
 */
export type XDim = 'type' | 'source' | 'note';

/**
 * Мөр нь сонголтод НИЙЦЭХ эсэх.
 */
export function xMatch(r: CfRow, dim: XDim, key: string): boolean {
  if (dim === 'type') return r.type === key;
  if (dim === 'note') return (r.note || tr('Тайлбаргүй')) === key;
  const i = CF_SOURCES.findIndex((s) => s.field === key);
  return i >= 0 && r.src[i] > 0;
}

/** «Гэрээ хийсэн» гэдгийг тодорхойлох утга — 2, 3-р чартын дэд цуваа */
export const CONTRACTED = 'Гэрээлсэн дүн';

/**
 * «ГЭРЭЭТЭЙ» — ПОРТАЛЫН НЭГ ПРЕДИКАТ (2026-10-09): `ho_dungiin_tailbar === CONTRACTED` (зайг нэгтгэж).
 * Оролт нь CASHFLOW_NEW-ийн ТҮҮХИЙ мөр (`Record`) ЭСВЭЛ цэвэрлэсэн `CfRow`/`{ note }`.
 */
export const isContracted = (r: Readonly<Record<string, unknown>>): boolean => {
  const v = CF.note in r ? r[CF.note] : r.note;
  return String(v ?? '').replace(/\s+/g, ' ').trim() === CONTRACTED;
};

export type CfRow = {
  oid: number;
  type: string;
  project: string;
  pkg: string;
  /** Дэд багц (`Ded_bagts`) — газрын зургийн давхаргатай холбогдох ТҮЛХҮҮР */
  pkg2: string;
  cost: number;
  note: string;
  start: number | null;
  end: number | null;
  share: number;
  /** Захирамжийн дүн нийт дүн — ОЛГОСОН дүн */
  decree: number;
  /**
   * Гүйцэтгэлийн хувь, 0–100.
   */
  progress: number | null;
  /** Эх үүсвэр бүрийн дүн — `CF_SOURCES[i].field` дарааллаар */
  src: number[];
  /**
   * ШАТНЫ ГҮЙЦЭТГЭЛ — гэрээ бүрийн 6 шатны хувь (`CASHFLOW_NEW.stages`).
   */
  stage: Record<string, number | null>;
  /**
   * ЕРӨНХИЙ НИЙЛБЭРТ ОРОХ УУ — Excel-ийн мөр 7-ийн `=+I8+I21` томьёо.
   */
  inTotal: boolean;
  /** Сарын төлөвлөгөөтэй холбогдох тогтвортой дугаар (1…78) */
  cfId: number | null;
  /**
   * ЗАДАРГААНЫ 3-Р ТҮВШИН («Гадна цахилгаан холбоо, дохиолол»).
   */
  lvl3: string;
  /**
   * ЖИНХЭНЭ АЖИЛ МӨН ҮҮ — «Багц ажлын тоо» индикаторын хамрах хүрээ
   * (2026-09-10, хэрэглэгчийн засвар: «78 биш 74»).
   */
  isWork: boolean;
  /** Ажлын бүтэн нэр (`ajil_uilchilgee`) — жагсаалтад харагдана */
  name: string;
  /**
   * ТАЙЛАНГИЙН ХЭСГИЙН КОД (`bagts_tuvshin1`) — «1» ТЭЗҮ … «7» бондын хүү.
   */
  sec: string;
  /**
   * ЗАХИРАМЖИЙН ХО ТӨСӨВ (`ho_dun_zahiramj`, `CASHFLOW_NEW.fields.budgetOrder`), ₮ — хоосон бол null.
   */
  budgetOrder: number | null;
};

const nOf = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const nnOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const sOf = (v: unknown): string => String(v ?? '').trim();
/** Хувь — ТЕКСТЭЭС тоо руу; хоосон бол `null` (0 БИШ) */
const pOf = (v: unknown): number | null => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

const dOf = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

export const loadGdashCf = cached<CfRow[]>(async () => {
  const [rows, live] = await Promise.all([queryFeatures(CF.url, {
    where: CF_WORK_WHERE,
    outFields: [
      'objectid', CF.type, CF.project, CF.pkg, CF.cost, CF.note, CF.detail,
      ...FIN_XL_CHART_FIELDS,
      'ajil_tuvshin3',
      CF.start, CF.end, CF.share, CF.contract, CF.decree, CF.pkg2,
      CF.code1, CF.cfId, CASHFLOW_NEW.fields.budgetOrder,
      ...CF_SOURCES.map((s) => s.field),
    ],
  }), loadLiveProgressLazy()]);
  return rows.map((r: Row): CfRow => {
    const cfId = dOf(r[CF.cfId]);
    const lp = live && cfId != null ? live.get(cfId) ?? null : null;
    return {
    oid: nOf(r.objectid),
    type: finXlChartCat(r) || tr('Тодорхойгүй'),
    project: sOf(r[CF.project]),
    pkg: sOf(r[CF.pkg]),
    pkg2: sOf(r[CF.pkg2]),
    cost: nOf(r[CF.cost]),
    note: sOf(r[CF.note]),
    start: dOf(r[CF.start]),
    end: dOf(r[CF.end]),
    share: nOf(r[CF.share]),
    decree: nOf(r[CF.decree]),
    progress: lp ? lp.S : null,
    src: CF_SOURCES.map((s) => nOf(r[s.field])),
    stage: Object.fromEntries(Object.values(CASHFLOW_NEW.stages).map((f) => [f, lp ? lp.stages[f] ?? null : null])),
    inTotal: !FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1])),
    cfId,
    lvl3: sOf(r.ajil_tuvshin3),
    isWork: !FIN_XL_WORK_SKIP.includes(sOf(r[CF.code1])),
    name: sOf(r[CF.detail]),
    sec: sOf(r[CF.code1]),
    budgetOrder: nnOf(r[CASHFLOW_NEW.fields.budgetOrder]),
    };
  });
}, SESSION_TTL_MS, ['CASHFLOW_NEW', 'BAGTS_SHEET']);

/* ══════════════════════ САРЫН ТӨЛӨВЛӨГӨӨ (S-МУРУЙ) ══════════════════════ */

/**
 * НЭГ АЖЛЫН НЭГ САРЫН ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛ.
 */
export type CfPlanRow = {
  /** Эцэг ажлын `Cashflow_ID` */
  id: number;
  /** Тухайн сарын эхлэл (epoch мс) */
  start: number | null;
  /** Тэр сард төлөвлөсөн гүйцэтгэлийн хувь — ажил тус бүрд нийлбэр 100 */
  pct: number | null;
  /** `pct` × ажлын ХО дүн / 100 (үйлчилгээнд бодогдсон) */
  amount: number | null;
};

/**
 * ГАРААР ОРУУЛСАН сарын мөрүүд л (`CF_MONTH_WHERE`) — `sar_mongo_eh`-ээс үл хамааран.
 */
export const loadCfPlanManual = cached<CfPlanRow[]>(async () => {
  const rows = await queryFeatures(CF.url, {
    where: CF_MONTH_WHERE,
    outFields: [CF_MONTH.id, CF_MONTH.start, CF_MONTH.pct, CF_MONTH.amount],
  });
  return rows
    .map((r: Row): CfPlanRow => ({
      id: nOf(r[CF_MONTH.id]),
      start: dOf(r[CF_MONTH.start]),
      pct: pOf(r[CF_MONTH.pct]),
      amount: pOf(r[CF_MONTH.amount]),
    }))
    .filter((r) => r.id > 0 && r.start != null && (r.pct != null || r.amount != null));
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/**
 * ҮР ДҮНТЭЙ сарын төлөвлөгөө — `cashflowCurve` · ТУХ (`tuhData.cfPlanPctAt`) · ерөнхий дашбоард үүнийг уншина.
 */
let cfPlanPartial: ((v: object) => boolean) | null = null;
let cfPlanGapsOf: ((v: object) => CfPlanGaps | null) | null = null;
export const loadCfPlan = cached<CfPlanRow[]>(async () => {
  const manual = await loadCfPlanManual();
  const mm = await import('@/lib/monthlyMoney');
  cfPlanPartial = mm.isPartialMoney;
  cfPlanGapsOf = mm.moneyGapsOf;
  return mm.withHuvaari(manual);
}, SESSION_TTL_MS, ['CASHFLOW_NEW', 'HUVAARI_OBYEM', 'BAGTS_SHEET'], (v) => !(cfPlanPartial?.(v) ?? false));

/**
 * `loadCfPlan`-ын ЦООРХОЙ — S-муруйгаас дутсан 'huvaari' гэрээ (`monthlyMoney.MoneyGaps`-ийн хэлбэр).
 *   partial — мөнгөний мөр / хуудас уншигдсангүй; failed — хуудас унасан гэрээ; missing — тооцоолсон сар гараагүй гэрээ;
 *   noUnit / noRow — ₮-д ороогүй нүд.
 */
export type CfPlanGaps = { partial: boolean; failed: number[]; missing: number[]; noUnit: number; noRow: number };
export const cfPlanGaps = (rows: readonly CfPlanRow[] | null | undefined): CfPlanGaps | null =>
  (rows && cfPlanGapsOf ? cfPlanGapsOf(rows) : null);

/**
 * ЦООРХОЙН АНХААРУУЛГА — S-муруйн доорх нэг мөр (ерөнхий дашбоард · ТУХ). Цоорхойгүй бол null.
 * @param nameOf — `Cashflow_ID` → хүнд ойлгомжтой нэр (багц г.м.); олдохгүй бол «#ID»
 * @param inScope — муруйн хүрээнд орох гэрээ (ерөнхий дашбоардын `inTotal`); өгөөгүй бол бүгд
 */
export function cfGapsText(
  gaps: CfPlanGaps | null | undefined,
  nameOf: (id: number) => string | null | undefined = () => null,
  inScope?: (id: number) => boolean,
): string | null {
  if (!gaps) return null;
  const keep = (ids: readonly number[]) => (inScope ? ids.filter(inScope) : [...ids]);
  const ids = [...keep(gaps.failed), ...keep(gaps.missing)];
  const parts: string[] = [];
  if (ids.length) {
    const names = ids.slice(0, 3).map((id) => nameOf(id) || `#${id}`);
    parts.push(tr('Хуваарь эхтэй {0} гэрээ ороогүй ({1})', ids.length, ids.length > 3 ? `${names.join(', ')}…` : names.join(', ')));
  }
  const cells = gaps.noUnit + gaps.noRow;
  if (cells > 0) parts.push(tr('{0} нүдний обьём ₮-д ороогүй (нэгж өртөггүй / хуудсанд олдоогүй)', num(cells)));
  if (gaps.partial && !gaps.failed.length) parts.push(tr('зарим эх уншигдсангүй'));
  return parts.length ? tr('Төлөвлөгөөт муруй дутуу: {0}', parts.join(' · ')) : null;
}


/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ГУРВАН ХЭМЖЭЭС, тус бүр нь ОЛОН СОНГОЛТТОЙ.
 */
export type Period = {
  years: number[];
  /** 1–4 */
  quarters: number[];
  /** 1–12 */
  months: number[];
};

export const NO_PERIOD: Period = { years: [], quarters: [], months: [] };

export const periodActive = (p: Period) =>
  p.years.length > 0 || p.quarters.length > 0 || p.months.length > 0;

/**
 * ҮЙЛЧЛЭХ ШҮҮЛТ — хэмжээсийн БҮХ утга сонгогдсон бол «шүүлтгүй» (`[]`).
 */
export function effectivePeriod(p: Period, years: number[]): Period {
  const full = (sel: number[], opts: number[]) => opts.length > 0 && opts.every((v) => sel.includes(v));
  const y = full(p.years, years) ? [] : p.years;
  const q = full(p.quarters, [1, 2, 3, 4]) ? [] : p.quarters;
  const m = full(p.months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) ? [] : p.months;
  return y === p.years && q === p.quarters && m === p.months ? p : { years: y, quarters: q, months: m };
}

/** Сонголтод байгаа эсэх — хоосон олонлог нь БҮГДИЙГ хүлээн авна */
const hit = (sel: number[], v: number) => sel.length === 0 || sel.includes(v);

/**
 * Ажил сонгосон хугацаанд ХАМААРАХ эсэх.
 */
export function inPeriod(r: CfRow, p: Period): boolean {
  if (!periodActive(p)) return true;
  const a = r.start;
  const b = r.end ?? r.start;
  if (a == null || b == null) return false;

  const s = new Date(a);
  const e = new Date(b);
  let y = s.getFullYear();
  let m = s.getMonth();
  const ey = e.getFullYear();
  const em = e.getMonth();

  for (let i = 0; i < 480 && (y < ey || (y === ey && m <= em)); i += 1) {
    if (hit(p.years, y) && hit(p.quarters, Math.floor(m / 3) + 1) && hit(p.months, m + 1)) {
      return true;
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return false;
}

/** Өгөгдөлд БОДИТООР байгаа жилүүд — шүүлтийн сонголтыг гараар жагсаахгүй */
export function yearsOf(rows: CfRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    if (r.start == null) continue;
    const a = new Date(r.start).getFullYear();
    const b = new Date(r.end ?? r.start).getFullYear();
    for (let y = a; y <= b && y - a < 40; y += 1) set.add(y);
  }
  return [...set].sort((a, b) => a - b);
}

/* ══════════════════════ ЧАРТЫН МӨРҮҮД ══════════════════════ */

export type SubBar = {
  key: string;
  label: string;
  /** Гол утга — багана бүхэлдээ */
  value: number;
  /** Дэд цуваа — багана дотор өнгөт хэсэг */
  sub: number;
  /** Дэлгэцэд бичих текст (мөнгө/тоо форматлагдсан) */
  display?: string;
  subDisplay?: string;
  /**
   * АЖЛЫН ТОО ба тэднээс ГЭРЭЭЛСЭН нь — мөнгөн чартын хажуугийн хэмжигдэхүүн.
   */
  count?: number;
  countSub?: number;
  /**
   * БОДИТ ГҮЙЦЭТГЭЛ — өртгөөр ЖИГНЭСЭН хувь (0–100), эсвэл `null`.
   */
  perf?: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨНИЙ БИЕЛЭЛТ — гэрээний амьд явцын (`CfRow.progress`, 2026-10-27; урьд `guitsetgel_huvi`) жигнэсэн дундаж.
   */
  fin?: number | null;
  inTotal?: boolean;
};

const groupSum = (
  rows: CfRow[],
  keyOf: (r: CfRow) => string,
  valOf: (r: CfRow) => number,
  subOf: (r: CfRow) => number,
): SubBar[] => {
  const m = new Map<string, { value: number; sub: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const g = m.get(k) ?? { value: 0, sub: 0 };
    g.value += valOf(r);
    g.sub += subOf(r);
    m.set(k, g);
  }
  return [...m]
    .map(([key, v]) => ({ key, label: key, ...v }))
    .sort((a, b) => b.value - a.value);
};

/**
 * ӨРТГӨӨР ЖИГНЭСЭН ДУНДАЖ, ангиллаар.
 */
function weighted(
  rows: CfRow[],
  pick: (r: CfRow) => number | null,
): Map<string, number> {
  const w = new Map<string, { top: number; base: number }>();
  for (const r of rows) {
    if (!r.type || r.cost <= 0) continue;
    const p = pick(r);
    if (p == null) continue;
    const a = w.get(r.type) ?? { top: 0, base: 0 };
    a.top += (r.cost * p) / 100;
    a.base += r.cost;
    w.set(r.type, a);
  }
  return new Map(
    [...w].filter(([, a]) => a.base > 0).map(([k, a]) => [k, (a.top / a.base) * 100]),
  );
}
/**
 * 1-р чарт — ТӨРӨЛ × Урьдчилсан төсөвт өртөг, дотор нь ГЭРЭЭЛСЭН хэсэг.
 */
export function chartTypeCost(
  rows: CfRow[],
  /**
   * БАРИЛГА УГСРАЛТЫН ОБЪЁМООР бодогдсон гүйцэтгэл — `bagtsKey` → % (0–100).
   */
  pkgPct: Map<string, number> = new Map(),
  /**
   * АНГИЛЛЫН ИЛ ДАРАХ ГҮЙЦЭТГЭЛ — ангиллын нэр → % (0–100).
   */
  catPct: Map<string, number> = new Map(),
  contracts: Map<number, number> | null = null,
): SubBar[] {
  const bars = groupSum(
    rows,
    (r) => r.type,
    (r) => r.cost,
    (r) => (isContracted(r) ? (contracts ? contracts.get(r.oid) ?? 0 : r.cost) : 0),
  );
  const cnt = new Map<string, { n: number; c: number }>();
  const inTot = new Set<string>();
  for (const r of rows) {
    if (!r.type) continue;
    const a = cnt.get(r.type) ?? { n: 0, c: 0 };
    a.n += 1;
    if (isContracted(r)) a.c += 1;
    cnt.set(r.type, a);
    if (r.inTotal) inTot.add(r.type);
  }
  const w = weighted(rows, (r) => (r.pkg2 ? pkgPct.get(bagtsKey(r.pkg2)) ?? null : null));
  const wf = weighted(rows, (r) => r.progress);
  return bars.map((b) => ({
    ...b,
    count: cnt.get(b.key)?.n ?? 0,
    countSub: cnt.get(b.key)?.c ?? 0,
    perf: catPct.get(b.key) ?? w.get(b.key) ?? null,
    fin: wf.get(b.key) ?? null,
    inTotal: inTot.has(b.key),
  }));
}

/**
 * 2-р чарт — ТӨРӨЛ × төслийн ТОО, дотор нь ГЭРЭЭЛСЭН ажлын тоо.
 */

/**
 * 3-р чарт — ЭХ ҮҮСВЭР × төслийн тоо, дотор нь гэрээлсэн тоо.
 */
export function chartSourceCount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      if (r.src[i] <= 0) continue;
      value += 1;
      if (isContracted(r)) sub += 1;
    }
    return { key: s.field, label: s.label, value, sub };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

/**
 * 3б-р чарт — ЭХ ҮҮСВЭР × МӨНГӨН ДҮН (2026-09-04, хэрэглэгчийн хүсэлт).
 */
export function chartSourceAmount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      value += r.src[i];
      if (isContracted(r)) sub += r.src[i];
    }
    return { key: s.field, label: s.label, value, sub };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

/**
 * 3в-р чарт — ЭХ ҮҮСВЭР: МӨНГӨ ба ТОО НЭГ чартад (2026-09-06).
 */
export function chartSourceMerged(rows: CfRow[]): SubBar[] {
  const cnt = chartSourceCount(rows);
  const byKey = new Map(cnt.map((c) => [c.key, c]));
  return chartSourceAmount(rows).map((a) => {
    const c = byKey.get(a.key);
    return { ...a, count: c?.value ?? 0, countSub: c?.sub ?? 0 };
  });
}

/** 4-р чарт — ХӨРӨНГӨ ОРУУЛАЛТЫН ДҮНГИЙН ТАЙЛБАР × мөнгөн дүн */
export function chartNoteAmount(rows: CfRow[]): SubBar[] {
  return groupSum(
    rows,
    (r) => r.note || tr('Тайлбаргүй'),
    (r) => r.cost,
    () => 0,
  );
}

/* ══════════════════════ S-МУРУЙ ══════════════════════ */

export type CurvePoint = { key: string; label: string; value: number };

/**
 * НИЙТ ТӨСЛИЙН S-МУРУЙ — хугацааны туршид хуримтлагдах хөрөнгө оруулалтын %.
 */
/**
 * S-МУРУЙН ТЭНХЛЭГИЙН НАРИЙВЧЛАЛ.
 */
export type Grain = 'year' | 'quarter' | 'month';

/** Сонгосон шүүлтийн ХАМГИЙН НАРИЙН түвшин — тэнхлэгийн алхам үүнтэй таарна */
export const grainOf = (p: Period): Grain =>
  (p.months.length > 0 ? 'month' : p.quarters.length > 0 ? 'quarter' : 'year');

/** Улирлын шошго — «2026 II». Богино тул тэнхлэгт цэг олон байсан ч багтана */
const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * НИЙТ ТӨСЛИЙН S-МУРУЙ — хугацааны туршид хуримтлагдах хөрөнгө оруулалтын %.
 */
export function sCurve(rows: CfRow[], grain: Grain = 'year', period: Period = NO_PERIOD): CurvePoint[] {
  /* ── 1. Сар бүрийн эзлэх хувь ── */
  const per = new Map<string, number>();
  for (const r of rows) {
    if (r.share <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getFullYear();
    let m = s.getMonth();
    const ey = e.getFullYear();
    const em = e.getMonth();

    const n = Math.min(480, Math.max(1, (ey - y) * 12 + (em - m) + 1));
    const step = r.share / n;
    for (let i = 0; i < n; i += 1) {
      per.set(`${y}-${String(m + 1).padStart(2, '0')}`, (per.get(`${y}-${String(m + 1).padStart(2, '0')}`) ?? 0) + step);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  if (per.size === 0) return [];

  /* ── 2. Хуримтлал — БҮХ сараар, эрэмбээр (таслахаас ӨМНӨ) ── */
  let acc = 0;
  const all = [...per.keys()].sort().map((k) => {
    acc += per.get(k) ?? 0;
    return { key: k, value: Math.round(acc * 100) / 100 };
  });

  /* ── 3. Сонгосон хугацаа ── */
  const keep = periodActive(period)
    ? all.filter(({ key }) => {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(5, 7));
      return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1) && hit(period.months, m);
    })
    : all;
  if (keep.length === 0) return [];

  if (grain === 'month') return keep.map((p) => ({ ...p, label: p.key }));

  /*
   * ── 4. НАРИЙВЧЛАЛД БУУЛГАХ — бүлгийн СҮҮЛИЙН утга ──
   */
  const out = new Map<string, { label: string; value: number }>();
  for (const p of keep) {
    const y = p.key.slice(0, 4);
    const m = Number(p.key.slice(5, 7));
    const k = grain === 'year' ? y : `${y}-${Math.floor((m - 1) / 3) + 1}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[Math.floor((m - 1) / 3)]}`;
    out.set(k, { label, value: p.value });
  }
  return [...out].map(([key, v]) => ({ key, label: v.label, value: v.value }));
}

/**
 * CASHFLOW-ИЙН S-МУРУЙ — багана нь сарын МӨНГӨ, муруй нь ХУРИМТЛАГДСАН ХУВЬ.
 *
 *     хувь = Σ(тухайн сар хүртэлх Cashflow_dun) ÷ ТӨСЛИЙН НИЙТ ХО дүн × 100
 */
/**
 * ОРОН СУУЦНЫ БАРИЛГАЖИЛТЫН БАГЦУУД — ТӨСЛИЙН ЖИНГЭЭР (2026-09-10).
 */
export const HOUSING_PKGS: readonly string[] = [
  'БАГЦ1', 'БАГЦ2', 'БАГЦ31', 'БАГЦ32', 'БАГЦ33', 'БАГЦ41', 'БАГЦ42',
];

/**
 * ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛИЙН НЭГДСЭН ТОДОРХОЙЛОЛТ — ГАНЦ томьёо.
 *
 *     хувь = Σ(ХО дүн_p × гүйцэтгэл_p) ÷ Σ ХО дүн_p      (p — хэмжигдсэн багц)
 */
export type HousingItem = {
  /** Багцын биет гүйцэтгэл, 0–100; `null` = хэмжигдээгүй */
  pct: number | null | undefined;
  /** ХО дүн (₮) — `pkgCostWeight()` */
  cost: number;
  /** Нөөц жин — блокийн тоо (ХО дүн огт алга үед л) */
  blocks?: number;
};
export function housingPct(items: Iterable<HousingItem>): number | null {
  const known: { pct: number; cost: number; blocks: number }[] = [];
  for (const x of items) {
    if (x.pct == null || !Number.isFinite(x.pct)) continue;
    known.push({ pct: x.pct, cost: Number.isFinite(x.cost) ? x.cost : 0, blocks: x.blocks ?? 0 });
  }
  const byCost = known.some((x) => x.cost > 0);
  let top = 0;
  let base = 0;
  for (const x of known) {
    const w = byCost ? x.cost : x.blocks;
    if (!(w > 0)) continue;
    top += w * x.pct;
    base += w;
  }
  return base > 0 ? top / base : null;
}

/**
 * БАГЦ → ХО ДҮН (₮) — `housingPct`-ийн жин, ГАНЦ эх.
 */
export function pkgCostWeight(
  rows: Iterable<{ pkg: unknown; cost: number; inTotal: boolean }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.inTotal || !(r.cost > 0)) continue;
    const k = isPkgRange(r.pkg) ? '' : bagtsKey(r.pkg);
    if (!k || k === '0') continue;
    out.set(k, (out.get(k) ?? 0) + r.cost);
  }
  return out;
}

/**
 * ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛИЙН САРЫН ЦУВАА — `pkgShared.aggregateMonths`-ийн цөм
 * (2026-09-30-нд ЭНД шилжсэн: цэвэр функц тул `gdash.check`-ээр шалгагдана).
 *
 * @param physCnt багц → сар → блокийн тоо (нөөц жин — хамгийн их утга)
 * @param cost    багц → ХО дүн (`pkgCostWeight`)
 * @param physN   багц → блокийн хуваарь (`finPhys.PhysBuild.physN`) — тайлагнаагүй багцыг 0%-иар нэмнэ
 * @param only 2026-10-09 (аудит №2): өгөгдвөл ЗӨВХӨН энэ багцуудаар (хуваарьтай багцын
 *                олонлог — `planScope`). ЗӨВХӨН хоцрогдлын харьцуулалтад (`Finance.aggregateMonths`
 *                → `physLag`); толгойн «Биет гүйцэтгэл» (`physNow`) үүнгүйгээр — бүх багцаар.
 */
export function housingSeries(
  phys: Map<string, Map<string, number>>,
  physCnt: Map<string, Map<string, number>>,
  physAt: Map<string, Map<string, string>> | undefined,
  cost: Map<string, number>,
  labels: readonly string[],
  physN?: ReadonlyMap<string, number>,
  only?: ReadonlySet<string>,
): { label: string; phys: number | null; physAt: string | null }[] {
  const pk = [...phys].filter(([k]) => !only || only.has(k)).map(([k, byMon]) => {
    let w = physN?.get(k) ?? 1;
    physCnt.get(k)?.forEach((v) => { if (v > w) w = v; });
    return {
      pts: [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)),
      at: physAt?.get(k),
      w,
      cost: cost.get(k) ?? 0,
    };
  }).filter((x) => x.pts.length > 0);
  physN?.forEach((n, k) => {
    if (phys.get(k)?.size) return;
    if (only && !only.has(k)) return;
    pk.push({ pts: [], at: undefined, w: n > 0 ? n : 1, cost: cost.get(k) ?? 0 });
  });
  return labels.map((label) => {
    const items: HousingItem[] = [];
    let fresh = false;
    let at = '';
    for (const x of pk) {
      let v = 0;
      let a = '';
      for (const [m, val] of x.pts) {
        if (m > label) break;
        v = val;
        a = x.at?.get(m) ?? '';
        if (m === label) fresh = true;
      }
      items.push({ pct: v, cost: x.cost, blocks: x.w });
      if (a > at) at = a;
    }
    return {
      label,
      phys: fresh ? housingPct(items) : null,
      physAt: fresh && at ? at : null,
    };
  });
}

/**
 * ХУВИЙН НЭГЖИЙН ЗӨРҮҮ (нэгж хувь, «н.х») — тэмдэгтэй утга `v` (эерэг = өсөлт/түрүүлсэн).
 */
export function pts(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (Number(a.toFixed(d)) === 0) return tr('{0} н.х', num(0, d));
  return tr('{0} н.х', `${v > 0 ? '+' : '−'}${num(a, d)}`);
}

/**
 * ХУВААРИЙН ЗӨРҮҮ — `gap` = төлөвлөгөө − бодит (эерэг = ХОЦОРСОН) → «−5.0 н.х» (хоцорсон),
 * «+2.0 н.х» (түрүүлсэн), «0.0 н.х». 2026-10-09 (аудит №2): `pts`.
 */
export const gapPts = (gap: number | null | undefined, d = 1): string =>
  pts(gap == null ? gap : -gap, d);

/**
 * ХУВААРИЙН ЗӨРҮҮ ҮГЭЭР — «5.0 н.х хоцролт» / «2.0 н.х түрүүлсэн» / «0.0 н.х».
 */
export function gapPtsWord(gap: number | null | undefined, d = 1): string {
  if (gap == null || !Number.isFinite(gap)) return '—';
  const a = Math.abs(gap);
  if (Number(a.toFixed(d)) === 0) return tr('{0} н.х', num(0, d));
  return gap > 0 ? tr('{0} н.х хоцролт', num(a, d)) : tr('{0} н.х түрүүлсэн', num(a, d));
}

export function planScopeNote(excluded: readonly string[] | null | undefined): string | null {
  if (!excluded?.length) return null;
  return tr('Төлөвлөгөө ба хоцрогдол — хуваарьтай багцаар (хасагдсан: {0})', excluded.join(', '));
}

/**
 * ХОЦРОГДЛЫН ХАРЬЦУУЛАЛТЫН БАГЦЫН ОЛОНЛОГ — бодит талын олонлог (`pkgs` = `phys` ∪ `physN`)-оос
 * ХУВААРЬТАЙ (`byBagts`-д цэгтэй) нь `keys`; бодит талд ЖИНТЭЙ (ХО дүн > 0; ХО огт алга бол
 * бүгд) боловч хуваарьгүй нь `excluded` (эрэмбэлсэн).
 */
export function planScope(
  byBagts: ReadonlyMap<string, readonly unknown[]>,
  cost: ReadonlyMap<string, number>,
  pkgs: Iterable<string>,
): { keys: Set<string>; excluded: string[] } {
  const all = [...new Set(pkgs)];
  const byCost = all.some((k) => (cost.get(k) ?? 0) > 0);
  const keys = new Set<string>();
  const excluded: string[] = [];
  for (const k of all) {
    if (byBagts.get(k)?.length) keys.add(k);
    else if (!byCost || (cost.get(k) ?? 0) > 0) excluded.push(k);
  }
  excluded.sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
  return { keys, excluded };
}

/**
 * ОРОН СУУЦНЫ ТӨЛӨВЛӨГӨӨТ ХУВЬ — ТӨСЛИЙН түвшинд ХО дүнгээр жигнэсэн (`housingPct`).
 */
export function housingPlanSeries<P extends { label: string; pct: number }>(
  byBagts: ReadonlyMap<string, readonly { label: string; pct: number }[]>,
  cost: ReadonlyMap<string, number>,
  base: readonly P[],
  pkgs?: Iterable<string>,
): P[] {
  const only = pkgs ? new Set(pkgs) : null;
  const pk = [...byBagts]
    .filter(([k]) => !only || only.has(k))
    .map(([k, pts]) => ({
      pts: [...pts].sort((a, b) => a.label.localeCompare(b.label)),
      w: cost.get(k) ?? 0,
    }))
    .filter((x) => x.pts.length > 0 && x.w > 0);
  if (!pk.length) return [...base];
  const out: P[] = [];
  for (const b of base) {
    const pct = housingPct(pk.map((x) => {
      let v = 0; /* эхлээгүй багц — 0% */
      for (const p of x.pts) {
        if (p.label > b.label) break;
        v = p.pct; /* муж дотор — тэр сар; дууссан бол сүүлийн утга */
      }
      return { pct: v, cost: x.w };
    }));
    if (pct != null) out.push({ ...b, pct });
  }
  return out;
}

/**
 * «ГЭРЭЭЛСЭН ДҮН»-ИЙ ХҮРЭЭ — CASHFLOW_NEW-ийн ТҮҮХИЙ мөрөөс (`FinData.contracts`).
 *
 * Порталын ГАНЦ дүрэм (`live.loadBudget.contract`, `reportData.contractAmount`,
 * `execReport.csum`, `GeneralDash.KpiStrip`): «Нийт»-ийн хүрээ (`finXlInTotal`) ∧
 * `note === CONTRACTED`. `keys` — тэдгээр мөрийн багцын түлхүүр (`pkg2`, `pkg`;
 * диапазон мөр хоосон) — «олгосон ÷ гэрээлсэн»-ийн ТООЛОГЧИЙГ шүүнэ
 * (`reportData.paidContracted`-тай ижил: гэрээлсэн багцын төлбөр л).
 */
export function contractedScope(
  rows: Iterable<Readonly<Record<string, unknown>>>,
): { amount: number; keys: Set<string> } {
  let amount = 0;
  const keys = new Set<string>();
  for (const r of rows) {
    if (FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1]))) continue;
    if (!isContracted(r)) continue;
    amount += nOf(r[CF.contract]);
    for (const v of [r[CF.pkg2], r[CF.pkg]]) {
      const k = isPkgRange(v) ? '' : bagtsKey(v);
      if (k && k !== '0') keys.add(k);
    }
  }
  return { amount, keys };
}

/** CASHFLOW_NEW-ийн ТҮҮХИЙ мөр (`FinData.contracts`, `queryFeatures`) → `pkgCostWeight`-ийн оролт */
export const cfWeightRow = (r: Readonly<Record<string, unknown>>): { pkg: unknown; cost: number; inTotal: boolean } => ({
  pkg: sOf(r[CF.pkg2]) || sOf(r[CF.pkg]),
  cost: nOf(r[CF.cost]),
  inTotal: !FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1])),
});

/**
 * Орон сууцны багцуудын биет гүйцэтгэлийг МӨНГӨН ДҮНГЭЭР сараар нэгтгэнэ —
 * Σ(ХО дүн × гүйцэтгэл%) (2026-09-10, хэрэглэгчийн заавар: «ягаанаар харагдаж
 * буй хэсэг хэрэггүй, төлөвлөсөн гүйцэтгэл дээр оруулаадах»).
 *
 * @param phys    багц → (сар → %), `FinData.phys` — ЗӨВХӨН шинэ бичилттэй сард
 *                цэгтэй (`finPhys.buildPhys`-ийн дүрэм 2, сийрэг)
 * @param weight  багц → ХО дүн (₮). Байхгүй/тэг бол тооцоонд орохгүй.
 * @param labels  сарын тэнхлэг (өсөх дарааллаар)
 * @param only    хамрах багцууд (анхдагч: орон сууцны 7)
 * @returns сар → ₮; тэр сард НЭГ Ч багц ШИНЭЭР хэмжигдээгүй бол бичлэг ҮГҮЙ
 *          (`null ≠ 0` — дуудагч сүүлийн хэмжилтийг урагш авч явна)
 */
export function housingMoney(
  phys: Map<string, Map<string, number>>,
  weight: Map<string, number>,
  labels: string[],
  only: readonly string[] = HOUSING_PKGS,
): Map<string, number> {
  const keep = new Set(only);
  const out = new Map<string, number>();
  /** багц → сүүлийн мэдэгдэж буй % (тэнхлэгийн дарааллаар урагш) */
  const last = new Map<string, number>();
  for (const label of labels) {
    let fresh = false;
    for (const [key, byMon] of phys) {
      if (!keep.has(key)) continue;
      const v = byMon.get(label);
      if (v == null) continue;              // энэ сард шинэ бичилтгүй — өмнөх утга хэвээр
      last.set(key, v);
      fresh = true;
    }
    if (!fresh) continue;                   // нэг ч багц шинээр хэмжигдээгүй — бичлэг үгүй
    let sum = 0;
    for (const [key, v] of last) {
      const w = weight.get(key) ?? 0;
      if (w <= 0) continue;
      sum += (w * v) / 100;
    }
    out.set(label, sum);
  }
  return out;
}

/**
 * «YYYY-MM» түлхүүрүүдийг ЭХНИЙХЭЭС СҮҮЛИЙНХ хүртэл ТАСРАЛТГҮЙ сарын тэнхлэг болгоно
 * (2026-10-01, «хэрэглэгч: бүгдийг зас»). Өгөгдөлгүй сар ч тэнхлэгт орно — утгыг нь
 * дуудагч `null` (цоорхой) эсвэл хуримтлалын өмнөх түвшнээр бөглөнө.
 */
export function fillMonths(keys: readonly string[]): string[] {
  const ks = [...new Set(keys)].sort();
  if (ks.length < 2 || !ks.every((k) => /^\d{4}-\d{2}$/.test(k))) return ks;
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
  const a = idx(ks[0]);
  const b = idx(ks[ks.length - 1]);
  if (b - a > 600) return ks;
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  return out;
}

export function cashflowCurve(
  plan: CfPlanRow[],
  total: number,
  grain: Grain = 'month',
  period: Period = NO_PERIOD,
  /**
   * ОЛГОСОН IPC сараар (`'YYYY-MM'` → ₮), 2026-09-10.
   */
  ipcByMonth: Map<string, number> = new Map(),
  /**
   * ОРОН СУУЦНЫ БИЕТ ЯВЦ МӨНГӨН ДҮНГЭЭР — сар → ₮ (`housingMoney`).
   *
   *    Урьд нь орон сууцны 7 ажлын САРЫН ТӨЛӨВЛӨГӨӨГ бүхэлд нь хаяж
   *    (`skipIds`), оронд нь тэдний ӨНӨӨДРИЙН биет явцыг цэнхэр муруйд
   *    нэмдэг байв. Гэтэл орон сууц нь төслийн 58.6%, бөглөгдсөн
   *    төлөвлөгөөний 53.1% — тиймээс цэнхэр муруй нь «ирээдүйн
   *    төлөвлөгөө + өнөөдрийн түвшин» гэсэн ХОЛИМОГ болж, ирээдүй рүү
   *    ӨСӨХӨӨ БОЛЬДОГ байлаа: 2027 он бүтнээр бөглөгдсөн атал муруй
   *    34.8%-аас (өнөөдрийн 32.4%-тай бараг тэнцүү) дээш гардаггүй байв.
   */
  housingMoneyByMonth: Map<string, number> = new Map(),
  /**
   * ОГНООГҮЙ ОЛГОЛТ (урьдчилгаа г.м.) — ₮ (2026-09-10, хэрэглэгчийн заавар:
   * «ногоон шугамын үзүүрт нийт олгосон мөнгө 530,872,795,391 ₮ гарах»).
   */
  ipcBase = 0,
): TimePoint[] {
  const per = new Map<string, number>();
  for (const p of plan) {
    if (p.amount == null || p.start == null) continue;
    const k = cfStartKeyOf(p.start);
    per.set(k, (per.get(k) ?? 0) + p.amount);
  }
  if (total <= 0) return [];
  /*
   * Урьд нь зөвхөн `per` (Cashflow төлөвлөгөө)-ийн саруудаас угсардаг байв.
   * Гэтэл амьдаар тэдгээр нь 2024-04…2025-05 (681 мөрийн 667 нь ХООСОН,
   * бөглөгдсөн 14 нь ч 0 ₮), харин IPC олголт 2025-09…2026-08 — хоёр
   * цуваа ОГТ ОГТЛОЛЦОХГҮЙ тул IPC-ийн муруй бүх цэгт 0% дээр хэвтэж,
   * үзэгдэхгүй байлаа. Одоо аль ч эх сурвалжид өгөгдөл байвал тэр сар
   * тэнхлэгт гарна — нөгөө цуваа тэнд `null` (тасалдана), 0 БИШ.
   */
  const months = fillMonths([...new Set([
    ...per.keys(), ...ipcByMonth.keys(), ...housingMoneyByMonth.keys(),
  ])]);
  if (months.length === 0) return [];
  /*
   * ТӨЛӨВЛӨГӨӨНИЙ ХУРИМТЛАЛ — ЗӨВХӨН ТӨЛӨВЛӨГӨӨНИЙ ӨӨРИЙН ХҮРЭЭНД
   * (`ipcCum`/`physCum`-тай ЯГ ИЖИЛ дүрэм, 2026-09-11).
   */
  const planMonths = [...per.keys()].sort();
  const planFirst = planMonths[0];
  const planLast = planMonths[planMonths.length - 1];
  let acc = 0;
  const cum = new Map<string, number>();
  if (planMonths.length) {
    for (const k of months) {
      if (k < planFirst) continue;        // эхний төлөвлөгөөнөөс ӨМНӨ муруй эхлэхгүй
      acc += per.get(k) ?? 0;
      if (k > planLast) break;            // сүүлийн төлөвлөгөөнөөс цааш сунгахгүй
      cum.set(k, Math.round((acc / total) * 100 * 100) / 100);
    }
  }
  /*
   * ОРОН СУУЦНЫ БИЕТ ЯВЦЫН МУРУЙ — IPC-ийнхтэй ЯГ ИЖИЛ дүрмээр.
   */
  const physMonths = [...housingMoneyByMonth.keys()].sort();
  const physLast = physMonths[physMonths.length - 1];
  const physCum = new Map<string, number>();
  if (physMonths.length) {
    let house = 0;
    let seen = false;
    for (const k of months) {
      const v = housingMoneyByMonth.get(k);
      if (v != null) { house = v; seen = true; }
      if (!seen || k > physLast) continue;
      physCum.set(k, Math.round((house / total) * 100 * 100) / 100);
    }
  }
  /*
   * ОЛГОСОН IPC-ийн ХУРИМТЛАЛ — төлөвлөгөөнийхтэй ЯГ ИЖИЛ дүрмээр.
   */
  const ipcMonths = [...ipcByMonth.keys()].sort();
  const ipcLast = ipcMonths[ipcMonths.length - 1];
  const ipcFirst = ipcMonths[0];
  const ipcCum = new Map<string, number>();
  const ipcMoney = new Map<string, number>();
  if (ipcMonths.length) {
    let a2 = ipcBase;                     // огноогүй урьдчилгаа — эхнээс
    for (const k of months) {
      if (k < ipcFirst) continue;         // эхний олголтоос ӨМНӨ муруй эхлэхгүй
      a2 += ipcByMonth.get(k) ?? 0;
      if (k > ipcLast) break;             // сүүлийн олголтоос цааш сунгахгүй
      ipcCum.set(k, Math.round((a2 / total) * 100 * 100) / 100);
      ipcMoney.set(k, a2);
    }
  }

  const keep = months.filter((k) => {
    if (!periodActive(period)) return true;
    const y = Number(k.slice(0, 4));
    const m = Number(k.slice(5, 7));
    return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1)
      && hit(period.months, m);
  });
  if (keep.length === 0) return [];

  if (grain === 'month') {
    return keep.map((k) => ({
      key: k,
      label: k,
      pct: cum.get(k) ?? null,
      amount: per.get(k) ?? 0,
      ipcPct: ipcCum.get(k) ?? null,
      ipcMoney: ipcMoney.get(k) ?? null,
      physPct: physCum.get(k) ?? null,
    }));
  }
  const out = new Map<string, TimePoint>();
  for (const k of keep) {
    const y = k.slice(0, 4);
    const m = Number(k.slice(5, 7));
    const q = Math.floor((m - 1) / 3) + 1;
    const bk = grain === 'year' ? y : `${y}-${q}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[q - 1]}`;
    const prev = out.get(bk);
    out.set(bk, {
      key: bk,
      label,
      /* Хувь — бүлгийн СҮҮЛИЙНХ (хуримтлал тул нэмэхгүй). */
      pct: cum.get(k) ?? prev?.pct ?? null,
      /* Мөнгө — бүлгийн НИЙЛБЭР (хуримтлал биш тул нэмнэ) */
      amount: (prev?.amount ?? 0) + (per.get(k) ?? 0),
      ipcPct: ipcCum.get(k) ?? prev?.ipcPct ?? null,
      ipcMoney: ipcMoney.get(k) ?? prev?.ipcMoney ?? null,
      physPct: physCum.get(k) ?? prev?.physPct ?? null,
    });
  }
  return [...out.values()];
}
/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

export type Kpi = {
  /** Нийт төсөв — Урьдчилсан төсөвт өртгийн нийлбэр */
  budget: number;
  /**
   * НИЙТ ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН гэрээлэгдсэн мөрийн `Geree_erh_dun`-ийн нийлбэр.
   */
  contract: number;
  /** Гүйцэтгэлийн хувь — нэгтгэл гүйцэтгэл эсвэл 6 шатны өртгөөр ЖИГНЭСЭН дундаж (`progressSrc`) */
  progress: number | null;
  /**
   * `progress` ХААНААС ирсэн бэ (2026-09-25).
   */
  progressSrc: ProgressSrc;
  /**
   * БАГЦ АЖЛЫН ТОО — шүүлтэд багтсан МӨРИЙН тоо.
   */
  packages: number;
  /** Нийт төрлийн тоо */
  types: number;
};

/** Гүйцэтгэлийн хувийн эх — `Kpi.progressSrc` */
export type ProgressSrc = 'negtgel' | 'stage';

/** Индикаторын шошго — эхэд тохирсон (6 шатны бодолтыг нэгтгэлийн нэрээр гаргахгүй) */
export const progressLabel = (src: ProgressSrc): string => (src === 'negtgel'
  ? tr('Гүйцэтгэлийн хувь')
  : tr('Гүйцэтгэлийн хувь (6 шатаар)'));

/** Тайлангийн дэд тайлбар — эхэд тохирсон */
export const progressSub = (src: ProgressSrc): string => (src === 'negtgel'
  ? tr('Нэгтгэл гүйцэтгэлээр')
  : tr('6 шатны жигнэсэн хувь'));

export function kpisOf(
  rows: CfRow[],
  contractSum: number,
  landPct: number | null = null,
  wbsPct: number | null = null,
): Kpi {
  let budget = 0;
  const types = new Set<string>();

  for (const r of rows) {
    if (r.inTotal) budget += r.cost;
    if (r.type) types.add(r.type);
  }

  /*
   * ГҮЙЦЭТГЭЛИЙН ХУВЬ — «Нэгтгэл гүйцэтгэл»-ийн ТӨСЛИЙН НИЙТ мөртэй ИЖИЛ
   * (2026-09-08, хэрэглэгчийн заавар: «шинэ source»).
   */
  const stagePct = wbsPct
    ?? stageProjectPct(rows.map((r) => ({ budget: r.cost, pct: r.stage })), landPct);

  return {
    budget,
    contract: contractSum,
    progress: stagePct,
    progressSrc: wbsPct != null ? 'negtgel' : 'stage',
    packages: rows.filter((r) => r.isWork).length,
    types: types.size,
  };
}

/**
 * БАРИЛГА УГСРАЛТЫН БАГЦ → блокийн давхаргын `BAGTS` утга (2026-09-15).
 */
export const loadBuildPkgs = cached<Map<string, string>>(async () => {
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.fields.bagts],
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    const v = sOf(r[BUILDING.fields.bagts]);
    if (v) m.set(bagtsKey(v), v);
  }
  return m;
}, SESSION_TTL_MS, ['BUILDING']);

/** Гэрээний дүнгийн нийлбэр — шүүсэн мөрүүдээс (тусад нь: `CfRow`-д ороогүй) */
export const loadContractSum = cached<Map<number, number>>(async () => {
  const rows = await queryFeatures(CF.url, { where: CF_WORK_WHERE, outFields: ['objectid', CF.contract] });
  return new Map(rows.map((r) => [nOf(r.objectid), nOf(r[CF.contract])]));
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/* ══════════════════════ ХАБ — ӨНӨӨДРИЙН БАЙДЛААР ══════════════════════ */

export type HseNow = {
  /** Хамгийн сүүлд бөглөсөн огноо, `YYYY-MM-DD` */
  date: string;
  workers: number | null;
  equipment: number | null;
  manHours: number | null;
};

/**
 * ХАБ-ын СҮҮЛИЙН бүртгэл.
 */
export const loadHseNow = cached<HseNow | null>(async () => {
  const f = HABEA.labor.fields;
  const rows = await queryFeatures(HABEA.labor.url, {
    where: `${f.ognoo} IS NOT NULL`,
    outFields: [
      f.ognoo, f.hunTsag, EDIT_DATE_FIELD, OID_FIELD,
      ...HABEA.labor.companies.flatMap((c) => {
        const cf = laborCompanyFields(c.sfx);
        return [cf.mongol, cf.gadaad, cf.niitAjiltan, cf.niitTehnik];
      }),
    ],
    orderBy: `${f.ognoo} DESC, ${EDIT_DATE_FIELD} DESC, ${OID_FIELD} DESC`,
    limit: 10,
  });
  const r = latestLaborRow(rows);
  if (!r) return null;
  const head = laborHeadOf(r);
  const ms = Number(r[f.ognoo]);
  return {
    date: Number.isFinite(ms) ? ubDayKey(ms) : '',
    workers: head.workers,
    equipment: head.technik,
    manHours: nnOf(r[f.hunTsag]),
  };
}, 5 * 60_000, ['HABEA']);

/* ══════════════ ХУГАЦААНЫ НЭГДСЭН ЦУВАА ══════════════ */

export type TimePoint = {
  key: string;
  label: string;
  /**
   * Хуримтлагдсан эзлэх хувь (S-муруй).
   */
  pct: number | null;
  /** Тухайн үед ногдох захирамжийн олгосон дүн (хуримтлалгүй) */
  amount: number;
  /**
   * ОЛГОСОН IPC — хуримтлагдсан эзлэх хувь (хоёр дахь S-муруй, 2026-09-10).
   */
  ipcPct: number | null;
  /**
   * ОЛГОСОН IPC — ХУРИМТЛАГДСАН ЯГ ₮ (`ipcPct`-ийн мөнгөн эх, бүхэлчлэлгүй).
   */
  ipcMoney: number | null;
  /**
   * ОРОН СУУЦНЫ БАРИЛГАЖИЛТЫН БИЕТ ЯВЦ — мөнгөн эквивалентаар, нийт
   * төсөвт эзлэх хуримтлагдсан хувь (гурав дахь S-муруй, 2026-09-10).
   */
  physPct: number | null;
};

/* ══════════════ ЧӨЛӨӨГДӨӨГҮЙ ТАЛБАР — ШАЛТГААНААР ══════════════ */

/**
 * Шалтгаан → тэр шалтгаантай ҮЛДСЭН нэгж талбаруудын ObjectID.
 */
export const loadReasonOids = cached<Map<string, Set<number>>>(async () => {
  const { PARCEL_LEFT, parcelLeftWhere } = await import('@/lib/services');
  const F = PARCEL_LEFT.fields;
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: parcelLeftWhere(),
    outFields: [PARCEL_LEFT.oid, F.status],
  });

  const clean = (v: unknown): string => {
    const t = String(v ?? '').trim().replace(/\.$/, '').trim();
    return !t || t === '—' ? tr('Тодорхойгүй') : t;
  };

  const m = new Map<string, Set<number>>();
  for (const r of rows) {
    if (isClearedStatus(r[F.status])) continue;
    const k = clean(r[F.status]);
    const oid = nOf(r[PARCEL_LEFT.oid]);
    if (!oid) continue;
    const set = m.get(k) ?? new Set<number>();
    set.add(oid);
    m.set(k, set);
  }
  return m;
}, SESSION_TTL_MS, ['PARCEL_LEFT']);

/**
 * ШҮҮГДСЭН мөрүүдэд БОДИТООР байгаа дэд багц → ажлын төрлүүд.
 */
export function activeSubPkgTypes(rows: CfRow[]): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const raw = r.pkg2;
    if (!raw || isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (!k) continue;
    const set = m.get(k) ?? new Set<string>();
    if (r.type) set.add(r.type);
    m.set(k, set);
  }
  return new Map([...m].map(([k, v]) => [k, [...v]]));
}

/* ══════════════ ДЭД БАГЦ → ГАЗРЫН ЗУРГИЙН ДАВХАРГА ══════════════ */

export type SubPkg = {
  key: string;
  label: string;
  layerIds: string[];
  /**
   * Тухайн дэд багцад бүртгэгдсэн АЖЛЫН ТӨРЛҮҮД (`Turul`).
   */
  types: string[];
};

/**
 * Cashflow-гийн «Дэд багц» → газрын зургийн `pkg:*` давхаргууд.
 */
export const loadSubPkgLayers = cached<SubPkg[]>(async () => {
  const { bagtsKey, isPkgRange } = await import('@/lib/services');
  const { mapPkgLayers } = await import('@/lib/pkgAlias');
  const rows = await queryFeatures(CF.url, {
    where: CF_WORK_WHERE,
    outFields: [CF.pkg2, ...FIN_XL_CHART_FIELDS],
  });

  const seen = new Map<string, string>();
  const types = new Map<string, Set<string>>();
  for (const r of rows) {
    const raw = sOf(r[CF.pkg2]);
    if (!raw || isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (!k || !mapPkgLayers(k)?.length) continue;
    if (!seen.has(k)) seen.set(k, raw);
    const ty = finXlChartCat(r);
    if (ty) {
      const set = types.get(k);
      if (set) set.add(ty); else types.set(k, new Set([ty]));
    }
  }
  return [...seen]
    .map(([key, label]) => ({
      key,
      label,
      layerIds: mapPkgLayers(key) ?? [],
      types: [...(types.get(key) ?? [])],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);
