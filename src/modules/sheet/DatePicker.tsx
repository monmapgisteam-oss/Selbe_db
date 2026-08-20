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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t as tr } from '@/lib/i18nCore';
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
};

export default function DatePicker({ value, anchor, onPick, onClose }: PickerProps) {
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
    const scroll = () => onClose();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [onClose]);

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

  return (
    <div
      ref={box}
      className={st.cal}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      <div className={st.calHead}>
        <button className={st.calNav} onClick={() => step(-12)} title={tr('Өмнөх жил')}>«</button>
        <button className={st.calNav} onClick={() => step(-1)} title={tr('Өмнөх сар')}>‹</button>
        <span className={st.calTitle}>{tr('{0} оны {1}-р сар', view.y, view.m + 1)}</span>
        <button className={st.calNav} onClick={() => step(1)} title={tr('Дараа сар')}>›</button>
        <button className={st.calNav} onClick={() => step(12)} title={tr('Дараа жил')}>»</button>
      </div>

      <div className={st.calGrid}>
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

      <div className={st.calFoot}>
        <button className={st.calBtn} onClick={() => onPick("")}>{tr('Цэвэрлэх')}</button>
        <button className={st.calBtn} onClick={() => onPick(ymd(today))}>{tr('Өнөөдөр')}</button>
      </div>
    </div>
  );
}
