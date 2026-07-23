'use client';

import { useEffect, useState } from 'react';
import {
  COST_GROUPS, BUILD_COST_PER_M2, profitScore, profitLabel,
} from '@/lib/analysis/config';
import { scoreColor } from '@/lib/analysis/score';
import type { Costs } from '@/lib/analysis/costs';
import { money, nf, unitMoney } from './format';
import { COLLAPSE_KEY, readSet, type Row } from './model';
import s from '../suitability.module.css';

/* ══════════════════ Эдийн засаг — зүүн карт ══════════════════ */

export function EconSummary({
  rows, costs, perHa, buildCost,
}: {
  rows: Row[];
  costs: Costs;
  perHa: number;
  buildCost: number;
}) {
  const revenue = rows.reduce((a, r) => a + (r.econ?.revenue ?? 0), 0);
  const revenueRes = rows.reduce((a, r) => a + (r.econ?.revenueRes ?? 0), 0);
  const zoneInfra = rows.reduce((a, r) => a + (r.econ?.infraCost ?? 0), 0);
  const zoneBuild = rows.reduce((a, r) => a + (r.econ?.buildCost ?? 0), 0);
  const zoneCost = zoneInfra + zoneBuild;
  const zoneArea = rows.reduce((a, r) => a + r.areaHa, 0);
  const profit = revenue - zoneCost;
  const share = revenue > 0 ? (zoneCost / revenue) * 100 : null;
  /**
   * ⚠️ «1 га-д зарцуулах төсөв» нь ДЭД БҮТЭЦ + БАРИЛГА хоёуланг агуулна.
   * Дэд бүтцийг төслийн 156 га-д, барилгыг бүсүүдийн талбайд хуваадаг тул
   * нийлбэрийг бүсүүдийн нийт талбайд хуваан ганц үзүүлэлт болгоно.
   */
  const spendPerHa = zoneArea > 0 ? zoneCost / zoneArea : 0;
  /** Зурвасуудын НЭГДСЭН хэмжээс — гурвыг харьцуулах боломжтой байлгана */
  const meterMax = Math.max(zoneCost, revenue, 1);
  /** Ашгийн маржа — ЭДИЙН ЗАСГИЙН ОНОО үүн дээр тогтоно */
  const margin = revenue > 0 ? (profit / revenue) * 100 : (zoneCost > 0 ? -Infinity : null);
  const col = scoreColor(profitScore(margin));

  const sorted = [...costs.layers].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total || 1;

  const byGroup: Record<string, number> = {};
  for (const l of costs.layers) byGroup[l.group] = (byGroup[l.group] ?? 0) + l.total;

  return (
    <>
      <div className={s.econHead}>
        <div className={s.econBig}>
          <span>Нийт зарцуулах төсөв</span>
          <b>{money(zoneCost)}</b>
        </div>
        <div className={s.econBig}>
          <span>1 га-д зарцуулах төсөв</span>
          <b>{money(spendPerHa)}<i> / га</i></b>
        </div>
      </div>
      <p className={`${s.muted} ${s.xsmall}`}>
        Зарцуулах төсөв = <b>дэд бүтэц</b> ({costs.layers.length} үйлчилгээ,{' '}
        {money(costs.total)} → {money(perHa)}/га × бүсийн талбай) +{' '}
        <b>барилга угсралт</b> (<b>Барилгын_нийт_талбай_m2</b> ×{' '}
        {money(buildCost, 2)}/м², «Одоо байгаа» хасагдсан).<br />
        Дэд бүтцийг төслийн <b>{nf(costs.projectHa)} га</b>-д хуваасан.
      </p>

      {/**
        * ГУРВАН ГОЛ ҮЗҮҮЛЭЛТ — индикатор хэлбэрээр.
        *
        * ⚠️ Зурвасууд БҮГД нэг хэмжээст (max(зардал, орлого)) тул урт нь
        * харьцуулах утгатай. Тус тусдаа 100%-д нормчилвол «зардал = орлого»
        * мэт харагдана.
        */}
      <div className={s.subLabel}>Гол үзүүлэлт</div>
      <EconMeter
        label="Нийт зардал"
        value={zoneCost}
        max={meterMax}
        color="#f87171"
        note={`дэд бүтэц ${money(zoneInfra)} + барилга ${money(zoneBuild)}`}
      />
      <EconMeter
        label="Борлуулалтын орлого"
        value={revenue}
        max={meterMax}
        color="#fbbf24"
        note={`үүнээс орон сууц ${money(revenueRes)}`}
      />
      <EconMeter
        label={profit >= 0 ? 'Ашиг' : 'Алдагдал'}
        value={profit}
        max={meterMax}
        color={col}
        note={margin == null || !Number.isFinite(margin)
          ? profitLabel(margin)
          : `ашгийн маржа ${nf(margin, 1)}% · ${profitLabel(margin)}`}
      />

      <div className={s.finSummary}>
        <div>
          <span>Эдийн засгийн оноо</span>
          <b style={{ color: col }}>
            {profitScore(margin) == null ? '—' : Math.round(profitScore(margin)!)}
          </b>
        </div>
        <div><span>Зардлын эзлэх хувь</span><b>{share == null ? '—' : `${nf(share, 1)}%`}</b></div>
        <div><span>Ашигтай бүс</span><b className={s.pos}>{rows.filter((r) => (r.econ?.profit ?? 0) > 0).length} / {rows.length}</b></div>
        <div><span>Бүсүүдийн талбай</span><b>{nf(zoneArea, 1)} га</b></div>
        <div><span>1 га-д зарцуулах</span><b>{money(spendPerHa)}</b></div>
      </div>

      <div className={s.subLabel}>Үйлчилгээ тус бүрийн өртөг</div>
      <div className={s.econChart}>
        {sorted.map((l) => {
          const g = COST_GROUPS[l.group];
          const pct = (l.total / (costs.total || 1)) * 100;
          const meta = l.qtyUnit === 'ш'
            ? `${nf(l.count)} ш × ${unitMoney(l.unitPrice)}`
            : !l.uniformPrice
              ? `${nf(l.qty)} ${l.qtyUnit} · нэгж үнэ хувьсах`
              : `${nf(l.qty, l.divisor === 1 ? 2 : 0)} ${l.qtyUnit} × ${unitMoney(l.unitPrice)}/${l.divisor === 1 ? l.qtyUnit : `${l.divisor}м`}`;
          return (
            <div key={l.id} className={s.econRow} title={`${l.label} — ${g.label}`}>
              <div className={s.econRowTop}>
                <i style={{ background: g.color }} />
                <span className="nm">{l.label}</span>
                <b>{money(l.total)}</b>
                <em>{nf(pct, 1)}%</em>
              </div>
              <div className={s.econBar}><i style={{ width: `${(l.total / max) * 100}%`, background: g.color }} /></div>
              <div className={s.econMeta}>{meta}</div>
            </div>
          );
        })}

        <div className={s.subLabel}>Салбараар</div>
        {Object.entries(byGroup).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} className={s.econGrp}>
            <i style={{ background: COST_GROUPS[k].color }} />
            <span>{COST_GROUPS[k].label}</span>
            <b>{money(v)}</b>
            <em>{nf((v / (costs.total || 1)) * 100, 1)}%</em>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Эдийн засгийн нэг үзүүлэлт — индикатор мөр (нэр · дүн · зурвас · тайлбар).
 * ⚠️ Хот төлөвлөлтийн үзүүлэлттэй ИЖИЛ `.mRow` бүтэц: хэрэглэгч хоёр талыг
 * ижил хэлбэрээр уншина.
 */
function EconMeter({
  label, value, max, color, note,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  note: string;
}) {
  const w = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <div className={s.mRow}>
      <div className={s.mTop}>
        <span className="nm">{label}</span>
        <span className="v" style={{ color }}>{money(value)}</span>
      </div>
      <div className={s.mBar}><i style={{ width: `${w}%`, background: color }} /></div>
      <div className={s.socMeta}>{note}</div>
    </div>
  );
}

/* ══════════════════ Эдийн засгийн загварчлал — баруун карт ══════════════════ */

export function EconTune({
  rows, costs, basePrice, econOpt, setEconOpt, buildCost, setBuildCost, selected, onSelect,
}: {
  rows: Row[];
  costs: Costs;
  basePrice: number;
  econOpt: { pricePerM2: number | null; perHa: number | null };
  setEconOpt: (v: { pricePerM2: number | null; perHa: number | null }) => void;
  buildCost: number;
  setBuildCost: (v: number) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [pcOff, setPcOff] = useState(false);
  useEffect(() => { setPcOff(readSet().has('profitChart')); }, []);

  const price = econOpt.pricePerM2 ?? basePrice;
  const perHa = econOpt.perHa ?? costs.perHa;
  const changed = econOpt.pricePerM2 !== null;

  const cost = rows.reduce((a, r) => a + (r.econ?.cost ?? 0), 0);
  const rev = rows.reduce((a, r) => a + (r.econ?.revenue ?? 0), 0);
  const profit = rev - cost;

  const data = rows.filter((r) => r.econ).sort((a, b) => b.econ!.profit - a.econ!.profit);
  const maxAbs = Math.max(1, ...data.map((r) => Math.abs(r.econ!.profit)));
  const win = data.filter((r) => r.econ!.profit > 0);
  const totalWin = win.reduce((a, r) => a + r.econ!.profit, 0) || 1;
  const totalLoss = data.filter((r) => r.econ!.profit < 0).reduce((a, r) => a + r.econ!.profit, 0) || 1;

  const togglePc = () => {
    const next = !pcOff;
    setPcOff(next);
    const set = readSet();
    if (next) set.add('profitChart'); else set.delete('profitChart');
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  };

  return (
    <section className={`${s.card} ${s.collapsible} ${s.econTune} ${pcOff ? s.pcOff : ''}`}>
      <h2>
        Эдийн засгийн загварчлал
        <button
          type="button"
          className={s.mini}
          title="Өгөгдлийн анхны утга руу буцаах"
          onClick={() => { setEconOpt({ pricePerM2: null, perHa: null }); setBuildCost(BUILD_COST_PER_M2); }}
        >
          Reset
        </button>
      </h2>
      <div className={s.body}>
        <p className={`${s.muted} ${s.small}`}>
          Нэгж үнийг гулсуураар өөрчилж, бүсүүдийн ашиг хэрхэн хэлбэлзэхийг доор шууд харна.
        </p>

        {/* ⚠️ Барилгын өртөг нь эх өгөгдөлд БАЙХГҮЙ — зөвхөн энэ таамаг */}
        <div className={s.sliderRow}>
          <label>
            <span>1 м² баригдах жишиг өртөг</span>
            <span className="val">{nf(buildCost / 1e6, 2)} сая ₮/м²</span>
          </label>
          <input
            type="range" min={0} max={8} step={0.1}
            value={buildCost / 1e6}
            aria-label="1 м² баригдах жишиг өртөг"
            onChange={(e) => setBuildCost(Number(e.target.value) * 1e6)}
          />
          <div className={s.wSrc}>
            Эх өгөгдөлд барилгын өөрийн өртгийн талбар БАЙХГҮЙ — энэ нь таамаг.
            <b> Барилгын_нийт_талбай_m2</b> × энэ үнэ = барилгын зардал («Одоо
            байгаа» барилга ороогүй).
          </div>
        </div>

        <div className={s.sliderRow}>
          <label>
            <span>Орон сууцны 1 м² үнэ</span>
            <span className="val">{nf(price / 1e6, 1)} сая ₮/м²</span>
          </label>
          <input
            type="range" min={0} max={Math.max(10, Math.ceil((basePrice / 1e6) * 2))} step={0.1}
            value={price / 1e6}
            aria-label="Орон сууцны 1 м² үнэ"
            onChange={(e) => setEconOpt({ pricePerM2: Number(e.target.value) * 1e6, perHa })}
          />
        </div>

        <div className={s.sliderRow}>
          <label>
            <span>1 га-д зарцуулах төсөв</span>
            <span className="val">{nf(perHa / 1e9, 1)} тэрбум ₮/га</span>
          </label>
          <input
            type="range" min={0} max={Math.max(40, Math.ceil((costs.perHa / 1e9) * 1.5))} step={0.5}
            value={perHa / 1e9}
            aria-label="1 га-д зарцуулах төсөв"
            onChange={(e) => setEconOpt({ pricePerM2: price, perHa: Number(e.target.value) * 1e9 })}
          />
        </div>

        <div className={s.finSummary}>
          <div><span>Нийт зардал</span><b>{money(cost)}</b></div>
          <div><span>Нийт орлого</span><b>{money(rev)}</b></div>
          <div>
            <span>{profit >= 0 ? 'Ашиг' : 'Алдагдал'}</span>
            <b className={profit >= 0 ? s.pos : s.neg}>{money(profit)}</b>
          </div>
          <div>
            <span>Өгөгдлийн утга</span>
            <b className={changed ? s.neg : s.pos}>{changed ? 'өөрчилсөн' : 'хэвээр'}</b>
          </div>
        </div>

        <button type="button" className={`${s.subLabel} ${s.toggleLabel} ${pcOff ? s.toggleOff : ''}`} onClick={togglePc}>
          <span>Бүсүүдийн ашиг / алдагдал</span><i>▼</i>
        </button>

        <div className={s.pchart}>
          {data.map((r) => {
            const p = r.econ!.profit;
            const col = p >= 0 ? '#4ade80' : '#ef4444';
            const pct = p >= 0 ? (p / totalWin) * 100 : (p / totalLoss) * 100;
            return (
              <button
                key={r.id}
                type="button"
                className={`${s.econRow} ${selected === r.id ? s.econOn : ''}`}
                title={r.type}
                onClick={() => onSelect(selected === r.id ? null : r.id)}
              >
                <div className={s.econRowTop}>
                  <i style={{ background: col }} />
                  <span className="nm">{r.id}</span>
                  <b style={{ color: col }}>{money(p)}</b>
                  <em>{nf(pct, 1)}%</em>
                </div>
                <div className={s.econBar}><i style={{ width: `${(Math.abs(p) / maxAbs) * 100}%`, background: col }} /></div>
                <div className={s.econMeta}>
                  {nf(r.areaHa, 2)} га · зардал {money(r.econ!.cost)} · орлого {money(r.econ!.revenue)}
                </div>
              </button>
            );
          })}
          <div className={s.pchartLgd}>
            <span><b className={s.pos}>{win.length}</b> ашигтай</span>
            <span><b className={s.neg}>{data.length - win.length}</b> алдагдалтай</span>
          </div>
        </div>
      </div>
    </section>
  );
}
