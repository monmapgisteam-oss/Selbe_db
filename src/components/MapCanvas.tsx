'use client';

import {
  createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import Map from '@arcgis/core/Map';
import { t as tr } from '@/lib/i18nCore';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Polygon from '@arcgis/core/geometry/Polygon';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import ViewshedAnalysis from '@arcgis/core/analysis/ViewshedAnalysis';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis';
import LineOfSightAnalysis from '@arcgis/core/analysis/LineOfSightAnalysis';
import DimensionAnalysis from '@arcgis/core/analysis/DimensionAnalysis';
import SliceAnalysis from '@arcgis/core/analysis/SliceAnalysis';
import VolumeMeasurementAnalysis from '@arcgis/core/analysis/VolumeMeasurementAnalysis';
import Slide from '@arcgis/core/webscene/Slide';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import BasemapGallery from '@arcgis/core/widgets/BasemapGallery';
import LocalBasemapsSource from '@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource';
import Expand from '@arcgis/core/widgets/Expand';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Ground from '@arcgis/core/Ground';
import type Layer from '@arcgis/core/layers/Layer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  LAYERS, LAYER_BY_ID, layerUrl, oidOf, drawOrder, DASH_PATTERN, ALWAYS_ON_IDS, REFERENCE_IDS,
  HOME, IMAGERY, IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET, SCENE, BIM, USAN_SAN, ELEVATION_URL, ZONE_LAYER, zoneWhere,
  ZONE_FIELD, ZONE_NONE, ZONE_TYPE_EMPTY_HUE, OID, BUILDING, SURVEY, PARCEL_LEFT, buildingKey,
  MAP_HUE_OVERRIDES, SOURCE_FS, BASE_MAP_IDS, TOGLOOM_TYPES,
  type LayerDef,
} from '@/lib/services';
import { SCENE3D_LAYERS } from '@/lib/scene3d';
import { plan2dStyleOf, loadPlan2dStyle, PLAN2D_ALIASED } from '@/lib/plan2d';
import { queryExtent, queryFeatures, type Aoi } from '@/lib/query';
import { loadBlockProgress, cachedBlockProgress, type BlockProgressMap } from '@/lib/blockProgress';
import { webmapStyleOf, loadWebmapStyle } from '@/lib/webmapStyle';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
import { num, pct, date, text } from '@/lib/format';
import s from './map.module.css';

/**
 * Газрын зургийн харагдац:
 *   · 2d  — MapView, ортофото
 *   · 3d  — SceneView, IntegratedMesh (гадна фотограмметр)
 *   · bim — SceneView, BuildingSceneLayer (зохион бүтээсэн загвар)
 *
 * ⚠️ 3d ба bim ХОЁУЛАА SceneView ашиглана — ялгаа нь зөвхөн ямар 3D давхарга
 * ачаалахад л байна.
 */
export type Dim = '2d' | '3d' | 'bim';
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
   * ⚠️ 2D `featureEffect`-ээр л хэрэгжинэ (3D-д ArcGIS үүнийг үл тоомсорлоно).
   */
  geometry?: unknown;
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
  /** Давхаргын ЯГ ТЭР объект(ууд) руу ойртох — хайлтын үр дүнд шилжихэд */
  zoomToWhere: (layerId: string, where: string) => void;
  /**
   * ОРТОФОТО ил эсэх ба түүнийг унтраах/асаах.
   * ⚠️ Каталогийн дээд мөр ба «Суурь зураг» товчны чагт ХОЁУЛАА эндээс уншиж
   * бичнэ — нэг эх сурвалж тул хоорондоо синк байна. Анхдагч суурь зураг
   * топографи, ортофото унтраалттай.
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

/**
 * ⚠️ ArcGIS-д өнгөний alpha нь СИМБОЛЫН ТӨРЛӨӨС хамаарч өөр хэмжээстэй:
 *   · энгийн симбол (simple-fill, simple-marker) → 0–1
 *   · CIM симбол (CIMSolidStroke)                → 0–100
 */
const c = (hex: string, a = 1): number[] => [...rgb(hex), a];
const cim = (hex: string, a = 1): number[] => [...rgb(hex), Math.round(a * 100)];

/**
 * ⚠️ БҮХ давхаргын outline (хүрээ/зураас)-ыг нэг дор нарийсгах КОЭФФИЦИЕНТ.
 * fill/fillWeb/line/roadLine/dot — БҮХ симбол үүсгэгч энэ утгаар өргөнөө үржүүлнэ
 * тул давхарга бүрийн (энгийн, web-палитр, зам, paint/breaks) хүрээ жигд нарийсна.
 * 1 = хэвийн; <1 = нарийн. Нэг лүгээр бүх зурагт үйлчилнэ.
 */
const OUTLINE_SCALE = 0.55;
/** Outline өргөнийг нэг мөр нарийсгана */
const ow = (w: number) => w * OUTLINE_SCALE;

/**
 * Полигон — нам дүүргэлт + нимгэн ТОД хүрээ.
 *
 * ⚠️ Дүүргэлтийн утга нь ортофото АНХНААСАА суурь болсон учир шийдвэрлэх ач
 * холбогдолтой. Ортофото нь дунд өнгөтэй, нарийн бүтэцтэй дэвсгэр (дундаж RGB
 * 115,113,107) тул 0.2 тунгалагт давхаргууд угаагдаж алга болдог.
 * Хэмжсэн (CIE Lab ΔE): a=0.16 → 12–18 (сул) · a=0.30 → 22–34 (тод).
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
 *
 * ⚠️ Хээг үндсэн зураас ба хүрээлэлд ЯГ ижлээр өгнө — эс бөгөөс хүрээлэл бүтэн
 * үлдэж, тасархай нь «дүүрсэн» мэт харагдана.
 * ⚠️ symbolLayers-ийн ЭХНИЙХ нь ДЭЭР зурагдана.
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
        /**
         * ⚠️ Хүрээлэл нь `w + 1.3` байв — үндсэн зураас 1px болоход нийт
         * зузаан 2.3px болж, «нарийн шугам» гэсэн санаа алдагдана. Одоо
         * харьцаагаар (×1.8) тул 1px зураас 1.8px хүрээлэлтэй: дэвсгэрээс
         * тасалж өгөх нь хангалттай, харин зузаан нь мэдэгдэхгүй.
         */
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
 *
 * ⚠️ 2D ба 3D-д НЭГ Л симбол. Урьд нь 3D-д өргөгдсөн бөмбөлөг + callout шугам
 * тавьж үзсэн — 1,675 шугам хоорондоо солбилцож ЗАМБАРААГҮЙ болсон тул хассан.
 * Нягт өгөгдөлд чимэглэл нэмэх тусам уншигдац МУУДДАГ.
 *
 * ⚠️ ХҮРЭЭГҮЙ (`width: 0`). Цагаан хүрээ нь 3–8px цэгэн дээр дүрсийн жинг хоёр
 * дахин нэмж, олон цэг зэрэг байхад «үртэс» мэт барзгар харагдуулна.
 *
 * ⚠️ Дүүргэлт 0.85 — давхцсан цэг бага зэрэг бараантаж, нягтрал өөрөө
 * уншигдана. Бүрэн дүүрэн бол давхцал мэдэгдэхгүй.
 *
 * ⚠️ Хэмжээ нь ТОГТМОЛ 7px. Урьд нь масштабаар хувьсдаг байсныг ХАСАВ: 2D-д
 * холоос кластер (`toiletCluster`) орлох болсон тул цэг нь зөвхөн ОЙРООС
 * харагдана — тэнд нэг хэмжээ хангалттай. Мөн кластерын хэмжээ нь ТООГООР
 * тодорхойлогддог бөгөөд renderer дээрх масштабын `visualVariables` түүнтэй
 * зөрчилддөг (бүх кластер ижил хэмжээтэй болно).
 */
const toiletDot = (hex: string) =>
  ({
    type: 'simple',
    symbol: {
      type: 'simple-marker',
      style: 'circle',
      size: 7,
      color: c(hex, 0.85),
      outline: { width: 0 },
    },
  }) as unknown as RendererProp;

/**
 * 2D-гийн КЛАСТЕР — холоос бүлэглэж, дотор нь ТООГ бичнэ.
 *
 * ⚠️ 1,675 цэгийг холоос ганц ганцаар нь харуулах утгагүй: бие биенээ дарж
 * тасралтгүй толбо болно. Кластер нь «энд хэд байна» гэдгийг ТООГООР хэлнэ.
 *
 * ⚠️ Хэмжээ нь ТООГООР — `clusterMinSize`/`clusterMaxSize` хооронд. Тиймээс
 * `toiletDot` дээр масштабын size visual variable БАЙЖ БОЛОХГҮЙ (дээр хассан).
 *
 * ⚠️ Шошгын гэрэлтүүлэг (halo) нь давхаргын өнгөөр — цагаан тоо цэнхэр дугуй
 * дээр, гадна талд нь цэнхэр хүрээтэй: ортофотогийн ямар ч дэвсгэр дээр
 * уншигдана.
 */
const toiletCluster = (hex: string) =>
  ({
    type: 'cluster',
    clusterRadius: '56px',
    popupEnabled: false,
    /**
     * ⚠️ `maxScale` — кластер энэ масштабаас ОЙР болоход өөрөө УНТАРНА (цэг тус
     * бүрээрээ гарна). Гараар `view.scale` сонсох шаардлагагүй.
     */
    maxScale: TOILET_CLUSTER_SCALE,
    /**
     * КЛАСТЕРЫН ӨӨРИЙН RENDERER — хэмжээ БА өнгө хоёулаа `cluster_count`-оос.
     *
     * ⚠️ Өөрийн renderer өгсөн үед `clusterMinSize`/`clusterMaxSize` үл
     * хэрэгсэгдэнэ — хэмжээг size visual variable ӨӨРӨӨ хариуцна.
     *
     * ⚠️ Дүүргэлт 50% ТУНГАЛАГ: кластер нь ортофотог дарах ёсгүй — доорх зураг
     * шууд мэдэгдэнэ.
     *
     * ⚠️ Хүрээ нь НИМГЭН, ХАГАС ТУНГАЛАГ цагаан (1px, 0.5). Хатуу цагаан хүрээ
     * нь дугуйг «таслаад» дотрын тунгалаг байдлыг үгүй хийдэг; огт хүрээгүй бол
     * бүдэг дугуй ортофотогийн эрээн дэвсгэр дээр ирмэгээ алддаг. Энэ хоёрын
     * дунд — хэлбэр нь мэдэгдэнэ, доорх зураг ч харагдана.
     *
     * ⚠️ Тунгалаг байдал нь БҮХ кластерт ижил (color visual variable ХАСАВ) —
     * ялгааг зөвхөн ХЭМЖЭЭ хэлнэ. Хоёр суваг (хэмжээ + өнгө) нэг л зүйлийг
     * давхардуулж хэлэх нь илүүц.
     *
     * ⚠️ Доторх ЦАГААН ТОО бүдгэрэхгүй — шошго нь симболын өнгөнөөс ХАМААРАХГҮЙ.
     */
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        color: c(hex, 0.5),
        outline: { color: [255, 255, 255, 0.5], width: 1 },
      },
      visualVariables: [{
        type: 'size',
        field: 'cluster_count',
        stops: [
          { value: 2, size: 16 },
          { value: 250, size: 40 },
        ],
      }],
    },
    labelsVisible: true,
    labelingInfo: [{
      deconflictionStrategy: 'none',
      labelExpressionInfo: { expression: "Text($feature.cluster_count, '#,###')" },
      labelPlacement: 'center-center',
      symbol: {
        type: 'text',
        color: '#ffffff',
        haloColor: '#0f141a',
        haloSize: '1px',
        font: { size: 10, weight: 'bold' },
      },
    }],
  }) as unknown as __esri.FeatureReductionCluster;

/**
 * Кластер ↔ ганц цэг СОЛИГДОХ масштаб. Үүнээс ХОЛ бол кластер, ОЙР бол цэг
 * тус бүрээрээ. (3D-гийн callout нь 1:1,000 — өөр, бүр ойрын түвшин.)
 */
const TOILET_CLUSTER_SCALE = 2_500;

/**
 * ГЭРЭЛТҮҮЛЭГ — МАСШТАБААС хамаарна (ArcGIS-ийн scale-dependent effect).
 *
 * ⚠️ Нэг тогтмол утга ТААРАХГҮЙ. Холдох тусам кластерууд НЭГДЭЖ томордог
 * (18px → 42px) бөгөөд том дугуй нь тоотойгоо аль хэдийн хангалттай жинтэй —
 * тэр дээр хүчтэй bloom тавихад цайж, ДОТОРХ ТОО УНШИГДАХАА БОЛИНО. Харин
 * ойроос үлдэх 7px-ийн ганц цэг ортофото дээр төөрөх тул гэрэлтэх нь зөв.
 *
 * ⚠️ Зогсолтуудыг ArcGIS өөрөө интерполяци хийнэ — гараар сонсох шаардлагагүй,
 * зум хийхэд алгуур шилжинэ. Дараалал нь масштаб БУУРАХ (хол → ойр) чиглэлд.
 *
 * ⚠️ Босго нь (гурав дахь тоо) эсрэгээр өснө: том кластер дээр зөвхөн хамгийн
 * тод пиксел гэрэлтэж, дугуйн бүх талбай цайхгүй.
 */
const TOILET_EFFECT = [
  { scale: 20_000, value: 'bloom(0.15, 0.4px, 0.35)' },
  { scale: 8_000, value: 'bloom(0.3, 0.4px, 0.28)' },
  { scale: 2_500, value: 'bloom(0.55, 0.45px, 0.2)' },
  { scale: 1_000, value: 'bloom(1.0, 0.5px, 0.1)' },
] as unknown as __esri.Effect;

/**
 * НҮХЭН ЖОРЛОН — 3D-гийн ХОЛЫН тэмдэг: газраас БАГА ЗЭРЭГ хөвсөн дугуй.
 *
 * ⚠️ 2D-гийн `toiletDot`-ыг 3D-д шууд хэрэглэвэл цэг газарт НААЛДАЖ, мешийн
 * барилга, хашаа, модны ард нуугдана — өндөр өнцгөөс хагас нь алга болно.
 * 8px-ийн жижиг `verticalOffset` нь тэдгээрээс дээш өргөж ил гаргана.
 *
 * ⚠️ Callout шугам ЭНД БАЙХГҮЙ. 1,675 шугам солбилцоод замбараагүй болдгийг
 * туршиж үзсэн. Өргөлт нь ЖИЖИГ (8px) тул шугамгүй ч байршил бараг алдагдахгүй;
 * ойроос (`TOILET_PIN_SCALE`) шугамтай хувилбар (`toiletPin`) орлоно.
 *
 * ⚠️ SceneView нь давхаргын `effect`-ийг (bloom) дэмждэггүй тул 3D-д гэрэлтэлт
 * байхгүй — түүний оронд тунгалаг байдлыг 0.9 болгож бага зэрэг нөхөв.
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
 *
 * ⚠️ Энэ нь `toiletDot`-ыг ОРЛОХ БИШ, түүнийг ойрын зайд СОЛИХ тусдаа давхарга
 * (`TOILET_PIN_ID`). Хоёуланг нэг давхаргад багтаах арга ArcGIS-д байхгүй:
 * renderer нь масштабаар СИМБОЛЫН ТӨРЛӨӨ сольж чаддаггүй. Харин давхаргын
 * `minScale`/`maxScale` нь энэ солилтыг ЯГ хийдэг — гүйцэтгэлийн нэмэлт ачаалал
 * ч үгүй, ажиллах явцад юу ч бодогдохгүй.
 *
 * ⚠️ Хэмжээ нь ТОГТМОЛ 3 м. Энэ давхарга нь зөвхөн 1:3,000-аас ойр харагддаг
 * тул масштабын хэлбэлзэл бага — `visualVariables` нэмэх нь дэмий төвөгтэй.
 *
 * ⚠️ `screenLength` нь ДЭЛГЭЦИЙН пиксел: шугамын урт ямар ч өнцөгт жигд байна.
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
 *
 * ⚠️ 3,000 → 1,200 → 1,000 (2026-08-13). 3,000 дээр хэдэн зуун callout зэрэг
 * гарч хэт эрт замбараагүй болдог байв; 1,200 ч бага зэрэг эрт байв. Төслийн
 * бүтэн хүрээ ≈1:12,000 тул 1,000 нь «хэдхэн барилгын дэргэд очсон» түвшин —
 * callout цөөхөн, тус бүр нь уншигдана.
 */
const TOILET_PIN_ID = 'irged:toilet-pin';
const TOILET_PIN_SCALE = 1_000;

/**
 * ⚠️ ArcGIS 4.34-д давхаргын `renderer` нь ЯЛГАВАРТАЙ НЭГДЭЛ (discriminated
 * union) болсон: гишүүн бүр `type`-ыг ЛИТЕРАЛ байдлаар шаардана. Ерөнхий
 * `__esri.RendererProperties` нь тэр литералыг агуулаагүй тул шууд оноох
 * боломжгүй (`type` дутуу гэж «pie-chart» гишүүн рүү заана). Давхарга өөрөө юу
 * хүлээж авдгаас нь гаргаж авбал хувилбар өөрчлөгдөхөд дагаад шинэчлэгдэнэ.
 */
type RendererProp = NonNullable<__esri.FeatureLayerProperties['renderer']>;

const simple = (sym: unknown) => ({ type: 'simple', symbol: sym }) as unknown as RendererProp;

/* ⚠️ Урьд нь энд «Усан сан»-гийн `WATER_SYMBOL` (WaterSymbol3DLayer) байв.
   Хэрэглэгчийн хүсэлтээр «Усан сан» давхаргыг газрын зурагт унтраасан тул
   ашиглагдахаа больж УСТСАН. Буцааж асаахдаа энэ симбол + доорх нэмэх логикийг
   сэргээнэ. */

/** Каталогийн тодорхойлолтоос симбол — зураг ба тайлбар нэг эх сурвалжтай */
/**
 * ⚠️ ШУГАМ бүр 1px. Давхаргын тодорхойлолтод 0.8–3.0px хүртэл өөр өргөнтэй
 * байсан нь 19 шугаман давхаргыг зэрэг асаахад зургийг бүдүүн судлууд болгож,
 * доор нь байгаа бүс, барилга харагдахаа больдог байлаа. Ялгах үүргийг ӨНГӨ ба
 * ЗУРААСНЫ ХЭЭ (`dash`) хоёр аль хэдийн гүйцэтгэдэг тул өргөн нь илүүц.
 *
 * ⚠️ ЦЭГ нь 0.7 дахин жижигрэв (9px → 6.3px). Тодорхойлолтын харьцаа хэвээр —
 * зөвхөн ерөнхий хэмжээ буурна.
 *
 * ⚠️ ЗӨВХӨН `topic: 'plan'` давхаргад. «Барилгын хяналт»-ын давхаргууд
 * (`mon:survey` цэг, `mon:building` талбай) нь ӨӨР ХҮНИЙ хэсэг бөгөөд тэнд
 * цөөн объект тархай байрладаг тул жижигрүүлэх нь тэдний харагдацыг мууруулна.
 */
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
 *
 * ⚠️ Радарын долгион нь ГУРВАН давхарласан дугуй — ArcGIS-ийн 3D симбол
 *    хөдөлгөөн дэмждэггүй тул «тэлж буй цацраг»-ийг ХЭМЖЭЭ + ТУНГАЛАГИЙН
 *    шаталсан цуваагаар илэрхийлнэ (гадна нь том, бүдэг; дотор нь жижиг,
 *    цул). Хөдөлгөөнт хувилбар нь HTML давхарга + `toScreen()` шаардана —
 *    тэр нь 60 fps-д камер бүр хөдлөхөд дахин тооцоологдож, гүйцэтгэлийг
 *    мэдэгдэхүйц унагана.
 *
 * ⚠️ ЗӨВХӨН SceneView-д. MapView нь `point-3d` симбол дэмждэггүй — 2D-д
 *    тавибал давхарга ОГТ зурагдахгүй. Тиймээс `dim`-ээр сольдог эффект
 *    (доор) хариуцна.
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

export const symbolOf = (d: LayerDef, hue = d.hue) => {
  const plan = d.topic === 'plan';
  return d.geom === 'line'
    ? line(hue, plan ? LINE_PX : (d.width ?? 1.4), d.dash ?? 'solid')
    : d.geom === 'point'
      ? dot(hue, (d.size ?? 9) * (plan ? DOT_SCALE : 1), d.marker ?? 'circle')
      : fill(hue, d.fill ?? 0.3, d.width ?? 0.9);
};

/**
 * Дашбоардын бүс — эх webmap-тай ижил, Angilal ангилал БҮР өөрийн өнгөтэй.
 * `uniform` горимд бүсийн давхаргад ашиглана.
 *
 * ⚠️ Урьд нь бүх бүсийг ганц жигд өнгөөр зурж, зөвхөн улаан ангиллуудыг
 * онцолдог байв — `ZONE_TYPES`-д улаан утга байхгүй тул бодитоор бүх бүс жигд
 * улбар шар харагддаг байлаа. Одоо Ерөнхий төлөвлөгөөтэй ижлээр `paint.values`
 * (`ZONE_MAP_TYPES` = эх webmap-ийн өнгө) бүрээр зурна.
 */
const zoneTypeRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint?.field ?? 'Angilal',
  defaultSymbol: symbolOf(d, ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint?.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint?.values ?? {}).map(([value, hue]) => ({
    value, label: value, symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);

/**
 * `paint.values`-аар ангилал бүрийг өнгөөр ялгах unique-value renderer.
 * ⚠️ `uniform` горимд ч ажиллана — газар чөлөөлөлтийн зураг дээр `land:left`-ийг
 * `Tuluv` төлөвөөр (чөлөөлсөн/цэвэрлэсэн/үлдсэн) будахад хэрэгтэй.
 */
const paintRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint!.field,
  defaultSymbol: symbolOf(d, ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint!.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint!.values).map(([value, hue]) => ({
    value, label: value, symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);

/* ⚠️ Урьд нь энд `WEB_DYNAMIC` хэмээх ХОЁР webmap-ийн симболын ГАР СНАПШОТ
   байв (12 давхарга, single/multi палитр). Одоо загварыг эх webmap-аас БҮТНЭЭР
   `tools/webmap_style.mjs` үүсгэж `lib/webmapStyle.ts`-д хадгалдаг бөгөөд
   давхаргын renderer JSON `fromJSON`-оор шууд тавигддаг тул гар орчуулгын
   давхарга бүхэлдээ хасагдав — 78 давхарга webmap-тэй 100% ижил зурагдана. */

/**
 * Гүйцэтгэлийн өнгө (0–100%): улаан → шар → ногоон. Хоёр хэсэгт шугаман
 * интерполяци — блок бүрд тасралтгүй өнгө өгнө (unique-value симбол болгонд).
 */
const PROG_STOPS: [number, [number, number, number]][] = [
  [0, [220, 38, 38]],    // #dc2626 улаан
  [50, [245, 158, 11]],  // #f59e0b хув
  [100, [22, 163, 74]],  // #16a34a ногоон
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
 *
 * ⚠️ BAGTS + BLOK ХОЁУЛАА түлхүүр (`valueExpression`). Зөвхөн BLOK-оор жиштэл
 * Багц 1-ийн «5/1» Багц 2-ын «5/1»-тэй нийлж, өөр барилгын өнгийг зүүж байв.
 * SDK-ийн `field`/`field2` хос нь давхаргын түүхий утгыг задалдаггүй тул
 * (давхарга «Багц 4.1», хүснэгт «Багц 4-1») Arcade дээр хэвийн болгоно.
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
 *
 * ⚠️ МАСШТАБТ УЯГДСАН хэмжээ (хэрэглэгчийн хүсэлт: «яг мод шиг») — `basePx`-ийг
 * view-ийн масштабаас MapCanvas ӨӨРӨӨ тооцож (px ≈ 61000 ÷ масштаб, ~16 м
 * эзлэхүүн) масштаб өөрчлөгдөх бүрд renderer-ийг ШИНЭЧИЛНЭ. Урьд нь size
 * visual variable (`$view.scale`) ашигласан боловч picture marker дээр
 * ажиллаагүй тул watch-д суурилсан баталгаат аргаар солив.
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
 *
 * ⚠️ SDK-ийн `FeatureLayer.queryExtent()`-ийг ашиглахгүй: тэр нь `where`-ыг
 * хүсэлтэд огт оруулдаггүй бөгөөд эдгээр FeatureServer 400 «No where clause
 * specified» гэж татгалздаг. REST рүү шууд хандана (`lib/query.ts`).
 */
/**
 * Эхлэх хүрээний МОДУЛИЙН кэш — бүсийн давхаргын хүрээ статик тул нэг л удаа
 * query хийж, 2D↔3D солих бүрд дахин татахгүй, дахин үсрэхгүй.
 */
let homeExtentCache: Extent | null = null;

/**
 * Map-ын МОДУЛИЙН кэш — навбараас сэдэв солиход зураг дахин үүсэхээс сэргийлнэ.
 *
 * ⚠️ Дашбоард/Багц/Газар/plan/monitor ТУС ТУС өөрийн `<MapCanvas>`-тай тул сэдэв
 * солих бүрд хуучин Map (35 давхарга + basemap + ground) УСТААД, шинэ нь дахин
 * үүсэж, давхарга бүр метадатаа дахин татдаг (35+ хүсэлт) байв. Map-ыг `uniform`
 * (дашбоард) vs themed (бусад) гэсэн 2 түлхүүрээр кэшлэвэл давхаргууд НЭГ Л УДАА
 * ачаалагдаж, дараагийн харагдац зөвхөн шинэ view үүсгэнэ. View нь харагдац тус
 * бүрд шинэ хэвээр — handler-ууд props-той нь холбоотой.
 */
const mapCache: Record<string, Map> = {};

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

async function extentOf(url: string, view: AnyView, where = '1=1'): Promise<Extent | null> {
  const wkid = view.spatialReference?.wkid ?? 102100;
  const box = await queryExtent(url, wkid, where);
  if (!box) return null;
  return new Extent({
    xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax,
    spatialReference: view.spatialReference,
  });
}

/** Бүсийн шошго — цагаан halo-той тул аль ч дэвсгэрт уншигдана */
const zoneLabels = () =>
  [
    {
      // ⚠️ Бүсийн давхаргын кодын талбар нь `ZONE_ID` БИШ (`RefName_1`) —
      //    буруу талбар заавал шошго бүхэлдээ хоосон гарна.
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
 * Эх үүсвэрийн шошго — байгууламжийн нэр. ⚠️ Жижиг фонт дээр ЗУЗААН halo нь
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
 * Анхдагч суурь зураг — ТОПОГРАФИ (хэрэглэгчийн хүсэлт). Ортофото нь тусдаа
 * `imagery` давхарга бөгөөд эхэндээ УНТРААЛТТАЙ; хэрэглэгч «Суурь зураг» товчны
 * «Ортофото» чагтаар асаана. Суурь зургийн галерейгаас топо/хиймэл дагуул/гудамж
 * зэрэг сонгож болно.
 */
const baseMap = () => Basemap.fromId('topo-vector');

/* ─────────────────── Давхарга үүсгэх ─────────────────── */

export const IMAGERY_ID = 'imagery';

/** Дарж сонгогдохгүй, шүүлтэд оролцохгүй давхаргууд */
const PASSIVE = new Set<string>([
  'sketch',
  IMAGERY_ID,
  IRGED_ORTHO.id,
  // Нүхэн жорлон — зөвхөн байршил харуулна; дарахад атрибут гарах ЁСГҮЙ
  IRGED_TOILET.id,
  TOILET_PIN_ID,
  IRGED_ROAD.id,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...IRGED_SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
  // Лавлагааны хилүүд — дарж сонгогдохгүй, доорх объектыг халхлахгүй.
  ...REFERENCE_IDS,
]);

/**
 * 3D-д вектор давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 * ⚠️ Заавал: гадаргуу ~1350 м өндөрт байх бөгөөд `elevationInfo` өгөхгүй бол
 * давхарга 0 м-т үлдэж мешийн доор алга болно.
 */
const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

/**
 * @param uniform — давхарга бүрийг ГАНЦ жигд өнгөөр (өөрийн `hue`) зурна;
 *   ангиллаар (TOROL, Barilga_ty) олон өнгө хуваахгүй. Ерөнхий дашбоардад
 *   давхаргууд нэг нэг өнгөтэй байх ёстой — cross-filter нь тодорхой болно.
 */
/**
 * Давхаргын `outFields` — payload багасгах. ⚠️ `plan`/`monitor` давхаргууд нь
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

  /* Ортофото — вектор давхаргын доор. ⚠️ Эхэндээ УНТРААЛТТАЙ (хэрэглэгчийн
     хүсэлт): анхдагч суурь зураг нь топографи, ортофотог «Суурь зураг» товчны
     чагтаар асаана. `orthoRef` энэ төлвийг удирдана. */
  L.push(new GroupLayer({
    id: IMAGERY_ID,
    title: IMAGERY.title,
    visible: false,
    listMode: 'hide',
    /**
     * ⚠️ `visibilityMode: 'inherited'` БИШ. Тэр горимд хүүхэд давхарга нэмэгдэх
     * агшинд эцгийнхээ `visible`-ыг шингээдэг бөгөөд конструкторын шинжүүд ямар
     * дарааллаар олгогдох нь баталгаагүй.
     */
    layers: IMAGERY.urls.map((url, i) => new ImageryLayer({
      id: `${IMAGERY_ID}:${i}`, url, visible: true,
      format: 'jpgpng', popupEnabled: false, legendEnabled: false,
    })),
  }));

  /* «Иргэдэд хүрэх үр өгөөж»-ийн ортофото (динамик MapServer) — вектор давхаргын
     ДООР, эхэндээ УНТРААЛТТАЙ. Тэр харагдац `visible` жагсаалтдаа id-г нь өгч
     асаана; бусад харагдацад жагсаалтад ороогүй тул унтраалттай хэвээр. */
  L.push(new MapImageLayer({
    id: IRGED_ORTHO.id,
    title: IRGED_ORTHO.title,
    url: IRGED_ORTHO.url,
    visible: false,
    listMode: 'hide',
    legendEnabled: false,
  }));

  /* Зам (вектор тайл) — ортофотогийн ДЭЭР, цэгүүдийн ДООР.
     ⚠️ Загварыг URL-ээс автоматаар уншина (`resources/styles`) тул renderer
     бичихгүй. Эхэндээ унтраалттай; `visible` жагсаалтаар асаана. */
  L.push(new VectorTileLayer({
    id: IRGED_ROAD.id,
    title: IRGED_ROAD.title,
    url: IRGED_ROAD.url,
    visible: false,
    listMode: 'hide',
  }));

  /* Нүхэн жорлон — цэгэн давхарга, мөн зөвхөн тэр харагдацад.
     ⚠️ `outFields: []` = ЗӨВХӨН OID: атрибутын үлдсэн 13 талбар (PLI,
     Ground_wat, Population…) огт татагдахгүй тул тэдгээр ил гарах ЗАМГҮЙ.
     `popupEnabled: false` + `PASSIVE` нь дарахад ч юу ч гаргахгүй. */
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
     *
     * ⚠️ ЗӨВХӨН 2D-д үйлчилнэ. Давхаргын `effect` нь MapView-ийн боловсруулалт —
     * SceneView түүнийг чимээгүй үл тоомсорлоно (алдаа ӨГӨХГҮЙ). 3D талд цэг
     * хэвийн, гэрэлтэхгүй харагдана.
     */
    effect: TOILET_EFFECT,
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
    // ⚠️ styleUrl — test_data руу шилжсэн ч webmap-снапшотын ХУУЧИН түлхүүрээр
    //    хайж, зураг дээрх загварыг 1:1 хадгална (2026-08-13).
    const web = webmapStyleOf(d.styleUrl ?? layerUrl(d));
    /**
     * ӨНГӨНИЙ OVERRIDE (`MAP_HUE_OVERRIDES`, 2026-07-31): барилгын снапшотын
     * шар (#ffb700, 20% дүүргэлт) нь ортофото дээр ялгарахгүй байсан тул
     * каталогийн `hue`-ээр (тод цэнхэр) дүүргэлт ~39%, хүрээ ~90% болгож будна.
     * Масштабын sizeInfo, bloom зэрэг бусад загвар снапшотоос хэвээр.
     * ⚠️ Снапшот файлыг ӨӨРЧЛӨХГҮЙ — тэр нь `tools/webmap_style.mjs`-ээр дахин
     * үүсдэг тул тэнд хийсэн засвар устдаг; override нь ЭНД амьдарна.
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
    return new FeatureLayer({
      id: d.id,
      url: layerUrl(d),
      title: d.title,
      outFields: mapFields(d),
      popupEnabled: false,
      visible: false,
      ...(d.minScale ? { minScale: d.minScale } : {}),
      elevationInfo: ON_GROUND,
      // `sb:*` — «Selbe 2D map 0804» webmap-ийн ЯГ renderer (100% style).
      renderer: p2
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
                // ⚠️ ArcGIS classBreak нь maxValue-г ОРУУЛЖ тоолдог; самбарын SQL нь
                //    `< max` тул багахан хасаж хоёуланг нь тааруулна.
                maxValue: l.max - 0.0001,
                label: `${l.label} (${l.range})`,
                symbol: symbolOf(d, l.color),
              })),
            } as unknown as RendererProp)
          : simple(symbolOf(d)),
      // ⚠️ План2d-аар жигдэлсэн давхаргад selbe0724 снапшотын EFFECT (bloom/гэрэлтэлт)
      //    ба opacity-г ТАВИХГҮЙ — эс бөгөөс барилга гэрэлтэж, өнгө нь план 2D map-аас зөрнө.
      ...(!p2 && web?.effect ? { effect: web.effect as unknown as __esri.FeatureLayerProperties['effect'] } : {}),
      ...(!p2 && web?.opacity != null ? { opacity: web.opacity } : {}),
      ...(d.id === ZONE_LAYER.id ? { labelingInfo: zoneLabels() } : {}),
      ...(d.id === 'source:eh' ? { labelingInfo: sourceLabels(), labelsVisible: true } : {}),
    });
  });

  /**
   * ДАРААЛАЛ: талбай → шугам → цэг.
   * ⚠️ `sort` нь ES2019-оос хойш тогтвортой тул ижил геометртэй давхаргууд
   * каталогийн дарааллаа хадгална.
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
   * уншиж бичнэ. Анхдагч: унтраалттай (суурь зураг топографи).
   */
  const [ortho, setOrtho] = useState(false);

  /** Бүсийн орон зайн маск — noZone давхаргуудын 2D бүдгэрүүлэлтэд (доорх эффект) */
  const [zoneMask, setZoneMask] = useState<unknown>(null);

  /**
   * Тодруулга 2D-д — таарахгүй объектыг БҮДГЭРҮҮЛНЭ (`featureEffect`).
   *
   * ⚠️ `featureEffect` нь ЗӨВХӨН MapView-д ажиллана. SceneView-ийн давхаргын
   * харагдац (`views/3d/layers/FeatureLayerView3D`) энэ шинжийг ОГТ уншдаггүй —
   * алдаа ч шидэхгүй, зүгээр л чимээгүй үл тоомсорлоно. Тиймээс 3D/BIM дээр
   * бүх шүүлт «ажиллахгүй» харагддаг байв. 3D-д тодруулгыг `MapCanvas` өөрөө
   * `definitionExpression`-д нийлүүлж хэрэгжүүлнэ (тэнд объект бүрмөсөн хасагдана).
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const is3d = view.type === '3d';
    const onlyList = hl.only == null ? null : Array.isArray(hl.only) ? hl.only : [hl.only];
    view.map.layers.forEach((l) => {
      if (PASSIVE.has(l.id) || !('featureEffect' in l)) return;
      const fl = l as FeatureLayer;
      // ⚠️ `visible` шалгахгүй: нуугдсан давхаргын эффектийг цэвэрлэх боломжтой
      //    байх ёстой, эс бөгөөс дахин асаахад хуучин шүүлт үлдэнэ.
      // `only` заасан бол ЗӨВХӨН тэр давхаргууд — бусдынхыг цэвэрлэнэ.
      // ⚠️ `where` эсвэл орон зайн `geometry`-ийн аль нэг байхад л хэрэглэнэ.
      //    Хоёулаа зэрэг байвал featureEffect-ийн filter тэдгээрийг AND-оор
      //    хослуулна (эх дотор нь SQL + орон зайн шүүлт).
      const apply = !is3d && (hl.where || hl.geometry) && (!onlyList || onlyList.includes(l.id));
      /**
       * БҮСИЙН МАСК — тодруулгагүй үед `ZONE_ID`-гүй (noZone) давхаргыг сонгосон
       * бүсийн полигоноор орон зайгаар бүдгэрүүлнэ. Атрибутын шүүлт боломгүй
       * (CAD-гаралтай суурь давхаргууд) тул зөвхөн ингэж «шүүгдэнэ». Тодруулга
       * идэвхэвбэл тэр нь давамгайлна (нэг давхаргад нэг л featureEffect).
       */
      const maskApply = !apply && !is3d && zoneMask != null && LAYER_BY_ID[l.id]?.noZone;
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
      setHl({ where, only, geometry }),
    [],
  );

  const goTo = useCallback(async (url: string, w: string) => {
    if (!view || view.destroyed) return;
    try {
      const e = await extentOf(url, view, w);
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
   *
   * ⚠️ Хамгийн бага хэмжээ тавина: нэг цэгэн объект (тайлангийн цэг) эсвэл жижиг
   * талбарын хүрээ нь бараг тэг өргөнтэй байдаг тул шууд `goTo` хийвэл газрын
   * зураг хамгийн ойрын масштаб руу үсэрч, хэрэглэгч хаана байгаагаа алдана.
   * Тиймээс `goTo`-г ашиглахгүй, хүрээг өөрөө тэлнэ.
   */
  const zoomToWhere = useCallback(async (layerId: string, where: string) => {
    const d = LAYER_BY_ID[layerId];
    if (!d || !view || view.destroyed) return;
    try {
      const e = await extentOf(layerUrl(d), view, where);
      if (!e || view.destroyed) return;
      // 150 м-ээс нарийн хүрээг тэлнэ — контекстгүй ойртохоос сэргийлнэ
      const MIN = 150;
      let box;
      if (e.width < MIN || e.height < MIN) {
        // ⚠️ expand() нь хэмжээг ҮРЖҮҮЛДЭГ тул тэг өргөнтэй хүрээ (нэг цэгэн объект)
        //    дээр 0×factor = 0 хэвээр үлдэж, зураг хамгийн ойрын масштаб руу үсэрдэг.
        //    Тиймээс төвөөс ГАРААР угсарна: тал бүрийг дор хаяж MIN болгоно (аль
        //    хэдийн MIN-ээс том талыг богиносгохгүй).
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
      view.goTo(box).catch(() => {});
    } catch (err) {
      console.error('[selbe] объектын хүрээг тодорхойлж чадсангүй:', err);
    }
  }, [view]);

  const api = useMemo<MapApi>(
    () => ({ view, setHighlight, highlight: hl, zoomToLayer, zoomToZone, zoomToWhere, ortho, setOrtho, setZoneMask }),
    [view, setHighlight, hl, zoomToLayer, zoomToZone, zoomToWhere, ortho],
  );

  return (
    <RegisterCtx.Provider value={register}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
    </RegisterCtx.Provider>
  );
}

/* ─────────────────── Компонент ─────────────────── */

/**
 * ⚠️ `memo` — Portal-ын каталог/самбарын багана чирэх, каталогийн давхарга
 * задлах зэрэг ЭНД хамаагүй төлөв солигдоход зургийн React мод дэмий дахин
 * зурагддаг байв (ArcGIS view нь effect-үүдэд амьдардаг ч reconciliation
 * өөрөө үнэтэй). Пропс өөрчлөгдөөгүй бол бүхэлдээ алгасна.
 */
export const MapCanvas = memo(function MapCanvas({
  dim,
  visible,
  opacity,
  zone,
  layerWhere,
  layerStyle,
  pulseIds,
  uniform = false,
  onPick,
  sketch = false,
  onSketch,
  drawToken = 0,
  clearToken = 0,
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
   * Заасан бол `zone`-ийн нэгдсэн шүүлтийг ДАРНА — давхарга бүр өөрийн WHERE-ээр
   * шүүгдэнэ. `null`/байхгүй утга = шүүлтгүй.
   */
  layerWhere?: Record<string, string | null>;
  /**
   * ДАВХАРГЫН ХЭВ МАЯГИЙГ ХАРАГДАЦААС ДАРЖ БИЧИХ.
   *
   * ⚠️ Нэг давхарга ХЭД ХЭДЭН харагдацад дахин ашиглагддаг тул анхны загвар нь
   *    зарим контекстэд утгаа алддаг: «Багцын хяналт»-д газар чөлөөлөлтийн
   *    нэгж талбар нь улаан барилгын блокуудын дэргэд ижил төстэй харагдаж,
   *    хоёулаа ялгагдахаа больдог. Энд өгсөн өнгө/зузаанаар тэр давхаргыг
   *    ТУХАЙН харагдацад л ялгаж зурна.
   *
   * ⚠️ Анхны renderer-ийг ХАДГАЛЖ, дарлага арилахад БУЦААНА — эс бөгөөс
   *    «Газар чөлөөлөлт» харагдац руу орход тэнд төлөвөөр будсан загвар нь
   *    алга болж, бүх нэгж талбар нэг өнгөөр харагдана.
   */
  layerStyle?: Record<string, { hue: string; fill?: number; width?: number }>;
  /**
   * ПУЛЬСЛЭХ (анивчих) ДАВХАРГУУД — анхаарал татах ёстой цөөн объектод.
   *
   * «Багцын хяналт»-д багцтай давхцсан нэгж талбар нь 1-2 ширхэг, ортофото
   * дээр жижиг харагддаг тул зөвхөн өнгөөр ялгах хангалтгүй — амьсгалах
   * хөдөлгөөн нүд шууд татна.
   *
   * ⚠️ Шүүлт (`layerWhere`) солигдоход пульс ДАХИН эхлэх ёстой: эс бөгөөс
   *    өмнөх багцын талбарын хуулбар зурагдсаар үлдэнэ.
   */
  pulseIds?: string[];
  /** Давхарга бүрийг ГАНЦ жигд өнгөөр зурах (ангиллаар олон өнгө хуваахгүй) */
  uniform?: boolean;
  onPick: (attrs: Record<string, unknown> | null, layerId: string | null) => void;
  /**
   * ПОЛИГОН ЗУРАХ чадварыг асаана («Газар чөлөөлөлт»). Зөвхөн 2D-д ажиллана —
   * `SketchViewModel`-ийг бэлдэнэ (гадаад товч `drawToken`-оор эхлүүлнэ).
   */
  sketch?: boolean;
  /** Полигон зурж дуусахад/өөрчлөхөд геометрийг, устгахад `null`-ийг дамжуулна */
  onSketch?: (geometry: __esri.Geometry | null) => void;
  /** Утга нэмэгдэхэд полигон зурж эхэлнэ (гадны «Полигон зурах» товч) */
  drawToken?: number;
  /** Утга нэмэгдэхэд зурсан полигоныг арилгана (гадны «Цэвэрлэх» товч) */
  clearToken?: number;
  /**
   * 3D горимд зурах IntegratedMesh багц. Байхгүй бол аппын үндсэн `SCENE`.
   *
   * ⚠️ Map нь харагдацуудын хооронд КЭШЛЭГДДЭГ тул энэ жагсаалтад БАЙХГҮЙ
   * `scene:*` давхаргыг эффект нь ЗААВАЛ хасна — эс бөгөөс өмнөх харагдацын
   * меш үлдэж, хоёр багц давхцан z-fight үүснэ.
   */
  scene?: readonly { key: string; title: string; url: string }[];
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<AnyView | null>(null);
  const bimWidgetRef = useRef<BuildingExplorer | null>(null);
  /**
   * BIM удирдлагыг боосон `Expand` — виджет өөрөө нь `bimWidgetRef`-д.
   * ⚠️ ХОЁУЛАА хэрэгтэй: `Expand.destroy()` нь `content`-оо устгадаггүй тул
   * зөвхөн Expand-ыг устгавал BuildingExplorer санах ойд үлдэж, горим солих
   * бүрд шинэ виджет нэмэгдсээр байна.
   */
  const bimExpandRef = useRef<Expand | null>(null);
  const sketchVMRef = useRef<SketchViewModel | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const onSketchRef = useRef(onSketch);
  onSketchRef.current = onSketch;
  /** Давхарга бүрийн БҮТЭЭГДЭХ (build-time) тунгалаг — override арилахад буцаана */
  const defaultOpacityRef = useRef<Record<string, number>>({});
  /** Сүүлд ил байсан давхаргын id-ууд — шинээр ил болсныг илрүүлэхэд */
  /**
   * Дарж бичихээс ӨМНӨХ renderer — дарлага арилахад буцаана.
   * ⚠️ JS-ийн `Map` БИШ энгийн объект: энэ файлд ArcGIS-ийн `Map` класс
   *    импортлогдсон тул нэр нь зөрчилдөнө.
   */
  const styleBackup = useRef<Record<string, unknown>>({});
  const prevVisRef = useRef<Set<string>>(new Set());
  /** Одоо пульс-анимаци явж буй давхаргууд — давхар гогцоо эхлэхээс сэргийлнэ */
  const fadingRef = useRef<Set<string>>(new Set());
  /** Идэвхтэй пульс-гогцоог цуцлах функц — unmount дээр rAF-ийг зогсооно */
  const pulseCancelRef = useRef<(() => void) | null>(null);
  /**
   * ДАВХАРГА ТУС БҮРИЙН цуцлагч.
   *
   * ⚠️ Пульсийн хуулбар нь `source:pulse` гэсэн ТУСДАА графикийн давхаргад
   *    амьдардаг бөгөөд тэр давхарга ҮРГЭЛЖ ил. Тиймээс эх давхаргыг нуухад
   *    хуулбар нь ӨӨРӨӨ АРИЛДАГГҮЙ — багцын сонголтыг цуцлахад ягаан талбар
   *    зураг дээр үлдсээр байв. Нуугдмагц ЭНДЭЭС цуцлана.
   */
  const pulseCancels = useRef<Record<string, () => void>>({});
  /** `pulseLayer` нь useCallback тул props-ыг ref-ээр уншина (лавлагаа тогтвортой). */
  const pulseIdsRef = useRef<string[]>([]);
  /** Хэв маягийн дарлага — пульсийн хуулбар ч ижил өнгөтэй байх ёстой. */
  const layerStyleRef = useRef<Record<string, { hue: string; fill?: number; width?: number }>>({});
  /** Давхарга бүрийн СҮҮЛД пульсэлсэн шүүлт — солигдвол дахин эхлүүлнэ. */
  const pulsedWhere = useRef<Record<string, string | null>>({});

  const [ready, setReady] = useState(false);

  /**
   * БҮСИЙН ОРОН ЗАЙН МАСК — сонгосон бүс(үүд)ийн нэгтгэсэн полигоныг татаж
   * Provider-т өгнө; тэр нь noZone давхаргуудыг 2D-д геометрээр бүдгэрүүлнэ
   * («суурь давхаргууд ч бүсээр шүүгдэх ёстой» — хэрэглэгчийн хүсэлт).
   * ⚠️ Race: бүс солигдох бүрд token шинэчлэгдэж, хоцорсон хариу хаягдана.
   */
  const { setZoneMask } = useMap();
  const zoneMaskToken = useRef(0);
  useEffect(() => {
    const t = ++zoneMaskToken.current;
    if (!ready || dim !== '2d' || !zone) { setZoneMask(null); return; }
    const zl = mapRef.current?.findLayerById(ZONE_LAYER.id) as FeatureLayer | undefined;
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
  /* Unmount үед маскыг цэвэрлэнэ — дараагийн харагдац хуучин бүдгэрүүлэлт өвлөхгүй */
  useEffect(() => () => setZoneMask(null), [setZoneMask]);

  /**
   * `tgl` (Хүүхдийн тоглоом) — төрөл бүрд ЭГЦ ДЭЭРЭЭС харсан icon renderer.
   * Map кэшлэгддэг тул mount бүрд идемпотентээр тавина (нэг л удаа солигдоно).
   */
  useEffect(() => {
    if (!ready) return;
    const l = mapRef.current?.findLayerById('tgl') as FeatureLayer | undefined;
    const view = viewRef.current;
    if (!l || !view) return;
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
  /** `view.when` унасан — «ачаалж байна…»-гийн оронд алдаа + «Дахин оролдох» */
  const [initError, setInitError] = useState(false);
  /** «Дахин оролдох» — утга нэмэгдэхэд view-г бүхэлд нь дахин үүсгэнэ */
  const [initToken, setInitToken] = useState(0);
  /** Хулганы доорх объектын товч мэдээлэл */
  const [tip, setTip] = useState<
    { x: number; y: number; id: string; attrs: Record<string, unknown> } | null
  >(null);
  /** Блок бүрийн нийт гүйцэтгэл — газрын зургийн өнгө ба tooltip-д хоёуланд нь */
  const [blockProg, setBlockProg] = useState<BlockProgressMap | null>(null);
  /** Гүйцэтгэлийн өнгө КЭШЭЭС будагдсан — амьд дүн ирмэгц false болно */
  const [progStale, setProgStale] = useState(false);
  /** Амьд гүйцэтгэл татаж чадаагүй — блокууд саарал «мэдээлэлгүй» төлөвт */
  const [progError, setProgError] = useState(false);

  const register = useContext(RegisterCtx);
  const registerRef = useRef(register);
  registerRef.current = register;



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
  orthoRef.current = ortho;
  const orthoChkRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (orthoChkRef.current) orthoChkRef.current.checked = ortho;
  }, [ortho]);

  /**
   * БҮТЭН ДЭЛГЭЦ (хэрэглэгчийн хүсэлт, 2026-08-18) — зурган дээрх товч дарахад
   * апп бүхэлдээ browser-ийн бүтэн дэлгэцэд орж, зураг viewport-ыг дүүргэнэ
   * (`.fs` → position: fixed inset 0; ArcGIS view хэмжээгээ өөрөө дагана).
   * Давхарга (LayerList) ба суурь зургийн widget хоёулаа зурган дээрээ байгаа
   * тул бүтэн дэлгэцэд ч бүрэн ажиллана.
   *
   * ⚠️ Fullscreen API-г ЗӨВХӨН товчны click дотор дуудна (хэрэглэгчийн үйлдэл
   * шаарддаг). Esc-ээр гарахад `fullscreenchange` сонсогч төлвийг буцаана.
   */
  const [fs, setFs] = useState(false);
  const toggleFs = useCallback(() => {
    setFs((cur) => {
      const next = !cur;
      if (next) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return next;
    });
  }, []);
  const toggleFsRef = useRef(toggleFs);
  toggleFsRef.current = toggleFs;
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFs(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** Массивыг эффектийн хамааралд өгч болохгүй (лавлагаа нь рендер бүрт шинэ) */
  const visibleKey = visible.join(',');

  /** Энэ харагдацын 3D меш багц — заагаагүй бол аппын үндсэн `SCENE` */
  const sceneList = scene ?? SCENE.layers;
  const sceneKey = sceneList.map((m) => m.key).join(',');


  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   * ⚠️ Map-ыг дахин үүсгэвэл давхаргууд шинээр ачаалагдаж, сонголт алдагдана.
   */
  useEffect(() => {
    // ⚠️ Style снапшот ачаалагдаагүй бол Map барихгүй — buildLayers webmap
    //    renderer-ээ синхроноор уншдаг тул эрт барьвал fallback style-тай үлдэнэ.
    if (!el.current || !stylesReady) return;

    const mapKey = uniform ? 'uniform' : 'themed';
    if (!mapCache[mapKey] || mapCache[mapKey].destroyed) {
      esriConfig.assetsPath = 'https://js.arcgis.com/4.34/@arcgis/core/assets';
      mapCache[mapKey] = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: buildLayers(uniform),
      });
    }
    mapRef.current = mapCache[mapKey];

    const map = mapRef.current;
    if (typeof window !== 'undefined') (window as unknown as { __dbgmap: Map }).__dbgmap = map;
    setReady(false);
    setInitError(false);

    const view: AnyView =
      is3D(dim)
        ? new SceneView({
            container: el.current,
            map,
            camera: {
              position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
              tilt: 62, heading: 0,
            },
            popupEnabled: false,
            qualityProfile: 'high',
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
          });
    viewRef.current = view;
    if (typeof window !== 'undefined') (window as unknown as { __dbgview: AnyView }).__dbgview = view;

    /**
     * ⚠️ Давхаргын FADE TRANSITION-ыг унтраана — АСААХ/УНТРААХ ШУУД болно.
     *
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
     *
     * ⚠️ Selbe ортофото нь ТУСДАА давхарга (`imagery`) бөгөөд зургийг БҮРЭН
     * бүрхдэг тул суурь зургаа сольсон ч ХАРАГДДАГГҮЙ байв — «суурь зураг солих
     * товч ажиллахгүй» гэдгийн шалтгаан нь ЭНЭ. Галерейн ДЭЭР «Ортофото» асаах/
     * унтраах чагт нэмэв: унтраахад доорх сонгосон суурь зураг ил гарна.
     * (Suitability-ийн газартай ИЖИЛ загвар.) Widget нь view-тэй хамт устна.
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
    // ⚠️ `change` дотор setOrtho — context шинэчлэгдэж, харагдацын эффект imagery-г тавина
    orthoChk.addEventListener('change', () => setOrtho(orthoChk.checked));
    orthoRow.append(orthoChk, document.createTextNode(tr('Ортофото')));
    const galleryDiv = document.createElement('div');
    bmPanel.append(orthoRow, galleryDiv);
    new BasemapGallery({
      view,
      container: galleryDiv,
      // ⚠️ Тодорхой заасан эх сурвалж — portal нэвтрэлтээс ҮЛ ХАМААРАН
      //    Esri-ийн стандарт суурь зургууд үргэлж ачаалагдана.
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
    view.ui.add(new Expand({
      view,
      content: bmPanel,
      expandIcon: 'basemap',
      expandTooltip: tr('Суурь зураг сонгох'),
      collapseTooltip: tr('Хаах'),
      mode: 'floating',
    }), 'top-right');

    /**
     * ⚠️ 2026-08-20: ArcGIS-ийн `LayerList` виджет ЭНДЭЭС ХАСАГДАВ.
     *
     * Тэр нь баруун дээд буланд ХОЁР ДАХЬ давхарга асаах/унтраах жагсаалт
     * гаргадаг байсан — порталын «Давхарга» товч/каталогтой яг ижил ажиллагаа,
     * гэхдээ ӨӨР загвар, ӨӨР нэрлэлт (SDK-ийн түүхий `title`), ӨӨР дараалал.
     * Хоёр жагсаалт нэг зурагт зөрчилддөг: каталогоос унтраасныг LayerList
     * дээр асаачихвал каталогийн чагт худал болдог байв.
     *
     * Түүнийг үлдээх цорын ганц шалтгаан нь «бүтэн дэлгэцэд каталог руу гарах
     * шаардлагагүй» байсан; одоо `MapTools` нь ЗУРГАН ДЭЭР хөвдөг тул бүтэн
     * дэлгэцэд ч «Давхарга» бүрэн ажиллана — шалтгаан нь дуусав.
     *
     * ⚠️ Суурь зургийн виджет (`BasemapGallery`, дээр) нь ДАВХАРДАЛГҮЙ —
     * тэр нь ямар СУУРЬ зураг (хиймэл дагуул/гудамж/топо) вэ гэдгийг сонгодог
     * бөгөөд үүнийг pill-ийн аль ч товч хийдэггүй. Хэвээр үлдэнэ.
     */

    /**
     * БҮТЭН ДЭЛГЭЦИЙН товч — Esri-ийн widget товчны загвараар (ижил хэмжээ,
     * ижил дэвсгэр) тул бусад удирдлагатай нэг формат. Toggle нь компонентын
     * `fs` төлвийг удирдана (`toggleFsRef` — click үргэлж сүүлийн callback-ыг дуудна).
     */
    const fsBtn = document.createElement('div');
    fsBtn.className = 'esri-widget--button esri-widget';
    fsBtn.setAttribute('role', 'button');
    fsBtn.setAttribute('tabindex', '0');
    fsBtn.title = tr('Бүтэн дэлгэц');
    fsBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
      + '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" '
      + 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    fsBtn.addEventListener('click', () => toggleFsRef.current());
    view.ui.add(fsBtn, 'top-right');

    view.when(() => {
      if (view.destroyed) return;
      setReady(true);
      registerRef.current(view);
      /**
       * Эхлэх хүрээг БҮСИЙН давхаргаар — төслийн жинхэнэ хамрах хүрээ.
       *
       * ⚠️ `animate: false` ЗААВАЛ: нисэж очих үед завсрын БҮХ түвшний tile +
       * 9 ортофотогийн export дахин дахин татагдаж, зураг удаан «бүдгээс тод»
       * болдог байв. Шууд үсрэхэд зөвхөн ЭЦСИЙН хүрээний зураг л татагдана.
       * Хүрээг модулийн кэшид хадгална — 2D↔3D солиход дахин query хийхгүй,
       * дахин үсрэхгүй (бүс өөрчлөгддөггүй статик хүрээ).
       */
      if (homeExtentCache) {
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
      // ⚠️ Харагдац солиход cleanup нь view-г устгахад `when()` reject хийж болно —
      //    тэр нь жинхэнэ алдаа биш тул зөвхөн АМЬД view-ийн уналтыг тэмдэглэнэ.
      //    Эс бөгөөс «ачаалж байна…» давхарга мэдээлэлгүй ҮҮРД дүүжигнэдэг байв.
      if (!view.destroyed) setInitError(true);
    });

    /**
     * Дарж/хулгана аваачихад ХАМААРАХ давхаргын объектыг олох.
     *
     * ⚠️ `hitTest`-д `include` ӨГӨХГҮЙ. 3D-д `IntegratedMesh` нь бүх талбайг
     * бүрхдэг бөгөөд `include`-д ороогүй давхарга нь ТУСГААРЛАГДАХ биш, туяаг
     * түрүүлж таслах учир доор нь дарагдсан вектор объект огт буцаж ирдэггүй
     * байв — 3D-д сонголт «ажиллахгүй» байсны шалтгаан. Бүх үр дүнг авчраад
     * КАТАЛОГТ БҮРТГЭЛТЭЙ, ИЛ давхаргын эхнийхийг нь өөрсдөө шүүнэ.
     */
    const pickHit = (r: __esri.HitTestResult) => {
      for (const x of r.results) {
        if (x.type !== 'graphic') continue;
        const lyr = x.graphic.layer;
        // ⚠️ `Layer.id` нь дэд давхаргын улмаас `string | number` гэж бичигдсэн —
        // каталог нь мөрөөр түлхүүрлэдэг тул НЭГ удаа хөрвүүлж авна.
        const id = lyr == null ? '' : String(lyr.id);
        if (!lyr || !lyr.visible || PASSIVE.has(id)) continue;
        if (!LAYER_BY_ID[id]) continue;
        return { attrs: x.graphic.attributes as Record<string, unknown>, id };
      }
      return null;
    };

    /**
     * ⚠️ `hitTest` нь РЕНДЕРЛЭГДСЭН пикселээс хамаарна. 3D-д (`SceneView`)
     * вектор давхаргууд газрын гадаргуу дээр наалддаг бөгөөд `IntegratedMesh`
     * тэдгээрийг далдалж, гадаргуугийн композит бүрэн болтол `hitTest` хоосон
     * буцаадаг — сонголт «ажиллахгүй» болдгийн ГОЛ шалтгаан.
     *
     * Тиймээс hitTest хоосон бол ОРОН ЗАЙН АСУУЛГА руу шилжинэ: дарсан цэгээс
     * хэдэн пикселийн хүлцэлтэйгээр ил давхаргуудаас хайна. Энэ нь зургийн
     * рендерээс огт хамаарахгүй тул 2D, 3D хоёуланд ижил ажиллана.
     */
    const pickByQuery = async (mapPoint: __esri.Point, tolerance: number) => {
      /**
       * ⚠️ 2026-08-19: Давхаргын ИДЭВХТЭЙ `definitionExpression`-ийг хамт барина.
       *
       * Урьд нь энэ fallback нь `where` огт өгдөггүй (=`1=1`) байв. Тэр илэрхийлэлд
       * (1) бүсийн шүүлт, (2) давхаргын тогтмол `d.where`, (3) 3D-ийн тодруулга
       * ГУРВУУЛАА агуулагддаг тул зурган дээр ХАРАГДАХГҮЙ обьект сонгогддог байлаа.
       * 3D-д энэ нь ОНЦГОЙ тохиолдол БИШ — торон гадаргуу `hitTest`-ийг няцаадаг
       * тул энэ fallback нь ХЭВИЙН зам (дээрх тайлбарыг үз): бүс сонгосон
       * хэрэглэгч дарахад нуугдсан обьектын самбар нээгддэг байв.
       */
      const cand = (view.map?.layers.toArray() ?? [])
        .map((l) => ({ l, id: String(l.id) }))
        // ⚠️ PASSIVE-ийг pickHit-тэй АДИЛ хасна — эс бөгөөс үргэлж ил лавлагааны
        //    хил (khil1) fallback-аар байнга «сонгогдож» зарчим зөрчигдөнө.
        .filter(({ l, id }) => l.visible && !PASSIVE.has(id) && LAYER_BY_ID[id])
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

      /**
       * ⚠️ 3-ААР БАГЦАЛЖ, эхний олдвор дээр ЗОГСОНО (2026-08-21 гүйцэтгэлийн
       * аудит): урьд нь бүх ил давхаргад (план дээр ~14, каталогтой 20+) ЗЭРЭГ
       * асуулга явуулаад зөвхөн эхнийхийг нь авдаг байв — сул товшилт бүр
       * ~14-20 хүсэлт үрж, 6 слотын хязгаарлагчаар бусад картын асуулгыг
       * хойшлуулна. Хэрэглэгчийн онилдог цэг/шугам зурах эрэмбийн дээр тул
       * ихэнхдээ эхний багцаар шийдэгдэнэ; бүрэн хоосон газар л бүх давхаргыг
       * туулна (бүрхэлт хэвээр — гүнзгий давхарга ч сонгогдоно).
       */
      const BATCH = 3;
      for (let i = 0; i < cand.length; i += BATCH) {
        const batch = cand.slice(i, i + BATCH);
        const rows = await Promise.all(batch.map(({ l, id }) =>
          queryFeatures(layerUrl(LAYER_BY_ID[id]), {
            aoi,
            limit: 1,
            where: (l as __esri.FeatureLayer).definitionExpression || '1=1',
          }).catch(() => [] as Record<string, unknown>[]),
        ));
        for (let k = 0; k < batch.length; k++) {
          if (rows[k].length) return { attrs: rows[k][0] as Record<string, unknown>, id: batch[k].id };
        }
      }
      return null;
    };

    // ⚠️ `e`-г ИЛ бичнэ: `view` нь MapView|SceneView нэгдэл тул `on()`-ийн
    // overload шийдэгдэхгүй бөгөөд параметр чимээгүй `any` болно.
    /**
     * ⚠️ Даралтын ДАРААЛЛЫН токен. `pickByQuery` нь 6 слотын хязгаарлагчаар
     * цувдаг удаан REST асуулга тул хоцорсон хариу нь ДАРААГИЙН даралтын
     * сонголтыг дарж бичдэг байв: сул газар (удаан fallback) → объект дээр
     * дараалан дарахад 1-ийн хожуу ирсэн `null` нь сая нээгдсэн самбарыг
     * хаана. Зөвхөн СҮҮЛЧИЙН даралтын үр дүн `pickRef`-д хүрнэ.
     */
    let clickSeq = 0;
    const click = view.on('click', (e: __esri.ViewClickEvent) => {
      const seq = ++clickSeq;
      view.hitTest(e)
        .then(async (r) => {
          // Хоцорсон hitTest — шинэ даралт аль хэдийн явж байна
          if (seq !== clickSeq) return;
          const hit = pickHit(r);
          if (hit) { pickRef.current(hit.attrs, hit.id); return; }
          if (view.destroyed || !e.mapPoint) { pickRef.current(null, null); return; }
          // ≈6 пикселийн хүлцэл — нимгэн шугам, жижиг цэгийг барихад хангалттай
          const tol = Math.max(2, (view.resolution || 1) * 6);
          const q = await pickByQuery(e.mapPoint, tol);
          if (!view.destroyed && seq === clickSeq) pickRef.current(q?.attrs ?? null, q?.id ?? null);
        })
        .catch(() => {/* view устгагдсан — сонголт өөрчлөгдөхгүй */});
    });

    let busy = false;
    const move = view.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      if (busy) return;
      busy = true;
      view.hitTest(e)
        .then((r) => {
          if (view.destroyed || !view.container) return;
          const hit = pickHit(r);
          view.container.style.cursor = hit ? 'pointer' : 'default';
          // Товч мэдээллийн хайрцаг — заагчийн хажууд
          setTip(hit ? { x: e.x, y: e.y, id: hit.id, attrs: hit.attrs } : null);
        })
        .catch(() => {})
        // ⚠️ finally — эс бөгөөс нэг унасан hitTest `busy`-г үүрд түгжинэ
        .finally(() => { busy = false; });
    });

    const leave = view.on('pointer-leave', () => setTip(null));

    return () => {
      click.remove();
      move.remove();
      leave.remove();
      fadeHandle.remove();
      setTip(null);
      /**
       * ⚠️ `view.destroy()` нь 4.17-оос хойш ӨӨРИЙН `map`-ыг ч хамт устгадаг.
       * 2D↔3D солиход Map хэвээр үлдэх ёстой тул холбоог эхлээд тасална — эс
       * бөгөөс шинэ view «The provided map is already destroyed» гэж унана.
       */
      view.container = null as unknown as HTMLDivElement;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
      registerRef.current(null);
    };
    // `initToken` — «Дахин оролдох» дарахад view-г дахин үүсгэнэ
  }, [dim, stylesReady, initToken]);

  /**
   * Компонент салахад Map-ыг УСТГАХГҮЙ — `mapCache`-д үлдэж дараагийн харагдацад
   * дахин ашиглагдана (view нь [dim] эффектийн cleanup-д тусад нь устна).
   *
   * ⚠️ Map амьд үлддэг УЧРААС энэ харагдацын түр дарлагуудыг ЭНД буцаана —
   * `styleBackup`/`defaultOpacityRef` нь КОМПОНЕНТЫН ref тул unmount-д хамт
   * устаж, буцаах өөр боломж үлддэггүй:
   *   · renderer дарлага (`layerStyle`) — эс бөгөөс Багцын ягаан нэгж талбар
   *     дараагийн харагдацад үлдэж, Tsogts бүр түүнийг «анхны» гэж нөөцөлснөөр
   *     хуудас refresh хийтэл засрахгүй байв;
   *   · тунгалагийн override — эс бөгөөс 20% болгосон давхаргыг дараагийн
   *     mount 20%-ийг «анхдагч» гэж бүртгэж, webmap-ийн жинхэнэ opacity
   *     session дуустал алдагдана.
   * (Энэ effect [dim] effect-ээс ХОЙНО зарлагдсан тул cleanup нь view устсаны
   * дараа, `mapRef` хоосорхоос ӨМНӨ ажиллана.)
   */
  useEffect(() => () => {
    const map = mapRef.current;
    if (map) {
      for (const [id, r] of Object.entries(styleBackup.current)) {
        const fl = map.findLayerById(id) as FeatureLayer | null;
        if (fl && 'renderer' in fl) fl.renderer = r as FeatureLayer['renderer'];
      }
      for (const [id, v] of Object.entries(defaultOpacityRef.current)) {
        const l = map.findLayerById(id);
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
   *
   * ⚠️ `visible: false`-ээр нуух нь ХАНГАЛТГҮЙ: MapView нь эдгээр 3D давхаргыг
   * дэмждэггүй тул зурагт БАЙХАД л «Failed to create layerview» өгнө. Тиймээс
   * горим биш үед бүрмөсөн ХАСНА.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    /* ⚠️ `Map` нэр нь ArcGIS-ийн Map-аар дарагдсан (импорт) тул JS-ийн Map-ыг
       энд ХЭРЭГЛЭХГҮЙ — энгийн массив + Set-ээр шийднэ. */
    const want = sceneList.map((m) => ({ id: `scene:${m.key}`, m }));
    const wantIds = new Set(want.map((w) => w.id));

    /**
     * ⚠️ Эхлээд ХАСНА: 3D биш горим, эсвэл энэ харагдацын жагсаалтад ороогүй
     * (өмнөх харагдацаас үлдсэн) БҮХ `scene:*` меш. Кэшлэгдсэн Map дээр энэ
     * цэвэрлэгээгүй бол Сэлбэ1–3 ба Selbewebapp меш зэрэг зурагдана.
     */
    for (const l of map.layers.toArray()) {
      const id = String(l.id);
      if (!id.startsWith('scene:')) continue;
      if (dim !== '3d' || !wantIds.has(id)) {
        map.remove(l);
        l.destroy();
      }
    }

    if (dim === '3d') {
      for (const { id, m } of want) {
        if (map.findLayerById(id)) continue;
        // Индекс 1 — ортофотогийн дараа, вектор давхаргуудын өмнө
        map.add(new IntegratedMeshLayer({ id, url: m.url, title: m.title, visible: true }), 1);
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

    /**
     * SCENE3D — 'selbe_3D_ 0804' web scene-ийн 14 давхарга (барилга, зам, мод,
     * ногоон, спорт г.м.). ⚠️ Renderer-ийг scene-ээс ХУУЛСАН (`scene3d.ts`) —
     * барилгыг `Давх_1`-ээр өргөх Extrude зэрэг 3D style-ийг `fromJSON`-оор ЯГ
     * тавьдаг тул scene дээрхтэй ижил. ЗӨВХӨН BIM (SceneView) горимд, эс бөгөөс
     * MapView «layerview» алдаа өгнө.
     */
    for (const s of SCENE3D_LAYERS) {
      const existing = map.findLayerById(s.id);
      if (dim === 'bim' && !existing) {
        /**
         * ⚠️ BIM давхаргыг 2D map-тай ЖИГД болгох (хэрэглэгчийн хүсэлт), ГЭХДЭЭ
         * зөвхөн БОЛОМЖТОЙГ нь: мод (Object/3D загвар), барилга (Extrude), ус
         * (Water) зэрэг ЖИНХЭНЭ 3D симбол нь 3D хэвээр үлдэнэ; хавтгай fill/line
         * давхаргууд (ногоон, зам, явган, дугуй г.м.) л план2d 2D style-ийг авна.
         * scene3d:N ↔ план2d sb:N нь ижил service.
         */
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
        /**
         * ⚠️ SceneView нь ЗУРГАН дүүргэлт (esriPFS) болон зургийн маркер (esriPMS)
         * дэмждэггүй — тэдгээрийг тавьбал давхарга 3D-д ОГТ зурагдахгүй (ногоон,
         * зам, явган, дугуй BIM дээр алга болж байсан шалтгаан). Тиймээс esriPFS
         * текстурыг СУУРЬ ӨНГӨӨР нь (SVG-ийн эхний rect fill) цул дүүргэлт болгож
         * хөрвүүлнэ — BIM дээр 2D план map-тай ижил өнгөтэй харагдана.
         */
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
      if (dim === 'bim' && !tgl3d && tglDef) {
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
     *
     * ⚠️ Меш/BIM шиг зайлшгүй хасах шаардлагагүй (энгийн FeatureLayer нь
     * MapView-д ч ажиллана) боловч хэрэглэгч 2D-д үүнийг асаах/унтраах
     * удирдлагагүй тул үлдээвэл байнга зурагдах, хааж болохгүй давхарга болно.
     */
    // ⚠️ «Усан сан» — хэрэглэгчийн хүсэлтээр газрын зурагт УНТРААВ: огт нэмэхгүй,
    //    байвал устгана (scene-ийн «Гол» ус хангалттай). Буцааж асаах бол өмнөх
    //    `dim !== '2d'` дээр нэмэх логикийг сэргээнэ.
    const usan = map.findLayerById(USAN_SAN.id);
    if (usan) { map.remove(usan); usan.destroy(); }

    // ⚠️ dep нь `sceneKey` (мөр) — `sceneList` массив рендер бүрт шинэ лавлагаатай.
  }, [dim, ready, sceneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * IoT МЭДРЭГЧ — 3D-д газраас дээш өргөгдсөн радар тэмдэг, 2D-д энгийн цэг.
   *
   * ⚠️ Давхарга нь НЭГ УДАА үүсдэг бөгөөд MapView ба SceneView ХОЁУЛАА ижил
   *    инстанцыг хуваалцдаг. `point-3d` симболыг 2D-д үлдээвэл давхарга огт
   *    зурагдахгүй болно — тиймээс горим солигдох бүрд БУЦААЖ энгийн цэг рүү
   *    сэргээх нь заавал (эс бөгөөс 3D-ээс 2D руу шилжихэд мэдрэгч алга болно).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const lift = dim !== '2d';
    for (const d of LAYERS) {
      if (!d.id.startsWith('iot:')) continue;
      const l = map.findLayerById(d.id) as __esri.FeatureLayer | undefined;
      if (!l) continue;
      l.renderer = simple(lift ? radarSymbol(d.hue) : symbolOf(d)) as never;
      /**
       * ⚠️ `relative-to-scene` — меш/барилгын ДЭЭД гадаргаас хэмжинэ. `on-the-ground`
       * үед `verticalOffset` нь газрын гадарга дээрээс тоологдож, барилгын дээвэр
       * дээр суусан мэдрэгч дээвэр дотор орж алга болно.
       */
      l.elevationInfo = (lift ? { mode: 'relative-to-scene' } : ON_GROUND) as never;
    }
  }, [dim, ready]);

  /**
   * НҮХЭН ЖОРЛОН — 2D-д КЛАСТЕР асаах.
   *
   * ⚠️ Кластер ↔ ганц цэг солилтыг `featureReduction.maxScale` ӨӨРӨӨ хийнэ —
   * `view.scale` сонсох шаардлагагүй. Гэрэлтүүлгийг мөн адил `TOILET_EFFECT`-ийн
   * масштабын зогсолтууд хариуцна. Тиймээс энд ажиллах явцад юу ч бодогдохгүй,
   * зөвхөн НЭГ УДААГИЙН оноолт.
   *
   * ⚠️ ЗӨВХӨН 2D: SceneView кластер дэмжихгүй. Горим солигдоход энэ эффект
   * дахин ажиллаж (`dim` хамаарал) кластерыг цэвэрлэнэ.
   *
   * ⚠️ Cleanup-д ЗААВАЛ цэвэрлэнэ: Map кэшлэгддэг тул кластер нь өөр харагдацад
   * үлдэж болзошгүй.
   */
  const toiletOn = visibleKey.split(',').includes(IRGED_TOILET.id);
  useEffect(() => {
    const view = viewRef.current;
    const map = mapRef.current;
    if (!view || !map || !ready || !toiletOn || view.type !== '2d') return;
    const layer = map.findLayerById(IRGED_TOILET.id) as FeatureLayer | null;
    if (!layer) return;

    layer.featureReduction = toiletCluster(IRGED_TOILET.hue);
    return () => { layer.featureReduction = null; };
  }, [dim, ready, toiletOn]);

  /**
   * BuildingExplorer виджет — ЗӨВХӨН BIM горимд.
   *
   * ⚠️ Дээрх effect-ийн ДАРАА байрлана: BIM давхаргууд газрын зурагт нэмэгдсэн
   * байх ёстой (React effect-үүд зарлагдсан дарааллаараа ажиллана). Виджет нь
   * тэдгээр давхаргаар давхар/дисциплин/категориор шүүх боломж өгнө.
   *
   * ⚠️ view дахин үүсэх (2D↔3D↔BIM солих) бүрд шинэ виджет хэрэгтэй тул хуучныг
   * заавал устгана — `view.destroy()` UI-г цэвэрлэдэг ч бид ref-ээ гар аргаар
   * тэглэхгүй бол устсан виджет рүү заасаар үлдэнэ.
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready) return;

    const clear = () => {
      if (bimExpandRef.current) {
        // ⚠️ view устсан бол `view.ui` null — эхлээд шалгана (unmount-д эвдрэхгүй)
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

    const layers = BIM.layers
      .map((b) => map.findLayerById(b.key))
      .filter((l): l is BuildingSceneLayer => l instanceof BuildingSceneLayer);
    if (!layers.length) return;

    clear();
    const widget = new BuildingExplorer({ view: view as SceneView, layers });
    /**
     * ⚠️ 2026-08-23: `Expand`-д БООВ (хэрэглэгчийн хүсэлт). Урьд нь виджет
     * баруун дээд буланд ЗАДГАЙ нэмэгддэг байсан тул 12 барилгын давхар,
     * дисциплин, категорийн мод нь зургийн баруун талыг байнга эзэлж, BIM
     * горимд загвараа харах талбай эрс багасдаг байв. Одоо жижиг дүрс —
     * дарахад л задарна (суурь зураг, хэмжилт, слайдтай ижил хэв маяг).
     */
    const expand = new Expand({
      view,
      content: widget,
      expandIcon: 'layers',
      expandTooltip: tr('BIM давхаргын удирдлага'),
      collapseTooltip: tr('Хаах'),
      mode: 'floating',
    });
    /* ⚠️ ЭНД `view.ui.add` ХИЙХГҮЙ — байрлуулалт нь доорх ТУСДАА effect-д.
       Шалтгааныг тэндхийн тайлбараас үз (виджетийн эрэмбэ). */
    bimWidgetRef.current = widget;
    bimExpandRef.current = expand;

    /**
     * «ARCHITECTURAL» ДИСЦИПЛИН — ҮРГЭЛЖ АСААЛТТАЙ (хэрэглэгчийн хүсэлт).
     *
     * ⚠️ Давхарга ачаалагдсаны ДАРАА л `allSublayers` дүүрдэг — `when()`-гүйгээр
     * шууд уншвал жагсаалт ХООСОН байх бөгөөд алдаа ч өгөхгүй, зүгээр л юу ч
     * болохгүй өнгөрнө.
     *
     * ⚠️ Бүлгийг асаахад ХАНГАЛТГҮЙ: бүлгийн `visible` нь зөвхөн хаалт бөгөөд
     * доторх бүрэлдэхүүн давхарга бүр өөрийн `visible`-тэй. Тиймээс бүлэг ба
     * хүүхдүүдийг нь ХОЁУЛАНГ нь асаана.
     */
    let stale = false;
    for (const l of layers) {
      l.when(() => {
        if (stale) return;
        const arch = l.allSublayers.find(
          (sl) => /architectural/i.test(sl.modelName ?? ''),
        );
        if (!arch) return;
        arch.visible = true;
        const kids = (arch as __esri.BuildingGroupSublayer).sublayers;
        kids?.forEach((k) => { k.visible = true; });
        // ⚠️ Алдааг залгина — нэг барилга ачаалагдахгүй бол бусад нь хэвийн
      }).catch(() => {});
    }

    return () => { stale = true; clear(); };
  }, [dim, ready]);

  /**
   * ШИНЖИЛГЭЭНИЙ ЦОГЦ ХЭРЭГСЭЛ («Analysis objects») — ЗӨВХӨН 3D/BIM (SceneView).
   *
   * ⚠️ Esri-ийн «Analysis objects» жишээгээр 6 шинжилгээг НЭГ toolbar-т нэгтгэв.
   *    Өмнөх ДАВХАРДСАН тусдаа хэрэгслүүд (viewshed, зай/талбай хэмжилтийн widget)
   *    ХАСАГДСАН — энэ цогц хэрэгсэл тэдгээрийг бүрэн орлоно:
   *      · Талбай (AreaMeasurementAnalysis)   · Зай (DirectLineMeasurementAnalysis)
   *      · Харах шугам (LineOfSightAnalysis)   · Харагдац (ViewshedAnalysis)
   *      · Хэмжээс (DimensionAnalysis)         · Огтлол (SliceAnalysis)
   *    Товч дарж → зурган дээр дараалан байршуулна; «Арилгах»/«Дуусгах».
   *    view дахин үүсэх бүрд бүх шинжилгээ + toolbar-ыг цэвэрлэнэ.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !is3D(dim)) return;
    const sv = view as SceneView;

    type AV = { interactive: boolean; place: (o?: { signal?: AbortSignal }) => Promise<unknown> };
    type Tool = { name: string; type: string; icon: string; analysis: __esri.Analysis; av: AV | null; btn?: HTMLElement };
    const tools: Tool[] = [
      { name: tr('Талбай'), type: 'area-measurement', icon: 'esri-icon-measure-area', analysis: new AreaMeasurementAnalysis(), av: null },
      { name: tr('Зай'), type: 'direct-line-measurement', icon: 'esri-icon-measure-line', analysis: new DirectLineMeasurementAnalysis(), av: null },
      { name: tr('Харах шугам'), type: 'line-of-sight', icon: 'esri-icon-line-of-sight', analysis: new LineOfSightAnalysis(), av: null },
      { name: tr('Харагдац'), type: 'viewshed', icon: 'esri-icon-visible', analysis: new ViewshedAnalysis(), av: null },
      { name: tr('Хэмжээс'), type: 'dimension', icon: 'esri-icon-measure', analysis: new DimensionAnalysis(), av: null },
      { name: tr('Огтлол'), type: 'slice', icon: 'esri-icon-cursor-marquee', analysis: new SliceAnalysis(), av: null },
    ];
    tools.forEach((t) => sv.analyses.add(t.analysis));
    void Promise.all(
      tools.map(async (t) => {
        t.av = (await sv.whenAnalysisView(t.analysis as never)) as unknown as AV;
      }),
    ).catch((err) => {
      // ⚠️ dim хурдан солигдож view устахад reject ХЭВИЙН — чимээгүй; бусад нь
      //    жинхэнэ уналт тул unhandled rejection болгохгүй, ил тэмдэглэнэ.
      if (!view.destroyed) console.error('[analysis]', err);
    });

    let active: Tool | null = null;
    let abort: AbortController | null = null;

    const mk = (tag: string, css: string, txt?: string) => {
      const n = document.createElement(tag);
      n.style.cssText = css;
      if (txt != null) n.textContent = txt;
      return n;
    };
    // Цэвэр DARK загвар (аппын design token) — хэвтээ ИКОН action-bar
    const panel = mk('div', 'width:238px;padding:15px;display:flex;flex-direction:column;gap:12px;'
      + 'background:var(--surface);color:var(--ink);font-family:inherit');
    panel.append(mk('div', 'font-size:0.92rem;font-weight:700;color:var(--ink)', tr('Шинжилгээ')));
    const bar = mk('div', 'display:flex;gap:6px');
    const iconBtnCss = 'flex:1;height:40px;display:grid;place-items:center;border:1px solid var(--line);'
      + 'border-radius:9px;color:var(--ink-2);cursor:pointer;background:transparent;transition:background .12s,color .12s,border-color .12s';
    tools.forEach((t) => {
      const b = mk('button', iconBtnCss) as HTMLButtonElement;
      b.title = t.name;
      const ic = mk('span', 'font-size:18px');
      ic.className = t.icon;
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
      void placeContinuous();
    };
    const clearActive = () => {
      if (!active) return;
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

    return () => {
      abort?.abort();
      // ⚠️ view устсан бол `view.ui` null — эхлээд шалгана (харагдац солиход эвдрэхгүй)
      if (!view.destroyed) {
        view.ui.remove(expand);
        tools.forEach((t) => sv.analyses.remove(t.analysis));
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
    const vma = new VolumeMeasurementAnalysis({
      measureType: 'stockpile',
      displayUnits: { volume: 'metric', elevation: 'metric' },
    });
    sv.analyses.add(vma);
    let vAbort: AbortController | null = null;
    let vWatch: __esri.WatchHandle | null = null;

    const panelV = mk('div', 'width:250px;padding:15px;display:flex;flex-direction:column;gap:11px;'
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
      vma.displayUnits.volume = volUnit.value as unknown as typeof vma.displayUnits.volume;
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

    void sv.whenAnalysisView(vma).then((av) => {
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
    vPlace.addEventListener('click', async () => {
      vAbort?.abort();
      vAbort = new AbortController();
      const signal = vAbort.signal;
      try {
        const av = await sv.whenAnalysisView(vma);
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

    // ══════════ СЛАЙД ══════════
    const slides: Slide[] = [];
    const panelS = mk('div', 'width:262px;padding:15px;display:flex;flex-direction:column;gap:11px;'
      + 'max-height:72vh;overflow:auto;background:var(--surface);color:var(--ink)');
    panelS.append(mk('div', 'font-size:0.92rem;font-weight:700;color:var(--ink)', tr('Слайд')));
    const listDiv = mk('div', 'display:flex;flex-direction:column;gap:6px');
    panelS.append(listDiv);

    // Слайд бүр — thumbnail зураг + нэр + огноо + × устгах (Esri sample шиг)
    /**
     * Порталын нэг дүрэм — mn-MN («2026.07.14»); урьд нь en-GB (DD/MM/YYYY)
     * байж өдөр/сар андуурагдахаар байв.
     * ⚠️ `timeZone:'UTC'`-г ЗААВАЛ хадгална: энэ нь нарны гэрэлтүүлгийн UTC
     * агшин тул хаявал Монголд +8 цагаар шилжиж нарны цаг буруу харагдана.
     */
    const fmtSlideDate = (d?: Date) => {
      try {
        return d
          ? d.toLocaleString('mn-MN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          })
          : '';
      } catch { return ''; }
    };
    const addSlideRow = (slide: Slide) => {
      const row = mk('div', 'display:flex;align-items:center;gap:9px;padding:7px;border:1px solid var(--line);'
        + 'border-radius:8px;background:var(--surface-2);cursor:pointer');
      const img = mk('img', 'width:60px;height:40px;object-fit:cover;border-radius:5px;flex:none') as HTMLImageElement;
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
      row.append(img, info, del);
      row.addEventListener('click', () => { void slide.applyTo(sv, { speedFactor: 0.6 }); });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = slides.indexOf(slide);
        if (i >= 0) slides.splice(i, 1);
        row.remove();
      });
      listDiv.append(row);
    };

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
      void Slide.createFrom(sv).then((slide) => {
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
      vAbort?.abort();
      vWatch?.remove();
      if (!view.destroyed) {
        view.ui.remove(expandV);
        view.ui.remove(expandS);
        sv.analyses.remove(vma);
      }
      expandV.destroy();
      expandS.destroy();
    };
  }, [dim, ready]);

  /**
   * BIM УДИРДЛАГЫГ ВИДЖЕТИЙН БАГЦЫН ХАМГИЙН ДООР БАЙРЛУУЛНА
   * (хэрэглэгчийн хүсэлт, 2026-08-23).
   *
   * ⚠️ ЯАГААД ТУСДАА EFFECT ВЭ. `view.ui.add` нь баруун дээд багцад ДУУДАГДСАН
   * дарааллаараа өрдөг бөгөөд React нь effect-үүдийг ЗАРЛАГДСАН дарааллаар
   * ажиллуулдаг. BIM-ийн виджетийг үүсгэдэг effect нь шинжилгээ · эзлэхүүн ·
   * слайдынхаас ӨМНӨ зарлагдсан тул тэрхүү effect дотроо нэмбэл BIM нь
   * тэдгээрийн ДЭЭР гарч, багцын дундад үлдэнэ. Энэ effect нь тэднээс ХОЙНО
   * зарлагдсан тул нэмэлт нь эцэст буюу хамгийн доор очно:
   *
   *   суурь зураг · дэлгэц дүүрэн · шинжилгээ · эзлэхүүн · слайд · **BIM**
   *
   * ⚠️ `bimExpandRef` нь дээрх effect-д ЯГ ЭНЭ КОММИТ дотор бөглөгддөг —
   * ref нь хувьсагч тул энд уншихад аль хэдийн бэлэн байна.
   */
  useEffect(() => {
    const view = viewRef.current;
    const expand = bimExpandRef.current;
    if (!view || !ready || dim !== 'bim' || !expand) return;
    view.ui.add(expand, 'top-right');
    // ⚠️ Хоёр газраас устгагдаж болно (дээрх `clear` ба энд) — `remove` нь
    //    байхгүй бүрэлдэхүүн дээр аюулгүй, юу ч хийхгүй өнгөрнө.
    return () => { if (!view.destroyed) view.ui.remove(expand); };
  }, [dim, ready]);

  /**
   * ПОЛИГОН ЗУРАХ — `SketchViewModel` («Газар чөлөөлөлт»).
   *
   * ⚠️ Esri-ийн `Sketch` WIDGET-ийг ЗОРИУДААР ашиглахгүй: түүний өөрийн UI
   * (зүүн дээд булангийн нэргүй товчнууд) нь порталын загвартай нийцэхгүй.
   * Оронд нь `SketchViewModel`-ийг UI-гүйгээр ажиллуулж, зурах үйлдлийг ГАДНЫ
   * товчоор (`drawToken`) эхлүүлнэ — товч нь Gazar модульд өөрийн нэр, дүрс,
   * дэвсгэртэйгээр гарна.
   *
   * ⚠️ ЗӨВХӨН 2D (MapView)-д. Орон зайн `featureEffect` (бүдгэрүүлэлт) нь
   * SceneView-д ажиллахгүй тул полигон зурах нь 2D дээр л утга учиртай.
   * Зурсан полигоныг `'sketch'` id-тэй `GraphicsLayer`-т хадгална — энэ id нь
   * `PASSIVE`-д бүртгэлтэй тул дарж сонгогдохгүй, шүүлтэд оролцохгүй.
   */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready || !sketch || is3D(dim)) return;

    let gl = map.findLayerById('sketch') as GraphicsLayer | null;
    if (!gl) {
      gl = new GraphicsLayer({ id: 'sketch', listMode: 'hide' });
      map.add(gl);
    }
    const layer = gl;

    const svm = new SketchViewModel({
      view: view as MapView,
      layer,
      // Зурсан талбайн симбол — БАРИЛГА (ногоон) ба КАДАСТР (цэнхэр) хоёроос
      // ЯЛГААТАЙ улбар шар, тасархай хүрээ: сонголтын хил гэдэг нь тод харагдана.
      polygonSymbol: {
        type: 'simple-fill',
        color: [245, 158, 11, 0.08],
        outline: { color: [217, 119, 6, 1], width: 2, style: 'dash' },
      } as unknown as __esri.SimpleFillSymbol,
    });
    sketchVMRef.current = svm;
    if (typeof window !== 'undefined') {
      (window as unknown as { __dbgsketch: SketchViewModel }).__dbgsketch = svm;
    }

    const emit = (g: __esri.Geometry | null) => onSketchRef.current?.(g);

    const created = svm.on('create', (e) => {
      if (e.state !== 'complete') return;
      // Зөвхөн СҮҮЛИЙН полигоныг үлдээнэ — өмнөхийг арилгана
      const keep = e.graphic;
      layer.removeAll();
      layer.add(keep);
      emit(keep.geometry ?? null);
    });
    const updated = svm.on('update', (e) => {
      const g = e.graphics?.[0]?.geometry ?? null;
      if (g) emit(g);
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
      // ⚠️ Графикийг УСТГАХГҮЙ: 2D↔3D сольж эргэн ирэхэд зурсан полигон хэвээр.
    };
  }, [sketch, dim, ready]);

  /** Гадны «Полигон зурах» товч — шинэ полигон зурж эхэлнэ */
  useEffect(() => {
    if (!drawToken) return;
    const svm = sketchVMRef.current;
    if (!svm) return;
    try { svm.cancel(); } catch { /* идэвхтэй зураалт байхгүй */ }
    svm.create('polygon');
  }, [drawToken]);

  /** Гадны «Цэвэрлэх» товч — зурсан полигоныг арилгаж, шүүлтийг цуцлана */
  useEffect(() => {
    if (!clearToken) return;
    try { sketchVMRef.current?.cancel(); } catch { /* идэвхгүй */ }
    const gl = mapRef.current?.findLayerById('sketch') as GraphicsLayer | null;
    gl?.removeAll();
    onSketchRef.current?.(null);
  }, [clearToken]);

  /**
   * Харагдац БҮРМӨСӨН солиход зурсан полигоныг цэвэрлэнэ. ⚠️ Map нь `mapCache`-д
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
   *
   * ⚠️ FeatureLayer-ийн геометрийг шууд масштаблаж болдоггүй тул объектуудыг
   *    тусдаа `source:pulse` GraphicsLayer-т ХУУЛЖ, кадр бүрт цэг бүрийг
   *    центроид тойруулан томруулна (ердөө 7 полигон — маш хөнгөн). Эх давхаргыг
   *    нуулгүй (opacity=0) зөвхөн пульслэх хуулбарыг харуулна.
   * • Хэсэг хаагдаж давхарга нуугдмагц (`!visible`) хуулбарыг цэвэрлэж зогсоно;
   *   unmount дээр `pulseCancelRef`-ээр ГАДНААС цуцлагдана (Map кэштэй тул
   *   давхарга ил үлдэж, гогцоо өөрөө хэзээ ч зогсдоггүй байв).
   */
  // `pulseLayer` нь тогтвортой лавлагаатай (useCallback) тул props-ыг ref-ээр уншина.
  pulseIdsRef.current = pulseIds ?? [];
  layerStyleRef.current = layerStyle ?? {};

  const pulseLayer = useCallback((layer: Layer) => {
    const map = mapRef.current;
    // ⚠️ `source:eh` нь ҮРГЭЛЖ пульсэлдэг (эх үүсвэрийн байршил); бусад нь
    //    зөвхөн харагдац хүсвэл (`pulseIds`).
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

    const finish = () => {
      fadingRef.current.delete(id);
      pulse.removeAll();
    };

    /**
     * ⚠️ rAF гогцоог unmount дээр ГАДНААС цуцлах функц. Map нь `mapCache`-д
     * үлддэг тул unmount-д `!src.visible` нөхцөл хэзээ ч биелэхгүй — цуцлахгүй
     * бол гогцоо үүрд ажиллаж, дахин mount-д ХОЁР дахь гогцоо давхарлан
     * бие биеийнхээ графикуудыг устгадаг байв. Query явж байхад цуцлагдвал
     * `cancelled` туг гогцоо эхлэхийг таслана.
     */
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
    // ⚠️ Давхаргын `definitionExpression`-ийг ЗААВАЛ дагана: давхцсан нэгж
    //    талбарын давхарга 2,119 объекттой бөгөөд шүүлтгүй асуувал бүх хот
    //    пульслэнэ.
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
            /* ⚠️ Харагдацын дарлага байвал ТҮҮНИЙ өнгөөр — эс бөгөөс пульсийн
               хуулбар нь давхаргын анхны (төлөвийн) өнгөөр гарч, доорх ялгаж
               өгсөн өнгөтэй зөрнө. */
            const ov = layerStyleRef.current[id];
            const hue = ov?.hue ?? ((pfield && pvals[String(ft.attributes?.[pfield])]) || d.hue);
            return { rings: poly.rings, cx: c.x, cy: c.y, sr: poly.spatialReference,
              symbol: ov ? fill(ov.hue, ov.fill ?? 0.25, ov.width ?? 3) : symbolOf(d, hue) };
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
   * Unmount — идэвхтэй пульс-гогцоог ЗААВАЛ цуцална. ⚠️ Харагдацын эффектийн
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
   * ⚠️ `fadingRef` нь «аль хэдийн пульсэлж байна» гэсэн хамгаалалт тул түүнийг
   *    цэвэрлэхгүй бол шинэ дуудлага чимээгүй буцна.
   */
  const restartPulse = useCallback((layer: Layer) => {
    // ⚠️ ЗӨВХӨН энэ давхаргынхыг — `pulseCancelRef` нь СҮҮЛД эхэлсэн пульсийг
    //    заадаг тул түүгээр таславал өөр давхаргын (эх үүсвэр) анимаци унтарна.
    pulseCancels.current[layer.id]?.();
    fadingRef.current.delete(layer.id);
    pulseLayer(layer);
  }, [pulseLayer]);

  /* Харагдац ба БҮСИЙН шүүлт */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);

    map.layers.forEach((l) => {
      if (l.id === IMAGERY_ID) { l.visible = ortho; return; }
      // ⚠️ Полигон зурах GraphicsLayer нь каталогийн `visible` жагсаалтад ХЭЗЭЭ Ч
      //    орохгүй тул энэ шалгуургүй бол доорх мөр түүнийг нууж, зурсан полигон
      //    алга болно. Sketch widget өөрөө агуулгыг удирдана — үргэлж ил.
      if (l.id === 'sketch') { l.visible = true; return; }
      // Эх үүсвэрийн пульс-хуулбар — өөрийн анимаци удирдана, каталогт үл хамаарна.
      if (l.id === 'source:pulse') { l.visible = true; return; }
      // Лавлагааны хилүүд — каталогоос үл хамааран БҮХ зурагт үргэлж ил.
      if ((ALWAYS_ON_IDS as readonly string[]).includes(String(l.id))) { l.visible = true; return; }
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
      // ⚠️ «Усан сан» — хэрэглэгчийн хүсэлтээр газрын зурагт УНТРААВ (усан бүрхэвч
      //    scene-ийн «Гол»-той давхцаж/ил үлдэж байсан). Буцааж асаах бол
      //    `dim !== '2d'` болгоно.
      if (l.id === USAN_SAN.id) { l.visible = false; return; }

      /**
       * СУУРЬ давхаргууд (план 2D-ийн 14) — каталогийн сонголт ХООСОН үед 2D-д
       * бүгд харагдана (анхны зураг план 2D шигээ бүрэн). Хэрэглэгч каталогоос
       * ЯМАР НЭГ давхарга сонгомогц суурь нь унтарч, ЗӨВХӨН сонгосон нь үлдэнэ;
       * сонголтоо арилгахад суурь буцаж асна. 3D-д меш, BIM-д scene3d:* орлоно.
       *
       * ⚠️ ЭНД `return` ХИЙХГҮЙ — доорх бүсийн шүүлт (definitionExpression)
       * суурь давхаргад ч тавигдах ёстой (sb:3, sb:4 нь ZONE_ID-тэй). Урьд нь
       * return хийдэг байсан тул бүс сонгоход суурь давхарга шүүгдэхгүй байв.
       */
      if ((BASE_MAP_IDS as readonly string[]).includes(String(l.id))) {
        l.visible = dim === '2d' && (on.size === 0 || on.has(String(l.id)));
      } else if (is3D(dim) && PLAN2D_ALIASED.has(String(l.id))) {
        /**
         * План2d ALIAS style-тай давхаргууд (dugui, nogoon, et:24, et:27, et:29) — renderer
         * нь зурган текстур (esriPFS/esriPMS) тул SceneView-д дэмжигдэхгүй. 3D/BIM-д
         * НУУНА: асаалттай орхивол «picture-fill is unsupported in 3D» алдаа асгарна.
         */
        l.visible = false;
      } else {
        // ⚠️ BIM горимд каталогийн 2D давхаргыг НУУНА — web scene өөрөө зам, ногоон,
        //    мод, барилгын 3D хувилбарыг агуулдаг тул давхцал/эмх замбараагүйг арилгаж
        //    scene-ийн цэвэр төрхтэй тааруулна.
        const show = on.has(l.id) && dim !== 'bim';
        // ЗӨВХӨН Эх үүсвэр (`source:eh`) давхарга шинээр ил болоход анзаарагдам
        // пульс-анимаци эхэлнэ. Бусад давхаргад (барилга г.м.) анимаци байхгүй.
        if (show && l.id === 'source:eh' && !prevVisRef.current.has(l.id)) pulseLayer(l);
        l.visible = show;
      }

      /**
       * Бүсийн шүүлт — `definitionExpression`-оор объектыг БҮРЭН хасна.
       *
       * ⚠️ 2D-д `featureEffect` БИШ. Тэрийг ангиллын тодруулга эзэлдэг бөгөөд
       * ArcGIS давхаргад ганцхан `featureEffect` байдаг тул хоёуланг нэг дор
       * хийвэл сүүлд бичсэн нь нөгөөгөө чимээгүй устгана. `definitionExpression`
       * нь тусдаа механизм — хоёулаа зэрэг ажиллана.
       *
       * ⚠️ 3D-д (SceneView) `featureEffect` ажиллахгүй тул тодруулга ЭНД
       * нийлнэ. Нэг шинжид хоёр эзэн болох тул ЗААВАЛ `AND`-аар хослуулна —
       * дан дарж бичвэл бүсийн шүүлт эсвэл тодруулгын аль нэг нь алга болно.
       */
      /* ⚠️ Урьд нь энд WEB_DYNAMIC хэмээх ГАР СНАПШОТ давхаргын тоогоор хоёр
         палитрын хооронд renderer сольдог байв. Одоо загвар нь эх webmap-аас
         бүтнээр үүсгэгддэг (`lib/webmapStyle.ts` — `tools/webmap_style.mjs`)
         бөгөөд `buildLayers` дээр НЭГ УДАА тавигддаг тул энд солих зүйлгүй. */
      const d = LAYER_BY_ID[l.id];

      /* Харагдацын хэв маягийн дарлага — тухайн давхаргыг ЭНЭ харагдацад л
         өөр өнгө/зузаанаар зурна (жишээ нь давхцсан нэгж талбар). */
      if ('renderer' in l) {
        const ov = layerStyle?.[l.id];
        const fl = l as FeatureLayer;
        if (ov) {
          if (!(l.id in styleBackup.current))
            styleBackup.current[l.id] = fl.renderer as unknown;
          fl.renderer = simple(
            fill(ov.hue, ov.fill ?? 0.25, ov.width ?? 3),
          ) as unknown as FeatureLayer['renderer'];
        } else if (l.id in styleBackup.current) {
          fl.renderer = styleBackup.current[l.id] as FeatureLayer['renderer'];
          delete styleBackup.current[l.id];
        }
      }

      if (d && 'definitionExpression' in l) {
        // `layerWhere` заасан бол давхарга бүрийн өөрийн WHERE; эс бөгөөс бүсийн
        // нэгдсэн шүүлт (cross-filter дашбоард нь давхарга тус бүрээ шүүнэ).
        const own = layerWhere ? layerWhere[l.id] ?? null : undefined;
        const base = own !== undefined
          ? own
          : zone ? zoneWhere(d, zone) : null;
        const hlOn = is3D(dim) && hl.where && (!hlOnly || hlOnly.includes(l.id))
          ? hl.where
          : null;
        /* ⚠️ Давхаргын ТОГТМОЛ шүүлт (`LayerDef.where`) — бүсийн болон
           тодруулгын шүүлтээс ТУСДАА, ҮРГЭЛЖ хүчинтэй. IoT мэдрэгчид үүгээр
           10,000 давхардсан телеметрийн цэгээс ганц суурилуулалтын мөрийг л
           үлдээнэ; эс бөгөөс бүсээр шүүхэд энэ нөхцөл алдагдана. */
        const parts = [d.where ?? null, base, hlOn].filter(Boolean) as string[];
        (l as FeatureLayer).definitionExpression = (
          parts.length ? parts.map((p) => `(${p})`).join(' AND ') : null
        ) as unknown as string;

        /* ⚠️ ПУЛЬСИЙГ ЗААВАЛ ЭНД — `definitionExpression` тавигдсаны ДАРАА.
           Урьд нь дээр байсан тул пульс нь ХУУЧИН (эсвэл огт байхгүй) шүүлтээр
           асууж, газар чөлөөлөлтийн 2,119 талбарыг БҮГДИЙГ хуулж, зураг
           бүхэлдээ дүүрдэг байв.

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
    });
    // Дараагийн өөрчлөлтөд «шинээр ил болсон»-ыг зөв илрүүлэхийн тулд тэмдэглэнэ.
    prevVisRef.current = on;
  }, [visibleKey, dim, ready, zone, layerWhere, layerStyle, hl, hlOnly, uniform, ortho, pulseLayer]);

  /**
   * ТУНГАЛАГ — давхарга бүрийн `opacity`-г override-оор тавина. Override байхгүй
   * давхарга нь build-time анхдагчаа (эх webmap-ийн opacity эсвэл 1) хадгална.
   * ⚠️ `opacityKey` (JSON) нь тогтмол dep — эцэг объектын лавлагаа солигдоход
   *    дэмий ажиллуулахгүй.
   */
  const opacityKey = JSON.stringify(opacity ?? {});
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const over = opacity ?? {};
    map.layers.forEach((l) => {
      if (!('opacity' in l) || l.id === IMAGERY_ID || l.id === 'sketch') return;
      // ⚠️ Пульсэлж буй (fadingRef) давхаргыг АЛГАСАХГҮЙ — пульс нь эх давхаргын
      //    opacity-д хүрдэггүй тул алгасвал «Эх үүсвэр»-ийн гулсуур үхмэл болно.
      const def = defaultOpacityRef.current;
      // Анхдагчийг НЭГ УДАА тогтооно — override арилахад буцах цэг
      if (def[l.id] == null) def[l.id] = typeof l.opacity === 'number' ? l.opacity : 1;
      l.opacity = over[l.id] ?? def[l.id];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacityKey, visibleKey, ready, dim, uniform]);

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
    if (!on.has('mon:building')) { setProgError(false); return; }
    const layer = map.findLayerById('mon:building') as FeatureLayer | null;
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
        // ⚠️ КЭШГҮЙ үед ч саарал «мэдээлэлгүй» renderer-ыг ЗААВАЛ тавина — эс
        //    бөгөөс блокууд shapefile-ийн ХУУЧИРСАН GUITS_HV өнгөөр «баталгаатай»
        //    мэт үлддэг байв («хуучин тоо дэлгэцэд үлдэхгүй» зарчим).
        // ⚠️ `globalThis.Map` — энэ файлд `Map` нь ArcGIS-ийн Map-аар дарагдсан
        const empty: BlockProgressMap = new globalThis.Map();
        layer.renderer = buildingProgressRenderer(empty) as unknown as __esri.Renderer;
        setProgError(true); // «Гүйцэтгэл ачаалагдсангүй» тэмдэг ил гарна
      });
    return () => { alive = false; };
  }, [visibleKey, ready]);

  /** 3D/BIM загвар ачаалагдсан эсэх — CORS/сүлжээний асуудлыг ил хэлнэ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !is3D(dim)) { setMeshError(null); return; }
    // ⚠️ Меш нь харагдацаас хамаарна (`sceneList`) — үндсэн SCENE-ийг хатуу
    //    шалгавал «Иргэдэд хүрэх үр өгөөж» дээр байхгүй давхарга хайж, алдааны
    //    тэмдэг хэзээ ч гарахгүй болно.
    const ids = dim === 'bim'
      ? BIM.layers.map((b) => b.key)
      : sceneList.map((m) => `scene:${m.key}`);
    const layers = ids.map((id) => map.findLayerById(id)).filter((l): l is Layer => l != null);
    if (!layers.length) { setMeshError(null); return; }
    let alive = true;
    Promise.allSettled(layers.map((l) => l.load())).then((rs) => {
      if (!alive) return;
      const failed = rs.filter((r) => r.status === 'rejected').length;
      setMeshError(failed === 0 ? null : failed);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready, sceneKey]);

  return (
    <div className={`${s.wrap} ${fs ? s.fs : ''}`}>
      <div ref={el} className={s.view} />
      {!ready && !initError && <div className={s.loading}>{tr('Газрын зураг ачаалж байна…')}</div>}

      {/* `view.when` унасан — байнгын «ачаалж байна…»-гийн оронд алдааг ил хэлж,
          «Дахин оролдох»-оор view-г дахин үүсгүүлнэ */}
      {!ready && initError && (
        <div className={s.loading} role="alert">
          <div className={`${s.float} ${s.warn}`} style={{ position: 'static' }}>
            <b className={s.warnTitle}>{tr('Газрын зураг үүсгэж чадсангүй')}</b>
            <span>{tr('Сүлжээ эсвэл газрын зургийн үйлчилгээний алдаа гарлаа.')}</span>
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
          </div>
        </div>
      )}

      {meshError != null && dim === 'bim' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>{tr('Барилгын загвар ачаалагдсангүй (')}{meshError})</b>
          <span>
            <code>tiles.arcgis.com</code> {tr('дээрх BuildingSceneLayer-т хандаж чадсангүй. Үйлчилгээ нийтэд ил байгаа эсэхийг шалгана уу.')}
          </span>
        </div>
      )}

      {meshError != null && dim === '3d' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>{tr('3D бодит загвар ачаалагдсангүй (')}{meshError})</b>
          <span>
            <code>arcgis.ubhub.mn:6443</code> {tr('руу хандаж чадсангүй. Сервер ажиллаж байгаа эсэх, CORS-ын')} <b>allowedOrigins</b>{tr('-д энэ хаяг байгаа эсэхийг шалгана уу.')}
          </span>
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
      {tip && <MapTip x={tip.x} y={tip.y} id={tip.id} attrs={tip.attrs} prog={blockProg} />}

      {/* ⚠️ Газрын зураг дээрх «Тайлбар» хайрцгийг ХАССАН: давхаргын каталог
          багана нь симбол, тоо, хэмжээг аль хэдийн хажууд нь харуулж байгаа тул
          зураг дээр үгээр давтах нь зургийн талбайг л иддэг байв. */}
      {children}
    </div>
  );
});

/* ─────────────────── Товч мэдээллийн хайрцаг ─────────────────── */

/**
 * Хулганы доорх объектын ТОВЧ мэдээлэл.
 *
 * ⚠️ Талбарууд нь каталогийн тодорхойлолтоос гарна (`qty`, `facets`) — давхарга
 * бүрд гар аргаар бичихгүй. Хяналтын хоёр давхарга нь ерөнхий загварт багтахгүй
 * тул тэдгээрт л онцгой мөрүүд нэмнэ.
 *
 * ⚠️ Байрлалыг `transform`-оор шилжүүлж хүрээнээс гаргахгүй: `right`/`bottom`
 * тооцоолохын тулд хайрцгийн хэмжээг мэдэх шаардлагатай болох ба энэ нь рендер
 * бүрд `offsetWidth` уншиж, layout thrash үүсгэнэ.
 */
function MapTip({
  x, y, id, attrs, prog,
}: {
  x: number;
  y: number;
  id: string;
  attrs: Record<string, unknown>;
  prog: BlockProgressMap | null;
}) {
  const d = LAYER_BY_ID[id];
  if (!d) return null;

  const rows: { k: string; v: string }[] = [];

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
    rows.push({ k: tr('Айл'), v: num(Number(attrs[F.households] ?? 0)) });
    rows.push({ k: tr('Гүйцэтгэгч'), v: text(attrs[F.contractor]) });
  } else if (d.id === 'mon:survey') {
    const F = SURVEY.fields;
    rows.push({ k: tr('Огноо'), v: date(attrs[F.date] as string) });
    rows.push({ k: tr('Барилга'), v: text(attrs[F.building]) });
    rows.push({ k: tr('Гүйцэтгэл'), v: pct(Number(attrs[F.total] ?? 0), 0) });
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
      rows.push({ k: f.label, v: text(attrs[f.field]) });
    }
    const zoneId = text(attrs[d.zoneField ?? ZONE_FIELD], '').trim();
    if (zoneId && zoneId !== ZONE_NONE.trim()) rows.push({ k: tr('Бүс'), v: zoneId });
  }

  return (
    <div
      className={s.tip}
      style={{ left: x, top: y, '--tone': d.hue } as CSSProperties}
      aria-hidden
    >
      <div className={s.tipHead}>{d.title}</div>
      {rows.length > 0 && (
        <dl className={s.tipRows}>
          {rows.map((r) => (
            <div key={r.k}>
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
