'use client';

/**
 * ЧАНАРЫН (QAQC) БАГЦЫН ХУВААРИЛАЛТ — ГҮЙЦЭТГЭЛИЙН УРСГАЛААС БҮРЭН ТУСДАА.
 *
 * ⚠️ ЯАГААД ТУСДАА ДЭД СИСТЕМ ВЭ (2026-09-07). Урьд нь «Чанар (QAQC)» хуудас
 * багцаа `guitsetgelAcl.bagtsScope`-оос авдаг байв — өөрөөр хэлбэл урсгалын
 * ДӨРВӨН ШАТНЫ томилгооноос. Үүнээс гарах мухардал:
 *
 *   · `setAssign` нь «НЭГ АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэмтэй —
 *     чанарын хяналтын ажилтанд багц өгөхийн тулд түүнийг гүйцэтгэгч /
 *     инженер / менежер / захирлын АЛЬ НЭГЭНД томилох ёстой болдог.
 *   · Тэгмэгц тэр хүн `resolveFlowStage`-ээр гүйцэтгэлийг ЗӨВШӨӨРӨХ/БУЦААХ
 *     эрхтэй болно. Энэ нь `caps.ts`-д бичигдсэн үндсэн санааг («чанарын
 *     баримтыг гүйцэтгэгч биш, чанарын хяналтын ажилтан хөтөлнө … нэг эрхэнд
 *     нийлүүлбэл хэн юуг баталсан нь замхарна») шууд зөрчинө.
 *   · Хэрэв тэр хүн өмнө нь өөр шатанд байсан бол ТЭР ТОМИЛГОО нь чимээгүй
 *     ХАСАГДАНА — QAQC багц өгөх гэсэн үйлдэл урсгалын хяналтыг эвдэнэ.
 *   · `qaqc` эрх нь `CAP_HOST_VIEW`-ээр харагдацыг нээдэг ч багц нь урсгалаас
 *     гардаг тул хуудас нээгдээд ХООСОН үлддэг байв — эрх нь өөрөө ажиллах
 *     чадваргүй.
 *
 * ⚠️ ЛОГИК НЬ `scopedAcl.ts`-Д (2026-09-09). Чанар · Хуваарь · Обьём гурав
 * нь нэрээс бусад бүрэн ижил ~250 мөр байсныг нэг цөм болгов — тэр
 * давхардлаас 2026-09-08 · 09-нд НИЙТ 9 алдаа гарсан («засвар нь ижил кодын
 * НЭГД нь л хүрч, бусад руу хуулагдаагүй»). Хадгалалт нь ӨӨРЧЛӨГДӨӨГҮЙ:
 * `localStorage` түлхүүр, `__qaqc__:` мөрийн угтвар, JSON хэлбэр бүгд хэвээр.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { makeAcl, ALL_BAGTS } from './scopedAcl';
import { qaqcUpsert, qaqcRemove } from './permsRemote';

export { ALL_BAGTS };

/** Нэг аккаунтын чанарын багцын хуваарилалт */
export type QaqcAssign = { user: string; bagts: string[] };

/**
 * ⚠️ ҮҮРЭГГҮЙ СИСТЕМ: чанарын хуваарилалт нь ганц асуултад хариулна («хэн
 * бөглөх вэ»). Хуваарь · Обьём хоёр нь ХОЁР үүрэгтэй (зохиогч · батлагч)
 * тул тэдэнд `roleCaps` дүүрэн байна.
 */
const acl = makeAcl<never>({
  storeKey: 'selbe-qaqc-acl-v1',
  event: 'selbe-qaqc-acl-change',
  roleCaps: {} as Record<never, never>,
  soleCap: 'qaqc',
  /* ⚠️ Чанар нь ҮҮРЭГГҮЙ систем — `grants` нь үргэлж ганц мөр тул
     хуучин хэлбэрийн `bagts` нь мэдээлэл алдахгүй, задлах шаардлагагүй. */
  push: (user, _roles, bagts) => qaqcUpsert(user, bagts),
  remove: qaqcRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noBagts: 'Багц сонгоно уу',
  },
});

/*
 * ⚠️ ГАДНА ТАЛД ХАВТГАЙ ХЭВЭЭР (2026-09-09). Цөм нь `grants`-аар ажилладаг
 *    ч Чанар нь ҮҮРЭГГҮЙ тул grant үргэлж ГАНЦ мөр байна. Тиймээс энэ
 *    модулийн API-г өөрчлөх шаардлагагүй — дуудагчид `bagts` л хэрэгтэй.
 */
export const listQaqcAssigns = (): QaqcAssign[] =>
  acl.list().map((a) => ({ user: a.user, bagts: a.grants.flatMap((g) => g.bagts) }));
export const qaqcFailedUsers = acl.failedUsers;
export const subscribeQaqcAcl = acl.subscribe;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteQaqc = (rows: { user: string; bagts: string[] }[]): void =>
  acl.syncRemote(rows);

/** Аккаунтад чанарын багц олгох / шинэчлэх */
export const setQaqcAssign = (user: string, bagts: string[], grant = true) =>
  acl.set(user, [], bagts, grant);

/** Хуваарилалтаас хасах — `revoke: false` бол `qaqc` эрхийг үлдээнэ */
export const removeQaqcAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeQaqcAssign = acl.purge;

/** Тухайн хэрэглэгчийн ЧАНАРЫН багцууд (`null` = хязгааргүй) */
export const qaqcScope = (user: string | null | undefined) => acl.scope(user);
