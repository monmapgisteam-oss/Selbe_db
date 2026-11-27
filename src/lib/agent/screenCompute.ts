'use client';

/**
 * ДЭЛГЭЦИЙН ТООЦООГ ДАВТДАГ `compute` ТӨРЛҮҮД — `finance_summary` · `pkg_plan` (2026-10-19).
 */

import { paidShareOf } from '@/lib/paidShare';
import { coverageOk } from '@/lib/planProgress';
import { MAP_PKG_ALIAS } from '@/lib/pkgAlias';
import { t as tr } from '@/lib/i18nCore';
import { resolveSource, type AgentScope } from './registry';

/* ══════════════ finance_summary ══════════════ */

export type FinanceSummary = {
  /** Төслийн нийт төсөвт өртөг, ₮ — `Budget.total` (Excel-ийн НИЙТ хүрээ, 5·6·7-р хэсэг орохгүй); мөргүй бол `null` */
  budget: number | null;
  /** Захирамжийн нийт дүн, ₮ — `Budget.orderTotal` (ижил хүрээ); мөргүй бол `null` */
  orderTotal: number | null;
  /** Гэрээлсэн дүн, ₮ — `paidShareOf().contract` (= `Budget.contract`; «олгосон хувь»-ийн хуваарь); гэрээний мөргүй бол `null` */
  contracted: number | null;
  /** HO-ийн БҮХ олголт (урьдчилгаа + гүйцэтгэл), ₮; бөглөгдсөн дүн огт алга бол `null` (0 БИШ) */
  paid: number | null;
  /** Гэрээлсэн багцад олгосон — хувийн тоологч, ₮ */
  paidContracted: number | null;
  /** Гэрээлсэн багцаас гадуурх (диапазон мөр, гэрээгүй багц) олголт — хувьд ОРООГҮЙ, ₮ */
  paidOther: number | null;
  /** Олгосон хувь 0–100 (`paidPctOf`); тодорхойгүй бол `null` */
  paidPct: number | null;
  note: string;
};

type BudgetLike = { total: number; orderTotal: number; contract: number; byType?: ReadonlyArray<{ n: number }> };

/**
 * ЦЭВЭР цөм — `loadBudget`-ийн үр дүн ба `FinData`-ийн гэрээ (`contracts`, `CF_WORK_WHERE`) ·
 * төлбөрийн (`pays`) мөрүүдээс. Хувь нь `paidShareOf`-ийнх — ДАХИН бодохгүй.
 */
export function financeSummaryOf(
  budget: BudgetLike,
  contracts: ReadonlyArray<Record<string, unknown>>,
  pays: ReadonlyArray<Record<string, unknown>>,
): FinanceSummary {
  const share = paidShareOf(contracts, pays);
  const known = share.paidKnown > 0;
  const budgetRows = budget.byType ? budget.byType.reduce((a, t) => a + (Number(t.n) || 0), 0) : null;
  const noBudget = budgetRows === 0;
  return {
    budget: noBudget ? null : budget.total,
    orderTotal: noBudget ? null : budget.orderTotal,
    contracted: contracts.length ? share.contract : null,
    paid: known ? share.paid : null,
    paidContracted: known ? share.paidContracted : null,
    paidOther: known ? share.paidOther : null,
    paidPct: share.pct,
    note:
      tr('Бүх тоо порталын дэлгэцийн ЯГ тэр функцээр бодогдсон (дашбоардын «Нийт төсөв», «Гэрээлсэн дүн», «Олгосон санхүүжилт»). ') +
      tr('`paidPct` = гэрээлсэн багцын олголт (`paidContracted`) ÷ гэрээлсэн дүн (`contracted`) × 100; `paidOther` нь хувьд ОРООГҮЙ олголт — ялгаж хэл. ') +
      tr('Мөнгөн дүнг бүтнээр, мянгатын таслалтай бич; хувийг 2 орон бутархайгаар (12.34%).'),
  };
}

/** Агентын хэрэгсэл — эрхийг шалгаад дэлгэцийн ачаалагчдыг дуудна */
export async function financeSummary(scope: AgentScope): Promise<FinanceSummary> {
  if (!resolveSource('ds:cashflow2', scope) || !resolveSource('ds:ipc', scope)) {
    throw new Error(tr('Санхүүгийн эх сурвалжид хандах эрх алга.'));
  }
  const [{ loadBudget }, F] = await Promise.all([import('@/lib/live'), import('@/modules/Finance')]);
  const [budget, fin] = await Promise.all([loadBudget(), F.loadFinData()]);
  const out = financeSummaryOf(budget, fin.contracts, fin.pays);
  /* 2026-11-19 (аудит): дашбоард, тайлантай НЭГ тоо — ТТБ-ийн Төслийн нийт мөр */
  const { loadProjectMoney } = await import('@/lib/projectPlanInputs');
  const m = await loadProjectMoney().catch(() => null);
  /* 2026-11-20 (засвар): зөвхөн гэрээлсэн дүнг ТТБ-ээс; олголт бүхэлдээ IPC-ээс — хувь = гэрээлсэн багцын олголт ÷ гэрээлсэн дүн */
  if (!m?.contract) return out;
  /* 2026-11-23 (аудит №3): ТТБ-ийн нийт ТЭЗҮ/зураг төслийн гэрээг агуулдаг тул тэдгээрийн олголт тоологчид орно (`withProjectContract`) */
  const { paidShareOf, withProjectContract } = await import('@/lib/paidShare');
  const sh = withProjectContract(paidShareOf(fin.contracts, fin.pays), m.contract, m.landComp);
  const known = sh.paidKnown > 0;
  return {
    ...out, contracted: m.contract,
    paidContracted: known ? sh.paidContracted : out.paidContracted,
    paidOther: known ? sh.paidOther : out.paidOther,
    paidPct: sh.pct == null ? out.paidPct : Math.round(sh.pct * 100) / 100,
  };
}

/* ══════════════ pkg_plan ══════════════ */

type MonthLike = { label: string; phys: number | null; physAt?: string | null };
type Lag = { month: string; planned: number; actual: number; gap: number; coverage?: number | null } | null;

/** Дэлгэцийн функцүүд — бодит замд `Finance.tsx`-ийнх, тестэд ижил гарын үсэгтэй */
export type PkgPlanDeps<M extends MonthLike = MonthLike> = {
  lagOf: (months: M[]) => Lag;
  physLatest: (months: M[]) => number | null;
  lagLevel: (gap: number) => 'red' | 'yellow' | null;
  /** Муруйн кэш алга үед ТУХ-ийн fallback (`planPctAt(series, measDayOf(…))`) — заавал биш */
  planAt?: (key: string, months: M[]) => number | null;
  isHousing?: (key: string) => boolean;
  /**
   * 2026-11-23 (аудит №44): түлхүүр («БАГЦ32») → дэлгэцийн нэр («Багц-3.2»). `null` = зөвхөн alias-ийн хуулбар түлхүүр
   * (`MAP_PKG_ALIAS`, жиш. БАГЦ7 = БАГЦ71) — давхар мөр гаргахгүй. Өгөөгүй бол түлхүүрээрээ (хуучин зан).
   */
  labelOf?: (key: string) => string | null;
  /**
   * 2026-11-27 (аудит №20): «Багцын гүйцэтгэл» — «Төсөл төлөвлөгөө биелэлт»-ийн 2-р унтраалгатай мөрөөс (`loadPlanPkgProgress`),
   * «Багцын явц» (PkgProg) жагсаалтын ЯГ тэр эх. `null` = эх уншигдсангүй → `actual`/`planned`/`gap`/`level` нь `null`.
   */
  plan: ReadonlyMap<string, { S: number | null; P: number | null }> | null;
};

export type PkgPlanRow = {
  bagts: string;
  /**
   * «Багцын гүйцэтгэл», % (0–100) — PkgProg-ийн S (`planPkgProgress`); багц мөргүй/хэмжилтгүй бол 0 (порталын дүрэм).
   * `null` = «Төсөл төлөвлөгөө биелэлт» уншигдсангүй.
   */
  actual: number | null;
  /** Төлөвлөсөн гүйцэтгэл, % — PkgProg-ийн P (ижил эх); `null` = уншигдсангүй */
  planned: number | null;
  /** Хоцрогдол, нэгж = `planned` − `actual` (PkgProg `pkgGapOf`); эерэг = хоцорсон; `null` = уншигдсангүй */
  gap: number | null;
  /** PkgProg-ийн alert-ийн түвшин — `lagLevel(gap)` (≥10 улаан, 5–10 шар) */
  level: 'red' | 'yellow' | null;
  /** ТУСДАА хэмжүүр: бөглөх хуудасны сүүлийн БИЕТ гүйцэтгэл, % — `physLatest`; хэмжилтгүй бол `null` */
  physActual: number | null;
  /** ТУСДАА хэмжүүр: хэмжилтийн өдрийн ХУВААРИЙН МУРУЙН төлөвлөгөө, % — `lagOf().planned` (эсвэл ТУХ-ийн fallback) */
  schedPlanned: number | null;
  /** ТУСДАА хэмжүүр: муруйн хоцрогдол = `schedPlanned` − `physActual` (`lagOf().gap`); хуваарь < 95% хамарсан бол `null` */
  schedGap: number | null;
  /** Биет хэмжилтийн сар «YYYY-MM» */
  month: string | null;
  /** Хуваарийн муруйн хамралт, % */
  coverage: number | null;
};

/**
 * ЦЭВЭР цөм — багц бүрийн «Багцын гүйцэтгэл» (`deps.plan`, PkgProg-тэй ижил) ба сарын цэгүүдээс (`pkgMonthsMap`)
 * биет/муруйн тусдаа хэмжүүр. Мөрүүд = сарын цэгтэй багц ∪ «Багцын гүйцэтгэл»-тэй багц.
 */
export function pkgPlanOf<M extends MonthLike>(
  monthsBy: ReadonlyMap<string, M[]>,
  deps: PkgPlanDeps<M>,
): PkgPlanRow[] {
  const out: PkgPlanRow[] = [];
  const plan = deps.plan;
  const keys = new Set<string>([...monthsBy.keys(), ...(plan ? plan.keys() : [])]);
  keys.forEach((key) => {
    const label = deps.labelOf ? deps.labelOf(key) : key;
    if (label == null) return;
    const months = monthsBy.get(key);
    const lag = months ? deps.lagOf(months) : null;
    const physActual = months ? deps.physLatest(months) : null;
    const housing = deps.isHousing?.(key) ?? false;
    const schedPlanned = lag?.planned ?? (months && housing ? deps.planAt?.(key, months) ?? null : null);
    const progress = housing ? physActual : null;
    const coverage = lag?.coverage ?? null;
    /* хамралт ӨГӨГДӨӨГҮЙ (`undefined` — хуучин/тестийн deps) бол өмнөх зан; ӨГӨГДСӨН ба < 95 бол л дүгнэхгүй */
    const judged = !lag || lag.coverage === undefined || coverageOk(coverage);
    const schedGap = !judged ? null : lag ? lag.gap : schedPlanned != null && progress != null ? schedPlanned - progress : null;
    /* «Багцын гүйцэтгэл» уншигдсан бол багц БҮР мөр (PkgProg шиг, мөргүй = 0%); уншигдаагүй бол зөвхөн биет/муруйн тоотой нь */
    if (!plan && physActual == null && schedPlanned == null) return;
    const v = plan?.get(key);
    const actual = plan ? v?.S ?? 0 : null;
    const planned = plan ? v?.P ?? 0 : null;
    const gap = actual != null && planned != null ? planned - actual : null; // = PkgProg `pkgGapOf`
    out.push({
      bagts: label,
      actual,
      planned,
      gap,
      level: gap == null ? null : deps.lagLevel(gap),
      physActual,
      schedPlanned,
      schedGap,
      month: lag?.month ?? null,
      coverage,
    });
  });
  /* Хамгийн их хоцорсон эхэнд (PkgProg-ийн дараалал); тодорхойгүй хоцрогдол төгсгөлд */
  return out.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity)
    || (b.schedGap ?? -Infinity) - (a.schedGap ?? -Infinity)
    || a.bagts.localeCompare(b.bagts));
}

export type PkgPlan = {
  rows: PkgPlanRow[];
  /** `gap: null` мөрийн тоо — «Төсөл төлөвлөгөө биелэлт» уншигдаагүй үед бүх мөр */
  unknown: number;
  /** «Багцын гүйцэтгэл»-ийн эх («Төсөл төлөвлөгөө биелэлт») уншигдсангүй — `actual`/`planned`/`gap` бүгд `null` */
  planUnread: boolean;
  note: string;
};

/** Агентын хэрэгсэл — PkgProg/ТУХ-ийн ачаалагчаар */
export async function pkgPlan(scope: AgentScope): Promise<PkgPlan> {
  if (!resolveSource('ds:pkg_progress', scope)) {
    throw new Error(tr('Багцын гүйцэтгэлийн эх сурвалжид хандах эрх алга.'));
  }
  const [F, PP, TD, FMT, SV] = await Promise.all([
    import('@/modules/Finance'),
    import('@/lib/planProgress'),
    import('@/lib/tuhData'),
    import('@/lib/format'),
    import('@/lib/services'),
  ]);
  /* 2026-11-27 (аудит №20): «Багцын явц»-ийн жагсаалттай НЭГ эх — «Багцын гүйцэтгэл» (`loadPlanPkgProgress`). Эх унасан үед
     (`plan.failed`) татгалзана → «уншигдсангүй» (`null`), 0% мэт буцаахгүй */
  const loadPlan = import('@/lib/projectPlanInputs').then((m) => m.loadPlanPkgProgress());
  const [fin, pc, plan] = await Promise.all([
    F.loadFinData(),
    PP.loadPlanCurveCached().catch(() => null),
    loadPlan.catch((e: unknown) => {
      console.warn('[agent] pkg_plan: «Төсөл төлөвлөгөө биелэлт» уншигдсангүй', e);
      return null;
    }),
  ]);
  const monthsBy = F.pkgMonthsMap(fin);
  const keys = new Set<string>([...monthsBy.keys(), ...(plan ? plan.keys() : [])]);
  /* Гэрээний мөрийн багцын нэр (canonPkg) — alias-аар хуулсан түлхүүр энд байхгүй тул алгасагдана */
  const C = SV.CASHFLOW_NEW.fields;
  const nameOf = new Map<string, string>();
  for (const r of fin.contracts) {
    for (const v of [r[C.pkg2], r[C.pkg]]) {
      const k = SV.pkgKeyOf(v);
      if (k && !nameOf.has(k)) nameOf.set(k, String(SV.canonPkg(String(v ?? ''))).trim());
    }
  }
  const today = FMT.dayKey(Date.now());
  const nowYm = today.slice(0, 7);
  const rows = pkgPlanOf(monthsBy, {
    plan,
    lagOf: F.lagOf,
    physLatest: F.physLatest,
    lagLevel: F.lagLevel,
    isHousing: (key) => TD.TUH_HOUSING.includes(key),
    /* Alias (`MAP_PKG_ALIAS`, жиш. гэрээний БАГЦ71 → газрын зургийн БАГЦ7): ЗОРИЛТОТ түлхүүрийн мөрийг alias-ийн нэрээр үлдээнэ —
       орон сууц/хуваарийн муруй (`isHousing`, `planAt`) тэр түлхүүрээр; эх (гэрээний) түлхүүрийн давхар мөрийг хасна */
    labelOf: (key) => {
      const asTarget = Object.values(MAP_PKG_ALIAS).find((a) => a.key === key);
      if (asTarget) return asTarget.label;
      const asSrc = MAP_PKG_ALIAS[key];
      if (asSrc && keys.has(asSrc.key)) return null;
      /* сарын цэггүй, зөвхөн «Багцын гүйцэтгэл»-тэй багц (гэрээний мөргүй) — түлхүүрээрээ (жагсаалтаас ГОЛОХГҮЙ) */
      return nameOf.get(key) ?? (monthsBy.has(key) ? null : key);
    },
    planAt: (key, months) => {
      const series = pc?.byBagts.get(key);
      return series?.length ? PP.planPctAt(series, TD.measDayOf(months, nowYm, today)) : null;
    },
  });
  return {
    rows,
    unknown: rows.filter((r) => r.gap == null).length,
    planUnread: plan == null,
    note:
      tr('«Багцын явц» (PkgProg) жагсаалтын ЯГ тэр тоо: `actual` = «Багцын гүйцэтгэл» (S, «Төсөл төлөвлөгөө биелэлт»-ийн 2-р унтраалгатай бүх мөр — ТЭЗҮ, зураг, газар, зөвшөөрөл, сонгон, барилга угсралт), `planned` = ижил эхийн төлөвлөсөн гүйцэтгэл (P), `gap` = `planned` − `actual` (нэгжээр; эерэг = хоцорсон), `level` = дэлгэцийн анхааруулгын түвшин. Хэмжилтгүй багц 0%. ') +
      tr('`physActual` (бөглөх хуудасны биет гүйцэтгэл), `schedPlanned` (хуваарийн муруйн төлөвлөгөө), `schedGap` нь ТУСДАА хэмжүүр — «Багцын явц»-ийн тоо гэж БҮҮ хэл. ') +
      (plan == null
        ? tr('«Төсөл төлөвлөгөө биелэлт» уншигдсангүй — `actual`/`planned`/`gap` ТОДОРХОЙГҮЙ («0%» эсвэл «хоцроогүй» гэж БҮҮ хэл).')
        : tr('`gap: null` нь хоцрогдол ТОДОРХОЙГҮЙ — «хоцроогүй» гэж БҮҮ хэл.')),
  };
}
