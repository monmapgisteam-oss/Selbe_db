'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  listObyemAssigns, obyemAclReady, obyemFailedUsers, subscribeObyemAcl, type ObyemRole,
} from '@/lib/obyemAcl';
import { ScopedAclPanel, type AclPanelSpec } from './ScopedAclPanel';

const SPEC: AclPanelSpec<ObyemRole> = {
  sys: 'obyem',
  roles: ['editor', 'approver'],
  roleLabel: (r) => (r === 'editor' ? tr('Засварлагч') : tr('Батлагч')),
  emptyLabel: (r) => (r === 'editor' ? tr('Засварлагч томилоогүй') : tr('Батлагч томилоогүй')),

  list: listObyemAssigns,
  failedUsers: obyemFailedUsers,
  subscribe: subscribeObyemAcl,
  ready: obyemAclReady,

  notes: () => [
    tr('Багц тус бүрд Засварлагч ба Батлагч аккаунтыг тусад нь томилно. Нэг багцад хэдэн ч аккаунт байж болно.'),
    tr('Засварлагч «Гүйцэтгэл бөглөх» хуудасны «Инженерийн төлөвлөсөн обьём» баганыг засаж батлуулахаар илгээнэ; батлагч зөвшөөрсний дараа л утга үндсэн өгөгдөлд бичигдэнэ.'),
    tr('⚠️ Гүйцэтгэлийн урсгал ба хуваарийн эрхээс ТУСДАА: обьёмын үүрэг олгосон нь гүйцэтгэл зөвшөөрөх, хуваарь засах эрх өгөхгүй.'),
  ],
  stuckMsg: () =>
    tr('⚠️ Батлагч нь засварлагчтай ижил хүн — өөрийн илгээснийг өөрөө батлах боломжгүй тул энэ багцын обьёмын засвар гацна. Өөр батлагч нэмнэ үү.'),
  noApproverMsg: () =>
    tr('⚠️ Батлагч томилоогүй — илгээсэн засварыг хэн ч батлахгүй.'),
};

export function ObyemAcl() {
  return <ScopedAclPanel spec={SPEC} />;
}
