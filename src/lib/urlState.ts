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

/**
 * ХАРАГДАЦЫН ӨМЧЛӨЛТЭЙ ПАРАМЕТРҮҮД — түлхүүр → түүнийг уншдаг/бичдэг харагдацууд.
 *
 * ⚠️ 2026-10-06 (аудит): `writeParams` танихгүй түлхүүрийг хөнддөггүй тул харагдац
 *    солиход `?tuh=…`/`?pkg=…`/`?fine=0` URL-д ҮЛДЭЖ, хуваалцсан холбоосыг бохирдуулж,
 *    тэр харагдац руу буцаж ороход хуучин сонголт сэргэдэг байв. `Portal` харагдац
 *    солихдоо (push) шинэ харагдацын ЭЗЭМШДЭГГҮЙ түлхүүрүүдийг арилгана.
 * ⚠️ ШИНЭ модуль `readParam`/`writeParams`-аар өөрийн түлхүүр нэмбэл ЭНД бүртгэ —
 *    эс бөгөөс өөр харагдацад үлдэнэ (эвдрэхгүй, зөвхөн бохирдол). Порталын ерөнхий
 *    түлхүүр (`v` · `z` · `l` · `d` · `all` · `g`) энд ОРОХГҮЙ.
 * ⚠️ `pkg`-ийг гурван харагдац хуваалцана — хооронд нь шилжихэд багцын сонголт хадгалагдана.
 */
export const VIEW_PARAMS: Readonly<Record<string, readonly string[]>> = {
  /* `Tuh.tsx` */
  tuh: ['tuh'],
  /* `PkgFin.tsx` · `PkgProg.tsx` · `Schem.tsx` (`Bagts.tsx` харагдацад холбогдоогүй) */
  pkg: ['pkgFin', 'pkgProg', 'schem'],
  /* `Schem.tsx` */
  fine: ['schem'],
};

/** `view`-ийн эзэмшдэггүй харагдацын параметрүүд — `writeParams`-д `null` (устгах) */
export function foreignViewParams(view: string): Record<string, null> {
  const out: Record<string, null> = {};
  for (const [k, owners] of Object.entries(VIEW_PARAMS)) {
    if (!owners.includes(view)) out[k] = null;
  }
  return out;
}

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
