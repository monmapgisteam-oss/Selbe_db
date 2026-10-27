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

/**
 * СЭЛБЭ ENTERPRISE-ийн hosted үйлчилгээний суурь (`https://gis.selbecity.mn/map/rest/services/Hosted`) — БҮХ өгөгдөл,
 * BIM · меш · IoT · ХАБЭА эндээс (2026-10-20, AGOL/UBHUB бүрэн хаягдсан). ЗААВАЛ.
 */
export const ENT_HOSTED = req("NEXT_PUBLIC_ENT_DATA", process.env.NEXT_PUBLIC_ENT_DATA);

/**
 * ENTERPRISE-ийн ҮЙЛЧИЛГЭЭНҮҮД — кодын БҮХ өгөгдлийн хаяг `${<ҮЙЛЧИЛГЭЭ>}/<давхаргын №>` хэлбэрээр ШУУД (2026-10-26).
 * ⚠️ Хөрвүүлэх хүснэгт (AGOL түлхүүр → Enterprise, хуучин `entMap`) БАЙХГҮЙ — хэрэглэгчийн шийдвэр: «хөрвүүлэх хүснэгт
 *    огт ашиглахгүй, бодит датаг шууд ашиглана». Давхаргын дугаар нь Enterprise-ийн `…/FeatureServer/layers`-ийн БОДИТ дугаар.
 * ⚠️ Талбарын нэр мөн БОДИТ (Enterprise/PostgreSQL ЖИЖИГ ҮСЭГ: `bagts`, `objectid`, `last_edited_date`; систем
 *    `SHAPE__Area`/`SHAPE__Length` ТОМ `SHAPE`) — кодод тэр нэрээр бичнэ, ажиллах үед хөрвүүлэхгүй.
 */
const svc = (name: string): string => `${ENT_HOSTED}/${name}/FeatureServer`;
/** Барилга · багцын ажлууд · инженерийн шугам сүлжээ (98 давхарга; хуучин `Инженерийн_дэд_бүтэц…` + дэд бүтцийн багцууд) */
export const BAGTS_AJLUUD = svc('Bagts_ajluud');
/** Ерөнхий төлөвлөгөө — бүс · зам · ногоон · 3D/2D зургийн давхаргууд */
export const SELBE_ET = svc('selbe_ET');
/** «Redesign» — шинэчлэгдсэн ерөнхий төлөвлөгөө */
export const HET = svc('HET');
/** Гүйцэтгэл · санхүү · хуваарь · хяналт · ноорог · зөвшөөрлийн хүснэгтүүд */
export const GUITS = svc('Guitsetgel_talbe');
/** Газар чөлөөлөлт (нэгж талбар · барилга) */
export const GAZAR_CH = svc('Gazar_choloololt');
/** Цамхагт кран · аюултай бүс */
export const HAB_KRAN = svc('HAB_kran');
/** Иргэдэд хүрэх үр өгөөж */
export const IRGED = svc('Irgeded_ogoh_ur_ogooj');
/** Эрхийн хүснэгт (Selbe_Permissions) */
export const SYS_PERMS = svc('SYS_Selbe_Permissions');
/** IoT жишээ өгөгдөл */
export const IOT_EX = svc('IoT_example');
/** Инженерийн дэд бүтэц — `Bagts_ajluud` үйлчилгээнд (давхарга бүрийн дугаар `pkg.ts`-ийн INFRA_TABLE-д) */
export const INFRA_SVC = BAGTS_AJLUUD;

/**
 * ХАБЭА-ийн Survey123 ҮЙЛЧИЛГЭЭНИЙ НЭРС — орчны хувьсагчаас (2026-09-17, хэрэглэгч:
 * «үйлчилгээ огт код дотор байх ёсгүй»). Survey123 маягтыг дахин нийтлэхэд нэр нь
 * (`survey123_<GUID>`) солигддог тул GitHub Variables / `.env`-ээс өөрчилнө, код хөндөхгүй.
 * Fallback БАЙХГҮЙ — хувьсагч дутуу бол `req()` алдаа шиднэ.
 */
/** Survey123 үйлчилгээний БҮТЭН хаяг: `…/FeatureServer` хүртэл. Хувьсагчид бүтэн URL
    (`…/rest/services/<нэр>/FeatureServer`) эсвэл зөвхөн нэр өгсөн ч ажиллана.
    ⚠️ 2026-10-21: ЗӨВХӨН НЭР нь Enterprise-ийн Hosted суурь (`ENT_HOSTED`) дор. Урьд `${HJ}/<нэр>` (AGOL-ын
    ТҮЛХҮҮРИЙН суурь) болгодог байсан ч Survey123 үйлчилгээ `ENT_MAP`-д зураглалгүй тул `query.run` ХАБЭА-ийн
    хүсэлт бүрийг «зураглалгүй AGOL хаяг» гэж татгалздаг байв. Бүтэн URL хэвээр. */
const svcRoot = (name: string, v: string | undefined): string => {
  const raw = req(name, v).replace(/\/FeatureServer$/i, "");
  return raw.includes("://") ? raw : `${ENT_HOSTED}/${raw}`;
};
/**
 * ЧАНАР · MA (материал баталгаажуулалт) ба MIR (материалын үзлэг) — Survey123, Сэлбэ Enterprise hosted feature service.
 * ⚠️ 2026-10-20: `NEXT_PUBLIC_CHANAR_MA_SVC` · `NEXT_PUBLIC_CHANAR_MIR_SVC` хувьсагч ХАСАГДСАН (хэрэглэгч: зөвхөн 10 хувьсагч) —
 *    Enterprise-ийн нэгдсэн суурь + тогтмол үйлчилгээний нэр (геопорталын «MA» · «MIR» маягтын feature service:
 *    MA `/0` form · MIR `/0` form · `/1` photos; амьд жагсаалт 2026-10-20). Маягт дахин нийтлэгдвэл нэрийг энд солино.
 */
export const CHANAR_MA_SVC = `${ENT_HOSTED}/service_4c573791e818494da5736086a2535713`;
export const CHANAR_MIR_SVC = `${ENT_HOSTED}/service_c57fb2dce015439786246f68534ab82d`;

export const HABEA_SVC = {
  labor: svcRoot("NEXT_PUBLIC_HABEA_LABOR_SVC", process.env.NEXT_PUBLIC_HABEA_LABOR_SVC),
  /* ⚠️ 2026-10-21 (аудит): `survey123_654f…` нь ганц туршилтын мөртэй хуулбар — шилжүүлсэн 18 осол
     `service_d3a71860374b45bdbfbe5a1650364f0d`-д. GitHub Variable хуучин утгаараа үлдсэн ч зөв эх рүү заана. */
  incident: svcRoot("NEXT_PUBLIC_HABEA_INCIDENT_SVC", process.env.NEXT_PUBLIC_HABEA_INCIDENT_SVC)
    .replace("survey123_654f661e1f0e4b37a4fb3a7e026b09c3", "service_d3a71860374b45bdbfbe5a1650364f0d"),
  uzlegV11: svcRoot("NEXT_PUBLIC_HABEA_UZLEG_V11_SVC", process.env.NEXT_PUBLIC_HABEA_UZLEG_V11_SVC),
  uzlegG: svcRoot("NEXT_PUBLIC_HABEA_UZLEG_G_SVC", process.env.NEXT_PUBLIC_HABEA_UZLEG_G_SVC),
  /** Захиалагчийн ажлын байрны үзлэг 2026 (`hse_client_inspection_2026`) — 2026-09-17-нд
      нийтлэгдсэн; `habea:uzZ` ба ХАБЭА-ийн захиалагчийн үзлэгийн самбар эндээс уншина. */
  /* ⚠️ 2026-10-20: хувьсагч (`NEXT_PUBLIC_HABEA_UZLEG_ZAHIALAGCH_SVC`) хасагдсан — Enterprise-ийн «Захиалагчийн ажлын байрны
     үзлэг 2026» үйлчилгээ шууд (амьд жагсаалт: `service_b56e…`; хэрэглэгчид хуваалцаагүй бол 499/403 — геопорталаас хуваалцана). */
  uzlegZahialagch: `${ENT_HOSTED}/service_b56e0aa028f0441bb49ed6c40e381012`,
  /* ⚠️ 2026-10-21 (хэрэглэгч: 8 шинэ үзлэгийн маягт — ХАБЭА «Мэдээлэл» ба тайлан татах). Enterprise геопорталын амьд
     жагсаалтаас (API key-ээр, 2026-10-21): маягт бүр 4 үйлчилгээтэй — `survey123_<id>` (ХООСОН 6 талбартай загвар),
     `service_<id>` (ЖИНХЭНЭ өгөгдөл, `hse_*` давхарга · 145–382 талбар), `_form` ба `_results` (эрхгүй 403).
     ЗӨВХӨН `service_<id>`-г уншина. Толгойн талбарууд (site · company · inspector · insp_datetime · week · shift ·
     cnt_* · sc_all_*) бүгдэд ижил; Байгаль орчны (yes/no, cnt_ok/cnt_nc) ба Аюулыг илрүүлэх (асуултгүй, /1 findings)
     хоёр нь зөрүүтэй — `HABEA.uzleg.fieldsBy`. */
  uzEnv: `${ENT_HOSTED}/service_985b2ec629f5480a8d0e071ef51211b8`,
  uzCold: `${ENT_HOSTED}/service_50331e94f21e4ebca3ed9971bc6d3a42`,
  uzFire: `${ENT_HOSTED}/service_53db3f2e7b034167a25851ca62402d44`,
  uzHazard: `${ENT_HOSTED}/service_00dfa6d8bb0f4920bb13364411bb068e`,
  uzAutocrane: `${ENT_HOSTED}/service_4d63bab70b8849abb20eb2b8917b948f`,
  uzPump: `${ENT_HOSTED}/service_72a6df0a2e214c10bab574893cf5ca22`,
  uzGondola: `${ENT_HOSTED}/service_0cf2eaedd0374eca8cca2f59cb22b95e`,
  uzTower: `${ENT_HOSTED}/service_c802687a7d1e4cc781a79cfcaf9d7812`,
} as const;

/* ⚠️ 2026-10-26: `TD` (SELBE_ALL_DATA_last_0917) · `ET` (Selbe_ET_20260721) · `ET_PKG` (Selbe_ET_20260725) — AGOL-ын
   ТҮЛХҮҮРИЙН суурь байсан (`entMap` зураглал · webmap-загварын түлхүүр) — ХАСАГДАВ. Webmap-загвар давхаргын id-аар
   түлхүүрлэгдсэн (`public/webmap-style.json`), өгөгдөл Enterprise-ийн бодит хаягаар (дээрх үйлчилгээнүүд). */


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
  url: `${SELBE_ET}/101`,
  fields: {
    type: "torol",       // Дулаан / Цахилгаан / Ус хангамжийн эх үүсвэр
    name: "нэр",         // байгууламжийн нэр
    share: 'хангах_хувь', // системд эзлэх хувь (%)
    total: 'нийт_чадал',  // байгууламжийн бүрэн чадал
    note: "тайлбар",
  },
  /** Хэрэглэгч бүрд хуваарилсан хүчин чадлын (МВт) талбар */
  consumers: [
    { key: "b1", get label() { return tr('Багц 1'); }, field: "мвт__1" },
    { key: "b2", get label() { return tr('Багц 2'); }, field: "мвт__2" },
    { key: "b31", get label() { return tr('Багц 3.1'); }, field: "мвт__3_1" },
    { key: "b32", get label() { return tr('Багц 3.2'); }, field: "мвт_" },
    { key: "b33", get label() { return tr('Багц 3.3'); }, field: "мвт__3_3" },
    { key: "b41", get label() { return tr('Багц 4.1'); }, field: "мвт__4_1" },
    { key: "b42", get label() { return tr('Багц 4.2'); }, field: "мвт__4_2" },
    { key: "odoo", get label() { return tr('Одоо байгаа'); }, field: "мвт__odoo" },
    { key: "olon", get label() { return tr('Олон нийт'); }, field: "мвт__olonn" },
    { key: "sur", get label() { return tr('Сургууль, цэцэрлэг'); }, field: "мвт__surtsets" },
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
 * буцааж, `permissions` нь БҮХ харагдацыг нээдэг. Тиймээс `.env` (git-ignored —
 * локал бүрт өөр) эсвэл GitHub Variables-ийн нэг мөр санамсаргүй хоосорвол
 * порталын бүх хамгаалалт ЧИМЭЭГҮЙ унтрах эрсдэлтэй байв.
 * ⚠️ 2026-10-09: урьд «`.env` нь репод track хийгддэг» гэж бичсэн нь буруу байв —
 *    `.env` нь `.gitignore`-д, репод зөвхөн `.env.example` (нэрс) байдаг.
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
/* ⚠️ 2026-10-09: урьд энд `if (!AUTH_OFF && !AUTH_APP_ID) { production → throw; dev → console.warn }`
   салбар байв — ҮХМЭЛ код: `AUTH_OFF` биш үед дээрх `req()` хоосон утгад ӨӨРӨӨ шиддэг тул
   тэр нөхцөл хэзээ ч үнэн болдоггүй. Одоо хоосон appId нь dev ба production АЛЬ АЛИНД нь `req()`-ийн
   ил алдаа; нэвтрэлтгүй ажиллах цорын ганц зам — `NEXT_PUBLIC_AUTH_OFF=1`. */
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
