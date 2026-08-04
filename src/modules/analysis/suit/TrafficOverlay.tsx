'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';

import {
  diurnalAt, stepCars, spawnTable, spawnCar, targetCars, carPose, carLen,
  signalPhase, CAR_LEN, MIN_GAP_M, V_MAX, type Car, type Network,
} from './traffic';
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
 * хязгаар нь гүйцэтгэлээс биш, аюулгүйн дээд шал. `DEMAND_SCALE=5`-ийн дараах
 * оргил ~5,355 машиныг багтаана.
 */
const CAR_CAP = 8000;

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
    /** Гэрлэн дохионы сим-хугацаа — машины хөдөлгөөнтэй ижил масштабаар хуримтлана. */
    let simTime = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const view = viewRef.current;
      if (!view || view.destroyed || !view.ready) return;

      const dtReal = last ? Math.min(MAX_DT, (ts - last) / 1000) : 0;
      last = ts;

      /* ── 0. Дэлгэцийн хөрвүүлэг — эрэлтийн блокоос ӨМНӨ, учир нь машин
         нэмэх/хасахдаа «дэлгэцэд харагдаж байна уу» гэдгийг шалгана ── */
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
      const upm = net.unitsPerMeter || 1;
      const pxPerM = k * upm;

      /** Машин дэлгэцээс ГАДУУР байна уу (жижиг захын зайтай) */
      const offscreen = (c: Car): boolean => {
        const p = carPose(net, c);
        const x = px(p.x);
        const y = py(p.y);
        return x < -30 || y < -30 || x > cnv.width + 30 || y > cnv.height + 30;
      };

      /* ── 1. Эрэлт: машины тоог өдрийн муруйгаар барина ──
         ⚠️ МАШИН ДЭЛГЭЦИЙН ДУНДААС ХЭЗЭЭ Ч АЛГА БОЛОХГҮЙ. Цөөрүүлэхдээ:
           а) дэлгэцээс ГАДУУРХ машиныг чимээгүй авна (үл үзэгдэх), эсвэл
           б) замын ХИЛИЙН ГАРЦАД (sink) ойртсон машиныг «бүсээс гарлаа» гэж
              авна — хилээр гарч буй мэт зүй ёсны харагдац.
         Аль нь ч байхгүй бол ХАСАХГҮЙ — тоо түр зөрөхийг зөвшөөрнө. */
      const demand = diurnalAt(minuteRef.current);
      const cap = Math.max(1, Math.min(CAR_CAP, opt.current.maxCars));
      const want = targetCars(demand, cap, Math.min(10, cap));
      let excess = cars.length - want;
      if (excess > 0) {
        for (let i = cars.length - 1; i >= 0 && excess > 0; i--) {
          if (offscreen(cars[i])) { cars.splice(i, 1); excess--; }
        }
        for (let i = cars.length - 1; i >= 0 && excess > 0; i--) {
          const c = cars[i];
          const e = net.edges[c.e];
          const node = c.dir === 1 ? e.b : e.a;
          if (!net.sinkExit.has(node)) continue;
          const distEndM = (c.dir === 1 ? e.length - c.s : c.s) / upm;
          if (distEndM < 25) { cars.splice(i, 1); excess--; }
        }
      }
      // Нэг фреймд цөөхнийг нэмнэ — эрэлт огцом өсөхөд гэнэт «цутгахгүй».
      // ⚠️ Аль болох ДЭЛГЭЦЭЭС ГАДУУР төрүүлнэ (хэдэн оролдлого) — дэлгэцийн
      //    дунд «пор» хийж гарч ирэхгүй; бүх зам дэлгэцэд байвал аргагүй.
      //    ×5 эрэлтэд (~5,355) фреймд 30 → оргил ~3 секундэд бөглөнө.
      if (cars.length < want) {
        /* ⚠️ ДАВХЦЛЫН ХАМГААЛАЛТ: санамсаргүй байрлалд төрөх машин аль хэдийн
           зогсож буй машины ДЭЭР бууж давхарладаг байсан (өндөр нягтралд илт).
           Хөдөлгөөний зай барих логик давхарласныг САЛГАЖ чаддаггүй тул төрөхөөс
           нь ӨМНӨ шалгана: ижил ирмэг дээрх машинтай бамперын зай хүрэлцэхгүй
           бол тэр байрлалд ТӨРӨХГҮЙ (дахин оролдоно). */
        const occ = new Map<number, { s: number; half: number }[]>();
        const occAdd = (c: Car) => {
          let l = occ.get(c.e);
          if (!l) { l = []; occ.set(c.e, l); }
          l.push({ s: c.s, half: (carLen(c) / 2) * upm });
        };
        for (const c of cars) occAdd(c);
        const gapU = MIN_GAP_M * upm;
        // ⚠️ Ирмэгийн ҮЗҮҮРТ төрөхгүй: зэргэлдээ ирмэгийн зангилаан дээр зогссон
        //    машины хагас бие энэ ирмэг рүү цухуйж болно — тэнд төрвөл давхарлана.
        //    Хязгаар: өөрийн хагас + зай + хамгийн урт тээврийн хагас (автобус 5.5м).
        const endMargin = (5.5 + MIN_GAP_M) * upm;
        const fits = (cand: Car): boolean => {
          const half = (carLen(cand) / 2) * upm;
          const len = net.edges[cand.e].length;
          if (cand.s < half + endMargin || cand.s > len - half - endMargin) return false;
          const l = occ.get(cand.e);
          if (!l) return true;
          for (const o of l) if (Math.abs(o.s - cand.s) < o.half + half + gapU) return false;
          return true;
        };
        for (let i = 0; i < 30 && cars.length < want; i++) {
          let c: Car | null = null;
          for (let t = 0; t < 8; t++) {
            const cand = spawnCar(net, tbl);
            if (!cand) break;
            if (!fits(cand)) continue; // давхцана — өөр байрлал сонирхоно
            c = cand;
            if (offscreen(cand)) break;
          }
          if (!c) continue; // энэ фреймд зав олдсонгүй — дараагийн фреймд
          cars.push(c);
          occAdd(c);
        }
      }

      /* ── 2. Хөдөлгөөн ── */
      if (opt.current.playing && dtReal > 0) {
        const dt = dtReal * paceOf(opt.current.speed);
        simTime += dt;
        stepCars(net, cars, dt, Math.random, simTime);
      }

      /* ── 3. Зуралт ── */
      ctx.clearRect(0, 0, cnv.width, cnv.height);

      /* 3a. Дундаж хурдын нийлбэр — хураангуйд (замын шугам ЗУРАГДАХГҮЙ).
         ⚠️ Ирмэгийн ачааллын зураас ЗОРИУДААР ХАСАГДСАН: замын гадаргуу нь
         vector tile (`test_zam`)-аас өөрөө харагддаг тул давхар шугам зөвхөн
         дүрсийг бөглөрүүлж байсан. Түгжрэл нь машинуудын өнгө (тормозны гэрэл,
         зогссон бөөгнөрөл)-өөс уншигдана. */
      let sumV = 0;
      for (const c of cars) sumV += c.v;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

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
        // ⚠️ Урт нь МАШИН БҮРД өөр (автобус/ачаа урт) — төрөл нүдэнд ялгарна.
        //    Өргөн нь урттай зэрэгцэн бага зэрэг өснө (урт машин илүү өргөн).
        const pad = 14 * pxPerM;
        for (const c of cars) {
          const p = carPose(net, c);
          const x = px(p.x);
          const y = py(p.y);
          if (x < -pad || y < -pad || x > cnv.width + pad || y > cnv.height + pad) continue;

          const L = carLen(c) * pxPerM;
          const W = CAR_W * (1 + (carLen(c) / CAR_LEN - 1) * 0.35) * pxPerM;
          ctx.lineWidth = Math.max(0.6, W * 0.07);
          ctx.strokeStyle = 'rgba(8,12,18,.55)';

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

      /* ── 3c-0. БОДИТ гэрлэн дохионы шугам (`gerlen_dohio`) ──
         ⚠️ Approach line бүрийг өнгөөр: бүлэг 0 (codes 1,3) ба бүлэг 1 (codes 2,4)
         ЭСРЭГ фазтай — 30 сек тутам ногоон↔улаан солигдоно. Машины `isGreen`-тэй
         ИЖИЛ мөчлөг (`SIGNAL_CYCLE_S`) тул улаан шугамын машин ҮРГЭЛЖ зогсоно. */
      if (net.signalLines.length) {
        ctx.lineCap = 'round';
        // ⚠️ НАРИЙН зураас — зогсолтын шугам газарт зурсан тэмдэглэгээ шиг,
        //    машиныг бүрхэхгүй (машин ~1.9 м өргөн, шугам ~0.8 м).
        ctx.lineWidth = Math.max(1.2 * dpr, Math.min(3.5 * dpr, 0.8 * pxPerM));
        for (const ln of net.signalLines) {
          if (ln.pts.length < 2) continue;
          // Ногоон → шар (3 сек) → улаан — хөдөлгүүрийн фазтай НЭГ эх сурвалж
          const ph = signalPhase(ln.group, simTime);
          ctx.strokeStyle = ph === 'green' ? '#22c55e' : ph === 'yellow' ? '#facc15' : '#ff3b30';
          ctx.beginPath();
          ctx.moveTo(px(ln.pts[0][0]), py(ln.pts[0][1]));
          for (let i = 1; i < ln.pts.length; i++) ctx.lineTo(px(ln.pts[i][0]), py(ln.pts[i][1]));
          ctx.stroke();
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
