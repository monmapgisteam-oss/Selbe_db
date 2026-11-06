'use client';

/**
 * ХАБЭА ХАРАХ БАГЦЫН ХУВААРИЛАЛТЫН ПАНЕЛ (2026-11-04) — мөр = багц, нүдэнд тэр багцыг л харах аккаунтууд.
 * `DedButetsAcl`-ийн загвар; бичилт `aclOps.scopedCellOp`-оор.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { isCodeSuper, roleForUser } from '@/lib/services';
import {
  HABEA_PKGS, habeaAclReady, habeaFailedUsers, listHabeaAssigns, subscribeHabeaAcl, type HabeaRole,
} from '@/lib/habeaAcl';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import { portalMissing } from '@/lib/portalPresence';
import s from './guitsetgel.module.css';

const ROLE: HabeaRole = 'viewer';

export function HabeaViewAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeHabeaAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => !isCodeSuper(a));
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listHabeaAssigns();
  const failed = new Set(habeaFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const ready = () => remoteReady() && capsRemoteReady() && habeaAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);

  const addTo = (pkg: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('habea', user, ROLE, pkg, true));
  };
  const removeFrom = (pkg: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('habea', user, ROLE, pkg, false));
  };

  const holdersOf = (pkg: string): GridHolder[] =>
    rows.flatMap((a) => {
      const held = grantHolds(a.grants, ROLE, pkg);
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

  return (
    <div className={s.aclWrap}>
      <h3>{tr('ХАБЭА — багцаар харах')}</h3>
      <p className={s.aclNote}>
        {tr('Багцын мөрөнд аккаунт нэмбэл тэр аккаунт ХАБЭА хуудсанд ЗӨВХӨН тэр багцын мэдээллийг харж, зөвхөн тэр багцын тайланг (PDF, Excel) татна — нэмэлт эрх хэрэггүй. Нэг аккаунтыг хэд хэдэн багцад нэмж болно.')}
        {' '}
        {tr('⚠️ Хүснэгтэд байхгүй аккаунт бүх багцыг харна: сүүлийн багцаас хасвал хязгаар арилна. Админ (super) үргэлж бүх багцыг харна.')}
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
        rows={HABEA_PKGS.map((p) => ({ key: p, label: p }))}
        cols={[{ key: ROLE, label: tr('Зөвхөн энэ багцыг харах аккаунт'), count: rows.filter((a) => a.grants.some((g) => g.role === ROLE) && known.has(a.user) && !portalMissing(a.user)).length }]}
        holders={(pkg) => holdersOf(pkg)}
        stuck={() => false}
        stuckTitle={() => ''}
        candidates={(pkg) => {
          const list = holdersOf(pkg).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase()) && !portalMissing(a) && roleForUser(a) !== 'super')
            .map((a) => ({ value: a, label: a }));
        }}
        onAdd={(pkg, _c, u) => addTo(pkg, u)}
        onRemove={(pkg, _c, h) => removeFrom(pkg, h.user)}
        addTitle={(r) => tr('{0} — аккаунт нэмэх', r.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
        rowWidth={220}
      />
    </div>
  );
}
