'use client';

import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react';
import { dataVersion, subscribeData } from '@/lib/dataBus';

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
   * ӨГӨГДЛИЙН АВТОБУСЫН хувилбар — хүснэгт рүү бичихэд өснө (`dataBus.ts`).
   *
   * ⚠️ deps-т ОРНО: ингэснээр нийтэлсэн даруйд БҮХ дуудагч дахин ажиллана.
   * Хүчингүй болгоогүй ачаалагч нь хадгалсан амлалтаа шууд буцаах тул нэмэлт
   * сүлжээний хүсэлт ҮҮСЭХГҮЙ — зөвхөн хаягдсан кэш л дахин татагдана.
   */
  const bus = useSyncExternalStore(subscribeData, dataVersion, () => 0);
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

  /**
   * ⚠️ ХУУЧИН УТГЫГ БАРЬЖ ДАХИН ТАТНА (stale-while-revalidate).
   *
   * Урьд нь эффект бүрийн эхэнд `setResult(LOADING)` дуудагддаг байв. Тэр нь
   * ПАРАМЕТР солигдоход зөв (өмнөх багцын тоо шинэ багцынх мэт харагдах ёсгүй),
   * харин АВТОБУСААР дахин татахад БУРУУ: нийтлэх бүрд дашбоардын бүх карт
   * «Татаж байна…» болж анивчина. Тиймээс автобусаас үүдсэн дахин татахад
   * хуучин утгыг дэлгэц дээр үлдээж, шинэ нь ирэхэд чимээгүй солино.
   *
   * ⚠️ Хуучин утга ҮҮРД үлдэхгүй: татах нь АЛДВАЛ `error` төлөв рүү шилжиж,
   * дэлгэц дээрх тоо алга болно — «хуучин тоо чимээгүй үлдэхгүй» дүрэм хэвээр.
   */
  /*
   * ⚠️ Өмнөх хувилбарыг ЭФФЕКТ ДОТОР харьцуулна, зурагдах явцад БИШ.
   *
   * Эхэндээ `busRef.current !== bus`-ыг бие дотор бодоод тэр дороо дарж
   * бичдэг байв. Тэр нь React-ийн дүрэм зөрчсөн (зурагдах явцад ref өөрчлөх)
   * бөгөөд StrictMode-ийн ДАВХАР зурагдалт дээр эвдэрдэг: эхний зурагдалт
   * `busRef`-ыг шинэчилчихээд, эффект нь ХОЁР ДАХЬ зурагдалтын `fromBus`
   * (=false) утгыг хаалтандаа авдаг тул автобусаар татахад ч «Татаж байна…»
   * анивчина.
   */
  const busRef = useRef(bus);

  useEffect(() => {
    let alive = true;
    const fromBus = busRef.current !== bus;
    busRef.current = bus;
    if (!fromBus) setResult(LOADING);
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
  }, [...deps, nonce, bus]);

  /**
   * ⚠️ Тогтвортой лавлагаа: рендер бүрт шинэ объект буцаавал `q`-г deps-даа
   * авсан useMemo/useEffect (жиш. Bagts-ийн `packs`) бүр дэмий дахин ажиллана.
   */
  return useMemo(() => ({ ...result, retry }), [result, retry]);
}
