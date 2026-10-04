/**
 * MAX+1 ДУГААРЫН ДАВХАРДАЛ — БИЧСЭНИЙ ДАРАА ШАЛГАЖ ЗАСАХ ЦЭВЭР ТУСЛАХ (2026-10-04).
 *
 * ⚠️ ЯАГААД: `Cashflow_ID` (`Finance.publish`) ба хяналтын `Бүртгэлийн_дугаар`
 *    (`hyanaltSubmit.submitForReview` · `hyanaltStore.recheck`) нь клиентэд «одоогийн max + 1»
 *    гэж бодогддог; ArcGIS-д unique хязгаар байхгүй. Хоёр хэрэглэгч зэрэг нийтэлбэл ИЖИЛ
 *    дугаар авч, Cashflow-ийн сарын мөрүүд хоёр ажилд зэрэг наалдана (S-муруй давхардана).
 * ЗАГВАР (`chanarStore.createDraft`-ийн seq-ийн ижил санаа): бичсэний ДАРАА бүх мөрийг дахин
 *    уншиж, ӨӨРИЙН оноосон дугаар өөр мөрд бас байвал ӨӨРИЙНХИЙГ max+1 рүү шилжүүлнэ.
 *    Илрүүлсэн тал л өөрийнхийгөө зөөнө — бусдын мөрийг хөндөхгүй.
 * ⚠️ Импортгүй, сүлжээгүй — `idUnique.check.mjs` шууд шалгана.
 */

export type IdRow = { oid: number; id: number | null };

/** `G-000123` · `123` · 123 → 123; дугааргүй бол `null` */
export function idNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const d = String(v).replace(/\D/g, '');
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Энэ бичилтэд оноосон (`assigned`) дугааруудаас ӨӨР мөрд (`mine`-д ороогүй oid) бас байгаа нь.
 * @returns эрэмбэлсэн, давхардалгүй
 */
export function collidedIds(rows: readonly IdRow[], mine: ReadonlySet<number>, assigned: Iterable<number>): number[] {
  const want = new Set(assigned);
  const out = new Set<number>();
  for (const r of rows) {
    if (r.id == null || mine.has(r.oid)) continue;
    if (want.has(r.id)) out.add(r.id);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Давхардсан дугаар бүрд ШИНЭ дугаар — бүх мөрийн max + 1-ээс дараалан (`extra` — уншилтад
 * хараахан ороогүй ч эзлэгдсэн гэж мэдэгдэж буй дугаарууд).
 */
export function renumberPlan(rows: readonly IdRow[], collided: readonly number[], extra: Iterable<number> = []): Map<number, number> {
  let next = 1 + Math.max(0, ...rows.map((r) => r.id ?? 0), ...extra);
  const out = new Map<number, number>();
  for (const id of collided) { out.set(id, next); next += 1; }
  return out;
}
