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
import { allPkgErh, type ErhSource, type PkgIssue, type ScopedRow } from './erhOverview';
import { capUsers, capsOf, capsRemoteReady, toggleCap, type CapKey } from './caps';
import { ALL_BAGTS, type Grant } from './scopedAcl';
import { ROLE_CAPS, capSystem, isDerivedCap, type ScopedSys } from './aclRoleCaps';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from './butetsPacks';
import type { Stage } from './hyanalt';
import { capLabelShort, issueText } from '@/modules/erhLabels';
import { STAGE_LABEL } from './hyanaltGroup';
import { planCellAdd, planCellRemove } from './guitsetgelGrid';
import { planGrantAdd, planGrantRemove, planListAdd, planListRemove } from './aclGrid';
import {
  flowAclReady, flowFailedUsers, listAssigns, removeAssign, retryFlow, setAssign, setViewOnly,
} from './guitsetgelAcl';
import {
  listQaqcAssigns, qaqcAclReady, qaqcFailedUsers, removeQaqcAssign, retryQaqcAssign, setQaqcAssign,
} from './qaqcAcl';
import {
  huvaariAclReady, huvaariFailedUsers, listHuvaariAssigns, removeHuvaariAssign, retryHuvaariAssign,
  setHuvaariGrants, type PlanRole,
} from './huvaariAcl';
import {
  listObyemAssigns, obyemAclReady, obyemFailedUsers, removeObyemAssign, retryObyemAssign, setObyemGrants,
  type ObyemRole,
} from './obyemAcl';
import {
  ajilAclReady, ajilFailedUsers, listAjilAssigns, removeAjilAssign, retryAjilAssign, setAjilGrants,
  type AjilRole,
} from './ajilAcl';
import {
  chanarAclReady, chanarFailedUsers, listChanarAssigns, removeChanarAssign, retryChanarAssign,
  setChanarGrants, type ChanarRole,
} from './chanarAcl';
import {
  butetsAclReady, butetsFailedUsers, listButetsAssigns, removeButetsAssign, retryButetsAssign,
  setButetsGrants, type ButetsRole,
} from './butetsAcl';

/** Бичилтийн үр дүн — `scopedAcl.AclWrite`-тай ижил хэлбэр */
export type Write = { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> };

/** Хуваарилалтын мөр — үүрэг бүр өөрийн багцтай */
type Row<R extends string = string> = { user: string; grants: Grant<R>[] };

/**
 * Нэг бичих үйлдэл. `confirm` — дарааллаар асуух асуултууд (аль нэгд нь
 * «Цуцлах» бол юу ч бичихгүй). `error` — бичихээс өмнө татгалзсан.
 */
export type AclOp = {
  confirm?: string[]; run: () => Write; user?: string;
  /**
   * ⚠️ 2026-10-05: бичилтийн ДАРААХ эрхийн зураг (цэвэр, юу ч бичихгүй) — `runOp` үүгээр
   *    «энэ хасалт ямар ШИНЭ гацаа үүсгэх вэ»-г асуултын текстэд нэмнэ (`newBlockingText`).
   *    Зөвхөн АСУУЛТТАЙ хасах/шилжүүлэх op-д; нэмэх op-д байхгүй.
   */
  after?: After;
} | { error: string } | null;

/** Эрхийн зургийг op-ын дараах байдал руу хувиргана — цэвэр */
type After = (src: ErhSource) => ErhSource;

/** Үүрэгтэй системийн мөрийг сольсон/хассан зураг (`grants` хоосон/`null` = мөр алга) */
const afterGrants = (sys: ScopedSys, u: string, grants: Grant<string>[] | null): After => (src) => {
  const rows = ((src[sys] ?? []) as ScopedRow[]).filter((r) => r.user.trim().toLowerCase() !== u);
  return { ...src, [sys]: grants && grants.length ? [...rows, { user: u, grants }] : rows } as ErhSource;
};

/** Урсгалын мөрийг сольсон/хассан зураг (`null` = томилгоогүй) */
const afterFlow = (u: string, row: { stage: Stage; bagts: string[]; viewOnly?: boolean } | null): After => (src) => {
  const rows = src.flow.filter((r) => r.user.trim().toLowerCase() !== u);
  return { ...src, flow: row ? [...rows, { user: u, ...row }] : rows };
};

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
  /* ⚠️ 2026-09-30: ХАТУУ SUPER-ИЙН ЭРХИЙГ ХӨНДӨХГҮЙ. Түүнд хуваарилалт үйлчилдэггүй тул эрх нь
     ЗӨВХӨН шууд олголтоос (`PlainCapAcl superOnly` · `capDirectOp`) — хуучин (remote-д үлдсэн)
     хуваарилалтын мөрийг хасахад тэр шууд олгосон эрхийг буцаадаг байв. */
  if (!rr.ok || !rr.sync || roleForUser(u) === 'super') return rr;
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
  /** Унасан бичилтийг дахин илгээх / эрхийг дахин олгох (2026-10-01, `scopedAcl.retry`) */
  retry: (u: string, grant: boolean) => Write;
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
    retry: (u, g) => retryHuvaariAssign(u, g),
    roleCaps: ROLE_CAPS.huvaari, roles: Object.keys(ROLE_CAPS.huvaari), universe: () => PKG_GROUPS,
  },
  obyem: {
    list: listObyemAssigns, failedUsers: obyemFailedUsers, ready: obyemAclReady,
    setGrants: (u, g) => setObyemGrants(u, g as Grant<ObyemRole>[]),
    removeNoRevoke: (u) => removeObyemAssign(u, false),
    retry: (u, g) => retryObyemAssign(u, g),
    roleCaps: ROLE_CAPS.obyem, roles: Object.keys(ROLE_CAPS.obyem), universe: () => PKG_GROUPS,
  },
  ajil: {
    list: listAjilAssigns, failedUsers: ajilFailedUsers, ready: ajilAclReady,
    setGrants: (u, g) => setAjilGrants(u, g as Grant<AjilRole>[]),
    removeNoRevoke: (u) => removeAjilAssign(u, false),
    retry: (u, g) => retryAjilAssign(u, g),
    roleCaps: ROLE_CAPS.ajil, roles: Object.keys(ROLE_CAPS.ajil), universe: () => PKG_GROUPS,
  },
  chanar: {
    list: listChanarAssigns, failedUsers: chanarFailedUsers, ready: chanarAclReady,
    setGrants: (u, g) => setChanarGrants(u, g as Grant<ChanarRole>[]),
    removeNoRevoke: (u) => removeChanarAssign(u, false),
    retry: (u, g) => retryChanarAssign(u, g),
    roleCaps: ROLE_CAPS.chanar, roles: Object.keys(ROLE_CAPS.chanar), universe: () => PKG_GROUPS,
  },
  butets: {
    list: listButetsAssigns, failedUsers: butetsFailedUsers, ready: butetsAclReady,
    setGrants: (u, g) => setButetsGrants(u, g as Grant<ButetsRole>[]),
    removeNoRevoke: (u) => removeButetsAssign(u, false),
    retry: (u, g) => retryButetsAssign(u, g),
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
  const flow = listAssigns();
  const qaqc = listQaqcAssigns().map((a) => ({ user: a.user, bagts: a.bagts }));
  const huvaari = listHuvaariAssigns();
  const obyem = listObyemAssigns();
  const chanar = listChanarAssigns();
  const ajil = listAjilAssigns();
  const butets = listButetsAssigns();
  /* ⚠️ 2026-09-30: хуваарилалттай атлаа порталд алга (устгагдсан) — гацааны шалгуурт тоологдохгүй (`ErhSource.gone`) */
  const known = new Set(users.map((u) => u.toLowerCase()));
  const rows: { user: string }[][] = [flow, qaqc, huvaari, obyem, chanar, ajil, butets];
  const gone = [...new Set(rows.flatMap((l) => l.map((a) => a.user)))].filter((u) => !known.has(u.toLowerCase()));
  return {
    users,
    /* ⚠️ Хатуу super — `roleForUser` энд, `erhOverview.ts` импортлодоггүй */
    supers: users.filter((u) => roleForUser(u) === 'super'),
    gone,
    flow,
    qaqc,
    huvaari,
    obyem,
    chanar,
    ajil,
    butets,
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

/**
 * ЦЭВЭРЛЭХ МӨР (2026-09-30) — устгагдсан аккаунт (порталд алга) ЭСВЭЛ хатуу super-ийн хуучин
 * (remote-д үлдсэн) мөр. Хэнд нь ч хуваарилалт үйлчилдэггүй тул нүдний ✕ нь МӨРИЙГ БҮХЭЛД НЬ,
 * эрх хөндөхгүй (`revoke=false`), асуулгагүй арилгана — `qaqcDropOp`-ийн устгагдсан аккаунтын
 * хуучин дүрмийг гурван систем (QAQC · урсгал · таван үүрэгтэй) бүгдэд.
 * ⚠️ ЯАГААД:
 *    · устгагдсан аккаунтын НЭГ багцыг хасахад `setGrants` (grant=true) нь түүнд `__cap__:` мөр
 *      ДАХИН үүсгэдэг байв — ижил нэрийг дахин нэмэхэд «хуучин засах эрх үлдсэн» гэж түгжинэ;
 *    · super-ийн мөрийн НЭГ багцыг хасахад `setGrants`/`setAssign` super-ийг татгалзаж ✕ ҮРГЭЛЖ
 *      унадаг (мөрийг арилгах зам алга), сүүлийн багц → бүтэн хасалт нь super-т ШУУД олгосон
 *      эрхийг (`plan` · `qaqc` г.м.) буцаадаг байв.
 */
const isCleanup = (u: string): boolean => !isKnown(u) || roleForUser(u) === 'super';

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
 * ⚠️ 2026-09-30: UI-ААС ДУУДАГДАХГҮЙ. Матрицын нүд (`ErhCellEditor`) ч `*CellOp`-д
 *    шилжсэн — «бүх багц»-тай хүнийг НЭГ нүднээс хасахад энэ op «бүхэлд нь хасах уу?»
 *    асууж БҮХ багцаас хасдаг байсан нь хэрэглэгчийн мэдээлсэн алдаа байв
 *    («нэг багцаас хасахад бүх багцаас хасагдаж байна»). Шинэ UI-д ХЭРЭГЛЭХГҮЙ —
 *    `scopedCellOp` · `qaqcCellOp` · `flowCellOp`. Хуучин дүрэм `aclParity`-д бичигдсэн тул үлдээв.
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
    return { user: u, confirm, after: afterGrants(sys, u, null), run: () => removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps) };
  }
  return { user: u, confirm, after: afterGrants(sys, u, grants), run: () => setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps) };
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
      after: afterGrants(sys, u, null),
      run: () => removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps),
    };
  }
  return {
    user: u,
    confirm: [tr('«{0}»-ийн энэ үүргийг БҮХ багцаас хасах уу? Өөр үүрэг түүн рүү заагаагүй бол харгалзах эрх нь мөн буцаагдана.', u)],
    after: afterGrants(sys, u, grants),
    run: () => setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps),
  };
}

/**
 * «Бүх багц»-ыг нэг мөрөөс хасахад бусад багцын ил жагсаалт болгох асуулт —
 * хүснэгтийн нүд (`scopedCellOp` · `qaqcCellOp`, 2026-09-30).
 */
const narrowMsg = (u: string, pkg: string, n: number): string =>
  tr('«{0}» нь энэ үүргээр БҮХ багцад хуваарилагдсан. «{1}»-оос хасвал бусад {2} багцын ил жагсаалт болно (шинэ багц нэмэгдэхэд автоматаар хамрахгүй). Үргэлжлүүлэх үү?', u, pkg, n);

/**
 * «БАГЦ × ҮҮРЭГ» ХҮСНЭГТИЙН НҮД (`ScopedAclPanel` · `ChanarAcl` · `DedButetsAcl`,
 * 2026-09-30) — нэмэх/хасах.
 *
 * ⚠️ Шийдвэр нь ЦЭВЭР `aclGrid.planGrant*`-д; энд зөвхөн бичилт ба асуулт.
 *    Бичилт нь `addPkgOp` · `removePkgOp`-той ЯГ ижил: нэмэх → `setGrants`
 *    (эрх олгоно); хасах → `setGrantsRevokingRoles` (алга болсон үүргийн эрх л
 *    буцна); сүүлийн grant → `removeAllMsg` асуугаад `removeRevokingRoles`.
 * ⚠️ 2026-09-30: «Тойм»-ын матриц (`ErhCellEditor`) ч ЭНЭ op-оор бичдэг болсон.
 * ⚠️ `removePkgOp` (хуучин карт · матриц)-оос ЯЛГААТАЙ нэг зүйл: «бүх багц»-тай grant-ыг
 *    НЭГ мөрөөс хасвал бусад бүх багцын ил жагсаалт болгоно (асууна) —
 *    `flowCellOp`-ийн ижил хүснэгтийн дүрэм. Дэд бүтэц 2026-09-23-наас ийм
 *    бөгөөд АСУУДАГГҮЙ — тэр шийдвэр хэвээр.
 * @param label асуултад гарах багцын нэр (дэд бүтцэд түлхүүр биш нэр)
 */
export function scopedCellOp(
  sys: ScopedSys, user: string, role: string, pkg: string, add: boolean, label: string = pkg,
): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = norm(user);
  if (!u) return null;
  const cur = spec.list().find((a) => a.user === u)?.grants;
  const p = add ? planGrantAdd(cur, role, pkg) : planGrantRemove(cur, role, pkg, spec.universe());
  /* ⚠️ 2026-09-30: устгагдсан аккаунт / super-ийн хуучин мөр → бүхэлд нь цэвэрлэнэ (`isCleanup`) */
  if (!add && p.kind !== 'none' && isCleanup(u)) return { user: u, run: () => spec.removeNoRevoke(u) };
  switch (p.kind) {
    case 'none': return null;
    case 'create': return { user: u, run: () => spec.setGrants(u, p.grants) };
    case 'set': return add
      ? { user: u, run: () => spec.setGrants(u, p.grants) }
      : { user: u, run: () => setGrantsRevokingRoles(u, p.grants, spec.list, spec.setGrants, spec.roleCaps) };
    case 'narrow': return {
      user: u,
      confirm: sys === 'butets' ? [] : [narrowMsg(u, label, p.left.length)],
      after: afterGrants(sys, u, p.grants),
      run: () => setGrantsRevokingRoles(u, p.grants, spec.list, spec.setGrants, spec.roleCaps),
    };
    case 'drop': return {
      user: u,
      confirm: [removeAllMsg(sys, u)],
      after: afterGrants(sys, u, null),
      run: () => removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps),
    };
  }
}

/* ══════════════════════ QAQC (үүрэггүй, `soleCap`) ══════════════════════ */

const qaqcRow = (u: string) => listQaqcAssigns().find((a) => a.user === u);

/** Хуваарилалтаас бүрэн хасах — `QaqcAcl`-ийн ✕ (устгагдсан аккаунтад `revoke=false`, асуухгүй) */
export function qaqcDropOp(user: string): AclOp {
  const u = norm(user);
  if (!qaqcRow(u)) return null;
  /* ⚠️ 2026-09-30: super-ийн хуучин мөр ч (`isCleanup`) — `revoke=true` нь түүнд шууд олгосон `qaqc`-ийг буцаадаг байв */
  if (isCleanup(u)) return { user: u, run: () => removeQaqcAssign(u, false) };
  return {
    user: u,
    confirm: [tr('«{0}»-г чанарын хуваарилалтаас хасах уу? «QAQC — Inspection Test Plan» эрх ба «Чанар (QAQC)» харагдац нь мөн буцаагдана.', u)],
    run: () => removeQaqcAssign(u),
  };
}

/**
 * БАГЦ НЭМЭХ. ⚠️ ШИНЭ мөр → эрх олгоно (`grant=true`); байгаа мөрийн багц солих →
 *    `grant=false` (эрх аль хэдийн олгогдсон).
 * ⚠️ 2026-09-30: `qaqcAllOp` · `qaqcChipOp` (хуучин QAQC хөзрийн «Бүх багц» ба багцын
 *    чипүүд) УСТСАН — панел нь хүснэгт болж `qaqcCellOp`-оор бичдэг.
 */
export function qaqcAddOp(user: string, pkg: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = qaqcRow(u);
  if (!cur) return { user: u, run: () => setQaqcAssign(u, [pkg]) };
  if (cur.bagts.includes(ALL_BAGTS) || cur.bagts.includes(pkg)) return null;
  return { user: u, run: () => setQaqcAssign(u, [...cur.bagts, pkg], false) };
}

/**
 * БАГЦААС ХАСАХ (хуучин матрицын нүд). ⚠️ «Бүх багц»-тай бол нэг багцаас салгахгүй —
 * ⚠️ 2026-09-30: UI-ААС ДУУДАГДАХГҮЙ. Матрицын нүд (`ErhCellEditor`) ч `*CellOp`-д
 *    шилжсэн — «бүх багц»-тай хүнийг НЭГ нүднээс хасахад энэ op «бүхэлд нь хасах уу?»
 *    асууж БҮХ багцаас хасдаг байсан нь хэрэглэгчийн мэдээлсэн алдаа байв
 *    («нэг багцаас хасахад бүх багцаас хасагдаж байна»). Шинэ UI-д ХЭРЭГЛЭХГҮЙ —
 *    `scopedCellOp` · `qaqcCellOp` · `flowCellOp`. Хуучин дүрэм `aclParity`-д бичигдсэн тул үлдээв.
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
 * QAQC ХҮСНЭГТИЙН НҮД (`QaqcAcl`, 2026-09-30) — мөр = багц, ганц багана.
 * ⚠️ Шийдвэр `aclGrid.planList*`-д. Шинэ мөр → эрх олгоно (`qaqcAddOp`-той ижил);
 *    багц солих → `grant=false`; сүүлийн багц → `qaqcDropOp` (асууж эрх буцаана,
 *    «бүх багц» руу БУЦАХГҮЙ); «бүх багц»-ыг нэг мөрөөс → бусад багцын ил жагсаалт (асууна).
 */
export function qaqcCellOp(user: string, pkg: string, add: boolean): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = qaqcRow(u)?.bagts;
  const p = add ? planListAdd(cur, pkg) : planListRemove(cur, pkg, PKG_GROUPS);
  /* ⚠️ 2026-09-30: устгагдсан аккаунт / super-ийн хуучин мөр → бүхэлд нь цэвэрлэнэ (`isCleanup`);
     super-т `set` нь `setGrants`-ийн татгалзлаар ҮРГЭЛЖ унадаг байв */
  if (!add && p.kind !== 'none' && isCleanup(u)) return qaqcDropOp(u);
  switch (p.kind) {
    case 'none': return null;
    case 'create': return { user: u, run: () => setQaqcAssign(u, p.bagts) };
    case 'set': return { user: u, run: () => setQaqcAssign(u, p.bagts, false) };
    case 'narrow': return { user: u, confirm: [narrowMsg(u, pkg, p.bagts.length)], run: () => setQaqcAssign(u, p.bagts, false) };
    case 'drop': return qaqcDropOp(u);
  }
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
  /* ⚠️ 2026-09-30: super-ийн хуучин мөр ч (`isCleanup`) — түүний эрх кодоос, буцаах зүйлгүй */
  if (isCleanup(u)) return { user: u, run: () => asWrite(removeAssign(u, cur.stage, false)) };
  return {
    user: u,
    confirm: [tr('«{0}»-г {1} шатнаас хасах уу? Олгогдсон үүрэг ба «Гүйцэтгэлийн хяналт» харагдац нь мөн буцаагдана.', u, STAGE_LABEL[cur.stage])],
    after: afterFlow(u, null),
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
  return {
    user: u, confirm: [moveMsg(u, cur.stage, stage, ALL_BAGTS)],
    after: afterFlow(u, { stage, bagts: [ALL_BAGTS] }),
    run: () => setAssign(u, stage, [ALL_BAGTS]),
  };
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
    return {
      user: u, confirm: [moveMsg(u, cur.stage, stage, pkg)],
      after: afterFlow(u, { stage, bagts: [pkg] }),
      run: () => setAssign(u, stage, [pkg]),
    };
  }
  if (cur.bagts.includes(ALL_BAGTS) || cur.bagts.includes(pkg)) return null;
  return { user: u, run: () => setAssign(u, stage, [...cur.bagts, pkg], false) };
}

/**
 * ШАТНЫ БАГЦААС ХАСАХ (хуучин матрицын нүд) — `qaqcRemoveOp`-ийн ижил дүрэм.
 * ⚠️ 2026-09-30: UI-ААС ДУУДАГДАХГҮЙ. Матрицын нүд (`ErhCellEditor`) ч `*CellOp`-д
 *    шилжсэн — «бүх багц»-тай хүнийг НЭГ нүднээс хасахад энэ op «бүхэлд нь хасах уу?»
 *    асууж БҮХ багцаас хасдаг байсан нь хэрэглэгчийн мэдээлсэн алдаа байв
 *    («нэг багцаас хасахад бүх багцаас хасагдаж байна»). Шинэ UI-д ХЭРЭГЛЭХГҮЙ —
 *    `scopedCellOp` · `qaqcCellOp` · `flowCellOp`. Хуучин дүрэм `aclParity`-д бичигдсэн тул үлдээв.
 */
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
  return { user: u, confirm: [allRoleMsg(u), ...(drop.confirm ?? [])], after: drop.after, run: drop.run };
}

/** «Бүх багц» (карт) — багц солих тул `grant=false` */
export function flowAllOp(user: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur || cur.bagts.includes(ALL_BAGTS)) return null;
  return { user: u, run: () => setAssign(u, cur.stage, [ALL_BAGTS], false) };
}

/**
 * КАРТЫН БАГЦЫН ЧИП — хуучин `GuitsetgelAcl` панелийн дүрэм.
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

/**
 * «БАГЦ × ШАТ» ХҮСНЭГТИЙН НҮД (`GuitsetgelAcl`, 2026-09-30) — нэмэх/хасах.
 *
 * ⚠️ Шийдвэр нь ЦЭВЭР `guitsetgelGrid.planCell*`-д; энд зөвхөн бичилт ба асуулт.
 *    Бичилт нь дээрх op-уудтай ЯГ ижил: шинэ → `setAssign` (эрх олгоно);
 *    шилжүүлэх → `moveMsg` асуугаад `setAssign`; багц солих → `grant=false`;
 *    бүхэлд нь хасах → `flowDropOp` (асууж эрх буцаана, устгагдсанд revoke=false).
 * ⚠️ 2026-09-30: «Тойм»-ын матриц (`ErhCellEditor`) ч ЭНЭ op-оор бичдэг болсон.
 * ⚠️ `flowRemoveOp` (хуучин матриц)-оос ЯЛГААТАЙ нэг зүйл: «бүх багц»-тай
 *    хүнийг НЭГ мөрөөс хасвал бусад бүх багцын ил жагсаалт болгоно (асууна) —
 *    хэрэглэгчийн шаардлага (2026-09-30). Матриц ч мөн энэ дүрмээр (2026-09-30, `ErhCellEditor`).
 * @param pkg багцын нэр эсвэл `ALL_BAGTS` («Бүх багц» мөр)
 */
export function flowCellOp(user: string, stage: Stage, pkg: string, add: boolean): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = flowRow(u);
  const p = add ? planCellAdd(cur, stage, pkg) : planCellRemove(cur, stage, pkg, PKG_GROUPS);
  /* ⚠️ 2026-09-30: устгагдсан аккаунт / super-ийн хуучин мөр → бүхэлд нь цэвэрлэнэ (`isCleanup`);
     super-т `set` нь `setAssign`-ийн татгалзлаар ҮРГЭЛЖ унаж мөр арилгах замгүй байв */
  if (!add && p.kind !== 'none' && isCleanup(u)) return flowDropOp(u);
  switch (p.kind) {
    case 'none': return null;
    case 'create': return { user: u, run: () => setAssign(u, p.stage, p.bagts) };
    case 'move': return {
      user: u, confirm: [moveMsg(u, p.from, p.stage, pkg)],
      after: afterFlow(u, { stage: p.stage, bagts: p.bagts }),
      run: () => setAssign(u, p.stage, p.bagts),
    };
    case 'set': return { user: u, run: () => setAssign(u, p.stage, p.bagts, false) };
    case 'narrow': return {
      user: u,
      confirm: [tr('«{0}» нь {1} шатанд БҮХ багцад томилогдсон. «{2}»-оос хасвал бусад {3} багцын ил жагсаалт болно (шинэ багц нэмэгдэхэд автоматаар хамрахгүй). Үргэлжлүүлэх үү?',
        u, STAGE_LABEL[p.stage], pkg, p.bagts.length)],
      after: afterFlow(u, { stage: p.stage, bagts: p.bagts, viewOnly: cur?.viewOnly === true }),
      run: () => setAssign(u, p.stage, p.bagts, false),
    };
    case 'drop': return flowDropOp(u);
  }
}

/* ══════════════════════ Эрхийг ШУУД олгох/хасах (`__cap__:`) ══════════════════════ */

/**
 * ЭРХИЙГ АККАУНТАД ШУУД ОЛГОХ / ХАСАХ — хуваарилалтгүй (2026-09-30).
 *
 * ⚠️ ЯАГААД ЭНД: хэрэглэгчийн картын «Нэмэлт эрх» унтраалга (`UserAdmin.flipCap`)
 *    ХАСАГДАЖ, засах эрх бүр өөрийн хуудастай болов. Энгийн дөрвөн эрх
 *    (`PLAIN_CAPS`) тэр хуудсанд аккаунтаар олгогдоно; хатуу super-т
 *    гаргалгаатай эрх ч ЭНЭ замаар — `setGrants` super-ийг татгалздаг,
 *    `hasCap` super-ийг тойрдоггүй тул шууд олгох цорын ганц зам (2026-09-07 · 08).
 * ⚠️ Гаргалгаатай эрхийг super-ээс БУСДАД энэ op-оор олгохгүй — хуваарилалтын
 *    хоёр дахь эх сурвалж болж багцын хязгаарыг тэлнэ (`aclRoleCaps`-ийн ⚠️).
 *    Өнчин эрхийг ХАСАХ нь зөвшөөрөгдөнө (`on=false`).
 * ⚠️ `toggleCap` remote уншигдаагүй бол `false` — `runOp` «ArcGIS-т хадгалагдсангүй»
 *    гэж хэлнэ; `useAclRunner`-ийн `ready` давхар хаана.
 */
export function capDirectOp(user: string, cap: CapKey, on: boolean): AclOp {
  const u = norm(user);
  if (!u) return null;
  if (capsOf(u).includes(cap) === on) return null;
  if (on && isDerivedCap(cap) && roleForUser(u) !== 'super') {
    return { error: tr('Энэ эрх багцын хуваарилалтаас гардаг — багц онооно уу, шууд олгохгүй.') };
  }
  const confirm = on ? [] : [
    cap === 'addRow'
      ? tr('«{0}»-ийн «{1}» эрхийг хасах уу? «Гүйцэтгэл бөглөх»-ийн «Бөглөх» таб мөн хаагдана (урсгалын гүйцэтгэгч шатнаас бусдад).', u, capLabelShort(cap))
      : tr('«{0}»-ийн «{1}» эрхийг хасах уу?', u, capLabelShort(cap)),
  ];
  return { user: u, confirm, run: () => ({ ok: true, sync: toggleCap(u, cap, on) }) };
}

/* ═══════════ Засвар: дахин илгээх · дахин олгох · устгагдсаны үлдэгдэл (2026-10-01) ═══════════ */

/** Хуваарилалттай систем — урсгал · QAQC · үүрэгтэй тав */
export type RepairSys = 'flow' | 'qaqc' | ScopedSys;

/** Бүх `Write`-ыг нэгтгэнэ — аль нэг нь `ok:false` бол түүнийг; `sync`/`granted` бүгд үнэн бол үнэн */
function combine(ws: Write[]): Write {
  const bad = ws.find((w) => !w.ok);
  if (bad) return bad;
  const all = (ps: (Promise<boolean> | undefined)[]) =>
    Promise.all(ps.map((p) => p ?? Promise.resolve(true))).then((rs) => rs.every(Boolean));
  return { ok: true, sync: all(ws.map((w) => w.sync)), granted: all(ws.map((w) => w.granted)) };
}

/** Системийн дахин илгээх бичилт — `grant` бол эрхийг ч дахин олгоно */
function retryWrite(sys: RepairSys, u: string, grant: boolean): Write {
  if (sys === 'flow') return asWrite(retryFlow(u, grant));
  if (sys === 'qaqc') return retryQaqcAssign(u, grant);
  return SCOPED_SYS[sys].retry(u, grant);
}

/** ArcGIS бичилт нь унасан хэрэглэгчид (энэ сешн) — `failed` тэмдэг */
export function failedUsersOf(sys: RepairSys): string[] {
  if (sys === 'flow') return flowFailedUsers();
  if (sys === 'qaqc') return qaqcFailedUsers();
  return SCOPED_SYS[sys].failedUsers();
}

/**
 * «ДАХИН ИЛГЭЭХ» — бичилт нь унасан хэрэглэгчийн ЛОКАЛ төлөвийг remote руу дахин бичнэ
 * (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ ЯАГААД: урьд нь «!» тэмдэг ба «Холболтоо шалгаад дахин оролдоно уу» л байв — дахин
 *    оролдох цорын ганц зам нь багцыг хасаад дахин нэмэх (эрх буцаах асуулттай).
 * ⚠️ Асуулгагүй: шинэ шийдвэр БИШ, админы аль хэдийн хийсэн (локалд байгаа) өөрчлөлтийг л
 *    илгээнэ. Устгагдсан аккаунт / хатуу super-ийн хуучин мөрт эрх үүсгэхгүй (`isCleanup`).
 */
export function retryOp(sys: RepairSys, user: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  return { user: u, run: () => retryWrite(sys, u, !isCleanup(u)) };
}

/**
 * «ДАХИН ОЛГОХ» — хуваарилалт бий атлаа эрх нь алга (`erhOverview.missingCaps`) үед тэр
 * эрхийн системүүдийн хуваарилалтыг ДАХИН хадгалж, үүргийн эрхийг олгоно (2026-10-01).
 * ⚠️ ЯАГААД: урьд нь «багцыг хасаад дахин нэмж хуваарилалтыг дахин хадгална уу» гэсэн
 *    заавар л байв — хасах нь эрх буцаах асуулттай, гацааны анхааруулга өдөөдөг.
 * ⚠️ Хуваарилалтыг ӨӨРЧЛӨХГҮЙ — `retry(grant=true)`: мөрийг хэвээр нь дахин бичиж,
 *    `syncCaps` зөвхөн ОЛГОНО (хасахгүй).
 * ⚠️ Устгагдсан аккаунт / хатуу super-т татгалзана — эрх нь хуваарилалтаас гардаггүй.
 */
export function regrantOp(user: string, caps: readonly CapKey[]): AclOp {
  const u = norm(user);
  if (!u || !caps.length) return null;
  if (isCleanup(u)) return { error: tr('Устгагдсан эсвэл админ аккаунт — эрх хуваарилалтаас олгогдохгүй.') };
  const systems = new Set<RepairSys>();
  for (const c of caps) {
    const sys = capSystem(c);
    if (!sys) continue;
    const has = sys === 'qaqc' ? !!qaqcRow(u) : SCOPED_SYS[sys].list().some((a) => a.user === u);
    if (has) systems.add(sys);
  }
  if (!systems.size) return null;
  return { user: u, run: () => combine([...systems].map((sys) => retryWrite(sys, u, true))) };
}

/** Устгагдсан аккаунтын (порталд алга) нэг хуудсан дахь үлдэгдэл */
export type GoneItem = {
  user: string;
  /** Тухайн системд хуваарилалтын мөр үлдсэн */
  row: boolean;
  /** Тухайн хуудасны эрхүүдээс үлдсэн нь (`__cap__:`) */
  caps: CapKey[];
};

/** Системийн хуваарилалттай хэрэглэгчид */
const rowUsers = (sys: RepairSys): string[] => (sys === 'flow' ? listAssigns().map((a) => a.user)
  : sys === 'qaqc' ? listQaqcAssigns().map((a) => a.user)
    : SCOPED_SYS[sys].list().map((a) => a.user));

/**
 * УСТГАГДСАН АККАУНТЫН ҮЛДЭГДЭЛ — эрхийн хуудас бүрд (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ ЯАГААД: аккаунт устгахад `purge*`/`setCaps(u, [])` унавал (эсвэл өөр клиент/гараар
 *    устгасан) хуваарилалтын мөр ба `__cap__:` мөр ArcGIS дээр үлддэг. Хүснэгтэд тэд бүдэг
 *    чипээр харагддаг ч энгийн эрхийн хуудас (Зөвшөөрөл · Санхүү · Газар) зөвхөн порталд
 *    БАЙГАА аккаунтыг жагсаадаг тул тэдний эрх ХАРАГДАХ ГАЗАРГҮЙ байв; ижил нэрийг дахин
 *    нэмэхэд «хуучин эрх үлдсэн» гэж түгждэг.
 * ⚠️ «Устгагдсан» = порталын жагсаалтад (`listUsers`) алга — tombstone ч, мөргүй ч.
 * ⚠️ Дуудагч `allAclReady()`-г шалгана — уншигдаагүй эх сурвалж `[]` тул худал «цэвэр».
 * @param sys `null` — хуваарилалтгүй (энгийн эрхийн) хуудас
 * @param caps тухайн хуудасны эрхүүд (`capText.PANE_CAPS`)
 */
export function goneRightsOf(sys: RepairSys | null, caps: readonly CapKey[]): GoneItem[] {
  const out = new Map<string, GoneItem>();
  if (sys) {
    for (const u of rowUsers(sys)) if (!isKnown(norm(u))) out.set(norm(u), { user: norm(u), row: true, caps: [] });
  }
  for (const raw of capUsers()) {
    const u = norm(raw);
    if (isKnown(u)) continue;
    const left = capsOf(u).filter((c) => caps.includes(c));
    if (!left.length) continue;
    out.set(u, { ...(out.get(u) ?? { user: u, row: false, caps: [] }), caps: left });
  }
  return [...out.values()].sort((a, b) => a.user.localeCompare(b.user));
}

/**
 * УСТГАГДСАН АККАУНТЫН ҮЛДЭГДЛИЙГ ЦЭВЭРЛЭХ — тэр хуудасны мөр ба эрх (2026-10-01).
 * ⚠️ Мөр нь `revoke=false`-оор (эрх буцаах бичилт tombstone-ыг хөндөхгүй — `isCleanup`-ийн
 *    дүрэм), эрх нь дараа нь ИЛ жагсаалтаар (`toggleCap(off)`) — зөвхөн ЭНЭ хуудасных.
 * ⚠️ Порталд БАЙГАА аккаунтад `null` — зөвхөн устгагдсаных.
 * ⚠️ Асуулгагүй (нэг товшилт): тэр аккаунт нэвтэрч чадахгүй тул үйлчлэх эрх биш үлдэгдэл.
 *    «Бүгдийг цэвэрлэх» нь дуудагчид НЭГ удаа асууна.
 */
export function goneCleanupOp(sys: RepairSys | null, caps: readonly CapKey[], user: string): AclOp {
  const u = norm(user);
  if (!u || isKnown(u)) return null;
  const item = goneRightsOf(sys, caps).find((x) => x.user === u);
  if (!item) return null;
  return {
    user: u,
    run: () => {
      let w: Write = { ok: true, sync: Promise.resolve(true) };
      if (item.row && sys) {
        if (sys === 'flow') {
          const cur = flowRow(u);
          if (cur) w = asWrite(removeAssign(u, cur.stage, false));
        } else if (sys === 'qaqc') w = removeQaqcAssign(u, false);
        else w = SCOPED_SYS[sys].removeNoRevoke(u);
      }
      if (!w.ok) return w;
      const sync = (w.sync ?? Promise.resolve(true)).then(async (ok) => {
        let all = ok;
        for (const c of item.caps) all = (await toggleCap(u, c, false)) && all;
        return all;
      });
      return { ok: true, sync };
    },
  };
}

/* ══════════════════════ Гүйцэтгэгч ══════════════════════ */

/** `bad` цоорхойн таних түлхүүр — төрөл + багц + утгууд (шатны тоо өсвөл ч «шинэ») */
const badKeys = (src: ErhSource): Map<string, PkgIssue> => new Map(
  allPkgErh(src).flatMap((p) => p.issues
    .filter((i) => i.tone === 'bad')
    .map((i) => [`${i.key}|${i.args.join('|')}`, i] as const)),
);

/**
 * Op-ын ДАРАА шинээр үүсэх АЖИЛ ГАЦААХ цоорхойн текст (хоосон = үгүй) — 2026-10-05.
 * ⚠️ Дүрэм ЭНД ДАХИН БИЧИГДЭЭГҮЙ: `erhOverview.pkgIssues` (тойм · матрицын ижил эх),
 *    текст нь `erhLabels.issueText`. Зөвхөн `bad` — `warn` (дутуу ч ажиллана) орохгүй.
 * ⚠️ Тооцоо унавал хоосон буцна — анхааруулга нь бичилтийг хэзээ ч зогсоохгүй.
 */
function newBlockingText(after: After): string {
  try {
    const src = liveErhSource();
    const before = badKeys(src);
    const fresh = [...badKeys(after(src))].filter(([k]) => !before.has(k)).map(([, i]) => i);
    if (!fresh.length) return '';
    const lines = fresh.slice(0, 6).map((i) => `• ${issueText(i)}`);
    if (fresh.length > lines.length) lines.push(tr('… ба өөр {0} цоорхой', fresh.length - lines.length));
    return `${tr('⚠️ Энэ өөрчлөлтөөр ажил ГАЦААХ шинэ цоорхой үүснэ:')}\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

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
  /*
   * ⚠️ 2026-10-05: ГАЦААГ АСУУЛТАД НЬ ХЭЛНЭ. Урьд нь «батлагчгүй» · «өөрөө өөрийгөө батална» ·
   *    «урсгалын шат хоосон» анхааруулга зөвхөн ХАССАНЫ ДАРАА «Тойм»-д улайж гардаг байв —
   *    админ сүүлийн батлагчийг хасахдаа илгээсэн хуваарь/обьём мөнхөд хүлээхийг мэдэхгүй.
   *    Одоо op-ын дараах зургаас (`op.after`) ШИНЭЭР үүсэх `bad` цоорхойг бодож, СҮҮЛИЙН
   *    асуултын текстэд залгана. Шийдвэр админых хэвээр — хориглохгүй, зөвхөн хэлнэ.
   * ⚠️ Асуултын ТОО өөрчлөгдөхгүй (шинэ асуулт нэмэхгүй): асуулгагүй op асуулгагүй хэвээр.
   */
  const confirms = [...(op.confirm ?? [])];
  if (confirms.length && op.after) {
    const warn = newBlockingText(op.after);
    if (warn) confirms[confirms.length - 1] += `\n\n${warn}`;
  }
  for (const c of confirms) if (!window.confirm(c)) return false;
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
      /* ⚠️ 2026-10-05: ТОДОРХОЙ шалтгаан байвал (`views` талбарын урт хэтэрсэн г.м.) түүнийг —
         ерөнхий «хадгалагдсангүй» нь админыг сүлжээгээ шалгахад хүргэдэг байв. */
      const why = await import('./permsRemote').then((m) => m.takeWriteError()).catch(() => '');
      setErr(why || tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
      return false;
    }
    return true;
  } finally {
    if (who) bump(who, -1);
  }
}
