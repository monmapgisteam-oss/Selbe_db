'use client';

/**
 * УСНЫ УРСГАЛЫН АНИМАЦ — тоосонцрын СУДАЛ загварчлалын хурдны талбар дээр.
 *
 * ══════════════════ ЯАГААД ══════════════════
 *
 * Гүний растер нь «ус ХААНА байна» гэдгийг хэлдэг ч «ус ХӨДӨЛЖ байна» гэдгийг
 * хэлдэггүй. Урьд нь чиглэлийг ЦАГААН СУМААР зурдаг байсан нь техникийн
 * тэмдэглэгээ — диаграм шиг харагдана, ус шиг биш (хэрэглэгчийн 2026-09-09-ны
 * хүсэлт: «жинхэнэ усны анимац»).
 *
 * Тоосонцор нь хурдны талбар дээр ХӨВЖ (advection), өнгөрсөн замаа бүдгэрч
 * буй судал болгон үлдээнэ. Нүд нь хөдөлгөөнийг ШУУД уншина — гол дундуур
 * хурдан, эрэг дээр удаан, тойрч эргэлддэг нь бүгд харагдана.
 */

import type { FloodData } from '@/lib/uyr';

/** Гаралтын canvas-ийн өргөн (px). Домэйн квадрат тул өндөр нь ижил. */
const OUT_W = 720;

/**
 * ТООСОНЦРЫН НЯГТ — нэг тоосонцорт ноогдох пиксел.
 */
const PX_PER_PARTICLE = 900;

/**
 * ХУРДНЫ ХАРАГДАЦЫН КОЭФФИЦИЕНТ — (м/с) → пиксел/фрейм.
 *
 * 1.6 нь 2 м/с урсгалыг ~3.2 px/фрейм (≈96 px/сек) болгоно — 720px-ийн
 * талбайг 7 секундэд туулна, нүдэнд «гол урсаж байна» гэж уншигдана.
 */
const SPEED_GAIN = 1.6;

/**
 * Судал БҮДГЭРЭХ хурд (фрейм тутмын alpha).
 */
const FADE = 0.09;

/**
 * Тоосонцрын НАС (фрейм) — үүний дараа шинэ газар төрнө.
 */
const LIFE = 110;

/** Судал зурах ДООД хурд (м/с) — доогуур бол зогсонги ус, хөдөлгөөн зурахгүй */
const MIN_MS = 0.06;

export type WaterFlow = {
  /**
   * Дараагийн фреймийг зурж, БЭЛЭН canvas буцаана. `pos` — бутархай зүсмэл.
   * @param dt өмнөх зурсан фреймээс хойшхи ХУГАЦАА (сек).
   */
  step(pos: number, dt?: number): HTMLCanvasElement;
  /** Тоосонцрыг дахин тарааж, судлыг арилгана */
  reset(): void;
};

type P = { x: number; y: number; age: number };

/** Загварын суурь фрейм (сек) — `SPEED_GAIN`, `LIFE`, `FADE` энэ хэмнэлд тохируулагдсан */
const FRAME_REF_S = 1 / 30;

/**
 * @param fd загварчлалын үр дүн — хурдны талбар ба гүнийг эндээс уншина
 */
export function buildWaterFlow(fd: FloodData): WaterFlow {
  const GW = fd.meta.width;
  const GH = fd.meta.height;
  const SL = fd.meta.slices;
  const wet = fd.meta.drawM ?? fd.meta.wetM;
  const W = OUT_W;
  const H = Math.max(64, Math.round((OUT_W * GH) / GW));

  /** Хуримтлалын canvas — судал ЭНД үлдэнэ */
  const acc = document.createElement('canvas');
  acc.width = W;
  acc.height = H;
  const ac = acc.getContext('2d')!;

  const out: HTMLCanvasElement[] = [0, 1].map(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  });
  let flip = 0;

  const COUNT = Math.max(80, Math.round((W * H) / PX_PER_PARTICLE));
  const ps: P[] = [];

  /**
   * НОЙТОН НҮДНИЙ ЖАГСААЛТ — тоосонцор ЗӨВХӨН эндээс төрнө.
   */
  const wetBuf = new Int32Array(GW * GH);
  let wetLen = 0;
  let wetSlice = -1;
  const rebuildWet = (s: number) => {
    let n = 0;
    for (let i = 0; i < GW * GH; i++) if (fd.depth(s, i) >= wet) wetBuf[n++] = i;
    wetLen = n;
    wetSlice = s;
  };

  const spawn = (p: P) => {
    if (wetLen) {
      const k = wetBuf[(Math.random() * wetLen) | 0];
      const gx = k % GW;
      const gy = (k / GW) | 0;
      /* Нүдний ДОТОР санамсаргүй — тор шиг эгнэхгүй */
      p.x = ((gx + Math.random()) / GW) * W;
      p.y = ((gy + Math.random()) / GH) * H;
    } else {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    }
    p.age = (Math.random() * LIFE) | 0;
  };
  for (let i = 0; i < COUNT; i++) {
    const p: P = { x: 0, y: 0, age: 0 };
    spawn(p);
    ps.push(p);
  }

  const reset = () => {
    ac.clearRect(0, 0, W, H);
    wetSlice = -1;
    for (const p of ps) spawn(p);
  };

  const step = (pos: number, dt = FRAME_REF_S): HTMLCanvasElement => {
    const k = Math.max(0.2, Math.min(3, dt / FRAME_REF_S));
    const s0 = Math.max(0, Math.min(SL - 1, Math.floor(pos)));
    const s1 = Math.min(SL - 1, s0 + 1);
    const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, pos - s0));
    const w0 = 1 - w1;
    if (s0 !== wetSlice) rebuildWet(s0);

    /* ── Хуучин судлыг бүдгэрүүлнэ (өнгө НЭМЭХГҮЙ, зөвхөн alpha хасна) ── */
    ac.globalCompositeOperation = 'destination-out';
    ac.fillStyle = `rgba(0,0,0,${1 - Math.pow(1 - FADE, k)})`;
    ac.fillRect(0, 0, W, H);
    ac.globalCompositeOperation = 'source-over';

    ac.lineCap = 'round';
    for (const p of ps) {
      const gx = (p.x / W) * GW;
      const gy = (p.y / H) * GH;
      const cx = gx | 0;
      const cy = gy | 0;
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) { spawn(p); continue; }
      const i = cy * GW + cx;
      const d = fd.depth(s0, i) * w0 + fd.depth(s1, i) * w1;
      if (d < wet) { spawn(p); continue; }
      p.age += k;
      if (p.age > LIFE) { spawn(p); continue; }

      const u = fd.u(s0, i) * w0 + fd.u(s1, i) * w1;
      const v = fd.v(s0, i) * w0 + fd.v(s1, i) * w1;
      const sp = Math.hypot(u, v);
      if (sp < MIN_MS) continue;

      const x0 = p.x;
      const y0 = p.y;
      p.x += u * SPEED_GAIN * k;
      p.y -= v * SPEED_GAIN * k;

      /**
       * ХУРДАН УС = ТОД ЦАГААН (хөөс), удаан = бүдэг.
       */
      const a = Math.min(0.85, 0.18 + sp * 0.26);
      ac.strokeStyle = `rgba(255,255,255,${a})`;
      ac.lineWidth = sp > 1.5 ? 1.5 : 1.1;
      ac.beginPath();
      ac.moveTo(x0, y0);
      ac.lineTo(p.x, p.y);
      ac.stroke();
    }

    flip = 1 - flip;
    const cv = out[flip];
    const cx2 = cv.getContext('2d')!;
    cx2.clearRect(0, 0, W, H);
    cx2.drawImage(acc, 0, 0);
    return cv;
  };

  return { step, reset };
}
