/**
 * ҮЕ ШАТНЫ МЭДЭЭЛЭЛ ОРУУЛАХ 4 ХУУДАС — ЦЭВЭР логик (2026-11-04, хэрэглэгч: «Оруулах газаргүй, хоосон үлддэг
 * баганыг оруулдаг тусдаа хэсэг, тус бүр өөрийн эрхтэй; Зөвшөөрөл хэсэгт мөр нэмж зөвшөөрлүүдийг оруулна, ТТБ-д
 * хадгалагдана»). Харагдац: `src/modules/UyShatOruulah.tsx` (нэг бүрэлдэхүүн, 4 тохиргоо). Тест: `uyShat.check.mjs`.
 *
 *   zahiramj      — багц бүрийн барилга угсралтын мөр: захирамжийн огноо, дугаар
 *   songon        — Сонгон шалгаруулалт үе шатын мод: багцын мөрд сонгон · гэрээ байгуулсан огноо, навчинд явц %
 *   zovshoorolTtb — Зөвшөөрөл үе шатын мод: навчинд эхлэх · дуусах · явц %; багцын мөрийн доор зөвшөөрлийн мөр нэмнэ
 *   ashiglalt     — багц бүрийн барилга угсралтын мөр: ашиглалтад оруулах огноо
 *
 * Барилга угсралтын «Бэлтгэл ажил» салбарын (5.1.x) блокийн мөрийн явц тусдаа хуудасгүй — блокийн мөрийн явц бөглөх
 * хуудасны «А. Бэлтгэл ажил» мөрөөс автоматаар (`PlanInputs.prepActual`, `blockProgress.loadPrepProgress`, 2026-11-05).
 *
 * 6 түвшний хуваарь (`levelPlan.buildL2`) эдгээр талбарыг аль хэдийн уншдаг тул энд бичсэн утга шууд milestone болно.
 */
import type { CapKey } from './caps';
import { packagesOf } from './levelPlan';
import { isAddedWork, saneDate, type PhaseKind, type PlanNode, type PlanStoredRow, type PlanTree } from './projectPlan';
import {
  canAddWorkIn, dayOf, parseDay, parsePct, rowKey, sortByKod, splitWeights, workAdd, workNameWhy,
  type Names, type Pending,
} from './zuragTosol';

export type PageKey = 'zahiramj' | 'songon' | 'zovshoorolTtb' | 'ashiglalt';

/** Нэг оруулах талбар: `key` — `PlanStoredRow`-ийн түлхүүр = `Guitsetgel_talbe/182`-ийн талбарын нэр */
export type FieldDef = {
  key: 'zahiramj_ognoo' | 'zahiramj_dugaar' | 'songon_ognoo' | 'geree_ognoo' | 'ashiglalt_ognoo'
  | 'guits_ehleh' | 'guits_duusah' | 'guitsetgel_huvi';
  kind: 'date' | 'text' | 'pct';
  /** Аль мөрд засагдах вэ: `pkg` — багцтай, блокгүй мөр; `leaf` — хүүхэдгүй мөр; `row` — бүх мөр */
  on: 'pkg' | 'leaf' | 'row';
};

export type PageDef = {
  key: PageKey;
  /** Модны үе шат; байхгүй бол багцын хавтгай жагсаалт (`packagesOf`) */
  phase?: PhaseKind;
  fields: readonly FieldDef[];
  cap: CapKey;
  /** Багцын мөрийн доор мөр нэмэх/устгах (Зөвшөөрөл) */
  addRows?: boolean;
};

export const PAGES: Record<PageKey, PageDef> = {
  zahiramj: {
    key: 'zahiramj', cap: 'zahiramjEdit',
    fields: [{ key: 'zahiramj_ognoo', kind: 'date', on: 'row' }, { key: 'zahiramj_dugaar', kind: 'text', on: 'row' }],
  },
  songon: {
    key: 'songon', phase: 'songon', cap: 'songonEdit',
    fields: [
      { key: 'songon_ognoo', kind: 'date', on: 'pkg' }, { key: 'geree_ognoo', kind: 'date', on: 'pkg' },
      { key: 'guitsetgel_huvi', kind: 'pct', on: 'leaf' },
    ],
  },
  zovshoorolTtb: {
    key: 'zovshoorolTtb', phase: 'zovshoorol', cap: 'zovshoorolTtbEdit', addRows: true,
    fields: [
      { key: 'guits_ehleh', kind: 'date', on: 'leaf' }, { key: 'guits_duusah', kind: 'date', on: 'leaf' },
      { key: 'guitsetgel_huvi', kind: 'pct', on: 'leaf' },
    ],
  },
  ashiglalt: {
    key: 'ashiglalt', cap: 'ashiglaltEdit',
    fields: [{ key: 'ashiglalt_ognoo', kind: 'date', on: 'row' }],
  },
};

/** Хуудасны мөрүүд — үе шатын мод (урьдчилсан дараалал) эсвэл багцын хавтгай жагсаалт */
export function rowsOf(page: PageDef, tree: PlanTree): PlanNode[] {
  if (page.phase) return tree.nodes.filter((n) => n.phase === page.phase);
  return packagesOf(tree).map((p) => p.node);
}

const isPkgRow = (n: PlanNode): boolean => !!n.row && !!String(n.row.bagts ?? '').trim() && !n.blok;

/** Мөрд засагдах талбарууд */
export function editableFields(page: PageDef, n: PlanNode): FieldDef[] {
  if (!n.row) return [];
  return page.fields.filter((f) => (f.on === 'row' ? true : f.on === 'leaf' ? n.children.length === 0 : isPkgRow(n)));
}

/** Багцын мөрийн доор мөр нэмж болох уу (Зөвшөөрөл) */
export const canAddRow = (page: PageDef, n: PlanNode): boolean =>
  !!page.addRows && !!page.phase && canAddWorkIn(n, page.phase);

/** Нэмсэн мөрийг устгаж болох уу — навч, мөнгөгүй, хадгалсан */
export const canDeleteRow = (page: PageDef, n: PlanNode): boolean =>
  !!page.addRows && isAddedWork(n) && n.children.length === 0 && n.row?.objectid != null;

/** Шинэ мөр — `zuragTosol.workAdd`-тай ижил (dd_kod, эцэг, багц, жин тэнцүү хуваагдана) */
export const rowAdd = (page: PageDef, n: PlanNode, tree: PlanTree, name: string): PlanStoredRow | null =>
  (page.phase && page.addRows ? workAdd(n, tree, name, page.phase) : null);

export { workNameWhy };

/* ══════════════════ Засвар ══════════════════ */

/** Талбарын хадгалсан утга → оролтын текст */
export function origText(r: PlanStoredRow, f: FieldDef): string {
  const v = r[f.key];
  if (f.kind === 'text') return v == null ? '' : String(v);
  if (f.kind === 'pct') return v == null ? '' : String(Math.round(Number(v) * 1e6) / 1e6);
  return dayOf(v as number | null | undefined);
}

export const textOf = (p: Pending, r: PlanStoredRow, f: FieldDef): string =>
  (p.edits[rowKey(r)] as Record<string, string> | undefined)?.[f.key] ?? origText(r, f);

type Parsed = { ok: true; v: number | string | null } | { ok: false };
const parseOf = (f: FieldDef, text: string): Parsed => {
  if (f.kind === 'text') { const t = text.trim(); return { ok: true, v: t || null }; }
  return f.kind === 'pct' ? parsePct(text) : parseDay(text);
};

export const badText = (f: FieldDef, text: string): boolean => !parseOf(f, text).ok;

/** Засвар тавина — анхны утга руугаа буцвал засвараас хасна */
export function setEdit(p: Pending, r: PlanStoredRow, f: FieldDef, text: string): Pending {
  const k = rowKey(r);
  const cur: Record<string, string> = { ...(p.edits[k] as Record<string, string> | undefined ?? {}) };
  if (text === origText(r, f)) delete cur[f.key];
  else cur[f.key] = text;
  const edits = { ...p.edits } as Record<string, Record<string, string>>;
  if (Object.keys(cur).length) edits[k] = cur;
  else delete edits[k];
  return { ...p, edits: edits as Pending['edits'] };
}

/** Засвар хэрэглэсэн мөр — буруу оролт хадгалсан утгаа барина */
function merged(page: PageDef, r: PlanStoredRow, e: Record<string, string> | undefined): PlanStoredRow {
  if (!e) return r;
  const o: PlanStoredRow = { ...r };
  for (const f of page.fields) {
    if (!(f.key in e)) continue;
    const ps = parseOf(f, e[f.key]);
    if (ps.ok) (o as Record<string, unknown>)[f.key] = ps.v;
  }
  return o;
}

const withoutDeleted = (base: readonly PlanStoredRow[], p: Pending): PlanStoredRow[] => {
  const del = new Set(p.deletes ?? []);
  return del.size ? base.filter((r) => r.objectid == null || !del.has(r.objectid)) : [...base];
};

/** Урьдчилсан мөрүүд — засвар + шинэ мөр (жин тэнцүү), устгал хасагдсан, dd_kod-оор эрэмбэлсэн */
export function effectiveRows(page: PageDef, base: readonly PlanStoredRow[], p: Pending): PlanStoredRow[] {
  const sw = splitWeights(base, p);
  const row = (r: PlanStoredRow): PlanStoredRow => {
    const w = r.objectid != null ? sw.saved.get(r.objectid) : sw.adds.get(rowKey(r));
    return merged(page, w == null ? r : { ...r, heseg_ezleh_huvi: w }, p.edits[rowKey(r)] as Record<string, string> | undefined);
  };
  return sortByKod([...withoutDeleted(base, p).map(row), ...p.adds.map(row)]);
}

export const pendingCount = (p: Pending): number =>
  new Set([...Object.keys(p.edits), ...p.adds.map(rowKey), ...(p.deletes ?? []).map((o) => `d${o}`)]).size;

export type Issue = { code: string | null; kind: 'date' | 'pct' | 'order' | 'pair' | 'missing' };
export type Payload = { updates: Record<string, unknown>[]; adds: Record<string, unknown>[]; deletes: number[]; issues: Issue[] };

const sameVal = (f: FieldDef, a: unknown, b: unknown): boolean => {
  if (f.kind === 'date') return dayOf(a as number | null) === dayOf(b as number | null);
  if (f.kind === 'text') return String(a ?? '') === String(b ?? '');
  const x = a == null ? null : Number(a), y = b == null ? null : Number(b);
  return x == null || y == null ? x === y : Math.abs(x - y) < 1e-9;
};

/**
 * ЗАСВАРЫН АЧАА — oid + зөрсөн талбар. `guits_ehleh`/`guits_duusah` хос (хоёулаа эсвэл хоёулаа хоосон, эхлэх ≤ дуусах);
 * дан огноо (захирамж · сонгон · гэрээ · ашиглалт) ганцаараа зөв. Нэмсэн мөр `zuragTosol.buildEdits`-тэй ижил талбартай.
 */
export function buildEdits(page: PageDef, base: readonly PlanStoredRow[], p: Pending, names: Names): Payload {
  const updates: Record<string, unknown>[] = [];
  const adds: Record<string, unknown>[] = [];
  const issues: Issue[] = [];
  const byKey = new Map(base.map((r) => [rowKey(r), r] as const));
  const addKeys = new Set(p.adds.map(rowKey));
  const pairKeys = new Set(['guits_ehleh', 'guits_duusah']);

  const changes = (r: PlanStoredRow, e: Record<string, string>): Record<string, unknown> | null => {
    const out: Record<string, unknown> = {};
    let bad = false;
    for (const f of page.fields) {
      if (!(f.key in e)) continue;
      const ps = parseOf(f, e[f.key]);
      if (!ps.ok) { issues.push({ code: r.dd_kod, kind: f.kind === 'pct' ? 'pct' : 'date' }); bad = true; continue; }
      if (!sameVal(f, r[f.key], ps.v)) out[f.key] = ps.v;
    }
    if (bad) return null;
    if (pairKeys.has('guits_ehleh') && ('guits_ehleh' in out || 'guits_duusah' in out)) {
      const s = 'guits_ehleh' in out ? out.guits_ehleh as number | null : saneDate(r.guits_ehleh);
      const en = 'guits_duusah' in out ? out.guits_duusah as number | null : saneDate(r.guits_duusah);
      if ((s == null) !== (en == null)) { issues.push({ code: r.dd_kod, kind: 'pair' }); return null; }
      if (s != null && en != null && s > en) { issues.push({ code: r.dd_kod, kind: 'order' }); return null; }
    }
    return out;
  };

  const deletes: number[] = [];
  for (const o of p.deletes ?? []) {
    if (base.some((r) => r.objectid === o)) deletes.push(o);
    else issues.push({ code: null, kind: 'missing' });
  }
  const delSet = new Set(deletes);

  for (const [key, e] of Object.entries(p.edits)) {
    if (addKeys.has(key)) continue;
    const r = byKey.get(key);
    if (!r || r.objectid == null) { issues.push({ code: null, kind: 'missing' }); continue; }
    if (delSet.has(r.objectid)) continue;
    const ch = changes(r, e as Record<string, string>);
    if (!ch || !Object.keys(ch).length) continue;
    updates.push({ [names.oid]: r.objectid, ...ch });
  }

  /* Жин тэнцүү хуваах — нэмсэн/устгасан эцгийн хадгалсан мөрүүд 1/k (хэрэглэгч жин бичдэггүй) */
  const sw = splitWeights(base, { ...p, deletes });
  for (const [oid, w] of sw.saved) {
    const r = base.find((x) => x.objectid === oid)!;
    if (typeof r.heseg_ezleh_huvi === 'number' && Math.abs(r.heseg_ezleh_huvi - w) < 1e-9) continue;
    const u = updates.find((x) => x[names.oid] === oid);
    if (u) u.heseg_ezleh_huvi = w; else updates.push({ [names.oid]: oid, heseg_ezleh_huvi: w });
  }

  for (const a of p.adds) {
    const key = rowKey(a);
    const w = sw.adds.get(key);
    const r = w == null ? a : { ...a, heseg_ezleh_huvi: w };
    const ch = changes(r, (p.edits[key] as Record<string, string> | undefined) ?? {});
    if (!ch) continue;
    const m: Record<string, unknown> = { ...r, ...ch };
    adds.push({
      dd_kod: m.dd_kod, etseg_kod: m.etseg_kod ?? null, tuvshin: m.tuvshin ?? null, uy_shat: m.uy_shat ?? null,
      bagts: m.bagts ?? null, blok: m.blok ?? null, ajil_uilchilgee: m.ajil_uilchilgee ?? null,
      heseg_ezleh_huvi: m.heseg_ezleh_huvi ?? null,
      guits_ehleh: m.guits_ehleh ?? null, guits_duusah: m.guits_duusah ?? null, guitsetgel_huvi: m.guitsetgel_huvi ?? null,
      [names.cfId]: null,
    });
  }
  return { updates, adds, deletes, issues };
}

/** Зэрэг засвар — бидний бичих талбарыг өөр хүн зассан эсвэл мөр устсан бол тэр мөрийн код */
export function conflicts(
  page: PageDef, base: readonly PlanStoredRow[], fresh: readonly PlanStoredRow[],
  updates: readonly Record<string, unknown>[], names: Names,
): string[] {
  const b = new Map(base.map((r) => [r.objectid, r] as const));
  const f = new Map(fresh.map((r) => [r.objectid, r] as const));
  const out: string[] = [];
  for (const u of updates) {
    const oid = u[names.oid] as number;
    const was = b.get(oid);
    const now = f.get(oid);
    if (!was || !now) { out.push(was?.dd_kod ?? String(oid)); continue; }
    for (const fd of page.fields) {
      if (!(fd.key in u)) continue;
      if (!sameVal(fd, was[fd.key], now[fd.key])) { out.push(was.dd_kod ?? String(oid)); break; }
    }
  }
  return out;
}
