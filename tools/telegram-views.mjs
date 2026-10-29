/**
 * TELEGRAM БОТЫН «✅ Зөвшөөрөх» ЭРХИЙН ЖАГСААЛТ — `VIEWS`-ээс АВТОМАТААР (2026-10-01).
 */

/** Санхүүгийн харагдацууд — ботын «бүх (санхүүгээс бусад)» эрхэд ОРОХГҮЙ */
export const FINANCE_VIEWS = new Set(['pkgFin', 'finance']);

/** `VIEWS`-ийн түлхүүрүүдээс санхүүгийнхийг хасна (дараалал хэвээр, давхардалгүй) */
export function botFullViews(keys) {
  return [...new Set(keys)].filter((k) => !FINANCE_VIEWS.has(k));
}

export function grantWithin(views, adminScope) {
  if (adminScope === 'all') return [...views];
  if (!Array.isArray(adminScope)) return [];
  return views.filter((v) => adminScope.includes(v));
}
