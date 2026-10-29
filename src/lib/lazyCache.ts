/**
 * ЗАЛХУУ КЭШ — түлхүүр бүрд `compute`-ийг НЭГ л удаа дуудна (2026-10-04, рендерийн гүйцэтгэл).
 *
 * Хэрэглээ: `const effAt = useMemo( => lazyCache((i: number) => effSpan(plan, i, blk)), [plan, blk]);`
 * — оролт (`plan`, `blk`) солигдоход `useMemo` ШИНЭ кэш үүсгэнэ, ижил оролтын дотор нэг
 * түлхүүрийг дахин бодохгүй.
 */
export function lazyCache<K, V>(compute: (k: K) => V): (k: K) => V {
  const m = new Map<K, V>();
  return (k: K): V => {
    if (m.has(k)) return m.get(k) as V;
    const v = compute(k);
    m.set(k, v);
    return v;
  };
}

/**
 * `lazyCache`-ийн хувилбар — тооцоог дуудах үед нь өгнө (`get(түлхүүр,  => утга)`).
 * Хэрэглээ: `useMemo( => keyedCache<CSSProperties>, [оролтууд])` — оролт солигдоход шинэ кэш.
 */
export function keyedCache<V>(): (k: string, mk: () => V) => V {
  const m = new Map<string, V>();
  return (k: string, mk: () => V): V => {
    if (m.has(k)) return m.get(k) as V;
    const v = mk();
    m.set(k, v);
    return v;
  };
}
