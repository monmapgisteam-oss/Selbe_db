'use client';

/**
 * НЭМЭЛТ АЖЛЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР.
 *
 * ⚠️ ЛОГИК НЬ `ScopedAclPanel.tsx`-Д — `HuvaariAcl` · `ObyemAcl`-тай ижил
 *    бүрэлдэхүүн, зөвхөн ЯЛГАА нь энд: үүргийн нэр, шошго, зургаан текст.
 *
 * ⚠️ ЯАГААД ЭНЭ ПАНЕЛ БАЙХ ЁСТОЙ ВЭ (2026-09-23 аудит). `ajilAcl.ts`
 *    (2026-09-22) хадгалалт ба `UserAdmin`-ы «Нэмэлт ажил батлах» унтраалга
 *    байсан ч тодорхой БАГЦ зааж өгөх хуудас БАЙХГҮЙ байв — эрхийн тайлбар
 *    «Нэмэлт ажлын эрх» хуудас руу заадаг атал тэр хуудас нь оршдоггүй.
 *    Мөн устгагдсан аккаунтын өнчин `__ajil__:` мөрийг цэвэрлэх газаргүй байлаа.
 *
 * ⚠️ БАГЦ БҮРД ХОЁР ҮҮРЭГ:
 *   · Мөр нэмэгч (`addRow`)      — «Гүйцэтгэл бөглөх» хуудсанд шинэ ажлын
 *                                   мөр нэмж, батлуулахаар илгээнэ
 *   · Батлагч   (`ajilApprove`)  — илгээгдсэнийг батлах / буцаах
 *   `ajilBatlah.decideAjil` зохиогч=батлагчийг ТАТГАЛЗДАГ тул панелийн
 *   гацааны анхааруулга энд ч хүчинтэй.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  ajilAclReady, ajilFailedUsers, listAjilAssigns, removeAjilAssign, setAjilGrants,
  subscribeAjilAcl, type AjilRole,
} from '@/lib/ajilAcl';
import { ScopedAclPanel, type AclPanelSpec } from './ScopedAclPanel';
import { removeRevokingRoles } from './ScopedAclPanel';

/**
 * ⚠️ Шошго ба зурвасыг ФУНКЦ болгож өгнө — модулийн түвшинд `tr()` дуудвал
 *    хэл солиход шинэчлэгдэхгүй (зурагдах агшинд дуудагдах ёстой).
 */
const SPEC: AclPanelSpec<AjilRole> = {
  roles: ['editor', 'approver'],
  roleLabel: (r) => (r === 'editor' ? tr('Мөр нэмэгч') : tr('Батлагч')),
  emptyLabel: (r) => (r === 'editor' ? tr('Мөр нэмэгч томилоогүй') : tr('Батлагч томилоогүй')),

  list: listAjilAssigns,
  failedUsers: ajilFailedUsers,
  subscribe: subscribeAjilAcl,
  setGrants: setAjilGrants,
  /*
   * ⚠️ `revoke=false` + зөвхөн ХАСАГДСАН үүргийн эрх (2026-09-24). Анхдагч
   *    `revoke=true` нь `syncCaps(u, [])` → энэ системийн БҮХ үүргийн эрхийг
   *    (админы гараар олгосон `addRow` г.м.) арчдаг байв. `UserAdmin.flipScoped`
   *    ба `removeRevokingRoles`-той ижил дүрэм.
   */
  remove: (user) => removeRevokingRoles(user, listAjilAssigns, (u) => removeAjilAssign(u, false),
    { editor: 'addRow', approver: 'ajilApprove' }),
  ready: ajilAclReady,

  notes: () => [
    tr('Багц тус бүрд Мөр нэмэгч ба Батлагч аккаунтыг тусад нь томилно. Нэг багцад хэдэн ч аккаунт байж болно.'),
    tr('Мөр нэмэгч «Гүйцэтгэл бөглөх» хуудсанд шинэ ажлын мөр нэмж батлуулахаар илгээнэ; батлагч зөвшөөрсний дараа л мөр үндсэн өгөгдөлд үүснэ.'),
    tr('⚠️ Гүйцэтгэлийн урсгалаас ТУСДАА: тэр нь тоог, энэ нь ажил гэрээнд байх эсэхийг шийднэ. Мөр нэмэгчийн үүрэг нь «Мөр нэмэх» эрхийг дагуулна.'),
  ],
  confirmRemoveAll: (user) =>
    tr('«{0}»-г нэмэлт ажлын хуваарилалтаас бүрэн хасах уу? «Мөр нэмэх» ба «Нэмэлт ажил батлах» эрх нь мөн буцаагдана.', user),
  stuckMsg: () =>
    tr('⚠️ Батлагч нь мөр нэмэгчтэй ижил хүн — өөрийн нэмсэн ажлыг өөрөө батлах боломжгүй тул энэ багцын нэмэлт ажил гацна. Өөр батлагч нэмнэ үү.'),
  noApproverMsg: () =>
    tr('⚠️ Батлагч томилоогүй — нэмсэн ажлыг хэн ч батлахгүй.'),
};

export function AjilAcl() {
  return <ScopedAclPanel spec={SPEC} />;
}
