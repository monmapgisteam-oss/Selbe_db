'use client';

import { type KeyboardEvent as KEvt, type ReactNode, useEffect, useRef } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { PLAN_REASON_PRESETS, REASON_MAX, REASON_MIN, reasonOk } from '@/lib/huvaariBatlah';
import { useLatest } from './useLatest';
import h from '../huvaari.module.css';

/* ══════════════════ Батлах урсгалын цонх ══════════════════ */

/**
 * ИЛГЭЭХ / ШИЙДВЭРЛЭХ цонх — нэг бүрэлдэхүүн хоёуланд.
 */
export function FlowBox({
  title, desc, label, okText, rejectText, busy, err, text, onText, onPreview, onClose, onOk, onReject, summary, progress, okDisabled, presets,
}: {
  /** Буцаах цонх: түгээмэл шалтгааны товчнууд + доод урт (2026-11-23) */
  presets?: boolean;
  title: string; desc: string; label: string; okText: string;
  rejectText?: string; busy: boolean;
  progress?: string;
  okDisabled?: string;
  summary?: ReactNode;
  text: string;
  onText: (v: string) => void;
  /** Шийдвэрлэх цонхны «Урьдчилан харах» — өгөгдсөн үед л товч гарна */
  onPreview?: () => void;
  err?: string;
  onClose: () => void;
  onOk: (text: string) => void;
  onReject?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const txt = text;
  const setTxt = onText;
  const busyRef = useLatest(busy);
  const close = () => { if (!busyRef.current) onClose(); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busyRef]);
  const onEnter = (e: KEvt<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing || busy) return;
    const el = e.target as HTMLElement;
    if (el.closest('button, select, a, input')) return;
    if (el.closest('textarea') && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (onReject) {
      if (presets ? reasonOk(txt) : txt.trim()) onReject(txt);
      return;
    }
    if (presets && !reasonOk(txt)) return;
    if (okDisabled) return;
    onOk(txt);
  };
  const downOnBack = useRef(false);
  return (
    <div className={h.mdBack} role="presentation"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const ok = downOnBack.current && e.target === e.currentTarget;
        downOnBack.current = false;
        if (ok) close();
      }}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onKeyDown={onEnter}
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{title}</b>
          <button type="button" className={h.mdX} onClick={close} disabled={busy} aria-label={tr('Хаах')}>×</button>
        </header>
        <p className={h.note}>{desc}</p>
        {summary}
        {progress && busy && <p className={h.note} role="status" aria-live="polite">⏳ {progress}</p>}
        {err && <p className={h.err} role="alert">{err}</p>}
        {okDisabled && !busy && <p className={h.muted} role="status">{okDisabled}</p>}
        {presets && (
          <div className={h.reasonChips} role="group" aria-label={tr('Түгээмэл шалтгаан')}>
            {PLAN_REASON_PRESETS.map((p) => {
              const on = txt.includes(p.text);
              return (
                <button key={p.text} type="button" className={`${h.reasonChip} ${on ? h.reasonChipOn : ''}`} aria-pressed={on} disabled={busy}
                  onClick={() => setTxt(on ? txt.replace(p.text, '').replace(/\n{2,}/g, '\n').trim() : [txt.trim(), p.text].filter(Boolean).join('\n'))}>
                  {p.label()}
                </button>
              );
            })}
          </div>
        )}
        <label className={h.mdField}>
          {label}
          <textarea
            className={h.flowText}
            rows={3}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            disabled={busy}
            maxLength={REASON_MAX}
          />
        </label>
        <div className={h.mdFoot}>
          {onPreview && (
            <button type="button" className={h.discard} disabled={busy} onClick={onPreview}>
              {tr('Урьдчилан харах')}
            </button>
          )}
          <span className={h.spacer} />
          {onReject && (
            <button
              type="button"
              className={h.discard}
              disabled={busy || !(presets ? reasonOk(txt) : txt.trim())}
              title={(presets ? reasonOk(txt) : txt.trim()) ? undefined : presets ? tr('Шалтгааныг сонгох эсвэл {0}-аас доошгүй тэмдэгтээр бичнэ үү.', REASON_MIN) : tr('Буцаах шалтгааныг бичнэ үү.')}
              onClick={() => onReject(txt)}
            >
              {rejectText}
            </button>
          )}
          <button type="button" className={h.save} disabled={busy || !!okDisabled || (presets && !onReject && !reasonOk(txt))} title={okDisabled}
            onClick={() => onOk(txt)}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
