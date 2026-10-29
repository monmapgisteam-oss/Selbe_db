'use client';

import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { dataVersion, subscribeData } from '@/lib/dataBus';

export type Async<T> = (
  | { state: 'loading'; data: null; error: null }
  | { state: 'ready'; data: T; error: null }
  | { state: 'error'; data: null; error: Error }
) & {
  /**
   * Хүсэлтийг ДАХИН эхлүүлнэ — алдааны дараа «Дахин оролдох» товчинд.
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
/**
 * `useAsync`-ийн НЭМЭЛТ сонголтууд.
 */
export type AsyncOpts = {
  /**
   * ҮЕ ҮЕИЙН ДАХИН ТАТАЛТАД хуучин утгыг дэлгэц дээр үлдээх
   * (stale-while-revalidate).
   */
  keepOn?: unknown[];
};

/**
 * `keepOn`-д ОРООГҮЙ dep (харуулах ЗҮЙЛИЙГ тодорхойлох ПАРАМЕТР) солигдсон уу.
 * `prev == null` (анхны ачаалалт) → `true`. `keepOn`-ы утгууд ихэвчлэн `deps`-т мөн
 * багтдаг (жиш. `[tick, range]` + `keepOn: [tick]`) тул тэдгээрийг хасаж үзнэ.
 */
export function paramsChanged(prev: readonly unknown[] | null, deps: readonly unknown[], keep: readonly unknown[] | undefined): boolean {
  return prev == null
    || prev.length !== deps.length
    || deps.some(
      (v, i) =>
        !Object.is(v, prev[i])
        && !(keep != null && keep.some((k) => Object.is(k, v))),
    );
}

/**
 * Дахин татахад ХУУЧИН утгыг дэлгэц дээр барих уу (stale-while-revalidate).
 */
export function keepStale(fromBus: boolean, keepChanged: boolean, paramsDiffer: boolean): boolean {
  return (fromBus || keepChanged) && !paramsDiffer;
}

/**
 * Хадгалсан үр дүн ОДООГИЙН параметрийнх мөн эсэхийг ЗУРАХ үед шалгана — биш бол
 * `LOADING`. 2026-10-01: эффект `LOADING` тавихаас ӨМНӨХ нэг зурагдалтад (эффект
 * зурсны ДАРАА ажилладаг) хуучин параметрийн тоо шинэ сонголтын дэргэд анивчдаг байв.
 */
export function visibleResult<R extends { state: string }>(
  tagged: { r: R; forDeps: readonly unknown[] | null },
  deps: readonly unknown[],
  keep: readonly unknown[] | undefined,
  loading: R,
): R {
  if (tagged.r.state === 'loading' || tagged.forDeps == null) return tagged.r;
  return paramsChanged(tagged.forDeps, deps, keep) ? loading : tagged.r;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts?: AsyncOpts): Async<T> {
  const [tagged, setTagged] = useState<{ r: Async<T>; forDeps: unknown[] | null }>({ r: LOADING, forDeps: null });
  const result = visibleResult<Async<T>>(tagged, deps, opts?.keepOn, LOADING);
  /**
   * ӨГӨГДЛИЙН АВТОБУСЫН хувилбар — хүснэгт рүү бичихэд өснө (`dataBus.ts`).
   */
  const bus = useSyncExternalStore(subscribeData, dataVersion, () => 0);
  /**
   * Дахин оролдлогын тоолуур — deps-д нэмэгдсэнээр эффект дахин ажиллана.
   */
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  // fn нь рендер бүрт шинэ функц — deps-ээр л дахин ажиллана
  const fnRef = useRef(fn);
  useSyncRef(fnRef, fn);

  /**
   * Урьд нь эффект бүрийн эхэнд `setResult(LOADING)` дуудагддаг байв. Тэр нь
   * ПАРАМЕТР солигдоход зөв (өмнөх багцын тоо шинэ багцынх мэт харагдах ёсгүй),
   * харин АВТОБУСААР дахин татахад БУРУУ: нийтлэх бүрд дашбоардын бүх карт
   * «Татаж байна…» болж анивчина. Тиймээс автобусаас үүдсэн дахин татахад
   * хуучин утгыг дэлгэц дээр үлдээж, шинэ нь ирэхэд чимээгүй солино.
   */
  /*
   * Эхэндээ `busRef.current !== bus`-ыг бие дотор бодоод тэр дороо дарж
   * бичдэг байв. Тэр нь React-ийн дүрэм зөрчсөн (зурагдах явцад ref өөрчлөх)
   * бөгөөд StrictMode-ийн ДАВХАР зурагдалт дээр эвдэрдэг: эхний зурагдалт
   * `busRef`-ыг шинэчилчихээд, эффект нь ХОЁР ДАХЬ зурагдалтын `fromBus`
   * (=false) утгыг хаалтандаа авдаг тул автобусаар татахад ч «Татаж байна…»
   * анивчина.
   */
  const busRef = useRef(bus);
  const keepRef = useRef<unknown[] | null>(null);
  const depsRef = useRef<unknown[] | null>(null);

  useEffect(() => {
    let alive = true;
    const fromBus = busRef.current !== bus;
    busRef.current = bus;
    /*
     * IoT самбар 5 минут тутам `tick`-ээ өсгөдөг. `tick` нь энгийн dep тул
     * доорх `setResult(LOADING)` ажиллаж, БҮХ карт, чарт «уншиж байна» болж
     * анивчдаг байв — `loadSensors`-ийн TTL нь мөн 5 минут учир ихэнх tick
     * сүлжээ хүртэл хөндөхгүй атлаа дэлгэц бүхэлдээ хоосордог байлаа.
     *
     * Одоо ЗӨВХӨН `keepOn`-д жагсаасан dep өөрчлөгдсөн бол хуучин утгыг
     * дэлгэц дээр үлдээж, шинэ нь ирэхэд чимээгүй солино. Алдвал доорх
     * `catch` нь `error` төлөв рүү шилжүүлэх тул «хуучин тоо чимээгүй үлдэхгүй»
     * дүрэм энд ч хэвээр.
     */
    const prevKeep = keepRef.current;
    const keep = opts?.keepOn;
    const keepChanged =
      prevKeep != null
      && keep != null
      && keep.length === prevKeep.length
      && keep.some((v, i) => !Object.is(v, prevKeep[i]));
    const otherDepsChanged = paramsChanged(depsRef.current, deps, keep);
    const snap = [...deps];
    depsRef.current = snap;
    keepRef.current = keep != null ? [...keep] : null;
    if (!keepStale(fromBus, keepChanged, otherDepsChanged)) setTagged({ r: LOADING, forDeps: snap });
    fnRef
      .current()
      .then((data) => {
        if (alive) setTagged({ r: { state: 'ready', data, error: null }, forDeps: snap });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const error = e instanceof Error ? e : new Error(String(e));
        console.error('[selbe] өгөгдөл татахад алдаа:', error);
        setTagged({ r: { state: 'error', data: null, error }, forDeps: snap });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, bus]);

  const failed = tagged.r.state === 'error';
  useEffect(() => {
    if (!failed) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed, retry]);

  return useMemo(() => ({ ...result, retry }), [result, retry]);
}
