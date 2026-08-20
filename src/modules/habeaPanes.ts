'use client';

// ХАБЭА-гийн ПАНЕЛЬ БА КАРТЫН ХЭМЖЭЭ чирж тохируулах.
//
// Механизм нь `sheet/colWidths.tsx`-тэй ЯГ ижил зарчимтай (нэг төсөлд хоёр өөр
// хэл битгий):
//   • хэмжээг элемент бүрд биш, ЭЭЖ GRID-ийн CSS хувьсагчид хадгална —
//     `grid-template-*` өөрөө уншина;
//   • чирэх ЯВЦАД зөвхөн CSS хувьсагчийг шууд бичнэ (React state БИШ) —
//     ХАБЭА-д газрын зураг байгаа тул хөдөлгөөн бүрд дахин зурвал бариул гацна;
//   • React state + `localStorage`-д `pointerup` дээр НЭГ удаа буулгана.
//
// ⚠️ ХЭМЖИЛТ нь `getComputedStyle(...).gridTemplate*`-аас: тэр нь ТРЕК бүрийн
// БОДИТ px-ийг буцаадаг тул `fr`-ээр тодорхойлсон, хувьсагч нь хараахан
// тавигдаагүй трекийг ч зөв хэмжинэ. Ингэснээр бариул бүр зөвхөн ЭЭЖИЙНХЭЭ
// (`el.parentElement`) трекийг мэдэхэд хангалттай — тусдаа `data-*` хэрэггүй.

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';

/**
 * Бариул бүрийн тохиргоо.
 *   `css`   — ээж grid дээр бичигдэх хувьсагч
 *   `track` — тухайн хувьсагчийн эзлэх трекийн ИНДЕКС (0-ээс)
 *   `sign`  — чирэх чиглэл: бариул трекийн ХОЙНО бол +1, ӨМНӨ бол −1
 */
const PANE = {
  // `.shell` — багана ба доод зурвасын өндөр
  l: { css: '--col-l', axis: 'x', track: 0, min: 220, max: 560, sign: 1 },
  r: { css: '--col-r', axis: 'x', track: 2, min: 240, max: 620, sign: -1 },
  fin: { css: '--row-fin', axis: 'y', track: 3, min: 120, max: 560, sign: -1 },
  // `.fin` — доод зурвасын дөрвөн картын хоорондох гурван зааг
  fin1: { css: '--fin-1', axis: 'x', track: 0, min: 150, max: 900, sign: 1 },
  fin2: { css: '--fin-2', axis: 'x', track: 1, min: 150, max: 900, sign: 1 },
  fin3: { css: '--fin-3', axis: 'x', track: 2, min: 200, max: 1100, sign: 1 },
  // `.rPair` — хоёр донатын хоорондох зааг
  rp1: { css: '--rp-1', axis: 'x', track: 0, min: 110, max: 420, sign: 1 },
} as const;
export type PaneKey = keyof typeof PANE;

const LS = 'selbe.habea.panes';
const STEP = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Sizes = Partial<Record<PaneKey, number>>;

export function usePanes() {
  const [size, setSize] = useState<Sizes>({});

  // ⚠️ localStorage-ийг ЭФФЕКТЭД уншина — эхний зурагт серверийнхтэй ижил
  //    байхгүй бол hydration зөрнө.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) setSize(JSON.parse(raw) as Sizes);
    } catch {
      /* хадгалалт байхгүй/эвдэрсэн — анхны хэмжээгээр */
    }
  }, []);

  const save = useCallback((next: Sizes) => {
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch {
      /* хувийн горимд бичих боломжгүй — зөвхөн энэ сешнд үйлчилнэ */
    }
  }, []);

  // ⚠️ Хадгалахдаа ЭНД-ээс уншина: `setSize(p => { save(p); … })` гэвэл
  //    шинэчлэгч цэвэр биш болж StrictMode-д хоёр дахин ажиллана.
  const cur = useRef<Sizes>({});
  cur.current = size;

  const drag = useRef<{
    k: PaneKey; start: number; base: number; px?: number; grid: HTMLElement | null;
  } | null>(null);

  /** Ээж grid-ийн тухайн трекийн БОДИТ px — `fr`-ээр өгсөн байсан ч зөв гарна */
  const measure = (k: PaneKey, el: HTMLElement) => {
    const p = PANE[k];
    const grid = el.parentElement;
    if (!grid) return p.min;
    const cs = getComputedStyle(grid);
    const list = (p.axis === 'y' ? cs.gridTemplateRows : cs.gridTemplateColumns).split(' ');
    const px = parseFloat(list[p.track] ?? '');
    return Number.isFinite(px) ? Math.round(px) : p.min;
  };

  const commit = useCallback((k: PaneKey, px: number | null) => {
    const next = { ...cur.current };
    if (px == null) delete next[k];
    else next[k] = px;
    setSize(next);
    save(next);
  }, [save]);

  /**
   * Бариулд тавих props. Бариул нь ЗАСАХ GRID-ийн ШУУД ХҮҮХЭД байх ёстой —
   * хэмжилт ба хувьсагч бичилт хоёулаа `el.parentElement`-ээр явна.
   */
  const grip = useCallback((k: PaneKey) => {
    const p = PANE[k];
    return {
      role: 'separator' as const,
      'aria-orientation': (p.axis === 'y' ? 'horizontal' : 'vertical') as 'horizontal' | 'vertical',
      'aria-label': tr('Хэмжээ тохируулах'),
      tabIndex: 0,
      title: tr('Чирж хэмжээг тохируулна · давхар товшвол анхны хэмжээ'),
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        drag.current = {
          k,
          start: p.axis === 'y' ? e.clientY : e.clientX,
          base: measure(k, el),
          grid: el.parentElement,
        };
        el.setPointerCapture(e.pointerId);
        el.dataset.drag = '1';
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        const now = p.axis === 'y' ? e.clientY : e.clientX;
        const px = clamp(Math.round(d.base + (now - d.start) * p.sign), p.min, p.max);
        if (px === d.px) return;
        d.px = px;
        d.grid?.style.setProperty(p.css, `${px}px`);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        delete e.currentTarget.dataset.drag;
        if (d.px == null) return; // хөдөлгөөнгүй товшилт — өөрчлөлт алга
        commit(k, d.px);
      },
      // Гар хандалт: сум товчоор ±12px, Enter/Home нь анхны хэмжээ
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === 'Home') {
          e.preventDefault();
          if (cur.current[k] != null) commit(k, null);
          return;
        }
        const [less, more] = p.axis === 'y' ? ['ArrowDown', 'ArrowUp'] : ['ArrowLeft', 'ArrowRight'];
        const d = e.key === less ? -STEP : e.key === more ? STEP : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        commit(k, clamp(measure(k, e.currentTarget) + d * p.sign, p.min, p.max));
      },
      onDoubleClick: (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        if (cur.current[k] != null) commit(k, null);
      },
    };
  }, [commit]);

  /**
   * Тухайн GRID-д тавих CSS хувьсагчид. Бариул бүр өөрийн ээж grid дээр
   * бичдэг тул style-ыг ч grid тус бүрд нь ТУСАД нь өгнө.
   */
  const styleFor = useCallback((...keys: PaneKey[]) => Object.fromEntries(
    keys.filter((k) => size[k] != null).map((k) => [PANE[k].css, `${size[k]}px`]),
  ) as React.CSSProperties, [size]);

  const resetAll = useCallback(() => {
    setSize({});
    save({});
  }, [save]);

  return { styleFor, grip, resetAll, resized: Object.keys(size).length > 0 };
}
