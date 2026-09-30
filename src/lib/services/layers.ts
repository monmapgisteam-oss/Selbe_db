import { PLAN2D_LAYERS } from '../plan2d';
import { t as tr } from '@/lib/i18nCore';
import { ET, HABEA_SVC, HJ, SOURCE_FS, TD, req } from './env';
import { OID, ZONE_FIELD } from './layerDef';
import type { LayerDef } from './layerDef';
import { BUILT_STATUS, M, M2, ZONE_CHART_TYPES, ZONE_MAP_TYPES, ZONE_TYPE_EMPTY } from './palette';
import { GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_STATUS_HUES } from './fields';
import { PKG_HUE, PKG_LAYERS } from './pkg';

/* ══════════ ЗӨВХӨН test_data-д БАЙДАГ давхаргууд (2026-08-24) ══════════
 *
 * ⚠️ Эдгээр нь `TD_LAYER` зураглалаар ШИЛЖСЭН давхарга БИШ: monmap-ын хуучин
 * үйлчилгээнд огт байгаагүй, зөвхөн нэгтгэсэн `test_data`-д бий. Тиймээс
 * `n` (ЕТ-ийн дугаар) байхгүй бөгөөд `url` нь ШУУД бичигдэнэ — миграцийн
 * гогцоо (TD_LAYER) эдгээрийг хөндөхгүй.
 *
 * ⚠️ «_po» дагавартай тавыг ЗОРИУДААР `PKG_TABLE`-д нэмээгүй: тэнд нэмбэл
 * `PKG_BY_BAGTS` дамжин `parcelOverlap`-ийн «давхцсан үлдсэн нэгж талбар»
 * тоо өөрчлөгдөж, нэг багц ШУГАМ ба ТАЛБАЙ хоёроороо ДАВХАР тоологдоно.
 * Эдгээр нь каталогийн бие даасан давхарга — зурагдана, нийлбэрт орно,
 * харин багцын огтлолцлын тооцоог хөндөхгүй.
 */
const TD_ONLY_LAYERS: LayerDef[] = [
  /* ⚠️ 2026-09-17: `po:95…108` (Багц 5.x · Багц 14 худаг/камерын ТАЛБАЙН
     хувилбар, тав) ХАСАГДАВ — `Test0911S`-ээр солигдсон, каталог · төлөвлөгөө ·
     харагдац · анализ аль нь ч хэрэглэдэггүй байсан; `SELBE_ALL_DATA_0917`-д
     нийтлэхдээ давхардал гэж устгасан. */
  /* ── Дугуйн замын ТЭНХЛЭГ. Полигон хувилбар нь `sb:15`/`dugui` ([39]) —
       энэ нь уртаар хэмжигдэх шугам (`urt_m`), бүсэд хуваарилагдана. ── */
  {
    id: "dugui:line",
    n: 40,
    url: `${TD}/40`,
    get title() { return tr('Дугуйн зам — тэнхлэг'); },
    topic: "plan",
    geom: "line",
    hue: "#828282",
    width: 1.4,
    dash: "solid",
    /* ⚠️ `zoneField` ЗОРИУДААР БИЧСЭНГҮЙ: `zoneWhere()` нь талбарын нэрээр биш,
       `zoneField` БАЙГАА ЭСЭХЭЭР `zoneRefValues`/`zoneLegacyValues` салаалдаг
       (доорх мөр ~2732). test_data [40]-ийн ZONE_ID нь ХУУЧИН кодтой («B-2.1»,
       «D-8») тул legacy салаа хэрэгтэй — эс бөгөөс «B-2» бүс сонгоход 0 объект.
       Анхдагч `ZONE_FIELD` нь аль хэдийн "ZONE_ID". */
    qty: { field: "urt_m", unit: 'м' },
  },
  /* ── Усан сан (6 ш). `pkg:96` «Багц 13 · 2000 м³ усан сан» ([64])-ээс
       ТУСДАА цуглуулга — тэр нь нэг багцын ажил, энэ нь бүх усан сан. ── */
  {
    id: "usan-san",
    n: 89,
    url: `${TD}/89`,
    get title() { return tr('Усан сан'); },
    topic: "plan",
    geom: "area",
    hue: PKG_HUE.src,
    fill: 0.35,
    width: 1,
    noZone: true,
    qty: { field: "Shape__Area", unit: 'м²' },
  },
  /* ── Гэрлэн дохио. Геометр нь ШУГАМ (уулзварын хэсэг), цэг БИШ. ── */
  {
    id: "gerlen-dohio",
    n: 103,
    url: `${TD}/103`,
    get title() { return tr('Гэрлэн дохио'); },
    topic: "plan",
    geom: "line",
    hue: "#eab308",
    width: 2.2,
    dash: "solid",
    noZone: true,
    facets: [
      { field: "uulzwar_name", get label() { return tr('Уулзвар'); } },
      /* ⚠️ `Dohioni_ungu` ХАСАВ — 14/14 мөр NULL (амьдаар шалгав). */
    ],
  },
];

/**
 * Төслийн хил — тайлан хилээс ГАДУУР бичигдсэн эсэхийг шалгахад л ашиглана.
 * ⚠️ Давхарга болгож зурахгүй: шинэ ЕТ-ийн бүсийн давхарга төслийн хамрах
 * хүрээг аль хэдийн харуулж байна.
 */
export const BOUNDARY = {
  plan: {
    // test_data [97] selbe_boundry — 2026-08-13 шилжив (khil1/khil2 мөн энд)
    url: `${TD}/97`,
    get title() { return tr('Төлөвлөлтийн талбай'); },
  },
} as const;

/**
 * ⚠️ Дулааны шугамууд эх өгөгдөлдөө ЗУРСАН ӨНГӨӨРӨӨ нэрлэгдсэн (улаан, цэнхэр,
 * ногоон, тасархай) — тэр нь CAD-ийн давхаргын өнгө, инженерийн утга биш.
 * Порталд бүгдийг НЭГ дулааны гэр бүл (дулаан улаан-улбар шар) болгож, хоорондоо
 * зураасны хээ ба зузаанаар ялгав: нэрийг нь хадгалсан ч зурагт «цэнхэр дулаан»
 * нь усны шугамтай андуурагдахаа больсон.
 */
/**
 * SB — «Selbe 2D map 0804» webmap-ийн 14 давхарга (`selbe_3D__0804_WFL1`).
 * Каталогийн LayerDef болгон үүсгэнэ; ГАЗРЫН ЗУРАГТ style нь webmap renderer-ээс
 * ирнэ (`plan2dStyleOf` → `buildLayers`), каталогийн swatch нь fallback `hue`.
 * Талбай/уртыг нийлбэрт тооцуулахаар `qty` тохируулав.
 */
const SB_BASE = `${HJ}/selbe_3D__0804_WFL1/FeatureServer`;
/**
 * ⚠️ `ZONE_ID` талбартай sb давхаргууд — үйлчилгээнээс нэг бүрчлэн шалгасан
 * (2026-08-10): ЗӨВХӨН Явган зам (3) ба Барилга (4). Бусад 12 нь CAD-гаралтай
 * (`Entity`, `Layer`, `cad_layer` талбартай) тул бүсийн шүүлтэд ОРОХГҮЙ —
 * байхгүй талбараар `definitionExpression` тавьбал давхарга зурагдахаа больж,
 * `usePlanTotals`-ын статистик хүсэлт унадаг (Promise.all тул самбар бүхэлдээ
 * «ArcGIS алдаа» болно).
 */
const SB_ZONED = new Set([3, 4]);
const SB_LAYERS: LayerDef[] = PLAN2D_LAYERS.map((l) => ({
  id: l.id,
  n: l.sub,
  url: `${SB_BASE}/${l.sub}`,
  get title() { return l.title; },
  topic: "plan" as const,
  geom: l.geom,
  hue: "#94a3b8",
  fill: 0.4,
  width: 1,
  ...(SB_ZONED.has(l.sub) ? {} : { noZone: true as const }),
  ...(l.geom === "area"
    ? { qty: { field: "Shape__Area", unit: 'м²' } }
    : l.geom === "line"
    ? { qty: { field: "Shape__Length", unit: 'м' } }
    : {}),
}));

/** IoT мэдрэгчийн FeatureServer суурь (`…/arcgis/rest/services`) — `sensors.ts` мөн эндээс. */
export const IOT_BASE = req("NEXT_PUBLIC_ARCGIS_IOT", process.env.NEXT_PUBLIC_ARCGIS_IOT);

/**
 * IoT МЭДРЭГЧ — газрын зурагт харагдах цэгүүд.
 *
 * ⚠️ Давхарга бүр 10,000 хүртэл ТЕЛЕМЕТРИЙН мөртэй бөгөөд мөр бүр ИЖИЛ
 *    геометрээ давтдаг. `where` нь суурилуулалтын ганц мөрийг үлдээж, зурагт
 *    мэдрэгч тус бүр НЭГ цэг болгоно — эс бөгөөс 10,000 цэг нэг дээр овоолж
 *    рендерийг дэмий ачаална.
 * ⚠️ `noZone` — эдгээрт ZONE_ID талбар БАЙХГҮЙ. Бүсээр шүүвэл
 *    definitionExpression бүхэлдээ унаж давхарга зурагдахаа болино.
 * ⚠️ `oid` нь OBJECTID (анхдагч) тул заагаагүй.
 */
const IOT_LAYERS: LayerDef[] = [
  { key: "Waste_Sensor",  n: 62, get title() { return tr('Хогийн савны мэдрэгч'); },   hue: "#ea580c" },
  { key: "Water_Meter",   n: 61, get title() { return tr('Усны тоолуур'); },           hue: "#0891b2" },
  { key: "Light_Sensor",  n: 60, get title() { return tr('Гэрэлтүүлгийн мэдрэгч'); },  hue: "#f59e0b" },
  { key: "Temp_Humidity", n: 64, get title() { return tr('Агаарын темп, чийг'); },     hue: "#22c55e" },
  { key: "Soil_Meter",    n: 63, get title() { return tr('Хөрсний мэдрэгч'); },        hue: "#a855f7" },
].map((x) => ({
  id: `iot:${x.key.toLowerCase()}`,
  n: x.n,
  get title() { return x.title; },
  topic: "iot" as const,
  geom: "point" as const,
  hue: x.hue,
  marker: "circle" as const,
  size: 11,
  url: `${IOT_BASE}/${x.key}/FeatureServer/${x.n}`,
  where: "device_id IS NULL",
  noZone: true as const,
  note: x.key,
}));

export const LAYERS: LayerDef[] = [
  ...SB_LAYERS,
  /* ─────────── Барилга байгууламж ─────────── */
  {
    id: "et:24",
    n: 24,
    /**
     * ⚠️ ЭХ СУРВАЛЖ СОЛИГДСОН (2026-08-12): `Selbe_ET_.../24` → `Selbe_barilga_last/0`.
     *
     * Шинэ давхаргад `ZONE_ID` бүрэн зассан (хуучинд 19 бичлэг «Бүсийн мэдээлэл
     * байхгүй», D-8 хуваагдаагүй, B-2 зөрсөн байв) ба 368 барилгатай (хуучин 363).
     * `Population`, `Urhiin_too`, `Parking`, `Huchin_chadal` дүн нь хуучинтай
     * таарахыг шалгасан (хүчин чадалд −63 санаатай засвар: эмнэлэг 194→125,
     * цэвэрлэх байгууламж 4→2, үйлчилгээ 9,438→9,446).
     *
     * ⚠️ `negj_une` талбар шинэ давхаргад БАЙХГҮЙ (хуучинд 363/363 бичлэгт ижил
     * 4,700,000 байсан). Тухайн үед тогтмолоор орлуулж байсан ч 2026-08-24-нд
     * зохиомол нэгж үнэ дээр тогтсон өртгийн загвар БҮХЭЛДЭЭ хасагдсан тул
     * одоо энэ талбарыг хаанаас ч уншихгүй.
     */
    url: `${HJ}/Selbe_barilga_last/FeatureServer/0`,
    get title() { return tr('Барилга'); },
    topic: "plan",
    geom: "area",
    /**
     * ⚠️ ЭХ ЗУРГААС ЗОРИУД ЗӨРНӨ (хэрэглэгчийн хүсэлт, 2026-07-31). Эх webmap-ийн
     * шар (#ffb700) нь ортофото болон бүсийн шар-улбар палитраас ялгарахгүй
     * байсан тул тод цэнхэрээр сольсон — том талбайн давхаргуудад цэнхэр өөр
     * хаана ч хэрэглэгддэггүй. Газрын зураг дээр `MAP_HUE_OVERRIDES` энэ hue-г
     * снапшотын renderer-т шингээнэ; swatch, uniform горим үүнийг шууд авна.
     */
    hue: "#2563eb",
    fill: 0.45,
    width: 1.4,
    // ⚠️ `Барилгажсан_талбай` нь давхраар үржсэн НИЙТ шалны талбай (152 га) тул
    //    каталогийн талбайд барилгын бодит ХӨЛ (геометрийн Shape__Area, 21 га).
    qty: { field: "Shape__Area", unit: 'м²' },
    get note() { return tr('төлөв, зориулалт, өрх, хүн ам'); },
    facets: [
      { field: "Barilga_ty", get label() { return tr('Барилгын төлөв'); } },
      { field: "Зориулалт_m", get label() { return tr('Зориулалт'); } },
      { field: "zoriulalt", get label() { return tr('Дэлгэрэнгүй зориулалт'); } },
      { field: "TOROL", get label() { return tr('Бүсийн төрөл'); } },
      { field: "Bar_comp", get label() { return tr('Барилгын компани'); } },
    ],
    paint: {
      field: "Barilga_ty",
      values: Object.fromEntries(BUILT_STATUS.map((x) => [x.value, x.hue])),
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
  },

  /* ─────────── Барилгын хяналт (ХУУЧИН үйлчилгээ) ─────────── */
  {
    id: "mon:building",
    /* ⚠️ 2026-08-24: нэгтгэсэн `data`/112 — `BUILDING` тогтмолын тайлбарыг үз. */
    n: 112,
    url: `${TD}/112`,
    get title() { return tr('Барилгын блок (гүйцэтгэл)'); },
    topic: "monitor",
    geom: "area",
    hue: "#ea580c",
    fill: 0.45,
    width: 1.4,
    noZone: true,
    detail: "building",
    oid: "OBJECTID",
    get note() { return tr('Гүйцэтгэл «Гүйцэтгэл бөглөх» хүснэгтээс амьд'); },
    /* ⚠️ `breaks` (GUITS_HV) 2026-08-13-нд ХАСАГДАВ: давхаргын GUITS_HV талбар
       ХУУЧИРСАН (5–14 нэгж зөрдөг) бөгөөд эхний зураглалт болон каталогийн
       тоололд худал өнгө/тоо өгдөг байв. Гүйцэтгэлийн будалтыг MapCanvas нь
       `Selbe_guitsetgel_consolidated`-ын амьд дүнгээр (`buildingProgressRenderer`)
       өөрөө тавьдаг хэвээр. */
  },

  /* ─────────── ХАБЭА — Цамхагт кран (тусдаа үйлчилгээ) ───────────
     ⚠️ URL inline: `HABEA` тогтмол ЭНЭ массиваас ДООР тодорхойлогддог тул TDZ-аас
     сэргийлж `HJ`-ээс шууд угсарна. Бүс полигоныг ЭХЛЭЭД (доор), цэгийг ДЭЭР зурна. */
  {
    id: "habea:buffer",
    n: 51,
    url: `${HJ}/${encodeURIComponent('Цамхагт_кран')}/FeatureServer/51`,
    get title() { return tr('Аюулгүйн бүс'); },
    topic: "monitor",
    geom: "area",
    hue: "#dc2626",
    fill: 0.1,
    width: 1,
    noZone: true,
    oid: "OBJECTID",
  },
  {
    id: "habea:crane",
    n: 50,
    url: `${HJ}/${encodeURIComponent('Цамхагт_кран')}/FeatureServer/50`,
    get title() { return tr('Цамхагт кран'); },
    topic: "monitor",
    geom: "point",
    hue: "#dc2626",
    marker: "circle",
    size: 11,
    noZone: true,
    oid: "OBJECTID",
  },
  /* Осол зөрчлийн бүртгэл — Survey123 цэгүүд (болсон газар нь) */
  {
    id: "habea:osol",
    n: 0,
    url: `${HABEA_SVC.incident}/FeatureServer/0`,
    get title() { return tr('Осол, зөрчил'); },
    topic: "monitor",
    geom: "point",
    hue: "#f59e0b",
    marker: "diamond",
    size: 12,
    noZone: true,
    oid: "objectid",
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  /* ─────────── ХАБЭА — Ажлын байрны үзлэг (Survey123 цэгүүд) ───────────
     2026-09-15, хэрэглэгчийн хүсэлт: «чарт дээр дарахад map дээр бас шүүгдэх».
     ⚠️ URL inline — кран, ослын ижил шалтгаан (`HABEA` ДООР тодорхойлогдоно).
     ⚠️ `auth: true` — хоёр маягт нэргүй асуулгыг хаасан (`LayerDef.auth`).
     ⚠️ `HABEA_LAYER_IDS`-д ОРОХГҮЙ: тэр нь каталогийн тооллогод ордог.
     Харагдах эсэхийг `Habea.tsx` фокусоор удирдана (`HABEA_UZLEG_LAYER_ID`). */
  {
    id: "habea:uzV11",
    n: 0,
    url: `${HABEA_SVC.uzlegV11}/FeatureServer/0`,
    get title() { return tr('Ажлын байрны үзлэг V1.1'); },
    topic: "monitor",
    geom: "point",
    hue: "#16a34a",
    marker: "square",
    size: 10,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzG",
    n: 0,
    url: `${HABEA_SVC.uzlegG}/FeatureServer/0`,
    get title() { return tr('Гүйцэтгэгчийн ажлын байрны үзлэг'); },
    topic: "monitor",
    geom: "point",
    hue: "#7c3aed",
    marker: "square",
    size: 10,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  /* ⚠️ Захиалагчийн үзлэг — V1.1-ийн хажууд зэрэг харагдах тул ӨНГӨ нь
     ногооноос (V1.1) тод ялгаатай цэнхэр. */
  {
    id: "habea:uzZ",
    n: 0,
    url: `${HABEA_SVC.uzlegZahialagch}/FeatureServer/0`,
    get title() { return tr('Захиалагчийн ажлын байрны үзлэг'); },
    topic: "monitor",
    geom: "point",
    hue: "#0284c7",
    marker: "square",
    size: 10,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },

  /* ─────────── Газар чөлөөлөлт (полигоноор шүүх · тусдаа үйлчилгээ) ───────────
     ⚠️ topic:'gazar' тул каталогийн бүлэг (`LAYER_GROUPS`)-т ОРОХГҮЙ — зөвхөн
     «Газар чөлөөлөлт» харагдацад ил гарна. Кадастрыг барилгаас ӨМНӨ бичсэн нь
     санаатай: хоёул `area` (drawOrder 0) тул массивын дараалал зурагдах эрэмбийг
     тодорхойлно — барилга нь кадастрын дүүргэлт дээр гарах ёстой. */
  {
    id: "gazar:parcel",
    n: 0,
    url: GAZAR_PARCEL.url,
    oid: GAZAR_PARCEL.oid,
    get title() { return tr('Кадастрын нэгж'); },
    topic: "gazar",
    geom: "area",
    hue: "#0ea5e9",
    fill: 0.16,
    width: 0.4,
    noZone: true,
    qty: { field: GAZAR_PARCEL.fields.area, unit: 'м²' },
    facets: [
      { field: GAZAR_PARCEL.fields.landuse, get label() { return tr('Зориулалт'); } },
      { field: GAZAR_PARCEL.fields.right, get label() { return tr('Эрхийн төрөл'); } },
    ],
  },
  {
    id: "gazar:building",
    n: 0,
    url: GAZAR_BUILDING.url,
    oid: GAZAR_BUILDING.oid,
    get title() { return tr('Барилга (үнэлгээ)'); },
    topic: "gazar",
    geom: "area",
    hue: "#16a34a",
    fill: 0.5,
    width: 0.5,
    noZone: true,
    // ⚠️ qty (area_m2) test_data [96]-д устсан — системийн Shape__Area-г ашиглана
    qty: { field: "Shape__Area", unit: 'м²' },
    facets: [
      { field: GAZAR_BUILDING.fields.type, get label() { return tr('Төрөл'); } },
      { field: GAZAR_BUILDING.fields.material, get label() { return tr('Материал'); } },
    ],
  },
  /* ⚠️ Хилийн давхаргууд (`gazar:khil`, `gazar:bagts`) ЭНДЭЭС ХАСАГДСАН —
     `khil1`/`khil2`-ын давхар бүртгэл байсан тул нэгтгэв. Хилүүд одоо
     `ALWAYS_ON_IDS`-ээр БҮХ зурагт үргэлж, нэг ижил өнгөөр харагдана. */

  /* ⚠️ 2026-09-17 (2): ЕТ-ийн инженерийн 15 давхарга (`et:3 4 7 8 9 10 16 17
     18 19 23 124…127`) ХАСАГДАВ — эх нь `SELBE_ALL_DATA_last_0917`-д устгагдсан;
     `Инженерийн_дэд_бүтэц__Сэлбэ_0916` (`infra:*`) орлоно. `et:11` (51) үлдэв. */
  /* ─────────── Инженер · дулаан ─────────── */
  {
    id: "et:11",
    n: 11,
    get title() { return tr('Гадна дулаан — цэнхэр шугам'); },
    topic: "plan",
    geom: "line",
    hue: "#e11d48",
    dash: "dash-dot",
    width: 1.7,
    qty: M,
  },

  /* ─────────── Инженер · ус ─────────── */

  /* ─────────── Инженер · цахилгаан ─────────── */
  /* ⚠️ 2026-07-25-нд ХУУЧИН 4 цахилгааны давхарга (110кв/10кв/0.4кв/шугам —
     et:21,13,22,20) БАГЦААР задарсан 4 шинэ давхаргаар СОЛИГДСОН. Шинэ нь
     `Selbe_ET_20260725`-ын 124–127 (бүтэн `url`). `ZONE_ID` ба `urt_m` хэвээр
     тул бүсийн шүүлт ба уртын нийлбэр яг адил ажиллана. */

  /* ─────────── Инженер · бэлтгэл ─────────── */
  {
    id: "et:15",
    n: 15,
    get title() { return tr('Инженерийн бэлтгэл арга хэмжээ'); },
    topic: "plan",
    geom: "line",
    hue: "#6366f1",
    dash: "long-dash",
    width: 2.0,
    qty: M,
    // ⚠️ Нэг мөр биш, огт өөр арга хэмжээнүүд (хашаа, тэгшилгээ, далан…) нэг
    //    давхаргад багтдаг тул `Layer`-ээр ЗААВАЛ задална.
    facets: [{ field: "Layer", get label() { return tr('Арга хэмжээний төрөл'); } }],
    // Каталогт төрлөөрөө задарна — энэ давхарга нэг мөр биш, багц арга хэмжээ
    catalogFacet: true,
  },

  /* ⚠️ 2026-08-24: «Ачаалал бууруулах ШИНЭ зам» (`sz:0`–`sz:3`,
     `Selbe_shine_zam` service) БҮРМӨСӨН ХАСАГДАВ. Эдгээр нь замын сүлжээ
     болж угсардаггүй (`cars: false`), ямар ч тооцоо/оноонд ордоггүй —
     зөвхөн зурган дээр «ийм зам төлөвлөж байна» гэж ҮЗҮҮЛЭХ зориулалттай
     байв. Эзэмшигчийн шийдвэрээр төслөөс гаргав. */

  /* ─────────── Зам ─────────── */
  {
    id: "et:29",
    n: 29,
    get title() { return tr('Зам (талбай)'); },
    topic: "plan",
    geom: "area",
    hue: "#334155",
    fill: 0.24,
    width: 0.7,
    noZone: true,
    get note() { return tr('зөвхөн геометр — атрибутгүй'); },
  },
  {
    id: "et:5",
    n: 5,
    get title() { return tr('Замын тэнхлэг'); },
    topic: "plan",
    geom: "line",
    hue: "#94a3b8",
    dash: "solid",
    width: 0.8,
    // ⚠️ 24,251 хэрчим — жижиг масштабт бүгдийг зурвал зураг бөглөрнө
    minScale: 25000,
    noZone: true,
    qty: { field: "urt_km", unit: 'км' },
  },
  /**
   * ЯВГАН ХҮНИЙ ЗАМ — `Code` талбараар ХОЁР ангилал (2026-09-15,
   * хэрэглэгчийн заавар): `1` = явган хүний зам (1,108 объект, 149,136 м²),
   * `2` = цементэн талбай (1,440 объект, 117,142 м²).
   *
   * ⚠️ `paint.values`-ийн ТҮЛХҮҮР нь МӨР: ArcGIS-ийн `uniqueValueInfos` ба
   * порталын шүүлт хоёулаа утгыг мөрөөр жишдэг. Талбар нь Integer ч
   * `String(value)` болж харьцуулагддаг тул «1»/«2» гэж бичнэ.
   * ⚠️ ҮРГЭЛЖ АСААЛТТАЙ (`ALWAYS_ON_IDS`) — хэрэглэгчийн шаардлага.
   */
  {
    id: "et:27",
    n: 27,
    get title() { return tr('Явган хүний зам'); },
    topic: "plan",
    geom: "area",
    hue: "#a8a29e",
    /* ⚠️ 0.34 → 0.7: ногоон байгууламж ба замын дүүргэлтийн ДЭЭР зурагддаг
       ч хэт тунгалаг байснаас болж ялгагдахгүй байв (2026-09-15). */
    fill: 0.7,
    width: 0.6,
    qty: M2,
    facets: [{ field: "Code", get label() { return tr('Төрөл'); } }],
    paint: {
      field: "Code",
      values: {
        /* Явган хүний зам — дулаахан элсэн өнгө */
        "1": "#d6b48a",
        /* Цементэн талбай — саарал */
        "2": "#9ca3af",
      },
      labels: {
        get "1"() { return tr('Явган хүний зам'); },
        get "2"() { return tr('Цементэн талбай'); },
      },
      /* ⚠️ webmap-ийн нэг өнгийн загварыг ДАРНА — эс бөгөөс хоёр төрөл
         ялгарахгүй (`MapCanvas` §renderer). */
      force: true,
      get emptyLabel() { return tr('Ангилалгүй'); },
    },
  },
  /**
   * ⚠️ 2026-07-31: ЕТ-ийн 14-р давхаргыг ОРЛУУЛСАН — дугуйн зам шинэчлэгдэж
   * тусдаа үйлчилгээ болов (`dugui_zam_20260731`, 167 объект). Хуучин нь ШУГАМАН
   * байсан бол шинэ нь ТАЛБАЙН геометр тул qty нь урт (м) → талбай (м²) болсон.
   * `urt_m`/`negj_une` талбар шинэ үйлчилгээнд ОГТ байхгүй — өртгийн загвараас
   * гарсан (`COST_GROUP_OF`-оос мөн хасагдсан). Бүсийн код нь бүсийн давхаргатай
   * ижил бичиглэлтэй `RefName_1`-д (spatial join) тул `zoneField` шаардлагатай.
   */
  {
    id: "dugui",
    n: 1,
    url: `${HJ}/dugui_zam_20260731/FeatureServer/1`,
    get title() { return tr('Дугуйн зам'); },
    topic: "plan",
    geom: "area",
    // Эх зургийн Дугуйн зам — саарал (каталогийн swatch)
    hue: "#828282",
    fill: 0.35,
    width: 0.8,
    zoneField: "RefName_1",
    qty: { field: "Shape__Area", unit: 'м²' },
  },
  {
    id: "et:12",
    n: 12,
    get title() { return tr('Гүүрэн байгууламж'); },
    topic: "plan",
    geom: "line",
    hue: "#c026d3",
    dash: "solid",
    width: 3.0,
    qty: M,
  },

  /* ─────────── Тээвэр ─────────── */
  {
    id: "et:6",
    n: 6,
    get title() { return tr('Автобусны чиглэл'); },
    topic: "plan",
    geom: "line",
    hue: "#7c3aed",
    dash: "long-dash",
    width: 2.4,
    qty: M,
    facets: [{ field: "chiglel", get label() { return tr('Чиглэл'); } }],
  },
  {
    id: "et:2",
    n: 2,
    get title() { return tr('Автобусны буудал'); },
    topic: "plan",
    geom: "point",
    hue: "#8b5cf6",
    marker: "circle",
    size: 10,
  },
  {
    id: "et:1",
    n: 1,
    get title() { return tr('LRT/BRT зогсоол'); },
    topic: "plan",
    geom: "point",
    hue: "#4f46e5",
    marker: "square",
    size: 11,
  },

  /* ─────────── Бүс ─────────── */
  /**
   * ⚠️ ЕТ-ийн 28-р давхаргыг (52 бүс) ОРЛУУЛСАН — 2026-07-26. Шинэ эх сурвалж нь
   * тусдаа үйлчилгээ бөгөөд бүсчлэл нь ШИНЭЧЛЭГДСЭН: `D-8` нь `D-8.1`/`D-8.2`
   * болж хуваагдаж, `B-2.1` нь `B-2` болж нэгдэж, `X-5/X-10/X-11/X-1.2` нэмэгдсэн
   * (59 объект). Бусад давхарга (барилга, ногоон…) ХУУЧИН кодоо авч явсаар тул
   * `zoneCanon`/`zoneRefValues` хосоор хөрвүүлж холбоно.
   */
  {
    id: "zone",
    n: 0,
    url: `${HJ}/busiin_medeelel_final/FeatureServer/0`,
    oid: "FID",
    get title() { return tr('Хот төлөвлөлтийн бүс'); },
    topic: "plan",
    geom: "area",
    // Хил нь ТОД улбар шар, НАРИЙН; дүүргэлт 70% тунгалаг (alpha 0.3).
    hue: "#f97316",
    fill: 0.3,
    width: 1,
    qty: { field: "GAZAR_M2", unit: 'м²' },
    // ⚠️ Бүсийн ӨӨРИЙН кодын талбар — `ZONE_ID` БИШ. Бүсийн шүүлт үүн дээр тогтоно.
    zoneField: "RefName_1",
    get note() { return tr('FAR, BCR, зогсоолын үзүүлэлттэй'); },
    facets: [
      { field: "Angilal", get label() { return tr('Бүсийн ангилал'); } },
      { field: "zoriulalt", get label() { return tr('Зориулалт'); } },
    ],
    // ⚠️ Зурагт зөвхөн орон сууц/олон нийт улаанаар — бусад нь жигд суурь өнгө
    // ⚠️ Зурагт 2 өнгө (чухал ↔ суурь), диаграмд ангилал бүр өөрийн өнгөтэй.
    paint: {
      field: "Angilal",
      values: ZONE_MAP_TYPES,
      chartValues: ZONE_CHART_TYPES,
      get emptyLabel() { return ZONE_TYPE_EMPTY(); },
    },
  },

  /* ─────────── Газар чөлөөлөлт (тусдаа үйлчилгээ) ─────────── */
  /**
   * ⚠️ Бүсээр ШҮҮХГҮЙ (`noZone`). Талбарууд `Бүс` талбартай ч бичиглэл нь бохир:
   * «A5» (зураасгүй), «БAГЦ4.1.» (кирилл/латин холимог, төгсгөлд цэг), «B2.3»
   * (бүсчлэлд аль хэдийн байхгүй) — 224 талбарын 63 нь л шууд таарна. Бүсийн
   * шүүлт тавибал үлдсэн 161 нь ЧИМЭЭГҮЙ алга болно; тиймээс энэ давхарга
   * шүүлтээс үл хамааран бүтнээрээ зурагдана.
   */
  /**
   * ⚠️ 2026-07-31: Хуучин тусдаа `land:clean` («Цэвэрлэсэн нэгж талбар») давхарга
   * УСТСАН — шинэ нэгтгэсэн үйлчилгээ (`selbe_parcel_last0731`) цэвэрлэсэн талбарыг
   * `Tuluv` төлөвийн нэг утга болгож агуулдаг тул `land:left` дотор өнгөөр гарна.
   */
  {
    id: "land:left",
    n: 11,
    url: PARCEL_LEFT.url,
    /* ⚠️ 2026-09-06: `"OBJECTID"` → `PARCEL_LEFT.oid` (`FID`). Шинэ
       үйлчилгээнд `OBJECTID` нэртэй ЭНГИЙН Integer багана мөн байгаа тул
       хуучнаар үлдээвэл сонголт/тодруулга буруу мөрийг заана. */
    oid: PARCEL_LEFT.oid,
    // ⚠️ Нэр «Чөлөөлөгдөөгүй…» БИШ: давхарга нь БҮХ нэгж талбарыг (чөлөөлсөн +
    //    чөлөөлөгдөөгүй) агуулдаг тул төлөвөөр өнгөлсөн нэгж талбарын давхарга.
    get title() { return tr('Газар чөлөөлөлтийн нэгж талбар'); },
    topic: "plan",
    geom: "area",
    hue: "#e11d48",
    fill: 0.42,
    width: 0.8,
    noZone: true,
    qty: { field: PARCEL_LEFT.fields.area, unit: 'м²' },
    get note() { return tr('Төлөв ба чөлөөлөлтийн явц — амьд'); },
    /* ⚠️ 2026-09-06: «Чөлөөлөлтийн явц» facet ХАСАГДАВ — шинэ эхэд `status`
       ба `progress` нь НЭГ талбар тул хоёр ижил жагсаалт зэрэгцэж гарах байв.
       ⚠️ «Блок» нь шинэ эхэд зөвхөн 31/2,088 мөрд бөглөгдсөн (хуучинд 196) —
       үлдээсэн ч бараг хоосон гарна. */
    facets: [
      { field: PARCEL_LEFT.fields.status, get label() { return tr('Төлөв'); } },
      { field: PARCEL_LEFT.fields.landuse, get label() { return tr('Зориулалт'); } },
    ],
    paint: {
      field: PARCEL_LEFT.fields.status,
      values: PARCEL_STATUS_HUES,
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
  },

  /**
   * ЭХ ҮҮСВЭР — нэгтгэсэн үйлчилгээ (`SOURCE_FS`). Дулаан/цахилгаан/ус хангамжийн
   * эх үүсвэрийн байгууламжийг `torol`-оор өнгө ялгаж зурна. Хуучин Багц 7–15-ын
   * тусдаа давхаргуудыг ЭНЭ ОРЛУУЛНА.
   */
  {
    id: "source:eh",
    n: 7,
    url: SOURCE_FS.url,
    oid: "OBJECTID",
    get title() { return tr('Эх үүсвэр'); },
    topic: "plan",
    geom: "area",
    hue: "#0891b2",
    fill: 0.42,
    width: 1,
    noZone: true,
    facets: [{ field: SOURCE_FS.fields.type, get label() { return tr('Төрөл'); } }],
    paint: {
      field: SOURCE_FS.fields.type,
      values: {
        "Дулааны эх үүсвэр": "#f97316",
        "Цахилгааны эх үүсвэр": "#a855f7",
        "Усан хангамжийн эх үүсвэр": "#0ea5e9",
      },
      get emptyLabel() { return tr('Бусад'); },
    },
  },

  /**
   * ЭХ ҮҮСВЭР — ТӨРӨЛ ТУС БҮРД ТУСДАА ДАВХАРГА (2026-09-15, хэрэглэгчийн
   * заавар: «Давхарга хэсгийн эх үүсвэрт 3 байх ёстой, одоо 2 байна —
   * Дулааны, Усан хангамжийн, Цахилгааны эх үүсвэр»).
   *
   * ⚠️ ЭХ СУРВАЛЖ НЭГ (`data`/105, 7 объект) — зөвхөн `torol` талбараар
   * шүүгдсэн ГУРВАН харагдац. Тусдаа үйлчилгээ БИШ тул тоо, дүн нь
   * нэгтгэсэн `source:eh`-тэй үргэлж нийцнэ.
   *
   * ⚠️ Нэгтгэсэн `source:eh` нь `LAYERS`-т ХЭВЭЭР: дашбоардын «07 Эх
   * үүсвэр» хэсэг (`SECTION_LAYERS.source`), пульс-анимаци ба шошго
   * (`MapCanvas`) түүгээр явдаг. Каталогийн жагсаалтаас л гарав
   * (`CATALOG_DUP_HIDDEN`) — эс бөгөөс нэг зүйл дөрвөн мөр болно.
   *
   * ⚠️ Өнгө нь нэгтгэсэн давхаргын `paint.values`-тай ЯГ ИЖИЛ — нэг зураг
   * дээр хоёр өөр өнгөөр гарах ёсгүй.
   */
  ...([
    ['heat', 'Дулааны эх үүсвэр', '#f97316'],
    ['water', 'Усан хангамжийн эх үүсвэр', '#0ea5e9'],
    ['power', 'Цахилгааны эх үүсвэр', '#a855f7'],
  ] as const).map(([key, type, hue]): LayerDef => ({
    id: `src:${key}`,
    /* ⚠️ `url` ил өгсөн тул `n` нь ашиглагддаггүй — төрлийн шаардлага */
    n: 105,
    url: SOURCE_FS.url,
    oid: "OBJECTID",
    get title() { return tr(type); },
    topic: "plan",
    geom: "area",
    hue,
    fill: 0.42,
    width: 1,
    noZone: true,
    where: `${SOURCE_FS.fields.type} = N'${type}'`,
  })),

  /* ─────────── Бусад ─────────── */
  /**
   * ⚠️ 2026-07-31: ЕТ-ийн 25-р давхаргыг ОРЛУУЛСАН — ногоон байгууламж
   * шинэчлэгдэж тусдаа үйлчилгээ болов. Хуучин давхаргын `talbai_m2`/`negj_une`
   * талбар ОГТ байхгүй — 9.7 их наядын эргэлзээтэй өртөг загвараас хамт гарсан
   * (`COST_GROUP_OF`-оос мөн хасагдсан).
   *
   * ⚠️ ШИНЭ эх сурвалж (`nogoon_baiguulamj/0`, `..._intersect`, 807 объект):
   * бүсийн полигонтой ОГТЛОЛЦУУЛСАН тул объект бүр яг нэг бүсэд багтаж, талбай нь
   * бүсийн хилээр тайрагдсан (нийт 545,102 м²). Кодгүй (null) ногоон УСТСАН —
   * өмнөх `nogoon_baiguulamj20267031/2`-т 209 объект (81,446 м²) бүсгүй унадаг
   * байв. Бүсийн код нь `RefName_12` талбарт, бүсийн давхаргатай ижил бичиглэлтэй.
   */
  {
    id: "nogoon",
    n: 0,
    /* ⚠️ 2026-09-17: `nogoon_baiguulamj` үйлчилгээ УСТГАГДСАН → ЯГ ижил өгөгдөл
       `SELBE_ALL_DATA_last_0917`/118 (`nogoon_baiguulamj_analysis`, 807 объект,
       `RefName_12` талбартай — анализ ч үүнийг уншдаг).
       ⚠️ 2026-09-21: энэ `url`/`zoneField` нь `TD_LAYER`-ийн `nogoon: 35` +
       `TD_FORCE_NOZONE`-оор ҮХМЭЛ болж /35 (нэгтгэсэн ганц полигон, бүсгүй)
       руу дарагдаж байсныг засав — тэнд тайлбартай. Загвар (`plan2dStyleOf`
       alias → `sb:1`) url-аас хамаарахгүй тул зураг дээрх төрх ХЭВЭЭР. */
    url: `${TD}/118`,
    get title() { return tr('Ногоон байгууламж'); },
    topic: "plan",
    geom: "area",
    hue: "#8ebd00",
    fill: 0.34,
    width: 0.8,
    zoneField: "RefName_12",
    qty: { field: "Shape__Area", unit: 'м²' },
  },
  /* ⚠️ 2026-08-24: `et:26` «Цэцэрлэгт хүрээлэн, ногоон алхалт» УСТГАГДАВ —
     эзэмшигчийн шийдвэрээр угаасаа хэрэггүй өгөгдөл байсан. Ногоон
     байгууламжийг нэгтгэсэн `data`/35 (`sb:1`) хангана. */

  /* ─────────── Шинэ feature-ууд (эх webmap) ─────────── */
  /* ⚠️ ЭНЭ ХЭСГИЙН CAD-гаралтай давхаргуудад `ZONE_ID` талбар ОГТ БАЙХГҮЙ тул
     ЗААВАЛ `noZone` — эс бөгөөс бүс сонгоход `usePlanTotals`-ын статистик
     хүсэлт `ZONE_ID IN (…)`-ээр унаж, самбар бүхэлдээ «ArcGIS алдаа» болдог
     (`Promise.all` тул нэг давхаргын алдаа бүгдийг нураана). */
  /* ⚠️ 2026-08-24: `tree` (Tree_1 — 4032 ПОЛИГОН мод) УСТГАГДАВ. Яг ижил 4032
     мод нэгтгэсэн `data`/36-д ЦЭГ хэлбэрээр байгаа бөгөөд `sb:0` id-гаар аль
     хэдийн каталогт бий — өөрөөр хэлбэл давхардал байв. `plan2d.ts` ч "tree"-г
     "sb:0" рүү зураглаж байсан. Хэмжээний тооцоонд оролцдоггүй байсан тул
     зөвхөн зурагдах давхарга нэгээр цөөрнө. */
  /**
   * ХҮҮХДИЙН ТОГЛООМ (цэг, 111) — төрлөөр (Гулгуур/Дүүжин/Том гулсууран) ЭГЦ
   * ДЭЭРЭЭС харсан SVG дүрс (MapCanvas тавина). СУУРЬ давхаргын нэг:
   * каталог/үзүүлэлтэд ОРОХГҮЙ (хэрэглэгчийн хүсэлт) — зөвхөн дашбоард ба
   * төлөвлөгөөний зурагт default давхаргуудтай хамт харагдана (`BASE_MAP_IDS`,
   * `INITIAL_MAP_LAYERS`). ZONE_ID-гүй тул бүс сонгоход орон зайн маскаар бүдгэрнэ.
   */
  {
    id: "tgl",
    n: 140,
    /* ⚠️ 2026-09-17: `huuhdiin_togloom/18` (111 цэг, `type`-тэй) УСТГАГДСАН →
       `SELBE_ALL_DATA_last_0917`/140 «Тоглоомын_талбай» (54 ТАЛБАЙ, CAD, `type`
       алга). Тиймээс цэгийн SVG/3D дүрс (`toglRenderer`, `tgl3d`) ажиллахгүй —
       MapCanvas тэдгээрийг `geom === 'point'` үед л хэрэглэнэ; одоо энгийн
       талбайн давхарга. */
    url: `${TD}/140`,
    get title() { return tr('Хүүхдийн тоглоом'); },
    topic: "plan",
    geom: "area",
    hue: "#f59e0b",
    fill: 0.35,
    width: 0.9,
    noZone: true,
  },
  /** Авто зам — `Бусад_мэдээлэл_20260724`/193 (кирилл нэрийг encode). Бусад бүлэгт. */
  {
    id: "road",
    n: 193,
    url: `${HJ}/${encodeURIComponent('Бусад_мэдээлэл_20260724')}/FeatureServer/193`,
    get title() { return tr('Авто зам'); },
    topic: "plan",
    geom: "line",
    hue: "#ffffff",
    width: 1.56,
    dash: "solid",
    noZone: true,
  },
  /** Одоо байгаа зам — `Бусад_мэдээлэл_20260724`/194. Бусад бүлэгт. */
  {
    id: "roadOld",
    n: 194,
    url: `${HJ}/${encodeURIComponent('Бусад_мэдээлэл_20260724')}/FeatureServer/194`,
    get title() { return tr('Одоо байгаа зам'); },
    topic: "plan",
    geom: "line",
    hue: "#4d5863",
    width: 1.5,
    dash: "solid",
    noZone: true,
  },
  /* ⚠️ 2026-08-24: «Бусад_мэдээлэл_20260724» үйлчилгээ төслөөс ГАРСАН.
     · `bm128` «Тодорхойгүй цахилгааны шугам» (21 хэрчим, 510 м) — хаягдал
       өгөгдөл байсан тул бүрмөсөн хасав.
     · `bm145`/`bm87` (Сэлбэ дулаан станц 21МВт, Шинэ их үүсвэр 47.8МВт) —
       нэгтгэсэн `data`/105 (`source:eh` «Эх үүсвэр») дотор ЧАДЛААРАА ЯГ
       таарч байсан тул давхардал байв.
     · `bm146` нь `TD_LAYER`-ээр `data`/41 руу аль хэдийн шилжсэн тул үлдэв. */
  {
    id: "bm146",
    n: 146,
    url: `${HJ}/${encodeURIComponent('Бусад_мэдээлэл_20260724')}/FeatureServer/146`,
    get title() { return tr('Дамбадаржаа дулааны станц'); },
    topic: "plan",
    geom: "line",
    hue: "#b5fcd6",
    width: 1,
    dash: "solid",
    noZone: true,
  },
  /* ── Хил / төлөвлөлтийн талбай (ӨӨР үйлчилгээ) ──
     ⚠️ БҮХ газрын зураг дээр ҮРГЭЛЖ харагдана (`ALWAYS_ON_IDS` → MapCanvas
     хүчээр асаана) — каталогоос унтраах боломжгүй тул бүлэгт ОРУУЛААГҮЙ.
     Урьд нь Gazar харагдацад `gazar:khil`/`gazar:bagts` нэрээр ӨӨР өнгөтэй
     ДАВХАР бүртгэлтэй байсныг нэгтгэв — нэг хил ХАА Ч нэг өнгөтэй байх ёстой.
     Өнгө нь бусад бүх давхаргын hue-тай ДАВХЦАХГҮЙ байхаар сонгосон
     (магента ба неон шар-ногоон — өөр хаана ч хэрэглэгддэггүй).
     ⚠️ ZONE_ID талбаргүй тул `noZone`; fill:0 — зөвхөн хүрээ, эс бөгөөс байнгын
     дүүргэлт бүх зургийг будна. */
  /* ⚠️ 2026-09-17: `khil2` (Сэлбэ 2 хил, MUST `Сэлбэ_2_khil`) ХАСАГДАВ —
     хэрэглэгчийн шийдвэр, monmap руу шилжүүлээгүй. `khil1` л үлдэнэ. */
  {
    id: "khil1",
    n: 2,
    url: `${HJ}/Tuluvlult_talbai/FeatureServer/2`,
    get title() { return tr('Сэлбэ 1 хил'); },
    topic: "plan",
    geom: "area",
    hue: "#ccff00",
    fill: 0,
    width: 1.8,
    noZone: true,
  },
  ...PKG_LAYERS,
  ...TD_ONLY_LAYERS,
  ...IOT_LAYERS,
];

/* ══════════ TEST_DATA ШИЛЖИЛТ — 2026-08-13 ══════════ */

/**
 * Каталогийн давхарга → test_data-гийн давхаргын дугаар. Гурван geometry-matcher
 * агентын тулгалтаар (нэр · зориулалт · тоо · талбар) баталгаажсан зураглал.
 *
 * ⚠️ ЭНД БАЙХГҮЙ id-ууд ХУУЧИН үйлчилгээндээ үлдэнэ (нэгтгэсэн `data`-д
 * эквивалент алга): mon:building (AIL_TOO, GUITS_HV талбар [107]-д
 * дутуу), habea:osol + ХАБЭА-ийн хоёр Survey123.
 *
 * ⚠️ 2026-08-24: эквивалентгүй байсан `tree`, `sz:0`–`sz:3`, `et:26`,
 * `bm128`/`bm145`/`bm87` давхаргууд нь ЭНД биш, `LAYERS`-ээс БҮРМӨСӨН
 * устгагдсан (давхардсан эсвэл хэрэггүй өгөгдөл байв).
 */
const TD_LAYER: Record<string, number> = {
  /* sb — «2D map 0804» webmap давхаргууд */
  "sb:0": 36, "sb:1": 35, "sb:2": 85, "sb:3": 88, "sb:4": 108, "sb:5": 38,
  "sb:7": 93, "sb:8": 92, "sb:10": 101, "sb:11": 100, "sb:13": 91, "sb:14": 90,
  "sb:15": 39, "sb:16": 43,
  /* et — ерөнхий төлөвлөгөө */
  /* ⚠️ 2026-09-17 (2): `et:3 4 7 8 9 10 16 17 18 19 23` ХАСАГДАВ — эх давхарга
     нь `SELBE_ALL_DATA_last_0917`-д устгагдсан (`infra:*`-ээр солигдсон).
     `et:12` → 141 (`Гүүр`, шинэ CAD давхарга). */
  "et:1": 99, "et:2": 87, "et:5": 104, "et:6": 86,
  "et:11": 51, "et:12": 141,
  "et:15": 37,
  "et:24": 108, "et:27": 88, "et:29": 85,
  /* pkg — дэд бүтцийн багцууд */
  "pkg:33": 84, "pkg:34": 83, "pkg:36": 78, "pkg:37": 77, "pkg:39": 80,
  "pkg:40": 79, "pkg:42": 82, "pkg:43": 81,
  "pkg:93": 61, "pkg:95": 63, "pkg:96": 64, "pkg:97": 65, "pkg:98": 66,
  "pkg:99": 67, "pkg:100": 68, "pkg:102": 70, "pkg:104": 72, "pkg:106": 74,
  "pkg:108": 76,
  "pkg:147": 19, "pkg:149": 17, "pkg:150": 18, "pkg:151": 20, "pkg:153": 15,
  "pkg:154": 16, "pkg:156": 13, "pkg:157": 14,
  "pkg:195": 31, "pkg:198": 50, "pkg:201": 30, "pkg:203": 49, "pkg:205": 48,
  "pkg:206": 29, "pkg:209": 28, "pkg:210": 47, "pkg:213": 46, "pkg:214": 27,
  "pkg:217": 26, "pkg:218": 45, "pkg:221": 25, "pkg:222": 44,
  "pkg:226": 4, "pkg:228": 10, "pkg:230": 12, "pkg:232": 11, "pkg:234": 3,
  "pkg:235": 2, "pkg:236": 1, "pkg:237": 0, "pkg:242": 142, "pkg:243": 22,
  /* бусад тусдаа үйлчилгээнээс нэгдсэн */
  /* ⚠️ 2026-09-21: `nogoon: 35` ХАСАГДАВ. Энэ бичлэг LayerDef-ийн `url`
     (/118) ба `zoneField: "RefName_12"`-ийг чимээгүй дарж `data`/35 руу
     онооход амьд шалгалт: /35 = `Ногоон_байгууламж_0813` — 807 хэсгийг
     НЭГТГЭСЭН ГАНЦ полигон (1 мөр, 587,555 м², `RefName_12` АЛГА) = `sb:1`-ийн
     яг тэр давхарга; /118 = `nogoon_baiguulamj_analysis` — 807 объект,
     545,102 м², `RefName_12` 55 бүсээр. Тиймээс бүсээр шүүхэд ногоон бүхэлдээ
     үлдэж, «Ногоон байгууламж» тоо бүсээс хамаарахгүй байв. Одоо LayerDef
     хэвээр /118 (бүсийн хилээр тайрагдсан тул нийт 4.2 га бага — бүсээс
     ГАДУУРХ ногоон энд байхгүй, `sb:1` суурь давхаргад харагдсаар). */
  tgl: 102, dugui: 39, zone: 106, khil1: 97,
  road: 104, roadOld: 98, bm146: 41,
  /* ⚠️ 2026-09-04: `khil2: 97` ХАСАГДАВ. Үхсэн `Tuluvlult_talbai`-аас нэгтгэсэн
     `data` руу шилжүүлэх үед «Сэлбэ 2 хил» нь «Сэлбэ 1 хил»-ийн мөрийг хамт
     дараад авчихсан байв — хоёулаа `data`/97 руу зааж, каталогт нэг полигон
     хоёр нэрээр гарч, «Сэлбэ 2 хил»-ийг асаахад Сэлбэ 1-ийн полигон ЯГАНААР
     давхарлаж байлаа. `khil2`-ын жинхэнэ эх сурвалж (`Сэлбэ_2_khil`, өөр org)
     АМЬД тул LayerDef-ийн ил `url` хэвээр үлдэнэ.
     Амьд хэмжилт (2026-09-04): `data`/97 = `selbe_boundry_0813`, 1 обьект,
     Shape__Area 159.5684 га; `Сэлбэ_2_khil`/0 = «Сэлбэ-2», 2 обьект,
     Shape__Area 21.7593 га — өөр талбай, өөр обьектын тоо, өөр oid (`FID`). */
  /* ⚠️ `land:left` ЭНД БАЙХГҮЙ: 2026-08-19-нд өөрийн шинэ үйлчилгээ рүү
     (`selbe_parcel_last0731`) шилжсэн. Энд буцааж нэмбэл миграцийн гогцоо
     `PARCEL_LEFT.url`-ыг test_data [94] руу дарж бичиж, шинэчлэл замхарна. */
  "gazar:parcel": 95, "gazar:building": 96,
  /* ⚠️ `habea:crane` (8) ба `habea:buffer` (7) ЭНДЭЭС ХАСАГДАВ (2026-09-04,
     хэрэглэгчийн хүсэлт). Тэдгээр нь одоо ӨӨРИЙН үйлчилгээ рүү шууд ханддаг:
     `Цамхагт_кран/FeatureServer/50` ба `/51` (LayerDef-ийн `url` аль хэдийн
     тийш заасан байсан — зөвхөн энэ шилжүүлэгч дарж бичиж байв).

     ⚠️ ЯАГААД ЧУХАЛ ВЭ: test_data-гийн хуулбар (`Цамхагт_кран_0813`) нь
     `Tuluv` талбартаа БҮХ 50 кранг «Одоо байгаа» гэж бичсэн байв. Эх
     үйлчилгээнд «Одоо байгаа» 48, «Буусан» 2 — өөрөөр хэлбэл буусан кран
     хуулбар дээр «ажиллаж байгаа» мэт харагддаг байсан. `Habea.tsx`-ийн
     «идэвхтэй N/N» гэсэн заалт яг ЭНЭ шалтгаанаар (§967, §1167) ганц тоо
     болж хураагдсан — эх сурвалж руу буцсанаар тэр ялгаа сэргэнэ. */
};

/** `talbai_m2` атрибут нь [id]-д устсан — системийн Shape__Area-д буулгана */
const TD_QTY_SYS_AREA = new Set([
  "pkg:226", "pkg:228", "pkg:230", "pkg:232", "pkg:234", "pkg:235",
  "pkg:236", "pkg:242", "pkg:243",
]);
/** `urt_km` уртын талбар test_data-д устсан — системийн Shape__Length (м)-д буулгана */
/* ⚠️ `et:12` (`Гүүр` 141) — CAD давхарга, `urt_m` алга (2026-09-17). */
const TD_QTY_SYS_LENGTH = new Set(["et:5", "et:12"]);
/** qty-ийн талбар нь ӨӨР нэрээр хадгалагдсан давхаргууд */
const TD_QTY_FIELD: Record<string, string> = { "pkg:237": "Area_m2" };
/** Бүсийн талбар нь test_data-д устсан — нэгдсэн шүүлтээс гаргана */
/* ⚠️ `et:12`(141) · `pkg:242`(142) — шинэ CAD давхаргад `ZONE_ID` алга (2026-09-17). */
/* ⚠️ 2026-09-21: `nogoon` ХАСАГДАВ — `TD_LAYER`-ийн тайлбарыг үз (/118 нь
   `RefName_12`-той тул `zoneField` ажиллана). */
const TD_FORCE_NOZONE = new Set(["dugui", "pkg:234", "et:12", "pkg:242"]);
/**
 * oid нь FID → OBJECTID болж өөрчлөгдсөн давхаргууд.
 * ⚠️ 2026-09-04: `khil2: "OBJECTID"` ХАСАГДАВ. `khil2` нь `TD_LAYER`-ээс гарсан
 * тул доорх гогцоо түүнд ХҮРЭХГҮЙ — энэ бичлэг үхмэл байсан ба «OID нь
 * OBJECTID болсон» гэсэн ХУДАЛ баримт үлдээж байв. Амьд шалгалт:
 * `Сэлбэ_2_khil`/0-ийн `objectIdField` = `FID` (LayerDef-д ил бичигдсэн).
 */
const TD_OID: Record<string, string> = { zone: "OBJECTID" };
/** catalogFacet-ийн ангиллын талбар нь устсан — задаргааг авна */
const TD_DROP_FACETS = new Set(["et:15"]);

/**
 * ШИЛЖҮҮЛЭГЧ: url-ыг test_data руу онооно, ХУУЧИН url-ыг `styleUrl` болгож
 * webmap-загварын хайлтад үлдээнэ (зураг дээрх style ХЭВЭЭР — хэрэглэгчийн
 * шийдвэр). Мөн нэгтгэсэн `data`-д устсан талбаруудын хэрэглээг (qty/facet/
 * zoneField/oid) давхарга бүрд аюулгүй болгоно — эс бөгөөс байхгүй талбараар
 * query явж давхарга бүхэлдээ унана.
 */
for (const l of LAYERS) {
  const n = TD_LAYER[l.id];
  if (n == null) continue;
  l.styleUrl = l.url ?? `${ET}/${l.n}`;
  l.url = `${TD}/${n}`;
  if (l.qty && TD_QTY_SYS_AREA.has(l.id)) l.qty = { field: "Shape__Area", unit: 'м²' };
  if (l.qty && TD_QTY_SYS_LENGTH.has(l.id)) l.qty = { field: "Shape__Length", unit: 'м' };
  const qf = TD_QTY_FIELD[l.id];
  if (l.qty && qf) l.qty = { ...l.qty, field: qf };
  if (TD_FORCE_NOZONE.has(l.id)) {
    l.noZone = true;
    delete l.zoneField;
  }
  const oid = TD_OID[l.id];
  if (oid) l.oid = oid;
  if (TD_DROP_FACETS.has(l.id)) {
    delete l.facets;
    delete l.catalogFacet;
  }
}

export const LAYER_BY_ID: Record<string, LayerDef> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);


/**
 * Эх webmap-ийн снапшот загварыг хэрэглэхдээ ӨНГИЙГ нь каталогийн `hue`-ээр
 * ОРЛУУЛАХ давхаргууд (хэрэглэгчийн хүсэлт). Снапшот файлыг өөрчлөхгүй — тэр нь
 * `tools/webmap_style.mjs`-ээр дахин үүсдэг тул засвар устдаг. MapCanvas
 * renderer-ийн өнгийг, LayerSwatch каталогийн симболын өнгийг эндээс шийднэ —
 * хоёул нэг эх сурвалж тул зураг ба каталог хэзээ ч зөрөхгүй.
 */
export const MAP_HUE_OVERRIDES: ReadonlySet<string> = new Set(["et:24"]);

/**
 * БҮХ газрын зурагт ҮРГЭЛЖ харагдах давхаргууд (лавлагааны хилүүд).
 *
 * ⚠️ MapCanvas эдгээрийг каталогийн `visible` жагсаалтаас ҮЛ ХАМААРАН хүчээр
 * асаана — ямар ч харагдац/сэдэвт нэг ижил өнгөөр гарч, каталогоос унтраагдахгүй.
 * `khil1` = Сэлбэ 1 хил (Tuluvlult_talbai). `khil2` = Сэлбэ 2 хил нь
 * ЭНД ОРОХГҮЙ — каталогоор л асаадаг (анхдагчаар унтраалттай).
 * Хил нь зөвхөн зураас (fill:0) тул дороо байгаа давхаргуудыг далдлахгүй.
 */
export const ALWAYS_ON_IDS = ["khil1"] as const;

/**
 * ЗӨВХӨН «ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ»-Д ҮРГЭЛЖ АСААЛТТАЙ (2026-09-15).
 *
 * ⚠️ `ALWAYS_ON_IDS`-Д БИШ: тэр нь ГЛОБАЛ бөгөөд явган хүний зам нь газар
 * чөлөөлөлт, багцын гүйцэтгэл, IoT зэрэг сэдэвчилсэн зурагт хамаагүй
 * дүүргэлт нэмдэг байв (хэрэглэгчийн заавар: «бусад мап дээр харагдахгүй»).
 *
 * ⚠️ Хил (`khil1`) нь ЭСРЭГЭЭР бүх зурагт хэрэгтэй лавлагаа тул тэнд үлдэнэ.
 */
export const PLAN_ALWAYS_ON_IDS = ["et:27"] as const;

/**
 * Лавлагааны хилийн давхаргууд — ДАРЖ СОНГОГДОХГҮЙ (hitTest-д оролцохгүй).
 *
 * ⚠️ Эдгээр нь бүх талбайг бүрхсэн ТОМ полигон (fill:0, зөвхөн зураас) тул
 * дээр нь байгаа хэдий ч дарахад доорх барилга/бүс/нэгжийг ХАЛХАЛЖ болохгүй.
 * MapCanvas эдгээрийг `PASSIVE`-т нэмж, сонголтоос ХАСНА — ингэснээр дарах туяа
 * шууд доорх бодит объектод хүрнэ. (khil2 унтраалттай ч асаахад мөн адил.)
 */
export const REFERENCE_IDS = ["khil1"] as const;

/** Ихэнх давхарга ЕТ-ээс; хяналтынх нь өөрийн бүтэн хаягтай */
/**
 * Давхаргын бодит хаяг.
 *
 * ⚠️ НӨӨЦ ЗАМ УСТГАГДАВ (2026-08-29). Урьд нь `l.url ?? `${ET}/${l.n}`` байв —
 * гэтэл `ET` (`Selbe_ET_20260721`) нь 2026-08-27-нд ХААГДСАН (400). Тиймээс
 * `url`-гүй давхарга нэмэх эсвэл шилжүүлэгч дээр алдвал тэр давхарга үхсэн
 * үйлчилгээ рүү хандаж, зурагт ЮУ Ч ГАРАХГҮЙ — алдааны мэдэгдэл ч байхгүй,
 * зүгээр л хоосон. Одоо 127/127 давхарга ил `url`-тай (шилжүүлэгч бөглөнө)
 * тул нөөц зам хэрэггүй; дутуу тохиолдол ЧАНГА унана.
 */
export const layerUrl = (l: LayerDef) => {
  if (!l.url) {
    throw new Error(
      `Давхарга «${l.id}» (${l.title ?? "—"}) хаяггүй — LayerDef.url заавал. ` +
      `Хуучин ET нөөц зам хаагдсан үйлчилгээ рүү зааж байсан тул устгав.`,
    );
  }
  return l.url;
};

/* ⚠️ 2026-08-24: `costSource()` УСТГАГДАВ — `LayerDef.cost`/`costSrc` талбарууд
   ба `negj_une` дээр тогтсон өртгийн загвар бүхэлдээ хасагдсан (зохиомол дата). */

/**
 * Давхаргын OID талбар.
 * ⚠️ `OBJECTID`-г ХАТУУ бичиж болохгүй: барилгын блок `FID`, Survey123 `objectid`,
 * бүсийн шинэ давхарга `FID` гэсэн нэртэй. Байхгүй талбараар `COUNT()` асуувал
 * ArcGIS «Cannot perform query. Invalid query parameters.» гэж БҮХ хүсэлтийг
 * унагаана — давхарга зурагдахгүй, карт хоосон үлдэнэ.
 */
export const oidOf = (l: LayerDef) => l.oid ?? OID;

/** Бүсийн давхарга — нэгдсэн шүүлт, бүсийн самбар үүн дээр тогтоно */
export const ZONE_LAYER = LAYER_BY_ID["zone"];
/** Барилгын давхарга — бүсийн самбар «энд юу баригдаж байна» гэдгийг эндээс авна */
export const BUILT_LAYER = LAYER_BY_ID["et:24"];

/** Барилгын давхаргын онцлох талбарууд */
export const BUILT_FIELDS = {
  status: "Barilga_ty",
  purpose: 'Зориулалт_m',
  floorArea: 'Барилгын_нийт_талбай_m2',
  usable: 'Барилгажсан_талбай',
  households: "Urhiin_too",
  population: "Total_population",
  parking: "Parking",
  floors: 'Давхрын_тоо_max',
  block: 'Блокы',
  company: "Bar_comp",
} as const;

/**
 * Бүсийн давхаргын талбарууд — `busiin_medeelel_final`.
 *
 * ⚠️ Хуучин ЕТ-28-д байсан МӨНГӨНИЙ ба БАГЦЫН талбарууд (`TUSUV_NIIT`,
 * `GUITSETGEG`, `GEREE_ON`, `GUITS_2025`, `ULD_2026EH`, `BAGTS_DUG`) шинэ
 * үйлчилгээнд БАЙХГҮЙ. Тэдгээр үзүүлэлт «Хөрөнгө оруулалт» (INVEST) ба
 * «Багцын мэдээлэл» (BUS_cashflow) картуудад аль хэдийн бүрэн задарсан тул
 * дахин авчрахгүй.
 *
 * ⚠️ Одоо байгаа зогсоол (`ET_NIIT`) ч байхгүй — шинэ давхаргад ЗӨВХӨН
 * төлөвлөсөн зогсоол ил/далдаараа бий. Хангамжийн харьцаа (төлөвлөсөн ÷ норм)
 * хэвээр бодогдоно.
 */
export const ZONE_FIELDS = {
  id: "RefName_1",
  type: "Angilal",
  purpose: "zoriulalt",
  landM2: "GAZAR_M2",
  landHa: "GAZAR_GA",
  builtM2: "BAR_M2",
  far: "FAR",
  /** FAR хувиар — түүхий `FAR` талбар зарим бүст таслагдсан тул үүнийг эрхэмлэнэ */
  farPct: "FAR_HUVI",
  bcr: "BCR",
  households: "URH_TOO",
  /** Албан ёсны цэвэр талбай (га) — зам, нийтийн эзэмшил хассан */
  areaHa: "Area",
  parkNorm: "NORM_ZOGS",
  parkPlanOpen: "GADNA_ZOG",
  parkPlanUnder: "DUL_ZOG",
  coverage: "HURTEEMJ",
  /** Газар чөлөөлөлт дуусаагүй бүс (1/0) */
  landPending: "ga_ch_dut",
} as const;

/* ── Бүсийн код: шинэ давхарга ↔ бусад давхарга ── */

/**
 * ⚠️ ХУВААГДСАН / НЭГТГЭГДСЭН бүс. Шинэ бүсчлэл нь ЭРХ БҮХИЙ эх сурвалж, харин
 * барилга, ногоон зэрэг давхарга ХУУЧИН кодоо авч явсаар: `D-8` нь хоёр бүс
 * болж хуваагдаж, `B-2.1` нь `B-2` болж нэгдсэн. Дүрмээр таах боломжгүй тул
 * ЗӨВХӨН энэ хүснэгтээр холбоно — шууд жиших нь 368 барилгын 34-ийг унагаана.
 */
const ZONE_SPLIT: Record<string, string[]> = {
  "D-8": ["D-8.1", "D-8.2"],
  "B-2.1": ["B-2"],
};
/** Шинэ код → хуучин `ZONE_ID` (дээрхийн эсрэг тал) */
const ZONE_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(ZONE_SPLIT).flatMap(([legacy, news]) =>
    news.map((n) => [n, legacy]),
  ),
);

/**
 * Бүсийн кодын БИЧИГЛЭЛийг цэвэрлэнэ, утгыг нь ӨӨРЧЛӨХГҮЙ:
 * «Багц -1» → «Багц-1» · «E-5-1» → «E-5.1». Хуваалт/нэгтгэлийг энд ХИЙХГҮЙ —
 * эс бөгөөс `D-8.1` ба `D-8.2` хоёр нэг мөр болж нурж, анализ давхардсан id-тай
 * болно.
 */
export const zoneCanon = (v: unknown): string => {
  const s = String(v ?? "")
    .replace(/\s+/g, "")
    .trim();
  if (!s) return "";
  const [head, ...rest] = s.split("-");
  return rest.length > 1 ? `${head}-${rest.join(".")}` : s;
};

/**
 * Бүсийн давхаргад БОДИТООР бичигдсэн `RefName_1` утгууд. Хуучин код өгвөл
 * харгалзах ШИНЭ бүс(үүд) рүү тэлнэ («D-8» → `D-8.1` ба `D-8.2`).
 */
export const zoneRefValues = (id: string): string[] => {
  const canon = zoneCanon(id);
  return [
    ...new Set(
      (ZONE_SPLIT[canon] ?? [canon]).flatMap((c) => [
        c,
        c.replace("-", " -"),
        c.replace(/^([^-]+-\d+)\.(\d+)$/, "$1-$2"),
      ]),
    ),
  ];
};

/** Бусад давхаргын `ZONE_ID` утга — шинэ код өгвөл хуучин руу нь буцаана */
export const zoneLegacyValues = (id: string): string[] => {
  const canon = zoneCanon(id);
  return [ZONE_LEGACY[canon] ?? canon];
};

/**
 * Давхаргад тохирсон бүсийн WHERE — бүсийн давхаргад өөрийнх нь талбар ба
 * бичиглэлээр, бусдад нь `ZONE_ID`-гаар.
 * ⚠️ Хоёр тал нь ЖАГСААЛТААР (`IN`): нэг бүс нөгөө талдаа хоёр мөр байж болно.
 *
 * ⚠️ ОЛОН БҮС (2026-07-31): `id` нь таслалаар тусгаарласан жагсаалт байж болно
 * («B-1,B-2»). Шүүлтийн төлөв `string | null` хэвээр — Portal, urlState (`z=`),
 * `usePlanTotals`-ын кэш түлхүүр гээд бүх дамжуулалт өөрчлөгдөлгүй үлдэж,
 * задаргааг ЗӨВХӨН энд нэг газар хийнэ. Сонгогч UI нь `ZoneBar` (ViewPanel).
 */
export const zoneWhere = (l: LayerDef, id: string): string | null => {
  if (l.noZone) return null;
  const ids = String(id).split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return null;
  const field = l.zoneField ?? ZONE_FIELD;
  /* ⚠️ `ZONE_ID` давхаргад ХУУЧИН + ШИНЭ кодын НЭГДЭЛ (2026-09-25). Барилгын
     давхарга (`et:24`/`sb:4` → SELBE_ALL_DATA/108) одоо ШИНЭ кодтой («D-8.1»,
     «D-8.2», «B-2») тул зөвхөн хуучин руу хөрвүүлбэл (`D-8.1` → `'D-8'`) тэр
     гурван бүсийн 34 барилга 0 болж, зураг ч хоосон гардаг байв. Хуучин кодтой
     давхаргад (dugui:line г.м.) шинэ код огт байхгүй тул нэгдэл аюулгүй. */
  const vals = [
    ...new Set(
      ids.flatMap((z) => (l.zoneField
        ? zoneRefValues(z)
        : [...zoneLegacyValues(z), ...zoneRefValues(z)])),
    ),
  ];
  return `${field} IN (${vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
};
