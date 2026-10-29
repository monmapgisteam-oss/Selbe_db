'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * «Сүүлийн утгын ref»-ийг СИНК болгоно — эффект/DOM callback-ийн closure
 * дотроос тухайн prop/state-ийн ХАМГИЙН СҮҮЛИЙН утгыг deps-д оруулалгүй
 * унших хэрэгсэл:
 *
 *   const areaRef = useRef(area);
 *   useSyncRef(areaRef, area);
 */
export function useSyncRef<T>(ref: RefObject<T>, value: T): void {
  useLayoutEffect(() => {
    ref.current = value;
  });
}
