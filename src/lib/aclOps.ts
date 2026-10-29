'use client';

/**
 * ЭРХИЙН ХУВААРИЛАЛТЫН ГАНЦ БИЧИХ ДАВХАРГА — хэрэглэгчийн карт, багц × системийн
 * матриц, бүлгийн панелууд бүгд ЭНДЭЭС бичнэ (2026-09-25).
 */

import { t as tr } from './i18nCore';
import { askConfirm, toastUndo } from './confirm';
import { listUsers, remoteReady, resolveAccess, roleOf } from './permissions';
import { ROLE_STAGE, isCodeSuper, roleForUser, VIEWS } from './services';
import { portalMissing } from './portalPresence';
import { typeHuvaariScope } from './roleTypes';
import { ownPkgScope } from './huvaariView';
import { allPkgErh, type ErhSource, type PkgIssue, type ScopedRow } from './erhOverview';
import { capUsers, capsOf, capsRemoteReady, capsStored, toggleCap, type CapKey } from './caps';
import { ALL_BAGTS, type Grant } from './scopedAcl';
import { ROLE_CAPS, capSystem, isDerivedCap, type ScopedSys } from './aclRoleCaps';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from './butetsPacks';
import type { Stage } from './hyanalt';
import { capLabelShort, draftFlowMsg, issueText, newAccountMsg, removeMarkedMsg } from '@/modules/erhLabels';
import { STAGE_LABEL } from './hyanaltGroup';
import { planCellAdd, planCellRemove } from './guitsetgelGrid';
import * as hv from './huvaariBatlah';
import * as ob from './obyemBatlah';
import * as aj from './ajilBatlah';
import { planGrantAdd, planGrantRemove } from './aclGrid';
import {
  flowAclReady, flowFailedUsers, listAssigns, removeAssign, retryFlow, setAssign, setViewOnly,
} from './guitsetgelAcl';
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
  after?: After;
  undo?: () => AclOp;
  done?: string;
  flow?: boolean;
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
 */
export const allAclReady = (): boolean => remoteReady() && capsRemoteReady() && flowAclReady()
  && huvaariAclReady() && obyemAclReady() && chanarAclReady()
  && ajilAclReady() && butetsAclReady();

/** Түгжээний зурвас — панелуудын ЯГ ижил текст */
export const lockMsg = (): string => tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');

/* ══════════════ «Хэрэглэгчид»-ийн хадгалаагүй ноорогийн хамгаалалт (2026-10-23) ══════════════ */

/**
 * «ХЭРЭГЛЭГЧИД» САМБАРЫН НООРОГ — `UserAdmin` бүртгэнэ (`setAclDrafts`), `runOp` бүх эрхийн хуудсанд шалгана.
 */
type DraftMark = { remove?: boolean; isNew?: boolean };
let adminDrafts = new Map<string, DraftMark>();
export function setAclDrafts(entries: Iterable<[string, DraftMark]>): void {
  adminDrafts = new Map([...entries].map(([k, d]) => [k.trim().toLowerCase(), { remove: !!d.remove, isNew: !!d.isNew }]));
}
/**
 * Ноорогийн хамгаалалтын зурвас (`null` = чөлөөтэй): шинэ аккаунт · устгахаар тэмдэглэсэн → бүх op;
 * хадгалаагүй ноорогтой → урсгалын op (`flow`). Текст `erhLabels`-д (матрицын ижил үг).
 */
export function draftGuard(user: string, flow: boolean): string | null {
  const d = adminDrafts.get(user.trim().toLowerCase());
  if (!d) return null;
  if (d.isNew) return newAccountMsg();
  if (d.remove) return removeMarkedMsg();
  return flow ? draftFlowMsg() : null;
}
/** Урсгалын op гэж тэмдэглэнэ (`AclOp.flow`) */
const asFlow = (op: AclOp): AclOp => (op && !('error' in op) ? { ...op, flow: true } : op);

/* ══════════════ Хасагдсан үүргийн эрхийг буцаах (панелаас шилжсэн) ══════════════ */

/**
 * МӨРИЙГ БҮХЭЛД НЬ ХАСААД ЗӨВХӨН ХАСАГДСАН ҮҮРГИЙН ЭРХИЙГ БУЦААНА (2026-09-24).
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
 */
function revokeGoneRoles(
  u: string,
  had: Set<string>,
  rolesOf: () => Set<string>,
  rr: Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  if (!rr.ok || !rr.sync || isCodeSuper(u)) return rr;
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
    roleCaps: ROLE_CAPS.butets, roles: Object.keys(ROLE_CAPS.butets),
    universe: () => BUTETS_PACKS.map((p) => p.key),
  },
};

/**
 * ОДООГИЙН ЭРХИЙН ЗУРАГ — тойм, матриц, карт гурвын ГАНЦ уншилт (2026-09-25).
 */
export function liveErhSource(): ErhSource {
  const users = listUsers().map((u) => u.username);
  const flow = listAssigns();
  const huvaari = listHuvaariAssigns();
  const obyem = listObyemAssigns();
  const chanar = listChanarAssigns();
  const ajil = listAjilAssigns();
  const butets = listButetsAssigns();
  const known = new Set(users.map((u) => u.toLowerCase()));
  const rows: { user: string }[][] = [flow, huvaari, obyem, chanar, ajil, butets];
  const gone = [...new Set(rows.flatMap((l) => l.map((a) => a.user)))]
    .filter((u) => !known.has(u.toLowerCase()) || portalMissing(u));
  const typeStage: Record<string, Stage> = {};
  for (const u of users) {
    const r = roleOf(u);
    const st = r ? ROLE_STAGE[r] : undefined;
    if (st) typeStage[u.toLowerCase()] = st;
  }
  const viewRoles = users.filter((u) => roleOf(u) === 'zahiral');
  const hvType: NonNullable<ErhSource['hvType']> = {};
  for (const u of users) {
    const t = typeHuvaariScope(roleOf(u));
    if (t === 'all') hvType[u.toLowerCase()] = { scope: 'all', bagts: null };
    else if (t === 'own') {
      const s = ownPkgScope(u);
      hvType[u.toLowerCase()] = { scope: 'own', bagts: s === null ? null : PKG_GROUPS.filter((g) => s.includes(g)) };
    }
  }
  return {
    users,
    supers: users.filter((u) => roleForUser(u) === 'super'),
    codeSupers: users.filter((u) => isCodeSuper(u)),
    gone,
    absent: users.filter((u) => portalMissing(u)),
    typeStage,
    viewRoles,
    hvType,
    flow,
    huvaari,
    obyem,
    chanar,
    ajil,
    butets,
    caps: Object.fromEntries(users.map((u) => [u.toLowerCase(),
      roleForUser(u) === 'super' && !isCodeSuper(u) ? capsStored(u) : capsOf(u)])),
    views: Object.fromEntries(users.map((u) => {
      const a = resolveAccess(u);
      const open = a ? (a.views === 'all' ? VIEWS.length : a.views.length) : 0;
      return [u.toLowerCase(), { open, total: VIEWS.length }];
    })),
  };
}

/* ══════════════════════ Текстүүд ══════════════════════ */

/** Мөрийг БҮХЭЛД нь хасахыг баталгаажуулах — панелуудын ЯГ ижил текст */
function removeAllMsg(sys: ScopedSys, user: string): string {
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

const norm = (user: string): string => user.trim().toLowerCase();

/** Порталд БАЙГАА аккаунт уу — устгагдсаны өнчин мөрийг `revoke=false`-оор цэвэрлэнэ */
const isKnown = (u: string): boolean => listUsers().some((x) => x.username.toLowerCase() === u);

/**
 * ЦЭВЭРЛЭХ МӨР (2026-09-30) — устгагдсан аккаунт (порталд алга) ЭСВЭЛ хатуу super-ийн хуучин
 * (remote-д үлдсэн) мөр. Хэнд нь ч хуваарилалт үйлчилдэггүй тул нүдний ✕ нь МӨРИЙГ БҮХЭЛД НЬ,
 * эрх хөндөхгүй (`revoke=false`), асуулгагүй арилгана — `qaqcDropOp`-ийн устгагдсан аккаунтын
 * хуучин дүрмийг гурван систем (QAQC · урсгал · таван үүрэгтэй) бүгдэд.
 */
const isCleanup = (u: string): boolean => !isKnown(u) || isCodeSuper(u);

/* ══════════════ Үүрэгтэй таван систем (Хуваарь · Обьём · Нэмэлт ажил · Чанарын баримт · Дэд бүтэц) ══════════════ */


/**
 * БАГЦАД ҮҮРЭГ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
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
 * ҮҮРГИЙГ «БҮХ БАГЦ» БОЛГОХ — картын хуучин «Бүх багц» чип.
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

/**
 * ҮҮРГИЙГ БҮХ БАГЦААС ХАСАХ — бусад үүрэг хэвээр; сүүлийнх бол мөр бүхэлдээ.
 */
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
 */
export function scopedCellOp(
  sys: ScopedSys, user: string, role: string, pkg: string, add: boolean, label: string = pkg,
): AclOp {
  const spec = SCOPED_SYS[sys];
  const u = norm(user);
  if (!u) return null;
  const cur = spec.list().find((a) => a.user === u)?.grants;
  const p = add ? planGrantAdd(cur, role, pkg) : planGrantRemove(cur, role, pkg, spec.universe());
  if (!add && p.kind !== 'none' && isCleanup(u)) return { user: u, run: () => spec.removeNoRevoke(u) };
  switch (p.kind) {
    case 'none': return null;
    case 'create': return { user: u, run: () => spec.setGrants(u, p.grants) };
    case 'set': return add
      ? { user: u, run: () => spec.setGrants(u, p.grants) }
      : {
        user: u,
        after: afterGrants(sys, u, p.grants),
        undo: () => scopedCellOp(sys, user, role, pkg, true, label),
        done: tr('«{0}» «{1}»-оос хасагдлаа.', u, label),
        run: () => setGrantsRevokingRoles(u, p.grants, spec.list, spec.setGrants, spec.roleCaps),
      };
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


/* ══════════════════════ Гүйцэтгэлийн урсгал (шаттай) ══════════════════════ */

const flowRow = (u: string) => listAssigns().find((a) => a.user === u);

/** `removeAssign` нь `{ sync }` л буцаадаг — `Write` болгоно */
const asWrite = (r: { sync: Promise<boolean> }): Write => ({ ok: true, sync: r.sync });

/** «бүх багц» / багцын нэр — шилжүүлэх асуултад */
const scopeText = (pkg: string): string => (pkg === ALL_BAGTS ? tr('бүх багц') : pkg);

const moveMsg = (u: string, from: Stage, to: Stage, pkg: string): string =>
  tr('«{0}»-г {1} шатнаас {2} шат руу шилжүүлэх үү? Нэг аккаунт зөвхөн нэг шатанд байна — хуучин багцууд ба «Зөвхөн харна» тохиргоо арилж, шинэ шатанд «{3}» хүрээгээр томилогдоно.',
    u, STAGE_LABEL[from], STAGE_LABEL[to], scopeText(pkg));

/** Томилгооноос хасах — `GuitsetgelAcl`-ийн ✕ (устгагдсан аккаунтад `revoke=false`, асуухгүй) */
export function flowDropOp(user: string): AclOp {
  return asFlow(flowDropOpRaw(user));
}
function flowDropOpRaw(user: string): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur) return null;
  if (isCleanup(u)) return { user: u, run: () => asWrite(removeAssign(u, cur.stage, false)) };
  return {
    user: u,
    confirm: [tr('«{0}»-г {1} шатнаас хасах уу? Олгогдсон үүрэг ба «Гүйцэтгэлийн хяналт» харагдац нь мөн буцаагдана.', u, STAGE_LABEL[cur.stage])],
    after: afterFlow(u, null),
    run: () => asWrite(removeAssign(u, cur.stage)),
  };
}

/**
 * ШАТ СОНГОХ (хуучин карт). `null` = томилгооноос хасах. Шинэ томилгоо «бүх багц»;
 * өөр шатанд байвал шилжүүлэхийг асууна.
 */
export function flowStageOp(user: string, stage: Stage | null): AclOp {
  return asFlow(flowStageOpRaw(user, stage));
}
function flowStageOpRaw(user: string, stage: Stage | null): AclOp {
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

/** «Зөвхөн харна» туг — эрх хөндөхгүй (`setViewOnly`) */
export function flowViewOnlyOp(user: string, on: boolean): AclOp {
  const u = norm(user);
  const cur = flowRow(u);
  if (!cur || (cur.viewOnly === true) === on) return null;
  return { user: u, run: () => setViewOnly(u, on) };
}

/**
 * «БАГЦ × ШАТ» ХҮСНЭГТИЙН НҮД (`GuitsetgelAcl`, 2026-09-30) — нэмэх/хасах.
 */
export function flowCellOp(user: string, stage: Stage, pkg: string, add: boolean): AclOp {
  return asFlow(flowCellOpRaw(user, stage, pkg, add));
}
function flowCellOpRaw(user: string, stage: Stage, pkg: string, add: boolean): AclOp {
  const u = norm(user);
  if (!u) return null;
  const cur = flowRow(u);
  const p = add ? planCellAdd(cur, stage, pkg) : planCellRemove(cur, stage, pkg, PKG_GROUPS);
  if (!add && p.kind !== 'none' && isCleanup(u)) return flowDropOp(u);
  switch (p.kind) {
    case 'none': return null;
    case 'create': return { user: u, run: () => setAssign(u, p.stage, p.bagts) };
    case 'move': return {
      user: u, confirm: [moveMsg(u, p.from, p.stage, pkg)],
      after: afterFlow(u, { stage: p.stage, bagts: p.bagts }),
      run: () => setAssign(u, p.stage, p.bagts),
    };
    case 'set': return add
      ? { user: u, run: () => setAssign(u, p.stage, p.bagts, false) }
      : {
        user: u,
        after: afterFlow(u, { stage: p.stage, bagts: p.bagts, viewOnly: cur?.viewOnly === true }),
        undo: () => flowCellOp(user, p.stage, pkg, true),
        done: tr('«{0}» {1} шатны «{2}»-оос хасагдлаа.', u, STAGE_LABEL[p.stage], scopeText(pkg)),
        run: () => setAssign(u, p.stage, p.bagts, false),
      };
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
 */
export function capDirectOp(user: string, cap: CapKey, on: boolean): AclOp {
  const u = norm(user);
  if (!u) return null;
  if (isCodeSuper(u)) return on ? null : { error: tr('Админ (super) бүх эрхтэй — эрх нь тохируулагдахгүй.') };
  const tableSuper = roleForUser(u) === 'super';
  if ((tableSuper ? capsStored(u) : capsOf(u)).includes(cap) === on) return null;
  if (on && isDerivedCap(cap) && !tableSuper) {
    return { error: tr('Энэ эрх багцын хуваарилалтаас гардаг — багц онооно уу, шууд олгохгүй.') };
  }
  const confirm = on ? [] : [
    cap === 'addRow'
      ? tr('«{0}»-ийн «{1}» эрхийг хасах уу? «Хуваарь» хуудсанд шинэ ажлын мөр нэмэх боломж хаагдана (хуваарийн эрхгүй бол «Хуваарь» хуудас өөрөө хаагдана).', u, capLabelShort(cap))
      : tr('«{0}»-ийн «{1}» эрхийг хасах уу?', u, capLabelShort(cap)),
  ];
  return { user: u, confirm, run: () => ({ ok: true, sync: toggleCap(u, cap, on) }) };
}

/* ═══════════ Засвар: дахин илгээх · дахин олгох · устгагдсаны үлдэгдэл (2026-10-01) ═══════════ */

/** Хуваарилалттай систем — урсгал · үүрэгтэй тав (2026-10-23: QAQC хасагдсан) */
export type RepairSys = 'flow' | ScopedSys;

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
  return SCOPED_SYS[sys].retry(u, grant);
}

/** ArcGIS бичилт нь унасан хэрэглэгчид (энэ сешн) — `failed` тэмдэг */
export function failedUsersOf(sys: RepairSys): string[] {
  if (sys === 'flow') return flowFailedUsers();
  return SCOPED_SYS[sys].failedUsers();
}

/**
 * «ДАХИН ИЛГЭЭХ» — бичилт нь унасан хэрэглэгчийн ЛОКАЛ төлөвийг remote руу дахин бичнэ
 * (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export function retryOp(sys: RepairSys, user: string): AclOp {
  const u = norm(user);
  if (!u) return null;
  const op: AclOp = { user: u, run: () => retryWrite(sys, u, !isCleanup(u)) };
  return sys === 'flow' ? asFlow(op) : op;
}

/**
 * «ДАХИН ОЛГОХ» — хуваарилалт бий атлаа эрх нь алга (`erhOverview.missingCaps`) үед тэр
 * эрхийн системүүдийн хуваарилалтыг ДАХИН хадгалж, үүргийн эрхийг олгоно (2026-10-01).
 */
export function regrantOp(user: string, caps: readonly CapKey[]): AclOp {
  const u = norm(user);
  if (!u || !caps.length) return null;
  if (isCleanup(u)) return { error: tr('Устгагдсан эсвэл админ аккаунт — эрх хуваарилалтаас олгогдохгүй.') };
  const systems = new Set<RepairSys>();
  for (const c of caps) {
    const sys = capSystem(c);
    if (!sys) continue;
    const has = SCOPED_SYS[sys].list().some((a) => a.user === u);
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
  : SCOPED_SYS[sys].list().map((a) => a.user));

/**
 * УСТГАГДСАН АККАУНТЫН ҮЛДЭГДЭЛ — эрхийн хуудас бүрд (2026-10-01, «хэрэглэгч: бүгдийг зас»).
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
        } else w = SCOPED_SYS[sys].removeNoRevoke(u);
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
 * ХЭРЭГЛЭГЧИЙН НЭРЭЭР ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ · ХАГАС БИЧИЛТИЙН ТЭМДЭГ · ТҮГЖЭЭ — 2026-10-12 (дарааллын аудит).
 * Хуваарь (`huvaariBatlah`) · обьём (`obyemBatlah`) · нэмэлт ажил (`ajilBatlah`, `pending` + `approved`) — БАЙГАА
 * уншигчдаар (`loadAllPending`/`loadAllApproved`), юу ч бичихгүй.
 */
export type HeldByUser = { user: string; pending: number; partial: number; locks: number };
export async function pendingHeldBy(users: readonly string[]): Promise<HeldByUser[] | null> {
  const want = new Set(users.map(norm).filter(Boolean));
  if (!want.size) return [];
  try {
    const [plans, obyems, ajilP, ajilA] = await Promise.all([
      hv.loadAllPending(), ob.loadAllPending(), aj.loadAllPending(), aj.loadAllApproved(),
    ]);
    const out = new Map<string, HeldByUser>();
    const at = (u: string): HeldByUser => {
      let x = out.get(u);
      if (!x) { x = { user: u, pending: 0, partial: 0, locks: 0 }; out.set(u, x); }
      return x;
    };
    const tally = (author: string | null, holder: string | null, partial: string | null) => {
      const a = norm(author ?? '');
      if (a && want.has(a)) at(a).pending += 1;
      const p = norm(partial ?? '');
      if (p && want.has(p)) at(p).partial += 1;
      const h = norm(holder ?? '');
      /* Хагас бичилтийн тэмдэгтэй мөрийн түгжээ нь ижил хүнийх — давхар тоолохгүй */
      if (h && want.has(h) && h !== p) at(h).locks += 1;
    };
    for (const x of plans) tally(x.author, hv.claimHolderOf(x), hv.partialBy(x.status, x.reason));
    for (const x of obyems) tally(x.author, ob.claimHolderOf(x), ob.partialBy(x.status, x.reason));
    for (const x of ajilP) tally(x.author, aj.ajilClaimHolder(x), null);
    for (const x of ajilA) tally(null, aj.ajilClaimHolder(x), null);
    return [...out.values()].filter((x) => x.pending || x.partial || x.locks);
  } catch {
    return null;
  }
}
export type HeldByReader = (users: readonly string[]) => Promise<HeldByUser[] | null>;
let heldByReader: HeldByReader = pendingHeldBy;
export function setHeldByReader(fn: HeldByReader | null): void { heldByReader = fn ?? pendingHeldBy; }
const HELD_BY_TIMEOUT_MS = 2500;
async function heldByBounded(users: readonly string[]): Promise<HeldByUser[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<null>((r) => { timer = setTimeout(() => r(null), HELD_BY_TIMEOUT_MS); (timer as { unref?: () => void }).unref?.(); });
  try { return await Promise.race([heldByReader(users).catch(() => null), limit]); } finally { if (timer) clearTimeout(timer); }
}
/** `pendingHeldBy`-ийн үр дүнг асуултын текст болгоно — хоосон бол `''` (2026-10-12) */
export function heldByText(items: HeldByUser[] | null): string {
  if (items == null) return tr('Хүлээгдэж буй илгээлт · хагас бичилтийн тэмдэг · түгжээг шалгаж чадсангүй — устгахаас өмнө «Хуваарь»/«Обьём»/«Нэмэлт ажил» батлах хуудсыг шалгана уу.');
  return items.map((x) => tr('«{0}»: хүлээгдэж буй илгээлт {1} · хагас бичилтийн тэмдэг {2} · батлах түгжээ {3} — хасвал/устгавал эдгээр эзэнгүй гацна (батлагч буцаах/гүйцээх хэрэгтэй).', x.user, String(x.pending), String(x.partial), String(x.locks))).join('\n');
}

/* ══════════════ Аккаунт УСТГАХ — «ажил гацах уу» урьдчилсан шалгалт (2026-10-22, аудит) ══════════════ */

/**
 * АККАУНТ УСТГАСНЫ ДАРААХ ЭРХИЙН ЗУРАГ — цэвэр. Устгагдах хүмүүсийг аккаунтын жагсаалтаас хасаж `gone`-д нэмнэ
 * (`erhOverview.pkgErh` тэднийг эзэн гэж тоолохгүй — хуваарилалтын мөр нь `purge*` хүртэл хэвээр ч ажил гацна).
 */
const afterRemoveUsers = (users: readonly string[]): After => (src) => {
  const drop = new Set(users.map(norm).filter(Boolean));
  return {
    ...src,
    users: src.users.filter((u) => !drop.has(norm(u))),
    supers: (src.supers ?? []).filter((u) => !drop.has(norm(u))),
    gone: [...new Set([...(src.gone ?? []), ...drop])],
  };
};

/**
 * Аккаунт(ууд)-ыг УСТГАХАД шинээр үүсэх ажил ГАЦААХ цоорхойн текст (хоосон = үгүй) — 2026-10-22 (аудит).
 */
export function removalBlockingText(users: readonly string[]): string {
  return users.length ? newBlockingText(afterRemoveUsers(users)) : '';
}

/**
 * ГҮЙЦЭТГЭЛ — УСТГАГДАХ ХҮНИЙ ШАТАНД ХҮЛЭЭГДЭЖ БУЙ АЖИЛ (2026-10-22, аудит).
 */
export type FlowWork = { bagts: string; owner: Stage; done: boolean };
export type FlowWaiting = { user: string; stage: Stage; waiting: number; orphaned: number };
export type FlowWorksReader = () => Promise<FlowWork[]>;
async function readFlowWorks(): Promise<FlowWork[]> {
  const [H, S, G] = await Promise.all([import('./hyanalt'), import('./hyanaltStore'), import('./hyanaltGroup')]);
  return G.groupWorks((await H.queryAll()).map(S.toRow))
    .map((w) => ({ bagts: w.bagts, owner: w.owner, done: w.status === H.STATUS.transferred }));
}
let flowWorksReader: FlowWorksReader = readFlowWorks;
export function setFlowWorksReader(fn: FlowWorksReader | null): void { flowWorksReader = fn ?? readFlowWorks; }
const FLOW_WAIT_TIMEOUT_MS = 4000;
export async function flowWaitingFor(users: readonly string[]): Promise<FlowWaiting[] | null> {
  const drop = new Set(users.map(norm).filter(Boolean));
  const mine = listAssigns().filter((a) => drop.has(norm(a.user)) && !a.viewOnly);
  if (!mine.length) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<null>((r) => { timer = setTimeout(() => r(null), FLOW_WAIT_TIMEOUT_MS); (timer as { unref?: () => void }).unref?.(); });
  let works: FlowWork[] | null;
  try {
    works = await Promise.race([flowWorksReader(), limit]);
  } catch {
    works = null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!works) return null;
  const covers = (b: readonly string[], g: string): boolean => b.includes(ALL_BAGTS) || b.includes(g);
  /* Үлдэх шийдвэрлэгчид — устгагдах · хүснэгтэд алга · порталд алга · «зөвхөн харна»-аас бусад */
  const others = listAssigns().filter((a) => {
    const k = norm(a.user);
    return !drop.has(k) && !a.viewOnly && isKnown(k) && !portalMissing(k);
  });
  return mine.map((a) => {
    const open = works.filter((w) => !w.done && w.owner === a.stage && covers(a.bagts, w.bagts));
    const orphaned = open.filter((w) => !others.some((o) => o.stage === a.stage && covers(o.bagts, w.bagts))).length;
    return { user: norm(a.user), stage: a.stage, waiting: open.length, orphaned };
  }).filter((x) => x.waiting > 0);
}
/** `flowWaitingFor`-ийн үр дүнг асуултын текст болгоно — хоосон бол `''` (2026-10-22) */
export function flowWaitingText(items: FlowWaiting[] | null): string {
  if (items == null) return tr('Гүйцэтгэлийн урсгалд хүлээгдэж буй ажлыг шалгаж чадсангүй — устгахаас өмнө «Гүйцэтгэл» хуудсыг шалгана уу.');
  return items.map((x) => tr('«{0}»: Гүйцэтгэлийн «{1}» шатанд {2} ажил хүлээгдэж байна — {3} нь өөр шийдвэрлэгчгүй үлдэж гацна.',
    x.user, STAGE_LABEL[x.stage], String(x.waiting), String(x.orphaned))).join('\n');
}

/**
 * Op-ыг гүйцэтгэнэ: түгжээ → асуултууд → бичилт → `sync` (+`granted`) хүлээнэ.
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
  const dg = op.user ? draftGuard(op.user, op.flow === true) : null;
  if (dg) { setErr(dg); return false; }
  const confirms = [...(op.confirm ?? [])];
  if (confirms.length && op.after) {
    const warn = newBlockingText(op.after);
    if (warn) confirms[confirms.length - 1] += `\n\n${warn}`;
  }
  if (confirms.length && op.user) {
    const held = await heldByBounded([op.user]);
    if (held && held.length) confirms[confirms.length - 1] += `\n\n${heldByText(held)}`;
  }
  for (const c of confirms) if (!(await askConfirm(c))) return false;
  if (!ready()) { setErr(lockMsg()); return false; }
  const undoWarn = !confirms.length && op.undo && op.after ? newBlockingText(op.after) : '';
  const who = op.user ? norm(op.user) : '';
  if (who) bump(who, 1);
  try {
    const r = op.run();
    if (!r.ok) { setErr(r.error ?? ''); return false; }
    setErr('');
    const [a, b] = await Promise.all([r.sync ?? Promise.resolve(true), r.granted ?? Promise.resolve(true)]);
    if (a === false || b === false) {
      const why = await import('./permsRemote').then((m) => m.takeWriteError()).catch(() => '');
      setErr(why || tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид'));
      return false;
    }
    if (!confirms.length && op.undo) {
      const undo = op.undo;
      if (undoWarn) setErr(undoWarn);
      void toastUndo(
        [op.done || tr('Хасагдлаа.'), undoWarn.replace(/\n+/g, ' ')].filter(Boolean).join(' '),
        () => { void runOp(undo(), setErr, ready); },
        undoWarn ? 10_000 : 6_000,
      );
    }
    return true;
  } finally {
    if (who) bump(who, -1);
  }
}
