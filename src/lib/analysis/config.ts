/**
 * АНАЛИЗ — тохиромжтой байдлын загварын тохиргоо.
 *
 * Бүх босго утга, жин, норм ЭНД төвлөрнө; UI-аас жинг динамикаар өөрчилнө.
 * Эх сурвалж: `Suitability_selbe/js/config.js` (vanilla JS хувилбар) — логик нь
 * хэвээр, TypeScript болон порталын давхаргын каталогт холбогдов.
 *
 * ⚠️ Дэд бүтцийн ӨРТГИЙГ энэ модуль өөрөө татахгүй. Хуучин хувилбар 24
 * давхаргын БҮХ объектыг (24,251 замын хэрчим орно) клиент рүү татаж нийлүүлдэг
 * байв. Портал үүнийг `usePlanTotals()`-оор сервер тал дээр `outStatistics`-ээр
 * бодчихсон байдаг тул тэндээс авна — хэдэн зуу дахин хямд бөгөөд хоёр модулийн
 * дүн зөрөх боломжгүй.
 */

import { ZONE_LAYER, BUILT_LAYER, PROJECT_AREA_HA } from '@/lib/services';

export { PROJECT_AREA_HA };

/* ══════════════════ Эх сурвалж ══════════════════ */

/** Талбайн проекц — бүх давхарга UTM 48N (метр). Планар тооцоо шууд метрээр гарна. */
export const WKID = 32648;

/**
 * Загварт хэрэгтэй давхаргууд — порталын каталогийн id-гаар.
 * ⚠️ URL-ыг давхардуулж бичихгүй: `layerUrl()` нь каталогоос угсарна.
 */
export const SRC = {
  zones: ZONE_LAYER.id,     // et:28 — BUS_LAST
  buildings: BUILT_LAYER.id, // et:24 — barilga
  green: 'et:25',            // Ногоон байгууламж
  parkWalk: 'et:26',         // Цэцэрлэгт хүрээлэн, алхалтын бүс
  busStops: 'et:2',
  lrtStops: 'et:1',
} as const;

/** Инженерийн шугам сүлжээ — «хүртээмж»-ийг эдгээр хүртэлх зайгаар хэмжинэ */
export const ENGINEERING_IDS = ['et:18', 'et:23', 'et:17', 'et:16', 'et:10', 'et:7'];

/**
 * Дэд бүтцийн өртгийг тооцохдоо ХАСАХ давхарга.
 * ⚠️ Барилга бол дэд бүтэц биш, БОРЛУУЛАХ хөрөнгө — түүний 7.16 их наяд нь
 * зардлын талд орвол бүх бүс алдагдалтай гарна.
 */
export const COST_EXCLUDE = new Set<string>([BUILT_LAYER.id]);

/* ══════════════════ Газрын зургийн давхарга ══════════════════ */

/**
 * «Давхарга» карт дахь бүлгүүд. Эх `config.js`-ийн `MAP_GROUPS`-тай ижил.
 * ⚠️ Порталын `LAYER_GROUPS`-аас ТУСДАА: анализын бүлэглэлт нь инженерийн
 * системээр (дулаан/ус/цахилгаан) задардаг бөгөөд «Бүс» нь давхарга биш,
 * үнэлгээний үр дүн тул тэнд байхгүй.
 */
export const MAP_GROUPS: Record<string, string> = {
  base: 'Суурь',
  transit: 'Тээвэр, зам',
  heat: 'Дулаан',
  water: 'Ус, ариутгал',
  power: 'Цахилгаан',
  amenity: 'Тохижилт',
  monitor: 'Барилгын хяналт',
};

export type MapLayerKind = 'point' | 'point-lg' | 'line' | 'fill' | 'hatch' | 'building';

export type MapLayerDef = {
  /** Өвөрмөц түлхүүр — ил байдлын төлөв үүгээр хадгалагдана */
  key: string;
  /** `Selbe_ET` доторх давхаргын дугаар */
  n?: number;
  /**
   * ӨӨР үйлчилгээний бүтэн хаяг (порталын каталогийн id).
   * ⚠️ Барилгын хяналтын давхаргууд ХУУЧИН FeatureServer дээр үлдсэн тул
   * `n`-ээр хаяг угсарч болохгүй.
   */
  layerId?: string;
  /**
   * Дотоод `GraphicsLayer` — үйлчилгээнээс ирдэггүй.
   * `zone` = оноон будалт · `label` = бүсийн нэрийн шошго.
   */
  special?: 'zone' | 'label';
  title: string;
  kind: MapLayerKind;
  color: [number, number, number];
  on: boolean;
  group: string;
};

/**
 * ⚠️ Энэ жагсаалт нь ЗУРАГТ гаргаж болох БҮХ давхаргыг агуулна: `Selbe_ET`-ийн
 * 28 давхарга + барилгын хяналтын 2 + дотоод 2 (оноон будалт, шошго). Бүсийн
 * полигон (28) нь `zone` special-ээр орсон тул FeatureLayer хэлбэрээр давхар
 * ордоггүй.
 */
export const MAP_LAYERS: MapLayerDef[] = [
  // --- Суурь ---
  { key: 'zone', special: 'zone', title: 'Бүс — үнэлгээний өнгө', kind: 'fill', color: [79, 209, 197], on: true, group: 'base' },
  { key: 'label', special: 'label', title: 'Бүсийн нэр (шошго)', kind: 'point', color: [230, 237, 243], on: true, group: 'base' },
  { key: 'et:24', n: 24, title: 'Барилга байгууламж', kind: 'building', color: [148, 163, 184], on: true, group: 'base' },

  // --- Тээвэр, зам ---
  { key: 'et:1', n: 1, title: 'LRT / BRT зогсоол', kind: 'point-lg', color: [244, 114, 182], on: true, group: 'transit' },
  { key: 'et:2', n: 2, title: 'Автобусны буудал', kind: 'point', color: [250, 204, 21], on: true, group: 'transit' },
  { key: 'et:6', n: 6, title: 'Автобусны чиглэл', kind: 'line', color: [250, 204, 21], on: false, group: 'transit' },
  { key: 'et:5', n: 5, title: 'Авто зам (тэнхлэг)', kind: 'line', color: [203, 213, 225], on: false, group: 'transit' },
  { key: 'et:29', n: 29, title: 'Авто зам (талбай)', kind: 'fill', color: [148, 163, 184], on: false, group: 'transit' },
  { key: 'et:14', n: 14, title: 'Дугуйн зам', kind: 'line', color: [74, 222, 128], on: false, group: 'transit' },
  { key: 'et:12', n: 12, title: 'Гүүрэн байгууламж', kind: 'line', color: [251, 191, 36], on: false, group: 'transit' },

  // --- Дулаан ---
  { key: 'et:4', n: 4, title: 'Төлөвлөж буй ДХТ', kind: 'point', color: [248, 113, 113], on: false, group: 'heat' },
  { key: 'et:7', n: 7, title: 'Дулаан дамжуулах хуваарилах төв', kind: 'line', color: [251, 146, 60], on: false, group: 'heat' },
  { key: 'et:10', n: 10, title: 'Гадна дулаан — үргэлжилсэн', kind: 'line', color: [248, 113, 113], on: false, group: 'heat' },
  { key: 'et:9', n: 9, title: 'Гадна дулаан — тасархай', kind: 'line', color: [252, 165, 165], on: false, group: 'heat' },
  { key: 'et:11', n: 11, title: 'Гадна дулаан — цэнхэр шугам', kind: 'line', color: [96, 165, 250], on: false, group: 'heat' },
  { key: 'et:8', n: 8, title: 'Гадна дулаан — ногоон шугам', kind: 'line', color: [134, 239, 172], on: false, group: 'heat' },

  // --- Ус, ариутгал ---
  { key: 'et:18', n: 18, title: 'Төлөвлөж буй цэвэр ус', kind: 'line', color: [56, 189, 248], on: false, group: 'water' },
  { key: 'et:23', n: 23, title: 'Цэвэр усны эх үүсвэр өргөтгөл', kind: 'line', color: [14, 165, 233], on: false, group: 'water' },
  { key: 'et:17', n: 17, title: 'Бохирын шугам (орон сууц)', kind: 'line', color: [168, 85, 247], on: false, group: 'water' },
  { key: 'et:16', n: 16, title: 'Одоо байгаа бохир ус', kind: 'line', color: [147, 51, 234], on: false, group: 'water' },
  { key: 'et:3', n: 3, title: 'Бохирын худаг', kind: 'point', color: [192, 132, 252], on: false, group: 'water' },
  { key: 'et:19', n: 19, title: 'Хөрсний ус шүүрүүлэх', kind: 'line', color: [45, 212, 191], on: false, group: 'water' },
  { key: 'et:15', n: 15, title: 'Инженерийн бэлтгэл арга хэмжээ', kind: 'line', color: [125, 211, 252], on: false, group: 'water' },

  // --- Цахилгаан ---
  { key: 'et:21', n: 21, title: '110 кВ агаарын шугам', kind: 'line', color: [217, 70, 239], on: false, group: 'power' },
  { key: 'et:13', n: 13, title: '10 кВ кабель трасс', kind: 'line', color: [192, 132, 252], on: false, group: 'power' },
  { key: 'et:20', n: 20, title: '0.4 кВ кабель трасс', kind: 'line', color: [216, 180, 254], on: false, group: 'power' },
  { key: 'et:22', n: 22, title: 'Цахилгааны шугам', kind: 'line', color: [232, 121, 249], on: false, group: 'power' },

  // --- Тохижилт ---
  { key: 'et:25', n: 25, title: 'Ногоон байгууламж', kind: 'fill', color: [34, 197, 94], on: false, group: 'amenity' },
  { key: 'et:26', n: 26, title: 'Цэцэрлэгт хүрээлэн, алхалтын бүс', kind: 'hatch', color: [132, 204, 22], on: false, group: 'amenity' },
  { key: 'et:27', n: 27, title: 'Явган хүний зам', kind: 'fill', color: [163, 230, 53], on: false, group: 'amenity' },

  // --- Барилгын хяналт (ХУУЧИН үйлчилгээ) ---
  { key: 'mon:building', layerId: 'mon:building', title: 'Барилгын блок (гүйцэтгэл)', kind: 'fill', color: [234, 88, 12], on: false, group: 'monitor' },
  { key: 'mon:survey', layerId: 'mon:survey', title: 'Талбайн хяналтын тайлан', kind: 'point', color: [8, 145, 178], on: false, group: 'monitor' },
];

/* ══════════════════ Өртгийн задаргаа ══════════════════ */

export const COST_GROUPS: Record<string, { label: string; color: string }> = {
  transit: { label: 'Тээвэр, зам', color: '#facc15' },
  heat: { label: 'Дулаан', color: '#f87171' },
  water: { label: 'Ус, ариутгал', color: '#38bdf8' },
  power: { label: 'Цахилгаан', color: '#c084fc' },
  amenity: { label: 'Тохижилт', color: '#4ade80' },
};

/**
 * «Дэд бүтцийн төсөвт өртөг» графикт харуулах давхаргууд.
 *
 * ⚠️ `basis`, `priceField`, `qtyField`-ыг ЭНД дахин бичихгүй: порталын
 * `LAYERS[].cost` аль хэдийн тэдгээрийг агуулдаг бөгөөд `layerTotals()` нь
 * сервер тал дээр нэгж үнээр бүлэглэж бодчихдог. Энд зөвхөн ямар давхарга аль
 * САЛБАРТ хамаарахыг л зааж өгнө.
 */
export const COST_GROUP_OF: Record<string, string> = {
  'et:1': 'transit', 'et:2': 'transit', 'et:5': 'transit',
  'et:12': 'transit', 'et:14': 'transit',
  'et:4': 'heat', 'et:7': 'heat', 'et:8': 'heat', 'et:9': 'heat',
  'et:10': 'heat', 'et:11': 'heat',
  'et:3': 'water', 'et:15': 'water', 'et:16': 'water', 'et:17': 'water',
  'et:18': 'water', 'et:19': 'water', 'et:23': 'water',
  'et:13': 'power', 'et:20': 'power', 'et:21': 'power', 'et:22': 'power',
  'et:25': 'amenity', 'et:26': 'amenity', 'et:27': 'amenity',
};

/**
 * ⚠️ Төслийн нийт талбай (`PROJECT_AREA_HA`, 158 га) нь `lib/services.ts`-д
 * ГАНЦ тодорхойлолттой бөгөөд энэ файлаас дамжин экспортлогдоно (дээр үз).
 * Энд дахин бичвэл толгойн үзүүлэлт ба «1 га-д ногдох төсөв» хоёр чимээгүй
 * зөрөх өдөр ирнэ.
 */

/**
 * 1 м² БАРИГДАХ жишиг өртөг (₮) — барилга угсралтын зардлын анхны таамаг.
 *
 * ⚠️ Энэ нь эх өгөгдлөөс ИРДЭГГҮЙ. ArcGIS дээрх `negj_une` (4.7 сая ₮/м²) нь
 * БОРЛУУЛАЛТЫН үнэ; барилгын өөрийн өртгийн талбар байхгүй. Тиймээс энэ нь
 * хэрэглэгчийн тохируулдаг ТААМАГ бөгөөд UI-д гулсуураар ил гаргана —
 * «өгөгдлөөс уншсан тоо» мэт харуулж болохгүй.
 *
 * ⚠️ Барилгын өртгийг зардалд оруулснаар «1 га-д зарцуулах төсөв» нь
 * дэд бүтэц + барилга ХОЁУЛАНГ агуулна. Урьд нь зөвхөн дэд бүтэц ордог байсан
 * тул ашиг 8.35 их наяд ₮ гэж боломжгүй өндөр гардаг байв.
 */
export const BUILD_COST_PER_M2 = 3_000_000;

/**
 * Нийлмэл үнэлгээний анхны хуваарилалт — «Эдийн засаг»-ийн эзлэх хувь.
 * Хот төлөвлөлт нь үлдсэнийг авна (50/50).
 */
export const DEFAULT_ECON_SHARE = 50;

/* ══════════════════ Оноолт ══════════════════ */

/**
 * НОРМЫН ХАТУУ ГОРИМ.
 *
 * `true` бол нормыг зөрчсөн утга 100 биш, зөвхөн 0..`NORM_FAIL_MAX` хүртэл оноо
 * авна. Ингэснээр нормоос гарсан бүс шууд улаан/улбар шар болж харагдана.
 * Жишээ: нягтшил 499 хүн/га (норм 450) — зөөлөн горимд 80 оноо (ногоон) байсан
 * бол хатуу горимд 35 оноо (улаан).
 */
export const STRICT_NORM = true;

/** Норм зөрчсөн үеийн дээд оноо (45 = «Дунд»-ын босго тул түүнээс доогуур) */
export const NORM_FAIL_MAX = 44;

/**
 * Оноог 5 түвшинд ангилна (сайнаас муу руу).
 * Газрын зураг, бүсийн эрэмбэ, дэлгэрэнгүй самбар БҮГД эдгээр 5 өнгийг л
 * ашиглана — тасралтгүй градиент байхгүй.
 */
export const SCORE_LEVELS = [
  { min: 85, max: 101, label: 'Маш сайн', color: '#16a34a' },
  { min: 65, max: 85, label: 'Сайн', color: '#a3d84a' },
  { min: 45, max: 65, label: 'Дунд', color: '#f59e0b' },
  { min: 25, max: 45, label: 'Муу', color: '#ef4444' },
  { min: 0, max: 25, label: 'Маш муу', color: '#b91c1c' },
] as const;

export const NO_DATA_COLOR = '#94a3b8';

/**
 * Оноо → түвшний индекс (0 = маш сайн). Өгөгдөлгүй бол −1.
 *
 * ⚠️ Дэлгэц дээр оноог БҮХЭЛЧИЛЖ харуулдаг тул ангиллыг МӨН бүхэлчилсэн утгаар
 * тогтооно. Эс тэгвээс 84.6 нь «85» гэж харагдаад «Сайн» бүлэгт орж, 85.2 нь мөн
 * «85» гэж харагдаад «Маш сайн» бүлэгт орох зөрчил үүснэ.
 */
export function levelOf(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return -1;
  const s = Math.round(score);
  return SCORE_LEVELS.findIndex((L) => s >= L.min && s < L.max);
}

/* ══════════════════ БНбД — нягтралын норматив ══════════════════ */

/**
 * БНбД 30-01-24, ХҮСНЭГТ 6.1 — барилгажилтын нягтралын норматив ДЭЭД хязгаар.
 *
 * ⚠️ Зүйл 6.8 нь ӨӨРТЭЙГӨӨ ЗӨРЧИЛДӨНӨ: «Хүснэгт 6.1-д заасан хэмжээнээс ихгүй»
 * гэсний дараа мөн догол мөрөнд «...норматив үзүүлэлтээс багагүй» гэж бичсэн.
 * ТӨСӨЛ хувилбарын засварын алдаа бололтой; мэргэжлийн дүгнэлтээр ДЭЭД ХЯЗГААР
 * гэж авав.
 */
export const DENSITY_BY_TYPE: Record<string, { label: string; farMax: number; bcrMax: number }> = {
  'Орон сууцны бүс': {
    label: 'Олон давхар олон айлын орон сууц (7–16 давхар)',
    farMax: 1.2, bcrMax: 40,
  },
  'Олон нийтийн бүс': {
    label: 'Олон төрлийн (нийгэм, олон нийтийн) барилгажилт',
    farMax: 3.0, bcrMax: 100,
  },
  'Нийгмийн дэд бүтцийн бүс': {
    label: 'Нийгэм, олон нийтийн төрөлжсөн барилгажилт',
    farMax: 2.4, bcrMax: 80,
  },
  // Хүснэгт 6.1-д шууд харгалзах ангилалгүй тул хамгийн ойрын ангиллаар авав
  'Х бүс': {
    label: 'Олон төрлийн (нийгэм, олон нийтийн) барилгажилт',
    farMax: 3.0, bcrMax: 100,
  },
  'Одоо байгаа барилга байгууламж': {
    label: 'Олон давхар олон айлын орон сууц (7–16 давхар)',
    farMax: 1.2, bcrMax: 40,
  },
};

/** Бүсийн төрөлд харгалзах норм (олдохгүй бол орон сууцны хатуу нормыг авна) */
export const densityNormOf = (torol: string | null | undefined) =>
  DENSITY_BY_TYPE[(torol || '').trim()] || DENSITY_BY_TYPE['Орон сууцны бүс'];

/* ══════════════════ Үзүүлэлтүүд ══════════════════ */

export type IndicatorMode = 'band' | 'higher' | 'lower';

/**
 * ҮЗҮҮЛЭЛТИЙН 3 ҮНДСЭН ТӨРӨЛ.
 *
 * Хот төлөвлөлтийн нийлмэл оноо нь эцсийн дүндээ гурван асуултад хариулна:
 * барилгажилт нь зөв нягтралтай юу · хүмүүст үйлчилгээ хүрч байна уу ·
 * инженерийн шугам татагдсан уу. «Үзүүлэлт» таб дээр эдгээрийг дугуй
 * диаграмаар харуулна.
 */
export type CategoryKey = 'urban' | 'social' | 'engineering';

export const CATEGORIES: { key: CategoryKey; label: string; short: string; color: string }[] = [
  { key: 'urban', label: 'Хот төлөвлөлтийн үзүүлэлт', short: 'Хот төлөвлөлт', color: '#60a5fa' },
  { key: 'social', label: 'Нийгмийн дэд бүтэц', short: 'Нийгмийн', color: '#4ade80' },
  { key: 'engineering', label: 'Инженерийн дэд бүтэц', short: 'Инженер', color: '#fbbf24' },
];

export type Indicator = {
  id: string;
  name: string;
  short: string;
  unit: string;
  norm: string;
  mode: IndicatorMode;
  weight: number;
  decimals: number;
  /** Аль үндсэн төрөлд хамаарах вэ */
  cat: CategoryKey;
  hardMin?: number;
  hardMax?: number;
  optMin?: number;
  optMax?: number;
  target?: number;
  best?: number;
  /** Бүсийн TOROL-оос дээд хязгаарыг авах талбар (Хүснэгт 6.1) */
  byType?: 'farMax' | 'bcrMax';
};

/**
 * ⚠️ Жингүүдийн нийлбэр 100 БИШ (108). Загвар нь нийлбэрээр нь нормчилдог тул
 * тооцоо зөв — гэхдээ UI-д эзлэх хувийг нь ЗААВАЛ тооцож харуулна, түүхий жинг
 * «хувь» мэт харуулбал төөрөгдөнө.
 */
export const INDICATORS: Indicator[] = [
  {
    id: 'green',
    cat: 'urban',
    name: 'Нэг хүнд ногдох ногоон байгууламж',
    short: 'Ногоон/хүн',
    unit: 'м²/хүн',
    norm: 'БНбД 30-01-24, Хүснэгт 8.2 — хорооллын ногоон байгууламж 6.0 м²/хүн',
    mode: 'higher',
    weight: 16,
    hardMin: 0,
    // Хүснэгт 8.2: нийслэлд хорооллын 6.0, хотын 10.0 м²/хүн. Ногоон давхарга нь
    // бүс дотоод талбайг хэмждэг тул ХОРООЛЛЫН норм.
    target: 6,
    decimals: 1,
  },
  {
    id: 'density',
    cat: 'urban',
    name: 'Хүн амын нягтшил',
    short: 'Нягтшил',
    unit: 'хүн/га',
    norm: 'БНбД 30-01-24, 6.9 — 4–16 давхар хороолол: 300–450 хүн/га-аас ихгүй',
    mode: 'band',
    weight: 24,
    hardMin: 40, optMin: 300, optMax: 450, hardMax: 700,
    decimals: 0,
  },
  {
    id: 'far',
    cat: 'urban',
    name: 'FAR — Барилгажилтын нягтралын коэффициент',
    short: 'FAR',
    unit: '',
    norm: 'БНбД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар',
    mode: 'lower',
    weight: 19,
    byType: 'farMax',
    best: 1.2, hardMax: 2.4,
    decimals: 2,
  },
  {
    id: 'bcr',
    cat: 'urban',
    name: 'BCR — Барилгажилтын нягтрал',
    short: 'BCR',
    unit: '%',
    norm: 'БНбД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар',
    mode: 'lower',
    weight: 8,
    byType: 'bcrMax',
    best: 40, hardMax: 80,
    decimals: 1,
  },
  {
    id: 'parking',
    cat: 'urban',
    name: 'Зогсоолын хангамж',
    short: 'Зогсоол',
    unit: '%',
    norm: 'БНбД 30-01-24, 10.32 — дахин төлөвлөлтөд өрх бүрд 1.0 зогсоол',
    mode: 'higher',
    weight: 10,
    hardMin: 0, target: 100,
    decimals: 0,
  },
  {
    id: 'transit',
    cat: 'social',
    name: 'Нийтийн тээврийн хүртээмж',
    short: 'Тээвэр',
    unit: 'м',
    norm: 'БНбД 30-01-24, 10.22 — ойрын буудал хүртэл 500 м-ээс ихгүй',
    mode: 'lower',
    weight: 8,
    best: 500, hardMax: 800,
    decimals: 0,
  },
  {
    id: 'park',
    cat: 'urban',
    name: 'Цэцэрлэгт хүрээлэн, алхах бүсийн хамрах хүрээ',
    short: 'Алхалтын бүс',
    unit: '%',
    norm: 'БНбД 30-01-24, Хүснэгт 8.2 — хорооллын хүрээлэн 15 минутын алхалтын хүрээ',
    mode: 'higher',
    weight: 8,
    hardMin: 0, target: 60,
    decimals: 0,
  },
  {
    id: 'social',
    cat: 'social',
    name: 'Нийгмийн дэд бүтцийн хүртээмж',
    short: 'Нийгмийн ДБ',
    unit: '%',
    norm: 'Сургууль, цэцэрлэг, эмнэлгээс 500 м доторх орон сууцны хүн амын хамралт — 100%',
    mode: 'higher',
    weight: 8,
    hardMin: 0, target: 100,
    decimals: 0,
  },
  {
    id: 'engineering',
    cat: 'engineering',
    name: 'Инженерийн дэд бүтцийн хүртээмж',
    short: 'Инженер',
    unit: 'м',
    norm: 'Цэвэр ус, бохир, дулааны шугам хүртэлх зай (батлагдаагүй — таамаг)',
    mode: 'lower',
    weight: 7,
    best: 100, hardMax: 500,
    decimals: 0,
  },
];

/* ══════════════════ Нийгмийн дэд бүтэц ══════════════════ */

/**
 * НИЙГМИЙН ДЭД БҮТЦИЙН ХҮРТЭЭМЖ — 500 м BUFFER, зөвхөн ОРОН СУУЦНЫ хамралт.
 *
 * Байгууламжийг барилгын `Зориулалт_m` талбараас regex-ээр ялгана. Байгууламж
 * бүрээс `BUFFER_M` радиустай хүрээ татаад, бүсийн ОРОН СУУЦНЫ барилгуудын
 * хэдэн хувь нь (хүн амаар жигнэсэн) тэр хүрээнд багтаж байгааг хэмжинэ.
 *
 * ⚠️ Урьд нь 2SFCA (суудлын хүчин чадлыг эрэлтээр хуваарилах) аргаар, төрөл
 * бүрд ӨӨР радиустай (300/500/1000/1500 м) байв. Одоо БҮГД 500 м — «явган хүн
 * 500 м-ээс холгүй явна» гэсэн НЭГ шалгуур. Хүчин чадлыг (суудлын тоо) тооцохоо
 * больсон: `Total_population` нь сургуульд суудлын тоо гэж бичигддэг ч ямар
 * насны хүүхдэд зориулсныг мэдэхгүй тул эрэлттэй харьцуулах нь найдваргүй байв.
 *
 * ⚠️ Хуваарь нь ОРОН СУУЦНЫ хүн ам: үйлчилгээ, оффисын барилгад «сургууль
 * хүртээмжтэй эсэх» утгагүй. Оршин суугчгүй бүсэд утга ГАРАХГҮЙ (өгөгдөлгүй).
 *
 * ⚠️ Цагдаагийн байгууламж хасагдав — 500 м-ийн шалгуурт цагдаагийн хэлтэс
 * оруулах нь хэт хатуу бөгөөд шаардлагад заагаагүй.
 */
export const BUFFER_M = 500;

export type SocialFacility = {
  key: string;
  label: string;
  re: RegExp;
  radius: number;
  weight: number;
};

export const SOCIAL_FACILITIES: SocialFacility[] = [
  { key: 'kinder', label: 'Цэцэрлэг', re: /цэцэрлэг/i, radius: BUFFER_M, weight: 34 },
  { key: 'school', label: 'Сургууль', re: /сургууль/i, radius: BUFFER_M, weight: 33 },
  { key: 'clinic', label: 'Эмнэлэг', re: /эмнэлэг/i, radius: BUFFER_M, weight: 33 },
];

/* ══════════════════ Зогсоол ══════════════════ */

/**
 * Хангамж = бүсийн `ET_NIIT` (ил + далд). Хэрэгцээг 3 аргаар тооцож харьцуулна.
 *
 * ⚠️ Анхдагч нь `households`: БНбД 30-01-24, 10.32 «Дахин төлөвлөлтөнд ... орон
 * сууцны өрх бүрд 1.0 машинаар тооцож төлөвлөнө». Сэлбэ бол дахин төлөвлөлтийн
 * төсөл тул энэ нь баримт бичгээр батлагдсан арга. (Эх өгөгдлийн `NORM_ZOGS` нь
 * өрхөд ≈0.75 гэсэн өөр таамаг дээр тогтдог.)
 */
export type ParkingSource = 'norm' | 'households' | 'population';

export type ParkingOpt = {
  source: ParkingSource;
  perHousehold: number;
  per1000: number;
};

export const PARKING: ParkingOpt = {
  source: 'households',
  perHousehold: 1.0,
  per1000: 300,
};

export const PARKING_SOURCES: { key: ParkingSource; label: string; short: string }[] = [
  { key: 'norm', label: 'Эх өгөгдлийн норм (NORM_ZOGS)', short: 'NORM_ZOGS' },
  { key: 'households', label: 'Өрхийн тоогоор (өрх × коэф.)', short: 'өрхөөр' },
  { key: 'population', label: 'Хүн амаар (1000 хүнд ногдохоор)', short: 'хүн амаар' },
];

/* ══════════════════ Ногоон байгууламж ══════════════════ */

/** `Layer` талбарын ангилал — аль нь «хүнд ногдох»-д тоологдох вэ */
export const GREEN_CATEGORIES = [
  { key: 'Нийтийн хэрэгцээний ногоон байгууламж', short: 'Нийтийн хэрэгцээний', default: true },
  { key: 'Хязгаарлагдмал хэрэгцээт ногоон байгууламж', short: 'Хязгаарлагдмал хэрэгцээт', default: true },
  { key: 'Тусгай хэрэгцээний ногоон байгууламж', short: 'Тусгай хэрэгцээний', default: false },
];

/* ══════════════════ Эдийн засаг ══════════════════ */

/**
 * ЭДИЙН ЗАСГИЙН ОНОО — дэд бүтцийн зардал борлуулалтын үнэлгээний хэдэн хувийг
 * эзэлж байгаагаар. Бага байх тусам ашигтай. 100% = зардал орлоготойгоо тэнцэж,
 * ашиг тэглэсэн (break-even) тул тэнд оноо 0 болно.
 */
/**
 * ЭДИЙН ЗАСГИЙН ОНОО — АШГААР.
 *
 * Хэмжигдэхүүн нь **ашгийн маржа** = ашиг ÷ борлуулалтын орлого × 100. Абсолют
 * ашгаар биш маржаар бодох нь чухал: 200 тэрбум ашигтай том бүс, 20 тэрбум
 * ашигтай жижиг бүс хоёр ижил үр ашигтай байж болно.
 *
 * 5 түвшин нь `SCORE_LEVELS`-ийн хилтэй ЯГ таарна:
 *
 * | Маржа | Оноо | Түвшин |
 * |---|---|---|
 * | ≤ −60% | 0 | Маш муу — өндөр алдагдалтай |
 * | −30% | 25 | Муу — алдагдалтай (ашиггүй) |
 * | −10% … +10% | 45–65 | Дунд — тэнцүү (balance) |
 * | +30% | 85 | Сайн — ашигтай |
 * | ≥ +60% | 100 | Маш сайн — өндөр ашигтай |
 *
 * ⚠️ Урьд нь ЗАРДЛЫН ЭЗЛЭХ ХУВИАР (≤20% = 100 оноо) бодож байв. Барилгын өртөг
 * зардалд орсны дараа бүх бүсийн зардал орлогынхоо 70%+ болсон тул бараг бүгд
 * 0 оноо авч, эдийн засгийн тэнхлэг ялгах чадвараа алдсан. Ашгийн маржа нь
 * тэнцүү цэгийг (0%) дунд түвшинд байрлуулж, хоёр тийш нь тэнцвэртэй задарна.
 */
export const PROFIT_BANDS: { margin: number; score: number }[] = [
  { margin: -60, score: 0 },
  { margin: -30, score: 25 },
  { margin: -10, score: 45 },
  { margin: 10, score: 65 },
  { margin: 30, score: 85 },
  { margin: 60, score: 100 },
];

/**
 * Ашгийн маржа (%) → 0..100 оноо, хэсэгчилсэн шугаман.
 * `-Infinity` (орлогогүй мөртлөө зардалтай) → 0. `null` → өгөгдөлгүй.
 */
export function profitScore(margin: number | null | undefined): number | null {
  if (margin == null) return null;
  // ⚠️ Орлогогүй бүс нь «өгөгдөлгүй» БИШ, цэвэр алдагдал → хамгийн муу оноо
  if (margin === -Infinity) return 0;
  if (!Number.isFinite(margin)) return null;

  const first = PROFIT_BANDS[0], last = PROFIT_BANDS[PROFIT_BANDS.length - 1];
  if (margin <= first.margin) return first.score;
  if (margin >= last.margin) return last.score;

  for (let i = 1; i < PROFIT_BANDS.length; i++) {
    const a = PROFIT_BANDS[i - 1], b = PROFIT_BANDS[i];
    if (margin <= b.margin) {
      const t = (margin - a.margin) / (b.margin - a.margin);
      return a.score + t * (b.score - a.score);
    }
  }
  return last.score;
}

/** Ашгийн байдлыг үгээр — эрэмбэ, дэлгэрэнгүйд */
export function profitLabel(margin: number | null | undefined): string {
  if (margin == null) return 'Өгөгдөлгүй';
  if (margin === -Infinity) return 'Өндөр алдагдалтай';
  if (!Number.isFinite(margin)) return 'Өгөгдөлгүй';
  if (margin <= -30) return 'Өндөр алдагдалтай';
  if (margin < -10) return 'Алдагдалтай';
  if (margin <= 10) return 'Тэнцүү (balance)';
  if (margin < 30) return 'Ашигтай';
  return 'Өндөр ашигтай';
}

export const ECON_SCORE: Indicator = {
  id: 'econ',
  // ⚠️ `cat` нь зөвхөн ХОТ ТӨЛӨВЛӨЛТИЙН 3 бүлэгт хамаарна. Эдийн засгийн оноо нь
  //    тэр нийлбэрт ОРДОГГҮЙ (тусдаа тэнхлэг) тул утга нь ач холбогдолгүй.
  cat: 'urban',
  name: 'Ашигт байдал (зардлын эзлэх хувь)',
  short: 'Ашигт байдал',
  unit: '%',
  norm: 'Дэд бүтцийн зардал борлуулалтын үнэлгээний ≤20% байвал норм хангасан',
  mode: 'lower',
  weight: 0,
  best: 20, hardMax: 100,
  decimals: 1,
};

/** Барилгын талбарууд — кирилл тул тогтмолоор */
export const BF = {
  gfa: 'Барилгын_нийт_талбай_m2',
  usable: 'Барилгажсан_талбай',
  purpose: 'Зориулалт_m',
  price: 'negj_une',
  status: 'Barilga_ty',
  population: 'Total_population',
  households: 'Urhiin_too',
} as const;

/**
 * ОРШИН СУУХ зориулалт эсэх.
 *
 * ⚠️ `Total_population` нь орон сууцны барилгад ОРШИН СУУГЧ, бусад барилгад
 * ХҮЧИН ЧАДАЛ-ыг заана. Баталгаа: орон сууцны 43,287 хүн / 12,381 өрх = яг 3.50
 * хүн/өрх; бусад 25,039 «хүн» дээр өрх 0 бөгөөд «Сургууль 960 хүүхэд» × 4
 * барилга = 3,840 гэж яг таарна.
 *
 * Тиймээс нягтшил ба нэг хүнд ногдох ногоон байгууламжийг ЗӨВХӨН оршин суугчаар
 * бодно — эс тэгвээс нягтшил 58%-иар хөөрөгдөж, орон сууцандаа тоологдсон
 * хүүхдийг сургууль дээр нь давхар тооцно.
 */
export const isResidential = (purpose: unknown) =>
  /орон сууц|house/i.test(String(purpose ?? '').trim());

/**
 * БОРЛУУЛАХ БОЛОМЖТОЙ эсэх.
 * ⚠️ «Одоо байгаа» барилга аль хэдийн зарагдсан/ашиглалтад орсон тул төслийн
 * ирээдүйн орлогод тооцохгүй. Хот төлөвлөлтийн үзүүлэлт (нягтшил, хүн ам,
 * зогсоол…) энэ шүүлтээс ХАМААРАХГҮЙ — тэнд бүх барилга хэвээр тооцогдоно.
 */
export const isSellable = (status: unknown) =>
  !/^одоо байгаа/i.test(String(status ?? '').trim());
