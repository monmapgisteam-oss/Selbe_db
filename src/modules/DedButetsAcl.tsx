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
 *    Мөрийн гарчиг нь нэр, хадгалагдах нь түлхүүр (`p.key`).
 *
 * ⚠️ ХӨЗӨР → ХҮСНЭГТ (2026-09-30, `GuitsetgelAcl` загвар): мөр = дэд бүтцийн
 *    багц, ганц багана «Засварлагч», нүдэнд аккаунтын чипүүд (`AclGrid`).
 *    Бичилт `aclOps.scopedCellOp('butets', …)` — «бүх багц»-аас нэгийг хасахад
 *    бусад багцын ил жагсаалт (асуухгүй, 2026-09-23-ны дүрэм хэвээр).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import {
  butetsAclReady, butetsFailedUsers, listButetsAssigns, subscribeButetsAcl, type ButetsRole,
} from '@/lib/butetsAcl';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
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
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `UserAdmin.capsLocked`-той ИЖИЛ. Remote
   *    уншигдаагүй үед `listButetsAssigns()` нь `[]` тул бүх багц «Томилоогүй»
   *    харагдаж, «Нэмэх» дарахад `setButetsGrants` тэр хүний бүх мөрийг ЗӨВХӨН
   *    энэ нэг багцаар ДАРЖ бичдэг байв (5 багцтай хүн 1 багцтай болно).
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const ready = () => remoteReady() && capsRemoteReady() && butetsAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* ⚠️ `false` буцвал ArcGIS бичилт унасан — `runOp` зурвас тавина (2026-09-23) */
  const { busy, err, setErr, run } = useAclRunner(ready);

  const addTo = (pack: string, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('butets', user, ROLE, pack, true));
  };

  /*
   * ⚠️ «БҮХ БАГЦ» (`ALL_BAGTS`) хуваарилалтаас НЭГИЙГ хасахад (2026-09-23
   *    ЗАСВАР): ALL → бусад багцын ИЛ жагсаалт болж, зөвхөн энэ багц хасагдана
   *    (асуухгүй). Урьд нь «Хэрэглэгчид» самбарын унтраалга `[ALL]`-аар асаадаг
   *    тул 16 аккаунт бүгд 25 багцад гарч, нэгээс хасахад бүгдээс хасагддаг
   *    байлаа. Дүрэм нь `aclOps.scopedCellOp` (`sys === 'butets'` → асуухгүй) —
   *    карт/матрицын `removePkgOp`-ийн `butets` салаатай ижил (2026-09-25 · 09-30).
   */
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
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <AclGrid
        corner={tr('Багц')}
        rows={BUTETS_PACKS.map((p) => ({ key: p.key, label: p.name }))}
        cols={[{ key: ROLE, label: tr('Засварлагч'), count: rows.filter((a) => a.grants.some((g) => g.role === ROLE)).length }]}
        holders={(pack) => holdersOf(pack)}
        /* ⚠️ Хоосон багц гацаа биш — засвар батлах шатгүй, зөвхөн super засна */
        stuck={() => false}
        stuckTitle={() => ''}
        candidates={(pack) => {
          const list = holdersOf(pack).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase())).map((a) => ({ value: a, label: a }));
        }}
        onAdd={(pack, _c, u) => addTo(pack, u)}
        onRemove={(pack, _c, h) => removeFrom(pack, h.user)}
        addTitle={(r) => tr('{0} — засварлагч нэмэх', r.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
        /* ⚠️ Дэд бүтцийн багцын нэр урт («Багц 5.1 — …») — эхний багана өргөн */
        rowWidth={220}
      />
    </div>
  );
}
