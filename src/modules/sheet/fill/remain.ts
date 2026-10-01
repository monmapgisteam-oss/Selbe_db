/*
 * ⚠️ 2026-10-01: ЦЭВЭР модуль (CSS/React импортгүй) — `fillExtras.check.mjs` шууд импортлоно.
 */
/**
 * ҮЛДЭГДЭЛ = Обьём − архив − хяналтад − ноорог (2026-10-01, хэрэглэгч: бүгдийг зас).
 * Гүйцэтгэгч «энэ нүдэнд дахиад хэдийг бичиж болох вэ» гэдгийг нэг харцаар харна.
 * ⚠️ `null ≠ 0`: мөрийн Обьём байхгүй (эсвэл ≤0) бол `null` — бодох аргагүй.
 *    Бусад хэсэг `null` бол тэр хэсэг БАЙХГҮЙ (0) гэж тооцно.
 * ⚠️ Сөрөг байж болно (хэтэрсэн) — дуудагч тэр чигээр нь харуулна.
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
