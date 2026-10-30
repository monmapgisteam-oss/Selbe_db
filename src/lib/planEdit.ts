/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ» — ГАРААР ОРУУЛАХ УТГА, МӨР НЭМЭХ/УСТГАХ (2026-10-30).
 *
 * ⚠️ ЯАГААД: ТЭЗҮ · Зураг төсөл · Зөвшөөрөл · Сонгон шалгаруулалт · Хүлээлгэн өгөх · Зүгшрүүлэлтийн гүйцэтгэл ба
 *    milestone огноо (гэрээ байгуулсан · захирамж · ашиглалт) системийн өөр эхээс ирдэггүй — хүн оруулна.
 * ⚠️ ДҮРЭМ (цэвэр функцууд — тестлэгдэнэ):
 *    · гүйцэтгэлийн хувь — `MANUAL_PHASES`-ийн НАВЧ мөрд л (эцгийнх дэд мөрөөс бодогдоно, барилга угсралт · газар
 *      чөлөөлөлт системээс);
 *    · мөр нэмэх — `MANUAL_PHASES`-д л; Д/Д-г систем олгоно; дэд мөргүй мөрийн доор ШИНЭ БҮЛЭГ бол жингийн нийлбэр
 *      яг 100%, байгаа мөрүүдийн дунд нэмбэл жин 0% (нийт 100%-иас давахгүй);
 *    · устгах — гараар нэмсэн (`isManualRow`), дэд мөргүй, сарын мөнгөгүй мөрийг л.
 */
import { t as tr } from './i18nCore';
import { applyAll } from './tableWrite';
import { invalidate } from './dataBus';
import { CASHFLOW_NEW, pkgKeyOf } from './services';
import type { PhaseKind, PlanNode, PlanStoredRow, PlanTree } from './projectPlan';

const F = CASHFLOW_NEW.fields;
const DAY = 86_400_000;

/** Гүйцэтгэлийг хүн оруулдаг үе шатууд */
export const MANUAL_PHASES: ReadonlySet<PhaseKind> = new Set<PhaseKind>([
  'tezu', 'zurag', 'zovshoorol', 'songon', 'huleelgeh', 'zugshruulelt',
]);

/** Засагдах утга — `PlanStoredRow`-ийн түлхүүр, хүснэгтийн талбар, төрөл */
export type PlanEditKey = 'pct' | 'contractDate' | 'orderDate' | 'orderNo' | 'handoverDate';
export const PLAN_EDIT: Record<PlanEditKey, { key: keyof PlanStoredRow; field: string; kind: 'pct' | 'date' | 'text' }> = {
  pct: { key: 'guitsetgel_huvi', field: F.progressPct, kind: 'pct' },
  contractDate: { key: 'geree_ognoo', field: F.contractDate, kind: 'date' },
  orderDate: { key: 'zahiramj_ognoo', field: F.orderDate, kind: 'date' },
  orderNo: { key: 'zahiramj_dugaar', field: F.orderNo, kind: 'text' },
  handoverDate: { key: 'ashiglalt_ognoo', field: F.handoverDate, kind: 'date' },
};
export const PLAN_EDIT_KEYS = Object.keys(PLAN_EDIT) as PlanEditKey[];

const oidOf = (n: PlanNode): number | null => {
  const v = n.row?.objectid;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Засах боломжгүй шалтгаан; `null` = засаж болно */
export function editWhy(n: PlanNode, k: PlanEditKey): string | null {
  if (oidOf(n) == null) return tr('Мөр хүснэгтэд хадгалагдаагүй');
  if (k !== 'pct') return null;
  if (!MANUAL_PHASES.has(n.phase)) return tr('Энэ үе шатын гүйцэтгэл системээс бодогдоно');
  if (n.children.length) return tr('Дэд мөрүүдээс бодогдоно');
  return null;
}

/**
 * ИМПОРТЫН ХИЛ — импортын мөрүүд нэг багцаар (ижил агшинд) үүссэн: хамгийн эрт `created_date` + 1 өдөр.
 * Түүнээс хойш үүссэн мөр = гараар нэмсэн. Агшин алга бол `null` (устгах боломжгүй).
 */
export function importCutoff(rows: readonly PlanStoredRow[]): number | null {
  let lo = Infinity;
  for (const r of rows) if (typeof r.created_date === 'number' && r.created_date < lo) lo = r.created_date;
  return Number.isFinite(lo) ? lo + DAY : null;
}
export const isManualRow = (r: PlanStoredRow | null | undefined, cutoff: number | null): boolean =>
  !!r && cutoff != null && typeof r.created_date === 'number' && r.created_date > cutoff;

/**
 * ДАВХАРДСАН Д/Д-ТАЙ ЭЦЭГ — шинэ мөр ЗӨВ эцэгтээ залгагдах эсэх. `buildTree` олон нэр дэвшигчээс түвшин (`tuvshin`)
 * нэгээр бага, ӨМНӨХ мөрүүдээс хамгийн сүүлийнхийг сонгодог; Д/Д давхардсан үед мөрүүд `objectid`-оор эрэмбэлэгдэх
 * тул шинэ мөр (хамгийн их `objectid`) ижил кодтой мөрүүдээс хамгийн их `objectid`-тайд залгагдана.
 * Тэр нь энэ мөр биш бол нэмэх боломжгүй.
 */
function dupBlocked(tree: PlanTree, n: PlanNode): boolean {
  const tv = n.row?.tuvshin;
  const same = tree.nodes.filter((x) => x.code === n.code && (typeof tv !== 'number' || x.row?.tuvshin === tv));
  if (same.length < 2) return false;
  const top = same.reduce((a, b) => ((b.row?.objectid ?? -1) > (a.row?.objectid ?? -1) ? b : a));
  return top !== n;
}

/** Дэд мөр нэмэх боломжгүй шалтгаан; `null` = болно */
export function addWhy(tree: PlanTree, n: PlanNode): string | null {
  if (oidOf(n) == null) return tr('Мөр хүснэгтэд хадгалагдаагүй');
  if (!MANUAL_PHASES.has(n.phase)) return tr('Энэ үе шатад мөр нэмэхгүй — утга нь системээс бодогдоно');
  if (dupBlocked(tree, n)) return tr('Д/Д давхардсан мөрийн доор нэмэх боломжгүй ({0})', n.code);
  return null;
}

/** Устгах боломжгүй шалтгаан; `null` = болно */
export function deleteWhy(n: PlanNode, cutoff: number | null): string | null {
  if (oidOf(n) == null) return tr('Мөр хүснэгтэд хадгалагдаагүй');
  if (n.row?.cashflow_id != null) return tr('Сарын мөнгөтэй мөрийг устгахгүй');
  if (n.children.length) return tr('Дэд мөртэй мөрийг устгахгүй');
  if (!isManualRow(n.row, cutoff)) return tr('Зөвхөн гараар нэмсэн мөрийг устгана');
  return null;
}

/** Шинэ бүлэг эсэх — дэд мөргүй мөрийн доор (жин оруулна, нийлбэр 100%) */
export const isNewGroup = (n: PlanNode): boolean => n.children.length === 0;

/** Дараагийн Д/Д — `эцэг.N`, бүх мөрийн дундаас хамгийн их N + 1 (давхардахгүй) */
export function nextCodes(tree: PlanTree, parent: PlanNode, count: number): string[] {
  const pre = `${parent.code}.`;
  let max = 0;
  for (const x of tree.nodes) {
    if (!x.code.startsWith(pre)) continue;
    const rest = x.code.slice(pre.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return Array.from({ length: count }, (_, i) => `${pre}${max + 1 + i}`);
}

/** Шинэ мөрийн оролт — жин ба хувь 0–100 */
export type NewPlanRow = { name: string; weight: number | null; pct: number | null };

const SUM_EPS = 0.01;

/** Оролтын алдаа; `null` = зөв */
export function newRowsWhy(parent: PlanNode, items: readonly NewPlanRow[]): string | null {
  if (!items.length) return tr('Нэмэх мөр алга');
  if (items.some((x) => !x.name.trim())) return tr('Ажлын нэр хоосон байна');
  if (items.some((x) => x.pct != null && (!Number.isFinite(x.pct) || x.pct < 0 || x.pct > 100))) {
    return tr('Гүйцэтгэлийн хувь 0–100 хооронд байх ёстой');
  }
  if (!isNewGroup(parent)) return null;
  if (items.some((x) => x.weight == null || !Number.isFinite(x.weight) || x.weight < 0)) {
    return tr('Мөр бүрийн жинг оруулна уу');
  }
  const sum = items.reduce((s, x) => s + (x.weight ?? 0), 0);
  if (Math.abs(sum - 100) > SUM_EPS) return tr('Жингийн нийлбэр 100% байх ёстой (одоо {0}%)', Math.round(sum * 100) / 100);
  return null;
}

/** Хүснэгтэд нэмэх атрибутууд (цэвэр) */
export function newRowAttrs(tree: PlanTree, parent: PlanNode, items: readonly NewPlanRow[]): Record<string, unknown>[] {
  const codes = nextCodes(tree, parent, items.length);
  const r = parent.row!;
  const lvl = typeof r.tuvshin === 'number' ? r.tuvshin + 1 : parent.depth;
  const group = isNewGroup(parent);
  return items.map((x, i) => ({
    [F.ddKod]: codes[i],
    [F.parentKod]: parent.code,
    [F.level]: lvl,
    [F.phase]: r.uy_shat ?? null,
    [F.pkg]: r.bagts ?? parent.pkg ?? null,
    [F.detail]: x.name.trim(),
    /* Хадгалсан жин 0–1 (`projectPlan.STORED_WEIGHT`) */
    [F.wSection]: group ? (x.weight ?? 0) / 100 : 0,
    [F.progressPct]: x.pct,
  }));
}

/* ══════════════════ Шүүлт ══════════════════ */

/** Багцын сонголт — `pkgKeyOf`-оор нэгтгэсэн, анх таарсан бичиглэлээр */
export function pkgOptions(tree: PlanTree): { key: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const n of tree.nodes) {
    const raw = String(n.row?.bagts ?? '').trim();
    if (!raw) continue;
    const k = pkgKeyOf(raw);
    if (k && !seen.has(k)) seen.set(k, raw);
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}

/** Хоосон/утгатай шүүлт */
export type FillFilter = 'all' | 'empty' | 'filled';

/** Утга хоосон эсэх — гүйцэтгэлд 0 ч «бөглөөгүй» */
export function isEmptyVal(k: PlanEditKey, v: unknown): boolean {
  if (v == null || String(v).trim() === '') return true;
  return k === 'pct' && Number(v) === 0;
}

export type PlanFilter = { pkg: string; name: string; fill: Partial<Record<PlanEditKey, FillFilter>> };
export const NO_FILTER: PlanFilter = { pkg: '', name: '', fill: {} };
export const filterActive = (f: PlanFilter): boolean =>
  !!f.pkg || !!f.name.trim() || Object.values(f.fill).some((x) => x && x !== 'all');

/**
 * Шүүлтэд тохирох мөрүүд + тэдгээрийн ӨВӨГ (бүтэц алдагдахгүй). Утгын шүүлт тухайн утгыг ЗАСАЖ болох мөрд л тохирно.
 */
export function filterPlan(tree: PlanTree, f: PlanFilter): Set<PlanNode> {
  const needle = f.name.trim().toLowerCase();
  const fills = (Object.entries(f.fill) as [PlanEditKey, FillFilter][]).filter(([, v]) => v !== 'all');
  const keep = new Set<PlanNode>();
  for (const n of tree.nodes) {
    if (f.pkg && pkgKeyOf(n.pkg ?? '') !== f.pkg) continue;
    if (needle && !String(n.row?.ajil_uilchilgee ?? '').toLowerCase().includes(needle) && !n.code.includes(needle)) continue;
    let ok = true;
    for (const [k, v] of fills) {
      if (editWhy(n, k) != null) { ok = false; break; }
      const empty = isEmptyVal(k, n.row?.[PLAN_EDIT[k].key]);
      if ((v === 'empty') !== empty) { ok = false; break; }
    }
    if (!ok) continue;
    for (let x: PlanNode | null = n; x && x.row; x = x.parent) keep.add(x);
  }
  return keep;
}

/* ══════════════════ Хүснэгтэд бичих ══════════════════ */

const write = async (edit: Parameters<typeof applyAll>[2]) => {
  const r = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, edit, { cap: 'finEdit' });
  invalidate('CASHFLOW_NEW');
  return r;
};

/** Нэг утга засна */
export function savePlanValue(n: PlanNode, k: PlanEditKey, value: unknown) {
  const why = editWhy(n, k);
  if (why) throw new Error(why);
  return write({ updates: [{ [CASHFLOW_NEW.oid]: oidOf(n), [PLAN_EDIT[k].field]: value }] });
}

/** Дэд мөрүүд нэмнэ (нэг хүсэлтээр — атомаар) */
export function addPlanRows(tree: PlanTree, parent: PlanNode, items: readonly NewPlanRow[]) {
  const why = addWhy(tree, parent) ?? newRowsWhy(parent, items);
  if (why) throw new Error(why);
  return write({ adds: newRowAttrs(tree, parent, items) });
}

/** Гараар нэмсэн мөрийг устгана */
export function deletePlanRow(n: PlanNode, cutoff: number | null) {
  const why = deleteWhy(n, cutoff);
  if (why) throw new Error(why);
  return write({ deletes: [oidOf(n)!] });
}
