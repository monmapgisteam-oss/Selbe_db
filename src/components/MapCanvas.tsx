'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import type Layer from '@arcgis/core/layers/Layer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  ZONE, BUILDING, PARCEL, CADASTRE, VALUATION, GENERAL, UTILITY, SURVEY, HOME, BASEMAP,
  BOUNDARY, BOUNDARY_HUE, PROGRESS_LEVELS, PARCEL_STATUS, PARCEL_STATUS_EMPTY,
  PARCEL_STATUS_EMPTY_HUE, MODULES, IMAGERY,
  ZONE_TYPES, ZONE_TYPE_EMPTY, ZONE_TYPE_EMPTY_HUE,
  type ModuleKey, type GeneralKey, type UtilKey,
} from '@/lib/services';
import { queryExtent } from '@/lib/query';
import { useTheme } from '@/lib/theme';
import s from './map.module.css';

/* ─────────────────── Map контекст ─────────────────── */

type MapApi = {
  view: MapView | null;
  /** Зурах давхарга — үнэ тооцоолуурын AOI энд орно */
  sketchLayer: GraphicsLayer | null;
  /** Тухайн давхаргын oncлох (SQL where). null = тодруулга цуцлах */
  setHighlight: (where: string | null) => void;
  /**
   * Орон зайн шүүлт — зурсан талбайтай огтлолцоогүй объектыг БҮРЭН нуана.
   * null = шүүлт цуцлах.
   */
  setAoiFilter: (geometry: __esri.Geometry | null) => void;
  /**
   * Давхаргыг бүхэлд нь харагдах хүрээнд нь аваачих.
   *
   * `key` нь МОДУЛИЙН түлхүүр (тухайн модулийн эхний ил давхарга) эсвэл ДАВХАРГЫН
   * id байж болно. Нэг модульд олон давхарга байхад (барилга + тайлангийн цэг)
   * тодорхой давхарга руу зорих шаардлага гардаг тул хоёуланг нь дэмжинэ.
   *
   * `withBoundary` — төслийн хилийг ч багтаана (өгөгдөл хилээс гадуур байвал
   * хоёуланг нь нэг дор харуулна).
   */
  zoomToLayer: (key: ModuleKey | string, opts?: { withBoundary?: boolean }) => void;
};

const Ctx = createContext<MapApi>({
  view: null, sketchLayer: null, setHighlight: () => {}, setAoiFilter: () => {}, zoomToLayer: () => {},
});

/** MapCanvas үүссэн view-гээ энд бүртгүүлнэ (дотоод) */
const RegisterCtx = createContext<(view: MapView | null, sketch: GraphicsLayer | null) => void>(() => {});

export const useMap = () => useContext(Ctx);

/* ─────────────────── Симбол ─────────────────── */

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/**
 * ⚠️ ArcGIS-д өнгөний массивын alpha нь СИМБОЛЫН ТӨРЛӨӨС хамаарч өөр хэмжээстэй:
 *   · энгийн симбол (simple-fill, simple-line, text) → alpha 0–1
 *   · CIM симбол (CIMSolidFill, CIMSolidStroke)      → alpha 0–100
 * Хоёуланг нь 0–255 гэж бичвэл утга нь дээд хязгаартаа тасарч, бүрэн ДҮҮРЭН болно.
 */

/** Энгийн симболын өнгө — alpha 0–1 */
const c = (hex: string, a = 1): number[] => [...rgb(hex), a];

/** CIM симболын өнгө — alpha 0–100 */
const cim = (hex: string, a = 1): number[] => [...rgb(hex), Math.round(a * 100)];

/**
 * Полигоны дүүргэлтийн тунгалаг байдал — 80% тунгалаг (alpha 0.2).
 * Давхарга бүр НЭГ ижил байна: суурь зураг тод харагдаж, объектыг хүрээгээр нь ялгана.
 */
/**
 * Полигоны дүүргэлтийн тунгалаг байдал.
 *
 * ⚠️ Энэ утга нь агаарын зураг АНХНААСАА асаалттай болсноор шийдвэрлэх ач
 * холбогдолтой болсон. Ортофото нь дунд өнгөтэй, нарийн бүтэцтэй дэвсгэр
 * (жинхэнэ дундаж RGB 115,113,107) тул 0.2 тунгалагт давхаргууд угаагдаж
 * алга болдог байв.
 *
 * Хэмжсэн үр дүн (CIE Lab ΔE, ортофотогийн дундажтай харьцуулсан):
 *   a=0.16 → ΔE 12–18 (сул)   ·   a=0.30 → ΔE 22–34 (тод)
 *
 * Өнгийг ЦАЙРУУЛЖ шийдэх гэж оролдож болохгүй: дэвсгэр нь дунд өнгөтэй тул
 * цайруулбал ялгаа нь ЖИЖИГРЭНЭ (жишээ нь Багц #2563eb→#3b82f6 үед ΔE 25.9→22.6),
 * дээр нь эдгээр өнгө самбарын текстэд ч ашиглагддаг тул уншигдахаа болино.
 */
const FILL_ALPHA = 0.3;

/**
 * Полигоны симбол — бүдэг дүүргэлт + ГЭРЭЛТЭХ хүрээ.
 *
 * CIM симбол ашиглаж хоёр давхар зураас тавина: доор нь өргөн, тунгалаг зураас
 * (гэрэлтүүлгийн halo), дээр нь нарийн, тод зураас. Энгийн `simple-fill` нь ганц
 * зураас л дэмждэг тул ийм эффект гаргах боломжгүй.
 *
 * symbolLayers-ийн эхнийх нь ДЭЭР зурагдана — тиймээс тод зураас эхэнд.
 */
const fill = (hex: string, a = FILL_ALPHA, w = 1.4) =>
  ({
    type: 'cim',
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMPolygonSymbol',
        symbolLayers: [
          // Тод хүрээ
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: w,
            color: cim(hex, 1),
          },
          // Гэрэлтүүлгийн halo — өргөн, тунгалаг
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: w * 4,
            color: cim(hex, 0.3),
          },
          // Дүүргэлт
          { type: 'CIMSolidFill', enable: true, color: cim(hex, a) },
        ],
      },
    },
  }) as const;

/**
 * Нягт давхаргын симбол — НИМГЭН зураас, гэрэлтүүлэггүй.
 *
 * Кадастр (43,041) ба барилгын үнэлгээ (36,586) зэрэг олон мянган жижиг полигонд
 * зузаан зураас, halo хэрэглэвэл зураг бүхэлдээ бөглөрч, объект хоорондоо ялгарахаа
 * болино. Тиймээс тэдэнд ганц нимгэн зураас өгнө.
 */
const denseFill = (hex: string, a = 0.26, w = 0.5) =>
  ({
    type: 'simple-fill',
    color: c(hex, a),
    // Зураас нь БҮТЭН тунгалагтай — агаарын зураг дээр хэлбэрийг тодорхойлох
    // гол хүч нь зураас. Хагас тунгалаг зураас нь зурган дээр уусна.
    outline: { color: c(hex, 1), width: w },
  }) as const;

/**
 * Ерөнхий мэдээллийн давхаргын симбол — ЦЭВЭРХЭН, гэрэлтэлгүй.
 *
 * `Selbe_talbain_hynalt`-ийн 7 давхарга (ногоон байгууламж 4,701 полигон, барилга,
 * гэр…) нь олон мянган жижиг полигонтой. `fill()`-ийн гэрэлтэх halo (өргөн зузаан,
 * тунгалаг зураас) эдгээрийг хооронд нь «цэцэглүүлж» нэг ногоон бөөгнөрөл болгодог.
 * Тиймээс halo-гүй, нам дүүргэлт + нимгэн ТОД хүрээ өгч, объект бүрийг цэвэрхэн
 * ялгана. Дүүргэлтийг арай нам (0.16) болгосноор давхацсан полигон бүрхэж бараандахгүй.
 */
const cleanFill = (hex: string, a = 0.28, w = 0.8) =>
  ({
    type: 'simple-fill',
    color: c(hex, a),
    // НИМГЭН боловч БҮТЭН тунгалагтай зураас. Харагдац нь дүүргэлтээс (ΔE 22–34)
    // ирдэг тул зураас нь зөвхөн ирмэг тодорхойлно — зузаалах шаардлагагүй.
    outline: { color: c(hex, 1), width: w },
  }) as const;

/**
 * Шугамын симбол — НИМГЭН зураас + нарийн бараан хүрээлэл (casing).
 *
 * Шугаман давхаргад дүүргэлт байхгүй тул харагдац нь БҮХЭЛДЭЭ зураасаас хамаарна.
 * Агаарын зураг нь нарийн бүтэцтэй, олон өнгөтэй тул дан нимгэн зураас түүн дээр
 * тасарч, хэсэг хэсгээрээ алга болдог. Зузаалах нь шийдэл биш — зураг бөглөрнө.
 *
 * Шийдэл: доор нь бага зэрэг өргөн, бараан хагас тунгалаг хүрээлэл тавина.
 * Хүрээлэл нь шугамыг дэвсгэрээс ТАСЛАЖ өгдөг тул үндсэн зураас нимгэн хэвээр
 * атлаа хаана ч уншигдана — картографийн стандарт арга.
 *
 * ⚠️ symbolLayers-ийн ЭХНИЙХ нь ДЭЭР зурагдана — тиймээс үндсэн зураас эхэнд.
 * ⚠️ CIM симболын alpha нь 0–100 хуваарьтай (`cim()`), энгийнийх нь 0–1 (`c()`).
 *
 * `Road_shugam_suljee` нь CAD-аас экспортолсон олон богино хэрчмээс тогтдог тул
 * дугуй cap/join заавал хэрэгтэй — эс бөгөөс үзүүрт заваа, тохойд хурц эвдрэлт гарна.
 */
const line = (hex: string, w = 1.2) =>
  ({
    type: 'cim',
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMLineSymbol',
        symbolLayers: [
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: w,
            color: cim(hex, 1),
          },
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: w + 1.3,
            color: cim('#0b1220', 0.4),
          },
        ],
      },
    },
  }) as const;

const simple = (sym: unknown) => ({ type: 'simple', symbol: sym }) as __esri.RendererProperties;

const hueOf = (k: ModuleKey) => MODULES.find((m) => m.key === k)!.hue;

/**
 * Давхаргын хүрээг зургийн проекцоор авч, ArcGIS Extent болгоно.
 *
 * ⚠️ SDK-ийн `FeatureLayer.queryExtent()`-ийг ашиглахгүй: тэр нь `where`-ыг хүсэлтэд
 * огт оруулдаггүй бөгөөд эдгээр FeatureServer 400 «No where clause specified» гэж
 * татгалздаг. Тиймээс REST рүү шууд хандана (`src/lib/query.ts`).
 *
 * Давхаргууд өөр өөр проекцтой (4326, 32648, 102100, WKT-only) тул хүрээг нэгтгэх,
 * зурагт ашиглахын өмнө заавал НЭГ системд буулгана.
 */
async function extentOf(url: string, view: MapView): Promise<Extent | null> {
  const wkid = view.spatialReference?.wkid ?? 102100;
  const box = await queryExtent(url, wkid);
  if (!box) return null;
  return new Extent({
    xmin: box.xmin,
    ymin: box.ymin,
    xmax: box.xmax,
    ymax: box.ymax,
    spatialReference: view.spatialReference,
  });
}

/**
 * Давхаргын шошго — модулийн өнгөөр, цагаан halo-той.
 * Ингэснээр цайвар, харанхуй суурь зураг хоёуланд нь уншигдана.
 *
 * @param expression Arcade илэрхийлэл
 * @param minScale   Ойртох үед л шошго гарна (0 = үргэлж)
 */
const labels = (hex: string, expression: string, minScale = 30000, size = 11) =>
  [
    {
      labelExpressionInfo: { expression },
      symbol: {
        type: 'text',
        color: c(hex),
        haloColor: [255, 255, 255, 0.9],
        haloSize: 1.6,
        font: { size, weight: 'bold' },
      },
      labelPlacement: 'always-horizontal',
      minScale,
    },
  ] as unknown as __esri.LabelClassProperties[];

/** Загварын горимд тохирсон суурь зураг (нийтийн вектор тайл — API key хэрэггүй) */
const basemapFor = (theme: 'light' | 'dark') =>
  new Basemap({
    baseLayers: [new VectorTileLayer({ portalItem: { id: BASEMAP[theme] } })],
    title: theme === 'dark' ? 'Dark Gray' : 'Light Gray',
  });

/**
 * Тооцоолуурын хоёр давхаргыг ялгах өнгө.
 * Нэгж талбар — модулийн өнгө (ногоовтор). Барилга — тодорхой ялгаатай ягаан.
 */
export const ESTIMATOR_BUILDING_HUE = '#6366f1';

/**
 * Кадастрын нэгж талбарын өнгө.
 *
 * Өмнө нь «тооцоолуур» модулийн өнгө байсан ч тэр модуль «Газар» руу нэгдсэн.
 * Газрын модулийн улаан өнгийг ХУВААЖ БОЛОХГҮЙ: улаан нь чөлөөлөлтийн явцын
 * ангилалд оногдсон бөгөөд 43 мянган кадастрын полигон түүнтэй ижил өнгөтэй бол
 * хоёр огт өөр зүйл нэг мэт харагдана.
 */
export const CADASTRE_HUE = '#0d9488';

/**
 * Бүсийн давхаргын өнгө.
 * ⚠️ Тусдаа модуль байхаа больсон тул модулиас уншиж болохгүй — тогтмол болгов.
 */
export const ZONE_LIST_HUE = '#7c3aed';

/**
 * Талбайн хяналтын тайлангийн цэгний өнгө.
 *
 * Тайлан нь одоо барилгын модульд амьдардаг ч модулийн улбар шар өнгийг ХУВААХГҮЙ:
 * тайлангийн цэгүүд барилгын полигонуудын ДЭЭР зурагдах тул ижил өнгөтэй байвал
 * ялгагдахаа болино. Хөх ногоон нь гүйцэтгэлийн 4 түвшний аль нэгтэй ч давхцахгүй.
 */
export const SURVEY_HUE = '#0891b2';

/**
 * Төслийн үндсэн хилийн симбол — дүүргэлтгүй, тасархай/цэгэн зураас.
 * Аль ч модулийн өгөгдлийг дарахгүй, зөвхөн хүрээ болно.
 */
const boundaryLine = (style: 'dash' | 'dot') =>
  ({
    type: 'simple-fill',
    color: [0, 0, 0, 0], // дүүргэлтгүй
    // Нимгэн: өнгө нь өөрөө өндөр ялгаралтай (ΔE ≥ 71) тул зузаалах хэрэггүй
    outline: { color: c(BOUNDARY_HUE, 1), width: style === 'dash' ? 1.5 : 1.2, style },
  }) as const;

/* ─────────────────── Давхарга үүсгэх ─────────────────── */

/** Давхаргын id → аль модульд харьяалагдах */
const OWNER: Record<string, ModuleKey> = {};
const own = (id: string, m: ModuleKey) => {
  OWNER[id] = m;
  return id;
};

const BOUNDARY_PLAN_ID = 'bnd:plan';
const BOUNDARY_SELBE2_ID = 'bnd:selbe2';

/** Агаарын зураг — 9 ImageServer-ийг багцалсан GroupLayer */
export const IMAGERY_ID = 'imagery';

/**
 * Апп нээгдэхэд АНХНААСАА асаалттай байх нэмэлт давхаргууд.
 *
 * Ортофото нь бодит газрын дүр төрхийг өгдөг тул вектор давхаргыг уншихад
 * шууд контекст болно — хэрэглэгч бүрт гараар асаалгүй анхнаасаа ил байлгана.
 */
export const DEFAULT_OVERLAYS: string[] = [IMAGERY_ID];

/**
 * Модульд орох үед ил байх ДЭД давхаргууд.
 *
 * ⚠️ Урьд нь самбар бүр өөрөө «хоосон бол анхдагчаа тавь» гэсэн эффекттэй байв.
 * Хоёр самбар (ерөнхий, шугам сүлжээ) нэг модульд нэгдэж, НЭГ `sublayers` массивыг
 * хуваах болсноор тэр эффектүүд бие биенийхээ утгыг дарж бичих байлаа. Тиймээс
 * анхдагчийг модулийн ТҮВШИНД, нэг газраас шийднэ (`Portal.go`).
 */
/**
 * ЗЭЭЛДСЭН давхарга — өөр модулийн эзэмшилд боловч энэ модульд ч сонгогдоно.
 *
 * ⚠️ «Нэмэлт давхарга» (`overlays`)-аас ЯЛГААТАЙ: тэдгээр нь зөвхөн харагддаг,
 * бүдгэрдэг, дарж сонгогдохгүй. Зээлдсэн давхарга бүрэн эрхтэй — модулийн өөрийн
 * давхаргатай адил.
 *
 * `модуль → { давхаргын id: дэд түлхүүр }`. Дэд түлхүүр нь `sublayers` массивт
 * орох нэр — тухайн модулийн бусад түлхүүртэй давхцах ЁСГҮЙ.
 */
const BORROWED: Partial<Record<ModuleKey, Record<string, string>>> = {
  general: { zone: 'zone', 'land:parcel': 'parcel' },
};

/** Зээлдсэн давхаргын жагсаалтын мэдээлэл — самбар үүгээр шилжүүлэгч зурна */
export const BORROWED_LAYERS: Record<ModuleKey, { key: string; title: string; hue: string }[]> = {
  general: [
    { key: 'zone', title: 'Хот төлөвлөлтийн бүс', hue: ZONE_LIST_HUE },
    { key: 'parcel', title: 'Үлдсэн нэгж талбар', hue: hueOf('land') },
  ],
  building: [],
  land: [],
};

export const DEFAULT_SUBLAYERS: Partial<Record<ModuleKey, string[]>> = {
  // Ерөнхий мэдээлэл — 11 дэд давхаргаас эхлэхэд ганц нь ил (бусдыг нь хэрэглэгч нэмнэ)
  general: ['built'],
  // Газар — эхлэхэд чөлөөлөлтийн таб. 43 мянган кадастрын полигон АНХНААСАА
  // харагдвал 217 үлдсэн талбарыг дарж, модулийн гол зорилго нуугдана.
  land: ['parcel'],
};

/**
 * Лавлах давхарга → аль модульд харагдах.
 *
 * Тухайн модулийн өгөгдлийг байрлуулж харахад чиг баримжаа болно. Эдгээр нь
 * ЗӨВХӨН зураас — дарж сонгогдохгүй, шүүлтэд оролцохгүй.
 * Шинэ модульд лавлах давхарга нэмэх бол зөвхөн энэ хүснэгтийг засна.
 *
 * ⚠️ Одоогоор ХООСОН. Хоёр лавлах давхарга байсныг хассан: барилгынхыг тайлангийн
 * цэгүүд барилгын модульд шилжсэн үед (жинхэнэ давхарга нь тэнд ил болсон),
 * багцын хилийнхийг тухайн давхаргыг бүрмөсөн хассан үед. Механизмыг үлдээв —
 * шинэ лавлах давхарга нэмэхэд энэ хүснэгтэд мөр нэмж, давхаргадаа дүүргэлтгүй
 * симбол өгнө (өмнөх `REF_OUTLINE` туслах нь хэрэглэгдэхээ болсон тул хасагдсан).
 */
const REF_IN: Record<string, ModuleKey[]> = {};

/**
 * Модулийн эзэмшилд ороогүй туслах давхаргууд.
 * Эдгээр нь: дарж сонгогдохгүй, тодруулга/орон зайн шүүлтэд оролцохгүй.
 */
const PASSIVE_IDS = new Set([
  'sketch',
  BOUNDARY_PLAN_ID,
  BOUNDARY_SELBE2_ID,
  // Агаарын зураг нь растр суурь — дарж сонгох, шүүх зүйлгүй
  IMAGERY_ID,
]);

/**
 * НЭМЭЛТ давхаргын id-ууд (хэрэглэгч зурагт давхцуулж харахаар асаасан).
 *
 * Эдгээр нь зөвхөн ХАРАГДАНА: дарж сонгогдохгүй, тодруулга/орон зайн шүүлтэд
 * оролцохгүй, статистикт нөлөөлөхгүй. Идэвхтэй модулийн ажиллагаа цэвэр үлдэнэ.
 *
 * Модулийн түвшний Set — MapCanvas бичиж, MapProvider уншина (нэг файл дотор).
 */
const OVERLAY_IDS = new Set<string>();

/** Дарж сонгох, шүүхэд оролцохгүй давхарга эсэх */
const isInert = (id: string) => PASSIVE_IDS.has(id) || OVERLAY_IDS.has(id);

/**
 * Зурагт давхцуулж болох БҮХ давхаргын каталог — үйлчилгээний давхарга тус бүрээр.
 *
 * Модулиар биш, ДАВХАРГААР жагсаана: «Ерөнхий мэдээлэл» гэсэн нэг мөрийн оронд
 * доторх 7 давхарга (Барилга, Ногоон байгууламж, Зам…) тус тусдаа гарна.
 * `module` нь зөвхөн бүлэглэх (гарчиг) болон идэвхтэй модулийнхыг хасахад хэрэгтэй.
 * `module: null` = ямар ч модульд харьяалагдахгүй (агаарын зураг) — үргэлж сонгогдоно.
 */
export type OverlayLayer = { id: string; title: string; hue: string; module: ModuleKey | null };

export const OVERLAY_LAYERS: OverlayLayer[] = [
  // Агаарын зураг — модулиас үл хамаарах растр суурь, тиймээс жагсаалтын эхэнд
  { id: IMAGERY_ID, title: IMAGERY.title, hue: IMAGERY.hue, module: null },
  ...(Object.keys(GENERAL) as GeneralKey[]).map((k) => ({
    id: `general:${k}`,
    title: GENERAL[k].title,
    hue: GENERAL[k].hue,
    module: 'general' as ModuleKey,
  })),
  // Шугам сүлжээ нь «Ерөнхий мэдээлэл»-ийн дэд давхарга болов
  ...(Object.keys(UTILITY) as UtilKey[]).map((k) => ({
    id: `utility:${k}`,
    title: UTILITY[k].title,
    hue: UTILITY[k].hue,
    module: 'general' as ModuleKey,
  })),
  { id: 'building', title: 'Барилгын явц', hue: hueOf('building'), module: 'building' },
  // Газрын модулийн 3 давхарга — таб нь алийг нь харуулахыг шийднэ
  { id: 'land:parcel', title: 'Үлдсэн нэгж талбар', hue: hueOf('land'), module: 'land' },
  { id: 'land:cadastre', title: 'Кадастрын нэгж талбар', hue: CADASTRE_HUE, module: 'land' },
  { id: 'land:valuation', title: 'Барилга (үнэлгээтэй)', hue: ESTIMATOR_BUILDING_HUE, module: 'land' },
  { id: 'survey', title: 'Талбайн хяналтын тайлан', hue: SURVEY_HUE, module: 'building' },
];

function buildLayers(): Layer[] {
  const L: Layer[] = [];

  // 0а · АГААРЫН ЗУРАГ — растр суурь. Хамгийн эхэнд нэмснээр БҮХ вектор давхаргын
  //      доор, суурь зургийн дээр зурагдана. Анхдагчаар унтраалттай.
  L.push(new GroupLayer({
    id: IMAGERY_ID,
    title: IMAGERY.title,
    visible: false,
    listMode: 'hide',
    /**
     * ⚠️ `visibilityMode: 'inherited'` БИШ. Тэр горимд хүүхэд давхаргууд нэмэгдэх
     * агшинд эцгийнхээ `visible`-ыг шингээдэг (`layerAdded` → `e.visible = this.visible`)
     * бөгөөд конструкторын шинжүүд ямар дарааллаар олгогдох нь баталгаагүй тул
     * `layers` нь `visibilityMode`-оос ӨМНӨ орвол горим огт үйлчлэхгүй үлдэнэ.
     *
     * Анхдагч 'independent' дээр хүүхэд бүр өөрийн `visible: true`-гээ хадгалж,
     * бүлгийн `visible` нь нийтийн хаалга болно — үр дүн ижил, эрсдэлгүй.
     */
    layers: IMAGERY.urls.map((url, i) => new ImageryLayer({
      id: `${IMAGERY_ID}:${i}`,
      url,
      visible: true,
      // Растрыг байгаагаар нь харуулна — сервер дээрх RGB нь боловсруулагдсан
      format: 'jpgpng',
      popupEnabled: false,
      legendEnabled: false,
    })),
  }));

  // 0 · ТӨСЛИЙН ҮНДСЭН ХИЛ — бүх горимд байнга харагдана.
  //     Хамгийн эхэнд нэмснээр бусад давхаргын ДООР зурагдана.
  L.push(new FeatureLayer({
    id: BOUNDARY_PLAN_ID,
    url: BOUNDARY.plan.url,
    title: BOUNDARY.plan.title,
    outFields: [BOUNDARY.plan.areaField],
    popupEnabled: false,
    legendEnabled: false,
    renderer: simple(boundaryLine(BOUNDARY.plan.style)),
  }));

  L.push(new FeatureLayer({
    id: BOUNDARY_SELBE2_ID,
    url: BOUNDARY.selbe2.url,
    title: BOUNDARY.selbe2.title,
    outFields: [BOUNDARY.selbe2.areaField],
    popupEnabled: false,
    legendEnabled: false,
    renderer: simple(boundaryLine(BOUNDARY.selbe2.style)),
  }));

  // 1 · Бүсчлэл — ЗОРИУЛАЛТААР нь өнгөөр ялгана.
  //     Түүхий `TOROL` нь 32 өөр утгатай тул шууд ялгаж болохгүй — Arcade нь
  //     Шинэ үйлчилгээний `TOROL` цэвэр 5 утгатай тул Arcade ангилагч хэрэггүй.
  L.push(new FeatureLayer({
    id: 'zone',
    url: ZONE.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: {
      type: 'unique-value',
      field: ZONE.fields.type,
      defaultSymbol: cleanFill(ZONE_TYPE_EMPTY_HUE, 0.26),
      defaultLabel: ZONE_TYPE_EMPTY,
      uniqueValueInfos: Object.entries(ZONE_TYPES).map(([value, color]) => ({
        value, label: value, symbol: cleanFill(color, 0.32),
      })),
    } as __esri.RendererProperties,
    labelingInfo: labels(
      // ⚠️ Модулийн ягаан өнгөөр БИШ. Тэр өнгө одоо «Инженерийн» ангилалд
      //    оногдсон тул шошго нь бүсийг буруу ангид хамааруулж харагдана.
      '#1e293b',
      `
        var id = Trim(Text($feature.${ZONE.fields.id}));
        var torol = Trim(Text($feature.${ZONE.fields.type}));
        When(id != '', id, torol != '', torol, '')
      `,
      // 84 бүс — жижиг масштабт бөглөрөх тул арай ойртоход л гарна
      12000,
      10,
    ),
  }));

  // 3 · Барилгын явц — 4 түвшнээр өнгө
  L.push(new FeatureLayer({
    id: own('building', 'building'),
    url: BUILDING.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: {
      type: 'class-breaks',
      field: BUILDING.fields.progress,
      defaultSymbol: cleanFill('#64748b', 0.3),
      defaultLabel: 'Мэдээлэлгүй',
      // ⚠️ ArcGIS-ийн classBreak нь minValue/maxValue ХОЁУЛАНГ нь оруулж тоолдог.
      //    Самбарын тоолол ба SQL шүүлт нь `>= min AND < max` (хагас нээлттэй) тул
      //    яг 25/50/75 дээр байгаа блок зураг дээр НЭГ ангиар, самбарт ӨӨР ангиар
      //    гарах болно. Тиймээс дээд хязгаарыг багасгаж, хоёуланг нь тааруулав.
      classBreakInfos: PROGRESS_LEVELS.map((l) => ({
        minValue: l.min,
        maxValue: l.max - 0.0001,
        label: `${l.label} (${l.range})`,
        symbol: cleanFill(l.color, 0.32),
      })),
    } as __esri.RendererProperties,
  }));

  // 4 · Үлдсэн нэгж талбар — чөлөөлөлтийн явцаар өнгө
  L.push(new FeatureLayer({
    id: own('land:parcel', 'land'),
    url: PARCEL.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: {
      type: 'unique-value',
      field: PARCEL.fields.status,
      // Талбаруудын 86% нь энэ бүлэгт унадаг — саарал биш, ТОД байх ёстой
      defaultSymbol: cleanFill(PARCEL_STATUS_EMPTY_HUE, 0.32),
      defaultLabel: PARCEL_STATUS_EMPTY,
      uniqueValueInfos: Object.entries(PARCEL_STATUS).map(([value, color]) => ({
        value, label: value, symbol: cleanFill(color, 0.32),
      })),
    } as __esri.RendererProperties,
  }));

  // 5 · Үнэ тооцоолуур — ХОЁР давхарга зэрэг: кадастрын нэгж талбар (43,041) ба
  //     барилгын үнэлгээ (36,586). Хоёулаа зөвхөн ойртоход зурагдана — эс бөгөөс
  //     жижиг масштабт 80 мянган полигон зурах болно.
  //     Барилга нь талбарын ДЭЭР зурагдана (жагсаалтад сүүлд нэмнэ).
  L.push(new FeatureLayer({
    id: own('land:cadastre', 'land'),
    url: CADASTRE.url,
    title: 'Нэгж талбар',
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    minScale: 40000,
    renderer: simple(denseFill(CADASTRE_HUE)),
  }));

  L.push(new FeatureLayer({
    id: own('land:valuation', 'land'),
    url: VALUATION.url,
    title: 'Барилга (үнэлгээтэй)',
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    minScale: 40000,
    renderer: simple(denseFill(ESTIMATOR_BUILDING_HUE)),
  }));

  // 6 · Ерөнхий мэдээлэл — 7 дэд давхарга
  for (const [k, g] of Object.entries(GENERAL) as [GeneralKey, (typeof GENERAL)[GeneralKey]][]) {
    L.push(new FeatureLayer({
      id: own(`general:${k}`, 'general'),
      url: g.url,
      outFields: ['*'],
      popupEnabled: false,
      visible: false,
      renderer: simple(cleanFill(g.hue)),
    }));
  }

  // 7 · Дэд бүтэц — инженерийн шугам, цахилгаан, тээвэр, зам
  for (const [k, u] of Object.entries(UTILITY) as [UtilKey, (typeof UTILITY)[UtilKey]][]) {
    L.push(new FeatureLayer({
      id: own(`utility:${k}`, 'general'),
      url: u.url,
      outFields: ['*'],
      popupEnabled: false,
      visible: false,
      renderer: simple(
        // Нимгэн (1.2) боловч хүрээлэлтэй тул агаарын зураг дээр ч тасрахгүй
        u.kind === 'line' ? line(u.hue, 1.2)
          // Цэг — цагаан хүрээтэй тойрог. Тайлангийн цэгээс ЖИЖИГ (9 vs 13):
          // худаг, буудал нь нэгжийн тоо олонтой тул зурагт бөглөрөх ёсгүй.
          : u.kind === 'point' ? {
            type: 'simple-marker',
            style: 'circle',
            size: 9,
            color: c(u.hue, 0.95),
            outline: { color: [255, 255, 255, 0.9], width: 1.4 },
          }
          : cleanFill(u.hue),
      ),
    }));
  }

  // 8 · Талбайн хяналт — Survey123-ийн цэгүүд.
  //     Барилгын модульд харьяалагдана: төлөвлөсөн гүйцэтгэл (полигон) ба талбар
  //     дээр баталгаажсан тайлан (цэг) нэг зурагт зэрэг харагдана. Барилгын
  //     полигонуудын ДАРАА нэмснээр тэдгээрийн дээр зурагдана.
  L.push(new FeatureLayer({
    id: own('survey', 'building'),
    url: SURVEY.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: simple({
      type: 'simple-marker',
      style: 'circle',
      size: 13,
      color: c(SURVEY_HUE, 0.9),
      outline: { color: [255, 255, 255, 0.9], width: 2 },
    }),
  }));

  return L;
}

/* ─────────────────── Provider ─────────────────── */

/**
 * Газрын зургийн API-г бүрхүүлийн ХАМГИЙН ДЭЭД түвшинд түгээнэ.
 *
 * Ингэснээр газрын зургийн хажуугийн багана (нийт үзүүлэлт, сонгосон объект) нь
 * MapCanvas-ийн ГАДНА байсан ч `useMap()`-аар шүүлт хийж, хүрээг тохируулж чадна.
 */
export function MapProvider({ children }: { children: ReactNode }) {
  // Ref биш STATE — MapCanvas view-гээ бүртгүүлэхэд хэрэглэгчид дахин зурагдана.
  // (Урьд нь ref-ийг render дотор уншиж, useMemo-гийн deps-д тавьдаг байсан нь
  //  React-ийн дүрэм зөрчсөн бөгөөд зөвхөн санамсаргүй ажиллаж байлаа.)
  const [view, setView] = useState<MapView | null>(null);
  const [sketchLayer, setSketchLayer] = useState<GraphicsLayer | null>(null);

  const register = useCallback((v: MapView | null, sk: GraphicsLayer | null) => {
    setView(v);
    setSketchLayer(sk);
  }, []);

  /**
   * Тодруулга ба орон зайн шүүлтийг НЭГ төлөвөөс гаргана.
   *
   * Хоёулаа `featureEffect` рүү бичдэг тул тусад нь бичвэл сүүлд ажилласан нь
   * нөгөөгийнхөө шүүлтийг чимээгүй устгана. ArcGIS-ийн `FeatureFilter` нь `where`
   * ба `geometry`-г ЗЭРЭГ хүлээж авдаг тул нэг газраас нийлүүлж бичнэ.
   */
  const [where, setWhere] = useState<string | null>(null);
  const [aoi, setAoi] = useState<__esri.Geometry | null>(null);

  useEffect(() => {
    // view устгагдсаны дараа `view.map` нь null болно — заавал шалгана
    if (!view || view.destroyed || !view.map) return;

    view.map.layers.forEach((l) => {
      if (isInert(l.id) || !('featureEffect' in l)) return;
      const fl = l as FeatureLayer;

      // ⚠️ `visible` шалгахгүй. Нуугдсан давхаргын эффектийг цэвэрлэх боломжтой
      //    байх ёстой — эс бөгөөс модуль сольж буцаж ирэхэд хуучин шүүлт үлдэж,
      //    самбар дээр сонголт байхгүй атал зураг дээр 85% бүдгэрсэн хэвээр байна.
      if (!where && !aoi) {
        fl.featureEffect = null as unknown as __esri.FeatureEffect;
        return;
      }
      if (!fl.visible) return;

      fl.featureEffect = {
        filter: {
          ...(where ? { where } : {}),
          ...(aoi ? { geometry: aoi, spatialRelationship: 'intersects' } : {}),
        },
        // AOI шүүлт — огтлолцоогүйг БҮРЭН нуана. Тодруулга — зөвхөн бүдгэрүүлнэ.
        excludedEffect: aoi ? 'opacity(0%)' : 'opacity(15%) grayscale(80%)',
      } as unknown as __esri.FeatureEffect;
    });
  }, [view, where, aoi]);

  const setHighlight = useCallback((w: string | null) => setWhere(w), []);
  const setAoiFilter = useCallback((g: __esri.Geometry | null) => setAoi(g), []);

  const zoomToLayer = useCallback(async (key: ModuleKey | string, opts?: { withBoundary?: boolean }) => {
    if (!view || view.destroyed || !view.map) return;

    // Давхаргын id-г ЭХЭЛЖ шалгана — модулийн түлхүүрээр хайвал нэг модулийн олон
    // давхаргаас санамсаргүй нэг нь сонгогдоно.
    const target = view.map.layers.find(
      (x) => (x.id === key || OWNER[x.id] === key) && x.visible,
    ) as FeatureLayer | undefined;
    if (!target?.url) return;

    const urls = [target.url];
    if (opts?.withBoundary) urls.push(BOUNDARY.plan.url);

    try {
      const extents = (await Promise.all(urls.map((u) => extentOf(u, view)))).filter(
        (e): e is Extent => e != null,
      );
      if (!extents.length || view.destroyed) return;

      const union = extents.reduce((a, b) => a.union(b));
      view.goTo(union.expand(1.15)).catch(() => {});
    } catch (e) {
      console.error('[selbe] давхаргын хүрээг тодорхойлж чадсангүй:', e);
    }
  }, [view]);

  const api = useMemo<MapApi>(
    () => ({ view, sketchLayer, setHighlight, setAoiFilter, zoomToLayer }),
    [view, sketchLayer, setHighlight, setAoiFilter, zoomToLayer],
  );

  return (
    <RegisterCtx.Provider value={register}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
    </RegisterCtx.Provider>
  );
}

/* ─────────────────── Компонент ─────────────────── */

export function MapCanvas({
  module,
  /** Ерөнхий мэдээлэл / Шугам сүлжээ горимд аль дэд давхарга ил байх */
  sublayers,
  overlays,
  onPick,
  children,
}: {
  module: ModuleKey;
  sublayers?: string[];
  /**
   * НЭМЭЛТ давхаргууд — давхаргын id-ийн жагсаалт (`OVERLAY_LAYERS`-аас).
   * Зөвхөн харагдана: дарж сонгогдохгүй, шүүлтэд оролцохгүй, статистикт нөлөөлөхгүй.
   */
  overlays?: string[];
  /**
   * Дарсан объект. `layerId` нь АЛЬ давхаргаас ирснийг заана — олон дэд давхарга
   * зэрэг ил үед атрибутыг зөв давхаргын талбарын нэрсээр унших ёстой.
   */
  onPick: (attrs: Record<string, unknown> | null, layerId: string | null) => void;
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const sketchRef = useRef<GraphicsLayer | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const [ready, setReady] = useState(false);
  const { theme } = useTheme();
  // View нэг л удаа үүсдэг тул анхны загварын горимыг ref-ээр дамжуулна
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Үүссэн view-гээ MapProvider-т бүртгүүлнэ — хажуугийн багана эндээс ашиглана
  const register = useContext(RegisterCtx);
  const registerRef = useRef(register);
  registerRef.current = register;

  /* Нэг удаа үүсгэнэ */
  useEffect(() => {
    if (!el.current || viewRef.current) return;

    esriConfig.assetsPath = 'https://js.arcgis.com/4.31/@arcgis/core/assets';

    const sketch = new GraphicsLayer({ id: 'sketch', listMode: 'hide' });
    sketchRef.current = sketch;

    const map = new Map({
      basemap: basemapFor(themeRef.current),
      layers: [...buildLayers(), sketch],
    });

    const view = new MapView({
      container: el.current,
      map,
      center: [HOME.lon, HOME.lat],
      zoom: HOME.zoom,
      popupEnabled: false,
      constraints: { rotationEnabled: false },
      ui: { components: ['zoom', 'attribution'] },
    });
    viewRef.current = view;

    view.when(() => {
      setReady(true);
      registerRef.current(view, sketch);

      // Эхлэх хүрээг ТӨЛӨВЛӨЛТИЙН ТАЛБАЙгаар (159.57 га) тааруулна — энэ бол
      // төслийн жинхэнэ хил. Багцын хил нь түүний нэг хэсэг л (33.67 га).
      extentOf(BOUNDARY.plan.url, view)
        .then((e) => {
          if (e && !view.destroyed) view.goTo(e.expand(1.1)).catch(() => {});
        })
        .catch((e) => console.error('[selbe] эхлэх хүрээг тодорхойлж чадсангүй:', e));
    });

    /** Дарж сонгох боломжтой давхаргууд (лавлах хил, зурсан талбайг хасна) */
    const hitLayers = () =>
      view.map.layers.filter((l) => l.visible && !isInert(l.id)).toArray();

    const click = view.on('click', (e) => {
      view
        .hitTest(e, { include: hitLayers() })
        .then((r) => {
          const g = r.results.find((x) => x.type === 'graphic');
          if (g && g.type === 'graphic') {
            pickRef.current(
              g.graphic.attributes as Record<string, unknown>,
              g.graphic.layer?.id ?? null,
            );
          } else {
            pickRef.current(null, null);
          }
        })
        .catch(() => {
          /* view устгагдсан эсвэл давхарга ачаалагдаагүй — сонголт өөрчлөгдөхгүй */
        });
    });

    let busy = false;
    const move = view.on('pointer-move', (e) => {
      if (busy) return;
      busy = true;
      view
        .hitTest(e, { include: hitLayers() })
        .then((r) => {
          // view устгагдсан бол container null болно
          if (!view.destroyed && view.container) {
            view.container.style.cursor = r.results.some((x) => x.type === 'graphic') ? 'pointer' : 'default';
          }
        })
        .catch(() => {
          /* hitTest унасан — заагчийн хэлбэр өөрчлөгдөхгүй */
        })
        // ⚠️ finally — эс бөгөөс нэг унасан hitTest `busy`-г үүрд түгжиж,
        //    хулганы заагчийн эргэх холбоо сессийн турш үхнэ.
        .finally(() => {
          busy = false;
        });
    });

    return () => {
      click.remove();
      move.remove();
      view.destroy();
      viewRef.current = null;
      sketchRef.current = null;
      registerRef.current(null, null);
    };
  }, []);

  /**
   * Загварын горим солигдоход суурь зураг сольж тавина.
   *
   * View үүсэхдээ аль хэдийн зөв суурь зурагтай (`basemapFor(themeRef.current)`)
   * тул `ready` дээр дахин тавьбал ижил зургийг ХОЁР ДАХЬ УДАА татна. Мөн
   * `map.basemap`-д шинээр оноох нь хуучныг устгадаггүй тул горим сольсоор байвал
   * VectorTileLayer хуримтлагдаж, WGL нөөц алдагдана.
   */
  const appliedTheme = useRef(theme);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !view.map || !ready) return;
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;

    const prev = view.map.basemap;
    view.map.basemap = basemapFor(theme);
    // Хуучин суурь зургийг зураг нь шинэчлэгдсэний ДАРАА устгана — шууд устгавал
    // ачаалж дуусаагүй байхад нь тасалж, «Failed to load basemap» алдаа өгнө.
    setTimeout(() => prev?.destroy(), 0);
  }, [theme, ready]);

  /* Идэвхтэй модуль + нэмэлт давхаргууд л харагдана */
  const overlayKey = (overlays ?? []).join(',');
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !view.map || !ready) return;

    const overlaySet = new Set(overlayKey ? overlayKey.split(',') : []);
    OVERLAY_IDS.clear();

    // Портал зарчим: зөвхөн идэвхтэй модулийн давхарга харагдана.
    // Үл хамаарах зүйлс:
    //   · төслийн үндсэн хил — БҮХ горимд байнга ил
    //   · лавлах давхаргууд — REF_IN-д заасан модульд ил
    //   · НЭМЭЛТ давхарга — хэрэглэгч давхцуулж харахаар асаасан (идэвхгүй)
    view.map.layers.forEach((l) => {
      if (l.id === 'sketch') return;

      if (l.id === BOUNDARY_PLAN_ID || l.id === BOUNDARY_SELBE2_ID) {
        l.visible = true;
        return;
      }

      const refIn = REF_IN[l.id];
      if (refIn) {
        l.visible = refIn.includes(module);
        return;
      }

      const owner = OWNER[l.id];

      if (owner === module) {
        // Дэд давхаргатай модуль (ерөнхий мэдээлэл, шугам сүлжээ)
        const sub = l.id.includes(':') ? l.id.split(':')[1] : null;
        l.visible = sub == null || (sublayers?.includes(sub) ?? true);
        l.opacity = 1;
        // Идэвхтэй модуль руу буцаж ирвэл эффект нь цэвэрлэгдэх боломжтой байх ёстой
        return;
      }

      // ЗЭЭЛДСЭН давхарга — өөр модулийн эзэмшилд ч энэ модульд бүрэн эрхтэй
      // харагдана (дарж сонгогдоно, бүдгэрэхгүй). Нэмэлт давхаргаас ялгаатай.
      const borrowedKey = BORROWED[module]?.[l.id];
      if (borrowedKey) {
        l.visible = sublayers?.includes(borrowedKey) ?? false;
        l.opacity = 1;
        return;
      }

      if (overlaySet.has(l.id)) {
        // Нэмэлт давхарга — идэвхтэй модулиас бүдэгхэн.
        // Тодруулга/шүүлтэд ороогүй тул хуучин эффект үлдсэн бол цэвэрлэнэ.
        l.visible = true;
        // Агаарын зураг нь бусад давхаргын ДООР зурагддаг растр суурь — бүдгэрүүлбэл
        // зөвхөн уншигдахаа болино, дарах зүйл нь ч байхгүй. Тиймээс бүрэн тодоор.
        // 0.55 нь агаарын зураг дээр хэт бүдэг байв — нэмэлт давхарга нь идэвхтэй
        // модулиас ялгарах хэрэгтэй ч уншигдахаа болих ёсгүй.
        l.opacity = l.id === IMAGERY_ID ? 1 : 0.8;
        OVERLAY_IDS.add(l.id);
        if ('featureEffect' in l) {
          (l as FeatureLayer).featureEffect = null as unknown as __esri.FeatureEffect;
        }
        return;
      }

      l.visible = false;
    });
  }, [module, sublayers, overlayKey, ready]);

  return (
    <div className={s.wrap}>
      <div ref={el} className={s.view} />
      {!ready && <div className={s.loading}>Газрын зураг ачаалж байна…</div>}

      {/* Төслийн үндсэн хил — бүх горимд ил тул тайлбар нь ч байнга харагдана */}
      {ready && (
        <div className={`${s.float} ${s.floatBL} ${s.legend}`}>
          <div className={s.legendHead}>Төслийн хил</div>
          <div className={s.legendRow}>
            <span className={`${s.dot} ${s.dashLine}`} style={{ borderColor: BOUNDARY_HUE }} />
            {BOUNDARY.plan.title}
          </div>
          <div className={s.legendRow}>
            <span className={`${s.dot} ${s.dotLine}`} style={{ borderColor: BOUNDARY_HUE }} />
            {BOUNDARY.selbe2.title}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
