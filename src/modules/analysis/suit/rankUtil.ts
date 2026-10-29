/**
 * БҮСИЙН ЭРЭМБИЙН ТУСЛАХ — тэнцүү оноонд ижил байр, CSV экспорт (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */

import { t as tr } from '@/lib/i18nCore';
import type { Indicator } from '@/lib/analysis/config';
import { toCsv } from '@/lib/csvFile';
import { valueOf, type Mode, type Row } from './model';
import { zoneTypeLabel } from './format';

/**
 * ӨРСӨЛДӨӨНИЙ ЭРЭМБЭ («1, 2, 2, 4») — ДЭЛГЭЦЭД ХАРАГДАХ (бүхэлчилсэн) оноогоор.
 */
export function competitionRanks(values: (number | null)[]): (number | null)[] {
  const r = values.map((v) => (v == null || !Number.isFinite(v) ? null : Math.round(v)));
  const sorted = r.filter((v): v is number => v != null).sort((a, b) => b - a);
  /** оноо → эхний байр */
  const first = new Map<number, number>();
  sorted.forEach((v, i) => { if (!first.has(v)) first.set(v, i + 1); });
  return r.map((v) => (v == null ? null : first.get(v) ?? null));
}

/** Хэдэн бүс оноотой (өгөгдөлтэй) вэ */
export const countWithData = (rows: Row[], mode: Mode, ind: Indicator): number =>
  rows.reduce((a, r) => a + (valueOf(r, mode, ind) == null ? 0 : 1), 0);

/**
 * БҮСИЙН ОНОО + ТҮҮХИЙ ҮЗҮҮЛЭЛТИЙН CSV.
 *
 * Багана: байр · бүс · ангилал · одоогийн горимын оноо · хот төлөвлөлтийн нийлмэл
 * оноо · оршин суугч · өрх · талбай, дараа нь үзүүлэлт бүрийн ТҮҮХИЙ утга ба оноо.
 */
export function zoneCsv(rows: Row[], mode: Mode, ind: Indicator, indicators: readonly Indicator[]): string {
  const vals = rows.map((r) => valueOf(r, mode, ind));
  const ranks = competitionRanks(vals);
  const order = rows.map((_, i) => i).sort((a, b) => (vals[b] ?? -1) - (vals[a] ?? -1));
  const unitOf = (i: Indicator) => (i.unit ? ` (${i.unit})` : '');
  const header = [
    tr('Байр'), tr('Бүс'), tr('Ангилал'),
    mode === 'urban' ? tr('Оноо') : tr('Оноо «{0}»', ind.short),
    tr('Хот төлөвлөлтийн оноо'), tr('Хэмжсэн жин (%)'), tr('Оршин суугч'), tr('Өрх'), tr('Талбай (га)'),
    ...indicators.flatMap((i) => [`${i.short}${unitOf(i)}`, tr('{0} оноо', i.short)]),
  ];
  const round = (v: number | null | undefined, d: number) =>
    (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  const out = order.map((k) => {
    const r = rows[k];
    const actual = r.rawActual ?? r.raw;
    return [
      ranks[k], r.id, zoneTypeLabel(r.type), round(vals[k], 1), round(r.urban, 1),
      r.coverage == null ? null : round(r.coverage * 100, 0),
      round(r.residentPop, 0), round(r.households, 0), round(r.areaHa, 2),
      ...indicators.flatMap((i) => [round(actual[i.id], Math.max(0, i.decimals)), round(r.parts[i.id]?.score, 1)]),
    ];
  });
  return toCsv(header, out);
}
