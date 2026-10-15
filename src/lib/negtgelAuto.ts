/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — Excel «Төсөл төлөвлөгөө биелэлт»-ийн ЗАГВАР + СИСТЕМИЙН БОДИТ ГҮЙЦЭТГЭЛ.
 *
 * ⚠️⚠️ 2026-10-13: ЭХ БА ТОМЬЁО СОЛИГДОВ (хэрэглэгч: «Negtgel_guitsetgel_1013-ийг хуучин нэгтгэл
 *    гүйцэтгэлээр соль; харагдуулах ба томьёолол нь `docs/Төсөл Гүйцэтгэл_Орон сууц, Нийгмийн дэд
 *    бүтэц_261007 - V3.xlsx`-ийн «Төсөл төлөвлөгөө биелэлт» хуудас»).
 *
 * ── ЭХ ── `TUSUL_NEGTGEL` = `Negtgel_guitsetgel_1013/199` (906 мөр = тэр хуудасны 6–911-р мөр, B…W багана).
 *    ЗӨВХӨН уншина (Query). Хувь нь 0–100 (`TUSUL_NEGTGEL.scale`) — энд 0–1 болгоно. «ТӨСЛИЙН НИЙТ» (WBS «0»)
 *    мөрийг мөрийн жагсаалтад ОРУУЛАХГҮЙ — таб/дашбоард 1-р түвшнээс өөрсдөө бодно (Excel-ийн 6-р мөрийн томьёо).
 *
 * ── МОД ── `negtgelTree.ts` — Excel-ийн томьёоноос (эцэг бүрийн хүүхэд = түүний N томьёонд орсон мөрүүд).
 *    Хүснэгтийн кодуудын хурхираа таарахгүй бол (мөр нэмэгдсэн/хасагдсан) кодоор + `PHASE`-ээр угсарсан нөөц
 *    мод (`fallbackDepth`), таб анхааруулна (`negTreeSource`).
 *
 * ── ТОМЬЁО (Excel-ээс амьдаар БАТАЛГААЖСАН, 2026-10-13) ──
 *   · Эцэг = Σ (хүүхдийн F «Хэсэгт эзлэх» × хүүхдийн утга) — N томьёотой 94/94 эцэг, O · P · Q · R · S-ийн
 *     томьёотой эцгүүд бүгд ЯГ таарсан. Хуваагч Σw БИШ (Excel-ийн SUMPRODUCT). Нийлбэрт ОРООГҮЙ 8 мөр
 *     (`outside`, Нийслэл төсөв г.м.) Excel-тэй ижил хасагдана.
 *   · Биелэлт T · U · V · W = S ÷ N · O · P · R; хуваагч 0 бол 0.
 *   · Төслийн нийт = Σ (1-р түвшний G «Төсөлд эзлэх хувь» × утга) (`projectTotal`).
 *
 * ── СИСТЕМИЙН БОДИТ ГҮЙЦЭТГЭЛ (S) — Excel-д ч ГАРААР бичигддэг мөрүүдэд ──
 *   · Орон сууцны 7 багцын мөр (5.2.1.x «Багц-1» …) → «01. Гүйцэтгэл»-ийн БАТЛАГДСАН биет хувь (блокуудаар).
 *   · Блокгүй багц (5.x · 6.x · 7.1 · 10) барилга угсралтын мөр → 01-ийн батлагдсан хувь.
 *   · «Газар чөлөөлөлт» (үе шат ба 5.1.1) → «Газар чөлөөлөлт» модулийн явц.
 *   Хэмжилтгүй (тайлагнаагүй / эх унасан) бол Excel-ийн утга ХЭВЭЭР (null ≠ 0).
 *   Excel-д эдгээр мөрийн S нь томьёо БИШ, гараар бичсэн утга (89 тогтмол эцгийн зөрсөн 7 нь яг эдгээр) —
 *   систем түүнийг амьд хэмжилтээр солино.
 * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН мөрийн ӨВГҮҮДИЙГ дахин бодно — бусад бүх нүд Excel-ийн утгаа ЯГ хадгална. Excel-д
 *    мужийн хоёр алдаа бий (879 нь хөрш 885-ын хүүхдүүдийг, 842 нь 857-г орхисон муж); хувирал ороогүй
 *    салаанд тэднийг «засахгүй» — Excel-ийн тоотой нэг байх нь хэрэглэгчийн шаардлага.
 * ⚠️ Төлөвлөгөөт хувь (N…R) ба жин (F · G) — Excel-ийн утгаар (систем бодохгүй). 2026-10-13-аас өмнө
 *    гүйцэтгэгчийн төлөвлөгөөг «Хуваарь»-ийн муруйгаас, бусад шатыг Cashflow-оос бодож байсан — Excel V3 нь
 *    тэдгээрийг өөрөө агуулдаг тул ХАСАГДАВ.
 * ⚠️ Бүх утга дотооддоо 0–1 бутархай.
 */
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { TUSUL_NEGTGEL, bagtsKey, buildingKey, roleForUser } from '@/lib/services';
import { negtgelDepth } from '@/lib/negtgel';
import { NEG_TREE, negTreeHash } from '@/lib/negtgelTree';
import { currentUser } from '@/lib/who';

const F = TUSUL_NEGTGEL.fields;
/** Хүснэгтийн хувийн масштаб (100 = 0–100) */
const SCALE = TUSUL_NEGTGEL.scale;

/* ═══════════════ ХҮСНЭГТИЙН МӨР ═══════════════ */

/** Утгууд — бүгд 0–1 (Excel N…W) */
export type NegVals = {
  /** S — Гүйцэтгэлийн хувь */
  act: number | null;
  /** N — Төлөвлөгөөт хувь, Гэрээ Хавсралт 5 */
  planG: number | null;
  /** O — Төлөвлөгөөт хувь, Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан */
  planGch: number | null;
  /** P — Төлөвлөгөөт хувь, Гүйцэтгэгч */
  planGu: number | null;
  /** Q — Төлөвлөгөөт хувь, дараа долоо хоног */
  planNw: number | null;
  /** R — Төлөвлөгөөт хувь, өмнөх долоо хоног */
  planPw: number | null;
  /** T · U · V — Төлөвлөгөө биелэлт (гэрээ · гэрээ ГЧ · гүйцэтгэгч) */
  perfG: number | null;
  perfGch: number | null;
  perfGu: number | null;
  /** W — Төлөвлөгөө биелэлт, долоо хоногийн (S ÷ R) */
  perfWk: number | null;
};

export type NegRaw = NegVals & {
  oid: number;
  code: string;
  name: string;
  bagts: string;
  /** МОДНЫ гүн — 1 = үе шат (`negtgelTree.ts` эсвэл `fallbackDepth`) */
  depth: number;
  /** Эцэгтээ эзлэх жин (0–1) — Excel F */
  w: number | null;
  /** Төсөлд эзлэх жин (0–1) — Excel G */
  p: number | null;
  /** Урьдчилсан төсөвт өртөг, ₮ — Excel E */
  budget: number | null;
  /** Excel-ийн эцгийн томьёонд ОРООГҮЙ мөр (`NEG_TREE.outside`) */
  outside?: boolean;
  /** Үе шат (`PHASE`) */
  phase?: string;
  /** Гэрээ/Хавсралт 5 — төлөвлөгөөт эхлэх/дуусах (ms) — Excel H · I */
  ctStart?: number | null;
  ctEnd?: number | null;
  /** Гүйцэтгэгч — төлөвлөгөөт эхлэх/дуусах («YYYY-MM-DD») — Excel J · K */
  exStart?: string;
  exEnd?: string;
  /** Бодит эхлэх/дуусах («YYYY-MM-DD») — Excel L · M */
  actStart?: string;
  actEnd?: string;
};

/** Үйлчилгээний талбар ↔ `NegVals` түлхүүр */
export const VAL_FIELD: Record<keyof NegVals, string> = {
  act: F.actPct,
  planG: F.planGeree,
  planGch: F.planGch,
  planGu: F.planGuits,
  planNw: F.planNextWk,
  planPw: F.planPrevWk,
  perfG: F.perfGeree,
  perfGch: F.perfGch,
  perfGu: F.perfGuits,
  perfWk: F.perfWk,
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
/** Хүснэгтийн хувь (0–100) → 0–1 */
const frac = (v: unknown): number | null => {
  const x = num(v);
  return x == null ? null : x / SCALE;
};
const r6 = (v: number | null): number | null => (v == null ? null : Math.round(v * 1e6) / 1e6);
const txt = (v: unknown): string => String(v ?? '').trim();

/**
 * ДАВХАРДСАН БҮЛЭГ КОДЫГ ЭХНИЙХИЙНХЭЭ ДООР ОРУУЛНА — кодоор угсрах НӨӨЦ замд (`fallbackDepth`).
 *
 * ⚠️ Хуучин хүснэгтэд «5.2.3» ДӨРВӨН мөрд: эхнийх нь «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ» бүлэг, дараагийн гурав нь
 * түүний ДЭД хэсэг. Кодоор гүн тогтоовол тэд 5.2-ын шууд хүүхэд болно. Дүрэм: эхний давхцал ХҮҮХЭДТЭЙ
 * (бүлэг) бол л дараагийнхыг түүний доор оруулна.
 */
export function nestDupGroups(codes: string[]): number[] {
  const d0 = codes.map((c) => negtgelDepth(c));
  const d = d0.slice();
  const first = new Map<string, number>();
  codes.forEach((c, i) => {
    if (!c) return;
    /* ⚠️ Аль хэдийн шилжсэн дэд модны мөрийг ДАХИН шилжүүлэхгүй (2026-09-25) */
    if (d[i] !== d0[i]) return;
    const f = first.get(c);
    if (f == null) { first.set(c, i); return; }
    const isGroup = f + 1 < codes.length && d0[f + 1] > d0[f];
    if (!isGroup) return;
    d[i] += 1;
    for (let k = i + 1; k < codes.length && d0[k] > d0[i]; k += 1) d[k] += 1;
  });
  return d;
}

/**
 * КОДООР УГСРАХ НӨӨЦ МОД — Excel-ийн мод (`NEG_TREE`) хүснэгттэй таарахгүй үед.
 * ⚠️ Үе шат бүрийн (`PHASE`) ЭХНИЙ мөр = 1-р түвшин; доторх гүн нь тэр үе шатанд ДАНГААР `nestDupGroups`.
 *    Бүх хүснэгтэд нэг дор хийвэл «3» давхардал (Газар чөлөөлөлт · Зөвшөөрөл) Зөвшөөрлийг Газар
 *    чөлөөлөлтийн доор оруулна (шинэ хүснэгтэд Газар чөлөөлөлт 184 хүүхэдтэй).
 */
export function fallbackDepth(codes: string[], phases: string[]): number[] {
  const out = new Array<number>(codes.length).fill(1);
  for (let a = 0; a < codes.length;) {
    let b = a + 1;
    while (b < codes.length && phases[b] === phases[a]) b += 1;
    const d = nestDupGroups(codes.slice(a, b));
    const base = d[0];
    for (let k = a; k < b; k += 1) out[k] = k === a ? 1 : Math.max(2, d[k - a] - base + 1);
    a = b;
  }
  return out;
}

/** Эцгийн индекс ба хүүхдүүд — БАЙРЛАЛ + ГҮНЭЭР (outline) */
export function treeOf(depth: number[]): { parent: number[]; kids: number[][] } {
  const parent = new Array<number>(depth.length).fill(-1);
  const stack: number[] = [];
  depth.forEach((dd, i) => {
    while (stack.length > 0 && depth[stack[stack.length - 1]] >= dd) stack.pop();
    parent[i] = stack.length > 0 ? stack[stack.length - 1] : -1;
    stack.push(i);
  });
  const kids: number[][] = depth.map(() => []);
  parent.forEach((pp, i) => { if (pp >= 0) kids[pp].push(i); });
  return { parent, kids };
}

/** Сүүлийн уншилтын модны эх — `excel` (`negtgelTree.ts`) эсвэл `code` (нөөц) */
let treeSource: 'excel' | 'code' = 'excel';
export const negTreeSource = (): 'excel' | 'code' => treeSource;

/**
 * Хүснэгтийн мөр + Excel-ийн мод → гүн ба «нийлбэрт орохгүй» тэмдэг. Цэвэр функц (тест).
 * @param codes БҮХ мөрийн `WBS_ID` (нийт «0» мөрийг оруулаад) — OBJECTID дарааллаар
 */
export function excelTree(codes: string[], phases: string[]): { depth: number[]; outside: boolean[]; source: 'excel' | 'code' } {
  if (codes.length === NEG_TREE.n && negTreeHash(codes) === NEG_TREE.hash) {
    const depth = Array.from(NEG_TREE.depth, (ch) => ch.charCodeAt(0) - 48);
    const outside = new Array<boolean>(codes.length).fill(false);
    for (const i of NEG_TREE.outside) outside[i] = true;
    return { depth, outside, source: 'excel' };
  }
  /* ⚠️ Нөөц — нийт («0») мөр байвал гүн 0, бусад нь үе шатаар */
  const isRoot = (i: number) => codes[i] === '0' || (i === 0 && !phases[0]);
  const rest = codes.map((_, i) => i).filter((i) => !isRoot(i));
  const d = fallbackDepth(rest.map((i) => codes[i]), rest.map((i) => phases[i]));
  const depth = new Array<number>(codes.length).fill(0);
  rest.forEach((i, k) => { depth[i] = d[k]; });
  return { depth, outside: new Array<boolean>(codes.length).fill(false), source: 'code' };
}

/**
 * Хүснэгтийг ХАДГАЛСАН (Excel-ийн) утгатай нь бүтнээр уншина.
 * ⚠️ OID-оор — мөрийн дараалал нь Excel-ийн мод; кодоор эрэмбэлбэл эвдэрнэ.
 * ⚠️ «ТӨСЛИЙН НИЙТ» (гүн 0) мөрийг БУЦААХГҮЙ — 1-р түвшний мөрүүдээс бодогдоно (`projectTotal`).
 */
export async function loadNegRaw(): Promise<NegRaw[]> {
  const raw = await queryFeatures(TUSUL_NEGTGEL.url, { outFields: ['*'], orderBy: TUSUL_NEGTGEL.oid });
  const codes = raw.map((r) => txt(r[F.code]));
  const phases = raw.map((r) => txt(r[F.phase]));
  const t = excelTree(codes, phases);
  treeSource = t.source;
  if (t.source === 'code') console.warn('[negtgel] хүснэгт Excel-ийн модтой таарахгүй — кодоор угсарлаа (negtgelTree.ts-ийг дахин үүсгэнэ)');
  const out: NegRaw[] = [];
  raw.forEach((r, i) => {
    if (t.depth[i] === 0) return;
    const v = {} as NegVals;
    for (const [k, f] of Object.entries(VAL_FIELD)) v[k as keyof NegVals] = frac(r[f]);
    out.push({
      ...v,
      oid: Number(r[TUSUL_NEGTGEL.oid] ?? 0),
      code: codes[i],
      /* ⚠️ Excel-ийн нэр доголоор/мөр шилжилтээр эхэлдэг — нэг мөр болгоно */
      name: txt(r[F.name]).replace(/\s+/g, ' '),
      bagts: txt(r[F.bagts]).replace(/\s+/g, ' '),
      depth: t.depth[i],
      w: frac(r[F.inSection]),
      p: frac(r[F.inProject]),
      budget: num(r[F.budget]),
      outside: t.outside[i] || undefined,
      phase: phases[i],
      ctStart: num(r[F.ctStart]),
      ctEnd: num(r[F.ctEnd]),
      exStart: txt(r[F.exStart]),
      exEnd: txt(r[F.exEnd]),
      actStart: txt(r[F.actStart]),
      actEnd: txt(r[F.actEnd]),
    });
  });
  return out;
}

/* ═══════════════ СИСТЕМИЙН ЭХ ═══════════════ */

export type NegSources = {
  /** «Газар чөлөөлөлт» модулийн явц, 0–100 */
  land: number | null;
  /** Орон сууцны багцын БАТЛАГДСАН биет гүйцэтгэл — `bagtsKey` → 0–100 (ЗӨВХӨН хэмжигдсэн, `measuredHousing`) */
  housing: Map<string, number>;
  /** БЛОКТОЙ (барилгын) бөглөх хуудастай багцууд — `bagtsKey` */
  housingPkgs?: Set<string>;
  /**
   * БЛОКГҮЙ багцын (5.x · 6.x · 7.1 · 10) БАТЛАГДСАН биет гүйцэтгэл — `pkgNo` («5.1») → 0–100.
   * ⚠️ ЗӨВХӨН тайлагнасан (`blocks > 0`) багц (`blockProgress.loadInfraProgress`).
   */
  infra?: Map<string, number>;
  /** Бөглөх хуудастай БЛОКГҮЙ багцууд — `pkgNo` */
  infraPkgs?: Set<string>;
  /**
   * БЛОК БҮРИЙН батлагдсан биет хувь — `buildingKey` («БАГЦ1|5/1») → `overall` 0–100
   * (`blockProgress.loadBlockProgress`). Орон сууцны багцын доорх БАРИЛГЫН мөрүүдэд (`housingBreakdown`).
   */
  blocks?: ReadonlyMap<string, { overall: number } | null | undefined>;
  /** Багц бүрийн блокийн хуваарь — `bagtsKey` → `buildingKey`-ууд (`blockProgress.loadBlockUniverse`) */
  blockUni?: ReadonlyMap<string, readonly string[]>;
  /**
   * ХЭСЭГЧЛЭН уншигдсан эхүүдийн нэр (2026-10-01) — дэлгэц нэрлэж, `loadNegtgelFull` КЭШЛЭХГҮЙ.
   * ⚠️ 2026-10-13: хуваарийн муруй эх биш болсон тул одоогоор үргэлж хоосон.
   */
  partial?: string[];
};

/**
 * ЭХ СУРВАЛЖ УНАСАН — АЛЬ нь унасныг нэрээр (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export class NegSourceError extends Error {
  /** Унасан эхүүдийн нэр (`tr()`-ээр) */
  readonly failed: string[];
  constructor(failed: string[], cause?: unknown) {
    super(`${tr('Татагдсангүй: {0}', failed.join(', '))}${cause instanceof Error ? ` (${cause.message})` : ''}`);
    this.name = 'NegSourceError';
    this.failed = failed;
  }
}

/** Амжилттай үр дүнг задлах — `loadNegSources` бүх уналтыг ӨМНӨ нь шалгасан */
const settledValue = <T,>(r: PromiseSettledResult<T>): T => {
  if (r.status === 'rejected') throw r.reason;
  return r.value;
};

/**
 * БАГЦЫН ДУГААР — эх бүрийн бичлэгийг нэг хэлбэрт.
 *
 * «БАГЦ-5.1» · «Багц 5.1» · «БАГЦ - 19.1» · «БАГЦ -9» · «БАГЦ 1- 4» ·
 * «БАГЦ-6.1, 6.2 Нэмэлт ажил» → «5.1» · «19.1» · «9» · «1-4» · «6.1,6.2».
 *
 * ⚠️ ЦЭГИЙГ ХАДГАЛНА — `bagtsKey` цэгийг хасдаг тул «1-4» ба «14» (Нэвтрэх
 * суваг) нэг түлхүүр болж, орон сууцны суурийн холболт суваг руу холбогдоно.
 */
export const pkgNo = (s: string): string => s
  .toUpperCase()
  .replace(/НЭМЭЛТ\s*АЖИЛ/g, '')
  .replace(/БАГЦ/g, '')
  .replace(/[–—−]/g, '-')
  .replace(/\s+/g, '')
  .replace(/^-+/, '');

/** Нэрийн харьцуулалтад — зай, цэг, хаалтын ялгааг үл тоомсорлоно */
const nkey = (v: unknown): string => String(v ?? '')
  .replace(/[–—−]/g, '-')
  .toLowerCase()
  .replace(/[\s.,()/"'«»-]/g, '');

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * ОРОН СУУЦНЫ ТӨЛӨВЛӨГӨӨТ ХУВЬ — багц бүрийн ХЭМЖИЛТИЙН ӨДРИЙН байдлаар (цэвэр функц, тест).
 *
 * ⚠️ 2026-10-13: нэгтгэлд ХЭРЭГЛЭГДЭХЭЭ БОЛИВ (төлөвлөгөөт хувь Excel-ээс). Функц нь `planProgress.planPctAt`-ийн
 *    «ганц дүрэм»-ийн лавлах хэрэгжилт (`Finance` · `PkgProg` · `planProgress`-ийн тайлбар иш татдаг) тул хэвээр.
 * ⚠️ Өмнөх сарын эцэс → тухайн сарын эцсийн хооронд ЛОКАЛ өдрөөр шугаман завсарлана. Өмнөх сарын цэг
 *    байхгүй = энэ сард эхэлсэн → эхлэл 0. Тухайн сарын цэг байхгүй бол сүүлийн өнгөрсөн цэг; бүх цэг
 *    ирээдүйд бол Map-д ОРОХГҮЙ (төлөвлөгөөгүй ≠ 0).
 */
export function housingPlanOf(
  byBagts: Map<string, Array<{ label: string; pct: number }>>,
  now: Date,
  atOf?: ReadonlyMap<string, string>,
): Map<string, number> {
  /** «YYYY-MM-DD» → локал огноо; эвдэрсэн бол `null` (→ `now`) */
  const parse = (d: string | undefined): Date | null => {
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
    const x = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
    return Number.isNaN(x.getTime()) ? null : x;
  };
  const out = new Map<string, number>();
  for (const [k, pts] of byBagts) {
    const at = parse(atOf?.get(k)) ?? now;
    const y = at.getFullYear();
    const m = at.getMonth();
    const cur = `${y}-${pad2(m + 1)}`;
    const pd = new Date(y, m, 0);
    const prev = `${pd.getFullYear()}-${pad2(pd.getMonth() + 1)}`;
    const fr = at.getDate() / new Date(y, m + 1, 0).getDate();
    let p1: number | null = null;
    let p0: number | null = null;
    let past: { label: string; pct: number } | null = null;
    for (const pt of pts) {
      if (pt.label === cur) p1 = pt.pct;
      else if (pt.label === prev) p0 = pt.pct;
      if (pt.label < cur && (!past || pt.label > past.label)) past = pt;
    }
    if (p1 != null) out.set(k, (p0 ?? 0) + (p1 - (p0 ?? 0)) * fr);
    else if (past) out.set(k, past.pct);
  }
  return out;
}

/**
 * Орон сууцны багцын хувь — ЗӨВХӨН дор хаяж НЭГ блок нь хэмжигдсэн (тайлагнасан) багц.
 *
 * ⚠️ 2026-10-09 (аудит): `blockProgress.pkgProgressOf` нь нэг ч блок тайлагнаагүй багцад `{pct: 0, blocks: 0}`
 *    өгдөг — дашбоардад зөв (0%), гэвч нэгтгэлд Excel-ийн утгыг 0-ээр дарна. Хэмжилт огт байхгүй багц нь
 *    «эх сурвалжгүй» (`null` → Excel-ийн утга үлдэнэ), 0 БИШ.
 */
export function measuredHousing(
  housing: Map<string, number>,
  blocks: Iterable<[string, { overall: number } | null | undefined]>,
): Map<string, number> {
  const seen = new Set<string>();
  for (const [key, c] of blocks) {
    if (c == null || !Number.isFinite(c.overall)) continue;
    const cut = key.indexOf('|');
    seen.add(cut < 0 ? key : key.slice(0, cut));
  }
  return new Map([...housing].filter(([k]) => seen.has(k)));
}

/**
 * @param fresh `true` = КЭШГҮЙ (бичих зам — `syncNegtgel`; одоогийн хүснэгт зөвхөн уншигддаг).
 * ⚠️ 2026-10-13: Cashflow ба хуваарийн муруй ЭХ БИШ болов (Excel V3 тэдгээрийн утгыг агуулна) — хоёр хүнд
 *    уншилт хасагдав. Үлдсэн эх: газар · 01-ийн батлагдсан гүйцэтгэл (блоктой ба блокгүй).
 */
export async function loadNegSources(fresh = false): Promise<NegSources> {
  const [{ loadLandPct }, L, B, { PKGS }] = await Promise.all([
    import('@/lib/negtgel'),
    import('@/lib/live'),
    import('@/lib/blockProgress'),
    import('@/modules/sheet/bagts.pkg'),
  ]);
  /* ⚠️ 2026-10-01: `allSettled` — АЛЬ эх унасныг нэрлэнэ (`NegSourceError.failed`). Нэг нь ч унавал БҮХЭЛДЭЭ
     шиднэ — хагас эхээр бодвол унасан эхийн мөрүүд Excel-ийн утгаараа үлдэж шинэ тоотой холилдоно. */
  const names = [tr('Газар чөлөөлөлт'), tr('Гүйцэтгэл бөглөх'), tr('Блокийн гүйцэтгэл'), tr('Блокгүй багцын гүйцэтгэл')];
  const res = await Promise.allSettled([
    loadLandPct(),
    fresh ? L.loadFillPkgProgressFresh() : L.loadFillPkgProgress(),
    /* ⚠️ `housing`-тай НЭГ кэш (`fillPkgProgressRaw` дотор ижил дуудлага) — хэмжигдсэн эсэхийг шалгахад */
    fresh ? B.loadBlockProgressFresh() : B.loadBlockProgress(),
    B.loadInfraProgress(fresh),
  ]);
  const bad = names.filter((_, i) => res[i].status === 'rejected');
  if (bad.length) {
    const first = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw new NegSourceError(bad, first?.reason);
  }
  const land = settledValue(res[0]);
  const blocks = settledValue(res[2]);
  /* ⚠️ 2026-10-14: блокийн хуваарь унавал барилгын задаргаа л алгасагдана (багцын мөр хэвээр системийн) —
     бүхэлд нь шидэхгүй (`housingBreakdown` хуваарьгүй бол `null`). */
  const blockUni = await B.loadBlockUniverse().catch((e: unknown) => {
    console.warn('[negtgel] блокийн хуваарь уншигдсангүй — барилгын задаргаа Excel-ийн утгаар', e);
    return undefined;
  });
  const infraP = settledValue(res[3]);
  const infra = new Map<string, number>();
  const infraPkgs = new Set<string>();
  for (const p of PKGS) {
    if (p.floors != null) continue;
    const v = infraP.get(bagtsKey(p.group));
    if (!v) continue;
    const no = pkgNo(p.group);
    infraPkgs.add(no);
    if (v.blocks > 0) infra.set(no, v.pct);
  }
  return {
    land,
    /* ⚠️ 2026-10-09: тайлагнаагүй багцын 0%-ийг Excel-ийн утга дээр дарахгүй (`measuredHousing`-ийн ⚠️) */
    housing: measuredHousing(settledValue(res[1]), blocks),
    housingPkgs: new Set(PKGS.filter((p) => p.floors != null).map((p) => bagtsKey(p.group))),
    infra,
    infraPkgs,
    blocks,
    blockUni,
    partial: [],
  };
}

/* ═══════════════ ТООЦОО ═══════════════ */

export type NegCalcRow = NegRaw & {
  /** Гүйцэтгэл СИСТЕМЭЭС ирсэн (эсвэл доод мөр нь) — Excel-ийн утгаас өөр */
  auto: boolean;
  /** Хүнд ойлгуулах эх сурвалжийн тайлбар */
  how: string;
};

/**
 * СИСТЕМИЙН БОДИТ ГҮЙЦЭТГЭЛ (0–100) — Excel-д ч ГАРААР бичигддэг мөрүүдэд (файлын толгойг үз).
 * `null` = энэ мөрөнд системийн эх байхгүй/хэмжилтгүй → Excel-ийн утга.
 */
function liveAct(rows: NegRaw[], i: number, parent: number[], src: NegSources): { act: number; how: string; pk?: string } | null {
  const r = rows[i];
  const chain: string[] = [];
  for (let k = i; k >= 0; k = parent[k]) chain.push(nkey(rows[k].name));
  const name = nkey(r.name);
  /* Газар чөлөөлөлт — үе шатны мөр ба «5.1.1» (Бэлтгэл ажил доторх) */
  if (name === nkey('Газар чөлөөлөлт') && (r.depth === 1 || chain.includes(nkey('Бэлтгэл ажил')))) {
    return src.land == null ? null : { act: src.land, how: tr('Газар чөлөөлөлт хэсгээс') };
  }
  /* ⚠️ ЗӨВХӨН «Барилга угсралт ажил» (5.2) салаа — «5.1.3 Талбайн бэлтгэл», зураг төсөл, зөвшөөрөл … дотор ч
     ижил багцын мөр бий; тэдгээр нь биет гүйцэтгэл БИШ. */
  if (!r.bagts || !chain.includes(nkey('Барилга угсралт ажил'))) return null;
  /* Орон сууц — «Орон сууцны хороолол барилга угсралт»-ын ШУУД хүүхэд (багцын мөр) */
  const p = parent[i];
  if (p >= 0 && nkey(rows[p].name) === nkey('Орон сууцны хороолол барилга угсралт')) {
    const k = bagtsKey(r.bagts);
    if (src.housingPkgs?.has(k)) {
      const v = src.housing.get(k);
      return v == null ? null : { act: v, how: tr('01. Гүйцэтгэл — батлагдсан биет хувь (блокуудаар)'), pk: k };
    }
  }
  /* Блокгүй багц */
  const no = pkgNo(r.bagts);
  if (no && src.infraPkgs?.has(no)) {
    const v = src.infra?.get(no);
    return v == null ? null : { act: v, how: tr('Гүйцэтгэл бөглөх — батлагдсан биет хувь (блокгүй багц)') };
  }
  return null;
}

/**
 * ОРОН СУУЦНЫ БАГЦЫН БАРИЛГЫН ЗАДАРГАА — «Гүйцэтгэлийн хувь» (S) СИСТЕМЭЭС, «Хэсэгт эзлэх» (F) Excel-ийнх.
 *
 * ⚠️ 2026-10-14 (хэрэглэгч: «нэгтгэл гүйцэтгэл өөрөө өөрийгөө update хийнэ — 5.2.1-ээс доош задаргаа тус
 *    бүрийн тоог систем update хийнэ»). Excel V3-д барилгын мөрийн S нь ГАРААР хуулсан нэг тоо (Багц-1-ийн 20
 *    барилга бүгд 25.72% — багцын хуучин дундаж), багцын мөр нь (28.23%) түүнээс бодогддоггүй тул доод мөрүүдийн
 *    нийлбэр эцэгтэйгээ таардаггүй байв.
 * ⚠️ 2026-10-15 (хэрэглэгч: «Хэсэгт эзлэх хувь Excel-ийн утгаар явна, Excel дээр ямар томьёо байна тэр
 *    ажиллана»): F нь Excel-ийн (блокийн төсөв ÷ багцын төсөв) — 10-14-ний «блокуудад тэнцүү жин» БУЦААГДАВ.
 *    Тиймээс багцын мөр нь 01-ийн энгийн дунджаас (дашбоард 12) бага зэрэг ЗӨРНӨ — санаатай: нэгтгэл нь Excel-ийн
 *    томьёогоор (төсвөөр жигнэж) бодно.
 *
 * ДҮРЭМ:
 *   · Барилгын мөр (C багана «5/1» = `buildingKey`) → S = тэр блокийн батлагдсан `overall`; хуваарьт байгаа ч
 *     тайлагнаагүй бол 0 (01-ийн багцын дундажтай ижил дүрэм).
 *   · Блокт таараагүй мөр (жиш. Багц-4.1 «Бүгд» газар шороо) — системд эх байхгүй → Excel-ийн S ХЭВЭЭР.
 *   · Багцын мөр = Σ F × S (Excel-ийн томьёо, `computeNegAuto`-ийн 2-р алхам).
 * ⚠️ Нэг ч мөр блокт таараагүй бол `null` — багцын мөр 01-ийн багцын хувиараа үлдэнэ.
 */
function housingBreakdown(
  rows: NegRaw[], i: number, kids: number[][], src: NegSources, pk: string,
): Array<{ k: number; act: number; how: string }> | null {
  const uni = src.blockUni?.get(pk);
  const blocks = src.blocks;
  if (!uni?.length || !blocks) return null;
  const want = new Set(uni);
  const out: Array<{ k: number; act: number; how: string }> = [];
  for (const k of kids[i]) {
    if (rows[k].outside) continue;
    const key = buildingKey(rows[i].bagts, rows[k].bagts);
    if (!want.has(key)) continue;
    const c = blocks.get(key);
    const ok = c != null && Number.isFinite(c.overall);
    out.push({
      k,
      act: ok ? c.overall : 0,
      how: ok
        ? tr('01. Гүйцэтгэл — блокийн батлагдсан биет хувь')
        : tr('01. Гүйцэтгэл — блок тайлагнаагүй (0%, багцын дундажтай ижил дүрэм)'),
    });
  }
  return out.length ? out : null;
}

/**
 * БҮХ МӨРИЙГ БОДНО — цэвэр функц (тест: `negtgel.check.mjs`).
 *
 * 1. Системийн гүйцэтгэлтэй мөр (`liveAct`) — утгаа ТОГТООНО (pinned; өөрийн хүүхдүүдээс бодогдохгүй, Excel-д
 *    ч тэр мөр гараар бичигддэг).
 * 2. Утга нь ӨӨРЧЛӨГДСӨН мөрийн өвгүүд — Excel-ийн томьёо: Σ (хүүхдийн F × хүүхдийн S), `outside` хасна.
 *    Өөрчлөлтгүй салаа Excel-ийн утгаа ЯГ хадгална (толгойн ⚠️ — Excel-ийн мужийн алдаа).
 * 3. Гүйцэтгэл өөрчлөгдсөн мөрийн биелэлт: T/U/V/W = S ÷ N/O/P/R (0 бол 0; аль нэг нь хоосон бол хоосон).
 * 1б. Орон сууцны багцын барилгын мөрүүд (`housingBreakdown`) — S системээс (F Excel-ийнх); багцын мөр нь
 *    тэгвэл ТОГТООГДОХГҮЙ, 2-р алхмаар Σ F × S болно (доод мөрийн нийлбэр эцэгтэйгээ таарна).
 */
export function computeNegAuto(rows: NegRaw[], src: NegSources): NegCalcRow[] {
  const { parent, kids } = treeOf(rows.map((r) => r.depth));
  const out: NegCalcRow[] = rows.map((r) => ({ ...r, auto: false, how: tr('Нэгтгэл гүйцэтгэл (Excel)') }));
  const pinned = new Array<boolean>(rows.length).fill(false);
  const changed = new Array<boolean>(rows.length).fill(false);
  /** Задаргаатай багцын мөр — хүүхдийн S өөрчлөгдөөгүй ч Σ F × S-ээр ЗААВАЛ дахин бодно (1б) */
  const roll = new Array<boolean>(rows.length).fill(false);

  rows.forEach((_, i) => {
    const v = liveAct(rows, i, parent, src);
    if (!v) return;
    const o = out[i];
    const nv = r6(v.act / 100);
    pinned[i] = true;
    o.how = v.how;
    o.auto = true;
    if (nv != null && (o.act == null || Math.abs(nv - o.act) > 1e-6)) {
      o.act = nv;
      changed[i] = true;
    }
    /* 1б. Барилгын задаргаа — багцын мөрийг доод мөрүүдээс нь бодуулна (`housingBreakdown`-ийн ⚠️) */
    const bd = v.pk ? housingBreakdown(rows, i, kids, src, v.pk) : null;
    if (!bd) return;
    pinned[i] = false;
    roll[i] = true;
    for (const b of bd) {
      const c = out[b.k];
      const na = r6(b.act / 100);
      pinned[b.k] = true;
      c.auto = true;
      c.how = b.how;
      if (na != null && (c.act == null || Math.abs(na - c.act) > 1e-6)) {
        c.act = na;
        changed[b.k] = true;
      }
    }
  });

  /* Өвгүүд — мод нь outline (хүүхэд эцгийнхээ ДАРАА) тул ардаас нэг удаа гүйхэд хүүхэд үргэлж өмнө нь бодогдсон */
  const dirty = new Array<boolean>(rows.length).fill(false);
  changed.forEach((c, i) => {
    if (!c) return;
    for (let k = parent[i]; k >= 0; k = parent[k]) dirty[k] = true;
  });
  roll.forEach((r, i) => {
    if (!r) return;
    for (let k = i; k >= 0; k = parent[k]) dirty[k] = true;
  });
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!dirty[i] || pinned[i]) continue;
    const use = kids[i].filter((k) => !rows[k].outside);
    if (!use.some((k) => out[k].act != null)) continue;
    /* ⚠️ Хоосон хүүхэд 0 — Excel-ийн SUMPRODUCT-тэй ижил; хуваагч Σw БИШ */
    const nv = r6(use.reduce((a, k) => a + (rows[k].w ?? 0) * (out[k].act ?? 0), 0));
    const o = out[i];
    o.auto = true;
    o.how = tr('Доод мөрүүдээс (жингээр) — системийн гүйцэтгэлтэй');
    if (nv != null && (o.act == null || Math.abs(nv - o.act) > 1e-6)) {
      o.act = nv;
      changed[i] = true;
    }
  }

  /* БИЕЛЭЛТ — гүйцэтгэл өөрчлөгдсөн мөрд л (бусад нь Excel-ийн утга) */
  const perf = (act: number | null, plan: number | null) => (plan == null || act == null ? null : plan ? r6(act / plan) : 0);
  out.forEach((o, i) => {
    if (!changed[i]) return;
    o.perfG = perf(o.act, o.planG);
    o.perfGch = perf(o.act, o.planGch);
    o.perfGu = perf(o.act, o.planGu);
    o.perfWk = perf(o.act, o.planPw);
  });
  return out;
}

/**
 * Төслийн нийт гүйцэтгэл (0–1) = Σ 1-р түвшний жин × гүйцэтгэл (Excel-ийн 6-р мөрийн S томьёо).
 * ⚠️ 2026-09-25: жинтэй (p > 0) 1-р түвшний мөрийн гүйцэтгэл `null` бол нийт нь `null` (null ≠ 0).
 */
export const projectTotal = (rows: Array<{ depth: number; p: number | null; act: number | null }>): number | null => {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    if (r.depth !== 1 || r.p == null) continue;
    if (r.act == null) {
      if (r.p > 0) return null;
      continue;
    }
    w += r.p;
    s += r.p * r.act;
  }
  return w > 0 ? s : null;
};

/**
 * ҮЙЛЧИЛГЭЭ РҮҮ БИЧИХ ЗАСВАРУУД — зөвхөн ӨӨРЧЛӨГДСӨН талбар, хүснэгтийн масштабаар (`SCALE`).
 *
 * ⚠️ Жин, нэр, код, багцыг ХЭЗЭЭ Ч бичихгүй. `null`-оор утга дарахгүй.
 * ⚠️ 2026-10-13: одоогийн хүснэгт ЗӨВХӨН уншигддаг (`TUSUL_NEGTGEL.readOnly`) — бичилт ажиллахгүй; функц нь
 *    бичигдэх хүснэгт рүү буцах үед бэлэн (тест).
 */
export function negDiff(stored: NegRaw[], calc: NegCalcRow[]): Record<string, unknown>[] {
  const ups: Record<string, unknown>[] = [];
  stored.forEach((s, i) => {
    const c = calc[i];
    const u: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(VAL_FIELD)) {
      const nv = c[k as keyof NegVals];
      const ov = s[k as keyof NegVals];
      if (nv == null) continue;
      if (ov == null || Math.abs(nv - ov) > 1e-6) u[f] = r6(nv * SCALE);
    }
    if (Object.keys(u).length) ups.push({ [TUSUL_NEGTGEL.oid]: s.oid, ...u });
  });
  return ups;
}

/* ═══════════════ АВТОМАТ ШИНЭЧЛЭЛТ (хүснэгт рүү бичих) ═══════════════ */

/** Нэг мөрийн нэг талбар нэг дор ИНГЭЭС их (0–1 нэгжээр = 20 нэгж) өөрчлөгдвөл бичихгүй */
const ROW_GAP = 0.2;
/** Төслийн нийт нэг дор ИНГЭЭС их өөрчлөгдвөл ЮУ Ч бичихгүй */
const TOTAL_GAP = 0.2;
/** ⚠️ Хамгаалалт ЗӨВХӨН гүйцэтгэл ба төлөвлөгөөнд — биелэлт нь харьцаа тул жижиг төлөвлөгөөтэй мөрд үсэрнэ */
const GUARD: (keyof NegVals)[] = ['act', 'planG', 'planGch', 'planGu'];

export type NegGuardRow = { oid: number; code: string; name: string; field: keyof NegVals; from: number; to: number };

/** Бичих төлөвлөгөө — цэвэр функц (тест: `negtgel.check.mjs`) */
export type NegSyncPlan = {
  /** Бичих засварууд — хамгаалалтад ОРООГҮЙ мөрүүд */
  ups: Record<string, unknown>[];
  /** Нэг дор хэт их өөрчлөгдсөн тул АЛГАССАН мөрүүд */
  blocked: NegGuardRow[];
  /** Төслийн нийтийн өөрчлөлт (хоёулаа мэдэгдэж байвал) */
  total: { from: number; to: number } | null;
  /** Нийт нь `TOTAL_GAP`-аас их өөрчлөгдсөн → ЮУ Ч бичихгүй */
  totalBlocked: boolean;
};

/**
 * ХАМГААЛАЛТТАЙ ЗАСВАРУУД — мөр бүр ба нийтэд ±0.2; алгассан мөрийн ӨВӨГ ДЭЭДЭС ч бичигдэхгүй
 * (тэдний утга алгассан мөрийн ШИНЭ утгаар бодогдсон). `force` — super-ийн нэг удаагийн баталгаа.
 */
export function planNegSync(stored: NegRaw[], calc: NegCalcRow[], force = false): NegSyncPlan {
  const a = projectTotal(stored);
  const b = projectTotal(calc);
  const total = a != null && b != null ? { from: a, to: b } : null;
  const all = negDiff(stored, calc);
  if (force) return { ups: all, blocked: [], total, totalBlocked: false };
  const totalBlocked = total != null && Math.abs(total.to - total.from) > TOTAL_GAP;
  const blocked: NegGuardRow[] = [];
  const bad = new Set<number>();
  stored.forEach((sr, i) => {
    const c = calc[i];
    for (const k of GUARD) {
      const ov = sr[k];
      const nv = c[k];
      /* ⚠️ Хоосон нүдийг анх бөглөх нь «үсрэлт» БИШ */
      if (ov == null || nv == null || Math.abs(nv - ov) <= ROW_GAP) continue;
      blocked.push({ oid: sr.oid, code: sr.code, name: sr.name, field: k, from: ov, to: nv });
      bad.add(i);
    }
  });
  if (bad.size) {
    const { parent } = treeOf(stored.map((r) => r.depth));
    for (const i of [...bad]) for (let k = parent[i]; k >= 0; k = parent[k]) bad.add(k);
  }
  const skip = new Set([...bad].map((i) => stored[i].oid));
  const ups = totalBlocked ? [] : all.filter((u) => !skip.has(u[TUSUL_NEGTGEL.oid] as number));
  return { ups, blocked, total, totalBlocked };
}

/** Синкийн төлөв — «Нэгтгэл гүйцэтгэл» таб мэдэгдэл харуулна */
export type NegSyncState =
  /** Бичих эрхгүй (super биш / нэвтрээгүй) эсвэл хүснэгт зөвхөн уншигддаг — зөвхөн уншина */
  | { kind: 'off' }
  | { kind: 'ok'; n: number; at: number }
  /** Хамгаалалт бичилтийг (бүгдийг эсвэл заримыг) зогсоосон */
  | { kind: 'guard'; n: number; at: number; blocked: NegGuardRow[]; total: { from: number; to: number } | null; totalBlocked: boolean }
  | { kind: 'error'; at: number; reason: string };

/**
 * БИЧИХ ЭРХ — ЗӨВХӨН кодын хатуу super (`roleForUser`). Хэрэглэгч тодорхойгүй бол БИЧИХГҮЙ (fail-closed).
 */
export const canSyncNegtgel = (user: string | null = currentUser()): boolean =>
  roleForUser(user) === 'super';

/** ⚠️ Нэг хөтөчөөс 10 минутад нэгээс олон удаа бичихгүй */
const SYNC_GAP = 10 * 60_000;
let lastSync = 0;
let lastState: NegSyncState | null = null;
let syncing: Promise<NegSyncState> | null = null;

/** Тестэд орлуулах оролт/гаралт — анхдагч нь амьд үйлчилгээ */
export type NegSyncIo = {
  user?: () => string | null;
  /** ШИНЭ уншилт: хүснэгт + кэшгүй эх */
  load?: () => Promise<{ stored: NegRaw[]; src: NegSources }>;
  /** Бичсэн мөрийн тоо */
  write?: (ups: Record<string, unknown>[]) => Promise<number>;
};

const liveLoad = async () => {
  const [stored, src] = await Promise.all([loadNegRaw(), loadNegSources(true)]);
  return { stored, src };
};
const liveWrite = async (ups: Record<string, unknown>[]): Promise<number> => {
  const { tokenParam, ensureFreshToken, isTokenError } = await import('@/lib/authToken');
  /* ⚠️ 2026-09-29 (аудит 10): богино хугацаатай PKCE токеныг бичихийн ӨМНӨ шинэчилж, токены алдаанд НЭГ удаа
     дахин оролдоно (токены алдаа хүсэлтийг БҮХЭЛД нь татгалздаг тул аюулгүй). */
  await ensureFreshToken();
  if (!tokenParam().token) throw new Error(tr('Нэвтрэлтийн токен алга — бичсэнгүй'));
  const { applyAll } = await import('@/lib/tableWrite');
  try {
    return (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates: ups })).n;
  } catch (e) {
    if (!isTokenError((e as { code?: unknown })?.code, (e as Error)?.message)) throw e;
    await ensureFreshToken(true);
    return (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates: ups })).n;
  }
};

/** Сүүлийн синкийн төлөв (энэ хөтөчид) */
export const negSyncState = (): NegSyncState | null => lastState;

/**
 * БОДСОН УТГЫГ ХҮСНЭГТ РҮҮ БИЧНЭ — хүн оролцохгүй.
 *
 * ⚠️⚠️ 2026-10-13: одоогийн хүснэгт (`Negtgel_guitsetgel_1013`) ЗӨВХӨН уншигддаг (`TUSUL_NEGTGEL.readOnly`) —
 *    амьд бичигчтэй (`io.write` өгөөгүй) дуудлага ҮРГЭЛЖ `off`. Бодсон утга дэлгэцэнд л харагдана.
 * ⚠️ ЭРХ: ЗӨВХӨН super. ШИНЭ өгөгдлөөр (кэшгүй эх) бодож зөвхөн ӨӨРЧЛӨГДСӨН талбарыг бичнэ. Хамгаалалт:
 *    `planNegSync`. Нэг хөтөчөөс 10 минутад ≤1 (`force` давна).
 */
export function syncNegtgel(opts: { force?: boolean } = {}, io: NegSyncIo = {}): Promise<NegSyncState> {
  if (TUSUL_NEGTGEL.readOnly && !io.write) return Promise.resolve({ kind: 'off' });
  if (!canSyncNegtgel((io.user ?? currentUser)())) return Promise.resolve({ kind: 'off' });
  /* ⚠️ 2026-09-25: `force` явж буй ЭНГИЙН синкийн үр дүнд ЗАЛГИГДАХГҮЙ — дуустал хүлээгээд дахин ажиллуулна */
  if (syncing) {
    if (!opts.force) return syncing;
    return syncing.catch(() => null).then(() => syncNegtgel(opts, io));
  }
  if (!opts.force && lastState && Date.now() - lastSync < SYNC_GAP) return Promise.resolve(lastState);
  lastSync = Date.now();
  const mine = (async (): Promise<NegSyncState> => {
    let st: NegSyncState;
    try {
      const { stored, src } = await (io.load ?? liveLoad)();
      const calc = computeNegAuto(stored, src);
      const plan = planNegSync(stored, calc, !!opts.force);
      const n = plan.ups.length ? await (io.write ?? liveWrite)(plan.ups) : 0;
      st = plan.blocked.length || plan.totalBlocked
        ? { kind: 'guard', n, at: Date.now(), blocked: plan.blocked, total: plan.total, totalBlocked: plan.totalBlocked }
        : { kind: 'ok', n, at: Date.now() };
      if (st.kind === 'guard') console.warn('[negtgel] хамгаалалт — зарим/бүх мөр бичигдсэнгүй', plan);
    } catch (e) {
      console.warn('[negtgel] автомат шинэчлэл бичигдсэнгүй', e);
      st = { kind: 'error', at: Date.now(), reason: e instanceof Error ? e.message : String(e) };
      /* ⚠️ 2026-09-25: УНАЛТ 10 минут КЭШЛЭГДЭХГҮЙ — дараагийн кэш хоосрох мөчид дахин оролдоно */
      lastSync = 0;
    }
    lastState = st;
    return st;
  })();
  syncing = mine;
  void mine.finally(() => { if (syncing === mine) syncing = null; });
  return mine;
}

/** ⚠️ Зөвхөн тест — модуль-түвшний төлөвийг цэвэрлэнэ */
export function _resetNegSync(): void {
  lastSync = 0;
  lastState = null;
  syncing = null;
}
