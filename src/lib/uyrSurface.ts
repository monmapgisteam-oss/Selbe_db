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
function traceRings(
  mask: Uint8Array, W: number, H: number,
  /**
   * ГҮЙЦЭТГЭЛ: зөвхөн ЭНЭ хайрцгийг гүйнэ.
   * ⚠️ Зурвас бүр дунджаар торны 1–3%-ийг эзэлдэг тул бүтэн торыг гүйх нь
   * 24 зурваст 1.1 сая дэмий уншилт болно. Хайрцаг өгөөгүй бол бүтэн тор.
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
/**
 * ДАХИН АШИГЛАХ ТҮР САН — нүд тус бүрийн массивууд.
 *
 * ⚠️ 2026-10-09: `waterSurfaceAt` нь тоглуулах үед ~8 удаа/сек дуудагддаг
 * бөгөөд дуудлага бүрд 7 ширхэг P-урттай массив (≈1 МБ) ШИНЭЭР үүсгэж
 * байсан нь GC-г байнга өдөөж анимацийг тасалдуулдаг байв. Одоо тор
 * томрох үед л дахин үүсгэнэ. JS нэг урсгалтай, функц дотроо өөрийгөө
 * дууддаггүй тул модулийн түвшний сан аюулгүй.
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
   * ⚠️ Урьд нь `terrain` нь өөрөө шатаасан ёроол байсан тул `w = ter + d` ч
   * ижил тоо гаргадаг байв — гэвч тэр `w` нь голын нүдэнд `d < burn` үед
   * ЖИНХЭНЭ рельефээс (mesh-ийн гадаргуу) доогуур орж, 3D-д гол ОГТ
   * харагддаггүй байлаа. Шатаалт нь 16.9 м-ийн дундажлалд арчигдсан голын
   * ёроолыг НӨХӨХ хиймэл засвар болохоос mesh дээр байдаг зүйл БИШ.
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
  /* ⚠️ 2026-10-09: дахин ашиглах сан — `wet`/`bandOf`-ыг доор цэвэрлэнэ;
     `wse`/`dep`/`uu`/`vv` нь зөвхөн `wet` нүдэнд уншигддаг тул цэвэрлэх шаардлагагүй.
     ⚠️ `mask` нь ЗУРВАС бүрийн төгсгөлд өөрөө 0 болдог (доорх цэвэрлэгээ). */
  const sc = scratchOf(P);
  const { wse, dep, uu, vv, wet } = sc;
  /* Урсгалын вектор — зурвасын дундаж чиглэлийг эндээс (`uu`, `vv`) */
  wet.fill(0, 0, P);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < P; i++) {
    const d = w1 === 0 ? fd.depth(s0, i) : fd.depth(s0, i) * w0 + fd.depth(s1, i) * w1;
    if (d < minDepth) continue;
    /* ⚠️ `max(bed + d, zReal)` — дээрх §математик (2026-09-21) */
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
   *
   * ⚠️ Урьд нь зурвас БҮРД бүтэн торыг гүйдэг байсан (24 × 45,000 = 1.1 сая
   * уншилт) ба `mask.fill(0)` нь дээр нь 24 × 45,000 бичилт нэмдэг байв.
   * Одоо нэг дамжилтаар нүд бүрийн зурвасын дугаарыг бодож, нийлбэрийг тэр
   * дор нь хуримтлуулна — 45,000 уншилт. Дүрслэл секундэд 8 удаа дуудагддаг
   * тул энэ нь шууд мэдрэгддэг.
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
   * ⚠️ Ингэснээр зурвасын маскийг тавих/цэвэрлэх нь O(зурвасын нүд) болно —
   * урьд нь `mask.fill(0)` + бүтэн торын хайлт нь зурвас бүрд 90,000 үйлдэл
   * шаарддаг байв.
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
  /* ⚠️ 2026-10-09: сангийн маск — traceRings нь зөвхөн [0, P) мужийг уншдаг */
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
    /* ⚠️ 2026-10-09 (аудит): маскийг `try/finally`-д цэвэрлэнэ — `traceRings`/`chaikin` шидвэл
       (жишээ нь хэт урт цагираг) сангийн маск (`sc.mask`, дараагийн дуудлагууд ДАХИН ашигладаг)
       энэ зурвасын 1-үүдтэй үлдэж, дараагийн агшны бүх зурвас хуучин нүдийг «нойтон» гэж зурдаг байв. */
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
    } finally {
      /* ⚠️ Маскийг ЭНЭ зурвасын нүдээр цэвэрлэнэ — `fill(0)` нь бүтэн тор */
      for (let k = off[b]; k < off[b + 1]; k++) mask[order[k]] = 0;
    }
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
 * ⚠️ Хаалттай цагирагт DP-г шууд хийвэл эхний ба сүүлийн цэг ИЖИЛ тул «хэрчим»
 *    нь цэг болж, бүх орой зөвхөн тэр цэгээс хэмжигдэнэ. Хоёр хагаст хуваана.
 * @returns хаалттай цагираг; хэт жижиг болвол `null`
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
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `floodFootprint` нь Chaikin-аар
 *    ХОЁР удаа гөлгөрүүлэгддэг тул орой нь торны хилийн 4 дахин олон (амьдаар
 *    хэмжвэл 3-р түвшинд 10–20 мянга). Тэр полигоныг хохирлын асуулгын
 *    `geometry` болгоход: (1) давхарга бүрд POST бие хэдэн зуун КБ, (2) сервер
 *    ба хөтчийн `intersect` бүр оройн тоотой пропорциональ удааширдаг байв.
 *    Хүлцлийг (эхлээд нүдний 1/4) хоёр дахин өсгөсөөр нийт орой `budget`-д
 *    багтмагц зогсоно. Хүлцэл нь ДӨРӨВ хүртэл (8×) л өснө — төсөвт багтаагүй
 *    ч хил эхний хүлцлийн 8 дахинаас (≈ 2 нүд) илүү хөдлөхгүй.
 * ⚠️ Цагираг бүрийг ТУСАД НЬ хялбарчилна — нүх (барилга, дов) хадгалагдана;
 *    хэт жижиг болсон цагираг (3-аас цөөн орой) хасагдана.
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
 * ⚠️ Энэ нь ХОХИРЛЫН ТООЦООНЫ муж: «шинжилгээ хийх» дарахад ямар барилга,
 * зам, шугам өртөхийг ЭНЭ полигоноор шүүнэ. Нэг агшны биш, БҮХ хугацааны
 * дээд гүнээр — үер 12-р минутад нэг гудамжийг, 40-р минутад нөгөөг авч
 * болно; хохирол хоёуланг нь тоолох ёстой.
 *
 * ⚠️ Гараар татсан БУФЕР зурвасыг ОРЛОНО. Урьд нь хохирол нь голын ирмэгээс
 * татсан зурвасаар бодогддог байсан тул зурган дээр урсаж буй ус ба улаанаар
 * тэмдэглэсэн хохирол хоёр ЗӨРДӨГ байв (хэрэглэгчийн 2026-09-09-ны шүүмж).
 *
 * @param minDepth хохиролд тооцох доод гүн (м) — `FOOTPRINT_MIN_M` (0.15) нь хөл нэвтэрч,
 *   хаалганы босго давах гүн; түүнээс нимгэн ус эд хөрөнгийн хохирол өгөхгүй
 * @returns ArcGIS-ийн `Polygon.rings`-д шууд өгөх боломжтой цагирагууд
 */
/** ⚠️ 2026-10-09 (аудит №6): НЭГ тогтмол — UI-ийн тайлбар (`Ersdel`) урьд нь `0.15`-ыг хатуу давтдаг байв */
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
