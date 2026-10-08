'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { SCORE_LEVELS, levelOf, NO_DATA_COLOR, type Indicator } from '@/lib/analysis/config';
import { scoreColor, scoreInk } from '@/lib/analysis/score';
import { nf } from './format';
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
  /** ⚠️ 2026-10-01: CSV экспортод үзүүлэлт бүрийн түүхий утга/оноо */
  indicators: readonly Indicator[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  /**
   * ⚠️ Анхнаасаа зөвхөн 25–45 онооны бүлэг нээлттэй — анхаарал шаардсан бүсийг
   * шууд харуулж, өндөр оноотой бүсүүд жагсаалтыг дүүргэхгүй.
   *
   * ⚠️ Түвшинг ОНООНЫ ЗУРВАСААР олно, шошгын үгээр БИШ: интерфейсээс үнэлгээний
   * үг хассан тул шошгонд түшиглэвэл дараа нь чимээгүй эвдэрнэ.
   */
  const [off, setOff] = useState<Set<number>>(
    () => new Set(SCORE_LEVELS.map((_, i) => i).filter((i) => SCORE_LEVELS[i].min !== 25)),
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (valueOf(b, mode, ind) ?? -1) - (valueOf(a, mode, ind) ?? -1)),
    [rows, mode, ind],
  );
  /**
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ИЖИЛ (бүхэлчилсэн) оноонд ИЖИЛ байр
   *    («1, 2, 2, 4») — урьд нь мөрийн дугаар (`i + 1`) байв (`rankUtil.competitionRanks`).
   */
  const ranks = useMemo(() => competitionRanks(sorted.map((r) => valueOf(r, mode, ind))), [sorted, mode, ind]);
  const withData = countWithData(rows, mode, ind);
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
          {/* ⚠️ Бүлгийн нэр нь ҮНЭЛГЭЭНИЙ ҮГГҮЙ («сайн»/«муу» гэхгүй): эрэмбэ нь
              оноог харуулах ёстой болохоос дүгнэлт өгөх ёсгүй. Түвшинг ӨНГӨ ба
              ОНООНЫ ЗУРВАС хоёр л заана. */}
          <i style={{ background: L ? L.color : NO_DATA_COLOR }} />
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
      >
        <span className="rk">{ranks[i] ?? '—'}</span>
        <span className="nm">{r.id}<i>{r.type}</i></span>
        <span className="nm2">{r.raw.density == null ? '' : tr('{0} хүн/га', nf(r.raw.density))}</span>
        <span className="tot" style={{ background: scoreColor(tot), color: scoreInk(tot) }}>{tot == null ? '—' : Math.round(tot)}</span>
      </button>,
    );
  });

  return (
    <>
      {/* ⚠️ 2026-10-01: хэдэн бүс ОНООТОЙ вэ (өгөгдөлгүй нь байргүй) + CSV экспорт */}
      <div className={s.rankMeta}>
        <span>{tr('{0}/{1} бүс өгөгдөлтэй', withData, rows.length)}</span>
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
