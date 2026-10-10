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
 * ⚠️ `tuh` · `chanar` · `habea` · `tug` · `cheng` нь `chanarMs.Reviewer`-тэй ЯГ ИЖИЛ нэр —
 *    хоёр газар зөрвөл хянагч товчоо олохгүй.
 * ⚠️ Төрөл бүрд АЛЬ үүрэг хянадгийг `chanarMs.REVIEWERS_OF` заана — ACL нь
 *    зөвхөн «энэ хүн энэ багцад энэ үүрэгтэй» гэдгийг мэднэ.
 */
export type ChanarRole = 'author' | 'tuh' | 'chanar' | 'habea' | 'tug' | 'cheng';
export const CHANAR_ROLES: readonly ChanarRole[] = ['author', 'tuh', 'chanar', 'habea', 'tug', 'cheng'];

export type ChanarAssign = Assign<ChanarRole>;

const acl = makeAcl<ChanarRole>({
  storeKey: 'selbe-chanar-acl-v1',
  event: 'selbe-chanar-acl-change',
  /*
   * ⚠️ ҮҮРЭГ → ЭРХ. Тавуулаа «Чанарын баримт» харагдацыг нээнэ
   *    (`CAP_HOST_VIEW`). Хянагч дөрөв НЭГ эрх (`chanarReview`) хуваалцана —
   *    аль хянагч гэдгийг эрх биш ЭНЭ хуваарилалт заана. Гурван тусдаа эрх
   *    үүсгэвэл `caps.ts`-д ижил утгатай гурван мөр нэмэгдэж, харин
   *    «хэн ТУХ вэ» гэдгийг тэндээс ялгах боломжгүй хэвээр үлдэнэ.
   * ⚠️ Зураглал нь `aclRoleCaps.ts`-д НЭГ газар (2026-09-25).
   */
  roleCaps: ROLE_CAPS.chanar,
  push: (user, roles, bagts, grants) => chanarUpsert(user, roles, bagts, grants),
  remove: chanarRemove,
  /* ⚠️ 2026-10-04: бичихийн өмнө шинээр уншиж нэгтгэнэ (`scopedAcl.pushRow`) */
  read: (user) => scopedRead('chanar', user),
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

export const listChanarAssigns = (): ChanarAssign[] => acl.list();
export const chanarFailedUsers = acl.failedUsers;
export const subscribeChanarAcl = acl.subscribe;
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const chanarAclReady = acl.ready;

/** REMOTE-ООС ИРСЭН хуваарилалт — `permissions.initRemote` дуудна */
export const _syncRemoteChanar = (
  rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
): void => acl.syncRemote(rows);

/* ⚠️ 2026-10-09 (аудит №6): `setChanarAssign` (бүх үүрэгт ижил багц) · `chanarGrantsOf` · `hasChanarRole`
   ҮХМЭЛ байсан (src/tools/docs-д дуудагчгүй) — устгав. Панел `setChanarGrants`-ыг л хэрэглэнэ;
   `chanarScope` parity тестэд хэрэгтэй тул ҮЛДЭНЭ. */

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
 * ⚠️ `author`-ыг ОРУУЛАХГҮЙ: тэр нь хянагч биш.
 * ⚠️ `null` (хязгааргүй: super, дев) бол ТАВУУЛАА — админ аль ч үүргээр
 *    хянаж чадна, гэхдээ `review()` зохиогч=хянагчийг мөн л татгалзана.
 * ⚠️ Төрөлд хамаагүй үүрэг ч буцаагдана (MS-д `tug`) — `chanarMs.canAct`
 *    `REVIEWERS_OF[kind]`-аар шүүнэ.
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
