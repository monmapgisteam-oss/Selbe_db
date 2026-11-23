'use client';

/**
 * ШИНЭ ЭРХИЙН ДЭЛГЭЦИЙН УНШИЛТ · БИЧИЛТ (2026-11-23) — `erhNew.ts`-ийн цэвэр логикийг одоо байгаа дэлгүүр ба бичих
 * функцүүдтэй холбоно. Шинэ бичих зам НЭМЭХГҮЙ: аккаунтын мөр `permissions.setUser`, урсгал `guitsetgelAcl.setAssign` /
 * `removeAssign` / `setViewOnly`, багцын хуваарилалт `aclOps.SCOPED_SYS` (+ хасагдсан үүргийн эрхийг буцаах
 * `setGrantsRevokingRoles` / `removeRevokingRoles`), энгийн эрх `caps.setCaps`, аккаунт хасах `permissions.removeUser` + `purge*`.
 *
 * УРСГАЛЫН ТОМИЛГОО ЭРХ ДАГУУЛАХГҮЙ (`grant=false` · `revoke=false`): `grantFlowAccess` / `revokeFlowAccess` нь аккаунтын
 * мөрийн үүрэг · харагдацыг ДАХИН бичдэг — админы дөнгөж баталсан албан үүрэг · харагдацыг дарна. «Гүйцэтгэл» харагдац ажиллах
 * үед томилгооноос нээгддэг (`permissions.workflowViewsOf`) тул хадгалах шаардлагагүй.
 */

import { t as tr } from './i18nCore';
import { initRemote, listRemoved, listUsers, removeUser, roleOf, setUser, type UserBase } from './permissions';
import { capsStored, setCaps } from './caps';
import { listAssigns, purgeAssign, removeAssign, setAssign, setViewOnly } from './guitsetgelAcl';
import { SCOPED_SYS, removeRevokingRoles, setGrantsRevokingRoles, type Write } from './aclOps';
import { purgeHuvaariAssign } from './huvaariAcl';
import { purgeObyemAssign } from './obyemAcl';
import { purgeChanarAssign } from './chanarAcl';
import { purgeAjilAssign } from './ajilAcl';
import { purgeButetsAssign } from './butetsAcl';
import { purgeHabeaAssign } from './habeaAcl';
import { SCOPED_SYSTEMS } from './aclRoleCaps';
import type { CapKey } from './caps';
import type { Snapshot, Step } from './erhNew';

const lc = (s: string): string => s.trim().toLowerCase();

/** Одоогийн бүх мөр — дэлгүүрүүдээс (сүлжээгүй) */
export function liveSnapshot(): Snapshot {
  const users = listUsers();
  return {
    accounts: users.map((u) => ({ user: u.username, role: roleOf(u.username) ?? u.role, views: u.views, docs: u.docs })),
    flow: listAssigns(),
    acl: Object.fromEntries(SCOPED_SYSTEMS.map((sys) => [sys, SCOPED_SYS[sys].list()])),
    caps: Object.fromEntries(users.map((u) => [lc(u.username), capsStored(u.username)])),
  };
}

/** Устгагдсан аккаунтууд (шинэ нэр давхардахгүй) */
export const removedAccounts = (): string[] => listRemoved();

/** Бичилтийн `sync` + `granted`-ийг хүлээнэ */
async function settle(w: Write): Promise<boolean> {
  if (!w.ok) throw new Error(w.error || tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид'));
  const [a, b] = await Promise.all([w.sync ?? Promise.resolve(true), w.granted ?? Promise.resolve(true)]);
  return a !== false && b !== false;
}

/** Урсгал: нэг шат · багц · «зөвхөн харна» — эрх дагуулахгүй (толгойн тайлбар) */
async function writeFlow(u: string, step: Extract<Step, { kind: 'flow' }>): Promise<boolean> {
  const cur = listAssigns().find((a) => a.user === u) ?? null;
  const want = step.flow;
  if (!want) return cur ? removeAssign(u, cur.stage, false).sync : true;
  const sameBagts = !!cur && cur.bagts.length === want.bagts.length && want.bagts.every((b) => cur.bagts.includes(b));
  if (!cur || cur.stage !== want.stage || !sameBagts) {
    if (!(await settle(setAssign(u, want.stage, [...want.bagts], false)))) return false;
  }
  const row = listAssigns().find((a) => a.user === u);
  if (row && (row.viewOnly === true) !== want.viewOnly) return settle(setViewOnly(u, want.viewOnly));
  return true;
}

export type StepResult = { step: Step; ok: boolean; skipped?: boolean; error?: string };

/**
 * ТӨЛӨВЛӨГӨӨГ ДАРААЛЛААР БИЧНЭ — алхам бүрийг хүлээж, үр дүнг тус бүрд нь буцаана. Аккаунтын мөр бичигдээгүй бол үлдсэнийг
 * АЛГАСНА (мөргүй аккаунтад хуваарилалт бичихгүй). Дууссаны дараа бүх хүснэгтийг дахин уншина.
 */
export async function applyPlan(user: string, steps: readonly Step[]): Promise<StepResult[]> {
  const u = lc(user);
  const out: StepResult[] = [];
  let stop = false;
  for (const step of steps) {
    if (stop) { out.push({ step, ok: false, skipped: true }); continue; }
    let ok = false;
    let error = '';
    try {
      if (step.kind === 'account') {
        const row = listUsers().find((x) => lc(x.username) === u);
        const base: UserBase | undefined = row ? { views: row.views, docs: row.docs, role: row.role } : undefined;
        ok = await setUser(u, { views: step.views, docs: step.docs }, step.role, base);
      } else if (step.kind === 'flow') {
        ok = await writeFlow(u, step);
      } else if (step.kind === 'acl') {
        const spec = SCOPED_SYS[step.sys];
        ok = await settle(step.grants.length
          ? setGrantsRevokingRoles(u, step.grants, spec.list, spec.setGrants, spec.roleCaps)
          : removeRevokingRoles(u, spec.list, spec.removeNoRevoke, spec.roleCaps));
      } else {
        const cur = capsStored(u);
        const next = [...new Set<CapKey>([...cur.filter((c) => !step.remove.includes(c)), ...step.add])];
        ok = await setCaps(u, next);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!ok && !error) {
      error = await import('./permsRemote').then((m) => m.takeWriteError()).catch(() => '')
        || tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид');
    }
    out.push({ step, ok, ...(error ? { error } : {}) });
    if (!ok && step.kind === 'account') stop = true;
  }
  await reread();
  return out;
}

/** Бүх эрхийн хүснэгтийг ArcGIS-аас дахин уншина (самбарын «нээх» уншилттай ижил) */
export const reread = (): Promise<boolean> => initRemote(false, true).catch(() => false);

/**
 * АККАУНТ ХАСАХ — хуучин самбарын «Устгах → Хадгалах»-тай ижил дараалал: tombstone → урсгал ба зургаан хуваарилалтын мөр →
 * эрхийн мөр (`absolute`). Асуулт (ажил гацах эсэх) дуудагч талд.
 */
export async function removeAccount(user: string): Promise<{ ok: boolean; error?: string }> {
  const u = lc(user);
  try {
    if (!(await removeUser(u))) return { ok: false, error: tr('«{0}» устгагдсангүй.', u) };
    const parts = await Promise.all([
      purgeAssign(u), purgeHuvaariAssign(u), purgeObyemAssign(u), purgeChanarAssign(u), purgeAjilAssign(u),
      purgeButetsAssign(u), purgeHabeaAssign(u),
    ]);
    const capOk = await setCaps(u, [], { absolute: true });
    await reread();
    return parts.every(Boolean) && capOk ? { ok: true } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
