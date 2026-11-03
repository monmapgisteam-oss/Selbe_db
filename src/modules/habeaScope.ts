'use client';

/**
 * ХАБЭА ХАРАХ ХҮРЭЭ — гүйцэтгэгч аккаунт ЗӨВХӨН өөрийн багцын мэдээллийг харна (2026-11-03, хэрэглэгчийн хүсэлт:
 * «гүйцэтгэгч багцын аккаунтаараа нэвтрээд зөвхөн тухайн багцын мэдээллээ л харах»).
 *
 * ДҮРЭМ — «ХАБЭА-ийн бүртгэл оруулах» хуудасны «ХАБЭА — зөвхөн өөрийн багц харах» эрх (`habeaOwn`, аккаунтаар):
 *   · хатуу super · нэвтрээгүй (нэвтрэлт унтраалттай орчин) · эрхгүй → хязгааргүй (`null`)
 *   · эрхтэй → тухайн хүний БҮХ хуваарилалтын багц (`huvaariView.ownPkgScope` —
 *     гүйцэтгэлийн урсгал · хуваарь · нэмэлт ажил · обьём · дэд бүтэц). Хуваарилалтгүй бол `[]` — юу ч харахгүй (fail-closed).
 *
 * Шинэ хүснэгт/эрх нэмээгүй: багцыг «Эрх» хуудсанд аль хэдийн олгосон хуваарилалтаас уншина.
 * ⚠️ Шүүлт нь ХӨТӨЧ дээр — ArcGIS-ийн давхарга өөрөө багцаар хаагдаагүй (үйлчилгээний эрхээр бүх мөр уншигдана).
 */

import { useEffect, useMemo, useState } from 'react';
import { AUTH, roleForUser } from '@/lib/services';
import { subscribe as subscribePerms } from '@/lib/permissions';
import { subscribeTypes } from '@/lib/roleTypes';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { ownPkgScope } from '@/lib/huvaariView';
import { subscribeAcl as subscribeFlowAcl } from '@/lib/guitsetgelAcl';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { subscribeAjilAcl } from '@/lib/ajilAcl';
import { subscribeObyemAcl } from '@/lib/obyemAcl';
import { subscribeButetsAcl } from '@/lib/butetsAcl';
import { habeaPkgKey } from './habeaUzleg';

/**
 * Хэрэглэгчийн ХАБЭА-ийн багцын хүрээ — `habeaPkgKey` түлхүүрээр.
 * @returns `null` = бүх багц · `[]` = юу ч биш · `[…]` = тэдгээр багц
 */
export function habeaViewScope(user: string | null | undefined): string[] | null {
  if (!user || !AUTH.appId) return null; // нэвтрэлт унтраалттай орчинд `hasCap` үргэлж true — хязгаарлахгүй
  if (roleForUser(user) === 'super') return null;
  if (!hasCap(user, 'habeaOwn')) return null;
  const own = ownPkgScope(user);
  if (own === null) return null;
  return [...new Set(own.map((g) => habeaPkgKey(g)).filter(Boolean))];
}

/** React hook — эрх · хуваарилалт өөрчлөгдөхөд дахин бодно */
export function useHabeaScope(user: string | null | undefined): string[] | null {
  const [n, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((x) => x + 1);
    const offs = [
      subscribeCaps(f), subscribePerms(f), subscribeTypes(f), subscribeFlowAcl(f), subscribeHuvaariAcl(f),
      subscribeAjilAcl(f), subscribeObyemAcl(f), subscribeButetsAcl(f),
    ];
    return () => { for (const o of offs) o(); };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- n: эрх/хуваарилалт шинэчлэгдэхэд дахин бодно
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
