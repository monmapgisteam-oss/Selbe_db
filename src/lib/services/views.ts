import { t as tr } from '@/lib/i18nCore';
import { DED_BUTETS_LAYER_IDS, PLAN_LAYER_IDS } from './groups';

/* ══════════════════════ Харагдац ══════════════════════ */

/**
 * ХАРАГДАЦ — ХОЁРХОН: ерөнхий мэдээлэл vs барилгын хяналт.
 *
 * `layers` — каталогт багтах бүх давхарга.
 * `initial` — харагдац сонгоход зурагт АСААЛТТАЙ гарах давхаргууд.
 */
export type ViewKey =
  | "gdash"
  | "dashboard"
  | "plan"
  | "pkgFin"
  | "pkgProg"
  | "gazar"
  | "analysis"
  | "huvaari"
  | "huvaariBatlah"
  | "ajilBatlah"
  | "tailan"
  | "tuh"
  | "bagtsHamaaral"
  | "zuragTosol"
  | "tuvshin6"
  | "finance"
  | "habea"
  | "irged"
  | "iot"
  | "ersdel"
  | "dedButets"
  | "hesegET"
  | "zovshoorol"
  | "guitsetgel"
  | "ma"
  | "schem"
  | "sysdoc";

export const VIEWS: {
  key: ViewKey;
  title: string;
  desc: string;
  icon: string;
  hue: string;
  layers: string[];
  initial: string[];
  standalone?: true;
}[] = [
  /**
   * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ТОЙРСОН үзүүлэлтийн самбар.
   *
   * Апп нээгдэхэд эхэлж харагдах ерөнхий тойм: төв дунд газрын зураг, эргэн
   * тойронд KPI, дугуй диаграм, багана график, индикатор. Бүх тоо ArcGIS-ээс
   * ажиллах үедээ шууд татагдана.
   */
  /**
   * ЕРӨНХИЙ ДАШБОАРД — ТӨСЛИЙН НЭГ ХУУДАСТ БАГТСАН ТОЙМ (2026-09-04).
   */
  {
    key: "gdash",
    get title() { return tr('Ерөнхий дашбоард'); },
    get desc() { return tr('Төсөл одоо ямар байна вэ — санхүү, газар чөлөөлөлт, төлөвлөгөө, аюулгүй ажиллагааг нэг дэлгэцэд харуулсан товч тойм'); },
    icon: "grid",
    hue: "#0ea5e9",
    layers: ["zone", "et:24"],
    initial: ["zone", "et:24"],
    standalone: true,
  },
  {
    key: "dashboard",
    get title() { return tr('Төслийн дэлгэрэнгүй мэдээлэл'); },
    get desc() { return tr('Бүс, барилга, дэд бүтцийн үзүүлэлтийг газрын зураг дээр задлан судлах дэлгэрэнгүй хэсэг (товч тойм нь «Ерөнхий дашбоард»-д)'); },
    icon: "info",
    hue: "#0284c7",
    layers: ["zone", "et:24"],
    initial: ["zone", "et:24"],
    standalone: true,
  },
  {
    key: "plan",
    get title() { return tr('Ерөнхий төлөвлөгөө'); },
    get desc() { return tr('Батлагдсан ерөнхий төлөвлөгөөний зураг — бүс, барилга, инженерийн шугам, зам, ногоон байгууламж'); },
    icon: "layers",
    hue: "#0d9488",
    layers: PLAN_LAYER_IDS,
    initial: [],
  },
  /**
   * ХЭСЭГЧИЛСЭН ЕТ (2026-10-13, хэрэглэгчийн заавар: «шинэ section болгож 14 Хэсэгчилсэн ЕТ»).
   * Урьд «Ерөнхий төлөвлөгөө» дотор «Detail» горим байсныг ТУСДАА харагдац болгов. Гурван хэсэг:
   *   01 Ерөнхий төлөвлөгөөний өөрчлөлт · 02 Одоо байгаа дэд бүтэцтэй давхцал · 03 Нэмэлт хэрэгцээ.
   */
  {
    key: "hesegET",
    get title() { return tr('Хэсэгчилсэн ЕТ'); },
    get desc() { return tr('Ерөнхий төлөвлөгөөний өөрчлөлт, одоо байгаа дэд бүтэцтэй давхцал, нэмэлт хэрэгцээ'); },
    icon: "sections",
    hue: "#0d9488",
    layers: [],
    initial: [],
  },
  /**
   * БАГЦЫН ХОЁР ХАРАГДАЦ — САНХҮҮ ба ГҮЙЦЭТГЭЛ.
   *
   *   · `pkgFin`  — гэрээ, CASHFLOW, олгосон санхүүжилт, хөрөнгө оруулалт
   *   · `pkgProg` — биет явц, блокийн төлөв, давхцал, барилгын хяналт
   */
  {
    key: "pkgFin",
    get title() { return tr('Багцын санхүү'); },
    get desc() { return tr('Багц бүрийн гэрээний дүн, сар бүрийн санхүүжилтийн төлөвлөгөө ба олгосон мөнгө'); },
    icon: "calc",
    hue: "#c2410c",
    layers: ["mon:building"],
    initial: ["mon:building"],
    standalone: true,
  },
  {
    key: "pkgProg",
    get title() { return tr('Багцын гүйцэтгэл'); },
    get desc() { return tr('Багц бүрийн барилгын ажил хэдэн хувь явсныг блокоор, газрын зураг дээр ХАРАХ (бөглөх нь «Гүйцэтгэл»-д)'); },
    icon: "building",
    hue: "#c2410c",
    layers: ["mon:building"],
    initial: ["mon:building"],
    standalone: true,
  },
  /**
   * ГАЗАР ЧӨЛӨӨЛӨЛТ — газрын зураг дээр полигон зурж, тэр талбай доторх барилга
   * (`selbe_B`) ба кадастрын нэгж (`Selbe_parcel`)-ийг орон зайгаар шүүнэ.
   * Гадна талынх нь бүдгэрч, дотор орсны нэгдсэн үзүүлэлт дашбоардад гарна.
   */
  {
    key: "gazar",
    get title() { return tr('Газар чөлөөлөлт'); },
    get desc() { return tr('Газар чөлөөлөлтийн явц — зураг дээр талбай зурж доторх барилга, нэгж талбарыг тоолно'); },
    icon: "frame",
    hue: "#16a34a",
    layers: ["land:left", "gazar:building", "gazar:parcel"],
    initial: ["land:left", "gazar:building", "gazar:parcel"],
    standalone: true,
  },
  /**
   * АНАЛИЗ — Suitability Modeler.
   */
  {
    key: "analysis",
    get title() { return tr('Тохиромжтой байдлын үнэлгээ'); },
    get desc() { return tr('Газар хэр тохиромжтойг барилгын норм, дүрэм ба эдийн засгийн үр ашгаар үнэлэх шинжилгээ'); },
    icon: "target",
    hue: "#7c3aed",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ — ӨМНӨ / ДАРАА харьцуулалт: зүүнд одоогийн байдал
   * (нүхэн жорлон, байгаа нийгмийн байгууламж), баруунд төлөвлөсөн (шинэ
   * байгууламж, амьдралын чанарын өөрчлөлт), дунд нь газрын зураг.
   */
  {
    key: "irged",
    get title() { return tr('Иргэдэд хүрэх үр өгөөж'); },
    get desc() { return tr('Төслийн өмнө ба дараа — сургууль, эмнэлэг зэрэг нийгмийн байгууламж, ариун цэврийн нөхцөлийн өөрчлөлт'); },
    icon: "users",
    hue: "#16a34a",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ХУВААРЬ — ажлын эхлэх/дуусах огноог ТӨЛӨВЛӨХ.
   */
  {
    key: "huvaari",
    get title() { return tr('Хуваарь'); },
    get desc() { return tr('Ажил бүр хэзээ эхэлж дуусахыг блокоор төлөвлөж, батлуулахаар илгээнэ'); },
    icon: "calendar",
    hue: "#0891b2",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ХУВААРЬ БАТЛАХ — батлахыг хүлээж буй саналуудын ДАРААЛАЛ (2026-09-16).
   */
  {
    key: "huvaariBatlah",
    get title() { return tr('Хуваарь батлах'); },
    get desc() { return tr('Гүйцэтгэгчийн илгээсэн хуваарийн саналыг хянаж батлах эсвэл буцаах'); },
    icon: "calendarCheck",
    /* «Хуваарь»-тай ижил өнгө — нэг сэдвийн хоёр хуудас */
    hue: "#0891b2",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * НЭМЭЛТ АЖИЛ БАТЛАХ — «Гүйцэтгэл бөглөх»-өөс ирсэн шинэ ажлын мөрүүд.
   */
  {
    key: "ajilBatlah",
    get title() { return tr('Нэмэлт ажил батлах'); },
    get desc() { return tr('Гэрээнд байгаагүй, шинээр нэмэгдэх ажлын мөрийг хянаж батлах эсвэл буцаах'); },
    icon: "listCheck",
    /* «Гүйцэтгэл»-тэй ижил өнгө — нэг сэдвийн хоёр хуудас */
    hue: "#7c3aed",
    layers: [],
    initial: [],
    standalone: true,
  },
  /** ТАЙЛАН — тайлангийн хуудас. Порталын зураг/самбаргүй, өөрийн бүтэцтэй. */
  {
    key: "tailan",
    get title() { return tr('Тайлан'); },
    get desc() { return tr('Төслийн явцын албан тайлан — амьд тоогоор бүрдэж, хэвлэх эсвэл PDF-ээр татна'); },
    icon: "report",
    hue: "#7c3aed",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ТУХ — Төслийн удирдлагын хэсгийн БАГЦЫН ХЯНАЛТЫН САМБАР (2026-09-30).
   */
  {
    key: "tuh",
    get title() { return tr('ТУХ'); },
    get desc() { return tr('Багцын хяналтын самбар — улсын комисс, IPC, хуваарь, гүйцэтгэл нэг дор'); },
    icon: "briefcase",
    hue: "#0f766e",
    layers: ["mon:building"],
    initial: ["mon:building"],
    standalone: true,
  },
  /**
   * БАГЦЫН ХАМААРАЛ (2026-10-04) — багц хоорондын хамаарал. Багц доторх ажлын уялдаанд (`deps.ts`) хамаагүй.
   */
  {
    key: "bagtsHamaaral",
    get title() { return tr('Багцын хамаарал'); },
    get desc() { return tr('Багц хоорондын ажлын хамаарал — нэг багцын ажил өөр багцуудын аль ажлаас хамаардгийг'); },
    icon: "link",
    hue: "#0f766e",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ (2026-10-26) — cashflow-ийн ТЭЗҮ / Ажлын зураг төсөл үе шатын навч мөрийн огноо, явц.
   * Засах нь `zuragEdit` эрхээр; эрхгүй хүн харна.
   */
  {
    key: "zuragTosol",
    get title() { return tr('ТЭЗҮ · Ажлын зураг төсөл'); },
    get desc() { return tr('ТЭЗҮ ба ажлын зураг төслийн навч мөрийн хугацаа, явцыг шинэчлэх, багцад дэд шат нэмэх'); },
    icon: "file",
    hue: "#0f766e",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * 6 ТҮВШНИЙ ХУВААРЬ (2026-10-26) — docs/Level planning_261021-ийн L1–L6; `projectPlan` + Хуваарь + бөглөх хуудас.
   */
  {
    key: "tuvshin6",
    get title() { return tr('6 түвшний хуваарь'); },
    get desc() { return tr('Төслийн мастер хуваариас өдрийн ажил хүртэл 6 түвшинд'); },
    icon: "calendar",
    hue: "#0f766e",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * САНХҮҮЖИЛТ — гэрээний бүртгэл (`CASHFLOW_NEW`) + гүйцэтгэлийн
   * олгосон санхүүжилтийн лог (`HO_IPC`). Геометргүй хоёр хүснэгт тул порталын
   * зураг/каталогийг ашиглахгүй, өөрийн бүтэцтэй → `standalone`.
   */
  {
    key: "finance",
    get title() { return tr('Санхүүжилт'); },
    get desc() { return tr('Гэрээ бүрийн санхүүжилтийн хуваарь, гүйцэтгэлээр олгох төлбөрийн актыг бүртгэх, хянах'); },
    icon: "coins",
    hue: "#0891b2",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * ХАБЭА — Хөдөлмөрийн аюулгүй байдал. Зургийг ТОЙРСОН чөлөөт бүтэц («Барилгын
   * хяналт» шиг): дээр KPI, зүүн осол зөрчил, төвд краны зураг, баруун кран/техник,
   * доор осол зөрчлийн график. 3 Survey123/FeatureServer эх сурвалж. `standalone`.
   */
  {
    key: "habea",
    get title() { return tr('ХАБЭА'); },
    get desc() { return tr('Хөдөлмөрийн аюулгүй байдал — ажилтан, техник, осол зөрчил, цамхагт краны аюулын бүс'); },
    icon: "helmet",
    hue: "#dc2626",
    layers: ["habea:osol", "habea:crane", "habea:buffer"],
    initial: ["habea:osol", "habea:crane", "habea:buffer"],
    standalone: true,
  },
  {
    key: "iot",
    get title() { return tr('IoT хяналт'); },
    get desc() { return tr('Хог, ус, гэрэл, агаарын чийг, хөрс хэмжих мэдрэгчийн одоогийн ба өмнөх заалт'); },
    icon: "radio",
    hue: "#0891b2",
    // Мэдрэгч бүр НЭГ цэгээр (суурилуулалтын мөр) — `IOT_LAYERS.where` үзнэ үү
    layers: ["iot:waste_sensor", "iot:water_meter", "iot:light_sensor", "iot:temp_humidity", "iot:soil_meter"],
    initial: ["iot:waste_sensor", "iot:water_meter", "iot:light_sensor", "iot:temp_humidity", "iot:soil_meter"],
    standalone: true,
  },
  /**
   * ЭРСДЭЛИЙН ЗАГВАР — IoT-ийн НЭГТГЭСЭН үр дүн (`Ersdel.tsx`). IoT-ийн ЯГ
   * ДООР байрлана: тэр нь мэдрэгчийн ТҮҮХИЙ заалт, энэ нь тэдгээрийн нэгтгэсэн
   * дүгнэлт (голын ус + агаарын бохирдол) ба ТААМАГЛАЛЫН хувилбар.
   */
  {
    key: "ersdel",
    get title() { return tr('Эрсдэлийн загвар'); },
    get desc() { return tr('Голын үер, агаарын бохирдлын эрсдэл — одоогийн байдал ба таамаглал газрын зураг дээр'); },
    icon: "waves",
    hue: "#0891b2",
    layers: PLAN_LAYER_IDS,
    initial: [],
    standalone: true,
  },
  /**
   * ЗӨВШӨӨРӨЛ — багц бүрийн зөвшөөрлүүд шат дараалалаар.
   */

  /**
   * ДЭД БҮТЭЦ — инженерийн шугам сүлжээ ГАЗРЫН ЗУРАГ ДЭЭР.
   */
  {
    key: "dedButets",
    get title() { return tr('Инженерийн дэд бүтэц'); },
    get desc() { return tr('Дулаан, ус, ариутгах татуурга, цахилгааны шугам сүлжээг газрын зураг дээр харах, засах'); },
    icon: "network",
    hue: "#f97316",
    layers: DED_BUTETS_LAYER_IDS,
    initial: DED_BUTETS_LAYER_IDS,
    standalone: true,
  },
  {
    key: "zovshoorol",
    get title() { return tr('Зөвшөөрөл'); },
    get desc() { return tr('Багц бүрд шаардлагатай зөвшөөрлүүд аль шатандаа явааг харах'); },
    icon: "stamp",
    hue: "#0ea5e9",
    layers: [],
    initial: [],
    standalone: true,
  },
  {
    key: "guitsetgel",
    get title() { return tr('Гүйцэтгэл'); },
    get desc() { return tr('Хийсэн ажлаа бөглөж илгээх, инженер хянах, удирдлага батлах ажлын хуудас (зөвхөн харах бол «Багцын гүйцэтгэл»)'); },
    icon: "pen",
    hue: "#7c3aed",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТ (2026-10-09). Чанарын 4 шатны (MA → MIR → FIC → М-акт)
   * эхний шат — «Чанарын баримт»-аас ТУСДАА шинэ сэдэв (хэрэглэгчийн шийдвэр). Survey123 →
   * Enterprise feature service (`lib/ma.ts`); портал уншиж, хавсралт нэмнэ. Газрын зураггүй.
   */
  {
    key: "ma",
    get title() { return tr('Материал баталгаажуулалт'); },
    get desc() { return tr('MA — Survey123-аар бөглөсөн материал баталгаажуулалт, хамаарах ажлууд, A/AN/R шийдвэр ба гэрчилгээ, лабораторийн дүнгийн хавсралт'); },
    icon: "cube",
    hue: "#b45309",
    layers: [],
    initial: [],
    standalone: true,
  },
  {
    key: "schem",
    get title() { return tr('Үйл ажиллагааны схем'); },
    get desc() { return tr('Төлөвлөхөөс тайлагнах хүртэл ажил хэрхэн урсдагийг амьд тоотой схемээр харах'); },
    icon: "flow",
    hue: "#0891b2",
    layers: [],
    initial: [],
    standalone: true,
  },
  /**
   * СИСТЕМИЙН БАРИМТ — порталын өөрийн заавар (2026-09-16).
   */
  {
    key: "sysdoc",
    get title() { return tr('Системийн баримт'); },
    get desc() { return tr('Порталын тоо хаанаас ирдэг, хэзээ шинэчлэгддэг, хэн засах эрхтэйг тайлбарласан лавлах'); },
    icon: "book",
    hue: "#64748b",
    layers: [],
    initial: [],
    standalone: true,
  },
];

export const VIEW_BY_KEY: Record<ViewKey, (typeof VIEWS)[number]> =
  Object.fromEntries(VIEWS.map((v) => [v.key, v])) as Record<
    ViewKey,
    (typeof VIEWS)[number]
  >;

/**
 * Апп нээгдэхэд ХАРАГДАХ харагдац.
 */
export const DEFAULT_VIEW: ViewKey = "gdash";

/**
 * НҮҮР ХУУДАСНЫ СЭДВҮҮД — ЗӨВХӨН нүүр дэх бүлэглэл (dropdown цэс).
 */
export const HOME_SECTIONS: {
  id: string;
  title: string;
  /** «Удирдлага» — бүх харагдацыг нээнэ (`ALL_MODE_HIDE`-аас бусад) */
  all?: boolean;
  views: ViewKey[];
}[] = [
  { id: "mgmt", get title() { return tr('Удирдлага'); }, all: true, views: [] },
  { id: "review", get title() { return tr('Тойм'); }, views: ["gdash", "schem", "dashboard", "tuh", "bagtsHamaaral", "tailan", "sysdoc"] },
  { id: "plan", get title() { return tr('Төлөвлөлт'); }, views: ["plan", "hesegET", "analysis", "irged", "tuvshin6"] },
  { id: "build", get title() { return tr('Хэрэгжилт'); }, views: ["pkgProg", "gazar", "habea", "iot", "ersdel", "dedButets", "guitsetgel", "zuragTosol", "zovshoorol", "huvaari", "huvaariBatlah", "ajilBatlah", "ma"] },
  { id: "money", get title() { return tr('Санхүү'); }, views: ["pkgFin", "finance"] },
];

/**
 * ПОРТАЛЫН ЗҮҮН ЦЭСНИЙ БҮЛЭГЛЭЛ — АЖЛЫН ТӨРЛӨӨР (2026-09-30).
 */
export type NavGroupId = "work" | "approve" | "monitor" | "smart" | "report" | "system";
export const NAV_GROUPS: { id: NavGroupId; title: string; views: ViewKey[] }[] = [
  { id: "work", get title() { return tr('Миний ажил'); }, views: ["guitsetgel", "huvaari", "tuvshin6", "zuragTosol"] },
  { id: "approve", get title() { return tr('Батлах'); }, views: ["huvaariBatlah", "ajilBatlah", "ma"] },
  {
    id: "monitor",
    get title() { return tr('Хяналт'); },
    views: ["gdash", "dashboard", "tuh", "bagtsHamaaral", "pkgProg", "plan", "hesegET", "gazar", "zovshoorol", "habea", "dedButets", "pkgFin", "finance"],
  },
  { id: "smart", get title() { return tr('Ухаалаг хот'); }, views: ["iot", "ersdel", "irged", "analysis"] },
  { id: "report", get title() { return tr('Тайлан'); }, views: ["tailan", "schem"] },
  { id: "system", get title() { return tr('Систем'); }, views: ["sysdoc"] },
];


/**
 * «Удирдлага» (бүх харагдац) горимд НУУГДАХ харагдацууд.
 */
export const ALL_MODE_HIDE: ViewKey[] = [];
