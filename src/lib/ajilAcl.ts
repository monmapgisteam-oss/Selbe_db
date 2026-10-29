'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАГЦЫН ХУВААРИЛАЛТ.
 *
 *   · ЗАСВАРЛАГЧ (`addRow`)      — «Гүйцэтгэл бөглөх» хуудсанд шинэ ажлын
 *                                  мөр нэмж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ    (`ajilApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь эзэмшиж болно (жижиг багцад хэвийн), гэхдээ
 * ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй — `ajilBatlah.decideAjil` зохиогч=батлагч
 * тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { ajilUpsert, ajilRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';

export { ALL_BAGTS };

/** Нэмэлт ажлын хоёр үүрэг */
export type AjilRole = 'editor' | 'approver';

/** Нэг аккаунтын нэмэлт ажлын хуваарилалт */
export type AjilAssign = Assign<AjilRole>;

const acl = makeAcl<AjilRole>({
  storeKey: 'selbe-ajil-acl-v1',
  event: 'selbe-ajil-acl-change',
  roleCaps: ROLE_CAPS.ajil,
  push: (user, roles, bagts, grants) => ajilUpsert(user, roles, bagts, grants),
  remove: ajilRemove,
  read: (user) => scopedRead('ajil', user),
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listAjilAssigns = (): AjilAssign[] => acl.list();
export const ajilFailedUsers = acl.failedUsers;
export const subscribeAjilAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const ajilAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteAjil = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);

/** Аккаунтад нэмэлт ажлын үүрэг ба багц олгох / шинэчлэх */
export const setAjilAssign = (
  user: string, roles: AjilRole[], bagts: string[], grant = true,
) => acl.set(user, roles, bagts, grant);

/**
 * ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ.
 */
export const setAjilGrants = (
  user: string, grants: Grant<AjilRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeAjilAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeAjilAssign = acl.purge;

/** Унасан бичилтийг дахин илгээх (2026-10-01) — `scopedAcl.retry` */
export const retryAjilAssign = acl.retry;

/** Тухайн хэрэглэгчийн НЭМЭЛТ АЖЛЫН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const ajilScope = (user: string | null | undefined, role: AjilRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasAjilRole = acl.hasRole;
