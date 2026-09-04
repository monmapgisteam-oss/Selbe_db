'use client';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ӨГӨГДЛИЙН ДАВХАРГА.
 *
 * `GeneralDash.tsx` нь ЗӨВХӨН зурна; тоо бодох ажил бүхэлдээ энд байна.
 * Шалтгаан: цонхны бүрэлдэхүүн болгонд `useMemo` дотор дүн бодуулбал (а)
 * шүүлт солигдох бүрд бүх карт дахин бодогдож, (б) тэр тооцоог ТЕСТЭЛЖ
 * болохгүй болно. Энд бүгд ЦЭВЭР ФУНКЦ — мөрүүд орж, чартын мөр гарна.
 *
 * ⚠️ ЗОХИОМОЛ ТОО БАЙХГҮЙ. Багана хоосон бол чарт хоосон гарна — дүүргэхийн
 * тулд ойролцоо утга бодохгүй. Ганц ҮЛ ХАМААРАХ шийдвэр нь гүйцэтгэлийн хувь
 * (доорх `PROGRESS` тайлбарыг үз).
 */

import { queryFeatures, type Row } from '@/lib/query';
import { cached } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import { CASHFLOW_NEW, HABEA, bagtsKey } from '@/lib/services';

/* ══════════════════════ CASHFLOW — талбарууд ══════════════════════ */

/**
 * ⚠️ `CASHFLOW_NEW.fields` нь ЗӨВХӨН «Санхүүжилт» харагдацын хүснэгтэд хэрэгтэй
 * цөөн талбарыг нэрлэдэг. Дашбоардад мөнгө, огноо, эх үүсвэрийн багана бүгд
 * хэрэгтэй тул энд БҮТЭН зураглал. Нэг үйлчилгээ, хоёр зураглал байх нь
 * давхардал ч биш: нөгөө нь хүснэгтийн ТУЛГУУР багана, энэ нь ТООЦООНЫ багана.
 */
export const CF = {
  url: CASHFLOW_NEW.url,
  type: 'Turul',
  project: 'Tusul',
  pkg: 'Bagts',
  /** Урьдчилсан төсөвт өртөг — БҮХ мөнгөн тооцооны эх */
  cost: 'Urdch_tusuwt_urtug',
  /** Хөрөнгө оруулалтын дүнгийн тайлбар — «Гэрээлсэн дүн» г.м. */
  note: 'HO_dungiin_tailbar',
  start: 'Ehleh_ognoo',
  end: 'Duusah_ognoo',
  /** Нийт хөрөнгө оруулалтад эзлэх хувь (2026-09-04-нд `cost`-оос бодогдож бичигдсэн) */
  share: 'Zah_eh_unet_tsaas_huwi',
  contract: 'Geree_erh_dun',
  decree: 'Zahiramj_niit_dun',
} as const;

/** Захирамжийн дүнгийн ЭХ ҮҮСВЭРҮҮД — 3-р чартын ангилал (Category) */
export const CF_SOURCES = [
  { field: 'Zah_eh_niislel_tusuw', label: tr('Нийслэлийн төсөв') },
  { field: 'Zah_eh_NZD_nuuts', label: tr('НЗД нөөц хөрөнгө') },
  { field: 'Zah_eh_unet_tsaas', label: tr('Үнэт цаасны хөрөнгө') },
  { field: 'Zah_eh_tusliin_orlogo', label: tr('Төслийн орлого') },
] as const;

/** «Гэрээ хийсэн» гэдгийг тодорхойлох утга — 2, 3-р чартын дэд цуваа */
export const CONTRACTED = 'Гэрээлсэн дүн';

export type CfRow = {
  oid: number;
  type: string;
  project: string;
  pkg: string;
  cost: number;
  note: string;
  start: number | null;
  end: number | null;
  share: number;
  /** Эх үүсвэр бүрийн дүн — `CF_SOURCES[i].field` дарааллаар */
  src: number[];
};

const nOf = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const sOf = (v: unknown): string => String(v ?? '').trim();
const dOf = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

export const loadGdashCf = cached<CfRow[]>(async () => {
  const rows = await queryFeatures(CF.url, {
    outFields: [
      'OBJECTID', CF.type, CF.project, CF.pkg, CF.cost, CF.note,
      CF.start, CF.end, CF.share, CF.contract, CF.decree,
      ...CF_SOURCES.map((s) => s.field),
    ],
    limit: 4000,
  });
  return rows.map((r: Row): CfRow => ({
    oid: nOf(r.OBJECTID),
    type: sOf(r[CF.type]) || tr('Тодорхойгүй'),
    project: sOf(r[CF.project]),
    pkg: sOf(r[CF.pkg]),
    cost: nOf(r[CF.cost]),
    note: sOf(r[CF.note]),
    start: dOf(r[CF.start]),
    end: dOf(r[CF.end]),
    share: nOf(r[CF.share]),
    src: CF_SOURCES.map((s) => nOf(r[s.field])),
  }));
}, undefined, ['CASHFLOW_NEW']);

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

export type Period = {
  year: number | null;
  /** 1–4; `year` сонгоогүй бол утгагүй тул UI нь хамт л асаана */
  quarter: number | null;
  /** 1–12 */
  month: number | null;
};

export const NO_PERIOD: Period = { year: null, quarter: null, month: null };

export const periodActive = (p: Period) =>
  p.year != null || p.quarter != null || p.month != null;

/**
 * Сонгосон хугацааны ЦОНХ — [эхлэл, төгсгөл) миллисекундээр.
 *
 * ⚠️ Улирал/сар нь ЖИЛГҮЙ утгагүй: «2-р улирал» гэдэг нь аль жилийнх вэ гэдэг
 * тодорхойгүй бол цонх тогтохгүй. Тиймээс жил сонгоогүй үед улирал/сар нь
 * БҮХ жилийн тэр улирал/сарыг хамарна — цонх биш, ДАВТАМЖИЙН шүүлт болно
 * (`inPeriod` доор хоёуланг нь боддог).
 */
export function periodWindow(p: Period): { from: number; to: number } | null {
  if (p.year == null) return null;
  const y = p.year;
  if (p.month != null) return { from: Date.UTC(y, p.month - 1, 1), to: Date.UTC(y, p.month, 1) };
  if (p.quarter != null) {
    const m = (p.quarter - 1) * 3;
    return { from: Date.UTC(y, m, 1), to: Date.UTC(y, m + 3, 1) };
  }
  return { from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) };
}

/**
 * Ажил сонгосон хугацаанд ХАМААРАХ эсэх.
 *
 * ⚠️ Огнооны ЦЭГЭЭР биш, ХУГАЦААНЫ ДАВХЦЛААР шүүнэ: ажил бүр
 * [эхлэх, дуусах] интервалтай тул «2026 он» гэдэгт 2025-д эхлээд 2027-д
 * дуусах ажил ЗААВАЛ орно. Эхлэх огноогоор нь шүүвэл олон жилийн ажил
 * дунд жилүүддээ алга болж, S-муруй тасарна.
 *
 * ⚠️ ОГНООГҮЙ мөр (7 мөр) шүүлт ИДЭВХТЭЙ үед ГАРНА — «мэдэгдэхгүй» нь
 * «хамаарна» гэсэн үг биш. Шүүлтгүй үед бүгд орно.
 */
export function inPeriod(r: CfRow, p: Period): boolean {
  if (!periodActive(p)) return true;
  const a = r.start;
  const b = r.end ?? r.start;
  if (a == null || b == null) return false;

  const w = periodWindow(p);
  if (w) return a < w.to && b >= w.from;

  /* Жилгүй улирал/сар — интервалын дундах САР бүрийг шалгана */
  const want = (m: number) =>
    (p.month == null || m + 1 === p.month) &&
    (p.quarter == null || Math.floor(m / 3) + 1 === p.quarter);
  const s = new Date(a);
  const e = new Date(b);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  const ey = e.getUTCFullYear();
  const em = e.getUTCMonth();
  /* ⚠️ Хязгаар: интервал 40 жилээс урт байвал давталт таслана (өгөгдлийн
     алдаанаас болж хөлдөхөөс сэргийлнэ) — бодит муж 2024–2028. */
  for (let i = 0; i < 480 && (y < ey || (y === ey && m <= em)); i += 1) {
    if (want(m)) return true;
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
    const a = new Date(r.start).getUTCFullYear();
    const b = new Date(r.end ?? r.start).getUTCFullYear();
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
 * 1-р чарт — ТӨРӨЛ × Урьдчилсан төсөвт өртөг, дотор нь ГҮЙЦЭТГЭЛ.
 *
 * ⚠️ PROGRESS: `Cashflow_0904`-ийн `Guitsetgel_huwi` багана нь ХООСОН (76/76
 * мөр хоосон — 2026-09-04-нд шалгав). Тиймээс гүйцэтгэлийн хувийг БАГЦЫН
 * нэгтгэлээс (`BAGTS_NEGTGEL` → `loadPkgProgress`) багцын нэрээр холбож
 * авна. Энэ нь порталын бусад хэсэг («Багцын гүйцэтгэл», нүүр) гүйцэтгэлийг
 * авдаг ЯГ ТЭР эх сурвалж тул тоонууд хоорондоо зөрөхгүй.
 *
 * ⚠️ Багц нь нэгтгэлд олдоогүй ажлын гүйцэтгэл 0 БИШ, ХАМРАГДАХГҮЙ: 0 гэвэл
 * «хийгдээгүй» гэсэн худал мэдэгдэл болно. Дэд багана нь зөвхөн хэмжигдсэн
 * ажлын дүнг эзэлнэ.
 */
export function chartTypeCost(rows: CfRow[], progress: Map<string, number>): SubBar[] {
  return groupSum(
    rows,
    (r) => r.type,
    (r) => r.cost,
    (r) => {
      const p = progress.get(bagtsKey(r.pkg));
      return p == null ? 0 : (r.cost * p) / 100;
    },
  );
}

/** 2-р чарт — ТӨРӨЛ × төслийн ТОО, дотор нь ГЭРЭЭЛСЭН ажлын тоо */
export function chartTypeCount(rows: CfRow[]): SubBar[] {
  return groupSum(rows, (r) => r.type, () => 1, (r) => (r.note === CONTRACTED ? 1 : 0));
}

/**
 * 3-р чарт — ЭХ ҮҮСВЭР × төслийн тоо, дотор нь гэрээлсэн тоо.
 *
 * ⚠️ Нэг ажил ОЛОН эх үүсвэрээс санхүүжиж болно (захирамжийн дүн хуваагддаг)
 * тул баганын НИЙЛБЭР нь нийт ажлын тооноос ИХ гарна. Энэ нь алдаа биш —
 * «эх үүсвэр тус бүрд хамрагдах ажлын тоо» гэсэн асуултын зөв хариу.
 */
export function chartSourceCount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      if (r.src[i] <= 0) continue;
      value += 1;
      if (r.note === CONTRACTED) sub += 1;
    }
    return { key: s.field, label: s.label, value, sub };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
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
 *
 * ⚠️ ЯАГААД ИЙМ АРГА: даалгаварт «Төлөвлөгөөт хугацаа эхлэх / дуусах хоёрын
 * нэг нь тэнхлэг болно» гэсэн. Аль нэгийг нь СОНГОВОЛ муруй гажина —
 * эхлэхээр авбал бүх зардал ажил эхэлмэгц нэг дор суух (шаталсан шат), дуусахаар
 * авбал ажил дуустал юу ч болоогүй мэт харагдана. Тиймээс ХОЁУЛАНГ нь авч,
 * ажил бүрийн эзлэх хувийг эхлэх→дуусах хоорондох САРУУДАД ЖИГД тарааж,
 * дараа нь хуримтлуулна — энэ нь S хэлбэрийг өгөгдлөөс өөрөөс нь гаргана.
 *
 * ⚠️ Жин нь `Zah_eh_unet_tsaas_huwi` (нийт хөрөнгө оруулалтад эзлэх хувь) —
 * 2026-09-04-нд `Urdch_tusuwt_urtug`-аас бодогдож үйлчилгээнд бичигдсэн.
 * Хоосон бол тэр ажил муруйд ОРОХГҮЙ (0 гэж тооцвол огноогүй ажил муруйг
 * доош татна).
 */
export function sCurve(rows: CfRow[]): CurvePoint[] {
  const per = new Map<string, number>();
  let any = false;

  for (const r of rows) {
    if (r.share <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth();

    /* Саруудын тоо — 40 жилийн хамгаалалт (дээрхтэй ижил шалтгаан) */
    const n = Math.min(480, Math.max(1, (ey - y) * 12 + (em - m) + 1));
    const step = r.share / n;
    for (let i = 0; i < n; i += 1) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      per.set(k, (per.get(k) ?? 0) + step);
      any = true;
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  if (!any) return [];

  let acc = 0;
  return [...per.keys()].sort().map((k) => {
    acc += per.get(k) ?? 0;
    return { key: k, label: k, value: Math.round(acc * 100) / 100 };
  });
}

/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

export type Kpi = {
  /** Нийт төсөв — Урьдчилсан төсөвт өртгийн нийлбэр */
  budget: number;
  /** Нийт гэрээний дүн — гэрээ байгуулах эрх олгосон дүнгийн нийлбэр */
  contract: number;
  /** Гүйцэтгэлийн хувь — өртгөөр ЖИГНЭСЭН дундаж */
  progress: number | null;
  /**
   * Тэр хувь НИЙТ төсвийн хэдэн хувийг хамарсан бэ (0–100).
   *
   * ⚠️ ЗААВАЛ ХАРУУЛНА. Гүйцэтгэл нь зөвхөн барилгын багцуудад (`Багц 1–4.2`)
   * хэмжигддэг бөгөөд cashflow-гийн 26 багцаас ердөө хэдхэн нь тэдгээр —
   * хамралтыг нуувал «56%» гэсэн тоо БҮХ төслийн явц мэт уншигдана.
   */
  progressCovered: number;
  /** Багц ажлын тоо — ялгаатай багцын тоо */
  packages: number;
  /** Нийт төрлийн тоо */
  types: number;
};

/**
 * ⚠️ Гүйцэтгэлийн хувь нь ЭНГИЙН ДУНДАЖ БИШ, ӨРТГӨӨР ЖИГНЭСЭН: 500 тэрбумын
 * ажил 30%-тай, 1 тэрбумынх 100%-тай байхад энгийн дундаж 65% гэж хэлэх бөгөөд
 * төслийн бодит явцыг хоёр дахин үнэлнэ. Хэмжигдээгүй (багц нь нэгтгэлд
 * олдоогүй) ажил хуваарьт ч, хүртвэрт ч ОРОХГҮЙ.
 */
export function kpisOf(rows: CfRow[], contractSum: number, progress: Map<string, number>): Kpi {
  let budget = 0;
  let wSum = 0;
  let wTop = 0;
  const pkgs = new Set<string>();
  const types = new Set<string>();

  for (const r of rows) {
    budget += r.cost;
    if (r.pkg) pkgs.add(bagtsKey(r.pkg));
    if (r.type) types.add(r.type);
    const p = progress.get(bagtsKey(r.pkg));
    if (p != null && r.cost > 0) { wSum += r.cost; wTop += (r.cost * p) / 100; }
  }

  return {
    budget,
    contract: contractSum,
    progress: wSum > 0 ? (wTop / wSum) * 100 : null,
    progressCovered: budget > 0 ? (wSum / budget) * 100 : 0,
    packages: pkgs.size,
    types: types.size,
  };
}

/** Гэрээний дүнгийн нийлбэр — шүүсэн мөрүүдээс (тусад нь: `CfRow`-д ороогүй) */
export const loadContractSum = cached<Map<number, number>>(async () => {
  const rows = await queryFeatures(CF.url, { outFields: ['OBJECTID', CF.contract], limit: 4000 });
  return new Map(rows.map((r) => [nOf(r.OBJECTID), nOf(r[CF.contract])]));
}, undefined, ['CASHFLOW_NEW']);

/* ══════════════════════ ХАБ — ӨНӨӨДРИЙН БАЙДЛААР ══════════════════════ */

export type HseNow = {
  /** Хамгийн сүүлд бөглөсөн огноо, `YYYY-MM-DD` */
  date: string;
  workers: number;
  equipment: number;
  manHours: number;
};

/**
 * ХАБ-ын СҮҮЛИЙН бүртгэл.
 *
 * ⚠️ «Өнөөдрийн байдлаар» гэдгийг ӨНӨӨДРИЙН ОГНООГООР шүүхгүй: маягт өдөр
 * бүр бөглөгддөггүй тул өнөөдөр хоосон байвал индикатор 0 гэж худал хэлнэ.
 * Оронд нь СҮҮЛИЙН бөглөгдсөн мөрийг авч, түүний огноог хамт үзүүлнэ —
 * хэрэглэгч тоо нь хэдийнх болохыг хардаг.
 */
export const loadHseNow = cached<HseNow | null>(async () => {
  const f = HABEA.labor.fields;
  const rows = await queryFeatures(HABEA.labor.url, {
    outFields: [f.ognoo, f.niitAjiltan, f.hunTsag, f.niitTehnik],
    orderBy: `${f.ognoo} DESC`,
    limit: 1,
  });
  const r = rows[0];
  if (!r) return null;
  const ms = Number(r[f.ognoo]);
  return {
    date: Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '',
    workers: nOf(r[f.niitAjiltan]),
    equipment: nOf(r[f.niitTehnik]),
    manHours: nOf(r[f.hunTsag]),
  };
}, 5 * 60_000);
