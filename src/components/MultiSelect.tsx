'use client';

/**
 * ОЛОН СОНГОЛТТОЙ КАПСУЛ ШҮҮЛТҮҮР — «Багц», «Компани» (2026-09-15,
 * хэрэглэгчийн хүсэлт: «энэ 2-ыг multi шүүлтүүр болго, map дээр бас нэм»).
 *
 * Хаалттай үедээ ХАБЭА-гийн өмнөх капсултай ЯГ ижил харагдана: зүүн талд
 * жижиг том үсгийн шошго, баруун талд одоогийн сонголт. Дарахад доор нь
 * тэмдэглэх нүдтэй жагсаалт нээгдэнэ.
 *
 * ⚠️ ЯАГААД НАТИВ `<select multiple>` БИШ ВЭ: тэр нь хаалттай үедээ жагсаалт
 * хэлбэрээр ӨНДӨР зай эзэлж капсул болж чаддаггүй, Ctrl дарж олон сонгодог нь
 * ихэнх хэрэглэгчид ил биш, мөн хүрэлтээр (таблет) бараг ашиглагдахгүй.
 *
 * ⚠️ ЖАГСААЛТ `position: fixed` — ПОРТАЛ БИШ. Капсул нь `.filters`
 * (`overflow-x: auto`) болон газрын зургийн `.map` (`overflow: hidden`) дотор
 * суудаг тул `absolute` нь тайрагдана. `ui.tsx`-ийн tooltip-тэй ИЖИЛ шийдэл:
 * эцгүүдэд `transform/filter/contain/backdrop-filter` байхгүй бол `fixed` нь
 * бүх тайралтаас гарна. ⚠️ Тиймээс энэ капсулыг агуулах элементэд
 * `backdrop-filter` БҮҮ тавь — тэр нь `fixed`-ийн агуулах блок болж жагсаалтыг
 * дахин тайрна.
 *
 * ⚠️ БАЙРЛАЛЫГ РЕНДЕРТ БИШ, ҮЙЛ ЯВДАЛД бодно (дарах, цонхны хэмжээ, гүйлгэлт).
 * Рендерийн үеэр ref уншвал React-ийн дүрэм зөрчигдөж, мөн нээхээс өмнөх
 * хуучин координат ашиглагдана.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import s from './multiSelect.module.css';

export type MultiOption = { key: string; label: string };

/** Жагсаалтын өргөний доод хэмжээ ба дэлгэцийн ирмэгээс зай (px) */
const POP_MIN_W = 240;
const EDGE = 8;
/** Доош багтахгүй бол ДЭЭШ нээх босго — үүнээс намхан жагсаалт уншигдахгүй */
const MIN_ROOM = 180;

type Pos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

export function MultiSelect({
  label, ariaLabel, allLabel, countLabel, options, value, onChange,
}: {
  /** Капсулын жижиг шошго — «Багц» */
  label: string;
  /** Дэлгэц уншигчид — «Багцаар шүүх» */
  ariaLabel: string;
  /** Юу ч сонгоогүй үеийн бичиг — «Бүх багц» */
  allLabel: string;
  /** Хоёроос олон сонгосон үеийн бичиг — `(3) => «3 багц»` */
  countLabel: (n: number) => string;
  options: MultiOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /** Товчны байрлалаас жагсаалтын координат — доош багтахгүй бол дээш */
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    const host = wrapRef.current?.getBoundingClientRect();
    if (!b || !host) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(POP_MIN_W, host.width), vw - EDGE * 2);
    const left = Math.min(Math.max(EDGE, host.left), vw - width - EDGE);
    const below = vh - b.bottom - EDGE * 2;
    const above = b.top - EDGE * 2;
    if (below >= MIN_ROOM || below >= above) {
      setPos({ left, width, top: b.bottom + 6, maxHeight: Math.max(120, below) });
    } else {
      setPos({ left, width, bottom: vh - b.top + 6, maxHeight: Math.max(120, above) });
    }
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  /* Нээлттэй үед: гадуур дарах, Escape, цонхны хэмжээ/гүйлгэлт */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    /* ⚠️ capture: эцгийн гүйлгэгч (шүүлтүүрийн мөр, баганууд) гүйхэд ч
       координатыг шинэчилнэ — эс бөгөөс жагсаалт товчноосоо салж хөвнө. */
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, close]);

  const toggleOpen = () => {
    if (open) { close(false); return; }
    place();
    setOpen(true);
  };

  const toggleKey = (k: string) => {
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  };

  /* ⚠️ Сонгосон нь жагсаалтаас ГАРСАН (өгөгдөл шинэчлэгдэж тэр багц алга
     болсон) байж болно — тэр үед түлхүүр нь өөрөө харагдана, алга болохгүй. */
  const summary = value.length === 0
    ? allLabel
    : value.length === 1
      ? (options.find((o) => o.key === value[0])?.label ?? value[0])
      : countLabel(value.length);

  return (
    <div ref={wrapRef} className={`${s.pill} ${value.length ? s.pillOn : ''}`}>
      <span className={s.pillLabel}>{label}</span>
      <button
        ref={btnRef}
        type="button"
        className={s.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${ariaLabel}: ${summary}`}
        onClick={toggleOpen}
      >
        <span className={s.summary}>{summary}</span>
        <span className={s.caret} aria-hidden>▾</span>
      </button>

      {open && pos && (
        <div
          ref={popRef}
          id={listId}
          className={s.pop}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          style={{
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxHeight,
          }}
        >
          <div className={s.popHead}>
            <span>{value.length ? tr('{0} сонгосон', value.length) : allLabel}</span>
            <button
              type="button"
              className={s.clear}
              onClick={() => onChange([])}
              disabled={!value.length}
            >
              {tr('Арилгах')}
            </button>
          </div>
          <div className={s.list}>
            {options.map((o) => {
              const on = value.includes(o.key);
              return (
                <label key={o.key} className={`${s.opt} ${on ? s.optOn : ''}`}>
                  <input
                    type="checkbox"
                    className={s.check}
                    checked={on}
                    onChange={() => toggleKey(o.key)}
                  />
                  <span className={s.optLabel}>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
