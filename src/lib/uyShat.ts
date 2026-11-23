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
import { t as tr } from './i18nCore';
import { packagesOf } from './levelPlan';
import { isAddedWork, saneDate, tenderLockWhy, ubToday, type PhaseKind, type PlanNode, type PlanStoredRow, type PlanTree } from './projectPlan';
import {
  canAddWorkIn, dayOf, parseDay, parsePct, rowKey, sortByKod, splitWeights, workAdd, workNameWhy,
  type Names, type Pending,
} from './zuragTosol';

export type PageKey = 'zahiramj' | 'songon' | 'zovshoorolTtb' | 'ashiglalt';

/** Нэг оруулах талбар: `key` — `PlanStoredRow`-ийн түлхүүр = `Guitsetgel_talbe/182`-ийн талбарын нэр */
export type FieldDef = {
  key: 'zahiramj_ognoo' | 'zahiramj_dugaar' | 'geree_ognoo' | 'ashiglalt_ognoo'
  | 'guits_ehleh' | 'guits_duusah' | 'guitsetgel_huvi'
  | 'ajil_uilchilgee' | 'bagts' | 'ho_dun_zahiramj';
  kind: 'date' | 'text' | 'pct' | 'num';
  /** Аль мөрд засагдах вэ: `pkg` — багцтай, блокгүй мөр; `leaf` — хүүхэдгүй мөр; `row` — бүх мөр; `decree` — захирамжийн мөр (бүлэг биш) */
  on: 'pkg' | 'leaf' | 'row' | 'decree';
};

export type PageDef = {
  key: PageKey;
  /** Модны үе шат; байхгүй бол багцын хавтгай жагсаалт (`packagesOf`) */
  phase?: PhaseKind;
  fields: readonly FieldDef[];
  cap: CapKey;
  /** Багцын мөрийн доор мөр нэмэх/устгах (Зөвшөөрөл) */
  addRows?: boolean;
  /** Захирамж: барилга угсралтын ажлын мөрүүд (доод мөргүй); бүлгийн доор шинэ ажлын мөр = шинэ захирамж */
  decree?: boolean;
  /** Сонгон: гэрээний мэдээлэл (огноо · дугаар · гүйцэтгэгч) ТТБ-ийн гэрээний мөрөөс — зөвхөн харуулна */
  contractInfo?: boolean;
  /** Ашиглалт: барилгын дуусах огноо ба гүйцэтгэл — зөвхөн харуулна */
  buildInfo?: boolean;
  /** Зөвшөөрөл · Ашиглалт: огноо дутуу мөр шараар, «Зөвхөн асуудалтай» шүүлт, Excel (2026-11-23) */
  issues?: boolean;
};

export const PAGES: Record<PageKey, PageDef> = {
  /* 2026-11-23 (хэрэглэгч): шинэ захирамж — ТТБ-д шинэ ажлын мөр; захирамжийн мөрийн бүх баганыг засна (системээс гардгийг үгүй) */
  zahiramj: {
    key: 'zahiramj', phase: 'barilga', cap: 'zahiramjEdit', addRows: true, decree: true,
    fields: [
      { key: 'ajil_uilchilgee', kind: 'text', on: 'decree' }, { key: 'bagts', kind: 'text', on: 'decree' },
      { key: 'zahiramj_dugaar', kind: 'text', on: 'decree' }, { key: 'zahiramj_ognoo', kind: 'date', on: 'decree' },
      { key: 'ho_dun_zahiramj', kind: 'num', on: 'decree' },
    ],
  },
  /* 2026-11-23 (хэрэглэгч): гэрээний огноо гараар биш — ТТБ-ийн гэрээний мөрөөс; сонгон шалгаруулалтын эхлэх, дуусах огноо нэмэв */
  songon: {
    key: 'songon', phase: 'songon', cap: 'songonEdit', contractInfo: true,
    fields: [
      { key: 'guits_ehleh', kind: 'date', on: 'leaf' }, { key: 'guits_duusah', kind: 'date', on: 'leaf' },
      { key: 'guitsetgel_huvi', kind: 'pct', on: 'leaf' },
    ],
  },
  zovshoorolTtb: {
    key: 'zovshoorolTtb', phase: 'zovshoorol', cap: 'zovshoorolTtbEdit', addRows: true, issues: true,
    fields: [
      { key: 'guits_ehleh', kind: 'date', on: 'leaf' }, { key: 'guits_duusah', kind: 'date', on: 'leaf' },
      { key: 'guitsetgel_huvi', kind: 'pct', on: 'leaf' },
    ],
  },
  ashiglalt: {
    key: 'ashiglalt', cap: 'ashiglaltEdit', buildInfo: true, issues: true,
    fields: [{ key: 'ashiglalt_ognoo', kind: 'date', on: 'row' }],
  },
};

/** Хуудасны мөрүүд — үе шатын мод (урьдчилсан дараалал) эсвэл багцын хавтгай жагсаалт */
export function rowsOf(page: PageDef, tree: PlanTree): PlanNode[] {
  if (page.decree) {
    /* Захирамжийн мөр (Cashflow · захирамжтай · шинээр нэмсэн) ба тэдгээрийг агуулсан бүлгүүд л — бэлтгэл ажлын салбар орохгүй */
    const keep = new Set<PlanNode>();
    for (const n of tree.nodes) {
      if (n.phase !== page.phase || n.blok || underPkg(n) || !n.row) continue;
      const r = n.row;
      if (r.cashflow_id == null && r.zahiramj_dugaar == null && r.ho_dun_zahiramj == null && !(isAddedWork(n) && hasPkg(n.parent))) continue;
      /* ах дүү ажлын мөрүүд ч (захирамж хараахан оруулаагүй) харагдана */
      for (const sib of n.parent?.children ?? [n]) if (!sib.blok) keep.add(sib);
      for (let p: PlanNode | null = n; p; p = p.parent) keep.add(p);
    }
    return tree.nodes.filter((n) => keep.has(n));
  }
  if (page.phase) return tree.nodes.filter((n) => n.phase === page.phase);
  return packagesOf(tree).map((p) => p.node);
}

const isPkgRow = (n: PlanNode): boolean => !!n.row && !!String(n.row.bagts ?? '').trim() && !n.blok;
const hasPkg = (n: PlanNode | null): boolean => !!n?.row && !!String(n.row.bagts ?? '').trim();
/** Өвөг нь захирамжийн (Cashflow) мөр уу — тэгвэл энэ нь түүний доод (блок, бөглөх хуудасны) мөр */
const underPkg = (n: PlanNode): boolean => { for (let p = n.parent; p; p = p.parent) if (p.row?.cashflow_id != null) return true; return false; };
/** Захирамжийн мөр — Cashflow мөр эсвэл хүүхэдгүй (шинээр нэмсэн) ажлын мөр; бүлгийн мөр биш */
const isDecreeRow = (n: PlanNode): boolean => !!n.row && (n.row.cashflow_id != null || n.children.length === 0);

/** Талбар түгжигдсэн шалтгаан — гэрээтэй сонгон шалгаруулалтын явц (`tenderLockWhy`); `null` = түгжээгүй */
export const fieldLockWhy = (n: PlanNode, f: FieldDef, today: number = ubToday()): string | null =>
  (f.kind === 'pct' ? tenderLockWhy(n, today)
    : f.key === 'bagts' && n.row?.cashflow_id != null ? tr('«Төлбөрийн акт», гэрээ энэ багцаар тулгагддаг тул өөрчлөхгүй') : null);

/** Захирамжийн дугаар — латин «A»-г кирилл «А» болгоно (нүдэнд ижил, систем өөр гэж үздэг) */
export const normDecreeNo = (v: string): string => v.replace(/^[Aa](?=\s*\/)/, 'А');

/** Захирамжийн мөр дутуу уу — дугаар · огноо · дүнгийн аль нэг нь бий, бүгд биш */
export function decreeGaps(r: PlanStoredRow): ('zahiramj_dugaar' | 'zahiramj_ognoo' | 'ho_dun_zahiramj')[] {
  const has = {
    zahiramj_dugaar: !!String(r.zahiramj_dugaar ?? '').trim(),
    zahiramj_ognoo: r.zahiramj_ognoo != null,
    ho_dun_zahiramj: r.ho_dun_zahiramj != null && Number(r.ho_dun_zahiramj) > 0,
  };
  const any = Object.values(has).some(Boolean);
  return any ? (Object.keys(has) as (keyof typeof has)[]).filter((k) => !has[k]) : [];
}

/** Мөрд засагдах талбарууд */
/** Талбар энэ мөрөнд хамаарах уу (түгжээг тооцохгүй) */
const fieldApplies = (f: FieldDef, n: PlanNode): boolean =>
  f.on === 'row' ? true : f.on === 'leaf' ? n.children.length === 0 : f.on === 'decree' ? isDecreeRow(n) : isPkgRow(n);

/** Огноо дутуу (Зөвшөөрөл · Ашиглалт) — мөрөнд хамаарах огнооны талбар хоосон */
export function dateGaps(page: PageDef, n: PlanNode): FieldDef['key'][] {
  const r = n.row;
  if (!page.issues || !r) return [];
  return page.fields.filter((f) => f.kind === 'date' && fieldApplies(f, n) && saneDate(r[f.key]) == null).map((f) => f.key);
}

export function editableFields(page: PageDef, n: PlanNode, today: number = ubToday()): FieldDef[] {
  if (!n.row) return [];
  return page.fields.filter((f) => fieldApplies(f, n)
    && !(f.key === 'bagts' && n.row?.cashflow_id != null) && !fieldLockWhy(n, f, today));
}

/** Багцын мөрийн доор мөр нэмж болох уу (Зөвшөөрөл) */
export const canAddRow = (page: PageDef, n: PlanNode): boolean =>
  page.decree
    /* Захирамж: ажлын мөрүүдийн бүлэг (өөрөө багцгүй, хүүхэд бүр нь ажлын мөр) */
    ? !!n.row && n.phase === page.phase && !n.blok && n.row.cashflow_id == null && n.children.length > 0 && n.children.every(isDecreeRow)
    : !!page.addRows && !!page.phase && canAddWorkIn(n, page.phase);

/** Нэмсэн мөрийг устгаж болох уу — навч, мөнгөгүй, хадгалсан */
export const canDeleteRow = (page: PageDef, n: PlanNode): boolean =>
  !!page.addRows && isAddedWork(n) && n.children.length === 0 && n.row?.objectid != null;

/** Шинэ мөр — `zuragTosol.workAdd`-тай ижил (dd_kod, эцэг, багц, жин тэнцүү хуваагдана) */
export const rowAdd = (page: PageDef, n: PlanNode, tree: PlanTree, name: string): PlanStoredRow | null => {
  if (page.decree) {
    if (!canAddRow(page, n) || !n.row || workNameWhy(n, name)) return null;
    const used = new Set(tree.byCode.keys());
    let k = n.children.length + 1;
    while (used.has(`${n.code}.${k}`)) k += 1;
    /* Жин гараар биш — барилга угсралтын жин төсвөөс бодогдоно */
    return {
      objectid: null, dd_kod: `${n.code}.${k}`, etseg_kod: n.code, tuvshin: n.row.tuvshin != null ? n.row.tuvshin + 1 : n.depth,
      uy_shat: n.row.uy_shat ?? null, bagts: null, blok: null, ajil_uilchilgee: name.trim(), heseg_ezleh_huvi: null,
      guits_ehleh: null, guits_duusah: null, guitsetgel_huvi: null, cashflow_id: null,
    };
  }
  return page.phase && page.addRows ? workAdd(n, tree, name, page.phase) : null;
};

export { workNameWhy };

/* ══════════════════ Засвар ══════════════════ */

/** Талбарын хадгалсан утга → оролтын текст */
export function origText(r: PlanStoredRow, f: FieldDef): string {
  const v = r[f.key];
  if (f.kind === 'text') return v == null ? '' : String(v);
  if (f.kind === 'pct') return v == null ? '' : String(Math.round(Number(v) * 1e6) / 1e6);
  if (f.kind === 'num') return v == null ? '' : String(v);
  return dayOf(v as number | null | undefined);
}

export const textOf = (p: Pending, r: PlanStoredRow, f: FieldDef): string =>
  (p.edits[rowKey(r)] as Record<string, string> | undefined)?.[f.key] ?? origText(r, f);

type Parsed = { ok: true; v: number | string | null } | { ok: false };
const parseOf = (f: FieldDef, text: string): Parsed => {
  if (f.kind === 'text') { const t = f.key === 'zahiramj_dugaar' ? normDecreeNo(text.trim()) : text.trim(); return { ok: true, v: t || null }; }
  if (f.kind === 'num') {
    const t = text.replace(/[\s,₮]/g, '');
    if (!t) return { ok: true, v: null };
    const v = Number(t);
    return Number.isFinite(v) && v >= 0 ? { ok: true, v } : { ok: false };
  }
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
  const sw = page.decree ? { saved: new Map<number, number>(), adds: new Map<string, number>() } : splitWeights(base, p);
  const row = (r: PlanStoredRow): PlanStoredRow => {
    const w = r.objectid != null ? sw.saved.get(r.objectid) : sw.adds.get(rowKey(r));
    return merged(page, w == null ? r : { ...r, heseg_ezleh_huvi: w }, p.edits[rowKey(r)] as Record<string, string> | undefined);
  };
  return sortByKod([...withoutDeleted(base, p).map(row), ...p.adds.map(row)]);
}

export const pendingCount = (p: Pending): number =>
  new Set([...Object.keys(p.edits), ...p.adds.map(rowKey), ...(p.deletes ?? []).map((o) => `d${o}`)]).size;

export type Issue = { code: string | null; kind: 'date' | 'pct' | 'num' | 'order' | 'pair' | 'missing' };
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
      if (!ps.ok) { issues.push({ code: r.dd_kod, kind: f.kind === 'pct' ? 'pct' : f.kind === 'num' ? 'num' : 'date' }); bad = true; continue; }
      if (!sameVal(f, r[f.key], ps.v)) out[f.key] = ps.v;
    }
    if (bad) return null;
    if (page.decree && 'ho_dun_zahiramj' in out && r.cashflow_id == null) out.ho_dun_geree = out.ho_dun_zahiramj;
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
  const sw = page.decree ? { saved: new Map<number, number>(), adds: new Map<string, number>() } : splitWeights(base, { ...p, deletes });
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
      ...(page.decree ? {
        zahiramj_dugaar: m.zahiramj_dugaar ?? null, zahiramj_ognoo: m.zahiramj_ognoo ?? null, ho_dun_zahiramj: m.ho_dun_zahiramj ?? null,
        ho_dun_geree: m.ho_dun_zahiramj ?? null,
      } : {}),
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

/** Сонгон шалгаруулалтын мөрийн гэрээ — өөрөө эсвэл дээд мөрийн ихэр (ТТБ-ийн гэрээний мөр) */
export function contractOf(n: PlanNode): { date: number | null; no: string; contractor: string } | null {
  for (let x: PlanNode | null = n; x && x.row; x = x.parent) {
    const t = x.twin?.row;
    const date = saneDate(x.row.geree_ognoo) ?? (t ? saneDate(t.geree_ognoo) : null);
    const no = String(t?.geree_dugaar ?? '').trim();
    const contractor = String(t?.guitsetgegch ?? '').trim();
    if (date != null || no || contractor) return { date, no, contractor };
  }
  return null;
}

/** Хугацаа хэтэрсэн сонгон шалгаруулалт — навч, дуусах огноо өнгөрсөн, явц < 100, гэрээгүй */
export function tenderLate(n: PlanNode, pct: number | null, today: number = ubToday()): boolean {
  if (n.phase !== 'songon' || n.children.length || !n.row) return false;
  const end = saneDate(n.row.guits_duusah);
  return end != null && end < today && (pct ?? 0) < 100 && !contractOf(n);
}

/**
 * МӨРИЙН АНХААРУУЛГА (2026-11-23) — хуудас бүрийн дүрмээр; `null` = хэвийн.
 *   songon        — дуусах огноо өнгөрсөн, явц < 100, гэрээгүй
 *   zovshoorolTtb — зөвшөөрлийн навч: дуусах огноо өнгөрсөн, явц < 100
 *   ashiglalt     — ашиглалтын огноо барилга дуусахаас өмнө; эсвэл өнгөрсөн ч барилга дуусаагүй
 */
export function rowWarn(page: PageDef, n: PlanNode, pct: number | null, today: number = ubToday()): string | null {
  if (!n.row) return null;
  if (page.key === 'songon') return tenderLate(n, pct, today) ? tr('Хугацаа хэтэрсэн, гэрээ байгуулагдаагүй') : null;
  if (page.key === 'zovshoorolTtb') {
    const end = saneDate(n.row.guits_duusah);
    return !n.children.length && end != null && end < today && (pct ?? 0) < 100 ? tr('Зөвшөөрлийн хугацаа хэтэрсэн') : null;
  }
  if (page.key === 'ashiglalt') {
    const h = saneDate(n.row.ashiglalt_ognoo);
    const end = saneDate(n.row.guits_duusah);
    if (h == null) return null;
    if (h < today && (pct ?? 0) < 100) return tr('Ашиглалтын огноо өнгөрсөн, барилга дуусаагүй');
    if (end != null && h < end) return tr('Ашиглалтын огноо барилга дуусахаас өмнө');
  }
  return null;
}
