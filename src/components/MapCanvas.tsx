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
import Point from '@arcgis/core/geometry/Point';
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
import Swipe from '@arcgis/core/widgets/Swipe';
import SceneModification from '@arcgis/core/layers/support/SceneModification';
import SceneModifications from '@arcgis/core/layers/support/SceneModifications';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Ground from '@arcgis/core/Ground';
import type Layer from '@arcgis/core/layers/Layer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  LAYERS, LAYER_BY_ID, layerUrl, oidOf, drawOrder, DASH_PATTERN, ALWAYS_ON_IDS, REFERENCE_IDS,
  HOME, IMAGERY, IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET, IRGED_BUILT, IRGED_BUILT_DEF,
  ORTHO_SWIPE, MESH_SWIPE, IRGED_BUILT_MAP_HUE, REACH_BUFFERS,
  SCENE, BIM, USAN_SAN, ELEVATION_URL, ZONE_LAYER, zoneWhere,
  ZONE_FIELD, ZONE_NONE, ZONE_TYPE_EMPTY_HUE, OID, BUILDING, PARCEL_LEFT, buildingKey,
  MAP_HUE_OVERRIDES, SOURCE_FS, BASE_MAP_IDS, TOGLOOM_TYPES, srcLineWidth,
  type LayerDef,
} from '@/lib/services';
import { SCENE3D_LAYERS } from '@/lib/scene3d';
import { plan2dStyleOf, loadPlan2dStyle, PLAN2D_ALIASED } from '@/lib/plan2d';
import { queryExtent, queryFeatures, type Aoi } from '@/lib/query';
import { getAuth } from '@/lib/draftRemote';
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
  /**
   * Давхаргын ЯГ ТЭР объект(ууд) руу ойртох — хайлтын үр дүнд шилжихэд.
   * `animate: false` — шууд үсэрнэ (нэг жагсаалтаар дараалан товшиход
   * анимаци нь хойшлол мэт мэдрэгддэг).
   */
  zoomToWhere: (layerId: string, where: string, opts?: { animate?: boolean }) => void;
  /**
   * Давхаргыг СЕРВЕРЭЭС ДАХИН УНШУУЛНА — атрибут гаднаас засагдсаны дараа.
   *
   * ⚠️ ЗААВАЛ ХЭРЭГТЭЙ: FeatureLayer нь татсан объектоо клиент дээрээ кэшлэдэг.
   * Порталын `applyEdits` нь SDK-аар биш ШУУД REST-ээр явдаг тул давхарга
   * өөрчлөлтийг мэдэхгүй — зассан нэгж талбар ХУУЧИН ӨНГӨӨРӨӨ үлдэнэ.
   * Хэрэглэгч «хадгалагдсангүй» гэж бодоод бүтэн хуудсаа refresh хийхээс өөр
   * аргагүй болно.
   */
  refreshLayer: (layerId: string) => void;
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
      /* ⚠️ 7 → 4.5 → 3px (2026-09-17). Кластер хасагдсан тул 1,675 цэг ойртоход
         зэрэг гарах бөгөөд том цэг нь бие биендээ наалдаж толбо болно.
         3px дээр цэгүүд нягт газар ч тус тусдаа тоологдоно; уншигдацыг
         гэрэлтүүлэг (`TOILET_EFFECT`) хангана. */
      size: 3,
      color: c(hex, 0.9),
      outline: { width: 0 },
    },
  }) as unknown as RendererProp;

/**
 * ⚠️ 2026-09-17: НҮХЭН ЖОРЛОНГИЙН КЛАСТЕР БҮРМӨСӨН ХАСАГДАВ (хэрэглэгчийн
 * шийдвэр). Бөмбөлгүүд нь хамрах хүрээний буферийн тойрог, тэдгээрийн
 * шошготой давхарлаж зураг холилдож байв. Одоо жорлон бүр ӨӨРИЙН цэгээрээ
 * зурагдана; холоос давхарга нь `minScale`-ээр өөрөө хаагдана.
 *
 * Кластерын бүтэн тодорхойлолт (`toiletCluster`, `TOILET_CLUSTER_SCALE`)
 * git түүхэнд үлдсэн — буцаах бол тэндээс.
 */

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
/**
 * ГЭР ХОРООЛЛЫН БАРИЛГА — гэрэлтэх эффект (2026-09-02).
 *
 * ⚠️ Тод өнгө ба зузаан хүрээ дангаараа хангалтгүй байв: ортофото нь
 *    нарийн бүтэцтэй тул нимгэн хүрээ түүн дээр «тасарч» алга болдог.
 *    Bloom нь хүрээг дэвсгэрээс ТАСАЛЖ, жижиг полигон ч нүдэнд шууд тусна
 *    (`TOILET_EFFECT`-ийн адил батлагдсан арга).
 * ⚠️ Жорлонгийнхоос СУЛ: тэр нь ганц цэг, энэ нь 6,627 полигон — ижил
 *    эрчимтэй бол бүх зураг гэрэлтэж, ортофото уншигдахаа болино.
 * ⚠️ ЗӨВХӨН 2D-д үйлчилнэ (SceneView `effect`-ийг үл тоомсорлоно).
 */
const BUILT_EFFECT = [
  /* ⚠️ 2026-09-17: гэрэлтэлтийг ~ГУРАВНЫ НЭГ болгов. Өмнө нь 6,627 полигон
     зэрэг гэрэлтэж, ойртох тусам зураг бүхэлдээ цайрч ортофото уншигдахаа
     больдог байв. Хамгийн хол зумд огт гэрэлтэхгүй — тэнд полигон нь ялгагдах
     ч шаардлагагүй (`minScale: 20,000`-аар аль хэдийн хаагдана). */
  { scale: 20_000, value: 'bloom(0, 0.3px, 0.3)' },
  { scale: 6_000, value: 'bloom(0.12, 0.35px, 0.25)' },
  { scale: 1_500, value: 'bloom(0.22, 0.4px, 0.2)' },
] as unknown as __esri.Effect;

const TOILET_EFFECT = [
  /* ⚠️ 2026-09-17: цэг 4.5px болж жижгэрсэн тул гэрэлтүүлгийг НЭМЭВ — жижиг
     цэг ортофотогийн эрээн дэвсгэр дээр өөрөө алга болдог; bloom нь түүнийг
     дэвсгэрээс таслаж, нягт хэсэгт ч тоологдохуйц үлдээнэ. */
  { scale: 20_000, value: 'bloom(0.3, 0.45px, 0.3)' },
  { scale: 8_000, value: 'bloom(0.5, 0.45px, 0.25)' },
  { scale: 2_500, value: 'bloom(0.8, 0.5px, 0.18)' },
  { scale: 1_000, value: 'bloom(1.2, 0.55px, 0.1)' },
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

/**
 * МАСШТАБТ УЯГДСАН ЦЭГ — зум ойртуулахад маркер ГАЗРЫН ХЭМЖЭЭГЭЭР томорно
 * (2026-09-11, хэрэглэгчийн хүсэлт: ХТП/РП «дээрх зургаар оруулсан хэмжээнд
 * масштаб тэгж»).
 *
 * ⚠️ Тогтмол 7px маркер нь зум 20-д (~0.3 м/px) 2 м-ийн ХТП хайрцгийг
 * дөнгөж хэдэн пикселээр тэмдэглэж, полигоны буланд УУСДАГ байв. Стоп нь
 * ~1.5 м-ийн бодит биетэд ойртуулан тохируулсан: зум 15 (18k) 7px ·
 * зум 18 (2.3k) 12px · зум 20 (560) 22px · зум 21 (280) 32px.
 *
 * ⚠️ `$view.scale` visual variable нь ЭНГИЙН маркерт найдвартай; picture
 * marker дээр ажиллаагүй тул `tgl` тусдаа watch ашигладаг (`toglRenderer`).
 * Энд simple-marker тул тэр зам хэрэггүй.
 */
const scaledDot = (hex: string, marker: NonNullable<LayerDef['marker']> = 'circle') => ({
  type: 'simple',
  symbol: {
    type: 'simple-marker',
    style: marker,
    color: c(hex, 0.95),
    /* ⚠️ Хүрээ нарийссан (1.4 → 0.8): цэг жижгэрсэн тул хуучин зузаан цагаан
       хүрээ дүрсийн талыг эзэлж, өнгө нь танигдахаа болих байв. */
    outline: { color: [255, 255, 255, 0.9], width: ow(0.8) },
  },
  visualVariables: [{
    type: 'size',
    valueExpression: '$view.scale',
    /* ⚠️ 2026-09-14: ХЭМЖЭЭ ~2.3 дахин БУУРАВ (хэрэглэгч: «хтп point-ийг жижиг
       болго»). Өмнөх 7–32px нь ойртоход ХТП-ийн полигоныг бүхэлд нь дардаг
       байв — цэг нь тэмдэглэгээ болох ёстой, барилгыг халхлах ёсгүй. Одоо
       ойртоход полигон харагдаж, цэг нь төв дээр нь жижиг тэмдэг болно.
       Масштабын уялдаа ХЭВЭЭР: холоос ялгагдах, ойртоход томрох. */
    stops: [
      { value: 18_000, size: 3.5 },
      { value: 2_300, size: 5.5 },
      { value: 560, size: 9 },
      { value: 280, size: 13 },
    ],
  }],
}) as unknown as RendererProp;

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
 * (`mon:building` талбай) нь ӨӨР ХҮНИЙ хэсэг бөгөөд тэнд
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


/**
 * ЭХ ҮЙЛЧИЛГЭЭНИЙ СИМБОЛ — ArcGIS-ийн зурагтай ЯГ ИЖИЛ (2026-09-14).
 *
 * ⚠️ Порталын хоёр «сайжруулалт» ЭНД ХЭРЭГЛЭГДЭХГҮЙ. (1) `ow()` буюу
 * `OUTLINE_SCALE` — бүх хүрээг 0.55 дахин нарийсгадаг тул эх 0.9pt хүрээ
 * 0.5pt болж, ArcGIS-ийнхээс хоёр дахин нимгэн гарна. (2) Шугамын доорх бараан
 * CIM ХҮРЭЭЛЭЛ (`line()`) — эх зурагт БАЙХГҮЙ бөгөөд нарийн шугамыг
 * бараантуулж өнгийг нь гуйвуулдаг.
 *
 * ⚠️ ШУГАМ нь энгийн `simple-line` тул SceneView-д Ч ЗӨВ зурагдана — CIM-ийн
 * олон `symbolLayers`-ыг 3D дэмждэггүй тул урьд нь 3D-д тусдаа сольдог байсан.
 * Одоо 2D ба 3D НЭГ Л симбол хэрэглэнэ: салангид зам, нөөцлөх ref хэрэггүй.
 *
 * ⚠️ ЦЭГИЙН хэмжээг эхээс АВАХГҮЙ: эх үйлчилгээнд ХТП/РП нь 1pt (бараг
 * үл үзэгдэх). Цэгийг `scaledDot` масштабаар зурна — хэрэглэгчийн тусгай
 * шаардлага (2026-09-11). Энд зөвхөн НӨӨЦ зам болж үлдэнэ.
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
            /* ⚠️ Хүрээнд ч ижил доод хязгаар: эх утга 0.6–0.7pt байдаг
               худаг, ДХТ-ийн контур ортофото дээр бүдгэрдэг. Зузаан нь
               эхийнхээ харьцаагаар (3pt хүрээ 3-аараа үлдэнэ). */
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
 *
 * ⚠️ Урьд нь бүх бүсийг ганц жигд өнгөөр зурж, зөвхөн улаан ангиллуудыг
 * онцолдог байв — `ZONE_TYPES`-д улаан утга байхгүй тул бодитоор бүх бүс жигд
 * улбар шар харагддаг байлаа. Одоо Ерөнхий төлөвлөгөөтэй ижлээр `paint.values`
 * (`ZONE_MAP_TYPES` = эх webmap-ийн өнгө) бүрээр зурна.
 */
/**
 * `paint.values`-ийн ТҮЛХҮҮРИЙГ талбарын төрөлд тааруулна (2026-09-15).
 *
 * ⚠️ JS объектын түлхүүр ҮРГЭЛЖ мөр байдаг. ArcGIS нь `uniqueValueInfos`-ийн
 * `value`-г талбарын утгатай ЧАНД (тэнцүү төрлөөр) жишдэг тул Integer
 * талбарт «1» гэсэн мөр өгвөл НЭГ Ч объект таарахгүй — бүгд
 * `defaultSymbol`-оор зурагдана. Цэвэр тоон түлхүүрийг тоо болгоно.
 */
const paintValue = (v: string): string | number => (
  /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
);

const zoneTypeRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint?.field ?? 'Angilal',
  defaultSymbol: symbolOf(d, ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint?.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint?.values ?? {}).map(([value, hue]) => ({
    /* ⚠️ Кодтой талбарт хүний нэр (`paint.labels`) — эс бөгөөс «1», «2» */
    value: paintValue(value),
    label: d.paint?.labels?.[value] ?? value,
    symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);

/**
 * `paint.values`-аар ангилал бүрийг өнгөөр ялгах unique-value renderer.
 * ⚠️ `uniform` горимд ч ажиллана — газар чөлөөлөлтийн зураг дээр `land:left`-ийг
 * `Tuluv` төлөвөөр (чөлөөлсөн/цэвэрлэсэн/үлдсэн) будахад хэрэгтэй.
 */
/**
 * ОРТОФОТО ХАРЬЦУУЛАЛТЫН ХАЖУУГИЙН ДАВХАРГУУД.
 *
 * Swipe нь ортофотогоос гадна ДУРЫН давхаргыг тал руу нь тасалж чадна. Хоёр
 * ортофото нь ӨӨР ХУГАЦААНЫ зураг тул тэдэн дээр тохирох сэдвийн давхаргыг
 * тавибал харьцуулалт нь «зураг ↔ зураг» биш «БАЙДАЛ ↔ БАЙДАЛ» болно:
 *   · ЗҮҮН (хуучин ортофото) — ОДООГИЙН байдал: гэр хорооллын барилга, нүхэн жорлон
 *   · БАРУУН (шинэ ортофото) — БАРИГДАЖ буй: 113 блокийн гүйцэтгэл
 *
 * ⚠️ Таслалт нь зөвхөн ЗУРАГЛАЛД нөлөөлнө; давхаргыг swipe асаахад ИЛ болгож,
 * унтраахад өмнөх төлөвт нь буцаана (`swipeShownRef`).
 */
const SWIPE_OLD_IDS = [IRGED_BUILT.id, IRGED_TOILET.id];
const SWIPE_NEW_IDS = ['mon:building'];

const paintRenderer = (d: LayerDef) => ({
  type: 'unique-value',
  field: d.paint!.field,
  defaultSymbol: symbolOf(d, ZONE_TYPE_EMPTY_HUE),
  defaultLabel: d.paint!.emptyLabel,
  uniqueValueInfos: Object.entries(d.paint!.values).map(([value, hue]) => ({
    /* ⚠️ Кодтой талбарт хүний нэр (`paint.labels`) — эс бөгөөс «1», «2» */
    value: paintValue(value),
    label: d.paint!.labels?.[value] ?? value,
    symbol: symbolOf(d, hue),
  })),
} as unknown as RendererProp);

/* ⚠️ Урьд нь энд `WEB_DYNAMIC` хэмээх ХОЁР webmap-ийн симболын ГАР СНАПШОТ
   байв (12 давхарга, single/multi палитр). Одоо загварыг эх webmap-аас БҮТНЭЭР
   `tools/webmap_style.mjs` үүсгэж `lib/webmapStyle.ts`-д хадгалдаг бөгөөд
   давхаргын renderer JSON `fromJSON`-оор шууд тавигддаг тул гар орчуулгын
   давхарга бүхэлдээ хасагдав — 78 давхарга webmap-тэй 100% ижил зурагдана. */

/**
 * Гүйцэтгэлийн өнгө (0–100%): ШАР → ногоон. Хоёр хэсэгт шугаман
 * интерполяци — блок бүрд тасралтгүй өнгө өгнө (unique-value симбол болгонд).
 *
 * ⚠️ УЛААН ХАСАГДСАН (2026-08-28, хэрэглэгчийн шийдвэр). Урьд нь 0% нь улаан
 * (`#dc2626`) байсан бөгөөд энэ нь ХОЁР асуудал үүсгэж байв:
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

async function extentOf(url: string, view: AnyView, where = '1=1', token?: string): Promise<Extent | null> {
  const wkid = view.spatialReference?.wkid ?? 102100;
  const box = await queryExtent(url, wkid, where, token);
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
 * Анхдагч суурь зураг — ХИЙМЭЛ ДАГУУЛ (2026-09-03, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Урьд нь `topo-vector` байв. Ортофото нь ЗӨВХӨН төслийн талбайг
 * хамардаг тул топо суурь дээр асаахад тэр талбай тод, гаднах нь зурсан
 * газрын зураг болж, хоёр өөр ертөнц залгаастай харагддаг байлаа. Хиймэл
 * дагуулын суурь дээр ортофото нь ИЖИЛ төрлийн зургийн НАРИЙВЧЛАЛТАЙ
 * хэсэг болж, зааг нь бараг мэдэгдэхгүй.
 *
 * ⚠️ Хэрэглэгч «Суурь зураг» товчны галерейгаас топо/гудамж руу буцаж
 * сонгож болно — энэ нь зөвхөн АНХДАГЧ.
 */
const baseMap = () => Basemap.fromId('satellite');

/* ─────────────────── Давхарга үүсгэх ─────────────────── */

export const IMAGERY_ID = 'imagery';

/** Дарж сонгогдохгүй давхаргууд (popup, hit-test, тайлбарт орохгүй) */
const PASSIVE = new Set<string>([
  'sketch',
  IMAGERY_ID,
  IRGED_ORTHO.id,
  // Нүхэн жорлон — зөвхөн байршил харуулна; дарахад атрибут гарах ЁСГҮЙ
  IRGED_TOILET.id,
  TOILET_PIN_ID,
  // Гэр хорооллын барилга — зөвхөн байршил/төрөл; атрибут ил гаргахгүй
  IRGED_BUILT.id,
  IRGED_ROAD.id,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...IRGED_SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
  // Харьцуулалтын шинэ меш — зөвхөн харах, дарж сонгогдохгүй
  MESH_SWIPE.id,
  // Лавлагааны хилүүд — дарж сонгогдохгүй, доорх объектыг халхлахгүй.
  ...REFERENCE_IDS,
]);

/**
 * ТОДРУУЛГАД (`featureEffect`) ОРОЛЦОХГҮЙ давхаргууд — `PASSIVE`-ЭЭС ТУСДАА.
 *
 * ⚠️ 2026-09-06: урьд нь тодруулгын гогцоо `PASSIVE`-ыг шалгадаг байсан тул
 * НЭГ жагсаалт ХОЁР өөр зүйлийг зохицуулж байв:
 *   · «дарахад атрибут гарахгүй» — нүхэн жорлон, гэр хорооллын барилгын
 *     САНААТАЙ шийдвэр (хувийн хашаанд холбогдох мэдээлэл ил гаргахгүй);
 *   · «шүүлтэд огт хариулахгүй» — эдгээрийн хувьд шаардлагагүй хязгаарлалт.
 * Улмаар «Иргэдэд хүрэх үр өгөөж»-ийн чартаас шүүхэд ЗУРАГ ХӨДӨЛДӨГГҮЙ байлаа.
 * Одоо тодруулга нь ЗӨВХӨН энэ жагсаалтыг мөрдөнө; дарж сонгох хориг
 * (`pickHit`, тайлбарын жагсаалт) `PASSIVE`-д ХЭВЭЭР үлдэнэ.
 *
 * ⚠️ Энд үлдсэн нь бүгд `featureEffect`-гүй ТӨРӨЛ (растр, вектор тайл, scene,
 * BIM) эсвэл лавлагааны хил — гогцооны `'featureEffect' in l` шалгалт тэднийг
 * ямар ч байсан алгасах ч, санаа зорилгыг ил үлдээв.
 */
const NO_HIGHLIGHT = new Set<string>([
  'sketch',
  IMAGERY_ID,
  IRGED_ORTHO.id,
  IRGED_ROAD.id,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...IRGED_SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
  MESH_SWIPE.id,
  ...REFERENCE_IDS,
]);

/**
 * 3D-д вектор давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 * ⚠️ Заавал: гадаргуу ~1350 м өндөрт байх бөгөөд `elevationInfo` өгөхгүй бол
 * давхарга 0 м-т үлдэж мешийн доор алга болно.
 */
const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

/**
 * 3D-д вектор давхаргыг МЕШИЙН ГАДАРГУУ дээр наана.
 *
 * ⚠️ `on-the-ground` нь ГАЗРЫН гадаргуу (terrain) дээр наадаг бөгөөд
 * фотограмметрийн меш нь түүний ДЭЭР 10–20 м зузаанаар суудаг тул бүх полигон
 * (бүс, зам, ногоон байгууламж…) мешийн ДОТОР булагдаж, 3D-д «давхарга
 * асаасан ч харагдахгүй» байв. `relative-to-scene` нь мешийн гадаргууг олж
 * түүн дээр байрлуулна.
 */
const ON_SCENE = { mode: 'relative-to-scene' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

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

  /* Ортофото — вектор давхаргын доор, ХИЙМЭЛ ДАГУУЛЫН суурь зургийн ДЭЭР.
     ⚠️ `visible: false` нь зөвхөн БАЙГУУЛАХ агшны утга: бодит харагдалтыг
     `ortho` төлөв удирддаг (доорх давхаргын эффект), тэр нь 2026-09-03-наас
     АСААЛТТАЙ эхэлнэ. Энд `true` бичвэл «Суурь зураг» товчны чагтаас өмнө
     эффект ажиллах агшинд анивчилт үүснэ. */
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

  /* Ортофото ХАРЬЦУУЛАЛТ (swipe) — ХУУЧИН ортофото, одоогийнхын ЯГ ДЭЭР.
     ⚠️ Дээр байх ёстой: swipe нь ЗӨВХӨН ҮҮНИЙГ тасалдаг (зүүн талд ил,
     баруун талд алга). Ингэснээр баруун тал нь ЖИРИЙН зураг хэвээр — бусад
     давхарга, суурь зураг, харагдацын логикт огт хүрэхгүй.
     Эхлээд УНТРААЛТТАЙ; каталогт ОРОХГҮЙ (`listMode: 'hide'`). */
  L.push(new MapImageLayer({
    id: ORTHO_SWIPE.id,
    title: ORTHO_SWIPE.title,
    url: ORTHO_SWIPE.url,
    visible: false,
    listMode: 'hide',
    legendEnabled: false,
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

  /**
   * ⚠️ 2026-09-17: ЗУРГАН ДЭЭР БҮДЭГ ӨНГӨ (хэрэглэгчийн шийдвэр).
   *
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
     6,627 полигон, `Type`-аар өнгө ялгана (Байшин · Гэр).

     ⚠️ `outFields: [Type]` — ЗӨВХӨН ангилал. `Confidence` талбар нь «Гэр»-т
     ~93, «Байшин»-д БҮГД 0 тул ил гарвал «энэ барилгын итгэл 0%» гэсэн ХУДАЛ
     уншлага өгнө. Хэрэгтэй ганц атрибутыг л татна.

     ⚠️ `minScale` — 1:20,000-аас хол зумд огт зурагдахгүй. 6,627 полигон нь
     хотын хэмжээнд ялгагдахгүй хүрэн толбо болж ортофотог далдалдаг; ойртоход
     л утга гарна. */
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
      /**
       * ⚠️ `paint.force` — ТУХАЙН давхаргын гараар бичсэн ангилал-өнгө нь
       * АВТОМАТААР татсан webmap снапшотоос ДАВАМГАЙЛНА (2026-09-15).
       *
       * `et:27` (Явган хүний зам) нь `plan2d` alias-аар `sb:3`-ийн загварыг
       * өмсдөг бөгөөд тэр нь гинжинд ТҮРҮҮЛЖ шалгагддаг тул `Code`-ын хоёр
       * өнгө (явган зам · цементэн талбай) огт хэрэглэгддэггүй байв.
       *
       * ⚠️ ГЛОБАЛААР СОЛИХГҮЙ: `et:24` (Барилга) ч `paint`-тай атлаа тэнд
       * webmap-ийн загвар ЗӨВ. Тиймээс давхарга бүр ИЛ сонгоно.
       */
      renderer: d.paint?.force
        ? paintRenderer(d)
        : p2
        ? (rendererJsonUtils.fromJSON(p2 as never) as unknown as RendererProp)
        : webRenderer
        ? (rendererJsonUtils.fromJSON(webRenderer as never) as unknown as RendererProp)
        /* ⚠️ ЭНЭ САЛАА ЗААВАЛ: `force`-гүй `paint` (жиш. `land:left` нь
           төлөвөөр, `zone` нь ангилалаар, `source:eh` нь төрлөөр) энд
           хэрэглэгдэнэ. Хасвал тэдгээр нь `simple()`-ийн ганц өнгөөр
           будагдаж, ангилал нь бүрмөсөн алга болно (2026-09-15-ны алдаа). */
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
   * уншиж бичнэ.
   *
   * ⚠️ Анхдагч: АСААЛТТАЙ (2026-09-03, хэрэглэгчийн хүсэлт) — суурь нь хиймэл
   * дагуул, түүн ДЭЭР төслийн ортофото. Хоёулаа зургийн давхарга тул зааг нь
   * мэдэгдэхгүй, харин төслийн талбай нарийвчлалаараа ялгарна.
   */
  const [ortho, setOrtho] = useState(true);

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
      if (NO_HIGHLIGHT.has(l.id) || !('featureEffect' in l)) return;
      const fl = l as FeatureLayer;
      // ⚠️ `visible` шалгахгүй: нуугдсан давхаргын эффектийг цэвэрлэх боломжтой
      //    байх ёстой, эс бөгөөс дахин асаахад хуучин шүүлт үлдэнэ.
      // ⚠️ `only` нь тухайн SQL-ийг АЛЬ давхаргад тавихыг заана; бусад нь
      //    эффектгүй үлдэхгүй — доорх `dimOther`-оор бүхэлдээ бүдгэрнэ.
      // ⚠️ `where` эсвэл орон зайн `geometry`-ийн аль нэг байхад л хэрэглэнэ.
      //    Хоёулаа зэрэг байвал featureEffect-ийн filter тэдгээрийг AND-оор
      //    хослуулна (эх дотор нь SQL + орон зайн шүүлт).
      const live = !is3d && !!(hl.where || hl.geometry);
      const target = !onlyList || onlyList.includes(l.id);
      const apply = live && target;
      /**
       * ⚠️ ШҮҮЛТЭД ОРООГҮЙ ДАВХАРГЫГ МӨН БҮДГЭРҮҮЛНЭ (2026-09-06).
       *
       * Урьд нь `only`-д ороогүй давхарга ЯМАР Ч эффектгүй үлддэг байсан тул
       * шүүлт тавихад зурган дээр сонгосон объект бүдгэрсэн хөршүүдийнхээ
       * дунд ялгарах ёстой атлаа, ӨӨР давхаргууд (нүхэн жорлонгийн 1,675 цэг,
       * нийгмийн барилгууд) БҮРЭН ТОД хэвээр үлдэж зургийг дүүргэдэг байв —
       * «Гэр» шүүхэд гэрээс бусад бүх зүйл хэвээр харагдана.
       *
       * ⚠️ `where: '1=0'` — НЭГ Ч объект таарахгүй тул давхаргын БҮХ объект
       * `excludedEffect`-д орно, өөрөөр хэлбэл давхарга бүхэлдээ бүдгэрнэ.
       * Ингэснээр `only`-ийн үндсэн зорилго (шүүлтийн талбаргүй давхаргад SQL
       * тавьж унагаахгүй) хэвээр хадгалагдана — эдгээрт SQL ОГТ явахгүй.
       *
       * ⚠️ Суурь/лавлагааны давхаргууд (ортофото, зам, хил, scene, BIM) нь
       * `NO_HIGHLIGHT`-д тул энэ гогцоонд огт ордоггүй — тэдгээр бүдгэрэхгүй.
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
      setHl({ where, only, geometry }),
    [],
  );

  /**
   * ⚠️ Нислэгийн token — `goTo` ба `zoomToWhere` ХОЁУЛАА энэ НЭГ тоолуурыг
   * хуваалцана. Хоёулаа `extentOf` (→ `query.ts`-ийн 6 слотын дараалал +
   * дахин оролдлого) хүлээдэг тул хариу ирэх дараалал баталгаагүй: шүүлт
   * хурдан солиход хоцорсон хүрээ сүүлд ирж зургийг өмнөх сонголт руу буцаадаг
   * байв (шүүлт цэвэрлэсэн атал объект дээр ойрсон хэвээр үлдэх). Тусдаа
   * тоолуур өгвөл `zoomToWhere` ↔ `zoomToLayer` хооронд солигдоход
   * хамгаалалт ажиллахгүй тул ЗААВАЛ нэгийг нь хуваалцана.
   * (Загвар: `zoneMaskToken`.)
   */
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
   *
   * ⚠️ Хамгийн бага хэмжээ тавина: нэг цэгэн объект (тайлангийн цэг) эсвэл жижиг
   * талбарын хүрээ нь бараг тэг өргөнтэй байдаг тул шууд `goTo` хийвэл газрын
   * зураг хамгийн ойрын масштаб руу үсэрч, хэрэглэгч хаана байгаагаа алдана.
   * Тиймээс `goTo`-г ашиглахгүй, хүрээг өөрөө тэлнэ.
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
      /* ⚠️ Нэвтрэлт шаардлагатай давхарга — токенгүй бол хүрээ ХООСОН ирж
         зураг огт хөдлөхгүй (`LayerDef.auth`). */
      const token = d.auth ? (await getAuth())?.token : undefined;
      const e = await extentOf(layerUrl(d), view, where, token);
      if (flyToken.current !== t) return;
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
      view.goTo(box, opts?.animate === false ? { animate: false } : undefined).catch(() => {});
    } catch (err) {
      console.error('[selbe] объектын хүрээг тодорхойлж чадсангүй:', err);
    }
  }, [view]);

  /**
   * ⚠️ 2D-д `refresh()` хангалттай; 3D-д мөн ижил (SceneView нь ижил
   * FeatureLayer-ийг хуваалцдаг). Давхарга олдоогүй бол ЧИМЭЭГҮЙ өнгөрнө —
   * тухайн давхарга унтраалттай байхад алдаа шидэх нь утгагүй.
   */
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
  bare = false,
  alwaysOn,
  onPick,
  sketch = false,
  onSketch,
  drawToken = 0,
  drawKind = 'polygon',
  reshapeGeometry,
  reshapeToken = 0,
  onReshape,
  sketchUndoToken = 0,
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
  /**
   * ХАРАГДАЦЫН ХЭВ МАЯГИЙН ДАРЛАГА — тухайн давхаргыг ЗӨВХӨН энэ харагдацад
   * өөр өнгө/зузаан/хэмжээгээр зурна.
   *
   * ⚠️ 2026-09-02: урьд нь дарлага нь ГЕОМЕТРЭЭС ҮЛ ХАМААРАН `fill` (талбайн)
   * симбол үүсгэдэг байв. Гурван дуудагч (Bagts · Gazar · PkgProg) бүгд
   * ПОЛИГОН давхаргад (`land:left`) хэрэглэдэг тул илэрдэггүй байсан ч,
   * шугам/цэгэн давхаргад өгмөгц симбол нь бүрмөсөн буруу төрөл болно. Одоо
   * `LayerDef.geom`-оор салгана.
   *
   * ⚠️ `hue` нь СОНГОЛТТОЙ болов — зөвхөн ХЭМЖЭЭ өөрчлөхөд давхаргын
   * өөрийн өнгө хэвээр үлдэнэ (`size` дангаараа өгөх боломж).
   */
  layerStyle?: Record<string, {
    hue?: string;
    fill?: number;
    width?: number;
    /** Цэгэн давхаргын диаметр (px) — `DOT_SCALE` ХЭРЭГЛЭГДЭХГҮЙ, шууд утга */
    size?: number;
  }>;
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
  /**
   * ХООСОН ЭХЛЭЛ — суурь 14 давхаргыг (`BASE_MAP_IDS`) сонголт хоосон үед
   * АВТОМАТААР асаахгүй.
   *
   * ⚠️ Анхдагч зан (`bare: false`) нь «каталог хоосон бол зураг план 2D шигээ
   * бүрэн» гэсэн дүрэм. «Эрсдэлийн загвар» нь ЭСРЭГ шаардлагатай (хэрэглэгчийн
   * хүсэлт): зөвхөн ортофото дээр аюулын муж, өртсөн объект хоёрыг цэвэрхэн
   * харах — суурь 14 давхарга тэдгээрийн өнгийг булингартуулна. Тиймээс энэ
   * тугтай үед суурь давхарга нь БУСАДТАЙ ижил дүрмээр (зөвхөн сонгосон бол)
   * харагдана.
   */
  bare?: boolean;
  /**
   * ЭНЭ ХАРАГДАЦАД ҮРГЭЛЖ АСААЛТТАЙ давхаргууд (2026-09-15).
   *
   * ⚠️ `ALWAYS_ON_IDS` (глобал хил) -ЭЭС ТУСДАА: тэр нь БҮХ зурагт
   * үйлчилдэг тул сэдэвчилсэн давхаргыг тэнд нэмбэл газар чөлөөлөлт,
   * багц, IoT зэрэг хамаагүй зурагт ч гарна («Ерөнхий төлөвлөгөө»-ний
   * явган хүний зам яг ингэж тархсан).
   */
  alwaysOn?: readonly string[];
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
  /** Утга нэмэгдэхэд полигон зурж эхэлнэ (гадны «Полигон зурах» товч) */
  drawToken?: number;
  /**
   * ЯМАР ГЕОМЕТР зурах — `drawToken` өсөх агшинд уншигдана.
   *
   * ⚠️ Анхдагч нь `'polygon'`: «Газар чөлөөлөлт», «Багц», «Гүйцэтгэл» гурав
   * зөвхөн шүүлтийн полигон зурдаг бөгөөд энэ пропыг өгдөггүй — тэдний зан
   * төлөв ӨӨРЧЛӨГДӨХГҮЙ байх ёстой.
   *
   * ⚠️ Утгыг ref-ээр уншина: `drawToken`-ы эффект нь `drawKind`-ыг deps-даа
   * авбал төрөл солих бүрд ХҮСЭЭГҮЙ зураалт эхэлнэ.
   *
   * ⚠️ `'rectangle'` (2026-09-16) — «Инженерийн дэд бүтэц»-ийн олон объект
   * сонгох хэрэгсэл. Гарах геометр нь ПОЛИГОН (`onSketch`-д яг полигон шиг
   * ирнэ); зөвхөн зурах хөдөлгөөн нь чирэх тэгш өнцөгт.
   */
  drawKind?: 'point' | 'polyline' | 'polygon' | 'rectangle';
  /**
   * БАЙГАА ОБЪЕКТЫН ГЕОМЕТРИЙГ VERTEX-ЭЭР ЗАСАХ — `reshapeToken` өсөх агшинд
   * энэ геометрийг зурах давхаргад буулгаж, `SketchViewModel.update()`-ыг
   * асаана (Esri-ийн «reshape» бариулууд гарч ирнэ).
   *
   * ⚠️ Геометр нь `toJSON()` хэлбэрийн ЭНГИЙН объект бөгөөд
   * `spatialReference`-ээ АГУУЛСАН байх ЁСТОЙ — эс бөгөөс SDK нь зургийн
   * проекц гэж таамаглаж, өөр газар буулгана.
   */
  reshapeGeometry?: unknown;
  reshapeToken?: number;
  /**
   * Vertex засварын үр дүн — чирэх бүрд дуудагдана.
   *
   * ⚠️ `onSketch`-ЭЭС ТУСДАА байх нь ЧУХАЛ: тэр нь ШИНЭ дүрс зурж дуусахад
   * дуудагддаг бөгөөд дуудагч талууд түүгээр «шинэ объект нэмэх» маягт
   * нээдэг. Хоёуланг нэг callback-т нийлүүлбэл байгаа объектын vertex
   * хөдөлгөх бүрд шинэ объектын маягт нээгдэнэ.
   *
   * ⚠️ Өгөөгүй бол `update` үйл явдал `onSketch` руу очно — «Газар
   * чөлөөлөлт», «Багц», «Гүйцэтгэл» гурав полигоноо чирж өөрчлөхөд шүүлт
   * дагаж шинэчлэгддэг зан төлөв нь ХЭВЭЭР үлдэнэ.
   */
  onReshape?: (geometry: __esri.Geometry | null) => void;
  /**
   * ЗУРААЛТЫН НЭГ АЛХАМ БУЦААХ — өсөх бүрд `SketchViewModel.undo()`.
   *
   * ⚠️ Энэ нь ЗӨВХӨН хадгалаагүй зураалтад үйлчилнэ (нэмсэн vertex, чирсэн
   * цэг). Үйлчилгээнд аль хэдийн бичигдсэн засварыг буцаахгүй — түүнийг
   * дуудагч тал өөрөө хийнэ (`butetsEdit.applyAttrs`/`saveGeometry`).
   */
  sketchUndoToken?: number;
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
  /* ⚠️ Зурах төрлийг REF-ээр — deps-д оруулбал төрөл солих бүрд зураалт эхэлнэ */
  const drawKindRef = useRef(drawKind);
  drawKindRef.current = drawKind;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const onSketchRef = useRef(onSketch);
  onSketchRef.current = onSketch;
  const onReshapeRef = useRef(onReshape);
  onReshapeRef.current = onReshape;
  const reshapeGeomRef = useRef(reshapeGeometry);
  reshapeGeomRef.current = reshapeGeometry;
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
    /* ⚠️ Цэгийн SVG дүрс ЗӨВХӨН цэгийн давхаргад (2026-09-17: `tgl` одоо ТАЛБАЙ,
       `type` талбаргүй — unique-value renderer талбайд тавибал юу ч зурагдахгүй). */
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
  /**
   * ЕРДИЙН (2D) давхаргын уналт — унасан давхаргын ГАРЧГУУД.
   *
   * ⚠️ 2026-09-02 аудит: 3D/BIM мешийн уналтыг `meshError` барьдаг байсан ч
   *    ЕРДИЙН FeatureLayer унавал ямар ч тэмдэг гардаггүй байв — зураг зүгээр
   *    л ХООСОН зурагдаж, хэрэглэгч «өгөгдөл алга» гэж эндүүрдэг. Сүлжээ
   *    тасрах, үйлчилгээ 499 буцаах нь энэ төсөлд БОДИТООР тохиолддог
   *    (`Selbe_guitsetgel_consolidated`, `Selbe_ET_20260721` хаалттай).
   */
  const [layerFail, setLayerFail] = useState<string[]>([]);
  /**
   * `view.when` унасан — «ачаалж байна…»-гийн оронд алдаа + «Дахин оролдох».
   *
   * ⚠️ 2026-09-04: ЭНЭ УРЬД `boolean` БАЙВ — барьсан алдааг зөвхөн
   *    `console.error`-т бичээд ХАЯДАГ тул БҮХ уналтыг «Сүлжээ эсвэл газрын
   *    зургийн үйлчилгээний алдаа» гэж БУРУУ оношилдог байлаа. Хэмжсэн: Chrome-ыг
   *    `--disable-gpu`-тай ажиллуулахад барьсан алдаа
   *    `name = 'webgl:major-performance-caveat-detected'` («Your WebGL
   *    implementation (ANGLE …) … GPU is in a blocklist») — тэр ажиллуулалтад
   *    сүлжээний уналт 0 байсан. Хуучин драйвертай албаны компьютер дээр байнга
   *    тохиолддог ба хэрэглэгч, IT нь сүлжээ/VPN/ArcGIS шалгаж цаг алддаг,
   *    «Дахин оролдох» товч ХЭЗЭЭ Ч тусалдаггүй.
   *    Тиймээс алдааны `name`/`message`-ийг ХАДГАЛЖ, зурагдалтад салаалуулна.
   *    `null` = уналт байхгүй — `if (initError)` шалгалт хэвээр ажиллана.
   */
  const [initError, setInitError] = useState<{ name?: string; message?: string } | null>(null);
  /** «Дахин оролдох» — утга нэмэгдэхэд view-г бүхэлд нь дахин үүсгэнэ */
  const [initToken, setInitToken] = useState(0);
  /** Хулганы доорх объектын товч мэдээлэл */
  const [tip, setTip] = useState<
    {
      x: number; y: number; id: string; attrs: Record<string, unknown>;
      /**
       * Давхаргын талбарын тодорхойлолт — ArcGIS-ийн popup шиг alias ба
       * домэйны ШОШГЫГ гаргахад (2026-09-16, хэрэглэгчийн хүсэлт).
       *
       * ⚠️ ЗУРГИЙН FeatureLayer-ЭЭС авна — нэмэлт REST хүсэлт ЯВУУЛАХГҮЙ.
       * `loadLayerMeta`-г дуудвал (а) сүлжээ хөндөнө, (б) `butetsEdit` модулийг
       * БҮХ харагдацын зургийн багцад чирнэ. Давхарга ачаалагдсаны дараа
       * `fields` нь аль хэдийн санах ойд бий.
       */
      fields: readonly __esri.Field[] | null;
    } | null
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
   * Ортофото харьцуулах (swipe) виджет — асаалттай үед л утгатай.
   * ⚠️ `useRef`: DOM callback-ууд closure тул төлвийг ref-ээр уншина; мөн
   * view устахад cleanup эндээс устгана (2D↔3D солиход ч үлдэхгүй).
   */
  const swipeRef = useRef<__esri.Swipe | null>(null);

  /**
   * Swipe асаахад ИЛ болгосон сэдвийн давхаргууд ба тэдний ӨМНӨХ төлөв —
   * унтраахад яг байснаар нь буцаана (каталогийн чагтыг эвдэхгүй).
   */
  const swipeShownRef = useRef<{ layer: __esri.Layer; was: boolean }[]>([]);

  /** 3D мешийн харьцуулалтыг унтраах функц (идэвхтэй үед л утгатай) */
  const mesh3dOffRef = useRef<(() => void) | null>(null);

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
  const alwaysOnKey = (alwaysOn ?? []).join(',');

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
    setInitError(null);

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

    /**
     * ОРТОФОТО ХАРЬЦУУЛАХ (swipe) — ХУУЧИН `Selbe_ortho` ↔ ОДООГИЙН
     * `selbe_ortho_merged`. Бариулыг чирэхэд хоёр хугацааны зураг солигдоно.
     *
     * ⚠️ ЗӨВХӨН 2D: `Swipe` виджет `MapView`-д л ажилладаг (SceneView-д
     * давхаргыг хавтгайд таслах боломжгүй).
     * ⚠️ Дизайн хөндөөгүй — бүтэн дэлгэцийн товчтой ЯГ ижил `esri-widget--button`
     * загвар, ижил булан. Идэвхтэй үед зөвхөн өнгө нь `--hue` болно.
     * ⚠️ Харьцуулалт нь каталогийн «Ортофото» чагтаас ХАМААРНА: одоогийн
     * ортофото унтраалттай бол харьцуулах юм үлдэхгүй тул асаагаад эхэлнэ.
     */
    if (!is3D(dim)) {
      const cmpLayer = map.findLayerById(ORTHO_SWIPE.id);
      const swBtn = document.createElement('div');
      swBtn.className = 'esri-widget--button esri-widget';
      swBtn.setAttribute('role', 'button');
      swBtn.setAttribute('tabindex', '0');
      swBtn.setAttribute('aria-pressed', 'false');
      swBtn.title = tr('Харьцуулах — зүүн: хуучин зураг + одоогийн барилга, баруун: шинэ зураг + баригдаж буй блок');
      /* Дундуур нь босоо шугам татсан хоёр хагас — swipe-ийн бариулын дүрс */
      swBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
        + '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" '
        + 'stroke="currentColor" stroke-width="1.5"/>'
        + '<path d="M8 1.6v12.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
        + '<path d="M5.1 8H2.9M4.1 6.9 2.9 8l1.2 1.1M10.9 8h2.2M11.9 6.9 13.1 8l-1.2 1.1" '
        + 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const markSwipe = (on: boolean) => {
        swBtn.style.color = on ? 'var(--hue, #0d9488)' : '';
        swBtn.setAttribute('aria-pressed', String(on));
      };
      const toggleSwipe = () => {
        if (swipeRef.current) {
          swipeRef.current.destroy();
          swipeRef.current = null;
          if (cmpLayer) cmpLayer.visible = false;
          /* Сэдвийн давхаргуудыг swipe-аас ӨМНӨХ төлөвт нь буцаана */
          for (const { layer, was } of swipeShownRef.current) layer.visible = was;
          swipeShownRef.current = [];
          markSwipe(false);
          return;
        }
        if (!cmpLayer) return;
        /**
         * ⚠️ ЗӨВХӨН `leadingLayers` — `trailingLayers` ХООСОН.
         *
         * Урьд нь одоогийн ортофотог `trailingLayers`-т өгч байсан нь «Иргэдэд
         * хүрэх үр өгөөж» мэтийн ӨӨРИЙН суурь зурагтай харагдацад бүх зургийг
         * хоослож байв. Одоо баруун тал нь ЖИРИЙН зураг (юу ч таслагдахгүй),
         * зүүн талд нь хуучин ортофото дээрээс нь наалдана — харьцуулалт ижил,
         * гэхдээ бусад давхарга, харагдацын логикт огт хүрэхгүй.
         */
        cmpLayer.visible = true;
        /**
         * ⚠️ Харагдацын ӨӨРИЙН хуучин ортофотог (`irged:ortho` — ЯГ ИЖИЛ
         * `Selbe_ortho` үйлчилгээ) мөн ЗҮҮН тийш таслана.
         *
         * Эс бөгөөс «Иргэдэд хүрэх үр өгөөж»-д тэр нь харьцуулах давхаргын
         * ДЭЭР байрлаж, БАРУУН талд ч хуучин зураг гарах тул хоёр тал ЯГ ИЖИЛ
         * харагддаг байв («ортофото өөрчлөгдөхгүй байна»). Таслалт нь зөвхөн
         * ЗУРАГЛАЛД нөлөөлнө — давхаргын `visible` хөндөгдөхгүй тул тэр
         * харагдацын логик хэвээр, swipe унтраахад бүрэн сэргэнэ.
         */
        const leading = [cmpLayer];
        const viewOrtho = map.findLayerById(IRGED_ORTHO.id);
        if (viewOrtho) leading.push(viewOrtho);

        /* Сэдвийн давхаргууд — асаагаад өмнөх төлөвийг нь тэмдэглэнэ */
        const trailing: __esri.Layer[] = [];
        swipeShownRef.current = [];
        const side = (ids: string[], into: __esri.Layer[]) => {
          for (const id of ids) {
            const l = map.findLayerById(id);
            if (!l) continue;
            swipeShownRef.current.push({ layer: l, was: l.visible });
            l.visible = true;
            into.push(l);
          }
        };
        side(SWIPE_OLD_IDS, leading);
        side(SWIPE_NEW_IDS, trailing);

        swipeRef.current = new Swipe({
          view: view as __esri.MapView,
          leadingLayers: leading,
          trailingLayers: trailing,
          direction: 'horizontal',
          position: 50,
        });
        view.ui.add(swipeRef.current);
        markSwipe(true);
      };
      swBtn.addEventListener('click', toggleSwipe);
      swBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSwipe(); }
      });
      view.ui.add(swBtn, 'top-right');
    }

    /**
     * 3D МЕШ ХАРЬЦУУЛАХ — ХУУЧИН (Сэлбэ 1, 2) ↔ ШИНЭ (`Selbe_mesh_0917`).
     *
     * ⚠️ `Swipe` виджет нь SceneView-д ОГТ ажилладаггүй (зөвхөн MapView). Тиймээс
     * мешийг ТАЛБАЙГААР нь клип хийнэ: дэлгэцийн босоо шугамыг газарт буулгаж,
     * зүүн талын олон өнцөгтөөр шинэ мешийг, баруун талынхаар хуучныг үлдээнэ.
     *
     * ⚠️ Клипийн олон өнцөгтийг ДЭЛГЭЦЭЭС буулгана (`toMap` 12 цэгээр) — хазайсан
     * (tilt) камерт ч шугам яг босоо харагдана. Хавтгай тэгш өнцөгт ашиглавал
     * хазайлттай үед газрын шугам налуу болж, бариулаас салдаг.
     *
     * ⚠️ Камер хөдлөхөд олон өнцөгт хуучирна — `stationary` болмогц дахин бодно.
     */
    if (dim === '3d') {
      const sv = view as __esri.SceneView;
      const swBtn3 = document.createElement('div');
      swBtn3.className = 'esri-widget--button esri-widget';
      swBtn3.setAttribute('role', 'button');
      swBtn3.setAttribute('tabindex', '0');
      swBtn3.setAttribute('aria-pressed', 'false');
      swBtn3.title = tr('Меш харьцуулах — зүүн: шинэ, баруун: хуучин');
      swBtn3.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
        + '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" '
        + 'stroke="currentColor" stroke-width="1.5"/>'
        + '<path d="M8 1.6v12.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
        + '<path d="M5.1 8H2.9M4.1 6.9 2.9 8l1.2 1.1M10.9 8h2.2M11.9 6.9 13.1 8l-1.2 1.1" '
        + 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      view.ui.add(swBtn3, 'top-right');

      /** Хүрээнээс хол давах зай (м) — олон өнцөгт харагдах талбайг бүрэн хаана */
      const FAR = 40000;
      /** Дэлгэцийн байрлал 0..1 */
      let frac = 0.5;

      /** Дэлгэцийн `divX` босоо шугамыг газарт буулгаж, хоёр талын цагирагийг өгнө */
      const ringsAt = (divX: number) => {
        const h = sv.height || 0;
        if (!h) return null;
        const pts: number[][] = [];
        /* ⚠️ 6 цэг ХАНГАЛТТАЙ: `toMap` нь 3D-д мешийн эсрэг туяа шиддэг тул
           үнэтэй. 12 цэг дээр чирэлт мэдэгдэхүйц гацдаг байв. */
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
        new SceneModifications([
          new SceneModification({
            geometry: new Polygon({ rings: [ring], spatialReference: sr }),
            // ⚠️ `clip` — олон өнцөгтийн ДОТОРХ хэсгийг л үлдээнэ
            type: 'clip',
          }),
        ]);

      type MeshLayer = __esri.IntegratedMeshLayer;
      const oldMeshes = () => map.layers.toArray()
        .filter((l) => String(l.id).startsWith('scene:')) as MeshLayer[];
      const newMesh = () => map.findLayerById(MESH_SWIPE.id) as MeshLayer | null;

      /**
       * ⚠️ ЧИРЭХ ҮЕД МЕШИЙГ КАДР БҮРТ КЛИП ХИЙХГҮЙ.
       *
       * `modifications` онооход IntegratedMesh бүхэлдээ дахин клиплэгддэг —
       * гурван давхарга × кадр бүр гэдэг нь чирэлтийг гацаана. Одоо чирэх үед
       * ЗӨВХӨН цагаан шугам хөдөлж (DOM, үнэгүй), клип нь 140мс-ийн завсартай
       * болон гараа авах агшинд л шинэчлэгдэнэ.
       */
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastFrac = -1;
      const applyClip = () => {
        const nm = newMesh();
        if (!nm) return;
        // Өмнөхөөсөө бараг хөдлөөгүй бол дэмий клип хийхгүй
        if (Math.abs(frac - lastFrac) < 0.004) return;
        const r = ringsAt(Math.round((sv.width || 0) * frac));
        if (!r) return;
        lastFrac = frac;
        nm.modifications = clipTo(r.left, r.sr);
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

      const stopMesh = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        camWatch?.remove();
        camWatch = null;
        divider?.remove();
        divider = null;
        for (const l of oldMeshes()) l.modifications = null;
        const nm = newMesh();
        if (nm) { map.remove(nm); nm.destroy(); }
        swBtn3.style.color = '';
        swBtn3.setAttribute('aria-pressed', 'false');
        mesh3dOffRef.current = null;
      };

      const startMesh = () => {
        // Шинэ меш — ортофотогийн дараа, хуучин мешүүдтэй нэг түвшинд
        map.add(new IntegratedMeshLayer({
          id: MESH_SWIPE.id,
          url: MESH_SWIPE.url,
          title: MESH_SWIPE.title,
          visible: true,
        }), 1);

        divider = document.createElement('div');
        divider.style.cssText =
          'position:absolute;top:0;bottom:0;width:3px;margin-left:-1.5px;z-index:2;'
          + 'background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:ew-resize;'
          + `left:${frac * 100}%`;
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
          if (divider) divider.style.left = `${frac * 100}%`;
          applySoon();
        };
        const onUp = (e: PointerEvent) => {
          divider?.releasePointerCapture?.(e.pointerId);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          applyNow(); // гараа авмагц эцсийн байрлалаар яг таарна
        };
        divider.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          divider?.setPointerCapture?.(e.pointerId);
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        /* Камер хөдлөхөд олон өнцөгт хуучирна — зогсмогц дахин бодно */
        camWatch = reactiveUtils.watch(() => sv.stationary, (st) => { if (st) applyNow(); });
        /* Меш ачаалагдсаны дараа л клип суудаг тул давхарга бэлэн болоход дахин */
        newMesh()?.when?.(() => applyNow()).catch(() => {});
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
      // ⚠️ 2026-09-04: `true`-гийн оронд алдааны ӨӨРИЙГ нь хадгална — ArcGIS-ийн
      //    `name` («webgl:major-performance-caveat-detected» гэх мэт) бол уналтын
      //    ЦОРЫН ГАНЦ ялгах шинж. Үүнийг хаявал WebGL-ийн уналт сүлжээний уналт
      //    мэт харагдана. `e` нь Error биш ч байж болох тул name/message-ийг
      //    хамгаалалттай гаргаж авна (ямар ч тохиолдолд объект хадгална —
      //    объект нь `if (initError)`-т үргэлж үнэн).
      if (!view.destroyed) {
        const er = e as { name?: unknown; message?: unknown } | null;
        setInitError({
          name: typeof er?.name === 'string' ? er.name : undefined,
          message: typeof er?.message === 'string' ? er.message : undefined,
        });
      }
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
        return {
          attrs: x.graphic.attributes as Record<string, unknown>,
          id,
          /* ⚠️ Талбарын тодорхойлолт — tooltip-ийн alias/домэйнд (`tip.fields`) */
          fields: (lyr as FeatureLayer).fields ?? null,
        };
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
      /* ⚠️ Нэвтрэлт шаардлагатай давхарга байвал токеныг НЭГ удаа авна */
      const authTok = cand.some(({ id }) => LAYER_BY_ID[id]?.auth)
        ? (await getAuth())?.token
        : undefined;
      const BATCH = 3;
      for (let i = 0; i < cand.length; i += BATCH) {
        const batch = cand.slice(i, i + BATCH);
        const rows = await Promise.all(batch.map(({ l, id }) =>
          queryFeatures(layerUrl(LAYER_BY_ID[id]), {
            aoi,
            limit: 1,
            where: (l as __esri.FeatureLayer).definitionExpression || '1=1',
            ...(LAYER_BY_ID[id]?.auth && authTok ? { token: authTok } : {}),
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
          if (hit) { pickRef.current?.(hit.attrs, hit.id); return; }
          if (view.destroyed || !e.mapPoint) { pickRef.current?.(null, null); return; }
          // ≈6 пикселийн хүлцэл — нимгэн шугам, жижиг цэгийг барихад хангалттай
          const tol = Math.max(2, (view.resolution || 1) * 6);
          const q = await pickByQuery(e.mapPoint, tol);
          if (!view.destroyed && seq === clickSeq) pickRef.current?.(q?.attrs ?? null, q?.id ?? null);
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
          setTip(hit
            ? { x: e.x, y: e.y, id: hit.id, attrs: hit.attrs, fields: hit.fields }
            : null);
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
      /* Ортофото харьцуулалт — view-тэй хамт дуусна (2D↔3D солиход ч).
         ⚠️ Давхаргыг мөн НУУНА: Map нь кэшлэгддэг тул ил үлдвэл 3D-д хуучин
         ортофото газарт наалдаж, мешийн дээр гарч ирнэ. */
      swipeRef.current?.destroy();
      swipeRef.current = null;
      const cmpOff = map.findLayerById(ORTHO_SWIPE.id);
      if (cmpOff) cmpOff.visible = false;
      /* Swipe-ийн үед асаасан сэдвийн давхаргууд — Map кэшлэгддэг тул
         view устахад ч өмнөх төлөвт нь буцаана */
      for (const { layer, was } of swipeShownRef.current) layer.visible = was;
      swipeShownRef.current = [];
      mesh3dOffRef.current?.();
      mesh3dOffRef.current = null;
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
   * НЭВТРЭЛТ ШААРДЛАГАТАЙ ДАВХАРГАД ТОКЕН (2026-09-15, `LayerDef.auth`).
   *
   * ⚠️ `buildLayers` СИНХРОН, токен АСИНХРОН тул давхарга үүссэний дараа
   * `customParameters`-ээр залгаж `refresh()` хийнэ. SDK нь `customParameters`-ийг
   * асуулга БҮРД уншдаг тул дараагийн татах бүр токентой явна.
   *
   * ⚠️ `IdentityManager`-т найдаж болохгүй: үйлчилгээ нийтэд нээлттэй ч
   * асуулгыг нэргүй хэрэглэгчид хаасан тул нэвтрэлтийн шаардлага БИШ, хоосон
   * хариу ирдэг — SDK токен залгах шалтгаан олохгүй.
   *
   * ⚠️ Нэвтрээгүй бол юу ч хийхгүй — давхарга хоосон үлдэнэ (хуудас өөрөө
   * «зөвхөн нэвтэрсэн хэрэглэгч харна» гэж ил хэлдэг).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const ids = LAYERS.filter((d) => d.auth).map((d) => d.id);
    if (!ids.length) return;
    let alive = true;
    void getAuth().then((a) => {
      if (!alive || !a) return;
      for (const id of ids) {
        const fl = map.findLayerById(id) as FeatureLayer | null;
        if (!fl || !('customParameters' in fl)) continue;
        if (fl.customParameters?.token === a.token) continue;
        fl.customParameters = { ...(fl.customParameters ?? {}), token: a.token };
        fl.refresh();
      }
    });
    return () => { alive = false; };
  }, [ready]);

  /**
   * ИНЖЕНЕРИЙН ДЭД БҮТЭЦ — 3D-д ч ЯГ 2D ШИГ, ГАЗАР ДЭЭРЭЭ (2026-09-11).
   *
   * ⚠️ `relative-to-scene`-ийг ТУРШААД ХАЯСАН — БУЦААЖ БҮҮ ТАВЬ. Тэр горимд
   * шугамын зангилаа бүр Z=0-ээс мешийн дээд гадарга хүртэл БОСОО ТУЛГУУР
   * болж зурагдан, зураг бүхэлдээ хар баганаар дүүрсэн (хэрэглэгчийн скриншот:
   * «ингэж дээшээ босгомооргүй»). Учир нь SceneView нь өндрийн горимыг
   * ЗАНГИЛААНД тооцдог тул хөрш зангилаа өөр өндөрт очиж хооронд нь босоо
   * сегмент үүсдэг.
   *
   * Одоо бүх геометр `on-the-ground` — 2D-тэй ижил. Мешийн барилга шугамын
   * ДЭЭГҮҮР давхарлах нь хүлээн зөвшөөрөгдсөн: шугам газарт байдаг, барилга
   * нь түүн дээр зогсож байгаа нь ЗӨВ дүрслэл. Энэ effect нь IoT-ийн
   * өргөлтөөс (`iot:*`, дээр) ТУСДАА үлдэнэ — тэнд өргөлт зөв.
   *
   * ⚠️ 2026-09-14: ШУГАМЫГ 3D-д СОЛИХ ЗАМ ХАСАГДСАН. Эх үйлчилгээний симбол
   * (`srcSym`) нь аль хэдийн энгийн `simple-line` тул SceneView зөв
   * зурна — урьд нь 2D-д CIM (олон давхаргат) байсан учир 3D-д хар гардаг
   * байсан. Хамт `line3dBackup` нөөц ч хэрэггүй болов: 2D ↔ 3D шилжихэд
   * renderer ОГТ өөрчлөгдөхгүй.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const d of LAYERS) {
      if (!d.id.startsWith('infra:')) continue;
      const l = map.findLayerById(d.id) as __esri.FeatureLayer | undefined;
      if (!l) continue;
      l.elevationInfo = ON_GROUND;
      /**
       * ⚠️ ЦЭГ (ХТП/РП) — масштабт уягдсан хэмжээ, 2D ба 3D-д ИЖИЛ. Эх
       * үйлчилгээний 1pt маркерыг ЗОРИУДААР ДАГААГҮЙ: тэр нь зурган дээр
       * бараг үл үзэгдэх бөгөөд хэрэглэгч ойртоход томордог байхыг шаардсан
       * (2026-09-11). Хэлбэр (квадрат) ба өнгө нь эхийнхээрээ.
       */
      if (d.geom === 'point') {
        l.renderer = scaledDot(d.hue, d.marker ?? 'circle') as unknown as FeatureLayer['renderer'];
      }
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
  /**
   * ⚠️ 2026-09-06: ШҮҮЛТ ИДЭВХТЭЙ ҮЕД КЛАСТЕР УНТАРНА. Кластер нь цэгүүдийг
   * СЕРВЕРТ БИШ, харагдацад нэгтгэдэг бөгөөд нэгтгэлийн тоо `featureEffect`-ийн
   * шүүлтийг тооцдоггүй: «Бохирдол: Маш их» гэж шүүхэд бүлгийн бөмбөлөг дээр
   * 1,675-ын тоо хэвээр үлдэж, бүдгэрсэн эсэх нь ялгагдахгүй байв. Кластергүй
   * үед цэг бүр өөрөө бүдгэрэх тул шүүлт үнэн харагдана.
   *
   * ⚠️ ЯМАР Ч шүүлт идэвхтэй бол унтраана — жорлон нь шүүлтийн ЗОРИЛТ мөн
   * эсэхийг ялгахгүй. Учир нь өөр давхарга шүүсэн ч (жиш. «Гэр») жорлонгийн
   * давхарга `dimOther`-оор бүдгэрэх ёстой бөгөөд кластерын бөмбөлөг тэр
   * бүдгэрэлтийг мөн адил үл тоомсорлодог — 1,675 улбар шар бөмбөлөг бүрэн тод
   * үлдэж, «шүүсэн давхарга л харагдах» гэсэн хүлээлтийг эвддэг байв.
   */
  const toiletFiltered = !!(hl.where || hl.geometry);
  useEffect(() => {
    const view = viewRef.current;
    const map = mapRef.current;
    if (!view || !map || !ready || !toiletOn || view.type !== '2d') return;
    const layer = map.findLayerById(IRGED_TOILET.id) as FeatureLayer | null;
    if (!layer) return;

    /**
     * ⚠️ 2026-09-17: КЛАСТЕР БҮРМӨСӨН УНТРААВ (хэрэглэгчийн шийдвэр).
     *
     * Бөмбөлгүүд нь хамрах хүрээний буферийн тойрог, тэдгээрийн шошготой
     * давхарлаж зураг холилдож байв. Одоо жорлон бүр ӨӨРИЙН цэгээрээ
     * зурагдана — `minScale`-ийн улмаас холоос давхарга нь өөрөө хаагдах тул
     * 1,675 цэг нэг дор гарах эрсдэлгүй.
     *
     * ⚠️ `toiletCluster` тодорхойлолтыг УСТГААГҮЙ — буцаах бол энэ мөрийг
     * сэргээхэд хангалттай.
     */
    layer.featureReduction = null;
    return () => { layer.featureReduction = null; };
  }, [dim, ready, toiletOn, toiletFiltered]);

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
    /* ⚠️ `min(…, 92vw)` (2026-09-16): тогтмол px нь 390px өргөнтэй утсанд газрын
       зургийн ~61%-ийг халхалдаг байв. Виджет нь ArcGIS-ийн overlay тул CSS
       media query-гээр гаднаас засах боломжгүй — өргөнийг ЭНД хязгаарлана. */
    const panel = mk('div', 'width:min(238px, 92vw);padding:15px;display:flex;flex-direction:column;gap:12px;'
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

    /* ⚠️ `min(…, 92vw)` — дээрх «Шинжилгээ» панелийн ижил шалтгаан. */
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
    /* ⚠️ `min(…, 92vw)` — дээрх «Шинжилгээ» панелийн ижил шалтгаан. */
    const panelS = mk('div', 'width:min(262px, 92vw);padding:15px;display:flex;flex-direction:column;gap:11px;'
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
      /**
       * ⚠️ ШУГАМ ба ЦЭГИЙН симбол нь полигонтой ИЖИЛ улбар шар гэр бүлээс —
       * «энэ бол миний зурж буй зүйл, давхаргын өгөгдөл БИШ» гэдэг нь өнгөөр
       * шууд уншигдана. Дэд бүтцийн шугамууд улаан/цэнхэр/ягаан тул мөргөлдөхгүй.
       */
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
      if (!g) return;
      /**
       * ⚠️ `state === 'start'` БА цуцлагдсаныг АЛГАСНА (2026-09-03 засвар).
       *
       * `SketchViewModel` нь `update` үйл явдлыг ГУРВАН төлөвт гаргадаг:
       * `start` (засвар эхлэв) · `active` (чирж байна) · `complete`
       * (дуусав, цуцлагдсан бол `aborted: true`). Урьд нь гурвуулангийн
       * геометрийг ялгалгүй дамжуулдаг байсан тул:
       *
       *   · `start` — объект дарангуут ХӨДӨЛГӨӨГҮЙ геометр «засвар» болж
       *     бүртгэгдэж, «Хэлбэр хадгалах» товч чирэхээс ӨМНӨ идэвхжинэ.
       *     Дарвал ижил геометр буцаж бичигдэж `editDate` хуурамчаар
       *     шинэчлэгдэнэ (`DedButets` §commitReshape-ийн хориглосон бичилт).
       *   · `aborted` — «Болих» дарахад `svm.cancel()` нь `complete`+
       *     `aborted` гаргадаг тул ЦУЦАЛСАН засвар дахин бүртгэгдэж,
       *     «Хадгалаагүй өөрчлөлт байна» гэж ХУДАЛ асуудаг байв.
       *
       * ⚠️ `emit` (полигон зурах хуучин зам) мөн адил шүүгдэнэ — «Газар
       * чөлөөлөлт» нь AOI-гаа чирж дуусахад л шинэчлэх ёстой.
       */
      const st = (e as unknown as { state?: string; aborted?: boolean });
      if (st.state === 'start' || st.aborted) return;
      /* ⚠️ `onReshape` өгөгдсөн бол ЗӨВХӨН тийш — дээрх пропын тайлбарыг үз */
      if (onReshapeRef.current) onReshapeRef.current(g);
      else emit(g);
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
    svm.create(drawKindRef.current);
  }, [drawToken]);

  /**
   * БАЙГАА ОБЪЕКТЫГ VERTEX-ЭЭР ЗАСАХ — `reshapeToken` өсөхөд эхэлнэ.
   *
   * ⚠️ Геометрийг `Graphic`-т буулгахдаа СИМБОЛ өгөх ЁСТОЙ: симболгүй график
   * нь `GraphicsLayer`-т үл үзэгдэх бөгөөд `update()` нь бариулуудыг гаргах ч
   * хэрэглэгч юуг чирч байгаагаа ХАРАХГҮЙ.
   *
   * ⚠️ `svm.update`-ыг `tool: 'reshape'` -ГҮЙ дуудна: анхдагч («transform»)
   * горим нь БҮХ vertex-ийг бариултай харуулж, дан хөдөлгөх, шинээр нэмэх
   * хоёуланг нь зөвшөөрдөг. `reshape` нь цэгэн геометрт огт ажиллахгүй.
   */
  useEffect(() => {
    if (!reshapeToken) return;
    const svm = sketchVMRef.current;
    const map = mapRef.current;
    const g = reshapeGeomRef.current as { [k: string]: unknown } | undefined;
    if (!svm || !map || !g) return;
    const gl = map.findLayerById('sketch') as GraphicsLayer | null;
    if (!gl) return;
    try { svm.cancel(); } catch { /* идэвхтэй зураалт байхгүй */ }
    gl.removeAll();
    /* Геометрийн төрлийг талбараас нь таана — `toJSON()` нь `type` бичдэггүй */
    const kind = 'paths' in g ? 'polyline' : 'rings' in g ? 'polygon' : 'point';
    const graphic = new Graphic({
      geometry: { ...g, type: kind } as unknown as __esri.Geometry,
      /* ⚠️ `as never` — `Graphic`-ийн конструктор нь симбол ПРОПЕРТИЙН нэгдэл
         хүлээдэг ба SketchViewModel-ийн буцаадаг бэлэн `Symbol` инстанс тэр
         нэгдэлд орохгүй. Ажиллагаанд зөв (SDK инстансыг шууд авдаг). */
      symbol: (kind === 'polyline'
        ? svm.polylineSymbol
        : kind === 'polygon'
          ? svm.polygonSymbol
          : svm.pointSymbol) as never,
    });
    gl.add(graphic);
    try { svm.update([graphic]); } catch { /* геометр танигдсангүй */ }
  }, [reshapeToken]);

  /** Гадны «Алхам буцаах» товч — зураалтын сүүлийн үйлдлийг цуцална */
  useEffect(() => {
    if (!sketchUndoToken) return;
    /* ⚠️ `svm.canUndo` нь идэвхтэй үйлдэл байхгүй үед `undo()`-г шидүүлдэг */
    try { sketchVMRef.current?.undo(); } catch { /* буцаах алхам алга */ }
  }, [sketchUndoToken]);

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
            /* ⚠️ Энэ зам нь ПОЛИГОНЫХ (`poly.rings` уншсан) тул `fill` зөв —
               дарлагад `hue` байхгүй бол дээр бодогдсон өнгийг хэрэглэнэ. */
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


  /**
   * ХАМРАХ ХҮРЭЭНИЙ БУФЕР — нийгмийн байгууламжийн эргэн тойрны нормативын
   * радиусыг ГАЗРЫН ЗУРАГТ тойрог болгож зурна (БНбД 30.01.03).
   *
   * ⚠️ ЗӨВХӨН 2D: 3D-д меш газрыг бүрхдэг тул хавтгай тойрог нь дотор нь
   * булагдана. Мөн зөвхөн ТУХАЙН давхарга ИЛ үед — каталогоос унтраавал
   * буфер нь ч арилна (эс бөгөөс «юуны тойрог вэ» гэдэг тайлагдахгүй).
   *
   * ⚠️ `geodesicBuffer` — Web Mercator дээр энгийн `buffer` нь өргөрөгөөс
   * хамаарч радиусыг гажуудуулна (УБ-ын 47.9°-т ~1.5 дахин). Геодезик буфер
   * нь газрын БОДИТ метрээр бодогдоно.
   *
   * ⚠️ Хүсэлт нь давхаргын ӨӨРИЙН `queryFeatures`-ээр (lib/query биш): тэр нь
   * геометр буцаадаггүй (`returnGeometry: false`) бөгөөд давхарга нь зурагт
   * аль хэдийн ачаалагдсан тул нэмэлт тохиргоо шаардахгүй.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const REACH_ID = 'irged:reach';
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
       * ⚠️ БАЙРЛАЛ — ортофотогийн ЯГ ДЭЭР, вектор давхаргуудын ДООД талд.
       *
       * Түүхэн хоёр алдаа: (1) индекс 2 нь ортофотогийн ДООР орж тойрог огт
       * харагдахгүй байв; (2) хамгийн дээр тавихад буферийн тасархай хүрээ ба
       * «300 м» шошго нь нүхэн жорлонгийн кластер, тэдний цагаан тоон дээгүүр
       * давхарлаж, зураг «холилдож» байв. Индексийг ортофотогийн бүлгээс
       * БОДОЖ олох нь хоёуланг нь шийднэ — давхаргын тоо өөрчлөгдсөн ч зөв.
       */
      /* ⚠️ 2026-09-17: дахин ХАМГИЙН ДЭЭР. Доор тавьсан шалтгаан (жорлонгийн
         кластерын бөмбөлөгтэй давхарлана) арилсан — кластер бүрмөсөн
         хасагдсан. Дээр байснаар «300 м» шошго нь вектор давхаргад
         далдлагдахгүй. Дүүргэлт 10% тул доорх зураг хэвээр уншигдана. */
      gl = new GraphicsLayer({ id: REACH_ID, listMode: 'hide' });
      map.add(gl);
    }
    const layer = gl;
    let alive = true;

    (async () => {
      const graphics: Graphic[] = [];
      for (const g of want) {
        /* ⚠️ Бүлэгт ГАНЦ шошго: таван цэцэрлэгт «300 м» гэж таван удаа бичвэл
           бичвэрүүд тойргуудын огтлолцол дээр овоолж уншигдахаа болино.
           Радиус нь бүлэг дотроо ижил тул нэг удаа хэлэхэд хангалттай. */
        let labelled = false;
        for (const id of g.ids) {
          const fl = map.findLayerById(id) as FeatureLayer | null;
          if (!fl) continue;
          try {
            /* ⚠️ `load()` ЗААВАЛ: ачаалагдаагүй давхаргын `queryFeatures` нь
               «Layer not loaded» гэж унадаг бөгөөд алдааг нь бид чимээгүй
               залгидаг тул буфер огт үүсэхгүй байв. */
            await fl.load();
            const res = await fl.queryFeatures({
              where: '1=1',
              returnGeometry: true,
              outFields: [fl.objectIdField],
            });
            for (const f of res.features) {
              if (!f.geometry) continue;
              /* Полигон барилгын ТӨВӨӨС буфер — ирмэгээс нь биш. Норматив нь
                 «барилга хүртэлх зай» тул төв нь хамгийн ойрын төлөөлөл.
                 ⚠️ `centroid` нь зөвхөн полигонд бий; цэгэн давхаргад
                 геометр нь өөрөө төв, хүрээтэй бол хүрээний төв. */
              const gm = f.geometry as __esri.Polygon;
              const c = gm.centroid ?? gm.extent?.center ?? f.geometry;
              /**
               * ⚠️ БУФЕРИЙН ФУНКЦ нь ПРОЕКЦООС хамаарна.
               *
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
               *
               * ⚠️ Төвд БИШ ирмэгт: төвд нь барилга өөрөө байдаг тул бичвэр
               * түүнийг халхалж, мөн олон тойрог давхцахад шошгууд төвүүд дээрээ
               * овоолно. Ирмэг дээр байвал аль шошго аль тойрогтой нь холбоотой
               * нь эргэлзээгүй.
               * ⚠️ Проекц нь МЕТРийнх (UTM 48N) тул `y + радиус` нь яг тойргийн
               * дээд цэг. Web Mercator-т ойролцоо боловч хазайлт нь шошгын
               * байрлалд мэдэгдэхүйц биш.
               * ⚠️ `haloColor` — ортофото нь ямар ч өнгөтэй байж болох тул
               * бичвэр хүрээгүй бол алга болно.
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
  }, [ready, visibleKey, dim]);

  /* Харагдац ба БҮСИЙН шүүлт */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);

    /**
     * ⚠️ Каталогийн вектор давхаргын ӨНДРИЙН ГОРИМ нь ГОРИМООС хамаарна:
     * 2D-д газрын гадаргуу, 3D-д мешийн гадаргуу. `Map` кэшлэгддэг тул
     * барих үед биш ЭНД, солих бүрд тавина.
     */
    const elev = dim === '3d' ? ON_SCENE : ON_GROUND;

    map.layers.forEach((l) => {
      if (l.id === IMAGERY_ID) { l.visible = ortho; return; }
      // ⚠️ Полигон зурах GraphicsLayer нь каталогийн `visible` жагсаалтад ХЭЗЭЭ Ч
      //    орохгүй тул энэ шалгуургүй бол доорх мөр түүнийг нууж, зурсан полигон
      //    алга болно. Sketch widget өөрөө агуулгыг удирдана — үргэлж ил.
      // Ортофото/меш харьцуулалт — ЗӨВХӨН «Харьцуулах» товч удирдана (каталогт үл хамаарна)
      if (l.id === ORTHO_SWIPE.id || l.id === MESH_SWIPE.id) return;
      // Хамрах хүрээний буфер — өөрийн эффект удирдана (каталогт үл хамаарна)
      if (l.id === 'irged:reach') return;
      if (l.id === 'sketch') { l.visible = true; return; }
      // Эх үүсвэрийн пульс-хуулбар — өөрийн анимаци удирдана, каталогт үл хамаарна.
      if (l.id === 'source:pulse') { l.visible = true; return; }
      /**
       * «Эрсдэлийн загвар»-ын ҮР ДҮНГИЙН давхаргууд (`ersdel:flood` усны
       * анимаци, `ersdel:band` аюулын муж, `ersdel:damage` өртсөн объект,
       * `ersdel:station` харуул) — ӨӨРСДӨӨ удирдана, каталогт ХЭЗЭЭ Ч орохгүй.
       *
       * ⚠️ Энэ шалгуургүй бол доорх мөр (`on.has(l.id) && dim !== 'bim'`) тэднийг
       * НУУНА: каталогийн жагсаалтад байхгүй тул `on.has` нь үргэлж `false`.
       * Үр дүн нь «эхлээд харагдаад, давхарга/бүс/горим солиход алга болдог»
       * — BIM-д бол `dim !== 'bim'`-ээр бүр байнга алга. `Ersdel.tsx` нь
       * тэдгээрийг өөрийн эффектээр нэмж/хасдаг тул энд гар хүрэхгүй.
       */
      if (String(l.id).startsWith('ersdel:')) { l.visible = true; return; }
      // Лавлагааны хилүүд — каталогоос үл хамааран БҮХ зурагт үргэлж ил.
      /* ⚠️ Хоёр эх: ГЛОБАЛ лавлагаа (хил) ба ХАРАГДАЦЫН ӨӨРИЙН
         (`alwaysOn` проп — жиш. «Ерөнхий төлөвлөгөө»-ний явган зам). */
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
        // ⚠️ BIM горимд каталогийн 2D давхаргыг НУУНА — web scene өөрөө зам, ногоон,
        //    мод, барилгын 3D хувилбарыг агуулдаг тул давхцал/эмх замбараагүйг арилгаж
        //    scene-ийн цэвэр төрхтэй тааруулна.
        const show = on.has(l.id) && dim !== 'bim';
        // ЗӨВХӨН Эх үүсвэр (`source:eh`) давхарга шинээр ил болоход анзаарагдам
        // пульс-анимаци эхэлнэ. Бусад давхаргад (барилга г.м.) анимаци байхгүй.
        if (show && l.id === 'source:eh' && !prevVisRef.current.has(l.id)) pulseLayer(l);
        l.visible = show;
        /**
         * ⚠️ Өндрийн горим — ЗӨВХӨН каталогийн давхаргад (`LAYER_BY_ID`).
         * 3D-д мешийн гадаргуу дээр, 2D-д газрын гадаргуу дээр. Меш, BIM, web
         * scene-ийн давхаргууд өөрсдийн горимтой тул тэдэнд ХҮРЭХГҮЙ.
         */
        if (LAYER_BY_ID[String(l.id)]) {
          (l as FeatureLayer).elevationInfo = elev as never;
        }
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
          /* ⚠️ ГЕОМЕТРЭЭР салгана — дээрх `layerStyle`-ийн тэмдэглэлийг үзнэ.
             Давхаргын бүртгэл олдохгүй бол (webmap-аас ирсэн давхарга) хуучин
             зан төлөв буюу талбайн симбол хэвээр. */
          const hue = ov.hue ?? d?.hue ?? '#0891b2';
          fl.renderer = simple(
            d?.geom === 'point'
              ? dot(hue, ov.size ?? (d.size ?? 9) * DOT_SCALE, d.marker ?? 'circle')
              : d?.geom === 'line'
                ? line(hue, ov.width ?? d.width ?? LINE_PX, d.dash ?? 'solid')
                : fill(hue, ov.fill ?? 0.25, ov.width ?? 3),
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
  }, [visibleKey, alwaysOnKey, dim, ready, zone, layerWhere, layerStyle, hl, hlOnly, uniform, bare, ortho, pulseLayer]);

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

  /**
   * ДАВХАРГЫН УНАЛТЫГ АЖИГЛАХ.
   *
   * ⚠️ Зөвхөн `loadStatus === 'failed'`-ыг тоолно. Харагдахгүй давхарга нь
   *    `not-loaded` хэвээр үлддэг тул «ачаалаагүй» ба «унасан» хоёр
   *    ХОЛИЛДОХГҮЙ — зөвхөн ЖИНХЭНЭ уналт л тоологдоно.
   * ⚠️ Гарчгаар нь харуулна: «3 давхарга унав» гэхээс «Барилга · Зам» гэсэн нь
   *    аль мэдээлэл дутуу байгааг шууд хэлнэ.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) { setLayerFail([]); return; }
    const handle = reactiveUtils.watch(
      () => map.allLayers
        .filter((l) => l.loadStatus === 'failed')
        .map((l) => l.title || l.id)
        .toArray()
        .join('|'),
      (joined) => setLayerFail(joined ? joined.split('|') : []),
      { initial: true },
    );
    return () => handle.remove();
  }, [ready]);

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

  /**
   * ⚠️ 2026-09-04: Уналтын ЖИНХЭНЭ шалтгааныг ялгана. ArcGIS нь WebGL-ийн
   *    уналтыг `name = 'webgl:…'` угтвартай буцаадаг (хэмжсэн:
   *    `webgl:major-performance-caveat-detected`, Chrome `--disable-gpu`).
   *    Энэ тохиолдолд асуудал нь СҮЛЖЭЭ БИШ — драйвер/тоног төхөөрөмжийн
   *    хурдасгуур, тиймээс «Дахин оролдох» товч хэзээ ч тусалдаггүй.
   *    Угтварыг өөрчилбөл (ArcGIS-ийн шинэ хувилбар) буруу онош эргэж гарна.
   */
  const initWebgl = initError?.name?.startsWith('webgl:') === true;

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
            <span>
              {initWebgl
                ? tr('Хөтчийн график (WebGL) идэвхгүй байна — тоног төхөөрөмжийн хурдасгуурыг асаах эсвэл өөр хөтөч ашиглана уу.')
                : tr('Сүлжээ эсвэл газрын зургийн үйлчилгээний алдаа гарлаа.')}
            </span>
            {/* ⚠️ 2026-09-04: Алдааны техник нэрийг ИЛ үзүүлнэ — IT-д дамжуулах
                цорын ганц баримт нь энэ. Өмнө нь зөвхөн console-д үлддэг тул
                хэрэглэгчийн ирүүлсэн зурган дээр ямар ч шалтгаан харагддаггүй байв. */}
            {initError?.name && <code style={{ opacity: 0.75, fontSize: 11 }}>{initError.name}</code>}
            {/* ⚠️ 2026-09-04: WebGL-ийн уналтад «Дахин оролдох» товчийг НУУНА —
                драйвер/блоклист өөрчлөгдөөгүй тул дахин үүсгэх нь ЯГ адилхан
                уналт өгнө. Товч харуулах нь хэрэглэгчийг дэмий давтуулж,
                жинхэнэ шалтгаанаас (тоног төхөөрөмжийн хурдасгуур) холдуулна. */}
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

      {/* ⚠️ ЕРДИЙН ДАВХАРГЫН УНАЛТ. Үүнгүй бол унасан давхарга зүгээр л
          ХООСОН зурагдаж, «энэ бүсэд өгөгдөл алга» гэж ХУДАЛ уншигддаг байв
          (2026-09-02 аудит). Мешийнхтэй ижил байрлал, ижил дүр төрх. */}
      {layerFail.length > 0 && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>
            {tr('{0} давхарга ачаалагдсангүй', String(layerFail.length))}
          </b>
          <span>
            {layerFail.slice(0, 4).join(' · ')}
            {layerFail.length > 4 && tr(' …+{0}', String(layerFail.length - 4))}
            {' — '}
            {tr('Эдгээрийн өгөгдөл зурагт ХАРАГДАХГҮЙ. Сүлжээ эсвэл үйлчилгээний хандалтыг шалгана уу.')}
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
      {tip && (
        <MapTip
          x={tip.x} y={tip.y} id={tip.id} attrs={tip.attrs}
          fields={tip.fields} prog={blockProg}
        />
      )}

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
/**
 * TOOLTIP-Д ГАРГАХГҮЙ талбарууд — ArcGIS-ийн popup-д ч утгагүй техникийн багана.
 *
 * ⚠️ Засварын бүртгэлийн дөрөв (`CreationDate/Creator/EditDate/Editor`) МӨН
 * хасагдана: тэдгээр нь 2026-09-16-нд үйлчилгээ дээр асагдсан бөгөөд мөр бүрт
 * байдаг тул хулганы товч цонхыг дүүргэж, бодит атрибутыг доош түлхэнэ.
 * «Хэн зассан» нь засварын маягт ба ArcGIS-ийн өөрийн хэрэгслээр харагдана.
 */
const TIP_SKIP = /^(objectid|globalid|se_anno|creationdate|creator|editdate|editor)$/i;
const TIP_SKIP_PREFIX = /^shape(__|_|$)/i;

/**
 * ДОМЭЙНЫ КОДЫГ ШОШГО болгоно — ArcGIS-ийн popup-ийн зан.
 *
 * ⚠️ SDK нь `type`-ыг `'coded-value'` (зураастай) гэж нормчилдог ч REST-ийн
 * түүхий JSON `'codedValue'` байдаг — хоёуланг нь хүлээж авна, эс бөгөөс
 * шошго чимээгүй ажиллахаа больж түүхий код («ПЭ100») харагдана.
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
    /* ⚠️ Бүхэл тоог «12.0» гэж бичихгүй — ArcGIS-ийн popup ч тэгдэггүй */
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
   *
   * ⚠️ Урьд нь энэ давхаргууд доорх ерөнхий салаанд унаж, ЗӨВХӨН нэг мөр
   * («Урт 98.3 м») харуулдаг байв: `LayerDef.facets` тэдэнд тодорхойлогдоогүй
   * тул харуулах зүйл олдоггүй байсан юм. Эх үйлчилгээ нь монгол alias ба
   * кодлогдсон домэйнтой (жиш. `Work_Status` → «Төрөл») тул түүхий схемээс
   * шууд уншихад ArcGIS-тэй ижил цонх гарна.
   *
   * ⚠️ Бусад харагдацын tooltip-үүд (барилга, хяналт, газар, ЕТ) ХЭВЭЭР —
   * тэдэнд гар аргаар сонгосон мөрүүд нь зориудаар богино байдаг.
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
    /* ⚠️ Атрибут огт олдохгүй бол доорх ерөнхий салаа руу УНАХГҮЙ — гарчиг
       ганцаараа ч «энэ давхаргад мэдээлэл алга» гэдгийг зөв хэлнэ. */
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
    /* ⚠️ null ≠ 0 (2026-09-17) — «Айл» хоосон бол «—», 0 биш (доорх survey-тэй ижил). */
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
      rows.push({ k: f.label, v: text(attrs[f.field]) });
    }
    const zoneId = text(attrs[d.zoneField ?? ZONE_FIELD], '').trim();
    if (zoneId && zoneId !== ZONE_NONE.trim()) rows.push({ k: tr('Бүс'), v: zoneId });
  }

  return <TipBox x={x} y={y} hue={d.hue} title={d.title} rows={rows} />;
}

/**
 * Tooltip-ийн бүрхүүл — гарчиг + мөрүүд.
 * ⚠️ `MapTip`-ийн ХОЁР гаралт (инженерийн бүрэн атрибут ба бусад харагдацын
 * сонгосон мөрүүд) НЭГ зохиомжийг хуваалцана; хуулбарлавал өнгө, зай, дүрэм
 * хоёр газарт зөрнө.
 */
function TipBox({
  x, y, hue, title, rows,
}: {
  x: number; y: number; hue: string; title: string;
  rows: { k: string; v: string }[];
}) {
  return (
    <div
      className={s.tip}
      style={{ left: x, top: y, '--tone': hue } as CSSProperties}
      aria-hidden
    >
      <div className={s.tipHead}>{title}</div>
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
