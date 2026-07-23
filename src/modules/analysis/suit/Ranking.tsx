'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { SCORE_LEVELS, levelOf, NO_DATA_COLOR, type Indicator } from '@/lib/analysis/config';
import { scoreColor } from '@/lib/analysis/score';
import { nf } from './format';
import { valueOf, type Mode, type Row } from './model';
import s from '../suitability.module.css';

/* ══════════════════ Бүсийн эрэмбэ ══════════════════ */

export function Ranking({
  rows, mode, ind, econShare, selected, onSelect,
}: {
  rows: Row[];
  mode: Mode;
  ind: Indicator;
  econShare: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  /**
   * ⚠️ Анхнаасаа зөвхөн «Муу» бүлэг нээлттэй — анхаарал шаардсан бүсийг шууд
   * харуулж, сайн үзүүлэлттэй бүсүүд жагсаалтыг дүүргэхгүй.
   */
  const [off, setOff] = useState<Set<number>>(
    () => new Set(SCORE_LEVELS.map((_, i) => i).filter((i) => SCORE_LEVELS[i].label !== 'Муу')),
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (valueOf(b, mode, ind, econShare) ?? -1) - (valueOf(a, mode, ind, econShare) ?? -1)),
    [rows, mode, ind, econShare],
  );

  const perLevel = SCORE_LEVELS.map((_, i) => sorted.filter((r) => levelOf(valueOf(r, mode, ind, econShare)) === i).length);
  const noData = sorted.filter((r) => levelOf(valueOf(r, mode, ind, econShare)) < 0).length;

  const out: ReactNode[] = [];
  let last: number | null = null;

  sorted.forEach((r, i) => {
    const tot = valueOf(r, mode, ind, econShare);
    const lv = levelOf(tot);

    if (lv !== last) {
      last = lv;
      const L = SCORE_LEVELS[lv];
      const hidden = off.has(lv);
      out.push(
        <button
          key={`grp${lv}`}
          type="button"
          className={`${s.rankGrp} ${hidden ? s.grpOff : ''}`}
          title={hidden ? 'Дэлгэх' : 'Хураах'}
          onClick={() => {
            const next = new Set(off);
            if (next.has(lv)) next.delete(lv); else next.add(lv);
            setOff(next);
          }}
        >
          <i style={{ background: L ? L.color : NO_DATA_COLOR }} />
          <span>{L ? L.label : 'Өгөгдөлгүй'}</span>
          <em>{L ? `${L.min}–${Math.min(100, L.max)}` : ''}</em>
          <b>{lv < 0 ? noData : perLevel[lv]}</b>
          <u>▼</u>
        </button>,
      );
    }
    if (off.has(lv)) return;

    out.push(
      <button
        key={r.id}
        type="button"
        className={`${s.rankRow} ${selected === r.id ? s.rankSel : ''} ${/багц/i.test(r.id) ? s.bagts : ''}`}
        onClick={() => onSelect(selected === r.id ? null : r.id)}
      >
        <span className="rk">{i + 1}</span>
        <span className="nm">{r.id}<i>{r.type}</i></span>
        <span className="nm2">{r.raw.density == null ? '' : `${nf(r.raw.density)} хүн/га`}</span>
        <span className="tot" style={{ background: scoreColor(tot) }}>{tot == null ? '—' : Math.round(tot)}</span>
      </button>,
    );
  });

  return (
    <>
      <div className={s.rankHead}><span>#</span><span>Бүс</span><span>Нягтшил</span><span>Оноо</span></div>
      <div className={s.rankList}>{out}</div>
    </>
  );
}
