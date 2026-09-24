'use client';

/**
 * ЧАНАРЫН БАРИМТЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР, ДӨРВӨН ҮҮРЭГ.
 *
 * ⚠️ `ScopedAclPanel`-ИЙГ ХЭРЭГЛЭХГҮЙ (2026-09-16). Тэр нь ХОЁР үүргийн
 *    (зохиогч · батлагч) хатуу хосолсон бүтэцтэй — `roles: readonly [R, R]`,
 *    «зохиогч=батлагч гацаа» шалгуур хоёр үүрэг л мэднэ. Энд зураглалын
 *    ДӨРВӨН эгнээ: Гүйцэтгэгч ирүүлнэ, ТУХ · Чанар · ХАБЭА гурав ЗЭРЭГЦЭЭ
 *    хянана. Түүнийг хоёр үүрэгт шахвал «хэн ТУХ, хэн ХАБЭА вэ» алдагдана.
 *    Тиймээс мөрийн логик (`addTo` · `removeFrom`) нь тэр панелтэй ижил,
 *    харин үүргийн тоо ба гацааны шалгуур өөр.
 *
 * ⚠️ ГАЦААНЫ ШАЛГУУР — гурван хянагчийн АЛЬ НЭГ нь томилогдоогүй бол
 *    баримт ХЭЗЭЭ Ч батлагдахгүй (`chanarMs.resolve`: гурвуулаа зөвшөөрөх
 *    ёстой). Мөн тухайн хянагчийн үүрэгт ЗӨВХӨН зохиогч өөрөө байвал мөн
 *    гацна (`review()` зохиогч=хянагчийг татгалзана).
 *
 * ⚠️ БАГЦ ТУС БҮР ӨӨРИЙН ХӨЗӨРТЭЙ, хадгалалт нь ХЭРЭГЛЭГЧЭЭР —
 *    `ScopedAclPanel`-ийн ижил зарчим.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { ALL_BAGTS, type Grant } from '@/lib/scopedAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import {
  CHANAR_ROLES, chanarAclReady, chanarFailedUsers, listChanarAssigns, removeChanarAssign,
  setChanarGrants, subscribeChanarAcl, type ChanarRole,
} from '@/lib/chanarAcl';
import { removeRevokingRoles } from './ScopedAclPanel';
import s from './guitsetgel.module.css';

/** Үүргийн шошго — зурагдах агшинд (`tr()` модулийн түвшинд хэрэглэхгүй) */
export const chanarRoleLabel = (r: ChanarRole): string => {
  if (r === 'author') return tr('Гүйцэтгэгч (ирүүлэгч)');
  if (r === 'tuh') return tr('ТУХ — инженер · менежер');
  if (r === 'chanar') return tr('Чанарын хэлтэс');
  return tr('ХАБЭА');
};

export function ChanarAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listChanarAssigns();
  const failed = new Set(chanarFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `ScopedAclPanel`-тэй ИЖИЛ.
   *    Remote уншигдаагүй үед `rows` нь `[]` тул «Нэмэх» дарахад
   *    `setChanarGrants` тэр хүний БҮХ мөрийг нэг багцаар дарж бичнэ.
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const locked = !remoteReady() || !capsRemoteReady() || !chanarAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');

  /* ⚠️ `false` буцвал ArcGIS бичилт унасан — чимээгүй орхихгүй, зурвас тавина */
  const run = async (sync?: Promise<unknown>) => {
    if (!sync) return;
    setBusy(true);
    try {
      if ((await sync) === false) setErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
    } finally { setBusy(false); }
  };

  const addTo = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const u = user.trim().toLowerCase();
    if (!u) return;
    const cur = rows.find((a) => a.user === u);
    const grants: Grant<ChanarRole>[] = cur ? cur.grants.map((g) => ({ ...g })) : [];
    const mine = grants.find((g) => g.role === role);
    if (!mine) grants.push({ role, bagts: [group] });
    else if (!mine.bagts.includes(ALL_BAGTS) && !mine.bagts.includes(group)) {
      mine.bagts = [...mine.bagts, group];
    }
    const r = setChanarGrants(u, grants);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

  const removeFrom = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const cur = rows.find((a) => a.user === user);
    if (!cur) return;
    const mine = cur.grants.find((g) => g.role === role);
    if (!mine) return;
    if (mine.bagts.includes(ALL_BAGTS)) {
      if (!window.confirm(tr('«{0}» нь энэ үүргээр БҮХ багцад хуваарилагдсан тул нэг багцаас нь салгаж хасах боломжгүй. Энэ үүргийг нь БҮХЭЛД НЬ хасах уу?', user))) return;
    }
    setErr('');
    const left = mine.bagts.includes(ALL_BAGTS) ? [] : mine.bagts.filter((b) => b !== group);
    const grants = cur.grants
      .map((g) => (g.role === role ? { ...g, bagts: left } : g))
      .filter((g) => g.bagts.length > 0);
    if (!grants.length) {
      if (!window.confirm(tr('«{0}»-г чанарын баримтын хуваарилалтаас бүрэн хасах уу? «Чанарын баримт ирүүлэх» ба «Чанарын баримт хянах» эрх нь мөн буцаагдана.', user))) return;
      /* ⚠️ `revoke=false` + зөвхөн хасагдсан үүргийн эрх (2026-09-24) — `removeRevokingRoles` */
      const rr = removeRevokingRoles(user, listChanarAssigns, (u) => removeChanarAssign(u, false),
        { author: 'chanarAuthor', tuh: 'chanarReview', chanar: 'chanarReview', habea: 'chanarReview' });
      setErr(rr.ok ? '' : (rr.error ?? ''));
      void run(rr.sync);
      return;
    }
    const r = setChanarGrants(user, grants);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Багц тус бүрд Гүйцэтгэгч ба гурван хянагч (ТУХ · Чанар · ХАБЭА) аккаунтыг тусад нь томилно. Нэг үүрэгт хэдэн ч аккаунт байж болно.')}
        {' '}
        {tr('Гүйцэтгэгч аргачлал (MS) боловсруулж ирүүлнэ; гурван хянагч ЗЭРЭГЦЭЭ хянаж, гурвуулаа зөвшөөрвөл батлагдана, нэг нь татгалзвал буцаагдана.')}
        {' '}
        {tr('⚠️ QAQC (ITP бөглөх) ба гүйцэтгэлийн урсгалын эрхээс ТУСДАА: энд үүрэг олгосон нь тэдгээрийг өгөхгүй.')}
      </p>
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <div className={s.aclGrid}>
        {PKG_GROUPS.map((group) => {
          const usersOf = (role: ChanarRole): string[] =>
            rows
              .filter((a) => a.grants.some((g) => g.role === role
                && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(group))))
              .map((a) => a.user);
          const by = Object.fromEntries(CHANAR_ROLES.map((r) => [r, usersOf(r)])) as Record<ChanarRole, string[]>;
          const authors = by.author;
          const total = CHANAR_ROLES.reduce((n, r) => n + by[r].length, 0);
          /* Хянагчийн үүрэг тус бүрд ЗОХИОГЧООС ӨӨР хүн бий эсэх */
          const missing = (['tuh', 'chanar', 'habea'] as const)
            .filter((r) => authors.length > 0 && by[r].filter((u) => !authors.includes(u)).length === 0);

          return (
            <div key={group} className={s.aclCol}>
              <div className={s.aclHead}>
                <span>{group}</span>
                <span className={s.aclCount}>{total}</span>
              </div>
              {CHANAR_ROLES.map((role) => {
                const list = by[role];
                const free = accounts.filter((a) => !list.includes(a.toLowerCase()));
                return (
                  <RoleBlock
                    key={role}
                    group={group}
                    role={role}
                    list={list}
                    free={free}
                    known={known}
                    failed={failed}
                    dirtyPerms={dirtyPerms}
                    onAdd={addTo}
                    onRemove={removeFrom}
                    busy={busy || locked}
                  />
                );
              })}
              {missing.length > 0 && (
                <div className={s.aclErr} role="alert">
                  {tr('⚠️ {0} — зохиогчоос өөр хянагч томилоогүй. Гурван хянагч бүгд зөвшөөрөх ёстой тул энэ багцын аргачлал батлагдахгүй.', missing.map(chanarRoleLabel).join(' · '))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleBlock({
  group, role, list, free, known, failed, dirtyPerms, onAdd, onRemove, busy,
}: {
  group: string;
  role: ChanarRole;
  list: string[];
  free: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (group: string, role: ChanarRole, user: string) => void;
  onRemove: (group: string, role: ChanarRole, user: string) => void;
  busy: boolean;
}) {
  const [add, setAdd] = useState('');
  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{chanarRoleLabel(role)}</div>
      {list.length === 0 && <div className={s.aclEmpty}>{tr('Томилоогүй')}</div>}
      {list.map((u) => (
        <div key={u} className={s.aclUser}>
          <span className={s.aclName} title={u}>{u}</span>
          {!known.has(u) && <span className={s.aclEmpty} title={tr('устгагдсан аккаунт')}>⚠️</span>}
          {failed.has(u) && (
            <span className={s.aclErr} title={tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}>⚠️</span>
          )}
          {dirtyPerms.has(u) && (
            <span className={s.aclErr} title={tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»')}>⚠️</span>
          )}
          <button
            type="button"
            className={s.aclX}
            title={tr('Энэ багцаас хасах')}
            disabled={busy}
            onClick={() => onRemove(group, role, u)}
          >
            ✕
          </button>
        </div>
      ))}
      <div className={s.aclAdd}>
        <select
          className={s.aclInput}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          disabled={busy || free.length === 0}
        >
          <option value="">{free.length ? tr('Аккаунт нэмэх…') : tr('Чөлөөтэй аккаунт алга')}</option>
          {free.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          type="button"
          className={s.aclBtn}
          disabled={busy || !add.trim()}
          onClick={() => { onAdd(group, role, add); setAdd(''); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
