'use client';

/**
 * ЭРХИЙН ХУВААРИЛАЛТЫН ГАНЦ БИЧИХ ДАВХАРГА — хэрэглэгчийн карт, багц × системийн
 * матриц, бүлгийн панелууд бүгд ЭНДЭЭС бичнэ (2026-09-25).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн баталсан төлөвлөгөө). Нэг хуваарилалтыг урьд нь
 *    ХОЁР газраас засдаг байв: бүлгийн панел (багцаар) ба «Хэрэглэгчид»
 *    самбарын унтраалга (`UserAdmin.flipScoped`, `[ALL]`-аар). Хоёр зам нь
 *    ӨӨР дүрэмтэй тул унтраалга багцын хязгаарыг чимээгүй тэлж, панел нь
 *    түүнийг «бүх багц» гэж харуулдаг байлаа. Одоо нэмэх/хасах бүр нэг
 *    дүрмээр: «Бүх багц» хамгаалалт, багцгүй grant унах, `revoke=false` +
 *    зөвхөн АЛГА БОЛСОН үүргийн эрх буцаах.
 *
 * ⚠️ ХЭЛБЭР: op нь `{ confirm?, run }` — баталгаажуулах асуултууд ба бичилт.
 *    Асуултыг `runOp` асууна (UI биш), тиймээс карт · матриц · панел гурвуулаа
 *    ЯГ ижил асуулт асууна. `null` = хийх зүйлгүй (аль хэдийн тийм).
 *
 * ⚠️ ТЕКСТ: `tr()` зөвхөн op бүтээх агшинд (дарах үед) дуудагдана — модулийн
 *    түвшинд биш (хэл солиход хоцрохгүй).
 *
 * ⚠️ QAQC ба урсгалын шат ЭНД багтсан ч `scopedAcl`-ийн цөмд ОРООГҮЙ — тэдгээр
 *    нь өөр бүтэцтэй (үүрэггүй · «нэг аккаунт нэг шатанд»). `QaqcAcl` ба
 *    `GuitsetgelAcl` панелууд ч (2026-09-25) эдгээр op-оор бичдэг — панел, карт,
 *    матриц гурвуулаа ИЖИЛ асуулт асууна. Сүүлийн багцыг хасахад панел урьд нь
 *    «хасахгүй» гэж зогсоодог байсан — одоо ✕-ийн зам (асууж, эрх буцаана).
 */

import { t as tr } from './i18nCore';
import { listUsers, remoteReady, resolveAccess } from './permissions';
import { roleForUser, VIEWS } from './services';
import type { ErhSource } from './erhOverview';
import { capsOf, capsRemoteReady, toggleCap, type CapKey } from './caps';
import { ALL_BAGTS, type Grant } from './scopedAcl';
import { ROLE_CAPS, type ScopedSys } from './aclRoleCaps';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from './butetsPacks';
import type { Stage } from './hyanalt';
import { STAGE_LABEL } from './hyanaltGroup';
import {
  flowAclReady, flowFailedUsers, listAssigns, removeAssign, setAssign, setViewOnly,
} from './guitsetgelAcl';
import {
  listQaqcAssigns, qaqcAclReady, qaqcFailedUsers, removeQaqcAssign, setQaqcAssign,
} from './qaqcAcl';
import {
  huvaariAclReady, huvaariFailedUsers, listHuvaariAssigns, removeHuvaariAssign, setHuvaariGrants,
  type PlanRole,
} from './huvaariAcl';
import {
  listObyemAssigns, obyemAclReady, obyemFailedUsers, removeObyemAssign, setObyemGrants, type ObyemRole,
} from './obyemAcl';
import {
  ajilAclReady, ajilFailedUsers, listAjilAssigns, removeAjilAssign, setAjilGrants, type AjilRole,
} from './ajilAcl';
import {
  chanarAclReady, chanarFailedUsers, listChanarAssigns, removeChanarAssign, setChanarGrants,
  type ChanarRole,
} from './chanarAcl';
import {
  butetsAclReady, butetsFailedUsers, listButetsAssigns, removeButetsAssign, setButetsGrants,
  type ButetsRole,
} from './butetsAcl';

/** Бичилтийн үр дүн — `scopedAcl.AclWrite`-тай ижил хэлбэр */
export type Write = { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> };

/** Хуваарилалтын мөр — үүрэг бүр өөрийн багцтай */
type Row<R extends string = string> = { user: string; grants: Grant<R>[] };

/**
 * Нэг бичих үйлдэл. `confirm` — дарааллаар асуух асуултууд (аль нэгд нь
 * «Цуцлах» бол юу ч бичихгүй). `error` — бичихээс өмнө татгалзсан.
 */
export type AclOp = { confirm?: string[]; run: () => Write; user?: string } | { error: string } | null;

/* ══════════════════════ Явагдаж буй бичилт (2026-09-25) ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ЯВАГДАЖ БУЙ OP-ЫН ТОО — `runOp` бичилт эхлэхэд нэмж,
 * `sync` (+`granted`) дуусахад хасна.
 * ⚠️ ЯАГААД: хуваарилалт ЛОКАЛД шууд өөрчлөгддөг ч эрх (`__cap__:`) нь
 *    `sync`-ийн ДАРАА олгогдож/буцаагддаг. Тэр хооронд «өнчин эрх» ба «эрх
 *    олгогдоогүй» гэсэн ХУДАЛ анхааруулга гарч, админ «хасах» дарвал дөнгөж
 *    олгосон эрхийг устгах байв. `UserRights` энэ хугацаанд тэмдгийг нуух ба
 *    «хасах»-ыг хаана.
 */
const pending = new Map<string, number>();
const PENDING_EVENT = 'selbe-aclops-pending';
const bump = (u: string, d: number): void => {
  const n = (pending.get(u) ?? 0) + d;
  if (n > 0) pending.set(u, n); else pending.delete(u);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PENDING_EVENT));
};
/** Энэ хэрэглэгчид бичилт явагдаж байна уу */
export const aclPendingFor = (user: string): boolean => pending.has(user.trim().toLowerCase());
export function subscribeAclPending(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PENDING_EVENT, fn);
  return () => window.removeEventListener(PENDING_EVENT, fn);
}

/* ══════════════════════ Түгжээ ══════════════════════ */

/**
 * ЭРХИЙН БҮХ ЕСӨН ЭХ СУРВАЛЖ ЭНЭ СЕШНД УНШИГДСАН УУ — ГАНЦ хуулбар (2026-09-25).
 *
 * ⚠️ Урьд нь `UserAdmin.capsLocked` ба `ErhOverview.locked` хоёр ижил
 *    илэрхийллийг тусад нь бичдэг байв; нэгд нь туг нэмэхэд нөгөө нь хоцорно.
 *    Уншигдаагүй эх сурвалжийн `list*()` нь `[]` тул тэр үед бичвэл хүний
 *    бүх мөрийг нэг багцаар дарж бичнэ (панелуудын 2026-09-23 · 24 ⚠️).
 */
export const allAclReady = (): boolean => remoteReady() && capsRemoteReady() && flowAclReady()
  && qaqcAclReady() && huvaariAclReady() && obyemAclReady() && chanarAclReady()
  && ajilAclReady() && butetsAclReady();

/** Түгжээний зурвас — панелуудын ЯГ ижил текст */
export const lockMsg = (): string => tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');

/* ══════════════ Хасагдсан үүргийн эрхийг буцаах (панелаас шилжсэн) ══════════════ */

/**
 * МӨРИЙГ БҮХЭЛД НЬ ХАСААД ЗӨВХӨН ХАСАГДСАН ҮҮРГИЙН ЭРХИЙГ БУЦААНА (2026-09-24).
 *
 * ⚠️ `remove*Assign(user)`-ийн анхдагч `revoke=true` нь `syncCaps(u, [])` →
 *    `none` горимд тэр системийн `roleCaps` БҮХ эрхийг хасдаг байв: нэмэлт
 *    ажлын батлагчийг хасахад админы гараар олгосон «Мөр нэмэх» (`addRow`) ч
 *    чимээгүй алга болно. Мөрийг `revoke=false`-оор хасаад, `sync` дууссаны
 *    ДАРАА зөвхөн хасагдсан үүргүүдийн эрхийг буцаана.
 * ⚠️ ГҮЙЦЭТГЭХ АГШИНД ДАХИН УНШИНА: дараалалд хүлээх хооронд дахин
 *    хуваарилагдсан үүргийн эрхийг буцаахгүй; нэг эрх рүү заадаг ӨӨР үүрэг
 *    үлдсэн бол (Чанарын гурван хянагч → `chanarReview`) мөн буцаахгүй.
 * ⚠️ 2026-09-25: `ScopedAclPanel.tsx`-ээс ЭНД шилжсэн — карт ба матриц ч
 *    хэрэглэдэг болсон тул UI файлд байх ёсгүй. Логик ӨӨРЧЛӨГДӨӨГҮЙ.
 */
export function removeRevokingRoles<R extends string>(
  user: string,
  list: () => Row<R>[],
  remove: (u: string) => Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  const u = user.trim().toLowerCase();
  const rolesOf = rolesOfUser(list, u);
  const had = rolesOf();
  return revokeGoneRoles(u, had, rolesOf, remove(u), roleCaps);
}

/**
 * ҮҮРГИЙН ЗАРИМЫГ ХАСААД (бусад grant ҮЛДЭНЭ) ХАСАГДСАН ҮҮРГИЙН ЭРХИЙГ БУЦААНА
 * (2026-09-25, аудитын засвар).
 *
 * ⚠️ `removeRevokingRoles`-ийн ХОС. `setGrants`-ийн `syncCaps` нь зөвхөн
 *    ОЛГОДОГ (lib-ийн санаатай дүрэм — гараар олгосныг устгахгүй). Тиймээс
 *    «Багц 1 · Зохиогч, Багц 5 · Батлагч» хүний батлагчийг ✕ дарахад
 *    `planApprove` ҮЛДЭЖ, «Хуваарь батлах» асаалттай хэвээр байв.
 * ⚠️ Үүрэг нь БАГЦ ЦӨӨРӨӨД үлдсэн бол эрх ХЭВЭЭР — зөвхөн үүрэг бүхэлдээ
 *    алга болсон үед л буцаана (`revokeGoneRoles`-ийн дахин уншилт).
 */
export function setGrantsRevokingRoles<R extends string>(
  user: string,
  grants: Grant<R>[],
  list: () => Row<R>[],
  setGrants: (u: string, grants: Grant<R>[]) => Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  const u = user.trim().toLowerCase();
  const rolesOf = rolesOfUser(list, u);
  const had = rolesOf();
  return revokeGoneRoles(u, had, rolesOf, setGrants(u, grants), roleCaps);
}

/** Тухайн хэрэглэгчийн ОДООГИЙН үүргүүд — дуудах агшинд жагсаалтаас уншина */
const rolesOfUser = <R extends string>(list: () => Row<R>[], u: string) =>
  (): Set<string> => new Set((list().find((a) => a.user === u)?.grants ?? []).map((g) => g.role));

/**
 * `sync` дууссаны ДАРАА `had`-д байсан, одоо алга болсон үүргүүдийн эрхийг
 * буцаана — хоёр замын (бүтэн · хэсэгчилсэн хасалт) НИЙТЛЭГ логик.
 * ⚠️ Үлдсэн үүрэг ИЖИЛ эрх рүү заадаг бол (Чанарын гурван хянагч →
 *    `chanarReview`) тэр эрхийг буцаахгүй.
 */
function revokeGoneRoles(
  u: string,
  had: Set<string>,
  rolesOf: () => Set<string>,
  rr: Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  if (!rr.ok || !rr.sync) return rr;
  const sync = rr.sync.then(async (ok) => {
    const cur = rolesOf();
    const caps = new Set<CapKey>();
    for (const r of had) {
      const c = roleCaps[r];
      if (c && !cur.has(r)) caps.add(c);
    }
    for (const r of cur) {
      const c = roleCaps[r];
      if (c) caps.delete(c);
    }
    let all = ok;
    for (const c of caps) all = (await toggleCap(u, c, false)) && all;
    return all;
  });
  return { ...rr, sync };
}

/* ══════════════════════ Систем бүрийн тохиргоо ══════════════════════ */

/** Үүрэгтэй нэг системийн бичих/унших тохиргоо */
export type SysSpec = {
  list: () => Row[];
  failedUsers: () => string[];
  ready: () => boolean;
  setGrants: (u: string, grants: Grant<string>[]) => Write;
  /** ⚠️ ЗААВАЛ `revoke=false` — эрхийг `removeRevokingRoles` буцаана */
  removeNoRevoke: (u: string) => Write;
  roleCaps: Readonly<Partial<Record<string, CapKey>>>;
  roles: readonly string[];
  /** Багцын олонлог — `PKG_GROUPS`, дэд бүтцэд `BUTETS_PACKS` түлхүүр */
  universe: () => string[];
};

/**
 * ТАВАН ҮҮРЭГТЭЙ СИСТЕМ — нэг хүснэгтэд.
 * ⚠️ Cast (`as Grant<PlanRole>[]`) нь аюулгүй: `setGrants` цөм нь танигдахгүй
 *    үүргийг `ROLES.has()`-ээр өөрөө хаядаг (`scopedAcl.setGrants`).
 */
export const SCOPED_SYS: Record<ScopedSys, SysSpec> = {
  huvaari: {
    list: listHuvaariAssigns, failedUsers: huvaariFailedUsers, ready: huvaariAclReady,
    setGrants: (u, g) => setHuvaariGrants(u, g as Grant<PlanRole>[]),
    removeNoRevoke: (u) => removeHuvaariAssign(u, false),
    roleCaps: ROLE_CAPS.huvaari, roles: Object.keys(ROLE_CAPS.huvaari), universe: () => PKG_GROUPS,
  },
  obyem: {
    list: listObyemAssigns, failedUsers: obyemFailedUsers, ready: obyemAclReady,
    setGrants: (u, g) => setObyemGrants(u, g as Grant<ObyemRole>[]),
    removeNoRevoke: (u) => removeObyemAssign(u, false),
    roleCaps: ROLE_CAPS.obyem, roles: Object.keys(ROLE_CAPS.obyem), universe: () => PKG_GROUPS,
  },
  ajil: {
    list: listAjilAssigns, failedUsers: ajilFailedUsers, ready: ajilAclReady,
    setGrants: (u, g) => setAjilGrants(u, g as Grant<AjilRole>[]),
    removeNoRevoke: (u) => removeAjilAssign(u, false),
    roleCaps: ROLE_CAPS.ajil, roles: Object.keys(ROLE_CAPS.ajil), universe: () => PKG_GROUPS,
  },
  chanar: {
    list: listChanarAssigns, failedUsers: chanarFailedUsers, ready: chanarAclReady,
    setGrants: (u, g) => setChanarGrants(u, g as Grant<ChanarRole>[]),
    removeNoRevoke: (u) => removeChanarAssign(u, false),
    roleCaps: ROLE_CAPS.chanar, roles: Object.keys(ROLE_CAPS.chanar), universe: () => PKG_GROUPS,
  },
  butets: {
    list: listButetsAssigns, failedUsers: butetsFailedUsers, ready: butetsAclReady,
    setGrants: (u, g) => setButetsGrants(u, g as Grant<ButetsRole>[]),
    removeNoRevoke: (u) => removeButetsAssign(u, false),
    /* ⚠️ Багц нь `BUTETS_PACKS` түлхүүр («БАГЦ51») — `PKG_GROUPS` БИШ (`butetsAcl.ts`) */
    roleCaps: ROLE_CAPS.butets, roles: Object.keys(ROLE_CAPS.butets),
    universe: () => BUTETS_PACKS.map((p) => p.key),
  },
};

/**
 * ОДООГИЙН ЭРХИЙН ЗУРАГ — тойм, матриц, карт гурвын ГАНЦ уншилт (2026-09-25).
 * ⚠️ Урьд нь `ErhOverview` дотор бичигдсэн; карт ба жагсаалт ч (өнчин эрх)
 *    хэрэглэдэг болсон тул нэг газар. Цэвэр тооцоо нь `erhOverview.ts`-д.
 * ⚠️ Уншигдаагүй эх сурвалж `[]` өгнө — дуудагч `allAclReady()`-г шалгана.
 */
export function liveErhSource(): ErhSource {
  const users = listUsers().map((u) => u.username);
  return {
    users,
    /* ⚠️ Хатуу super — `roleForUser` энд, `erhOverview.ts` импортлодоггүй */
    supers: users.filter((u) => roleForUser(u) === 'super'),
    flow: listAssigns(),
    qaqc: listQaqcAssigns().map((a) => ({ user: a.user, bagts: a.bagts })),
    huvaari: listHuvaariAssigns(),
    obyem: listObyemAssigns(),
    chanar: listChanarAssigns(),
    ajil: listAjilAssigns(),
    butets: listButetsAssigns(),
    caps: Object.fromEntries(users.map((u) => [u.toLowerCase(), capsOf(u)])),
    views: Object.fromEntries(users.map((u) => {
      const a = resolveAccess(u);
      const open = a ? (a.views === 'all' ? VIEWS.length : a.views.length) : 0;
      return [u.toLowerCase(), { open, total: VIEWS.length }];
    })),
  };
}

/** QAQC ба урсгалын бичилт унасан хэрэглэгчид — карт/матрицын ⚠️ тэмдэгт */
export const qaqcFailed = qaqcFailedUsers;
export const flowFailed = flowFailedUsers;

/* ══════════════════════ Текстүүд ══════════════════════ */

/** Мөрийг БҮХЭЛД нь хасахыг баталгаажуулах — панелуудын ЯГ ижил текст */
export function removeAllMsg(sys: ScopedSys, user: string): string {
  if (sys === 'huvaari') {
    return tr('«{0}»-г хуваарийн хуваарилалтаас бүрэн хасах уу? «Хуваарь төлөвлөх» ба «Хуваарь батлах» эрх нь мөн буцаагдана.', user);
  }
  if (sys === 'obyem') {
    return tr('«{0}»-г инженерийн обьёмын хуваарилалтаас бүрэн хасах уу? «Инженерийн обьём засах» ба «Инженерийн обьём батлах» эрх нь мөн буцаагдана.', user);
  }
  if (sys === 'ajil') {
    return tr('«{0}»-г нэмэлт ажлын хуваарилалтаас бүрэн хасах уу? «Мөр нэмэх» ба «Нэмэлт ажил батлах» эрх нь мөн буцаагдана.', user);
  }
  if (sys === 'chanar') {
    return tr('«{0}»-г чанарын баримтын хуваарилалтаас бүрэн хасах уу? «Чанарын баримт ирүүлэх» ба «Чанарын баримт хянах» эрх нь мөн буцаагдана.', user);
  }
  return tr('«{0}»-г дэд бүтцийн засварын хуваарилалтаас бүрэн хасах уу? «Инженерийн дэд бүтцийн засвар» эрх нь мөн буцаагдана.', user);
}

/** «Бүх багц»-тай grant-ыг нэг багцаас салгах боломжгүй */
const allRoleMsg = (user: string): string =>
  tr('«{0}» нь энэ үүргээр БҮХ багцад хуваарилагдсан тул нэг багцаас нь салгаж хасах боломжгүй. Энэ үүргийг нь БҮХЭЛД НЬ хасах уу?', user);

const norm = (user: string): string => user.trim().toLowerCase();

/** Порталд БАЙГАА аккаунт уу — устгагдсаны өнчин мөрийг `revoke=false`-оор цэвэрлэнэ */
const isKnown = (u: string): boolean => listUsers().some((x) => x.username.toLowerCase() === u);

/* ══════════════ Үүрэгтэй таван систем (Хуваарь · Обьём · Нэмэлт ажил · Чанарын баримт · Дэд бүтэц) ══════════════ */

/**
 * БАГЦАД ҮҮРЭГ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
 *
 * ⚠️ «Бүх багц»-тай grant-д ДАХИН нэмэхгүй: хүрээ нь аль хэдийн бүрэн тул
 *    жагсаалт руу буулгавал ХУМИГДАНА (бүх багц → зөвхөн энэ нэг).
 * ⚠️ ЗӨВХӨН тухайн үүргийн grant хөндөгдөнө — бусад үүрэг ӨӨРИЙН багцтай
 *    хэвээр (2026-09-09-ний үүрэг × багцын үржвэрийн засвар).
 */
export function addPkgOp(sys: ScopedSys, user: string, role: string, pkg: string): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = user.trim().toLowerCase();
  if (!u) return null;
  const cur = spec.list().find((a) => a.user === u);
  const grants: Grant<string>[] = cur ? cur.grants.map((g) => ({ ...g })) : [];
  const mine = grants.find((g) => g.role === role);
  if (!mine) grants.push({ role, bagts: [pkg] });
  else if (!mine.bagts.includes(ALL_BAGTS) && !mine.bagts.includes(pkg)) {
    mine.bagts = [...mine.bagts, pkg];
  } else return null;
  return { user: u, run: () => spec.setGrants(u, grants) };
}

/**
 * БАГЦААС ҮҮРЭГ ХАСАХ — тэр ҮҮРГИЙН grant-аас энэ багцыг л хасна.
 *
 * ⚠️ «Бүх багц»-тай grant-ыг нэг багцаас САЛГАЖ хасах боломжгүй — тэр үүргийг
 *    БҮХЭЛД нь хасахыг асууна. ⚠️ ДЭД БҮТЭЦ ТУСГАЙ (2026-09-23, `DedButetsAcl`):
 *    ALL → бусад багцын ИЛ жагсаалт болж, зөвхөн энэ багц хасагдана (асуухгүй).
 * ⚠️ Багцгүй үлдсэн grant өөрөө унана; нэг ч grant үлдэхгүй бол мөрийг бүхэлд
 *    нь хасна (`revoke=false` + алга болсон үүргийн эрх л буцна).
 */
export function removePkgOp(sys: ScopedSys, user: string, role: string, pkg: string): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = user.trim().toLowerCase();
  const cur = spec.list().find((a) => a.user === u);
  if (!cur) return null;
  const mine = cur.grants.find((g) => g.role === role);
  if (!mine) return null;

  const confirm: string[] = [];
  let left: string[];
  if (mine.bagts.includes(ALL_BAGTS)) {
    if (sys === 'butets') left = spec.universe().filter((k) => k !== pkg);
    else { confirm.push(allRoleMsg(u)); left = []; }
  } else {
    if (!mine.bagts.includes(pkg)) return null;
    left = mine.bagts.filter((b) => b !== pkg);
  }

  /* Энэ багцыг хасаад — багцгүй үлдсэн grant өөрөө унана */
  const grants = cur.grants
    .map((g) => (g.role === role ? { ...g, bagts: left } : g))
    .filter((g) => g.bagts.length > 0);

  if (!grants.length) {
    confirm.push(removeAllMsg(sys, u));
    return { user: u, confirm, run: () => removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps) };
  }
  return { user: u, confirm, run: () => setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps) };
}

/**
 * ҮҮРГИЙГ «БҮХ БАГЦ» БОЛГОХ — картын «Бүх багц» чип.
 * ⚠️ Хүрээг ИЛ тэлэх админы шийдвэр — өөр замаар (унтраалга г.м.) чимээгүй
 *    `[ALL]` бичигдэхгүй (2026-09-25).
 */
export function setRoleAllOp(sys: ScopedSys, user: string, role: string): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = user.trim().toLowerCase();
  if (!u) return null;
  const cur = spec.list().find((a) => a.user === u);
  const grants: Grant<string>[] = cur ? cur.grants.map((g) => ({ ...g })) : [];
  const mine = grants.find((g) => g.role === role);
  if (mine?.bagts.includes(ALL_BAGTS)) return null;
  if (mine) mine.bagts = [ALL_BAGTS];
  else grants.push({ role, bagts: [ALL_BAGTS] });
  return { user: u, run: () => spec.setGrants(u, grants) };
}

/** ҮҮРГИЙГ БҮХ БАГЦААС ХАСАХ — бусад үүрэг хэвээр; сүүлийнх бол мөр бүхэлдээ */
export function dropRoleOp(sys: ScopedSys, user: string, role: string): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = user.trim().toLowerCase();
  const cur = spec.list().find((a) => a.user === u);
  if (!cur || !cur.grants.some((g) => g.role === role)) return null;
  const grants = cur.grants.filter((g) => g.role !== role);
  if (!grants.length) {
    return {
      user: u,
      confirm: [removeAllMsg(sys, u)],
      run: () => removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps),
    };
  }
  return {
    user: u,
    confirm: [tr('«{0}»-ийн энэ үүргийг БҮХ багцаас хасах уу? Өөр үүрэг түүн рүү заагаагүй бол харгалзах эрх нь мөн буцаагдана.', u)],
    run: () => setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps),
  };
}

/* ══════════════════════ QAQC (үүрэггүй, `soleCap`) ══════════════════════ */

const qaqcRow = (u: string) => listQaqcAssigns().find((a) => a.user === u);

/** Хуваарилалтаас бүрэн хасах — `QaqcAcl`-ийн ✕ (устгагдсан аккаунтад `revoke=false`, асуухгүй) */
export function qaqcDropOp(user: string): AclOp {
  const u = norm(user);
  if (!qaqcRow(u)) return null;
  if (!isKnown(u)) return { user: u, run: () => removeQaqcAssign(u, false) };
  return {
    user: u,
    confirm: [tr('«{0}»-г чанарын хуваарилалтаас хасах уу? «QAQC — Inspection Test Plan» эрх ба «Чанар (QAQC)» харагдац нь мөн буцаагдана.', u)],
    run: () => removeQaqcAssign(u),
  };
}

/**
 * БАГЦ НЭМЭХ. ⚠️ ШИНЭ мөр → эрх олгоно (`grant=true`); байгаа мөрийн багц солих →
 *    `grant=false` (эрх аль хэдийн олгогдсон — `QaqcAcl`-ийн дүрэм).
 */
export function qaqcAddOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = qaqcRow(u);
  if (!cur) return { user: u, run: () => setQaqcAssign(u, [pkg]) };
  if (cur.bagts.includes(ALL_BAGTS) || cur.bagts.includes(pkg)) return null;
  return { user: u, run: () => setQaqcAssign(u, [...cur.bagts, pkg], false) };
}

/** «Бүх багц» — шинэ мөр бол эрх олгоно */
export function qaqcAllOp(user: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = qaqcRow(u);
  if (cur?.bagts.includes(ALL_BAGTS)) return null;
  return { user: u, run: () => setQaqcAssign(u, [ALL_BAGTS], !cur) };
}

/**
 * БАГЦААС ХАСАХ (матрицын нүд). ⚠️ «Бүх багц»-тай бол нэг багцаас салгахгүй —
 *    бүхэлд нь хасахыг асууна; сүүлийн багц бол ✕-ийн зам (асууж, эрх буцаана).
 */
export function qaqcRemoveOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  const cur = qaqcRow(u);
  if (!cur) return null;
  const all = cur.bagts.includes(ALL_BAGTS);
  if (!all && !cur.bagts.includes(pkg)) return null;
  const left = all ? [] : cur.bagts.filter((b) => b !== pkg);
  if (left.length) return { user: u, run: () => setQaqcAssign(u, left, false) };
  const drop = qaqcDropOp(u);
  if (!drop || 'error' in drop || !all) return drop;
  return { user: u, confirm: [allRoleMsg(u), ...(drop.confirm ?? [])], run: drop.run };
}

/**
 * КАРТЫН БАГЦЫН ЧИП — `QaqcAcl` панелийн ЯГ дүрэм: «Бүх багц»-тай үед чип
 * дарвал тэр багц руу НАРИЙСНА; сонгосныг дарвал хасна.
 * ⚠️ СҮҮЛИЙН БАГЦ (2026-09-25, төлөвлөгөө): панел урьд нь «хасахгүй» гэж
 *    зогсоодог байв; одоо ✕-ийн зам руу (асууж, мөрийг хасна) — «бүх багц»
 *    руу БУЦАХГҮЙ (fail-closed хэвээр).
 */
export function qaqcChipOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  const cur = qaqcRow(u);
  if (!cur) return qaqcAddOp(u, pkg);
  const on = cur.bagts.includes(pkg);
  const rest = cur.bagts.filter((x) => x !== ALL_BAGTS);
  if (on && rest.length === 1) return qaqcDropOp(u);
  const next = on ? rest.filter((x) => x !== pkg) : [...rest, pkg];
  return { user: u, run: () => setQaqcAssign(u, next, false) };
}

/* ══════════════════════ Гүйцэтгэлийн урсгал (шаттай) ══════════════════════ */

const flowRow = (u: string) => listAssigns().find((a) => a.user === u);

/** `removeAssign` нь `{ sync }` л буцаадаг — `Write` болгоно */
const asWrite = (r: { sync: Promise<boolean> }): Write => ({ ok: true, sync: r.sync });

/** «бүх багц» / багцын нэр — шилжүүлэх асуултад */
const scopeText = (pkg: string): string => (pkg === ALL_BAGTS ? tr('бүх багц') : pkg);

/**
 * ⚠️ НЭГ АККАУНТ НЭГ ШАТАНД (`guitsetgelAcl.setAssign`) — шат солих нь хуучин
 *    багц ба «Зөвхөн харна»-г арилгана. Админд ИЛ хэлж асууна.
 */
const moveMsg = (u: string, from: Stage, to: Stage, pkg: string): string =>
  tr('«{0}»-г {1} шатнаас {2} шат руу шилжүүлэх үү? Нэг аккаунт зөвхөн нэг шатанд байна — хуучин багцууд ба «Зөвхөн харна» тохиргоо арилж, шинэ шатанд «{3}» хүрээгээр томилогдоно.',
    u, STAGE_LABEL[from], STAGE_LABEL[to], scopeText(pkg));

/** Томилгооноос хасах — `GuitsetgelAcl`-ийн ✕ (устгагдсан аккаунтад `revoke=false`, асуухгүй) */
export function flowDropOp(user: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur) return null;
  if (!isKnown(u)) return { user: u, run: () => asWrite(removeAssign(u, cur.stage, false)) };
  return {
    user: u,
    confirm: [tr('«{0}»-г {1} шатнаас хасах уу? Олгогдсон үүрэг ба «Гүйцэтгэлийн хяналт» харагдац нь мөн буцаагдана.', u, STAGE_LABEL[cur.stage])],
    run: () => asWrite(removeAssign(u, cur.stage)),
  };
}

/**
 * ШАТ СОНГОХ (карт). `null` = томилгооноос хасах. Шинэ томилгоо нь панелийн
 * анхдагчаар «бүх багц»; өөр шатанд байвал шилжүүлэхийг асууна.
 */
export function flowStageOp(user: string, stage: Stage | null): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = flowRow(u);
  if (stage === null) return cur ? flowDropOp(u) : null;
  if (!cur) return { user: u, run: () => setAssign(u, stage, [ALL_BAGTS]) };
  if (cur.stage === stage) return null;
  return { user: u, confirm: [moveMsg(u, cur.stage, stage, ALL_BAGTS)], run: () => setAssign(u, stage, [ALL_BAGTS]) };
}

/**
 * ШАТНЫ БАГЦАД НЭМЭХ (матрицын нүд). Томилгоогүй бол ЗӨВХӨН энэ багцаар
 * томилно; өөр шатанд байвал шилжүүлэхийг асууна.
 */
export function flowAddOp(user: string, stage: Stage, pkg: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = flowRow(u);
  if (!cur) return { user: u, run: () => setAssign(u, stage, [pkg]) };
  if (cur.stage !== stage) {
    return { user: u, confirm: [moveMsg(u, cur.stage, stage, pkg)], run: () => setAssign(u, stage, [pkg]) };
  }
  if (cur.bagts.includes(ALL_BAGTS) || cur.bagts.includes(pkg)) return null;
  return { user: u, run: () => setAssign(u, stage, [...cur.bagts, pkg], false) };
}

/** ШАТНЫ БАГЦААС ХАСАХ (матрицын нүд) — `qaqcRemoveOp`-ийн ижил дүрэм */
export function flowRemoveOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur) return null;
  const all = cur.bagts.includes(ALL_BAGTS);
  if (!all && !cur.bagts.includes(pkg)) return null;
  const left = all ? [] : cur.bagts.filter((b) => b !== pkg);
  if (left.length) return { user: u, run: () => setAssign(u, cur.stage, left, false) };
  const drop = flowDropOp(u);
  if (!drop || 'error' in drop || !all) return drop;
  return { user: u, confirm: [allRoleMsg(u), ...(drop.confirm ?? [])], run: drop.run };
}

/** «Бүх багц» (карт) — багц солих тул `grant=false` */
export function flowAllOp(user: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur || cur.bagts.includes(ALL_BAGTS)) return null;
  return { user: u, run: () => setAssign(u, cur.stage, [ALL_BAGTS], false) };
}

/**
 * КАРТЫН БАГЦЫН ЧИП — `GuitsetgelAcl` панелийн ЯГ дүрэм (`qaqcChipOp`-той ижил).
 * ⚠️ Сүүлийн багц → ✕-ийн зам (асууж, эрх буцаана), «бүх багц» руу БУЦАХГҮЙ.
 */
export function flowChipOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur) return null;
  const on = cur.bagts.includes(pkg);
  const rest = cur.bagts.filter((x) => x !== ALL_BAGTS);
  if (on && rest.length === 1) return flowDropOp(u);
  const next = on ? rest.filter((x) => x !== pkg) : [...rest, pkg];
  return { user: u, run: () => setAssign(u, cur.stage, next, false) };
}

/** «Зөвхөн харна» туг — эрх хөндөхгүй (`setViewOnly`-ийн ⚠️) */
export function flowViewOnlyOp(user: string, on: boolean): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur || (cur.viewOnly === true) === on) return null;
  return { user: u, run: () => setViewOnly(u, on) };
}

/* ══════════════════════ Гүйцэтгэгч ══════════════════════ */

/**
 * Op-ыг гүйцэтгэнэ: түгжээ → асуултууд → бичилт → `sync` (+`granted`) хүлээнэ.
 *
 * ⚠️ `r.ok`-ЫГ `await`-ЫН ӨМНӨ шалгана: `{ok:false}` үед `sync` байхгүй тул
 *    шалгахгүй бол «ArcGIS-т хадгалагдсангүй» гэсэн ТӨӨРӨГДҮҮЛСЭН алдаа гарна
 *    (асуудал сүлжээнийх биш, няцаалтынх — `UserAdmin.flipScoped`-ийн 2026-09-08 ⚠️).
 * ⚠️ Түгжээг ДАРАХ агшинд дахин шалгана (UI disabled ч давхар хамгаалалт).
 *
 * @param ready панел өөрийн (3 тугтай) түгжээг өгнө — анхдагч нь бүх 9 туг.
 * @returns бүгд бичигдсэн эсэх
 */
export async function runOp(
  op: AclOp, setErr: (m: string) => void, ready: () => boolean = allAclReady,
): Promise<boolean> {
  if (!op) return false;
  if (!ready()) { setErr(lockMsg()); return false; }
  if ('error' in op) { setErr(op.error); return false; }
  for (const c of op.confirm ?? []) if (!window.confirm(c)) return false;
  const who = op.user ? norm(op.user) : '';
  /* ⚠️ `run`-аас ӨМНӨ тэмдэглэнэ — локал бичилтийн notify-аар дахин зурахад
     аль хэдийн «явагдаж буй» байх ёстой (эс бөгөөс нэг рендер худал өнчин). */
  if (who) bump(who, 1);
  try {
    const r = op.run();
    if (!r.ok) { setErr(r.error ?? ''); return false; }
    setErr('');
    const [a, b] = await Promise.all([r.sync ?? Promise.resolve(true), r.granted ?? Promise.resolve(true)]);
    if (a === false || b === false) {
      setErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
      return false;
    }
    return true;
  } finally {
    if (who) bump(who, -1);
  }
}
