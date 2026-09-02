/**
 * САНХҮҮЖИЛТИЙН КАРТЫН ӨГӨГДӨЛ — цэвэр логик, React-гүй.
 *
 * ⚠️ 2026-09-02, хэрэглэгчийн сонгосон «А» загвар: багц бүрийн дотор ГЭРЭЭ
 * мөрийг «паспорт» болгож дэлгэж, САР мөрүүдийг доор нь цэвэр хуваарийн
 * хүснэгт болгоно. Учир нь `cashflow_0813` нэг хүснэгтэд ХОЁР төрлийн мөр
 * агуулдаг — паспорт мөрөнд он·сар·дүн хоосон, сарын мөрөнд нэр·төсөв·огноо
 * хоосон тул аль ч нэг хүснэгтэд хагас нүд нь үргэлж хоосон харагддаг байв.
 *
 * ⚠️ Энэ модуль мөр НЭГТГЭДЭГГҮЙ, талбар ХАСДАГГҮЙ — зөвхөн ангилж
 * бүлэглэнэ. Мөр бүр эх мөртэйгээ 1:1 тул засвар (`oid:талбар`) хэвээр.
 *
 * ⚠️ React импортлохгүй — `finCard.check.mjs` шууд Node дээр ачаална.
 */
import { CASHFLOW2, IPC_LOG } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import type { GroupRow, Row } from '@/lib/finGroup';

const CF = CASHFLOW2.fields;
const IP = IPC_LOG.fields;

/* ─────────────────────────── CASHFLOW ─────────────────────────── */

/**
 * ХУВААРИЙН (үеийн мөрийн) талбарууд — хуваарийн хүснэгтийн баганууд, энэ
 * дарааллаар. Үлдсэн бүх талбар паспортод очно.
 *
 * ⚠️ Эх үүсвэрийн задаргааг `CASHFLOW2.sources`-оос ГАРГАНА — кодоор давтаж
 *    бичвэл үйлчилгээ өөрчлөгдөхөд хоёр газар зөрнө.
 */
export const CF_PERIOD_FIELDS: string[] = [
  CF.year, CF.monthNo, CF.amount,
  ...CASHFLOW2.sources.map((s) => s.period),
  CF.advance, CF.advanceRepay, CF.opened,
];

export type Contract = {
  /** Гэрээний код — ДЭЛГЭЦЭД ГАРАХГҮЙ (хэрэглэгчийн «огт хэрэггүй»), зөвхөн холбоос */
  geree: string;
  master: GroupRow | null;
  periods: GroupRow[];
};

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Багцын мөрүүдийг ГЭРЭЭ болгоноор нь салгана: мастер (паспорт) + үеийн мөрүүд.
 *
 * ⚠️ Гэрээний эх ДАРААЛАЛ хадгалагдана (анх таарсан дарааллаар).
 * ⚠️ Мастергүй үеийн мөр АЛДАГДАХГҮЙ — `master: null` гэрээнд очно.
 * ⚠️ Нэг гэрээнд ХОЁР мастер мөр (дата бохир) таарвал хоёр дахийг нь үеийн
 *    мөрд тооцно — сонголтгүйгээр хаявал мөр чимээгүй алга болно.
 */
export function splitContracts(rows: GroupRow[]): Contract[] {
  const order: string[] = [];
  const map = new Map<string, Contract>();
  for (const g of rows) {
    const k = s(g.row[CF.geree]);
    let c = map.get(k);
    if (!c) {
      c = { geree: k, master: null, periods: [] };
      map.set(k, c);
      order.push(k);
    }
    if (g.row[CF.rowType] === CASHFLOW2.rows.master && c.master == null) c.master = g;
    else c.periods.push(g);
  }
  return order.map((k) => map.get(k) as Contract);
}

/* ─────────────────────────── НИЙЛБЭР ─────────────────────────── */

/**
 * Талбарын нийлбэр — БҮХ мөр хоосон бол `null`.
 * ⚠️ 0 гэж буцаавал «дүнгүй» ба «тэг» хоёр нэгдэж НИЙТ мөр худал уншигдана.
 */
export function sumOrNull(rows: Row[], field: string): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    const v = r[field];
    if (v == null || v === '') continue;
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    acc = (acc ?? 0) + x;
  }
  return acc;
}

/* ─────────────────────────── IPC ─────────────────────────── */

/**
 * Актын хүснэгтийн ҮНДСЭН баганууд — мөнгөний зам: дугаар · төрөл · төлөв ·
 * хамрах хугацаа · гүйцэтгэлийн дүн. Суутгал/цэвэр/шилжүүлсэн нь БОДОГДОНО.
 * Үлдсэн бүх талбар мөрийг дэлгэхэд дэлгэрэнгүйд гарна — мэдээлэл ХАСАГДАХГҮЙ.
 */
export const IPC_MAIN_FIELDS: string[] = [
  IP.no, IP.kind, IP.status, IP.periodFrom, IP.periodTo, IP.gross,
];

/** Мөрийн хэд хэдэн талбарын нийлбэр — бүгд хоосон бол `null` */
function rowSumOrNull(r: Row, fields: readonly string[]): number | null {
  let acc: number | null = null;
  for (const f of fields) {
    const v = r[f];
    if (v == null || v === '') continue;
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    acc = (acc ?? 0) + x;
  }
  return acc;
}

/** 4 суутгалын нийлбэр — бүгд хоосон бол `null` (0 БИШ) */
export const dedOrNull = (r: Row): number | null => rowSumOrNull(r, IPC_LOG.deductions);

/** 3 гүйлгээний нийлбэр — бүгд хоосон бол `null` */
export const paidOrNull = (r: Row): number | null => rowSumOrNull(r, IPC_LOG.payments);

/**
 * Цэвэр дүн = гүйцэтгэлийн дүн − суутгал. Гүйцэтгэлийн дүн ХООСОН бол `null` —
 * `services.ipcNet` нь null-ыг 0 болгодог тул «дүнгүй акт» 0 гэж худал гардаг.
 */
export function netOrNull(r: Row): number | null {
  const v = r[IP.gross];
  if (v == null || v === '') return null;
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return x - (dedOrNull(r) ?? 0);
}

/** Багцын цэвэр олгосон нийт — бүх акт дүнгүй бол `null` */
export function netTotalOrNull(rows: Row[]): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    const n = netOrNull(r);
    if (n == null) continue;
    acc = (acc ?? 0) + n;
  }
  return acc;
}

/* ─────────────────── ОН ДОТРОО САР САРААР ─────────────────── */

export type YearGroup = { year: string; rows: GroupRow[] };

const numOf = (v: unknown): number | null => {
  const t = s(v);
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

/**
 * Хуваарийн мөрүүдийг ОН ДОТРОО САР САРААР эрэмбэлж, оноор нь бүлэглэнэ
 * (2026-09-02, хэрэглэгчийн заавар: «хөрөнгө оруулалт он дотроо сар сараар
 * мөнгөн дүнгүүд байх ёстой»). Он нь merge (`rowSpan`) нүд болж зурагдана.
 *
 * ⚠️ ЭНД эрэмбэлдэг нь санаатай: эх дараалал нь оруулсан дарааллаас хамаарч
 *    он·сар холилдсон байж болно — «он дотроо» бүлэглэхэд эрэмбэ ЗААВАЛ.
 * ⚠️ Онгүй мөр ТӨГСГӨЛД, өөрийн «—» бүлэгт — алдагдахгүй, дундуур ч орохгүй.
 * ⚠️ Мөр НЭГТГЭГДЭХГҮЙ — тоо нь оролттой ЯГ тэнцүү.
 */
export function groupPeriodsByYear(periods: GroupRow[]): YearGroup[] {
  const idx = periods.map((g, i) => ({ g, i }));
  idx.sort((a, b) => {
    const ya = numOf(a.g.row[CF.year]);
    const yb = numOf(b.g.row[CF.year]);
    if (ya == null && yb == null) return a.i - b.i;
    if (ya == null) return 1;
    if (yb == null) return -1;
    if (ya !== yb) return ya - yb;
    const ma = numOf(a.g.row[CF.monthNo]) ?? 99;
    const mb = numOf(b.g.row[CF.monthNo]) ?? 99;
    if (ma !== mb) return ma - mb;
    return a.i - b.i;
  });
  const out: YearGroup[] = [];
  for (const { g } of idx) {
    const y = numOf(g.row[CF.year]);
    const label = y == null ? '' : String(y);
    const last = out[out.length - 1];
    if (last && last.year === label) last.rows.push(g);
    else out.push({ year: label, rows: [g] });
  }
  return out;
}

/* ─────────────── УНШИХ КАРТЫН БҮТЭЦ (2026-09-02, дахин загвар) ─────────────── */

/** Утгатай талбаруудыг л үлдээнэ — хоосон «—» багана/мөр нь мэдээлэл биш чимээ */
export function usedFields(rows: Row[], fields: readonly string[]): string[] {
  return fields.filter((f) => rows.some((r) => {
    const v = r[f];
    return !(v == null || v === '');
  }));
}

/** Мөнгөний ГОЛ дүнгүүд — картын дээд зурвасын KPI (мөнгөний зам дарааллаар) */
export const CF_KPI_FIELDS: string[] = [CF.budget, CF.orderTotal, CF.contractAmount];

export type PassGroup = { label: string; fields: string[] };

/**
 * Дэлгэрэнгүйн БҮЛГҮҮД — паспортын үлдсэн талбаруудыг утгаар нь бүлэглэнэ.
 *
 * ⚠️ Талбар бүр ЯГ НЭГ газар: нэр нь толгойд, гол дүн нь KPI-д, үлдсэн нь
 *    энд. `finCard.check` нь нийлбэр нь БҮРЭН гэдгийг шалгадаг — бүлэглэлд
 *    орхигдсон талбар «бүх мэдээлэл» амлалтыг чимээгүй эвдэнэ.
 */
export const CF_PASS_GROUPS: PassGroup[] = [
  { label: tr('Үндсэн'), fields: [CF.type, CF.contractor, CF.client, CF.pkg, CF.pkg2] },
  { label: tr('Захирамж'), fields: [CF.orderNo, CF.orderDate] },
  { label: tr('Гэрээ'), fields: [CF.contractNo, CF.contractDate, CF.startDate, CF.endDate] },
  { label: tr('Эх үүсвэрийн нийт'), fields: CASHFLOW2.sources.map((x) => x.total) },
  { label: tr('Урьдчилгаа'), fields: [CF.advanceGuarantee, CF.advanceDeduct] },
  { label: tr('Бусад'), fields: [CF.extraAmount, CF.amountNote, CF.contractNote] },
];
