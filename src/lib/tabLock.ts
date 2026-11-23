/**
 * ТАБ ХООРОНДЫН ТҮГЖЭЭ (2026-11-20, аудит: «хоёр таб зэрэг синк ажиллуулбал давхар мөр үүснэ»).
 *
 * Нэг хөтчийн хэд хэдэн таб нэг синкийг ЗЭРЭГ ажиллуулахгүй — `navigator.locks`-оор ээлжлүүлнэ: дараагийн таб өмнөхийн
 * бичилт дууссаны ДАРАА шинээр уншиж ажиллана (давхар гэрээ, ижил «ХО» дугаар, давхар мөр үүсэхгүй). Өөр компьютер
 * хоорондын зэрэг ажиллагааг энэ хамгаалахгүй — тэрийг бичихийн өмнөх дахин уншилт (`hoSync`) багасгана.
 * `navigator.locks` байхгүй орчинд (Node тест, хуучин хөтөч) шууд ажиллуулна.
 */
type LockManagerLike = { request: <T>(name: string, cb: () => Promise<T>) => Promise<T> };

export function withTabLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: LockManagerLike }).locks : undefined;
  if (!locks || typeof locks.request !== 'function') return fn();
  return locks.request(`selbe:${name}`, fn);
}
