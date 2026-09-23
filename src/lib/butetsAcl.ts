'use client';

/**
 * ДЭД БҮТЦИЙН АТРИБУТ ЗАСАХ ЭРХИЙН БАГЦЫН ХУВААРИЛАЛТ (2026-09-23).
 *
 * «Инженерийн дэд бүтэц» хуудасны «Мэдээлэл засах» горимд аль БАГЦЫН
 * давхаргыг засаж болохыг аккаунт бүрд заана. НЭГ үүрэг — Засварлагч
 * (`editor`): засвар ArcGIS-д ШУУД бичигдэнэ, батлах шат байхгүй (хэрэглэгчийн
 * 2026-09-23-ны шийдвэр: обьёмынх шиг батлагч ХЭРЭГГҮЙ).
 *
 * ⚠️ ҮҮРЭГ → ЭРХ: `editor` нь БАЙГАА `butets` эрхийг дахин ашиглана
 *    (`CAP_HOST_VIEW.butets = ['dedButets']` — хуудас нь өөрөө нээгдэнэ).
 *    Урьд нь `butets` эрх БҮХ 74 давхаргыг засах эрх байв; одоо хүрээ нь
 *    ЭНЭ хуваарилалтаас гарна.
 *
 * ⚠️ FAIL-CLOSED (хэрэглэгчийн шийдвэр): `butets` эрхтэй ч багц хуваарилагдаагүй
 *    бол НЭГ Ч давхарга засахгүй. Зөвхөн хатуу `super` хязгааргүй. Панелаас
 *    багц олгоход эрх нь өөрөө асна (`scopedAcl.syncCaps`).
 *
 * ⚠️ БАГЦЫН НЭГЖ нь `butetsPacks.BUTETS_PACKS` (25 багц: 5.1…5.4, 6.1…6.8,
 *    7, 8.2, 10…15, 18, Холбоо 1–3) — `PKG_GROUPS` (Бөглөх хуудасны 1…10)
 *    БИШ. `grants[].bagts`-д `bagtsKey()` хэлбэрийн түлхүүр («БАГЦ51»)
 *    хадгалагдана.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__butets__:` угтвартай мөрөнд
 *    (`__obyem__:` / `__chanar__:`-ийн адил). Логик нь `scopedAcl.ts`-д.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { butetsUpsert, butetsRemove } from './permsRemote';
import { PACK_OF_LAYER } from './butetsPacks';

export { ALL_BAGTS };

/** Ганц үүрэг */
export type ButetsRole = 'editor';

export type ButetsAssign = Assign<ButetsRole>;

const acl = makeAcl<ButetsRole>({
  storeKey: 'selbe-butets-acl-v1',
  event: 'selbe-butets-acl-change',
  roleCaps: { editor: 'butets' },
  push: (user, roles, bagts, grants) => butetsUpsert(user, roles, bagts, grants),
  remove: butetsRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noRole: 'Дор хаяж нэг үүрэг сонгоно уу',
    noBagts: 'Багц сонгоно уу',
  },
});

export const listButetsAssigns = (): ButetsAssign[] => acl.list();
export const butetsFailedUsers = acl.failedUsers;
export const subscribeButetsAcl = acl.subscribe;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteButets = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);

/** Аккаунтад багц олгох / шинэчлэх (ганц үүрэг тул `roles` үргэлж `['editor']`) */
export const setButetsAssign = (user: string, bagts: string[], grant = true) =>
  acl.set(user, ['editor'], bagts, grant);

export const setButetsGrants = (
  user: string, grants: Grant<ButetsRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

export const butetsGrantsOf = acl.grantsOf;

export const removeButetsAssign = (user: string, revoke = true) => acl.remove(user, revoke);

export const purgeButetsAssign = acl.purge;

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
 * ⚠️ Багцад хамаарахгүй давхарга (`PACK_OF_LAYER`-т байхгүй) нь зөвхөн
 *    хязгааргүй хүнд нээлттэй — «эзэнгүй» давхаргыг хэн ч засахгүй.
 */
export const canEditButetsLayer = (user: string | null | undefined, layerId: string): boolean => {
  const sc = butetsScope(user);
  if (sc === null) return true;
  if (!sc.length) return false;
  const pk = PACK_OF_LAYER[layerId];
  return !!pk && sc.includes(pk);
};
