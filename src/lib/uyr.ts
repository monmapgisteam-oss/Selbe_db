'use client';

/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛ — ArcGIS Flood Simulation-ы ЦАГ ХУГАЦААНЫ цуваа.
 *
 * ⚠️ ЗАРЧИМ: Flood Simulation нь «нэг зураг» БИШ — ус тархах ЯВЦ. Тиймээс
 * зүсмэл бүрийн гүн ба урсгалын вектор хоёуланг нь хадгалж, хугацаагаар нь
 * гүйлгэж харуулна (NEMA ANALYSIS WEB / `nextjs_last`-ийн `FloodScene`-тэй
 * ижил зарчим).
 *
 * ⚠️ Урьд нь (2026-08-27-ны эхний хувилбар) 12 алхмын «хамгийн их гүн»-ийг л
 * авч статик полигон болгосон нь АЛДАА байв: усны давалгааны хөдөлгөөн,
 * урсгалын хурд, чиглэл бүгд алдагдаж, «загварчлал» нь ердөө нэг толбо болж
 * хувирсан.
 *
 * ⚠️ ЭНЭ НЬ АЮУЛЫН ТҮВШНЭЭС ТУСДАА. Түвшин 1/2/3 ба хохирлын тооцоо нь голын
 * ирмэгээс татсан БУФЕР зурвасаар явна (`ersdel.ts` §FLOOD_LEVELS) — тэр нь
 * давтагдах хугацааны (5/20/100 жил) хувилбар. Энэ загварчлал нь тэдгээрийн
 * ДООР урсаж, бодит усны тархалтыг харуулна.
 *
 * ФАЙЛУУД (`tools/uyr-crf.py` үүсгэнэ):
 *
 *   · `/uyr/selbe-flood.bin`         512×512 × 12 зүсмэл × 3 хувьсагч
 *                                    [зүсмэл][хувьсагч][пиксел]
 *                                    depth uint16 (мм) · u,v int16 (см/с)
 *                                    18.9 МБ (gzip 2.0 МБ)
 *   · `/uyr/selbe-flood.json`        мета + зүсмэл тус бүрийн үзүүлэлт
 *
 * ⚠️ ТООН ҮЗҮҮЛЭЛТ (талбай, дээд гүн) нь мета доторх `stats`-аас уншигдана —
 * 512-ийн тороос ДАХИН бодож БОЛОХГҮЙ. Сийрэгжүүлэхэд MAX авдаг тул нэг
 * нойтон дэд нүд бүтэн блокийг нойтон болгож, талбай 1.6 дахин хэтэрдэг
 * (хэмжив: 144 га vs бодит 91 га). Мета доторх тоо нь ЭХ 4096 тороос.
 */

import { t as tr } from '@/lib/i18nCore';

export type FloodMeta = {
  source: string;
  width: number;
  height: number;
  slices: number;
  order: string[];
  scale: { depth: number; u: number; v: number };
  units: string;
  wkid: number;
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  /** Зурагдах торын газрын нүд (м) */
  cellM: number;
  /** Эх торын газрын нүд (м) — тоон үзүүлэлт эндээс гарсан */
  srcCellM: number;
  /** Зүсмэл бүрийн хугацаа (ISO) */
  times: string[];
  /** «Нойтон» гэж тооцох доод гүн (м) */
  wetM: number;
  /** Зүсмэл тус бүрийн үзүүлэлт — ЭХ нарийвчлалаас */
  stats: { wetHa: number; peakM: number; maxSpeed: number }[];
  totalWetHa: number;
  peakDepthM: number;
};

export type FloodData = {
  meta: FloodMeta;
  /** Гүн (м) — зүсмэл `s`, торын индекс `i` */
  depth: (s: number, i: number) => number;
  /** Урсгалын зүүн-баруун бүрэлдэхүүн (м/с) */
  u: (s: number, i: number) => number;
  /** Урсгалын хойд-урд бүрэлдэхүүн (м/с) */
  v: (s: number, i: number) => number;
  /** Урсгалын хурд (м/с) */
  speed: (s: number, i: number) => number;
  /** Нэг нүдний БҮХ зүсмэл дэх гүн ба хурд — цаг хугацааны бяцхан график */
  series: (i: number) => { depth: number[]; speed: number[] };
  /** Web Mercator цэг → торын индекс. Гадна талд `null`. */
  indexAt: (x: number, y: number) => number | null;
  /**
   * НЭГ ФРЕЙМ зурна — зүсмэл `s` ба `s+1`-ийн ХООРОНД `f` (0..1) хувиар
   * шингээж, урсгалын хөдөлгөөнийг `phase` (сек) дээр тулгуурлан нэмнэ.
   * ⚠️ ДОТООД ганц canvas-ыг дахин ашиглана — фрейм тутамд шинэ canvas
   *    үүсгэвэл 30 фрейм/сек дээр хогийн цуглуулагч ажиллаж чичирнэ.
   */
  frame: (s: number, f: number, phase: number) => HTMLCanvasElement;
  /** Зүсмэлийн хугацаа — эхнээсээ хэдэн минут */
  minuteAt: (s: number) => number;
};

const URL_BIN = '/uyr/selbe-flood.bin';
const URL_META = '/uyr/selbe-flood.json';

/**
 * ГҮНИЙ ӨНГӨНИЙ ШАТЛАЛ — цайвараас гүн хөх рүү.
 * ⚠️ NEMA-гийн `FloodScene`-ийн шатлалтай ижил: ус нь ҮРГЭЛЖ хөх өнгөтэй,
 * гүн нь ХАНАЛТААР л уншигдана. Улаан/шар нь энэ аппад ХОХИРЛЫН өнгө тул
 * усанд хэрэглэвэл хоёр өөр утга нэг өнгөнд орно.
 */
const DEPTH_STOPS: [number, number, number][] = [
  [40, 195, 255],
  [10, 140, 250],
  [10, 78, 232],
  [6, 36, 160],
];

/** ⚠️ Энэ гүнд өнгө ХАНАНА. Эх өгөгдлийн дээд гүн 2.27 м тул 1.5 м-д ханавал
 *  гүехэн (0.05–0.5 м) хэсэг нь өнгөний ихэнх хүрээг эзэлж, тархалт уншигдана. */
const SATURATE_M = 1.5;

export function depthColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (DEPTH_STOPS.length - 1);
  const k = Math.min(DEPTH_STOPS.length - 2, Math.floor(x));
  const f = x - k;
  const a = DEPTH_STOPS[k];
  const b = DEPTH_STOPS[k + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Урсгалын чиглэл — векторыг найман зүг рүү */
export const flowDir = (u: number, v: number): string => {
  const deg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  return [
    tr('Хойд'), tr('Зүүн хойд'), tr('Зүүн'), tr('Зүүн урд'),
    tr('Урд'), tr('Баруун урд'), tr('Баруун'), tr('Баруун хойд'),
  ][Math.round(deg / 45) % 8];
};

/** Векторын азимут (градус) — сумны эргэлтэд */
export const flowDeg = (u: number, v: number): number =>
  ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;

let cache: FloodData | null = null;
let pending: Promise<FloodData> | null = null;

/**
 * Загварчлалыг нэг удаа татаад кэшилнэ.
 *
 * ⚠️ 18.9 МБ — татахад хэдэн секунд болно. Тиймээс ЗӨВХӨН «Үер» хувилбар
 * сонгогдоход дуудагдана (`Ersdel.tsx`), хуудас нээгдэхэд БИШ.
 */
export async function loadFloodData(): Promise<FloodData> {
  if (cache) return cache;
  pending ??= (async () => {
    const [meta, buf] = await Promise.all([
      fetch(URL_META, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${URL_META}`);
        return r.json() as Promise<FloodMeta>;
      }),
      fetch(URL_BIN, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${URL_BIN}`);
        return r.arrayBuffer();
      }),
    ]);

    const W = meta.width;
    const H = meta.height;
    const P = W * H;
    const SL = meta.slices;
    /** Нэг зүсмэлийн байтын урт: depth(2) + u(2) + v(2) */
    const stride = P * 2 * 3;
    if (buf.byteLength < stride * SL) {
      throw new Error(tr('Үерийн файл дутуу: {0} / {1} байт', buf.byteLength, stride * SL));
    }

    /**
     * ⚠️ ЗҮСМЭЛ БҮРД тусдаа typed array — `DataView`-ээр нэг нэгээр уншвал
     * 262,144 нүдийн canvas барихад мэдэгдэхүйц удаан. Typed array нь
     * буферийг ХУУЛАХГҮЙ, зөвхөн цонх нээнэ.
     */
    const dep: Uint16Array[] = [];
    const uu: Int16Array[] = [];
    const vv: Int16Array[] = [];
    for (let s = 0; s < SL; s++) {
      const o = s * stride;
      dep.push(new Uint16Array(buf, o, P));
      uu.push(new Int16Array(buf, o + P * 2, P));
      vv.push(new Int16Array(buf, o + P * 4, P));
    }

    const sd = meta.scale.depth;
    const su = meta.scale.u;
    const sv = meta.scale.v;
    const depth = (s: number, i: number) => dep[s][i] / sd;
    const u = (s: number, i: number) => uu[s][i] / su;
    const v = (s: number, i: number) => vv[s][i] / sv;
    const speed = (s: number, i: number) => Math.hypot(u(s, i), v(s, i));

    const e = meta.extent;
    const indexAt = (x: number, y: number): number | null => {
      const cx = Math.floor(((x - e.xmin) / (e.xmax - e.xmin)) * W);
      // ⚠️ Мөр нь ХОЙНООС УРАГШ (растерын мөр 0 = хойд зах) — canvas-тай ижил
      const cy = Math.floor(((e.ymax - y) / (e.ymax - e.ymin)) * H);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
      return cy * W + cx;
    };

    /* ── Зурах ── */
    const wetRaw = meta.wetM * sd;
    /**
     * ХОЁР CANVAS ЭЭЛЖЛЭН (double buffering).
     *
     * ⚠️ ГАНЦ canvas дээр зурвал УРАГДАНА: `frame()` нь `putImageData`-г
     * СИНХРОНООР гүйцэтгэдэг ч ArcGIS текстурыг өөрийн рендерийн мөчлөгт,
     * ХОЖИМ уншина. Дараагийн фрейм ижил canvas дээр бичигдвэл өмнөх
     * `ImageElement` нь ШИНЭ агуулгыг харуулж, фрейм алгасах/чичрэх үзэгдэл
     * гарна. Ээлжилснээр ArcGIS уншиж дуустал агуулга хөдөлгөөнгүй үлдэнэ.
     *
     * ⚠️ Хоёр л хангалттай: 30 фрейм/сек дээр текстур ачаалалт дараагийн
     * фрейм ирэхээс өмнө дуусдаг (512×512 RGBA = 1 МБ).
     */
    const bufs: HTMLCanvasElement[] = [];
    const ctxs: CanvasRenderingContext2D[] = [];
    const imgs: ImageData[] = [];
    for (let b = 0; b < 2; b++) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const cx2 = c.getContext('2d')!;
      bufs.push(c);
      ctxs.push(cx2);
      imgs.push(cx2.createImageData(W, H));
    }
    let turn = 0;

    /**
     * ӨНГӨНИЙ ХҮСНЭГТ — гүн (мм) → RGB.
     * ⚠️ Фрейм тутамд 262,144 нүдэд `depthColor()` дуудвал (интерполяцийн улмаас
     * утга бүр өөр) тооцоолол нь анимацийг гацаана. 256 шатлалт хүснэгт нь
     * нүдэнд ялгагдахгүй, харин 100 дахин хурдан.
     */
    const LUT = new Uint8Array(256 * 3);
    for (let q = 0; q < 256; q++) {
      const c = depthColor(q / 255);
      LUT[q * 3] = c[0];
      LUT[q * 3 + 1] = c[1];
      LUT[q * 3 + 2] = c[2];
    }
    /** Синусын хүснэгт — урсгалын долгионд (Math.sin нь фрейм тутамд хэдэн мянга) */
    const SIN_N = 4096;
    const SIN = new Float32Array(SIN_N);
    for (let q = 0; q < SIN_N; q++) SIN[q] = Math.sin((q / SIN_N) * Math.PI * 2);

    /**
     * УРСГАЛЫН ДОЛГИОН.
     *
     * Долгионы оргилууд урсгалын ЧИГЛЭЛД, хурдтай ПРОПОРЦИОНАЛЬ явна — хурдан
     * урсгал нүдэнд хурдан харагдана.
     *
     * ⚠️ ХЭТРҮҮЛЭГ ил хэлье: бодит масштабаар 2 м/с урсгал нь 79 м долгионыг
     * 40 секундэд туулах ба дэлгэц дээр бараг хөдөлгөөнгүй харагдана. Тиймээс
     * харагдацын коэффициент (`FLOW_GAIN`) хэрэглэв — ХАРЬЦАА хэвээр, зөвхөн
     * ерөнхий хэмнэл нь хурдасна. Энэ нь ХЭМЖИЛТ БИШ, зөвхөн уншигдац.
     *
     * ⚠️ ХОЁР ДАВТАМЖ нийлүүлнэ. Ганц синус нь тодорхой хэмнэлтэй «зураас» болж
     * зохиомол харагддаг; хоёр дахин урт хоёр дахь долгион нэмэхэд гадаргуу
     * жигд бус, усархаг болно.
     */
    const WAVE_CELLS = 7;                  // долгионы урт (нүдээр) ≈ 79 м
    const FLOW_GAIN = 10;                  // харагдацын хурдасгал
    const KX = SIN_N / WAVE_CELLS;         // нүд → хүснэгтийн алхам
    /** Ирмэгийн зөөлрөлт — усны зах энэ хүртэл аажим тодорно (мм) */
    const EDGE_SOFT = 60;

    const frame = (s: number, f: number, phase: number): HTMLCanvasElement => {
      turn = 1 - turn;
      const cv = bufs[turn];
      const ctx = ctxs[turn];
      const img = imgs[turn];
      const px = img.data;
      const s0 = Math.max(0, Math.min(SL - 1, s));
      const s1 = Math.min(SL - 1, s0 + 1);
      const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, f));
      const w0 = 1 - w1;
      const d0 = dep[s0];
      const d1 = dep[s1];
      const ua = uu[s0];
      const ub = uu[s1];
      const va = vv[s0];
      const vb = vv[s1];

      // ⚠️ Бүх пикселийг цэвэрлэнэ — өмнөх фреймд нойтон байсан нүд хатаж болно
      px.fill(0);

      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          /* Хугацааны ХООРОНДЫН утга — ус аажим нэмэгдэж/татарна */
          const raw = d0[i] * w0 + d1[i] * w1;
          if (raw <= wetRaw) continue;
          const m = raw / sd;
          const t = m / SATURATE_M;
          const q = t >= 1 ? 255 : (t * 255) | 0;

          /**
           * Урсгалын долгион — зөвхөн хөдөлгөөнтэй усанд.
           * ⚠️ Вектор ч ХООРОНД нь шингэнэ: зөвхөн `s0`-ийн векторыг авбал
           *    зүсмэл солигдох агшинд долгионы чиглэл ҮСРЭНГҮЙ эргэж, ус
           *    «таталт» өгсөн мэт харагдана.
           */
          let shade = 1;
          const ux = (ua[i] * w0 + ub[i] * w1) / su;
          const vy = (va[i] * w0 + vb[i] * w1) / sv;
          const sp = Math.hypot(ux, vy);
          if (sp > 0.05) {
            /* ⚠️ canvas-ийн `y` УРАГШ өсдөг тул хойд бүрэлдэхүүнийг урвуулна —
               эс бөгөөс долгион урсгалын ЭСРЭГ чиглэлд явна. */
            const proj = (x * ux - y * vy) / sp;
            const base = proj * KX - phase * sp * FLOW_GAIN * KX;
            const i1 = ((base | 0) % SIN_N + SIN_N) % SIN_N;
            const i2 = (((base * 0.5 + 1150) | 0) % SIN_N + SIN_N) % SIN_N;
            shade = 1 + SIN[i1] * 0.11 + SIN[i2] * 0.06;
          }

          const p = i * 4;
          const o = q * 3;
          px[p] = LUT[o] * shade;
          px[p + 1] = LUT[o + 1] * shade;
          px[p + 2] = LUT[o + 2] * shade;
          /**
           * Гүехэн ус нь БҮДЭГ — доорх ортофото уншигдана; гүн ус нь бараг цул.
           * ⚠️ ЗАХЫГ ЗӨӨЛРҮҮЛНЭ: босгыг давмагц бүтэн тунгалаг болговол усны
           *    ирмэг пиксел пикселээр «дэлбэрч» тархах ба хөдөлгөөн барзгар
           *    харагдана. Эхний 6 см-ийн дотор аажим тодорно.
           */
          const edge = raw < wetRaw + EDGE_SOFT ? (raw - wetRaw) / EDGE_SOFT : 1;
          px[p + 3] = (150 + ((q * 95) >> 8)) * edge;
        }
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    };

    const t0 = Date.parse(meta.times[0]);
    const minuteAt = (s: number) => (Date.parse(meta.times[s]) - t0) / 60000;

    const series = (i: number) => ({
      depth: Array.from({ length: SL }, (_, s) => depth(s, i)),
      speed: Array.from({ length: SL }, (_, s) => speed(s, i)),
    });

    cache = { meta, depth, u, v, speed, series, indexAt, frame, minuteAt };
    return cache;
  })();
  return pending;
}

/** Гүнээр эрсдэлийн зэрэглэл — попап ба хүснэгтэд */
export const depthRisk = (m: number): { label: string; color: string } =>
  m > 1.0 ? { label: tr('Өндөр'), color: 'var(--bad-ink)' }
    : m > 0.5 ? { label: tr('Дунд'), color: 'var(--warn-ink)' }
      : { label: tr('Бага'), color: 'var(--good-ink)' };
