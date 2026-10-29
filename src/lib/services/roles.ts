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
export type Role =
  | "super"
  | "beginner"
  | "tolovlolt"
  | "guitsetgegch"
  | "injener"
  | "menejer"
  | "tolovloltiin"
  | "eronhii"
  | "heltsiin"
  | "gazriin"
  | "taniltsah"
  | "chanar"
  | "gazar"
  | "zahiral";

/**
 * УРСГАЛЫН ШАТ → ПОРТАЛЫН ҮҮРЭГ — ГАНЦ ЭХ СУРВАЛЖ.
 */
export const STAGE_ROLE: Record<Stage, Role> = {
  company: "guitsetgegch",
  engineer: "injener",
  manager: "menejer",
  planner: "tolovloltiin",
  director: "eronhii",
  head: "heltsiin",
  chief: "gazriin",
};

/** «Гүйцэтгэл» урсгалын үүрэг → урсгалын шат. Бусад үүрэгт `undefined`. */
export const ROLE_STAGE: Partial<Record<Role, Stage>> = Object.fromEntries(
  Object.entries(STAGE_ROLE).map(([s, r]) => [r, s]),
) as Partial<Record<Role, Stage>>;

/**
 * ArcGIS хэрэглэгчийн нэр (ЖИЖИГ үсгээр) → үүрэг.
 */
export const ROLE_BY_USER: Record<string, Role> = {
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
    views: ["schem", "plan", "pkgProg", "habea", "gazar", "tailan", "sysdoc"],
    docs: true,
    home: "plan",
  },
  tolovlolt: { views: ["plan"], docs: false, home: "plan" },
  guitsetgegch: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  injener: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  menejer: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  tolovloltiin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  eronhii: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  heltsiin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  gazriin: { views: ["guitsetgel"], docs: false, home: "guitsetgel" },
  taniltsah: { views: ["gdash", "dashboard", "plan", "pkgProg", "gazar", "tailan", "schem", "sysdoc"], docs: true, home: "gdash" },
  chanar: { views: ["ma"], docs: false, home: "ma" },
  gazar: { views: ["gazar"], docs: false, home: "gazar" },
  zahiral: {
    views: ["gdash", "dashboard", "plan", "hesegET", "pkgFin", "pkgProg", "gazar", "analysis", "irged", "tailan", "tuh",
      "bagtsHamaaral", "finance", "habea", "iot", "ersdel", "dedButets", "zovshoorol", "schem", "sysdoc", "guitsetgel",
      "zuragTosol", "tuvshin6"],
    docs: true,
    home: "gdash",
  },
};

/**
 * ArcGIS нэрээр үүрэг олох — олдохгүй бол `null` (нэвтрэх эрхгүй).
 */
/**
 * ЭРХИЙН ХҮСНЭГТИЙН SUPER-УУД (2026-10-21, хэрэглэгчийн шийдвэр: «тохиргооноос давсан хатуу эрх байж болохгүй»).
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
 */
export const BOOTSTRAP_SUPER = 'tumenjargal_selbe';
/** Кодын (тестийн) super эсэх — эрхийн хүснэгтэд мөр бичигдэхгүй (`permissions.setUser`), самбараас өөрчлөгдөхгүй */
export const isCodeSuper = (username?: string | null): boolean => {
  const k = username ? username.trim().toLowerCase() : '';
  return !!k && Object.hasOwn(ROLE_BY_USER, k) && ROLE_BY_USER[k] === 'super';
};
export const roleForUser = (username?: string | null): Role | null => {
  const k = username ? username.trim().toLowerCase() : '';
  if (k && Object.hasOwn(ROLE_BY_USER, k)) return ROLE_BY_USER[k];
  if (!k || !tableSupers) return null;
  if (tableSupers.has(k)) return 'super';
  return tableSupers.size === 0 && k === BOOTSTRAP_SUPER ? 'super' : null;
};
