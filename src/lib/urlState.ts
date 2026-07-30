/**
 * URL QUERY PARAM ↔ порталын төлөв.
 *
 * Харагдац, бүс, сонгосон давхарга зэрэг гол сонголтыг URL-д тусгаснаар:
 *   · холбоос ХУВААЛЦАЖ болно («?v=bagts&pkg=БАГЦ31» → шууд тэр хуудас)
 *   · F5 дархад сонголт алдагдахгүй
 *   · хөтчийн Back товч аппаас гаргалгүй өмнөх харагдац руу буцаана
 *
 * ⚠️ Статик экспорт (GitHub Pages) тул Next-ийн router БИШ, `window.history`
 * шууд — query param нь ямар ч серверийн дэмжлэг шаардахгүй.
 */

/** Нэг параметр уншина — сервер талд (байхгүй window) үргэлж null */
export function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Параметрүүдийг ОДООГИЙН URL дээр нийлүүлж бичнэ. `null`/`undefined` утга нь
 * тухайн түлхүүрийг УСТГАНА — анхдагч утгыг URL-д бичихгүй байснаар холбоос
 * цэвэрхэн үлдэнэ (`?v=dashboard&d=2d` гэж бохирдуулахгүй).
 *
 * ⚠️ Үр дүн одоогийн URL-тай ИЖИЛ бол юу ч хийхгүй — popstate-ээр төлөв
 * сэргээгдэх үед эффект дахин бичих гэж оролддог ч түүх бохирдохгүй.
 *
 * @param push — `true` бол ШИНЭ түүхийн бичлэг (харагдац солиход, Back ажиллана);
 *   анхдагч нь replace (бүс/давхарга солих бүрд түүх урсгахгүй).
 */
export function writeParams(
  patch: Record<string, string | null | undefined>,
  { push = false }: { push?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  const { pathname, hash } = window.location;
  const next = qs ? `${pathname}?${qs}${hash}` : `${pathname}${hash}`;
  const cur = `${pathname}${window.location.search}${hash}`;
  if (next === cur) return;
  if (push) window.history.pushState(null, '', next);
  else window.history.replaceState(null, '', next);
}
