/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛИЙН ХҮСНЭГТИЙГ (187) «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ЭЭР ТОЛИЛОХ (2026-11-11, хэрэглэгч: «шинэчлэгдэх ёстой»).
 *
 * Нэгтгэлийн ДЭЛГЭЦ нь «Төсөл төлөвлөгөө биелэлт»-ээс (182) бодогддог болсноос хойш 187 зөвхөн 182 уншигдаагүй үед
 * бичигддэг байсан тул хоцорсон. Одоо 182-ын автомат хадгалалт (`projectPlanSync.syncPlanProgress`) бүрэн уншигдсан
 * төлөвлөгөөгөөр ажиллах бүрд 187-г ДЭЛГЭЦТЭЙ ИЖИЛ утгаар шинэчилнэ: жин, төлөвлөгөөт хувиуд, гүйцэтгэл, биелэлт, огноо,
 * `sys_*`. Зөвхөн ЗӨРСӨН талбар бичигдэнэ.
 *
 * МӨР ТААРУУЛАХ — хоёр хүснэгт тусдаа дугаарлалттай тул objectid биш:
 *   1. код + нэр (давхардвал багцаар, эс бөгөөс дарааллаар);
 *   2. үлдсэнийг нэр + багцаар (код нь солигдсон мөр) — хоёр талд ганц байвал л. 187-ийн КОДЫГ (`wbs_id`) ХӨНДӨХГҮЙ:
 *      187-ийн нөөц мод (`negtgelAuto.excelTree`) кодын дарааллаар танигддаг тул код солиход таарц эвдэрнэ (амьдаар үзсэн).
 * ХООСОН утгаар ДАРЖ БИЧИХГҮЙ: төлөвлөгөөнд утга алга бол 187-ийн хуучин утга үлдэнэ (огноо, төсөв, хувь).
 *
 * 2026-11-23 (хэрэглэгч: «187-г ТТБ-ээр дахин бүтээх»): 187 нь 10-р сарын Excel-ийн бүтэцтэй үлдэж 1046 мөрөөс 20 нь л
 * хосолж байсан тул ТТБ-ийн бүтцээр дахин бичив (`tools/negtgel-rebuild.mjs`, нөөц `Selbe_db-tezu-backups`). Түүнээс хойш
 * 187 = ТТБ-ийн толь: бүрэн уншигдсан төлөвлөгөөгөөр хосгүй ТТБ-ийн мөр НЭМЭГДЭЖ, хосгүй 187-ийн мөр УСТГАГДАНА
 * (`mirrorStructure`; хосгүй нь хэт олон бол — бүтэц эвдэрсэн гэж үзээд хөндөхгүй).
 */
import { TUSUL_NEGTGEL, bagtsKey } from '@/lib/services';
import { VAL_FIELD, type NegRaw, type NegRootRow, type NegVals } from '@/lib/negtgelAuto';

const F = TUSUL_NEGTGEL.fields;
const SCALE = TUSUL_NEGTGEL.scale;
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const norm = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Толилох мөр — `negtgel.negRowsFromPlan`-ийн гаралт (0–1 бутархай) */
export type MirrorRow = NegVals & {
  code: string; name: string; bagts: string;
  w: number | null; p: number | null; budget: number | null;
  ctStart?: number | null; ctEnd?: number | null;
  exStart?: string; exEnd?: string; actStart?: string; actEnd?: string;
};

export type MirrorPlan = {
  updates: Record<string, unknown>[];
  /** Хос олдоогүй мөрүүд («код · нэр») */
  only182: string[];
  only187: string[];
};

/** `rows[i]` ↔ `stored[pair[i]]` (−1 = хосгүй) */
export function pairRows(rows: readonly MirrorRow[], stored: readonly NegRaw[]): number[] {
  const pair = new Array<number>(rows.length).fill(-1);
  const used = new Set<number>();
  const bucket = (key: (r: { code: string; name: string; bagts: string }) => string) => {
    const m = new Map<string, number[]>();
    stored.forEach((s, j) => { if (used.has(j)) return; const k = key(s); const l = m.get(k); if (l) l.push(j); else m.set(k, [j]); });
    return m;
  };
  /* 1. код + нэр */
  const k1 = (r: { code: string; name: string }) => `${r.code.trim()}¦${norm(r.name)}`;
  const b1 = bucket(k1);
  rows.forEach((r, i) => {
    const l = b1.get(k1(r));
    if (!l?.length) return;
    const bk = bagtsKey(r.bagts);
    let at = l.findIndex((j) => bagtsKey(stored[j].bagts) === bk);
    if (at < 0) at = 0;
    const j = l.splice(at, 1)[0];
    pair[i] = j; used.add(j);
  });
  /* 2. нэр + багц — хоёр талд ГАНЦ байвал л (код нь солигдсон мөр) */
  const k2 = (r: { name: string; bagts: string }) => `${norm(r.name)}¦${bagtsKey(r.bagts)}`;
  const b2 = bucket(k2);
  const left = new Map<string, number[]>();
  rows.forEach((r, i) => { if (pair[i] >= 0) return; const k = k2(r); const l = left.get(k); if (l) l.push(i); else left.set(k, [i]); });
  for (const [k, is] of left) {
    const js = b2.get(k);
    if (is.length !== 1 || js?.length !== 1) continue;
    pair[is[0]] = js[0]; used.add(js[0]);
  }
  return pair;
}

const pctOff = (nv: number | null, ov: number | null | undefined): nv is number => nv != null && (ov == null || Math.abs(nv - ov) > 1e-6);

/** Цэвэр — тест: `negtgelMirror.check.mjs` */
export function mirrorUpdates(
  rows: readonly MirrorRow[], stored: readonly NegRaw[],
  root: { vals: Partial<NegVals>; stored: NegRootRow | null } | null = null, now: number = Date.now(),
): MirrorPlan {
  const pair = pairRows(rows, stored);
  const updates: Record<string, unknown>[] = [];
  rows.forEach((r, i) => {
    if (pair[i] < 0) return;
    const s = stored[pair[i]];
    const u: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(VAL_FIELD) as [keyof NegVals, string][]) if (pctOff(r[k], s[k])) u[f] = r6(r[k]! * SCALE);
    if (pctOff(r.w, s.w)) u[F.inSection] = r6(r.w * SCALE);
    if (pctOff(r.p, s.p)) u[F.inProject] = r6(r.p * SCALE);
    if (r.budget != null && (s.budget == null || Math.abs(r.budget - s.budget) > 0.5)) u[F.budget] = r.budget;
    if (r.ctStart != null && r.ctStart !== (s.ctStart ?? null)) u[F.ctStart] = r.ctStart;
    if (r.ctEnd != null && r.ctEnd !== (s.ctEnd ?? null)) u[F.ctEnd] = r.ctEnd;
    for (const [k, f] of [['exStart', F.exStart], ['exEnd', F.exEnd], ['actStart', F.actStart], ['actEnd', F.actEnd]] as const) {
      const nv = r[k] ?? '';
      if (nv && nv !== (s[k] ?? '')) u[f] = nv;
    }
    if (pctOff(r.act, s.sysAct)) u[F.sysAct] = r6(r.act * SCALE);
    if (pctOff(r.planNw, s.sysNw)) u[F.sysNextWk] = r6(r.planNw * SCALE);
    if (Object.keys(u).length) updates.push({ [TUSUL_NEGTGEL.oid]: s.oid, ...u, [F.sysAt]: now });
  });
  if (root?.stored) {
    const u: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(VAL_FIELD) as [keyof NegVals, string][]) {
      const nv = root.vals[k] ?? null;
      if (pctOff(nv, root.stored[k])) u[f] = r6(nv * SCALE);
    }
    if (Object.keys(u).length) updates.push({ [TUSUL_NEGTGEL.oid]: root.stored.oid, ...u, [F.sysAt]: now });
  }
  const got = new Set(pair.filter((j) => j >= 0));
  return {
    updates,
    only182: rows.filter((_, i) => pair[i] < 0).map((r) => `${r.code} · ${r.name}`),
    only187: stored.filter((_, j) => !got.has(j)).map((r) => `${r.code} · ${r.name}`),
  };
}

/** Үе шатын нэр (Д/Д-ийн эхний хэсэг → цэггүй мөрийн нэр) — 187-ийн `phase` */
export function phaseNamesOf(rows: readonly MirrorRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) if (r.code && !r.code.includes('.')) m.set(r.code, r.name);
  return m;
}

/** Нэг мөрийн 187-ийн БҮТЭН утгууд (шинээр нэмэхэд) — хувиуд 0–100, огноо ms, «YYYY-MM-DD» мөр */
export function mirrorAttrs(r: MirrorRow, phases: ReadonlyMap<string, string>, now: number = Date.now()): Record<string, unknown> {
  const pc = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : r6(v * SCALE));
  const a: Record<string, unknown> = {
    [F.code]: r.code, [F.name]: r.name, [F.bagts]: r.bagts || null,
    [F.phase]: phases.get(r.code.split('.')[0]) ?? null,
    [F.budget]: r.budget ?? null, [F.inSection]: pc(r.w), [F.inProject]: pc(r.p),
    [F.ctStart]: r.ctStart ?? null, [F.ctEnd]: r.ctEnd ?? null,
    [F.exStart]: r.exStart || null, [F.exEnd]: r.exEnd || null, [F.actStart]: r.actStart || null, [F.actEnd]: r.actEnd || null,
    [F.sysAct]: pc(r.act), [F.sysNextWk]: pc(r.planNw), [F.sysAt]: now,
  };
  for (const [k, f] of Object.entries(VAL_FIELD) as [keyof NegVals, string][]) a[f] = pc(r[k]);
  return a;
}

/**
 * БҮТЦИЙН ТОЛЬ (2026-11-23) — хосгүй ТТБ-ийн мөр → нэмэх, хосгүй 187-ийн мөр → устгах. Хосгүй нь 187-ийн мөрийн 20%-иас олон
 * бол (бүтэц эвдэрсэн, буруу хүснэгт г.м.) юу ч хийхгүй — `blocked`. Цэвэр — тест: `negtgelMirror.check.mjs`.
 */
export function mirrorStructure(
  rows: readonly MirrorRow[], stored: readonly NegRaw[], now: number = Date.now(),
): { adds: Record<string, unknown>[]; deletes: number[]; blocked: boolean } {
  const pair = pairRows(rows, stored);
  const got = new Set(pair.filter((j) => j >= 0));
  const lone182 = rows.filter((_, i) => pair[i] < 0);
  const lone187 = stored.filter((_, j) => !got.has(j));
  if (lone182.length + lone187.length > Math.max(10, stored.length * 0.2)) return { adds: [], deletes: [], blocked: true };
  const phases = phaseNamesOf(rows);
  return { adds: lone182.map((r) => mirrorAttrs(r, phases, now)), deletes: lone187.map((s0) => s0.oid), blocked: false };
}

const CHUNK = 200;

/**
 * Амьд бичилт. `plan` — БҮРЭН уншигдсан (`failed` хоосон) төлөвлөгөө; дуудагч шалгана. Шидэж болно — дуудагч барина.
 * @returns бичсэн мөрийн тоо
 */
export async function mirrorNegtgel(plan: import('@/lib/projectPlanInputs').ProjectPlan): Promise<{ n: number; only182: string[]; only187: string[]; blocked?: boolean }> {
  const [{ negRowsFromPlan }, { loadNegRaw, negRootOf }, { applyAll }] = await Promise.all([
    import('@/lib/negtgel'), import('@/lib/negtgelAuto'), import('@/lib/tableWrite'),
  ]);
  const rows = negRowsFromPlan(plan);
  const stored = await loadNegRaw();
  const fr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v / 100);
  const v = plan.result.values.get(plan.tree.root);
  const vals: Partial<NegVals> = {
    act: fr(v?.S), planG: fr(v?.N), planGch: null, planGu: fr(v?.P), planNw: fr(v?.Q), planPw: fr(v?.R),
    perfG: fr(v?.T), perfGch: null, perfGu: fr(v?.V), perfWk: fr(v?.W),
  };
  const roots = negRootOf(stored) ?? [];
  const m = mirrorUpdates(rows, stored, { vals, stored: roots.length === 1 ? roots[0] : null });
  let n = 0;
  for (let i = 0; i < m.updates.length; i += CHUNK) n += (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates: m.updates.slice(i, i + CHUNK) })).n;
  /* Бүтэц — зөвхөн БҮРЭН уншигдсан төлөвлөгөөгөөр (хагас уншилтаар мөр устгахгүй) */
  if (plan.failed.length) return { n, only182: m.only182, only187: m.only187 };
  const st = mirrorStructure(rows, stored);
  if (st.blocked) return { n, only182: m.only182, only187: m.only187, blocked: true };
  for (let i = 0; i < st.adds.length; i += CHUNK) n += (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { adds: st.adds.slice(i, i + CHUNK) })).n;
  for (let i = 0; i < st.deletes.length; i += CHUNK) n += (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { deletes: st.deletes.slice(i, i + CHUNK) })).n;
  return { n, only182: [], only187: [] };
}

/**
 * 187-Г ТТБ-ЭЭР БҮРЭН ДАХИН БИЧИХ (2026-11-23, нэг удаа — `tools/negtgel-rebuild.mjs`). Бүх мөрийг устгаж «0» нийт мөр ба ТТБ-ийн
 * мөрүүдийг ТТБ-ийн дарааллаар нэмнэ. Дуудагч нөөцөлсөн байх ёстой. `plan` — бүрэн уншигдсан.
 */
export async function rebuildNegtgel(plan: import('@/lib/projectPlanInputs').ProjectPlan, oldOids: readonly number[]): Promise<{ deleted: number; added: number }> {
  if (plan.failed.length) throw new Error(`Төлөвлөгөө бүрэн уншигдсангүй: ${plan.failed.join(', ')}`);
  const [{ negRowsFromPlan }, { applyAll }] = await Promise.all([import('@/lib/negtgel'), import('@/lib/tableWrite')]);
  const rows = negRowsFromPlan(plan);
  const v = plan.result.values.get(plan.tree.root);
  const now = Date.now();
  const phases = phaseNamesOf(rows);
  const root: MirrorRow = {
    code: '0', name: 'Төслийн нийт', bagts: '', w: null, p: null, budget: v?.E ?? null,
    act: v?.S == null ? null : v.S / 100, planG: v?.N == null ? null : v.N / 100, planGch: null, planGu: v?.P == null ? null : v.P / 100,
    planNw: v?.Q == null ? null : v.Q / 100, planPw: v?.R == null ? null : v.R / 100,
    perfG: v?.T == null ? null : v.T / 100, perfGch: null, perfGu: v?.V == null ? null : v.V / 100, perfWk: v?.W == null ? null : v.W / 100,
  };
  const adds = [{ ...mirrorAttrs(root, phases, now), [F.phase]: null }, ...rows.map((r) => mirrorAttrs(r, phases, now))];
  let deleted = 0, added = 0;
  for (let i = 0; i < oldOids.length; i += CHUNK) deleted += (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { deletes: [...oldOids.slice(i, i + CHUNK)] })).n;
  for (let i = 0; i < adds.length; i += CHUNK) added += (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { adds: adds.slice(i, i + CHUNK) })).n;
  return { deleted, added };
}
