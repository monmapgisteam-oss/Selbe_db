'use client';

import { SCORE_LEVELS, levelOf } from '@/lib/analysis/config';
import { scoreColor, scoreLabel } from '@/lib/analysis/score';
import { blendScore, econScore, type Mode, type Row } from './model';
import s from '../suitability.module.css';

/**
 * ХОТ ТӨЛӨВЛӨЛТ ↔ ЭДИЙН ЗАСГИЙН хуваарилалт.
 *
 * ⚠️ Аппын НЭЭГДЭХ карт. Хоёр талын аль нэгийг дангаар нь харах нь дүгнэлтийг
 * тал болгодог: хамгийн ашигтай бүс нь хамгийн муу төлөвлөгдсөн байж болно.
 * Гулсуур нь 0 (зөвхөн хот төлөвлөлт) → 100 (зөвхөн эдийн засаг).
 */
export function BlendCard({
  rows, econShare, setEconShare, onPick,
}: {
  rows: Row[];
  econShare: number;
  setEconShare: (v: number) => void;
  onPick: (m: Mode) => void;
}) {
  const avg = (f: (r: Row) => number | null) => {
    const v = rows.map(f).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const urban = avg((r) => r.urban);
  const econ = avg((r) => econScore(r));
  const blend = avg((r) => blendScore(r, econShare));

  const levels = SCORE_LEVELS.map((L, i) => ({
    L, n: rows.filter((r) => levelOf(blendScore(r, econShare)) === i).length,
  }));

  return (
    <section className={s.card}>
      <h2>Нийлмэл үнэлгээ</h2>

      <div className={s.blendLabels}>
        <span className={s.bUrban}>Хот төлөвлөлт <b>{100 - econShare}%</b></span>
        <span className={s.bFin}><b>{econShare}%</b> Эдийн засаг</span>
      </div>
      <input
        type="range"
        className={s.blendRange}
        min={0} max={100} step={5}
        value={econShare}
        aria-label="Хот төлөвлөлт ↔ эдийн засгийн хуваарилалт"
        onChange={(e) => setEconShare(Number(e.target.value))}
      />

      <div className={s.blendScores}>
        <button type="button" className={s.blendScore} onClick={() => onPick('urban')}>
          <span>Хот төлөвлөлт</span>
          <b style={{ color: scoreColor(urban) }}>{urban == null ? '—' : Math.round(urban)}</b>
        </button>
        <button type="button" className={s.blendScore} onClick={() => onPick('econ')}>
          <span>Эдийн засаг</span>
          <b style={{ color: scoreColor(econ) }}>{econ == null ? '—' : Math.round(econ)}</b>
        </button>
      </div>

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: scoreColor(blend) }}>
          {blend == null ? '—' : Math.round(blend)}
        </div>
        <div className={s.parkHeadTxt}>
          <b>{rows.length} бүсийн дундаж</b>
          <span>{scoreLabel(blend)} · газрын зураг, эрэмбэ энэ оноогоор</span>
        </div>
      </div>

      <div className={s.subLabel}>Түвшний тархалт</div>
      <div className={s.finSummary}>
        {levels.map(({ L, n }) => (
          <div key={L.label}>
            <span>{L.label}</span>
            <b style={{ color: L.color }}>{n}</b>
          </div>
        ))}
      </div>

      <p className={s.wSrc} style={{ marginTop: 10 }}>
        Дээд табаас «Хот төлөвлөлт» эсвэл «Эдийн засаг»-ийг сонгоход тухайн
        талын дэлгэрэнгүй тохиргоо (жин, босго, өртгийн гулсуур) нэмэгдэнэ.
      </p>
    </section>
  );
}
