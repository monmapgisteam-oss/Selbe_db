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
// ⚠️ 2026-10-09 (хэрэглэгч: «багана бүрээр тусдаа хийгдэхгүй байна»): ГҮЙЦЭТГЭЛ БӨГЛӨХ хүснэгтэд
// (`SheetHead` · `FillRows`) багана БҮР өөрийн түлхүүртэй (`grip("a3")` г.м.) — нүд бүр
// `cw(түлхүүр, ангилал)` inline өргөнтэй: `var(--w-<түлхүүр>, var(--w-<ангилал>))` («Бусад талбар»-ын
// `ExtraCol.wStyle`-тэй ижил арга). Ангиллын хадгалсан өргөн (`vol`, `bld`…) АНХДАГЧ болж үлдэнэ.
// Бусад хүснэгт (Finance · Qaqc) ангиллаараа хэвээр.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Бариулын tooltip/aria — 3 файлд давхардаж байсныг нэг эхээс (i18n-тэй).
import { GRIP_ARIA, GRIP_TITLE } from "@/components/ResizableTable";
import st from "./sheet.module.css";

/** Багана уншигдахгүй нарийсахаас сэргийлнэ. */
const MIN_W = 28;
const LS = "selbe.colw.";

type Widths = Record<string, number>;

/* ⚠️ 2026-10-09: нүд бүрт ОРЖ ирдэг тул объектыг түлхүүрээр кэшлэнэ — зурагдалт бүрд шинэ
   style объект үүсгэвэл React нүд бүрийн style-ыг дахин тулгана (~80k нүд). */
const CW = new Map<string, React.CSSProperties>();
/**
 * Нэг баганын өргөн — `<td style={cw("a3", "bld")}>`; толгойн `grip("a3")`-тэй ИЖИЛ түлхүүр.
 * ⚠️ inline нь ангиллын дүрмийг (`.b32 .c-vol` г.м.) ДАРНА — тэр багана чирэгдээгүй бол
 *    `--w-<түлхүүр>` тодорхойгүй тул ангиллын хувьсагч (анхдагч эсвэл хуучин хадгалсан) үйлчилнэ.
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

/**
 * ⚠️ 2026-10-09 (аудит): `fallback` — `key`-д хадгалалт АЛГА үед уншигдах ХУУЧИН түлхүүр (`keep`-ээр
 *    шүүгдэнэ). FillNew өргөнөө багц бүрээр (`fillnew.<pkg.key>`) хадгалах болсон тул урьдын нэгдсэн
 *    `fillnew`-ийн багцаас үл хамаарах баганууд (№ · Ажил · Обьём …) алдагдахгүй.
 * `fallback`-ийн `keep` нь тогтвортой (модулийн түвшний) функц байх ёстой — эффектийн хамаарал.
 */
export function useColWidths(key: string, fallback?: { key: string; keep?: (col: string) => boolean }) {
  const [w, setW] = useState<Widths>({});
  const fbKey = fallback?.key;
  const fbKeep = fallback?.keep;
  // ⚠️ localStorage-ийг ЭФФЕКТЭД уншина — эхний зурагт серверийнхтэй ижил
  // байхгүй бол hydration зөрнө.
  useEffect(() => {
    /* ⚠️ 2026-10-09 (аудит): `key` СОЛИГДОХОД (FillNew-д багц солих) хадгалалтгүй бол өмнөх түлхүүрийн
       өргөн `w`-д ҮЛДДЭГ байв (`if (raw) setW` л) — одоо хоосон (эсвэл `fallback`) болгож солино. */
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: localStorage (гадны сан) зөвхөн эффектэд уншигдана — дээрх hydration-ийн ⚠️; useState-ийн эхний утгад шилжүүлбэл серверийн зурагтай зөрнө
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
  // ⚠️ Хадгалахдаа ЭНД-ээс уншина: `setW(p => { save(p); ... })` гэвэл
  // state-ийн шинэчлэгч цэвэр биш болж StrictMode-д хоёр дахин ажиллана.
  const cur = useRef<Widths>({});
  /* ⚠️ 2026-09-30: render-д биш ЭФФЕКТЭД тольдоно (react-hooks/refs) — уншигч нь зөвхөн заагч/гарын
     үйл явдлууд (commit-ийн дараа) тул утга ижил; setState-ийн шинэчлэгч цэвэр хэвээр. */
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
  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): `w`-д MEMO — урьд нь зурагдалт бүрд шинэ объект тул
     түүнээс хамаарах `useMemo` (`Finance.frzLeft` г.м.) ХЭЗЭЭ Ч онохгүй, `<table style>` ч
     бүх CSS хувьсагчаа дахин тулгадаг байв. Утга ЯГ ИЖИЛ. */
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
