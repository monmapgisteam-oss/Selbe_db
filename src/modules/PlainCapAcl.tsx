'use client';

/**
 * ЭРХИЙГ АККАУНТААР ШУУД ОЛГОХ ХУУДАС — хуваарилалтгүй эрхийн ерөнхий панел
 * (2026-09-30).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр, 2026-09-30): «Хэрэглэгчдийн эрх удирдах» нь
 *    ЗӨВХӨН харагдац болж, картын «Нэмэлт эрх» унтраалга хасагдав. Энгийн дөрвөн
 *    эрх (Зөвшөөрөл · Санхүү — утга · Санхүү — мөр · Газар, `PLAIN_CAPS`) тус
 *    бүр өөрийн цэстэй болж, ЭНЭ панел тэднийг аккаунтын жагсаалтаар олгоно.
 * ⚠️ 2026-10-12 (хэрэглэгчийн шийдвэр): `superOnly` хэсэг («Админ (super) — шууд олгоно»)
 *    ХАСАГДСАН — хатуу super бүх эрхтэй (`caps.capsOf`), хуудас бүрд нэг бүрчлэн олгохгүй;
 *    жагсаалтад super орохгүй. Бусдад гаргалгаатай эрх энд олгогдохгүй
 *    (`aclOps.capDirectOp` татгалзана).
 * ⚠️ ТҮГЖЭЭ `QaqcAcl`-тай ИЖИЛ: `remoteReady() && capsRemoteReady()` — remote
 *    уншигдаагүй бол `[] ∪ {cap}` бичилт remote-ийн бүтэн жагсаалтыг дарна
 *    (2026-09-21). Жагсаалт нь тэр үед кэшнээс (`capsStored`) гэж ил тэмдэглэгдэнэ.
 * ⚠️ ШУУД ХАДГАЛАГДАНА (2026-08-28-ын дүрэм): ноорог биш — унтраалга дараад
 *    «Хадгалах» мартсанаас эрх ажиллаагүй гомдол гарч байсан.
 * ⚠️ Бичилт `aclOps.capDirectOp` → `caps.toggleCap` — унасан бол `dirtyCapKeys`
 *    тэмдэг ба «Дахин синк» («Хэрэглэгчдийн эрх удирдах»).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  capsOf, capsRemoteReady, capsStored, dirtyCapKeys, subscribeCaps, type CapKey,
} from '@/lib/caps';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { roleForUser } from '@/lib/services';
import { capDirectOp } from '@/lib/aclOps';
import { useAclRunner } from './useAclRunner';
import { capLabel, capNote } from './capText';
import s from './guitsetgel.module.css';

export function PlainCapAcl({ cap }: { cap: CapKey }) {
  const [, tick] = useState(0);
  useEffect(() => subscribeCaps(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);
  const [add, setAdd] = useState('');

  const ready = () => remoteReady() && capsRemoteReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);
  const off = locked || busy;

  /* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно (`QaqcAcl`-ийн ⚠️).
     ⚠️ 2026-10-12: super жагсаалтад ОРОХГҮЙ — бүх эрх нь кодоос (`caps.capsOf`). */
  const users = listUsers()
    .map((u) => u.username)
    .filter((u) => roleForUser(u) !== 'super');
  /* ⚠️ Remote-гүй бол кэш (`capsStored`) — `capsOf` [] тул худал «эрхгүй» дүр зурна (2026-09-21) */
  const has = (u: string): boolean => (locked ? capsStored(u) : capsOf(u)).includes(cap);
  const holders = users.filter(has);
  const free = users.filter((u) => !has(u));
  const dirtyCaps = new Set(dirtyCapKeys());
  const dirtyPerms = new Set(dirtyKeys());

  const push = () => {
    if (locked) { setErr(LOCK_MSG); return; }
    const u = add;
    void run(capDirectOp(u, cap, true)).then((ok) => { if (ok) setAdd(''); });
  };

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {capNote(cap)}
        {' '}
        {tr('Аккаунт нэмэхэд эрх шууд хадгалагдана (ноорог биш), хасахад шууд буцаагдана.')}
      </p>
      <div className={s.aclGrid}>
        <div className={`${s.aclCol} ${s.aclOne}`}>
          <div className={s.aclHead}>
            <span>{capLabel(cap)}</span>
            <span className={s.aclCount}>{holders.length}</span>
          </div>
          <div className={s.aclEmpty}>{tr('шууд хадгалагдана')}</div>

          <div className={s.aclAdd}>
            <select
              className={s.aclInput}
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              disabled={off || free.length === 0}
              aria-label={tr('Аккаунт сонгох…')}
            >
              {/* ⚠️ 2026-10-23 (UX аудит A2): хоосон бол ЯАГААД — шинэ (хадгалаагүй) аккаунт энд гарахгүй */}
              <option value="">{free.length ? tr('Аккаунт сонгох…') : tr('Чөлөөтэй аккаунт алга — шинэ аккаунтыг эхлээд «Хадгалах» дарна уу')}</option>
              {free.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" className={s.aclBtn} onClick={push} disabled={off || !add.trim()}>
              {tr('Нэмэх')}
            </button>
          </div>
          {locked && (
            <div className={s.aclErr} role="alert">
              {LOCK_MSG} {tr('Доорх жагсаалт энэ хөтчийн түр санах ойноос.')}
            </div>
          )}
          {err && <div className={s.aclErr} role="alert">{err}</div>}

          {holders.length === 0 && <div className={s.aclEmpty}>{tr('Аккаунт хуваарилаагүй')}</div>}
          {holders.map((u) => (
            <div key={u} className={s.aclUser}>
              <span className={s.aclName} title={u}>{u}</span>
              {dirtyCaps.has(u.toLowerCase()) && (
                <span className={s.aclErr} title={tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид')}>⚠️</span>
              )}
              {dirtyPerms.has(u.toLowerCase()) && (
                <span className={s.aclErr} title={tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин илгээх»')}>⚠️</span>
              )}
              <button
                type="button"
                className={s.aclX}
                title={tr('Эрхийг хасах')}
                aria-label={`${tr('Эрхийг хасах')}: ${u}`}
                disabled={off}
                onClick={() => {
                  if (locked) { setErr(LOCK_MSG); return; }
                  void run(capDirectOp(u, cap, false));
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
