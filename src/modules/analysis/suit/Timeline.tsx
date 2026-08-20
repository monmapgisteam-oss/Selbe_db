'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
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

  return { minute, minuteRef, playing, setPlaying, speed, setSpeed, seek };
}

const SPEEDS = [5, 20, 60] as const;

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
  hue = '#f59e0b',
}: {
  minute: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  seek: (m: number) => void;
  /** Симуляцын акцент өнгө (`SimDef.hue`) */
  hue?: string;
}) {
  const load = diurnalAt(minute);
  const W = 244;
  const H = 40;
  /* ── Эрэлтийн муруй — ГӨЛГӨР (Catmull-Rom сплайн → кубик Безье) ──
     ⚠️ Урьд нь цэгүүдийг шулуунаар холбосон polyline байсан тул муруй өнцөг
     өнцгөөрөө хуга харагдаж байв. Catmull-Rom нь ЦЭГ БҮРЭЭ ЯГ ДАЙРДАГ тул
     эрэлтийн утга өөрчлөгдөхгүй, зөвхөн хооронд нь гөлгөр татна. Захын цэгт
     тойргоор (24 цаг эргэдэг) хөршөө авна — 00:00 дээр залгаас гөлгөр. */
  const pts = [...DIURNAL, DIURNAL[0]].map((v, i): [number, number] => [
    (i / 24) * W,
    H - v * (H - 4) - 2,
  ]);
  const at = (i: number): [number, number] => {
    // Тойрог хөрш: эхлэлээс өмнөх = 23 цаг, төгсгөлийн дараах = 01 цаг (x-г гулсуулна)
    if (i < 0) return [pts[0][0] - (W / 24), H - DIURNAL[23] * (H - 4) - 2];
    if (i >= pts.length) return [pts[pts.length - 1][0] + (W / 24), H - DIURNAL[1] * (H - 4) - 2];
    return pts[i];
  };
  let path = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // Catmull-Rom → Безьегийн жолоодлогын цэгүүд (τ = 1/6)
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  // Муруйн доорх дүүргэлт — ижил замыг доод ирмэгээр хаана
  const area = `${path} L ${W},${H} L 0,${H} Z`;
  const markX = (wrapMin(minute) / 1440) * W;

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
        {HOUR_TICKS.map((h) => (
          <line
            key={h}
            x1={(h / 24) * W} y1="0" x2={(h / 24) * W} y2={H}
            stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={hue} opacity="0.14" />
        <path
          d={path}
          fill="none" stroke={hue} strokeWidth="1.6"
          strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
        <line
          x1={markX} y1="0" x2={markX} y2={H}
          stroke="var(--text)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
        />
        <circle cx={markX} cy={H - load * (H - 4) - 2} r="3.2" fill={hue} stroke="var(--sunken)" strokeWidth="1.2" />
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
