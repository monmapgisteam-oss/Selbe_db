/**
 * ТУХ — АЧААЛСАН ӨГӨГДЛИЙГ НЭГ ЗАГВАР БОЛГОХ (харагдац зөвхөн үүнийг уншина).
 *
 * ⚠️ ШИНЭ ТООЦООГҮЙ: бүх тоо нь байгаа ачаалагч/туслахуудаас (`lagOf`,
 *    `physNow`, `planPctAt`, `housingPct`, `ipcTotals`) эсвэл
 *    `tuhData`-ийн шалгагдсан цэвэр функцээс. Энд зөвхөн холбоно.
 */
import { monthKey } from '@/lib/format';
import { housingPct, type CfPlanRow } from '@/lib/gdash';
import { ipcNumbers } from '@/lib/ipc';
import { contractBlocks, ipcTotals } from '@/lib/ipcTable';
import { planPctAt, type PlanCurve } from '@/lib/planProgress';
import type { BlockHistory } from '@/lib/blockProgress';
import type { CompanyDay, WorkforceDetail } from '@/lib/ceo/workforce';
import { MS_STATUS, type MsDoc } from '@/lib/chanarMs';
import { lagOf, pkgMonthsMap, physLatest, projectPlanOf, type FinData, type MonthPt } from '@/modules/Finance';
import { aggregateMonths, physNow, progMonthsOf } from '@/modules/pkgShared';
import type { ProgPt } from '@/modules/PkgProg';
import type { Pack } from '@/modules/Bagts';
import {
  buildTuhPkgs, progressOf, statusOf, weekDelta, cfPlanPctAt, cfItemsOf,
  ipcOf, earned, daysBetween, bagtsKey, keyOwners, assignHo, measDayOf,
  lastReportOf, reportAge,
  type TuhPkg, type TuhStatus, type TuhIpc,
} from '@/lib/tuhData';

export type DocCount = { total: number; approved: number; review: number; returned: number; draft: number };

/**
 * ТУХ-ын эх сурвалжууд — `Tuh.tsx`-ийн ачаалагч бүр. Санхүү (`loadFinData`) энд ОРОХГҮЙ:
 * түүнгүйгээр загвар огт бүрдэхгүй.
 */
export type TuhSrc = 'plan' | 'cfPlan' | 'hist' | 'commission' | 'workforce' | 'docs' | 'packs' | 'budget';

/**
 * «—» → «…» — тухайн эх сурвалж ХАРААХАН АЧААЛАГДАЖ БАЙГАА бол.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): «—» нь «мэдээлэл алга» гэсэн утгатай тул ачаалж
 *    буй тоонд хэрэглэвэл хэрэглэгч «системд байхгүй» гэж уншдаг байв. Ачаалж дуусаад
 *    утга алга бол «—» хэвээр.
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
  /**
   * Гэрээний төлөвлөгөө (CASHFLOW сарын мөр) 0–100 — биет гүйцэтгэлийн ХЭМЖИЛТИЙН
   * өдрөөр (`measDayOf`), хэмжилтгүй бол өнөөдрөөр (`cfPlanPctAt`-ийн ⚠️ 2026-09-30).
   */
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
  /** ⚠️ Барилгын давхарга уншигдаагүй бол `null` («—», 0 биш) */
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
  /** `other` — гэрээт дүн тодорхойгүй гэрээнд олгосон (`ipcTotals.paidOther`) — хувьд ОРООГҮЙ */
  paid: { total: number | null; pct: number | null; ipcCount: number; pays: number; other: number | null };
  statusCount: Map<TuhStatus, number>;
  /** Уншигдаагүй эх сурвалжууд — дэлгэц дээр ил хэлнэ */
  failed: string[];
  /** Ачаалж буй эх сурвалжууд — `lz` «…» харуулна */
  loading: ReadonlySet<TuhSrc>;
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
  /** `null` = барилгын давхарга ирээгүй/унасан (блок, айлын тоо «—») */
  packs: Pack[] | null;
  hist: BlockHistory | null;
  commission: ReadonlyMap<string, number | null> | null;
  workforce: WorkforceDetail | null;
  docs: MsDoc[] | null;
  contractedNote: string;
  failed: string[];
  /** Ачаалж буй эх сурвалжууд (байхгүй бол хоосон) */
  loading?: ReadonlySet<TuhSrc>;
}): TuhModel {
  const { fin, plan, cfPlan, packs, hist, commission, workforce, docs } = input;
  const today = todayIso();
  const nowYm = monthKey();
  const pkgs = buildTuhPkgs(fin.contracts, input.contractedNote);

  /*
   * Гэрээний мөр → сарын цэгүүд (`lagOf`-ийн оролт) — багцын түлхүүрээр.
   * ⚠️ 2026-09-30 (merge bagtsiin-medeelel): `Finance.pkgMonthsMap` — «Гүйцэтгэл»
   *    (`PkgProg`) ба «Багцын мэдээлэл» (`Bagts`)-тай НЭГ дүрэм. Урьд энд `bagtsKey(pkg)`
   *    хуулбар байсан тул «БАГЦ 1-4» мэт диапазон мөр «БАГЦ14»-т наалдах (`pkgKeyOf`-ийн
   *    ⚠️) ба `pkg2`-ийг алгасах эрсдэлтэй байв.
   */
  const monthsBy = pkgMonthsMap(fin);
  /*
   * ОРОН СУУЦНЫ БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — `physLatest` (`lagOf`-ийн «бодит» цэг).
   * ⚠️ 2026-09-30 (merge): урьд `live.loadFillPkgProgress` (блокийн жингүй дундаж) байв;
   *    bagtsiin-medeelel салбарт «Гүйцэтгэл» · «Багцын мэдээлэл»-ийн жагсаалт энэ «бодит
   *    гүйцэтгэл» рүү шилжсэн тул ТУХ ч мөн адил — нэг багц гурван дэлгэцэд НЭГ тоо.
   *    Хэмжилтгүй бол Map-д ОРОХГҮЙ → «—» (0 биш).
   */
  const actual = new Map<string, number>();
  monthsBy.forEach((m, k) => {
    const v = physLatest(m);
    if (v != null) actual.set(k, v);
  });
  /* ⚠️ 2026-09-30: түлхүүрээр холбогдох өгөгдөл (HO гэрээ, сарын цэг, MA/MIR, ХАБЭА) НЭГ
     мөрд — `tuhData.keyOwners`-ийн ⚠️ (зураг төслийн мөр барилгын гэрээний мөнгийг
     өөрийнх мэт харуулж, IPC-ийн хүснэгтэд нэг гэрээ хоёр удаа гардаг байв). */
  const { owner } = keyOwners(pkgs);
  const hoBy = assignHo(pkgs, fin.contractsHo);
  /* ХАБЭА-гийн өдрийн нүд ХООСОН (нийт · монгол · гадаад бүгд бөглөөгүй) — компани тэр
     өдрийн тайланд ороогүй; `ceo/workforce` үүнийг 0 болгодог тул энд ялгана (null ≠ 0) */
  const blankDay = (v: CompanyDay) => v.workers === 0 && v.mongol == null && v.gadaad == null;

  const rows: TuhRow[] = pkgs.map((p) => {
    const progress = progressOf(p, actual);
    const housing = p.group === 'housing';
    /** Энэ мөр түлхүүрийнхээ өгөгдлийн ЭЗЭН мөн эсэх (`keyOwners`) */
    const own = !!p.pkgKey && owner.get(p.pkgKey) === p.key;
    const months = housing ? monthsBy.get(p.pkgKey) : undefined;
    const lag = months ? lagOf(months) : null;
    const series = housing ? plan?.byBagts.get(p.pkgKey) : undefined;
    const planContractor = lag?.planned ?? (series?.length ? planPctAt(series, today) : null);
    const gapContractor = lag ? lag.actual - lag.planned
      : progress != null && planContractor != null ? progress - planContractor : null;
    const items = cfItemsOf(p);
    /* ⚠️ 2026-09-30: ХЭМЖИЛТИЙН өдрөөр (`measDayOf` = `lagOf`-ийн `at`) — урьд нь энэ САРЫН
       бүтэн төлөвлөгөөг хэдэн долоо хоногийн өмнөх хэмжилттэй жишдэг байв (`cfPlanPctAt`-ийн ⚠️) */
    const planContract = cfPlan ? cfPlanPctAt(cfPlan, items, measDayOf(months, nowYm, today)) : null;
    const gapContract = progress != null && planContract != null ? progress - planContract : null;

    const pack = housing && packs ? packs.find((x) => x.kind === 'build' && x.key === p.pkgKey) : undefined;
    /* ⚠️ 2026-09-30: картын гүйцэтгэлтэй (`physLatest`) НЭГ тодорхойлолт — `tuhData.weekDelta`-ийн ⚠️
       (урьд нь хувьсах хуваагчтай `progressSeries(…, 'latest')` — шинэ блок тайлагнахад сөрөг) */
    const week = housing && hist ? weekDelta(hist, p.pkgKey, today) : null;

    const comm = housing ? (commission?.get(p.pkgKey) ?? null) : null;
    /* ⚠️ 2026-10-01: `assignHo`-ийн онооголт ЭЦСИЙН — дахин түлхүүрээр шүүхгүй (`null`):
       зураг төслийн мөр түлхүүргүй/эцэг кодтой гэрээ авдаг болсон (`ipcOf`-ийн ⚠️). */
    const ipc = ipcOf(null, hoBy.get(p.key) ?? [], ipcNumbers);

    /*
     * ХАБЭА — багцын компаниуд (`Bagts_<SFX>`).
     * ⚠️ 2026-09-30: сүүлийн тайланд ОРООГҮЙ компани (`unreported`) 0 хүн БИШ, мэдээлэлгүй —
     *    урьд нь «Хүн хүч 0 хүн» гэж талбай зогссон мэт харагддаг байв (`ceo/workforce`
     *    өөрөө «тайлангүй» гэж ялгадаг). Өдрийн цувааны хоосон нүд ч мөн `null` (`blankDay`).
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
    const ma = countDocs(mine.filter((d) => d.kind === 'MA'));
    const mir = countDocs(mine.filter((d) => d.kind === 'MIR'));

    /* ⚠️ Системийн «Гүйцэтгэлийн явц»-тай ЯГ ИЖИЛ цэгүүд (2026-09-30, хэрэглэгч:
       «чартуудыг үндсэн системтэй адилхан»). */
    const prog = progMonthsOf(months ?? null, series);
    const allMonths = own ? (monthsBy.get(p.pkgKey) ?? null) : null;
    /* ⚠️ 2026-10-01: багцын ӨӨРИЙН сүүлийн тайлан (урьд нь картад огт байгаагүй, дэлгэрэнгүйд
       төслийн НИЙТ огноо харагддаг байв) — зөвхөн эзэн мөрд (сарын цэг нь түлхүүрийнх) */
    const lastReport = lastReportOf(allMonths);

    return {
      p,
      own,
      progress,
      planContractor,
      gapContractor,
      planContract,
      gapContract,
      /* ⚠️ 2026-10-01: зураг төслийн мөрийн хэмжигдээгүй гүйцэтгэл = «Мэдээлэлгүй» (`statusOf`-ийн ⚠️) */
      status: statusOf({ contracted: p.contracted, progress, gap: lag?.gap ?? null, nullAs: p.group === 'design' ? 'unknown' : 'todo' }),
      week,
      ipc,
      commission: comm,
      delay: daysBetween(p.end, comm),
      blocks: packs ? (pack?.blocks.length ?? 0) : null,
      households: packs ? (pack?.households ?? 0) : null,
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
      lastReport,
      reportAge: reportAge(lastReport, today),
    };
  });

  const housing = rows.filter((r) => r.p.group === 'housing');
  const statusCount = new Map<TuhStatus, number>();
  for (const r of rows) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);

  /* ⚠️ 2026-09-30: «Олгосон санхүүжилт — гэрээгээр» (`IpcTable`)-тай НЭГ томьёо (`ipcTotals`):
     хувийн тоологч = гэрээт дүн нь тодорхой гэрээний олголт (`paidContracted`). Урьд нь
     `hoTotals().paidPct` (БҮХ олголт ÷ тодорхой гэрээт дүн) — дүнгүй гэрээний олголт хувьд
     орж хөөрөгддөг байв. `paid` (нийт олгосон) нь хэвээр БҮХ гэрээнийх. */
  const tot = ipcTotals(contractBlocks(fin.contractsHo));
  const ipcCount = fin.contractsHo.reduce((a, c) => a + ipcNumbers(c.pays).length, 0);
  /* Төслийн хэмжилтийн өдөр — «Гүйцэтгэл» (`PkgProg.TsKpi`) · удирдлагын тайлантай ИЖИЛ */
  const measAll = measDayOf(aggregateMonths(fin), nowYm, `${nowYm}-31`);

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
      planContract: housingPct(housing.map((r) => ({ pct: r.planContract, cost: r.p.cost ?? 0, blocks: r.blocks ?? 0 }))),
      /* ⚠️ 2026-09-30: ХЭМЖИЛТИЙН өдрөөр — урьд нь ӨНӨӨДРӨӨР бодогдож «Гүйцэтгэл»-ийн
         «төлөвлөсөн гүйцэтгэлийн хувь»-аас өөр тоо гардаг байв (нэг үзүүлэлт, хоёр тоо). */
      /* ⚠️ 2026-09-30 (төслийн аудит): төлөвлөгөө ч ХО-оор жигнэсэн (`Finance.projectPlanOf`) —
         бодит нь (`physNow`) ХО-жинтэй тул блокоор жигнэсэн `plan.months`-тэй харьцуулбал зөрүү
         хоёр өөр жинг холино («Гүйцэтгэл» · удирдлагын тайлан · Dashboard ижил дүрэмтэй). */
      planContractor: plan?.months.length ? planPctAt(projectPlanOf(fin, plan), measAll) : null,
    },
    /* ⚠️ 2026-10-01: `other` — «IPC» хуудастай ижил хувьд ороогүй олголтыг тусад нь нэрлэнэ */
    paid: { total: tot.paid, pct: tot.paidPct, ipcCount, pays: tot.pays, other: tot.paidOther },
    statusCount,
    failed: input.failed,
    loading: input.loading ?? new Set<TuhSrc>(),
  };
}
