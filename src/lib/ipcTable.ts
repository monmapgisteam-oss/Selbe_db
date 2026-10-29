/**
 * IPC ХҮСНЭГТИЙН ЗАГВАР — «олгосон санхүүжилт»-ийг ГЭРЭЭГЭЭР бүлэглэж
 * уншигдахуйц болгох цэвэр логик.
 *
 * ЗАГВАР: 22 гэрээ = 22 бүлэг. Бүлгийн ТОЛГОЙД гэрээний давтагддаг утгууд
 * НЭГ УДАА; дотор нь тухайн гэрээний төлбөрүүд (урьдчилгаа + IPC-1,2,3…)
 * цөөн баганаар.
 */
import { t as tr } from '@/lib/i18nCore';
import { HO_IPC, hoAmount, hoPayCode, hoSaving, num } from '@/lib/services';
import type { HoContract } from '@/lib/ipc';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { dayKey } from '@/lib/format';

type Row = Record<string, unknown>;

const P = HO_IPC.payFields;
const C = HO_IPC.contractFields;

/* ─────────────────────── ТӨЛБӨРИЙН МӨР ─────────────────────── */

/**
 * Бүлэг дотор харагдах НЭГ ТӨЛБӨР.
 */
export type PayRow = {
  oid: number | null;
  /** `murun_id` «ХО-0001» */
  id: string;
  /** «Урьдчилгаа» | «IPC-01» — `hoPayCode` */
  code: string;
  /** Урьдчилгаа эсэх — өнгө/эрэмбэд */
  advance: boolean;
  /** `ipc_dugaar`; урьдчилгаад ҮРГЭЛЖ `null` */
  ipcNo: number | null;
  /** `guilgee_ognoo` түүхий утга — форматлахыг дуудагч тал хийнэ */
  date: unknown;
  /** `dun` — олгосон дүн */
  amount: number | null;
  cum: number | null;
  /** `guits_obyem` — бодит гүйцэтгэлийн обьём */
  obyem: number | null;
  /** `guits_une` — обьёмоос бодогдсон «байх ёстой» ₮ */
  une: number | null;
  /** `guits_zoruu` — олгосон − байх ёстой */
  zoruu: number | null;
  /** `on_` — ТАНИГЧ, хэмжигдэхүүн БИШ: мянгатын тасалалгүй гаргана */
  year: number | null;
  /** `tulult_turul` түүхий утга — 2 мөрд ХООСОН («ангилагдаагүй») */
  kind: string;
  /**
   * ЗАХИРАМЖИЙН ДУГААР — «А/250».
   */
  orderNo: string;
};

/**
 * Гэрээний төлбөрүүдийг ХАРАГДАХ дараалалд эрэмбэлж мөр болгоно.
 */
export function payRows(pays: readonly Row[]): PayRow[] {
  const adv: Row[] = [];
  const work: Row[] = [];
  for (const r of pays) {
    (r[P.kind] === HO_IPC.kinds.advance ? adv : work).push(r);
  }
  const ordNo = (r: Row): number => {
    const n = num(r[P.ipcNo]);
    return n == null ? Number.POSITIVE_INFINITY : n;
  };
  const ordDay = (r: Row): number => {
    const t = Date.parse(String(r[P.payDate] ?? ''));
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  work.sort((a, b) => {
    const oa = ordNo(a);
    const ob = ordNo(b);
    if (oa !== ob) return oa < ob ? -1 : 1;
    const da = ordDay(a);
    const db = ordDay(b);
    if (da !== db) return da < db ? -1 : 1;
    return 0;
  });

  let acc: number | null = null;
  const out: PayRow[] = [];

  const push = (r: Row, advance: boolean, cum: number | null): void => {
    out.push({
      oid: num(r[HO_IPC.oid]),
      id: String(r[P.id] ?? ''),
      code: hoPayCode(r),
      advance,
      ipcNo: num(r[P.ipcNo]),
      date: r[P.payDate] ?? null,
      amount: hoAmount(r),
      cum,
      obyem: num(r[LINK_FIELDS.obyem]),
      une: num(r[LINK_FIELDS.une]),
      zoruu: num(r[LINK_FIELDS.zoruu]),
      year: num(r[P.year]),
      kind: String(r[P.kind] ?? ''),
      orderNo: String(r[C.order1No] ?? ''),
    });
  };

  for (const r of adv) push(r, true, null);
  for (const r of work) {
    const v = hoAmount(r);
    if (v != null) acc = (acc ?? 0) + v;
    push(r, false, v == null ? null : acc);
  }
  return out;
}

/* ─────────────────────── БҮЛГИЙН ТОЛГОЙ ─────────────────────── */

/* ─────────────────────── ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ ─────────────────────── */

/**
 * Дэлгэрэнгүйд харагдах НЭГ талбар.
 */
export type DetailGroup = {
  /** Бүлгийн гарчиг — «ГЭРЭЭ», «ТӨСӨВ» г.м. */
  title: string;
  items: Detail[];
};

export type Detail = {
  /** Үйлчилгээний талбарын нэр — шошгыг `finFieldLabel`-ээр гаргана */
  field: string;
  label?: string;
  value: unknown;
  /**
   * Хэрхэн харуулах вэ.
   */
  kind: 'money' | 'date' | 'text' | 'pair';
};

/**
 * ГЭРЭЭНИЙ түвшний БҮХ талбар — дэлгэрэнгүйд гаргах дараалалтайгаар.
 */
const DETAIL_SPEC: readonly {
  title: () => string;
  fields: readonly [string, Detail['kind']][];
  /** [огнооны талбар, дугаарын талбар, шошго] — НЭГ мөр болж нийлнэ */
  pairs?: readonly [string, string, () => string][];
}[] = [
  {
    title: () => tr('ГЭРЭЭ'),
    fields: [
      [C.project, 'text'],
      [C.contractor, 'text'],
      [C.workType, 'text'],
      [C.contractForm, 'text'],
      [C.contractNo, 'text'],
      [C.no, 'text'],
      [C.amendment, 'text'],
    ],
  },
  {
    title: () => tr('ЭРХ ЗҮЙН ҮНДЭСЛЭЛ'),
    fields: [
      [C.legalBasis, 'text'],
    ],
    pairs: [
      [C.order1Date, C.order1No, () => tr('Захирамж 1')],
      [C.order2Date, C.order2No, () => tr('Захирамж 2')],
      [C.order3Date, C.order3No, () => tr('Захирамж 3')],
    ],
  },
  {
    title: () => tr('ТӨСӨВ'),
    fields: [
      [C.budgetTotal, 'money'],
      [C.budgetBond, 'money'],
      [C.budgetCity, 'money'],
      [C.budgetSales, 'money'],
      [C.contractTotal, 'money'],
      [C.contractBond, 'money'],
      [C.contractCity, 'money'],
      [C.contractSales, 'money'],
      [C.saving, 'money'],
    ],
  },
];

/**
 * Гэрээний дэлгэрэнгүй талбарууд.
 */
/**
 * Огноог `YYYY-MM-DD` болгоно — танихгүй бол түүхийгээр нь.
 */
const dayOf = (v: unknown): string => {
  const s = String(v ?? '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const t = typeof v === 'number' ? v : Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return dayKey(t);
};

export function details(h: Row): DetailGroup[] {
  const out: DetailGroup[] = [];
  for (const g of DETAIL_SPEC) {
    const items: Detail[] = [];
    for (const [field, kind] of g.fields) {
      const value = h[field];
      if (value == null || value === '') continue;
      items.push({ field, value, kind });
    }
    for (const [dateF, noF, label] of g.pairs ?? []) {
      const d = h[dateF];
      const n = h[noF];
      const hasD = d != null && d !== '';
      const hasN = n != null && n !== '';
      if (!hasD && !hasN) continue;
      const txt = [hasD ? dayOf(d) : null, hasN ? String(n) : null]
        .filter(Boolean).join(' · ');
      items.push({ field: dateF, value: txt, kind: 'pair', label: label() });
    }
    if (items.length) out.push({ title: g.title(), items });
  }
  return out;
}

/**
 * НЭГ ГЭРЭЭНИЙ бүлэг — толгой + төлбөрүүд.
 */
export type ContractBlock = {
  /** `geree_kod`; кодгүй гэрээнд `''` */
  code: string;
  /** Харагдах гарчиг — багцын нэр, эс бөгөөс гэрээний код */
  title: string;
  contractor: string;
  workType: string;
  contractNo: string;
  /** Гэрээт төсөв — гэрээнд НЭГ УДАА */
  contractTotal: number | null;
  /** Олгосон нийт (урьдчилгаа + гүйцэтгэл) */
  paidTotal: number | null;
  /** `paidTotal / contractTotal` × 100 — 0–100. `pct` 100-аар үржүүлдэггүй */
  paidPct: number | null;
  /** Төлбөрийн мөр */
  rows: PayRow[];
  hasObyem: boolean;
  /** Гэрээний БҮХ бусад талбар — дэлгэрэнгүйд, бүлэглэсэн */
  details: DetailGroup[];
  /** Урьдчилгааны нийт — «олгосон»-ы задаргаанд */
  advanceTotal: number | null;
  /** Гүйцэтгэлийн төлбөрийн нийт */
  workTotal: number | null;
  savingMismatch: boolean;
};

/**
 * Гэрээ бүрийг харагдах бүлэг болгоно.
 */
/**
 * Гэрээний төлбөрийн мөрүүдээс НЭГТГЭСЭН «толгой мөр» — талбар бүрт
 * УТГАТАЙ (null/хоосон биш) эхний утгыг сонгоно.
 */
function mergeHead(pays: readonly Row[]): Row {
  const out: Row = {};
  for (const r of pays) {
    for (const k of Object.keys(r)) {
      if (k in out) continue;
      const v = r[k];
      if (v == null || (typeof v === 'string' && v.trim() === '')) continue;
      out[k] = v;
    }
  }
  return out;
}

export function contractBlocks(cs: readonly HoContract[]): ContractBlock[] {
  return cs.map((c) => {
    const rows = payRows(c.pays);
    /*
     *    Урьд нь `c.pays[0]` гэсэн НЭГ «толгой мөр» сонгодог байв. `groupHo`
     *    тэр загвараа 2026-09-11-нд яг ЭНЭ шалтгаанаар орхисон: нэг мөрөнд
     *    төсөв нь бөглөгдсөн атлаа гүйцэтгэгч нь хоосон байж болно.
     *    Илүү аюултай нь `ipcAuto`-ийн AUTO мөр — тэр нь гэрээний талбар ОГТ
     *    агуулдаггүй бөгөөд `OBJECTID` эрэмбээр эхэнд ирж болно. Тэр үед
     *    `details(h)` бүхэлдээ хоосон, `savingMismatch` худал `false` болж,
     *    гэрээний төсөв, гүйцэтгэгч, захирамж бүгд IPC хуудаснаас чимээгүй
     *    алга болно — `contractTotal`/`paidTotal` нь `groupHo`-оос ирдэг тул
     *    зөв хэвээр үлдэж, зөрчил нүдэнд илрэхгүй.
     */
    const h = mergeHead(c.pays);
    const stored = num(h[C.saving]);
    const calc = hoSaving(h);
    return {
      code: c.code,
      title: c.pkg || c.code || rows[0]?.id || '—',
      contractor: c.contractor,
      workType: c.workType,
      contractNo: c.contractNo,
      contractTotal: c.contractTotal,
      paidTotal: c.paidTotal,
      paidPct: c.paidPct,
      rows,
      hasObyem: rows.some((r) => r.obyem != null || r.une != null || r.zoruu != null),
      details: details(h),
      advanceTotal: c.advanceTotal,
      workTotal: c.workTotal,
      savingMismatch: stored != null && calc != null && Math.abs(stored - calc) > 0.5,
    };
  });
}

/**
 * ЯМАР НЭГ бүлэгт гүйцэтгэлийн обьём байна уу — хүснэгтийн толгойд
 * 3 багана нэмэх эсэхийг шийднэ.
 */
export const anyObyem = (bs: readonly ContractBlock[]): boolean =>
  bs.some((b) => b.hasObyem);

/* ─────────────────────── ЭРЭМБЭ ─────────────────────── */

export type SortKey = 'pkg' | 'paid' | 'pct' | 'contract';

/**
 * Бүлгүүдийг эрэмбэлнэ — ШИНЭ массив буцаана (оролтыг хөндөхгүй).
 */
export function sortBlocks(
  bs: readonly ContractBlock[],
  key: SortKey,
  desc = true,
): ContractBlock[] {
  const val = (b: ContractBlock): number | null => {
    if (key === 'paid') return b.paidTotal;
    if (key === 'pct') return b.paidPct;
    if (key === 'contract') return b.contractTotal;
    return null;
  };
  const out = [...bs];
  out.sort((a, b) => {
    if (key === 'pkg') return a.title.localeCompare(b.title, 'mn');
    const x = val(a);
    const y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return desc ? y - x : x - y;
  });
  return out;
}

/* ─────────────────────── НИЙТ МӨР ─────────────────────── */

export type IpcTotals = {
  contracts: number;
  pays: number;
  /** Σ гэрээт төсөв — ГЭРЭЭНИЙ түвшнээс */
  contract: number | null;
  /** Σ олгосон — БҮХ гэрээ (гэрээт дүн тодорхойгүй гэрээ ч орно) */
  paid: number | null;
  /**
   * Σ олгосон — ЗӨВХӨН гэрээт дүн (`contractTotal`) тодорхой гэрээнүүдийнх.
   * `paidPct`-ийн ТООЛОГЧ (`reportData.finance.paidContracted`-тэй ижил хамрах хүрээ).
   */
  paidContracted: number | null;
  /**
   * Σ олгосон — гэрээт дүн ТОДОРХОЙГҮЙ гэрээнүүдийнх (`paid − paidContracted`).
   * `null` = тийм гэрээнд олголт алга. Хувьд ОРОХГҮЙ тул дэлгэцэд ТУСАД НЬ.
   */
  paidOther: number | null;
  /** `paidContracted / contract` × 100 (0–100) */
  paidPct: number | null;
};

/**
 * Хүснэгтийн ХӨЛИЙН нийт мөр.
 */
/**
 * ТӨЛБӨРИЙН ТОО — зөвхөн дүн (`dun`) бүхий мөр.
 */
export const payCount = (rows: readonly PayRow[]): number =>
  rows.filter((r) => r.amount != null).length;

/**
 * ГҮЙЦЭТГЭЛЭЭС ҮҮССЭН (AUTO) IPC-ИЙН АНХДАГЧ ДУГААР — гэрээ бүрд ДАРААЛСАН (2026-10-01,
 * «хэрэглэгч: бүгдийг зас»).
 */
export function ipcNumbers(rows: readonly PayRow[], dayOf: (r: PayRow) => string | null): Map<PayRow, number> {
  const out = new Map<PayRow, number>();
  const work = rows.filter((r) => !r.advance);
  let maxNo = 0;
  let prior = 0;
  const auto: { r: PayRow; day: string; i: number }[] = [];
  work.forEach((r, i) => {
    if (r.ipcNo != null) {
      out.set(r, r.ipcNo);
      maxNo = Math.max(maxNo, r.ipcNo);
      prior += 1;
      return;
    }
    const day = dayOf(r);
    if (day == null) { prior += 1; return; } // гараар оруулсан, дугааргүй — өмнөх IPC
    auto.push({ r, day, i });
  });
  let next = Math.max(maxNo, prior);
  auto
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.i - b.i))
    .forEach(({ r }) => { next += 1; out.set(r, next); });
  return out;
}

export function ipcTotals(bs: readonly ContractBlock[]): IpcTotals {
  let contract: number | null = null;
  let paid: number | null = null;
  let paidContracted: number | null = null;
  let paidOther: number | null = null;
  let pays = 0;
  for (const b of bs) {
    pays += payCount(b.rows);
    if (b.contractTotal != null) contract = (contract ?? 0) + b.contractTotal;
    if (b.paidTotal != null) {
      paid = (paid ?? 0) + b.paidTotal;
      if (b.contractTotal != null) paidContracted = (paidContracted ?? 0) + b.paidTotal;
      else paidOther = (paidOther ?? 0) + b.paidTotal;
    }
  }
  return {
    contracts: bs.length,
    pays,
    contract,
    paid,
    paidContracted,
    paidOther,
    paidPct: paidContracted == null || contract == null || contract === 0
      ? null
      : (paidContracted / contract) * 100,
  };
}

/**
 * «Олгосон санхүүжилт — гэрээгээр» толгойн ХУВЬ ба хувьд ОРООГҮЙ олголт.
 */
export type IpcHeadShare =
  | { src: 'cashflow'; contract: number; pct: number | null; other: number | null }
  | { src: 'ho'; contract: null; pct: number | null; other: number | null };

export function ipcHeadShare(
  t: IpcTotals,
  share: { contract: number; pct: number | null; paidOther: number } | null,
): IpcHeadShare {
  if (share) {
    return { src: 'cashflow', contract: share.contract, pct: share.pct, other: share.paidOther !== 0 ? share.paidOther : null };
  }
  return { src: 'ho', contract: null, pct: t.paidPct, other: t.paidOther != null && t.paidOther !== 0 ? t.paidOther : null };
}
