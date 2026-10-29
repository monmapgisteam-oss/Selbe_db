'use client';

import {
  useCallback, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react';
import { clamp } from '@/lib/analysis/score';
import { t as tr } from '@/lib/i18nCore';
import { useSyncRef } from '@/lib/useSyncRef';
import { COLLAPSE_KEY, PANEL_KEY, readSet } from './model';
import s from '../suitability.module.css';

/* ══════════════════ Бүрхүүл + чирж өргөсгөх ══════════════════ */

const PANEL_MIN = 220, PANEL_MAX = 620;
const DEFAULTS = { '--left-w': '330px', '--right-w': '330px' } as const;
/** Газрын зурагт ҮРГЭЛЖ үлдэх хамгийн бага өргөн (px) */
const MAP_MIN = 240;
/** Хоёр чирэх зураасны өргөн (CSS `.shell`-ийн `5px`) */
const GUTTERS = 10;
const SINGLE_COL_MQ = '(max-width: 1180px)';
const singleCol = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SINGLE_COL_MQ).matches;

const widthOf = (host: HTMLElement, cssVar: string): number =>
  parseFloat(host.style.getPropertyValue(cssVar) || getComputedStyle(host).getPropertyValue(cssVar))
  || parseFloat(DEFAULTS[cssVar as keyof typeof DEFAULTS]);

const maxFor = (host: HTMLElement, cssVar: string, hasRight: boolean): number => {
  const other = cssVar === '--left-w' ? '--right-w' : '--left-w';
  const otherW = other === '--right-w' && !hasRight ? 0 : widthOf(host, other);
  const room = host.clientWidth - otherW - GUTTERS - MAP_MIN;
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, room));
};

export function Shell({ left, map, right }: { left: ReactNode; map: ReactNode; right: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const hasRightRef = useRef(right != null);
  useSyncRef(hasRightRef, right != null);

  useEffect(() => {
    const fit = () => {
      const host = shell.current;
      if (!host || singleCol()) return;
      for (const k of Object.keys(DEFAULTS)) {
        if (k === '--right-w' && !hasRightRef.current) continue;
        const mx = maxFor(host, k, hasRightRef.current);
        if (widthOf(host, k) > mx) host.style.setProperty(k, `${Math.round(mx)}px`);
      }
    };
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  /**
   * Хадгалсан өргөнийг сэргээх.
   */
  useEffect(() => {
    if (!shell.current) return;
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}'); } catch { return; }
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return;
    const src = saved as Record<string, unknown>;
    for (const k of Object.keys(DEFAULTS)) {
      const v = src[k];
      if (typeof v !== 'string') continue;
      /* `330px` хэлбэрийг ЗААВАЛ шаардана — `%`, `calc`, хог мөрийг хаяна. */
      const m = /^(\d+(?:\.\d+)?)px$/.exec(v.trim());
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < PANEL_MIN || n > PANEL_MAX) continue;
      const mx = singleCol() ? n : maxFor(shell.current, k, hasRightRef.current);
      shell.current.style.setProperty(k, `${Math.round(Math.min(n, mx))}px`);
    }
  }, []);

  const save = useCallback(() => {
    if (!shell.current) return;
    const o: Record<string, string> = {};
    for (const k of Object.keys(DEFAULTS)) {
      const v = shell.current.style.getPropertyValue(k);
      if (v) o[k] = v;
    }
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(o)); } catch { /* private mode */ }
  }, []);

  const start = useCallback((cssVar: string, side: 'left' | 'right', e: ReactPointerEvent<HTMLDivElement>) => {
    const host = shell.current;
    if (!host) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    setDragging(cssVar);

    const startX = e.clientX;
    const startW = widthOf(host, cssVar);
    const mx = maxFor(host, cssVar, hasRightRef.current);

    // зүүн талбар: баруун тийш чирвэл өргөсөх; баруун талбар: эсрэгээр
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * (side === 'left' ? 1 : -1);
      host.style.setProperty(cssVar, `${Math.round(clamp(startW + dx, PANEL_MIN, mx))}px`);
    };
    let done = false;
    const up = () => {
      if (done) return;
      done = true;
      setDragging(null);
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      bar.removeEventListener('lostpointercapture', up);
      save();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    bar.addEventListener('lostpointercapture', up);
  }, [save]);

  const keyMove = useCallback((cssVar: string, side: 'left' | 'right', e: ReactKeyboardEvent<HTMLDivElement>) => {
    const host = shell.current;
    if (!host) return;
    const step = e.shiftKey ? 64 : 16;
    const sgn = side === 'left' ? 1 : -1;
    const mx = maxFor(host, cssVar, hasRightRef.current);
    const w0 = widthOf(host, cssVar);
    let w: number;
    if (e.key === 'ArrowRight') w = w0 + sgn * step;
    else if (e.key === 'ArrowLeft') w = w0 - sgn * step;
    else if (e.key === 'Home') w = PANEL_MIN;
    else if (e.key === 'End') w = mx;
    else return;
    e.preventDefault();
    host.style.setProperty(cssVar, `${Math.round(clamp(w, PANEL_MIN, mx))}px`);
    save();
  }, [save]);

  const reset = useCallback((cssVar: string) => {
    shell.current?.style.setProperty(cssVar, DEFAULTS[cssVar as keyof typeof DEFAULTS]);
    save();
  }, [save]);

  const startL = useCallback((e: ReactPointerEvent<HTMLDivElement>) => start('--left-w', 'left', e), [start]);
  const startR = useCallback((e: ReactPointerEvent<HTMLDivElement>) => start('--right-w', 'right', e), [start]);
  const keyL = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => keyMove('--left-w', 'left', e), [keyMove]);
  const keyR = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => keyMove('--right-w', 'right', e), [keyMove]);
  const resetL = useCallback(() => reset('--left-w'), [reset]);
  const resetR = useCallback(() => reset('--right-w'), [reset]);

  return (
    <main ref={shell} className={`${s.shell} ${right == null ? s.shellNoRight : ''}`}>
      <aside className={`${s.panel} ${s.left}`}>{left}</aside>
      <div
        className={`${s.resizer} ${dragging === '--left-w' ? s.resizerActive : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={tr('Самбарын өргөн')}
        tabIndex={0}
        title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
        onPointerDown={startL}
        onDoubleClick={resetL}
        onKeyDown={keyL}
      />
      <div
        className={dragging ? s.noPointer : undefined}
        style={{ position: 'relative', minWidth: 0, minHeight: 0 }}
      >
        {map}
      </div>
      {/* Баруун багана ХООСОН (null) бол баганыг ч, чирэгчийг ч нуулгана —
          жишээ «Симуляц» горимд самбар зүүн тийш шилжсэн тул баруун хоосорно. */}
      {right != null && (
        <>
          <div
            className={`${s.resizer} ${dragging === '--right-w' ? s.resizerActive : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label={tr('Самбарын өргөн')}
            tabIndex={0}
            title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
            onPointerDown={startR}
            onDoubleClick={resetR}
            onKeyDown={keyR}
          />
          <aside className={`${s.panel} ${s.right}`}>{right}</aside>
        </>
      )}
    </main>
  );
}

/* ══════════════════ Карт (хураадаг) ══════════════════ */

export function Card({
  title, children, pill, action, collapsible, grow, id, startOff,
}: {
  title: string;
  children: ReactNode;
  pill?: string;
  action?: ReactNode;
  collapsible?: boolean;
  grow?: boolean;
  id?: string;
  /** Анхнаасаа хураагдсан байх эсэх (хадгалсан сонголт үүнийг дарна) */
  startOff?: boolean;
}) {
  const key = id ?? title;
  const [off, setOff] = useState(!!startOff);

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === null) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOff(readSet().has(key));
    } catch { /* хувийн горим — анхдагч эвхэлт хэвээр */ }
  }, [key]);

  const toggle = () => {
    const next = !off;
    setOff(next);
    const set = readSet();
    if (next) set.add(key); else set.delete(key);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  };

  return (
    <section className={`${s.card} ${grow ? s.grow : ''} ${collapsible ? s.collapsible : ''} ${off ? s.collapsed : ''}`}>
      <h2 onClick={collapsible ? toggle : undefined}>
        {title}
        {pill && <span className={s.pill}>{pill}</span>}
        {action}
        {collapsible && (
          <button
            type="button"
            className={s.caret}
            aria-expanded={!off}
            aria-label={off ? tr('Дэлгэх') : tr('Эвхэх')}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            ▼
          </button>
        )}
      </h2>
      <div className={s.body}>{children}</div>
    </section>
  );
}
