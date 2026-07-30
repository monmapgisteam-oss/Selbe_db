'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

export type Async<T> = (
  | { state: 'loading'; data: null; error: null }
  | { state: 'ready'; data: T; error: null }
  | { state: 'error'; data: null; error: Error }
) & {
  /**
   * Хүсэлтийг ДАХИН эхлүүлнэ — алдааны дараа «Дахин оролдох» товчинд.
   * ⚠️ Optional: гараар угсарсан Async утга (жиш. тестийн mock) үүнгүйгээр ч
   * хүчинтэй хэвээр — `Data` компонент байгаа үед нь л товч гаргана.
   */
  retry?: () => void;
};

const LOADING = { state: 'loading', data: null, error: null } as const;

/**
 * Async өгөгдөл татах hook.
 *
 * Алдааг ЗАЛГИХГҮЙ — `error` төлөвөөр буцаана. UI нь түүнийг харуулах үүрэгтэй.
 * Ингэснээр ArcGIS унасан үед хуучин/зохиомол тоо дэлгэц дээр үлдэхгүй.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [result, setResult] = useState<Async<T>>(LOADING);
  /**
   * Дахин оролдлогын тоолуур — deps-д нэмэгдсэнээр эффект дахин ажиллана.
   * ⚠️ ArcGIS түр гацах нь энгийн үзэгдэл (`query.ts`-ийн rate-limit тайлбар).
   * Урьд нь алдааны дараах цорын ганц арга нь бүтэн хуудас refresh байсан —
   * газрын зураг, бүх татагдсан өгөгдөл дэмий дахин ачаалагддаг байлаа.
   */
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  // fn нь рендер бүрт шинэ функц — deps-ээр л дахин ажиллана
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setResult(LOADING);
    fnRef
      .current()
      .then((data) => {
        if (alive) setResult({ state: 'ready', data, error: null });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const error = e instanceof Error ? e : new Error(String(e));
        console.error('[selbe] өгөгдөл татахад алдаа:', error);
        setResult({ state: 'error', data: null, error });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  /**
   * ⚠️ Тогтвортой лавлагаа: рендер бүрт шинэ объект буцаавал `q`-г deps-даа
   * авсан useMemo/useEffect (жиш. Bagts-ийн `packs`) бүр дэмий дахин ажиллана.
   */
  return useMemo(() => ({ ...result, retry }), [result, retry]);
}
