/**
 * САР БҮРИЙН IPC БАРИМТ — ЦЭВЭР ТООЦОО (2026-09-29).
 *
 * ⚠️ ЯАГААД (хэрэглэгч: «ipc баримтуудыг загвар гэж бодоод бодит утгууд нь системээс
 *    гараад яг ийм форматаар pdf татаж авна · гүйцэтгэлийг сард нэг удаа бөглөнө гэж
 *    тооцоод тухайн сард нэг ийм баримт гарна»): `docs/ipc barimt`-ийн 34 скан баримт
 *    нь ЗӨВХӨН ХЭЛБЭР. Тоо бүр системээс — бөглөх хуудасны батлагдсан архив (обьём ×
 *    нэгж өртөг) ба ХО-гийн гэрээ (гэрээний дүн, урьдчилгаа).
 *
 * ГУРВАН ХУУДАС (скан баримтын дарааллаар):
 *   1. Хүснэгт 7   — санхүүжилтийн хүснэгт (гэрээ · нийт · өмнөх · одоо · үлдэгдэл)
 *   2. Гүйцэтгэл-1 — зардлын төрлөөр (БУА · НӨАТ · норм · хяналт · БҮГД ДҮН)
 *   3. Хавсралт 12 — блок тус бүрээр (төлөвлөгөө · хуримтлагдсан · тайлант үе)
 *
 * ⚠️ ХУВЬ ХЭМЖЭЭ — скан баримтуудаас ТООГООР гаргасан (баримтад хувь бичигдээгүй;
 *    Багц 3.2-ын IPC-1-ийг 1 төгрөгийн нарийвчлалаар давтав, `ipcDoc.check.mjs`):
 *      гэрээний БҮГД  = БУА × (1 + НӨАТ 10% + норм 0.18% + техник хяналт 2% +
 *                       зохиогчийн хяналт 1% + магадлашгүй 2%) = БУА × 1.1518
 *      гүйцэтгэлийн БҮГД = БУА × 1.1318 (магадлашгүй ажил гүйцэтгэлд ОРОХГҮЙ)
 *      барьцаа 5% · урьдчилгааны эргэн төлөлт 25% (сар бүрийн БҮГД-ээс)
 *      урьдчилгаанаас суутгах захиалагчийн хяналт = 2 / 115.18 (≈1.7364%)
 *
 * ⚠️ БУА = Σ (хуримтлагдсан обьём × нэгж өртөг) — бөглөх хуудасны нэгж өртөг НӨАТ-гүй
 *    (Багц 3.2: блок бүр 13.28 тэрбум × 12 ≈ гэрээний БУА 163.1 тэрбум).
 * ⚠️ ЗАРДЛЫН ЭЛЕМЕНТ (ажиллах хүч · материал · машин · тоног · тээвэр · нэмэгдэл · ашиг)
 *    системд ЗАДАРГААГҮЙ — мөр бүр ганц нэгж өртөгтэй. Тэр мөрүүд `null` (хоосон, «—»);
 *    0 гэж бичихгүй (`null ≠ 0`).
 * ⚠️ React/сүлжээгүй — `ipcDoc.check.mjs` шууд Node дээр ачаална.
 */

/* ══════════════════ ХУВЬ ХЭМЖЭЭ ══════════════════ */
export const IPC_RATES = {
  vat: 0.10,
  norm: 0.0018,
  tech: 0.02,
  author: 0.01,
  /** Магадлашгүй ажил — ЗӨВХӨН гэрээний задаргаанд (гүйцэтгэлд 0) */
  contingency: 0.02,
  retention: 0.05,
  recovery: 0.25,
} as const;
/** Гэрээний БҮГД / БУА */
export const CONTRACT_FACTOR = 1 + IPC_RATES.vat + IPC_RATES.norm + IPC_RATES.tech + IPC_RATES.author + IPC_RATES.contingency;
/** Гүйцэтгэлийн БҮГД / БУА */
export const PERF_FACTOR = 1 + IPC_RATES.vat + IPC_RATES.norm + IPC_RATES.tech + IPC_RATES.author;
/** Урьдчилгаанаас суутгах захиалагчийн хяналтын хувь — 2 / 115.18 */
export const ADVANCE_TECH = IPC_RATES.tech / CONTRACT_FACTOR;

/* ══════════════════ ОРОЛТ ══════════════════ */

/** Нэг блок — БУА (НӨАТ-гүй) хуримтлагдсан дүн, агшин бүрээр */
export type IpcBlock = {
  /** «5/1» г.м.; олон хуудастай багцад «9F 5/1» */
  label: string;
  /** Тухайн блокийн хуудасны гэрээний жин (`Σ обьём × нэгж өртөг`, нэг блокийн) */
  weight: number;
  /** Төлөвлөсөн эхлэх/дуусах (мс, UTC шөнө дунд) — `null` = хуваарьгүй */
  planStart: number | null;
  planEnd: number | null;
};

/** Нэг САР — тухайн сарын төгсгөлийн агшин (блокийн дарааллаар, БУА) */
export type IpcMonth = {
  /** `YYYY-MM` */
  month: string;
  /** Гүйцэтгэлийн агшны өдөр (`YYYY-MM-DD`) — олон хуудастай бол хамгийн сүүлийнх */
  day: string;
  /** Блок бүрийн ХУРИМТЛАГДСАН БУА — `null` = тэр блок хэмжигдээгүй */
  cum: (number | null)[];
};

export type IpcInput = {
  /** Багцын нэр («Багц 3.2») */
  pkgName: string;
  /** Багцын дугаарын код — «3.2» → «P0302» */
  pkgCode: string;
  project: string;
  contractor: string;
  contractNo: string;
  /** Гэрээний БҮГД ДҮН (ХО `gereet_tosov_niit`) */
  contract: number;
  /** Урьдчилгаа (ХО, `tulult_turul` = урьдчилгаа) — `null` = олгоогүй */
  advance: number | null;
  /** Гэрээний эхлэх/дуусах (мс) — хуудасны гэрээний огнооноос */
  contractStart: number | null;
  contractEnd: number | null;
  blocks: IpcBlock[];
  /** БҮХ сар, өсөх дарааллаар — эргэн төлөлт өмнөх саруудаас хуримтлагдана */
  months: IpcMonth[];
  /** Баримт гаргах сар (`YYYY-MM`) */
  month: string;
  /** Эргэн төлөлт ЭХЛЭХ сар (`YYYY-MM`) — `null` = эхний сараас */
  recoveryFrom: string | null;
  /** Эргэн төлөлтийн хувь (0–1) */
  recoveryRate?: number;
  /** Гараар — системд байхгүй */
  annual: number | null;
  ipcNo: number;
};

/* ══════════════════ ГАРАЛТ ══════════════════ */

/** Хүснэгт 7-гийн нэг мөр. `null` = хоосон нүд («—») */
export type T7Row = {
  label: string;
  bold?: boolean;
  contract: number | null;
  perf: number | null;
  fin: number | null;
  prev: number | null;
  now: number | null;
  remain: number | null;
};

/** Гүйцэтгэл-1-ийн нэг мөр. Хувь нь 0–100 (`pct()` 100-аар үржүүлдэггүй) */
export type G1Row = {
  label: string;
  bold?: boolean;
  shade?: boolean;
  contract: number | null;
  cum: number | null;
  prev: number | null;
  now: number | null;
  remain: number | null;
};

export type H12Row = {
  label: string;
  planStart: number | null;
  planEnd: number | null;
  planDays: number | null;
  planCost: number;
  cum: number | null;
  prev: number | null;
  actStart: number | null;
  actEnd: number | null;
  actDays: number | null;
  now: number | null;
  remain: number | null;
};

/**
 * `noPrev` — системд өмнөх сарын агшин алга (тайлант = эхнээсээ хуримтлагдсан)
 * `noAdvance` — ХО-д урьдчилгаа алга · `negative` — сарын гүйцэтгэл буурсан · `over` — гэрээнээс давсан
 */
export type IpcNote = 'noPrev' | 'noAdvance' | 'negative' | 'over';

export type IpcDoc = {
  docNo: string;
  month: string;
  periodFrom: number;
  periodTo: number;
  input: IpcInput;
  t7: T7Row[];
  g1: G1Row[];
  h12: H12Row[];
  h12Total: { planCost: number; cum: number; prev: number; now: number; remain: number };
  /** Анхааруулгын КОД — баримт (монгол маягт) ба цонх (`tr()`) өөр өөрөөр бичнэ */
  notes: IpcNote[];
};

/* ══════════════════ ТУСЛАХ ══════════════════ */

const DAY = 86_400_000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const sumN = (xs: (number | null)[]): number | null => {
  let s = 0; let any = false;
  for (const x of xs) if (x != null) { s += x; any = true; }
  return any ? s : null;
};
/**
 * Хоногийн тоо — скан баримтын дүрмээр ЗӨРҮҮ (2025.10.08 → 2027.06.30 = 630, 2025.10.08 →
 * 2025.12.25 = 78). ⚠️ `plan.ts`-ийн `spanDays` (хоёр захыг оруулсан, +1)-ээс САНААТАЙ өөр.
 */
export const daysIncl = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b < a ? null : Math.round((b - a) / DAY);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** `YYYY-MM` сарын эхний/сүүлийн өдөр (мс) */
export const monthStart = (m: string) => Date.parse(`${m}-01T00:00:00Z`);
export const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return Date.UTC(y, mo, 0);
};
/** «Багц 3.2» → «P0302», «Багц 1» → «P0100», «Багц 4-1» → «P0401» */
export function pkgCodeOf(group: string): string {
  const m = /(\d+)(?:[.\-](\d+))?/.exec(group);
  if (!m) return 'P0000';
  return `P${m[1].padStart(2, '0')}${(m[2] ?? '0').padStart(2, '0')}`;
}

/**
 * Хуудасны архивын өдрүүдээс САР БҮРИЙН агшин (2026-09-29).
 * ⚠️ «Сард нэг бөглөнө» — тухайн сард хэд хэдэн агшин байвал СҮҮЛИЙНХ нь тэр сарын
 *    баримт (өмнөх нь засвар/давтан бөглөлт).
 * Буцаах: сар → тухайн сарын сүүлийн өдөр. Сар өсөх дарааллаар.
 */
export function monthEnds(days: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [...days].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) out.set(d.slice(0, 7), d);
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

/* ══════════════════ ТООЦОО ══════════════════ */

type Flow = {
  /** Сарын гүйцэтгэл — БУА ба БҮГД */
  bua: number; gross: number;
  rec: number; tech: number; author: number; ret: number; pay: number;
};

/**
 * Сар бүрийн санхүүжилтийн урсгал — эргэн төлөлт урьдчилгааны үлдэгдлээр хязгаарлагдана.
 * ⚠️ Сарын гүйцэтгэл = тухайн сарын агшин − өмнөх сарын агшин (блок бүрээр). Сөрөг
 *    (засвараар буурсан) бол сөрөг хэвээр — баримт нь бодит өөрчлөлтийг харуулна.
 */
function flows(inp: IpcInput): { month: string; flow: Flow }[] {
  const rate = inp.recoveryRate ?? IPC_RATES.recovery;
  const adv = inp.advance ?? 0;
  const out: { month: string; flow: Flow }[] = [];
  let prevCum: (number | null)[] = inp.blocks.map(() => null);
  let recovered = 0;
  for (const m of inp.months) {
    const bua = m.cum.reduce<number>((s, c, b) => s + ((c ?? 0) - (prevCum[b] ?? 0)), 0);
    prevCum = m.cum;
    const gross = bua * PERF_FACTOR;
    const on = inp.recoveryFrom == null || m.month >= inp.recoveryFrom;
    const rec = on ? Math.max(0, Math.min(rate * gross, adv - recovered)) : 0;
    recovered += rec;
    const tech = IPC_RATES.tech * bua - ADVANCE_TECH * rec;
    const author = IPC_RATES.author * bua;
    const ret = IPC_RATES.retention * gross;
    const pay = gross - rec - tech - author - ret;
    out.push({ month: m.month, flow: { bua, gross, rec, tech, author, ret, pay } });
    if (m.month === inp.month) break;
  }
  return out;
}

export function buildIpcDoc(inp: IpcInput): IpcDoc | null {
  const idx = inp.months.findIndex((m) => m.month === inp.month);
  if (idx < 0) return null;
  const fl = flows(inp);
  const cur = fl[fl.length - 1].flow;
  const before = fl.slice(0, -1).map((x) => x.flow);
  const S = (k: keyof Flow, list: Flow[]) => list.reduce((s, f) => s + f[k], 0);
  const notes: IpcNote[] = [];

  const C = inp.contract;
  const adv = inp.advance ?? 0;
  const Bc = C / CONTRACT_FACTOR;
  /* ⚠️ Бүрэлдэхүүн бүрийг 2 оронтой бөөрөнхийлөөд хасна — скан баримтын дүрэм
     (бөөрөнхийлөөгүй нийлбэр 0.02 төгрөгөөр зөрдөг, `ipcDoc.check.mjs`). */
  const cTech = r2(IPC_RATES.tech * Bc);
  const cAuthor = r2(IPC_RATES.author * Bc);
  const cRet = r2(IPC_RATES.retention * C);

  /* ── Хүснэгт 7 ── */
  const perfPrev = S('gross', before);
  const perfCum = perfPrev + cur.gross;
  const recPrev = S('rec', before);
  const recCum = recPrev + cur.rec;
  const finPrev = adv + perfPrev - recPrev;
  const finCum = finPrev + cur.gross - cur.rec;
  const advTech = ADVANCE_TECH * adv;
  const techPrev = advTech + S('tech', before);
  const authPrev = S('author', before);
  const retPrev = S('ret', before);
  const payPrev = (adv - advTech) + S('pay', before);
  const over = perfCum > C ? perfCum - C : null;
  const t7: T7Row[] = [
    { label: 'Нийт дүн', bold: true, contract: C, perf: perfCum, fin: finCum, prev: finPrev, now: cur.gross - cur.rec, remain: C - finCum },
    { label: 'Урьдчилгаа санхүүжилт', contract: null, perf: null, fin: adv || null, prev: adv || null, now: null, remain: null },
    { label: 'Урьдчилгаа эргэн төлөлт', contract: null, perf: null, fin: recCum || null, prev: recPrev || null, now: cur.rec || null, remain: adv ? adv - recCum : null },
    { label: 'Төсвөөс давсан гүйцэтгэл', contract: null, perf: over, fin: null, prev: null, now: null, remain: null },
    { label: 'Санхүүжилтийн эрх нээсэн нийт дүн', bold: true, contract: C, perf: null, fin: finCum, prev: finPrev, now: cur.gross - cur.rec, remain: C - finCum },
    { label: 'Норм нормативын сан', contract: IPC_RATES.norm * Bc, perf: null, fin: null, prev: null, now: null, remain: null },
    { label: 'Захиалагчийн хяналтын зардал', contract: cTech, perf: null, fin: techPrev + cur.tech, prev: techPrev, now: cur.tech, remain: cTech - techPrev - cur.tech },
    { label: 'Зохиогчийн хяналтын зардал', contract: cAuthor, perf: null, fin: authPrev + cur.author, prev: authPrev, now: cur.author, remain: cAuthor - authPrev - cur.author },
    { label: 'Барьцаа', contract: cRet, perf: null, fin: retPrev + cur.ret, prev: retPrev, now: cur.ret, remain: cRet - retPrev - cur.ret },
    {
      label: 'Гүйцэтгэгчид төлөх дүн', bold: true,
      contract: C - cTech - cAuthor - cRet, perf: null,
      fin: payPrev + cur.pay, prev: payPrev, now: cur.pay,
      remain: C - cTech - cAuthor - cRet - payPrev - cur.pay,
    },
  ];

  /* ── Гүйцэтгэл-1 ── */
  const bPrev = S('bua', before);
  const bCum = bPrev + cur.bua;
  const line = (label: string, rate: number, contractRate: number = rate, extra: Partial<G1Row> = {}): G1Row => ({
    label, contract: contractRate * Bc, cum: rate * bCum, prev: rate * bPrev, now: rate * cur.bua,
    remain: contractRate * Bc - rate * bCum, ...extra,
  });
  const empty = (label: string): G1Row => ({ label, contract: null, cum: null, prev: null, now: null, remain: null });
  const dunRate = 1 + IPC_RATES.vat + IPC_RATES.norm;
  const custRate = IPC_RATES.tech + IPC_RATES.author;
  const custContract = IPC_RATES.tech + IPC_RATES.author + IPC_RATES.contingency;
  const g1: G1Row[] = [
    empty('Ажиллах хүчний зардал'),
    empty('Материалын зардал'),
    empty('Машин механизмын зардал'),
    empty('Тоног төхөөрөмжийн зардал'),
    empty('Тээврийн зардал'),
    empty('Нэмэгдэл зардал'),
    empty('Ашиг'),
    line('Барилга угсралтын ажлын дүн', 1, 1, { bold: true, shade: true }),
    line('НӨАТ', IPC_RATES.vat),
    line('Нормчлолын сан', IPC_RATES.norm),
    line('ДҮН', dunRate, dunRate, { bold: true, shade: true }),
    line('Техник хяналтын зардал', IPC_RATES.tech),
    { label: 'Зураг төслийн үнэ', contract: 0, cum: 0, prev: 0, now: 0, remain: 0 },
    line('Зохиогчийн хяналтын зардал', IPC_RATES.author),
    line('Магадлашгүй ажлын зардал', 0, IPC_RATES.contingency),
    line('Захиалагчийн зардлын задаргааны нийт дүн', custRate, custContract, { bold: true, shade: true }),
    { label: 'БҮГД ДҮН', bold: true, contract: C, cum: PERF_FACTOR * bCum, prev: PERF_FACTOR * bPrev, now: PERF_FACTOR * cur.bua, remain: C - PERF_FACTOR * bCum },
  ];

  /* ── Хавсралт 12 ── */
  const m = inp.months[idx];
  const prevM = idx > 0 ? inp.months[idx - 1] : null;
  const wSum = inp.blocks.reduce((s, b) => s + (b.weight > 0 ? b.weight : 0), 0);
  const periodTo = dayMs(m.day);
  const periodFrom = prevM ? dayMs(prevM.day) + DAY : monthStart(inp.month);
  const h12: H12Row[] = inp.blocks.map((b, i) => {
    const planCost = wSum > 0 ? C * (Math.max(0, b.weight) / wSum) : C / Math.max(1, inp.blocks.length);
    const cum = m.cum[i] == null ? null : m.cum[i]! * PERF_FACTOR;
    const prev = prevM?.cum[i] == null ? null : prevM.cum[i]! * PERF_FACTOR;
    const now = cum == null ? null : cum - (prev ?? 0);
    const moved = now != null && Math.abs(now) >= 0.5;
    return {
      label: b.label,
      planStart: b.planStart, planEnd: b.planEnd, planDays: daysIncl(b.planStart, b.planEnd), planCost,
      cum, prev,
      actStart: moved ? periodFrom : null, actEnd: moved ? periodTo : null,
      actDays: moved ? daysIncl(periodFrom, periodTo) : null,
      now: moved ? now : null,
      remain: planCost - (cum ?? 0),
    };
  });
  const h12Total = {
    planCost: h12.reduce((s, r) => s + r.planCost, 0),
    cum: sumN(h12.map((r) => r.cum)) ?? 0,
    prev: sumN(h12.map((r) => r.prev)) ?? 0,
    now: sumN(h12.map((r) => r.now)) ?? 0,
    remain: h12.reduce((s, r) => s + (r.remain ?? 0), 0),
  };

  if (idx === 0) notes.push('noPrev');
  if (inp.advance == null) notes.push('noAdvance');
  if (cur.bua < 0) notes.push('negative');
  if (over != null) notes.push('over');

  return {
    docNo: `SLB-IPC-${inp.pkgCode}-${String(inp.ipcNo).padStart(3, '0')} ${inp.month}`,
    month: inp.month,
    periodFrom, periodTo,
    input: inp,
    t7: t7.map((r) => ({ ...r, contract: rn(r.contract), perf: rn(r.perf), fin: rn(r.fin), prev: rn(r.prev), now: rn(r.now), remain: rn(r.remain) })),
    g1,
    h12,
    h12Total,
    notes,
  };
}
const rn = (x: number | null) => (x == null ? null : r2(x));
