'use client';

/**
 * ЭРСДЭЛИЙН ДҮРСЛЭЛ — газрын зураг дээрх БҮХ график нэг эндээс.
 *
 * ⚠️ Яагаад `featureEffect`/`layerStyle` БИШ, ГРАФИК вэ:
 *
 *   · `featureEffect` (тодруулга) нь ЗӨВХӨН MapView-д ажилладаг — SceneView
 *     түүнийг чимээгүй үл тоомсорлоно (`MapCanvas`-ийн `MapProvider` §тайлбар).
 *     Тиймээс 2D-д ажиллаад 3D/BIM-д алга болдог үр дүн гарна.
 *
 *   · `layerStyle` нь давхаргыг БҮХЭЛД нь будна — «өртсөн» ба «өртөөгүй»
 *     объектыг ялгахгүй. Хэрэглэгчийн асуулт нь яг тэр ялгаа.
 *
 *   ГРАФИК нь MapView, SceneView ХОЁУЛАНД ижил ажиллана — 2D-д хавтгай
 *   дүүргэлт, 3D/BIM-д өргөгдсөн эзэлхүүн (ус · утааны давхарга) болно.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import MediaLayer from '@arcgis/core/layers/MediaLayer';
import ImageElement from '@arcgis/core/layers/support/ImageElement';
import ExtentAndRotationGeoreference from '@arcgis/core/layers/support/ExtentAndRotationGeoreference';
import { buildFlow, clampBox, type Flow, type MercBox } from '@/lib/salhiUrsgal';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type { WindField } from '@/lib/salhiTor';
import Extent from '@arcgis/core/geometry/Extent';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import { IMAGERY_ID, useMap, type Dim } from '@/components/MapCanvas';
import { t as tr } from '@/lib/i18nCore';
import { bandAt, type Band, type DamageRow } from '@/lib/ersdelGeom';
import type { Station } from '@/lib/ersdel';
import { flowDeg, type FloodData, type FloodMode } from '@/lib/uyr';
import Polygon from '@arcgis/core/geometry/Polygon';
import { waterSurfaceAt } from '@/lib/uyrSurface';
import { buildWaterFlow, type WaterFlow } from '@/lib/uyrUrsgal';

/** Давхаргын id-ууд — каталогт ОРОХГҮЙ (`listMode: 'hide'`) */
const FLOOD_ID = 'ersdel:flood';
/**
 * Салхины урсгалын растер — каталогт ОРОХГҮЙ (үр дүн, давхарга биш).
 *
 * ⚠️ УГТВАР НЬ `ersdel:` БАЙХ ЁСТОЙ (2026-09-03 засвар). `MapCanvas`-ийн
 * давхаргын харагдалтын шүүлт (`MapCanvas.tsx` §`startsWith('ersdel:')`) нь
 * ЗӨВХӨН энэ угтвартай id-г «өөрөө удирддаг» гэж үзэж алгасдаг. Урьд нь
 * зураас (`ersdel-flow`) байсан тул шүүлтэд орж, `on.has(l.id)` нь каталогт
 * байхгүй id дээр үргэлж `false` буцааж давхаргыг НУУДАГ байв:
 * урсгал эхлээд гарч ирээд, «Шинжилгээ» дарах эсвэл каталогийн давхарга
 * асаах/2D↔3D солих бүрд ЧИМЭЭГҮЙ алга болдог — товч нь «Урсгал асаалттай»
 * гэж хэвээр бичигдэнэ.
 */
const FLOW_ID = 'ersdel:flow';
/**
 * УСНЫ УРСГАЛЫН СУДАЛ — гүний растерын ДЭЭР, тусдаа `MediaLayer`.
 *
 * ⚠️ Яагаад тусдаа давхарга вэ: судал нь фрейм БҮРД (30/сек) шинэчлэгдэх
 * ёстой ч гүний растер нь ~8/сек хангалттай. Нэг canvas дээр нийлүүлбэл
 * гүнийг ч 30/сек дахин будах шаардлага гарна.
 *
 * ⚠️ Угтвар `ersdel:` — `MapCanvas`-ийн харагдалтын шүүлт зөвхөн үүнийг
 * алгасдаг (`FLOW_ID` §тайлбар).
 */
const WFLOW_ID = 'ersdel:wflow';
/** Нэг зүсмэлийг хэдэн секундэд туулах вэ — 24 алхам ≈ 22 сек */
const STEP_S = 0.9;
/**
 * Фреймийн доод завсар (мс) — ~30 фрейм/сек.
 * ⚠️ 20-оос 30 болгов: усны хөдөлгөөн 20-д бага зэрэг «алхамтай» харагддаг.
 * Зурах өөрөө 0.8 мс тул зардал нь текстур ачаалалт (1 МБ/фрейм) — 30 МБ/сек
 * нь орчин үеийн GPU-д асуудалгүй.
 */
const FRAME_MS = 33;
/**
 * УСНЫ 3D ГАДАРГУУГ хэдэн мс тутамд дахин байгуулах вэ (~8/сек).
 * ⚠️ Нэг байгуулалт ~5 мс (24 зурвас, ~6,000 орой). 30/сек бол CPU-гийн 15%
 *    ба GPU руу секундэд 180,000 орой — илүүц. 8/сек нь нүдэнд тасралтгүй.
 */
const SURF_MS = 125;
/**
 * УСНЫ ГАДАРГУУ (3D) — бүс тус бүрд ТУСДАА давхарга.
 *
 * ⚠️ ЯАГААД ГУРВАН ДАВХАРГА ВЭ: `elevationInfo.offset` нь ДАВХАРГЫН шинж,
 * графикийнх БИШ. Гүний бүс бүр өөр өндөрт (газраас 0.15 / 0.6 / 1.8 м) хөвөх
 * ёстой тул нэг давхаргад хийвэл бүгд НЭГ өндөрт наалдаж, гүний ялгаа
 * алдагдана.
 */
const WATER_IDS = ['ersdel:water0', 'ersdel:water1', 'ersdel:water2'];

/**
 * ЗАГВАРЧЛАЛЫН УСНЫ ГАДАРГУУ (3D · BIM) — «дижитал ихэр»-ийн харагдац.
 *
 * ⚠️ Дээрх `WATER_IDS` нь АЮУЛЫН МУЖИЙН (буфер) ус — «100 жилийн үерт хаана
 * хүрэх вэ» гэсэн ТӨЛӨВЛӨЛТИЙН хариулт. Энэ давхарга нь ӨӨР зүйл: тухайн
 * АГШИН дахь бодит тархалт, хөндийг дагаж доошоо урсах усны гадаргуу.
 *
 * ⚠️ `absolute-height` — геометрийн ӨӨРИЙН `z` (метр, EGM2008) ашиглагдана.
 * `relative-to-ground` бол бүх зурвас газраас ижил зайд хөвж, налуу
 * алдагдана; `relative-to-scene` бол мешийн ДЭЭД гадаргуу (дээвэр, мод) дагаж
 * ус дээвэр дээр тогтоно.
 */
const WSURF_ID = 'ersdel:wsurf';

/** Усны замын шугам — тайлбарын давхарга */
const PATH_ID = 'ersdel:path';

const BAND_ID = 'ersdel:band';
const DMG_ID = 'ersdel:damage';
const ST_ID = 'ersdel:station';

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** ХОХИРОЛ = УЛААН. Ганц утга, ганц өнгө — бусад бүх өнгө нь аюулын мужийнх. */
const DAMAGE = '#dc2626';

const is3D = (d: Dim) => d === '3d' || d === 'bim';

/**
 * ⚠️ `Graphic.symbol` нь `Symbol` КЛАСС биш, ялгаварласан PROPERTIES union-ыг
 * хүлээж авдаг (ArcGIS-ийн autocast). Тиймээс `__esri.Symbol` рүү хөрвүүлбэл
 * TS татгалзана — шинжийн ЯГ төрлөөр нь нэрлэе.
 */
type Sym = Graphic['symbol'];

/* ── Симбол ── */

/** Аюулын муж — 2D хавтгай дүүргэлт */
const bandFill2d = (hue: string, alpha: number, onWater: boolean) => ({
  type: 'simple-fill',
  color: [...rgb(hue), alpha],
  /**
   * ⚠️ Усны дээр — ЗУЗААН хүрээ: шинжилгээний ХИЛ уншигдах ёстой.
   *
   * ⚠️ 2026-09-03: ЦАГААН байсныг МУЖИЙН ӨӨРИЙН ӨНГӨ болгов (хэрэглэгчийн
   * хүсэлт). Цагаан хүрээ нь мужийн улаан дүүргэлт, өртсөн объектын улаан
   * хоёроос ГУРАВ ДАХЬ өнгө болж, нэг ойлголт гурван өөр зүйл мэт
   * уншигдаж байв.
   */
  outline: onWater
    ? { color: [...rgb(hue), 0.95], width: 1.6 }
    : { color: [...rgb(hue), 0.9], width: 0.8 },
});

/**
 * Аюулын муж — 3D ЭЗЭЛХҮҮН.
 *
 * ⚠️ `extrude` нь газраас ДЭЭШ өргөнө: үерт энэ нь усны гүн (0.6–1.8 м), агаарт
 * инверсийн давхаргын өндөр (90–320 м). Хоёулаа БОДИТ хэмжигдэхүүн тул 3D
 * харагдац нь чимэглэл биш, ХЭМЖЭЭГ өөрөө хэлнэ.
 *
 * ⚠️ `edges` нь зөвхөн ҮЕРТ: 300 м өндөр утааны блокийн ирмэгийг зурвал бүх
 * дүрс тор мэт болно.
 */
const bandFill3d = (hue: string, alpha: number, height: number, edges: boolean) => ({
  type: 'polygon-3d',
  symbolLayers: [{
    type: 'extrude',
    size: Math.max(0.4, height),
    material: { color: [...rgb(hue), alpha] },
    ...(edges ? { edges: { type: 'solid', color: [...rgb(hue), 0.55], size: 0.6 } } : {}),
  }],
});

/**
 * ЖИНХЭНЭ УС (3D) — ArcGIS-ийн `water` симбол.
 *
 * ⚠️ Энэ нь ХАВТГАЙ дүүргэлт БИШ: SceneView нь долгион, тэнгэрийн тусгал,
 * гэрлийн хугарлыг бодит цагт тооцож зурдаг материал. Тиймээс `extrude`-ээр
 * хийсэн «цэнхэр хайрцаг»-аас эрс өөр — ус шиг л харагдана.
 *
 * ⚠️ ЗӨВХӨН SceneView (3D · BIM). MapView-д энэ симбол ажиллахгүй тул 2D-д
 * хуучин хавтгай дүүргэлт хэвээр.
 *
 * @param waveDeg — долгионы чиглэл (градус). Загварчлалын дундаж урсгалаас
 *   авна; байхгүй бол голын ерөнхий чиглэл (хойноос урагш).
 * @param strength — гүн ус илүү сэвсгэр: гүехэн дээр «rippled», гүнд «moderate».
 */
const waterSym = (waveDeg: number, strength: 'rippled' | 'slight' | 'moderate') => ({
  type: 'polygon-3d',
  symbolLayers: [{
    type: 'water',
    /* ⚠️ Өнгө нь ГҮНИЙГ заахгүй — усны ӨӨРИЙН өнгө. Гүнийг байрлал
       (`elevationInfo.offset`) ба долгионы хүч хоёр хэлнэ. Хэт цайвар бол
       шаварлаг үерийн ус мэт биш, усан сан мэт харагдана. */
    color: '#1c4f7c',
    waveDirection: waveDeg,
    waveStrength: strength,
    /* Сэлбэ бол ЖИЖИГ урсгал — «large» нь далайн өргөн долгион өгнө */
    waterbodySize: 'small',
  }],
});

/**
 * Өртсөн объект — 2D. БҮХ геометр НЭГ ӨНГӨ, НЭГ ХАНАЛТ.
 *
 * ⚠️ 2026-09-03 (хэрэглэгчийн хүсэлт: «өртөх талбай нэг өнгөөр»). Өнгө нь
 * урьд нь ч `DAMAGE` ганцаараа байсан ч ХАРАГДАЦ нь гурав өөр байв:
 *   · талбай — 0.55 ханалттай (ортофото дээр бор-улаан болж уншигдана)
 *   · шугам  — 1.0 (цэвэр улаан)
 *   · цэг    — 1.0 дээр нь ЦАГААН цагираг
 * Үр дүнд нэг үзэгдлийн гурван өөр өнгө мэт харагдаж байлаа. Одоо ханалт
 * нэг (`A`), цагаан цагираг ХАСАГДСАН.
 *
 * ⚠️ Ханалтыг 1.0 БОЛГООГҮЙ: талбайн дүүргэлт бүрэн дүүрэн бол доорх барилга,
 * зам огт харагдахаа болино — «юу өртсөн» нь мэдэгдэх ч «юун дээр» нь
 * алдагдана.
 */
const DMG_A = 0.72;

const dmg2d = (geom: 'area' | 'line' | 'point') =>
  geom === 'area'
    ? {
      type: 'simple-fill',
      color: [...rgb(DAMAGE), DMG_A],
      outline: { color: [...rgb(DAMAGE), DMG_A], width: 1.2 },
    }
    : geom === 'line'
      ? { type: 'simple-line', color: [...rgb(DAMAGE), DMG_A], width: 3 }
      : {
        type: 'simple-marker',
        style: 'circle',
        size: 9,
        color: [...rgb(DAMAGE), DMG_A],
        /* ⚠️ Цагаан цагираг ХАСАГДСАН — тэр нь цэгийг талбай/шугамаас
           ӨӨР өнгөт зүйл мэт харуулдаг байв. Мөн өнгөөр хүрээлнэ. */
        outline: { color: [...rgb(DAMAGE), DMG_A], width: 0.8 },
      };

/**
 * Өртсөн объект — 3D.
 *
 * ⚠️ Барилгыг УЛААН БҮРХҮҮЛ-ээр (14 м өргөсгөсөн, хагас тунгалаг) ороож
 * харуулна. Хавтгай улаан толбо нь 3D/BIM-д барилгын ЁРООЛД дарагдаж
 * харагдахгүй болдог — өндөр нь л нүдэнд хүрнэ.
 */
const dmg3d = (geom: 'area' | 'line' | 'point') =>
  geom === 'area'
    ? {
      type: 'polygon-3d',
      symbolLayers: [{
        type: 'extrude', size: 14,
        material: { color: [...rgb(DAMAGE), 0.45] },
        edges: { type: 'solid', color: [...rgb(DAMAGE), 1], size: 1 },
      }],
    }
    : geom === 'line'
      ? { type: 'line-3d', symbolLayers: [{ type: 'line', size: 5, material: { color: [...rgb(DAMAGE), 1] } }] }
      : {
        type: 'point-3d',
        symbolLayers: [{
          type: 'icon', resource: { primitive: 'circle' }, size: 11,
          material: { color: [...rgb(DAMAGE), 1] },
          /* ⚠️ 2D-тэй ижил: цагаан цагираг ХАСАГДСАН (дээрх `dmg2d`-ийн
             тайлбарыг үз) — өртсөн бүх объект НЭГ өнгөөр уншигдана. */
          outline: { color: [...rgb(DAMAGE), 1], size: 1 },
        }],
      };

/** Харуулын цэг — усны цэнхэр, агаарын улбар шар */
const ST_HUE: Record<Station['kind'], string> = { water: '#0284c7', air: '#ea580c' };

const station2d = (kind: Station['kind'], on: boolean) => ({
  type: 'simple-marker',
  style: kind === 'water' ? 'circle' : 'diamond',
  size: on ? 15 : 11,
  color: [...rgb(ST_HUE[kind]), 0.95],
  outline: { color: on ? [255, 255, 255, 1] : [255, 255, 255, 0.85], width: on ? 2.4 : 1.4 },
});

const station3d = (kind: Station['kind'], on: boolean) => ({
  type: 'point-3d',
  symbolLayers: [{
    type: 'icon',
    resource: { primitive: kind === 'water' ? 'circle' : 'kite' },
    size: on ? 17 : 12,
    material: { color: [...rgb(ST_HUE[kind]), 1] },
    outline: { color: [255, 255, 255, 1], size: on ? 2.2 : 1.2 },
  }],
  // ⚠️ Харуул нь газрын гадаргуу дээр биш, 3D-д БАРИЛГЫН дунд алдагддаг тул
  //    дээш өргөж («callout» шонгүй) харагдуулна.
  verticalOffset: { screenLength: 22, maxWorldLength: 120, minWorldLength: 12 },
  callout: { type: 'line', size: 1.2, color: [255, 255, 255, 0.85] },
});

/* ── Компонент ── */

/**
 * Зурган дээр дарахад буцах МЭДЭЭЛЭЛ.
 *
 * ⚠️ Гурван ӨӨР зүйл дээр дарж болно — тус бүр өөр асуултад хариулна:
 *   · `station` — «энэ харуул юу хэмжиж байна вэ»
 *   · `damage`  — «энэ улаан объект юу вэ, ямар гүн/агууламжид өртөв»
 *   · `band`    — «энэ газарт ус хэр гүн байх вэ / агаар хэр бохирдох вэ»
 */
export type Pick =
  | { kind: 'station'; oid: number }
  /** Үерийн растерын НЭГ НҮД — гүн, хурд, чиглэл, цуваа нь `uyr.ts`-ээс */
  | { kind: 'flood'; idx: number }
  | { kind: 'damage'; layerId: string; oid: number | null; band: Band | null }
  | { kind: 'band'; band: Band }
  | null;

export function Overlay({
  dim,
  bands,
  bandOnFlood = false,
  damage,
  stations,
  selected,
  onPick,
  flood = null,
  floodMode = 'depth',
  path = null,
  floodSlice = 0,
  playing = false,
  onSlice,
  onEnd,
  windField = null,
  windFlow = false,
  windHour = 0,
}: {
  dim: Dim;
  /** Аюулын мужууд — хоосон бол зөвхөн харуул зурагдана */
  bands: Band[];
  /**
   * Бүс нь УРСАЖ БУЙ УСНЫ ДЭЭР зурагдаж байна уу.
   * ⚠️ Тийм бол дүүргэлтийг НИМГЭН, хүрээг ТОД болгоно: өтгөн дүүргэлт нь
   * доорх растерын гүний өнгө, хөдөлгөөн хоёуланг нь дардаг.
   */
  bandOnFlood?: boolean;
  /** Өртсөн объектууд — улаанаар */
  damage: DamageRow[];
  stations: Station[];
  /** Сонгосон харуулын OID — томроод цагаан хүрээтэй болно */
  selected: number | null;
  /** Зурган дээр дарахад — хоосон газар бол `null` */
  onPick: (p: Pick) => void;
  /**
   * ҮЕРИЙН ЦАГ ХУГАЦААНЫ растер. Байвал тухайн зүсмэлийн зургийг газрын зурагт
   * тавина — 2D-д хавтгай, 3D/BIM-д газрын гадаргуу дээр наалдана.
   */
  flood?: FloodData | null;
  /** Растерыг юугаар будах вэ — гүн · хурд · аюул */
  floodMode?: FloodMode;
  /**
   * УСНЫ ЗАМ — сонгосон нүднээс ДЭЭШ (ус хаанаас ирсэн) ба ДООШ (хаашаа
   * явна) мөрдсөн шугам, Web Mercator цэгүүд.
   * ⚠️ Зөвхөн тайлбар: «яагаад энд үерлэв» гэдгийг нэг харахад хэлнэ.
   */
  path?: { up: number[][]; down: number[][] } | null;
  /** Идэвхтэй зүсмэлийн дугаар (зогссон үед) */
  floodSlice?: number;
  /** Анимаци явж байна уу */
  playing?: boolean;
  /** Анимаци шинэ зүсмэл рүү орлоо — эцэг нь заагчаа дагуулна */
  onSlice?: (s: number) => void;
  /**
   * Анимаци ТӨГСГӨЛД хүрлээ.
   * ⚠️ Үер мөчлөгт үзэгдэл БИШ тул эргэж эхлэхгүй — эцэг нь `playing`-ийг
   * унтраана. Хэрэглэгч ▶ дарж дахин тоглуулна.
   */
  onEnd?: () => void;
  /**
   * САЛХИНЫ ТАЛБАР. Байвал (ба `windFlow` асаалттай бол) тоосонцрын урсгал
   * зурагдана. `null` бол давхарга ОГТ үүсэхгүй — хоосон canvas ч GPU-д
   * текстур эзэлнэ.
   */
  windField?: WindField | null;
  /** Урсгалын анимац асаалттай эсэх */
  windFlow?: boolean;
  /** Аль цагийн салхиар урсгах вэ (`windField.times`-ын индекс) */
  windHour?: number;
}) {
  const { view } = useMap();

  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  /* ⚠️ Анимац эхлэхдээ ОДООГИЙН зүсмэлээс үргэлжилнэ — `floodSlice`-ыг
     эффектийн хамаарал болговол зүсмэл солигдох бүрд дахин эхэлнэ. */
  const floodSliceRef = useRef(floodSlice);
  floodSliceRef.current = floodSlice;
  /* ⚠️ `drawSurface` нь ДООР зарлагдсан тул REF-ээр дамжина (TDZ) */
  const drawSurfaceRef = useRef<((pos: number) => void) | null>(null);
  const drawWFlowRef = useRef<((pos: number) => void) | null>(null);


  /**
   * ⚠️ ГУРВАН тусдаа давхарга: муж (доор) → хохирол (дунд) → харуул (дээр).
   * Нэг давхаргад хийвэл графикийн дараалал нь массивын дараалалаас хамаарч,
   * шинэчлэлт бүрд харуулын цэг усан доор алга болно.
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const mk = (id: string) =>
      new GraphicsLayer({
        id,
        // Каталог/давхаргын жагсаалтад ОРОХГҮЙ — энэ нь үр дүн, давхарга биш
        listMode: 'hide',
        // ⚠️ Газрын гадаргуу дээр наана: 3D-д `extrude` нь эндээс дээш өргөнө
        elevationInfo: { mode: 'on-the-ground' },
      });
    /**
     * ⚠️ УСНЫ давхаргууд нь мужийн ДООР: усан дээр аюулын хүрээ, өртсөн
     * объект, харуул гурвуулаа харагдах ёстой.
     * ⚠️ `relative-to-ground` — газрын РЕЛЬЕФийг дагаж, дээр нь `offset`
     * метрээр хөвнө. `on-the-ground` бол гүн 0 болж хавтгай наалдана;
     * `relative-to-scene` бол мешийн ДЭЭД гадаргууг (барилгын дээвэр, мод)
     * дагах тул ус дээвэр дээр тогтоно.
     */
    const water = WATER_IDS.map((id) => new GraphicsLayer({
      id,
      listMode: 'hide',
      elevationInfo: { mode: 'relative-to-ground', offset: 0 },
    }));
    /* ⚠️ Загварчлалын усны гадаргуу — БҮХ зурвас НЭГ давхаргад багтана, учир
       нь өндөр нь давхаргын `offset`-оос БИШ, геометрийн `z`-ээс уншигдана. */
    const wsurf = new GraphicsLayer({
      id: WSURF_ID,
      listMode: 'hide',
      elevationInfo: { mode: 'absolute-height', offset: 0 },
    });
    const layers = [...water, wsurf, mk(BAND_ID), mk(DMG_ID), mk(PATH_ID), mk(ST_ID)];
    view.map.addMany(layers);
    return () => {
      if (view.map) view.map.removeMany(layers);
      layers.forEach((l) => l.destroy());
    };
  }, [view]);

  /* ── ҮЕРИЙН ЦАГ ХУГАЦААНЫ РАСТЕР (MediaLayer) ──
   *
   * ⚠️ Яагаад `MediaLayer` вэ: 512×512 нүдийн гүнийг вектор болгож зурвал
   *    хэдэн мянган полигон болох ба зүсмэл солих бүрд дахин байгуулах нь
   *    боломжгүй. `MediaLayer` нь canvas-ыг ШУУД газрын зураг дээр байрлуулна —
   *    зүсмэл солиход зөвхөн `source` солигдоно (NEMA-гийн `FloodScene`-ийн
   *    хийдэгтэй ижил).
   * ⚠️ `elevationInfo: on-the-ground` — 3D/BIM-д газрын гадаргуу дагаж наалдана.
   */
  const floodLayerRef = useRef<MediaLayer | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !flood) return;
    const e = flood.meta.extent;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax,
        spatialReference: { wkid: flood.meta.wkid },
      }),
    });
    /**
     * ⚠️ ЭХЛЭЭД нэг элементтэй үүсгэнэ. Хоосон `source: []`-ээр үүсгээд дараа нь
     * `layer.source = [...]` гэж БҮТЭН эх сурвалжийг дахин оноох нь ажиллахгүй
     * (зураг шинэчлэгдэхгүй, «урсахгүй» болсны ГОЛ шалтгаан). NEMA-гийн
     * `FloodScene` шиг `source.elements`-ийг БАЙРАНД нь солино.
     */
    const layer = new MediaLayer({
      id: FLOOD_ID,
      listMode: 'hide',
      source: [new ImageElement({ image: flood.frame(0, 0, 0, modeRef.current), georeference: geo })],
    });
    /**
     * ⚠️ `elevationInfo` ӨГӨХГҮЙ. `MediaLayer` нь SceneView-д ҮРГЭЛЖ газрын
     * гадаргуу дээр наалддаг (`MediaLayerView3D` нь зөвхөн «drape» горимтой,
     * `elevationInfo`-г огт уншдаггүй — эх кодоор шалгав). Тиймээс 2D, 3D, BIM
     * гуравт ижил ажиллана; вектор давхаргууд (`GraphicsLayer`) нь ЭСРЭГЭЭР
     * заавал `elevationInfo` шаарддаг — доор өгсөн.
     */
    floodLayerRef.current = layer;
    geoRef.current = geo;
    /**
     * ⚠️ ОРТОФОТОГИЙН ЯГ ДЭЭР (2026-08-29 засвар).
     *
     * Урьд нь `add(layer, 0)` гэж ХАМГИЙН ДООД индекст тавьдаг байв — санаа нь
     * «аюулын муж, өртсөн объект, харуул гурвуулаа усны дээр гарах» байсан ч
     * индекс 0 нь ОРТОФОТОГИЙН БАЙР (`buildLayers`-д `IMAGERY_ID` GroupLayer
     * хамгийн түрүүнд нэмэгддэг). Үр дүнд ус ортофотогийн ДООР орж, зураг дээр
     * ОГТ харагддаггүй байлаа — «симуляц урсахгүй байна» гэсний жинхэнэ учир.
     *
     * Одоо ортофотог олоод түүний ДАРАА тавина: ус зурган дээр урсах ба
     * вектор давхаргууд (барилга, зам, муж, харуул) усны дээр хэвээр үлдэнэ.
     */
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      floodLayerRef.current = null;
      geoRef.current = null;
    };
  }, [view, flood]);

  /* ── УСНЫ УРСГАЛЫН СУДАЛ (MediaLayer) ──
   *
   * ⚠️ Гүний растерын ДЭЭР. Тоосонцор нь загварчлалын хурдны талбар дээр
   * хөвж, бүдгэрэх судал үлдээнэ — «ус хөдөлж байна» гэдгийг цагаан СУМ
   * (диаграм) биш, ХӨДӨЛГӨӨН өөрөө хэлнэ.
   */
  const wflowLayerRef = useRef<MediaLayer | null>(null);
  const wflowRef = useRef<WaterFlow | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !flood) return;
    const e = flood.meta.extent;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax,
        spatialReference: { wkid: flood.meta.wkid },
      }),
    });
    const flow = buildWaterFlow(flood);
    const layer = new MediaLayer({
      id: WFLOW_ID,
      listMode: 'hide',
      source: [new ImageElement({ image: flow.step(0), georeference: geo })],
    });
    wflowLayerRef.current = layer;
    wflowRef.current = flow;
    wflowGeoRef.current = geo;
    /* ⚠️ ҮЕРИЙН РАСТЕРЫН ЯГ ДЭЭР: судал усан дээр л утгатай. Ортофотогийн
       доор орвол огт харагдахгүй, вектор давхаргын дээр гарвал барилгыг
       хучна. */
    const base = view.map.findLayerById(FLOOD_ID);
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = base ? view.map.layers.indexOf(base) + 1
      : ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      wflowLayerRef.current = null;
      wflowRef.current = null;
      wflowGeoRef.current = null;
    };
  }, [view, flood]);

  /**
   * СУДЛЫГ нэг фрейм урагшлуулна.
   * ⚠️ ЗӨВХӨН `depth` горимд: хурд/аюулын зурагт судал нь өнгөний утгыг
   * дардаг ба тэнд чиглэлийг СУМ хэлнэ (`uyr.ts` §frame).
   */
  const drawWFlow = useCallback((pos: number) => {
    const layer = wflowLayerRef.current;
    const geo = wflowGeoRef.current;
    const flow = wflowRef.current;
    if (!layer || !geo || !flow) return;
    layer.visible = modeRef.current === 'depth';
    if (!layer.visible) return;
    const el = new ImageElement({ image: flow.step(pos), georeference: geo });
    const src = layer.source as unknown as { elements: { removeAll(): void; add(x: unknown): void } };
    src.elements.removeAll();
    src.elements.add(el);
  }, []);
  drawWFlowRef.current = drawWFlow;

  /**
   * ФРЕЙМ СОЛИХ — нэг л газраас.
   *
   * ⚠️ `elements.removeAll()` + `add()` нь ArcGIS-д зургийг ДАХИН татахыг
   * заана; `layer.source`-ыг дарж бичих нь заахгүй.
   */
  const drawFrame = useCallback((sl: number, f: number, phase: number) => {
    const layer = floodLayerRef.current;
    const geo = geoRef.current;
    const fd = floodRef.current;
    if (!layer || !geo || !fd) return;
    const el = new ImageElement({ image: fd.frame(sl, f, phase, modeRef.current), georeference: geo });
    const src = layer.source as unknown as { elements: { removeAll(): void; add(x: unknown): void } };
    src.elements.removeAll();
    src.elements.add(el);
  }, []);

  /**
   * АНИМАЦИ — 12 зүсмэлийг ҮСРЭНГҮЙ солихгүй, хооронд нь ШИНГЭЭНЭ.
   *
   * ⚠️ Зөвхөн зүсмэл солих (900 мс тутам) нь «12 өөр зураг» болж харагдана —
   * ус урсахгүй, үсэрнэ. Тиймээс `requestAnimationFrame`-ээр тасралтгүй
   * хугацаа тоолж, зүсмэл хоорондын утгыг шингээж (`f`), дээр нь урсгалын
   * долгионыг (`phase`) нэмнэ.
   *
   * ⚠️ React төлөв фрейм тутамд ШИНЭЧЛЭХГҮЙ — 30 фрейм/сек дээр 1000 мөрт
   * компонент дахин зурагдана. Зөвхөн БҮХЭЛ зүсмэл солигдоход эцэгт мэдэгдэнэ.
   */
  /* ЗОГССОН үед — сонгосон зүсмэлийг зурна (гүйгч чирэхэд ч энэ ажиллана)
   *
   * ⚠️ `view` нь ХАМААРАЛД ЗААВАЛ орно. 2D↔3D↔BIM шилжихэд `MediaLayer` дахин
   * үүсэж, эхний элемент нь `frame(0,0,0)` — өөрөөр хэлбэл ЭХНИЙ зүсмэл.
   * Энэ эффект дахин ажиллахгүй бол 7-р минутад зогсоод горим сольсон хүн
   * гэнэт 0-р минутын усыг хараад «загварчлал эхнээсээ эхэллээ» гэж ойлгоно.
   * Эффектүүд ЗАРЛАСАН дарааллаараа ажилладаг тул давхарга үүссэний ДАРАА
   * энэ нь зөв зүсмэлийг дахин зурна. */
  useEffect(() => {
    if (!flood || playing) return;
    drawFrame(floodSlice, 0, 0);
    /* ⚠️ Зогссон үед ч судал нь ТУХАЙН агшны чиглэлийг харуулна — гүйгч
       чирэхэд урсгал хаашаа байсныг уншина. */
    drawWFlowRef.current?.(floodSlice);
  }, [view, flood, playing, floodSlice, floodMode, drawFrame]);

  useEffect(() => {
    if (!flood || !playing) return;
    /**
     * ⚠️ `floodSlice` нь ЭНЭ эффектийн хамааралд ОРОХГҮЙ. Анимаци нь шинэ
     * зүсмэл болгонд `onSlice`-оор эцгийн төлөвийг шинэчилдэг; хэрэв түүнийг
     * хамаарал болговол эффект дахин эхлэж, `t0` тэглэгдэн ус зүсмэл бүрд
     * ЭХНЭЭС нь эхэлж «гацсан» мэт харагдана.
     */
    let raf = 0;
    /**
     * ⚠️ ЭХЛЭХ ЦЭГ нь ОДООГИЙН зүсмэл — 0 БИШ. Хэрэглэгч гүйгчийг 14-р минут
     * дээр аваачаад ▶ дарвал 0-оос эхлэх нь «буцаж үсэрлээ» гэсэн мэдрэмж өгнө.
     * Төгсгөлд байвал эхнээс эхэлнэ (дахин тоглуулах).
     */
    const SL = flood.meta.slices;
    const from = floodSliceRef.current >= SL - 1 ? 0 : floodSliceRef.current;
    const t0 = performance.now() - from * STEP_S * 1000;
    let lastInt = -1;
    let lastDraw = 0;
    let lastSurf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      /**
       * ⚠️ ФРЕЙМИЙГ ХЯЗГААРЛАНА (~30/сек). Зурах нь хямд (0.9 мс) ч фрейм
       * тутамд шинэ `ImageElement` үүсэж RGBA текстур GPU руу ачаалагдана.
       */
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      const el = (now - t0) / 1000;
      const pos = el / STEP_S;
      /**
       * ⚠️ ТӨГСГӨЛД ЗОГСОНО, эргэж эхлэхгүй (2026-09-09).
       *
       * Урьд нь `% SL` гэж мөчлөглөдөг байсан нь мөчлөг бүрийн ЗААГТ усыг
       * 48 га-гаас 2 га руу НЭГ ФРЕЙМД буулгаж, «цаг алгаслаа» гэсэн хамгийн
       * тод үсрэлтийг өөрөө үүсгэж байв. Үер нь мөчлөгт үзэгдэл БИШ — нэг
       * удаа ирж, оргилдож, татардаг.
       */
      if (pos >= SL - 1) {
        drawFrame(SL - 1, 0, el);
        drawSurfaceRef.current?.(SL - 1);
        drawWFlowRef.current?.(SL - 1);
        onSliceRef.current?.(SL - 1);
        onEndRef.current?.();
        cancelAnimationFrame(raf);
        return;
      }
      const sl = Math.floor(pos);
      drawFrame(sl, pos - sl, el);
      /* ⚠️ СУДАЛ нь ФРЕЙМ БҮРД — хөдөлгөөн нь тасралтгүй байж л ус мэт
         уншигдана. Зардал нь ~576 богино зураас ≈ 0.3 мс. */
      drawWFlowRef.current?.(pos);
      /**
       * УСНЫ ГАДАРГУУ (3D) — БУТАРХАЙ агшинд, ~8 удаа/сек.
       *
       * ⚠️ Зөвхөн БҮХЭЛ зүсмэл дээр шинэчилбэл гадаргуу 0.9 сек тутамд
       * үсэрч, «цаг алгасаж байна» гэж уншигдана. Фрейм тутам (30/сек)
       * шинэчлэх нь илүүц: полигоныг дахин байгуулах нь ~5 мс. 8/сек нь
       * нүдэнд тасралтгүй, CPU-д 4%.
       */
      if (now - lastSurf >= SURF_MS) {
        lastSurf = now;
        drawSurfaceRef.current?.(pos);
      }
      if (sl !== lastInt) {
        lastInt = sl;
        onSliceRef.current?.(sl);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flood, playing, drawFrame]);

  const flowLayerRef = useRef<MediaLayer | null>(null);
  const flowRef = useRef<Flow | null>(null);
  const flowGeoRef = useRef<ExtentAndRotationGeoreference | null>(null);

  /**
   * ЗУРАХ ХҮРЭЭ — газрын зургийн ХАРАГДАЦЫГ дагана.
   *
   * ⚠️ Зогссоны ДАРАА л шинэчилнэ (`view.stationary`). Гүйлгэх/зумлах явцад
   * фрейм тутам растер дахин байгуулбал тоосонцор бүрд дахин төрж, анимац
   * бүхэлдээ анивчина.
   *
   * ⚠️ Хүрээг БӨӨРӨНХИЙЛНӨ (1 км): жижиг хөдөлгөөн бүрд шинэ хайрцаг гарвал
   * растер байнга дахин байгуулагдаж, сүүл нь тасралтгүй тэглэгдэнэ.
   */
  const [box, setBox] = useState<MercBox | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !windFlow) return;
    const KM = 1000;
    const snap = (v: number) => Math.round(v / KM) * KM;
    const apply = () => {
      const e = view.extent;
      if (!e) return;
      const next = clampBox({
        xmin: snap(e.xmin), ymin: snap(e.ymin), xmax: snap(e.xmax), ymax: snap(e.ymax),
      });
      if (!(next.xmax > next.xmin && next.ymax > next.ymin)) return;
      setBox((cur) => (cur
        && cur.xmin === next.xmin && cur.ymin === next.ymin
        && cur.xmax === next.xmax && cur.ymax === next.ymax
        ? cur : next));
    };
    apply();
    const h = reactiveUtils.watch(
      () => view.stationary && view.extent,
      (v) => { if (v) apply(); },
    );
    return () => h.remove();
  }, [view, windFlow]);

  /* ── САЛХИНЫ УРСГАЛ (MediaLayer) ──
   *
   * ⚠️ ҮЕРИЙН растертай ИЖИЛ хэв загвар (дээрх тайлбарыг үз): canvas →
   *    `ImageElement` → `MediaLayer`. Ялгаа нь ЗӨВХӨН эх сурвалжид —
   *    үер нь бэлэн зүсмэл, салхи нь фрейм тутамд шинээр бодогдох тоосонцор.
   *
   * ⚠️ ХАРАГДАЦ солигдоход ДАХИН БАЙГУУЛНА (`box` хамаарал): ингэж байж зум
   *    ойртох тусам ижил `W` (896·SS ≈ 1,120) px нь бага талбайд ногдож, зураас олон бөгөөд
   *    тод болно.
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !windField || !box) return;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax,
        spatialReference: { wkid: 102100 },
      }),
    });
    const flow = buildFlow(windField, box);
    const layer = new MediaLayer({
      id: FLOW_ID,
      listMode: 'hide',
      /* ⚠️ 0.95 — ХЭРЭГЛЭГЧИЙН СОНГОСОН утга (2026-09-03). 1.0 руу
         өсгөж үзсэн ч буцав: доорх зураг бага зэрэг мэдрэгдэж байж салхи
         «зурган ДЭЭР» гэж уншигдана, тусдаа хөшиг мэт биш. */
      opacity: 0.95,
      source: [new ImageElement({ image: flow.step(windHour), georeference: geo })],
    });
    flowLayerRef.current = layer;
    flowRef.current = flow;
    flowGeoRef.current = geo;
    /* Ортофотогийн дээр, вектор давхаргуудын доор — үерийнхтэй ижил байр */
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      flowLayerRef.current = null;
      flowRef.current = null;
      flowGeoRef.current = null;
    };
  }, [view, windField, box, windHour]);

  /**
   * АНИМАЦИЙН ГОГЦОО — `FRAME_MS` (~30 фрейм/сек).
   *
   * ⚠️ 2026-09-06: тайлбар нь «~20 фрейм/сек» гэж бичигдсэн байсныг зассан.
   * `FRAME_MS` нь 33 буюу 30/сек бөгөөд үерийн растертай ХУВААЛЦДАГ —
   * тоосонцрын тохируулга (`SCALE`, `FADE`, `AGE`) бүгд ЭНЭ хурдад
   * хэмжигдсэн тул `FRAME_MS`-ийг өөрчилвөл сүүлийн урт ба тоосонцрын
   * хурд ХОЁУЛАА алдагдана.
   *
   * ⚠️ Фреймийг ХЯЗГААРЛАНА: фрейм тутамд шинэ `ImageElement` үүсч RGBA
   * текстур GPU руу ачаалагдана. 60/сек бол илүүдэл ачаалал.
   *
   * ⚠️ React төлөв фрейм тутамд ШИНЭЧЛЭХГҮЙ — зөвхөн `source.elements`-ийг
   * байранд нь солино.
   */
  useEffect(() => {
    if (!windField || !windFlow || !box) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      const layer = flowLayerRef.current;
      const geo = flowGeoRef.current;
      const flow = flowRef.current;
      if (!layer || !geo || !flow) return;
      const el = new ImageElement({ image: flow.step(windHour), georeference: geo });
      const src = layer.source as unknown as {
        elements: { removeAll(): void; add(x: unknown): void };
      };
      src.elements.removeAll();
      src.elements.add(el);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [windField, windFlow, windHour, box]);

  /* ── ЗАГВАРЧЛАЛЫН УСНЫ ГАДАРГУУ (3D · BIM) ──
   *
   * ⚠️ Растер (`MediaLayer`) нь ГАЗАРТ наалддаг тул 3D-д ус нь зураг мэт
   * хавтгай харагддаг. Энд түүнийг ХӨНДИЙГ ДАГАСАН эзэлхүүнтэй усаар
   * солино: зүсмэл тус бүрийн `гүн + газрын өндөр`-өөс өндрийн зурвасууд
   * гаргаж, ArcGIS-ийн `water` материалаар зурна (долгион, тусгал, хугарал
   * бодит цагт).
   *
   * ⚠️ ЗӨВХӨН вэб дээр бодогдсон загварчлалд (`flood.terrain` байгаа үед).
   * Бэлэн файлаас уншсан датад газрын өндөр байхгүй тул хуучин зам хэвээр.
   *
   * ⚠️ Зүсмэл бүрийг НЭГ УДАА бодоод КЭШЛЭНЭ: 12 зүсмэлийг давтан гүйлгэхэд
   * дахин бодох нь илүүц (нэг зүсмэл ~15 мс). Анимацийн үед фрейм тутамд
   * БИШ, ЗҮСМЭЛ солигдоход л шинэчлэгдэнэ — усны долгион нь симболын өөрийн
   * шейдерээр тасралтгүй хөдөлдөг тул нүдэнд үсрэлт мэдэгдэхгүй.
   */
  /**
   * Зүсмэл бүрийн зурвасууд — БҮГД урьдчилж бодогдоно.
   *
   * ⚠️ 2026-09-09. Урьд нь зүсмэл СОЛИГДОХ АГШИНД бодогддог байсан нь
   * анимацийг алхамтай болгож байв: 5 мс тооцоо + давхаргыг БҮХЭЛД нь дахин
   * байгуулах (45 полигон, ~8,000 орой) нь фрейм алгасуулна. Одоо
   * загварчлал дуусмагц бүх зүсмэл нэг удаа бодогдож (~130 мс, хэсэгчлэн
   * тасалж), тоглуулах үед ЗӨВХӨН геометр солигдоно.
   */
  const poolRef = useRef<Graphic[]>([]);
  /**
   * ⚠️ Сан нь ТУХАЙН давхаргынх. 2D↔3D↔BIM солиход давхаргууд ДАХИН үүсдэг
   * (эхний эффект `[view]` дээр устгаад шинээр нэмнэ) тул хуучин графикууд
   * УСТГАГДСАН давхаргад үлдэнэ — цэвэрлэхгүй бол ус дахин гарч ирэхгүй.
   */
  const wsLayerRef = useRef<GraphicsLayer | null>(null);
  /** Долгионы гурван хүч — симболыг фрейм тутам ДАХИН ҮҮСГЭХГҮЙ */
  const symsRef = useRef<Record<string, Sym>>({});
  const dimRef = useRef<Dim>(dim);
  dimRef.current = dim;

  /**
   * УСНЫ ГАДАРГУУГ БУТАРХАЙ АГШИНД шинэчилнэ.
   *
   * ⚠️ Тогтвортой (`useCallback` хоосон хамааралтай) — анимацийн rAF нь үүнийг
   * дуудахдаа эффектээ ДАХИН эхлүүлэх ёсгүй. Бүх хувьсагч `ref`-ээр.
   */
  const drawSurface = useCallback((pos: number) => {
    const gl = view?.map?.findLayerById(WSURF_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    if (wsLayerRef.current !== gl) { poolRef.current = []; wsLayerRef.current = gl; }
    const pool = poolRef.current;
    const fd = floodRef.current;
    if (!is3D(dimRef.current) || !fd?.terrain) {
      pool.forEach((g) => { g.visible = false; });
      return;
    }
    /**
     * СИМБОЛЫН КЭШ — «чиглэл(30°) + хүч» түлхүүрээр.
     *
     * ⚠️ Долгионы чиглэл нь ЗУРВАС БҮРИЙН өөрийн урсгалаас (`bd.deg`) —
     * гол мурийхад долгион сувгаа дагана. Гэвч симболыг зурвас бүрд ДАХИН
     * ҮҮСГЭВЭЛ SceneView материалыг дахин эмхэтгэж, 8/сек шинэчлэлт дээр
     * тасалдана. Тиймээс 30°-ийн алхмаар дугуйрч (12 бүлэг × 3 хүч = 36
     * симбол) кэшилнэ — нүд 30°-ийн зөрүүг ялгахгүй.
     */
    const symOf = (deg: number, k: 'rippled' | 'slight' | 'moderate') => {
      const q = Math.round(deg / 30) % 12;
      const key = `${q}:${k}`;
      const hit = symsRef.current[key];
      if (hit) return hit;
      const made = waterSym(q * 30, k) as unknown as Sym;
      symsRef.current[key] = made;
      return made;
    };
    /**
     * ⚠️ `vcsWkid: 3855` (EGM2008) — ЗААВАЛ. Өндөр нь mesh-ийн ӨӨРИЙН
     * босоо системд гарсан (`tools/dsm-mesh.py`). Босоо системийг зарлахгүй
     * бол SceneView түүнийг эллипсоидын өндөр гэж үзэж, ус нь газраас 20–30 м
     * дээгүүр (эсвэл доогуур) хөвнө — Улаанбаатарт геоидын зөрүү тийм хэмжээтэй.
     */
    const sr = { wkid: fd.meta.wkid, vcsWkid: 3855 };
    const bands = waterSurfaceAt(fd, pos);
    bands.forEach((bd, i) => {
      /* Гүн ус — илүү хүчтэй долгион; захын нимгэн ус бараг тайван */
      const sym = symOf(bd.deg, bd.depth >= 1.2 ? 'moderate' : bd.depth >= 0.5 ? 'slight' : 'rippled');
      /* ⚠️ Орой бүрд `z` — давхаргын горим `absolute-height` тул энэ нь усны
         гадаргуугийн БОДИТ өндөр (м). `hasZ`-гүй бол бүгд 0 өндөрт унана. */
      const geom = new Polygon({
        hasZ: true,
        rings: bd.rings.map((r) => r.map(([x, y]) => [x, y, bd.z])),
        spatialReference: sr,
      });
      let g = pool[i];
      if (!g) {
        g = new Graphic({ geometry: geom, attributes: { z: bd.z, depth: bd.depth } });
        g.symbol = sym;
        pool[i] = g;
        gl.add(g);
      } else {
        g.geometry = geom;
        if (g.symbol !== sym) g.symbol = sym;
        g.visible = true;
      }
    });
    /* Илүүдэл графикийг УСТГАХГҮЙ, зөвхөн НУУНА — дараагийн агшинд хэрэгтэй */
    for (let i = bands.length; i < pool.length; i++) pool[i].visible = false;
  }, [view]);

  drawSurfaceRef.current = drawSurface;

  /* ЗОГССОН үед — сонгосон зүсмэлийн гадаргуу */
  useEffect(() => {
    if (playing) return;
    drawSurface(floodSlice);
  }, [view, dim, flood, floodSlice, playing, drawSurface]);

  /* ── УСНЫ ЗАМ (тайлбар) ──
   *
   * ⚠️ ХОЁР ӨӨР ӨНГӨ: ус ХААНААС ирсэн (цайвар, цэгэн зураас) ба ХААШАА
   * явах (тод, цул). Нэг өнгөөр зурвал «энэ шугам юу хэлж байна» гэдэг нь
   * тодорхойгүй болно.
   *
   * ⚠️ Газрын гадаргуу дээр (`on-the-ground`) — 3D-д усан дор алга болохгүй
   * байхын тулд өргөлт өгөхгүй; шугам нь рельефийг дагана.
   */
  useEffect(() => {
    const gl = view?.map?.findLayerById(PATH_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    gl.removeAll();
    if (!path) return;
    const sr = { wkid: 102100 };
    const mk2 = (pts: number[][], up: boolean) => {
      if (pts.length < 2) return;
      const g = new Graphic({
        geometry: { type: 'polyline', paths: [pts], spatialReference: sr } as unknown as Graphic['geometry'],
        attributes: { dir: up ? 'up' : 'down' },
      });
      g.symbol = {
        type: 'simple-line',
        color: up ? [125, 211, 252, 0.95] : [250, 204, 21, 0.95],
        width: up ? 2 : 2.6,
        style: up ? 'short-dash' : 'solid',
        cap: 'round',
        join: 'round',
      } as unknown as Sym;
      gl.add(g);
    };
    mk2(path.up, true);
    mk2(path.down, false);
  }, [view, dim, path]);

  /* ── Аюулын муж ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(BAND_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();

    /**
     * ЖИНХЭНЭ УС (3D · BIM) — үерийн бүсийг `water` симболоор.
     *
     * ⚠️ ЗӨВХӨН ҮЕРТ. Агаарын сэвсгэрийг усаар зурвал утгагүй; тэр нь
     * `extrude`-ээр инверсийн өндөрт үлдэнэ.
     *
     * ⚠️ Бүс бүр ӨӨРИЙН давхаргад: `offset` нь давхаргын шинж тул нэг
     * давхаргад хийвэл гурван өөр гүн НЭГ өндөрт наалдана.
     *
     * ⚠️ Долгионы чиглэл — загварчлалын ДУНДАЖ урсгалаас (`flowDeg`), эс
     * бөгөөс голын ерөнхий чиглэл 180° (хойноос урагш). Долгион нь усны
     * хөдөлгөөнийг заадаг тул санамсаргүй чиглэл өгвөл нүд шууд «худал» гэж
     * уншина.
     */
    const waterLayers = WATER_IDS
      .map((id) => view?.map?.findLayerById(id) as GraphicsLayer | undefined);
    waterLayers.forEach((wl) => wl?.removeAll());

    const isFlood = bands.length > 0 && bands.every((b) => b.hue === bands[0].hue);
    /**
     * ⚠️ ЗАГВАРЧЛАЛЫН УС АСААЛТТАЙ бол мужийг УСААР зурахгүй (2026-09-08).
     *
     * `WSURF_ID` давхарга нь тухайн агшны БОДИТ усны гадаргууг аль хэдийн
     * зурчихсан байна. Дээр нь мужийн буфер усыг давхарлавал хоёр өөр
     * утгатай (агшин vs давтагдах хугацаа) хоёр ус нийлж, аль нь ч
     * уншигдахгүй болно. Тиймээс энэ тохиолдолд муж нь зөвхөн ХИЛ болж
     * газарт хэвтэнэ — «ус хаана хүрч болох вэ» гэдэг хариулт хэвээр.
     */
    const simWater = d3 && isFlood && !!flood?.terrain;
    if (simWater) {
      const merged = geometryEngine.union(bands.map((b) => b.geometry)) as unknown as
        __esri.Polygon | null;
      if (merged) {
        const g = new Graphic({
          geometry: merged,
          attributes: { band: bands[0].key, label: bands[0].label },
        });
        g.symbol = bandFill2d(bands[0].hue, 0.08, true) as unknown as Sym;
        gl.add(g);
      }
      return;
    }
    if (d3 && isFlood) {
      const waveDeg = waveDirRef.current;
      bands.forEach((b, i) => {
        const wl = waterLayers[i];
        if (!wl) return;
        /* Гүн ус — илүү хүчтэй долгион; захын нимгэн ус нь бараг тайван */
        const strength = b.height >= 1.2 ? 'moderate' : b.height >= 0.5 ? 'slight' : 'rippled';
        wl.elevationInfo = {
          mode: 'relative-to-ground',
          /* ⚠️ Усны ГАДАРГУУ нь ёроолоос `height` метрт — гүнийхээ хагасаар
             биш, БҮТНЭЭР дээш. Хагасаар тавибал ус газарт хагас булагдана. */
          offset: Math.max(0.05, b.height),
        } as unknown as GraphicsLayer['elevationInfo'];
        const g = new Graphic({
          geometry: b.geometry,
          attributes: { band: b.key, label: b.label, depth: b.height },
        });
        g.symbol = waterSym(waveDeg, strength) as unknown as Sym;
        wl.add(g);
      });
      /* ⚠️ Ус зурсан бол `extrude`-ийн цэнхэр хайрцгийг ДАВХАРЛАХГҮЙ —
         хоёулаа зурвал ус хайрцгийн дотор хоригдож, гялбаа нь алдагдана. */
      return;
    }

    /**
     * ⚠️ 2D-д НЭГ ПОЛИГОН (2026-09-03, хэрэглэгчийн хүсэлт).
     *
     * Аюулын муж нь ГУРВАН УГСРАА цагирагаас тогтдог (гүн · дунд · зах).
     * Дүүргэлтийн өнгө нь 2026-08-29-нөөс аль хэдийн НЭГ (`ersdelGeom`
     * §floodBands) боловч цагираг БҮР өөрийн ХҮРЭЭТЭЙ зурагддаг тул зурган
     * дээр 3 давхар цагаан зураас гарч, нэг муж нь ГУРВАН тусдаа бүс мэт
     * уншигдсаар байв.
     *
     * Одоо 2D-д тэдгээрийг НЭГТГЭЖ (`union`) ганц график болгоно: нэг
     * дүүргэлт, нэг гадна хүрээ.
     *
     * ⚠️ 3D-д НЭГТГЭХГҮЙ: тэнд цагираг бүр өөрийн ГҮНЭЭР өргөгддөг
     * (`b.height`) бөгөөд нэгтгэвэл гүний ялгаа бүрмөсөн алдагдана.
     *
     * ⚠️ Өнгө нь ЗӨРВӨЛ нэгтгэхгүй — агаарын сэвсгэр нь агууламжаар гурван
     * ӨӨР өнгөтэй (`#7f1d1d`/`#b45309`/`#ca8a04`) тул нэг дүүргэлтэд
     * шахвал концентрацийн шатлал алга болно.
     */
    const oneHue = bands.length > 1 && bands.every((b) => b.hue === bands[0].hue);
    if (!d3 && oneHue) {
      const merged = geometryEngine.union(bands.map((b) => b.geometry)) as unknown as
        __esri.Polygon | null;
      if (merged) {
        const b0 = bands[0];
        const alpha = bandOnFlood ? 0.14 : 0.34;
        const g = new Graphic({
          geometry: merged,
          attributes: { band: b0.key, label: b0.label },
        });
        g.symbol = bandFill2d(b0.hue, alpha, bandOnFlood) as unknown as Sym;
        gl.add(g);
        return;
      }
    }

    for (const b of bands) {
      // ⚠️ 3D-д тунгалаг ИХ байх ёстой: 300 м өндөр цул блок нь доорх хот,
      //    барилгыг бүрэн нуудаг. 2D-д эсрэгээрээ — хэт тунгалаг бол ортофото
      //    дээр өнгө нь ялгагдахгүй.
      /* ⚠️ Урсаж буй усны дээр дүүргэлт НИМГЭН — доорх хөдөлгөөн уншигдана */
      const alpha = bandOnFlood
        ? (d3 ? 0.10 : 0.14)
        : d3 ? (b.height > 40 ? 0.16 : 0.42) : 0.34;
      const g = new Graphic({
        geometry: b.geometry,
        attributes: { band: b.key, label: b.label },
      });
      /* ⚠️ Симболыг БҮТЭЭГЧид биш, дараа нь ОНООНО: `Graphic`-ийн бүтээгчийн
         `symbol` нь ялгаварласан union (`{type:'simple-fill'} | …`) хүлээдэг
         тул объектыг цутгах боломжгүй; instance-ийн шинж нь `Symbol` төрөл. */
      g.symbol = (d3
        ? bandFill3d(b.hue, alpha, b.height, b.height <= 40)
        : bandFill2d(b.hue, alpha, bandOnFlood)) as unknown as Sym;
      gl.add(g);
    }
  }, [view, dim, bands, bandOnFlood, flood]);

  /* ── Өртсөн объект (улаан) ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(DMG_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();
    for (const row of damage) {
      const sym = (d3 ? dmg3d(row.geom) : dmg2d(row.geom)) as unknown as Sym;
      for (const src of row.graphics) {
        const g = new Graphic({ geometry: src.geometry, attributes: src.attributes });
        g.symbol = sym;
        gl.add(g);
      }
    }
  }, [view, dim, damage]);

  /* ── Харуулын цэг ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(ST_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();
    for (const st of stations) {
      const on = st.oid === selected;
      const g = new Graphic({
        geometry: new Point({ longitude: st.lon, latitude: st.lat }),
        attributes: { oid: st.oid, name: st.name, torol: st.torol },
        popupTemplate: {
          title: '{name}',
          content: tr('Төрөл: {0}', '{torol}'),
        } as unknown as __esri.PopupTemplate,
      });
      g.symbol = (d3 ? station3d(st.kind, on) : station2d(st.kind, on)) as unknown as Sym;
      gl.add(g);
    }
  }, [view, dim, stations, selected]);

  /* ── Дарж мэдээлэл авах ──
     ⚠️ `MapCanvas` өөрөө ч `click`-ийг сонсдог (каталогийн давхаргын атрибут
        → `onPick` проп). Хоёулаа зэрэг ажиллана: тэр нь ДАВХАРГЫН объектыг,
        энэ нь АЮУЛЫН үр дүнг (улаан объект, муж) хариуцна — өөр өөр асуулт.
     ⚠️ `bands`/`damage` нь эффектийн хамаарлаас ГАДУУР, ref-ээр уншигдана:
        эс бөгөөс шинжилгээ ажиллах бүрд `click` бүртгэл салж дахин холбогдоно. */
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const damageRef = useRef(damage);
  damageRef.current = damage;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const floodRef = useRef(flood);
  floodRef.current = flood;
  /* ⚠️ Горим нь REF-ээр: анимацийн rAF нь эффектийг дахин эхлүүлэхгүйгээр
     шинэ горимыг унших ёстой — эс бөгөөс горим солих бүрд ус эхнээс эхэлнэ. */
  const modeRef = useRef<FloodMode>(floodMode);
  modeRef.current = floodMode;
  /**
   * Долгионы чиглэл (градус) — загварчлалын ДУНДАЖ урсгалаас нэг удаа бодно.
   * ⚠️ Загварчлал ачаалагдаагүй бол голын ерөнхий чиглэл: Сэлбэ хойноос
   *    урагш урсдаг тул 180°.
   */
  const waveDirRef = useRef(180);
  useEffect(() => {
    if (!flood) { waveDirRef.current = 180; return; }
    const m = flood.meta;
    const s = Math.min(m.slices - 1, m.slices - 1);
    let su = 0;
    let sv = 0;
    /* Бүх нүдийг гүйхгүй — 16 нүд тутам дээж (чиглэл дунджаар тогтвортой) */
    for (let i = 0; i < m.width * m.height; i += 16) {
      const d = flood.depth(s, i);
      if (d < m.wetM) continue;
      su += flood.u(s, i);
      sv += flood.v(s, i);
    }
    waveDirRef.current = su === 0 && sv === 0 ? 180 : flowDeg(su, sv);
  }, [flood]);
  const geoRef = useRef<ExtentAndRotationGeoreference | null>(null);
  const wflowGeoRef = useRef<ExtentAndRotationGeoreference | null>(null);
  const onSliceRef = useRef(onSlice);
  onSliceRef.current = onSlice;

  useEffect(() => {
    if (!view || view.destroyed) return;
    const h = view.on('click', (ev: __esri.ViewClickEvent) => {
      const pt = ev.mapPoint;
      /**
       * ⚠️ ҮЕРИЙН НҮД нь `hitTest`-д ОГТ гарч ирэхгүй: `MediaLayer` нь ганц
       * зураг бөгөөд түүний доторх нүд гэсэн ойлголт ArcGIS-д байхгүй. Тиймээс
       * дарсан цэгийн координатаас торын индексийг ӨӨРСДӨӨ бодно.
       */
      const fd = floodRef.current;
      const fIdx = fd && pt ? fd.indexAt(pt.x, pt.y) : null;
      /**
       * ⚠️ ЭХЛЭЭД `hitTest` (улаан объект, харуулын цэг нь ЯГ дарсан пикселээс
       * тодорхойлогдоно), дараа нь мужийн `contains` — хэрэв hitTest хоосон
       * буцвал (3D-д торон гадаргуу туяаг таслах тохиолдол) геометрийн шалгалт
       * гүйцээнэ.
       */
      view.hitTest(ev).then((res) => {
        if (view.destroyed) return;
        const band = pt ? bandAt(bandsRef.current, pt) : null;
        for (const r of res.results) {
          if (r.type !== 'graphic') continue;
          const id = r.graphic.layer == null ? '' : String(r.graphic.layer.id);
          const a = (r.graphic.attributes ?? {}) as Record<string, unknown>;
          if (id === ST_ID) {
            pickRef.current({ kind: 'station', oid: Number(a.oid) });
            return;
          }
          if (id === DMG_ID) {
            pickRef.current({
              kind: 'damage',
              layerId: String(a.layerId ?? ''),
              oid: a.oid == null ? null : Number(a.oid),
              band,
            });
            return;
          }
        }
        /* Улаан объект, харуул хоёр ОЛДООГҮЙ бол: үерийн нүд → аюулын муж */
        if (fIdx != null && fd && fd.depth(0, fIdx) >= 0) {
          // ⚠️ Хуурай нүд ч мэдээлэлтэй («энд ус ирээгүй») тул шүүхгүй
          pickRef.current({ kind: 'flood', idx: fIdx });
          return;
        }
        pickRef.current(band ? { kind: 'band', band } : null);
      }).catch(() => {});
    });
    return () => h.remove();
  }, [view]);

  return null;
}
