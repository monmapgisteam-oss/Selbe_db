/**
 * НИЙТИЙН ВЭБИЙН ХҮСНЭГТҮҮД — СИСТЕМЭЭС АВТОМАТ ШИНЭЧЛЭЛ (2026-11-03).
 *
 * Хэрэглэгч: «системд утгууд солигдоход дагаж солигддог байх» → порталд ямар нэг бичилт хийгдэх бүрт (`dataBus`
 * invalidate) ба портал нээгдэхэд 6 хүснэгтийг дахин бодож, ЗӨРСӨН мөрийг л дарж бичнэ (upsert + илүү мөр устгах).
 *   · Бичилт — нэвтэрсэн хэрэглэгчийн өөрийн токеноор (системийн бусад бичилттэй адил); хүснэгт org-д edit-тэй.
 *   · Эрхгүй (403) бол энэ сешнд дахин оролдохгүй; алдаа хэрэглэгчид харагдахгүй (console).
 *   · Эх унасан хүснэгтийг ХӨНДӨХГҮЙ (мөр устгахгүй) — хагас өгөгдлөөр нийтийн тоог хуурахгүй.
 *   · `applyAll` dataBus-ийг хөндөхгүй тул өөрийн бичилт дахин синк дуудахгүй (гогцоогүй).
 */
import { useEffect } from 'react';
import { subscribeData } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';
import { loadProjectPlan, landCountMap } from '@/lib/projectPlanInputs';
import { loadHoRows, groupHo } from '@/lib/ipc';
import { loadWorkforceDays } from '@/lib/ceo/workforce';
import { loadLandStatus } from '@/lib/land';
import { loadSchema, PKGS } from '@/modules/sheet/bagts.pkg';
import { BUILDING, SELBE_PUBLIC, SOURCE_FS, buildingKey, pkgKeyOf, bagtsKey } from '@/lib/services';
import {
  PUBLIC_KEYS, ehUusverRows, gazarRows, guitsetgelRows, hunHuchRows, isPkgNode, niigemRows, pubPkgCode, sanhuuRows,
  type PubBuilding, type PubGroup, type PubRow, type PublicTables,
} from './compute';

export type TableDiff = { adds: number; updates: number; deletes: number };
export type PublicSyncResult = {
  at: number;
  /** Хүснэгт бүрийн бичилт; эх унасан бол орохгүй */
  tables: Partial<Record<keyof PublicTables, TableDiff>>;
  /** Уншигдаагүй эх / бичигдээгүй хүснэгт (нэр: шалтгаан) */
  failed: string[];
};

const STAMP = 'shinechilsen_ognoo';
const TABLE_ID: Record<keyof PublicTables, number> = SELBE_PUBLIC.tables;
const tableUrl = (t: keyof PublicTables) => `${SELBE_PUBLIC.url}/${TABLE_ID[t]}`;

/* ══════════════ Эхүүд ══════════════ */

async function loadBuildings(): Promise<Map<string, PubBuilding>> {
  const F = BUILDING.fields;
  const rows = await queryFeatures(BUILDING.url, { outFields: [F.bagts, F.block, F.households, F.floors] });
  const n = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const out = new Map<string, PubBuilding>();
  for (const r of rows) {
    if (!bagtsKey(r[F.bagts]) || !String(r[F.block] ?? '').trim()) continue;
    const k = buildingKey(r[F.bagts], r[F.block]);
    const cur = out.get(k);
    const ail = n(r[F.households]), davhar = n(r[F.floors]);
    out.set(k, { ail: cur?.ail ?? ail, davhar: cur?.davhar ?? davhar });
  }
  return out;
}

async function loadContractors(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of groupHo(await loadHoRows())) {
    const name = c.contractor.trim();
    if (c.key && name && !out.has(c.key)) out.set(c.key, name);
  }
  return out;
}

/**
 * Инженерийн (блокгүй) багцын бөглөх хуудасны БҮЛЭГ мөрүүд (gun = 1) — хуудас бүрийн сүүлийн агшин.
 * Унасан хуудас → тэр багц Map-д орохгүй (бүлэггүй, багцын мөр л бичигдэнэ).
 */
async function loadInfraGroups(): Promise<{ groups: Map<string, PubGroup[]>; failed: string[] }> {
  const groups = new Map<string, PubGroup[]>();
  const failed: string[] = [];
  await Promise.all(PKGS.filter((p) => p.floors == null).map(async (pkg) => {
    try {
      const sc = await loadSchema(pkg, { fill: true });
      const gun = sc.f.gun, work = sc.f.work, fill = sc.f.fillDate, des = sc.f.des;
      const act = sc.act[0] ?? sc.f.rowAct ?? null;
      if (!gun || !work || !fill) return;
      const start = sc.start[0] ?? null, end = sc.end[0] ?? null;
      const rows = await queryFeatures(pkg.url, {
        where: `${gun} = 1 AND ${fill} IS NOT NULL`,
        outFields: [sc.f.oid, work, fill, ...(des ? [des] : []), ...(act ? [act] : []), ...(start ? [start] : []), ...(end ? [end] : [])],
        orderBy: `${fill} DESC, ${sc.f.oid} ASC`,
      });
      /* Сүүлийн агшин = хамгийн сүүлийн бөглөсөн огноо; тэр өдрийн мөрүүд хуудасны дарааллаар */
      const lastDay = rows.length ? Number(rows[0][fill]) : null;
      if (lastDay == null) return;
      const dayOf = (v: unknown) => Math.floor(Number(v) / 86_400_000);
      const seen = new Set<string>();
      const list: PubGroup[] = [];
      for (const r of rows) {
        if (dayOf(r[fill]) !== dayOf(lastDay)) break;
        const name = String(r[work] ?? '').replace(/\s+/g, ' ').trim();
        const no = String((des ? r[des] : null) ?? r[sc.f.oid] ?? '').trim() || String(list.length + 1);
        if (!name || seen.has(no)) continue;
        seen.add(no);
        const a = act ? r[act] : null;
        const p = a == null || a === '' || !Number.isFinite(Number(a)) ? null : Number(a) * 100;
        const d = (f: string | null) => (f && typeof r[f] === 'number' && Number.isFinite(r[f] as number) ? (r[f] as number) : null);
        list.push({ no, name, pct: p, start: d(start), end: d(end) });
      }
      list.sort((x, y) => Number(x.no) - Number(y.no));
      groups.set(pubPkgCode(pkg.group), list);
    } catch {
      failed.push(`groups:${pkg.key}`);
    }
  }));
  return { groups, failed };
}

/** 6 хүснэгтийн мөрүүд — эх бүр тусдаа; унасан эхийн хүснэгт `undefined` (хөндөхгүй) */
export async function computePublicTables(): Promise<{ tables: Partial<PublicTables>; failed: string[] }> {
  const failed: string[] = [];
  const tables: Partial<PublicTables> = {};
  const [plan, ho, days, land, bld, src, grp] = await Promise.allSettled([
    loadProjectPlan(), loadHoRows(), loadWorkforceDays(), loadLandStatus(), loadBuildings(),
    queryFeatures(SOURCE_FS.url, { outFields: [SOURCE_FS.fields.type, SOURCE_FS.fields.name, SOURCE_FS.fields.share, SOURCE_FS.fields.total] }),
    loadInfraGroups(),
  ]);
  const fail = (name: string, e: unknown) => failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);

  if (days.status === 'fulfilled') tables.hunHuch = hunHuchRows(days.value[0] ?? null);
  else fail('hunHuch', days.reason);

  if (src.status === 'fulfilled') tables.ehUusver = ehUusverRows(src.value);
  else fail('ehUusver', src.reason);

  if (plan.status !== 'fulfilled') {
    fail('plan', plan.reason);
  } else if (plan.value.empty) {
    failed.push('plan: хоосон (импортлогдоогүй)');
  } else {
    const p = plan.value;
    if (p.failed.length) failed.push(`plan: ${p.failed.join(', ')}`);
    if (ho.status === 'fulfilled') tables.sanhuu = sanhuuRows(p, ho.value); else fail('sanhuu', ho.reason);
    tables.niigem = niigemRows(p);
    /* Явц — барилга, гүйцэтгэгч, бүлэг унавал тэр хэсэг хоосон, хүснэгт бичигдэнэ (явц нь төлөвлөгөөнөөс) */
    const buildings = bld.status === 'fulfilled' ? bld.value : new Map<string, PubBuilding>();
    if (bld.status !== 'fulfilled') fail('buildings', bld.reason);
    const contractors = ho.status === 'fulfilled' ? await loadContractors().catch(() => new Map<string, string>()) : new Map<string, string>();
    const groups = grp.status === 'fulfilled' ? grp.value.groups : new Map<string, PubGroup[]>();
    if (grp.status === 'fulfilled') failed.push(...grp.value.failed); else fail('groups', grp.reason);
    tables.guitsetgel = guitsetgelRows(p, { buildings, contractors, groups });
    /* Газар — багцын түлхүүр → код (модны багцын мөрүүдээс) */
    const codeOf = new Map<string, string>();
    for (const n of p.tree.nodes) if (isPkgNode(n)) codeOf.set(pkgKeyOf(n.row?.bagts), pubPkgCode(n.row?.bagts));
    try {
      const per = await landCountMap(codeOf.keys());
      tables.gazar = gazarRows(land.status === 'fulfilled' ? land.value : null, per, (k) => codeOf.get(k) ?? '');
      if (land.status !== 'fulfilled') fail('landStatus', land.reason);
    } catch (e) {
      fail('gazar', e);
    }
  }
  return { tables, failed };
}

/* ══════════════ Тулгаж бичих ══════════════ */

const same = (a: unknown, b: unknown): boolean => {
  if (a == null || a === '') return b == null || b === '';
  if (b == null || b === '') return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a), y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
  }
  return String(a).trim() === String(b).trim();
};
const keyOf = (r: Record<string, unknown>, keys: readonly string[]): string => keys.map((k) => String(r[k] ?? '').trim()).join('|');

/** Хүснэгтийн одоогийн мөртэй тулгаж ЗӨРСӨН мөрийг л бичнэ — цэвэр хэсэг нь `diffRows` */
export function diffRows(
  current: readonly Record<string, unknown>[], wanted: readonly PubRow[], keys: readonly string[], stamp: boolean, now: number,
): { adds: PubRow[]; updates: Record<string, unknown>[]; deletes: number[] } {
  const adds: PubRow[] = [];
  const updates: Record<string, unknown>[] = [];
  const deletes: number[] = [];
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const r of current) {
    const k = keyOf(r, keys);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const used = new Set<number>();
  for (const w of wanted) {
    const k = keyOf(w, keys);
    const cur = (byKey.get(k) ?? []).find((r) => !used.has(Number(r[SELBE_PUBLIC.oid])));
    if (!cur) {
      adds.push(stamp ? { ...w, [STAMP]: now } : w);
      continue;
    }
    const oid = Number(cur[SELBE_PUBLIC.oid]);
    used.add(oid);
    const upd: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(w)) if (!same(cur[f], v)) upd[f] = v;
    if (Object.keys(upd).length) updates.push({ [SELBE_PUBLIC.oid]: oid, ...upd, ...(stamp ? { [STAMP]: now } : {}) });
  }
  for (const r of current) {
    const oid = Number(r[SELBE_PUBLIC.oid]);
    if (!used.has(oid)) deletes.push(oid);
  }
  return { adds, updates, deletes };
}

const HAS_STAMP: Record<keyof PublicTables, boolean> = {
  hunHuch: false, sanhuu: true, guitsetgel: true, gazar: true, niigem: true, ehUusver: true,
};

async function writeTable(t: keyof PublicTables, wanted: readonly PubRow[], now: number): Promise<TableDiff> {
  const url = tableUrl(t);
  const current = await queryFeatures(url, { outFields: ['*'], orderBy: `${SELBE_PUBLIC.oid} ASC` });
  const d = diffRows(current, wanted, PUBLIC_KEYS[t], HAS_STAMP[t], now);
  if (d.adds.length || d.updates.length || d.deletes.length) {
    await applyAll(url, SELBE_PUBLIC.oid, { adds: d.adds, updates: d.updates, deletes: d.deletes });
  }
  return { adds: d.adds.length, updates: d.updates.length, deletes: d.deletes.length };
}

/* ══════════════ Урсгал ══════════════ */

const DEBOUNCE_MS = 15_000;
const BOOT_DELAY_MS = 8_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<PublicSyncResult> | null = null;
let again = false;
/** Эрхгүй (403) — энэ сешнд дахин оролдохгүй */
let disabled: string | null = null;
let last: PublicSyncResult | null = null;

export const publicSyncLast = (): PublicSyncResult | null => last;
export const publicSyncDisabled = (): string | null => disabled;

const isForbidden = (e: unknown): boolean => /\b(403|499|498)\b|эрхгүй|permission|not authorized|token/i.test(e instanceof Error ? e.message : String(e));

/** Нэг удаагийн синк — зэрэг дуудвал нэг л ажиллагаа; явж байхад дахин хүсвэл дараа нь дахин ажиллана */
export function runPublicSync(): Promise<PublicSyncResult> {
  if (inflight) { again = true; return inflight; }
  inflight = (async (): Promise<PublicSyncResult> => {
    const now = Date.now();
    const res: PublicSyncResult = { at: now, tables: {}, failed: [] };
    if (disabled) { res.failed.push(`disabled: ${disabled}`); return res; }
    try {
      const { tables, failed } = await computePublicTables();
      res.failed.push(...failed);
      for (const t of Object.keys(TABLE_ID) as (keyof PublicTables)[]) {
        const rows = tables[t];
        if (!rows) continue;
        try {
          res.tables[t] = await writeTable(t, rows, now);
        } catch (e) {
          res.failed.push(`${t}: ${e instanceof Error ? e.message : String(e)}`);
          if (isForbidden(e)) { disabled = e instanceof Error ? e.message : String(e); break; }
        }
      }
    } catch (e) {
      res.failed.push(`sync: ${e instanceof Error ? e.message : String(e)}`);
    }
    last = res;
    if (res.failed.length) console.warn('[selbe_public] синк:', res.failed.join(' · '));
    return res;
  })().finally(() => {
    inflight = null;
    if (again) { again = false; schedulePublicSync(); }
  });
  return inflight;
}

export function schedulePublicSync(delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runPublicSync(); }, delay);
}

/** Портал нээгдэхэд нэг удаа + бичилт бүрийн дараа (dataBus) — зогсоогч буцаана */
export function startPublicSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  const unsub = subscribeData(() => schedulePublicSync());
  schedulePublicSync(BOOT_DELAY_MS);
  return () => {
    unsub();
    if (timer) { clearTimeout(timer); timer = null; }
  };
}

/** Portal: нэвтэрсэн (эсвэл нэвтрэлт унтраалттай) үед л */
export function usePublicSync(on: boolean): void {
  useEffect(() => (on ? startPublicSync() : undefined), [on]);
}
