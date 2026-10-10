import { ArcGISError } from './query';

/**
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ тасрах ·
 * HTTP 5xx · JSON биш хариу). Серверийн ТОДОРХОЙ татгалзал ЭНД орохгүй — тэр үед юу ч
 * бичигдээгүй: ArcGIS `error.code` (498/499 токен — `sessionExpired` ч мөн, 400 …), HTTP
 * 400/401/403/404, мөрийн `success:false` (`rollbackOnFailure` буцаасан).
 * ⚠️ 2026-10-09: `src/modules/Huvaari.tsx`-ийн `isLostWrite`-ийг нийтлэг болгосон — Хуваарь,
 *    Ажил/Обьём батлах, хуваарийн обьём нэг дүрмээр «хариу алдагдсан = үр дүн тодорхойгүй» гэж
 *    үзнэ (хэзээ ч «юу ч бичигдээгүй» гэж үзэхгүй).
 * ⚠️ 2026-10-09: `butetsEdit.isLostResponse`-тэй ЯГ ижил дүрэм болгов. Урьд нь `code == null`
 *    бүхнийг (HTTP 403/404 ч) ба `sessionExpired`-ийг «алдагдсан» гэж үздэг байсан тул тодорхой
 *    татгалзал дээр PARTIAL тэмдэг/түгжээ үлдэж, хэрэглэгчийг дэмий «шалгаад дахин ачаал» гэж
 *    зовоодог байв. Хоёр функцийг ЗААВАЛ хамт өөрчил.
 */
const DEFINITE_HTTP = new Set([400, 401, 403, 404]);
export function isLostWrite(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  /* ⚠️ 2026-10-09 (аудит №6): ороосон алдаа (`bagtsSheet.applyUpdates`-ийн «{0}/{1} мөр хадгалагдав» — энгийн
     `Error`) эх алдааны ангиллыг `lost: true`-гээр дамжуулна — эс бөгөөс хариу алдагдсан chunk «тодорхой татгалзал» болно */
  if ((e as { lost?: unknown } | null)?.lost === true) return true;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  if (!(e instanceof ArcGISError) || e.code != null || e.sessionExpired) return false;
  return e.status == null || !DEFINITE_HTTP.has(e.status);
}
