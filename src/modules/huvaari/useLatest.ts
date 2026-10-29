import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * ЗУРАГДАЛТ БҮРИЙН СҮҮЛИЙН УТГЫГ ref-д ХАДГАЛНА (2026-09-30).
 */
export function useLatest<T>(v: T): RefObject<T> {
  const ref = useRef<T>(v);
  useLayoutEffect(() => { ref.current = v; });
  return ref;
}
