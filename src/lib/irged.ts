'use client';

/**
 * «ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ» — АМЬД АЧААЛАГЧИД.
 *
 *   2. Нийгмийн барилгын АМЬД ХҮЧИН ЧАДАЛ (`Huchin_chadal`, нийт талбай) —
 */

import { count, queryGroup, type Row } from '@/lib/query';
import { cached } from '@/lib/live';
import { IRGED_BUILT, LAYER_BY_ID } from '@/lib/services';

/* ══════════════════ Гэр хорооллын барилга ══════════════════ */

export type GerBuiltRow = {
  /** Түүхий утга — SQL шүүлтэд (`Байшин` / `Гэр`) */
  type: string;
  n: number;
  color?: string;
};

export const loadGerBuilt = cached<GerBuiltRow[]>(async () => {
  const T = IRGED_BUILT.typeField;
  const rows = await queryGroup(IRGED_BUILT.url, T, [count(T, 'n')]);
  const paint = LAYER_BY_ID[IRGED_BUILT.id]?.paint?.values ?? {};
  return rows
    .map((r: Row) => {
      const type = String(r[T] ?? '').trim();
      /* `count` статистик нь бүлэг бүрд ҮРГЭЛЖ ирнэ (бүлэг байгаа = ≥ 1 мөр) */
      const n = Number(r.n ?? 0);
      return { type, n, color: paint[type] };
    })
    .filter((x) => x.type !== '')
    .sort((a, b) => b.n - a.n);
});
