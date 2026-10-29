/**
 * ТАЙЛАНГИЙН ӨРГӨТГӨСӨН ӨГӨГДӨЛ — 8–11-р хэсгийн БҮХ тоо ЭНД нэгтгэгдэнэ.
 */

import { useAsync, type Async } from '@/lib/useAsync';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { queryFeatures } from '@/lib/query';
import { cached, loadClearance } from '@/lib/live';
import { layerTotals } from '@/lib/totals';
import {
  BUILDING, CASHFLOW_NEW, HABEA, HO_IPC, LAYER_GROUPS, GROUP_LAYERS, LAYER_BY_ID,
  bagtsKey, pkgKeyOf, laborCompanyFields, CF_WORK_WHERE,
} from '@/lib/services';
import { housingPct, pkgCostWeight, cfWeightRow } from '@/lib/gdash';
import { paidShareOf, paidPctOf } from '@/lib/paidShare';
import { finPkgKey } from '@/lib/pkgAlias';
import { loadNegtgelPct } from '@/lib/negtgel';
import { latestLaborRow, laborHeadOf, EDIT_DATE_FIELD, OID_FIELD, ubDayKey } from '@/lib/ceo/workforce';
import { isBlankIncident } from '@/lib/ceo/safety';
import { isClearedStatus, loadLandStatus } from '@/lib/land';
import {
  finXlInTotal, FIN_XL_WORK_SKIP, FIN_XL_TOTAL_CODE_FIELD, FIN_XL_LAND_CODE, FIN_XL_ROW_HIDE,
} from '@/lib/finExcelLayout';

/* ═══════════════ Төрөл ═══════════════ */

export type BlockRow = { block: string; bagts: string; pct: number };

export type ReportExtra = {
  /**
   * Төслийн НИЙТ гүйцэтгэл — БАГЦААР, төсвийн жингээр.
   */
  overall: {
    /**
     * Жингээр нормчилсон нийт гүйцэтгэл, 0–100.
     */
    pct: number | null;
    /**
     * Жингийн нийлбэр, 0–100 — гүйцэтгэл бүртгэгдсэн багцуудын эзлэх төсвийн
     * хувь. 100-аас бага бол зарим багц хараахан бөглөгдөөгүй гэсэн үг.
     */
    weightSum: number;
    /** Тооцоонд орсон БЛОКИЙН тоо */
    rows: number;
    stages: {
      label: string;
      /** Тухайн багцын блокийн тоо */
      rows: number;
      /** Төслийн төсөвт эзлэх хувь, 0–100 */
      weight: number;
      /** Бодит гүйцэтгэл, 0–100 */
      actual: number;
      planned: number | null;
    }[];
  };
  /** Газар чөлөөлөлт — `land:left` давхарга */
  land: {
    parcels: number | null;
    areaM2: number | null;
    /** Шийдвэрлэгдсэн нэгж талбарын эзлэх хувь, 0–100 */
    pct: number | null;
    byStatus: { label: string; n: number }[];
    /** Үлдсэн нэгж талбарын шалтгаан — хоосон нүд орохгүй */
    byReason: { label: string; n: number }[];
  };
  /** Нийгмийн үйлчилгээний барилга — «Нийгмийн дэд бүтэц» багцын давхаргууд */
  social: {
    rows: { title: string; n: number; areaM2: number }[];
    n: number;
    areaM2: number | null;
  };
  progress: {
    blocks: number;
    /** Гүйцэтгэл нь тайлагнасан блок (2026-10-04) */
    reported: number;
    /**
     * Блокуудын гүйцэтгэлийн дундаж, % — дашбоардын толгойн тоотой нэг загвар.
     */
    overall: number | null;
    /** Хамгийн сүүлийн тайлагнасан огноо */
    date: string;
    /** Үе шат тус бүрийн дундаж гүйцэтгэл */
    phases: { no: string; name: string; pct: number }[];
    byBagts: { bagts: string; blocks: number; pct: number }[];
    /** Хамгийн бага гүйцэтгэлтэй 10 блок */
    slowest: BlockRow[];
    /**
     * 1%-иас доош гүйцэтгэлтэй БҮХ блокийн тоо.
     */
    stalled: number;
  };
  finance: {
    /** Багц ажлын тоо — 74 (газар чөлөөлөлтийн 4 мөр тоологдохгүй) */
    rows: number;
    /** Нийт төсөв — Excel-ийн НИЙТ хамрах хүрээгээр (2,493,041,880,532 ₮) */
    budget: number;
    orderTotal: number;
    /** Гэрээлсэн дүн — зөвхөн `note === CONTRACTED` мөр, `inTotal` хүрээ (2026-09-21) */
    contractAmount: number;
    paidContracted: number;
    /** `paid − paidContracted` — гэрээлсэн багцад холбогдоогүй (диапазон мөр, гэрээгүй багц) төлбөр, ₮ */
    paidOther: number;
    /** Газар чөлөөлөлт, буулгалт цэвэрлэгээ — НИЙТ дүнгээс ГАДУУР, ₮ */
    landBudget: number;
    sources: { label: string; value: number }[];
    /**
     * Бодитоор олгосон санхүүжилт — `HO_IPC`-ийн БҮХ ТӨЛБӨРИЙН нийлбэр, ₮.
     */
    paid: number | null;
    /**
     * «Олгосон ÷ гэрээлсэн» хувь, 0–100 — `paidShare.pct` ЯГ (дахин бодохгүй).
     */
    paidPct: number | null;
    byType: { type: string; n: number; budget: number; contract: number }[];
    /** «Ажлын төрлөөр» хүснэгтийн НИЙТ мөр — БҮХ мөрөөр (задаргаатай нийцнэ); `contract` CONTRACTED шүүлттэй */
    byTypeTotal: { budget: number; contract: number };
    /** Багцын түлхүүр (`BagtsRow.key`) → урьдчилсан төсөвт өртөг, ₮ */
    byBagts: Record<string, number>;
  };
  infra: {
    groups: {
      key: string; title: string; layers: number;
      n: number; len: number; area: number;
    }[];
    totals: { layers: number; n: number; len: number | null; area: number | null };
  };
  habea: {
    date: string;
    workers: number; mongol: number | null; gadaad: number | null; tehnik: number;
    byCompany: {
      label: string; bagts: string | null;
      workers: number; mongol: number | null; gadaad: number | null; tehnik: number;
    }[];
    incidents: number;
  };
  /** Өгөгдөл ХЭЗЭЭ татагдсан (epoch мс) — 5 мин кэш тул толгойд харуулна (2026-09-23) */
  fetchedAt: number;
  /**
   * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ, 0–100 — «Нэгтгэл гүйцэтгэл»-ийн 1-р түвшний жигнэсэн
   * дүн (`negtgel.loadNegtgelPct`), ерөнхий дашбоардын «Гүйцэтгэлийн хувь» ба
   * удирдлагын тайлантай ЯГ НЭГ эх.
   */
  projectPct: number | null;
};

/* ═══════════════ Туслах ═══════════════ */

const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const sumOrNull = (xs: readonly (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

const str = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** `БАГЦ1|5/1` → `{ bagts: 'БАГЦ1', block: '5/1' }` */
function splitKey(key: string): { bagts: string; block: string } {
  const i = key.indexOf('|');
  return i < 0 ? { bagts: '', block: key } : { bagts: key.slice(0, i), block: key.slice(i + 1) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

/**
 * «БАРИЛГЫН АЖИЛ» → «Барилгын ажил».
 */
const sentenceCase = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  // Зөвхөн ТОМ үсгээр бичигдсэн үед л хөрвүүлнэ — зөв бичсэнийг эвдэхгүй
  return t === t.toLocaleUpperCase('mn-MN') && t !== t.toLocaleLowerCase('mn-MN')
    ? t.charAt(0) + t.slice(1).toLocaleLowerCase('mn-MN')
    : t;
};

/* ═══════════════ Багцын нэр ═══════════════ */

/**
 * `bagtsKey` → УНШИГДАХ нэр («БАГЦ32» → «Багц 3.2»).
 */
const loadPkgLabels = cached(async (): Promise<Map<string, string>> => {
  const rows = await queryFeatures(BUILDING.url, { outFields: [BUILDING.fields.bagts] });
  const m = new Map<string, string>();
  rows.forEach((b) => {
    const name = str(b[BUILDING.fields.bagts]);
    if (name) m.set(bagtsKey(name), name);
  });
  return m;
}, 5 * 60_000, ['BUILDING']);

/* ═══════════════ Төслийн нийт гүйцэтгэл ═══════════════ */

/**
 * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ — багц бүрийн блокийн дундажийг ТӨСВИЙН ЖИНГЭЭР.
 */
/**
 * Урьд нь эдгээр нь модулийн дотоод, кэшгүй байсан бөгөөд гадагш зөвхөн
 * `loadReportExtra` гарч байв. Тиймээс энэ дүнгийн ЖИЖИГ хэсэг хэрэгтэй
 * хэрэглэгч (ж: «Үйл ажиллагааны схем») бүтэн тайланг татах шаардлагатай
 * болж, дагаад `loadInfra`-ийн ~88 stat хүсэлт явдаг байлаа.
 */
/**
 * §2-ын «Багц хоорондын гүйцэтгэлийн зөрүү их байна» өгүүлбэрийн босго, нэгж хувь — дэлгэц (`Tailan`) ба PDF/мэйл (`reportPdf`) НЭГ.
 */
export const BAGTS_GAP_PTS = 20;

export const loadOverall = cached(loadOverallRaw, 5 * 60_000, ['BAGTS_SHEET', 'CASHFLOW_NEW', 'BUILDING']);

async function loadOverallRaw(): Promise<ReportExtra['overall']> {
  const F = CASHFLOW_NEW.fields;
  const { loadPkgProgress } = await import('@/lib/blockProgress');
  const [byPkg, labels, cf] = await Promise.all([
    loadPkgProgress(),
    loadPkgLabels(),
    /* Зөвхөн 3 талбар — `loadFinance` нь «*»-оор бүтнээр татдаг ч энэ нь
       тусдаа кэштэй дуудалт тул хөнгөн байлгав. */
    queryFeatures(CASHFLOW_NEW.url, {
      where: CF_WORK_WHERE,
      outFields: [F.pkg2, F.pkg, F.budget, FIN_XL_TOTAL_CODE_FIELD],
    }),
  ]);

  /** багцын түлхүүр → урьдчилсан төсөвт өртөг, ₮ */
  const budget = pkgCostWeight(cf.map(cfWeightRow));

  /* багц → БҮХ блокийн дундаж (0–100, тайлагнаагүй блок 0%) ба блокийн тоо (`byPkg` дээр). */

  /* Төсвийн НИЙТ дүн — жинг 0–1 болгож нормчилох хуваарь */
  const budgetAll = [...budget.values()].reduce((a, b) => a + b, 0);

  const raw = [...byPkg.entries()].map(([pkg, m]) => ({
    label: labels.get(pkg) ?? pkg,
    rows: m.total,
    money: budget.get(pkg) ?? 0,
    // `cell.overall` нь аль хэдийн 0–100 — хөрвүүлэлт ХЭРЭГГҮЙ
    actual: m.pct,
    planned: null as number | null,
  }));

  const useMoney = budgetAll > 0 && raw.some((s) => s.money > 0);
  const denom = useMoney ? budgetAll : raw.reduce((a, s) => a + s.rows, 0);

  const stages = raw
    .map(({ money, ...s }) => ({
      ...s,
      weight: denom ? ((useMoney ? money : s.rows) / denom) * 100 : 0,
    }))
    .sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label, 'mn', { numeric: true }));

  const weightSum = stages.reduce((a, s) => a + s.weight, 0);
  const housing = housingPct(raw.map((s) => ({ pct: s.actual, cost: s.money, blocks: s.rows })));

  return {
    pct: housing,
    weightSum,
    rows: stages.reduce((a, s) => a + s.rows, 0),
    stages,
  };
}

/* ═══════════════ Газар чөлөөлөлт ═══════════════ */

/**
 * ШИЙДВЭРЛЭГДЭЭГҮЙГ таних ЦОРЫН ГАНЦ дүрэм.
 */
const isLeftParcel = (label: string) => !isClearedStatus(label);

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ.
 */
export const loadLand = cached(loadLandRaw, 5 * 60_000, ['PARCEL_LEFT']);

async function loadLandRaw(): Promise<ReportExtra['land']> {
  const d = LAYER_BY_ID['land:left'];
  if (!d?.url) return { parcels: null, areaM2: null, pct: null, byStatus: [], byReason: [] };
  /* Зөвхөн тоолдог 2 талбар (2026-08-21 гүйцэтгэлийн аудит): «*» нь 2,119
     парселийн БҮХ баганыг (эзний нэр, хаяг зэрэг хувийн мэдээллийг оролцуулаад)
     ~2-4МБ-аар татдаг байв — тайланд огт хэрэггүй. */
  const st = await loadLandStatus();
  const byStatus = st.byStatus
    .map(({ label, n }) => ({ label, n }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n);
  const clearance = await loadClearance();

  return {
    parcels: st.total,
    areaM2: st.areaM2,
    pct: clearance.pct,
    byStatus,
    byReason: byStatus.filter((s) => isLeftParcel(s.label)),
  };
}

/* ═══════════════ Нийгмийн үйлчилгээний барилга ═══════════════ */

async function loadSocial(): Promise<ReportExtra['social']> {
  const ids = GROUP_LAYERS.pkgSoc ?? [];
  const rows = (await Promise.all(ids.map(async (id) => {
    const d = LAYER_BY_ID[id];
    if (!d) return null;
    try {
      const t = await layerTotals(d, '1=1');
      const isM2 = d.qty?.unit === 'м²';
      return { title: d.title, n: t.n, areaM2: isM2 ? (t.q ?? 0) : 0, missing: isM2 && t.q == null };
    } catch (e) { throw new Error(tr('{0}: давхарга уншигдсангүй ({1})', d.title, String((e as Error)?.message ?? e))); }
  }))).filter((r): r is NonNullable<typeof r> => !!r);

  return {
    rows: rows.map(({ missing: _m, ...r }) => r),
    n: rows.reduce((a, r) => a + r.n, 0),
    areaM2: rows.some((r) => r.missing) ? null : rows.reduce((a, r) => a + r.areaM2, 0),
  };
}

/* ═══════════════ Барилга угсралтын гүйцэтгэл ═══════════════ */

export const loadProgress = cached(loadProgressRaw, 5 * 60_000, ['BAGTS_SHEET', 'BUILDING']);

async function loadProgressRaw(): Promise<ReportExtra['progress']> {
  const { loadBlockProgress, loadBlockUniverse, pkgProgressOf, universeKeys, latestMean } = await import('@/lib/blockProgress');
  const [map, uni, labelOf] = await Promise.all([
    loadBlockProgress(),
    loadBlockUniverse(),
    loadPkgLabels(),
  ]);

  const label = (k: string) => labelOf.get(k) ?? (k || '—');

  type Phase = { no: string; name: string; pct: number | null };
  const keys = universeKeys(map, uni);
  const rows: (BlockRow & { date: string; phases: readonly Phase[]; reported: boolean })[] =
    keys.map((key) => {
      const v = map.get(key);
      return {
        ...splitKey(key),
        pct: v ? nn(v.overall) : 0,
        date: v?.date ?? '',
        phases: v?.phases ?? [],
        reported: !!v,
      };
    });
  /* багц бүрийн хувь — `pkgProgressOf` (§2 `joinBagts` · §3 `loadOverall` · Дашбоардтай НЭГ функц) */
  const byPkg = pkgProgressOf(map, uni);
  /* нийт — блокийн энгийн дундаж, тайлангүй 0% (`latestMean` — Дашбоардын бөгжтэй НЭГ) */
  const mean0 = latestMean(map, keys);

  /*
   * Үе шатны дундаж — үе шатны дугаараар нэгтгэнэ (блок бүрт ижил 5 үе шат).
   */
  const phaseMap = new Map<string, { no: string; name: string; xs: number[] }>();
  rows.forEach((r) => r.phases.forEach((p) => {
    const e = phaseMap.get(p.no) ?? { no: p.no, name: p.name, xs: [] };
    if (p.pct != null && Number.isFinite(p.pct)) e.xs.push(p.pct);
    phaseMap.set(p.no, e);
  }));

  return {
    blocks: rows.length,
    reported: rows.filter((r) => r.reported).length,
    overall: mean0.pct,
    date: rows.map((r) => r.date).filter(Boolean).sort().pop() ?? '',
    /**
     * `mean([])` нь 0 буцаадаг тул нэг ч блокт хувь бүртгэгдээгүй үе шат
     * «0.00%» гэж хэвлэгдэж, улмаар тайлангийн дүгнэлтэд «N үе шат
     * хараахан ЭХЛЭЭГҮЙ байна» гэсэн ХУДАЛ өгүүлбэр болдог байв —
     * «хэмжигдээгүй» ба «эхлээгүй» хоёр огт өөр утга. Хэмжилттэй үе шат
     * л жагсаалтад орно.
     */
    phases: [...phaseMap.values()]
      .filter((p) => p.xs.length > 0)
      .sort((a, b) => a.no.localeCompare(b.no, 'mn'))
      .map((p) => ({ no: p.no, name: sentenceCase(p.name), pct: mean(p.xs) })),
    byBagts: [...byPkg.entries()]
      .map(([k, m]) => ({ bagts: label(k), blocks: m.total, pct: m.pct }))
      .sort((a, b) => b.pct - a.pct),
    slowest: rows
      .slice()
      .sort((a, b) => a.pct - b.pct || a.block.localeCompare(b.block, 'mn'))
      .slice(0, 10)
      .map((r) => ({ block: r.block, bagts: label(r.bagts), pct: r.pct })),
    stalled: rows.filter((r) => r.pct < 1).length,
  };
}

/* ═══════════════ 9 · Санхүүжилтийн явц ═══════════════ */


export const loadFinance = cached(loadFinanceRaw, 5 * 60_000, ['CASHFLOW_NEW', 'HO_IPC']);

async function loadFinanceRaw(): Promise<ReportExtra['finance']> {
  const F = CASHFLOW_NEW.fields;
  const [rows, ho] = await Promise.all([
    queryFeatures(CASHFLOW_NEW.url, { where: CF_WORK_WHERE, outFields: ['*'] }),
    queryFeatures(HO_IPC.url, { outFields: [HO_IPC.payFields.amount, HO_IPC.contractFields.pkg] }),
  ]);

  /** Гэрээний мөрүүд (78) — шүүлт хэрэггүй, мөр бүр нэг гэрээ */
  const master = rows;
  const { CONTRACTED } = await import('@/lib/gdash');

  /**
   * Урьд нь `sum` нь 78 мөр БҮГДИЙГ нэмдэг байсан тул тайлан «нийт төсөв
   * 3,167,606,958,415 ₮» гэж бичдэг байв — эх Excel-д ч, дашбоард дээр ч
   * БАЙХГҮЙ тоо. Excel-ийн НИЙТ томьёо (`=+I8+I21`) нь 5·6·7-р хэсгийг
   * (ГИШС-ээс гадуурх, газар чөлөөлөлт, бондын хүү) хасдаг — `finXlInTotal`
   * яг тэр дүрэм. Амьд хэмжилт (2026-09-15, Cashflow_0909/0, 78 мөр):
   *     шүүлтгүй      3,167,606,958,415 ₮
   *     finXlInTotal  2,493,041,880,532 ₮  ← дашбоард ба S-муруйнхтай ИЖИЛ
   */
  const inTotal = master.filter(finXlInTotal);
  const sum = (f: string) => inTotal.reduce((a, r) => a + nn(r[f]), 0);
  /** Бүх мөрөөр (хамрах хүрээнээс гадуурх ч) — задаргааны хүснэгтэд */
  const sumAll = (f: string) => master.reduce((a, r) => a + nn(r[f]), 0);
  const secOf = (r: Record<string, unknown>) =>
    String(r[FIN_XL_TOTAL_CODE_FIELD] ?? '').trim();


  /*
   * «Бодитоор олгосон» — HO төлбөрийн бүртгэлийн `dun` нийлбэр.
   */
  const share = paidShareOf(master, ho);
  const { paid, paidContracted } = share;

  /*
   * Төрлөөр — ЗӨВХӨН мастер мөрөөс (эс тэгвээс нэг гэрээ 14 удаа тоологдоно).
   */
  const UNTYPED = tr('Төрөл тодорхойлоогүй');
  const typeMap = new Map<string, { n: number; budget: number; contract: number }>();
  master.forEach((r) => {
    if (FIN_XL_ROW_HIDE.includes(secOf(r))) return;
    const ty = str(r[F.type]);
    const t0 = ty && ty !== '0' ? ty : str(r[F.project]);
    const t = !t0 || t0 === '0' ? UNTYPED : t0;
    const e = typeMap.get(t) ?? { n: 0, budget: 0, contract: 0 };
    e.n += 1;
    e.budget += nn(r[F.budget]);
    if (str(r[F.amountNote]) === CONTRACTED) e.contract += nn(r[F.contractAmount]);
    typeMap.set(t, e);
  });

  /**
   * БАГЦ БҮРИЙН урьдчилсан төсөвт өртөг — `BagtsRow.key`-ээр хайхад бэлэн.
   */
  const byBagts: Record<string, number> = {};
  master.forEach((r) => {
    const k0 = pkgKeyOf(r[F.pkg2]) || pkgKeyOf(r[F.pkg]);
    if (!k0 || k0 === '0') return;
    const k = finPkgKey(k0);
    byBagts[k] = (byBagts[k] ?? 0) + nn(r[F.budget]);
  });

  return {
    /**
     * БАГЦ АЖЛЫН ТОО = 74 (2026-09-15-ны залруулга).
     */
    rows: master.filter((r) => !FIN_XL_WORK_SKIP.includes(secOf(r))).length,
    budget: sum(F.budget),
    orderTotal: sum(F.orderTotal),
    /**
     * ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН «Гэрээлсэн дүн» (`note === CONTRACTED`) мөрөөр
     * (2026-09-21; `gdash.kpisOf`-ийн `contract`-тай ИЖИЛ дүрэм, 2026-09-08-ны
     * хэрэглэгчийн шийдвэр). `geree_dun` нь гэрээлэгдээгүй мөрд ч бөглөгдсөн
     * байдаг тул шүүлтгүй `sum` ~33 тэрбумаар их гаргаж, `contractRate` /
     * `paidRate` (`buildFindings`) хоёулаа тэр суурин дээр худал байв.
     */
    contractAmount: share.contract,
    /**
     * ГАЗАР ЧӨЛӨӨЛӨЛТ, БУУЛГАЛТ ЦЭВЭРЛЭГЭЭ (6-р хэсэг) — НИЙТ дүнгээс
     * ГАДУУР тул тусад нь. Тайлангийн 4-р хэсэг үүнийг уншина: мөнгө
     * «алга болсон» биш, өөрийн хэсэгтээ тайлагнагдана.
     */
    landBudget: master
      .filter((r) => secOf(r) === FIN_XL_LAND_CODE)
      .reduce((a, r) => a + nn(r[F.budget]), 0),
    sources: CASHFLOW_NEW.sources.map((s) => ({ label: s.label, value: sum(s.field) })),
    paid: share.paidKnown ? paid : null,
    paidPct: share.pct,
    paidContracted,
    paidOther: share.paidOther,
    byType: [...typeMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => Number(a.type === UNTYPED) - Number(b.type === UNTYPED) || b.budget - a.budget),
    /**
     * «Ажлын төрлөөр» хүснэгтийн НИЙТ мөр — задаргаа нь БҮХ мөрөөр явдаг
     * тул НИЙТ нь ч бүх мөрөөр (2026-09-15).
     */
    byTypeTotal: {
      budget: sumAll(F.budget),
      contract: master
        .filter((r) => str(r[F.amountNote]) === CONTRACTED)
        .reduce((a, r) => a + nn(r[F.contractAmount]), 0),
    },
    byBagts,
  };
}

/* ═══════════════ 10 · Дэд бүтцийн хэрэгжилт ═══════════════ */

async function loadInfra(): Promise<ReportExtra['infra']> {
  const groups = await Promise.all(LAYER_GROUPS.map(async (g) => {
    const ids = GROUP_LAYERS[g.key] ?? [];
    const parts = await Promise.all(ids.map(async (id) => {
      const d = LAYER_BY_ID[id];
      if (!d) return null;
      try {
        const t = await layerTotals(d, '1=1');
        return { unit: d.qty?.unit ?? '', ...t };
      } catch (e) {
        throw new Error(tr('{0}: давхарга уншигдсангүй ({1})', d.title, String((e as Error)?.message ?? e)));
      }
    }));
    const ok = parts.filter((p): p is NonNullable<typeof p> => !!p);
    return {
      key: g.key,
      title: g.title,
      layers: ids.length,
      lenMissing: ok.some((p) => p.unit === 'м' && p.q == null),
      areaMissing: ok.some((p) => p.unit === 'м²' && p.q == null),
      n: ok.reduce((a, p) => a + p.n, 0),
      len: ok.filter((p) => p.unit === 'м').reduce((a, p) => a + (p.q ?? 0), 0),
      area: ok.filter((p) => p.unit === 'м²').reduce((a, p) => a + (p.q ?? 0), 0),
    };
  }));

  return {
    groups: groups.map(({ lenMissing: _l, areaMissing: _a, ...g }) => g),
    totals: {
      layers: groups.reduce((a, g) => a + g.layers, 0),
      n: groups.reduce((a, g) => a + g.n, 0),
      len: groups.some((g) => g.lenMissing) ? null : groups.reduce((a, g) => a + g.len, 0),
      area: groups.some((g) => g.areaMissing) ? null : groups.reduce((a, g) => a + g.area, 0),
    },
  };
}

/* ═══════════════ 11 · ХАБЭА ═══════════════ */

export const loadHabeaSummary = cached(loadHabeaSummaryRaw, 5 * 60_000, ['HABEA']);

async function loadHabeaSummaryRaw(): Promise<ReportExtra['habea']> {
  const L = HABEA.labor.fields;
  const [labor, incident] = await Promise.all([
    /* Огноо + компани тус бүрийн тоон талбарууд — «*» бүх баганыг татдаг байв
       (2026-08-21 гүйцэтгэлийн аудит) */
    queryFeatures(HABEA.labor.url, {
      outFields: [
        L.ognoo,
        OID_FIELD,
        EDIT_DATE_FIELD,
        ...HABEA.labor.companies.flatMap((c) => {
          const f = laborCompanyFields(c.sfx);
          return [f.mongol, f.gadaad, f.niitAjiltan, f.niitTehnik];
        }),
      ],
    }),
    queryFeatures(HABEA.incident.url, {
      outFields: [HABEA.incident.fields.ognoo, HABEA.incident.fields.turul, HABEA.incident.fields.bagts],
    }),
  ]);

  /* Хамгийн сүүлийн бүртгэл — маягт нэг мөрөөр «өнөөдрийн байдал»-ыг илэрхийлнэ */
  const last = latestLaborRow(labor);
  const head = last ? laborHeadOf(last) : null;

  const byCompany = HABEA.labor.companies.map((c) => {
    const d = head?.comp[c.sfx];
    return {
      label: c.label,
      bagts: c.bagts,
      workers: d?.workers ?? 0,
      mongol: d?.mongol ?? null,
      gadaad: d?.gadaad ?? null,
      tehnik: d?.technik ?? 0,
    };
  }).filter((c) => c.workers > 0 || c.tehnik > 0)
    .sort((a, b) => b.workers - a.workers);

  const ts = last ? nn(last[L.ognoo]) : 0;
  return {
    date: ts ? ubDayKey(ts) : '',
    workers: byCompany.reduce((a, c) => a + c.workers, 0),
    mongol: sumOrNull(byCompany.map((c) => c.mongol)),
    gadaad: sumOrNull(byCompany.map((c) => c.gadaad)),
    tehnik: byCompany.reduce((a, c) => a + c.tehnik, 0),
    byCompany,
    incidents: incident.filter((r) => !isBlankIncident(r)).length,
  };
}

/* ═══════════════ Нэгтгэл ═══════════════ */

/**
 * Дөрвөн хэсгийг ЗЭРЭГ татна. Нэг нь унавал бүхэл тайлан унахгүй байх нь
 * чухал тул `allSettled` — амжилтгүй хэсэг нь хоосон утгаараа гарна.
 */
export const loadReportExtra = cached(loadReportExtraRaw, 5 * 60_000,
  ['BAGTS_SHEET', 'CASHFLOW_NEW', 'HO_IPC', 'PARCEL_LEFT', 'HABEA', 'BAGTS_NEGTGEL', 'BUILDING', 'HUVAARI_OBYEM', 'TUSUL_NEGTGEL']);

async function loadReportExtraRaw(): Promise<ReportExtra> {
  const [o, p, f, i, h, l, s, w] = await Promise.allSettled([
    loadOverall(), loadProgress(), loadFinance(), loadInfra(), loadHabeaSummary(),
    loadLand(), loadSocial(),
    loadNegtgelPct(),
  ]);
  /**
   * Урьд нь унасан эх сурвалж бүр `{ pct: 0, paid: 0, blocks: 0, … }` болж,
   * алдаа нь ЗӨВХӨН `console.error`-т үлддэг байв. Үр дүнд «Бодитоор
   * олгосон 0 ₮», «нийт гүйцэтгэл 0.00%» гэсэн тоонууд АЛБАН ЁСНЫ PDF ба
   * мэйлд хэмжилт мэт хэвлэгдэнэ — `Tailan.tsx`-ийн `ready` шалгуур ч тэг
   * объектыг «бэлэн» гэж үзэж товчийг идэвхжүүлдэг байлаа. Энэ нь
   * төслийн хамгийн чанга дүрэм (`null ≠ 0`)-ийн хамгийн өндөр эрсдэлтэй
   * гаралт дээрх зөрчил байв.
   */
  const parts: [string, PromiseSettledResult<unknown>][] = [
    [tr('нийт гүйцэтгэл'), o], [tr('гүйцэтгэл'), p], [tr('санхүү'), f],
    [tr('дэд бүтэц'), i], [tr('ХАБЭА'), h], [tr('газар'), l],
    [tr('нийгмийн барилга'), s],
  ];
  const down = parts.filter(([, r]) => r.status === 'rejected');
  if (down.length) {
    for (const [name, r] of down) {
      console.error(`[selbe] тайлан · ${name}:`, (r as PromiseRejectedResult).reason);
    }
    throw new Error(
      tr('Тайлангийн {0} эх сурвалж татагдсангүй: {1}. Дутуу тоогоор тайлан гаргахгүй — сүлжээгээ шалгаад дахин оролдоно уу.',
        down.length, down.map(([n]) => n).join(', ')),
    );
  }

  return {
    overall: (o as PromiseFulfilledResult<Awaited<ReturnType<typeof loadOverall>>>).value,
    land: (l as PromiseFulfilledResult<Awaited<ReturnType<typeof loadLand>>>).value,
    social: (s as PromiseFulfilledResult<Awaited<ReturnType<typeof loadSocial>>>).value,
    progress: (p as PromiseFulfilledResult<Awaited<ReturnType<typeof loadProgress>>>).value,
    finance: (f as PromiseFulfilledResult<Awaited<ReturnType<typeof loadFinance>>>).value,
    infra: (i as PromiseFulfilledResult<Awaited<ReturnType<typeof loadInfra>>>).value,
    habea: (h as PromiseFulfilledResult<Awaited<ReturnType<typeof loadHabeaSummary>>>).value,
    fetchedAt: Date.now(),
    projectPct: w.status === 'fulfilled' ? w.value : null,
  };
}

export function useReportExtra(): Async<ReportExtra> {
  return useAsync(loadReportExtra, []);
}

/* ═══════════════ Шинжилгээ — товч танилцуулга ба дүгнэлт ═══════════════ */

export type Findings = {
  buildWeight: number; buildActual: number | null; buildLag: number | null;
  landLeft: number | null; topReason: { label: string; n: number } | null;
  contractRate: number | null; paidRate: number | null;
  peakMonth: { label: string; amount: number } | null;
  bestBagts: { bagts: string; pct: number } | null;
  worstBagts: { bagts: string; pct: number } | null;
  mongolShare: number | null;
  /** Хамгийн их жинтэй үе шат — 3-р хэсгийн тайлбарт */
  heavyStage: { label: string; weight: number; actual: number } | null;
  /** Эхэлсэн ба эхлээгүй ажлын үе шатны нэрс — 6-р хэсгийн тайлбарт */
  startedPhases: string[];
  notStartedPhases: string[];
  /** Хамгийн том санхүүжилтийн эх үүсвэр — 7-р хэсгийн тайлбарт */
  topSource: { label: string; share: number } | null;
  /** Дэлгэц ба PDF-д ижилхэн гарах дүгнэлтийн өгүүлбэрүүд */
  findings: string[];
};

/**
 * Тайлангийн ТАЙЛБАР ТЕКСТИЙГ амьд тооноос үүсгэнэ.
 */
/** Багцын хүснэгтийн мөр — `BagtsRow`-ийн хэрэгтэй хэсэг (Dashboard-оос импортлохгүй, цикл үүсгэхгүй) */
export type BagtsLike = { key: string; label: string; progress: number | null };

export function bagtsExtremes(rows: readonly BagtsLike[]): {
  best: { bagts: string; pct: number } | null; worst: { bagts: string; pct: number } | null;
} {
  const ranked = rows
    .filter((b): b is BagtsLike & { progress: number } => b.progress != null)
    .sort((a, b) => b.progress - a.progress);
  const best = ranked[0] ?? null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;
  return {
    best: best ? { bagts: best.label, pct: best.progress } : null,
    worst: worst ? { bagts: worst.label, pct: worst.progress } : null,
  };
}

/**
 * @param bagtsRows 2026-09-21: багцын хүснэгтийн мөрүүд — өгвөл `bestBagts`/
 *   `worstBagts` ХҮСНЭГТИЙН дүрмээр (`bagtsExtremes`); дэлгэц ба PDF хоёулаа
 *   дамжуулна. Өгөөгүй бол `progress.byBagts` — 2026-10-04-нөөс `pkgProgressOf`
 *   (БҮХ блокоор, тайлангүй блок 0% — `joinBagts`-тай ЯГ нэг функц; урьд нь энэ нь
 *   «тайлантай блокийн дундаж» байсан).
 */
export function buildFindings(x: ReportExtra, bagtsRows?: readonly BagtsLike[]): Findings {
  /*
   * БАРИЛГА УГСРАЛТ.
   *
   * Одоо: жин нь тэдгээр багцын эзлэх төсвийн хувь (3-р хэсгийн жингийн нийлбэр).
   */
  const buildWeight = x.overall.weightSum;
  const buildActual = x.overall.pct;
  const buildLag = null as number | null;

  const byBagts = x.progress.byBagts;
  const ext = bagtsRows ? bagtsExtremes(bagtsRows) : null;
  const bestBagts = ext ? ext.best : byBagts[0] ?? null;
  const worstBagts = ext ? ext.worst : byBagts.length ? byBagts[byBagts.length - 1] : null;
  const stalled = x.progress.stalled;

  const landLeft = x.land.parcels == null
    ? null
    : x.land.byStatus
      .filter((s) => isLeftParcel(s.label))
      .reduce((a, s) => a + s.n, 0);
  const topReason = x.land.byReason[0] ?? null;

  const contractRate = x.finance.orderTotal
    ? (x.finance.contractAmount / x.finance.orderTotal) * 100 : null;
  const paidRate = x.finance.paid == null ? null : x.finance.paidPct ?? paidPctOf(x.finance.paidContracted, x.finance.contractAmount);

  const peakMonth = null;

  const split = x.habea.byCompany.filter((c) => c.mongol != null && c.gadaad != null);
  const splitWorkers = split.reduce((a, c) => a + c.workers, 0);
  const mongolShare = splitWorkers > 0
    ? (split.reduce((a, c) => a + (c.mongol ?? 0), 0) / splitWorkers) * 100
    : null;

  const heavyStage = x.overall.stages.length
    ? x.overall.stages.reduce((a, s) => (s.weight > a.weight ? s : a))
    : null;
  const startedPhases = x.progress.phases.filter((p) => p.pct > 0).map((p) => p.name);
  const notStartedPhases = x.progress.phases.filter((p) => p.pct <= 0).map((p) => p.name);
  const srcTotal = x.finance.sources.reduce((a, s) => a + s.value, 0);
  const topSrc = x.finance.sources.length
    ? x.finance.sources.reduce((a, s) => (s.value > a.value ? s : a))
    : null;
  const topSource = topSrc && srcTotal
    ? { label: topSrc.label, share: (topSrc.value / srcTotal) * 100 }
    : null;

  const f: string[] = [];

  if (x.progress.blocks > 0) {
    f.push(tr('Барилга угсралтын ажлын ХО-оор жигнэсэн гүйцэтгэл {0} байна ({1} блокийн хэмжилтийг багцаар нь ХО дүнгийн жингээр нэгтгэсэн). Эдгээр багц төслийн төсвийн {2}-ийг эзэлдэг тул нийт гүйцэтгэлд шууд нөлөөлнө.', pct(buildActual, 2), num(x.overall.rows), pct(buildWeight, 1)));
  }

  if (bestBagts && worstBagts && bestBagts.bagts !== worstBagts.bagts) {
    f.push(tr('Багц хоорондын гүйцэтгэлийн зөрүү {0} нэгж хувь байна: {1} — {2}, {3} — {4}. Хоцорсон багцад нөөц дахин хуваарилах асуудлыг авч үзэх шаардлагатай.', num(bestBagts.pct - worstBagts.pct, 1), tr(bestBagts.bagts), pct(bestBagts.pct, 2), tr(worstBagts.bagts), pct(worstBagts.pct, 2)));
  }

  if (stalled > 0) {
    f.push(tr('{0} блокийн гүйцэтгэл 1 хувиас доогуур буюу ажил бодитоор эхлээгүй байна.', num(stalled)));
  }

  if (landLeft != null && landLeft > 0) {
    f.push(tr('Газар чөлөөлөлтөд {0} нэгж талбар шийдвэрлэгдээгүй үлдсэн{1}. Эдгээр нь холбогдох блокийн ажлыг саатуулах эрсдэлтэй тул шуурхай шийдвэрлэх шаардлагатай.', num(landLeft), topReason ? tr('; тэргүүлэх шалтгаан нь «{0}» ({1} нэгж талбар)', tr(topReason.label), num(topReason.n)) : ''));
  }

  if (contractRate != null && paidRate != null) {
    f.push(tr('Захирамжаар батлагдсан дүнгийн {0} нь гэрээгээр баталгаажсан бөгөөд гэрээлсэн дүнгийн {1} нь бодитоор олгогдсон байна. Олгогдоогүй үлдэгдэл {2} ₮ байна.', pct(contractRate, 1), pct(paidRate, 1), num(Math.max(0, x.finance.contractAmount - x.finance.paidContracted))));
    if (x.finance.paidOther > 0) {
      f.push(tr('Нийт олгосон {0} ₮-ийн {1} ₮ нь гэрээлсэн багцад холбогдоогүй (олон багц хамарсан эсвэл гэрээ баталгаажаагүй багцын) төлбөр тул дээрх хувь, үлдэгдэлд ороогүй.', num(x.finance.paid), num(x.finance.paidOther)));
    }
  }

  if (x.habea.incidents > 0) {
    f.push(tr('Бүртгэлийн хугацаанд {0} осол, зөрчил бүртгэгдсэн байна. Хөдөлмөрийн аюулгүй байдлын хяналтыг эрчимжүүлэх шаардлагатай.', num(x.habea.incidents)));
  }

  return {
    buildWeight, buildActual, buildLag,
    landLeft, topReason,
    contractRate, paidRate, peakMonth,
    bestBagts, worstBagts, mongolShare,
    heavyStage, startedPhases, notStartedPhases, topSource,
    findings: f,
  };
}
