/**
 * CEO ҮЗҮҮЛЭЛТ «IPC — ГҮЙЦЭТГЭГЧ КОМПАНИД ОЛГОСОН САНХҮҮЖИЛТ».
 *
 * ЭХ СУРВАЛЖ (ганц): `loadHoRows()` — `HO_guitsetgel_arcgis_csv/196`,
 * 45 төлбөрийн мөр = 22 гэрээ.
 *
 * ⚠️ 2026-09-09 ЭХ СУРВАЛЖ БҮРМӨСӨН СОЛИГДСОН. Хуучин `IPC_LOG`
 * (`ipc_0813/172`) нь ТЕСТ ӨГӨГДӨЛ байсан гэж хэрэглэгч тогтоов; хоёр эхийн
 * тоог ХАРЬЦУУЛАХГҮЙ. Тиймээс энэ картын ГОЛ ТОО ч өөрчлөгдсөн:
 *   хуучин «төлөгдөөгүй үлдэгдэл» (`ipcDue` = net − paid)
 *   → шинэ «олгосон санхүүжилт» (Σ `dun`, урьдчилгаа ОРСОН).
 * ⚠️ ЯАГААД: шинэ эхэд СУУТГАЛ (барьцаа, урьдчилгааны эргэн төлөлт,
 *    зохиогчийн/захиалагчийн хяналт) ОГТ БАЙХГҮЙ — `dun` нь аль хэдийн
 *    бодит олгосон дүн. Мөн «төлөх ёстой огноо» ба «ХЯНАГДАЖ БАЙНА» төлөв
 *    ч байхгүй: мөр бүр нь АЛЬ ХЭДИЙН хийгдсэн гүйлгээ. Иймд «үлдэгдэл» ·
 *    «хугацаа хэтэрсэн» · «хянагдаж буй» ГУРВЫГ бодох БОЛОМЖГҮЙ, зохиож
 *    ойролцоолох нь ХУДАЛ хэмжилт болно — БҮРЭН ХАСАВ.
 *
 * ⚠️ ХОЁР ТҮВШИН. Мөр = НЭГ ГҮЙЛГЭЭ; гэрээний талбар (`tosov_niit`,
 *    `gereet_tosov_niit` …) нь `geree_kod` бүрд ДАВТАГДАНА. Гэрээний тоог
 *    ЗӨВХӨН `groupHo()`/`hoTotals()`-оос ав — мөрөөр SUM хийвэл Багц-4.1
 *    (7 мөр) -ийн төсөв 7 ДАХИН давхардана.
 *
 * ⚠️ ТУСДАА QUERY. Хуучин хувилбар `loadFinData()`-г динамикаар импортолж
 *    актуудыг зээлдэг байв; одоо `@/lib/ipc`-ийн `loadHoRows` нь ӨӨРӨӨ
 *    кэштэй (`'HO_IPC'` таг) тул Санхүү · Нүүр · Багцын санхүү бүгд ижил
 *    кэшийг хуваалцсан хэвээр, харин `@/modules/Finance` (React · CSS
 *    module) -ээс ХАМААРАХАА БОЛЬСОН: CASHFLOW_NEW эсвэл BAGTS_SHEET унавал
 *    энэ карт ҮРГЭЛЖЛҮҮЛЭН ажиллана (хуучны мэдэгдэж байсан сул тал ЗАСАГДАВ).
 *
 * ⚠️ `null` ≠ 0 — `dun` 45-ийн 2 мөрд ХООСОН (БАГЦ-6.3 гэрээ бүхэлдээ
 *    төлбөргүй, ХО-0045 кодгүй гэрээ). Нийлбэрт АЛГАСНА, бүгд хоосон бол
 *    нийлбэр `null` (→ «—»). `?? 0` дарвал 2026-09-04-ний I30 алдаа
 *    (нийлбэр чимээгүй доош татагдах) өөр нэрээр давтагдана.
 *
 * ⚠️ Огноо (`guilgee_ognoo`) нь `esriFieldTypeDateOnly` → «2026-08-26»
 *    гэсэн МӨР, epoch БИШ. `dayOf`/`epochOf` хоёуланг нь боловсруулна.
 *
 * ⚠️ i18n: `en.ts`-д БАЙГАА түлхүүрийг дахин ашиглана — «Гэрээний код» ·
 *    «Багц» · «Гүйцэтгэгч» · «Ажлын төрөл» · «Төсөвт өртөг» · «Олгосон» ·
 *    «Олгосон дүн» · «Дүн (₮)». Энэ файл `en.ts`-ийг ЗАСДАГГҮЙ; доорх ШИНЭ
 *    түлхүүрүүдийг нэгтгэгч `en.ts`-д ЯГ ЭНЭ МӨРӨӨР нэмнэ:
 *      "олгосон санхүүжилт": "disbursed funding",
 *      "Гэрээний санхүүжилт": "Contract funding",
 *      "Төлбөргүй гэрээ": "Contracts with no payment",
 *      "Багцад холбогдоогүй төлбөр": "Payments not linked to a package",
 *      "Гэрээт төсөв": "Contracted budget",
 *      "Гэрээнд эзлэх": "Share of contract",
 *      "Төлбөрийн төрөл": "Payment type",
 *      "Гүйлгээний огноо": "Transaction date",
 *      "{0} гэрээ · {1} төлбөр": "{0} contracts · {1} payments",
 *      "урьдчилгаа {0}": "advance {0}",
 *      "гүйцэтгэл {0}": "work {0}",
 *      "гэрээнд эзлэх {0}": "{0} of contract",
 *      "хэмнэлт {0}": "saving {0}",
 *      "{0} · {1} — төлбөрийн дүн бүртгэгдээгүй": "{0} · {1} — payment amount not recorded",
 *      "{0} — гэрээний код бүртгэгдээгүй, {1}": "{0} — no contract code, {1}",
 *      "{0} — багц олдсонгүй «{1}», {2}": "{0} — package not found «{1}», {2}",
 *      "{0} — IPC дугаарын цоорхой: {1}": "{0} — gaps in IPC numbering: {1}",
 *      "Ангилагдаагүй": "Unclassified",
 */

import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { HO_IPC, hoAmount, hoPayCode } from '@/lib/services';
import {
  loadHoRows, groupHo, hoTotals, unlinkedPays, ipcGaps,
  type Row, type HoContract, type HoTotals,
} from '@/lib/ipc';
import { mnt, pct, date, text } from '@/lib/format';
import type { Level } from '@/lib/kpiLevels';
import { cell, table, type KpiResult, type KpiIssue, type Cell } from './kpi';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/**
 * Кэшийн TTL — `@/lib/ipc`-ийн `HO_TTL`(60 с)-тэй ижил. Тэр нь export биш
 * тул энд давтав; ямар ч байсан `HO_IPC` таг нь бичилт бүрд хүчингүй
 * болгоно, TTL нь зөвхөн гадны (ArcGIS дээрх) засварыг барина.
 */
const IPC_TTL = 60_000;

/* ══════════════ Огнооны туслахууд ══════════════ */

/**
 * Ямар ч хэлбэрийн огноог `YYYY-MM-DD` болгоно: DateOnly мөр (шууд таслана),
 * epoch тоо (UTC өдөр), бусад мөр (`Date.parse`). Хоосон/танигдахгүй → null.
 */
export function dayOf(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? new Date(v).toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** Огноо → epoch ms; хоосон/танигдахгүй → null */
export function epochOf(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const ms = Date.parse(String(v).trim());
  return Number.isFinite(ms) ? ms : null;
}

/**
 * «Өнөөдөр» — `now`-ийн ЛОКАЛ өдөр, `YYYY-MM-DD`.
 * ⚠️ `toISOString()` БИШ: тэр нь UTC өдөр тул UTC+8-д шөнийн 00–08 цагт
 *    өчигдрийг өгнө.
 * ⚠️ Хугацаа хэтэрсэн тооцоо ХАСАГДСАН ч энэ туслах ҮЛДЭЭВ — огнооны
 *    хэвийн байдлыг шалгах цорын ганц цэвэр цэг, бусад CEO картууд ижил
 *    хэв маягийг дагадаг.
 */
export function todayOf(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ══════════════ Цэвэр тооцоо ══════════════ */

/**
 * Нэгтгэл — тест ба картын аль алинд.
 * ⚠️ `HoTotals`-ыг ХУУЛААГҮЙ, ШУУД агуулав — гэрээний тоог хоёр газар
 *    бодох нь тэдгээр зөрөх эрсдэл (грейний алдааны сонгодог хэлбэр).
 */
export type IpcSummary = HoTotals & {
  /** `dun` хоосон төлбөрийн мөрийн тоо (амьдаар 2) */
  noAmount: number;
  /** `geree_kod` хоосон гэрээний тоо (амьдаар 1 — ХО-0045) */
  noCode: number;
  /** Багцад холбогдоогүй (диапазон/хоосон `bagts`) төлбөрийн мөрийн тоо */
  unlinked: number;
  /** Багцад холбогдоогүй төлбөрийн дүн — амьдаар 5.97 тэрбум ₮ */
  unlinkedPaid: number | null;
  /** `tulult_turul` хоосон мөрийн тоо (амьдаар 2) */
  noKind: number;
};

export function summarize(rows: readonly Row[]): IpcSummary {
  const cs = groupHo(rows);
  const un = unlinkedPays(rows);
  let unlinkedPaid: number | null = null;
  for (const r of un) {
    const v = hoAmount(r);
    if (v != null) unlinkedPaid = (unlinkedPaid ?? 0) + v;
  }
  return {
    ...hoTotals(rows),
    noAmount: rows.filter((r) => hoAmount(r) == null).length,
    noCode: cs.filter((c) => !c.code).length,
    unlinked: un.length,
    unlinkedPaid,
    noKind: rows.filter((r) => {
      const k = r[P.kind];
      return k !== HO_IPC.kinds.advance && k !== HO_IPC.kinds.work;
    }).length,
  };
}

/**
 * Түвшин. ⚠️ Босго ШИНЭЭР зохиогоогүй — тоолуур бүр өөрөө дохио:
 *   төлбөрийн мөр огт байхгүй → unknown (тэг үзүүлэлт БИШ, эх хоосон)
 *   өгөгдлийн цоорхой (дүнгүй мөр · кодгүй гэрээ · багцад холбогдоогүй
 *   төлбөр) 1+ → warn · бусад good.
 * ⚠️ Хуучны «хугацаа хэтэрсэн → bad» дохио БАЙХГҮЙ БОЛСОН: шинэ эхэд төлөх
 *    ёстой огноо байхгүй тул хэтрэлт гэсэн ойлголт үхсэн. `bad` түвшин
 *    зохиомлоор үүсгэхээс ТАТГАЛЗАВ — худал улаан дохио нь дохио байхгүйгээс
 *    дор.
 * ⚠️ Амьд өгөгдөл дээр ҮРГЭЛЖ warn (дүнгүй 2 + кодгүй 1 + холбогдоогүй 2) —
 *    хуучин картын «өгөгдлийн асуудлыг ИЛ байлгах» санааг ХАДГАЛАВ.
 */
export function ipcLevel(s: IpcSummary): Level {
  if (s.pays === 0) return 'unknown';
  if (s.noAmount > 0 || s.noCode > 0 || s.unlinked > 0) return 'warn';
  return 'good';
}

/**
 * Гэрээний харагдах нэр — код → багц → төслийн нэр → «—».
 * ⚠️ Амьдаар ХО-0045 нь код БА багц ХОЁУЛАА хоосон (зөвхөн `tosol_ner`
 *    бий) тул төслийн нэрийг гурав дахь нөөц болгов — эс бөгөөс
 *    анхааруулга «— — гэрээний код бүртгэгдээгүй» гэж танигдахгүй гарна.
 */
const nameOf = (c: HoContract): string => c.code || c.pkg || c.project || '—';

/**
 * ТӨЛБӨРИЙН мөрийн харагдах эзэн — багц → гэрээний код → мөрийн ID.
 * ⚠️ Мөрийн ID (`murun_id` «ХО-0045») нь 45/45 давтагдашгүй тул ЭЦСИЙН
 *    нөөц: гурвуулаа хоосон анхааруулга («— · —») нь ямар мөрийг зааж
 *    байгаа нь мэдэгдэхгүй болно.
 */
const payWho = (r: Row): string => (
  text(r[C.pkg], '') || text(r[C.code], '') || text(r[P.id], '') || '—'
);

/**
 * ЦЭВЭР тооцоо — сүлжээгүй, `Date.now()`-гүй; `now` гаднаас ирнэ.
 * ⚠️ `now` нь одоогоор ЗӨВХӨН ирээдүйн огнооны шалгуурт нөөцлөгдсөн (хуучин
 *    хугацаа хэтэрсэн тооцоо хасагдсан) — гарын үсгийг ХЭВЭЭР үлдээв,
 *    учир нь `registry.ts`-ийн бусад ачаалагчид ижил хэлбэртэй бөгөөд
 *    цаг хамаарсан дүрэм эргэж нэмэгдэх нь бүрэн боломжтой.
 */
export function computeIpc(rows: readonly Row[], now: number): KpiResult {
  void now;
  const s = summarize(rows);
  const cs = groupHo(rows);

  /* ── Хүснэгт 1: ГЭРЭЭНИЙ САНХҮҮЖИЛТ — гэрээнд эзлэх хувь БАГА нь ЭХЭНД
        (эрсдэлийн эрэмбэ), хувь хэмжигдээгүй нь СҮҮЛД.
        ⚠️ Мөнгөн багана БҮГД `groupHo()`-ийн dedup хийсэн түвшнээс — мөрөөр
        нийлүүлсэн тоо ЭНД ОРОХГҮЙ. ── */
  const byPct = [...cs].sort((a, b) => {
    if (a.paidPct == null && b.paidPct == null) return nameOf(a).localeCompare(nameOf(b), 'mn', { numeric: true });
    if (a.paidPct == null) return 1;
    if (b.paidPct == null) return -1;
    return a.paidPct - b.paidPct;
  });
  const finTable = table(
    tr('Гэрээний санхүүжилт'),
    [
      tr('Гэрээний код'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Ажлын төрөл'),
      tr('Төсөвт өртөг'), tr('Гэрээт төсөв'), tr('Олгосон'), tr('Гэрээнд эзлэх'),
    ],
    byPct.map((c): Cell[] => [
      cell(c.code || '—'), cell(c.pkg || '—'), cell(c.contractor || '—'),
      cell(c.workType || '—'),
      cell(c.budgetTotal, 'mnt'), cell(c.contractTotal, 'mnt'),
      cell(c.paidTotal, 'mnt'), cell(c.paidPct, 'pct'),
    ]),
  );

  /* ── Хүснэгт 2: ТӨЛБӨРГҮЙ ГЭРЭЭ — `paidTotal` нь `null` (ХЭМЖИГДЭЭГҮЙ).
        ⚠️ `paidTotal === 0` -ийг ЭНД ОРУУЛАХГҮЙ: тэр нь «жинхэнэ тэг
        олголт» бөгөөд өгөгдлийн цоорхой БИШ. `null ≠ 0` дүрмийн хоёр тал.
        Амьдаар 2 мөр: БАГЦ-6.3 (`dun` хоосон) · ХО-0045 (кодгүй гэрээ). ── */
  const noPayTable = table(
    tr('Төлбөргүй гэрээ'),
    [tr('Гэрээний код'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Гэрээт төсөв')],
    cs.filter((c) => c.paidTotal == null).map((c): Cell[] => [
      cell(c.code || '—'), cell(c.pkg || '—'), cell(c.contractor || '—'),
      cell(c.contractTotal, 'mnt'),
    ]),
  );

  /* ── Хүснэгт 3: БАГЦАД ХОЛБОГДООГҮЙ ТӨЛБӨР.
        ⚠️ ЭНЭ ХҮСНЭГТ ЗААВАЛ. `pkgKeyOf` нь диапазон мөрийг (`Багц-1-4` ·
        `БАГЦ-10,  БАГЦ-11, …`) `''` болгодог тул тэдгээрийн дүн багцаар
        задалсан ямар ч Map-д ХЭЗЭЭ Ч харагдахгүй — амьдаар 5.97 тэрбум ₮.
        Энд л ил гарна. Дүн АЛДАГДААГҮЙ: нийт `paid`-д үлдсэн. ── */
  const unlinkedTable = table(
    tr('Багцад холбогдоогүй төлбөр'),
    [tr('Гэрээний код'), tr('Багц'), tr('Төлбөрийн төрөл'), tr('Олгосон дүн'), tr('Гүйлгээний огноо')],
    unlinkedPays(rows).map((r): Cell[] => [
      cell(text(r[C.code], '') || '—'), cell(text(r[C.pkg], '') || '—'),
      cell(text(r[P.kind], '') || tr('Ангилагдаагүй')),
      cell(hoAmount(r), 'mnt'), cell(date(dayOf(r[P.payDate]))),
    ]),
  );

  /* ── Анхааруулга: дүнгүй төлбөр → кодгүй гэрээ → багцгүй төлбөр →
        IPC дугаарын цоорхой ── */
  const issues: KpiIssue[] = [];
  for (const r of rows) {
    if (hoAmount(r) == null) {
      issues.push({
        tone: 'warn',
        text: tr('{0} · {1} — төлбөрийн дүн бүртгэгдээгүй',
          hoPayCode(r), payWho(r)),
      });
    }
  }
  for (const c of cs) {
    if (!c.code) {
      issues.push({
        tone: 'warn',
        text: tr('{0} — гэрээний код бүртгэгдээгүй, {1}', nameOf(c), mnt(c.contractTotal)),
      });
    }
  }
  for (const r of unlinkedPays(rows)) {
    issues.push({
      tone: 'warn',
      text: tr('{0} — багц олдсонгүй «{1}», {2}',
        hoPayCode(r), text(r[C.pkg], '') || '—', mnt(hoAmount(r))),
    });
  }
  /* ⚠️ IPC дугаар гэрээ бүрд 1-ээс цоорхойгүй байх ёстой (амьдаар 22/22
     таарсан). Цоорхой = акт бүртгэгдээгүй ЭСВЭЛ татахад мөр унасан гэсэн
     ДОХИО — чимээгүй өнгөрөөхгүй. */
  for (const c of cs) {
    const g = ipcGaps(c.pays);
    if (g.length) {
      issues.push({
        tone: 'warn',
        text: tr('{0} — IPC дугаарын цоорхой: {1}', nameOf(c), g.join(', ')),
      });
    }
  }

  /* ⚠️ `asOf` = хамгийн сүүлийн ГҮЙЛГЭЭНИЙ огноо (`guilgee_ognoo`, 40/45).
     Захирамжийн огноо нь «өгөгдлийн агшин» БИШ, шийдвэрийн огноо тул
     эндээс ХАСАВ. Гүйлгээний огноо огт байхгүй бол null. */
  const asOf = rows.reduce<number | null>((m, r) => {
    const x = epochOf(r[P.payDate]);
    return x == null || (m != null && x <= m) ? m : x;
  }, null);

  return {
    value: mnt(s.paid),
    unit: tr('олгосон санхүүжилт'),
    facts: s.pays === 0 ? [] : [
      tr('{0} гэрээ · {1} төлбөр', s.contracts, s.pays),
      tr('урьдчилгаа {0}', mnt(s.advance)),
      tr('гүйцэтгэл {0}', mnt(s.work)),
      /* ⚠️ `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ — `paidPct` нь аль хэдийн 0–100 */
      tr('гэрээнд эзлэх {0}', pct(s.paidPct)),
      tr('хэмнэлт {0}', mnt(s.saving)),
    ],
    level: ipcLevel(s),
    /* Хоосон хүснэгтийг ОРУУЛАХГҮЙ — тоо нь `facts`-д аль хэдийн бий */
    tables: [finTable, noPayTable, unlinkedTable].filter((t) => t.rows.length > 0),
    issues,
    asOf,
    failedSources: [],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ Ганц эх сурвалж тул хэсэгчилсэн уналт байхгүй: `loadHoRows` унавал
 *    ЮУ Ч ачаалагдаагүй → throw (`cached` алдааг кэшлэхгүй, «дахин оролдох»
 *    сэргэнэ). `failedSources` нь тиймээс үргэлж хоосон.
 */
export const loadIpcKpi = cached<KpiResult>(async () => {
  const rows = await loadHoRows();
  return computeIpc(rows, Date.now());
}, IPC_TTL, ['HO_IPC']);
