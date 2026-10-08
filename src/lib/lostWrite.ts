import { ArcGISError } from './query';

/**
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ · JSON биш хариу ·
 * токен шинэчлэлт дууссан). Серверийн ТОДОРХОЙ татгалзал (ArcGIS `error.code`, мөрийн
 * `success:false` → `rollbackOnFailure` буцаасан) ЭНД орохгүй.
 * ⚠️ 2026-10-09: `src/modules/Huvaari.tsx`-ийн `isLostWrite`-ийг ЯГ хуулж нийтлэг болгов — Хуваарь,
 *    Ажил/Обьём батлах, хуваарийн обьём нэг дүрмээр «хариу алдагдсан = үр дүн тодорхойгүй» гэж
 *    үзнэ (хэзээ ч «юу ч бичигдээгүй» гэж үзэхгүй). `butetsEdit.isLostResponse`-тэй ижил утгатай.
 */
export function isLostWrite(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  return e instanceof ArcGISError && (e.code == null || e.sessionExpired);
}
