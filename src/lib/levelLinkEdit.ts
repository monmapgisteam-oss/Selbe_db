/**
 * 6 ТҮВШНИЙ ХУВААРЬ ДЭЭР БАГЦЫН ХАМААРАЛ ЗАСАХ — ЦЭВЭР ЛОГИК (2026-11-24, React · ArcGIS-гүй, `levelLinkEdit.check.mjs`).
 *
 * Хэрэглэгч: «Багцын хамаарал»-ыг 6 түвшний хуваарь дээр шууд холбож/салгана — мөр дарж, нөгөө мөрийг дарна.
 * 6 түвшний мөр (`LK` түлхүүр) → холбож болох ажлууд (`linkableIds`), зураасны `x:` id → ажлын хос,
 * хадгалахын өмнөх бүлэглэлт (хадгалдаг мөр тутамд нэг `saveWorkLinks`). Мөр · зураасны тооцоонд хүрэхгүй.
 */
import { LK, phaseGroupOf, sheetKeyOf, type LinkEnd, type PkgInfo, type WorkLink } from './levelPlan';
import { linkableIds, type Edge, type NodeId, type RefChange, type WorkGraph, type WorkRef, type WorkRow } from './workDeps';

/** Хос (чиглэлгүй) — `a|b`, дараалал хамаагүй */
export const pairOf = (a: NodeId, b: NodeId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const refKeyOf = (r: WorkRef): string => `${r.p}|${r.k}|${r.o ?? 0}`;
/** Зураасны ажлын холбоосын id — `levelPlan.crossLinks`-ийн хэлбэр (`x:` + эрэмбэлсэн хос) */
export const xIdOf = (a: NodeId, b: NodeId): string => `x:${[a, b].sort().join('~')}`;

/**
 * Харагдах холбоо — хадгалсан (`saved`), нэмэхээр (`add`), устгахаар (`del`). `host` — холбоосыг хадгалдаг мөр.
 */
export type Line = { key: string; pair: string; a: NodeId; b: NodeId; host: NodeId; ref: WorkRef; kind: 'saved' | 'add' | 'del' };
/** Өнчин холбоос — нөгөө тал нь олдохгүй (зөвхөн устгаж болно) */
export type Orphan = { key: string; host: NodeId; e: Edge; del: boolean };

/** Графын хадгалсан холбоо (тулгагдсан) */
export const savedLines = (g: WorkGraph): Line[] => [...g.pre].flatMap(([host, es]) => es.flatMap((e) => (e.to
  ? [{ key: `${host}#${refKeyOf(e.ref)}`, pair: pairOf(host, e.to), a: host, b: e.to, host, ref: e.ref, kind: 'saved' as const }]
  : [])));

/** Графын өнчин холбоо */
export const orphanLines = (g: WorkGraph, dels: ReadonlyMap<string, NodeId>): Orphan[] => [...g.pre].flatMap(([host, es]) => es
  .filter((e) => !e.to).map((e) => ({ key: `${host}#${refKeyOf(e.ref)}`, host, e, del: dels.has(`${host}#${refKeyOf(e.ref)}`) })));

/**
 * ХАДГАЛАХ БҮЛЭГЛЭЛТ — `BagtsHamaaral.saveAll`-тай ижил: хадгалдаг мөр тутамд нэмэх/хасах (нэг `saveWorkLinks`).
 */
export function groupChanges(
  adds: readonly Line[], saved: readonly Line[], dels: ReadonlyMap<string, NodeId>, orphans: readonly Orphan[],
): Map<NodeId, { add: WorkRef[]; remove: WorkRef[] }> {
  const byHost = new Map<NodeId, { add: WorkRef[]; remove: WorkRef[] }>();
  const at = (h: NodeId) => { let c = byHost.get(h); if (!c) { c = { add: [], remove: [] }; byHost.set(h, c); } return c; };
  for (const l of adds) at(l.host).add.push(l.ref);
  for (const l of saved) if (dels.has(l.key)) at(l.host).remove.push(l.ref);
  for (const o of orphans) if (o.del) at(o.host).remove.push(o.e.ref);
  return byHost satisfies Map<NodeId, RefChange>;
}

/* ══════════════ 6 түвшний мөр → ажил ══════════════ */

/**
 * Мөрийн индекс: ажил бүрийн төгсгөл (`crossLinks`-ийн `LinkEnd`-тэй ижил: багц · дэд үе шат · дэд бүлэг, блокгүй) ба
 * холбож болох ажлууд түлхүүрээр — `p:<багц>` · `f:<багц>#<үе шат>` · `G:<багц>#<бүлэг>` (хуудасны дарааллаар).
 */
export type EditIndex = {
  ends: Map<NodeId, LinkEnd>; by: Map<string, NodeId[]>; l1: Map<string, string[]>;
  /** `rowWorks`-ийн санах ой (мөр тутамд нэг удаа) */
  memo: Map<string, NodeId[]>;
};

export function editIndex(
  g: WorkGraph,
  sheets: readonly { p: string; rows: readonly WorkRow[] | null }[],
  keyOf: (p: string) => string,
  pkgs: readonly PkgInfo[] = [],
): EditIndex {
  const ends = new Map<NodeId, LinkEnd>();
  const by = new Map<string, NodeId[]>();
  const push = (k: string, id: NodeId) => { const l = by.get(k); if (l) l.push(id); else by.set(k, [id]); };
  for (const sh of sheets) {
    const ids = g.bySheet.get(sh.p);
    if (!sh.rows || !ids || ids.length !== sh.rows.length) continue;
    const pkg = keyOf(sh.p);
    if (!pkg) continue;
    const pg = phaseGroupOf(sh.rows);
    const ok = linkableIds(g, sh.p);
    ids.forEach((id, i) => {
      const e: LinkEnd = { pkg, blok: null, phase: pg.phase[i], group: pg.group[i] };
      ends.set(id, e);
      if (!ok.has(id)) return;
      push(`p:${pkg}`, id);
      if (e.phase) push(`f:${pkg}#${e.phase}`, id);
      if (e.group) push(`G:${pkg}#${e.group}`, id);
    });
  }
  /* L1-ийн мөр (`n:`) — тэр модны зангилааны доорх багцууд */
  const l1 = new Map<string, string[]>();
  for (const pk of pkgs) {
    const k = sheetKeyOf(pk);
    for (let x: PkgInfo['node'] | null = pk.node; x; x = x.parent) {
      const lk = LK.node(x);
      const l = l1.get(lk);
      if (!l) l1.set(lk, [k]); else if (!l.includes(k)) l.push(k);
    }
  }
  return { ends, by, l1, memo: new Map() };
}

/** `pkg|blok` → `pkg` */
const pkgOfBlock = (bk: string): string => (bk.includes('|') ? bk.slice(0, bk.indexOf('|')) : bk);

/**
 * 6 түвшний мөрийн `lk` → холбож болох ажлууд (давхардалгүй, хуудасны дарааллаар). Блокийн мөр (`b:`) — тэр багцын бүх
 * ажил (багцын хамаарал блокгүй); дэд бүлгийн мөр (`g:`) — тэр бүлгийнх. Тааруулах ажилгүй бол `[]`.
 */
export function rowWorks(lk: string, ix: EditIndex): NodeId[] {
  let v = ix.memo.get(lk);
  if (!v) { v = rowWorksOf(lk, ix); ix.memo.set(lk, v); }
  return v;
}
function rowWorksOf(lk: string, ix: EditIndex): NodeId[] {
  const i = lk.indexOf(':');
  if (i < 0) return [];
  const kind = lk.slice(0, i);
  const rest = lk.slice(i + 1);
  const get = (k: string) => ix.by.get(k) ?? [];
  if (kind === 'p') return get(`p:${rest}`);
  if (kind === 'f') return get(`f:${rest}`);
  if (kind === 'b') return get(`p:${pkgOfBlock(rest)}`);
  if (kind === 'g') {
    const h = rest.indexOf('#');
    return h < 0 ? [] : get(`G:${pkgOfBlock(rest.slice(0, h))}#${rest.slice(h + 1)}`);
  }
  if (kind === 'n') return [...new Set((ix.l1.get(lk) ?? []).flatMap((k) => get(`p:${k}`)))];
  return [];
}

/** Зураасны ажлын холбоосын id-ууд (`x:a~b`) → ажлын хос; Хуваарийн уялдааны id алгасна */
export function linePairs(ids: Iterable<string>): [NodeId, NodeId][] {
  const out: [NodeId, NodeId][] = [];
  const re = /^x:([^\u0001]*\u0001[^\u0001]*\u0001\d+)~([^\u0001]*\u0001[^\u0001]*\u0001\d+)$/;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

/** Нэмэхээр тэмдэглэсэн холбоог зурах ажлын холбоос (`crossLinks`-ийн хэлбэр) — төгсгөл нь алга бол алгасна */
export function stagedLinks(adds: readonly Line[], ends: ReadonlyMap<NodeId, LinkEnd>): WorkLink[] {
  const out: WorkLink[] = [];
  const seen = new Set<string>();
  for (const l of adds) {
    const a = ends.get(l.a);
    const b = ends.get(l.b);
    const id = xIdOf(l.a, l.b);
    if (!a || !b || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, a, b, ss: false, viol: false, und: true });
  }
  return out;
}
