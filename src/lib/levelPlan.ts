/**
 * 6 ТҮВШНИЙ ХУВААРЬ (L1–L6) — `docs/Level planning_261021 1.pdf`-ийн бүтцийг ТӨСЛИЙН ТӨЛӨВЛӨГӨӨНИЙ модноос
 * (`projectPlan` · `projectPlanInputs.loadProjectPlan`) угсрах ЦЭВЭР туслахууд + ачаалагч. Харагдац:
 * `src/modules/LevelPlan.tsx`. Тест: `src/lib/levelPlan.check.mjs`.
 *
 *   L1 Мастер хуваарь     — төслийн нийт · үе шат · барилга угсралтын чиглэл; гэрээний дуусах milestone
 *   L2 Үе шат / milestone  — багц бүрийн зураг төсөл · газар · сонгон · зөвшөөрөл · барилга · гэрээ дуусах · ашиглалт
 *   L3 Хяналтын хуваарь    — багц бүрийн зураг төслийн дэд шат + барилга угсралтын дэд үе шат (бөглөх хуудасны Б1…Б5, жинтэй)
 *   L4 Сарын heatmap       — багц × блок, сар бүрт төлөвлөсөн гүйцэтгэл (хуримтлагдсан цувааны өсөлт)
 *   L5 7 хоногийн          — блокийн мөр = L4-ийн сарын хувийг өдөрт тэнцүү хувааж 7 хоногоор; 15 дэд бүлэг шугаман
 *   L6 Өдөр тутмын         — блокийн мөр = сарын хувь ÷ сарын өдрийн тоо; дэд бүлэг шугаман
 */
import {
  saneDate, type PhaseKind, type PlanNode, type PlanTree, type PlanValues,
} from './projectPlan';
import { loadProjectPlan, type ProjectPlan } from './projectPlanInputs';
import { CASHFLOW_NEW, CF_MONTH, bagtsKey, buildingKey, pkgKeyOf, isConstructionNo } from './services';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, computeAll, childIndexes, type Calc, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { planFields } from './planProgress';
import { queryFeatures } from './query';
import { cached, SESSION_TTL_MS } from './live';
import { t as tr } from './i18nCore';

/* ══════════════════ 1. Өдөр · сар ══════════════════ */

export const DAY = 86_400_000;

/** Орон нутгийн хуанлийн өдөр → тэр өдрийн UTC шөнө дунд (ms) — файлын толгой */
export function dayOfLocal(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** UTC сарын дугаар (жил×12 + сар) */
export const monthIdx = (ms: number): number => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** Тухайн (UTC) сарын өдрийн тоо */
export const daysInMonth = (ms: number): number => {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};


/** «2026.10.26» (UTC) — PDF-ийн бичиглэл; огноогүй бол «—» */
export function fmtDay(ms: number | null | undefined): string {
  const v = saneDate(ms);
  if (v == null) return '—';
  return new Date(v).toISOString().slice(0, 10).replace(/-/g, '.');
}

/** «26.10» — сарын баганын толгой */
export const fmtMonth = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear() % 100).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** «10.26» — өдрийн баганын толгой */
export const fmtMD = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** Огнооны хос — хоёулаа зөв, эхлэх ≤ дуусах; эс бөгөөс хоёулаа null (ганц талтай муж хуваарь биш) */
export function cleanSpan(s: number | null | undefined, e: number | null | undefined): [number | null, number | null] {
  const a = saneDate(s), b = saneDate(e);
  return a == null || b == null || b < a ? [null, null] : [a, b];
}

/* ══════════════════ 2. Төлөв ══════════════════ */

/**
 * Зурвасын төлөв:
 *   done   — гүйцэтгэл 100% (✓, ногоон)
 *   late   — дуусах огноо өнгөрсөн атлаа дуусаагүй (улаан — «удирдлагын шийдвэр шаардлагатай»)
 *   behind — төлөвлөгөөт хувиас `BEHIND_PP`-ээс ИХ хоцорсон (улаан)
 *   run    — явж буй · todo — эхлээгүй
 *   none   — огноо алга эсвэл гүйцэтгэл мэдэгдэхгүй (саарал зураас — «мэдээлэл байхгүй», 0 БИШ)
 */
export type BarStatus = 'done' | 'late' | 'behind' | 'run' | 'todo' | 'none';

/** «Хоцорсон» гэх төлөвлөгөө − гүйцэтгэлийн зөрүү (хувийн пункт) */
export const BEHIND_PP = 10;

export function barStatus(
  start: number | null, end: number | null, actual: number | null, planned: number | null, today: number,
  lateOk = true,
): BarStatus {
  if (actual != null && actual >= 100 - 1e-9) return 'done';
  if (start == null || end == null) return 'none';
  if (actual == null) return start > today ? 'todo' : 'none';
  if (lateOk && today > end) return 'late';
  if (planned != null && planned - actual > BEHIND_PP) return 'behind';
  return start > today ? 'todo' : 'run';
}

/**
 * Milestone-ийн төлөв: дууссан ✓ · хугацаа өнгөрсөн (улаан) · удахгүй · огноо АЛГА (улаан — PDF «дутуу») ·
 * гүйцэтгэл мэдэгдэхгүй (`none`, саарал — огноо өнгөрсөн ч «late» гэж ДҮГНЭХГҮЙ).
 */
export type MsStatus = 'done' | 'late' | 'upcoming' | 'missing' | 'none';

/**
 * @param done true/false — дууссан эсэх мэдэгдэж байна; null — гүйцэтгэл мэдэгдэхгүй.
 */
export function milestoneStatus(at: number | null, done: boolean | null, today: number): MsStatus {
  if (done === true) return 'done';
  if (at == null) return 'missing';
  if (today <= at) return 'upcoming';
  return done == null ? 'none' : 'late';
}

/** Дууссан эсэх — гүйцэтгэл мэдэгдэхгүй бол null (`milestoneStatus`) */
const doneOf = (v: number | null | undefined): boolean | null => (v == null ? null : v >= 100 - 1e-9);

/* ══════════════════ 3. Үе шатын огноо ба төлөвлөгөөт хувь ══════════════════ */

type SpanKey = 'contract' | 'land' | 'contractor';
/**
 * `PlanValues`-ийн огнооны хос (`computePlan`-ийн `DF` дараалал): H/I = `geree_*` (гэрээ),
 * J/K = `gazar_*` (газар чөлөөлөлт), L/M = `guits_*` (гүйцэтгэгч).
 */
const SPAN_COLS: Record<SpanKey, [keyof PlanValues, keyof PlanValues]> = {
  contract: ['H', 'I'],
  land: ['J', 'K'],
  contractor: ['L', 'M'],
};
const SPAN_ORDER: Record<PhaseKind, SpanKey[]> = {
  barilga: ['contractor', 'contract', 'land'],
  other: ['contractor', 'contract', 'land'],
  gazar: ['land', 'contract', 'contractor'],
  tezu: ['contract', 'contractor', 'land'],
  zurag: ['contract', 'contractor', 'land'],
  zovshoorol: ['contract', 'contractor', 'land'],
  songon: ['contract', 'contractor', 'land'],
  huleelgeh: ['contract', 'contractor', 'land'],
  zugshruulelt: ['contract', 'contractor', 'land'],
};
/** Хадгалсан мөрийн баганын угтвар (`${col}_ehleh` / `${col}_duusah`) — `projectPlan.spanOf`-ийнх */
const STORED_COL: Record<SpanKey, 'geree' | 'gazar' | 'guits'> = { contract: 'geree', land: 'gazar', contractor: 'guits' };

/** Мөрийн зурвасын огноо (`SPAN_ORDER`) — хос бүтэн байх ёстой; алга бол [null, null] */
export function spanOf(v: PlanValues | undefined, phase: PhaseKind): [number | null, number | null] {
  if (!v) return [null, null];
  for (const k of SPAN_ORDER[phase]) {
    const [a, b] = SPAN_COLS[k];
    const [s, e] = cleanSpan(v[a] as number | null, v[b] as number | null);
    if (s != null && e != null) return [s, e];
  }
  return [null, null];
}

/** Өнөөдрийн төлөвлөгөөт хувь (0–100): барилга/нийт → P (гүйцэтгэгч), газар → O, бусад → N (гэрээ) */
export function plannedOf(v: PlanValues | undefined, phase: PhaseKind): number | null {
  if (!v) return null;
  if (phase === 'barilga' || phase === 'other') return v.P;
  if (phase === 'gazar') return v.O;
  return v.N;
}

/* ══════════════════ 4. Багц ══════════════════ */

/** Мөрийн ӨӨРИЙН багцын түлхүүр (блокийн мөр, олон багцын мөр → '') */
export function ownKey(n: PlanNode): string {
  if (n.blok) return '';
  const b = String(n.row?.bagts ?? '').trim();
  return b ? pkgKeyOf(b) : '';
}
const isPkgKey = (k: string): boolean => /^БАГЦ\d/.test(k);

/** «Барилга угсралт ажил» мөр (Барилга угсралт үе шатын `sub === 'barilga'` хэсэг) */
export function worksNode(tree: PlanTree): PlanNode | null {
  return tree.root.children.find((p) => p.phase === 'barilga')?.children.find((c) => c.sub === 'barilga') ?? null;
}

export type PkgInfo = {
  /** `bagtsKey` («БАГЦ1», «БАГЦ161») */
  key: string;
  /** Барилга угсралт ажлын багцын мөр */
  node: PlanNode;
  /** «Багц-1 — Орон сууцны хороолол барилга угсралт» (өгөгдлийн эх бичиглэл) */
  label: string;
  /** Блокийн мөрүүд (`blok`-той хүүхэд) */
  blocks: PlanNode[];
  /** Чиглэл — «Барилга угсралт ажил»-ын шууд хүүхэд */
  dir: PlanNode | null;
};

/**
 * Барилга угсралт ажлын БАГЦУУД (модны дараалал).
 */
export function packagesOf(tree: PlanTree): PkgInfo[] {
  const works = worksNode(tree);
  if (!works) return [];
  const out: PkgInfo[] = [];
  const seen = new Set<string>();
  const visit = (n: PlanNode, dir: PlanNode | null) => {
    for (const c of n.children) {
      const d = dir ?? c;
      const k = ownKey(c);
      const leafPkg = isPkgKey(k) && c.children.every((x) => { const kx = ownKey(x); return !isPkgKey(kx) || kx === k; });
      if (leafPkg && !seen.has(k)) {
        seen.add(k);
        const raw = String(c.row?.bagts ?? '').trim();
        const name = String(c.row?.ajil_uilchilgee ?? '').trim();
        out.push({
          key: k, node: c, dir: d,
          label: name && name !== raw ? `${raw} — ${name}` : raw,
          blocks: c.children.filter((x) => !!x.blok),
        });
        continue;
      }
      visit(c, d);
    }
  };
  visit(works, null);
  return out;
}

/** Үе шат бүрийн багцын мөрийн индекс — үе шатын модонд тухайн түлхүүртэй ЭХНИЙ (хамгийн дээд) мөр */
export function phaseIndex(tree: PlanTree): Map<PhaseKind, Map<string, PlanNode>> {
  const out = new Map<PhaseKind, Map<string, PlanNode>>();
  for (const top of tree.root.children) {
    const m = out.get(top.phase) ?? new Map<string, PlanNode>();
    const walk = (n: PlanNode) => {
      for (const c of n.children) {
        const k = ownKey(c);
        if (isPkgKey(k) && !m.has(k)) m.set(k, c);
        walk(c);
      }
    };
    walk(top);
    out.set(top.phase, m);
  }
  return out;
}

/* ══════════════════ 5. Сарын · 7 хоногийн · өдрийн цуваа ══════════════════ */

/**
 * Хуримтлагдсан цуваа (0–100) → сар бүрийн ӨСӨЛТ. Эхний сар = өөрийн утга (тэнхлэг төслийн эхлэлээс эхэлдэг тул
 * өмнөх нь 0). Аль нэг тал нь null бол null (мэдэхгүй). Хөвөгч цэгийн ±1e-9 → 0.
 */
export function increments(cum: readonly (number | null)[]): (number | null)[] {
  return cum.map((v, i) => {
    if (v == null) return null;
    const p = i === 0 ? 0 : cum[i - 1];
    if (p == null) return null;
    const d = v - p;
    return Math.abs(d) < 1e-9 ? 0 : d;
  });
}

/**
 * Өдрийн төлөвлөгөөт хувь — тухайн сарын өсөлтийг сарын ӨДРИЙН ТООНД тэнцүү хуваана (PDF L6-ийн тайлбар).
 * `months` — сар бүрийн сүүлийн өдөр (`monthEnds`, дараалсан). Тэнхлэгээс гадуурх өдөр = 0 (төслийн өмнө/дараа ажилгүй).
 */
export function dailyRate(months: readonly number[], inc: readonly (number | null)[]): (day: number) => number | null {
  if (!months.length) return () => null;
  const first = monthIdx(months[0]);
  const last = first + months.length - 1;
  return (day) => {
    const m = monthIdx(day);
    if (m < first || m > last) return 0;
    const v = inc[m - first];
    return v == null ? null : v / daysInMonth(day);
  };
}

/** `from`-оос `days` өдрийн нийлбэр — аль нэг өдөр null бол null (мэдэхгүй хэсэгтэй дүн худал) */
export function sumDays(rate: (day: number) => number | null, from: number, days: number): number | null {
  let s = 0;
  for (let i = 0; i < days; i += 1) {
    const v = rate(from + i * DAY);
    if (v == null) return null;
    s += v;
  }
  return s;
}

/**
 * ДЭД БҮЛГИЙН ШУГАМАН ХУВЬ (0–100) — жин × (хугацааны давхцсан өдөр ÷ нийт өдөр). Хоёр захыг оруулна.
 * Жин эсвэл огноо алга → null; давхцалгүй → 0 (тэр хугацаанд ажилгүй).
 */
export function linearShare(
  weight: number | null, start: number | null, end: number | null, from: number, days: number,
): number | null {
  if (weight == null || start == null || end == null || end < start) return null;
  const dur = Math.round((end - start) / DAY) + 1;
  const lo = Math.max(from, start);
  const hi = Math.min(from + (days - 1) * DAY, end);
  if (hi < lo) return 0;
  const ov = Math.round((hi - lo) / DAY) + 1;
  return (weight * ov) / dur;
}

/** Нийлбэр — аль нэг нь null бол null */
export const sumAll = (xs: readonly (number | null)[]): number | null => {
  let s = 0;
  for (const x of xs) { if (x == null) return null; s += x; }
  return s;
};

/** Баганын хугацаа */
export type Col = { from: number; days: number };

const utcDay = (ms: number): number => Math.floor(ms / DAY) * DAY;

/** Өнөөдрийг агуулсан 7 хоногийн Даваа гарагаас `n` долоо хоног (Да–Ня). `today` — UTC шөнө дунд (`dayOfLocal`) */
export function weekCols(today: number, n = 12): Col[] {
  const t = utcDay(today);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Даваа = 0
  const mon = t - dow * DAY;
  return Array.from({ length: n }, (_, i) => ({ from: mon + i * 7 * DAY, days: 7 }));
}

/** Өнөөдрөөс `n` өдөр. `today` — UTC шөнө дунд (`dayOfLocal`) */
export function dayCols(today: number, n = 14): Col[] {
  const t = utcDay(today);
  return Array.from({ length: n }, (_, i) => ({ from: t + i * DAY, days: 1 }));
}

/* ══════════════════ 6. Гантын тэнхлэг ══════════════════ */

/** Сар-жигд тэнхлэг: `m0` — эхний сар (`monthIdx`), `n` — сарын тоо */
export type Axis = { m0: number; n: number };

/** Огноонуудын мужаас тэнхлэг (хоёр талд `pad` сар). Огноо алга бол null. */
export function axisOf(dates: readonly (number | null | undefined)[], pad = 1): Axis | null {
  let lo = Infinity, hi = -Infinity;
  for (const d of dates) {
    const v = saneDate(d);
    if (v == null) continue;
    const m = monthIdx(v);
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  if (!Number.isFinite(lo)) return null;
  return { m0: lo - pad, n: hi - lo + 1 + 2 * pad };
}

/** Огноо → тэнхлэгийн эхнээс хэдэн САР (бутархай) — сар бүр ижил өргөнтэй */
export function xMonths(ax: Axis, t: number): number {
  const d = new Date(t);
  return monthIdx(t) - ax.m0 + (d.getUTCDate() - 1) / daysInMonth(t);
}

/** Мөрийн хамгийн их утганд харьцуулсан өнгөний хүч (0–1); утгагүй/0 бол 0 */
export function heatLevel(v: number | null, max: number): number {
  if (v == null || !(max > 0) || !(v > 0)) return 0;
  return Math.min(1, v / max);
}

/** Мөрүүдийн утгатай (≠0) баганын муж [lo, hi] — хоосон бол null */
export function activeRange(rows: readonly (readonly (number | null)[])[]): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) r.forEach((v, i) => {
    if (v != null && Math.abs(v) > 1e-9) { if (i < lo) lo = i; if (i > hi) hi = i; }
  });
  return Number.isFinite(lo) ? [lo, hi] : null;
}

/* ══════════════════ 7. Бөглөх хуудасны дэд бүлэг ══════════════════ */

/** Дэд бүлэг (бөглөх хуудасны «Б.»-ийн доорх мөр) нэг блокт */
export type SubGroup = {
  no: string;
  name: string;
  /** «Б.»-д эзлэх жин 0–100 */
  weight: number | null;
  start: number | null;
  end: number | null;
  /** Бодит гүйцэтгэл 0–100 (`computeAll.actAgg`) */
  actual: number | null;
};
export type BlockDetail = {
  /** «Б.»-ийн шууд хүүхдүүд (Б1…Б5) — L3 */
  phases: SubGroup[];
  /** Б1-ийн хүүхдүүд (газар шороо, суурь, …) + Б2…Б5 — L5/L6-ийн 15 дэд бүлэг */
  groups: SubGroup[];
};

const isB1 = (no: unknown): boolean => String(no ?? '').replace(/[.\s]/g, '').toUpperCase() === 'Б1';

/**
 * Нэг хуудасны `b`-р блокийн дэд бүлгүүд (цэвэр). «Б.» мөр алга бол null.
 */
export function blockDetail(rows: readonly SheetRow[], calc: readonly Calc[], b: number): BlockDetail | null {
  const bi = rows.findIndex((r) => isConstructionNo(r.no));
  if (bi < 0) return null;
  const kids = childIndexes(rows as SheetRow[]);
  const base = calc[bi]?.D ?? null;
  const mk = (i: number): SubGroup => {
    const c = calc[i];
    const d = c?.D ?? null;
    const [s, e] = cleanSpan(c?.start[b], c?.end[b]);
    const a = c?.actAgg[b];
    return {
      no: String(rows[i].no ?? '').trim(),
      name: String(rows[i].work ?? '').trim(),
      weight: d == null ? null : base ? (d / base) * 100 : d * 100,
      start: s, end: e,
      actual: a == null || !Number.isFinite(a) ? null : a * 100,
    };
  };
  const phases: SubGroup[] = [];
  const groups: SubGroup[] = [];
  for (const k of kids[bi]) {
    phases.push(mk(k));
    if (isB1(rows[k].no) && kids[k].length) for (const g of kids[k]) groups.push(mk(g));
    else groups.push(mk(k));
  }
  return { phases, groups };
}

/** Хуудасны оролт — `sheetDetails`-ийн */
export type DetailSheet = { group: string; bld: readonly string[]; rows: readonly SheetRow[]; calc: readonly Calc[] };

/**
 * Хуудсуудаас блок бүрийн дэд бүлэг — түлхүүр `buildingKey(group, блок)` (цэвэр).
 */
export function sheetDetails(sheets: readonly DetailSheet[]): Map<string, BlockDetail> {
  const out = new Map<string, BlockDetail>();
  const undated = new Map<string, BlockDetail>();
  const dated = (d: BlockDetail) => [...d.phases, ...d.groups].some((g) => g.start != null && g.end != null);
  for (const sh of sheets) {
    sh.bld.forEach((label, b) => {
      const k = buildingKey(sh.group, label);
      if (out.has(k)) return;
      const d = blockDetail(sh.rows, sh.calc, b);
      if (!d) return;
      if (dated(d)) out.set(k, d);
      else if (!undated.has(k)) undated.set(k, d);
    });
  }
  for (const [k, d] of undated) if (!out.has(k)) out.set(k, d);
  return out;
}

/**
 * Багцын дэд үе шат (L3) — блокуудынхыг НЭГТГЭНЭ (цэвэр): жин = дундаж, эхлэх = MIN, дуусах = MAX,
 * гүйцэтгэл = утгатай блокуудын ЭНГИЙН дундаж (блок бүр нэг барилга). Нэрээр (№ + нэр) тааруулна.
 */
export function mergePhases(list: readonly (readonly SubGroup[])[]): SubGroup[] {
  type Acc = { g: SubGroup; w: number[]; a: number[]; s: number | null; e: number | null };
  const acc = new Map<string, Acc>();
  for (const gs of list) for (const g of gs) {
    const k = `${g.no}|${g.name}`;
    const x = acc.get(k) ?? { g, w: [], a: [], s: null, e: null };
    if (g.weight != null) x.w.push(g.weight);
    if (g.actual != null) x.a.push(g.actual);
    if (g.start != null && (x.s == null || g.start < x.s)) x.s = g.start;
    if (g.end != null && (x.e == null || g.end > x.e)) x.e = g.end;
    acc.set(k, x);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null);
  return [...acc.values()].map((x) => ({
    no: x.g.no, name: x.g.name, weight: avg(x.w), start: x.s, end: x.e, actual: avg(x.a),
  }));
}

/** Блокийн түлхүүр — Excel-ийн «Багц-4.2» + «6/1» → «БАГЦ42|6/1» (`projectPlanInputs.blockKeyOf`-тэй ижил) */
export const blockKeyFor = (pkg: string | null | undefined, blok: string): string => buildingKey(pkg ?? '', blok);

/* ══════════════════ 8. Мөрийн загварууд ══════════════════ */

/** Гантын мөр */
export type GRow =
  | { t: 'section'; id: string; name: string; depth: number }
  | {
    t: 'bar'; id: string; name: string; depth: number;
    start: number | null; end: number | null;
    actual: number | null; planned: number | null; status: BarStatus;
    /** Жин (0–100) — нэрийн ард «(77.5%)» */
    w?: number | null;
    strong?: boolean;
    /** Огноо нь өвөг мөрийнх (өөрийн хуваарьгүй) */
    inh?: boolean;
    /** Огноо нь үе шатын ҮНДСЭН баганых биш (гэрээ/газар/гүйцэтгэгчийн өөр хос) — төлөвлөгөөт хувийн суурь биш */
    alt?: boolean;
  }
  | { t: 'ms'; id: string; name: string; depth: number; at: number | null; status: MsStatus }
  | { t: 'note'; id: string; name: string; depth: number };

/** Гантын мөрүүдийн тэнхлэг */
export function ganttAxis(rows: readonly GRow[], today: number): Axis | null {
  const ds: (number | null)[] = [today];
  for (const r of rows) {
    if (r.t === 'bar') ds.push(r.start, r.end);
    else if (r.t === 'ms') ds.push(r.at);
  }
  return axisOf(ds, 1);
}

/** Milestone-ийн огноо — `dd_kod`-оор */
export type Mark = {
  /** `songon_ognoo` */
  tender: number | null;
  /** `ashiglalt_ognoo` */
  handover: number | null;
  /** `zahiramj_ognoo` (L2 «Захирамж») */
  order?: number | null;
  /** `zahiramj_dugaar` («А/736») */
  orderNo?: string | null;
};
export type Marks = ReadonlyMap<string, Mark>;

const nameOf = (n: PlanNode): string => String(n.row?.ajil_uilchilgee ?? '').trim();

function barRow(
  res: ProjectPlan['result'], n: PlanNode, id: string, name: string, depth: number, today: number,
  opts: { strong?: boolean; phase?: PhaseKind } = {},
): GRow {
  const v = res.values.get(n);
  const phase = opts.phase ?? n.phase;
  const key = SPAN_ORDER[phase][0];
  const [ca, cb] = SPAN_COLS[key];
  let [s, e] = cleanSpan(v?.[ca] as number | null | undefined, v?.[cb] as number | null | undefined);
  let inh = false, alt = false;
  if (s == null) {
    const col = STORED_COL[key];
    for (let x = n.parent; x && x.row; x = x.parent) {
      [s, e] = cleanSpan(x.row[`${col}_ehleh`], x.row[`${col}_duusah`]);
      if (s != null) { inh = true; break; }
    }
  }
  if (s == null) {
    [s, e] = spanOf(v, phase);
    alt = s != null;
  }
  const actual = v?.S ?? null;
  const planned = plannedOf(v, phase);
  return {
    t: 'bar', id, name, depth, start: s, end: e, actual, planned,
    status: barStatus(s, e, actual, planned, today, !alt), strong: opts.strong, inh, alt,
  };
}

/**
 * L1 — МАСТЕР: төслийн нийт (+ гэрээний дуусах), үе шат бүр, барилга угсралтын чиглэл бүр (+ гэрээний дуусах).
 * Багцгүй бүлэг чиглэлийн (Инженерийн дэд бүтэц) дэд бүлгүүд нэг түвшин доош.
 */
export function buildL1(plan: ProjectPlan, today: number): GRow[] {
  const { tree, result: res } = plan;
  const rows: GRow[] = [];
  const rv = res.values.get(tree.root);
  rows.push(barRow(res, tree.root, 'L1.1', tr('Төслийн нийт'), 0, today, { strong: true, phase: 'other' }));
  rows.push({ t: 'ms', id: 'L1.1.1', name: tr('Гэрээний дуусах огноо'), depth: 1, at: rv?.I ?? null, status: milestoneStatus(rv?.I ?? null, doneOf(rv?.S), today) });
  rows.push({ t: 'section', id: 'L1.2', name: tr('Үе шат'), depth: 0 });
  tree.root.children.forEach((p, i) => rows.push(barRow(res, p, `L1.2.${i + 1}`, nameOf(p), 1, today)));
  const works = worksNode(tree);
  if (works) {
    rows.push({ t: 'section', id: 'L1.3', name: tr('Барилга угсралтын чиглэл'), depth: 0 });
    works.children.forEach((d, i) => {
      const id = `L1.3.${i + 1}`;
      const v = res.values.get(d);
      rows.push(barRow(res, d, id, nameOf(d), 1, today, { strong: true }));
      rows.push({ t: 'ms', id: `${id}.0`, name: tr('Гэрээний дуусах огноо'), depth: 2, at: v?.I ?? null, status: milestoneStatus(v?.I ?? null, doneOf(v?.S), today) });
      if (!isPkgKey(ownKey(d))) {
        d.children
          .filter((c) => c.children.length && !isPkgKey(ownKey(c)))
          .forEach((c, j) => rows.push(barRow(res, c, `${id}.${j + 1}`, nameOf(c), 2, today)));
      }
    });
  }
  return rows;
}

/**
 * L2 — ҮЕ ШАТ / MILESTONE: төслийн ерөнхий (ТЭЗҮ · хүлээлгэн өгөх · зүгшрүүлэлт) + багц бүрийн 8 мөр
 * (захирамж · зураг төсөл · газар · сонгон · зөвшөөрөл · барилга · гэрээ дуусах · ашиглалт).
 */
export function buildL2(plan: ProjectPlan, pkgs: readonly PkgInfo[], marks: Marks | null, today: number): GRow[] {
  const { tree, result: res } = plan;
  const rows: GRow[] = [];
  const idx = phaseIndex(tree);
  rows.push({ t: 'section', id: 'L2.1', name: tr('Төслийн ерөнхий'), depth: 0 });
  let i = 0;
  for (const p of tree.root.children) {
    if (p.phase === 'tezu') rows.push(barRow(res, p, `L2.1.${++i}`, nameOf(p), 1, today));
    else if (p.phase === 'huleelgeh' || p.phase === 'zugshruulelt') {
      for (const c of p.children) rows.push(barRow(res, c, `L2.1.${++i}`, nameOf(c), 1, today));
    }
  }
  pkgs.forEach((pk, j) => {
    const id = `L2.${j + 2}`;
    rows.push({ t: 'section', id, name: pk.label, depth: 0 });
    let k = 0;
    const next = () => `${id}.${++k}`;
    const son = idx.get('songon')?.get(pk.key);
    const mk = (n: PlanNode | undefined) => (n ? marks?.get(n.code) : undefined);
    const ord = [mk(pk.node), mk(son)].find((m) => m?.order != null) ?? mk(pk.node) ?? mk(son);
    const ordAt = ord?.order ?? null;
    const ordNo = String(ord?.orderNo ?? '').trim();
    rows.push({
      t: 'ms', id: next(), name: ordNo ? `${tr('Захирамж')} ${ordNo}` : tr('Захирамж'), depth: 1, at: ordAt,
      status: marks == null && ordAt == null ? 'none' : milestoneStatus(ordAt, ordAt != null && ordAt <= today, today),
    });
    const zur = idx.get('zurag')?.get(pk.key);
    if (zur) rows.push(barRow(res, zur, next(), tr('Зураг төсөл'), 1, today));
    const gaz = idx.get('gazar')?.get(pk.key);
    if (gaz) rows.push(barRow(res, gaz, next(), tr('Газар чөлөөлөлт'), 1, today));
    if (son) {
      const v = res.values.get(son);
      const at = mk(son)?.tender ?? mk(pk.node)?.tender ?? v?.I ?? null;
      rows.push({
        t: 'ms', id: next(), name: tr('Сонгон шалгаруулалт (гэрээ байгуулсан)'), depth: 1, at,
        status: marks == null && at == null ? 'none' : milestoneStatus(at, doneOf(v?.S), today),
      });
    }
    const zov = idx.get('zovshoorol')?.get(pk.key);
    if (zov) {
      const v = res.values.get(zov);
      const at = v?.I ?? null;
      rows.push({ t: 'ms', id: next(), name: tr('Зөвшөөрөл (барилга эхлэх)'), depth: 1, at, status: milestoneStatus(at, doneOf(v?.S), today) });
    }
    const cv = res.values.get(pk.node);
    const built = doneOf(cv?.S);
    rows.push(barRow(res, pk.node, next(), tr('Барилга ажил'), 1, today, { strong: true }));
    rows.push({ t: 'ms', id: next(), name: tr('Гэрээний дуусах огноо'), depth: 1, at: cv?.I ?? null, status: milestoneStatus(cv?.I ?? null, built, today) });
    const ho = mk(pk.node)?.handover ?? null;
    rows.push({
      t: 'ms', id: next(), name: tr('Ашиглалтад оруулах'), depth: 1, at: ho,
      status: marks == null && ho == null ? 'none' : milestoneStatus(ho, built, today),
    });
  });
  return rows;
}

/**
 * L3 — ХЯНАЛТЫН ХУВААРЬ: багц бүрд «Зураг төсөл» (дэд шатууд) ба «Барилга угсралт» (нийт + бөглөх хуудасны
 * Б1…Б5, жинтэй). `detail` = null → хуудас ачаалагдаж байна/унасан (дэд үе шатгүйгээр).
 */
export function buildL3(
  plan: ProjectPlan, pkgs: readonly PkgInfo[], detail: ReadonlyMap<string, BlockDetail> | null, today: number,
): GRow[] {
  const { tree, result: res } = plan;
  const idx = phaseIndex(tree);
  const rows: GRow[] = [];
  pkgs.forEach((pk, j) => {
    const id = `L3.${j + 1}`;
    rows.push({ t: 'section', id, name: pk.label, depth: 0 });
    const zur = idx.get('zurag')?.get(pk.key);
    rows.push({ t: 'section', id: `${id}.1`, name: tr('Зураг төсөл'), depth: 1 });
    if (!zur) rows.push({ t: 'note', id: `${id}.1.0`, name: tr('Зураг төслийн мөр алга'), depth: 2 });
    else if (!zur.children.length) rows.push(barRow(res, zur, `${id}.1.1`, tr('Зураг төсөл'), 2, today));
    else zur.children.forEach((c, k) => rows.push(barRow(res, c, `${id}.1.${k + 1}`, nameOf(c), 2, today)));
    rows.push({ t: 'section', id: `${id}.2`, name: tr('Барилга угсралт'), depth: 1 });
    rows.push(barRow(res, pk.node, `${id}.2.1`, tr('Барилга угсралт — нийт'), 2, today, { strong: true }));
    if (detail && pk.blocks.length) {
      const list = pk.blocks
        .map((b) => detail.get(blockKeyFor(b.pkg, b.blok!))?.phases)
        .filter((x): x is SubGroup[] => !!x);
      if (!list.length) rows.push({ t: 'note', id: `${id}.2.0`, name: tr('Бөглөх хуудасны дэд үе шат олдсонгүй'), depth: 2 });
      mergePhases(list).forEach((g, k) => rows.push({
        t: 'bar', id: `${id}.2.${k + 2}`, name: g.name || g.no, depth: 2, w: g.weight,
        start: g.start, end: g.end, actual: g.actual, planned: null,
        status: barStatus(g.start, g.end, g.actual, null, today),
      }));
    }
  });
  return rows;
}

/** Хүснэгтийн (heatmap) мөр */
export type HRow = {
  id: string;
  name: string;
  kind: 'total' | 'cum' | 'block' | 'group';
  /** Жин 0–100 */
  w: number | null;
  start: number | null;
  end: number | null;
  /** Бодит гүйцэтгэл 0–100 */
  actual: number | null;
  cells: (number | null)[];
  /** Харагдах багануудын нийлбэр (L5/L6) */
  sum?: number | null;
};
export type HSection = { pkg: PkgInfo; rows: HRow[] };

const hRowOf = (res: ProjectPlan['result'], n: PlanNode, id: string, name: string, kind: HRow['kind'], cells: (number | null)[]): HRow => {
  const v = res.values.get(n);
  const [s, e] = spanOf(v, 'barilga');
  return { id, name, kind, w: kind === 'block' ? v?.F ?? null : null, start: s, end: e, actual: v?.S ?? null, cells };
};

/**
 * L4 — САРЫН HEATMAP: багц бүрд «Багцын нийт» (сар бүрийн өсөлт), «Өсөх дүн» (хуримтлагдсан), блок бүр.
 * Багана = `plan.months` (бүтэн тэнхлэг) — харагдац `activeRange`-аар тайрна.
 */
export function buildL4(plan: ProjectPlan, pkgs: readonly PkgInfo[]): HSection[] {
  const { result: res, monthly, months } = plan;
  const empty = months.map(() => null);
  return pkgs.map((pk, j) => {
    const id = `L4.${j + 1}`;
    const cum = monthly.get(pk.node) ?? empty;
    const rows: HRow[] = [
      hRowOf(res, pk.node, `${id}.0`, tr('Багцын нийт'), 'total', increments(cum)),
      { ...hRowOf(res, pk.node, `${id}.c`, tr('Өсөх дүн'), 'cum', [...cum]), actual: null, start: null, end: null },
      ...pk.blocks.map((b, k) => hRowOf(res, b, `${id}.${k + 1}`, b.blok!, 'block', increments(monthly.get(b) ?? empty))),
    ];
    return { pkg: pk, rows };
  });
}

/**
 * L5/L6 — LOOK-AHEAD: багцын нийт · блок (сарын хувь өдөрт жигд) · дэд бүлэг (шугаман) — `cols` баганаар.
 * `detail` = null → дэд бүлэггүй (хуудас ачаалагдаж байна/унасан).
 */
export function buildLook(
  plan: ProjectPlan, pkgs: readonly PkgInfo[], detail: ReadonlyMap<string, BlockDetail> | null,
  cols: readonly Col[], withGroups = true,
): HSection[] {
  const { result: res, monthly, months } = plan;
  const empty = months.map(() => null);
  const seriesCells = (n: PlanNode) => {
    const rate = dailyRate(months, increments(monthly.get(n) ?? empty));
    return cols.map((c) => sumDays(rate, c.from, c.days));
  };
  return pkgs.map((pk, j) => {
    const id = `L${cols[0]?.days === 1 ? 6 : 5}.${j + 1}`;
    const tot = hRowOf(res, pk.node, `${id}.0`, tr('Багцын нийт'), 'total', seriesCells(pk.node));
    const rows: HRow[] = [{ ...tot, sum: sumAll(tot.cells) }];
    pk.blocks.forEach((b, k) => {
      const br = hRowOf(res, b, `${id}.${k + 1}`, b.blok!, 'block', seriesCells(b));
      rows.push({ ...br, sum: sumAll(br.cells) });
      if (!withGroups || !detail) return;
      const d = detail.get(blockKeyFor(b.pkg, b.blok!));
      d?.groups.forEach((g, gi) => {
        const cells = cols.map((c) => linearShare(g.weight, g.start, g.end, c.from, c.days));
        rows.push({
          id: `${id}.${k + 1}.${gi + 1}`, name: g.name || g.no, kind: 'group', w: g.weight,
          start: g.start, end: g.end, actual: g.actual, cells, sum: sumAll(cells),
        });
      });
    });
    return { pkg: pk, rows };
  });
}

/* ══════════════════ 9. Ачаалагч ══════════════════ */

const F = CASHFLOW_NEW.fields;

/** Date (epoch ms) эсвэл DateOnly («2025-09-25») → UTC шөнө дунд; бусад → null */
export function dateIn(v: unknown): number | null {
  if (typeof v === 'number') return saneDate(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? saneDate(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
const attr = (a: Record<string, unknown>, name: string): unknown => {
  if (name in a) return a[name];
  const lo = name.toLowerCase();
  for (const k of Object.keys(a)) if (k.toLowerCase() === lo) return a[k];
  return undefined;
};

/**
 * Milestone-ийн огноо — `songon_ognoo` · `ashiglalt_ognoo` (импортын шинэ талбар) ба захирамж (`zahiramj_ognoo` ·
 * `zahiramj_dugaar` — мөнгөний мөрд импорт ХАДГАЛДАГ). `loadProjectPlan` эдгээрийг уншдаггүй тул тусад нь НЭГ
 * асуулгаар (зөвхөн утгатай мөр).
 */
async function fetchMarks(): Promise<Map<string, Mark>> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: `${F.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL AND (${F.tenderDate} IS NOT NULL OR ${F.handoverDate} IS NOT NULL`
      + ` OR ${F.orderDate} IS NOT NULL OR ${F.orderNo} IS NOT NULL)`,
    outFields: [F.ddKod, F.tenderDate, F.handoverDate, F.orderDate, F.orderNo],
  });
  const out = new Map<string, Mark>();
  for (const r of rows) {
    const a = r as Record<string, unknown>;
    const k = String(attr(a, F.ddKod) ?? '').trim();
    if (!k || out.has(k)) continue;
    const no = String(attr(a, F.orderNo) ?? '').trim();
    out.set(k, {
      tender: dateIn(attr(a, F.tenderDate)), handover: dateIn(attr(a, F.handoverDate)),
      order: dateIn(attr(a, F.orderDate)), orderNo: no || null,
    });
  }
  return out;
}
const loadMarks = cached(fetchMarks, SESSION_TTL_MS, ['CASHFLOW_NEW']);

export type LevelData = {
  plan: ProjectPlan;
  /** null = milestone-ийн огноо уншигдсангүй (`failed`-д) */
  marks: Marks | null;
  /** Ачаалсан агшин (ms) — «өнөөдөр» (render дотор `Date.now()` цэвэр бус) */
  at: number;
  failed: string[];
};

/** Харагдацын үндсэн өгөгдөл — төслийн төлөвлөгөө + milestone огноо */
export async function loadLevelData(): Promise<LevelData> {
  const at = Date.now();
  const plan = await loadProjectPlan(dayOfLocal(at));
  if (plan.empty) return { plan, marks: null, at, failed: plan.failed };
  let marks: Marks | null = null;
  const failed = [...plan.failed];
  try { marks = await loadMarks(); } catch (e) {
    failed.push('milestones');
    console.warn('[selbe] 6 түвшний хуваарь: milestone огноо уншигдсангүй', e);
  }
  return { plan, marks, at, failed };
}

/**
 * Унасан эхийн ДОТООД КОД → хүнд ойлгогдох нэр (анхааруулгын мөрөнд).
 */
const FAIL_TEXT: Record<string, () => string> = {
  milestones: () => tr('Чухал үе шатын огноо'),
  actual: () => tr('Гүйцэтгэл'),
  blockProgress: () => tr('Блокийн гүйцэтгэл'),
  blockUniverse: () => tr('Блокийн жагсаалт'),
  infraProgress: () => tr('Дэд бүтцийн гүйцэтгэл'),
  schedule: () => tr('Хуваарь'),
  land: () => tr('Газар чөлөөлөлт'),
  parcels: () => tr('Нэгж талбар'),
  footprints: () => tr('Барилгын ул мөр'),
};
const pkgLabel = (k: string): string => PKGS.find((p) => p.key === k)?.label ?? k;
export function failLabel(code: string): string {
  const i = code.indexOf(':');
  if (i < 0) return FAIL_TEXT[code]?.() ?? code;
  const kind = code.slice(0, i);
  const k = code.slice(i + 1);
  if (kind === 'sheet') return tr('{0} бөглөх хуудас', pkgLabel(k));
  if (kind === 'schedule') return tr('{0} хуваарь', pkgLabel(k));
  if (kind === 'land') return tr('{0} газар чөлөөлөлт', k);
  return code;
}

export type SheetDetail = {
  blocks: Map<string, BlockDetail>;
  /** Уншигдаагүй хуудсууд (`sheet:b1_9f`) — тэр багцын блокууд дэд бүлэггүй */
  failed: string[];
};

/**
 * Бөглөх хуудсуудын дэд бүлэг (L3 · L5 · L6) — L1/L2/L4 нээхэд ТАТАХГҮЙ (харагдац тэр табыг нээхэд л дуудна).
 */
async function fetchSheetDetail(): Promise<SheetDetail> {
  const today = Date.now();
  const failed: string[] = [];
  const got = await Promise.all(PKGS.map(async (pkg, order) => {
    try {
      const sc = await loadSchema(pkg);
      if (!sc.bld.length) return null;
      const fields = [...new Set([...planFields(sc), ...sc.act, ...sc.obyem].filter((x): x is string => !!x))];
      const r = await loadRows(pkg, sc, undefined, fields, { persist: true });
      const calc = computeAll(r.rows, sc.bld.length, today, {}, {}, sc.obyem.map((f) => !!f));
      return { group: pkg.group, bld: sc.bld, rows: r.rows, calc, order };
    } catch (e) {
      failed.push(pkg.key);
      console.warn(`[selbe] 6 түвшний хуваарь: ${pkg.key} бөглөх хуудас уншигдсангүй`, e);
      return null;
    }
  }));
  const bad = new Set(PKGS.filter((p) => failed.includes(p.key)).map((p) => bagtsKey(p.group)));
  const ok = got
    .filter((x): x is NonNullable<typeof x> => !!x && !bad.has(bagtsKey(x.group)))
    .sort((a, b) => a.order - b.order);
  return { blocks: sheetDetails(ok), failed: failed.map((k) => `sheet:${k}`) };
}
export const loadSheetDetail = cached(fetchSheetDetail, SESSION_TTL_MS, ['BAGTS_SHEET'], (v) => !v.failed.length);
