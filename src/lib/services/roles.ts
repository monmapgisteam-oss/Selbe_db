import type { Stage } from '../hyanalt';
import { DEFAULT_VIEW } from './views';
import type { ViewKey } from './views';

/* ══════════════════════ Нэвтрэлтийн эрх — үүрэг ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧИЙН ҮҮРЭГ.
 *   · `super`     — бүх харагдацыг үзнэ («Удирдлага» горим).
 *   · `beginner`  — төлөвлөлт, багц, хяналт, газар, ТЭЗҮ-БОНУ, тайлан, гүйцэтгэл.
 *   · `tolovlolt` — зөвхөн ерөнхий төлөвлөгөө ба багцын мэдээлэл.
 */
/**
 * ⚠️ Сүүлийн ГУРАВ нь «Гүйцэтгэл» урсгалын үүргүүд. Тэдгээр нь эрхийн зэрэглэл
 * БИШ, урсгал дахь БАЙРЛАЛ: гүйцэтгэгч бөглөнө → инженер шалгана → менежер
 * батална. Нэг аккаунт нэг л байрлалтай тул үүргээс нь шууд «энэ хүн юу хийх
 * ёстой вэ» гарч ирнэ — програм асуух шаардлагагүй.
 */
export type Role =
  | "super"
  | "beginner"
  | "tolovlolt"
  | "guitsetgegch"
  | "injener"
  | "menejer"
  | "eronhii"
  | "heltsiin"
  | "gazriin"
  /* ⚠️ 2026-09-25: урсгалын БУС гурван төрөл — «Эрхийн төрөл» (`roleTypes.ts`) */
  | "taniltsah"
  | "chanar"
  | "gazar";

/**
 * УРСГАЛЫН ШАТ → ПОРТАЛЫН ҮҮРЭГ — ГАНЦ ЭХ СУРВАЛЖ.
 *
 * ⚠️ ЗУРГААН шат. `menejer` нь БАГЦЫН менежер, `eronhii` нь ЕРӨНХИЙ менежер —
 *    сүүлийнх нь зөвшөөрснөөр л гүйцэтгэл эх хүснэгтэд бүртгэгдсэнд тооцно.
 *
 * ⚠️ 2026-08-29: урьд нь энэ хүснэгт ХОЁР газар (энд `ROLE_STAGE`,
 *    `guitsetgelAcl.ts`-д `STAGE_ROLE`) гараар урвуулж бичигдсэн байв — нэг нь
 *    хоцорвол «томилогдсон атлаа зөвхөн харах» гэсэн чимээгүй алдаа гарна.
 *    Одоо `Record<Stage, Role>` (шат бүрд ЗААВАЛ үүрэг — tsc шалгана) энд,
 *    урвуу нь түүнээс бодогдоно.
 */
export const STAGE_ROLE: Record<Stage, Role> = {
  company: "guitsetgegch",
  engineer: "injener",
  manager: "menejer",
  director: "eronhii",
  /* ⚠️ 2026-09-23: 5 ба 6 дахь шат — хэлтсийн дарга, газрын дарга */
  head: "heltsiin",
  chief: "gazriin",
};

/** «Гүйцэтгэл» урсгалын үүрэг → урсгалын шат. Бусад үүрэгт `undefined`. */
export const ROLE_STAGE: Partial<Record<Role, Stage>> = Object.fromEntries(
  Object.entries(STAGE_ROLE).map(([s, r]) => [r, s]),
) as Partial<Record<Role, Stage>>;

/**
 * ArcGIS хэрэглэгчийн нэр (ЖИЖИГ үсгээр) → үүрэг.
 *
 * ⚠️ Жагсаалтад БАЙХГҮЙ бүртгэл нэвтрэх эрхгүй — `AuthGate` түүнийг `denied`
 * болгоно. Шинэ хэрэглэгч нэмэхдээ нэрийг заавал жижиг үсгээр бичнэ
 * (`roleForUser` нь `toLowerCase()`-оор харьцуулна).
 */
export const ROLE_BY_USER: Record<string, Role> = {
  bilguuntugs_monmap: "super",
  enhsaandar_monmap: "super",
  munkhbaatar_selbe: "super",
  tumenjargal_monmap: "super",
  narandulam_monmap: "super",
  saruul_monmap: "super",
  maralgoo_monmap: "super",
  selbe_et: "beginner",
  selbe_redesign: "tolovlolt",
  /*
   * ⚠️ ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН аккаунтууд. Нэрийг нь бодит ArcGIS бүртгэлээр
   * солино — энд байгаа нь БҮТЭЦ харуулсан жишээ. Аккаунт нэмэхдээ зөвхөн
   * энэ хүснэгтэд мөр нэмнэ; эрх нь `ROLE_ACCESS`-ээс автоматаар гарна.
   */
  selbe_guitsetgegch: "guitsetgegch",
  selbe_injener: "injener",
  selbe_menejer: "menejer",
  selbe_eronhii: "eronhii",
};

/**
 * Үүрэг бүрийн эрх: харагдацууд (`'all'` = бүгд), ТЭЗҮ-БОНУ баримт үзэх эсэх,
 * нэвтрэнгүүт анх нээх харагдац.
 */
export const ROLE_ACCESS: Record<
  Role,
  { views: ViewKey[] | "all"; docs: boolean; home: ViewKey }
> = {
  super: { views: "all", docs: true, home: DEFAULT_VIEW },
  beginner: {
    // ⚠️ 2026-08-21: «Багцын хяналт» ХОЁР болж салсны дараа энэ үүрэгт
    // ЗӨВХӨН гүйцэтгэлийн тал (`pkgProg`) нээлттэй. Санхүүгийн өгөгдөл
    // (гэрээ, CASHFLOW, төлбөрийн акт) нь `pkgFin` дотор үлдсэн бөгөөд энэ
    // үүрэгт өгөөгүй — урьд нь нэгдсэн цонхоор дуулиангүй нээлттэй байв.
    // ⚠️ Урьд нь `sheet` («Гүйцэтгэл бөглөх») байсныг `guitsetgel` болгов —
    //    хоёр харагдац НЭГ болсон (доорх §ГҮЙЦЭТГЭЛ-ийг үз). Эрх нь
    //    хумигдаагүй: бөглөх хуудас нь тэр харагдацын нэг таб болсон.
    // ⚠️ `sysdoc` (2026-09-16): системийн баримт нь ШИЙДВЭР ГАРГАГЧИД зориулагдсан
    //    тул зөвхөн super биш, ердийн үүрэгт ч нээлттэй. Өгөгдөл уншдаггүй.
    views: ["schem", "plan", "pkgProg", "habea", "gazar", "tailan", "guitsetgel", "huvaari", "sysdoc"],
    docs: true,
    home: "plan",
  },
  tolovlolt: { views: ["plan"], docs: false, home: "plan" },
  /*
   * ⚠️ Гурвуулаа ЗӨВХӨН «Гүйцэтгэл» харагдацтай — бөглөх ба хяналт нь тэр НЭГ
   * хуудсанд нийлсэн тул тусад нь `sheet` өгөх шаардлагагүй. Илүү харагдац
   * өгвөл урсгалаас гадуур мэдээлэл нээгдэж, үүргийн хил бүдгэрнэ.
   */
  guitsetgegch: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  injener: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  menejer: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  eronhii: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  heltsiin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  gazriin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  /*
   * ⚠️ 2026-09-25: «Эрхийн төрөл»-ийн гурван шинэ төрөл. Энэ нь ЗӨВХӨН нөөц —
   *    бодит харагдац нь админы тохируулсан загвараас (`roleTypes.roleAccess`).
   */
  taniltsah: { views: ["gdash", "dashboard", "plan", "pkgProg", "gazar", "tailan", "schem", "sysdoc"], docs: true, home: "gdash" },
  chanar: { views: ["qaqc", "chanar", "ma"], docs: false, home: "chanar" },
  gazar: { views: ["gazar"], docs: false, home: "gazar" },
};

/** ArcGIS нэрээр үүрэг олох — олдохгүй бол `null` (нэвтрэх эрхгүй) */
export const roleForUser = (username?: string | null): Role | null =>
  username ? ROLE_BY_USER[username.toLowerCase()] ?? null : null;
