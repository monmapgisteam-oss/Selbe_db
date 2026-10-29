import { PLAN2D_LAYERS } from '../plan2d';
import { t as tr } from '@/lib/i18nCore';
import { BAGTS_AJLUUD, ENT_HOSTED, HAB_KRAN, HABEA_SVC, HET, SELBE_ET, SOURCE_FS } from './env';
import { OID, ZONE_FIELD } from './layerDef';
import type { LayerDef } from './layerDef';
import { BUILT_STATUS, M, M2, ZONE_CHART_TYPES, ZONE_MAP_TYPES, ZONE_TYPE_EMPTY, zoneType } from './palette';
import { GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_STATUS_HUES } from './fields';
import { PKG_HUE, PKG_LAYERS } from './pkg';

/* ══════════ ЗӨВХӨН test_data-д БАЙДАГ давхаргууд (2026-08-24) ══════════
 */
const TD_ONLY_LAYERS: LayerDef[] = [
  /* ── Дугуйн замын ТЭНХЛЭГ. Полигон хувилбар нь `sb:15`/`dugui` ([39]) —
       энэ нь уртаар хэмжигдэх шугам (`urt_m`), бүсэд хуваарилагдана. ── */
  {
    id: "dugui:line",
    n: 40,
    url: `${SELBE_ET}/138`,
    get title() { return tr('Дугуйн зам — тэнхлэг'); },
    topic: "plan",
    geom: "line",
    hue: "#828282",
    width: 1.4,
    dash: "solid",
    qty: { field: "urt_m", unit: 'м' },
  },
  /* ── Усан сан (6 ш). `pkg:96` «Багц 13 · 2000 м³ усан сан» ([64])-ээс
       ТУСДАА цуглуулга — тэр нь нэг багцын ажил, энэ нь бүх усан сан. ── */
  {
    id: "usan-san",
    n: 89,
    url: `${SELBE_ET}/123`,
    get title() { return tr('Усан сан'); },
    topic: "plan",
    geom: "area",
    hue: PKG_HUE.src,
    fill: 0.35,
    width: 1,
    noZone: true,
    qty: { field: "SHAPE__Area", unit: 'м²' },
  },
  /* ── Гэрлэн дохио. Геометр нь ШУГАМ (уулзварын хэсэг), цэг БИШ. ── */
  {
    id: "gerlen-dohio",
    n: 103,
    url: `${SELBE_ET}/103`,
    get title() { return tr('Гэрлэн дохио'); },
    topic: "plan",
    geom: "line",
    hue: "#eab308",
    width: 2.2,
    dash: "solid",
    noZone: true,
    facets: [
      { field: "uulzwar_name", get label() { return tr('Уулзвар'); } },
    ],
  },
];

/**
 * Төслийн хил — тайлан хилээс ГАДУУР бичигдсэн эсэхийг шалгахад л ашиглана.
 */
export const BOUNDARY = {
  plan: {
    // test_data [97] selbe_boundry — 2026-08-13 шилжив (khil1/khil2 мөн энд)
    url: `${SELBE_ET}/115`,
    get title() { return tr('Төлөвлөлтийн талбай'); },
  },
} as const;

/**
 * SB — «Selbe 2D map 0804» webmap-ийн 14 давхарга (`selbe_3D__0804_WFL1`).
 * Каталогийн LayerDef болгон үүсгэнэ; ГАЗРЫН ЗУРАГТ style нь webmap renderer-ээс
 * ирнэ (`plan2dStyleOf` → `buildLayers`), каталогийн swatch нь fallback `hue`.
 * Талбай/уртыг нийлбэрт тооцуулахаар `qty` тохируулав.
 */
/** sb давхарга бүрийн Enterprise хаяг (`selbe_ET/<№>`) — «2D map 0804»-ийн давхаргын дэд дугаар (`sub`) → БОДИТ давхарга. */
const SB_ENT: Record<number, number> = {
  0: 144, 1: 146, 2: 130, 3: 124, 4: 99, 5: 140, 7: 117, 8: 118, 10: 109, 11: 111, 13: 120, 14: 122, 15: 139, 16: 134,
};
const SB_ZONED = new Set([3, 4]);
const SB_LAYERS: LayerDef[] = PLAN2D_LAYERS.map((l) => ({
  id: l.id,
  n: l.sub,
  url: `${SELBE_ET}/${SB_ENT[l.sub]}`,
  get title() { return l.title; },
  topic: "plan" as const,
  geom: l.geom,
  hue: "#94a3b8",
  fill: 0.4,
  width: 1,
  ...(SB_ZONED.has(l.sub) ? {} : { noZone: true as const }),
  ...(l.geom === "area"
    ? { qty: { field: "SHAPE__Area", unit: 'м²' } }
    : l.geom === "line"
    ? { qty: { field: "SHAPE__Length", unit: 'м' } }
    : {}),
}));

/**
 * IoT мэдрэгчийн FeatureServer (`…/Hosted/IoT_sensor/FeatureServer`) — `sensors.ts` мөн эндээс.
 */
export const IOT_SVC = `${ENT_HOSTED}/IoT_sensor/FeatureServer`;

/**
 * IoT МЭДРЭГЧ — газрын зурагт харагдах цэгүүд.
 */
const IOT_LAYERS: LayerDef[] = [
  { key: "Waste_Sensor",  n: 15, get title() { return tr('Хогийн савны мэдрэгч'); },   hue: "#ea580c" },
  { key: "Water_Meter",   n: 13, get title() { return tr('Усны тоолуур'); },           hue: "#0891b2" },
  { key: "Light_Sensor",  n: 14, get title() { return tr('Гэрэлтүүлгийн мэдрэгч'); },  hue: "#f59e0b" },
  { key: "Temp_Humidity", n: 16, get title() { return tr('Агаарын темп, чийг'); },     hue: "#22c55e" },
  { key: "Soil_Meter",    n: 12, get title() { return tr('Хөрсний мэдрэгч'); },        hue: "#a855f7" },
].map((x) => ({
  id: `iot:${x.key.toLowerCase()}`,
  n: x.n,
  get title() { return x.title; },
  topic: "iot" as const,
  geom: "point" as const,
  hue: x.hue,
  marker: "circle" as const,
  size: 11,
  url: `${IOT_SVC}/${x.n}`,
  where: "device_id IS NULL",
  noZone: true as const,
  oid: "objectid",
  note: x.key,
}));

/**
 * Шинэчилсэн ЕТ-ийн бүсийн төрөл (`HET_Zone.zone`) → өнгө (2026-10-21). ЕТ-ийн палитр (`palette.ZONE_TYPES`)-ын утгаар:
 * орон сууц — шар (#ffb300), олон нийт/худалдаа — улаан бүлэг, нийгмийн дэд бүтэц — цэнхэр (#7fdeff),
 * инженерийн дэд бүтэц — #005199; ЕТ-д байхгүй төрөлд (гэр, үйлдвэр, оффис, зогсоол) ялгагдах өөр өнгө.
 */
const REDESIGN_ZONE_HUES: Record<string, string> = {
  'Residential area': '#ffb300',
  'Residential area 1': '#ffc94d',
  'Commercial / Residential': '#ff9f40',
  'GER': '#c08552',
  'Mixed use downtown': '#ff7f7f',
  'Commercial': '#e5484d',
  'General commercial': '#f06a6a',
  'Local commercial': '#f8a5a5',
  'Commercial / Business': '#c2410c',
  'Offices and shared work place': '#a855f7',
  'Education': '#7fdeff',
  'Medical Zone': '#38bdf8',
  'Engineering Infrastructure Zone': '#005199',
  'Light Industrial zone': '#94a3b8',
  'Industrial zone': '#475569',
  'Машины зогсоол': '#9ca3af',
};

/**
 * REDESIGN — шинэчлэгдсэн ерөнхий төлөвлөгөөний объектууд (2026-10-13, хэрэглэгчийн өгсөн
 * `Redesign` FeatureServer, UTM 48N). «Ерөнхий төлөвлөгөө» → «Detail»-ийн swipe-ийн БАРУУН
 * тал ба инженерийн шугамын давхцлын тооцоо (`lib/planOverlap.ts` §OVERLAP_CATS).
 *
 * Хэрэглэгчийн тогтоосон зураглал (нэр нь хэрэглэгчийн «ArcGIS layer-уудын жагсаалт»-аас;
 * Buildings_odoo · Power_easement · Zone · RIVER · DALAN · CANAL · Ger · Buildings_out —
 * ЗОРИУДААР ороогүй, 2026-10-13): Барилга = REBUILDING (1) · Автозам = 1006_GUDAMJ_MERGE (0) ·
 * Дугуйн зам = BIKEROAD (18) · Явган зам = PEDESTRIAN (11) · Ногоон байгууламж =
 * Urban_parkway (6) · River_front_park ×3 (7, 8, 9) · Park (12) · North_park (13).
 */
/** rd давхарга (`n` = хэрэглэгчийн «Redesign» дугаар, id-д хэвээр) → Enterprise `HET`-ийн давхаргын дугаар */
const RD_ENT: Record<number, number> = { 0: 196, 1: 207, 2: 214, 6: 213, 7: 212, 8: 211, 9: 210, 11: 205, 12: 204, 13: 203, 18: 197 };
const REDESIGN_LAYERS: LayerDef[] = ([
  { n: 1,  title: () => tr('Шинээр төлөвлөж буй барилга'),           hue: "#e11d48" },
  { n: 0,  title: () => tr('Автозам (шинэчлэгдсэн)'),           hue: "#64748b" },
  { n: 18, title: () => tr('Дугуйн зам (шинэчлэгдсэн)'),        hue: "#2563eb" },
  { n: 11, title: () => tr('Явган зам (шинэчлэгдсэн)'),         hue: "#d97706" },
  { n: 6,  title: () => tr('Хотын ногоон зурвас'),              hue: "#16a34a" },
  { n: 7,  title: () => tr('Голын эргийн ногоон байгууламж — сийрэг'),   hue: "#22c55e" },
  { n: 8,  title: () => tr('Голын эргийн ногоон байгууламж — нягт'),    hue: "#15803d" },
  { n: 9,  title: () => tr('Голын эргийн ногоон байгууламж — төв хэсэг'),      hue: "#4ade80" },
  { n: 12, title: () => tr('Цэцэрлэгт хүрээлэн'),               hue: "#65a30d" },
  { n: 13, title: () => tr('Хойд хэсгийн цэцэрлэгт хүрээлэн'),          hue: "#84cc16" },
  { n: 2,  title: () => tr('Бүс (шинэчлэгдсэн)'),                      hue: "#c7c5b4", fill: 0.4, zonePaint: true },
] as { n: number; title: () => string; hue: string; fill?: number; width?: number; svc?: { fill: number; outline: number }; zonePaint?: boolean }[]).map((x) => ({
  id: `rd:${x.n}`,
  n: x.n,
  get title() { return x.title(); },
  topic: "plan" as const,
  geom: "area" as const,
  hue: x.hue,
  fill: x.fill ?? 0.45,
  width: x.width ?? 0.8,
  url: `${HET}/${RD_ENT[x.n]}`,
  noZone: true as const,
  oid: "objectid",
  qty: { field: "SHAPE__Area", unit: 'м²' },
  ...(x.svc ? { serviceStyle: x.svc } : {}),
  ...(x.zonePaint ? {
    paint: {
      field: 'zone',
      values: REDESIGN_ZONE_HUES,
      force: true,
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
  } : {}),
}));

export const LAYERS: LayerDef[] = [
  ...SB_LAYERS,
  /* ─────────── Барилга байгууламж ─────────── */
  {
    id: "et:24",
    n: 24,
    /**
     * Шинэ давхаргад `ZONE_ID` бүрэн зассан (хуучинд 19 бичлэг «Бүсийн мэдээлэл
     * байхгүй», D-8 хуваагдаагүй, B-2 зөрсөн байв) ба 368 барилгатай (хуучин 363).
     * `Population`, `Urhiin_too`, `Parking`, `Huchin_chadal` дүн нь хуучинтай
     * таарахыг шалгасан (хүчин чадалд −63 санаатай засвар: эмнэлэг 194→125,
     * цэвэрлэх байгууламж 4→2, үйлчилгээ 9,438→9,446).
     */
    url: `${SELBE_ET}/99`,
    get title() { return tr('Барилга'); },
    topic: "plan",
    geom: "area",
    hue: "#2563eb",
    fill: 0.45,
    width: 1.4,
    qty: { field: "SHAPE__Area", unit: 'м²' },
    get note() { return tr('төлөв, зориулалт, өрх, хүн ам'); },
    facets: [
      { field: "barilga_ty", get label() { return tr('Барилгын төлөв'); } },
      { field: "зориулалт_m", get label() { return tr('Зориулалт'); } },
      { field: "zoriulalt", get label() { return tr('Дэлгэрэнгүй зориулалт'); } },
      { field: "torol", get label() { return tr('Бүсийн төрөл'); } },
      { field: "bar_comp", get label() { return tr('Барилгын компани'); } },
    ],
    paint: {
      field: "barilga_ty",
      values: Object.fromEntries(BUILT_STATUS.map((x) => [x.value, x.hue])),
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
  },

  /* ─────────── Барилгын хяналт (ХУУЧИН үйлчилгээ) ─────────── */
  {
    id: "mon:building",
    n: 112,
    url: `${BAGTS_AJLUUD}/0`,
    get title() { return tr('Барилгын блок (гүйцэтгэл)'); },
    topic: "monitor",
    geom: "area",
    hue: "#ea580c",
    fill: 0.45,
    width: 1.4,
    noZone: true,
    detail: "building",
    oid: "objectid",
    get note() { return tr('Гүйцэтгэл «Гүйцэтгэл бөглөх» хүснэгтээс амьд'); },
  },

  /* ─────────── ХАБЭА — Цамхагт кран (тусдаа үйлчилгээ) ─────────── */
  {
    id: "habea:buffer",
    n: 51,
    url: `${HAB_KRAN}/195`,
    get title() { return tr('Цамхагт краны аюултай бүс'); },
    topic: "monitor",
    geom: "area",
    hue: "#dc2626",
    fill: 0.1,
    width: 1,
    noZone: true,
    oid: "objectid",
    paint: {
      field: "tuluv",
      values: { "Одоо байгаа": "#dc2626", "Шинээр нэмэгдсэн": "#dc2626", "Буусан": "#9ca3af" },
      defaultHue: "#dc2626",
      force: true,
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
  },
  {
    id: "habea:crane",
    n: 50,
    url: `${HAB_KRAN}/194`,
    get title() { return tr('Цамхагт кран'); },
    topic: "monitor",
    geom: "point",
    hue: "#dc2626",
    marker: "circle",
    size: 7,
    noZone: true,
    oid: "objectid",
    paint: {
      field: "tuluv",
      values: { "Одоо байгаа": "#dc2626", "Шинээр нэмэгдсэн": "#dc2626", "Буусан": "#9ca3af" },
      defaultHue: "#dc2626",
      force: true,
      get emptyLabel() { return tr('Тодорхойгүй'); },
    },
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
    size: 7,
    noZone: true,
    oid: "objectid",
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  /* ─────────── ХАБЭА — Ажлын байрны үзлэг (Survey123 цэгүүд) ───────────
     2026-09-15, хэрэглэгчийн хүсэлт: «чарт дээр дарахад map дээр бас шүүгдэх». */
  {
    id: "habea:uzV11",
    n: 0,
    url: `${HABEA_SVC.uzlegV11}/FeatureServer/0`,
    get title() { return tr('Ажлын байрны үзлэг V1.1'); },
    topic: "monitor",
    geom: "point",
    hue: "#16a34a",
    marker: "square",
    size: 7,
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
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzZ",
    n: 0,
    url: `${HABEA_SVC.uzlegZahialagch}/FeatureServer/0`,
    get title() { return tr('Захиалагчийн ажлын байрны үзлэг'); },
    topic: "monitor",
    geom: "point",
    hue: "#0284c7",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzEnv",
    n: 0,
    url: `${HABEA_SVC.uzEnv}/FeatureServer/0`,
    get title() { return tr('Байгаль орчны үзлэг'); },
    topic: "monitor",
    geom: "point",
    hue: "#65a30d",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzCold",
    n: 0,
    url: `${HABEA_SVC.uzCold}/FeatureServer/0`,
    get title() { return tr('Барилгын талбайн хүйтний үеийн түр зогсолтын бэлтгэл ажлын үзлэг шалгалт'); },
    topic: "monitor",
    geom: "point",
    hue: "#0ea5e9",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzFire",
    n: 0,
    url: `${HABEA_SVC.uzFire}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Ажлын байрны галын аюулгүй байдлын үзлэг - Барилгын талбай'); },
    topic: "monitor",
    geom: "point",
    hue: "#dc2626",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzHazard",
    n: 0,
    url: `${HABEA_SVC.uzHazard}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Аюулыг илрүүлэх үзлэг - Барилгын талбай'); },
    topic: "monitor",
    geom: "point",
    hue: "#f97316",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzAutocrane",
    n: 0,
    url: `${HABEA_SVC.uzAutocrane}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Барилгын автокран шалгалт'); },
    topic: "monitor",
    geom: "point",
    hue: "#a855f7",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzPump",
    n: 0,
    url: `${HABEA_SVC.uzPump}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Барилгын автопомп шалгалт'); },
    topic: "monitor",
    geom: "point",
    hue: "#14b8a6",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzGondola",
    n: 0,
    url: `${HABEA_SVC.uzGondola}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Барилгын люльк буюу дүүжинт өргүүрийн шалгалт'); },
    topic: "monitor",
    geom: "point",
    hue: "#ca8a04",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },
  {
    id: "habea:uzTower",
    n: 0,
    url: `${HABEA_SVC.uzTower}/FeatureServer/0`,
    get title() { return tr('ХАБЭАБО-н Барилгын цамхагт кран шалгалт'); },
    topic: "monitor",
    geom: "point",
    hue: "#be123c",
    marker: "square",
    size: 7,
    noZone: true,
    oid: "objectid",
    auth: true,
    get note() { return tr('Survey123 мобайл аппаас'); },
  },

  /* ─────────── Газар чөлөөлөлт (полигоноор шүүх · тусдаа үйлчилгээ) ─────────── */
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
    qty: { field: "SHAPE__Area", unit: 'м²' },
    facets: [
      { field: GAZAR_BUILDING.fields.type, get label() { return tr('Төрөл'); } },
      { field: GAZAR_BUILDING.fields.material, get label() { return tr('Материал'); } },
    ],
  },

  /* ─────────── Инженер · дулаан ─────────── */
  {
    id: "et:11",
    n: 11,
    url: `${SELBE_ET}/132`,
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

  /* ─────────── Инженер · бэлтгэл ─────────── */
  {
    id: "et:15",
    n: 15,
    url: `${SELBE_ET}/142`,
    get title() { return tr('Инженерийн бэлтгэл арга хэмжээ'); },
    topic: "plan",
    geom: "line",
    hue: "#6366f1",
    dash: "long-dash",
    width: 2.0,
    qty: M,
    facets: [{ field: "layer", get label() { return tr('Арга хэмжээний төрөл'); } }],
    // Каталогт төрлөөрөө задарна — энэ давхарга нэг мөр биш, багц арга хэмжээ
    catalogFacet: true,
  },


  /* ─────────── Зам ─────────── */
  {
    id: "et:29",
    n: 29,
    url: `${SELBE_ET}/130`,
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
    url: `${SELBE_ET}/102`,
    get title() { return tr('Замын тэнхлэг'); },
    topic: "plan",
    geom: "line",
    hue: "#94a3b8",
    dash: "solid",
    width: 0.8,
    minScale: 25000,
    noZone: true,
    qty: { field: "urt_km", unit: 'км' },
  },
  /**
   * ЯВГАН ХҮНИЙ ЗАМ — `Code` талбараар ХОЁР ангилал (2026-09-15,
   * хэрэглэгчийн заавар): `1` = явган хүний зам (1,108 объект, 149,136 м²),
   * `2` = цементэн талбай (1,440 объект, 117,142 м²).
   */
  {
    id: "et:27",
    n: 27,
    url: `${SELBE_ET}/124`,
    get title() { return tr('Явган хүний зам'); },
    topic: "plan",
    geom: "area",
    hue: "#a8a29e",
    fill: 0.7,
    width: 0.6,
    qty: M2,
    facets: [{ field: "code", get label() { return tr('Төрөл'); } }],
    paint: {
      field: "code",
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
      force: true,
      get emptyLabel() { return tr('Ангилалгүй'); },
    },
  },
  {
    id: "dugui",
    n: 1,
    url: `${SELBE_ET}/139`,
    get title() { return tr('Дугуйн зам'); },
    topic: "plan",
    geom: "area",
    // Эх зургийн Дугуйн зам — саарал (каталогийн swatch)
    hue: "#828282",
    fill: 0.35,
    width: 0.8,
    zoneField: "refname_1",
    qty: { field: "SHAPE__Area", unit: 'м²' },
  },
  {
    id: "et:12",
    n: 12,
    url: `${SELBE_ET}/135`,
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
    url: `${SELBE_ET}/128`,
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
    url: `${SELBE_ET}/127`,
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
    url: `${SELBE_ET}/112`,
    get title() { return tr('LRT/BRT зогсоол'); },
    topic: "plan",
    geom: "point",
    hue: "#4f46e5",
    marker: "square",
    size: 11,
  },

  /* ─────────── Бүс ─────────── */
  {
    id: "zone",
    n: 0,
    url: `${SELBE_ET}/100`,
    oid: "objectid",
    get title() { return tr('Хот төлөвлөлтийн бүс'); },
    topic: "plan",
    geom: "area",
    // Хил нь ТОД улбар шар, НАРИЙН; дүүргэлт 70% тунгалаг (alpha 0.3).
    hue: "#f97316",
    fill: 0.3,
    width: 1,
    qty: { field: "gazar_m2", unit: 'м²' },
    zoneField: "refname_1",
    get note() { return tr('FAR, BCR, зогсоолын үзүүлэлттэй'); },
    facets: [
      { field: "angilal", get label() { return tr('Бүсийн ангилал'); }, canon: zoneType },
      { field: "zoriulalt", get label() { return tr('Зориулалт'); } },
    ],
    paint: {
      field: "angilal",
      values: ZONE_MAP_TYPES,
      chartValues: ZONE_CHART_TYPES,
      get emptyLabel() { return ZONE_TYPE_EMPTY(); },
    },
  },

  /* ─────────── Газар чөлөөлөлт (тусдаа үйлчилгээ) ─────────── */
  {
    id: "land:left",
    n: 11,
    url: PARCEL_LEFT.url,
    oid: PARCEL_LEFT.oid,
    get title() { return tr('Газар чөлөөлөлтийн нэгж талбар'); },
    topic: "plan",
    geom: "area",
    hue: "#e11d48",
    fill: 0.42,
    width: 0.8,
    noZone: true,
    qty: { field: PARCEL_LEFT.fields.area, unit: 'м²' },
    get note() { return tr('Төлөв ба чөлөөлөлтийн явц — амьд'); },
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
    oid: "objectid",
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
   */
  ...([
    ['heat', 'Дулааны эх үүсвэр', '#f97316'],
    ['water', 'Усан хангамжийн эх үүсвэр', '#0ea5e9'],
    ['power', 'Цахилгааны эх үүсвэр', '#a855f7'],
  ] as const).map(([key, type, hue]): LayerDef => ({
    id: `src:${key}`,
    n: 105,
    url: SOURCE_FS.url,
    oid: "objectid",
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
  {
    id: "nogoon",
    n: 0,
    url: `${SELBE_ET}/114`,
    get title() { return tr('Ногоон байгууламж'); },
    topic: "plan",
    geom: "area",
    hue: "#8ebd00",
    fill: 0.34,
    width: 0.8,
    zoneField: "refname_12",
    qty: { field: "SHAPE__Area", unit: 'м²' },
  },

  /* ─────────── Шинэ feature-ууд (эх webmap) ─────────── */
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
    url: `${SELBE_ET}/148`,
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
    url: `${SELBE_ET}/102`,
    get title() { return tr('Авто зам'); },
    topic: "plan",
    geom: "line",
    qty: { field: "SHAPE__Length", unit: 'м' },
    hue: "#ffffff",
    width: 1.56,
    dash: "solid",
    noZone: true,
  },
  /** Одоо байгаа зам — `Бусад_мэдээлэл_20260724`/194. Бусад бүлэгт. */
  {
    id: "roadOld",
    n: 194,
    url: `${SELBE_ET}/113`,
    get title() { return tr('Одоо байгаа зам'); },
    topic: "plan",
    geom: "line",
    hue: "#4d5863",
    width: 1.5,
    dash: "solid",
    noZone: true,
  },
  {
    id: "bm146",
    n: 146,
    url: `${SELBE_ET}/136`,
    get title() { return tr('Дамбадаржаа дулааны станц'); },
    topic: "plan",
    geom: "line",
    hue: "#b5fcd6",
    width: 1,
    dash: "solid",
    noZone: true,
  },
  /* ── Хил / төлөвлөлтийн талбай (ӨӨР үйлчилгээ) ── */
  {
    id: "khil1",
    n: 2,
    url: `${SELBE_ET}/115`,
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
  ...REDESIGN_LAYERS,
];

/* ══════════ TEST_DATA ШИЛЖИЛТ — 2026-08-13 ══════════ */

/**
 * Каталогийн давхарга → test_data-гийн давхаргын дугаар. Гурван geometry-matcher
 * агентын тулгалтаар (нэр · зориулалт · тоо · талбар) баталгаажсан зураглал.
 */
/* sb — «2D map 0804» webmap давхаргууд */
/* sb:5 — 2026-10-21 (аудит): TD/38-д `color` талбар алга (plan2d рендерер цагаан тасархай/бүтэн зураасыг түүгээр ялгадаг → 3465 шугам саарал) — үндсэн `selbe_3D__0804_WFL1/5` (→ selbe_ET/140, `color`-той, ижил 3465 мөр) хэвээр */
/* et — ерөнхий төлөвлөгөө */
/* pkg — дэд бүтцийн багцууд */
/* бусад тусдаа үйлчилгээнээс нэгдсэн */

/** `talbai_m2` атрибут нь [id]-д устсан — системийн Shape__Area-д буулгана */
const TD_QTY_SYS_AREA = new Set([
  "pkg:226", "pkg:228", "pkg:230", "pkg:232", "pkg:234", "pkg:235",
  "pkg:236", "pkg:242", "pkg:243",
]);
/** `urt_km` уртын талбар test_data-д устсан — системийн Shape__Length (м)-д буулгана */
const TD_QTY_SYS_LENGTH = new Set(["et:5", "et:12"]);
/** qty-ийн талбар нь ӨӨР нэрээр хадгалагдсан давхаргууд */
const TD_QTY_FIELD: Record<string, string> = { "pkg:237": "area_m2" };
/** Бүсийн талбар нь test_data-д устсан — нэгдсэн шүүлтээс гаргана */
const TD_FORCE_NOZONE = new Set(["dugui", "pkg:234", "et:12", "pkg:242"]);
/**
 * oid нь FID → OBJECTID болж өөрчлөгдсөн давхаргууд.
 */
const TD_OID: Record<string, string> = { zone: "objectid" };
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
  if (l.qty && TD_QTY_SYS_AREA.has(l.id)) l.qty = { field: "SHAPE__Area", unit: 'м²' };
  if (l.qty && TD_QTY_SYS_LENGTH.has(l.id)) l.qty = { field: "SHAPE__Length", unit: 'м' };
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
 * Орон сууцны БЛОКИЙН давхарга (багцын орон зайн хүрээ).
 */
export const BLOCK_LAYER = 'mon:building';


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
 */
export const ALWAYS_ON_IDS = ["khil1"] as const;

/**
 * ЗӨВХӨН «ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ»-Д ҮРГЭЛЖ АСААЛТТАЙ (2026-09-15).
 */
export const PLAN_ALWAYS_ON_IDS = ["et:27"] as const;

/**
 * Лавлагааны хилийн давхаргууд — ДАРЖ СОНГОГДОХГҮЙ (hitTest-д оролцохгүй).
 */
export const REFERENCE_IDS = ["khil1"] as const;

/** Ихэнх давхарга ЕТ-ээс; хяналтынх нь өөрийн бүтэн хаягтай */
/**
 * Давхаргын бодит хаяг.
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


/**
 * Давхаргын OID талбар.
 */
export const oidOf = (l: LayerDef) => l.oid ?? OID;

/** Бүсийн давхарга — нэгдсэн шүүлт, бүсийн самбар үүн дээр тогтоно */
export const ZONE_LAYER = LAYER_BY_ID["zone"];
/** Барилгын давхарга — бүсийн самбар «энд юу баригдаж байна» гэдгийг эндээс авна */
export const BUILT_LAYER = LAYER_BY_ID["et:24"];

/** Барилгын давхаргын онцлох талбарууд */
export const BUILT_FIELDS = {
  status: "barilga_ty",
  purpose: 'зориулалт_m',
  floorArea: 'барилгын_нийт_талбай_m2',
  usable: 'барилгажсан_талбай',
  households: "urhiin_too",
  population: "total_population",
  parking: "parking",
  floors: 'давхрын_тоо_max',
  block: 'блокы',
  company: "bar_comp",
} as const;

/**
 * Бүсийн давхаргын талбарууд — `busiin_medeelel_final`.
 */
export const ZONE_FIELDS = {
  id: "refname_1",
  type: "angilal",
  purpose: "zoriulalt",
  landM2: "gazar_m2",
  landHa: "gazar_ga",
  builtM2: "bar_m2",
  far: "far",
  /** FAR хувиар — түүхий `FAR` талбар зарим бүст таслагдсан тул үүнийг эрхэмлэнэ */
  farPct: "far_huvi",
  bcr: "bcr",
  households: "urh_too",
  /** Албан ёсны цэвэр талбай (га) — зам, нийтийн эзэмшил хассан */
  areaHa: "area",
  parkNorm: "norm_zogs",
  parkPlanOpen: "gadna_zog",
  parkPlanUnder: "dul_zog",
  coverage: "hurteemj",
  /** Газар чөлөөлөлт дуусаагүй бүс (1/0) */
  landPending: "ga_ch_dut",
} as const;

/* ── Бүсийн код: шинэ давхарга ↔ бусад давхарга ── */

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
 */
export const zoneWhere = (l: LayerDef, id: string): string | null => {
  if (l.noZone) return null;
  const ids = String(id).split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return null;
  const field = l.zoneField ?? ZONE_FIELD;
  const vals = [
    ...new Set(
      ids.flatMap((z) => (l.zoneField
        ? zoneRefValues(z)
        : [...zoneLegacyValues(z), ...zoneRefValues(z)])),
    ),
  ];
  const lit = (v: string) => {
    const q = `'${v.replace(/'/g, "''")}'`;
    return [...v].some((c) => c.charCodeAt(0) > 0x7f) ? `N${q}` : q;
  };
  return `${field} IN (${vals.map(lit).join(", ")})`;
};
