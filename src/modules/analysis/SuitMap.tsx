'use client';

import { useEffect, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Basemap from '@arcgis/core/Basemap';
import Ground from '@arcgis/core/Ground';
import Graphic from '@arcgis/core/Graphic';
import Home from '@arcgis/core/widgets/Home';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
import BasemapGallery from '@arcgis/core/widgets/BasemapGallery';
import LocalBasemapsSource from '@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource';
import Expand from '@arcgis/core/widgets/Expand';
import type Layer from '@arcgis/core/layers/Layer';
import type Polygon from '@arcgis/core/geometry/Polygon';
import esriConfig from '@arcgis/core/config';
import { version as arcgisVersion } from '@arcgis/core/kernel';
import { createRenderer as createHeatRenderer } from '@arcgis/core/smartMapping/renderers/heatmap';

import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import { createBimPicker, type BimPicker } from '@/components/bimPicker';
import { installEntInterceptor } from '@/lib/entInterceptor';
import {
  IMAGERY, IRGED_ROAD, MESH_VERSIONS, DEFAULT_MESH_VER, BIM, ELEVATION_URL, HOME, LAYER_BY_ID, layerUrl, ALWAYS_ON_IDS, REFERENCE_IDS,
} from '@/lib/services';
import type { Dim } from '@/components/MapCanvas';

/** 3d ба bim хоёулаа SceneView ашиглана */
const is3D = (d: Dim) => d === '3d' || d === 'bim';
import {
  MAP_LAYERS, NO_DATA_COLOR, BUILDING_STATUS_COLORS, GREEN_LAYER_KEY,
  type MapLayerDef,
} from '@/lib/analysis/config';
import type { Zone } from '@/lib/analysis/data';
import { TrafficOverlay } from './suit/TrafficOverlay';
import type { Network, SignalPlan } from './suit/traffic';
import type { TrafficStats } from './suit/TrafficOverlay';
import type { TPaint } from './suit/transportModes';
import type { HeatPoint } from './suit/heat';
import s from './suitability.module.css';
import { bimLayerFor, bimLayerPeek, dropBimCache } from '@/components/bimCache';
import { applyView3d, getRender3d, manageBim, profileFor, useBimPkg, useRender3d } from '@/components/render3d';
import { registerMapView } from '@/lib/mapShots';

/** Map-ын 58 BIM инстанц (`bimCache`) — Map-д байгаа эсэхээс үл хамаарна (2026-10-04, MapCanvas-ийн `bimAll`-тай ижил) */
const bimAll = (map: Map): BuildingSceneLayer[] => BIM.layers.map((b) => bimLayerFor(map, b.key, () =>
  new BuildingSceneLayer({ id: b.key, url: b.url, title: b.title, visible: true })));
const bimLive = (map: Map): BuildingSceneLayer[] => BIM.layers.flatMap((b) => {
  const l = bimLayerPeek<BuildingSceneLayer>(map, b.key);
  return l ? [l] : [];
});

export type MapRow = Zone & {
  urban: number | null;
  coverage?: number | null;
  urbanReason?: 'nodata' | 'coverage' | null;
  displayGeom: Polygon | null;
  /**
   * ОНООЛОЛД ОРСОН эсэх — `!excluded || scoreOn.has(type)` (2026-09-21).
   */
  scored?: boolean;
};

/** Бүс сонгогдох/hover-т орох эсэх — ганц дүрэм (`MapRow.scored` §тайлбар) */
const isScored = (r: MapRow): boolean => r.scored ?? !r.excluded;

/** Барилгын төлөвийн өнгө — каталогийн legend-тэй нэг эх сурвалж (`config.ts`) */
const STATUS_COLORS = BUILDING_STATUS_COLORS;

const OUTLINE_SCALE = 0.55;
const ow = (w: number) => w * OUTLINE_SCALE;

/** Дүүргэлт 70% тунгалаг — доорх бүсийн оноо харагдана. Хүрээ нь alpha ×3. */
const BLD_ALPHA = 0.3;
const BLD_ALPHA_DIM = 0.15;
const bldFill = (c: number[], a = BLD_ALPHA) => ({
  type: 'simple-fill', color: [...c, a],
  outline: { color: [...c, Math.min(1, a * 3)], width: ow(0.4) },
});

const ZONE_ALPHA = 0.5;
/** Өгөгдөлгүй/хассан бүс — тод харагдахаар 0.2-оос нэмэв */
const ZONE_ALPHA_NODATA = 0.5;
/** Өгөгдөлгүй/хассан бүсийг ЦАЙВАР (цагаан ойролцоо) — ортофото дээр тодрох.
    Хүрээ нь бараавтар саарал (тод зааг). */
const NODATA_FILL = '#eef2f7';
const NODATA_OUTLINE = '#64748b';
/** Сонгосон бүсийн хүрээ — cyan (ногоон дүүргэлт дээр ч тодорно) */
const SELECT_COLOR = [34, 211, 238, 1];

/**
 * Тээвэр-идэвхийн будалтын тунгалаг байдал.
 */
const T_ALPHA_ON = 0.8;
const T_ALPHA_OFF = 0.1;
/** Дулааны гадаргуу асаалттай үеийн тунгалагийн үржүүлэгч (дүрс бараг үл үзэгдэнэ) */
const T_FAINT = 0.22;

/**
 * Дулааны гадаргуугийн өнгөний шатлал — YlOrRd (`simulation.simColor`-той нэг гэр бүл).
 */
const HEAT_STOPS = [
  { ratio: 0, color: 'rgba(255, 255, 178, 0)' },
  { ratio: 0.12, color: 'rgba(255, 237, 160, 0.55)' },
  { ratio: 0.4, color: 'rgba(254, 178, 76, 0.75)' },
  { ratio: 0.7, color: 'rgba(253, 141, 60, 0.85)' },
  { ratio: 1, color: 'rgba(189, 0, 38, 0.92)' },
];

/** Дулааны цөмийн радиус (пиксель) — жижиг нь толбо, том нь бүх зургийг будна */
const HEAT_RADIUS = 30;

const hexToRgba = (hex: string, a: number) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a,
];

/**
 * 3D-д давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 */
type RendererProp = NonNullable<__esri.FeatureLayerProperties['renderer']>;
type SymbolProp = NonNullable<__esri.GraphicProperties['symbol']>;

const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

function rendererFor(d: MapLayerDef) {
  const c = d.color;
  if ((REFERENCE_IDS as readonly string[]).includes(d.key)) {
    return { type: 'simple', symbol: { type: 'simple-fill', color: [...c, 0],
      outline: { color: [...c, 0.95], width: ow(1.8) } } };
  }
  switch (d.kind) {
    case 'line':
      return { type: 'simple', symbol: { type: 'simple-line', color: [...c, 0.95], width: ow(0.75) } };
    case 'point':
      return { type: 'simple', symbol: { type: 'simple-marker', style: 'circle', size: 7,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: ow(1.2) } } };
    case 'point-lg':
      return { type: 'simple', symbol: { type: 'simple-marker', style: 'diamond', size: 12,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: ow(1.4) } } };
    case 'hatch':
      return { type: 'simple', symbol: { type: 'simple-fill', style: 'diagonal-cross',
        color: [...c, 0.55], outline: { color: [...c, 0.75], width: ow(0.8) } } };
    default:
      return { type: 'simple', symbol: { type: 'simple-fill', color: [...c, 0.35],
        outline: { color: [...c, 0.9], width: ow(0.6) } } };
  }
}

/**
 * Барилгын renderer — `Barilga_ty` (төлөв)-өөр.
 */
const bldFocusFill = (c: number[]) => ({
  type: 'simple-fill', color: [...c, 0.55],
  outline: { color: [255, 255, 255, 0.95], width: ow(1.2) },
});
const buildingRenderer = (focus = false) => ({
  type: 'unique-value', field: 'barilga_ty',
  defaultSymbol: focus ? bldFocusFill([203, 213, 225]) : bldFill([203, 213, 225], BLD_ALPHA_DIM),
  defaultLabel: tr('Бусад'),
  uniqueValueInfos: Object.entries(STATUS_COLORS).map(([value, c]) => ({
    value, label: value, symbol: focus ? bldFocusFill(c) : bldFill(c),
  })),
});

/**
 * Бүсийн шошгын симбол.
 */
function labelSymbol(dim: Dim, text: string, color: string, halo: string, haloSize: number, size: number) {
  if (is3D(dim)) {
    return {
      type: 'point-3d',
      symbolLayers: [{
        type: 'text',
        text,
        material: { color },
        halo: { color: halo, size: haloSize },
        size,
      }],
    } as unknown as SymbolProp;
  }
  return {
    type: 'text',
    color,
    haloColor: halo,
    haloSize,
    text,
    font: { size, family: 'Segoe UI', weight: 'bold' },
  } as unknown as SymbolProp;
}

/**
 * Суурь зураг — порталтай ЯГ ИЖИЛ: Esri-гийн нийтийн растр тайл + ортофото.
 */
/** Анхдагч суурь зураг — ТОПОГРАФИ (порталтай нэгдмэл). Ортофото тусдаа давхарга,
 *  эхэндээ унтраалттай — «Суурь зураг» чагтаар асаана. */
const baseMap = () => Basemap.fromId('topo-vector');

/**
 * БОДИТ ЗАМЫН гадаргуу — attribute-тай vector tile (`test_zam`).
 */
const ROAD_TILE_URL =
  IRGED_ROAD.url;

export function SuitMap({
  dim,
  rows,
  colorOf,
  shown,
  selected,
  onSelect,
  layerOn,
  zoneTip,
  buildingTip,
  transportTip,
  traffic,
  transportPaint,
  transportFaint = false,
  heat,
  roadTile = false,
  bldWhere = null,
  bldFocus = 0,
  bldPick = null,
  onBldClick,
  zoneFaint = false,
  opacity,
}: {
  /** 2D (MapView + ортофото) эсвэл 3D (SceneView + IntegratedMesh) */
  dim: Dim;
  rows: MapRow[];
  /** Бүсийн будалтын өнгө (одоогийн горимын оноогоор) */
  colorOf: (r: MapRow) => string;
  /** Шүүлтэд багтаж байгаа эсэх — багтаагүйг бүдгэрүүлнэ */
  shown: (r: MapRow) => boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Давхарга ил эсэх — `MAP_LAYERS[].key`-ээр (`zone`/`label` ч энд орно) */
  layerOn: Record<string, boolean>;
  /** Hover панелийн HTML — эх аппын адил мөрөөр угсарна */
  zoneTip: (r: MapRow) => string;
  buildingTip: (attrs: Record<string, unknown>) => string;
  /**
   * Тээвэр-идэвхийн hover панель — 'b' барилга · 'r' замын хэрчим · 's' буудал,
   * `idx` нь тухайн массивын индекс. Өгөхгүй бол тээврийн дүрс hover-гүй.
   */
  transportTip?: (kind: 'b' | 'r' | 's', idx: number) => string | null;
  /**
   * «Замын ачаалал» симуляц — машин агентуудын давхарга.
   */
  traffic?: {
    net: Network | null;
    minuteRef: React.MutableRefObject<number>;
    playing: boolean;
    speed: number;
    maxCars: number;
    /** Гэрлэн дохионы зохицуулалтын хөтөлбөр (ээлжийн тоо, мөчлөг) */
    signalPlan?: SignalPlan;
    onStats?: (s: TrafficStats) => void;
  };
  /**
   * Тээвэр-идэвхийн дүрслэл — барилга/зам/буудлын будалт (`transportModes.tPaint`).
   */
  transportPaint?: TPaint | null;
  /**
   * Дулааны гадаргуу асаалттай — тээврийн дүрсийг БҮДЭГ зурна.
   */
  transportFaint?: boolean;
  /**
   * Дулааны гадаргууны жинтэй цэгүүд (`heat.ts`). `null`/хоосон бол давхарга
   * УСТАНА — полигон харагдац руу буцна.
   */
  heat?: HeatPoint[] | null;
  /** «Бодит» замын vector tile гадаргууг ил болгох (attribute-тай `test_zam`). */
  roadTile?: boolean;
  /**
   * Барилгын давхаргын SQL шүүлт («Барилгын ангилал» картаас).
   * `null` бол шүүлтгүй — бүх барилга харагдана.
   */
  bldWhere?: string | null;
  /**
   * ШҮҮСЭН БАРИЛГА руу төвлөрүүлэх ТООЛУУР — өсөх бүрд газрын зураг шүүлтийн
   * хүрээ рүү шилжинэ. 0 бол хөдөлгөхгүй (анхны ачаалалт).
   */
  bldFocus?: number;
  /**
   * ТОДРУУЛАХ барилгын `OBJECTID` («Байршил» картаас сонгосон).
   * `null` бол тодруулга арилна.
   */
  bldPick?: number | null;
  /**
   * БАРИЛГА дээр дарахад дуудагдана («Байршил» карт сонсоно).
   * Барилгагүй газар дарвал `null`.
   */
  onBldClick?: (oid: number | null) => void;
  /**
   * Бүсийн будалтыг МАШ ТУНГАЛАГ болгох («Байршил» горим).
   */
  zoneFaint?: boolean;
  /**
   * Давхарга тус бүрийн ТУНГАЛАГ (0–1), `MAP_LAYERS[].key`-ээр.
   */
  opacity?: Record<string, number>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<MapView | SceneView | null>(null);
  const zoneRef = useRef<GraphicsLayer | null>(null);
  const labelRef = useRef<GraphicsLayer | null>(null);
  const bldRef = useRef<FeatureLayer | null>(null);
  /** Сонгосон барилгын тодруулга — бүсийн будалтаас ТУСДАА (цэвэрлэгддэггүй) */
  const pickRef = useRef<GraphicsLayer | null>(null);
  const roadTileRef = useRef<VectorTileLayer | null>(null);
  const tranRef = useRef<GraphicsLayer | null>(null);
  const heatRef = useRef<FeatureLayer | null>(null);
  /** Тээврийн будалт дахин зурагдах бүрд өснө — hover-ийн кэшийг хүчингүй болгоно */
  const paintVerRef = useRef(0);
  /** BIM сонгогч — MapCanvas-тай ижил (`components/bimPicker`) */
  const bimWidgetRef = useRef<BimPicker | null>(null);
  const ctxRef = useRef<Record<string, Layer>>({});
  /**
   * Давхарга бүрийн БҮТЭЭГДЭХ үеийн тунгалаг — «Тунгалаг» цонхны override
   * арилахад буцаж очих утга (порталын `MapCanvas`-тай ижил зарчим).
   */
  const baseOpacityRef = useRef<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [initErr, setInitErr] = useState<{ name?: string } | null>(null);
  const [initToken, setInitToken] = useState(0);

  // Callback-уудыг ref-ээр — эффектийг дахин ажиллуулахгүйгээр шинэчилнэ
  const cb = useRef({ colorOf, shown, zoneTip, buildingTip, transportTip, onSelect, rows, onBldClick });
  useSyncRef(cb, { colorOf, shown, zoneTip, buildingTip, transportTip, onSelect, rows, onBldClick });

  /** Панелийг заагчийн хажууд, зургийн хүрээнээс гарахгүйгээр */
  function placeTip(tip: HTMLDivElement, x: number, y: number) {
    const pad = 14;
    const box = tip.parentElement?.getBoundingClientRect();
    if (!box) return;
    let left = x + pad, top = y + pad;
    if (left + tip.offsetWidth > box.width - 6) left = x - tip.offsetWidth - pad;
    if (top + tip.offsetHeight > box.height - 6) top = y - tip.offsetHeight - pad;
    tip.style.left = `${Math.max(6, left)}px`;
    tip.style.top = `${Math.max(6, top)}px`;
  }

  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   */
  useEffect(() => {
    if (!el.current) return;

    void installEntInterceptor();
    if (!mapRef.current) {
      esriConfig.assetsPath = `https://js.arcgis.com/${String(arcgisVersion).split('.').slice(0, 2).join('.')}/@arcgis/core/assets`;

      const zoneLayer = new GraphicsLayer({ title: tr('Тохиромжтой байдал'), elevationInfo: ON_GROUND });
      const labelLayer = new GraphicsLayer({ title: tr('Шошго'), elevationInfo: ON_GROUND });
      const tranLayer = new GraphicsLayer({ title: tr('Тээвэр-идэвх'), elevationInfo: ON_GROUND });
      const pickLayer = new GraphicsLayer({ title: tr('Сонголт'), elevationInfo: ON_GROUND, listMode: 'hide' });
      pickRef.current = pickLayer;
      zoneRef.current = zoneLayer;
      labelRef.current = labelLayer;
      tranRef.current = tranLayer;

      ctxRef.current.zone = zoneLayer;
      ctxRef.current.label = labelLayer;

      const ctx = MAP_LAYERS.filter((d) => !d.special && d.layerId).map((d) => {
        const url = layerUrl(LAYER_BY_ID[d.layerId!]);
        const lyr = new FeatureLayer({
          url,
          title: d.title,
          visible: d.on,
          ...(d.kind === 'building' ? { outFields: ['*'] } : {}),
          elevationInfo: ON_GROUND,
          renderer: (d.kind === 'building' ? buildingRenderer() : rendererFor(d)) as unknown as RendererProp,
          popupEnabled: false, // popup биш — hover панель
        });
        ctxRef.current[d.key] = lyr;
        return { d, lyr };
      });

      const buildingLayer = ctx.find((x) => x.d.kind === 'building')?.lyr ?? null;
      bldRef.current = buildingLayer;
      const greenLayer = ctx.find((x) => x.d.key === GREEN_LAYER_KEY)?.lyr ?? null;
      const under = ctx
        .filter((x) => x.lyr !== buildingLayer && x.lyr !== greenLayer)
        .map((x) => x.lyr);

      /* Ортофото — вектор давхаргын доор. Эхэндээ УНТРААЛТТАЙ (анхдагч суурь
         зураг топографи; ортофотог «Суурь зураг» чагтаар асаана). */
      const imagery = new GroupLayer({
        id: 'imagery',
        title: IMAGERY.title,
        visible: false,
        listMode: 'hide',
        layers: IMAGERY.layers.map((o, i) => new TileLayer({ id: `imagery:${i}`, url: o.url, visible: true })),
      });

      /* Бодит замын vector tile гадаргуу — «Бодит» симуляцад л ил. Ортофотогийн
         дээр, бусад контекстийн доор (машин канвас нь газрын зургаас ДЭЭР тул
         энэ давхарга машиныг бүрхэхгүй). */
      const roadTileLayer = ROAD_TILE_URL ? new VectorTileLayer({
        id: 'roadTile', url: ROAD_TILE_URL, visible: false, listMode: 'hide',
      }) : null;
      roadTileRef.current = roadTileLayer;

      /**
       * Бүсийн будалт нь бүхэл бүсийг дүүргэдэг ХАМГИЙН ТОМ гадаргуу тул
       * ХАМГИЙН ДООР байна — эс бөгөөс дээрх бүх нарийн давхаргыг (ногоон,
       * инженерийн шугам, зам) бүрхэнэ. Барилга, ногоон байгууламж хоёр нь
       * будалтын дээр зурагдаж, аль бүсэд юу байгааг зэрэг харуулна.
       */
      mapRef.current = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: [
          imagery, ...(roadTileLayer ? [roadTileLayer] : []), zoneLayer, ...under,
          ...(greenLayer ? [greenLayer] : []),
          ...(buildingLayer ? [buildingLayer] : []),
          tranLayer, pickLayer, labelLayer,
        ],
      });
    }

    const map = mapRef.current;
    setReady(false);
    setInitErr(null);

    const view: MapView | SceneView = is3D(dim)
      ? new SceneView({
        container: el.current,
        map,
        camera: {
          position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
          tilt: 62, heading: 0,
        },
        popupEnabled: false,
        qualityProfile: profileFor(getRender3d()),
      })
      : new MapView({
        container: el.current,
        map,
        center: [HOME.lon, HOME.lat],
        zoom: HOME.zoom,
        constraints: { snapToZoom: false, rotationEnabled: false },
        popupEnabled: false,
      });
    viewRef.current = view;
    /* «Тайлан татах»-ын газрын зургийн агшин (`mapShots.ts`) */
    registerMapView(view);

    const anyView = view as MapView;
    (view.type === '3d' ? ['zoom', 'compass', 'navigation-toggle'] : ['zoom'])
      .forEach((id, index) => view.ui.move(id, { position: 'top-right', index } as never));
    view.ui.add(new Home({ view: anyView }), 'top-right');
    view.ui.add(new ScaleBar({ view: anyView, unit: 'metric', style: 'line' }), 'bottom-right');
    // Суурь зургийн галерей — Expand дотор (товч дарж дэлгэнэ).
    // Галерейн ДЭЭР «Ортофото» асаах/унтраах чагт (ортофото давхаргын ил байдал).
    const bmPanel = document.createElement('div');
    bmPanel.style.cssText = 'display:flex;flex-direction:column';
    const orthoRow = document.createElement('label');
    orthoRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 11px;'
      + 'font-size:12.5px;font-weight:600;color:var(--ink);background:var(--surface);'
      + 'border-bottom:1px solid var(--line);cursor:pointer';
    const orthoChk = document.createElement('input');
    orthoChk.type = 'checkbox';
    orthoChk.style.cssText = 'width:14px;height:14px;accent-color:var(--data);cursor:pointer';
    const imagery = map.findLayerById('imagery');
    orthoChk.checked = imagery ? imagery.visible : true;
    orthoChk.addEventListener('change', () => { if (imagery) imagery.visible = orthoChk.checked; });
    orthoRow.append(orthoChk, document.createTextNode(tr('Ортофото')));
    const galleryDiv = document.createElement('div');
    bmPanel.append(orthoRow, galleryDiv);
    const gallery = new BasemapGallery({
      view: anyView,
      container: galleryDiv,
      source: new LocalBasemapsSource({
        basemaps: [
          Basemap.fromId('topo-vector')!,
          Basemap.fromId('satellite')!,
          Basemap.fromId('hybrid')!,
          Basemap.fromId('streets-vector')!,
          Basemap.fromId('gray-vector')!,
          Basemap.fromId('dark-gray-vector')!,
          Basemap.fromId('osm')!,
        ],
      }),
    });
    view.ui.add(new Expand({
      view: anyView,
      content: bmPanel,
      expandIcon: 'basemap',
      expandTooltip: tr('Суурь зураг'),
    }), 'top-right');

    view.when(() => { if (!view.destroyed) setReady(true); }).catch((e: unknown) => {
      // Харагдац солиход cleanup view-г устгахад reject хийж болно — жинхэнэ алдаа биш
      if (view.destroyed) return;
      console.error('[selbe] шинжилгээний газрын зураг үүсгэж чадсангүй:', e);
      const er = e as { name?: unknown } | null;
      setInitErr({ name: typeof er?.name === 'string' ? er.name : undefined });
    });

    /**
     * Дарж БАРИЛГА эсвэл БҮС сонгох.
     */
    const click = view.on('click', (e: __esri.ViewClickEvent) => {
      const zoneLayer = zoneRef.current;
      const include = [bldRef.current, zoneLayer].filter(Boolean) as Layer[];
      if (!include.length) return;
      view.hitTest(e, { include })
        .then((hit) => {
          const onBld = cb.current.onBldClick;
          const bld = hit.results.find((r) => r.type === 'graphic' && r.graphic.layer === bldRef.current);
          if (bld && bld.type === 'graphic' && onBld) {
            const oid = (bld.graphic.attributes as Record<string, unknown>)?.objectid;
            if (oid != null) { onBld(Number(oid)); return; }
          }
          onBld?.(null);

          const g = hit.results.find(
            (r) => r.type === 'graphic' && (r.graphic.attributes as { zoneId?: string })?.zoneId,
          );
          const zid = g && g.type === 'graphic' ? (g.graphic.attributes as { zoneId: string }).zoneId : null;
          const zr = zid ? cb.current.rows.find((x) => x.id === zid) : null;
          cb.current.onSelect(zr && isScored(zr) ? zid : null);
        })
        .catch(() => {});
    });

    /**
     * Hover панель. Барилга бүсийн дээр зурагддаг тул эхлээд барилгыг үзүүлнэ.
     */
    let token = 0;
    let lastKey: string | null = null;
    const move = view.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      const my = ++token;
      const include = [tranRef.current, bldRef.current, zoneRef.current].filter(Boolean) as Layer[];
      if (!include.length) return;
      view.hitTest(e, { include })
        .then((hit) => {
          if (my !== token || !tipEl.current) return;
          const tip = tipEl.current;
          const tran = hit.results.find(
            (r) => r.type === 'graphic' && r.graphic.layer === tranRef.current
              && (r.graphic.attributes as { tOn?: boolean })?.tOn,
          );
          const bld = hit.results.find((r) => r.type === 'graphic' && r.graphic.layer === bldRef.current);
          const zone = hit.results.find(
            (r) => r.type === 'graphic' && (r.graphic.attributes as { zoneId?: string })?.zoneId,
          );

          let key: string | null = null;
          let html: string | null = null;
          if (tran && tran.type === 'graphic') {
            const a = tran.graphic.attributes as { tKind: 'b' | 'r' | 's'; tIdx: number };
            const k = `t${paintVerRef.current}${a.tKind}${a.tIdx}`;
            const tipHtml = k === lastKey ? '' : cb.current.transportTip?.(a.tKind, a.tIdx) ?? null;
            // `null` = энэ объект одоогийн дүрслэлд утгагүй → панель харуулахгүй
            if (tipHtml !== null) { key = k; html = tipHtml === '' ? null : tipHtml; }
          } else if (bld && bld.type === 'graphic') {
            const a = bld.graphic.attributes as Record<string, unknown>;
            key = `b${a.objectid}`;
            if (key !== lastKey) html = cb.current.buildingTip(a);
          } else if (zone && zone.type === 'graphic') {
            const id = (zone.graphic.attributes as { zoneId: string }).zoneId;
            const r = cb.current.rows.find((x) => x.id === id);
            if (r && isScored(r)) { key = `z${id}`; if (key !== lastKey) html = cb.current.zoneTip(r); }
          }

          if (!key) {
            tip.hidden = true; lastKey = null;
            if (!view.destroyed && view.container) view.container.style.cursor = '';
            return;
          }
          if (!view.destroyed && view.container) view.container.style.cursor = 'pointer';
          if (html !== null) { tip.innerHTML = html; lastKey = key; }
          tip.hidden = false;
          placeTip(tip, e.x, e.y);
        })
        .catch(() => {});
    });

    const leave = view.on('pointer-leave', () => {
      token += 1;
      if (tipEl.current) tipEl.current.hidden = true;
      lastKey = null;
      if (!view.destroyed && view.container) view.container.style.cursor = '';
    });

    return () => {
      click.remove();
      move.remove();
      leave.remove();
      if (!gallery.destroyed) gallery.destroy();
      view.container = null as unknown as HTMLDivElement;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
    };
    // `initToken` — «Дахин оролдох» дарахад view-г дахин үүсгэнэ
  }, [dim, initToken]);

  /** Map-ыг компонент бүрмөсөн салахад л устгана */
  useEffect(() => () => {
    if (mapRef.current) dropBimCache(mapRef.current);
    mapRef.current?.destroy();
    mapRef.current = null;
    zoneRef.current = null;
    labelRef.current = null;
    bldRef.current = null;
    roadTileRef.current = null;
    tranRef.current = null;
    ctxRef.current = {};
  }, []);

  /**
   * 3D давхаргуудыг ЗӨВХӨН тохирох горимд газрын зурагт байлгана (3d = меш,
   * bim = барилгын загвар).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of MESH_VERSIONS[DEFAULT_MESH_VER].layers) {
      const id = `scene:${m.key}`;
      const existing = map.findLayerById(id);
      if (dim === '3d' && !existing) {
        // Индекс 1 — ортофотогийн дараа, бусад давхаргын өмнө
        map.add(new IntegratedMeshLayer({ id, url: m.url, title: m.title, visible: true }), 1);
      } else if (dim !== '3d' && existing) {
        map.remove(existing);
        existing.destroy();
      }
    }

    for (const b of BIM.layers) {
      const existing = map.findLayerById(b.key);
      if (dim !== 'bim' && existing) map.remove(existing);
    }
  }, [dim, ready]);

  /** BuildingExplorer виджет — ЗӨВХӨН BIM горимд (MapCanvas-тай ижил зан) */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready) return;

    let clickH: IHandle | null = null;
    const clear = () => {
      clickH?.remove();
      clickH = null;
      if (bimWidgetRef.current) {
        if (!view.destroyed) view.ui.remove(bimWidgetRef.current.el);
        bimWidgetRef.current.destroy();
        bimWidgetRef.current = null;
      }
    };

    if (dim !== 'bim') { clear(); return; }

    const layers = bimAll(map);
    if (!layers.length) return;

    clear();
    const widget = createBimPicker({ view: view as SceneView, layers: () => bimLive(map), items: BIM.layers, Explorer: BuildingExplorer });
    view.ui.add(widget.el, 'top-right');
    bimWidgetRef.current = widget;
    clickH = view.on('click', (e: __esri.ViewClickEvent) => { void widget.pickAt(e); });

    return clear;
  }, [dim, ready]);

  const r3 = useRender3d();
  const bimPkg = useBimPkg();
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || view.type !== '3d') return;
    applyView3d(view as SceneView, r3);
  }, [dim, ready, r3]);
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || dim !== 'bim' || view.type !== '3d') return;
    if (!bimAll(map).length) return;
    return manageBim({ view: view as SceneView, map, all: () => bimLive(map), m: r3, archOn: false, pkg: bimPkg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready, r3, r3 === 'fine' ? bimPkg : null]);

  const bimPkgKey = r3 === 'fine' ? bimPkg.pkg : null;
  useEffect(() => {
    if (dim === 'bim' && ready) bimWidgetRef.current?.rebind();
  }, [dim, ready, r3, bimPkgKey]);

  /* ── Давхаргын ил байдал (оноон будалт, шошго ч энд орно) ── */
  useEffect(() => {
    for (const [key, lyr] of Object.entries(ctxRef.current)) {
      // Лавлагааны хилүүд — каталогоос үл хамааран энэ зурагт ч үргэлж ил.
      lyr.visible = (ALWAYS_ON_IDS as readonly string[]).includes(key) || (layerOn[key] ?? false);
    }
  }, [layerOn]);

  /* ── Давхаргын ТУНГАЛАГ («Тунгалаг» цонх) ── */
  useEffect(() => {
    for (const [key, lyr] of Object.entries(ctxRef.current)) {
      if (baseOpacityRef.current[key] == null) baseOpacityRef.current[key] = lyr.opacity ?? 1;
      lyr.opacity = opacity?.[key] ?? baseOpacityRef.current[key];
    }
  }, [opacity, ready]);

  /* ── Бодит замын vector tile — «Бодит» симуляцад л ил ── */
  useEffect(() => {
    if (roadTileRef.current) roadTileRef.current.visible = roadTile;
  }, [roadTile]);

  /* ── Барилгын зориулалтын шүүлт («Барилгын ангилал» карт) ── */
  useEffect(() => {
    const l = bldRef.current;
    if (!l) return;
    l.definitionExpression = bldWhere ?? '';
    l.renderer = buildingRenderer(bldWhere != null) as unknown as RendererProp;
  }, [bldWhere, ready]);

  /* ── Бүсийн будалт ба шошго ── */
  const paintKey = rows.map((r) => `${r.id}:${colorOf(r)}:${shown(r) ? 1 : 0}`).join('|')
    + `#${selected ?? ''}#${dim}#${zoneFaint ? 1 : 0}`;
  useEffect(() => {
    const zoneLayer = zoneRef.current, labelLayer = labelRef.current;
    if (!zoneLayer || !labelLayer) return;
    zoneLayer.removeAll();
    labelLayer.removeAll();

    // Сонгосон бүсийг ХАМГИЙН СҮҮЛД зурж хүрээ нь хөршүүддээ дарагдахгүй байлгана
    const ordered = [...rows].sort(
      (a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0),
    );

    for (const r of ordered) {
      if (!r.displayGeom) continue;
      const scoreCol = colorOf(r);
      const noData = scoreCol === NO_DATA_COLOR;
      const col = noData ? NODATA_FILL : scoreCol;
      const isSel = selected === r.id;
      const vis = shown(r);
      if (!vis) continue;
      const isBagts = /багц/i.test(r.id);
      const hasSel = selected !== null;

      let alpha = noData ? ZONE_ALPHA_NODATA : ZONE_ALPHA;
      if (zoneFaint) alpha = 0.1;
      else if (hasSel && !isSel) alpha *= 0.45;

      const outline = isSel ? SELECT_COLOR
        : zoneFaint ? hexToRgba(col, 0.9)
          : noData ? hexToRgba(NODATA_OUTLINE, Math.min(1, alpha * 1.5))
            : hexToRgba(col, Math.min(1, alpha * 1.35));

      zoneLayer.add(new Graphic({
        geometry: r.displayGeom,
        attributes: { zoneId: r.id },
        symbol: {
          type: 'simple-fill',
          color: hexToRgba(col, alpha),
          outline: {
            color: outline,
            width: isSel ? 1.6 : zoneFaint ? ow(1.4) : noData ? ow(0.8) : ow(0.6),
          },
        } as unknown as SymbolProp,
      }));

      if (vis) {
        // Зөвхөн бүсийн НЭР — оноо нь өнгө, эрэмбэ, дэлгэрэнгүйгээс уншигдана
        labelLayer.add(new Graphic({
          geometry: r.displayGeom.centroid,
          symbol: labelSymbol(
            dim,
            r.id,
            isSel ? '#ffffff' : isBagts ? '#ffeeba' : '#dbe4ee',
            isSel ? '#000000' : '#0a0e13',
            isSel ? 2.2 : 1.1,
            isSel ? 11 : isBagts ? 9 : 7.5,
          ),
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey]);

  /* ── Тээвэр-идэвхийн будалт (барилга · зам · буудал) ── */
  useEffect(() => {
    const layer = tranRef.current;
    if (!layer) return;
    layer.removeAll();
    paintVerRef.current++;
    if (!transportPaint) return;

    const sr = { wkid: 3857 };

    const fade = transportFaint ? T_FAINT : 1;

    for (const b of transportPaint.buildings) {
      const a = (b.on ? T_ALPHA_ON : T_ALPHA_OFF) * fade;
      layer.add(new Graphic({
        geometry: { type: 'polygon', rings: b.rings, spatialReference: sr } as unknown as Polygon,
        attributes: { tKind: 'b', tIdx: b.idx, tOn: b.on },
        symbol: {
          type: 'simple-fill',
          color: hexToRgba(b.color, a),
          outline: { color: hexToRgba(b.color, Math.min(1, a * 1.4)), width: ow(b.on ? 0.7 : 0.3) },
        } as unknown as SymbolProp,
      }));
    }

    for (const r of transportPaint.roads) {
      layer.add(new Graphic({
        geometry: { type: 'polyline', paths: [r.pts], spatialReference: sr } as unknown as __esri.Polyline,
        attributes: { tKind: 'r', tIdx: r.idx, tOn: true },
        symbol: {
          type: 'simple-line', color: hexToRgba(r.color, 0.95 * fade), width: r.width, cap: 'round', join: 'round',
        } as unknown as SymbolProp,
      }));
    }

    for (const p of transportPaint.stops) {
      layer.add(new Graphic({
        geometry: { type: 'point', x: p.x, y: p.y, spatialReference: sr } as unknown as __esri.Point,
        attributes: { tKind: 's', tIdx: p.idx, tOn: true },
        symbol: {
          type: 'simple-marker', style: 'circle', size: p.size,
          color: [56, 189, 248, 0.9 * fade],
          outline: { color: [8, 47, 73, 0.95 * fade], width: ow(1.6) },
        } as unknown as SymbolProp,
      }));
    }
  }, [transportPaint, transportFaint]);

  /* ── Дулааны гадаргуу (клиент талын цэгэн давхарга) ── */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || is3D(dim) || !heat?.length) return;

    const layer = new FeatureLayer({
      id: 'simHeat',
      title: tr('Дулааны гадаргуу'),
      source: heat.map((p, i) => new Graphic({
        geometry: { type: 'point', x: p.x, y: p.y, spatialReference: { wkid: 3857 } } as unknown as __esri.Point,
        attributes: { oid: i + 1, w: p.w },
      })),
      objectIdField: 'oid',
      fields: [
        { name: 'oid', type: 'oid' },
        { name: 'w', type: 'double' },
      ],
      geometryType: 'point',
      spatialReference: { wkid: 3857 } as unknown as __esri.SpatialReference,
      popupEnabled: false,
      legendEnabled: false,
    });

    // Бүсийн будалтын ДЭЭР, барилгын ДООР — бүсийн хил бүдэг харагдсаар байна
    const at = zoneRef.current ? map.layers.indexOf(zoneRef.current) + 1 : undefined;
    map.add(layer, at);
    heatRef.current = layer;

    let alive = true;
    createHeatRenderer({ layer, view, field: 'w', radius: HEAT_RADIUS, fadeToTransparent: true })
      .then(({ renderer }) => {
        if (!alive || layer.destroyed) return;
        renderer.colorStops = HEAT_STOPS as unknown as __esri.HeatmapColorStop[];
        layer.renderer = renderer;
      })
      .catch((e: unknown) => console.warn('[selbe] дулааны шатлал:', e));

    return () => {
      alive = false;
      if (!map.destroyed) map.remove(layer);
      layer.destroy();
      if (heatRef.current === layer) heatRef.current = null;
    };
  }, [heat, ready, dim]);

  /** Сонгосон бүс рүү төвлөрөх */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !selected) return;
    const r = rows.find((x) => x.id === selected);
    if (r?.displayGeom) view.goTo({ target: r.displayGeom, scale: 6000 }, { duration: 550 }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /**
   * ШҮҮСЭН БАРИЛГА руу төвлөрөх — «Барилгын ангилал» картаас сонгоход.
   */
  useEffect(() => {
    const view = viewRef.current;
    const lyr = bldRef.current;
    if (!view || view.destroyed || !lyr || !ready || !bldFocus || !bldWhere) return;
    let alive = true;
    lyr.queryExtent()
      .then((res) => {
        if (!alive || !res.extent || view.destroyed) return;
        // Хэт ойртохоос сэргийлж доод масштаб тавина (нэг барилга сонгоход)
        return view.goTo({ target: res.extent.expand(1.6) }, { duration: 600 });
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bldFocus, ready]);

  /**
   * СОНГОСОН БАРИЛГЫГ тодруулж, түүн рүү ойртох («Байршил» картаас).
   */
  useEffect(() => {
    const view = viewRef.current;
    const layer = pickRef.current;
    const bld = bldRef.current;
    if (!layer || !view || view.destroyed || !ready) return;
    layer.removeAll();
    if (bldPick == null || !bld) return;

    let alive = true;
    const q = bld.createQuery();
    q.objectIds = [bldPick];
    q.returnGeometry = true;
    q.outFields = [];
    bld.queryFeatures(q)
      .then((res) => {
        const g = res.features[0]?.geometry;
        if (!alive || !g || view.destroyed) return;
        layer.add(new Graphic({
          geometry: g,
          symbol: {
            type: 'simple-fill',
            color: [34, 211, 238, 0.35],
            outline: { color: [34, 211, 238, 1], width: ow(3) },
          } as unknown as SymbolProp,
        }));
        return view.goTo({ target: g, scale: 3000 }, { duration: 600 });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [bldPick, ready]);

  /** Судалгааны талбар руу эхэлж төвлөрөх (view дахин үүсэх бүрд) */
  const fitKey = `${rows.length}|${ready}|${dim}`;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !ready || !rows.length) return;
    const extents = rows.map((r) => r.displayGeom?.extent).filter(Boolean) as __esri.Extent[];
    if (!extents.length) return;
    const union = extents.reduce((a, e) => a.union(e), extents[0].clone());
    view.goTo(union.expand(1.12)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className={s.mapWrap}>
      <div ref={el} className={s.viewDiv} />
      {traffic && !is3D(dim) && (
        <TrafficOverlay viewRef={viewRef} ready={ready} {...traffic} />
      )}
      <div ref={tipEl} className={s.mapTip} hidden />
      {!ready && initErr && (
        <div
          role="alert"
          style={{
            position: 'absolute', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center',
            padding: 16, background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
          }}
        >
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 330, padding: '11px 13px',
              fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--bad) 45%, var(--line))', borderRadius: 8,
            }}
          >
            <b style={{ color: 'var(--ink)' }}>{tr('Газрын зураг үүсгэж чадсангүй')}</b>
            <span>
              {initErr.name?.startsWith('webgl:')
                ? tr('Хөтчийн график (WebGL) идэвхгүй байна — тоног төхөөрөмжийн хурдасгуурыг асаах эсвэл өөр хөтөч ашиглана уу.')
                : tr('Сүлжээ эсвэл газрын зургийн үйлчилгээний алдаа гарлаа.')}
            </span>
            {initErr.name && <code style={{ opacity: 0.75, fontSize: 11 }}>{initErr.name}</code>}
            {/* WebGL-ийн уналтад дахин үүсгэх нь ижил уналт өгнө (MapCanvas) */}
            {!initErr.name?.startsWith('webgl:') && (
              <button
                type="button"
                onClick={() => setInitToken((t) => t + 1)}
                style={{
                  alignSelf: 'flex-start', padding: '5px 12px', cursor: 'pointer',
                  font: 'inherit', fontWeight: 600, color: 'var(--ink)',
                  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6,
                }}
              >
                {tr('Дахин оролдох')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
