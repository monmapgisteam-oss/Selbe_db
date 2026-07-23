'use client';

import {
  CATEGORIES, DENSITY_BY_TYPE, PARKING_SOURCES,
  type Indicator, type ParkingOpt, type ParkingSource, type CategoryKey,
} from '@/lib/analysis/config';
import { scoreColor, scoreIndicator, clamp } from '@/lib/analysis/score';
import { nf, normLine } from './format';
import type { Row } from './model';
import s from '../suitability.module.css';

/* ══════════════════ Үндсэн 3 төрлийн дугуй диаграм ══════════════════ */

/**
 * Хот төлөвлөлтийн үзүүлэлтүүд 3 үндсэн төрөлд бүлэглэгдэнэ. Диаграм нь
 * тэдгээрийн ЖИНГИЙН эзлэх хувийг харуулж, тайлбарт нь тухайн төрлийн дундаж
 * ОНОО гарна.
 *
 * ⚠️ SVG дугуйг `stroke-dasharray`-аар зурна — олон `<path>` үүсгэхээс хямд
 * бөгөөд өнцөг тооцох тригонометр шаардахгүй.
 */
export function CategoryPie({
  rows, indicators, totalW, filter, setFilter,
}: {
  rows: Row[];
  indicators: Indicator[];
  totalW: number;
  filter: CategoryKey | null;
  setFilter: (c: CategoryKey | null) => void;
}) {
  const size = 116, width = 20;
  const r = (size - width) / 2;
  const circ = 2 * Math.PI * r;

  const cats = CATEGORIES.map((c) => {
    const mine = indicators.filter((i) => i.cat === c.key);
    const weight = mine.reduce((a, i) => a + i.weight, 0);
    // Тухайн төрлийн дундаж оноо — бүх бүс, бүх гишүүн үзүүлэлтээр жигнэсэн
    let sum = 0, wsum = 0;
    for (const row of rows) {
      for (const i of mine) {
        const p = row.parts[i.id];
        if (p?.score == null || i.weight <= 0) continue;
        sum += p.score * i.weight;
        wsum += i.weight;
      }
    }
    return { ...c, weight, share: (weight / totalW) * 100, score: wsum ? sum / wsum : null };
  });

  let acc = 0;
  const slices = cats.map((c) => {
    const frac = totalW > 0 ? c.weight / totalW : 0;
    const offset = acc;
    acc += frac;
    return { ...c, frac, offset };
  });

  return (
    <div className={s.pieWrap}>
      <svg className={s.pie} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* −90° эргүүлж 12 цагаас эхлүүлнэ */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#101720" strokeWidth={width} />
          {slices.map((sl) => (
            <circle
              key={sl.key}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={sl.color}
              strokeWidth={filter === sl.key ? width + 4 : width}
              strokeOpacity={filter && filter !== sl.key ? 0.3 : 1}
              strokeDasharray={`${sl.frac * circ} ${circ}`}
              strokeDashoffset={-sl.offset * circ}
            >
              <title>{`${sl.label}: ${sl.share.toFixed(0)}%`}</title>
            </circle>
          ))}
        </g>
      </svg>

      <div className={s.pieLegend}>
        {cats.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`${s.pieItem} ${filter === c.key ? s.pieOn : ''}`}
            title={`${c.label} — дарж шүүнэ`}
            onClick={() => setFilter(filter === c.key ? null : c.key)}
          >
            <i style={{ background: c.color }} />
            <span>{c.short}</span>
            <b style={{ color: scoreColor(c.score) }}>{c.score == null ? '—' : Math.round(c.score)}</b>
            <em>{c.share.toFixed(0)}%</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════ Үзүүлэлт сонгох ══════════════════ */

export function IndicatorPicker({
  rows, indicators, active, setActive, totalW, filter,
}: {
  rows: Row[];
  indicators: Indicator[];
  active: string;
  setActive: (id: string) => void;
  totalW: number;
  /** Дугуй диаграмаас сонгосон төрөл — `null` бол бүгд */
  filter: CategoryKey | null;
}) {
  const ind = indicators.find((i) => i.id === active) ?? indicators[0];
  const groups = CATEGORIES
    .filter((c) => !filter || c.key === filter)
    .map((c) => ({ c, items: indicators.filter((i) => i.cat === c.key) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className={s.indHead} style={{ marginTop: 10 }}>
        <span>Үзүүлэлт</span><span>Жин</span><span>Норм хангасан</span><span />
      </div>

      {groups.map(({ c, items }) => (
        <div key={c.key}>
          <div className={s.subLabel} style={{ color: c.color }}>{c.label}</div>
          <div className={s.indList}>
            {items.map((i) => {
              let pass = 0, total = 0;
              for (const r of rows) {
                const p = r.parts[i.id];
                if (!p || p.value == null) continue;
                total++;
                // ⚠️ «Норм хангасан» гэдэг нь ЯГ 100 оноо — хөвөгч тооны
                //    нарийвчлалыг бодож 99.9-ээр шалгана
                if ((p.score ?? 0) >= 99.9) pass++;
              }
              const pct = total ? (pass / total) * 100 : 0;
              return (
                <button
                  key={i.id}
                  type="button"
                  className={`${s.ind} ${i.id === active ? s.indOn : ''}`}
                  title={i.name}
                  onClick={() => setActive(i.id)}
                >
                  <span className="nm">{i.short}</span>
                  <span className="wt">{((i.weight / totalW) * 100).toFixed(0)}%</span>
                  <span className="cnt">{total ? `${pass}/${total}` : '—'}</span>
                  <span className="bar"><i style={{ width: `${pct}%`, background: scoreColor(pct) }} /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={s.indNote}>
        <div className={s.wReq}>
          <b>Норм:</b> {normLine(ind)}
          <span className="wt">жин {((ind.weight / totalW) * 100).toFixed(0)}%</span>
        </div>
        <div className={s.wSrc}>{ind.norm}</div>
      </div>
    </>
  );
}

/* ══════════════════ Жингийн тохиргоо ══════════════════ */

export function Weights({
  indicators, setIndicators, totalW,
}: {
  indicators: Indicator[];
  setIndicators: (v: Indicator[]) => void;
  totalW: number;
}) {
  const patch = (id: string, key: keyof Indicator, value: number) =>
    setIndicators(indicators.map((i) => (i.id === id ? { ...i, [key]: value } : i)));

  return (
    <div>
      {indicators.map((i) => {
        // Босго засварлах талбарууд — горимоос хамаарч өөр
        const fields: [keyof Indicator, string][] = i.mode === 'band'
          ? [['optMin', 'Нормын доод'], ['optMax', 'Нормын дээд'], ['hardMin', '0 оноо (доош)'], ['hardMax', '0 оноо (дээш)']]
          : i.mode === 'higher'
            ? [['target', 'Нормын доод'], ['hardMin', '0 оноо']]
            : [['best', 'Нормын дээд'], ['hardMax', '0 оноо']];

        return (
          <div key={i.id} className={s.wRow} style={{ opacity: i.weight === 0 ? 0.45 : 1 }}>
            <div className={s.wTop}>
              <span className="nm">{i.name}</span>
              <span className="pct">{((i.weight / totalW) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" className={s.wSlider} min={0} max={40} step={1}
              value={i.weight}
              aria-label={`${i.name} — жин`}
              onChange={(e) => patch(i.id, 'weight', Number(e.target.value))}
            />
            <div className={s.wReq}><b>Норм:</b> {normLine(i)}</div>
            <div className={s.wSrc}>{i.norm}</div>

            {i.byType ? (
              // FAR / BCR — бүсийн төрөл бүрд өөр дээд хязгаартай тул хүснэгтээр
              <div className={s.wTypes}>
                {Object.entries(DENSITY_BY_TYPE).map(([t, v]) => (
                  <div key={t}>
                    <span>{t}</span>
                    <b>≤ {nf(v[i.byType!], i.decimals)}{i.unit ? ` ${i.unit}` : ''}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.wThr}>
                {fields.map(([key, label]) => (
                  <label key={String(key)}>
                    <span>{label}</span>
                    <input
                      type="number" step="any"
                      defaultValue={i[key] as number}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) patch(i.id, key, v);
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════ Зогсоол ══════════════════ */

export function Parking({
  rows, parking, setParking, indicators,
}: {
  rows: Row[];
  parking: ParkingOpt;
  setParking: (p: ParkingOpt) => void;
  indicators: Indicator[];
}) {
  const supply = rows.reduce((a, r) => a + r.parkingSupply, 0);
  const need = rows.reduce((a, r) => a + (r.parkingNeed ?? 0), 0);
  const il = rows.reduce((a, r) => a + r.etIl, 0);
  const dald = rows.reduce((a, r) => a + r.etDald, 0);
  const gap = supply - need;
  const withNeed = rows.filter((r) => r.parkingGap != null);
  const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
  const pct = need > 0 ? (supply / need) * 100 : null;

  // Хангалтын өнгө нь газрын зураг, оноололтой ижил шатлалаас гарна
  const parkInd = indicators.find((i) => i.id === 'parking')!;
  const col = scoreColor(scoreIndicator(pct, parkInd));

  const hh = rows.reduce((a, r) => a + r.households, 0);
  const pop = rows.reduce((a, r) => a + r.population, 0);
  const formula = parking.source === 'households'
    ? `${nf(hh)} өрх × ${parking.perHousehold.toFixed(2)} зогсоол = <b>${nf(hh * parking.perHousehold)}</b>`
    : parking.source === 'population'
      ? `${nf(pop)} хүн × ${parking.per1000} ÷ 1000 = <b>${nf((pop * parking.per1000) / 1000)}</b>`
      : 'Эх өгөгдлийн <b>NORM_ZOGS</b> талбарын нийлбэр';

  return (
    <>
      <p className={`${s.muted} ${s.small}`}>
        <b>Байгаа зогсоол</b> = ил + далд (ET_NIIT) — өгөгдлөөс шууд.
        <b> Шаардлагатай зогсоол</b>-ыг доорх 3 аргын аль нэгээр бодож, хоёрыг нь харьцуулна.
      </p>

      <div className={s.subLabel}>Хэрэгцээг юугаар бодох вэ?</div>
      <div className={s.toggles}>
        {PARKING_SOURCES.map((src) => (
          <label key={src.key} className={s.chk}>
            <input
              type="radio" name="parkSrc"
              checked={parking.source === src.key}
              onChange={() => setParking({ ...parking, source: src.key as ParkingSource })}
            />
            <span>{src.label}</span>
          </label>
        ))}
      </div>

      {parking.source !== 'norm' && (
        <div className={s.sliderRow}>
          <label>
            <span>{parking.source === 'households' ? 'Нэг өрхөд ногдох зогсоол' : '1000 хүнд ногдох зогсоол'}</span>
            <span className="val">
              {parking.source === 'households' ? parking.perHousehold.toFixed(2) : parking.per1000}
            </span>
          </label>
          <input
            type="range"
            min={parking.source === 'households' ? 0.2 : 50}
            max={parking.source === 'households' ? 2 : 600}
            step={parking.source === 'households' ? 0.05 : 10}
            value={parking.source === 'households' ? parking.perHousehold : parking.per1000}
            aria-label="Зогсоолын коэффициент"
            onChange={(e) => setParking(parking.source === 'households'
              ? { ...parking, perHousehold: Number(e.target.value) }
              : { ...parking, per1000: Number(e.target.value) })}
          />
        </div>
      )}

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: col }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>Хэрэгцээний хангалт</b>
          <span>Байгаа <b>{nf(supply)}</b> · шаардлагатай <b>{nf(need)}</b> зогсоол</span>
        </div>
      </div>

      <div className={s.parkBar} title="Байгаа зогсоол нь хэрэгцээний хэдэн хувийг хангаж байна">
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: col }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      <div className={s.parkFormula}>
        Хэрэгцээ: <span dangerouslySetInnerHTML={{ __html: formula }} />
      </div>

      <div className={s.finSummary}>
        <div><span>Байгаа — ил / далд</span><b>{nf(il)} / {nf(dald)}</b></div>
        <div>
          <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b className={gap >= 0 ? s.pos : s.neg}>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))}</b>
        </div>
        <div><span>Дутагдалтай бүс</span><b className={short ? s.neg : s.pos}>{short} / {withNeed.length}</b></div>
        <div><span>Хангалттай бүс</span><b className={s.pos}>{withNeed.length - short} / {withNeed.length}</b></div>
      </div>
    </>
  );
}
