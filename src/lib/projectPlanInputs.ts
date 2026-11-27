/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ · БИЕЛЭЛТ — АМЬД ОРОЛТЫН АДАПТЕРУУД ба АЧААЛАГЧ.
 *
 * `projectPlan.ts` (цэвэр томьёоны хөдөлгүүр) нь синхрон callback-уудаар амьд утга авдаг
 * (`PlanInputs`). Энэ файл тэдгээр callback-ыг системийн эх сурвалжуудаас бэлдэнэ:
 *
 *   blockActual(pkg, blok)        — бөглөх хуудасны блокийн «Б.» гүйцэтгэл (`blockProgress`)
 *   prepActual(pkg, blok)         — Бэлтгэл ажлын (5.1.3.1.x) блокийн «А. Бэлтгэл ажил» гүйцэтгэл (`loadPrepProgress`, 2026-11-05)
 *   pkgActual(pkg)                — блокгүй багцын (5.x · 6.x · 7.1 · 10) «Б.» гүйцэтгэл (`loadInfraProgress`)
 *   blockPlanned(pkg, blok, asOf) — Хуваарийн төлөвлөгөөт % дурын өдрөөр (`bagtsSheet.planCurve`, блок тус бүрээр)
 *   landTotal                     — газар чөлөөлөлт % — зөвхөн төслийн нийтээр (`loadLandStatus`); багцаар бодохгүй (2026-11-11);
 *                                   багц/блокийн мөр хувьгүй, багцын гүйцэтгэлийн жинд орохгүй (`packageProgress`, 2026-11-27)
 *
 * ба `loadProjectPlan` — CASHFLOW_NEW-ийн Excel мөрүүдийг (dd_kod IS NOT NULL) уншиж мод угсраад,
 * оролтуудыг цуглуулж `computePlan` + `monthlySeries`-ийг бодно.
 */
import {
  buildTree, computePlan, monthlySeries, monthEnds, orderPlanRows, saneDate, ubToday,
  planBudgetTotal,
  moneySums, noMoney,
  type PlanInputs, type PlanNode, type PlanResult, type PlanStoredRow, type PlanTree,
  packageProgress, planPkgKey, type PlanPkgProgress,
} from './projectPlan';
import {
  CASHFLOW_NEW, CF_MONTH,
  bagtsKey, buildingKey, pkgKeyOf, isConstructionNo, isPrepNo,
} from './services';
import {
  loadBlockProgress, loadBlockUniverse, loadInfraProgress, loadPrepProgress, loadProgressAt,
  type BlockProgressMap, type BlockUniverse, type PkgProgress, type PrepMap,
} from './blockProgress';
import { PKGS, SYNTHETIC_BLOCK, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, planAt, planCurve, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { planFields } from './planProgress';
import { countPlanRows, countWeekRows, loadPkgPlan, loadPkgWeek, planPctFromMonths, weekPct, type PkgPlan, type PkgWeek } from './huvaariObyem';
import { queryFeatures } from './query';
import { t as tr } from './i18nCore';
import { loadLandStatus } from './land';
import { cached, SESSION_TTL_MS } from './live';
import { gereeOverride, loadZuragBurtgel, type ZRow } from './zuragBurtgel';
import { withRegistryRows } from './zuragPlan';

const DAY = 86_400_000;

/* ══════════════════ 1. Excel мөрүүд (CASHFLOW_NEW) ══════════════════ */

const CF = CASHFLOW_NEW.fields;

/**
 * Хадгалсан мөрийг уншихдаа ЭНЭ талбарууд (`PlanStoredRow`-ийн түлхүүр → хүснэгтийн эх нэр).
 */
const STORED_FIELDS: [keyof PlanStoredRow, string][] = [
  ['objectid', CASHFLOW_NEW.oid],
  ['dd_kod', CF.ddKod],
  ['etseg_kod', CF.parentKod],
  ['tuvshin', CF.level],
  ['uy_shat', CF.phase],
  ['bagts', CF.pkg],
  ['blok', CF.block],
  ['ajil_uilchilgee', CF.detail],
  ['ho_dun_geree', CF.budget],
  ['heseg_ezleh_huvi', CF.wSection],
  ['guits_ehleh', CF.contractorStart],
  ['guits_duusah', CF.contractorEnd],
  ['guitsetgel_huvi', CF.progressPct],
  ['niit_tootsoh', CF.inTotal],
  ['uy_shat_tootsoh', CF.inPhase],
  ['mongo_tootsoh', CF.inMoney],
  ['hugatsaa_tootsoh', CF.inTime],
  ['bagts_kod', CF.pkgCode],
  ['zurag_oid', CF.zuragOid],
  ['cashflow_id', CF_MONTH.id],
  ['geree_ognoo', CF.contractDate],
  ['zahiramj_ognoo', CF.orderDate],
  ['zahiramj_dugaar', CF.orderNo],
  ['ashiglalt_ognoo', CF.handoverDate],
  ['created_date', 'created_date'],
  ['geree_dun', CF.contractAmount],
  ['olgoson_dun', CF.paid],
  ['urdchilgaa_dun', CF.advance],
  /* Зөвхөн харуулах баганууд (2026-11-04) */
  ['ho_dun_zahiramj', 'ho_dun_zahiramj'],
  ['geree_dugaar', 'geree_dugaar'],
  ['guitsetgegch', 'guitsetgegch'],
  ['zahialagch_hynalt_baig', 'zahialagch_hynalt_baig'],
  ['ho_dungiin_tailbar', 'ho_dungiin_tailbar'],
];
const TEXT_KEYS = new Set<keyof PlanStoredRow>(['bagts_kod', 'dd_kod', 'etseg_kod', 'uy_shat', 'bagts', 'blok', 'ajil_uilchilgee', 'zahiramj_dugaar',
  'geree_dugaar', 'guitsetgegch', 'zahialagch_hynalt_baig', 'ho_dungiin_tailbar']);

/** Атрибутыг нэрээр — эхлээд яг, дараа нь том/жижиг үсэг үл ялган */
function attrOf(a: Record<string, unknown>, name: string): unknown {
  if (name in a) return a[name];
  const lo = name.toLowerCase();
  for (const k of Object.keys(a)) if (k.toLowerCase() === lo) return a[k];
  return undefined;
}

/** Тоо (мөрөөр ирсэн тоо ч) эсвэл null — хоосон мөр 0 БИШ */
const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (v: unknown): string | null => {
  const t = v == null ? '' : String(v).trim();
  return t ? t : null;
};

/** Хүснэгтийн мөр → `PlanStoredRow` (цэвэр — тестлэгдэнэ) */
export function toStoredRow(a: Record<string, unknown>): PlanStoredRow {
  const out: Record<string, unknown> = {};
  for (const [k, f] of STORED_FIELDS) {
    const v = attrOf(a, f);
    out[k] = TEXT_KEYS.has(k) ? textOrNull(v) : numOrNull(v);
  }
  /* 2026-11-04: `geree_*` хүснэгтээс хасагдсан — «Гэрээ (хавсралт 5)» багана ижил мөрийн `guits_*`-ийг авна;
     Барилга угсралтад `linkPlanDates` Хуваарийн «Гэрээ» огноогоор дарна. */
  out.geree_ehleh = out.guits_ehleh;
  out.geree_duusah = out.guits_duusah;
  return out as PlanStoredRow;
}

/**
 * `dd_kod`-ын БАЙГАЛИЙН эрэмбэ — цифрийн хэсгийг тоогоор («1.10» > «1.9»), бусдыг тэмдэгтээр.
 */
export function compareDdKod(a: string | null | undefined, b: string | null | undefined): number {
  const x = String(a ?? '').match(/\d+|\D+/g) ?? [];
  const y = String(b ?? '').match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const p = x[i], q = y[i];
    const dp = /^\d/.test(p), dq = /^\d/.test(q);
    if (dp && dq) {
      const d = Number(p) - Number(q);
      if (d) return d;
      if (p.length !== q.length) return p.length - q.length; // «01» ба «1»
    } else if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

/**
 * Мөрүүдийг Excel-ийн дараалалд (цэвэр) — `projectPlan.orderPlanRows`.
 */
export function sortPlanRows(rows: readonly PlanStoredRow[]): PlanStoredRow[] {
  return orderPlanRows(rows, compareDdKod);
}

/**
 * Excel-ийн БҮХ мөр — мөнгөний + бүтцийн (`dd_kod IS NOT NULL`), сарын мөр ОРОХГҮЙ.
 */
export async function fetchPlanRows(): Promise<PlanStoredRow[]> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: `${CF.ddKod} IS NOT NULL`,
    outFields: [...new Set(STORED_FIELDS.map(([, f]) => f))],
    orderBy: `${CF.ddKod} ASC, ${CASHFLOW_NEW.oid} ASC`,
  });
  return sortPlanRows(rows.map((r) => toStoredRow(r as Record<string, unknown>)).filter((r) => r.dd_kod));
}
const loadPlanRows = cached(fetchPlanRows, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/**
 * ТӨСЛИЙН НИЙТ ТӨСӨВ (бүхэл ₮) — «Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөрийн E, хөнгөн (зөвхөн хүснэгтийн
 * мөрүүд). `live.loadBudget.total` · `reportData.finance.budget` · `gdash.kpisOf.budget` энэ тоог харуулна (2026-11-04:
 * ажлын мөрийн нийлбэр блокийн бутархай ₮-өөс 1 ₮ дутуу гардаг байв). Мөр алга бол null.
 */
export async function loadProjectBudgetTotal(): Promise<number | null> {
  /* 2026-11-19 (аудит): ТТБ-тэй НЭГ тоо — газар чөлөөлөлтийн нөхөх олговор (`withLandComp`) энд ч орно. Уншигдаагүй бол хадгалсан мөрөөр */
  const rows = await loadTreeRows();
  return rows.length ? planBudgetTotal(buildTree(rows)) : null;
}

/**
 * МОДНЫ МӨРҮҮД — «Төсөл төлөвлөгөө биелэлт» хуудастай (`loadProjectPlan`) НЭГ угсралт (2026-11-24, аудит: төсөв · гэрээ ·
 * олгосон дүнгийн ачаалагчид хадгалсан мөрөөс, хуудас «Зургийн бүртгэл»-тэй модноос бодож 1010 ↔ 1030, 20 ↔ 10 зөрдөг байв).
 * Бүртгэл уншигдаагүй (`null`) бол хадгалсан мөрөөр — хуудас ч мөн адил. Цэвэр.
 */
export function planTreeRows(rows: readonly PlanStoredRow[], z: readonly ZRow[] | null, comp: number | null | undefined): PlanStoredRow[] {
  return withLandComp(z ? withRegistryRows(rows, z) : rows, comp);
}

/** `planTreeRows` — хүснэгт, «Зургийн бүртгэл», газрын нөхөх олговрыг уншиж (сешний кэштэй). Мөр алга бол хоосон */
async function loadTreeRows(): Promise<PlanStoredRow[]> {
  const rows = await loadPlanRows();
  if (!rows.length) return [];
  const [zb, lt] = await Promise.allSettled([loadZuragBurtgel(), loadLandStatus()]);
  return planTreeRows(rows, zb.status === 'fulfilled' ? zb.value : null, lt.status === 'fulfilled' ? lt.value.comp : null);
}

/**
 * ТӨСЛИЙН НИЙТ ГЭРЭЭЛСЭН ДҮН (₮) — ТТБ-ийн Төслийн нийт мөрийн «Гэрээний дүн» (`moneySums`, «Гэрээлсэн дүн» тэмдэгтэй мөрүүд,
 * үүрлэсэн мөр давхардахгүй). 2026-11-19 (аудит): дашбоард ба тайлан зөвхөн `cashflow_id`-тай ажлын мөрөөс нийлүүлдэг байсан тул
 * ТЭЗҮ · зураг төслийн 369 гэрээний мөр (11.8 тэрбум ₮) хаягддаг байв (2,034.8 ↔ ТТБ 2,046.5). Газрын нөхөх олговор
 * «Газар чөлөөлөлт» үе шатны 3-р унтраалга асаалттай үед ЭНД ОРНО (ТТБ-тэй адил) — «олгосон хувь»-ийг төлбөрийн актаас
 * боддог хэрэглэгч тоологчдоо `loadProjectLandComp`-ийг нэмнэ (`paidShare.withProjectContract`, 2026-11-27). Мөр алга бол null.
 */
export async function loadProjectContractTotal(): Promise<number | null> {
  return (await loadProjectMoney())?.contract ?? null;
}

/**
 * ТӨСЛИЙН НИЙТ МӨНГӨ — НЭГ ЭХ (2026-11-19, аудит: «гэрээлсэн дүн 4 өөр, олгосон хувь 4 томьёо»). «Төсөл төлөвлөгөө
 * биелэлт»-ийн Төслийн нийт мөр: төсөв (E), гэрээний дүн, олгосон дүн, урьдчилгаа — мөр бүрийн унтраалгатай
 * («Мөнгөний нийлбэрт тооцох»). Олгосон хувь = олгосон ÷ гэрээний дүн. Тайлан, дашбоард, AI туслах бүгд ЭНЭ тоог авна.
 * Газрын нөхөн олговор (`withLandComp`) ТТБ-тэй адил орно — анхдагчаар нийтэд тооцогдохгүй. Мөр алга бол null.
 */
/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСЛИЙН МӨНГӨ (2026-11-23, хэрэглэгч) — эдгээр гэрээ ажлын мөрд (`cashflow_id`) ороогүй тул «Ажлын төрлөөр»
 * задаргаанд аль ч төрөлд ордоггүй байв (нийт 2,034.8 ↔ ТТБ 2,046.5). ТТБ-ийн хоёр үе шатын төсөв (E) ба гэрээний дүн
 * (`moneySums`), «Мөнгөний нийлбэрт тооцох» унтраалгатай. Мөр алга бол null.
 */
export async function loadDesignMoney(): Promise<DesignMoney | null> {
  const rows = await loadTreeRows();
  return rows.length ? designMoneyOf(buildTree(rows)) : null;
}

export type DesignMoney = { budget: number; contract: number; n: number; contracted: number };
/** ТЭЗҮ · зураг төслийн мөнгө модноос (цэвэр — тестлэгдэнэ) */
export function designMoneyOf(tree: PlanTree): DesignMoney {
  const vals = computePlan(tree, {}).values;
  const ms = moneySums(tree);
  let budget = 0, contract = 0, n = 0, contracted = 0;
  for (const p of tree.root.children) {
    if (p.outside || (p.phase !== 'tezu' && p.phase !== 'zurag')) continue;
    budget += vals.get(p)?.E ?? 0;
    contract += ms.get(p)?.contract ?? 0;
    /* 2026-11-23 (давтан аудит): «Гэрээт» — гэрээний дүнтэй навч л (урьд нь гэрээ > 0 бол БҮХ навч: 369/369) */
    const walk = (x: typeof p): void => {
      if (x.outside) return;
      if (x.children.length) { for (const c of x.children) walk(c); return; }
      n += 1;
      if ((ms.get(x)?.contract ?? 0) > 0) contracted += 1;
    };
    walk(p);
  }
  return { budget, contract, n, contracted };
}

export type ProjectMoney = {
  budget: number | null; contract: number | null; paid: number | null; advance: number | null; paidPct: number | null;
  /**
   * 2026-11-27 (аудит): `contract` ба `paid`-д ОРСОН газар чөлөөлөлтийн нөхөх олговор, ₮ (`withLandComp`) — «Газар чөлөөлөлт»
   * үе шатны 3-р унтраалга асаалттай үед л > 0, эс бөгөөс 0. «Олгосон хувь»-ийг төлбөрийн актаас боддог хэрэглэгч
   * (`paidShare.withProjectContract`-ийн 3-р аргумент) тоологчдоо нэмнэ — хуваарьтай нэг хүрээ.
   */
  landComp: number;
};
/** `ProjectMoney.landComp` — «олгосон хувь»-ийн тоологчид нэмэх нөхөх олговор (`withProjectContract`-ийн 3-р аргумент); мөр алга бол 0 */
export async function loadProjectLandComp(): Promise<number> {
  return (await loadProjectMoney())?.landComp ?? 0;
}
export async function loadProjectMoney(): Promise<ProjectMoney | null> {
  const rows = await loadTreeRows();
  return rows.length ? projectMoneyOf(buildTree(rows)) : null;
}

/** Төслийн нийт мөнгө модноос (цэвэр — тестлэгдэнэ) */
export function projectMoneyOf(tree: PlanTree): ProjectMoney {
  const m = moneySums(tree).get(tree.root);
  const budget = planBudgetTotal(tree);
  const contract = m?.contract ?? null, paid = m?.paid ?? null;
  /* Нөхөх олговрын мөр (`landComp`) Төслийн нийтэд орсон эсэх — өөрөө ба дээд мөрүүд нь мөнгөний нийлбэрт тооцогдсон бол */
  let landComp = 0;
  for (const n of tree.nodes) {
    if (!n.row?.landComp) continue;
    let inTotal = true;
    for (let x: PlanNode | null = n; x && x.row; x = x.parent) if (noMoney(x)) { inTotal = false; break; }
    const c = n.row.geree_dun;
    if (inTotal && typeof c === 'number' && Number.isFinite(c)) landComp += c;
  }
  return {
    budget, contract, paid, advance: m?.advance ?? null, landComp,
    paidPct: contract != null && contract > 0 && paid != null ? Math.round((paid / contract) * 10000) / 100 : null,
  };
}

/* ══════════════════ 2. Бодит гүйцэтгэл (бөглөх хуудас) ══════════════════ */

/** Бодит гүйцэтгэлийн эх — `blockActualOf`/`pkgActualOf`-ийн оролт */
export type ActualSources = {
  /** Блок бүрийн «Б.» (`compute`) — `null` = ачаалалт унасан */
  blocks: BlockProgressMap | null;
  /** Багц бүрийн блокийн хуваарь (бөглөх хуудасны бүдүүвч) — `null` = унасан */
  universe: BlockUniverse | null;
  /** Блокгүй багцын гүйцэтгэл (`bagtsKey` → `PkgProgress`) — `null` = унасан */
  infra: Map<string, PkgProgress> | null;
  /** Блок бүрийн «А. Бэлтгэл ажил» (`computePrep`, 2026-11-05) — `null`/алга = унасан */
  prep?: PrepMap | null;
};

/** `${bagtsKey}|${блок}` — `blockProgress`-ийн түлхүүр */
export const blockKeyOf = (pkg: string | null | undefined, blok: string): string => buildingKey(pkg ?? '', blok);

/**
 * БЛОКИЙН БОДИТ ГҮЙЦЭТГЭЛ (0–100).
 */
export function blockActualOf(src: ActualSources): NonNullable<PlanInputs['blockActual']> {
  return (pkg, blok) => {
    if (!src.blocks) return null;
    const k = blockKeyOf(pkg, blok);
    const v = src.blocks.get(k);
    if (v && Number.isFinite(v.overall)) return v.overall;
    if (!src.universe) return null;
    const pk = bagtsKey(pkg);
    return src.universe.get(pk)?.includes(k) ? 0 : undefined;
  };
}

/**
 * БЭЛТГЭЛ АЖЛЫН БЛОКИЙН БОДИТ ГҮЙЦЭТГЭЛ (0–100) — «А. Бэлтгэл ажил» мөр (`PrepMap`, 2026-11-05). «Б.» хоосон блок ч орно.
 *   · эх унасан → `null`
 *   · блокийн бичлэг байгаа → утга (хуудас байгаа атлаа нүд хоосон = 0)
 *   · бичлэггүй атлаа хуваарьт байгаа блок → 0 (`blockActualOf`-ийн дүрэм)
 *   · хуваарьт ч үгүй → `undefined` (хадгалсан `guitsetgel_huvi`)
 */
export function prepActualOf(src: ActualSources): NonNullable<PlanInputs['prepActual']> {
  return (pkg, blok) => {
    if (!src.prep) return null;
    const k = blockKeyOf(pkg, blok);
    if (src.prep.has(k)) { const v = src.prep.get(k); return v != null && Number.isFinite(v) ? v : 0; }
    if (!src.universe) return null;
    return src.universe.get(bagtsKey(pkg))?.includes(k) ? 0 : undefined;
  };
}

/**
 * ОЛОН БАГЦЫН НЭРТЭЙ МӨР → ӨӨРИЙН ХҮСНЭГТ — `bagts` нь «БАГЦ 1- 4» · «БАГЦ-6.1, 6.2» тул `pkgKeyOf` хоосон, гэвч энэ мөрийн
 * ажилд тусгай хүснэгт бий (нэр · дүн · огноо ижил): `cashflow_id` → `Pkg.group`. Бусад диапазон мөрд хамаарахгүй, багцын
 * жагсаалт (`pkgKeyOf`, `isPkgRange`) хөндөгдөхгүй.
 */
export const CF_SHEET_GROUP: ReadonlyMap<number, string> = new Map([
  [18, 'Суурийн холболтын ажил'],
  [42, 'Төгөл дэд станцын зам сүвлэх ажил'],
  /* 2026-11-19 (аудит): багцгүй усан сангийн гэрээ (65.1 тэрбум ₮) хуваарийн хуудастайгаа холбогдоогүй байв */
  [58, 'Сэлбэ голын усан сан'],
]);

/**
 * Багцын нэр нь ХҮРЭЭТЭЙ эсвэл ХООСОН гэрээний (суурийн холболт · зам сүвлэх · усан сан) түлхүүр — хуваарийн хуудасны бүлгийн
 * `bagtsKey` («СУУРИЙНХОЛБОЛТЫНАЖИЛ»); жагсаалтад байхгүй бол ''. 6 түвшний хуваарь, удирдлагын хуваарийн карт эдгээрийг урьд нь алгасдаг байв.
 */
export const cfSheetKey = (cashflowId: unknown): string => {
  const id = Number(cashflowId);
  const g = Number.isFinite(id) ? CF_SHEET_GROUP.get(id) : undefined;
  return g ? bagtsKey(g) : '';
};

/** Хүснэгтийг хайх багцын нэр — барилга угсралтын мөр `CF_SHEET_GROUP`-д байвал тэр бүлэг, эс бөгөөс мөрийн `bagts` */
export function sheetPkgOf<T>(pkg: T, n?: PlanNode | null): T | string {
  const id = n?.phase === 'barilga' && n.sub === 'barilga' ? n.row?.cashflow_id : null;
  return (id != null ? CF_SHEET_GROUP.get(id) : undefined) ?? pkg;
}

/**
 * БЛОКГҮЙ НАВЧНЫ (дэд бүтэц) БОДИТ ГҮЙЦЭТГЭЛ — блокгүй багцын бөглөх хуудас (5.x · 6.x · 7.1 · 10).
 */
export function pkgActualOf(src: ActualSources): NonNullable<PlanInputs['pkgActual']> {
  return (pkg, n) => {
    const pk = pkgKeyOf(sheetPkgOf(pkg, n));
    if (!pk) return undefined;
    if (!src.infra) return null;
    const v = src.infra.get(pk);
    return v && Number.isFinite(v.pct) ? v.pct : undefined;
  };
}

async function fetchActual(): Promise<{ src: ActualSources; failed: string[] }> {
  const [b, u, i, p] = await Promise.allSettled([loadBlockProgress(), loadBlockUniverse(), loadInfraProgress(), loadPrepProgress()]);
  const failed: string[] = [];
  if (b.status === 'rejected') failed.push('blockProgress');
  if (u.status === 'rejected') failed.push('blockUniverse');
  if (i.status === 'rejected') failed.push('infraProgress');
  if (p.status === 'rejected') failed.push('prepProgress');
  return {
    src: {
      blocks: b.status === 'fulfilled' ? b.value : null,
      universe: u.status === 'fulfilled' ? u.value : null,
      infra: i.status === 'fulfilled' ? i.value : null,
      prep: p.status === 'fulfilled' ? p.value : null,
    },
    failed,
  };
}
const loadActual = cached(fetchActual, SESSION_TTL_MS, ['BAGTS_SHEET'], (v) => !v.failed.length);

/* ══════════════════ 3. Хуваарийн төлөвлөгөөт % (блок тус бүрээр) ══════════════════ */

/** Хуваарийн нэг хуудас — `makeSchedules`-ийн оролт */
export type PlanSheet = {
  /** `Pkg.key` («b42_9f») */
  key: string;
  /** `Pkg.group` («Багц 4-2») — 9F/12F нэг багцад нийлнэ */
  group: string;
  /** Блокийн шошго (`Schema.bld`) */
  bld: readonly string[];
  rows: SheetRow[];
  /**
   * Сарын обьёмын задаргаанаас гарах хувь (0–1) — `planProgress.loadPlanCurve`-ийн `planPct`-тэй ижил үүрэг.
   * `null` → огнооны шугаман (`planAt`).
   */
  monthly?: (des: number | null, blok: string, start: number | null, end: number | null, asOf: number) => number | null;
  /** Ирэх 7 хоногийн обьём (2026-11-11, `huvaariObyem.weekPct`) — сарын обьём · огнооны суурин дээр нэмэгдэнэ */
  weekly?: PkgWeek | null;
};

/** Блокийн хуваарь — синхрон асуулт (`blockPlanned`), урьдчилж бодох (`prime`) */
export type BlockSchedules = {
  /** Энэ блок хуваарьтай юу */
  has: (pkg: string | null | undefined, blok: string) => boolean;
  /** Төлөвлөгөөт хувь 0–100 `asOf` өдрөөр; хуваарьгүй бол null */
  at: (pkg: string | null | undefined, blok: string, asOf: number) => number | null;
  /** Олон өдрийг НЭГ дор бодож кэшлэнэ (`planCurve` нэг дуудалтаар) */
  prime: (asOfs: readonly number[]) => void;
  /** Хуваарьтай блокийн түлхүүрүүд (`buildingKey`) */
  keys: () => string[];
  /** «Б.» хэсгийн хуваарийн муж (MIN эхлэх · MAX дуусах); хуваарьгүй бол null (2026-10-29) */
  span: (pkg: string | null | undefined, blok: string) => [number, number] | null;
};

const cleanSpan = (s: number | null | undefined, e: number | null | undefined): [number | null, number | null] => {
  const a = saneDate(s), b = saneDate(e);
  return a == null || b == null || b < a ? [null, null] : [a, b];
};

const dayOf = (ms: number) => Math.floor(ms / DAY);

/**
 * Хуудсуудаас блок бүрийн хуваарь (цэвэр — тестлэгдэнэ).
 */
export function makeSchedules(sheets: readonly PlanSheet[]): BlockSchedules {
  type Entry = { sh: PlanSheet; b: number; bi: number; bEnd: number; rowsB: SheetRow[] | null; memo: Map<number, number> };
  const entries = new Map<string, Entry>();
  for (const sh of sheets) {
    const bi = sh.rows.findIndex((r) => isConstructionNo(r.no));
    if (bi < 0) continue;
    /* «Б.» мөрийн доод мөрүүд (гүнээр) — хуваарьтай эсэхийг энд л шалгана */
    let end = bi + 1;
    while (end < sh.rows.length && sh.rows[end].depth > sh.rows[bi].depth) end += 1;
    sh.bld.forEach((label, b) => {
      const k = buildingKey(sh.group, label);
      if (entries.has(k)) return;
      for (let i = bi; i < end; i += 1) {
        const [s, e] = cleanSpan(sh.rows[i].start[b], sh.rows[i].end[b]);
        if (s != null && e != null) {
          entries.set(k, { sh, b, bi, bEnd: end, rowsB: null, memo: new Map() });
          return;
        }
      }
    });
  }
  const raw = new Map<SheetRow, [number | null, number | null]>();
  const rowsOf = (en: Entry): SheetRow[] => {
    if (!en.rowsB) {
      en.rowsB = en.sh.rows.map((r) => {
        const [s, e] = cleanSpan(r.start[en.b], r.end[en.b]);
        const row = { ...r, start: [s], end: [e] };
        raw.set(row, [r.start[en.b] ?? null, r.end[en.b] ?? null]);
        return row;
      });
    }
    return en.rowsB;
  };
  const run = (en: Entry, asOfs: readonly number[]) => {
    const { sh, b } = en;
    const label = sh.bld[b];
    /* Суурь: сарын обьём › огнооны шугаман. Долоо хоногийн обьёмтой ажил — суурин дээр нэмнэ (2026-11-11) */
    const baseOf = (row: SheetRow, asOf: number): number | null => {
      const [s, e] = raw.get(row) ?? [row.start[0], row.end[0]];
      return sh.monthly?.(row.des, label, s, e, asOf) ?? planAt(asOf, row.start[0] ?? null, row.end[0] ?? null);
    };
    const pp = sh.monthly || sh.weekly?.size
      ? (row: SheetRow, _b: number, asOf: number) => {
        const wk = row.des == null ? undefined : sh.weekly?.get(row.des)?.get(label);
        if (wk) { const v = weekPct(wk, row.vol, asOf, (t) => baseOf(row, t), ubToday()); if (v !== undefined) return v; }
        if (!sh.monthly) return null;
        const [s, e] = raw.get(row) ?? [row.start[0], row.end[0]];
        return sh.monthly(row.des, label, s, e, asOf);
      }
      : undefined;
    const cur = planCurve(rowsOf(en), 1, asOfs, pp);
    asOfs.forEach((t, i) => {
      const v = cur[i]?.[en.bi];
      en.memo.set(dayOf(t), v == null || !Number.isFinite(v) ? 0 : v);
    });
  };
  const entryOf = (pkg: string | null | undefined, blok: string) => entries.get(blockKeyOf(pkg, blok));
  return {
    has: (pkg, blok) => !!entryOf(pkg, blok),
    at: (pkg, blok, asOf) => {
      const en = entryOf(pkg, blok);
      if (!en) return null;
      const d = dayOf(asOf);
      if (!en.memo.has(d)) run(en, [asOf]);
      return en.memo.get(d)! * 100;
    },
    prime: (asOfs) => {
      for (const en of entries.values()) {
        const need = [...new Map(asOfs.filter((t) => !en.memo.has(dayOf(t))).map((t) => [dayOf(t), t])).values()];
        if (need.length) run(en, need);
      }
    },
    keys: () => [...entries.keys()],
    span: (pkg, blok) => {
      const en = entryOf(pkg, blok);
      if (!en) return null;
      let lo: number | null = null, hi: number | null = null;
      for (let i = en.bi; i < en.bEnd; i += 1) {
        const [a, z] = cleanSpan(en.sh.rows[i].start[en.b], en.sh.rows[i].end[en.b]);
        if (a == null || z == null) continue;
        lo = lo == null ? a : Math.min(lo, a);
        hi = hi == null ? z : Math.max(hi, z);
      }
      return lo != null && hi != null ? [lo, hi] : null;
    },
  };
}

/** Багц БҮХЭЛДЭЭ хамаарах мөрийн блок («Бүгд») — бодит блок биш */
const WHOLE_PKG_RE = /^бүгд$/i;

/**
 * `blockPlanned` callback — хуваарьгүй/уншигдаагүй блок `null` (шугаман руу УНАХГҮЙ — файлын толгой).
 */
export function blockPlannedOf(sched: BlockSchedules | null): NonNullable<PlanInputs['blockPlanned']> {
  return (pkg, blok, asOf) => {
    if (!sched) return null;
    if (WHOLE_PKG_RE.test(blok.trim()) && !sched.has(pkg, blok)) return undefined;
    return sched.at(pkg, blok, asOf);
  };
}

/**
 * ГҮЙЦЭТГЭЛИЙН ХҮСНЭГТТЭЙ БАГЦУУД (2026-10-29, хэрэглэгч: «гүйцэтгэлийн хүснэгттэй холбо, хүснэгтгүйг хоосол»).
 *   · `blockless` — блокгүй хүснэгт (5.x · 6.1–6.8 · 7.1 · 10): огноо/төлөвлөгөөт % нь Хуваарийн синтетик блокоос.
 *   · `any` — аль нэг гүйцэтгэлийн хүснэгттэй (орон сууц нь блокоороо — `blockPlanned`).
 *   Хүснэгтгүй багцын барилга угсралтын огноо, төлөвлөгөөт % ХООСОН.
 *   2026-11-05: 16.x · 17.x · 6.10 · 7.2 · 8 · 9 · 11–15 · 18 · 19.x · 20.x багц ганц «Үндсэн хугацаа» мөртэй хүснэгттэй болсон —
 *   огноо, төлөвлөгөөт % нь тэр мөрөөс (бодит гүйцэтгэл 0%, ажлууд нэмэгдэх хүртэл).
 */
export const SHEET_PKGS = {
  blockless: new Set(PKGS.filter((p) => p.floors == null).map((p) => pkgKeyOf(p.group))),
  any: new Set(PKGS.map((p) => pkgKeyOf(p.group))),
};

/** Блокгүй навчны багц: 'blockless' (хүснэгтийн Хуваарь) · 'block' (хуучин дүрэм) · 'none' (хоосон) · null (багцгүй мөр) */
function sheetKindOf(pkg: string | null | undefined): 'blockless' | 'block' | 'none' | null {
  const k = pkgKeyOf(pkg ?? '');
  if (!k) return null;
  return SHEET_PKGS.blockless.has(k) ? 'blockless' : SHEET_PKGS.any.has(k) ? 'block' : 'none';
}

/** `pkgPlanned` — блокгүй хүснэгт → Хуваарийн синтетик блок; хүснэгтгүй → null; бусад → undefined (хуучин дүрэм) */
export function pkgPlannedOf(sched: BlockSchedules | null): NonNullable<PlanInputs['pkgPlanned']> {
  return (pkg0, asOf, n) => {
    const pkg = sheetPkgOf(pkg0, n);
    const kind = sheetKindOf(pkg);
    if (kind === 'none') return null;
    if (kind !== 'blockless') return undefined;
    return sched ? sched.at(pkg, SYNTHETIC_BLOCK, asOf) : null;
  };
}

/** `pkgSpan` — `pkgPlannedOf`-тэй ижил салаа: хүснэгтийн Хуваарийн муж · хүснэгтгүй → null · бусад → undefined */
export function pkgSpanOf(sched: BlockSchedules | null): NonNullable<PlanInputs['pkgSpan']> {
  return (pkg0, n) => {
    const pkg = sheetPkgOf(pkg0, n);
    const kind = sheetKindOf(pkg);
    if (kind === 'none') return null;
    if (kind !== 'blockless') return undefined;
    /* `span`-гүй хуучин/хуурамч хуваарь (тест) — хоосон */
    return sched?.span ? sched.span(pkg, SYNTHETIC_BLOCK) : null;
  };
}

/**
 * Сарын задаргааны callback (цэвэр — тестлэгдэнэ) — `planProgress.loadPlanCurve`-ийн `planPct`-тэй ЯГ нэг дүрэм:
 * хоёр огноо `sane` (2000–2100) бол ЭХ хосоороо (урвуу → `planPctFromMonths` null), эс бөгөөс бүтэн сараар.
 */
export function monthlyOf(ob: PkgPlan | null | undefined): PlanSheet['monthly'] {
  if (!ob || !ob.size) return undefined;
  return (des, blok, s, e, asOf) => {
    if (des == null) return null;
    const m = ob.get(des)?.get(blok);
    return m ? planPctFromMonths(m, asOf, saneDate(s) != null && saneDate(e) != null ? { start: s, end: e } : null) : null;
  };
}

/* ══════════════════ 3б. Хуваарийн ОГНОО — гэрээ · гүйцэтгэгч (2026-10-29) ══════════════════ */

type Span = [number | null, number | null];
export type DateSpan = { geree: Span; guits: Span };
export type DateSpans = {
  /** `undefined` = холбох хуудас алга (огноо хоосон) · `null` = хуудас уншигдаагүй (хадгалсан хэвээр) */
  get: (pkg: string | null | undefined, blok: string | null | undefined, sub: 'beltgel' | 'barilga') => DateSpan | null | undefined;
};

const EMPTY_SPAN: DateSpan = { geree: [null, null], guits: [null, null] };
const minD = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
const maxD = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
const joinSpan = (a: DateSpan, b: DateSpan): DateSpan => ({
  geree: [minD(a.geree[0], b.geree[0]), maxD(a.geree[1], b.geree[1])],
  guits: [minD(a.guits[0], b.guits[0]), maxD(a.guits[1], b.guits[1])],
});

/** Хуудсуудаас блок бүрийн огнооны муж (цэвэр — тестлэгдэнэ) */
export function makeDateSpans(sheets: readonly PlanSheet[], failedGroups: readonly string[] = []): DateSpans {
  const by = new Map<string, DateSpan>();
  const groups = new Set<string>();
  const put = (k: string, sp: DateSpan) => { const p = by.get(k); by.set(k, p ? joinSpan(p, sp) : sp); };
  for (const sh of sheets) {
    const g = bagtsKey(sh.group);
    groups.add(g);
    for (const sub of ['barilga', 'beltgel'] as const) {
      const ri = sh.rows.findIndex((r) => (sub === 'barilga' ? isConstructionNo(r.no) : isPrepNo(r.no)));
      if (ri < 0) continue;
      let end = ri + 1;
      while (end < sh.rows.length && sh.rows[end].depth > sh.rows[ri].depth) end += 1;
      sh.bld.forEach((label, b) => {
        let sp: DateSpan = EMPTY_SPAN;
        for (let i = ri; i < end; i += 1) {
          const r = sh.rows[i];
          /* мөр бүрийн хосыг `cleanSpan`-аар (урвуу · 2000–2100-аас гадуур → хоёулаа хаягдана) — `makeSchedules`-тэй ижил */
          sp = joinSpan(sp, { guits: cleanSpan(r.start[b], r.end[b]), geree: cleanSpan(r.gStart?.[b], r.gEnd?.[b]) });
        }
        put(`${buildingKey(sh.group, label)}|${sub}`, sp);
        put(`${g}|*|${sub}`, sp);
      });
    }
  }
  const failed = new Set(failedGroups);
  return {
    get: (pkg, blok, sub) => {
      const pk = pkgKeyOf(pkg);
      if (!pk) return undefined;
      if (failed.has(pk)) return null;
      if (!groups.has(pk)) return undefined;
      const b = String(blok ?? '').trim();
      const k = !b || WHOLE_PKG_RE.test(b) ? `${pk}|*|${sub}` : `${buildingKey(pkg ?? '', b)}|${sub}`;
      return by.get(k) ?? EMPTY_SPAN;
    },
  };
}

/** Хадгалсан мөрүүдэд холбосон огноог тавина (цэвэр — тестлэгдэнэ). `spans` null = Хуваарь бүхэлдээ уншигдаагүй. */
export function linkPlanDates(tree: PlanTree, spans: DateSpans | null): PlanStoredRow[] {
  const out = new Map<PlanStoredRow, PlanStoredRow>();
  for (const n of tree.nodes) {
    const r = n.row;
    if (!r) continue;
    const x: PlanStoredRow = { ...r };
    if (n.phase === 'barilga' && spans) {
      if (n.children.length) {
        /* 2026-11-05: ЭЦЭГ мөр — 182-д хадгалсан ГЭРЭЭНИЙ огноо (H/I) хэвээр (урьд нь хоослогдож 374 мөрийн H/I ба L2-ийн
           «Гэрээний дуусах» 59/59 алга болж байв); ГҮЙЦЭТГЭГЧИЙН огноо (L/M) урьдын адил хоослогдож блокуудын Хуваариас
           MIN/MAX-аар нэгтгэгдэнэ */
        /* 2026-11-19 (хэрэглэгч: «Үндсэн хугацаа гэдэг ажил — ялгаж томьёолох шаардлагагүй, бүх ажлуудын start/end-ээр
           тодорхойлж үр дүн ТТБ-д орно»): багцын мөрд хадгалсан огноо («Үндсэн хугацаа») ХЭВЭЭР — `computePlan` нь түүнийг
           блокуудын Хуваарийн огноотой нэгтгэж MIN/MAX авна. Урьд нь хоосолдож ажилтай багцад «Үндсэн хугацаа» тоологддоггүй байв.
           «Үндсэн хугацаа» зөвхөн ГЭРЭЭНИЙ мөрд (`cashflow_id`) — бүлэг, үе шатын мөрийн хуучин (Excel-ийн) огноо хоосолдоно. */
        if (r.cashflow_id == null) { x.guits_ehleh = null; x.guits_duusah = null; }
      } else {
        const sp = spans.get(sheetPkgOf(r.bagts, n), n.blok ?? r.blok, n.sub ?? 'barilga');
        if (sp !== null) {
          const v = sp ?? EMPTY_SPAN;
          x.geree_ehleh = v.geree[0]; x.geree_duusah = v.geree[1];
          /* 2026-11-20 (засвар): блокгүй ГЭРЭЭНИЙ мөрийн гүйцэтгэгчийн огноо = «Үндсэн хугацаа» (хадгалсан) — дарахгүй;
             `computePlan` нь Хуваарийн ажлуудын мужтай MIN/MAX нэгтгэнэ. Урьд нь хуудасгүй үед хоосолдог байв */
          if (r.cashflow_id == null || n.blok) { x.guits_ehleh = v.guits[0]; x.guits_duusah = v.guits[1]; }
        }
      }
    }
    out.set(r, x);
  }
  return tree.nodes.filter((n) => n.row).map((n) => out.get(n.row!)!);
}

/**
 * Хуваарийн хуудсуудыг уншина — `planProgress.loadPlanCurve`-тэй ИЖИЛ уншилт (`planFields`, `persist` кэш,
 * сарын задаргаа `HUVAARI_OBYEM` хоосон бол асуухгүй).
 */
async function fetchSchedules(): Promise<{ sched: BlockSchedules; spans: DateSpans; failed: string[]; failedGroups: string[] }> {
  const failed: string[] = [];
  const emptyP = countPlanRows().then((c) => c === 0).catch(() => false);
  const emptyW = countWeekRows().then((c) => c === 0).catch(() => false);
  const got = await Promise.all(PKGS.map(async (pkg, order): Promise<(PlanSheet & { order: number; blocks: boolean }) | null> => {
    const blocks = pkg.floors != null;
    try {
      const sc = await loadSchema(pkg, blocks ? {} : { synthetic: true });
      if (!sc.bld.length) return null; // огнооны баганагүй хуудас — хуваарьгүй
      /* Сарын задаргаа уншигдаагүй бол багц шугаман руу ЧИМЭЭГҮЙ унахгүй — хуудас уншигдаагүйтэй адил (`failed`) */
      const obP: Promise<PkgPlan | null> = emptyP
        .then((empty) => (empty ? null : loadPkgPlan(pkg.key).then((x) => x.plan)))
        .catch((e) => {
          failed.push(pkg.key);
          console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} сарын задаргаа уншигдсангүй`, e);
          return null;
        });
      const fields = [...new Set([...planFields(sc), ...sc.gStart, ...sc.gEnd].filter((x): x is string => !!x))];
      /* Ирэх 7 хоногийн обьём — уншигдаагүй бол зөвхөн тэр нэмэлт алга (сарын/огнооны суурь хэвээр) */
      const wkP: Promise<PkgWeek | null> = emptyW
        .then((empty) => (empty ? null : loadPkgWeek(pkg.key)))
        .catch((e) => { console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} долоо хоногийн обьём уншигдсангүй`, e); return null; });
      const r = await loadRows(pkg, sc, undefined, fields, { persist: true });
      const ob = await obP;
      const wk = await wkP;
      if (!r.rows.some((row) => isConstructionNo(row.no))) {
        failed.push(pkg.key);
        console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} хуудсанд «Б.» мөр алга`);
        return null;
      }
      return { key: pkg.key, group: pkg.group, bld: sc.bld, rows: r.rows, monthly: monthlyOf(ob), weekly: wk, order, blocks };
    } catch (e) {
      failed.push(pkg.key);
      console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} хуваарь уншигдсангүй`, e);
      return null;
    }
  }));
  const sheets = got.filter((x): x is PlanSheet & { order: number; blocks: boolean } => !!x).sort((a, b) => a.order - b.order);
  const failedGroups = [...new Set(PKGS.filter((p) => failed.includes(p.key)).map((p) => bagtsKey(p.group)))];
  const ok = sheets.filter((s) => !failedGroups.includes(bagtsKey(s.group)));
  return {
    sched: makeSchedules(ok), // блокгүй (синтетик «Ажил») хуудас ч — pkgPlannedOf · pkgSpanOf үүнээс уншина
    spans: makeDateSpans(ok, failedGroups),
    failed: [...new Set(failed)].map((k) => `schedule:${k}`), // сүлжээ тасрахад мөр ба сарын задаргаа хоёулаа унана — нэг хуудас нэг удаа
    failedGroups,
  };
}
const loadSchedules = cached(fetchSchedules, SESSION_TTL_MS, ['BAGTS_SHEET', 'HUVAARI_OBYEM'], (v) => !v.failed.length);

/* 2026-11-11 (хэрэглэгч): газар чөлөөлөлтийг БАГЦААР хувиар бодохгүй — нэг нэгж талбар олон багцад хамаардаг тул давхардана.
   Хувь зөвхөн төслийн нийтээр (`loadLandStatus`, үе шатын мөрийг `landTotal` дарна); багцын давхардлыг «Газар чөлөөлөлт» хуудасны
   саадын жагсаалт (`pkgSaad.loadPkgOverlaps`) харуулна. */

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН МӨНГӨН ДҮН (2026-11-19, хэрэглэгч: «урьдчилгаанаас бусад дүнрүү нийлбэрийг оруул») — «Газар чөлөөлөлт» үе
 * шатын ДЭЭД мөрийн (эцэггүй) урьдчилсан төсөвт өртөг · гэрээний дүн · олгосон дүн · захирамжийн дүн = нэгж талбаруудын нөхөх
 * олговрын нийлбэр (`LandStatus.comp`). Санах ойд л (182-т бичихгүй — IPC-ийн олгосон дүнгийн синк дарж бичихгүй, олговор
 * өөрчлөгдөхөд шууд дагана). Урьдчилгаа — хадгалсан утга, хоосон бол 0 (2026-11-19, хэрэглэгч: «бодолтод оруул»). Нийлбэр алга (`null`) бол мөр хэвээр. Үе шатын жин тогтмол тул
 * гүйцэтгэлийн хувь өөрчлөгдөхгүй. Цэвэр — `projectPlanLand.check.mjs`.
 */
export function withLandComp(rows: readonly PlanStoredRow[], comp: number | null | undefined): PlanStoredRow[] {
  if (comp == null || !Number.isFinite(comp)) return [...rows];
  return rows.map((r) => (/газар\s*чөлөөл/i.test(r.uy_shat ?? '') && !String(r.etseg_kod ?? '').trim()
    ? { ...r, ho_dun_geree: comp, geree_dun: comp, olgoson_dun: comp, ho_dun_zahiramj: comp, urdchilgaa_dun: r.urdchilgaa_dun ?? 0,
      /* Гэрээний дүн нийлбэрт орохын тулд (`moneySums` зөвхөн «Гэрээлсэн дүн» тэмдэгтэй мөрийг тоолно) */
      ho_dungiin_tailbar: 'Гэрээлсэн дүн', landComp: true as const }
    : r));
}

/* ══════════════════ 5. Нэгтгэл — ачаалагч ══════════════════ */

/** Оролтуудыг нэгтгэнэ (цэвэр) */
export function makeInputs(src: {
  actual: ActualSources;
  sched: BlockSchedules | null;
  landTotal?: number | null;
  /** Зураг төслийн явц багцаар (`zuragBurtgel.zuragPctMap`, 0–100) */
  zurag?: ReadonlyMap<string, number> | null;
  /** Зураг төслийн явц ГЭРЭЭГЭЭР (`zuragBurtgel.zuragGereePct`, 0–100) — гэрээ нь таарсан ТЭЗҮ · зураг төслийн мөрийг дарна */
  zuragGeree?: ReadonlyMap<string, number> | null;
  /** Зөвшөөрлийн явц багцаар (`zovPctMap`, «Зөвшөөрөл» бүртгэл, 0–100) — багцын «Зөвшөөрөл» мөрийг дарна */
  zov?: ReadonlyMap<string, number> | null;
}): PlanInputs {
  const lt = src.landTotal;
  const zg = src.zuragGeree?.size ? gereeOverride(src.zuragGeree) : null;
  const zv = src.zov?.size ? zovOverride(src.zov) : null;
  return {
    blockActual: blockActualOf(src.actual),
    prepActual: prepActualOf(src.actual),
    pkgActual: pkgActualOf(src.actual),
    blockPlanned: blockPlannedOf(src.sched),
    pkgPlanned: pkgPlannedOf(src.sched),
    pkgSpan: pkgSpanOf(src.sched),
    /* 2026-11-24 (засвар): `pkgKeyOf` — олон багцын мөр («БАГЦ 1- 4» → БАГЦ14) өөр багцын хувийг авахгүй */
    /* 2026-11-27 (хэрэглэгч): газар чөлөөлөлтийг багцаар ӨГӨХГҮЙ — багц/блокийн мөр хувьгүй (null) хэвээр; багцын гүйцэтгэлд
       «Газар чөлөөлөлт»-ийн мөр жингийн сууринд орохгүй (`projectPlan.packageProgress`) */
    ...(src.zurag?.size ? { zuragActual: (pkg: string | null) => { const k = pkgKeyOf(pkg ?? ''); return k ? src.zurag!.get(k) : undefined; } } : {}),
    /* 2026-11-04 (хэрэглэгч): «Газар чөлөөлөлт» үе шатын мөр = бүх нэгж талбарын тоогоор (`loadLandStatus`, «Газар чөлөөлөлт»
       хуудас · тайлан · нийтийн вэбтэй НЭГ тоо) — багцын мөрүүдийн жигнэлт биш. 2026-11-11: багц/блокийн мөр хувьгүй (`projectPlan.leafValue`). */
    ...(lt == null && !zg && !zv ? {} : {
      override: (n: PlanNode) => (lt != null && n.depth === 1 && n.phase === 'gazar' ? { S: lt } : zv?.(n) ?? zg?.(n)),
    }),
  };
}

/**
 * ЗӨВШӨӨРЛИЙН ЯВЦ — НЭГ ТОО (2026-11-24, аудит: дашбоард · ТУХ бүртгэлээс 50%, ТТБ · схем · төслийн нийт 182-ын мөрөөс 100%).
 * 2026-11-23-ны дүрэм («бүртгэл давамгайлна») хэвээр, гэхдээ ТООЦООНД: багцын «Зөвшөөрөл» үе шатны ДЭЭД мөрийн S = бүртгэлийн
 * хувь → үе шат, төслийн нийт түүгээр нийлнэ, `liveProgressOf` · схем тэр мөрийг уншина. Бүртгэлд мөргүй / олон багцын мөр — 182-оор.
 */
export function zovOverride(zov: ReadonlyMap<string, number>): (n: PlanNode) => { S: number } | undefined {
  return (n) => {
    if (n.phase !== 'zovshoorol' || n.depth < 2) return undefined;
    const k = pkgKeyOf(n.pkg ?? '');
    const v = k ? zov.get(k) : undefined;
    if (v === undefined) return undefined;
    /* Тэр багцын дээд мөр л — доод мөрүүд хадгалсан утгаараа */
    for (let p = n.parent; p && p.depth >= 2; p = p.parent) if (p.phase === 'zovshoorol' && pkgKeyOf(p.pkg ?? '') === k) return undefined;
    return { S: v };
  };
}

/**
 * Сарын тэнхлэг — төслийн огнооны мужаас (H/L MIN … I/M MAX, үндсэн мөрийн бодогдсон утга).
 * Огноо огт алга бол хоосон.
 */
export function planMonths(res: PlanResult): number[] {
  const v = res.values.get(res.tree.root);
  if (!v) return [];
  const lo = [v.H, v.L].filter((x): x is number => x != null);
  const hi = [v.I, v.M].filter((x): x is number => x != null);
  if (!lo.length || !hi.length) return [];
  const from = Math.min(...lo), to = Math.max(...hi);
  return to < from ? [] : monthEnds(from, to);
}

export type ProjectPlan = {
  /** Excel мөр алга (импортоос өмнө) — харагдац «өгөгдөл импортлогдоогүй» гэж харуулна, алдаа БИШ */
  empty: boolean;
  tree: PlanTree;
  result: PlanResult;
  inputs: PlanInputs;
  /** Сарын тэнхлэг (сар бүрийн сүүлийн өдөр, ms) */
  months: number[];
  /** Мөр бүрийн сарын хуримтлагдсан төлөвлөгөөт % (0–100) — `months`-той ижил урт */
  monthly: Map<PlanNode, (number | null)[]>;
  /**
   * УНШИГДААГҮЙ эх сурвалжууд (`blockProgress` · `schedule:b1_9f` · `landTotal` …).
   * Хоосон биш бол тэр эхийн мөрүүд `null` — дэлгэц «бүрэн биш»-ийг ил харуулна.
   */
  failed: string[];
  stored?: readonly PlanStoredRow[];
  /**
   * ӨМНӨХ 7 ХОНОГИЙН гүйцэтгэл S (0–100) мөр бүрд (2026-11-11) — бөглөх хуудасны архиваас `today − 7` өдрөөр; гараар
   * оруулдаг үе шат одоогийн утгаараа. Архив уншигдаагүй бол алга (Нэгтгэлд хоосон).
   */
  prevWeek?: Map<PlanNode, number | null>;
  /** Зураг төслийн явц БАГЦААР (бүртгэлийн төлөвөөс, 0–100) — багцын «Зураг төсөл» үе шатны хувьд (`liveProgressOf`) */
  zuragPkg?: ReadonlyMap<string, number> | null;
  /**
   * Зөвшөөрлийн явц БАГЦААР — «Зөвшөөрөл» бүртгэлээс (зөвшөөрсөн ÷ нийт, 0–100; `pkgKeyOf`). 2026-11-23 (аудит): бүртгэлд
   * Багц-1 нэг зөвшөөрөл хүлээгдэж байхад багцын «Зөвшөөрөл» шат ТТБ-ийн мөрөөр 100% гардаг байв. Бүртгэлд мөргүй багц — ТТБ-ээр.
   * 2026-11-24: зөвхөн мэдээлэл — хувь нь `computePlan`-д орсон (`zovOverride`), бүх харагдац ТТБ-ийн мөрөөс уншина.
   */
  zovPkg?: ReadonlyMap<string, number> | null;
};

/** Хоосон төлөв (цэвэр) */
export function emptyPlan(today: number = ubToday()): ProjectPlan {
  const tree = buildTree([]);
  return { empty: true, tree, result: computePlan(tree, {}, today), inputs: {}, months: [], monthly: new Map(), failed: [] };
}

/**
 * Мөр + оролтоос бүтэн тооцоо (цэвэр, `sched`-ийг өдрүүдээр урьдчилж бодно).
 */
export function assemblePlan(
  rows: readonly PlanStoredRow[],
  src: {
    actual: ActualSources; sched: BlockSchedules | null;
    zurag?: ReadonlyMap<string, number> | null;
    zuragGeree?: ReadonlyMap<string, number> | null;
    dates?: DateSpans | null;
    /** Төслийн газар чөлөөлөлт % (бүх нэгж талбарын тоогоор) — үе шатын мөрийг дарна; `undefined`/`null` = жигнэлт */
    landTotal?: number | null;
    /** Зөвшөөрлийн явц багцаар («Зөвшөөрөл» бүртгэл) — багцын «Зөвшөөрөл» мөрийг дарна (`zovOverride`) */
    zov?: ReadonlyMap<string, number> | null;
  },
  today: number = ubToday(),
  failed: string[] = [],
): ProjectPlan {
  if (!rows.length) return { ...emptyPlan(today), failed };
  const tree = src.dates === undefined ? buildTree(rows) : buildTree(linkPlanDates(buildTree(rows), src.dates));
  const inputs = makeInputs(src);
  src.sched?.prime([today, today + 7 * DAY, today - 7 * DAY]);
  const result = computePlan(tree, inputs, today);
  const months = planMonths(result);
  src.sched?.prime(months);
  const monthly = months.length ? monthlySeries(result, months, inputs) : new Map<PlanNode, (number | null)[]>();
  return { empty: false, tree, result, inputs, months, monthly, failed, stored: rows, ...(src.zov !== undefined ? { zovPkg: src.zov } : {}) };
}

/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ — харагдацуудын нэг эх.
 */
export async function loadProjectPlan(today: number = ubToday()): Promise<ProjectPlan> {
  const rows = await loadPlanRows();
  if (!rows.length) return emptyPlan(today);
  const [a, s, lt, zb, zv] = await Promise.allSettled([loadActual(), loadSchedules(), loadLandStatus(), import('./zuragBurtgel').then((m) => m.loadZuragBurtgel().then((r) => ({ pkg: m.zuragPctMap(r), rows: r }))),
    import('./zovshoorol').then((m) => m.loadZov()).then((zs) => (zs ? zovPctMap(zs) : null))]);
  /* Зургийн бүртгэл уншигдаагүй бол зураг төслийн мөр хадгалсан утгаараа (эх унасанд тооцохгүй — бусад бичилтийг саатуулахгүй) */
  const zurag = zb.status === 'fulfilled' ? zb.value.pkg : null;
  /* 2026-11-17 (хэрэглэгч: «ТТБ-ийн зургийн хэсгийг зургийн бүртгэлийн жагсаалтын дагуу оруул») — гэрээ нь бүртгэлд байгаа
     ТЭЗҮ · зураг төслийн мөрийн доор бүртгэлийн бүлэг · дэд бүлэг зохиомол мөр болж орно; хувь нь төлөвөөс.
     2026-11-24: мөнгөний ачаалагчидтай НЭГ угсралт (`planTreeRows`) */
  const planRows = planTreeRows(rows, zb.status === 'fulfilled' ? zb.value.rows : null, lt.status === 'fulfilled' ? lt.value.comp : null);
  if (zb.status === 'rejected') console.warn('[selbe] зургийн бүртгэл уншигдсангүй', zb.reason);
  /* Зөвшөөрлийн бүртгэл уншигдаагүй бол 182-ын мөрөөр (урьдын адил) */
  const zov = zv.status === 'fulfilled' ? zv.value : null;
  const failed: string[] = [];
  const landTotal = lt.status === 'fulfilled' ? lt.value.pct : null;
  if (lt.status !== 'fulfilled') failed.push('landTotal');
  const actual: ActualSources = a.status === 'fulfilled'
    ? a.value.src
    : { blocks: null, universe: null, infra: null };
  if (a.status === 'fulfilled') failed.push(...a.value.failed); else failed.push('actual');
  const sched = s.status === 'fulfilled' ? s.value.sched : null;
  const dates = s.status === 'fulfilled' ? s.value.spans : null;
  if (s.status === 'fulfilled') failed.push(...s.value.failed); else failed.push('schedule');
  const plan = assemblePlan(planRows, { actual, sched, dates, landTotal, zurag, zov }, today, failed);
  plan.zuragPkg = zurag;
  /* Өмнөх 7 хоног — бөглөлтийн архиваас (2026-11-11). Унавал гол тооцоог саатуулахгүй */
  try {
    const at = await loadProgressAt(new Date(today - 7 * DAY).toISOString().slice(0, 10));
    const pw = computePlan(plan.tree, makeInputs({ actual: { ...actual, ...at }, sched: null, landTotal, zurag, zov }), today);
    /* 2026-11-23 (аудит №5): үе шатын мөрийн өмнөх 7 хоног — одоогийнхтой ИЖИЛ (Төслийн нийтэд орсон) дамжуулалтаас */
    plan.prevWeek = new Map(plan.tree.nodes.map((n) => [n, (n.parent === plan.tree.root ? pw.total?.values.get(n)?.S : undefined) ?? pw.values.get(n)?.S ?? null]));
    plan.prevWeek.set(plan.tree.root, pw.values.get(plan.tree.root)?.S ?? null);
  } catch (e) {
    console.warn('[selbe] өмнөх 7 хоногийн гүйцэтгэл бодогдсонгүй', e);
  }
  return plan;
}

/* ══════════════════ 5. Гэрээний АМЬД гүйцэтгэл (дашбоард · ТУХ · Нэгтгэл) ══════════════════ */

/** Нэг гэрээний (cashflow_id) амьд гүйцэтгэл — 0–100, хэмжилтгүй null (0 БИШ) */
export type LiveProgress = {
  /** 2026-11-24: тухайн мөрийн БАГЦЫН гүйцэтгэл (2-р унтраалгаар, `packageProgress`) — багцгүй/диапазон мөрд null */
  pkg?: number | null;
  /** Мөрийн өөрийн S: барилга угсралт = гүйцэтгэл бөглөх (блок/багц), газар = газар чөлөөлөлт, бусад = порталд засагдсан утга (дэд мөртэй бол Σ F·X) */
  S: number | null;
  /** Үе шат бүрийн хувь — түлхүүр `CASHFLOW_NEW.stages`-ийн талбарын нэр; тухайн багцын тэр үе шатны ДЭЭД мөрийн S, `build` = өөрийн S */
  stages: Record<string, number | null>;
};

/**
 * cashflow_id → амьд гүйцэтгэл — «Төсөл төлөвлөгөө биелэлт»-ийн S (`computePlan`), цэвэр (тестлэгдэнэ).
 */
/** «Зөвшөөрөл» бүртгэлийн мөрүүд → багц (`pkgKeyOf`) → зөвшөөрсөн ÷ нийт × 100 (цэвэр) */
export function zovPctMap(rows: readonly { bagts: string; tolov: string }[]): Map<string, number> {
  const acc = new Map<string, { ok: number; n: number }>();
  for (const r of rows) {
    const k = pkgKeyOf(r.bagts);
    if (!k) continue;
    const a = acc.get(k) ?? { ok: 0, n: 0 };
    a.n += 1;
    if (r.tolov === 'Зөвшөөрсөн') a.ok += 1;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, (a.ok / a.n) * 100]));
}

export { planPkgKey };
/** БАГЦ БҮРИЙН ГҮЙЦЭТГЭЛ (2026-11-24, хэрэглэгч: 2-р унтраалга) — «Төсөл төлөвлөгөө биелэлт»-ээс, систем даяар НЭГ эх */
export const planPkgProgress = (plan: ProjectPlan): Map<string, PlanPkgProgress> => packageProgress(plan.result, planPkgKey);
/**
 * 2026-11-27 (аудит): эх унасан үед (`plan.failed` хоосон биш) уншигдаагүй мөр 0%-иар тооцогдож хэмжилт мэт буцдаг байв
 * (блокийн гүйцэтгэл унахад «Багц 1 — 3.00%», хуваарь унахад P = 0). Одоо ТАТГАЛЗАНА (throw) — хэрэглэгч бүр «уншигдаагүй»
 * гэж үзнэ. Цэвэр (тестлэгдэнэ).
 */
export function planPkgProgressOrThrow(plan: Pick<ProjectPlan, 'failed' | 'result'>): Map<string, PlanPkgProgress> {
  if (plan.failed.length) throw new Error(`${tr('{0} уншигдсангүй', tr('Багцын гүйцэтгэл'))} (${plan.failed.join(', ')})`);
  return packageProgress(plan.result, planPkgKey);
}
export const loadPlanPkgProgress = (): Promise<Map<string, PlanPkgProgress>> => loadProjectPlan().then(planPkgProgressOrThrow);

export function liveProgressOf(plan: ProjectPlan): Map<number, LiveProgress> {
  const pkgP = planPkgProgress(plan);
  const ST = CASHFLOW_NEW.stages;
  const PHASE_FIELD: [string, string][] = [
    ['tezu', ST.tezu], ['zurag', ST.design], ['gazar', ST.land], ['zovshoorol', ST.permit], ['songon', ST.tender],
  ];
  const sOf = (n: PlanNode): number | null => {
    const v = plan.result.values.get(n)?.S;
    return v == null || !Number.isFinite(v) ? null : v;
  };
  /* `bagtsKey` БИШ: «БАГЦ 1- 4» ба «БАГЦ-14» хоёул БАГЦ14 болж бие биеийн үе шатын хувийг авдаг байв */
  const keyOf = (n: PlanNode): string => pkgKeyOf(n.pkg) || String(n.pkg ?? '').trim();
  const top = new Map<string, PlanNode>();
  for (const n of plan.tree.nodes) {
    const pk = keyOf(n);
    if (!pk) continue;
    const k = `${n.phase}|${pk}`;
    const cur = top.get(k);
    if (!cur || n.depth < cur.depth) top.set(k, n);
  }
  const out = new Map<number, LiveProgress>();
  for (const n of plan.tree.nodes) {
    const id = n.row?.cashflow_id;
    if (id == null || out.has(id)) continue;
    const S = sOf(n);
    const pk = keyOf(n);
    const stages: Record<string, number | null> = { [ST.build]: S };
    for (const [ph, f] of PHASE_FIELD) {
      const t = pk ? top.get(`${ph}|${pk}`) : undefined;
      /* 2026-11-17: ТТБ-ийн зураг төслийн хэсэг бүртгэлийн жагсаалтаар (багцын мөргүй) — багцын зургийн хувь бүртгэлээс.
         2026-11-24 (засвар): `pkgKeyOf` — «БАГЦ 1- 4» нь БАГЦ14 (Багц-14)-ийн хувийг авдаг байв; олон багцын мөрд утгагүй */
      const zk = ph === 'zurag' ? pkgKeyOf(n.pkg ?? '') : '';
      const zp = zk ? plan.zuragPkg?.get(zk) : undefined;
      /* 2026-11-24: зөвшөөрлийн бүртгэлийн хувь тооцоонд орсон (`zovOverride`) — ТТБ-ийн мөрийн S-ээс, тусдаа дарахгүй */
      stages[f] = zp !== undefined ? zp : t ? sOf(t) : null;
    }
    const pkK = planPkgKey(n.pkg);
    out.set(id, { S, stages, pkg: pkK ? pkgP.get(pkK)?.S ?? null : null });
  }
  return out;
}

/** Амьд гүйцэтгэл — `loadProjectPlan` (хэсгүүд нь сешний кэштэй, `BAGTS_SHEET` · `CASHFLOW_NEW` invalidate-аар шинэчлэгдэнэ) */
export const loadLiveProgress = (): Promise<Map<number, LiveProgress>> => loadProjectPlan().then(liveProgressOf);

/* Тест/дотоод хэрэглээнд */
export const __test = { cleanSpan, attrOf };
