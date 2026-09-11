'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАГЦЫН ХУВААРИЛАЛТ.
 *
 * ⚠️ `huvaariAcl.ts`-ТЭЙ ИЖИЛ БҮТЭЦ, ӨӨР АСУУЛТ (2026-09-08). Хуваарь нь
 * ОГНООГ («хэзээ»), энэ нь ОБЬЁМЫГ («хэр их») төлөвлөнө. Хоёр үүрэгтэй:
 *
 *   · ЗАСВАРЛАГЧ (`obyemEdit`)    — «Инженерийн төлөвлөсөн обьём» баганын
 *                                   нүднүүдийг засаж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ    (`obyemApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь эзэмшиж болно (жижиг багцад хэвийн), гэхдээ
 * ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй — `obyemBatlah.decideObyem` зохиогч=батлагч
 * тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
 *
 * ⚠️ ЯАГААД ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`guitsetgelAcl`) ТУСДАА ВЭ: тэнд «НЭГ
 * АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэм бий тул обьёмын батлагчийг томилохын
 * тулд түүнийг дөрвөн шатны аль нэгэнд оруулах шаардлагатай болж, тэр нь
 * ГҮЙЦЭТГЭЛ зөвшөөрөх эрх дагуулна. Төлөвлөсөн обьём бол ТӨЛӨВЛӨГӨӨ —
 * гүйцэтгэлийн хэмжилт биш, өөр хариуцлага.
 *
 * ⚠️ ЯАГААД ХУВААРИЙН (`huvaariAcl`) ЭРХИЙГ ДАХИН АШИГЛААГҮЙ ВЭ: тэр нь
 * «Хуваарь» харагдацын огноог засах эрх бөгөөс `huvaariBatlah` нь багц бүрд
 * ЗӨВХӨН НЭГ хүлээгдэж буй илгээлт зөвшөөрдөг. Обьём ба огноог нэг илгээлтэд
 * нийлүүлбэл нэг нь буцаагдахад нөгөө нь ч гацна. Мөн энэ багана нь өөр
 * ХУУДСАНД («Гүйцэтгэл бөглөх») тул харагдацын эрх ч өөр.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__obyem__:` угтвартай мөрөнд
 * (`__flow__:` / `__cap__:` / `__qaqc__:` / `__huvaari__:`-ийн адил). Шинэ
 * үйлчилгээ, шинэ багана хэрэггүй.
 *
 * ⚠️ ЛОГИК НЬ `scopedAcl.ts`-Д (2026-09-09) — `qaqcAcl` · `huvaariAcl`-тай
 * хуваалцсан цөм. `huvaariAcl`-тай нэрээс бусад БҮРЭН ижил байсан. Хадгалалт
 * ӨӨРЧЛӨГДӨӨГҮЙ: түлхүүр, угтвар, JSON хэлбэр бүгд хэвээр.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { obyemUpsert, obyemRemove } from './permsRemote';

export { ALL_BAGTS };

/** Обьёмын хоёр үүрэг */
export type ObyemRole = 'editor' | 'approver';

/** Нэг аккаунтын обьёмын хуваарилалт */
export type ObyemAssign = Assign<ObyemRole>;

const acl = makeAcl<ObyemRole>({
  storeKey: 'selbe-obyem-acl-v1',
  event: 'selbe-obyem-acl-change',
  /* ⚠️ ҮҮРЭГ → ЭРХ. Хоёулаа «Гүйцэтгэл» харагдацыг нээнэ (`CAP_HOST_VIEW`). */
  roleCaps: { editor: 'obyemEdit', approver: 'obyemApprove' },
  push: (user, roles, bagts, grants) => obyemUpsert(user, roles, bagts, grants),
  remove: obyemRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noRole: 'Дор хаяж нэг үүрэг сонгоно уу',
    noBagts: 'Багц сонгоно уу',
  },
});

export const listObyemAssigns = (): ObyemAssign[] => acl.list();
export const obyemFailedUsers = acl.failedUsers;
export const subscribeObyemAcl = acl.subscribe;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteObyem = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<ObyemRole>[] }[],
): void => acl.syncRemote(rows);

/** Аккаунтад обьёмын үүрэг ба багц олгох / шинэчлэх */
export const setObyemAssign = (
  user: string, roles: ObyemRole[], bagts: string[], grant = true,
) => acl.set(user, roles, bagts, grant);

/**
 * ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ.
 * ⚠️ `setObyemAssign` нь бүх үүрэгт ИЖИЛ багц өгдөг тул «Багц 1-д зохиогч,
 *    Багц 5-д батлагч» гэдгийг илэрхийлж чадахгүй. Энэ нь чадна.
 */
export const setObyemGrants = (
  user: string, grants: Grant<ObyemRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Тухайн хэрэглэгчийн хуваарилалт ЯГ ХЭВЭЭР (байхгүй бол `null`) */
export const obyemGrantsOf = acl.grantsOf;

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeObyemAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeObyemAssign = acl.purge;

/** Тухайн хэрэглэгчийн ОБЬЁМЫН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const obyemScope = (user: string | null | undefined, role: ObyemRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasObyemRole = acl.hasRole;
