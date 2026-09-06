/**
 * CEO KPI — «ГҮЙЦЭТГЭГЧ ШАЛГАРААГҮЙ / ГЭРЭЭ БАЙГУУЛАГДААГҮЙ АЖИЛ».
 *
 * Эх: `loadFinData().contracts` — `Cashflow_0904/0` (CASHFLOW_NEW), мөр бүр
 * НЭГ гэрээ/ажил (76). Санхүүгийн харагдацтай ИЖИЛ кэшийг хуваалцана —
 * дахин татахгүй; `CASHFLOW_NEW` руу бичихэд хоёулаа хамт хүчингүй болно.
 *
 * ⚠️ «ГЭРЭЭГҮЙ» гэдгийг ХОЁР талбараар тодорхойлно (`isUncontracted`):
 *    гэрээний дүн (`Geree_erh_dun`) хоосон/0 БА гүйцэтгэгч (`Guitsetgegch_baig`)
 *    хоосон. Ганц талбараар шүүвэл дутуу бүртгэлтэй гэрээ (дүн бичсэн ч
 *    гүйцэтгэгч бичээгүй, эсвэл эсрэгээр) «гэрээгүй» болж худал улаан гарна.
 *    Тэднийг ТУСАД НЬ «дутуу бүртгэл» гэж тоолж, 2-р хүснэгтэд нэрээр нь
 *    жагсаана — өгөгдлийн алдааг төслийн алдаатай холихгүй.
 *
 * ⚠️ `HO_dungiin_tailbar` («Гэрээлсэн дүн» — `gdash.CONTRACTED`) нь ШҮҮЛТИЙН
 *    түлхүүр БИШ, зөвхөн тайлбар багана. Амьд өгөгдөлд (2026-09-06) 10 өөр
 *    чөлөөт утга байна («Магадлагдсан дүн», «Урьдчилсан дүн», null …).
 *    Чөлөөт текстээр ангилахгүй — тайлбарыг багана болгож CEO өөрөө уншина.
 *    ГАНЦ ҮЛ ХАМААРАХ ЗҮЙЛ — ХАСАГДСАН АЖИЛ (`isCancelled`, доор).
 *
 * ⚠️ ХАСАГДСАН АЖИЛ (2026-09-06, хяналтын олдвор): OID 7 «Газрын гүний
 *    дулааны … ТЭЗҮ» (БАГЦ-9, төсөв 20,385,170,186 ₮, тайлбар «Төслийн
 *    хөрөнгө оруулалтаас хасах. Хийгдэхгүй болсон ажил») гэрээгүй тоонд орж
 *    Σ төсвийг 4.7%-иар хөөрөгдөж байв; OID 76 («…хасуулах», гүйцэтгэгчтэй ч
 *    дүнгүй) «дутуу бүртгэл» болж байв. Хийгдэхгүй болсон ажилд гэрээ
 *    байгуулагдахгүй нь ЗҮЙ ЁСНЫ — тэднийг «гэрээгүй»/«дутуу» гэж улаан/шар
 *    болгохгүй. Тайлбар нь `CANCELLED_NOTE_RE`-д таарвал мөрийг n · Σ · эхэлсэн ·
 *    дутуу · түвшнээс ХАСНА, харин ЧИМЭЭГҮЙ хаяхгүй: «{k} хасагдсан ажил» факт
 *    ба 3-р хүснэгтэд нэрээр нь жагсаана — CEO юу хасагдсаныг харна.
 *    Гэрээ бүрэн (гүйцэтгэгч + дүн) мөрд энэ шүүлт ҮЙЛЧЛЭХГҮЙ — тэд угаасаа энэ
 *    картын хамрах хүрээнд биш.
 *    ⚠️ Хэв нь ЗӨВХӨН амьд өгөгдөлд ажиглагдсан БҮТЭН хэллэгүүд — ганц «хасах»/
 *    «хасуулах» үг ХАНГАЛТГҮЙ (2-р хяналт, 2026-09-06): тэд дүнгийн тайлбарт
 *    ердийн үйл үг («НӨАТ хасах дүн», «урьдчилгаа хасуулах») тул бага үгээр
 *    тааруулбал жинхэнэ гэрээгүй ажил чимээгүй 3-р хүснэгт рүү шилжинэ.
 *    Энэ дүрэм нь ТЗ-д байхгүй САНАЛ — хасахыг хүсвэл `isCancelled`-ийг устгана.
 *
 * ⚠️ `null` ≠ 0: төсөвгүй мөрийн өртөг `null` хэвээр (Σ-д орохгүй, «—»);
 *    БҮХ мөр төсөвгүй бол нийлбэр `null`, 0 БИШ.
 *
 * ⚠️ i18n: баганын нэрд `en.ts`-д БАЙГАА түлхүүрийг дахин ашиглана («Ажил» ·
 *    «Төрөл» · «Багц» · «Төсөвт өртөг» · «Тайлбар» · «Гүйцэтгэгч» ·
 *    «Гэрээний дугаар» · «Гэрээний дүн» · «нэргүй»). Энэ файлын ШИНЭ
 *    түлхүүрүүд (`en.ts`-д нэмэх — энэ файл `en.ts`-ийг ЗАСДАГГҮЙ):
 *      «гэрээгүй ажил»            → uncontracted works
 *      «Гэрээгүй ажил»            → Uncontracted works   (registry.ts-д ч бий)
 *      «Дутуу бүртгэлтэй гэрээ»   → Contracts with incomplete records
 *      «Хасагдсан ажил»           → Cancelled works
 *      «Эхлэх огноо» → Start date · «Дуусах огноо» → End date
 *      «төсөв {0}» → budget {0} · «{0} дутуу бүртгэл» → {0} incomplete records
 *      «{0} ажлын эхлэх хугацаа өнгөрсөн» → {0} works past their start date
 *      «{0} хасагдсан ажил»       → {0} cancelled works
 *      «багц тодорхойгүй»         → package unknown
 *      «{0} · {1} — {2} хоног өнгөрсөн, гэрээгүй» → {0} · {1} — {2} days past start, no contract
 *
 * ⚠️ `@/modules/Finance`-ийг ДИНАМИКААР импортлоно (ачаалагчийн дотор).
 *    Статик импорт хийвэл энэ файл `.tsx`-ээс хамаарч, Node-ийн цэвэр тест
 *    (`uncontracted.check.mjs`) «Unknown file extension .tsx» гэж унана.
 *    Тооцоо (`computeUncontracted`) нь сүлжээгүй, тестлэгдэх ёстой.
 */

import { cached } from '@/lib/live';
import { CASHFLOW_NEW } from '@/lib/services';
import { blank, date, mnt, num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import {
  cell, daysBetween, table,
  type Cell, type DetailTable, type KpiIssue, type KpiResult, type Level,
} from './kpi';

const F = CASHFLOW_NEW.fields;

/**
 * Түүхий мөр. ⚠️ `query.Row` (string|number|null) БИШ, `unknown` — `FinData.contracts`
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
 * Огноо нүд — `format.date()` (mn-MN, «2026.08.30»), бусад CEO карттай (ipc.ts)
 * ИЖИЛ хэлбэр. ⚠️ `null`-ыг `date()`-д өгөхгүй — тэр «—» ТЕКСТ буцаадаг, харин
 * нүдэнд `null` хэрэгтэй (самбар өөрөө «—» зурна, эрэмбэ/шүүлт зөв ажиллана).
 */
const dayCell = (ms: number | null): Cell => cell(ms == null ? null : date(ms));

/** Буурахаар, `null` ХАМГИЙН СҮҮЛД (мэдээлэлгүйг «хамгийн бага» гэж уншихгүй) */
const descNullLast = (a: number | null, b: number | null): number => (
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a
);

/**
 * ГЭРЭЭГҮЙ: гэрээний дүн хоосон/0 БА гүйцэтгэгч хоосон.
 * ⚠️ Хоёр нөхцөл ЗЭРЭГ — аль нэг нь бөглөгдсөн бол `isInconsistent`.
 */
export const isUncontracted = (r: CfRaw): boolean => (
  posOf(r[F.contractAmount]) == null && blank(r[F.contractor])
);

/**
 * ДУТУУ БҮРТГЭЛ: дүн бий ч гүйцэтгэгч алга, эсвэл гүйцэтгэгч бий ч дүн алга.
 * Гэрээгүй ч биш, бүрэн гэрээтэй ч биш — өгөгдлийн асуудал.
 */
export const isInconsistent = (r: CfRaw): boolean => (
  (posOf(r[F.contractAmount]) != null) !== !blank(r[F.contractor])
);

/**
 * ⚠️ САНАЛ БОЛГОЖ БУЙ ДҮРЭМ (2026-09-06) — хасагдсан ажлын тайлбарын хэв.
 *    `HO_dungiin_tailbar` чөлөөт текст тул зөвхөн амьд өгөгдөлд АЖИГЛАГДСАН
 *    бүтэн хэллэгүүдийг тааруулна:
 *      OID 7  «…хөрөнгө оруулалтаас хасах. Хийгдэхгүй болсон ажил»
 *      OID 76 «…хөрөнгө оруулалт руу оруулахгүйгээр хасуулах»
 *    Ганц «хасах»/«хасуулах» үг ТААРАХГҮЙ — «НӨАТ хасах дүн» мэт ердийн тайлбар
 *    мөрийг хасагдсан болгож болохгүй. Тайлбарын толь өөрчлөгдвөл ЭНД нэмнэ;
 *    шинэ утга таараагүй бол мөр ердийн замаар (гэрээгүй/дутуу) тоологдоно —
 *    нуугдахгүй. (`sOf` зайг нэг болгодог тул `\s*` хангалттай.)
 */
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

/** Хоосон текст → `null` нүд («—»), эс бөгөөс текст */
const txt = (s: string): Cell => cell(s || null);

/**
 * ЦЭВЭР ТООЦОО — сүлжээгүй, `now`-г гаднаас авна (тест давтагдах чадвартай).
 *
 * Түвшин: эхлэх хугацаа нь өнгөрсөн гэрээгүй ажил байвал `bad`; гэрээгүй
 * ажил байвал `warn`; нэг ч байхгүй бол `good`; мөр огт ирээгүй бол `unknown`.
 * ⚠️ Дутуу бүртгэл түвшинд НӨЛӨӨЛӨХГҮЙ — энэ карт төслийн эрсдэлийг
 *    (гэрээгүй ажил) хэмжинэ, өгөгдлийн цэвэршилтийг биш. Тэр тоо факт ба
 *    2-р хүснэгтээр ил гарна.
 * ⚠️ Хасагдсан ажил (`isCancelled`) n · Σ · эхэлсэн · дутуу · түвшний АЛЬ ЧИНЬ
 *    орохгүй; факт + 3-р хүснэгтээр ил. Гэрээ бүрэн мөрд шүүлт үйлчлэхгүй.
 */
export function computeUncontracted(rows: readonly CfRaw[], now: number): KpiResult {
  const unit = tr('гэрээгүй ажил');
  if (rows.length === 0) {
    return {
      value: num(null), unit, facts: [], level: 'unknown',
      tables: [], issues: [], asOf: null, failedSources: [],
    };
  }

  const none: CfContract[] = [];
  const partial: CfContract[] = [];
  const cancelled: CfContract[] = [];
  for (const r of rows) {
    const inScope = isUncontracted(r) ? none : isInconsistent(r) ? partial : null;
    if (!inScope) continue;
    (isCancelled(r) ? cancelled : inScope).push(contractOf(r));
  }

  const isStarted = (c: CfContract): boolean => c.start != null && c.start < now;

  /* ⚠️ Σ төсөв: төсөвгүй мөр орохгүй; БҮГД төсөвгүй бол `null` (0 биш) */
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
    /* ⚠️ Хүснэгтэд «өгөгдлийн агшин» талбар байхгүй — огноо нь төлөвлөгөөт хугацаа */
    asOf: null,
    failedSources: [],
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
