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
  /**
   * АНХДАГЧ НУУЛТЫН ХУВИЛБАР — сүүлд ХЭРЭГЛЭГЧ нуулт өөрчилсөн үеийн
   * `defHidden`-ий агуулга.
   *
   * ⚠️ Энэ түлхүүргүйгээр анхдагч нуулт нь ХУУЧИН хэрэглэгчид ХЭЗЭЭ Ч
   * хүрэхгүй: тэдний хадгалалтад `hidden` аль хэдийн (ихэвчлэн `[]`) байдаг
   * тул `st.hidden ?? defHidden` нь үргэлж хадгалалтыг сонгоно. Хувилбар
   * зөрөх үед анхдагчийг НЭГ УДАА нэмж, хэрэглэгч нуултаа өөрчилмөгц
   * хувилбарыг тэмдэглэн цаашид хөндөхгүй.
   */
  hideV?: string;
  /**
   * АНХДАГЧ ДАРААЛЛЫН ХУВИЛБАР — сүүлд хадгалагдсан `order` аль зохиомжийнх вэ.
   *
   * ⚠️ 2026-09-09-ны сургамж: `Cashflow_0904` → `0909` шилжүүлэгт талбарын нэр
   * БҮГД өөрчлөгдсөн ч ГАНЦ нэр (`ajliin_zurag_tusul`) хэвээр үлдсэн. Хадгалсан
   * дараалалд зөвхөн тэр нэг нэр таарсан тул тэр багана хүснэгтийн ХАМГИЙН
   * ЭХЭНД үсэрч, Excel-ийн «БАГЦ · № · Ажил, үйлчилгээ» эхлэл эвдэрсэн
   * (хэрэглэгчийн шүүмж: «яг Excel шиг эхлүүлье»).
   * ⚠️ Хувилбар зөрөх үед хадгалсан дарааллыг НЭГ УДАА хаяж, шинэ анхдагчид
   * буцна. Хэрэглэгч багана зөөмөгц шинэ хувилбар тэмдэглэгдэж, цаашид
   * хөндөгдөхгүй.
   */
  orderV?: string;
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
  /**
   * АНХДАГЧ НУУЛТЫГ БУЦААХ — «бүгдийг харуул»-ын ЭСРЭГ үйлдэл.
   * ⚠️ Зөвхөн НУУЛТЫГ хөндөнө: дараалал · царцаалт · өргөн · мөр таслалт
   * бүгд ХЭВЭЭР. `reset()` нь тэдгээрийг ч устгадаг тул тэр биш.
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
   * АНХДАГЧ НУУЛТЫН ХУВИЛБАР — жагсаалтын АГУУЛГААР. Жагсаалт өөрчлөгдвөл
   * хувилбар өөрчлөгдөж, шинэ анхдагч дахин нэг удаа хэрэглэгдэнэ.
   */
  const hideV = useMemo(() => defHidden.join('|'), [defHidden]);

  /**
   * ҮР ДҮНТЭЙ НУУЛТ.
   *
   * ⚠️ Хэрэглэгч нуултаа НЭГ Ч УДАА хөндөөгүй (эсвэл өөр хувилбар дээр
   * хөндсөн) бол анхдагчийг хадгалалтын дээр НЭМНЭ. Ингэснээр хуучин
   * тохиргоотой хэрэглэгч ч шинэ анхдагчийг авна — гэхдээ ЗӨВХӨН нэг удаа:
   * «Нуусан баганыг харуулах» дармагц `hideV` бичигдэж, цаашид хөндөхгүй.
   * ⚠️ Хэрэглэгчийн ӨӨРИЙН нуултыг ХЭЗЭЭ Ч алдагдуулахгүй — зөвхөн нэмнэ.
   */
  const effHidden = useMemo(() => {
    const out = new Set(st.hidden ?? []);
    if (st.hideV !== hideV) for (const nm of defHidden) out.add(nm);
    return out;
  }, [st.hidden, st.hideV, defHidden, hideV]);

  /**
   * ХАРАГДАХ ДАРААЛАЛ.
   *
   * ⚠️ Хадгалсан дараалал нь ШҮҮЛТ БИШ: түүнд байхгүй багана АЛДАГДАХГҮЙ,
   * эх дарааллаараа хойно нь орно. Эс бөгөөс үйлчилгээнд шинэ талбар нэмэхэд
   * хэрэглэгч түүнийг хэзээ ч харахгүй.
   */
  /**
   * ҮР ДҮНТЭЙ ДАРААЛАЛ — хувилбар зөрвөл хадгалалтыг ҮЛ ТООМСОРЛОНО.
   * ⚠️ `Saved.orderV`-ийн тайлбарыг үз: хуучирсан дараалал нэг л таарсан нэрээ
   * хүснэгтийн эхэнд үсрүүлж, зохиомжийг эвдэж болно.
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

  /* ⚠️ Анхдагч нь ЗӨВХӨН хадгалалт огт байхгүй үед: хэрэглэгч «Нарийвчилсан
     төрөл»-ийн тасралтыг унтраасан бол дараагийн ачаалалт түүнийг эргүүлж
     асаах ёсгүй. */
  /* ⚠️ `defWrap` нь дуудагчид `useMemo`-оор ТОГТВОРТОЙ байх ёстой — эс бөгөөс
     рендер бүрт шинэ массив ирж, доорх санамжууд дэмий дахин тооцогдоно. */
  const wrap = useMemo(() => new Set(st.wrap ?? defWrap), [st.wrap, defWrap]);

  /* ⚠️ Харагдах баганаас ИХГҮЙ: багана нуухад царцаалт жагсаалтаас хальж,
     хүснэгт бүхэлдээ наалдмал болох эрсдэлтэй. */
  const frozen = Math.max(0, Math.min(st.frozen ?? 4, view.length));

  /* ⚠️ Суурь нь ҮР ДҮНТЭЙ нуулт: хадгалалт хоосон байхад нэг багана нуувал
     АНХДАГЧААР нуугдсан зургаа гэнэт дэлгэгдэх байсан.
     ⚠️ `hideV` тэмдэглэгдэнэ — эндээс хойш анхдагч дахин нэмэгдэхгүй. */
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

  /* ⚠️ Сөрөг утга ба хэт их утгыг ЭНД хааж өгнө — дуудагч бүрд давтахгүй */
  const setFrozen = useCallback((n: number) => {
    setSt((v) => {
      const next = { ...v, frozen: Math.max(0, n) };
      write(key, next);
      return next;
    });
  }, [key]);

  /* ⚠️ `hideV` ЭНД ЗААВАЛ бичигдэнэ: «бүгдийг харуул» гэсэн ил хүсэлтийг
     дараагийн ачаалалт дээр анхдагч дарж болохгүй. */
  const showAll = useCallback(() => {
    setSt((v) => {
      const next = { ...v, hideV, hidden: [] };
      write(key, next);
      return next;
    });
  }, [key, hideV]);

  /**
   * АНХДАГЧ НУУЛТ РУУ БУЦАХ.
   *
   * ⚠️ ЯАГААД ХЭРЭГТЭЙ: `showAll` нь `hideV`-г бичдэг тул анхдагч нуулт
   * дахин хэзээ ч сэргэдэггүй. Хэрэглэгч «нуусныг харуулах»-аар нэг харснаа
   * буцаахын тулд 19 баганыг ГАРААР нэг нэгээр нь нуух шаардлагатай болно.
   * ⚠️ Хэрэглэгчийн ӨӨРИЙН нэмж нуусан баганыг ХАДГАЛНА — анхдагчийг ЗӨВХӨН
   * НЭМНЭ, юуг ч дэлгэхгүй.
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
      /* ⚠️ Дарааллыг ХАРАГДАХ жагсаалтаас БИШ, БҮХ баганаас угсарна: нуугдсан
         багана нь дараалалдаа үлдэх ёстой, эс бөгөөс дахин харуулахад
         төгсгөлд үсэрнэ. */
      const base = (() => {
        const has = new Set(all);
        const seen = new Set<string>();
        const out: string[] = [];
        /* ⚠️ Хувилбар зөрсөн хадгалалтыг ЭНД Ч ҮЛ ТООМСОРЛОНО — эс бөгөөс
           хэрэглэгч нэг багана зөөхөд хуучирсан дараалал бүхэлдээ сэргэнэ. */
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
      /* ⚠️ `orderV` ЗААВАЛ бичигдэнэ — эндээс хойш анхдагч дараалал энэ
         хэрэглэгчийн зөөлтийг дарахгүй. */
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
