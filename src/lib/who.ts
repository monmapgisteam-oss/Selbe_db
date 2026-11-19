/**
 * ОДОО НЭВТЭРСЭН ХЭРЭГЛЭГЧ — lib-түвшний эрхийн шалгуурт.
 */
import { t as tr } from '@/lib/i18nCore';
import { hasCap, type CapKey } from './caps';
import { AUTH } from './services';
import { capLabel } from '@/modules/capText';

let current: string | null = null;

export function setCurrentUser(username: string | null | undefined): void {
  current = username ? username.trim().toLowerCase() : null;
}

export const currentUser = (): string | null => current;

/**
 * Бичилтийн хамгаалалт (`requireSuper`, `huvaariAcl.requirePlanWrite`) — ЗӨВХӨН нэгж шалгуурт унтраана
 * (`tools/test-users.mjs`): шалгуурууд нэвтэрсэн админгүйгээр хадгалах функцийг шууд дууддаг.
 */
let writeGuards = true;
export const _setWriteGuards = (on: boolean): void => { writeGuards = on; };
export const writeGuardsOn = (): boolean => writeGuards;

/** Үүргийн уншигч — `permissions.ts` ачаалагдахдаа бүртгэнэ (тойрог импортгүй) */
let roleReader: ((u: string | null) => string | null) | null = null;
export function _setWhoRoleReader(fn: (u: string | null) => string | null): void { roleReader = fn; }

/**
 * СИСТЕМИЙН АДМИН БИШ БОЛ ШИДНЭ (2026-11-19, аудит). Эрх олгох / хасах хадгалалтууд урьд нь зөвхөн админ самбарын
 * товч нуугдсанаар хамгаалагддаг байсан — функцийг шууд дуудахад хэн ч бичиж чаддаг байв. Нэвтрэлт унтраалттай
 * (локал dev) ба Node (тест, хэрэгсэл) орчинд шалгахгүй.
 */
export function requireSuper(): void {
  if (!writeGuards || typeof window === 'undefined' || !AUTH.appId) return;
  if (roleReader?.(current) === 'super') return;
  throw new Error(tr('Энэ үйлдлийг зөвхөн системийн админ хийнэ.'));
}

/** Эрхгүй бол шиднэ — дуудагч алдааг хэрэглэгчид ил харуулна. */
export function requireCap(cap: CapKey): void {
  if (typeof window === 'undefined') return;
  if (hasCap(current, cap)) return;
  throw new Error(tr('Энэ үйлдэлд эрхгүй — админаас «{0}» эрх авна уу.', capLabel(cap)));
}
