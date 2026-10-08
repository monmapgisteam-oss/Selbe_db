'use client';

/**
 * ХАБЭА — БАГАНЫН КАРТУУДЫН ХООРОНДОХ ХЭВТЭЭ БАРИУЛ (2026-10-07, хэрэглэгчийн хүсэлт:
 * «газрын зураг ба доод зурвасын хоорондох бариул шиг ЯГ ийм бариул чартуудын дунд»).
 *
 * Зан:
 *   · бариул бүр ДЭЭДЭХ картынхаа өндрийг өөрчилнө — бусад карт хөдлөхгүй
 *     (тухайн панелд л үйлчилнэ);
 *   · картыг ТОМРУУЛЖ болно; БАЙГАЛИЙН өндрөөс (агуулга бүтэн харагдах) доош
 *     ЖИЖИГРҮҮЛЭХГҮЙ — чарт хэзээ ч тасрахгүй, карт дотор гүйлгэлт үүсэхгүй;
 *   · давхар товшилт / Enter — анхны (байгалийн) өндөр; ↑/↓ — ±24px;
 *   · өндөр `localStorage`-д — баганын `id` · картын ДАРААЛАЛ · картын ТООГООР.
 *
 * ⚠️ ӨМНӨХ `DashSplit` (2026-10-06)-ООС ЯЛГАА: тэр нь картуудад ТЭНЦҮҮ хувь өгч
 *    байгалийн өндрөөс нь БАГА болгодог тул чарт тасарч дотор нь гүйлгэлт үүсдэг
 *    байсан — хэрэглэгч «чартууд бүтэн харагддаг байх» гэж буцаасан.
 * ⚠️ DOM дээр ажиллана: баганын агуулга нөхцөлт фрагмент ба олон карт буцаадаг
 *    бүрэлдэхүүнүүдээс бүрддэг. `Section` нь `style` prop-гүй тул энд тавьсан
 *    `height` React-ын дахин зурагт дарагдахгүй.
 * ⚠️ Багана (`target`) нь `position: relative` байх ёстой — бариулын байрлал
 *    тэр баганаас тоологдоно.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { t as tr } from '@/lib/i18nCore';
import h from './habea.module.css';

const LS = 'selbe.habea.cardh.';
const KEY_STEP = 24;

const cards = (el: HTMLElement): HTMLElement[] =>
  Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName === 'SECTION');

type Saved = Record<string, number>;
const load = (key: string): Saved => {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Saved; } catch { return {}; }
};
const save = (key: string, v: Saved) => {
  try {
    if (Object.keys(v).length) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch { /* хувийн горим — зөвхөн энэ сешнд */ }
};

/** Картын БАЙГАЛИЙН өндөр — тавьсан өндрийг түр авч хэмжинэ */
const natural = (c: HTMLElement) => {
  const prev = c.style.height;
  c.style.height = '';
  const n = c.offsetHeight;
  c.style.height = prev;
  return n;
};

/**
 * Бариулын байрлал + a11y утгууд (2026-10-09): `now` — дээд картын одоогийн өндөр,
 * `min` — байгалийн өндөр (доош жижигрүүлэхгүй), `cid` — `aria-controls`-ийн картын id.
 */
type Bar = { top: number; now: number; min: number; cid: string };
/** `aria-valuemax` — картын өндрийн дээд хязгаар (байгалийн өндрийн 4 дахин, ядаж 1200px) */
const maxOf = (min: number) => Math.max(1200, min * 4);

export function HabeaCardGrips({ target, id }: { target: RefObject<HTMLElement | null>; id: string }) {
  const [bars, setBars] = useState<Bar[]>([]);
  const dragging = useRef(false);
  /** ⚠️ 2026-10-09: идэвхтэй чирэлтийн `up` — unmount үед дуудаж `user-select`/`dragging`-ийг сэргээнэ */
  const upRef = useRef<(() => void) | null>(null);
  /** Чирэх үед байгалийн өндрийг дахин хэмжихгүй (layout thrash) — сүүлийн утгыг ашиглана */
  const minRef = useRef<number[]>([]);
  const idBase = useId();
  const keyOf = useCallback((n: number) => `${LS}${id}.${n}`, [id]);

  /** Хадгалсан өндрийг тавина — байгалийнхаас бага бол ҮЛ ТООМСОРЛОНО (агуулга өссөн байж болно) */
  const apply = useCallback((el: HTMLElement) => {
    const xs = cards(el);
    const sv = load(keyOf(xs.length));
    xs.forEach((c, i) => {
      const want = sv[i];
      c.style.height = '';
      if (want && want > natural(c)) c.style.height = `${want}px`;
    });
  }, [keyOf]);

  const measure = useCallback((el: HTMLElement) => {
    const xs = cards(el);
    /* ⚠️ 2026-10-09: `aria-controls`-д картын id — байхгүй бол тогтвортой id оноож өгнө */
    const next: Bar[] = xs.slice(0, -1).map((c, i) => {
      if (!c.id) c.id = `${idBase}-card-${i}`;
      const min = dragging.current && minRef.current[i] != null ? minRef.current[i] : natural(c);
      minRef.current[i] = min;
      return {
        top: Math.round((c.offsetTop + c.offsetHeight + xs[i + 1].offsetTop) / 2),
        now: c.offsetHeight,
        min,
        cid: c.id,
      };
    });
    setBars((prev) => (prev.length === next.length
      && prev.every((v, i) => v.top === next[i].top && v.now === next[i].now && v.min === next[i].min && v.cid === next[i].cid)
      ? prev : next));
  }, [idBase]);

  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return undefined;
    let raf = 0;
    const sync = () => {
      if (dragging.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        apply(el);
        measure(el);
        cards(el).forEach((c) => ro.observe(c)); // давхар observe нь хор хөнөөлгүй
      });
    };
    /* Карт нэмэгдэх/хасагдах (горим солих) ба агуулгын өндөр өөрчлөгдөх (ачаалал дуусах) */
    const mo = new MutationObserver(sync);
    mo.observe(el, { childList: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => { mo.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [target, apply, measure]);

  /* ⚠️ 2026-10-09: чирэлтийн дунд unmount (горим солих, хуудас шилжих) — урьд нь `up` хэзээ ч
     дуудагдахгүй тул `body { user-select: none }` бүх порталд ГАЦАЖ үлддэг байв. */
  useEffect(() => () => { upRef.current?.(); }, []);

  const setHeight = (el: HTMLElement, i: number, px: number | null) => {
    const xs = cards(el);
    const sv = load(keyOf(xs.length));
    const c = xs[i];
    if (!c) return;
    const nat = natural(c);
    if (px == null || px <= nat + 1) { c.style.height = ''; delete sv[i]; } else { c.style.height = `${px}px`; sv[i] = px; }
    save(keyOf(xs.length), sv);
  };

  const onDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el) return;
    /* ⚠️ 2026-10-09: зөвхөн үндсэн товч — баруун товч (контекст цэс) / дунд товч чирэлт эхлүүлэхгүй */
    if (e.button !== 0) return;
    e.preventDefault();
    const c = cards(el)[i];
    if (!c) return;
    upRef.current?.();
    const start = e.clientY;
    const h0 = c.offsetHeight;
    const nat = natural(c);
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    grip.dataset.drag = '1';
    dragging.current = true;
    const prevSel = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    let last = h0;
    const move = (ev: PointerEvent) => {
      last = Math.max(nat, Math.round(h0 + (ev.clientY - start)));
      c.style.height = last <= nat ? '' : `${last}px`;
      measure(el);
    };
    /* ⚠️ 2026-10-09: `lostpointercapture` → `up`. Барилт өөр шалтгаанаар алдагдвал (элемент
       DOM-оос салах, системийн цонх, alt+tab) `pointerup`/`pointercancel` ирэхгүй тул
       `dragging`/`data-drag`/`user-select: none` ГАЦАЖ үлддэг байв. `pointerup`-ын дараа ч
       `lostpointercapture` ирдэг тул `up` НЭГ л удаа ажиллана (`ended`). */
    let ended = false;
    const up = () => {
      if (ended) return;
      ended = true;
      if (upRef.current === up) upRef.current = null;
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.removeEventListener('lostpointercapture', up);
      delete grip.dataset.drag;
      dragging.current = false;
      document.body.style.userSelect = prevSel;
      setHeight(el, i, last);
      measure(el);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    grip.addEventListener('lostpointercapture', up);
    upRef.current = up;
  };

  const onKey = (i: number) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el) return;
    if (e.key === 'Enter' || e.key === 'Home') { e.preventDefault(); setHeight(el, i, null); measure(el); return; }
    const d = e.key === 'ArrowUp' ? -KEY_STEP : e.key === 'ArrowDown' ? KEY_STEP : 0;
    if (!d) return;
    e.preventDefault();
    const c = cards(el)[i];
    if (!c) return;
    setHeight(el, i, c.offsetHeight + d);
    measure(el);
  };

  const reset = (i: number) => () => {
    const el = target.current;
    if (!el) return;
    setHeight(el, i, null);
    measure(el);
  };

  return (
    <>
      {bars.map((b, i) => (
        <div
          key={i}
          className={h.gripRow}
          style={{ top: b.top - 4 }}
          role="separator"
          aria-orientation="horizontal"
          aria-label={tr('Хэмжээ тохируулах')}
          /* ⚠️ 2026-10-09: фокуслогдох separator-т утга заавал (ARIA) — дээд картын өндөр, px */
          aria-controls={b.cid}
          aria-valuenow={b.now}
          aria-valuemin={b.min}
          aria-valuemax={maxOf(b.min)}
          title={tr('Чирж хэмжээг тохируулна · давхар товшвол анхны хэмжээ')}
          tabIndex={0}
          onPointerDown={onDown(i)}
          onKeyDown={onKey(i)}
          onDoubleClick={reset(i)}
        />
      ))}
    </>
  );
}
