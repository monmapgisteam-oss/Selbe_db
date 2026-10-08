'use client';

/**
 * ОГНООНЫ МУЖ — «Багц» · «Компани» капсултай ИЖИЛ загвар (`multiSelect.module.css`).
 * 2026-10-08, хэрэглэгчийн хүсэлт: «огноогоор шүүх шүүлтүүр нэмье» (ХАБЭА).
 *
 * ⚠️ Төлөвгүй: `from`/`to` нь дуудагчаас (`YYYY-MM-DD`, хоосон = хязгааргүй).
 * ⚠️ Нэг тал нь хоосон байж болно — «2026-09-01-ээс хойш» гэх мэт.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import s from './multiSelect.module.css';

const EDGE = 8;
const POP_W = 260;

export function DateRangePill({ label, from, to, min, max, onChange }: {
  label: string;
  from: string;
  to: string;
  min?: string;
  max?: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    const host = wrapRef.current?.getBoundingClientRect();
    if (!b || !host) return;
    const left = Math.min(Math.max(EDGE, host.left), window.innerWidth - POP_W - EDGE);
    setPos({ left, top: b.bottom + 6 });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, close]);

  const on = Boolean(from || to);
  const fmt = (v: string) => v.replace(/-/g, '.');
  const summary = !on
    ? tr('Бүх огноо')
    : from && to
      ? (from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`)
      : from ? tr('{0}-ээс хойш', fmt(from)) : tr('{0} хүртэл', fmt(to));

  const field: React.CSSProperties = {
    font: 'inherit', fontSize: 12, width: '100%', boxSizing: 'border-box', padding: '5px 8px',
    color: 'var(--ink)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6,
  };

  return (
    <div ref={wrapRef} className={`${s.pill} ${on ? s.pillOn : ''}`}>
      <span className={s.pillLabel}>{label}</span>
      <button
        ref={btnRef}
        type="button"
        className={s.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        onClick={() => { if (open) close(false); else { place(); setOpen(true); } }}
      >
        <span className={s.summary}>{summary}</span>
        <span className={s.caret} aria-hidden>▾</span>
      </button>

      {open && pos && (
        <div
          ref={popRef}
          className={s.pop}
          role="dialog"
          aria-label={label}
          style={{ left: pos.left, top: pos.top, width: POP_W }}
        >
          <div className={s.popHead}>
            <span>{summary}</span>
            <button type="button" className={s.clear} onClick={() => onChange('', '')} disabled={!on}>
              {tr('Арилгах')}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 10px 10px' }}>
            <label style={{ display: 'grid', gap: 3, fontSize: 11, color: 'var(--ink-3)' }}>
              {tr('Эхлэх')}
              <input
                type="date" style={field} value={from} min={min} max={to || max}
                onChange={(e) => onChange(e.target.value, to)}
              />
            </label>
            <label style={{ display: 'grid', gap: 3, fontSize: 11, color: 'var(--ink-3)' }}>
              {tr('Дуусах')}
              <input
                type="date" style={field} value={to} min={from || min} max={max}
                onChange={(e) => onChange(from, e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
