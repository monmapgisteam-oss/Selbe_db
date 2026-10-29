'use client';

/**
 * ДАШБОАРДЫН ТАЛЫН БАГАНЫГ чирж тохируулах.
 *
 * Дашбоардууд бүгд НЭГ хэв маягтай: «зүүн картууд · газрын зураг · баруун
 * картууд». Талын өргөн нь CSS хувьсагчаар (`--side-l`, `--side-r`) өгөгддөг
 * тул бариул тэр хувьсагчийг л чирж өөрчилнө — бүрхүүлийн бүтэц, картуудын
 * дотоод байрлал огт хөндөгдөхгүй.
 *
 *   const side = useSideResize('gazar');
 *   <div className={cx(g.shell, side.hostClass)} style={side.style}>
 *     …
 *     <SplitGrip {...side.left} />
 *     <SplitGrip {...side.right} />
 *   </div>
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useSyncRef } from '@/lib/useSyncRef';
import { GRIP_TITLE } from './ResizableTable';
import st from './splitGrip.module.css';

/** Тал хэт нарийсаж/өргөсөхөөс сэргийлнэ (карт уншигдахаа болихгүй). */
const MIN = 180;
const MAX = 620;
const LS = 'selbe.side.';

export type GripProps = {
  side: 'left' | 'right';
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  dragging: boolean;
  label: string;
};

/** Чирэх бариул — заагийн байрлалыг CSS өөрөө (`--side-*`) тооцно. */
export function SplitGrip({
  side,
  onPointerDown,
  onDoubleClick,
  onKeyDown,
  dragging,
  label,
}: GripProps) {
  return (
    <button
      type="button"
      className={`${st.grip} ${side === 'left' ? st.left : st.right}${
        dragging ? ` ${st.gripOn}` : ''
      }`}
      data-split-grip={side}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={GRIP_TITLE()}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}

type Sides = { l?: number; r?: number };

/**
 * localStorage-оос уншсан утгын ХЭЛБЭРИЙГ шалгана.
 */
function parseSides(v: unknown): Sides {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const src = v as Record<string, unknown>;
  const out: Sides = {};
  for (const k of ['l', 'r'] as const) {
    const n = src[k];
    if (typeof n === 'number' && Number.isFinite(n) && n >= MIN && n <= MAX) {
      out[k] = Math.round(n);
    }
  }
  return out;
}

/**
 * @param key      localStorage-ийн түлхүүр — дашбоард бүрд ӨӨР.
 * @param hasRight Баруун тал байгаа эсэх (зарим дашбоард зөвхөн зүүнтэй).
 */
export function useSideResize(key: string, hasRight = true) {
  const [w, setW] = useState<Sides>({});
  const hostRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'l' | 'r' | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS + key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setW(parseSides(JSON.parse(raw)));
    } catch {
      /* хадгалалт байхгүй/эвдэрсэн — анхны өргөнөөр */
    }
  }, [key]);

  const cur = useRef<Sides>({});
  useSyncRef(cur, w);

  const save = useCallback(
    (next: Sides) => {
      try {
        localStorage.setItem(LS + key, JSON.stringify(next));
      } catch {
        /* хувийн горимд бичих боломжгүй — зөвхөн энэ сешнд үйлчилнэ */
      }
    },
    [key],
  );

  useEffect(() => () => document.body.classList.remove('resizing'), []);

  const drag = useRef<{ s: 'l' | 'r'; x: number; w: number; px?: number } | null>(null);

  const start = useCallback(
    (s: 'l' | 'r', e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const host = hostRef.current;
      if (!host) return;
      const varName = s === 'l' ? '--side-l' : '--side-r';
      // Эхлэх өргөнийг ХЭМЖЭЭД нь уншина: хувьсагч тавиагүй үед CSS-ийн анхны
      // утга (дэлгэцийн хэмжээнээс хамаарна) хүчинтэй байдаг.
      const w0 =
        cur.current[s] ??
        Math.round(
          parseFloat(getComputedStyle(host).getPropertyValue(varName)) || MIN,
        );
      const grip = e.currentTarget;
      drag.current = { s, x: e.clientX, w: w0 };
      grip.setPointerCapture(e.pointerId);
      setDragging(s);
      document.body.classList.add('resizing');

      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        // Баруун тал нь ЭСРЭГ чиглэлтэй: баруун тийш чирэхэд НАРИЙСНА.
        const delta = (ev.clientX - d.x) * (d.s === 'l' ? 1 : -1);
        const px = Math.min(MAX, Math.max(MIN, Math.round(d.w + delta)));
        if (px === d.px) return;
        d.px = px;
        host.style.setProperty(varName, `${px}px`);
      };
      const up = () => {
        const d = drag.current;
        drag.current = null;
        setDragging(null);
        document.body.classList.remove('resizing');
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        grip.removeEventListener('lostpointercapture', up);
        /* Чирэлтийн дараа фокус үлдээхгүй — фокусын өнгө «асаастай» мэт
           харагдахаас сэргийлнэ (гар удирдлагад фокус нь Tab-аар ирдэг тул
           энэ нь саад болохгүй) */
        grip.blur();
        if (!d || d.px == null) return; // хөдөлгөөнгүй товшилт
        const next = { ...cur.current, [d.s]: d.px };
        setW(next);
        save(next);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
      grip.addEventListener('lostpointercapture', up);
    },
    [save],
  );

  /** Анхны өргөнд нь буцаана — CSS-ийн (дэлгэцийн) утга дахин хүчинтэй болно. */
  const reset = useCallback((s: 'l' | 'r') => {
    hostRef.current?.style.removeProperty(s === 'l' ? '--side-l' : '--side-r');
    const next = { ...cur.current };
    delete next[s];
    setW(next);
    save(next);
  }, [save]);

  const bump = useCallback((s: 'l' | 'r', e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === 'Home') {
      e.preventDefault();
      reset(s);
      return;
    }
    const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!d) return;
    e.preventDefault();
    const host = hostRef.current;
    const varName = s === 'l' ? '--side-l' : '--side-r';
    const base =
      cur.current[s] ??
      (host
        ? Math.round(parseFloat(getComputedStyle(host).getPropertyValue(varName)) || MIN)
        : MIN);
    // Баруун тал эсрэг чиглэлтэй — сум нь заагийг зөөнө, өргөнийг биш.
    const px = Math.min(MAX, Math.max(MIN, base + d * (s === 'l' ? 1 : -1)));
    const next = { ...cur.current, [s]: px };
    setW(next);
    save(next);
  }, [reset, save]);

  const startL = useCallback((e: React.PointerEvent<HTMLButtonElement>) => start('l', e), [start]);
  const startR = useCallback((e: React.PointerEvent<HTMLButtonElement>) => start('r', e), [start]);
  const resetL = useCallback(() => reset('l'), [reset]);
  const resetR = useCallback(() => reset('r'), [reset]);
  const bumpL = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => bump('l', e), [bump]);
  const bumpR = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => bump('r', e), [bump]);

  const style: React.CSSProperties = {};
  if (w.l != null) (style as Record<string, string>)['--side-l'] = `${w.l}px`;
  if (w.r != null) (style as Record<string, string>)['--side-r'] = `${w.r}px`;

  return {
    hostRef,
    hostClass: st.host,
    style,
    left: {
      side: 'left' as const,
      onPointerDown: startL,
      onDoubleClick: resetL,
      onKeyDown: bumpL,
      dragging: dragging === 'l',
      label: tr('Зүүн баганын өргөн'),
    },
    right: {
      side: 'right' as const,
      onPointerDown: startR,
      onDoubleClick: resetR,
      onKeyDown: bumpR,
      dragging: dragging === 'r',
      label: tr('Баруун баганын өргөн'),
    },
    hasRight,
  };
}
