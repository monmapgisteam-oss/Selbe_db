'use client';

/**
 * ДЭД БҮТЦИЙН ЗАСВАРЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР, НЭГ ҮҮРЭГ (2026-09-23).
 *
 * ⚠️ `ScopedAclPanel`-ИЙГ ХЭРЭГЛЭХГҮЙ: тэр нь ХОЁР үүргийн (зохиогч · батлагч)
 *    хатуу бүтэцтэй — «зохиогч=батлагч гацаа», «батлагч томилоогүй»
 *    анхааруулгууд нь энд утгагүй. Дэд бүтцийн засвар шууд бичигддэг тул
 *    үүрэг ГАНЦ: Засварлагч. Мөрийн логик (`addTo` · `removeFrom`) нь
 *    `ChanarAcl`-тай ижил.
 *
 * ⚠️ БАГЦ нь `BUTETS_PACKS` (25 дэд бүтцийн багц) — `PKG_GROUPS` биш.
 *    Хөзрийн гарчиг нь нэр, хадгалагдах нь түлхүүр (`p.key`).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { ALL_BAGTS, type Grant } from '@/lib/scopedAcl';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import {
  butetsAclReady, butetsFailedUsers, listButetsAssigns, removeButetsAssign, setButetsGrants,
  subscribeButetsAcl, type ButetsRole,
} from '@/lib/butetsAcl';
import s from './guitsetgel.module.css';

const ROLE: ButetsRole = 'editor';

export function DedButetsAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeButetsAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно; super-ийг санал болгохгүй */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listButetsAssigns();
  const failed = new Set(butetsFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `UserAdmin.flipScoped`-ийн `capsLocked`-той
   *    ИЖИЛ. Remote уншигдаагүй үед `listButetsAssigns()` нь `[]` тул бүх
   *    багц «Томилоогүй» харагдаж, «Нэмэх» дарахад `setButetsGrants` тэр
   *    хүний бүх мөрийг ЗӨВХӨН энэ нэг багцаар ДАРЖ бичдэг байв (5 багцтай
   *    хүн 1 багцтай болно).
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const locked = !remoteReady() || !capsRemoteReady() || !butetsAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');

  /* ⚠️ `false` буцвал ArcGIS бичилт унасан — чимээгүй орхихгүй, зурвас тавина (2026-09-23) */
  const run = async (sync?: Promise<unknown>) => {
    if (!sync) return;
    setBusy(true);
    try {
      if ((await sync) === false) setErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
    } finally { setBusy(false); }
  };

  const addTo = (pack: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const u = user.trim().toLowerCase();
    if (!u) return;
    const cur = rows.find((a) => a.user === u);
    const grants: Grant<ButetsRole>[] = cur ? cur.grants.map((g) => ({ ...g })) : [];
    const mine = grants.find((g) => g.role === ROLE);
    if (!mine) grants.push({ role: ROLE, bagts: [pack] });
    else if (!mine.bagts.includes(ALL_BAGTS) && !mine.bagts.includes(pack)) {
      mine.bagts = [...mine.bagts, pack];
    }
    const r = setButetsGrants(u, grants);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

  const removeFrom = (pack: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const cur = rows.find((a) => a.user === user);
    if (!cur) return;
    const mine = cur.grants.find((g) => g.role === ROLE);
    if (!mine) return;
    setErr('');
    /*
     * ⚠️ «БҮХ БАГЦ» (`ALL_BAGTS`) хуваарилалтаас НЭГИЙГ хасахад (2026-09-23
     *    ЗАСВАР): урьд нь «нэг багцаас салгах боломжгүй — бүхэлд нь хасах уу?»
     *    гэж асуугаад БҮГДИЙГ нь хасдаг байв. «Хэрэглэгчид» самбарын
     *    унтраалга (`UserAdmin.flipScoped`) эрхийг `[ALL]`-аар асаадаг тул
     *    16 аккаунт бүгд 25 багцад гарч, нэгээс хасахад бүгдээс хасагдаж
     *    байлаа (хэрэглэгчийн скриншот). Одоо: ALL → бусад 24 багцын ИЛ
     *    жагсаалт болгож, зөвхөн энэ багцыг хасна.
     */
    const left = mine.bagts.includes(ALL_BAGTS)
      ? BUTETS_PACKS.map((x) => x.key).filter((k) => k !== pack)
      : mine.bagts.filter((b) => b !== pack);
    if (!left.length) {
      if (!window.confirm(tr('«{0}»-г дэд бүтцийн засварын хуваарилалтаас бүрэн хасах уу? «Инженерийн дэд бүтцийн засвар» эрх нь мөн буцаагдана.', user))) return;
      /* ⚠️ `.ok`-г шалгана — баталгаажуулалтын алдаа чимээгүй алга болохгүй */
      const rr = removeButetsAssign(user);
      setErr(rr.ok ? '' : (rr.error ?? ''));
      void run(rr.sync);
      return;
    }
    const r = setButetsGrants(user, [{ role: ROLE, bagts: left }]);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

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
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <div className={s.aclGrid}>
        {BUTETS_PACKS.map((p) => {
          const list = rows
            .filter((a) => a.grants.some((g) => g.role === ROLE
              && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(p.key))))
            .map((a) => a.user);
          const free = accounts.filter((a) => !list.includes(a.toLowerCase()));
          return (
            <div key={p.key} className={s.aclCol}>
              <div className={s.aclHead}>
                <span>{p.name}</span>
                <span className={s.aclCount}>{list.length}</span>
              </div>
              <PackBlock
                pack={p.key}
                list={list}
                free={free}
                known={known}
                failed={failed}
                dirtyPerms={dirtyPerms}
                onAdd={addTo}
                onRemove={removeFrom}
                busy={busy || locked}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackBlock({
  pack, list, free, known, failed, dirtyPerms, onAdd, onRemove, busy,
}: {
  pack: string;
  list: string[];
  free: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (pack: string, user: string) => void;
  onRemove: (pack: string, user: string) => void;
  busy: boolean;
}) {
  const [add, setAdd] = useState('');
  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{tr('Засварлагч')}</div>
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
            onClick={() => onRemove(pack, u)}
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
          onClick={() => { onAdd(pack, add); setAdd(''); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
