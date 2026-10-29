/**
 * CEO KPI — ГЭРЭЭЛСЭН ба УРЬДЧИЛСАН ТӨСӨВТ ӨРТГИЙН ЗӨРҮҮ, гэрээ бүрээр.
 *
 * Эх сурвалж: `Cashflow_0909` (`CASHFLOW_NEW`) — мөр бүр НЭГ гэрээ (76).
 * `loadFinData.contracts`-аас уншина: санхүүгийн бусад карт (IPC, олголт)
 * ижил татаалтыг хуваалцдаг тул энд шинэ ArcGIS хүсэлт ҮҮСЭХГҮЙ.
 */

import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { mnt } from '@/lib/format';
import { CASHFLOW_NEW, CF_WORK_WHERE } from '@/lib/services';
import { isContracted } from '@/lib/gdash';
import { finXlInTotal, FIN_XL_TOTAL_CODE_FIELD } from '@/lib/finExcelLayout';
import { cell, table, type KpiIssue, type KpiResult, type Level } from './kpi';

/**
 * Төсвөөс давсан гэрээний НИЙТ дүнгийн босго, ₮ — үүнээс дээш бол улаан.
 */
export const CONTRACT_OVER_BAD_MNT = 1_000_000_000;

/* ══════════════ Төрөл ══════════════ */

/**
 * Түүхий cashflow мөр.
 */
export type RawRow = Record<string, unknown>;

export type ContractGapRow = {
  /** Ажлын нэр — `Nariiwchilsan_turul`, хоосон бол `Tusul` */
  work: string;
  /** Багцын шошго — дэд багц (`Ded_bagts`) байвал тэр, үгүй бол `Bagts` */
  pkg: string;
  contractor: string;
  contractNo: string;
  /** Гэрээний огноо — мөр (`Geree_ognoo` нь String талбар) */
  contractDate: string;
  /** Захирамжийн ХО төсөв (`ho_dun_zahiramj`), ₮ — null = бөглөөгүй/0 (2026-10-04, толгой) */
  budget: number | null;
  /** Гэрээний дүн (`geree_dun`), ₮ — null = гэрээтэй (CONTRACTED) боловч дүн бөглөөгүй */
  contract: number | null;
  /** гэрээ − төсөв, ₮ — аль нэг нь null бол null */
  diff: number | null;
  /** diff / төсөв × 100 (0–100 масштаб, `pct()`-д шууд өгнө) */
  diffPct: number | null;
};

export type ContractGap = {
  /** ГЭРЭЭТЭЙ бүх мөр — зөрүү буурах эрэмбээр (хэмнэлт доор, бодогдоогүй нь хамгийн доор) */
  rows: ContractGapRow[];
  /** Төсвөөс давсан: тоо ба Σ diff (эерэг) — давсан гэрээ байхгүй бол sum=null */
  over: { count: number; sum: number | null };
  /** Төсвөөс бага: тоо ба Σ diff (СӨРӨГ) — байхгүй бол sum=null */
  under: { count: number; sum: number | null };
  /** Σ гэрээний дүн (гэрээтэй мөрүүд) — нэг ч байхгүй бол null */
  contractTotal: number | null;
  /**
   * Σ төсөвт өртөг — ЗӨВХӨН ГЭРЭЭТЭЙ мөрүүд (`contractTotal`-тай нэг суурь,
   * толгой); нэг ч байхгүй бол null
   */
  budgetTotal: number | null;
  /** Гэрээгүй мөрийн тоо */
  noContract: number;
  /** Гэрээтэй боловч төсөвгүй мөр — зөрүү бодогдоогүй */
  noBudget: number;
  /** Төсөвгүй гэрээний Σ дүн — `contractTotal`-д ОРОХГҮЙ (2026-10-21, толгой); нэг ч байхгүй бол null */
  noBudgetSum: number | null;
  /** Эх хүснэгтийн нийт мөр */
  total: number;
};

/* ══════════════ Цэвэр тооцоо ══════════════ */

/** Мөнгөн талбар → тоо; null/''/NaN/0 → null (0 нь «бөглөөгүй», дээрх) */
const money = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) && x !== 0 ? x : null;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Хоосон массивын нийлбэр `null` — «хэмжилтгүй» ба «тэг» ялгаатай */
const sumOrNull = (xs: readonly number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) : null;

/**
 * Түүхий cashflow мөрүүд → зөрүүний тооцоо. Сүлжээгүй, огноогүй —
 * `contractGap.check.mjs` шууд импортлон шалгана.
 */
export function computeContractGap(raw: readonly RawRow[]): ContractGap {
  const F = CASHFLOW_NEW.fields;
  const rows: ContractGapRow[] = [];
  let noContract = 0;
  let noBudget = 0;

  for (const r of raw) {
    if (!finXlInTotal(r)) continue;
    const budget = money(r[F.budgetOrder]);
    const contract = money(r[F.contractAmount]);
    if (!isContracted(r)) { noContract += 1; continue; }
    if (budget == null) noBudget += 1;
    const diff = budget == null || contract == null ? null : contract - budget;
    rows.push({
      work: str(r[F.detail]) || str(r[F.project]),
      pkg: str(r[F.pkg2]) || str(r[F.pkg]),
      contractor: str(r[F.contractor]),
      contractNo: str(r[F.contractNo]),
      contractDate: str(r[F.contractDate]),
      budget,
      contract,
      diff,
      diffPct: diff == null || budget == null ? null : (diff / budget) * 100,
    });
  }

  /* Зөрүү буурах — давсан нь дээр, хэмнэлт доор, бодогдоогүй (null) хамгийн доор */
  rows.sort((a, b) => {
    if (a.diff == null) return b.diff == null ? 0 : 1;
    if (b.diff == null) return -1;
    return b.diff - a.diff;
  });

  const overDiffs = rows.flatMap((r) => (r.diff != null && r.diff > 0 ? [r.diff] : []));
  const underDiffs = rows.flatMap((r) => (r.diff != null && r.diff < 0 ? [r.diff] : []));

  return {
    rows,
    over: { count: overDiffs.length, sum: sumOrNull(overDiffs) },
    under: { count: underDiffs.length, sum: sumOrNull(underDiffs) },
    contractTotal: sumOrNull(rows.flatMap((r) => (r.budget != null && r.contract != null ? [r.contract] : []))),
    /* Зөвхөн гэрээтэй, ДҮНТЭЙ мөр — `contractTotal`-тай нэг популяци (дүнгүй
       CONTRACTED мөрийн төсөв орвол тааруулалт эвдэрнэ) */
    budgetTotal: sumOrNull(rows.flatMap((r) => (r.budget != null && r.contract != null ? [r.budget] : []))),
    noContract,
    noBudget,
    noBudgetSum: sumOrNull(rows.flatMap((r) => (r.budget == null && r.contract != null ? [r.contract] : []))),
    total: raw.filter((r) => finXlInTotal(r)).length,
  };
}

/**
 * Түвшин: давсан гэрээ байвал Σ давалт ≥ босго → улаан, үгүй бол шар;
 * давсан гэрээ огт байхгүй → ногоон; ГЭРЭЭТЭЙ мөр нэг ч байхгүй → unknown
 * (зөрүү хэмжигдэх зүйл өөрөө байхгүй — «сайн» гэж хэлж болохгүй).
 */
export function contractOverLevel(g: ContractGap): Level {
  if (!g.rows.length) return 'unknown';
  if (g.over.count === 0) return 'good';
  return (g.over.sum ?? 0) >= CONTRACT_OVER_BAD_MNT ? 'bad' : 'warn';
}

const gapCells = (r: ContractGapRow) => [
  cell(r.work),
  cell(r.pkg || null),
  cell(r.contractor || null),
  cell(r.contractNo || null),
  cell(r.budget, 'mnt'),
  cell(r.contract, 'mnt'),
  cell(r.diff, 'mnt'),
  cell(r.diffPct, 'pct'),
];

/** Тооцоо → картын гэрээ. Цэвэр — `failedSources`-ыг дуудагч нэмнэ. */
export function buildContractGapKpi(g: ContractGap): Omit<KpiResult, 'failedSources'> {
  const overRows = g.rows.filter((r) => r.diff != null && r.diff > 0);

  const facts: string[] = [
    tr('{0} гэрээ төсвөөс давсан', g.over.count),
    g.under.count > 0
      ? tr('{0} гэрээ төсвөөс бага ({1})', g.under.count, mnt(Math.abs(g.under.sum ?? 0)))
      : tr('{0} гэрээ төсвөөс бага', 0),
    tr('гэрээлсэн {0} / төсөв {1}', mnt(g.contractTotal), mnt(g.budgetTotal)),
  ];
  if (g.noBudget > 0) {
    facts.push(g.noBudgetSum == null
      ? tr('{0} гэрээ төсөвт өртөггүй', g.noBudget)
      : tr('{0} гэрээ төсөвт өртөггүй ({1})', g.noBudget, mnt(g.noBudgetSum)));
  }

  const cols = [
    tr('Ажил'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Гэрээний дугаар'),
    tr('Төсөвт өртөг'), tr('Гэрээний дүн'), tr('Зөрүү'), tr('Зөрүү %'),
  ];

  const issues: KpiIssue[] = overRows.map((r) => ({
    tone: 'warn',
    text: tr('{0} · {1} — гэрээ төсвөөс {2} их', r.work, r.pkg, mnt(r.diff)),
  }));

  return {
    value: mnt(g.over.sum),
    unit: tr('төсвөөс давсан гэрээ'),
    facts,
    level: contractOverLevel(g),
    tables: [
      table(tr('Төсвөөс давсан гэрээ'), cols, overRows.map(gapCells)),
      table(tr('Бүх гэрээ — зөрүүгээр'), cols, g.rows.map(gapCells)),
    ],
    issues,
    asOf: null,
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/** Хуучрах хугацаа — `loadFinData`-гийн 60с-ээс урт байх нь утгагүй */
const TTL_MS = 60_000;

export const loadContractGapKpi = cached<KpiResult>(async () => {
  const { loadFinData } = await import('@/modules/Finance');
  let rows: RawRow[];
  try {
    rows = (await loadFinData()).contracts;
  } catch (e) {
    const { queryFeatures } = await import('@/lib/query');
    const F = CASHFLOW_NEW.fields;
    rows = await queryFeatures(CASHFLOW_NEW.url, {
      where: CF_WORK_WHERE,
      outFields: [
        F.detail, F.project, F.pkg, F.pkg2, F.budgetOrder, F.contractAmount,
        F.contractor, F.contractNo, F.contractDate, F.amountNote, FIN_XL_TOTAL_CODE_FIELD,
      ],
      orderBy: `${CASHFLOW_NEW.oid} ASC`,
    }).catch(() => { throw e; });
  }
  return { ...buildContractGapKpi(computeContractGap(rows)), failedSources: [] };
}, TTL_MS, ['CASHFLOW_NEW']);
