'use client';

/**
 * САЛХИНЫ УРСГАЛЫН АНИМАЦ — тоосонцор canvas дээр, МОНГОЛ ОРНЫ хэмжээнд.
 *
 * `WIND-MODULE.md` §6-гийн `leaflet-velocity` давхаргын ОРЛУУЛАГЧ. Эх модуль нь
 * Leaflet-ийн плагин дээр тогтдог бөгөөд энэ портал ArcGIS дээр ажилладаг тул
 * плагиныг ШУУД авах боломжгүй. Оронд нь `uyr.ts`-ийн ҮЕРИЙН растерын хэв
 * загварыг дагана: canvas → `ImageElement` → `MediaLayer`. Тэр зам нь 2D, 3D,
 * BIM гуравт ижил ажилладаг нь аль хэдийн батлагдсан.
 *
 * ══════════════════ ЗАРЧИМ ══════════════════
 *
 * Тоосонцор бүр торны U/V талбар дээр «хөвж» (advection), өнгөрсөн замаа
 * бүдгэрч буй сүүл болгон үлдээнэ. Сүүл нь ГАНЦ хуримтлалын canvas дээр
 * үлддэг; фрейм тутамд түүнийг бүхэлд нь бага зэрэг ТУНГАЛАГ болгож
 * (`destination-out`) хуучин зам аажим арилна.
 *
 * ══════════════════ ПРОЕКЦ — ЯАГААД MERCATOR ДОТОР БОДДОГ ВЭ ══════════════════
 */

import { GRID_BBOX, windAt, type WindField } from '@/lib/salhiTor';

/* ══════════════════ Тохируулах параметрүүд (§10) ══════════════════ */

/**
 * РАСТЕРЫН НЯГТРАЛЫН КОЭФФИЦИЕНТ.
 */
const SS = 1.25;

/** Гаралтын canvas-ийн ӨРГӨН (px). Өндөр нь Mercator-ын харьцаагаар гарна. */
const W = Math.round(896 * SS);
/**
 * Өнгөний хуваарийн ДЭЭД хурд (м/с) — эх модулийн `maxVelocity`.
 */
export const MAX_V = 16;
/**
 * Тоосонцрын хурд — ПИКСЕЛ/ФРЕЙМ, `speed^SPEED_P` тутамд (экваторт).
 *
 *   2 м/с → 150 px · 7 м/с → 279 px  ⇒  p = ln(279/150)/ln(7/2) ≈ 0.495
 *   SCALE = 279 · cos48° / (7^0.495 · 76 фрейм) ≈ 0.935
 */
const SCALE = 0.935 * SS;

/**
 * ХУРДНЫ ИЛТГЭГЧ — сүүлийн урт нь хурдны ЯМАР зэрэгт пропорциональ вэ.
 */
const SPEED_P = 0.495;
/**
 * Тоосонцрын амьдрах хугацаа (фрейм) — эх модулийн `particleAge`.
 */
const AGE = 120;

/**
 * Сүүл арилах хурд — фрейм тутамд хасагдах alpha.
 */
const FADE = 0.045;

/* ══════════════════ Mercator ══════════════════ */

const R = 20037508.34 / 180;
const RAD = Math.PI / 180;

const mercX = (lon: number) => lon * R;
const mercY = (lat: number) => (Math.log(Math.tan((90 + lat) * (Math.PI / 360))) / RAD) * R;
/** Урвуу — Mercator y → өргөрөг */
const latOf = (y: number) => (Math.atan(Math.exp((y / R) * RAD)) / (Math.PI / 360)) - 90;

/** Талбарын БҮРЭН хүрээ — үүнээс гадуур өгөгдөл байхгүй */
export const FIELD_MERC = {
  xmin: mercX(GRID_BBOX.xmin),
  xmax: mercX(GRID_BBOX.xmax),
  ymin: mercY(GRID_BBOX.ymin),
  ymax: mercY(GRID_BBOX.ymax),
};

/** Web Mercator дөрвөлжин — зурах хүрээ */
export type MercBox = { xmin: number; ymin: number; xmax: number; ymax: number };

/**
 * ЗУРАХ ХҮРЭЭ — ХАРАГДАЦЫН муж, талбарын хүрээгээр ХАЗААРСАН.
 */
export const clampBox = (b: MercBox): MercBox => ({
  xmin: Math.max(FIELD_MERC.xmin, b.xmin),
  ymin: Math.max(FIELD_MERC.ymin, b.ymin),
  xmax: Math.min(FIELD_MERC.xmax, b.xmax),
  ymax: Math.min(FIELD_MERC.ymax, b.ymax),
});

/* ══════════════════ Өнгө ══════════════════ */

/**
 * ХУРД → ӨНГӨ. Намуухан салхи цайвар цэнхэр, хүчтэй нь цагаан.
 */
const STOPS: [number, number, number][] = [
  [90, 240, 240],
  [175, 250, 150],
  [255, 250, 120],
];

/**
 * ХУРДНЫ ӨНГӨНИЙ ТУУЗ — CSS градиент. Газрын зургийн тайлбарт.
 */
export const rampCss = (): string => {
  const rgb = (v: [number, number, number]) => `rgb(${v[0]},${v[1]},${v[2]})`;
  return `linear-gradient(90deg, ${STOPS.map(rgb).join(', ')})`;
};

const hue = (speed: number): string => {
  const t = Math.max(0, Math.min(1, speed / MAX_V));
  const k = t * 2;
  const i = k < 1 ? 0 : 1;
  const f = k - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const c = (n: number) => Math.round(a[n] + (b[n] - a[n]) * f);
  return `rgba(${c(0)},${c(1)},${c(2)},${0.9 + 0.1 * t})`;
};

/* ══════════════════ Урсгал ══════════════════ */

export type Flow = {
  /** Дараагийн фреймийг зурж, БЭЛЭН canvas буцаана */
  step(h: number): HTMLCanvasElement;
  /** Тоосонцрыг дахин тарааж, сүүлийг арилгана (огноо/цаг солиход) */
  reset(): void;
};

/** Тоосонцор — байрлал нь НОРМЧИЛСОН Mercator (0…1), нас нь фреймээр */
type P = { x: number; y: number; age: number };

/**
 * @param box ЗУРАХ хүрээ (Web Mercator). Ихэвчлэн газрын зургийн харагдац —
 *   `clampBox`-оор талбарын хүрээнд багтаасан байх ёстой.
 */
export function buildFlow(field: WindField, box: MercBox): Flow {
  const X0 = box.xmin;
  const X1 = box.xmax;
  const Y0 = box.ymin;
  const Y1 = box.ymax;
  /** Өндөр нь Mercator-ын харьцаагаар — тоосонцор сунахгүй, дугуй хөдөлнө */
  const H = Math.max(64, Math.round((W * (Y1 - Y0)) / (X1 - X0)));
  /**
   * Тоосонцрын тоо — эх модулийн `particleMultiplier` (1/240 × пиксел).
   */
  const COUNT = Math.round((W * H) / 240 / 4.5 / (SS * SS));

  /** Хуримтлалын canvas — сүүл ЭНД үлдэнэ */
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

  const spanY = Y1 - Y0;
  const lon0 = X0 / R;
  const lonSpan = (X1 - X0) / R;

  const ps: P[] = [];
  const spawn = (p: P) => {
    p.x = Math.random();
    p.y = Math.random();
    p.age = Math.floor(Math.random() * AGE);
  };
  for (let i = 0; i < COUNT; i++) {
    const p: P = { x: 0, y: 0, age: 0 };
    spawn(p);
    ps.push(p);
  }

  /* Нормчилсон Mercator → canvas пиксел (y нь УРВУУ: хойд дээшээ) */
  const px = (x: number) => x * W;
  const py = (y: number) => (1 - y) * H;

  const reset = () => {
    ac.clearRect(0, 0, W, H);
    for (const p of ps) spawn(p);
  };

  const step = (h: number): HTMLCanvasElement => {
    /* 1. Хуучин сүүлийг бүдгэрүүлнэ — өнгө НЭМЭХГҮЙ, зөвхөн alpha хасна */
    ac.globalCompositeOperation = 'destination-out';
    ac.fillStyle = `rgba(0,0,0,${FADE})`;
    ac.fillRect(0, 0, W, H);
    ac.globalCompositeOperation = 'source-over';

    /* 2. Тоосонцор бүрийг зөөж, зам нь зурагдана */
    ac.lineWidth = 1.8 * SS;
    ac.lineCap = 'round';
    ac.shadowBlur = 2.5 * SS;
    /* Толгойн радиус — зураасны хагас зузаанаас арай том, ЯЛГАРАХУЙЦ */
    const HEAD_R = 1.35 * SS;
    for (const p of ps) {
      const lon = lon0 + p.x * lonSpan;
      const lat = latOf(Y0 + p.y * spanY);
      const w = windAt(field, h, lat, lon);

      const x0 = px(p.x);
      const y0 = py(p.y);

      const mag = w.speed > 0 ? Math.pow(w.speed, SPEED_P) / w.speed : 0;
      const k = (SCALE * mag) / Math.max(0.2, Math.cos(lat * RAD));
      p.x += (w.u * k) / W;
      p.y += (w.v * k) / H;
      p.age += 1;

      /* Хүрээнээс гарсан эсвэл наслалт дууссан бол дахин төрнө */
      if (p.age > AGE || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
        spawn(p);
        continue;
      }

      const col = hue(w.speed);
      ac.strokeStyle = col;
      ac.shadowColor = col;
      const x1 = px(p.x);
      const y1 = py(p.y);
      ac.beginPath();
      ac.moveTo(x0, y0);
      ac.lineTo(x1, y1);
      ac.stroke();

      /**
       * ЧИГЛЭЛИЙН ТОЛГОЙ — урсгалын ТЭРГҮҮН үзүүрт тод цэг.
       */
      ac.globalAlpha = 0.85;
      ac.fillStyle = col;
      ac.beginPath();
      ac.arc(x1, y1, HEAD_R, 0, Math.PI * 2);
      ac.fill();
      ac.globalAlpha = 1;
    }

    /* 3. Хуримтлалыг ЭЭЛЖЛЭХ гаралт руу хуулна */
    flip ^= 1;
    const c = out[flip];
    const cc = c.getContext('2d')!;
    cc.clearRect(0, 0, W, H);
    cc.drawImage(acc, 0, 0);
    return c;
  };

  return { step, reset };
}
