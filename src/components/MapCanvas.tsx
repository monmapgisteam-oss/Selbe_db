'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  BAGTS, ZONE, BUILDING, PARCEL, CADASTRE, VALUATION, GENERAL, UTILITY, SURVEY, HOME, BASEMAP,
  BOUNDARY, BOUNDARY_HUE, PROGRESS_LEVELS, PARCEL_STATUS, MODULES,
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
   * `withBoundary` — төслийн хилийг ч багтаана (өгөгдөл хилээс гадуур байвал
   * хоёуланг нь нэг дор харуулна).
   */
  zoomToLayer: (key: ModuleKey, opts?: { withBoundary?: boolean }) => void;
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
const FILL_ALPHA = 0.2;

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
const denseFill = (hex: string, a = FILL_ALPHA, w = 0.5) =>
  ({
    type: 'simple-fill',
    color: c(hex, a),
    outline: { color: c(hex, 0.85), width: w },
  }) as const;

const line = (hex: string, w = 1.6) =>
  ({ type: 'simple-line', color: c(hex), width: w }) as const;

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
 * Багцын хил — ЛАВЛАХ давхарга (дүүргэлтгүй, зөвхөн зураас).
 * Өөр модулийн өгөгдлийг байрлуулж харахад чиг баримжаа болно.
 */
const REF_OUTLINE = (hex: string) =>
  ({
    type: 'cim',
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMPolygonSymbol',
        symbolLayers: [
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: 1.6,
            color: cim(hex, 0.9),
          },
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: 6,
            color: cim(hex, 0.22),
          },
        ],
      },
    },
  }) as const;


/**
 * Тооцоолуурын хоёр давхаргыг ялгах өнгө.
 * Нэгж талбар — модулийн өнгө (ногоовтор). Барилга — тодорхой ялгаатай ягаан.
 */
export const ESTIMATOR_BUILDING_HUE = '#6366f1';

/**
 * Төслийн үндсэн хилийн симбол — дүүргэлтгүй, тасархай/цэгэн зураас.
 * Аль ч модулийн өгөгдлийг дарахгүй, зөвхөн хүрээ болно.
 */
const boundaryLine = (style: 'dash' | 'dot') =>
  ({
    type: 'simple-fill',
    color: [0, 0, 0, 0], // дүүргэлтгүй
    outline: { color: c(BOUNDARY_HUE, 0.95), width: style === 'dash' ? 2.2 : 1.8, style },
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

/** Лавлах давхаргын id — модулийн эзэмшилд ороогүй, тусдаа удирдана */
const REF_BAGTS = 'ref:bagts';
const REF_BUILDING = 'ref:building';

/**
 * Лавлах давхарга → аль модульд харагдах.
 *
 * Тухайн модулийн өгөгдлийг байрлуулж харахад чиг баримжаа болно. Эдгээр нь
 * ЗӨВХӨН зураас — дарж сонгогдохгүй, шүүлтэд оролцохгүй.
 * Шинэ модульд лавлах давхарга нэмэх бол зөвхөн энэ хүснэгтийг засна.
 */
const REF_IN: Record<string, ModuleKey[]> = {
  [REF_BAGTS]: ['building', 'survey'],
  [REF_BUILDING]: ['survey'],
};

/**
 * Модулийн эзэмшилд ороогүй туслах давхаргууд.
 * Эдгээр нь: дарж сонгогдохгүй, тодруулга/орон зайн шүүлтэд оролцохгүй.
 */
const PASSIVE_IDS = new Set([
  'sketch',
  BOUNDARY_PLAN_ID,
  BOUNDARY_SELBE2_ID,
  REF_BAGTS,
  REF_BUILDING,
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
 */
export type OverlayLayer = { id: string; title: string; hue: string; module: ModuleKey };

export const OVERLAY_LAYERS: OverlayLayer[] = [
  ...(Object.keys(GENERAL) as GeneralKey[]).map((k) => ({
    id: `general:${k}`,
    title: GENERAL[k].title,
    hue: GENERAL[k].hue,
    module: 'general' as ModuleKey,
  })),
  { id: 'bagts', title: 'Багцын хил', hue: hueOf('bagts'), module: 'bagts' },
  { id: 'zone', title: 'Хот төлөвлөлтийн бүс', hue: hueOf('zone'), module: 'zone' },
  { id: 'building', title: 'Барилгын явц', hue: hueOf('building'), module: 'building' },
  { id: 'parcel', title: 'Үлдсэн нэгж талбар', hue: hueOf('parcel'), module: 'parcel' },
  { id: 'estimator', title: 'Кадастрын нэгж талбар', hue: hueOf('estimator'), module: 'estimator' },
  { id: 'estimatorB', title: 'Барилга (үнэлгээтэй)', hue: ESTIMATOR_BUILDING_HUE, module: 'estimator' },
  ...(Object.keys(UTILITY) as UtilKey[]).map((k) => ({
    id: `utility:${k}`,
    title: UTILITY[k].title,
    hue: UTILITY[k].hue,
    module: 'utility' as ModuleKey,
  })),
  { id: 'survey', title: 'Талбайн хяналтын тайлан', hue: hueOf('survey'), module: 'survey' },
];

function buildLayers(): FeatureLayer[] {
  const L: FeatureLayer[] = [];

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

  // 1 · Багцын хил — төслийн үндсэн хүрээ
  L.push(new FeatureLayer({
    id: own('bagts', 'bagts'),
    url: BAGTS.url,
    outFields: ['*'],
    popupEnabled: false,
    renderer: simple(fill(hueOf('bagts'), FILL_ALPHA, 2)),
    labelingInfo: labels(hueOf('bagts'), `$feature.${BAGTS.fields.name}`),
  }));

  // 1б · ЛАВЛАХ давхаргууд — дүүргэлтгүй, зөвхөн зураас. REF_IN-д заасан модульд
  //      чиг баримжаа болгож харагдана. Дарж сонгох, шүүх боломжгүй.
  L.push(new FeatureLayer({
    id: REF_BAGTS,
    url: BAGTS.url,
    title: 'Багцын хил (лавлах)',
    outFields: [BAGTS.fields.name],
    popupEnabled: false,
    visible: false,
    legendEnabled: false,
    renderer: simple(REF_OUTLINE(hueOf('bagts'))),
    labelingInfo: labels(hueOf('bagts'), `$feature.${BAGTS.fields.name}`),
  }));

  L.push(new FeatureLayer({
    id: REF_BUILDING,
    url: BUILDING.url,
    title: 'Барилга (лавлах)',
    outFields: [BUILDING.fields.block, BUILDING.fields.bagts],
    popupEnabled: false,
    visible: false,
    legendEnabled: false,
    renderer: simple(REF_OUTLINE(hueOf('building'))),
  }));

  // 2 · Бүсчлэл — бүсийн код (B-2.1…), хоосон бол зориулалтаар нь нэрлэнэ
  L.push(new FeatureLayer({
    id: own('zone', 'zone'),
    url: ZONE.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: simple(fill(hueOf('zone'))),
    labelingInfo: labels(
      hueOf('zone'),
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
      defaultSymbol: fill('#94a3b8'),
      defaultLabel: 'Мэдээлэлгүй',
      // ⚠️ ArcGIS-ийн classBreak нь minValue/maxValue ХОЁУЛАНГ нь оруулж тоолдог.
      //    Самбарын тоолол ба SQL шүүлт нь `>= min AND < max` (хагас нээлттэй) тул
      //    яг 25/50/75 дээр байгаа блок зураг дээр НЭГ ангиар, самбарт ӨӨР ангиар
      //    гарах болно. Тиймээс дээд хязгаарыг багасгаж, хоёуланг нь тааруулав.
      classBreakInfos: PROGRESS_LEVELS.map((l) => ({
        minValue: l.min,
        maxValue: l.max - 0.0001,
        label: `${l.label} (${l.range})`,
        symbol: fill(l.color),
      })),
    } as __esri.RendererProperties,
  }));

  // 4 · Үлдсэн нэгж талбар — чөлөөлөлтийн явцаар өнгө
  L.push(new FeatureLayer({
    id: own('parcel', 'parcel'),
    url: PARCEL.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: {
      type: 'unique-value',
      field: PARCEL.fields.status,
      defaultSymbol: fill('#94a3b8'),
      defaultLabel: 'Бүртгэгдээгүй',
      uniqueValueInfos: Object.entries(PARCEL_STATUS).map(([value, color]) => ({
        value, label: value, symbol: fill(color),
      })),
    } as __esri.RendererProperties,
  }));

  // 5 · Үнэ тооцоолуур — ХОЁР давхарга зэрэг: кадастрын нэгж талбар (43,041) ба
  //     барилгын үнэлгээ (36,586). Хоёулаа зөвхөн ойртоход зурагдана — эс бөгөөс
  //     жижиг масштабт 80 мянган полигон зурах болно.
  //     Барилга нь талбарын ДЭЭР зурагдана (жагсаалтад сүүлд нэмнэ).
  L.push(new FeatureLayer({
    id: own('estimator', 'estimator'),
    url: CADASTRE.url,
    title: 'Нэгж талбар',
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    minScale: 40000,
    renderer: simple(denseFill(hueOf('estimator'))),
  }));

  L.push(new FeatureLayer({
    id: own('estimatorB', 'estimator'),
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
      renderer: simple(fill(g.hue)),
    }));
  }

  // 7 · Шугам сүлжээ ба зам
  for (const [k, u] of Object.entries(UTILITY) as [UtilKey, (typeof UTILITY)[UtilKey]][]) {
    L.push(new FeatureLayer({
      id: own(`utility:${k}`, 'utility'),
      url: u.url,
      outFields: ['*'],
      popupEnabled: false,
      visible: false,
      renderer: simple(u.kind === 'line' ? line(u.hue, 1.8) : fill(u.hue)),
    }));
  }

  // 8 · Талбайн хяналт — Survey123-ийн цэгүүд
  L.push(new FeatureLayer({
    id: own('survey', 'survey'),
    url: SURVEY.url,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    renderer: simple({
      type: 'simple-marker',
      style: 'circle',
      size: 13,
      color: c(hueOf('survey'), 0.9),
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

  const zoomToLayer = useCallback(async (key: ModuleKey, opts?: { withBoundary?: boolean }) => {
    if (!view || view.destroyed || !view.map) return;

    const target = view.map.layers.find((x) => OWNER[x.id] === key && x.visible) as FeatureLayer | undefined;
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

      if (overlaySet.has(l.id)) {
        // Нэмэлт давхарга — идэвхтэй модулиас бүдэгхэн.
        // Тодруулга/шүүлтэд ороогүй тул хуучин эффект үлдсэн бол цэвэрлэнэ.
        l.visible = true;
        l.opacity = 0.55;
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
