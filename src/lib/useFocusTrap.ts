/**
 * ФОКУСЫН УРХИ — модал цонхны гарын навигацийг дотор нь түгжинэ.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Фокус авах чадвартай, ИДЭВХТЭЙ (disabled/нуугдаагүй) элементүүд */
const SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SEL)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

const trapStack: HTMLElement[] = [];

/** Урхины хүрээг овоолгод бүртгэнэ; буцаах функц нь бүртгэлийг хасна. */
export function pushFocusTrap(root: HTMLElement): () => void {
  trapStack.push(root);
  return () => {
    const i = trapStack.lastIndexOf(root);
    if (i >= 0) trapStack.splice(i, 1);
  };
}

/** `root` нь хамгийн дээд урхи эсэх (овоолго хоосон бол `true`) — Esc сонсогчид шалгана. */
export function isTopFocusTrap(root: HTMLElement | null): boolean {
  return trapStack.length === 0 || trapStack[trapStack.length - 1] === root;
}

/**
 * @param ref     модалын гадна хүрээ (`role="dialog"` элемент)
 * @param active  урхи идэвхтэй эсэх — модал хаагдсан үед `false`
 * @param fallback 2026-10-07: «өмнөх фокус» `<body>`/алга бол (нээгч элемент нээхээс
 *                ӨМНӨ салсан — жиш. хүснэгтийн нүдний оролтоос Enter-ээр нээгдсэн цонх)
 *                хаах агшинд дуудаж фокус буцаах элементийг авна. Ref-ээр — урхи дахин
 *                бүртгэгдэхгүй.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active = true,
  fallback?: () => HTMLElement | null,
): void {
  const fbRef = useRef(fallback);
  useLayoutEffect(() => { fbRef.current = fallback; });
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return undefined;

    const prev = document.activeElement as HTMLElement | null;

    const first = focusable(root)[0];
    if (first) first.focus();
    else {
      root.tabIndex = -1;
      root.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!isTopFocusTrap(root)) return;
      const list = focusable(root);
      if (!list.length) { e.preventDefault(); return; }
      const a = list[0];
      const z = list[list.length - 1];
      const cur = document.activeElement;
      if (!root.contains(cur)) { e.preventDefault(); a.focus(); return; }
      if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
    };

    const unpush = pushFocusTrap(root);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unpush();
      if (prev && prev.isConnected && prev !== document.body) prev.focus();
      else fbRef.current?.()?.focus();
    };
  }, [ref, active]);
}
