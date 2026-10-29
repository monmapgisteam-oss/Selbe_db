'use client';

import { useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  CATEGORIES, DENSITY_BY_TYPE, PARKING_SOURCES, GREEN_SOURCES, GREEN_RADII, LOCATION_RADII, BUILDING_PURPOSES, BUILDING_PURPOSE_OTHER,
  type Indicator, type ParkingOpt, type ParkingSource, type CategoryKey,
  type GreenOpt, type GreenSource,
} from '@/lib/analysis/config';
import { scoreTone, clamp, passesNorm, patchNorm } from '@/lib/analysis/score';
import { Donut, useTip } from '@/components/ui';
import { pct as fmtPct } from '@/lib/format';
import { nf, normLine, zoneTypeLabel } from './format';
import type { LocationPt } from '@/lib/analysis/data';
import type { Row } from './model';
import s from '../suitability.module.css';

/**
 * «Зогсоол» ба «Ногоон байгууламж» картын ДИАГРАМЫН ЦОРЫН ГАНЦ ӨНГӨ.
 */
const CHART = 'var(--data)';

/**
 * ХАНГАЛТЫН ЗУРВАС — 100% нь нормын түвшин (Зогсоол · Ногоон байгууламж).
 */
function FillBar({ pct, label, hint }: { pct: number | null; label: string; hint: string }) {
  const tip = useTip();
  return (
    <>
      <div className={s.parkBar} {...tip.bind({ label, value: fmtPct(pct, 0), color: CHART, hint })}>
        {pct != null && <span style={{ width: `${clamp(pct, 0, 100)}%`, background: CHART }} />}
      </div>
      {tip.node}
    </>
  );
}

/**
 * ТООЦООНЫ ТОМЬЁО — хураадаг блок.
 */
function Formula({ children }: { children: ReactNode }) {
  const [off, setOff] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${s.subLabel} ${s.toggleLabel} ${off ? s.toggleOff : ''}`}
        onClick={() => setOff((v) => !v)}
      >
        <span>{tr('Тооцооны томьёо')}</span><i>▼</i>
      </button>
      {!off && <div className={s.parkFormula}>{children}</div>}
    </>
  );
}

/* ══════════════════ Үндсэн 3 төрлийн дугуй диаграм ══════════════════ */

/**
 * Хот төлөвлөлтийн үзүүлэлтүүд 3 үндсэн төрөлд бүлэглэгдэнэ. Диаграм нь
 * тэдгээрийн ЖИНГИЙН эзлэх хувийг харуулж, тайлбарт нь тухайн төрлийн дундаж
 * ОНОО гарна.
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

  /** Голд — гурван төрлийн жигнэсэн ерөнхий дундаж оноо */
  let tSum = 0, tW = 0;
  for (const c of cats) {
    if (c.score == null) continue;
    tSum += c.score * c.weight;
    tW += c.weight;
  }
  const overall = tW ? Math.round(tSum / tW) : null;

  return (
    <Donut
      size="md"
      items={cats.map((c) => ({
        key: c.key,
        label: c.short,
        value: c.weight,
        // Зүсмэгийн өнгө нь ангиллын «утга» биш, зөвхөн ялгах зорилготой. Онооны
        // утгыг тайлбарын тоо (scoreTone) хэлнэ.
        color: c.color,
        display: (
          <>
            <b style={{ color: scoreTone(c.score) }}>
              {c.score == null ? '—' : Math.round(c.score)}
            </b>
            {' · '}
            {c.share.toFixed(0)}%
          </>
        ),
      }))}
      center={overall ?? '—'}
      centerLabel={tr('дундаж оноо')}
      selected={filter}
      onSelect={(k) => setFilter(filter === k ? null : (k as CategoryKey))}
    />
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
    .map((c) => ({ c, items: indicators.filter((i) => i.cat === c.key && !i.ref) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className={s.indHead} style={{ marginTop: 10 }}>
        <span>{tr('Үзүүлэлт')}</span><span>{tr('Жин')}</span><span>{tr('Норм хангасан')}</span><span />
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
                if (passesNorm(p.value, p.norm)) pass++;
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
                  {/* FAR/BCR нь дангаараа (богино нэр), бусад нь бүтэн нэршлээрээ */}
                  <span className="nm">{i.byType ? i.short : i.name}</span>
                  <span className="wt">{((i.weight / totalW) * 100).toFixed(0)}%</span>
                  <span className="cnt">{total ? `${pass}/${total}` : '—'}</span>
                  <span className="bar">{total > 0 && <i style={{ width: `${pct}%`, background: scoreTone(pct) }} />}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={s.indNote}>
        <div className={s.wReq}>
          <b>{tr('Норм:')}</b> {normLine(ind)}
          <span className="wt">{tr('жин')} {((ind.weight / totalW) * 100).toFixed(0)}%</span>
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
  const [fixMsg, setFixMsg] = useState<Record<string, { msg: string; ind: Indicator }>>({});
  const patch = (id: string, key: keyof Indicator, value: number): boolean => {
    const cur = indicators.find((i) => i.id === id);
    if (!cur) return false;
    const r = patchNorm(cur, key, value);
    setIndicators(indicators.map((i) => (i.id === id ? r.ind : i)));
    setFixMsg((m) => {
      if (!r.clamped) {
        if (!(id in m)) return m;
        const { [id]: _drop, ...rest } = m;
        void _drop;
        return rest;
      }
      const v = nf(r.ind[key] as number, cur.decimals);
      const msg = key === 'weight'
        ? tr('Утгыг {0} болгож засав — жин сөрөг байж болохгүй.', v)
        : cur.mode === 'higher'
          ? tr('Утгыг {0} болгож засав — «0 оноо» нь нормын доодоос их байж болохгүй.', v)
          : cur.mode === 'band'
            ? tr('Утгыг {0} болгож засав — нормын доод нь дээдээсээ их байж болохгүй.', v)
            : tr('Утгыг {0} болгож засав — «0 оноо» нь нормын дээдээс бага байж болохгүй.', v);
      return { ...m, [id]: { msg, ind: r.ind } };
    });
    return r.clamped;
  };

  return (
    <div>
      {indicators.filter((i) => !i.ref).map((i) => {
        // Босго засварлах талбарууд — горимоос хамаарч өөр
        const fields: [keyof Indicator, string][] = i.mode === 'band'
          ? [['optMin', tr('Нормын доод')], ['optMax', tr('Нормын дээд')], ['hardMin', tr('0 оноо (доош)')], ['hardMax', tr('0 оноо (дээш)')]]
          : i.mode === 'higher'
            ? [['target', tr('Нормын доод')], ['hardMin', tr('0 оноо')]]
            : [['best', tr('Нормын дээд')], ['hardMax', tr('0 оноо')]];

        return (
          <div key={i.id} className={s.wRow} style={{ opacity: i.weight === 0 ? 0.45 : 1 }}>
            <div className={s.wTop}>
              <span className="nm">{i.name}</span>
              <span className="pct">{((i.weight / totalW) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" className={s.wSlider} min={0} max={40} step={1}
              value={i.weight}
              aria-label={tr('{0} — жин', i.name)}
              onChange={(e) => patch(i.id, 'weight', Number(e.target.value))}
            />
            <div className={s.wReq}><b>{tr('Норм:')}</b> {normLine(i)}</div>
            <div className={s.wSrc}>{i.norm}</div>

            {i.byType ? (
              // FAR / BCR — бүсийн төрөл бүрд өөр дээд хязгаартай тул хүснэгтээр
              <div className={s.wTypes}>
                {Object.entries(DENSITY_BY_TYPE).map(([t, v]) => (
                  <div key={t}>
                    <span>{zoneTypeLabel(t)}</span>
                    <b>≤ {nf(v[i.byType!], i.decimals)}{i.unit ? ` ${i.unit}` : ''}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.wThr}>
                {fields.map(([key, label]) => (
                  <label key={String(key)}>
                    <span>{label}</span>
                    <NormInput
                      value={i[key] as number | undefined}
                      onCommit={(v) => patch(i.id, key, v)}
                    />
                  </label>
                ))}
                {fixMsg[i.id]?.ind === i && (
                  <div role="status" style={{ gridColumn: '1 / -1', fontSize: 10.5, color: 'var(--warn-ink)' }}>
                    {fixMsg[i.id].msg}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Нормын тоон талбар — бичиж байх үеийн ТҮР утга (`draft`) нь хязгаарлалтаас ТУСДАА.
 */
function NormInput({ value, onCommit }: { value: number | undefined; onCommit: (v: number) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const v = parseFloat(draft);
    if (Number.isFinite(v)) onCommit(v);
    setDraft(null);
  };
  return (
    <input
      type="number" step="any"
      value={draft ?? (value ?? '')}
      onChange={(e) => {
        const txt = e.target.value;
        setDraft(txt);
        const v = parseFloat(txt);
        /* Хүчинтэй бол шууд; хумигдвал бичигдэж буй текст хэвээр, blur-д засагдана */
        if (Number.isFinite(v)) onCommit(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

/* ══════════════════ Зогсоол ══════════════════ */

export function Parking({
  rows, parking, setParking,
}: {
  rows: Row[];
  parking: ParkingOpt;
  setParking: (p: ParkingOpt) => void;
}) {
  const withNeed = rows.filter((r) => r.parkingNeed != null && r.parkingGap != null);
  const supply = withNeed.reduce((a, r) => a + r.parkingSupply, 0);
  const need: number | null = withNeed.length
    ? withNeed.reduce((a, r) => a + (r.parkingNeed as number), 0)
    : null;
  const il = withNeed.reduce((a, r) => a + r.etIl, 0);
  const dald = withNeed.reduce((a, r) => a + r.etDald, 0);
  const gap: number | null = need == null ? null : supply - need;
  const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
  const pct = need != null && need > 0 ? (supply / need) * 100 : null;

  const hh = withNeed.reduce((a, r) => a + r.households, 0);
  const pop = withNeed.reduce((a, r) => a + r.residentPop, 0);
  /** Хэрэгцээний томьёоны ЗҮҮН тал — сонгосон аргаас хамаарна */
  const needExpr = parking.source === 'households'
    ? <>{nf(hh)} {tr('өрх ×')} {parking.perHousehold.toFixed(2)} {tr('зогсоол')}</>
    : parking.source === 'population'
      ? <>{nf(pop)} {tr('оршин суугч ×')} {parking.per1000} ÷ 1000</>
      : <>{tr('бүх бүсийн нормд заасан зогсоолын нийлбэр')}</>;

  return (
    <div className={s.plain}>
      <div className={s.subLabel}>{tr('Хэрэгцээг ямар аргаар тооцох вэ?')}</div>
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
            <span>{parking.source === 'households' ? tr('Нэг өрхөд ногдох зогсоол') : tr('1000 хүнд ногдох зогсоол')}</span>
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
            aria-label={tr('Зогсоолын коэффициент')}
            onChange={(e) => setParking(parking.source === 'households'
              ? { ...parking, perHousehold: Number(e.target.value) }
              : { ...parking, per1000: Number(e.target.value) })}
          />
        </div>
      )}

      <div className={s.parkHead}>
        {/* envhub: индикаторын том тоо акцентаар будагдахгүй — үндсэн бэхээрээ */}
        <div className={s.parkPct}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>{tr('Хэрэгцээ хангасан хувь')}</b>
          <span>{tr('Төлөвлөгөөнд')} <b>{nf(supply)}</b> {tr('· шаардлагатай')} <b>{nf(need)}</b> {tr('зогсоол')}</span>
        </div>
      </div>

      <FillBar
        pct={pct}
        label={tr('Хэрэгцээ хангасан хувь')}
        hint={tr('Ерөнхий төлөвлөгөөнд тусгагдсан зогсоол нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна')}
      />
      <div className={s.parkScale}><span>0%</span><span>{tr('Норм 100%')}</span></div>

      <Formula>
        {tr('Хэрэгцээ =')} {needExpr} = <b>{nf(need)}</b> {tr('зогсоол')}<br />
        {tr('Ерөнхий төлөвлөгөөнд тусгагдсан =')} {nf(il)} {tr('ил +')} {nf(dald)} {tr('далд =')} <b>{nf(supply)}</b> {tr('зогсоол')}<br />
        {tr('Хангалт =')} {nf(supply)} ÷ {nf(need)} × 100 = <b>{pct == null ? '—' : `${Math.round(pct)}%`}</b>
      </Formula>

      <div className={s.finSummary}>
        <div><span>{tr('Ил болон далд зогсоол')}</span><b>{nf(il)} / {nf(dald)}</b></div>
        <div>
          <span>{gap == null || gap >= 0 ? tr('Илүүдэл') : tr('Дутагдал')}</span>
          <b>{gap == null ? '—' : <>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))}</>}</b>
        </div>
        <div><span>{tr('Дутагдалтай бүс')}</span><b>{short}</b></div>
        <div><span>{tr('Хангалттай бүс')}</span><b>{withNeed.length - short}</b></div>
      </div>
    </div>
  );
}

/* ══════════════════ Ногоон байгууламж ══════════════════ */

/**
 * НОГООН БАЙГУУЛАМЖИЙН ХАНГАМЖ — «Зогсоолын хэрэгцээ» картын ЯГ ИЖИЛ зарчим:
 * байгаа хэмжээ ба шаардлагатай хэмжээ хоёрыг харьцуулж, хангалтын хувийг гаргана.
 */
export function Green({
  rows, green, setGreen,
}: {
  rows: Row[];
  green: GreenOpt;
  setGreen: (g: GreenOpt) => void;
}) {
  const perPerson = green.source === 'perPerson';
  const buffer = green.source === 'buffer';
  /** Нэгж — «нөлөөллийн бүс» арга нь ХҮН тоолдог, бусад нь м² хэмждэг */
  const unit = buffer ? tr('оршин суугч') : tr('м²');

  /**
   * Бүс бүрийн байгаа ба шаардлагатай хэмжээ. Хэрэгцээгүй бол `null`.
   */
  const per = rows.map((r) => {
    if (buffer) {
      const pop = r.greenDist.reduce((a, x) => a + x.pop, 0);
      const cov = r.greenDist.reduce((a, x) => a + (x.d <= green.radius ? x.pop : 0), 0);
      return { r, have: cov, need: pop > 0 ? pop : null };
    }
    const have = r.greenM2;
    const need = perPerson
      ? (r.residentPop > 0 ? r.residentPop * green.perPerson : null)
      : (r.polyHa > 0 ? r.polyHa * 10_000 * (green.share / 100) : null);
    return { r, have, need };
  });

  const withNeed = per.filter((p) => p.need != null && p.need > 0);
  const haveAll = rows.reduce((a, r) => a + r.greenM2, 0);
  const need = withNeed.reduce((a, p) => a + (p.need ?? 0), 0);
  const haveNeeded = withNeed.reduce((a, p) => a + p.have, 0);
  const gap = haveNeeded - need;
  const short = withNeed.filter((p) => p.have < (p.need ?? 0)).length;
  const pct = need > 0 ? (haveNeeded / need) * 100 : null;

  /** Төслийн НИЙТ талбайд ногоон эзлэх хувь — «30% ногоон уу?» гэсэн асуултын хариу */
  const landM2 = rows.reduce((a, r) => a + r.polyHa * 10_000, 0);
  const sharePct = landM2 > 0 ? (haveAll / landM2) * 100 : null;

  /**
   * Хэрэгцээний томьёоны ЗҮҮН тал.
   */
  const needPop = withNeed.reduce((a, p) => a + p.r.residentPop, 0);
  const needLandM2 = withNeed.reduce((a, p) => a + p.r.polyHa * 10_000, 0);
  const needExpr = buffer
    ? <>{tr('бүсийн бүх оршин суугч')}</>
    : perPerson
      ? <>{nf(needPop)} {tr('оршин суугч ×')} {green.perPerson} {tr('м²')}</>
      : <>{nf(needLandM2 / 10_000, 1)} {tr('га ×')} {green.share}%</>;

  return (
    <div className={s.plain}>
      <div className={s.subLabel}>{tr('Хэрэгцээг ямар аргаар тооцох вэ?')}</div>
      <div className={s.toggles}>
        {GREEN_SOURCES.map((src) => (
          <label key={src.key} className={s.chk}>
            <input
              type="radio" name="greenSrc"
              checked={green.source === src.key}
              onChange={() => setGreen({ ...green, source: src.key as GreenSource })}
            />
            <span>{src.label}</span>
          </label>
        ))}
      </div>

      <div className={s.sliderRow}>
        <label>
          <span>{buffer ? tr('Нөлөөллийн бүсийн радиус') : perPerson ? tr('Нэг оршин суугчид ногдох ногоон') : tr('Талбайд ногоон эзлэх хувь')}</span>
          <span className="val">
            {buffer ? tr('{0} м', green.radius) : perPerson ? tr('{0} м²', green.perPerson.toFixed(1)) : `${green.share}%`}
          </span>
        </label>

        {buffer ? (
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            {GREEN_RADII.map((v) => {
              const on = green.radius === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGreen({ ...green, radius: v })}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 11, borderRadius: 2,
                    border: `1px solid ${on ? CHART : 'var(--line)'}`,
                    background: on ? 'var(--panel-2)' : 'transparent',
                    color: 'var(--text)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type="range"
            min={perPerson ? 2 : 5}
            max={perPerson ? 20 : 60}
            step={perPerson ? 0.5 : 1}
            value={perPerson ? green.perPerson : green.share}
            aria-label={tr('Ногоон байгууламжийн коэффициент')}
            onChange={(e) => {
              const v = Number(e.target.value);
              setGreen(perPerson ? { ...green, perPerson: v } : { ...green, share: v });
            }}
          />
        )}
      </div>

      <div className={s.parkHead}>
        {/* envhub: индикаторын том тоо акцентаар будагдахгүй — үндсэн бэхээрээ */}
        <div className={s.parkPct}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>{buffer ? tr('Ногоон байгууламжийн хүртээмж') : tr('Хэрэгцээ хангасан хувь')}</b>
          <span>
            {buffer ? tr('Хамрагдсан') : tr('Байгаа')} <b>{nf(haveNeeded)}</b> ·{' '}
            {buffer ? tr('нийт') : tr('шаардлагатай')} <b>{nf(need)}</b> {unit}
          </span>
        </div>
      </div>

      <FillBar
        pct={pct}
        label={buffer ? tr('Ногоон байгууламжийн хүртээмж') : tr('Хэрэгцээ хангасан хувь')}
        hint={buffer
          ? tr('Ногоон байгууламжийн нөлөөллийн бүсэд хамрагдсан оршин суугчийн эзлэх хувь')
          : tr('Байгаа ногоон байгууламж нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна')}
      />
      <div className={s.parkScale}><span>0%</span><span>{tr('Норм 100%')}</span></div>

      <Formula>
        {buffer ? tr('Нийт') : tr('Хэрэгцээ')} = {needExpr} = <b>{nf(need)}</b> {unit}<br />
        {buffer ? tr('Хамрагдсан ({0} м дотор)', green.radius) : tr('Байгаа')} = <b>{nf(haveNeeded)}</b> {unit}<br />
        {tr('Хангалт =')} {nf(haveNeeded)} ÷ {nf(need)} × 100 = <b>{pct == null ? '—' : `${Math.round(pct)}%`}</b>
      </Formula>

      <div className={s.finSummary}>
        <div>
          <span>{tr('Ногоон эзлэх хувь (төсөл)')}</span>
          <b>{sharePct == null ? '—' : `${nf(sharePct, 1)}%`}</b>
        </div>
        <div>
          <span>{tr('Ногоон / нийт талбай')}</span>
          <b>{nf(haveAll / 10_000, 1)} / {nf(landM2 / 10_000, 1)} {tr('га')}</b>
        </div>
        <div>
          <span>{buffer ? tr('Хамрагдаагүй') : gap >= 0 ? tr('Илүүдэл') : tr('Дутагдал')}</span>
          <b>{buffer ? nf(need - haveNeeded) : `${gap >= 0 ? '+' : '−'}${nf(Math.abs(gap))}`} {unit}</b>
        </div>
        <div><span>{tr('Дутагдалтай бүс')}</span><b>{short}</b></div>
      </div>
    </div>
  );
}

/* ══════════════════ Байршил ══════════════════ */

/** Зориулалтын бүлгийн өнгө — «Барилгын ангилал» картын палитртай НЭГ эх сурвалж */
const groupColor = (g: string) =>
  BUILDING_PURPOSES.find((x) => x.key === g)?.color ?? BUILDING_PURPOSE_OTHER.color;

/**
 * БАЙРШЛЫН ШИНЖИЛГЭЭ — газрын зурагтай ХОЁР ТАЛЫН холбоотой.
 *
 * Газрын зураг дээрх барилга дээр дарахад тухайн барилгын ХӨРШИЙН зураг гарна:
 * радиус тус бүрд хэдэн барилга байгаа, тэдгээр нь ямар зориулалттай, хэдэн
 * метрийн зайд байгаа.
 */
export function Location({ pts, sel, onSel, radius, setRadius, publicOnly, setPublicOnly }: {
  pts: LocationPt[];
  /** Сонгосон барилгын OBJECTID (газрын зургаас эсвэл жагсаалтаас) */
  sel: number | null;
  onSel: (oid: number | null) => void;
  radius: number;
  setRadius: (r: number) => void;
  /** ЗӨВХӨН олон нийтийн бүсийн барилгыг зурагт ба шинжилгээнд үлдээх */
  publicOnly: boolean;
  setPublicOnly: (v: boolean) => void;
}) {
  const me = sel == null ? null : pts.find((p) => p.oid === sel) ?? null;

  /** Сонгосон барилгаас бусад руу — зайгаар эрэмбэлсэн */
  const near = me
    ? pts
      .filter((p) => p.oid !== me.oid)
      .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.y - me.y) }))
      .sort((a, b) => a.d - b.d)
    : [];

  const check = (
    <label className={s.chk} style={{ marginBottom: 4 }}>
      <input
        type="checkbox"
        checked={publicOnly}
        onChange={(e) => setPublicOnly(e.target.checked)}
      />
      <span>{tr('Улаан бүсийн барилга')}</span>
    </label>
  );

  if (!pts.length) {
    return (
      <div className={s.plain}>
        {check}
        <p className={`${s.muted} ${s.small}`}>{tr('Барилгын өгөгдөл алга')}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className={s.plain}>{check}</div>
    );
  }

  const within = (r: number) => near.filter((x) => x.d <= r);
  const list = within(radius);
  const flow = list.reduce((a, x) => a + x.p.trips, 0);
  const rivals = list.filter((x) => x.p.group === me.group).length;

  return (
    <div className={s.plain}>
      {check}
      {/**
        * СОНГОСОН БАРИЛГА — толгойд нь «ЮУ сонгосон» гэдэг л байна.
        */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        marginTop: 2, marginBottom: 9,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>
            {me.purpose || tr('Тодорхойгүй')}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
            {me.zone ?? '—'} {tr('· барилга #')}{me.oid}
            {me.pop > 0 ? tr(' · {0} оршин суугч', nf(me.pop)) : ''}
            {me.trips > 0 ? tr(' · {0} зорчилт/ц', nf(me.trips)) : ''}
          </div>
        </div>
        <button type="button" className={s.mini} onClick={() => onSel(null)}>
          {tr('Арилгах')}
        </button>
      </div>

      {/* Радиусын задаргаа — дарж дэлгэрэнгүйг сольно */}
      <div className={s.subLabel} style={{ marginTop: 11 }}>{tr('Эргэн тойрны барилга')}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {LOCATION_RADII.map((v) => {
          const on = radius === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => setRadius(v)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 2,
                border: `1px solid ${on ? CHART : 'var(--line)'}`,
                background: on ? 'var(--panel-2)' : 'transparent',
                color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{within(v).length}</div>
              <div style={{ fontSize: 9.5, opacity: 0.75 }}>{tr('{0} м', v)}</div>
            </button>
          );
        })}
      </div>

      <div className={s.finSummary} style={{ marginTop: 9 }}>
        <div>
          <span>{tr('Хамгийн ойр барилга')}</span>
          <b>{near.length ? tr('{0} м', Math.round(near[0].d)) : '—'}</b>
        </div>
        <div><span>{tr('Өдрийн урсгал')}</span><b>{nf(flow)} {tr('/ц')}</b></div>
        <div><span>{tr('Ижил зориулалт')}</span><b>{rivals}</b></div>
        <div><span>{radius} {tr('м доторх')}</span><b>{list.length} {tr('барилга')}</b></div>
      </div>

      {/* Дэлгэрэнгүй жагсаалт — зай + зориулалт */}
      <div className={s.subLabel} style={{ marginTop: 11 }}>
        {radius} {tr('м доторх')} {list.length} {tr('барилга')}
      </div>
      <div className={`${s.econChart} ${s.pchart}`}>
        {list.length === 0 && (
          <p className={`${s.muted} ${s.small}`}>{tr('Энэ зайд өөр барилга алга')}</p>
        )}
        {list.map((x) => (
          <button
            key={x.p.oid}
            type="button"
            className={s.econRow}
            title={tr('Дарвал энэ барилга руу шилжинэ')}
            onClick={() => onSel(x.p.oid)}
          >
            <div className={s.econRowTop}>
              <i style={{ background: groupColor(x.p.group) }} />
              <span className="nm">{x.p.purpose || tr('Тодорхойгүй')}</span>
              <b>{tr('{0} м', Math.round(x.d))}</b>
            </div>
            <div className={s.econMeta}>
              {x.p.zone ?? '—'}
              {x.p.pop > 0 ? tr(' · {0} оршин суугч', nf(x.p.pop)) : ''}
              {x.p.trips > 0 ? tr(' · {0} зорчилт/ц', nf(x.p.trips)) : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
