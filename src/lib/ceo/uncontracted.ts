/**
 * CEO KPI — «ГҮЙЦЭТГЭГЧ ШАЛГАРААГҮЙ / ГЭРЭЭ БАЙГУУЛАГДААГҮЙ АЖИЛ».
 *
 * Эх: `loadFinData.contracts` — `Cashflow_0909/0` (CASHFLOW_NEW), мөр бүр
 * НЭГ гэрээ/ажил (76). Санхүүгийн харагдацтай ИЖИЛ кэшийг хуваалцана —
 * дахин татахгүй; `CASHFLOW_NEW` руу бичихэд хоёулаа хамт хүчингүй болно.
 */

import { cached } from '@/lib/live';
import { CASHFLOW_NEW } from '@/lib/services';
import { blank, date, mnt, num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { FIN_XL_LAND_CODE, FIN_XL_TOTAL_CODE_FIELD, finXlRowHidden } from '@/lib/finExcelLayout';
import { isContracted } from '@/lib/gdash';
import {
  cell, daysBetween, table,
  type Cell, type DetailTable, type KpiIssue, type KpiResult, type Level,
} from './kpi';

const F = CASHFLOW_NEW.fields;

/**
 * Түүхий мөр. `query.Row` (string|number|null) БИШ, `unknown` — `FinData.contracts`
 * нь `Finance.tsx`-ийн өөрийн `Row = Record<string, unknown>` төрөлтэй тул
 * нарийн төрөл тавибал ачаалагч tsc-д унана. Талбар бүрийг доорх `numOf`/`sOf`
 * цэвэрлэдэг тул `unknown` хангалттай.
 */
export type CfRaw = Readonly<Record<string, unknown>>;

/**
 * Кэшийн хугацаа — `Finance.tsx`-ийн `LIVE_TTL`-тэй ИЖИЛ (1 мин). Түүнээс
 * урт байвал энэ карт санхүүгийн харагдацаас өөр агшны тоо харуулна.
 */
const TTL_MS = 60_000;

/** CASHFLOW_NEW-ийн нэг мөр — энэ KPI-д хэрэгтэй талбарууд, цэвэрлэсэн */
export type CfContract = {
  oid: number;
  /** Ажлын бүтэн нэр — `Nariiwchilsan_turul`, хоосон бол `Tusul` */
  work: string;
  type: string;
  /** Дэд багц байвал тэр, үгүй бол багц */
  pkg: string;
  /** Урьдчилсан төсөвт өртөг, ₮ — хоосон бол `null` (0 БИШ) */
  budget: number | null;
  /** `HO_dungiin_tailbar` — чөлөөт тайлбар */
  note: string;
  contractor: string;
  contractNo: string;
  /** Гэрээ байгуулах эрх олгосон дүн, ₮ — хоосон/0/сөрөг бол `null` */
  contractAmount: number | null;
  /** Төлөвлөгөөт эхлэх — epoch ms; хоосон бол `null` */
  start: number | null;
  end: number | null;
};

const numOf = (v: unknown): number | null => {
  if (blank(v)) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Эерэг тоо л «байна» гэж тооцно — 0 ба сөрөг дүн/огноо нь хоосонтой ижил */
const posOf = (v: unknown): number | null => {
  const x = numOf(v);
  return x != null && x > 0 ? x : null;
};

const sOf = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Огноо нүд — `format.date` (mn-MN, «2026.08.30»), бусад CEO карттай (ipc.ts)
 * ИЖИЛ хэлбэр. `null`-ыг `date`-д өгөхгүй — тэр «—» ТЕКСТ буцаадаг, харин
 * нүдэнд `null` хэрэгтэй (самбар өөрөө «—» зурна, эрэмбэ/шүүлт зөв ажиллана).
 */
const dayCell = (ms: number | null): Cell => cell(ms == null ? null : date(ms));

/** Буурахаар, `null` ХАМГИЙН СҮҮЛД (мэдээлэлгүйг «хамгийн бага» гэж уншихгүй) */
const descNullLast = (a: number | null, b: number | null): number => (
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a
);

/**
 * ГЭРЭЭГҮЙ — порталын НЭГ предикатын эсрэг (`gdash.isContracted`: тайлбар «Гэрээлсэн дүн» биш).
 */
export const isUncontracted = (r: CfRaw): boolean => !isContracted(r);

/**
 * ДУТУУ БҮРТГЭЛ: гэрээтэй (тайлбараар) боловч дүн бий ч гүйцэтгэгч алга, эсвэл гүйцэтгэгч бий ч дүн алга.
 * Гэрээгүй ч биш, бүрэн гэрээтэй ч биш — өгөгдлийн асуудал.
 */
export const isInconsistent = (r: CfRaw): boolean => (
  isContracted(r) && (posOf(r[F.contractAmount]) != null) !== !blank(r[F.contractor])
);

/**
 * ЭСРЭГ ЗӨРҮҮ (2026-10-22, аудит): «Гэрээлсэн дүн» тайлбартай боловч гэрээний дүн ЧИНЬ, гүйцэтгэгч ЧИНЬ хоосон —
 * портал гэрээтэй гэж тоолдог (нэг предикат), харин гэрээний бичлэг огт бөглөгдөөгүй. Тоо/түвшинд нөлөөлөхгүй,
 * өгөгдлийн эзэнд засуулах жагсаалтад (`noteOnly`) нэрээр гарна.
 */
export const isNoteOnly = (r: CfRaw): boolean => (
  isContracted(r) && posOf(r[F.contractAmount]) == null && blank(r[F.contractor])
);

export const CANCELLED_NOTE_RE = /хийгдэхгүй|хөрөнгө оруулалт(аас хасах|\s*руу оруулахгүй)/i;

/** ХАСАГДСАН: тайлбар нь хийгдэхгүй болсныг ил хэлдэг (`CANCELLED_NOTE_RE`) */
export const isCancelled = (r: CfRaw): boolean => (
  CANCELLED_NOTE_RE.test(sOf(r[F.amountNote]))
);

export function contractOf(r: CfRaw): CfContract {
  return {
    oid: numOf(r[CASHFLOW_NEW.oid]) ?? 0,
    work: sOf(r[F.detail]) || sOf(r[F.project]) || tr('нэргүй'),
    type: sOf(r[F.type]),
    pkg: sOf(r[F.pkg2]) || sOf(r[F.pkg]),
    budget: numOf(r[F.budget]),
    note: sOf(r[F.amountNote]),
    contractor: sOf(r[F.contractor]),
    contractNo: sOf(r[F.contractNo]),
    contractAmount: posOf(r[F.contractAmount]),
    start: posOf(r[F.startDate]),
    end: posOf(r[F.endDate]),
  };
}

/**
 * Картын үр дүн + ТОДОРХОЙЛОЛТЫН ЗӨРҮҮ (2026-10-09): `noteMismatch` — гэрээний дүнтэй (`geree_dun > 0`)
 * атлаа `gdash.isContracted` биш мөрүүд (хасагдсан ажил орохгүй), дүнгээр буурах.
 */
export type UncontractedKpi = KpiResult & { noteMismatch: CfContract[]; noteOnly: CfContract[] };

/** Хоосон текст → `null` нүд («—»), эс бөгөөс текст */
const txt = (s: string): Cell => cell(s || null);

/**
 * ЦЭВЭР ТООЦОО — сүлжээгүй, `now`-г гаднаас авна (тест давтагдах чадвартай).
 *
 * Түвшин: эхлэх хугацаа нь өнгөрсөн гэрээгүй ажил байвал `bad`; гэрээгүй
 * ажил байвал `warn`; нэг ч байхгүй бол `good`; мөр огт ирээгүй бол `unknown`.
 */
export function computeUncontracted(rows: readonly CfRaw[], now: number): UncontractedKpi {
  const unit = tr('гэрээгүй ажил');
  if (rows.length === 0) {
    return {
      value: num(null), unit, facts: [], level: 'unknown',
      tables: [], issues: [], asOf: null, failedSources: [], noteMismatch: [], noteOnly: [],
    };
  }

  const none: CfContract[] = [];
  const partial: CfContract[] = [];
  const cancelled: CfContract[] = [];
  const noteMismatch: CfContract[] = [];
  const noteOnly: CfContract[] = [];
  for (const r of rows) {
    if (finXlRowHidden(r) || String(r[FIN_XL_TOTAL_CODE_FIELD] ?? '').trim() === FIN_XL_LAND_CODE) continue;
    if (posOf(r[F.contractAmount]) != null && !isContracted(r) && !isCancelled(r)) noteMismatch.push(contractOf(r));
    if (isNoteOnly(r) && !isCancelled(r)) noteOnly.push(contractOf(r));
    const inScope = isUncontracted(r) ? none : isInconsistent(r) ? partial : null;
    if (!inScope) continue;
    (isCancelled(r) ? cancelled : inScope).push(contractOf(r));
  }

  const isStarted = (c: CfContract): boolean => c.start != null && c.start < now;

  let sumBudget: number | null = null;
  for (const c of none) {
    if (c.budget == null) continue;
    sumBudget = (sumBudget ?? 0) + c.budget;
  }

  const n = none.length;
  const started = none.filter(isStarted).length;
  const inconsistent = partial.length;

  const level: Level = started > 0 ? 'bad' : n > 0 ? 'warn' : 'good';

  const facts: string[] = [];
  if (sumBudget != null && sumBudget > 0) facts.push(tr('төсөв {0}', mnt(sumBudget)));
  if (n > 0) facts.push(tr('{0} ажлын эхлэх хугацаа өнгөрсөн', num(started)));
  facts.push(tr('{0} дутуу бүртгэл', num(inconsistent)));
  /* Хасагдсан нь ховор — 0 бол факт нэмэхгүй (мөрийг дэмий уртасгахгүй) */
  if (cancelled.length > 0) facts.push(tr('{0} хасагдсан ажил', num(cancelled.length)));
  if (noteMismatch.length + noteOnly.length > 0) {
    facts.push(tr('{0} бүртгэлийн зөрүү (тайлбар ↔ дүн)', num(noteMismatch.length + noteOnly.length)));
  }

  /*
   * ХҮСНЭГТ 1 — гэрээгүй ажил. ЭХЛЭХ ЁСТОЙ БАЙСАН нь эхэнд (хамгийн эрт
   * огноотой нь дээр = хамгийн их хоцорсон), дараа нь бусад нь төсвөөр
   * буурах — CEO эхлээд «аль хэдийн хоцорсон» дараа нь «хамгийн их мөнгө»-г харна.
   */
  const noneSorted = [...none].sort((a, b) => {
    const sa = isStarted(a);
    const sb = isStarted(b);
    if (sa !== sb) return sa ? -1 : 1;
    if (sa && a.start !== b.start) return (a.start ?? 0) - (b.start ?? 0);
    return descNullLast(a.budget, b.budget);
  });

  /*
   * ХҮСНЭГТ 2 — дутуу бүртгэл. Дүнтэй ч гүйцэтгэгчгүй нь эхэнд (мөнгө
   * баталгаажсан ч ХЭН хийхийг бүртгээгүй — ноцтой), дараа нь гүйцэтгэгчтэй ч
   * дүнгүй нь; тус бүр дүн/төсвөөр буурах.
   */
  const partialSorted = [...partial].sort((a, b) => {
    const aa = a.contractAmount != null;
    const ba = b.contractAmount != null;
    if (aa !== ba) return aa ? -1 : 1;
    return descNullLast(a.contractAmount ?? a.budget, b.contractAmount ?? b.budget);
  });

  const tables: DetailTable[] = [];
  if (noneSorted.length) {
    tables.push(table(
      tr('Гэрээгүй ажил'),
      [
        tr('Ажил'), tr('Төрөл'), tr('Багц'), tr('Төсөвт өртөг'),
        tr('Эхлэх огноо'), tr('Дуусах огноо'), tr('Тайлбар'),
      ],
      noneSorted.map((c) => [
        txt(c.work), txt(c.type), txt(c.pkg), cell(c.budget, 'mnt'),
        dayCell(c.start), dayCell(c.end), txt(c.note),
      ]),
    ));
  }
  if (partialSorted.length) {
    tables.push(table(
      tr('Дутуу бүртгэлтэй гэрээ'),
      [tr('Ажил'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Гэрээний дугаар'), tr('Гэрээний дүн')],
      partialSorted.map((c) => [
        txt(c.work), txt(c.pkg), txt(c.contractor), txt(c.contractNo),
        cell(c.contractAmount, 'mnt'),
      ]),
    ));
  }
  /* ХҮСНЭГТ 3 — хасагдсан ажил: дээрх тооноос ЮУ хасагдсаныг ил харуулна, төсвөөр буурах */
  if (cancelled.length) {
    const cancelledSorted = [...cancelled].sort((a, b) => descNullLast(a.budget, b.budget));
    tables.push(table(
      tr('Хасагдсан ажил'),
      [tr('Ажил'), tr('Багц'), tr('Төсөвт өртөг'), tr('Тайлбар')],
      cancelledSorted.map((c) => [txt(c.work), txt(c.pkg), cell(c.budget, 'mnt'), txt(c.note)]),
    ));
  }

  /* ХҮСНЭГТ 4 — тодорхойлолтын зөрүү (2026-10-09): дүнтэй ч «Гэрээлсэн дүн» тайлбаргүй, дүнгээр буурах */
  const mismatchSorted = [...noteMismatch].sort((a, b) => descNullLast(a.contractAmount, b.contractAmount));
  if (mismatchSorted.length) {
    tables.push(table(
      tr('Гэрээний дүнтэй боловч «Гэрээлсэн дүн» тайлбаргүй'),
      [tr('Ажил'), tr('Багц'), tr('Гэрээний дүн'), tr('Тайлбар')],
      mismatchSorted.map((c) => [txt(c.work), txt(c.pkg), cell(c.contractAmount, 'mnt'), txt(c.note)]),
    ));
  }

  /* ХҮСНЭГТ 5 — ЭСРЭГ зөрүү (2026-10-22, аудит): «Гэрээлсэн дүн» тайлбартай атлаа дүн, гүйцэтгэгчгүй — төсвөөр буурах */
  const noteOnlySorted = [...noteOnly].sort((a, b) => descNullLast(a.budget, b.budget));
  if (noteOnlySorted.length) {
    tables.push(table(
      tr('«Гэрээлсэн дүн» тайлбартай боловч гэрээний дүн, гүйцэтгэгчгүй'),
      [tr('Ажил'), tr('Багц'), tr('Төсөвт өртөг'), tr('Тайлбар')],
      noteOnlySorted.map((c) => [txt(c.work), txt(c.pkg), cell(c.budget, 'mnt'), txt(c.note)]),
    ));
  }

  /* Анхааруулга — эхлэх хугацаа өнгөрсөн мөр бүр, хамгийн их хоцорсон нь эхэнд */
  const issues: KpiIssue[] = noneSorted.filter(isStarted).map((c) => ({
    tone: 'bad',
    text: tr(
      '{0} · {1} — {2} хоног өнгөрсөн, гэрээгүй',
      c.work, c.pkg || tr('багц тодорхойгүй'), num(daysBetween(c.start ?? now, now)),
    ),
  }));

  return {
    value: num(n),
    unit,
    facts,
    level,
    tables,
    issues,
    asOf: null,
    failedSources: [],
    noteMismatch: mismatchSorted,
    noteOnly: noteOnlySorted,
  };
}

/**
 * АЧААЛАГЧ. Ганц эх сурвалж тул хэсэгчилсэн уналт байхгүй — `loadFinData`
 * унавал throw (`cached` алдааг кэшлэхгүй → дараагийн дуудалт дахин оролдоно).
 */
export const loadUncontractedKpi = cached<KpiResult>(async () => {
  const { loadFinData } = await import('@/modules/Finance');
  const fin = await loadFinData();
  return computeUncontracted(fin.contracts, Date.now());
}, TTL_MS, ['CASHFLOW_NEW']);
