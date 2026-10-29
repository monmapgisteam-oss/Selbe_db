'use client';

/**
 * ЧАНАРЫН БАРИМТЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР, ЗУРГААН ҮҮРЭГ.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { isCodeSuper, roleForUser } from '@/lib/services';
import {
  CHANAR_ROLES, chanarAclReady, chanarFailedUsers, listChanarAssigns, subscribeChanarAcl, type ChanarRole,
} from '@/lib/chanarAcl';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { reviewerClashes } from '@/lib/chanarMs';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import { portalMissing } from '@/lib/portalPresence';
import s from './guitsetgel.module.css';

/** Үүргийн шошго — зурагдах агшинд (`tr()` модулийн түвшинд хэрэглэхгүй) */
export const chanarRoleLabel = (r: ChanarRole): string => {
  if (r === 'author') return tr('Гүйцэтгэгч (ирүүлэгч)');
  if (r === 'tuh') return tr('ТУХ — инженер · менежер');
  if (r === 'chanar') return tr('Чанарын хэлтэс');
  if (r === 'tug') return tr('ТУГ — төслийн менежер (MA · NCR)');
  if (r === 'cheng') return tr('Чанарын хяналтын инженер (MA)');
  return tr('ХАБЭА');
};

export function ChanarAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => !isCodeSuper(a));
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listChanarAssigns();
  const failed = new Set(chanarFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const ready = () => remoteReady() && capsRemoteReady() && chanarAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);

  const addTo = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('chanar', user, role, group, true));
  };

  const removeFrom = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('chanar', user, role, group, false));
  };

  /** Тухайн багцад тэр үүргээр хуваарилагдсан аккаунтууд (+ «бүх багц»-аар эсэх) */
  const holdersOf = (group: string, role: string): GridHolder[] =>
    rows.flatMap((a) => {
      const held = grantHolds(a.grants, role, group);
      return held ? [{
        user: a.user,
        viaAll: held === 'all',
        gone: !known.has(a.user),
        absent: portalMissing(a.user),
        admin: roleForUser(a.user) === 'super',
        failed: failed.has(a.user),
        dirty: dirtyPerms.has(a.user),
      }] : [];
    });

  /** Багц бүрийн гацаа — нэг удаа тооцоод мөр, нүд хоёуланд */
  const state = new Map(PKG_GROUPS.map((group) => {
    const by = Object.fromEntries(CHANAR_ROLES.map((r) => [r, holdersOf(group, r).filter((h) => !h.gone && !h.absent).map((h) => h.user)])) as Record<ChanarRole, string[]>;
    const authors = by.author;
    /* Хянагчийн үүрэг тус бүрд ЗОХИОГЧООС ӨӨР хүн бий эсэх. */
    const missing: ChanarRole[] = (['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const)
      .filter((r) => authors.length > 0 && authors.some((a) => !by[r].some((u) => u !== a)));
    const clashes = reviewerClashes(by, authors);
    const noReviewer = authors.some((a) => !(['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const).some((r) => by[r].some((u) => u !== a)));
    const warn = [
      noReviewer
        ? tr('⚠️ Зохиогчоос өөр хянагч томилоогүй — энэ багцын FIC · М-актыг хэн ч шийдвэрлэж чадахгүй.')
        : missing.length > 0
          ? tr('⚠️ {0} — зохиогчоос өөр хүн томилоогүй. FIC · М-актыг бусад хянагч шийдвэрлэж чадна; үүргийг нөхөхийг зөвлөнө.', missing.map(chanarRoleLabel).join(' · '))
          : '',
      ...clashes.map((c) => tr('⚠️ Нэг хүн хоёр үүрэгт ({0}): {1} нь {2} үүргийн цорын ганц хянагч. Үүрэг тус бүрд өөр хүн томилохыг зөвлөнө.',
        c.kinds.join(', '), c.users.join(', '), c.roles.map(chanarRoleLabel).join(' · '))),
    ].filter(Boolean);
    return [group, { missing, clashed: new Set<string>(clashes.flatMap((c) => c.roles)), warn }] as const;
  }));

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Багц тус бүрд Гүйцэтгэгч ба таван хянагч (ТУХ · Чанар · ХАБЭА · ТУГ · Чанарын хяналтын инженер) аккаунтыг тусад нь томилно. Нэг үүрэгт хэдэн ч аккаунт байж болно.')}
        {' '}
        {tr('Чанарын урсгал: MA · MIR — Survey123-аар бөглөж шийдвэрлэнэ (порталд харагдана, хавсралт нэмнэ). FIC · М-акт — гүйцэтгэгч PDF оруулж, энэ багцын аль нэг хянагч (өөрийн оруулснаас бусдыг) A · AN · R шийдвэрлэнэ. Дөрвөн шат батлагдвал IPC олгоно.')}
        {' '}
        {tr('⚠️ Гүйцэтгэлийн урсгалын эрхээс ТУСДАА: энд үүрэг олгосон нь түүнийг өгөхгүй.')}
      </p>
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ хөтчид. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <AclGrid
        corner={tr('Багц')}
        rows={PKG_GROUPS.map((g) => ({ key: g, label: g, warn: state.get(g)?.warn }))}
        cols={CHANAR_ROLES.map((r) => ({
          key: r,
          label: chanarRoleLabel(r),
          count: rows.filter((a) => a.grants.some((g) => g.role === r) && known.has(a.user) && !portalMissing(a.user)).length,
        }))}
        holders={holdersOf}
        stuck={(g, role) => {
          const st = state.get(g);
          return !!st && (st.missing.includes(role as ChanarRole) || st.clashed.has(role));
        }}
        stuckTitle={(g, role) => (state.get(g)?.missing.includes(role as ChanarRole)
          ? tr('Энэ үүрэгт зохиогчоос өөр хүн томилоогүй')
          : tr('Нэг хүн хоёр үүрэгт — үүрэг тус бүрд өөр хүн томилохыг зөвлөнө'))}
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг («бүх багц»-аар ч) санал болгохгүй */
        candidates={(g, role) => {
          const list = holdersOf(g, role).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase()) && !portalMissing(a))
            .map((a) => ({ value: a, label: roleForUser(a) === 'super' ? `${a} (${tr('админ')})` : a }));
        }}
        onAdd={(g, role, u) => addTo(g, role as ChanarRole, u)}
        onRemove={(g, role, h) => removeFrom(g, role as ChanarRole, h.user)}
        addTitle={(r, c) => tr('{0} — {1}: аккаунт нэмэх', r.label, c.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}
