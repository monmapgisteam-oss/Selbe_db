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
  /* ⚠️ 2026-10-15 (хэрэглэгчийн шийдвэр): панелийн super-ээс КОДЫН super болгов — панелийн
     super нь зөвхөн харагдац нээдэг, засах эрх (`caps`) ба багцын хүрээ (`scope`) авдаггүй
     тул «Дэд бүтэц»-ийн «Мэдээллийн төлөв» г.м. эрхээр хаалттай хэсгүүд дутуу харагддаг байв.
     Одоо дээрх 7-той ЯГ ижил (`permissions.roleOf`-ийн 2026-10-06-ны ⚠️). */
  manager_3: "super",
  selbe_et: "beginner",
  selbe_redesign: "tolovlolt",
  /*
   * ⚠️ 2026-10-19 (аудит): ЖИШЭЭ урсгалын дөрвөн аккаунт (`selbe_guitsetgegch` · `selbe_injener` · `selbe_menejer` ·
   *    `selbe_eronhii`) ХАСАГДСАН. Тайлбар нь «бүтэц харуулсан жишээ» гэдэг байсан ч код тэднийг ЖИНХЭНЭЭР нэвтрүүлдэг
   *    (`roleForUser` → `hasAccess`) байв — тийм нэрээр ArcGIS аккаунт үүсгэсэн хэн ч нэвтэрч, урсгалын үүрэгтэй
   *    болох байлаа. Урсгалын хүнийг админ панелаас нэмж (`permissions.setUser`), «Гүйцэтгэлийн урсгалын эрх»-д
   *    шатанд томилно — шат нь томилгооноос (`resolveFlowStage`), энэ хүснэгтээс биш. Буцааж бүү нэм.
   */
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
    // ⚠️ 2026-10-19 (аудит): «Гүйцэтгэл» · «Хуваарь» ХАСАГДСАН — урсгалтай харагдац (`caps.WORKFLOW_VIEWS`) 2026-10-01-нөөс
    //    хадгалалт/суурьд ҮЛ ТООЦОГДОНО (`permissions.resolveAccess`), зөвхөн хуваарилалт/томилгоогоор нээгдэнэ. Энд
    //    үлдсэн нь картын тоолуур ба «суурь» (`revokeFlowAccess.keepGuits`)-ийг төөрөгдүүлдэг үхмэл утга байв.
    views: ["schem", "plan", "pkgProg", "habea", "gazar", "tailan", "sysdoc"],
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

/**
 * ArcGIS нэрээр үүрэг олох — олдохгүй бол `null` (нэвтрэх эрхгүй).
 * ⚠️ 2026-10-11 (аудит №7): `Object.hasOwn` — `constructor` · `__proto__` · `toString` г.м. нэр
 *    энгийн объектын прототипоос функц олж `null` биш утга буцаадаг байв (`Portal.tsx`-ийн ижил засвар).
 */
export const roleForUser = (username?: string | null): Role | null => {
  /* ⚠️ 2026-10-19 (аудит): `trim()` — бусад бүх эрхийн түлхүүр (`permsRemote.upsert`, `meOf`) trim · жижиг үсгээр;
     зайтай нэр (« bat ») энд super/admin-ийг алдаж, бусад газарт олддог зөрүү үүсдэг байв. */
  const k = username ? username.trim().toLowerCase() : '';
  return k && Object.hasOwn(ROLE_BY_USER, k) ? ROLE_BY_USER[k] : null;
};
