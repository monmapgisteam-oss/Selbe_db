'use client';

/**
 * BUS_cashflow — багц бүрийн ТӨСӨВ, САНХҮҮЖИЛТ, ГЭРЭЭ. 7 мөр, багц тус бүрд нэг.
 *
 * ⚠️ Хоёр модуль (Ерөнхий дашбоард, Багцын мэдээлэл) хоёулаа уншдаг тул энд
 * дундын болгов — эс бөгөөс нэг нь талбар нэмэхэд нөгөө нь хоцорно.
 */

import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW } from '@/lib/services';
import { text } from '@/lib/format';

const CF = CASHFLOW.fields;

/**
 * Таслалтай мөнгөн мөрийг тоо руу («259,778,021,987» → 259778021987).
 * ⚠️ Талбарууд нь ТЕКСТ — `Number()` шууд `NaN` буцаана.
 */
export const cfNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export type CashRow = {
  /** «Багц-4.1» — бусад эх сурвалжтай `bagtsKey()`-ээр л жиших */
  zone: string;
  budget: number;
  orderTotal: number;
  contract: number;
  contractor: string;
  /** Санхүүжилтийн эх үүсвэрүүд — `CASH_SOURCES`-ийн дарааллаар */
  sources: number[];
  /** `CASHFLOW.months`-ийн дарааллаар олгосон санхүүжилт */
  months: number[];
};

/** Санхүүжилтийн эх үүсвэр — нэр ба өнгө нэг эх сурвалжаас */
export const CASH_SOURCES: { field: string; label: string; color: string }[] = [
  { field: CF.securities, label: 'Үнэт цаасны хөрөнгө', color: '#3387b8' },
  { field: CF.projectIncome, label: 'Төслийн орлого', color: '#22c55e' },
  { field: CF.cityBudget, label: 'Нийслэлийн төсөв', color: '#f59e0b' },
  { field: CF.reserve, label: 'НЗД нөөц хөрөнгө', color: '#a855f7' },
];

export function useCashflow(): Async<CashRow[]> {
  return useAsync(() => queryFeatures(CASHFLOW.url, {
    outFields: [
      CF.zone, CF.budget, CF.orderTotal, CF.contract, CF.contractor,
      ...CASH_SOURCES.map((s) => s.field),
      ...CASHFLOW.months.map((m) => m.code),
    ],
  }).then((rows) => rows.map((r) => ({
    zone: text(r[CF.zone]),
    budget: cfNum(r[CF.budget]),
    orderTotal: cfNum(r[CF.orderTotal]),
    contract: cfNum(r[CF.contract]),
    contractor: text(r[CF.contractor]),
    sources: CASH_SOURCES.map((s) => cfNum(r[s.field])),
    months: CASHFLOW.months.map((m) => cfNum(r[m.code])),
  }))), []);
}
