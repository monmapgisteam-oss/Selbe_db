/**
 * CEO KPI — ГЭРЭЭЛСЭН ба УРЬДЧИЛСАН ТӨСӨВТ ӨРТГИЙН ЗӨРҮҮ, гэрээ бүрээр.
 *
 * Эх сурвалж: `Cashflow_0909` (`CASHFLOW_NEW`) — мөр бүр НЭГ гэрээ (76).
 * `loadFinData().contracts`-аас уншина: санхүүгийн бусад карт (IPC, олголт)
 * ижил татаалтыг хуваалцдаг тул энд шинэ ArcGIS хүсэлт ҮҮСЭХГҮЙ.
 *
 * ⚠️ ЗӨРҮҮНИЙ ТЭМДЭГ: `diff = гэрээ − төсөв`. ЭЕРЭГ = гэрээ төсвөөс ДАВСАН
 *    (асуудал), СӨРӨГ = хэмнэлт. Урвуулбал улаан/ногоон солигдоно.
 *
 * ⚠️ ГЭРЭЭГҮЙ мөр (`Geree_erh_dun` null/0/'') нь «гэрээ хараахан
 *    байгуулагдаагүй» — зөрүү нь `null`, 0 БИШ. Амьд өгөгдөлд (2026-09-06)
 *    76 мөрийн 43 нь ийм: тэднийг 0 зөрүүтэй гэж тоолбол «43 гэрээ яг
 *    төсөвтөө таарсан» гэсэн худал дүр гарна.
 *
 * ⚠️ ТӨСӨВГҮЙ (null/0) мөрөнд ГЭРЭЭ байвал зөрүүг БОДОХГҮЙ (`null`):
 *    `гэрээ − 0` нь «гэрээ бүхэлдээ төсвөөс давсан» гэсэн хуурамч улаан
 *    үүсгэнэ. Ийм мөрийг `noBudget`-д тоолж, тоо нь 0-ээс их бол баримтад
 *    ил гаргана. `mnt(0)` нь угаасаа «—» тул 0 ба null-ыг нэг адил үзэв.
 *
 * ⚠️ Нийлбэр нь ХООСОН орцоос `null` — тэг биш. «Давсан гэрээ алга» үед
 *    `mnt(null)` → «—» гарна; энэ нь зориудынх (null ≠ 0 дүрэм).
 *
 * ⚠️ `contractTotal` ба `budgetTotal` НЭГ СУУРЬТАЙ — хоёулаа ЗӨВХӨН ГЭРЭЭТЭЙ
 *    мөрөөс. Төсвийг БҮХ мөрөөс (гэрээгүй 43-ыг оруулаад) нийлбэрлэвэл
 *    «гэрээлсэн X / төсөв Y» баримт ~1.5 их наядын «хэмнэлт» мэт уншигдана —
 *    үнэндээ тэр нь гэрээ БАЙГУУЛААГҮЙ ажил (өөр картын сэдэв). Гэрээгүй
 *    ажлын төсөв энэ картад ХАМААРАХГҮЙ. Үлдэх зөрүү = Σ diff + төсөвгүй
 *    гэрээний Σ дүн (тэдгээрийн тоо «N гэрээ төсөвт өртөггүй» баримтад ил).
 */

import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { mnt } from '@/lib/format';
import { CASHFLOW_NEW, CF_WORK_WHERE } from '@/lib/services';
import { cell, table, type KpiIssue, type KpiResult, type Level } from './kpi';

/**
 * Төсвөөс давсан гэрээний НИЙТ дүнгийн босго, ₮ — үүнээс дээш бол улаан.
 *
 * ⚠️ САНАЛ (2026-09-06): хэрэглэгч тогтоогоогүй, `kpiLevels.ts`-д ч байхгүй.
 *    1 тэрбум ₮ = төслийн 2.66 их наядын ~0.04% — «нэг гэрээний хэмжээний
 *    давалт» гэсэн уншилт. Ямар ч давалт (1₮ ч гэсэн) шар: төсөвт өртгөөс
 *    давсан гэрээ бүр захирамжийн зөвшөөрөл шаарддаг тул «бага зэрэг» гэж
 *    үл тоох дунд түвшин байхгүй.
 */
export const CONTRACT_OVER_BAD_MNT = 1_000_000_000;

/* ══════════════ Төрөл ══════════════ */

/**
 * Түүхий cashflow мөр.
 * ⚠️ `Record<string, unknown>` — `Finance.tsx`-ийн `Row` ба `query.ts`-ийн `Row`
 *    хоёр ӨӨР төрөл (unknown vs string|number|null); хоёулаа энд багтана.
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
  /** Урьдчилсан төсөвт өртөг, ₮ — null = бөглөөгүй/0 */
  budget: number | null;
  /** Гэрээ байгуулах эрх олгосон дүн, ₮ — null = гэрээгүй */
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
   * толгойн ⚠️); нэг ч байхгүй бол null
   */
  budgetTotal: number | null;
  /** Гэрээгүй мөрийн тоо */
  noContract: number;
  /** Гэрээтэй боловч төсөвгүй мөр — зөрүү бодогдоогүй */
  noBudget: number;
  /** Эх хүснэгтийн нийт мөр */
  total: number;
};

/* ══════════════ Цэвэр тооцоо ══════════════ */

/** Мөнгөн талбар → тоо; null/''/NaN/0 → null (0 нь «бөглөөгүй», дээрх ⚠️) */
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
    const budget = money(r[F.budget]);
    const contract = money(r[F.contractAmount]);
    /* ⚠️ Гэрээгүй мөрийн төсөв ЭНД ХАЯГДАНА — `budgetTotal`-д орохгүй (толгойн ⚠️) */
    if (contract == null) { noContract += 1; continue; }
    if (budget == null) noBudget += 1;
    const diff = budget == null ? null : contract - budget;
    rows.push({
      work: str(r[F.detail]) || str(r[F.project]),
      pkg: str(r[F.pkg2]) || str(r[F.pkg]),
      contractor: str(r[F.contractor]),
      contractNo: str(r[F.contractNo]),
      contractDate: str(r[F.contractDate]),
      budget,
      contract,
      diff,
      /* ⚠️ 0–100 масштаб — `pct()` 100-аар үржүүлдэггүй */
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
    contractTotal: sumOrNull(rows.map((r) => r.contract as number)),
    /* Зөвхөн гэрээтэй мөр (`rows`) — `contractTotal`-тай нэг популяци */
    budgetTotal: sumOrNull(rows.flatMap((r) => (r.budget != null ? [r.budget] : []))),
    noContract,
    noBudget,
    total: raw.length,
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
  /* ⚠️ Зөвхөн БАЙГАА үед — «0 гэрээ төсөвгүй» гэсэн хоосон баримт хэрэггүй */
  if (g.noBudget > 0) facts.push(tr('{0} гэрээ төсөвт өртөггүй', g.noBudget));

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
    /* ⚠️ `Geree_ognoo` нь гэрээ БАЙГУУЛСАН огноо — өгөгдлийн агшин биш */
    asOf: null,
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/** Хуучрах хугацаа — `loadFinData`-гийн 60с-ээс урт байх нь утгагүй */
const TTL_MS = 60_000;

export const loadContractGapKpi = cached<KpiResult>(async () => {
  /*
   * ⚠️ ДИНАМИК импорт: `Finance.tsx` нь React модуль — модулийн түвшинд
   *    импортловол нүүр хуудасны chunk-д орж, `contractGap.check.mjs`
   *    Node-д JSX-ийг ачаалж чадахгүй унана.
   */
  const { loadFinData } = await import('@/modules/Finance');
  let rows: RawRow[];
  try {
    rows = (await loadFinData()).contracts;
  } catch (e) {
    /*
     * ⚠️ `loadFinData` нь IPC · блокийн түүх · хуваарийн муруйг ХАМТ татдаг —
     *    тэдгээрийн аль нэг унавал гэрээний мөр уншигдах боломжтой байсан ч
     *    бүхэлдээ унана. Ганц хүснэгтийг ШУУД дахин асууна; тэр ч унавал
     *    ЮУ Ч ачаалагдаагүй тул throw.
     */
    const { queryFeatures } = await import('@/lib/query');
    const F = CASHFLOW_NEW.fields;
    rows = await queryFeatures(CASHFLOW_NEW.url, {
      where: CF_WORK_WHERE,
      outFields: [
        F.detail, F.project, F.pkg, F.pkg2, F.budget, F.contractAmount,
        F.contractor, F.contractNo, F.contractDate, F.amountNote,
      ],
      orderBy: `${CASHFLOW_NEW.oid} ASC`,
    }).catch(() => { throw e; });
  }
  return { ...buildContractGapKpi(computeContractGap(rows)), failedSources: [] };
}, TTL_MS, ['CASHFLOW_NEW']);
