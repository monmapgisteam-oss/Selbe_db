'use client';

/**
 * ХУВААРИЙН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  huvaariAclReady, huvaariFailedUsers, listHuvaariAssigns, subscribeHuvaariAcl, type PlanRole,
} from '@/lib/huvaariAcl';
import { ScopedAclPanel, type AclPanelSpec } from './ScopedAclPanel';

const SPEC: AclPanelSpec<PlanRole> = {
  sys: 'huvaari',
  roles: ['author', 'approver'],
  roleLabel: (r) => (r === 'author' ? tr('Зохиогч') : tr('Батлагч')),
  emptyLabel: (r) => (r === 'author' ? tr('Зохиогч томилоогүй') : tr('Батлагч томилоогүй')),

  list: listHuvaariAssigns,
  failedUsers: huvaariFailedUsers,
  subscribe: subscribeHuvaariAcl,
  ready: huvaariAclReady,

  notes: () => [
    tr('Багц тус бүрд Зохиогч ба Батлагч аккаунтыг тусад нь томилно. Нэг багцад хэдэн ч аккаунт байж болно.'),
    tr('Хуваарилалт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, тухайн хүн өөрийн төхөөрөмжөөс нэвтрэхэд шууд үйлчилнэ. Үүрэг олгоход харгалзах эрх ба «Хуваарь» харагдац автоматаар нээгдэж, хасахад буцаагдана.'),
    tr('⚠️ Гүйцэтгэлийн урсгалаас ТУСДАА: хуваарийн үүрэг олгосон нь гүйцэтгэл зөвшөөрөх эрх өгөхгүй.'),
  ],
  stuckMsg: () =>
    tr('⚠️ Батлагч нь зохиогчтой ижил хүн — өөрийн илгээснийг өөрөө батлах боломжгүй тул энэ багцын хуваарь гацна. Өөр батлагч нэмнэ үү.'),
  noApproverMsg: () =>
    tr('⚠️ Батлагч томилоогүй — илгээсэн хуваарийг хэн ч батлахгүй.'),
};

export function HuvaariAcl() {
  return <ScopedAclPanel spec={SPEC} />;
}
