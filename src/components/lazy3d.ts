/**
 * 3D/BIM-ИЙН ArcGIS МОДУЛИЙГ ХОЦРООЖ АЧААЛАХ (⚠️ 2026-10-04, BIM/3D гүйцэтгэл).
 *
 * ⚠️ ЯАГААД: `MapCanvas` нь Portal-ын СТАТИК графт (Portal → MapCanvas) тул түүний статик
 *    импорт БҮХ хэрэглэгчид татагдана. Урьд нь `SceneView` (3D WebGL engine бүхэлдээ),
 *    `BuildingSceneLayer`, `IntegratedMeshLayer`, `BuildingExplorer`, 7 шинжилгээ
 *    (`VolumeMeasurementAnalysis` ~1.3 МБ), `Slide` статик байсан — 3D/BIM-д ОГТ ороогүй 2D
 *    хэрэглэгч ч тэдгээрийг татаж, задлан шинжилдэг байв (dev хэмжилт: 2D ачаалалтад 754
 *    SceneView/3d-engine модуль). Одоо 3D/BIM горимд анх ороход (эсвэл товч дээр хулгана
 *    очиход — `prefetch3d`) л татагдана.
 * ⚠️ Нэг удаа — амлалтыг хадгална; уналтад (сүлжээ) хаяж, дараагийн дуудлага дахин оролдоно
 *    («Дахин оролдох» товч → MapCanvas-ийн `initToken`).
 * ⚠️ Төрлийг `import type`-аар л авна — эс бөгөөс webpack модулийг СТАТИК графт буцааж чирнэ.
 */
import type SceneViewT from '@arcgis/core/views/SceneView';
import type IntegratedMeshLayerT from '@arcgis/core/layers/IntegratedMeshLayer';
import type BuildingSceneLayerT from '@arcgis/core/layers/BuildingSceneLayer';
import type BuildingExplorerT from '@arcgis/core/widgets/BuildingExplorer';
import type SceneModificationT from '@arcgis/core/layers/support/SceneModification';
import type SceneModificationsT from '@arcgis/core/layers/support/SceneModifications';
import type ViewshedAnalysisT from '@arcgis/core/analysis/ViewshedAnalysis';
import type AreaMeasurementAnalysisT from '@arcgis/core/analysis/AreaMeasurementAnalysis';
import type DirectLineMeasurementAnalysisT from '@arcgis/core/analysis/DirectLineMeasurementAnalysis';
import type LineOfSightAnalysisT from '@arcgis/core/analysis/LineOfSightAnalysis';
import type DimensionAnalysisT from '@arcgis/core/analysis/DimensionAnalysis';
import type SliceAnalysisT from '@arcgis/core/analysis/SliceAnalysis';
import type VolumeMeasurementAnalysisT from '@arcgis/core/analysis/VolumeMeasurementAnalysis';
import type SlideT from '@arcgis/core/webscene/Slide';

/** View үүсгэх ба 3D/BIM давхаргад ЗААВАЛ хэрэгтэй модулиуд */
export type Mods3d = {
  SceneView: typeof SceneViewT;
  IntegratedMeshLayer: typeof IntegratedMeshLayerT;
  BuildingSceneLayer: typeof BuildingSceneLayerT;
  BuildingExplorer: typeof BuildingExplorerT;
  SceneModification: typeof SceneModificationT;
  SceneModifications: typeof SceneModificationsT;
};

/** Шинжилгээ/эзлэхүүн/слайдын хэрэгсэл — хэрэглэгч тухайн самбарыг НЭЭХЭД л */
export type ModsTools = {
  ViewshedAnalysis: typeof ViewshedAnalysisT;
  AreaMeasurementAnalysis: typeof AreaMeasurementAnalysisT;
  DirectLineMeasurementAnalysis: typeof DirectLineMeasurementAnalysisT;
  LineOfSightAnalysis: typeof LineOfSightAnalysisT;
  DimensionAnalysis: typeof DimensionAnalysisT;
  SliceAnalysis: typeof SliceAnalysisT;
  VolumeMeasurementAnalysis: typeof VolumeMeasurementAnalysisT;
  Slide: typeof SlideT;
};

let m3: Mods3d | null = null;
let p3: Promise<Mods3d> | null = null;

/** Ачаалагдсан бол модулиуд, эс бөгөөс `null` (синхрон — эффект дотор шалгахад) */
export const mods3d = (): Mods3d | null => m3;

export function load3d(): Promise<Mods3d> {
  if (m3) return Promise.resolve(m3);
  p3 ??= Promise.all([
    import('@arcgis/core/views/SceneView'),
    import('@arcgis/core/layers/IntegratedMeshLayer'),
    import('@arcgis/core/layers/BuildingSceneLayer'),
    import('@arcgis/core/widgets/BuildingExplorer'),
    import('@arcgis/core/layers/support/SceneModification'),
    import('@arcgis/core/layers/support/SceneModifications'),
  ]).then(([sv, iml, bsl, be, sm, sms]) => {
    m3 = {
      SceneView: sv.default,
      IntegratedMeshLayer: iml.default,
      BuildingSceneLayer: bsl.default,
      BuildingExplorer: be.default,
      SceneModification: sm.default,
      SceneModifications: sms.default,
    };
    return m3;
  }).catch((e: unknown) => { p3 = null; throw e; });
  return p3;
}

/** 3D/BIM товч дээр хулгана/фокус очиход урьдчилан татна — алдааг залгина (жинхэнэ оролт дахин оролдоно) */
export function prefetch3d(): void {
  load3d().catch(() => {});
}

let mt: Promise<ModsTools> | null = null;

export function loadTools3d(): Promise<ModsTools> {
  mt ??= Promise.all([
    import('@arcgis/core/analysis/ViewshedAnalysis'),
    import('@arcgis/core/analysis/AreaMeasurementAnalysis'),
    import('@arcgis/core/analysis/DirectLineMeasurementAnalysis'),
    import('@arcgis/core/analysis/LineOfSightAnalysis'),
    import('@arcgis/core/analysis/DimensionAnalysis'),
    import('@arcgis/core/analysis/SliceAnalysis'),
    import('@arcgis/core/analysis/VolumeMeasurementAnalysis'),
    import('@arcgis/core/webscene/Slide'),
  ]).then(([vs, am, dl, los, dim, sl, vm, slide]) => ({
    ViewshedAnalysis: vs.default,
    AreaMeasurementAnalysis: am.default,
    DirectLineMeasurementAnalysis: dl.default,
    LineOfSightAnalysis: los.default,
    DimensionAnalysis: dim.default,
    SliceAnalysis: sl.default,
    VolumeMeasurementAnalysis: vm.default,
    Slide: slide.default,
  })).catch((e: unknown) => { mt = null; throw e; });
  return mt;
}
