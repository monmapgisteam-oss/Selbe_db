import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * ЗҮҮН ЖАГСААЛТЫН БАГАНЫН ӨРГӨНИЙГ ЧИРЖ ӨӨРЧЛӨХ (2026-10-08, хэрэглэгч: «зүүн талын үндсэн
 * багануудыг өргөсгөж нарийсгаж болдог болго»).
 *
 * Багана бүрийн өргөн нь `huvaari.module.css`-ийн CSS хувьсагч (`--des-w`, `--work-min`,
 * `--date-w`, `--days-w`, `--res-w`, `--ham-w`) — толгой ба мөр НЭГ хувьсагчаас уншдаг тул
 * хувьсагчийг `.gSide` дээр солиход бүх мөр зэрэг дагана.
 *
 * ⚠️ 2026-10-08 (хэрэглэгч: «нэг нэгээр нь өргөн бүдүүн тааруулах ёстой»): БАГАНА БҮР ТУСДАА.
 *    Урьд нь нэг төрлийн багана (огнооны 4–6, хоногийн 2, нөөцийн 2) НЭГ хувьсагчтай байж аль
 *    нэгийг чирэхэд бүгд зэрэг өргөсдөг байв. Одоо багана бүр өөрийн `--w-*` хувьсагчтай
 *    (`gs` гэрээ эхлэх · `ge` гэрээ дуусах · `gd` гэрээний хоног · `ps`/`pe`/`pd` төлөвлөгөөт ·
 *    `as`/`ae` бодит · `rh` хүн хүч · `rm` машин механизм). CSS-д баганын класс (`.cGs` г.м.)
 *    өөрийн элемент дээр `--date-w`/`--days-w`/`--res-w`-ийг тэр хувьсагчаар дарна — `.rowDate`
 *    г.м. өргөний дүрэм хөдлөөгүй. Хуучин хадгалсан `date`/`days`/`res` утгыг ачаалахад тухайн
 *    төрлийн бүх баганад тараана (`load`).
 * ⚠️ Чирэх явцад React төлөв ХӨДЛӨХГҮЙ (`useSideExtra`-ийн ижил шалтгаан: 1,400 мөр дахин
 *    зурвал чирэлт гацна) — хувьсагчийг элемент дээр шууд бичээд `pointerup`-д л хадгална.
 * ⚠️ «Ажил» багана нь `flex: 1` — түүний утга нь ДООД өргөн (`--work-min`); нэмэлт зай
 *    гарвал урьдын адил сунана. Жагсаалт бүхэлдээ багтахгүй болвол `useSideExtra`-ийн
 *    баруун бариулаар жагсаалтаа өргөсгөнө.
 * ⚠️ localStorage хаалттай/хоосон бол анхдагч — хуудас хэвийн зурагдана.
 * ⚠️ 2026-10-09: ЖАГСААЛТ ДАГАЖ ӨРГӨСНӨ — багана өргөсгөхөд `.gSide`-ийн өргөн (`flex-basis`) тогтмол
 *    байсан тул нийлбэр самбараас хальж, нүднүүд хуанли дээр давхарладаг байв; «Ажил» (`flex: 1`)-ын
 *    `--work-min`-ийг чирэхэд ч самбар хангалттай өргөн үед ЮУ Ч өөрчлөгддөггүй байв. Одоо анхдагчаас
 *    ЗӨРСӨН нийлбэр (давтагдах баганыг тоогоор нь үржүүлсэн, `mult`) нь `--col-extra`
 *    (нарийн дэлгэцийн дүрэмд — зөвхөн код · нэр · уялдаа: `--col-extra-n`) болж `.gSide`-ийн
 *    өргөнд НЭМЭГДЭНЭ: багана өргөсөхөд бусад нь агшихгүй, «Ажил»-ын бариул нэрийн баганыг шууд
 *    өргөсгөнө. Хуанлид үлдэх зайг `useSideExtra`-ийн хязгаар (элементийн бодит өргөнөөр) барина.
 */
export type ColKey = 'des' | 'work' | 'gs' | 'ge' | 'gd' | 'ps' | 'pe' | 'pd' | 'as' | 'ae' | 'rh' | 'rm' | 'ham';

const LS = 'selbe-huvaari-colw';
/** CSS хувьсагч · анхдагч · доод · дээд (px) — `huvaari.module.css`-ийн `.gSide`-тэй ИЖИЛ анхдагч */
/* ⚠️ 2026-10-08: ДООД хязгаар нь агуулга ТАСРАХГҮЙ өргөн — огноо 72 («2026-04-18» 10 тэмдэгт, CSS-ийн ⚠️),
   хоног 34 (3 орон + дүүргэлт), код 44 (3–4 орон + 8px). Урьд нь 56/28/36 байж чирэхэд огноо «2026-04-»
   гэж тасарч, толгой/мөр уншигдахгүй болдог байв. */
/* ⚠️ Анхдагч/хязгаар нь `huvaari.module.css`-ийн `.cGs` г.м. fallback-тай ИЖИЛ (72 · 40 · 44) */
const DATE = { def: 72, min: 72, max: 140 };
const DAYS = { def: 40, min: 34, max: 90 };
const RES = { def: 44, min: 28, max: 100 };
const SPEC: Record<ColKey, { v: string; def: number; min: number; max: number }> = {
  des: { v: '--des-w', def: 60, min: 44, max: 160 },
  work: { v: '--work-min', def: 140, min: 80, max: 600 },
  gs: { v: '--w-gs', ...DATE },
  ge: { v: '--w-ge', ...DATE },
  gd: { v: '--w-gd', ...DAYS },
  ps: { v: '--w-ps', ...DATE },
  pe: { v: '--w-pe', ...DATE },
  pd: { v: '--w-pd', ...DAYS },
  as: { v: '--w-as', ...DATE },
  ae: { v: '--w-ae', ...DATE },
  rh: { v: '--w-rh', ...RES },
  rm: { v: '--w-rm', ...RES },
  ham: { v: '--ham-w', def: 100, min: 50, max: 260 },
};
const KEYS = Object.keys(SPEC) as ColKey[];
type Widths = Partial<Record<ColKey, number>>;
/** 2026-10-08-аас өмнөх хуваалцсан түлхүүр → тухайн төрлийн бүх багана (`load`-ийн шилжүүлэлт) */
const LEGACY: Record<string, ColKey[]> = {
  date: ['gs', 'ge', 'ps', 'pe', 'as', 'ae'],
  days: ['gd', 'pd'],
  res: ['rh', 'rm'],
};

const clampW = (k: ColKey, v: number) => Math.max(SPEC[k].min, Math.min(SPEC[k].max, Math.round(v)));

function load(): Widths {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Widths = {};
    for (const [old, ks] of Object.entries(LEGACY)) {
      const n = Number(j[old]);
      if (j[old] != null && Number.isFinite(n)) for (const k of ks) out[k] = clampW(k, n);
    }
    for (const k of KEYS) { const n = Number(j[k]); if (j[k] != null && Number.isFinite(n)) out[k] = clampW(k, n); }
    return out;
  } catch { return {}; }
}

/** Багана бүрийн ХАРАГДАХ тоо (2026-10-09) — `--col-extra`-д үржигдэхүүн; 0 = нуугдсан */
export type ColMult = Record<ColKey, number>;
/** Нарийн дэлгэцэд (≤1180px) огноо · хоног · нөөц нуугддаг — `--col-extra-n` */
/* ⚠️ 2026-10-08: багана бүр тусдаа тул үржигдэхүүн нь 0 (нуугдсан) эсвэл 1 */
const NARROW_KEYS: ColKey[] = ['des', 'work', 'ham'];
const extraOf = (w: Widths, mult: ColMult, keys: readonly ColKey[] = KEYS): number =>
  keys.reduce((a, k) => a + (mult[k] ?? 0) * ((w[k] ?? SPEC[k].def) - SPEC[k].def), 0);

export function useColWidths(mult: ColMult) {
  const [w, setW] = useState<Widths>(load);
  /* ⚠️ 2026-10-09: чирэх явцад (`mv`) хамгийн сүүлийн үржигдэхүүнээр — React төлөв хөдөлгөхгүйн тулд ref */
  const multRef = useRef(mult);
  useEffect(() => { multRef.current = mult; });
  const [dragging, setDragging] = useState<ColKey | null>(null);
  const el = useRef<HTMLElement | null>(null);

  /** Хувьсагчийг тавих элемент (`.gSide`) — callback ref */
  const elRef = useCallback((node: HTMLElement | null) => { el.current = node; }, []);

  const commit = useCallback((k: ColKey, v: number | null) => {
    setW((prev) => {
      const next = { ...prev };
      if (v == null) delete next[k]; else next[k] = clampW(k, v);
      try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* хаалттай орчин */ }
      return next;
    });
  }, []);

  const widthOf = useCallback((k: ColKey) => w[k] ?? SPEC[k].def, [w]);

  const onPointerDown = useCallback((k: ColKey, e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const base = w[k] ?? SPEC[k].def;
    let cur = base;
    setDragging(k);
    const mv = (ev: globalThis.PointerEvent) => {
      cur = clampW(k, base + ev.clientX - x0);
      const st = el.current?.style;
      st?.setProperty(SPEC[k].v, `${cur}px`);
      /* ⚠️ 2026-10-09: самбар ч чирэлттэй ЗЭРЭГ өргөснө (толгойн ⚠️) */
      const w2 = { ...w, [k]: cur };
      st?.setProperty('--col-extra', `${extraOf(w2, multRef.current)}px`);
      st?.setProperty('--col-extra-n', `${extraOf(w2, multRef.current, NARROW_KEYS)}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(null);
      commit(k, cur);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [w, commit]);

  const onKeyDown = useCallback((k: ColKey, e: KeyboardEvent<HTMLElement>) => {
    const d = e.key === 'ArrowRight' ? 8 : e.key === 'ArrowLeft' ? -8 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    commit(k, (w[k] ?? SPEC[k].def) + d);
  }, [w, commit]);

  const style: Record<string, string> = {};
  for (const k of KEYS) if (w[k] != null) style[SPEC[k].v] = `${w[k]}px`;
  style['--col-extra'] = `${extraOf(w, mult)}px`;
  style['--col-extra-n'] = `${extraOf(w, mult, NARROW_KEYS)}px`;

  return {
    elRef,
    /** `.gSide`-ийн style-д нийлүүлнэ (зөвхөн хэрэглэгчийн өөрчилсөн багана) */
    style: style as React.CSSProperties,
    dragging,
    widthOf,
    grip: (k: ColKey) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(k, e),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(k, e),
      onDoubleClick: () => commit(k, null),
      on: dragging === k,
      value: w[k] ?? SPEC[k].def,
      /* ⚠️ 2026-10-09 (a11y): `aria-valuemin/max` — `ColGrip` */
      min: SPEC[k].min,
      max: SPEC[k].max,
    }),
  };
}
