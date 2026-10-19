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
import { arcgisPost } from '@/lib/query';
import { TUSUL_NEGTGEL } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { currentUser } from '@/lib/who';
import { invalidate, register } from '@/lib/dataBus';
import { isLostWrite } from '@/lib/lostWrite';
import { loadNegRaw, negRootOf, treeOf, type NegRaw, type NegRootRow } from '@/lib/negtgelAuto';

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
      /* ⚠️ 2026-10-19: мужийн БҮХ жин хоосон бол томьёо биш (Σ = 0 нь «мэдээлэлгүй», `applyNegEdits` null өгнө) —
         эс бөгөөс засваргүй загвар хадгалсан 0-оос зөрж «засваргүй — зөрүү 0» эвдэрнэ */
      const wOk = (ks: number[]) => ks.some((k) => rows[k].w != null);
      const ks = inn(i);
      if (ks.length && wOk(ks) && near(r[key], sum(ks), FTOL)) return 'in';
      return ks.length !== kids[i].length && wOk(kids[i]) && near(r[key], sum(kids[i]), FTOL) ? 'all' : null;
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
  /*
   * ⚠️ 2026-10-19 (аудит): ТОМЬЁОТ НҮД ҮРГЭЛЖ ДАХИН БОДОГДОНО — оролт нь «мэдээлэлгүй» болбол үр дүн нь ч `null`
   *    (null ≠ 0). Урьд нь гурван газар ХУУЧИН утга чимээгүй үлддэг байв:
   *      · бүх хүүхдийн төсөв хоосорсон эцгийн Σ E — өмнөх нийлбэрээрээ;
   *      · эцгийн E ≤ 0 / хоосон (эсвэл өөрийн E хоосон) хүүхдийн F — хуучин жингээрээ G ба жигнэсэн нийлбэрт орно;
   *      · бүх хүүхэд нь хоосорсон эцгийн N…S — өмнөх нийлбэрээрээ.
   *    «Мэдээлэлтэй эсэх»-ийг БҮХ хүүхдээр (`negForm`-ын танилттай ИЖИЛ), нийлбэрийг мужаар (`in` / `all`) — эс бөгөөс
   *    засваргүй загвар хадгалсан утгаас зөрж «засваргүй — зөрүү 0» эвдэрнэ.
   */
  /* E — доороос дээш (хүүхэд эцгийнхээ ДАРАА байрладаг outline) */
  for (let i = n - 1; i >= 0; i -= 1) {
    const mode = form.eSum[i];
    if (!mode) continue;
    if (!kids[i].some((k) => m[k].budget != null)) { m[i].budget = null; continue; }
    const ks = mode === 'all' ? kids[i] : inn(i);
    m[i].budget = ks.reduce((a, k) => a + (m[k].budget ?? 0), 0);
  }
  /* F = E ÷ E(эцэг) — хуваагч ≤ 0 / хоосон бол тодорхойгүй (Excel-д #DIV/0!) → null */
  for (let i = 0; i < n; i += 1) {
    if (!form.fRatio[i]) continue;
    const pe = m[parent[i]].budget;
    const e = m[i].budget;
    m[i].w = pe != null && pe > 0 && e != null ? e / pe : null;
  }
  /* G = F × G(эцэг) — дээрээс доош */
  for (let i = 0; i < n; i += 1) {
    if (!form.gChain[i]) continue;
    const pg = m[parent[i]].p;
    const w = m[i].w;
    m[i].p = pg != null && w != null ? w * pg : null;
  }
  /* N…R, S = Σ F × хүүхэд — доороос дээш. ⚠️ Хоосон хүүхэд 0 (Excel-ийн SUMPRODUCT); БҮГД хоосон бол эцэг null */
  for (const key of ROLL_KEYS) {
    const on = form.roll[key];
    for (let i = n - 1; i >= 0; i -= 1) {
      const mode = on[i];
      if (!mode) continue;
      if (!kids[i].some((k) => m[k][key] != null)) { m[i][key] = null; continue; }
      const ks = mode === 'all' ? kids[i] : inn(i);
      /* ⚠️ 2026-10-19: мужийн БҮХ хүүхдийн жин (F) хоосон бол Σ F × утга нь 0 БИШ, тодорхойгүй → null (null ≠ 0).
         Утгыг биш ЖИНГ шалгана — F нь E ÷ E(эцэг)-ээр null болж болно (дээрх F-ийн алхам). */
      if (!ks.some((k) => m[k].w != null)) { m[i][key] = null; continue; }
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

/* ═══════════════ «ТӨСЛИЙН НИЙТ» мөр ═══════════════ */

const TOT_KEYS = ['planG', 'planGch', 'planGu', 'planNw', 'planPw', 'act'] as const;
type TotKey = (typeof TOT_KEYS)[number];
/** Нийтийн мөрийн утгууд — бүгд 0–1; `p` = Σ үе шатны жин (`null` — жинтэй үе шат алга) */
export type NegTotal = Record<TotKey | 'perfG' | 'perfGch' | 'perfGu' | 'perfWk', number | null> & { p: number | null };

/**
 * «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» — Excel-ийн 6-р мөр: N…S = Σ G(үе шат) × утга, T…W = S ÷ N · O · P · R (0 бол 0).
 * Цэвэр функц — ДЭЛГЭЦ (`TusulNegtgel.Tree`-ийн нийт мөр) ба НИЙТЛЭЛТ (`publishNegEdits`) ХОЁУЛАА үүнийг дуудна.
 *
 * ⚠️ 2026-10-19 (аудит): урьд нь нийтлэлт өөрийн `rootVals`-тай байв — хоосон үе шатыг 0 гэж нэмж, Σ жингээр
 *    нормчилдоггүй тул хүснэгтэд бичигдсэн нийт мөр дэлгэцийнхээс ЗӨРДӨГ байлаа. Одоо нэг томьёо:
 *      · жингүй (`p == null`) үе шат алгасагдана;
 *      · жинтэй (> 0) үе шатны утга хоосон бол тэр баганын нийт ХООСОН (null ≠ 0);
 *      · Σ жин [0.9995, 1.0005]-ээс гадуур бол жигнэсэн нийлбэрийг Σ жингээр НОРМЧИЛНО (аудит №7, 2026-10-11).
 * ⚠️ E · G нь ХӨНДӨГДӨХГҮЙ — Excel-д E6 = E7 + E9 + E528 (гурван үе шат л) гэх мэт өөр томьёотой.
 * @param top 1-р түвшний (үе шатны) мөрүүд, утга 0–1
 */
export function negTotals(top: ReadonlyArray<{ p: number | null } & Record<TotKey, number | null>>): NegTotal {
  let p = 0;
  const t = { planG: 0, planGch: 0, planGu: 0, planNw: 0, planPw: 0, act: 0 } as Record<TotKey, number>;
  const nul = new Set<TotKey>();
  let weighted = false;
  for (const r of top) {
    if (r.p == null) continue;
    weighted = true;
    const ip = r.p;
    p += ip;
    for (const k of TOT_KEYS) {
      const v = r[k];
      if (v == null) { if (ip > 0) nul.add(k); } else t[k] += ip * v;
    }
  }
  /* ⚠️ 2026-10-19: жинтэй үе шат НЭГ Ч алга (бүх `p` хоосон) эсвэл Σ жин ≤ 0 бол нийт ТОДОРХОЙГҮЙ — бүх багана null
     (урьд нь 0 буцааж, нийтлэлт хүснэгтийн нийт мөрт 0 бичдэг байв; null ≠ 0). Σ жин нь мөн null («мэдээлэлгүй»). */
  if (!weighted || !(p > 0)) {
    const none = { p: weighted ? p : null } as NegTotal;
    for (const k of TOT_KEYS) none[k] = null;
    for (const { perf } of PERF) none[perf] = null;
    return none;
  }
  const norm = p < 0.9995 || p > 1.0005 ? p : 1;
  const out = { p } as NegTotal;
  for (const k of TOT_KEYS) out[k] = nul.has(k) ? null : t[k] / norm;
  for (const { perf, plan } of PERF) out[perf] = perfOf(out.act, out[plan]);
  return out;
}

/** Нийт мөрт бичигдэх талбарууд (E · G-гүй) */
const ROOT_OUT = OUT.filter((o) => o.key !== 'budget' && o.key !== 'w' && o.key !== 'p');

/* ═══════════════ ОРОЛТ ═══════════════ */

export type NegParse = { ok: true; v: number | null } | { ok: false; err: string };

/**
 * ТӨСВИЙН БИЧВЭР → ТОО-н бичвэр. Зай (мянгат) хасна; таслалыг ЗӨВХӨН тодорхой үед хүлээн авна:
 *   · «1,234,567» (≥ 2 бүлэг гурван оронтой) → мянгат;   · «1234,5» · «1234,56» → бутархай;
 *   · «1,234,567.5» → мянгат + цэгэн бутархай;          · «1.234.567,5» → цэгэн мянгат + таслалан бутархай;
 *   · «1,234» · «1234,567» → ТОДОРХОЙГҮЙ (1.234 уу, 1234 үү) → `null` (татгалзана).
 * ⚠️ 2026-10-19 (аудит): урьд нь бүх таслалыг хасдаг тул «1234,5» → 12345 (10 дахин) чимээгүй бичигддэг байв.
 */
function normBudget(t: string): string | null {
  if (/^\d+(\.\d+)?$/.test(t)) return t;
  const comma = t.includes(',');
  const dot = t.includes('.');
  if (comma && dot) {
    if (/^\d{1,3}(,\d{3})+\.\d+$/.test(t)) return t.replace(/,/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) return t.replace(/\./g, '').replace(',', '.');
    return null;
  }
  if (comma) {
    if (/^\d{1,3}(,\d{3}){2,}$/.test(t)) return t.replace(/,/g, '');
    if (/^\d+,(\d{1,2}|\d{4,})$/.test(t)) return t.replace(',', '.');
    return null;
  }
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(t)) return t.replace(/\./g, '');
  return null;
}

/**
 * НҮДНИЙ БИЧВЭР → УТГА — цэвэр функц (тест: `negtgelEdit.check.mjs`).
 *   · хувь (F · G · N…S): «12,5» / «12.5%» → 0.125; ЗААВАЛ 0–100;
 *   · төсөв (E): «1 234 567» → 1234567; ≥ 0; таслал — `normBudget`-ийн дүрмээр;
 *   · хоосон → `null` (нүдийг хоослох).
 * ⚠️ 2026-10-19 (аудит): урьд нь хүрээ шалгадаггүй тул «250» (%) эсвэл сөрөг төсөв загварт орж, томьёогоор бүх өвөг
 *    рүү тархдаг байв. Татгалзсан оролтын ШАЛТГААНЫГ буцаана — UI нүдийг буцааж тэмдэглэнэ (`TusulNegtgel.EditInput`).
 */
export function parseNegInput(text: string, key: NegEditKey): NegParse {
  const budget = key === 'budget';
  let t = text.trim();
  if (!budget) t = t.replace(/%$/, '').trim();
  if (t === '') return { ok: true, v: null };
  t = t.replace(/[\s  ]/g, '');
  const neg = /^[-−]/.test(t);
  if (neg) t = t.slice(1);
  const s = budget ? normBudget(t) : /^\d+([.,]\d+)?$/.test(t) ? t.replace(',', '.') : null;
  if (s == null) {
    if (budget && t.includes(',')) {
      return { ok: false, err: tr('«{0}» — таслал мянгатын эсвэл бутархайн тэмдэг үү тодорхойгүй: бутархайг цэгээр (1234.5), мянгатыг зайгаар (1 234) бичнэ үү', text) };
    }
    return { ok: false, err: tr('«{0}» тоо биш — засвар хэрэгжсэнгүй', text) };
  }
  const x = Number(s) * (neg ? -1 : 1);
  if (!Number.isFinite(x)) return { ok: false, err: tr('«{0}» тоо биш — засвар хэрэгжсэнгүй', text) };
  if (budget) {
    if (x < 0) return { ok: false, err: tr('«{0}» — төсөв сөрөг байж болохгүй', text) };
    return { ok: true, v: x };
  }
  if (x < 0 || x > 100) return { ok: false, err: tr('«{0}» — хувь 0–100 хооронд байх ёстой', text) };
  return { ok: true, v: x / 100 };
}

/* ═══════════════ ЗЭРЭГ ЗАСВАР ═══════════════ */

/** Хүснэгтийн (×100) утга → загварын (0–1) */
const fromField = (v: unknown, budget?: true): number | null => {
  const x = numOrNull(v);
  return x == null ? null : budget ? x : x / SCALE;
};

/**
 * ХУУЧИРСАН МӨРҮҮД — бичих гэж буй талбар маань СУУРЬ (засвар эхэлсэн агшин)-аас хойш өөр газраас өөрчлөгдсөн мөрийн OID.
 * Цэвэр функц (тест).
 * ⚠️ 2026-10-19 (аудит): шинэ утга НЬ МАНАЙ бичих гэж буй утгатай таарвал зөрчил БИШ — тэр нь бидний өмнөх «хариу
 *    алдагдсан» (timeout) нийтлэлт амжилттай бичигдсэн гэсэн үг; урьд нь хэрэглэгч дахин «Нийтлэх» дарахад өөрийнх нь
 *    бичилт «өөр газраас өөрчлөгдсөн» гэж мэдээлэгддэг байв.
 * ⚠️ Мөрийн бүтэц (OID · гүн · дараалал) өөрчлөгдсөн бол БҮХ шинэчлэлт хуучирсан — мод өөр болсон.
 */
export function negStale(
  updates: ReadonlyArray<Record<string, unknown>>,
  base: readonly NegRaw[],
  fresh: readonly NegRaw[],
): number[] {
  const oidOf = (u: Record<string, unknown>) => Number(u[TUSUL_NEGTGEL.oid]);
  if (fresh.length !== base.length || fresh.some((r, i) => r.oid !== base[i].oid || r.depth !== base[i].depth)) {
    return updates.map(oidOf);
  }
  const now = new Map(fresh.map((r) => [r.oid, r]));
  const was = new Map(base.map((r) => [r.oid, r]));
  return updates.filter((u) => {
    const a = now.get(oidOf(u));
    const b = was.get(oidOf(u));
    if (!a || !b) return true;
    return OUT.some((o) => {
      if (!(o.field in u)) return false;
      const nv = numOrNull(a[o.key]);
      return negDiffers(nv, numOrNull(b[o.key]), o.budget) && negDiffers(nv, fromField(u[o.field], o.budget), o.budget);
    });
  }).map(oidOf);
}

/** ШИНЭ мөрүүд дээр манай шинэчлэлтийг тавина — нийт мөрийг үүнээс бодно. Цэвэр функц. */
export function negMerge(fresh: readonly NegRaw[], updates: ReadonlyArray<Record<string, unknown>>): NegRaw[] {
  const by = new Map(updates.map((u) => [Number(u[TUSUL_NEGTGEL.oid]), u]));
  return fresh.map((r) => {
    const u = by.get(r.oid);
    if (!u) return r;
    const m: NegRaw = { ...r };
    for (const o of OUT) if (o.field in u) (m as Record<string, unknown>)[o.key] = fromField(u[o.field], o.budget);
    return m;
  });
}

/**
 * НИЙТ МӨРИЙН ШИНЭЧЛЭЛТ — `merged` (шинэ мөр + манай засвар)-аас `negTotals`-аар бодоод, одоогийн нийт мөрөөс
 * зөрсөн талбарыг л буцаана. Цэвэр функц.
 * @returns `stale` — нийт мөр СУУРЬ-аас хойш өөр газраас өөрчлөгдсөн (манай бодсон утгатай ч таарахгүй)
 * ⚠️ 2026-10-19: нийт мөр нь БҮРЭН дериват — давхцаагүй мөр засварласан өөр нийтлэгч ч түүнийг өөрийн томьёогоор
 *    дахин бичдэг тул «суурьаас өөрчлөгдсөн» нь дангаараа зөрчил БИШ (урьд нь хоёр давхцаагүй нийтлэгчийн хоёр дахь нь
 *    худал зөрчлөөр зогсдог байв). Одоогийн нийт мөр нь ШИНЭ мөрүүдийн (манай засваргүй, `fresh`) дахин бодолттой таарвал
 *    түүнийг тайлбарласан — зөрчил биш. Зөвхөн томьёогоор тайлбарлагдахгүй (гараар · Excel синкээр) өөрчлөгдсөн бол зөрчил.
 * @param fresh ШИНЭ уншилтын мөрүүд (манай засваргүй) — өгөөгүй бол хуучин (хатуу) шалгалт
 */
export function negRootUpdate(
  merged: readonly NegRaw[],
  root: NegRootRow,
  baseRoot: NegRootRow | undefined,
  fresh?: readonly NegRaw[],
): { attrs: Record<string, unknown> | null; stale: boolean } {
  const v = negTotals(merged.filter((r) => r.depth === 1));
  const fv = fresh ? negTotals(fresh.filter((r) => r.depth === 1)) : null;
  const a: Record<string, unknown> = {};
  let stale = false;
  for (const o of ROOT_OUT) {
    const k = o.key as keyof NegTotal & keyof NegRootRow;
    const nv = v[k] ?? null;
    const cur = root[k] ?? null;
    const explained = fv != null && !negDiffers(cur, fv[k] ?? null);
    if (baseRoot && !explained && negDiffers(cur, baseRoot[k] ?? null) && negDiffers(cur, nv)) stale = true;
    if (negDiffers(nv, cur)) a[o.field] = toField(nv);
  }
  return { attrs: Object.keys(a).length ? { [TUSUL_NEGTGEL.oid]: root.oid, ...a } : null, stale };
}

/**
 * Бичилт ХҮСНЭГТЭД ТУССАН эсэх — шинэчлэлт бүрийн талбар бүр одоо манай утгатай таарна. Цэвэр функц.
 * («Хариу алдагдсан» нийтлэлтийн дараа дахин уншиж шалгахад — `publishNegEdits`.)
 */
export function negLanded(
  updates: ReadonlyArray<Record<string, unknown>>,
  rows: readonly NegRaw[],
  roots: readonly NegRootRow[],
): boolean {
  const by = new Map<number, Partial<Record<keyof NegRaw, unknown>>>(rows.map((r) => [r.oid, r]));
  for (const r of roots) by.set(r.oid, r);
  return updates.every((u) => {
    const r = by.get(Number(u[TUSUL_NEGTGEL.oid]));
    if (!r) return false;
    return OUT.every((o) => !(o.field in u) || !negDiffers(numOrNull(r[o.key]), fromField(u[o.field], o.budget), o.budget));
  });
}

/* ═══════════════ ҮЙЛЧИЛГЭЭНИЙ ЗАСАХ ЧАДВАР ═══════════════ */

/**
 * Метадатын `capabilities` нь мөр ЗАСАХЫГ зөвшөөрөх үү — `Update`, эсвэл хуучин хэлбэрийн дан `Editing`
 * (Create/Update/Delete задлаагүй). `null` = метадата ирсэнгүй (тодорхойгүй). Цэвэр функц.
 */
export const parseCanUpdate = (capabilities: unknown): boolean | null => {
  if (typeof capabilities !== 'string') return null;
  const has = (w: string) => new RegExp(`(^|,)\\s*${w}\\s*(,|$)`, 'i').test(capabilities);
  return has('update') || (has('editing') && !has('create') && !has('delete'));
};

let capP: Promise<boolean | null> | null = null;
/* ⚠️ Үйлчилгээний тохиргоо ховор өөрчлөгдөнө — сешнд нэг удаа; уналтыг кэшлэхгүй; «Шинэчлэх» (`invalidateAll`) хаяна */
register(() => { capP = null; }, ['TUSUL_NEGTGEL']);

/**
 * «Засах» товчийг үйлчилгээний ЧАДВАРААР хаах уу (`TusulNegtgel.NegBody`).
 * ⚠️ 2026-10-19 (аудит): `Negtgel_guitsetgel_1013` нь «Query» л (`services/fields.ts`-ийн `readOnly`) атал товч
 *    идэвхтэй байсан — хэрэглэгч олон нүд засаад «Нийтлэх» дарсан хойноо л серверийн татгалзал авдаг байв.
 * ⚠️ Хаалттай ч AGOL-ийн байгууллагын АДМИН бичиж чаддаг (`habeaRegisters.loadIsOrgAdmin`-ийн ⚠️) — тэдэнд нээлттэй.
 * @returns `true` засаж болно · `false` хаалттай · `null` тодорхойгүй (метадата ирсэнгүй — товчийг ХААХГҮЙ,
 *          бичилт өөрөө алдаагаа хэлнэ)
 */
export function negServiceCanUpdate(): Promise<boolean | null> {
  if (!capP) {
    const mine: Promise<boolean | null> = arcgisPost<{ capabilities?: string }>(TUSUL_NEGTGEL.url, {})
      .then(async (j) => {
        const can = parseCanUpdate(j.capabilities);
        if (can !== false) return can;
        const { loadIsOrgAdmin } = await import('@/lib/habeaRegisters');
        return (await loadIsOrgAdmin()) ? true : false;
      })
      .catch(() => null);
    capP = mine;
    void mine.then((v) => { if (v == null && capP === mine) capP = null; });
  }
  return capP;
}

/* ═══════════════ НИЙТЛЭХ ═══════════════ */

/**
 * Нийтлэх эрх — Нэгтгэлийн таб харагддаг хүн (КОДЫН хатуу super, `roleForUser`).
 * ⚠️ 2026-10-19 (аудит): урьд нь `permissions.roleOf` — панелийн хуучин `role:'super'` override мөр ч нийтэлж
 *    чаддаг байв (панелийн super 2026-10-15-нөөс олгогдохгүй). `Guitsetgel.isSuperRole`-тэй ИЖИЛ дүрэм.
 */
export async function canEditNegtgel(user: string | null = currentUser()): Promise<boolean> {
  if (!user) return false;
  const { roleForUser } = await import('@/lib/services');
  return roleForUser(user) === 'super';
}

/**
 * ⚠️ 2026-10-19 (аудит): НЭГ `applyEdits`-ийн биеийн ДЭЭД хэмжээ (тэмдэгт).
 *    АТОМ хэвээр (500-гаар хуваахгүй) — шалтгаан: томьёот нүднүүд хоорондоо хамааралтай (E → F → G → Σ), хагас
 *    бичигдсэн хүснэгт (жиш. хүүхдийн F шинэ, эцгийн Σ хуучин) нь «амжилтгүй» гэснээс ч муу: Excel-ийн загвар эвдэрч,
 *    дараагийн засварын томьёо танилт (`negForm`) таарахаа больж оролт болно. `rollbackOnFailure` ЗӨВХӨН нэг хүсэлт
 *    дотор үйлчилнэ (CLAUDE.md-ийн ArcGIS занга).
 *    Хэмжээ: хүснэгт 906 мөр, мөр бүр ≤ 13 талбар → бүх мөр өөрчлөгдсөн ч ~0.5 МБ — ArcGIS-ийн POST-ийн хязгаараас
 *    хол доогуур. Энэ босго нь ХЭЗЭЭ Ч хүрэхгүй ёстой; хүрвэл (схем өргөссөн г.м.) хагас бичилтийн оронд илгээхээс
 *    ӨМНӨ ил зогсоно.
 */
const MAX_BODY = 4_000_000;

export type NegPublishResult = {
  /** Бичигдсэн мөрийн тоо (нийт мөрийг оруулаад) */
  n: number;
  /** Нийтлэгдсэн ч анхааруулах зүйл (нийт мөр олдсонгүй г.м.) */
  warn: string | null;
};

/**
 * НИЙТЛЭХ — засвартай загварыг хүснэгт рүү НЭГ `applyEdits`-ээр (атомаар, `MAX_BODY`-ийн ⚠️) бичнэ.
 *
 * ⚠️ ЗЭРЭГ ЗАСВАР: бичихийн өмнө хүснэгтийг ШИНЭЭР уншиж, бичих гэж буй талбарууд маань СУУРЬ-аас хойш өөрчлөгдсөн
 *    бол ЗОГСОНО (өөр хүний засварыг чимээгүй дарахгүй, `negStale`).
 * ⚠️ 2026-10-19 (аудит): `base` нь засах горимд орсон агшинд ЦАРЦААСАН суурь (`TusulNegtgel.NegBody`) — урьд нь
 *    арын шинэчлэлт `d.stored`-ийг засварын дор сольдог тул шалгалт хэрэглэгчийн ХАРААГҮЙ суурьтай харьцуулж, өөр
 *    нийтлэгчийн засварыг чимээгүй дарж болдог байв.
 * ⚠️ 2026-10-19 (аудит): «ТӨСЛИЙН НИЙТ» мөрийг ШИНЭ мөрүүд + манай засвараас (`negMerge`), ДЭЛГЭЦИЙН томьёогоор
 *    (`negTotals`) бодно; нийт мөр ч зэрэг засварын шалгалтад орно; тоо нь 1 биш бол бичихгүй, анхааруулна.
 * ⚠️ 2026-10-19 (аудит): ХАРИУ АЛДАГДСАН (timeout · сүлжээ · 5xx, `isLostWrite`) бол кэшийг хаяж ДАХИН уншина —
 *    бүх утга манайх бол амжилт; эс бөгөөс «тодорхойгүй» гэж хэлнэ (хэзээ ч «бичигдээгүй» гэж таамаглахгүй).
 * ⚠️ Үйлчилгээ «Query» л бол сервер татгалзана — алдааг ил, засах аргатай нь буцаана.
 */
export async function publishNegEdits(base: readonly NegRaw[], model: readonly NegRaw[]): Promise<NegPublishResult> {
  if (!(await canEditNegtgel())) throw new Error(tr('Нэгтгэл гүйцэтгэлийг засах эрх зөвхөн super үүрэгтэй хэрэглэгчид'));
  const updates = negEditDiff(base, model);
  if (!updates.length) return { n: 0, warn: null };

  const fresh = await loadNegRaw();
  const moved = negStale(updates, base, fresh);
  if (moved.length) {
    throw new Error(tr('Энэ хооронд хүснэгт өөр газраас өөрчлөгдсөн байна ({0} мөр) — дахин ачаалаад засвараа давтана уу.', moved.length));
  }

  /* «ТӨСЛИЙН НИЙТ» мөр — ⚠️ мөрийн жагсаалтад ОРДОГГҮЙ; ижил уншилтын нийт мөр (`negRootOf`) */
  let warn: string | null = null;
  const roots = negRootOf(fresh) ?? [];
  if (roots.length !== 1) {
    warn = tr('«ТӨСЛИЙН НИЙТ» мөр хүснэгтэд {0} байна (1 байх ёстой) — нийт мөр бичигдсэнгүй, бусад мөр хадгалагдсан.', roots.length);
  } else {
    const baseRoot = negRootOf(base)?.find((r) => r.oid === roots[0].oid);
    const ru = negRootUpdate(negMerge(fresh, updates), roots[0], baseRoot, fresh);
    if (ru.stale) {
      throw new Error(tr('Энэ хооронд хүснэгт өөр газраас өөрчлөгдсөн байна ({0} мөр) — дахин ачаалаад засвараа давтана уу.', 1));
    }
    if (ru.attrs) updates.push(ru.attrs);
  }

  if (JSON.stringify(updates).length > MAX_BODY) {
    throw new Error(tr('Засвар хэт их ({0} мөр) — нэг хүсэлтээр атомаар бичих хэмжээнээс хэтэрлээ; хэсэгчлэн нийтэлнэ үү.', updates.length));
  }

  try {
    const res = await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates });
    invalidate('TUSUL_NEGTGEL');
    return { n: res.n, warn };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isLostWrite(e)) {
      /* Хариу алдагдсан — сервер бичсэн байж магадгүй. Кэш хаяж (бичилтийн үе өснө — `query.shared` хуучин
         уншилтад наалдахгүй) дахин уншина. */
      invalidate('TUSUL_NEGTGEL');
      const after = await loadNegRaw().catch(() => null);
      if (after && negLanded(updates, after, negRootOf(after) ?? [])) return { n: updates.length, warn };
      throw new Error(tr('Хариу ирсэнгүй ({0}) — дахин уншихад засвар хүснэгтэд бүрэн тусаагүй байна. Засвар тань хадгалагдсан хэвээр — «Нийтлэх»-ийг дахин дарна уу.', msg));
    }
    if (/not supported|not allowed|permission|does not have|unauthori|403/i.test(msg)) {
      throw new Error(tr('{0} — үйлчилгээнд засвар хаалттай байж магадгүй: ArcGIS дээр Negtgel_guitsetgel_1013 → Settings → «Enable editing» (Update) асаана уу.', msg));
    }
    throw e;
  }
}
