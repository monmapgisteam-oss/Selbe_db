'use client';

/**
 * ЭРХИЙН ТӨРЛИЙГ ХЭРЭГЛЭГЧИД ХЭРЭГЖҮҮЛЭХ — «Төрлөөр тохируулах» (2026-09-25 · 2026-09-30).
 *
 * Нэг дарахад төрлийн загварын (`roleTypes.roleAccess`) ХАРАХ тохиргоо тухайн
 * хүнд бичигдэнэ: харагдац · ТЭЗҮ-БОНУ · үүрэг (нүүр цонх үүргээсээ гарна).
 *
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30, хэрэглэгчийн шийдвэр). Урьд нь энэ модуль урсгалын
 *    шат · QAQC · таван үүрэгтэй систем · энгийн дөрвөн эрхийг ч загвараар
 *    бичиж/хасдаг байв («төрөл = бүрэн тодорхойлолт»). Одоо засах эрх БҮР админ
 *    порталын ӨӨРИЙН хуудсанд багц/аккаунтаар олгогдоно — энэ модуль хуваарилалт
 *    ба `__cap__:` мөрийг ОГТ хөндөхгүй; багц сонголт (`PkgSel` · `currentPkgs` ·
 *    `pkgsFromName`) хэрэггүй болж устсан. Ингэснээр «Төрлөөр тохируулах» нь
 *    хэн нэгний засах эрхийг чимээгүй тэлж/хумьж чадахгүй.
 * ⚠️ Бичих зам ШИНЭ БИШ — `permissions.setUser` (харагдац/үүргийн мөр).
 * ⚠️ Түгжээ: эрхийн хүснэгт уншигдаагүй бол татгалзана (`remoteReady`) — уншигдаагүй
 *    сешнд `roleOf`/override хүчингүй тул бичвэл бодит мөрийг дарна.
 * ⚠️ Super төрөл зөвхөн хатуу super-т; хатуу super-ийг доошлуулахгүй; хатуу super-т
 *    override мөр бичихгүй (эрх нь кодоос).
 */

import { t as tr } from './i18nCore';
import { roleForUser, type Role } from './services';
import { listUsers, remoteReady, setUser } from './permissions';
import { roleAccess, typesReady } from './roleTypes';
import { WORKFLOW_VIEWS } from './caps';

/* ══════════════════════ Түгжээ · ноорог (2026-09-25) ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ТҮГЖЭЭ — карт ба бөөнөөр хэрэгжүүлэлт ХУВААЛЦАНА.
 * ⚠️ ЯАГААД: хоёр `applyType` нэг хүнд зэрэг явбал бичилтүүд уралдаж үр дүн
 *    аль ч төрөлтэй таарахгүй.
 */
const userLocks = new Set<string>();
const LOCK_EVENT = 'selbe-roletype-lock';
const emit = (ev: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(ev)); };
export const typeApplyBusy = (user: string): boolean => userLocks.has(user.trim().toLowerCase());
export function subscribeTypeLock(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCK_EVENT, fn);
  return () => window.removeEventListener(LOCK_EVENT, fn);
}

/**
 * «ХЭРЭГЛЭГЧИД» САМБАРЫН ХАДГАЛААГҮЙ НООРОГТОЙ ХЭРЭГЛЭГЧИД — `UserAdmin` бүртгэнэ.
 * ⚠️ Хэрэгжүүлэлт нь эрхийн мөрийг (`setUser`) бичдэг тул ноорогтой хүнд
 *    бичвэл дараагийн «Хадгалах» нь манай бичилтийг ХУУЧИН ноорогоор дарна.
 */
let draftUsers = new Set<string>();
export function setTypeDraftUsers(keys: Iterable<string>): void {
  draftUsers = new Set([...keys].map((k) => k.trim().toLowerCase()));
}

/* ══════════════════════ Хэрэгжүүлэлт ══════════════════════ */

export type ApplyResult = { ok: boolean; errors: string[] };

export async function applyType(user: string, role: Role): Promise<ApplyResult> {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, errors: [tr('Аккаунтын нэрээ бичнэ үү')] };
  /* ⚠️ 2026-09-25: синкээс өмнө `tplOf` нь нарийн нөөц — түүнийг тараавал хүний эрх хумигдана */
  if (!typesReady()) return { ok: false, errors: [tr('Эрхийн төрлийн загвар уншигдаагүй — дахин ачаална уу.')] };
  if (!remoteReady()) return { ok: false, errors: [tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.')] };
  const hard = roleForUser(u) === 'super';
  /* ⚠️ Хатуу super-ийг панелаас доошлуулахгүй — `permissions.hasAccess`-ийн ⚠️ */
  if (hard && role !== 'super') {
    return { ok: false, errors: [tr('Кодонд бүртгэлтэй админыг (super) өөр төрөлд шилжүүлэх боломжгүй.')] };
  }
  /* ⚠️ 2026-09-25: админ самбарын эрх ЗӨВХӨН кодоор (`ROLE_BY_USER`). */
  if (!hard && role === 'super') {
    return { ok: false, errors: [tr('Super төрөл зөвхөн кодонд бүртгэлтэй админд — админ самбарын эрх кодоор л олгогдоно.')] };
  }
  if (draftUsers.has(u)) {
    return { ok: false, errors: [tr('Хадгалаагүй ноорогтой — эхлээд «Хадгалах» эсвэл «Цуцлах» дарна уу.')] };
  }
  if (userLocks.has(u)) {
    return { ok: false, errors: [tr('Энэ хэрэглэгчид тохируулга явагдаж байна — дуустал хүлээнэ үү.')] };
  }
  userLocks.add(u);
  emit(LOCK_EVENT);
  try {
    /* ⚠️ Хатуу super-т override мөр БИЧИХГҮЙ — эрх нь кодоос (`ROLE_BY_USER`) */
    if (role === 'super') return { ok: true, errors: [] };
    const acc = roleAccess(role);
    /*
     * ⚠️ УРСГАЛТАЙ ХАРАГДАЦ ХЭВЭЭР (2026-09-30): загвар зөвхөн харах хуудас олгодог
     *    (`roleTypes.TPL_VIEWS`); урсгалын шатаар нээгдсэн «Гүйцэтгэл» зэрэг
     *    хадгалагдсан утгыг загвар дарж хасах ёсгүй — хуваарилалт л хасна.
     */
    const cur = listUsers().find((x) => x.username.toLowerCase() === u)?.views ?? [];
    const held = (cur === 'all' ? [...WORKFLOW_VIEWS] : cur.filter((v) => WORKFLOW_VIEWS.includes(v)));
    const views = acc.views === 'all' ? 'all' : [...acc.views, ...held.filter((v) => !acc.views.includes(v))];
    const ok = await setUser(u, { views, docs: acc.docs }, role);
    return ok ? { ok: true, errors: [] } : { ok: false, errors: [tr('Харагдац: ArcGIS-т хадгалагдсангүй')] };
  } finally {
    userLocks.delete(u);
    emit(LOCK_EVENT);
  }
}

/* ══════════════════════ Бөөнөөр (2026-09-25) ══════════════════════ */

/**
 * «ХЭРЭГЖҮҮЛЭХ» — төрлийн бүх хэрэглэгчид.
 * ⚠️ МОДУЛИЙН ТҮВШНИЙ ТӨЛӨВ: урьд нь `ErhTypes`-ийн React төлөвт байсан тул
 *    таб солиход (unmount) давталт үргэлжилсээр, буцаж ороход «Хэрэгжүүлэх»
 *    дахин нээлттэй — хоёр давталт зэрэг явж болдог байв. Одоо нэг л давталт.
 * ⚠️ «Хэрэглэгчид» самбарт хадгалаагүй ноорогтой хүнийг АЛГАСЧ мэдээлнэ.
 */
export type BulkState = {
  role: Role; total: number; ok: number; errors: string[]; skipped: string[]; running: boolean;
};
let bulk: BulkState | null = null;
const BULK_EVENT = 'selbe-roletype-bulk';
export const bulkStatus = (): BulkState | null => bulk;
export function subscribeBulk(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(BULK_EVENT, fn);
  return () => window.removeEventListener(BULK_EVENT, fn);
}

/** @returns `false` — өөр давталт явагдаж байна */
export async function applyTypeBulk(role: Role, users: string[]): Promise<boolean> {
  if (bulk?.running) return false;
  let st: BulkState = { role, total: users.length, ok: 0, errors: [], skipped: [], running: true };
  const set = (n: BulkState) => { st = n; bulk = n; emit(BULK_EVENT); };
  set(st);
  try {
    for (const raw of users) {
      const u = raw.trim().toLowerCase();
      if (draftUsers.has(u)) { set({ ...st, skipped: [...st.skipped, u] }); continue; }
      const res = await applyType(u, role);
      set(res.ok
        ? { ...st, ok: st.ok + 1 }
        : { ...st, errors: [...st.errors, `${u}: ${res.errors.join('; ')}`] });
    }
  } catch (e) {
    set({ ...st, errors: [...st.errors, String(e)] });
  } finally {
    set({ ...st, running: false });
  }
  return true;
}
