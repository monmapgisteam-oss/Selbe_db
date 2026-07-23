'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Donut, Bars, Series, Ring, Stack, Data } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryStats, queryGroup, queryFeatures, count, sum, avg, groups, sqlStr, blankWhere } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_FIELDS, ZONE_TYPES, ZONE_TYPE_EMPTY, ZONE_TYPE_EMPTY_HUE,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, BUILDING, PROGRESS_LEVELS,
  SURVEY, SURVEY_HUE, LAYER_BY_ID, layerUrl, OID,
} from '@/lib/services';
import { num, pct, ha, mnt } from '@/lib/format';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, COST_GROUPS, COST_GROUP_OF, NO_DATA_COLOR, densityNormOf, profitScore,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats,
} from '@/lib/analysis/data';
import { loadCostsCached } from '@/lib/analysis/costs';
import { urbanScore, scoreColor, scoreLabel } from '@/lib/analysis/score';
import { useBuildings } from './BuildingPanel';
import o from './overview.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ТОЙРСОН нэгдсэн үзүүлэлтийн самбар.
 *
 * Байрлал: дээр KPI зурвас, зүүн/баруун талд карт (дугуй диаграм, багана
 * график, индикатор), доор өргөн график — төв дунд газрын зураг.
 *
 * ⚠️ Бүх тоо ArcGIS FeatureServer-ээс ажиллах үедээ ШУУД татагдана — жишиг,
 * зорилтот тоо байхгүй. Асуулга нь порталын бусад хэсэгтэй ИЖИЛ дэд бүтэц
 * (`lib/query.ts`, `lib/services.ts`) ашиглана — дүн зөрөх боломжгүй.
 *
 * ⚠️ Газрын зураг нь порталын нэг `MapCanvas`-ийг ашиглана: 2D/3D/BIM товч,
 * hover мэдээлэл бүгд автоматаар үйлчилнэ. Дашбоард нь бүсийн будалт (TOROL) ба
 * барилгын төлөв (Barilga_ty)-ийг харуулна.
 */

/** Дашбоардын газрын зурагт анхнаасаа асаах давхаргууд */
const DASH_LAYERS = [ZONE_LAYER.id, BUILT_LAYER.id];

/**
 * Идэвхтэй шүүлт — үзүүлэлт дээр дарахад төв газрын зургийг тухайн олонлогоор
 * тодруулна (`useMap().setHighlight`).
 *   · `where`     — SQL нөхцөл (`1=1` = зөвхөн давхаргыг гаргах, шүүлтгүй)
 *   · `layerIds`  — ЗӨВХӨН эдгээр давхаргад хэрэглэнэ. Тоймд байхгүй давхаргыг
 *                   (гүйцэтгэлийн блок, инженерийн шугам) шүүлт идэвхжихэд түр
 *                   гаргаж, цуцлахад буцааж нуухад ашиглагдана.
 */
type Filter = { key: string; label: string; where: string; layerIds: string[]; count?: number };

/** Норм хангасан / зөрчсөний өнгө (FAR·BCR үнэлгээ) */
const PASS_HUE = '#16a34a';
const FAIL_HUE = '#ef4444';

/** Өртөг/инженерийн салбар (heat/water/power…) → түүнд хамаарах давхаргын id-ууд */
const SECTOR_LAYERS: Record<string, string[]> = Object.entries(COST_GROUP_OF).reduce((m, [id, g]) => {
  (m[g] ??= []).push(id);
  return m;
}, {} as Record<string, string[]>);

/* ══════════════════ Өгөгдөл ══════════════════ */

type Overview = {
  zones: number;
  zonesByType: { label: string; n: number; blank: boolean }[];
  buildings: number;
  pop: number;
  households: number;
  usableM2: number;
  buildByStatus: { label: string; n: number }[];
  buildByPurpose: { label: string; n: number; blank: boolean }[];
  parking: { norm: number; planned: number; existing: number; il: number; dald: number };
  survey: { count: number; progress: number | null; workers: number; machines: number };
};

/**
 * Ерөнхий тоо — бүс, барилга, талбайн хяналт нэг багц хүсэлтээр.
 * ⚠️ Бүсийн `GAZAR_GA` нийлбэрийг «га талбай»-д АШИГЛАХГҮЙ (эх өгөгдөлд алдаатай
 * бичлэгтэй) — талбайг барилгын ашигтай м²-ээс га болгож харуулна.
 */
function useOverview(zone: string | null): Async<Overview> {
  return useAsync(async () => {
    const Z = ZONE_FIELDS;
    const B = BUILT_FIELDS;
    const S = SURVEY.fields;
    const zoneUrl = layerUrl(ZONE_LAYER);
    const builtUrl = layerUrl(BUILT_LAYER);
    // ⚠️ Барилгын асуулгыг л бүсээр шүүнэ. Бүсийн тоо/төрөл/зогсоол нь ТОЙМ хэвээр
    //    (сонгосон бүсийг виджет дотор нь тодруулна).
    const bWhere = zone ? `${ZONE_FIELD} = ${sqlStr(zone)}` : '1=1';

    const [zTot, zByType, zPark, bTot, bByStatus, bByPurpose, surveyTot] = await Promise.all([
      queryStats(zoneUrl, [count(OID, 'n')]),
      queryGroup(zoneUrl, Z.type, [count(OID, 'n')]),
      queryStats(zoneUrl, [
        sum(Z.parkNorm, 'norm'), sum(Z.parkPlan, 'plan'), sum(Z.parkExist, 'exist'),
        sum(Z.parkPlanOpen, 'il'), sum(Z.parkPlanUnder, 'dald'),
      ]),
      queryStats(builtUrl, [
        count(OID, 'n'), sum(B.population, 'pop'),
        sum(B.households, 'urh'), sum(B.usable, 'm2'),
      ], bWhere),
      queryGroup(builtUrl, B.status, [count(OID, 'n')], bWhere),
      queryGroup(builtUrl, B.purpose, [count(OID, 'n')], bWhere),
      queryStats(SURVEY.url, [
        count(SURVEY.oid, 'n'), avg(S.total, 'g'),
        sum(S.workers, 'w'), sum(S.machines, 't'),
      ]),
    ]);

    return {
      zones: Number(zTot.n ?? 0),
      zonesByType: groups(zByType, Z.type, ZONE_TYPE_EMPTY, ['n'])
        .map((g) => ({ label: g.label, n: g.values.n, blank: g.blank })),
      parking: {
        norm: Number(zPark.norm ?? 0), planned: Number(zPark.plan ?? 0),
        existing: Number(zPark.exist ?? 0), il: Number(zPark.il ?? 0), dald: Number(zPark.dald ?? 0),
      },
      buildings: Number(bTot.n ?? 0),
      pop: Number(bTot.pop ?? 0),
      households: Number(bTot.urh ?? 0),
      usableM2: Number(bTot.m2 ?? 0),
      buildByStatus: groups(bByStatus, B.status, 'Тодорхойгүй', ['n'])
        .map((g) => ({ label: g.label, n: g.values.n })),
      buildByPurpose: groups(bByPurpose, B.purpose, 'Тодорхойгүй', ['n'])
        .map((g) => ({ label: g.label, n: g.values.n, blank: g.blank })),
      survey: {
        count: Number(surveyTot.n ?? 0),
        progress: surveyTot.g == null ? null : Number(surveyTot.g),
        workers: Number(surveyTot.w ?? 0),
        machines: Number(surveyTot.t ?? 0),
      },
    };
  }, [zone]);
}

/* ══════════════════ Талбайн хяналт — илэрсэн асуудал ══════════════════ */

/** Асуудлын нөлөөллийн зэрэг — мобайл апп латинаар бичдэг (`SurveyPanel`-тэй ижил) */
const IMPACT: { key: string; label: string; color: string }[] = [
  { key: 'undur', label: 'Өндөр', color: '#ef4444' },
  { key: 'dund', label: 'Дунд', color: '#f59e0b' },
  { key: 'bag', label: 'Бага', color: '#16a34a' },
];

type Issues = {
  total: number;
  /** `parents` — тухайн зэргийн асуудалтай тайлангийн `globalid`-ууд (зураг шүүхэд) */
  byImpact: { label: string; n: number; color: string; parents: string[] }[];
  byCategory: { label: string; n: number }[];
};

/**
 * Талбайн хяналтын тайланд илэрсэн асуудлууд (`r_asuudal` хүснэгт) — нөлөөллийн
 * зэрэг ба ангиллаар. Хяналтын гол мессежийн нэг тул тоймд гаргана.
 *
 * ⚠️ `parentglobalid` нь эцэг тайлангийн `globalid`-тай тэнцэнэ — үүгээр газрын
 * зурагт талбайн тайлангийн цэгийг шүүнэ.
 */
function useIssues(): Async<Issues> {
  return useAsync(async () => {
    const rows = await queryFeatures(SURVEY.tables.asuudal, {
      outFields: ['asuudal_noloo', 'asuudal_ang', 'parentglobalid'], limit: 1000,
    });
    const impactN = new Map<string, number>();
    const impactP = new Map<string, Set<string>>();
    const cat = new Map<string, number>();
    for (const r of rows) {
      const im = String(r.asuudal_noloo ?? '').trim().toLowerCase();
      impactN.set(im, (impactN.get(im) ?? 0) + 1);
      const p = String(r.parentglobalid ?? '').trim();
      if (p) (impactP.get(im) ?? impactP.set(im, new Set()).get(im)!).add(p);
      const c = String(r.asuudal_ang ?? '').trim() || 'Ангилалгүй';
      cat.set(c, (cat.get(c) ?? 0) + 1);
    }
    return {
      total: rows.length,
      byImpact: IMPACT
        .map((i) => ({
          label: i.label, n: impactN.get(i.key) ?? 0, color: i.color,
          parents: [...(impactP.get(i.key) ?? [])],
        }))
        .filter((i) => i.n > 0),
      byCategory: [...cat.entries()]
        .map(([label, n]) => ({ label, n }))
        .sort((a, b) => b.n - a.n),
    };
  }, []);
}

/* ══════════════════ Анализ — дэд бүтцийн өртөг ══════════════════ */

type CostSummary = {
  total: number;
  perHa: number;
  bySector: { key: string; label: string; value: number; color: string }[];
  /** Инженерийн шугамын урт системээр (км) — costs өгөгдлөөс дахин ашиглана */
  engLengths: { key: string; label: string; km: number; color: string }[];
};

/**
 * Дэд бүтцийн өртөг — «Тохиромжтой байдлын үнэлгээ» модулийн санхүүгийн хэсгээс.
 * ⚠️ `loadCostsCached` нь ГЕОМЕТР ТАТДАГГҮЙ (давхарга бүрд нэг `groupBy(нэгж
 * үнэ)`) тул хямд бөгөөд хурдан — тохиромжтой байдлын хүнд орон зайн ачаалалтаас
 * ТУСДАА ачаална. Кэш нь анализын харагдацтай хуваалцана.
 */
function useCosts(): Async<CostSummary> {
  return useAsync(async () => {
    const costs = await loadCostsCached();
    const byGroup: Record<string, number> = {};
    for (const l of costs.layers) byGroup[l.group] = (byGroup[l.group] ?? 0) + l.total;
    // ⚠️ Шугаман давхаргын `qty` нь метрээр (`qtyUnit === 'м'`) — км болгож нэгтгэнэ
    const engLengths = ['heat', 'water', 'power'].map((g) => ({
      key: g,
      label: COST_GROUPS[g].label,
      km: costs.layers.filter((l) => l.group === g && l.qtyUnit === 'м').reduce((a, l) => a + l.qty, 0) / 1000,
      color: COST_GROUPS[g].color,
    })).filter((x) => x.km > 0);
    return {
      total: costs.total,
      perHa: costs.perHa,
      bySector: Object.entries(byGroup)
        .map(([key, value]) => ({ key, value, label: COST_GROUPS[key].label, color: COST_GROUPS[key].color }))
        .sort((a, b) => b.value - a.value),
      engLengths,
    };
  }, []);
}

/* ══════════════════ Анализ — тохиромжтой байдлын үнэлгээ ══════════════════ */

type SuitSummary = {
  avgScore: number | null;
  levels: { label: string; color: string; n: number; ids: string[] }[];
  noData: number;
  zones: number;
  revenue: number;
  cost: number;
  profit: number;
  profitZones: number;
  /** Оноогоор эрэмбэлсэн (өндрөөс намд, өгөгдөлгүй нь адагт) */
  ranked: { id: string; type: string; score: number | null }[];
  /** Оршин суугчтай бүсийн хүн амын нягтшил (хүн/га) — гистограммд */
  densityZones: { id: string; density: number }[];
  /** Бүс бүрийн оноо ба төрөл — сонгосон бүсийг виджетэд тодруулахад */
  byId: Record<string, { score: number | null; type: string }>;
};

/** DEFAULT_ECON_SHARE-аар хот төлөвлөлт ба эдийн засгийн нийлмэл оноо */
const blendOf = (u: number | null, e: number | null): number | null => {
  if (u == null && e == null) return null;
  if (u == null) return e;
  if (e == null) return u;
  return u * (1 - DEFAULT_ECON_SHARE / 100) + e * (DEFAULT_ECON_SHARE / 100);
};

type Progress = (msg: string, pct: number) => void;

/**
 * Тохиромжтой байдлын үнэлгээ — «Suitability Modeler»-ийн НИЙЛМЭЛ оноо ба
 * эдийн засгийн дүнг бүсээр нэгтгэнэ.
 *
 * ⚠️ ХҮНД ачаалалт: `loadAnalysisCached` нь 4,000+ шугамын union, 368×52
 * `contains` тест хийдэг тул хэдэн секунд авна. Тиймээс:
 *   · `enabled` false үед хүлээнэ — дашбоардын ХЯМД хэсгүүд эхэлж зурагдана
 *     (эцэг нь эхний paint-ийн дараа `enabled`-ыг асаана).
 *   · `onProgress`-оор жинхэнэ явцыг картад дамжуулна.
 * Кэш нь анализын бүрэн харагдацыг УРЬДЧИЛАН халаана — тэнд орох үед шууд нээгдэнэ.
 */
function useSuitability(enabled: boolean, onProgress?: Progress): Async<SuitSummary> {
  return useAsync(async () => {
    // Идэвхжээгүй бол шийдэгдэхгүй амлалт → paint болтол «ачаалж байна» хэвээр
    if (!enabled) return new Promise<SuitSummary>(() => {});

    const [data, costs] = await Promise.all([loadAnalysisCached(onProgress), loadCostsCached()]);
    computeEconomics(data.zones, costs.perHa, null, BUILD_COST_PER_M2);
    computeRaw(data.zones, defaultGreenCats(), PARKING);

    const blends = data.zones.map((z) => {
      const urban = urbanScore(z.raw, INDICATORS, z.type).score;
      const econ = profitScore(z.econ?.margin);
      return blendOf(urban, econ);
    });

    const valid = blends.filter((x): x is number => x != null);
    const revenue = data.zones.reduce((a, z) => a + (z.econ?.revenue ?? 0), 0);
    const cost = data.zones.reduce((a, z) => a + (z.econ?.cost ?? 0), 0);

    const ranked = data.zones
      .map((z, i) => ({ id: z.id, type: z.type, score: blends[i] }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    return {
      avgScore: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      levels: SCORE_LEVELS.map((L, i) => {
        // blends нь data.zones-тэй индексээр таарна → тухайн түвшний бүсийн ID
        const ids = data.zones.filter((_, j) => levelOf(blends[j]) === i).map((z) => z.id);
        return { label: L.label, color: L.color, n: ids.length, ids };
      }),
      noData: blends.filter((b) => levelOf(b) < 0).length,
      zones: data.zones.length,
      revenue,
      cost,
      profit: revenue - cost,
      profitZones: data.zones.filter((z) => (z.econ?.profit ?? 0) > 0).length,
      ranked,
      densityZones: data.zones
        .filter((z) => z.raw.density != null)
        .map((z) => ({ id: z.id, density: z.raw.density as number })),
      byId: Object.fromEntries(data.zones.map((z, i) => [z.id, { score: blends[i], type: z.type }])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/* ══════════════════ Анализ — FAR / BCR норм үнэлгээ ══════════════════ */

type NormEval = {
  /** Норм хангасан бүсийн ID */
  pass: string[];
  /** Норм зөрчсөн бүсийн ID */
  fail: string[];
  /** Утга 0 / хоосон — барилгажилт төлөвлөөгүй */
  none: number;
};
type FarBcr = { far: NormEval; bcr: NormEval; total: number };

/**
 * FAR ба BCR-ийг бүсийн ТӨРЛӨӨС хамаарах БНбД нормтой (Хүснэгт 6.1) харьцуулна.
 *
 * ⚠️ ГЕОМЕТР ТАТДАГГҮЙ — зөвхөн бүсийн атрибут (`FAR_HUVI`, `BCR`, `TOROL`) тул
 * хямд, хурдан. Тохиромжтой байдлын хүнд ачаалалтаас ХАМААРАЛГҮЙ.
 *
 * ⚠️ `FAR` талбар 52 бүсийн 22-т эвдэрсэн тул `FAR_HUVI ÷ 100`-г давамгайлуулна
 * (`lib/analysis/data.ts`-тэй ЯГ ижил дүрэм). BCR нь эзлэх хэсэг тул ×100.
 */
function useFarBcr(): Async<FarBcr> {
  return useAsync(async () => {
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), {
      outFields: [ZONE_FIELD, ZONE_FIELDS.type, 'FAR', 'FAR_HUVI', 'BCR'],
    });
    const far: NormEval = { pass: [], fail: [], none: 0 };
    const bcr: NormEval = { pass: [], fail: [], none: 0 };

    for (const r of rows) {
      const id = String(r[ZONE_FIELD] ?? '').trim();
      const norm = densityNormOf(r[ZONE_FIELDS.type] as string);

      const zf = r.FAR_HUVI != null ? Number(r.FAR_HUVI) / 100 : (r.FAR != null ? Number(r.FAR) : null);
      if (zf == null || !(zf > 0)) far.none++;
      else if (zf <= norm.farMax) far.pass.push(id);
      else far.fail.push(id);

      const zb = r.BCR != null ? Number(r.BCR) * 100 : null;
      if (zb == null || !(zb > 0)) bcr.none++;
      else if (zb <= norm.bcrMax) bcr.pass.push(id);
      else bcr.fail.push(id);
    }
    return { far, bcr, total: rows.length };
  }, []);
}

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Dashboard({ dim, zone, setZone }: { dim: Dim; zone: string | null; setZone: (z: string | null) => void }) {
  // ⚠️ БҮСЭЭР CROSS-FILTER: бүс сонгоход БҮС-СУУРЬТ виджет ба KPI тэр бүсээр
  //    дахин тооцогдоно; газрын зураг тэр бүсийг ГАНЦААР нь харуулж төвлөрнө.
  //    Барилгын блок, талбайн тайлан, өртөг, инженер нь бүстэй холбогддоггүй
  //    тул ТӨСӨЛ ДАЯАР хэвээр (мөрөнд «төсөл даяар» тэмдэглэнэ).
  const ov = useOverview(zone);
  const bld = useBuildings();
  const costs = useCosts();
  const farbcr = useFarBcr();
  const issues = useIssues();
  const { zoomToZone } = useMap();

  /**
   * ⚠️ Хүнд анализыг ЭХНИЙ paint-ийн ДАРАА эхлүүлнэ — эс бөгөөс дашбоард нээгдэх
   *    агшинд орон зайн тооцоо гол thread-ийг гацаана.
   */
  const [heavy, setHeavy] = useState(false);
  const [prog, setProg] = useState<{ msg: string; pct: number }>({ msg: 'Хүлээж байна…', pct: 0 });
  useEffect(() => { setHeavy(true); }, []);
  const onProgress = useCallback((msg: string, pct: number) => setProg({ msg, pct }), []);
  const suit = useSuitability(heavy, onProgress);

  /** Бүс сонгогдоход тэр бүс рүү зурагт төвлөрнө */
  useEffect(() => { if (zone) zoomToZone(zone); }, [zone, zoomToZone]);

  /** Газрын зурагт бүс/барилга дарахад тухайн бүсийг сонгоно (null = үл хамаарна) */
  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    const zid = String(attrs[ZONE_FIELD] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  /** Сонгосон бүсийн анализын утга — тодруулгад ашиглана */
  const zinfo = zone && suit.state === 'ready' ? suit.data.byId[zone] : undefined;

  return (
    <div className={o.dash}>
      <div className={o.kpi}>
        <KpiStrip ov={ov} bld={bld} zone={zone} />
      </div>

      <aside className={`${o.side} ${o.left}`}>
        <BuildStatusCard ov={ov} zone={zone} />
        <PurposeCard ov={ov} zone={zone} />
        <ProgressCard bld={bld} />
        {/* Анализ хэсгээс — бүсийн нийлмэл үнэлгээ */}
        <SuitabilityCard suit={suit} prog={prog} zone={zone} />
        <DensityCard suit={suit} zone={zone} />
      </aside>

      <div className={o.map}>
        <MapCanvas dim={dim} visible={DASH_LAYERS} zone={zone} onPick={pick} />
        <MapLegend />
        {zone && (
          <div className={o.filterChip}>
            <span className={o.filterDot} aria-hidden />
            <span className={o.filterLabel}>Бүс: {zone}</span>
            {zinfo?.score != null && (
              <span className={`${o.filterCount} num`} style={{ background: scoreColor(zinfo.score), color: '#fff' }}>
                {Math.round(zinfo.score)}
              </span>
            )}
            <button type="button" className={o.filterClear} onClick={() => setZone(null)} aria-label="Бүсийн сонголт цуцлах">×</button>
          </div>
        )}
      </div>

      <aside className={`${o.side} ${o.right}`}>
        <ZoneTypeCard ov={ov} selType={zinfo?.type} />
        <ParkingCard ov={ov} />
        {/* Анализ хэсгээс — FAR/BCR норм үнэлгээ */}
        <FarBcrCard farbcr={farbcr} zone={zone} />
        <EngineeringCard costs={costs} />
        <StagesCard bld={bld} />
        {/* Анализ хэсгээс — дэд бүтцийн өртөг */}
        <CostCard costs={costs} />
      </aside>

      <div className={o.bot}>
        <BagtsCard bld={bld} />
        <SurveyCard ov={ov} />
        <IssuesCard issues={issues} />
        {/* Анализ хэсгээс — бүсийн эрэмбэ (дарж бүс сонгоно) */}
        <RankingCard suit={suit} zone={zone} setZone={setZone} />
      </div>
    </div>
  );
}

/* ══════════════════ Газрын зургийн тайлбар ══════════════════ */

/** Бүсийн ангилал (TOROL) ба барилгын төлөв (Barilga_ty)-ийн өнгөний тайлбар */
function MapLegend() {
  return (
    <div className={o.legend}>
      <div className={o.legendGroup}>
        <span className={o.legendHead}>Бүс</span>
        {Object.entries(ZONE_TYPES).map(([label, hue]) => (
          <span key={label} className={o.legendItem}>
            <i style={{ background: hue }} />{label}
          </span>
        ))}
      </div>
      <div className={o.legendGroup}>
        <span className={o.legendHead}>Барилга</span>
        {BUILT_STATUS.map((st) => (
          <span key={st.value} className={o.legendItem}>
            <i style={{ background: st.hue }} />{st.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════ KPI зурвас ══════════════════ */

/**
 * Дээд зурвасын үндсэн үзүүлэлтүүд. `ov` (бүс, барилга) ба `bld` (гүйцэтгэл)
 * хоёр өөр хүсэлтээс уншина — аль нэг нь ачаалагдаагүй бол «…» харуулна.
 */
function KpiStrip({ ov, bld, zone }: { ov: Async<Overview>; bld: ReturnType<typeof useBuildings>; zone: string | null }) {
  const d = ov.state === 'ready' ? ov.data : null;
  const b = bld.state === 'ready' ? bld.data : null;
  const err = ov.state === 'error';
  const na = err ? '—' : '…';

  const tiles: { v: string; u?: string; l: string; tone: string }[] = [
    // Бүс сонгогдсон бол эхний хайрцаг сонгосон бүсийн нэрийг харуулна
    zone
      ? { v: zone, l: 'Сонгосон бүс', tone: '#0ea5e9' }
      : { v: d ? num(d.zones) : na, l: 'Бүс', tone: '#0d9488' },
    { v: d ? num(d.buildings) : na, l: 'Барилга', tone: '#3387b8' },
    { v: d ? num(d.pop) : na, l: 'Хүн ам', tone: '#8b5cf6' },
    { v: d ? num(d.households) : na, l: 'Өрх', tone: '#f59e0b' },
    { v: d ? ha(d.usableM2, 0) : na, u: 'га', l: 'Барилгын талбай', tone: '#22c55e' },
    { v: b ? pct(b.progress, 0) : (bld.state === 'error' ? '—' : '…'), l: 'Дундаж гүйцэтгэл', tone: '#ea580c' },
  ];

  return (
    <>
      {tiles.map((t) => (
        <div key={t.l} className={o.tile} style={{ '--tone': t.tone } as CSSProperties}>
          <span className={`${o.tileVal} num`}>
            {t.v}{t.u && <span className={o.tileUnit}>{t.u}</span>}
          </span>
          <span className={o.tileLabel}>{t.l}</span>
        </div>
      ))}
    </>
  );
}

/* ══════════════════ Карт бүрхүүл ══════════════════ */

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
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

/* ══════════════════ Дугуй диаграм — барилгын төлөв ══════════════════ */

function BuildStatusCard({ ov, zone }: { ov: Async<Overview>; zone: string | null }) {
  return (
    <Card title="Барилгын төлөв" note={zone ? `бүс ${zone}` : 'төсөл даяар'}>
      <Data q={ov} loading="Тооцож байна…">
        {(d) => {
          // BUILT_STATUS-ийн дараалал ба өнгөөр — газрын зурагтай ижил
          const items = BUILT_STATUS
            .map((st) => ({
              key: st.value,
              label: st.value,
              value: d.buildByStatus.find((x) => x.label === st.value)?.n ?? 0,
              color: st.hue,
            }))
            .filter((i) => i.value > 0);
          return items.length ? (
            <Donut items={items} center={num(d.buildings)} centerLabel="барилга" size={124} width={20} />
          ) : (
            <p className={o.state}>Барилгын төлөв бүртгэгдээгүй.</p>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Дугуй диаграм — бүсийн ангилал ══════════════════ */

function ZoneTypeCard({ ov, selType }: { ov: Async<Overview>; selType?: string }) {
  return (
    <Card title="Бүсийн ангилал" note={selType ? 'сонгосон бүс тодрол' : '52 бүс'}>
      <Data q={ov} loading="Тооцож байна…">
        {(d) => {
          const items = d.zonesByType.map((g) => ({
            key: g.label,
            label: g.label,
            value: g.n,
            color: ZONE_TYPES[g.label] ?? ZONE_TYPE_EMPTY_HUE,
          }));
          // Сонгосон бүсийн төрлийг тодруулна (интерактив биш — зөвхөн тэмдэглэгээ)
          const sel = selType && items.find((i) => i.key === selType) ? selType : null;
          return items.length ? (
            <Donut items={items} center={num(d.zones)} centerLabel="бүс" size={124} width={20} selected={sel} />
          ) : (
            <p className={o.state}>Бүсийн ангилал бүртгэгдээгүй.</p>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Индикатор + график — гүйцэтгэлийн түвшин ══════════════════ */

const BUILD_HUE = LAYER_BY_ID['mon:building'].hue;

function ProgressCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Гүйцэтгэлийн түвшин" note="төсөл даяар · блокоор">
      <Data q={bld} loading="Тооцож байна…">
        {(d) => (
          <>
            <div className={o.progressRow}>
              <Ring value={d.progress} color={BUILD_HUE} size={76} width={8} />
              <p className={o.progressText}>
                <b>{num(d.blocks)}</b> блокийн дундаж гүйцэтгэл. Нийт <b>{num(d.households)}</b> айл.
                Төлөвлөгдөөгүй ажлыг (−1) хассан.
              </p>
            </div>
            <Bars
              max={Math.max(1, ...d.levels.map((l) => l.value))}
              items={d.levels.map((l) => ({
                key: l.key,
                label: `${l.label} · ${l.range}`,
                value: l.value,
                display: `${num(l.value)} блок`,
                color: l.color,
              }))}
            />
          </>
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Багана график — ажлын үе шат ══════════════════ */

function StagesCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Ажлын үе шат" note="төлөвлөгдсөн блокуудын дундаж">
      <Data q={bld} loading="Тооцож байна…">
        {(d) => (
          <Bars
            color={BUILD_HUE}
            max={100}
            limit={8}
            items={d.stages.map((st) => ({
              key: st.key,
              label: st.label,
              value: st.value ?? 0,
              display: st.blocks === 0 || st.value == null ? 'төлөвлөгдөөгүй' : pct(st.value, 0),
            }))}
          />
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Цуваа график — багц тус бүрийн гүйцэтгэл ══════════════════ */

function BagtsCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Багц тус бүрийн гүйцэтгэл" note="төсөл даяар · дундаж %">
      <Data q={bld} loading="Тооцож байна…">
        {(d) =>
          d.bagts.length ? (
            <Series
              color={BUILD_HUE}
              unit="дундаж гүйцэтгэл, %"
              items={d.bagts.map((b) => ({
                key: b.key,
                // Урт «Багц» угтварыг богиносгож тэнхлэгт багтаана
                label: b.key.replace(/^багц\s*/i, 'Б'),
                value: b.progress ?? 0,
                display: b.progress == null ? '—' : pct(b.progress, 0),
              }))}
            />
          ) : (
            <p className={o.state}>Багцын мэдээлэл алга.</p>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Индикатор — талбайн хяналт ══════════════════ */

function SurveyCard({ ov }: { ov: Async<Overview> }) {
  return (
    <Card title="Талбайн хяналт" note="Survey123">
      <Data q={ov} loading="Тооцож байна…">
        {(d) =>
          d.survey.count === 0 ? (
            <p className={o.state}>Мобайл аппаас тайлан хараахан ирээгүй.</p>
          ) : (
            <div className={o.surveyRow}>
              <Ring value={d.survey.progress} color={SURVEY_HUE} size={78} width={8} label="б. угсралт" />
              <div className={o.surveyStats}>
                <div><b className="num">{num(d.survey.count)}</b><span>Ирсэн тайлан</span></div>
                <div><b className="num">{num(d.survey.workers)}</b><span>Хүн хүч</span></div>
                <div><b className="num">{num(d.survey.machines)}</b><span>Техник</span></div>
              </div>
            </div>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Анализ — тохиромжтой байдал (зүүн) ══════════════════ */

/**
 * Бүсийн НИЙЛМЭЛ үнэлгээ — 5 түвшний тархалт + дундаж оноо + эдийн засгийн дүн.
 * ⚠️ Хүнд орон зайн ачаалалт тул өөрийн loading төлөвтэй; дашбоардын бусад
 * хэсгийг блоклохгүй.
 */
function SuitabilityCard({
  suit, prog, zone,
}: {
  suit: Async<SuitSummary>;
  prog: { msg: string; pct: number };
  zone: string | null;
}) {
  // ⚠️ Хүнд ачаалалт тул `Data`-гийн энгийн спиннерийн оронд ЖИНХЭНЭ ЯВЦ харуулна
  if (suit.state === 'loading') {
    return (
      <Card title="Тохиромжтой байдал" note="бүсийн үнэлгээ">
        <div className={o.load}>
          <div className={o.loadMsg}>{prog.msg}</div>
          <div className={o.loadBar}><span style={{ width: `${Math.max(4, prog.pct)}%` }} /></div>
        </div>
      </Card>
    );
  }
  if (suit.state === 'error') {
    return (
      <Card title="Тохиромжтой байдал" note="бүсийн үнэлгээ">
        <p className={o.state}>Үнэлгээ бодогдсонгүй.</p>
      </Card>
    );
  }

  const d = suit.data;
  // Сонгосон бүсийн оноо ба түвшин — толгойд харуулж, тэр түвшнийг тодруулна
  const zScore = zone ? d.byId[zone]?.score ?? null : undefined;
  const selLabel = zScore != null ? SCORE_LEVELS[levelOf(zScore)]?.label ?? null : null;
  const headScore = zone ? zScore ?? null : d.avgScore;

  // 5 түвшин + «өгөгдөлгүй» саарал сегмент (нийт бүстэй тэнцэнэ)
  const stackItems = [
    ...d.levels.map((l) => ({ key: l.label, label: l.label, value: l.n, color: l.color })),
    ...(d.noData > 0 ? [{ key: 'nd', label: 'Өгөгдөлгүй', value: d.noData, color: NO_DATA_COLOR }] : []),
  ];

  return (
    <Card title="Тохиромжтой байдал" note={zone ? `бүс ${zone}` : 'нийлмэл оноо'}>
      <div className={o.progressRow}>
        <span className={o.bigScore} style={{ color: scoreColor(headScore) }}>
          {headScore == null ? '—' : Math.round(headScore)}
        </span>
        <p className={o.progressText}>
          {zone
            ? <><b>{zone}</b> бүсийн оноо · {scoreLabel(headScore)}.</>
            : <><b>{num(d.zones)}</b> бүсийн дундаж · {scoreLabel(headScore)}.</>}
          {' '}Хот төлөвлөлт {100 - DEFAULT_ECON_SHARE}% + эдийн засаг {DEFAULT_ECON_SHARE}%.
        </p>
      </div>

      <Stack legend={false} total={d.zones} items={stackItems} />
      <div style={{ marginTop: 12 }}>
        <Bars
          max={Math.max(1, ...d.levels.map((l) => l.n))}
          selected={selLabel}
          items={d.levels.map((l) => ({
            key: l.label, label: l.label, value: l.n, display: `${num(l.n)} бүс`, color: l.color,
          }))}
        />
      </div>

      <div className={o.miniStats}>
        <div><span>Нийт ашиг/алдагдал</span><b className={d.profit >= 0 ? o.pos : o.neg}>{mnt(d.profit)}</b></div>
        <div><span>Ашигтай бүс</span><b>{num(d.profitZones)} / {num(d.zones)}</b></div>
      </div>
    </Card>
  );
}

/* ══════════════════ Анализ — дэд бүтцийн өртөг (баруун) ══════════════════ */

/**
 * Дэд бүтцийн төсөвт өртөг — салбараар (дугуй диаграм) + нэгж үзүүлэлт.
 * Геометр татдаггүй тул хурдан ачаална.
 */
function CostCard({ costs }: { costs: Async<CostSummary> }) {
  return (
    <Card title="Дэд бүтцийн өртөг" note="төсөл даяар · салбараар">
      <Data q={costs} loading="Өртөг тооцож байна…">
        {(d) =>
          d.bySector.length ? (
            <>
              <Donut
                items={d.bySector.map((c) => ({ key: c.key, label: c.label, value: c.value, color: c.color }))}
                center={mnt(d.total).replace(' ₮', '')}
                centerLabel="₮ нийт"
                size={124}
                width={20}
              />
              <div className={o.miniStats}>
                <div><span>Нийт өртөг</span><b>{mnt(d.total)}</b></div>
                <div><span>1 га-д</span><b>{mnt(d.perHa)}</b></div>
              </div>
            </>
          ) : (
            <p className={o.state}>Өртгийн мэдээлэл алга.</p>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Анализ — FAR / BCR норм үнэлгээ ══════════════════ */

/**
 * FAR ба BCR-ийг бүсийн төрлийн нормтой харьцуулж, норм хангасан/зөрчсөнөөр
 * задлан харуулна. Хэсэг бүр дарж болно — тухайн бүсүүдийг зурагт тодруулна.
 */
function FarBcrCard({ farbcr, zone }: { farbcr: Async<FarBcr>; zone: string | null }) {
  return (
    <Card title="FAR / BCR норм" note={zone ? `бүс ${zone} тодрол` : '52 бүс'}>
      <Data q={farbcr} loading="Тооцож байна…">
        {(d) => (
          <>
            <NormRow name="FAR" desc="Нягтралын коэффициент" e={d.far} zone={zone} />
            <NormRow name="BCR" desc="Барилгажилтын нягтрал" e={d.bcr} zone={zone} />
            <p className={o.normNote}>
              Норм нь бүсийн төрлөөр өөр (БНбД 30-01-24, Хүснэгт 6.1). Барилгажилт
              төлөвлөөгүй бүсийг үнэлгээнээс хассан.
            </p>
          </>
        )}
      </Data>
    </Card>
  );
}

function NormRow({ name, desc, e, zone }: {
  name: 'FAR' | 'BCR';
  desc: string;
  e: NormEval;
  zone: string | null;
}) {
  const key = name.toLowerCase();
  const evaluated = e.pass.length + e.fail.length;
  const rate = evaluated ? (e.pass.length / evaluated) * 100 : null;
  // Сонгосон бүс норм хангасан/зөрчсөнийг тодруулна
  const sel = zone
    ? e.pass.includes(zone) ? `${key}-pass` : e.fail.includes(zone) ? `${key}-fail` : null
    : null;

  const seg = (kind: 'pass' | 'fail') => {
    const ids = kind === 'pass' ? e.pass : e.fail;
    return {
      key: `${key}-${kind}`,
      label: kind === 'pass' ? 'Норм хангасан' : 'Норм зөрчсөн',
      value: ids.length,
      display: `${num(ids.length)} бүс`,
      color: kind === 'pass' ? PASS_HUE : FAIL_HUE,
    };
  };

  return (
    <div className={o.normRow}>
      <div className={o.normHead}>
        <span className={o.normName}>{name}</span>
        <span className={o.normDesc}>{desc}</span>
        <b className={o.normRate} style={{ color: scoreColor(rate) }}>
          {rate == null ? '—' : `${Math.round(rate)}%`}
        </b>
      </div>
      <Bars max={Math.max(1, e.pass.length, e.fail.length)} selected={sel} items={[seg('pass'), seg('fail')]} />
      {e.none > 0 && <div className={o.normNone}>+ {num(e.none)} бүс барилгажилт төлөвлөөгүй</div>}
    </div>
  );
}

/* ══════════════════ Анализ — бүсийн эрэмбэ ══════════════════ */

/**
 * Нийлмэл оноогоор хамгийн сайн / муу бүсүүд. Мөр дарахад тухайн бүсийг зурагт
 * тодруулж, chip-д харуулна.
 */
function RankingCard({ suit, zone, setZone }: { suit: Async<SuitSummary>; zone: string | null; setZone: (z: string | null) => void }) {
  const row = (r: SuitSummary['ranked'][number], rank: number) => (
    <button
      key={r.id}
      type="button"
      aria-pressed={zone === r.id}
      className={`${o.rankRow} ${zone === r.id ? o.rankOn : ''}`}
      // Мөр дарахад тэр бүсийг бүх дашбоарdaр сонгоно (дахин дарвал цуцална)
      onClick={() => setZone(zone === r.id ? null : r.id)}
    >
      <span className={o.rankNo}>{rank}</span>
      <span className={o.rankName}>{r.id}<i>{r.type}</i></span>
      <span className={`${o.rankScore} num`} style={{ background: scoreColor(r.score) }}>
        {r.score == null ? '—' : Math.round(r.score)}
      </span>
    </button>
  );

  return (
    <Card title="Бүсийн эрэмбэ" note="дарж бүс сонгоно">
      <Data q={suit} loading="Тооцож байна…">
        {(d) => {
          const scored = d.ranked.filter((r) => r.score != null);
          const top = scored.slice(0, 5);
          const bottom = scored.slice(-5).reverse();
          return (
            <div className={o.rankWrap}>
              <div>
                <div className={o.rankLabel}>Хамгийн сайн</div>
                {top.map((r, i) => row(r, i + 1))}
              </div>
              <div>
                <div className={o.rankLabel}>Хамгийн муу</div>
                {bottom.map((r, i) => row(r, scored.length - i))}
              </div>
            </div>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Барилгын зориулалт (#1) ══════════════════ */

function PurposeCard({ ov, filter, apply }: { ov: Async<Overview>; filter: Filter | null; apply: (f: Filter) => void }) {
  const sel = filter?.key.startsWith('purpose:') ? filter.key.slice(8) : null;
  return (
    <Card title="Барилгын зориулалт" note="дарж зурагт шүүнэ">
      <Data q={ov} loading="Тооцож байна…">
        {(d) => (
          <Bars
            color="#3387b8"
            limit={8}
            selected={sel}
            onSelect={(key) => {
              const g = d.buildByPurpose.find((x) => x.label === key);
              apply({
                key: `purpose:${key}`,
                label: `Зориулалт · ${key}`,
                where: g?.blank ? blankWhere(BUILT_FIELDS.purpose) : `${BUILT_FIELDS.purpose} = ${sqlStr(key)}`,
                layerIds: [BUILT_LAYER.id],
                count: g?.n,
              });
            }}
            items={d.buildByPurpose.map((g) => ({ key: g.label, label: g.label, value: g.n, display: `${num(g.n)} ш` }))}
          />
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Зогсоолын хангамж (#5) ══════════════════ */

function ParkingCard({ ov }: { ov: Async<Overview> }) {
  return (
    <Card title="Зогсоолын хангамж" note="норм ба төлөвлөлт">
      <Data q={ov} loading="Тооцож байна…">
        {(d) => {
          const p = d.parking;
          const rate = p.norm > 0 ? (p.planned / p.norm) * 100 : null;
          const gap = p.planned - p.norm;
          return (
            <>
              <div className={o.progressRow}>
                <Ring value={rate} color="#f59e0b" size={76} width={8} />
                <p className={o.progressText}>
                  Төлөвлөсөн зогсоол нормын <b>{rate == null ? '—' : `${Math.round(rate)}%`}</b>-ийг хангана.
                </p>
              </div>
              <Bars
                max={Math.max(1, p.norm, p.planned, p.existing)}
                items={[
                  { key: 'norm', label: 'Норм (шаардлага)', value: p.norm, display: num(p.norm), color: '#64748b' },
                  { key: 'plan', label: 'Төлөвлөсөн', value: p.planned, display: num(p.planned), color: '#f59e0b' },
                  { key: 'exist', label: 'Одоо байгаа', value: p.existing, display: num(p.existing), color: '#94a3b8' },
                ]}
              />
              <div className={o.miniStats}>
                <div><span>Ил / далд</span><b>{num(p.il)} / {num(p.dald)}</b></div>
                <div>
                  <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
                  <b className={gap >= 0 ? o.pos : o.neg}>{gap >= 0 ? '+' : '−'}{num(Math.abs(gap))}</b>
                </div>
              </div>
            </>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Инженерийн шугам километрээр (#14) ══════════════════ */

function EngineeringCard({ costs, filter, apply }: { costs: Async<CostSummary>; filter: Filter | null; apply: (f: Filter) => void }) {
  const sel = filter?.key.startsWith('eng:') ? filter.key.slice(4) : null;
  return (
    <Card title="Инженерийн шугам" note="дарж давхаргыг зурагт гаргана">
      <Data q={costs} loading="Тооцож байна…">
        {(d) =>
          d.engLengths.length ? (
            <>
              <Bars
                max={Math.max(1, ...d.engLengths.map((e) => e.km))}
                selected={sel}
                onSelect={(key) => {
                  const e = d.engLengths.find((x) => x.key === key);
                  apply({
                    key: `eng:${key}`,
                    label: `Шугам · ${e?.label ?? key}`,
                    where: '1=1', // тухайн системийн шугамын давхаргыг зурагт гаргана
                    layerIds: SECTOR_LAYERS[key] ?? [],
                  });
                }}
                items={d.engLengths.map((e) => ({
                  key: e.key, label: e.label, value: e.km, display: `${num(e.km, 1)} км`, color: e.color,
                }))}
              />
              <div className={o.miniStats}>
                <div><span>Нийт урт</span><b>{num(d.engLengths.reduce((a, e) => a + e.km, 0), 1)} км</b></div>
              </div>
            </>
          ) : (
            <p className={o.state}>Мэдээлэл алга.</p>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Илэрсэн асуудал (#11) ══════════════════ */

function IssuesCard({ issues, filter, apply }: { issues: Async<Issues>; filter: Filter | null; apply: (f: Filter) => void }) {
  const sel = filter?.key.startsWith('issue:') ? filter.key.slice(6) : null;
  return (
    <Card title="Илэрсэн асуудал" note="дарж зурагт шүүнэ">
      <Data q={issues} loading="Тооцож байна…">
        {(d) =>
          d.total === 0 ? (
            <p className={o.state}>Тайланд асуудал бүртгэгдээгүй.</p>
          ) : (
            <>
              <Donut
                items={d.byImpact.map((i) => ({ key: i.label, label: i.label, value: i.n, color: i.color }))}
                center={num(d.total)}
                centerLabel="асуудал"
                size={116}
                width={18}
                selected={sel}
                onSelect={(key) => {
                  const im = d.byImpact.find((x) => x.label === key);
                  apply({
                    key: `issue:${key}`,
                    label: `Асуудал · ${key}`,
                    // Асуудлыг эцэг тайлангийн цэгээр (`globalid`) газрын зурагт шүүнэ
                    where: im && im.parents.length ? `globalid IN (${im.parents.map(sqlStr).join(', ')})` : '1=0',
                    layerIds: ['mon:survey'],
                    count: im?.n,
                  });
                }}
              />
              {d.byCategory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <Bars
                    color="#ea580c"
                    limit={5}
                    items={d.byCategory.map((c) => ({ key: c.label, label: c.label, value: c.n, display: `${num(c.n)} ш` }))}
                  />
                </div>
              )}
            </>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Хүн амын нягтшил (#18) ══════════════════ */

const DENSITY_BANDS = [
  { key: 'b1', label: '< 150', lo: 0, hi: 150, color: '#f59e0b' },
  { key: 'b2', label: '150–300', lo: 150, hi: 300, color: '#a3d84a' },
  { key: 'b3', label: '300–450', lo: 300, hi: 450, color: '#16a34a' },
  { key: 'b4', label: '450–700', lo: 450, hi: 700, color: '#f59e0b' },
  { key: 'b5', label: '> 700', lo: 700, hi: Infinity, color: '#ef4444' },
];

function DensityCard({ suit, filter, apply }: { suit: Async<SuitSummary>; filter: Filter | null; apply: (f: Filter) => void }) {
  const sel = filter?.key.startsWith('dens:') ? filter.key.slice(5) : null;
  return (
    <Card title="Хүн амын нягтшил" note="дарж зурагт шүүнэ">
      <Data q={suit} loading="Тооцож байна…">
        {(d) => {
          const buckets = DENSITY_BANDS.map((b) => ({
            ...b,
            ids: d.densityZones.filter((z) => z.density >= b.lo && z.density < b.hi).map((z) => z.id),
          }));
          return (
            <>
              <Bars
                max={Math.max(1, ...buckets.map((b) => b.ids.length))}
                selected={sel}
                onSelect={(key) => {
                  const b = buckets.find((x) => x.key === key);
                  if (!b) return;
                  apply({
                    key: `dens:${key}`,
                    label: `Нягтшил · ${b.label} хүн/га`,
                    where: b.ids.length ? `${ZONE_FIELD} IN (${b.ids.map(sqlStr).join(', ')})` : '1=0',
                    layerIds: [ZONE_LAYER.id],
                    count: b.ids.length,
                  });
                }}
                items={buckets.map((b) => ({
                  key: b.key, label: `${b.label} хүн/га`, value: b.ids.length, display: `${num(b.ids.length)} бүс`, color: b.color,
                }))}
              />
              <p className={o.normNote}>
                БНбД 30-01-24, 6.9: 4–16 давхар хороолол 300–450 хүн/га (ногоон = норм).
                Зөвхөн оршин суугчтай бүс.
              </p>
            </>
          );
        }}
      </Data>
    </Card>
  );
}
