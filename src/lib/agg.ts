'use client';

import { t as tr } from '@/lib/i18nCore';
/**
 * ДАШБОАРДЫН НЭГТГЭХ ХЭРЭГСЭЛ — `Dashboard.tsx`-д 20 гаруй удаа давтагдсан
 * `reduce`-уудыг ГАНЦ газар болгов. `live.ts` ч мөн импортолдог тул модуль нь
 * React-ээс хамааралгүй (`'use client'` нь дуудагчидтай нийцүүлэх зорилготой).
 */

/** Σ — тоон талбарын нийлбэр. `NaN`/`null` нь 0 (нийлбэр чимээгүй унахгүй). */
export const sumBy = <T,>(rows: readonly T[], f: (r: T) => number): number =>
  rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);

/** Массивын хамгийн их эерэг утга — 0-д хуваахаас хамгаална (heat/max-д). */
export const maxOf = (arr: readonly number[]): number => Math.max(1, ...arr);

export type Group = { key: string; label: string; value: number; n: number };

/**
 * groupBy → нийлбэр + мөрийн тоо, УТГААР буурах эрэмбээр.
 *
 * ⚠️ Хоосон/«0» түлхүүрийг ХАЯХГҮЙ — `unknown` шошго болгож ил гаргана
 * (`live.ts`-ийн «Эх үүсвэр задраагүй» дүрэмтэй ижил: зөрүү нуухгүй).
 */
export function tally<T>(
  rows: readonly T[],
  pick: (r: T) => { key: string; value: number; n?: number },
  unknown = tr('Тодорхойгүй'),
): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const p = pick(r);
    const k = p.key.replace(/\s+/g, ' ').trim();
    const key = !k || k === '0' ? unknown : k;
    const cur = m.get(key) ?? { key, label: key, value: 0, n: 0 };
    cur.value += Number(p.value) || 0;
    cur.n += p.n == null ? 1 : Number(p.n) || 0;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}
