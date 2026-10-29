'use client';

/**
 * АППЫН ДОТООД АСУУЛТ ба «БУЦААХ» МЭДЭГДЭЛИЙН ХОСТ — `@/lib/confirm`-ийн харагдах хэсэг (2026-10-23, UX аудит X1).
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  getConfirmServerSnapshot, getConfirmSnapshot, registerConfirmHost, settleConfirm, settleToast, subscribeConfirm,
  type ConfirmReq, type UndoToast,
} from '@/lib/confirm';
import { isTopFocusTrap, useFocusTrap } from '@/lib/useFocusTrap';
import s from './confirm.module.css';

export function ConfirmHost() {
  const snap = useSyncExternalStore(subscribeConfirm, getConfirmSnapshot, getConfirmServerSnapshot);
  useEffect(() => registerConfirmHost(), []);
  return (
    <>
      {snap.req && <ConfirmDialog key={snap.req.id} req={snap.req} />}
      <div className={s.toastWrap} role="status" aria-live="polite">
        {snap.toast && <UndoToastView key={snap.toast.id} t={snap.toast} />}
      </div>
    </>
  );
}

function ConfirmDialog({ req }: { req: ConfirmReq }) {
  const ref = useRef<HTMLDivElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef(0);
  const titleId = useId();
  const msgId = useId();
  const { danger, title } = req.opts;
  useFocusTrap(ref, true);
  useEffect(() => {
    openedAt.current = Date.now();
    (danger ? cancelRef : okRef).current?.focus();
  }, [danger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root || !isTopFocusTrap(root)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        settleConfirm(req.id, false);
        return;
      }
      if (e.key !== 'Enter' || e.isComposing) return;
      if (e.repeat || Date.now() - openedAt.current < 250) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const tgt = e.target instanceof Element ? e.target : null;
      if (tgt && root.contains(tgt) && tgt.closest('button')) return; // фокустай товч өөрөө ажиллана
      e.preventDefault();
      e.stopPropagation();
      settleConfirm(req.id, true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req.id]);

  return (
    <div
      className={s.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) settleConfirm(req.id, false); }}
    >
      <div
        ref={ref}
        className={`${s.card} ${danger ? s.cardDanger : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : msgId}
        aria-describedby={title ? msgId : undefined}
      >
        {title && <h2 className={s.title} id={titleId}>{title}</h2>}
        <p className={s.msg} id={msgId}>{req.message}</p>
        <div className={s.actions}>
          <button ref={cancelRef} type="button" className={s.btn} onClick={() => settleConfirm(req.id, false)}>
            {req.opts.cancel || tr('Болих')}
          </button>
          <button
            ref={okRef}
            type="button"
            className={`${s.btnOk} ${danger ? s.btnDanger : ''}`}
            onClick={() => settleConfirm(req.id, true)}
          >
            {req.opts.ok || tr('Тийм')}
          </button>
        </div>
      </div>
    </div>
  );
}

function UndoToastView({ t }: { t: UndoToast }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const left = useRef(t.ms);
  const paused = hover || focus;
  useEffect(() => {
    if (paused) return undefined;
    const start = Date.now();
    const h = setTimeout(() => settleToast(t.id, false), Math.max(0, left.current));
    return () => {
      clearTimeout(h);
      left.current -= Date.now() - start;
    };
  }, [paused, t.id]);

  return (
    <div
      className={s.toast}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
    >
      <span className={s.toastMsg}>{t.message}</span>
      <button type="button" className={s.undo} onClick={() => settleToast(t.id, true)}>
        {tr('↶ Буцаах')}
      </button>
      <button type="button" className={s.close} aria-label={tr('Хаах')} title={tr('Хаах')} onClick={() => settleToast(t.id, false)}>
        ✕
      </button>
    </div>
  );
}
