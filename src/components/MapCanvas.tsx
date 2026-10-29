'use client';

import {
  createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject,
} from 'react';
import { dataVersion, subscribeData } from '@/lib/dataBus';
import { useSyncRef } from '@/lib/useSyncRef';
import Map from '@arcgis/core/Map';
import { version as arcgisVersion } from '@arcgis/core/kernel';
import { t as tr, getLocaleGeneration } from '@/lib/i18nCore';
import { adoptView, parkView, shouldPark, mapStats } from './mapPark';
import { bimLayerFor, bimLayerPeek } from './bimCache';
import MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';
import type BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import { createBimPicker, type BimPicker } from './bimPicker';
import type Slide from '@arcgis/core/webscene/Slide';
import { load3d, mods3d, loadTools3d, type ModsTools } from './lazy3d';
import { applyView3d, getRender3d, manageBim, profileFor, useBimPkg, useRender3d } from './render3d';
import FeatureFilter from '@arcgis/core/layers/support/FeatureFilter';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Polygon from '@arcgis/core/geometry/Polygon';
import Point from '@arcgis/core/geometry/Point';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import BasemapGallery from '@arcgis/core/widgets/BasemapGallery';
import LocalBasemapsSource from '@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource';
import Expand from '@arcgis/core/widgets/Expand';
import type Swipe from '@arcgis/core/widgets/Swipe';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Ground from '@arcgis/core/Ground';
import type Layer from '@arcgis/core/layers/Layer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  LAYERS, LAYER_BY_ID, layerUrl, oidOf, drawOrder, DASH_PATTERN, ALWAYS_ON_IDS, REFERENCE_IDS,
  HOME, IMAGERY, ORTHO_FLIGHTS, IRGED_ORTHO_PRE, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET, IRGED_BUILT, IRGED_BUILT_DEF,
  MESH_VERSIONS, DEFAULT_MESH_VER, MESH_CMP_PREFIX, type MeshVer,
  IRGED_BUILT_MAP_HUE, REACH_BUFFERS,
  SCENE, BIM, USAN_SAN, ELEVATION_URL, ZONE_LAYER, zoneWhere,
  ZONE_FIELD, ZONE_NONE, ZONE_TYPE_EMPTY_HUE, OID, BUILDING, PARCEL_LEFT, buildingKey,
  MAP_HUE_OVERRIDES, SOURCE_FS, BASE_MAP_IDS, TOGLOOM_TYPES, srcLineWidth, facetName,
  type LayerDef,
} from '@/lib/services';
import { installEntInterceptor } from '@/lib/entInterceptor';
import { SCENE3D_LAYERS } from '@/lib/scene3d';
import {
  LAZY_END, lazyRegister, mapLayer, ensureMapLayer, lazyTop, lazyKids, lazyShowVisible, lazyAbsent, lazyReplace,
} from './lazyLayers';

void installEntInterceptor();
import { plan2dStyleOf, loadPlan2dStyle, PLAN2D_ALIASED } from '@/lib/plan2d';
import { queryExtent, queryFeatures, type Aoi } from '@/lib/query';
import { authToken } from '@/lib/authToken';
import { loadBlockProgress, cachedBlockProgress, type BlockProgressMap } from '@/lib/blockProgress';
import { webmapStyleOf, loadWebmapStyle } from '@/lib/webmapStyle';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
import { num, pct, date, text, dateLocale } from '@/lib/format';
import { registerMapView } from '@/lib/mapShots';
import s from './map.module.css';

/**
 * Газрын зургийн харагдац:
 *   · 2d  — MapView, ортофото
 *   · 3d  — SceneView, IntegratedMesh (гадна фотограмметр)
 *   · bim — SceneView, BuildingSceneLayer (зохион бүтээсэн загвар)
 */
export type Dim = '2d' | '3d' | 'bim';

/** BIM загварын хүрээнд барилгын ХЭДЭН ХУВЬ орвол нуух вэ (0–1) — `MapCanvas`-ийн BIM эффект */
const BIM_COVER = 0.5;

type BimHide = { where: string | null; complete: boolean; oid: string; byLayer: Record<string, number[]> };
let bimHideCache: { sig: string; r: BimHide } | null = null;
let bimHideFlight: { sig: string; p: Promise<BimHide> } | null = null;

/**
 * Map-ын BIM инстанц (`bimCache`, `BIM.layers` — 2026-10-14-өөс 97) — Map-д БАЙГАА эсэхээс үл хамаарна (2026-10-04: «Хурдан»-д
 * камерт ойр цөөн нь л Map-д байдаг — `manageBim`). 3D модуль ачаалагдаагүй бол хоосон.
 */
function bimAll(map: Map): BuildingSceneLayer[] {
  const m3 = mods3d();
  if (!m3) return [];
  return BIM.layers.map((b) => bimLayerFor(map, b.key, () =>
    new m3.BuildingSceneLayer({ id: b.key, url: b.url, title: b.title, visible: true })));
}
function bimLive(map: Map): BuildingSceneLayer[] {
  return BIM.layers.flatMap((b) => {
    const l = bimLayerPeek<BuildingSceneLayer>(map, b.key);
    return l ? [l] : [];
  });
}

/**
 * BIM загварын хүрээнд `BIM_COVER`-оос их орсон барилгын OID-ийн `NOT IN` шүүлт.
 */
async function computeBimHide(map: Map, bld: FeatureLayer): Promise<BimHide> {
  const bims = bimAll(map);
  const settled = await Promise.allSettled(bims.map(async (l) => { await l.load(); return { id: String(l.id), e: l.fullExtent }; }));
  const exts = settled
    .flatMap((r) => (r.status === 'fulfilled' && r.value.e ? [{ id: r.value.id, e: r.value.e }] : []))
    .map(({ id, e }) => ({ id, e: e.spatialReference?.isWebMercator ? webMercatorUtils.webMercatorToGeographic(e) as typeof e : e }))
    .filter(({ e }) => e.spatialReference?.isWGS84);
  const complete = bims.length === BIM.layers.length && exts.length === bims.length;
  await bld.load();
  const oid = bld.objectIdField;
  if (!exts.length) return { where: null, complete, oid, byLayer: {} };
  const env = new Extent({
    xmin: Math.min(...exts.map(({ e }) => e.xmin)), ymin: Math.min(...exts.map(({ e }) => e.ymin)),
    xmax: Math.max(...exts.map(({ e }) => e.xmax)), ymax: Math.max(...exts.map(({ e }) => e.ymax)),
    spatialReference: { wkid: 4326 },
  });
  const fs2 = await bld.queryFeatures({
    where: '1=1', outFields: [oid], returnGeometry: true, outSpatialReference: { wkid: 4326 },
    geometry: env, spatialRelationship: 'envelope-intersects',
  });
  const hide: number[] = [];
  const byLayer: Record<string, number[]> = {};
  for (const ft of fs2.features) {
    const b = (ft.geometry as Polygon | null)?.extent;
    const own = b ? b.width * b.height : 0;
    if (!b || own <= 0) continue;
    const by = exts.filter(({ e }) => {
      const w = Math.min(b.xmax, e.xmax) - Math.max(b.xmin, e.xmin);
      const h = Math.min(b.ymax, e.ymax) - Math.max(b.ymin, e.ymin);
      return w > 0 && h > 0 && (w * h) / own > BIM_COVER;
    });
    if (!by.length) continue;
    const id = Number(ft.attributes[oid]);
    hide.push(id);
    for (const x of by) (byLayer[x.id] ??= []).push(id);
  }
  return { where: hide.length ? `${oid} NOT IN (${hide.join(',')})` : null, complete, oid, byLayer };
}
type AnyView = MapView | SceneView;
const is3D = (d: Dim) => d === '3d' || d === 'bim';

/* ─────────────────── Map контекст ─────────────────── */

/** Идэвхтэй тодруулга — `MapCanvas` 3D-д үүнийг `definitionExpression`-д нийлүүлнэ */
export type Highlight = {
  where: string | null;
  only?: string | string[];
  /**
   * ОРОН ЗАЙН тодруулга — заасан геометртэй огтлолцохгүй объектыг бүдгэрүүлнэ
   * («Газар чөлөөлөлт»-ийн полигоноор шүүхэд). `where`-тэй хамт ч ажиллана.
   */
  geometry?: unknown;
};

/** Hide features outside a selected topic/area in plan comparisons. */
export type MapLayerFilter = {
  ids: readonly string[];
  where?: string;
  geometry?: __esri.GeometryUnion;
};

type MapApi = {
  view: AnyView | null;
  /**
   * Ангиллын тодруулга (SQL where). null = цуцлах. Таарахгүйг БҮДГЭРҮҮЛНЭ.
   * `onlyLayerIds` заавал бол ЗӨВХӨН тэдгээр давхаргад хэрэглэнэ — шүүлтийн
   * талбар бусад давхаргад байхгүй үед (жишээ нь `Barilga_ty` нь бүсийн давхаргад
   * байхгүй) featureEffect унахаас сэргийлнэ. Нэг эсвэл олон давхарга. Заагаагүй
   * бол бүх давхаргад.
   */
  setHighlight: (where: string | null, onlyLayerIds?: string | string[], geometry?: unknown) => void;
  /** Идэвхтэй тодруулга — 3D-д `MapCanvas` өөрөө хэрэгжүүлэхэд хэрэгтэй */
  highlight: Highlight;
  /** Давхаргыг бүхэлд нь харагдах хүрээнд нь аваачих */
  zoomToLayer: (id: string) => void;
  /** Тодорхой бүсийн хүрээнд аваачих */
  zoomToZone: (zone: string) => void;
  /**
   * Давхаргын ЯГ ТЭР объект(ууд) руу ойртох — хайлтын үр дүнд шилжихэд.
   * `animate: false` — шууд үсэрнэ (нэг жагсаалтаар дараалан товшиход
   * анимаци нь хойшлол мэт мэдрэгддэг).
   */
  zoomToWhere: (layerId: string, where: string, opts?: { animate?: boolean }) => void;
  /**
   * Давхаргыг СЕРВЕРЭЭС ДАХИН УНШУУЛНА — атрибут гаднаас засагдсаны дараа.
   */
  refreshLayer: (layerId: string) => void;
  /**
   * ОРТОФОТО ил эсэх ба түүнийг унтраах/асаах.
   */
  ortho: boolean;
  setOrtho: (v: boolean) => void;
  /**
   * БҮСИЙН ОРОН ЗАЙН МАСК — сонгосон бүс(үүд)ийн нэгтгэсэн полигон. `ZONE_ID`-гүй
   * (noZone) давхаргуудыг атрибутаар шүүх боломжгүй тул 2D-д энэ геометрээр
   * `featureEffect` бүдгэрүүлэлт хийнэ — суурь давхаргууд ч бүсээр «шүүгдэнэ».
   * MapCanvas бүс өөрчлөгдөхөд бөглөнө; тодруулгын эффекттэй НЭГ давталтад
   * нийлдэг тул хоёр эзэн нэг шинж дээр зөрчилдөхгүй.
   */
  setZoneMask: (g: unknown) => void;
};

const Ctx = createContext<MapApi>({
  view: null, setHighlight: () => {}, highlight: { where: null },
  zoomToLayer: () => {}, zoomToZone: () => {},
  zoomToWhere: () => {},
  refreshLayer: () => {},
  ortho: false, setOrtho: () => {},
  setZoneMask: () => {},
});

const RegisterCtx = createContext<(view: AnyView | null) => void>(() => {});

export const useMap = () => useContext(Ctx);

/* ─────────────────── Симбол ─────────────────── */

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/**
 * План2d-ийн esriPFS текстурын СУУРЬ өнгө — inline SVG (base64 data URI)-ийн
 * эхний `fill="#…"` (дэвсгэр rect). SceneView зурган дүүргэлт дэмждэггүй тул
 * BIM-д энэ өнгөөр цул дүүргэлт хийж 2D план map-тай ижил харагдуулна.
 */
function pfsBaseColor(url: string | undefined): string | null {
  if (!url?.startsWith('data:image/svg+xml;base64,')) return null;
  try {
    const m = /fill="(#[0-9a-fA-F]{6})"/.exec(atob(url.split(',')[1]));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const c = (hex: string, a = 1): number[] => [...rgb(hex), a];
const cim = (hex: string, a = 1): number[] => [...rgb(hex), Math.round(a * 100)];

const OUTLINE_SCALE = 0.55;
/** Outline өргөнийг нэг мөр нарийсгана */
const ow = (w: number) => w * OUTLINE_SCALE;

/**
 * Полигон — нам дүүргэлт + нимгэн ТОД хүрээ.
 */
const fill = (hex: string, a = 0.3, w = 0.9) =>
  ({ type: 'simple-fill', color: c(hex, a), outline: { color: c(hex, 1), width: ow(w) } }) as const;

/**
 * Шугам — нимгэн зураас + нарийн бараан хүрээлэл (casing).
 *
 * Шугаман давхаргад дүүргэлт байхгүй тул харагдац нь БҮХЭЛДЭЭ зураасаас хамаарна.
 * Ортофото нарийн бүтэцтэй тул дан нимгэн зураас түүн дээр тасарч алга болдог;
 * зузаалах нь шийдэл биш (зураг бөглөрнө). Доор нь бараан хагас тунгалаг
 * хүрээлэл тавьж дэвсгэрээс ТАСЛАНА — картографийн стандарт арга.
 */
const line = (hex: string, w = 1.4, dash: NonNullable<LayerDef['dash']> = 'solid', alpha = 1) => {
  const pattern = DASH_PATTERN[dash];
  // Цэгэн хээнд Round үзүүр; бусад тасархайд Butt — Round нь богино зураасыг
  // хоёр талаас сунгаж `dot` ба `dash`-ыг ялгагдахгүй болгоно.
  const capStyle = dash === 'dot' || dash === 'solid' ? 'Round' : 'Butt';
  const effects = pattern
    ? [{ type: 'CIMGeometricEffectDashes', dashTemplate: pattern, lineDashEnding: 'NoConstraint' }]
    : undefined;
  const stroke = (width: number, color: number[]) => ({
    type: 'CIMSolidStroke', enable: true, capStyle, joinStyle: 'Round', width, color,
    ...(effects ? { effects } : {}),
  });
  return {
    type: 'cim',
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMLineSymbol',
        symbolLayers: [stroke(ow(w), cim(hex, alpha)), stroke(ow(w) * 1.8, cim('#0b1220', 0.4))],
      },
    },
  } as const;
};

/** Цэг — цагаан хүрээтэй; хэлбэрээр нь сэдэв доторх давхаргууд ялгарна */
const dot = (hex: string, size = 9, marker: NonNullable<LayerDef['marker']> = 'circle') =>
  ({
    type: 'simple-marker', style: marker, size,
    color: c(hex, 0.95),
    outline: { color: [255, 255, 255, 0.9], width: ow(1.4) },
  }) as const;

/**
 * НҮХЭН ЖОРЛОНГИЙН ЦЭГ — 1,675 объект, ХАМГИЙН ЭНГИЙН дүрслэл: жижиг дугуй.
 */
const toiletDot = (hex: string) =>
  ({
    type: 'simple',
    symbol: {
      type: 'simple-marker',
      style: 'circle',
      size: 3,
      color: c(hex, 0.9),
      outline: { width: 0 },
    },
  }) as unknown as RendererProp;

/**
 * Кластерын бүтэн тодорхойлолт (`toiletCluster`, `TOILET_CLUSTER_SCALE`)
 * git түүхэнд үлдсэн — буцаах бол тэндээс.
 */

/**
 * ГЭРЭЛТҮҮЛЭГ — МАСШТАБААС хамаарна (ArcGIS-ийн scale-dependent effect).
 */
/**
 * ГЭР ХОРООЛЛЫН БАРИЛГА — гэрэлтэх эффект (2026-09-02).
 */
const BUILT_EFFECT = [
  { scale: 20_000, value: 'bloom(0, 0.3px, 0.3)' },
  { scale: 6_000, value: 'bloom(0.12, 0.35px, 0.25)' },
  { scale: 1_500, value: 'bloom(0.22, 0.4px, 0.2)' },
] as unknown as __esri.Effect;

const TOILET_EFFECT = [
  { scale: 20_000, value: 'bloom(0.3, 0.45px, 0.3)' },
  { scale: 8_000, value: 'bloom(0.5, 0.45px, 0.25)' },
  { scale: 2_500, value: 'bloom(0.8, 0.5px, 0.18)' },
  { scale: 1_000, value: 'bloom(1.2, 0.55px, 0.1)' },
] as unknown as __esri.Effect;

/**
 * НҮХЭН ЖОРЛОН — 3D-гийн ХОЛЫН тэмдэг: газраас БАГА ЗЭРЭГ хөвсөн дугуй.
 */
const toiletIcon3D = (hex: string) =>
  ({
    type: 'simple',
    symbol: {
      type: 'point-3d',
      symbolLayers: [{
        type: 'icon',
        resource: { primitive: 'circle' },
        material: { color: c(hex, 0.9) },
        outline: { color: [255, 255, 255, 0.45], size: 0.5 },
        size: 7,
      }],
      verticalOffset: { screenLength: 8, minWorldLength: 2, maxWorldLength: 15 },
    },
  }) as unknown as RendererProp;

/**
 * НҮХЭН ЖОРЛОН — 3D-д ОЙРООС харагдах callout тэмдэг (бөмбөлөг + доош шугам).
 */
const toiletPin = (hex: string) =>
  ({
    type: 'simple',
    symbol: {
      type: 'point-3d',
      symbolLayers: [{
        type: 'object',
        resource: { primitive: 'sphere' },
        material: { color: hex },
        width: 3, height: 3, depth: 3,
      }],
      verticalOffset: { screenLength: 24, minWorldLength: 6, maxWorldLength: 40 },
      callout: {
        type: 'line',
        size: 1.4,
        color: hex,
        border: { color: [255, 255, 255, 0.75] },
      },
    },
  }) as unknown as RendererProp;

/**
 * Цэг ↔ callout СОЛИГДОХ масштаб.
 */
const TOILET_PIN_ID = 'irged:toilet-pin';
const TOILET_PIN_SCALE = 1_000;

type RendererProp = NonNullable<__esri.FeatureLayerProperties['renderer']>;

const simple = (sym: unknown) => ({ type: 'simple', symbol: sym }) as unknown as RendererProp;

/**
 * МАСШТАБТ УЯГДСАН ЦЭГ — зум ойртуулахад маркер ГАЗРЫН ХЭМЖЭЭГЭЭР томорно
 * (2026-09-11, хэрэглэгчийн хүсэлт: ХТП/РП «дээрх зургаар оруулсан хэмжээнд
 * масштаб тэгж»).
 */
const scaledDot = (hex: string, marker: NonNullable<LayerDef['marker']> = 'circle') => ({
  type: 'simple',
  symbol: {
    type: 'simple-marker',
    style: marker,
    color: c(hex, 0.95),
    outline: { color: [255, 255, 255, 0.9], width: ow(0.8) },
  },
  visualVariables: [{
    type: 'size',
    valueExpression: '$view.scale',
    stops: [
      { value: 18_000, size: 3.5 },
      { value: 2_300, size: 5.5 },
      { value: 560, size: 9 },
      { value: 280, size: 13 },
    ],
  }],
}) as unknown as RendererProp;


/** Каталогийн тодорхойлолтоос симбол — зураг ба тайлбар нэг эх сурвалжтай */
const LINE_PX = 1;
const DOT_SCALE = 0.7;

/**
 * IoT МЭДРЭГЧИЙН 3D СИМБОЛ — газраас дээш өргөгдсөн «радар» тэмдэг.
 *
 * Хоёр хэсэгтэй:
 *   · `verticalOffset` — тэмдгийг гадаргаас ДЭЭШ өргөнө (дэлгэцийн 44px,
 *     бодит ертөнцөд 18…160м-ээр хязгаарлана: ойртоход тэнгэрт хөвөхгүй,
 *     холдоход газарт булагдахгүй).
 *   · `callout` — өргөгдсөн тэмдгээс ГАЗАР хүртэл татагдах НАРИЙН шугам.
 *     Энэ нь ArcGIS-ийн стандарт «leader line»; гараар цилиндр зурахаас
 *     хамаагүй хямд бөгөөд өнцөг эргүүлэхэд ҮРГЭЛЖ босоо хэвээр байна.
 */
const RADAR_LIFT = 44;
export const radarSymbol = (hue: string) => {
  const [r, g, b] = rgb(hue);
  const ring = (size: number, fillA: number, lineA: number, lineW: number) => ({
    type: 'icon',
    resource: { primitive: 'circle' },
    size,
    material: { color: [r, g, b, fillA] },
    outline: { color: [r, g, b, lineA], size: lineW },
  });
  return {
    type: 'point-3d',
    symbolLayers: [
      /* гадна долгион — хамгийн том, бараг тунгалаг */
      ring(30, 0.08, 0.30, 1),
      /* дунд долгион */
      ring(19, 0.16, 0.55, 1),
      /* цөм — цул, цагаан хүрээтэй (аль ч дэвсгэр дээр ялгарна) */
      {
        type: 'icon',
        resource: { primitive: 'circle' },
        size: 9,
        material: { color: [r, g, b, 1] },
        outline: { color: [255, 255, 255, 0.9], size: 1 },
      },
    ],
    verticalOffset: { screenLength: RADAR_LIFT, minWorldLength: 18, maxWorldLength: 160 },
    callout: {
      type: 'line',
      size: 1,
      color: [r, g, b, 0.85],
      /* Цайвар хүрээ — бараан меш дээр шугам уусахаас сэргийлнэ */
      border: { color: [255, 255, 255, 0.45] },
    },
  } as unknown as __esri.Symbol3DProperties;
};


/**
 * ЭХ ҮЙЛЧИЛГЭЭНИЙ СИМБОЛ — ArcGIS-ийн зурагтай ЯГ ИЖИЛ (2026-09-14).
 */
const srcSymbol = (d: LayerDef, hue: string) =>
  d.geom === 'line'
    ? ({
        type: 'simple-line', color: c(hue, 1), style: d.dash ?? 'solid',
        width: srcLineWidth(d.width),
      } as const)
    : d.geom === 'point'
      ? ({
          type: 'simple-marker', style: d.marker ?? 'circle',
          size: Math.max(4, d.size ?? 4), color: c(hue, 1), outline: { width: 0 },
        } as const)
      : ({
          type: 'simple-fill', color: c(hue, d.fill ?? 0.3),
          outline: {
            color: c(d.stroke ?? hue, 1),
            width: Math.max(0.9, d.width ?? 0.9),
            style: d.strokeDash ?? 'solid',
          },
        } as const);

export const symbolOf = (d: LayerDef, hue = d.hue) => {
  const plan = d.topic === 'plan';
  if (d.srcSym) return srcSymbol(d, hue);
  return d.geom === 'line'
    ? line(hue, plan ? LINE_PX : (d.width ?? 1.4), d.dash ?? 'solid')
    : d.geom === 'point'
      ? dot(hue, (d.size ?? 9) * (plan ? DOT_SCALE : 1), d.marker ?? 'circle')
      : fill(hue, d.fill ?? 0.3, d.width ?? 0.9);
};

/**
 * Дашбоардын бүс — эх webmap-тай ижил, Angilal ангилал БҮР өөрийн өнгөтэй.
 * `uniform` горимд бүсийн давхаргад ашиглана.
 */
/**
 * `paint.values`-ийн ТҮЛХҮҮРИЙГ талбарын төрөлд тааруулна (2026-09-15).
 */
const paintValue = (v: string): string | number => (
  /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
);

const zoneTypeRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint?.field ?? 'angilal',
  defaultSymbol: symbolOf(d, d.paint?.defaultHue ?? ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint?.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint?.values ?? {}).map(([value, hue]) => ({
    value: paintValue(value),
    label: d.paint?.labels?.[value] ?? value,
    symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);

/**
 * `paint.values`-аар ангилал бүрийг өнгөөр ялгах unique-value renderer.
 */
const paintRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint!.field,
  defaultSymbol: symbolOf(d, d.paint!.defaultHue ?? ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint!.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint!.values).map(([value, hue]) => ({
    value: paintValue(value),
    label: d.paint!.labels?.[value] ?? value,
    symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);


/**
 * Гүйцэтгэлийн өнгө (0–100%): ШАР → ногоон. Хоёр хэсэгт шугаман
 * интерполяци — блок бүрд тасралтгүй өнгө өгнө (unique-value симбол болгонд).
 *
 *   1. ӨНГӨНИЙ ДАВХЦАЛ. «Үлдсэн нэгж талбар» (`#e11d48`) ба түүнийг сонгоход
 *      тодруулах өнгө (`#dc2626`) хоёулаа улаан тул газрын зураг дээр
 *      «баригдаж буй барилга» ба «саад болж буй талбар» хоёр ялгагдахгүй.
 *   2. УТГЫН АЛДАА. Улаан нь энэ аппд АЛДАА/САААДЫГ заадаг. Гэтэл сая эхэлсэн
 *      барилгын 0% нь алдаа биш — хэвийн эхлэл. Барилга нь ЭХЛЭЭГҮЙ-гээс
 *      ДУУССАН руу явах аяллыг шар → ногоон дулаан-хүйтэн шилжилт илэрхийлнэ.
 *
 * Улаан одоо ЗӨВХӨН газар чөлөөлөлтийн саадыг заана.
 */
const PROG_STOPS: [number, [number, number, number]][] = [
  [0, [250, 204, 21]],   // #facc15 шар — эхлээгүй
  [50, [163, 230, 53]],  // #a3e635 шаргал ногоон — дунд шат
  [100, [22, 163, 74]],  // #16a34a ногоон — дууссан
];
const progColor = (v: number): [number, number, number] => {
  const x = Math.max(0, Math.min(100, v));
  for (let i = 1; i < PROG_STOPS.length; i++) {
    const [p1, c1] = PROG_STOPS[i - 1];
    const [p2, c2] = PROG_STOPS[i];
    if (x <= p2) {
      const f = (x - p1) / (p2 - p1 || 1);
      return [0, 1, 2].map((k) => Math.round(c1[k] + (c2[k] - c1[k]) * f)) as [number, number, number];
    }
  }
  return PROG_STOPS[PROG_STOPS.length - 1][1];
};

/**
 * `mon:building` давхаргын renderer — блок бүрийг НИЙТ ГҮЙЦЭТГЭЛЭЭР өнгөлнө
 * («Б. Барилга угсралтын ажил» мөрийн утга). Мэдээлэлгүй блок → бүдэг саарал.
 */
const buildingProgressRenderer = (prog: BlockProgressMap): RendererProp => ({
  type: 'unique-value',
  // `bagtsKey`/`blockKey`-ийн Arcade хувилбар — тэмдэгт хасаж том үсгээр.
  valueExpression:
    `Upper(Replace(Replace(Replace($feature.${BUILDING.fields.bagts}, " ", ""), ".", ""), "-", ""))` +
    ` + "|" + Split(Trim($feature.${BUILDING.fields.block}), " ")[0]`,
  defaultSymbol: { type: 'simple-fill', color: c('#94a3b8', 0.22), outline: { color: c('#94a3b8', 0.9), width: ow(0.8) } },
  defaultLabel: tr('Мэдээлэлгүй'),
  uniqueValueInfos: [...prog.entries()].map(([key, p]) => {
    const [r, g, b] = progColor(p.overall);
    return {
      value: key,
      label: `${key.split('|')[1]} · ${Math.round(p.overall)}%`,
      symbol: { type: 'simple-fill', color: [r, g, b, 0.62], outline: { color: [r, g, b, 1], width: ow(1) } },
    };
  }),
} as unknown as RendererProp);

/* ══════════ Хүүхдийн тоглоом (`tgl`) — 100% БОДИТ харагдах симбол ══════════ */

/**
 * Esri Recreation Style-ийн БОДИТ 3D загваруудын рендер зураг (static.arcgis.com,
 * CORS нээлттэй — модны GLB-тэй ижил host). Схем дүрс БИШ, жинхэнэ тоглоомын
 * төхөөрөмжийн фотореал дүрс (хэрэглэгчийн хүсэлт, 2026-08-10):
 *   · Гулгуур → Slide · Дүүжин → Swing · Том гулсууран → Jungle_Gym
 */
const TOGL_IMG: Record<'slide' | 'swing' | 'set', string> = {
  slide: 'https://static.arcgis.com/arcgis/styleItems/Recreation/thumbnails/Slide.png',
  swing: 'https://static.arcgis.com/arcgis/styleItems/Recreation/thumbnails/Swing.png',
  set: 'https://static.arcgis.com/arcgis/styleItems/Recreation/thumbnails/Jungle_Gym.png',
};

/** BIM (SceneView)-д тавих ЖИНХЭНЭ 3D загваруудын web style нэр — 2D зургуудын эх */
const TOGL_STYLE: Record<'slide' | 'swing' | 'set', string> = {
  slide: 'Slide',
  swing: 'Swing',
  set: 'Jungle_Gym',
};

/**
 * `tgl3d` (BIM) renderer — Esri Recreation web style-ийн бодит 3D моделууд.
 * Size визуал хувьсагч нь ӨНДРИЙГ метрээр өгнө (анхдагчаас ~35% том, хэрэглэгчийн
 * хүсэлт) — харьцаа нь моделоос хадгалагдана.
 */
function togl3dRenderer(): RendererProp {
  return {
    type: 'unique-value',
    field: 'type',
    uniqueValueInfos: TOGLOOM_TYPES.map((t) => ({
      value: t.value,
      label: t.value,
      symbol: { type: 'web-style', styleName: 'EsriRecreationStyle', name: TOGL_STYLE[t.kind] },
    })),
    visualVariables: [{
      type: 'size',
      axis: 'height',
      valueUnit: 'meters',
      valueExpression:
        `When($feature.type == 'Гулгуур', 4, $feature.type == 'Дүүжин', 3.6, 5.5)`,
    }],
  } as unknown as RendererProp;
}

/**
 * `tgl`-ийн renderer — `type`-аар unique-value, бодит загварын рендер зургууд.
 */
function toglRenderer(basePx: number): RendererProp {
  // Төрөл бүрийн харьцаа — том цогцолбор арай том, гулгуур арай нарийн
  const RATIO: Record<string, number> = { slide: 0.85, swing: 0.95, set: 1.1 };
  return {
    type: 'unique-value',
    field: 'type',
    uniqueValueInfos: TOGLOOM_TYPES.map((t) => {
      const s = Math.round(basePx * RATIO[t.kind] * 10) / 10;
      return {
        value: t.value,
        label: t.value,
        symbol: {
          type: 'picture-marker',
          url: TOGL_IMG[t.kind],
          width: `${s}px`,
          height: `${s}px`,
        },
      };
    }),
  } as unknown as RendererProp;
}

/** Масштаб → tgl дүрсийн суурь px (хязгаартай — хэт жижиг/том болохгүй) */
const toglPx = (scale: number) => Math.max(2.5, Math.min(90, 61000 / Math.max(scale, 1)));

/**
 * Давхаргын хүрээг зургийн проекцоор.
 */
/**
 * Эхлэх хүрээний МОДУЛИЙН кэш — бүсийн давхаргын хүрээ статик тул нэг л удаа
 * query хийж, 2D↔3D солих бүрд дахин татахгүй, дахин үсрэхгүй.
 */
let homeExtentCache: Extent | null = null;

let tabParked3d: AnyView | null = null;

/** SceneView-ийн анхны камер — шинэ view ба таб солихоор авсан view ХОЁУЛАНД ижил */
const INITIAL_CAMERA_3D = () => ({
  position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
  tilt: 62, heading: 0,
});

/**
 * Map-ын МОДУЛИЙН кэш — навбараас сэдэв солиход зураг дахин үүсэхээс сэргийлнэ.
 */
const mapCache: Record<string, Map> = {};

const authedLayers = new WeakSet<FeatureLayer>();

/**
 * УНАСАН ДАВХАРГЫГ ДАХИН ҮҮСГЭНЭ — `true` = ядаж нэгийг сольсон.
 */
const RECREATE_TYPES = new Set(['feature', 'map-image', 'imagery', 'vector-tile', 'tile']);
/** `clone()`-гүй давхаргыг ижил тохиргоогоор шинээр — url · id · title · visible · opacity · listMode */
function rebuild(old: Layer): Layer | null {
  const o = old as unknown as { url?: string; title?: string; visible?: boolean; opacity?: number; listMode?: string; constructor: new (p: object) => Layer };
  if (!o.url) return null;
  try {
    return new o.constructor({ url: o.url, id: old.id, title: o.title, visible: o.visible, opacity: o.opacity, listMode: o.listMode });
  } catch {
    return null;
  }
}
/** «Дахин оролдох»-оор (`recreateFailedLayers`) шинээр үүсгэсэн инстанцууд — 3D-ийн `unstick` хөндөхгүй */
const retriedLayers = new WeakSet<Layer>();

/**
 * ИТГЭМЖЛЭЛ ХҮЛЭЭЖ БУЙ ҮЙЛЧИЛГЭЭНИЙ ҮНДЭС (2026-10-19) — `IdentityManager`-ийн хүлээгдэж буй нэвтрэлтийн хүсэлтүүд
 * (`_busy` · `_soReqs` · `_xoReqs`, 4.34-ийн эх код). `null` = дотоод бүтэц танигдсангүй (SDK шинэчлэгдсэн).
 */
function authPendingRoots(esriId: unknown): Set<string> | null {
  const im = esriId as { _busy?: { resUrl_?: unknown } | null; _soReqs?: unknown; _xoReqs?: unknown } | null;
  if (!im || !Array.isArray(im._soReqs) || !Array.isArray(im._xoReqs)) return null;
  const out = new Set<string>();
  for (const r of [im._busy, ...im._soReqs, ...im._xoReqs] as Array<{ resUrl_?: unknown } | null | undefined>) {
    if (typeof r?.resUrl_ === 'string') out.add(serviceRoot(r.resUrl_));
  }
  return out;
}
/** URL → үйлчилгээний үндэс (`…/FeatureServer` хүртэл, жижиг үсгээр) */
function serviceRoot(url: string): string {
  const u = url.split('?')[0].toLowerCase();
  const m = /^(.*?\/(?:feature|map|image|vectortile|scene)server)\b/.exec(u);
  return m ? m[1] : u.replace(/\/\d+\/?$/, '');
}

function recreateFailedLayers(map: Map | null | undefined): boolean {
  if (!map || map.destroyed) return false;
  const failed = map.allLayers.filter((l) =>
    l.loadStatus === 'failed'
    && RECREATE_TYPES.has(l.type)
    && !String(l.id).startsWith('scene:')).toArray();
  const freshOf = (old: Layer): Layer | null => {
    const clone = (old as unknown as { clone?: () => Layer }).clone;
    try { return typeof clone === 'function' ? clone.call(old) : rebuild(old); } catch { return null; }
  };
  let n = 0;
  for (const old of failed) {
    const parent = (old as unknown as { parent?: { layers?: __esri.Collection<Layer> } }).parent;
    const coll = parent?.layers;
    if (!coll || typeof coll.indexOf !== 'function') continue;
    const at = coll.indexOf(old);
    if (at < 0) continue;
    const fresh = freshOf(old);
    if (!fresh) continue;
    fresh.id = old.id;
    retriedLayers.add(fresh);
    coll.remove(old);
    coll.add(fresh, at);
    lazyReplace(map, old, fresh);
    n += 1;
  }
  for (const old of lazyAbsent(map)) {
    if (old.loadStatus !== 'failed' || !RECREATE_TYPES.has(old.type)) continue;
    const fresh = freshOf(old);
    if (!fresh) continue;
    fresh.id = old.id;
    retriedLayers.add(fresh);
    lazyReplace(map, old, fresh);
    n += 1;
  }
  return n > 0;
}

/**
 * View-г КЭШИЙН Map-аас салгаж устгана.
 */
function destroyDetached(v: AnyView): void {
  if (tabParked3d === v) tabParked3d = null;
  if (v.destroyed) return;
  v.container = null as unknown as HTMLDivElement;
  (v as unknown as { map: Map | null }).map = null;
  v.destroy();
}

/**
 * Web scene JSON-ы `elevationInfo.mode` нь camelCase (`onTheGround`) ирдэг ч
 * JS API нь kebab-case (`on-the-ground`) хүлээдэг тул хөрвүүлнэ (offset/unit хэвээр).
 */
const ELEV_MODE: Record<string, string> = {
  onTheGround: 'on-the-ground',
  relativeToGround: 'relative-to-ground',
  absoluteHeight: 'absolute-height',
  relativeToScene: 'relative-to-scene',
};
function sceneElevInfo(raw: unknown): __esri.FeatureLayerProperties['elevationInfo'] {
  const e = (raw ?? {}) as { mode?: string };
  const mode = (ELEV_MODE[e.mode ?? ''] ?? e.mode ?? 'on-the-ground');
  return { ...e, mode } as __esri.FeatureLayerProperties['elevationInfo'];
}

async function extentOf(url: string, view: AnyView, where = '1=1', token?: string): Promise<Extent | null> {
  const wkid = view.spatialReference?.wkid ?? 102100;
  const box = await queryExtent(url, wkid, where, token);
  if (!box) return null;
  return new Extent({
    xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax,
    spatialReference: view.spatialReference ?? { wkid },
  });
}

/** Бүтэн дэлгэцийн товчны нэр/төлөв — toggle (`aria-pressed`), гарах үед «Бүтэн дэлгэцээс гарах» (2026-10-09) */
function paintFsBtn(btn: HTMLElement, on: boolean): void {
  const label = on ? tr('Бүтэн дэлгэцээс гарах (Esc)') : tr('Бүтэн дэлгэц');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(on));
}

/** Бүсийн шошго — цагаан halo-той тул аль ч дэвсгэрт уншигдана */
const zoneLabels = () =>
  [
    {
      labelExpressionInfo: { expression: `Trim(Text($feature.${ZONE_LAYER.zoneField ?? ZONE_FIELD}))` },
      symbol: {
        type: 'text',
        color: c('#111827'),
        haloColor: [255, 255, 255, 0.92],
        haloSize: 1.7,
        font: { size: 10, weight: 'bold' },
      },
      labelPlacement: 'always-horizontal',
      minScale: 14000,
    },
  ] as unknown as __esri.LabelClassProperties[];

/**
 * Эх үүсвэрийн шошго — байгууламжийн нэр. Жижиг фонт дээр ЗУЗААН halo нь
 * үсэг бүрийг «хоёр давхар/echo» мэт харуулдаг тул halo-г НИМГЭН (0.5) болгож,
 * дедупликаци асаав — нэр яг НЭГ л удаа, цэвэр гарна.
 */
const sourceLabels = () =>
  [
    {
      labelExpressionInfo: { expression: `Trim(Text($feature['${SOURCE_FS.fields.name}']))` },
      symbol: {
        type: 'text',
        color: c('#0f172a'),
        haloColor: [255, 255, 255, 1],
        haloSize: 0.5,
        font: { size: 9, weight: 'normal' },
      },
      labelPlacement: 'always-horizontal',
      deconflictionStrategy: 'static',
      repeatLabel: false,
      minScale: 20000,
    },
  ] as unknown as __esri.LabelClassProperties[];

/**
 * Анхдагч суурь зураг — ХИЙМЭЛ ДАГУУЛ (2026-09-03, хэрэглэгчийн хүсэлт).
 */
const baseMap = () => Basemap.fromId('satellite');

/**
 * КОДЫН `svm.cancel` — `flag` асаалттай үед дуудна (`selfCancelRef`-ийн тайлбар).
 */
function quietCancel(svm: SketchViewModel | null | undefined, flag: { current: boolean }): void {
  if (!svm) return;
  flag.current = true;
  try { svm.cancel(); } catch { /* идэвхтэй зураалт байхгүй */ }
  finally { flag.current = false; }
}

let sketchMod: typeof SketchViewModel | null = null;
let sketchP: Promise<void> | null = null;
function loadSketchMod(): Promise<void> {
  sketchP ??= import('@arcgis/core/widgets/Sketch/SketchViewModel')
    .then((m) => { sketchMod = m.default; })
    .catch((e: unknown) => { sketchP = null; throw e; });
  return sketchP;
}
let swipeMod: typeof Swipe | null = null;
let swipeP: Promise<void> | null = null;
function loadSwipeMod(): Promise<void> {
  swipeP ??= import('@arcgis/core/widgets/Swipe')
    .then((m) => { swipeMod = m.default; })
    .catch((e: unknown) => { swipeP = null; throw e; });
  return swipeP;
}

/**
 * ХАРАГДАЦЫН СУУРЬ ЗУРАГ солих (2026-09-24). «Инженерийн дэд бүтэц» нь
 * LIGHT GRAY CANVAS (`gray-vector`) суурьтай — нарийн сүлжээний шугам хиймэл
 * дагуулын эрээн дэвсгэр дээр уншигдахгүй. Бусад нь хиймэл дагуул.
 */
const basemapPage = new WeakMap<object, string>();

export function applyViewBasemap(
  v: AnyView | null, id: 'satellite' | 'gray-vector', page: string,
): void {
  const map = v?.map;
  if (!map) return;
  if (basemapPage.get(map) === page) return;
  basemapPage.set(map, page);
  if (map.basemap?.id === id) return;
  const bm = Basemap.fromId(id);
  if (bm) map.basemap = bm;
}

/* ─────────────────── Давхарга үүсгэх ─────────────────── */

export const IMAGERY_ID = 'imagery';

/** `localStorage` түлхүүр — 3D мешийн сонгосон хувилбар */
const MESH_VER_KEY = 'selbe-mesh-ver';

/**
 * НИСЛЭГИЙН ТОВЧНУУД — зургийн доод голд, дарааллаар (Нислэг 1 → Нислэг 2).
 */
const FLIGHTS: MeshVer[] = ['old', 'new'];

/** Нислэгийн ортофото тайлын id — `imagery:f:<нислэг>:<key>` (IMAGERY_ID бүлгийн хүүхэд, `ORTHO_FLIGHTS`) */
const orthoFlightId = (ver: MeshVer, key: string): string => `${IMAGERY_ID}:f:${ver}:${key}`;
const orthoFlightVer = (id: string): MeshVer | null => {
  const m = new RegExp(`^${IMAGERY_ID}:f:(old|new):`).exec(id);
  return m ? (m[1] as MeshVer) : null;
};

/**
 * Хоёр хувилбарын (шинэ · хуучин) БҮХ меш id — байнгын `scene:<key>` ба
 * харьцуулалтын `mesh:cmp:<key>`. PASSIVE ба NO_HIGHLIGHT хоёулаа хэрэглэнэ.
 */
const MESH_VER_IDS = Object.values(MESH_VERSIONS).flatMap((v) =>
  v.layers.flatMap((l) => [`scene:${l.key}`, `${MESH_CMP_PREFIX}${l.key}`]));

/**
 * Алдааны мэдээнд харуулах ХОСТ — бодит давхаргын URL-ээс.
 */
const hostOf = (u: string | undefined): string => {
  if (!u) return '—';
  try { return new URL(u).host; } catch { return u; }
};

/** Дарж сонгогдохгүй давхаргууд (popup, hit-test, тайлбарт орохгүй) */
const PASSIVE = new Set<string>([
  'sketch',
  IMAGERY_ID,
  // Нүхэн жорлон — зөвхөн байршил харуулна; дарахад атрибут гарах ЁСГҮЙ
  IRGED_TOILET.id,
  TOILET_PIN_ID,
  // Гэр хорооллын барилга — зөвхөн байршил/төрөл; атрибут ил гаргахгүй
  IRGED_BUILT.id,
  IRGED_ROAD.id,
  IRGED_ORTHO_PRE.id,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...IRGED_SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
  // Меш хувилбарууд ба харьцуулалтын меш — зөвхөн харах, дарж сонгогдохгүй
  ...MESH_VER_IDS,
  // Лавлагааны хилүүд — дарж сонгогдохгүй, доорх объектыг халхлахгүй.
  ...REFERENCE_IDS,
]);

/**
 * ТОДРУУЛГАД (`featureEffect`) ОРОЛЦОХГҮЙ давхаргууд — `PASSIVE`-ЭЭС ТУСДАА.
 */
const NO_HIGHLIGHT = new Set<string>([
  'sketch',
  IMAGERY_ID,
  IRGED_ROAD.id,
  IRGED_ORTHO_PRE.id,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...IRGED_SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
  ...MESH_VER_IDS,
  ...REFERENCE_IDS,
]);

/**
 * 3D-д вектор давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 */
const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

/**
 * 3D-д вектор давхаргыг МЕШИЙН ГАДАРГУУ дээр наана.
 */
const ON_SCENE = {
  mode: 'relative-to-scene',
  featureExpressionInfo: { expression: '0' },
} as unknown as __esri.FeatureLayerProperties['elevationInfo'];
/** `elevationInfo.featureExpressionInfo.expression` — горимыг дахин оноох эсэхийг жишихэд */
const elevExpr = (e: unknown): string | null =>
  ((e as { featureExpressionInfo?: { expression?: string } | null } | null)?.featureExpressionInfo?.expression ?? null);

/**
 * @param uniform — давхарга бүрийг ГАНЦ жигд өнгөөр (өөрийн `hue`) зурна;
 *   ангиллаар (TOROL, Barilga_ty) олон өнгө хуваахгүй. Ерөнхий дашбоардад
 *   давхаргууд нэг нэг өнгөтэй байх ёстой — cross-filter нь тодорхой болно.
 */
/**
 * Давхаргын `outFields` — payload багасгах. `plan`/`monitor` давхаргууд нь
 * ДАРАХАД дэлгэрэнгүй самбарт `attrs`-аа ШУУД дамжуулдаг тул БҮХ талбар (`*`)
 * хэрэгтэй. `gazar` давхаргууд нь standalone харагдацад pick-detail-гүй, зөвхөн
 * tooltip (qty + facets) ба renderer ашигладаг — тиймээс зөвхөн тэдгээр талбарыг
 * татна. gazar:parcel (42k) · gazar:building (35k) феатурын payload 80 талбараас
 * цөөн талбар руу буурч, Газар чөлөөлөлт харагдац огцом хурдасна. (OID автоматаар
 * ордог; хоосон жагсаалт бол зөвхөн OID.)
 */
const mapFields = (d: LayerDef): string[] => {
  if (d.topic !== 'gazar') return ['*'];
  const fs = new Set<string>([oidOf(d)]);
  if (d.qty) fs.add(d.qty.field);
  if (d.paint) fs.add(d.paint.field);
  if (d.breaks) fs.add(d.breaks.field);
  for (const f of d.facets ?? []) fs.add(f.field);
  return [...fs];
};

function buildLayers(uniform = false): Layer[] {
  const L: Layer[] = [];

  /* Ортофото — вектор давхаргын доор, ХИЙМЭЛ ДАГУУЛЫН суурь зургийн ДЭЭР. */
  L.push(new GroupLayer({
    id: IMAGERY_ID,
    title: IMAGERY.title,
    visible: false,
    listMode: 'hide',
    layers: (Object.entries(ORTHO_FLIGHTS) as [MeshVer, typeof ORTHO_FLIGHTS[MeshVer]][]).flatMap(([ver, list]) =>
      list.map((o) => new TileLayer({
        id: orthoFlightId(ver, o.key), title: o.title, url: o.url, visible: ver === DEFAULT_MESH_VER, listMode: 'hide',
      }))),
  }));


  if (IRGED_ORTHO_PRE.url) {
    L.push(new ImageryLayer({
      id: IRGED_ORTHO_PRE.id,
      title: IRGED_ORTHO_PRE.title,
      url: IRGED_ORTHO_PRE.url,
      visible: false,
      listMode: 'hide',
      format: 'jpgpng',
      popupEnabled: false,
      legendEnabled: false,
    }));
  }

  /* Зам (вектор тайл) — ортофотогийн ДЭЭР, цэгүүдийн ДООР. */
  if (IRGED_ROAD.url) L.push(new VectorTileLayer({
    id: IRGED_ROAD.id,
    title: IRGED_ROAD.title,
    url: IRGED_ROAD.url,
    visible: false,
    listMode: 'hide',
  }));

  /* Нүхэн жорлон — цэгэн давхарга, мөн зөвхөн тэр харагдацад. */
  L.push(new FeatureLayer({
    id: IRGED_TOILET.id,
    title: IRGED_TOILET.title,
    url: IRGED_TOILET.url,
    visible: false,
    listMode: 'hide',
    popupEnabled: false,
    legendEnabled: false,
    outFields: [],
    elevationInfo: ON_GROUND,
    renderer: toiletDot(IRGED_TOILET.hue),
    /**
     * ГЭРЭЛТЭХ ЭФФЕКТ (bloom) — цэнхэр цэгүүд ортофотогийн хүрэн-саарал дэвсгэр
     * дээр гэрэлтэж, жижиг хэмжээтэй ч нүдэнд шууд тусна.
     *
     * `bloom(эрчим, радиус, босго)` — зогсолтуудыг `TOILET_EFFECT` дээр
     * тайлбарлав: холоос (том кластер) сул, ойроос (ганц цэг) хүчтэй.
     */
    effect: TOILET_EFFECT,
  }));

  /**
   * Каталогийн тод өнгө (`#e879f9` фукси, `#22d3ee` цайвар хөх) нь 6,627
   * полигон дээр давтагдахад ортофотог бүрхэж, зураг «замбараагүй» болдог байв.
   * Энд ЗӨВХӨН ЗУРГАНД зориулж ханалтыг нь бууруулж, дүүргэлт/хүрээг нимгэлнэ —
   * КАРТУУДЫН (бөгж, тайлбар) өнгө нь `IRGED_BUILT_DEF`-ээрээ ТОД хэвээр:
   * жижиг дүрс дээр тод өнгө хэрэгтэй, том талбай дээр хортой.
   */
  const builtMapDef: LayerDef = {
    ...IRGED_BUILT_DEF,
    fill: 0.1,
    width: 0.9,
    paint: { ...IRGED_BUILT_DEF.paint!, values: IRGED_BUILT_MAP_HUE },
  };

  /* ГЭР ХОРООЛЛЫН ОДООГИЙН БАРИЛГА — «Иргэдэд хүрэх үр өгөөж»-ийн «ӨМНӨ» тал.
     6,627 полигон, `Type`-аар өнгө ялгана (Байшин · Гэр). */
  L.push(new FeatureLayer({
    id: IRGED_BUILT.id,
    title: IRGED_BUILT.title,
    url: IRGED_BUILT.url,
    visible: false,
    listMode: 'hide',
    popupEnabled: false,
    legendEnabled: false,
    outFields: [IRGED_BUILT.typeField],
    elevationInfo: ON_GROUND,
    minScale: 20_000,
    renderer: paintRenderer(builtMapDef),
    effect: BUILT_EFFECT,
  }));

  /* Нүхэн жорлонгийн ОЙРЫН callout хувилбар — ЗӨВХӨН 1:3,000-аас ойр (`minScale`).
     Холоос давхарга нь ArcGIS-ийн зүгээс огт ачаалагдахгүй тул нэмэлт ачаалалгүй.
     Ил эсэхийг харагдацын эффект удирдана (зөвхөн 3D-д). */
  L.push(new FeatureLayer({
    id: TOILET_PIN_ID,
    title: IRGED_TOILET.title,
    url: IRGED_TOILET.url,
    visible: false,
    listMode: 'hide',
    popupEnabled: false,
    legendEnabled: false,
    outFields: [],
    elevationInfo: ON_GROUND,
    minScale: TOILET_PIN_SCALE,
    renderer: toiletPin(IRGED_TOILET.hue),
  }));

  /* Сэдэвчилсэн давхаргууд — каталогаас ерөнхийлж */
  const V = LAYERS.map((d) => {
    /**
     * ЭХ WEBMAP-ИЙН ЗАГВАР — давхаргын үйлчилгээний URL-аар `webmapStyle.ts`
     * снапшотоос хайна. Олдвол renderer JSON-ыг `fromJSON`-оор ШУУД тавьдаг
     * тул симболын орчуулга огт хийгдэхгүй — webmap дээр харагдаж буйтай
     * 100% ижил (CIM, bloom, dash бүгд хэвээр). Олдоогүй давхарга (хяналт,
     * кадастр г.м. webmap-д байхгүй) доорх каталогийн загвараа хэрэглэнэ.
     * Снапшотыг `node tools/webmap_style.mjs`-ээр шинэчилнэ.
     */
    const web = webmapStyleOf(d.id);
    /**
     * ӨНГӨНИЙ OVERRIDE (`MAP_HUE_OVERRIDES`, 2026-07-31): барилгын снапшотын
     * шар (#ffb700, 20% дүүргэлт) нь ортофото дээр ялгарахгүй байсан тул
     * каталогийн `hue`-ээр (тод цэнхэр) дүүргэлт ~39%, хүрээ ~90% болгож будна.
     * Масштабын sizeInfo, bloom зэрэг бусад загвар снапшотоос хэвээр.
     */
    const webRenderer =
      web?.renderer && MAP_HUE_OVERRIDES.has(d.id)
        ? (() => {
            const r = structuredClone(web.renderer) as {
              symbol?: { color?: number[]; outline?: { color?: number[] } };
            };
            const [cr, cg, cb] = rgb(d.hue);
            if (Array.isArray(r.symbol?.color)) r.symbol.color = [cr, cg, cb, 100];
            if (Array.isArray(r.symbol?.outline?.color)) r.symbol.outline.color = [cr, cg, cb, 230];
            return r as typeof web.renderer;
          })()
        : web?.renderer;
    // План2d style (шууд эсвэл alias-аар). Тавигдвал selbe0724 effect/opacity-г алгасна.
    const p2 = plan2dStyleOf(d.id);
    const fl = new FeatureLayer({
      id: d.id,
      url: layerUrl(d),
      title: d.title,
      outFields: mapFields(d),
      popupEnabled: false,
      visible: false,
      ...(d.minScale ? { minScale: d.minScale } : {}),
      elevationInfo: ON_GROUND,
      /**
       * `et:27` (Явган хүний зам) нь `plan2d` alias-аар `sb:3`-ийн загварыг
       * өмсдөг бөгөөд тэр нь гинжинд ТҮРҮҮЛЖ шалгагддаг тул `Code`-ын хоёр
       * өнгө (явган зам · цементэн талбай) огт хэрэглэгддэггүй байв.
       */
      ...(d.serviceStyle ? {} : { renderer: d.paint?.force
        ? paintRenderer(d)
        : p2
        ? (rendererJsonUtils.fromJSON(p2 as never) as unknown as RendererProp)
        : webRenderer
        ? (rendererJsonUtils.fromJSON(webRenderer as never) as unknown as RendererProp)
        : d.paint
        ? paintRenderer(d)
        : uniform
        ? (d.id === ZONE_LAYER.id ? zoneTypeRenderer(d) : simple(symbolOf(d)))
        : d.breaks
          ? ({
              type: 'class-breaks',
              field: d.breaks.field,
              defaultSymbol: symbolOf(d, '#64748b'),
              defaultLabel: d.breaks.emptyLabel,
              classBreakInfos: d.breaks.levels.map((l) => ({
                minValue: l.min,
                maxValue: l.max - 0.0001,
                label: `${l.label} (${l.range})`,
                symbol: symbolOf(d, l.color),
              })),
            } as unknown as RendererProp)
          : simple(symbolOf(d)) }),
      ...(!p2 && web?.effect ? { effect: web.effect as unknown as __esri.FeatureLayerProperties['effect'] } : {}),
      ...(!p2 && web?.opacity != null ? { opacity: web.opacity } : {}),
      ...(d.id === ZONE_LAYER.id ? { labelingInfo: zoneLabels() } : {}),
      ...(d.id === 'source:eh' ? { labelingInfo: sourceLabels(), labelsVisible: true } : {}),
    });
    /* `serviceStyle` — үйлчилгээний рендерер АЧААЛАГДСАНЫ ДАРАА л бий тул `when`-д: ангиллын өнгө
       хэвээр, дүүргэлт тунгалаг, хүрээ нь тухайн өнгөөр. */
    const ss = d.serviceStyle;
    if (ss) {
      fl.when(() => {
        const r = fl.renderer?.clone();
        if (!r) return;
        const tint = (sym: unknown) => {
          const f = sym as __esri.SimpleFillSymbol | null | undefined;
          if (f?.type !== 'simple-fill' || !f.color) return;
          const { r: cr, g: cg, b: cb } = f.color;
          f.outline = { type: 'simple-line', color: [cr, cg, cb, 1], width: ss.outline } as never;
          f.color = [cr, cg, cb, ss.fill] as never;
        };
        if (r.type === 'unique-value') {
          for (const i of r.uniqueValueInfos ?? []) tint(i.symbol);
          tint(r.defaultSymbol);
        } else if (r.type === 'simple') tint(r.symbol);
        fl.renderer = r;
      }).catch(() => {});
    }
    return fl;
  });

  /**
   * ДАРААЛАЛ: талбай → шугам → цэг.
   */
  L.push(...[...V].sort((a, b) => drawOrder(a.id) - drawOrder(b.id)));
  return L;
}

/* ─────────────────── Provider ─────────────────── */

export function MapProvider({ children }: { children: ReactNode }) {
  // Ref биш STATE — MapCanvas view-гээ бүртгүүлэхэд хэрэглэгчид дахин зурагдана
  const [view, setView] = useState<AnyView | null>(null);
  const register = useCallback((v: AnyView | null) => setView(v), []);

  const [hl, setHl] = useState<Highlight>({ where: null });

  /**
   * Ортофото ил эсэх — каталогийн дээд мөр ба «Суурь зураг» товч ХОЁУЛАА үүнийг
   * уншиж бичнэ.
   */
  const [ortho, setOrtho] = useState(true);

  const [zoomFail, setZoomFail] = useState(false);
  useEffect(() => {
    if (!zoomFail) return;
    const t = setTimeout(() => setZoomFail(false), 6000);
    return () => clearTimeout(t);
  }, [zoomFail]);

  /** Бүсийн орон зайн маск — noZone давхаргуудын 2D бүдгэрүүлэлтэд (доорх эффект) */
  const [zoneMask, setZoneMask] = useState<unknown>(null);

  /**
   * Тодруулга 2D-д — таарахгүй объектыг БҮДГЭРҮҮЛНЭ (`featureEffect`).
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const is3d = view.type === '3d';
    const onlyList = hl.only == null ? null : Array.isArray(hl.only) ? hl.only : [hl.only];
    lazyTop(view.map).forEach((l) => {
      if (NO_HIGHLIGHT.has(l.id) || !('featureEffect' in l)) return;
      const fl = l as FeatureLayer;
      const live = !is3d && !!(hl.where || hl.geometry);
      const target = !onlyList || onlyList.includes(l.id);
      const apply = live && target;
      /**
       * Урьд нь `only`-д ороогүй давхарга ЯМАР Ч эффектгүй үлддэг байсан тул
       * шүүлт тавихад зурган дээр сонгосон объект бүдгэрсэн хөршүүдийнхээ
       * дунд ялгарах ёстой атлаа, ӨӨР давхаргууд (нүхэн жорлонгийн 1,675 цэг,
       * нийгмийн барилгууд) БҮРЭН ТОД хэвээр үлдэж зургийг дүүргэдэг байв —
       * «Гэр» шүүхэд гэрээс бусад бүх зүйл хэвээр харагдана.
       */
      const dimOther = live && !target;
      /**
       * БҮСИЙН МАСК — тодруулгагүй үед `ZONE_ID`-гүй (noZone) давхаргыг сонгосон
       * бүсийн полигоноор орон зайгаар бүдгэрүүлнэ. Атрибутын шүүлт боломгүй
       * (CAD-гаралтай суурь давхаргууд) тул зөвхөн ингэж «шүүгдэнэ». Тодруулга
       * идэвхэвбэл тэр нь давамгайлна (нэг давхаргад нэг л featureEffect).
       */
      const maskApply = !live && !is3d && zoneMask != null && LAYER_BY_ID[l.id]?.noZone;
      fl.featureEffect = apply
        ? ({
            filter: {
              ...(hl.where ? { where: hl.where } : {}),
              ...(hl.geometry
                ? { geometry: hl.geometry, spatialRelationship: 'intersects' }
                : {}),
            },
            excludedEffect: 'opacity(15%) grayscale(80%)',
          } as unknown as __esri.FeatureEffect)
        : dimOther
        ? ({
            filter: { where: '1=0' },
            excludedEffect: 'opacity(15%) grayscale(80%)',
          } as unknown as __esri.FeatureEffect)
        : maskApply
        ? ({
            filter: { geometry: zoneMask, spatialRelationship: 'intersects' },
            excludedEffect: 'opacity(15%) grayscale(80%)',
          } as unknown as __esri.FeatureEffect)
        : (null as unknown as __esri.FeatureEffect);
    });
  }, [view, hl, zoneMask]);

  const setHighlight = useCallback(
    (where: string | null, only?: string | string[], geometry?: unknown) =>
      setHl((prev) => {
        const sameOnly = Array.isArray(only) && Array.isArray(prev.only)
          ? only.length === prev.only.length && only.every((x, i) => x === (prev.only as string[])[i])
          : only === prev.only;
        return prev.where === where && sameOnly && prev.geometry === geometry
          ? prev
          : { where, only, geometry };
      }),
    [],
  );

  const flyToken = useRef(0);

  const goTo = useCallback(async (url: string, w: string) => {
    if (!view || view.destroyed) return;
    const t = ++flyToken.current;
    try {
      const e = await extentOf(url, view, w);
      if (flyToken.current !== t) return;
      // Гөлгөр zoom-in анимаци (1.4 сек, easing)
      if (e && !view.destroyed) {
        view.goTo(e.expand(1.2), { animate: true, duration: 1400, easing: 'ease-in-out' }).catch(() => {});
      }
    } catch (err) {
      console.error('[selbe] хүрээг тодорхойлж чадсангүй:', err);
    }
  }, [view]);

  const zoomToLayer = useCallback((id: string) => {
    const d = LAYER_BY_ID[id];
    if (d) goTo(layerUrl(d), '1=1');
  }, [goTo]);

  const zoomToZone = useCallback((zone: string) => {
    goTo(layerUrl(ZONE_LAYER), zoneWhere(ZONE_LAYER, zone) ?? '1=1');
  }, [goTo]);

  /**
   * Заасан объектууд руу ойртоно.
   */
  const zoomToWhere = useCallback(async (
    layerId: string,
    where: string,
    opts?: { animate?: boolean },
  ) => {
    const d = LAYER_BY_ID[layerId];
    if (!d || !view || view.destroyed) return;
    const t = ++flyToken.current;
    try {
      const e = await extentOf(layerUrl(d), view, where);
      if (flyToken.current !== t) return;
      if (!e || view.destroyed) return;
      // 150 м-ээс нарийн хүрээг тэлнэ — контекстгүй ойртохоос сэргийлнэ
      const cyWm = (e.ymin + e.ymax) / 2;
      const MIN = e.spatialReference?.isWebMercator
        ? 150 / Math.cos(Math.atan(Math.sinh(cyWm / 6378137)))
        : 150;
      let box;
      if (e.width < MIN || e.height < MIN) {
        const cx = (e.xmin + e.xmax) / 2;
        const cy = (e.ymin + e.ymax) / 2;
        const w = Math.max(e.width, MIN);
        const h = Math.max(e.height, MIN);
        box = new Extent({
          xmin: cx - w / 2, xmax: cx + w / 2,
          ymin: cy - h / 2, ymax: cy + h / 2,
          spatialReference: e.spatialReference,
        });
      } else {
        box = e.clone().expand(1.6);
      }
      view.goTo(box, opts?.animate === false ? { animate: false } : undefined).catch(() => {});
    } catch (err) {
      console.error('[selbe] объектын хүрээг тодорхойлж чадсангүй:', err);
      if (flyToken.current === t) setZoomFail(true);
    }
  }, [view]);

  const refreshLayer = useCallback((layerId: string) => {
    const l = view && !view.destroyed
      ? (view.map?.findLayerById(layerId) as { refresh?: () => void } | null)
      : null;
    l?.refresh?.();
  }, [view]);

  const api = useMemo<MapApi>(
    () => ({
      view, setHighlight, highlight: hl, zoomToLayer, zoomToZone, zoomToWhere,
      refreshLayer, ortho, setOrtho, setZoneMask,
    }),
    [view, setHighlight, hl, zoomToLayer, zoomToZone, zoomToWhere, refreshLayer, ortho],
  );

  return (
    <RegisterCtx.Provider value={register}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
      {zoomFail && (
        <div
          className={`${s.float} ${s.warn}`}
          role="status"
          style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 3000 }}
        >
          <span>{tr('Объект руу ойртож чадсангүй — сүлжээгээ шалгаад дахин оролдоно уу.')}</span>
        </div>
      )}
    </RegisterCtx.Provider>
  );
}

/* ─────────────────── Компонент ─────────────────── */

export const MapCanvas = memo(function MapCanvas({
  dim,
  visible,
  opacity,
  zone,
  layerWhere,
  layerStyle,
  pulseIds,
  uniform = false,
  bare = false,
  alwaysOn,
  swipe,
  layerFilters,
  onPick,
  sketch = false,
  onSketch,
  onSketchCancel,
  drawToken = 0,
  drawKind = 'polygon',
  reshapeGeometry,
  reshapeToken = 0,
  onReshape,
  sketchUndoToken = 0,
  clearToken = 0,
  onMapContext,
  sketchVertex,
  onSketchVertex,
  scene,
  children,
}: {
  dim: Dim;
  /** Ил байгаа давхаргын id-ууд */
  visible: string[];
  /**
   * Давхарга бүрийн ТУНГАЛАГ байдал (0–1). Байхгүй давхарга нь эх webmap-ийн
   * анхдагч тунгалагаа (`buildLayers`-д тавьсан) хадгална. «Тунгалаг» товчоор
   * хэрэглэгч тус бүрийг тохируулна.
   */
  opacity?: Record<string, number>;
  /** Сонгосон бүс — БҮХ давхаргыг тэр бүсээр хатуу шүүнэ. null = бүгд. */
  zone: string | null;
  /**
   * Давхарга ТУС БҮРИЙН `definitionExpression` (cross-filter дашбоардад).
   * Заасан (null биш) утга нь тухайн давхаргад `zone`-ийн нэгдсэн шүүлтийг ДАРНА.
   */
  layerWhere?: Record<string, string | null>;
  /**
   * ДАВХАРГЫН ХЭВ МАЯГИЙГ ХАРАГДАЦААС ДАРЖ БИЧИХ.
   */
  /**
   * ХАРАГДАЦЫН ХЭВ МАЯГИЙН ДАРЛАГА — тухайн давхаргыг ЗӨВХӨН энэ харагдацад
   * өөр өнгө/зузаан/хэмжээгээр зурна.
   */
  layerStyle?: Record<string, {
    hue?: string;
    fill?: number;
    width?: number;
    /** Цэгэн давхаргын диаметр (px) — `DOT_SCALE` ХЭРЭГЛЭГДЭХГҮЙ, шууд утга */
    size?: number;
    classes?: { expression: string; hues: Record<string, string> };
  }>;
  /**
   * ПУЛЬСЛЭХ (анивчих) ДАВХАРГУУД — анхаарал татах ёстой цөөн объектод.
   *
   * «Багцын хяналт»-д багцтай давхцсан нэгж талбар нь 1-2 ширхэг, ортофото
   * дээр жижиг харагддаг тул зөвхөн өнгөөр ялгах хангалтгүй — амьсгалах
   * хөдөлгөөн нүд шууд татна.
   */
  pulseIds?: string[];
  /** Давхарга бүрийг ГАНЦ жигд өнгөөр зурах (ангиллаар олон өнгө хуваахгүй) */
  uniform?: boolean;
  /**
   * ХООСОН ЭХЛЭЛ — суурь 14 давхаргыг (`BASE_MAP_IDS`) сонголт хоосон үед
   * АВТОМАТААР асаахгүй.
   */
  bare?: boolean;
  /**
   * ЭНЭ ХАРАГДАЦАД ҮРГЭЛЖ АСААЛТТАЙ давхаргууд (2026-09-15).
   */
  alwaysOn?: readonly string[];
  /**
   * ХАРЬЦУУЛАХ SWIPE (2026-10-13, «Ерөнхий төлөвлөгөө» → «Detail»): `leading` нь
   * ЗҮҮН, `trailing` нь БАРУУН талд зурагдана; дунд нь чирэх босоо бариул.
   */
  swipe?: { leading: readonly string[]; trailing: readonly string[] };
  /** 2D selection filters; unlike highlighting, excluded features are hidden. */
  layerFilters?: readonly MapLayerFilter[];
  /**
   * Товшилтын сонголт. СОНГОЛТОТ: зарим харагдац (жиш. Газар чөлөөлөлт)
   * зургийн товшилтоос ЮУ Ч хийхгүй.
   */
  onPick?: (attrs: Record<string, unknown> | null, layerId: string | null) => void;
  /**
   * ПОЛИГОН ЗУРАХ чадварыг асаана («Газар чөлөөлөлт»). Зөвхөн 2D-д ажиллана —
   * `SketchViewModel`-ийг бэлдэнэ (гадаад товч `drawToken`-оор эхлүүлнэ).
   */
  sketch?: boolean;
  /** Полигон зурж дуусахад/өөрчлөхөд геометрийг, устгахад `null`-ийг дамжуулна */
  onSketch?: (geometry: __esri.Geometry | null) => void;
  /**
   * ХЭРЭГЛЭГЧ ЗУРААЛТЫГ ЦУЦЛАВ (Esc) — `create` үйл явдлын `state: 'cancel'`.
   */
  onSketchCancel?: () => void;
  /** Утга нэмэгдэхэд полигон зурж эхэлнэ (гадны «Полигон зурах» товч) */
  drawToken?: number;
  /**
   * ЯМАР ГЕОМЕТР зурах — `drawToken` өсөх агшинд уншигдана.
   */
  drawKind?: 'point' | 'polyline' | 'polygon' | 'rectangle';
  /**
   * БАЙГАА ОБЪЕКТЫН ГЕОМЕТРИЙГ VERTEX-ЭЭР ЗАСАХ — `reshapeToken` өсөх агшинд
   * энэ геометрийг зурах давхаргад буулгаж, `SketchViewModel.update`-ыг
   * асаана (Esri-ийн «reshape» бариулууд гарч ирнэ).
   */
  reshapeGeometry?: unknown;
  reshapeToken?: number;
  /**
   * Vertex засварын үр дүн — чирэх бүрд дуудагдана.
   */
  onReshape?: (geometry: __esri.Geometry | null) => void;
  /**
   * ЗУРААЛТЫН НЭГ АЛХАМ БУЦААХ — өсөх бүрд `SketchViewModel.undo`.
   */
  sketchUndoToken?: number;
  /** Утга нэмэгдэхэд зурсан полигоныг арилгана (гадны «Цэвэрлэх» товч) */
  clearToken?: number;
  onMapContext?: (p: { lat: number; lon: number; clientX: number; clientY: number }) => void;
  sketchVertex?: { token: number; lat: number; lon: number } | null;
  /** `sketchVertex`-ийн үр дүн — `false` = зураалтад цэг НЭМЭГДСЭНГҮЙ (дуудагч хэрэглэгчид хэлнэ) */
  onSketchVertex?: (ok: boolean) => void;
  /**
   * 3D горимд зурах IntegratedMesh багц. Байхгүй бол аппын үндсэн `SCENE`.
   */
  scene?: readonly { key: string; title: string; url: string }[];
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<AnyView | null>(null);
  /** BIM сонгогч (барилга нэг нэгээр + BuildingExplorer) — `components/bimPicker` */
  const bimWidgetRef = useRef<BimPicker | null>(null);
  /**
   * BIM удирдлагыг боосон `Expand` — виджет өөрөө нь `bimWidgetRef`-д.
   */
  const bimExpandRef = useRef<Expand | null>(null);
  const sketchVMRef = useRef<SketchViewModel | null>(null);
  const pendingDrawRef = useRef(0);
  const drawKindRef = useRef(drawKind);
  useSyncRef(drawKindRef, drawKind);
  const pickRef = useRef(onPick);
  useSyncRef(pickRef, onPick);
  const renderedPickOnlyRef = useRef(false);
  useSyncRef(renderedPickOnlyRef, !!swipe || !!layerFilters?.length);
  const onSketchRef = useRef(onSketch);
  useSyncRef(onSketchRef, onSketch);
  const onSketchCancelRef = useRef(onSketchCancel);
  useSyncRef(onSketchCancelRef, onSketchCancel);
  /**
   * ӨӨРСДИЙН цуцлалтын туг — `svm.cancel()` нь `create`-ийн `cancel` үйл явдлыг
   * СИНХРОН гаргадаг (`OperationHandle.cancel → complete → emit`), тиймээс
   * дуудлагын турш асаалттай туг нь хэрэглэгчийн Esc-ийг кодын цуцлалтаас ялгана.
   */
  const selfCancelRef = useRef(false);
  const sketchEvtRef = useRef(0);
  const onSketchVertexRef = useRef(onSketchVertex);
  useSyncRef(onSketchVertexRef, onSketchVertex);
  const onReshapeRef = useRef(onReshape);
  useSyncRef(onReshapeRef, onReshape);
  const reshapeGeomRef = useRef(reshapeGeometry);
  useSyncRef(reshapeGeomRef, reshapeGeometry);
  /** Давхарга бүрийн БҮТЭЭГДЭХ (build-time) тунгалаг — override арилахад буцаана */
  const defaultOpacityRef = useRef<Record<string, number>>({});
  /** Сүүлд ил байсан давхаргын id-ууд — шинээр ил болсныг илрүүлэхэд */
  /**
   * Дарж бичихээс ӨМНӨХ renderer — дарлага арилахад буцаана.
   */
  const styleBackup = useRef<Record<string, unknown>>({});
  const prevVisRef = useRef<Set<string>>(new Set());
  /** Одоо пульс-анимаци явж буй давхаргууд — давхар гогцоо эхлэхээс сэргийлнэ */
  const fadingRef = useRef<Set<string>>(new Set());
  /** Идэвхтэй пульс-гогцоог цуцлах функц — unmount дээр rAF-ийг зогсооно */
  const pulseCancelRef = useRef<(() => void) | null>(null);
  /**
   * ДАВХАРГА ТУС БҮРИЙН цуцлагч.
   */
  const pulseCancels = useRef<Record<string, () => void>>({});
  /** `pulseLayer` нь useCallback тул props-ыг ref-ээр уншина (лавлагаа тогтвортой). */
  const pulseIdsRef = useRef<string[]>([]);
  /** Хэв маягийн дарлага — пульсийн хуулбар ч ижил өнгөтэй байх ёстой. */
  const layerStyleRef = useRef<Record<string, {
    hue?: string; fill?: number; width?: number; size?: number;
  }>>({});
  /** Давхарга бүрийн СҮҮЛД пульсэлсэн шүүлт — солигдвол дахин эхлүүлнэ. */
  const pulsedWhere = useRef<Record<string, string | null>>({});

  const [ready, setReady] = useState(false);

  /**
   * БҮСИЙН ОРОН ЗАЙН МАСК — сонгосон бүс(үүд)ийн нэгтгэсэн полигоныг татаж
   * Provider-т өгнө; тэр нь noZone давхаргуудыг 2D-д геометрээр бүдгэрүүлнэ
   * («суурь давхаргууд ч бүсээр шүүгдэх ёстой» — хэрэглэгчийн хүсэлт).
   */
  const { setZoneMask } = useMap();
  const zoneMaskToken = useRef(0);
  useEffect(() => {
    const t = ++zoneMaskToken.current;
    if (!ready || dim !== '2d' || !zone) { setZoneMask(null); return; }
    const zl = mapLayer(mapRef.current, ZONE_LAYER.id) as FeatureLayer | null;
    if (!zl) { setZoneMask(null); return; }
    (async () => {
      try {
        const q = zl.createQuery();
        q.where = zoneWhere(ZONE_LAYER, zone) ?? '1=1';
        q.returnGeometry = true;
        q.outFields = [];
        const sr = viewRef.current?.spatialReference;
        if (sr) q.outSpatialReference = sr;
        const res = await zl.queryFeatures(q);
        if (zoneMaskToken.current !== t) return;
        const gs = res.features.map((f) => f.geometry).filter(Boolean) as __esri.Geometry[];
        const u = gs.length > 1
          ? geometryEngine.union(gs as __esri.Polygon[])
          : gs[0] ?? null;
        setZoneMask(u);
      } catch {
        if (zoneMaskToken.current === t) setZoneMask(null);
      }
    })();
  }, [zone, ready, dim, setZoneMask]);
  /* Unmount үед маскыг цэвэрлэнэ — дараагийн харагдац хуучин бүдгэрүүлэлт өвлөхгүй. */
  useEffect(() => () => { zoneMaskToken.current++; setZoneMask(null); }, [setZoneMask]);

  /**
   * `tgl` (Хүүхдийн тоглоом) — төрөл бүрд ЭГЦ ДЭЭРЭЭС харсан icon renderer.
   * Map кэшлэгддэг тул mount бүрд идемпотентээр тавина (нэг л удаа солигдоно).
   */
  useEffect(() => {
    if (!ready) return;
    const l = mapLayer(mapRef.current, 'tgl') as FeatureLayer | null;
    const view = viewRef.current;
    if (!l || !view || LAYER_BY_ID['tgl']?.geom !== 'point') return;
    let last = 0;
    const apply = (scale: number) => {
      const px = toglPx(scale);
      // Zoom анимацийн үед scale олон удаа галддаг — 12%-иас бага өөрчлөлтөд
      // renderer дахин үүсгэхгүй (хямд throttle).
      if (last && Math.abs(px - last) / last < 0.12) return;
      last = px;
      l.renderer = toglRenderer(px) as unknown as __esri.Renderer;
    };
    apply(view.scale);
    const h = view.watch('scale', (s: number) => apply(s));
    return () => h.remove();
  }, [ready, dim]);

  /**
   * Style снапшотууд (/webmap-style.json, /plan2d-style.json) — bundle-аас
   * гаргаж ажиллах үед татдаг болсон тул Map барихаас ӨМНӨ ачаалж дуусгана
   * (buildLayers синхроноор уншдаг). Хоёулаа кэштэй — дахин mount-д шууд ready.
   */
  const [stylesReady, setStylesReady] = useState(false);
  useEffect(() => {
    let on = true;
    Promise.all([loadWebmapStyle(), loadPlan2dStyle()])
      .then(() => { if (on) setStylesReady(true); });
    return () => { on = false; };
  }, []);
  /** Ачаалагдаж чадаагүй 3D загварын тоо — null = асуудалгүй */
  const [meshError, setMeshError] = useState<number | null>(null);
  const [bimTok, setBimTok] = useState(0);
  /**
   * ЕРДИЙН (2D) давхаргын уналт — унасан давхаргын ГАРЧГУУД.
   */
  const [layerFail, setLayerFail] = useState<[string, string][]>([]);
  const [pickFail, setPickFail] = useState(false);
  useEffect(() => {
    if (!pickFail) return;
    const t = setTimeout(() => setPickFail(false), 6000);
    return () => clearTimeout(t);
  }, [pickFail]);
  /**
   * `view.when` унасан — «ачаалж байна…»-гийн оронд алдаа + «Дахин оролдох».
   */
  const [initError, setInitError] = useState<{ name?: string; message?: string } | null>(null);
  /** «Дахин оролдох» — утга нэмэгдэхэд view-г бүхэлд нь дахин үүсгэнэ */
  const [initToken, setInitToken] = useState(0);
  const [m3Tick, setM3Tick] = useState(0);
  const [sketchTick, setSketchTick] = useState(0);
  const [swipeTick, setSwipeTick] = useState(0);
  /** Хулганы доорх объектын товч мэдээлэл */
  const tipSetRef = useRef<(t: TipState | null) => void>(() => {});
  const setTip = useCallback((t: TipState | null) => { tipSetRef.current(t); }, []);
  /** Блок бүрийн нийт гүйцэтгэл — газрын зургийн өнгө ба tooltip-д хоёуланд нь */
  const [blockProg, setBlockProg] = useState<BlockProgressMap | null>(null);
  const busVer = useSyncExternalStore(subscribeData, dataVersion, () => 0);
  /** Гүйцэтгэлийн өнгө КЭШЭЭС будагдсан — амьд дүн ирмэгц false болно */
  const [progStale, setProgStale] = useState(false);
  /** Амьд гүйцэтгэл татаж чадаагүй — блокууд саарал «мэдээлэлгүй» төлөвт */
  const [progError, setProgError] = useState(false);

  const register = useContext(RegisterCtx);
  const registerRef = useRef(register);
  useSyncRef(registerRef, register);



  /** 3D-д тодруулга `definitionExpression`-оор явна (featureEffect тэнд ажиллахгүй) */
  const { highlight: hl, ortho, setOrtho } = useContext(Ctx);
  const hlOnly = useMemo(
    () => (hl.only == null ? null : Array.isArray(hl.only) ? hl.only : [hl.only]),
    [hl.only],
  );
  /**
   * `ortho`-г эффект/DOM callback-д ref-ээр уншина — тэдгээр нь closure тул сүүлийн
   * утгыг унших ёстой. Мөн «Суурь зураг» товчны чагтыг синк болгоно.
   */
  const orthoRef = useRef(ortho);
  useSyncRef(orthoRef, ortho);
  const orthoChkRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (orthoChkRef.current) orthoChkRef.current.checked = ortho;
  }, [ortho]);

  /** 3D мешийн харьцуулалтыг унтраах функц (идэвхтэй үед л утгатай) */
  const mesh3dOffRef = useRef<(() => void) | null>(null);

  /**
   * 3D МЕШИЙН ХУВИЛБАР — «Шинэ» (2026-09-17) эсвэл «Хуучин» (Сэлбэ 1, 2).
   */
  const r3 = useRender3d();
  const bimPkg = useBimPkg();
  /** «Хурдан»-д Map-д БАЙГАА BIM-ийн id (`manageBim`-ийн `onShown`) ба BIM-ийн доорх барилгын OID (`computeBimHide`) */
  const bimShownRef = useRef<ReadonlySet<string>>(new Set());
  const bimHideRef = useRef<BimHide | null>(null);
  /**
   * `scene3d:4` (extrude барилга)-ын CLIENT-SIDE шүүлт (2026-10-04): Map-д байгаа BIM-ийн
   * доорхыг нууна ( 2026-10-19: хоёр горимд — доорх). Камер зогсох бүрд биш —
   * зөвхөн Map-ын BIM-ийн бүрэлдэхүүн өөрчлөгдөхөд (`onShown`) ба нуултын үр дүн ирэхэд.
   */
  const footFilter = useCallback(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    const bld = map?.findLayerById('scene3d:4');
    if (!view || view.destroyed || !(bld instanceof FeatureLayer)) return;
    const r = bimHideRef.current;
    let where: string | null = null;
    if (r) {
      const live = [...bimShownRef.current].filter((id) => {
        const l = map?.findLayerById(id);
        return !!l && !l.destroyed && l.loadStatus !== 'failed';
      });
      const ids = new Set(live.flatMap((id) => r.byLayer[id] ?? []));
      if (ids.size) where = `${r.oid} NOT IN (${[...ids].join(',')})`;
    }
    view.whenLayerView(bld)
      .then((lv) => {
        const flv = lv as __esri.FeatureLayerView;
        if ((flv.filter?.where ?? null) === where) return;
        flv.filter = where ? new FeatureFilter({ where }) : null as unknown as FeatureFilter;
      })
      .catch(() => {});
  }, []);

  const [meshVer, setMeshVer] = useState<MeshVer>(() => {
    try {
      const v = typeof window === 'undefined' ? null : window.localStorage.getItem(MESH_VER_KEY);
      return v === 'old' || v === 'new' ? v : DEFAULT_MESH_VER;
    } catch {
      return DEFAULT_MESH_VER;
    }
  });
  const meshVerRef = useRef(meshVer);
  useSyncRef(meshVerRef, meshVer);
  const pickMeshVer = useCallback((v: MeshVer) => {
    setMeshVer(v);
    try { window.localStorage.setItem(MESH_VER_KEY, v); } catch { /* хадгалахгүй ч ажиллана */ }
  }, []);

  /**
   * БҮТЭН ДЭЛГЭЦ (хэрэглэгчийн хүсэлт, 2026-08-18) — зурган дээрх товч дарахад
   * апп бүхэлдээ browser-ийн бүтэн дэлгэцэд орж, зураг viewport-ыг дүүргэнэ
   * (эзэн хашлагад `.mapFsHost` → position: fixed inset 0; ArcGIS view хэмжээгээ өөрөө дагана).
   * Давхарга (LayerList) ба суурь зургийн widget хоёулаа зурган дээрээ байгаа
   * тул бүтэн дэлгэцэд ч бүрэн ажиллана.
   */
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const host = (wrap.closest('[data-map-host]') as HTMLElement | null) ?? wrap.parentElement ?? wrap;
    if (!fs) return;
    host.classList.add('mapFsHost');
    return () => host.classList.remove('mapFsHost');
  }, [fs]);
  const toggleFs = useCallback(() => {
    setFs((cur) => {
      const next = !cur;
      if (next) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return next;
    });
  }, []);
  const toggleFsRef = useRef(toggleFs);
  useSyncRef(toggleFsRef, toggleFs);
  const fsBtnRef = useRef<HTMLDivElement | null>(null);
  const fsNowRef = useRef(fs);
  useSyncRef(fsNowRef, fs);
  useEffect(() => { if (fsBtnRef.current) paintFsBtn(fsBtnRef.current, fs); }, [fs]);
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFs(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** Массивыг эффектийн хамааралд өгч болохгүй (лавлагаа нь рендер бүрт шинэ) */
  const visibleKey = visible.join(',');
  const alwaysOnKey = (alwaysOn ?? []).join(',');

  /** Энэ харагдацын 3D меш багц — заагаагүй бол сонгосон хувилбар (`meshVer`) */
  const sceneList = scene ?? MESH_VERSIONS[meshVer].layers;
  const sceneKey = sceneList.map((m) => m.key).join(',');


  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    return () => { unmountingRef.current = true; };
  }, []);

  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   */
  useEffect(() => {
    if (!el.current || !stylesReady) return;

    const mapKey = uniform ? 'uniform' : 'themed';
    if (!mapCache[mapKey] || mapCache[mapKey].destroyed) {
      esriConfig.assetsPath = `https://js.arcgis.com/${String(arcgisVersion).split(".").slice(0, 2).join(".")}/@arcgis/core/assets`;
      const all = buildLayers(uniform);
      const imagery = all.find((l) => l.id === IMAGERY_ID) as GroupLayer | undefined;
      const kids = imagery ? imagery.layers.toArray() : [];
      if (imagery) {
        imagery.layers.removeMany(kids.filter((c) => !orthoRef.current || orthoFlightVer(c.id) !== meshVerRef.current));
      }
      mapCache[mapKey] = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: [...(imagery ? [imagery] : []), new GraphicsLayer({ id: LAZY_END, listMode: 'hide', visible: false })],
      });
      lazyRegister(mapCache[mapKey], all, imagery ? [{ group: imagery, kids }] : []);
    }
    mapRef.current = mapCache[mapKey];
    recreateFailedLayers(mapCache[mapKey]);

    const map = mapRef.current;
    if (typeof window !== 'undefined') (window as unknown as { __dbgmap: Map }).__dbgmap = map;
    setReady(false);
    setInitError(null);

    const m3 = is3D(dim) ? mods3d() : null;
    if (is3D(dim) && !m3) {
      let gone = false;
      load3d()
        .then(() => { if (!gone) setM3Tick((t) => t + 1); })
        .catch((e: unknown) => {
          if (gone) return;
          console.error('[selbe] 3D модуль ачаалж чадсангүй:', e);
          const er = e as { name?: unknown; message?: unknown } | null;
          setInitError({
            name: typeof er?.name === 'string' ? er.name : undefined,
            message: typeof er?.message === 'string' ? er.message : undefined,
          });
        });
      return () => { gone = true; };
    }

    const mountGen = getLocaleGeneration();
    const parkKey = `${dim}|${mapKey}`;
    const parked = adoptView<AnyView>(parkKey);
    const reused = parked && parked.map === map ? parked : null;
    if (tabParked3d?.destroyed) tabParked3d = null;
    const tabAdopt = reused != null && reused === tabParked3d;
    if (parked) tabParked3d = null;
    if (parked && !reused) { destroyDetached(parked); mapStats.destroyed += 1; }
    if (reused) reused.container = el.current;
    else mapStats.created += 1;

    const view: AnyView =
      reused ?? (m3
        ? new m3.SceneView({
            container: el.current,
            map,
            camera: INITIAL_CAMERA_3D() as never,
            popupEnabled: false,
            qualityProfile: profileFor(getRender3d()),
            ui: { components: ['zoom', 'navigation-toggle', 'compass', 'attribution'] },
          })
        : new MapView({
            container: el.current,
            map,
            center: [HOME.lon, HOME.lat],
            zoom: HOME.zoom,
            popupEnabled: false,
            constraints: { rotationEnabled: false },
            ui: { components: ['zoom', 'attribution'] },
          }));
    viewRef.current = view;
    /* «Тайлан татах»-ын газрын зургийн агшин (`mapShots.ts`) */
    registerMapView(view);
    (view.type === '3d' ? ['zoom', 'compass', 'navigation-toggle'] : ['zoom'])
      .forEach((id, index) => view.ui.move(id, { position: 'top-right', index } as never));
    /** Энэ эффектийн `view.ui`-д нэмсэн зүйлс — хадгалах (park) үед гараар хасна,
        эс бөгөөс дахин авсан view дээр товчнууд давхардана (`view.destroy()` л цэвэрлэдэг байв) */
    const ownUi: (__esri.Widget | HTMLElement)[] = [];
    const addUi = (w: __esri.Widget | HTMLElement, pos?: string) => {
      ownUi.push(w);
      view.ui.add(w, pos);
    };
    if (typeof window !== 'undefined') (window as unknown as { __dbgview: AnyView }).__dbgview = view;
    if (typeof window !== 'undefined') (window as unknown as { __selbeMapStats: typeof mapStats }).__selbeMapStats = mapStats;

    /**
     * SDK-ийн 2D LayerView бүр дотооддоо `container.fadeTransitionEnabled = true`
     * тавьдаг тул давхарга toggle хийхэд аажим бүдгэрч/тодорч (мөн tile-ууд
     * ачаалахдаа бүдгээс тод руу) ХЭДЭН СЕКУНД үргэлжилдэг байв. Энэ нь public
     * API-д ил гараагүй тул container-ийн тугийг нь шууд унтраана — давхарга
     * асаахад шууд гарч, унтраахад шууд алга болно. (3D LayerView-д ийм
     * container байхгүй тул `?.` хамгаалалт хангалттай.)
     */
    type FadeContainer = { fadeTransitionEnabled?: boolean; endTransitions?: () => void };
    const killFade = (lv: __esri.LayerView) => {
      const c = (lv as unknown as { container?: FadeContainer }).container;
      if (c && c.fadeTransitionEnabled !== false) {
        c.fadeTransitionEnabled = false;
        c.endTransitions?.();
      }
    };
    view.allLayerViews.forEach(killFade);
    const fadeHandle = view.allLayerViews.on('change', (e) => e.added.forEach(killFade));

    /**
     * Esri-ийн суурь зургийн галерей — Expand дотор ХУМИГДСАНААР (зураг битүүрэхгүй).
     */
    const bmPanel = document.createElement('div');
    bmPanel.style.cssText = 'display:flex;flex-direction:column';
    const orthoRow = document.createElement('label');
    orthoRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 11px;'
      + 'font-size:12.5px;font-weight:600;color:var(--ink);background:var(--surface);'
      + 'border-bottom:1px solid var(--line);cursor:pointer';
    const orthoChk = document.createElement('input');
    orthoChk.type = 'checkbox';
    orthoChk.style.cssText = 'width:14px;height:14px;accent-color:var(--hue,#0d9488);cursor:pointer';
    const imagery = map.findLayerById(IMAGERY_ID);
    // Context нь эх сурвалж — каталогийн дээд мөртэй синк (`ortho`-г эффект уншина)
    orthoChk.checked = orthoRef.current;
    if (imagery) imagery.visible = orthoRef.current;
    orthoChkRef.current = orthoChk;
    orthoChk.addEventListener('change', () => setOrtho(orthoChk.checked));
    orthoRow.append(orthoChk, document.createTextNode(tr('Ортофото')));
    const galleryDiv = document.createElement('div');
    bmPanel.append(orthoRow, galleryDiv);
    const gallery = new BasemapGallery({
      view,
      container: galleryDiv,
      source: new LocalBasemapsSource({
        basemaps: [
          Basemap.fromId('satellite')!,
          Basemap.fromId('hybrid')!,
          Basemap.fromId('streets-vector')!,
          Basemap.fromId('topo-vector')!,
          Basemap.fromId('gray-vector')!,
          Basemap.fromId('dark-gray-vector')!,
          Basemap.fromId('osm')!,
        ],
      }),
    });
    const bmExpand = new Expand({
      view,
      content: bmPanel,
      expandIcon: 'basemap',
      expandTooltip: tr('Суурь зураг сонгох'),
      collapseTooltip: tr('Хаах'),
      mode: 'floating',
    });
    addUi(bmExpand, 'top-right');

    /**
     * Тэр нь баруун дээд буланд ХОЁР ДАХЬ давхарга асаах/унтраах жагсаалт
     * гаргадаг байсан — порталын «Давхарга» товч/каталогтой яг ижил ажиллагаа,
     * гэхдээ ӨӨР загвар, ӨӨР нэрлэлт (SDK-ийн түүхий `title`), ӨӨР дараалал.
     * Хоёр жагсаалт нэг зурагт зөрчилддөг: каталогоос унтраасныг LayerList
     * дээр асаачихвал каталогийн чагт худал болдог байв.
     *
     * Түүнийг үлдээх цорын ганц шалтгаан нь «бүтэн дэлгэцэд каталог руу гарах
     * шаардлагагүй» байсан; одоо `MapTools` нь ЗУРГАН ДЭЭР хөвдөг тул бүтэн
     * дэлгэцэд ч «Давхарга» бүрэн ажиллана — шалтгаан нь дуусав.
     */

    /**
     * БҮТЭН ДЭЛГЭЦИЙН товч — Esri-ийн widget товчны загвараар (ижил хэмжээ,
     * ижил дэвсгэр) тул бусад удирдлагатай нэг формат. Toggle нь компонентын
     * `fs` төлвийг удирдана (`toggleFsRef` — click үргэлж сүүлийн callback-ыг дуудна).
     */
    const fsBtn = document.createElement('div');
    fsBtn.className = 'esri-widget--button esri-widget selbe-grpEnd';
    fsBtn.dataset.mapControl = 'fullscreen';
    fsBtn.setAttribute('role', 'button');
    fsBtn.setAttribute('tabindex', '0');
    paintFsBtn(fsBtn, fsNowRef.current);
    fsBtnRef.current = fsBtn;
    fsBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
      + '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" '
      + 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    fsBtn.addEventListener('click', () => toggleFsRef.current());
    fsBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFsRef.current(); }
    });
    addUi(fsBtn, 'top-right');


    /**
     * 3D МЕШ ХАРЬЦУУЛАХ — ХУУЧИН (Сэлбэ 1, 2) ↔ ШИНЭ (`Selbe_mesh_0917`).
     */
    if (dim === '3d') {
      const sv = view as __esri.SceneView;

      const swBtn3 = document.createElement('div');
      swBtn3.className = 'esri-widget--button esri-widget';
      swBtn3.setAttribute('role', 'button');
      swBtn3.setAttribute('tabindex', '0');
      swBtn3.setAttribute('aria-pressed', 'false');
      swBtn3.title = tr('Меш харьцуулах — зүүн: нөгөө хувилбар, баруун: одоогийн');
      swBtn3.setAttribute('aria-label', tr('Меш харьцуулах — зүүн: нөгөө хувилбар, баруун: одоогийн'));
      swBtn3.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
        + '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" '
        + 'stroke="currentColor" stroke-width="1.5"/>'
        + '<path d="M8 1.6v12.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
        + '<path d="M5.1 8H2.9M4.1 6.9 2.9 8l1.2 1.1M10.9 8h2.2M11.9 6.9 13.1 8l-1.2 1.1" '
        + 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      addUi(swBtn3, 'top-right');

      /** Хүрээнээс хол давах зай (м) — олон өнцөгт харагдах талбайг бүрэн хаана */
      const FAR = 40000;
      /** Дэлгэцийн байрлал 0..1 */
      let frac = 0.5;

      /** Дэлгэцийн `divX` босоо шугамыг газарт буулгаж, хоёр талын цагирагийг өгнө */
      const ringsAt = (divX: number) => {
        const h = sv.height || 0;
        if (!h) return null;
        const pts: number[][] = [];
        const N = 6;
        for (let i = 0; i <= N; i++) {
          const p = sv.toMap({ x: divX, y: (h * i) / N });
          if (p) pts.push([p.x, p.y]);
        }
        if (pts.length < 2) return null;
        const a = pts[0];
        const b = pts[pts.length - 1];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        // Шугамыг хоёр үзүүрээс нь сунгана — хүрээний гадна ч хамрагдана
        const line = [
          [a[0] - dx * FAR, a[1] - dy * FAR],
          ...pts,
          [b[0] + dx * FAR, b[1] + dy * FAR],
        ];
        const nx = -dy;
        const ny = dx;
        const side = (sgn: number) => [
          ...line,
          ...line.map(([x, y]) => [x + nx * FAR * sgn, y + ny * FAR * sgn]).reverse(),
        ];
        // Аль тал нь ДЭЛГЭЦИЙН зүүн вэ — бариулын зүүн талын цэгээр шалгана
        const probe = sv.toMap({ x: Math.max(2, divX - 60), y: h / 2 });
        const leftIsPlus = probe
          ? (probe.x - a[0]) * nx + (probe.y - a[1]) * ny > 0
          : true;
        return {
          left: side(leftIsPlus ? 1 : -1),
          right: side(leftIsPlus ? -1 : 1),
          sr: sv.spatialReference,
        };
      };

      const clipTo = (ring: number[][], sr: __esri.SpatialReference) =>
        new m3!.SceneModifications([
          new m3!.SceneModification({
            geometry: new Polygon({ rings: [ring], spatialReference: sr }),
            type: 'clip',
          }),
        ]);

      type MeshLayer = __esri.IntegratedMeshLayer;
      const oldMeshes = () => map.layers.toArray()
        .filter((l) => String(l.id).startsWith('scene:')) as MeshLayer[];
      /** Харьцуулалтын (НӨГӨӨ хувилбарын) мешүүд — хуучин хувилбарт ХОЁР меш */
      const cmpMeshes = () => map.layers.toArray()
        .filter((l) => String(l.id).startsWith(MESH_CMP_PREFIX)) as MeshLayer[];

      /**
       * `modifications` онооход IntegratedMesh бүхэлдээ дахин клиплэгддэг —
       * гурван давхарга × кадр бүр гэдэг нь чирэлтийг гацаана. Одоо чирэх үед
       * ЗӨВХӨН цагаан шугам хөдөлж (DOM, үнэгүй), клип нь 140мс-ийн завсартай
       * болон гараа авах агшинд л шинэчлэгдэнэ.
       */
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastFrac = -1;
      const applyClip = () => {
        const cm = cmpMeshes();
        if (!cm.length) return;
        // Өмнөхөөсөө бараг хөдлөөгүй бол дэмий клип хийхгүй
        if (Math.abs(frac - lastFrac) < 0.004) return;
        const r = ringsAt(Math.round((sv.width || 0) * frac));
        if (!r) return;
        lastFrac = frac;
        for (const l of cm) l.modifications = clipTo(r.left, r.sr);
        for (const l of oldMeshes()) l.modifications = clipTo(r.right, r.sr);
      };
      const applySoon = () => {
        if (timer) return;
        timer = setTimeout(() => { timer = null; applyClip(); }, 140);
      };
      const applyNow = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        lastFrac = -1;
        applyClip();
      };

      /* Бариул — 2D-гийн Esri swipe-тэй ИЖИЛ харагдац (цагаан шугам + бариул) */
      let divider: HTMLDivElement | null = null;
      let camWatch: __esri.WatchHandle | null = null;
      let detachDrag: (() => void) | null = null;

      const stopMesh = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        camWatch?.remove();
        camWatch = null;
        detachDrag?.();
        detachDrag = null;
        divider?.remove();
        divider = null;
        for (const l of oldMeshes()) l.modifications = null;
        for (const l of cmpMeshes()) { map.remove(l); l.destroy(); }
        swBtn3.style.color = '';
        swBtn3.setAttribute('aria-pressed', 'false');
        mesh3dOffRef.current = null;
      };

      const startMesh = () => {
        /**
         * НӨГӨӨ хувилбарыг нэмнэ — ортофотогийн дараа, одоогийн мештэй нэг түвшинд.
         */
        const cmpVer: MeshVer = scene ? 'new' : (meshVerRef.current === 'new' ? 'old' : 'new');
        for (const m of MESH_VERSIONS[cmpVer].layers) {
          map.add(new m3!.IntegratedMeshLayer({
            id: `${MESH_CMP_PREFIX}${m.key}`,
            url: m.url,
            title: m.title,
            visible: true,
          }), 1);
        }

        divider = document.createElement('div');
        divider.style.cssText =
          'position:absolute;top:0;bottom:0;width:3px;margin-left:-1.5px;z-index:2;'
          + 'background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:ew-resize;'
          + 'touch-action:none;'
          + `left:${frac * 100}%`;
        divider.tabIndex = 0;
        divider.setAttribute('role', 'slider');
        divider.setAttribute('aria-orientation', 'horizontal');
        divider.setAttribute('aria-valuemin', '2');
        divider.setAttribute('aria-valuemax', '98');
        divider.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
        divider.setAttribute('aria-label', tr('Меш харьцуулах — зүүн: нөгөө хувилбар, баруун: одоогийн'));
        const grip = document.createElement('div');
        grip.style.cssText =
          'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
          + 'width:26px;height:26px;border-radius:3px;background:#fff;'
          + 'box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:ew-resize;'
          + 'display:flex;align-items:center;justify-content:center;color:#3c4a47;'
          + 'font-size:12px;line-height:1;user-select:none';
        grip.textContent = '||';
        divider.append(grip);
        (sv.container as HTMLElement).append(divider);

        const onMove = (e: PointerEvent) => {
          const box = (sv.container as HTMLElement).getBoundingClientRect();
          frac = Math.min(0.98, Math.max(0.02, (e.clientX - box.left) / box.width));
          if (divider) {
            divider.style.left = `${frac * 100}%`;
            divider.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
          }
          applySoon();
        };
        const detach = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          detachDrag = null;
        };
        const onUp = (e: PointerEvent) => {
          divider?.releasePointerCapture?.(e.pointerId);
          detach();
          applyNow(); // гараа авмагц эцсийн байрлалаар яг таарна
        };
        divider.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          divider?.setPointerCapture?.(e.pointerId);
          detachDrag?.();
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
          detachDrag = detach;
        });
        divider.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation(); // SceneView-ийн сумтай навигацид хүрэхгүй
          const step = e.shiftKey ? 0.1 : 0.02;
          frac = Math.min(0.98, Math.max(0.02, frac + (e.key === 'ArrowLeft' ? -step : step)));
          if (divider) {
            divider.style.left = `${frac * 100}%`;
            divider.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
          }
          applySoon();
        });

        /* Камер хөдлөхөд олон өнцөгт хуучирна — зогсмогц дахин бодно */
        camWatch = reactiveUtils.watch(() => sv.stationary, (st) => { if (st) applyNow(); });
        /* Меш ачаалагдсаны дараа л клип суудаг тул давхарга бэлэн болоход дахин */
        for (const l of cmpMeshes()) l.when?.(() => applyNow()).catch(() => {});
        applyNow();

        swBtn3.style.color = 'var(--hue, #0d9488)';
        swBtn3.setAttribute('aria-pressed', 'true');
        mesh3dOffRef.current = stopMesh;
      };

      const toggleMesh = () => (mesh3dOffRef.current ? stopMesh() : startMesh());
      swBtn3.addEventListener('click', toggleMesh);
      swBtn3.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMesh(); }
      });
    }

    let alive = true;
    view.when(() => {
      if (view.destroyed || !alive) return;
      setReady(true);
      registerRef.current(view);
      /**
       * Эхлэх хүрээг БҮСИЙН давхаргаар — төслийн жинхэнэ хамрах хүрээ.
       */
      if (tabAdopt) {
        (view as __esri.SceneView).camera = INITIAL_CAMERA_3D() as never;
      }
      if (reused && !tabAdopt) {
        /* хэрэглэгчийн камер хэвээр */
      } else if (homeExtentCache) {
        view.goTo(homeExtentCache, { animate: false }).catch(() => {});
      } else {
        extentOf(layerUrl(ZONE_LAYER), view)
          .then((e) => {
            if (e && !view.destroyed) {
              homeExtentCache = e.expand(1.1);
              view.goTo(homeExtentCache, { animate: false }).catch(() => {});
            }
          })
          .catch((e) => console.error('[selbe] эхлэх хүрээг тодорхойлж чадсангүй:', e));
      }
    }).catch((e: unknown) => {
      console.error('[selbe] газрын зураг үүсгэж чадсангүй:', e);
      if (!view.destroyed) {
        const er = e as { name?: unknown; message?: unknown } | null;
        setInitError({
          name: typeof er?.name === 'string' ? er.name : undefined,
          message: typeof er?.message === 'string' ? er.message : undefined,
        });
      }
    });

    const STUCK_MS = 8000;
    /** SDK 4.34 `DefaultsFromMap.sourcePreloadCount` */
    const SOURCE_PRELOAD = 10;
    let stuckT: ReturnType<typeof setTimeout> | null = null;
    if (m3 && !reused) {
      const unstick = async () => {
        stuckT = null;
        if (!alive || view.destroyed || view.ready) return;
        const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
        if (!alive || view.destroyed || view.ready) return;
        const pending = authPendingRoots(esriId);
        const preload = new Set<Layer>(map.layers.toArray().slice(0, SOURCE_PRELOAD));
        const topOf = (l: Layer): Layer => {
          let cur: Layer = l;
          for (;;) {
            const p = (cur as unknown as { parent?: unknown }).parent;
            if (!p || p === map || !(p as { type?: unknown }).type) return cur;
            cur = p as Layer;
          }
        };
        let n = 0;
        map.allLayers.forEach((l) => {
          if (l.loadStatus !== 'loading' || /^(scene|scene3d|bim):/.test(String(l.id))) return;
          if (!RECREATE_TYPES.has(l.type) || retriedLayers.has(l) || !preload.has(topOf(l))) return;
          const url = (l as unknown as { url?: unknown }).url;
          if (pending && (typeof url !== 'string' || !pending.has(serviceRoot(url)))) return;
          try { l.cancelLoad(); n += 1; } catch { /* цуцлах боломжгүй */ }
        });
        if (n) console.warn(`[selbe] 3D: ${n} давхарга ${STUCK_MS / 1000}с-д итгэмжлэл хүлээж ачаалагдаагүй — зургийг хүлээлгэхгүй (cancelLoad)`);
      };
      stuckT = setTimeout(() => { void unstick(); }, STUCK_MS);
    }

    /**
     * Дарж/хулгана аваачихад ХАМААРАХ давхаргын объектыг олох.
     */
    const pickHit = (r: __esri.HitTestResult) => {
      for (const x of r.results) {
        if (x.type !== 'graphic') continue;
        const lyr = x.graphic.layer;
        const id = lyr == null ? '' : String(lyr.id);
        if (!lyr || !lyr.visible || PASSIVE.has(id)) continue;
        if (!LAYER_BY_ID[id]) continue;
        return {
          attrs: x.graphic.attributes as Record<string, unknown>,
          id,
          fields: (lyr as FeatureLayer).fields ?? null,
        };
      }
      return null;
    };

    /**
     * Тиймээс hitTest хоосон бол ОРОН ЗАЙН АСУУЛГА руу шилжинэ: дарсан цэгээс
     * хэдэн пикселийн хүлцэлтэйгээр ил давхаргуудаас хайна. Энэ нь зургийн
     * рендерээс огт хамаарахгүй тул 2D, 3D хоёуланд ижил ажиллана.
     */
    const pickByQuery = async (mapPoint: __esri.Point, tolerance: number) => {
      if (renderedPickOnlyRef.current) return null;
      /**
       * Урьд нь энэ fallback нь `where` огт өгдөггүй (=`1=1`) байв. Тэр илэрхийлэлд
       * (1) бүсийн шүүлт, (2) давхаргын тогтмол `d.where`, (3) 3D-ийн тодруулга
       * ГУРВУУЛАА агуулагддаг тул зурган дээр ХАРАГДАХГҮЙ обьект сонгогддог байлаа.
       * 3D-д энэ нь ОНЦГОЙ тохиолдол БИШ — торон гадаргуу `hitTest`-ийг няцаадаг
       * тул энэ fallback нь ХЭВИЙН зам (дээрх тайлбарыг үз): бүс сонгосон
       * хэрэглэгч дарахад нуугдсан обьектын самбар нээгддэг байв.
       */
      const sc = view.scale;
      const inScale = (l: __esri.Layer) => {
        const { minScale = 0, maxScale = 0 } = l as unknown as { minScale?: number; maxScale?: number };
        return (!minScale || sc <= minScale) && (!maxScale || sc >= maxScale);
      };
      const cand = (view.map?.layers.toArray() ?? [])
        .map((l) => ({ l, id: String(l.id) }))
        .filter(({ l, id }) => l.visible && inScale(l) && !PASSIVE.has(id) && LAYER_BY_ID[id])
        // Дээд талынхыг ЭХЭЛЖ шалгана: цэг → шугам → талбай
        .sort((a, b) => drawOrder(String(b.id)) - drawOrder(String(a.id)));
      if (!cand.length) return null;

      const wkid = mapPoint.spatialReference?.wkid ?? 102100;
      const aoi: Aoi = {
        geometry: { x: mapPoint.x, y: mapPoint.y, spatialReference: { wkid } },
        wkid,
        type: 'point',
        distance: tolerance,
      };

      const BATCH = 3;
      let asked = 0;
      let failedN = 0;
      for (let i = 0; i < cand.length; i += BATCH) {
        const batch = cand.slice(i, i + BATCH);
        const rows = await Promise.all(batch.map(({ l, id }) =>
          queryFeatures(layerUrl(LAYER_BY_ID[id]), {
            aoi,
            limit: 1,
            where: (l as __esri.FeatureLayer).definitionExpression || '1=1',
          }).catch(() => { failedN += 1; return [] as Record<string, unknown>[]; }),
        ));
        asked += batch.length;
        for (let k = 0; k < batch.length; k++) {
          if (rows[k].length) {
            return {
              attrs: rows[k][0] as Record<string, unknown>,
              id: batch[k].id,
              fields: (batch[k].l as FeatureLayer).fields ?? null,
            };
          }
        }
      }
      if (asked > 0 && failedN === asked) setPickFail(true);
      return null;
    };

    const NO_HITS = { results: [] } as unknown as __esri.HitTestResult;
    const hitTestPickable = (e: __esri.ViewClickEvent | __esri.ViewPointerMoveEvent) => {
      const any = view.map?.allLayers.some((l) => {
        const id = String(l.id);
        return l.visible && !PASSIVE.has(id) && LAYER_BY_ID[id] != null;
      });
      return any ? view.hitTest(e) : Promise.resolve(NO_HITS);
    };

    let clickSeq = 0;
    const click = view.on('click', (e: __esri.ViewClickEvent) => {
      const seq = ++clickSeq;
      hitTestPickable(e)
        .then(async (r) => {
          // Хоцорсон hitTest — шинэ даралт аль хэдийн явж байна
          if (seq !== clickSeq) return;
          if (!alive) return;
          const hit = pickHit(r);
          const tipOnly = !pickRef.current;
          if (hit) {
            if (tipOnly) setTip({ x: e.x, y: e.y, id: hit.id, attrs: hit.attrs, fields: hit.fields });
            else pickRef.current?.(hit.attrs, hit.id);
            return;
          }
          if (view.destroyed) return;
          if (!e.mapPoint) { pickRef.current?.(null, null); return; }
          // ≈6 пикселийн хүлцэл — нимгэн шугам, жижиг цэгийг барихад хангалттай
          const tol = Math.max(2, (view.resolution || 1) * 6);
          const q = await pickByQuery(e.mapPoint, tol);
          if (view.destroyed || seq !== clickSeq || !alive) return;
          if (tipOnly) {
            setTip(q ? { x: e.x, y: e.y, id: q.id, attrs: q.attrs, fields: q.fields } : null);
            return;
          }
          pickRef.current?.(q?.attrs ?? null, q?.id ?? null);
        })
        .catch(() => {/* view устгагдсан — сонголт өөрчлөгдөхгүй */});
    });

    let busy = false;
    const move = view.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      if (busy) return;
      if (view.interacting) { setTip(null); return; }
      busy = true;
      hitTestPickable(e)
        .then((r) => {
          if (view.destroyed || !view.container) return;
          const hit = pickHit(r);
          view.container.style.cursor = hit ? 'pointer' : 'default';
          // Товч мэдээллийн хайрцаг — заагчийн хажууд
          setTip(hit
            ? { x: e.x, y: e.y, id: hit.id, attrs: hit.attrs, fields: hit.fields }
            : null);
        })
        .catch(() => {})
        .finally(() => { busy = false; });
    });

    const leave = view.on('pointer-leave', () => setTip(null));

    return () => {
      alive = false;
      if (stuckT) clearTimeout(stuckT);
      click.remove();
      move.remove();
      leave.remove();
      fadeHandle.remove();
      if (!gallery.destroyed) gallery.destroy();
      const tabPark3d = unmountingRef.current && is3D(dim);
      const park = !view.destroyed && (shouldPark(mountGen, getLocaleGeneration()) || tabPark3d);
      mesh3dOffRef.current?.();
      mesh3dOffRef.current = null;
      setTip(null);
      if (park) {
        /* Энэ эффектийн нэмсэн товч/виджетийг хасна — шинэ MapCanvas дахин нэмнэ */
        for (const w of ownUi) view.ui.remove(w);
        if (!bmExpand.destroyed) bmExpand.destroy();
        view.container = null as unknown as HTMLDivElement;
        parkView(view, parkKey, destroyDetached);
        tabParked3d = tabPark3d && !shouldPark(mountGen, getLocaleGeneration()) ? view : null;
      } else {
        destroyDetached(view);
        mapStats.destroyed += 1;
      }
      viewRef.current = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      registerRef.current(null);
    };
    // `initToken` — «Дахин оролдох» дарахад view-г дахин үүсгэнэ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, stylesReady, initToken, m3Tick]);

  /**
   * Компонент салахад Map-ыг УСТГАХГҮЙ — `mapCache`-д үлдэж дараагийн харагдацад
   * дахин ашиглагдана (view нь [dim] эффектийн cleanup-д тусад нь устна).
   */
  useEffect(() => () => {
    const map = mapRef.current;
    if (map) {
      for (const [id, r] of Object.entries(styleBackup.current)) {
        const fl = mapLayer(map, id) as FeatureLayer | null;
        if (fl && 'renderer' in fl) fl.renderer = r as FeatureLayer['renderer'];
      }
      for (const [id, v] of Object.entries(defaultOpacityRef.current)) {
        const l = mapLayer(map, id);
        if (l && 'opacity' in l) l.opacity = v;
      }
    }
    styleBackup.current = {};
    defaultOpacityRef.current = {};
    mapRef.current = null;
  }, []);

  /**
   * 3D давхаргуудыг ЗӨВХӨН тохирох горимд газрын зурагт байлгана.
   *   · 3d  → IntegratedMesh (гадна фотограмметр)
   *   · bim → BuildingSceneLayer (12 барилгын загвар)
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const want = sceneList.map((m) => ({ id: `scene:${m.key}`, m }));
    const wantIds = new Set(want.map((w) => w.id));

    for (const l of map.layers.toArray()) {
      const id = String(l.id);
      if (!id.startsWith('scene:')) continue;
      if (dim !== '3d' || !wantIds.has(id)) {
        map.remove(l);
        l.destroy();
      }
    }

    const m3 = mods3d();
    if (dim === '3d' && m3) {
      for (const { id, m } of want) {
        if (map.findLayerById(id)) continue;
        // Индекс 1 — ортофотогийн дараа, вектор давхаргуудын өмнө
        map.add(new m3.IntegratedMeshLayer({ id, url: m.url, title: m.title, visible: true }), 1);
      }
    }

    for (const b of BIM.layers) {
      const existing = map.findLayerById(b.key);
      if (dim !== 'bim' && existing) map.remove(existing);
    }

    /**
     * SCENE3D — 'selbe_3D_ 0804' web scene-ийн 14 давхарга (барилга, зам, мод,
     * ногоон, спорт г.м.). Renderer-ийг scene-ээс ХУУЛСАН (`scene3d.ts`) —
     * барилгыг `Давх_1`-ээр өргөх Extrude зэрэг 3D style-ийг `fromJSON`-оор ЯГ
     * тавьдаг тул scene дээрхтэй ижил. ЗӨВХӨН BIM (SceneView) горимд, эс бөгөөс
     * MapView «layerview» алдаа өгнө.
     */
    for (const s of SCENE3D_LAYERS) {
      const existing = map.findLayerById(s.id);
      if (dim === 'bim' && !existing) {
        type SceneRenderer = {
          symbol?: { symbolLayers?: { type?: string }[] };
          defaultSymbol?: { symbolLayers?: { type?: string }[] };
          uniqueValueInfos?: { symbol?: { symbolLayers?: { type?: string }[] } }[];
        };
        const r3 = s.renderer as SceneRenderer;
        const sym3 = r3.symbol ?? r3.defaultSymbol ?? r3.uniqueValueInfos?.[0]?.symbol;
        const t0 = sym3?.symbolLayers?.[0]?.type;
        const keep3D = t0 === 'Object' || t0 === 'Extrude' || t0 === 'Water';
        let p2 = keep3D ? null : plan2dStyleOf(s.id.replace('scene3d:', 'sb:'));
        type PfsSymbol = { type?: string; url?: string; outline?: { color?: number[]; width?: number } };
        const p2sym = (p2 as { symbol?: PfsSymbol; defaultSymbol?: PfsSymbol } | null);
        const sym2 = p2sym?.symbol ?? p2sym?.defaultSymbol;
        if (sym2?.type === 'esriPMS') p2 = null;
        else if (sym2?.type === 'esriPFS') {
          const base = pfsBaseColor(sym2.url);
          if (base) {
            p2 = {
              type: 'simple',
              symbol: {
                type: 'esriSFS', style: 'esriSFSSolid', color: [...rgb(base), 255],
                outline: {
                  type: 'esriSLS', style: 'esriSLSSolid',
                  color: sym2.outline?.color ?? [...rgb(base), 255],
                  width: sym2.outline?.width ?? 0.5,
                },
              },
            };
          } else p2 = null;
        }
        map.add(new FeatureLayer({
          id: s.id,
          url: s.url,
          title: s.title,
          opacity: s.opacity,
          popupEnabled: false,
          visible: true,
          elevationInfo: sceneElevInfo(s.elevationInfo),
          renderer: rendererJsonUtils.fromJSON((p2 ?? s.renderer) as never) as unknown as RendererProp,
        }));
      } else if (dim !== 'bim' && existing) {
        map.remove(existing);
        existing.destroy();
      }
    }

    /**
     * ХҮҮХДИЙН ТОГЛООМ — BIM-д ЖИНХЭНЭ 3D загвараар (Esri Recreation web style:
     * Slide/Swing/Jungle_Gym — 2D-ийн бодит зургуудын эх моделууд). 2D-ийн `tgl`
     * суурь давхарга BIM-д нуугддаг тул энэ нь түүний 3D хувилбар. Зөвхөн
     * SceneView-д нэмнэ — web style 3D симбол MapView-д ажиллахгүй.
     */
    {
      const tgl3d = map.findLayerById('tgl3d');
      const tglDef = LAYER_BY_ID['tgl'];
      if (dim === 'bim' && !tgl3d && tglDef && tglDef.geom === 'point') {
        map.add(new FeatureLayer({
          id: 'tgl3d',
          url: layerUrl(tglDef),
          title: tr('Хүүхдийн тоглоом (3D)'),
          outFields: ['type'],
          popupEnabled: false,
          visible: true,
          elevationInfo: ON_GROUND,
          renderer: togl3dRenderer() as unknown as RendererProp,
        }));
      } else if (dim !== 'bim' && tgl3d) {
        map.remove(tgl3d);
        tgl3d.destroy();
      }
    }

    /**
     * Усан сан — ХОЁУЛАН 3D горимд (3d ба bim, хоёулаа SceneView). 2D-д хасна.
     */
    const usan = map.findLayerById(USAN_SAN.id);
    if (usan) { map.remove(usan); usan.destroy(); }

  }, [dim, ready, sceneKey, m3Tick]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * BIM ЗАГВАРЫН ДООРХ БАРИЛГЫГ НУУНА (2026-09-25).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || dim !== 'bim') return;
    const bld = map.findLayerById('scene3d:4');
    if (!(bld instanceof FeatureLayer)) return;
    const sig = `${bld.url}/${bld.layerId}|${BIM.layers.map((b) => b.key).join(',')}`;
    let alive = true;
    const use = (r: BimHide) => {
      if (!alive || bld.destroyed) return;
      bimHideRef.current = r;
      if (bld.definitionExpression) bld.definitionExpression = null as unknown as string;
      footFilter();
    };
    if (bimHideCache?.sig === sig) {
      use(bimHideCache.r);
      return () => { alive = false; };
    }
    if (bimHideFlight?.sig !== sig) {
      const flight = { sig, p: computeBimHide(map, bld) };
      bimHideFlight = flight;
      void flight.p
        .then((r) => { if (r.complete) bimHideCache = { sig, r }; })
        .catch(() => {})
        .finally(() => { if (bimHideFlight === flight) bimHideFlight = null; });
    }
    bimHideFlight!.p
      .then(use)
      .catch((e) => { if (alive) console.warn('[selbe] BIM-ийн доорх барилгыг нууж чадсангүй:', e); });
    return () => { alive = false; };
  }, [dim, ready, sceneKey, r3, footFilter, bimTok]);

  /**
   * IoT МЭДРЭГЧ — 3D-д газраас дээш өргөгдсөн радар тэмдэг, 2D-д энгийн цэг.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const lift = dim !== '2d';
    for (const d of LAYERS) {
      if (!d.id.startsWith('iot:')) continue;
      const l = mapLayer(map, d.id) as __esri.FeatureLayer | null;
      if (!l) continue;
      l.renderer = simple(lift ? radarSymbol(d.hue) : symbolOf(d)) as never;
      l.elevationInfo = (lift ? { mode: 'relative-to-scene' } : ON_GROUND) as never;
    }
  }, [dim, ready]);

  /**
   * НЭВТРЭЛТ ШААРДЛАГАТАЙ ДАВХАРГАД ИТГЭМЖЛЭЛ (2026-09-15, `LayerDef.auth`).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const defs = LAYERS.filter((d) => d.auth);
    if (!defs.length || !authToken()) return;
    let alive = true;
    void (async () => {
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      for (const d of defs) {
        if (!alive) return;
        const fl = mapLayer(map, d.id) as FeatureLayer | null;
        if (!fl || authedLayers.has(fl)) continue;
        if (fl.customParameters?.token) {
          const rest = { ...fl.customParameters };
          delete rest.token;
          fl.customParameters = rest;
        }
        const url = layerUrl(d);
        if (!esriId.findCredential(url)) {
          const noPrompt: __esri.IdentityManagerGetCredentialOptions & { prompt: boolean } = { prompt: false };
          try { await esriId.getCredential(url, noPrompt); } catch { continue; }
        }
        if (!alive || fl.destroyed) return;
        authedLayers.add(fl);
        fl.refresh();
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  /**
   * ИНЖЕНЕРИЙН ДЭД БҮТЭЦ — 3D-д ч ЯГ 2D ШИГ, ГАЗАР ДЭЭРЭЭ (2026-09-11).
   *
   * Одоо бүх геометр `on-the-ground` — 2D-тэй ижил. Мешийн барилга шугамын
   * ДЭЭГҮҮР давхарлах нь хүлээн зөвшөөрөгдсөн: шугам газарт байдаг, барилга
   * нь түүн дээр зогсож байгаа нь ЗӨВ дүрслэл. Энэ effect нь IoT-ийн
   * өргөлтөөс (`iot:*`, дээр) ТУСДАА үлдэнэ — тэнд өргөлт зөв.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const d of LAYERS) {
      if (!d.id.startsWith('infra:')) continue;
      const l = mapLayer(map, d.id) as __esri.FeatureLayer | null;
      if (!l) continue;
      l.elevationInfo = ON_GROUND;
      if (d.geom === 'point') {
        l.renderer = scaledDot(d.hue, d.marker ?? 'circle') as unknown as FeatureLayer['renderer'];
      }
    }
  }, [dim, ready]);

  /*
   * НҮХЭН ЖОРЛОНГИЙН КЛАСТЕР — 2026-09-17-нд БҮРМӨСӨН УНТРААСАН (хэрэглэгчийн шийдвэр,
   * дээрх модул-г үз: тодорхойлолт зөвхөн git түүхэнд).
   */

  /**
   * BuildingExplorer виджет — ЗӨВХӨН BIM горимд.
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready) return;

    let clickH: IHandle | null = null;
    const clear = () => {
      clickH?.remove();
      clickH = null;
      if (bimExpandRef.current) {
        if (!view.destroyed) view.ui.remove(bimExpandRef.current);
        bimExpandRef.current.destroy();
        bimExpandRef.current = null;
      }
      if (bimWidgetRef.current) {
        bimWidgetRef.current.destroy();
        bimWidgetRef.current = null;
      }
    };

    if (dim !== 'bim') { clear(); return; }

    const m3 = mods3d();
    if (!m3) return;
    const layers = bimAll(map);
    if (!layers.length) return;

    clear();
    const widget = createBimPicker({
      view: view as SceneView, layers: () => bimLive(map), items: BIM.layers, Explorer: m3.BuildingExplorer,
    });
    const expand = new Expand({
      view,
      content: widget.el,
      expandIcon: 'layers',
      expandTooltip: tr('BIM давхаргын удирдлага'),
      collapseTooltip: tr('Хаах'),
      mode: 'floating',
    });
    bimWidgetRef.current = widget;
    bimExpandRef.current = expand;
    /* 3D дээр BIM барилгыг ДАРЖ сонгоно — самбар хаалттай бол нээнэ */
    clickH = view.on('click', (e: __esri.ViewClickEvent) => {
      void widget.pickAt(e).then((ok) => { if (ok && !expand.expanded) expand.expanded = true; });
    });

    return clear;
  }, [dim, ready]);

  /**
   * BIM ДЭД ДАВХАРГЫН ИЛ БАЙДАЛ — зураглалын горимоор ( 2026-10-04, `render3d.ts`).
   *
   * «НАРИЙН» = урьдын «ARCHITECTURAL» ДИСЦИПЛИН — ҮРГЭЛЖ АСААЛТТАЙ (хэрэглэгчийн хүсэлт):
   *
   * «ХУРДАН» = гадна бүрхүүл (хана · хавтан · цонх · фасадын хавтан) бүх барилгад + камерт ОЙР
   * ≤3 барилгад бүрэн гадна төрх (фасадын өнгө/дээвэр — `GenericModel`). Ойрын жагсаалтыг камер
   * ЗОГСОХОД л (`stationary`) дахин бодно — орбитын кадр бүрд ажил нэмэхгүй.
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || dim !== 'bim' || view.type !== '3d') return;
    const layers = bimAll(map);
    if (!layers.length) return;
    /* archOn: true — «Нарийн»-д урьдын «Architectural үргэлж асаалттай» (дээрх).
       «Хурдан»-д Map-д камерт ойр `BIM_BUDGET` л (`manageBim`) — доорх extrude-ийг шүүнэ. */
    return manageBim({
      view: view as SceneView, map, all: () => bimLive(map), m: r3, archOn: true,
      onShown: (ids) => { bimShownRef.current = ids; footFilter(); },
      pkg: bimPkg,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready, r3, footFilter, r3 === 'fine' ? bimPkg : null, bimTok]);

  const bimPkgKey = r3 === 'fine' ? bimPkg.pkg : null;
  useEffect(() => {
    if (dim === 'bim' && ready) bimWidgetRef.current?.rebind();
  }, [dim, ready, r3, bimPkgKey, bimTok]);

  /**
   * SceneView-ийн ЧАНАРЫН ТОХИРГОО — «Хурдан»/«Нарийн» (2026-10-04, `render3d.ts`). 3D ба BIM
   * хоёуланд; хадгалсан (`mapPark`) view-г дахин авахад ч тухайн горимоор тавина.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || view.type !== '3d') return;
    applyView3d(view as SceneView, r3);
  }, [dim, ready, r3]);

  /**
   * ШИНЖИЛГЭЭНИЙ ЦОГЦ ХЭРЭГСЭЛ («Analysis objects») — ЗӨВХӨН 3D/BIM (SceneView).
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !is3D(dim)) return;
    const sv = view as SceneView;

    type AV = { interactive: boolean; place: (o?: { signal?: AbortSignal }) => Promise<unknown> };
    type Tool = {
      name: string; type: string; icon: string;
      make: (m: ModsTools) => __esri.Analysis; analysis: __esri.Analysis | null; av: AV | null; btn?: HTMLElement;
    };
    const tools: Tool[] = [
      { name: tr('Талбай'), type: 'area-measurement', icon: 'esri-icon-measure-area', make: (m) => new m.AreaMeasurementAnalysis(), analysis: null, av: null },
      { name: tr('Зай'), type: 'direct-line-measurement', icon: 'esri-icon-measure-line', make: (m) => new m.DirectLineMeasurementAnalysis(), analysis: null, av: null },
      { name: tr('Харах шугам'), type: 'line-of-sight', icon: 'esri-icon-line-of-sight', make: (m) => new m.LineOfSightAnalysis(), analysis: null, av: null },
      { name: tr('Харагдац'), type: 'viewshed', icon: 'esri-icon-visible', make: (m) => new m.ViewshedAnalysis(), analysis: null, av: null },
      { name: tr('Хэмжээс'), type: 'dimension', icon: 'esri-icon-measure', make: (m) => new m.DimensionAnalysis(), analysis: null, av: null },
      { name: tr('Огтлол'), type: 'slice', icon: 'esri-icon-cursor-marquee', make: (m) => new m.SliceAnalysis(), analysis: null, av: null },
    ];
    let disposed = false;
    let armed: Promise<void> | null = null;
    const arm = (): Promise<void> => (armed ??= loadTools3d().then(async (m) => {
      if (disposed || view.destroyed) return;
      tools.forEach((t) => { t.analysis = t.make(m); sv.analyses.add(t.analysis); });
      await Promise.all(
        tools.map(async (t) => {
          t.av = (await sv.whenAnalysisView(t.analysis as never)) as unknown as AV;
        }),
      );
    }).catch((err) => {
      if (!tools.some((t) => t.analysis)) armed = null;
      if (!view.destroyed && !disposed) console.error('[analysis]', err);
    }));

    let active: Tool | null = null;
    let abort: AbortController | null = null;

    const mk = (tag: string, css: string, txt?: string) => {
      const n = document.createElement(tag);
      n.style.cssText = css;
      if (txt != null) n.textContent = txt;
      return n;
    };
    // Цэвэр DARK загвар (аппын design token) — хэвтээ ИКОН action-bar
    const panel = mk('div', 'width:min(238px, 92vw);padding:15px;display:flex;flex-direction:column;gap:12px;'
      + 'background:var(--surface);color:var(--ink);font-family:inherit');
    panel.append(mk('div', 'font-size:0.92rem;font-weight:700;color:var(--ink)', tr('Шинжилгээ')));
    const bar = mk('div', 'display:flex;gap:6px');
    const iconBtnCss = 'flex:1;height:40px;display:grid;place-items:center;border:1px solid var(--line);'
      + 'border-radius:9px;color:var(--ink-2);cursor:pointer;background:transparent;transition:background .12s,color .12s,border-color .12s';
    tools.forEach((t) => {
      const b = mk('button', iconBtnCss) as HTMLButtonElement;
      b.title = t.name;
      b.type = 'button';
      b.setAttribute('aria-label', t.name);
      b.setAttribute('aria-pressed', 'false');
      const ic = mk('span', 'font-size:18px');
      ic.className = t.icon;
      ic.setAttribute('aria-hidden', 'true');
      b.append(ic);
      b.addEventListener('mouseenter', () => { if (t !== active) b.style.background = 'var(--surface-2)'; });
      b.addEventListener('mouseleave', () => { if (t !== active) b.style.background = 'transparent'; });
      b.addEventListener('click', () => onTool(t));
      t.btn = b;
      bar.append(b);
    });
    panel.append(bar);
    const prompt = mk('div', 'font-size:0.76rem;line-height:1.5;color:var(--ink-3);min-height:20px', tr('Шинжилгээний төрөл сонгоно уу.'));
    const controls = mk('div', 'display:flex;gap:8px');
    const cBtnCss = 'flex:1;padding:8px 10px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;display:none';
    const clearBtn = mk('button', cBtnCss + ';border:1px solid var(--line);background:var(--surface-2);color:var(--ink)', tr('Арилгах')) as HTMLButtonElement;
    const doneBtn = mk('button', cBtnCss + ';border:1px solid transparent;background:var(--hue);color:#fff', tr('Дуусгах')) as HTMLButtonElement;
    controls.append(clearBtn, doneBtn);
    panel.append(prompt, controls);

    const highlight = () => {
      tools.forEach((t) => {
        const b = t.btn!;
        const on = t === active;
        b.style.background = on ? 'var(--hue)' : 'transparent';
        b.style.color = on ? '#fff' : 'var(--ink-2)';
        b.style.borderColor = on ? 'transparent' : 'var(--line)';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      clearBtn.style.display = active ? 'block' : 'none';
      doneBtn.style.display = active ? 'block' : 'none';
      prompt.textContent = active
        ? tr('Зурган дээр дарж «{0}» байрлуул.', active.name)
        : tr('Шинжилгээний төрөл сонгоно уу.');
    };
    const stop = () => {
      abort?.abort();
      abort = null;
      if (active?.av) active.av.interactive = false;
      active = null;
      highlight();
    };
    // Нэгийг байрлуулаад ДАХИН place() дуудна — цуцлах хүртэл дараалан нэмнэ
    const placeContinuous = async () => {
      abort?.abort();
      abort = new AbortController();
      const signal = abort.signal;
      const tool = active;
      try {
        while (!signal.aborted && tool?.av) {
          await tool.av.place({ signal });
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== 'AbortError') console.error('[analysis]', err);
      } finally {
        if (abort?.signal === signal) abort = null;
      }
    };
    const onTool = (t: Tool) => {
      if (active === t) { stop(); return; }
      stop();
      active = t;
      highlight();
      void arm().then(() => { if (!disposed && active === t) void placeContinuous(); });
    };
    const clearActive = () => {
      if (!active?.analysis) return;
      const a = active.analysis as unknown as Record<string, unknown>;
      switch (active.type) {
        case 'direct-line-measurement': a.startPoint = null; a.endPoint = null; break;
        case 'area-measurement': a.geometry = null; break;
        case 'line-of-sight': a.observer = null; a.targets = []; break;
        case 'slice': a.shape = null; break;
        case 'viewshed': a.viewsheds = []; break;
        case 'dimension': a.dimensions = []; break;
      }
    };
    clearBtn.addEventListener('click', clearActive);
    doneBtn.addEventListener('click', stop);

    const expand = new Expand({
      view, content: panel, expandIcon: 'measure',
      expandTooltip: tr('Шинжилгээ'), collapseTooltip: tr('Хаах'), mode: 'floating',
    });
    view.ui.add(expand, 'top-right');
    const openWatch = reactiveUtils.watch(() => expand.expanded, (x) => { if (x) void arm(); });

    return () => {
      disposed = true;
      openWatch.remove();
      abort?.abort();
      if (!view.destroyed) {
        view.ui.remove(expand);
        tools.forEach((t) => { if (t.analysis) sv.analyses.remove(t.analysis); });
      }
      expand.destroy();
    };
  }, [dim, ready]);

  /**
   * ЭЗЛЭХҮҮН ХЭМЖИЛТ + СЛАЙД — ЗӨВХӨН 3D/BIM (SceneView). Хоёр тусдаа Expand.
   *
   *   · Эзлэхүүн (`VolumeMeasurementAnalysis`, stockpile) — полигон зурж, огтлол/
   *     дүүргэлт/цэвэр эзлэхүүнийг бодит цагт харуулна.
   *   · Слайд (`Slide.createFrom`) — одоогийн 3D харагдацыг снапшот болгож хадгалж,
   *     дарж буцаж очно (session-д хадгална).
   */
  const slidesRef = useRef<Slide[]>([]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !is3D(dim)) return;
    const sv = view as SceneView;

    let disposed = false;
    const mk = (tag: string, css: string, txt?: string) => {
      const n = document.createElement(tag);
      n.style.cssText = css;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const rowCss = 'display:flex;justify-content:space-between;gap:10px;font-size:0.8rem';

    // ══════════ ЭЗЛЭХҮҮН ══════════
    type VMA = InstanceType<ModsTools['VolumeMeasurementAnalysis']>;
    let vma: VMA | null = null;
    let vArm: Promise<VMA | null> | null = null;
    let vAbort: AbortController | null = null;
    let vWatch: __esri.WatchHandle | null = null;

    const panelV = mk('div', 'width:min(250px, 92vw);padding:15px;display:flex;flex-direction:column;gap:11px;'
      + 'background:var(--surface);color:var(--ink)');
    panelV.append(mk('div', 'font-size:0.92rem;font-weight:700;color:var(--ink)', tr('Эзлэхүүн хэмжилт')));
    const vPlace = mk('button', 'width:100%;padding:9px;border-radius:8px;border:1px solid transparent;'
      + 'background:var(--hue);color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer', tr('＋ Полигон зурж хэмжих')) as HTMLButtonElement;
    panelV.append(vPlace);
    // Нэгж сонгогч (SDK sample шиг)
    const unitRow = mk('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px');
    unitRow.append(mk('span', 'font-size:0.78rem;color:var(--ink-3)', tr('Нэгж')));
    const volUnit = mk('select', 'padding:5px 8px;border:1px solid var(--line);border-radius:6px;'
      + 'background:var(--surface-2);color:var(--ink);font-size:0.76rem;cursor:pointer') as HTMLSelectElement;
    volUnit.innerHTML = tr('<option value="metric">Метр</option><option value="cubic-meters">м³</option>')
      + tr('<option value="cubic-feet">фут³</option><option value="cubic-yards">ярд³</option>');
    unitRow.append(volUnit);
    panelV.append(unitRow);
    volUnit.addEventListener('change', () => {
      if (vma) vma.displayUnits.volume = volUnit.value as unknown as VMA['displayUnits']['volume'];
    });
    // Үр дүн — тусгаарлах зураастай (Огтлол/Дүүргэлт/Цэвэр)
    const results = mk('div', 'display:flex;flex-direction:column;gap:8px;padding-top:11px;border-top:1px solid var(--line)');
    const cutV = mk('b', 'font-variant-numeric:tabular-nums;color:var(--ink)', '—');
    const fillV = mk('b', 'font-variant-numeric:tabular-nums;color:var(--ink)', '—');
    const netV = mk('b', 'font-variant-numeric:tabular-nums;color:var(--ink)', '—');
    const mkRow = (label: string, val: HTMLElement) => {
      const r = mk('div', rowCss);
      r.append(mk('span', 'color:var(--ink-3)', label), val);
      return r;
    };
    results.append(mkRow(tr('Огтлол'), cutV), mkRow(tr('Дүүргэлт'), fillV), mkRow(tr('Цэвэр'), netV));
    panelV.append(results);

    const fmtVol = (v?: { value?: number; unit?: string } | null) =>
      v?.value != null ? `${num(Math.round(v.value))} ${v.unit ?? ''}`.trim() : '—';

    const watchVolume = (a: VMA) => void sv.whenAnalysisView(a).then((av) => {
      if (disposed) return;
      const avv = av as unknown as { result?: Record<string, { value?: number; unit?: string }> };
      vWatch = reactiveUtils.watch(
        () => avv.result,
        (result) => {
          cutV.textContent = fmtVol(result?.cutVolume);
          fillV.textContent = fmtVol(result?.fillVolume);
          netV.textContent = fmtVol(result?.netVolume);
        },
        { initial: true },
      );
    }).catch((err) => {
      // dim солигдож view устахад reject хэвийн — зөвхөн амьд view-ийн уналтыг мэдээлнэ
      if (!disposed && !view.destroyed) console.error('[volume]', err);
    });
    const armV = (): Promise<VMA | null> => (vArm ??= loadTools3d().then((m) => {
      if (disposed || view.destroyed) return null;
      const a = new m.VolumeMeasurementAnalysis({
        measureType: 'stockpile',
        displayUnits: { volume: volUnit.value as unknown as VMA['displayUnits']['volume'], elevation: 'metric' },
      });
      vma = a;
      sv.analyses.add(a);
      watchVolume(a);
      return a;
    }).catch((err: unknown) => {
      vArm = null;
      if (!disposed && !view.destroyed) console.error('[volume]', err);
      return null;
    }));
    vPlace.addEventListener('click', async () => {
      vAbort?.abort();
      vAbort = new AbortController();
      const signal = vAbort.signal;
      try {
        const a = await armV();
        if (!a || disposed || signal.aborted) return;
        const av = await sv.whenAnalysisView(a);
        if (disposed) return;
        await av.place({ signal });
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== 'AbortError') console.error('[volume]', err);
      }
    });

    const expandV = new Expand({
      view, content: panelV, expandIcon: 'cube',
      expandTooltip: tr('Эзлэхүүн хэмжилт'), collapseTooltip: tr('Хаах'), mode: 'floating',
    });
    view.ui.add(expandV, 'top-right');
    const openWatchV = reactiveUtils.watch(() => expandV.expanded, (x) => { if (x) void armV(); });

    // ══════════ СЛАЙД ══════════
    const slides = slidesRef.current;
    const panelS = mk('div', 'width:min(262px, 92vw);padding:15px;display:flex;flex-direction:column;gap:11px;'
      + 'max-height:72vh;overflow:auto;background:var(--surface);color:var(--ink)');
    panelS.append(mk('div', 'font-size:0.92rem;font-weight:700;color:var(--ink)', tr('Слайд')));
    const listDiv = mk('div', 'display:flex;flex-direction:column;gap:6px');
    panelS.append(listDiv);

    // Слайд бүр — thumbnail зураг + нэр + огноо + × устгах (Esri sample шиг)
    /**
     * Порталын нэг дүрэм — mn-MN («2026.07.14»); урьд нь en-GB (DD/MM/YYYY)
     * байж өдөр/сар андуурагдахаар байв.
     */
    const fmtSlideDate = (d?: Date) => {
      try {
        return d
          ? d.toLocaleString(dateLocale(), {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          })
          : '';
      } catch { return ''; }
    };
    const addSlideRow = (slide: Slide) => {
      const row = mk('div', 'display:flex;align-items:center;gap:9px;padding:7px;border:1px solid var(--line);'
        + 'border-radius:8px;background:var(--surface-2);cursor:pointer');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      const img = mk('img', 'width:60px;height:40px;object-fit:cover;border-radius:5px;flex:none') as HTMLImageElement;
      // Гарчиг хажууд нь бичигдсэн тул зураг нь чимэглэл — хоосон alt
      img.alt = '';
      const thumb = (slide as unknown as { thumbnail?: { url?: string } }).thumbnail;
      if (thumb?.url) img.src = thumb.url;
      const info = mk('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px');
      const date = (slide as unknown as { environment?: { lighting?: { date?: Date } } }).environment?.lighting?.date;
      info.append(
        mk('div', 'font-size:0.78rem;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
          slide.title?.text || tr('Слайд')),
        mk('div', 'font-size:0.66rem;color:var(--ink-3)', fmtSlideDate(date)),
      );
      const del = mk('button', 'flex:none;width:24px;height:24px;display:grid;place-items:center;border:0;'
        + 'background:transparent;color:var(--ink-3);cursor:pointer;font-size:1.15rem;line-height:1', '×') as HTMLButtonElement;
      del.title = tr('Устгах');
      del.setAttribute('aria-label', `${tr('Устгах')}: ${slide.title?.text || tr('Слайд')}`);
      row.append(img, info, del);
      row.setAttribute('aria-label', slide.title?.text || tr('Слайд'));
      row.addEventListener('click', () => { void slide.applyTo(sv, { speedFactor: 0.6 }); });
      row.addEventListener('keydown', (e) => {
        if (e.target !== row) return;          // × товч дээрх Enter-ийг бүү барь
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void slide.applyTo(sv, { speedFactor: 0.6 });
        }
      });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = slides.indexOf(slide);
        if (i >= 0) slides.splice(i, 1);
        row.remove();
      });
      listDiv.append(row);
    };
    for (const sl of slides) addSlideRow(sl);

    // Доод хэсэг: «Слайд нэмэх» — нэр + Үүсгэх
    const addWrap = mk('div', 'display:flex;flex-direction:column;gap:6px;padding-top:9px;border-top:1px solid var(--line)');
    addWrap.append(mk('div', 'font-size:0.72rem;color:var(--ink-3)', tr('Слайд нэмэх')));
    const addRow = mk('div', 'display:flex;gap:6px');
    const nameInput = mk('input', 'flex:1;min-width:0;padding:7px 9px;border:1px solid var(--line);border-radius:7px;'
      + 'background:var(--surface-2);color:var(--ink);font-size:0.78rem') as HTMLInputElement;
    nameInput.placeholder = tr('Нэр оруулах');
    const createBtn = mk('button', 'flex:none;padding:7px 13px;border-radius:7px;border:1px solid transparent;'
      + 'background:var(--hue);color:#fff;font-size:0.78rem;font-weight:600;cursor:pointer', tr('Үүсгэх')) as HTMLButtonElement;
    addRow.append(nameInput, createBtn);
    // Снапшот унахад товч «юу ч хийгээгүй» мэт чимээгүй байсан — алдааг ил хэлнэ
    const slideErr = mk('div', 'display:none;font-size:0.7rem;color:var(--bad-ink)',
      tr('Слайд үүсгэж чадсангүй — дахин оролдоно уу.'));
    addWrap.append(addRow, slideErr);
    panelS.append(addWrap);

    createBtn.addEventListener('click', () => {
      slideErr.style.display = 'none';
      void loadTools3d().then((m) => m.Slide.createFrom(sv)).then((slide) => {
        if (disposed) return;
        slide.title.text = nameInput.value.trim() || tr('Слайд {0}', slides.length + 1);
        slides.push(slide);
        addSlideRow(slide);
        nameInput.value = '';
      }).catch((err) => {
        // Харагдац солигдох агшны уналт хэрэглэгчид хамаагүй — амьд панел дээр л мэдэгдэнэ
        if (disposed || view.destroyed) return;
        slideErr.style.display = 'block';
        console.error('[slide]', err);
      });
    });

    const expandS = new Expand({
      view, content: panelS, expandIcon: 'image',
      expandTooltip: tr('Харагдацын слайд'), collapseTooltip: tr('Хаах'), mode: 'floating',
    });
    view.ui.add(expandS, 'top-right');

    return () => {
      disposed = true;
      openWatchV.remove();
      vAbort?.abort();
      vWatch?.remove();
      if (!view.destroyed) {
        view.ui.remove(expandV);
        view.ui.remove(expandS);
        if (vma) sv.analyses.remove(vma);
      }
      expandV.destroy();
      expandS.destroy();
    };
  }, [dim, ready]);

  /**
   * BIM УДИРДЛАГЫГ ВИДЖЕТИЙН БАГЦЫН ХАМГИЙН ДООР БАЙРЛУУЛНА
   * (хэрэглэгчийн хүсэлт, 2026-08-23).
   *
   *   суурь зураг · дэлгэц дүүрэн · шинжилгээ · эзлэхүүн · слайд · **BIM**
   */
  useEffect(() => {
    const view = viewRef.current;
    const expand = bimExpandRef.current;
    if (!view || !ready || dim !== 'bim' || !expand) return;
    view.ui.add(expand, 'top-right');
    return () => { if (!view.destroyed) view.ui.remove(expand); };
  }, [dim, ready]);

  /**
   * ПОЛИГОН ЗУРАХ — `SketchViewModel` («Газар чөлөөлөлт»).
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || !sketch || is3D(dim)) return;
    const SVM = sketchMod;
    if (!SVM) {
      loadSketchMod().then(() => setSketchTick((t) => t + 1))
        .catch((e: unknown) => console.warn('[MapCanvas] SketchViewModel ачаалагдсангүй', e));
      return;
    }

    let gl = map.findLayerById('sketch') as GraphicsLayer | null;
    if (!gl) {
      gl = new GraphicsLayer({ id: 'sketch', listMode: 'hide' });
      map.add(gl);
    }
    const layer = gl;

    const svm = new SVM({
      view: view as MapView,
      layer,
      tooltipOptions: { enabled: true, inputEnabled: true } as never,
      labelOptions: { enabled: true } as never,
      snappingOptions: { enabled: true, selfEnabled: true, featureEnabled: true } as never,
      valueOptions: { displayUnits: { length: 'meters', area: 'square-meters' } } as never,
      // Зурсан талбайн симбол — БАРИЛГА (ногоон) ба КАДАСТР (цэнхэр) хоёроос
      // ЯЛГААТАЙ улбар шар, тасархай хүрээ: сонголтын хил гэдэг нь тод харагдана.
      polygonSymbol: {
        type: 'simple-fill',
        color: [245, 158, 11, 0.08],
        outline: { color: [217, 119, 6, 1], width: 2, style: 'dash' },
      } as unknown as __esri.SimpleFillSymbol,
      polylineSymbol: {
        type: 'simple-line',
        color: [217, 119, 6, 1],
        width: 2.5,
        style: 'dash',
      } as unknown as __esri.SimpleLineSymbol,
      pointSymbol: {
        type: 'simple-marker',
        style: 'circle',
        size: 9,
        color: [245, 158, 11, 0.9],
        outline: { color: [217, 119, 6, 1], width: 1.6 },
      } as unknown as __esri.SimpleMarkerSymbol,
    });
    sketchVMRef.current = svm;
    if (typeof window !== 'undefined') {
      (window as unknown as { __dbgsketch: SketchViewModel }).__dbgsketch = svm;
    }
    if (pendingDrawRef.current) {
      pendingDrawRef.current = 0;
      svm.create(drawKindRef.current);
    }

    const emit = (g: __esri.Geometry | null) => onSketchRef.current?.(g);

    const created = svm.on('create', (e) => {
      if (e.state === 'complete' || ((e.state === 'start' || e.state === 'active') && e.toolEventInfo?.type === 'vertex-add')) sketchEvtRef.current += 1;
      if (e.state === 'cancel') {
        if (!selfCancelRef.current) onSketchCancelRef.current?.();
        return;
      }
      if (e.state !== 'complete') return;
      // Зөвхөн СҮҮЛИЙН полигоныг үлдээнэ — өмнөхийг арилгана
      const keep = e.graphic;
      layer.removeAll();
      layer.add(keep);
      emit(keep.geometry ?? null);
    });
    const updated = svm.on('update', (e) => {
      const g = e.graphics?.[0]?.geometry ?? null;
      if (!g) return;
      /**
       * `SketchViewModel` нь `update` үйл явдлыг ГУРВАН төлөвт гаргадаг:
       * `start` (засвар эхлэв) · `active` (чирж байна) · `complete`
       * (дуусав, цуцлагдсан бол `aborted: true`). Урьд нь гурвуулангийн
       * геометрийг ялгалгүй дамжуулдаг байсан тул:
       *
       *   · `start` — объект дарангуут ХӨДӨЛГӨӨГҮЙ геометр «засвар» болж
       *     бүртгэгдэж, «Хэлбэр хадгалах» товч чирэхээс ӨМНӨ идэвхжинэ.
       *     Дарвал ижил геометр буцаж бичигдэж `editDate` хуурамчаар
       *     шинэчлэгдэнэ (`DedButets` §commitReshape-ийн хориглосон бичилт).
       *   · `aborted` — «Болих» дарахад `svm.cancel` нь `complete`+
       *     `aborted` гаргадаг тул ЦУЦАЛСАН засвар дахин бүртгэгдэж,
       *     «Хадгалаагүй өөрчлөлт байна» гэж ХУДАЛ асуудаг байв.
       */
      const st = (e as unknown as { state?: string; aborted?: boolean });
      if (st.state === 'start' || st.aborted) return;
      if (onReshapeRef.current) onReshapeRef.current(g);
      else if (st.state === 'complete') emit(g);
    });
    const deleted = svm.on('delete', () => {
      layer.removeAll();
      emit(null);
    });

    return () => {
      created.remove();
      updated.remove();
      deleted.remove();
      svm.destroy();
      sketchVMRef.current = null;
    };
  }, [sketch, dim, ready, sketchTick]);

  useEffect(() => {
    const svm = sketchVMRef.current;
    const map = mapRef.current;
    if (!svm || !map || !sketch) return;
    const on = new Set(visibleKey.split(','));
    const layers = [...on].map((id) => ensureMapLayer(map, id)).filter((l): l is Layer => l?.type === 'feature');
    try {
      (svm.snappingOptions as unknown as { featureSources: unknown }).featureSources =
        layers.map((layer) => ({ layer, enabled: true })) as never;
    } catch { /* хуучин SDK — наалдалтгүй хэвээр */ }
  }, [visibleKey, sketch, ready, dim, sketchTick]);

  /** Гадны «Полигон зурах» товч — шинэ полигон зурж эхэлнэ */
  useEffect(() => {
    if (!drawToken) return;
    const svm = sketchVMRef.current;
    if (!svm) { pendingDrawRef.current = drawToken; return; }
    pendingDrawRef.current = 0;
    quietCancel(svm, selfCancelRef);
    svm.create(drawKindRef.current);
  }, [drawToken]);

  /**
   * БАЙГАА ОБЪЕКТЫГ VERTEX-ЭЭР ЗАСАХ — `reshapeToken` өсөхөд эхэлнэ.
   */
  useEffect(() => {
    if (!reshapeToken) return;
    const svm = sketchVMRef.current;
    const map = mapRef.current;
    const g = reshapeGeomRef.current as { [k: string]: unknown } | undefined;
    if (!svm || !map || !g) return;
    const gl = map.findLayerById('sketch') as GraphicsLayer | null;
    if (!gl) return;
    quietCancel(svm, selfCancelRef);
    gl.removeAll();
    /* Геометрийн төрлийг талбараас нь таана — `toJSON()` нь `type` бичдэггүй */
    const kind = 'paths' in g ? 'polyline' : 'rings' in g ? 'polygon' : 'point';
    const graphic = new Graphic({
      geometry: { ...g, type: kind } as unknown as __esri.Geometry,
      symbol: (kind === 'polyline'
        ? svm.polylineSymbol
        : kind === 'polygon'
          ? svm.polygonSymbol
          : svm.pointSymbol) as never,
    });
    gl.add(graphic);
    try { svm.update([graphic]); } catch { /* геометр танигдсангүй */ }
  }, [reshapeToken, sketchTick]);

  const onMapContextRef = useRef(onMapContext);
  useSyncRef(onMapContextRef, onMapContext);
  const hasMapContext = Boolean(onMapContext);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !hasMapContext || is3D(dim)) return;
    const box = (view as MapView).container as HTMLElement | null;
    const noMenu = (e: MouseEvent) => e.preventDefault();
    box?.addEventListener('contextmenu', noMenu);
    const down = view.on('pointer-down', (e: __esri.ViewPointerDownEvent) => {
      if (e.button !== 2) return;
      const mp = (view as MapView).toMap({ x: e.x, y: e.y });
      if (!mp) return;
      const g = mp.spatialReference?.isWebMercator
        ? webMercatorUtils.webMercatorToGeographic(mp) as __esri.Point
        : mp;
      const r = box?.getBoundingClientRect();
      onMapContextRef.current?.({
        lat: g.y, lon: g.x,
        clientX: (r?.left ?? 0) + e.x, clientY: (r?.top ?? 0) + e.y,
      });
    });
    return () => {
      down.remove();
      box?.removeEventListener('contextmenu', noMenu);
    };
  }, [ready, dim, hasMapContext]);

  /**
   * КООРДИНАТЫН ЦЭГИЙГ ЯВЖ БУЙ ЗУРААЛТАД НЭМНЭ (`sketchVertex`).
   */
  useEffect(() => {
    if (!sketchVertex?.token) return;
    const svm = sketchVMRef.current;
    const view = viewRef.current as MapView | null;
    if (!svm || !view || is3D(dim)) return;
    const { lat, lon } = sketchVertex;
    let cancelled = false;
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    void (async () => {
      if (svm.state !== 'active') {
        quietCancel(svm, selfCancelRef);
        svm.create(drawKindRef.current);
        await frame();
      }
      const pt = webMercatorUtils.geographicToWebMercator(
        new Point({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      ) as Point;
      const inView = view.extent?.clone().expand(0.9).contains(pt);
      if (!inView) {
        try { await view.goTo({ target: pt }, { animate: false }); } catch { /* шилжилт тасалдав */ }
        await frame();
      }
      if (cancelled) return;
      const sc = view.toScreen(pt);
      const surface = (view as unknown as { surface?: HTMLElement }).surface ?? (view.container as HTMLElement | null);
      if (!sc || !surface) return;
      const r = surface.getBoundingClientRect();
      const clientX = r.left + sc.x;
      const clientY = r.top + sc.y;
      const snap = svm.snappingOptions as unknown as { enabled?: boolean } | undefined;
      const snapWas = snap?.enabled;
      if (snap) snap.enabled = false;
      const ev = (type: string, buttons: number) => new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse',
        isPrimary: true, button: 0, buttons, clientX, clientY,
      });
      const before = sketchEvtRef.current;
      surface.dispatchEvent(ev('pointermove', 0));
      surface.dispatchEvent(ev('pointerdown', 1));
      surface.dispatchEvent(ev('pointerup', 0));
      /* Наалдалтыг дараагийн кадрт сэргээнэ — SDK товшилтыг боловсруулж дууссаны дараа */
      window.setTimeout(() => { if (snap && snapWas !== undefined) snap.enabled = snapWas; }, 50);
      window.setTimeout(() => {
        if (cancelled) return;
        onSketchVertexRef.current?.(sketchEvtRef.current !== before);
      }, 200);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- зөвхөн шинэ token-оор
  }, [sketchVertex?.token]);

  /** Гадны «Алхам буцаах» товч — зураалтын сүүлийн үйлдлийг цуцална */
  useEffect(() => {
    if (!sketchUndoToken) return;
    try { sketchVMRef.current?.undo(); } catch { /* буцаах алхам алга */ }
  }, [sketchUndoToken]);

  /** Гадны «Цэвэрлэх» товч — зурсан полигоныг арилгаж, шүүлтийг цуцлана */
  useEffect(() => {
    if (!clearToken) return;
    pendingDrawRef.current = 0;
    quietCancel(sketchVMRef.current, selfCancelRef);
    const gl = mapRef.current?.findLayerById('sketch') as GraphicsLayer | null;
    gl?.removeAll();
    onSketchRef.current?.(null);
  }, [clearToken]);

  /**
   * Харагдац БҮРМӨСӨН солиход зурсан полигоныг цэвэрлэнэ. Map нь `mapCache`-д
   * үлдэж plan/monitor/bagts-тай ХУВААЛЦАГДДАГ тул цэвэрлэхгүй бол Газар
   * чөлөөлөлтөд зурсан полигон бусад харагдацад харагдана. deps `[uniform]` тул
   * зөвхөн unmount-д ажиллана (2D↔3D солиход полигон хэвээр).
   */
  useEffect(() => () => {
    const gl = mapCache[uniform ? 'uniform' : 'themed']?.findLayerById('sketch') as GraphicsLayer | null;
    gl?.removeAll();
  }, [uniform]);

  /**
   * ПУЛЬС-АНИМАЦИ (Эх үүсвэр) — `source:eh`-ийн полигонууд газрын зураг дээр
   * ил байх ХУГАЦААНД центроид тойруулан БАЙНГА томорч-жижгэрч «амьсгалдаг».
   * Зорилго: хэрэглэгч эх үүсвэрийн байршлыг амархан анзаарах.
   */
  // `pulseLayer` нь тогтвортой лавлагаатай (useCallback) тул props-ыг ref-ээр уншина.
  useSyncRef(pulseIdsRef, pulseIds ?? []);
  useSyncRef(layerStyleRef, layerStyle ?? {});

  const pulseLayer = useCallback((layer: Layer) => {
    const map = mapRef.current;
    if (!map || (layer.id !== 'source:eh' && !pulseIdsRef.current.includes(layer.id)))
      return;
    const id = layer.id;
    if (fadingRef.current.has(id)) return;      // аль хэдийн пульсэлж байна
    const d = LAYER_BY_ID[id];
    const src = layer as FeatureLayer;
    if (!d) return;
    fadingRef.current.add(id);

    // Пульслэх хуулбарын давхарга (нэг удаа үүсгэнэ)
    let gl = map.findLayerById('source:pulse') as GraphicsLayer | null;
    if (!gl) {
      gl = new GraphicsLayer({ id: 'source:pulse', listMode: 'hide' });
      map.add(gl);
    }
    const pulse = gl;
    const pfield = d.paint?.field;
    const pvals = d.paint?.values ?? {};

    let own: Graphic[] = [];
    const finish = () => {
      fadingRef.current.delete(id);
      if (own.length) pulse.removeMany(own);
      own = [];
    };

    let cancelled = false;
    let raf = 0;
    const cancel = () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      finish();
      delete pulseCancels.current[id];
    };
    pulseCancelRef.current = cancel;
    pulseCancels.current[id] = cancel;

    // 7 объектын геометр + өнгийг НЭГ УДАА татаад пульслэнэ.
    src.queryFeatures({
      where: (src.definitionExpression as string | null) || '1=1',
      returnGeometry: true,
      outFields: pfield ? [pfield] : ['*'],
    })
      .then((fs) => {
        const items = fs.features
          .map((ft) => {
            const poly = ft.geometry as Polygon | null;
            const c = poly?.centroid;
            if (!poly || !poly.rings || !c) return null;
            const ov = layerStyleRef.current[id];
            const hue = ov?.hue ?? ((pfield && pvals[String(ft.attributes?.[pfield])]) || d.hue);
            return { rings: poly.rings, cx: c.x, cy: c.y, sr: poly.spatialReference,
              symbol: ov ? fill(hue, ov.fill ?? 0.25, ov.width ?? 3) : symbolOf(d, hue) };
          })
          .filter(Boolean) as Array<{ rings: number[][][]; cx: number; cy: number;
            sr: __esri.SpatialReference; symbol: unknown }>;
        if (cancelled || !items.length || src.destroyed || !src.visible) { finish(); return; }

        // Эх давхаргыг (label-тайгаа) харагдуулж үлдээнэ; дээр нь томорч-жижгэрэх
        // хуулбар давхарлана. Хуулбар зөвхөн ≥1× томроод буцах тул зай гарахгүй.
        const graphics = items.map((it) => {
          // symbolOf нь энгийн simple-fill объект буцаадаг — Graphic өөрөө autocast хийнэ.
          const g = new Graphic({
            geometry: new Polygon({ rings: it.rings, spatialReference: it.sr }),
            symbol: it.symbol as __esri.SimpleFillSymbolProperties & { type: 'simple-fill' },
          });
          pulse.add(g);
          return g;
        });
        own = graphics;

        const PERIOD = 1400;        // нэг мөчлөг (мс)
        const GROW = 0.35;          // 1×…1.35× томроод буцна
        let base = -1;
        const step = (t: number) => {
          if (base < 0) base = t;
          if (cancelled || src.destroyed || !src.visible) { finish(); return; }
          const wave = 0.5 - 0.5 * Math.cos(((t - base) % PERIOD) / PERIOD * Math.PI * 2);
          const f = 1 + GROW * wave;              // 1…1.35…1
          items.forEach((it, i) => {
            const scaled = it.rings.map((ring) =>
              ring.map(([x, y]) => [it.cx + (x - it.cx) * f, it.cy + (y - it.cy) * f]));
            graphics[i].geometry = new Polygon({ rings: scaled, spatialReference: it.sr });
          });
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      })
      .catch(() => finish());
  }, []);

  /**
   * Unmount — идэвхтэй пульс-гогцоог ЗААВАЛ цуцална. Харагдацын эффектийн
   * cleanup-д БИШ: тэр нь бүс/тодруулга солигдох бүрд ажилладаг тул пульс
   * дундаа тасарч дахин эхлэхгүй байсан. Давхарга нуугдахад гогцоо `!visible`
   * шалгалтаараа өөрөө зогсоно — энд зөвхөн unmount-ын үүрд-гогцоог хаана.
   */
  useEffect(
    () => () => {
      Object.values(pulseCancels.current).forEach((f) => f());
      pulseCancelRef.current?.();
      pulseCancelRef.current = null;
    },
    [],
  );

  /**
   * Пульсийг ДАХИН эхлүүлнэ — шүүлт солигдоход хуучин хуулбарыг таслах ёстой.
   */
  const restartPulse = useCallback((layer: Layer) => {
    pulseCancels.current[layer.id]?.();
    fadingRef.current.delete(layer.id);
    pulseLayer(layer);
  }, [pulseLayer]);


  /**
   * ХАМРАХ ХҮРЭЭНИЙ БУФЕР — нийгмийн байгууламжийн эргэн тойрны нормативын
   * радиусыг ГАЗРЫН ЗУРАГТ тойрог болгож зурна (БНбД 30.01.03).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const REACH_ID = 'irged:reach';
    const REACH_PAGE = 2000;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);
    const want = is3D(dim)
      ? []
      : REACH_BUFFERS.filter((g) => g.ids.some((id) => on.has(id)));

    let gl = map.findLayerById(REACH_ID) as GraphicsLayer | null;
    if (!want.length) {
      if (gl) { map.remove(gl); gl.destroy(); }
      return;
    }
    if (!gl) {
      /**
       * Түүхэн хоёр алдаа: (1) индекс 2 нь ортофотогийн ДООР орж тойрог огт
       * харагдахгүй байв; (2) хамгийн дээр тавихад буферийн тасархай хүрээ ба
       * «300 м» шошго нь нүхэн жорлонгийн кластер, тэдний цагаан тоон дээгүүр
       * давхарлаж, зураг «холилдож» байв. Индексийг ортофотогийн бүлгээс
       * БОДОЖ олох нь хоёуланг нь шийднэ — давхаргын тоо өөрчлөгдсөн ч зөв.
       */
      gl = new GraphicsLayer({ id: REACH_ID, listMode: 'hide' });
      map.add(gl);
    }
    const layer = gl;
    let alive = true;

    (async () => {
      const graphics: Graphic[] = [];
      for (const g of want) {
        let labelled = false;
        for (const id of g.ids) {
          const fl = mapLayer(map, id) as FeatureLayer | null;
          if (!fl) continue;
          try {
            await fl.load();
            const feats: __esri.Graphic[] = [];
            for (let start = 0; alive; ) {
              const q = fl.createQuery();
              q.where = (fl.definitionExpression as string | null) || '1=1';
              q.returnGeometry = true;
              q.outFields = [fl.objectIdField];
              q.orderByFields = [`${fl.objectIdField} ASC`];
              q.start = start;
              q.num = REACH_PAGE;
              const res = await fl.queryFeatures(q);
              feats.push(...res.features);
              if (res.features.length === 0 || !res.exceededTransferLimit) break;
              start += res.features.length;
            }
            for (const f of feats) {
              if (!f.geometry) continue;
              /* Полигон барилгын ТӨВӨӨС буфер — ирмэгээс нь биш. Норматив нь
                 «барилга хүртэлх зай» тул төв нь хамгийн ойрын төлөөлөл. */
              const gm = f.geometry as __esri.Polygon;
              const c = gm.centroid ?? gm.extent?.center ?? f.geometry;
              /**
               * `data` үйлчилгээ нь UTM 48N (32648) — МЕТРИЙН проекц. Тэнд
               * `geodesicBuffer` нь ДЭМЖИГДДЭГГҮЙ (зөвхөн WGS84/Web Mercator)
               * бөгөөд чимээгүй `null` буцаадаг тул буфер огт үүсэхгүй байв —
               * «2D дээр буфер харагдахгүй» гэдгийн ЖИНХЭНЭ шалтгаан.
               * Метрийн проекцод энгийн (planar) буфер нь газрын бодит метр
               * тул зөв; Web Mercator-т л геодезик хэрэгтэй (тэнд метр нь
               * өргөрөгөөр гажина).
               */
              const wk = c.spatialReference?.wkid ?? 0;
              const isMercator = wk === 3857 || wk === 102100 || wk === 4326;
              const buf = (isMercator
                ? geometryEngine.geodesicBuffer(c, g.m, 'meters')
                : geometryEngine.buffer(c, g.m, 'meters')) as __esri.Polygon | null;
              if (!buf) continue;
              graphics.push(new Graphic({
                geometry: buf,
                symbol: {
                  type: 'simple-fill',
                  color: [...rgb(g.hue), 0.1],
                  outline: { color: [...rgb(g.hue), 0.9], width: 1.6, style: 'dash' },
                } as unknown as __esri.SimpleFillSymbol,
              }));

              /**
               * ШОШГО — тойргийн ДЭЭД ирмэг дээр, радиусыг хэлнэ.
               */
              if (labelled) continue;
              labelled = true;
              graphics.push(new Graphic({
                geometry: new Point({
                  x: (c as __esri.Point).x,
                  y: (c as __esri.Point).y + g.m,
                  spatialReference: c.spatialReference,
                }),
                symbol: {
                  type: 'text',
                  text: tr('{0} м', String(g.m)),
                  /* Тойргийн хүрээтэй ижил ханалт — бүлэгт ГАНЦ шошго тул
                     бүдгэрүүлэх шаардлагагүй, харин уншигдах ёстой. */
                  color: [...rgb(g.hue), 0.95],
                  haloColor: [12, 18, 22, 0.85],
                  haloSize: 1.8,
                  font: { size: 10.5, weight: 'bold' },
                  yoffset: 3,
                } as unknown as __esri.TextSymbol,
              }));
            }
          } catch {
            /* Давхарга ачаалагдаагүй/хаалттай — буферийг чимээгүй алгасна */
          }
        }
      }
      if (!alive || layer.destroyed) return;
      layer.removeAll();
      layer.addMany(graphics);
    })();

    return () => { alive = false; };
  }, [ready, visibleKey, dim, zone, layerWhere]);

  /* Харагдац ба БҮСИЙН шүүлт */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);

    const elev = dim === '3d' ? ON_SCENE : ON_GROUND;

    lazyTop(map).forEach((l) => {
      /* `source:eh` шинээр ил болов — пульсийг where тавигдсаны ДАРАА (доор) эхлүүлнэ */
      let pulseEh = false;
      if (l.id === IMAGERY_ID) {
        l.visible = ortho;
        lazyKids(map, l).forEach((c) => {
          const v = orthoFlightVer(c.id);
          if (v) c.visible = v === meshVer;
        });
        return;
      }
      if (l.id === LAZY_END) return;
      if (l.id.startsWith(MESH_CMP_PREFIX)) return;
      // Хамрах хүрээний буфер — өөрийн эффект удирдана (каталогт үл хамаарна)
      if (l.id === 'irged:reach') return;
      if (l.id === 'sketch') { l.visible = true; return; }
      // Эх үүсвэрийн пульс-хуулбар — өөрийн анимаци удирдана, каталогт үл хамаарна.
      if (l.id === 'source:pulse') { l.visible = true; return; }
      /**
       * «Эрсдэлийн загвар»-ын ҮР ДҮНГИЙН давхаргууд (`ersdel:flood` усны
       * анимаци, `ersdel:band` аюулын муж, `ersdel:damage` өртсөн объект,
       * `ersdel:station` харуул) — ӨӨРСДӨӨ удирдана, каталогт ХЭЗЭЭ Ч орохгүй.
       */
      if (String(l.id).startsWith('ersdel:')) { l.visible = true; return; }
      /* + «Хэсэгчилсэн ЕТ» 03-ийн нэмэлт холболт (`need:`, `HesegNeed.tsx`) — мөн өөрөө удирдана */
      if (String(l.id).startsWith('overlap:') || String(l.id).startsWith('need:') || String(l.id).startsWith('change:')) return;
      // Лавлагааны хилүүд — каталогоос үл хамааран БҮХ зурагт үргэлж ил.
      if ((ALWAYS_ON_IDS as readonly string[]).includes(String(l.id))
        || alwaysOnKey.split(',').includes(String(l.id))) { l.visible = true; return; }
      /**
       * НҮХЭН ЖОРЛОН — 3D-д зайнаас ЦЭГ, ойроос CALLOUT.
       *
       * Солилтыг давхаргын масштабын хязгаараар хийнэ (ажиллах явцад юу ч
       * бодогдохгүй):
       *   · цэг     — 3D-д `maxScale = 3,000` тавьж ойртоход АЛГА болно;
       *               2D-д хязгааргүй (0) тул бүх зумд харагдана.
       *   · callout — `minScale = 3,000` (build-д тогтоосон) тул зөвхөн ойроос,
       *               мөн ЗӨВХӨН 3D-д. 2D-д дээрээс харахад босоо шугам
       *               харагдахгүй тул утгагүй.
       */
      if (l.id === IRGED_TOILET.id) {
        const fl = l as FeatureLayer;
        fl.visible = on.has(l.id) && dim !== 'bim';
        fl.maxScale = is3D(dim) ? TOILET_PIN_SCALE : 0;
        /**
         * Симбол нь ГОРИМООР өөр:
         *   · 2D → хавтгай цэг (`toiletDot`) + кластер + bloom
         *   · 3D → газраас бага зэрэг хөвсөн дугуй (`toiletIcon3D`) — эс бөгөөс
         *          мешийн барилга, хашааны ард нуугдана
         * `buildLayers` нь горимыг мэдэхгүй (Map кэшлэгддэг) тул ЭНД тавина.
         */
        fl.renderer = (
          is3D(dim) ? toiletIcon3D(IRGED_TOILET.hue) : toiletDot(IRGED_TOILET.hue)
        ) as unknown as __esri.Renderer;
        return;
      }
      if (l.id === TOILET_PIN_ID) {
        l.visible = on.has(IRGED_TOILET.id) && dim === '3d';
        return;
      }
      if (l.id.startsWith('scene:')) { l.visible = dim === '3d'; return; }
      if (l.id.startsWith('bim:')) { l.visible = dim === 'bim'; return; }
      // Web scene-ийн 3D давхаргууд — ЗӨВХӨН BIM горимд (SceneView) харагдана.
      if (l.id.startsWith('scene3d:')) { l.visible = dim === 'bim'; return; }
      // Хүүхдийн тоглоомын 3D хувилбар — мөн зөвхөн BIM-д
      if (l.id === 'tgl3d') { l.visible = dim === 'bim'; return; }
      if (l.id === USAN_SAN.id) { l.visible = false; return; }

      /**
       * СУУРЬ давхаргууд (план 2D-ийн 14) — каталогийн сонголт ХООСОН үед 2D-д
       * бүгд харагдана (анхны зураг план 2D шигээ бүрэн). Хэрэглэгч каталогоос
       * ЯМАР НЭГ давхарга сонгомогц суурь нь унтарч, ЗӨВХӨН сонгосон нь үлдэнэ;
       * сонголтоо арилгахад суурь буцаж асна. 3D-д меш, BIM-д scene3d:* орлоно.
       */
      if ((BASE_MAP_IDS as readonly string[]).includes(String(l.id))) {
        l.visible = dim === '2d'
          && (bare ? on.has(String(l.id)) : on.size === 0 || on.has(String(l.id)));
      } else if (is3D(dim) && PLAN2D_ALIASED.has(String(l.id))) {
        /**
         * План2d ALIAS style-тай давхаргууд (dugui, nogoon, et:24, et:27, et:29) — renderer
         * нь зурган текстур (esriPFS/esriPMS) тул SceneView-д дэмжигдэхгүй. 3D/BIM-д
         * НУУНА: асаалттай орхивол «picture-fill is unsupported in 3D» алдаа асгарна.
         */
        l.visible = false;
      } else {
        const show = on.has(l.id) && dim !== 'bim';
        // ЗӨВХӨН Эх үүсвэр (`source:eh`) давхарга шинээр ил болоход анзаарагдам
        // пульс-анимаци эхэлнэ. Бусад давхаргад (барилга г.м.) анимаци байхгүй.
        pulseEh = show && l.id === 'source:eh' && !prevVisRef.current.has(l.id);
        l.visible = show;
        const lid = String(l.id);
        if (LAYER_BY_ID[lid] && !lid.startsWith('infra:') && !lid.startsWith('iot:')) {
          const cur = (l as FeatureLayer).elevationInfo as { mode?: string; offset?: number | null; featureExpressionInfo?: unknown } | null;
          const want = (elev as { mode: string }).mode;
          if (!(cur && cur.mode === want && !cur.offset && elevExpr(cur) === elevExpr(elev))) {
            (l as FeatureLayer).elevationInfo = elev as never;
          }
        }
      }

      /**
       * Бүсийн шүүлт — `definitionExpression`-оор объектыг БҮРЭН хасна.
       */
      const d = LAYER_BY_ID[l.id];

      /* Харагдацын хэв маягийн дарлага — тухайн давхаргыг ЭНЭ харагдацад л
         өөр өнгө/зузаанаар зурна (жишээ нь давхцсан нэгж талбар). */
      if ('renderer' in l) {
        const ov = layerStyle?.[l.id];
        const fl = l as FeatureLayer;
        if (ov) {
          if (!(l.id in styleBackup.current))
            styleBackup.current[l.id] = fl.renderer as unknown;
          const symOf = (hue: string) => (
            d?.geom === 'point'
              ? dot(hue, ov.size ?? (d.size ?? 9) * DOT_SCALE, d.marker ?? 'circle')
              : d?.geom === 'line'
                ? line(hue, ov.width ?? d.width ?? LINE_PX, d.dash ?? 'solid')
                : fill(hue, ov.fill ?? 0.25, ov.width ?? 3));
          if (ov.classes) {
            fl.renderer = {
              type: 'unique-value',
              valueExpression: ov.classes.expression,
              uniqueValueInfos: Object.entries(ov.classes.hues).map(([value, h]) => ({ value, symbol: symOf(h) })),
            } as unknown as FeatureLayer['renderer'];
          } else {
            const hue = ov.hue ?? d?.hue ?? '#0891b2';
            fl.renderer = simple(symOf(hue)) as unknown as FeatureLayer['renderer'];
          }
        } else if (l.id in styleBackup.current) {
          fl.renderer = styleBackup.current[l.id] as FeatureLayer['renderer'];
          delete styleBackup.current[l.id];
        }
      }

      if (d && 'definitionExpression' in l) {
        // `layerWhere` заасан бол давхарга бүрийн өөрийн WHERE; эс бөгөөс бүсийн
        // нэгдсэн шүүлт (cross-filter дашбоард нь давхарга тус бүрээ шүүнэ).
        const own = layerWhere?.[l.id] ?? null;
        const base = own ?? (zone ? zoneWhere(d, zone) : null);
        const hlOn = is3D(dim) && hl.where && (!hlOnly || hlOnly.includes(l.id))
          ? hl.where
          : null;
        const parts = [d.where ?? null, base, hlOn].filter(Boolean) as string[];
        (l as FeatureLayer).definitionExpression = (
          parts.length ? parts.map((p) => `(${p})`).join(' AND ') : null
        ) as unknown as string;

        /*
           Мөн зөвхөн «шинээр ил боллоо» гэдэг хангалтгүй: багц солиход давхарга
           ил хэвээр үлддэг тул ШҮҮЛТ өөрчлөгдөхөд ч дахин эхлүүлнэ. */
        const lit = l.visible && dim !== 'bim';
        if (lit && pulseIds?.includes(l.id)) {
          const w = (l as FeatureLayer).definitionExpression ?? null;
          if (pulsedWhere.current[l.id] !== w) {
            pulsedWhere.current[l.id] = w;
            restartPulse(l);
          }
        } else if (!lit && l.id in pulsedWhere.current) {
          // Давхарга нуугдлаа — анивчих ХУУЛБАРЫГ нь заавал цэвэрлэнэ.
          pulseCancels.current[l.id]?.();
          delete pulsedWhere.current[l.id];
        }
      }
      if (pulseEh) pulseLayer(l);
    });
    lazyShowVisible(map);
    // Дараагийн өөрчлөлтөд «шинээр ил болсон»-ыг зөв илрүүлэхийн тулд тэмдэглэнэ.
    prevVisRef.current = on;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, alwaysOnKey, dim, ready, zone, layerWhere, layerStyle, hl, hlOnly, uniform, bare, ortho, pulseLayer, meshVer]);

  /**
   * ТУНГАЛАГ — давхарга бүрийн `opacity`-г override-оор тавина. Override байхгүй
   * давхарга нь build-time анхдагчаа (эх webmap-ийн opacity эсвэл 1) хадгална.
   */
  const opacityKey = JSON.stringify(opacity ?? {});
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const over = opacity ?? {};
    lazyTop(map).forEach((l) => {
      if (!('opacity' in l) || l.id === IMAGERY_ID || l.id === 'sketch') return;
      const def = defaultOpacityRef.current;
      // Анхдагчийг НЭГ УДАА тогтооно — override арилахад буцах цэг
      if (def[l.id] == null) def[l.id] = typeof l.opacity === 'number' ? l.opacity : 1;
      l.opacity = over[l.id] ?? def[l.id];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacityKey, visibleKey, ready, dim, uniform]);

  /**
   * ХАРЬЦУУЛАХ SWIPE — `swipe` проп. Давхаргыг id-аар `map.layers`-ээс олно.
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || dim !== '2d' || !layerFilters?.length) return;
    let alive = true;
    const applied = new globalThis.Map<__esri.FeatureLayerView, { previous: __esri.FeatureLayerView['filter']; current: __esri.FeatureFilter }>();
    const pending = new Set<__esri.Layer>();
    const apply = () => {
      for (const rule of layerFilters) for (const id of rule.ids) {
        const layer = map.findLayerById(id);
        if (!(layer instanceof FeatureLayer) || pending.has(layer)) continue;
        pending.add(layer);
        void view.whenLayerView(layer).then((lv) => {
          if (!alive || view.destroyed) return;
          const flv = lv as __esri.FeatureLayerView;
          const current = new FeatureFilter({ where: rule.where ?? '1=1', geometry: rule.geometry, spatialRelationship: 'intersects' });
          applied.set(flv, { previous: flv.filter, current });
          flv.filter = current;
        }).catch(() => { pending.delete(layer); });
      }
    };
    apply();
    const handle = map.layers.on('change', apply);
    return () => {
      alive = false;
      handle.remove();
      for (const [lv, { previous, current }] of applied) {
        if (!lv.destroyed && lv.filter === current) lv.filter = previous;
      }
    };
  }, [layerFilters, ready, dim]);

  const swipePosition = useRef(50);
  const swipeKey = swipe ? `${swipe.leading.join(',')}|${swipe.trailing.join(',')}` : '';
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || dim !== '2d' || !swipeKey) return;
    const SwipeC = swipeMod;
    if (!SwipeC) {
      loadSwipeMod().then(() => setSwipeTick((t) => t + 1))
        .catch((e: unknown) => console.warn('[MapCanvas] Swipe ачаалагдсангүй', e));
      return;
    }
    const [lead, trail] = swipeKey.split('|').map((s) => s.split(',').filter(Boolean));
    const pick = (ids: string[]) =>
      ids.map((id) => map.layers.find((l) => l.id === id)).filter((l): l is __esri.Layer => !!l);
    const w = new SwipeC({
      view: view as __esri.MapView,
      leadingLayers: pick(lead),
      trailingLayers: pick(trail),
      direction: 'horizontal',
      position: swipePosition.current,
    });
    view.ui.add(w);
    const h = map.layers.on('change', () => {
      w.leadingLayers.removeAll();
      w.leadingLayers.addMany(pick(lead));
      w.trailingLayers.removeAll();
      w.trailingLayers.addMany(pick(trail));
    });
    return () => {
      swipePosition.current = w.position;
      h.remove();
      view.ui.remove(w);
      w.destroy();
    };
  }, [swipeKey, ready, dim, swipeTick]);

  /**
   * `mon:building` давхаргыг НИЙТ ГҮЙЦЭТГЭЛЭЭР өнгөлнө — «Гүйцэтгэл бөглөх»-ийн
   * as-of утгаар (shapefile-ийн хуучирсан GUITS_HV БИШ). Өгөгдөл ~7с-д татагдаж
   * cache-лэгдэнэ; ирэхэд renderer-ыг тавьж, tooltip-д хэрэглэхээр хадгална.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);
    // Давхарга унтрахад алдааны тэмдгийг хамт нууна — хамааралгүй сануулга үлдэхгүй
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!on.has('mon:building')) { setProgError(false); setProgStale(false); return; }
    const layer = mapLayer(map, 'mon:building') as FeatureLayer | null;
    if (!layer) return;
    let alive = true;
    /**
     * Сүүлийн амжилттай дүнгээр ШУУД будна (stale-while-revalidate) — амьд
     * татаж дуустал (~7с) блокууд саарал хүлээлгэдэг байсныг арилгана. Амьд
     * дүн ирмэгц дарж шинэчилнэ; ТАТАЛТ АЛДВАЛ кэшийг ч хаяж саарал
     * «мэдээлэлгүй» төлөвт буцаана — хуучин тоо дэлгэцэд үлдэхгүй зарчим.
     */
    const cached = cachedBlockProgress();
    if (cached) {
      setBlockProg(cached);
      setProgStale(true); // кэшийн дүн — «шинэчилж байна…» тэмдэг ил гарна
      layer.renderer = buildingProgressRenderer(cached) as unknown as __esri.Renderer;
    }
    loadBlockProgress()
      .then((prog) => {
        if (!alive) return;
        setBlockProg(prog);
        setProgStale(false);
        setProgError(false);
        layer.renderer = buildingProgressRenderer(prog) as unknown as __esri.Renderer;
      })
      .catch((e) => {
        console.error('[selbe] блокийн гүйцэтгэл ачаалж чадсангүй:', e);
        if (!alive) return;
        setBlockProg(null);
        setProgStale(false);
        const empty: BlockProgressMap = new globalThis.Map();
        layer.renderer = buildingProgressRenderer(empty) as unknown as __esri.Renderer;
        setProgError(true); // «Гүйцэтгэл ачаалагдсангүй» тэмдэг ил гарна
      });
    return () => { alive = false; };
  }, [visibleKey, ready, busVer]);

  /**
   * ДАВХАРГЫН УНАЛТЫГ АЖИГЛАХ.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) { setLayerFail([]); return; }
    const handle = reactiveUtils.watch(
      () => [...new globalThis.Map(map.allLayers
        .filter((l) => l.loadStatus === 'failed')
        .toArray()
        .filter((l) => !/^(bim|scene):/.test(String(l.id)))
        .map((l) => [String(l.id), l.title || String(l.id)] as const)).entries()]
        .map((p) => JSON.stringify(p))
        .join('\n'),
      (joined) => setLayerFail(joined ? joined.split('\n').map((x) => JSON.parse(x) as [string, string]) : []),
      { initial: true },
    );
    return () => handle.remove();
  }, [ready]);

  /** 3D/BIM загвар ачаалагдсан эсэх — CORS/сүлжээний асуудлыг ил хэлнэ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !is3D(dim)) { setMeshError(null); return; }
    const layers: Layer[] = dim === 'bim'
      ? bimAll(map)
      : sceneList.map((m) => map.findLayerById(`scene:${m.key}`)).filter((l): l is Layer => l != null);
    if (!layers.length) { setMeshError(null); return; }
    let alive = true;
    Promise.allSettled(layers.map((l) => l.load())).then((rs) => {
      if (!alive) return;
      const failed = rs.filter((r) => r.status === 'rejected').length;
      setMeshError(failed === 0 ? null : failed);
      if (dim === 'bim') footFilter();
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready, sceneKey, bimTok]);

  const initWebgl = initError?.name?.startsWith('webgl:') === true;

  return (
    <div ref={wrapRef} className={s.wrap} data-map-canvas="" data-boot-fail={!ready && initError ? '' : undefined}>
      <div ref={el} className={s.view} />
      {!ready && !initError && <div className={s.loading}>{tr('Газрын зураг ачаалж байна…')}</div>}

      {/* `view.when` унасан — байнгын «ачаалж байна…»-гийн оронд алдааг ил хэлж,
          «Дахин оролдох»-оор view-г дахин үүсгүүлнэ */}
      {!ready && initError && (
        <div className={s.loading} role="alert">
          <div className={`${s.float} ${s.warn}`} style={{ position: 'static' }}>
            <b className={s.warnTitle}>{tr('Газрын зураг үүсгэж чадсангүй')}</b>
            <span>
              {initWebgl
                ? tr('Хөтчийн график (WebGL) идэвхгүй байна — тоног төхөөрөмжийн хурдасгуурыг асаах эсвэл өөр хөтөч ашиглана уу.')
                : tr('Сүлжээ эсвэл газрын зургийн үйлчилгээний алдаа гарлаа.')}
            </span>
            {initError?.name && <code style={{ opacity: 0.75, fontSize: 11 }}>{initError.name}</code>}
            {!initWebgl && (
              <button
                type="button"
                onClick={() => setInitToken((t) => t + 1)}
                style={{
                  alignSelf: 'flex-start', padding: '5px 12px', cursor: 'pointer',
                  font: 'inherit', fontWeight: 600, color: 'var(--ink)',
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: 6,
                }}
              >
                {tr('Дахин оролдох')}
              </button>
            )}
          </div>
        </div>
      )}

      {meshError != null && dim === 'bim' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert" data-float-br="">
          <b className={s.warnTitle}>{tr('Барилгын загвар ачаалагдсангүй (')}{meshError})</b>
          <span>
            <code>{hostOf(BIM.layers[0]?.url)}</code> {tr('дээрх BuildingSceneLayer-т хандаж чадсангүй. Үйлчилгээ нийтэд ил байгаа эсэхийг шалгана уу.')}
          </span>
          <button
            type="button"
            onClick={() => {
              const m = mapRef.current;
              if (m && !m.destroyed) bimAll(m);
              setMeshError(null);
              setBimTok((t) => t + 1);
            }}
            style={{
              alignSelf: 'flex-start', padding: '3px 10px', cursor: 'pointer',
              font: 'inherit', fontWeight: 600, color: 'var(--ink)',
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 6,
            }}
          >
            {tr('Дахин оролдох')}
          </button>
        </div>
      )}

      {/* НИСЛЭГ СОНГОХ — өөрийн меш багцгүй (`scene` prop-гүй) харагдацад: 3D-д меш, 2D-д (ортофото асаалттай
          үед) нислэгийн ортофото тайл солигдоно ( 2026-10-20: `ORTHO_FLIGHTS` — хоёулаа нэг `meshVer`). */}
      {(dim === '3d' || ortho) && !scene && ready && (
        <div className={s.flightBar} role="group" aria-label={tr('3D мешийн нислэг')} data-flight="">
          {FLIGHTS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={meshVer === f}
              className={`${s.flightBtn} ${meshVer === f ? s.flightOn : ''}`}
              title={MESH_VERSIONS[f].title}
              onClick={() => {
                if (meshVer === f) return;
                mesh3dOffRef.current?.();
                pickMeshVer(f);
              }}
            >
              {f === 'old' ? tr('Нислэг 1') : tr('Нислэг 2')}
            </button>
          ))}
        </div>
      )}

      {meshError != null && dim === '3d' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert" data-float-br="">
          <b className={s.warnTitle}>{tr('3D бодит загвар ачаалагдсангүй (')}{meshError})</b>
          <span>
            <code>{hostOf(MESH_VERSIONS[meshVer].layers[0].url)}</code> {tr('руу хандаж чадсангүй. Сервер ажиллаж байгаа эсэх, CORS-ын')} <b>allowedOrigins</b>{tr('-д энэ хаяг байгаа эсэхийг шалгана уу.')}
          </span>
        </div>
      )}

      {layerFail.length > 0 && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert" data-float-br="">
          <b className={s.warnTitle}>
            {tr('{0} давхарга ачаалагдсангүй', String(layerFail.length))}
          </b>
          <span>
            {layerFail.slice(0, 4).map(([id, t]) => LAYER_BY_ID[id]?.title ?? t).join(' · ')}
            {layerFail.length > 4 && tr(' …+{0}', String(layerFail.length - 4))}
            {' — '}
            {tr('Эдгээрийн өгөгдөл зурагт ХАРАГДАХГҮЙ. Сүлжээ эсвэл үйлчилгээний хандалтыг шалгана уу.')}
          </span>
          <button
            type="button"
            onClick={() => { recreateFailedLayers(mapRef.current); }}
            style={{
              alignSelf: 'flex-start', padding: '3px 10px', cursor: 'pointer',
              font: 'inherit', fontWeight: 600, color: 'var(--ink)',
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 6,
            }}
          >
            {tr('Дахин оролдох')}
          </button>
        </div>
      )}

      {pickFail && (
        <div className={`${s.float} ${s.floatBL} ${s.warn}`} role="status">
          <span>{tr('Товшсон цэгийн асуулга амжилтгүй — сүлжээгээ шалгаад дахин товшино уу.')}</span>
        </div>
      )}

      {/* Кэшээс будсан гүйцэтгэлийн тэмдэг — амьд дүн ирмэгц арилна */}
      {progStale && (
        <div className={`${s.float} ${s.floatBL} ${s.stale}`} role="status">
          <span className={s.staleDot} aria-hidden />
          {tr('Гүйцэтгэл: өмнөх дүнгээр · шинэчилж байна…')}
        </div>
      )}

      {/* Амьд гүйцэтгэл огт татагдсангүй — блокууд саарал «мэдээлэлгүй» өнгөөр
          байгааг ил хэлнэ (хуучирсан өнгө «баталгаатай» мэт үлдээхгүй зарчим) */}
      {progError && (
        <div className={`${s.float} ${s.floatBL} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>{tr('Гүйцэтгэл ачаалагдсангүй')}</b>
          <span>
            {tr('Блокийн гүйцэтгэлийн амьд дүн татагдсангүй тул блокууд «мэдээлэлгүй» саарал өнгөөр харагдаж байна.')}
          </span>
        </div>
      )}

      {/* Хулганы доорх объектын ТОВЧ мэдээлэл. Дэлгэрэнгүй нь дарахад
          баруун самбарт гарна — энд зөвхөн «энэ юу вэ» гэдгийг хэлнэ. */}
      <TipLayer setRef={tipSetRef} prog={blockProg} />

      {children}
    </div>
  );
});

/* ─────────────────── Товч мэдээллийн хайрцаг ─────────────────── */

/**
 * Хулганы доорх объектын ТОВЧ мэдээлэл.
 */
/**
 * TOOLTIP-Д ГАРГАХГҮЙ талбарууд — ArcGIS-ийн popup-д ч утгагүй техникийн багана.
 */
const TIP_SKIP = /^(objectid|globalid|se_anno|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)$/i;
const TIP_SKIP_PREFIX = /^shape(__|_|$)/i;

/**
 * ДОМЭЙНЫ КОДЫГ ШОШГО болгоно — ArcGIS-ийн popup-ийн зан.
 */
const domainLabel = (f: __esri.Field, v: unknown): string | null => {
  const dom = f.domain as { type?: string; codedValues?: { name?: string; code?: unknown }[] } | null;
  if (!dom?.codedValues) return null;
  const hit = dom.codedValues.find((c) => String(c.code) === String(v));
  return hit?.name != null ? String(hit.name) : null;
};

/** Талбарын утгыг хүн уншихаар — төрөл ба домэйноор */
const fieldText = (f: __esri.Field, v: unknown): string => {
  const lab = domainLabel(f, v);
  if (lab != null) return lab;
  const t = String(f.type ?? '');
  if (/date/i.test(t)) return date(v as string);
  if (/double|single|integer/i.test(t)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return num(n, Number.isInteger(n) ? 0 : 2);
  }
  return text(v);
};

function MapTip({
  x, y, id, attrs, fields, prog,
}: {
  x: number;
  y: number;
  id: string;
  attrs: Record<string, unknown>;
  /** Давхаргын талбарын тодорхойлолт — ArcGIS-ийн popup шиг alias/домэйнд */
  fields: readonly __esri.Field[] | null;
  prog: BlockProgressMap | null;
}) {
  const d = LAYER_BY_ID[id];
  if (!d) return null;

  const rows: { k: string; v: string }[] = [];

  /**
   * ИНЖЕНЕРИЙН ДЭД БҮТЭЦ (`infra:*`) — БҮХ АТРИБУТ, ArcGIS-ийн popup шиг
   * (2026-09-16, хэрэглэгчийн хүсэлт: «зургаар оруулсан pop up биш, ArcGIS-ийн
   * popup шиг атрибут нь харагддаг болго»).
   */
  if (id.startsWith('infra:') && fields?.length) {
    for (const f of fields) {
      const name = f.name ?? '';
      if (!name || TIP_SKIP.test(name) || TIP_SKIP_PREFIX.test(name)) continue;
      const v = attrs[name];
      if (v == null || String(v).trim() === '') continue;
      const isQty = d.qty?.field === name;
      rows.push({
        k: f.alias || name,
        /* Хэмжээний талбарт нэгжийг залгана — «Урт м 98.3» гэхээс «98.3 м» дээр */
        v: isQty ? `${fieldText(f, v)} ${tr(d.qty!.unit)}` : fieldText(f, v),
      });
    }
    return <TipBox x={x} y={y} hue={d.hue} title={d.title} rows={rows} />;
  }

  if (d.qty && attrs[d.qty.field] != null) {
    const q = Number(attrs[d.qty.field]);
    rows.push({
      k: d.qty.unit === 'м²' ? tr('Талбай') : tr('Урт'),
      v: d.qty.unit === 'м²' ? tr('{0} га', num(q / 10_000, 2)) : `${num(q, 1)} ${tr(d.qty.unit)}`,
    });
  }

  if (d.id === 'mon:building') {
    const F = BUILDING.fields;
    // Гүйцэтгэл нь «Гүйцэтгэл бөглөх»-ийн as-of утгаас (өнгөтэй нэг эх сурвалж),
    // shapefile-ийн хуучирсан GUITS_HV БИШ.
    const blk = text(attrs[F.block]);
    const g = prog?.get(buildingKey(attrs[F.bagts], blk))?.overall ?? null;
    rows.push({ k: tr('Блок'), v: blk });
    rows.push({ k: tr('Гүйцэтгэл'), v: g == null ? '—' : pct(g, 0) });
    rows.push({ k: tr('Айл'), v: attrs[F.households] == null ? '—' : num(Number(attrs[F.households])) });
    rows.push({ k: tr('Гүйцэтгэгч'), v: text(attrs[F.contractor]) });
  } else if (d.id === 'land:left') {
    // Кадастрын нэр/хаяг нь facets-т ОРОХГҮЙ (117 ба 137 өөр утга — задаргаа
    // болгож болохгүй), гэхдээ талбар дээр хулгана хүргэхэд хамгийн хэрэгтэй
    // мэдээлэл нь ЯГ эдгээр. Тиймээс энд гараар нэмнэ.
    const F = PARCEL_LEFT.fields;
    for (const [f, k] of [
      [F.progress, tr('Явц')], [F.owner, tr('Эзэмшигч')], [F.address, tr('Хаяг')], [F.note, tr('Тайлбар')],
    ] as [string, string][]) {
      const v = text(attrs[f], '').trim();
      if (v) rows.push({ k, v });
    }
  } else {
    for (const f of (d.facets ?? []).slice(0, 3)) {
      if (attrs[f.field] == null || String(attrs[f.field]).trim() === '') continue;
      rows.push({ k: f.label, v: facetName(d, f.field, text(attrs[f.field])) });
    }
    const zoneId = text(attrs[d.zoneField ?? ZONE_FIELD], '').trim();
    if (zoneId && zoneId !== ZONE_NONE.trim()) rows.push({ k: tr('Бүс'), v: zoneId });
  }

  return <TipBox x={x} y={y} hue={d.hue} title={d.title} rows={rows} />;
}

/** Хулганы доорх объектын товч мэдээллийн төлөв (`MapCanvas`-ийн `setTip`) */
type TipState = {
  x: number; y: number; id: string; attrs: Record<string, unknown>;
  /**
   * Давхаргын талбарын тодорхойлолт — ArcGIS-ийн popup шиг alias ба
   * домэйны ШОШГЫГ гаргахад (2026-09-16, хэрэглэгчийн хүсэлт).
   */
  fields: readonly __esri.Field[] | null;
};

/**
 * TOOLTIP-ИЙН ТӨЛӨВ ЭЗЭМШИГЧ (2026-10-04, рендерийн гүйцэтгэл) — `MapCanvas`-ийн `setTip` нь
 * `setRef`-ээр ЭНД дамжина: хулганы хөдөлгөөн зөвхөн энэ жижиг бүрэлдэхүүнийг зурна.
 */
function TipLayer({ setRef, prog }: {
  setRef: RefObject<(t: TipState | null) => void>;
  prog: BlockProgressMap | null;
}) {
  const [tip, setTip] = useState<TipState | null>(null);
  useLayoutEffect(() => {
    setRef.current = setTip;
    return () => { setRef.current = () => {}; };
  }, [setRef]);
  if (!tip) return null;
  return (
    <MapTip
      x={tip.x} y={tip.y} id={tip.id} attrs={tip.attrs}
      fields={tip.fields} prog={prog}
    />
  );
}

/**
 * Tooltip-ийн бүрхүүл — гарчиг + мөрүүд.
 */
function TipBox({
  x, y, hue, title, rows,
}: {
  x: number; y: number; hue: string; title: string;
  rows: { k: string; v: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const p = el?.offsetParent as HTMLElement | null;
    if (!el || !p) return;
    const G = 14;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pw = p.clientWidth;
    const ph = p.clientHeight;
    const off = (at: number, size: number, room: number) =>
      at + G + size <= room ? G
        : at - G - size >= 0 ? -G - size
          : Math.max(-at, room - size - at);
    el.style.transform = `translate(${off(x, w, pw)}px, ${off(y, h, ph)}px)`;
  });
  return (
    <div
      ref={ref}
      className={s.tip}
      style={{ left: x, top: y, '--tone': hue } as CSSProperties}
      aria-hidden
    >
      <div className={s.tipHead}>{title}</div>
      {rows.length > 0 && (
        <dl className={s.tipRows}>
          {rows.map((r, i) => (
            <div key={`${r.k}|${i}`}>
              <dt>{r.k}</dt>
              <dd className="num">{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export { OID };
