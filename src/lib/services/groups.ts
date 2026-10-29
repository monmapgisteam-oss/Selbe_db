import { PLAN2D_LAYERS } from '../plan2d';
import { t as tr } from '@/lib/i18nCore';
import { ZONE_FIELD } from './layerDef';
import { CATALOG_REPLACED_HIDDEN, INFRA_SYS_ORDER, INFRA_TABLE, PKG_BY_FAMILY, PKG_ROWS, pkgIds } from './pkg';
import type { InfraSystem } from './pkg';
import { LAYERS, LAYER_BY_ID, REFERENCE_IDS } from './layers';
import { IRGED_TOILET } from './scene';
import type { ViewKey } from './views';

/* ══════════════════════ Давхаргын багц ══════════════════════ */

/**
 * БАГЦ — каталогийн жагсаалтыг задалдаг нэгж.
 */
export type GroupKey =
  | "src"
  | "zone"
  | "build"
  | "prep"
  | "road"
  | "transit"
  | "green"
  | "orchin"
  | "land"
  | "infra"
  | "pkgSite"
  | "pkgSoc"
  | "iot"
  | "busad";

export const LAYER_GROUPS: {
  key: GroupKey;
  title: string;
  desc: string;
  icon: string;
  hue: string;
}[] = [
  {
    key: "src",
    get title() { return tr('Эх үүсвэр'); },
    get desc() { return tr('Дулаан, цахилгааны эх үүсвэрийн станцууд'); },
    icon: "droplet",
    hue: "#f97316",
  },
  {
    key: "zone",
    get title() { return tr('Бүс'); },
    get desc() { return tr('Хот төлөвлөлтийн 52 бүс'); },
    icon: "frame",
    hue: "#0d9488",
  },
  {
    key: "build",
    get title() { return tr('Барилга'); },
    get desc() { return tr('Төлөв, зориулалт, өрх, өртөг'); },
    icon: "building",
    hue: "#ffb700",
  },
  {
    key: "prep",
    get title() { return tr('Инженерийн бэлтгэл'); },
    get desc() { return tr('Бэлтгэл арга хэмжээ'); },
    icon: "network",
    hue: "#6366f1",
  },
  {
    key: "road",
    get title() { return tr('Зам'); },
    get desc() { return tr('Зам, тэнхлэг, явган, дугуй, гүүр'); },
    icon: "road",
    hue: "#475569",
  },
  {
    key: "transit",
    get title() { return tr('Тээвэр'); },
    get desc() { return tr('Автобус, LRT/BRT'); },
    icon: "bus",
    hue: "#7c3aed",
  },
  {
    key: "green",
    get title() { return tr('Ногоон орчин'); },
    get desc() { return tr('Ногоон байгууламж, цэцэрлэгт хүрээлэн'); },
    icon: "layers",
    hue: "#8ebd00",
  },
  {
    key: "orchin",
    get title() { return tr('Тохижилт'); },
    get desc() { return tr('Гол, спорт, хүүхдийн тоглоом, сүүдрэвч'); },
    icon: "layers",
    hue: "#0ea5e9",
  },
  {
    key: "land",
    get title() { return tr('Газар чөлөөлөлт'); },
    get desc() { return tr('Чөлөөлөгдөөгүй ба цэвэрлэсэн нэгж талбар'); },
    icon: "frame",
    hue: "#e11d48",
  },
  {
    key: "infra",
    get title() { return tr('Инженерийн дэд бүтэц'); },
    get desc() { return tr('Дулаан, ус, татуурга, цахилгаан, холбоо — Test0911S'); },
    icon: "network",
    hue: "#0891b2",
  },
  {
    key: "pkgSite",
    get title() { return tr('Гадна тохижилт, өндөржилт'); },
    get desc() { return tr('Өндөржилт, гадна тохижилт'); },
    icon: "frame",
    hue: "#a16207",
  },
  {
    key: "pkgSoc",
    get title() { return tr('Нийгмийн дэд бүтэц'); },
    get desc() { return tr('Сургууль, цэцэрлэг, олон нийтийн'); },
    icon: "building",
    hue: "#22c55e",
  },

  /**
   * IoT МЭДРЭГЧ — Mononet-ийн таван мэдрэгчийн байршил.
   */
  {
    key: "iot",
    get title() { return tr('IoT мэдрэгч'); },
    get desc() { return tr('Хогийн сав, ус, гэрэлтүүлэг, темп, хөрс'); },
    icon: "radio",
    hue: "#0891b2",
  },
  /** БУСАД МЭДЭЭЛЭЛ — каталогийн ХАМГИЙН ДООР. Зам гэх мэт нэмэлт давхарга. */
  {
    key: "busad",
    get title() { return tr('Бусад мэдээлэл'); },
    get desc() { return tr('Зам, цахилгаан, дулааны станц, эх үүсвэр'); },
    icon: "layers",
    hue: "#94a3b8",
  },
];

/**
 * Багц бүрийн давхаргууд — ДАРААЛАЛ нь каталогт харагдах дараалал.
 */
export const GROUP_LAYERS: Record<GroupKey, string[]> = {
  // Дамбадаржаа ДЦС · Сэлбэ дулаан станц · Шинэ их үүсвэр
  src: ["src:heat", "src:water", "src:power"],
  zone: ["zone"],
  build: ["sb:4"],
  prep: ["et:15"],
  // Автозам · Явган зам · Дугуйн зам · Замын цагаан зураас (webmap) + Гүүр (хэвээр)
  road: ["sb:2", "sb:3", "sb:15", "sb:5", "et:12"],
  transit: ["et:6", "et:2", "et:1"],
  // Ногоон байгууламж · Мод (webmap) + ЕТ ногоон (хэвээр, давхцаагүй)
  green: ["sb:1", "sb:0"],
  // Тохижилт — Гол · Спорт (полигон/шугам) · Хүүхдийн тоглоом · Сүүдрэвч (webmap)
  orchin: ["sb:16", "sb:8", "sb:7", "sb:11", "sb:10", "sb:14", "sb:13"],
  land: ["land:left"],

  infra: INFRA_SYS_ORDER.flatMap((sys) => PKG_ROWS.filter((r) => r.sys === sys).map((r) => r.id)),
  pkgSite: pkgIds("site").filter((id) => !CATALOG_REPLACED_HIDDEN.has(id)),
  pkgSoc: pkgIds("soc"),
  iot: [],
  busad: ["khil1", "road", "roadOld"],
};

/**
 * ЗӨВХӨН КАТАЛОГТ нэмэгдэх давхаргууд (бүлэг → id).
 */
const CATALOG_EXTRA: Partial<Record<GroupKey, string[]>> = {
  build: ["et:24"],
  land: ["gazar:parcel", "gazar:building"],
  road: [
    "et:29", "et:5", "et:27", "dugui", "dugui:line", "gerlen-dohio",
  ],
  green: ["nogoon"],
  orchin: ["tgl"],
  /**
   *   хасагдсан: `et:7 10 9 11 8 4 18 23 17 16 3 19` · `po:108 106 104 102 95`
   *
   * Тэдгээрийг `INFRA_TABLE` (Test0911S, 74 давхарга — 2026-10-09 аудит №6: урьд нь 73 гэж бичсэн) ОРЛУУЛСАН бөгөөд
   * шинэ давхаргууд нь `pkgIds("net")`-ээр ЭНЭ бүлэгт аль хэдийн орж
   * байгаа. Хоёуланг үлдээвэл каталогид ИЖИЛ физик сүлжээ хоёр өөр эх
   * сурвалжаас хоёр удаа гарч, зурагт трасс нь давхарлана.
   */
  // Усан сан (6 ш) — test_data-д л байдаг, аль нэг багцын ажил БИШ.
  busad: ["usan-san"],
  iot: [
    "iot:waste_sensor", "iot:water_meter", "iot:light_sensor",
    "iot:temp_humidity", "iot:soil_meter",
  ],
};

/**
 * Ерөнхий мэдээллийн БҮХ давхарга — багцын дарааллаар. НЭГ URL НЭГ Л УДАА.
 *
 * ЯГ ЮУ ДАВХАРДАЖ БАЙСАН БЭ: `TD_LAYER` шилжүүлэлтийн дараа `et:124…127`
 * (`GROUP_LAYERS.power`) ба `pkg:124…127` (`pkgIds("pow")` → `GROUP_LAYERS.pkgPow`)
 * нь ЯГ НЭГ дөрвөн test_data давхарга дээр буудаг болсон
 * (`et:124`/`pkg:124`→`data`/59 · 125→58 · 126→57 · 127→56). Хоёулаа
 * `LAYER_GROUPS`-т ордог тул хавтгайруулахад 88 id ↔ ердөө 84 ялгаатай URL
 * гарч, «Ерөнхий үзүүлэлт → Нийт» дээр цахилгааны 4 шугам ДАХИН тоологдож
 * 392 объект (39+51+133+169) ба 25,625.7 м ИЛҮҮ гарч байв. Хоёр тал нь
 * `PKG_ZONED`-д багтдаг тул бүс сонгосон ч давхардал арилдаггүй.
 */
export const PLAN_LAYER_IDS: string[] = (() => {
  const seen = new Set<string>();
  return LAYER_GROUPS.flatMap((g) => GROUP_LAYERS[g.key]).filter((id) => {
    const L = LAYER_BY_ID[id];
    const u = L?.url;
    if (!u) return true;
    const k = `${u}|${L.where ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();

/**
 * Газрын зургийн АНХНЫ асаалттай давхаргууд — бүх зурагт нэг ижил эхлэл
 * (хэрэглэгчийн сонголт, 2026-07-31): барилга, замын давхаргууд, ногоон
 * байгууламж, мод. Бүс зэрэг бусад давхаргыг каталогоос гараар асаана.
 */
export const INITIAL_MAP_LAYERS: string[] = [
  "et:24", // Барилга
  "et:29", // Зам (талбай)
  "et:27", // Явган хүний зам
  "dugui", // Дугуйн зам
  "et:12", // Гүүрэн байгууламж
  "nogoon", // Ногоон байгууламж
  "sb:0", // Мод (цэг — өмнөх `tree` полигоныг орлов, 2026-08-24)
  "tgl", // Хүүхдийн тоглоом (эгц дээрээс харсан дүрс)
];

/**
 * ИНЖЕНЕРИЙН СИСТЕМҮҮД — «Инженерийн дэд бүтэц» хуудасны зүүн багана.
 */
export const INFRA_SYSTEMS: {
  key: InfraSystem;
  title: string;
  hue: string;
  ids: string[];
}[] = [
  { key: 'heat',  get title() { return tr('Дулаан хангамж'); },                hue: '#dc2626', ids: [] },
  { key: 'water', get title() { return tr('Цэвэр ус хангамж'); },              hue: '#0891b2', ids: [] },
  { key: 'sewer', get title() { return tr('Ариутгах татуурга, хөрсний ус'); }, hue: '#7c3aed', ids: [] },
  { key: 'power', get title() { return tr('Цахилгаан хангамж'); },             hue: '#f59e0b', ids: [] },
  { key: 'comm',  get title() { return tr('Холбоо'); },                        hue: '#0ea5e9', ids: [] },
];
for (const [n, , , , , sys] of INFRA_TABLE) {
  INFRA_SYSTEMS.find((x) => x.key === sys)?.ids.push(`infra:${n}`);
}

/**
 * «Инженерийн дэд бүтэц» харагдацын давхаргууд — системийн дарааллаар.
 */
export const DED_BUTETS_LAYER_IDS: string[] = INFRA_SYSTEMS.flatMap((x) => x.ids);

/**
 * ЗУРГИЙН СУУРЬ ДАВХАРГУУД — «Ерөнхий төлөвлөгөө 2D map»-ийн 14 давхарга БҮХ
 * 2D зурагт ҮРГЭЛЖ харагдана (хэрэглэгчийн хүсэлт, 2026-08-10: давхаргын цонх
 * ба зургийн суурь харагдацыг САЛГАВ).
 */
export const BASE_MAP_IDS: readonly string[] = [
  ...PLAN2D_LAYERS.map((l) => l.id),
  // Хүүхдийн тоглоом — суурьтай хамт харагдана (каталог/үзүүлэлтгүй)
  "tgl",
  "bm146", // Дамбадаржаа дулааны станц
];

/**
 * БАРИЛГЫН ХЯНАЛТЫН багц — каталогт тусдаа бүлэг болж гарна.
 */
export const MONITOR_GROUP = {
  key: "monitor" as const,
  get title() { return tr('Барилгын хяналт'); },
  get desc() { return tr('Блокийн гүйцэтгэл'); },
  icon: "target",
  hue: "#ea580c",
};
export const MONITOR_LAYER_IDS: string[] = ["mon:building"];

/** ХАБЭА-ийн давхаргууд — каталогид тусдаа бүлэг (харагдацын үндсэн давхаргууд) */
export const HABEA_GROUP = {
  key: "habea" as const,
  get title() { return tr('ХАБЭА'); },
  get desc() { return tr('Осол зөрчил · цамхагт кран · аюулгүйн бүс'); },
  icon: "shield",
  hue: "#dc2626",
};
export const HABEA_LAYER_IDS: string[] = ["habea:osol", "habea:crane", "habea:buffer"];

/**
 * ҮЗЛЭГИЙН ДАВХАРГА — фокусын маягт бүрт нэг (2026-09-15).
 */
export const HABEA_UZLEG_LAYER_ID = {
  v11: "habea:uzV11", guitsetgegch: "habea:uzG", zahialagch: "habea:uzZ",
  env: "habea:uzEnv", cold: "habea:uzCold", fire: "habea:uzFire", hazard: "habea:uzHazard",
  autocrane: "habea:uzAutocrane", pump: "habea:uzPump", gondola: "habea:uzGondola", tower: "habea:uzTower",
} as const;

/** Каталогт харуулах бүлгүүд — харагдацаас хамаарна */
/**
 * Бүлэг бүрийн КАТАЛОГИЙН давхаргууд — нийлбэрийн жагсаалт (`GROUP_LAYERS`) дээр
 * `CATALOG_EXTRA` нэмэгдэнэ. Давхардлыг арилгана.
 */
/**
 * КАТАЛОГООС НУУГДАХ ДАВХАРДСАН id-ууд — НЭГ өгөгдөл, НЭГ мөр.
 *
 * АЛЬ НЬ ҮЛДЭХ ВЭ (хосоор):
 *  · `sb:4`↔`et:24` · `sb:2`↔`et:29` · `sb:3`↔`et:27` · `sb:15`↔`dugui` —
 *    `et:*`/`dugui` нь ҮЛДЭНЭ: тэдгээр нь
 *    `INITIAL_MAP_LAYERS`-ээр эхнээсээ асаалттай, `PLAN2D_ALIAS`-аар `sb:*`-ийн
 *    ЯГ ТЭР загварыг өмсдөг (зураг дээр ялгаагүй), `ersdel.ts`/`analysis`
 *    тэднийг нэрээр нь уншдаг. `sb:*` нь `BASE_MAP_IDS`-ийн суурь давхарга тул
 *    каталогийн чагтгүйгээр ч (сонголт хоосон үед) зурагдана.
 *  · `sb:1`↔`nogoon` — 2026-09-21: ОДОО ИЖИЛ URL БИШ, харин НЭГ ӨГӨГДЛИЙН
 *    ХОЁР ХЭЛБЭР. Амьд шалгалт: `sb:1` = `data`/35 (`Ногоон_байгууламж_0813`,
 *    807 хэсгийг НЭГТГЭСЭН ГАНЦ полигон, 1 мөр, 587,555 м², бүсийн талбаргүй);
 *    `nogoon` = `data`/118 (`nogoon_baiguulamj_analysis`, 807 объект,
 *    545,102 м², `RefName_12`-оор 55 бүсэд тайрагдсан). Каталогт `nogoon`
 *    ҮЛДЭНЭ (объект тус бүр, бүсээр шүүгддэг), `sb:1` нуугдана — хоёулаа
 *    гарвал «Ногоон байгууламж» нэг нэрээр 1 ш ба 807 ш гэсэн хоёр мөр болно.
 *    ХААНА АЛЬ НЬ: `GROUP_LAYERS.green` → `PLAN_LAYER_IDS` (төслийн НИЙЛБЭР,
 *    `ViewPanel`) нь `sb:1`-ээс (бүсээс ГАДУУРХ ногоон орсон бүтэн дүн);
 *    каталогийн мөр, `Dashboard`-ын `CATALOG_IDS`, `INITIAL_MAP_LAYERS`,
 *    анализ (`land.ts`, `ersdel.ts`) нь `nogoon`-оос. Нэг дэлгэц дээр хоёр
 *    эхийн тоог зэрэгцүүлж БҮҮ харуул — 4.2 га зөрнө.
 *  · `et:5`↔`road` — `road` («Авто зам») ҮЛДЭНЭ. Амьд шалгалт: `data`/104 нь
 *    `ET_road_simulation` (205 хэрчим) — `roadOld`-ын `data`/98
 *    (`monmap_road_simulation`, 113) -тэй ХОС. `et:5` («Замын тэнхлэг», ЕТ-д
 *    24,251 хэрчим, `urt_km`) нь нэгтгэсэн `data`-д ЭКВИВАЛЕНТГҮЙ бөгөөд
 *    `TD_LAYER`-т `road`-ын давхаргыг зээлж авсан байв — өөр өгөгдлийг буруу
 *    нэрээр харуулж байсан тул каталогоос гарна.
 *  · `et:124…127`↔`pkg:124…127` — `et:*` ҮЛДЭНЭ: тэд «Цахилгааны шугам»
 *    бүлгийн ЦОРЫН ГАНЦ гишүүд (`GROUP_LAYERS.power`) тул хасвал бүлэг
 *    бүхэлдээ каталогоос алга болно. `pkg:124…127` нь `pkgPow`-ийн 12 гишүүний
 *    4 нь — хасахад бүлэг 8 мөртэй үлдэнэ, харин `PKG_TABLE`/`PKG_BY_BAGTS`/
 *    `PKG_BY_FAMILY` (багцын харагдац, дашбоардын багцын дүн) `LAYERS`-ээс
 *    ШУУД уншдаг тул ОГТ хөндөгдөхгүй.
 *  · `khil1`↔`khil2` ЭНД БАЙХГҮЙ — тэр давхардлыг `TD_LAYER`-ийн `khil2: 97`
 *    бичлэгийг хассанаар ҮНДСЭЭР нь зассан (хоёр өөр хил, өөр талбай).
 */
const CATALOG_DUP_HIDDEN: ReadonlySet<string> = new Set([
  "sb:4", "sb:2", "sb:3", "sb:15",
  "sb:1",
  "source:eh",
  "et:5",
]);

const catalogIdsOf = (key: GroupKey): string[] =>
  [...new Set([...GROUP_LAYERS[key], ...(CATALOG_EXTRA[key] ?? [])])]
    .filter((id) => LAYER_BY_ID[id] && !CATALOG_DUP_HIDDEN.has(id) && !CATALOG_REPLACED_HIDDEN.has(id));

/**
 * Яагаад автомат вэ: `LAYERS`-т шинэ давхарга нэмэхэд `GROUP_LAYERS`-т бичихээ
 * мартвал тэр давхарга ЧИМЭЭГҮЙ алга болдог байсан — яг ингэж 32 давхарга
 * хаанаас ч нээгдэхгүй хуримтлагдсан юм. Одоо хамгийн муудаа «Бусад»-д гарна.
 */
const GROUPED_IDS = new Set(LAYER_GROUPS.flatMap((g) => catalogIdsOf(g.key)));
const UNGROUPED_IDS = LAYERS.filter((l) => !l.auth).map((l) => l.id).filter(
  (id) => !GROUPED_IDS.has(id)
    && !CATALOG_DUP_HIDDEN.has(id)
    && !CATALOG_REPLACED_HIDDEN.has(id)
    && !(REFERENCE_IDS as readonly string[]).includes(id),
);

/** Порталын бүлгүүд — «Бусад»-д бүлэглэгдээгүй бүх давхарга нэмэгдсэн байдлаар */
const PORTAL_GROUPS = () =>
  LAYER_GROUPS.map((g) => ({
    ...g,
    ids: g.key === "busad"
      ? [...catalogIdsOf(g.key), ...UNGROUPED_IDS]
      : catalogIdsOf(g.key),
  })).filter((g) => g.ids.length > 0);

/**
 * «ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ»-ийн багц — каталогт тусдаа бүлэг.
 */
export const IRGED_GROUP = {
  key: "irged" as const,
  get title() { return tr('Иргэдэд хүрэх үр өгөөж'); },
  get desc() { return tr('Нүхэн жорлон · нийгмийн дэд бүтэц'); },
  icon: "users",
  hue: "#f97316",
};
export const IRGED_LAYER_IDS: string[] = [
  IRGED_TOILET.id,
  ...(PKG_BY_FAMILY.soc ?? []),
].filter((id) => LAYER_BY_ID[id]);

/**
 * ТӨЛӨВЛӨСӨН НИЙГМИЙН БАРИЛГЫН ХҮЧИН ЧАДАЛ — `PKG_BY_FAMILY.soc` давхаргуудын
 * атрибут (`data`/[0,1,2,3,4,9,10,11,12,22]).
 */
export const IRGED_SOC = {
  fields: {
    capacity: "huchin_chadal",
    floorArea: 'барилгын_нийт_талбай_m2',
    purpose: "zoriulalt",
    parking: "parking",
    zone: ZONE_FIELD,
  },
  /**
   * ДАВХРЫН ТАЛБАР — ДАВХАРГА БҮРД ИЖИЛ БИШ.
   */
  floorFields: ['давхрын_тоо_max', 'давхрын_тоо_min'] as const,
  /**
   * Зориулалтаар БҮЛЭГЛЭХ — `zoriulalt` талбарын АМЬД утга (2026-09-06-нд
   * хэмжсэн: «Сургуулийн барилга» ×3 · «Цэцэрлэгийн барилга» ×5 ·
   * «Хүүхдийн урлан бүтээх төв» ×2 · «Төрийн үйлчилгээ» ×1).
   */
  groupField: "zoriulalt",
} as const;

/**
 * Сэдвийн бүлгийг жагсаалтын ТЭРГҮҮНД гаргана.
 */
const hoist = (key: GroupKey) => {
  const all = PORTAL_GROUPS();
  const own = all.find((g) => g.key === key);
  return own ? [own, ...all.filter((g) => g.key !== key)] : all;
};

export type CatalogView =
  | "plan" | "monitor" | "habea" | "gazar" | "iot" | "irged" | "ersdel"
  | "dedButets";

/**
 * ШҮҮЛТИЙН ХАМРАХ ХҮРЭЭ — идэвхтэй шүүлт аль хэсэгт харьяалагдахыг заана
 * (харагдац солиход цэвэрлэхэд хэрэглэнэ).
 */
export type FilterScope = ViewKey | CatalogView;

/**
 * КАТАЛОГИЙН БҮЛГҮҮД — харагдацаас хамаарна.
 */
export const catalogGroups = (view: CatalogView) => {
  switch (view) {
    case "monitor":
      return [{ ...MONITOR_GROUP, ids: MONITOR_LAYER_IDS }, ...PORTAL_GROUPS()];
    case "habea":
      return [
        { ...HABEA_GROUP, ids: HABEA_LAYER_IDS },
        { ...MONITOR_GROUP, ids: MONITOR_LAYER_IDS },
        ...PORTAL_GROUPS(),
      ];
    // Кадастрын нэгж ба барилгын үнэлгээ нь `land` бүлэгт бий — дээш нь гаргана
    case "gazar":
      return hoist("land");
    // Таван мэдрэгч `iot` бүлэгт бий — дээш нь гаргана
    case "iot":
      return hoist("iot");
    case "irged":
      return [{ ...IRGED_GROUP, ids: IRGED_LAYER_IDS }, ...PORTAL_GROUPS()];
    /* Test0911S-ийн бүх давхарга `infra` бүлэгт бий — дээш нь гаргана */
    case "dedButets":
      return hoist("infra");
    default:
      return PORTAL_GROUPS();
  }
};

/**
 * КАТАЛОГТ ГАРАХ БҮХ давхарга — тоо, хэмжээг татах жагсаалт (`usePlanTotals`).
 */
export const CATALOG_LAYER_IDS: string[] = [
  ...new Set([
    ...PLAN_LAYER_IDS.filter((id) => LAYER_BY_ID[id]),
    ...PKG_BY_FAMILY.pow.filter((id) => LAYER_BY_ID[id]),
    ...HABEA_LAYER_IDS,
    ...MONITOR_LAYER_IDS,
    ...IRGED_LAYER_IDS,
    ...PORTAL_GROUPS().flatMap((g) => g.ids),
  ]),
].filter((id) => !LAYER_BY_ID[id]?.auth);

/** Давхарга аль багцад хамаарах вэ (хяналтынх багцгүй) */
export const groupOf = (id: string): GroupKey | null =>
  LAYER_GROUPS.find((g) => GROUP_LAYERS[g.key].includes(id))?.key ?? null;
