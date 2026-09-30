'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * «Сүүлийн утгын ref»-ийг СИНК болгоно — эффект/DOM callback-ийн closure
 * дотроос тухайн prop/state-ийн ХАМГИЙН СҮҮЛИЙН утгыг deps-д оруулалгүй
 * унших хэрэгсэл:
 *
 *   const areaRef = useRef(area);
 *   useSyncRef(areaRef, area);
 *
 * ⚠️ 2026-09-30: урьд нь `areaRef.current = area;` гэж RENDER дунд бичдэг байв —
 *    React Compiler-ийн `react-hooks/refs` дүрэм үүнийг хориглодог (commit
 *    болоогүй render-ийн утга ref-д үлдэж болно). Одоо `useLayoutEffect` дотор
 *    бичнэ: layout эффектүүд БҮХ passive `useEffect`-ээс ӨМНӨ ажилладаг тул
 *    ref-ийг эффект/handler дотроос уншдаг бүх код ижил утгыг харна.
 * ⚠️ `useRef`-ийг компонент ДОТРОО дуудна (ref буцаадаг хук биш) — эс бөгөөс
 *    `exhaustive-deps` нь буцаасан ref-ийг ердийн утга гэж үзэж deps-д нэхдэг.
 * ⚠️ Render ДУНД `.current` уншиж болохгүй — тэр тохиолдолд state ашигла.
 */
export function useSyncRef<T>(ref: RefObject<T>, value: T): void {
  useLayoutEffect(() => {
    ref.current = value;
  });
}
