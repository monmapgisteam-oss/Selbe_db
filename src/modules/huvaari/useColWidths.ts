import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { TL_MIN } from './useSideExtra';

/**
 * ЗҮҮН ЖАГСААЛТЫН БАГАНЫН ӨРГӨНИЙГ ЧИРЖ ӨӨРЧЛӨХ (2026-10-08, хэрэглэгч: «зүүн талын үндсэн
 * багануудыг өргөсгөж нарийсгаж болдог болго»).
 *
 * Багана бүрийн өргөн нь `huvaari.module.css`-ийн CSS хувьсагч (`--des-w`, `--work-min`,
 * `--date-w`, `--days-w`, `--res-w`, `--ham-w`) — толгой ба мөр НЭГ хувьсагчаас уншдаг тул
 * хувьсагчийг `.gSide` дээр солиход бүх мөр зэрэг дагана.
 */
export type ColKey = 'des' | 'work' | 'gs' | 'ge' | 'gd' | 'ps' | 'pe' | 'pd' | 'as' | 'ae' | 'rh' | 'rm' | 'ham';

const LS = 'selbe-huvaari-colw';
/** CSS хувьсагч · анхдагч · доод · дээд (px) — `huvaari.module.css`-ийн `.gSide`-тэй ИЖИЛ анхдагч */
const DATE = { def: 72, min: 72, max: 140 };
const DAYS = { def: 40, min: 34, max: 90 };
const RES = { def: 44, min: 28, max: 100 };
const SPEC: Record<ColKey, { v: string; def: number; min: number; max: number }> = {
  des: { v: '--des-w', def: 60, min: 44, max: 160 },
  work: { v: '--work-min', def: 170, min: 80, max: 600 },
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

function loadOr(fallback: Widths): Widths {
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
  } catch { return fallback; }
}
const load = (): Widths => loadOr({});

/** Багана бүрийн ХАРАГДАХ тоо (2026-10-09) — `--col-extra`-д үржигдэхүүн; 0 = нуугдсан */
export type ColMult = Record<ColKey, number>;
/** Нарийн дэлгэцэд (≤1180px) огноо · хоног · нөөц нуугддаг — `--col-extra-n` */
const NARROW_KEYS: ColKey[] = ['des', 'work', 'ham'];
const extraOf = (w: Widths, mult: ColMult, keys: readonly ColKey[] = KEYS): number =>
  keys.reduce((a, k) => a + (mult[k] ?? 0) * ((w[k] ?? SPEC[k].def) - SPEC[k].def), 0);
const capOf = (k: ColKey, base: number, room: number, m: number): number =>
  (m > 0 && Number.isFinite(room) ? Math.min(SPEC[k].max, base + Math.max(0, room) / m) : SPEC[k].max);

export function useColWidths(mult: ColMult) {
  const [w, setW] = useState<Widths>(load);
  const multRef = useRef(mult);
  useEffect(() => { multRef.current = mult; });
  const wRef = useRef(w);
  useEffect(() => { wRef.current = w; });
  const [dragging, setDragging] = useState<ColKey | null>(null);
  const el = useRef<HTMLElement | null>(null);
  /** Гарын хадгалагдаагүй утга (товчлуурын давталт) — `keyup`/`blur`-д `commit` */
  const kb = useRef<{ k: ColKey; v: number } | null>(null);

  const dragOff = useRef<(() => void) | null>(null);
  useEffect(() => () => dragOff.current?.(), []);

  /** Хувьсагчийг тавих элемент (`.gSide`) — callback ref */
  const elRef = useCallback((node: HTMLElement | null) => { el.current = node; }, []);

  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === LS || e.key === null) setW((prev) => loadOr(prev)); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const commit = useCallback((k: ColKey, v: number | null) => {
    setW((prev) => {
      const next = { ...loadOr(prev) };
      if (v == null) delete next[k]; else next[k] = clampW(k, v);
      try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* хаалттай орчин */ }
      return next;
    });
  }, []);

  const widthOf = useCallback((k: ColKey) => w[k] ?? SPEC[k].def, [w]);

  /** Хуанлид `TL_MIN`-ээс илүү үлдэх зай (px) — хэмжих боломжгүй бол хязгааргүй (толгой) */
  const roomOf = useCallback((): number => {
    const side = el.current;
    const wrap = side?.parentElement;
    if (!side || !wrap) return Infinity;
    return wrap.clientWidth - side.getBoundingClientRect().width - TL_MIN;
  }, []);

  /** Хувьсагчуудыг элемент дээр ШУУД бичнэ (React төлөвгүй — чирэлт/гарын давталт) */
  const paint = useCallback((k: ColKey, v: number) => {
    const st = el.current?.style;
    if (!st) return;
    st.setProperty(SPEC[k].v, `${v}px`);
    const w2 = { ...wRef.current, [k]: v };
    st.setProperty('--col-extra', `${extraOf(w2, multRef.current)}px`);
    st.setProperty('--col-extra-n', `${extraOf(w2, multRef.current, NARROW_KEYS)}px`);
  }, []);

  const onPointerDown = useCallback((k: ColKey, e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const base = wRef.current[k] ?? SPEC[k].def;
    const cap = capOf(k, base, roomOf(), multRef.current[k] ?? 0);
    let cur = base;
    dragOff.current?.();
    setDragging(k);
    const mv = (ev: globalThis.PointerEvent) => {
      const want = base + ev.clientX - x0;
      cur = clampW(k, want > base ? Math.min(want, cap) : want);
      paint(k, cur);
    };
    const off = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (dragOff.current === off) dragOff.current = null;
    };
    const up = () => {
      off();
      setDragging(null);
      commit(k, cur);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    dragOff.current = off;
  }, [commit, paint, roomOf]);

  /** Гарын хадгалагдаагүй утгыг хадгална (`keyup` · `blur`) */
  const flushKb = useCallback(() => {
    const p = kb.current;
    kb.current = null;
    if (p) commit(p.k, p.v);
  }, [commit]);

  const onKeyDown = useCallback((k: ColKey, e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      kb.current = null;
      commit(k, null);
      return;
    }
    const d = e.key === 'ArrowRight' ? 8 : e.key === 'ArrowLeft' ? -8 : 0;
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    if (kb.current && kb.current.k !== k) flushKb();
    const base = kb.current?.v ?? wRef.current[k] ?? SPEC[k].def;
    const want = e.key === 'Home' ? SPEC[k].min : e.key === 'End' ? SPEC[k].max : base + d;
    const cap = want > base ? capOf(k, base, roomOf(), multRef.current[k] ?? 0) : SPEC[k].max;
    const v = clampW(k, Math.min(want, Math.max(base, cap)));
    kb.current = { k, v };
    paint(k, v);
    e.currentTarget.setAttribute('aria-valuenow', String(v));
  }, [commit, flushKb, paint, roomOf]);

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
      onKeyUp: flushKb,
      onBlur: flushKb,
      onDoubleClick: () => commit(k, null),
      on: dragging === k,
      value: w[k] ?? SPEC[k].def,
      min: SPEC[k].min,
      max: SPEC[k].max,
    }),
  };
}
