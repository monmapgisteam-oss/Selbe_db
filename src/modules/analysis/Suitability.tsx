'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { refreshEpoch, subscribeData } from '@/lib/dataBus';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import * as projection from '@arcgis/core/geometry/projection';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type Polygon from '@arcgis/core/geometry/Polygon';

import {
  INDICATORS, PARKING, MAP_LAYERS, BUILDING_STATUS_COLORS,
  ACTIVATABLE_ZONE_TYPES, NO_DATA_COLOR, BF, BUILDING_PURPOSE_OTHER,
  GREEN, GREEN_LAYER_KEY, LOCATION_RADII, LOCATION_ZONE_TYPES, LOCATION_EXCLUDE_OIDS,
  type Indicator, type ParkingOpt, type CategoryKey, type GreenOpt,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeRaw, defaultGreenCats,
  type AnalysisData, type BuildingPurposeStat,
} from '@/lib/analysis/data';
import { ZONE_TYPES, ZONE_TYPE_EMPTY_HUE, ZONE_FIELD, zoneRefValues, zoneLegacyValues } from '@/lib/services';
import { sqlStr } from '@/lib/query';
import {
  urbanScore, scoreColor, scoreTone, scoreInk, scoreLabel, passesNorm,
} from '@/lib/analysis/score';
import type { Dim } from '@/components/MapCanvas';
import { SuitMap, type MapRow } from './SuitMap';
import { SuitDetail } from './SuitDetail';
import { useTheme } from '@/lib/theme';
import { nf, esc, zoneTypeLabel } from './suit/format';
import { valueOf, type Mode, type Row } from './suit/model';
import { Shell, Card } from './suit/Layout';
import { Simulation } from './suit/SimulationPanel';
import { useSimClock } from './suit/Timeline';
import {
  simMetric, simRange, simNorm, simColor, simDef, peakVehicles,
  type SimKind, type PopBasis,
} from './suit/simulation';
import { assignLoads } from './suit/roadNet';
import { SIGNAL_PLANS, carCapacity, commonCarCap, type Network } from './suit/traffic';
import {
  loadNetworkCached, NET_KINDS, NET_SOURCES, isNetReady, netHasCars, type NetKind,
} from './suit/netSources';
import type { TrafficStats } from './suit/TrafficOverlay';
import { TransportPanel } from './suit/TransportPanel';
import {
  tPaint, tModeDef, tRange, tNormFor, tColor, buildingValue,
  type TMode, type TransportCtx,
} from './suit/transportModes';
import { densityHeat, transportHeat, MAP_STYLES, type MapStyle } from './suit/heat';
import { CAT_LABEL, BUS_BAND_LABEL } from '@/lib/analysis/transport';
import { loadBuildingsCached, type BuildingPt } from './suit/buildings';
import { assignRoadDemand } from './suit/roadDemand';
import { loadBusStopsCached, busAccess, type BusStop } from './suit/busAccess';
import { SuitLayerCatalog } from './suit/LayerCatalog';
import { Icon } from '@/components/Icon';
import { userError } from '@/components/ui';
import { MapTools } from '@/components/MapTools';
import { OpacityPanel } from '@/components/OpacityPanel';
import { CategoryPie, IndicatorPicker, Weights, Parking, Green, Location } from './suit/Urban';
import { Ranking } from './suit/Ranking';
import { setReportSource } from '@/lib/reportSource';
import { suitBlocks, type SuitShots } from './suit/suitReport';
import { liveMapViews } from '@/lib/mapShots';
import { mapShot } from '@/lib/viewReport';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import s from './suitability.module.css';

/** «Ачаалал» симуляцад автоматаар асах давхарга — «Зам (талбай)» */
const ROAD_AREA_LAYER = 'et:29';

/** Барилгын давхарга — «Бодит» симуляцад нуухад (одоо байгаа нөхцлийн зам л харагдана) */
const BUILDING_LAYER = 'et:24';

/** «Улаан бүсийн барилга» горимын бүсийн жигд саарал */
const LOC_ZONE_GRAY = '#64748b';

/** Тайлангийн газрын зургийн агшны будалт — оноо (urban · indicator) эсвэл симуляцын төрөл */
type ShotView = { mode: 'urban' | 'indicator' } | { mode: 'simulation'; sim: SimKind };

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Suitability({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /* ── Ачаалалт ── */
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoms, setGeoms] = useState<Map<string, Polygon | null> | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const retryLoad = useCallback(() => {
    setError(null);
    setLoadNonce((n) => n + 1);
  }, []);
  /* Сүлжээ сэргэхэд (`online`) — ЗӨВХӨН алдаатай үед өөрөө дахин оролдоно
     (`useAsync`-ийн 2026-10-05-ны -тэй ижил загвар). */
  const loadFailed = error != null;
  useEffect(() => {
    if (!loadFailed) return;
    window.addEventListener('online', retryLoad);
    return () => window.removeEventListener('online', retryLoad);
  }, [loadFailed, retryLoad]);

  const epoch = useSyncExternalStore(subscribeData, refreshEpoch, () => 0);
  const hasDataRef = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await loadAnalysisCached();
        if (!alive) return;

        // Дүрслэлийн геометрийг Web Mercator рүү (тооцоо нь UTM дээр хэвээр)
        await projection.load();
        const wm = SpatialReference.WebMercator;
        const gm = new Map<string, Polygon | null>();
        for (const z of d.zones) {
          gm.set(z.id, z.geometry ? (projection.project(z.geometry, wm) as Polygon) : null);
        }
        if (!alive) return;
        setData(d);
        setGeoms(gm);
        hasDataRef.current = true;

      } catch (e: unknown) {
        console.error('[selbe] анализ:', e);
        if (alive && !hasDataRef.current) setError(userError(e));
      }
    })();
    return () => { alive = false; };
  }, [loadNonce, epoch]);

  /* ── Загварын төлөв ── */
  const [mode, setMode] = useState<Mode>('urban');
  const dark = useTheme().theme === 'dark';
  const [indicators, setIndicators] = useState<Indicator[]>(() => INDICATORS.map((i) => ({ ...i })));
  const [activeIndicator, setActiveIndicator] = useState(INDICATORS[0].id);
  const [catFilter, setCatFilter] = useState<CategoryKey | null>(null);
  /**
   * Идэвхтэй симуляцын дэд төрөл — «Симуляц» табд ашиглана.
   */
  const [simKind, setSimKind] = useState<SimKind>('road');
  /** Хүн амын төрөл — «Хүн амын төвлөрөл» симуляцад (оршин суугч ↔ хүчин чадал) */
  const [popBasis, setPopBasis] = useState<PopBasis>('resident');
  /**
   * Тээвэр-идэвхийн дүрслэл ба тэр самбар ИДЭВХТЭЙ эсэх.
   */
  const [tMode, setTMode] = useState<TMode>('trips');
  const [tActive, setTActive] = useState(false);
  /**
   * Симуляцын газрын зургийн ХЭВ МАЯГ — полигон (хил хэвээр) ↔ дулааны гадаргуу.
   */
  const [mapStyle, setMapStyle] = useState<MapStyle>('poly');
  /** Трафик timeline-ийн цаг (замын симуляц + ирээдүйд газрын зургийн анимац) */
  const clock = useSimClock();
  const [parking, setParking] = useState<ParkingOpt>({ ...PARKING });
  /** Ногоон байгууламжийн хэрэгцээг хэрхэн тооцох — «Ногоон байгууламж» карт */
  const [greenOpt, setGreenOpt] = useState<GreenOpt>({ ...GREEN });
  const [greenCats] = useState<Set<string>>(() => defaultGreenCats());
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * Бүсийн АНГИЛЛЫН шүүлт — унтраасан ангиллууд (`Angilal` → каноник `type`).
   * Хоосон = бүгд харагдана. Газрын зураг ба эрэмбэд ДИНАМИК үйлчилнэ.
   */
  const [catOff, setCatOff] = useState<Set<string>>(() => new Set());
  /**
   * ХАСАГДСАН боловч ОНООЛОЛД ОРУУЛСАН ангиллууд (нийгмийн дэд бүтэц, газар
   * чөлөөлөлт дутуу — 17 бүс).
   */
  const [scoreOn, setScoreOn] = useState<Set<string>>(() => new Set(ACTIVATABLE_ZONE_TYPES));
  /**
   * БАРИЛГЫН зориулалтын шүүлт — унтраасан бүлгүүд (`BUILDING_PURPOSES[].key`).
   * Хоосон = бүх барилга харагдана. Зөвхөн ГАЗРЫН ЗУРГИЙН харагдацад
   * үйлчилнэ: бүсийн оноо барилгуудаас нэгтгэгддэг тул энд шүүвэл дүн өөрчлөгдөж,
   * «би зөвхөн нуусан» гэж бодсон хэрэглэгч өөр оноо хараад төөрнө.
   */
  const [bldOff, setBldOff] = useState<Set<string>>(() => new Set());
  /**
   * ШҮҮСЭН БАРИЛГА руу газрын зургийг төвлөрүүлэх ТООЛУУР.
   */
  const [bldFocus, setBldFocus] = useState(0);
  /** «Байршил» картын хүрээний радиус (м) */
  const [locRadius, setLocRadius] = useState(LOCATION_RADII[2]);
  /** «Байршил» картаас газрын зурагт тодруулсан барилга (OBJECTID) */
  const [locPick, setLocPick] = useState<number | null>(null);
  /** «Байршил» — зөвхөн олон нийтийн бүсийн барилгыг үзэх */
  const [locPublicOnly, setLocPublicOnly] = useState(false);

  /**
   * Контекст давхаргын ил байдал.
   */
  const [layerOn, setLayerOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MAP_LAYERS.map((l) => [l.key, l.on])),
  );
  /**
   * Давхаргын каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх «Давхарга»
   * товчтой ижил зарчим. Хаалттай эхэлж, товч дарахад газрын зурагт хөвж гарна.
   */
  const [layerCatOpen, setLayerCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  /** Тайлангийн газрын зургийн агшин — түр будалт (`shoot`); null бол дэлгэцийн ердийн будалт */
  const [shotView, setShotView] = useState<ShotView | null>(null);
  const appRef = useRef<HTMLDivElement>(null);

  /* ── Тооцоо ── */
  const rows = useMemo<Row[]>(() => {
    if (!data || !geoms) return [];
    computeRaw(data.zones, greenCats, parking, scoreOn, indicators);
    return data.zones.map((z) => {
      const u = urbanScore(z.raw, indicators, z.type);
      return {
        ...z,
        urban: u.score,
        parts: u.parts,
        coverage: u.coverage,
        urbanReason: u.reason,
        displayGeom: geoms.get(z.id) ?? null,
        scored: !z.excluded || scoreOn.has(z.type),
      };
    });
  }, [data, geoms, greenCats, parking, indicators, scoreOn]);

  /**
   * Олон нийтийн бүсийн кодууд — чагт асаалттай үед зураг ба картыг хумина.
   */
  const publicZoneIds = useMemo(
    () => rows.filter((r) => LOCATION_ZONE_TYPES.includes(r.type)).map((r) => r.id),
    [rows],
  );

  /**
   * «Байршил» картын шинжилгээнд орох барилгууд.
   */
  const locPts = useMemo(() => {
    const all = data?.bldPts ?? [];
    if (!locPublicOnly) return all;
    const keep = new Set(publicZoneIds);
    return all.filter((p) => p.zone != null && keep.has(p.zone)
      && !LOCATION_EXCLUDE_OIDS.has(p.oid));
  }, [data, locPublicOnly, publicZoneIds]);


  /**
   * ОНООЛОЛД орох бүсүүд — ногоон байгууламж, одоо байгаа барилгыг ХАСНА.
   */
  const scoredRows = useMemo(
    () => rows.filter((r) => !r.excluded || scoreOn.has(r.type)),
    [rows, scoreOn],
  );

  /** Бүсийн ангиллууд — нэр · тоо · өнгө (ZONE_TYPES дарааллаар). */
  const zoneCats = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const r of rows) cnt.set(r.type, (cnt.get(r.type) ?? 0) + 1);
    const order = Object.keys(ZONE_TYPES);
    return [...cnt.keys()]
      .sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99))
      .map((type) => ({ type, count: cnt.get(type) ?? 0, color: ZONE_TYPES[type] ?? ZONE_TYPE_EMPTY_HUE }));
  }, [rows]);

  /**
   * «Ногоон байгууламж» картын гулсуур ↔ `green` ҮЗҮҮЛЭЛТИЙН НОРМ — нэг утга.
   */
  const greenTarget = indicators.find((i) => i.id === 'green')?.target ?? GREEN.perPerson;
  const greenView: GreenOpt = { ...greenOpt, perPerson: greenTarget };
  const applyGreen = useCallback((g: GreenOpt) => {
    setGreenOpt(g);
    if (g.perPerson !== greenTarget) {
      setIndicators((prev) => prev.map((i) => (i.id === 'green' ? { ...i, target: g.perPerson } : i)));
    }
  }, [greenTarget]);

  /**
   * Ногоон байгууламжийн давхаргыг газрын зурагт асаах.
   */
  const showGreenLayer = useCallback(() => {
    setLayerOn((v) => (v[GREEN_LAYER_KEY] ? v : { ...v, [GREEN_LAYER_KEY]: true }));
  }, []);

  /** Барилгын зориулалтын бүлгүүд — ачаалалтад нэгтгэгдсэн. */
  const bldCats = useMemo<BuildingPurposeStat[]>(() => data?.buildingCats ?? [], [data]);

  /**
   * Барилгын давхаргын SQL шүүлт — унтраасан бүлгийн зориулалтуудыг хасна.
   */
  const bldWhere = useMemo(() => {
    const parts: string[] = [];

    /* ── ЗОРИУЛАЛТЫН шүүлт ── */
    if (bldOff.size) {
      const values = bldCats.filter((c) => bldOff.has(c.key)).flatMap((c) => c.values);
      const otherOn = !bldOff.has(BUILDING_PURPOSE_OTHER.key);
      if (!values.length) {
        if (!otherOn) parts.push(`${BF.purpose} IS NOT NULL`);
      } else {
        const list = values.map(sqlStr).join(',');
        const not = `${BF.purpose} NOT IN (${list})`;
        parts.push(otherOn ? `(${BF.purpose} IS NULL OR ${not})` : not);
      }
    }

    /* ── БҮСИЙН АНГИЛЛЫН шүүлт ── */
    const zoneVals = (ids: string[]) => [...new Set(ids.flatMap((id) => [...zoneLegacyValues(id), ...zoneRefValues(id)]))];
    if (catOff.size && rows.length) {
      const keep = rows.filter((r) => !catOff.has(r.type)).map((r) => r.id);
      if (!keep.length) return '1=0';
      const vals = zoneVals(keep);
      parts.push(`${ZONE_FIELD} IN (${vals.map(sqlStr).join(',')})`);
    }

    /**
     * «Байршил» картын чагт — улаан бүсийн барилга.
     */
    if (locPublicOnly) {
      if (!locPts.length) return '1=0';
      parts.push(`objectid IN (${locPts.map((p) => p.oid).join(',')})`);
    }

    return parts.length ? parts.join(' AND ') : null;
  }, [bldCats, bldOff, catOff, rows, locPublicOnly, locPts]);

  /** Эрэмбэд орох бүс — оноолсон бүсээс ангиллын шүүлтээр (динамик). */
  const rankRows = useMemo(() => scoredRows.filter((r) => !catOff.has(r.type)), [scoredRows, catOff]);

  const ind = indicators.find((i) => i.id === activeIndicator) ?? indicators[0];
  const totalW = indicators.reduce((a, i) => a + i.weight, 0) || 1;


  /**
   * СИМУЛЯЦЫН ОЛОНЛОГ — ангиллын шүүлтээр (`catOff`).
   */
  const simRows = useMemo(() => rows.filter((r) => !catOff.has(r.type)), [rows, catOff]);

  /** Симуляцын хэмжүүрийн хязгаар — нормчилол ба легендэд (харагдах бүсээр). */
  const simRng = useMemo(() => simRange(simRows, simKind, popBasis), [simRows, simKind, popBasis]);
  /** Тайлангийн агшны симуляцын хязгаар (`shotView`) */
  const shotRng = useMemo(
    () => (shotView?.mode === 'simulation' ? simRange(simRows, shotView.sim, popBasis) : null),
    [shotView, simRows, popBasis],
  );

  /**
   * Бүсийн симуляцын хэмжүүрийн ДУНДАЖ — hover панелийн «дунджаас» мөрд.
   */
  const simAvg = useMemo(() => {
    if (mode !== 'simulation') return 0;
    const vals = simRows
      .map((r) => simMetric(r, simKind, popBasis).value)
      .filter((v): v is number => v != null && Number.isFinite(v) && (simKind === 'transit' ? v >= 0 : v > 0));
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
  }, [simRows, simKind, popBasis, mode]);

  /* ── Замын ачаалал: сүлжээг ХЭРЭГТЭЙ болоход нь ачаална ── */
  const roadMode = mode === 'simulation' && !tActive && simKind === 'road';
  if (!roadMode && clock.playing) clock.setPlaying(false);
  /** Тээвэр-идэвхийн самбар газрын зургийг буддаг эсэх */
  const transportMode = mode === 'simulation' && tActive;
  /**
   * Харьцуулах ЗАМЫН СҮЛЖЭЭ — Бодит / Төлөвлөгөө / Шинэ зам (`netSources.ts`).
   */
  const [netKind, setNetKind] = useState<NetKind>('plan');
  /**
   * Идэвхтэй сүлжээн дээр МАШИН явах уу («Шинэ зам» — зөвхөн харагдана).
   */
  const netCars = netHasCars(netKind);
  /**
   * Сүлжээг АЛЬ өгөгдлөөр татах вэ. Тээвэр-идэвхийн анализад заавал явдаг
   * сүлжээ хэрэгтэй тул машингүй сүлжээ сонгосон байвал «Бодит» руу шилжинэ.
   */
  const netLoad: NetKind = netCars ? netKind : 'real';
  const needNet = (roadMode && netCars) || transportMode;
  /**
   * Идэвхтэй дүрслэлд дулааны гадаргуу утга ЗҮЙТЭЙ эсэх.
   */
  const heatable = transportMode ? tModeDef(tMode).heatable : simDef(simKind).heatable;
  const heatOn = mode === 'simulation' && mapStyle === 'heat' && heatable;
  const needBuildings = tActive || heatOn;
  /**
   * Оргил цагт сүлжээнд зэрэг явах машин — бүсийн хүн амаас (гараар өгөөгүй).
   */
  const peakCars = useMemo(() => peakVehicles(rows), [rows]);
  const [roadNet, setRoadNet] = useState<Network | null>(null);
  const [roadErr, setRoadErr] = useState<string | null>(null);
  const [trafficStats, setTrafficStats] = useState<TrafficStats | null>(null);
  /**
   * ГЭРЛЭН ДОХИОНЫ зохицуулалтын хөтөлбөр (2 / 4 / 8 ээлж).
   */
  /**
   * ГЭРЛЭН ДОХИОНЫ БАРИГДСАН ЭЭЛЖ — null бол хуваарь автоматаар эргэлдэнэ;
   * тоо бол тэр ээлжийн кодууд газрын зураг дээр БАЙНГА ногоон (бусад нь улаан).
   * Ээлж бүрийн үйлчлэлийг нүдээр шалгах горим.
   */
  const [signalStage, setSignalStage] = useState<number | null>(null);
  /**
   * Боломжит хөтөлбөрүүд — сүлжээний ГЕОМЕТРЭЭС бодсон «Авто (зөрчилгүй)» нь
   * эхэнд, дараа нь гараар бичсэн хувилбарууд.
   */
  /** Бодит уулзварын хуваарь — UI-д ганц хөтөлбөр (3 ээлж: 3·4·7·8 → 1·6 → 2·5) */
  const realPlan = useMemo(
    () => SIGNAL_PLANS.find((x) => x.key === 'real') ?? SIGNAL_PLANS[0],
    [],
  );
  /**
   * Хөдөлгүүр/зуралтад өгөх ИДЭВХТЭЙ хөтөлбөр.
   */
  const signalPlan = useMemo(() => {
    if (signalStage == null || !realPlan.stages[signalStage]) return realPlan;
    const held = Object.fromEntries(
      Object.entries(realPlan.byJunction ?? {}).map(([name, st]) => [
        name, [st[signalStage] ?? st[st.length - 1]],
      ]),
    );
    return {
      ...realPlan,
      key: `stage${signalStage}`,
      stages: [realPlan.stages[signalStage]],
      byJunction: held,
      yellow: 0,
    };
  }, [realPlan, signalStage]);

  // Сүлжээ солиход хуучин геометрийг цэвэрлэж дахин ачаална (ирмэг индекс өөр).
  const [netLoaded, setNetLoaded] = useState<typeof netLoad | null>(null);
  if (netLoaded !== netLoad) {
    setNetLoaded(netLoad);
    setRoadNet(null);
    setRoadErr(null);
    setTrafficStats(null);
  }
  const trafficLive = roadMode && netCars && !!roadNet && dim === '2d';
  const [trafficWas, setTrafficWas] = useState(trafficLive);
  if (trafficWas !== trafficLive) {
    setTrafficWas(trafficLive);
    if (!trafficLive) setTrafficStats(null);
  }

  useEffect(() => {
    if (!needNet || roadNet || roadErr || !rows.length) return;
    let alive = true;
    loadNetworkCached(netLoad)
      .then((net) => {
        if (!alive) return;
        assignLoads(net, rows);
        setRoadNet(net);
      })
      .catch((e: unknown) => {
        console.error('[selbe] замын сүлжээ:', e);
        if (alive) setRoadErr(userError(e));
      });
    return () => { alive = false; };
  }, [needNet, roadNet, roadErr, rows, netLoad]);

  /**
   * МАШИНТАЙ БҮХ СҮЛЖЭЭНИЙ БАГТААМЖ — НЭГ машины тагт (`commonCarCap`).
   */
  const [netCaps, setNetCaps] = useState<Partial<Record<NetKind, number>>>({});
  const [netCapErr, setNetCapErr] = useState<Partial<Record<NetKind, true>>>({});
  useEffect(() => {
    if (!roadMode) return;
    let alive = true;
    for (const k of NET_KINDS) {
      if (!netHasCars(k) || !isNetReady(k) || netCaps[k] != null || netCapErr[k]) continue;
      loadNetworkCached(k)
        .then((net) => { if (alive) setNetCaps((c) => (c[k] != null ? c : { ...c, [k]: carCapacity(net) })); })
        .catch(() => { if (alive) setNetCapErr((m) => ({ ...m, [k]: true })); /* таг нь бусдаас; самбар «татагдсангүй» гэнэ */ });
    }
    return () => { alive = false; };
  }, [roadMode, netCaps, netCapErr]);
  const carKinds = NET_KINDS.filter((k) => netHasCars(k) && isNetReady(k));
  const knownCaps = carKinds.map((k) => netCaps[k]).filter((v): v is number => v != null);
  const carCap = commonCarCap(peakCars, knownCaps);
  const capFailed = carKinds.some((k) => netCapErr[k] && netCaps[k] == null);
  const capPending = knownCaps.length + carKinds.filter((k) => netCapErr[k] && netCaps[k] == null).length < carKinds.length;
  /** Сүлжээнд наалдсан гэрлэн дохиотой уулзварын тоо — самбарт «дохио ачаалагдсан уу» */
  const signalJunctions = useMemo(
    () => (roadNet ? new Set(roadNet.signalLines.map((l) => l.j ?? '')).size : undefined),
    [roadNet],
  );

  /* ── Тээвэр-идэвх: барилга ба автобусны буудлыг самбарыг нээхэд татна ── */
  const [tData, setTData] = useState<{ buildings: BuildingPt[]; stops: BusStop[] } | null>(null);
  const [tErr, setTErr] = useState<string | null>(null);

  useEffect(() => {
    if (!needBuildings || tData || tErr) return;
    let alive = true;
    Promise.all([loadBuildingsCached(), loadBusStopsCached()])
      .then(([buildings, stops]) => { if (alive) setTData({ buildings, stops }); })
      .catch((e: unknown) => {
        console.error('[selbe] тээвэр-идэвх:', e);
        if (alive) setTErr(userError(e));
      });
    return () => { alive = false; };
  }, [needBuildings, tData, tErr]);

  const retryTransport = useCallback(() => { setTErr(null); setRoadErr(null); }, []);

  /**
   * Тээврийн БҮХ тооцоо — барилга, зам, автобус гурав нэг дор.
   */
  const tCtx = useMemo<TransportCtx | null>(() => {
    if (!tData || !roadNet) return null;
    return {
      buildings: tData.buildings,
      stops: tData.stops,
      net: roadNet,
      demand: assignRoadDemand(roadNet, tData.buildings),
      bus: busAccess(tData.buildings, tData.stops, roadNet.unitsPerMeter),
    };
  }, [tData, roadNet]);

  const transportPaint = useMemo(
    () => (transportMode && tCtx ? tPaint(tMode, tCtx) : null),
    [transportMode, tCtx, tMode],
  );

  /** Дулааны гадаргууны цэгүүд — «Симуляц» горимд, дүрслэл нь дулаанд тохирвол. */
  const heat = useMemo(() => {
    if (!heatOn) return null;
    if (transportMode) return tCtx ? transportHeat(tCtx, tMode) : null;
    if (!tData) return null;
    const zoneIds = new Set(rows.filter((r) => !catOff.has(r.type)).map((r) => r.id));
    return densityHeat(tData.buildings, popBasis, zoneIds);
  }, [heatOn, transportMode, tCtx, tMode, tData, popBasis, rows, catOff]);

  /** Тээврийн дүрслэл сонгох — энэ самбарыг идэвхжүүлж, бүсийн будалтыг тавьж өгнө */
  const pickTMode = useCallback((m: TMode) => { setTMode(m); setTActive(true); }, []);
  /** Бүсийн симуляц сонгох — тээврийн самбар идэвхгүй болж, будалт бүс рүү буцна */
  const pickSimKind = useCallback((k: SimKind) => { setSimKind(k); setTActive(false); }, []);

  /**
   * «Ачаалал» табд ЗАМЫН ТАЛБАЙГ автоматаар асаана — машин агентууд юун дээр
   * гүйж байгаа нь харагдахгүй бол симуляц утгагүй. Агентууд `et:5` тэнхлэгээр
   * явдаг тул `et:29` полигоны яг дундуур гүйж харагдана.
   */
  const layerOnRef = useRef(layerOn);
  useSyncRef(layerOnRef, layerOn);
  useEffect(() => {
    if (!roadMode || netKind !== 'plan' || layerOnRef.current[ROAD_AREA_LAYER]) return;
    setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: true }));
    return () => setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: false }));
  }, [roadMode, netKind]);

  /**
   * «Шинэ зам» сонгоход түүний line давхаргуудыг АВТОМАТААР асаана.
   */
  useEffect(() => {
    const keys = (NET_SOURCES[netKind].display ?? []).filter((k) => !layerOnRef.current[k]);
    if (!roadMode || !keys.length) return;
    setLayerOn((v) => ({ ...v, ...Object.fromEntries(keys.map((k) => [k, true])) }));
    return () => setLayerOn((v) => ({ ...v, ...Object.fromEntries(keys.map((k) => [k, false])) }));
  }, [roadMode, netKind]);

  /**
   * «Бодит» замын симуляцад БАРИЛГЫГ нуана — одоо байгаа нөхцлийг харуулах тул
   * төлөвлөлтийн барилгууд зам дээр давхарлахгүй. Гарахад буцааж асаана (хэрэглэгч
   * өөрөө унтрааж байсныг ялгах хэрэггүй — барилга анхдагчаараа асаалттай).
   */
  useEffect(() => {
    if (!(roadMode && netKind === 'real')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayerOn((v) => ({ ...v, [BUILDING_LAYER]: false }));
    return () => setLayerOn((v) => ({ ...v, [BUILDING_LAYER]: true }));
  }, [roadMode, netKind]);

  const colorOf = useCallback(
    (r: MapRow) => {
      if (shotView) {
        return shotView.mode === 'simulation'
          ? simColor(simNorm(simMetric(r, shotView.sim, popBasis).value, shotRng ?? simRng))
          : scoreColor(valueOf(r as Row, shotView.mode, ind), dark);
      }
      if (transportMode) return NO_DATA_COLOR;
      if (locPublicOnly) return LOC_ZONE_GRAY;
      return mode === 'simulation'
        ? simColor(simDef(simKind).ready ? simNorm(simMetric(r, simKind, popBasis).value, simRng) : null)
        : scoreColor(valueOf(r as Row, mode, ind), dark);
    },
    [mode, ind, simKind, popBasis, simRng, transportMode, locPublicOnly, dark, shotView, shotRng],
  );
  /**
   * «БОДИТ» замын симуляц — ОДОО БАЙГАА нөхцлийг харуулах тул төлөвлөлтийн
   * давхаргууд (бүсийн полигон, барилга) газрын зургаас нуугдана: зөвхөн бодит
   * зам + трафик + хэрэглэгчийн vector tile суурь үлдэнэ.
   */
  const bareReal = roadMode && netKind === 'real';
  /** Бүс газрын зурагт харагдах эсэх — ангиллын шүүлтээр (унтраасан нь бүдгэрнэ) */
  const shown = useCallback(
    (r: MapRow) => !bareReal && !catOff.has(r.type)
      && (!locPublicOnly || LOCATION_ZONE_TYPES.includes(r.type)),
    [catOff, bareReal, locPublicOnly],
  );

  /* ── Hover панелийн HTML (эх аппын адил мөрөөр) ── */
  const zoneTip = useCallback((r: MapRow) => {
    /**
     * СИМУЛЯЦЫН hover панель — оноололынхоос ТУСДАА бүтэцтэй.
     */
    if (mode === 'simulation') {
      const def = simDef(simKind);
      const m = simMetric(r, simKind, popBasis);
      const t = def.ready ? simNorm(m.value, simRng) : null;
      const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;

      const diff = m.value != null && simAvg > 0 ? ((m.value - simAvg) / simAvg) * 100 : null;
      const diffTxt = diff == null ? '—'
        : `<b style="color:${diff > 0 ? 'var(--warn-ink)' : 'var(--good-ink)'}">${diff > 0 ? '+' : ''}${Math.round(diff)}%</b>`;

      return tr('\n        <div class="t">\n          <b>{0}</b>\n          <span class="st" style="background:{1};color:#1a1205">{2}</span>\n        </div>\n        <div class="sub2">{3} · {4} га</div>\n        <dl>\n          {5}\n          {6}\n          {7}\n          {8}\n        </dl>', esc(r.id), simColor(t), t == null ? '—' : Math.round(t * 100), esc(zoneTypeLabel(r.type)), nf(r.areaHa, 2), dt(esc(def.label), `<b>${m.text}</b>`), dt(tr('Дунджаас'), diffTxt), dt(tr('Оршин суугч'), nf(r.residentPop)), dt(tr('Барилга'), nf(r.buildingCount)));
    }
    const row = r as Row;
    const score = valueOf(row, mode, ind);
    let pass = 0, total = 0;
    const failed: { name: string; v: string }[] = [];
    for (const i of indicators) {
      if (i.ref || i.weight <= 0) continue;
      const p = row.parts[i.id];
      if (!p || p.value == null) continue;
      total++;
      if (passesNorm(p.value, p.norm ?? i)) pass++;
      else failed.push({ name: i.short, v: nf(p.value, i.decimals) + (i.unit ? ` ${i.unit}` : '') });
    }
    const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
    return tr('\n      <div class="t">\n        <b>{0}</b>\n        <span class="st" style="background:{1}">{2}</span>\n      </div>\n      <div class="sub2">{3} · {4} га · {5}</div>\n      <dl>\n        {6}\n        {7}\n        {8}\n        {9}\n      </dl>\n      {10}', esc(row.id), `${scoreTone(score)};color:${scoreInk(score, dark)}`, score == null ? '—' : Math.round(score), esc(zoneTypeLabel(row.type)), nf(row.areaHa, 2), scoreLabel(score), dt(tr('Оршин суугч'), nf(row.residentPop)), dt(tr('Өрх'), nf(row.households)), dt(tr('Барилга'), nf(row.buildingCount)), dt(tr('Норм хангасан'), `<b style="color:${pass === total ? 'var(--good-ink)' : 'var(--bad-ink)'}">${pass} / ${total}</b>`), failed.length ? `<div class="fails">${failed.map((f) =>
        `<div><span>✗ ${esc(f.name)}</span><em>${f.v}</em></div>`).join('')}</div>` : '');
  }, [mode, ind, indicators, simKind, popBasis, simRng, simAvg, dark]);

  /**
   * ТЭЭВЭР-ИДЭВХИЙН hover панель — барилга · замын хэрчим · автобусны буудал.
   */
  const transportTip = useCallback((kind: 'b' | 'r' | 's', idx: number): string | null => {
    if (!tCtx) return null;
    const def = tModeDef(tMode);
    const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;

    if (kind === 'b') {
      const b = tCtx.buildings[idx];
      if (!b) return null;
      const v = buildingValue(b, tMode, tCtx, idx);
      if (v == null) return null;
      const t = tNormFor(tMode, v, tRange(tMode, tCtx));
      const acc = tCtx.bus.access[idx];
      const link = tCtx.demand.links[idx];
      return `
        <div class="t">
          <b>${esc(b.purpose || CAT_LABEL[b.cat])}</b>
          <span class="st" style="background:${tColor(tMode, t)};color:#1a1205">${
        t == null ? '—' : Math.round(t * 100)}</span>
        </div>
        <div class="sub2">${esc(CAT_LABEL[b.cat])}${b.zone ? ` · ${esc(b.zone)}` : ''}</div>
        <dl>
          ${dt(esc(def.label), `${nf(v)} ${def.unit}`)}
          ${dt(b.cat === 'residential' ? tr('Оршин суугч') : tr('Хүчин чадал'),
        nf(b.cat === 'residential' ? b.population : b.capacity))}
          ${dt(tr('Хүн-зорчилт'), tr('{0} /ц', nf(b.trips)))}
          ${dt(tr('Машин-зорчилт'), tr('{0} /ц', nf(b.vehTrips)))}
          ${dt(tr('Ойрын зам'), link ? tr('{0} м', nf(link.distsM[0])) : tr('<b style="color:var(--bad-ink)">холбогдоогүй</b>'))}
          ${dt(tr('Автобус'), acc ? tr('{0} м · {1}', nf(acc.distM), esc(BUS_BAND_LABEL[acc.band])) : '—')}
        </dl>`;
    }

    if (kind === 'r') {
      const e = tCtx.net.edges[idx];
      const v = tCtx.demand.edgeDemand[idx];
      if (!e || !(v > 0)) return null;
      const t = tCtx.demand.max > 0 ? v / tCtx.demand.max : 0;
      return tr('\n        <div class="t">\n          <b>Замын хэрчим</b>\n          <span class="st" style="background:{0};color:#1a1205">{1}</span>\n        </div>\n        <div class="sub2">{2} м урт</div>\n        <dl>\n          {3}\n          {4}\n        </dl>\n        <div class="fails"><div><span>Эрэлт — хүчин чадалтай харьцуулаагүй</span><em>V/C биш</em></div></div>', tColor(tMode, t), Math.round(t * 100), nf(e.length / tCtx.net.unitsPerMeter), dt(tr('Эрэлт'), tr('{0} машин/ц', nf(v))), dt(tr('Хамгийн ихээс'), `${Math.round(t * 100)}%`));
    }

    const st = tCtx.stops[idx];
    if (!st) return null;
    const demand = tCtx.bus.stopDemand[idx];
    let served = 0;
    let servedPop = 0;
    for (let i = 0; i < tCtx.buildings.length; i++) {
      if (tCtx.bus.access[i]?.stop !== idx) continue;
      served++;
      if (tCtx.buildings[i].cat === 'residential') servedPop += tCtx.buildings[i].population;
    }
    return tr('\n      <div class="t"><b>Автобусны буудал</b></div>\n      <div class="sub2">#{0}</div>\n      <dl>\n        {1}\n        {2}\n        {3}\n      </dl>', st.oid, dt(tr('Зорчигчийн эрэлт'), tr('{0} /ц', nf(demand))), dt(tr('Үйлчлэх барилга'), nf(served)), dt(tr('Үйлчлэх оршин суугч'), nf(servedPop)));
  }, [tCtx, tMode]);

  const buildingTip = useCallback((a: Record<string, unknown>) => {
    const st = String(a.barilga_ty ?? '').trim();
    const purpose = String(a['зориулалт_m'] ?? '').trim() || tr('Тодорхойгүй');
    const colors: Record<string, string> = Object.fromEntries(
      Object.entries(BUILDING_STATUS_COLORS).map(([k, c]) => [k, `rgb(${c.join(',')})`]),
    );
    const pop = Number(a.total_population ?? 0);
    const isRes = /орон сууц|house/i.test(purpose);
    const dt = (k: string, v: string | number | null) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    const areaM2 = Number(a['барилгын_нийт_талбай_m2']);
    const area = Number.isFinite(areaM2) && areaM2 > 0 ? tr('{0} м²', nf(areaM2)) : null;
    return tr('\n      <div class="t">\n        <b>{0}</b>\n        {1}\n      </div>\n      <dl>\n        {2}\n        {3}\n        {4}\n        {5}\n        {6}\n        {7}\n      </dl>', esc(purpose), st ? `<span class="st" style="background:${colors[st] ?? 'rgb(203,213,225)'}">${esc(st)}</span>` : '', dt(tr('Нийт талбай'), area), dt(tr('Давхар'), Number(a['давхрын_тоо_max'] ?? 0) || null), dt(tr('Өрх'), Number(a.urhiin_too ?? 0) ? nf(Number(a.urhiin_too)) : null), dt(isRes ? tr('Оршин суугч') : tr('Хүчин чадал'), pop ? nf(pop) : null), dt(tr('Зогсоол'), Number(a.parking ?? 0) ? nf(Number(a.parking)) : null), dt(tr('Бүс'), esc(a.zone_id ?? '—')));
  }, []);

  const selRow = rows.find((r) => r.id === selected) ?? null;
  const active = selRow && selRow.scored && !catOff.has(selRow.type) ? selRow : null;
  const selectedLive = active ? selected : null;

  const netLabel = NET_SOURCES[netKind].label;
  const reportTraffic = trafficLive ? trafficStats : null;
  const shoot = useCallback(async (v: ShotView) => {
    const host = appRef.current;
    if (!host || !liveMapViews(host).length) return null;
    setShotView(v);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await wait(150);
    const view = liveMapViews(host)[0];
    if (view) await Promise.race([reactiveUtils.whenOnce(() => !view.updating), wait(4000)]);
    await wait(400);
    return mapShot(host);
  }, []);
  useEffect(() => setReportSource('analysis', {
    blocks: async () => {
      const input = {
        rows, scored: scoredRows, ranked: rankRows, sim: simRows, indicators, parking, green: { ...greenOpt, perPerson: greenTarget },
        popBasis, traffic: reportTraffic, netLabel, indicatorName: ind.short,
      };
      const shots: SuitShots = {};
      const plan: [keyof SuitShots, ShotView][] = [
        ['urban', { mode: 'urban' }], ['indicator', { mode: 'indicator' }],
        ['density', { mode: 'simulation', sim: 'density' }], ['transit', { mode: 'simulation', sim: 'transit' }],
        ['road', { mode: 'simulation', sim: 'road' }],
      ];
      try {
        for (const [k, v] of plan) shots[k] = (await shoot(v)) ?? undefined;
      } finally {
        setShotView(null);
      }
      return suitBlocks(input, shots);
    },
    filters: () => (catOff.size ? [tr('Нуусан бүсийн ангилал: {0}', [...catOff].join(', '))] : []),
  }), [rows, scoredRows, rankRows, simRows, indicators, parking, greenOpt, greenTarget, popBasis, reportTraffic, netLabel, catOff, ind.short, shoot]);

  /**
   * «Симуляц» — ХОЁР самбар, ТООЦООЛЛЫН НЭГЖЭЭР нь хуваагдана:
   *   · ЗҮҮН  — «Тээвэр-идэвхийн шинжилгээ» (`TransportPanel`): БАРИЛГА бүрээр
   *   · БАРУУН — «Бүсийн симуляц» (`Simulation`): БҮС бүрээр
   *              (төвлөрөл · хүртээмж · ачаалал гурвуулаа)
   * Аль самбарын товчийг сүүлд дарсан нь газрын зургийг буддаг (`tActive`);
   * нөгөө нь зөвхөн товчоо харуулна (байрлал шилжихгүй).
   */
  /**
   * Замын сүлжээ сонгогч — «Ачаалал» ба «Тээвэр-идэвх» хоёр самбарт НЭГ төлөв.
   */
  const netSel = {
    kind: netKind,
    setKind: setNetKind,
    options: NET_KINDS.map((k) => ({
      kind: k,
      label: NET_SOURCES[k].label,
      short: NET_SOURCES[k].short,
      ready: isNetReady(k),
      note: NET_SOURCES[k].note,
    })),
  };
  const simCommon = {
    kind: simKind,
    setKind: pickSimKind,
    muted: tActive,
    popBasis,
    setPopBasis,
    clock: {
      minute: clock.minute,
      playing: clock.playing,
      setPlaying: clock.setPlaying,
      speed: clock.speed,
      setSpeed: clock.setSpeed,
      seek: clock.seek,
    },
    road: {
      edges: roadNet?.edges.length ?? null,
      error: roadErr,
      stats: trafficLive ? trafficStats : null,
      signalsFailed: !!roadNet?.signalsFailed,
      /* Дохиотой нь дахин — кэш нь дохиогүй сүлжээг хадгалдаггүй (`netSources`) */
      onRetry: () => { setRoadErr(null); setRoadNet(null); setNetCapErr({}); },
      flat: dim !== '2d',
      /** «Шинэ зам» — машингүй, зөвхөн газрын зурагт харагдана */
      carsOff: !netCars,
      /** Харьцуулах замын сүлжээ сонгогч (Бодит/Төлөвлөгөө/Шинэ зам) */
      net: netSel,
      /** Гэрлэн дохионы зохицуулалт — ээлж барьж асаах сонгогч */
      signal: {
        plan: realPlan,
        stage: signalStage,
        setStage: setSignalStage,
      },
      demand: peakCars,
      cap: carCap,
      capPending,
      capFailed,
      signalJunctions,
    },
    rows: simRows,
  };

  return (
    <div className={s.app} ref={appRef}>
      {error && (
        <div className={s.loader}>
          <div className={s.loaderBox}>
            <div className={s.loaderTitle}>{tr('Сэлбэ дэд төв')}</div>
            <div className={s.loaderSub}>{tr('Тохиромжтой байдлын загварчлал')}</div>
            <div className={`${s.loaderMsg} ${s.loaderErr}`}>
              {tr('Алдаа гарлаа:')} {error}
            </div>
            <button type="button" className={s.loaderRetry} onClick={retryLoad}>
              {tr('Дахин оролдох')}
            </button>
          </div>
        </div>
      )}

      {data && data.failed.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '6px 12px', fontSize: 12, color: 'var(--ink-2)',
            background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
          }}
        >
          {tr('Зарим эх сурвалж татагдсангүй ({0}) — хүртээмжийн үзүүлэлт дутуу байж болно. Хуудсыг дахин нээхэд дахин оролдоно.', data.failed.join(', '))}
        </div>
      )}
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.brandMark} />
          <div>
            <h1 title={tr('Сэлбэ Хот төлөвлөлтийн үзүүлэлтүүд')}>{tr('Сэлбэ Хот төлөвлөлтийн үзүүлэлтүүд')}</h1>
          </div>
        </div>
        <nav className={s.tabs} aria-label={tr('Горим')}>
          {([
            ['urban', tr('Хот төлөвлөлт')],
            ['indicator', tr('Үзүүлэлт')],
            ['simulation', tr('Симуляц')],
          ] as const).map(
            ([k, label]) => (
              <button
                key={k}
                type="button"
                className={mode === k ? s.tabActive : undefined}
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
              >
                {label}
              </button>
            ),
          )}
        </nav>
      </header>

      <Shell
        left={
          <>
            {/* Тээвэр-идэвхийн 7 дүрслэл — ЗҮҮН талд ГАНЦААРАА. */}
            {mode === 'simulation' && (
              <TransportPanel
                mode={tMode}
                setMode={pickTMode}
                active={tActive}
                ctx={tCtx}
                loading={tActive && !tCtx}
                error={tErr ?? roadErr}
                onRetry={retryTransport}
                net={netSel}
              />
            )}

            {mode === 'indicator' && (
              <Card title={tr('Хот төлөвлөлтийн тооцоолол')}>
                <CategoryPie
                  rows={scoredRows}
                  indicators={indicators}
                  totalW={totalW}
                  filter={catFilter}
                  setFilter={setCatFilter}
                />
                <IndicatorPicker
                  rows={scoredRows}
                  indicators={indicators}
                  active={activeIndicator}
                  setActive={setActiveIndicator}
                  totalW={totalW}
                  filter={catFilter}
                />
              </Card>
            )}

            {/* Бүсийн ангилал — Angilal-аар шүүх (газрын зураг + эрэмбэ динамик) */}
            <Card id="zoneCat" title={tr('Бүсийн ангилал')} collapsible>
              <ZoneCatFilter
                cats={zoneCats}
                off={catOff}
                setOff={setCatOff}
                setScoreOn={setScoreOn}
              />
            </Card>

            {/* Барилгын ангилал — `Зориулалт_m`-ээр газрын зургийн барилгыг шүүх */}
            {bldCats.length > 0 && (
              <Card id="bldCat" title={tr('Барилгын ангилал')} collapsible>
                <BuildingCatFilter
                  cats={bldCats}
                  off={bldOff}
                  setOff={(v) => { setBldOff(v); setBldFocus((n) => n + 1); }}
                />
              </Card>
            )}

            {mode !== 'simulation' && (
            <Card
              title={mode === 'indicator' ? tr('Бүсийн эрэмбэ «{0}»', ind.short) : tr('Бүсийн эрэмбэ')}
              pill={tr('{0} бүс', rankRows.length)}
              grow
            >
              <Ranking
                rows={rankRows}
                mode={mode}
                ind={ind}
                indicators={indicators}
                selected={selectedLive}
                onSelect={setSelected}
              />
            </Card>
            )}
          </>
        }
        map={
          <>
            <SuitMap
              dim={dim}
              rows={rows}
              colorOf={colorOf}
              shown={shown}
              selected={selectedLive}
              onSelect={setSelected}
              layerOn={layerOn}
              opacity={opacity}
              zoneTip={zoneTip}
              buildingTip={buildingTip}
              transportTip={transportMode ? transportTip : undefined}
              traffic={!shotView && roadMode && netCars && roadNet ? {
                net: roadNet,
                minuteRef: clock.minuteRef,
                playing: clock.playing,
                speed: clock.speed,
                maxCars: carCap,
                signalPlan,
                onStats: setTrafficStats,
              } : undefined}
              transportPaint={shotView ? null : transportPaint}
              transportFaint={mapStyle === 'heat'}
              heat={shotView ? null : heat}
              roadTile={bareReal}
              bldWhere={bldWhere}
              bldFocus={bldFocus}
              bldPick={mode === 'urban' || mode === 'indicator' ? locPick : null}
              onBldClick={mode === 'urban' || mode === 'indicator' ? setLocPick : undefined}
              zoneFaint={locPublicOnly}
            />

            {/* Каталог — «Ерөнхий төлөвлөгөө»-тэй ижил ЗҮҮН талын БҮТЭН ӨНДӨР
                багана (голд хөвөхгүй). */}
            {layerCatOpen && (
              <div className={s.catPanel}>
                <SuitLayerCatalog
                  layerOn={layerOn}
                  setLayerOn={setLayerOn}
                  onClose={() => setLayerCatOpen(false)}
                />
              </div>
            )}

            {opOpen && (
              <OpacityPanel
                visible={Object.keys(layerOn).filter((k) => layerOn[k])}
                opacity={opacity}
                setOpacity={setOpacity}
                onClose={() => setOpOpen(false)}
              />
            )}

            {/* «Давхарга» товч + 2D/3D/BIM — НЭГ мөрөнд, зүүн доод буланд
                (Давхарга нь дим товчны ӨМНӨ, «Ерөнхий төлөвлөгөө»-тэй ижил). */}
            <MapTools
              dim={dim}
              setDim={setDim}
              layersOpen={layerCatOpen}
              onLayers={() => setLayerCatOpen((v) => !v)}
              opacityOpen={opOpen}
              onOpacity={() => setOpOpen((v) => !v)}
            >
              {/* Полигон ↔ дулаан — ЗӨВХӨН «Симуляц» горимд. */}
              {mode === 'simulation' && (
                <div className={s.mapDims} role="group" aria-label={tr('Симуляцын дүрслэл')}>
                  {MAP_STYLES.map((v) => {
                    const off = v.key === 'heat' && !heatable;
                    return (
                      <button
                        key={v.key}
                        type="button"
                        disabled={off}
                        aria-pressed={!off && mapStyle === v.key}
                        title={off ? tr('Энэ дүрслэлд дулааны гадаргуу утгагүй (зай/агент симуляц)') : v.title}
                        className={`${s.dimBtn} ${!off && mapStyle === v.key ? s.dimOn : ''}`}
                        style={off ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        onClick={() => setMapStyle(v.key)}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </MapTools>

            {active && (
              <SuitDetail
                r={active}
                indicators={indicators}
                mode={mode}
                activeIndicator={activeIndicator}
                parking={parking}
                onClose={() => setSelected(null)}
              />
            )}
          </>
        }
        right={
          // «Симуляц» горим: БҮСЭЭР тооцогддог гурван симуляц ЭНД БАРУУНД.
          // Бусад горимд ердийн картууд (жин, зогсоол г.м.).
          mode === 'simulation' ? (
            <Simulation {...simCommon} kinds={['road', 'density', 'transit']} title={tr('Бүсийн симуляц')} />
          ) : (
          <>
            {(mode === 'urban' || mode === 'indicator') && (
              <Card
                id="weights"
                title={tr('Хот төлөвлөлтийн жин')}
                collapsible
                action={
                  <button
                    type="button"
                    className={s.mini}
                    title={tr('Бүх үзүүлэлтийн жинг анхны (default) утга руу нэг дор буцаана')}
                    onClick={(e) => { e.stopPropagation(); setIndicators(INDICATORS.map((i) => ({ ...i }))); }}
                  >
                    <Icon name="reset" size={11} />
                    {tr('Анхны утга')}
                  </button>
                }
              >
                <p className={`${s.muted} ${s.small}`}>
                  {tr('Үзүүлэлт бүр')} <b>{tr('норм хангавал 100 оноо')}</b>{tr(', зөрчвөл 44-өөс дээшгүй оноо авна. Жин нь нийлбэрээрээ 100% болж автоматаар нормчилогдоно. Босго утгыг БНБД 30-01-24-өөс авсан бөгөөд доорх талбарт засварлаж болно.')}
                </p>
                <Weights indicators={indicators} setIndicators={setIndicators} totalW={totalW} />
              </Card>
            )}

            {(mode === 'urban' || mode === 'indicator') && (
              <Card
                id="parking"
                title={tr('Зогсоолын хэрэгцээ')}
                collapsible
                action={
                  <button
                    type="button"
                    className={s.mini}
                    title={tr('Тооцох арга ба коэффициентийг анхны (default) утга руу буцаана')}
                    onClick={(e) => { e.stopPropagation(); setParking({ ...PARKING }); }}
                  >
                    <Icon name="reset" size={11} />
                    {tr('Анхны утга')}
                  </button>
                }
              >
                <Parking rows={scoredRows} parking={parking} setParking={setParking} />
              </Card>
            )}

            {/* Ногоон байгууламж — «Зогсоолын хэрэгцээ»-ний ижил зарчим. */}
            {(mode === 'urban' || mode === 'indicator') && (
              <Card
                id="green"
                title={tr('Ногоон байгууламж')}
                collapsible
                action={
                  <button
                    type="button"
                    className={s.mini}
                    title={tr('Тооцох арга ба коэффициентийг анхны (default) утга руу буцаана')}
                    onClick={(e) => { e.stopPropagation(); applyGreen({ ...GREEN }); }}
                  >
                    <Icon name="reset" size={11} />
                    {tr('Анхны утга')}
                  </button>
                }
              >
                <div onPointerDown={showGreenLayer}>
                  <Green
                    rows={rows}
                    green={greenView}
                    setGreen={(g) => { showGreenLayer(); applyGreen(g); }}
                  />
                </div>
              </Card>
            )}

            {(mode === 'urban' || mode === 'indicator') && (
              <Card id="location" title={tr('Байршил')} collapsible>
                <Location
                  pts={locPts}
                  sel={locPick}
                  onSel={setLocPick}
                  radius={locRadius}
                  setRadius={setLocRadius}
                  publicOnly={locPublicOnly}
                  setPublicOnly={setLocPublicOnly}
                />
              </Card>
            )}
          </>
          )
        }
      />
    </div>
  );
}

/* ══════════════════ Бүсийн ангиллын шүүлт ══════════════════ */

/**
 * `Angilal` (каноник `type`)-аар бүс шүүх. Унтраасан ангиллын бүс газрын
 * зургаас БҮРЭН алга болж (барилга нь ч хамт), эрэмбээс хасагдана.
 */
function ZoneCatFilter({ cats, off, setOff, setScoreOn }: {
  cats: { type: string; count: number; color: string }[];
  off: Set<string>;
  setOff: (s: Set<string>) => void;
  setScoreOn: (s: Set<string>) => void;
}) {
  const allTypes = cats.map((c) => c.type);
  /** Одоо ХАРАГДАЖ байгаа ангиллууд */
  const visible = allTypes.filter((t) => !off.has(t));
  /** ӨГӨГДМӨЛ — БҮХ ангилал харагдана (шүүлт тавиагүй байдал) */
  const filtered = visible.length !== allTypes.length;

  const apply = (hidden: string[]) => {
    setOff(new Set(hidden));
    setScoreOn(new Set(allTypes.filter((t) => ACTIVATABLE_ZONE_TYPES.has(t) && !hidden.includes(t))));
  };
  const pick = (type: string) => {
    if (!filtered) { apply(allTypes.filter((t) => t !== type)); return; }
    const on = visible.includes(type);
    if (on && visible.length === 1) { apply([]); return; }
    apply(on
      ? [...allTypes.filter((t) => off.has(t)), type]
      : allTypes.filter((t) => off.has(t) && t !== type));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span className={`${s.muted} ${s.xsmall}`}>
          {filtered ? tr('{0} / {1} ангилал', visible.length, cats.length) : tr('{0} ангилал', cats.length)}
        </span>
        {filtered && (
          <button type="button" className={s.mini} onClick={() => apply([])}>
            {tr('Шүүлт цэвэрлэх')}
          </button>
        )}
      </div>
      {cats.map((c) => {
        const activatable = ACTIVATABLE_ZONE_TYPES.has(c.type);
        const on = !off.has(c.type);
        const name = zoneTypeLabel(c.type);
        return (
          <button
            key={c.type}
            type="button"
            aria-pressed={on}
            title={!filtered
              ? tr('Дарвал зөвхөн «{0}» үлдэнэ{1}', name, activatable ? tr(' (оноололд ч орно)') : '')
              : on && visible.length === 1 ? tr('Дарвал шүүлт цэвэрлэгдэнэ')
                : on ? tr('Дарвал «{0}»-ийг шүүлтээс хасна', name)
                  : tr('Дарвал «{0}»-ийг шүүлтэд нэмнэ', name)}
            onClick={() => pick(c.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 8px', borderRadius: 2,
              border: `1px solid ${activatable && on ? 'var(--accent)' : 'var(--line)'}`,
              background: on ? 'var(--panel-2)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)', textAlign: 'left',
              transition: 'background .12s, opacity .12s, border-color .12s',
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 2, flex: 'none', background: c.color, opacity: on ? 1 : 0.35 }} />
            {/* 2 мөрийн clamp — «Нийгмийн дэд бүтцийн бүс» г.м. урт нэр «…» болохгүй */}
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{name}</span>
            {activatable && (
              <span style={{
                fontSize: 9, letterSpacing: '.3px', flex: 'none',
                color: on ? 'var(--accent)' : 'var(--muted)',
                border: '1px solid var(--line)', borderRadius: 2, padding: '0 4px',
              }}>
                {tr('оноол')}
              </span>
            )}
            <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted)' }}>{c.count}</b>
            <span style={{ width: 14, textAlign: 'center', color: 'var(--accent)', fontSize: 12 }}>
              {on ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * БАРИЛГЫН АНГИЛАЛ — `Зориулалт_m` талбарын бүлгүүд («Бүсийн ангилал»-ын ижил зан).
 */
function BuildingCatFilter({ cats, off, setOff }: {
  cats: BuildingPurposeStat[];
  off: Set<string>;
  setOff: (s: Set<string>) => void;
}) {
  const allKeys = cats.map((c) => c.key);
  const visible = allKeys.filter((k) => !off.has(k));
  const filtered = visible.length !== allKeys.length;
  const total = cats.reduce((a, c) => a + c.count, 0);
  const shownN = cats.reduce((a, c) => a + (off.has(c.key) ? 0 : c.count), 0);

  const pick = (key: string) => {
    if (!filtered) { setOff(new Set(allKeys.filter((k) => k !== key))); return; }
    const on = visible.includes(key);
    if (on && visible.length === 1) { setOff(new Set()); return; }
    setOff(new Set(on
      ? [...allKeys.filter((k) => off.has(k)), key]
      : allKeys.filter((k) => off.has(k) && k !== key)));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span className={`${s.muted} ${s.xsmall}`}>
          {cats.length} {tr('ангилал ·')} {nf(shownN)}/{nf(total)} {tr('барилга')}
        </span>
        {filtered && (
          <button type="button" className={s.mini} onClick={() => setOff(new Set())}>
            {tr('Шүүлт цэвэрлэх')}
          </button>
        )}
      </div>
      {cats.map((c) => {
        const on = !off.has(c.key);
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            // Бүлэгт ЯМАР зориулалтууд багтсаныг нээлгүйгээр харах
            title={tr('{0}\n', !filtered ? tr('Дарвал зөвхөн «{0}» үлдэнэ', c.label)
              : on && visible.length === 1 ? tr('Дарвал шүүлт цэвэрлэгдэнэ')
                : on ? tr('Дарвал «{0}»-ийг шүүлтээс хасна', c.label)
                  : tr('Дарвал «{0}»-ийг шүүлтэд нэмнэ', c.label))
              + tr('{0} барилга · {1} м²{2}', nf(c.count), nf(c.gfaM2), c.values.length ? `\n${[...new Set(c.values.map((v) => v.trim()).filter(Boolean))].join(' · ')}` : '')}
            onClick={() => pick(c.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 8px', borderRadius: 2,
              border: '1px solid var(--line)',
              background: on ? 'var(--panel-2)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)', textAlign: 'left',
              transition: 'background .12s, opacity .12s, border-color .12s',
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 2, flex: 'none', background: c.color, opacity: on ? 1 : 0.35 }} />
            {/* 2 мөрийн clamp — урт ангиллын нэр «…» болохгүй (ZoneCatFilter-тэй ижил) */}
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{c.label}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted)' }}>{c.count}</b>
            <span style={{ width: 14, textAlign: 'center', color: 'var(--accent)', fontSize: 12 }}>
              {on ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

