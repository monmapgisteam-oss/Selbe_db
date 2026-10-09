'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  PARKING_SOURCES,
  type Indicator, type ParkingOpt,
} from '@/lib/analysis/config';
import { scoreTone, scoreInk, scoreLabel, normText, passesNorm, clamp, type Part } from '@/lib/analysis/score';
import { Bars, Donut, useTip } from '@/components/ui';
import { cat, NO_DATA } from '@/lib/format';
import { CHART } from '@/lib/chartStyle';
import type { MapRow } from './SuitMap';
import type { Mode } from './suit/model';
import { nf } from './suit/format';
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
/* ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): hex (#4f83cc / #4f9d72) → зэрэглэлийн
   слот `cat(0)`/`cat(1)` — dark горимд дагана. Байрны утга (1-р, 2-р) хэвээр. */
const C1 = cat(0);   // 1-р: гол хэмжигдэхүүн (ил зогсоол · дэд бүтцийн зардал · хүн ам)
const C2 = cat(1);   // 2-р: хоёрдогч (далд зогсоол · барилгын зардал · хэрэгцээ)

/**
 * Үзүүлэлт харьцуулах БОСГОТОЙ юу.
 * ⚠️ `normText`-ийг босгогүй үзүүлэлт дээр дуудвал «0 – 0 хүн/га» гэсэн утгагүй
 * мөр бичнэ — лавлагааны мөрөнд босго байгаа эсэхийг эхлээд шалгана.
 */
const hasNorm = (ind: Indicator) =>
  ind.mode === 'higher' ? ind.target != null
    : ind.mode === 'lower' ? ind.best != null
      : ind.optMin != null && ind.optMax != null;

/**
 * ҮЗҮҮЛЭЛТИЙН МӨР — «Хот төлөвлөлтийн үзүүлэлт» хэсгийн мөртэй ИЖИЛ хэлбэр
 * (нэр · утга, доор нь зурвас). Нийтлэг тэнхлэгтэй (`max`) хоёр мөр нь хоёр
 * хэмжигдэхүүнийг харьцуулна.
 */
/* ⚠️ 2026-10-09: `v = null` — мэдээлэлгүй: зурвас ЗУРАГДАХГҮЙ (0 урттай «тэг» биш, null ≠ 0)
   ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): гар хийцийн 5px зурвас → порталын
   `Bars` (2px зам, утга `--ink-2`, hover `useTip`). Утгын бичиг цувааны өнгөөр БИШ — бэхээр. */
function IndRow({ label, text, v, max, color }: {
  label: string;
  text: string;
  v: number | null;
  max: number;
  color: string;
}) {
  return (
    <div className={s.mRow}>
      <Bars items={[{ key: label, label, value: v, display: text }]} max={max > 0 ? max : undefined} color={color} />
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
  const tip = useTip();
  const n = items.length;
  const PAD = 56;                    // шошгонд үлдээх зай
  const R = size / 2 - PAD;
  const c = size / 2;
  const at = (i: number, f: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: c + Math.cos(a) * R * f, y: c + Math.sin(a) * R * f, cos: Math.cos(a), sin: Math.sin(a) };
  };
  const ring = (f: number) => items.map((_, i) => { const p = at(i, f); return `${p.x},${p.y}`; }).join(' ');
  const pts = items.map((it, i) => (it.score == null ? null : at(i, clamp(it.score, 0, 100) / 100)));
  /**
   * ⚠️ 2026-10-09 (null ≠ 0, цоорхой үлдээнэ): урьд нь өгөгдөлгүй тэнхлэгийг АЛГАСААД
   *    үлдсэн оройнуудыг НЭГ олон өнцөгтөөр холбодог байв — хоёр хөрш бус тэнхлэгийн
   *    хооронд ГҮҮР татагдаж, алга болсон тэнхлэг дээр «дунд зэрэг» оноо байгаа мэт
   *    уншигддаг. Одоо: бүх тэнхлэг хэмжигдсэн үед л дүүргэсэн олон өнцөгт; эс бөгөөс
   *    ЗӨВХӨН хоёр талдаа хэмжигдсэн ХӨРШ тэнхлэгийн ирмэг (дүүргэлтгүй).
   */
  const full = n >= 3 && pts.every((p) => p != null);
  const edges = full || n < 2 ? [] : pts.flatMap((p, i) => {
    const q = pts[(i + 1) % n];
    return p && q && (n > 2 || i === 0) ? [{ k: i, p, q }] : [];
  });

  /** Урт шошгыг эхний зайгаар нь хоёр мөр болгоно — тэнхлэгүүд давхацахгүй */
  const wrap = (t: string) => {
    if (t.length <= 9 || !t.includes(' ')) return [t];
    const i = t.indexOf(' ');
    return [t.slice(0, i), t.slice(i + 1)];
  };

  return (
    <>
    <svg
      className={s.radar} width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label={tr('Үзүүлэлтүүдийн онооны профайл')}
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
      {full && (
        <polygon className={s.radarArea} points={pts.map((p) => `${p!.x},${p!.y}`).join(' ')} />
      )}
      {edges.map((e) => (
        <line key={e.k} className={s.radarEdge} x1={e.p.x} y1={e.p.y} x2={e.q.x} y2={e.q.y} />
      ))}
      {items.map((it, i) => {
        if (it.score == null) return null;
        const p = at(i, clamp(it.score, 0, 100) / 100);
        // ⚠️ Хүрээ нь `style`-аар. Урьд нь `stroke="var(--panel)"` байв — хоёр
        //    алдаатай: (1) `--panel` бол ӨРГӨН (360px), өнгө биш; (2) SVG-ийн
        //    presentation ШИНЖ дотор `var()` задардаггүй. Тиймээс цэгийг олон
        //    өнцөгтөөс тусгаарлах гэрэлт хүрээ огт зурагддаггүй байлаа.
        /* ⚠️ 2026-10-09: цэг нь `CHART` (r=3 + 2px гадаргуун цагираг), өнгө токен
           (`scoreTone`, dark-тай), `<title>`-ийн оронд порталын `useTip`. */
        const c0 = scoreTone(it.score);
        return (
          <circle
            key={it.key} cx={p.x} cy={p.y} r={CHART.markerR}
            style={{ fill: c0, stroke: 'var(--surface)', strokeWidth: CHART.ring }}
            {...tip.bind({ label: it.label, value: String(Math.round(it.score)), color: c0, hint: scoreLabel(it.score) })}
          />
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
      <text className={s.radarCtrLbl} x={c} y={c + 15} textAnchor="middle">{tr('нийлмэл оноо')}</text>
    </svg>
    {tip.node}
    </>
  );
}

/* ⚠️ 2026-08-24: `Columns` (босоо баганан диаграм) УСТГАВ — зөвхөн эдийн засгийн
   зардал/орлогын харьцуулалтад хэрэглэгддэг байсан. */

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
  onClose,
}: {
  r: MapRow & { parts: Record<string, Part> };
  indicators: Indicator[];
  mode: Mode;
  activeIndicator: string;
  parking: ParkingOpt;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** Хаагаад дахин нээхэд буланд буцаах — нээгдэх агшинд л байрлалыг тэглэнэ */
  useEffect(() => {
    /* ⚠️ 2026-09-25: inline `left: 14px` ХАСАВ — CSS-ийн `.detail { left: 200px }`
       (2026-08-23-ны ⚠️: хэрэгслийн зурвасыг дарахгүй) шийдвэрийг дарж, карт
       MapTools-ийг бүрэн бүрхдэг байв. Inline утгыг цэвэрлэж CSS-ийн байрлалд
       буцаана (чирсэн байрлал нь inline-аар тавигддаг). */
    if (box.current) { box.current.style.left = ''; box.current.style.top = ''; }
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
  const urbanModes = mode === 'urban' || mode === 'indicator';

  const missing = indicators.filter((i) => i.weight > 0 && r.parts[i.id]?.score == null);

  /* ── Зогсоол ── ил+далд нь нийт дүнтэй таарахгүй бол задаргаа харуулахгүй */
  const supply = r.parkingSupply;
  const splitOk = Math.abs(r.etIl + r.etDald - supply) < 1 && supply > 0;

  /**
   * ── ГАЗРЫН АШИГЛАЛТ ── бүсийн талбай юугаар бүрдэж байна вэ.
   *
   * ⚠️ Барилгын хувьд ХӨЛ талбай (`builtM2`, полигоны бодит талбай) — «Барилгын
   * нийт талбай» (`gfaM2`) нь давхраар үржсэн ШАЛНЫ талбай тул газартай
   * харьцуулбал 100%-иас давна.
   *
   * ⚠️ Ногоон ба барилга ДАВХЦАЖ болно (ногоон полигон барилгын дээгүүр
   * зурагдсан тохиолдол). Тэгвэл «бусад» сөрөг болох тул 0-ээр хашина —
   * зүсмэгүүд ойролцоо утга гэдгийг тайлбарт хэлнэ.
   */
  const landM2 = r.polyHa * 10_000;
  const builtM2 = Math.min(r.builtM2, landM2);
  const greenM2 = Math.min(r.greenM2, Math.max(0, landM2 - builtM2));
  const otherM2 = Math.max(0, landM2 - builtM2 - greenM2);
  const landPct = (v: number) => (landM2 > 0 ? `${nf((v / landM2) * 100, 1)}%` : '—');

  return (
    <div ref={box} className={s.detail}>
      <div className={s.dHead} onPointerDown={startDrag}>
        {/* ⚠️ `.gauge` нь `:global` — `.dHead .gauge` гэсэн үр удмын сонгогч тул */}
        <div className="gauge" style={{ background: scoreTone(tot), color: scoreInk(tot) }}>
          {tot == null ? '—' : Math.round(tot)}
        </div>
        <div>
          <h3>{r.id}</h3>
          <p>{r.type} · {nf(r.areaHa, 2)} {tr('га ·')} {scoreLabel(tot)}</p>
        </div>
        <button type="button" className={s.dClose} title={tr('Хаах')} onClick={onClose}>×</button>
      </div>

      {urbanModes && (
        <>
          {/* ⚠️ ТУСДАА хэсэг, «Хот төлөвлөлтийн үзүүлэлт»-ийн ДЭЭР: газрын
              ашиглалт нь оноололд ордог үзүүлэлт БИШ, бүсийн бүтцийн зураг. */}
          {landM2 > 0 && (
            <div className={s.dSect}>
              <h4>{tr('Үндсэн үзүүлэлт')}</h4>
              <div className={`${s.chart} ${s.donutSide}`}>
                <Donut
                  size="sm"
                  items={[
                    { key: 'bld', label: tr('Барилга'), value: builtM2, color: C1, display: landPct(builtM2) },
                    { key: 'grn', label: tr('Ногоон байгууламж'), value: greenM2, color: C2, display: landPct(greenM2) },
                    { key: 'oth', label: tr('Бусад'), value: otherM2, color: NO_DATA, display: landPct(otherM2) },
                  ]}
                  center={<span style={{ fontSize: 12 }}>{nf(r.polyHa, 1)} {tr('га')}</span>}
                />
              </div>
            </div>
          )}

          <div className={s.dSect}>
            <h4>{tr('Хот төлөвлөлтийн үзүүлэлт')}</h4>

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
                {tr('Тэнхлэг бүр нэг үзүүлэлтийн')} <b>{tr('0–100 оноо')}</b>{tr(': дүрс гадагшаа тэлэх тусам сайн. Дотогшоо хонхойсон тэнхлэг нь тухайн бүсийн сул тал.')}
                {missing.length > 0 && tr(' {0} үзүүлэлт өгөгдөлгүй тул дүрсэд ороогүй.', missing.length)}
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
                    <span className="v" style={{ color: scoreTone(p?.score) }}>
                      {p?.value == null ? '—' : `${nf(p.value, ind.decimals)}${ind.unit ? ` ${ind.unit}` : ''}`}
                    </span>
                    <span className="w">{((ind.weight / totalW) * 100).toFixed(0)}%</span>
                  </div>
                  {/* ⚠️ НОРМЫН мөр нь хангасан/зөрчсөнөөс ХАМААРАЛГҮЙ нэг ногоон:
                      энэ нь үнэлгээ биш, ШААРДЛАГА-ыг бичдэг. Хангасан эсэхийг
                      ✓/✗ тэмдэг ба дээрх утгын өнгө (оноо) хэлнэ. */}
                  <div className={s.mNorm}>
                    {/* ⚠️ ЛАВЛАГААНЫ үзүүлэлтийг ✓/✗-ээр ДҮГНЭХГҮЙ — БНБД-д
                        норм заагаагүй. Харьцуулах босго байвал зөвхөн ҮЗҮҮЛНЭ
                        (жиш. «лавлагаа · ≥ 30 %»), дүгнэлт өгөхгүй. */}
                    {ind.ref || ind.weight <= 0 ? (
                      <span>{tr('лавлагаа')}{hasNorm(eff) ? ` · ${normText(eff, nf)}` : tr(' · оноололд ороогүй')}</span>
                    ) : (
                      <span className={pass == null ? undefined : 'ok'}>
                        {pass == null ? tr('өгөгдөлгүй') : pass ? tr('✓ норм') : tr('✗ норм')} {normText(eff, nf)}
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
            <h4>{tr('Суурь үзүүлэлт')}</h4>

            {(r.residentPop > 0 || r.capacityPop > 0) && (() => {
              const max = Math.max(r.residentPop, r.capacityPop);
              return (
                <>
                  <IndRow label={tr('Оршин суугч')} text={nf(r.residentPop)} v={r.residentPop} max={max} color={C1} />
                  <IndRow
                    label={tr('Үйлчилгээний хүчин чадал')} text={nf(r.capacityPop)}
                    v={r.capacityPop} max={max} color={C1}
                  />
                </>
              );
            })()}

            <div className={s.dGrid}>
              <div><span>{tr('Өрхийн тоо')}</span><b>{nf(r.households)}</b></div>
              <div><span>{tr('Барилгын тоо')}</span><b>{nf(r.buildingCount)}</b></div>
              <div><span>{tr('Барилгын нийт талбай')}</span><b>{nf(r.gfaM2)} {tr('м²')}</b></div>
              <div><span>{tr('Ногоон байгууламж')}</span><b>{nf(r.greenM2)} {tr('м²')}</b></div>
            </div>
          </div>

          <div className={s.dSect}>
            <h4>{tr('Зогсоол')}</h4>

            {/* ⚠️ «Хэрэгцээ» бол НОРМ тул нормын ногооноор. Зурвасын тэнхлэг нь
                байгаа зогсоолтой НИЙТЛЭГ — байгаа тоо нь доорх цагирагийн голд
                (тусдаа мөрөөр давхардуулахгүй). */}
            {/* Байгаа зогсоолын БҮТЭЦ — эхлээд «хэдэн зогсоол байна» */}
            {splitOk && (r.etIl > 0 || r.etDald > 0) && (
              <div className={`${s.chart} ${s.donutSide}`}>
                <Donut
                  size="sm"
                  items={[
                    { key: 'il', label: tr('Ил зогсоол'), value: r.etIl, color: C1, display: nf(r.etIl) },
                    { key: 'dald', label: tr('Далд зогсоол'), value: r.etDald, color: C2, display: nf(r.etDald) },
                  ]}
                  center={nf(supply)}
                />
              </div>
            )}

            {/* Дараа нь «хэр их хэрэгтэй вэ» — тэнхлэг нь байгаа зогсоолтой нийтлэг.
                ⚠️ Хэрэгцээ бол ШААРДЛАГА тул ногооноор (C2). */}
            <div className={s.chart}>
              <IndRow
                label={tr('Хэрэгцээ ({0})', parkSrc.short)}
                text={r.parkingNeed == null ? '—' : nf(r.parkingNeed)}
                v={r.parkingNeed} max={r.parkingNeed == null ? supply : Math.max(supply, r.parkingNeed)} color={C2}
              />
              <div className={s.chCap}>
                {tr('Хангалт')} <b style={{ color: scoreTone(r.parts.parking?.score) }}>
                  {r.raw.parking == null ? '—' : `${nf(r.raw.parking)}%`}
                </b> ·{' '}
                {r.parkingGap == null ? '—' : (
                  <>
                    {r.parkingGap >= 0 ? tr('илүүдэл') : tr('дутагдал')}{' '}
                    <b className={r.parkingGap >= 0 ? s.pos : s.neg}>{nf(Math.abs(r.parkingGap))}</b> {tr('зогсоол')}
                  </>
                )}
              </div>
            </div>
          </div>

        </>
      )}

      {/* ⚠️ 2026-08-24: «Эдийн засгийн шинжилгээ» хэсэг УСТГАГДАВ — зардал,
          орлого, ашиг, ашгийн маржин бүгд ЗОХИОМОЛ `negj_une` өгөгдлөөс
          гардаг байсан. Эзэмшигчийн шийдвэрээр эдийн засгийн загвар бүрмөсөн
          хасагдсан (`analysis/costs.ts`, `Economics.tsx` мөн устсан). */}
    </div>
  );
}
