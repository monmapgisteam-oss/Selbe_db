/**
 * ҮЛДЭГДЭЛ = Обьём − архив − хяналтад − ноорог (2026-10-01, хэрэглэгч: бүгдийг зас).
 * Гүйцэтгэгч «энэ нүдэнд дахиад хэдийг бичиж болох вэ» гэдгийг нэг харцаар харна.
 */
export function remainOf(
  vol: number | null | undefined,
  archived: number | null | undefined,
  inReview: number | null | undefined,
  draft: number | null | undefined,
): number | null {
  if (vol == null || !Number.isFinite(vol) || vol <= 0) return null;
  return vol - (archived ?? 0) - (inReview ?? 0) - (draft ?? 0);
}
