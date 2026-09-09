'use client';

/**
 * УСНЫ ЖИНХЭНЭ ГАДАРГУУ (3D) — загварчлалын тороос полигон.
 *
 * ⚠️ ЗОРИЛГО: «дижитал ихрийн» үерийн харагдац — ус нь ХАВТГАЙ цэнхэр толбо
 * биш, ХӨНДИЙГ ДАГАЖ доошоо урсах БОДИТ гадаргуу. Тиймээс полигоныг газраас
 * тогтмол өндөрт хөвүүлэхгүй, харин нүд бүрийн УСНЫ ГАДАРГУУГИЙН ӨНДРӨӨР
 * (`z + гүн`, м) АБСОЛЮТ өндөрт тавина.
 *
 * ⚠️ ЯАГААД ЗУРВАСААР ХУВААХ ВЭ: ArcGIS-ийн полигон нь өөрийн орой бүрийн
 * `z`-тэй ч ДОТООД талбайг гурвалжлан шугаман интерполяц хийдэг. Голын хөндий
 * шиг урт, нарийн, налуу мужийг НЭГ полигон болговол гурвалжлалт нь хөндийг
 * огтолж, ус нэг үзүүрт «дүүжлэгдэнэ». Тиймээс усны гадаргууг ӨНДРИЙН
 * ЗУРВАСУУДАД (~`stepM` м) хувааж, зурвас бүрийг өөрийн тогтмол өндөрт
 * тавина — үр дүн нь налуу дагасан шатлалгүй ойролцоолол.
 *
 * ⚠️ ЭНЭ НЬ ЗӨВХӨН SceneView-д (3D · BIM). 2D-д усны өндөр утгагүй тул хуучин
 * растер (`uyr.ts` §frame) хэвээр.
 */

import type { FloodData } from '@/lib/uyr';

/** Нэг өндрийн зурвас — WM координаттай цагирагууд, тогтмол өндөр (м) */
export type WaterBand = {
  /** Усны гадаргуугийн өндөр (м, EGM2008) */
  z: number;
  /** Уг зурваст ноогдох дундаж гүн (м) — долгионы хүчийг эндээс сонгоно */
  depth: number;
  /**
   * Уг зурвас дахь ДУНДАЖ урсгалын чиглэл (градус, хойд = 0, цагийн зүүний дагуу).
   * ⚠️ Зурвас бүр ӨӨРИЙН чиглэлтэй байх ёстой: гол мурийхад долгион нь
   *    сувгаа дагах ба энэ нь «ус урсаж байна» гэдгийг 3D-д хамгийн тод
   *    хэлдэг дохио. Бүх зурваст НЭГ чиглэл өгвөл эргэлт дээр долгион нь
   *    эргийг зүсэж, нүд шууд «худал» гэж уншина.
   */
  deg: number;
  /** [цагираг][цэг][x, y] — Web Mercator */
  rings: number[][][];
};

/**
 * Хамгийн олон зурвас.
 * ⚠️ Зурвас бүр = нэг график бөгөөд SceneView бүгдийг ДАХИН гурвалжлана. 24 нь
 *    ~30 м зөрүүг 1.2 м-ийн нарийвчлалаар таслахад хангалттай; 48 байхад
 *    зүсмэл солих бүрд ~8,000 орой GPU руу дахин ачаалагдаж, анимац алхамтай
 *    болж байв (2026-09-09 хэмжив).
 */
const MAX_BANDS = 24;

/** Зурвасын ХАМГИЙН НИМГЭН зузаан (м) — үүнээс нимгэн бол шуугиан */
const MIN_STEP = 0.35;

/**
 * Зурваст ҮЛДЭХ хамгийн бага талбай (нүдээр).
 * ⚠️ 1-2 нүдний тасархай хэсгүүд нь усны «шүрших» биш, тоон шуугиан —
 *    зурвал 3D дүр зурагт цэнхэр үртэс тархана.
 */
const MIN_CELLS = 4;

/**
 * ӨНЦӨГ МУЛТЛАХ давталт (Chaikin).
 * ⚠️ Тор нь дөрвөлжин нүднээс тогтох тул цагираг нь шатлалтай гардаг. Хоёр
 *    давталт нь шатлалыг арилгаад геометрийг 1 нүднээс илүү зөөхгүй.
 */
const SMOOTH_PASSES = 2;

/**
 * ЦАГИРГИЙН ТАЛБАЙ (торны нүдээр, тэмдэгтэй).
 * ⚠️ Тэмдэг нь эргэлтийг хэлнэ: ГАДНА цагираг ба НҮХ эсрэг тэмдэгтэй.
 *    Шүүхдээ АБСОЛЮТ утгыг ав — эс бөгөөс бүх нүх шүүгдэж, ус барилгыг хучна.
 */
function ringCells(r: number[][]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * Цагираг ҮЛДЭХ доод талбай (нүдээр).
 * ⚠️ 1-2 нүдний тасархай толбо нь тоон шуугиан. Хохирлын мужид тэдгээр нь
 *    183 цагираг болж хуримтлагдаж (амьдаар хэмжив), `queryFeatures` нь
 *    хэдэн зуун нэмэлт оройг серверт илгээж, 1 нүдний шалбаагт хүрсэн
 *    барилгыг «өртсөн» гэж тоолж байв.
 */
const MIN_RING_CELLS = 3;

/** Цагирагийн шулуун дээрх илүүдэл цэгийг хасна */
function dedupeCollinear(r: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < r.length; i++) {
    const a = out[out.length - 1] ?? r[r.length - 1];
    const b = r[i];
    const c = r[(i + 1) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out.length >= 3 ? out : r;
}

/** Chaikin — булангийн «зүсэлт»; хаалттай цагирагт */
function chaikin(r: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/**
 * Маскийн ХИЛИЙГ цагираг болгож татна (нүдний ирмэгээр).
 *
 * ⚠️ Marching-squares БИШ, ИРМЭГ ХОЛБОХ арга: нойтон нүд бүрийн хуурай
 * хөрштэй хиллэдэг талыг чиглэлтэй ирмэг болгож аваад, эхлэх оройгоор нь
 * холбоно. Энэ нь нүхийг (дотор талын хуурай арал — барилга, дов) ӨӨРӨӨ
 * тусдаа цагираг болгож өгдөг тул ус барилгын дээгүүр хучихгүй.
 *
 * @returns торны ОРОЙН координатаар (vx, vy) илэрхийлсэн цагирагууд
 */
function traceRings(mask: Uint8Array, W: number, H: number): number[][][] {
  /** эхлэх орой → [төгсгөх орой, ...] */
  const next = new Map<number, number[]>();
  const key = (vx: number, vy: number) => vy * (W + 1) + vx;
  const push = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const arr = next.get(k);
    if (arr) arr.push(key(bx, by));
    else next.set(k, [key(bx, by)]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      /* ⚠️ Чиглэл нь ДОТОР ТАЛ ЗҮҮН гар талд байхаар сонгогдсон — эс бөгөөс
         цагирагууд холбогдохгүй, эсвэл нүх нь гадна талтайгаа андуурагдана. */
      if (y === 0 || !mask[(y - 1) * W + x]) push(x + 1, y, x, y);
      if (y === H - 1 || !mask[(y + 1) * W + x]) push(x, y + 1, x + 1, y + 1);
      if (x === 0 || !mask[y * W + x - 1]) push(x, y, x, y + 1);
      if (x === W - 1 || !mask[y * W + x + 1]) push(x + 1, y + 1, x + 1, y);
    }
  }
  const rings: number[][][] = [];
  for (const [start] of next) {
    for (;;) {
      const first = next.get(start);
      if (!first || !first.length) break;
      const ring: number[] = [start];
      let cur = start;
      /* ⚠️ Хамгаалалт: гэмтсэн маск дээр төгсгөлгүй давталтад орохгүй */
      for (let guard = 0; guard < W * H * 4; guard++) {
        const arr = next.get(cur);
        if (!arr || !arr.length) break;
        const nx = arr.pop()!;
        if (!arr.length) next.delete(cur);
        if (nx === start) break;
        ring.push(nx);
        cur = nx;
      }
      if (ring.length >= 4) {
        rings.push(ring.map((k) => [k % (W + 1), Math.floor(k / (W + 1))]));
      }
    }
  }
  return rings;
}

/**
 * УСНЫ ГАДАРГУУГ полигон зурвас болгож гаргана — БУТАРХАЙ агшинд.
 *
 * ⚠️ `pos` нь БҮХЭЛ зүсмэл БИШ, бутархай (жишээ нь 7.35). Хоёр зүсмэлийн
 * гүнийг ШИНГЭЭНЭ. Учир нь: зөвхөн бүхэл зүсмэл дээр шинэчилбэл усны
 * гадаргуу 0.9 секунд тутамд ҮСРЭНГҮЙ өөрчлөгдөж, «цаг алгасаж байна» гэсэн
 * харагдац өгдөг (хэрэглэгчийн 2026-09-09-ны шүүмж). Шингээснээр усны
 * түвшин ТАСРАЛТГҮЙ өснө/татарна — жинхэнэ урсацын мэдрэмж.
 *
 * @param fd     загварчлалын үр дүн (`terrain` заавал байх ёстой)
 * @param pos    бутархай зүсмэл (0 … slices−1)
 * @param minDepth зурах хамгийн бага гүн (м) — үүнээс нимгэн ус зурагдахгүй
 */
export function waterSurfaceAt(fd: FloodData, pos: number, minDepth = 0.08): WaterBand[] {
  const ter = fd.terrain;
  if (!ter) return [];
  const W = fd.meta.width;
  const H = fd.meta.height;
  const P = W * H;
  const SL = fd.meta.slices;
  const s0 = Math.max(0, Math.min(SL - 1, Math.floor(pos)));
  const s1 = Math.min(SL - 1, s0 + 1);
  const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, pos - s0));
  const w0 = 1 - w1;

  /* ── 1. Нойтон нүд ба усны гадаргуугийн өндөр ── */
  const wse = new Float32Array(P);
  const dep = new Float32Array(P);
  /* Урсгалын вектор — зурвасын дундаж чиглэлийг эндээс */
  const uu = new Float32Array(P);
  const vv = new Float32Array(P);
  const wet = new Uint8Array(P);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < P; i++) {
    const d = w1 === 0 ? fd.depth(s0, i) : fd.depth(s0, i) * w0 + fd.depth(s1, i) * w1;
    if (d < minDepth) continue;
    const w = ter(i) + d;
    wet[i] = 1;
    wse[i] = w;
    dep[i] = d;
    uu[i] = w1 === 0 ? fd.u(s0, i) : fd.u(s0, i) * w0 + fd.u(s1, i) * w1;
    vv[i] = w1 === 0 ? fd.v(s0, i) : fd.v(s0, i) * w0 + fd.v(s1, i) * w1;
    if (w < lo) lo = w;
    if (w > hi) hi = w;
  }
  if (!Number.isFinite(lo)) return [];

  /* ── 2. Өндрийн зурвас ── */
  const range = Math.max(0.01, hi - lo);
  const step = Math.max(MIN_STEP, range / MAX_BANDS);
  const nb = Math.max(1, Math.min(MAX_BANDS, Math.ceil(range / step)));

  const e = fd.meta.extent;
  const cw = (e.xmax - e.xmin) / W;
  const ch = (e.ymax - e.ymin) / H;

  const out: WaterBand[] = [];
  const mask = new Uint8Array(P);
  for (let b = 0; b < nb; b++) {
    const z0 = lo + b * step;
    const z1 = b === nb - 1 ? hi + 1e-6 : z0 + step;
    mask.fill(0);
    let n = 0;
    let zsum = 0;
    let dsum = 0;
    let usum = 0;
    let vsum = 0;
    for (let i = 0; i < P; i++) {
      if (!wet[i] || wse[i] < z0 || wse[i] >= z1) continue;
      mask[i] = 1;
      n++;
      zsum += wse[i];
      dsum += dep[i];
      usum += uu[i];
      vsum += vv[i];
    }
    if (n < MIN_CELLS) continue;
    const rings = traceRings(mask, W, H)
      .filter((r) => ringCells(r) >= MIN_RING_CELLS)
      .map((r) => {
        let pts = dedupeCollinear(r);
        for (let k = 0; k < SMOOTH_PASSES; k++) pts = chaikin(pts);
        /* ⚠️ ЭРГҮҮЛНЭ: торны мөр нь ХОЙНООС УРАГШ тул газрын зурагт хөрвүүлэхэд
           эргэлт урвуу болно. ArcGIS-д ГАДНА цагираг нь ЦАГИЙН ЗҮҮНИЙ дагуу
           байх ёстой — эргүүлэхгүй бол бүх полигон «нүх» болж алга болно. */
        pts.reverse();
        /* ⚠️ Цагирагийг ХААНА (эхний цэгийг давтана) — ArcGIS өөрөө хаадаг ч
           хаагаагүй цагирагийг зарим үед «шугам» гэж үзэж дүүргэхгүй үлдээдэг */
        const m = pts.map(([vx, vy]) => [e.xmin + vx * cw, e.ymax - vy * ch]);
        if (m.length) m.push([m[0][0], m[0][1]]);
        return m;
      })
      .filter((r) => r.length >= 4);
    if (!rings.length) continue;
    /* ⚠️ ВЕКТОРЫН нийлбэрээс өнцөг — өнцгүүдийн ДУНДЖИЙГ авбал 350° ба
       10° хоёрын дундаж 180° (эсрэг тал) болно. */
    const deg = usum === 0 && vsum === 0
      ? 180
      : (((Math.atan2(usum, vsum) * 180) / Math.PI) + 360) % 360;
    out.push({ z: zsum / n, depth: dsum / n, deg, rings });
  }
  return out;
}

/** Хуучин дуудлагатай тохирох бүрхүүл — бүхэл зүсмэл */
export const waterSurface = (fd: FloodData, s: number, minDepth = 0.08) =>
  waterSurfaceAt(fd, s, minDepth);

/**
 * ҮЕРИЙН БҮРЭН МӨР — БҮХ хугацааны усанд автсан талбайн ХИЛ.
 *
 * ⚠️ Энэ нь ХОХИРЛЫН ТООЦООНЫ муж: «шинжилгээ хийх» дарахад ямар барилга,
 * зам, шугам өртөхийг ЭНЭ полигоноор шүүнэ. Нэг агшны биш, БҮХ хугацааны
 * дээд гүнээр — үер 12-р минутад нэг гудамжийг, 40-р минутад нөгөөг авч
 * болно; хохирол хоёуланг нь тоолох ёстой.
 *
 * ⚠️ Гараар татсан БУФЕР зурвасыг ОРЛОНО. Урьд нь хохирол нь голын ирмэгээс
 * татсан зурвасаар бодогддог байсан тул зурган дээр урсаж буй ус ба улаанаар
 * тэмдэглэсэн хохирол хоёр ЗӨРДӨГ байв (хэрэглэгчийн 2026-09-09-ны шүүмж).
 *
 * @param minDepth хохиролд тооцох доод гүн (м) — 0.15 м нь хөл нэвтэрч,
 *   хаалганы босго давах гүн; түүнээс нимгэн ус эд хөрөнгийн хохирол өгөхгүй
 * @returns ArcGIS-ийн `Polygon.rings`-д шууд өгөх боломжтой цагирагууд
 */
export function floodFootprint(fd: FloodData, minDepth = 0.15): number[][][] {
  const md = fd.maxDepth;
  if (!md) return [];
  const W = fd.meta.width;
  const H = fd.meta.height;
  const mask = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (md(i) >= minDepth) { mask[i] = 1; n++; }
  }
  if (n < MIN_CELLS) return [];
  const e = fd.meta.extent;
  const cw = (e.xmax - e.xmin) / W;
  const ch = (e.ymax - e.ymin) / H;
  return traceRings(mask, W, H)
    .filter((r) => ringCells(r) >= MIN_RING_CELLS)
    .map((r) => {
      let pts = dedupeCollinear(r);
      for (let k = 0; k < SMOOTH_PASSES; k++) pts = chaikin(pts);
      pts.reverse();
      const m = pts.map(([vx, vy]) => [e.xmin + vx * cw, e.ymax - vy * ch]);
      if (m.length) m.push([m[0][0], m[0][1]]);
      return m;
    })
    .filter((r) => r.length >= 4);
}
