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
 * ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `butetsEdit.isLostResponse` одоо ЭНИЙГ дуудна — нэг эх сурвалж
 *    (урьд нь хуулбар байсан тул «хамт өөрчил» дүрэм чимээгүй зөрдөг байв).
 * ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ArcGIS JS API (`@arcgis/core/request` — `FeatureLayer.applyEdits` ·
 *    `queryFeatures`) сүлжээний TypeError, timeout, HTTP 5xx, 200-аар ирсэн `error`-ыг БҮГДИЙГ `esri/core/Error`
 *    (`name: 'request:server'` / `'request:timeout'`, `details.httpStatus`) болгож шиддэг тул урьд нь энэ функц JS API-ийн
 *    алдаанд ХЭЗЭЭ Ч `true` буцаадаггүй байв — `saveSubmission.lost` үхмэл, FillNew `clearInflight` бүх уналтад
 *    илгээлтийн тэмдгийг арчдаг байв. `details.httpStatus`-ыг `authToken.classifyRefreshError`-ийн загвараар уншина:
 *    байхгүй (сүлжээ · timeout · JSON биш) → алдагдсан; тодорхой татгалзал (`DEFINITE_API`) → биш; бусад (5xx · 429) → алдагдсан.
 *    JS API-д 200-аар ирсэн ArcGIS `error.code` ч `httpStatus`-д буудаг тул 498/499 (токен) энд нэмэгдэнэ.
 */
const DEFINITE_HTTP = new Set([400, 401, 403, 404]);
const DEFINITE_API = new Set([400, 401, 403, 404, 498, 499]);
export function isLostWrite(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  /* ⚠️ 2026-10-09 (аудит №6): ороосон алдаа (`bagtsSheet.applyUpdates`-ийн «{0}/{1} мөр хадгалагдав» — энгийн
     `Error`) эх алдааны ангиллыг `lost: true`-гээр дамжуулна — эс бөгөөс хариу алдагдсан chunk «тодорхой татгалзал» болно */
  if ((e as { lost?: unknown } | null)?.lost === true) return true;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError' || name === 'request:timeout') return true;
  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): JS API-ийн `request:server` — толгойн ⚠️ */
  if (name === 'request:server') {
    const st = Number((e as { details?: { httpStatus?: unknown } }).details?.httpStatus ?? 0) || 0;
    return st === 0 || !DEFINITE_API.has(st);
  }
  if (!(e instanceof ArcGISError) || e.code != null || e.sessionExpired) return false;
  return e.status == null || !DEFINITE_HTTP.has(e.status);
}
