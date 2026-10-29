import { ArcGISError } from './query';

/**
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ тасрах ·
 * HTTP 5xx · JSON биш хариу). Серверийн ТОДОРХОЙ татгалзал ЭНД орохгүй — тэр үед юу ч
 * бичигдээгүй: ArcGIS `error.code` (498/499 токен — `sessionExpired` ч мөн, 400 …), HTTP
 * 400/401/403/404, мөрийн `success:false` (`rollbackOnFailure` буцаасан).
 */
const DEFINITE_HTTP = new Set([400, 401, 403, 404]);
const DEFINITE_API = new Set([400, 401, 403, 404, 498, 499]);
export function isLostWrite(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if ((e as { lost?: unknown } | null)?.lost === true) return true;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError' || name === 'request:timeout') return true;
  if (name === 'request:server') {
    const st = Number((e as { details?: { httpStatus?: unknown } }).details?.httpStatus ?? 0) || 0;
    return st === 0 || !DEFINITE_API.has(st);
  }
  if (!(e instanceof ArcGISError) || e.code != null || e.sessionExpired) return false;
  return e.status == null || !DEFINITE_HTTP.has(e.status);
}
