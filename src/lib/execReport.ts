/**
 * УДИРДЛАГЫН ТАЙЛАН — шийдвэр гаргагчид зориулсан ТОВЧ тайлангийн өгөгдөл.
 *
 * ДӨРВӨН эх сурвалжийн ДЭЛГЭЦ ДЭЭРХ тоог ЯГ ТЭР ХЭВЭЭР нь нэгтгэнэ:
 *   · 01. Ерөнхий дашбоард  — `GeneralDash.KpiStrip` (`gdash.kpisOf`)
 *   · 05. Багцын гүйцэтгэл  — `PkgProg.TsKpi` (биет vs төлөвлөгөө) + багцууд
 *   · 04. Багцын санхүү     — `PkgFin.pkgFinRows` (гэрээ vs олгосон)
 *   · Зөвшөөрөл             — `zovshoorol.summarize`
 */

import { cached, loadFillPkgProgress } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, mnt, monthKey, sentenceCase, dayKey } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, kpisOf, chartTypeCost, chartSourceMerged, isContracted,
  planScopeNote, type ProgressSrc,
} from '@/lib/gdash';
import { FIN_XL_ROW_HIDE } from '@/lib/finExcelLayout';
import { loadLandStatus } from '@/lib/land';
import { loadNegtgelFull, negtgelProjectPct, type NegtgelRow, type NegtgelCalc } from '@/lib/negtgel';
import { loadPlanCurveCached, coverageOk } from '@/lib/planProgress';
import { loadZov, summarize, byBagts, TOLOV } from '@/lib/zovshoorol';
import { PROGRESS_LEVELS, pkgKeyOf, hoAmount, HO_IPC } from '@/lib/services';
import { finPkgKey } from '@/lib/pkgAlias';
import { loadBuildings, uniqueBlocks } from '@/modules/BuildingPanel';
import { levelCounts } from '@/lib/blockProgress';
import { buildPacks, blockCount } from '@/modules/Bagts';
import { loadFinData, projectLagNow, typePhysNow, INFRA_TYPE } from '@/modules/Finance';
import { physNow, aggregateMonths } from '@/modules/PkgProg';
import { pkgFinRows } from '@/modules/PkgFin';
import { hoTotals } from '@/lib/ipc';
import { loadFinance } from '@/lib/reportData';
import { paidPctOf } from '@/lib/paidShare';
import { arcgisToken, relayFetch, RelayError } from '@/lib/agent/client';

/* ═══════════════ Төрөл ═══════════════ */

export type ExecReport = {
  /** 01. Ерөнхий дашбоард — дээд зурвасын зургаан индикатор + төрлийн задаргаа */
  gdash: {
    budget: number;
    contract: number;
    /** Төслийн нийт гүйцэтгэл (`Negtgel_guitsetgel`, унавал 6 шатны бодолт), 0–100; хэмжигдээгүй бол null */
    progress: number | null;
    /**
     * `progress`-ийн эх (2026-09-25) — дэлгэц · PDF · PNG · AI баримт шошгоо
     * ҮҮНЭЭС авна (`gdash.progressLabel`/`progressSub`).
     */
    progressSrc: ProgressSrc;
    progressPlan: number | null;
    packages: number;
    types: number;
    landPct: number | null;
    /**
     * Газар чөлөөлөлт — 01-ийн «Газар чөлөөлөлт» карттай ИЖИЛ эх (`loadLandStatus`):
     * төлөв бүрийн тоо ба чөлөөлөгдөөгүй шалтгаанууд (тоогоор буурах).
     */
    land: {
      total: number; cleared: number; remaining: number; areaM2: number;
      byStatus: { label: string; n: number; areaM2: number }[];
      reasons: { label: string; n: number }[];
    };
    /**
     * ХАБ — 01-ийн «ХАБ» карттай ИЖИЛ (`loadHseNow`): СҮҮЛИЙН бөглөгдсөн
     * бүртгэлийн агшин; `null` = бүртгэл алга (0 БИШ).
     */
    hse: { date: string; workers: number | null; equipment: number | null; manHours: number | null } | null;
    /** Ажлын төрөл бүрийн төсөв · гэрээлсэн · гүйцэтгэл (өртгөөр буурах) */
    byType: { label: string; cost: number; contract: number; perf: number | null; n: number; contracted: number }[];
    /**
     * ЗАХИРАМЖИЙН ЭХ ҮҮСВЭР — мөнгө ба ажлын тоо (дүнгээр буурах).
     */
    bySource: { label: string; amount: number; contracted: number; n: number }[];
  };
  /** 05. Багцын гүйцэтгэл */
  prog: {
    blocks: number;
    households: number;
    householdsMissing: number;
    /** Бөглөгдөөгүй блок */
    noData: number;
    asOf: string;
    /** Орон сууцны биет гүйцэтгэл — ХО дүнгээр жигнэсэн (`gdash.housingPct`, 2026-09-30), одоогийн сар хүртэлх сүүлийн хэмжилт */
    actual: number | null;
    /** Хуваарийн төлөвлөгөө — `actual`-ийн хэмжилтийн огноонд завсарласан (2026-09-25) */
    planned: number | null;
    /** төлөвлөгөө − бодит; эерэг = хоцрогдол */
    gap: number | null;
    actualLag: number | null;
    planExcluded: string[];
    planCoverage: number | null;
    planFailed: number;
    packs: { key: string; name: string; kind: 'build' | 'infra'; blocks: number; households: number; householdsMissing: number; progress: number | null }[];
    /** Блокийн гүйцэтгэлийн түвшний тархалт */
    levels: { label: string; range: string; n: number; color: string }[];
  };
  /**
   * 04. Багцын санхүү.
   */
  fin: {
    /** Гэрээлсэн нийт дүн — `gdash.contract`-тай ИЖИЛ (CONTRACTED мөр) */
    planTotal: number;
    /**
     * Олгосон санхүүжилт — HO төлбөрийн БҮХ мөрийн нийлбэр (`hoTotals.paid`,
     * `reportData.finance.paid`-тай ИЖИЛ эх, 530.87 тэрбум). Багцын Map-ийн
     * нийлбэр (524.90) БИШ — диапазон мөрийн 5.97 тэрбум тэнд алдагддаг (`ipc.ts`).
     */
    given: number | null;
    givenContracted: number;
    /**
     * ГЭРЭЭЛСЭН БАГЦААС ГАДУУРХ олголт, ₮ = `given − givenContracted` (`paidShare.paidOther`).
     */
    givenOther: number;
    /** `givenContracted ÷ planTotal` — «олгосон дүн гэрээлсэн дүнд эзлэх хувь» */
    share: number | null;
    /** `planTotal − givenContracted`; 2026-10-09: олголт уншигдаагүй (`given == null`) бол `null` («—») */
    remain: number | null;
    rows: {
      key: string; label: string;
      /** Гэрээлсэн дүн (CONTRACTED мөр); гэрээгүй бол 0 */
      plan: number;
      /** Гэрээт багцад `PkgFin.plan`; гэрээгүй багцад ЗӨВХӨН төсөв (`ho_dun_geree`, 2026-09-21) */
      budget: number;
      given: number;
      /** given ÷ plan; гэрээгүй (`contracted = false`) бол null */
      pct: number | null;
      contracted: boolean;
      rangePaid?: string;
    }[];
  };
  /** Зөвшөөрөл — үйлчилгээ холбогдоогүй бол `null` (мэдээлэлгүй ≠ 0) */
  zov: {
    total: number; ok: number; wait: number; no: number; unknown: number;
    byBagts: { bagts: string; total: number; ok: number; wait: number; no: number; unknown: number }[];
    /** Анхаарал шаардах мөрүүд — зөвшөөрөөгүй ба хүлээгдэж буй */
    issues: { bagts: string; ner: string; baiguullaga: string; tolov: string; shat: number }[];
  } | null;
  /**
   * Өгөгдөл ХЭЗЭЭ татагдсан (epoch мс) — 2026-09-30. Тайлан 5 мин кэштэй тул
   * толгойн «Огноо» (зурсан агшин) ≠ өгөгдлийн агшин; `Tailan`-ийн `fetchedAt`-тай ижил.
   */
  fetchedAt: number;
};

/* ═══════════════ Ачаалагч ═══════════════ */

export const loadExecReport = cached(loadExecReportRaw, 5 * 60_000,
  ['CASHFLOW_NEW', 'HO_IPC', 'BAGTS_SHEET', 'BUILDING', 'PARCEL_LEFT', 'HABEA', 'ZOVSHOOROL', 'HUVAARI_OBYEM', 'TUSUL_NEGTGEL']);

async function loadExecReportRaw(): Promise<ExecReport> {
  const [cf, contracts, land, fillProg, bld, fin, plan, zovRows, hse, finance, wbs] = await Promise.all([
    loadGdashCf(),
    loadContractSum(),
    loadLandStatus(),
    loadFillPkgProgress(),
    loadBuildings(),
    loadFinData(),
    loadPlanCurveCached(),
    loadZov().catch(() => null),
    loadHseNow().catch(() => null),
    loadFinance(),
    loadNegtgelFull()
      .then((f) => ({ pct: negtgelProjectPct(f.rows, f.calc), plan: negtgelProjectPlan(f.rows, f.calc) }))
      .catch(() => null),
  ]);
  const wbsPct = wbs?.pct ?? null;

  /* ── 05. Багцын гүйцэтгэл — `PkgProg.TsKpi`-тай ИЖИЛ ── */
  const packs = buildPacks(bld.rows, bld.pkgPct);
  const nowYm = monthKey();
  const actual = physNow(fin, nowYm);
  let lastM: { label: string; physAt?: string | null } | null = null;
  for (const m of aggregateMonths(fin)) if (m.label <= nowYm && m.phys != null) lastM = m;
  const physAsOf = lastM ? (lastM.physAt ?? lastM.label) : '';
  const lagNow = projectLagNow(fin, plan, nowYm, dayKey(Date.now()));
  const planned: number | null = lagNow.planned;
  const gap = lagNow.gap;

  /* ── 01. Ерөнхий дашбоард — `GeneralDash.KpiStrip`-тэй ИЖИЛ ── */
  const csum = cf.reduce((s, r) => (r.inTotal && isContracted(r) ? s + (contracts.get(r.oid) ?? 0) : s), 0);
  const k = kpisOf(cf, csum, land.pct, wbsPct);
  const catPct = new Map<string, number>();
  if (actual != null) catPct.set('ОРОН СУУЦНЫ ХОРООЛОЛ', actual);
  const infra = typePhysNow(fin, cf, INFRA_TYPE, nowYm);
  if (infra) catPct.set(INFRA_TYPE, infra.pct);
  /**
   * «7 БОНДЫН ХҮҮ» нь санхүүжилтийн хүснэгтээс аль хэдийн нуугдсан
   * (`FIN_XL_ROW_HIDE`, 2026-09-10-ны заавар: «хүмүүст ерөөсөө харуулахгүй»)
   * атлаа тайлангийн ажлын төрлийн чартад «0 ₮ · —» гэсэн хоосон мөр болж
   * гарсаар байв. Мөнгө нь 0 тул нийлбэр хөндөгдөхгүй.
   */
  const shown = cf.filter((r) => !FIN_XL_ROW_HIDE.includes(r.sec));
  const byType = chartTypeCost(shown, fillProg, catPct, contracts)
    .map((b) => ({
      label: sentenceCase(b.label), cost: b.value, contract: b.sub, perf: b.perf ?? null,
      n: b.count ?? 0, contracted: b.countSub ?? 0,
    }))
    .sort((a, b) => b.cost - a.cost);
  const bySource = chartSourceMerged(cf).map((b) => ({
    label: sentenceCase(b.label), amount: b.value, contracted: b.sub, n: b.count ?? 0,
  }));

  /* ── 04. Багцын санхүү — `PkgFin.pkgFinRows`-тэй ИЖИЛ ── */
  const pf = pkgFinRows(packs, fin);
  const finGiven = hoTotals(fin.pays).paid;
  const budgetByKey = new Map<string, number>();
  for (const r of cf) {
    const ks = new Set([pkgKeyOf(r.pkg2), pkgKeyOf(r.pkg)].filter((k) => k && k !== '0').map(finPkgKey));
    for (const k of ks) budgetByKey.set(k, (budgetByKey.get(k) ?? 0) + r.cost);
  }
  const finRows = pf.rows.map((r) => ({
    key: r.key, label: r.label,
    plan: r.contract,
    budget: r.contracted ? r.plan : budgetByKey.get(r.key) ?? r.plan,
    given: r.given,
    pct: r.rangePaid ? null : r.contracted && r.contract > 0 ? (r.given / r.contract) * 100 : null,
    contracted: r.contracted,
    rangePaid: r.rangePaid,
  }));
  const finGivenContracted = finance.paidContracted;
  if (finGiven != null) {
    const HC = HO_IPC.contractFields;
    const rowKeys = new Set(finRows.filter((r) => r.contracted).map((r) => r.key));
    const parents = new Set<string>();
    for (const r of cf) {
      if (!r.inTotal || !isContracted(r)) continue;
      const k2 = pkgKeyOf(r.pkg2);
      const k3 = pkgKeyOf(r.pkg);
      if (k2 && k3 && k3 !== '0' && finPkgKey(k2) !== finPkgKey(k3)) parents.add(finPkgKey(k3));
    }
    let inRows = 0;
    let inParents = 0;
    for (const p of fin.pays) {
      const n = hoAmount(p);
      const k = pkgKeyOf(p[HC.pkg]);
      if (n == null || !k) continue;
      const fk = finPkgKey(k);
      if (rowKeys.has(fk)) inRows += n;
      else if (parents.has(fk)) inParents += n;
    }
    const miss = finGivenContracted - inRows - inParents;
    if (miss > 1) {
      console.warn('[execReport] гэрээлсэн олголтын нэг хэсэг багцын мөрд ороогүй', { paidContracted: finGivenContracted, inRows, inParents, miss });
    }
  }

  /* ── Зөвшөөрөл ── */
  let zov: ExecReport['zov'] = null;
  if (zovRows) {
    const s = summarize(zovRows);
    const groups = [...byBagts(zovRows)].map(([bagts, list]) => ({ bagts, ...summarize(list) }))
      .sort((a, b) => a.bagts.localeCompare(b.bagts, 'mn', { numeric: true }));
    const issues = zovRows
      .filter((r) => r.tolov !== TOLOV.ok)
      .sort((a, b) => (a.tolov === TOLOV.no ? -1 : 1) - (b.tolov === TOLOV.no ? -1 : 1) || a.bagts.localeCompare(b.bagts, 'mn', { numeric: true }) || a.shat - b.shat)
      .map((r) => ({
        bagts: r.bagts, ner: r.ner, baiguullaga: r.baiguullaga, shat: r.shat,
        tolov: r.tolov === 'unknown' ? tr('Танигдаагүй төлөв') : r.tolov,
      }));
    zov = {
      total: s.total, ok: s.ok, wait: s.wait, no: s.no, unknown: s.unknown,
      byBagts: groups.map((g) => ({ bagts: g.bagts, total: g.total, ok: g.ok, wait: g.wait, no: g.no, unknown: g.unknown })),
      issues,
    };
  }

  const lvCounts = levelCounts(bld.prog, bld.keys);
  const lvKeys = new Set<string>(bld.keys);
  bld.prog.forEach((_, key) => lvKeys.add(key));
  let lvNoData = 0;
  lvKeys.forEach((key) => {
    const v = bld.prog.get(key)?.overall;
    if (v == null || !Number.isFinite(v)) lvNoData += 1;
  });
  const lvByPkg = new Map<string, Set<string>>();
  lvKeys.forEach((key) => {
    const cut = key.indexOf('|');
    const pk = cut < 0 ? key : key.slice(0, cut);
    const s = lvByPkg.get(pk) ?? new Set<string>();
    s.add(key);
    lvByPkg.set(pk, s);
  });
  return {
    gdash: {
      budget: k.budget, contract: k.contract, progress: k.progress, progressSrc: k.progressSrc,
      progressPlan: k.progressSrc === 'negtgel' ? wbs?.plan ?? null : null,
      packages: k.packages, types: k.types, landPct: land.pct,
      land: {
        total: land.total, cleared: land.cleared, remaining: land.remaining, areaM2: land.areaM2,
        byStatus: land.byStatus.map((b) => ({ label: b.label, n: b.n, areaM2: b.areaM2 })),
        reasons: land.reasons.map((r) => ({ label: r.label, n: r.n })),
      },
      hse: hse ? { date: hse.date, workers: hse.workers, equipment: hse.equipment, manHours: hse.manHours } : null,
      byType,
      bySource,
    },
    prog: {
      blocks: lvKeys.size, households: bld.households,
      householdsMissing: bld.blocks > 0 && bld.householdsMissing >= bld.blocks ? lvKeys.size
        : householdsMissingOf(lvKeys, uniqueBlocks(bld.rows).map((b) => b.key), bld.householdsMissing),
      noData: lvNoData, asOf: physAsOf,
      actual, planned, gap,
      actualLag: lagNow.actual, planExcluded: lagNow.excluded,
      planCoverage: lagNow.coverage,
      planFailed: plan.failed.length,
      packs: packs.map((p) => {
        const ub = uniqueBlocks(p.blocks);
        const polyMissing = ub.filter((b) => b.ailMissing).length;
        const lv = p.kind === 'build' ? lvByPkg.get(p.key) : undefined;
        return {
          key: p.key, name: p.name, kind: p.kind, blocks: lv ? lv.size : blockCount(p),
          households: p.households,
          householdsMissing: lv ? householdsMissingOf(lv, ub.map((b) => b.key), polyMissing) : polyMissing,
          progress: p.progress,
        };
      }),
      levels: PROGRESS_LEVELS.map((l, i) => ({
        label: l.label, range: l.range, color: l.color,
        n: lvCounts[i],
      })),
    },
    fin: {
      planTotal: csum, given: finGiven,
      givenContracted: finGivenContracted,
      givenOther: finGiven == null ? 0 : Math.max(0, finGiven - finGivenContracted),
      share: finGiven != null ? paidPctOf(finance.paidContracted, finance.contractAmount) : null,
      remain: finGiven == null ? null : Math.max(0, csum - finGivenContracted),
      rows: finRows,
    },
    zov,
    fetchedAt: Date.now(),
  };
}

/**
 * «НЭГТГЭЛ ГҮЙЦЭТГЭЛ»-ИЙН ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ (0–100) — `negtgel.negtgelProjectPct`-ийн ЯГ НЭГ томьёо, гүйцэтгэлийн оронд
 * төлөвлөгөөт хувь (`NegtgelCalc.planPct`): Σ 1-р түвшний (төсөлд эзлэх × төлөвлөгөө) ÷ 100.
 */
export function negtgelProjectPlan(rows: readonly NegtgelRow[], calc: ReadonlyMap<number, NegtgelCalc>): number | null {
  let w = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.depth !== 1) continue;
    const c = calc.get(r.oid);
    if (!c || c.inProject == null) continue;
    if (c.planPct == null) {
      if (c.inProject > 0) return null;
      continue;
    }
    w += c.inProject;
    sum += (c.inProject * c.planPct) / 100;
  }
  return w > 0 ? sum : null;
}

/* ═══════════════ Дүгнэлт — дүрэмд суурилсан ═══════════════ */

/**
 * АНХААРАХ АСУУДЛУУД — амьд тооноос үүсэх өгүүлбэрүүд. AI байхгүй үед ч
 * тайлан дүгнэлттэй байна; AI дүгнэлт нь ҮҮНИЙГ ОРЛОХГҮЙ, ХАЖУУД нь гарна.
 */
/**
 * Нэг дүгнэлт — ТАЙЛАНГИЙН МӨР (2026-09-17, хэрэглэгчийн заавар:
 * «ойлгомжтой тайлангийн формат руу оруул»).
 */
export type ExecFinding = {
  /** Хүндрэлийн зэрэг: bad = шийдвэр шаардсан, warn = анхаарах, info = мэдээлэл */
  sev: 'bad' | 'warn' | 'info';
  /** Аль хэсгийн асуудал бэ — тайлангийн бүлгийн нэр */
  area: string;
  /** Нэг өгүүлбэр — тоог агуулсан гол мэдэгдэл */
  text: string;
  /** Нэрсийн жагсаалт (багц, талбар…) — өгүүлбэрт ЦУВУУЛАХГҮЙ */
  items?: string[];
  /**
   * ЗӨВЛӨМЖ — энэ асуудалд авах үйл ажиллагаа.
   */
  advice?: string;
};

/**
 * ХОЦРОГДЛЫН БОСГО — (төлөвлөсөн − бодит) нэгж хувь энэ ба түүнээс дээш бол
 * «хоцрогдол». Дэлгэц (`Meter`, ExecReport KPI) · PDF · инфографик ·
 * `execFindings` ТАВУУЛАА ЭНЭ НЭГ тоог хэрэглэнэ — 2026-09-24-нд хатуу бичсэн
 * 5-уудыг нэгтгэв.
 */
export const LATE_GAP = 5;

/**
 * АНХААРАХ АСУУДЛУУД — амьд тооноос үүсэх бүтэцтэй мөрүүд.
 */
export function execFindings(x: ExecReport): ExecFinding[] {
  const out: ExecFinding[] = [];
  const A_PROG = tr('Гүйцэтгэл');
  const A_FIN = tr('Санхүүжилт');
  const A_LAND = tr('Газар чөлөөлөлт');
  const A_ZOV = tr('Зөвшөөрөл');
  const A_DATA = tr('Мэдээллийн бүрэн байдал');

  /* ── Зөвшөөрөл — ажил эхлүүлэхэд шууд саад ── */
  if (x.zov) {
    if (x.zov.no > 0) {
      out.push({
        sev: 'bad', area: A_ZOV,
        text: tr('{0} зөвшөөрөл олгогдоогүй, ажил эхлүүлэх шийдвэрт шууд нөлөөлнө.', num(x.zov.no)),
        advice: tr('Олгосон байгууллагатай яаралтай уулзаж татгалзсан үндэслэлийг тодруулан, шаардлагатай нэмэлт материалыг бүрдүүлж дахин хүсэлт гаргах.'),
      });
    }
    if (x.zov.wait > 0) {
      out.push({
        sev: 'warn', area: A_ZOV,
        text: tr('{0} зөвшөөрөл хүлээгдэж байна.', num(x.zov.wait)),
        advice: tr('Холбогдох байгууллагуудаас хариу өгөх хугацааг баталгаажуулж, шаардлагатай бол зохицуулах хурал зарлан шийдвэрлэх хугацааг товлох.'),
      });
    }
    if (x.zov.unknown > 0) {
      out.push({ sev: 'info', area: A_ZOV, text: tr('{0} зөвшөөрлийн төлөв танигдахгүй байна, бүртгэлийг засах шаардлагатай.', num(x.zov.unknown)) });
    }
  } else {
    out.push({ sev: 'info', area: A_ZOV, text: tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ тайланд зөвшөөрлийн мэдээлэл ороогүй.') });
  }

  /* ── Санхүүжилт ── */
  if (x.fin.share != null && x.fin.share < 20) {
    out.push({
      sev: 'bad',
      area: A_FIN,
      text: tr('Гэрээний дүнгийн ердөө {0} нь олгогдсон; олгогдоогүй үлдэгдэл {1}.', pct(x.fin.share, 1), mnt(x.fin.remain)),
      advice: tr('Санхүүжилтийн графикийг гэрээний хуваарьтай уялдуулан дахин хянаж, олголтын саатлын шалтгааныг багц тус бүрээр тодруулах.'),
    });
  }
  const lowFin = x.fin.rows.filter((r) => r.pct != null && r.pct < 10 && r.plan > 0);
  if (lowFin.length) {
    out.push({
      sev: 'warn',
      area: A_FIN,
      text: tr('{0} багцын санхүүжилт гэрээний дүнгийн 10%-д хүрээгүй.', num(lowFin.length)),
      advice: tr('Санхүүжилтийн эрэмбийг тухайн ажлын эхлэх хуваарьтай уялдуулан дахин харах; олголт огт эхлээгүй багцуудын явцыг сар бүр хянах.'),
      items: lowFin.map((r) => r.label),
    });
  }
  if (x.gdash.budget > 0 && x.gdash.contract > 0) {
    const share = (x.gdash.contract / x.gdash.budget) * 100;
    if (share < 90) {
      out.push({
        sev: 'warn',
        area: A_FIN,
        text: tr('Нийт төсвийн {0} нь гэрээгээр баталгаажсан; {1} гэрээлэгдээгүй үлдсэн.', pct(share, 1), mnt(x.gdash.budget - x.gdash.contract)),
        advice: tr('Үлдэгдэл ажлын гүйцэтгэгч сонгон шалгаруулах, гэрээ байгуулах ажлыг эрчимжүүлж төлөвлөгөөт хугацаанд багтаах.'),
      });
    }
  }

  /* ── Газар чөлөөлөлт ── */
  if (x.gdash.landPct != null && x.gdash.land.remaining > 0) {
    const top = x.gdash.land.reasons[0];
    out.push({
      sev: 'warn',
      area: A_LAND,
      text: top
        ? tr('Газар чөлөөлөлт {0}, {1} нэгж талбар чөлөөлөгдөөгүй. Гол шалтгаан «{2}» ({3} талбар).', pct(x.gdash.landPct, 1), num(x.gdash.land.remaining), tr(top.label), num(top.n))
        : tr('Газар чөлөөлөлт {0}, {1} нэгж талбар чөлөөлөгдөөгүй.', pct(x.gdash.landPct, 1), num(x.gdash.land.remaining)),
      advice: tr('Үлдсэн талбаруудад зориулсан хэлэлцээрийн баг байгуулж, гол шалтгаан тус бүрээр шийдвэрлэх хугацаатай зорилт тавих.'),
    });
  }

  /* ── Гүйцэтгэл ── */
  const stalled = x.prog.packs.filter((p) => p.kind === 'build' && p.progress != null && p.progress < 5);
  if (stalled.length) {
    out.push({
      sev: 'bad',
      area: A_PROG,
      text: tr('{0} багц 5%-иас доош гүйцэтгэлтэй.', num(stalled.length)),
      advice: tr('Эдгээр багцын ажил эхлэхэд саад болж буй хүчин зүйлийг (зөвшөөрөл, газар, санхүүжилт) тус бүрд нь тодруулж, хариуцагч томилох.'),
      items: stalled.map((p) => p.name),
    });
  }
  if (x.prog.gap != null && !coverageOk(x.prog.planCoverage)) {
    out.push({
      sev: 'warn',
      area: A_PROG,
      text: tr('Орон сууцны барилга угсралтын хуваарь {0} хамарсан тул хоцрогдлыг дүгнэсэнгүй (төлөвлөгөө {1}, бодит {2}).',
        x.prog.planCoverage == null ? '—' : pct(x.prog.planCoverage, 1), pct(x.prog.planned, 1), pct(x.prog.actualLag, 1)),
      advice: tr('Багц бүрийн хуваарийг (ажлын эхлэх, дуусах огноо) бүрэн бөглүүлж, хамралт 95%-д хүрсний дараа хоцрогдлыг үнэлэх.'),
    });
  } else if (x.prog.gap != null && x.prog.gap >= LATE_GAP) {
    out.push({
      sev: 'warn',
      area: A_PROG,
      text: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар хоцорч байна (төлөвлөгөө {1}, бодит {2}).', num(x.prog.gap, 1), pct(x.prog.planned, 1), pct(x.prog.actualLag, 1))
        + (x.prog.planExcluded.length ? ` ${planScopeNote(x.prog.planExcluded)}.` : ''),
      advice: tr('Хоцрогдолтой блокуудад хүн хүч, техник хэрэгслийн нэмэлт хуваарилалт хийж, сар бүрийн биет хэмжилтээр явцыг хянах.'),
    });
  } else if (x.prog.gap != null && x.prog.gap < 0) {
    out.push({
      sev: 'info',
      area: A_PROG,
      text: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар түрүүлж байна.', num(-x.prog.gap, 1)),
      advice: tr('Одоогийн хурдыг барихын тулд хүн хүч, техник хэрэгслийн хуваарилалтыг тогтвортой хадгалж, хамгийн бага гүйцэтгэлтэй багцуудад нэмэлт анхаарал хандуулах.'),
    });
  }

  /* ── Мэдээллийн дутуу байдал — тоог гажуудуулдаг тул ЗААВАЛ хэлнэ ── */
  if (x.prog.noData > 0) {
    out.push({
      sev: 'info',
      area: A_DATA,
      text: tr('{0} блокийн гүйцэтгэл хараахан бөглөгдөөгүй тул биет хувьд 0%-иар тооцогдсон.', num(x.prog.noData)),
    });
  }
  if (!x.gdash.hse) {
    out.push({
      sev: 'info',
      area: A_DATA,
      text: tr('ХАБ-ын хүн хүчний бүртгэл олдсонгүй, талбайн ажиллах хүчний мэдээлэл энэ тайланд алга.'),
    });
  }
  return out;
}

/**
 * §3/§4 САНХҮҮЖИЛТИЙН БАГЦУУДЫН ГУРВАН АНГИЛАЛ (2026-09-21) — дэлгэц ба PDF
 * ХОЁУЛАА эндээс: нэг дүрэм, хоёр хэлбэр.
 *
 *   · `started` — олголт эхэлсэн (гэрээт ч, гэрээгүй ч — олголттой бол харуулна)
 *   · `zero`    — ГЭРЭЭТ боловч олголт огт хийгдээгүй («Эхлээгүй ажил»)
 *   · `none`    — ГЭРЭЭ БАЙГУУЛААГҮЙ (зөвхөн төсөвтэй), олголтгүй
 */
export function execFinSplit(x: ExecReport): {
  started: ExecReport['fin']['rows']; zero: ExecReport['fin']['rows']; none: ExecReport['fin']['rows'];
} {
  const rows = x.fin.rows;
  return {
    started: rows.filter((r) => r.given > 0 || !!r.rangePaid),
    zero: rows.filter((r) => r.given === 0 && r.contracted && !r.rangePaid),
    none: rows.filter((r) => r.given === 0 && !r.contracted && !r.rangePaid),
  };
}

/** Хавсралтын нэг бүлэг — дугаар нь ЭНД л бодогдоно */
export type ExecAppendix = {
  /** 1-ээс эхэлсэн дугаар — дүгнэлт дэх «хавсралт N» заалт ЯГ үүнийг хэлнэ */
  no: number;
  title: string;
  kind: 'finZero' | 'finNone' | 'finding';
  /** `kind === 'finding'` үед эх дүгнэлт */
  finding?: ExecFinding;
  /** Нэрсийн жагсаалт (дэлгэц/PDF шууд зурна) */
  items: string[];
};

/**
 * ХАВСРАЛТЫН ДУГААРЛАЛТ — ГАНЦ ЭХ (2026-09-21).
 */
export function execAppendix(x: ExecReport, findings: readonly ExecFinding[]): ExecAppendix[] {
  const { zero, none } = execFinSplit(x);
  const out: ExecAppendix[] = [];
  if (zero.length) {
    out.push({
      no: out.length + 1, kind: 'finZero',
      title: tr('Олголт эхлээгүй {0} гэрээт багц', num(zero.length)),
      items: zero.map((r) => `${r.label} · ${r.plan > 0 ? `${num(r.plan)} ₮` : tr('гэрээний дүн бөглөгдөөгүй')}`),
    });
  }
  if (none.length) {
    out.push({
      no: out.length + 1, kind: 'finNone',
      title: tr('Гэрээ байгуулаагүй {0} багц (төсөвт өртгөөр)', num(none.length)),
      items: none.map((r) => `${r.label} · ${num(r.budget)} ₮`),
    });
  }
  for (const f of findings) {
    if (!f.items?.length) continue;
    out.push({ no: out.length + 1, kind: 'finding', title: f.text, finding: f, items: f.items });
  }
  return out;
}

/** Дүгнэлтийн хавсралтын дугаар; жагсаалтгүй дүгнэлтэд `null` */
export const execAppendixNo = (app: readonly ExecAppendix[], f: ExecFinding): number | null =>
  app.find((a) => a.finding === f)?.no ?? null;

/**
 * ЗӨВХӨН МЭДЭГДЭЛ — нэрсийн жагсаалтгүй (2026-09-17).
 */
export function execFindingBrief(x: ExecReport): string[] {
  return execFindings(x).map((f) => f.text);
}

/* ═══════════════ AI дүгнэлт ═══════════════ */

/**
 * Загварт өгөх КОМПАКТ өгөгдөл — тайлангийн бүх тоо, гэхдээ товч.
 */
/**
 * ӨРХИЙН ТОО — дэлгэц/PDF/инфографикт НЭГ хэлбэр (Dashboard · Tailan-ы `ailTotal`-тай ижил).
 */
/**
 * ӨРХИЙН МЭДЭЭЛЭЛГҮЙ БЛОКИЙН ТОО (цэвэр — тест) — `AIL_TOO` хоосон полигон (`polyMissing`) + блокийн олонлогт
 * (`keys`) бий атлаа газрын зурагт ПОЛИГОНГҮЙ блок. 2026-10-23: дээд хязгаар нь блокийн тоо.
 */
export function householdsMissingOf(keys: ReadonlySet<string>, polyKeys: readonly string[], polyMissing: number): number {
  const poly = new Set(polyKeys);
  let noPoly = 0;
  keys.forEach((k) => { if (!poly.has(k)) noPoly += 1; });
  return Math.min(keys.size, polyMissing + noPoly);
}

export const householdsLabel = (p: { blocks: number; households: number; householdsMissing: number }): string =>
  p.blocks > 0 && p.householdsMissing >= p.blocks ? '—'
    : p.householdsMissing > 0 ? `${num(p.households)} (${tr('дутуу')})` : num(p.households);

export function execFacts(x: ExecReport): string {
  const L: string[] = [];
  L.push(`## 01. Ерөнхий дашбоард`);
  L.push(`Нийт төсөв: ${num(x.gdash.budget)} ₮`);
  L.push(`Нийт гэрээлсэн дүн: ${num(x.gdash.contract)} ₮`);
  L.push(`Гүйцэтгэлийн хувь (${x.gdash.progressSrc === 'negtgel' ? 'нэгтгэл гүйцэтгэлээр' : '6 шатаар — нэгтгэл гүйцэтгэл уншигдаагүй'}): ${x.gdash.progress == null ? 'мэдээлэлгүй' : pct(x.gdash.progress, 1)}`);
  if (x.gdash.progressPlan != null) L.push(`Гүйцэтгэлийн хувийн өөрийн төлөвлөгөө (нэгтгэл гүйцэтгэл): ${pct(x.gdash.progressPlan, 1)}`);
  L.push(`Багц ажлын тоо: ${x.gdash.packages}; төрлийн тоо: ${x.gdash.types}`);
  L.push(`Газар чөлөөлөлт: ${x.gdash.landPct == null ? 'мэдээлэлгүй' : pct(x.gdash.landPct, 1)} (нийт ${x.gdash.land.total}, чөлөөлсөн ${x.gdash.land.cleared}, үлдсэн ${x.gdash.land.remaining})`);
  L.push(`Газар чөлөөлөлт төлвөөр: ${x.gdash.land.byStatus.map((b) => `${b.label} ${b.n}`).join('; ') || '—'}`);
  L.push(`Чөлөөлөгдөөгүй шалтгаан: ${x.gdash.land.reasons.map((r) => `${r.label} ${r.n}`).join('; ') || '—'}`);
  L.push(`ХАБ (сүүлийн бүртгэл ${x.gdash.hse?.date || '—'}): ${x.gdash.hse ? `ажиллаж буй хүн ${x.gdash.hse.workers ?? '—'}, техник ${x.gdash.hse.equipment ?? '—'}, хүн цаг ${x.gdash.hse.manHours ?? '—'}` : 'мэдээлэлгүй'}`);
  L.push(`Ажлын төрлөөр (төсөв / гэрээлсэн / гүйцэтгэл):`);
  const cl = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/^\s*#+\s*/, '').trim();
  for (const t of x.gdash.byType) L.push(`- ${cl(t.label)}: ${num(t.cost)} / ${num(t.contract)} / ${t.perf == null ? '—' : pct(t.perf, 1)} (${t.n} ажил, ${t.contracted} гэрээлсэн)`);
  L.push(`## 05. Багцын гүйцэтгэл (орон сууцны барилга угсралт)`);
  const hh = x.prog.blocks > 0 && x.prog.householdsMissing >= x.prog.blocks
    ? 'мэдээлэлгүй'
    : x.prog.householdsMissing > 0
      ? `${x.prog.households} (дутуу — ${x.prog.householdsMissing} блок өрхгүй)`
      : String(x.prog.households);
  L.push(`Блок: ${x.prog.blocks}; өрх: ${hh}; бөглөгдөөгүй блок: ${x.prog.noData}; сүүлийн хэмжилт: ${x.prog.asOf || '—'}`);
  L.push(`Бодит (орон сууцны багцууд): ${x.prog.actual == null ? '—' : pct(x.prog.actual, 1)}; бодит (зөрүүний тал, хуваарьтай багцаар): ${x.prog.actualLag == null ? '—' : pct(x.prog.actualLag, 1)}; төлөвлөсөн: ${x.prog.planned == null ? '—' : pct(x.prog.planned, 1)}; зөрүү (төлөвлөгөө−зөрүүний бодит): ${x.prog.gap == null ? '—' : num(x.prog.gap, 1)}`);
  L.push(`Хуваарийн хамралт (төлөвлөгөөнд огноотой ажлын жин): ${x.prog.planCoverage == null ? '—' : pct(x.prog.planCoverage, 1)}${coverageOk(x.prog.planCoverage) ? '' : ' — 95%-иас бага тул хоцрогдол/түрүүлэлт гэж ДҮГНЭХГҮЙ'}`);
  if (x.prog.planExcluded.length) {
    L.push(`Төлөвлөгөө ба зөрүү ЗӨВХӨН хуваарьтай багцаар (зөрүүний бодит тал ${x.prog.actualLag == null ? '—' : pct(x.prog.actualLag, 1)}); хуваарьгүй тул хасагдсан: ${x.prog.planExcluded.join(', ')}`);
  }
  for (const p of x.prog.packs) L.push(`- ${cl(p.name)}: ${p.progress == null ? 'мэдээлэлгүй' : pct(p.progress, 1)}${p.kind === 'build' ? ` (${p.blocks} блок, ${householdsLabel(p)} өрх)` : ''}`);
  L.push(`Блокийн түвшин: ${x.prog.levels.map((l) => `${l.label} ${l.range}: ${l.n}`).join('; ')}`);
  L.push(`## 04. Багцын санхүү`);
  L.push(`Гэрээлсэн нийт (01-тэй ижил): ${num(x.fin.planTotal)} ₮; олгосон: ${x.fin.given == null ? 'мэдээлэлгүй' : `${num(x.fin.given)} ₮`} (${x.fin.share == null ? '—' : pct(x.fin.share, 1)}); үлдэгдэл: ${x.fin.remain == null ? 'мэдээлэлгүй' : `${num(x.fin.remain)} ₮`}`);
  for (const r of x.fin.rows) {
    L.push(r.contracted
      ? `- ${cl(r.label)}: гэрээлсэн ${r.plan > 0 ? `${num(r.plan)} ₮` : 'мэдээлэлгүй (гэрээний дүн бөглөгдөөгүй)'}, олгосон ${num(r.given)} ₮ (${r.pct == null ? '—' : pct(r.pct, 1)})`
      : `- ${cl(r.label)}: ГЭРЭЭ БАЙГУУЛААГҮЙ (төсөв ${num(r.budget)} ₮), олгосон ${num(r.given)} ₮`);
  }
  L.push(`## Зөвшөөрөл`);
  if (!x.zov) L.push(`Мэдээлэлгүй (үйлчилгээ холбогдоогүй).`);
  else {
    L.push(`Нийт ${x.zov.total}: зөвшөөрсөн ${x.zov.ok}, хүлээгдэж буй ${x.zov.wait}, зөвшөөрөөгүй ${x.zov.no}, танигдаагүй ${x.zov.unknown}`);
    for (const g of x.zov.byBagts) L.push(`- ${cl(g.bagts)}: ${g.ok}/${g.total} зөвшөөрсөн, ${g.wait} хүлээгдэж, ${g.no} зөвшөөрөөгүй`);
    for (const i of x.zov.issues.slice(0, 20)) L.push(`  · ${cl(i.bagts)} · ${cl(i.shat)}-р шат · ${cl(i.ner)} — ${cl(i.tolov)} (${cl(i.baiguullaga) || '—'})`);
  }
  return L.join('\n');
}

const SYSTEM = `Чи «Сэлбэ ухаалаг хот» төслийн удирдлагын тайлангийн туслах. Хэрэглэгч чамд төслийн дөрвөн дашбоардын ӨНӨӨДРИЙН тоог өгнө. Чи шийдвэр гаргагчид (хотын удирдлага, төслийн захирал) зориулсан ТОВЧ, ОЙЛГОМЖТОЙ дүгнэлт МОНГОЛООР бичнэ.

ХАТУУ ДҮРЭМ:
1. ЗӨВХӨН өгөгдсөн тоог хэрэглэ. Тоо зохиохгүй, таамаглахгүй, гаднын мэдлэг нэмэхгүй.
2. «мэдээлэлгүй» гэсэн зүйлийг 0 гэж бүү ойлго — «мэдээлэл алга» гэж ил хэл.
3. Хувь нь өгөгдсөн хэлбэрээрээ (аравтын нэг орон) — бүхэлчлэхгүй.
4. Бүтэц: (а) «Гол дүгнэлт» — 3–5 өгүүлбэр; (б) «Анхаарах асуудал» — хамгийн ихдээ 5 зүйл, чухлаас нь эхэлж; (в) «Санал болгох шийдвэр» — 2–4 зүйл, тус бүр нэг өгүүлбэр.
5. Markdown ГАРЧИГ, ТОД, ХҮСНЭГТ хэрэглэхгүй — зөвхөн энгийн текст, мөр бүр «•»-ээр эхэлсэн жагсаалт. Хэсгийн нэрийг мөрийн эхэнд том үсгээр, ард нь хоёр цэг.
6. Нийт 220 үгээс хэтрэхгүй.`;

/**
 * AI дүгнэлт — реле (`agent-proxy`) → Anthropic. Хэрэгсэлгүй, нэг эргэлт:
 * бүх тоо аль хэдийн `execFacts`-д байгаа тул загвар ArcGIS руу хандах
 * шаардлагагүй. Ингэснээр хариулт хурдан, тоо нь дэлгэцтэй ЯГ ижил.
 */
/** AI дүгнэлтийн дээд хүлээлт, мс — үүнээс хойш «Бодож байна…» мөнхөд гацахгүй */
export const EXEC_AI_TIMEOUT_MS = 60_000;

export async function askExecSummary(x: ExecReport, signal?: AbortSignal): Promise<string> {
  const token = await arcgisToken();
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), EXEC_AI_TIMEOUT_MS);
  if (signal?.aborted) ac.abort();
  else signal?.addEventListener('abort', () => ac.abort(), { once: true });
  let res: Response;
  type Reply = {
    content?: { type: string; text?: string }[]; error?: string; note?: string; stop_reason?: string; code?: string;
  };
  let reply: Reply;
  const body = JSON.stringify({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Огноо: ${dayKey(Date.now())}.\n\n${execFacts(x)}`,
    }],
  });
  const post = (tk: string | null) => relayFetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tk ? { 'x-arcgis-token': tk } : {}),
    },
    body,
    signal: ac.signal,
  });
  try {
    res = await post(token);
    reply = (await res.json().catch(() => ({}))) as Reply;
    if (res.status === 401 && !reply.code && token && !ac.signal.aborted) {
      const fresh = await arcgisToken(true);
      if (fresh && fresh !== token) {
        res = await post(fresh);
        reply = (await res.json().catch(() => ({}))) as Reply;
      }
    }
  } catch (e) {
    if (ac.signal.aborted && !signal?.aborted) {
      throw new Error(tr('AI дүгнэлт {0} секундэд ирсэнгүй. Дахин оролдоно уу.', EXEC_AI_TIMEOUT_MS / 1000));
    }
    throw e;
  } finally {
    clearTimeout(tm);
  }
  if (!res.ok) {
    if (res.status === 401 || reply.code) throw new RelayError(res.status, reply.error, reply.code);
    throw new Error(reply.error ?? tr('Реле алдаа (HTTP {0})', res.status));
  }
  if (reply.stop_reason === 'refusal') return reply.note ?? tr('Энэ хүсэлтэд хариулах боломжгүй байна.');
  const text = (reply.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
  if (reply.stop_reason === 'max_tokens') {
    const note = tr('⚠️ Хариу тасарсан (хэт урт болсон) — асуултаа хувааж эсвэл товчлон асууна уу.');
    return text ? `${text}\n\n${note}` : note;
  }
  return text || tr('Хариулт хоосон ирлээ.');
}
