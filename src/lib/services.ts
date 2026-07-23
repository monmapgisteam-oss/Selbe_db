/**
 * Сэлбэ портал — ArcGIS эх сурвалжийн ГАНЦ эх үүсвэр.
 *
 * ⚠️ 2026-07-21-нд ТӨЛӨВЛӨЛТИЙН бүх вектор өгөгдөл НЭГ үйлчилгээ рүү нэгдсэн:
 * `Selbe_ET_20260721` (29 давхарга). Тарсан үйлчилгээнүүд (`Selbe_talbain_hynalt`,
 * `Road_shugam_suljee`, `Busiin_medeelel_last`, `Чөлөөлөгдөөгүй_нэгж_талбар`,
 * `Selbe_parcel`, `selbe_B` …) хасагдсан.
 *
 * ⚠️ ГЭХДЭЭ **барилгын хяналт** нь ХУУЧИН үйлчилгээн дээр үлдсэн:
 * `building_GOL_barigdaj_ehelsen` (113 блок, гүйцэтгэлийн %, 16 үе шат) ба
 * `survey123_…` (талбайн тайлан). Шинэ ЕТ-д эдгээр өгөгдөл ОГТ байхгүй тул
 * нэгтгэх боломжгүй — каталогт `url` ба `oid`-оо өөрсдөө авчирна.
 *
 * Дараах өгөгдөл бүрмөсөн алга: газар чөлөөлөлтийн нэгж талбар, кадастр,
 * барилгын үнэлгээ.
 *
 * ЕТ = Ерөнхий Төсөв. Давхарга бүр НЭГЖ ҮНЭ (`negj_une` гэх мэт) ба ТОО ХЭМЖЭЭ
 * (урт / талбай / ширхэг) агуулна; порталын гол шинэ чадвар нь эдгээрээс өртөг
 * тооцож, бүсээр задлах явдал.
 */

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';

/** Бүх вектор давхаргын эх — НЭГ FeatureServer */
export const ET = `${HJ}/Selbe_ET_20260721/FeatureServer`;

/**
 * Суурь зураг — Esri-гийн нийтийн РАСТР тайл (түлхүүр шаардахгүй, ACAO `*`).
 *
 * ⚠️ Вектор тайлын суурь зургийг БҮРМӨСӨН хассан: загвар солиход хуучныг устгах
 * агшин зурах агшинтай давхцвал ArcGIS дотор
 * `VectorTileContainer._renderBackgroundLayers` дээр «Cannot destructure property
 * 'spans' of null» гэж унадаг. Мөн 2D-д ортофото түүнийг бүрэн бүрхдэг.
 */
export const BASEMAP_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

/**
 * ArcGIS Online нэвтрэлт (OAuth 2.0, PKCE — сервергүй статик сайтад тохирно).
 * `appId` хоосон бол нэвтрэлт УНТРААЛТТАЙ.
 */
export const AUTH = {
  // ⚠️ ТҮР — давхарга шалгах. Буцаах: 'ZPJRqk1iiYcjYRLv'
  appId: '',
  /**
   * ⚠️ Байгууллагын хаяг (`monmap.maps.arcgis.com`) БИШ. Тэр домэйн ArcGIS
   * Online-ы «Allowed origins» цагаан жагсаалтыг мөрддөг тул dev дээр токен
   * солилт CORS-д хаагддаг. `www.arcgis.com` аль ч origin-ыг зөвшөөрнө;
   * байгууллагаар хязгаарлах ажлыг `allowedOrgId` хийнэ.
   */
  portalUrl: 'https://www.arcgis.com',
  allowedOrgId: 'HJzgwvlNIXssnQar',
} as const;

/** Эхлэх байрлал — төслийн талбайн төв */
export const HOME = { lon: 106.916, lat: 47.9674, zoom: 15 } as const;

/**
 * Төслийн НИЙТ талбай (га) — ГАНЦ эх үүсвэр.
 *
 * ⚠️ Бүсийн `GAZAR_GA` талбарын нийлбэр (131 га) БИШ. Тэр нь зөвхөн бүсчилсэн
 * газрыг хамардаг бөгөөд эх өгөгдөлд алдаатай бичлэгүүдтэй. Төслийн албан
 * ёсны хэмжээ нь энэ тогтмол — толгойн үзүүлэлт ба анализын «1 га-д ногдох
 * төсөв» ХОЁУЛАА эндээс уншина.
 */
export const PROJECT_AREA_HA = 158;

/* ══════════════════════ Өртгийн загвар ══════════════════════ */

/**
 * Нэгж үнийг тоо хэмжээнд хэрхэн үржүүлэх.
 *
 * ⚠️ Талбарын нэр нь нэгжийг заана, гэхдээ `negj_une` нь ХОЁР ойлголттой:
 * цэгэн давхаргад ширхэгийн үнэ, шугаман давхаргад **100 метрийн** үнэ
 * (хэрэглэгчээс баталгаажуулсан), талбайн давхаргад м²-ийн үнэ. Тиймээс
 * геометрээс биш, ЭНД тодорхой бичнэ.
 */
export type CostBasis =
  | 'sh'    // ширхэг × үнэ
  | 'm100'  // (урт_м ÷ 100) × үнэ
  | 'km'    // урт_км × үнэ
  | 'm2';   // талбай_м² × үнэ

/**
 * ⚠️ ТАЛБАЙН давхаргын нэгж НЯГТЛАХ ШААРДЛАГАТАЙ.
 *
 * Шугаман давхаргын `negj_une` нь 100 метрийн үнэ гэдгийг баталгаажуулсан.
 * Талбайн давхаргад одоогоор м²-ээр (`m2`) тооцож байгаа боловч 2026-07-21-нд
 * эх өгөгдөл засагдаж, «Ногоон байгууламж»-ийн үнэ 100,000 → 10,000,000 болсон.
 * м²-ээр бодвол тэр давхарга дангаараа 9.7 их наяд ₮ буюу БҮХ барилгын сангаас
 * (7.2 их наяд) илүү гарна — боломжгүй. 100 м²-ээр бодвол 96.8 тэрбум болж,
 * өмнөх утгатай ЯГ таарна.
 *
 * Өөрөөр хэлбэл талбайн давхарга ч «100 нэгжийн үнэ» журамтай байх магадлалтай.
 * Баталгаажсаны дараа `m2` → `m100` маягийн шинэ basis нэмж, доорх талбайн
 * давхаргуудын `basis`-ыг солино. Таамгаар өөрчилвөл мөнгөн дүн 100 дахин
 * гажина тул одоохондоо хэвээр үлдээв.
 */

export type Quantity = { field: string; unit: 'м' | 'км' | 'м²' };
export type Cost = { field: string; basis: CostBasis };

/* ══════════════════════ Сэдэв ══════════════════════ */

/**
 * ХОЁРХОН бүлэг.
 *
 * ⚠️ Урьд нь ЕТ-ийн давхаргуудыг 6 сэдэв болгож задалсан байв (барилга, инженер,
 * зам, тээвэр, бүс, бусад). Тэдгээр нь бүгд НЭГ үйлчилгээ, НЭГ ерөнхий
 * төлөвлөгөөний хэсэг тул хиймэл хуваалт болж, хэрэглэгч давхаргаа хайхад 6
 * хэсэг нээх шаардлагатай болдог байлаа. Одоо жинхэнэ ялгаа нь ганц: төлөвлөгөө
 * (юу барих) vs хяналт (юу баригдсан). Каталогийн ДАРААЛАЛ нь сэдэвчилсэн
 * хэвээр — барилга → инженер → зам → тээвэр → бүс → бусад.
 */
export type TopicKey = 'plan' | 'monitor';

export const TOPICS: { key: TopicKey; title: string; icon: string; hue: string }[] = [
  { key: 'plan', title: 'Ерөнхий төлөвлөгөө', icon: 'layers', hue: '#0d9488' },
  { key: 'monitor', title: 'Барилгын хяналт', icon: 'target', hue: '#ea580c' },
];

export const topicTitle = (k: TopicKey) => TOPICS.find((t) => t.key === k)!.title;

/* ══════════════════════ Давхаргын каталог ══════════════════════ */

export type LayerDef = {
  /** Порталын доторх id — `et:<FeatureServer-ийн давхаргын дугаар>` */
  id: string;
  /** FeatureServer доторх давхаргын дугаар */
  n: number;
  title: string;
  topic: TopicKey;
  geom: 'area' | 'line' | 'point';
  hue: string;
  /** Зураасны хээ — ижил гэр бүлийн шугамуудыг ялгана */
  dash?: 'solid' | 'dash' | 'dot' | 'dash-dot' | 'long-dash';
  width?: number;
  fill?: number;
  marker?: 'circle' | 'square';
  size?: number;
  /** Зөвхөн ойртоход зурагдана (олон мянган объекттой давхарга) */
  minScale?: number;
  qty?: Quantity;
  cost?: Cost;
  /** Ангиллын задаргаа — дашбоардад багана болж, дарахад зурагт шүүнэ */
  facets?: { field: string; label: string }[];
  /**
   * КАТАЛОГТ анхны ангиллаараа задарна — зүүн баганад давхаргын доор дэд мөр
   * болж гарч, дарахад зурагт тэр төрөл нь шүүгдэнэ.
   *
   * ⚠️ Зөвхөн ЦӨӨН УТГАТАЙ ангилалд. Каталогийн багана нь навигаци тул 40 дэд
   * мөр гарвал бусад давхарга хэдэн дэлгэц доор үлдэнэ. Мөн давхарга бүрт
   * тусдаа ArcGIS хүсэлт явна — 29 давхаргад бүгдэд нь тавьбал каталог
   * нээгдэхэд 29 нэмэлт хүсэлт явна.
   */
  catalogFacet?: true;
  /** Ангиллаар ӨНГӨ ялгах (≤6 утгатай ТЕКСТ талбарт) */
  paint?: { field: string; values: Record<string, string>; emptyLabel: string };
  /**
   * ТООН талбарыг завсраар өнгөөр ялгах (гүйцэтгэлийн %).
   * ⚠️ ArcGIS-ийн classBreak нь `minValue`/`maxValue` ХОЁУЛАНГ нь оруулж тоолдог.
   * Самбарын тоолол ба SQL шүүлт нь `>= min AND < max` (хагас нээлттэй) тул
   * дээд хязгаараас багахан хасаж хоёуланг нь тааруулна.
   */
  breaks?: { field: string; levels: readonly { label: string; range: string; min: number; max: number; color: string }[]; emptyLabel: string };
  /**
   * `ZONE_ID` талбар БАЙХГҮЙ давхарга.
   * ⚠️ Бүсийн нэгдсэн шүүлт эдгээрт үйлчлэхгүй — байхгүй талбараар шүүвэл
   * `definitionExpression` бүхэлдээ унаж, давхарга зурагдахаа болино.
   */
  noZone?: true;
  /**
   * ӨӨР үйлчилгээнээс ирэх давхарга — бүтэн URL.
   * ⚠️ Ихэнх давхарга `Selbe_ET_20260721`-ээс ирдэг тул `n`-ээр хаяг угсарна.
   * Барилгын хяналтын хоёр давхарга нь хуучин үйлчилгээнд үлдсэн (шинэ ЕТ-д
   * гүйцэтгэлийн өгөгдөл ОГТ байхгүй) тул хаягаа өөрөө авчирна.
   */
  url?: string;
  /**
   * OID талбарын нэр — анхдагч `OBJECTID`.
   * ⚠️ Хуучин үйлчилгээнүүд өөр нэртэй (`FID`, `objectid`). Буруу нэрээр
   * `COUNT()` асуувал хүсэлт бүхэлдээ унана.
   */
  oid?: string;
  /**
   * Ерөнхий (каталогаас автоматаар үүсэх) дашбоардын оронд БЭСПОК самбар.
   * Гүйцэтгэлийн 16 үе шат, Survey123-ийн холбоост хүснэгтүүд зэрэг нь
   * ерөнхий «тоо + хэмжээ + ангилал» загварт багтахгүй.
   */
  detail?: 'building' | 'survey';
  note?: string;
};

/** Бүх давхаргад нийтлэг талбарууд */
export const OID = 'OBJECTID';
/** Давхарга БҮР энэ талбартай — бүсийн нэгдсэн шүүлт үүн дээр тогтоно */
export const ZONE_FIELD = 'ZONE_ID';
/** Бүсийн мэдээлэл бөглөгдөөгүй объектын утга (хоосон биш, ийм ТЕКСТ) */
export const ZONE_NONE = ' Бүсийн мэдээлэл байхгүй ';

/** Барилгын төлөв — хугацааны дарааллаар */
export const BUILT_STATUS: { value: string; hue: string }[] = [
  { value: 'Одоо байгаа', hue: '#78716c' },
  { value: 'Баригдаж байгаа', hue: '#ea580c' },
  { value: 'Төлөвлөсөн', hue: '#3387b8' },
];

/** Бүсийн ангилал → өнгө */
export const ZONE_TYPES: Record<string, string> = {
  'Орон сууцны бүс': '#eab308',
  'Олон нийтийн бүс': '#dc2626',
  'Нийгмийн дэд бүтцийн бүс': '#2563eb',
  'Х бүс': '#7c3aed',
  'Одоо байгаа барилга байгууламж': '#78716c',
};
export const ZONE_TYPE_EMPTY = 'Тодорхойгүй';
export const ZONE_TYPE_EMPTY_HUE = '#94a3b8';

/**
 * ГАЗРЫН ЗУРГИЙН бүсийн палитр — `ZONE_TYPES`-ээс ТУСДАА.
 *
 * ⚠️ Зурагт 5 ангиллыг 5 өөр өнгөөр будахад аль нь чухал болох нь алдагдана.
 * Хүн амьдардаг ба хүн цуглардаг хоёр ангилал (орон сууц, олон нийт) нь
 * төлөвлөлтийн гол асуулт тул ЗӨВХӨН тэр хоёр улаанаар тодорч, бусад нь нэг
 * жигд саарлаар суурь болно.
 *
 * ⚠️ `ZONE_TYPES`-ыг ӨӨРЧИЛСӨНГҮЙ: түүнийг «Ерөнхий дашбоард» модуль ч
 * ашигладаг (өөр хүний хэсэг) бөгөөд тэнд 5 ангилал ялгаатай өнгөтэй байх нь
 * зөв — тэр бол ангиллын задаргааны диаграм, газрын зураг биш.
 */
const ZONE_MAP_ACCENT = '#dc2626';
/**
 * ⚠️ Суурь өнгө нь САААРАЛ байв — «байхгүй/тодорхойгүй» гэсэн сэтгэгдэл төрүүлж,
 * бүс өөрөө байхгүй мэт харагддаг байлаа. Улаантай тодорхой ялгаатай, гэхдээ
 * өөрөө ч уншигдахуйц цэнхэр болов.
 */
const ZONE_MAP_BASE = '#2563eb';
export const ZONE_MAP_TYPES: Record<string, string> = {
  'Орон сууцны бүс': ZONE_MAP_ACCENT,
  'Олон нийтийн бүс': ZONE_MAP_ACCENT,
  'Нийгмийн дэд бүтцийн бүс': ZONE_MAP_BASE,
  'Х бүс': ZONE_MAP_BASE,
  'Одоо байгаа барилга байгууламж': ZONE_MAP_BASE,
};

const M: Quantity = { field: 'urt_m', unit: 'м' };
const M2: Quantity = { field: 'talbai_m2', unit: 'м²' };

/* ══════════════════════ Барилгын хяналт ══════════════════════ */

/**
 * ⚠️ Эдгээр ХУУЧИН үйлчилгээнд үлдсэн — шинэ `Selbe_ET_20260721`-д гүйцэтгэлийн
 * хувь, үе шат, талбайн тайлан ОГТ БАЙХГҮЙ. Тиймээс ЕТ-ийн давхаргууд ба эдгээр
 * нь өөр өөр өгөгдлийн сан: `barilga` (368, төлөвлөлт ба өртөг) vs
 * `building_GOL_barigdaj_ehelsen` (113 блок, бодит гүйцэтгэл).
 */
const BUILDING_FS = `${HJ}/building_GOL_barigdaj_ehelsen/FeatureServer`;
const SURVEY_FS = `${HJ}/survey123_e98bd4b642f84c9fb688f754de7cb83a_results/FeatureServer`;

/** Барилгын явц · 113 блок */
export const BUILDING = {
  url: `${BUILDING_FS}/2`,
  oid: 'FID',
  fields: {
    bagts: 'BAGTS',
    block: 'BLOK',
    contractor: 'BAR_COMP',
    floors: 'DAVHAR',
    households: 'AIL_TOO',
    type: 'TOROL',
    /** Нийт гүйцэтгэл (%) */
    progress: 'GUITS_HV',
    dueDate: 'GUITS_OGN',
  },
} as const;

/**
 * BUS_cashflow — багц бүрийн ТӨСӨВ, САНХҮҮЖИЛТ, ГЭРЭЭНИЙ өгөгдөл.
 * ⚠️ Талбар нь A1..E225 гэж КОДЛОГДСОН (Selbe_HO_polygon_join.xlsx-ийн HEADER_MAP-аар
 * тайлав). ZONE_ID нь бүсийн давхарга (Багц-X.Y)-той холбогдоно. Утга нь таслалтай
 * тэмдэгт мөр («259,778,021,987») тул тоо руу задлан хөрвүүлнэ.
 */
export const CASHFLOW = {
  url: 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/BUS_cashflow/FeatureServer/0',
  fields: {
    zone: 'ZONE_ID',
    budget: 'A5',        // Урьдчилсан төсөвт өртөг
    orderTotal: 'B3',    // Захирамжийн дүн — нийт дүн
    securities: 'B4',    // Санхүүжилт — үнэт цаасны хөрөнгө
    projectIncome: 'B6', // Санхүүжилт — төслийн орлого
    cityBudget: 'B7',    // Санхүүжилт — нийслэлийн төсөв
    reserve: 'B8',       // Санхүүжилт — НЗД нөөц хөрөнгө
    contract: 'C6',      // Гэрээ байгуулах эрх олгосон дүн
    contractor: 'C2',    // Гүйцэтгэгч байгууллага
  },
  /** Сар бүрийн олгосон санхүүжилт (Мөнгөн дүн) — E-группээс задалсан */
  months: [
    { code: 'E2', label: '25-10' }, { code: 'E21', label: '25-11' }, { code: 'E40', label: '25-12' },
    { code: 'E68', label: '26-01' }, { code: 'E87', label: '26-02' }, { code: 'E106', label: '26-03' },
    { code: 'E125', label: '26-04' }, { code: 'E144', label: '26-05' }, { code: 'E163', label: '26-06' },
    { code: 'E182', label: '26-07' }, { code: 'E201', label: '26-08' }, { code: 'E220', label: '26-09' },
  ],
} as const;

/**
 * Гүйцэтгэлийн 4 түвшин.
 *
 * ⚠️ Өнгө нь ОРТОФОТО дээр ялгарах ёстой. Хуучин дараалал (улаан→улбар шар→шар)
 * нь зэргэлдээ гурван өнгөтэй байсан бөгөөд ортофотогийн дулаан саарал дэвсгэр
 * дээр бараг ялгагдахгүй байв (хэмжсэн ΔE 17–19, хоёулаа 25-аас доош). Шинэ
 * дараалал өнгөний хүрдийг тэлж, гэрэлтүүлгийг ч зэрэг өсгөнө (хамгийн ойрхон
 * хос ΔE 34) — өнгө ялгахад хүндрэлтэй хэрэглэгч ч дарааллыг уншина.
 */
export const PROGRESS_LEVELS = [
  { key: 'l1', label: 'Эхэлсэн', range: '0–25%', min: 0, max: 25, color: '#b91c1c' },
  { key: 'l2', label: 'Явцад', range: '25–50%', min: 25, max: 50, color: '#f97316' },
  { key: 'l3', label: 'Дуусах шатанд', range: '50–75%', min: 50, max: 75, color: '#a3e635' },
  { key: 'l4', label: 'Бэлэн болох', range: '75–100%', min: 75, max: 101, color: '#0d9488' },
] as const;

/** 16 үе шат (%) · `-1` = тухайн ажил төлөвлөгдөөгүй */
export const BUILDING_STAGES: { field: string; label: string }[] = [
  { field: 'A_BELTGEL', label: 'Бэлтгэл ажил' },
  { field: 'GAZAR', label: 'Газар шороо' },
  { field: 'SUURI', label: 'Суурь' },
  { field: 'KARKAS', label: 'Каркас' },
  { field: 'HANA', label: 'Хана' },
  { field: 'DEEVER', label: 'Дээвэр' },
  { field: 'HAALGA', label: 'Хаалга, цонх' },
  { field: 'SHAL', label: 'Шал' },
  { field: 'DOTOR', label: 'Дотор засал' },
  { field: 'GADNA', label: 'Гадна засал' },
  { field: 'LIFT', label: 'Лифт' },
  { field: 'HALAALT', label: 'Халаалт' },
  { field: 'US', label: 'Ус, ариутгал' },
  { field: 'TSAHILGAAN', label: 'Цахилгаан' },
  { field: 'HOLBOO', label: 'Холбоо' },
  { field: 'BUSAD', label: 'Бусад' },
];
export const STAGE_NA = -1;

/** Талбайн хяналт — Survey123: цэгийн давхарга + 5 холбоост хүснэгт */
export const SURVEY = {
  url: `${SURVEY_FS}/0`,
  oid: 'objectid',
  tables: {
    beltgel: `${SURVEY_FS}/1`,
    shoroo: `${SURVEY_FS}/2`,
    suuri: `${SURVEY_FS}/3`,
    ram: `${SURVEY_FS}/4`,
    asuudal: `${SURVEY_FS}/5`,
  },
  fields: {
    date: 'ognoo',
    user: 'hereglegch',
    contractor: 'guitsetgegch',
    bagts: 'bagts',
    building: 'barilga',
    buildingType: 'barilga_torol',
    floors: 'davhar_too',
    pours: 'tsutgalt_too',
    workers: 'hun_huch',
    machines: 'tehnik_too',
    /** Нийт барилга угсралтын гүйцэтгэл (%) */
    total: 'b_niit',
    shortfall: 'dutuu',
    note: 'erunhii_tailbar',
    created: 'CreationDate',
  },
} as const;

/** Survey123 тайлан дахь ажлын хэсгүүд (%) */
export const SURVEY_SECTIONS: { field: string; label: string }[] = [
  { field: 'beltgel_niit', label: 'А. Бэлтгэл ажил' },
  { field: 'shoroo_niit', label: '1. Газар шороо' },
  { field: 'suuri_niit', label: '2. Суурь' },
  { field: 'ram_niit', label: '3. Төмөр бетон рам' },
  { field: 'hana_niit', label: '4. Хана, хамар хана' },
  { field: 'tsonh_niit', label: '5. Хаалга, цонх' },
  { field: 'dotor_niit', label: '6. Дотор засал' },
  { field: 'gadna_niit', label: '7. Гадна засал' },
  { field: 'deever_niit', label: '8. Дээвэр' },
  { field: 'shal_niit', label: '9. Шал' },
  { field: 'busad_niit', label: '10. Бусад' },
  { field: 'lift_niit', label: '11. Лифт' },
  { field: 'has_niit', label: 'Б2. Халаалт, агаар сэлгэлт' },
  { field: 'tsbu_niit', label: 'Б3. Цэвэр, бохир ус' },
  { field: 'tsah_niit', label: 'Б4. Цахилгаан, гэрэлтүүлэг' },
  { field: 'holboo_niit', label: 'Б5. Холбоо, дохиолол' },
];

/**
 * Survey123 тайлангийн `barilga` кодыг барилгын давхаргын `BLOK`-той холбоно:
 *   `bagts32_5_1` → `5/1`
 *
 * ⚠️ Багцаар холбож БОЛОХГҮЙ: тайлангийн `bagts` нь `bagts32/33` бөгөөд барилгын
 * давхаргын «Багц 1…4.2»-той огт таарахгүй. Зөвхөн блок найдвартай.
 *
 * ⚠️ SQL `LIKE`-аар ч болохгүй: `_` нь LIKE-д дан тэмдэгтийн орлуулагч бөгөөд
 * үйлчилгээ `ESCAPE` заалтыг дэмждэггүйг шалгасан. Тайлангуудыг татаад клиент
 * талд яг таг шүүнэ (тайлангийн тоо бага).
 */
export const surveyBlock = (barilga: unknown): string | null => {
  const m = /^bagts\d+_(.+)$/i.exec(String(barilga ?? '').trim());
  return m ? m[1].replace(/_/g, '/') : null;
};

/** Талбайн тайлангийн өнгө — барилгын улбар шараас ялгарна (цэг нь полигон дээр) */
export const SURVEY_HUE = '#0891b2';

/**
 * Төслийн хил — тайлан хилээс ГАДУУР бичигдсэн эсэхийг шалгахад л ашиглана.
 * ⚠️ Давхарга болгож зурахгүй: шинэ ЕТ-ийн бүсийн давхарга төслийн хамрах
 * хүрээг аль хэдийн харуулж байна.
 */
export const BOUNDARY = {
  plan: { url: `${HJ}/Tuluvlult_talbai/FeatureServer/2`, title: 'Төлөвлөлтийн талбай' },
} as const;

/**
 * ⚠️ Дулааны шугамууд эх өгөгдөлдөө ЗУРСАН ӨНГӨӨРӨӨ нэрлэгдсэн (улаан, цэнхэр,
 * ногоон, тасархай) — тэр нь CAD-ийн давхаргын өнгө, инженерийн утга биш.
 * Порталд бүгдийг НЭГ дулааны гэр бүл (дулаан улаан-улбар шар) болгож, хоорондоо
 * зураасны хээ ба зузаанаар ялгав: нэрийг нь хадгалсан ч зурагт «цэнхэр дулаан»
 * нь усны шугамтай андуурагдахаа больсон.
 */
export const LAYERS: LayerDef[] = [
  /* ─────────── Барилга байгууламж ─────────── */
  {
    id: 'et:24', n: 24, title: 'Барилга', topic: 'plan', geom: 'area',
    hue: '#3387b8', fill: 0.45, width: 1.4,
    qty: { field: 'Барилгажсан_талбай', unit: 'м²' },
    cost: { field: 'negj_une', basis: 'm2' },
    note: 'төлөв, зориулалт, өрх, хүн ам',
    facets: [
      { field: 'Barilga_ty', label: 'Барилгын төлөв' },
      { field: 'Зориулалт_m', label: 'Зориулалт' },
      { field: 'zoriulalt', label: 'Дэлгэрэнгүй зориулалт' },
      { field: 'TOROL', label: 'Бүсийн төрөл' },
      { field: 'Bar_comp', label: 'Барилгын компани' },
    ],
    paint: {
      field: 'Barilga_ty',
      values: Object.fromEntries(BUILT_STATUS.map((x) => [x.value, x.hue])),
      emptyLabel: 'Тодорхойгүй',
    },
  },

  /* ─────────── Барилгын хяналт (ХУУЧИН үйлчилгээ) ─────────── */
  {
    id: 'mon:building', n: 2, url: `${BUILDING_FS}/2`,
    title: 'Барилгын блок (гүйцэтгэл)', topic: 'monitor', geom: 'area',
    hue: '#ea580c', fill: 0.45, width: 1.4,
    noZone: true, detail: 'building', oid: 'FID',
    note: '113 блок · 4 түвшин · 16 үе шат',
    breaks: { field: 'GUITS_HV', levels: PROGRESS_LEVELS, emptyLabel: 'Мэдээлэлгүй' },
  },
  {
    id: 'mon:survey', n: 0, url: `${SURVEY_FS}/0`,
    title: 'Талбайн хяналтын тайлан', topic: 'monitor', geom: 'point',
    hue: '#0891b2', marker: 'circle', size: 13,
    noZone: true, detail: 'survey', oid: 'objectid',
    note: 'Survey123 мобайл аппаас',
  },

  /* ─────────── Инженер · дулаан ─────────── */
  {
    id: 'et:7', n: 7, title: 'Дулаан дамжуулах хуваарилах төв (шугам)', topic: 'plan',
    geom: 'line', hue: '#991b1b', dash: 'solid', width: 2.6, qty: M,
  },
  {
    id: 'et:10', n: 10, title: 'Гадна дулаан — улаан (үргэлжилсэн)', topic: 'plan',
    geom: 'line', hue: '#dc2626', dash: 'solid', width: 2.0, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:9', n: 9, title: 'Гадна дулаан — тасархай', topic: 'plan',
    geom: 'line', hue: '#fb923c', dash: 'dash', width: 1.7, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:11', n: 11, title: 'Гадна дулаан — цэнхэр шугам', topic: 'plan',
    geom: 'line', hue: '#e11d48', dash: 'dash-dot', width: 1.7, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:8', n: 8, title: 'Гадна дулаан — ногоон шугам', topic: 'plan',
    geom: 'line', hue: '#f97316', dash: 'dot', width: 1.6, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:4', n: 4, title: 'Төлөвлөж буй ДХТ', topic: 'plan',
    geom: 'point', hue: '#ef4444', marker: 'square', size: 9,
    cost: { field: 'negj_une', basis: 'sh' },
  },

  /* ─────────── Инженер · ус ─────────── */
  {
    id: 'et:18', n: 18, title: 'Төлөвлөж буй цэвэр ус', topic: 'plan',
    geom: 'line', hue: '#0284c7', dash: 'solid', width: 1.8, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:23', n: 23, title: 'Цэвэр усны эх үүсвэрийн өргөтгөл', topic: 'plan',
    geom: 'line', hue: '#38bdf8', dash: 'solid', width: 1.5, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:17', n: 17, title: 'Орон сууцны бүсийн бохирын шугам', topic: 'plan',
    geom: 'line', hue: '#0891b2', dash: 'dash', width: 1.7, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:16', n: 16, title: 'Одоо байгаа бохир ус', topic: 'plan',
    geom: 'line', hue: '#0e7490', dash: 'dash', width: 1.4, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:3', n: 3, title: 'Орон сууцны бүсийн бохирын худаг', topic: 'plan',
    geom: 'point', hue: '#155e75', marker: 'circle', size: 7,
    cost: { field: 'negj_une', basis: 'sh' },
  },
  {
    id: 'et:19', n: 19, title: 'Хөрсний ус шүүрүүлэх систем', topic: 'plan',
    geom: 'line', hue: '#7dd3fc', dash: 'dot', width: 1.6, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },

  /* ─────────── Инженер · цахилгаан ─────────── */
  {
    id: 'et:21', n: 21, title: 'Цахилгаан дамжуулах агаарын шугам 110кв', topic: 'plan',
    geom: 'line', hue: '#b45309', dash: 'dash-dot', width: 2.2, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:13', n: 13, title: 'Кабель трасс 10кв (Дамбадаржаа)', topic: 'plan',
    geom: 'line', hue: '#f59e0b', dash: 'dash-dot', width: 1.6, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:22', n: 22, title: 'Цахилгааны шугам', topic: 'plan',
    geom: 'line', hue: '#eab308', dash: 'dash-dot', width: 1.4, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:20', n: 20, title: 'Цахилгаан 0.4кв кабель трасс', topic: 'plan',
    geom: 'line', hue: '#fbbf24', dash: 'dash-dot', width: 1.1, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },

  /* ─────────── Инженер · бэлтгэл ─────────── */
  {
    id: 'et:15', n: 15, title: 'Инженерийн бэлтгэл арга хэмжээ', topic: 'plan',
    geom: 'line', hue: '#6366f1', dash: 'long-dash', width: 2.0, qty: M,
    // ⚠️ Энэ давхаргын нэгж үнэ ангилал бүрт ӨӨР (18–250 сая) — `negj_une_100m`
    //    нь мөр бүрт өөрийн утгатай тул нийлбэрийг сервер тал бодно.
    cost: { field: 'negj_une_100m', basis: 'm100' },
    facets: [{ field: 'Layer', label: 'Арга хэмжээний төрөл' }],
    // Каталогт төрлөөрөө задарна — энэ давхарга нэг мөр биш, багц арга хэмжээ
    catalogFacet: true,
  },

  /* ─────────── Зам ─────────── */
  {
    id: 'et:29', n: 29, title: 'Зам (талбай)', topic: 'plan', geom: 'area',
    hue: '#334155', fill: 0.24, width: 0.7, noZone: true,
    note: 'зөвхөн геометр — атрибутгүй',
  },
  {
    id: 'et:5', n: 5, title: 'Замын тэнхлэг', topic: 'plan', geom: 'line',
    hue: '#94a3b8', dash: 'solid', width: 0.8,
    // ⚠️ 24,251 хэрчим — жижиг масштабт бүгдийг зурвал зураг бөглөрнө
    minScale: 25000,
    noZone: true,
    qty: { field: 'urt_km', unit: 'км' },
    cost: { field: 'negjune_km', basis: 'km' },
  },
  {
    id: 'et:27', n: 27, title: 'Явган хүний зам', topic: 'plan', geom: 'area',
    hue: '#a8a29e', fill: 0.34, width: 0.6, qty: M2,
    cost: { field: 'negj_une', basis: 'm2' },
  },
  {
    id: 'et:14', n: 14, title: 'Дугуйн зам', topic: 'plan', geom: 'line',
    hue: '#f43f5e', dash: 'solid', width: 2.0, qty: M,
    cost: { field: 'negj_une', basis: 'm100' },
  },
  {
    id: 'et:12', n: 12, title: 'Гүүрэн байгууламж', topic: 'plan', geom: 'line',
    hue: '#c026d3', dash: 'solid', width: 3.0, qty: M,
    cost: { field: 'niit_une_sh', basis: 'sh' },
  },

  /* ─────────── Тээвэр ─────────── */
  {
    id: 'et:6', n: 6, title: 'Автобусны чиглэл', topic: 'plan', geom: 'line',
    hue: '#7c3aed', dash: 'long-dash', width: 2.4, qty: M,
    facets: [{ field: 'chiglel', label: 'Чиглэл' }],
  },
  {
    id: 'et:2', n: 2, title: 'Автобусны буудал', topic: 'plan', geom: 'point',
    hue: '#8b5cf6', marker: 'circle', size: 10,
    cost: { field: 'negj_une', basis: 'sh' },
  },
  {
    id: 'et:1', n: 1, title: 'LRT/BRT зогсоол', topic: 'plan', geom: 'point',
    hue: '#4f46e5', marker: 'square', size: 11,
    cost: { field: 'negj_une', basis: 'sh' },
  },

  /* ─────────── Бүс ─────────── */
  {
    id: 'et:28', n: 28, title: 'Хот төлөвлөлтийн бүс', topic: 'plan', geom: 'area',
    // Хил нь ТОД улбар шар, НАРИЙН; дүүргэлт 70% тунгалаг (alpha 0.3).
    hue: '#f97316', fill: 0.3, width: 1,
    qty: M2,
    note: '52 бүс · FAR, BCR, зогсоол, төсөв',
    facets: [
      { field: 'TOROL', label: 'Бүсийн ангилал' },
      { field: 'zoriulalt', label: 'Зориулалт' },
    ],
    // ⚠️ Зурагт зөвхөн орон сууц/олон нийт улаанаар — бусад нь жигд суурь өнгө
    paint: { field: 'TOROL', values: ZONE_MAP_TYPES, emptyLabel: ZONE_TYPE_EMPTY },
  },

  /* ─────────── Бусад ─────────── */
  {
    id: 'et:25', n: 25, title: 'Ногоон байгууламж', topic: 'plan', geom: 'area',
    hue: '#22c55e', fill: 0.34, width: 0.8, qty: M2,
    cost: { field: 'negj_une', basis: 'm2' },
    facets: [{ field: 'Layer', label: 'Хэрэгцээний ангилал' }],
  },
  {
    id: 'et:26', n: 26, title: 'Цэцэрлэгт хүрээлэн, ногоон алхалт', topic: 'plan',
    geom: 'area', hue: '#84cc16', fill: 0.32, width: 0.8, qty: M2,
    cost: { field: 'negj_une', basis: 'm2' },
    facets: [{ field: 'Layer', label: 'Ангилал' }],
  },
];

export const LAYER_BY_ID: Record<string, LayerDef> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);

/**
 * Давхарга асаах/унтраах — ХОЁР бүлэг харилцан үл багтана.
 *
 * Бүлэг доторх олон давхаргыг зэрэг асааж болно, харин «Ерөнхий төлөвлөгөө» ба
 * «Барилгын хяналт» хоёрыг ХОЛИХГҮЙ: нэгээс нь асаахад нөгөөгийнх нь бүгд
 * унтарна.
 *
 * ⚠️ Энэ нь зүгээр нэг тав тух биш, ЗӨВ БАЙДЛЫН асуудал. Хоёр бүлэг өөр
 * өгөгдлийн сангаас ирдэг: `barilga` (368, төлөвлөсөн, өртөгтэй) ба
 * `building_GOL` (113 блок, бодит гүйцэтгэл). Зэрэг асаавал газрын зурагт хоёр
 * өөр «барилга» давхцаж, дашбоард нь тэдгээрийн тоог НЭГ нийлбэрт нэмнэ —
 * харьцуулах ёстой хоёр зүйл нийлбэр болж хувирна.
 *
 * ⚠️ Дүрэм ЭНД байх ёстой: зүүн мод ба зурган дээрх удирдлага хоёулаа үүнийг
 * дуудна. Хоёр газарт хуулбарлавал нэг нь өөрчлөгдөхөд нөгөө нь хоцорно.
 */
export function toggleLayer(prev: string[], id: string): string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  const topic = LAYER_BY_ID[id]?.topic;
  return [...prev.filter((x) => LAYER_BY_ID[x]?.topic === topic), id];
}

/** Ихэнх давхарга ЕТ-ээс; хяналтынх нь өөрийн бүтэн хаягтай */
export const layerUrl = (l: LayerDef) => l.url ?? `${ET}/${l.n}`;

/** Бүсийн давхарга — нэгдсэн шүүлт, бүсийн самбар үүн дээр тогтоно */
export const ZONE_LAYER = LAYER_BY_ID['et:28'];
/** Барилгын давхарга — бүсийн самбар «энд юу баригдаж байна» гэдгийг эндээс авна */
export const BUILT_LAYER = LAYER_BY_ID['et:24'];

/** Барилгын давхаргын онцлох талбарууд */
export const BUILT_FIELDS = {
  status: 'Barilga_ty',
  purpose: 'Зориулалт_m',
  floorArea: 'Барилгын_нийт_талбай_m2',
  usable: 'Барилгажсан_талбай',
  households: 'Urhiin_too',
  population: 'Total_population',
  parking: 'Parking',
  floors: 'Давхрын_тоо_max',
  block: 'Блокы',
  company: 'Bar_comp',
} as const;

/** Бүсийн давхаргын талбарууд */
export const ZONE_FIELDS = {
  id: 'ZONE_ID',
  type: 'TOROL',
  purpose: 'zoriulalt',
  bagts: 'BAGTS_DUG',
  landM2: 'GAZAR_M2',
  landHa: 'GAZAR_GA',
  builtM2: 'BAR_M2',
  far: 'FAR',
  bcr: 'BCR',
  households: 'AIL_TOO',
  parkNorm: 'NORM_ZOGS',
  parkPlanOpen: 'SELBE_IL',
  parkPlanUnder: 'SELBE_DALD',
  parkPlan: 'SELBE_NIIT',
  parkExist: 'ET_NIIT',
  coverage: 'HURTEEMJ',
  contractor: 'GUITSETGEG',
  contractYear: 'GEREE_ON',
  budget: 'TUSUV_NIIT',
  done2025: 'GUITS_2025',
  left2026: 'ULD_2026EH',
} as const;

/* ══════════════════════ Растр ба 3D ══════════════════════ */

const UBHUB = 'https://mapservice.ubhub.mn/arcgis/rest/services/Imagery';

/**
 * Агаарын зураг — 9 ImageServer нэг бүрхэвч болж залгана. СУУРЬ тул хэрэглэгчийн
 * унтраалгагүй: газрын зураг хоёрхон төрөлтэй (2D = ортофото, 3D = меш).
 *
 * ⚠️ Проекц UTM 48N (32648), тайлын кэшгүй → `ImageryTileLayer` БИШ, динамик
 * `ImageryLayer`.
 */
export const IMAGERY = {
  title: 'Агаарын зураг (ортофото)',
  urls: [
    `${UBHUB}/Selbe_mid_1/ImageServer`,
    `${UBHUB}/selbe_mid2/ImageServer`,
    `${UBHUB}/selbe_mid3/ImageServer`,
    `${UBHUB}/selbe_mid4/ImageServer`,
    `${UBHUB}/selbe_mid5/ImageServer`,
    `${UBHUB}/selbe_mid6/ImageServer`,
    `${UBHUB}/Selbe_north_ortho1/ImageServer`,
    `${UBHUB}/Selbe_north_ortho2/ImageServer`,
    `${UBHUB}/Selbe_north_ortho3/ImageServer`,
  ],
} as const;

/**
 * 3D бодит загвар (IntegratedMesh).
 *
 * ⚠️ ПОРТ 6443 нь САНААТАЙ. 443 порт нь `nginx/1.26.3`-аар дамждаг бөгөөд тэр
 * nginx CORS-ыг өөрөө удирдаж, ArcGIS Server-ийн `Access-Control-Allow-Origin`-ыг
 * нуугаад цагаан жагсаалтаараа (зөвхөн `https://ubhub.mn`) орлуулдаг. 6443 нь
 * ArcGIS Server рүү шууд ордог тул `allowedOrigins: *` тохиргоо ажиллаж, аль ч
 * origin-д ACAO буцаана. Гэрчилгээ нь хүчинтэй.
 */
const UBHUB_SCENE = 'https://arcgis.ubhub.mn:6443/arcgis/rest/services/Hosted';

export const SCENE = {
  layers: [
    { key: 'mesh1', title: 'Бодит загвар — Сэлбэ 1', url: `${UBHUB_SCENE}/Selbewebapp_slpk/SceneServer` },
    { key: 'mesh2', title: 'Бодит загвар — Сэлбэ 2', url: `${UBHUB_SCENE}/Selbewebapp2_slpk/SceneServer` },
  ],
} as const;

/**
 * Гадаргуугийн өндөр — 3D-д ЗААВАЛ. Меш нь 1325–1440 м ортометрик өндөрт байх
 * бөгөөд хавтгай (0 м) гадаргуу дээр вектор давхаргууд түүний ~1350 м доор үлдэнэ.
 */
export const ELEVATION_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

/**
 * BIM — барилгын мэдээллийн загвар (BuildingSceneLayer).
 *
 * ⚠️ Эдгээр нь `layerType: 'Building'` бөгөөд ЗӨВХӨН SceneView-д (3D) ачаална.
 * `tiles.arcgis.com` дээрх нийтийн tile тул нэвтрэлт шаардахгүй, ACAO `*`.
 * Барилгын гадна фотограмметрийн меш (`SCENE`)-ээс ЯЛГААТАЙ: энэ нь зохион
 * бүтээсэн загвар (давхар, хана, инженерийн систем) тул BIM горимд меш нь
 * хасагдаж, эдгээр нь оронд нь харагдана.
 */
const BIM_ROOT = 'https://tiles.arcgis.com/tiles/HJzgwvlNIXssnQar/arcgis/rest/services';

export const BIM = {
  layers: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { key: `bim:71_${n}`, title: `Барилгын загвар 71_${n}`, url: `${BIM_ROOT}/71_${n}/SceneServer` };
  }),
} as const;

/* ══════════════════════ Давхаргын багц ══════════════════════ */

/**
 * БАГЦ — каталогийн жагсаалтыг задалдаг нэгж.
 *
 * ⚠️ Эдгээр нь урьд нь тус тусдаа ХАРАГДАЦ байв (зүүн талд 5 товч). Тэр нь
 * хэрэглэгчийг «инженерийн шугам аль товчинд байна вэ?» гэж таамаглахад хүргэдэг
 * байсан бөгөөд хоёр багцын давхаргыг зэрэг харах боломжгүй байлаа. Одоо бүгд
 * НЭГ «Ерөнхий мэдээлэл» харагдацад багтаж, багц нь зөвхөн жагсаалтын БҮЛЭГ
 * болов — сонголт нь давхаргын түвшинд.
 */
/**
 * ⚠️ «Инженер» ба «Зам, тээвэр» нь урьд нь ТУС БҮР нэг багц байв. Инженер нь 17
 * давхаргатай — дулаан, ус, бохир, цахилгаан бүгд НЭГ жагсаалтад холилдсон тул
 * «цэвэр усны шугам хаана байна?» гэдгийг олохын тулд бүх мөрийг уншиж гарах
 * шаардлагатай байлаа. Одоо салбар бүр өөрийн багцтай: багцын толгойн тоолуур
 * («0/4») нь тухайн салбар бүхэлдээ асаалттай эсэхийг шууд хэлнэ.
 */
export type GroupKey =
  | 'zone' | 'build'
  | 'heat' | 'sewer' | 'water' | 'power' | 'prep'
  | 'road' | 'transit'
  | 'green';

export const LAYER_GROUPS: { key: GroupKey; title: string; desc: string; icon: string; hue: string }[] = [
  { key: 'zone', title: 'Бүс', desc: 'Хот төлөвлөлтийн 52 бүс', icon: 'frame', hue: '#0d9488' },
  { key: 'build', title: 'Барилга', desc: 'Төлөв, зориулалт, өрх, өртөг', icon: 'building', hue: '#3387b8' },
  { key: 'heat', title: 'Дулааны шугам', desc: 'ДХТ, гадна дулаан', icon: 'flame', hue: '#dc2626' },
  { key: 'sewer', title: 'Бохирын шугам', desc: 'Бохир ус, худаг, хөрсний ус', icon: 'waves', hue: '#0891b2' },
  { key: 'water', title: 'Цэвэр усны шугам', desc: 'Төлөвлөсөн шугам, эх үүсвэр', icon: 'droplet', hue: '#0284c7' },
  { key: 'power', title: 'Цахилгааны шугам', desc: '110кв · 10кв · 0.4кв', icon: 'bolt', hue: '#eab308' },
  { key: 'prep', title: 'Инженерийн бэлтгэл', desc: 'Бэлтгэл арга хэмжээ', icon: 'network', hue: '#6366f1' },
  { key: 'road', title: 'Зам', desc: 'Зам, тэнхлэг, явган, дугуй, гүүр', icon: 'road', hue: '#475569' },
  { key: 'transit', title: 'Тээвэр', desc: 'Автобус, LRT/BRT', icon: 'bus', hue: '#7c3aed' },
  { key: 'green', title: 'Ногоон орчин', desc: 'Ногоон байгууламж, цэцэрлэгт хүрээлэн', icon: 'layers', hue: '#22c55e' },
];

/**
 * Багц бүрийн давхаргууд — ДАРААЛАЛ нь каталогт харагдах дараалал.
 *
 * ⚠️ ЭНД БҮХ ЕТ ДАВХАРГА байх ЁСТОЙ: `PLAN_LAYER_IDS` нь үүнээс үүсдэг бөгөөд
 * багцад ороогүй давхарга каталогоос ч, зургаас ч, нийлбэрээс ч чимээгүй
 * алга болно. Нийт 29 — багц нэмэх/хасахдаа энэ тоог шалгана.
 */
export const GROUP_LAYERS: Record<GroupKey, string[]> = {
  zone: ['et:28'],
  build: ['et:24'],
  // ДХТ (шугам) · гадна дулаан улаан/тасархай/цэнхэр/ногоон · төлөвлөж буй ДХТ
  heat: ['et:7', 'et:10', 'et:9', 'et:11', 'et:8', 'et:4'],
  /**
   * Бохирын шугам · одоо байгаа бохир ус · бохирын худаг · хөрсний ус.
   *
   * ⚠️ «Хөрсний ус шүүрүүлэх систем» (`et:19`) нь ус ЗАЙЛУУЛАХ систем тул энд
   * тавив — цэвэр усны хангамжид биш. Ангилал нь эргэлзээтэй бол зөвхөн энэ
   * мөрийг өөр багц руу зөөнө.
   */
  sewer: ['et:17', 'et:16', 'et:3', 'et:19'],
  water: ['et:18', 'et:23'],
  // 110кв агаарын · 10кв кабель трасс · цахилгааны шугам · 0.4кв кабель трасс
  power: ['et:21', 'et:13', 'et:22', 'et:20'],
  prep: ['et:15'],
  road: ['et:29', 'et:5', 'et:27', 'et:14', 'et:12'],
  transit: ['et:6', 'et:2', 'et:1'],
  green: ['et:25', 'et:26'],
};

/** Ерөнхий мэдээллийн БҮХ давхарга — багцын дарааллаар */
export const PLAN_LAYER_IDS: string[] = LAYER_GROUPS.flatMap((g) => GROUP_LAYERS[g.key]);

/**
 * БАРИЛГЫН ХЯНАЛТЫН багц — каталогт тусдаа бүлэг болж гарна.
 *
 * ⚠️ `LAYER_GROUPS`-т ОРУУЛААГҮЙ: тэр жагсаалт нь `PLAN_LAYER_IDS`-ыг үүсгэдэг
 * бөгөөд хяналтын давхаргууд тэнд орвол «Ерөнхий мэдээлэл»-ийн нийлбэрт
 * (объектын тоо, багцын хэмжээ) хуучин үйлчилгээний өгөгдөл нэмэгдэнэ.
 */
export const MONITOR_GROUP = {
  key: 'monitor' as const,
  title: 'Барилгын хяналт',
  desc: 'Блокийн гүйцэтгэл, талбайн тайлан',
  icon: 'target',
  hue: '#ea580c',
};
export const MONITOR_LAYER_IDS: string[] = ['mon:building', 'mon:survey'];

/** Каталогт харуулах бүлгүүд — харагдацаас хамаарна */
export const catalogGroups = (view: 'plan' | 'monitor') =>
  view === 'monitor'
    ? [
      { ...MONITOR_GROUP, ids: MONITOR_LAYER_IDS },
      ...LAYER_GROUPS.map((g) => ({ ...g, ids: GROUP_LAYERS[g.key] })),
    ]
    : LAYER_GROUPS.map((g) => ({ ...g, ids: GROUP_LAYERS[g.key] }));

/** Давхарга аль багцад хамаарах вэ (хяналтынх багцгүй) */
export const groupOf = (id: string): GroupKey | null =>
  (LAYER_GROUPS.find((g) => GROUP_LAYERS[g.key].includes(id))?.key ?? null);

/* ══════════════════════ Харагдац ══════════════════════ */

/**
 * ХАРАГДАЦ — ХОЁРХОН: ерөнхий мэдээлэл vs барилгын хяналт.
 *
 * ⚠️ Энэ хоёр нь ӨӨР өгөгдлийн сан дээр тогтдог (шинэ ЕТ vs хуучин гүйцэтгэлийн
 * үйлчилгээ) бөгөөд өөр асуултад хариулдаг: юу барих vs юу баригдсан. Бусад
 * бүх хуваалт (барилга/инженер/зам…) нь НЭГ үйлчилгээний дотоод сэдэв тул
 * харагдац биш, БАГЦ болов.
 *
 * `layers` — каталогт багтах бүх давхарга.
 * `initial` — харагдац сонгоход зурагт АСААЛТТАЙ гарах давхаргууд.
 *   ⚠️ Ерөнхий мэдээллийн 29 давхаргыг бүгдийг зэрэг асаавал зураг бөглөрч,
 *   хэрэглэгч юу ч ялгаж харахгүй. Бүсээр эхэлж, үлдсэнийг каталогоос асаана.
 */
export type ViewKey = 'dashboard' | 'plan' | 'monitor' | 'analysis';

export const VIEWS: {
  key: ViewKey;
  title: string;
  desc: string;
  icon: string;
  hue: string;
  layers: string[];
  initial: string[];
  /**
   * ⚠️ ТУСДАА бүрэн дэлгэцтэй харагдац — порталын каталог, самбарыг ОГТ
   * зурахгүй, өөрийн бүтэцтэй. Analysis (Suitability) ба Dashboard хоёулаа
   * ийм: газрын зургаа өөрсдөө байрлуулна. Каталог нээх, `usePlanTotals`
   * дуудах шаардлагагүй тул `standalone`-оор ялгаж, тэдгээрийг алгасна.
   */
  standalone?: true;
}[] = [
  /**
   * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ТОЙРСОН үзүүлэлтийн самбар.
   *
   * Апп нээгдэхэд эхэлж харагдах ерөнхий тойм: төв дунд газрын зураг, эргэн
   * тойронд KPI, дугуй диаграм, багана график, индикатор. Бүх тоо ArcGIS-ээс
   * ажиллах үедээ шууд татагдана.
   *
   * ⚠️ Порталын самбар/каталогийг ашиглахгүй: `Portal` нь `Dashboard`-ыг бүтэн
   * талбайд зурдаг бөгөөд газрын зургийг ДӨРВӨН талаас (KPI дээр, зүүн/баруун
   * картууд, доод картууд) диаграмаар хүрээлнэ. Тиймээс `standalone`.
   */
  {
    key: 'dashboard', title: 'Ерөнхий дашбоард',
    desc: 'Газрын зургийг тойрсон нэгдсэн үзүүлэлт',
    icon: 'grid', hue: '#0ea5e9',
    layers: ['et:28', 'et:24'],
    initial: ['et:28', 'et:24'],
    standalone: true,
  },
  {
    key: 'plan', title: 'Ерөнхий мэдээлэл', desc: 'Бүс · барилга · инженер · зам · ногоон орчин',
    icon: 'layers', hue: '#0d9488',
    layers: PLAN_LAYER_IDS,
    /**
     * ⚠️ ХООСОН — нээгдэхэд ямар ч давхарга сонгогдоогүй, каталогт чек байхгүй,
     * баруун талд ерөнхий тойм харагдана. Урьд нь бүс (`et:28`) анхдагчаар
     * асаалттай байсан нь каталогт чектэй харагдаж, хэрэглэгч «би сонгоогүй
     * атал яагаад чектэй вэ» гэж эргэлздэг байлаа. Хэрэглэгч багц эсвэл
     * давхарга дараад л зурагт объект нэмнэ.
     */
    initial: [],
  },
  {
    key: 'monitor', title: 'Барилгын хяналт', desc: 'Гүйцэтгэл, талбайн тайлан',
    icon: 'target', hue: '#ea580c',
    layers: ['mon:building', 'mon:survey'],
    initial: ['mon:building', 'mon:survey'],
  },
  /**
   * АНАЛИЗ — Suitability Modeler.
   *
   * ⚠️ Энэ харагдац нь порталын зураг ба самбарыг ОГТ ашиглахгүй: `Portal` нь
   * `Suitability` модулийг бүтэн талбайд зурдаг бөгөөд тэр нь өөрийн газрын
   * зураг, өөрийн 3 багана, өөрийн харанхуй палитртай (эх аппын дизайн).
   * `layers`/`initial` нь зөвхөн төрлийн шаардлагыг хангахад хоосон байна.
   */
  {
    key: 'analysis', title: 'Тохиромжтой байдлын үнэлгээ',
    desc: 'БНбД норм, эдийн засгийн үр ашиг',
    icon: 'chart', hue: '#7c3aed',
    layers: [],
    initial: [],
    standalone: true,
  },
];

export const VIEW_BY_KEY: Record<ViewKey, (typeof VIEWS)[number]> = Object.fromEntries(
  VIEWS.map((v) => [v.key, v]),
) as Record<ViewKey, (typeof VIEWS)[number]>;

/** Апп нээгдэхэд — газрын зургийг тойрсон ерөнхий дашбоард */
export const DEFAULT_VIEW: ViewKey = 'dashboard';

/**
 * Апп нээгдэхэд асаалттай давхаргууд — БҮС.
 *
 * Бүс бол төслийн бүтцийн нэгж: бүс дээр дарахад тэнд юу төлөвлөгдсөн, юу нь
 * баригдаж байгаа, хэдэн төгрөг болохыг нэг дор харна. Барилгын давхаргыг
 * анхнаасаа асаахгүй — 368 полигон нь бүсийн хилийг бүрхэнэ.
 */
export const DEFAULT_VISIBLE: string[] = [ZONE_LAYER.id];

/* ══════════════════════ Зурах дараалал ══════════════════════ */

/**
 * Талбай → шугам → цэг.
 *
 * ⚠️ Каталогийн дарааллаар зурвал «Зам (талбай)» нь «Дугуйн зам», «Гүүр»
 * (шугам)-ыг бүрэн дардаг — хэрэглэгч давхаргаа асаасан ч зурагт юу ч
 * өөрчлөгдөхгүй мэт харагдана.
 */
export const drawOrder = (id: string): number => {
  // Бүс бол АГУУЛАГЧ — хамгийн доор (барилга нь дүүргэлтийнх нь дээр гарна).
  if (id === ZONE_LAYER.id) return -1;
  const g = LAYER_BY_ID[id]?.geom;
  return g === 'point' ? 2 : g === 'line' ? 1 : 0;
};

/** Зураасны хээ → dash загвар. Газрын зураг ба тайлбар нэг эх сурвалжтай. */
export const DASH_PATTERN: Record<NonNullable<LayerDef['dash']>, number[] | null> = {
  solid: null,
  dash: [7, 4],
  dot: [1.5, 3],
  'dash-dot': [8, 3, 1.5, 3],
  'long-dash': [14, 6],
};
