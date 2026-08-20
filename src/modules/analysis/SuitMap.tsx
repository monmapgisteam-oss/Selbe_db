'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Basemap from '@arcgis/core/Basemap';
import Ground from '@arcgis/core/Ground';
import Graphic from '@arcgis/core/Graphic';
import Home from '@arcgis/core/widgets/Home';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
import BasemapGallery from '@arcgis/core/widgets/BasemapGallery';
import Expand from '@arcgis/core/widgets/Expand';
import type Layer from '@arcgis/core/layers/Layer';
import type Polygon from '@arcgis/core/geometry/Polygon';
import esriConfig from '@arcgis/core/config';
import { createRenderer as createHeatRenderer } from '@arcgis/core/smartMapping/renderers/heatmap';

import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import {
  ET, IMAGERY, SCENE, BIM, ELEVATION_URL, HOME, LAYER_BY_ID, layerUrl, ALWAYS_ON_IDS, REFERENCE_IDS,
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

export type MapRow = Zone & { urban: number | null; displayGeom: Polygon | null };

/** Барилгын төлөвийн өнгө — каталогийн legend-тэй нэг эх сурвалж (`config.ts`) */
const STATUS_COLORS = BUILDING_STATUS_COLORS;

/** ⚠️ Бүх давхаргын хүрээг нарийсгах КОЭФФИЦИЕНТ — үндсэн зургийн
 *  `MapCanvas.OUTLINE_SCALE`-тай ижил байлгана (project даяар нэг харагдац). */
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
 * ⚠️ Дүрслэлд ХАМААРАХГҮЙ барилга (жиш. «Хүн ам» дүрслэл дэх сургууль) бүрмөсөн
 * алга болохгүй — маш бүдгээр үлдэж контекст өгнө; эс бөгөөс газрын зураг
 * цоорхойтой харагдана.
 */
const T_ALPHA_ON = 0.8;
const T_ALPHA_OFF = 0.1;
/** Дулааны гадаргуу асаалттай үеийн тунгалагийн үржүүлэгч (дүрс бараг үл үзэгдэнэ) */
const T_FAINT = 0.22;

/**
 * Дулааны гадаргуугийн өнгөний шатлал — YlOrRd (`simulation.simColor`-той нэг гэр бүл).
 * ⚠️ Хамгийн доод зогсоол нь БҮРЭН ТУНГАЛАГ байх ЁСТОЙ: эс бөгөөс өгөгдөлгүй
 * талбай шар хальсаар бүрхэгдэж, ортофото/бүсийн хил уншигдахгүй болно.
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
 * ⚠️ Заавал: гадаргуу ~1350 м өндөрт байх бөгөөд `elevationInfo` өгөхгүй бол
 * давхарга 0 м-т үлдэж мешийн доор алга болно.
 */
/**
 * ⚠️ ArcGIS 4.34-д `renderer`/`symbol` нь ЯЛГАВАРТАЙ НЭГДЭЛ болсон: гишүүн бүр
 * `type`-ыг ЛИТЕРАЛ байдлаар шаардана. Ерөнхий `__esri.RendererProperties`/
 * `SymbolProperties` нь тэр литералыг агуулаагүй тул шууд оноох боломжгүй.
 * Хүлээн авагч талаас нь гаргаж авбал хувилбар өөрчлөгдөхөд дагаж шинэчлэгдэнэ.
 */
type RendererProp = NonNullable<__esri.FeatureLayerProperties['renderer']>;
type SymbolProp = NonNullable<__esri.GraphicProperties['symbol']>;

const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

function rendererFor(d: MapLayerDef) {
  const c = d.color;
  // ⚠️ Лавлагааны хил (Сэлбэ 1/2) — ЗӨВХӨН зураас, дүүргэлтгүй. `rendererFor` нь
  //    каталогийн `fill:0`-ыг мэддэггүй тул энд онцгойлно: эс бөгөөс бүх талбайг
  //    хилийн өнгөөр буддаг (зөвхөн анализын зурагт гардаг байсан алдаа). Хүрээ нь
  //    дүүргэлтийн өнгөөрөө (hue) тодоор гарна.
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
 *
 * ⚠️ `focus` (шүүлт идэвхтэй) үед ХҮРЭЭГ нь тод, зузаан болгоно: шүүлт нь
 * үлдсэн барилгыг зөвхөн ЦӨӨРҮҮЛДЭГ тул тэдгээр нь ортофото дээр төдийлөн
 * анзаарагдахгүй байв. Одоо «энэ бол миний шүүсэн зүйл» гэдэг нь илт харагдана.
 */
const bldFocusFill = (c: number[]) => ({
  type: 'simple-fill', color: [...c, 0.55],
  outline: { color: [255, 255, 255, 0.95], width: ow(1.2) },
});
const buildingRenderer = (focus = false) => ({
  type: 'unique-value', field: 'Barilga_ty',
  defaultSymbol: focus ? bldFocusFill([203, 213, 225]) : bldFill([203, 213, 225], BLD_ALPHA_DIM),
  defaultLabel: tr('Бусад'),
  uniqueValueInfos: Object.entries(STATUS_COLORS).map(([value, c]) => ({
    value, label: value, symbol: focus ? bldFocusFill(c) : bldFill(c),
  })),
});

/**
 * Бүсийн шошгын симбол.
 *
 * ⚠️ 2D ба 3D-д ӨӨР төрөл: `TextSymbol` нь SceneView-д ДЭМЖИГДЭХГҮЙ (ArcGIS-ийн
 * баримтжуулсан хязгаарлалт) тул тэнд `point-3d` + `text` symbolLayer хэрэглэнэ.
 * Нэг ижил бичвэрийг хоёр хэлбэрээр угсарч байгаа нь энэ шалтгаантай.
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
 * ⚠️ Вектор тайлын суурь зураг БИШ: загвар солиход `VectorTileContainer`
 * дээр унадаг ба 2D-д ортофото түүнийг бүрэн бүрхдэг.
 */
/** Анхдагч суурь зураг — ТОПОГРАФИ (порталтай нэгдмэл). Ортофото тусдаа давхарга,
 *  эхэндээ унтраалттай — «Суурь зураг» чагтаар асаана. */
const baseMap = () => Basemap.fromId('topo-vector');

/**
 * БОДИТ ЗАМЫН гадаргуу — attribute-тай vector tile (`test_zam`).
 * ⚠️ Замын ПОЛИГОН (талбай), centerline биш — зөвхөн ХАРАГДАЦ. Трафикийн граф нь
 * `Monmap_zam` line дээр хэвээр (`netSources.ts`). «Бодит» сонгоход л ил болно.
 */
const ROAD_TILE_URL =
  'https://vectortileservices-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/test_zam/VectorTileServer';

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
   * ⚠️ Зөвхөн 2D-д зурагдана (доор үз); өгөгдөөгүй бол давхарга огт үүсэхгүй.
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
   * ⚠️ Өгөгдөхгүй бол давхарга ХООСОН үлдэнэ (бусад горимд юу ч зурахгүй).
   */
  transportPaint?: TPaint | null;
  /**
   * Дулааны гадаргуу асаалттай — тээврийн дүрсийг БҮДЭГ зурна.
   * ⚠️ Огт зурахгүй БОЛОХГҮЙ: hover панель зөвхөн эдгээр дүрс дээр ажилладаг тул
   * тэднийг хаявал дулааны зураг дээр юу ч уншиж чадахгүй болно.
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
   * ⚠️ Тэр үед мессеж нь БАРИЛГЫН байршил тул бүсийн дүүргэлт зөвхөн хилийн
   *    чиг баримжаа өгөх ёстой — ортофото, барилга нэвт харагдана.
   */
  zoneFaint?: boolean;
  /**
   * Давхарга тус бүрийн ТУНГАЛАГ (0–1), `MAP_LAYERS[].key`-ээр.
   *
   * ⚠️ 2026-08-20: Урьд нь энэ зурагт тунгалаг тохируулах арга ОГТ байхгүй тул
   * «Тохиромжтой байдал» цонхонд «Тунгалаг» товч зурагдаж чаддаггүй байв.
   * Заагаагүй давхарга нь БҮТЭЭГДЭХ үеийн анхдагч тунгалагаа хадгална
   * (жиш. барилга 0.3 — доорх бүсийн онооны будалт нэвт харагдана).
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
  const bimWidgetRef = useRef<BuildingExplorer | null>(null);
  // ⚠️ Энэ файлд `Map` нэрийг ArcGIS-ийн `Map` класс эзэлсэн тул JS-ийн Map
  //    ашиглах боломжгүй — энгийн объект хангалттай.
  const ctxRef = useRef<Record<string, Layer>>({});
  /**
   * Давхарга бүрийн БҮТЭЭГДЭХ үеийн тунгалаг — «Тунгалаг» цонхны override
   * арилахад буцаж очих утга (порталын `MapCanvas`-тай ижил зарчим).
   */
  const baseOpacityRef = useRef<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  // Callback-уудыг ref-ээр — эффектийг дахин ажиллуулахгүйгээр шинэчилнэ
  const cb = useRef({ colorOf, shown, zoneTip, buildingTip, transportTip, onSelect, rows, onBldClick });
  cb.current = { colorOf, shown, zoneTip, buildingTip, transportTip, onSelect, rows, onBldClick };

  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   * ⚠️ Map-ыг дахин үүсгэвэл давхаргууд шинээр ачаалагдаж, сонголт алдагдана.
   */
  useEffect(() => {
    if (!el.current) return;

    if (!mapRef.current) {
      esriConfig.assetsPath = 'https://js.arcgis.com/4.34/@arcgis/core/assets';

      const zoneLayer = new GraphicsLayer({ title: tr('Тохиромжтой байдал'), elevationInfo: ON_GROUND });
      const labelLayer = new GraphicsLayer({ title: tr('Шошго'), elevationInfo: ON_GROUND });
      // ⚠️ Тээврийн будалт нь барилгын давхаргыг ДАРНА (дээр нь зурагдана) —
      //    эс бөгөөс төлөвийн өнгө (Barilga_ty) шинжилгээний өнгийг бүрхэнэ.
      const tranLayer = new GraphicsLayer({ title: tr('Тээвэр-идэвх'), elevationInfo: ON_GROUND });
      const pickLayer = new GraphicsLayer({ title: tr('Сонголт'), elevationInfo: ON_GROUND, listMode: 'hide' });
      pickRef.current = pickLayer;
      zoneRef.current = zoneLayer;
      labelRef.current = labelLayer;
      tranRef.current = tranLayer;

      /**
       * ⚠️ `special` давхаргууд (оноон будалт, шошго) нь дээрх GraphicsLayer —
       * тэдгээрийг ЭНД дахин үүсгэхгүй, зөвхөн `ctxRef`-т бүртгэж ил байдлыг
       * нь нэг ижил механизмаар удирдана.
       */
      ctxRef.current.zone = zoneLayer;
      ctxRef.current.label = labelLayer;

      const ctx = MAP_LAYERS.filter((d) => !d.special).map((d) => {
        // Хяналтын давхаргууд ХУУЧИН үйлчилгээнд тул каталогоос хаягаа авчирна
        const url = d.layerId ? layerUrl(LAYER_BY_ID[d.layerId]) : `${ET}/${d.n}`;
        const lyr = new FeatureLayer({
          url,
          title: d.title,
          visible: d.on,
          outFields: ['*'],
          elevationInfo: ON_GROUND,
          renderer: (d.kind === 'building' ? buildingRenderer() : rendererFor(d)) as unknown as RendererProp,
          popupEnabled: false, // popup биш — hover панель
        });
        ctxRef.current[d.key] = lyr;
        return { d, lyr };
      });

      const buildingLayer = ctx.find((x) => x.d.kind === 'building')?.lyr ?? null;
      bldRef.current = buildingLayer;
      /**
       * ⚠️ БАРИЛГА ба НОГООН БАЙГУУЛАМЖ хоёрыг контекстээс САЛГАНА — тэдгээр нь
       * бүсийн будалтын ДЭЭР зурагдана. Ногоон нь урьд нь контекстийн дунд байсан
       * тул бүсийн будалт дор нь дарагдаж, «Ногоон байгууламж» картаас асаахад
       * бараг харагддаггүй байв.
       */
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
        layers: IMAGERY.urls.map((url, i) => new ImageryLayer({
          id: `imagery:${i}`, url, visible: true,
          format: 'jpgpng', popupEnabled: false, legendEnabled: false,
        })),
      });

      /* Бодит замын vector tile гадаргуу — «Бодит» симуляцад л ил. Ортофотогийн
         дээр, бусад контекстийн доор (машин канвас нь газрын зургаас ДЭЭР тул
         энэ давхарга машиныг бүрхэхгүй). */
      const roadTileLayer = new VectorTileLayer({
        id: 'roadTile', url: ROAD_TILE_URL, visible: false, listMode: 'hide',
      });
      roadTileRef.current = roadTileLayer;

      /**
       * ⚠️ ДАРААЛАЛ (доороос дээш):
       *   ортофото → замын tile → БҮСИЙН БУДАЛТ → контекст → ногоон → барилга
       *   → тээвэр → шошго
       *
       * Бүсийн будалт нь бүхэл бүсийг дүүргэдэг ХАМГИЙН ТОМ гадаргуу тул
       * ХАМГИЙН ДООР байна — эс бөгөөс дээрх бүх нарийн давхаргыг (ногоон,
       * инженерийн шугам, зам) бүрхэнэ. Барилга, ногоон байгууламж хоёр нь
       * будалтын дээр зурагдаж, аль бүсэд юу байгааг зэрэг харуулна.
       */
      mapRef.current = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: [
          imagery, roadTileLayer, zoneLayer, ...under,
          ...(greenLayer ? [greenLayer] : []),
          ...(buildingLayer ? [buildingLayer] : []),
          tranLayer, pickLayer, labelLayer,
        ],
      });
    }

    const map = mapRef.current;
    setReady(false);

    const view: MapView | SceneView = is3D(dim)
      ? new SceneView({
        container: el.current,
        map,
        camera: {
          position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
          tilt: 62, heading: 0,
        },
        popupEnabled: false,
        qualityProfile: 'high',
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

    // ⚠️ Виджетүүд MapView|SceneView хоёуланг хүлээж авдаг ч төрлийн
    //    тодорхойлолт нь MapView-г л заадаг тул нэг удаа cast хийнэ.
    const anyView = view as MapView;
    view.ui.move('zoom', 'top-right');
    view.ui.add(new Home({ view: anyView }), 'top-right');
    view.ui.add(new ScaleBar({ view: anyView, unit: 'metric', style: 'line' }), 'bottom-right');
    // Суурь зургийн галерей — Expand дотор (товч дарж дэлгэнэ).
    // Галерейн ДЭЭР «Ортофото» асаах/унтраах чагт (ортофото давхаргын ил байдал).
    const bmPanel = document.createElement('div');
    bmPanel.style.cssText = 'display:flex;flex-direction:column';
    const orthoRow = document.createElement('label');
    // ⚠️ Энэ мөр DOM-оор шууд үүсдэг ч ӨНГӨӨ токеноор авна — түүхий hex бичвэл
    //    гэрэл сэдэвт харанхуй зурвас болж, дизайн системээс сална.
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
    new BasemapGallery({ view: anyView, container: galleryDiv });
    view.ui.add(new Expand({
      view: anyView,
      content: bmPanel,
      expandIcon: 'basemap',
      expandTooltip: tr('Суурь зураг'),
    }), 'top-right');

    view.when(() => { if (!view.destroyed) setReady(true); }).catch(() => {});

    /**
     * Дарж БАРИЛГА эсвэл БҮС сонгох.
     *
     * ⚠️ Барилгыг ТЭРГҮҮНД шалгана — тэр нь бүсийн будалтын ДЭЭР зурагддаг тул
     * нүдээр барилга дээр дарсан хүн бүс сонгогдвол гайхна. Барилга олдвол
     * бүсийн сонголтыг ХӨНДӨХГҮЙ (хоёр самбар зэрэг ажиллана).
     */
    const click = view.on('click', (e: __esri.ViewClickEvent) => {
      const zoneLayer = zoneRef.current;
      const include = [bldRef.current, zoneLayer].filter(Boolean) as Layer[];
      if (!include.length) return;
      view.hitTest(e, { include })
        .then((hit) => {
          const bld = hit.results.find((r) => r.type === 'graphic' && r.graphic.layer === bldRef.current);
          if (bld && bld.type === 'graphic') {
            const oid = (bld.graphic.attributes as Record<string, unknown>)?.OBJECTID;
            if (oid != null) { cb.current.onBldClick?.(Number(oid)); return; }
          }
          cb.current.onBldClick?.(null);

          const g = hit.results.find(
            (r) => r.type === 'graphic' && (r.graphic.attributes as { zoneId?: string })?.zoneId,
          );
          const zid = g && g.type === 'graphic' ? (g.graphic.attributes as { zoneId: string }).zoneId : null;
          // ⚠️ Хассан бүсийг сонгуулахгүй — дэлгэрэнгүй самбар хоосон гарахаас сэргийлнэ
          const zr = zid ? cb.current.rows.find((x) => x.id === zid) : null;
          cb.current.onSelect(zr && !zr.excluded ? zid : null);
        })
        .catch(() => {});
    });

    /**
     * Hover панель. Барилга бүсийн дээр зурагддаг тул эхлээд барилгыг үзүүлнэ.
     * ⚠️ `hitTest` нь async тул хожуу ирсэн хуучин хариу шинийг дарахгүйн тулд
     * token-оор хамгаална.
     */
    let token = 0;
    let lastKey: string | null = null;
    const move = view.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      const my = ++token;
      // ⚠️ ДАРААЛАЛ = ЗУРАГДАХ дараалал: тээврийн дүрс хамгийн дээр зурагддаг
      //    тул hover-т ч тэргүүн ээлжинд шалгагдана.
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
            /**
             * ⚠️ Түлхүүрт БУДАЛТЫН ХУВИЛБАР (`paintVer`) орно: дүрслэл солиход
             * ИЖИЛ барилгын агуулга өөрчлөгддөг тул зөвхөн индексээр түлхүүрлэвэл
             * `lastKey` таарч, панель ХУУЧИН утгаа хадгална.
             */
            const k = `t${paintVerRef.current}${a.tKind}${a.tIdx}`;
            const tipHtml = k === lastKey ? '' : cb.current.transportTip?.(a.tKind, a.tIdx) ?? null;
            // `null` = энэ объект одоогийн дүрслэлд утгагүй → панель харуулахгүй
            if (tipHtml !== null) { key = k; html = tipHtml === '' ? null : tipHtml; }
          } else if (bld && bld.type === 'graphic') {
            const a = bld.graphic.attributes as Record<string, unknown>;
            key = `b${a.OBJECTID}`;
            if (key !== lastKey) html = cb.current.buildingTip(a);
          } else if (zone && zone.type === 'graphic') {
            const id = (zone.graphic.attributes as { zoneId: string }).zoneId;
            const r = cb.current.rows.find((x) => x.id === id);
            // ⚠️ Хассан бүс (ногоон/одоо байгаа барилга/дэд бүтэц) — hover панель харуулахгүй
            if (r && !r.excluded) { key = `z${id}`; if (key !== lastKey) html = cb.current.zoneTip(r); }
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
      if (tipEl.current) tipEl.current.hidden = true;
      lastKey = null;
    });

    return () => {
      click.remove();
      move.remove();
      leave.remove();
      /**
       * ⚠️ `view.destroy()` нь 4.17-оос хойш ӨӨРИЙН `map`-ыг ч хамт устгадаг.
       * 2D↔3D солиход Map хэвээр үлдэх ёстой тул холбоог эхлээд тасална — эс
       * бөгөөс шинэ view «The provided map is already destroyed» гэж унана.
       */
      view.container = null as unknown as HTMLDivElement;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
    };
  }, [dim]);

  /** Map-ыг компонент бүрмөсөн салахад л устгана */
  useEffect(() => () => {
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
   * ⚠️ `visible: false`-ээр нуух нь ХАНГАЛТГҮЙ: MapView нь эдгээрийг дэмждэггүй
   * тул зурагт БАЙХАД л «Failed to create layerview» өгнө.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of SCENE.layers) {
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
      if (dim === 'bim' && !existing) {
        map.add(new BuildingSceneLayer({ id: b.key, url: b.url, title: b.title, visible: true }));
      } else if (dim !== 'bim' && existing) {
        map.remove(existing);
        existing.destroy();
      }
    }
  }, [dim, ready]);

  /** BuildingExplorer виджет — ЗӨВХӨН BIM горимд (MapCanvas-тай ижил зан) */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready) return;

    const clear = () => {
      if (bimWidgetRef.current) {
        view.ui.remove(bimWidgetRef.current);
        bimWidgetRef.current.destroy();
        bimWidgetRef.current = null;
      }
    };

    if (dim !== 'bim') { clear(); return; }

    const layers = BIM.layers
      .map((b) => map.findLayerById(b.key))
      .filter((l): l is BuildingSceneLayer => l instanceof BuildingSceneLayer);
    if (!layers.length) return;

    clear();
    const widget = new BuildingExplorer({ view: view as SceneView, layers });
    view.ui.add(widget, 'top-right');
    bimWidgetRef.current = widget;

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready]);

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

  /* ── Давхаргын ил байдал (оноон будалт, шошго ч энд орно) ── */
  useEffect(() => {
    for (const [key, lyr] of Object.entries(ctxRef.current)) {
      // Лавлагааны хилүүд — каталогоос үл хамааран энэ зурагт ч үргэлж ил.
      lyr.visible = (ALWAYS_ON_IDS as readonly string[]).includes(key) || (layerOn[key] ?? false);
    }
  }, [layerOn]);

  /* ── Давхаргын ТУНГАЛАГ («Тунгалаг» цонх) ──
     ⚠️ Анхдагчийг НЭГ УДАА тогтооно: override арилахад эх утга руугаа буцна
     (барилга 0.3 — доорх бүсийн будалт нэвт харагдах ёстой). */
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

  /* ── Барилгын зориулалтын шүүлт («Барилгын ангилал» карт) ──
     ⚠️ Хоосон мөр = шүүлтгүй. `null` олговол ArcGIS өмнөх илэрхийлэлээ
     хадгалдаг тул заавал '' болгож ЦЭВЭРЛЭНЭ. */
  useEffect(() => {
    const l = bldRef.current;
    if (!l) return;
    l.definitionExpression = bldWhere ?? '';
    // ⚠️ Шүүлт идэвхтэй бол ҮЛДСЭН барилгыг тод хүрээгээр онцолно
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
      // ⚠️ Оноогүй (хассан ногоон/одоо байгаа барилга/дэд бүтэц ба жинхэнэ
      //    өгөгдөлгүй) бүсийг саарал биш ЦАЙВАР-аар — ортофото дээр тодрох.
      const noData = scoreCol === NO_DATA_COLOR;
      const col = noData ? NODATA_FILL : scoreCol;
      const isSel = selected === r.id;
      const vis = shown(r);
      /**
       * ⚠️ Шүүлтээс гарсан бүсийг ОГТ ЗУРАХГҮЙ (ArcGIS-ийн filter-ийн зан).
       * Урьд нь alpha 0.06-оор бүдгэрүүлж үлдээдэг байсан нь «шүүсэн» гэхээсээ
       * «сонгоогүй» гэж уншигдаж, зураг бөглөрөх шалтгаан болж байв.
       */
      if (!vis) continue;
      const isBagts = /багц/i.test(r.id);
      const hasSel = selected !== null;

      let alpha = noData ? ZONE_ALPHA_NODATA : ZONE_ALPHA;
      if (zoneFaint) alpha = 0.1;
      else if (hasSel && !isSel) alpha *= 0.45;

      /**
       * ⚠️ ХҮРЭЭНИЙ тунгалаг нь ДҮҮРГЭЛТЭЭС тусдаа: «Байршил» горимд дүүргэлт
       * 0.1 болтол унадаг бөгөөд хүрээг нь дагуулбал (alpha × 1.35) бүсийн зааг
       * бараг үл үзэгдэх болно. Тэнд хүрээг ТОД үлдээж, зөвхөн дүүргэлтийг
       * нэвт харуулна.
       */
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

    // ⚠️ `tKind`/`tIdx` нь hover панелийн ГАНЦ холбоос: эдгээргүй бол зурсан
    //    дүрсээс буцаад өгөгдөл рүү очих арга байхгүй.
    // Дулаан асаалттай бол дүрсүүд зөвхөн hover-ийн «баригдах гадаргуу» болно
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
    // ⚠️ ЗӨВХӨН 2D: `HeatmapRenderer` нь SceneView-д дэмжигдэхгүй тул 3D-д
    //    давхарга нэмбэл «Failed to create layerview» алдаа өгнө.
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
      // ⚠️ Дулааны гадаргуу дээгүүр hover хийхэд бүс/барилга «хаагдахгүй» байх
      //    ёстой — hitTest-д огт оруулахгүй тул `include` жагсаалтад алга.
    });

    // Бүсийн будалтын ДЭЭР, барилгын ДООР — бүсийн хил бүдэг харагдсаар байна
    const at = zoneRef.current ? map.layers.indexOf(zoneRef.current) + 1 : undefined;
    map.add(layer, at);
    heatRef.current = layer;

    /**
     * ⚠️ Нягтралын хязгаарыг (`minDensity`/`maxDensity`) ГАРААР тааруулах
     * боломжгүй: тэдгээр нь цөмийн радиус, дэлгэцийн масштаб, жингийн нэгжээс
     * нэгэн зэрэг хамаардаг. smartMapping нь харагдац бүрд тохирохыг нь бодно;
     * бид зөвхөн ӨНГИЙГ нь өөрийн шатлалаар сольж, бусад давхаргатай нэгдмэл
     * болгоно. Алдаа гарвал ArcGIS-ийн анхдагч дулааны өнгө үлдэнэ.
     */
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
      map.remove(layer);
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
   *
   * ⚠️ `bldFocus` нь ТООЛУУР: шүүлт өөрчлөгдөх бүрд өснө. `bldWhere`-ээр
   * сэрээж болохгүй — тэр нь бүсийн ангиллын шүүлтээс ч өөрчлөгддөг тул
   * хэрэглэгч бүс шүүхэд газрын зураг гэнэт үсэрнэ.
   *
   * ⚠️ Хүрээг СЕРВЭРЭЭС асууна (`queryExtent`): давхарга нь `definitionExpression`
   * -тэй тул хөтөч дээр ачаалагдсан хэсэг нь бүрэн биш байж болно.
   */
  useEffect(() => {
    const view = viewRef.current;
    const lyr = bldRef.current;
    if (!view || view.destroyed || !lyr || !ready || !bldFocus) return;
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
   *
   * ⚠️ Тодруулгыг ТУСДАА давхаргад зурна: бүсийн будалтын давхарга (`zoneLayer`)
   * оноо/шүүлт өөрчлөгдөх бүрд бүхэлдээ цэвэрлэгддэг тул тэнд зурвал тодруулга
   * санамсаргүй алга болно.
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
      {/* ⚠️ Трафикийн канвас нь `viewDiv`-ийн ДЭЭР, hover панелийн ДООР.
          3D-д хасагдана — тэнд хавтгай проекц газрын гадаргуутай нийцэхгүй. */}
      {traffic && !is3D(dim) && (
        <TrafficOverlay viewRef={viewRef} ready={ready} {...traffic} />
      )}
      <div ref={tipEl} className={s.mapTip} hidden />
    </div>
  );
}
