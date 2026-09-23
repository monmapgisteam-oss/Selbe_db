"use client";

// МОНГОЛ КАЛЕНДАР — хүснэгтийн огнооны нүдэнд.
//
// ⚠️ Яагаад өөрсдөө бичив: `<input type="date">`-ийн календарыг ХӨТӨЧ өөрөө
// зурдаг. Түүний загвар, товчны нэр («Clear» / «Today»), хэл нь хөтөч/системийн
// тохиргооноос хамаардаг бөгөөд хуудаснаас ЯМАР Ч аргаар өөрчлөгддөггүй.
// Тиймээс монгол нэртэй, порталын өнгөтэй өөрийн календар зурав.
//
// Огноог БҮХЭЛД НЬ UTC шөнө дундаар ажиллуулна — үйлчилгээний огноо тэгж
// хадгалагддаг тул орон нутгийн цагаар бодвол өдөр нэгээр гулсана.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react";
import { t as tr } from "@/lib/i18nCore";
import st from "./sheet.module.css";

const DAY = 86_400_000;
/** Даваагаар эхэлсэн 7 хоног — монголд хэвшсэн дараалал. */
const WD = [tr('Да'), tr('Мя'), tr('Лх'), tr('Пү'), tr('Ба'), tr('Бя'), tr('Ня')];

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Орон нутгийн «өнөөдөр»-ийг UTC шөнө дунд болгож буулгана. */
const todayMs = () => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

export type PickerProps = {
  /** «YYYY-MM-DD» эсвэл "" (огноогүй) */
  value: string;
  /** Аль нүднээс нээгдсэн бэ — тэрхүү нүдний байрлал */
  anchor: DOMRect;
  onPick: (v: string) => void;
  onClose: () => void;
  /**
   * ҮРГЭЛЖЛЭХ ХОНОГ (2026-09-17, хэрэглэгчийн хүсэлт) — хуваарийн огнооны нүдэнд:
   * «Эхлэх» нүдэнд бичсэн хоног нь огноо сонгоход дуусахыг хамт тавина; «Дуусах»
   * нүдэнд «Тавих» дарахад эхлэхээс тооцно. Өгөөгүй бол мөр гарахгүй (asOf).
   */
  days?: { value: string; onChange: (v: string) => void; onApply: () => void; canApply: boolean };
};

export default function DatePicker({ value, anchor, onPick, onClose, days }: PickerProps) {
  const cur = value ? Date.parse(`${value}T00:00:00Z`) : null;
  const base = cur ?? todayMs();
  const [view, setView] = useState(() => {
    const d = new Date(base);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Дэлгэцээс хальж гарахгүйн тулд байрлалыг зурахаас ӨМНӨ засна.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 8;
    let left = anchor.left;
    let top = anchor.bottom + 2;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;
    // Доор багтахгүй бол нүдний ДЭЭД талд нээнэ.
    if (top + h > window.innerHeight - pad) top = Math.max(pad, anchor.top - h - 2);
    setPos({ left, top });
  }, [anchor]);

  // Гадна дарах / Esc / гүйлгэх → хаана.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // ⚠️ `capture: true` — хүснэгтийн доторх гүйлт нь `window`-д хүрдэггүй.
    // ⚠️ Цонхны ДОТООД гүйлт (оны `select` жагсаалт г.м) хаахгүй (2026-09-23).
    const scroll = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      onClose();
    };
    const resize = () => onClose();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [onClose]);

  /**
   * ГАРААР ЯВАХ (2026-09-23): фокустай өдөр — нээхэд сонгосон (эсвэл өнөөдөр)
   * өдөр дээр очно; ←→ ±1 хоног, ↑↓ ±7 хоног; сар хальвал харагдац дагана.
   * ⚠️ Хулганагүй хэрэглэгч урьд нь 42 товчийг Tab-аар тойрдог байв.
   */
  const [focusMs, setFocusMs] = useState(base);
  useEffect(() => {
    if (!pos) return;
    const el = box.current?.querySelector<HTMLButtonElement>(`button[data-ms="${focusMs}"]`);
    el?.focus();
  }, [pos, focusMs]);
  const moveFocus = (delta: number) => {
    const ms = focusMs + delta * DAY;
    const d = new Date(ms);
    setFocusMs(ms);
    setView((v) => (v.y === d.getUTCFullYear() && v.m === d.getUTCMonth()
      ? v
      : { y: d.getUTCFullYear(), m: d.getUTCMonth() }));
  };
  const gridKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1
      : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    moveFocus(step);
  };

  const first = Date.UTC(view.y, view.m, 1);
  // Даваагаар эхлүүлэх шилжилт: getUTCDay() 0 = Ням.
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - lead * DAY;
  const today = todayMs();

  const step = (dm: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + dm, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  /**
   * ОНЫ ЖАГСААЛТ — сонгогдож буй он ЗААВАЛ багтана.
   *
   * ⚠️ Хатуу мужаар (жиш. 2024–2032) бичвэл хэдэн жилийн дараа хуучирч,
   * хуваарийн огноо жагсаалтад ОРОХГҮЙ болно — тэр үед `select` нь утгаа
   * олохгүй, эхний мөрөө харуулж, хэрэглэгч мэдэлгүй он СОЛИНО. Тиймээс
   * муж нь ӨНӨӨДРӨӨС бодогдоно, дээр нь одоогийн харагдац ба сонгосон
   * огнооны оныг албаар нэмнэ.
   */
  const years = (() => {
    const nowY = new Date(todayMs()).getUTCFullYear();
    const set = new Set<number>();
    for (let y = nowY - 3; y <= nowY + 8; y += 1) set.add(y);
    set.add(view.y);
    if (cur != null) set.add(new Date(cur).getUTCFullYear());
    return [...set].sort((a, b) => a - b);
  })();

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={tr('Огноо сонгох')}
      className={st.cal}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      <div className={st.calHead}>
        <button className={st.calNav} onClick={() => step(-12)} title={tr('Өмнөх жил')}>«</button>
        <button className={st.calNav} onClick={() => step(-1)} title={tr('Өмнөх сар')}>‹</button>
        {/*
          * ⚠️ ОН/САРЫГ ШУУД СОНГОНО (2026-09-04, хэрэглэгч: «эндээс он сар
          * өөрчлөгдөхгүй»). Сумнууд ажилладаг ч 22px, бүдэг өнгөтэй бөгөөд
          * төслийн хуваарь 2025→2027 үргэлжилдэг тул нэг сараар алхаж хүрэхэд
          * хорь гаруй товшилт болдог байв. Сум нь ХЭВЭЭР (хажуугийн сар руу
          * хурдан алхах), дээр нь шууд сонголт нэмэгдэв.
          */}
        <span className={st.calTitle}>
          <select
            className={st.calPick}
            value={view.m}
            title={tr('Сар сонгох')}
            onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>{tr('{0}-р сар', i + 1)}</option>
            ))}
          </select>
          <select
            className={st.calPick}
            value={view.y}
            title={tr('Он сонгох')}
            onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </span>
        <button className={st.calNav} onClick={() => step(1)} title={tr('Дараа сар')}>›</button>
        <button className={st.calNav} onClick={() => step(12)} title={tr('Дараа жил')}>»</button>
      </div>

      <div className={st.calGrid} onKeyDown={gridKey}>
        {WD.map((w) => (
          <span key={w} className={st.calWd}>{w}</span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const ms = start + i * DAY;
          const d = new Date(ms);
          const other = d.getUTCMonth() !== view.m;
          const sel = cur != null && ms === cur;
          return (
            <button
              key={ms}
              data-ms={ms}
              tabIndex={ms === focusMs ? 0 : -1}
              aria-pressed={sel}
              onFocus={() => setFocusMs(ms)}
              className={
                st.calDay +
                (other ? ` ${st.calOther}` : "") +
                (ms === today ? ` ${st.calToday}` : "") +
                (sel ? ` ${st.calSel}` : "")
              }
              onClick={() => onPick(ymd(ms))}
            >
              {d.getUTCDate()}
            </button>
          );
        })}
      </div>

      {days && (
        <div className={st.calFoot}>
          <label className={st.calDays}>
            {tr('Үргэлжлэх')}
            <input
              type="number"
              min={1}
              max={3650}
              className={st.calDaysIn}
              value={days.value}
              aria-label={tr('Үргэлжлэх хоног')}
              onChange={(e) => days.onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && days.canApply) { e.preventDefault(); days.onApply(); } }}
            />
            {tr('хоног')}
          </label>
          <button className={st.calBtn} disabled={!days.canApply} onClick={days.onApply}
            title={tr('Эхлэх огноо + хоног → дуусах огноо')}>
            {tr('Тавих')}
          </button>
        </div>
      )}
      <div className={st.calFoot}>
        <button className={st.calBtn} onClick={() => onPick("")}>{tr('Цэвэрлэх')}</button>
        <button className={st.calBtn} onClick={() => onPick(ymd(today))}>{tr('Өнөөдөр')}</button>
      </div>
    </div>
  );
}
