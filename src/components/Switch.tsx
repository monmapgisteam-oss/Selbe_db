'use client';
/**
 * НИЙТЛЭГ УНТРААЛГА — хоёр утгатай сонголт (2026-10-23, хэрэглэгч: «текст товч дотроо байрлана», «загварыг системд
 * нийтлэг байлгах»). НЭГ товч: капсул дотор хоёр шошго, идэвхтэй тал нь дүүргэсэн гулсагчтай; дарахад нөгөө тал руу
 * шилжинэ (`switch.module.css`).
 *
 * `off` — зүүн талын шошго (унтраалттай үеийн утга), `on` — баруун талын шошго (асаалттай үеийн утга).
 * `role="switch"` + `aria-checked` (дэлгэц уншигч).
 */
import type React from 'react';
import s from './switch.module.css';

export function Switch({ checked, onChange, off, on, title, disabled = false, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Унтраалттай (зүүн) талын шошго */
  off: string;
  /** Асаалттай (баруун) талын шошго */
  on: string;
  title?: string;
  disabled?: boolean;
  /** Дэлгэц уншигчийн нэр — анхдагч «off / on» */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? `${off} / ${on}`}
      title={title}
      disabled={disabled}
      className={`${s.sw} ${checked ? s.on : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={`${s.opt} ${!checked ? s.optOn : ''}`}>{off}</span>
      <span className={`${s.opt} ${checked ? s.optOn : ''}`}>{on}</span>
    </button>
  );
}

/**
 * НИЙТЛЭГ АСААХ/УНТРААХ ТОВЧ — шошго (+ нэмэлт тоо) ба ард талдаа унтраалга (2026-10-23, хэрэглэгч: «ард талдаа
 * унтрааж асаадаг товчтой болго»). Нэг товч — дарахад асна/унтарна (`switch.module.css` `.tg`).
 */
export function Toggle({ checked, onChange, label, extra, title, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Шошгын ард бүдэг нэмэлт (жиш. «0 / 1,267») */
  extra?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      className={`${s.tg} ${checked ? s.tgOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      {extra && <span className={s.tgExtra}>{extra}</span>}
      <span className={s.tgTrack} aria-hidden><span className={s.tgKnob} /></span>
    </button>
  );
}

/**
 * НИЙТЛЭГ ОЛОН СОНГОЛТТОЙ КАПСУЛ — `Switch`-тэй ижил загвар, 2+ сонголт (2026-10-23, хэрэглэгч: «загварыг сайжруул»).
 * Нэг нь идэвхтэй, гулсагч түүн рүү шилжинэ (`switch.module.css` `.seg`).
 */
export function Segmented<T extends string>({ value, onChange, options, label, disabled = false, wrap = false }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; title?: string }[];
  /** Дэлгэц уншигчийн бүлгийн нэр */
  label?: string;
  disabled?: boolean;
  /** Олон/урт сонголттой үед (жиш. ТУХ-ын 9 бүлэг) мөр шилжинэ — ⚠️ 2026-10-26: эс бөгөөс капсул дэлгэцээс халина */
  wrap?: boolean;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <span role="radiogroup" aria-label={label} className={`${s.seg} ${wrap ? s.segWrap : ''}`}
      style={{ '--n': options.length, '--i': i } as React.CSSProperties}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          title={o.title} disabled={disabled}
          className={`${s.segOpt} ${o.value === value ? s.segOn : ''}`}
          onClick={() => { if (o.value !== value) onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
