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

import {
  ZONE_LAYER, BUILT_LAYER, PROJECT_AREA_HA,
  LAYER_BY_ID, LAYER_GROUPS, PLAN_LAYER_IDS, MONITOR_LAYER_IDS, MONITOR_GROUP, groupOf,
  type LayerDef,
} from '@/lib/services';

export { PROJECT_AREA_HA };

/* ══════════════════ Эх сурвалж ══════════════════ */

/** Талбайн проекц — бүх давхарга UTM 48N (метр). Планар тооцоо шууд метрээр гарна. */
export const WKID = 32648;

/**
 * Загварт хэрэгтэй давхаргууд — порталын каталогийн id-гаар.
 * ⚠️ URL-ыг давхардуулж бичихгүй: `layerUrl()` нь каталогоос угсарна.
 */
export const SRC = {
  zones: ZONE_LAYER.id,      // zone — busiin_medeelel_final
  buildings: BUILT_LAYER.id, // et:24 — barilga
  green: 'nogoon',           // Ногоон байгууламж (nogoon_baiguulamj/0 — бүсээр огтлолцуулсан)
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
 * «Давхарга» карт дахь бүлгүүд — «Ерөнхий төлөвлөгөө»-тэй ИЖИЛ бүлэглэл.
 *
 * ⚠️ Урьд нь анализ өөрийн (дулаан/ус/цахилгаан) бүлэгтэй, зөвхөн 44 давхарга
 * харуулдаг байв. Одоо порталын `LAYER_GROUPS`-ийг ашиглаж, plan-тай ижил бүх
 * давхаргыг (~84) харуулна — `MAP_LAYERS` доор `LAYER_BY_ID`-аас автоматаар
 * үүснэ. Бүсийн ОНООНЫ будалт, барилгын тунгалагшилт, шошго нь ТУСГАЙ хэвээр.
 */
export const MAP_GROUPS: Record<string, string> = {
  ...Object.fromEntries(LAYER_GROUPS.map((g) => [g.key, g.title])),
  [MONITOR_GROUP.key]: MONITOR_GROUP.title,
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
 * ЗУРАГТ гаргах БҮХ давхарга — «Ерөнхий төлөвлөгөө»-тэй ИЖИЛ бүрэн жагсаалт.
 *
 * ⚠️ ГУРВАН ТУСГАЙ давхарга нь Suitability-ийн ЦӨМ бөгөөд `SuitMap` тэдгээрийг
 * ОНЦГОЙ зурдаг — ГАРААР үлдээв, автоматаар үүсгэхгүй:
 *   · `zone`  — бүсийн ОНООНЫ будалт (GraphicsLayer, `colorOf`, alpha, сонголт)
 *   · `label` — бүсийн нэрийн шошго (GraphicsLayer, 2D/3D өөр symbol)
 *   · `et:24` — барилга, 0.3 ТУНГАЛАГ (доорх онооны өнгө нэвт харагдана)
 *
 * ⚠️ Бусад БҮХ context давхарга нь порталын `LAYERS`-аас (`LAYER_BY_ID`)
 * АВТОМАТААР үүснэ — plan-д шинэ давхарга (жишээ «Сэлбэ 1/2 хил») нэмэхэд
 * Suitability дагаж шинэчлэгдэнэ. `MAP_LAYERS`-ийг ЗӨВХӨН газрын зургийн context
 * ба каталог уншдаг (score/cost тооцоо энэнээс хамаардаггүй — `SuitMap`,
 * `SuitLayerCatalog`, `layerOn` гурав л).
 */

/** «#rrggbb» / «#rgb» → [r, g, b] */
const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
};
/** Порталын геометр → анализын зурах төрөл */
const kindOf = (geom: LayerDef['geom']): MapLayerKind =>
  geom === 'line' ? 'line' : geom === 'point' ? 'point' : 'fill';

/**
 * SuitMap-д ОНЦГОЙ зурагддаг гурван давхарга — автоматаар үүсгэхгүй, гараар.
 * (`zone`/`et:24` нь порталын каталогт ч байдаг тул доорх derived-ээс ХАСНА.)
 */
const SPECIAL_LAYERS: MapLayerDef[] = [
  { key: 'zone', special: 'zone', title: 'Бүсийн үнэлгээ', kind: 'fill', color: [79, 209, 197], on: true, group: 'zone' },
  { key: 'label', special: 'label', title: 'Бүсийн нэр', kind: 'point', color: [230, 237, 243], on: true, group: 'zone' },
  { key: 'et:24', n: 24, title: 'Барилга байгууламж', kind: 'building', color: [148, 163, 184], on: true, group: 'build' },
];
const SPECIAL_KEYS = new Set(SPECIAL_LAYERS.map((s) => s.key));

/** Порталын каталогийн бүх давхарга (тусгайг хасаад) → context давхарга */
const DERIVED_LAYERS: MapLayerDef[] = [...PLAN_LAYER_IDS, ...MONITOR_LAYER_IDS]
  .filter((id) => !SPECIAL_KEYS.has(id) && LAYER_BY_ID[id])
  .map((id) => {
    const d = LAYER_BY_ID[id];
    return {
      key: id,
      // ⚠️ `layerId` → `SuitMap` нь `layerUrl(LAYER_BY_ID[id])`-ээр бүтэн хаяг
      //    авна (хил зэрэг ӨӨР org дээрх давхаргад ч зөв ажиллана).
      layerId: id,
      title: d.title,
      kind: kindOf(d.geom),
      color: hexRgb(d.hue),
      on: false,
      group: groupOf(id) ?? MONITOR_GROUP.key,
    } as MapLayerDef;
  });

/**
 * «АЧААЛАЛ БУУРУУЛАХ ШИНЭ ЗАМ» — `Selbe_shine_zam` service-ийн 4 давхарга.
 *
 * ⚠️ `PLAN_LAYER_IDS`-д БАЙХГҮЙ (батлагдаагүй санал тул ерөнхий төлөвлөгөөний
 * каталог/нийлбэрт орохгүй) — тиймээс `DERIVED_LAYERS`-ээс ирэхгүй, гараар
 * нэмэв. «Ачаалал» табд «Шинэ зам» сонгоход АВТОМАТААР асна
 * (`Suitability.tsx`), мөн давхаргын цэснээс гараар ч асааж болно.
 */
export const RELIEF_LAYERS: MapLayerDef[] = ['sz:0', 'sz:1', 'sz:2', 'sz:3'].map((id) => ({
  key: id,
  layerId: id,
  title: LAYER_BY_ID[id]?.title ?? id,
  kind: 'line' as MapLayerKind,
  color: [74, 222, 128],
  on: false,
  group: 'road',
}));

/** «Шинэ зам»-ын давхаргын түлхүүрүүд — сонгоход автоматаар асаах жагсаалт */
export const RELIEF_LAYER_KEYS: string[] = RELIEF_LAYERS.map((l) => l.key);

export const MAP_LAYERS: MapLayerDef[] = [...SPECIAL_LAYERS, ...DERIVED_LAYERS, ...RELIEF_LAYERS];

/**
 * Барилгын төлөв (`Barilga_ty`) → өнгө. `SuitMap`-ийн renderer ба давхаргын
 * каталогийн legend ХОЁУЛАА үүнийг уншина — газрын зураг дээрх өнгө ба цэсэн
 * дэх задаргаа ижил байлгах ганц эх сурвалж. Дараалал: одоо байгаа → баригдаж
 * байгаа → төлөвлөсөн (цаг хугацааны дэс дараалал).
 */
export const BUILDING_STATUS_COLORS: Record<string, [number, number, number]> = {
  'Одоо байгаа': [134, 139, 150],
  'Баригдаж байгаа': [251, 146, 60],
  'Төлөвлөсөн': [96, 165, 250],
};

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
/**
 * ⚠️ «Дугуйн зам» (`dugui`) ба «Ногоон байгууламж» (`nogoon`) ЭНД БАЙХГҮЙ —
 * 2026-07-31-ний шинэ үйлчилгээнүүдэд `negj_une` талбар огт байхгүй тул
 * `cost`-гүй болж, өртгийн графикаас гарсан (өмнө нь transit/amenity-д байв).
 */
export const COST_GROUP_OF: Record<string, string> = {
  'et:1': 'transit', 'et:2': 'transit', 'et:5': 'transit',
  'et:12': 'transit',
  'et:4': 'heat', 'et:7': 'heat', 'et:8': 'heat', 'et:9': 'heat',
  'et:10': 'heat', 'et:11': 'heat',
  'et:3': 'water', 'et:15': 'water', 'et:16': 'water', 'et:17': 'water',
  'et:18': 'water', 'et:19': 'water', 'et:23': 'water',
  'et:124': 'power', 'et:125': 'power', 'et:126': 'power', 'et:127': 'power',
  'et:26': 'amenity', 'et:27': 'amenity',
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
  // ⚠️ Доод хоёр түвшний өнгө ЗӨӨЛРҮҮЛСЭН: улбар шар → ШАР, улаан → УЛБАР ШАР.
  //    Оноо багатай бүс «анхаарал шаардсан» гэж уншигдах ёстой болохоос
  //    «муу/аюултай» гэсэн сэтгэгдэл төрүүлэх ёсгүй.
  { min: 45, max: 65, label: 'Дунд', color: '#facc15' },
  { min: 25, max: 45, label: 'Муу', color: '#f59e0b' },
  { min: 0, max: 25, label: 'Маш муу', color: '#b91c1c' },
] as const;

export const NO_DATA_COLOR = '#94a3b8';

/**
 * ОНООЛОЛД ОРОХГҮЙ бүсийн ангиллууд (каноник нэр, `zoneType()`-ийн гаралт).
 *
 * ⚠️ Ногоон байгууламж, нийгмийн дэд бүтэц, одоо байгаа барилга, газар
 * чөлөөлөлт дутуу нь «тохиромжтой байдал»-ын үнэлгээнд утгагүй (хүн ам,
 * FAR/BCR, зогсоол зэрэг үзүүлэлт хамаарахгүй) тул тооцоо, эрэмбэ,
 * дундажаас ХАСНА. Газрын зурагт
 * устгахгүй — «өгөгдөлгүй» цайвар өнгөөр, hover панельгүй харагдана.
 */
export const EXCLUDED_ZONE_TYPES = new Set<string>([
  'Ногоон байгууламж, тохижилт',
  'Нийгмийн дэд бүтцийн бүс',
  'Одоо байгаа барилга байгууламж',
  'Дэд бүтэц',
  'Газар чөлөөлөлт дутуу',
]);

/**
 * ХАСАГДСАН боловч «Бүсийн ангилал» картаас ГАРААР идэвхжүүлж болох ангиллууд.
 *
 * ⚠️ Эдгээрийг сонговол оноолол ДАХИН тооцогдож, газрын зурагт будагдана —
 * сонгохгүй бол бусад хасагдсан ангиллын адил цайвар (өгөгдөлгүй) хэвээр.
 * `EXCLUDED_ZONE_TYPES`-ийн ДЭД ОЛОНЛОГ байх ёстой.
 */
export const ACTIVATABLE_ZONE_TYPES = new Set<string>([
  'Нийгмийн дэд бүтцийн бүс',
  'Газар чөлөөлөлт дутуу',
]);

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

/* ══════════════════ БНБД — нягтралын норматив ══════════════════ */

/**
 * БНБД 30-01-24, ХҮСНЭГТ 6.1 — барилгажилтын нягтралын норматив ДЭЭД хязгаар.
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
 * ⚠️ Загвар нь жингүүдийг НИЙЛБЭРЭЭР нь нормчилдог тул нийлбэр яг 100 байх
 * шаардлагагүй — гэхдээ UI-д эзлэх хувийг нь ЗААВАЛ тооцож харуулна, түүхий
 * жинг «хувь» мэт харуулбал төөрөгдөнө.
 */
export const INDICATORS: Indicator[] = [
  {
    id: 'green',
    cat: 'urban',
    name: 'Нэг хүнд ногдох ногоон байгууламж',
    short: 'Ногоон талбай',
    unit: 'м²/хүн',
    norm: 'БНБД 30-01-24, Хүснэгт 8.2 — хорооллын ногоон байгууламж 6.0 м²/хүн',
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
    norm: 'БНБД 30-01-24, 6.9 — 4–16 давхар хороолол: 300–450 хүн/га-аас ихгүй',
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
    norm: 'БНБД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар',
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
    norm: 'БНБД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар',
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
    norm: 'БНБД 30-01-24, 10.32 — дахин төлөвлөлтөд өрх бүрд 1.0 зогсоол',
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
    norm: 'БНБД 30-01-24, 10.22 — ойрын буудал хүртэл 500 м-ээс ихгүй',
    mode: 'lower',
    weight: 8,
    best: 500, hardMax: 800,
    decimals: 0,
  },
  {
    id: 'social',
    cat: 'social',
    name: 'Нийгмийн дэд бүтцийн хүртээмж',
    short: 'Нийгмийн үйлчилгээ',
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
 * ⚠️ Анхдагч нь `households`: БНБД 30-01-24, 10.32 «Дахин төлөвлөлтөнд ... орон
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
  { key: 'norm', label: 'Нормд заасан зогсоолын тоо', short: 'Норм' },
  { key: 'households', label: 'Өрхийн тоогоор (өрх × коэф.)', short: 'өрхөөр' },
  { key: 'population', label: 'Хүн амаар (1000 хүнд ногдохоор)', short: 'хүн амаар' },
];

/* ══════════════════ Ногоон байгууламж ══════════════════ */

/**
 * Ногоон байгууламжийн ангилал — `computeRaw` аль ангиллыг «нэг хүнд ногдох»-д
 * тоолохыг `activeGreen`-ээр шүүнэ.
 *
 * ⚠️ Эх сурвалж `nogoon_baiguulamj20267031/2`-т ангилал БАЙХГҮЙ: `Layer` талбар нь
 * бүх объектод ганц CAD утгатай (`0MoviliarioLu`), бүсийн код нь `RefName_1`-д
 * (`RefName` талбар хоосон). Тиймээс задаргаа НЭГ ангилалд нурна — `data.ts` бүх
 * объектод энэ түлхүүрийг оноодог. (Ангилалтай (нийтийн/тусгай/хязгаарлагдмал)
 * хувилбар нь ET-25 давхаргад л байсан; эх сурвалж энэ үйлчилгээ болсноор устав.)
 */
export const GREEN_CATEGORIES = [
  { key: 'Ногоон байгууламж', short: 'Ногоон байгууламж', default: true },
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
