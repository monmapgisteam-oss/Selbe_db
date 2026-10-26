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
 * томилохын тулд түүнийг гүйцэтгэлийн долоон шатны (2026-10-23) аль нэгэнд оруулах
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
import { huvaariUpsert, huvaariRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';
/* ⚠️ 2026-10-23: батлагчийн жагсаалтаас устгагдсан / порталд алга аккаунтыг хасахад (`planApproversOf`) */
import { listUsers } from './permissions';
import { portalMissing } from './portalPresence';
import { roleForUser } from './services';

export { ALL_BAGTS };

/**
 * Хуваарийн хоёр үүрэг.
 * ⚠️ 2026-10-26 (хэрэглэгч: «Харагч хэрэггүй»): түр нэмэгдсэн `viewer` («Харагч») үүрэг ХАСАГДСАН. ArcGIS-ийн мөрөнд
 *    `viewer` grant үлдсэн байвал `makeAcl` танигдахгүй үүрэг гэж ЧИМЭЭГҮЙ хаяна (эрх/хүрээ нээхгүй, анхааруулгагүй).
 *    Хуваарь ХАРАХ хүрээ нь эрхийн төрлийн «Хуваарь харах» + зохиогч/батлагчийн багц (`huvaariView.huvaariViewScope`).
 */
export type PlanRole = 'author' | 'approver';

/** Нэг аккаунтын хуваарийн хуваарилалт */
export type HuvaariAssign = Assign<PlanRole>;

const acl = makeAcl<PlanRole>({
  storeKey: 'selbe-huvaari-acl-v1',
  event: 'selbe-huvaari-acl-change',
  /* ⚠️ ҮҮРЭГ → ЭРХ. `CAP_HOST_VIEW`-ээр хоёулаа «Хуваарь» харагдацыг нээнэ.
     ⚠️ Зураглал нь `aclRoleCaps.ts`-д НЭГ газар (2026-09-25). */
  roleCaps: ROLE_CAPS.huvaari,
  push: (user, roles, bagts, grants) => huvaariUpsert(user, roles, bagts, grants),
  remove: huvaariRemove,
  /* ⚠️ 2026-10-04: бичихийн өмнө шинээр уншиж нэгтгэнэ (`scopedAcl.pushRow`) */
  read: (user) => scopedRead('huvaari', user),
  /* ⚠️ 2026-10-09 (аудит №6): GETTER — `qaqcAcl`-ийн 2026-09-25-ны загвар. Урьд нь энгийн мөр байсан тул
     `tr()`-гүй, англи хэлээр ч монголоор гарч, i18n гаргагчид ч ороогүй байв. `tr()`-ийг мессеж
     уншигдах агшинд дуудна (модуль ачаалахад биш) — хэл солиход зөв хувилбар. */
  msg: {
    get noUser() { return tr('Аккаунтын нэрээ бичнэ үү'); },
    get superUser() { return tr('Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй'); },
    get noRole() { return tr('Дор хаяж нэг үүрэг сонгоно уу'); },
    get noBagts() { return tr('Багц сонгоно уу'); },
  },
});

export const listHuvaariAssigns = (): HuvaariAssign[] => acl.list();
export const huvaariFailedUsers = acl.failedUsers;
export const subscribeHuvaariAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const huvaariAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteHuvaari = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
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

/** Унасан бичилтийг дахин илгээх (2026-10-01) — `scopedAcl.retry` */
export const retryHuvaariAssign = acl.retry;

/** Тухайн хэрэглэгчийн ХУВААРИЙН багцууд — ТУХАЙН ҮҮРГЭЭР */
export const huvaariScope = (user: string | null | undefined, role: PlanRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasPlanRole = acl.hasRole;

/** Порталд БАЙГАА аккаунт уу — эрхийн жагсаалтад бий (устгагдаагүй) БА Enterprise порталд алга гэж батлагдаагүй */
const liveAccount = (u: string): boolean => {
  const k = u.trim().toLowerCase();
  return !portalMissing(k) && listUsers().some((x) => x.username.trim().toLowerCase() === k);
};

/**
 * БАГЦЫН БАТЛАГЧИД (2026-10-09) — хуваарилалтаар «Батлагч» үүрэгтэй, тэр багц (эсвэл бүх багц) заасан
 * аккаунтууд, эрэмбэлсэн. ⚠️ Зөвхөн МЭДЭЭЛЭЛ («хүлээгдэж буй илгээлтийг хэн батлах вэ») — эрхийн шалгалт
 * биш (`huvaariScope`/`decidePlan`); super (хуваарилалтаас үл хамаарна) жагсаалтад орохгүй (`planAdminCanApprove`).
 * ⚠️ 2026-10-23 (хэрэглэгч: «бүгдийг зас»): УСТГАГДСАН (эрхийн жагсаалтад алга) ба ПОРТАЛД АЛГА аккаунтыг хасна —
 *    урьд нь тэдний үлдсэн мөр «батлагч: X» гэж харагдаж, зохиогч нэвтэрч чадахгүй хүнд хандахаар хүлээдэг байв.
 */
export const planApproversOf = (group: string): string[] =>
  listHuvaariAssigns()
    .filter((a) => a.grants.some((g) => g.role === 'approver' && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(group))))
    .map((a) => a.user)
    .filter(liveAccount)
    .sort();

/**
 * Энгийн батлагч алга үед АДМИН (super — хүрээ хязгааргүй, `huvaariScope` → `null`) батлах боломжтой юу (⚠️ 2026-10-23).
 * Илгээсэн зохиогч (`author`) өөрийгөө батлахгүй тул тоологдохгүй; устгагдсан/порталд алга super ч тоологдохгүй.
 */
export const planAdminCanApprove = (author: string): boolean => {
  const a = author.trim().toLowerCase();
  return listUsers().some((x) => {
    const k = x.username.trim().toLowerCase();
    return k !== a && roleForUser(k) === 'super' && !portalMissing(k);
  });
};
