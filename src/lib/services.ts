/**
 * Сэлбэ портал — ArcGIS эх сурвалжийн ГАНЦ эх үүсвэр.
 *
 * Модуль бүр = нэг давхарга + түүний дашбоард. Хэрэглэгч давхаргыг идэвхжүүлэхэд
 * тухайн давхаргын дашбоард нээгдэнэ.
 *
 * Бүх тоо ажиллах үедээ FeatureServer-ээс шууд татагдана. Энэ файлд ямар ч
 * "жишиг", "демо", "зорилтот" тоо байхгүй.
 */

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';
const AP1 = 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services';

/**
 * Суурь зураг — нийтийн вектор тайлын portal item.
 *
 * ⚠️ ArcGIS 4.x-ийн нэрлэсэн суурь зураг (`gray-vector` гэх мэт) нь basemap styles
 * үйлчилгээ рүү очдог бөгөөд API key ШААРДДАГ. Түлхүүргүй бол суурь зураг чимээгүй
 * ачаалагдахгүй. Portal item-ээр дуудсан вектор тайл нийтийн бөгөөд түлхүүр
 * шаардахгүй тул үүнийг ашиглана.
 */
export const BASEMAP = {
  light: '291da5eab3a0412593b66d384379f89f', // World Light Gray Base
  dark: '5e9b3685f4c24d8781073dd928ebda50', // World Dark Gray Base
} as const;

/**
 * ArcGIS Online нэвтрэлт (OAuth 2.0, PKCE — сервергүй статик сайтад тохирно).
 *
 * ⚠️ Энэ нь ЗӨВХӨН UI-г хаана. Өгөгдөл нь одоо нийтийн FeatureServer дээр тул
 * жинхэнэ хамгаалалт биш — түүнд давхаргыг нууц болгож, query.ts-д токен нэмэх
 * шаардлагатай ([[server-side-security-pending]]).
 *
 * ТОХИРУУЛАХ (ArcGIS Online дээр):
 *  1. OAuth 2.0 апп үүсгэж `appId` (Client ID) авна.
 *  2. Redirect URL-д `https://selbe.monmap.mn` ба `http://localhost:8123` нэмнэ.
 *  3. `appId`, `portalUrl`-ыг доор бөглөнө. `allowedOrgId` бол зөвхөн танай org-ийн
 *     хэрэглэгч нэвтэрнэ (хоосон = ямар ч ArcGIS account). Нэвтэрсний дараа консол
 *     дээр өөрийн `orgId` хэвлэгдэнэ — түүнийг хуулж энд тавина.
 *
 * `appId` хоосон бол нэвтрэлт УНТРААЛТТАЙ (апп хуучнаар нээлттэй ажиллана).
 */
export const AUTH = {
  appId: 'ZPJRqk1iiYcjYRLv',                   // ArcGIS Online OAuth аппын Client ID
  portalUrl: 'https://monmap.maps.arcgis.com', // MonMap LLC байгууллагын portal
  allowedOrgId: 'HJzgwvlNIXssnQar',            // Зөвхөн MonMap LLC-ийн хэрэглэгч нэвтэрнэ
} as const;

/**
 * Эхлэх байрлал — багцын хилийн жинхэнэ төв (bagts_hil-ийн WGS84 хүрээнээс).
 * ⚠️ Хуучин апп 47.9184-д төвлөрдөг байсан нь дата байрлалаас ~5.5 км өмнө байв;
 * зөвхөн layer.fullExtent рүү үсэрснээр л зөв газраа очдог байлаа.
 */
export const HOME = { lon: 106.916, lat: 47.9674, zoom: 15 } as const;

/* ══════════════════════ Модулиуд ══════════════════════ */

export type ModuleKey =
  | 'bagts'      // Багцын хил — үндсэн хүрээ
  | 'zone'       // Бүсчлэл
  | 'building'   // Барилгын явц
  | 'parcel'     // Үлдсэн нэгж талбар
  | 'estimator'  // Газрын үнэ тооцоолуур
  | 'general'    // Ерөнхий мэдээлэл
  | 'utility'    // Шугам сүлжээ ба зам
  | 'survey';    // Талбайн хяналт (амьд)

/**
 * Давхаргын жагсаалт — ЭНЭ ДАРААЛЛААР харагдана.
 * Эхний модуль нь апп нээгдэхэд анхдагчаар сонгогдоно (`Portal`).
 */
export const MODULES: {
  key: ModuleKey;
  title: string;
  desc: string;
  icon: string;
  /** Модулийн өнгө — газрын зураг, график, идэвхтэй төлөвт нэг ижил */
  hue: string;
}[] = [
  { key: 'general', title: 'Ерөнхий мэдээлэл', desc: 'Зам, ногоон байгууламж, гэр хороолол, гол', icon: 'layers', hue: '#16a34a' },
  { key: 'bagts', title: 'Багцын хил', desc: 'Төслийн үндсэн хүрээ ба багц тус бүрийн явц', icon: 'frame', hue: '#2563eb' },
  { key: 'zone', title: 'Бүсчлэл', desc: 'Хот төлөвлөлтийн бүс, нягтрал, төсөв', icon: 'grid', hue: '#7c3aed' },
  { key: 'building', title: 'Барилгын явц', desc: 'Блокийн гүйцэтгэл, үе шат, гүйцэтгэгч', icon: 'building', hue: '#ea580c' },
  { key: 'parcel', title: 'Үлдсэн нэгж талбар', desc: 'Газар чөлөөлөлтийн явц, эзэмшигч, шалтгаан', icon: 'pin', hue: '#dc2626' },
  { key: 'estimator', title: 'Газрын үнэ тооцоолуур', desc: 'Талбай зурж, доторх барилгын үнэлгээг тооцох', icon: 'calc', hue: '#0d9488' },
  { key: 'utility', title: 'Шугам сүлжээ ба зам', desc: 'Инженерийн шугам, замын план', icon: 'network', hue: '#ca8a04' },
  { key: 'survey', title: 'Талбайн хяналт', desc: 'Бодит цагийн талбайн хяналтын бүртгэл', icon: 'radio', hue: '#0891b2' },
];

/** Апп нээгдэхэд анхдагчаар сонгогдох модуль — жагсаалтын эхнийх */
export const DEFAULT_MODULE: ModuleKey = MODULES[0].key;

/* ══════════════════════ Давхаргууд ══════════════════════ */

/* ───────────────── Төслийн үндсэн хил ─────────────────
 * Эдгээр нь тодорхой модульд харьяалагдахгүй — БҮХ горимд байнга харагдана.
 * Зөвхөн зураас (дүүргэлтгүй), дарж сонгох боломжгүй, шүүлтэд оролцохгүй.
 */
export const BOUNDARY = {
  /** Төлөвлөлтийн талбай · 1 полигон · Hec_area = 159.57 га */
  plan: {
    url: `${HJ}/Tuluvlult_talbai/FeatureServer/2`,
    oid: 'OBJECTID',
    title: 'Төлөвлөлтийн талбай',
    areaField: 'Hec_area',
    /** Тасархай зураас */
    style: 'dash' as const,
  },
  /**
   * Сэлбэ-2 бүс · 2 полигон · area_ha = 13.32 + …
   * ⚠️ Үйлчилгээний нэр кирилл (`Сэлбэ_2_khil`) тул URL-д percent-encoding хийсэн.
   */
  selbe2: {
    url: `${AP1}/%D0%A1%D1%8D%D0%BB%D0%B1%D1%8D_2_khil/FeatureServer/0`,
    oid: 'FID',
    title: 'Сэлбэ-2 бүс',
    areaField: 'area_ha',
    /** Цэгэн зураас — төлөвлөлтийн талбайгаас ялгагдана */
    style: 'dot' as const,
  },
} as const;

/** Хилийн зураасны өнгө — модулийн аль ч өнгөтэй давхцахгүй, хоёр горимд уншигдана */
export const BOUNDARY_HUE = '#94a3b8';

/** 1 · Багцын хил — төслийн үндсэн хүрээ · 10 полигон */
export const BAGTS = {
  url: `${HJ}/bagts_hil/FeatureServer/34`,
  oid: 'OBJECTID',
  fields: { name: 'BAGTS', area: 'Shape__Area' },
} as const;

/** 2 · Бүсчлэл — хот төлөвлөлтийн бүс · 84 полигон */
export const ZONE = {
  url: `${HJ}/Busiin_medeelel/FeatureServer/45`,
  oid: 'FID',
  fields: {
    id: 'ZONE_ID',
    type: 'TOROL',
    households: 'AIL_TOO',
    landHa: 'GAZAR_GA',
    builtM2: 'BAR_M2',
    far: 'FAR',
    bcr: 'BCR',
    /** Зогсоолын норм ба бодит тоо */
    parkNorm: 'NORM_ZOGS',
    parkOpen: 'SELBE_IL',
    parkUnder: 'SELBE_DALD',
    parkTotal: 'SELBE_NIIT',
    /** Хүртээмж (%) */
    coverage: 'HURTEEMJ',
    contractor: 'GUITSETGEG',
    contractYear: 'GEREE_ON',
    /** Төсөв — зөвхөн Багц-1, Багц-2 бүсэд бөглөгдсөн */
    budget: 'TUSUV_NIIT',
    done2025: 'GUITS_2025',
    left2026: 'ULD_2026EH',
  },
} as const;

/** 3 · Барилгын явц · 112 блок */
export const BUILDING = {
  url: `${HJ}/building_GOL_barigdaj_ehelsen/FeatureServer/2`,
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
 * Барилгын гүйцэтгэлийн 4 түвшин.
 * `GUITS_HV` -1 = тухайн ажил байхгүй, тиймээс эхний бүлэг 0-оос эхэлнэ.
 */
export const PROGRESS_LEVELS = [
  { key: 'l1', label: 'Эхэлсэн', range: '0–25%', min: 0, max: 25, color: '#dc2626' },
  { key: 'l2', label: 'Явцад', range: '25–50%', min: 25, max: 50, color: '#ea580c' },
  { key: 'l3', label: 'Дуусах шатанд', range: '50–75%', min: 50, max: 75, color: '#ca8a04' },
  { key: 'l4', label: 'Бэлэн болох', range: '75–100%', min: 75, max: 101, color: '#16a34a' },
] as const;

/** Барилгын 16 үе шат (%) · -1 = тухайн ажил байхгүй */
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

/**
 * 4 · Үлдсэн нэгж талбар — газар чөлөөлөлт · 217 полигон
 *
 * Талбарын нэрс холимог: зарим нь кирилл (`Овог__нэр`, `Хаяг`, `явцын_мэдээ`),
 * зарим нь латин (`area_m2`, `rigth_type`). Үйлчилгээн дээрх бичиглэлээр нь авав.
 * ⚠️ `rigth_type` нь `өмчлөх` (жижиг) ба `Эзэмших` (том) хоёуланг агуулна.
 */
export const PARCEL = {
  url: `${HJ}/20260226_uldsen_negj_talbar_selbe/FeatureServer/35`,
  oid: 'OBJECTID',
  fields: {
    area: 'area_m2',
    right: 'rigth_type',
    owner: 'Овог__нэр',
    address: 'Хаяг',
    /** Чөлөөлөлтийн явц: зөвшилцөх / үлдэх саналтай / АТД / гэрээлсэн / маргаантай… */
    status: 'явцын_мэдээ',
    note: 'Тайлбар',
    landuse: 'landuse_de',
    parcelNo: 'parcel_id',
  },
} as const;

/** Чөлөөлөлтийн явцын төлөв → өнгө. Үйлчилгээнд байгаа утгууд. */
export const PARCEL_STATUS: Record<string, string> = {
  'гэрээлсэн': '#16a34a',
  'зөвшилцөх': '#0891b2',
  'АТД': '#7c3aed',
  'үлдэх саналтай': '#ca8a04',
  'үнийн дүн зөвшөөрөөгүй': '#ea580c',
  'маргаантай': '#dc2626',
};
export const PARCEL_STATUS_EMPTY = 'Бүртгэгдээгүй';

/**
 * 5а · Үнэ тооцоолуур — кадастрын нэгж талбар · 43,041 · AP1
 *
 * Тооцоолуур нь газар чөлөөлөлтийн 217 талбар БИШ, бүрэн кадастр дээр ажиллана.
 * ⚠️ Энэ давхаргын проекц нь wkid-гүй, зөвхөн WKT (UTM 48N). Веб Меркаторын AOI-аар
 *    асуухад сервер өөрөө проекц хийж чадаж байгааг шалгасан.
 */
export const CADASTRE = {
  url: `${AP1}/Selbe_parcel/FeatureServer/0`,
  oid: 'OBJECTID',
  fields: {
    area: 'area_m2',
    /** өмчлөх / эзэмших / ашиглах (бүгд жижиг үсгээр) */
    right: 'rigth_type',
    landuse: 'landuse_de',
    address: 'address_ne',
    parcelNo: 'parcel_id',
    /** Хүчинтэй / … */
    status: 'descriptio',
    decision: 'decision_d',
    soum: 'soum',
  },
} as const;

/**
 * 5б · Үнэ тооцоолуур — барилгын үнэлгээ · 36,586 · AP1
 * Кадастрын давхаргад төгрөгийн талбар байхгүй тул мөнгөн дүнг эндээс авна.
 */
export const VALUATION = {
  url: `${AP1}/selbe_B/FeatureServer/0`,
  oid: 'FID',
  fields: {
    total: 'NIIT_UNE',
    perM2: 'MKV_UNE',
    rent: 'SARUUN_TUR',
    rooms: 'OROO_TOO',
    floors: 'DAVHAR_TOO',
    type: 'TOROL',
    material: 'MATERIAL',
    jobs: 'AJLIIN_BAI',
    capacity: 'BAGTSAAMAI',
    area: 'area_m2',
  },
} as const;

/** 6 · Ерөнхий мэдээлэл — Selbe_talbain_hynalt (7 давхарга) */
export type GeneralKey = 'green' | 'road' | 'sidewalk' | 'bike' | 'ger' | 'river' | 'built';

export const GENERAL: Record<GeneralKey, {
  url: string;
  title: string;
  hue: string;
  /** Статистикт харуулах ангилалын талбарууд */
  facets: { field: string; label: string }[];
  /** Нэмэлт нийлбэр */
  sums?: { field: string; label: string; unit?: string }[];
}> = {
  built: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/6`, title: 'Барилга', hue: '#3387b8',
    facets: [
      { field: 'Zoriulalt', label: 'Зориулалт' },
      { field: 'Halaalt', label: 'Халаалт' },
      { field: 'Aram_tolov', label: 'Араг төлөв' },
      { field: 'Umch', label: 'Өмчлөл' },
      { field: 'Lift', label: 'Лифт' },
    ],
    sums: [{ field: 'Ail_too', label: 'Айлын тоо' }, { field: 'Hun_too', label: 'Оршин суугч' }],
  },
  green: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/1`, title: 'Ногоон байгууламж', hue: '#16a34a',
    facets: [
      { field: 'Torol', label: 'Төрөл' },
      { field: 'Usalgaa', label: 'Услалттай эсэх' },
      { field: 'Archlagch', label: 'Арчлагч' },
    ],
    sums: [{ field: 'Too', label: 'Ургамлын тоо' }],
  },
  road: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/2`, title: 'Зам', hue: '#64748b',
    facets: [
      { field: 'Torol', label: 'Төрөл' },
      { field: 'Huchilt', label: 'Хучилт' },
      { field: 'Gerel', label: 'Гэрэлтүүлэгтэй эсэх' },
    ],
  },
  sidewalk: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/0`, title: 'Явган хүний зам', hue: '#0891b2',
    facets: [
      { field: 'Gadarguu', label: 'Гадаргуу' },
      { field: 'Tolov', label: 'Төлөв' },
      { field: 'Gerel', label: 'Гэрэлтүүлэгтэй эсэх' },
    ],
  },
  bike: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/3`, title: 'Дугуйн зам', hue: '#7c3aed',
    facets: [
      { field: 'Huchilt', label: 'Хучилт' },
      { field: 'Tusgaar', label: 'Тусгаарлалт' },
      { field: 'Gerel', label: 'Гэрэлтүүлэгтэй эсэх' },
    ],
  },
  ger: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/4`, title: 'Гэр хороолол', hue: '#ea580c',
    facets: [
      { field: 'Halaalt', label: 'Халаалт' },
      { field: 'Us', label: 'Усны эх үүсвэр' },
      { field: 'Tsahilgaan', label: 'Цахилгаантай эсэх' },
      { field: 'Ezemshil', label: 'Эзэмшил' },
    ],
    sums: [{ field: 'Hun_too', label: 'Оршин суугч' }, { field: 'Hashaa_m2', label: 'Хашааны талбай', unit: 'м²' }],
  },
  river: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/5`, title: 'Гол', hue: '#0284c7',
    facets: [
      { field: 'Chanar', label: 'Усны чанар' },
      { field: 'Ereg', label: 'Эрэг' },
      { field: 'Ursgal', label: 'Урсгал' },
    ],
  },
};

/** Ерөнхий мэдээллийн давхаргад нийтлэг талбар */
export const GENERAL_FIELDS = {
  oid: 'FID',
  /** Бодит гүйцэтгэл (%) */
  progress: 'Bod_guits',
  /** Төлөвлөсөн дуусах ОГНОО (хувь биш!) */
  dueDate: 'Tol_guits',
  area: 'Shape__Area',
  length: 'Shape_Leng',
} as const;

/** 7 · Шугам сүлжээ ба зам — Road_shugam_suljee (CAD экспорт: зөвхөн урт/талбай) */
export type UtilKey = 'sewer' | 'heat' | 'storm' | 'roadplan';

export const UTILITY: Record<UtilKey, { url: string; title: string; hue: string; kind: 'line' | 'area' }> = {
  heat: { url: `${HJ}/Road_shugam_suljee/FeatureServer/1`, title: 'Гадна дулаан хангамж', hue: '#dc2626', kind: 'line' },
  sewer: { url: `${HJ}/Road_shugam_suljee/FeatureServer/0`, title: 'Ариутгах татуурга', hue: '#16a34a', kind: 'line' },
  storm: { url: `${HJ}/Road_shugam_suljee/FeatureServer/2`, title: 'Борооны ус зайлуулах', hue: '#0891b2', kind: 'line' },
  roadplan: { url: `${HJ}/Road_shugam_suljee/FeatureServer/3`, title: 'Замын план', hue: '#64748b', kind: 'area' },
};

/**
 * 8 · Талбайн хяналт — Survey123 мобайл аппын үр дүн.
 * Цэгийн давхарга + 5 холбоост хүснэгт (бэлтгэл, шороо, суурь, рам, асуудал).
 */
const SURVEY_FS = `${HJ}/survey123_e98bd4b642f84c9fb688f754de7cb83a_results/FeatureServer`;

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
