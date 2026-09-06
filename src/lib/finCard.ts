/**
 * АКТЫН КАРТЫН ӨГӨГДӨЛ — цэвэр логик, React-гүй.
 *
 * ⚠️ 2026-09-06: CASHFLOW-ийн хэсэг (паспорт + сарын хуваарийн «А» загвар)
 * БҮРМӨСӨН ХАСАГДСАН. Тэр нь `cashflow_0813` нэг хүснэгтэд ГЭРЭЭ ба САР гэсэн
 * хоёр төрлийн мөр агуулдгаас үүдсэн байв — шинэ `Cashflow_0904`-т мөр БҮР
 * нэг гэрээ тул салгах юм байхгүй, хүснэгт нь ердийн хавтгай хүснэгт.
 * Хасагдсан: `CF_PERIOD_FIELDS` · `Contract` · `splitContracts` · `YearGroup` ·
 * `groupPeriodsByYear` · `usedFields` · `CF_KPI_FIELDS` · `CF_PASS_GROUPS`.
 *
 * ⚠️ Энэ модуль мөр НЭГТГЭДЭГГҮЙ, талбар ХАСДАГГҮЙ — зөвхөн тоо бодно.
 * Мөр бүр эх мөртэйгээ 1:1 тул засвар (`oid:талбар`) хэвээр.
 *
 * ⚠️ React импортлохгүй — `finCard.check.mjs` шууд Node дээр ачаална.
 */
import { IPC_LOG } from '@/lib/services';
import type { Row } from '@/lib/finGroup';

const IP = IPC_LOG.fields;

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
 * Цэвэр дүн = гүйцэтгэлийн дүн − суутгал. Гүйцэтгэлийн дүн ХООСОН бол `null`.
 *
 * ⚠️ 2026-09-04: урьд нь энд «`services.ipcNet` нь null-ыг 0 болгодог тул
 *    “дүнгүй акт” 0 гэж худал гардаг» гэж бичсэн байв — тэр нь ОДОО ХУДАЛ:
 *    `ipcNet` өөрөө `number | null` буцаадаг болов. Хоёулаа нэг дүрэмтэй
 *    боллоо; энэ функц тусдаа хэвээр байгаа шалтгаан нь зөвхөн давхарга
 *    тусгаарлалт (`finCard` нь React-гүй, `finCard.check.mjs` шууд Node дээр
 *    ачаалдаг) ба суутгалыг `dedOrNull`-аар (null-мэдрэмжтэй) авдаг нь —
 *    тоон үр дүн `ipcNet`-тэй ижил.
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
