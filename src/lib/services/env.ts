/**
 * ⚠️ ОРЧНЫ ХУВЬСАГЧ (env) — ArcGIS/UBHUB үйлчилгээний ҮНДСЭН хаягуудыг НЭГ дороос
 * тохируулна (`.env`). `NEXT_PUBLIC_*` нь build үед шингэдэг (статик export).
 *
 * ⚠️ 2026-09-17: КОД ДОТОР ҮЙЛЧИЛГЭЭНИЙ ЛИНК/FALLBACK ОГТ БАЙХГҮЙ (хэрэглэгчийн
 *    шийдвэр). Хаяг бүр ЗӨВХӨН орчны хувьсагчаас — deploy-д GitHub Variables
 *    (`deploy.yml` env блок), локалд `.env` (репод ордоггүй). Хувьсагч дутуу бол
 *    `req()` build/ачаалалтын үед ИЛ алдаа шиднэ — чимээгүй буруу хаяг руу явахгүй.
 *    Бүх дэд үйлчилгээ (ET, IMAGERY, BIM г.м.) эдгээр суурьнаас template-ээр гардаг.
 */
import { t as tr } from '@/lib/i18nCore';

/**
 * ⚠️ `process.env.NEXT_PUBLIC_X`-ийг ЗААВАЛ статик нэрээр дамжуулна — Next.js статик
 *    export-д зөвхөн ийм хандалтыг build үед шингээдэг; `process.env[name]` хоосон.
 *    Хоосон/`undefined` → ил алдаа (GitHub Actions тохируулаагүй Variable-ыг хоосон мөрөөр өгдөг).
 */
export const req = (name: string, v: string | undefined): string => {
  const s = (v ?? "").trim().replace(/\/+$/, "");
  if (!s) throw new Error(`[Сэлбэ] ${name} тохируулаагүй — GitHub → Settings → Variables (deploy) эсвэл .env (локал) дээр нэмнэ үү.`);
  return s;
};

/** Үндсэн байгууллагын FeatureServer суурь (`…/arcgis/rest/services`) */
export const HJ = req("NEXT_PUBLIC_ARCGIS_HJ", process.env.NEXT_PUBLIC_ARCGIS_HJ);

/**
 * ХАБЭА-ийн Survey123 ҮЙЛЧИЛГЭЭНИЙ НЭРС — орчны хувьсагчаас (2026-09-17, хэрэглэгч:
 * «үйлчилгээ огт код дотор байх ёсгүй»). Survey123 маягтыг дахин нийтлэхэд нэр нь
 * (`survey123_<GUID>`) солигддог тул GitHub Variables / `.env`-ээс өөрчилнө, код хөндөхгүй.
 * Fallback БАЙХГҮЙ — хувьсагч дутуу бол `req()` алдаа шиднэ.
 */
/** Survey123 үйлчилгээний БҮТЭН хаяг: `…/FeatureServer` хүртэл. Хувьсагчид бүтэн URL
    (`…/rest/services/<нэр>/FeatureServer`) эсвэл зөвхөн нэр өгсөн ч ажиллана. */
const svcRoot = (name: string, v: string | undefined): string => {
  const raw = req(name, v).replace(/\/FeatureServer$/i, "");
  return raw.includes("://") ? raw : `${HJ}/${raw}`;
};
export const HABEA_SVC = {
  labor: svcRoot("NEXT_PUBLIC_HABEA_LABOR_SVC", process.env.NEXT_PUBLIC_HABEA_LABOR_SVC),
  incident: svcRoot("NEXT_PUBLIC_HABEA_INCIDENT_SVC", process.env.NEXT_PUBLIC_HABEA_INCIDENT_SVC),
  uzlegV11: svcRoot("NEXT_PUBLIC_HABEA_UZLEG_V11_SVC", process.env.NEXT_PUBLIC_HABEA_UZLEG_V11_SVC),
  uzlegG: svcRoot("NEXT_PUBLIC_HABEA_UZLEG_G_SVC", process.env.NEXT_PUBLIC_HABEA_UZLEG_G_SVC),
  /** Захиалагчийн ажлын байрны үзлэг 2026 (`hse_client_inspection_2026`) — 2026-09-17-нд
      нийтлэгдсэн; `habea:uzZ` ба ХАБЭА-ийн захиалагчийн үзлэгийн самбар эндээс уншина. */
  uzlegZahialagch: svcRoot("NEXT_PUBLIC_HABEA_UZLEG_ZAHIALAGCH_SVC", process.env.NEXT_PUBLIC_HABEA_UZLEG_ZAHIALAGCH_SVC),
} as const;

/**
 * TEST_DATA — MUST org-ийн НЭГДСЭН орон зайн үйлчилгээ (2026-08-13).
 * Орон зайн бүх давхарга (санхүүгийн хүснэгт, «Гүйцэтгэл бөглөх», Survey123,
 * 3D/растераас БУСАД) энэ 109 давхаргат НЭГ FeatureServer-ээс уншигдана.
 * Хост нь monmap (services · HJzgwvlNIXssnQar, 2026-09-17-ноос). Давхаргын
 * дугаарын зураглалыг `TD_LAYER` (LAYERS-ийн төгсгөлд) хийнэ; хуучин загвар
 * (webmap snapshot) нь `styleUrl`-ээр хэвээр хэрэглэгдэнэ.
 */
/*
 * ⚠️ 2026-09-17 (2): `SELBE_ALL_DATA_0917` (76) → `SELBE_ALL_DATA_last_0917` (61) —
 *    хэрэглэгч дахин зассан: `Инженерийн_дэд_бүтэц__Сэлбэ_0916`-тэй давхцсан
 *    ЕТ-ийн 15 инженерийн шугам (`et:3 4 7 8 9 10 16 17 18 19 23 124…127`) ба
 *    `pkg:124…127`/`pkg:246`-ийн эх (56…60) УСТГАГДСАН → LayerDef-үүд хасагдаж,
 *    хэрэглэгчид нь (`ENGINEERING_IDS`, `Ersdel`, `PKG_BY_BAGTS`) `infra:*` руу
 *    шилжив. `Гүүрэн_байгууламж`(42) → `Гүүр`(141, CAD, ZONE_ID-гүй),
 *    `Хүүхдийн_урлан`(9) → 142 (CAD, ZONE_ID/talbai_m2-гүй). Бусад 50 id ижил.
 * ⚠️ 2026-09-17: MUST (`services-ap1 · ACqsMOmNLi5wIdIh`) → monmap (`HJ`).
 *    Аюулгүй байдлын шийдвэр: бүх өгөгдөл НЭГ оргод, Organization-only
 *    хуваалцаж, хэрэглэгчийн өөрийн OAuth токеноор л уншигдана. MUST-ийн
 *    `data` (108) → `SELBE_ALL_DATA_0917` (76): нэр · дугаар · мөр · талбар
 *    73/73 ижил (id нэг ч шилжээгүй), давхардсан 35-ыг зориудаар ХАСАВ
 *    (`Инженерийн_дэд_бүтэц__Сэлбэ_0916`-той давхцсан `_0813` хуулбарууд ба
 *    хаана ч лавлагддаггүй `po:*` тав). `toilet` → 115, `nogoon_analysis` →
 *    118, `Example_data` → 123 (`Exampledata_iot`) мөн ЭНД нэгдэв.
 */
/* ⚠️ 2026-08-24: `test_data` → `data`. 118 давхаргыг НЭРЭЭР нь тулгаж
   шалгасан: дугаар нэг ч шилжээгүй, дутуу давхарга алга, кодын шаарддаг
   талбарууд бүрэн. Ялгаа нь зөвхөн «Барилга» ([108]) 364 → 368 болж
   нэмэгдсэн ба барилгын блокийн БҮТЭН хувилбар [112] нэмэгдсэн. */
export const TD = `${req("NEXT_PUBLIC_ARCGIS_GAZAR", process.env.NEXT_PUBLIC_ARCGIS_GAZAR)}/SELBE_ALL_DATA_last_0917/FeatureServer`;

/** Бүх вектор давхаргын эх — НЭГ FeatureServer */
export const ET = `${HJ}/Selbe_ET_20260721/FeatureServer`;

/**
 * Шинэчилсэн ЕТ (07-25) — багцаар задарсан цахилгааны шугам (124–127) энд.
 * ⚠️ Үндсэн `ET`-ээс ӨӨР хувилбар тул эдгээр давхарга бүтэн `url`-аар очно.
 */
export const ET25 = `${HJ}/Selbe_ET_20260725/FeatureServer`;

/**
 * ДЭД БҮТЦИЙН БАГЦУУД — `Selbe_ET_20260725` (62 давхарга).
 *
 * ⚠️ Энэ нь `ET`-ийн ШИНЭ ХУВИЛБАР БИШ. Огноо нь дөрөв хожуу ч агуулга нь огт
 * өөр: ЕТ-д байдаг барилга, бүс, зам, ногоон байгууламж энд ОГТ БАЙХГҮЙ, харин
 * ЕТ-д байхгүй гүйцэтгэлийн БАГЦУУД (Багц 5–21: гадна инженер, өндөржилт,
 * тохижилт, сургууль, цэцэрлэг, холбоо) энд бий. Хоёулаа зэрэг ажиллана.
 *
 * ⚠️ Давхарга БҮР `bagts_name` талбартай бөгөөд утга нь `INVEST.bagts_name`-тэй
 * ЯГ ТААРНА («БАГЦ-17.1», «БАГЦ - 19.1», «БАГЦ -21» — зай/зураасны бохирдол ч
 * ижил). Энэ бол хөрөнгө оруулалтын хүснэгтийн ГАЗРЫН ЗУРГИЙН холбоос —
 * урьд нь геометргүй байсан мөрүүд одоо зурагдана.
 *
 * ⚠️ Үйлчилгээний SR нь UTM 48N (EPSG:32648) тул `Shape__Length`/`Shape__Area`
 * нь БОДИТ метр ба м². CAD-аас гаралтай давхаргуудын `Length_km`/`Area_m2`
 * талбар зарим давхаргад хоосон (жиш. `Өндөржилтийн_ажил_БАГЦ1`) тул хэмжээг
 * систем талбараас уншина — тэдгээр нь хэзээ ч хоосон биш.
 */
export const ET_PKG = `${HJ}/Selbe_ET_20260725/FeatureServer`;

/**
 * ИНЖЕНЕРИЙН ДЭД БҮТЭЦ — ШИНЭ ЭХ СУРВАЛЖ (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * 73 давхарга, 8,419 обьект. Урьд нь эдгээр нь нэгтгэсэн `data` үйлчилгээнд
 * НЭГ багц = НЭГ давхарга байсан; энд багц бүр бүрэлдэхүүнээрээ задарсан
 * (жишээ нь Багц 5.1 нь дулааны өгөх/буцах, халуун ус өгөх/буцах, хүйтэн
 * ус, бохир шугам, худаг, лотки, ДХТ гэж 10 давхарга).
 *
 * ⚠️ SR нь 32648 (UTM 48N) — хуучинтай ИЖИЛ. `Shape__Length`/`Shape__Area`
 * нь БОДИТ метр ба м²; Web Mercator рүү шилжвэл 48° өргөрөгт 1.49 дахин
 * хөөрч, ямар ч алдаа заахгүйгээр бүх урт буруу болно.
 *
 * ⚠️ `ZONE_ID` талбар ЭНД БАЙХГҮЙ (0/73). Тиймээс бүх мөр `noZone` —
 * бүсийн нэгдсэн шүүлтэд ОРОХГҮЙ. Хуучин `data`-гийн давхаргууд `ZONE_ID`
 * агуулдаг байсан тул энэ нь ажиллагааны БОДИТ өөрчлөлт, өгөгдлөөс шалтгаалсан.
 *
 * ⚠️ ХОСТ нь `TD`-ийнхтэй ИЖИЛ (monmap · HJzgwvlNIXssnQar, 2026-09-17) тул
 * түүнээс үүсгэнэ — `NEXT_PUBLIC_ARCGIS_GAZAR` орчны хувьсагчаар дарж
 * бичих боломж ХЭВЭЭР үлдэнэ. Хаягийг шууд бичвэл тэр холбоос тасарна.
 */
const TD_TAIL = '/SELBE_ALL_DATA_last_0917/FeatureServer';
/* ⚠️ 2026-09-17: `Test0911S` (MUST) → `Инженерийн_дэд_бүтэц__Сэлбэ_0916` (monmap):
   74/74 давхарга, id нэг ч шилжээгүй, Холбооны 4 давхарга илүү бүрэн. URL-д
   кирилл нэр тул percent-encoded. */
export const INFRA_SVC = `${TD.slice(0, TD.lastIndexOf(TD_TAIL))}/%D0%98%D0%BD%D0%B6%D0%B5%D0%BD%D0%B5%D1%80%D0%B8%D0%B9%D0%BD_%D0%B4%D1%8D%D0%B4_%D0%B1%D2%AF%D1%82%D1%8D%D1%86__%D0%A1%D1%8D%D0%BB%D0%B1%D1%8D_0916/FeatureServer`;

/**
 * ЭХ ҮҮСВЭР — нэгтгэсэн үйлчилгээ (2026.03.08). Дулаан, цахилгаан, ус хангамжийн
 * бүх эх үүсвэрийн байгууламжийг НЭГ давхаргад нэгтгэсэн (7 объект, полигон).
 * Хуучин бэхлэгдсэн `SOURCES` (brief.ts) ба тусдаа эх үүсвэрийн давхаргуудыг
 * ЭНЭ ОРЛУУЛНА.
 *
 * ⚠️ `_` ард нь ХЭРЭГЛЭГЧИЙН ангилал: багцын дугаар (_1=Багц 1, _3#1=Багц 3.1),
 * `_odoo` = одоо байгаа барилга, `_olonN` = олон нийтийн бүс, `_surTsets` =
 * сургууль/цэцэрлэг. Утга нь тухайн байгууламжаас тэр хэрэглэгчид хуваарилсан МВт.
 */
export const SOURCE_FS = {
  // test_data [105] eh_uusver_negdsen — 2026-08-13 шилжив (талбарууд бүрэн)
  url: `${TD}/105`,
  fields: {
    type: "torol",       // Дулаан / Цахилгаан / Ус хангамжийн эх үүсвэр
    name: "нэр",         // байгууламжийн нэр
    share: 'хангах_хувь', // системд эзлэх хувь (%)
    total: 'нийт_чадал',  // байгууламжийн бүрэн чадал
    note: "тайлбар",
  },
  /** Хэрэглэгч бүрд хуваарилсан хүчин чадлын (МВт) талбар */
  consumers: [
    { key: "b1", get label() { return tr('Багц 1'); }, field: "МВт__1" },
    { key: "b2", get label() { return tr('Багц 2'); }, field: "МВт__2" },
    { key: "b31", get label() { return tr('Багц 3.1'); }, field: "МВт__3_1" },
    { key: "b32", get label() { return tr('Багц 3.2'); }, field: "МВт_" },
    { key: "b33", get label() { return tr('Багц 3.3'); }, field: "МВт__3_3" },
    { key: "b41", get label() { return tr('Багц 4.1'); }, field: "МВт__4_1" },
    { key: "b42", get label() { return tr('Багц 4.2'); }, field: "МВт__4_2" },
    { key: "odoo", get label() { return tr('Одоо байгаа'); }, field: "МВт__odoo" },
    { key: "olon", get label() { return tr('Олон нийт'); }, field: "МВт__olonN" },
    { key: "sur", get label() { return tr('Сургууль, цэцэрлэг'); }, field: "МВт__surTsets" },
  ],
} as const;

/**
 * Суурь зураг — Esri-гийн нийтийн РАСТР тайл (түлхүүр шаардахгүй, ACAO `*`).
 *
 * ⚠️ Вектор тайлын суурь зургийг БҮРМӨСӨН хассан: загвар солиход хуучныг устгах
 * агшин зурах агшинтай давхцвал ArcGIS дотор
 * `VectorTileContainer._renderBackgroundLayers` дээр «Cannot destructure property
 * 'spans' of null» гэж унадаг. Мөн 2D-д ортофото түүнийг бүрэн бүрхдэг.
 */

/**
 * ArcGIS Online нэвтрэлт (OAuth 2.0, PKCE — сервергүй статик сайтад тохирно).
 * `appId` хоосон бол нэвтрэлт УНТРААЛТТАЙ.
 */
/**
 * НЭВТРЭЛТ УНТРААХЫГ ИЛ ТУГААР ЗАРЛАНА (2026-09-03-ны аудит).
 *
 * ⚠️ ЯАГААД: `appId`-г хоосон болгоход `caps.hasCap` нь БҮХ эрхийг `true`
 * буцааж, `permissions` нь БҮХ харагдацыг нээдэг. `.env` нь репод track
 * хийгддэг файл тул нэг тэмдэгтийн санамсаргүй засвар порталын бүх
 * хамгаалалтыг ЧИМЭЭГҮЙ унтраана — ямар ч дохио гарахгүй.
 *
 * Одоо унтраахын тулд `NEXT_PUBLIC_AUTH_OFF=1` гэж ТУСДАА, санаатай тугийг
 * тавина. Хоосон `appId` дангаараа хангалтгүй: production build дээр
 * тэрхүү тохиргоо ил алдаа болж, чимээгүй нээгдэхээс сэргийлнэ.
 */
/* ⚠️ 2026-09-17: бүх үйлчилгээ Organization-only тул `AUTH_OFF=1` горимд ArcGIS
   өгөгдөл огт уншигдахгүй (499 «Token Required») — зөвхөн UI-ийн бүтэц харах
   зориулалттай; өгөгдөлтэй хөгжүүлэлт нэвтрэлт асаалттай явна. */
const AUTH_OFF = process.env.NEXT_PUBLIC_AUTH_OFF === "1";
/* ⚠️ `AUTH_OFF=1` үед appId шаардахгүй (UI-ийн бүтэц харах горим); бусад үед `req()`. */
const AUTH_APP_ID = AUTH_OFF ? (process.env.NEXT_PUBLIC_AUTH_APP_ID ?? "").trim()
  : req("NEXT_PUBLIC_AUTH_APP_ID", process.env.NEXT_PUBLIC_AUTH_APP_ID);
if (!AUTH_OFF && !AUTH_APP_ID) {
  const msg = "NEXT_PUBLIC_AUTH_APP_ID хоосон байна. Нэвтрэлтийг САНААТАЙ унтраах бол "
    + "NEXT_PUBLIC_AUTH_OFF=1 гэж ил зарлана уу — эс бөгөөс бүх эрх, бүх "
    + "харагдац хамгаалалтгүй нээгдэнэ.";
  /**
   * ⚠️ ЗӨВХӨН PRODUCTION-Д ШИДНЭ (2026-09-03).
   *
   * Энэ хамгаалалтын зорилго нь «нийтэд гарсан build чимээгүй нээлттэй
   * байхаас сэргийлэх». Эхлээд болзолгүй `throw` бичсэн нь ХӨГЖҮҮЛЭЛТИЙН
   * орчныг бүхэлд нь унагаав: `.env.development.local`-д appId-г хоосон
   * орхих нь хөгжүүлэгчийн ХЭВИЙН зан (нэвтрэлтгүй ажиллах) бөгөөд
   * `services.ts` нь бараг бүх модулийн хамаарал тул 15/15 харагдац
   * ачаалахаа больж байлаа (хөтчийн шалгалтаар барив).
   *
   * Одоо: dev дээр ЗӨВХӨН консолын анхааруулга (ажил зогсохгүй),
   * production build дээр ШИДНЭ (санамсаргүй нээлттэй хувилбар гарахгүй).
   */
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn("[selbe]", msg);
}
export const AUTH = {
  /**
   * ArcGIS OAuth appId (`NEXT_PUBLIC_AUTH_APP_ID`). Хоосон "" бол нэвтрэлт УНТРААЛТТАЙ.
   * ⚠️ `??` — env-д ЗӨВХӨН хоосон бичвэл унтраана; огт өгөөгүй бол fallback (асаалттай).
   */
  appId: AUTH_OFF ? "" : AUTH_APP_ID,
  /**
   * ⚠️ Байгууллагын хаяг (`monmap.maps.arcgis.com`) БИШ. Тэр домэйн ArcGIS
   * Online-ы «Allowed origins» цагаан жагсаалтыг мөрддөг тул dev дээр токен
   * солилт CORS-д хаагддаг. `www.arcgis.com` аль ч origin-ыг зөвшөөрнө;
   * байгууллагаар хязгаарлах ажлыг `allowedOrgId` хийнэ.
   */
  portalUrl: req("NEXT_PUBLIC_PORTAL_URL", process.env.NEXT_PUBLIC_PORTAL_URL),
  allowedOrgId: req("NEXT_PUBLIC_ALLOWED_ORG_ID", process.env.NEXT_PUBLIC_ALLOWED_ORG_ID),
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
