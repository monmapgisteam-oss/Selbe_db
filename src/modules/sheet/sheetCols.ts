'use client';

/**
 * ХҮСНЭГТИЙН БАГАНЫ ТОХИРГОО — нуух · царцаах · зөөх · мөр таслах.
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
  /**
   * АНХДАГЧ НУУЛТЫН ХУВИЛБАР — сүүлд ХЭРЭГЛЭГЧ нуулт өөрчилсөн үеийн
   * `defHidden`-ий агуулга.
   */
  hideV?: string;
  /**
   * АНХДАГЧ ДАРААЛЛЫН ХУВИЛБАР — сүүлд хадгалагдсан `order` аль зохиомжийнх вэ.
   */
  orderV?: string;
};

const KEY = (k: string) => `selbe.cols.${k}`;

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
  /**
   * АНХДАГЧ НУУЛТЫГ БУЦААХ — «бүгдийг харуул»-ын ЭСРЭГ үйлдэл.
   */
  hideDefaults: () => void;
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
 * @param defHidden анхдагчаар НУУГДСАН багана (хэрэглэгч дараа нь дэлгэнэ)
 * @param ordV      анхдагч ДАРААЛЛЫН хувилбар — зохиомж өөрчлөгдөхөд солино;
 *                  хадгалсан дараалал нэг удаа хаягдаж, шинэ анхдагч хэрэгжинэ
 */
export function useSheetCols(
  key: string,
  all: string[],
  defWrap: string[] = [],
  defHidden: string[] = [],
  ordV = '',
): SheetCols {
  const [st, setSt] = useState<Saved>(
    () => (typeof window === 'undefined' ? {} : read(key)),
  );

  /*
   * ТҮЛХҮҮР СОЛИГДВОЛ дахин уншина (Cashflow ↔ IPC таб).
   */
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setSt(typeof window === 'undefined' ? {} : read(key));
  }

  /**
   * АНХДАГЧ НУУЛТЫН ХУВИЛБАР — жагсаалтын АГУУЛГААР. Жагсаалт өөрчлөгдвөл
   * хувилбар өөрчлөгдөж, шинэ анхдагч дахин нэг удаа хэрэглэгдэнэ.
   */
  const hideV = useMemo(() => defHidden.join('|'), [defHidden]);

  /**
   * ҮР ДҮНТЭЙ НУУЛТ.
   */
  const effHidden = useMemo(() => {
    const out = new Set(st.hidden ?? []);
    if (st.hideV !== hideV) for (const nm of defHidden) out.add(nm);
    return out;
  }, [st.hidden, st.hideV, defHidden, hideV]);

  /**
   * ХАРАГДАХ ДАРААЛАЛ.
   */
  /**
   * ҮР ДҮНТЭЙ ДАРААЛАЛ — хувилбар зөрвөл хадгалалтыг ҮЛ ТООМСОРЛОНО.
   */
  const effOrder = useMemo(
    () => (st.orderV === ordV ? (st.order ?? []) : []),
    [st.order, st.orderV, ordV],
  );

  const view = useMemo(() => {
    const has = new Set(all);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of effOrder) {
      if (has.has(n) && !seen.has(n)) { out.push(n); seen.add(n); }
    }
    for (const n of all) if (!seen.has(n)) out.push(n);
    const hid = effHidden;
    return out.filter((n) => !hid.has(n));
  }, [all, effOrder, effHidden]);

  const hidden = effHidden;

  const wrap = useMemo(() => new Set(st.wrap ?? defWrap), [st.wrap, defWrap]);

  const frozen = Math.max(0, Math.min(st.frozen ?? 4, view.length));

  const hide = useCallback((name: string) => {
    setSt((v) => {
      const cur = v.hideV === hideV ? (v.hidden ?? []) : [...(v.hidden ?? []), ...defHidden];
      const next = { ...v, hideV, hidden: [...new Set([...cur, name])] };
      write(key, next);
      return next;
    });
  }, [key, defHidden, hideV]);

  const hideMany = useCallback((names: string[]) => {
    if (names.length === 0) return;
    setSt((v) => {
      const cur = v.hideV === hideV ? (v.hidden ?? []) : [...(v.hidden ?? []), ...defHidden];
      const next = { ...v, hideV, hidden: [...new Set([...cur, ...names])] };
      write(key, next);
      return next;
    });
  }, [key, defHidden, hideV]);

  const setFrozen = useCallback((n: number) => {
    setSt((v) => {
      const next = { ...v, frozen: Math.max(0, n) };
      write(key, next);
      return next;
    });
  }, [key]);

  const showAll = useCallback(() => {
    setSt((v) => {
      const next = { ...v, hideV, hidden: [] };
      write(key, next);
      return next;
    });
  }, [key, hideV]);

  /**
   * АНХДАГЧ НУУЛТ РУУ БУЦАХ.
   */
  const hideDefaults = useCallback(() => {
    setSt((v) => {
      const next = { ...v, hideV, hidden: [...new Set([...(v.hidden ?? []), ...defHidden])] };
      write(key, next);
      return next;
    });
  }, [key, hideV, defHidden]);

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
      const base = (() => {
        const has = new Set(all);
        const seen = new Set<string>();
        const out: string[] = [];
        const prev = v.orderV === ordV ? (v.order ?? []) : [];
        for (const n of prev) if (has.has(n) && !seen.has(n)) { out.push(n); seen.add(n); }
        for (const n of all) if (!seen.has(n)) out.push(n);
        return out;
      })();
      const a = base.indexOf(from);
      const b = base.indexOf(to);
      if (a < 0 || b < 0) return v;
      base.splice(a, 1);
      base.splice(b, 0, from);
      const next = { ...v, orderV: ordV, order: base };
      write(key, next);
      return next;
    });
  }, [key, all, ordV]);

  const reset = useCallback(() => {
    setSt({});
    write(key, {});
  }, [key]);

  return {
    view, hidden, wrap, frozen,
    hide, hideMany, setFrozen, showAll,
    hideDefaults, toggleWrap, freezeTo, move, reset,
  };
}
