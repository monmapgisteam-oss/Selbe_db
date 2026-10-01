/**
 * БҮСИЙН ЭРЭМБИЙН ТУСЛАХ — тэнцүү оноонд ижил байр, CSV экспорт (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 * ⚠️ Цэвэр функцууд — `Ranking.tsx` ба тест (`rankUtil.check.mjs`) хоёулаа эндээс.
 */

import { t as tr } from '@/lib/i18nCore';
import type { Indicator } from '@/lib/analysis/config';
import { toCsv } from '@/lib/csvFile';
import { valueOf, type Mode, type Row } from './model';

/**
 * ӨРСӨЛДӨӨНИЙ ЭРЭМБЭ («1, 2, 2, 4») — ДЭЛГЭЦЭД ХАРАГДАХ (бүхэлчилсэн) оноогоор.
 *
 * ⚠️ Урьд нь мөрийн ДУГААР (`i + 1`) байсан тул ижил «72» оноотой хоёр бүс 3, 4-р
 *    байр авч, «яагаад нэг оноотой атлаа доогуур вэ» гэсэн андуурал үүсгэдэг байв.
 *    Бүхэлчилсэн оноогоор харьцуулна: 72.4 ба 72.3 нь дэлгэцэд хоёулаа «72» тул
 *    ижил байр — харагдах зүйлтэй зөрөхгүй.
 * ⚠️ Өгөгдөлгүй (`null`) бүс байргүй (`null`) — «сүүлийн байр» БИШ.
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
 * ⚠️ Түүхий утга нь `rawActual` — `ASSUME_MET`-ээр «норм хангасан» гэж дарагдахаас
 *    ӨМНӨХ бодит хэмжилт (оноо нь дарагдсан утгаар бодогддог — баганын нэр ялгана).
 * ⚠️ Өгөгдөлгүй нүд ХООСОН (0 БИШ).
 */
export function zoneCsv(rows: Row[], mode: Mode, ind: Indicator, indicators: readonly Indicator[]): string {
  const vals = rows.map((r) => valueOf(r, mode, ind));
  const ranks = competitionRanks(vals);
  const order = rows.map((_, i) => i).sort((a, b) => (vals[b] ?? -1) - (vals[a] ?? -1));
  const unitOf = (i: Indicator) => (i.unit ? ` (${i.unit})` : '');
  const header = [
    tr('Байр'), tr('Бүс'), tr('Ангилал'),
    mode === 'urban' ? tr('Оноо') : tr('Оноо «{0}»', ind.short),
    tr('Хот төлөвлөлтийн оноо'), tr('Оршин суугч'), tr('Өрх'), tr('Талбай (га)'),
    ...indicators.flatMap((i) => [`${i.short}${unitOf(i)}`, tr('{0} оноо', i.short)]),
  ];
  const round = (v: number | null | undefined, d: number) =>
    (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  const out = order.map((k) => {
    const r = rows[k];
    const actual = r.rawActual ?? r.raw;
    return [
      ranks[k], r.id, r.type, round(vals[k], 1), round(r.urban, 1),
      round(r.residentPop, 0), round(r.households, 0), round(r.areaHa, 2),
      ...indicators.flatMap((i) => [round(actual[i.id], Math.max(0, i.decimals)), round(r.parts[i.id]?.score, 1)]),
    ];
  });
  return toCsv(header, out);
}
