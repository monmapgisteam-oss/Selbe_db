/**
 * ЗАЛХУУ КЭШ — түлхүүр бүрд `compute`-ийг НЭГ л удаа дуудна (2026-10-04, рендерийн гүйцэтгэл).
 *
 * Хэрэглээ: `const effAt = useMemo(() => lazyCache((i: number) => effSpan(plan, i, blk)), [plan, blk]);`
 * — оролт (`plan`, `blk`) солигдоход `useMemo` ШИНЭ кэш үүсгэнэ, ижил оролтын дотор нэг
 * түлхүүрийг дахин бодохгүй.
 *
 * ⚠️ `compute` нь ЦЭВЭР байх ёстой (ижил түлхүүр → ижил утга) — кэш нь утгыг өөрчлөхгүй,
 *    зөвхөн давтан бодолтыг алгасна. Буцаасан объектыг дуудагч ӨӨРЧЛӨХГҮЙ.
 * ⚠️ Модулийн түвшний туслах (бүрэлдэхүүн дотор `new Map()` + closure БИШ): React Compiler-ийн
 *    lint нь render-ийн дараа дуудагдах closure доторх локал хувьсагчийн өөрчлөлтийг
 *    («Cannot modify local variables after render completes») анхааруулдаг; кэшийн дотоод
 *    төлөв нь render-ийн утга биш тул энд тусгаарлав.
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
 * `lazyCache`-ийн хувилбар — тооцоог дуудах үед нь өгнө (`get(түлхүүр, () => утга)`).
 * Хэрэглээ: `useMemo(() => keyedCache<CSSProperties>(), [оролтууд])` — оролт солигдоход шинэ кэш.
 * ⚠️ Нэг түлхүүрт үргэлж ИЖИЛ утга өгөх `mk` дамжуулна (ялгаатай бол эхнийх нь үлдэнэ).
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
