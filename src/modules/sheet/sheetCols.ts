'use client';

/**
 * ХҮСНЭГТИЙН БАГАНЫ ТОХИРГОО — нуух · царцаах · зөөх · мөр таслах.
 *
 * ⚠️ ӨРГӨНӨӨС ТУСДАА (`colWidths.ts`): өргөн нь чирэлтийн үед секундэд олон
 * удаа шинэчлэгддэг тул тусдаа түлхүүрт хадгалагдана. Эдгээр нь ховор
 * өөрчлөгддөг бүтцийн тохиргоо — нэг санд нийлүүлбэл чирэх бүрд бүтэц ч
 * дахин бичигдэнэ.
 *
 * ⚠️ ХАДГАЛАГДАНА (`localStorage`): хэрэглэгч 33 баганаас хэрэгтэйгээ сонгож
 * тохируулсны дараа хуудас сэргээхэд тэр ажил алдагдвал дахин хийхгүй, зүгээр
 * л тэвчих болно.
 *
 * ⚠️ БАГАНА нь ДИНАМИК (үйлчилгээний метадатагаас) тул хадгалсан нэрс
 * үйлчилгээ өөрчлөгдөхөд хоцорч болно. Тиймээс бүх функц нь ОДООГИЙН баганы
 * жагсаалтыг эрх мэдэлтэй гэж үзнэ: хадгалсан боловч байхгүй нэр чимээгүй
 * алгасагдана, шинэ багана нь төгсгөлд нэмэгдэнэ.
 */

import { useCallback, useMemo, useState } from 'react';

/** Хадгалагдах хэлбэр */
type Saved = {
  /** Баганы ДАРААЛАЛ — нэрсээр. Энд байхгүй нэр хойно нь эх дарааллаараа. */
  order?: string[];
  /** НУУГДСАН баганы нэрс */
  hidden?: string[];
  /** ЦАРЦСАН баганы ТОО — эхнээс нь хэд нь байрандаа үлдэх вэ */
  frozen?: number;
  /** МӨР ТАСЛАХ (wrap) горимтой баганы нэрс */
  wrap?: string[];
};

const KEY = (k: string) => `selbe.cols.${k}`;

/** ⚠️ Хадгалалт унасан ч (private горим, дүүрсэн сан) хүснэгт ажиллана */
const read = (k: string): Saved => {
  try {
    const raw = localStorage.getItem(KEY(k));
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
};

const write = (k: string, v: Saved) => {
  try {
    localStorage.setItem(KEY(k), JSON.stringify(v));
  } catch {
    /* хадгалагдахгүй ч сешний туршид ажиллана */
  }
};

export type SheetCols = {
  /** Дараалал ба нуулт хэрэглэсэн ХАРАГДАХ баганы нэрс */
  view: string[];
  hidden: Set<string>;
  wrap: Set<string>;
  /** Царцсан баганы тоо (харагдах жагсаалтын эхнээс) */
  frozen: number;
  hide: (name: string) => void;
  /** ОЛОН баганыг нэг дор нуух — сонголттой ажиллахад */
  hideMany: (names: string[]) => void;
  /** Царцаалтыг ТООГООР шууд тавих (Excel-ийн «Freeze Panes») */
  setFrozen: (n: number) => void;
  showAll: () => void;
  toggleWrap: (name: string) => void;
  /** Тухайн багана хүртэл (ба түүнийг оруулан) царцаана; дахин дуудвал тайлна */
  freezeTo: (name: string) => void;
  /** `from` баганыг `to`-гийн БАЙРАНД зөөнө */
  move: (from: string, to: string) => void;
  reset: () => void;
};

/**
 * @param key      хадгалалтын түлхүүр (үзүүлэлт бүрд өөр)
 * @param all      ОДООГИЙН бүх баганы нэр — эх дараалалаараа
 * @param defWrap  анхдагчаар мөр таслах багана (хэрэглэгч дараа нь өөрчилнө)
 */
export function useSheetCols(key: string, all: string[], defWrap: string[] = []): SheetCols {
  /* ⚠️ `localStorage` нь ЗӨВХӨН хөтөч дээр: SSR/статик экспортын үед
     `localStorage is not defined` гэж унана (энэ төсөл `output: 'export'`).
     Тиймээс залхуу эхлүүлэгч дотор орчиноо шалгана. */
  const [st, setSt] = useState<Saved>(
    () => (typeof window === 'undefined' ? {} : read(key)),
  );

  /*
   * ТҮЛХҮҮР СОЛИГДВОЛ дахин уншина (Cashflow ↔ IPC таб).
   *
   * ⚠️ `useEffect` БИШ, РЕНДЕРИЙН ҮЕД: React-ийн «пропоос хамаарсан төлөвийг
   * тохируулах» загвар. Эффектээр хийвэл нэг агшин ӨМНӨХ табын тохиргоо
   * зурагдаад дараа нь солигдож, хүснэгт анивчина.
   */
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setSt(typeof window === 'undefined' ? {} : read(key));
  }

  /**
   * ХАРАГДАХ ДАРААЛАЛ.
   *
   * ⚠️ Хадгалсан дараалал нь ШҮҮЛТ БИШ: түүнд байхгүй багана АЛДАГДАХГҮЙ,
   * эх дарааллаараа хойно нь орно. Эс бөгөөс үйлчилгээнд шинэ талбар нэмэхэд
   * хэрэглэгч түүнийг хэзээ ч харахгүй.
   */
  const view = useMemo(() => {
    const has = new Set(all);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of st.order ?? []) {
      if (has.has(n) && !seen.has(n)) { out.push(n); seen.add(n); }
    }
    for (const n of all) if (!seen.has(n)) out.push(n);
    const hid = new Set(st.hidden ?? []);
    return out.filter((n) => !hid.has(n));
  }, [all, st.order, st.hidden]);

  const hidden = useMemo(() => new Set(st.hidden ?? []), [st.hidden]);

  /* ⚠️ Анхдагч нь ЗӨВХӨН хадгалалт огт байхгүй үед: хэрэглэгч «Нарийвчилсан
     төрөл»-ийн тасралтыг унтраасан бол дараагийн ачаалалт түүнийг эргүүлж
     асаах ёсгүй. */
  /* ⚠️ `defWrap` нь дуудагчид `useMemo`-оор ТОГТВОРТОЙ байх ёстой — эс бөгөөс
     рендер бүрт шинэ массив ирж, доорх санамжууд дэмий дахин тооцогдоно. */
  const wrap = useMemo(() => new Set(st.wrap ?? defWrap), [st.wrap, defWrap]);

  /* ⚠️ Харагдах баганаас ИХГҮЙ: багана нуухад царцаалт жагсаалтаас хальж,
     хүснэгт бүхэлдээ наалдмал болох эрсдэлтэй. */
  const frozen = Math.max(0, Math.min(st.frozen ?? 4, view.length));

  const hide = useCallback((name: string) => {
    setSt((v) => {
      const next = { ...v, hidden: [...new Set([...(v.hidden ?? []), name])] };
      write(key, next);
      return next;
    });
  }, [key]);

  const hideMany = useCallback((names: string[]) => {
    if (names.length === 0) return;
    setSt((v) => {
      const next = { ...v, hidden: [...new Set([...(v.hidden ?? []), ...names])] };
      write(key, next);
      return next;
    });
  }, [key]);

  /* ⚠️ Сөрөг утга ба хэт их утгыг ЭНД хааж өгнө — дуудагч бүрд давтахгүй */
  const setFrozen = useCallback((n: number) => {
    setSt((v) => {
      const next = { ...v, frozen: Math.max(0, n) };
      write(key, next);
      return next;
    });
  }, [key]);

  const showAll = useCallback(() => {
    setSt((v) => {
      const next = { ...v, hidden: [] };
      write(key, next);
      return next;
    });
  }, [key]);

  const toggleWrap = useCallback((name: string) => {
    setSt((v) => {
      const cur = new Set(v.wrap ?? defWrap);
      if (cur.has(name)) cur.delete(name); else cur.add(name);
      const next = { ...v, wrap: [...cur] };
      write(key, next);
      return next;
    });
  }, [key, defWrap]);

  const freezeTo = useCallback((name: string) => {
    setSt((v) => {
      const i = view.indexOf(name);
      if (i < 0) return v;
      /* Дахин дуудвал ТАЙЛНА — тэр багана аль хэдийн сүүлийн царцсан нь бол */
      const cur = Math.max(0, Math.min(v.frozen ?? 4, view.length));
      const next = { ...v, frozen: cur === i + 1 ? 0 : i + 1 };
      write(key, next);
      return next;
    });
  }, [key, view]);

  const move = useCallback((from: string, to: string) => {
    if (from === to) return;
    setSt((v) => {
      /* ⚠️ Дарааллыг ХАРАГДАХ жагсаалтаас БИШ, БҮХ баганаас угсарна: нуугдсан
         багана нь дараалалдаа үлдэх ёстой, эс бөгөөс дахин харуулахад
         төгсгөлд үсэрнэ. */
      const base = (() => {
        const has = new Set(all);
        const seen = new Set<string>();
        const out: string[] = [];
        for (const n of v.order ?? []) if (has.has(n) && !seen.has(n)) { out.push(n); seen.add(n); }
        for (const n of all) if (!seen.has(n)) out.push(n);
        return out;
      })();
      const a = base.indexOf(from);
      const b = base.indexOf(to);
      if (a < 0 || b < 0) return v;
      base.splice(a, 1);
      base.splice(b, 0, from);
      const next = { ...v, order: base };
      write(key, next);
      return next;
    });
  }, [key, all]);

  const reset = useCallback(() => {
    setSt({});
    write(key, {});
  }, [key]);

  return {
    view, hidden, wrap, frozen,
    hide, hideMany, setFrozen, showAll, toggleWrap, freezeTo, move, reset,
  };
}
