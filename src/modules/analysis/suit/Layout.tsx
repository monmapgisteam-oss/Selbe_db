'use client';

import {
  useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import { clamp } from '@/lib/analysis/score';
import { COLLAPSE_KEY, PANEL_KEY, readSet } from './model';
import s from '../suitability.module.css';

/* ══════════════════ Бүрхүүл + чирж өргөсгөх ══════════════════ */

const PANEL_MIN = 220, PANEL_MAX = 620;
const DEFAULTS = { '--left-w': '330px', '--right-w': '330px' } as const;

export function Shell({ left, map, right }: { left: ReactNode; map: ReactNode; right: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Хадгалсан өргөнийг сэргээх
  useEffect(() => {
    if (!shell.current) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') as Record<string, string>;
      for (const [k, v] of Object.entries(saved)) shell.current.style.setProperty(k, v);
    } catch { /* хадгалсан утга гэмтсэн бол анхныг нь ашиглана */ }
  }, []);

  const save = () => {
    if (!shell.current) return;
    const o: Record<string, string> = {};
    for (const k of Object.keys(DEFAULTS)) {
      const v = shell.current.style.getPropertyValue(k);
      if (v) o[k] = v;
    }
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(o)); } catch { /* private mode */ }
  };

  const start = (cssVar: string, side: 'left' | 'right') => (e: ReactPointerEvent<HTMLDivElement>) => {
    const host = shell.current;
    if (!host) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    setDragging(cssVar);

    const startX = e.clientX;
    const startW = parseFloat(getComputedStyle(host).getPropertyValue(cssVar))
      || parseFloat(DEFAULTS[cssVar as keyof typeof DEFAULTS]);

    // зүүн талбар: баруун тийш чирвэл өргөсөх; баруун талбар: эсрэгээр
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * (side === 'left' ? 1 : -1);
      host.style.setProperty(cssVar, `${Math.round(clamp(startW + dx, PANEL_MIN, PANEL_MAX))}px`);
    };
    const up = () => {
      setDragging(null);
      bar.releasePointerCapture(e.pointerId);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      save();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };

  const reset = (cssVar: string) => () => {
    shell.current?.style.setProperty(cssVar, DEFAULTS[cssVar as keyof typeof DEFAULTS]);
    save();
  };

  return (
    <main ref={shell} className={s.shell}>
      <aside className={`${s.panel} ${s.left}`}>{left}</aside>
      <div
        className={`${s.resizer} ${dragging === '--left-w' ? s.resizerActive : ''}`}
        title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
        onPointerDown={start('--left-w', 'left')}
        onDoubleClick={reset('--left-w')}
      />
      {/* ⚠️ Чирэх үед зураг заагчийг барихгүй — эс бөгөөс ArcGIS чирэлтийг таслана.
          `position: relative` нь дэлгэрэнгүй картын байрлуулах эцэг. */}
      <div
        className={dragging ? s.noPointer : undefined}
        style={{ position: 'relative', minWidth: 0, minHeight: 0 }}
      >
        {map}
      </div>
      <div
        className={`${s.resizer} ${dragging === '--right-w' ? s.resizerActive : ''}`}
        title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
        onPointerDown={start('--right-w', 'right')}
        onDoubleClick={reset('--right-w')}
      />
      <aside className={`${s.panel} ${s.right}`}>{right}</aside>
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

  // ⚠️ Зөвхөн эффект дотор: localStorage нь статик экспортын үед байхгүй.
  //    Хадгалсан жагсаалт байхгүй бол `startOff` хэвээр үлдэнэ.
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === null) return;
    setOff(readSet().has(key));
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
        {collapsible && <span className={s.caret}>▼</span>}
      </h2>
      <div className={s.body}>{children}</div>
    </section>
  );
}
