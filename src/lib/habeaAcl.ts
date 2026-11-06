'use client';

/**
 * ХАБЭА ХУУДАС ХАРАХ БАГЦЫН ХУВААРИЛАЛТ (2026-11-04, хэрэглэгч: «энэ эрхээр нэвтэрсэн хүн энэ багцын л мэдээлэл харна
 * гэж тохируулмаар байна»). НЭГ үүрэг — Харагч (`viewer`).
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { habeaUpsert, habeaRemove, scopedRead } from './permsRemote';
import { remoteMalformed } from './permissions';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';

export { ALL_BAGTS };

/** Хүснэгтэд оноож болох багцууд (2026-11-04, хэрэглэгч: «Багц 5.1-ээс хойших хэрэггүй») — Багц 1 … Багц 4-2 */
export const HABEA_PKGS: readonly string[] = PKG_GROUPS.filter((g) => /^Багц\s*[1-4](\D|$)/.test(g));

/** Ганц үүрэг */
export type HabeaRole = 'viewer';

export type HabeaAssign = Assign<HabeaRole>;

const ACL_EVENT = 'selbe-habea-acl-change';
const acl = makeAcl<HabeaRole>({
  storeKey: 'selbe-habea-acl-v1',
  event: ACL_EVENT,
  roleCaps: ROLE_CAPS.habea,
  push: (user, roles, bagts, grants) => habeaUpsert(user, roles, bagts, grants),
  remove: habeaRemove,
  read: (user) => scopedRead('habea', user),
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listHabeaAssigns = (): HabeaAssign[] => acl.list();
export const habeaFailedUsers = acl.failedUsers;
export const subscribeHabeaAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд */
export const habeaAclReady = acl.ready;

/** Хүснэгтэд мөртэй ч хүчинтэй `viewer` хуваарилалтгүй аккаунтууд — сүүлийн синкийн */
let invalidUsers: ReadonlySet<string> = new Set();

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteHabea = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => {
  /* `syncRemote` мэдэгдэл (`notify`) явуулдаг тул жагсаалтыг эртхэн дүүргэнэ: эвдэрсэн мөр нэг ч агшин «хязгааргүй» болж харагдахгүй */
  invalidUsers = new Set(rows.map((r) => String(r.user ?? '').trim().toLowerCase()).filter(Boolean));
  acl.syncRemote(rows);
  invalidUsers = new Set([...invalidUsers].filter((u) => !acl.hasRole(u, 'viewer')));
  /* Эцсийн жагсаалтаар дахин бодуулна */
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACL_EVENT));
};

/**
 * ХУВААРИЛАЛТЫН МӨР НЬ ЭВДЭРСЭН ҮҮ — хүчинтэй хуваарилалтгүй мөр ба задлагдаагүй мөр (`remoteMalformed`, `__habea__:` угтвартай).
 * Мөрөөс нь хязгаар тавих гэсэн санаа харагдаж байгаа ч багц нь уншигдахгүй тул «хязгааргүй» гэж ойлгож болохгүй.
 */
export const habeaRowBroken = (user: string | null | undefined): boolean => {
  const lu = String(user ?? '').trim().toLowerCase();
  if (!lu) return false;
  return invalidUsers.has(lu)
    || remoteMalformed().some((m) => malformedHabeaUser(m.key) === lu);
};

/** Задлагдаагүй мөрийн түлхүүр → аккаунт. Угтварын дараах зай (`__habea__: bob`) ч тэр аккаунтынх (`permsRemote.isSpacedKey`) */
export const malformedHabeaUser = (key: string): string | null => {
  const lu = key.trim().toLowerCase();
  return lu.startsWith('__habea__:') ? lu.slice('__habea__:'.length).trim() : null;
};

export const setHabeaGrants = (
  user: string, grants: Grant<HabeaRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

export const removeHabeaAssign = (user: string, revoke = true) => acl.remove(user, revoke);

export const purgeHabeaAssign = acl.purge;

export const retryHabeaAssign = acl.retry;

/** Тухайн хэрэглэгчийн багцууд (`PKG_GROUPS` нэрээр) — `null` = бүх багц */
export const habeaViewerScope = (user: string | null | undefined): string[] | null =>
  acl.scope(user, 'viewer');

/** ХАБЭА-ийн багцын хязгаар тавигдсан аккаунт мөн үү */
export const hasHabeaViewer = (user: string | null | undefined): boolean =>
  acl.hasRole(user, 'viewer');
