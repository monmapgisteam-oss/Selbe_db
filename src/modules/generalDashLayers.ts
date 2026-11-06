/**
 * «ЕРӨНХИЙ ДАШБОАРД» → «Багц 74» ажлын ДАВХАРГЫН АСААЛТ/УНТРААЛТЫН ДҮРЭМ — цэвэр функцүүд (2026-10-22, аудит).
 */

/** Ажил — oid ба түүний багцын давхаргууд (`PKG_BY_BAGTS[key]`; нэг багцын ажлууд ИЖИЛ жагсаалт хуваалцаж болно) */
export type PkgWork<K> = { oid: K; ids: readonly string[] };

/** Ажил зурагт БҮРЭН асаалттай эсэх (давхаргатай бөгөөд бүгд харагдаж байна) — мөрийн тэмдэг ба «N/74» тоолуур */
export const pkgWorkOn = (w: PkgWork<unknown>, visible: readonly string[]): boolean =>
  w.ids.length > 0 && w.ids.every((id) => visible.includes(id));

/** Ажлыг АСААХАД бүртгэх давхаргууд — одоо харагдахгүй, энэ ажил ШИНЭЭР нэмэх (`addedRef`) */
export const pkgWorkAdded = (w: PkgWork<unknown>, visible: readonly string[]): string[] =>
  w.ids.filter((id) => !visible.includes(id));

/**
 * Ажлыг УНТРААХАД хасах давхаргууд. Өөр БҮРТГЭЛТЭЙ ажилд хэрэгтэй давхарга үлдэнэ — ГЭХДЭЭ ижил давхаргатай ажил зөвхөн
 * нөгөөгөөрөө асаалттай (хасах зүйл үлдэхгүй) бол дарах нь дэмий болохгүй: хуваалцсан давхаргууд хасагдана.
 */
export function pkgWorkDrop<K>(
  works: readonly PkgWork<K>[],
  w: PkgWork<K>,
  added: ReadonlyMap<K, readonly string[]>,
): string[] {
  const others = new Set(works
    .filter((o) => o.oid !== w.oid && added.has(o.oid))
    .flatMap((o) => o.ids));
  const mine = added.get(w.oid) ?? w.ids;
  const drop = mine.filter((id) => !others.has(id));
  return drop.length ? drop : [...mine];
}
