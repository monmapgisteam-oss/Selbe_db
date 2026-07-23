'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Donut, Bars, Series, Ring, Stack, Data } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures, sqlStr, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_FIELDS, ZONE_NONE, ZONE_TYPES, ZONE_TYPE_EMPTY, ZONE_TYPE_EMPTY_HUE,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, BUILDING, BUILDING_STAGES, PROGRESS_LEVELS, STAGE_NA,
  SURVEY_HUE, LAYER_BY_ID, layerUrl, OID, CASHFLOW,
} from '@/lib/services';
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
};

const F = BUILT_FIELDS;
const BF = BUILDING.fields;

/** Тухайн хэмжээсийг ХАСсан ET-барилгын шүүлт (өөрийн картад бүх ангилал харагдана) */
function buildMatch(a: Row, f: Filters, exclude?: keyof Filters): boolean {
  if (exclude !== 'status' && f.status?.length && !f.status.includes(text(a[F.status]))) return false;
  if (exclude !== 'purpose' && f.purpose?.length && !f.purpose.includes(text(a[F.purpose]))) return false;
  if (exclude !== 'zone' && f.zone && text(a[ZONE_FIELD]) !== f.zone) return false;
  if (exclude !== 'zoneType' && f.zoneType?.length && !f.zoneType.includes(text(a.TOROL))) return false;
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
    f.zoneType?.length ? inList('TOROL', f.zoneType) : null,
    f.zoneSet && inList(ZONE_FIELD, f.zoneSet.ids),
  );
}
function zonesWhere(f: Filters): string | null {
  return and(
    f.zone && `${ZONE_FIELD} = ${sqlStr(f.zone)}`,
    f.zoneType?.length ? inList(ZONE_FIELDS.type, f.zoneType) : null,
    f.zoneSet && inList(ZONE_FIELD, f.zoneSet.ids),
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

function useRawZones(): Async<Row[]> {
  const Z = ZONE_FIELDS;
  return useAsync(() => queryFeatures(layerUrl(ZONE_LAYER), {
    outFields: [OID, Z.id, Z.type, Z.landM2, Z.parkNorm, Z.parkPlan, Z.parkExist, Z.parkPlanOpen, Z.parkPlanUnder],
  }), []);
}

function useRawBlocks(): Async<Row[]> {
  return useAsync(() => queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, BF.bagts, BF.progress, BF.households, BF.floors, ...BUILDING_STAGES.map((s) => s.field)],
  }), []);
}

/* ══════════════════ Cashflow — багцын төсөв / санхүүжилт (BUS_cashflow) ══════════════════ */

const CF = CASHFLOW.fields;
/** Таслалтай мөнгөн мөрийг тоо руу («259,778,021,987» → 259778021987) */
const cfNum = (v: unknown): number => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

type CashRow = { zone: string; budget: number; securities: number; projectIncome: number; cityBudget: number; reserve: number; contract: number; contractor: string; months: number[] };

function useCashflow(): Async<CashRow[]> {
  return useAsync(() => queryFeatures(CASHFLOW.url, {
    outFields: [CF.zone, CF.budget, CF.securities, CF.projectIncome, CF.cityBudget, CF.reserve, CF.contract, CF.contractor,
      ...CASHFLOW.months.map((m) => m.code)],
  }).then((rows) => rows.map((r) => ({
    zone: text(r[CF.zone]),
    budget: cfNum(r[CF.budget]),
    securities: cfNum(r[CF.securities]),
    projectIncome: cfNum(r[CF.projectIncome]),
    cityBudget: cfNum(r[CF.cityBudget]),
    reserve: cfNum(r[CF.reserve]),
    contract: cfNum(r[CF.contract]),
    contractor: text(r[CF.contractor]),
    months: CASHFLOW.months.map((m) => cfNum(r[m.code])),
  }))), []);
}

/** Cashflow мөрийг идэвхтэй бүсийн шүүлтээр (шууд бүсийн хэмжээс) */
function cfMatch(r: CashRow, f: Filters): boolean {
  if (f.zone) return r.zone === f.zone;
  if (f.zoneSet) return f.zoneSet.ids.includes(r.zone);
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
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), { outFields: [ZONE_FIELD, ZONE_FIELDS.type, 'FAR', 'FAR_HUVI', 'BCR'] });
    const far: NormEval = { pass: [], fail: [], none: 0 };
    const bcr: NormEval = { pass: [], fail: [], none: 0 };
    for (const r of rows) {
      const id = String(r[ZONE_FIELD] ?? '').trim();
      const norm = densityNormOf(r[ZONE_FIELDS.type] as string);
      const zf = r.FAR_HUVI != null ? Number(r.FAR_HUVI) / 100 : (r.FAR != null ? Number(r.FAR) : null);
      if (zf == null || !(zf > 0)) far.none++; else if (zf <= norm.farMax) far.pass.push(id); else far.fail.push(id);
      const zb = r.BCR != null ? Number(r.BCR) * 100 : null;
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
  const farbcr = useFarBcr();
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
  const anyFilter = !!(zone || filters.status?.length || filters.purpose?.length || filters.zoneType?.length || filters.bagts || filters.level?.length || filters.zoneSet || filters.infra);
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
    const ids = new Set<string>();
    for (const b of rawB.data) if (buildMatch(b, f)) { const z = text(b[ZONE_FIELD]); if (z) ids.add(z); }
    return ids.size ? inList(ZONE_FIELD, [...ids]) : null;
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
    const zid = String(attrs[ZONE_FIELD] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  const zinfo = zone && suit.state === 'ready' ? suit.data.byId[zone] : undefined;

  return (
    <div className={o.dash}>
      <div className={o.kpi}>
        <KpiStrip rawB={rawB} rawBlk={rawBlk} rawZ={rawZ} costs={costs} cash={cash} f={f} zone={zone} />
      </div>

      <aside className={`${o.side} ${o.left}`}>
        <BuildStatusCard rawB={rawB} f={f} onToggle={toggleStatus} />
        <PurposeCard rawB={rawB} f={f} onToggle={togglePurpose} />
        <ProgressCard rawBlk={rawBlk} f={f} onToggle={toggleLevel} />
        <SuitabilityCard suit={suit} prog={prog} zone={zone} f={filters} setZoneSet={(v) => setDimFilter('zoneSet', v)} />
        <DensityCard suit={suit} f={filters} onPick={(v) => setDimFilter('zoneSet', v)} />
      </aside>

      <aside className={`${o.side} ${o.fin}`}>
        <FundingCard cash={cash} f={f} />
        <BudgetCard cash={cash} f={f} setZone={setZone} />
        <ContractCard cash={cash} f={f} />
        <ContractorCard cash={cash} f={f} />
        <YearlyInvestCard cash={cash} f={f} />
        <FinancingCard cash={cash} f={f} />
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

      <aside className={`${o.side} ${o.right}`}>
        <ZoneTypeCard rawZ={rawZ} f={f} onToggle={toggleZoneType} />
        <ParkingCard rawZ={rawZ} f={f} />
        <EngineeringCard costs={costs} f={f} onPick={(v) => setDimFilter('infra', v)} />
        <StagesCard rawBlk={rawBlk} f={f} />
      </aside>

      <div className={o.bot}>
        <BagtsCard rawBlk={rawBlk} f={f} onPick={(v) => setDimFilter('bagts', v)} />
        <SurveyCard rawBlk={rawBlk} />
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
    { id: ZONE_LAYER.id, label: 'Бүс', hue: LAYER_BY_ID['et:28'].hue },
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

function KpiStrip({ rawB, rawBlk, rawZ, costs, cash, f, zone }: { rawB: Async<Row[]>; rawBlk: Async<Row[]>; rawZ: Async<Row[]>; costs: Async<CostSummary>; cash: Async<CashRow[]>; f: Filters; zone: string | null }) {
  const b = rawB.state === 'ready' ? rawB.data.filter((x) => buildMatch(x, f)) : null;
  const blk = rawBlk.state === 'ready' ? rawBlk.data.filter((x) => blockMatch(x, f)) : null;
  // Бүсийн тоо газрын зурагтай нийцнэ: бүсийн хэмжээсээр шүүгээд, барилгын
  // хэмжээс (төлөв/зориулалт) идэвхтэй бол тэдгээр барилгыг агуулсан бүсээр хязгаарлана.
  let zc = rawZ.state === 'ready' ? rawZ.data.filter((x) => zoneMatch(x, f)) : null;
  if (zc && b && (f.status?.length || f.purpose?.length)) {
    const zids = new Set(b.map((x) => text(x[ZONE_FIELD])));
    zc = zc.filter((x) => zids.has(text(x[ZONE_FIELDS.id])));
  }
  const na = rawB.state === 'error' ? '—' : '…';
  const naBlk = rawBlk.state === 'error' ? '—' : '…';

  const pop = b ? b.reduce((a, x) => a + Number(x[F.population] ?? 0), 0) : null;
  const urh = b ? b.reduce((a, x) => a + Number(x[F.households] ?? 0), 0) : null;
  const m2 = b ? b.reduce((a, x) => a + Number(x[F.usable] ?? 0), 0) : null;
  const avgProg = blk && blk.length ? blk.filter((x) => Number(x[BF.progress] ?? -1) >= 0)
    : null;
  const progVal = avgProg && avgProg.length ? avgProg.reduce((a, x) => a + Number(x[BF.progress]), 0) / avgProg.length : null;

  // Төсөл даяарын нийт үр дүн (шүүлтээс үл хамаарах контекст)
  const engKm = costs.state === 'ready' ? costs.data.engLengths.reduce((a, e) => a + e.km, 0) : null;
  const naCost = costs.state === 'error' ? '—' : '…';
  const cf = cash.state === 'ready' ? cash.data.filter((r) => cfMatch(r, f)) : null;
  const budget = cf ? cf.reduce((a, r) => a + r.budget, 0) : null;
  const naCash = cash.state === 'error' ? '—' : '…';

  const tiles: { v: string; u?: string; l: string; tone: string }[] = [
    zone ? { v: zone, l: 'Сонгосон бүс', tone: '#0ea5e9' } : { v: zc ? num(zc.length) : na, l: 'Бүс', tone: '#0d9488' },
    { v: b ? num(b.length) : na, l: 'Барилга', tone: '#3387b8' },
    { v: blk ? num(blk.length) : naBlk, l: 'Блок', tone: '#0891b2' },
    { v: pop == null ? na : num(pop), l: 'Хүн ам', tone: '#8b5cf6' },
    { v: urh == null ? na : num(urh), l: 'Өрх', tone: '#f59e0b' },
    { v: m2 == null ? na : ha(m2, 0), u: 'га', l: 'Барилгын талбай', tone: '#22c55e' },
    { v: progVal == null ? naBlk : pct(progVal, 0), l: 'Дундаж гүйцэтгэл', tone: '#ea580c' },
    { v: budget == null ? naCash : mnt(budget).replace(' ₮', ''), u: '₮', l: 'Төсөвт өртөг', tone: '#e11d48' },
    { v: engKm == null ? naCost : num(engKm, 1), u: 'км', l: 'Инженерийн шугам', tone: '#0ea5e9' },
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
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Ажлын үе шат (блок) ══════════════════ */

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

/* ══════════════════ Багц тус бүрийн гүйцэтгэл (блок) ══════════════════ */

function BagtsCard({ rawBlk, f, onPick }: { rawBlk: Async<Row[]>; f: Filters; onPick: (v: string) => void }) {
  return (
    <Card title="Багц тус бүрийн гүйцэтгэл">
      <Data q={rawBlk} loading="Тооцож байна…">
        {(rows) => {
          const scoped = rows.filter((x) => blockMatch(x, f, 'bagts'));
          const by = new Map<string, { n: number; sum: number; cnt: number }>();
          for (const x of scoped) {
            const k = text(x[BF.bagts], 'Тодорхойгүй');
            const rec = by.get(k) ?? { n: 0, sum: 0, cnt: 0 };
            rec.n += 1;
            const g = Number(x[BF.progress] ?? -1);
            if (g >= 0) { rec.sum += g; rec.cnt += 1; }
            by.set(k, rec);
          }
          const items = [...by.entries()].map(([key, r]) => ({
            key, label: key.replace(/^багц\s*/i, 'Б'),
            value: r.cnt ? r.sum / r.cnt : 0,
            display: r.cnt ? pct(r.sum / r.cnt, 0) : '—',
          })).sort((a, b) => a.key.localeCompare(b.key, 'mn'));
          return items.length ? (
            <Series color={BUILD_HUE} unit="дундаж гүйцэтгэл, %" height={150} selected={f.bagts ?? null} onSelect={onPick} items={items} />
          ) : <p className={o.state}>Багцын мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Талбайн хяналт (блок дундаж) ══════════════════ */

function SurveyCard({ rawBlk }: { rawBlk: Async<Row[]> }) {
  return (
    <Card title="Барилгын гүйцэтгэл">
      <Data q={rawBlk} loading="Тооцож байна…">
        {(rows) => {
          const done = rows.filter((x) => Number(x[BF.progress] ?? -1) >= 0);
          const avg = done.length ? done.reduce((a, x) => a + Number(x[BF.progress]), 0) / done.length : null;
          const ail = rows.reduce((a, x) => a + Number(x[BF.households] ?? 0), 0);
          const floors = rows.map((x) => Number(x[BF.floors] ?? 0)).filter((v) => v > 0);
          const avgFloor = floors.length ? floors.reduce((a, b) => a + b, 0) / floors.length : null;
          return (
            <div className={o.surveyRow}>
              <Ring value={avg} color={SURVEY_HUE} size={130} width={12} label="дундаж" />
              <div className={o.surveyStats}>
                <div><b className="num">{num(rows.length)}</b><span>Блок</span></div>
                <div><b className="num">{num(ail)}</b><span>Айл</span></div>
                <div><b className="num">{num(avgFloor, 1)}</b><span>Дундаж давхар</span></div>
              </div>
            </div>
          );
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

/* ══════════════════ Зогсоолын хангамж ══════════════════ */

function ParkingCard({ rawZ, f }: { rawZ: Async<Row[]>; f: Filters }) {
  const Z = ZONE_FIELDS;
  return (
    <Card title="Зогсоолын хангамж">
      <Data q={rawZ} loading="Тооцож байна…">
        {(rows) => {
          const scoped = f.zone ? rows.filter((x) => text(x[Z.id]) === f.zone) : rows;
          const s = (fld: string) => scoped.reduce((a, x) => a + Number(x[fld] ?? 0), 0);
          const norm = s(Z.parkNorm), plan = s(Z.parkPlan), exist = s(Z.parkExist);
          const rate = norm > 0 ? (plan / norm) * 100 : null;
          const gap = plan - norm;
          return (
            <>
              <div className={o.progressRow}>
                <Ring value={rate} color="#f59e0b" size={76} width={8} />
                <p className={o.progressText}>Төлөвлөсөн зогсоол нормын <b>{rate == null ? '—' : `${Math.round(rate)}%`}</b>-ийг хангана.</p>
              </div>
              <Bars inline max={Math.max(1, norm, plan, exist)} items={[
                { key: 'norm', label: 'Норм (шаардлага)', value: norm, display: num(norm), color: '#64748b' },
                { key: 'plan', label: 'Төлөвлөсөн', value: plan, display: num(plan), color: '#f59e0b' },
                { key: 'exist', label: 'Одоо байгаа', value: exist, display: num(exist), color: '#94a3b8' },
              ]} />
              <div className={o.miniStats}>
                <div><span>Ил / далд</span><b>{num(s(Z.parkPlanOpen))} / {num(s(Z.parkPlanUnder))}</b></div>
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
  const stackItems = [
    ...d.levels.map((l) => ({ key: l.label, label: l.label, value: l.n, color: l.color })),
    ...(d.noData > 0 ? [{ key: 'nd', label: 'Өгөгдөлгүй', value: d.noData, color: NO_DATA_COLOR }] : []),
  ];
  return (
    <Card title="Тохиромжтой байдал">
      <div className={o.progressRow}>
        <span className={o.bigScore} style={{ color: scoreColor(headScore) }}>{headScore == null ? '—' : Math.round(headScore)}</span>
        <p className={o.progressText}>
          {zone ? <><b>{zone}</b> бүсийн оноо · {scoreLabel(headScore)}.</> : <><b>{num(d.zones)}</b> бүсийн дундаж · {scoreLabel(headScore)}.</>}
        </p>
      </div>
      <Stack legend={false} total={d.zones} items={stackItems} />
      <div style={{ marginTop: 12 }}>
        <Bars inline max={Math.max(1, ...d.levels.map((l) => l.n))} selected={selKey}
          onSelect={(key) => { const lv = d.levels.find((l) => l.label === key); setZoneSet(lv ? { key: `suit:${key}`, label: `Үнэлгээ: ${key}`, ids: lv.ids } : undefined); }}
          items={d.levels.map((l) => ({ key: l.label, label: l.label, value: l.n, display: `${num(l.n)} бүс`, color: l.color }))} />
      </div>
      <div className={o.miniStats}>
        <div><span>Нийт ашиг/алдагдал</span><b className={d.profit >= 0 ? o.pos : o.neg}>{mnt(d.profit)}</b></div>
        <div><span>Ашигтай бүс</span><b>{num(d.profitZones)} / {num(d.zones)}</b></div>
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

/* ══════════════════ Багцын төсөв / санхүүжилт (cashflow) ══════════════════ */

function BudgetCard({ cash, f, setZone }: { cash: Async<CashRow[]>; f: Filters; setZone: (z: string | null) => void }) {
  return (
    <Card title="Багцын төсөв">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const items = rows
            .map((r) => ({ key: r.zone, label: r.zone, value: r.budget, display: mnt(r.budget) }))
            .filter((i) => i.value > 0)
            .sort((a, b) => b.value - a.value);
          return items.length ? (
            <Bars color="#e11d48" selected={f.zone ?? null}
              onSelect={(z) => setZone(f.zone === z ? null : z)} items={items} />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

function FinancingCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  return (
    <Card title="Санхүүжилтийн эх үүсвэр">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const s = rows.filter((r) => cfMatch(r, f));
          const sum = (k: keyof CashRow) => s.reduce((a, r) => a + (r[k] as number), 0);
          const items = [
            { key: 'sec', label: 'Үнэт цаас', value: sum('securities'), color: '#3387b8' },
            { key: 'inc', label: 'Төслийн орлого', value: sum('projectIncome'), color: '#22c55e' },
            { key: 'city', label: 'Нийслэлийн төсөв', value: sum('cityBudget'), color: '#f59e0b' },
            { key: 'res', label: 'НЗД нөөц', value: sum('reserve'), color: '#a855f7' },
          ].filter((i) => i.value > 0).map((i) => ({ ...i, display: mnt(i.value) }));
          const total = items.reduce((a, i) => a + i.value, 0);
          const [amt, ...u] = mnt(total).split(' ');
          return items.length ? (
            <Donut items={items} center={amt} centerLabel={u.join(' ')} size={120} width={16} stack />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/** Санхүүжилтийн явц — Төсөв → Гэрээлсэн (нэг масштабаар, гэрээлэлтийн %-тай) */
function FundingCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  return (
    <Card title="Санхүүжилтийн явц">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const s = rows.filter((r) => cfMatch(r, f));
          const budget = s.reduce((a, r) => a + r.budget, 0);
          const contract = s.reduce((a, r) => a + r.contract, 0);
          if (!budget) return <p className={o.state}>Мэдээлэл алга.</p>;
          return (
            <>
              <Bars inline max={budget} items={[
                { key: 'b', label: 'Урьдчилсан төсөв', value: budget, display: mnt(budget), color: '#e11d48' },
                { key: 'c', label: `Гэрээлсэн · ${Math.round((contract / budget) * 100)}%`, value: contract, display: mnt(contract), color: '#f59e0b' },
              ]} />
              <div className={o.miniStats}>
                <div><span>Гэрээлэгдээгүй</span><b>{mnt(budget - contract)}</b></div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/** Оноор хөрөнгө оруулалт — сарын санхүүжилтийг оноор нэгтгэж (хувиар) */
function YearlyInvestCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  const palette: Record<string, string> = { '2025': '#3387b8', '2026': '#22c55e', '2027': '#f59e0b', '2028': '#a855f7' };
  return (
    <Card title="Оноор хөрөнгө оруулалт">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const s = rows.filter((r) => cfMatch(r, f));
          const by = new Map<string, number>();
          CASHFLOW.months.forEach((m, i) => {
            const year = `20${m.label.slice(0, 2)}`;
            by.set(year, (by.get(year) ?? 0) + s.reduce((a, r) => a + (r.months[i] || 0), 0));
          });
          const items = [...by.entries()].map(([year, v]) => ({ key: year, label: `${year} он`, value: v, color: palette[year] ?? '#8b5cf6', display: mnt(v) })).filter((i) => i.value > 0);
          const total = items.reduce((a, i) => a + i.value, 0);
          const [amt, ...u] = mnt(total).split(' ');
          return items.length ? (
            <Donut items={items} center={amt} centerLabel={u.join(' ')} size={120} width={16} stack />
          ) : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

/** Гүйцэтгэгч байгууллага — төсвөөр */
function ContractorCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  return (
    <Card title="Гүйцэтгэгч байгууллага">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const by = new Map<string, number>();
          for (const r of rows.filter((x) => cfMatch(x, f))) { const c = r.contractor || 'Тодорхойгүй'; by.set(c, (by.get(c) ?? 0) + r.budget); }
          const items = [...by.entries()].map(([label, v]) => ({ key: label, label, value: v, display: mnt(v) }))
            .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
          return items.length ? <Bars color="#8b5cf6" limit={8} items={items} /> : <p className={o.state}>Мэдээлэл алга.</p>;
        }}
      </Data>
    </Card>
  );
}

function ContractCard({ cash, f }: { cash: Async<CashRow[]>; f: Filters }) {
  return (
    <Card title="Гэрээний дүн">
      <Data q={cash} loading="Тооцож байна…">
        {(rows) => {
          const items = rows.filter((r) => cfMatch(r, f))
            .map((r) => ({ key: r.zone, label: r.zone, value: r.contract, display: mnt(r.contract) }))
            .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
          return items.length ? <Bars color="#0891b2" items={items} /> : <p className={o.state}>Гэрээ бүртгэгдээгүй.</p>;
        }}
      </Data>
    </Card>
  );
}

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
