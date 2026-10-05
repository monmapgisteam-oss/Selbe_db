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
/**
 * `useAsync`-ийн НЭМЭЛТ сонголтууд.
 *
 * ⚠️ Бүгд СОНГОМОЛ бөгөөд өгөөгүй үед зан төлөв нь ХУУЧНААРАА. `useAsync` нь
 * 40 гаруй газар дуудагддаг тул анхдагчийг өөрчлөх нь тэр бүгдийг чимээгүй
 * хөндөнө — шинэ зан төлөвийг зөвхөн хүссэн дуудагч нь ил асаана.
 */
export type AsyncOpts = {
  /**
   * ҮЕ ҮЕИЙН ДАХИН ТАТАЛТАД хуучин утгыг дэлгэц дээр үлдээх
   * (stale-while-revalidate).
   *
   * ⚠️ Зөвхөн ЭНЭ deps-үүдийн аль нэг л өөрчлөгдсөн үед үйлчилнэ: жагсаалтад
   * байгаа dep нь «ижил өгөгдлийг ДАХИН тат» гэсэн утгатай (тоолуур, таймер)
   * болохоос харуулах ЗҮЙЛИЙГ солихгүй. Жагсаалтад ОРООГҮЙ dep (жишээ нь
   * `range`) солигдвол хуучин утга нь шинэ параметрийнх МӨН БИШ тул урьдын
   * адил «Татаж байна…» руу шилжинэ — эс бөгөөс 7 хоногийн тоо 30 хоногийнх
   * мэт харагдана.
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
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): автобусын хувилбар (`fromBus`) эсвэл
 *    `keepOn` өсөлт ПАРАМЕТРИЙН солилттой НЭГ эффектэд давхцвал урьд нь `fromBus`
 *    дангаараа хуучин утгыг барьдаг байв — шинэ багц/хугацааны дэлгэц дээр ӨМНӨХ
 *    параметрийн тоо шинэ нь иртэл харагдана. Одоо параметр ӨӨРЧЛӨГДСӨН бол ҮРГЭЛЖ
 *    «Татаж байна…».
 */
export function keepStale(fromBus: boolean, keepChanged: boolean, paramsDiffer: boolean): boolean {
  return (fromBus || keepChanged) && !paramsDiffer;
}

/**
 * Хадгалсан үр дүн ОДООГИЙН параметрийнх мөн эсэхийг ЗУРАХ үед шалгана — биш бол
 * `LOADING`. ⚠️ 2026-10-01: эффект `LOADING` тавихаас ӨМНӨХ нэг зурагдалтад (эффект
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
  /* ⚠️ 2026-10-01: үр дүн нь ӨӨРИЙГ НЬ гаргасан deps-ийн агшинтай хамт (`forDeps`) —
     зурах үед `visibleResult` хуучин параметрийн утгыг нууна. */
  const [tagged, setTagged] = useState<{ r: Async<T>; forDeps: unknown[] | null }>({ r: LOADING, forDeps: null });
  const result = visibleResult<Async<T>>(tagged, deps, opts?.keepOn, LOADING);
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
  useSyncRef(fnRef, fn);

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
  /*
   * ⚠️ `keepOn`-ы ӨМНӨХ утгуудыг мөн ЭФФЕКТ ДОТОР харьцуулна — дээрх `busRef`-
   * ийн тайлбартай ЯГ ижил шалтгаанаар (зурагдах явцад ref дарж бичвэл
   * StrictMode-ийн давхар зурагдалт дээр харьцуулалт худал болно).
   *
   * ⚠️ Эхний утга нь `null` — анхны ачаалалт нь «дахин татах» БИШ тул тэнд
   * `LOADING` заавал үзэгдэнэ (хоосон дэлгэц дээр хуучин утга гэж байхгүй).
   */
  const keepRef = useRef<unknown[] | null>(null);
  /*
   * ⚠️ `keepOn`-д ОРООГҮЙ deps-ийн өмнөх утга. Эдгээрийн аль нэг солигдвол
   * харуулах ЗҮЙЛ өөрчлөгдсөн гэсэн үг тул хуучин утгыг БАРИХГҮЙ: 7 хоногийн
   * тоо 30 хоногийнх мэт харагдах нь «хуучин тоо чимээгүй үлдэхгүй» дүрмийг
   * зөрчинө.
   */
  const depsRef = useRef<unknown[] | null>(null);

  useEffect(() => {
    let alive = true;
    const fromBus = busRef.current !== bus;
    busRef.current = bus;
    /*
     * ⚠️ ҮЕ ҮЕИЙН ДАХИН ТАТАЛТ (`keepOn`) — автобустай ИЖИЛ эмчилгээ.
     *
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
    /* ⚠️ `keepOn`-д БАЙГАА dep өөрчлөгдсөн эсэх. Жагсаалтад ОРООГҮЙ dep
       (жиш. `range`) солигдоход энэ нь `false` хэвээр үлдэх ёстой — тиймээс
       дуудагч нь `keepOn`-д зөвхөн «ижил өгөгдлийг дахин тат» гэсэн утгатай
       dep-үүдээ (тоолуур, таймер) жагсаана. Хэрэв хоёул зэрэг солигдвол
       (5 минутын tick яг хүрээ солих агшинд таарвал) хуучин утга нь шинэ
       параметрийнх биш тул `LOADING` харуулах нь ЗӨВ — гэхдээ тэр нь маш
       ховор бөгөөд `range` солих нь ямар ч байсан шинэ татал шаарддаг. */
    const keepChanged =
      prevKeep != null
      && keep != null
      && keep.length === prevKeep.length
      && keep.some((v, i) => !Object.is(v, prevKeep[i]));
    /* ⚠️ `keepOn`-д ОРООГҮЙ deps-ийн аль нэг солигдсон эсэх. `keepOn`-ы утгууд
       ихэвчлэн `deps`-т мөн багтдаг (жиш. `[tick, range]` + `keepOn: [tick]`)
       тул тэдгээрийг хасаж үзнэ — үлдсэн нь харуулах ЗҮЙЛИЙГ тодорхойлно. */
    const otherDepsChanged = paramsChanged(depsRef.current, deps, keep);
    const snap = [...deps];
    depsRef.current = snap;
    keepRef.current = keep != null ? [...keep] : null;
    /* ⚠️ 2026-10-01: автобус + параметрийн солилт давхцвал ч `LOADING` (`keepStale`-ийн ⚠️) */
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

  /*
   * ⚠️ 2026-10-05: СҮЛЖЭЭ СЭРГЭХЭД (`online`) АЛДААТАЙ байгаа дуудагч өөрөө дахин оролдоно.
   * Урьд нь холболт тасарсны дараа карт бүрийн «Дахин оролдох»-ыг гараар дарах эсвэл
   * хуудсаа refresh хийх шаардлагатай байв. Зөвхөн `error` төлөвт сонсоно — амжилттай
   * өгөгдөл дэмий дахин татагдахгүй.
   */
  const failed = tagged.r.state === 'error';
  useEffect(() => {
    if (!failed) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed, retry]);

  /**
   * ⚠️ Тогтвортой лавлагаа: рендер бүрт шинэ объект буцаавал `q`-г deps-даа
   * авсан useMemo/useEffect (жиш. Bagts-ийн `packs`) бүр дэмий дахин ажиллана.
   */
  return useMemo(() => ({ ...result, retry }), [result, retry]);
}
