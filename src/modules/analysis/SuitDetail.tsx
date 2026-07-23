'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  PARKING_SOURCES, profitScore, profitLabel,
  type Indicator, type ParkingOpt,
} from '@/lib/analysis/config';
import { scoreColor, scoreLabel, normText, passesNorm, clamp, scoreIndicator, type Part } from '@/lib/analysis/score';
import type { MapRow } from './SuitMap';
import { nf, money } from './suit/format';
import s from './suitability.module.css';

/**
 * Бүсийн дэлгэрэнгүй — зургийн зүүн дээд буланд хөвөх карт.
 *
 * ⚠️ Толгойноос нь ЧИРЖ зөөнө. Зургийн хүрээнээс гарахгүй; өөр бүс сонгоход
 * зөөсөн байрлалдаа үлдэнэ, хаагаад дахин нээхэд буланд буцна (эх аппын зан).
 */
export function SuitDetail({
  r,
  indicators,
  mode,
  activeIndicator,
  parking,
  perHa,
  onClose,
}: {
  r: MapRow & { parts: Record<string, Part> };
  indicators: Indicator[];
  mode: 'blend' | 'urban' | 'indicator' | 'econ';
  activeIndicator: string;
  parking: ParkingOpt;
  perHa: number;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** Хаагаад дахин нээхэд буланд буцаах — нээгдэх агшинд л байрлалыг тэглэнэ */
  useEffect(() => {
    if (box.current) { box.current.style.left = '14px'; box.current.style.top = '14px'; }
  }, []);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(`.${s.dClose}`)) return; // хаах товчийг саатуулахгүй
    const el = box.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    e.preventDefault();
    const head = e.currentTarget;
    head.setPointerCapture(e.pointerId);
    el.classList.add(s.dragging);

    const wb = wrap.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const offX = e.clientX - b.left, offY = e.clientY - b.top;

    const move = (ev: PointerEvent) => {
      el.style.left = `${clamp(ev.clientX - wb.left - offX, 6, wb.width - el.offsetWidth - 6)}px`;
      el.style.top = `${clamp(ev.clientY - wb.top - offY, 6, wb.height - el.offsetHeight - 6)}px`;
    };
    const up = () => {
      el.classList.remove(s.dragging);
      head.releasePointerCapture(e.pointerId);
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  };

  const tot = r.urban;
  const totalW = indicators.reduce((a, i) => a + i.weight, 0) || 1;
  const parkSrc = PARKING_SOURCES.find((p) => p.key === parking.source)!;
  // ⚠️ «Ерөнхий» горимд ХОЁУЛАНГ нь харуулна — нийлмэл оноо хоёулангаас гардаг
  //    тул зөвхөн нэг талыг үзүүлбэл дүн хаанаас гарсан нь ойлгомжгүй.
  const urbanModes = mode === 'blend' || mode === 'urban' || mode === 'indicator';
  const econModes = mode === 'blend' || mode === 'econ';

  return (
    <div ref={box} className={s.detail}>
      <div className={s.dHead} onPointerDown={startDrag}>
        {/* ⚠️ `.gauge` нь `:global` — `.dHead .gauge` гэсэн үр удмын сонгогч тул */}
        <div className="gauge" style={{ background: scoreColor(tot) }}>
          {tot == null ? '—' : Math.round(tot)}
        </div>
        <div>
          <h3>{r.id}</h3>
          <p>{r.type} · {nf(r.areaHa, 2)} га · {scoreLabel(tot)}</p>
        </div>
        <button type="button" className={s.dClose} title="Хаах" onClick={onClose}>×</button>
      </div>

      {urbanModes && (
        <>
          <div className={s.dSect}>
            <h4>Хот төлөвлөлтийн үзүүлэлт</h4>
            {indicators.map((ind) => {
              const p: Part | undefined = r.parts[ind.id];
              const eff = p?.norm ?? ind;
              const pass = passesNorm(p?.value, eff);
              // Нормын байрлалыг зурааснаас харуулах тэмдэглэгээ (зөвхөн band горимд)
              const markPos = eff.mode === 'band' ? scoreIndicator(eff.optMin ?? 0, eff) : null;
              const on = mode === 'indicator' && activeIndicator === ind.id;
              return (
                <div key={ind.id} className={`${s.mRow} ${on ? s.mOn : ''}`}>
                  <div className={s.mTop}>
                    <span className="nm">{ind.name}</span>
                    <span className="v" style={{ color: scoreColor(p?.score) }}>
                      {p?.value == null ? '—' : `${nf(p.value, ind.decimals)}${ind.unit ? ` ${ind.unit}` : ''}`}
                    </span>
                    <span className="w">{((ind.weight / totalW) * 100).toFixed(0)}%</span>
                  </div>
                  <div className={s.mNorm}>
                    <span className={pass == null ? undefined : pass ? 'ok' : 'bad'}>
                      {pass == null ? 'өгөгдөлгүй' : pass ? '✓ норм' : '✗ норм'} {normText(eff, nf)}
                    </span>
                  </div>
                  <div className={s.mBar}>
                    <i style={{ width: `${p?.score ?? 0}%`, background: scoreColor(p?.score) }} />
                    {markPos !== null && <u style={{ left: `calc(${markPos}% - 1px)` }} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={s.dSect}>
            <h4>Суурь үзүүлэлт</h4>
            <div className={s.dGrid}>
              <div><span>Оршин суугч</span><b>{nf(r.residentPop)}</b></div>
              <div><span>Үйлчилгээний хүчин чадал</span><b>{nf(r.capacityPop)}</b></div>
              <div><span>Өрхийн тоо</span><b>{nf(r.households)}</b></div>
              <div><span>Барилгын тоо</span><b>{nf(r.buildingCount)}</b></div>
              <div><span>Барилгын нийт талбай</span><b>{nf(r.gfaM2)} м²</b></div>
              <div><span>Ногоон байгууламж</span><b>{nf(r.greenM2)} м²</b></div>
            </div>
          </div>

          <div className={s.dSect}>
            <h4>Зогсоол</h4>
            <div className={s.dGrid}>
              <div><span>Ил (ET_IL)</span><b>{nf(r.etIl)}</b></div>
              <div><span>Далд (ET_DALD)</span><b>{nf(r.etDald)}</b></div>
              <div><span>Хангамж (ET_NIIT)</span><b>{nf(r.parkingSupply)}</b></div>
              <div><span>Хэрэгцээ ({parkSrc.short})</span><b>{r.parkingNeed == null ? '—' : nf(r.parkingNeed)}</b></div>
              <div>
                <span>Зөрүү</span>
                <b className={r.parkingGap == null ? undefined : r.parkingGap >= 0 ? s.pos : s.neg}>
                  {r.parkingGap == null ? '—' : `${r.parkingGap >= 0 ? '+' : '−'}${nf(Math.abs(r.parkingGap))}`}
                </b>
              </div>
              <div>
                <span>Хангалт</span>
                <b style={{ color: scoreColor(r.parts.parking?.score) }}>
                  {r.raw.parking == null ? '—' : `${nf(r.raw.parking)}%`}
                </b>
              </div>
            </div>
          </div>

          <div className={s.dSect}>
            <h4>
              Нийгмийн дэд бүтэц
              {r.residentPop > 0 ? '' : <i className={s.muted}> — оршин суугчгүй</i>}
            </h4>
            {!r.social ? <p className={`${s.muted} ${s.xsmall}`}>Өгөгдөл алга</p> : r.social.parts.map((p) => {
              const col = scoreColor(p.cover == null ? null : clamp(p.cover, 0, 100));
              const meta = p.cover == null
                ? 'бүсэд орон сууц байхгүй'
                : `${nf(p.covered)} / ${nf(p.pop)} оршин суугч · ${p.radius} м дотор · ${p.count} байгууламж`;
              return (
                <div key={p.key} className={s.socRow}>
                  <div className={s.socTop}>
                    <span className="nm">{p.label}</span>
                    <span className="d">{p.nearest == null ? '—' : `${nf(p.nearest)} м`}</span>
                    <span className="v" style={{ color: col }}>
                      {p.cover == null ? '—' : `${Math.round(p.cover)}%`}
                    </span>
                  </div>
                  <div className={s.mBar}>
                    <i style={{ width: `${p.cover == null ? 0 : clamp(p.cover, 0, 100)}%`, background: col }} />
                  </div>
                  <div className={s.socMeta}>{meta}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {econModes && r.econ && (
        <div className={s.dSect}>
          <h4>Эдийн засгийн шинжилгээ</h4>
          <div className={s.parkFormula}>
            Дэд бүтэц: {money(perHa)}/га × <b>{nf(r.areaHa, 2)} га</b> = <b>{money(r.econ.infraCost)}</b><br />
            Барилга: <b>{nf(r.gfaSaleM2)} м²</b> × жишиг өртөг = <b>{money(r.econ.buildCost)}</b><br />
            Орлого: борлуулах нэгж үнэ × <b>{nf(r.gfaSaleM2)} м²</b> = <b>{money(r.econ.revenue)}</b>
            <span className={s.muted}> («Одоо байгаа» барилга хасагдсан)</span>
          </div>
          <div className={s.dGrid} style={{ marginTop: 8 }}>
            <div><span>Дэд бүтцийн зардал</span><b>{money(r.econ.infraCost)}</b></div>
            <div><span>Барилгын зардал</span><b>{money(r.econ.buildCost)}</b></div>
            <div><span>Нийт зардал</span><b>{money(r.econ.cost)}</b></div>
            <div><span>Борлуулалтын үнэлгээ</span><b>{money(r.econ.revenue)}</b></div>
            <div>
              <span>{r.econ.profit >= 0 ? 'Ашиг' : 'Алдагдал'}</span>
              <b className={r.econ.profit >= 0 ? s.pos : s.neg}>{money(r.econ.profit)}</b>
            </div>
            <div>
              <span>Ашгийн маржа</span>
              <b style={{ color: scoreColor(profitScore(r.econ.margin)) }}>
                {r.econ.margin == null ? '—'
                  : !Number.isFinite(r.econ.margin) ? 'орлогогүй'
                    : `${nf(r.econ.margin, 1)}%`}
              </b>
            </div>
            <div>
              <span>Эдийн засгийн үнэлгээ</span>
              <b style={{ color: scoreColor(profitScore(r.econ.margin)) }}>{profitLabel(r.econ.margin)}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
