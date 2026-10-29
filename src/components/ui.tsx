'use client';

import React, { Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import {
  CHART, DONUT_SIZES, RING_SIZES, donutGeom, lineSegments, areaPath, monotonePath,
  roundPctsTo100,
  type DonutSize, type RingSize,
} from '@/lib/chartStyle';
import type { Async } from '@/lib/useAsync';
import type { DocChartSpec } from '@/lib/docxChart';
import { Icon } from './Icon';
import { chunkErrorText, isChunkLoadError } from './ErrorBoundary';
import s from './ui.module.css';

const tone = (c?: string) => ({ '--tone': c ?? 'var(--data)' }) as CSSProperties;

/**
 * НЭГ ӨНГИЙН ТУНГАЛГИЙН ШАТ — өнгөгүй ангилал `i`-ийн тунгалаг (Environment `PieChart`).
 */
const rampOp = (i: number): number => Math.max(Math.round((0.92 - i * 0.22) * 100) / 100, 0.24);
const explicitOp = 0.88;

/**
 * ТАЙЛАНГИЙН WORD ГРАФИК (2026-10-19, хэрэглэгч: «графикийг зургаар биш, аятайхан графикаар»).
 */
const repChart = (spec: DocChartSpec) => ({ 'data-report-chart': JSON.stringify(spec) });

/**
 * Тоо БИШ утгыг 0 болгоно.
 */
const fin = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : 0);

/**
 * `display`-гүй ТҮҮХИЙ утгын бичвэр — `num`, бүхэл бол 0, бутархай бол 1 орон; null → «—».
 */
const autoNum = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : num(v, Number.isInteger(v) ? 0 : 1);

/**
 * Элементийн ОДООГИЙН өргөн (px). Хэмжигдэх хүртэл 0.
 */
function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    roRef.current = ro;
  }, []);
  return [ref, w];
}

/**
 * ReactNode → энгийн текст (aria-label, tooltip-д).
 */
function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'bigint') return String(n);
  if (Array.isArray(n)) return n.map((c: ReactNode) => nodeText(c)).join('');
  if (isValidElement(n)) return nodeText((n.props as { children?: ReactNode }).children);
  return '';
}

/* ── Хулганы тайлбар (tooltip) ───────────────────────────────────────────── */

/**
 * ЗААГ ЗУРААС — `hint` массивт энэ утгыг тавибал тэр байрлалд зураас гарна.
 */
export const TIP_RULE = '—hr—';

type TipData = {
  x: number; y: number; label: string; value: string;
  color?: string; hint?: string | string[];
};

const TIP_DELAY = 60; // мс — `title`-ийн ~1000-ын оронд
const TIP_OFF = 14; // заагуураас хол зай

export function useTip() {
  const [tip, setTip] = useState<TipData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  // Компонент салахад унтраалгүй үлдсэн таймер ажиллуулахгүй
  useEffect(() => stop, []);

  const hide = () => {
    stop();
    setTip(null);
  };
  /** Заагуур хөдлөх бүрд байрлалыг шинэчилнэ; анх гарахдаа л хүлээнэ */
  const show = (e: { clientX: number; clientY: number }, d: Omit<TipData, 'x' | 'y'>) => {
    const at = { ...d, x: e.clientX, y: e.clientY };
    setTip((cur) => (cur ? at : cur));
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; setTip(at); }, TIP_DELAY);
  };
  /** Гар/фокусаар хөтлөгчид — элементийн хүрээнээс байрлалыг авна */
  const showAt = (el: Element | null, d: Omit<TipData, 'x' | 'y'>) => {
    if (!el) return;
    stop();
    const r = el.getBoundingClientRect();
    setTip({ ...d, x: r.left + r.width / 2, y: r.top });
  };

  /** Тэмдэг бүрд наах хэрэглэгчийн үйлдлүүд */
  const bind = (d: Omit<TipData, 'x' | 'y'>) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, d),
    onPointerLeave: hide,
    // Хүрэлтээр — `title` энд юу ч өгдөггүй байсан
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') showAt(e.currentTarget, d);
    },
    onFocus: (e: React.FocusEvent) => showAt(e.currentTarget, d),
    onBlur: hide,
  });

  return { bind, hide, node: tip ? <Tip {...tip} /> : null };
}

function Tip({ x, y, label, value, color, hint }: TipData) {
  // Цонхны ирмэгээс хальтал эсрэг тал руу эргэнэ (хэмжээг нь мэдэхгүй тул
  // хамгийн өргөн боломжит утгаар бариулна — `max-width` нь 260px)
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const flipX = x > vw - 280;
  const flipY = y < 110;
  const c = color ?? 'var(--data)';
  const longVal = value.length >= 14;
  return (
    /* envhub → Environment tooltip бүтэц: tone 10%-иар будсан толгойн зурвас (цэг + нэр),
       дор нь өнгөтэй ТОМ утга, дараа нь бүдэг тайлбар. */
    <div
      role="tooltip"
      className={s.tip}
      style={{
        left: x + (flipX ? -TIP_OFF : TIP_OFF),
        top: y + (flipY ? TIP_OFF : -TIP_OFF),
        transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '0' : '-100%'})`,
      }}
    >
      <span className={s.tipHd} style={{ background: `color-mix(in oklab, ${c} 10%, transparent)` }}>
        <i className={s.tipDot} style={{ background: c }} />
        <span className={s.tipName}>{tr(label)}</span>
      </span>
      <span className={s.tipBody}>
        <b className={`${s.tipVal} ${longVal ? s.tipValLong : ''} num`} style={{ color: c }}>{value}</b>
        {(Array.isArray(hint) ? hint : hint ? [hint] : []).map((h, i) => (
          h === TIP_RULE
            ? <i key={`hr${i}`} className={s.tipRule} aria-hidden />
            : <span key={h} className={s.tipHint}>{h}</span>
        ))}
      </span>
    </div>
  );
}

/**
 * УУГУУЛ `title`-ийн бичвэр — «нэр · утга» + тайлбарын мөрүүд (шинэ мөрөөр).
 */
function tipTitle(label: string, value: string, hint?: string | string[]): string {
  const lines = (Array.isArray(hint) ? hint : hint ? [hint] : []).map((h) => (h === TIP_RULE ? '' : h));
  return [`${label} · ${value}`, ...lines].join('\n');
}

/** Талбайн диаграмын бодит хүрээ (viewport px) — hover эхлэхэд хэмжинэ */
type PlotRect = { left: number; top: number; width: number; height: number };
const rectOf = (el: Element | null): PlotRect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * ТАЛБАЙН ДИАГРАМЫН HOVER САМБАР — Environment `AreaChart`-ын `Tooltip` (`charts.tsx`).
 */
function AreaTip({
  rect, t, top, color, label, value, unit, share, delta, rows, hint, selected,
}: {
  rect: PlotRect;
  /** Цэгийн хэвтээ байрлал — 0…1 */
  t: number;
  /** Цэгийн босоо байрлал — талбайн өндрийн % */
  top: number;
  color: string;
  label: string;
  value: string;
  unit?: string;
  /** Нийтэд эзлэх хувь (0–100) — null бол мөр гарахгүй */
  share?: number | null;
  /** Өмнөх цэгээс өөрчлөлт (бичвэр + тэмдэг) — null бол гарахгүй (null ≠ 0) */
  delta?: { sign: number; text: string } | null;
  /** Олон муруй — цуваа бүрийн мөр (өгвөл `value`-ийн оронд) */
  rows?: { key: string; label: string; value: string; color: string }[];
  hint?: string;
  selected?: boolean;
}) {
  const anchor = t < 0.22 ? 'left' : t > 0.78 ? 'right' : 'center';
  const shift = anchor === 'left' ? '0%' : anchor === 'right' ? '-100%' : '-50%';
  const below = top < 45;
  return (
    <div
      role="tooltip"
      className={`${s.tip} ${s.areaTip}`}
      style={{
        left: rect.left + t * rect.width,
        top: rect.top + (top / 100) * rect.height,
        transform: `translate(${shift}, ${below ? '10px' : 'calc(-100% - 10px)'})`,
      }}
    >
      <span className={s.tipHd} style={{ background: `color-mix(in oklab, ${color} 10%, transparent)` }}>
        <i className={s.tipDot} style={{ background: color }} />
        <span className={`${s.tipName} num`}>{label}</span>
        {selected && <span className={s.tipSel}>{tr('сонгосон')}</span>}
      </span>
      <span className={s.tipBody}>
        {rows ? rows.map((r) => (
          <span key={r.key} className={s.areaTipRow}>
            <i className={s.tipDot} style={{ background: r.color }} />
            <span>{r.label}</span>
            <b className="num">{r.value}</b>
          </span>
        )) : (
          <span className={s.areaTipVal}>
            <b className="num" style={{ color }}>{value}</b>
            {unit && <span className={s.areaTipUnit}>{unit}</span>}
          </span>
        )}
        {(share != null || delta != null) && (
          <span className={s.areaTipMeta}>
            {share != null && <span className="num">{share.toFixed(1)}%</span>}
            {delta != null && (
              <span className="num" style={{ color: delta.sign !== 0 ? 'var(--data)' : 'var(--ink-3)' }}>
                {delta.sign > 0 ? '▲' : delta.sign < 0 ? '▼' : '='} {delta.text}
              </span>
            )}
          </span>
        )}
        {hint && <span className={s.tipHint}>{hint}</span>}
      </span>
    </div>
  );
}

/* ══════════════ Лавлах CRM загварын жижиг хэсгүүд (2026-10-09) ══════════════ */


/** Байрлал: тоо → px, мөр → шууд (жиш. «34%») */
const posOf = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);

/**
 * УТГЫН PILL («Дээд: 68») — цэгийн ДЭЭР (эсвэл `below` үед доор) сууна, жижиг сумтай.
 */
export function PointCallout({
  x, y, text, color, below = false, align = 'center',
}: {
  x: number | string;
  y: number | string;
  text: string;
  color?: string;
  below?: boolean;
  align?: 'start' | 'center' | 'end';
}) {
  const tx = align === 'start' ? '-12px' : align === 'end' ? 'calc(-100% + 12px)' : '-50%';
  const ty = below ? '9px' : 'calc(-100% - 9px)';
  const st = {
    left: posOf(x),
    top: posOf(y),
    transform: `translate(${tx}, ${ty})`,
    '--cc': color ?? 'var(--data)',
    '--pl': align === 'start' ? '12px' : align === 'end' ? 'calc(100% - 12px)' : '50%',
  } as CSSProperties;
  return (
    <span className={`${s.callout} ${below ? s.calloutBelow : ''} num`} style={st} aria-hidden>
      {text}
    </span>
  );
}

/** Хувийн байрлалаас pill-ийн тэгшилгээ — 8%-иас ойр ирмэгт сумыг зах руу */
export const calloutAlign = (xPct: number): 'start' | 'center' | 'end' =>
  (xPct < 8 ? 'start' : xPct > 92 ? 'end' : 'center');

/**
 * HOVER/ФОКУСЫН ТЭМДЭГ (HTML) — r 3.5 дүүргэлт + 2px гадаргуун цагираг (`CHART.hoverR`).
 */
export function HoverMarker({ x, y, color }: { x: number | string; y: number | string; color?: string }) {
  return (
    <span
      className={s.hmark}
      style={{ left: posOf(x), top: posOf(y), '--cc': color ?? 'var(--data)' } as CSSProperties}
      aria-hidden
    />
  );
}

/** HOVER/ФОКУСЫН ТЭМДЭГ (SVG, бодит пикселийн viewBox-д) — `HoverMarker`-тай ижил хэмжээ */
export function SvgHoverMarker({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g aria-hidden style={{ pointerEvents: 'none' }}>
      {CHART.haloR > 0 && <circle cx={cx} cy={cy} r={CHART.haloR} style={{ fill: color, opacity: CHART.haloA }} />}
      <circle cx={cx} cy={cy} r={CHART.hoverR} style={{ fill: color, stroke: 'var(--surface)', strokeWidth: CHART.ring }} />
    </g>
  );
}

/**
 * ТЭНХЛЭГИЙН ТОО — жижиг, товч: их наяд / тэрбум / сая (бүтэн үгээр — 2026-09-04-ний
 * GeneralDash `mntShort`-ийн дүрэм: товчилсон «их н.»-ийг хэрэглэгч буцаасан).
 */
function tickText(v: number, dec: number, suffix = ''): string {
  const a = Math.abs(v);
  if (a >= 1e12) return tr('{0} их наяд', num(v / 1e12, a % 1e12 === 0 ? 0 : 1));
  if (a >= 1e9) return tr('{0} тэрбум', num(v / 1e9, a % 1e9 === 0 ? 0 : 1));
  if (a >= 1e6) return tr('{0} сая', num(v / 1e6, a % 1e6 === 0 ? 0 : 1));
  return `${num(v, dec)}${suffix}`;
}

/** Тэнхлэгийн баганын өргөн (px) — хамгийн урт шошгоор (10px tabular ≈ 5.6px/тэмдэгт) */
const axisWidth = (labels: string[]): number => Math.ceil(Math.max(1, ...labels.map((l) => l.length)) * 5.8 + 6);


/* ── Хэсэг ── */

/**
 * Дашбоардын хэсэг.
 *
 * `tone="primary"` нь тухайн самбарын ГОЛ хэсгийг заана.
 */
export function Section({
  title,
  note,
  tone,
  fill,
  collapsible,
  defaultClosed,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  tone?: 'primary';
  /**
   * Агуулгыг картын ҮЛДСЭН ӨНДРӨӨР сунгана (босоо flex).
   */
  fill?: boolean;
  /**
   * ХУРААГДДАГ хэсэг — гарчиг дээр дарж хаана/нээнэ. САНАДАГГҮЙ
   * (2026-08-21, хэрэглэгчийн хүсэлт): refresh хийхэд ҮРГЭЛЖ `defaultClosed`
   * төлөвтөө буцна — «үзье гэсэн нь нээж харна» зарчим.
   */
  collapsible?: boolean;
  /** Анхдагч нь ХААЛТТАЙ эхэлнэ (зөвхөн collapsible үед утгатай) */
  defaultClosed?: boolean;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(!!(collapsible && defaultClosed));
  const toggle = () => setClosed((v) => !v);
  return (
    <section
      className={`${s.section} ${tone === 'primary' ? s.sectionPrimary : ''} ${fill ? s.sectionFill : ''} ${collapsible && closed ? s.sectionClosed : ''}`}
      data-closed={collapsible && closed ? '' : undefined}
    >
      {title && (
        <header className={`${s.sectionHead} secHead`}>
          {collapsible ? (
            /* Гарчиг бүхэлдээ товч — жижиг сум онилохоос хялбар */
            <h3 className={`${s.sectionTitle} secTitle`}>
              <button type="button" className={s.secToggle} aria-expanded={!closed} onClick={toggle}>
                <span className={`${s.secCaret} ${closed ? s.secCaretOff : ''}`} data-ui="sec-caret" aria-hidden>▾</span>
                {title}
              </button>
            </h3>
          ) : (
            <h3 className={`${s.sectionTitle} secTitle`}>{title}</h3>
          )}
          {note && <span className={`${s.sectionNote} num`} data-ui="section-note">{note}</span>}
        </header>
      )}
      {(!collapsible || !closed) && children}
    </section>
  );
}

/* ── Байрлалын примитив ── */

/**
 * Босоо өрлөг тогтмол зайтай.
 */
export function Col({ gap = 'md', children }: { gap?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  return <div className={`${s.col} ${s[`col_${gap}`]}`}>{children}</div>;
}

/**
 * Зүүнд дүрслэл (цагираг/дугуй), баруунд тайлбар.
 * Самбаруудад хамгийн олон давтагдсан өрлөг.
 */
export function Split(
  { aside, children, asideEnd }:
  { aside: ReactNode; children: ReactNode; /** Хажуугийн блок нь БАРУУН талд */ asideEnd?: boolean },
) {
  return (
    <div className={`${s.split} ${asideEnd ? s.splitEnd : ''}`}>
      <div className={s.splitAside}>{aside}</div>
      <div className={s.splitBody}>{children}</div>
    </div>
  );
}

/** Хэсгийн доторх тайлбар бичвэр */
export function Note({ children }: { children: ReactNode }) {
  return <p className={s.noteText}>{children}</p>;
}

/* ── Таб ── */

/**
 * Самбарын доторх таб.
 *
 * Нэг модульд олон СЭДЭВ багтахад (барилгын блок, талбайн тайлан, байрлалын
 * хяналт) урт өрлөг болгохын оронд тус тусад нь салгана. Гүйлгэхэд гарчиг нь
 * дагаж явахаар наалдана — урт агуулгад аль хэсэгт байгаагаа алдахгүй.
 *
 * `count` нь тухайн табын доторх бичлэгийн тоо. `warn` нь анхаарал татах ёстой
 * тоо (жишээ нь хилээс гадуур бүртгэгдсэн тайлан) — таб нуугдсан ч тэмдэг нь
 * харагдаж, хэрэглэгч анзаарна.
 */
export function Tabs({
  items,
  value,
  onChange,
  plain,
}: {
  items: { key: string; label: string; count?: number | null; warn?: boolean }[];
  value: string;
  onChange: (key: string) => void;
  /** Зурвас БИШ, хэсгийн дотор хажуугаар байрлах товчийн багц (шугам/зайгүй) */
  plain?: boolean;
}) {
  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = plain ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    const i = items.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === keys[0]) next = (i - 1 + items.length) % items.length;
    else if (e.key === keys[1]) next = (i + 1) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0 || next === i) return;
    e.preventDefault();
    onChange(items[next].key);
    const el = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    el?.focus({ preventScroll: true });
  };

  const list = (
    <div
      className={`${s.tabs} ${plain ? s.tabsPlain : ''}`}
      role="tablist"
      aria-orientation={plain ? 'vertical' : 'horizontal'}
      onKeyDown={nav}
    >
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            // Идэвхтэй таб л Tab-аар орно; доторх шилжилт сумаар (roving tabindex)
            tabIndex={on ? 0 : -1}
            className={`${s.tab} ${on ? s.tabOn : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`${s.tabCount} ${t.warn ? s.tabCountWarn : ''} num`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
  return plain ? list : <div className={s.tabsBar}>{list}</div>;
}

/**
 * ГАРААР БИЧСЭН `role="tablist"`-ийн сумны удирдлага — ГАРААР ИДЭВХЖҮҮЛЭХ (manual activation, 2026-10-26, UX U8).
 * ←/→ (`vertical` бол ↑/↓) · Home · End нь ЗӨВХӨН фокусыг шилжүүлнэ; сонголт нь Enter/Space (товчны ердийн click).
 */
export function tabFocusNav(e: React.KeyboardEvent<HTMLElement>, vertical = false) {
  const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0 || !tabs.length) return;
  let next = -1;
  if (e.key === keys[0]) next = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === keys[1]) next = (i + 1) % tabs.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = tabs.length - 1;
  if (next < 0) return;
  e.preventDefault();
  tabs[next].focus({ preventScroll: true });
}

/** `tabFocusNav`-ийн roving tabindex: идэвхтэй таб 0; аль нь ч идэвхгүй бол ЭХНИЙХ нь 0 */
export const rovingTab = (on: boolean, index: number, anyOn: boolean): 0 | -1 => (on || (!anyOn && index === 0) ? 0 : -1);

/* ── Үзүүлэлт ── */

export function Stats({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return (
    <div
      className={[
        s.stats, 'statsGrid',
        cols === 1 ? s.stats1 : '', cols === 3 ? s.stats3 : '', cols === 4 ? s.stats4 : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export function Stat({
  value,
  unit,
  label,
  color,
  accent,
  icon,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  color?: string;
  accent?: boolean;
  /**
   * Тооны ӨМНӨ гарах дүрс (`Icon.tsx`-ийн нэр).
   */
  icon?: string;
}) {
  const long = typeof value === 'string' || typeof value === 'number'
    ? String(value).length >= 10
    : false;
  return (
    <div className={`${s.stat} statCard ${accent ? s.statAccent : ''} ${icon ? s.statHasIcon : ''}`} style={tone(color)}>
      {icon && <span className={s.statIcon} aria-hidden><Icon name={icon} /></span>}
      <div className={`${s.statValue} ${long ? s.statValueLong : ''} statNum num`}>
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={`${s.statLabel} statTag`}>{label}</div>
    </div>
  );
}

/* ── Баганан жагсаалт ── */

type Bar = {
  key: string;
  label: string;
  value: number | null;
  display?: string;
  color?: string;
  /**
   * Hover цонхны ЭХНИЙ мөр — мөрөн дээрхээс ӨӨР байж болно.
   */
  /**
   * НЭМЭЛТ ХЭМЖИГДЭХҮҮН — ХОЁР ДАХЬ ДҮҮРГЭЛТ, ӨӨР ӨНГӨӨР.
   */
  mark?: number | null;
  /** Хоёрдугаар дүүргэлтийн өнгө — заагаагүй бол анхааруулгын өнгө */
  markColor?: string;
  tipValue?: string;
  /**
   * Hover цонхны ХОЁР ДАХЬ мөр — утгын ТАЙЛБАР.
   */
  hint?: string | string[];
};

export function Bars({
  items,
  color,
  max,
  selected,
  onSelect,
  limit,
}: {
  items: Bar[];
  color?: string;
  max?: number;
  /** Сонгосон key(үүд) — олон сонголтод массив */
  selected?: string | string[] | null;
  onSelect?: (key: string) => void;
  inline?: boolean;
  /**
   * Эхэндээ хэдэн мөр харуулах. Үлдсэнийг «бүгдийг харах» товчоор нээнэ.
   */
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  // Хэмжээсийг БҮХ мөрөөр тогтооно — эс бөгөөс задлахад баганы урт үсэрнэ
  const top = fin(max ?? Math.max(1, ...items.map((i) => fin(i.value)))) || 1;
  const hidden = limit != null && !all ? Math.max(0, items.length - limit) : 0;
  const shown = hidden > 0 ? items.slice(0, limit) : items;

  if (!items.length) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  return (
    <div className={`${s.bars} barsList`}>
      {shown.map((it) => {
        const w = Math.max(0, Math.min(100, (fin(it.value) / top) * 100));
        const on = sel.includes(it.key);
        const dim = sel.length > 0 && !on;
        const hasV = it.value != null && Number.isFinite(it.value);
        const shownV = it.display ?? autoNum(it.value);
        // <button> дотор зөвхөн phrasing content зөвшөөрөгдөнө — <div> ашиглаж болохгүй
        const body = (
          <>
            <span className={s.barTop}>
              <span className={s.barName}>
                {it.color && <i className={s.barDot} style={{ background: it.color }} aria-hidden />}
                {tr(it.label)}
              </span>
              <span className={`${s.barVal} num`}>{shownV}</span>
            </span>
            <span className={`${s.barTrack} chartTrack`}>
              {hasV && <i className={`${s.barFill} chartFill`} style={{ width: `${w}%` }} />}
            </span>
            {it.mark != null && Number.isFinite(it.mark) && (
              <span className={`${s.barTrack} ${s.barTrack2} chartTrack`}>
                <i
                  className={`${s.barFill} chartFill`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (fin(it.mark) / top) * 100))}%`,
                    background: it.markColor,
                  }}
                />
              </span>
            )}
          </>
        );
        const rowCls = `${s.barRow} ${dim ? s.barRowDim : ''}`;
        const st = tone(it.color ?? color);
        const title = tipTitle(
          tr(it.label),
          String(it.tipValue ?? shownV),
          it.hint ?? (onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined),
        );
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            className={`${rowCls} ${s.barClick} ${on ? s.barOn : ''}`}
            style={st}
            title={title}
            onClick={() => onSelect(it.key)}
          >
            {body}
          </button>
        ) : (
          <div key={it.key} className={rowCls} style={st} title={title}>
            {body}
          </div>
        );
      })}

      {hidden > 0 && (
        <button type="button" className={s.more} onClick={() => setAll(true)}>
          {tr('Үлдсэн')} {hidden}{tr('-г харах')}
        </button>
      )}
      {all && limit != null && items.length > limit && (
        <button type="button" className={s.more} onClick={() => setAll(false)}>
          {tr('Хумих')}
        </button>
      )}
    </div>
  );
}

/* ── Хэмжигч (meter) ── */

/** `Meter`-ийн төлвийн өнгө — `--tone`-д буулгана */
const METER_TONE = {
  data: 'var(--data)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  mute: 'var(--ink-3)',
} as const;
export type MeterTone = keyof typeof METER_TONE;

/**
 * ХЭМЖИГЧ — нэг хувь (0–100), сонголтоор төлөвлөгөөний тэмдэгтэй.
 */
export function Meter({
  value,
  plan,
  tone: tn = 'data',
  color,
  label,
  showValue,
  display,
  decimals = 1,
  wide = false,
}: {
  /** 0–100 хувь; null = мэдээлэлгүй */
  value: number | null | undefined;
  /** Төлөвлөгөөт хувь (0–100) — лавлах зураас; null бол зураасгүй */
  plan?: number | null;
  tone?: MeterTone;
  /** Дурын өнгө (`tone`-ийг дарна) — токен байх ёстой (`var(--…)`) */
  color?: string;
  /** Мөрийн нэр — өгвөл дээр нэр + утгын мөр гарна; aria-label болно */
  label?: string;
  /** Утгыг (баруун дээд) бичих эсэх — анхдагч: `label` өгсөн үед тийм */
  showValue?: boolean;
  /** Утгын бичвэрийг дарна (жиш. «12 / 40 блок»); өгөөгүй бол `pct(value)` */
  display?: string;
  /** `pct()`-ийн аравтын орон — анхдагч 1 */
  decimals?: number;
  /** Тайлангийн толгойн том хэмжигч — 8px (`CHART.meterWideH`) */
  wide?: boolean;
}) {
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : null;
  const hasP = plan != null && Number.isFinite(plan);
  const p = hasP ? Math.max(0, Math.min(100, plan)) : null;
  const text = has ? (display ?? pct(value, decimals)) : '—';
  const head = label != null || (showValue ?? false);
  const withVal = showValue ?? label != null;
  const c = color ?? METER_TONE[tn];
  const title = tipTitle(
    label != null ? tr(label) : tr('Гүйцэтгэл'),
    text,
    hasP ? `${tr('Төлөвлөгөө')}: ${pct(plan, decimals)}` : undefined,
  );
  const bar = (
    <span
      className={`${s.meterTrack} ${wide ? s.meterWide : ''} chartTrack`}
      aria-label={label != null ? tr(label) : undefined}
      {...(v != null
        ? { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': v, 'aria-valuetext': text }
        : { role: 'img', 'aria-label': label ? `${tr(label)}: ${tr('өгөгдөлгүй')}` : tr('өгөгдөлгүй') })}
    >
      {v != null && <span className={`${s.meterFill} chartFill`} style={{ width: `${v}%` }} />}
      {p != null && <span className={s.meterPlan} style={{ left: `${p}%` }} aria-hidden />}
    </span>
  );
  return (
    <span className={s.meterRow} style={tone(c)} title={title}>
      {head && (
        <span className={s.barTop}>
          {label != null && <span className={s.barName}>{tr(label)}</span>}
          {withVal && <span className={`${s.barVal} num`}>{text}</span>}
        </span>
      )}
      {bar}
    </span>
  );
}

/* ── Хэсэгчилсэн мөр ── */

/**
 * Хэсэгчилсэн 100% зурвас.
 */
export function Stack({
  items,
  total,
  /** Доор нь тайлбар (нэр + тоо) харуулах эсэх. Чипээр давхардуулахгүйн тулд унтраана. */
  legend = true,
}: {
  items: { key: string; label: string; value: number; color?: string; display?: string }[];
  total?: number;
  legend?: boolean;
}) {
  const sum = fin(total ?? items.reduce((a, b) => a + fin(b.value), 0)) || 1;
  const has = items.some((it) => fin(it.value) > 0);
  const fillOf = (i: number) => {
    const c = items[i].color ?? 'var(--data)';
    const op = items[i].color ? explicitOp : rampOp(i);
    return `color-mix(in oklab, ${c} ${Math.round(op * 100)}%, transparent)`;
  };
  const valText = (it: { value: number; display?: string }) => it.display ?? autoNum(it.value);
  const shares = roundPctsTo100(items.map((it) => fin(it.value)), total == null ? undefined : fin(total));
  const share = (idx: number) => {
    // «0%» худал уншилтаас сэргийлнэ — Donut-ынхтой ижил дүрэм
    return fin(items[idx].value) > 0 && shares[idx] === 0 ? '<1%' : `${shares[idx]}%`;
  };
  /** Уугуул `title` — Environment `Composition`: нэг оронтой хувь */
  const titleOf = (i: number) =>
    `${tr(items[i].label)} · ${valText(items[i])} · ${((fin(items[i].value) / sum) * 100).toFixed(1)}%`;

  if (!legend) {
    return (
      <div className={s.stack}>
        {items.map((it, idx) => (fin(it.value) > 0 ? (
          <span
            key={it.key}
            className={s.stackSeg}
            style={{ width: `${(fin(it.value) / sum) * 100}%`, background: fillOf(idx) }}
            title={titleOf(idx)}
          />
        ) : null))}
      </div>
    );
  }

  if (!has) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  return (
    <div className={s.comp}>
      <div className={s.compBar}>
        {items.map((it, idx) => {
          const f = fin(it.value) / sum;
          return f > 0 ? (
            <span
              key={it.key}
              className={`${s.compSeg} num`}
              style={{ width: `${f * 100}%`, background: fillOf(idx) }}
              title={titleOf(idx)}
            >
              {f > 0.12 ? share(idx) : ''}
            </span>
          ) : null;
        })}
      </div>
      <ul className={s.legend}>
        {items.map((it, idx) => (
          <li key={it.key} className={s.legendItem} title={titleOf(idx)}>
            <span className={s.compSwatch} style={{ background: fillOf(idx) }} />
            <span className={s.legendName}>{tr(it.label)}</span>
            <span className={`${s.legendVal} num`}>
              {valText(it)} · <span className={s.legendPct}>{share(idx)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Дугуй диаграм (pie / donut) ── */

/**
 * ЗҮСМЭГИЙН ЗАМ — дүүргэлттэй annular-sector (Environment `PieChart`-ын `donutSlice`).
 */
function donutSector(cx: number, cy: number, ro: number, ri: number, f0: number, f1: number): string {
  const TAU = Math.PI * 2;
  /* 12 цагаас цагийн зүүний дагуу — `arcPath`-тай ижил чиглэл */
  const pt = (rad: number, f: number) => {
    const a = f * TAU;
    return `${Math.round((cx + rad * Math.sin(a)) * 100) / 100},${Math.round((cy - rad * Math.cos(a)) * 100) / 100}`;
  };
  const big = f1 - f0 > 0.5 ? 1 : 0;
  return `M${pt(ro, f0)} A${ro},${ro} 0 ${big} 1 ${pt(ro, f1)} L${pt(ri, f1)} A${ri},${ri} 0 ${big} 0 ${pt(ri, f0)} Z`;
}

/**
 * Хувь эзлэх байдлыг харуулах дугуй диаграм.
 */
export function Donut({
  items: rawItems,
  size: sizeIn = 'md',
  width: widthIn,
  center,
  centerLabel,
  selected,
  onSelect,
  nowrap = false,
  stack = false,
  leaders = false,
}: {
  items: { key: string; label: string; value: number; color?: string; display?: ReactNode }[];
  size?: number | DonutSize;
  /** Цагирагийн зузаан (px) — өгөөгүй бол Environment-ийн .28R */
  width?: number;
  /** Голд харуулах утга. Заагаагүй бол нийлбэр. (SVG бичвэр тул JSX-ийн текст л үлдэнэ.) */
  center?: ReactNode;
  centerLabel?: string;
  /** Сонгосон зүсмэгийн key(үүд) — идэвхтэй бол бусад нь бүдгэрнэ. Олон сонголтод массив. */
  selected?: string | string[] | null;
  /** Зүсмэг/тайлбар дарахад — байвал диаграм шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /** Тайлбарыг пайн диаграмын ХАЖУУД албадаж зэрэгцүүлнэ (доош ороохгүй) */
  nowrap?: boolean;
  /** Тайлбарыг пайн диаграмын ДООР (Environment `legend="below"` — 2 багана) */
  stack?: boolean;
  /** Тайлбарыг доор жагсаахын оронд зүсмэг бүрээс ЗУРААС татаж гадна бичнэ */
  leaders?: boolean;
  /**
   * Захын шугамын зузааны үржүүлэгч — 2026-10-09-нөөс ҮЙЛЧЛЭХГҮЙ; хуучин дуудагчид
   * эвдрэхгүйн тулд төрөлд үлдэв.
   */
  edge?: number;
}) {
  const size = typeof sizeIn === 'number' ? sizeIn : DONUT_SIZES[sizeIn][0];
  const { c: half, R: ro, r: ri } = donutGeom(size, widthIn);
  const items = rawItems.map((it, i) => ({
    ...it,
    color: it.color ?? 'var(--data)',
    op: it.color ? explicitOp : rampOp(i),
  }));
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  const hasSel = sel.length > 0;
  const isOn = (key: string) => !hasSel || sel.includes(key);
  const total = items.reduce((a, b) => a + fin(b.value), 0);
  /** Ганц ангилал (бусад нь 0) — бүтэн тойрог */
  const fullOne = items.filter((it) => fin(it.value) > 0).length === 1;

  // Зүсмэг бүрийн ЭХЛЭХ байрлал — өмнөх зүсмэгүүдийн нийлбэр
  const slices = items.reduce<((typeof items)[number] & { frac: number; offset: number })[]>((a, it) => {
    const frac = total > 0 ? fin(it.value) / total : 0;
    const prev = a[a.length - 1];
    a.push({ ...it, frac, offset: prev ? prev.offset + prev.frac : 0 });
    return a;
  }, []);

  const centerText = center == null ? autoNum(total) : nodeText(center) || autoNum(total);
  const ctrLbl = centerLabel ?? (center == null ? tr('НИЙТ') : undefined);
  const chartAttr = repChart({
    type: 'doughnut',
    title: [centerText, centerLabel].filter(Boolean).join(' '),
    cats: items.map((it) => tr(it.label)),
    series: [{ name: centerLabel ?? '', values: items.map((it) => fin(it.value)) }],
    pointColors: items.map((it) => it.color),
  });
  /**
   * ТАЙЛБАРЫН ХУВЬ — их үлдэгдлийн арга (largest remainder), хувиуд нийлээд ЯГ 100.
   */
  const pcts = roundPctsTo100(slices.map((sl) => fin(sl.value)), total, 1);
  const legendPct = (i: number) => (slices[i].frac > 0 && pcts[i] === 0 ? '<0.1%' : `${pcts[i].toFixed(1)}%`);
  /**
   * Зүсмэгийн tooltip-ийн утга.
   */
  const dispText = (sl: { display?: ReactNode }) => (sl.display == null ? '' : nodeText(sl.display));
  const tipValue = (i: number) => {
    const d = dispText(slices[i]);
    if (!d) return `${autoNum(slices[i].value)} · ${legendPct(i)}`;
    return d.includes('%') ? d : `${d} · ${legendPct(i)}`;
  };
  /** Уугуул `title` — «нэр · утга · хувь» + шүүх заавар (2026-10-23: custom tooltip-ийн оронд) */
  const titleOf = (i: number) =>
    tipTitle(tr(slices[i].label), tipValue(i), onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined);

  /**
   * Дэлгэц уншигчид зориулсан товч тойм — эхний 3 зүсмэг.
   */
  const ariaSummary =
    tr('Дугуй диаграм. Нийт {0}{1}. ', centerText, centerLabel ? ` ${centerLabel}` : '') +
    slices
      .slice(0, 3)
      .map((sl, i) => `${tr(sl.label)} ${legendPct(i)}`)
      .join(', ') +
    (items.length > 3 ? tr(', бусад {0} ангилал.', items.length - 3) : '.');

  if (!items.length || !(total > 0)) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  /**
   * ЗҮСМЭГҮҮД — доор нь бүтэн `--chart-track` бөгж (Environment `paper-hi`), дээр нь дүүргэлттэй
   * зүсмэгүүд. Энгийн ба leader горим ХОЁУЛАА энийг зурна.
   */
  const arcs = (cx: number, cy: number) => {
    const mid = (ro + ri) / 2;
    const one = fullOne ? slices.findIndex((sl) => sl.frac > 0) : -1;
    return (
      <>
        <circle className={s.donutTrack} cx={cx} cy={cy} r={mid} strokeWidth={ro - ri} />
        {one >= 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={mid}
            strokeWidth={ro - ri}
            style={{
              fill: 'none',
              stroke: slices[one].color,
              strokeOpacity: isOn(slices[one].key) ? explicitOp : 0.15,
              ...(onSelect ? { cursor: 'pointer' } : null),
            }}
            onClick={onSelect ? () => onSelect(slices[one].key) : undefined}
          >
            <title>{titleOf(one)}</title>
          </circle>
        ) : slices.map((sl, i) => (sl.frac > 0 ? (
          <path
            key={sl.key}
            d={donutSector(cx, cy, ro, ri, sl.offset, sl.offset + sl.frac)}
            style={{
              fill: sl.color,
              fillOpacity: isOn(sl.key) ? sl.op : CHART.dimFill,
              stroke: 'var(--surface)',
              strokeWidth: CHART.donutGap,
              ...(onSelect ? { cursor: 'pointer' } : null),
            }}
            onClick={onSelect ? () => onSelect(sl.key) : undefined}
          >
            <title>{titleOf(i)}</title>
          </path>
        ) : null))}
      </>
    );
  };

  /**
   * ГОЛЫН БИЧВЭР — Environment `PieChart`: дээр «НИЙТ» (size ×.08, ink-3), доор нийт (tabular,
   * 600, min(size ×.18, нүхэнд багтах)). Байрлал нь 112px-ийн −6 / +14-ийг хэмжээгээр нь сунгана.
   */
  const centerSvg = (cx: number, cy: number) => {
    const k = size / 112;
    const fs = Math.min(size * 0.18, (ri * 2 - 8) / Math.max(centerText.length * 0.64, 1));
    return (
      <>
        {ctrLbl && (
          <text x={cx} y={cy - 6 * k} textAnchor="middle" className={s.donutCtrLbl} fontSize={Math.max(8, size * 0.08)}>
            {ctrLbl}
          </text>
        )}
        <text
          x={cx}
          y={ctrLbl ? cy + 14 * k : cy + fs * 0.35}
          textAnchor="middle"
          className={`${s.donutCtrVal} num`}
          fontSize={fs}
        >
          {centerText}
        </text>
      </>
    );
  };

  /**
   * LEADER горим — тайлбарыг доор жагсаахын оронд зүсмэг бүрээс зураас татаж
   * пайн диаграмын гадна шошгыг бичнэ. Цөөн зүсмэгтэй (2–4) диаграмд тохиромжтой.
   */
  if (leaders) {
    const cx = half;
    const cy = half;
    const Ro = ro; // зүсмэгийн ГАДНА радиус
    const GAP = 16; // зурааснаас шошго хүртэл
    const PAD = 106; // хажуугийн шошгын зай — vbW нь ~панелд багтаж, масштаб ≈ 1
    const PADY = 70; // босоо зай (дээд/доод зүсмэгийн шошгонд)
    const GUTTER = 6; // зураас ба текстийн хоорондын зай
    const LW = PAD - GAP - GUTTER - 2; // шошгын хайрцгийн өргөн — бүтэн үг багтаана
    const vbW = size + PAD * 2;
    const vbH = size + PADY * 2;

    /*
     * ── ШОШГЫН ДАВХЦАЛЫГ ТАРААХ ─────────────────────────────────────────
     *
     *    Засвар: тал бүрийг (баруун/зүүн) дээрээс доош эрэмбэлж, хөрш
     *    хоёрын хооронд `MIN_GAP` зайг АЛБАДНА. Зураас нь зүсмэгээсээ
     *    шилжсэн шошго руу татагдсаар үлдэх тул холбоо алдагдахгүй.
     */
    const MIN_GAP = 26;
    const laid = slices.map((sl, i) => {
      const mid = sl.offset + sl.frac / 2;
      const th = mid * 2 * Math.PI;
      const sin = Math.sin(th);
      const cos = Math.cos(th);
      const right = sin >= 0;
      return {
        sl,
        i,
        sx: cx + Ro * sin,
        sy: cy - Ro * cos,
        ex: cx + (Ro + 12) * sin,
        ey: cy - (Ro + 12) * cos,
        right,
        lx: right ? cx + Ro + GAP : cx - Ro - GAP,
      };
    });
    ([true, false] as const).forEach((side) => {
      const col = laid.filter((x) => x.right === side).sort((a, b) => a.ey - b.ey);
      for (let i = 1; i < col.length; i += 1) {
        const need = col[i - 1].ey + MIN_GAP;
        if (col[i].ey < need) col[i].ey = need;
      }
      /* Доод ирмэгээс халисан бол БҮГДИЙГ дээш нь шилжүүлнэ */
      const over = col.length ? col[col.length - 1].ey - (vbH - PADY - 8) : 0;
      if (over > 0) col.forEach((x) => { x.ey -= over; });
    });
    return (
      <div className={s.donutLead} {...chartAttr}>
        <svg
          width={vbW}
          height={vbH}
          viewBox={`${-PAD} ${-PADY} ${vbW} ${vbH}`}
          role={onSelect ? 'group' : 'img'}
          aria-label={ariaSummary}
        >
          <g>{arcs(cx, cy)}</g>
          {centerSvg(cx, cy)}
          {/* Зураас + гадна БҮТЭН шошго (foreignObject — HTML мөр даруулна) */}
          {laid.map(({ sl, i, sx, sy, ex, ey, right, lx }) => {
            // Текст зурааснаас GUTTER-ийн зайд — давхацахгүй
            const boxX = right ? lx + GUTTER : -PAD + 2;
            const pctLbl = sl.display ?? legendPct(i);
            const on = sel.includes(sl.key);
            const boxStyle: CSSProperties = { textAlign: right ? 'left' : 'right', fontWeight: on ? 600 : undefined };
            return (
              <g
                key={sl.key}
                opacity={isOn(sl.key) ? 1 : CHART.dim}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
              >
                <polyline
                  points={`${sx},${sy} ${ex},${ey} ${lx},${ey}`}
                  strokeWidth={1}
                  style={{ fill: 'none', stroke: sl.color, strokeOpacity: sl.op }}
                />
                <circle cx={lx} cy={ey} r={1.6} style={{ fill: sl.color, fillOpacity: sl.op }} />
                <foreignObject x={boxX} y={ey - 30} width={LW} height={60}>
                  {onSelect ? (
                    <button
                      type="button"
                      className={s.donutLeadBox}
                      aria-pressed={on}
                      title={titleOf(i)}
                      style={{
                        ...boxStyle,
                        display: 'block', width: '100%', background: 'none', border: 0, padding: 0,
                        font: 'inherit', color: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <span className={s.donutLeadName}>{tr(sl.label)}</span>{' '}
                      <b className={s.donutLeadPct}>{pctLbl}</b>
                    </button>
                  ) : (
                    <div className={s.donutLeadBox} style={boxStyle} title={titleOf(i)}>
                      <span className={s.donutLeadName}>{tr(sl.label)}</span>{' '}
                      <b className={s.donutLeadPct}>{pctLbl}</b>
                    </div>
                  )}
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <div className={`${s.donutWrap} ${nowrap ? s.donutRow : ''} ${stack ? s.donutStack : ''}`} {...chartAttr}>
      <svg
        className={s.donutRing}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaSummary}
      >
        {arcs(half, half)}
        {centerSvg(half, half)}
      </svg>

      <ul className={s.donutLegend} data-ui="donut-legend">
        {slices.map((sl, i) => {
          const on = sel.includes(sl.key);
          const d = dispText(sl);
          const body = (
            <>
              <span className={s.legendSwatch} style={{ background: sl.color, opacity: sl.op }} />
              <span className={s.donutName} data-ui="donut-name">{tr(sl.label)}</span>
              <b className={`${s.donutVal} num`}>{sl.display ?? autoNum(sl.value)}</b>
              <span className={`${s.donutPct} num`}>{d.includes('%') ? '' : legendPct(i)}</span>
            </>
          );
          const st = { opacity: isOn(sl.key) ? 1 : CHART.dim };
          return onSelect ? (
            <li key={sl.key}>
              <button
                type="button"
                aria-pressed={on}
                className={`${s.donutItem} ${s.donutClick} ${on ? s.donutOn : ''}`}
                style={st}
                title={titleOf(i)}
                onClick={() => onSelect(sl.key)}
              >
                {body}
              </button>
            </li>
          ) : (
            <li key={sl.key} className={s.donutItem} style={st} title={titleOf(i)}>
              {body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Цуваа график (series) ── */

/**
 * Босоо баганан цуваа — ангилал/хугацааны цувааг харьцуулна.
 */

/**
 * СОНГОЛТЫН ТУСЛАХ — ганц утга ба МАССИВ хоёуланг зөвшөөрнө (2026-09-15,
 * ХАБЭА-гийн ArcGIS маягийн олон сонголт). `Bars`/`Donut` аль хэдийн
 * массив хүлээн авдаг байсан; `Series` л ганц утгатай үлдсэн байв.
 */
const selAny = (sel: string | readonly string[] | null | undefined): boolean =>
  sel != null && (typeof sel === 'string' || sel.length > 0);
const selHas = (sel: string | readonly string[] | null | undefined, key: string): boolean =>
  sel != null && (typeof sel === 'string' ? sel === key : sel.includes(key));

/** Хэмжигдсэн эсэх — `null`/NaN нь ЦООРХОЙ (0 биш) */
const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * Талбайн градиент — `top → CHART.areaBottom` (анхдагч `CHART.areaTop`, ганц цуваа).
 */
function AreaGrad({ id, top = CHART.areaTop, h = 100 }: { id: string; top?: number; h?: number }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
        <stop offset="0%" style={{ stopColor: 'var(--tone, var(--data))', stopOpacity: top }} />
        <stop offset="100%" style={{ stopColor: 'var(--tone, var(--data))', stopOpacity: CHART.areaBottom }} />
      </linearGradient>
    </defs>
  );
}


/**
 * ЦЭГИЙН ТУНГАЛАГ — Environment `AreaChart`: идэвхтэй (hover/сонгосон) цэггүй үед бүгд .5,
 * идэвхтэй нь 1, бусад .15 (томруулахгүй). Ганц цэгтэй хэсэг (`solo`) нь шугамгүй тул идэвхгүй
 * үед ч 1 — эс бөгөөс тэр хэмжилт бараг үл үзэгдэнэ.
 */
const dotOp = (i: number, active: number, solo: boolean): number =>
  (active < 0 ? (solo ? 1 : 0.5) : active === i ? 1 : 0.15);

/**
 * ЦЭГИЙН УТГЫН ШОШГЫГ СИЙРЭГЖҮҮЛЭХ — Environment `AreaChart labels`: эхний ба сүүлчийнх ҮРГЭЛЖ,
 * завсрынх нь `MIN` хувийн зайгаар (сүүлчийнхтэй мөргөлдөх завсрынхыг алгасна).
 */
function labelKeep(n: number, widthPx: number): (i: number) => boolean {
  if (n < 2) return () => true;
  const last = n - 1;
  const GAP = 100 / last;
  const MIN = widthPx > 0 ? (34 / widthPx) * 100 : 11;
  const step = Math.max(1, Math.ceil(MIN / GAP));
  return (i) => {
    if (i === 0 || i === last) return true;
    if (i % step !== 0) return false;
    return (last - i) * GAP >= MIN;
  };
}

/** Олон муруйн нэг шугам — `Series.lines` */
export type SeriesLineDef = {
  key: string;
  label: string;
  color: string;
  /** `items`-тэй ИЖИЛ урт, ижил дараалал. `null` = тэр үед хэмжилтгүй (цоорхой). */
  values: (number | null)[];
};

/** 10px Inter — тоо/үсгийн дундаж өргөн (px) */
const SER_CH = 5.6;

export function Series({
  items,
  color,
  height: heightIn,
  unit,
  grow = false,
  selected,
  onSelect,
  showValues,
  outline = false,
  line = false,
  lines,
}: {
  items: { key: string; label: string; value: number | null; display?: string; color?: string }[];
  color?: string;
  /**
   * Талбайн өндөр (px). 2026-10-23: Environment-ийн анхдагч — багана 130, муруй 96.
   */
  height?: number;
  unit?: string;
  /**
   * Картын үлдсэн зайг дүүргэнэ (2026-10-23: Environment `BarChart fill` / `AreaChart fill`):
   * баганын горимд тэнхлэггүй, утга оройд (12.5/600), `height` нь ХАМГИЙН БАГА өндөр;
   * муруйн горимд доод хязгаар 72px. Эцэг нь `Section fill` (эсвэл өөр босоо flex) байх ёстой.
   */
  grow?: boolean;
  /** Сонгосон баганын key — идэвхтэй бол бусад нь бүдгэрнэ */
  selected?: string | readonly string[] | null;
  /** Багана дарахад — байвал цуваа шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /**
   * Багана/цэг бүрийн утгыг БАЙНГА бичих.
   */
  showValues?: boolean;
  /** Багана нь бүтэн дүүргэлтгүй — зах нь бүтэн өнгө, дотор нь бүдэг */
  outline?: boolean;
  /**
   * Баганын оронд ЗӨӨЛӨН МУРУЙ (талбайн градиент + цэг) — Environment `AreaChart`.
   */
  line?: boolean;
  /**
   * ОЛОН МУРУЙ (2026-10-06) — `line`-тай хамт. Өгвөл `items[].value`-ийн НЭГ
   * муруйн оронд эдгээр муруйг ижил тэнхлэгт зурна; `items` нь тэнхлэг, шошго,
   * дарах талбай хэвээр. Хоосон/өгөөгүй бол ердийн нэг муруй.
   */
  lines?: SeriesLineDef[] | null;
  showMax?: boolean;
}) {
  const multi = line && !!lines && lines.length > 0;
  const height = heightIn ?? (line ? 96 : 130);
  const n = items.length;
  /** Заасан (hover/фокус) цэг/багана */
  const [hov, setHov] = useState<number | null>(null);
  const [tipRect, setTipRect] = useState<PlotRect | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [ticksRef, ticksW] = useWidth<HTMLDivElement>();
  const gid = `seriesArea${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [act, setAct] = useState<number | null>(null);
  const hovIdx = hov != null && hov < n ? hov : null;
  const actIdx = act != null && act < n ? act : n - 1;

  /**
   * Tooltip/title-ийн УТГЫН бичвэр — нэгжийг `display` өөрөө агуулаагүй үед л залгана.
   */
  const valueOf = (idx: number): string => {
    const it = items[idx];
    const disp = multi
      ? lines!.map((l) => `${l.label} ${autoNum(l.values[idx])}`).join(' · ')
      : it.display ?? autoNum(it.value);
    return unit && !multi && isNum(it.value) && !disp.includes(unit) ? `${disp} ${unit}` : disp;
  };

  const measured = multi ? lines!.some((l) => l.values.some(isNum)) : items.some((it) => isNum(it.value));
  if (!n || !measured) return <Empty label={tr('Үзүүлэлт байхгүй')} />;
  const seriesAttr = repChart(multi
    ? { type: 'line', title: unit, cats: items.map((i) => i.label), series: lines!.map((l) => ({ name: l.label, values: l.values, color: l.color })) }
    : {
      type: line ? 'line' : 'column',
      title: unit,
      cats: items.map((i) => i.label),
      series: [{ name: unit ?? '', values: items.map((i) => i.value), color: 'var(--tone)' }],
      pointColors: !line && items.some((i) => i.color) ? items.map((i) => i.color ?? 'var(--tone)') : undefined,
    });

  /** Шошго ТАЙРАГДАХ эсэх — `need` px-ийг нэг нүдэнд ноогдох өргөнтэй харьцуулна */
  const strideFor = (need: number, gapPx: number) => {
    const per = ticksW > 0 ? (ticksW - gapPx * (n - 1)) / n : 0;
    return per > 0 ? Math.max(1, Math.ceil(need / per)) : 1;
  };
  const maxLen = Math.max(...items.map((i) => tr(i.label).length));

  /* ══════════ МУРУЙН ГОРИМ — Environment `AreaChart` ══════════ */
  if (line) {
    const H = height;
    const sv = showValues ?? true;
    const pad = sv ? 15 : 3;
    const allVals = (multi ? lines!.flatMap((l) => l.values) : items.map((it) => it.value)).filter(isNum);
    const max = Math.max(1, ...allVals);
    const px = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
    const py = (v: number) => pad + (1 - v / max) * (H - pad);
    const selIdx = selAny(selected) ? items.findIndex((it) => selHas(selected, it.key)) : -1;
    const active = hovIdx ?? selIdx;
    const defs: SeriesLineDef[] = multi
      ? lines!
      : [{ key: '_', label: '', color: color ?? 'var(--data)', values: items.map((it) => it.value) }];
    const keep = labelKeep(n, ticksW);
    /*
     * X ШОШГО — Environment: БҮГД, 10px tabular ink-3 (идэвхтэй нь ink); олон (n > 8), урт (≥ 4
     * тэмдэгт) шошго 8-аас олон бол −60° хазайна. Сэлбэгийн 2026-08-20-ны дүрэм хэвээр: хазайсан
     * ч багтахгүй (өдөр тутмын урт цуваа) бол ТАЙРАХГҮЙ, сүүлчийнхээс хойш тоолж ЦӨӨЛНӨ.
     */
    const tiltWanted = n > 8 && items.some((it) => tr(it.label).length >= 4);
    const strideFlat = strideFor(maxLen * SER_CH + 8, 0);
    const strideTilt = strideFor(maxLen * SER_CH * 0.5 + 6, 0);
    const stride = tiltWanted ? strideTilt : strideFlat;
    const shownCount = items.filter((_, i) => (n - 1 - i) % stride === 0).length;
    const tilt = tiltWanted && shownCount > 8;
    const strideUse = tilt ? strideTilt : strideFlat;

    const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next = -1;
      if (e.key === 'ArrowLeft') next = Math.max(0, actIdx - 1);
      else if (e.key === 'ArrowRight') next = Math.min(n - 1, actIdx + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next < 0 || next === actIdx) return;
      e.preventDefault();
      e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button')[next]?.focus({ preventScroll: true });
    };
    const enter = (i: number) => { setHov(i); setTipRect(rectOf(plotRef.current)); };
    const leave = (i: number) => setHov((h) => (h === i ? null : h));

    /* Hover самбар — ганц муруйд эзлэх хувь ба өмнөхөөс өөрчлөлт (Environment `Tooltip`) */
    let tip: ReactNode = null;
    if (hovIdx != null && tipRect) {
      const it = items[hovIdx];
      const vAt = multi
        ? Math.max(...lines!.map((l) => l.values[hovIdx]).filter(isNum), Number.NEGATIVE_INFINITY)
        : it.value;
      const topPct = isNum(vAt) ? (py(vAt) / H) * 100 : 50;
      const sum = allVals.reduce((a, b) => a + b, 0);
      const prev = hovIdx > 0 ? items[hovIdx - 1].value : null;
      const disp = it.display ?? autoNum(it.value);
      tip = (
        <AreaTip
          rect={tipRect}
          t={px(hovIdx) / 100}
          top={topPct}
          color={multi ? 'var(--ink-3)' : (it.color ?? color ?? 'var(--data)')}
          label={tr(it.label)}
          value={disp}
          unit={unit && isNum(it.value) && !disp.includes(unit) ? unit : undefined}
          rows={multi ? lines!.map((l) => ({ key: l.key, label: l.label, value: autoNum(l.values[hovIdx]), color: l.color })) : undefined}
          share={!multi && isNum(it.value) && sum > 0 ? (it.value / sum) * 100 : null}
          delta={!multi && isNum(it.value) && isNum(prev)
            ? { sign: Math.sign(it.value - prev), text: autoNum(Math.abs(it.value - prev)) }
            : null}
          hint={onSelect ? tr('Дарж шүүнэ') : undefined}
          selected={selHas(selected, it.key)}
        />
      );
    }

    return (
      <div className={`${s.series} ${grow ? s.seriesFill : ''} seriesChart`} style={tone(color)} {...seriesAttr}>
        {(unit || multi) && (
          <div className={s.seriesUnit}>
            {multi && lines!.map((l) => (
              <span key={l.key} className={s.seriesLegend}>
                <i style={{ background: l.color }} aria-hidden />{l.label}
              </span>
            ))}
            {unit}
          </div>
        )}
        <div
          ref={plotRef}
          className={s.areaPlot}
          style={grow ? { flex: 1, minHeight: 72 } : { height: H }}
          onMouseLeave={() => setHov(null)}
        >
          <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <line key={r} className={s.trendGrid} x1={0} x2={100} y1={H * r} y2={H * r} />
            ))}
          </svg>
          {defs.map((ln, li) => {
            const segs = lineSegments(ln.values.map((v, i) => (isNum(v) ? { x: px(i), y: py(v) } : null)));
            return (
              <div key={ln.key} style={{ display: 'contents', ...(multi ? tone(ln.color) : null) }}>
                <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
                  <AreaGrad id={`${gid}${li}`} top={multi ? CHART.areaMultiTop : CHART.areaTop} h={H} />
                  {segs.filter((sg) => !sg.single).map((sg) => (
                    <Fragment key={sg.from}>
                      <path d={areaPath(sg, H)} style={{ fill: `url(#${gid}${li})` }} />
                      <path className={s.seriesLinePath} d={sg.d} />
                    </Fragment>
                  ))}
                </svg>
                {segs.flatMap((sg) => sg.pts.map((pt, j) => {
                  const i = sg.from + j;
                  return (
                    <span
                      key={items[i].key}
                      className={s.seriesLineDot}
                      style={{ left: `${pt.x}%`, top: `${(pt.y / H) * 100}%`, opacity: dotOp(i, active, sg.single) }}
                    />
                  );
                }))}
                {sv && ln.values.map((v, i) => {
                  if (!isNum(v) || !keep(i)) return null;
                  const edge = n > 1 && i === 0 ? '0%' : n > 1 && i === n - 1 ? '-100%' : '-50%';
                  return (
                    <span
                      key={items[i].key}
                      className={`${s.seriesLineVal} ${active === i ? s.seriesLineValOn : ''} num`}
                      style={{ left: `${px(i)}%`, top: `${(py(v) / H) * 100}%`, transform: `translate(${edge}, calc(-100% - 6px))` }}
                    >
                      {multi ? autoNum(v) : items[i].display ?? autoNum(v)}
                    </span>
                  );
                })}
              </div>
            );
          })}
          {/* Crosshair — Environment: tone, 1px, `2 2`, .7 */}
          {active >= 0 && (
            <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
              <line className={s.areaCross} x1={px(active)} x2={px(active)} y1={0} y2={H} />
            </svg>
          )}
          {/*
            Товших / hover талбарууд — Environment: бүтэн өндрийн нүднүүд. Шүүлтүүргүй диаграмд ч
            hover самбар гарна (товчийг `disabled` болгохгүй).
          */}
          <div className={s.areaHits} onKeyDown={nav}>
            {items.map((it, idx) => (
              <button
                key={it.key}
                type="button"
                className={`${s.areaHit} ${onSelect ? s.areaHitClick : ''}`}
                tabIndex={idx === actIdx ? 0 : -1}
                {...(onSelect ? { 'aria-pressed': selHas(selected, it.key) } : null)}
                aria-label={`${tr(it.label)}: ${valueOf(idx)}`}
                onClick={onSelect ? () => onSelect(it.key) : undefined}
                onMouseEnter={() => enter(idx)}
                onMouseLeave={() => leave(idx)}
                onFocus={() => { setAct(idx); enter(idx); }}
                onBlur={() => leave(idx)}
              />
            ))}
          </div>
        </div>
        <div className={`${s.areaTicks} ${tilt ? s.areaTicksTilt : ''}`} aria-hidden ref={ticksRef}>
          {items.map((it, i) => {
            if ((n - 1 - i) % strideUse !== 0) return null;
            const edge = tilt ? '' : n > 1 && i === 0 ? s.areaTickFirst : n > 1 && i === n - 1 ? s.areaTickLast : '';
            return (
              <span
                key={it.key}
                className={`${s.areaTick} ${edge} ${active === i ? s.areaTickOn : ''} num`}
                style={{ left: `${px(i)}%` }}
              >
                {tr(it.label)}
              </span>
            );
          })}
        </div>
        {tip}
      </div>
    );
  }

  /* ══════════ БАГАНЫН ГОРИМ — Environment `BarChart` ══════════ */
  const max = Math.max(0, ...items.map((it) => (isNum(it.value) ? it.value : 0)));
  const top = max > 0 ? max : 1;
  const showV = showValues ?? n <= 8;
  /* Дээд зай (%) — хамгийн өндөр баганын утгын бичиг багтана (Environment `room`) */
  const room = showV ? Math.min(28, (20 / height) * 100) : 6;
  const scale = (v: number) => Math.max(0, (v / top) * (100 - room));
  const axFmt = (v: number) => tickText(v, Number.isInteger(v) ? 0 : 1);
  const ratios = axFmt(top / 2) === axFmt(0) || axFmt(top / 2) === axFmt(top) ? [0, 1] : [0, 0.5, 1];
  const axLbls = ratios.map((r) => axFmt(top * r));
  const axW = Math.max(34, axisWidth(axLbls));
  const anySel = selAny(selected);
  /**
   * X ШОШГО — Environment: БҮГД, тайрагдвал «…» (бүтэн нь `title`-д).
   */
  const stride = strideFor(maxLen * SER_CH + 4, 8);

  return (
    <div className={`${s.series} ${grow ? s.seriesFill : ''} seriesChart`} style={tone(color)} {...seriesAttr}>
      {unit && <div className={s.seriesUnit}>{unit}</div>}
      <div className={s.barLayout} style={grow ? undefined : { gridTemplateColumns: `${axW}px minmax(0, 1fr)` }}>
        {!grow && (
          <div className={s.barAxis} style={{ height }} aria-hidden>
            {ratios.map((r, k) => (
              <span key={r} style={{ bottom: `${r * (100 - room)}%` }} title={axLbls[k]}>{axLbls[k]}</span>
            ))}
          </div>
        )}
        <div className={s.barMain}>
          <div className={s.barPlot} style={grow ? { minHeight: height } : { height }}>
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <span key={r} className={s.gridLine} style={{ bottom: `${r * (100 - room)}%` }} aria-hidden />
            ))}
            <div className={s.barCols}>
              {items.map((it, idx) => {
                const on = selHas(selected, it.key);
                const activeCol = !anySel || on;
                const has = isNum(it.value);
                const h = has ? scale(it.value as number) : 0;
                const title = tipTitle(tr(it.label), valueOf(idx), onSelect ? tr('Дарж шүүнэ') : undefined);
                const colStyle = it.color ? tone(it.color) : undefined;
                const inner = has ? (
                  <>
                    <span
                      className={`${s.seriesBar} ${outline ? s.seriesBarOutline : ''}`}
                      style={{ height: h > 0 ? `${h}%` : '2px', opacity: activeCol ? CHART.colOpacity : CHART.colDim }}
                    />
                    {showV && (
                      <span className={`${s.seriesVal} num`} style={{ bottom: `calc(${h}% + 5px)`, opacity: activeCol ? 1 : CHART.dim }}>
                        {it.display ?? autoNum(it.value)}
                      </span>
                    )}
                  </>
                ) : null;
                return onSelect ? (
                  <button
                    key={it.key}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${tr(it.label)}: ${valueOf(idx)}`}
                    className={`${s.seriesCol} ${s.seriesClick}`}
                    style={colStyle}
                    title={title}
                    onClick={() => onSelect(it.key)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={it.key} className={s.seriesCol} style={colStyle} title={title}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={s.seriesTicks} aria-hidden ref={ticksRef}>
            {items.map((it, i) => {
              // Сүүлчийнхээс хойш тоолсон алхам — хамгийн шинэ үе ҮРГЭЛЖ бичигдэнэ.
              const show = (n - 1 - i) % stride === 0;
              return (
                <span
                  key={it.key}
                  title={tr(it.label)}
                  className={`${s.seriesLabel} ${selHas(selected, it.key) ? s.seriesLabelOn : ''} ${stride > 1 ? s.seriesLabelWide : ''}`}
                >
                  {show ? tr(it.label) : ''}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Сонгогч ── */

/**
 * Жагсаалтаас нэгийг сонгоно.
 */
export function Select({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
  label: string;
}) {
  return (
    <select
      className={s.select}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

/* ── Цаг хугацааны муруй ── */

export type TrendPoint = {
  /** Тэнхлэгийн шошго — «2026-07-20» / «2026-07» */
  label: string;
  /**
   * Хэмжсэн утга. `null` = ХЭМЖИГДЭЭГҮЙ — муруй тэнд ТАСАРНА.
   */
  value: number | null;
  /** Уншилтын мөрөнд гарах нэмэлт тайлбар — «113 блок» */
  note?: string;
};

/**
 * Нэг цувааны шугаман график — хугацааны явцыг харуулна.
 */
/**
 * Тэнхлэгийн шошго — цэг бүрийн БОДИТ бүртгэлийн огноо (`note` нь сарын шошгоны
 * доорх жинхэнэ огноо). Он нь ЗӨВХӨН сольсон цэгт бичигдэнэ: «2025-10-31 ·
 * 11-02 · 12-31 · 2026-03-20 …» — 10 гаруй шошго нарийн самбарт ч давхцахгүй.
 */
/**
 * Тэнхлэгийн шошго — ХЭДХЭН цэг дээр л.
 *
 * Одоо шошгын хоорондох ХАМГИЙН БАГА ЗАЙГ (`TICK_PX`) баталгаажуулна:
 * хэмжсэн өргөнөөс индексийн алхмыг гаргаж, БҮХЭЛ тоон алхмаар түгээнэ —
 * ингэснээр дугуйруулалт зайг богиносгох боломжгүй.
 */
const MAX_TICKS = 6;
/** 10px Inter — тоо/зураас/цэгийн дундаж өргөн (px). Шошго нь `.num` (tabular). */
const LBL_CH = 5.6;
function axisTicks(points: TrendPoint[], width: number): string[] {
  const n = points.length;
  const keep = new Set<number>([0, n - 1]);
  // Хэмжигдээгүй (эхний кадр) эсвэл 2 цэгтэй бол зөвхөн хоёр ирмэг.
  if (n > 2 && width > 0) {
    /**
     * Шошгонд хэрэгтэй зайг ТОГТМОЛ БИШ, БОДИТ уртаас нь гаргана.
     */
    const need = Math.max(...points.map((p) => (p.note ?? p.label).length)) * LBL_CH + 10;
    const perIdx = width / (n - 1); // хоёр хөрш цэгийн хоорондох px
    const stride = Math.max(1, Math.ceil(need / perIdx));
    const t = Math.max(2, Math.min(MAX_TICKS, Math.floor((n - 1) / stride) + 1));
    const step = Math.max(stride, Math.floor((n - 1) / (t - 1)));
    for (let i = 1; i < t; i++) if (i * step < n - 1) keep.add(i * step);
    const lastTick = (t - 1) * step;
    if (n - 1 - lastTick < stride) keep.delete(lastTick);
    keep.add(n - 1);
  }
  /**
   * Он нь ЗӨВХӨН сольсон шошгонд бичигдэнэ.
   */
  let year = '';
  const out = points.map(() => '');
  [...keep].sort((a, b) => a - b).forEach((i) => {
    const d = points[i].note ?? points[i].label;
    const y = d.slice(0, 4);
    const full = !/^\d{4}-/.test(d) || y !== year;
    if (full) year = y;
    out[i] = full ? d : d.slice(5);
  });
  return out;
}

/**
 * ЗӨӨЛӨН МУРУЙН ЗАМ — МОНОТОН кубик (Fritsch–Carlson).
 */
export { monotonePath };

export function Trend({
  points,
  color,
  height = 132,
  unit = '%',
  fmt,
  visible,
  showValues = true,
  alert,
  smooth = false,
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
  /**
   * Утгыг ХЭРХЭН бичих. Анхдагч нь `autoNum` (мянгатын таслал; бүхэл «26», бутархай «26.3»).
   */
  fmt?: (v: number) => string;
  /**
   * Нэг дэлгэцэнд ХЭДЭН цэг багтах вэ. Заавал бол зурагдах талбар нь
   * хэвтээ гүйдэг болж, тэнхлэгт цэг БҮРИЙН огноо/цаг хоёр мөрөөр гарна.
   * Орхивол хуучин зан хэвээр: бүх цэг өргөнд шахагдаж, тэнхлэгт хамгийн
   * ихдээ `MAX_TICKS` шошго л гарна.
   */
  visible?: number;
  /**
   * Цэг бүрийн утгыг муруйн дээр тоогоор бичих эсэх.
   */
  showValues?: boolean;
  /**
   * Анхааруулгын босго — шугам зурж, түүнээс ДЭЭШ гарсан цэгүүдийг улаанаар
   * онцолно. Чиглэл нь үргэлж «дээш» (дуудагч тал утгаа тэр дагуу сонгоно).
   */
  alert?: { value: number; note?: string };
  /**
   * Хугарсан шугамын оронд ЗӨӨЛӨН муруй.
   */
  smooth?: boolean;
  showMax?: boolean;
}) {
  const [hov, setHov] = useState<number | null>(null);
  const [tipRect, setTipRect] = useState<PlotRect | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Тэнхлэгийн БОДИТ өргөн — хэдэн шошго давхцалгүй багтахыг үүгээр шийднэ.
  const [axisRef, axisW] = useWidth<HTMLDivElement>();
  const gradId = `trendArea${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  /** Утга бичих дүрэм — өгөөгүй бол `autoNum` (мянгатын таслал; бүхэл «26», бутархай «26.3»). */
  const fmtV = fmt ?? autoNum;

  const [hovLen, setHovLen] = useState(points.length);
  if (hovLen !== points.length) {
    setHovLen(points.length);
    setHov(null);
  }

  const scRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points.length]);

  if (points.length < 2) return <Empty label={tr('Цуваа зурахад хангалттай бүртгэл алга.')} />;
  if (!points.some((p) => p.value != null && Number.isFinite(p.value))) {
    return <Empty label={tr('Энэ хугацаанд хэмжилт бүртгэгдээгүй.')} />;
  }

  const meas = points.map((p) => p.value).filter((v): v is number => v != null && Number.isFinite(v));
  const peak = Math.max(...meas, alert ? alert.value : 0, 0);
  const low = Math.min(...meas, alert ? alert.value : 0, 0);
  const bot = low;
  const top = peak > bot ? peak : bot + 1;
  const H = height;
  const pad = showValues ? 15 : 3;
  const n = points.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => pad + (1 - (fin(v) - bot) / (top - bot)) * (H - pad);
  const yPct = (v: number) => (y(v) / H) * 100;

  const segs = lineSegments(
    points.map((p, i) => (p.value != null && Number.isFinite(p.value) ? { x: x(i), y: y(p.value) } : null)),
    { smooth },
  );

  /** Цэг нь босгонд ХҮРСЭН/давсан уу */
  const over = (v: number | null) => alert != null && v != null && Number.isFinite(v) && v >= alert.value;
  const alertY = alert ? y(alert.value) : 0;

  /**
   * ХЭВТЭЭ ГҮЙЛТ ба ЦЭГ БҮРИЙН ШОШГО — хоёр ТУСДАА шийдэл.
   */
  const perPoint = visible != null && visible > 1;
  const scroll = perPoint && n > visible;
  const innerW = scroll ? ((n - 1) / (visible - 1)) * 100 : 100;
  const curIdx = hov != null && hov < n ? hov : n - 1;
  const active = hov != null && hov < n ? hov : -1;

  const xLbls = perPoint ? null : axisTicks(points, axisW);
  const tilt = xLbls != null && n > 8 && xLbls.some((t) => t.length >= 4) && xLbls.filter(Boolean).length > 8;
  const solo = new Set(segs.filter((sg) => sg.single).map((sg) => sg.from));
  const keep = labelKeep(n, axisW);

  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    if (e.key === 'ArrowLeft') next = Math.max(0, curIdx - 1);
    else if (e.key === 'ArrowRight') next = Math.min(n - 1, curIdx + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0 || next === curIdx) return;
    e.preventDefault();
    // focus() нь onFocus-оор setHov-ийг өөрөө дуудна; preventScroll — самбарын
    // гүйлтийг үсэргэхгүй (Tabs-ын ижил болгоомжлол).
    const btn = e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next];
    btn?.focus({ preventScroll: true });
    const sc = scRef.current;
    if (!btn || !sc || sc.scrollWidth <= sc.clientWidth) return;
    const b = btn.getBoundingClientRect();
    const c = sc.getBoundingClientRect();
    const PAD = 24; // цэгийн шошго ирмэгт наалдахгүй байх зай
    if (b.left - PAD < c.left) sc.scrollLeft -= c.left - b.left + PAD;
    else if (b.right + PAD > c.right) sc.scrollLeft += b.right - c.right + PAD;
  };
  const enter = (i: number) => { setHov(i); setTipRect(rectOf(plotRef.current)); };
  const leave = (i: number) => setHov((h) => (h === i ? null : h));

  let tip: ReactNode = null;
  if (active >= 0 && tipRect) {
    const p = points[active];
    const prev = active > 0 ? points[active - 1].value : null;
    const has = p.value != null && Number.isFinite(p.value);
    tip = (
      <AreaTip
        rect={tipRect}
        t={x(active) / 100}
        top={has ? yPct(p.value as number) : 50}
        color={over(p.value) ? 'var(--bad)' : (color ?? 'var(--data)')}
        label={tr(p.label)}
        value={has ? fmtV(p.value as number) : '—'}
        unit={has ? unit.trim() || undefined : undefined}
        delta={has && prev != null && Number.isFinite(prev)
          ? { sign: Math.sign((p.value as number) - prev), text: fmtV(Math.abs((p.value as number) - prev)) }
          : null}
        hint={p.note}
      />
    );
  }

  return (
    <div
      className={s.trend}
      style={tone(color)}
      {...repChart({ type: 'line', cats: points.map((p) => tr(p.label)), series: [{ name: unit, values: points.map((p) => p.value), color: 'var(--tone)' }] })}
    >
      <div ref={scRef} className={scroll ? s.trendScroll : undefined}>
        <div style={scroll ? { width: `${innerW}%` } : undefined}>
          <div
            ref={plotRef}
            className={`${s.trendPlot} ${active >= 0 ? s.trendPlotHov : ''}`}
            style={{ height }}
            onKeyDown={nav}
          >
            <svg className={s.trendSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <line key={r} className={s.trendGrid} x1="0" x2="100" y1={H * r} y2={H * r} />
              ))}
              <AreaGrad id={gradId} h={H} />
              {segs.filter((sg) => !sg.single).map((sg) => (
                <g key={`r${sg.from}`}>
                  <path d={areaPath(sg, H)} style={{ fill: `url(#${gradId})` }} />
                  <path className={s.trendLine} d={sg.d} />
                </g>
              ))}
              {/* Crosshair — Environment: tone, 1px, `2 2`, .7 */}
              {active >= 0 && (
                <line className={s.areaCross} x1={x(active)} x2={x(active)} y1={0} y2={H} />
              )}
              {/* Босгын шугам — муруйн ДЭЭГҮҮР зурагдана (эс бөгөөс градиент дарна) */}
              {alert ? (
                <line className={s.trendThresh} x1="0" y1={alertY} x2="100" y2={alertY} />
              ) : null}
            </svg>

            {/* Босгын тоо — шугамын баруун үзүүрт. `title`-д нь шалтгаан. */}
            {alert ? (
              <span
                className={s.trendThreshTag}
                style={{ top: `${(alertY / H) * 100}%` }}
                title={alert.note ?? ''}
              >
                {fmtV(alert.value)}{unit}
              </span>
            ) : null}

            {/* ЦЭГ БҮРИЙН УТГА — Environment `AreaChart labels` (давхцвал алгасна, ирмэгийнх дотогш) */}
            {showValues && points.map((p, i) => {
              if (p.value == null || !Number.isFinite(p.value) || !keep(i)) return null;
              const edge = i === 0 ? '0%' : i === n - 1 ? '-100%' : '-50%';
              return (
                <span
                  key={`v${i}`}
                  className={`${s.trendVal} ${active === i ? s.trendValOn : ''} ${over(p.value) ? s.trendValAlert : ''} num`}
                  style={{ left: `${x(i)}%`, top: `${yPct(p.value)}%`, transform: `translate(${edge}, calc(-100% - 6px))` }}
                >
                  {fmtV(p.value)}
                </span>
              );
            })}

            {points.map((p, i) => (
              <button
                key={i}
                type="button"
                tabIndex={curIdx === i ? 0 : -1}
                className={`${s.trendHit} ${active === i ? s.trendHitOn : ''}`}
                style={{ left: `${x(i)}%` }}
                aria-label={`${p.label}: ${p.value == null ? tr('хэмжигдээгүй') : `${fmtV(p.value)}${unit}`}${p.note ? ` · ${p.note}` : ''}`}
                onMouseEnter={() => enter(i)}
                onMouseLeave={() => leave(i)}
                onFocus={() => enter(i)}
                onBlur={() => leave(i)}
              >
                {p.value != null && (
                  <span
                    className={`${s.trendDot} ${solo.has(i) ? s.trendDotSolo : ''} ${over(p.value) ? s.trendDotAlert : ''}`}
                    style={{ top: `${yPct(p.value)}%` }}
                  />
                )}
              </button>
            ))}
          </div>

          <div
            className={`${s.trendAxis} ${perPoint ? s.trendAxisTwoLine : ''} ${tilt ? s.trendAxisTilt : ''}`}
            ref={axisRef}
          >
            {perPoint
              ? /* Цэг БҮРД шошго — 8 л харагдах тул давхцахгүй. Огноо
                   эхний мөрөнд, цаг нь дараагийн мөрөнд. */
                points.map((p, i) => {
                  const sp = p.label.indexOf(' ');
                  const day = sp < 0 ? p.label : p.label.slice(0, sp);
                  const clock = sp < 0 ? '' : p.label.slice(sp + 1);
                  return (
                    <span key={i} className={`${s.trendAxisTick} ${active === i ? s.trendAxisTickOn : ''}`} style={{ left: `${x(i)}%` }}>
                      <span className={s.trendTickDay}>{day}</span>
                      {clock ? <span className={s.trendTickClock}>{clock}</span> : null}
                    </span>
                  );
                })
              : (xLbls ?? []).map((t, i) => (t ? (
                  <span key={i} className={`${s.trendAxisTick} ${active === i ? s.trendAxisTickOn : ''}`} style={{ left: `${x(i)}%` }}>
                    {t}
                  </span>
                ) : null))}
          </div>
        </div>
      </div>
      {tip}
    </div>
  );
}

/* ── Цагираг ── */

/**
 * Цагираг.
 *
 * `value` нь `null` бол «—» харуулна. Хоосон өгөгдлийг `?? 0` гэж дүүргэвэл
 * «0.0%» гэсэн ХУДАЛ утга гарч, жинхэнэ 0%-аас ялгагдахгүй болно.
 */
export function Ring({
  value,
  size: sizeIn = 'sm',
  width: widthIn,
  color,
  label,
  decimals,
  text,
}: {
  /** 0–100, эсвэл өгөгдөлгүй бол null */
  value: number | null | undefined;
  size?: number | RingSize;
  /** Цагирагийн зузаан — өгөөгүй бол Environment `PieChart`-ын геометр (дотоод .72R) */
  width?: number;
  color?: string;
  label?: string;
  /** Аравтын орны тоог албадан заана; өгөөгүй бол <10 үед 1, эс бөгөөс 0 */
  decimals?: number;
  text?: string;
}) {
  const size = typeof sizeIn === 'number' ? sizeIn : RING_SIZES[sizeIn];
  const { c, R, r: ri } = donutGeom(size, widthIn);
  const mid = (R + ri) / 2;
  const width = R - ri;
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const circ = 2 * Math.PI * mid;
  const shown = has ? (text ?? `${v.toFixed(decimals ?? (v < 10 ? 1 : 0))}%`) : '—';
  const k = size / 112;
  const fs = Math.min(size * 0.18, (ri * 2 - 8) / Math.max(shown.length * 0.64, 1));

  return (
    <div
      className={s.ring}
      style={{ ...tone(color), width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(has ? { 'aria-valuenow': v, 'aria-valuetext': shown } : { 'aria-valuetext': tr('өгөгдөлгүй') })}
      {...(has ? repChart({
        type: 'doughnut',
        title: label ? `${label}: ${shown}` : shown,
        cats: [label ?? tr('Гүйцэтгэл'), tr('Үлдсэн')],
        series: [{ name: label ?? '', values: [v, Math.max(0, 100 - v)] }],
        pointColors: ['var(--tone)', 'E3E7EA'],
        pct: !text,
        hideLabels: text ? [0, 1] : [1],
      }) : {})}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className={s.ringTrack} cx={c} cy={c} r={mid} strokeWidth={width} />
        {has && v > 0 && (
          <circle
            className={s.ringArc}
            cx={c}
            cy={c}
            r={mid}
            strokeWidth={width}
            strokeDasharray={`${circ * (v / 100)} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        {label && (
          <text x={c} y={c - 6 * k} textAnchor="middle" className={s.ringLabel} fontSize={Math.max(8, size * 0.08)}>
            {label}
          </text>
        )}
        <text
          x={c}
          y={label ? c + 14 * k : c + fs * 0.35}
          textAnchor="middle"
          className={`${s.ringValue} num`}
          fontSize={fs}
        >
          {shown}
        </text>
      </svg>
    </div>
  );
}

/* ── Түлхүүр → утга ── */

/**
 * Түлхүүр → утга жагсаалт (Environment `KeyValue`).
 */
export function Rows({ items }: { items: { key: string; value: ReactNode; tone?: string }[] }) {
  return (
    <div className={`${s.rows} rowsList`}>
      {items.map((r) => (
        <div key={r.key} className={s.row}>
          <span className={s.rowKey} data-ui="row-key">
            {r.tone && (
              <i
                className={s.rowDot}
                style={{ background: r.tone.startsWith('--') ? `var(${r.tone})` : r.tone }}
                aria-hidden
              />
            )}
            {r.key}
          </span>
          <span className={`${s.rowVal} num`} data-ui="row-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Сонгож болох жагсаалт ── */

export function List({ children }: { children: ReactNode }) {
  return <div className={s.list}>{children}</div>;
}

export function ListItem({
  title,
  sub,
  value,
  color,
  active,
  onClick,
}: {
  title: string;
  sub?: string;
  value?: ReactNode;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className={s.legendDot} style={{ background: color ?? 'var(--hue)' }} />
      <span className={s.listMain}>
        <span className={s.listTitle}>{title}</span>
        {sub && <span className={s.listSub}>{sub}</span>}
      </span>
      {value != null && <span className={`${s.listVal} num`}>{value}</span>}
    </>
  );
  // Нарийн баганад урт нэр таслагдана — бүтнээр нь hover-ээр л уншина
  const full = sub ? `${title} — ${sub}` : title;
  return onClick ? (
    <button
      type="button"
      aria-pressed={active}
      title={full}
      className={`${s.listItem} ${active ? s.listOn : ''}`}
      style={tone(color)}
      onClick={onClick}
    >
      {inner}
    </button>
  ) : (
    <div className={s.listItem} title={full} style={tone(color)}>
      {inner}
    </div>
  );
}

/* ── Төлөв ── */

export function Loading({ label = tr('Ачаалж байна…'), minH }: { label?: string; minH?: number }) {
  /**
   * УДААН гэдгийг ил хэлэх (2026-09-02 аудит).
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={s.state} role="status" aria-live="polite" style={minH ? { minHeight: minH } : undefined}>
      <Loader2 className={s.spinner} size={18} strokeWidth={1.75} aria-hidden />
      {label}
      {slow && (
        <span className={s.slowHint}>
          {tr('Их хэмжээний өгөгдөл татаж байна — сүлжээнээс шалтгаалж хэдэн арван секунд авч болно.')}
        </span>
      )}
    </div>
  );
}

/**
 * Хоосон төлөв.
 *
 * `label` нь ганц ЗААВАЛ талбар хэвээр — 33 дуудагчийн нэг нь ч өөрчлөгдөхгүй.
 */
export function Empty({
  label,
  hint,
  onRetry,
}: {
  label: string;
  icon?: string;
  /** Дараа нь ЮУ хийхийг заана — хоосон дэлгэц бол урилга байх ёстой */
  hint?: ReactNode;
  /**
   * АЛДААНААС үүссэн хоосон төлөвт «Дахин оролдох».
   */
  onRetry?: () => void;
}) {
  return (
    <div className={`${s.state} ${s.empty}`} role={onRetry ? 'alert' : undefined}>
      <span className={s.emptyLabel}>{label}</span>
      {hint && <span className={s.emptyHint}>{hint}</span>}
      {onRetry && (
        <button type="button" className={s.retryBtn} onClick={onRetry}>
          {tr('Дахин оролдох')}
        </button>
      )}
    </div>
  );
}

/**
 * АЛДААГ ХЭРЭГЛЭГЧИЙН ХЭЛЭЭР (2026-09-30).
 */
export function friendlyError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const m = String((e as { message?: string } | null)?.message ?? e ?? '').toLowerCase();
  if (isChunkLoadError(e)) return chunkErrorText();
  if ((e as { sessionExpired?: boolean } | null)?.sessionExpired === true) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  if (name === 'TimeoutError' || /timeout|timed out|хугацаа хэтэр/.test(m)) {
    return tr('Сервер удаан хариулж байна. Хэсэг хүлээгээд дахин оролдоно уу.');
  }
  if (/failed to fetch|networkerror|network error|load failed|err_internet|offline/.test(m)) {
    return tr('Сүлжээний холболт тасарсан бололтой. Интернэтээ шалгаад дахин оролдоно уу.');
  }
  if (/\b498\b|invalid token|token.*expired|expired.*token|токен/.test(m)) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  if (/\b(401|403|499)\b|not authorized|permission|token required|access denied|эрх/.test(m)) {
    return tr('Энэ өгөгдөлд хандах эрх алга байна. Админд хандана уу.');
  }
  return tr('Түр алдаа гарлаа. Дахин оролдоно уу — давтагдвал админд мэдэгдэнэ үү.');
}

/**
 * ДЭЛГЭЦЭНД гарах алдааны мөр (2026-10-04) — `catch`-ийн `setErr`/`toast`-д.
 */
export function userError(e: unknown): string {
  const raw = String((e as { message?: string } | null)?.message ?? e ?? '').trim();
  const msg = [...new Set(raw.split(' · ').map((x) => x.trim()).filter(Boolean))].join(' · ');
  const CYR = /[Ѐ-ӿ]/;
  if (!msg || !CYR.test(msg)) return friendlyError(e);
  const tail = /^(.*[Ѐ-ӿ][^:]*):\s*([^Ѐ-ӿ]+)$/.exec(msg);
  if (tail && /[A-Za-z]{3,}/.test(tail[2])) return `${tail[1]}: ${friendlyError(tail[2])}`;
  return msg;
}

/**
 * Async төлөвийг зурна.
 * Алдааг ҮРГЭЛЖ харуулна — өгөгдөл татагдаагүй үед хуучин/зохиомол тоо
 * дэлгэц дээр үлдэх боломжгүй.
 */
export function Data<T>({
  q,
  children,
  loading,
  minH,
}: {
  q: Async<T>;
  children: (data: T) => ReactNode;
  loading?: string;
  /**
   * Ачаалах/алдааны төлөвт ЭЗЛЭХ доод өндөр (px).
   */
  minH?: number;
}) {
  if (q.state === 'loading') return <Loading label={loading} minH={minH} />;
  if (q.state === 'error') {
    return (
      <div className={s.state} role="alert" style={minH ? { minHeight: minH } : undefined}>
        <strong className={s.error}>{tr('Өгөгдөл татагдсангүй')}</strong>
        <span className={s.errorMsg}>{friendlyError(q.error)}</span>
        {q.error.message && (
          <details className={s.errorMsg}>
            <summary style={{ cursor: 'pointer' }}>{tr('Техникийн дэлгэрэнгүй')}</summary>
            <span style={{ wordBreak: 'break-word' }}>{q.error.message}</span>
          </details>
        )}
        {/* ArcGIS түр гацах нь энгийн — бүтэн refresh хийлгэхгүйгээр энэ
            хүсэлтийг л дахин явуулна (`useAsync`-ийн retry) */}
        {q.retry && (
          <button type="button" className={s.retryBtn} onClick={q.retry}>
            {tr('Дахин оролдох')}
          </button>
        )}
      </div>
    );
  }
  return <>{children(q.data)}</>;
}
