import { t as tr } from '@/lib/i18nCore';
import { cat } from '@/lib/format';
/**
 * АНАЛИЗ — тохиромжтой байдлын загварын тохиргоо.
 *
 * Бүх босго утга, жин, норм ЭНД төвлөрнө; UI-аас жинг динамикаар өөрчилнө.
 * Эх сурвалж: `Suitability_selbe/js/config.js` (vanilla JS хувилбар) — логик нь
 * хэвээр, TypeScript болон порталын давхаргын каталогт холбогдов.
 */

import { ZONE_LAYER, BUILT_LAYER, PROJECT_AREA_HA, LAYER_BY_ID, PLAN_LAYER_IDS, MONITOR_LAYER_IDS, MONITOR_GROUP, groupOf, type LayerDef, INFRA_SYSTEMS } from '@/lib/services';

export { PROJECT_AREA_HA };

/* ══════════════════ Эх сурвалж ══════════════════ */

/** Талбайн проекц — бүх давхарга UTM 48N (метр). Планар тооцоо шууд метрээр гарна. */
export const WKID = 32648;

/**
 * Загварт хэрэгтэй давхаргууд — порталын каталогийн id-гаар.
 */
export const SRC = {
  zones: ZONE_LAYER.id,      // zone — busiin_medeelel_final
  buildings: BUILT_LAYER.id, // et:24 — barilga
  green: 'nogoon',
  busStops: 'et:2',
  lrtStops: 'et:1',
} as const;

/** Инженерийн шугам сүлжээ — «хүртээмж»-ийг эдгээр хүртэлх зайгаар хэмжинэ */
export const ENGINEERING_IDS: string[] = INFRA_SYSTEMS
  .filter((x) => x.key === 'heat' || x.key === 'water' || x.key === 'sewer')
  .flatMap((x) => x.ids)
  .filter((id) => LAYER_BY_ID[id]?.geom === 'line');


/* ══════════════════ Газрын зургийн давхарга ══════════════════ */

export type MapLayerKind = 'point' | 'point-lg' | 'line' | 'fill' | 'hatch' | 'building';

export type MapLayerDef = {
  /** Өвөрмөц түлхүүр — ил байдлын төлөв үүгээр хадгалагдана */
  key: string;
  /** `Selbe_ET` доторх давхаргын дугаар */
  n?: number;
  /**
   * ӨӨР үйлчилгээний бүтэн хаяг (порталын каталогийн id).
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
  { key: 'zone', special: 'zone', get title() { return tr('Бүсийн үнэлгээ'); }, kind: 'fill', color: [79, 209, 197], on: true, group: 'zone' },
  { key: 'label', special: 'label', get title() { return tr('Бүсийн нэр'); }, kind: 'point', color: [230, 237, 243], on: true, group: 'zone' },
  { key: 'et:24', layerId: 'et:24', n: 24, get title() { return tr('Барилга байгууламж'); }, kind: 'building', color: [148, 163, 184], on: true, group: 'build' },
];
const SPECIAL_KEYS = new Set(SPECIAL_LAYERS.map((s) => s.key));

/** Порталын каталогийн бүх давхарга (тусгайг хасаад) → context давхарга */
const DERIVED_LAYERS: MapLayerDef[] = [...PLAN_LAYER_IDS, ...MONITOR_LAYER_IDS]
  .filter((id) => !SPECIAL_KEYS.has(id) && LAYER_BY_ID[id])
  .map((id) => {
    const d = LAYER_BY_ID[id];
    return {
      key: id,
      layerId: id,
      get title() { return d.title; },
      kind: kindOf(d.geom),
      color: hexRgb(d.hue),
      on: false,
      group: groupOf(id) ?? MONITOR_GROUP.key,
    } as MapLayerDef;
  });


/**
 * НОГООН БАЙГУУЛАМЖ — анализын тооцоотой ижил утга харуулах ЗУРГИЙН давхарга.
 */
export const GREEN_LAYER_KEY = SRC.green;
const GREEN_LAYERS: MapLayerDef[] = [{
  key: GREEN_LAYER_KEY,
  layerId: GREEN_LAYER_KEY,
  get title() { return LAYER_BY_ID[GREEN_LAYER_KEY]?.title ?? tr('Ногоон байгууламж'); },
  kind: 'fill',
  color: [142, 189, 0],
  on: false,
  group: 'green',
}];

export const MAP_LAYERS: MapLayerDef[] = [
  ...SPECIAL_LAYERS, ...DERIVED_LAYERS, ...GREEN_LAYERS,
];

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
  { min: 85, max: 101, get label() { return tr('Маш сайн'); }, color: '#16a34a', tone: 'var(--score-5)', ink: '#1a1205' },
  { min: 65, max: 85, get label() { return tr('Сайн'); }, color: '#a3d84a', tone: 'var(--score-4)', ink: '#1a1205' },
  { min: 45, max: 65, get label() { return tr('Дунд'); }, color: '#facc15', tone: 'var(--score-3)', ink: '#1a1205' },
  { min: 25, max: 45, get label() { return tr('Муу'); }, color: '#f59e0b', tone: 'var(--score-2)', ink: '#1a1205' },
  { min: 0, max: 25, get label() { return tr('Маш муу'); }, color: '#b91c1c', tone: 'var(--score-1)', ink: '#ffffff' },
] as const;

export const NO_DATA_COLOR = '#94a3b8';
/** «Өгөгдөлгүй» — DOM/SVG графикийн токен (dark-тай). 2026-10-09 */
export const NO_DATA_TONE = 'var(--ink-3)';


/**
 * ОНООЛОЛД ОРОХГҮЙ бүсийн ангиллууд (каноник нэр, `zoneType`-ийн гаралт).
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
 */
export const ACTIVATABLE_ZONE_TYPES = new Set<string>([
  'Нийгмийн дэд бүтцийн бүс',
  'Газар чөлөөлөлт дутуу',
]);

/**
 * Оноо → түвшний индекс (0 = маш сайн). Өгөгдөлгүй бол −1.
 */
export function levelOf(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return -1;
  const s = Math.round(score);
  return SCORE_LEVELS.findIndex((L) => s >= L.min && s < L.max);
}

/* ══════════════════ БНБД — нягтралын норматив ══════════════════ */

/**
 * БНБД 30-01-24, ХҮСНЭГТ 6.1 — барилгажилтын нягтралын норматив ДЭЭД хязгаар.
 */
export const DENSITY_BY_TYPE: Record<string, { label: string; farMax: number; bcrMax: number }> = {
  'Орон сууцны бүс': {
    get label() { return tr('Олон давхар олон айлын орон сууц (7–16 давхар)'); },
    farMax: 1.2, bcrMax: 40,
  },
  'Олон нийтийн бүс': {
    get label() { return tr('Олон төрлийн (нийгэм, олон нийтийн) барилгажилт'); },
    farMax: 3.0, bcrMax: 100,
  },
  'Нийгмийн дэд бүтцийн бүс': {
    get label() { return tr('Нийгэм, олон нийтийн төрөлжсөн барилгажилт'); },
    farMax: 2.4, bcrMax: 80,
  },
  // Хүснэгт 6.1-д шууд харгалзах ангилалгүй тул хамгийн ойрын ангиллаар авав
  'Х бүс': {
    get label() { return tr('Олон төрлийн (нийгэм, олон нийтийн) барилгажилт'); },
    farMax: 3.0, bcrMax: 100,
  },
  'Одоо байгаа барилга байгууламж': {
    get label() { return tr('Олон давхар олон айлын орон сууц (7–16 давхар)'); },
    farMax: 1.2, bcrMax: 40,
  },
  'Таун хаус': {
    get label() { return tr('Олон давхар олон айлын орон сууц (7–16 давхар)'); },
    farMax: 1.2, bcrMax: 40,
  },
};

/**
 * Хүснэгт 6.1-д ХАРГАЛЗАХ АНГИЛАЛГҮЙ бүсийн төрлүүд — FAR/BCR ДҮГНЭГДЭХГҮЙ (норм хамаарахгүй, `normFor` → `na`).
 */
export const NO_DENSITY_NORM_TYPES = new Set<string>([
  'Газар чөлөөлөлт дутуу',
  'Дэд бүтэц',
  'Ногоон байгууламж, тохижилт',
]);

/**
 * Бүсийн төрөлд харгалзах норм; Хүснэгт 6.1-д ангилалгүй (`NO_DENSITY_NORM_TYPES`) эсвэл ҮЛ МЭДЭГДЭХ төрөлд `null`.
 */
export const densityNormOf = (torol: string | null | undefined): { label: string; farMax: number; bcrMax: number } | null => {
  const t = (torol || '').trim();
  if (NO_DENSITY_NORM_TYPES.has(t)) return null;
  return DENSITY_BY_TYPE[t] ?? null;
};

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
  { key: 'urban', get label() { return tr('Хот төлөвлөлтийн үзүүлэлт'); }, get short() { return tr('Хот төлөвлөлт'); }, color: cat(0) },
  { key: 'social', get label() { return tr('Нийгмийн дэд бүтэц'); }, get short() { return tr('Нийгмийн'); }, color: cat(1) },
  { key: 'engineering', get label() { return tr('Инженерийн дэд бүтэц'); }, get short() { return tr('Инженер'); }, color: cat(2) },
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
  /**
   * ЛАВЛАГААНЫ үзүүлэлт — БНБД-д норм нь заагаагүй тул оноогддоггүй.
   */
  ref?: boolean;
  /**
   * НОРМ ХАМААРАХГҮЙ — тухайн бүсийн төрөлд Хүснэгт 6.1-д ангилал байхгүй (`normFor` тавина): оноо, зөрчил, зөрүү
   * БОДОГДОХГҮЙ (`null`). 2026-10-22 (аудит): `densityNormOf`.
   */
  na?: boolean;
};

export const INDICATORS: Indicator[] = [
  {
    id: 'green',
    cat: 'urban',
    get name() { return tr('Нэг хүнд ногдох ногоон байгууламж'); },
    get short() { return tr('Ногоон талбай'); },
    get unit() { return tr('м²/хүн'); },
    get norm() { return tr('БНБД 30-01-24, Хүснэгт 8.2 — хорооллын ногоон байгууламж 6.0 м²/хүн'); },
    mode: 'higher',
    weight: 16,
    hardMin: 0,
    // Хүснэгт 8.2: нийслэлд хорооллын 6.0, хотын 10.0 м²/хүн. Ногоон давхарга нь
    // бүс дотоод талбайг хэмждэг тул ХОРООЛЛЫН норм.
    target: 6,
    decimals: 1,
  },
  {
    /**
     * ХҮЧИН ЧАДАЛД ногдох ногоон — «Нэг хүнд ногдох ногоон»-той ХОС үзүүлэлт,
     * нягтшилын оршин суугч/хүчин чадал хосын ЯГ адил зарчим.
     */
    id: 'greenCap',
    cat: 'urban',
    get name() { return tr('Нэг хүчин чадалд ногдох ногоон байгууламж'); },
    get short() { return tr('Ногоон (чадал)'); },
    get unit() { return tr('м²/хүн'); },
    get norm() { return tr('Лавлагаа — үйлчилгээний хүчин чадалд ногдох ногоон (БНБД-д норм заагаагүй)'); },
    mode: 'higher',
    weight: 0,
    ref: true,
    decimals: 1,
  },
  {
    id: 'density',
    cat: 'urban',
    get name() { return tr('Хүн амын нягтшил (оршин суугч)'); },
    get short() { return tr('Нягтшил'); },
    get unit() { return tr('хүн/га'); },
    get norm() { return tr('БНБД 30-01-24, 6.9 — 4–16 давхар хороолол: 300–450 хүн/га-аас ихгүй'); },
    mode: 'band',
    weight: 24,
    hardMin: 40, optMin: 300, optMax: 450, hardMax: 700,
    decimals: 0,
  },
  {
    /**
     * ХҮЧИН ЧАДЛЫН нягтшил — сургууль, цэцэрлэг, үйлчилгээ, оффисын багтаамж
     * нэг га-д. Оршин суугчийн нягтшилаас ТУСДАА үзүүлэлт.
     */
    id: 'densityCap',
    cat: 'urban',
    get name() { return tr('Хүчин чадлын нягтшил'); },
    get short() { return tr('Хүчин чадал'); },
    get unit() { return tr('хүн/га'); },
    get norm() { return tr('Лавлагаа — үйлчилгээний багтаамжийн нягтрал (БНБД-д норм заагаагүй)'); },
    mode: 'band',
    weight: 0,
    ref: true,
    decimals: 0,
  },
  {
    id: 'far',
    cat: 'urban',
    get name() { return tr('FAR — Барилгажилтын нягтралын коэффициент'); },
    short: 'FAR',
    unit: '',
    get norm() { return tr('БНБД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар'); },
    mode: 'lower',
    weight: 19,
    byType: 'farMax',
    best: 1.2, hardMax: 2.4,
    decimals: 2,
  },
  {
    id: 'bcr',
    cat: 'urban',
    get name() { return tr('BCR — Барилгажилтын нягтрал'); },
    short: 'BCR',
    unit: '%',
    get norm() { return tr('БНБД 30-01-24, Хүснэгт 6.1 — бүсийн төрлөөр өөр ДЭЭД хязгаар'); },
    mode: 'lower',
    weight: 8,
    byType: 'bcrMax',
    best: 40, hardMax: 80,
    decimals: 1,
  },
  {
    id: 'parking',
    cat: 'urban',
    get name() { return tr('Зогсоолын хангамж'); },
    get short() { return tr('Зогсоол'); },
    unit: '%',
    get norm() { return tr('БНБД 30-01-24, 10.32 — дахин төлөвлөлтөд өрх бүрд 1.0 зогсоол'); },
    mode: 'higher',
    weight: 10,
    hardMin: 0, target: 100,
    decimals: 0,
  },
  {
    id: 'social',
    cat: 'social',
    get name() { return tr('Нийгмийн дэд бүтцийн хүртээмж'); },
    get short() { return tr('Нийгмийн үйлчилгээ'); },
    unit: '%',
    get norm() { return tr('Сургууль, цэцэрлэг, эмнэлгээс 500 м доторх орон сууцны хүн амын хамралт — 100%'); },
    mode: 'higher',
    weight: 8,
    hardMin: 0, target: 100,
    decimals: 0,
  },
  {
    id: 'engineering',
    cat: 'engineering',
    get name() { return tr('Инженерийн дэд бүтцийн хүртээмж'); },
    get short() { return tr('Инженер'); },
    get unit() { return tr('м'); },
    get norm() { return tr('Цэвэр ус, бохир, дулааны шугам хүртэлх зай (батлагдаагүй — таамаг)'); },
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
  { key: 'kinder', get label() { return tr('Цэцэрлэг'); }, re: /цэцэрлэг/i, radius: BUFFER_M, weight: 34 },
  { key: 'school', get label() { return tr('Сургууль'); }, re: /сургууль/i, radius: BUFFER_M, weight: 33 },
  { key: 'clinic', get label() { return tr('Эмнэлэг'); }, re: /эмнэлэг/i, radius: BUFFER_M, weight: 33 },
];

/* ══════════════════ Зогсоол ══════════════════ */

/**
 * Хангамж = бүсийн `ET_NIIT` (ил + далд). Хэрэгцээг 3 аргаар тооцож харьцуулна.
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
  { key: 'norm', get label() { return tr('Нормд заасан зогсоолын тоо'); }, get short() { return tr('Норм'); } },
  { key: 'households', get label() { return tr('Өрхийн тоогоор (өрх × коэф.)'); }, get short() { return tr('өрхөөр'); } },
  { key: 'population', get label() { return tr('Хүн амаар (1000 хүнд ногдохоор)'); }, get short() { return tr('хүн амаар'); } },
];

/* ══════════════════ Ногоон байгууламж ══════════════════ */

/**
 * Ногоон байгууламжийн ангилал — `computeRaw` аль ангиллыг «нэг хүнд ногдох»-д
 * тоолохыг `activeGreen`-ээр шүүнэ.
 */
export const GREEN_CATEGORIES = [
  { key: 'Ногоон байгууламж', get short() { return tr('Ногоон байгууламж'); }, default: true },
];

/**
 * НОГООН БАЙГУУЛАМЖИЙН ХЭРЭГЦЭЭГ ХЭРХЭН ТООЦОХ ВЭ — зогсоолын картын зарчимтай
 * ЯГ ИЖИЛ: байгаа хэмжээ (`greenM2`) ба шаардлагатай хэмжээ хоёрыг харьцуулна.
 */
export type GreenSource = 'perPerson' | 'share' | 'buffer';

export type GreenOpt = {
  source: GreenSource;
  /** м² нэг оршин суугчид (БНБД 8.2 — хорооллын норм 6.0) */
  perPerson: number;
  /** Бүсийн талбайн хэдэн хувь ногоон байх вэ (%) */
  share: number;
  /** НӨЛӨӨЛЛИЙН БҮСИЙН радиус (м) — ногооноос энэ зайд байвал «хүртээмжтэй» */
  radius: number;
};

export const GREEN: GreenOpt = {
  source: 'perPerson',
  perPerson: 6,
  share: 30,
  radius: 500,
};

/**
 * Нөлөөллийн бүсийн СОНГОХ радиусууд (м).
 */
export const GREEN_RADII = [500, 400, 300, 200, 100, 50];

/**
 * «БАЙРШИЛ» картын хүрээний радиусууд (м) — үйлчилгээний барилгын өрсөлдөгч ба
 * хүрээний хүн амыг эдгээр зайд тоолно.
 */
export const LOCATION_RADII = [100, 200, 300, 500];

/**
 * «Байршил» картын чагт шүүдэг бүсийн ангиллууд.
 */
export const LOCATION_ZONE_TYPES = ['Олон нийтийн бүс', 'Таун хаус'];

/**
 * «Байршил»-ын шинжилгээнээс ХАСАХ барилгууд (`OBJECTID`).
 */
export const LOCATION_EXCLUDE_OIDS = new Set<number>([
  137, 138, 139,                          // A-14  нэгдсэн авто зогсоол, УДДП
  207, 326,                               // A-27  авто зогсоол, ХТП
  140, 281, 282, 283, 292, 300, 301, 336, // A-5   нүхэн гарц, ХТП
  275,                                    // B-1   орон сууц
  168, 173, 176, 224, 324, 331, 332, 333, // B-7   орон сууц, зогсоол, УДДП, ХТП
  244, 268, 285, 286, 339,                // C-7.1 УДДП, ХТП
  148, 149, 151, 152, 153,                // C-8   орон сууц
  287, 335, 343, 344,                     // C-8   ХТП
  135, 296,                               // C-9   авто зогсоол, ХТП
  114, 115, 116, 156, 158,                // D-11  орон сууц
  305, 306, 307, 314, 315, 316, 334,      // D-11  ХТП
  239, 276, 289, 312, 319,                // D-2   одоо байгаа орон сууц, тодорхойгүй, ХТП
  195, 308, 309, 310, 340, 341, 342,      // D-8.1 авто зогсоол, ХТП
  201, 357, 358, 359,                     // D-8.2 УДДП, ХТП
  272, 274, 368,                          // E-4   УДДП, тодорхойгүй, ХТП
  298, 299,                               // E-5   ХТП
]);

export const GREEN_SOURCES: { key: GreenSource; label: string; short: string }[] = [
  { key: 'perPerson', get label() { return tr('Нэг хүнд ногдохоор (БНБД 6 м²/хүн)'); }, get short() { return tr('6 м²/хүн'); } },
  { key: 'share', get label() { return tr('Талбайн эзлэх хувиар (30% ногоон)'); }, get short() { return tr('талбайн %'); } },
  { key: 'buffer', get label() { return tr('Нөлөөллийн бүс'); }, get short() { return tr('нөлөөллийн бүс'); } },
];


/** Барилгын талбарууд — кирилл тул тогтмолоор */
export const BF = {
  gfa: 'барилгын_нийт_талбай_m2',
  purpose: 'зориулалт_m',
  status: 'barilga_ty',
  /**
   * ОРШИН СУУГЧ — эх өгөгдөлд ЗӨВХӨН орон сууцны барилгад бөглөгддөг.
   */
  population: 'population',
  /** ХҮЧИН ЧАДАЛ (суудал, ор, ажлын байр) — орон сууц БУС барилгад */
  capacity: 'huchin_chadal',
  /** `Population + Huchin_chadal`-ын нийлбэр — задлаагүй нийт дүн хэрэгтэй үед */
  totalPop: 'total_population',
  households: 'urhiin_too',
  /**
   * ХӨЛ ТАЛБАЙ — барилгын полигоны БОДИТ талбай (м²).
   */
  foot: 'SHAPE__Area',
} as const;

/**
 * ОРШИН СУУХ зориулалт эсэх.
 *
 * Тиймээс нэг хүнд ногдох ногоон байгууламжийг ЗӨВХӨН оршин суугчаар бодно.
 */
export const isResidential = (purpose: unknown) =>
  /орон сууц|house/i.test(String(purpose ?? '').trim());

/**
 * ХҮРТЭЭМЖИЙГ ШУУД «НОРМ ХАНГАСАН» ГЭЖ ҮЗЭХ ҮЗҮҮЛЭЛТҮҮД — ТҮР ЗУУРЫН шийдэл
 * (хэрэглэгчийн шийдвэр, 2026-08-12; дараа нь сольж бодит тооцоо руу буцна).
 *
 * Нийгмийн ба инженерийн дэд бүтцийн хүртээмжийн эх өгөгдөл найдвартай биш тул
 * тэдгээрийг бүх бүсэд 100% / норм хангасан гэж дүгнэнэ.
 *
 * Утга нь тухайн үзүүлэлтийн НОРМЫН хязгаар: `social` ≥ 100 %, `engineering`
 * ≤ 100 м.
 */
export const ASSUME_MET: Record<string, number> = {
  social: 100,
  engineering: 100,
};

/**
 * ОНОО ГАРГАХ ХАМГИЙН БАГА ХЭМЖСЭН ЖИН — нийт жингийн хувь (0–1).
 */
export const MIN_MEASURED_SHARE = 0.5;

/**
 * БАРИЛГЫН ЗОРИУЛАЛТЫН БҮЛЭГ — `Зориулалт_m`-ийн 34 өөр утгыг уншихад
 * ойлгомжтой цөөн бүлэгт буулгана («Барилгын ангилал» карт).
 */
export const BUILDING_PURPOSES: { key: string; label: string; color: string; re: RegExp }[] = [
  { key: 'res', get label() { return tr('Орон сууц'); }, color: '#d97706', re: /орон сууц|house/i },
  { key: 'school', get label() { return tr('Сургууль'); }, color: '#8b5cf6', re: /сургууль/i },
  { key: 'kinder', get label() { return tr('Цэцэрлэг'); }, color: '#0891b2', re: /цэцэрлэг/i },
  { key: 'clinic', get label() { return tr('Эмнэлэг'); }, color: '#ef4444', re: /эмнэлэг/i },
  { key: 'eng', get label() { return tr('Инженерийн байгууламж'); }, color: '#0d9488', re: /хтп|уддп|дэд станц|дулааны станц|цэвэрлэх|нцү/i },
  { key: 'parking', get label() { return tr('Авто зогсоол'); }, color: '#64748b', re: /зогсоол/i },
  { key: 'office', get label() { return tr('Оффис, төрийн байгууллага'); }, color: '#3b82f6', re: /оффис|цагдаа|холбоо мэдээ|төрийн/i },
  { key: 'service', get label() { return tr('Үйлчилгээ, худалдаа'); }, color: '#ec4899', re: /үйлчилгээ|худалдаа|зах|спорт|ахмад|хүүхэд|үзвэр/i },
];

/** Аль ч хэв шинжид таараагүй (ба зориулалт хоосон) барилгын бүлэг */
export const BUILDING_PURPOSE_OTHER = { key: 'other', get label() { return tr('Бусад'); }, color: '#94a3b8' } as const;

/** Зориулалтын түүхий утга → бүлгийн түлхүүр */
export function buildingPurposeKey(purpose: unknown): string {
  const t = String(purpose ?? '').trim();
  if (!t) return BUILDING_PURPOSE_OTHER.key;
  for (const g of BUILDING_PURPOSES) if (g.re.test(t)) return g.key;
  return BUILDING_PURPOSE_OTHER.key;
}
