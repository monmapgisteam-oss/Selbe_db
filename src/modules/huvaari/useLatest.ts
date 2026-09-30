import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * ЗУРАГДАЛТ БҮРИЙН СҮҮЛИЙН УТГЫГ ref-д ХАДГАЛНА (2026-09-30).
 *
 * ⚠️ Урьд нь `Huvaari.tsx` дотор `ref.current = x` зурагдалтын ДУНД бичигддэг
 *    байв (react-hooks/refs: «Cannot access refs during render»). Энэ hook нь
 *    ижил утгыг `useLayoutEffect`-ээр — commit-ийн дараа, ямар ч `useEffect`-ээс
 *    ӨМНӨ — бичдэг тул эффект · үйл явдлын хариулагч · async үргэлжлэл бүр урьдын
 *    адил ХАМГИЙН СҮҮЛИЙН утгыг харна; зан төлөв өөрчлөгдөхгүй.
 * ⚠️ Зурагдалтын дунд `.current`-ийг УНШИХ хэрэгцээнд зориулаагүй — тэр бол state.
 */
export function useLatest<T>(v: T): RefObject<T> {
  const ref = useRef<T>(v);
  useLayoutEffect(() => { ref.current = v; });
  return ref;
}
