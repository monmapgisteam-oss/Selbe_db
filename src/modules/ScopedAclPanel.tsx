'use client';

/**
 * БАГЦААР ЭРХ ХУВААРИЛАХ ПАНЕЛИЙН ЕРӨНХИЙ БҮРЭЛДЭХҮҮН — Хуваарь ба Обьёмын
 * ГАНЦ эх код.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from '@/lib/scopedAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { isCodeSuper, roleForUser } from '@/lib/services';
import type { ScopedSys } from '@/lib/aclRoleCaps';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import { portalMissing } from '@/lib/portalPresence';
import s from './guitsetgel.module.css';


/** Хуваарилалтын мөр — үүрэг бүр өөрийн багцтай */
type Row<R extends string> = { user: string; grants: Grant<R>[] };

/**
 * НЭГ ДЭД СИСТЕМИЙН ТОХИРГОО.
 */
export type AclPanelSpec<R extends string> = {
  /**
   * Аль систем — бичилт `aclOps.SCOPED_SYS[sys]`-ээр явна (2026-09-25).
   */
  sys: ScopedSys;
  /** Хоёр үүрэг — ЭХНИЙХ нь зохиогч/засварлагч, ХОЁРДАХЬ нь батлагч */
  roles: readonly [R, R];
  /** Үүргийн шошго */
  roleLabel: (r: R) => string;
  /** «Зохиогч томилоогүй» / «Засварлагч томилоогүй» — хоосон нүдний tooltip */
  emptyLabel: (r: R) => string;
  /** Хуваарилалтууд ба тэдгээрийн төлөв */
  list: () => Row<R>[];
  failedUsers: () => string[];
  subscribe: (fn: () => void) => () => void;
  /** Энэ ACL-ийн remote уншигдсан уу — түгжээнд (2026-09-24) */
  ready: () => boolean;
  /** Панелийн тайлбар — 3 догол мөр */
  notes: () => [string, string, string];
  /** Зохиогч=батлагч давхцлын анхааруулга */
  stuckMsg: () => string;
  /** Батлагч огт томилоогүйн анхааруулга */
  noApproverMsg: () => string;
};

export function ScopedAclPanel<R extends string>({ spec }: { spec: AclPanelSpec<R> }) {
  const [, tick] = useState(0);
  useEffect(() => spec.subscribe(() => tick((n) => n + 1)), [spec]);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => !isCodeSuper(a));
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = spec.list();
  const failed = new Set(spec.failedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const ready = () => remoteReady() && capsRemoteReady() && spec.ready();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);

  /**
   * НҮДЭНД ААКАУНТ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
   */
  const addTo = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp(spec.sys, user, role, group, true));
  };

  /**
   * НҮДНЭЭС ААКАУНТ ХАСАХ — тэр ҮҮРГИЙН grant-аас энэ багцыг л хасна.
   */
  const removeFrom = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp(spec.sys, user, role, group, false));
  };

  const [note1, note2, note3] = spec.notes();
  const [authorRole, approverRole] = spec.roles;

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
  const state = new Map(PKG_GROUPS.map((g) => {
    const authors = holdersOf(g, authorRole).filter((h) => !h.gone && !h.absent).map((h) => h.user);
    const approvers = holdersOf(g, approverRole).filter((h) => !h.gone && !h.absent).map((h) => h.user);
    const stuck = approvers.length > 0
      && authors.some((a) => !approvers.some((b) => b !== a));
    const noApprover = authors.length > 0 && approvers.length === 0;
    return [g, { stuck, noApprover }] as const;
  }));

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {note1}
        {' '}
        {note2}
        {' '}
        {note3}
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
        rows={PKG_GROUPS.map((g) => {
          const st = state.get(g);
          return {
            key: g,
            label: g,
            warn: [st?.stuck ? spec.stuckMsg() : '', st?.noApprover ? spec.noApproverMsg() : ''].filter(Boolean),
          };
        })}
        cols={spec.roles.map((r) => ({
          key: r,
          label: spec.roleLabel(r),
          count: rows.filter((a) => a.grants.some((g) => g.role === r) && known.has(a.user) && !portalMissing(a.user)).length,
        }))}
        holders={holdersOf}
        stuck={(g, role) => role === approverRole && !!(state.get(g)?.stuck || state.get(g)?.noApprover)}
        stuckTitle={(g, role) => (state.get(g)?.noApprover ? spec.emptyLabel(role as R) : spec.stuckMsg())}
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг («бүх багц»-аар ч) санал болгохгүй */
        candidates={(g, role) => {
          const list = holdersOf(g, role).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase()) && !portalMissing(a))
            .map((a) => ({ value: a, label: roleForUser(a) === 'super' ? `${a} (${tr('админ')})` : a }));
        }}
        onAdd={(g, role, u) => addTo(g, role as R, u)}
        onRemove={(g, role, h) => removeFrom(g, role as R, h.user)}
        addTitle={(r, c) => tr('{0} — {1}: аккаунт нэмэх', r.label, c.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}
