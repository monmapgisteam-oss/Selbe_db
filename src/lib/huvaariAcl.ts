'use client';

/**
 * ХУВААРИЙН БАГЦЫН ХУВААРИЛАЛТ — ГҮЙЦЭТГЭЛИЙН УРСГАЛААС ТУСДАА.
 *
 * ⚠️ `qaqcAcl`-ТЭЙ ИЖИЛ ШАЛТГААН, НЭГ ЯЛГААТАЙ (2026-09-07). Чанарын
 * хуваарилалт нь НЭГ үүрэгтэй («хэн бөглөх вэ»), харин хуваарь нь ХОЁР:
 *
 *   · ЗОХИОГЧ  (`plan`)        — огноог төлөвлөж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ  (`planApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь авч болно. Хоёуланг нэг хүнд өгсөн ч ӨӨРИЙГӨӨ
 * БАТЛАХ зам нээгдэхгүй — `huvaariBatlah.decidePlan` зохиогч=батлагч
 * тохиолдлыг татгалзана.
 *
 * ⚠️ ЯАГААД УРСГАЛЫН ТОМИЛГОО (`guitsetgelAcl`) ТОХИРОХГҮЙ ВЭ: тэнд «НЭГ
 * АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэм бий тул хуваарийн батлагчийг
 * томилохын тулд түүнийг гүйцэтгэлийн дөрвөн шатны аль нэгэнд оруулах
 * шаардлагатай болж, тэр нь ГҮЙЦЭТГЭЛ зөвшөөрөх эрх дагуулна. Хуваарь бол
 * ТӨЛӨВЛӨГӨӨ — өөр асуулт, өөр хариуцлага.
 *
 * ⚠️ ЛОГИК НЬ `scopedAcl.ts`-Д (2026-09-09) — `qaqcAcl` · `obyemAcl`-тай
 * хуваалцсан цөм. `obyemAcl`-тай нэрээс бусад БҮРЭН ижил байсан (тэмдэгтийн
 * нэрээр солиод `diff` хийхэд ялгаа гарахгүй). Хадгалалт ӨӨРЧЛӨГДӨӨГҮЙ:
 * `localStorage` түлхүүр, `__huvaari__:` угтвар, JSON хэлбэр бүгд хэвээр.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { huvaariUpsert, huvaariRemove } from './permsRemote';

export { ALL_BAGTS };

/** Хуваарийн хоёр үүрэг */
export type PlanRole = 'author' | 'approver';

/** Нэг аккаунтын хуваарийн хуваарилалт */
export type HuvaariAssign = Assign<PlanRole>;

const acl = makeAcl<PlanRole>({
  storeKey: 'selbe-huvaari-acl-v1',
  event: 'selbe-huvaari-acl-change',
  /* ⚠️ ҮҮРЭГ → ЭРХ. `CAP_HOST_VIEW`-ээр хоёулаа «Хуваарь» харагдацыг нээнэ. */
  roleCaps: { author: 'plan', approver: 'planApprove' },
  push: (user, roles, bagts, grants) => huvaariUpsert(user, roles, bagts, grants),
  remove: huvaariRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noRole: 'Дор хаяж нэг үүрэг сонгоно уу',
    noBagts: 'Багц сонгоно уу',
  },
});

export const listHuvaariAssigns = (): HuvaariAssign[] => acl.list();
export const huvaariFailedUsers = acl.failedUsers;
export const subscribeHuvaariAcl = acl.subscribe;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteHuvaari = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<PlanRole>[] }[],
): void => acl.syncRemote(rows);

/** Аккаунтад хуваарийн үүрэг ба багц олгох / шинэчлэх */
export const setHuvaariAssign = (
  user: string, roles: PlanRole[], bagts: string[], grant = true,
) => acl.set(user, roles, bagts, grant);

/**
 * ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ.
 * ⚠️ `setHuvaariAssign` нь бүх үүрэгт ИЖИЛ багц өгдөг тул «Багц 1-д зохиогч,
 *    Багц 5-д батлагч» гэдгийг илэрхийлж чадахгүй. Энэ нь чадна.
 */
export const setHuvaariGrants = (
  user: string, grants: Grant<PlanRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Тухайн хэрэглэгчийн хуваарилалт ЯГ ХЭВЭЭР (байхгүй бол `null`) */
export const huvaariGrantsOf = acl.grantsOf;

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeHuvaariAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeHuvaariAssign = acl.purge;

/** Тухайн хэрэглэгчийн ХУВААРИЙН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const huvaariScope = (user: string | null | undefined, role: PlanRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasPlanRole = acl.hasRole;
