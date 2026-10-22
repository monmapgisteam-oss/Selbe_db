'use client';

/**
 * ДЭЛГЭЦИЙН ТООЦООГ ДАВТДАГ `compute` ТӨРЛҮҮД — `finance_summary` · `pkg_plan` (⚠️ 2026-10-19).
 *
 * ⚠️ ЯАГААД: агент санхүүгийн нийт дүн, багцын төлөвлөгөө/хоцрогдлыг ТҮҮХИЙ мөрөөс (`query_feature`)
 *    өөрөө бодож дэлгэцээс зөрдөг байв: Cashflow-ийн сарын мөр хольж нийлбэр хөөрөх, Excel-ийн НИЙТ
 *    хүрээг (`finXlInTotal`) мэдэхгүй байх, «олгосон хувь»-ийн тоологч/хуваарийг андуурах, хуваарийн
 *    муруйг (`planPctAt`) огт харахгүй байх. Энд ДЭЛГЭЦИЙН ЯГ ТЭР функцүүдийг дуудна:
 *      · `finance_summary` — `live.loadBudget` (дашбоардын «Нийт төсөв» · «Гэрээлсэн дүн») +
 *        `paidShare.paidShareOf` (Тайлан · CEO карт · «IPC» · ТУХ-ийн «олгосон хувь»);
 *      · `pkg_plan` — `Finance.pkgMonthsMap` → `lagOf` / `physLatest` / `lagLevel` (PkgProg-ийн
 *        хоцрогдлын alert) + муруйгүй үед `planPctAt(series, measDayOf(…))` (ТУХ-ийн `planContractor`).
 * ⚠️ ТООЦООГ ДАХИН БИЧИХГҮЙ: цэвэр цөм (`financeSummaryOf`, `pkgPlanOf`) нь зөвхөн дэлгэцийн
 *    функцүүдийг хослуулна — `screenCompute.check.mjs` тэдгээр нь дэлгэцийн туслахтай ЯГ тэнцүүг шалгана.
 * ⚠️ Хүнд модулиуд (`Finance.tsx` — React, `live`, `tuhData`) ДИНАМИК импортоор (`compute.ts`-ийн ⚠️).
 */

import { paidShareOf } from '@/lib/paidShare';
import { coverageOk } from '@/lib/planProgress';
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

/** ⚠️ 2026-10-19: `byType[].n` — төсвийн мөрийн тоо (`loadBudget`); өгвөл 0 мөр → дүнгүүд `null` */
type BudgetLike = { total: number; orderTotal: number; contract: number; byType?: ReadonlyArray<{ n: number }> };

/**
 * ЦЭВЭР цөм — `loadBudget()`-ийн үр дүн ба `FinData`-ийн гэрээ (`contracts`, `CF_WORK_WHERE`) ·
 * төлбөрийн (`pays`) мөрүүдээс. ⚠️ Хувь нь `paidShareOf`-ийнх — ДАХИН бодохгүй.
 */
export function financeSummaryOf(
  budget: BudgetLike,
  contracts: ReadonlyArray<Record<string, unknown>>,
  pays: ReadonlyArray<Record<string, unknown>>,
): FinanceSummary {
  const share = paidShareOf(contracts, pays);
  const known = share.paidKnown > 0;
  /* ⚠️ 2026-10-19: null ≠ 0 — эх сурвалж ХООСОН (эрх/шүүлт/үйлчилгээний алдаагаар мөр ирээгүй) үед нийлбэр 0 гарч
     загвар «төсөв 0 ₮» гэж худал хэлдэг байв. Мөр огт алга → `null` («мэдээлэлгүй»). */
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
      tr('Мөнгөн дүнг бүтнээр, мянгатын таслалтай бич; хувийг нэг аравтаар.'),
  };
}

/** Агентын хэрэгсэл — эрхийг шалгаад дэлгэцийн ачаалагчдыг дуудна */
export async function financeSummary(scope: AgentScope): Promise<FinanceSummary> {
  if (!resolveSource('ds:cashflow2', scope) || !resolveSource('ds:ipc', scope)) {
    throw new Error(tr('Санхүүгийн эх сурвалжид хандах эрх алга.'));
  }
  const [{ loadBudget }, F] = await Promise.all([import('@/lib/live'), import('@/modules/Finance')]);
  const [budget, fin] = await Promise.all([loadBudget(), F.loadFinData()]);
  return financeSummaryOf(budget, fin.contracts, fin.pays);
}

/* ══════════════ pkg_plan ══════════════ */

type MonthLike = { label: string; phys: number | null; physAt?: string | null };
/* ⚠️ 2026-10-22 (аудит): `coverage` — хуваарийн хамралт (0–100, `planProgress.planCoverage`); < 95% бол дүгнэхгүй */
type Lag = { month: string; planned: number; actual: number; gap: number; coverage?: number | null } | null;

/** Дэлгэцийн функцүүд — бодит замд `Finance.tsx`-ийнх, тестэд ижил гарын үсэгтэй */
export type PkgPlanDeps<M extends MonthLike = MonthLike> = {
  lagOf: (months: M[]) => Lag;
  physLatest: (months: M[]) => number | null;
  lagLevel: (gap: number) => 'red' | 'yellow' | null;
  /** Муруйн кэш алга үед ТУХ-ийн fallback (`planPctAt(series, measDayOf(…))`) — заавал биш */
  planAt?: (key: string, months: M[]) => number | null;
  /**
   * ⚠️ 2026-10-19: ОРОН СУУЦНЫ багц эсэх (`tuhData.TUH_HOUSING`) — ТУХ (`tuh/model.ts` `buildModel`) хуваарийн
   *    муруйг (`series`) ЗӨВХӨН орон сууцанд уншдаг тул `planAt` fallback-ыг ч зөвхөн тэдэнд. Өгөөгүй бол
   *    fallback ОГТ хэрэглэхгүй (ТУХ-ээс өөр тоо гаргахаас сэргийлнэ).
   */
  isHousing?: (key: string) => boolean;
};

export type PkgPlanRow = {
  bagts: string;
  /** Бодит биет гүйцэтгэл, % (0–100) — `physLatest`; хэмжилтгүй бол `null` (0 БИШ) */
  actual: number | null;
  /** Хэмжилтийн өдрийн төлөвлөгөөт гүйцэтгэл, % — `lagOf().planned` (эсвэл ТУХ-ийн fallback) */
  planned: number | null;
  /** Хоцрогдол, нэгж = төлөвлөгөө − бодит (`lagOf().gap`); эерэг = хоцорсон */
  gap: number | null;
  /** Хэмжилтийн сар «YYYY-MM» */
  month: string | null;
  /** PkgProg-ийн alert-ийн түвшин (`lagLevel`) — хуваарь < 95% хамарсан бол `null` (дүгнэхгүй) */
  level: 'red' | 'yellow' | null;
  /** ⚠️ 2026-10-22 (аудит): хуваарийн хамралт, % — `null` = мэдэгдэхгүй (fallback зам); < 95 бол `gap`/`level` = null */
  coverage: number | null;
};

/** ЦЭВЭР цөм — багц бүрийн сарын цэгүүдээс (`pkgMonthsMap`) дэлгэцийн функцээр */
export function pkgPlanOf<M extends MonthLike>(
  monthsBy: ReadonlyMap<string, M[]>,
  deps: PkgPlanDeps<M>,
): PkgPlanRow[] {
  const out: PkgPlanRow[] = [];
  monthsBy.forEach((months, key) => {
    const lag = deps.lagOf(months);
    const actual = deps.physLatest(months);
    /* ⚠️ ТУХ-ийн дүрэм: `lagOf` (муруй + хэмжилтийн өдөр) эхэлж, алга бол `planPctAt` fallback — ЗӨВХӨН орон сууц */
    const housing = deps.isHousing?.(key) ?? false;
    const planned = lag?.planned ?? (housing ? deps.planAt?.(key, months) ?? null : null);
    /* ⚠️ 2026-10-19: fallback-ийн хоцрогдол ТУХ-ийн `gapContractor`-ийн адил `progressOf`-оос — орон сууцанд
       `progressOf` = `physLatest` (`buildModel`-ийн `actual` Map) = энд `actual`. Тэмдэг нь ТУХ-ийн эсрэг
       (энд төлөвлөгөө − бодит, эерэг = хоцорсон — PkgProg/`lagOf().gap`-тай ижил). */
    const progress = housing ? actual : null;
    /* ⚠️ 2026-10-22 (аудит): хуваарь < 95% хамарсан бол хоцрогдлыг ДҮГНЭХГҮЙ (`gap`/`level` = null) — дэлгэцийн
       `Finance.lagJudged`-тэй нэг дүрэм; AI «хоцорсон/түрүүлсэн» гэж худал хэлэхгүй, хамралтыг нэрлэнэ. */
    const coverage = lag?.coverage ?? null;
    /* хамралт ӨГӨГДӨӨГҮЙ (`undefined` — хуучин/тестийн deps) бол өмнөх зан; ӨГӨГДСӨН ба < 95 бол л дүгнэхгүй */
    const judged = !lag || lag.coverage === undefined || coverageOk(coverage);
    const gap = !judged ? null : lag ? lag.gap : planned != null && progress != null ? planned - progress : null;
    if (actual == null && planned == null) return; // хуваарьгүй · хэмжилтгүй — «мэдээлэлгүй», мөр БИШ
    out.push({
      bagts: key,
      actual,
      planned,
      gap,
      month: lag?.month ?? null,
      level: gap == null ? null : deps.lagLevel(gap),
      coverage,
    });
  });
  /* Хамгийн их хоцорсон эхэнд; тодорхойгүй хоцрогдол төгсгөлд */
  return out.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity) || a.bagts.localeCompare(b.bagts));
}

export type PkgPlan = { rows: PkgPlanRow[]; unknown: number; note: string };

/** Агентын хэрэгсэл — PkgProg/ТУХ-ийн ачаалагчаар */
export async function pkgPlan(scope: AgentScope): Promise<PkgPlan> {
  if (!resolveSource('ds:pkg_progress', scope)) {
    throw new Error(tr('Багцын гүйцэтгэлийн эх сурвалжид хандах эрх алга.'));
  }
  const [F, PP, TD, FMT] = await Promise.all([
    import('@/modules/Finance'),
    import('@/lib/planProgress'),
    import('@/lib/tuhData'),
    import('@/lib/format'),
  ]);
  /* ⚠️ `loadFinData` нь хуваарийн муруйг (`planCurveCache`) өөрөө ачаална — `lagOf` түүнийг уншина */
  const [fin, pc] = await Promise.all([F.loadFinData(), PP.loadPlanCurveCached().catch(() => null)]);
  const monthsBy = F.pkgMonthsMap(fin);
  const today = FMT.dayKey(Date.now());
  const nowYm = today.slice(0, 7);
  const rows = pkgPlanOf(monthsBy, {
    lagOf: F.lagOf,
    physLatest: F.physLatest,
    lagLevel: F.lagLevel,
    isHousing: (key) => TD.TUH_HOUSING.includes(key),
    planAt: (key, months) => {
      const series = pc?.byBagts.get(key);
      return series?.length ? PP.planPctAt(series, TD.measDayOf(months, nowYm, today)) : null;
    },
  });
  return {
    rows,
    unknown: rows.filter((r) => r.gap == null).length,
    note:
      tr('«Багцын гүйцэтгэл» (PkgProg) ба ТУХ-ийн ЯГ тэр функцээр: `actual` = сүүлийн биет гүйцэтгэл, `planned` = ХЭМЖИЛТИЙН өдрийн хуваарийн төлөвлөгөө, `gap` = төлөвлөгөө − бодит (нэгжээр; эерэг = хоцорсон), `level` = дэлгэцийн анхааруулгын түвшин. ') +
      tr('`gap: null` нь хоцрогдол ТОДОРХОЙГҮЙ (хуваарь/хэмжилт алга) — «хоцроогүй» гэж БҮҮ хэл.'),
  };
}
