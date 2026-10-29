/**
 * ОДОО НЭВТЭРСЭН ХЭРЭГЛЭГЧ — lib-түвшний эрхийн шалгуурт.
 */
import { t as tr } from '@/lib/i18nCore';
import { hasCap, type CapKey } from './caps';
import { capLabel } from '@/modules/capText';

let current: string | null = null;

export function setCurrentUser(username: string | null | undefined): void {
  current = username ? username.trim().toLowerCase() : null;
}

export const currentUser = (): string | null => current;

/** Эрхгүй бол шиднэ — дуудагч алдааг хэрэглэгчид ил харуулна. */
export function requireCap(cap: CapKey): void {
  if (typeof window === 'undefined') return;
  if (hasCap(current, cap)) return;
  throw new Error(tr('Энэ үйлдэлд эрхгүй — админаас «{0}» эрх авна уу.', capLabel(cap)));
}
