'use client';

/**
 * ЧАНАРЫН МАЯГТЫН ЖИЖИГ ХЯНАЛТУУД — харах/засах хоёр горимд НЭГ бүрэлдэхүүн.
 *
 * ⚠️ 2026-09-28: төрөл бүрийн маягт (MS · MA · MIR · FIC · NCR) ижил талбар
 *    хэлбэрүүдтэй (текст, нэг мөр, чекбокс, огноо). Харах ба засах горимд хоёр
 *    тусдаа мод бичвэл дөрвөн маягт × 2 = найман хуулбар үүснэ; энд `edit`
 *    туг нэг л газар шийднэ. Харах горимд ИНПУТ БИШ — текст (хэвлэхэд цэвэр).
 */

import { useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { toDateInput, fromDateInput, ymd } from './chanarUi';
import s from '../chanar.module.css';

export type Mode = { edit: boolean; busy: boolean };

/** Хэсгийн гарчигтай хайрцаг */
export function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.sec}>
      <div className={s.secHead}>{title}</div>
      {children}
    </div>
  );
}

/** Олон мөрт текст — харахад `<p>`, засахад `<textarea>` */
export function Txt({
  m, label, value, onChange, hint,
}: { m: Mode; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  if (!m.edit) {
    return value
      ? <p className={s.secText}>{value}</p>
      : <p className={`${s.secText} ${s.secEmpty}`}>{tr('бөглөөгүй')}</p>;
  }
  return (
    <textarea
      className={s.textarea} placeholder={hint ?? ''} aria-label={label}
      value={value} onChange={(e) => onChange(e.target.value)} disabled={m.busy}
    />
  );
}

/** Нэг мөр текст — `<dt>/<dd>` хос дотор */
export function Inp({
  m, label, value, onChange, hint, list,
}: { m: Mode; label: string; value: string; onChange: (v: string) => void; hint?: string; list?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {m.edit ? (
          <input
            className={`${s.input} ${s.inpFull}`} placeholder={hint ?? ''} aria-label={label} list={list}
            value={value} onChange={(e) => onChange(e.target.value)} disabled={m.busy}
          />
        ) : (value || <span className={s.secEmpty}>—</span>)}
      </dd>
    </div>
  );
}

/** Огноо — `<dt>/<dd>` хос дотор; epoch мс */
export function DateInp({
  m, label, value, onChange,
}: { m: Mode; label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {m.edit ? (
          <input
            type="date" className={s.input} aria-label={label}
            value={toDateInput(value)} onChange={(e) => onChange(fromDateInput(e.target.value))} disabled={m.busy}
          />
        ) : ymd(value)}
      </dd>
    </div>
  );
}

/** Сонголт — `<dt>/<dd>` хос дотор */
export function Sel({
  m, label, value, onChange, options, empty,
}: {
  m: Mode; label: string; value: string; onChange: (v: string) => void;
  options: readonly { v: string; l: string }[]; empty?: string;
}) {
  if (!m.edit) {
    const cur = options.find((o) => o.v === value);
    return <div><dt>{label}</dt><dd>{cur?.l ?? value ?? ''}{!value && <span className={s.secEmpty}>—</span>}</dd></div>;
  }
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <select className={`${s.select} ${s.inpFull}`} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={m.busy}>
          <option value="">{empty ?? tr('— сонгох —')}</option>
          {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </dd>
    </div>
  );
}

/** Чекбокс — харах горимд ☑/☐ текст (хэвлэхэд ч харагдана) */
export function Chk({
  m, label, value, onChange,
}: { m: Mode; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.chk}>
      <input type="checkbox" checked={value} disabled={!m.edit || m.busy} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span>{label}</span>
    </label>
  );
}

/** Radio бүлэг — нэг сонголт */
export function Radio<T extends string>({
  m, name, label, value, onChange, options,
}: {
  m: Mode; name: string; label: string; value: T | null; onChange: (v: T) => void;
  options: readonly { v: T; l: string }[];
}) {
  return (
    <div className={s.chkRow} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.v} className={s.chk}>
          <input type="radio" name={name} checked={value === o.v} disabled={!m.edit || m.busy} onChange={() => onChange(o.v)} />
          <span>{o.l}</span>
        </label>
      ))}
    </div>
  );
}

/** Олон сонголт — чекбокс мөр */
export function Multi<T extends string>({
  m, label, value, onChange, options,
}: {
  m: Mode; label: string; value: readonly T[]; onChange: (v: T[]) => void;
  options: readonly { v: T; l: string }[];
}) {
  const toggle = (v: T, on: boolean) => onChange(on ? [...new Set([...value, v])] : value.filter((x) => x !== v));
  return (
    <div className={s.chkRow} role="group" aria-label={label}>
      {options.map((o) => (
        <Chk key={o.v} m={m} label={o.l} value={value.includes(o.v)} onChange={(on) => toggle(o.v, on)} />
      ))}
    </div>
  );
}

/** Мөр нэмэх/хасах товч — хүснэгтэнд */
export function RowBtn({ m, onClick, label }: { m: Mode; onClick: () => void; label: string }) {
  if (!m.edit) return null;
  return (
    <button type="button" className={s.btn} disabled={m.busy} onClick={onClick} aria-label={label} title={label}>
      {label}
    </button>
  );
}

/** Бүхэл тоо (хуудасны тоо г.м.) — `<dt>/<dd>` хос дотор; хоосон → null */
export function NumInp({
  m, label, value, onChange,
}: { m: Mode; label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {m.edit ? (
          <input
            type="number" min={0} step={1} className={s.input} aria-label={label}
            value={value ?? ''} disabled={m.busy}
            /* ⚠️ 2026-09-25: 0 зөвшөөрнө (хоосон → null); өмнө нь 0 → null болж бичигдэхгүй байв */
            onChange={(e) => { const v = e.target.value.trim(); const n = Number(v); onChange(v !== '' && Number.isInteger(n) && n >= 0 ? n : null); }}
          />
        ) : (value ?? <span className={s.secEmpty}>—</span>)}
      </dd>
    </div>
  );
}

/** Таслалаар тусгаарласан жагсаалт → `string[]` */
export const splitComma = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Таслалаар тусгаарласан жагсаалт (блок, холбогдох дугаар) — `<dt>/<dd>` хос дотор.
 * ⚠️ 2026-09-28: бичих явцад «а, » гэж бичихэд таслал алга болохгүйн тулд текстийг
 *    ДОТООД төлөвт барьж, гадна утга өөрчлөгдвөл (өөр баримт сонгоход) л дахин уншина.
 */
export function ListInp({
  m, label, value, onChange, list, hint,
}: { m: Mode; label: string; value: readonly string[]; onChange: (v: string[]) => void; list?: string; hint?: string }) {
  const joined = value.join(', ');
  const [txt, setTxt] = useState(joined);
  /* Гадна утга өөрчлөгдсөн (өөр баримт) — зурах явцад тааруулна (React-ийн «derived state» загвар, effect биш) */
  const [prevJoined, setPrevJoined] = useState(joined);
  if (prevJoined !== joined) {
    setPrevJoined(joined);
    if (splitComma(txt).join(', ') !== joined) setTxt(joined);
  }
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {m.edit ? (
          <input
            className={`${s.input} ${s.inpFull}`} placeholder={hint ?? tr('таслалаар тусгаарлана')} aria-label={label} list={list}
            value={txt} disabled={m.busy}
            onChange={(e) => { setTxt(e.target.value); onChange(splitComma(e.target.value)); }}
          />
        ) : (joined || <span className={s.secEmpty}>—</span>)}
      </dd>
    </div>
  );
}
