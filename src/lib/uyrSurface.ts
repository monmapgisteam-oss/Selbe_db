'use client';

/**
 * УСНЫ ЖИНХЭНЭ ГАДАРГУУ (3D) — загварчлалын тороос полигон.
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
   */
  deg: number;
  /** [цагираг][цэг][x, y] — Web Mercator */
  rings: number[][][];
};

/**
 * Хамгийн олон зурвас.
 */
const MAX_BANDS = 24;

/** Зурвасын ХАМГИЙН НИМГЭН зузаан (м) — үүнээс нимгэн бол шуугиан */
const MIN_STEP = 0.35;

/**
 * Зурваст ҮЛДЭХ хамгийн бага талбай (нүдээр).
 */
const MIN_CELLS = 4;

/**
 * ӨНЦӨГ МУЛТЛАХ давталт (Chaikin).
 */
const SMOOTH_PASSES = 2;

/**
 * ЦАГИРГИЙН ТАЛБАЙ (торны нүдээр, тэмдэгтэй).
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
 * @returns торны ОРОЙН координатаар (vx, vy) илэрхийлсэн цагирагууд
 */
function traceRings(
  mask: Uint8Array, W: number, H: number,
  /**
   * ГҮЙЦЭТГЭЛ: зөвхөн ЭНЭ хайрцгийг гүйнэ.
   */
  bx0 = 0, by0 = 0, bx1 = W - 1, by1 = H - 1,
): number[][][] {
  /** эхлэх орой → [төгсгөх орой, ...] */
  const next = new Map<number, number[]>();
  const key = (vx: number, vy: number) => vy * (W + 1) + vx;
  const push = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const arr = next.get(k);
    if (arr) arr.push(key(bx, by));
    else next.set(k, [key(bx, by)]);
  };
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if (!mask[y * W + x]) continue;
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
 * @param fd     загварчлалын үр дүн (`terrain` заавал байх ёстой)
 * @param pos    бутархай зүсмэл (0 … slices−1)
 * @param minDepth зурах хамгийн бага гүн (м) — үүнээс нимгэн ус зурагдахгүй
 */
/**
 * ДАХИН АШИГЛАХ ТҮР САН — нүд тус бүрийн массивууд.
 */
let scratch: {
  P: number;
  wse: Float32Array;
  dep: Float32Array;
  uu: Float32Array;
  vv: Float32Array;
  wet: Uint8Array;
  bandOf: Int16Array;
  mask: Uint8Array;
} | null = null;

function scratchOf(P: number) {
  if (!scratch || scratch.P < P) {
    scratch = {
      P,
      wse: new Float32Array(P),
      dep: new Float32Array(P),
      uu: new Float32Array(P),
      vv: new Float32Array(P),
      wet: new Uint8Array(P),
      bandOf: new Int16Array(P),
      mask: new Uint8Array(P),
    };
  }
  return scratch;
}

export function waterSurfaceAt(fd: FloodData, pos: number, minDepth = 0.08): WaterBand[] {
  const ter = fd.terrain;
  if (!ter) return [];
  /**
   * УСНЫ ГАДАРГУУГИЙН ӨНДӨР — МАТЕМАТИК (2026-09-21).
   *
   * Загварчлал нь голдрилыг `RIVER_BURN_M` (2.5 м) шатааж, гүехэн хонхрыг
   * дүүргэсэн ЁРООЛ `bed` дээр ажилладаг; гүн `d` нь ТЭР ёроолоос хэмжигдэнэ.
   * Тиймээс усны гадаргуугийн физик өндөр:
   *
   *     w = bed + d          (голын нүдэнд bed = zReal − burn → w = zReal + d − burn)
   *
   * Тиймээс ЗУРАХДАА жинхэнэ гадаргуугаас доош оруулахгүй:
   *
   *     w_зурах = max(bed + d, zReal)
   *
   * · эрэг давсан ус (`d > burn`): `bed + d > zReal` → физик өндрөөрөө;
   * · голдрил доторх ус (`d ≤ burn`): `zReal` түвшинд — гол «дүүрэн урсаж
   *   байна» гэж харагдана, доор нь орж алга болохгүй, дээр нь 2.5 м хөвөхгүй.
   * `bed` байхгүй бол (`terrain`-ыг ёроол гэж үзсэн тест/хуучин дата) `ter`.
   */
  const bed = fd.bed ?? ter;
  const W = fd.meta.width;
  const H = fd.meta.height;
  const P = W * H;
  const SL = fd.meta.slices;
  const s0 = Math.max(0, Math.min(SL - 1, Math.floor(pos)));
  const s1 = Math.min(SL - 1, s0 + 1);
  const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, pos - s0));
  const w0 = 1 - w1;

  /* ── 1. Нойтон нүд ба усны гадаргуугийн өндөр ── */
  const sc = scratchOf(P);
  const { wse, dep, uu, vv, wet } = sc;
  /* Урсгалын вектор — зурвасын дундаж чиглэлийг эндээс (`uu`, `vv`) */
  wet.fill(0, 0, P);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < P; i++) {
    const d = w1 === 0 ? fd.depth(s0, i) : fd.depth(s0, i) * w0 + fd.depth(s1, i) * w1;
    if (d < minDepth) continue;
    const w = Math.max(bed(i) + d, ter(i));
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

  /**
   * ГҮЙЦЭТГЭЛ: ЗУРВАСЫН ИНДЕКСИЙГ НЭГ ДАМЖИЛТААР.
   */
  const bandOf = sc.bandOf;
  bandOf.fill(-1, 0, P);
  const cnt = new Int32Array(nb);
  const zs = new Float64Array(nb);
  const ds = new Float64Array(nb);
  const us = new Float64Array(nb);
  const vs = new Float64Array(nb);
  const inv = 1 / step;
  for (let i = 0; i < P; i++) {
    if (!wet[i]) continue;
    let b = ((wse[i] - lo) * inv) | 0;
    if (b < 0) b = 0;
    else if (b >= nb) b = nb - 1;
    bandOf[i] = b;
    cnt[b]++;
    zs[b] += wse[i];
    ds[b] += dep[i];
    us[b] += uu[i];
    vs[b] += vv[i];
  }

  /**
   * ГҮЙЦЭТГЭЛ: ЗУРВАС ТУС БҮРИЙН НҮДИЙГ ангилж хадгална (counting sort).
   */
  const off = new Int32Array(nb + 1);
  for (let b = 0; b < nb; b++) off[b + 1] = off[b] + cnt[b];
  const order = new Int32Array(off[nb]);
  {
    const cur = Int32Array.from(off.subarray(0, nb));
    for (let i = 0; i < P; i++) {
      const b = bandOf[i];
      if (b >= 0) order[cur[b]++] = i;
    }
  }

  const out: WaterBand[] = [];
  const mask = sc.mask;
  for (let b = 0; b < nb; b++) {
    const n = cnt[b];
    if (n < MIN_CELLS) continue;
    const zsum = zs[b];
    const dsum = ds[b];
    const usum = us[b];
    const vsum = vs[b];
    /* Маск + ХАЙРЦАГ — зөвхөн энэ зурвасын нүдээр */
    let bx0 = W - 1;
    let by0 = H - 1;
    let bx1 = 0;
    let by1 = 0;
    let rings: number[][][];
    try {
      for (let k = off[b]; k < off[b + 1]; k++) {
        const i = order[k];
        mask[i] = 1;
        const gx = i % W;
        const gy = (i / W) | 0;
        if (gx < bx0) bx0 = gx;
        if (gx > bx1) bx1 = gx;
        if (gy < by0) by0 = gy;
        if (gy > by1) by1 = gy;
      }
      rings = traceRings(mask, W, H, bx0, by0, bx1, by1)
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
    } finally {
      for (let k = off[b]; k < off[b + 1]; k++) mask[order[k]] = 0;
    }
    if (!rings.length) continue;
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

/** Цэгээс хэрчим хүртэлх зайн КВАДРАТ */
function segDist2(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Douglas–Peucker — НЭЭЛТТЭЙ шугам, давталтаар (урт цагирагт стек халихгүй) */
function dpOpen(pts: number[][], tol: number): number[][] {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = tol * tol;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bd = tol2;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pts[a], pts[b]);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * ХААЛТТАЙ цагираг (эхний = сүүлийн) — хамгийн алс оройгоор хоёр хуваан DP.
 */
function dpRing(r: number[][], tol: number): number[][] | null {
  const closed = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  const pts = closed ? r.slice(0, -1) : r.slice();
  if (pts.length < 4) return r;
  let k = 0;
  let kd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > kd) { kd = d; k = i; }
  }
  const a = dpOpen(pts.slice(0, k + 1), tol);
  const b = dpOpen([...pts.slice(k), pts[0]], tol);
  const ring = [...a, ...b.slice(1)];
  /* хаалттай: эхний = сүүлийн; давхардсан хаалтгүйгээр 3+ ялгаатай орой */
  if (ring.length < 4) return null;
  return ring;
}

/**
 * ЦАГИРГИЙГ ОРОЙН ТӨСӨВТ БАГТААЖ ХЯЛБАРЧИЛНА (Douglas–Peucker, өсөх хүлцэл).
 *
 * @param tol    эхлэх хүлцэл (газрын нэгж — WM)
 * @param budget нийт оройн дээд тоо
 */
export function simplifyRings(
  rings: number[][][],
  { tol, budget }: { tol: number; budget: number },
): number[][][] {
  const count = (rs: number[][][]) => rs.reduce((a, r) => a + r.length, 0);
  if (count(rings) <= budget || !(tol > 0)) return rings;
  let out = rings;
  for (let k = 0, t = tol; k < 4; k++, t *= 2) {
    out = rings.map((r) => dpRing(r, t)).filter((r): r is number[][] => r != null);
    if (count(out) <= budget) break;
  }
  return out;
}

/**
 * ҮЕРИЙН БҮРЭН МӨР — БҮХ хугацааны усанд автсан талбайн ХИЛ.
 *
 * @param minDepth хохиролд тооцох доод гүн (м) — `FOOTPRINT_MIN_M` (0.15) нь хөл нэвтэрч,
 *   хаалганы босго давах гүн; түүнээс нимгэн ус эд хөрөнгийн хохирол өгөхгүй
 * @returns ArcGIS-ийн `Polygon.rings`-д шууд өгөх боломжтой цагирагууд
 */
export const FOOTPRINT_MIN_M = 0.15;
export function floodFootprint(fd: FloodData, minDepth = FOOTPRINT_MIN_M): number[][][] {
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
