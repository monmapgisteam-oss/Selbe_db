import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * ЗҮҮН ЖАГСААЛТЫН БАГАНЫН ӨРГӨНИЙГ ЧИРЖ ӨӨРЧЛӨХ (2026-10-08, хэрэглэгч: «зүүн талын үндсэн
 * багануудыг өргөсгөж нарийсгаж болдог болго»).
 *
 * Багана бүрийн өргөн нь `huvaari.module.css`-ийн CSS хувьсагч (`--des-w`, `--work-min`,
 * `--date-w`, `--days-w`, `--res-w`, `--ham-w`) — толгой ба мөр НЭГ хувьсагчаас уншдаг тул
 * хувьсагчийг `.gSide` дээр солиход бүх мөр зэрэг дагана.
 *
 * ⚠️ Нэг төрлийн багана (огнооны 4–6, хоногийн 2, нөөцийн 2) НЭГ хувьсагчтай — аль нэгийг
 *    чирэхэд бүгд зэрэг өргөснө. Тус тусад нь салгавал толгой/мөр/CSS гурвууланд 10 шинэ
 *    хувьсагч хэрэгтэй бөгөөд ижил агуулгатай баганууд өөр өргөнтэй болж уншихад төвөгтэй.
 * ⚠️ Чирэх явцад React төлөв ХӨДЛӨХГҮЙ (`useSideExtra`-ийн ижил шалтгаан: 1,400 мөр дахин
 *    зурвал чирэлт гацна) — хувьсагчийг элемент дээр шууд бичээд `pointerup`-д л хадгална.
 * ⚠️ «Ажил» багана нь `flex: 1` — түүний утга нь ДООД өргөн (`--work-min`); нэмэлт зай
 *    гарвал урьдын адил сунана. Жагсаалт бүхэлдээ багтахгүй болвол `useSideExtra`-ийн
 *    баруун бариулаар жагсаалтаа өргөсгөнө.
 * ⚠️ localStorage хаалттай/хоосон бол анхдагч — хуудас хэвийн зурагдана.
 */
export type ColKey = 'des' | 'work' | 'date' | 'days' | 'res' | 'ham';

const LS = 'selbe-huvaari-colw';
/** CSS хувьсагч · анхдагч · доод · дээд (px) — `huvaari.module.css`-ийн `.gSide`-тэй ИЖИЛ анхдагч */
/* ⚠️ 2026-10-08: ДООД хязгаар нь агуулга ТАСРАХГҮЙ өргөн — огноо 72 («2026-04-18» 10 тэмдэгт, CSS-ийн ⚠️),
   хоног 34 (3 орон + дүүргэлт), код 44 (3–4 орон + 8px). Урьд нь 56/28/36 байж чирэхэд огноо «2026-04-»
   гэж тасарч, толгой/мөр уншигдахгүй болдог байв. */
const SPEC: Record<ColKey, { v: string; def: number; min: number; max: number }> = {
  des: { v: '--des-w', def: 60, min: 44, max: 160 },
  work: { v: '--work-min', def: 140, min: 80, max: 600 },
  date: { v: '--date-w', def: 72, min: 72, max: 140 },
  days: { v: '--days-w', def: 40, min: 34, max: 90 },
  res: { v: '--res-w', def: 44, min: 28, max: 100 },
  ham: { v: '--ham-w', def: 100, min: 50, max: 260 },
};
const KEYS = Object.keys(SPEC) as ColKey[];
type Widths = Partial<Record<ColKey, number>>;

const clampW = (k: ColKey, v: number) => Math.max(SPEC[k].min, Math.min(SPEC[k].max, Math.round(v)));

function load(): Widths {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Widths = {};
    for (const k of KEYS) { const n = Number(j[k]); if (Number.isFinite(n)) out[k] = clampW(k, n); }
    return out;
  } catch { return {}; }
}

export function useColWidths() {
  const [w, setW] = useState<Widths>(load);
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
      el.current?.style.setProperty(SPEC[k].v, `${cur}px`);
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
    }),
  };
}
