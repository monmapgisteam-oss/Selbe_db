'use client';

/**
 * ДЭД БҮТЦИЙН ЗАСВАРЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР, НЭГ ҮҮРЭГ (2026-09-23).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { isCodeSuper, roleForUser } from '@/lib/services';
import {
  butetsAclReady, butetsFailedUsers, listButetsAssigns, subscribeButetsAcl, type ButetsRole,
} from '@/lib/butetsAcl';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import { portalMissing } from '@/lib/portalPresence';
import s from './guitsetgel.module.css';

const ROLE: ButetsRole = 'editor';

export function DedButetsAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeButetsAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => !isCodeSuper(a));
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listButetsAssigns();
  const failed = new Set(butetsFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const ready = () => remoteReady() && capsRemoteReady() && butetsAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);

  const addTo = (pack: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('butets', user, ROLE, pack, true));
  };

  /** Түлхүүр → дэлгэцийн нэр (асуулт ба tooltip-д) */
  const nameOf = new Map(BUTETS_PACKS.map((p) => [p.key, p.name] as const));

  const removeFrom = (pack: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('butets', user, ROLE, pack, false, nameOf.get(pack) ?? pack));
  };

  /** Тухайн багцад засварлагчаар хуваарилагдсан аккаунтууд (+ «бүх багц»-аар эсэх) */
  const holdersOf = (pack: string): GridHolder[] =>
    rows.flatMap((a) => {
      const held = grantHolds(a.grants, ROLE, pack);
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
      <p className={s.aclNote}>
        {tr('Багц тус бүрд «Инженерийн дэд бүтэц» хуудсанд атрибут засах аккаунтыг томилно. Нэг багцад хэдэн ч аккаунт байж болно.')}
        {' '}
        {tr('Засварлагч зөвхөн өөрт хуваарилагдсан багцын давхаргыг зурагт сонгож засна; засвар шууд ArcGIS-д бичигдэнэ (батлах шатгүй).')}
        {' '}
        {tr('⚠️ Багц хуваарилаагүй бол «Инженерийн дэд бүтцийн засвар» эрхтэй ч нэг ч давхарга засахгүй. Зөвхөн super админ хязгааргүй.')}
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
        rows={BUTETS_PACKS.map((p) => ({ key: p.key, label: p.name }))}
        cols={[{ key: ROLE, label: tr('Засварлагч'), count: rows.filter((a) => a.grants.some((g) => g.role === ROLE) && known.has(a.user) && !portalMissing(a.user)).length }]}
        holders={(pack) => holdersOf(pack)}
        stuck={() => false}
        stuckTitle={() => ''}
        candidates={(pack) => {
          const list = holdersOf(pack).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase()) && !portalMissing(a))
            .map((a) => ({ value: a, label: roleForUser(a) === 'super' ? `${a} (${tr('админ')})` : a }));
        }}
        onAdd={(pack, _c, u) => addTo(pack, u)}
        onRemove={(pack, _c, h) => removeFrom(pack, h.user)}
        addTitle={(r) => tr('{0} — засварлагч нэмэх', r.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
        rowWidth={220}
      />
    </div>
  );
}
