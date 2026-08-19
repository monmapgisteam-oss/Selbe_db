"use client";

// Хүснэгтийн БАГАНЫ ӨРГӨН чирж тохируулах — таван хуудсанд НЭГ механизм.
//
// Өргөнийг нүд бүрд биш, хүснэгтийн үндэс дээрх CSS хувьсагчаар («--w-ajil»
// г.м.) хадгална. Ингэснээр:
//   • `<td>` бүрийг гар аргаар өөрчлөх шаардлагагүй — CSS-ийн дүрэм өөрөө уншина;
//   • ЦАРЦСАН баганы `left` шилжилт нь өмнөх багануудын хувьсагчийн НИЙЛБЭР
//     (`calc(...)`) тул өргөн өөрчлөгдөхөд өөрөө дагаж эгнэнэ.
//
// ⚠️ Хувьсагч нь БАГАНЫ АНГИЛАЛ-д харьяалагдана: давтагдах барилга/блокийн
// багана бүгд нэг ангилалтай тул НЭГ дор өөрчлөгдөнө (нэгийг нь чирэхэд бүгд).
// Тэдгээр нь ижил төрлийн утга агуулдаг тул үүнийг санаатай ингэв.

import { useCallback, useEffect, useRef, useState } from "react";
import st from "./sheet.module.css";

/** Багана уншигдахгүй нарийсахаас сэргийлнэ. */
const MIN_W = 28;
const LS = "selbe.colw.";

type Widths = Record<string, number>;

export function useColWidths(key: string) {
  const [w, setW] = useState<Widths>({});
  // ⚠️ localStorage-ийг ЭФФЕКТЭД уншина — эхний зурагт серверийнхтэй ижил
  // байхгүй бол hydration зөрнө.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS + key);
      if (raw) setW(JSON.parse(raw) as Widths);
    } catch {
      /* хадгалалт байхгүй/эвдэрсэн — анхны өргөнөөр */
    }
  }, [key]);

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
  // ⚠️ Хадгалахдаа ЭНД-ээс уншина: `setW(p => { save(p); ... })` гэвэл
  // state-ийн шинэчлэгч цэвэр биш болж StrictMode-д хоёр дахин ажиллана.
  const cur = useRef<Widths>({});
  cur.current = w;

  /**
   * Толгойн нүдэнд тавих бариулын props. Жишээ:
   * `<th className={cls("c-ajil")}>Ажил<i {...grip("ajil")} /></th>`
   */
  const grip = useCallback(
    (col: string) => ({
      className: st.grip,
      title: "Чирж өргөнийг тохируулна · давхар товшвол анхны хэмжээ",
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        // ⚠️ Толгой дээрх бусад үйлдэл (эрэмбэлэх, нүд сонгох) асахаас сэргийлнэ.
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
        // ⚠️ Чирэх явцад ЗӨВХӨН CSS хувьсагчийг шууд бичнэ — setW нь хөдөлгөөн
        // бүрд бүх хүснэгтийг дахин зурж (FillNew: ~80k нүд) бариул гацдаг байв.
        // React state + localStorage-д pointerup дээр л нэг удаа буулгана.
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
      // ⚠️ Гар хандалт: бариул фокуслагдаж сум товчоор ±8px, Enter/Home анхны
      // өргөн — урьд нь зөвхөн хулгана/хүрэлтээр л ажилладаг байв.
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": "Баганы өргөн",
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
  const style = Object.fromEntries(
    Object.entries(w).map(([k, v]) => [`--w-${k}`, `${v}px`]),
  ) as React.CSSProperties;

  /** Бүх баганыг анхны өргөнд нь буцаана. */
  const resetAll = useCallback(() => {
    setW({});
    save({});
  }, [save]);

  return { style, grip, resetAll, resized: Object.keys(w).length > 0 };
}
