/**
 * ТУХ — АЧААЛСАН ӨГӨГДЛИЙГ НЭГ ЗАГВАР БОЛГОХ (харагдац зөвхөн үүнийг уншина).
 *
 * ⚠️ ШИНЭ ТООЦООГҮЙ: бүх тоо нь байгаа ачаалагч/туслахуудаас (`lagOf`,
 *    `physNow`, `planPctAt`, `housingPct`, `hoTotals`, `progressSeries`) эсвэл
 *    `tuhData`-ийн шалгагдсан цэвэр функцээс. Энд зөвхөн холбоно.
 */
import { CASHFLOW_NEW } from '@/lib/services';
import { monthKey } from '@/lib/format';
import { housingPct, type CfPlanRow } from '@/lib/gdash';
import { hoTotals, ipcNumbers } from '@/lib/ipc';
import { planPctAt, type PlanCurve } from '@/lib/planProgress';
import { progressSeries, type BlockHistory } from '@/lib/blockProgress';
import type { WorkforceDetail } from '@/lib/ceo/workforce';
import { MS_STATUS, type MsDoc } from '@/lib/chanarMs';
import { contractMonths, lagOf, type FinData, type MonthPt } from '@/modules/Finance';
import { physNow, progMonthsOf } from '@/modules/pkgShared';
import type { ProgPt } from '@/modules/PkgProg';
import type { Pack } from '@/modules/Bagts';
import {
  buildTuhPkgs, progressOf, statusOf, weekDelta, cfPlanPctAt, cfItemsOf,
  ipcOf, earned, daysBetween, bagtsKey,
  type TuhPkg, type TuhStatus, type TuhIpc,
} from '@/lib/tuhData';

export type DocCount = { total: number; approved: number; review: number; returned: number; draft: number };

export type TuhRow = {
  p: TuhPkg;
  /** Биет гүйцэтгэл 0–100 */
  progress: number | null;
  /** Гүйцэтгэгчийн төлөвлөгөө (хуваарь) 0–100 — хэмжилтийн өдрөөр (`lagOf`), эс бөгөөс өнөөдрөөр */
  planContractor: number | null;
  /** Гүйцэтгэл − гүйцэтгэгчийн төлөвлөгөө (pp) */
  gapContractor: number | null;
  /** Гэрээний төлөвлөгөө (CASHFLOW сарын мөр) 0–100, энэ сар хүртэл */
  planContract: number | null;
  gapContract: number | null;
  status: TuhStatus;
  /** Өнгөрсөн 7 хоногийн ахиц (pp) */
  week: number | null;
  ipc: TuhIpc | null;
  /** Улсын комиссын огноо («Хуваарь») */
  commission: number | null;
  /** Улсын комисс − гэрээт дуусах (хоног; эерэг = хоцорно) */
  delay: number | null;
  blocks: number;
  households: number;
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
  };
  paid: { total: number | null; pct: number | null; ipcCount: number; pays: number };
  statusCount: Map<TuhStatus, number>;
  /** Уншигдаагүй эх сурвалжууд — дэлгэц дээр ил хэлнэ */
  failed: string[];
};

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
  fill: ReadonlyMap<string, number> | null;
  packs: Pack[];
  hist: BlockHistory | null;
  commission: ReadonlyMap<string, number | null> | null;
  workforce: WorkforceDetail | null;
  docs: MsDoc[] | null;
  contractedNote: string;
  failed: string[];
}): TuhModel {
  const { fin, plan, cfPlan, fill, packs, hist, commission, workforce, docs } = input;
  const today = todayIso();
  const nowYm = monthKey();
  const pkgs = buildTuhPkgs(fin.contracts, input.contractedNote);

  /* Гэрээний мөр → сарын цэгүүд (`lagOf`-ийн оролт) — багцын түлхүүрээр */
  const monthsBy = new Map<string, ReturnType<typeof contractMonths>>();
  for (const r of fin.contracts) {
    const k = bagtsKey(r[CASHFLOW_NEW.fields.pkg]);
    if (k && !monthsBy.has(k)) monthsBy.set(k, contractMonths(r, fin));
  }

  const rows: TuhRow[] = pkgs.map((p) => {
    const progress = progressOf(p, fill);
    const housing = p.group === 'housing';
    const months = housing ? monthsBy.get(p.pkgKey) : undefined;
    const lag = months ? lagOf(months) : null;
    const series = housing ? plan?.byBagts.get(p.pkgKey) : undefined;
    const planContractor = lag?.planned ?? (series?.length ? planPctAt(series, today) : null);
    const gapContractor = lag ? lag.actual - lag.planned
      : progress != null && planContractor != null ? progress - planContractor : null;
    const items = cfItemsOf(p);
    const planContract = cfPlan ? cfPlanPctAt(cfPlan, items, nowYm) : null;
    const gapContract = progress != null && planContract != null ? progress - planContract : null;

    const pack = housing ? packs.find((x) => x.kind === 'build' && x.key === p.pkgKey) : undefined;
    const keys = pack ? pack.blocks.map((b) => b.key) : [];
    const daily = hist && keys.length ? progressSeries(hist, keys, 'day', 'latest') : [];
    const week = daily.length ? weekDelta(daily, today) : null;

    const comm = housing ? (commission?.get(p.pkgKey) ?? null) : null;
    const ipc = ipcOf(p.pkgKey, fin.contractsHo, ipcNumbers);

    /* ХАБЭА — багцын компаниуд (`Bagts_<SFX>`) */
    const comps = workforce?.companies.filter((c) => c.bagts && bagtsKey(c.bagts) === p.pkgKey) ?? [];
    const workers = comps.length ? comps.reduce((a, c) => a + c.workers, 0) : null;
    const technik = comps.length ? comps.reduce((a, c) => a + c.technik, 0) : null;
    const sfx = new Set(comps.map((c) => c.sfx));
    const workerDays = sfx.size && workforce
      ? [...workforce.days].sort((a, b) => a.key.localeCompare(b.key)).slice(-30).map((d) => {
        let sum: number | null = null;
        for (const k of sfx) {
          const v = d.comp[k]?.workers;
          if (v != null) sum = (sum ?? 0) + v;
        }
        return { key: d.key, value: sum };
      })
      : [];

    const mine = (docs ?? []).filter((d) => !!p.pkgKey && bagtsKey(d.bagts) === p.pkgKey);
    const ma = countDocs(mine.filter((d) => d.kind === 'MA'));
    const mir = countDocs(mine.filter((d) => d.kind === 'MIR'));

    /* ⚠️ Системийн «Гүйцэтгэлийн явц»-тай ЯГ ИЖИЛ цэгүүд (2026-09-30, хэрэглэгч:
       «чартуудыг үндсэн системтэй адилхан»). */
    const prog = progMonthsOf(months ?? null, series);
    const allMonths = p.pkgKey ? (monthsBy.get(p.pkgKey) ?? null) : null;

    return {
      p,
      progress,
      planContractor,
      gapContractor,
      planContract,
      gapContract,
      status: statusOf({ contracted: p.contracted, progress, gap: lag?.gap ?? null }),
      week,
      ipc,
      commission: comm,
      delay: daysBetween(p.end, comm),
      blocks: pack?.blocks.length ?? 0,
      households: pack?.households ?? 0,
      workers,
      technik,
      workerDays,
      ma,
      mir,
      docs: mine,
      ev: earned(p.cost, progress, planContract, planContractor),
      prog,
      months: allMonths,
      lag,
    };
  });

  const housing = rows.filter((r) => r.p.group === 'housing');
  const statusCount = new Map<TuhStatus, number>();
  for (const r of rows) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);

  const tot = hoTotals(fin.pays);
  const ipcCount = fin.contractsHo.reduce((a, c) => a + ipcNumbers(c.pays).length, 0);

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
      planContract: housingPct(housing.map((r) => ({ pct: r.planContract, cost: r.p.cost ?? 0, blocks: r.blocks }))),
      planContractor: plan?.months.length ? planPctAt(plan.months, today) : null,
    },
    paid: { total: tot.paid, pct: tot.paidPct, ipcCount, pays: tot.pays },
    statusCount,
    failed: input.failed,
  };
}
