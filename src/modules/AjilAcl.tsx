'use client';

/**
 * НЭМЭЛТ АЖЛЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  ajilAclReady, ajilFailedUsers, listAjilAssigns, subscribeAjilAcl, type AjilRole,
} from '@/lib/ajilAcl';
import { ScopedAclPanel, type AclPanelSpec } from './ScopedAclPanel';

const SPEC: AclPanelSpec<AjilRole> = {
  sys: 'ajil',
  roles: ['editor', 'approver'],
  roleLabel: (r) => (r === 'editor' ? tr('Мөр нэмэгч') : tr('Батлагч')),
  emptyLabel: (r) => (r === 'editor' ? tr('Мөр нэмэгч томилоогүй') : tr('Батлагч томилоогүй')),

  list: listAjilAssigns,
  failedUsers: ajilFailedUsers,
  subscribe: subscribeAjilAcl,
  ready: ajilAclReady,

  notes: () => [
    tr('Багц тус бүрд Мөр нэмэгч ба Батлагч аккаунтыг тусад нь томилно. Нэг багцад хэдэн ч аккаунт байж болно.'),
    tr('Мөр нэмэгч «Хуваарь» хуудсанд шинэ ажлын мөр нэмж батлуулахаар илгээнэ; батлагч «Нэмэлт ажил батлах» хуудсанд зөвшөөрсний дараа л мөр үндсэн өгөгдөлд үүснэ.'),
    tr('⚠️ Гүйцэтгэлийн урсгалаас ТУСДАА: тэр нь тоог, энэ нь ажил гэрээнд байх эсэхийг шийднэ. Мөр нэмэгчийн үүрэг нь «Мөр нэмэх» эрхийг дагуулна.'),
  ],
  stuckMsg: () =>
    tr('⚠️ Батлагч нь мөр нэмэгчтэй ижил хүн — өөрийн нэмсэн ажлыг өөрөө батлах боломжгүй тул энэ багцын нэмэлт ажил гацна. Өөр батлагч нэмнэ үү.'),
  noApproverMsg: () =>
    tr('⚠️ Батлагч томилоогүй — нэмсэн ажлыг хэн ч батлахгүй.'),
};

export function AjilAcl() {
  return <ScopedAclPanel spec={SPEC} />;
}
