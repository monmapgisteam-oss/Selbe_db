'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { SCORE_LEVELS, levelOf, NO_DATA_TONE, MIN_MEASURED_SHARE, type Indicator } from '@/lib/analysis/config';
import { scoreTone, scoreInk } from '@/lib/analysis/score';
import { useTheme } from '@/lib/theme';
import { nf, zoneTypeLabel } from './format';
import { zoneLabel } from '@/lib/zoneLabel';
import { valueOf, type Mode, type Row } from './model';
import { competitionRanks, countWithData, zoneCsv } from './rankUtil';
import { downloadText, fileDate } from '@/lib/csvFile';
import s from '../suitability.module.css';

/* ══════════════════ Бүсийн эрэмбэ ══════════════════ */

export function Ranking({
  rows, mode, ind, indicators, selected, onSelect,
}: {
  rows: Row[];
  mode: Mode;
  ind: Indicator;
  indicators: readonly Indicator[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const dark = useTheme().theme === 'dark';
  const [off, setOff] = useState<Set<number>>(
    () => new Set(SCORE_LEVELS.map((_, i) => i).filter((i) => SCORE_LEVELS[i].min !== 25)),
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (valueOf(b, mode, ind) ?? -1) - (valueOf(a, mode, ind) ?? -1)),
    [rows, mode, ind],
  );
  const ranks = useMemo(() => competitionRanks(sorted.map((r) => valueOf(r, mode, ind))), [sorted, mode, ind]);
  const withData = countWithData(rows, mode, ind);
  const lowCov = mode === 'urban' ? rows.filter((r) => r.urbanReason === 'coverage').length : 0;
  const minPct = Math.round(MIN_MEASURED_SHARE * 100);
  const exportCsv = () => downloadText(
    `selbe-bus-onoo-${fileDate()}.csv`, zoneCsv(rows, mode, ind, indicators), 'text/csv',
  );

  const perLevel = SCORE_LEVELS.map((_, i) => sorted.filter((r) => levelOf(valueOf(r, mode, ind)) === i).length);
  const noData = sorted.filter((r) => levelOf(valueOf(r, mode, ind)) < 0).length;

  const out: ReactNode[] = [];
  let last: number | null = null;

  sorted.forEach((r, i) => {
    const tot = valueOf(r, mode, ind);
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
          title={hidden ? tr('Дэлгэх') : tr('Хураах')}
          onClick={() => {
            const next = new Set(off);
            if (next.has(lv)) next.delete(lv); else next.add(lv);
            setOff(next);
          }}
        >
          <i style={{ background: L ? L.tone : NO_DATA_TONE }} />
          <span>{L ? tr('{0}–{1} оноо', L.min, Math.min(100, L.max)) : tr('Өгөгдөлгүй')}</span>
          <em />

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
        title={r.coverage == null ? undefined : tr('Хэмжсэн жин {0}% — оноо гаргахад ≥ {1}% шаардлагатай', Math.round(r.coverage * 100), minPct)}
      >
        <span className="rk">{ranks[i] ?? '—'}</span>
        <span className="nm">{zoneLabel(r.id)}<i>{zoneTypeLabel(r.type)}</i>{r.coverage != null && <i>{tr('хэмжсэн {0}%', Math.round(r.coverage * 100))}</i>}</span>
        <span className="nm2">{r.raw.density == null ? '' : tr('{0} хүн/га', nf(r.raw.density))}</span>
        <span className="tot" style={{ background: scoreTone(tot), color: scoreInk(tot, dark) }}>{tot == null ? '—' : Math.round(tot)}</span>
      </button>,
    );
  });

  return (
    <>
      <div className={s.rankMeta}>
        <span>
          {tr('{0}/{1} бүс өгөгдөлтэй', withData, rows.length)}
          {lowCov > 0 && ` · ${tr('{0} бүсийн өгөгдөл хангалтгүй (хэмжсэн жин < {1}%)', lowCov, minPct)}`}
        </span>
        <button
          type="button"
          className={s.mini}
          onClick={exportCsv}
          title={tr('Бүс бүрийн оноо ба үзүүлэлт бүрийн түүхий утгыг CSV-ээр татна')}
        >
          {tr('CSV татах')}
        </button>
      </div>
      <div className={s.rankHead}><span>#</span><span>{tr('Бүс')}</span><span>{tr('Нягтшил')}</span><span>{tr('Оноо')}</span></div>
      <div className={s.rankList}>{out}</div>
    </>
  );
}
