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
  appId: 'ZPJRqk1iiYcjYRLv',            // ArcGIS Online OAuth аппын Client ID
  /**
   * ⚠️ Байгууллагын хаяг (`https://monmap.maps.arcgis.com`) БИШ, ерөнхий хаяг байх ёстой.
   *
   * Байгууллагын домэйн нь ArcGIS Online-ы «Allowed origins» цагаан жагсаалтыг мөрдөнө.
   * Тэр жагсаалтад `https://selbe.monmap.mn` байгаа ч `http://localhost:8123` алга тул
   * dev дээр `/sharing/rest/oauth2/token` рүү явах токен солилт CORS-д хаагдаж,
   * нэвтрэлт чимээгүй бүтэлгүйтэж байв. `www.arcgis.com` нь аль ч origin-ыг зөвшөөрнө.
   *
   * Байгууллагаар хязгаарлах ажлыг доорх `allowedOrgId` хийж байгаа тул энэ нь
   * хамгаалалтыг сулруулахгүй.
   */
  portalUrl: 'https://www.arcgis.com',
  allowedOrgId: 'HJzgwvlNIXssnQar',     // Зөвхөн MonMap LLC-ийн хэрэглэгч нэвтэрнэ
} as const;

/**
 * Эхлэх байрлал — багцын хилийн жинхэнэ төв (bagts_hil-ийн WGS84 хүрээнээс).
 * ⚠️ Хуучин апп 47.9184-д төвлөрдөг байсан нь дата байрлалаас ~5.5 км өмнө байв;
 * зөвхөн layer.fullExtent рүү үсэрснээр л зөв газраа очдог байлаа.
 */
export const HOME = { lon: 106.916, lat: 47.9674, zoom: 15 } as const;

/* ══════════════════════ Модулиуд ══════════════════════ */

/**
 * ⚠️ 6 модулийг 4 болгож нэгтгэсэн (хэрэглэгчийн хүсэлтээр):
 *   · `utility`   → `general`  (хоёулаа «физикт юу байгаа» — мөн «Зам» хоёр модульд
 *                               давхардаж, хэрэглэгчийг төөрөгдүүлдэг байсныг арилгав)
 *   · `estimator` → `land`     (хоёулаа газартай холбоотой: чөлөөлөлт ба үнэлгээ)
 * `parcel` түлхүүр `land` болов — агуулгыг нь илүү зөв илэрхийлнэ.
 */
export type ModuleKey =
  | 'general'    // Ерөнхий мэдээлэл ба дэд бүтэц
  // ⚠️ 'zone' модулийг 2026-07-20-нд хассан. Бүсийн ДАВХАРГА хэвээр — «Ерөнхий
  //    мэдээлэл»-ийн жагсаалтаас зээлээр харагдана (`BORROWED`). Зөвхөн тусдаа
  //    модуль ба түүний төсөв/зогсоолын дашбоард алга болсон.
  | 'building'   // Барилгын явц ба хяналт (төлөвлөгөө + Survey123 талбайн тайлан)
  | 'land';      // Газар — чөлөөлөлт ба үнэлгээ

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
  { key: 'general', title: 'Ерөнхий мэдээлэл', desc: 'Барилга, зам, ногоон байгууламж, инженерийн шугам', icon: 'layers', hue: '#16a34a' },
  { key: 'building', title: 'Барилгын явц ба хяналт', desc: 'Блокийн гүйцэтгэл ба талбайн хяналтын тайлан', icon: 'building', hue: '#ea580c' },
  { key: 'land', title: 'Газар', desc: 'Чөлөөлөлтийн явц ба үнэлгээний тооцоолуур', icon: 'pin', hue: '#dc2626' },
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

/**
 * Хилийн зураасны өнгө — модулийн аль ч өнгөтэй давхцахгүй, БҮХ дэвсгэр дээр уншигдана.
 *
 * ⚠️ Энэ зураас ГУРВАН өөр дэвсгэр дээр зурагдана: агаарын зураг (дунд өнгө),
 * цайвар суурь (бараг цагаан), харанхуй суурь (бараг хар). Саарал өнгө гурвуулангийн
 * аль нэгэнд нь заавал уусна — хэмжсэн хамгийн бага ΔE:
 *   `#94a3b8` → 25 · `#475569` → 21 · `#334155` → 16   (бүгд сул)
 *
 * Хроматик өнгө л энэ гурвыг зэрэг давна: `#ec4899` → хамгийн бага ΔE 71.
 * Тасархай/цэгэн зураас тул давамгайлахгүй, мөн модулийн 7 өнгөний алинтай ч
 * андуурагдахгүй (хамгийн ойр нь ягаан ундрал `#7c3aed` — нүдэнд тод ялгаатай).
 */
export const BOUNDARY_HUE = '#ec4899';

/**
 * ⚠️ «Багцын хил» (`bagts_hil/FeatureServer/34`) давхаргыг БҮРМӨСӨН хассан.
 * Багц гэдэг ОЙЛГОЛТ хэвээр — барилга, бүс, талбайн тайлан бүгд `BAGTS`/`bagts`
 * талбараар багцаа заасаар байна. Зөвхөн ХИЛИЙН давхарга ба түүний модуль алга.
 */

/** 1 · Бүсчлэл — хот төлөвлөлтийн бүс · 84 полигон */
export const ZONE = {
  /**
   * ⚠️ 2026-07-20-нд `Busiin_medeelel` → `Busiin_medeelel_last` руу сольсон.
   * Хуучин үйлчилгээ хүрэхгүй болсон (499 «Item does not exist or is inaccessible»),
   * шинэ нь бүх хуучин талбарыг агуулаад дээр нь 11 нэмэлт талбартай. Мөн 84
   * полигон (31 давхардсан хуулбар) байсныг 59 болгож цэвэрлэсэн.
   */
  url: `${HJ}/Busiin_medeelel_last/FeatureServer/0`,
  oid: 'FID',
  fields: {
    id: 'ZONE_ID',
    /** Бүсийн ангилал — ШИНЭ үйлчилгээнд цэвэр 5 утгатай (хуучинд 32 эмх замбараагүй) */
    type: 'TOROL',
    /** Нарийвчилсан зориулалт (цэцэрлэг, сургууль, худалдаа…) */
    purpose: 'zoriulalt',
    bagts: 'BAGTS_DUG',
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
    /** Одоо байгаа зогсоол — ШИНЭ */
    existOpen: 'ET_IL',
    existUnder: 'ET_DALD',
    existTotal: 'ET_NIIT',
    /** Хүртээмж (%) */
    coverage: 'HURTEEMJ',
    contractor: 'GUITSETGEG',
    contractYear: 'GEREE_ON',
    /** Төсөв — зөвхөн зарим бүсэд бөглөгдсөн */
    budget: 'TUSUV_NIIT',
    done2025: 'GUITS_2025',
    left2026: 'ULD_2026EH',
  },
} as const;

/**
 * Бүсийн ангиллын өнгө — `TOROL`-ийн 5 утга.
 *
 * ⚠️ Урьд нь энд түүхий 32 утгыг түлхүүр үгээр бүлэглэдэг `ZONE_CATEGORIES`,
 * `zoneCategory()`, `zoneCategoryArcade()` гурав байв. Шинэ үйлчилгээний `TOROL`
 * аль хэдийн цэвэр ангилал тул тэр бүхэн ХЭРЭГГҮЙ болж, устгагдсан.
 */
export const ZONE_TYPES: Record<string, string> = {
  'Орон сууцны бүс': '#eab308',
  'Олон нийтийн бүс': '#dc2626',
  'Нийгмийн дэд бүтцийн бүс': '#2563eb',
  'Х бүс': '#7c3aed',
  'Одоо байгаа барилга байгууламж': '#78716c',
};
export const ZONE_TYPE_EMPTY = 'Тодорхойгүй';
export const ZONE_TYPE_EMPTY_HUE = '#94a3b8';

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
  /**
   * ⚠️ 2026-07-20-нд `20260226_uldsen_negj_talbar_selbe` → энэ рүү сольсон.
   * 217 → 224 объект, мөн явцын мэдээ ЭРС бүрэн болсон: хоосон 86% → 19%.
   * Хуучин бүх талбар хэвээр, дээр нь Блок, Бүс, Зоriулалт, Гэрээ нэмэгдсэн.
   */
  url: `${HJ}/%D0%A7%D3%A9%D0%BB%D3%A9%D3%A9%D0%BB%D3%A9%D0%B3%D0%B4%D3%A9%D3%A9%D0%B3%D2%AF%D0%B9_%D0%BD%D1%8D%D0%B3%D0%B6_%D1%82%D0%B0%D0%BB%D0%B1%D0%B0%D1%80_20260718/FeatureServer/67`,
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
    /**
     * ШИНЭ үйлчилгээнд нэмэгдсэн талбарууд.
     * ⚠️ Бөглөгдсөн хувийг хэмжсэн — 10%-иас доош бөглөлттэйг нь оруулаагүй
     * (Zahiramj 4%, утас 4%, right_type 4%, Demjsen 3%): самбарт байнга «—»
     * харагдвал мэдээлэл байгаа мэт төөрөгдүүлнэ.
     */
    block: 'Блок',            // 14%
    zone: 'Бүс',              // 67%
    purpose: 'Zoriulalt',     // 21%
    turul: 'Turul',           // 37%
    state: 'descriptio',      // 17% — Хүчинтэй / Шинэчлэх
    street: 'address_st',     // 83%
    decisionNo: 'decision_n', // 17%
    decisionDate: 'decision_d',
    contractNo: 'contract_n', // 16%
    phone: 'utas',            // 12%
    validFrom: 'valid_from',  // 78%
    areaHa: 'Area_hec',       // 95%
    ownerAlt: 'ners',         // 14% — зарим талбарт эзэмшигч энд бичигдсэн
  },
} as const;

/** Чөлөөлөлтийн явцын төлөв → өнгө. Үйлчилгээнд байгаа утгууд. */
export const PARCEL_STATUS: Record<string, string> = {
  'гэрээлсэн': '#16a34a',
  /**
   * ⚠️ «гэрээлсэн.» — цэгтэй бичигдсэн ИЖИЛ төлөв (өгөгдлийн бичгийн алдаа, 3 талбар).
   * Тусад нь өнгө өгвөл нэг зүйл газрын зураг дээр хоёр өнгөөр харагдана.
   */
  'гэрээлсэн.': '#16a34a',
  'татгалзсан': '#d946ef',
  'дүйцүүлсэн': '#14b8a6',
  'зөвшилцөх': '#0891b2',
  'АТД': '#7c3aed',
  'үлдэх саналтай': '#ca8a04',
  'үнийн дүн зөвшөөрөөгүй': '#ea580c',
  'маргаантай': '#dc2626',
};
export const PARCEL_STATUS_EMPTY = 'Бүртгэгдээгүй';

/**
 * Явцын мэдээ бүртгэгдээгүй талбарын өнгө.
 *
 * ⚠️ ХУУЧИН үйлчилгээнд 86% нь мэдээгүй байсан тул энэ бүлгийг хамгийн ТОД өнгөөр
 * (`#d946ef`) тэмдэглэж, давхарга бүхэлдээ уншигдахуйц болгож байв. ШИНЭ үйлчилгээнд
 * мэдээгүй нь ердөө 19% тул тэр шийдвэр хүчингүй болсон: цөөнх бүлгийг хамгийн тод
 * болговол жинхэнэ төлөвүүдийг дарна. Иймд саарал руу буцаав.
 */
export const PARCEL_STATUS_EMPTY_HUE = '#94a3b8';

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
/**
 * ⚠️ 'road', 'bike', 'ger' 2026-07-20-нд хасагдсан (хэрэглэгчийн шийдвэр).
 * Үйлчилгээ нь (`Selbe_talbain_hynalt` 2, 3, 4) байсаар байгаа — зөвхөн порталаас
 * гаргасан. Буцааж нэмэх бол энэ жагсаалт болон `GENERAL`-д мөрөө нэмнэ.
 */
export type GeneralKey = 'green' | 'sidewalk' | 'river' | 'built';

export const GENERAL: Record<GeneralKey, {
  url: string;
  title: string;
  hue: string;
  /** Статистикт харуулах ангилалын талбарууд */
  facets: { field: string; label: string }[];
  /** Нэмэлт нийлбэр */
  sums?: { field: string; label: string; unit?: string }[];
  /**
   * Тоон талбарын ДУНДАЖ (давхар, өргөн, гүн…).
   * Ангилал болгож болохгүй: утга нь тасралтгүй тул 270 багана гарна.
   */
  avgs?: { field: string; label: string; unit?: string; digits?: number }[];
  /**
   * ЗӨВХӨН дарсан объектод харуулах талбар.
   * Объект бүрт өвөрмөц (жишээ нь кадастрын дугаар) тул статистикт утгагүй.
   */
  details?: { field: string; label: string }[];
  /**
   * `GENERAL_FIELDS`-ээс ӨӨР талбарын нэр (эсвэл `null` = тухайн давхаргад байхгүй).
   *
   * ⚠️ Эхэндээ 7 давхарга бүгд НЭГ үйлчилгээнээс (`Selbe_talbain_hynalt`) ирдэг
   * байсан тул талбарын нэр нэгэн ижил байв. Ногоон байгууламж тусдаа үйлчилгээ
   * рүү шилжсэнээр тэр таамаглал эвдэрсэн — тэнд `FID` биш `OBJECTID`, мөн
   * `Bod_guits` (гүйцэтгэл) талбар огт байхгүй. Байхгүй талбарыг статистикт
   * асуувал ХҮСЭЛТ БҮХЭЛДЭЭ унана, тиймээс `null`-оор нь тэмдэглэж алгасана.
   */
  fields?: {
    oid?: string;
    progress?: string | null;
    dueDate?: string | null;
    area?: string | null;
    length?: string | null;
  };
}> = {
  built: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/6`, title: 'Барилга', hue: '#3387b8',
    facets: [
      { field: 'Zoriulalt', label: 'Зориулалт' },
      { field: 'Halaalt', label: 'Халаалт' },
      { field: 'Aram_tolov', label: 'Араг төлөв' },
      { field: 'Umch', label: 'Өмчлөл' },
      { field: 'Lift', label: 'Лифт' },
      { field: 'Gal_zer', label: 'Галын тэсвэрийн зэрэг' },
      { field: 'Ball_tes', label: 'Газар хөдлөлтийн тэсвэр (балл)' },
      { field: 'Zoori', label: 'Зооритой эсэх' },
      { field: 'Bar_comp', label: 'Барилгын компани' },
    ],
    sums: [{ field: 'Ail_too', label: 'Айлын тоо' }, { field: 'Hun_too', label: 'Оршин суугч' }],
    avgs: [
      { field: 'Davhar', label: 'Дундаж давхар', digits: 1 },
      { field: 'Undur_m', label: 'Дундаж өндөр', unit: 'м', digits: 1 },
    ],
    details: [{ field: 'Kadastr', label: 'Кадастрын дугаар' }],
  },
  /**
   * Ногоон байгууламж — 2026-07-20-нд ШИНЭ үйлчилгээ рүү сольсон.
   *
   * Хуучин нь `Selbe_talbain_hynalt/1` (4,701 объект, 131 га) талбайн судалгаа
   * байсан бөгөөд арчлагч, услалт, ургамлын тоо агуулдаг байв. Шинэ нь CAD-ийн
   * төлөвлөлт (1,174 объект, 96.8 га): хэрэгцээний ангилал ба бүсийн холбоостой.
   *
   * ⚠️ Талбарын бүтэц ӨӨР тул `fields`-ээр дарж бичнэ: OID нь `OBJECTID`,
   * гүйцэтгэл/огнооны талбар БАЙХГҮЙ, талбай нь га-гаар (`Area_hec`).
   */
  green: {
    url: `${HJ}/%D0%9D%D0%BE%D0%B3%D0%BE%D0%BE%D0%BD_%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%B0%D0%BC%D0%B6_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D20260720/FeatureServer/107`,
    title: 'Ногоон байгууламж', hue: '#16a34a',
    facets: [
      { field: 'Layer', label: 'Хэрэгцээний ангилал' },
      { field: 'ZONE_ID_1', label: 'Бүс' },
    ],
    // `Area_hec` нэмэлт нийлбэрээр оруулаагүй: `Shape__Area`-тай ЯГ ижил утга өгдгийг
    // шалгасан (хоёулаа 96.8 га) тул самбарт «Талбай» хоёр удаа гарах байлаа.
    fields: { oid: 'OBJECTID', progress: null, dueDate: null, length: null },
  },
  sidewalk: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/0`, title: 'Явган хүний зам', hue: '#0891b2',
    facets: [
      { field: 'Gadarguu', label: 'Гадаргуу' },
      { field: 'Tolov', label: 'Төлөв' },
      { field: 'Gerel', label: 'Гэрэлтүүлэгтэй эсэх' },
      { field: 'Naluu', label: 'Налуу гарцтай эсэх' },
    ],
  },
  river: {
    url: `${HJ}/Selbe_talbain_hynalt/FeatureServer/5`, title: 'Гол', hue: '#0284c7',
    facets: [
      { field: 'Chanar', label: 'Усны чанар' },
      { field: 'Ereg', label: 'Эрэг' },
      { field: 'Ursgal', label: 'Урсгал' },
      { field: 'Ner', label: 'Голын нэр' },
    ],
    avgs: [
      { field: 'Urgun_m', label: 'Дундаж өргөн', unit: 'м', digits: 1 },
      { field: 'Gun_m', label: 'Дундаж гүн', unit: 'м', digits: 1 },
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
export type UtilKey =
  | 'sewer' | 'sewerPoint' | 'heat' | 'storm'
  | 'kv110' | 'kv10' | 'kv04'
  | 'busRoute' | 'busStop' | 'lrt'
  | 'roadplan';


/**
 * ⚠️ Үйлчилгээний нэр КИРИЛЛ тул URL-д percent-encoding заавал. Түүхий кирилл
 * үсэгтэй URL нь зарим орчинд чимээгүй унадаг.
 *
 * Өнгийг СИСТЕМИЙН гэр бүлээр өгсөн — 11 давхаргад 11 санамсаргүй өнгө өгвөл
 * уншигдахаа болино. Ус ногоон, дулаан улаан, цахилгаан хув (хүчдэлээр гүнзгийрнэ),
 * тээвэр ягаан. Ижил системийн давхаргууд нүдэнд шууд бүлэглэгдэнэ.
 */
export const UTILITY: Record<UtilKey, {
  url: string;
  title: string;
  hue: string;
  kind: 'line' | 'area' | 'point';
  /**
   * Ангилалын задаргаа. ЗӨВХӨН утга агуулсан талбарыг оруулна.
   *
   * ⚠️ Эдгээр давхарга CAD-аас экспортлогдсон тул `Handle`, `Color`, `LineWt`,
   * `Angle`, `Elevation` гэх мэт олон талбартай. Тэдгээр нь ХЭРЭГЛЭГЧИЙН хувьд
   * утгагүй: `Handle` объект бүрт өвөрмөц (175 объект = 175 утга), замын планы
   * `Elevation` нь −1044, −1400 гэсэн боломжгүй тоо агуулна. Ийм талбарыг
   * харуулбал мэдээлэл мэт харагдаад үнэндээ хоосон — тиймээс оруулаагүй.
   */
  facets?: { field: string; label: string }[];
}> = {
  heat: { url: `${HJ}/Road_shugam_suljee/FeatureServer/1`, title: 'Гадна дулаан хангамж', hue: '#dc2626', kind: 'line' },
  sewer: { url: `${HJ}/Road_shugam_suljee/FeatureServer/0`, title: 'Ариутгах татуурга', hue: '#16a34a', kind: 'line' },
  sewerPoint: { url: `${HJ}/%D0%9E%D0%B4%D0%BE%D0%BE_%D0%B1%D0%B0%D0%B9%D0%B3%D0%B0%D0%B0_%D0%B1%D0%BE%D1%85%D0%B8%D1%80_%D1%83%D1%81_pointt/FeatureServer/385`, title: 'Бохир ус — одоо байгаа (цэг)', hue: '#15803d', kind: 'point', facets: [{ field: 'RefName', label: 'Худгийн төрөл' }] },
  storm: { url: `${HJ}/Road_shugam_suljee/FeatureServer/2`, title: 'Борооны ус зайлуулах', hue: '#0891b2', kind: 'line' },

  kv110: { url: `${HJ}/%D0%A6%D0%B0%D1%85%D0%B8%D0%BB%D0%B3%D0%B0%D0%B0%D0%BD_%D0%B4%D0%B0%D0%BC%D0%B6%D1%83%D1%83%D0%BB%D0%B0%D1%85_%D0%B0%D0%B3%D0%B0%D0%B0%D1%80%D1%8B%D0%BD_%D1%88%D1%83%D0%B3%D0%B0%D0%BC_110%D0%BA%D0%B2_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D/FeatureServer/177`, title: 'Агаарын шугам 110кв', hue: '#b45309', kind: 'line', facets: [{ field: 'ZONE_ID_1', label: 'Бүс' }] },
  kv10: { url: `${HJ}/%D0%94%D0%B0%D0%BC%D0%B1%D0%B0%D0%B4%D0%B0%D1%80%D0%B6%D0%B0%D0%B0_%D0%B4%D1%83%D0%BB%D0%B0%D0%B0%D0%BD%D1%8B_%D1%81%D1%82%D0%B0%D0%BD%D1%86%D1%8B%D0%BD_10%D0%BA%D0%B2_%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C_%D1%82%D1%80%D0%B0%D1%81%D1%81_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D/FeatureServer/179`, title: 'Кабель трасс 10кв', hue: '#f59e0b', kind: 'line', facets: [{ field: 'ZONE_ID_1', label: 'Бүс' }] },
  kv04: { url: `${HJ}/%D1%86%D0%B0%D1%85%D0%B8%D0%BB%D0%B3%D0%B0%D0%B0%D0%BD04_%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C_%D1%82%D1%80%D0%B0%D1%81%D1%81_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D20260720/FeatureServer/181`, title: 'Кабель трасс 0.4кв', hue: '#fbbf24', kind: 'line', facets: [{ field: 'ZONE_ID_1', label: 'Бүс' }] },

  busRoute: { url: `${HJ}/%D0%90%D0%B2%D1%82%D0%BE%D0%B1%D1%83%D1%81_%D1%87%D0%B8%D0%B3%D0%BB%D1%8D%D0%BB_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D20260720/FeatureServer/72`, title: 'Автобусны чиглэл', hue: '#7c3aed', kind: 'line', facets: [{ field: 'chiglel', label: 'Чиглэл' }] },
  busStop: { url: `${HJ}/%D0%90%D0%B2%D1%82%D0%BE%D0%B1%D1%83%D1%81_%D0%B1%D1%83%D1%83%D0%B4%D0%B0%D0%BB_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D20260720/FeatureServer/1`, title: 'Автобусны буудал', hue: '#8b5cf6', kind: 'point' },
  lrt: { url: `${HJ}/LRT_BRT_%D0%B7%D0%BE%D0%B3%D1%81%D0%BE%D0%BE%D0%BB_%D1%81%D1%8D%D0%BB%D0%B1%D1%8D/FeatureServer/2`, title: 'LRT/BRT зогсоол', hue: '#4f46e5', kind: 'point' },

  roadplan: { url: `${HJ}/Road_shugam_suljee/FeatureServer/3`, title: 'Замын план', hue: '#334155', kind: 'area' },
};

/**
 * 9 · Агаарын зураг — Улаанбаатар хотын ubhub ArcGIS Server дээрх ортофото.
 *
 * 9 үйлчилгээ нь тус тусдаа ImageServer боловч байрлалаараа хооронд нь залгаж НЭГ
 * бүрхэвч үүсгэдэг (`mid_1…6` өмнөд хэсэг, `north_ortho1…3` хойд хэсэг). Тиймээс
 * хэрэглэгчид ГАНЦ унтраалга болгож харуулна — `MapCanvas` тэдгээрийг GroupLayer-т
 * багцална.
 *
 * ⚠️ Проекц нь UTM 48N (32648), веб Меркатор биш. Үйлчилгээ нь тайлын кэшгүй
 *    (`tileInfo` байхгүй) тул `ImageryTileLayer` БИШ, динамик `ImageryLayer`-ээр
 *    дуудна — сервер өөрөө проекц хийж зураг буцаана.
 */
const UBHUB = 'https://mapservice.ubhub.mn/arcgis/rest/services/Imagery';

export const IMAGERY = {
  title: 'Агаарын зураг (ортофото)',
  /** Саарал өнгө — аль ч модулийн өнгөтэй давхцахгүй */
  hue: '#78716c',
  /** ⚠️ Үйлчилгээний нэрсийн том/жижиг үсэг эх сервер дээрх бичиглэлээр нь */
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

/**
 * Survey123 тайлангийн `barilga` кодыг барилгын давхаргын `BLOK`-той холбоно.
 *
 * Хоёр систем ӨӨР бичиглэлтэй — маягтын кодын жагсаалт vs GIS-ийн блокийн дугаар:
 *   `bagts32_5_1`  →  `5/1`
 *   `bagts33_5_12` →  `5/12`
 * Өөрөөр хэлбэл `bagts<NN>_` угтварыг хасаад доогуур зураасыг ташуу болгоно.
 *
 * ⚠️ Багцаар холбож БОЛОХГҮЙ: тайлангийн `bagts` нь `bagts32/33` бөгөөд барилгын
 *    давхаргын «Багц 1…4.2»-той огт таарахгүй (өөр дугаарлалт). Зөвхөн блок найдвартай.
 *
 * @returns блокийн дугаар, эсвэл таарахгүй бол null
 */
export const surveyBlock = (barilga: unknown): string | null => {
  const m = /^bagts\d+_(.+)$/i.exec(String(barilga ?? '').trim());
  return m ? m[1].replace(/_/g, '/') : null;
};

/**
 * ⚠️ Энэ холболтыг SQL `LIKE`-аар хийж БОЛОХГҮЙ: `_` нь LIKE-д дан тэмдэгтийн
 * орлуулагч тул `bagts%_5_1` нь санамсаргүй бичлэг ч барих эрсдэлтэй. Үйлчилгээ нь
 * `ESCAPE` заалтыг дэмждэггүйг шалгасан. Тиймээс тайлангуудыг татаад `surveyBlock()`-оор
 * клиент талд яг таг шүүнэ (тайлангийн тоо бага, самбар нь жагсаалтаа аль хэдийн татдаг).
 */

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
