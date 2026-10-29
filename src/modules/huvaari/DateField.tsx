'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { parseDayInput } from '@/lib/dateInput';
import h from '../huvaari.module.css';

const DatePicker = dynamic(() => import('@/modules/sheet/DatePicker'), { ssr: false });

/**
 * ОГНООНЫ ТАЛБАР — ГАРААР БИЧИХ + 📅 КАЛЕНДАР (2026-10-04, хэрэглэгч: «бодит эхэлсэн
 * дууссан мөн адил календараас сонголгүй гараар бичиж өгөх боломжтой болгох»).
 */
export function DateField({ value, onChange, onBad, disabled, label }: {
  /** `YYYY-MM-DD` эсвэл `''` */
  value: string;
  onChange: (v: string) => void;
  /** Бичсэн текст огноо болж задрахгүй бол `true` */
  onBad?: (bad: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const [txt, setTxt] = useState(value);
  /* Эцгээс утга солигдвол (мөр/блок солих, «мужаар нь авах», хоног бичих) дагана —
     бичиж буй текст ижил огноог илэрхийлж байвал хөндөхгүй (2026.10.4 → 2026-10-04 болгохгүй) */
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (parseDayInput(txt) !== value) setTxt(value);
  }
  const parsed = parseDayInput(txt);
  const bad = parsed == null;
  const [cal, setCal] = useState<DOMRect | null>(null);
  const onBadRef = useRef(onBad);
  useEffect(() => { onBadRef.current = onBad; });
  useEffect(() => {
    onBadRef.current?.(bad);
    return () => onBadRef.current?.(false);
  }, [bad]);

  const set = (v: string) => {
    setTxt(v);
    const p = parseDayInput(v);
    if (p != null) onChange(p);
  };

  return (
    <span className={h.dateIn}>
      <input
        className={`${h.select} ${h.dateTxt}${bad ? ` ${h.dateBad}` : ''}`}
        value={txt}
        disabled={disabled}
        inputMode="text"
        autoComplete="off"
        placeholder="2026-10-04"
        aria-label={label}
        aria-invalid={bad}
        title={bad
          ? tr('Огноо буруу — жишээ: 2026-10-04')
          : tr('Огноо бичнэ: 2026-10-04 · 2026.10.04 · 20261004')}
        onChange={(e) => set(e.target.value)}
        /* Зөв бол хэлбэрийг жигдэлнэ: «20261004» → «2026-10-04» */
        onBlur={() => { if (parsed && parsed !== txt) setTxt(parsed); }}
      />
      <button
        type="button"
        className={h.dateCal}
        disabled={disabled}
        title={tr('Календараас сонгох')}
        aria-label={tr('Календараас сонгох')}
        onClick={(e) => setCal((e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect())}
      >📅</button>
      {cal && (
        <DatePicker
          value={parsed || ''}
          anchor={cal}
          onClose={() => setCal(null)}
          onPick={(v) => { set(v); setCal(null); }}
        />
      )}
    </span>
  );
}
