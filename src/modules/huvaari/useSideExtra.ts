import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * ЗҮҮН ЖАГСААЛТЫН ӨРГӨНИЙГ ЧИРЖ ТОМРУУЛАХ (2026-10-04, хэрэглэгч: «ажлууд ... болж бүрэн
 * харагдахгүй байна»). Үндсэн өргөн нь CSS-ийн `clamp(...)` хэвээр; энэ нь түүн дээр
 * НЭМЭХ пиксел (`--side-extra`, 0…MAX).
 *
 * ⚠️ Чирэх явцад React төлөв ХӨДЛӨХГҮЙ — 1,400 мөрийг дахин зурвал чирэлт гацна
 *    (`components/SplitGrip`-ийн ижил шалтгаан). CSS хувьсагчийг элемент дээр шууд
 *    бичээд `pointerup` дээр л төлөв ба localStorage-д буулгана.
 * ⚠️ localStorage хаалттай/хоосон бол 0 — хуудас хэвийн зурагдана.
 * ⚠️ 2026-10-04 (шүүлт): ЧИНГЭЛГИЙН ӨРГӨНӨӨР ХЯЗГААРЛАНА — урьд нь зөвхөн MAX (900) байсан тул
 *    жагсаалт хуанлийг бүхэлд нь таглаж, бариул дэлгэцээс гарч буцааж татах аргагүй болдог
 *    байв. Хязгаар = гүйлгэх хайрцаг (`.gWrap`) − үндсэн өргөн − `TL_MIN` (хуанлид үлдэх зай);
 *    `ResizeObserver`-оор нээх · цонх/хайрцаг хэмжээ солигдох бүрд дахин бодно.
 *    Хадгалсан утга (`extra`) нь ХЭРЭГЛЭГЧИЙН ХҮСЭЛ — нарийн цонхонд түр багасна (`eff`),
 *    өргөн цонхонд буцаж сэргэнэ; localStorage-ийг хязгаараар ДАРЖ бичихгүй.
 * ⚠️ ≤1180px-д (`huvaari.module.css` @media) `.gSide`-ийн өргөн тогтмол, бариул нуугдана —
 *    тэнд хязгаар бодохгүй.
 */
const LS = 'selbe-huvaari-side-extra';
const MAX = 900;
/** Хуанлид заавал үлдэх хамгийн бага өргөн (px) — ⚠️ 2026-10-09: `useColWidths` ч мөн үүгээр (нэг хязгаар) */
export const TL_MIN = 240;
const NARROW = '(max-width: 1180px)';
const clampX = (v: number, lim = MAX) => Math.max(0, Math.min(MAX, lim, Math.round(v)));

export function useSideExtra() {
  const [extra, setExtra] = useState<number>(() => {
    try { return clampX(Number(localStorage.getItem(LS)) || 0); } catch { return 0; }
  });
  const [limit, setLimit] = useState(MAX);
  const [dragging, setDragging] = useState(false);
  const el = useRef<HTMLDivElement | null>(null);
  /** Үйлчилж буй нэмэлт — хүсэл ба чингэлгийн хязгаарын бага нь */
  const eff = Math.min(extra, limit);

  /* Одоогийн хязгаар: хайрцаг − (элементийн өргөн − одоо тавигдсан нэмэлт) − TL_MIN */
  const measure = useCallback((): number => {
    const e = el.current;
    const wrap = e?.parentElement;
    if (!e || !wrap) return MAX;
    if (typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches) return MAX;
    const applied = parseFloat(e.style.getPropertyValue('--side-extra')) || 0;
    const base = e.getBoundingClientRect().width - applied;
    return clampX(wrap.clientWidth - base - TL_MIN);
  }, []);

  /** Callback ref (React 19 — цэвэрлэгээ буцаана): хайрцаг · элементийн хэмжээг ажиглана */
  const elRef = useCallback((node: HTMLDivElement | null) => {
    el.current = node;
    if (!node) return undefined;
    const upd = () => setLimit(measure());
    upd();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(upd) : null;
    ro?.observe(node);
    if (node.parentElement) ro?.observe(node.parentElement);
    window.addEventListener('resize', upd);
    return () => { ro?.disconnect(); window.removeEventListener('resize', upd); el.current = null; };
  }, [measure]);

  const commit = useCallback((v: number) => {
    const x = clampX(v);
    setExtra(x);
    try { localStorage.setItem(LS, String(x)); } catch { /* хаалттай орчин */ }
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const base = eff;
    /* ⚠️ Чирэлтийн эхэнд хязгаарыг шинээр хэмжинэ — чирэх явцад хэмжихгүй (layout гацна) */
    const lim = measure();
    let cur = base;
    setDragging(true);
    const mv = (ev: globalThis.PointerEvent) => {
      cur = clampX(base + ev.clientX - x0, lim);
      el.current?.style.setProperty('--side-extra', `${cur}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(false);
      commit(cur);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [eff, commit, measure]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === 'ArrowRight' ? 40 : e.key === 'ArrowLeft' ? -40 : 0;
    if (!d) return;
    e.preventDefault();
    commit(clampX(eff + d, limit));
  }, [eff, limit, commit]);

  return {
    elRef,
    style: { ['--side-extra' as string]: `${eff}px` } as React.CSSProperties,
    grip: { onPointerDown, onKeyDown, onDoubleClick: () => commit(0), dragging, extra: eff },
  };
}
