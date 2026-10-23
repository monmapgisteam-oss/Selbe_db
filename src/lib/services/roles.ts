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
  /* ⚠️ 2026-10-23: ТӨЛӨВЛӨЛТИЙН ИНЖЕНЕР (`planner` шат). `tolovloltiin` — ХУУЧИН `tolovlolt`
     («Төлөвлөлт (хуучин)», урсгалын бус) -тэй БҮҮ андуур: хадгалагдсан мөрүүд тэр утгатай тул нэрийг
     нь дахин ашиглавал хуучин аккаунтууд урсгалын шатанд чимээгүй орно. */
  | "tolovloltiin"
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
 * ⚠️ ДОЛООН шат (2026-10-23; урьд нь зургаа). `menejer` нь багцын ахлах инженер, `tolovloltiin` нь
 *    төлөвлөлтийн инженер, `eronhii` нь төлөвлөлтийн ахлах инженер; эцэст нь газрын дарга (`gazriin`)
 *    зөвшөөрснөөр л гүйцэтгэл эх хүснэгтэд бүртгэгдсэнд тооцно.
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
  /* ⚠️ 2026-10-23: 4 дэх шат — төлөвлөлтийн инженер (хэлтсийн · газрын дарга 6 ба 7 болов) */
  planner: "tolovloltiin",
  director: "eronhii",
  /* ⚠️ 2026-09-23: хэлтсийн дарга, газрын дарга (2026-10-23-наас 6 ба 7 дахь шат) */
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
  /* ⚠️ 2026-10-20 (Enterprise руу БҮРЭН шилжилт, хэрэглэгчийн шийдвэр: «tumenjargal_selbe-г үлдээгээд бусдыг устга»):
     AGOL-ын бүх аккаунт (bilguuntugs_monmap · enhsaandar_monmap · munkhbaatar_selbe · tumenjargal_monmap ·
     narandulam_monmap · saruul_monmap · maralgoo_monmap · manager_3 · selbe_et · selbe_redesign) ХАСАГДСАН —
     нэвтрэлт одоо Сэлбэ Enterprise геопортал (gis.selbecity.mn/geoportal). Цорын ганц КОДЫН super нь Enterprise-ийн
     `tumenjargal_selbe` (бүх Enterprise үйлчилгээний эзэн); бусад хэрэглэгчийг админ панелаас (`permissions.setUser`) нэмнэ.
     Эрхийн хүснэгтийн (`SYS_Selbe_Permissions`) AGOL нэртэй мөрүүд мөн устгагдсан (нөөц: шилжилтийн сешний scratchpad). */
  /* ⚠️ 2026-10-21 (хэрэглэгчийн шийдвэр: «тохиргооноос давсан хатуу эрх байж болохгүй — бүгд эрхийн тохиргооноос»):
     КОДЫН хатуу super (`tumenjargal_selbe`) ХАСАГДСАН. Super нь одоо эрхийн хүснэгтийн мөр (`role: 'super'`, админ
     самбараас super админ олгоно/хасна) — доорх `_setTableSupers` · `roleForUser`. Энэ объект production-д ХООСОН,
     зөвхөн нэгж тестэд (`tools/test-users.mjs`) бөглөгдөнө. Хүснэгтэд нэг ч super байхгүй үеийн анхны админ —
     `BOOTSTRAP_SUPER`. */
  /*
   * ⚠️ 2026-10-19 (аудит): ЖИШЭЭ урсгалын дөрвөн аккаунт (`selbe_guitsetgegch` · `selbe_injener` · `selbe_menejer` ·
   *    `selbe_eronhii`) ХАСАГДСАН. Урсгалын хүнийг админ панелаас нэмж (`permissions.setUser`), «Гүйцэтгэлийн урсгалын
   *    эрх»-д шатанд томилно — шат нь томилгооноос (`resolveFlowStage`), энэ хүснэгтээс биш. Буцааж бүү нэм.
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
  /* ⚠️ 2026-10-23: төлөвлөлтийн инженер — бусад урсгалын үүрэгтэй ижил */
  tolovloltiin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  eronhii: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  heltsiin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  gazriin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  /*
   * ⚠️ 2026-09-25: «Эрхийн төрөл»-ийн гурван шинэ төрөл. Энэ нь ЗӨВХӨН нөөц —
   *    бодит харагдац нь админы тохируулсан загвараас (`roleTypes.roleAccess`).
   */
  taniltsah: { views: ["gdash", "dashboard", "plan", "pkgProg", "gazar", "tailan", "schem", "sysdoc"], docs: true, home: "gdash" },
  /* ⚠️ 2026-10-23: «Чанар (QAQC)» харагдац хасагдсан — чанарын үүрэг MA-тай л */
  chanar: { views: ["ma"], docs: false, home: "ma" },
  gazar: { views: ["gazar"], docs: false, home: "gazar" },
};

/**
 * ArcGIS нэрээр үүрэг олох — олдохгүй бол `null` (нэвтрэх эрхгүй).
 * ⚠️ 2026-10-11 (аудит №7): `Object.hasOwn` — `constructor` · `__proto__` · `toString` г.м. нэр
 *    энгийн объектын прототипоос функц олж `null` биш утга буцаадаг байв (`Portal.tsx`-ийн ижил засвар).
 */
/**
 * ЭРХИЙН ХҮСНЭГТИЙН SUPER-УУД (⚠️ 2026-10-21, хэрэглэгчийн шийдвэр: «тохиргооноос давсан хатуу эрх байж болохгүй»).
 * `permissions.initRemoteInner` амжилттай уншилт бүрд (`role:'super'`, устгагдаагүй мөрүүд) тавина; түүнээс хойш энэ
 * runtime-ийн бичилт мөр мөрөөр тусгана (`_markTableSuper` — `setUser`/`retryDirtyOnce` олголтыг АМЖИЛТТАЙ бичсэний дараа,
 * хасалтыг шууд; `clearOverride`). `null` = энэ сешнд хүснэгт НЭГ Ч удаа уншигдаагүй — FAIL-CLOSED: хэн ч
 * super биш, анхны админ ч биш (localStorage-д өөртөө `role:'super'` бичих зам хаалттай — `permissions.resolveBaseAccess`).
 */
let tableSupers: Set<string> | null = null;
export function _setTableSupers(users: Iterable<string> | null): void {
  tableSupers = users == null ? null : new Set([...users].map((u) => u.trim().toLowerCase()).filter(Boolean));
}
/**
 * НЭГ мөрийн super төлөв — энэ runtime-ийн бичилт (`permissions.setUser` · `clearOverride`) дор хаяж remote-ийн дараагийн
 * уншилт хүртэл тусгагдана. Хүснэгт уншигдаагүй (`null`) бол ЮУ Ч хийхгүй (fail-closed хэвээр) — localStorage-ийн кэшийг
 * бүхэлд нь дахин уншдаггүй: тэнд гараар тарьсан `role:'super'` мөр super болохгүй.
 */
export function _markTableSuper(username: string, on: boolean): void {
  if (!tableSupers) return;
  const k = username.trim().toLowerCase();
  if (on) tableSupers.add(k); else tableSupers.delete(k);
}
/** Хүснэгтийн super-ууд (энэ сешнд уншигдаагүй бол `null`) — `permissions` ба шалгуурт */
export const tableSuperUsers = (): readonly string[] | null => (tableSupers ? [...tableSupers] : null);
/**
 * АНХНЫ АДМИН — ЗӨВХӨН эрхийн хүснэгтэд нэг ч super БАЙХГҮЙ үед (шинэ/хоосон хүснэгт) super болно, ингэснээр админ
 * самбарт орж өөртөө/бусдад super олгоно. Хүснэгтэд super мөр бий болмогц энэ нь ҮЙЛЧЛЭХГҮЙ.
 * ⚠️ Хүснэгтийн бүх super-ийг устгавал дахин идэвхжинэ — админгүй болж түгжигдэхээс сэргийлэх цорын ганц зам.
 */
export const BOOTSTRAP_SUPER = 'tumenjargal_selbe';
/** Кодын (тестийн) super эсэх — эрхийн хүснэгтэд мөр бичигдэхгүй (`permissions.setUser`), самбараас өөрчлөгдөхгүй */
export const isCodeSuper = (username?: string | null): boolean => {
  const k = username ? username.trim().toLowerCase() : '';
  return !!k && Object.hasOwn(ROLE_BY_USER, k) && ROLE_BY_USER[k] === 'super';
};
export const roleForUser = (username?: string | null): Role | null => {
  /* ⚠️ 2026-10-19 (аудит): `trim()` — бусад бүх эрхийн түлхүүр (`permsRemote.upsert`, `meOf`) trim · жижиг үсгээр;
     зайтай нэр (« bat ») энд super/admin-ийг алдаж, бусад газарт олддог зөрүү үүсдэг байв. */
  const k = username ? username.trim().toLowerCase() : '';
  if (k && Object.hasOwn(ROLE_BY_USER, k)) return ROLE_BY_USER[k];
  /* ⚠️ 2026-10-21: super = эрхийн хүснэгт (дээрх ⚠️); хүснэгтэд super огт байхгүй бол анхны админ */
  if (!k || !tableSupers) return null;
  if (tableSupers.has(k)) return 'super';
  return tableSupers.size === 0 && k === BOOTSTRAP_SUPER ? 'super' : null;
};
