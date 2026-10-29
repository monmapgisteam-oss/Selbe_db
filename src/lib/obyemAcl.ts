'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАГЦЫН ХУВААРИЛАЛТ.
 *
 *   · ЗАСВАРЛАГЧ (`obyemEdit`)    — «Инженерийн төлөвлөсөн обьём» баганын
 *                                   нүднүүдийг засаж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ    (`obyemApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь эзэмшиж болно (жижиг багцад хэвийн), гэхдээ
 * ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй — `obyemBatlah.decideObyem` зохиогч=батлагч
 * тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { obyemUpsert, obyemRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';

export { ALL_BAGTS };

/** Обьёмын хоёр үүрэг */
export type ObyemRole = 'editor' | 'approver';

/** Нэг аккаунтын обьёмын хуваарилалт */
export type ObyemAssign = Assign<ObyemRole>;

const acl = makeAcl<ObyemRole>({
  storeKey: 'selbe-obyem-acl-v1',
  event: 'selbe-obyem-acl-change',
  roleCaps: ROLE_CAPS.obyem,
  push: (user, roles, bagts, grants) => obyemUpsert(user, roles, bagts, grants),
  remove: obyemRemove,
  read: (user) => scopedRead('obyem', user),
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listObyemAssigns = (): ObyemAssign[] => acl.list();
export const obyemFailedUsers = acl.failedUsers;
export const subscribeObyemAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const obyemAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteObyem = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);

/** Аккаунтад обьёмын үүрэг ба багц олгох / шинэчлэх */
export const setObyemAssign = (
  user: string, roles: ObyemRole[], bagts: string[], grant = true,
) => acl.set(user, roles, bagts, grant);

/**
 * ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ.
 */
export const setObyemGrants = (
  user: string, grants: Grant<ObyemRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeObyemAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeObyemAssign = acl.purge;

/** Унасан бичилтийг дахин илгээх (2026-10-01) — `scopedAcl.retry` */
export const retryObyemAssign = acl.retry;

/** Тухайн хэрэглэгчийн ОБЬЁМЫН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const obyemScope = (user: string | null | undefined, role: ObyemRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasObyemRole = acl.hasRole;
