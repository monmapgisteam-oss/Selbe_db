/**
 * ОДОО НЭВТЭРСЭН ХЭРЭГЛЭГЧ — lib-түвшний эрхийн шалгуурт.
 *
 * ⚠️ ЯАГААД (2026-09-17-ны аудит): бичих функцүүд (`saveZov`, `saveParcel`,
 *    `butetsEdit.*`, санхүүгийн `applyAll`) эрхээ ЗӨВХӨН UI-д (`hasCap` товч
 *    нуух) шалгадаг байв — консолоос дуудсан хэн ч ArcGIS руу бичиж чаддаг.
 *    `chanarStore` (2026-09-16) яг энэ ангиллыг lib-д зассан; энэ модуль тэр
 *    загварыг бусад бичих зам руу нэг эх сурвалжаар түгээнэ.
 *
 * ⚠️ `AuthProvider` л бичнэ (`setCurrentUser`). Нэвтрэлт унтраалттай
 *    (`AUTH.appId` хоосон) орчинд `hasCap` өөрөө `true` тул шалгуур
 *    хөгжүүлэлтийг хаахгүй.
 */
import { t as tr } from '@/lib/i18nCore';
import { hasCap, type CapKey } from './caps';

let current: string | null = null;

export function setCurrentUser(username: string | null | undefined): void {
  current = username ? username.trim().toLowerCase() : null;
}

export const currentUser = (): string | null => current;

/** Эрхгүй бол шиднэ — дуудагч алдааг хэрэглэгчид ил харуулна. */
export function requireCap(cap: CapKey): void {
  /* ⚠️ Зөвхөн ХӨТӨЧИД: хамгаалах зүйл нь хөтчийн сешн (консол). Node тест ба
     `tools/` скриптүүд админ токеноор явдаг тул энд хаахгүй. */
  if (typeof window === 'undefined') return;
  /* ⚠️ `hasCap` → `capsOf` нь remote эрх ачаалагдаагүй сешнд localStorage-ийг
     ҮЛ ТООЦНО (2026-09-21, caps.ts) — сүлжээ хаагаад локалд тарьсан эрхээр
     энэ шалгуурыг давах боломжгүй. */
  if (hasCap(current, cap)) return;
  throw new Error(tr('Энэ үйлдэлд эрхгүй — админаас «{0}» эрх авна уу.', cap));
}
