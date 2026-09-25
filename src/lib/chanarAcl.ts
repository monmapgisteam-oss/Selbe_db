'use client';

/**
 * ЧАНАРЫН БАРИМТЫН (MS · MA · MIR · FIC · NCR) ҮҮРЭГ, БАГЦЫН ХУВААРИЛАЛТ.
 *
 * ⚠️ `qaqcAcl`-ААС ТУСДАА ДЭД СИСТЕМ (2026-09-16). Тэр нь Inspection Test
 * Plan-ийн 9 баганыг бөглөх ГАНЦ үүрэгтэй асуулт («хэн бөглөх вэ»). Энэ нь
 * зураглалын ДӨРВӨН эгнээ: гүйцэтгэгч ирүүлнэ, ТУХ · Чанар · ХАБЭА гурав
 * ЗЭРЭГЦЭЭ хянана. Нэг эрхэнд нийлүүлбэл «ITP бөглөдөг хүн аргачлал батална»
 * гэсэн утгагүй хамаарал үүснэ.
 *
 * ⚠️ ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН (`guitsetgelAcl`) ТОМИЛГОО ТОХИРОХГҮЙ — тэнд «нэг
 * аккаунт нэг шатанд» дүрэмтэй бөгөөд шатууд ДАРААЛСАН. Энд гурван хянагч
 * зэрэгцээ тул нэг хүн `tuh` ба `habea` хоёуланг нь авч болно (жижиг
 * багцад ийм тохиолдол бодитой). ТУХ инженер нь мөн гүйцэтгэлийн урсгалд
 * «инженер» байж болно — хоёр систем бие биедээ нөлөөлөхгүй.
 *
 * ⚠️ ГҮЙЦЭТГЭГЧ ≠ ХЯНАГЧ. Нэг хүнд `author` ба хянагчийн үүргийг зэрэг өгч
 *    БОЛНО (ACL татгалзахгүй), гэхдээ `chanarMs.review` нь `doc.author`-той
 *    ижил нэрийг СЕРВЕРИЙН мөрөөс шалгаж татгалзана — хамгаалалт өгөгдлийн
 *    түвшинд (`huvaariBatlah.decidePlan`-ийн зарчим).
 *
 * ⚠️ ЛОГИК НЬ `scopedAcl.ts`-Д — `qaqcAcl` · `huvaariAcl` · `obyemAcl`-тай
 *    ижил цөм. Энд зөвхөн тохиргоо. (`aclParity.check.mjs` барина.)
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { makeAcl, ALL_BAGTS, type Assign, type Grant } from './scopedAcl';
import { chanarUpsert, chanarRemove } from './permsRemote';
import { ROLE_CAPS } from './aclRoleCaps';

export { ALL_BAGTS };

/**
 * ДӨРВӨН ҮҮРЭГ — зураглалын эгнээнүүд.
 *   author — Гүйцэтгэгч (аргачлал боловсруулж ирүүлнэ)
 *   tuh    — ТУХ-ийн инженер / менежер
 *   chanar — Чанарын хэлтэс
 *   habea  — ХАБЭА-н инженер
 * ⚠️ `tuh` · `chanar` · `habea` нь `chanarMs.Reviewer`-тэй ЯГ ИЖИЛ нэр —
 *    хоёр газар зөрвөл хянагч товчоо олохгүй.
 */
export type ChanarRole = 'author' | 'tuh' | 'chanar' | 'habea';
export const CHANAR_ROLES: readonly ChanarRole[] = ['author', 'tuh', 'chanar', 'habea'];

export type ChanarAssign = Assign<ChanarRole>;

const acl = makeAcl<ChanarRole>({
  storeKey: 'selbe-chanar-acl-v1',
  event: 'selbe-chanar-acl-change',
  /*
   * ⚠️ ҮҮРЭГ → ЭРХ. Дөрвүүлээ «Чанарын баримт» харагдацыг нээнэ
   *    (`CAP_HOST_VIEW`). Хянагч гурав НЭГ эрх (`chanarReview`) хуваалцана —
   *    аль хянагч гэдгийг эрх биш ЭНЭ хуваарилалт заана. Гурван тусдаа эрх
   *    үүсгэвэл `caps.ts`-д ижил утгатай гурван мөр нэмэгдэж, харин
   *    «хэн ТУХ вэ» гэдгийг тэндээс ялгах боломжгүй хэвээр үлдэнэ.
   * ⚠️ Зураглал нь `aclRoleCaps.ts`-д НЭГ газар (2026-09-25).
   */
  roleCaps: ROLE_CAPS.chanar,
  push: (user, roles, bagts, grants) => chanarUpsert(user, roles, bagts, grants),
  remove: chanarRemove,
  msg: {
    noUser: 'Аккаунтын нэрээ бичнэ үү',
    superUser: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй',
    noRole: 'Дор хаяж нэг үүрэг сонгоно уу',
    noBagts: 'Багц сонгоно уу',
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

/** Аккаунтад үүрэг ба багц олгох (бүх үүрэгт ижил багц) */
export const setChanarAssign = (
  user: string, roles: ChanarRole[], bagts: string[], grant = true,
) => acl.set(user, roles, bagts, grant);

/** ҮҮРЭГ БҮРД ӨӨР БАГЦ — панел үүнийг хэрэглэнэ */
export const setChanarGrants = (
  user: string, grants: Grant<ChanarRole>[], grant = true,
) => acl.setGrants(user, grants, grant);

export const chanarGrantsOf = acl.grantsOf;

/** Хуваарилалтаас хасах — `revoke: false` бол эрхийг үлдээнэ */
export const removeChanarAssign = (user: string, revoke = true) => acl.remove(user, revoke);

/** Аккаунт УСТГАХАД мөрийг бүрмөсөн арилгах (эрх буцаахгүй) */
export const purgeChanarAssign = acl.purge;

/** Тухайн хэрэглэгчийн багцууд — ТУХАЙН ҮҮРГЭЭР. `null` = хязгааргүй */
export const chanarScope = (user: string | null | undefined, role: ChanarRole) =>
  acl.scope(user, role);

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasChanarRole = acl.hasRole;

/**
 * Тухайн БАГЦАД хэрэглэгч ЯМАР ХЯНАГЧ вэ — `chanarMs.canAct`-д өгөх жагсаалт.
 * ⚠️ `author`-ыг ОРУУЛАХГҮЙ: тэр нь хянагч биш.
 * ⚠️ `null` (хязгааргүй: super, дев) бол ГУРВУУЛАА — админ аль ч үүргээр
 *    хянаж чадна, гэхдээ `review()` зохиогч=хянагчийг мөн л татгалзана.
 */
export function reviewerRolesFor(
  user: string | null | undefined, bagts: string,
): ('tuh' | 'chanar' | 'habea')[] {
  const out: ('tuh' | 'chanar' | 'habea')[] = [];
  for (const r of ['tuh', 'chanar', 'habea'] as const) {
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
