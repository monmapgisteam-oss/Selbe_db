'use client';

/**
 * «ХУВААРЬ» ХАРАХ ХҮРЭЭ — хэн аль багцын хуваарийг ЗӨВХӨН ХАРЖ болох вэ (⚠️ 2026-10-26, хэрэглэгчийн шийдвэр).
 *
 * ДҮРЭМ (нэг газар — `permissions.workflowViewsOf` · `Huvaari` багцын сонгогч · `workflowSources` бүгд эндээс):
 *   хүрээ = НЭГДЭЛ(
 *     · эрхийн ТӨРЛИЙН «Хуваарь харах» (`roleTypes.typeHuvaariScope`): «Бүх багц» → бүгд; «Өөрийн багц» → тухайн хүний
 *       ЯМАР Ч хуваарилалтын багц (гүйцэтгэлийн урсгал · хуваарь · нэмэлт ажил · обьём · дэд бүтэц); «Үгүй» → юу ч биш,
 *     · «Хуваарийн эрх»-ийн «Харагч» (`viewer`) · «Зохиогч» · «Батлагч» багцууд )
 *   хатуу super → бүгд. «Ерөнхий захирал» төрлийнхөө утгыг дагана.
 *
 * ⚠️ ЗӨВХӨН ХАРАХ: энэ хүрээ ЗАСАХ/ИЛГЭЭХ/БАТЛАХ/МӨР НЭМЭХ эрх ОЛГОХГҮЙ — тэдгээр нь `huvaariScope(…, 'author'|'approver')`
 *    ба `addRow`-оор хэвээр (`Huvaari.canEditRole` · `canApprove` · `canAddRow`, lib-ийн `submitPlan` · `decidePlan`).
 * ⚠️ FAIL-CLOSED: ACL-ууд remote уншигдаагүй бол хүрээ нь `[]` (`scopedAcl.effective`), төрлийн загвар синкээс өмнө нарийн
 *    (`roleTypes.tplOf`), `roleOf` override-ыг remote-гүйгээр үл тооцно.
 * ⚠️ Энэ модуль ачаалагдахдаа `permissions`-д уншигч бүртгэнэ (`_setHuvaariViewReader`) — `permissions` ACL-уудыг ЗӨВХӨН
 *    динамикаар ачаалдаг тул статик тойрог импорт үүсгэхгүй.
 */

import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { _setHuvaariViewReader, roleOf } from './permissions';
import { typeHuvaariScope, type HvScope } from './roleTypes';
import { huvaariScope } from './huvaariAcl';
import { ajilScope } from './ajilAcl';
import { obyemScope } from './obyemAcl';
import { butetsScope } from './butetsAcl';
import { bagtsScope } from './guitsetgelAcl';
import { bagtsKey, roleForUser } from './services';

/** `null` = бүх багц; `[]` = юу ч биш; бусад — `PKG_GROUPS`-ийн дэд олонлог */
type Scope = string[] | null;

/** Хэд хэдэн хүрээний НЭГДЭЛ — аль нэг нь `null` бол бүгд */
function union(list: Scope[]): Scope {
  const out = new Set<string>();
  for (const s of list) {
    if (s === null) return null;
    for (const b of s) out.add(b);
  }
  return [...out];
}

/**
 * «ӨӨРИЙН БАГЦ» — тухайн хүний бүх хуваарилалтын багцууд (`PKG_GROUPS`-ийн нэрээр).
 * ⚠️ Дэд бүтцийн хүрээ `BUTETS_PACKS` түлхүүр («БАГЦ51») — `bagtsKey(багцын нэр)`-ээр тулгана.
 */
export function ownPkgScope(user: string): Scope {
  const bt = butetsScope(user);
  const btPkgs: Scope = bt === null ? null : PKG_GROUPS.filter((g) => bt.includes(bagtsKey(g)));
  return union([
    bagtsScope(user),
    huvaariScope(user, 'author'), huvaariScope(user, 'approver'), huvaariScope(user, 'viewer'),
    ajilScope(user, 'editor'), ajilScope(user, 'approver'),
    obyemScope(user, 'editor'), obyemScope(user, 'approver'),
    btPkgs,
  ]);
}

/**
 * Хэрэглэгчийн «Хуваарь» ХАРАХ хүрээ — толгойн дүрэм.
 * @returns `null` = бүх багц · `[]` = харах эрхгүй · `[…]` = тэдгээр багц (`PKG_GROUPS`-ийн дараалалаар)
 */
export function huvaariViewScope(user: string | null | undefined): Scope {
  if (!user) return [];
  if (roleForUser(user) === 'super') return null;
  const t: HvScope = typeHuvaariScope(roleOf(user));
  if (t === 'all') return null;
  const explicit = union([huvaariScope(user, 'viewer'), huvaariScope(user, 'author'), huvaariScope(user, 'approver')]);
  const all = t === 'own' ? union([explicit, ownPkgScope(user)]) : explicit;
  if (all === null) return null;
  /* ⚠️ Танигдахгүй (нэр солигдсон) багц хаягдана — сонгогчид ЗӨВХӨН байгаа багц */
  return PKG_GROUPS.filter((g) => all.includes(g));
}

/** Тэр багцыг харж болох уу */
export function canViewHuvaari(user: string | null | undefined, group: string): boolean {
  const s = huvaariViewScope(user);
  return s === null || s.includes(group);
}

/* ⚠️ `permissions.workflowViewsOf` — хүрээ хоосон биш бол «Хуваарь» харагдац нээгдэнэ */
_setHuvaariViewReader((u) => {
  const s = huvaariViewScope(u);
  return s === null || s.length > 0;
});
