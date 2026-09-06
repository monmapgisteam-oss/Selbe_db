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
  /** Гүйцэтгэлийн хувь — ТЕКСТ талбар («19.01») */
  progress: 'Guitsetgel_huwi',
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
  /** Захирамжийн дүн нийт дүн — ОЛГОСОН дүн */
  decree: number;
  /**
   * Гүйцэтгэлийн хувь, 0–100.
   *
   * ⚠️ Үйлчилгээнд ТЕКСТ талбар («19.01») тул `Number()`-ээр хөрвүүлнэ.
   * ⚠️ `null` ба `0` ХОЁР ӨӨР: «хэмжигдээгүй» ба «огт эхлээгүй». Хоёуланг
   * нь 0 болговол дундаж чимээгүй доошилно.
   */
  progress: number | null;
  /** Эх үүсвэр бүрийн дүн — `CF_SOURCES[i].field` дарааллаар */
  src: number[];
};

const nOf = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
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
  const rows = await queryFeatures(CF.url, {
    outFields: [
      'OBJECTID', CF.type, CF.project, CF.pkg, CF.cost, CF.note,
      CF.start, CF.end, CF.share, CF.contract, CF.decree, CF.progress,
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
    decree: nOf(r[CF.decree]),
    progress: pOf(r[CF.progress]),
    src: CF_SOURCES.map((s) => nOf(r[s.field])),
  }));
}, undefined, ['CASHFLOW_NEW']);

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ГУРВАН ХЭМЖЭЭС, тус бүр нь ОЛОН СОНГОЛТТОЙ.
 *
 * ⚠️ ХООСОН МАССИВ = «бүгд». `null` ашиглаагүй шалтгаан: «юу ч сонгоогүй» ба
 * «бүгдийг сонгосон» хоёр ИЖИЛ утгатай тул хоёр өөр төлөв барих нь зөрчил
 * үүсгэнэ (UI сүүлийн чагтыг тайлахад аль руу нь буцахаа мэдэхгүй болно).
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

/** Сонголтод байгаа эсэх — хоосон олонлог нь БҮГДИЙГ хүлээн авна */
const hit = (sel: number[], v: number) => sel.length === 0 || sel.includes(v);

/**
 * Ажил сонгосон хугацаанд ХАМААРАХ эсэх.
 *
 * ⚠️ Огнооны ЦЭГЭЭР биш, ХУГАЦААНЫ ДАВХЦЛААР: ажил бүр [эхлэх, дуусах]
 * интервалтай тул «2026 он» гэдэгт 2025-д эхлээд 2027-д дуусах ажил ЗААВАЛ
 * орно. Эхлэх огноогоор шүүвэл олон жилийн ажил дунд жилүүддээ алга болж,
 * S-муруй тасарна.
 *
 * ⚠️ АРГА: интервалын САР бүрийг гүйлгэж, аль нэг сар нь гурван хэмжээст
 * ЗЭРЭГ тохирвол ажил хамаарна. Ингэснээр «2026 · 2-р улирал» гэх мэт
 * ХОСЛОЛ нэмэлт дүрэмгүйгээр зөв ажиллана — цонх бодох, жилгүй улирлыг
 * тусад нь боловсруулах шаардлагагүй.
 *
 * ⚠️ ОГНООГҮЙ мөр шүүлт ИДЭВХТЭЙ үед ГАРНА — «мэдэгдэхгүй» нь «хамаарна»
 * гэсэн үг биш. Шүүлтгүй үед бүгд орно.
 */
export function inPeriod(r: CfRow, p: Period): boolean {
  if (!periodActive(p)) return true;
  const a = r.start;
  const b = r.end ?? r.start;
  if (a == null || b == null) return false;

  const s = new Date(a);
  const e = new Date(b);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  const ey = e.getUTCFullYear();
  const em = e.getUTCMonth();

  /* ⚠️ 480 = 40 жилийн хамгаалалт: өгөгдлийн алдаанаас болж хөлдөхөөс
     сэргийлнэ (бодит муж 2024–2029). */
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
 * ⚠️ ГҮЙЦЭТГЭЛИЙГ `Guitsetgel_huwi`-ЭЭС ШУУД авна (2026-09-04). Урьд нь тэр
 * багана хоосон байсан тул багцын нэгтгэлээс (`BAGTS_NEGTGEL`) багцын нэрээр
 * холбодог байв — гэвч cashflow-гийн 26 багцаас ердөө 2 нь тэнд хэмжигддэг
 * тул чартын 6 мөрийн 4 нь ХООСОН гардаг байлаа. Одоо мөр бүр өөрийн
 * хувьтай.
 *
 * ⚠️ ХЭМЖИГДЭЭГҮЙ мөр (`progress == null`) дэд дүнд ОРОХГҮЙ — 0 гэж бодвол
 * «хийгдээгүй» гэсэн худал мэдэгдэл болно.
 */
export function chartTypeCost(rows: CfRow[]): SubBar[] {
  return groupSum(
    rows,
    (r) => r.type,
    (r) => r.cost,
    (r) => (r.progress == null ? 0 : (r.cost * r.progress) / 100),
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

/**
 * 3б-р чарт — ЭХ ҮҮСВЭР × МӨНГӨН ДҮН (2026-09-04, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Тооны хувилбартай (`chartSourceCount`) ЗЭРЭГЦЭЖ оршино, орлохгүй:
 * «хэдэн ажил» ба «хэдэн төгрөг» хоёр өөр асуулт бөгөөд хариу нь эрс
 * зөрдөг — Нийслэлийн төсөв 2 ажилтай ч ердөө 4.3 тэрбум, Үнэт цаас 51
 * ажилтай бөгөөд 1,488 тэрбум.
 *
 * ⚠️ Суурь нь `Urdch_tusuwt_urtug` БИШ, ЭХ ҮҮСВЭРИЙН ӨӨРИЙН талбарууд.
 * Тэдгээрийн нийлбэр (2,457 тэрбум) нь нийт төсвөөс (2,513) 55 тэрбумаар
 * бага — захирамжийн дүн бүх ажилд бүрэн бүртгэгдээгүй. Тиймээс энэ чартын
 * хувь нь «эх үүсвэрүүдийн дотор эзлэх хувь», нийт төсөвт эзлэх БИШ.
 */
export function chartSourceAmount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      value += r.src[i];
      if (r.note === CONTRACTED) sub += r.src[i];
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
/**
 * S-МУРУЙН ТЭНХЛЭГИЙН НАРИЙВЧЛАЛ.
 *
 * ⚠️ ШҮҮЛТИЙН ТҮВШИНТЭЙ ТААРНА (2026-09-04, хэрэглэгчийн тодруулга): жил
 * сонговол ЖИЛЭЭР, улирал сонговол УЛИРЛААР, сар сонговол САРААР. Урьд нь
 * шүүлт идэвхтэй бол ямагт сар руу задалдаг байсан тул «2026» сонгоход 12
 * цэг, «1-р улирал» сонгоход 3 цэг гарч, хэрэглэгчийн сонгосон түвшингээс
 * илүү нарийн зурагддаг байв.
 */
export type Grain = 'year' | 'quarter' | 'month';

/** Сонгосон шүүлтийн ХАМГИЙН НАРИЙН түвшин — тэнхлэгийн алхам үүнтэй таарна */
export const grainOf = (p: Period): Grain =>
  (p.months.length > 0 ? 'month' : p.quarters.length > 0 ? 'quarter' : 'year');

/** Улирлын шошго — «2026 II». Богино тул тэнхлэгт цэг олон байсан ч багтана */
const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * НИЙТ ТӨСЛИЙН S-МУРУЙ — хугацааны туршид хуримтлагдах хөрөнгө оруулалтын %.
 *
 * ⚠️ ЯАГААД ИЙМ АРГА: даалгаварт «Төлөвлөгөөт хугацаа эхлэх / дуусах хоёрын
 * нэг нь тэнхлэг болно» гэсэн. Аль нэгийг СОНГОВОЛ муруй гажина — эхлэхээр
 * авбал бүх зардал ажил эхэлмэгц нэг дор суух (шаталсан шат), дуусахаар авбал
 * ажил дуустал юу ч болоогүй мэт харагдана. Тиймээс ХОЁУЛАНГ нь авч, ажил
 * бүрийн эзлэх хувийг эхлэх→дуусах хоорондох САРУУДАД ЖИГД тарааж, дараа нь
 * хуримтлуулна — S хэлбэрийг өгөгдөл өөрөө гаргана.
 *
 * ⚠️ Жин нь `Zah_eh_unet_tsaas_huwi` (нийт хөрөнгө оруулалтад эзлэх хувь).
 * Хоосон бол тэр ажил муруйд ОРОХГҮЙ — 0 гэж тооцвол огноогүй ажил муруйг
 * доош татна.
 *
 * ⚠️ ГУРВАН АЛХАМ, ДАРААЛАЛ НЬ ЧУХАЛ: (1) сараар хуваарилах, (2) БҮХ түүхээр
 * хуримтлуулах, (3) сонгосон хугацаагаар таслаад нарийвчлалдаа буулгах.
 * Хуримтлалыг таслалтын ДАРАА хийвэл 2026-ийн эхний цэг 0%-ээс эхэлж
 * «төсөл шинээр эхэлж байна» гэсэн ХУДАЛ уншилт гарна.
 */
export function sCurve(rows: CfRow[], grain: Grain = 'year', period: Period = NO_PERIOD): CurvePoint[] {
  /* ── 1. Сар бүрийн эзлэх хувь ── */
  const per = new Map<string, number>();
  for (const r of rows) {
    if (r.share <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth();

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
   *
   * ⚠️ Нийлбэр БИШ, СҮҮЛИЙН утга: цуваа нь аль хэдийн хуримтлал тул сарын
   * утгуудыг нэмбэл хувь нь хэдэн зуу болно. `keep` нь эрэмбэлэгдсэн тул
   * дараагийн бичилт бүр өмнөхөө дарж, эцэст нь бүлгийн сүүлийнх үлдэнэ.
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
export function kpisOf(rows: CfRow[], contractSum: number): Kpi {
  let budget = 0;
  let wSum = 0;
  let wTop = 0;
  const pkgs = new Set<string>();
  const types = new Set<string>();

  for (const r of rows) {
    budget += r.cost;
    if (r.pkg) pkgs.add(bagtsKey(r.pkg));
    if (r.type) types.add(r.type);
    /* ⚠️ Хэмжигдээгүй ажил хуваарьт ч, хүртвэрт ч ОРОХГҮЙ */
    if (r.progress != null && r.cost > 0) {
      wSum += r.cost;
      wTop += (r.cost * r.progress) / 100;
    }
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

/* ══════════════ ХУГАЦААНЫ НЭГДСЭН ЦУВАА ══════════════ */

export type TimePoint = {
  key: string;
  label: string;
  /** Хуримтлагдсан эзлэх хувь (S-муруй) */
  pct: number;
  /** Тухайн үед ногдох захирамжийн олгосон дүн (хуримтлалгүй) */
  amount: number;
};

/**
 * НЭГ ТЭНХЛЭГ ДЭЭР ХОЁР ХЭМЖИГДЭХҮҮН — багана нь МӨНГӨ, муруй нь ХУВЬ.
 *
 * ⚠️ ХОЁР ЧАРТЫГ НЭГТГЭСЭН (2026-09-04, хэрэглэгчийн хүсэлт). Тусад нь
 * байхад хоёр тэнхлэг өөр өөр нүдээр уншигдаж, «2026-д ачаалал оргилдоо
 * хүрч, муруй эгц өгссөн» гэсэн ХОЛБОО нүднээс далд үлддэг байв.
 *
 * ⚠️ НҮДНҮҮД НЬ ХОЁУЛАНГИЙН НЭГДЭЛ: захирамжийн дүн 2027-д дуусдаг ч
 * төлөвлөгөө 2029 хүртэл үргэлжилдэг. Аль нэгийнхээр нь тайрвал нөгөө нь
 * дундуураа тасарна. Утга байхгүй нүдэнд 0 биш — багана зурагдахгүй,
 * муруй хуримтлалаа хадгална.
 *
 * ⚠️ Хуваарилалт нь `sCurve`-ТЭЙ ИЖИЛ: эхлэх→дуусах саруудад жигд тарааж,
 * дараа нь нэгтгэнэ. Хувь нь ХУРИМТЛАЛ (таслахаас өмнө бодогдоно), мөнгө
 * нь ТУХАЙН ҮЕИЙНХ (нийлбэр).
 */
export function timeline(
  rows: CfRow[],
  grain: Grain = 'year',
  period: Period = NO_PERIOD,
): TimePoint[] {
  const share = new Map<string, number>();
  const money = new Map<string, number>();

  const spread = (r: CfRow, w: number, into: Map<string, number>) => {
    if (w <= 0 || r.start == null) return;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const n = Math.min(480, Math.max(1,
      (e.getUTCFullYear() - y) * 12 + (e.getUTCMonth() - m) + 1));
    const step = w / n;
    for (let i = 0; i < n; i += 1) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      into.set(k, (into.get(k) ?? 0) + step);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  };

  for (const r of rows) {
    spread(r, r.share, share);
    spread(r, r.decree, money);
  }
  const months = [...new Set([...share.keys(), ...money.keys()])].sort();
  if (months.length === 0) return [];

  /* Хувь — ХУРИМТЛАЛ, таслахаас ӨМНӨ (§sCurve-ийн тайлбар) */
  let acc = 0;
  const cum = new Map<string, number>();
  for (const k of months) {
    acc += share.get(k) ?? 0;
    cum.set(k, Math.round(acc * 100) / 100);
  }

  const keep = months.filter((k) => {
    if (!periodActive(period)) return true;
    const y = Number(k.slice(0, 4));
    const m = Number(k.slice(5, 7));
    return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1) && hit(period.months, m);
  });
  if (keep.length === 0) return [];

  if (grain === 'month') {
    return keep.map((k) => ({ key: k, label: k, pct: cum.get(k) ?? 0, amount: money.get(k) ?? 0 }));
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
      /* Хувь — бүлгийн СҮҮЛИЙНХ (хуримтлал тул нэмэхгүй) */
      pct: cum.get(k) ?? 0,
      /* Мөнгө — бүлгийн НИЙЛБЭР (хуримтлал биш тул нэмнэ) */
      amount: (prev?.amount ?? 0) + (money.get(k) ?? 0),
    });
  }
  return [...out.values()];
}

/* ══════════════ ЗАХИРАМЖИЙН ДҮН — ХУГАЦААГААР ══════════════ */

/**
 * ОЛГОСОН ДҮН хугацааны хуваарилалтаар — БАГАНАН чарт (2026-09-04).
 *
 * ⚠️ Хуваарилах АРГА нь `sCurve`-ТЭЙ ИЖИЛ: ажил бүрийн дүнг төлөвлөгөөт
 * эхлэх→дуусах хоорондох саруудад ЖИГД тарааж, дараа нь хугацааны нүд
 * бүрээр НИЙЛҮҮЛНЭ. Эхлэх огноонд бүтнээр нь тавибал захирамж гарсан сард
 * хэдэн зуун тэрбумын шонгууд гарч, дунд нь хоосон үлдэнэ.
 *
 * ⚠️ ХУРИМТЛАЛГҮЙ — S-муруйгаас ЯГ ЭНДЭЭРЭЭ ялгаатай. Багана нь «тэр
 * хугацаанд ХЭДЭН ТӨГРӨГ ногдож байна» гэдгийг хэлнэ; хуримтлуулбал бүх
 * багана өмнөхөөсөө өндөр болж, аль үе ачаалалтай болох нь харагдахгүй.
 *
 * ⚠️ Тэнхлэгийн нарийвчлал ба таслалт нь `sCurve`-тэй нэг дүрмээр
 * (`grainOf`, `hit`) — хоёр чарт нэг хугацааны шугаман дээр зэрэгцэж
 * уншигдах ёстой.
 */
export function decreeSeries(
  rows: CfRow[],
  grain: Grain = 'year',
  period: Period = NO_PERIOD,
): CurvePoint[] {
  const per = new Map<string, number>();
  for (const r of rows) {
    if (r.decree <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth();

    const n = Math.min(480, Math.max(1, (ey - y) * 12 + (em - m) + 1));
    const step = r.decree / n;
    for (let i = 0; i < n; i += 1) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      per.set(k, (per.get(k) ?? 0) + step);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  if (per.size === 0) return [];

  const months = [...per.keys()].sort().filter((key) => {
    if (!periodActive(period)) return true;
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1) && hit(period.months, m);
  });
  if (months.length === 0) return [];

  if (grain === 'month') {
    return months.map((k) => ({ key: k, label: k, value: per.get(k) ?? 0 }));
  }

  /* Нарийвчлалд буулгах — энд НИЙЛБЭР (хуримтлал биш тул нэмэх нь зөв) */
  const out = new Map<string, { label: string; value: number }>();
  for (const k of months) {
    const y = k.slice(0, 4);
    const m = Number(k.slice(5, 7));
    const q = Math.floor((m - 1) / 3) + 1;
    const bk = grain === 'year' ? y : `${y}-${q}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[q - 1]}`;
    const prev = out.get(bk);
    out.set(bk, { label, value: (prev?.value ?? 0) + (per.get(k) ?? 0) });
  }
  return [...out].map(([key, v]) => ({ key, label: v.label, value: v.value }));
}

/* ══════════════ ЧӨЛӨӨГДӨӨГҮЙ ТАЛБАР — ШАЛТГААНААР ══════════════ */

/**
 * Шалтгаан → тэр шалтгаантай ҮЛДСЭН нэгж талбаруудын ObjectID.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: «Багцын төрлөөр давхцаж буй» тоог ШАЛТГААНААР
 * нарийсгахын тулд. `overlapLeftParcels` нь орон зайн огтлолцлыг л мэддэг
 * (аль талбар аль багцтай), шалтгааны талаар юу ч мэдэхгүй — хоёрыг
 * ObjectID-аар огтолж холбоно.
 *
 * ⚠️ Шалтгааны нэрийг `land.ts`-ийн `cleanReason`-ТОЙ ЯГ ИЖИЛ дүрмээр
 * цэвэрлэнэ (арын зай, төгсгөлийн цэг). Зөрвөл жагсаалт дээр дарсан
 * шалтгаан энэ зураглалд олдохгүй бөгөөд давхцал ҮРГЭЛЖ хоосон гарна.
 * `cleanReason` нь `land.ts`-д хувийн тул дүрмийг энд ХУУЛСАН — өөрчлөгдвөл
 * ХОЁУЛАНГ нь хамт өөрчил.
 */
export const loadReasonOids = cached<Map<string, Set<number>>>(async () => {
  const { PARCEL_LEFT } = await import('@/lib/services');
  const F = PARCEL_LEFT.fields;
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: `${F.status}='Үлдсэн нэгж талбар'`,
    outFields: ['OBJECTID', F.progress],
    limit: 4000,
  });

  const clean = (v: unknown): string => {
    const t = String(v ?? '').trim().replace(/\.$/, '').trim();
    return !t || t === '—' ? tr('Тодорхойгүй') : t;
  };

  const m = new Map<string, Set<number>>();
  for (const r of rows) {
    const k = clean(r[F.progress]);
    const oid = nOf(r.OBJECTID);
    if (!oid) continue;
    const set = m.get(k) ?? new Set<number>();
    set.add(oid);
    m.set(k, set);
  }
  return m;
}, undefined, ['PARCEL_LEFT']);

/* ══════════════ ДЭД БАГЦ → ГАЗРЫН ЗУРГИЙН ДАВХАРГА ══════════════ */

export type SubPkg = { key: string; label: string; layerIds: string[] };

/**
 * Cashflow-гийн «Дэд багц» → газрын зургийн `pkg:*` давхаргууд.
 *
 * ⚠️ `Bagts` БИШ `Ded_bagts`. Газрын зургийн давхаргууд ДЭД багцын түвшинд
 * бүртгэлтэй (`Багц 5.1`, `Багц 16.3` …) бол `Bagts` нь эцэг түвшин
 * («БАГЦ-5») — 2026-09-04-нд хэмжсэнээр `Bagts` ердөө 9/26 таарч байсныг
 * `Ded_bagts` 42/53 болгосон.
 *
 * ⚠️ ДИАПАЗОН НҮДИЙГ ХАСНА (`isPkgRange`). «БАГЦ 1- 4» нь `bagtsKey`-ээр
 * «БАГЦ14» болдог бөгөөд тэр нь БОДИТ «Багц 14»-ийн ЯГ түлхүүр — хасахгүй
 * бол ТЭЗҮ 1–4-ийн зураг төсөл нь дулааны сувгийн давхаргад наалдана
 * (`services.ts`-ийн `isPkgRange`-ийн тайлбар).
 *
 * ⚠️ Таарахгүй дэд багц (Багц 1–4.2 барилга, Багц 8, 18) ЖАГСААЛТААС ГАРНА:
 * тэдгээрт `pkg:*` давхарга байхгүй тул зурагт үзүүлэх зүйлгүй.
 */
export const loadSubPkgLayers = cached<SubPkg[]>(async () => {
  const { PKG_BY_BAGTS, bagtsKey, isPkgRange } = await import('@/lib/services');
  const rows = await queryFeatures(CF.url, { outFields: ['Ded_bagts'], limit: 4000 });

  const seen = new Map<string, string>();
  for (const r of rows) {
    const raw = sOf(r.Ded_bagts);
    if (!raw || isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (!k || !PKG_BY_BAGTS[k]?.length) continue;
    if (!seen.has(k)) seen.set(k, raw);
  }
  return [...seen]
    .map(([key, label]) => ({ key, label, layerIds: PKG_BY_BAGTS[key] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}, undefined, ['CASHFLOW_NEW']);
