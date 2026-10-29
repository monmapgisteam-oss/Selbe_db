'use client';

/**
 * ДЭД БҮТЦИЙН АТРИБУТ ЗАСАХ ЭРХИЙН БАГЦЫН ХУВААРИЛАЛТ (2026-09-23).
 *
 * «Инженерийн дэд бүтэц» хуудасны «Мэдээлэл засах» горимд аль БАГЦЫН
 * давхаргыг засаж болохыг аккаунт бүрд заана. НЭГ үүрэг — Засварлагч
 * (`editor`): засвар ArcGIS-д ШУУД бичигдэнэ, батлах шат байхгүй (хэрэглэгчийн
 * 2026-09-23-ны шийдвэр: обьёмынх шиг батлагч ХЭРЭГГҮЙ).
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { butetsUpsert, butetsRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';
import { PACK_OF_LAYER } from './butetsPacks';
import { AUTH } from './services';

export { ALL_BAGTS };

/** Ганц үүрэг */
export type ButetsRole = 'editor';

export type ButetsAssign = Assign<ButetsRole>;

const acl = makeAcl<ButetsRole>({
  storeKey: 'selbe-butets-acl-v1',
  event: 'selbe-butets-acl-change',
  roleCaps: ROLE_CAPS.butets,
  push: (user, roles, bagts, grants) => butetsUpsert(user, roles, bagts, grants),
  remove: butetsRemove,
  read: (user) => scopedRead('butets', user),
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listButetsAssigns = (): ButetsAssign[] => acl.list();
export const butetsFailedUsers = acl.failedUsers;
export const subscribeButetsAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const butetsAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteButets = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);

export const setButetsGrants = (
  user: string, grants: Grant<ButetsRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

export const removeButetsAssign = (user: string, revoke = true) => acl.remove(user, revoke);

export const purgeButetsAssign = acl.purge;

/** Унасан бичилтийг дахин илгээх (2026-10-01) — `scopedAcl.retry` */
export const retryButetsAssign = acl.retry;

/**
 * Тухайн хэрэглэгчийн засаж болох БАГЦУУД.
 *   · `null` — хязгааргүй (super / бүх багц)
 *   · `[]`   — хуваарилагдаагүй → нэг ч давхарга (fail-closed)
 */
export const butetsScope = (user: string | null | undefined): string[] | null =>
  acl.scope(user, 'editor');

export const hasButetsRole = (user: string | null | undefined): boolean =>
  acl.hasRole(user, 'editor');

/**
 * Энэ ДАВХАРГЫГ засаж болох уу — багцын хүрээгээр.
 */
export const canEditButetsLayer = (user: string | null | undefined, layerId: string): boolean => {
  if (!AUTH.appId) return true;
  const sc = butetsScope(user);
  if (sc === null) return true;
  if (!sc.length) return false;
  const pk = PACK_OF_LAYER[layerId];
  return !!pk && sc.includes(pk);
};
