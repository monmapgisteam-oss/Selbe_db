/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) мод ба түүний бөглөлт.
 */
import { queryFeatures, queryStats, count } from '@/lib/query';
import type { LiveProgress } from '@/lib/projectPlanInputs';

const loadLiveProgressLazy = (): Promise<ReadonlyMap<number, LiveProgress> | null> =>
  import('@/lib/projectPlanInputs').then((m) => m.loadLiveProgress()).catch(() => null);
import {
  CF_MONTH, TUSUL_NEGTGEL, CASHFLOW_NEW, PARCEL_LEFT, parcelClearedWhere,
  CF_WORK_WHERE,
} from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import { register } from '@/lib/dataBus';
import type { NegRaw, NegSources, NegSyncState } from '@/lib/negtgelAuto';

const F = TUSUL_NEGTGEL.fields;
const CF = CASHFLOW_NEW.fields;
const ST = CASHFLOW_NEW.stages;

/* ═══════════════ МОДНЫ МӨР ═══════════════ */

export type NegtgelRow = {
  oid: number;
  /** Ажлын задаргааны код — «1.2.1.1»; дээд мөрд хоосон */
  code: string;
  name: string;
  /** Кодын цэгээр тодорхойлогдох ГҮН (0 = төслийн нийт мөр) */
  depth: number;
  /** Багцын дугаар («Багц-1») — зөвхөн шинэ эхэд, навч мөрд */
  bagts?: string;
};

const numOrNull = (v: unknown): number | null => (
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
);

/** Кодын гүн — «1» = 1, «1.2» = 2, «1.2.1.1» = 4; кодгүй мөр = 0 */
export const negtgelDepth = (code: string): number => {
  const c = code.trim();
  return c === '' ? 0 : c.split('.').filter((x) => x !== '').length;
};

/**
 * ЭЦЭГ МӨРИЙН ИНДЕКС — БАЙРЛАЛ ба ГҮНЭЭР, кодоор БИШ.
 */
export function negtgelTree(rows: NegtgelRow[]): { parent: number[]; kids: number[][] } {
  const parent = new Array<number>(rows.length).fill(-1);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length > 0 && rows[stack[stack.length - 1]].depth >= r.depth) stack.pop();
    parent[i] = stack.length > 0 ? stack[stack.length - 1] : -1;
    stack.push(i);
  });
  const kids: number[][] = rows.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  return { parent, kids };
}

/** Модны бүх мөрийг үйлчилгээний мөрийн дарааллаар */
export async function loadNegtgel(): Promise<NegtgelRow[]> {
  const rows = await queryFeatures(TUSUL_NEGTGEL.url, {
    outFields: [TUSUL_NEGTGEL.oid, F.code, F.name],
    orderBy: TUSUL_NEGTGEL.oid,
  });
  return rows.map((r) => {
    const code = String(r[F.code] ?? '').trim();
    return {
      oid: Number(r[TUSUL_NEGTGEL.oid] ?? 0),
      code,
      name: String(r[F.name] ?? '').replace(/\s+/g, ' ').trim(),
      depth: negtgelDepth(code),
    };
  });
}

/* ═══════════════ БӨГЛӨЛТИЙН ЭХ — ГЭРЭЭНҮҮД ═══════════════ */

export type CfStageRow = {
  turul: string;
  pkg2: string;
  detail: string;
  budget: number;
  /** Шат бүрийн гүйцэтгэл (0–100) — хэмжилтгүй бол `null` */
  pct: Record<string, number | null>;
};

export async function loadCfStages(): Promise<CfStageRow[]> {
  const [rows, live] = await Promise.all([queryFeatures(CASHFLOW_NEW.url, {
    where: CF_WORK_WHERE,
    outFields: [CF.type, CF.project, CF.pkg2, CF.detail, CF.budget, CF_MONTH.id],
    orderBy: CASHFLOW_NEW.oid,
  }), loadLiveProgressLazy()]);
  const FIELDS = [ST.tezu, ST.design, ST.land, ST.permit, ST.tender, ST.build];
  return rows.map((r) => {
    const id = numOrNull(r[CF_MONTH.id]);
    const lp = live && id != null ? live.get(id) ?? null : null;
    return {
      turul: String(r[CF.type] ?? '') || String(r[CF.project] ?? ''),
      pkg2: String(r[CF.pkg2] ?? ''),
      detail: String(r[CF.detail] ?? ''),
      budget: Number(r[CF.budget] ?? 0) || 0,
      pct: Object.fromEntries(FIELDS.map((f) => [f, lp ? lp.stages[f] ?? null : null])),
    };
  });
}

/** ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ЯВЦ — «Газар чөлөөлөлт» хэсэгтэй ЯГ ижил тоо.
 */
export async function loadLandPct(): Promise<number | null> {
  const [all, cleared] = await Promise.all([
    queryStats(PARCEL_LEFT.url, [count(PARCEL_LEFT.oid, 'n')], '1=1'),
    queryStats(PARCEL_LEFT.url, [count(PARCEL_LEFT.oid, 'n')], parcelClearedWhere()),
  ]);
  const n = Number(all.n ?? 0);
  if (!n) return null;
  return (Number(cleared.n ?? 0) / n) * 100;
}

/* ═══════════════ ЗУРАГЛАЛ ═══════════════ */

/** Харьцуулалтад — зай, цэг, хаалт, зураасны ялгааг үл тоомсорлоно */
const key = (v: unknown): string => String(v ?? '')
  .replace(/[–—−]/g, '-')
  .toLowerCase()
  .replace(/[\s.,()/"'«»-]/g, '');

/**
 * ХЭСЭГ (depth 1) → гэрээний ШАТНЫ ТАЛБАР.
 */
const SECTION_FIELD: Record<string, string> = {
  [key('ТЭЗҮ')]: ST.tezu,
  [key('Ажлын зураг төсөл')]: ST.design,
  [key('Газар чөлөөлөлт')]: ST.land,
  [key('Зөвшөөрөл')]: ST.permit,
  [key('Сонгон шалгаруулалт')]: ST.tender,
  [key('Барилга угсралт')]: ST.build,
};

/**
 * ХЭСГИЙН ЖИН — «Төсөлд эзлэх хувь» (2026-09-08, ХЭРЭГЛЭГЧИЙН өгсөн хуваарилалт).
 */
export const SECTION_WEIGHT: Record<string, number> = {
  [key('ТЭЗҮ')]: 5,
  [key('Ажлын зураг төсөл')]: 10,
  [key('Газар чөлөөлөлт')]: 3,
  [key('Зөвшөөрөл')]: 1,
  [key('Сонгон шалгаруулалт')]: 1,
  [key('Барилга угсралт')]: 79,
  [key('Улсын комисс, хүлээлгэн өгөх')]: 1,
};

/**
 * МОДНЫ БҮЛГИЙН НЭР → гэрээний ТӨРӨЛ (`Turul`).
 */
const TURUL_OF: Record<string, string> = {
  [key('Орон сууцны хороолол барилга угсралт')]: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт',
  [key('Цэцэрлэг, сургууль')]: 'НИЙГМИЙН ДЭД БҮТЭЦ',
  [key('Гадна зам талбай, тохижилт')]: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт',
};

/**
 * «Багц N …» → гэрээний ДЭД БАГЦ.
 */
const PKG_RULES: Array<[RegExp, (n: string) => string]> = [
  [/^багц\s*([\d.]+)\s*орон сууцны/i, (n) => `БАГЦ-${n}`],
  [/^багц\s*(\d)\s*гадна дулаан/i, (n) => `БАГЦ-5.${n}`],
  [/^багц\s*(\d)\s*гадна цахилгаан/i, (n) => `БАГЦ-6.${n}`],
];

/** Нэг мөрд тохирсон гэрээнүүд ба «яаж таарсан» */
type Hit = { idx: number[]; how: string } | null;

function ownMatch(row: NegtgelRow, cf: CfStageRow[], all: number[]): Hit {
  if (row.depth <= 1) {
    return SECTION_FIELD[key(row.name)] ? { idx: all, how: tr('бүх гэрээ') } : null;
  }
  const k = key(row.name);

  const t = TURUL_OF[k];
  if (t) {
    const idx = all.filter((j) => key(cf[j].turul) === key(t));
    if (idx.length > 0) return { idx, how: tr('төрөл: {0}', t) };
  }

  for (const [re, to] of PKG_RULES) {
    const m = row.name.match(re);
    if (m) {
      const want = key(to(m[1]));
      const idx = all.filter((j) => key(cf[j].pkg2) === want);
      if (idx.length > 0) return { idx, how: tr('дэд багц: {0}', to(m[1])) };
    }
  }

  const idx = all.filter((j) => key(cf[j].detail).startsWith(k));
  if (idx.length > 0) return { idx, how: tr('нэрээр') };
  return null;
}

/** Мөр бүрийн бодогдсон утга */
export type NegtgelCalc = {
  /** Хамрагдсан гэрээний тоо — 0 бол мөр тааралгүй үлдсэн */
  n: number;
  /** Эцэг мөрийнхөө төсөвт эзлэх хувь */
  inSection: number | null;
  /** Төслийн НИЙТ төсөвт эзлэх хувь */
  inProject: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨТ ХУВЬ — одоогоор ҮРГЭЛЖ `null`.
   */
  planPct: number | null;
  /** Тухайн шатны гүйцэтгэл — төсвөөр ЖИГНЭСЭН дундаж */
  actPct: number | null;
  /**
   * НИЙТ ТӨСӨЛД ОРУУЛЖ БУЙ ХУВЬ = `inProject × actPct ÷ 100`.
   */
  share: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨНИЙ БИЕЛЭЛТ = гүйцэтгэл ÷ төлөвлөгөө.
   */
  perf: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨ ба БИЕЛЭЛТИЙН ГУРВАН ХУВИЛБАР (шинэ эх, 2026-09-25).
   * `planPct`/`perf` нь «гэрээгээр» хувилбар; эдгээр нь үлдсэн хоёр.
   */
  planGch?: number | null;
  planGuits?: number | null;
  perfGch?: number | null;
  perfGuits?: number | null;
  /** Навч нь СИСТЕМЭЭС бодогдсон (эсвэл доод мөрүүд нь) — `negtgelAuto` */
  auto?: boolean;
  /** Эцгийнхээ нийлбэрт ОРОХГҮЙ мөр — Excel-ийн томьёонд ороогүй (`negtgelTree.NEG_TREE.outside`) */
  outside?: boolean;
  /** Урьдчилсан төсөвт өртөг, ₮ (эх хүснэгтийнх) */
  budget?: number | null;
  planNextWk?: number | null;
  planPrevWk?: number | null;
  perfWk?: number | null;
  /** Гэрээ/Хавсралт 5 — төлөвлөгөөт эхлэх/дуусах (ms) */
  ctStart?: number | null;
  ctEnd?: number | null;
  /** Гүйцэтгэгч — төлөвлөгөөт эхлэх/дуусах («YYYY-MM-DD») */
  exStart?: string;
  exEnd?: string;
  /** Бодит эхлэх/дуусах («YYYY-MM-DD») */
  actStart?: string;
  actEnd?: string;
  /** Яаж бодогдсоныг хүнд ойлгуулах тайлбар */
  how: string;
};

/**
 * МОДНЫ БҮХ МӨРИЙГ БОДНО.
 *
 * @param landPct «Газар чөлөөлөлт» мөрд хэрэглэх ГАЗРЫН МОДУЛИЙН хувь. Гэрээний
 *   `Gazar_chuluulult` талбар ч ойролцоо утга өгдөг ч хэрэглэгч «Газар
 *   чөлөөлөлт хэсгээс авна» гэж ТУСГАЙЛАН зааварласан тул тэр давамгайлна.
 */
export function computeNegtgel(
  rows: NegtgelRow[],
  cf: CfStageRow[],
  landPct: number | null,
): Map<number, NegtgelCalc> {
  const { parent, kids } = negtgelTree(rows);
  const all = cf.map((_, j) => j);
  const hits = rows.map((r) => ownMatch(r, cf, all));

  /**
   * ХАМРАГДАХ ГЭРЭЭНҮҮД — өөрийн зураглал БАЙХГҮЙ бол ХҮҮХДҮҮДЭЭСЭЭ.
   */
  const idxOf = (i: number): number[] => {
    const h = hits[i];
    if (h) return h.idx;
    const set = new Set<number>();
    for (const c of kids[i]) for (const j of idxOf(c)) set.add(j);
    return [...set];
  };
  const idx = rows.map((_, i) => idxOf(i));
  const bud = idx.map((list) => list.reduce((a, j) => a + cf[j].budget, 0));

  /**
   * ДЭД МОДНЫ ТӨСӨВ — ЗӨВХӨН НАВЧ мөрүүдийн нийлбэр.
   */
  const isLeaf = (i: number) => kids[i].length === 0;
  const sub = new Array<number>(rows.length).fill(0);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    sub[i] = isLeaf(i) ? bud[i] : 0;
    for (const c of kids[i]) sub[i] += sub[c];
    if (sub[i] === 0 && !isLeaf(i) && hits[i] && rows[i].depth >= 2) sub[i] = bud[i];
  }

  /** Тухайн мөр аль ХЭСЭГТ (depth 1) харьяалагдах вэ */
  const sectionOf = (i: number): number => {
    let k = i;
    while (parent[k] >= 0 && rows[parent[k]].depth >= 1) k = parent[k];
    return k;
  };

  const out = new Map<number, NegtgelCalc>();
  rows.forEach((r, i) => {
    const list = idx[i];
    const sec = sectionOf(i);
    const field = r.depth === 0 ? null : SECTION_FIELD[key(rows[sec].name)] ?? null;

    let actPct: number | null = null;
    let how = hits[i] ? hits[i]!.how : (list.length > 0 ? tr('хүүхдээс') : tr('эх сурвалж тодорхойгүй'));

    if (field === ST.land && landPct != null) {
      actPct = landPct;
      how = tr('Газар чөлөөлөлт хэсгээс');
    } else if (field && list.length > 0) {
      let w = 0;
      let s = 0;
      for (const j of list) {
        const p = cf[j].pct[field];
        if (p == null) continue;
        const b = cf[j].budget || 1;
        w += b;
        s += b * p;
      }
      actPct = w > 0 ? s / w : null;
    }

    const p = parent[i];

    /*
     * ТӨСӨЛД ЭЗЛЭХ ХУВЬ — хэсгийн ТОГТООСОН жинг доош нь ТӨСВӨӨР тараана.
     */
    const secW = SECTION_WEIGHT[key(rows[sec].name)] ?? null;
    let inProject: number | null = null;
    if (r.depth === 0) inProject = 100;
    else if (r.depth === 1) inProject = secW;
    else if (secW != null && sub[sec] > 0 && sub[i] > 0) inProject = (secW * sub[i]) / sub[sec];

    /*
     * НИЙТ ТӨСӨЛД ОРУУЛЖ БУЙ ХУВЬ = жин × гүйцэтгэл.
     */
    const share = inProject != null && actPct != null ? (inProject * actPct) / 100 : null;

    out.set(r.oid, {
      n: list.length,
      inSection: sub[i] > 0 && p >= 0 && sub[p] > 0 ? (sub[i] / sub[p]) * 100 : null,
      inProject,
      planPct: null,
      actPct,
      share,
      perf: null,
      how,
    });
  });

  /*
   * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ = SUMPRODUCT(Төсөлд эзлэх хувь, Гүйцэтгэлийн хувь).
   */
  let sumProduct = 0;
  rows.forEach((r) => {
    if (r.depth === 1) sumProduct += out.get(r.oid)?.share ?? 0;
  });
  const root = rows.findIndex((r) => r.depth === 0);
  if (root >= 0) {
    const c = out.get(rows[root].oid);
    if (c) {
      c.actPct = sumProduct;
      c.share = sumProduct;
      c.how = tr('Σ (төсөлд эзлэх хувь × гүйцэтгэл)');
    }
  }
  return out;
}

/**
 * ХУУЧИН ЗАМ — мод + гэрээ + газрын явцыг зэрэг татаж, БОДНО.
 */
export async function loadNegtgelComputed(): Promise<{
  rows: NegtgelRow[];
  calc: Map<number, NegtgelCalc>;
}> {
  const [rows, cf, landPct] = await Promise.all([
    loadNegtgel(),
    loadCfStages(),
    loadLandPct().catch(() => null),
  ]);
  return { rows, calc: computeNegtgel(rows, cf, landPct) };
}

/** Нэгтгэл гүйцэтгэл — харагдацад */
export type NegtgelFull = {
  rows: NegtgelRow[];
  calc: Map<number, NegtgelCalc>;
  /** `true` = системээс БОДСОН; `false` = эх унасан тул хүснэгтийн хадгалсан утга */
  live: boolean;
  /**
   * Хүснэгт рүү бичих синкийн үр дүн (2026-09-25) — таб «синк хийгдсэнгүй»
   * мэдэгдлийг эндээс харуулна. `null` = эх унасан тул синк оролдоогүй.
   */
  sync: Promise<NegSyncState> | null;
  /**
   * УНАСАН эсвэл ХЭСЭГЧЛЭН уншигдсан эх сурвалжийн нэрс (2026-10-01, «хэрэглэгч:
   * бүгдийг зас»). Хоосон = бүрэн. Хоосон биш үр дүнг КЭШЛЭХГҮЙ (`loadNegtgelFull`) —
   * таб нэрийг нь харуулж, дараагийн дуудалт дахин уншина.
   */
  failed: string[];
  tree?: 'excel' | 'code';
  stored: NegRaw[];
  src: NegSources | null;
  /**
   * ⚠️ 2026-10-29: эх — `'plan'` = «Төсөл төлөвлөгөө биелэлт» (CASHFLOW_NEW + амьд эх, `projectPlanInputs`). Тэр үед
   *    `oid` нь CASHFLOW_NEW-ийн objectid тул 187 рүү засвар нийтлэх ЗАМ ХААЛТТАЙ (`TusulNegtgel`).
   */
  source?: 'plan' | 'negtgel';
};

/**
 * «Төсөл төлөвлөгөө биелэлт» → Нэгтгэл гүйцэтгэлийн мөр (цэвэр — тестлэгдэнэ).
 * ⚠️ 2026-10-29 (хэрэглэгч: «Нэгтгэл гүйцэтгэл мөн холбогдох ёстой — өртөг, жин ч төсөл төлөвлөгөөний биелэлттэй»):
 *    бүх багана НЭГ эхээс — `computePlan`-ийн E…W (0–100 → 0–1). Огноо: H/I → гэрээ, L/M → гүйцэтгэгч, J/K → газар.
 */
export function negRowsFromPlan(plan: import('@/lib/projectPlanInputs').ProjectPlan): (NegRaw & { auto: boolean; how: string })[] {
  const fr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v / 100);
  const ymd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : new Date(v).toISOString().slice(0, 10));
  const out: (NegRaw & { auto: boolean; how: string })[] = [];
  for (const n of plan.tree.nodes) {
    const r = n.row;
    if (!r || r.objectid == null) continue;
    const v = plan.result.values.get(n);
    const live = !n.children.length && (n.phase === 'barilga' && n.sub === 'barilga' || n.phase === 'gazar');
    out.push({
      oid: r.objectid,
      code: r.dd_kod ?? '',
      name: r.ajil_uilchilgee ?? '',
      bagts: r.bagts ?? '',
      depth: n.depth,
      w: fr(v?.F),
      p: fr(v?.G),
      budget: v?.E ?? null,
      outside: n.outside,
      act: fr(v?.S), planG: fr(v?.N), planGch: fr(v?.O), planGu: fr(v?.P), planNw: fr(v?.Q), planPw: fr(v?.R),
      perfG: fr(v?.T), perfGch: fr(v?.U), perfGu: fr(v?.V), perfWk: fr(v?.W),
      ctStart: v?.H ?? null, ctEnd: v?.I ?? null,
      exStart: ymd(v?.L), exEnd: ymd(v?.M),
      actStart: ymd(v?.J), actEnd: ymd(v?.K),
      auto: live,
      how: live ? tr('Төсөл төлөвлөгөө биелэлт — системээс') : tr('Төсөл төлөвлөгөө биелэлт'),
    });
  }
  return out;
}

/**
 * Бодсон мөрүүд → табын мөр ба тооцоо (0–100). 2026-10-15: `loadNegtgelFullRaw`-оос гаргав — засварын
 * загварыг (`TusulNegtgel`) ижил замаар зурна.
 */
export function negDisplay(use: ReadonlyArray<NegRaw & { auto?: boolean; how?: string }>): { rows: NegtgelRow[]; calc: Map<number, NegtgelCalc> } {
  const pc = (v: number | null) => (v == null ? null : v * 100);
  const rows: NegtgelRow[] = [];
  const calc = new Map<number, NegtgelCalc>();
  for (const r of use) {
    rows.push({ oid: r.oid, code: r.code, name: r.name, depth: r.depth, ...(r.bagts ? { bagts: r.bagts } : {}) });
    const inProject = pc(r.p);
    const actPct = pc(r.act);
    calc.set(r.oid, {
      n: actPct == null ? 0 : 1,
      inSection: pc(r.w),
      inProject,
      planPct: pc(r.planG),
      actPct,
      share: inProject != null && actPct != null ? (inProject * actPct) / 100 : null,
      perf: pc(r.perfG),
      planGch: pc(r.planGch),
      planGuits: pc(r.planGu),
      perfGch: pc(r.perfGch),
      perfGuits: pc(r.perfGu),
      auto: r.auto ?? false,
      outside: r.outside,
      budget: r.budget,
      planNextWk: pc(r.planNw),
      planPrevWk: pc(r.planPw),
      perfWk: pc(r.perfWk),
      ctStart: r.ctStart ?? null,
      ctEnd: r.ctEnd ?? null,
      exStart: r.exStart ?? '',
      exEnd: r.exEnd ?? '',
      actStart: r.actStart ?? '',
      actEnd: r.actEnd ?? '',
      how: r.how ?? tr('Нэгтгэл гүйцэтгэл (Excel)'),
    });
  }
  return { rows, calc };
}

/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — СИСТЕМЭЭС БОДОЖ харуулна, хүснэгтийг ч шинэчилнэ
 * (2026-09-25, `negtgelAuto.ts`-ийн толгойг үз).
 */
async function loadNegtgelFullRaw(): Promise<NegtgelFull> {
  /* ⚠️ 2026-10-29: «Төсөл төлөвлөгөө биелэлт»-ээс (`negRowsFromPlan`) — 187-ийн тусдаа тооцоо зөвхөн нөөц (төлөвлөгөөний
     мөр алга / ачаалалт унасан). Хоёр таб НЭГ тоо харуулна; дашбоардын «Нэгтгэл» хувь ч үүнийг дагана. */
  try {
    const { loadProjectPlan } = await import('@/lib/projectPlanInputs');
    const plan = await loadProjectPlan();
    if (!plan.empty) {
      const use = negRowsFromPlan(plan);
      const { rows, calc } = negDisplay(use);
      return { rows, calc, live: true, sync: null, failed: plan.failed, tree: 'excel', stored: use, src: null, source: 'plan' };
    }
  } catch (e) {
    console.warn('[negtgel] «Төсөл төлөвлөгөө биелэлт» уншигдсангүй — 187-ийн тооцоогоор', e);
  }
  const A = await import('@/lib/negtgelAuto');
  const stored = await A.loadNegRaw();
  let calcRows: Awaited<ReturnType<typeof A.computeNegAuto>> | null = null;
  let sync: Promise<NegSyncState> | null = null;
  let failed: string[] = [];
  let src: NegSources | null = null;
  try {
    src = await A.loadNegSources();
    failed = src.partial ?? [];
    calcRows = A.computeNegAuto(stored, src);
    sync = A.syncNegtgel();
  } catch (e) {
    console.warn('[negtgel] системийн эх уншигдсангүй — хүснэгтийн утгаар', e);
    failed = e instanceof A.NegSourceError ? e.failed : [tr('Системийн эх')];
  }
  const use = calcRows ?? stored.map((r) => ({
    ...r, auto: false, how: tr('Нэгтгэл гүйцэтгэл (Excel)'),
  }));
  const { rows, calc } = negDisplay(use);
  return { rows, calc, live: calcRows != null, sync, failed, tree: A.negTreeSource(), stored, src: calcRows ? src : null };
}

let fullP: Promise<NegtgelFull> | null = null;
let fullAt = 0;
register(() => { fullP = null; }, ['BAGTS_SHEET', 'BUILDING', 'PARCEL_LEFT', 'TUSUL_NEGTGEL', 'CASHFLOW_NEW']);

export function dropNegtgelFull(): void {
  fullP = null;
}

/**
 * БҮРЭН үр дүн мөн эсэх — `loadNegtgelFull` ЗӨВХӨН үүнийг кэшлэнэ (2026-10-01, «хэрэглэгч:
 * бүгдийг зас»): системээс бодсон (`live`) ба хэсэгчлэн уншигдсан эхгүй (`failed` хоосон).
 */
export const negtgelComplete = (v: Pick<NegtgelFull, 'live' | 'failed'>): boolean => v.live && v.failed.length === 0;

export function loadNegtgelFull(): Promise<NegtgelFull> {
  if (!fullP || Date.now() - fullAt > 5 * 60_000) {
    fullAt = Date.now();
    const mine = loadNegtgelFullRaw();
    fullP = mine;
    mine.catch(() => { if (fullP === mine) fullP = null; });
    void mine.then((v) => { if (!negtgelComplete(v) && fullP === mine) fullP = null; }, () => {});
  }
  return fullP;
}

/**
 * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ = Σ (1-р түвшний төсөлд эзлэх × гүйцэтгэл) ÷ 100.
 */
export function negtgelProjectPct(
  rows: NegtgelRow[],
  calc: Map<number, NegtgelCalc>,
): number | null {
  let w = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.depth !== 1) continue;
    const c = calc.get(r.oid);
    if (!c || c.inProject == null) continue;
    if (c.actPct == null) {
      if (c.inProject > 0) return null;
      continue;
    }
    w += c.inProject;
    sum += (c.inProject * c.actPct) / 100;
  }
  return w > 0 ? sum : null;
}

/** Төслийн нийт гүйцэтгэл — шууд ачаалж бодно (индикаторуудад) */
export async function loadNegtgelPct(): Promise<number | null> {
  const { rows, calc } = await loadNegtgelFull();
  return negtgelProjectPct(rows, calc);
}

/* ═══════════════ ТӨСЛИЙН НЭГДСЭН ГҮЙЦЭТГЭЛ ═══════════════ */

/** `stageProjectPct`-д хэрэгтэй ХАМГИЙН БАГА мэдээлэл */
export type StageRow = { budget: number; pct: Record<string, number | null> };

/**
 * ТӨСЛИЙН НЭГДСЭН ГҮЙЦЭТГЭЛ = Σ (хэсгийн жин × хэсгийн гүйцэтгэл) ÷ 100.
 *
 * @param landPct «Газар чөлөөлөлт» шатны хувь — ГАЗРЫН МОДУЛИАС (хэрэглэгчийн
 *   заавар). `null` бол гэрээний `Gazar_chuluulult` талбарт шилжинэ.
 */
export function stageProjectPct(rows: StageRow[], landPct: number | null): number | null {
  /** Нэг шатны төсвөөр жигнэсэн дундаж */
  const stage = (field: string): number | null => {
    let w = 0;
    let s = 0;
    for (const r of rows) {
      const p = r.pct?.[field] ?? null;
      if (p == null) continue;
      const b = r.budget || 1;
      w += b;
      s += b * p;
    }
    return w > 0 ? s / w : null;
  };

  const FIELD: Array<[string, string]> = [
    [key('ТЭЗҮ'), ST.tezu],
    [key('Ажлын зураг төсөл'), ST.design],
    [key('Газар чөлөөлөлт'), ST.land],
    [key('Зөвшөөрөл'), ST.permit],
    [key('Сонгон шалгаруулалт'), ST.tender],
    [key('Барилга угсралт'), ST.build],
  ];

  let sum = 0;
  let seen = 0;
  for (const [k, field] of FIELD) {
    const w = SECTION_WEIGHT[k] ?? 0;
    const p = field === ST.land && landPct != null ? landPct : stage(field);
    if (p != null) { sum += (w * p) / 100; seen += w; }
  }
  return seen > 0 ? sum : null;
}
