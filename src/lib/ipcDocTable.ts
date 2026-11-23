/**
 * IPC БАРИМТЫН ХҮСНЭГТ — ЦЭВЭР ЛОГИК (2026-11-23, хэрэглэгч). Сүлжээ, React-гүй; тест: `ipcDocTable.check.mjs`.
 *
 *   · IPC нь бөглөлт бүрээр БИШ: тухайн өдөр хүртэлх ТӨЛӨГДӨӨГҮЙ бөглөлтүүдийн (AUTO мөр, `Guitsetgel_talbe/185`)
 *     НИЙЛБЭРЭЭС нэг удаа, гэрээ · багц бүрт нэг IPC үүснэ (`unpaidFills`). Мөр нь `Guitsetgel_talbe/238` «ipc»-д.
 *   · Нийт дүн − суутгалууд = Гүйцэтгэгчид төлөх дүн (`payableOf`). Суутгалын санал нь `IPC_RATES`-ээс (`defaultDeductions`),
 *     хэрэглэгч бүх тоог засна.
 *   · Өмнөх · хуримтлагдсан · үлдэгдэл ХАДГАЛАГДАХГҮЙ — ижил гэрээний өмнөх IPC-үүд ба гэрээний дүнгээс (`cumulative`, `t7Of`).
 *   · Баталгаажуулахад 185-д НЭГ төлбөрийн мөр (`PAY|код|дугаар`, `dun` = нийт дүн) бичигдэнэ — бүх нийлбэр (`hoAmount`,
 *     `planPaidSync`) хуучин дүрмээрээ 185-аас тоолно. AUTO мөрийн `dun` хоосон хэвээр тул давхар тоологдохгүй.
 *   · Хуучин баримт (`IPC|…`, 185) хэвээр — зөвхөн жагсаалт ба хуримтлалд уншигдана.
 */
import { HO_IPC, IPC_DOC, num, pkgKeyOf } from '@/lib/services';
import { IPC_RATES, pkgCodeOf, type T7Row } from '@/lib/ipcDoc';
import { isAuto } from '@/lib/ipcAuto';
import { isDocRow, nextIpcNo, perfRows, statusOf, type PerfRow } from '@/lib/ipcFlow';
import { LINK_FIELDS } from '@/lib/ipcLink';

export type Row = Record<string, unknown>;
export type Rates = { [K in keyof typeof IPC_RATES]: number };

const F = IPC_DOC.fields;
const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const S = HO_IPC.status;

const txt = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
/** DateOnly «YYYY-MM-DD» эсвэл epoch → «YYYY-MM-DD»; хоосон → '' */
export const dayOf = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v).toISOString().slice(0, 10) : '';
  const m = /^\d{4}-\d{2}-\d{2}/.exec(String(v));
  return m ? m[0] : '';
};
const r2 = (x: number): number => Math.round(x * 100) / 100;
/** Хувь (0–100) — суурь 0 бол `null` */
export const pctOf = (part: number | null, whole: number | null): number | null =>
  part == null || whole == null || !(whole > 0) ? null : r2((part / whole) * 100);
/** Багцын түлхүүр — «Багц 1» ба «Багц-1» нэг (`createIpc`-тэй ижил дүрэм) */
export const pkgOf = (v: unknown): string => pkgKeyOf(v) || txt(v);

const perfFactor = (r: Rates): number => 1 + r.vat + r.norm + r.tech + r.author;
const contractFactor = (r: Rates): number => perfFactor(r) + r.contingency;
/** Урьдчилгаанаас суутгах захиалагчийн хяналтын хувь — `ipcDoc.ADVANCE_TECH`-тэй ижил томьёо */
const advTech = (r: Rates): number => r.tech / contractFactor(r);

/* ─────────────────────── ДҮН ─────────────────────── */

/** Суутгалын талбарууд — «Хүснэгт 7»-гийн дарааллаар */
export const DEDUCTIONS = [F.recovery, F.overBudget, F.norm, F.clientCtl, F.authorCtl, F.retention] as const;

/** Суутгалын нийлбэр — хоосон нь 0 */
export const deductionsOf = (row: Row): number => r2(DEDUCTIONS.reduce((a, f) => a + (num(row[f]) ?? 0), 0));

/** Гүйцэтгэгчид төлөх дүн = нийт дүн − суутгалууд. Нийт дүн хоосон бол `null` */
export function payableOf(row: Row): number | null {
  const t = num(row[F.total]);
  return t == null ? null : r2(t - deductionsOf(row));
}

/** Хоёр хувийн талбар ба төлөх дүнг дүнгээс шинэчилнэ (цэвэр — шинэ мөр) */
export const withPcts = (row: Row): Row => ({
  ...row,
  [F.recoveryPct]: pctOf(num(row[F.recovery]), num(row[F.total])),
  [F.retentionPct]: pctOf(num(row[F.retention]), num(row[F.total])),
  [F.payable]: payableOf(row),
});

/**
 * ГҮЙЦЭТГЭЛИЙН IPC-ИЙН САНАЛ — `ipcDoc`-ийн дүрмээр: эргэн төлөлт = 25% (урьдчилгааны үлдэгдлээр хязгаарлана), захиалагчийн
 * хяналт = 2% × БУА − урьдчилгаанаас суутгасан хяналтын буцаалт, зохиогчийн = 1% × БУА, барьцаа = 5%; гэрээний дүнгээс давсан
 * гүйцэтгэл (өмнөх гүйцэтгэл + энэ) нь «Төсвөөс давсан». Зөвхөн САНАЛ — хэрэглэгч бүх тоог засна.
 */
export function defaultDeductions(
  niit: number,
  contract: { amount: number | null; perfBefore?: number },
  rates: Rates = IPC_RATES,
  advanceLeft = 0,
): Row {
  const gross = Math.max(0, Number.isFinite(niit) ? niit : 0);
  const bua = gross / perfFactor(rates);
  const rec = r2(Math.max(0, Math.min(rates.recovery * gross, advanceLeft)));
  const amt = contract.amount;
  const over = amt != null && amt > 0 ? r2(Math.max(0, Math.min(gross, (contract.perfBefore ?? 0) + gross - amt))) : 0;
  return withPcts({
    [F.total]: niit,
    [F.advance]: 0,
    [F.recovery]: rec,
    [F.overBudget]: over,
    [F.norm]: 0,
    [F.clientCtl]: r2(Math.max(0, rates.tech * bua - advTech(rates) * rec)),
    [F.authorCtl]: r2(rates.author * bua),
    [F.retention]: r2(rates.retention * gross),
  });
}

/** УРЬДЧИЛГААНЫ САНАЛ — нийт дүн = урьдчилгаа санхүүжилт, зөвхөн захиалагчийн хяналт суутгана */
export function defaultAdvance(amount: number, rates: Rates = IPC_RATES): Row {
  const a = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return withPcts({
    [F.total]: amount,
    [F.advance]: amount,
    [F.recovery]: 0,
    [F.overBudget]: 0,
    [F.norm]: 0,
    [F.clientCtl]: r2(advTech(rates) * a),
    [F.authorCtl]: 0,
    [F.retention]: 0,
  });
}

const fmt = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Суутгалын тайлбарын анхдагч бичвэр — баримтын хэлээр (монгол), `tailbar`-д хадгалагдана; хэрэглэгч засна */
export function explainDeductions(row: Row): string {
  const t = num(row[F.total]);
  const parts: string[] = [];
  const add = (label: string, f: string) => {
    const v = num(row[f]);
    if (v == null || v === 0) return;
    const p = pctOf(v, t);
    parts.push(`${label}${p != null ? ` ${p}%` : ''} — ${fmt(v)} ₮`);
  };
  add('Урьдчилгаа эргэн төлөлт', F.recovery);
  add('Төсвөөс давсан гүйцэтгэл', F.overBudget);
  add('Норм нормативын сан', F.norm);
  add('Захиалагчийн хяналтын зардал', F.clientCtl);
  add('Зохиогчийн хяналтын зардал', F.authorCtl);
  add('Барьцаа', F.retention);
  return parts.join('; ');
}

/* ─────────────────────── БӨГЛӨЛТ ─────────────────────── */

export type Fills = { rows: PerfRow[]; total: number; from: string; to: string };

/**
 * ТӨЛӨГДӨӨГҮЙ БӨГЛӨЛТ — AUTO мөр, төлөв «Гүйцэтгэл», IPC-д холбогдоогүй (`ipc_dugaar` хоосон), өдөр ≤ `untilDay`
 * ('' = хязгааргүй). `pkg` өгвөл зөвхөн тэр багцынх. Дүнгүй (`guits_une` хоосон) мөр тоонд орно, нийлбэрт 0.
 */
export function unpaidFills(pays: readonly Row[], untilDay: string, pkg?: string): Fills {
  const key = pkg == null ? null : pkgOf(pkg);
  const rows = perfRows(pays).filter((r) => r.status === S.work && r.ipcNo == null && !!r.day
    && (!untilDay || r.day <= untilDay) && (key == null || pkgOf(r.pkg) === key));
  const days = rows.map((r) => r.day).sort();
  return { rows, total: r2(rows.reduce((a, r) => a + (r.une ?? 0), 0)), from: days[0] ?? '', to: days[days.length - 1] ?? '' };
}

/** Төлөгдөөгүй бөглөлттэй багцууд — нэр, хамгийн сүүлийн өдөр */
export function unpaidPkgs(pays: readonly Row[]): { key: string; pkg: string; last: string }[] {
  const by = new Map<string, { key: string; pkg: string; last: string }>();
  for (const r of unpaidFills(pays, '').rows) {
    const k = pkgOf(r.pkg);
    const g = by.get(k);
    if (!g) by.set(k, { key: k, pkg: r.pkg, last: r.day });
    else if (r.day > g.last) g.last = r.day;
  }
  return [...by.values()].sort((a, b) => a.pkg.localeCompare(b.pkg, 'mn', { numeric: true }));
}

/* ─────────────────────── БАРИМТЫН ЖАГСААЛТ ─────────────────────── */

/** `doc` — 238-ийн мөр · `legacy` — 185-ын хуучин `IPC|…` баримт · `pay` — 185-ын баримтгүй төлбөр (өмнөх бүртгэл) */
export type IpcSrc = 'doc' | 'legacy' | 'pay';

export type IpcRec = {
  src: IpcSrc;
  oid: number;
  no: number | null;
  advance: boolean;
  kod: string;
  pkg: string;
  /** Ажлын үе «YYYY-MM-DD» ('' = алга) */
  from: string;
  to: string;
  /** Олгосон · гарын үсэг · үүсгэсэн өдөр */
  day: string;
  status: string;
  note: string;
  docItem: string;
  total: number | null;
  advanceFin: number | null;
  recovery: number | null;
  overBudget: number | null;
  norm: number | null;
  clientCtl: number | null;
  authorCtl: number | null;
  retention: number | null;
  payable: number | null;
  row: Row;
};

/** 185-д баталгаажуулахад бичигдэх төлбөрийн мөрийн ID-ийн угтвар */
export const PAY_PREFIX = 'PAY|';
export const payId = (code: string, no: number): string => `${PAY_PREFIX}${code}|${no}`;
export const isPayRow = (r: Row): boolean => txt(r[P.id]).startsWith(PAY_PREFIX);

export function recOfDoc(r: Row): IpcRec {
  const advance = txt(r[F.type]) === IPC_DOC.types.advance;
  const total = num(r[F.total]);
  return {
    src: 'doc',
    oid: num(r[IPC_DOC.oid]) ?? 0,
    no: num(r[F.no]),
    advance,
    kod: txt(r[F.kod]),
    pkg: txt(r[F.pkg]),
    from: dayOf(r[F.start]),
    to: dayOf(r[F.end]),
    day: dayOf(r[F.payDate]) || dayOf(r[F.signDate]) || dayOf(r[F.end]) || dayOf(r[F.start]),
    status: txt(r[F.status]) || S.created,
    note: String(r[F.note] ?? ''),
    docItem: txt(r[F.docItem]),
    total,
    advanceFin: num(r[F.advance]) ?? (advance ? total : null),
    recovery: num(r[F.recovery]),
    overBudget: num(r[F.overBudget]),
    norm: num(r[F.norm]),
    clientCtl: num(r[F.clientCtl]),
    authorCtl: num(r[F.authorCtl]),
    retention: num(r[F.retention]),
    payable: num(r[F.payable]) ?? payableOf(r),
    row: r,
  };
}

function recOf185(r: Row, src: 'legacy' | 'pay'): IpcRec {
  const advance = r[P.kind] === HO_IPC.kinds.advance;
  /* Хуучин баримтын дүн нь `guits_une` (үүсэх үед хөлдсөн); баримтгүй төлбөр — `dun` */
  const total = src === 'legacy' ? num(r[LINK_FIELDS.une]) : num(r[P.amount]);
  return {
    src,
    oid: num(r[HO_IPC.oid]) ?? 0,
    no: num(r[P.ipcNo]),
    advance,
    kod: '',
    pkg: txt(r[C.pkg]),
    from: '',
    to: '',
    day: dayOf(r[P.payDate]),
    status: statusOf(r),
    note: '',
    docItem: txt(r[HO_IPC.docItem]),
    total,
    advanceFin: advance ? total : null,
    recovery: null,
    overBudget: null,
    norm: null,
    clientCtl: null,
    authorCtl: null,
    retention: null,
    payable: total,
    row: r,
  };
}

/**
 * ГЭРЭЭНИЙ IPC-ҮҮД — 238-ийн мөр + 185-ын хуучин баримт + баримтгүй төлбөр (өмнөх бүртгэл), дугаараар. 238-ийн баримтын
 * төлбөрийн мөр (`PAY|…`) тусдаа гарахгүй (давхардахгүй); 238-д тэр дугаар олдохгүй бол төлбөр болж харагдана (нуугдахгүй).
 */
export function recordsOf(pays: readonly Row[], docs: readonly Row[]): IpcRec[] {
  const own = docs.map(recOfDoc);
  const nos = new Set(own.map((d) => d.no).filter((n): n is number => n != null));
  const legacy = pays.filter(isDocRow).map((r) => recOf185(r, 'legacy'));
  const hist = pays
    .filter((r) => !isAuto(r) && !isDocRow(r) && num(r[P.amount]) != null && !(isPayRow(r) && nos.has(num(r[P.ipcNo]) ?? -1)))
    .map((r) => recOf185(r, 'pay'));
  const srcOrd: Record<IpcSrc, number> = { pay: 0, legacy: 1, doc: 2 };
  const byDay = (a: IpcRec, b: IpcRec): number => a.day.localeCompare(b.day) || srcOrd[a.src] - srcOrd[b.src] || a.oid - b.oid;
  const all = [...hist, ...legacy, ...own];
  const numbered = all.filter((x) => x.no != null).sort((a, b) => (a.no as number) - (b.no as number) || byDay(a, b));
  /* 2026-11-24 (засвар): дугааргүй төлбөр төгсгөлд (+∞) биш — огноогоор, огноо нь хожуу анхны дугаартай IPC-ийн ӨМНӨ
     (огноогүй бол эхэнд); урьд нь өмнөх · хуримтлагдсан · үлдэгдэлд ордоггүй байв */
  const loose = all.filter((x) => x.no == null).sort(byDay);
  const out: IpcRec[] = [];
  let k = 0;
  for (const x of numbered) {
    while (k < loose.length && (!loose[k].day || (!!x.day && loose[k].day < x.day))) out.push(loose[k++]);
    out.push(x);
  }
  return [...out, ...loose.slice(k)];
}

/** Дараагийн IPC дугаар — 185-ын бүх мөр (хуучин баримт, төлбөр, AUTO) ба 238-ийн мөрүүдийн хамгийн их дугаар + 1 */
export function nextDocNo(pays: readonly Row[], docs: readonly Row[]): number {
  let m = nextIpcNo(pays) - 1;
  for (const r of docs) { const n = num(r[F.no]); if (n != null && n > m) m = n; }
  return m + 1;
}

/** Ижил багцын 238-ийн гүйцэтгэлийн IPC-ийн хамгийн сүүлийн үеийн төгсгөл ('' = алга) */
export const prevEndOf = (recs: readonly IpcRec[], pkg: string): string =>
  recs.filter((x) => x.src === 'doc' && !x.advance && x.to && pkgOf(x.pkg) === pkgOf(pkg)).map((x) => x.to).sort().pop() ?? '';

/** Дараагийн өдөр «YYYY-MM-DD» (UTC хуанли — DateOnly) */
export const nextDay = (d: string): string => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + 86_400_000).toISOString().slice(0, 10) : '';
};

/** «SLB-IPC-P0402-001» */
export const docCodeOf = (pkg: string, no: number): string => `SLB-IPC-${pkgCodeOf(pkg)}-${String(no).padStart(3, '0')}`;

/* ─────────────────────── ХУРИМТЛАЛ ─────────────────────── */

export type Cum = {
  /** Нийт гүйцэтгэл (гүйцэтгэлийн IPC-ийн нийт дүн) — өмнөх · энэ хүртэл */
  perfPrev: number;
  perfCum: number;
  /** Санхүүжилт (нийт − эргэн төлөлт − төсвөөс давсан) */
  finPrev: number;
  finCum: number;
  /** Гэрээний дүн − хуримтлагдсан санхүүжилт; гэрээний дүнгүй бол `null` */
  finLeft: number | null;
  /** Гүйцэтгэгчид төлөх дүн */
  payPrev: number;
  payCum: number;
  /** Урьдчилгааны үлдэгдэл (урьдчилгаа − эргэн төлөлт) энэ хүртэл */
  advLeft: number;
};

const v0 = (x: number | null): number => x ?? 0;
const perfOf = (x: IpcRec): number => (x.advance ? 0 : v0(x.total));
const finOf = (x: IpcRec): number => v0(x.total) - v0(x.recovery) - v0(x.overBudget);
const payOf = (x: IpcRec): number => v0(x.payable ?? x.total);

/** IPC бүрийн өмнөх · хуримтлагдсан · үлдэгдэл (`recordsOf`-ийн дараалалтай зэрэгцээ) */
export function cumulative(recs: readonly IpcRec[], contract: number | null): Cum[] {
  let perf = 0; let fin = 0; let pay = 0; let adv = 0;
  return recs.map((x) => {
    const before = { perfPrev: perf, finPrev: fin, payPrev: pay };
    perf = r2(perf + perfOf(x));
    fin = r2(fin + finOf(x));
    pay = r2(pay + payOf(x));
    adv = r2(adv + v0(x.advanceFin) - v0(x.recovery));
    return { ...before, perfCum: perf, finCum: fin, payCum: pay, finLeft: contract == null ? null : r2(contract - fin), advLeft: adv };
  });
}

/** Урьдчилгааны үлдэгдэл ба өмнөх гүйцэтгэл — шинэ IPC-ийн саналд */
export function contextOf(recs: readonly IpcRec[]): { advanceLeft: number; perfBefore: number } {
  const c = cumulative(recs, null);
  const last = c[c.length - 1];
  return { advanceLeft: Math.max(0, last?.advLeft ?? 0), perfBefore: last?.perfCum ?? 0 };
}

/**
 * «ХҮСНЭГТ 7» — `recs[i]`-ийн баримт. Гэрээний баганын норм · хяналт · барьцаа нь `ipcDoc`-ийн томьёогоор (гэрээний дүнгээс).
 */
export function t7Of(recs: readonly IpcRec[], i: number, contract: number | null, rates: Rates = IPC_RATES): T7Row[] {
  const prev = recs.slice(0, i);
  const cur = recs[i];
  const upto = [...prev, cur];
  const sum = (list: readonly IpcRec[], f: (x: IpcRec) => number): number => r2(list.reduce((a, x) => a + f(x), 0));
  const tri = (f: (x: IpcRec) => number) => ({ cum: sum(upto, f), prev: sum(prev, f), now: r2(f(cur)) });
  const Cn = contract;
  const Bc = Cn == null ? null : Cn / contractFactor(rates);
  const cNorm = Bc == null ? null : r2(rates.norm * Bc);
  const cTech = Bc == null ? null : r2(rates.tech * Bc);
  const cAuthor = Bc == null ? null : r2(rates.author * Bc);
  const cRet = Cn == null ? null : r2(rates.retention * Cn);
  const left = (c: number | null, cum: number): number | null => (c == null ? null : r2(c - cum));
  const adv = tri((x) => v0(x.advanceFin));
  const rec = tri((x) => v0(x.recovery));
  const over = tri((x) => v0(x.overBudget));
  const cPay = Cn == null ? null : r2(Cn - (cTech ?? 0) - (cAuthor ?? 0) - (cRet ?? 0));
  const line = (label: string, c: number | null, t: { cum: number; prev: number; now: number }, bold = false, perfV: number | null = null): T7Row => ({
    label, bold, contract: c, perf: perfV, fin: t.cum, prev: t.prev, now: t.now, remain: left(c, t.cum),
  });
  return [
    line('Нийт дүн', Cn, tri((x) => v0(x.total) - v0(x.recovery)), true, sum(upto, perfOf)),
    { label: 'Урьдчилгаа санхүүжилт', contract: null, perf: null, fin: adv.cum, prev: adv.prev, now: adv.now, remain: null },
    { label: 'Урьдчилгаа эргэн төлөлт', contract: null, perf: null, fin: rec.cum, prev: rec.prev, now: rec.now, remain: adv.cum ? r2(adv.cum - rec.cum) : null },
    { label: 'Төсвөөс давсан гүйцэтгэл', contract: null, perf: over.cum, fin: null, prev: over.prev, now: over.now, remain: null },
    line('Санхүүжилтийн эрх нээсэн нийт дүн', Cn, tri(finOf), true),
    line('Норм нормативын сан', cNorm, tri((x) => v0(x.norm))),
    line('Захиалагчийн хяналтын зардал', cTech, tri((x) => v0(x.clientCtl))),
    line('Зохиогчийн хяналтын зардал', cAuthor, tri((x) => v0(x.authorCtl))),
    line('Барьцаа', cRet, tri((x) => v0(x.retention))),
    line('Гүйцэтгэгчид төлөх дүн', cPay, tri(payOf), true),
  ];
}

/* ─────────────────────── ШАЛГАЛТ ─────────────────────── */

export type DocWhy = 'total' | 'negative' | 'payable' | 'no-end' | 'period-order' | 'before-prev' | 'overlap' | 'note';

/**
 * Хадгалах боломжгүй шалтгаанууд (хоосон = болно). `others` — ижил гэрээний бусад IPC (засварт өөрийгөө хасна); үеийн
 * шалгалт зөвхөн ижил багцын 238-ийн гүйцэтгэлийн IPC-тэй (хуучин баримтад үе алга).
 */
export function docWhy(draft: Row, others: readonly IpcRec[], ownNo: number | null = null): DocWhy[] {
  const out: DocWhy[] = [];
  const advance = txt(draft[F.type]) === IPC_DOC.types.advance;
  const total = num(draft[F.total]);
  if (total == null || !(total > 0)) out.push('total');
  if (DEDUCTIONS.some((f) => (num(draft[f]) ?? 0) < 0)) out.push('negative');
  const pay = payableOf(draft);
  if (pay != null && pay < 0) out.push('payable');
  const from = dayOf(draft[F.start]);
  const to = dayOf(draft[F.end]);
  if (!advance && !to) out.push('no-end');
  if (from && to && to < from) out.push('period-order');
  if (!advance && to) {
    const key = pkgOf(draft[F.pkg]);
    const peers = others.filter((x) => x.src === 'doc' && !x.advance && x.to && pkgOf(x.pkg) === key);
    const prevEnd = peers.filter((x) => ownNo == null || x.no == null || x.no < ownNo).map((x) => x.to).sort().pop();
    if (prevEnd && to < prevEnd) out.push('before-prev');
    const a = from || to;
    if (peers.some((x) => (x.from || x.to) <= to && a <= x.to)) out.push('overlap');
  }
  if (deductionsOf(draft) > 0 && !txt(draft[F.note])) out.push('note');
  return out;
}

/* ─────────────────────── БИЧИЛТ ─────────────────────── */

/** Хэрэглэгч засах талбарууд (бусад нь систем бөглөнө) */
export const EDITABLE: readonly string[] = [
  F.kod, F.start, F.end, F.annual, F.contractorRd, F.note,
  F.total, F.advance, ...DEDUCTIONS,
  ...Object.values(IPC_DOC.signers),
];

const pickEditable = (values: Row): Row => {
  const o: Row = {};
  for (const f of EDITABLE) if (f in values) o[f] = values[f] === '' ? null : values[f];
  return o;
};

export type DocHead = { code: string; contractNo: string; contractor: string; pkg: string; no: number };

/**
 * ГҮЙЦЭТГЭЛИЙН IPC ҮҮСГЭХ — 238-ийн нэг мөр + орсон бөглөлтүүдийг 185-д түгжих засвар (`ipc_dugaar`, «IPC үүссэн»).
 */
export function newWorkDoc(h: DocHead, fills: readonly PerfRow[], values: Row): { doc: Row; lock: Row[] } {
  const doc = withPcts({
    ...pickEditable(values),
    [F.type]: IPC_DOC.types.work,
    [F.no]: h.no,
    [F.code]: h.code,
    [F.contractNo]: h.contractNo || null,
    [F.contractor]: h.contractor || null,
    [F.pkg]: h.pkg || null,
    [F.pkgCode]: pkgCodeOf(h.pkg),
    [F.status]: S.created,
  });
  return { doc, lock: fills.map((r) => ({ [HO_IPC.oid]: r.oid, [P.ipcNo]: h.no, [S.field]: S.created })) };
}

/** УРЬДЧИЛГААНЫ IPC — «Гэрээ үүсгэх»-ээс, багц бүрт нэг */
export function newAdvanceDoc(h: DocHead, amount: number, day: string): Row {
  const money = defaultAdvance(amount);
  return {
    ...money,
    [F.type]: IPC_DOC.types.advance,
    [F.no]: h.no,
    [F.kod]: docCodeOf(h.pkg, h.no),
    [F.code]: h.code,
    [F.contractNo]: h.contractNo || null,
    [F.contractor]: h.contractor || null,
    [F.pkg]: h.pkg || null,
    [F.pkgCode]: pkgCodeOf(h.pkg),
    [F.start]: day,
    [F.status]: S.created,
    [F.note]: explainDeductions(money) || null,
  };
}

/** ЗАСАХ — зөвхөн «IPC үүссэн» баримт; дугаар, багц, бөглөлт, үеийн төгсгөл өөрчлөгдөхгүй. Буцаах — зөвхөн өөрчлөх талбарууд */
export function editDoc(rec: IpcRec, values: Row): Row | 'status' {
  if (rec.src !== 'doc' || rec.status !== S.created) return 'status';
  const v = pickEditable(values);
  if (!rec.advance) delete v[F.end];
  const next = withPcts({ ...rec.row, ...v });
  const out: Row = { [IPC_DOC.oid]: rec.oid };
  for (const f of [...Object.keys(v), F.recoveryPct, F.retentionPct, F.payable]) out[f] = next[f];
  return out;
}

/** Скан оруулсан — «Гарын үсэг зурсан» */
export const signDoc = (rec: IpcRec, itemId: string, day: string): Row => ({
  [IPC_DOC.oid]: rec.oid, [F.docItem]: itemId, [F.status]: S.signed, [F.signDate]: day,
});

/** Гэрээний мөрийн талбарууд — гараар оруулсан мөрөөс (AUTO · баримт · төлбөрийн мөр биш), олдохгүй бол аль ч мөрөөс */
function headOf(pays: readonly Row[]): Row {
  const main = pays.filter((r) => !isAuto(r) && !isDocRow(r) && !isPayRow(r));
  const out: Row = {};
  for (const f of Object.values(C)) {
    const has = (r: Row) => r[f] != null && txt(r[f]) !== '';
    const r = main.find(has) ?? pays.find(has);
    if (r) out[f] = r[f];
  }
  return out;
}

/** Бөглөлт баримтын багцынх уу (баримт багцгүй бол бүгд) */
const samePkg = (rec: IpcRec, r: Row): boolean => !rec.pkg || pkgOf(r[C.pkg]) === pkgOf(rec.pkg);

export type ApproveEdit = { pay: Row | null; auto: Row[]; doc: Row };
export type ApproveWhy = 'status' | 'no-doc' | 'no-fills';

/**
 * БАТАЛГААЖУУЛАХ — 185-д НЭГ төлбөрийн мөр (`dun` = нийт дүн, «Олгосон»), орсон бөглөлтүүд «Олгосон», 238-ийн мөр «Олгосон» +
 * гүйлгээний огноо. Төлбөрийн мөр аль хэдийн байвал (өмнөх оролдлого 185-д бичээд 238-д унасан) дахин нэмэхгүй.
 * `pays` — тэр гэрээний 185-ын мөрүүд (сервероос сая уншсан).
 */
export function approveDoc(rec: IpcRec, pays: readonly Row[], day: string): ApproveEdit | ApproveWhy {
  if (rec.src !== 'doc' || rec.no == null || rec.status !== S.signed) return 'status';
  if (!rec.docItem) return 'no-doc';
  const no = rec.no;
  const code = txt(rec.row[F.code]);
  const mine = (r: Row) => txt(r[C.code]) === code && num(r[P.ipcNo]) === no;
  const has = pays.some((r) => isPayRow(r) && mine(r));
  /* Зөвхөн энэ баримтын багцын бөглөлт — зэрэг үүссэн ижил дугаартай өөр багцын баримтынхыг хөндөхгүй */
  const auto = pays.filter((r) => isAuto(r) && mine(r) && samePkg(rec, r) && statusOf(r) === S.created)
    .map((r) => ({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [S.field]: S.paid }));
  if (!rec.advance && !has && !auto.length) return 'no-fills';
  const year = Number(day.slice(0, 4));
  const head = headOf(pays);
  const pay: Row | null = has ? null : {
    ...head,
    [P.id]: payId(code, no),
    [C.code]: code,
    [C.pkg]: rec.pkg || txt(head[C.pkg]) || null,
    [P.kind]: rec.advance ? HO_IPC.kinds.advance : HO_IPC.kinds.work,
    [P.ipcNo]: no,
    [P.amount]: rec.total,
    [S.field]: S.paid,
    [P.payDate]: day,
    [P.year]: Number.isFinite(year) ? year : null,
  };
  return { pay, auto, doc: { [IPC_DOC.oid]: rec.oid, [F.status]: S.paid, [F.payDate]: day } };
}

/**
 * УСТГАХ — батлаагүй баримт. `unlock` нь бөглөлтүүдийг чөлөөлнө; 238-ийн устгал унавал `restore`-оор буцааж түгжинэ.
 */
export function deleteDoc(rec: IpcRec, pays: readonly Row[]): { unlock: Row[]; restore: Row[] } | 'paid' {
  if (rec.src !== 'doc' || rec.status === S.paid) return 'paid';
  const code = txt(rec.row[F.code]);
  const mine = (r: Row) => txt(r[C.code]) === code && rec.no != null && num(r[P.ipcNo]) === rec.no;
  if (pays.some((r) => isPayRow(r) && mine(r))) return 'paid';
  const rows = pays.filter((r) => isAuto(r) && mine(r) && samePkg(rec, r) && statusOf(r) !== S.paid);
  return {
    unlock: rows.map((r) => ({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [P.ipcNo]: null, [S.field]: S.work })),
    restore: rows.map((r) => ({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [P.ipcNo]: num(r[P.ipcNo]), [S.field]: txt(r[S.field]) || null })),
  };
}

/** Ижил дугаартай бусад баримт (238 ба хуучин) — зэрэг үүсгэлтийг илрүүлнэ */
export const sameNo = (recs: readonly IpcRec[], no: number, mineOid: number): IpcRec[] =>
  recs.filter((x) => x.no === no && x.src !== 'pay' && !(x.src === 'doc' && x.oid === mineOid));

/**
 * ДАВХАР ТӨЛБӨРИЙН МӨР (2026-11-24) — хоёр хүн нэг IPC-г зэрэг баталбал 185-д `PAY|код|дугаар` хоёр нэмэгдэнэ. Нэмсний дараа
 * сая уншсан мөрөөс ижил код · дугаар · багцын хамгийн бага objectid-оос бусдыг устгана (`dupAddsToDelete`-тэй нэг дүрэм).
 */
export function dupPayDeletes(pays: readonly Row[], code: string, no: number): number[] {
  const by = new Map<string, number[]>();
  for (const r of pays) {
    if (!isPayRow(r) || txt(r[C.code]) !== code || num(r[P.ipcNo]) !== no) continue;
    const oid = num(r[HO_IPC.oid]);
    if (oid == null) continue;
    const k = pkgOf(r[C.pkg]);
    by.set(k, [...(by.get(k) ?? []), oid]);
  }
  return [...by.values()].flatMap((oids) => oids.sort((a, b) => a - b).slice(1));
}

/** Түгжих бөглөлт бүр сая уншсан 185-д чөлөөтэй хэвээр уу (AUTO, «Гүйцэтгэл», дугааргүй) — 2026-11-24 */
export function stillFree(pays: readonly Row[], rows: readonly PerfRow[]): boolean {
  const free = new Set(perfRows(pays).filter((r) => r.status === S.work && r.ipcNo == null).map((r) => r.oid));
  return rows.every((r) => free.has(r.oid));
}

/**
 * ЗЭРЭГ ҮҮССЭН ДУГААРЫН БУЦААЛТ (2026-11-24) — хожуу баримт өөрийгөө устгахад миний түгжсэн бөглөлтөөс үлдсэн баримтын
 * үед (төгсгөл ≥ өдөр) ОРООГҮЙГ л чөлөөлнө; үлдсэн баримт төгсгөлгүй бол хөндөхгүй. Зөвхөн сая уншсан 185-д энэ дугаар,
 * «IPC үүссэн» хэвээр мөр. `keepers` — ижил багцын үлдэх баримтууд (хоосон = бүгдийг чөлөөлнө).
 */
export function rollbackRelease(after: readonly Row[], mine: readonly PerfRow[], keepers: readonly IpcRec[], no: number): Row[] {
  const my = new Set(mine.map((r) => r.oid));
  const covered = (day: string): boolean => keepers.some((x) => !x.to || (!!day && day <= x.to));
  return perfRows(after)
    .filter((r) => my.has(r.oid) && r.ipcNo === no && r.status === S.created && !covered(r.day))
    .map((r) => ({ [HO_IPC.oid]: r.oid, [P.ipcNo]: null, [S.field]: S.work }));
}

/** Гэрээ цуцлах боломжгүй — 238-д тэр гэрээний баримт байна */
export const docsBlockCancel = (docs: readonly Row[]): boolean => docs.length > 0;

/* ─────────────────────── ТЭНЦЭЛ ─────────────────────── */

/**
 * БӨГЛӨЛТ ↔ ОЛГОСОН — бөглөлтийн гүйцэтгэл (цуцлагдаагүй AUTO мөрийн `guits_une`), IPC-д орсон, бөглөлтөөс үүссэн IPC-ээр
 * олгосон дүн (238 ба хуучин баримт; баримтгүй өмнөх төлбөр бөглөлтөөс өмнөх тул орохгүй). Олгох ёстой = гүйцэтгэл − IPC-д орсон.
 */
export function fillBalance(pays: readonly Row[], recs: readonly IpcRec[]): { fills: number; inIpc: number; paid: number; due: number } {
  /* 2026-11-24 (засвар): IPC-д орсон = бөглөлтөөс үүссэн гүйцэтгэлийн IPC-ийн НИЙТ ДҮН (238 ба хуучин баримт, цуцлагдаагүй),
     бөглөлтийн нийлбэр биш — IPC бөглөлтөөс бага бол зөрүү олгох ёстойд үлдэнэ, их бол дараагийнхыг бууруулна.
     Олгосон = баталсан IPC-ийн бодит төлбөр. Баримт нь олдохгүй түгжигдсэн бөглөлт өөрийн дүнгээр (өмнөх дүрэм). */
  const docs = recs.filter((x) => (x.src === 'doc' || x.src === 'legacy') && !x.advance && x.no != null && x.status !== S.cancelled);
  const hasDoc = (r: PerfRow): boolean => docs.some((x) => x.no === r.ipcNo && (!x.pkg || pkgOf(x.pkg) === pkgOf(r.pkg)));
  let fills = 0; let inIpc = 0; let paid = 0;
  for (const r of perfRows(pays)) {
    if (r.status === S.cancelled) continue;
    fills += r.une ?? 0;
    if (r.ipcNo == null || r.status === S.work || hasDoc(r)) continue;
    inIpc += r.une ?? 0;
    if (r.status === S.paid) paid += r.une ?? 0;
  }
  for (const x of docs) {
    inIpc += x.total ?? 0;
    if (x.status === S.paid) paid += (x.src === 'legacy' ? num(x.row[P.amount]) : null) ?? x.total ?? 0;
  }
  /* 2026-11-23: хуучин IPC-д орсон бөглөлт ч хасагдана (Багц-2: 148.1 биш 55.0 тэрбум) */
  return { fills: r2(fills), inIpc: r2(inIpc), paid: r2(paid), due: r2(fills - inIpc) };
}
