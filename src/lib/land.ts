'use client';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН НЭГДСЭН АМЬД ТООЦОО — `PARCEL_LEFT`.
 */

import { queryFeatures, sqlStr, type Aoi, type Row } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { PARCEL_CLEARED, PARCEL_LEFT } from '@/lib/services';
import { text } from '@/lib/format';
import { register } from '@/lib/dataBus';

/* ══════════════ ТӨЛӨВИЙН ХЭВИЙНШҮҮЛЭЛТ — `Gazar.tsx` ба энэ файл ХУВААЛЦАНА ══════════════ */

/**
 * Харьцуулах түлхүүр — зай нэгтгэж (NBSP орно), төгсгөлийн цэг/зайг хасаж,
 * жижиг үсгээр. ЗӨВХӨН ЖИШИХЭД — хадгалах/харуулах утга БИШ.
 */
const cmpKey = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[\s.]+$/, '').toLocaleLowerCase('mn');
const CLEARED_KEY = cmpKey(PARCEL_CLEARED);

/**
 * «Бүрэн чөлөөлсөн»-ийн АЛЬ Ч бичиглэл мөн үү.
 */
export const isClearedStatus = (v: unknown): boolean => cmpKey(v) === CLEARED_KEY;

/**
 * Төлөвийн БҮЛГИЙН түлхүүр: «Бүрэн чөлөөлсөн»-ийн бүх бичиглэл → `PARCEL_CLEARED`,
 * хоосон/«—» → `''` (дуудагч өөрийн «Тодорхойгүй» шошгыг тавина), бусад нь
 * trim хийсэн ТҮҮХИЙ утга (өмнөх дүрэм хэвээр).
 */
export function statusKey(v: unknown): string {
  if (isClearedStatus(v)) return PARCEL_CLEARED;
  const s = text(v, '').trim();
  return s === '—' ? '' : s;
}

/**
 * Төлөвийн баганыг ДАРЖ ШҮҮХ WHERE — бүлгийн ТҮҮХИЙ утгуудаас (`Gazar.tsx`).
 */
export function statusRawsWhere(field: string, raws: Iterable<string>, unknown: boolean, value: string): string {
  const eq = [...raws].filter((x) => x !== '').map((x) => `${field} = ${sqlStr(x)}`);
  if (unknown) return `(${[`${field} IS NULL`, `${field} = ''`, ...eq].join(' OR ')})`;
  return eq.length ? `(${eq.join(' OR ')})` : `${field} = ${sqlStr(value)}`;
}

/**
 * Талбайн НӨХӨЛТИЙН мөрүүд: `area_m2` хоосон, гараар бичсэн `Талб_1` бөглөгдсөн.
 */
export const parcelAltAreaWhere = (): string =>
  `${PARCEL_LEFT.fields.area} IS NULL AND ${PARCEL_LEFT.fields.areaAlt} IS NOT NULL`;

/** Полигоны (системийн) талбайн талбар — Enterprise-д `SHAPE__Area` (ТОМ `SHAPE`, бодит нэр) */
export const PARCEL_SHAPE_AREA = 'SHAPE__Area';

const posOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * НЭГ НЭГЖ ТАЛБАРЫН ТАЛБАЙ (м²): `area_m2` > 0 → түүнийг; эс бөгөөс `Талб_1` > 0; эс бөгөөс ПОЛИГОНЫ талбай; бүгд алга → null.
 */
export function parcelAreaOf(r: Row): number | null {
  const F = PARCEL_LEFT.fields;
  return posOrNull(r[F.area]) ?? posOrNull(r[F.areaAlt]) ?? posOrNull(r[PARCEL_SHAPE_AREA]);
}

/**
 * ХУВААГДСАН нэгж талбарын ДАВХАР талбай — ижил `parcel_id` БА ижил `area_m2`-тэй олон полигоны ЭХНИЙХ нь л талбайгаа
 * өгнө (бусад нь 0). 2026-10-22 (аудит): амьдаар 3 нэгж талбар 2 полигонд хуваагдаж бүтэн `area_m2`-оо давтдаг
 * (685 · 578 · 436 м²) — нийт талбайд хоёр тоологддог байв. Дугааргүй мөр хөндөгдөхгүй. Мөрийн ТОО өөрчлөгдөхгүй.
 */
export function parcelAreasDeduped(rows: readonly Row[]): (number | null)[] {
  const F = PARCEL_LEFT.fields;
  const seen = new Set<string>();
  return rows.map((r) => {
    const a = parcelAreaOf(r);
    const no = String(r[F.parcelNo] ?? '').trim();
    const raw = posOrNull(r[F.area]);
    if (a == null || !no || raw == null) return a;
    const k = `${no}|${raw}`;
    if (seen.has(k)) return 0;
    seen.add(k);
    return a;
  });
}

/**
 * Нэгж талбарын мөрүүдийг `field`-ээр (анхдагч: төлөв) БҮЛЭГЛЭНЭ — `queryGroup`-ийн хэлбэр `{ [field], n, a }`.
 * Талбай нь `parcelAreaOf` + хуваагдсан нэгж талбарыг нэг удаа (`parcelAreasDeduped`).
 */
export function parcelGroupRows(rows: readonly Row[], field: string = PARCEL_LEFT.fields.status): Row[] {
  const areas = parcelAreasDeduped(rows);
  const m = new Map<string, Row>();
  rows.forEach((r, i) => {
    const v = r[field];
    const k = v == null ? '\u0000null' : String(v);
    const g = m.get(k) ?? { [field]: v ?? null, n: 0, a: 0 };
    g.n = Number(g.n) + 1;
    g.a = Number(g.a) + (areas[i] ?? 0);
    m.set(k, g);
  });
  return [...m.values()];
}

/** Талбайн тооцоонд хэрэгтэй талбарууд */
const parcelAreaFields = (): string[] => {
  const F = PARCEL_LEFT.fields;
  return [...new Set([PARCEL_LEFT.oid, F.status, F.progress, F.area, F.areaAlt, F.parcelNo, PARCEL_SHAPE_AREA])];
};

/** Нэгж талбарын мөрүүд (талбайн тооцоонд, геометргүй) — `land.ts` ба `Gazar.tsx` (AOI-тай) хуваалцана */
export function loadParcelAreaRows(where = '1=1', aoi?: Aoi): Promise<Row[]> {
  return queryFeatures(PARCEL_LEFT.url, {
    where, outFields: parcelAreaFields(), orderBy: `${PARCEL_LEFT.oid} ASC`, ...(aoi ? { aoi } : {}),
  });
}

/** Газрын зориулалтын мэдэгдэх БҮТЭН нэрс (`landuse_de`-ийн амьд утгууд) — тасархай `Zoriulalt`-ийг нөхөхөд */
const LANDUSE_FULL: readonly string[] = [
  'Гэр, орон сууцны хашааны газар',
  'Гэр бүлийн хэрэгцээний зуслангийн газар',
  'Худалдаа, нийтийн үйлчилгээний газар, төв, цогцолбор',
  'Үйлдвэрлэлийн барилга, байгууламж, бусад газар',
];

/**
 * ГАЗРЫН ЗОРИУЛАЛТЫН ТЕКСТ — `landuse_de` (бүтэн), эс бөгөөс `Zoriulalt`; тасарсан `Zoriulalt`-ийг ГАНЦ таарах бүтэн
 * нэрээр нөхнө (`known` + `LANDUSE_FULL`). Хоосон/зай бол null.
 */
export function landuseText(full: unknown, short: unknown, known: readonly string[] = []): string | null {
  const f = String(full ?? '').trim();
  if (f) return f;
  const s = String(short ?? '').trim();
  if (!s) return null;
  const hits = [...new Set([...known, ...LANDUSE_FULL])].filter((k) => k !== s && k.startsWith(s));
  return hits.length === 1 ? hits[0] : s;
}

export type LandStatus = {
  /** Нийт нэгж талбар (бүх төлөв, хоосон Tuluv орно) */
  total: number;
  /** Нийт талбай, м² */
  areaM2: number;
  cleared: number;
  cleaned: number;
  remaining: number;
  /**
   * Шийдвэрлэгдсэн — одоо `cleared`-тай ИЖИЛ (`cleaned` нь үргэлж 0).
   */
  resolved: number;
  /** resolved ÷ total × 100 (0 хуваарьт null) */
  pct: number | null;
  /** Төлөв бүрийн тоо — жагсаалтад байгаа дарааллаар нь */
  byStatus: { label: string; n: number; areaM2: number }[];
  /**
   * ҮЛДСЭН талбарын шалтгаан — тоогоор буурах эрэмбээр.
   */
  reasons: { label: string; n: number }[];
};

let cache: Promise<LandStatus> | null = null;
const CACHE_TTL_MS = 5 * 60_000;
let cacheAt = 0;

register(() => { cache = null; }, ['PARCEL_LEFT']);

/** Шалтгааны нэрийг Gazar-тай ИЖИЛ дүрмээр цэвэрлэнэ (арын зай, төгсгөлийн «.») */
const cleanReason = (v: unknown): string => {
  const s = text(v).trim().replace(/\.$/, '').trim();
  return !s || s === '—' ? tr('Тодорхойгүй') : s;
};

/** Нэг удаа татаад кэшлэнэ — олон дашбоард зэрэг дуудахад нэг л багц хүсэлт явна */
export function loadLandStatus(): Promise<LandStatus> {
  if (!cache || Date.now() - cacheAt > CACHE_TTL_MS) {
    cacheAt = Date.now();
    const mine = loadParcelAreaRows().then((rows) => buildLandStatus(parcelGroupRows(rows), []));
    cache = mine;
    // Амжилтгүй амлалтыг кэшлэхгүй — «дахин оролдох» сэргэх боломжтой байг
    mine.catch(() => { if (cache === mine) cache = null; });
  }
  return cache;
}

/**
 * Хоёр асуулгын мөрөөс `LandStatus` угсарна — ЦЭВЭР функц (`land.check.mjs`).
 */
export function buildLandStatus(statusRows: Row[], altRows: Row[]): LandStatus {
  const L = PARCEL_LEFT;
  const labelOf = (v: unknown): string => statusKey(v) || tr('Тодорхойгүй');
  const byStatus: LandStatus['byStatus'] = [];
  for (const r of statusRows) {
    const label = labelOf(r[L.fields.status]);
    const n = Number(r.n ?? 0);
    const a = Number(r.a ?? 0);
    const g = byStatus.find((x) => x.label === label);
    if (g) { g.n += n; g.areaM2 += a; }
    else byStatus.push({ label, n, areaM2: a });
  }
  /*
   * `areaAlt` нөхөлт — area_m2 хоосон мөрийн гараар бичсэн талбайг харгалзах
   * төлөвт нь нэмнэ (нийт `areaM2` byStatus-аас нийлдэг тул мөн нөхөгдөнө).
   */
  for (const r of altRows) {
    const label = labelOf(r[L.fields.status]);
    const add = Number(r.a ?? 0);
    if (!add) continue;
    const g = byStatus.find((x) => x.label === label);
    if (g) g.areaM2 += add;
    else byStatus.push({ label, n: 0, areaM2: add });
  }
  const of = (v: string) => byStatus.find((x) => x.label === v)?.n ?? 0;
  const total = byStatus.reduce((s, x) => s + x.n, 0);
  const areaM2 = byStatus.reduce((s, x) => s + x.areaM2, 0);
  const cleared = of(PARCEL_CLEARED);
  const cleaned = 0;
  const remaining = total - cleared;
  const resolved = cleared;

  const rmap = new Map<string, number>();
  for (const r of byStatus) {
    if (r.label === PARCEL_CLEARED) continue;
    const k = cleanReason(r.label);
    rmap.set(k, (rmap.get(k) ?? 0) + r.n);
  }
  const reasons = [...rmap.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n);

  return {
    total, areaM2, cleared, cleaned, remaining, resolved,
    pct: total ? (resolved / total) * 100 : null,
    byStatus,
    reasons,
  };
}
