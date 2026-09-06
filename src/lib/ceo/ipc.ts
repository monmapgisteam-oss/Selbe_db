/**
 * CEO ҮЗҮҮЛЭЛТ «IPC — гүйцэтгэлийн төлбөрийн акт»: олгосон · хянагдаж буй ·
 * төлөгдөөгүй үлдэгдэл.
 *
 * ЭХ СУРВАЛЖ (ганц): `loadFinData().acts` — `ipc_0813/172`-ын 59 түүхий мөр.
 * Тусдаа query ГАРГАХГҮЙ: Санхүү · Нүүр · Багцын санхүү бүгд ижил кэшийг
 * хуваалцдаг тул энэ карт нэмэлт HTTP хүсэлт үүсгэхгүй.
 *
 * ⚠️ `loadFinData` нь IPC + CASHFLOW_NEW + BAGTS_SHEET гурвыг `Promise.all`-аар
 *    татдаг — аль нэг нь унавал IPC мөр бүрэн бүтэн байсан ч энэ карт унана.
 *    Энэ нь мэдэгдэж буй сул тал; шийдэл нь `Finance.tsx`-ийн ачаалагчийг
 *    хэсэгчлэн уналттай болгох (энд ТУСДАА query нэмэх БИШ).
 *
 * ⚠️ `@/modules/Finance`-ийг ДИНАМИКААР импортолно (ачаалагчийн дотор).
 *    Тэр модуль нь React · next/dynamic · CSS module татдаг тул модулийн
 *    түвшинд импортолбол `ipc.check.mjs` Node дээр ажиллахгүй, мөн нүүрийн
 *    chunk-д Санхүүгийн харагдац бүхэлдээ орно.
 *
 * ⚠️ `null` ≠ 0 — IPC18 (гүйцэтгэлийн дүн) 59 актын 38-д ХООСОН. `ipcNet`/
 *    `ipcDue` тэдгээрт `null` буцаана; нийлбэрт АЛГАСНА, бүгд хоосон бол
 *    нийлбэр нь `null` (→ «—»). `?? 0` гэж дарвал 2026-09-04-ний I30 алдаа
 *    (−2.07 тэрбум) буцаж гарна. Харин `ipcPaid` нь БОДИТ гүйлгээ тул 0 нь
 *    жинхэнэ «огт шилжүүлээгүй» — нийлбэрт шууд орно.
 *
 * ⚠️ Огноо (IPC25 · IPC28…) нь `esriFieldTypeDateOnly` → «2026-08-10» гэсэн
 *    МӨР. Хугацаа хэтэрсэн эсэхийг ӨДРИЙН мөрөөр (`YYYY-MM-DD`) харьцуулна —
 *    epoch-оор харьцуулбал UTC+8 бүсэд өнөөдөр төлөх акт өглөө «хэтэрсэн»
 *    болно. Хэтэрсэн хоног = өнөөдрийн 00:00Z − төлөх огнооны 00:00Z, бүхэл.
 *
 * ⚠️ i18n (2026-09-06-ны хяналт): баганын нэрд `en.ts`-д БАЙГАА түлхүүрийг
 *    дахин ашиглана — «Актын код» · «Багц» · «Гүйцэтгэгч» · «Төлөв» ·
 *    «Шилжүүлсэн» · «Үлдэгдэл» · «Төлөх ёстой огноо» (IPC25-ын албан нэр) ·
 *    «Хамрах хугацаа: эхлэх» / «Хамрах хугацаа: дуусах» (IPC09/10-ын албан
 *    нэр — тиймээс хамрах хугацаа нь НЭГ биш ХОЁР багана) · «Дүн (₮)».
 *    Энэ файл `en.ts`-ийг ЗАСДАГГҮЙ; доорх 12 ШИНЭ түлхүүрийг нэгтгэгч
 *    `en.ts`-д ЯГ ЭНЭ МӨРӨӨР нэмнэ (эс бөгөөс `tools/i18n-extract.mjs`
 *    «дутуу» гэж унана; нэмэгдтэл en дээр монголоор харагдана, унахгүй):
 *      "Хугацаа хэтэрсэн ба төлөгдөөгүй акт": "Overdue and unpaid certificates",
 *      "Хянагдаж буй акт": "Certificates under review",
 *      "Дүнгүй акт (IPC18 хоосон)": "Certificates without amount (IPC18 empty)",
 *      "Олгох дүн": "Payable",
 *      "төлөгдөөгүй үлдэгдэл": "unpaid balance",
 *      "{0} акт нийт": "{0} certificates total",
 *      "олгосон {0}": "disbursed {0}",
 *      "хянагдаж буй {0} акт": "{0} under review",
 *      "хугацаа хэтэрсэн {0}": "{0} overdue",
 *      "дүнгүй {0} акт": "{0} without amount",
 *      "{0} · {1} — {2} хоног хэтэрсэн, {3}": "{0} · {1} — {2} days overdue, {3}",
 *      "{0} · {1} — олгох дүн сөрөг, {2}": "{0} · {1} — negative payable, {2}",
 */

import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { IPC_LOG, ipcCode, ipcNet, ipcPaid, ipcDue } from '@/lib/services';
import { mnt, date, text } from '@/lib/format';
import type { Level } from '@/lib/kpiLevels';
import { cell, table, daysBetween, type KpiResult, type KpiIssue, type Cell } from './kpi';

/**
 * Түүхий мөр — `FinData.acts`-ын төрөл (`Record<string, unknown>`); `@/lib/query`-ийн
 * нарийн `Row` ч үүнд шууд багтана. Талбарын утгыг `ipcNet`/`text`/`dayOf` шалгана.
 */
type Row = Record<string, unknown>;

/**
 * Кэшийн TTL — `Finance.tsx`-ийн `LIVE_TTL`(60 с)-тэй ижил. Тэр нь export
 * биш тул энд давтав; ямар ч байсан `IPC_LOG` таг нь бичилт бүрд хүчингүй
 * болгоно, TTL нь зөвхөн гадны (ArcGIS дээрх) засварыг барина.
 */
const IPC_TTL = 60_000;

/** Нэг акт — тооцоонд хэрэгтэй хэлбэрт хураасан */
export type IpcAct = {
  /** «IPC-03» · «APC-01» — `ipcCode()` */
  code: string;
  /** Дэд багц, хоосон бол үндсэн багц */
  pkg: string;
  contractor: string;
  /** IPC08 түүхий утга («БАТЛАГДСАН» · «ХЯНАГДАЖ БАЙНА» · …) */
  status: string;
  /** Олгох дүн (gross − суутгал); IPC18 хоосон бол null */
  net: number | null;
  /** Бодит шилжүүлсэн (3 гүйлгээ) — ҮРГЭЛЖ тоо */
  paid: number;
  /** Үлдэгдэл = net − paid; net null бол null */
  due: number | null;
  /** Төлөх ёстой огноо, `YYYY-MM-DD` эсвэл null */
  dueDay: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  /** Гүйлгээний огноонууд, epoch ms — `asOf`-д */
  payAt: number[];
};

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
 */
export function todayOf(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Нийлбэр — `null`-ыг АЛГАСНА; бүгд null бол null (0 БИШ) */
const sumOrNull = (xs: readonly (number | null)[]): number | null => {
  let s: number | null = null;
  for (const x of xs) if (x != null) s = (s ?? 0) + x;
  return s;
};

/* ══════════════ Түүхий мөр → акт ══════════════ */

export function toAct(r: Row): IpcAct {
  const F = IPC_LOG.fields;
  return {
    code: ipcCode(r),
    pkg: text(r[F.pkg2], '') || text(r[F.pkg], '') || '—',
    contractor: text(r[F.contractor]),
    status: text(r[F.status], ''),
    net: ipcNet(r),
    paid: ipcPaid(r),
    due: ipcDue(r),
    dueDay: dayOf(r[F.dueDate]),
    periodFrom: dayOf(r[F.periodFrom]),
    periodTo: dayOf(r[F.periodTo]),
    payAt: [r[F.payDate], r[F.payDate2], r[F.payDate3]]
      .map(epochOf)
      .filter((x): x is number => x != null),
  };
}

/* ══════════════ Цэвэр тооцоо ══════════════ */

/** Нэгтгэл — тест ба картын аль алинд */
export type IpcSummary = {
  n: number;
  /** Σ ipcPaid — гүйлгээ бодит тул 0 = огт шилжүүлээгүй */
  paidTotal: number;
  /** Σ ipcNet, null алгасна; бүгд null → null */
  netTotal: number | null;
  /** Σ ipcDue, null алгасна; бүгд null → null */
  dueTotal: number | null;
  reviewing: { count: number; net: number | null };
  noAmount: number;
  overdue: { count: number; due: number | null };
  /** Сөрөг олгох дүнтэй (өгөгдлийн алдаа) актын тоо */
  negative: number;
};

export function summarize(acts: readonly IpcAct[], today: string): IpcSummary {
  const reviewing = acts.filter((a) => a.status === IPC_LOG.statuses.review);
  const overdue = acts.filter((a) => isOverdue(a, today));
  return {
    n: acts.length,
    paidTotal: acts.reduce((s, a) => s + a.paid, 0),
    netTotal: sumOrNull(acts.map((a) => a.net)),
    dueTotal: sumOrNull(acts.map((a) => a.due)),
    reviewing: { count: reviewing.length, net: sumOrNull(reviewing.map((a) => a.net)) },
    noAmount: acts.filter((a) => a.net == null).length,
    overdue: { count: overdue.length, due: sumOrNull(overdue.map((a) => a.due)) },
    negative: acts.filter((a) => a.net != null && a.net < 0).length,
  };
}

/** Үлдэгдэлтэй БӨГӨӨД төлөх огноо нь өнөөдрөөс ӨМНӨ */
export const isOverdue = (a: IpcAct, today: string): boolean => (
  a.due != null && a.due > 0 && a.dueDay != null && a.dueDay < today
);

/** Хэтэрсэн хоног — өдрийн 00:00Z хоёрын зөрүү, бүхэл */
export const overdueDays = (a: IpcAct, today: string): number => (
  a.dueDay == null ? 0 : daysBetween(Date.parse(a.dueDay), Date.parse(today))
);

/**
 * Түвшин. ⚠️ Босго ШИНЭЭР зохиогоогүй — тоолуур бүр өөрөө дохио:
 *   хэтэрсэн акт 1+ → bad · хянагдаж буй/дүнгүй акт 1+ → warn · бусад good.
 *   Акт огт байхгүй → unknown (тэг үзүүлэлт биш, эх сурвалж хоосон).
 * ⚠️ IPC18 нь 38 актад хоосон тул бодит өгөгдөл дээр карт ҮРГЭЛЖ warn-аас
 *    доошгүй — энэ нь өгөгдлийн асуудлыг ИЛ байлгах санаатай сонголт.
 */
export function ipcLevel(s: IpcSummary): Level {
  if (s.n === 0) return 'unknown';
  if (s.overdue.count > 0) return 'bad';
  if (s.reviewing.count > 0 || s.noAmount > 0) return 'warn';
  return 'good';
}

/**
 * ЦЭВЭР тооцоо — сүлжээгүй, `Date.now()`-гүй; `now` гаднаас ирнэ.
 */
export function computeIpc(rows: readonly Row[], now: number): KpiResult {
  const today = todayOf(now);
  const acts = rows.map(toAct);
  const s = summarize(acts, today);

  /* ── Хүснэгт 1: үлдэгдэлтэй акт — төлөх огноогоор өсөх (хэтэрсэн нь эхэнд),
        огноогүй нь СҮҮЛД (үлдэгдэл их нь түрүүлж) ── */
  const dueRows = acts
    .filter((a) => a.due != null && a.due > 0)
    .sort((a, b) => {
      if (a.dueDay == null && b.dueDay == null) return (b.due ?? 0) - (a.due ?? 0);
      if (a.dueDay == null) return 1;
      if (b.dueDay == null) return -1;
      return a.dueDay.localeCompare(b.dueDay) || (b.due ?? 0) - (a.due ?? 0);
    });
  const dueTable = table(
    tr('Хугацаа хэтэрсэн ба төлөгдөөгүй акт'),
    [
      tr('Актын код'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Төлөв'),
      tr('Олгох дүн'), tr('Шилжүүлсэн'), tr('Үлдэгдэл'), tr('Төлөх ёстой огноо'),
    ],
    dueRows.map((a): Cell[] => [
      cell(a.code), cell(a.pkg), cell(a.contractor), cell(a.status || '—'),
      cell(a.net, 'mnt'), cell(a.paid, 'mnt'), cell(a.due, 'mnt'),
      cell(date(a.dueDay)),
    ]),
  );

  /* ── Хүснэгт 2: хянагдаж буй — дүн их нь эхэнд, дүнгүй нь сүүлд.
        ⚠️ Хамрах хугацаа нь ХОЁР багана — `en.ts`-д «Хамрах хугацаа: эхлэх»/
        «: дуусах» гэсэн албан нэр (IPC09/10) аль хэдийн бий, нэг «Хамрах
        хугацаа» түлхүүр байхгүй. `date(null)` = «—» тул хоосныг тусад нь
        шалгахгүй. ── */
  const reviewRows = acts
    .filter((a) => a.status === IPC_LOG.statuses.review)
    .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity));
  const reviewTable = table(
    tr('Хянагдаж буй акт'),
    [
      tr('Актын код'), tr('Багц'), tr('Гүйцэтгэгч'),
      tr('Хамрах хугацаа: эхлэх'), tr('Хамрах хугацаа: дуусах'), tr('Дүн (₮)'),
    ],
    reviewRows.map((a): Cell[] => [
      cell(a.code), cell(a.pkg), cell(a.contractor),
      cell(date(a.periodFrom)), cell(date(a.periodTo)), cell(a.net, 'mnt'),
    ]),
  );

  /* ── Хүснэгт 3: IPC18 хоосон — багц · код дарааллаар ── */
  const noAmountRows = acts
    .filter((a) => a.net == null)
    .sort((a, b) => a.pkg.localeCompare(b.pkg, 'mn', { numeric: true })
      || a.code.localeCompare(b.code, 'mn', { numeric: true }));
  const noAmountTable = table(
    tr('Дүнгүй акт (IPC18 хоосон)'),
    [tr('Актын код'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Төлөв')],
    noAmountRows.map((a): Cell[] => [
      cell(a.code), cell(a.pkg), cell(a.contractor), cell(a.status || '—'),
    ]),
  );

  /* ── Анхааруулга: хэтэрсэн (хоног ихээр нь эхэнд) → сөрөг олголт ── */
  const issues: KpiIssue[] = acts
    .filter((a) => isOverdue(a, today))
    .map((a) => ({ a, days: overdueDays(a, today) }))
    .sort((x, y) => y.days - x.days || (y.a.due ?? 0) - (x.a.due ?? 0))
    .map(({ a, days }): KpiIssue => ({
      tone: 'bad',
      text: tr('{0} · {1} — {2} хоног хэтэрсэн, {3}', a.code, a.pkg, days, mnt(a.due)),
    }));
  for (const a of acts) {
    if (a.net != null && a.net < 0) {
      issues.push({
        tone: 'warn',
        text: tr('{0} · {1} — олгох дүн сөрөг, {2}', a.code, a.pkg, mnt(a.net)),
      });
    }
  }

  /* ⚠️ `asOf` = хамгийн сүүлийн ГҮЙЛГЭЭНИЙ огноо (IPC28/30/32). Гүйлгээгүй бол
     null — актын бусад огноо нь «өгөгдлийн агшин» биш, төлөвлөгөө. */
  const asOf = acts.reduce<number | null>(
    (m, a) => a.payAt.reduce<number | null>((mm, x) => (mm == null || x > mm ? x : mm), m),
    null,
  );

  return {
    value: mnt(s.dueTotal),
    unit: tr('төлөгдөөгүй үлдэгдэл'),
    facts: s.n === 0 ? [] : [
      tr('{0} акт нийт', s.n),
      tr('олгосон {0}', mnt(s.paidTotal)),
      tr('хянагдаж буй {0} акт', s.reviewing.count),
      tr('хугацаа хэтэрсэн {0}', s.overdue.count),
      tr('дүнгүй {0} акт', s.noAmount),
    ],
    level: ipcLevel(s),
    /* Хоосон хүснэгтийг ОРУУЛАХГҮЙ — тоо нь `facts`-д аль хэдийн бий */
    tables: [dueTable, reviewTable, noAmountTable].filter((t) => t.rows.length > 0),
    issues,
    asOf,
    failedSources: [],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ Ганц эх сурвалж тул хэсэгчилсэн уналт байхгүй: `loadFinData` унавал
 *    ЮУ Ч ачаалагдаагүй → throw (`cached` алдааг кэшлэхгүй, «дахин оролдох»
 *    сэргэнэ). `failedSources` нь тиймээс үргэлж хоосон.
 */
export const loadIpcKpi = cached<KpiResult>(async () => {
  const { loadFinData } = await import('@/modules/Finance');
  const fin = await loadFinData();
  return computeIpc(fin.acts, Date.now());
}, IPC_TTL, ['IPC_LOG']);
