'use client';

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef,
  type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { GRIP_TITLE } from './ResizableTable';
import st from './resizableColumns.module.css';

/* --------------------------------------------------------------------------
   ЧИРЖ ӨРГӨСГӨДӨГ 3 БАГАНА (2026-10-23: Environment — `ui/resizable-columns.tsx`-ийн хуулбар)

   Газрын зурагтай харагдац: зүүн (давхаргын жагсаалт) · төв (газрын зураг) · баруун (самбар).
   Хүүхдүүдийг ДАРААЛЛААР нь grid-ийн нүдэнд тавина — `left` өгвөл эхний хүүхэд зүүн багана,
   `right` өгвөл сүүлийнх нь баруун багана.

     · Өргөн нь CSS хувьсагчид (`--col-l`, `--col-r`) сууна — чирэх явцад React дахин зурахгүй
       (ArcGIS зураг анивчихгүй, `SplitGrip`-ийн ижил зарчим).
     · `localStorage`-д (`selbe.cols.<id>`) хадгална — бүх хандалт try/catch (хувийн горимд ШИДДЭГ).
     · Давхар товшилт анхны өргөнд буцаана; сум (Shift — 4×) · Home/End — гараар.
     · Хувьсагчийг ЗУРАГДАЛТААС ӨМНӨ (`useLayoutEffect`) тавина — эхний кадр үсрэхгүй.
     · Багана СҮҮЛД нэмэгдэж/алга болж болно (каталог хаагдах/нээгдэх): `def`-ээс дутуу талыг
       нөхнө, алга болсон талыг цэвэрлэнэ — эс бөгөөс grid-ийн загвар хүчингүй болж нурна.
     · `--col-r-floor` (дуудагч өгнө) — баруун баганын ДООД хязгаар (жиш. «Ерөнхий төлөвлөгөө»-нд
       2+ багц сонгоход самбар автоматаар өргөсдөг — `Portal.planGroups`).
     · Баганууд ЗӨВХӨН 1180px-ээс өргөн дэлгэцэд зэрэгцэнэ; нарийнд нэг багана, бариулгүй. */

/** Багана хэтэрхий нарийсвал доторх нэр, диаграм уншигдахаа болино */
const MIN = 180;
/** Төв хэсэгт (газрын зураг) үлдэх ёстой хамгийн бага өргөн */
const CENTER_MIN = 300;
const LS = 'selbe.cols.';

type Side = 'left' | 'right';
type Sizes = { left?: number; right?: number };

/** Хадгалсан утгын ХЭЛБЭРИЙГ шалгана (`SplitGrip.parseSides`-ийн ижил дүрэм — итгэж болохгүй эх) */
function readSaved(id: string, legacy?: { left?: string; right?: string }): Sizes {
  const out: Sizes = {};
  try {
    const raw = localStorage.getItem(LS + id);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of ['left', 'right'] as const) {
        const n = (v as Record<string, unknown>)[k];
        if (typeof n === 'number' && Number.isFinite(n) && n >= MIN) out[k] = Math.round(n);
      }
    }
    /* Хуучин түлхүүр (`Portal`-ын `selbe-panel-width` · `selbe-catalog-width`) — нэг удаа уншиж үргэлжлүүлнэ */
    for (const k of ['left', 'right'] as const) {
      const key = legacy?.[k];
      if (out[k] != null || !key) continue;
      const n = Number(localStorage.getItem(key));
      if (Number.isFinite(n) && n >= MIN) out[k] = Math.round(n);
    }
  } catch { /* хувийн горим / эвдэрсэн JSON — анхны өргөн */ }
  return out;
}

export function ResizableColumns({
  id,
  left,
  right,
  leftMax = 560,
  rightMax = 720,
  legacy,
  className,
  style,
  children,
}: {
  /** Хадгалалтын түлхүүр — харагдац бүрд ӨӨР */
  id: string;
  /** Зүүн баганын анхны өргөн (px) — өгвөл эхний хүүхэд зүүн багана */
  left?: number;
  /** Баруун баганын анхны өргөн (px) — өгвөл сүүлийн хүүхэд баруун багана */
  right?: number;
  leftMax?: number;
  rightMax?: number;
  /** Хуучин localStorage түлхүүрүүд (нэг тоо) — шилжилтийн үед хэрэглэгчийн өргөн алдагдахгүй */
  legacy?: { left?: string; right?: string };
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const def = useMemo<Sizes>(() => ({ left, right }), [left, right]);
  const el = useRef<HTMLDivElement>(null);
  const gripL = useRef<HTMLDivElement>(null);
  const gripR = useRef<HTMLDivElement>(null);
  /** Хүссэн өргөн (хадгалагдана) */
  const size = useRef<Sizes>({});
  /** Дэлгэцэд тавигдсан (багтаасан) өргөн — чирэлт ЭНДЭЭС эхэлнэ */
  const shown = useRef<Sizes>({});
  const restored = useRef(new Set<Side>());
  const drag = useRef<{ side: Side; x: number; w: number } | null>(null);

  const maxOf = useCallback((side: Side, total: number): number => {
    const node = el.current;
    let other = 0;
    if (side === 'left' && def.right != null && node && gripR.current) {
      other = node.getBoundingClientRect().right - gripR.current.getBoundingClientRect().right;
    } else if (side === 'right' && def.left != null) {
      other = shown.current.left ?? def.left;
    }
    const cap = side === 'left' ? leftMax : rightMax;
    return Math.max(MIN, Math.min(cap, total > 0 ? total - other - CENTER_MIN : cap));
  }, [def, leftMax, rightMax]);

  /** Хүссэн өргөнийг хүрээнд багтааж CSS хувьсагч руу бичнэ */
  const apply = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const total = node.clientWidth;
    for (const side of ['left', 'right'] as const) {
      const prop = side === 'left' ? '--col-l' : '--col-r';
      const v = size.current[side];
      if (v == null) { node.style.removeProperty(prop); delete shown.current[side]; continue; }
      const w = Math.round(Math.min(Math.max(v, MIN), maxOf(side, total)));
      shown.current[side] = w;
      node.style.setProperty(prop, `${w}px`);
      (side === 'left' ? gripL : gripR).current?.setAttribute('aria-valuenow', String(w));
    }
  }, [maxOf]);

  /** Одоо ДЭЛГЭЦЭД харагдаж буй өргөн — баруун тал `--col-r-floor`-оор өргөссөн байж болох тул бариулаас хэмжинэ */
  const current = useCallback((side: Side): number => {
    const node = el.current;
    if (side === 'right' && node && gripR.current) {
      const w = node.getBoundingClientRect().right - gripR.current.getBoundingClientRect().right;
      if (w > 0) return Math.round(w);
    }
    return shown.current[side] ?? def[side] ?? MIN;
  }, [def]);

  const save = useCallback(() => {
    try { localStorage.setItem(LS + id, JSON.stringify(size.current)); } catch { /* хувийн горим */ }
  }, [id]);

  /* Зурагдалтаас өмнө: дутуу талыг сэргээх, алга болсныг цэвэрлэх (толгой) */
  useLayoutEffect(() => {
    let saved: Sizes | null = null;
    for (const side of ['left', 'right'] as const) {
      if (def[side] == null) { delete size.current[side]; restored.current.delete(side); continue; }
      if (restored.current.has(side)) continue;
      restored.current.add(side);
      saved ??= readSaved(id, legacy);
      size.current[side] = saved[side] ?? def[side];
    }
    apply();
  });

  /* Цонх өөрчлөгдөхөд дахин багтаана — хязгаар нь хүрээний өргөнөөс хамаарна */
  useEffect(() => {
    const on = () => apply();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [apply]);

  useEffect(() => () => document.body.classList.remove('resizing'), []);

  const down = useCallback((side: Side, e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    drag.current = { side, x: e.clientX, w: current(side) };
    document.body.classList.add('resizing');
    grip.dataset.on = '';
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      /* Баруун багана ЭСРЭГ чиглэлд өргөсдөг — зүүн тийш чирэхэд өргөн нэмэгдэнэ */
      const dx = ev.clientX - d.x;
      const total = el.current?.clientWidth ?? 0;
      size.current[d.side] = Math.min(Math.max(d.w + (d.side === 'left' ? dx : -dx), MIN), maxOf(d.side, total));
      apply();
    };
    let done = false;
    const up = () => {
      if (done) return;
      done = true;
      const had = drag.current;
      drag.current = null;
      document.body.classList.remove('resizing');
      delete grip.dataset.on;
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.removeEventListener('lostpointercapture', up);
      if (had) save();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    grip.addEventListener('lostpointercapture', up);
  }, [current, maxOf, apply, save]);

  /** Сум нь бариулыг ДЭЛГЭЦ дээр тэр зүгт зөөнө (чирэлттэй ижил чиглэл); Home/End — хязгаар */
  const key = useCallback((side: Side, e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const total = el.current?.clientWidth ?? 0;
    const cur = current(side);
    const sign = side === 'left' ? 1 : -1;
    let w: number;
    if (e.key === 'ArrowRight') w = cur + sign * step;
    else if (e.key === 'ArrowLeft') w = cur - sign * step;
    else if (e.key === 'Home') w = MIN;
    else if (e.key === 'End') w = maxOf(side, total);
    else return;
    e.preventDefault();
    size.current[side] = Math.min(Math.max(w, MIN), maxOf(side, total));
    apply();
    save();
  }, [current, maxOf, apply, save]);

  const reset = useCallback((side: Side) => {
    size.current[side] = def[side];
    apply();
    save();
  }, [def, apply, save]);

  const downL = useCallback((e: RPointerEvent<HTMLDivElement>) => down('left', e), [down]);
  const downR = useCallback((e: RPointerEvent<HTMLDivElement>) => down('right', e), [down]);
  const keyL = useCallback((e: RKeyboardEvent<HTMLDivElement>) => key('left', e), [key]);
  const keyR = useCallback((e: RKeyboardEvent<HTMLDivElement>) => key('right', e), [key]);
  const resetL = useCallback(() => reset('left'), [reset]);
  const resetR = useCallback(() => reset('right'), [reset]);

  const layout = def.left != null && def.right != null ? st.both
    : def.left != null ? st.onlyL
      : def.right != null ? st.onlyR
        : st.none;

  const grip = (side: Side) => (
    <div
      ref={side === 'left' ? gripL : gripR}
      className={`${st.grip} ${side === 'left' ? st.gripL : st.gripR}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? tr('Зүүн баганын өргөн') : tr('Баруун баганын өргөн')}
      aria-valuemin={MIN}
      tabIndex={0}
      title={GRIP_TITLE()}
      onPointerDown={side === 'left' ? downL : downR}
      onDoubleClick={side === 'left' ? resetL : resetR}
      onKeyDown={side === 'left' ? keyL : keyR}
    />
  );

  return (
    <div ref={el} className={`${st.cols} ${layout} ${className ?? ''}`} style={style}>
      {def.left != null && grip('left')}
      {def.right != null && grip('right')}
      {children}
    </div>
  );
}
