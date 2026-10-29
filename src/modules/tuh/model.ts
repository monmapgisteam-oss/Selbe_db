/**
 * ТУХ — АЧААЛСАН ӨГӨГДЛИЙГ НЭГ ЗАГВАР БОЛГОХ (харагдац зөвхөн үүнийг уншина).
 */
import { monthKey, date } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { housingPct, pkgCostWeight, cfWeightRow, type CfPlanRow } from '@/lib/gdash';
import { ipcNumbers } from '@/lib/ipc';
import { contractBlocks, ipcTotals } from '@/lib/ipcTable';
import { paidShareOf } from '@/lib/paidShare';
import { planPctAt, planCoverage, coverageOk, type PlanCurve } from '@/lib/planProgress';
import type { BlockHistory } from '@/lib/blockProgress';
import type { CompanyDay, WorkforceDetail } from '@/lib/ceo/workforce';
import { MS_STATUS, latest as latestRev, type MsDoc } from '@/lib/chanarMs';
import { lagOf, pkgMonthsMap, physLatest, projectLagNow, type FinData, type MonthPt } from '@/modules/Finance';
import { physNow, progMonthsOf } from '@/modules/pkgShared';
import type { ProgPt } from '@/modules/PkgProg';
import type { Pack } from '@/modules/Bagts';
import { upstreamOf, downstreamOf, type PkgDep } from '@/lib/workDeps';
import { sheetsOf } from './tuhSchedule';
import {
  buildTuhPkgs, progressOf, statusOf, type LiveMap, weekDelta, cfPlanPctAt, cfItemsOf,
  ipcOf, earned, calDaysBetween, bagtsKey, keyOwners, assignHo, measDayOf,
  lastReportOf, reportAge,
  type TuhPkg, type TuhStatus, type TuhIpc, type CommissionPartial,
} from '@/lib/tuhData';

export type DocCount = { total: number; approved: number; review: number; returned: number; draft: number };

/**
 * ТУХ-ын эх сурвалжууд — `Tuh.tsx`-ийн ачаалагч бүр. Санхүү (`loadFinData`) энд ОРОХГҮЙ:
 * түүнгүйгээр загвар огт бүрдэхгүй.
 */
export type TuhSrc = 'plan' | 'cfPlan' | 'hist' | 'commission' | 'workforce' | 'docs' | 'packs' | 'budget' | 'deps' | 'live';

/**
 * «—» → «…» — тухайн эх сурвалж ХАРААХАН АЧААЛАГДАЖ БАЙГАА бол.
 */
export const lz = (m: Pick<TuhModel, 'loading'>, ...src: TuhSrc[]) =>
  (txt: string): string => (txt === '—' && src.some((k) => m.loading.has(k)) ? '…' : txt);

export type TuhRow = {
  p: TuhPkg;
  /** Багцын түлхүүрийн өгөгдлийн (HO, сарын цэг, MA/MIR, ХАБЭА, хуваарь) ЭЗЭН мөр — `tuhData.keyOwners` */
  own: boolean;
  /** Биет гүйцэтгэл 0–100 */
  progress: number | null;
  /** Гүйцэтгэгчийн төлөвлөгөө (хуваарь) 0–100 — хэмжилтийн өдрөөр (`lagOf`), эс бөгөөс өнөөдрөөр */
  planContractor: number | null;
  /** Гүйцэтгэл − гүйцэтгэгчийн төлөвлөгөө (pp) */
  gapContractor: number | null;
  planCoverage: number | null;
  /**
   * Гэрээний төлөвлөгөө (CASHFLOW сарын мөр) 0–100 — биет гүйцэтгэлийн ХЭМЖИЛТИЙН
   * өдрөөр (`measDayOf`), хэмжилтгүй бол өнөөдрөөр (`cfPlanPctAt` 2026-09-30).
   */
  planContract: number | null;
  gapContract: number | null;
  status: TuhStatus;
  /**
   * «Хоцорсон» төлвийг аль зөрүүгээр тогтоосон — `contractor` = гүйцэтгэгчийн хуваарь
   * (`lag.gap`), `contract` = гэрээний төлөвлөгөө (`gapContract`), `null` = зөрүүгүй.
   */
  statusBasis: 'contractor' | 'contract' | null;
  /** Өнгөрсөн 7 хоногийн ахиц (pp) */
  week: number | null;
  ipc: TuhIpc | null;
  /** Улсын комиссын огноо («Хуваарь») */
  commission: number | null;
  /**
   * Олон хуудастай багцын ЗАРИМ хуудас л огноотой — `commission` нь `null` (`tuhData.mergeCommission`).
   * Дэлгэцэд «— (1/2 хуудас)» (`commissionText`). `null` = дутуу биш.
   */
  commissionPartial: CommissionPartial | null;
  /** Улсын комисс − гэрээт дуусах (хоног; эерэг = хоцорно) */
  delay: number | null;
  blocks: number | null;
  households: number | null;
  workers: number | null;
  technik: number | null;
  /** Өдөр бүрийн ажилтан (ХАБЭА) — багцын компаниудаар */
  workerDays: { key: string; value: number | null }[];
  ma: DocCount | null;
  mir: DocCount | null;
  docs: MsDoc[];
  ev: ReturnType<typeof earned>;
  /**
   * «Гүйцэтгэлийн явц» графикийн цэгүүд — PkgProg-ийн ЯГ ижил (`progMonthsOf`):
   * гүйцэтгэгчийн төлөвлөгөө (хуваарь) ба биет гүйцэтгэл. Хуваарьгүй багцад `null`.
   */
  prog: ProgPt[] | null;
  /** «Санхүүжилтийн явц» (`Finance.ComboChart`)-ийн сарын цэгүүд — `contractMonths` */
  months: MonthPt[] | null;
  /** Хоцрогдол хэмжсэн сар (`lagOf`) — ComboChart-ийн тэмдэглэгээнд */
  lag: ReturnType<typeof lagOf>;
  /** Энэ багцын сүүлд тайлагнасан өдөр (`lastReportOf`) — эзэн мөрд л; алга бол `null` */
  lastReport: string | null;
  /** Сүүлийн тайлангаас хойш хоног (`reportAge`) — `TUH_STALE_DAYS`-ээс удвал тодруулна */
  reportAge: number | null;
  /**
   * ЭНЭ багцын төлөвлөгөөт муруйн уналт — `ProgChart.planFailed`-ийн утга: `-1` = муруй бүхэлдээ
   * унасан, `> 0` = энэ багцад (`sheetsOf(pkgKey)`) хамаарах `PlanCurve.failed` хуудасны тоо, `0` = бүрэн.
   */
  planFailed: number;
};

export type TuhModel = {
  rows: TuhRow[];
  /** Загвар бүрдсэн агшин (мс) — дэлгэц «өнөөдөр»-ийг ЭНДЭЭС авна (render доторх `Date.now()` цэвэр биш) */
  now: number;
  today: string;
  nowYm: string;
  /** Хамгийн сүүлд тайлагнасан биет гүйцэтгэлийн огноо */
  lastReport: string | null;
  hero: {
    actual: number | null;
    planContract: number | null;
    planContractor: number | null;
    planExcluded: string[];
    planCoverage: number | null;
  };
  /**
   * `pct` — `paidShare.paidShareOf` (порталын нэг тодорхойлолт, 2026-10-01).
   * `other` — гэрээлсэн багцаас гадуур олгосон (`PaidShare.paidOther`) — хувьд ОРООГҮЙ.
   */
  paid: { total: number | null; pct: number | null; ipcCount: number; pays: number; other: number | null };
  statusCount: Map<TuhStatus, number>;
  /** Уншигдаагүй эх сурвалжууд — дэлгэц дээр ил хэлнэ */
  failed: string[];
  /**
   * Гэрээний сарын төлөвлөгөөний ЦООРХОЙ (`gdash.cfGapsText`) — 'huvaari' эхтэй гэрээ тооцоологдоогүй тул «Гэрээний
   * төлөвлөгөө» ДУТУУ. null = цоорхойгүй. 2026-10-26 (хяналт №2): урьд нь чимээгүй (null ≠ 0).
   */
  cfGaps: string | null;
  /** Ачаалж буй эх сурвалжууд — `lz` «…» харуулна */
  loading: ReadonlySet<TuhSrc>;
  /**
   * Хуваарийн төлөвлөгөөт муруйн уналт — `PkgProg.ProgChart.planFailed`-ийн ЯГ утга:
   * `0` = бүрэн/ачаалж буй, `> 0` = уншигдаагүй хуудасны тоо (`PlanCurve.failed`), `-1` = бүхэлдээ унасан.
   */
  planFailed: number;
  /**
   * Багц хоорондын хамаарал («Багцын хамаарал») — `null` = ирээгүй/унасан.
   */
  deps: readonly PkgDep[] | null;
  live: LiveMap | null;
};

/**
 * Багцын урд (`up` — энэ багц ХАМААРДАГ) эсвэл ард (`down` — энэ багцаас хамаардаг) талын мөрүүд.
 */
export function depRows(m: Pick<TuhModel, 'rows' | 'deps'>, key: string, dir: 'up' | 'down'): TuhRow[] | null {
  if (!m.deps) return null;
  const me = m.rows.find((x) => x.p.key === key);
  if (!me?.own || !me.p.pkgKey) return [];
  const keys = dir === 'up' ? upstreamOf(m.deps, me.p.pkgKey) : downstreamOf(m.deps, me.p.pkgKey);
  const out: TuhRow[] = [];
  for (const k of keys) {
    const r = m.rows.find((x) => x.own && x.p.pkgKey === k);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Улсын комиссын огнооны ДЭЛГЭЦИЙН текст.
 */
export function commissionText(m: Pick<TuhModel, 'loading'>, r: Pick<TuhRow, 'commission' | 'commissionPartial'>): string {
  if (r.commissionPartial) {
    return `— ${tr('({0}/{1} хуудас)', r.commissionPartial.dated, r.commissionPartial.sheets)}`;
  }
  return lz(m, 'commission')(date(r.commission));
}

const countDocs = (docs: MsDoc[]): DocCount | null => {
  if (!docs.length) return null;
  const c: DocCount = { total: docs.length, approved: 0, review: 0, returned: 0, draft: 0 };
  for (const d of docs) {
    if (d.status === MS_STATUS.approved) c.approved += 1;
    else if (d.status === MS_STATUS.review) c.review += 1;
    else if (d.status === MS_STATUS.returned) c.returned += 1;
    else c.draft += 1;
  }
  return c;
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function buildModel(input: {
  fin: FinData;
  plan: PlanCurve | null;
  cfPlan: CfPlanRow[] | null;
  /** `null` = барилгын давхарга ирээгүй/унасан (блок, айлын тоо «—») */
  packs: Pack[] | null;
  hist: BlockHistory | null;
  commission: ReadonlyMap<string, number | null> | null;
  /** Хагас огноотой багцууд (`CommissionDates.partial`) — `null`/өгөөгүй = мэдэгдэхгүй */
  commissionPartial?: ReadonlyMap<string, CommissionPartial> | null;
  workforce: WorkforceDetail | null;
  docs: MsDoc[] | null;
  /** «Багцын хамаарал»-ын холбоосууд (багцын түлхүүрээр) — `null` = ирээгүй/унасан */
  deps?: readonly PkgDep[] | null;
  contractedNote: string;
  failed: string[];
  /** `TuhModel.cfGaps` (байхгүй бол null) */
  cfGaps?: string | null;
  /** Ачаалж буй эх сурвалжууд (байхгүй бол хоосон) */
  loading?: ReadonlySet<TuhSrc>;
  /** Хуваарийн муруй бүхэлдээ УНАСАН (`planQ.state === 'error'`) — `TuhModel.planFailed` = -1 */
  planError?: boolean;
  live?: LiveMap | null;
}): TuhModel {
  const { fin, plan, cfPlan, packs, hist, commission, workforce, docs } = input;
  const today = todayIso();
  const nowYm = monthKey();
  const pkgs = buildTuhPkgs(fin.contracts, input.contractedNote);
  const live = input.live ?? null;

  /*
   * Гэрээний мөр → сарын цэгүүд (`lagOf`-ийн оролт) — багцын түлхүүрээр.
   */
  const monthsBy = pkgMonthsMap(fin);
  /*
   * ОРОН СУУЦНЫ БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — `physLatest` (`lagOf`-ийн «бодит» цэг).
   */
  const actual = new Map<string, number>();
  monthsBy.forEach((m, k) => {
    const v = physLatest(m);
    if (v != null) actual.set(k, v);
  });
  const { owner } = keyOwners(pkgs);
  const hoBy = assignHo(pkgs, fin.contractsHo);
  /* ХАБЭА-гийн өдрийн нүд ХООСОН (нийт · монгол · гадаад бүгд бөглөөгүй) — компани тэр
     өдрийн тайланд ороогүй; `ceo/workforce` үүнийг 0 болгодог тул энд ялгана (null ≠ 0) */
  const blankDay = (v: CompanyDay) => v.workers === 0 && v.mongol == null && v.gadaad == null;
  const failedSheets = new Map<string, number>();
  for (const f of plan?.failed ?? []) {
    const k = f.split(': ')[0];
    failedSheets.set(k, (failedSheets.get(k) ?? 0) + 1);
  }
  const planFailedOf = (pkgKey: string): number => {
    if (input.planError) return -1;
    if (!pkgKey || !failedSheets.size) return 0;
    return sheetsOf(pkgKey).reduce((a, sh) => a + (failedSheets.get(sh.key) ?? 0), 0);
  };

  const rows: TuhRow[] = pkgs.map((p) => {
    const progress = progressOf(p, actual, live);
    const housing = p.group === 'housing';
    /** Энэ мөр түлхүүрийнхээ өгөгдлийн ЭЗЭН мөн эсэх (`keyOwners`) */
    const own = !!p.pkgKey && owner.get(p.pkgKey) === p.key;
    const months = housing || (own && p.group !== 'design') ? monthsBy.get(p.pkgKey) : undefined;
    const lag = months ? lagOf(months) : null;
    const series = housing ? plan?.byBagts.get(p.pkgKey) : undefined;
    const planContractor = lag?.planned
      ?? (series?.length ? planPctAt(series, measDayOf(months, nowYm, today)) : null);
    const gapContractor = lag ? lag.actual - lag.planned
      : progress != null && planContractor != null ? progress - planContractor : null;
    const planCov = series?.length ? planCoverage(series) : null;
    const covOk = coverageOk(planCov);
    const items = cfItemsOf(p);
    const planContract = cfPlan ? cfPlanPctAt(cfPlan, items, measDayOf(months, nowYm, today)) : null;
    const gapContract = progress != null && planContract != null ? progress - planContract : null;

    const pack = housing && packs ? packs.find((x) => x.kind === 'build' && x.key === p.pkgKey) : undefined;
    const week = housing && hist ? weekDelta(hist, p.pkgKey, today, fin.physN?.get(p.pkgKey)) : null;

    const comm = housing ? (commission?.get(p.pkgKey) ?? null) : null;
    const commPartial = housing ? (input.commissionPartial?.get(p.pkgKey) ?? null) : null;
    const ipc = ipcOf(null, hoBy.get(p.key) ?? [], ipcNumbers);

    /*
     * ХАБЭА — багцын компаниуд (`Bagts_<SFX>`).
     */
    const comps = own && workforce ? workforce.companies.filter((c) => c.bagts && bagtsKey(c.bagts) === p.pkgKey) : [];
    const rep = comps.filter((c) => !c.unreported);
    const workers = rep.length ? rep.reduce((a, c) => a + c.workers, 0) : null;
    const technik = rep.length ? rep.reduce((a, c) => a + c.technik, 0) : null;
    const sfx = new Set(comps.map((c) => c.sfx));
    const workerDays = sfx.size && workforce
      ? [...workforce.days].sort((a, b) => a.key.localeCompare(b.key)).slice(-30).map((d) => {
        let sum: number | null = null;
        for (const k of sfx) {
          const v = d.comp[k];
          if (!v || blankDay(v)) continue;
          sum = (sum ?? 0) + v.workers;
        }
        return { key: d.key, value: sum };
      })
      : [];

    const mine = own ? (docs ?? []).filter((d) => bagtsKey(d.bagts) === p.pkgKey) : [];
    const ma = countDocs(latestRev(mine.filter((d) => d.kind === 'MA')));
    const mir = countDocs(latestRev(mine.filter((d) => d.kind === 'MIR')));

    const prog = progMonthsOf(months ?? null, series);
    const allMonths = own ? (monthsBy.get(p.pkgKey) ?? null) : null;
    const lastReport = lastReportOf(allMonths);

    return {
      p,
      own,
      progress,
      planContractor,
      gapContractor,
      planCoverage: planCov,
      planContract,
      gapContract,
      status: statusOf({
        contracted: p.contracted,
        progress,
        gap: lag && covOk ? lag.gap : gapContract != null ? -gapContract : null,
        nullAs: p.group === 'design' ? 'unknown' : 'todo',
      }),
      statusBasis: lag && covOk ? 'contractor' as const : gapContract != null ? 'contract' as const : null,
      week,
      ipc,
      commission: comm,
      commissionPartial: commPartial,
      delay: calDaysBetween(p.end, comm),
      blocks: packs ? (pack?.blocks.length ?? 0) : null,
      households: packs ? (pack?.households ?? 0) : null,
      workers,
      technik,
      workerDays,
      ma,
      mir,
      docs: mine,
      ev: earned(p.cost, progress, planContract, covOk ? planContractor : null),
      prog,
      months: allMonths,
      lag,
      lastReport,
      reportAge: reportAge(lastReport, today),
      planFailed: planFailedOf(p.pkgKey),
    };
  });

  const housing = rows.filter((r) => r.p.group === 'housing');
  const statusCount = new Map<TuhStatus, number>();
  for (const r of rows) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);

  const tot = ipcTotals(contractBlocks(fin.contractsHo));
  const share = paidShareOf(fin.contracts, fin.pays);
  const ipcCount = fin.contractsHo.reduce((a, c) => a + ipcNumbers(c.pays).length, 0);

  /* Hero-гийн төлөвлөгөөний жин ба багцын олонлог — `physNow`-тэй нэг (доорх 2026-10-06) */
  const costW = pkgCostWeight(fin.contracts.map(cfWeightRow));
  const physKeys = new Set<string>([...fin.phys.keys(), ...(fin.physN?.keys() ?? [])]);

  let lastReport: string | null = null;
  fin.physAt.forEach((byMon) => byMon.forEach((d) => { if (d && (!lastReport || d > lastReport)) lastReport = d; }));

  return {
    rows,
    now: Date.now(),
    today,
    nowYm,
    lastReport,
    hero: {
      actual: physNow(fin, nowYm),
      planContract: housingPct(housing
        .filter((r) => physKeys.has(r.p.pkgKey))
        .map((r) => ({ pct: r.planContract, cost: costW.get(r.p.pkgKey) ?? 0, blocks: r.blocks ?? 0 }))),
      ...(() => {
        const ln = plan?.months.length ? projectLagNow(fin, plan, nowYm) : null;
        return { planContractor: ln ? ln.planned : null, planExcluded: ln ? ln.excluded : [], planCoverage: ln ? ln.coverage : null };
      })(),
    },
    paid: { total: tot.paid, pct: share.pct, ipcCount, pays: tot.pays, other: fin.pays.length ? share.paidOther : null },
    statusCount,
    failed: input.failed,
    cfGaps: input.cfGaps ?? null,
    loading: input.loading ?? new Set<TuhSrc>(),
    live,
    planFailed: input.planError ? -1 : plan ? plan.failed.length : 0,
    deps: input.deps ?? null,
  };
}
