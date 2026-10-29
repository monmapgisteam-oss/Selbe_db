/**
 * CEO ҮЗҮҮЛЭЛТ «IPC — ГҮЙЦЭТГЭГЧ КОМПАНИД ОЛГОСОН САНХҮҮЖИЛТ».
 *
 * ЭХ СУРВАЛЖ (ганц): `loadHoRows` — `HO_guitsetgel_arcgis_csv/196`,
 * 45 төлбөрийн мөр = 22 гэрээ.
 */

import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { HO_IPC, hoAmount, hoPayCode } from '@/lib/services';
import {
  loadHoRows, groupHo, hoTotals, unlinkedPays, ipcGaps,
  type Row, type HoContract, type HoTotals,
} from '@/lib/ipc';
import { mnt, pct, date, text, dayKey } from '@/lib/format';
import { paidPctOf } from '@/lib/paidShare';
import { isAuto } from '@/lib/ipcAuto';
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
 * epoch тоо (ОРОН НУТГИЙН өдөр), бусад мөр (`Date.parse`).
 * Хоосон/танигдахгүй → null.
 */
export function dayOf(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? dayKey(v) : null;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? dayKey(ms) : null;
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
 */
export function todayOf(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ══════════════ Цэвэр тооцоо ══════════════ */

/**
 * Нэгтгэл — тест ба картын аль алинд.
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
    noAmount: rows.filter((r) => !isAuto(r) && hoAmount(r) == null).length,
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
 * Түвшин. Босго ШИНЭЭР зохиогоогүй — тоолуур бүр өөрөө дохио:
 *   төлбөрийн мөр огт байхгүй → unknown (тэг үзүүлэлт БИШ, эх хоосон)
 *   өгөгдлийн цоорхой (дүнгүй мөр · кодгүй гэрээ · багцад холбогдоогүй
 *   төлбөр) 1+ → warn · бусад good.
 */
export function ipcLevel(s: IpcSummary): Level {
  if (s.pays === 0 && s.noAmount === 0) return 'unknown';
  if (s.noAmount > 0 || s.noCode > 0 || s.unlinked > 0) return 'warn';
  return 'good';
}

/**
 * Гэрээний харагдах нэр — код → багц → төслийн нэр → «—».
 */
const nameOf = (c: HoContract): string => c.code || c.pkg || c.project || '—';

/**
 * ТӨЛБӨРИЙН мөрийн харагдах эзэн — багц → гэрээний код → мөрийн ID.
 */
const payWho = (r: Row): string => (
  text(r[C.pkg], '') || text(r[C.code], '') || text(r[P.id], '') || '—'
);

/**
 * ЦЭВЭР тооцоо — сүлжээгүй, `Date.now`-гүй; `now` гаднаас ирнэ.
 */
export type IpcContractRef = {
  contract: number;
  paidContracted: number;
  pct?: number | null;
};

export function computeIpc(rows: readonly Row[], now: number, ref: IpcContractRef | null = null): KpiResult {
  void now;
  const s = summarize(rows);
  const cs = groupHo(rows);
  const refPct = !ref || s.pays === 0 ? null
    : ref.pct !== undefined ? ref.pct : paidPctOf(ref.paidContracted, ref.contract);

  /* ── Хүснэгт 1: ГЭРЭЭНИЙ САНХҮҮЖИЛТ — гэрээнд эзлэх хувь БАГА нь ЭХЭНД
        (эрсдэлийн эрэмбэ), хувь хэмжигдээгүй нь СҮҮЛД. */
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
      tr('Төсөвт өртөг'), tr('Гэрээт төсөв (HO хүснэгтээр)'), tr('Олгосон'), tr('Гэрээнд эзлэх'),
    ],
    byPct.map((c): Cell[] => [
      cell(c.code || '—'), cell(c.pkg || '—'), cell(c.contractor || '—'),
      cell(c.workType || '—'),
      cell(c.budgetTotal, 'mnt'), cell(c.contractTotal, 'mnt'),
      cell(c.paidTotal, 'mnt'), cell(c.paidPct, 'pct'),
    ]),
  );

  /* ── Хүснэгт 2: ТӨЛБӨРГҮЙ ГЭРЭЭ — `paidTotal` нь `null` (ХЭМЖИГДЭЭГҮЙ). */
  const noPayTable = table(
    tr('Төлбөргүй гэрээ'),
    [tr('Гэрээний код'), tr('Багц'), tr('Гүйцэтгэгч'), tr('Гэрээт төсөв')],
    cs.filter((c) => c.paidTotal == null).map((c): Cell[] => [
      cell(c.code || '—'), cell(c.pkg || '—'), cell(c.contractor || '—'),
      cell(c.contractTotal, 'mnt'),
    ]),
  );

  /* ── Хүснэгт 3: БАГЦАД ХОЛБОГДООГҮЙ ТӨЛБӨР. */
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
    if (!isAuto(r) && hoAmount(r) == null) {
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
  for (const c of cs) {
    const g = ipcGaps(c.pays);
    if (g.length) {
      issues.push({
        tone: 'warn',
        text: tr('{0} — IPC дугаарын цоорхой: {1}', nameOf(c), g.join(', ')),
      });
    }
  }

  const asOf = rows.reduce<number | null>((m, r) => {
    const x = epochOf(r[P.payDate]);
    return x == null || (m != null && x <= m) ? m : x;
  }, null);

  return {
    value: mnt(s.paid),
    unit: tr('олгосон санхүүжилт'),
    facts: s.pays === 0 && s.noAmount === 0 ? [] : [
      tr('{0} гэрээ · {1} төлбөр', s.contracts, s.pays),
      tr('урьдчилгаа {0}', mnt(s.advance)),
      tr('гүйцэтгэл {0}', mnt(s.work)),
      ...(ref
        ? [
          tr('гэрээлсэн дүн {0} (Cashflow)', mnt(ref.contract)),
          tr('гэрээнд эзлэх {0}', pct(refPct)),
        ]
        : [tr('гэрээнд эзлэх {0} (HO хүснэгтээр)', pct(s.paidPct))]),
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

export const loadIpcKpi = cached<KpiResult>(async () => {
  const [rows, fin] = await Promise.all([
    loadHoRows(),
    import('@/lib/reportData').then((m) => m.loadFinance()).catch(() => null),
  ]);
  const ref: IpcContractRef | null = fin
    ? { contract: fin.contractAmount, paidContracted: fin.paidContracted, pct: fin.paidPct }
    : null;
  return computeIpc(rows, Date.now(), ref);
}, IPC_TTL, ['HO_IPC', 'CASHFLOW_NEW']);
