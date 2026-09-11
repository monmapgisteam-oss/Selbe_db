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
 *
 * ⚠️ `salhiUrsgal.ts`-ийн (салхи) зарчмыг ДАГАНА, гэхдээ ХУУЛБАР БИШ:
 *   · салхи нь 13° өргөргийг хамардаг тул Mercator-ын гажилтыг залруулдаг;
 *     энд домэйн ердөө 2.2 км тул гажилт жигд — залруулга ХЭРЭГГҮЙ.
 *   · салхи нь ҮРГЭЛЖ үлээдэг; ус нь ЗӨВХӨН нойтон нүдэнд байдаг тул
 *     тоосонцрыг зөвхөн УСАН ДЭЭР төрүүлж, хатсан газар үхүүлнэ.
 *
 * ⚠️ ХАРАНХУЙ ӨНГӨӨР БҮДГЭРҮҮЛЖ БОЛОХГҮЙ (салхины модулийн сургамж): хар
 * өнгийн бага alpha нь судлыг арилгахын оронд ХАР болгож, бохир хөшиг үүсгэнэ.
 * `destination-out` нь өнгө нэмэхгүй, зөвхөн alpha хасна.
 *
 * ⚠️ ГАНЦ CANVAS ДЭЭР ГАРАЛТ ӨГӨХГҮЙ (`uyr.ts`-ийн сургамж): `ImageElement`
 * нь canvas-ыг ХОЖИМ уншдаг тул ЭЭЛЖЛЭХ хоёр гаралтын canvas хэрэгтэй.
 */

import type { FloodData } from '@/lib/uyr';

/** Гаралтын canvas-ийн өргөн (px). Домэйн квадрат тул өндөр нь ижил. */
const OUT_W = 720;

/**
 * ТООСОНЦРЫН НЯГТ — нэг тоосонцорт ноогдох пиксел.
 *
 * ⚠️ 900 нь 720² дээр ~576 тоосонцор өгнө. Үүнээс нягт бол ус цагаан хөвсгөр
 * болж, доорх ГҮНИЙ өнгө уншигдахаа болино; сийрэг бол хөдөлгөөн мэдрэгдэхгүй.
 */
const PX_PER_PARTICLE = 900;

/**
 * ХУРДНЫ ХАРАГДАЦЫН КОЭФФИЦИЕНТ — (м/с) → пиксел/фрейм.
 *
 * ⚠️ ХЭТРҮҮЛЭГ ил хэлье. Загварчлалын 60 минутыг 22 секундэд гүйлгэдэг тул
 * ЖИНХЭНЭ масштабаар бол 2 м/с урсгал секундэд 334 м туулах ба тоосонцор
 * фрейм бүрд дэлгэцийг гаталж, судал огт үүсэхгүй. Эсрэгээр бодит цагаар
 * (2 м/с ≈ 0.6 px/фрейм) бол ус зогсонги мэт харагдана.
 *
 * 1.6 нь 2 м/с урсгалыг ~3.2 px/фрейм (≈96 px/сек) болгоно — 720px-ийн
 * талбайг 7 секундэд туулна, нүдэнд «гол урсаж байна» гэж уншигдана.
 *
 * ⚠️ ЭНЭ НЬ ХЭМЖИЛТ БИШ. Тоосонцрын ХАРЬЦАНГУЙ хурд нь зөв (хоёр дахин хурдан
 * ус хоёр дахин хурдан явна) — зөвхөн ерөнхий хэмнэл хурдасгагдсан.
 */
const SPEED_GAIN = 1.6;

/**
 * Судал БҮДГЭРЭХ хурд (фрейм тутмын alpha).
 * ⚠️ Их бол судал богиносч цэг болно; бага бол хуучин зам арилахгүй, ус
 *    цагаан тор мэт болно. 0.09 нь ~11 фреймийн сүүл өгнө.
 */
const FADE = 0.09;

/**
 * Тоосонцрын НАС (фрейм) — үүний дараа шинэ газар төрнө.
 * ⚠️ Хязгааргүй амьдруулбал бүгд урсгалын ГОЛ судалд цуглаж, талбайн ихэнх
 *    хэсэг хоосон үлдэнэ (тоосонцрын «хуримтлалын» алдаа).
 */
const LIFE = 110;

/** Судал зурах ДООД хурд (м/с) — доогуур бол зогсонги ус, хөдөлгөөн зурахгүй */
const MIN_MS = 0.06;

export type WaterFlow = {
  /** Дараагийн фреймийг зурж, БЭЛЭН canvas буцаана. `pos` — бутархай зүсмэл */
  step(pos: number): HTMLCanvasElement;
  /** Тоосонцрыг дахин тарааж, судлыг арилгана */
  reset(): void;
};

type P = { x: number; y: number; age: number };

/**
 * @param fd загварчлалын үр дүн — хурдны талбар ба гүнийг эндээс уншина
 */
export function buildWaterFlow(fd: FloodData): WaterFlow {
  const GW = fd.meta.width;
  const GH = fd.meta.height;
  const SL = fd.meta.slices;
  /* ⚠️ Судал нь ЗУРАХ босгыг дагана — энгэрийн нимгэн урсгал дээр ч
     тоосонцор амьдарч, ус хаашаа урсаж байгаа нь харагдана. */
  const wet = fd.meta.drawM ?? fd.meta.wetM;
  const W = OUT_W;
  const H = Math.max(64, Math.round((OUT_W * GH) / GW));

  /** Хуримтлалын canvas — судал ЭНД үлдэнэ */
  const acc = document.createElement('canvas');
  acc.width = W;
  acc.height = H;
  const ac = acc.getContext('2d')!;

  /* ⚠️ ЭЭЛЖЛЭХ гаралт (файлын толгойн тайлбар) */
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
   *
   * ⚠️ Санамсаргүй газар төрүүлбэл ихэнх нь хуурай газар унаж, тэр дороо
   * үхнэ — үр дүнд нь усан дээр тоосонцор бараг үлдэхгүй. Зүсмэл бүрд
   * жагсаалтыг шинэчилнэ (ус тархах тусам төрөх талбай өснө).
   */
  let wetList = new Int32Array(0);
  let wetSlice = -1;
  const rebuildWet = (s: number) => {
    const tmp: number[] = [];
    for (let i = 0; i < GW * GH; i++) if (fd.depth(s, i) >= wet) tmp.push(i);
    wetList = Int32Array.from(tmp);
    wetSlice = s;
  };

  /**
   * ⚠️ `Math.random()` нь энд ЗӨВШӨӨРӨГДӨНӨ: тоосонцрын байрлал бол
   * ХАРАГДАЦЫН чимэглэл, ХЭМЖИЛТ биш. Загварчлалын тоо (`uyrSim.ts`) нь
   * бүрэн детерминист хэвээр.
   */
  const spawn = (p: P) => {
    if (wetList.length) {
      const k = wetList[(Math.random() * wetList.length) | 0];
      const gx = k % GW;
      const gy = (k / GW) | 0;
      /* Нүдний ДОТОР санамсаргүй — тор шиг эгнэхгүй */
      p.x = ((gx + Math.random()) / GW) * W;
      p.y = ((gy + Math.random()) / GH) * H;
    } else {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    }
    /* ⚠️ Насыг САНАМСАРГҮЙ өгнө — эс бөгөөс бүх тоосонцор ЗЭРЭГ үхэж,
       анимац бүхэлдээ цохилж (pulse) харагдана. */
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

  const step = (pos: number): HTMLCanvasElement => {
    const s0 = Math.max(0, Math.min(SL - 1, Math.floor(pos)));
    const s1 = Math.min(SL - 1, s0 + 1);
    const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, pos - s0));
    const w0 = 1 - w1;
    if (s0 !== wetSlice) rebuildWet(s0);

    /* ── Хуучин судлыг бүдгэрүүлнэ (өнгө НЭМЭХГҮЙ, зөвхөн alpha хасна) ── */
    ac.globalCompositeOperation = 'destination-out';
    ac.fillStyle = `rgba(0,0,0,${FADE})`;
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
      if (++p.age > LIFE) { spawn(p); continue; }

      const u = fd.u(s0, i) * w0 + fd.u(s1, i) * w1;
      const v = fd.v(s0, i) * w0 + fd.v(s1, i) * w1;
      const sp = Math.hypot(u, v);
      if (sp < MIN_MS) continue;

      const x0 = p.x;
      const y0 = p.y;
      p.x += u * SPEED_GAIN;
      /* ⚠️ `v` нь ХОЙШ эерэг, canvas-ийн `y` нь УРАГШ өсдөг — тэмдэг урвуу */
      p.y -= v * SPEED_GAIN;

      /**
       * ХУРДАН УС = ТОД ЦАГААН (хөөс), удаан = бүдэг.
       * ⚠️ Тод байдал нь ГҮНЭЭС хамаарахгүй: гүн ус нь ГҮНИЙ растераар аль
       *    хэдийн уншигдана. Энд зөвхөн ХӨДӨЛГӨӨН.
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
