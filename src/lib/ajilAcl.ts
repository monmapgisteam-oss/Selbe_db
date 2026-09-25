'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАГЦЫН ХУВААРИЛАЛТ.
 *
 * ⚠️ `obyemAcl.ts`-ТЭЙ ИЖИЛ БҮТЭЦ, ӨӨР АСУУЛТ (2026-09-22). Обьём нь БАЙГАА
 * мөрийн хэмжээг («хэр их»), энэ нь мөр ӨӨРӨӨ гэрээнд байх эсэхийг («юу»)
 * шийднэ. Хоёр үүрэгтэй:
 *
 *   · ЗАСВАРЛАГЧ (`addRow`)      — «Гүйцэтгэл бөглөх» хуудсанд шинэ ажлын
 *                                  мөр нэмж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ    (`ajilApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь эзэмшиж болно (жижиг багцад хэвийн), гэхдээ
 * ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй — `ajilBatlah.decideAjil` зохиогч=батлагч
 * тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
 *
 * ⚠️ ЗАСВАРЛАГЧИЙН ЭРЭГ НЬ `addRow` — ШИНЭ эрх ЗОХИООГҮЙ. Тэр эрх нь «мөр
 * нэмэх»-ийг аль хэдийн зохицуулдаг бөгөөд `FillNew` дотор хэрэглэгддэг
 * (`FillNew.tsx:1275`). Шинээр `ajilEdit` гаргавал одоо мөр нэмж чаддаг бүх
 * хүн ЧИМЭЭГҮЙ эрхээ алдана.
 *
 * ⚠️ ЯАГААД ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`guitsetgelAcl`) ТУСДАА ВЭ: тэнд «НЭГ
 * АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэм бий тул нэмэлт ажлын батлагчийг
 * томилохын тулд түүнийг дөрвөн шатны аль нэгэнд оруулах шаардлагатай болж,
 * тэр нь ГҮЙЦЭТГЭЛ зөвшөөрөх эрх дагуулна. Гэрээний хамрах хүрээ бол
 * гүйцэтгэлийн хэмжилт биш, өөр хариуцлага.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__ajil__:` угтвартай мөрөнд
 * (`__flow__:` / `__cap__:` / `__qaqc__:` / `__huvaari__:` / `__obyem__:` /
 * `__chanar__:`-ийн адил). Шинэ үйлчилгээ, шинэ багана хэрэггүй.
 *
 * ⚠️ ЛОГИК НЬ `scopedAcl.ts`-Д — `qaqcAcl` · `huvaariAcl` · `obyemAcl` ·
 * `chanarAcl`-тай хуваалцсан цөм.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { ajilUpsert, ajilRemove } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';

export { ALL_BAGTS };

/** Нэмэлт ажлын хоёр үүрэг */
export type AjilRole = 'editor' | 'approver';

/** Нэг аккаунтын нэмэлт ажлын хуваарилалт */
export type AjilAssign = Assign<AjilRole>;

const acl = makeAcl<AjilRole>({
  storeKey: 'selbe-ajil-acl-v1',
  event: 'selbe-ajil-acl-change',
  /* ⚠️ ҮҮРЭГ → ЭРХ. `editor` нь БАЙГАА `addRow` эрхийг дахин ашиглана
     (шинэ эрх зохиовол одоогийн мөр нэмэгчид эрхээ алдана — файлын ⚠️).
     ⚠️ Зураглал нь `aclRoleCaps.ts`-д НЭГ газар (2026-09-25). */
  roleCaps: ROLE_CAPS.ajil,
  push: (user, roles, bagts, grants) => ajilUpsert(user, roles, bagts, grants),
  remove: ajilRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noRole: 'Дор хаяж нэг үүрэг сонгоно уу',
    noBagts: 'Багц сонгоно уу',
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
 * ⚠️ `setAjilAssign` нь бүх үүрэгт ИЖИЛ багц өгдөг тул «Багц 1-д зохиогч,
 *    Багц 5-д батлагч» гэдгийг илэрхийлж чадахгүй. Энэ нь чадна.
 */
export const setAjilGrants = (
  user: string, grants: Grant<AjilRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

/** Тухайн хэрэглэгчийн хуваарилалт ЯГ ХЭВЭЭР (байхгүй бол `null`) */
export const ajilGrantsOf = acl.grantsOf;

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeAjilAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeAjilAssign = acl.purge;

/** Тухайн хэрэглэгчийн НЭМЭЛТ АЖЛЫН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const ajilScope = (user: string | null | undefined, role: AjilRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasAjilRole = acl.hasRole;
