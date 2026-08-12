'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  PARKING_SOURCES, profitScore, profitLabel,
  type Indicator, type ParkingOpt,
} from '@/lib/analysis/config';
import { scoreColor, scoreLabel, normText, passesNorm, clamp, type Part } from '@/lib/analysis/score';
import { Donut } from '@/components/ui';
import type { MapRow } from './SuitMap';
import type { Mode } from './suit/model';
import { nf, money } from './suit/format';
import s from './suitability.module.css';

/**
 * ДИАГРАМЫН АНГИЛАЛТ ӨНГӨ — ТОГТМОЛ дараалал (1-р, 2-р, 3-р байр).
 *
 * ⚠️ БҮДЭГ (ханалт багатай) өнгө — самбар нь тоо уншдаг газар болохоос
 * анхаарал булаах зураг биш. Тод цэнхэр/ягаанаас (2563eb / db2777) зөөллөв.
 *
 * ⚠️ ХАНАЛТ БУУРАХ ТУСАМ өнгө нь саарал руу дөхөж, зэргэлдээ хоёр өнгө
 * ялгагдахаа болино. Тиймээс эдгээр нь «саарал уншигдах» хязгаараас (OKLCH
 * chroma ≥ 0.10) дээгүүр, хоорондоо ялгарах зайтай (ΔE ≥ 15) байхаар
 * сонгогдсон — өнгө сохор (protan/deutan/tritan) хараанд ч, харанхуй (#161d27)
 * ба цайвар (#ffffff) дэвсгэр дээр ч шалгагдсан.
 *
 * ⚠️ Оноолтын шатлалын өнгө (`SCORE_LEVELS`-ийн тод ногоон→шар→улаан)-тэй
 * давхцахгүй: диаграмын зүсмэгийн өнгийг «үнэлгээ» гэж уншиж болохгүй.
 * Жагсаалт өөрчлөгдөхөд өнгө нь ШИЛЖИХГҮЙ — байр нь утга агуулна.
 */
const C1 = '#4f83cc';   // 1-р: гол хэмжигдэхүүн (ил зогсоол · дэд бүтцийн зардал · хүн ам)
const C2 = '#4f9d72';   // 2-р: хоёрдогч (далд зогсоол · барилгын зардал · хэрэгцээ)
const C3 = '#ea580c';   // 3-р: орлого

/** Хувь болгох — 0..100 хооронд хашина */
const pctOf = (v: number, max: number) => (max > 0 ? clamp((v / max) * 100, 0, 100) : 0);

/**
 * ҮЗҮҮЛЭЛТИЙН МӨР — «Хот төлөвлөлтийн үзүүлэлт» хэсгийн мөртэй ИЖИЛ хэлбэр
 * (нэр · утга, доор нь зурвас). Нийтлэг тэнхлэгтэй (`max`) хоёр мөр нь хоёр
 * хэмжигдэхүүнийг харьцуулна.
 */
function IndRow({ label, text, v, max, color }: {
  label: string;
  text: string;
  v: number;
  max: number;
  color: string;
}) {
  return (
    <div className={s.mRow}>
      <div className={s.mTop}>
        <span className="nm">{label}</span>
        <span className="v" style={{ color }}>{text}</span>
      </div>
      <div className={s.mBar}>
        <i style={{ width: `${pctOf(v, max)}%`, background: color }} />
      </div>
    </div>
  );
}

/* ══════════════════ Диаграмын бүрэлдэхүүн ══════════════════ */

/**
 * ААЛЗНЫ (radar) ДИАГРАМ — үзүүлэлтүүдийн онооны ПРОФАЙЛ нэг дүрсээр.
 *
 * ⚠️ Өгөгдөлгүй тэнхлэгийг дүрсээс АЛГАСНА (0 гэж зурвал «маш муу» гэж
 * худал уншигдана) — тэнхлэг нь өөрөө үлдэж, оройн цэг нь зурагдахгүй.
 */
function Radar({ items, center, size = 300 }: {
  items: { key: string; label: string; score: number | null }[];
  center: ReactNode;
  size?: number;
}) {
  const n = items.length;
  const PAD = 56;                    // шошгонд үлдээх зай
  const R = size / 2 - PAD;
  const c = size / 2;
  const at = (i: number, f: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: c + Math.cos(a) * R * f, y: c + Math.sin(a) * R * f, cos: Math.cos(a), sin: Math.sin(a) };
  };
  const ring = (f: number) => items.map((_, i) => { const p = at(i, f); return `${p.x},${p.y}`; }).join(' ');
  const shape = items
    .map((it, i) => (it.score == null ? null : at(i, clamp(it.score, 0, 100) / 100)))
    .filter((p): p is NonNullable<typeof p> => p != null);

  /** Урт шошгыг эхний зайгаар нь хоёр мөр болгоно — тэнхлэгүүд давхацахгүй */
  const wrap = (t: string) => {
    if (t.length <= 9 || !t.includes(' ')) return [t];
    const i = t.indexOf(' ');
    return [t.slice(0, i), t.slice(i + 1)];
  };

  return (
    <svg
      className={s.radar} width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label="Үзүүлэлтүүдийн онооны профайл"
    >
      {/* Тор — 25/50/75/100 онооны олон өнцөгт */}
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} className={s.radarGrid} points={ring(f)} />)}
      {items.map((_, i) => {
        const p = at(i, 1);
        return <line key={i} className={s.radarSpoke} x1={c} y1={c} x2={p.x} y2={p.y} />;
      })}
      {/* Хэмжээсийн заалт — дээш харсан тэнхлэг дээр */}
      <text className={s.radarTick} x={c + 4} y={c - R * 0.5 + 3}>50</text>
      <text className={s.radarTick} x={c + 4} y={c - R + 3}>100</text>

      {/* Бүсийн профайл */}
      {shape.length >= 3 && (
        <polygon className={s.radarArea} points={shape.map((p) => `${p.x},${p.y}`).join(' ')} />
      )}
      {items.map((it, i) => {
        if (it.score == null) return null;
        const p = at(i, clamp(it.score, 0, 100) / 100);
        return (
          <circle
            key={it.key} cx={p.x} cy={p.y} r={3.2}
            fill={scoreColor(it.score)} stroke="var(--panel)" strokeWidth={2}
          >
            <title>{`${it.label}: ${Math.round(it.score)} оноо`}</title>
          </circle>
        );
      })}

      {/* Тэнхлэгийн нэр */}
      {items.map((it, i) => {
        const p = at(i, 1);
        const lx = c + p.cos * (R + 15);
        const ly = c + p.sin * (R + 15);
        const lines = wrap(it.label);
        const anchor = p.cos > 0.3 ? 'start' : p.cos < -0.3 ? 'end' : 'middle';
        const y0 = p.sin < -0.5 ? ly - (lines.length - 1) * 9.5 - 1
          : p.sin > 0.5 ? ly + 8
            : ly - (lines.length - 1) * 4.75 + 3;
        return (
          <text key={it.key} className={s.radarLbl} x={lx} y={y0} textAnchor={anchor}>
            {lines.map((ln, k) => (
              <tspan key={ln} x={lx} dy={k === 0 ? 0 : 9.5}>{ln}</tspan>
            ))}
          </text>
        );
      })}

      {/* Гол — нийлмэл оноо */}
      <text className={s.radarCtr} x={c} y={c + 3} textAnchor="middle">{center}</text>
      <text className={s.radarCtrLbl} x={c} y={c + 15} textAnchor="middle">нийлмэл оноо</text>
    </svg>
  );
}

/** БОСОО БАГАНАН диаграм — 2–3 хэмжигдэхүүнийг НЭГ тэнхлэг дээр харьцуулна */
function Columns({ items, max }: {
  items: { key: string; label: string; v: number; text: string; color: string }[];
  max?: number;
}) {
  const m = max ?? Math.max(...items.map((i) => i.v), 1);
  // ⚠️ Баганы өндөр PX-ээр: хувиар өгвөл дээрх тооны мөр нэмэгдээд хүрээнээс гарна
  const H = 62;
  return (
    <>
      <div className={s.cols}>
        {items.map((it) => (
          <div key={it.key} className={s.colItem}>
            <b className={s.colVal}>{it.text}</b>
            <span
              className={s.colBar}
              style={{ height: `${(pctOf(it.v, m) / 100) * H}px`, background: it.color }}
              title={`${it.label}: ${it.text}`}
            />
          </div>
        ))}
      </div>
      <div className={s.colNames}>
        {items.map((it) => <span key={it.key}>{it.label}</span>)}
      </div>
    </>
  );
}

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
  mode: Mode;
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

  const missing = indicators.filter((i) => i.weight > 0 && r.parts[i.id]?.score == null);

  /* ── Зогсоол ── ил+далд нь нийт дүнтэй таарахгүй бол задаргаа харуулахгүй */
  const supply = r.parkingSupply;
  const splitOk = Math.abs(r.etIl + r.etDald - supply) < 1 && supply > 0;

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

            {/* Онооны профайл — 8 үзүүлэлт нэг дүрсээр */}
            <div className={s.chart}>
              <Radar
                // ⚠️ ЗӨВХӨН оноогддог үзүүлэлт: лавлагаа/жингүй нь оноо авдаггүй
                //    тул тэнхлэг нь ямагт хоосон байж, дүрсийг гуйвуулна.
                items={indicators.filter((i) => !i.ref && i.weight > 0).map((ind) => ({
                  key: ind.id,
                  label: ind.short,
                  score: r.parts[ind.id]?.score ?? null,
                }))}
                center={tot == null ? '—' : Math.round(tot)}
              />
              <div className={s.chCap}>
                Тэнхлэг бүр нэг үзүүлэлтийн <b>0–100 оноо</b>: дүрс гадагшаа тэлэх тусам сайн.
                Дотогшоо хонхойсон тэнхлэг нь тухайн бүсийн сул тал.
                {missing.length > 0 && ` ${missing.length} үзүүлэлт өгөгдөлгүй тул дүрсэд ороогүй.`}
              </div>
            </div>

            {indicators.map((ind) => {
              const p: Part | undefined = r.parts[ind.id];
              const eff = p?.norm ?? ind;
              const pass = passesNorm(p?.value, eff);
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
                  {/* ⚠️ НОРМЫН мөр нь хангасан/зөрчсөнөөс ХАМААРАЛГҮЙ нэг ногоон:
                      энэ нь үнэлгээ биш, ШААРДЛАГА-ыг бичдэг. Хангасан эсэхийг
                      ✓/✗ тэмдэг ба дээрх утгын өнгө (оноо) хэлнэ. */}
                  <div className={s.mNorm}>
                    {/* ⚠️ ЛАВЛАГААНЫ (нормгүй) үзүүлэлтийг дүгнэхгүй */}
                    {ind.ref || ind.weight <= 0 ? (
                      <span>лавлагаа · оноололд ороогүй</span>
                    ) : (
                      <span className={pass == null ? undefined : 'ok'}>
                        {pass == null ? 'өгөгдөлгүй' : pass ? '✓ норм' : '✗ норм'} {normText(eff, nf)}
                      </span>
                    )}
                    {/* ⚠️ `ASSUME_MET`-д багтсан үзүүлэлт (нийгмийн ба инженерийн
                        хүртээмж) нь ТҮР дүгнэсэн утга — ХЭРЭГЛЭГЧИД тэмдэглэхгүй
                        (хэрэглэгчийн шийдвэр, 2026-08-12). Аль нь дүгнэгдсэнийг
                        `lib/analysis/config.ts` → `ASSUME_MET`-ээс үз. */}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={s.dSect}>
            <h4>Суурь үзүүлэлт</h4>

            {(r.residentPop > 0 || r.capacityPop > 0) && (() => {
              const max = Math.max(r.residentPop, r.capacityPop);
              return (
                <>
                  <IndRow label="Оршин суугч" text={nf(r.residentPop)} v={r.residentPop} max={max} color={C1} />
                  <IndRow
                    label="Үйлчилгээний хүчин чадал" text={nf(r.capacityPop)}
                    v={r.capacityPop} max={max} color={C1}
                  />
                </>
              );
            })()}

            <div className={s.dGrid}>
              <div><span>Өрхийн тоо</span><b>{nf(r.households)}</b></div>
              <div><span>Барилгын тоо</span><b>{nf(r.buildingCount)}</b></div>
              <div><span>Барилгын нийт талбай</span><b>{nf(r.gfaM2)} м²</b></div>
              <div><span>Ногоон байгууламж</span><b>{nf(r.greenM2)} м²</b></div>
            </div>
          </div>

          <div className={s.dSect}>
            <h4>Зогсоол</h4>

            {/* ⚠️ «Хэрэгцээ» бол НОРМ тул нормын ногооноор. Зурвасын тэнхлэг нь
                байгаа зогсоолтой НИЙТЛЭГ — байгаа тоо нь доорх цагирагийн голд
                (тусдаа мөрөөр давхардуулахгүй). */}
            {/* Байгаа зогсоолын БҮТЭЦ — эхлээд «хэдэн зогсоол байна» */}
            {splitOk && (r.etIl > 0 || r.etDald > 0) && (
              <div className={`${s.chart} ${s.donutSide}`}>
                <Donut
                  size={88}
                  width={15}
                  items={[
                    { key: 'il', label: 'Ил зогсоол', value: r.etIl, color: C1, display: nf(r.etIl) },
                    { key: 'dald', label: 'Далд зогсоол', value: r.etDald, color: C2, display: nf(r.etDald) },
                  ]}
                  center={nf(supply)}
                />
              </div>
            )}

            {/* Дараа нь «хэр их хэрэгтэй вэ» — тэнхлэг нь байгаа зогсоолтой нийтлэг.
                ⚠️ Хэрэгцээ бол ШААРДЛАГА тул ногооноор (C2). */}
            <div className={s.chart}>
              <IndRow
                label={`Хэрэгцээ (${parkSrc.short})`}
                text={r.parkingNeed == null ? '—' : nf(r.parkingNeed)}
                v={r.parkingNeed ?? 0} max={Math.max(supply, r.parkingNeed ?? 0)} color={C2}
              />
              <div className={s.chCap}>
                Хангалт <b style={{ color: scoreColor(r.parts.parking?.score) }}>
                  {r.raw.parking == null ? '—' : `${nf(r.raw.parking)}%`}
                </b> ·{' '}
                {r.parkingGap == null ? '—' : (
                  <>
                    {r.parkingGap >= 0 ? 'илүүдэл' : 'дутагдал'}{' '}
                    <b className={r.parkingGap >= 0 ? s.pos : s.neg}>{nf(Math.abs(r.parkingGap))}</b> зогсоол
                  </>
                )}
              </div>
            </div>
          </div>

        </>
      )}

      {econModes && r.econ && (() => {
        const econ = r.econ;
        return (
          <div className={s.dSect}>
            <h4>Эдийн засгийн шинжилгээ</h4>

            {/* Зардал ба орлого — нэг тэнхлэг дээр, зөрүү нь ашиг */}
            <div className={s.chart}>
              <Columns
                items={[
                  { key: 'cost', label: 'Нийт зардал', v: econ.cost, text: money(econ.cost), color: C1 },
                  { key: 'rev', label: 'Борлуулалтын үнэлгээ', v: econ.revenue, text: money(econ.revenue), color: C3 },
                ]}
              />
              <div className={s.chCap}>
                Хоёр багана <b>нэг тэнхлэгтэй</b> — өндрийн зөрүү нь{' '}
                {econ.profit >= 0 ? 'ашиг' : 'алдагдал'}:{' '}
                <b className={econ.profit >= 0 ? s.pos : s.neg}>{money(econ.profit)}</b>
              </div>
            </div>

            {/* Зардлын БҮТЭЦ */}
            {econ.cost > 0 && (
              <div className={`${s.chart} ${s.donutSide}`}>
                <Donut
                  size={88}
                  width={15}
                  items={[
                    { key: 'infra', label: 'Дэд бүтэц', value: econ.infraCost, color: C1, display: money(econ.infraCost) },
                    { key: 'build', label: 'Барилга', value: econ.buildCost, color: C2, display: money(econ.buildCost) },
                  ]}
                  center={<span style={{ fontSize: 11 }}>{money(econ.cost)}</span>}
                  centerLabel="нийт зардал"
                />
              </div>
            )}

            <div className={s.dGrid}>
              <div>
                <span>Ашгийн маржа</span>
                <b style={{ color: scoreColor(profitScore(econ.margin)) }}>
                  {econ.margin == null ? '—'
                    : !Number.isFinite(econ.margin) ? 'орлогогүй'
                      : `${nf(econ.margin, 1)}%`}
                </b>
              </div>
              <div>
                <span>Эдийн засгийн үнэлгээ</span>
                <b style={{ color: scoreColor(profitScore(econ.margin)) }}>{profitLabel(econ.margin)}</b>
              </div>
            </div>

            <div className={s.parkFormula}>
              Дэд бүтэц: {money(perHa)}/га × <b>{nf(r.areaHa, 2)} га</b> = <b>{money(econ.infraCost)}</b><br />
              Барилга: <b>{nf(r.gfaSaleM2)} м²</b> × жишиг өртөг = <b>{money(econ.buildCost)}</b><br />
              Орлого: борлуулах нэгж үнэ × <b>{nf(r.gfaSaleM2)} м²</b> = <b>{money(econ.revenue)}</b>
              <span className={s.muted}> («Одоо байгаа» барилга хасагдсан)</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
