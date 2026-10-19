'use client';

/**
 * «СИСТЕМ ТҮР ХААХ» — удирдлагын цонх ба шар зурвас (⚠️ 2026-10-19, нийслэлийн дата төв рүү шилжүүлэх).
 *
 * ⚠️ ХЭН: `sysClose` эрхтэй (админ самбарын «Систем түр хаах» хуудаснаас аккаунтаар олгоно) эсвэл кодын super —
 *    `Portal` товчийг зөвхөн тэдэнд зурна; бичих зам өөрөө ч шалгана (`permissions.setSystemClosed` → `requireCap`).
 * ⚠️ ХААЛТ НЬ БҮХ ХҮНИЙГ ГАРГАНА — `window.confirm` ЗААВАЛ (хаах ба нээх хоёуланд). Тайлбар/хугацааг шинэчлэх нь
 *    дахин «хаах» бичилт (ижил асуулттай биш, тусдаа асуулт).
 * ⚠️ Дотор байгаа хэрэглэгчид дараагийн эрхийн шалгалтад (5 мин / таб идэвхжих) цонх гарна — шууд биш. Текстэд ил.
 * ⚠️ Хаалт клиент талд (`acl-client-only` хүлээн зөвшөөрсөн) — ArcGIS-ийн токен хүчинтэй хэвээр (05 §1).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  canBypassClosed, refreshSystemClosed, setSystemClosed, subscribe, SysStaleError, systemClosed,
} from '@/lib/permissions';
import { subscribeCaps } from '@/lib/caps';
import type { SysState } from '@/lib/permsRemote';
import { dateTime } from '@/lib/format';
import { useFocusTrap } from '@/lib/useFocusTrap';
import s from './auth.module.css';

/**
 * Одоогийн хаалтын төлөв (бүх хэрэглэгчид — эрх үл хамаарна), `null` = нээлттэй.
 * ⚠️ `systemClosed()` нь ижил агуулгад ИЖИЛ объект буцаадаг (`permissions._syncRemoteSys`) — `useSyncExternalStore`-ийн
 *    агшин тогтвортой. Эрхийн store-ийн мэдэгдлээр (`initRemote`-ийн төгсгөл) шинэчлэгдэнэ.
 */
export function useSystemClosed(): SysState | null {
  return useSyncExternalStore(subscribe, systemClosed, () => null);
}

/** Эрхийн store ба нэмэлт эрхийн (caps) мэдэгдэл хоёуланд — эрх олгогдох/хасагдахад товч шууд гарна/алга болно */
const subscribeRights = (fn: () => void): (() => void) => {
  const a = subscribe(fn);
  const b = subscribeCaps(fn);
  return () => { a(); b(); };
};

/**
 * Систем хаах/нээх эрхтэй юу — `sysClose` эрхтэй ЭСВЭЛ кодын super (`permissions.canBypassClosed`-тай ИЖИЛ дүрэм:
 * хаах эрхтэй хүн хаалттай үед ч нэвтэрнэ). ⚠️ Зөвхөн нэвтэрсэн (`signed-in`) үед — нэвтрэлт унтраалттай дев
 * орчинд `hasCap` бүгдэд үнэн тул товч гаргахгүй (бичих токен ч байхгүй).
 */
export function useCanCloseSystem(username: string | null | undefined, signedIn: boolean): boolean {
  return useSyncExternalStore(subscribeRights, () => signedIn && canBypassClosed(username), () => false);
}

/** «Хаасан: bat · 10-19 14:20» — хоосон талбарыг алгасна */
export const sysByText = (st: SysState): string =>
  [st.by, st.at > 0 ? dateTime(st.at) : ''].filter(Boolean).join(' · ');

/**
 * ШАР ЗУРВАС — систем хаалттай атлаа ЭНЭ хэрэглэгч (эрхтэй/super) дотор ажиллаж байхад; мартаж орхихоос сэргийлнэ.
 * ⚠️ `onOpen` байвал (удирдах эрхтэй) товч — удирдлагын цонхыг нээнэ.
 * ⚠️ 2026-10-19 (аудит №2): дуудагч (`Portal`) ЗӨВХӨН `canBypassClosed` хэрэглэгчид зурна — бусдад «бусдад хаалттай» худал.
 */
export function SystemClosedStrip({ onOpen }: { onOpen?: () => void }) {
  const st = useSystemClosed();
  if (!st) return null;
  const text = `⚠️ ${tr('Систем бусад хэрэглэгчдэд хаалттай')}${st.by ? ` · ${st.by}` : ''}`;
  return onOpen ? (
    <button type="button" className={s.sysStrip} onClick={onOpen} title={tr('Систем түр хаах')}>
      {text}
    </button>
  ) : (
    <div className={s.sysStrip} role="status">{text}</div>
  );
}

/** Удирдлагын цонх — `open` худал бол юу ч зурахгүй (hook-ууд дотоод бүрэлдэхүүнд) */
export function SystemCloseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SystemCloseInner onClose={onClose} />;
}

function SystemCloseInner({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const cur = useSystemClosed();
  /* ⚠️ Хаалттай бол одоогийн тайлбар/хугацаагаар эхэлнэ (шинэчлэхэд) */
  const [note, setNote] = useState(cur?.note ?? '');
  const [until, setUntil] = useState(cur?.until ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /*
   * ⚠️ 2026-10-19 (аудит): НЭЭГДЭХДЭЭ ТӨЛӨВИЙГ ШИНЭЭР УНШИНА — store-ийн төлөв 5 мин хүртэл хуучирсан байж болно
   *    (өөр эзэмшигч завсарт нээсэн/хаасан). Уншиж дуустал товч идэвхгүй (`loading`); шинэ төлөв өөр бол
   *    тайлбар/хугацааг түүгээр сольно. Уншилт унавал сүүлийн мэдэгдэж буйгаар — бичихийн өмнө дахин шалгана.
   */
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void refreshSystemClosed().then((fresh) => {
      if (!alive || fresh === undefined) return;
      setNote(fresh?.note ?? '');
      setUntil(fresh?.until ?? '');
    }).catch(() => { /* сүүлийн мэдэгдэж буй төлөв — бичихийн өмнө `expect` дахин шалгана */ }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const act = async (on: boolean, update = false) => {
    const q = !on
      ? tr('Системийг дахин нээх үү? Бүх хэрэглэгч порталд хэвийн орж чадна.')
      : update
        ? tr('Хаалтын тайлбар ба дахин нээгдэх хугацааг шинэчлэх үү?')
        : tr('Системийг хаах уу? Таныг болон админаас (super) бусад бүх хэрэглэгч «Систем түр хаагдсан» цонх харж, порталд орж чадахгүй болно. Одоо дотор байгаа хүмүүст 5 минутын дотор (эсвэл цонх идэвхжихэд) гарна — хадгалаагүй ажил нь устахгүй.');
    if (!window.confirm(q)) return;
    setBusy(true);
    setMsg(null);
    try {
      /* ⚠️ 2026-10-19 (аудит): цонхонд ХАРАГДСАН төлөв (`cur`) — бичихийн өмнө дахин уншиж зөрвөл татгалзана */
      const ok = await setSystemClosed(on, note, until, { expect: cur, update });
      if (ok) {
        setMsg({ ok: true, text: !on ? tr('Систем нээгдлээ.') : update ? tr('Шинэчлэгдлээ.') : tr('Систем хаагдлаа.') });
      } else {
        /* ⚠️ Тодорхой шалтгаан (`permsRemote.takeWriteError`) — динамик: энэ цонх Portal-ын ачаалалд орохгүй */
        const { takeWriteError } = await import('@/lib/permsRemote');
        setMsg({ ok: false, text: takeWriteError() || tr('ArcGIS-т хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') });
      }
    } catch (e) {
      if (e instanceof SysStaleError) {
        /* Шинэ төлөв store-д аль хэдийн (`useSystemClosed` дахин зурна) — талбаруудыг түүгээр сольж, юу ч бичээгүйг хэлнэ */
        setNote(e.fresh?.note ?? '');
        setUntil(e.fresh?.until ?? '');
        setMsg({ ok: false, text: tr('Төлөв өөрчлөгдсөн — шинэчиллээ. Шинэ төлөвийг шалгаад дахин сонгоно уу.') });
      } else {
        setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver}`} role="dialog" aria-modal="true" aria-labelledby="selbe-sys-ctl">
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.title} id="selbe-sys-ctl">{tr('Систем түр хаах')}</div>
        <div className={`${s.sysState} ${cur ? s.sysStateOn : ''}`} role="status">
          {cur ? (
            <>
              <strong>{tr('Систем ХААЛТТАЙ')}</strong>
              {sysByText(cur) && <> — {sysByText(cur)}</>}
              <br />
              {tr('Зөвхөн «Систем түр хаах» эрхтэй аккаунт ба админ (super) нэвтэрнэ.')}
            </>
          ) : (
            <>
              <strong>{tr('Систем нээлттэй')}</strong>
              <br />
              {tr('Хаавал бусад хэрэглэгч дараах тогтмол текстийг харна: «Системийг нийслэлийн дата төв рүү шилжүүлж байгаа тул түр хаагдсан. Түр хүлээнэ үү.»')}
            </>
          )}
        </div>

        <label className={s.sysLabel} htmlFor="selbe-sys-note">{tr('Нэмэлт тайлбар (сонголттой)')}</label>
        <textarea
          id="selbe-sys-note"
          className={s.sysInput}
          rows={3}
          maxLength={500}
          value={note}
          disabled={busy || loading}
          onChange={(e) => setNote(e.target.value)}
        />
        <label className={s.sysLabel} htmlFor="selbe-sys-until">{tr('Дахин нээгдэх хугацаа (сонголттой)')}</label>
        <input
          id="selbe-sys-until"
          className={s.sysInput}
          type="text"
          maxLength={100}
          placeholder={tr('жишээ нь: 10-20 09:00')}
          value={until}
          disabled={busy || loading}
          onChange={(e) => setUntil(e.target.value)}
        />

        {msg && <p className={msg.ok ? s.userSub : s.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

        {cur ? (
          <>
            <button type="button" className={s.btn} style={{ marginTop: 16 }} disabled={busy || loading} onClick={() => void act(false)}>
              {busy ? tr('Хадгалж байна…') : tr('Системийг нээх')}
            </button>
            <button type="button" className={s.btnGhost} disabled={busy || loading} onClick={() => void act(true, true)}>
              {tr('Тайлбар, хугацааг шинэчлэх')}
            </button>
          </>
        ) : (
          <button type="button" className={`${s.btn} ${s.sysDanger}`} style={{ marginTop: 16 }} disabled={busy || loading} onClick={() => void act(true)}>
            {busy ? tr('Хадгалж байна…') : tr('Системийг хаах')}
          </button>
        )}
        <button type="button" className={s.btnGhost} disabled={busy} onClick={onClose}>
          {/* ⚠️ 2026-10-19 (аудит): «Хаах» биш — «Системийг хаах»-тай андуурагдана */}
          {tr('Болих')}
        </button>
      </div>
    </div>
  );
}
