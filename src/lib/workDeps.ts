/**
 * БАГЦ ХООРОНДЫН АЖЛЫН ХАМААРАЛ (2026-10-22) — ЦЭВЭР ЛОГИК (React · ArcGIS-гүй, `workDeps.check.mjs`).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр, 2026-10-22): «Багцын хамаарал» нь багц ↔ багц биш, АЖИЛ ↔ АЖИЛ болов —
 *    А багцын нэг ажил Б, В … багцуудын ОЛОН ажлаас хамаарна. ЗӨВХӨН ХАРУУЛНА: хуваарийн огноонд
 *    (`plan.ts` · `deps.ts`-ийн «18FS3» гинж) ОГТ НӨЛӨӨЛӨХГҮЙ. Нэг хуудасны доторх уялдаа нь хуучин
 *    `hamaaral` (Des_dugaar «18FS3») хэвээр — энд ЗӨВХӨН ӨӨР хуудасны (багцын) ажил.
 * ⚠️ ХАДГАЛАЛТ: ХАМААРАХ (ард талын) ажлын мөрийн `bagts_hamaaral` талбар (String 8000) = урьдчилагчдын
 *    JSON массив `[{ p, k, o?, n?, d? }]`:
 *      · `p` — хуудасны түлхүүр (`PKGS[].key`, жиш. «b71»);
 *      · `k` — мөрийн шошго `rowKeyOf` «№ ¦ Ажил» (`sheetFrame.ts`);
 *      · `o`/`n` — тэр шошготой мөрүүдийн доторх дугаар ба нийт тоо (`rowOccOf`, 0 · 1 бол ОРХИНО);
 *      · `d` — `Des_dugaar` (жаазан дотор давтагдахгүй, агшин дамжин тогтвортой — НЭМЭЛТ таних тэмдэг).
 * ⚠️ OBJECTID ХЭЗЭЭ Ч ХАДГАЛАХГҮЙ: архивын жааз бүр хуудсыг ШИНЭ OBJECTID-тай хуулбарладаг тул oid нь
 *    дараагийн жаазад өөр мөр/алга. Шошго + давтамж нь илгээлтийн зөөлтийн (`mapOldOids`) ЯГ дүрэм:
 *    `n` нь одоогийн тоотой тэнцвэл `o` дахь мөр, эс бөгөөс ТААМАГЛАХГҮЙ (хоёрдмол → «өнчин» гэж ИЛ
 *    харуулна, чимээгүй хаяхгүй). `d` таарвал (шошго ижил, ганц мөр) түүнийг илүүд үзнэ.
 * ⚠️ ДУГУЙ ХАМААРАЛ ХОРИОТОЙ (хуучин `linkError`-ийн дүрэм, одоо АЖЛЫН граф дээр); өөртөө · нэг хуудас ·
 *    8000 тэмдэгтээс урт бичлэг мөн хориотой (ил шалтгаантай).
 */
import { t as tr } from '@/lib/i18nCore';
import { fixCyr } from '@/lib/format';
import { rowKeyOf, rowOccOf } from '@/modules/sheet/sheetFrame';

/** Талбарын нэр (Enterprise — жижиг үсгээр; `bagts.pkg.resolveSchema` `f.bham`) */
export const WORK_DEPS_FIELD = 'bagts_hamaaral';
/** Талбарын урт (админы Notebook-оор нэмэх String 8000) */
export const WORK_DEPS_MAX = 8000;

export type WorkRef = { p: string; k: string; o?: number; n?: number; d?: number };
export type RefChange = { add: readonly WorkRef[]; remove: readonly WorkRef[] };

/** Хуудасны мөр (`bagtsSheet.SheetRow`-ийн хэрэгтэй хэсэг + талбарын түүхий утга `val`) */
export type WorkRow = {
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  des?: number | null;
  val?: unknown;
};

export type NodeId = string;
const SEP = '\u0001';
export const nodeId = (p: string, k: string, o = 0): NodeId => `${p}${SEP}${k}${SEP}${o}`;
export const refId = (r: Pick<WorkRef, 'p' | 'k' | 'o'>): NodeId => nodeId(r.p, r.k, r.o ?? 0);

const isInt = (x: unknown, min: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min;

/** Шахсан хэлбэр — 0/1 анхдагчийг орхино (8000 тэмдэгтэд илүү холбоос багтана) */
const compact = (r: WorkRef): WorkRef => {
  const o: WorkRef = { p: r.p, k: r.k };
  if (r.o) o.o = r.o;
  if (r.n != null && r.n > 1) o.n = r.n;
  if (r.d != null) o.d = r.d;
  return o;
};

/**
 * Талбарын утга → холбоосууд. Хоосон/`null` → `[]`.
 * ⚠️ ЭВДЭРСЭН бичлэгийг ЧИМЭЭГҮЙ хоосон болгохгүй — ШИДНЭ (хуучин `parseDeps`-ийн дүрэм): эс бөгөөс
 *    дараагийн бичилт тэр мөрийн бүх холбоог дарна. Давхардлыг (ижил `p`·`k`·`o`) нэг болгоно.
 */
export function parseRefs(raw: unknown): WorkRef[] {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  let j: unknown;
  try {
    j = JSON.parse(s);
  } catch {
    throw new Error(tr('Ажлын хамаарлын бичлэг эвдэрсэн байна (JSON биш)'));
  }
  if (!Array.isArray(j)) throw new Error(tr('Ажлын хамаарлын бичлэг эвдэрсэн байна (массив биш)'));
  const out: WorkRef[] = [];
  const seen = new Set<string>();
  for (const x of j) {
    const e = (x ?? {}) as Record<string, unknown>;
    const ok = typeof x === 'object' && x !== null
      && typeof e.p === 'string' && !!e.p.trim() && typeof e.k === 'string' && !!e.k.trim()
      && (e.o === undefined || isInt(e.o, 0)) && (e.n === undefined || isInt(e.n, 1))
      && (e.d === undefined || (typeof e.d === 'number' && Number.isFinite(e.d)))
      && ((e.o as number | undefined) ?? 0) < ((e.n as number | undefined) ?? 1);
    if (!ok) throw new Error(tr('Ажлын хамаарлын бичлэг эвдэрсэн байна (буруу холбоос)'));
    const r = compact({ p: e.p as string, k: e.k as string, o: e.o as number | undefined, n: e.n as number | undefined, d: e.d as number | undefined });
    const id = refId(r);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/** Холбоосууд → талбарын утга. Хоосон бол `null` (талбар цэвэр үлдэнэ) */
export const refsJson = (refs: readonly WorkRef[]): string | null =>
  (refs.length ? JSON.stringify(refs.map(compact)) : null);

/** 8000 тэмдэгтээс урт бол ил шалтгаан */
export function sizeError(json: string | null): string | null {
  if (json == null || json.length <= WORK_DEPS_MAX) return null;
  return tr('Хамаарлын бичлэг хэт урт — {0} тэмдэгт, дээд хязгаар {1}. Энэ ажлын зарим холбоосыг хасна уу.', String(json.length), String(WORK_DEPS_MAX));
}

const refKey = (r: WorkRef): string => JSON.stringify(compact(r));

/** Хоёр жагсаалт ИЖИЛ үү (дараалал хамаагүй, шахсан хэлбэрээр) */
export function sameRefs(a: readonly WorkRef[], b: readonly WorkRef[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a.map(refKey));
  return b.every((r) => s.has(refKey(r)));
}

/**
 * Өөрчлөлтийг ОДООГИЙН (бичихийн өмнө ДАХИН уншсан) жагсаалт дээр хэрэглэнэ — хоёр засварлагч бие биенийхээ
 * холбоог дарахгүй (хуучин `saveChange`-ийн optimistic дүрэм). Нэмэх/хасах хоёулаа IDEMPOTENT.
 * ⚠️ Байгаа холбоосыг дахин «нэмэх» нь түүнийг ШИНЭ (`n`/`d`) мэдээллээр шинэчилнэ.
 */
export function applyRefChange(cur: readonly WorkRef[], c: RefChange): WorkRef[] {
  const rm = new Set(c.remove.map(refId));
  const out = cur.filter((r) => !rm.has(refId(r))).map(compact);
  for (const a of c.add) {
    const id = refId(a);
    const i = out.findIndex((r) => refId(r) === id);
    if (i >= 0) out[i] = compact(a);
    else out.push(compact(a));
  }
  return out;
}

/* ══════════════ Мөрийн таних тэмдэг ══════════════ */

/**
 * Мөр бүрийн ЭЦЭГ ба ЗАМ («Б18 → 10 → 2») — `sheetFrame.describeNegCells`-ийн дүрэм: өвөг бүрийн хоосон биш №
 * (гүнээр буурах дараалал) + өөрийн № (хоосон бол «—»).
 */
export function pathsOf(rows: readonly Pick<WorkRow, 'no' | 'depth'>[]): { path: string[]; parent: number }[] {
  const stack: number[] = [];
  return rows.map((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : -1;
    const path = stack.map((j) => String(rows[j].no ?? '').trim()).filter(Boolean);
    path.push(String(r.no ?? '').trim() || '—');
    stack.push(i);
    return { path, parent };
  });
}

/* ══════════════ Граф ══════════════ */

/** Хуудас — `rows: null` = уншигдаагүй; `field` = `bagts_hamaaral` талбартай эсэх */
export type SheetIn = { p: string; rows: readonly WorkRow[] | null; field: boolean };

export type WNode = {
  id: NodeId;
  p: string;
  k: string;
  o: number;
  n: number;
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  des: number | null;
  path: string[];
  parent: NodeId | null;
};

/** Урьдчилагч рүү заасан холбоо — `to: null` бол ӨНЧИН (`why`) */
export type Edge = { ref: WorkRef; to: NodeId | null; why?: 'missing' | 'ambiguous' | 'unloaded' };

export type WorkGraph = {
  nodes: Map<NodeId, WNode>;
  /** Хуудас бүрийн мөрүүд — хуудасны дарааллаар */
  bySheet: Map<string, NodeId[]>;
  /** Хуудас → шошго → мөрүүд (давтамжийн дарааллаар) */
  index: Map<string, Map<string, NodeId[]>>;
  /** ХАМААРАХ ажил → урьдчилагчид (өнчнийг ОРУУЛСАН) */
  pre: Map<NodeId, Edge[]>;
  /** Урьдчилагч → түүнээс хамаардаг ажлууд (зөвхөн тулгагдсан) */
  post: Map<NodeId, NodeId[]>;
  /** Задлагдаагүй (эвдэрсэн) бичлэгтэй мөрүүд — засах боломжгүй, ил харуулна */
  bad: { id: NodeId; raw: string; error: string }[];
  loaded: Set<string>;
  failed: Set<string>;
  withField: Set<string>;
};

/** Холбоосыг мөр рүү тулгана (`WorkGraph.index`) — толгойн ⚠️-ийн дүрэм */
export function resolveRef(
  g: Pick<WorkGraph, 'nodes' | 'index' | 'failed'>,
  ref: WorkRef,
): { to: NodeId } | { to: null; why: 'missing' | 'ambiguous' | 'unloaded' } {
  const sh = g.index.get(ref.p);
  if (!sh) return { to: null, why: g.failed.has(ref.p) ? 'unloaded' : 'missing' };
  const cand = sh.get(ref.k) ?? [];
  if (!cand.length) return { to: null, why: 'missing' };
  /* ⚠️ `Des_dugaar` таарвал (шошго ижил мөрүүдийн ДОТОР, ганц) — тэр нь агшин дамжин тогтвортой код */
  if (ref.d != null) {
    const hit = cand.filter((id) => g.nodes.get(id)?.des === ref.d);
    if (hit.length === 1) return { to: hit[0] };
  }
  const o = ref.o ?? 0;
  const n = ref.n ?? 1;
  if (cand.length === n && o < n) return { to: cand[o] };
  /* ⚠️ Тоо зөрсөн (ижил шошготой мөр нэмэгдсэн/хасагдсан) — `mapOldOids`-ийн дүрэм: ТААМАГЛАХГҮЙ */
  return { to: null, why: 'ambiguous' };
}

/** Мөрийн холбоос (бичихэд) — одоогийн жаазын давтамж ба `Des_dugaar`-тай */
export const refOf = (x: Pick<WNode, 'p' | 'k' | 'o' | 'n' | 'des'>): WorkRef =>
  compact({ p: x.p, k: x.k, o: x.o, n: x.n, d: x.des ?? undefined });

/** Хуудсуудаас граф угсарна (цэвэр) */
export function buildGraph(sheets: readonly SheetIn[]): WorkGraph {
  const g: WorkGraph = {
    nodes: new Map(), bySheet: new Map(), index: new Map(), pre: new Map(), post: new Map(), bad: [],
    loaded: new Set(), failed: new Set(), withField: new Set(),
  };
  const vals: [NodeId, unknown][] = [];
  for (const sh of sheets) {
    if (sh.field) g.withField.add(sh.p);
    if (!sh.rows) { g.failed.add(sh.p); continue; }
    g.loaded.add(sh.p);
    const rows = sh.rows;
    const occ = new Map(rowOccOf(rows).map(([oid, o, n]) => [oid, [o, n] as const]));
    const paths = pathsOf(rows);
    const ids: NodeId[] = [];
    const idx = new Map<string, NodeId[]>();
    rows.forEach((r, i) => {
      const k = rowKeyOf(r);
      const [o, n] = occ.get(r.oid) ?? [0, 1];
      const id = nodeId(sh.p, k, o);
      ids.push(id);
      const l = idx.get(k);
      if (l) l.push(id); else idx.set(k, [id]);
      const par = paths[i].parent;
      g.nodes.set(id, {
        /* ⚠️ 2026-10-23 (S15): `work` нь ДЭЛГЭЦ/хайлтын нэр — є/ї → ө/ү (`format.fixCyr`). Таних түлхүүр `k` нь
           ТҮҮХИЙ нэрээс (`rowKeyOf(r)` дээр) — хадгалсан хамаарлын лавлагаа тасрахгүй. */
        id, p: sh.p, k, o, n, oid: r.oid, no: r.no, work: fixCyr(r.work), depth: r.depth, group: r.group,
        des: r.des ?? null, path: paths[i].path, parent: par >= 0 ? ids[par] : null,
      });
      if (sh.field && r.val != null && String(r.val).trim()) vals.push([id, r.val]);
    });
    g.bySheet.set(sh.p, ids);
    g.index.set(sh.p, idx);
  }
  for (const [id, raw] of vals) {
    let refs: WorkRef[];
    try {
      refs = parseRefs(raw);
    } catch (e) {
      g.bad.push({ id, raw: String(raw), error: (e as Error).message });
      continue;
    }
    const edges: Edge[] = refs.map((ref) => {
      const r = resolveRef(g, ref);
      return 'why' in r ? { ref, to: null, why: r.why } : { ref, to: r.to };
    });
    if (!edges.length) continue;
    g.pre.set(id, edges);
    for (const e of edges) {
      if (!e.to) continue;
      const l = g.post.get(e.to);
      if (l) { if (!l.includes(id)) l.push(id); } else g.post.set(e.to, [id]);
    }
  }
  return g;
}

/** `from`-оос урьдчилагчийн сумаар (pre) явж `target`-д хүрэх үү */
export function reachesPre(g: Pick<WorkGraph, 'pre'>, from: NodeId, target: NodeId): boolean {
  const seen = new Set<NodeId>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    for (const e of g.pre.get(cur) ?? []) {
      if (e.to && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return false;
}

/**
 * `dep`-ээс (дамжуулан) хамаардаг БҮХ ажил (`post`-оор) — `x` нь энд байвал `dep ← x` нь дугуй
 * (`reachesPre(x, dep)`-тэй ижил утга). Сонгогчид олон мөрийг НЭГ давалтаар шалгана.
 */
export function dependentsOf(g: Pick<WorkGraph, 'post'>, dep: NodeId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = [dep];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const x of g.post.get(cur) ?? []) if (!out.has(x)) { out.add(x); stack.push(x); }
  }
  return out;
}

/** `dep` ажилд `pre`-г урьдчилагч болгож болох уу — болохгүй бол шалтгаан */
export function linkError(g: Pick<WorkGraph, 'pre' | 'nodes'>, dep: NodeId, pre: NodeId): string | null {
  if (dep === pre) return tr('Ажлыг өөртэй нь холбох боломжгүй');
  const a = g.nodes.get(dep);
  const b = g.nodes.get(pre);
  if (a && b && a.p === b.p) return tr('Нэг хуудасны ажлуудын уялдааг «Хуваарь»-аас бүртгэнэ');
  /* ⚠️ pre → … → dep зам байвал (pre нь dep-ээс дамжуулан хамаардаг) dep → pre нь дугуй үүсгэнэ */
  if (reachesPre(g, pre, dep)) return tr('Дугуй хамаарал үүснэ — тэр ажил энэ ажлаас (дамжуулан) хамаардаг');
  return null;
}

/**
 * Шинэ жагсаалтыг ШАЛГАНА (бичихийн өмнө): НЭМЭГДСЭН холбоос бүр тулгагдах · өөр хуудас · дугуйгүй; урт ≤ 8000.
 * ⚠️ Хасалт ба хуучин (өнчин ч) холбоос ШАЛГАГДАХГҮЙ — тэдгээрийг хасах боломжтой байх ёстой.
 */
export function checkNext(g: WorkGraph, dep: NodeId, cur: readonly WorkRef[], next: readonly WorkRef[]): string | null {
  /* ⚠️ 2026-10-22 (аудит): ЯГ ИЖИЛ (шахсан) холбоос л «хуучин» — урьд нь `refId` (p·k·o)-оор тулгадаг тул хоёрдмол
     (өнчин) хуучин холбоостой ижил `refId`-тай ШИНЭ холбоос (өөр `n`/`d`, өөр мөрөнд тулгагдана) дугуйн шалгалтгүй
     бичигддэг байв. */
  const had = new Set(cur.map(refKey));
  for (const r of next) {
    if (had.has(refKey(r))) continue;
    const t = resolveRef(g, r);
    if (!t.to) return tr('Сонгосон ажил хуудаснаас олдсонгүй — хуудсыг дахин ачаална уу');
    const err = linkError(g, dep, t.to);
    if (err) return err;
  }
  return sizeError(refsJson(next));
}

/**
 * ⚠️ 2026-10-22 (аудит): ӨӨРЧЛӨЛТИЙГ СҮҮЛИЙН (бичихийн өмнө дахин уншсан) ГРАФ ДЭЭР ШИНЭЧИЛНЭ.
 *   · НЭМЭХ холбоос нь харагдацын (хуучирсан байж болох) графаас ирсэн — `o`/`n`/`d`-ийг сүүлийн жаазынхаар
 *     (`refOf`) солино; эс бөгөөс ижил шошготой мөр нэмэгдсэн хуудсанд бичмэгц «хоёрдмол» (өнчин) болно.
 *   · Нэмэх/хасах ажил руу ТУЛГАГДДАГ бусад хуучин холбоосыг (`cur`, өөр `o`/`n` боловч ижил мөр — жиш. `d`-ээр)
 *     мөн хасна: эс бөгөөс нэг ажил хоёр удаа бичигдэх, эсвэл «устгасан» холбоо нөгөө бичлэгээрээ үлдэх байв.
 *   · Тулгагдахгүй (өнчин) холбоосыг ХЭВЭЭР нь — хасахдаа `refId`-аар, нэмэхэд `checkNext` татгалзана.
 */
export function rebaseChange(g: Pick<WorkGraph, 'nodes' | 'index' | 'failed'>, cur: readonly WorkRef[], c: RefChange): RefChange {
  const target = (r: WorkRef): NodeId | null => resolveRef(g, r).to;
  const add = c.add.map((r) => {
    const t = target(r);
    const n = t ? g.nodes.get(t) : undefined;
    return n ? refOf(n) : r;
  });
  const addIds = new Set(add.map(refId));
  const hit = new Set([...add, ...c.remove].map(target).filter((x): x is NodeId => !!x));
  const extra = cur.filter((r) => !addIds.has(refId(r)) && hit.has(target(r) ?? ''));
  return { add, remove: [...c.remove, ...extra] };
}

/** Шинэчилсэн уншилтын мөрүүдээс ажлыг холбоосоор олно (`resolveRef`-ийн ЯГ дүрэм) */
export function locateRow<R extends WorkRow>(rows: readonly R[], ref: WorkRef): R | null {
  const g = buildGraph([{ p: ref.p, rows, field: false }]);
  const r = resolveRef(g, ref);
  if (!r.to) return null;
  const oid = g.nodes.get(r.to)?.oid;
  return rows.find((x) => x.oid === oid) ?? null;
}

/* ══════════════ Багцын түвшин ══════════════ */

/** Багц хоорондын тойм — `from` (урьдчилагчийн хуудас) → `to` (хамаарах ажлын хуудас), холбоосын тоо */
export type PkgPair = { from: string; to: string; n: number };

/**
 * Ажлын холбоосоос хуудас хоорондын тойм. Тулгагдсан холбоос + хуудас нь уншигдаагүй (`unloaded`) холбоос
 * (`ref.p` мэдэгдэж байгаа); ӨНЧИН (`missing` · `ambiguous`) ОРОХГҮЙ.
 */
export function pkgPairs(g: WorkGraph): PkgPair[] {
  const m = new Map<string, PkgPair>();
  for (const [dep, edges] of g.pre) {
    const to = g.nodes.get(dep)?.p;
    if (!to) continue;
    for (const e of edges) {
      const from = e.to ? g.nodes.get(e.to)?.p : e.why === 'unloaded' ? e.ref.p : undefined;
      if (!from) continue;
      const key = `${from}>${to}`;
      const x = m.get(key);
      if (x) x.n += 1; else m.set(key, { from, to, n: 1 });
    }
  }
  return [...m.values()];
}

/** Багцын түвшний хамаарал (`from` урд, `to` ард) — ТУХ-д */
export type PkgDep = { from: string; to: string };

/** Хуудсын хосоос багцын түлхүүрийн хос (`keyOf` = `bagtsKey(pkg.group)`); өөртөө (9F ↔ 12F) орохгүй */
export function pkgDeps(pairs: readonly PkgPair[], keyOf: (p: string) => string): PkgDep[] {
  const out: PkgDep[] = [];
  const seen = new Set<string>();
  for (const x of pairs) {
    const from = keyOf(x.from);
    const to = keyOf(x.to);
    if (!from || !to || from === to) continue;
    const k = `${from}>${to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ from, to });
  }
  return out;
}

/** Энэ багц ХАМААРДАГ (урд талын) багцууд */
export const upstreamOf = (deps: readonly PkgDep[], key: string): string[] =>
  deps.filter((d) => d.to === key).map((d) => d.from);

/** Энэ багцаас ХАМААРДАГ (ард талын) багцууд */
export const downstreamOf = (deps: readonly PkgDep[], key: string): string[] =>
  deps.filter((d) => d.from === key).map((d) => d.to);

/**
 * ХУУЧИН (багц ↔ багц) холбоосын ТУХ түлхүүр («БАГЦ1» · «energy:БАГЦ61») → багцын түлхүүр (`bagtsKey`).
 * Зураг төсөл (`d:`) ба диапазон (`cf:`) мөр нь хуудасгүй → `''`.
 */
export const legacyPkgKey = (k: string): string =>
  (/^(d|cf):/.test(k) ? '' : k.includes(':') ? k.slice(k.indexOf(':') + 1) : k);

/**
 * Хуучин хос `{ from: X, to: Y }` («Y нь X-ээс хамаарна») ажлын түвшинд ШИЛЖСЭН үү — Y-ийн аль нэг хуудасны
 * ажил X-ийн аль нэг хуудасны ажлаас хамаарсан холбоос НЭГ Ч бол бий.
 */
export function legacyCovered(
  pairs: readonly PkgPair[],
  dep: PkgDep,
  sheetsOf: (pkgKey: string) => readonly string[],
): boolean {
  const pre = new Set(sheetsOf(legacyPkgKey(dep.from)));
  const post = new Set(sheetsOf(legacyPkgKey(dep.to)));
  return pairs.some((x) => x.n > 0 && pre.has(x.from) && post.has(x.to));
}

/* ══════════════ Харагдацын туслах ══════════════ */

/** Хуудасны ажлуудыг ЭЦЭГ БҮЛГЭЭР нь — бүлэг бүрийн доторх ажил (бүлэг биш мөр), хуудасны дарааллаар */
export type Section = { id: NodeId | null; items: NodeId[] };
export function sectionsOf(g: Pick<WorkGraph, 'bySheet' | 'nodes'>, p: string): Section[] {
  const out: Section[] = [];
  const at = new Map<string, Section>();
  for (const id of g.bySheet.get(p) ?? []) {
    const n = g.nodes.get(id)!;
    if (n.group) continue;
    const key = n.parent ?? '';
    let s = at.get(key);
    if (!s) { s = { id: n.parent, items: [] }; at.set(key, s); out.push(s); }
    s.items.push(id);
  }
  return out;
}

/** Хайлтын тааралт — № · зам · ажлын нэр (жижиг үсэг, зай нэгтгэсэн) */
export function nodeMatches(n: Pick<WNode, 'path' | 'work'>, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return true;
  return `${n.path.join(' ')} ${n.work}`.toLowerCase().replace(/\s+/g, ' ').includes(s);
}
