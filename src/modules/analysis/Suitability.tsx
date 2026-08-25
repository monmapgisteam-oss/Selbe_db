'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import * as projection from '@arcgis/core/geometry/projection';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type Polygon from '@arcgis/core/geometry/Polygon';

import {
  INDICATORS, PARKING, MAP_LAYERS,
  ACTIVATABLE_ZONE_TYPES, NO_DATA_COLOR, BF, BUILDING_PURPOSE_OTHER,
  GREEN, GREEN_LAYER_KEY, LOCATION_RADII, LOCATION_ZONE_TYPES, LOCATION_EXCLUDE_OIDS,
  type Indicator, type ParkingOpt, type CategoryKey, type GreenOpt,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeRaw, defaultGreenCats,
  type AnalysisData, type BuildingPurposeStat,
} from '@/lib/analysis/data';
import { ZONE_TYPES, ZONE_TYPE_EMPTY_HUE, ZONE_FIELD, zoneRefValues } from '@/lib/services';
import {
  urbanScore, scoreColor, scoreLabel, passesNorm,
} from '@/lib/analysis/score';
import type { Dim } from '@/components/MapCanvas';
import { SuitMap, type MapRow } from './SuitMap';
import { SuitDetail } from './SuitDetail';
import { nf, esc } from './suit/format';
import { valueOf, type Mode, type Row } from './suit/model';
import { Shell, Card } from './suit/Layout';
import { Simulation } from './suit/SimulationPanel';
import { useSimClock } from './suit/Timeline';
import {
  simMetric, simRange, simNorm, simColor, simDef, peakVehicles,
  type SimKind, type PopBasis,
} from './suit/simulation';
import { assignLoads } from './suit/roadNet';
import { SIGNAL_PLANS, type Network } from './suit/traffic';
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
import { MapTools } from '@/components/MapTools';
import { OpacityPanel } from '@/components/OpacityPanel';
import { CategoryPie, IndicatorPicker, Weights, Parking, Green, Location } from './suit/Urban';
import { Ranking } from './suit/Ranking';
import s from './suitability.module.css';

/** «Ачаалал» симуляцад автоматаар асах давхарга — «Зам (талбай)» */
const ROAD_AREA_LAYER = 'et:29';

/** Барилгын давхарга — «Бодит» симуляцад нуухад (одоо байгаа нөхцлийн зам л харагдана) */
const BUILDING_LAYER = 'et:24';

/** «Улаан бүсийн барилга» горимын бүсийн жигд саарал */
const LOC_ZONE_GRAY = '#64748b';

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Suitability({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /* ── Ачаалалт ── */
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projected, setProjected] = useState(false);
  const geomRef = useRef(new Map<string, Polygon | null>());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await loadAnalysisCached();
        if (!alive) return;

        // Дүрслэлийн геометрийг Web Mercator рүү (тооцоо нь UTM дээр хэвээр)
        await projection.load();
        const wm = SpatialReference.WebMercator;
        for (const z of d.zones) {
          geomRef.current.set(z.id, z.geometry ? (projection.project(z.geometry, wm) as Polygon) : null);
        }
        if (!alive) return;
        setData(d);
        setProjected(true);

      } catch (e: unknown) {
        console.error('[selbe] анализ:', e);
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ── Загварын төлөв ── */
  // ⚠️ Нээгдэх горим = ХОТ ТӨЛӨВЛӨЛТ: «Ерөнхий» (blend) таб хасагдсан тул
  //    түүнээр нээвэл ямар ч табгүй хуудас гарна.
  const [mode, setMode] = useState<Mode>('urban');
  const [indicators, setIndicators] = useState<Indicator[]>(() => INDICATORS.map((i) => ({ ...i })));
  const [activeIndicator, setActiveIndicator] = useState(INDICATORS[0].id);
  const [catFilter, setCatFilter] = useState<CategoryKey | null>(null);
  /**
   * Идэвхтэй симуляцын дэд төрөл — «Симуляц» табд ашиглана.
   * ⚠️ Анхдагч нь «Ачаалал» — сонгогчийн ЭХНИЙ товчтой нийцнэ (эс бөгөөс нээхэд
   * эхний товч ба идэвхтэй таб зөрж, хэрэглэгч андуурна).
   */
  const [simKind, setSimKind] = useState<SimKind>('road');
  /** Хүн амын төрөл — «Хүн амын төвлөрөл» симуляцад (оршин суугч ↔ хүчин чадал) */
  const [popBasis, setPopBasis] = useState<PopBasis>('resident');
  /**
   * Тээвэр-идэвхийн дүрслэл ба тэр самбар ИДЭВХТЭЙ эсэх.
   * ⚠️ `simKind`-тэй ХАМТ оршино: аль самбар сүүлд дарагдсан нь газрын зургийг
   * буддаг. Тээвэр идэвхтэй үед бүсийн будалт саарал болж, барилга/зам тодрно.
   */
  const [tMode, setTMode] = useState<TMode>('trips');
  const [tActive, setTActive] = useState(false);
  /**
   * Симуляцын газрын зургийн ХЭВ МАЯГ — полигон (хил хэвээр) ↔ дулааны гадаргуу.
   * ⚠️ Зөвхөн «Симуляц» горимд үйлчилнэ; оноололын будалтыг хөндөхгүй.
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
   *
   * ⚠️ АНХНААСАА ОРУУЛСАН (хэрэглэгчийн шийдвэр, 2026-08-12): урьд нь хоосон
   * байсан тул тэдгээр 17 бүс саараар харагдаж, эрэмбэ ба дунджид ордоггүй
   * байв. «Бүсийн ангилал» картаас хасч болно (мөр дээр нь дарж шүүнэ).
   */
  const [scoreOn, setScoreOn] = useState<Set<string>>(() => new Set(ACTIVATABLE_ZONE_TYPES));
  /**
   * БАРИЛГЫН зориулалтын шүүлт — унтраасан бүлгүүд (`BUILDING_PURPOSES[].key`).
   * Хоосон = бүх барилга харагдана. ⚠️ Зөвхөн ГАЗРЫН ЗУРГИЙН харагдацад
   * үйлчилнэ: бүсийн оноо барилгуудаас нэгтгэгддэг тул энд шүүвэл дүн өөрчлөгдөж,
   * «би зөвхөн нуусан» гэж бодсон хэрэглэгч өөр оноо хараад төөрнө.
   */
  const [bldOff, setBldOff] = useState<Set<string>>(() => new Set());
  /**
   * ШҮҮСЭН БАРИЛГА руу газрын зургийг төвлөрүүлэх ТООЛУУР.
   * ⚠️ `bldWhere`-ээр шууд сэрээж болохгүй: тэр нь бүсийн ангиллын шүүлтээс ч
   *    хамаарч дахин бодогддог тул хэрэглэгч бүс шүүхэд зураг гэнэт үсэрнэ.
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
   * ⚠️ Карт нь ХУРААГДСАНААР эхэлнэ: анализын гол мессеж нь бүсийн ОНООНЫ
   * БУДАЛТ бөгөөд 27 давхаргын чагт задгай байвал зүүн талбарыг эзэлнэ.
   */
  const [layerOn, setLayerOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MAP_LAYERS.map((l) => [l.key, l.on])),
  );
  /**
   * Давхаргын каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх «Давхарга»
   * товчтой ижил зарчим. Хаалттай эхэлж, товч дарахад газрын зурагт хөвж гарна.
   */
  const [layerCatOpen, setLayerCatOpen] = useState(false);
  /**
   * ⚠️ 2026-08-20: «Тунгалаг» ЭНЭ ЦОНХОНД НЭМЭГДЭВ. Бусад бүх харагдацад
   * байсан атал энд байхгүй байв — учир нь `SuitMap` нь `MapCanvas` БИШ, өөрийн
   * давхаргын моделтой бөгөөд opacity-г огт дэмждэггүй байлаа (одоо дэмжинэ).
   *
   * ⚠️ «Бүс» товч энд ЗОРИУДААР БАЙХГҮЙ (хэрэглэгчийн шийдвэр): энэ цонхны
   * гол дүрслэл нь БҮС бүрийн оноо — бүсийг зурагнаас шүүх нь өөрийнх нь
   * үндсэн уншилтыг устгана. Бүсээ энд «Бүсийн ангилал»/«Бүсийн эрэмбэ»
   * картуудаар шүүнэ.
   */
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});

  /* ── Тооцоо ── */
  const rows = useMemo<Row[]>(() => {
    if (!data || !projected) return [];
    computeRaw(data.zones, greenCats, parking, scoreOn);
    return data.zones.map((z) => {
      const u = urbanScore(z.raw, indicators, z.type);
      return { ...z, urban: u.score, parts: u.parts, displayGeom: geomRef.current.get(z.id) ?? null };
    });
  }, [data, projected, greenCats, parking, indicators, scoreOn]);

  /**
   * Олон нийтийн бүсийн кодууд — чагт асаалттай үед зураг ба картыг хумина.
   * ⚠️ Ангиллаар гаргана, гараар жагсаахгүй: бүс нэмэгдэхэд аяндаа дагана.
   */
  const publicZoneIds = useMemo(
    () => rows.filter((r) => LOCATION_ZONE_TYPES.includes(r.type)).map((r) => r.id),
    [rows],
  );

  /**
   * «Байршил» картын шинжилгээнд орох барилгууд.
   * ⚠️ Чагт асаалттай үед ЗУРГИЙН шүүлттэй ИЖИЛ олонлог байх ёстой — эс бөгөөс
   * зурагт үл харагдах барилга жагсаалтад гарч, дарахад олдохгүй.
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
   * ⚠️ Газрын зурагт (`rows`) бүх бүс хэвээр (хассан нь саарал), харин эрэмбэ,
   * диаграм, дундаж, эдийн засаг зэрэг ТООЦОО зөвхөн `scoredRows`-оор явна.
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
   *
   * ⚠️ Хоёр тусдаа төлөв БАЙЛГАХГҮЙ: картад 10 м², «Жин» картад 6 м² гэж
   * зөрвөл аль нь оноог тодорхойлж байгаа нь ойлгомжгүй болно. Тиймээс ганц эх
   * сурвалж нь `indicators`-ийн `green.target` бөгөөд гулсуур түүнийг шууд
   * засна — зогсоолын гулсуур оноог өөрчилдөгтэй ижил зан.
   *
   * ⚠️ ЗӨВХӨН «6 м²/хүн» аргад үйлчилнэ: тэр нь үзүүлэлттэй ижил нэгжтэй
   * (м²/хүн). «Талбайн %» арга нь оноололд ордоггүй тул газрын зургийг
   * хөндөхгүй.
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
   * ⚠️ Аль хэдийн асаалттай бол төлөвийг ХӨНДӨХГҮЙ — эс бөгөөс хэрэглэгч
   * гараар унтраасан ч карт руу дарах бүрд эргэж асч, тэмцэлдэнэ.
   */
  const showGreenLayer = useCallback(() => {
    setLayerOn((v) => (v[GREEN_LAYER_KEY] ? v : { ...v, [GREEN_LAYER_KEY]: true }));
  }, []);

  /** Барилгын зориулалтын бүлгүүд — ачаалалтад нэгтгэгдсэн. */
  const bldCats = useMemo<BuildingPurposeStat[]>(() => data?.buildingCats ?? [], [data]);

  /**
   * Барилгын давхаргын SQL шүүлт — унтраасан бүлгийн зориулалтуудыг хасна.
   *
   * ⚠️ Бүлгийн ХЭВ ШИНЖИЙГ (regex) БИШ, бодитоор байсан ТҮҮХИЙ утгуудыг
   * жагсаана: ArcGIS-д кирилл regex байхгүй. Шинэ зориулалт нэмэгдвэл жагсаалтад
   * ороогүй тул ХАРАГДАНА — өгөгдөл чимээгүй алга болохоос энэ нь дээр.
   *
   * ⚠️ SQL-д `NULL NOT IN (…)` нь ҮНЭН биш тул зориулалтгүй бичлэг ямар ч
   * шүүлтэд алга болно. Тиймээс «Бусад» бүлэг ил үед `IS NULL`-ыг тусад нь
   * зөвшөөрнө (зориулалтгүй бичлэг тэр бүлэгт тоологддог).
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
        const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',');
        const not = `${BF.purpose} NOT IN (${list})`;
        parts.push(otherOn ? `(${BF.purpose} IS NULL OR ${not})` : not);
      }
    }

    /* ── БҮСИЙН АНГИЛЛЫН шүүлт ──
       ⚠️ Унтраасан ангиллын бүс газрын зургаас бүрэн алга болдог тул тэдгээрийн
          дотор ЗОГСОХ барилга ч алга болох ёстой (ArcGIS-ийн filter-ийн зан).
       ⚠️ Бүсийн код бичиглэлээр зөрдөг («B-2» ↔ «B-2.1», «D-8» ↔ «D-8.1/8.2»)
          тул түүхий id-г шууд БИШ, `zoneRefValues`-ээр бүх хувилбарт тэлж өгнө. */
    if (catOff.size && rows.length) {
      const keep = rows.filter((r) => !catOff.has(r.type)).map((r) => r.id);
      if (!keep.length) return '1=0';
      const vals = [...new Set(keep.flatMap((id) => zoneRefValues(id)))];
      parts.push(`${ZONE_FIELD} IN (${vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`);
    }

    /**
     * «Байршил» картын чагт — улаан бүсийн барилга.
     * ⚠️ Гараар хассан барилгыг (`LOCATION_EXCLUDE_OIDS`) ЭНД ч хасна: карт ба
     *    зураг НЭГ олонлогтой байх ёстой, эс бөгөөс жагсаалтад байхгүй барилга
     *    зурагт үлдэж, дарахад карт хоосон хариу өгнө.
     */
    if (locPublicOnly) {
      if (!publicZoneIds.length) return '1=0';
      const vals = [...new Set(publicZoneIds.flatMap((id) => zoneRefValues(id)))];
      parts.push(`${ZONE_FIELD} IN (${vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`);
      if (LOCATION_EXCLUDE_OIDS.size) {
        parts.push(`OBJECTID NOT IN (${[...LOCATION_EXCLUDE_OIDS].join(',')})`);
      }
    }

    return parts.length ? parts.join(' AND ') : null;
  }, [bldCats, bldOff, catOff, rows, locPublicOnly, publicZoneIds]);

  /** Эрэмбэд орох бүс — оноолсон бүсээс ангиллын шүүлтээр (динамик). */
  const rankRows = useMemo(() => scoredRows.filter((r) => !catOff.has(r.type)), [scoredRows, catOff]);

  const ind = indicators.find((i) => i.id === activeIndicator) ?? indicators[0];
  const totalW = indicators.reduce((a, i) => a + i.weight, 0) || 1;

  /* ⚠️ 2026-08-24: `basePrice` (барилгын давамгайлах нэгж үнэ) УСТГАВ —
     эдийн засгийн гулсуур ба зохиомол `negj_une` загвартай хамт хасагдсан. */

  /** Симуляцын хэмжүүрийн хязгаар — нормчилол ба легендэд (харагдах бүсээр). */
  const simRng = useMemo(() => simRange(rows, simKind, popBasis), [rows, simKind, popBasis]);

  /**
   * Бүсийн симуляцын хэмжүүрийн ДУНДАЖ — hover панелийн «дунджаас» мөрд.
   * ⚠️ Эрэмбэлэх шаардлагагүй (эрэмбийн мөр хасагдсан) тул зөвхөн дундаж.
   */
  const simAvg = useMemo(() => {
    if (mode !== 'simulation') return 0;
    const vals = rows
      .map((r) => simMetric(r, simKind, popBasis).value)
      .filter((v): v is number => v != null && v > 0);
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
  }, [rows, simKind, popBasis, mode]);

  /* ── Замын ачаалал: сүлжээг ХЭРЭГТЭЙ болоход нь ачаална ── */
  const roadMode = mode === 'simulation' && !tActive && simKind === 'road';
  /** Тээвэр-идэвхийн самбар газрын зургийг буддаг эсэх */
  const transportMode = mode === 'simulation' && tActive;
  /**
   * Харьцуулах ЗАМЫН СҮЛЖЭЭ — Бодит / Төлөвлөгөө / Шинэ зам (`netSources.ts`).
   * ⚠️ Доорх `netCars`/`netLoad` үүнээс хамаардаг тул ЭНД зарлагдана.
   */
  const [netKind, setNetKind] = useState<NetKind>('plan');
  /** ⚠️ Замын сүлжээг ХОЁУЛАА хэрэглэнэ — агентын симуляц ба эрэлтийн хуваарилалт */
  /**
   * Идэвхтэй сүлжээн дээр МАШИН явах уу («Шинэ зам» — зөвхөн харагдана).
   * ⚠️ Явахгүй бол замын сүлжээ УГСАРЧ ч болохгүй: тэр line нь холбогдоогүй
   * хэсгүүд тул машин мухарт гацна.
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
   * ⚠️ Heatmap цөмүүдийг НЭМДЭГ тул зөвхөн хуримтлагдах хэмжигдэхүүнд утгатай —
   * зай (хүртээмж, автобус) ба машин агентын симуляц (ачаалал) хамаарахгүй.
   */
  const heatable = transportMode ? tModeDef(tMode).heatable : simDef(simKind).heatable;
  const heatOn = mode === 'simulation' && mapStyle === 'heat' && heatable;
  /**
   * ⚠️ Барилгын өгөгдөл нь тээврийн самбарт ЗӨВХӨН хэрэгтэй биш: «Төвлөрөл»-ийн
   * дулааны гадаргуу ч барилгын центроидоос гардаг тул тэнд ч татна.
   */
  const needBuildings = tActive || heatOn;
  /** Оргил цагт сүлжээнд зэрэг явах машин — бүсийн хүн амаас (гараар өгөөгүй) */
  const peakCars = useMemo(() => peakVehicles(scoredRows), [scoredRows]);
  const [roadNet, setRoadNet] = useState<Network | null>(null);
  const [roadErr, setRoadErr] = useState<string | null>(null);
  const [trafficStats, setTrafficStats] = useState<TrafficStats | null>(null);
  /**
   * ГЭРЛЭН ДОХИОНЫ зохицуулалтын хөтөлбөр (2 / 4 / 8 ээлж).
   * ⚠️ Сүлжээнд хадгалагдахгүй — солиход дахин татах/угсрах шаардлагагүй,
   * дараагийн фреймээс шууд үйлчилнэ.
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
   * ⚠️ Авто хөтөлбөр нь ачаалагдсан сүлжээнээс хамаарна (дохио байхгүй бол алга).
   */
  /** Бодит уулзварын хуваарь — UI-д ганц хөтөлбөр (3 ээлж: 3·4·7·8 → 1·6 → 2·5) */
  const realPlan = useMemo(
    () => SIGNAL_PLANS.find((x) => x.key === 'real') ?? SIGNAL_PLANS[0],
    [],
  );
  /**
   * Хөдөлгүүр/зуралтад өгөх ИДЭВХТЭЙ хөтөлбөр.
   * ⚠️ Ээлж баригдсан үед НЭГ ээлжтэй, шаргүй синтетик хөтөлбөр өгнө — signalPhase
   * тэр ээлжийн кодуудыг БАЙНГА ногоон, бусдыг улаан гэж тооцно (шинэ логик
   * хэрэггүй, мөчлөгийн математик өөрөө ингэж ажиллана).
   */
  const signalPlan = useMemo(() => {
    if (signalStage == null || !realPlan.stages[signalStage]) return realPlan;
    // ⚠️ Уулзвар БҮРИЙН тухайн ээлжийг барина — эс бөгөөс ээлж барихад зөвхөн
    //    фоллбэк хуваарь үлдэж, 2-р уулзвар буруу чиглэлээ асаана.
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
  useEffect(() => { setRoadNet(null); setRoadErr(null); }, [netLoad]);

  useEffect(() => {
    // ⚠️ 3.9 мянган хэрчмийг ХЭРЭГТЭЙ болоход л татна («Ачаалал» эсвэл
    //    тээвэр-идэвх) — бусад горимд хэрэггүй траффик үүсгэхгүй.
    //    `loadNetworkCached` нь сүлжээ бүрийг НЭГ УДАА кэшлэнэ.
    if (!needNet || roadNet || !rows.length) return;
    let alive = true;
    // ⚠️ Гэрлэн дохио (дүрмийн + OSM) `loadNetworkCached` дотор аль хэдийн
    //    тавигдсан ирнэ; энд зөвхөн бүсийн эрэлтийн жинг (`baseLoad`) ононо.
    loadNetworkCached(netLoad)
      .then((net) => {
        if (!alive) return;
        assignLoads(net, rows);
        setRoadNet(net);
      })
      .catch((e: unknown) => {
        console.error('[selbe] замын сүлжээ:', e);
        if (alive) setRoadErr(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [needNet, roadNet, rows, netLoad]);

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
        if (alive) setTErr(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [needBuildings, tData, tErr]);

  /**
   * Тээврийн БҮХ тооцоо — барилга, зам, автобус гурав нэг дор.
   * ⚠️ Замд хуваарилалт нь 363 барилга × ~4 мянган ирмэг тул memo ЗААВАЛ:
   * дүрслэл сэлгэх бүрд дахин бодвол интерфейс мэдэгдэхүйц гацна.
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

  /**
   * ⚠️ Дулаан горимд Ч будалтыг тооцно — зөвхөн БҮДЭГ болгоно (`transportFaint`).
   * Шалтгаан: hover панель нь ЭНЭ дүрсүүд дээр л ажилладаг тул тэднийг огт
   * зурахгүй бол дулааны гадаргуу дээр юу ч дарж уншиж чадахгүй болно.
   */
  const transportPaint = useMemo(
    () => (transportMode && tCtx ? tPaint(tMode, tCtx) : null),
    [transportMode, tCtx, tMode],
  );

  /** Дулааны гадаргууны цэгүүд — «Симуляц» горимд, дүрслэл нь дулаанд тохирвол. */
  const heat = useMemo(() => {
    if (!heatOn) return null;
    if (transportMode) return tCtx ? transportHeat(tCtx, tMode) : null;
    // ⚠️ Төвлөрлийн дулаан нь БАРИЛГЫН центроидоос гарна (бүсийн центроидоос БИШ),
    //    жин нь АБСОЛЮТ хүний тоо. Бүсийн ангиллын шүүлт `zoneIds`-ээр дамжина.
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
   *
   * ⚠️ ЗӨВХӨН «Төлөвлөгөө» сүлжээнд: `et:29` бол ТӨЛӨВЛӨГӨӨТ замын талбай тул
   * «Бодит» (OSM) сүлжээн дээр асаавал бодит машинтай зөрнө. Бодит зам дээр
   * хэрэглэгчийн vector tile суурь + OSM өөрөө контекст болно.
   * ⚠️ Табаас гарахад ЗӨВХӨН өөрсдөө асаасан бол унтраана — хэрэглэгч каталогоос
   * гараар асаасан байсныг таслах эрхгүй.
   */
  const layerOnRef = useRef(layerOn);
  layerOnRef.current = layerOn;
  useEffect(() => {
    if (!roadMode || netKind !== 'plan' || layerOnRef.current[ROAD_AREA_LAYER]) return;
    setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: true }));
    return () => setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: false }));
  }, [roadMode, netKind]);

  /**
   * «Шинэ зам» сонгоход түүний line давхаргуудыг АВТОМАТААР асаана.
   * ⚠️ Тэр сүлжээнд машин явахгүй тул line нь харагдахгүй бол сонголт нь
   * газрын зураг дээр ЮУ Ч ӨӨРЧЛӨХГҮЙ — хэрэглэгчид эвдэрсэн мэт харагдана.
   * ⚠️ Сонголтоос гарахад ЗӨВХӨН өөрсдөө асаасныг унтраана (каталогоос гараар
   * асаасныг таслах эрхгүй) — «Зам (талбай)»-тай ижил зарчим.
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
    setLayerOn((v) => ({ ...v, [BUILDING_LAYER]: false }));
    return () => setLayerOn((v) => ({ ...v, [BUILDING_LAYER]: true }));
  }, [roadMode, netKind]);

  const colorOf = useCallback(
    (r: MapRow) => {
      // ⚠️ Тээвэр-идэвх идэвхтэй үед БҮС бүгд «өгөгдөлгүй» өнгөтэй болно —
      //    газрын зургийн мессеж нь барилга/зам тул бүсийн дулаан будалт
      //    түүнийг зөвхөн бүрхэнэ (`SuitMap` үүнийг цайвар дэвсгэр болгож зурна).
      if (transportMode) return NO_DATA_COLOR;
      /* ⚠️ «Улаан бүсийн барилга» чагт асаалттай үед бүсийг ОНООГООР будахгүй,
         жигд саараар: тэр үед газрын зургийн мессеж нь БАРИЛГЫН байршил бөгөөд
         ногоон-улаан будалт нүдийг татаж, барилга ялгарахгүй болно. */
      if (locPublicOnly) return LOC_ZONE_GRAY;
      return mode === 'simulation'
        ? simColor(simDef(simKind).ready ? simNorm(simMetric(r, simKind, popBasis).value, simRng) : null)
        : scoreColor(valueOf(r as Row, mode, ind));
    },
    [mode, ind, simKind, popBasis, simRng, transportMode, locPublicOnly],
  );
  /**
   * «БОДИТ» замын симуляц — ОДОО БАЙГАА нөхцлийг харуулах тул төлөвлөлтийн
   * давхаргууд (бүсийн полигон, барилга) газрын зургаас нуугдана: зөвхөн бодит
   * зам + трафик + хэрэглэгчийн vector tile суурь үлдэнэ.
   */
  const bareReal = roadMode && netKind === 'real';
  /** Бүс газрын зурагт харагдах эсэх — ангиллын шүүлтээр (унтраасан нь бүдгэрнэ) */
  const shown = useCallback(
    // ⚠️ Чагт асаалттай бол ЗӨВХӨН тэр ангиллын бүс үлдэнэ — барилгын шүүлттэй
    //    ижил олонлог байх ёстой (эс бөгөөс хоосон бүс зурагт эзэлхүүн эзэлнэ).
    (r: MapRow) => !bareReal && !catOff.has(r.type)
      && (!locPublicOnly || LOCATION_ZONE_TYPES.includes(r.type)),
    [catOff, bareReal, locPublicOnly],
  );

  /* ── Hover панелийн HTML (эх аппын адил мөрөөр) ── */
  const zoneTip = useCallback((r: MapRow) => {
    /**
     * СИМУЛЯЦЫН hover панель — оноололынхоос ТУСДАА бүтэцтэй.
     * ⚠️ ЭРЭМБЭ (энэ бүс хэддүгээрт вэ) ЗОРИУДААР БАЙХГҮЙ: ижил утгатай бүсүүд
     * дээр эрэмбэ нь дурын дараалал болж («100 тэмдэгтэй атлаа 4-т») андуурмаг
     * төрүүлдэг. Харьцуулалт нь ДУНДЖААС хэдэн хувь гэдгээр илэрхийлэгдэнэ.
     */
    if (mode === 'simulation') {
      const def = simDef(simKind);
      const m = simMetric(r, simKind, popBasis);
      const t = def.ready ? simNorm(m.value, simRng) : null;
      const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;

      const diff = m.value != null && simAvg > 0 ? ((m.value - simAvg) / simAvg) * 100 : null;
      const diffTxt = diff == null ? '—'
        : `<b style="color:${diff > 0 ? 'var(--warn-ink)' : 'var(--good-ink)'}">${diff > 0 ? '+' : ''}${Math.round(diff)}%</b>`;

      return tr('\n        <div class="t">\n          <b>{0}</b>\n          <span class="st" style="background:{1};color:#1a1205">{2}</span>\n        </div>\n        <div class="sub2">{3} · {4} га</div>\n        <dl>\n          {5}\n          {6}\n          {7}\n          {8}\n        </dl>', esc(r.id), simColor(t), t == null ? '—' : Math.round(t * 100), esc(r.type), nf(r.areaHa, 2), dt(esc(def.label), `<b>${m.text}</b>`), dt(tr('Дунджаас'), diffTxt), dt(tr('Оршин суугч'), nf(r.residentPop)), dt(tr('Барилга'), nf(r.buildingCount)));
    }
    const row = r as Row;
    const score = valueOf(row, mode, ind);
    let pass = 0, total = 0;
    const failed: { name: string; v: string }[] = [];
    for (const i of indicators) {
      // ⚠️ Лавлагаа/жин 0 үзүүлэлт (greenCap, densityCap) норм-д ОРОХГҮЙ —
      //    оноолол (score.ts:83) ба дэлгэрэнгүй самбар (SuitDetail) хассан тул
      //    hover тоолол мөн адил хасна (эс бөгөөс худал «✗» ба буруу X/Y гарна).
      if (i.ref || i.weight <= 0) continue;
      const p = row.parts[i.id];
      if (!p || p.value == null) continue;
      total++;
      if (passesNorm(p.value, p.norm ?? i)) pass++;
      else failed.push({ name: i.short, v: nf(p.value, i.decimals) + (i.unit ? ` ${i.unit}` : '') });
    }
    const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
    return tr('\n      <div class="t">\n        <b>{0}</b>\n        <span class="st" style="background:{1}">{2}</span>\n      </div>\n      <div class="sub2">{3} · {4} га · {5}</div>\n      <dl>\n        {6}\n        {7}\n        {8}\n        {9}\n      </dl>\n      {10}', esc(row.id), scoreColor(score), score == null ? '—' : Math.round(score), esc(row.type), nf(row.areaHa, 2), scoreLabel(score), dt(tr('Оршин суугч'), nf(row.residentPop)), dt(tr('Өрх'), nf(row.households)), dt(tr('Барилга'), nf(row.buildingCount)), dt(tr('Норм хангасан'), `<b style="color:${pass === total ? 'var(--good-ink)' : 'var(--bad-ink)'}">${pass} / ${total}</b>`), failed.length ? `<div class="fails">${failed.map((f) =>
        `<div><span>✗ ${esc(f.name)}</span><em>${f.v}</em></div>`).join('')}</div>` : '');
  }, [mode, ind, indicators, simKind, popBasis, simRng, simAvg]);

  /**
   * ТЭЭВЭР-ИДЭВХИЙН hover панель — барилга · замын хэрчим · автобусны буудал.
   *
   * ⚠️ ЭРЭМБЭ ЗОРИУДААР БАЙХГҮЙ: живэ өгөгдөл дээр олон объект ЯГ ИЖИЛ утгатай
   * (жиш. X-12-т 770 хүнтэй 8 адилхан блок) бөгөөд тэдгээрийн хооронд эрэмбэ нь
   * дурын дараалал болно. «100 тэмдэгтэй атлаа 4-т» гэсэн зөрчил мэт харагдац
   * үүсгэдэг тул хассан — утга ба тэмдэг хоёр өөрөө хангалттай.
   */
  const transportTip = useCallback((kind: 'b' | 'r' | 's', idx: number): string | null => {
    if (!tCtx) return null;
    const def = tModeDef(tMode);
    const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;

    if (kind === 'b') {
      const b = tCtx.buildings[idx];
      if (!b) return null;
      const v = buildingValue(b, tMode, tCtx, idx);
      // ⚠️ Одоогийн дүрслэлд хамаарахгүй барилга — панель харуулахгүй (бүдэг зурагдсан)
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
    const st = String(a.Barilga_ty ?? '').trim();
    const purpose = String(a['Зориулалт_m'] ?? '').trim() || tr('Тодорхойгүй');
    const colors: Record<string, string> = {
      'Төлөвлөсөн': 'rgb(96,165,250)',
      'Баригдаж байгаа': 'rgb(251,146,60)',
      'Одоо байгаа': 'rgb(134,139,150)',
    };
    const pop = Number(a.Total_population ?? 0);
    const isRes = /орон сууц|house/i.test(purpose);
    const dt = (k: string, v: string | number | null) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    return tr('\n      <div class="t">\n        <b>{0}</b>\n        {1}\n      </div>\n      <dl>\n        {2}\n        {3}\n        {4}\n        {5}\n        {6}\n        {7}\n      </dl>', esc(purpose), st ? `<span class="st" style="background:${colors[st] ?? 'rgb(203,213,225)'}">${esc(st)}</span>` : '', dt(tr('Нийт талбай'), tr('{0} м²', nf(Number(a['Барилгын_нийт_талбай_m2'] ?? 0)))), dt(tr('Давхар'), Number(a['Давхрын_тоо_max'] ?? 0) || null), dt(tr('Өрх'), Number(a.Urhiin_too ?? 0) ? nf(Number(a.Urhiin_too)) : null), dt(isRes ? tr('Оршин суугч') : tr('Хүчин чадал'), pop ? nf(pop) : null), dt(tr('Зогсоол'), Number(a.Parking ?? 0) ? nf(Number(a.Parking)) : null), dt(tr('Бүс'), esc(a.ZONE_ID ?? '—')));
  }, []);

  const active = rows.find((r) => r.id === selected) ?? null;

  /**
   * «Симуляц» — ХОЁР самбар, ТООЦООЛЛЫН НЭГЖЭЭР нь хуваагдана:
   *   · ЗҮҮН  — «Тээвэр-идэвхийн шинжилгээ» (`TransportPanel`): БАРИЛГА бүрээр
   *   · БАРУУН — «Бүсийн симуляц» (`Simulation`): БҮС бүрээр
   *              (төвлөрөл · хүртээмж · ачаалал гурвуулаа)
   * Аль самбарын товчийг сүүлд дарсан нь газрын зургийг буддаг (`tActive`);
   * нөгөө нь зөвхөн товчоо харуулна (байрлал шилжихгүй).
   */
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
      stats: trafficStats,
      flat: dim !== '2d',
      /** «Шинэ зам» — машингүй, зөвхөн газрын зурагт харагдана */
      carsOff: !netCars,
      /** Харьцуулах замын сүлжээ сонгогч (Бодит/Төлөвлөгөө/Шинэ зам) */
      net: {
        kind: netKind,
        setKind: setNetKind,
        options: NET_KINDS.map((k) => ({
          kind: k,
          label: NET_SOURCES[k].label,
          short: NET_SOURCES[k].short,
          ready: isNetReady(k),
          note: NET_SOURCES[k].note,
        })),
      },
      /** Гэрлэн дохионы зохицуулалт — ээлж барьж асаах сонгогч */
      signal: {
        plan: realPlan,
        stage: signalStage,
        setStage: setSignalStage,
      },
    },
    // ⚠️ `selected`/`onSelect` ХАСАГДСАН: эрэмбийн жагсаалт байхгүй болсон тул
    //    самбар нь бүс сонгодоггүй — сонголт зөвхөн газрын зураг дээр дарж хийгдэнэ.
    rows: rows.filter((r) => !catOff.has(r.type)),
  };

  return (
    <div className={s.app}>
      {/* ⚠️ Ачаалалтын бүтэн дэлгэцийн loader ХАСАГДСАН — өгөгдөл ачаалагдах зуур
          апп шууд нээгдэж, бүсүүд бэлэн болмогцоо газрын зурагт гарна. Зөвхөн
          АЛДАА гарвал л мессежийг харуулна (алдааг далдлахгүйн тулд). */}
      {error && (
        <div className={s.loader}>
          <div className={s.loaderBox}>
            <div className={s.loaderTitle}>{tr('Сэлбэ дэд төв')}</div>
            <div className={s.loaderSub}>{tr('Тохиромжтой байдлын загварчлал')}</div>
            <div className={`${s.loaderMsg} ${s.loaderErr}`}>
              {tr('Алдаа гарлаа:')} {error}
            </div>
          </div>
        </div>
      )}

      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.brandMark} />
          <div>
            <h1>{tr('Сэлбэ Хот төлөвлөлтийн үзүүлэлтүүд')}</h1>
          </div>
        </div>
        <nav className={s.tabs}>
          {/* ⚠️ «Ерөнхий» (blend) ба «Эдийн засаг» (econ) табууд ХАСАГДСАН.
              Тэдгээрийн `mode` салаанууд кодод үлдсэн — дахин нээх бол зөвхөн
              энэ жагсаалтад мөрөө нэмнэ. */}
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
            {/* Тээвэр-идэвхийн 7 дүрслэл — ЗҮҮН талд ГАНЦААРАА.
                ⚠️ «Хүн амын төвлөрөл» нь БАРУУН самбар руу нүүсэн: тэр гурав
                (төвлөрөл · хүртээмж · ачаалал) бүгд БҮСЭЭР тооцогддог тул нэг
                дор байх нь логиктой; зүүн тал БАРИЛГА-аар тооцох шинжилгээнд
                бүтнээрээ үлдэнэ. */}
            {mode === 'simulation' && (
              <TransportPanel
                mode={tMode}
                setMode={pickTMode}
                active={tActive}
                ctx={tCtx}
                loading={tActive && !tCtx}
                error={tErr}
              />
            )}

            {/* ⚠️ Давхаргын жагсаалт нь зүүн rail-ийн картаас газрын зурган дээрх
                «Давхарга» товч + каталог руу шилжсэн («Ерөнхий төлөвлөгөө»-тэй
                ижил зарчим). Доорх `map` слот дахь `SuitLayerCatalog`-ыг үз. */}
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
                selected={selected}
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
              selected={selected}
              onSelect={setSelected}
              layerOn={layerOn}
              opacity={opacity}
              zoneTip={zoneTip}
              buildingTip={buildingTip}
              transportTip={transportMode ? transportTip : undefined}
              traffic={roadMode && netCars && roadNet ? {
                net: roadNet,
                minuteRef: clock.minuteRef,
                playing: clock.playing,
                speed: clock.speed,
                maxCars: peakCars,
                signalPlan,
                onStats: setTrafficStats,
              } : undefined}
              transportPaint={transportPaint}
              transportFaint={mapStyle === 'heat'}
              heat={heat}
              roadTile={bareReal}
              bldWhere={bldWhere}
              bldFocus={bldFocus}
              bldPick={locPick}
              onBldClick={setLocPick}
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

            {/* ⚠️ Жагсаалт нь ЯГ ОДОО асаалттай давхаргууд — `OpacityPanel`
                өөрөө `LAYER_BY_ID`-д байхгүйг (`zone`/`label` дүрслэл) шүүнэ. */}
            {opOpen && (
              <OpacityPanel
                visible={Object.keys(layerOn).filter((k) => layerOn[k])}
                opacity={opacity}
                setOpacity={setOpacity}
                onClose={() => setOpOpen(false)}
              />
            )}

            {/* «Давхарга» товч + 2D/3D/BIM — НЭГ мөрөнд, зүүн доод буланд
                (Давхарга нь дим товчны ӨМНӨ, «Ерөнхий төлөвлөгөө»-тэй ижил).
                ⚠️ ArcGIS-ийн удирдлага (zoom баруун дээд, масштаб баруун доод,
                дэлгэрэнгүй карт зүүн дээд)-тай мөргөлдөхгүй зүүн доод буланд. */}
            {/**
              * ⚠️ 2026-08-20: Бусад бүх харагдацтай ИЖИЛ зурвас (`MapTools`) —
              * дээд-төвд хөвөгч pill. Урьд нь энэ цонх дангаараа ЗҮҮН ДООД
              * буланд өөрийн `mapControls`-ыг зурдаг тул хэлбэр нь ч, байрлал
              * нь ч бусдаас зөрдөг байв.
              *
              * ⚠️ «Тунгалаг» ба «Бүс» ЭНД БАЙХГҮЙ — энэ цонх `MapCanvas` БИШ,
              * өөрийн `SuitMap`-ыг ашигладаг бөгөөд тэр нь давхаргын opacity ч,
              * бүсийн `definitionExpression` ч дэмждэггүй. Хуурамч (дарахад юу ч
              * болохгүй) товч тавихаас илүү нь тэднийг SuitMap-д жинхэнээр
              * хэрэгжүүлэх — тусдаа ажил.
              */}
            <MapTools
              dim={dim}
              setDim={setDim}
              layersOpen={layerCatOpen}
              onLayers={() => setLayerCatOpen((v) => !v)}
              opacityOpen={opOpen}
              onOpacity={() => setOpOpen((v) => !v)}
            >
              {/* Полигон ↔ дулаан — ЗӨВХӨН «Симуляц» горимд.
                  ⚠️ Гурван самбар бүрд давтахгүй: энэ нь ЗУРГИЙН тохиргоо тул
                  зургийн удирдлагын мөрөнд байх нь зөв. */}
              {mode === 'simulation' && (
                <div className={s.mapDims} role="group" aria-label={tr('Симуляцын дүрслэл')}>
                  {MAP_STYLES.map((v) => {
                    // ⚠️ Дулаан нь ЗАЙД (хүртээмж, автобус) ба машин агентын
                    //    симуляцад (ачаалал) утгагүй тул тэнд товч ИДЭВХГҮЙ —
                    //    дарж болох мөртлөө юу ч болохгүй байвал эвдэрсэн мэт санагдана.
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
                key={active.id}
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
          // ⚠️ Картын гарчигт төрлүүдээ ЖАГСААХГҮЙ — доорх гурван товч аль хэдийн
          //    «Төвлөрөл · Хүртээмж · Ачаалал» гэж бичсэн тул давхардал болно.
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
                    // ⚠️ `stopPropagation` — товч нь картын ГАРЧИГ дотор сууж
                    //    байгаа тул үгүй бол карт хураагдана.
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

            {/* Ногоон байгууламж — «Зогсоолын хэрэгцээ»-ний ижил зарчим.
                ⚠️ Картыг ХӨНДӨХӨД газрын зурагт ногоон давхарга нь АВТОМАТААР
                асна: тоо нь тайлбарладаг байгууламж хаана байгааг зэрэг харна
                (хэрэглэгчийн хүсэлт, 2026-08-12). Унтраахыг нь хориглохгүй —
                зөвхөн нэг удаа асаана. */}
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
                    // ⚠️ Үзүүлэлтийн нормыг ч БНБД-ийн 6.0 м² руу буцаана —
                    //    эс бөгөөс карт «6» гэж бичээд оноо 10-аар бодогдоно.
                    onClick={(e) => { e.stopPropagation(); applyGreen({ ...GREEN }); }}
                  >
                    <Icon name="reset" size={11} />
                    {tr('Анхны утга')}
                  </button>
                }
              >
                <div onPointerDown={showGreenLayer}>
                  {/* ⚠️ `scoredRows` БИШ, БҮХ бүс: газрын ашиглалтын «30% ногоон»
                      дүрэм ба нэг хүнд ногдох норм нь бүсийн ангиллаас
                      хамаарахгүй. Оноололоос хассан 35 бүс (46.7 га, түүний
                      дотор ногоон байгууламжийн 10 бүс) хасагдвал хуваарь 135.3
                      → 88.6 га болж, хангалт хиймлээр өснө. */}
                  <Green
                    rows={rows}
                    green={greenView}
                    setGreen={(g) => { showGreenLayer(); applyGreen(g); }}
                  />
                </div>
              </Card>
            )}

            {/* ⚠️ ХООСОН ЗАГВАР — агуулгыг хэрэглэгч дараа тодорхойлно
                (2026-08-12). Байрлал нь «Ногоон байгууламж»-ийн ЯГ ДООР;
                харагдах горим нь ч түүнтэй ижил. */}
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
 *
 * ⚠️ ИДЭВХЖҮҮЛЖ БОЛОХ хасагдсан ангилал (`ACTIVATABLE_ZONE_TYPES` — нийгмийн дэд
 * бүтэц, газар чөлөөлөлт дутуу) нь НЭГ дарахад ХОЁУЛАНГ нь удирдана: харагдац
 * (`catOff`) ба оноолол (`scoreOn`). Урьд нь зөвхөн оноололыг удирддаг байсан
 * тул «унтраалттай» мөр газрын зурагт харагдсаар байж, хэрэглэгч товч ажиллахгүй
 * байна гэж бодох шалтгаан болж байв (хэрэглэгчийн хүсэлт, 2026-08-12).
 */
function ZoneCatFilter({ cats, off, setOff, setScoreOn }: {
  cats: { type: string; count: number; color: string }[];
  off: Set<string>;
  setOff: (s: Set<string>) => void;
  /** ⚠️ Зөвхөн БИЧНЭ: оноолол нь харагдацаас (`off`) гардаг тул уншихгүй */
  setScoreOn: (s: Set<string>) => void;
}) {
  const allTypes = cats.map((c) => c.type);
  /** Одоо ХАРАГДАЖ байгаа ангиллууд */
  const visible = allTypes.filter((t) => !off.has(t));
  /** ӨГӨГДМӨЛ — БҮХ ангилал харагдана (шүүлт тавиагүй байдал) */
  const filtered = visible.length !== allTypes.length;

  /**
   * ⚠️ ШҮҮЛТИЙГ ТАВИХ (сонгох) зарчим — унтраах БИШ. Мөр дээр дарахад ЗӨВХӨН
   * тэр ангилал үлдэнэ (ArcGIS-ийн «select by attribute»-ийн зан). Ганцаараа
   * үлдсэн мөрөө дахин дарвал өгөгдмөл байдал руу буцна.
   *
   * ⚠️ `scoreOn`-ыг ХАМТ бичнэ: идэвхжүүлж болох ангилал харагдаж байвал
   * оноололд ч орно. Хоёр олонлог эсрэг утгатай (`off` = нуусан, `scoreOn` =
   * оноололд орсон) тул нэг үйлдэлд хоёуланг нь тааруулна.
   */
  const apply = (hidden: string[]) => {
    setOff(new Set(hidden));
    setScoreOn(new Set(allTypes.filter((t) => ACTIVATABLE_ZONE_TYPES.has(t) && !hidden.includes(t))));
  };
  /**
   * ⚠️ ОЛОН СОНГОЛТ — легендийн шүүлтийн зарчим:
   *   · шүүлтгүй үед дарвал  → ЗӨВХӨН тэр нь үлдэнэ (ганцаарчилна)
   *   · шүүлттэй үед сонгоогүй мөр → НЭМНЭ («Олон нийт» + «Орон сууц» хоёуланг)
   *   · сонгосон мөр (олон байхад) → ХАСНА
   *   · сүүлчийн сонгосон мөр → шүүлт цэвэрлэгдэнэ
   * Хэрэглэгч Ctrl/Shift дарах шаардлагагүй — энгийн даралтаар бүтнэ.
   */
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
        // ⚠️ Харагдац нь ГАНЦ эх сурвалжтай (`off`) — идэвхжүүлж болох ангилал ч
        //    үүнийг дагана; `scoreOn` нь `apply`-д хамт бичигддэг.
        const on = !off.has(c.type);
        return (
          <button
            key={c.type}
            type="button"
            aria-pressed={on}
            title={!filtered
              ? tr('Дарвал зөвхөн «{0}» үлдэнэ{1}', c.type, activatable ? tr(' (оноололд ч орно)') : '')
              : on && visible.length === 1 ? tr('Дарвал шүүлт цэвэрлэгдэнэ')
                : on ? tr('Дарвал «{0}»-ийг шүүлтээс хасна', c.type)
                  : tr('Дарвал «{0}»-ийг шүүлтэд нэмнэ', c.type)}
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
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{c.type}</span>
            {/* ⚠️ «оноол» шошго — энэ ангилал ХАРАГДВАЛ оноололд ч ордгийг сануулна */}
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
 *
 * ⚠️ Зөвхөн ГАЗРЫН ЗУРГИЙН харагдацыг шүүнэ (`definitionExpression`), ТООЦООГ
 * хөндөхгүй: бүсийн хүн ам, FAR, зогсоол зэрэг нь барилгуудаас нэгтгэгддэг тул
 * энд шүүвэл оноо чимээгүй өөрчлөгдөж, «би зөвхөн нуусан» гэж бодсон хэрэглэгч
 * өөр дүн хараад төөрөх байв.
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

  /**
   * ⚠️ ШҮҮЛТ ТАВИХ (сонгох) зарчим — унтраах БИШ, «Бүсийн ангилал» картын ижил
   * зан. Мөр дээр дарахад ЗӨВХӨН тэр бүлэг үлдэнэ; ганцаараа үлдсэн мөрөө
   * дахин дарвал шүүлт цэвэрлэгдэнэ.
   */
  const pick = (key: string) => {
    // ⚠️ «Бүсийн ангилал»-ын ЯГ ижил олон сонголтын зарчим (тэндхийг үз)
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
              + tr('{0} барилга · {1} м²{2}', nf(c.count), nf(c.gfaM2), c.values.length ? `\n${c.values.join(' · ')}` : '')}
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

