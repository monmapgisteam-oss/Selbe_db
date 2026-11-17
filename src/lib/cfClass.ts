/**
 * CASHFLOW-ИЙН АНГИЛАЛ — МОДНООС (2026-11-16, хэрэглэгч: «Багц/Ажил 1–3-р түвшин» 6 баганыг хүснэгтээс хасна).
 *
 * Урьд нь `Guitsetgel_talbe/182`-ийн ажлын мөр бүр ангиллаа 6 баганад хадгалдаг байв (`bagts_tuvshin1…3`,
 * `ajil_tuvshin1…3`). Ижил мэдээлэл «Д/Д»-ийн модонд (`dd_kod` → `etseg_kod`) бий тул одоо мөрийн МОДОН ДАХЬ БАЙРЛАЛААС
 * бодно. `query.queryFeatures` энэ хүснэгтийн хариунд 6 утгыг ижил нэрээр залгадаг тул уншдаг код («Санхүүжилт»,
 * дашбоард, ТУХ, захирлын самбар, AI туслах) өөрчлөгдөөгүй.
 *
 * Дүрэм (ажлын мөр = `cashflow_id`-тай мөр):
 *   ТЭЗҮ · Ажлын зураг төсөл          → 1 «ТЭЗҮ, ЗУРАГ ТӨСӨЛ»; «Инженерийн …» бүлгийн доор бол 1.2, бусад нь 1.1
 *   Барилга угсралт › Орон сууц        → 2 «БАРИЛГА УГСРАЛТ» · 3 «ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт»
 *   Барилга угсралт › Гадна тохижилт   → 2 · 3 «ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт»
 *   Барилга угсралт › Инженерийн дэд б. → 2 · 4 «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт» · 4.1…4.5 дэд бүлгээр
 *   Барилга угсралт › Нийгмийн дэд б.  → 5 «НИЙГМИЙН ДЭД БҮТЭЦ»
 */
import { buildTree, orderPlanRows, type PlanNode, type PlanStoredRow, type PlanTree } from './projectPlan';

export const CF_CLASS_FIELDS = [
  'bagts_tuvshin1', 'ajil_tuvshin1', 'bagts_tuvshin2', 'ajil_tuvshin2', 'bagts_tuvshin3', 'ajil_tuvshin3',
] as const;
export type CfClassField = (typeof CF_CLASS_FIELDS)[number];
export type CfClass = Record<CfClassField, string | null>;

const EMPTY: CfClass = {
  bagts_tuvshin1: null, ajil_tuvshin1: null, bagts_tuvshin2: null, ajil_tuvshin2: null, bagts_tuvshin3: null, ajil_tuvshin3: null,
};

/** Инженерийн дэд бүтцийн дэд бүлэг — модны бүлгийн нэрээр */
const ENG_SUB: readonly [RegExp, string, string][] = [
  [/цахилгаан/i, '4.1', 'Гадна цахилгаан холбоо, дохиолол'],
  [/дулаан/i, '4.2', 'Гадна дулаан, ус хангамж, ариутгах татуурга шугам сүлжээ'],
  [/эх үүсвэр/i, '4.3', 'Инженерийн дэд бүтэц, эх үүсвэрийн шугам сүлжээний өргөтгөл'],
  [/бэлтгэл арга/i, '4.4', 'Инженерийн бэлтгэл арга хэмжээний дэд бүтэц'],
  [/авто зам/i, '4.5', 'Авто зам, дугуйн зам, явган зам'],
];

const nameOf = (n: PlanNode | undefined): string => String(n?.row?.ajil_uilchilgee ?? '');

/** Нэг мөрийн ангилал — ажлын мөр биш (`cashflow_id` хоосон) эсвэл ангилалгүй үе шат бол `null` */
export function cfClassOf(n: PlanNode): CfClass | null {
  if (n.row?.cashflow_id == null) return null;
  /* өвгүүд: [гүн 1, гүн 2, …, өөрөө] */
  const chain: PlanNode[] = [];
  for (let x: PlanNode | null = n; x && x.row; x = x.parent) chain.unshift(x);
  if (n.phase === 'tezu' || n.phase === 'zurag') {
    const eng = /инженерийн/i.test(nameOf(chain[1])) && chain.length > 2;
    return {
      ...EMPTY, bagts_tuvshin1: '1', ajil_tuvshin1: 'ТЭЗҮ, ЗУРАГ ТӨСӨЛ',
      bagts_tuvshin2: eng ? '1.2' : '1.1',
      ajil_tuvshin2: eng ? 'Инженерийн дэд бүтэц - ТЭЗҮ, зураг төсөл' : 'Барилга,ГИШС - ТЭЗҮ, зураг төсөл',
    };
  }
  if (n.phase !== 'barilga') return null;
  const g = nameOf(chain[2]);
  if (/нийгмийн/i.test(g)) return { ...EMPTY, bagts_tuvshin1: '5', ajil_tuvshin1: 'НИЙГМИЙН ДЭД БҮТЭЦ' };
  const base: CfClass = { ...EMPTY, bagts_tuvshin1: '2', ajil_tuvshin1: 'БАРИЛГА УГСРАЛТ' };
  if (/орон сууц/i.test(g)) return { ...base, bagts_tuvshin2: '3', ajil_tuvshin2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт' };
  if (/гадна тохижилт/i.test(g)) return { ...base, bagts_tuvshin2: '3', ajil_tuvshin2: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт' };
  if (/инженерийн/i.test(g)) {
    const sub = ENG_SUB.find(([rx]) => rx.test(nameOf(chain[3])));
    return {
      ...base, bagts_tuvshin2: '4', ajil_tuvshin2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт',
      bagts_tuvshin3: sub?.[1] ?? null, ajil_tuvshin3: sub?.[2] ?? null,
    };
  }
  return base;
}

/** `objectid` → ангилал (зөвхөн ажлын мөр) */
export function cfClassMap(tree: PlanTree): Map<number, CfClass> {
  const out = new Map<number, CfClass>();
  for (const n of tree.nodes) {
    const oid = n.row?.objectid;
    const c = cfClassOf(n);
    if (oid != null && c) out.set(oid, c);
  }
  return out;
}

/**
 * Д/Д-ЭЭС ГАРДАГ 3 ТАЛБАР (2026-11-16, хэрэглэгч: хүснэгтээс хасна) — Д/Д давхардалгүй, эцгийнхээ дугаараар эхэлдэг болсон тул:
 *   etseg_kod = сүүлийн хэсгийг хассан Д/Д («6.2.1» → «6.2»; үе шатын мөрд null)
 *   tuvshin   = цэгийн тоо («6.2.1» → 2; үе шат = 0)
 *   uy_shat   = эхний хэсэгтэй тэнцүү Д/Д-тэй мөрийн нэр («6…» → «Барилга угсралт»)
 */
export const CF_DERIVED_FIELDS = ['etseg_kod', 'tuvshin', 'uy_shat'] as const;
export type CfDerived = { etseg_kod: string | null; tuvshin: number | null; uy_shat: string | null };
export function cfDerive(ddKod: unknown, phaseNames: ReadonlyMap<string, string>): CfDerived {
  const code = String(ddKod ?? '').trim();
  if (!code) return { etseg_kod: null, tuvshin: null, uy_shat: null };
  const parts = code.split('.');
  return {
    etseg_kod: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
    tuvshin: parts.length - 1,
    uy_shat: phaseNames.get(parts[0]) ?? null,
  };
}

/** Үе шатын нэр — Д/Д-д цэггүй мөрүүд («6» → «Барилга угсралт») */
export function cfPhaseNames(rows: readonly Record<string, unknown>[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const code = String(r.dd_kod ?? '').trim();
    if (code && !code.includes('.')) out.set(code, String(r.ajil_uilchilgee ?? '').trim());
  }
  return out;
}

export type CfVirtual = { cls: Map<number, CfClass>; phases: Map<string, string> };

/** Түүхий мөрүүдээс (`CF_CLASS_SOURCE_FIELDS`) ангиллын зураглал ба үе шатын нэрс */
export function cfVirtualFromRows(rows: readonly Record<string, unknown>[]): CfVirtual {
  return { cls: cfClassFromRows(rows), phases: cfPhaseNames(rows) };
}

/** Модыг угсрахад хэрэгтэй багана — `query.ts` ангиллын эхийг ЭНЭ жагсаалтаар уншина */
export const CF_CLASS_SOURCE_FIELDS = ['objectid', 'dd_kod', 'bagts', 'blok', 'ajil_uilchilgee', 'cashflow_id'] as const;
export const CF_CLASS_SOURCE_WHERE = 'dd_kod IS NOT NULL';

const cmpKod = (a: string | null | undefined, b: string | null | undefined): number => {
  const x = String(a ?? '').split('.'), y = String(b ?? '').split('.');
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const d = Number(x[i]) - Number(y[i]);
    if (Number.isFinite(d) && d) return d;
    if (!Number.isFinite(d) && x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
};

/** Түүхий мөрүүдээс (`CF_CLASS_SOURCE_FIELDS`) ангиллын зураглал */
export function cfClassFromRows(rows: readonly Record<string, unknown>[]): Map<number, CfClass> {
  const phases = cfPhaseNames(rows);
  const stored = rows
    .map((r) => ({
      objectid: Number(r.objectid),
      dd_kod: r.dd_kod == null ? null : String(r.dd_kod).trim() || null,
      ...cfDerive(r.dd_kod, phases),
      bagts: r.bagts == null ? null : String(r.bagts),
      blok: r.blok == null ? null : String(r.blok),
      ajil_uilchilgee: r.ajil_uilchilgee == null ? null : String(r.ajil_uilchilgee),
      cashflow_id: r.cashflow_id == null ? null : Number(r.cashflow_id),
    } satisfies PlanStoredRow))
    .filter((r) => r.dd_kod);
  return cfClassMap(buildTree(orderPlanRows(stored, cmpKod)));
}

/** Мөрүүдэд ангиллын 6 утга ба Д/Д-ээс гардаг 3 утгыг залгана (байрандаа); ангилалгүй мөрд `null` */
export function attachCfVirtual<T extends Record<string, unknown>>(rows: T[], v: CfVirtual, oidField = 'objectid'): T[] {
  for (const r of rows) Object.assign(r, v.cls.get(Number(r[oidField])) ?? EMPTY, cfDerive(r.dd_kod, v.phases));
  return rows;
}
