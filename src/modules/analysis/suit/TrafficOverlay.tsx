'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';

import {
  diurnalAt, stepCars, spawnTable, spawnCar, targetCars, carPose,
  CAR_LEN, V_MAX, type Car, type Network,
} from './traffic';
import { simColor } from './simulation';

/** Симуляцаас UI рүү буцах хураангуй — «Ачаалал» панелийн үзүүлэлт. */
export type TrafficStats = {
  /** Идэвхтэй машины тоо */
  cars: number;
  /** Дундаж хурд (км/ц) */
  kmh: number;
  /** Чөлөөт урсгалын хэдэн хувиар явж байгаа (0..1) — 1 = түгжрэлгүй */
  flow: number;
};

/**
 * ГҮЙЦЭТГЭЛИЙН ТАГ — эрэлтийн загвар үүнээс их машин шаардвал таслана.
 * ⚠️ Хэмжилт (бодит сүлжээ, 3,957 ирмэг): 1,200 машин = 0.11 мс/фрейм тул энэ
 * хязгаар нь гүйцэтгэлээс биш, ЗУРАЛТЫН уншигдах байдлаас гарсан.
 */
const CAR_CAP = 1600;

/** Нэг фреймд зөвшөөрөх ДЭЭД алхам (сек) — таб идэвхгүй байгаад буцахад «үсрэхээс» хамгаална. */
const MAX_DT = 0.12;

/**
 * Timeline-ийн ×5/×20/×60 хурдыг машины хөдөлгөөнд ЗӨӨЛӨН тусгана.
 *
 * ⚠️ Шууд үржүүлж болохгүй: ×60 гэдэг нь бодит 1 сек = 1 сим-цаг тул машин
 * 30 км замыг секундэд туулж, дэлгэц дээр зүгээр л анивчина. Тиймээс цагийн
 * хурд нь ЭРЭЛТИЙГ (машины тоо) хурдан өөрчилдөг ч машины хөдөлгөөн бодит
 * хурдандаа ойр үлдэнэ — «SUMO шиг» харагдац энэ тэнцвэрээс гарна.
 */
const paceOf = (speed: number) => Math.sqrt(Math.max(1, speed) / 20);

/** Замын хэрчмийн ачааллыг өнгөөр — машины эзлэх урт ÷ хэрчмийн урт. */
const OCCUPANCY_FULL = 0.28;

/** Машины өргөн (м) — зөвхөн ЗУРАЛТАД (хөдөлгүүр нь уртаар л ажилладаг). */
const CAR_W = 1.9;

/**
 * Машины биеийн өнгө — `Car.tint`-ээр сонгоно.
 * ⚠️ Хурдны өнгө БИШ: түгжрэлийг ТОРМОЗНЫ ГЭРЭЛ (ард улаан) заана. Бүх машиныг
 * хурдаар нь будвал зам дүрэлзсэн нэг өнгө болж, жинхэнэ урсгал шиг харагдахаа
 * больдог. Бодит замын машины өнгөний тархалттай ойролцоо жинтэй.
 */
const BODY_COLORS = [
  '#eceff3', '#eceff3', '#d5dae0', // цагаан · мөнгөлөг (хамгийн түгээмэл)
  '#8f99a6', '#5d6874',            // саарал
  '#2b3440',                       // хар
  '#b23b32', '#2f6fb0',            // улаан · цэнхэр
];

/** Энэ пиксел уртаас доош бол нарийн ширийн зурахгүй — зөвхөн цэг/зураас. */
const DETAIL_MIN_PX = 9;

/** `roundRect` дэмжигдэхгүй хөтөч дээр эгц булантай тэгш өнцөгт рүү шилжинэ. */
function body(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * ГАЗРЫН ЗУРАГ ДЭЭРХ ТРАФИКИЙН ДАВХАРГА — `<canvas>` (ArcGIS-ийн графикаар биш).
 *
 * ⚠️ Хэдэн зуун машиныг `GraphicsLayer`-ээр фрейм тутам шинэчилбэл ArcGIS бүр
 * бүрд нь symbol/geometry дахин боловсруулж, зураг гацна. Оронд нь view-ийн
 * хүрээнээс шууд хөрвүүлгийн коэффициент бодоод канвас дээр өөрсдөө зурна.
 *
 * ⚠️ ЗӨВХӨН 2D (`MapView`). `SceneView`-д газрын гадаргуу ~1350 м өндөрт тул
 * z=0-ын хавтгай проекц мешийн доор орох ба перспектив нь шугаман хөрвүүлгийг
 * эвдэнэ — дуудагч тал `dim === '2d'` үед л энэ давхаргыг холбоно.
 */
export function TrafficOverlay({
  viewRef,
  ready,
  net,
  minuteRef,
  playing,
  speed,
  maxCars,
  onStats,
}: {
  viewRef: RefObject<MapView | SceneView | null>;
  /** View бэлэн болсон эсэх — эффектийг дахин эхлүүлэх түлхүүр */
  ready: boolean;
  net: Network | null;
  /** Сим-цаг (минут) — `useSimClock`-ийн ФРЕЙМ БҮРИЙН ref (дахин зуралт үүсгэхгүй) */
  minuteRef: MutableRefObject<number>;
  playing: boolean;
  speed: number;
  /** Оргил цагт зэрэг явах машины тоо — эрэлтийн загвараас (`peakVehicles`) */
  maxCars: number;
  /** ~2 удаа/сек хураангуй буцаана */
  onStats?: (s: TrafficStats) => void;
}) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const carsRef = useRef<Car[]>([]);
  // Хөдөлгөөний параметрүүдийг ref-ээр — эффектийг дахин эхлүүлэхгүйгээр солино
  const opt = useRef({ playing, speed, onStats, maxCars });
  opt.current = { playing, speed, onStats, maxCars };

  useEffect(() => {
    const cnv = cvs.current;
    if (!cnv || !net || !net.edges.length || !ready) return;

    const ctx = cnv.getContext('2d');
    if (!ctx) return;

    const tbl = spawnTable(net);
    // ⚠️ Машиныг ЦЭВЭРЛЭНЭ: тэдгээр нь ирмэгийн ИНДЕКС барьдаг тул өөр сүлжээ
    //    ирвэл хуучин индекс огт өөр зам заана (эсвэл хязгаараас гарна).
    const cars = carsRef.current;
    cars.length = 0;
    let raf = 0;
    let last = 0;
    let statAt = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const view = viewRef.current;
      if (!view || view.destroyed || !view.ready) return;

      const dtReal = last ? Math.min(MAX_DT, (ts - last) / 1000) : 0;
      last = ts;

      /* ── 1. Эрэлт: машины тоог өдрийн муруйгаар барина ── */
      const demand = diurnalAt(minuteRef.current);
      const cap = Math.max(1, Math.min(CAR_CAP, opt.current.maxCars));
      const want = targetCars(demand, cap, Math.min(10, cap));
      while (cars.length > want) cars.pop();
      // Нэг фреймд цөөхнийг нэмнэ — эрэлт огцом өсөхөд гэнэт «цутгахгүй»
      for (let i = 0; i < 12 && cars.length < want; i++) {
        const c = spawnCar(net, tbl);
        if (!c) break;
        cars.push(c);
      }

      /* ── 2. Хөдөлгөөн ── */
      if (opt.current.playing && dtReal > 0) {
        stepCars(net, cars, dtReal * paceOf(opt.current.speed));
      }

      /* ── 3. Зуралт ── */
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = view.width;
      const h = view.height;
      if (!w || !h) return;
      if (cnv.width !== Math.round(w * dpr) || cnv.height !== Math.round(h * dpr)) {
        cnv.width = Math.round(w * dpr);
        cnv.height = Math.round(h * dpr);
      }
      const ext = view.extent;
      const span = ext ? ext.xmax - ext.xmin : 0;
      // Анимацын дунд хүрээ түр хоосон/нурсан байж болно — тэр фреймийг алгасна
      if (!span) return;
      // ⚠️ Эргэлтгүй 2D view — хүрээнээс шугаман хөрвүүлэг хангалттай
      const k = (w / span) * dpr;
      const ox = ext.xmin;
      const oy = ext.ymax;
      const px = (x: number) => (x - ox) * k;
      const py = (y: number) => (oy - y) * k;

      ctx.clearRect(0, 0, cnv.width, cnv.height);

      /* 3a. Машинтай хэрчмүүдийг ачааллын өнгөөр — түгжрэл ХААНА байгаа нь энэ */
      const perEdge = new Map<number, number>();
      let sumV = 0;
      for (const c of cars) {
        perEdge.set(c.e, (perEdge.get(c.e) ?? 0) + 1);
        sumV += c.v;
      }
      // ⚠️ `k` нь пиксел / ПРОЕКЦЫН НЭГЖ. Метрээр өгсөн хэмжээг (зам, машин)
      //    `unitsPerMeter`-ээр хөрвүүлж байж пиксел болгоно.
      const upm = net.unitsPerMeter || 1;
      const pxPerM = k * upm;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2 * dpr, Math.min(11 * dpr, 7 * pxPerM));
      ctx.globalAlpha = 0.5;
      for (const [ei, n] of perEdge) {
        const e = net.edges[ei];
        const lenM = Math.max(e.length / upm, 1);
        const occ = Math.min(1, (n * CAR_LEN) / lenM / OCCUPANCY_FULL);
        ctx.strokeStyle = simColor(occ);
        ctx.beginPath();
        ctx.moveTo(px(e.pts[0][0]), py(e.pts[0][1]));
        for (let i = 1; i < e.pts.length; i++) ctx.lineTo(px(e.pts[i][0]), py(e.pts[i][1]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* 3b. Машинууд.
         ⚠️ ХОЁР харагдац: ойртоход БОДИТ МАСШТАБТАЙ машины бие (4.5 × 1.9 м,
         бүхээг ба тормозны гэрэлтэй), холдоход зүгээр л хурдаар будсан зураас.
         Хоёр шалтгаан: 3 пиксел дээр бүхээг зурах нь утгагүй; мөн ерөнхий
         харагдацад «хаана түгжирч байна» гэдэг өнгөөр л уншигдана. */
      const lenPx = CAR_LEN * pxPerM;
      const detail = lenPx >= DETAIL_MIN_PX * dpr;

      if (!detail) {
        const dash = Math.max(2.4 * dpr, lenPx);
        ctx.lineWidth = Math.max(1.8 * dpr, dash * 0.62);
        for (const c of cars) {
          const p = carPose(net, c);
          const x = px(p.x);
          const y = py(p.y);
          if (x < -20 || y < -20 || x > cnv.width + 20 || y > cnv.height + 20) continue;
          const t = Math.max(0, Math.min(1, c.v / V_MAX));
          ctx.strokeStyle = t > 0.55 ? '#e6f6ff' : t > 0.25 ? '#fbbf24' : '#ef4444';
          const dx = (p.ux * dash) / 2;
          const dy = (-p.uy * dash) / 2;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      } else {
        const L = lenPx;
        const W = CAR_W * pxPerM;
        const pad = L;
        ctx.lineWidth = Math.max(0.6, W * 0.07);
        ctx.strokeStyle = 'rgba(8,12,18,.55)';
        for (const c of cars) {
          const p = carPose(net, c);
          const x = px(p.x);
          const y = py(p.y);
          if (x < -pad || y < -pad || x > cnv.width + pad || y > cnv.height + pad) continue;

          ctx.save();
          ctx.translate(x, y);
          // ⚠️ Дэлгэцийн y нь ДООШОО өсдөг тул чиглэлийн y-г урвуулна
          ctx.rotate(Math.atan2(-p.uy, p.ux));

          // Бие — УРД тал +x талд
          ctx.fillStyle = BODY_COLORS[Math.floor(c.tint * BODY_COLORS.length) % BODY_COLORS.length];
          body(ctx, -L / 2, -W / 2, L, W, W * 0.24);
          ctx.fill();
          ctx.stroke();

          // Бүхээг — биеэс нарийн, бага зэрэг ХОЙНО (урд капот үлдэнэ)
          ctx.fillStyle = 'rgba(14,21,30,.62)';
          body(ctx, -L * 0.26, -W * 0.31, L * 0.46, W * 0.62, W * 0.13);
          ctx.fill();

          // Гэрэл — булан бүрд жижиг дөрвөлжин. Урд нь шаргал, ард нь улаан
          // (удаашрах тусам тодорно) — чиглэл ба түгжрэл хоёулаа уншигдана.
          const ly = W * 0.5 - W * 0.30;
          const lh = W * 0.26;
          const lw2 = Math.max(0.7, L * 0.055);
          ctx.fillStyle = 'rgba(255,236,180,.9)';
          ctx.fillRect(L / 2 - lw2, -ly - lh / 2, lw2, lh);
          ctx.fillRect(L / 2 - lw2, ly - lh / 2, lw2, lh);

          const t = Math.max(0, Math.min(1, c.v / c.vmax));
          ctx.globalAlpha = t < 0.75 ? Math.min(1, (0.75 - t) * 1.9) : 0.35;
          ctx.fillStyle = t < 0.75 ? '#ff2d20' : 'rgba(120,30,26,.9)';
          ctx.fillRect(-L / 2, -ly - lh / 2, lw2, lh);
          ctx.fillRect(-L / 2, ly - lh / 2, lw2, lh);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }

      /* ── 4. Хураангуй — ~2 удаа/сек ── */
      if (opt.current.onStats && ts - statAt > 480) {
        statAt = ts;
        const kmh = cars.length ? (sumV / cars.length) * 3.6 : 0;
        opt.current.onStats({
          cars: cars.length,
          kmh,
          flow: cars.length ? Math.min(1, sumV / cars.length / V_MAX) : 1,
        });
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, cnv.width, cnv.height);
    };
  }, [net, ready, viewRef, minuteRef]);

  return (
    <canvas
      ref={cvs}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9 }}
    />
  );
}
