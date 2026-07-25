'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Donut, Bars, Ring, Data } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures, sqlStr, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_FIELDS, ZONE_NONE, ZONE_TYPES, ZONE_TYPE_EMPTY, ZONE_TYPE_EMPTY_HUE,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, BUILDING, BUILDING_STAGES, PROGRESS_LEVELS, STAGE_NA,
  SURVEY_HUE, LAYER_BY_ID, layerUrl, OID, oidOf, CASHFLOW, PARCEL_LEFT, PARCEL_CLEAN, PROJECT_PROGRESS,
  INVEST, investType, zoneKey, bagtsKey, PARCEL_PROGRESS_HUES, zoneCanon, zoneType, zoneTypeRaw, zoneWhere, zoneRefValues, zoneLegacyValues,
} from '@/lib/services';
import { useCashflow, type CashRow } from '@/lib/cashflow';
import { useInvest, type InvRow } from '@/lib/invest';
import { num, pct, ha, mnt, text } from '@/lib/format';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, COST_GROUPS, NO_DATA_COLOR, densityNormOf, profitScore,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats,
} from '@/lib/analysis/data';
import { loadCostsCached } from '@/lib/analysis/costs';
import { urbanScore, scoreColor, scoreLabel } from '@/lib/analysis/score';
import o from './overview.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ТОЙРСОН БҮРЭН CROSS-FILTER самбар.
 *
 * ⚠️ ЗАРЧИМ: түүхий мөрүүдийг (368 барилга · 113 блок · 52 бүс) НЭГ удаа татаж,
 * идэвхтэй шүүлтээр КЛИЕНТ талд дахин боддог. Тиймээс:
 *   · Элемент дээр дарах бүрд бусад элементийн тоо ШУУД шинэчлэгдэнэ (жишээ:
 *     багц сонгоход блокийн гүйцэтгэл, үе шат тэр багцаар дахин тооцогдоно).
 *   · Элемент бүр өөрийн ХЭМЖЭЭСийг тавьдаг; асуулга бүр бусад хэмжээсээр
 *     шүүгдэнэ (өөрийн хэмжээсийг ХАСна — эс бөгөөс жагсаалт нэг мөр рүү хумигдана).
 *   · Газрын зураг давхарга ТУС БҮРийг өөрийн WHERE-ээр шүүж, идэвхтэй хэмжээсийн
 *     давхаргыг л харуулна (`layerWhere` + `visible`).
 *
 * Барилгын блок (building_GOL) нь ET-ийн барилга/бүстэй өөр өгөгдлийн сан тул
 * тэдгээр хооронд cross-filter хийхгүй — блокийн хэмжээс (багц/түвшин) зөвхөн
 * блокийн элементүүдэд, ET-ийн хэмжээс (төлөв/зориулалт/бүс) зөвхөн барилга/бүсэд.
 *
 * ⚠️ БАЙРЛАЛ: багана бүр ГАНЦ сэдэвтэй — гүйцэтгэл · хөрөнгө оруулалт · [зураг] ·
 * газар чөлөөлөлт · ерөнхий төлөвлөгөө, доод эгнээ нь үнэлгээ ба норм. Шинэ карт
 * нэмэхдээ сэдэвт нь тааруулна: холимог багана нь хэрэглэгчийг «энэ тоо хаанаас
 * гарав» гэж хайхад хүргэдэг.
 *
 * ⚠️ 25 картаас 17 болгож ЦӨӨЛСӨН. Хассан 8 карт нь бүгд ӨӨР картын өгөгдлийг
 * давтаж байсан: багцын төсөв/гэрээ/гүйцэтгэгч → «Багцын мэдээлэл»,
 * санхүүжилтийн эх үүсвэр ба оны задаргаа → «Хөрөнгө оруулалт» (INVEST),
 * «Барилгын гүйцэтгэл» ба «Багц тус бүрийн гүйцэтгэл» → «Гүйцэтгэлийн түвшин» ба
 * «Багцын мэдээлэл», цэвэрлэгээ он оноор → статустай 1:1. Дахин нэмэхээсээ өмнө
 * ямар шинэ ХЭМЖЭЭС нэмж байгаагаа хэл.
 */

/* ══════════════════ Шүүлтийн төлөв ══════════════════ */

type Filters = {
  status?: string[];    // Barilga_ty (барилга) — олон сонголт
  purpose?: string[];   // Зориулалт_m (барилга) — олон сонголт
  zone?: string;        // ZONE_ID (бүс + барилга)
  zoneType?: string[];  // TOROL (бүс + барилга) — олон сонголт
  bagts?: string;       // BAGTS (блок)
  level?: string[];     // гүйцэтгэлийн түвшин key (блок) — олон сонголт
  /** Анализаас гарсан бүсийн олонлог (суитабилити/нягтшил/FAR·BCR) */
  zoneSet?: { key: string; label: string; ids: string[] };
  /** Дэд бүтэц (өртөг/инженер) — тухайн бүлгийн газрын зургийн давхаргууд */
  infra?: { key: string; label: string; ids: string[] };
  /** Хөрөнгө оруулалтын төрөл (INVEST.Төрөл) — зөвхөн хөрөнгө оруулалтын картуудад */
  investType?: string;
};

const F = BUILT_FIELDS;
const BF = BUILDING.fields;

/** Тухайн хэмжээсийг ХАСсан ET-барилгын шүүлт (өөрийн картад бүх ангилал харагдана) */
function buildMatch(a: Row, f: Filters, exclude?: keyof Filters): boolean {
  if (exclude !== 'status' && f.status?.length && !f.status.includes(text(a[F.status]))) return false;
  if (exclude !== 'purpose' && f.purpose?.length && !f.purpose.includes(text(a[F.purpose]))) return false;
  if (exclude !== 'zone' && f.zone && text(a[ZONE_FIELD]) !== f.zone) return false;
  if (exclude !== 'zoneType' && f.zoneType?.length && !f.zoneType.includes(zoneType(a.TOROL))) return false;
  if (exclude !== 'zoneSet' && f.zoneSet && !f.zoneSet.ids.includes(text(a[ZONE_FIELD]))) return false;
  return true;
}

/** Бүсийн шүүлт — бүсийн хэмжээсээр (KPI-ийн бодит бүсийн тоонд) */
function zoneMatch(a: Row, f: Filters): boolean {
  if (f.zone && text(a[ZONE_FIELDS.id]) !== f.zone) return false;
  if (f.zoneType?.length && !f.zoneType.includes(text(a[ZONE_FIELDS.type]))) return false;
  if (f.zoneSet && !f.zoneSet.ids.includes(text(a[ZONE_FIELDS.id]))) return false;
  return true;
}

/** Блокийн шүүлт — багц/түвшин (ET-ийн хэмжээсээс ХАМААРАЛГҮЙ) */
function blockMatch(a: Row, f: Filters, exclude?: 'bagts' | 'level'): boolean {
  if (exclude !== 'bagts' && f.bagts && text(a[BF.bagts]) !== f.bagts) return false;
  if (exclude !== 'level' && f.level?.length) {
    const g = Number(a[BF.progress] ?? STAGE_NA);
    const inAny = f.level.some((k) => {
      const lv = PROGRESS_LEVELS.find((l) => l.key === k);
      return lv && g >= lv.min && g < lv.max;
    });
    if (!inAny) return false;
  }
  return true;
}

/* ── Газрын зургийн давхаргын WHERE (идэвхтэй шүүлтээс) ── */

const and = (...cl: (string | null | undefined)[]) => {
  const xs = cl.filter(Boolean) as string[];
  return xs.length ? xs.join(' AND ') : null;
};
const inList = (field: string, ids: string[]) => (ids.length ? `${field} IN (${ids.map(sqlStr).join(', ')})` : '1=0');

function buildingsWhere(f: Filters): string | null {
  return and(
    f.status?.length ? inList(F.status, f.status) : null,
    f.purpose?.length ? inList(F.purpose, f.purpose) : null,
    f.zone && `${ZONE_FIELD} = ${sqlStr(f.zone)}`,
    f.zoneType?.length ? inList('TOROL', f.zoneType.flatMap(zoneTypeRaw)) : null,
    f.zoneSet && inList(ZONE_FIELD, f.zoneSet.ids),
  );
}
/**
 * ⚠️ БҮСИЙН давхаргын WHERE — бусад давхаргынхаас ӨӨР. Талбарын нэр
 * (`RefName_1`), кодын бичиглэл («Багц -1»), ангиллын бичиглэл («олон нийтийн
 * бүс») гурвуулаа зөрөх тул каноник утгыг эх бичиглэл рүү нь буцаан хөрвүүлнэ.
 */
function zonesWhere(f: Filters): string | null {
  const Zid = ZONE_LAYER.zoneField ?? ZONE_FIELD;
  const refs = (ids: string[]) => ids.flatMap(zoneRefValues);
  return and(
    f.zone ? zoneWhere(ZONE_LAYER, f.zone) : null,
    f.zoneType?.length ? inList(ZONE_FIELDS.type, f.zoneType.flatMap(zoneTypeRaw)) : null,
    f.zoneSet && inList(Zid, refs(f.zoneSet.ids)),
  );
}
function blocksWhere(f: Filters): string | null {
  const lvls = f.level?.length ? PROGRESS_LEVELS.filter((l) => f.level!.includes(l.key)) : [];
  const lvlClause = lvls.length
    ? `(${lvls.map((lv) => `(${BF.progress} >= ${lv.min} AND ${BF.progress} < ${lv.max})`).join(' OR ')})`
    : null;
  return and(
    f.bagts && `${BF.bagts} = ${sqlStr(f.bagts)}`,
    lvlClause,
  );
}

/**
 * Дашбоардын ЦӨМ давхаргууд — Бүс + Барилга. Шүүлтгүй үед зөвхөн эдгээр
 * харагдана (газрын зургийг цэвэр байлгах); блок (`mon:building`) нь зөвхөн
 * багц/гүйцэтгэл шүүхэд гарна.
 */
const DASH_CORE = [ZONE_LAYER.id, BUILT_LAYER.id];

/**
 * Идэвхтэй хэмжээсээс хамааран газрын зурагт ямар давхарга харуулах.
 * ⚠️ Бүс бол КОНТЕКСТ ХҮРЭЭ — аль ч шүүлтэд бүсийн хил ҮРГЭЛЖ харагдана
 * (жишээ нь барилгын төлвөөр шүүхэд тэдгээр барилгын бүсийн хил хэвээр).
 * Шүүсэн хэмжээсийн давхарга (барилга ЭСВЭЛ блок) хүрээн дээр нэмэгдэнэ.
 */
function visibleLayersFor(f: Filters): string[] {
  const blockDim = f.bagts || f.level?.length;
  const etDim = f.status?.length || f.purpose?.length || f.zone || f.zoneType?.length || f.zoneSet;
  if (f.infra) return [ZONE_LAYER.id, ...f.infra.ids];           // хүрээ + дэд бүтэц
  if (blockDim && !etDim) return [ZONE_LAYER.id, 'mon:building']; // хүрээ + блок
  return DASH_CORE;                                               // хүрээ + барилга
}

/* ══════════════════ Түүхий өгөгдөл (нэг удаа татна) ══════════════════ */

function useRawBuildings(): Async<Row[]> {
  return useAsync(() => queryFeatures(layerUrl(BUILT_LAYER), {
    outFields: [OID, ZONE_FIELD, 'TOROL', F.status, F.purpose, F.population, F.households, F.usable],
  }), []);
}

/**
 * ⚠️ Бүсийн код (`RefName_1`) ба ангилал («олон нийтийн бүс») нь бусад давхаргын
 * бичиглэлээс зөрдөг тул ТАТМАГЦ каноник болгоно. Ингэснээр дараагийн бүх
 * тооцоо — cross-filter, диаграмын өнгө, KPI — ганц бичиглэлтэй ажиллана.
 */
function useRawZones(): Async<Row[]> {
  const Z = ZONE_FIELDS;
  return useAsync(() => queryFeatures(layerUrl(ZONE_LAYER), {
    outFields: [oidOf(ZONE_LAYER), Z.id, Z.type, Z.landM2, Z.parkNorm, Z.parkPlanOpen, Z.parkPlanUnder],
  }).then((rows) => rows.map((r) => ({
    ...r,
    [Z.id]: zoneCanon(r[Z.id]),
    [Z.type]: zoneType(r[Z.type]),
  }))), []);
}

function useRawBlocks(): Async<Row[]> {
  return useAsync(() => queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, BF.bagts, BF.progress, BF.households, BF.floors, ...BUILDING_STAGES.map((s) => s.field)],
  }), []);
}

/* ══════════════════ Газар чөлөөлөлт (тусдаа FeatureServer-үүд) ══════════════════ */

/**
 * ⚠️ Cross-filter-т ОРОХГҮЙ: эдгээр нь ЕТ/блокоос өөр ZONE_ID схемтэй тусдаа
 * өгөгдлийн сан. Зөвхөн газар чөлөөлөлтийн явцыг өөрийн баганад дүрснэ.
 */
const PL = PARCEL_LEFT.fields;
const PC = PARCEL_CLEAN.fields;

function useLeftParcels(): Async<Row[]> {
  return useAsync(() => queryFeatures(PARCEL_LEFT.url, {
    outFields: [PL.progress, PL.area, PL.areaAlt, PL.block],
  }), []);
}

function useCleanParcels(): Async<Row[]> {
  return useAsync(() => queryFeatures(PARCEL_CLEAN.url, {
    outFields: [PC.status, PC.year, PC.cost],
  }), []);
}

/* ══════════════════ Cashflow — багцын төсөв / санхүүжилт (BUS_cashflow) ══════════════════ */

/**
 * ⚠️ Хүсэлт ба мөрийн загвар нь `@/lib/cashflow`-д — «Багцын мэдээлэл» харагдац
 * ч мөн адил уншдаг. Энд зөвхөн ДАШБОАРДЫН шүүлтийн логик үлдэнэ.
 */

/** Cashflow мөрийг идэвхтэй бүсийн шүүлтээр (шууд бүсийн хэмжээс) */
function cfMatch(r: CashRow, f: Filters): boolean {
  if (f.zone) return r.zone === f.zone;
  if (f.zoneSet) return f.zoneSet.ids.includes(r.zone);
  return true;
}

/* ══════════════════ Хөрөнгө оруулалт · өртөг (төсөл даяар) ══════════════════ */

/** ⚠️ Хүсэлт ба мөрийн загвар нь `@/lib/invest`-д — «Багцын мэдээлэл» ч уншина */

/**
 * Хөрөнгө оруулалтын мөрийг идэвхтэй шүүлтээр.
 * ⚠️ Бүсээр шүүхэд зөвхөн 9-р төрөл (олон нийтийн бүсийн барилга) бүстэй тул
 * бусад төрөл шүүлтэд ХАСАГДана — энэ нь зөв: тэдгээрийн зардал бүсэд хуваарилагдаагүй.
 */
function ivMatch(r: InvRow, f: Filters, exclude?: 'type'): boolean {
  if (f.zone && r.zone !== f.zone) return false;
  if (f.zoneSet && !f.zoneSet.ids.includes(r.zone)) return false;
  if (exclude !== 'type' && f.investType && r.type !== f.investType) return false;
  return true;
}

/* ══════════════════ Анализ — дэд бүтцийн өртөг ══════════════════ */

type CostSummary = {
  total: number; perHa: number;
  bySector: { key: string; label: string; value: number; color: string }[];
  engLengths: { key: string; label: string; km: number; color: string }[];
  /** Бүлэг (heat/water/…) → тухайн дэд бүтцийн газрын зургийн давхаргын id-үүд */
  groupLayers: Record<string, string[]>;
};

function useCosts(): Async<CostSummary> {
  return useAsync(async () => {
    const costs = await loadCostsCached();
    const byGroup: Record<string, number> = {};
    const groupLayers: Record<string, string[]> = {};
    for (const l of costs.layers) {
      byGroup[l.group] = (byGroup[l.group] ?? 0) + l.total;
      (groupLayers[l.group] ??= []).push(l.id);
    }
    const engLengths = ['heat', 'water', 'power'].map((g) => ({
      key: g, label: COST_GROUPS[g].label,
      km: costs.layers.filter((l) => l.group === g && l.qtyUnit === 'м').reduce((a, l) => a + l.qty, 0) / 1000,
      color: COST_GROUPS[g].color,
    })).filter((x) => x.km > 0);
    return {
      total: costs.total, perHa: costs.perHa,
      bySector: Object.entries(byGroup).map(([key, value]) => ({ key, value, label: COST_GROUPS[key].label, color: COST_GROUPS[key].color })).sort((a, b) => b.value - a.value),
      engLengths,
      groupLayers,
    };
  }, []);
}

/* ══════════════════ Анализ — тохиромжтой байдал ══════════════════ */

type SuitSummary = {
  avgScore: number | null;
  levels: { label: string; color: string; n: number; ids: string[] }[];
  noData: number; zones: number;
  profit: number; profitZones: number;
  ranked: { id: string; type: string; score: number | null }[];
  densityZones: { id: string; density: number }[];
  byId: Record<string, { score: number | null; type: string }>;
};

const blendOf = (u: number | null, e: number | null): number | null =>
  u == null && e == null ? null : u == null ? e : e == null ? u : u * (1 - DEFAULT_ECON_SHARE / 100) + e * (DEFAULT_ECON_SHARE / 100);

type ProgressCb = (msg: string, pct: number) => void;

function useSuitability(enabled: boolean, onProgress?: ProgressCb): Async<SuitSummary> {
  return useAsync(async () => {
    if (!enabled) return new Promise<SuitSummary>(() => {});
    const [data, costs] = await Promise.all([loadAnalysisCached(onProgress), loadCostsCached()]);
    computeEconomics(data.zones, costs.perHa, null, BUILD_COST_PER_M2);
    computeRaw(data.zones, defaultGreenCats(), PARKING);
    const blends = data.zones.map((z) => blendOf(urbanScore(z.raw, INDICATORS, z.type).score, profitScore(z.econ?.margin)));
    const valid = blends.filter((x): x is number => x != null);
    const revenue = data.zones.reduce((a, z) => a + (z.econ?.revenue ?? 0), 0);
    const cost = data.zones.reduce((a, z) => a + (z.econ?.cost ?? 0), 0);
    return {
      avgScore: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      levels: SCORE_LEVELS.map((L, i) => {
        const ids = data.zones.filter((_, j) => levelOf(blends[j]) === i).map((z) => z.id);
        return { label: L.label, color: L.color, n: ids.length, ids };
      }),
      noData: blends.filter((b) => levelOf(b) < 0).length,
      zones: data.zones.length,
      profit: revenue - cost,
      profitZones: data.zones.filter((z) => (z.econ?.profit ?? 0) > 0).length,
      ranked: data.zones.map((z, i) => ({ id: z.id, type: z.type, score: blends[i] })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      densityZones: data.zones.filter((z) => z.raw.density != null).map((z) => ({ id: z.id, density: z.raw.density as number })),
      byId: Object.fromEntries(data.zones.map((z, i) => [z.id, { score: blends[i], type: z.type }])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/* ══════════════════ Анализ — FAR / BCR ══════════════════ */

type NormEval = { pass: string[]; fail: string[]; none: number };
type FarBcr = { far: NormEval; bcr: NormEval };

function useFarBcr(): Async<FarBcr> {
  return useAsync(async () => {
    const Z = ZONE_FIELDS;
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), { outFields: [Z.id, Z.type, Z.far, Z.farPct, Z.bcr] });
    const far: NormEval = { pass: [], fail: [], none: 0 };
    const bcr: NormEval = { pass: [], fail: [], none: 0 };
    for (const r of rows) {
      const id = zoneCanon(r[Z.id]);
      const norm = densityNormOf(zoneType(r[Z.type]));
      const zf = r[Z.farPct] != null ? Number(r[Z.farPct]) / 100 : (r[Z.far] != null ? Number(r[Z.far]) : null);
      if (zf == null || !(zf > 0)) far.none++; else if (zf <= norm.farMax) far.pass.push(id); else far.fail.push(id);
      const zb = r[Z.bcr] != null ? Number(r[Z.bcr]) * 100 : null;
      if (zb == null || !(zb > 0)) bcr.none++; else if (zb <= norm.bcrMax) bcr.pass.push(id); else bcr.fail.push(id);
    }
    return { far, bcr };
  }, []);
}

/* ══════════════════ Үндсэн компонент ══════════════════ */

const BUILD_HUE = LAYER_BY_ID['mon:building'].hue;

export function Dashboard({ dim, setDim, zone, setZone }: {
  dim: Dim; setDim: (d: Dim) => void; zone: string | null; setZone: (z: string | null) => void;
}) {
  const rawB = useRawBuildings();
  const rawZ = useRawZones();
  const rawBlk = useRawBlocks();
  const costs = useCosts();
  const cash = useCashflow();
  const invest = useInvest();
  const farbcr = useFarBcr();
  const parcelLeft = useLeftParcels();
  const parcelClean = useCleanParcels();
  const project = useProjectProgress();
  const { setHighlight, zoomToZone, zoomToWhere } = useMap();

  /** Хүнд анализыг эхний paint-ийн дараа */
  const [heavy, setHeavy] = useState(false);
  const [prog, setProg] = useState<{ msg: string; pct: number }>({ msg: 'Хүлээж байна…', pct: 0 });
  useEffect(() => { setHeavy(true); }, []);
  const onProgress = useCallback((msg: string, pct: number) => setProg({ msg, pct }), []);
  const suit = useSuitability(heavy, onProgress);

  /**
   * ⚠️ Шүүлтийн ГАНЦ эх сурвалж. Хэмжээс бүрийг тавих/цуцлах.
   * `zone` нь порталтай хуваалцсан төлөв тул тусад нь удирдана.
   */
  const [filters, setFiltersState] = useState<Filters>({});
  const setDimFilter = useCallback(<K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
    setFiltersState((cur) => {
      const same = JSON.stringify(cur[k]) === JSON.stringify(v);
      return { ...cur, [k]: same ? undefined : v };
    });
  }, []);
  /** Барилгын төлөв — ОЛОН сонголт: дарсан төлвийг нэмнэ/хасна */
  const toggleStatus = useCallback((v: string) => {
    setFiltersState((cur) => {
      const arr = cur.status ?? [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return { ...cur, status: next.length ? next : undefined };
    });
  }, []);
  /** Барилгын зориулалт — ОЛОН сонголт: дарсан зориулалтыг нэмнэ/хасна */
  const togglePurpose = useCallback((v: string) => {
    setFiltersState((cur) => {
      const arr = cur.purpose ?? [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return { ...cur, purpose: next.length ? next : undefined };
    });
  }, []);
  /** Бүсийн ангилал — ОЛОН сонголт */
  const toggleZoneType = useCallback((v: string) => {
    setFiltersState((cur) => {
      const arr = cur.zoneType ?? [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return { ...cur, zoneType: next.length ? next : undefined };
    });
  }, []);
  /** Гүйцэтгэлийн түвшин — ОЛОН сонголт */
  const toggleLevel = useCallback((v: string) => {
    setFiltersState((cur) => {
      const arr = cur.level ?? [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return { ...cur, level: next.length ? next : undefined };
    });
  }, []);
  // Бүс нь порталын `zone`-той синк
  const filtersWithZone = useMemo<Filters>(() => ({ ...filters, zone: zone ?? undefined }), [filters, zone]);
  const setZoneDim = useCallback((z: string | null) => setZone(z), [setZone]);

  /** Идэвхтэй шүүлт байгаа эсэх (цэвэрлэх товч, chip-д) */
  const anyFilter = !!(zone || filters.status?.length || filters.purpose?.length || filters.zoneType?.length || filters.bagts || filters.level?.length || filters.zoneSet || filters.infra || filters.investType);
  const clearAll = useCallback(() => { setFiltersState({}); setZone(null); }, [setZone]);

  /* ── Газрын зураг: давхарга тус бүрийн WHERE + харагдах ── */
  const f = filtersWithZone;

  /**
   * Барилгын хэмжээсээр (төлөв/зориулалт) шүүхэд бүсийг тэдгээр барилгыг АГУУЛСАН
   * бүсүүд рүү хязгаарлана — бүсийн хил контекст боловч зөвхөн хамааралтай нь
   * (жишээ нь «баригдаж байгаа» барилга сонгоход тэдгээрийн бүсийн хил л үлдэнэ).
   */
  const zoneFromBuildings = useMemo<string | null>(() => {
    if (!(f.status?.length || f.purpose?.length)) return null;      // зөвхөн барилгын хэмжээст
    if (rawB.state !== 'ready') return null;
    // ⚠️ Барилга ХУУЧИН кодтой («D-8»), бүсийн давхарга ШИНЭ бичиглэлтэй
    //    («D-8.1»/«D-8.2», «Багц -1») — `zoneRefValues` хөрвүүлж тэлнэ.
    const refs = new Set<string>();
    for (const b of rawB.data) {
      if (!buildMatch(b, f)) continue;
      const z = text(b[ZONE_FIELD], '');
      if (z) zoneRefValues(z).forEach((v) => refs.add(v));
    }
    return refs.size ? inList(ZONE_LAYER.zoneField ?? ZONE_FIELD, [...refs]) : null;
  }, [f, rawB]);

  const layerWhere = useMemo<Record<string, string | null>>(() => ({
    [BUILT_LAYER.id]: buildingsWhere(f),
    [ZONE_LAYER.id]: and(zonesWhere(f), zoneFromBuildings),
    'mon:building': blocksWhere(f),
  }), [f, zoneFromBuildings]);
  const visible = useMemo(() => visibleLayersFor(f), [f]);

  // Порталын нэгдсэн `setHighlight`-ыг дашбоард ашиглахгүй — цэвэрлэж, layerWhere-ээр шүүнэ
  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /**
   * Шүүлт идэвхжихэд газрын зургийг ШҮҮСЭН feature рүү төвлүүлнэ. Ингэснээр
   * жишээ нь багц сонгоход зөвхөн тэр багцын блокууд дэлгэцийг дүүргэж, «бүх
   * барилга хэвээр байна» гэсэн ойлголт арилна. Хамгийн нарийн (spatial)
   * хэмжээсээр эрэмбэлж, тухайн давхаргын хүрээ рүү ниснэ. Шүүлт цэвэрлэгдвэл
   * бүх талбай руу буцаж холдоно. Анхны ачаалалд (шүүлтгүй) хөдөлгөхгүй.
   */
  const didZoom = useRef(false);
  useEffect(() => {
    const hasFilter = !!(f.zone || f.bagts || f.level?.length || f.status?.length || f.purpose?.length || f.zoneType?.length || f.zoneSet || f.infra);
    if (!hasFilter && !didZoom.current) return;   // анхны төлөв — холдуулахгүй
    didZoom.current = true;
    if (f.zone) { zoomToZone(f.zone); return; }
    if (f.bagts || f.level?.length) { zoomToWhere('mon:building', blocksWhere(f) ?? '1=1'); return; }
    if (f.status?.length || f.purpose?.length) { zoomToWhere(BUILT_LAYER.id, buildingsWhere(f) ?? '1=1'); return; }
    if (f.zoneType?.length || f.zoneSet) { zoomToWhere(ZONE_LAYER.id, zonesWhere(f) ?? '1=1'); return; }
    zoomToWhere(ZONE_LAYER.id, '1=1');            // дэд бүтэц / шүүлтгүй → бүх талбай
  }, [f, zoomToZone, zoomToWhere]);

  /** Зурагт бүс/барилга дарахад тухайн бүсийг сонгоно */
  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    // ⚠️ Бүсийн давхаргын объект `RefName_1`-тэй, барилгынх `ZONE_ID`-тэй ирнэ
    const zid = String(attrs[ZONE_FIELD] ?? attrs[ZONE_LAYER.zoneField ?? ''] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  const zinfo = zone && suit.state === 'ready' ? suit.data.byId[zone] : undefined;

  return (
    <div className={o.dash}>
      <div className={o.kpi}>
        <KpiStrip rawB={rawB} rawBlk={rawBlk} rawZ={rawZ} invest={invest} f={f} zone={zone} />
      </div>

      {/* ЗҮҮН — «юу баригдаж байна»: багц → блокийн гүйцэтгэл → үе шат */}
      <aside className={`${o.side} ${o.left}`}>
        <h2 className={o.colHead}>Гүйцэтгэл</h2>
        <ProjectProgressCard q={project} />
        <BagtsInfoCard cash={cash} rawBlk={rawBlk} f={f} onPick={(v) => setDimFilter('bagts', v)} />
        <ProgressCard rawBlk={rawBlk} f={f} onToggle={toggleLevel} />
        <StagesCard rawBlk={rawBlk} f={f} />
      </aside>

      {/* ХОЁРДУГААР — мөнгө: төрөл → эх үүсвэр → төсөл → сарын урсгал */}
      <aside className={`${o.side} ${o.fin}`}>
        <h2 className={o.colHead}>Хөрөнгө оруулалт</h2>
        <InvestTypeCard invest={invest} f={f} onPick={(v) => setDimFilter('investType', v)} />
        <InvestSourceCard invest={invest} f={f} />
        <InvestProjectCard invest={invest} f={f} />
        <MonthlyCashCard cash={cash} f={f} />
      </aside>

      <div className={o.map}>
        <MapCanvas dim={dim} visible={visible} zone={null} layerWhere={layerWhere} uniform onPick={pick} />

        <div className={o.mapDims} role="group" aria-label="Газрын зургийн харагдац">
          {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
            <button key={d} type="button" aria-pressed={dim === d}
              className={`${o.dimBtn} ${dim === d ? o.dimOn : ''}`} onClick={() => setDim(d)}>
              {d.toUpperCase()}
            </button>
          ))}
        </div>

        <MapLegend visible={visible} />
        {anyFilter && <FilterChips f={f} zinfo={zinfo} setDimFilter={setDimFilter} setZone={setZone} clearAll={clearAll} />}
      </div>

      {/* ЗУРГААС БАРУУН — газар чөлөөлөлт (ЕТ-ээс тусдаа өгөгдлийн сан) */}
      <aside className={`${o.side} ${o.uld}`}>
        <h2 className={o.colHead}>Газар чөлөөлөлт</h2>
        <ParcelLeftCard raw={parcelLeft} />
        <ParcelCleanBars
          raw={parcelClean}
          field={PC.status}
          title="Цэвэрлэгээний статус"
          note="буулгалтын өртөг"
          hues={(label) =>
            label.includes('авсан') ? '#22c55e'
              : label.includes('хүлээгдэж') ? '#f59e0b'
                : ZONE_TYPE_EMPTY_HUE}
        />
      </aside>

      {/* БАРУУН — «юу төлөвлөсөн»: бүс, барилга, зогсоол, инженер */}
      <aside className={`${o.side} ${o.right}`}>
        <h2 className={o.colHead}>Ерөнхий төлөвлөгөө</h2>
        <ZoneTypeCard rawZ={rawZ} f={f} onToggle={toggleZoneType} />
        <BuildStatusCard rawB={rawB} f={f} onToggle={toggleStatus} />
        <PurposeCard rawB={rawB} f={f} onToggle={togglePurpose} />
        <ParkingCard rawZ={rawZ} f={f} />
        <EngineeringCard costs={costs} f={f} onPick={(v) => setDimFilter('infra', v)} />
      </aside>

      {/* ДООД — үнэлгээ ба норм (бүх карт нь БҮСИЙН олонлогийг шүүнэ) */}
      <div className={o.bot}>
        <SuitabilityCard suit={suit} prog={prog} zone={zone} f={filters} setZoneSet={(v) => setDimFilter('zoneSet', v)} />
        <DensityCard suit={suit} f={filters} onPick={(v) => setDimFilter('zoneSet', v)} />
        <FarBcrCard farbcr={farbcr} f={filters} onPick={(v) => setDimFilter('zoneSet', v)} />
        <RankingCard suit={suit} zone={zone} setZone={setZoneDim} />
      </div>
    </div>
  );
}

/* ══════════════════ Газрын зургийн тайлбар + шүүлтийн chip ══════════════════ */

/**
 * Тайлбар — газрын зурагт БОДИТ харагдаж буй давхаргуудыг нэрээр нь. Давхарга
 * бүр өөрийн ганц өнгөтэй (`uniform`) тул нэг мөр = нэг давхарга.
 */
function MapLegend({ visible }: { visible: string[] }) {
  const vis = new Set(visible ?? []);
  const singles: { id: string; label: string; hue: string }[] = [
    { id: ZONE_LAYER.id, label: 'Бүс', hue: ZONE_LAYER.hue },
    { id: BUILT_LAYER.id, label: 'Барилга', hue: LAYER_BY_ID['et:24'].hue },
    { id: 'mon:building', label: 'Блок (гүйцэтгэл)', hue: LAYER_BY_ID['mon:building'].hue },
    { id: 'mon:survey', label: 'Талбайн тайлан', hue: SURVEY_HUE },
  ];
  const coreIds = new Set(singles.map((s) => s.id));
  // Цөмөөс гадуур харагдаж буй давхаргууд (дэд бүтэц) — каталогийн нэр/өнгөөр
  const extra = [...vis]
    .filter((id) => !coreIds.has(id) && LAYER_BY_ID[id])
    .map((id) => ({ id, label: LAYER_BY_ID[id].title, hue: LAYER_BY_ID[id].hue }));
  const items = [...singles.filter((s) => vis.has(s.id)), ...extra];
  return items.length ? (
    <div className={o.legend}>
      <div className={o.legendGroup}>
        {items.map((m) => <span key={m.id} className={o.legendItem}><i style={{ background: m.hue }} />{m.label}</span>)}
      </div>
    </div>
  ) : null;
}

/** Идэвхтэй шүүлтүүдийг chip болгон, тус бүрийг нь болон бүгдийг цуцлах */
function FilterChips({
  f, zinfo, setDimFilter, setZone, clearAll,
}: {
  f: Filters;
  zinfo?: { score: number | null; type: string };
  setDimFilter: <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => void;
  setZone: (z: string | null) => void;
  clearAll: () => void;
}) {
  const chips: { key: string; label: string; clear: () => void; score?: number | null }[] = [];
  if (f.zone) chips.push({ key: 'zone', label: `Бүс: ${f.zone}`, clear: () => setZone(null), score: zinfo?.score });
  if (f.zoneType?.length) chips.push({ key: 'zt', label: `Ангилал: ${f.zoneType.join(', ')}`, clear: () => setDimFilter('zoneType', undefined) });
  if (f.status?.length) chips.push({ key: 'st', label: `Төлөв: ${f.status.join(', ')}`, clear: () => setDimFilter('status', undefined) });
  if (f.purpose?.length) chips.push({ key: 'pu', label: `Зориулалт: ${f.purpose.join(', ')}`, clear: () => setDimFilter('purpose', undefined) });
  if (f.bagts) chips.push({ key: 'bg', label: `Багц: ${f.bagts}`, clear: () => setDimFilter('bagts', undefined) });
  if (f.level?.length) chips.push({ key: 'lv', label: `Гүйцэтгэл: ${f.level.map((k) => PROGRESS_LEVELS.find((l) => l.key === k)?.label ?? '').filter(Boolean).join(', ')}`, clear: () => setDimFilter('level', undefined) });
  if (f.zoneSet) chips.push({ key: 'zs', label: f.zoneSet.label, clear: () => setDimFilter('zoneSet', undefined) });
  if (f.infra) chips.push({ key: 'in', label: f.infra.label, clear: () => setDimFilter('infra', undefined) });
  if (f.investType) chips.push({ key: 'iv', label: `Хөрөнгө оруулалт: ${ivLabel(f.investType)}`, clear: () => setDimFilter('investType', undefined) });

  return (
    <div className={o.chipBar}>
      {chips.map((c) => (
        <div key={c.key} className={o.filterChip}>
          <span className={o.filterDot} aria-hidden />
          <span className={o.filterLabel}>{c.label}</span>
          {c.score != null && (
            <span className={`${o.filterCount} num`} style={{ background: scoreColor(c.score), color: '#fff' }}>{Math.round(c.score)}</span>
          )}
          <button type="button" className={o.filterClear} onClick={c.clear} aria-label="Цуцлах">×</button>
        </div>
      ))}
      {chips.length > 1 && (
        <button type="button" className={o.chipClearAll} onClick={clearAll}>Бүгдийг арилгах</button>
      )}
    </div>
  );
}

/* ══════════════════ Карт бүрхүүл ══════════════════ */

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={o.card}>
      <div className={o.cardHead}>
        <h3 className={o.cardTitle}>{title}</h3>
        {note && <span className={o.cardNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/* ══════════════════ KPI зурвас ══════════════════ */

function KpiStrip({ rawB, rawBlk, rawZ, invest, f, zone }: { rawB: Async<Row[]>; rawBlk: Async<Row[]>; rawZ: Async<Row[]>; invest: Async<InvRow[]>; f: Filters; zone: string | null }) {
  const b = rawB.state === 'ready' ? rawB.data.filter((x) => buildMatch(x, f)) : null;
  const blk = rawBlk.state === 'ready' ? rawBlk.data.filter((x) => blockMatch(x, f)) : null;
  // Бүсийн тоо газрын зурагтай нийцнэ: бүсийн хэмжээсээр шүүгээд, барилгын
  // хэмжээс (төлөв/зориулалт) идэвхтэй бол тэдгээр барилгыг агуулсан бүсээр хязгаарлана.
  let zc = rawZ.state === 'ready' ? rawZ.data.filter((x) => zoneMatch(x, f)) : null;
  if (zc && b && (f.status?.length || f.purpose?.length)) {
    const zids = new Set(b.map((x) => text(x[ZONE_FIELD])));
    // ⚠️ Бүсийн шинэ код (`D-8.1`) → барилгын хуучин код (`D-8`) руу буулгаж жишнэ
    zc = zc.filter((x) => zoneLegacyValues(text(x[ZONE_FIELDS.id])).some((v) => zids.has(v)));
  }
  const na = rawB.state === 'error' ? '—' : '…';
  const naBlk = rawBlk.state === 'error' ? '—' : '…';

  const pop = b ? b.reduce((a, x) => a + Number(x[F.population] ?? 0), 0) : null;
  const urh = b ? b.reduce((a, x) => a + Number(x[F.households] ?? 0), 0) : null;
  const m2 = b ? b.reduce((a, x) => a + Number(x[F.usable] ?? 0), 0) : null;
  const avgProg = blk && blk.length ? blk.filter((x) => Number(x[BF.progress] ?? -1) >= 0)
    : null;
  const progVal = avgProg && avgProg.length ? avgProg.reduce((a, x) => a + Number(x[BF.progress]), 0) / avgProg.length : null;

  const iv = invest.state === 'ready' ? invest.data.filter((r) => ivMatch(r, f)) : null;
  const invTotal = iv ? iv.reduce((a, r) => a + r.total, 0) : null;
  const naInv = invest.state === 'error' ? '—' : '…';

  const tiles: { v: string; u?: string; l: string; tone: string }[] = [
    zone ? { v: zone, l: 'Сонгосон бүс', tone: '#0ea5e9' } : { v: zc ? num(zc.length) : na, l: 'Бүс', tone: '#0d9488' },
    { v: b ? num(b.length) : na, l: 'Барилга', tone: '#3387b8' },
    { v: blk ? num(blk.length) : naBlk, l: 'Блок', tone: '#0891b2' },
    { v: pop == null ? na : num(pop), l: 'Хүн ам', tone: '#8b5cf6' },
    { v: urh == null ? na : num(urh), l: 'Өрх', tone: '#f59e0b' },
    { v: m2 == null ? na : ha(m2, 0), u: 'га', l: 'Барилгын талбай', tone: '#22c55e' },
    { v: progVal == null ? naBlk : pct(progVal, 0), l: 'Дундаж гүйцэтгэл', tone: '#ea580c' },
    { v: invTotal == null ? naInv : mnt(invTotal).replace(' ₮', ''), u: '₮', l: 'Хөрөнгө оруулалт', tone: '#a855f7' },
  ];
  return (
    <>
      {tiles.map((t) => (
        <div key={t.l} className={o.tile}>
          <span className={`${o.tileVal} num`}>{t.v}{t.u && <span className={o.tileUnit}>{t.u}</span>}</span>
          <span className={o.tileLabel}>{t.l}</span>
        </div>
      ))}
    </>
  );
}

/* ══════════════════ Барилгын төлөв ══════════════════ */

function BuildStatusCard({ rawB, f, onToggle }: { rawB: Async<Row[]>; f: Filters; onToggle: (v: string) => void }) {
  return (
    <Card title="Барилгын төлөв">
      <Data q={rawB} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((x) => buildMatch(x, f, 'status'));
          // Барилгажсан талбайг (м²) төлөв тус бүрээр нэгтгэж, га-гаар харуулна
          const items = BUILT_STATUS.map((st) => {
            const m2 = scoped
              .filter((x) => text(x[F.status]) === st.value)
              .reduce((a, x) => a + (Number(x[F.usable]) || 0), 0);
            return { key: st.value, label: st.value, color: st.hue, value: m2, display: `${ha(m2)} га` };
          }).filter((i) => i.value > 0);
          const total = items.reduce((a, i) => a + i.value, 0);
          return items.length ? (
            <Donut items={items} center={ha(total)} centerLabel="га нийт" size={92} width={16} nowrap
              selected={f.status ?? null} onSelect={onToggle} />
          ) : <p className={o.state}>Барилга алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Барилгын зориулалт ══════════════════ */

function PurposeCard({ rawB, f, onToggle }: { rawB: Async<Row[]>; f: Filters; onToggle: (v: string) => void }) {
  return (
    <Card title="Барилгын зориулалт">
      <Data q={rawB} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((x) => buildMatch(x, f, 'purpose'));
          const by = new Map<string, number>();
          for (const x of scoped) { const k = text(x[F.purpose], 'Тодорхойгүй'); by.set(k, (by.get(k) ?? 0) + 1); }
          const items = [...by.entries()].map(([label, n]) => ({ key: label, label, value: n, display: `${num(n)} ш` })).sort((a, b) => b.value - a.value);
          return items.length ? (
            <Bars color="#3387b8" limit={8} selected={f.purpose ?? null} onSelect={onToggle} items={items} inline />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Гүйцэтгэлийн түвшин (блок) ══════════════════ */

function ProgressCard({ rawBlk, f, onToggle }: { rawBlk: Async<Row[]>; f: Filters; onToggle: (v: string) => void }) {
  return (
    <Card title="Гүйцэтгэлийн түвшин">
      <Data q={rawBlk} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((x) => blockMatch(x, f, 'level'));
          const withProg = scoped.filter((x) => Number(x[BF.progress] ?? -1) >= 0);
          const avg = withProg.length ? withProg.reduce((a, x) => a + Number(x[BF.progress]), 0) / withProg.length : null;
          const ail = scoped.reduce((a, x) => a + Number(x[BF.households] ?? 0), 0);
          // «Барилгын гүйцэтгэл» картыг хассан — түүний ганц давхардаагүй үзүүлэлт энд шилжив
          const floors = scoped.map((x) => Number(x[BF.floors] ?? 0)).filter((v) => v > 0);
          const avgFloor = floors.length ? floors.reduce((a, b) => a + b, 0) / floors.length : null;
          const levels = PROGRESS_LEVELS.map((l) => ({
            ...l, value: scoped.filter((x) => { const g = Number(x[BF.progress] ?? -1); return g >= l.min && g < l.max; }).length,
          }));
          return (
            <>
              <div className={o.progressRow}>
                <Ring value={avg} color={BUILD_HUE} size={76} width={8} />
                <p className={o.progressText}><b>{num(scoped.length)}</b> блок · <b>{num(ail)}</b> айл.</p>
              </div>
              <Bars inline max={Math.max(1, ...levels.map((l) => l.value))} selected={f.level ?? null} onSelect={onToggle}
                items={levels.map((l) => ({ key: l.key, label: `${l.label} · ${l.range}`, value: l.value, display: `${num(l.value)} блок`, color: l.color }))} />
              <div className={o.miniStats}>
                <div><span>Дундаж давхар</span><b>{num(avgFloor, 1)}</b></div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Ажлын үе шат (блок) ══════════════════ */

/* ══════════════════ Төслийн нэгдсэн гүйцэтгэл (Төсөл_Гүйцэтгэл) ══════════════════ */

const PP = PROJECT_PROGRESS.fields;

type ProjectStage = {
  label: string;
  color: string;
  /** Төслийн нийт дүнд эзлэх жин (%) */
  weight: number;
  /** Жигнэсэн гүйцэтгэл, өөрийн жинд нормчилсон (%) */
  actual: number;
  /** Төлөвлөгөө — зөвхөн бөглөгдсөн мөрөөр; байхгүй бол null */
  planned: number | null;
  rows: number;
};

type ProjectProgress = {
  /** Жигнэсэн гүйцэтгэл — БОДИТ жингийн нийлбэрт нормчилсон (%) */
  actual: number;
  /** Хүснэгтэд бүртгэгдсэн нийт жин (%). 100 БИШ — доорх тайлбарыг үз. */
  coverage: number;
  /** Төлөвлөгөө ба гүйцэтгэл — ИЖИЛ мөрийн олонлогоор жишихэд */
  planned: number | null;
  actualVsPlan: number | null;
  stages: ProjectStage[];
};

/**
 * ТӨСЛИЙН нэгдсэн гүйцэтгэл — 6 үе шатаар жигнэсэн.
 *
 * ⚠️ Дашбоардын cross-filter-т ОРОХГҮЙ. Хүснэгтийн цорын ганц холбогдох
 * хэмжээс нь `bagts_name` бөгөөд тэр нь ДЭД БҮТЦИЙН багц («БАГЦ-5.1»), харин
 * дашбоардын `bagts` шүүлт нь БАРИЛГЫН багц («Багц 4.1») — өөр олонлог. Мөн
 * 162-оос 50 мөрд багц огт байхгүй. Шүүлтэд холбовол бүсээр шүүхэд карт
 * чимээгүй хоосорно; энэ нь төсөл ДАЯАРЫН үзүүлэлт тул үргэлж бүтэн харагдана.
 *
 * ⚠️ Жигнэсэн дүнг `Σ(жин × гүйц) / Σжин` гэж бодно, 100-д ХУВААХГҮЙ:
 * `Төсөлд_эзлэх_хувь`-ийн нийлбэр нь 81.5% (үлдсэн 18.5% нь хүснэгтэд
 * ороогүй). 100-д хуваавал гүйцэтгэл 22.5% гэж гарч, бодит 27.7%-иас чимээгүй
 * бага харагдана.
 *
 * ⚠️ Төлөвлөгөө ба гүйцэтгэлийг ЗӨВХӨН хоёулаа бөглөгдсөн мөрөөр жишнэ
 * (162-оос 74 мөрд төлөвлөгөө хоосон). Өөр хуваарьтай хоёр дүнг зэрэгцүүлбэл
 * «төлөвлөгөөнөөс хоцорсон» гэсэн дүгнэлт хиймлээр гарна.
 */
function useProjectProgress(): Async<ProjectProgress> {
  return useAsync(async () => {
    const rows = await queryFeatures(PROJECT_PROGRESS.url, {
      outFields: [PP.stage, PP.weight, PP.planned, PP.actual],
      limit: 2000,
    });

    const wOf = (r: Row) => Number(r[PP.weight]) || 0;
    const aOf = (r: Row) => Number(r[PP.actual] ?? 0) || 0;
    const norm = (rs: Row[], pick: (r: Row) => number) => {
      const w = rs.reduce((a, r) => a + wOf(r), 0);
      return w > 0 ? rs.reduce((a, r) => a + wOf(r) * pick(r), 0) / w : null;
    };

    const withPlan = rows.filter((r) => r[PP.planned] != null);
    const coverage = rows.reduce((a, r) => a + wOf(r), 0);

    return {
      actual: norm(rows, aOf) ?? 0,
      coverage,
      planned: norm(withPlan, (r) => Number(r[PP.planned]) || 0),
      actualVsPlan: norm(withPlan, aOf),
      stages: PROJECT_PROGRESS.stages.map((st) => {
        const rs = rows.filter((r) => text(r[PP.stage], '').trim() === st.value);
        const rp = rs.filter((r) => r[PP.planned] != null);
        return {
          label: st.label,
          color: st.color,
          weight: rs.reduce((a, r) => a + wOf(r), 0),
          actual: norm(rs, aOf) ?? 0,
          planned: norm(rp, (r) => Number(r[PP.planned]) || 0),
          rows: rs.length,
        };
      }).filter((st) => st.rows > 0),
    };
  }, []);
}

function ProjectProgressCard({ q }: { q: Async<ProjectProgress> }) {
  return (
    <Card title="Төслийн гүйцэтгэл" note="6 үе шат · жигнэсэн">
      <Data q={q} loading="Тооцож байна…">
        {(d) => (
          <>
            <div className={o.progressRow}>
              <Ring value={d.actual} size={84} width={9} color={BUILD_HUE} label="гүйцэтгэл" />
              <div className={o.miniStats}>
                {d.planned != null && (
                  <div><span>Төлөвлөгөө</span><b>{pct(d.planned, 1)}</b></div>
                )}
                {d.actualVsPlan != null && d.planned != null && (
                  <div>
                    <span>Зөрүү</span>
                    <b>{`${d.actualVsPlan >= d.planned ? '+' : '−'}${pct(Math.abs(d.actualVsPlan - d.planned), 1)}`}</b>
                  </div>
                )}
                {/* ⚠️ Хамралтыг НУУХГҮЙ: хүснэгтийн жингийн нийлбэр 100 биш тул
                    гүйцэтгэл нь бүртгэгдсэн ажлын хүрээнд л үнэн. */}
                <div><span>Хамрагдсан жин</span><b>{pct(d.coverage, 1)}</b></div>
              </div>
            </div>
            <Bars
              color={BUILD_HUE}
              max={100}
              inline
              items={d.stages.map((st) => ({
                key: st.label,
                label: st.label,
                value: st.actual,
                color: st.color,
                display: `${pct(st.actual, 1)} · жин ${pct(st.weight, 1)}${st.planned == null ? '' : ` · төлөв ${pct(st.planned, 0)}`}`,
              }))}
            />
          </>
        )}
      </Data>
    </Card>
  );
}

function StagesCard({ rawBlk, f }: { rawBlk: Async<Row[]>; f: Filters }) {
  return (
    <Card title="Ажлын үе шат">
      <Data q={rawBlk} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((x) => blockMatch(x, f));
          const items = BUILDING_STAGES.map((st) => {
            const vals = scoped.map((x) => Number(x[st.field] ?? STAGE_NA)).filter((v) => v > STAGE_NA);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            return { key: st.field, label: st.label, value: avg ?? 0, display: avg == null ? 'төлөвлөгдөөгүй' : pct(avg, 0) };
          });
          return <Bars inline color={BUILD_HUE} max={100} limit={8} items={items} />;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Бүсийн ангилал ══════════════════ */

function ZoneTypeCard({ rawZ, f, onToggle }: { rawZ: Async<Row[]>; f: Filters; onToggle: (v: string) => void }) {
  return (
    <Card title="Бүсийн ангилал">
      <Data q={rawZ} loading="Тооцож байна…">
        {(rows) => {
          // Талбайг (GAZAR_M2) ангилал тус бүрээр нэгтгэж га-гаар харуулна
          const by = new Map<string, number>();
          for (const x of rows) { const k = text(x[ZONE_FIELDS.type], ZONE_TYPE_EMPTY); by.set(k, (by.get(k) ?? 0) + (Number(x[ZONE_FIELDS.landM2]) || 0)); }
          const items = [...by.entries()].map(([label, m2]) => ({ key: label, label, value: m2, display: `${ha(m2)} га`, color: ZONE_TYPES[label] ?? ZONE_TYPE_EMPTY_HUE })).sort((a, b) => b.value - a.value);
          const total = items.reduce((a, i) => a + i.value, 0);
          return items.length ? (
            <Donut items={items} center={ha(total)} centerLabel="га нийт" size={96} width={16} nowrap
              selected={f.zoneType ?? null} onSelect={onToggle} />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Газар чөлөөлөлт ══════════════════ */

/** Явцын нэрсийг цэвэрлэх — «гэрээлсэн.» ба «гэрээлсэн» нэг ангилал; хоосон → нэртэй */
const cleanProgress = (v: string) => {
  const s = v.trim().replace(/\.$/, '');
  return s === '' || s === '—' ? 'Тодорхойгүй' : s;
};

/**
 * Нэгж талбарын хэмжээ (м²) — кадастрын `area_m2`, түүнгүй бол гараар бичсэн
 * `Талбай`.
 *
 * ⚠️ Ганц баганаар бодвол талбар унана: `area_m2` нь геометргүй 11 мөрд хоосон,
 * `Талбай` нь 45 мөрд хоосон. Хоёуланг нь авбал 224-өөс 222 хамрагдана.
 */
const parcelArea = (x: Row) => Number(x[PL.area]) || Number(x[PL.areaAlt]) || 0;

/**
 * ЧӨЛӨӨЛӨГДӨӨГҮЙ нэгж талбар — чөлөөлөлтийн явцаар.
 *
 * ⚠️ Дашбоардын ЕТ cross-filter-т ОРОХГҮЙ — тусдаа өгөгдлийн сан. Бүсийн код нь
 * ЕТ-тэй ИЖИЛ схемтэй ч бичиглэл нь бохир («A17» ↔ «A-17», «C-7-1» ↔ «C-7.1»,
 * «Багц 4.1.» гэсэн бүс биш утга, кирилл «А» ба латин «A» хольцтой) тул
 * тааруулалт 54% — холбовол ЧИМЭЭГҮЙ БУРУУ шүүлт өгнө. Тиймээс сонголт нь
 * ЗӨВХӨН энэ картын дотор ажиллана: ангилал сонгоход түүний задаргаа гарна.
 */
function ParcelLeftCard({ raw }: { raw: Async<Row[]> }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Card title="Үлдсэн нэгж талбар" note="чөлөөлөлтийн явц · дарж задална">
      <Data q={raw} loading="Тооцож байна…">
        {(rows) => {
          const by = new Map<string, { n: number; area: number }>();
          for (const x of rows) {
            const k = cleanProgress(text(x[PL.progress]));
            const cur = by.get(k) ?? { n: 0, area: 0 };
            cur.n += 1;
            cur.area += parcelArea(x);
            by.set(k, cur);
          }
          const items = [...by.entries()]
            .map(([label, v]) => ({
              key: label, label, value: v.n,
              display: `${num(v.n)} · ${ha(v.area)} га`,
              color: PARCEL_PROGRESS_HUES[label] ?? ZONE_TYPE_EMPTY_HUE,
            }))
            .sort((a, b) => b.value - a.value);
          const total = items.reduce((a, i) => a + i.value, 0);
          if (!items.length) return <p className={o.state}>Мэдээлэл алга.</p>;

          // Сонгосон ангиллын задаргаа — блокоор (`Блок` талбар).
          const cur = sel ? by.get(sel) : null;
          const byBlock = new Map<string, number>();
          if (sel) {
            for (const x of rows) {
              if (cleanProgress(text(x[PL.progress])) !== sel) continue;
              byBlock.set(text(x[PL.block]).trim() || '—', (byBlock.get(text(x[PL.block]).trim() || '—') ?? 0) + 1);
            }
          }
          const blocks = [...byBlock.entries()].sort((a, b) => b[1] - a[1]);

          // ⚠️ `stack` (nowrap БИШ): 10 ангилалын урт нэр («үнийн дүн
          //    зөвшөөрөөгүй») 240px нарийн баганад хажуугийн legend-д
          //    давхарлана. Донат дээр, legend доор бүтэн өргөнөөр тавина.
          return (
            <>
              <Donut
                items={items} center={num(cur ? cur.n : total)}
                centerLabel="талбар" size={116} width={18} stack
                selected={sel}
                onSelect={(k) => setSel((p) => (p === k ? null : k))}
              />
              {cur && (
                <div className={o.miniStats}>
                  <div><span>{sel}</span><b>{num(cur.n)} талбар</b></div>
                  <div><span>Талбай</span><b>{ha(cur.area)} га</b></div>
                  <div><span>Эзлэх хувь</span><b>{Math.round((cur.n / total) * 100)}%</b></div>
                  {blocks.map(([b, n]) => (
                    <div key={b}><span>{b}</span><b>{num(n)}</b></div>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/**
 * Цэвэрлэгдсэн талбар — ангиллаар нь буулгалтын ӨРТГӨӨР (₮). Статус ба Он.
 *
 * ⚠️ ЗӨВХӨН өртөгтэй бүлгүүд график болно. «Цэвэрлэгдээгүй» (257 талбар,
 * өртөггүй) нь тооны хэмжүүр тул өртгийн баганад холивол хамгийн урт багана
 * болж, төлбөрийн харьцааг гажуудуулна. Түүнийг доод мөрөнд тоогоор гаргана.
 */
/**
 * ⚠️ Дарж шүүх боломж ЗОРИУДААР алга: `Статус` ба `Он` нь энэ өгөгдөлд 1:1
 * хамааралтай (төлбөр авсан бүгд 2025, хүлээгдэж буй бүгд 2026). Хооронд нь
 * cross-filter хийвэл нөгөө карт ҮРГЭЛЖ ганц багана болж хумигдана — зөв
 * боловч эвдэрсэн мэт харагдана. Шинэ хэмжээс нэмэгдвэл дахин авч үзнэ.
 */
function ParcelCleanBars({
  raw, field, title, note, hues,
}: {
  raw: Async<Row[]>;
  field: string;
  title: string;
  note: string;
  hues: (label: string, i: number) => string;
}) {
  return (
    <Card title={title} note={note}>
      <Data q={raw} loading="Тооцож байна…">
        {(rows) => {
          const by = new Map<string, { n: number; cost: number }>();
          let pending = 0; // өртөггүй (цэвэрлэгдээгүй) талбарын тоо
          for (const x of rows) {
            const cost = Number(x[PC.cost]) || 0;
            if (cost <= 0) { pending += 1; continue; }
            const k = text(x[field]).trim() || 'Тодорхойгүй';
            const cur = by.get(k) ?? { n: 0, cost: 0 };
            cur.n += 1;
            cur.cost += cost;
            by.set(k, cur);
          }
          const items = [...by.entries()]
            .map(([label, v], i) => ({
              key: label, label, value: v.cost,
              display: mnt(v.cost),
              color: hues(label, i),
            }))
            .sort((a, b) => b.value - a.value);
          const totalCost = items.reduce((a, i) => a + i.value, 0);
          return items.length ? (
            <>
              <Bars inline items={items} />
              <div className={o.miniStats}>
                <div><span>Нийт өртөг</span><b>{mnt(totalCost)}</b></div>
                <div><span>Цэвэрлэгдээгүй</span><b>{num(pending)} талбар</b></div>
              </div>
            </>
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Зогсоолын хангамж ══════════════════ */

function ParkingCard({ rawZ, f }: { rawZ: Async<Row[]>; f: Filters }) {
  const Z = ZONE_FIELDS;
  return (
    <Card title="Зогсоолын хангамж">
      <Data q={rawZ} loading="Тооцож байна…">
        {(rows) => {
          const scoped = f.zone ? rows.filter((x) => text(x[Z.id]) === f.zone) : rows;
          const s = (fld: string) => scoped.reduce((a, x) => a + Number(x[fld] ?? 0), 0);
          const norm = s(Z.parkNorm);
          // ⚠️ Шинэ бүсийн давхаргад НИЙЛБЭР талбар байхгүй — ил + далдаас угсарна.
          //    «Одоо байгаа зогсоол» (ET_NIIT) талбар ч алга тул мөр нь хасагдав.
          const open = s(Z.parkPlanOpen), under = s(Z.parkPlanUnder);
          const plan = open + under;
          const rate = norm > 0 ? (plan / norm) * 100 : null;
          const gap = plan - norm;
          return (
            <>
              <div className={o.progressRow}>
                <Ring value={rate} color="#f59e0b" size={76} width={8} />
                <p className={o.progressText}>Төлөвлөсөн зогсоол нормын <b>{rate == null ? '—' : `${Math.round(rate)}%`}</b>-ийг хангана.</p>
              </div>
              <Bars inline max={Math.max(1, norm, plan)} items={[
                { key: 'norm', label: 'Норм (шаардлага)', value: norm, display: num(norm), color: '#64748b' },
                { key: 'plan', label: 'Төлөвлөсөн', value: plan, display: num(plan), color: '#f59e0b' },
              ]} />
              <div className={o.miniStats}>
                <div><span>Ил / далд</span><b>{num(open)} / {num(under)}</b></div>
                <div><span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span><b className={gap >= 0 ? o.pos : o.neg}>{gap >= 0 ? '+' : '−'}{num(Math.abs(gap))}</b></div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Тохиромжтой байдал (бүсийн олонлог шүүлт) ══════════════════ */

function SuitabilityCard({ suit, prog, zone, f, setZoneSet }: {
  suit: Async<SuitSummary>; prog: { msg: string; pct: number }; zone: string | null;
  f: Filters; setZoneSet: (v: Filters['zoneSet']) => void;
}) {
  if (suit.state === 'loading') {
    return (
      <Card title="Тохиромжтой байдал">
        <div className={o.load}><div className={o.loadMsg}>{prog.msg}</div>
          <div className={o.loadBar}><span style={{ width: `${Math.max(4, prog.pct)}%` }} /></div></div>
      </Card>
    );
  }
  if (suit.state === 'error') return <Card title="Тохиромжтой байдал"><p className={o.state}>Үнэлгээ бодогдсонгүй.</p></Card>;

  const d = suit.data;
  const zScore = zone ? d.byId[zone]?.score ?? null : undefined;
  const headScore = zone ? zScore ?? null : d.avgScore;
  const selKey = f.zoneSet?.key.startsWith('suit:') ? f.zoneSet.key.slice(5) : null;
  return (
    <Card title="Тохиромжтой байдал">
      <div className={o.progressRow}>
        <span className={o.bigScore} style={{ color: scoreColor(headScore) }}>{headScore == null ? '—' : Math.round(headScore)}</span>
        <p className={o.progressText}>
          {zone ? <><b>{zone}</b> бүсийн оноо · {scoreLabel(headScore)}.</> : <><b>{num(d.zones)}</b> бүсийн дундаж · {scoreLabel(headScore)}.</>}
        </p>
      </div>
      {/* ⚠️ Урьд нь дээр нь `Stack` зурвас байв — доорх баганууд ЯГ ижил тоог
          харуулдаг тул нэг өгөгдлийг хоёр удаа зурж, картыг хоёр дахин өндөр
          болгож байлаа. Зөвхөн багана үлдэв (дарж шүүх боломжтой нь энэ). */}
      <Bars inline max={Math.max(1, ...d.levels.map((l) => l.n))} selected={selKey}
        onSelect={(key) => { const lv = d.levels.find((l) => l.label === key); setZoneSet(lv ? { key: `suit:${key}`, label: `Үнэлгээ: ${key}`, ids: lv.ids } : undefined); }}
        items={d.levels.map((l) => ({ key: l.label, label: l.label, value: l.n, display: `${num(l.n)} бүс`, color: l.color }))} />
      <div className={o.miniStats}>
        <div><span>Нийт ашиг/алдагдал</span><b className={d.profit >= 0 ? o.pos : o.neg}>{mnt(d.profit)}</b></div>
        <div><span>Ашигтай бүс</span><b>{num(d.profitZones)} / {num(d.zones)}</b></div>
        {d.noData > 0 && <div><span>Өгөгдөлгүй</span><b style={{ color: NO_DATA_COLOR }}>{num(d.noData)} бүс</b></div>}
      </div>
    </Card>
  );
}

/* ══════════════════ Хүн амын нягтшил (бүсийн олонлог шүүлт) ══════════════════ */

const DENSITY_BANDS = [
  { key: 'b1', label: '< 150', lo: 0, hi: 150, color: '#f59e0b' },
  { key: 'b2', label: '150–300', lo: 150, hi: 300, color: '#a3d84a' },
  { key: 'b3', label: '300–450', lo: 300, hi: 450, color: '#16a34a' },
  { key: 'b4', label: '450–700', lo: 450, hi: 700, color: '#f59e0b' },
  { key: 'b5', label: '> 700', lo: 700, hi: Infinity, color: '#ef4444' },
];

function DensityCard({ suit, f, onPick }: { suit: Async<SuitSummary>; f: Filters; onPick: (v: Filters['zoneSet']) => void }) {
  const selKey = f.zoneSet?.key.startsWith('dens:') ? f.zoneSet.key.slice(5) : null;
  return (
    <Card title="Хүн амын нягтшил">
      <Data q={suit} loading="Тооцож байна…">
        {(d) => {
          const buckets = DENSITY_BANDS.map((b) => ({ ...b, ids: d.densityZones.filter((z) => z.density >= b.lo && z.density < b.hi).map((z) => z.id) }));
          return (
            <>
              <Bars inline max={Math.max(1, ...buckets.map((b) => b.ids.length))} selected={selKey}
                onSelect={(key) => { const b = buckets.find((x) => x.key === key); onPick(b ? { key: `dens:${key}`, label: `Нягтшил: ${b.label} хүн/га`, ids: b.ids } : undefined); }}
                items={buckets.map((b) => ({ key: b.key, label: `${b.label} хүн/га`, value: b.ids.length, display: `${num(b.ids.length)} бүс`, color: b.color }))} />
              <p className={o.normNote}>БНбД 30-01-24, 6.9: 300–450 хүн/га норм. Зөвхөн оршин суугчтай бүс.</p>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ FAR / BCR (бүсийн олонлог шүүлт) ══════════════════ */

const PASS_HUE = '#16a34a';
const FAIL_HUE = '#ef4444';

function FarBcrCard({ farbcr, f, onPick }: { farbcr: Async<FarBcr>; f: Filters; onPick: (v: Filters['zoneSet']) => void }) {
  return (
    <Card title="FAR / BCR норм">
      <Data q={farbcr} loading="Тооцож байна…">
        {(d) => (
          <>
            <NormRow name="FAR" desc="Нягтралын коэффициент" e={d.far} f={f} onPick={onPick} />
            <NormRow name="BCR" desc="Барилгажилтын нягтрал" e={d.bcr} f={f} onPick={onPick} />
          </>
        )}
      </Data>
    </Card>
  );
}

function NormRow({ name, desc, e, f, onPick }: { name: 'FAR' | 'BCR'; desc: string; e: NormEval; f: Filters; onPick: (v: Filters['zoneSet']) => void }) {
  const key = name.toLowerCase();
  const rate = (e.pass.length + e.fail.length) ? (e.pass.length / (e.pass.length + e.fail.length)) * 100 : null;
  const selKey = f.zoneSet?.key.startsWith(`fb:${key}-`) ? f.zoneSet.key.slice(3) : null;
  const seg = (kind: 'pass' | 'fail') => {
    const ids = kind === 'pass' ? e.pass : e.fail;
    return { key: `${key}-${kind}`, label: kind === 'pass' ? 'Норм хангасан' : 'Норм зөрчсөн', value: ids.length, display: `${num(ids.length)} бүс`, color: kind === 'pass' ? PASS_HUE : FAIL_HUE };
  };
  return (
    <div className={o.normRow}>
      <div className={o.normHead}>
        <span className={o.normName}>{name}</span>
        <span className={o.normDesc}>{desc}</span>
        <b className={o.normRate} style={{ color: scoreColor(rate) }}>{rate == null ? '—' : `${Math.round(rate)}%`}</b>
      </div>
      <Bars inline max={Math.max(1, e.pass.length, e.fail.length)} selected={selKey}
        onSelect={(k) => { const ids = k.endsWith('pass') ? e.pass : e.fail; onPick({ key: `fb:${k}`, label: `${name}: ${k.endsWith('pass') ? 'норм хангасан' : 'зөрчсөн'}`, ids }); }}
        items={[seg('pass'), seg('fail')]} />
      {e.none > 0 && <div className={o.normNone}>+ {num(e.none)} бүс барилгажилт төлөвлөөгүй</div>}
    </div>
  );
}

/* ══════════════════ Инженерийн шугам · Дэд бүтцийн өртөг · Асуудал (төсөл даяар) ══════════════════ */

function EngineeringCard({ costs, f, onPick }: { costs: Async<CostSummary>; f: Filters; onPick: (v: Filters['infra']) => void }) {
  return (
    <Card title="Инженерийн шугам">
      <Data q={costs} loading="Тооцож байна…">
        {(d) => d.engLengths.length ? (
          <>
            <Bars inline max={Math.max(1, ...d.engLengths.map((e) => e.km))}
              selected={f.infra?.key ?? null}
              onSelect={(key) => { const ids = d.groupLayers[key] ?? []; onPick(ids.length ? { key, label: `Дэд бүтэц: ${COST_GROUPS[key]?.label ?? key}`, ids } : undefined); }}
              items={d.engLengths.map((e) => ({ key: e.key, label: e.label, value: e.km, display: `${num(e.km, 1)} км`, color: e.color }))} />
            <div className={o.miniStats}><div><span>Нийт урт</span><b>{num(d.engLengths.reduce((a, e) => a + e.km, 0), 1)} км</b></div></div>
          </>
        ) : <p className={o.state}>Мэдээлэл алга.</p>}
      </Data>
    </Card>
  );
}

/* ══════════════════ Багцын мэдээлэл (төсөв × гүйцэтгэл) ══════════════════ */

type BagtsInfo = {
  /** Блокийн `BAGTS` утга — `f.bagts` шүүлт ЯГ үүнтэй тулгагдана */
  key: string;
  label: string;
  budget: number; contract: number; contractor: string;
  blocks: number; ail: number;
  /** Гүйцэтгэл бүртгэгдсэн блокийн тоо — багцуудыг нэгтгэхэд ЖИН нь болно */
  scored: number;
  progress: number | null;
};

/**
 * Багцын САНХҮҮ (BUS_cashflow) ба ГҮЙЦЭТГЭЛ (building_GOL) хоёрыг нэгтгэнэ.
 *
 * ⚠️ Багцын нэр хоёр эх сурвалжид өөр бичигдсэн («Багц-4.1» ↔ «Багц 4.1») тул
 * `bagtsKey`-ээр л жишнэ. Харин ГАРАХ түлхүүр нь БЛОКИЙН бичиглэл байх ёстой —
 * `blockMatch` нь `f.bagts`-ыг блокийн талбартай яг тааруулж шүүдэг.
 */
function joinBagts(cash: CashRow[], blocks: Row[]): BagtsInfo[] {
  const by = new Map<string, BagtsInfo & { sum: number }>();
  const slot = (k: string, label: string) => {
    const cur = by.get(k) ?? { key: label, label, budget: 0, contract: 0, contractor: '—', blocks: 0, ail: 0, scored: 0, progress: null, sum: 0 };
    by.set(k, cur);
    return cur;
  };
  for (const r of cash) {
    const s = slot(bagtsKey(r.zone), r.zone);
    s.budget += r.budget; s.contract += r.contract;
    if (r.contractor) s.contractor = r.contractor;
  }
  for (const b of blocks) {
    const name = text(b[BF.bagts], 'Тодорхойгүй');
    const s = slot(bagtsKey(name), name);
    s.key = name;                                  // блокийн бичиглэл — шүүлтийн түлхүүр
    s.blocks += 1;
    s.ail += Number(b[BF.households] ?? 0);
    const g = Number(b[BF.progress] ?? -1);
    if (g >= 0) { s.sum += g; s.scored += 1; }
  }
  return [...by.values()]
    .map(({ sum, ...s }) => ({ ...s, progress: s.scored ? sum / s.scored : null }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

const progressHue = (p: number | null) =>
  p == null ? ZONE_TYPE_EMPTY_HUE : PROGRESS_LEVELS.find((l) => p >= l.min && p < l.max)?.color ?? BUILD_HUE;

/** Багц бүрийн төсөв, гэрээ, гүйцэтгэгч, блок — дарж багцаар шүүнэ */
function BagtsInfoCard({ cash, rawBlk, f, onPick }: {
  cash: Async<CashRow[]>; rawBlk: Async<Row[]>; f: Filters; onPick: (v: string) => void;
}) {
  if (cash.state !== 'ready' || rawBlk.state !== 'ready') {
    const err = cash.state === 'error' || rawBlk.state === 'error';
    return <Card title="Багцын мэдээлэл"><p className={o.state}>{err ? 'Мэдээлэл алга.' : 'Тооцож байна…'}</p></Card>;
  }
  const list = joinBagts(cash.data, rawBlk.data);
  if (!list.length) return <Card title="Багцын мэдээлэл"><p className={o.state}>Мэдээлэл алга.</p></Card>;

  const sel = f.bagts ? list.find((x) => x.key === f.bagts) ?? null : null;
  const scope = sel ? [sel] : list;
  const budget = scope.reduce((a, x) => a + x.budget, 0);
  const contract = scope.reduce((a, x) => a + x.contract, 0);
  const scored = scope.reduce((a, x) => a + x.scored, 0);
  const progress = scored ? scope.reduce((a, x) => a + (x.progress ?? 0) * x.scored, 0) / scored : null;
  return (
    <Card title="Багцын мэдээлэл" note="төсөв · дарж шүүнэ">
      <Bars inline items={list.map((x) => ({
        key: x.key, label: x.label.replace(/^багц[\s-]*/i, 'Багц '), value: x.budget,
        display: mnt(x.budget), color: progressHue(x.progress),
      }))} selected={f.bagts ?? null} onSelect={onPick} />
      <div className={o.miniStats}>
        <div><span>Төсөвт өртөг</span><b>{mnt(budget)}</b></div>
        <div><span>Гэрээлсэн</span><b>{mnt(contract)}{budget > 0 && ` · ${Math.round((contract / budget) * 100)}%`}</b></div>
        <div><span>Блок · айл</span><b>{num(scope.reduce((a, x) => a + x.blocks, 0))} · {num(scope.reduce((a, x) => a + x.ail, 0))}</b></div>
        <div><span>Гүйцэтгэл</span><b style={{ color: progressHue(progress) }}>{pct(progress, 0)}</b></div>
      </div>
      {sel && <p className={o.normNote}>{sel.contractor}</p>}
    </Card>
  );
}

/* ══════════════════ Хөрөнгө оруулалт (INVEST) ══════════════════ */

const ivHue = (type: string) => investType(type)?.color ?? ZONE_TYPE_EMPTY_HUE;
/** Диаграмд БОГИНО нэр; эх нэр нь урт бөгөөд бүтэн том үсэгтэй */
const ivLabel = (type: string) => investType(type)?.short ?? type.replace(/^\d+\.\s*/, '');

/** Төрөл тус бүрийн нийт хөрөнгө оруулалт — дарж бусад картыг шүүнэ */
function InvestTypeCard({ invest, f, onPick }: { invest: Async<InvRow[]>; f: Filters; onPick: (v: string) => void }) {
  return (
    <Card title="Хөрөнгө оруулалт төрлөөр" note="дарж задална">
      <Data q={invest} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((r) => ivMatch(r, f, 'type'));
          const by = new Map<string, number>();
          for (const r of scoped) by.set(r.type, (by.get(r.type) ?? 0) + r.total);
          const items = [...by.entries()]
            .map(([type, v]) => ({ key: type, label: ivLabel(type), value: v, display: mnt(v), color: ivHue(type) }))
            .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
          if (!items.length) return <p className={o.state}>Мэдээлэл алга.</p>;
          const sel = rows.filter((r) => ivMatch(r, f));
          const confirmed = sel.reduce((a, r) => a + r.confirmed, 0);
          const planned = sel.reduce((a, r) => a + r.planned, 0);
          return (
            <>
              <Bars inline items={items} selected={f.investType ?? null} onSelect={onPick} />
              <div className={o.miniStats}>
                <div><span>Баталгаажсан</span><b>{mnt(confirmed)}</b></div>
                <div><span>Урьдчилсан</span><b>{mnt(planned)}</b></div>
                <div><span>Төрөл · төсөл</span><b>{num(items.length)} · {num(sel.length)}</b></div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/**
 * Санхүүжилтийн эх үүсвэр — 5 багана + ШИЙДЭГДЭЭГҮЙ үлдэгдэл.
 * ⚠️ Үлдэгдлийг заавал харуулна: 90 мөрийн 28-д эх үүсвэр бөглөгдөөгүй (захирамж
 * гараагүй) тул зөвхөн 5 багана бодвол нийлбэр KPI-ийн нийт дүнгээс бага гарна.
 * Задаргааг `INVEST`-ийн тайлбараас (33.4 импортод орхигдсон + 449.5 эх өгөгдөлд
 * хоосон).
 */
function InvestSourceCard({ invest, f }: { invest: Async<InvRow[]>; f: Filters }) {
  return (
    <Card title="Санхүүжилтийн бүтэц" note="хөрөнгө оруулалт">
      <Data q={invest} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((r) => ivMatch(r, f));
          const items = INVEST.sources.map((s, i) => ({
            key: s.field, label: s.label, color: s.color,
            value: scoped.reduce((a, r) => a + r.sources[i], 0),
          }));
          const total = scoped.reduce((a, r) => a + r.total, 0);
          const known = items.reduce((a, i) => a + i.value, 0);
          const all = [...items, { key: 'na', label: 'Захирамж гараагүй', color: ZONE_TYPE_EMPTY_HUE, value: Math.max(0, total - known) }]
            .filter((i) => i.value > 0).map((i) => ({ ...i, display: mnt(i.value) }));
          const [amt, ...u] = mnt(total).split(' ');
          return all.length ? (
            <Donut items={all} center={amt} centerLabel={u.join(' ')} size={120} width={16} stack />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/** Урт төслийн нэрийг тайрах — «Суурийн холболтын зургийн дагуух гэрээний…» */
const clip = (s: string, n = 46) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * ТӨСӨЛ тус бүрийн дүн — багана бүрийн өнгө нь ТӨРӨЛ.
 * Төрөл сонгосон бол зөвхөн түүний төслүүд (гарчгийн тэмдэглэлд төрлийн нэр).
 */
function InvestProjectCard({ invest, f }: { invest: Async<InvRow[]>; f: Filters }) {
  return (
    <Card title="Төсөл тус бүрээр" note={f.investType ? ivLabel(f.investType) : 'өнгө = төрөл'}>
      <Data q={invest} loading="Тооцож байна…">
        {(rows) => {
          const items = rows.filter((r) => ivMatch(r, f))
            .map((r, i) => ({
              key: `${i}`, label: clip(r.project), value: r.total,
              display: mnt(r.total), color: ivHue(r.type),
            }))
            .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
          if (!items.length) return <p className={o.state}>Мэдээлэл алга.</p>;
          const total = items.reduce((a, i) => a + i.value, 0);
          return (
            <>
              <Bars limit={6} items={items} />
              <div className={o.miniStats}>
                <div><span>Төсөл</span><b>{num(items.length)}</b></div>
                <div><span>Нийт дүн</span><b>{mnt(total)}</b></div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Сарын мөнгөн урсгал (cashflow) ══════════════════ */

/**
 * ⚠️ `BUS_cashflow`-оос үлдсэн ГАНЦ карт. Багцын төсөв, гэрээ, гүйцэтгэгч,
 * санхүүжилтийн эх үүсвэр, оны задаргаа зэрэг бусад картууд ХАСАГДСАН: тэдгээр нь
 * «Багцын мэдээлэл» (багц бүрийн төсөв·гэрээ·гүйцэтгэгч нэг картад) ба
 * «Хөрөнгө оруулалт» (INVEST — төсөл ДАЯАРЫН эх үүсвэр) хоёрт бүрэн багтсан.
 * Сарын урсгал л давхардаагүй тул үлдэв.
 */
function MonthlyCashCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  return (
    <Card title="Сар бүрийн санхүүжилт">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const s = rows.filter((r) => cfMatch(r, f));
          const items = CASHFLOW.months.map((m, i) => {
            const v = s.reduce((a, r) => a + (r.months[i] || 0), 0);
            return { key: m.label, label: `20${m.label}`, value: v, display: v ? mnt(v) : '—' };
          });
          return items.some((i) => i.value > 0)
            ? <Bars color="#e11d48" items={items} />
            : <p className={o.state}>Санхүүжилт бүртгэгдээгүй.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Бүсийн эрэмбэ (бүс сонгоно) ══════════════════ */

function RankingCard({ suit, zone, setZone }: { suit: Async<SuitSummary>; zone: string | null; setZone: (z: string | null) => void }) {
  const row = (r: SuitSummary['ranked'][number], rank: number) => (
    <button key={r.id} type="button" aria-pressed={zone === r.id}
      className={`${o.rankRow} ${zone === r.id ? o.rankOn : ''}`} onClick={() => setZone(zone === r.id ? null : r.id)}>
      <span className={o.rankNo}>{rank}</span>
      <span className={o.rankName}>{r.id}<i>{r.type}</i></span>
      <span className={`${o.rankScore} num`} style={{ background: scoreColor(r.score) }}>{r.score == null ? '—' : Math.round(r.score)}</span>
    </button>
  );
  return (
    <Card title="Бүсийн эрэмбэ">
      <Data q={suit} loading="Тооцож байна…">
        {(d) => {
          const scored = d.ranked.filter((r) => r.score != null);
          return (
            <div className={o.rankWrap}>
              <div><div className={o.rankLabel}>Хамгийн сайн</div>{scored.slice(0, 5).map((r, i) => row(r, i + 1))}</div>
              <div><div className={o.rankLabel}>Хамгийн муу</div>{scored.slice(-5).reverse().map((r, i) => row(r, scored.length - i))}</div>
            </div>
          );
        }}
      </Data>
    </Card>
  );
}
