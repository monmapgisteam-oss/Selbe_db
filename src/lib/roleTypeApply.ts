'use client';

/**
 * ЭРХИЙН ТӨРЛИЙГ ХЭРЭГЛЭГЧИД ХЭРЭГЖҮҮЛЭХ — «Төрлөөр тохируулах» (2026-09-25 · 2026-09-30).
 *
 * Нэг дарахад төрлийн загварын (`roleTypes.roleAccess`) ХАРАХ тохиргоо тухайн
 * хүнд бичигдэнэ: харагдац · ТЭЗҮ-БОНУ · үүрэг (нүүр цонх үүргээсээ гарна).
 */

import { t as tr } from './i18nCore';
import { isCodeSuper, roleForUser, type Role } from './services';
import { listUsers, remoteReady, setUser } from './permissions';
import { currentUser } from './who';
import { roleAccess, typesReady } from './roleTypes';
import { WORKFLOW_VIEWS } from './caps';
import { flowAclReady, stageOfUser } from './guitsetgelAcl';

/* ══════════════════════ Түгжээ · ноорог (2026-09-25) ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ТҮГЖЭЭ — карт ба бөөнөөр хэрэгжүүлэлт ХУВААЛЦАНА.
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
 */
let draftUsers = new Set<string>();
export function setTypeDraftUsers(keys: Iterable<string>): void {
  draftUsers = new Set([...keys].map((k) => k.trim().toLowerCase()));
}

/* ══════════════════════ Хэрэгжүүлэлт ══════════════════════ */

export type ApplyResult = {
  ok: boolean; errors: string[];
  flowStage?: string;
};

/**
 * `applyType`-ийн бичихээс өмнөх БҮХ шалгалт — алдаа (`errors` · `flowStage`) эсвэл `null` (бичиж болно).
 */
export function applyTypePrecheck(
  user: string, role: Role, opts: { ignoreFlow?: boolean } = {},
): { errors: string[]; flowStage?: string } | null {
  const u = user.trim().toLowerCase();
  if (!u) return { errors: [tr('Аккаунтын нэрээ бичнэ үү')] };
  if (!typesReady()) return { errors: [tr('Эрхийн төрлийн загвар уншигдаагүй — дахин ачаална уу.')] };
  if (!remoteReady()) return { errors: [tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.')] };
  if (!listUsers().some((x) => x.username.toLowerCase() === u)) {
    return { errors: [tr('«{0}» устгагдсан аккаунт — өөрчлөлт хадгалагдсангүй.', u)] };
  }
  if (isCodeSuper(u) && role !== 'super') {
    return { errors: [tr('Кодонд бүртгэлтэй админыг (super) өөр төрөлд шилжүүлэх боломжгүй.')] };
  }
  const me = (currentUser() ?? '').trim().toLowerCase();
  const adminSuper = !!me && roleForUser(me) === 'super';
  const wasSuper = roleForUser(u) === 'super';
  if ((role === 'super' || wasSuper) && !adminSuper) {
    return { errors: [tr('Super эрхийг зөвхөн super админ олгож, хасна.')] };
  }
  if (wasSuper && role !== 'super' && u === me) {
    return { errors: [tr('Өөрийн super эрхийг өөрөө хасах боломжгүй — өөр super админ хасна.')] };
  }
  if (draftUsers.has(u)) {
    return { errors: [tr('Хадгалаагүй ноорогтой — эхлээд «Хадгалах» эсвэл «Болих» дарна уу.')] };
  }
  if (userLocks.has(u)) {
    return { errors: [tr('Энэ хэрэглэгчид тохируулга явагдаж байна — дуустал хүлээнэ үү.')] };
  }
  /* Урсгалын томилгоо уншигдаагүй бол «томилгоогүй» гэж дүгнэхгүй (fail-closed) */
  if (role === 'zahiral' && !flowAclReady()) {
    return { errors: [tr('Гүйцэтгэлийн урсгалын эрх уншигдаагүй — дахин ачаална уу.')] };
  }
  const flowStage = role === 'zahiral' && !opts.ignoreFlow ? stageOfUser(u) : null;
  if (flowStage) {
    return {
      errors: [tr('«{0}» гүйцэтгэлийн урсгалд томилгоотой — Ерөнхий захирал зөвхөн харна. Эхлээд урсгалын томилгоог хасна уу.', u)],
      flowStage,
    };
  }
  return null;
}

export async function applyType(user: string, role: Role): Promise<ApplyResult> {
  const u = user.trim().toLowerCase();
  const pre = applyTypePrecheck(u, role);
  if (pre) return { ok: false, ...pre };
  userLocks.add(u);
  emit(LOCK_EVENT);
  try {
    const acc = roleAccess(role);
    const views = acc.views === 'all' ? 'all' : acc.views.filter((v) => !WORKFLOW_VIEWS.includes(v));
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
