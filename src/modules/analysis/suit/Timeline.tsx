'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { CHART, lineSegments, areaPath } from '@/lib/chartStyle';
import { cat } from '@/lib/format';
import { DIURNAL, diurnalAt, clockText, wrapMin } from './traffic';
import c from './simulation.module.css';

/**
 * СИМ ЦАГ — 24 цагийн трафик timeline-ийн ЦӨМ.
 *
 * ⚠️ Хоёр цаг зэрэгцэнэ: `minuteRef` нь ФРЕЙМ БҮРТ шинэчлэгддэг ЭРХ БҮХИЙ цаг
 * (газрын зургийн анимац rAF дотор үүнийг уншина — дахин зурагдалт үүсгэхгүй),
 * харин `minute` нь UI-д ~10 удаа/сек шинэчлэгддэг ХӨӨРӨГДСӨН төлөв. Тэгвэл цаг
 * жигд урсаж, гэхдээ React-ийн дахин зуралт бага байна.
 */
// ⚠️ 00:00-оос эхэлнэ: өдрийн мөчлөг цөөн машинтай шөнөөс эхэлж, өглөөний
//    оргил руу ЖАМААРАА өсдөг. 08:00-оос эхлүүлбэл симуляц шууд оргил ачааллын
//    дундаас «үсэрч» эхэлдэг байв.
export function useSimClock(startMin = 0) {
  const [minute, setMinute] = useState(startMin);
  const [playing, setPlaying] = useState(false);
  /** Хурд — бодит 1 секундэд хэдэн сим-минут явах вэ (×5 / ×20 / ×60) */
  const [speed, setSpeed] = useState(20);
  const minuteRef = useRef(startMin);
  const raf = useRef(0);
  const lastT = useRef(0);
  const lastPaint = useRef(0);

  /** Гар аргаар цаг тааруулах (гулсуур) — ref ба төлөв хоёуланг зэрэг. */
  const seek = useCallback((m: number) => {
    minuteRef.current = wrapMin(m);
    setMinute(minuteRef.current);
  }, []);

  useEffect(() => {
    if (!playing) return;
    lastT.current = 0;
    const tick = (ts: number) => {
      if (!lastT.current) lastT.current = ts;
      const dtSec = (ts - lastT.current) / 1000;
      lastT.current = ts;
      minuteRef.current = wrapMin(minuteRef.current + dtSec * speed);
      // UI-г ~10 удаа/сек л шинэчилнэ (жигд харагдана, зуралт бага)
      if (ts - lastPaint.current > 95) {
        lastPaint.current = ts;
        setMinute(minuteRef.current);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed]);

  /**
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ХӨТЧИЙН ТАБ далд болоход ЗОГСООНО.
   *    Хөтөч далд табын rAF-ийг зогсоодог ч буцаж ирэхэд эхний фреймийн `dt` нь
   *    хэдэн минут болж, цаг гэнэт хэдэн цагаар «үсэрдэг» байв (×60 хурдад 1 мин
   *    = 1 сим-цаг). Хэрэглэгч буцаад ▶ дарж үргэлжлүүлнэ. Харагдац доторх
   *    горим/таб солих үеийн зогсолт нь `Suitability.tsx` §roadMode-д.
   */
  useEffect(() => {
    if (!playing || typeof document === 'undefined') return;
    const onVis = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing]);

  return { minute, minuteRef, playing, setPlaying, speed, setSpeed, seek };
}

const SPEEDS = [5, 20, 60] as const;

/**
 * ОРГИЛ ЦАГИЙН ТОВЧ — өглөө 08:00, орой 18:00 (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ Гулсуураар яг оргилд тааруулах хэцүү байв; харьцуулалт (Бодит ↔ Төлөвлөгөө)
 *    ихэвчлэн оргил цагт хийгддэг. `DIURNAL`-ийн өглөө/оройн оргилтой таарна.
 */
const PEAKS = [
  { min: 8 * 60, get title() { return tr('Өглөөний оргил руу шилжих'); } },
  { min: 18 * 60, get title() { return tr('Оройн оргил руу шилжих'); } },
] as const;

/** Цагийн шошго — муруйн доор 00 · 06 · 12 · 18 */
const HOUR_TICKS = [0, 6, 12, 18];

/**
 * ЦАГИЙН КОНСОЛ — цаг, өдрийн эрэлтийн муруй, гулсуур, ▶/⏸ ба хурд.
 *
 * ⚠️ Өөрийн хүрээтэй, живсэн фонтой БЛОК болгосон нь санаатай: энэ бол панелийн
 * цорын ганц ХӨДӨЛГӨӨНТ удирдлага тул статик уншилтуудаас тод ялгарах ёстой.
 * `useSimClock`-ийн гаралтыг шууд авна.
 */
export function Timeline({
  minute,
  playing,
  setPlaying,
  speed,
  setSpeed,
  seek,
  hue = cat(5),
}: {
  minute: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  seek: (m: number) => void;
  /** Симуляцын акцент өнгө (`SimDef.hue`) — CSS токен; SVG-д ЗӨВХӨН `style`-аар */
  hue?: string;
}) {
  const load = diurnalAt(minute);
  // ⚠️ Градиентийн id баримт даяар НЭГДМЭЛ байх ёстой (ui.Series-ийн дүрэм)
  const gid = `simCurve${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const W = 244;
  const H = 40;
  /* ── Эрэлтийн муруй — ГӨЛГӨР ──
     ⚠️ Урьд нь цэгүүдийг шулуунаар холбосон polyline байсан тул муруй өнцөг
     өнцгөөрөө хуга харагдаж байв.
     ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): өөрийн Catmull-Rom хуулбарыг
     порталын ГАНЦ `lineSegments` (монотон, `chartStyle.ts`) орлов — Catmull-Rom нь
     цэг хооронд ХЭТЭРДЭГ (overshoot) тул шөнийн 0-д ойр утгууд 0-ээс доош «унаж»
     зурагддаг байв. Монотон муруй ЦЭГ БҮРЭЭ ЯГ ДАЙРНА, хөршийн мужаас гарахгүй.
     Талбай нь шугамын ЯГ ижил замаар хаагдана (`areaPath`). */
  const pts = [...DIURNAL, DIURNAL[0]].map((v, i) => ({
    x: (i / 24) * W,
    y: H - v * (H - 4) - 2,
  }));
  const seg = lineSegments(pts)[0];
  const path = seg?.d ?? '';
  const area = seg ? areaPath(seg, H) : '';
  const markX = (wrapMin(minute) / 1440) * W;
  const markY = H - load * (H - 4) - 2;

  return (
    <div className={c.console}>
      <div className={c.clockRow}>
        <span className={c.clock}>{clockText(minute)}</span>
        <span className={c.demand}>{tr('эрэлт')} {Math.round(load * 100)}%</span>
      </div>

      {/* Өдрийн эрэлтийн муруй + одоогийн байрлал */}
      <svg
        className={c.curve}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={tr('Өдрийн эрэлтийн муруй, одоо {0}, эрэлт {1}%', clockText(minute), Math.round(load * 100))}
      >
        {/* ⚠️ `vectorEffect` ЗААВАЛ: `preserveAspectRatio="none"` нь зургийг
            хэвтээ тийш сунгадаг тул түүнгүйгээр зураасны өргөн гажина. */}
        {/* ⚠️ 2026-10-09: өнгө БҮГД `style`-аар — SVG шинж (`stroke=`) дотор var() задрахгүй
            (`format.ts`-ийн дүрэм). `var(--text)` гэсэн токен БАЙХГҮЙ байсан → `--ink-3`. */}
        {HOUR_TICKS.map((h) => (
          <line
            key={h}
            x1={(h / 24) * W} y1="0" x2={(h / 24) * W} y2={H}
            style={{ stroke: 'var(--line)', strokeWidth: 1 }} vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Ганц цуваа — градиент `CHART.areaTop` → `areaBottom` (порталын нэг дүрэм) */}
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: hue, stopOpacity: CHART.areaTop }} />
            <stop offset="1" style={{ stopColor: hue, stopOpacity: CHART.areaBottom }} />
          </linearGradient>
        </defs>
        <path d={area} style={{ fill: `url(#${gid})` }} />
        <path
          d={path}
          style={{ fill: 'none', stroke: hue, strokeWidth: CHART.stroke, strokeLinejoin: 'round' }}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={markX} y1="0" x2={markX} y2={H}
          style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }} vectorEffect="non-scaling-stroke"
        />
        {/* ⚠️ Цэгийг `<circle>` БИШ тэг урттай зураасаар (round cap + non-scaling-stroke):
            `preserveAspectRatio="none"` нь тойргийг ЗУУВАН болгож сунгадаг байв. Гадна нь
            гадаргуун цагираг (`CHART.ring`), дотор нь цэг (`CHART.markerR`). */}
        <path
          d={`M${markX},${markY} h0`}
          style={{ stroke: 'var(--sunken)', strokeWidth: (CHART.markerR + CHART.ring) * 2, strokeLinecap: 'round' }}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${markX},${markY} h0`}
          style={{ stroke: hue, strokeWidth: CHART.markerR * 2, strokeLinecap: 'round' }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Цаг товшуур (гулсуур) */}
      <input
        className={c.scrub}
        type="range"
        min={0}
        max={1439}
        step={1}
        value={Math.round(wrapMin(minute))}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={tr('Цаг')}
      />

      {/* ▶/⏸ + хурд */}
      <div className={c.ctrl}>
        <button
          type="button"
          className={c.play}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? tr('⏸ Зогсоох') : tr('▶ Тоглуулах')}
        </button>
        <div className={c.segSm} role="group" aria-label={tr('Оргил цаг')}>
          {PEAKS.map((p) => (
            <button
              key={p.min}
              type="button"
              aria-pressed={Math.round(wrapMin(minute)) === p.min}
              className={Math.round(wrapMin(minute)) === p.min ? c.segSmOn : undefined}
              onClick={() => seek(p.min)}
              title={p.title}
            >
              {clockText(p.min)}
            </button>
          ))}
        </div>
        <div className={c.segSm} role="group" aria-label={tr('Хурд')}>
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              aria-pressed={speed === sp}
              className={speed === sp ? c.segSmOn : undefined}
              onClick={() => setSpeed(sp)}
              title={tr('Бодит 1 секундэд {0} сим-минут', sp)}
            >
              ×{sp}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
