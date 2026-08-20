'use client';

import React, { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Async } from '@/lib/useAsync';
import { Icon } from './Icon';
import s from './ui.module.css';

/* ⚠️ envhub-ийн гол дүрэм: чартын анхдагч өнгө нь МОДУЛИЙН биш, НЭГ өгөгдлийн
   өнгө (--data). Дуудагч өнгө өгвөл түүнийг л хүндэтгэнэ (газрын зурагтай
   уялдсан өнгөнүүд хэвээр ажиллана). `?? var(--data)` fallback-ийг хасаж
   болохгүй — --tone удамшдаг тул дотор давхарласан дуудлагад алдаа гарна. */
const tone = (c?: string) => ({ '--tone': c ?? 'var(--data)' }) as CSSProperties;

/**
 * Тоо БИШ утгыг 0 болгоно.
 *
 * ⚠️ 2026-08-18: Яагаад ЗААВАЛ примитив дотор. ArcGIS-ийн олон талбар нь ТЕКСТ
 * төрөлтэй бөгөөд «80%» гэх мэт тэмдэгт агуулдаг; дуудагч түүнийг `Number()`-ээр
 * хөрвүүлэхэд `NaN` гарна. NaN нь `Math.max`-аар дамжихад дээд хязгаар нь ч NaN
 * болж, `width: NaN%` гэсэн ХҮЧИНГҮЙ CSS үүснэ. Browser хүчингүй зарлалыг ҮЛ
 * ХЭРЭГСДЭГ тул `.barFill` (display:block) нь эцгийнхээ 100%-ийг эзэлж, БҮХ
 * багана ДҮҮРЭН зурагдана — өөрөөр хэлбэл өгөгдөл эвдэрсэн үед график нь
 * «бүгд 100%» гэсэн ХУДАЛ уншилт өгдөг байв. Дуудагч бүрийг найдвартай
 * болгохын оронд примитив өөрөө ийм утгыг 0 гэж үзнэ: багана нь хоосон
 * харагдаж, алдаа нүдэнд шууд илэрнэ.
 */
const fin = (v: number) => (Number.isFinite(v) ? v : 0);

/* ── Хулганы тайлбар (tooltip) ─────────────────────────────────────────────
   ЭКСПОРТЛОХГҮЙ дотоод хэрэгсэл. `Bars`/`Stack`/`Series`/`Donut` дөрвүүлээ
   энийг хэрэглэнэ.

   ⚠️ Яагаад `title=`-г орлуулав:
     • ~1 секунд хүлээдэг — өгөгдөл шалгаж яваа хүнд удаан;
     • ХҮРЭЛТЭЭР (touch) огт гарахгүй — таблетаас үзэгчид юу ч авахгүй;
     • загварыг нь удирдах боломжгүй (системийн хайрцаг, горим дагахгүй);
     • ганц мөр текстээс өөр юу ч багтахгүй (өнгөт тэмдэг, нэгж, тайлбар үгүй).

   ⚠️ Яагаад `position: fixed`:
   Самбарууд нь `.panel { overflow:hidden }`, `.panelBody { overflow-y:auto }`,
   AgentChat-ийн `.chart { overflow-x:auto }` гэсэн ГУРВАН тайрагч эцгийн дотор
   байдаг. `absolute` нь тэднээр тайрагдана. Эдгээр эцгүүдийн аль нь ч
   `transform/filter/contain` эзэмшдэггүй (шалгасан) тул `fixed` нь агуулах
   блок үүсгэхгүй — бүх тайралтаас чөлөөтэй гарна. `body { overflow: hidden }`
   учир гүйлтийн шилжилт тооцох шаардлагагүй, цонхны хэмжээ шууд хүчинтэй.

   ⚠️ `createPortal` ХЭРЭГГҮЙ (төсөлд хаана ч ашиглагдаагүй, ssr:false-тэй
   харилцан үйлчлэл нэмэхээс зайлсхийв). */

type TipData = { x: number; y: number; label: string; value: string; color?: string; hint?: string };

const TIP_DELAY = 60; // мс — `title`-ийн ~1000-ын оронд
const TIP_OFF = 14; // заагуураас хол зай

function useTip() {
  const [tip, setTip] = useState<TipData | null>(null);
  /**
   * ⚠️ 2026-08-18: Таймер нь ЗААВАЛ ref — урьд нь `useState` байсан бөгөөд
   * `setTimeout`-ыг state updater-ийн ДОТОР үүсгэдэг байв. React updater-ийг
   * нэгээс олон удаа дуудаж болно (StrictMode-ийн давхар дуудалт, concurrent
   * рендерийн дахин тоглолт) — тэр үед хадгалагдаагүй ӨНЧИН таймер үлдэж,
   * `hide()` цэвэрлэх юмгүй өнгөрдөг. Өнчин таймер хожим асахад tooltip нь
   * заагуур яваад өгсний ДАРАА дэлгэц дээр гарч ЗҮҮГДЭЖ үлддэг байлаа.
   */
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
    // ⚠️ Хүлээгдэж буй заагуурын таймерыг зогсооно — эс бөгөөс тэр нь хожим
    //    асаад фокусын байрлалыг ХУУЧИН заагуурынхаар дарж бичнэ.
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
  const flipX = x > window.innerWidth - 280;
  const flipY = y < 110;
  const c = color ?? 'var(--data)';
  return (
    /* envhub-ийн tooltip бүтэц: өнгөөр будсан толгойн зурвас (цэг + нэр),
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
        <b className={`${s.tipVal} num`} style={{ color: c }}>{value}</b>
        {hint && <span className={s.tipHint}>{hint}</span>}
      </span>
    </div>
  );
}

/* ── Хэсэг ── */

/**
 * Дашбоардын хэсэг.
 *
 * `tone="primary"` нь тухайн самбарын ГОЛ хэсгийг заана — модулийн өнгөөр зүүн
 * ирмэг татаж, дэвсгэрийг нь өргөнө.
 *
 * ⚠️ Самбар бүрд НЭГ л primary байна. Урьд нь 6-7 хэсэг дараалахад бүгд ижил
 * жинтэй байсан тул хэрэглэгч аль нь гол вэ гэдгийг ялгаж чаддаггүй байв —
 * хоёр, гурав нь онцлогдвол тэр асуудал шийдэгдэхгүй, зөвхөн шилжинэ.
 */
export function Section({
  title,
  note,
  tone,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  tone?: 'primary';
  children: ReactNode;
}) {
  return (
    <section className={`${s.section} ${tone === 'primary' ? s.sectionPrimary : ''}`}>
      {title && (
        <header className={s.sectionHead}>
          <h3 className={s.sectionTitle}>{title}</h3>
          {note && <span className={s.sectionNote}>{note}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ── Байрлалын примитив ── */

/**
 * Босоо өрлөг тогтмол зайтай.
 *
 * ⚠️ Эдгээр примитивээс өмнө самбарууд `style={{ marginTop: 16 }}`-ыг 40 гаруй
 * газар гараар бичдэг байв. Утга нь 10, 12, 14, 16 гэж санамсаргүй хэлбэлзэж,
 * нэг самбарын дотор ч жигдэрдэггүй байлаа.
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

/** Хэсгийн доторх дэд гарчиг — Section-ыг дахин давхарлахгүйгээр бүлэглэнэ */
export function SubHead({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.subHead}>
      {children}
      {note && <span className={s.subNote}>{note}</span>}
    </div>
  );
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
  /**
   * ⚠️ 2026-08-17: ГАРЫН удирдлага. Урьд нь `role="tablist"`/`role="tab"` гэж
   * зарласан ч сумны товч ажилладаггүй байсан — таб гэж зарлачихаад тэр зан
   * төлөвийг өгөхгүй байх нь ердийн товчноос ч ДОР (уншигч «сумаар сонго» гэж
   * зөвлөнө, гэтэл ажиллахгүй).
   *
   * ⚠️ `aria-controls` НЭМЭХГҮЙ: ~20 дуудагчийн самбарууд id-гүй тул байхгүй
   * id заах нь огт заахаас дор.
   *
   * ⚠️ `preventScroll` — `.tabs` нь `position: sticky`. Ердийн `focus()` нь
   * элементийг харагдуулах гэж гүйлгэхдээ табыг ӨӨРИЙНХ нь наалдсан толгойн
   * доогуур оруулж нууж орхино.
   */
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

  return (
    <div className={`${s.tabs} ${plain ? s.tabsPlain : ''}`} role="tablist" onKeyDown={nav}>
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
}

/* ── Үзүүлэлт ── */

export function Stats({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <div className={`${s.stats} ${cols === 3 ? s.stats3 : ''} ${cols === 4 ? s.stats4 : ''}`}>
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
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div className={`${s.stat} ${accent ? s.statAccent : ''}`} style={tone(color)}>
      <div className={`${s.statValue} num`}>
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

/* ── Баганан жагсаалт ── */

type Bar = { key: string; label: string; value: number; display?: string; color?: string };

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
  /**
   * ⚠️ Хуучирсан — үргэлж НЭГ ЭГНЭЭ (нэр урд). Дуудагчид эвдрэхгүйн тулд
   * төрөлд үлдээв; загварт нөлөөлөхгүй.
   */
  inline?: boolean;
  /**
   * Эхэндээ хэдэн мөр харуулах. Үлдсэнийг «бүгдийг харах» товчоор нээнэ.
   *
   * ⚠️ Зарим ангилал 40+ утгатай (жишээ нь барилгын «Багц / бүс»). Бүгдийг нь
   * задгай харуулбал самбар бүхэлдээ ганц жагсаалт болж, доор нь байгаа бусад
   * давхаргын үзүүлэлт хэдэн дэлгэц доор үлдэнэ.
   */
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const tip = useTip();
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  // Хэмжээсийг БҮХ мөрөөр тогтооно — эс бөгөөс задлахад баганы урт үсэрнэ
  const top = fin(max ?? Math.max(1, ...items.map((i) => fin(i.value)))) || 1;
  const hidden = limit != null && !all ? Math.max(0, items.length - limit) : 0;
  const shown = hidden > 0 ? items.slice(0, limit) : items;

  return (
    <div className={s.bars}>
      {shown.map((it) => {
        const w = Math.max(0, Math.min(100, (fin(it.value) / top) * 100));
        const on = sel.includes(it.key);
        const dim = sel.length > 0 && !on;
        // <button> дотор зөвхөн phrasing content зөвшөөрөгдөнө — <div> ашиглаж болохгүй
        /**
         * ⚠️ 2026-08-17: envhub-ийн RowChart загвар — ХОЁР мөр: дээр нь
         * нэр + утга (baseline, хоёр захад), доор нь БҮТЭН өргөний 2px hairline
         * зам. Урьд нь нэр|бар|утга нэг эгнээ байсан — нэрэнд 30% л зай өгч урт
         * монгол нэрийг олон мөр даруулдаг байв; одоо нэр бүтэн өргөнтэй.
         */
        const body = (
          <>
            <span className={s.barTop}>
              <span className={`${s.barName} ${on ? s.barNameOn : ''}`} title={tr(it.label)}>{tr(it.label)}</span>
              <span className={`${s.barVal} ${on ? s.barValOn : ''} num`}>{it.display ?? it.value}</span>
            </span>
            <span className={s.barTrack}>
              <i className={s.barFill} style={{ width: `${w}%`, opacity: dim ? 0.3 : 1 }} />
            </span>
          </>
        );
        const rowCls = `${s.barRow} ${dim ? s.barRowDim : ''}`;
        const st = tone(it.color ?? color);
        /** Бүх дашбоардад ИЖИЛ hover popup — нэр: утга (+шүүх заавар) */
        const tipData = {
          label: it.label,
          value: String(it.display ?? it.value),
          color: it.color ?? color,
          hint: onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined,
        };
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            className={`${rowCls} ${s.barClick} ${on ? s.barOn : ''}`}
            style={st}
            onClick={() => onSelect(it.key)}
            {...tip.bind(tipData)}
          >
            {body}
          </button>
        ) : (
          <div key={it.key} className={rowCls} style={st} {...tip.bind(tipData)}>
            {body}
          </div>
        );
      })}
      {tip.node}

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

/* ── Хэсэгчилсэн мөр ── */

export function Stack({
  items,
  total,
  /** Доор нь тайлбар (нэр + тоо) харуулах эсэх. Чипээр давхардуулахгүйн тулд унтраана. */
  legend = true,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  total?: number;
  legend?: boolean;
}) {
  const sum = fin(total ?? items.reduce((a, b) => a + fin(b.value), 0)) || 1;
  const tip = useTip();
  /**
   * ⚠️ 2026-08-17: Хэсэг↔тайлбарын ХОЛБОО — `Donut`-ынхтой ЯГ ижил зан төлөв
   * (тэндхийн `hov` загварыг хэвээр нь буулгав). Урьд нь Stack-д огт байгаагүй
   * тул нарийхан зурвасны 5 дахь хэсэг аль нэр вэ гэдгийг таах аргагүй байлаа.
   */
  const [hov, setHov] = useState<string | null>(null);
  const hoverProps = (key: string) => ({
    onMouseEnter: () => setHov(key),
    onMouseLeave: () => setHov((h) => (h === key ? null : h)),
  });
  const isDim = (key: string) => hov != null && hov !== key;
  const share = (v: number) => {
    const f = v / sum;
    // «0%» худал уншилтаас сэргийлнэ — Donut-ынхтой ижил дүрэм
    return f > 0 && f < 0.005 ? '<1%' : `${(f * 100).toFixed(0)}%`;
  };

  return (
    <>
      <div className={s.stack}>
        {items.map((i) => (
          <span
            key={i.key}
            className={`${s.stackSeg} ${isDim(i.key) ? s.stackSegDim : ''}`}
            style={{ width: `${(i.value / sum) * 100}%`, background: i.color }}
            {...hoverProps(i.key)}
            {...tip.bind({ label: i.label, value: `${i.value} · ${share(i.value)}`, color: i.color })}
          />
        ))}
      </div>
      {legend && (
        <ul className={s.legend}>
          {items.map((i) => (
            <li
              key={i.key}
              className={`${s.legendItem} ${hov === i.key ? s.legendItemOn : ''} ${isDim(i.key) ? s.legendItemDim : ''}`}
              {...hoverProps(i.key)}
            >
              <span className={s.legendDot} style={{ background: i.color }} />
              {tr(i.label)}
              {/* ⚠️ Хувь нь ЗААВАЛ: --c5/--c6 слотууд цайвар горимд 3:1-ээс
                  доогуур тул өнгө нь дангаараа мэдээлэл дамжуулж болохгүй
                  (globals.css дахь «relief» дүрэм). */}
              <b className={`${s.legendVal} num`}>{i.value}</b>
              <span className={s.legendPct}>{share(i.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {tip.node}
    </>
  );
}

/* ── Дугуй диаграм (pie / donut) ── */

/**
 * Цагирган ЗҮСМЭГИЙН зам (annular sector) — 12 цагаас цагийн зүүний дагуу.
 *
 * ⚠️ Урьд нь зүсмэгийг `stroke-dasharray`-аар (ганц шугам) зурдаг байсныг
 * ДҮҮРГЭЛТ + ЗАХЫН ШУГАМ тусад нь удирдахын тулд бүтэн замаар сольсон: дотор
 * талыг тунгалаг дүүргэж, зах (дотор/гадна нум + радиал зааг) нь тод бүтэн
 * шугамтай болно. `f0`,`f1` — эхлэх/дуусах бутархай (0..1).
 */
function sectorPath(cx: number, cy: number, ri: number, ro: number, f0: number, f1: number): string {
  // Бүтэн тойрог (ганц ангилал) — нэг нумаар хаагдахгүй тул мэдрэгдэхгүй зайг үлдээнэ
  const full = f1 - f0 >= 0.99999;
  const a0 = f0 * 2 * Math.PI;
  const a1 = (full ? f1 - 0.0001 : f1) * 2 * Math.PI;
  const pt = (rr: number, a: number): [number, number] => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
  const [ox0, oy0] = pt(ro, a0);
  const [ox1, oy1] = pt(ro, a1);
  const [ix1, iy1] = pt(ri, a1);
  const [ix0, iy0] = pt(ri, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${ox0},${oy0} A${ro},${ro} 0 ${large} 1 ${ox1},${oy1} `
    + `L${ix1},${iy1} A${ri},${ri} 0 ${large} 0 ${ix0},${iy0} Z`;
}

/**
 * Хувь эзлэх байдлыг харуулах дугуй диаграм.
 *
 * ⚠️ `Stack`-аас ЯЛГААТАЙ хэрэглээ: Stack нь нарийн зурвас — олон ангилалтай,
 * дараалал чухал үед. Donut нь ЦӨӨН (3–7) ангилалын харьцааг онцлоход тохирно.
 * 7-оос олон ангилалд зүсмэгүүд нь ялгагдахаа болих тул Stack эсвэл Bars хэрэглэ.
 *
 * ⚠️ Зүсмэг бүр annular-sector `<path>`: дотор ДҮҮРГЭЛТ тунгалаг, ЗАХЫН ШУГАМ
 * тод бүтэн — өнгөний ялгарал `shade()`-ийн hue-эргэлтээс.
 */

/**
 * viewBox-ийн ЗАХЫН НӨӨЦ (пиксел).
 * ⚠️ Зүсмэгийн гадна радиус нь `size / 2`-т яг хүрдэг ба SVG-ийн `stroke` замын
 * ДУНДУУР зурагддаг тул захын шугамын хагас нь хүрээнээс гарч тасардаг байв.
 * Хамгийн зузаан зах 2.5px (тодруулсан зүсмэг) — 2px нөөц хүрэлцээтэй.
 */
const EDGE_PAD = 2;

export function Donut({
  items,
  size = 132,
  width = 22,
  center,
  centerLabel,
  selected,
  onSelect,
  nowrap = false,
  stack = false,
  leaders = false,
  edge = 1,
}: {
  items: { key: string; label: string; value: number; color: string; display?: ReactNode }[];
  size?: number;
  width?: number;
  /** Голд харуулах утга. Заагаагүй бол нийлбэр. */
  center?: ReactNode;
  centerLabel?: string;
  /** Сонгосон зүсмэгийн key(үүд) — идэвхтэй бол бусад нь бүдгэрнэ. Олон сонголтод массив. */
  selected?: string | string[] | null;
  /** Зүсмэг/тайлбар дарахад — байвал диаграм шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /** Тайлбарыг пайн диаграмын ХАЖУУД албадаж зэрэгцүүлнэ (доош ороохгүй) */
  nowrap?: boolean;
  /** Тайлбарыг пайн диаграмын ДООР бүтэн өргөнөөр (нарийн баганад тохиромжтой) */
  stack?: boolean;
  /** Тайлбарыг доор жагсаахын оронд зүсмэг бүрээс ЗУРААС татаж гадна бичнэ */
  leaders?: boolean;
  /** Захын шугамын зузааны үржүүлэгч (1 = анхдагч, 0.5 = хагас нарийн) */
  edge?: number;
}) {
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  const hasSel = sel.length > 0;
  const total = items.reduce((a, b) => a + fin(b.value), 0);
  const r = (size - width) / 2;

  /**
   * Хулгана дээрх зүсмэг — ЗҮСМЭГ ба ТАЙЛБАР хоёрыг холбоно.
   *
   * ⚠️ Хоёр талдаа ажиллана: зүсмэг дээр очиход тайлбарын мөр, тайлбар дээр
   * очиход зүсмэг тодорно. 4-8 ойролцоо өнгөтэй зүсмэгийг тайлбартай нь нүдээр
   * тааруулах нь бараг боломжгүй байсан.
   *
   * ⚠️ 2026-08-17: Урьд нь энэ бүхэн `onSelect` байхаас ХАМААРДАГ байв — өөрөөр
   * хэлбэл ЗӨВХӨН УНШИХ 14 диаграмд hover огт байхгүй, голын уншилт ч
   * солигддоггүй байсан. Хамаарлыг АВЧ ХАЯВ. «Дарагдах юм шиг хуурамч мэдрэмж
   * төрүүлэхгүй» гэсэн анхны болгоомжлолыг ЗААХАГЧ (`cursor`) ба `onClick`-ийг
   * хэвээр нь хаалттай үлдээснээр хангаж байна — тодруулга нь заалт биш,
   * УНШИХАД туслах хэрэгсэл.
   */
  const [hov, setHov] = useState<string | null>(null);
  const tip = useTip();
  const hovOn = hov;
  const hoverProps = (key: string) => ({
    onMouseEnter: () => setHov(key),
    onMouseLeave: () => setHov((h) => (h === key ? null : h)),
  });
  /** Тодруулах уу? Хулгана байвал ТЭР давамгайлна, эс бөгөөс сонголт. */
  const isEmph = (key: string) => (hovOn ? hovOn === key : sel.includes(key));
  const isDim = (key: string) => (hovOn ? hovOn !== key : hasSel && !sel.includes(key));
  /**
   * ⚠️ 2026-08-17: envhub-ийн зүсмэгийн хэл — ТУНГАЛАГ дүүргэлт (0.42) + ИЖИЛ
   * өнгийн ЦУЛ 1px зах. Онцолсон нь дүүргэлтээ өтгөрүүлнэ (0.62), бүдгэрсэн нь
   * бараг алга болно (0.06 / зах 0.15) — envhub-д сонголт ЯГ ингэж уншигддаг.
   */
  const sliceStyle = (key: string, color: string): CSSProperties => ({
    fill: color,
    fillOpacity: isDim(key) ? 0.06 : isEmph(key) ? 0.62 : 0.42,
    stroke: color,
    strokeOpacity: isDim(key) ? 0.15 : 0.9,
    strokeWidth: 1 * edge,
    ...(onSelect ? { cursor: 'pointer' } : null),
  });
  // Зүсмэгийн дотор/гадна радиус — band-ийн зузаан нь `width`
  const ri = r - width / 2;
  const ro = r + width / 2;

  // Зүсмэг бүрийн ЭХЛЭХ байрлал — өмнөх зүсмэгүүдийн нийлбэр
  let acc = 0;
  const slices = items.map((it) => {
    const frac = total > 0 ? fin(it.value) / total : 0;
    const offset = acc;
    acc += frac;
    return { ...it, frac, offset };
  });

  /**
   * Дэлгэц уншигчид зориулсан товч тойм — эхний 3 зүсмэг.
   * ⚠️ Урьд нь `<svg>` дээр `role`/`aria-label` огт байгаагүй тул диаграм нь
   * туслах технологид ЯМАР Ч утга дамжуулдаггүй байв (зөвхөн `<path>` бүрийн
   * `<title>` — тэр нь найдвартай уншигддаггүй).
   */
  const ariaSummary =
    tr('Дугуй диаграм. Нийт {0}{1}. ', center ?? total, centerLabel ? ` ${centerLabel}` : '') +
    slices
      .slice(0, 3)
      .map((sl) => `${tr(sl.label)} ${(sl.frac * 100).toFixed(0)}%`)
      .join(', ') +
    (items.length > 3 ? tr(', бусад {0} ангилал.', items.length - 3) : '.');

  /**
   * LEADER горим — тайлбарыг доор жагсаахын оронд зүсмэг бүрээс зураас татаж
   * пайн диаграмын гадна шошгыг бичнэ. Цөөн зүсмэгтэй (2–4) диаграмд тохиромжтой.
   */
  if (leaders) {
    const cx = size / 2;
    const cy = size / 2;
    const Ro = r + width / 2; // зүсмэгийн ГАДНА радиус
    const GAP = 16; // зурааснаас шошго хүртэл
    const PAD = 106; // хажуугийн шошгын зай — vbW нь ~панелд багтаж, масштаб ≈ 1
    const PADY = 70; // босоо зай (дээд/доод зүсмэгийн шошгонд)
    const GUTTER = 6; // зураас ба текстийн хоорондын зай
    const LW = PAD - GAP - GUTTER - 2; // шошгын хайрцгийн өргөн — бүтэн үг багтаана
    const vbW = size + PAD * 2;
    const vbH = size + PADY * 2;
    return (
      <div className={s.donutLead}>
        <svg
          width={vbW}
          height={vbH}
          viewBox={`${-PAD} ${-PADY} ${vbW} ${vbH}`}
          role="img"
          aria-label={ariaSummary}
        >
          {/* envhub: гадна захын 1px чиглүүлэгч тойрог (бүтэн band биш) */}
          <g>
            <circle className={s.donutTrack} cx={cx} cy={cy} r={Ro} strokeWidth={1} />
            {slices.map((sl) => (
              <path
                key={sl.key}
                d={sectorPath(cx, cy, ri, ro, sl.offset, sl.offset + sl.frac)}
                strokeLinejoin="round"
                style={sliceStyle(sl.key, sl.color)}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
                {...tip.bind({
                  label: sl.label,
                  value: `${sl.value} · ${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`,
                  color: sl.color,
                  hint: onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined,
                })}
              />
            ))}
          </g>
          {/* Голын утга */}
          <text x={cx} y={cy - 1} textAnchor="middle" className={s.donutLeadCtr}>{String(center ?? total)}</text>
          {centerLabel && <text x={cx} y={cy + 12} textAnchor="middle" className={s.donutLeadCtrLbl}>{centerLabel}</text>}
          {/* Зураас + гадна БҮТЭН шошго (foreignObject — HTML мөр даруулна) */}
          {slices.map((sl) => {
            const mid = sl.offset + sl.frac / 2;
            const th = mid * 2 * Math.PI;
            const sin = Math.sin(th);
            const cos = Math.cos(th);
            const sx = cx + Ro * sin;
            const sy = cy - Ro * cos;
            const ex = cx + (Ro + 12) * sin;
            const ey = cy - (Ro + 12) * cos;
            const right = sin >= 0;
            const lx = right ? cx + Ro + GAP : cx - Ro - GAP;
            // Текст зурааснаас GUTTER-ийн зайд — давхацахгүй
            const boxX = right ? lx + GUTTER : -PAD + 2;
            const pct = sl.display ?? `${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`;
            return (
              <g
                key={sl.key}
                opacity={isDim(sl.key) ? 0.35 : 1}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
              >
                {/* ⚠️ Будаг нь `style`-аар — SVG-ийн presentation ШИНЖ дотор
                    `var(--cN)` задардаггүй тул токен палитр ажиллахгүй байв. */}
                <polyline
                  points={`${sx},${sy} ${ex},${ey} ${lx},${ey}`}
                  strokeWidth={1}
                  style={{ fill: 'none', stroke: sl.color }}
                />
                <circle cx={lx} cy={ey} r={1.6} style={{ fill: sl.color }} />
                <foreignObject x={boxX} y={ey - 30} width={LW} height={60}>
                  <div
                    className={s.donutLeadBox}
                    style={{ textAlign: right ? 'left' : 'right', fontWeight: isEmph(sl.key) ? 600 : undefined }}
                    {...tip.bind({
                      label: sl.label,
                      value: `${sl.value} · ${pct}`,
                      color: sl.color,
                      hint: onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined,
                    })}
                  >
                    <span className={s.donutLeadName}>{tr(sl.label)}</span>{' '}
                    <b className={s.donutLeadPct} style={{ color: sl.color }}>{pct}</b>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
        {tip.node}
      </div>
    );
  }

  return (
    <div className={`${s.donutWrap} ${nowrap ? s.donutRow : ''} ${stack ? s.donutStack : ''}`}>
      <div className={s.donut} style={{ width: size, height: size }}>
        {/**
          * ⚠️ viewBox нь `size`-ээс АРАЙ ТОМ: зүсмэгийн ГАДНА радиус (`ro`) яг
          * `size / 2` тул зах (`stroke`) нь замын дундуур зурагдаж, хагас нь
          * хүрээнээс гарч 4 талаасаа ТАСАРЧ харагддаг байв. Хамгийн зузаан зах
          * 2.5px (тодруулсан зүсмэг) тул 2px нөөц хангалттай.
          */}
        <svg
          width={size}
          height={size}
          viewBox={`${-EDGE_PAD} ${-EDGE_PAD} ${size + EDGE_PAD * 2} ${size + EDGE_PAD * 2}`}
          role="img"
          aria-label={ariaSummary}
        >
          {/* envhub: гадна захын 1px чиглүүлэгч тойрог (бүтэн band биш) */}
          <g>
            <circle className={s.donutTrack} cx={size / 2} cy={size / 2} r={ro} strokeWidth={1} />
            {slices.map((sl) => (
              <path
                key={sl.key}
                className={s.donutSlice}
                d={sectorPath(size / 2, size / 2, ri, ro, sl.offset, sl.offset + sl.frac)}
                strokeLinejoin="round"
                style={sliceStyle(sl.key, sl.color)}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
                {...tip.bind({
                  label: sl.label,
                  value: `${sl.value} · ${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`,
                  color: sl.color,
                  hint: onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined,
                })}
              />
            ))}
          </g>
        </svg>
        {/**
          * ⚠️ Хулгана зүсмэг дээр очиход ГОЛД нь тэр зүсмэгийн утга гарна —
          * тайлбар руу нүд шилжүүлэхгүйгээр шууд уншина. Хулгана буухад
          * анхны нийт утга руугаа эргэнэ.
          */}
        <div className={s.donutCenter}>
          {(() => {
            const h = hovOn ? slices.find((x) => x.key === hovOn) : null;
            return h ? (
              <>
                <span className={`${s.donutValue} num`}>{h.value}</span>
                <span className={s.donutLabel} title={tr(h.label)}>{tr(h.label)}</span>
              </>
            ) : (
              <>
                <span className={`${s.donutValue} num`}>{center ?? total}</span>
                {centerLabel && <span className={s.donutLabel}>{centerLabel}</span>}
              </>
            );
          })()}
        </div>
      </div>

      <ul className={s.donutLegend}>
        {slices.map((sl) => {
          const on = sel.includes(sl.key);
          const body = (
            <>
              {/* envhub: тэмдэг нь зүсмэгийн ЯГ багасгасан хувь — ижил дүүргэлт
                  (42%) + ижил өнгийн зах. */}
              <span
                className={s.legendDot}
                style={{
                  background: `color-mix(in oklab, ${sl.color} 42%, transparent)`,
                  border: `1px solid ${sl.color}`,
                }}
              />
              <span className={s.donutName}>{tr(sl.label)}</span>
              {/**
                * ⚠️ `toFixed(0)` ганцаараа ХУДАЛ уншигдана: 3,947-гийн 14 нь
                * 0.35% тул «0%» болж, зүсмэг нь диаграм дээр харагдсаар атлаа
                * «юу ч биш» гэж бичигддэг байлаа. 0.5%-аас бага БОЛОВЧ 0 биш
                * утгыг «<1%» гэж заана.
                * ⚠️ Дуудагчийн өгсөн `display` нь үргэлж давамгайлна.
                */}
              <b className={`${s.donutPct} num`}>
                {sl.display
                  ?? `${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`}
              </b>
            </>
          );
          return onSelect ? (
            <li key={sl.key}>
              <button
                type="button"
                aria-pressed={on}
                className={`${s.donutItem} ${s.donutClick} ${on ? s.donutOn : ''} ${hovOn === sl.key ? s.donutHov : ''}`}
                onClick={() => onSelect(sl.key)}
                // ⚠️ Гар/фокусаар хөтлөгчид ч ижил холбоо ажиллана
                onFocus={() => setHov(sl.key)}
                onBlur={() => setHov((h) => (h === sl.key ? null : h))}
                {...hoverProps(sl.key)}
              >
                {body}
              </button>
            </li>
          ) : (
            // ⚠️ Зөвхөн унших диаграмд ч тайлбар↔зүсмэгийн холбоо ажиллана —
            //    hover нь заалт биш, уншихад туслах хэрэгсэл (дээрх тайлбар).
            <li
              key={sl.key}
              className={`${s.donutItem} ${hovOn === sl.key ? s.donutHov : ''}`}
              {...hoverProps(sl.key)}
            >
              {body}
            </li>
          );
        })}
      </ul>
      {tip.node}
    </div>
  );
}

/* ── Цуваа график (series) ── */

/**
 * Босоо баганан цуваа — ангилал/хугацааны цувааг харьцуулна.
 *
 * ⚠️ `Bars`-аас ялгаатай: `Bars` нь ХЭВТЭЭ, урт нэртэй ангилалд тохирно.
 * `Series` нь БОСОО, цөөн тэмдэгттэй шошготой (он, давхар, эгнээ) цувааг
 * дүрсний хэлбэрээр нь уншуулна — өсөлт/бууралтын хэв маяг шууд харагдана.
 */
export function Series({
  items,
  color,
  height = 96,
  unit,
  selected,
  onSelect,
}: {
  items: { key: string; label: string; value: number; display?: string }[];
  color?: string;
  height?: number;
  unit?: string;
  /** Сонгосон баганын key — идэвхтэй бол бусад нь бүдгэрнэ */
  selected?: string | null;
  /** Багана дарахад — байвал цуваа шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(1, ...items.map((i) => fin(i.value)));
  const tip = useTip();

  /**
   * ⚠️ 2026-08-17: envhub-ийн BarChart хэл — ТОРГҮЙ, ТЭНХЛЭГГҮЙ, баганан дээр
   * байнгын утгагүй. Утга нь hover tooltip-д; доор нь зөвхөн 10px цифр/шошгын
   * мөр. Сонгогдоогүй багана 0.22 хүртэл бүдгэрнэ.
   */
  return (
    <div className={s.series} style={tone(color)}>
      <div className={s.seriesPlot} style={{ height }}>
        {items.map((it) => {
          const on = selected === it.key;
          const dim = selected != null && !on;
          // ⚠️ Баганын хамгийн бага өндөр 1.5%: утга 0 байсан ч багана нь БАЙГАА
          //    гэдэг нь харагдах ёстой — эс бөгөөс өгөгдөлгүйтэй андуурагдана.
          const barH = `${Math.max(1.5, (fin(it.value) / max) * 100)}%`;
          const tipData = {
            label: it.label,
            value: String(it.display ?? it.value) + (unit ? ` ${unit}` : ''),
            color,
            hint: onSelect ? tr('Дарж шүүнэ') : undefined,
          };
          const inner = <span className={s.seriesBar} style={{ height: barH, opacity: dim ? 0.22 : 1 }} />;
          return onSelect ? (
            <button
              key={it.key}
              type="button"
              aria-pressed={on}
              /* ⚠️ `seriesOn` ХАСАГДАВ: envhub шилжилтэд түүний дүрэм
                 (`.seriesOn .seriesBar/.seriesVal`) устсан ч дуудалт нь үлдэж,
                 DOM-д утгагүй `undefined` класс бичигдэж байв. Сонголт нь
                 сонгоогүй баганыг 0.22 хүртэл бүдгэрүүлснээр аль хэдийн
                 уншигдана (доорх `dim`), шошго нь `.seriesLabelOn`-оор тодорно. */
              className={`${s.seriesCol} ${s.seriesClick}`}
              onClick={() => onSelect(it.key)}
              {...tip.bind(tipData)}
            >
              {inner}
            </button>
          ) : (
            <div key={it.key} className={s.seriesCol} {...tip.bind(tipData)}>
              {inner}
            </div>
          );
        })}
      </div>
      <div className={s.seriesTicks} aria-hidden>
        {items.map((it) => {
          const on = selected === it.key;
          return (
            <span key={it.key} className={`${s.seriesLabel} num ${on ? s.seriesLabelOn : ''}`}>
              {tr(it.label)}
            </span>
          );
        })}
      </div>
      {unit && <div className={s.seriesUnit}>{unit}</div>}
      {tip.node}
    </div>
  );
}

/* ── Сонгогч ── */

/**
 * Жагсаалтаас нэгийг сонгоно.
 *
 * ⚠️ `Tabs` нь 2-4 сонголтод л зохимжтой — 8 багцыг таб болговол самбарын
 * өргөнөөс хальж, мөр дамжина. Уугуул `<select>` нь гар, дэлгэц уншигч,
 * гар утасны төрөлх сонгогчийг үнэгүй авчирна.
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
  value: number;
  /** Уншилтын мөрөнд гарах нэмэлт тайлбар — «113 блок» */
  note?: string;
};

/**
 * Нэг цувааны шугаман график — хугацааны явцыг харуулна.
 *
 * ⚠️ `Series` (босоо багана) нь ЦӨӨН, ТУСДАА үеийг харьцуулахад тохирно.
 * Хуримтлагдсан гүйцэтгэл нь ТАСРАЛТГҮЙ хэмжигдэхүүн тул шугамаар л «хэдийд
 * хурдалсан/удаашрсан» нь уншигдана.
 *
 * ⚠️ Цэг бүрд утга БИЧИХГҮЙ — 9-12 тоо давхарлавал аль нь ч уншигдахаа болино.
 * Оронд нь дээрх уншилтын мөр: анхдаа СҮҮЛИЙН утга, хулгана/фокус аваад тухайн
 * цэгийнх. Тэмдэглэгээ нь хөндлөн огтлолын шугамтай — нүд босоо тэнхлэгээ олно.
 */
/**
 * Тэнхлэгийн шошго — цэг бүрийн БОДИТ бүртгэлийн огноо (`note` нь сарын шошгоны
 * доорх жинхэнэ огноо). Он нь ЗӨВХӨН сольсон цэгт бичигдэнэ: «2025-10-31 ·
 * 11-02 · 12-31 · 2026-03-20 …» — 10 гаруй шошго нарийн самбарт ч давхцахгүй.
 */
/**
 * Тэнхлэгийн шошго — ХЭДХЭН цэг дээр л.
 *
 * ⚠️ 2026-08-18: Урьд нь ЦЭГ БҮРД шошго буцаадаг байв. 12 цэгтэй цуваанд тэр
 * зүгээр байсан ч IoT-ийн 90 цэгтэй цуваанд огнооны бичиг бүрэн давхарлаж,
 * тэнхлэг нь уншигдахааргүй бараан зурвас болдог байлаа. Одоо хамгийн ихдээ
 * `MAX_TICKS` ширхгийг тэнцүү алхмаар сонгоно (эхний ба сүүлийнх ЗААВАЛ орно —
 * цувааны хамрах хүрээг тэд хэлнэ), бусад нь хоосон мөр буцаж зурагдахгүй.
 */
const MAX_TICKS = 6;
function axisTicks(points: TrendPoint[]): string[] {
  const n = points.length;
  const keep = new Set<number>();
  if (n <= MAX_TICKS) {
    for (let i = 0; i < n; i++) keep.add(i);
  } else {
    const step = (n - 1) / (MAX_TICKS - 1);
    for (let i = 0; i < MAX_TICKS; i++) keep.add(Math.round(i * step));
  }
  let year = '';
  return points.map((p, i) => {
    const d = p.note ?? p.label;
    const y = d.slice(0, 4);
    const full = !/^\d{4}-/.test(d) || y !== year;
    if (full) year = y;
    if (!keep.has(i)) return '';
    return full ? d : d.slice(5);
  });
}

export function Trend({
  points,
  color,
  height = 132,
  unit = '%',
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const [hov, setHov] = useState<number | null>(null);
  // ⚠️ Нэг хуудсанд хэд хэдэн Trend байж болно — градиентийн id ДАВТАГДВАЛ
  //    сүүлийнх нь бусдыгаа дардаг (SVG-ийн id нь баримт даяар нэгдмэл).
  //    React 19-ийн `useId` нь CSS/`url(#…)`-д хүчинтэй тэмдэгт л гаргана.
  const gradId = `trendArea${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // ⚠️ Цуваа солигдоход (grain/хамрах хүрээ) хуучин hov хүчингүй болно — цэгийн
  //    товч unmount болоход React blur/mouseleave өгдөггүй тул энд цэвэрлэнэ.
  useEffect(() => setHov(null), [points.length]);

  if (points.length < 2) return <Empty label={tr('Цуваа зурахад хангалттай бүртгэл алга.')} />;

  // Тэнхлэгийн дээд хязгаар нь БҮТЭН аравт — 23%-ийн муруйг 0–100 дээр зурвал
  // шулуун шугам болж, өсөлт нь ялгагдахгүй.
  const peak = Math.max(...points.map((p) => fin(p.value)));
  const top = Math.max(10, Math.ceil(peak / 10) * 10);
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 100 - (fin(v) / top) * 100;

  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  // ⚠️ Индексийг ХЯЗГААРЛАНА: дээрх цэвэрлэгээ рендерийн ДАРАА ажилладаг тул
  //    богиноссон цуваан дээр хуучин hov-оор шууд индекслэвэл cur undefined
  //    болж бүх React мод унана.
  const curIdx = hov != null && hov < points.length ? hov : points.length - 1;
  const cur = points[curIdx];

  /**
   * ⚠️ 2026-08-18: ROVING TABINDEX. Урьд нь цэг бүр Tab-стоп байв — 12 цэгтэй
   * цуваанд зүгээр ч, IoT-ийн 90 цэгтэй 9 графикт ~800 Tab-стоп болж, гараар
   * хөтлөгч самбарыг давахын тулд минут дарах шаардлагатай байлаа. Одоо график
   * бүр НЭГ л стоптой (идэвхтэй цэг, анхдаа сүүлийнх); цэг хооронд сум/Home/End.
   */
  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    if (e.key === 'ArrowLeft') next = Math.max(0, curIdx - 1);
    else if (e.key === 'ArrowRight') next = Math.min(points.length - 1, curIdx + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = points.length - 1;
    if (next < 0 || next === curIdx) return;
    e.preventDefault();
    // focus() нь onFocus-оор setHov-ийг өөрөө дуудна; preventScroll — самбарын
    // гүйлтийг үсэргэхгүй (Tabs-ын ижил болгоомжлол).
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]
      ?.focus({ preventScroll: true });
  };

  return (
    <div className={s.trend} style={tone(color)}>
      <div className={s.trendHead}>
        <span className={`${s.trendValue} num`}>
          {fin(cur.value).toFixed(1)}{unit}
        </span>
        <span className={s.trendMeta}>
          {tr(cur.label)}{cur.note ? ` · ${cur.note}` : ''}
        </span>
      </div>

      <div className={s.trendPlot} style={{ height }} onKeyDown={nav}>
        <svg className={s.trendSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {/**
            * ⚠️ Талбайн бүрхүүл нь ХАВТГАЙ 0.1 тунгалаг байсныг ГРАДИЕНТ болгов:
            * шугамын дор өтгөн, суурь тэнхлэг дээр уусна. Хавтгай бүрхүүл нь
            * тор болон суурь тэнхлэгийг бүрхэж, хоёулаа бүдгэрдэг байв.
            * ⚠️ SVG `fill` тул CSS градиент ажиллахгүй — заавал `<linearGradient>`.
            * ⚠️ `gradientUnits="userSpaceOnUse"` — эс бөгөөс `preserveAspectRatio
            * ="none"` сунгалттай хослоод градиентийн тэнхлэг гажина.
            */}
          {/* envhub-ийн AreaChart: 0.34→0.02 градиент, ТОРГҮЙ, y-тэнхлэггүй —
              утгын лавлагаа нь дээрх readout мөр ба hover tooltip. */}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--tone, var(--data))" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--tone, var(--data))" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${path} 100,100`} style={{ fill: `url(#${gradId})` }} />
          <polyline className={s.trendLine} points={path} />
        </svg>

        {points.map((p, i) => (
          <button
            /**
             * ⚠️ 2026-08-18: түлхүүр нь `p.label` БАЙСАН. Шошго нь ДЭЛГЭЦИЙН текст
             * тул давтагдаж БОЛНО — IoT-ийн «ММ-ДД ЧЧ:мм» шошготой хоёр заалт нэг
             * минутад ирэхэд React «two children with the same key» алдаа өгч, нэг
             * цэг нь зурагдахгүй үлддэг байв. Жагсаалт нь дарааллаа СОЛИХГҮЙ, бүхлээр
             * нь дахин зурагддаг тул индекс нь найдвартай таних тэмдэг.
             */
            key={i}
            type="button"
            tabIndex={curIdx === i ? 0 : -1}
            className={`${s.trendHit} ${hov === i ? s.trendHitOn : ''}`}
            style={{ left: `${x(i)}%` }}
            aria-label={`${p.label}: ${fin(p.value).toFixed(1)}${unit}${p.note ? ` · ${p.note}` : ''}`}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov((h) => (h === i ? null : h))}
            onFocus={() => setHov(i)}
            onBlur={() => setHov((h) => (h === i ? null : h))}
          >
            <span className={s.trendDot} style={{ top: `${y(p.value)}%` }} />
          </button>
        ))}
      </div>

      <div className={s.trendAxis}>
        {axisTicks(points).map((t, i) => (t ? (
          <span key={i} className={s.trendAxisTick} style={{ left: `${x(i)}%` }}>
            {t}
          </span>
        ) : null))}
      </div>
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
  size = 92,
  width = 9,
  color,
  label,
  decimals,
}: {
  /** 0–100, эсвэл өгөгдөлгүй бол null */
  value: number | null | undefined;
  size?: number;
  width?: number;
  color?: string;
  label?: string;
  /** Аравтын орны тоог албадан заана; өгөөгүй бол <10 үед 1, эс бөгөөс 0 */
  decimals?: number;
}) {
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const text = has ? `${v.toFixed(decimals ?? (v < 10 ? 1 : 0))}%` : '—';

  return (
    /**
     * ⚠️ 2026-08-17: Туслах технологид зориулсан утга нэмэв. Урьд нь энэ
     * цагираг нь `role`, `aria-label`, `<title>` — ЮУ Ч БАЙХГҮЙ байсан тул
     * дэлгэц уншигчид зөвхөн голын «63%» гэсэн тоо очиж, юуны 63% болох нь
     * мэдэгддэггүй байв.
     * ⚠️ Өгөгдөлгүй үед `aria-valuenow={0}` гэж бичихгүй — тэр нь ЖИНХЭНЭ 0%-тай
     * андуурагдана (энэ компонентын үндсэн дүрэм, дээрх тайлбарыг үзнэ үү).
     */
    <div
      className={s.ring}
      style={{ ...tone(color), width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(has ? { 'aria-valuenow': v, 'aria-valuetext': text } : { 'aria-valuetext': tr('өгөгдөлгүй') })}
    >
      <svg className={s.ringSvg} width={size} height={size} aria-hidden>
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={width} />
        {/* ⚠️ ЯГ 0 үед нум зурахгүй: `stroke-linecap: round` нь тэг урттай зурааст
            ч бөөрөнхий үзүүр буулгадаг тул «0%» дээр цэг гарч, бага зэрэг
            гүйцэтгэлтэй мэт хуурамч уншилт өгдөг. */}
        {has && v > 0 && (
          <circle
            className={s.ringArc}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={width}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
          />
        )}
      </svg>
      <div className={s.ringCenter} aria-hidden>
        <span className={`${s.ringValue} num`} style={{ fontSize: size * 0.2 }}>
          {text}
        </span>
        {label && <span className={s.ringLabel}>{label}</span>}
      </div>
    </div>
  );
}

/* ── Түлхүүр → утга ── */

export function Rows({ items }: { items: { key: string; value: ReactNode }[] }) {
  return (
    <div className={s.rows}>
      {items.map((r) => (
        <div key={r.key} className={s.row}>
          <span className={s.rowKey}>{r.key}</span>
          <span className={s.rowVal}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Chip ── */

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className={s.chip} style={tone(color)}>
      {children}
    </span>
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

export function Loading({ label = tr('Ачаалж байна…') }: { label?: string }) {
  // ⚠️ `role="status"` — ачаалал дуусахад дэлгэц уншигч мэдэгдэнэ. Урьд нь
  //    зөвхөн нүдэнд харагдах эргэлдэгч байсан.
  return (
    <div className={s.state} role="status" aria-live="polite">
      <span className={s.spinner} aria-hidden />
      {label}
    </div>
  );
}

/**
 * Хоосон төлөв.
 *
 * ⚠️ 2026-08-17: Урьд нь `Loading` ба алдаатай ижил, ялгаагүй саарал өгүүлбэр
 * байсан (33 дуудлагатай — аппын хамгийн олон харагддаг «төлөв»). Одоо
 * тасархай хүрээтэй бие даасан хайрцаг: хэрэглэгч энэ нь АЧААЛЖ БАЙГАА юм уу,
 * АЛДАА юм уу, эсвэл ЖИНХЭНЭ хоосон гэдгийг шууд ялгана.
 *
 * `label` нь ганц ЗААВАЛ талбар хэвээр — 33 дуудагчийн нэг нь ч өөрчлөгдөхгүй.
 */
export function Empty({
  label,
  icon = 'chart',
  hint,
}: {
  label: string;
  /** `Icon.tsx`-ийн нэр. Мэдэгдэхгүй нэр өгвөл дүрс нь зүгээр л гарахгүй. */
  icon?: string;
  /** Дараа нь ЮУ хийхийг заана — хоосон дэлгэц бол урилга байх ёстой */
  hint?: ReactNode;
}) {
  return (
    <div className={`${s.state} ${s.empty}`}>
      {/* `Icon` нь `currentColor`-оор зурагддаг тул өнгийг боодол өгнө */}
      <span className={s.emptyIcon}>
        <Icon name={icon} size={22} />
      </span>
      <span className={s.emptyLabel}>{label}</span>
      {hint && <span className={s.emptyHint}>{hint}</span>}
    </div>
  );
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
}: {
  q: Async<T>;
  children: (data: T) => ReactNode;
  loading?: string;
}) {
  if (q.state === 'loading') return <Loading label={loading} />;
  if (q.state === 'error') {
    return (
      <div className={s.state} role="alert">
        <strong className={s.error}>{tr('Өгөгдөл татагдсангүй')}</strong>
        <span className={s.errorMsg}>{q.error.message}</span>
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
