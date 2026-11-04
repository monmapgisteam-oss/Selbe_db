'use client';

/**
 * ХАБЭА ХАРАХ ХҮРЭЭ (2026-11-04) — «ХАБЭА-ийн бүртгэл оруулах» хуудасны «ХАБЭА — багцаар харах» хүснэгтэд
 * (`habeaAcl`) багц оноосон аккаунт ЗӨВХӨН тэр багцын мэдээллийг харна.
 *   · хатуу super · нэвтрэлт унтраалттай орчин · хүснэгтэд байхгүй → хязгааргүй (`null`)
 *   · хүснэгтэд байгаа → заасан багцууд
 */

import { useEffect, useMemo, useState } from 'react';
import { AUTH, roleForUser } from '@/lib/services';
import { hasHabeaViewer, habeaViewerScope, subscribeHabeaAcl } from '@/lib/habeaAcl';
import { habeaPkgKey } from './habeaUzleg';

/**
 * Хэрэглэгчийн ХАБЭА-ийн багцын хүрээ — `habeaPkgKey` түлхүүрээр.
 * @returns `null` = бүх багц · `[]` = юу ч биш · `[…]` = тэдгээр багц
 */
export function habeaViewScope(user: string | null | undefined): string[] | null {
  if (!user || !AUTH.appId) return null;
  if (roleForUser(user) === 'super') return null;
  if (!hasHabeaViewer(user)) return null;
  const own = habeaViewerScope(user);
  if (own === null) return null;
  return [...new Set(own.map((g) => habeaPkgKey(g)).filter(Boolean))];
}

/** React hook — хуваарилалт өөрчлөгдөхөд дахин бодно */
export function useHabeaScope(user: string | null | undefined): string[] | null {
  const [n, setN] = useState(0);
  useEffect(() => subscribeHabeaAcl(() => setN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- n: хуваарилалт шинэчлэгдэхэд дахин бодно
  return useMemo(() => habeaViewScope(user), [user, n]);
}

/**
 * Сонголтыг хүрээнд багтаана: хүрээгүй бол сонголт хэвээр; хүрээтэй бол сонголт ∩ хүрээ, сонголтгүй бол бүх хүрээ.
 * Хүрээ хоосон (`[]`) бол таарах боломжгүй түлхүүр — бүх шүүлт хоосон үр дүн өгнө.
 */
export const NO_PKG = '\u0000none';
export function scopePkgs(sel: readonly string[], scope: readonly string[] | null): string[] {
  if (scope === null) return [...sel];
  if (!scope.length) return [NO_PKG];
  const hit = sel.filter((k) => scope.includes(k));
  return hit.length ? hit : [...scope];
}
