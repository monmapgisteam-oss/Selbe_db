/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ЗАСАХ · НИЙТЛЭХ (2026-10-15).
 *
 * ⚠️ Хэрэглэгч: «Cashflow шиг засах болон нийтлэх гэсэн хэсэг нэм, тэгээд тоог өөрчлөхөд томьёоны дагуу
 *    тооцоолол гарна». Урсгал нь Санхүүжилтийнхтэй ИЖИЛ: «Засах» → нүд засна (НОГООН) → томьёогоор шууд дахин
 *    бодогдоно → «Нийтлэх (n)» дарахад л `Negtgel_guitsetgel_1013` руу НЭГ `applyEdits`-ээр бичигдэнэ.
 *
 * ── АЛЬ НҮД ЗАСАГДАХ ВЭ — Excel-ийн ОРОЛТ (томьёогүй) нүд л ──
 *    Хүснэгтэд томьёо хадгалагддаггүй тул ХАДГАЛСАН утгаас нь танина (`negForm`):
 *      · E Төсөв      — эцэг = Σ хүүхэд таарвал томьёо; навч ба таараагүй эцэг — оролт.
 *      · F Хэсэгт эзлэх — = E ÷ E(эцэг) таарвал томьёо; бусад нь (жиш. 5.2 = 95%, 2.1 = 0.666) — оролт.
 *      · G Төсөлд эзлэх — = F × G(эцэг) таарвал томьёо (Excel: E × G(5.2) ÷ E(5.2) — ижил); үе шатных — оролт.
 *      · N…R, S       — эцэг = Σ F(хүүхэд) × хүүхэд таарвал томьёо; навч ба таараагүй эцэг — оролт.
 *      · T…W биелэлт   — үргэлж томьёо (S ÷ N · O · P · R; хуваагч 0 бол 0) — засагдахгүй.
 *    ⚠️ Таараагүй эцэг (Excel-ийн мужийн алдаа 879 · 842, гараар бичсэн утга) нь ОРОЛТ хэвээр — «засахгүй»,
 *       Excel-д ч тэр нүд томьёогоор бодогддоггүй.
 *    ⚠️ Системийн гүйцэтгэлтэй мөрийн S (`negtgelAuto.liveAct` · барилгын задаргаа) засагдахгүй — дэлгэц
 *       системийн утгыг харуулдаг тул гараар бичсэн тоо харагдахгүй үлдэнэ (UI `auto`-гаар хаана).
 *
 * ── ДАХИН БОДОХ ДАРААЛАЛ (`applyNegEdits`) ── E (доороос дээш) → F → G (дээрээс доош) → N…S (доороос дээш)
 *    → T…W (утга нь өөрчлөгдсөн мөрд). Нэг навчны төсөв өөрчлөгдөхөд өвөг бүрийн E, тэдгээрийн бүх ахан дүүсийн
 *    F, түүнээс доошх G, жигнэсэн нийлбэрүүд бүгд дагаж өөрчлөгдөнө — Excel-тэй ижил.
 *
 * ── ХҮСНЭГТ = EXCEL-ИЙН ЗАГВАР ── Нийтлэхэд системийн давхаргагүй (`computeNegAuto`-гүй) загварыг бичнэ —
 *    системийн утга нь дэлгэцэд ДАРААГИЙН давхарга хэвээр. Тиймээс хүснэгт үргэлж «Excel» хэвээр үлдэнэ.
 */
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { TUSUL_NEGTGEL } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { currentUser } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';
import { loadNegRaw, treeOf, type NegRaw } from '@/lib/negtgelAuto';

const F = TUSUL_NEGTGEL.fields;
const SCALE = TUSUL_NEGTGEL.scale;

/** Засагдах утгууд — хувь нь 0–1, төсөв нь ₮ */
export type NegEditKey = 'budget' | 'w' | 'p' | 'planG' | 'planGch' | 'planGu' | 'planNw' | 'planPw' | 'act';
const ROLL_KEYS = ['planG', 'planGch', 'planGu', 'planNw', 'planPw', 'act'] as const;
type RollKey = (typeof ROLL_KEYS)[number];
const PERF: Array<{ perf: 'perfG' | 'perfGch' | 'perfGu' | 'perfWk'; plan: RollKey }> = [
  { perf: 'perfG', plan: 'planG' },
  { perf: 'perfGch', plan: 'planGch' },
  { perf: 'perfGu', plan: 'planGu' },
  /* ⚠️ Excel W = S ÷ R (өмнөх долоо хоног) */
  { perf: 'perfWk', plan: 'planPw' },
];

/** OID → засварласан утгууд (`null` = нүдийг хоослох) */
export type NegEdits = ReadonlyMap<number, Partial<Record<NegEditKey, number | null>>>;

/** Хадгалсан утгаас таньсан томьёо (`negForm`) */
export type NegForm = {
  parent: number[];
  kids: number[][];
  /** E = Σ хүүхэд — `all` (бүх хүүхэд) · `in` («нийлбэрт орохгүй»-г хассан) · `null` (оролт) */
  eSum: Array<'all' | 'in' | null>;
  /** F = E ÷ E(эцэг) */
  fRatio: boolean[];
  /** G = F × G(эцэг) */
  gChain: boolean[];
  /**
   * N…R, S = Σ F(хүүхэд) × хүүхэд — `in` («нийлбэрт орохгүй» мөрийг хассан) · `all` (бүх хүүхэд) · `null` (оролт).
   * ⚠️ Багана бүрийн муж ӨӨР: «2 Ажлын зураг төсөл»-ийн S нь «2.4 Нийслэл төсөв»-ийг ОРУУЛДАГ, N нь хасдаг
   *    (амьдаар 2026-10-15) — тиймээс мөр · багана бүрд тусад нь танина.
   */
  roll: Record<RollKey, Array<'in' | 'all' | null>>;
};

/** Хувийн (0–1) зөрүүний босго — хүснэгтийн 0–100-д 1e-5 */
const TOL = 1e-7;
/** Томьёо танихад — Excel-ийн бүтэн нарийвчлалтай хадгалсан утга */
const FTOL = 1e-6;
const near = (a: number | null | undefined, b: number | null | undefined, tol: number): boolean =>
  a != null && b != null && Math.abs(a - b) <= tol;

/**
 * ТОМЬЁО ТАНИХ — ХАДГАЛСАН (засвараас өмнөх) мөрөөс. Цэвэр функц (тест: `negtgelEdit.check.mjs`).
 * ⚠️ Засвар орсон загвараас БИШ — эс бөгөөс засварласан эцэг «таарахаа больж» оролт болно.
 */
export function negForm(rows: readonly NegRaw[]): NegForm {
  const { parent, kids } = treeOf(rows.map((r) => r.depth));
  const inn = (i: number) => kids[i].filter((k) => !rows[k].outside);
  const eSum = rows.map((r, i): 'all' | 'in' | null => {
    if (!kids[i].length || r.budget == null) return null;
    if (!kids[i].some((k) => rows[k].budget != null)) return null;
    const sum = (ks: number[]) => ks.reduce((a, k) => a + (rows[k].budget ?? 0), 0);
    const tol = Math.max(1, Math.abs(r.budget) * 1e-9);
    if (Math.abs(sum(kids[i]) - r.budget) <= tol) return 'all';
    const ks = inn(i);
    return ks.length !== kids[i].length && Math.abs(sum(ks) - r.budget) <= tol ? 'in' : null;
  });
  const fRatio = rows.map((r, i) => {
    const pp = parent[i];
    if (pp < 0 || r.budget == null) return false;
    const pe = rows[pp].budget;
    return pe != null && pe > 0 && near(r.w, r.budget / pe, FTOL);
  });
  const gChain = rows.map((r, i) => {
    const pp = parent[i];
    if (pp < 0 || r.w == null) return false;
    const pg = rows[pp].p;
    return pg != null && near(r.p, r.w * pg, FTOL);
  });
  const roll = {} as Record<RollKey, Array<'in' | 'all' | null>>;
  for (const key of ROLL_KEYS) {
    roll[key] = rows.map((r, i): 'in' | 'all' | null => {
      if (!kids[i].length || r[key] == null || !kids[i].some((k) => rows[k][key] != null)) return null;
      const sum = (ks: number[]) => ks.reduce((a, k) => a + (rows[k].w ?? 0) * (rows[k][key] ?? 0), 0);
      const ks = inn(i);
      if (ks.length && near(r[key], sum(ks), FTOL)) return 'in';
      return ks.length !== kids[i].length && near(r[key], sum(kids[i]), FTOL) ? 'all' : null;
    });
  }
  return { parent, kids, eSum, fRatio, gChain, roll };
}

/**
 * Нүд ЗАСАГДАХ эсэх — Excel-ийн оролт мөн бол.
 * @param live мөрийн гүйцэтгэл системээс ирдэг (`NegCalcRow.auto`) — S-ийг хаана
 */
export function negEditable(rows: readonly NegRaw[], form: NegForm, i: number, key: NegEditKey, live = false): boolean {
  const leaf = form.kids[i].length === 0;
  switch (key) {
    case 'budget': return leaf || form.eSum[i] == null;
    case 'w': return rows[i].depth >= 2 && !form.fRatio[i];
    case 'p': return !form.gChain[i];
    case 'act': return !live && (leaf || !form.roll.act[i]);
    default: return leaf || !form.roll[key][i];
  }
}

const perfOf = (act: number | null, plan: number | null): number | null =>
  (plan == null || act == null ? null : plan ? act / plan : 0);

/** Хоёр утга ЯЛГААТАЙ эсэх — хувь 0–1 (`TOL`), төсөв ₮ (0.5) */
export function negDiffers(a: number | null | undefined, b: number | null | undefined, budget = false): boolean {
  if (a == null || b == null) return (a == null) !== (b == null);
  return Math.abs(a - b) > (budget ? 0.5 : TOL);
}

/**
 * ЗАСВАРЫГ ТОМЬЁОГООР ДАХИН БОДНО — цэвэр функц. Буцаах нь ШИНЭ мөрүүд (оролт хөндөгдөхгүй).
 * ⚠️ Засварласан нүд нь томьёотой бол (UI хаадаг ч) томьёо ДАРНА — нэг эх.
 */
export function applyNegEdits(rows: readonly NegRaw[], form: NegForm, edits: NegEdits): NegRaw[] {
  const m: NegRaw[] = rows.map((r) => ({ ...r }));
  const n = m.length;
  if (edits.size) {
    const at = new Map(m.map((r, i) => [r.oid, i]));
    for (const [oid, e] of edits) {
      const i = at.get(oid);
      if (i == null) continue;
      for (const [k, v] of Object.entries(e) as Array<[NegEditKey, number | null]>) m[i][k] = v;
    }
  }
  const { parent, kids } = form;
  const inn = (i: number) => kids[i].filter((k) => !m[k].outside);
  /* E — доороос дээш (хүүхэд эцгийнхээ ДАРАА байрладаг outline) */
  for (let i = n - 1; i >= 0; i -= 1) {
    const mode = form.eSum[i];
    if (!mode) continue;
    const ks = mode === 'all' ? kids[i] : inn(i);
    if (!ks.some((k) => m[k].budget != null)) continue;
    m[i].budget = ks.reduce((a, k) => a + (m[k].budget ?? 0), 0);
  }
  /* F = E ÷ E(эцэг) */
  for (let i = 0; i < n; i += 1) {
    if (!form.fRatio[i]) continue;
    const pe = m[parent[i]].budget;
    const e = m[i].budget;
    if (pe != null && pe > 0 && e != null) m[i].w = e / pe;
  }
  /* G = F × G(эцэг) — дээрээс доош */
  for (let i = 0; i < n; i += 1) {
    if (!form.gChain[i]) continue;
    const pg = m[parent[i]].p;
    const w = m[i].w;
    if (pg != null && w != null) m[i].p = w * pg;
  }
  /* N…R, S = Σ F × хүүхэд — доороос дээш. ⚠️ Хоосон хүүхэд 0 (Excel-ийн SUMPRODUCT) */
  for (const key of ROLL_KEYS) {
    const on = form.roll[key];
    for (let i = n - 1; i >= 0; i -= 1) {
      const mode = on[i];
      if (!mode) continue;
      const ks = mode === 'all' ? kids[i] : inn(i);
      if (!ks.some((k) => m[k][key] != null)) continue;
      m[i][key] = ks.reduce((a, k) => a + (m[k].w ?? 0) * (m[k][key] ?? 0), 0);
    }
  }
  /* T…W — гүйцэтгэл эсвэл тэр төлөвлөгөө нь өөрчлөгдсөн мөрд л (бусад нь Excel-ийн утга хэвээр) */
  for (let i = 0; i < n; i += 1) {
    const actCh = negDiffers(m[i].act, rows[i].act);
    for (const { perf, plan } of PERF) {
      if (actCh || negDiffers(m[i][plan], rows[i][plan])) m[i][perf] = perfOf(m[i].act, m[i][plan]);
    }
  }
  return m;
}

/** Хүснэгтэд бичигдэх талбар ба масштаб — хувь ×100, төсөв ₮ */
const OUT: Array<{ key: keyof NegRaw; field: string; budget?: true }> = [
  { key: 'budget', field: F.budget, budget: true },
  { key: 'w', field: F.inSection },
  { key: 'p', field: F.inProject },
  { key: 'planG', field: F.planGeree },
  { key: 'planGch', field: F.planGch },
  { key: 'planGu', field: F.planGuits },
  { key: 'planNw', field: F.planNextWk },
  { key: 'planPw', field: F.planPrevWk },
  { key: 'act', field: F.actPct },
  { key: 'perfG', field: F.perfGeree },
  { key: 'perfGch', field: F.perfGch },
  { key: 'perfGu', field: F.perfGuits },
  { key: 'perfWk', field: F.perfWk },
];

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toField = (v: number | null, budget?: true): number | null => (v == null ? null : budget ? v : v * SCALE);

/**
 * ХҮСНЭГТЭД БИЧИХ ЗӨРҮҮ — зөвхөн ӨӨРЧЛӨГДСӨН мөр · талбар (`applyAll`-ийн ⚠️: бүтэн мөр бичвэл өөр хүний
 * зэрэг засварыг дарна). Цэвэр функц.
 */
export function negEditDiff(base: readonly NegRaw[], model: readonly NegRaw[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  model.forEach((r, i) => {
    const b = base[i];
    const a: Record<string, unknown> = {};
    for (const o of OUT) {
      const nv = numOrNull(r[o.key]);
      if (negDiffers(nv, numOrNull(b[o.key]), o.budget)) a[o.field] = toField(nv, o.budget);
    }
    if (Object.keys(a).length) out.push({ [TUSUL_NEGTGEL.oid]: r.oid, ...a });
  });
  return out;
}

/**
 * «ТӨСЛИЙН НИЙТ» (WBS «0») мөр — Excel-ийн 6-р мөр: N…S = Σ G(үе шат) × утга, T…W = S ÷ N · O · P · R.
 * ⚠️ E · G нь ХӨНДӨГДӨХГҮЙ — Excel-д E6 = E7 + E9 + E528 (гурван үе шат л) гэх мэт өөр томьёотой.
 */
function rootVals(model: readonly NegRaw[]): Partial<Record<RollKey | 'perfG' | 'perfGch' | 'perfGu' | 'perfWk', number | null>> {
  const top = model.filter((r) => r.depth === 1);
  const v: Partial<Record<string, number | null>> = {};
  for (const key of ROLL_KEYS) {
    v[key] = top.some((r) => r[key] != null) ? top.reduce((a, r) => a + (r.p ?? 0) * (r[key] ?? 0), 0) : null;
  }
  for (const { perf, plan } of PERF) v[perf] = perfOf(v.act ?? null, v[plan] ?? null);
  return v;
}

/** Нийтлэх эрх — Нэгтгэлийн таб харагддаг хүн (super үүрэг, `permissions.roleOf`) */
export async function canEditNegtgel(user: string | null = currentUser()): Promise<boolean> {
  if (!user) return false;
  const { roleOf } = await import('@/lib/permissions');
  return roleOf(user) === 'super';
}

/**
 * НИЙТЛЭХ — засвартай загварыг хүснэгт рүү НЭГ `applyEdits`-ээр (атомаар) бичнэ.
 *
 * ⚠️ ЗЭРЭГ ЗАСВАР: бичихийн өмнө хүснэгтийг ШИНЭЭР уншиж, бичих гэж буй талбарууд маань ачаалсан үеийнхээсээ
 *    өөрчлөгдсөн бол ЗОГСОНО (өөр хүний засварыг чимээгүй дарахгүй).
 * ⚠️ Үйлчилгээ «Query» л бол сервер татгалзана — алдааг ил, засах аргатай нь буцаана.
 * @returns бичигдсэн мөрийн тоо
 */
export async function publishNegEdits(base: readonly NegRaw[], model: readonly NegRaw[]): Promise<number> {
  if (!(await canEditNegtgel())) throw new Error(tr('Нэгтгэл гүйцэтгэлийг засах эрх зөвхөн super үүрэгтэй хэрэглэгчид'));
  const updates = negEditDiff(base, model);
  if (!updates.length) return 0;

  const fresh = await loadNegRaw();
  const byOid = new Map(fresh.map((r) => [r.oid, r]));
  const baseBy = new Map(base.map((r) => [r.oid, r]));
  const moved = updates.filter((u) => {
    const oid = Number(u[TUSUL_NEGTGEL.oid]);
    const now = byOid.get(oid);
    const was = baseBy.get(oid);
    if (!now || !was) return true;
    return OUT.some((o) => o.field in u && negDiffers(numOrNull(now[o.key]), numOrNull(was[o.key]), o.budget));
  });
  if (moved.length) {
    throw new Error(tr('Энэ хооронд хүснэгт өөр газраас өөрчлөгдсөн байна ({0} мөр) — дахин ачаалаад засвараа давтана уу.', moved.length));
  }

  /* «ТӨСЛИЙН НИЙТ» мөр — ⚠️ мөрийн жагсаалтад ОРДОГГҮЙ (`loadNegRaw`) тул тусад нь уншина */
  const rootRows = await queryFeatures(TUSUL_NEGTGEL.url, { where: `${F.code} = '0'`, outFields: ['*'] });
  if (rootRows.length === 1) {
    const r = rootRows[0];
    const v = rootVals(model);
    const a: Record<string, unknown> = {};
    for (const o of OUT) {
      if (!(o.key in v)) continue;
      const nv = v[o.key as keyof typeof v] ?? null;
      const cur = numOrNull(r[o.field]);
      if (negDiffers(nv, cur == null ? null : cur / SCALE)) a[o.field] = toField(nv);
    }
    if (Object.keys(a).length) updates.push({ [TUSUL_NEGTGEL.oid]: Number(r[TUSUL_NEGTGEL.oid]), ...a });
  }

  try {
    const res = await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates });
    invalidate('TUSUL_NEGTGEL');
    return res.n;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not supported|not allowed|permission|does not have|unauthori|403/i.test(msg)) {
      throw new Error(tr('{0} — үйлчилгээнд засвар хаалттай байж магадгүй: ArcGIS дээр Negtgel_guitsetgel_1013 → Settings → «Enable editing» (Update) асаана уу.', msg));
    }
    throw e;
  }
}
