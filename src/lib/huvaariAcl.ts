'use client';

/**
 * ХУВААРИЙН БАГЦЫН ХУВААРИЛАЛТ — ГҮЙЦЭТГЭЛИЙН УРСГАЛААС ТУСДАА.
 *
 *   · ЗОХИОГЧ  (`plan`)        — огноог төлөвлөж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ  (`planApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь авч болно. Хоёуланг нэг хүнд өгсөн ч ӨӨРИЙГӨӨ
 * БАТЛАХ зам нээгдэхгүй — `huvaariBatlah.decidePlan` зохиогч=батлагч
 * тохиолдлыг татгалзана.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { huvaariUpsert, huvaariRemove, scopedRead } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';
import { t as tr } from './i18nCore';
import { listUsers } from './permissions';
import { portalMissing } from './portalPresence';
import { AUTH, roleForUser } from './services';
import { currentUser, writeGuardsOn } from './who';

export { ALL_BAGTS };

/**
 * Хуваарийн хоёр үүрэг.
 */
export type PlanRole = 'author' | 'approver';

/** Нэг аккаунтын хуваарийн хуваарилалт */
export type HuvaariAssign = Assign<PlanRole>;

/**
 * НЭГ БАГЦАД НЭГ ЗОХИОГЧ, НЭГ БАТЛАГЧ (2026-11-18, хэрэглэгч). Хоёр хүн нэг багцын ноорогийг зэрэг засахад засвар нь бие
 * биеэ дардаг байсан тул багц бүрд үүрэг тус бүр ГАНЦ аккаунттай. `others` — бусад аккаунтын хуваарилалт (порталд байхгүй
 * болсон аккаунт тооцогдохгүй). «Бүх багц» нь багц бүртэй давхцана. Цэвэр — `huvaariAcl.check.mjs`.
 */
export function planRoleConflict(
  next: readonly Grant<PlanRole>[], others: readonly HuvaariAssign[],
): { role: PlanRole; bagts: string; user: string } | null {
  for (const g of next) {
    if (g.role !== 'author' && g.role !== 'approver') continue;
    for (const o of others) {
      for (const og of o.grants) {
        if (og.role !== g.role || !g.bagts.length || !og.bagts.length) continue;
        const mineAll = g.bagts.includes(ALL_BAGTS), theirsAll = og.bagts.includes(ALL_BAGTS);
        /* давхцсан багц: хоёулаа «бүх багц» → бүх багц; нэг нь «бүх багц» → нөгөөгийн эхний багц; эс бөгөөс огтлолцол */
        const hit = mineAll && theirsAll ? ALL_BAGTS
          : mineAll ? og.bagts[0]
            : theirsAll ? g.bagts[0]
              : g.bagts.find((b) => og.bagts.includes(b));
        if (hit != null) return { role: g.role, bagts: hit, user: o.user };
      }
    }
  }
  return null;
}

/** Дүрэм асаалттай эсэх — ЗӨВХӨН ерөнхий (бүх системийн) ACL тестүүд унтраана (`_setPlanOneRule`); аппд үргэлж асаалттай */
let oneRule = true;
export const _setPlanOneRule = (on: boolean): void => { oneRule = on; };

const acl = makeAcl<PlanRole>({
  conflict: (_user, next, others) => {
    if (!oneRule) return null;
    /* Enterprise порталд АЛГА гэж батлагдсан аккаунт л тооцогдохгүй (жагсаалт уншигдаагүй үед дүрэм сулрахгүй) */
    const c = planRoleConflict(next, others.filter((o) => !portalMissing(o.user.trim().toLowerCase())));
    if (!c) return null;
    const where = c.bagts === ALL_BAGTS ? tr('бүх багц') : tr(c.bagts);
    return c.role === 'author'
      ? tr('«{0}»-д зохиогч аль хэдийн томилогдсон: {1}. Нэг багцад нэг зохиогч байна — эхлээд түүнийг хасна уу.', where, c.user)
      : tr('«{0}»-д батлагч аль хэдийн томилогдсон: {1}. Нэг багцад нэг батлагч байна — эхлээд түүнийг хасна уу.', where, c.user);
  },
  storeKey: 'selbe-huvaari-acl-v1',
  event: 'selbe-huvaari-acl-change',
  roleCaps: ROLE_CAPS.huvaari,
  push: (user, roles, bagts, grants) => huvaariUpsert(user, roles, bagts, grants),
  remove: huvaariRemove,
  read: (user) => scopedRead('huvaari', user),
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

/**
 * ХУВААРИЙН ХҮСНЭГТЭД БИЧИХ ЭРХ (2026-11-19, аудит) — тэр багцын зохиогч эсвэл батлагч биш бол шиднэ. Сарын ба долоо
 * хоногийн обьёмын хадгалалт урьд нь зөвхөн дэлгэцийн товчоор хамгаалагддаг байсан — «Хуваарь»-ийг зөвхөн ХАРАХ эрхтэй хүн
 * функцийг шууд дуудаж аль ч багцад бичиж чаддаг байв. Нэвтрэлт унтраалттай (локал dev) ба Node орчинд шалгахгүй.
 * `group` — багцын нэр («Багц 1»); мэдэгдэхгүй бол аль нэг багцад үүрэгтэй байхыг шаардана.
 */
export function requirePlanWrite(group: string | null): void {
  if (!writeGuardsOn() || typeof window === 'undefined' || !AUTH.appId) return;
  const u = currentUser();
  const ok = (['author', 'approver'] as const).some((role) => {
    const sc = acl.scope(u, role);
    return group == null ? sc == null || sc.length > 0 : sc == null || sc.includes(group);
  });
  if (!ok) throw new Error(tr('Энэ багцын хуваарьт бичих эрхгүй — зохиогч эсвэл батлагчаар томилогдсон байх ёстой.'));
}

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasPlanRole = acl.hasRole;

/** Порталд БАЙГАА аккаунт уу — эрхийн жагсаалтад бий (устгагдаагүй) БА Enterprise порталд алга гэж батлагдаагүй */
const liveAccount = (u: string): boolean => {
  const k = u.trim().toLowerCase();
  return !portalMissing(k) && listUsers().some((x) => x.username.trim().toLowerCase() === k);
};

/**
 * БАГЦЫН БАТЛАГЧИД (2026-10-09) — хуваарилалтаар «Батлагч» үүрэгтэй, тэр багц (эсвэл бүх багц) заасан
 * аккаунтууд, эрэмбэлсэн. Зөвхөн МЭДЭЭЛЭЛ («хүлээгдэж буй илгээлтийг хэн батлах вэ») — эрхийн шалгалт
 * биш (`huvaariScope`/`decidePlan`); super (хуваарилалтаас үл хамаарна) жагсаалтад орохгүй (`planAdminCanApprove`).
 */
export const planApproversOf = (group: string): string[] =>
  listHuvaariAssigns()
    .filter((a) => a.grants.some((g) => g.role === 'approver' && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(group))))
    .map((a) => a.user)
    .filter(liveAccount)
    .sort();

/**
 * Энгийн батлагч алга үед АДМИН (super — хүрээ хязгааргүй, `huvaariScope` → `null`) батлах боломжтой юу (2026-10-23).
 * Илгээсэн зохиогч (`author`) өөрийгөө батлахгүй тул тоологдохгүй; устгагдсан/порталд алга super ч тоологдохгүй.
 */
export const planAdminCanApprove = (author: string): boolean => {
  const a = author.trim().toLowerCase();
  return listUsers().some((x) => {
    const k = x.username.trim().toLowerCase();
    return k !== a && roleForUser(k) === 'super' && !portalMissing(k);
  });
};
