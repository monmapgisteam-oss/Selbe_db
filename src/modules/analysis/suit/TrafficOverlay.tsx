'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';

import {
  boundaryEntries, carCapacity, diurnalAt, stepCars, spawnTable, spawnCar, spawnCarAt,
  targetCars, carPose, carLen,
  signalPhase, VEHICLE_TYPES, DEFAULT_SIGNAL_PLAN, CAR_LEN, MIN_GAP_M, V_MAX,
  type Car, type Network, type SignalPlan,
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
  '#eceff3', '#eceff3', '#e4e8ee', // цагаан (хамгийн түгээмэл)
  '#d5dae0', '#b9c1cb',            // мөнгөлөг
  '#8f99a6', '#5d6874',            // саарал
  '#2b3440', '#1b2029',            // хар
  '#b23b32', '#8d2f2a',            // улаан · бордоо
  '#2f6fb0', '#27506f',            // цэнхэр · хар хөх
  '#3f7f5f',                       // ногоон
  '#c98a2b',                       // шаргал
  '#7a5fa3',                       // ягаан ягаавтар
  '#2a6f6b',                       // номин ногоон
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
 * ЭНЭ ПИКСЕЛ УРТААС дээш л нарийн эд анги (дугуй, толь, шил) зурна.
 * ⚠️ Хэдэн зуун машин × хэдэн зам = фрейм бүрийн зардал. Хол байхад тэдгээр нь
 * ямар ч мэдээлэл нэмэхгүй (1-2 пиксел) тул зөвхөн ойртоход л асна.
 */
const FINE_MIN_PX = 26;

/**
 * «Гарч явах» машины ТЭВЧЭЭРИЙН хугацаа (сим-сек): үүнээс удаж хилд хүрч
 * чадаагүй бол (түгжирсэн) 2.5 секундэд ААЖИМ БҮДГЭРЧ алга болно — «гэнэт алга
 * болох»-ын оронд зөөлөн ууссан гарал. Хил руу чиглэсэн ихэнх машин үүнээс
 * өмнө жамаараа гарчихдаг тул fade нь зөвхөн даатгал.
 */
const LEAVE_GRACE_S = 45;
const FADE_S = 2.5;
/** Шинэ машин 0.8 секундэд аажим ТОДОРЧ орж ирнэ (гэнэт «пор» хийхгүй) */
const BORN_FADE_S = 0.8;

/** Автобусны биеийн өнгө — хөнгөн автоос ЯЛГАРАХ палитр (шар/цэнхэр давамгай). */
const BUS_COLORS = ['#e8b23a', '#d9dee4', '#3f7fb8', '#4f9d69'];

/**
 * ДЭЭРЭЭС ХАРСАН ХӨНГӨН АВТО — бодит хэлбэрийн силуэт.
 *
 * ⚠️ Урьд нь энгийн бөөрөнхий тэгш өнцөгт + бүхээг байсан тул ойртоход «машин»
 * гэхээсээ «хайрцаг» шиг харагддаг байв. Одоо: хамар нь нарийсч, гадас (дугуй)
 * бие рүүгээ цухуйж, салхин шил ба хойд шил тусад нь, хажуугийн толь бүхий
 * хэлбэр. Бүх хэмжээ нь БИЕИЙН урт/өргөнөөс хувиар гарах тул автобус/ачаа ч
 * ижил зарчмаар масштаблагдана.
 *
 * Локал тэнхлэг: +x = УРАГШ, эх нь машины төв.
 */
function drawCarBody(
  ctx: CanvasRenderingContext2D,
  L: number, W: number, color: string, fine: boolean,
  model: 'sedan' | 'hatch' | 'suv' | 'van' | 'pickup' = 'sedan',
) {
  /* ── ЗАГВАР БҮРИЙН ХЭМЖЭЭС (биеийн уртаас хувиар) ──
     `cabF`/`cabB` — бүхээгийн урд/хойд зах, `nose` — хамрын нарийсал,
     `boxy` — булангийн өнцөгшил (жийп/вэн эгц, седан бөөрөнхий). */
  const M = {
    sedan: { cabF: 0.16, cabB: -0.2, nose: 0.46, boxy: 0.14, rear: 0.44 },
    hatch: { cabF: 0.14, cabB: -0.34, nose: 0.44, boxy: 0.16, rear: 0.46 },
    suv: { cabF: 0.2, cabB: -0.32, nose: 0.5, boxy: 0.08, rear: 0.5 },
    van: { cabF: 0.26, cabB: -0.4, nose: 0.5, boxy: 0.07, rear: 0.5 },
    pickup: { cabF: 0.2, cabB: -0.06, nose: 0.47, boxy: 0.1, rear: 0.48 },
  }[model];

  // ── Дугуй (биеийн ДООР — хажуугаар нь цухуйна) ──
  if (fine) {
    ctx.fillStyle = 'rgba(18,22,28,.92)';
    const wl = L * (model === 'suv' || model === 'pickup' ? 0.19 : 0.17);
    const ww = W * (model === 'suv' || model === 'pickup' ? 0.18 : 0.16);
    for (const sx of [L * 0.29, -L * 0.3]) {
      for (const sy of [-W * 0.5, W * 0.5 - ww]) {
        body(ctx, sx - wl / 2, sy, wl, ww, ww * 0.35);
        ctx.fill();
      }
    }
  }

  // ── Бие — урд нь нарийсч (`nose`), хойд нь дүрсээсээ хамаарч өргөн ──
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-L * 0.46, -W * rearW(model));
  ctx.lineTo(L * 0.22, -W * 0.5);
  ctx.quadraticCurveTo(L * 0.5, -W * M.nose, L * 0.5, -W * 0.12);
  ctx.lineTo(L * 0.5, W * 0.12);
  ctx.quadraticCurveTo(L * 0.5, W * M.nose, L * 0.22, W * 0.5);
  ctx.lineTo(-L * 0.46, W * rearW(model));
  ctx.quadraticCurveTo(-L * 0.5, W * 0.4, -L * 0.5, W * 0.2);
  ctx.lineTo(-L * 0.5, -W * 0.2);
  ctx.quadraticCurveTo(-L * 0.5, -W * 0.4, -L * 0.46, -W * rearW(model));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ── Бүхээгийн дээвэр — загвар бүрд өөр урттай ──
  ctx.fillStyle = 'rgba(16,22,30,.55)';
  body(ctx, L * M.cabB, -W * 0.34, L * (M.cabF - M.cabB), W * 0.68, W * M.boxy);
  ctx.fill();

  // ── ПИКАП: нээлттэй ачааны тавцан (бүхээгийн хойно) ──
  if (model === 'pickup') {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    body(ctx, -L * 0.44, -W * 0.36, L * 0.36, W * 0.72, W * 0.06);
    ctx.fill();
  }

  if (!fine) return;

  // ── Салхин шил ба хойд шил ──
  ctx.fillStyle = 'rgba(120,160,195,.55)';
  ctx.beginPath();
  ctx.moveTo(L * (M.cabF - 0.02), -W * 0.33);
  ctx.lineTo(L * (M.cabF + 0.11), -W * 0.24);
  ctx.lineTo(L * (M.cabF + 0.11), W * 0.24);
  ctx.lineTo(L * (M.cabF - 0.02), W * 0.33);
  ctx.closePath();
  ctx.fill();
  if (model !== 'pickup') {
    ctx.beginPath();
    ctx.moveTo(L * M.cabB, -W * 0.31);
    ctx.lineTo(L * (M.cabB - 0.11), -W * 0.22);
    ctx.lineTo(L * (M.cabB - 0.11), W * 0.22);
    ctx.lineTo(L * M.cabB, W * 0.31);
    ctx.closePath();
    ctx.fill();
  }

  // ── Хажуугийн толь ──
  ctx.fillStyle = 'rgba(30,36,44,.9)';
  const mw = L * 0.05;
  const mh = W * 0.1;
  ctx.fillRect(L * (M.cabF + 0.02), -W * 0.5 - mh * 0.75, mw, mh);
  ctx.fillRect(L * (M.cabF + 0.02), W * 0.5 - mh * 0.25, mw, mh);
}

/** Хойд хэсгийн өргөн — жийп/вэн эгц (бараг бүтэн), седан бага зэрэг нарийссан. */
function rearW(model: string): number {
  return model === 'suv' || model === 'van' ? 0.48 : 0.44;
}

/**
 * АВТОБУС — урт тэгш өнцөгт бие, хажуугийн цонхны туузтай.
 * ⚠️ Хөнгөн автоос ХОЛООС ялгагдах ёстой: урт (11 м) ба цонхны тууз нь
 * газрын зураг дээр нэг харцаар «нийтийн тээвэр» гэдгийг хэлнэ.
 */
function drawBusBody(
  ctx: CanvasRenderingContext2D,
  L: number, W: number, color: string, fine: boolean,
) {
  if (fine) {
    ctx.fillStyle = 'rgba(18,22,28,.92)';
    const wl = L * 0.09;
    const ww = W * 0.15;
    for (const sx of [L * 0.33, -L * 0.2, -L * 0.31]) {
      for (const sy of [-W * 0.5, W * 0.5 - ww]) {
        body(ctx, sx - wl / 2, sy, wl, ww, ww * 0.3);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = color;
  body(ctx, -L * 0.5, -W * 0.5, L, W, W * 0.18);
  ctx.fill();
  ctx.stroke();

  // Салхин шил — урд талд бүтэн өргөнөөр
  ctx.fillStyle = 'rgba(120,160,195,.6)';
  body(ctx, L * 0.4, -W * 0.4, L * 0.07, W * 0.8, W * 0.08);
  ctx.fill();

  if (!fine) return;
  // Хажуугийн цонхны тууз — хоёр талд
  ctx.fillStyle = 'rgba(60,90,120,.45)';
  ctx.fillRect(-L * 0.42, -W * 0.5 + W * 0.06, L * 0.78, W * 0.09);
  ctx.fillRect(-L * 0.42, W * 0.5 - W * 0.15, L * 0.78, W * 0.09);
  // Дээврийн агааржуулалт
  ctx.fillStyle = 'rgba(16,22,30,.3)';
  ctx.fillRect(-L * 0.1, -W * 0.16, L * 0.12, W * 0.32);
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
  signalPlan = DEFAULT_SIGNAL_PLAN,
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
  /**
   * ГЭРЛЭН ДОХИОНЫ зохицуулалтын хөтөлбөр (ээлжийн тоо, мөчлөг).
   * ⚠️ Сүлжээнд хадгалагдахгүй тул солиход дахин угсрах шаардлагагүй — дараагийн
   *    фреймээс шууд үйлчилнэ.
   */
  signalPlan?: SignalPlan;
  /** ~2 удаа/сек хураангуй буцаана */
  onStats?: (s: TrafficStats) => void;
}) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const carsRef = useRef<Car[]>([]);
  // Хөдөлгөөний параметрүүдийг ref-ээр — эффектийг дахин эхлүүлэхгүйгээр солино
  const opt = useRef({ playing, speed, onStats, maxCars, signalPlan });
  opt.current = { playing, speed, onStats, maxCars, signalPlan };

  useEffect(() => {
    const cnv = cvs.current;
    if (!cnv || !net || !net.edges.length || !ready) return;

    const ctx = cnv.getContext('2d');
    if (!ctx) return;

    const tbl = spawnTable(net);
    /** Сүлжээний багтаамжийн таг — эрэлт үүнээс их бол энд таслана (түгжрэлээс
        сэргийлнэ; оргилын ЦАГ өөрчлөгдөхгүй, зөвхөн нягтрал хязгаарлагдана) */
    const capNet = carCapacity(net);
    /** Хилийн орц/гарцууд — машин эндээс «ирж», эндээс «явж одно» */
    const entries = boundaryEntries(net);
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

      /* ── 1. Эрэлт: машины тоог өдрийн муруйгаар ЖИГД барина ──
         24 цагийн мөчлөг: 00:00-д цөөхөн → өглөөний оргилд түгжирнэ → буурна →
         оройн оргил → шөнө рүү буурна — дараа нь дахин эхэлнэ (`diurnalAt` wrap).
         ⚠️ МАШИН ГЭНЭТ АЛГА БОЛОХГҮЙ, ГЭНЭТ ГАРЧ ИРЭХГҮЙ:
           · ЦӨӨРҮҮЛЭХ — далд байгааг чимээгүй авна; харагдаж байгааг «гарч
             явах» горимд шилжүүлнэ: замаа үргэлжлүүлж яваад ХИЛИЙН ГАРЦААР
             (мухрын үзүүр = бүсийн зах) жамаараа гарч одно.
           · Эрэлт эргэж өсвөл гарч яваа машиныг ЭХЭЛЖ буцаана — устгах/
             төрүүлэх чичиргээ үүсэхгүй. */
      const demand = diurnalAt(minuteRef.current);
      const cap = Math.max(1, Math.min(CAR_CAP, opt.current.maxCars, capNet));
      const want = targetCars(demand, cap, Math.min(10, cap));
      // Хилээр гарсан (done), далд гарсан, эсвэл бүрэн бүдгэрсэн гарагсдыг авна
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        const faded = c.leaving && c.leaveT != null
          && simTime - c.leaveT > LEAVE_GRACE_S + FADE_S;
        if (c.done || faded || (c.leaving && offscreen(c))) cars.splice(i, 1);
      }
      let leavingNow = cars.reduce((a, c) => a + (c.leaving ? 1 : 0), 0);
      // «Ирж буй» тоо = нийт − гарч яваа: зорилтот тоо руу үүгээр тэгшитгэнэ
      let excess = cars.length - leavingNow - want;
      if (excess > 0) {
        // Далд байгааг шууд; үлдсэнийг «гарч явах» горимд
        for (let i = cars.length - 1; i >= 0 && excess > 0; i--) {
          if (!cars[i].leaving && offscreen(cars[i])) { cars.splice(i, 1); excess--; }
        }
        for (let i = cars.length - 1; i >= 0 && excess > 0; i--) {
          if (!cars[i].leaving) { cars[i].leaving = true; cars[i].leaveT = simTime; excess--; }
        }
      } else if (excess < 0) {
        // Эрэлт өслөө — гарч яваа машиныг буцааж «үлдээнэ» (шинээр төрүүлэхээс өмнө)
        // ⚠️ leavingNow-г мөн хорогдуулна: эс бөгөөс доорх need буцаасан машиныг
        //    «гарч яваа» хэвээр тооцож ДАВХАР төрүүлээд дараагийн фреймд илүүдлээ
        //    дахин гаргадаг савлагаа (churn) үүсдэг байсан.
        for (const c of cars) {
          if (excess >= 0) break;
          if (c.leaving) { c.leaving = false; leavingNow--; excess++; }
        }
      }
      // Нэг фреймд цөөхнийг нэмнэ — эрэлт огцом өсөхөд гэнэт «цутгахгүй».
      // ⚠️ ДЭЛГЭЦИЙН ДУНДААС ХЭЗЭЭ Ч ТӨРӨХГҮЙ: далд газар санамсаргүй, эсвэл
      //    ХИЛИЙН ОРЦООР (мухрын үзүүр = бүсийн зах) орж ирнэ — «бүсэд орж
      //    ирж яваа» мэт жамаараа харагдана.
      if (cars.length - leavingNow < want) {
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
        /** Хилийн орц чөлөөтэй юу — орцын 14 м дотор машин байхгүй бол */
        const entryFree = (en: { e: number; dir: 1 | -1 }): boolean => {
          const l = occ.get(en.e);
          if (!l) return true;
          const len = net.edges[en.e].length;
          // Орцын чөлөөт бүс — машины урт + зай (14 м байсныг багасгав: орц бүр
          // ~3 сек тутам биш ~2 сек тутам нэг машин нэвтрүүлж, оргилын өсөлтийг гүйцнэ)
          const zone = 10 * upm;
          for (const o of l) {
            const dTip = en.dir === 1 ? o.s : len - o.s;
            // ⚠️ o.s нь машины ТӨВ — урт тээврийн (автобус 11 м) АР БИЕ бүсэд
            //    цухуйсан байхыг half-аар тооцно, эс бөгөөс давхарлан төрдөг байсан
            if (dTip - o.half < zone) return false;
          }
          return true;
        };
        /* ── Төрөлт: далд газар + ЧӨЛӨӨТЭЙ орц бүрээр ──
           ⚠️ Урьд нь орцыг САНАМСАРГҮЙ сонгож, эхний бүтэлгүй оролдлоор бүх
           төрөлтөө зогсоодог байсан тул оргил цагт орох урсгал эрэлтээ гүйцэхгүй
           «хэт цөөхөн машин» харагдаж байв. Одоо чөлөөтэй орцуудын ЖАГСААЛТ
           гаргаж, бүгдээр нь зэрэг оруулна. */
        let need = Math.min(30, Math.max(0, want - (cars.length - leavingNow)));
        // ① ДАЛД газар санамсаргүй байрлалд (хамгийн жам ёсны)
        for (let t = 0; t < 16 && need > 0; t++) {
          const cand = spawnCar(net, tbl);
          if (!cand || !fits(cand) || !offscreen(cand)) continue;
          // ⚠️ Зогссон (paused) үед simTime хөдөлдөггүй тул bornT=simTime бол
          //    alpha=0 ҮҮРД — машин статистикт тоологдовч дэлгэцэнд үл үзэгдэнэ
          //    (таб анх playing=false-ээр нээгддэг). Зогссон үед fade алгасаж тод төрүүлнэ.
          cand.bornT = opt.current.playing ? simTime : simTime - BORN_FADE_S;
          cars.push(cand);
          occAdd(cand);
          need--;
        }
        // ② Чөлөөтэй ХИЛИЙН ОРЦ бүрээр нэг машин орж ирнэ
        if (need > 0 && entries.length) {
          const free = entries.filter(entryFree);
          // Санамсаргүй эрэмбэ — үргэлж нэг өнцгөөс цувахгүй
          for (let i = free.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [free[i], free[j]] = [free[j], free[i]];
          }
          for (const en of free) {
            if (need <= 0) break;
            const c = spawnCarAt(net, en);
            // ⚠️ paused үед fade алгасана (дээрх ①-тэй ижил шалтгаан)
            c.bornT = opt.current.playing ? simTime : simTime - BORN_FADE_S;
            cars.push(c);
            occAdd(c);
            need--;
          }
        }
      }

      /* ── 2. Хөдөлгөөн ── */
      let dtSim = 0;
      if (opt.current.playing && dtReal > 0) {
        dtSim = dtReal * paceOf(opt.current.speed);
        simTime += dtSim;
        stepCars(net, cars, dtSim, Math.random, simTime, opt.current.signalPlan);
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
      /* ── ЗАМНАЛЫН ГӨЛГӨРҮҮЛЭЛТ (ArcGIS smooth-ийн үзэл) ──
         Зурагдах байрлал/чиглэл нь бодит байрлалаа экспоненциалаар (τ=0.15с)
         дагана. Уулзварын таслалтын БОГИНО хэрчмүүдээр дамжсан эргэлт олон
         жижиг хугаралтай байдгийг нэг гөлгөр нум болгоно. Зөвхөн харагдац —
         хөдөлгүүрийн байрлалд огт нөлөөгүй. Том үсрэлтэд (мухрын шилжилт,
         төрөлт) ШУУД наана — эс бөгөөс машин газраар «гулсаж» ниснэ. */
      const SMOOTH_TAU = 0.15;
      const kSm = dtSim > 0 ? 1 - Math.exp(-dtSim / SMOOTH_TAU) : 0;
      const smoothPose = (c: Car, p: { x: number; y: number; ux: number; uy: number }) => {
        const jump = c.sx == null || c.sy == null
          || Math.hypot(p.x - c.sx, p.y - c.sy) > 20 * upm;
        if (jump || kSm <= 0) {
          if (jump) { c.sx = p.x; c.sy = p.y; c.sux = p.ux; c.suy = p.uy; }
          return { x: c.sx ?? p.x, y: c.sy ?? p.y, ux: c.sux ?? p.ux, uy: c.suy ?? p.uy };
        }
        c.sx = (c.sx as number) + (p.x - (c.sx as number)) * kSm;
        c.sy = (c.sy as number) + (p.y - (c.sy as number)) * kSm;
        let ux = (c.sux ?? p.ux) + (p.ux - (c.sux ?? p.ux)) * kSm;
        let uy = (c.suy ?? p.uy) + (p.uy - (c.suy ?? p.uy)) * kSm;
        const L = Math.hypot(ux, uy);
        // U-эргэлт (бараг эсрэг вектор) — дундаж нь тэглэдэг тул шууд наана
        if (L < 0.3 || (c.sux ?? 0) * p.ux + (c.suy ?? 0) * p.uy < -0.7) {
          ux = p.ux; uy = p.uy;
        } else { ux /= L; uy /= L; }
        c.sux = ux; c.suy = uy;
        return { x: c.sx, y: c.sy, ux, uy };
      };

      /** Машины тунгалагшил: төрөхдөө 0.8с тодорно; гарч чадаагүй нь 2.5с бүдгэрнэ */
      const alphaOf = (c: Car): number => {
        let a = 1;
        if (c.bornT != null) a = Math.min(1, (simTime - c.bornT) / BORN_FADE_S);
        if (c.leaving && c.leaveT != null) {
          const over = simTime - c.leaveT - LEAVE_GRACE_S;
          if (over > 0) a = Math.min(a, Math.max(0, 1 - over / FADE_S));
        }
        return a;
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* 3b. Машинууд.
         ⚠️ ХОЁР харагдац: ойртоход БОДИТ МАСШТАБТАЙ машины бие (4.5 × 1.9 м,
         бүхээг ба тормозны гэрэлтэй), холдоход зүгээр л хурдаар будсан зураас.
         Хоёр шалтгаан: 3 пиксел дээр бүхээг зурах нь утгагүй; мөн ерөнхий
         харагдацад «хаана түгжирч байна» гэдэг өнгөөр л уншигдана. */
      const lenPx = CAR_LEN * pxPerM;
      const detail = lenPx >= DETAIL_MIN_PX * dpr;
      // ⚠️ Нарийн эд анги (дугуй, толь, шил) зөвхөн ОЙРТОХОД — зардлыг барина
      const fineDetail = lenPx >= FINE_MIN_PX * dpr;

      if (!detail) {
        const dash = Math.max(2.4 * dpr, lenPx);
        ctx.lineWidth = Math.max(1.8 * dpr, dash * 0.62);
        for (const c of cars) {
          const p = smoothPose(c, carPose(net, c));
          const x = px(p.x);
          const y = py(p.y);
          if (x < -20 || y < -20 || x > cnv.width + 20 || y > cnv.height + 20) continue;
          const t = Math.max(0, Math.min(1, c.v / V_MAX));
          ctx.strokeStyle = t > 0.55 ? '#e6f6ff' : t > 0.25 ? '#fbbf24' : '#ef4444';
          const dx = (p.ux * dash) / 2;
          const dy = (-p.uy * dash) / 2;
          ctx.globalAlpha = alphaOf(c);
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else {
        // ⚠️ Урт нь МАШИН БҮРД өөр (автобус/ачаа урт) — төрөл нүдэнд ялгарна.
        //    Өргөн нь урттай зэрэгцэн бага зэрэг өснө (урт машин илүү өргөн).
        const pad = 14 * pxPerM;
        for (const c of cars) {
          const p = smoothPose(c, carPose(net, c));
          const x = px(p.x);
          const y = py(p.y);
          if (x < -pad || y < -pad || x > cnv.width + pad || y > cnv.height + pad) continue;

          const L = carLen(c) * pxPerM;
          const W = CAR_W * (1 + (carLen(c) / CAR_LEN - 1) * 0.35) * pxPerM;
          ctx.lineWidth = Math.max(0.6, W * 0.07);
          ctx.strokeStyle = 'rgba(8,12,18,.55)';

          // ⚠️ ТЭЭВРИЙН ТӨРӨЛ (`VEHICLE_TYPES`) — хэлбэр ба палитрыг шийднэ.
          //    Төрөлгүй хуучин машиныг хөнгөн авто гэж үзнэ.
          const vt = VEHICLE_TYPES[c.vt ?? 0];
          const kind = vt?.key ?? 'car';
          const pal = kind === 'bus' ? BUS_COLORS : BODY_COLORS;
          const color = pal[Math.floor(c.tint * pal.length) % pal.length];

          ctx.save();
          ctx.globalAlpha = alphaOf(c); // төрөх/гарах шилжилт — гэнэт биш
          ctx.translate(x, y);
          // ⚠️ Дэлгэцийн y нь ДООШОО өсдөг тул чиглэлийн y-г урвуулна
          ctx.rotate(Math.atan2(-p.uy, p.ux));

          // ── Хүрэлцэх сүүдэр — биеэс арай том, бүдэг. `shadowBlur` ЗОРИУДААР
          //    ХЭРЭГЛЭЭГҮЙ: хэдэн зуун машинд тэр нь фрейм унагадаг.
          ctx.fillStyle = 'rgba(6,10,16,.28)';
          body(ctx, -L * 0.5 - W * 0.06, -W * 0.5 - W * 0.06, L + W * 0.12, W + W * 0.12, W * 0.2);
          ctx.fill();

          // ── Бие (төрлөөрөө) ──
          if (kind === 'bus') drawBusBody(ctx, L, W, color, fineDetail);
          else drawCarBody(ctx, L, W, color, fineDetail, (vt?.model ?? 'sedan') as 'sedan');

          // Гэрэл — булан бүрд жижиг дөрвөлжин. Урд нь шаргал, ард нь улаан
          // (удаашрах тусам тодорно) — чиглэл ба түгжрэл хоёулаа уншигдана.
          const ly = W * 0.5 - W * 0.30;
          const lh = W * 0.26;
          const lw2 = Math.max(0.7, L * 0.055);
          ctx.fillStyle = 'rgba(255,236,180,.9)';
          ctx.fillRect(L / 2 - lw2, -ly - lh / 2, lw2, lh);
          ctx.fillRect(L / 2 - lw2, ly - lh / 2, lw2, lh);

          const t = Math.max(0, Math.min(1, c.v / c.vmax));
          ctx.globalAlpha = (t < 0.75 ? Math.min(1, (0.75 - t) * 1.9) : 0.35) * alphaOf(c);
          ctx.fillStyle = t < 0.75 ? '#ff2d20' : 'rgba(120,30,26,.9)';
          ctx.fillRect(-L / 2, -ly - lh / 2, lw2, lh);
          ctx.fillRect(-L / 2, ly - lh / 2, lw2, lh);
          ctx.restore(); // alpha-г restore сэргээнэ
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
          const ph = signalPhase(ln.code, simTime, opt.current.signalPlan, ln.j);
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
