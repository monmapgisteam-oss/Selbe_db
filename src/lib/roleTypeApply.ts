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
 */

import { t as tr } from './i18nCore';
import { ROLE_STAGE, bagtsKey, roleForUser, type Role } from './services';
import { setUser } from './permissions';
import { capsOf, toggleCap, type CapKey } from './caps';
import { ALL_BAGTS, type Grant } from './scopedAcl';
import { SCOPED_SYSTEMS } from './aclRoleCaps';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from './butetsPacks';
import { listAssigns, removeAssign, setAssign, setViewOnly } from './guitsetgelAcl';
import { listQaqcAssigns, removeQaqcAssign, setQaqcAssign } from './qaqcAcl';
import {
  SCOPED_SYS, allAclReady, lockMsg, removeRevokingRoles, setGrantsRevokingRoles, type Write,
} from './aclOps';
import { PLAIN_SETTING, SCOPED_SETTING, SUPER_CAP, roleAccess, tplOf } from './roleTypes';

/* ══════════════════════ Багц ══════════════════════ */

/** Сонгох багц — бөглөх хуудасны бүлэг ба дэд бүтцийн багцын НЭГДЭЛ (`bagtsKey`-ээр) */
export type PkgOption = { key: string; label: string };

export function pkgOptions(): PkgOption[] {
  const m = new Map<string, string>();
  for (const g of PKG_GROUPS) m.set(bagtsKey(g), g);
  for (const p of BUTETS_PACKS) if (!m.has(p.key)) m.set(p.key, p.name);
  return [...m.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn', { numeric: true }));
}

/**
 * Нэрнээс багц таних — «bagts5_1_…» → БАГЦ51, «Bagts8_2engineer» → БАГЦ82.
 * ⚠️ Зөвхөн БАЙГАА багц буцаана; танихгүй бол `[]` (админ өөрөө сонгоно).
 */
export function pkgsFromName(user: string): string[] {
  const m = /bagts[\s_-]*(\d+)(?:[_.-](\d+))?/i.exec(user);
  if (!m) return [];
  const known = new Set(pkgOptions().map((p) => p.key));
  const two = `БАГЦ${m[1]}${m[2] ?? ''}`;
  if (known.has(two)) return [two];
  const one = `БАГЦ${m[1]}`;
  return known.has(one) ? [one] : [];
}

/** Хүний одоогийн бүх хуваарилалтын багц (`bagtsKey`) — «бүх багц» орохгүй */
export function currentPkgs(user: string): string[] {
  const u = user.trim().toLowerCase();
  const out = new Set<string>();
  const add = (arr: string[] | undefined) => {
    for (const b of arr ?? []) if (b !== ALL_BAGTS) out.add(bagtsKey(b));
  };
  add(listAssigns().find((a) => a.user === u)?.bagts);
  add(listQaqcAssigns().find((a) => a.user === u)?.bagts);
  for (const sys of SCOPED_SYSTEMS) {
    for (const g of SCOPED_SYS[sys].list().find((a) => a.user === u)?.grants ?? []) add(g.bagts);
  }
  return [...out];
}

/* ══════════════════════ Хэрэгжүүлэлт ══════════════════════ */

export type ApplyResult = { ok: boolean; errors: string[] };

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * @param pkgKeys `bagtsKey` хэлбэрийн багцууд (`pkgOptions().key`). Загварын
 *   хүрээ «Бүх багц» бол үл хэрэгсэнэ.
 */
export async function applyType(user: string, role: Role, pkgKeys: string[]): Promise<ApplyResult> {
  const u = user.trim().toLowerCase();
  const errors: string[] = [];
  if (!u) return { ok: false, errors: [tr('Аккаунтын нэрээ бичнэ үү')] };
  if (!allAclReady()) return { ok: false, errors: [lockMsg()] };
  /* ⚠️ Хатуу super-ийг панелаас доошлуулахгүй — `permissions.hasAccess`-ийн ⚠️ */
  if (roleForUser(u) === 'super' && role !== 'super') {
    return { ok: false, errors: [tr('Кодонд бүртгэлтэй админыг (super) өөр төрөлд шилжүүлэх боломжгүй.')] };
  }

  const tpl = tplOf(role);
  const on = new Set(tpl.on);
  const all = tpl.scope === 'all';
  const groups = PKG_GROUPS.filter((g) => pkgKeys.includes(bagtsKey(g)));
  const packs = BUTETS_PACKS.filter((p) => pkgKeys.includes(p.key)).map((p) => p.key);
  const scopeOf = (sys: string): string[] => (all ? [ALL_BAGTS] : sys === 'butets' ? packs : groups);

  /** Нэг бичилт — няцаалт/ArcGIS алдааг цуглуулж, `sync`-ийг ХҮЛЭЭНЭ */
  const step = async (label: string, w: Write): Promise<void> => {
    if (!w.ok) { errors.push(`${label}: ${w.error ?? ''}`); return; }
    const [a, b] = await Promise.all([w.sync ?? Promise.resolve(true), w.granted ?? Promise.resolve(true)]);
    if (a === false || b === false) errors.push(tr('{0}: ArcGIS-т хадгалагдсангүй', label));
  };
  const capTo = async (c: CapKey, want: boolean): Promise<void> => {
    if (capsOf(u).includes(c) === want) return;
    if (!(await toggleCap(u, c, want))) errors.push(tr('{0}: ArcGIS-т хадгалагдсангүй', c));
  };

  const scoped = Object.keys(SCOPED_SETTING).some((id) => on.has(id))
    || on.has('cap:qaqc') || (!!ROLE_STAGE[role] && (on.has('flow:act') || on.has('flow:viewOnly')));
  if (role !== 'super' && !all && scoped && !groups.length && !packs.length) {
    return { ok: false, errors: [tr('Багц сонгоно уу — энэ төрөл зөвхөн оноосон багцаа хардаг.')] };
  }

  /* ── 1. Урсгалын шат ── */
  const stage = role === 'super' ? undefined : ROLE_STAGE[role];
  const act = on.has('flow:act');
  const vo = on.has('flow:viewOnly');
  const flowCur = listAssigns().find((a) => a.user === u);
  if (stage && (act || vo)) {
    const bagts = scopeOf('flow');
    if (!bagts.length) {
      errors.push(tr('Гүйцэтгэлийн урсгал: сонгосон багц бөглөх хуудасгүй (зөвхөн дэд бүтэц)'));
    } else {
      if (!flowCur || flowCur.stage !== stage || !sameSet(flowCur.bagts, bagts)) {
        const fresh = !flowCur || flowCur.stage !== stage;
        await step(tr('Гүйцэтгэлийн урсгал'), setAssign(u, stage, bagts, fresh));
      }
      const wantVo = !act && vo;
      const now = listAssigns().find((a) => a.user === u);
      if (now && (now.viewOnly === true) !== wantVo) await step(tr('Зөвхөн харна'), setViewOnly(u, wantVo));
    }
  } else if (flowCur) {
    await step(tr('Гүйцэтгэлийн урсгал'), { ok: true, sync: removeAssign(u, flowCur.stage).sync });
  }

  /* ── 2. QAQC ── */
  const qCur = listQaqcAssigns().find((a) => a.user === u);
  if (role !== 'super' && on.has('cap:qaqc')) {
    const bagts = scopeOf('qaqc');
    if (!bagts.length) errors.push(tr('QAQC: сонгосон багц бөглөх хуудасгүй'));
    else if (!qCur) await step('QAQC', setQaqcAssign(u, bagts));
    else if (!sameSet(qCur.bagts, bagts)) await step('QAQC', setQaqcAssign(u, bagts, false));
  } else if (qCur) {
    /* ⚠️ Super-т эрх нь шууд (доор) — хуваарилалт хасахдаа эрхийг нь буцаахгүй */
    await step('QAQC', removeQaqcAssign(u, role !== 'super'));
  }

  /* ── 3. Үүрэгтэй таван систем ── */
  for (const sys of SCOPED_SYSTEMS) {
    const spec = SCOPED_SYS[sys];
    const cur = spec.list().find((a) => a.user === u);
    const grants: Grant<string>[] = role === 'super' ? [] : Object.entries(SCOPED_SETTING)
      .filter(([id, v]) => v.sys === sys && on.has(id))
      .map(([, v]) => ({ role: v.role, bagts: scopeOf(sys) }))
      .filter((g) => g.bagts.length > 0);
    if (!grants.length) {
      if (cur) {
        const w = role === 'super'
          ? spec.removeNoRevoke(u)
          : removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps);
        await step(sys, w);
      }
      continue;
    }
    const same = cur && cur.grants.length === grants.length
      && grants.every((g) => cur.grants.some((c) => c.role === g.role && sameSet(c.bagts, g.bagts)));
    if (!same) await step(sys, setGrantsRevokingRoles(u, grants, spec.list, spec.setGrants, spec.roleCaps));
  }

  /* ── 4. Эрх: super-т бүгд шууд, бусдад энгийн дөрөв ── */
  if (role === 'super') {
    const want = new Set<CapKey>(Object.entries(SUPER_CAP).filter(([id]) => on.has(id)).map(([, c]) => c));
    for (const c of new Set<CapKey>(Object.values(SUPER_CAP))) await capTo(c, want.has(c));
  } else {
    for (const [id, c] of Object.entries(PLAIN_SETTING)) await capTo(c, on.has(id));
  }

  /* ── 5. Харагдац · баримт · үүрэг — ХАМГИЙН СҮҮЛД (толгойн ⚠️) ── */
  const acc = roleAccess(role);
  if (!(await setUser(u, { views: acc.views, docs: acc.docs }, role))) {
    errors.push(tr('Харагдац: ArcGIS-т хадгалагдсангүй'));
  }

  return { ok: errors.length === 0, errors };
}
