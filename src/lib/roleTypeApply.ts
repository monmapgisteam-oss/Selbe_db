'use client';

/**
 * ЭРХИЙН ТӨРЛИЙГ ХЭРЭГЛЭГЧИД ХЭРЭГЖҮҮЛЭХ — «Төрлөөр тохируулах» (2026-09-25).
 *
 * Нэг дарахад төрлийн загварын (`roleTypes.tplOf`) БҮХ тохиргоо тухайн хүнд
 * бичигдэнэ: урсгалын шат · QAQC · таван үүрэгтэй систем · энгийн дөрвөн эрх ·
 * эцэст нь харагдац/үүргийн мөр.
 *
 * ⚠️ БИЧИХ ЗАМ ШИНЭ БИШ — `aclOps`-ийн `setGrantsRevokingRoles` /
 *    `removeRevokingRoles` (хасагдсан үүргийн эрхийг л буцаана), `guitsetgelAcl`,
 *    `qaqcAcl`, `caps.toggleCap`. Хэрэгжүүлэлт нь тэдгээрийг ДАРААЛАН дуудаж,
 *    алхам бүрийн `sync`-ийг хүлээнэ — эс бөгөөс `grantFlowAccess`-ийн бичсэн
 *    харагдац манай сүүлийн `setUser`-ийн ДАРАА бууж загварыг дарна.
 * ⚠️ ТӨРЛИЙН ТОХИРГООНД ЧЕКЛЭЭГҮЙ ЗҮЙЛ ХАСАГДАНА: төрөл = бүрэн тодорхойлолт.
 *    Өөр төрөлд шилжүүлэхэд хуучин төрлийн хуваарилалт үлдвэл хүн хоёр төрлийн
 *    эрхтэй болно (хяналтын цоорхой).
 * ⚠️ Түгжээ: бүх ACL уншигдаагүй бол татгалзана (`allAclReady`) — `[]`
 *    жагсаалтаас бичвэл хүний бусад мөрийг дарна.
 * ⚠️ 2026-09-25 (аудитын засвар): багц нь ТӨРЛӨӨРӨӨ (`sheet` · `butets`) тусдаа,
 *    бичихээс ӨМНӨ бүх системийн хамрах хүрээг шалгана, хэрэглэгч бүрд түгжээтэй,
 *    Super төрөл зөвхөн хатуу super-т, гаргалгаатай эрх = хуваарилалтын тусгал.
 */

import { t as tr } from './i18nCore';
import { ROLE_STAGE, bagtsKey, roleForUser, type Role } from './services';
import { setUser } from './permissions';
import { capsOf, toggleCap, type CapKey } from './caps';
import { ALL_BAGTS, type Grant } from './scopedAcl';
import { QAQC_CAP, ROLE_CAPS, SCOPED_SYSTEMS, type ScopedSys } from './aclRoleCaps';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from './butetsPacks';
import { listAssigns, removeAssign, setAssign, setViewOnly } from './guitsetgelAcl';
import { listQaqcAssigns, removeQaqcAssign, setQaqcAssign } from './qaqcAcl';
import {
  SCOPED_SYS, allAclReady, lockMsg, removeRevokingRoles, setGrantsRevokingRoles, type Write,
} from './aclOps';
import { PLAIN_SETTING, SCOPED_SETTING, SUPER_CAP, roleAccess, tplOf, typesReady } from './roleTypes';
import { capLabelShort, sysTitle } from '@/modules/erhLabels';

/* ══════════════════════ Багц ══════════════════════ */

/**
 * БАГЦЫН ХОЁР ТӨРӨЛ (2026-09-25, аудитын засвар).
 *   · `sheet`  — бөглөх хуудасны бүлэг (`PKG_GROUPS`-ийн НЭР): урсгал · QAQC ·
 *                хуваарь · обьём · нэмэлт ажил · чанарын баримт
 *   · `butets` — дэд бүтцийн багц (`BUTETS_PACKS`-ийн ТҮЛХҮҮР «БАГЦ51»)
 * ⚠️ ЯАГААД ТУСДАА: урьд нь хоёуланг нь `bagtsKey`-ээр НЭГ жагсаалт болгож
 *    бүх системд тараадаг байв. `bagtsKey` нь цэг/зураасыг хаядаг тул дэд
 *    бүтцийн «Багц 14» (БАГЦ14) бөглөх хуудасны «Багц 1.4»-тэй (БАГЦ14)
 *    давхцаж, дэд бүтцийн эрхтэй хүн өөр багцын хуваарь/урсгалд чимээгүй
 *    тэлэгдэнэ. Одоо төрөл бүр ӨӨРИЙН системд л очно — хооронд нь хөрвүүлэхгүй.
 */
export type PkgKind = 'sheet' | 'butets';
export type PkgSel = Record<PkgKind, string[]>;
/** Багцтай систем бүр */
export type SysId = 'flow' | 'qaqc' | ScopedSys;
/** Систем бүрийн одоогийн багц (бөөнөөр дахин хэрэгжүүлэхэд) */
export type PerSys = Partial<Record<SysId, string[]>>;

export const kindOf = (sys: SysId): PkgKind => (sys === 'butets' ? 'butets' : 'sheet');
export const emptySel = (): PkgSel => ({ sheet: [], butets: [] });

/** Сонгох багц — нэг төрлийн дотор */
export type PkgOption = { key: string; label: string };

/**
 * @param extra одоо хадгалагдсан ч жагсаалтад байхгүй утга (хуучин нэр г.м.) —
 *   чип болж харагдана, эс бөгөөс картаас хэрэгжүүлэхэд чимээгүй хасагдана.
 */
export function pkgOptions(kind: PkgKind, extra: readonly string[] = []): PkgOption[] {
  const base: PkgOption[] = kind === 'butets'
    ? BUTETS_PACKS.map((p) => ({ key: p.key, label: p.name }))
    : PKG_GROUPS.map((g) => ({ key: g, label: g }));
  const known = new Set(base.map((o) => o.key));
  const more = [...new Set(extra)].filter((k) => k !== ALL_BAGTS && !known.has(k)).map((k) => ({ key: k, label: k }));
  return [...base, ...more].sort((a, b) => a.label.localeCompare(b.label, 'mn', { numeric: true }));
}

/**
 * Нэрнээс багц таних — «bagts5_1_…» → Багц 5.1, «Bagts8_2engineer» → Багц 8.2.
 * ⚠️ Зөвхөн БАЙГАА багц буцаана; танихгүй бол `[]` (админ өөрөө сонгоно).
 * ⚠️ 2026-09-25: төрөл бүрийг ТУСАД НЬ тааруулна (толгойн ⚠️).
 */
export function pkgsFromName(user: string): PkgSel {
  const m = /bagts[\s_-]*(\d+)(?:[_.-](\d+))?/i.exec(user);
  if (!m) return emptySel();
  const two = `БАГЦ${m[1]}${m[2] ?? ''}`;
  const one = `БАГЦ${m[1]}`;
  const pick = (keys: { id: string; k: string }[]): string[] => {
    const hit2 = keys.filter((x) => x.k === two).map((x) => x.id);
    if (hit2.length) return hit2;
    return keys.filter((x) => x.k === one).map((x) => x.id);
  };
  return {
    sheet: pick(PKG_GROUPS.map((g) => ({ id: g, k: bagtsKey(g) }))),
    butets: pick(BUTETS_PACKS.map((p) => ({ id: p.key, k: p.key }))),
  };
}

/** Хүний систем БҮРИЙН одоогийн багц (хадгалсан утгаараа) — «бүх багц» орохгүй */
export function currentPkgs(user: string): PerSys {
  const u = user.trim().toLowerCase();
  const out: PerSys = {};
  const put = (sys: SysId, arr: string[] | undefined) => {
    const b = [...new Set((arr ?? []).filter((x) => x !== ALL_BAGTS))];
    if (b.length) out[sys] = b;
  };
  put('flow', listAssigns().find((a) => a.user === u)?.bagts);
  put('qaqc', listQaqcAssigns().find((a) => a.user === u)?.bagts);
  for (const sys of SCOPED_SYSTEMS) {
    put(sys, (SCOPED_SYS[sys].list().find((a) => a.user === u)?.grants ?? []).flatMap((g) => g.bagts));
  }
  return out;
}

/** Төрөл бүрийн одоогийн багцын НЭГДЭЛ — картын чипийн анхдагч */
export function currentSel(user: string): PkgSel {
  const per = currentPkgs(user);
  const sel = emptySel();
  for (const [sys, b] of Object.entries(per) as [SysId, string[]][]) {
    const k = kindOf(sys);
    sel[k] = [...new Set([...sel[k], ...b])];
  }
  return sel;
}

/**
 * Анхдагч сонголт — төрөл бүрд одоогийн хуваарилалт, байхгүй бол НЭРНЭЭС.
 * ⚠️ Дуудагч `allAclReady()`-г шалгана — уншигдаагүй жагсаалт `[]` тул нэрээр
 *    таамагласан багц бодит хуваарилалтыг ОРЛОНО.
 */
export function defaultSel(user: string): PkgSel {
  const cur = currentSel(user);
  const byName = pkgsFromName(user);
  return {
    sheet: cur.sheet.length ? cur.sheet : byName.sheet,
    butets: cur.butets.length ? cur.butets : byName.butets,
  };
}

/* ══════════════════════ Түгжээ · ноорог (2026-09-25) ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ТҮГЖЭЭ — карт ба бөөнөөр хэрэгжүүлэлт ХУВААЛЦАНА.
 * ⚠️ ЯАГААД: хоёр `applyType` нэг хүнд зэрэг явбал алхмууд нь холилдож
 *    (нэг нь хуваарилалт хасаж, нөгөө нь нэмнэ) үр дүн аль ч төрөлтэй таарахгүй.
 */
const userLocks = new Set<string>();
const LOCK_EVENT = 'selbe-roletype-lock';
const emit = (ev: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(ev)); };
export const typeApplyBusy = (user: string): boolean => userLocks.has(user.trim().toLowerCase());
export function subscribeTypeLock(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCK_EVENT, fn);
  return () => window.removeEventListener(LOCK_EVENT, fn);
}

/**
 * «ХЭРЭГЛЭГЧИД» САМБАРЫН ХАДГАЛААГҮЙ НООРОГТОЙ ХЭРЭГЛЭГЧИД — `UserAdmin` бүртгэнэ.
 * ⚠️ Хэрэгжүүлэлт нь эрхийн мөрийг (`setUser`) бичдэг тул ноорогтой хүнд
 *    бичвэл дараагийн «Хадгалах» нь манай бичилтийг ХУУЧИН ноорогоор дарна.
 */
let draftUsers = new Set<string>();
export function setTypeDraftUsers(keys: Iterable<string>): void {
  draftUsers = new Set([...keys].map((k) => k.trim().toLowerCase()));
}

/* ══════════════════════ Хэрэгжүүлэлт ══════════════════════ */

export type ApplyResult = { ok: boolean; errors: string[] };

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Хуваарилалтаас гардаг бүх эрх (QAQC + таван систем) */
const DERIVED_CAPS: CapKey[] = [...new Set<CapKey>([
  QAQC_CAP,
  ...SCOPED_SYSTEMS.flatMap((sys) => Object.values(ROLE_CAPS[sys]) as CapKey[]),
])];

/** Одоогийн хуваарилалтаар ДЭМЖИГДСЭН эрхүүд */
function backedCaps(u: string): Set<CapKey> {
  const out = new Set<CapKey>();
  if (listQaqcAssigns().some((a) => a.user === u)) out.add(QAQC_CAP);
  for (const sys of SCOPED_SYSTEMS) {
    const map = ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>;
    for (const g of SCOPED_SYS[sys].list().find((a) => a.user === u)?.grants ?? []) {
      const c = map[g.role];
      if (c && g.bagts.length) out.add(c);
    }
  }
  return out;
}

/**
 * @param sel төрөл бүрийн сонгосон багц (картын чип). Загварын хүрээ «Бүх багц» бол үл хэрэгсэнэ.
 * @param perSys систем бүрийн багц — байвал тэр системд `sel`-ийг ДАРНА
 *   (бөөнөөр дахин хэрэгжүүлэхэд хүн бүрийн одоогийн хүрээ хадгалагдана).
 */
export async function applyType(user: string, role: Role, sel: PkgSel, perSys: PerSys = {}): Promise<ApplyResult> {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, errors: [tr('Аккаунтын нэрээ бичнэ үү')] };
  /* ⚠️ 2026-09-25: синкээс өмнө `tplOf` нь нарийн нөөц — түүнийг тараавал хүний эрх хумигдана */
  if (!typesReady()) return { ok: false, errors: [tr('Эрхийн төрлийн загвар уншигдаагүй — дахин ачаална уу.')] };
  if (!allAclReady()) return { ok: false, errors: [lockMsg()] };
  const hard = roleForUser(u) === 'super';
  /* ⚠️ Хатуу super-ийг панелаас доошлуулахгүй — `permissions.hasAccess`-ийн ⚠️ */
  if (hard && role !== 'super') {
    return { ok: false, errors: [tr('Кодонд бүртгэлтэй админыг (super) өөр төрөлд шилжүүлэх боломжгүй.')] };
  }
  /* ⚠️ 2026-09-25: админ самбарын эрх ЗӨВХӨН кодоор (`ROLE_BY_USER`). Super төрлийг
     бусдад тараавал шууд олгосон эрхүүд хуваарилалтгүй (өнчин) үлдэж, үүрэг нь
     «super» болсон override мөр бичигдэнэ. */
  if (!hard && role === 'super') {
    return { ok: false, errors: [tr('Super төрөл зөвхөн кодонд бүртгэлтэй админд — админ самбарын эрх кодоор л олгогдоно.')] };
  }
  if (draftUsers.has(u)) {
    return { ok: false, errors: [tr('Хадгалаагүй ноорогтой — эхлээд «Хадгалах» эсвэл «Цуцлах» дарна уу.')] };
  }
  if (userLocks.has(u)) {
    return { ok: false, errors: [tr('Энэ хэрэглэгчид тохируулга явагдаж байна — дуустал хүлээнэ үү.')] };
  }
  userLocks.add(u);
  emit(LOCK_EVENT);
  try {
    return await applyInner(u, role, sel, perSys);
  } finally {
    userLocks.delete(u);
    emit(LOCK_EVENT);
  }
}

async function applyInner(u: string, role: Role, sel: PkgSel, perSys: PerSys): Promise<ApplyResult> {
  const errors: string[] = [];
  const tpl = tplOf(role);
  const on = new Set(tpl.on);
  const all = tpl.scope === 'all';
  const isSuper = role === 'super';
  const scopeOf = (sys: SysId): string[] => {
    if (all) return [ALL_BAGTS];
    const own = perSys[sys];
    return own && own.length ? own : sel[kindOf(sys)];
  };

  /** Нэг бичилт — няцаалт/ArcGIS алдааг цуглуулж, `sync`-ийг ХҮЛЭЭНЭ */
  const step = async (label: string, w: Write): Promise<void> => {
    if (!w.ok) { errors.push(`${label}: ${w.error ?? ''}`); return; }
    const [a, b] = await Promise.all([w.sync ?? Promise.resolve(true), w.granted ?? Promise.resolve(true)]);
    if (a === false || b === false) errors.push(tr('{0}: ArcGIS-т хадгалагдсангүй', label));
  };
  const capTo = async (c: CapKey, want: boolean): Promise<void> => {
    if (capsOf(u).includes(c) === want) return;
    if (!(await toggleCap(u, c, want))) errors.push(tr('{0}: ArcGIS-т хадгалагдсангүй', capLabelShort(c)));
  };

  /* ── 0. ТӨЛӨВЛӨГӨӨ ба УРЬДЧИЛСАН ШАЛГАЛТ (2026-09-25) ──
     ⚠️ Урьд нь багц нь системийг хамрахгүй бол grant нь `[]` болж хуваарилалт
        ЧИМЭЭГҮЙ хасагддаг, алдаа нь бичилтийн ДУНД гардаг байв (хагас
        хэрэгжсэн төлөв). Одоо юу ч бичихээс ӨМНӨ бүгдийг шалгана. */
  const stage = isSuper ? undefined : ROLE_STAGE[role];
  const act = on.has('flow:act');
  const vo = on.has('flow:viewOnly');
  const wantFlow = !!stage && (act || vo);
  const wantQaqc = !isSuper && on.has('cap:qaqc');
  const wantGrants = {} as Record<ScopedSys, Grant<string>[]>;
  for (const sys of SCOPED_SYSTEMS) {
    wantGrants[sys] = isSuper ? [] : Object.entries(SCOPED_SETTING)
      .filter(([id, v]) => v.sys === sys && on.has(id))
      .map(([, v]) => ({ role: v.role, bagts: scopeOf(sys) }));
  }
  const needed: SysId[] = [
    ...(wantFlow ? ['flow' as const] : []),
    ...(wantQaqc ? ['qaqc' as const] : []),
    ...SCOPED_SYSTEMS.filter((sys) => wantGrants[sys].length > 0),
  ];
  const uncovered = needed.filter((sys) => !scopeOf(sys).length);
  if (uncovered.length) {
    if (!sel.sheet.length && !sel.butets.length) {
      return { ok: false, errors: [tr('Багц сонгоно уу — энэ төрөл зөвхөн оноосон багцаа хардаг.')] };
    }
    return {
      ok: false,
      errors: uncovered.map((sys) => (kindOf(sys) === 'butets'
        ? tr('{0}: дэд бүтцийн багц сонгоогүй', sysTitle(sys))
        : tr('{0}: бөглөх хуудасны багц сонгоогүй', sysTitle(sys)))),
    };
  }

  /* ── 1. Урсгалын шат ── */
  const flowCur = listAssigns().find((a) => a.user === u);
  if (wantFlow && stage) {
    const bagts = scopeOf('flow');
    if (!flowCur || flowCur.stage !== stage || !sameSet(flowCur.bagts, bagts)) {
      const fresh = !flowCur || flowCur.stage !== stage;
      await step(sysTitle('flow'), setAssign(u, stage, bagts, fresh));
    }
    const wantVo = !act && vo;
    const now = listAssigns().find((a) => a.user === u);
    if (now && (now.viewOnly === true) !== wantVo) await step(tr('Зөвхөн харна'), setViewOnly(u, wantVo));
  } else if (flowCur) {
    await step(sysTitle('flow'), { ok: true, sync: removeAssign(u, flowCur.stage).sync });
  }

  /* ── 2. QAQC ── */
  const qCur = listQaqcAssigns().find((a) => a.user === u);
  if (wantQaqc) {
    const bagts = scopeOf('qaqc');
    if (!qCur) await step(sysTitle('qaqc'), setQaqcAssign(u, bagts));
    else if (!sameSet(qCur.bagts, bagts)) await step(sysTitle('qaqc'), setQaqcAssign(u, bagts, false));
  } else if (qCur) {
    /* ⚠️ Super-т эрх нь шууд (доор) — хуваарилалт хасахдаа эрхийг нь буцаахгүй */
    await step(sysTitle('qaqc'), removeQaqcAssign(u, !isSuper));
  }

  /* ── 3. Үүрэгтэй таван систем ── */
  for (const sys of SCOPED_SYSTEMS) {
    const spec = SCOPED_SYS[sys];
    const cur = spec.list().find((a) => a.user === u);
    const grants = wantGrants[sys];
    if (!grants.length) {
      if (cur) {
        const w = isSuper
          ? spec.removeNoRevoke(u)
          : removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps);
        await step(sysTitle(sys), w);
      }
      continue;
    }
    const same = cur && cur.grants.length === grants.length
      && grants.every((g) => cur.grants.some((c) => c.role === g.role && sameSet(c.bagts, g.bagts)));
    if (!same) await step(sysTitle(sys), setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps));
  }

  /* ── 4. Эрх: super-т бүгд шууд, бусдад энгийн дөрөв + хуваарилалтын тусгал ── */
  if (isSuper) {
    const want = new Set<CapKey>(Object.entries(SUPER_CAP).filter(([id]) => on.has(id)).map(([, c]) => c));
    for (const c of new Set<CapKey>(Object.values(SUPER_CAP))) await capTo(c, want.has(c));
  } else {
    for (const [id, c] of Object.entries(PLAIN_SETTING)) await capTo(c, on.has(id));
    /* ⚠️ 2026-09-25: гаргалгаатай эрх = хуваарилалтын ТУСГАЛ (`aclRoleCaps`-ийн ⚠️).
       Хуваарилалтгүй эрхийг (өмнө нь super/гараар олгосон — `removeRevokingRoles`
       зөвхөн БАЙСАН үүргийнхийг буцаадаг) хасаж, хуваарилалт ижил тул алгассан
       систем дэх ДУТУУ эрхийг нөхнө. */
    const backed = backedCaps(u);
    for (const c of DERIVED_CAPS) await capTo(c, backed.has(c));
  }

  /* ── 5. Харагдац · баримт · үүрэг — ХАМГИЙН СҮҮЛД (толгойн ⚠️) ──
     ⚠️ 2026-09-25: хатуу super-т override мөр БИЧИХГҮЙ — эрх нь кодоос (`ROLE_BY_USER`) */
  if (!isSuper) {
    const acc = roleAccess(role);
    if (!(await setUser(u, { views: acc.views, docs: acc.docs }, role))) {
      errors.push(tr('Харагдац: ArcGIS-т хадгалагдсангүй'));
    }
  }

  return { ok: errors.length === 0, errors };
}

/* ══════════════════════ Бөөнөөр (2026-09-25) ══════════════════════ */

/**
 * «ХЭРЭГЖҮҮЛЭХ» — төрлийн бүх хэрэглэгчид.
 * ⚠️ МОДУЛИЙН ТҮВШНИЙ ТӨЛӨВ: урьд нь `ErhTypes`-ийн React төлөвт байсан тул
 *    таб солиход (unmount) давталт үргэлжилсээр, буцаж ороход «Хэрэгжүүлэх»
 *    дахин нээлттэй — хоёр давталт зэрэг явж болдог байв. Одоо нэг л давталт.
 * ⚠️ Хүн бүрд ӨӨРИЙН системийн одоогийн багц (`currentPkgs`) — нэгтгэлийг
 *    бүх системд тараахгүй (толгойн ⚠️); хуваарилалтгүй системд л төрлийн
 *    нэгдэл, байхгүй бол нэрнээс.
 * ⚠️ «Хэрэглэгчид» самбарт хадгалаагүй ноорогтой хүнийг АЛГАСЧ мэдээлнэ.
 */
export type BulkState = {
  role: Role; total: number; ok: number; errors: string[]; skipped: string[]; running: boolean;
};
let bulk: BulkState | null = null;
const BULK_EVENT = 'selbe-roletype-bulk';
export const bulkStatus = (): BulkState | null => bulk;
export function subscribeBulk(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(BULK_EVENT, fn);
  return () => window.removeEventListener(BULK_EVENT, fn);
}

/** @returns `false` — өөр давталт явагдаж байна */
export async function applyTypeBulk(role: Role, users: string[]): Promise<boolean> {
  if (bulk?.running) return false;
  let st: BulkState = { role, total: users.length, ok: 0, errors: [], skipped: [], running: true };
  const set = (n: BulkState) => { st = n; bulk = n; emit(BULK_EVENT); };
  set(st);
  try {
    for (const raw of users) {
      const u = raw.trim().toLowerCase();
      if (draftUsers.has(u)) { set({ ...st, skipped: [...st.skipped, u] }); continue; }
      const res = await applyType(u, role, defaultSel(u), currentPkgs(u));
      set(res.ok ? { ...st, ok: st.ok + 1 } : { ...st, errors: [...st.errors, `${u}: ${res.errors.join('; ')}`] });
    }
  } catch (e) {
    set({ ...st, errors: [...st.errors, String(e)] });
  } finally {
    set({ ...st, running: false });
  }
  return true;
}
