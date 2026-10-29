'use client';

/**
 * ЧАНАРЫН БАРИМТЫН (MS · MA · MIR · FIC · NCR) ҮҮРЭГ, БАГЦЫН ХУВААРИЛАЛТ.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { chanarUpsert, chanarRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';

export { ALL_BAGTS };

/**
 * ЗУРГААН ҮҮРЭГ — зураглалын эгнээнүүд + ТУГ + ЧХ инженер.
 *   author — Гүйцэтгэгч (аргачлал боловсруулж ирүүлнэ)
 *   tuh    — ТУХ-ийн инженер / менежер
 *   chanar — Чанарын хэлтэс
 *   habea  — ХАБЭА-н инженер (зөвхөн MS)
 *   tug    — ТУГ, төслийн удирдлагын газар (MA · NCR; 2026-09-28)
 *   cheng  — Чанарын хэлтсийн хяналтын инженер (MA-ийн эхний шат; 2026-09-28 2-р үе шат)
 */
export type ChanarRole = 'author' | 'tuh' | 'chanar' | 'habea' | 'tug' | 'cheng';
export const CHANAR_ROLES: readonly ChanarRole[] = ['author', 'tuh', 'chanar', 'habea', 'tug', 'cheng'];

export type ChanarAssign = Assign<ChanarRole>;

const acl = makeAcl<ChanarRole>({
  storeKey: 'selbe-chanar-acl-v1',
  event: 'selbe-chanar-acl-change',
  roleCaps: ROLE_CAPS.chanar,
  push: (user, roles, bagts, grants) => chanarUpsert(user, roles, bagts, grants),
  remove: chanarRemove,
  read: (user) => scopedRead('chanar', user),
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listChanarAssigns = (): ChanarAssign[] => acl.list();
export const chanarFailedUsers = acl.failedUsers;
export const subscribeChanarAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const chanarAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteChanar = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);


/** ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ */
export const setChanarGrants = (
  user: string, grants: Grant<ChanarRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeChanarAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeChanarAssign = acl.purge;

/** Унасан бичилтийг дахин илгээх (2026-10-01) — `scopedAcl.retry` */
export const retryChanarAssign = acl.retry;

/** Тухайн хэрэглэгчийн багцууд — ТУХАЙН ҮҮРГЭЭР. `null` = хязгааргүй */
export const chanarScope = (user: string | null | undefined, role: ChanarRole) =>
  acl.scope(user, role);

/**
 * Тухайн БАГЦАД хэрэглэгч ЯМАР ХЯНАГЧ вэ — `chanarMs.canAct`-д өгөх жагсаалт.
 */
export type ChanarReviewer = Exclude<ChanarRole, 'author'>;
export const CHANAR_REVIEWERS: readonly ChanarReviewer[] = ['tuh', 'chanar', 'habea', 'tug', 'cheng'];
export function reviewerRolesFor(
  user: string | null | undefined, bagts: string,
): ChanarReviewer[] {
  const out: ChanarReviewer[] = [];
  for (const r of CHANAR_REVIEWERS) {
    const sc = acl.scope(user, r);
    if (sc === null || sc.includes(bagts)) out.push(r);
  }
  return out;
}

/** Тухайн багцад гүйцэтгэгч (зохиогч) байх эрхтэй эсэх */
export function isAuthorFor(user: string | null | undefined, bagts: string): boolean {
  const sc = acl.scope(user, 'author');
  return sc === null || sc.includes(bagts);
}
