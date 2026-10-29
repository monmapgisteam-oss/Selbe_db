"use client";

// Хүснэгтийн БАГАНЫ ӨРГӨН чирж тохируулах — таван хуудсанд НЭГ механизм.
//
// Өргөнийг нүд бүрд биш, хүснэгтийн үндэс дээрх CSS хувьсагчаар («--w-ajil»
// г.м.) хадгална. Ингэснээр:
//   • `<td>` бүрийг гар аргаар өөрчлөх шаардлагагүй — CSS-ийн дүрэм өөрөө уншина;
//   • ЦАРЦСАН баганы `left` шилжилт нь өмнөх багануудын хувьсагчийн НИЙЛБЭР
//     (`calc(...)`) тул өргөн өөрчлөгдөхөд өөрөө дагаж эгнэнэ.
//

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Бариулын tooltip/aria — 3 файлд давхардаж байсныг нэг эхээс (i18n-тэй).
import { GRIP_ARIA, GRIP_TITLE } from "@/components/ResizableTable";
import st from "./sheet.module.css";

/** Багана уншигдахгүй нарийсахаас сэргийлнэ. */
const MIN_W = 28;
const LS = "selbe.colw.";

type Widths = Record<string, number>;

const CW = new Map<string, React.CSSProperties>();
/**
 * Нэг баганын өргөн — `<td style={cw("a3", "bld")}>`; толгойн `grip("a3")`-тэй ИЖИЛ түлхүүр.
 */
export function cw(col: string, base: string): React.CSSProperties {
  const k = `${col}|${base}`;
  let s = CW.get(k);
  if (!s) {
    const v = `var(--w-${col}, var(--w-${base}))`;
    s = { width: v, minWidth: v, maxWidth: v };
    CW.set(k, s);
  }
  return s;
}

export function useColWidths(key: string, fallback?: { key: string; keep?: (col: string) => boolean }) {
  const [w, setW] = useState<Widths>({});
  const fbKey = fallback?.key;
  const fbKeep = fallback?.keep;
  useEffect(() => {
    let next: Widths = {};
    try {
      const raw = localStorage.getItem(LS + key);
      if (raw) next = JSON.parse(raw) as Widths;
      else if (fbKey) {
        const old = localStorage.getItem(LS + fbKey);
        if (old) next = Object.fromEntries(
          Object.entries(JSON.parse(old) as Widths).filter(([c]) => !fbKeep || fbKeep(c)),
        );
      }
    } catch {
      /* хадгалалт байхгүй/эвдэрсэн — анхны өргөнөөр */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setW((p) => (Object.keys(p).length === 0 && Object.keys(next).length === 0 ? p : next));
  }, [key, fbKey, fbKeep]);

  const save = useCallback(
    (next: Widths) => {
      try {
        localStorage.setItem(LS + key, JSON.stringify(next));
      } catch {
        /* хувийн горимд бичих боломжгүй — зөвхөн энэ сешнд үйлчилнэ */
      }
    },
    [key],
  );

  const drag = useRef<{
    col: string;
    x: number;
    w: number;
    px?: number;
    table: HTMLTableElement | null;
  } | null>(null);
  const cur = useRef<Widths>({});
  useEffect(() => { cur.current = w; }, [w]);

  /**
   * Толгойн нүдэнд тавих бариулын props. Жишээ:
   * `<th className={cls("c-ajil")}>Ажил<i {...grip("ajil")} /></th>`
   */
  const grip = useCallback(
    (col: string) => ({
      className: st.grip,
      title: GRIP_TITLE(),
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        // Эхлэх өргөнийг ХЭМЖЭЭД нь уншина: хувьсагч тавиагүй багана CSS-ийн
        // анхны утга (эсвэл 100%-д сунасан бодит өргөн)-тэй байж болно.
        const th = el.parentElement;
        const w0 = th ? th.getBoundingClientRect().width : MIN_W;
        drag.current = { col, x: e.clientX, w: w0, table: el.closest("table") };
        el.setPointerCapture(e.pointerId);
        el.dataset.drag = "1";
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        const px = Math.max(MIN_W, Math.round(d.w + (e.clientX - d.x)));
        if (px === d.px) return;
        d.px = px;
        d.table?.style.setProperty(`--w-${d.col}`, `${px}px`);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        delete e.currentTarget.dataset.drag;
        if (d.px == null) return; // хөдөлгөөнгүй товшилт — өөрчлөлт алга
        const next = { ...cur.current, [d.col]: d.px };
        setW(next);
        save(next);
      },
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": GRIP_ARIA(),
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === "Home") {
          e.preventDefault();
          if (!(col in cur.current)) return;
          const n = { ...cur.current };
          delete n[col];
          setW(n);
          save(n);
          return;
        }
        const delta = e.key === "ArrowLeft" ? -8 : e.key === "ArrowRight" ? 8 : 0;
        if (!delta) return;
        e.preventDefault();
        e.stopPropagation();
        const th = e.currentTarget.parentElement;
        const base =
          cur.current[col] ??
          (th ? Math.round(th.getBoundingClientRect().width) : MIN_W);
        const next = { ...cur.current, [col]: Math.max(MIN_W, base + delta) };
        setW(next);
        save(next);
      },
      onDoubleClick: (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        if (!(col in cur.current)) return;
        const n = { ...cur.current };
        delete n[col];
        setW(n);
        save(n);
      },
    }),
    [save],
  );

  /** `<table style={...}>`-д тавих CSS хувьсагчид. */
  const style = useMemo(() => Object.fromEntries(
    Object.entries(w).map(([k, v]) => [`--w-${k}`, `${v}px`]),
  ) as React.CSSProperties, [w]);

  /** Бүх баганыг анхны өргөнд нь буцаана. */
  const resetAll = useCallback(() => {
    setW({});
    save({});
  }, [save]);

  return { style, grip, resetAll, resized: Object.keys(w).length > 0 };
}
