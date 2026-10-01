/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛЫН ЦӨМ — ЦЭВЭР тооцоо (DOM · ArcGIS SDK · сүлжээ · `tr()` БАЙХГҮЙ).
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `uyrSim.ts`-ийн тооцооны биеийг ЭНД
 *    салгав — загварчлал ВЭБ АЖИЛТАН (`uyrSim.worker.ts`) дотор явж, хөтчийн
 *    үндсэн урсгал (газрын зураг, гүйгч, товч) 1–3 секунд ГАЦАХАА больсон.
 *    Ажилтан байхгүй орчинд (Node тест, хуучин хөтөч) ЯГ ЭНЭ функц үндсэн урсгалд
 *    `yieldFn`-ээр амьсгал авсаар ажиллана (`uyrSim.ts` §simulateFlood).
 *
 * ⚠️ ЭНЭ ФАЙЛД `window`/`document`/`tr()`/`fetch` ОРУУЛАХГҮЙ — ажилтны багцад
 *    орж ирээд модуль ачаалах агшинд унана. Алдааны бичвэрийг дуудагч
 *    орчуулна (`SimError.code`). Өндрийн тор, голын цагираг нь ОРОЛТ — татах нь
 *    `uyrSim.ts`-ийн ажил.
 *
 * Загварын тайлбар (LISFLOOD-FP-ийн инерцийн схем, гидрограф, бороо, гарц) нь
 * өмнөх байрандаа — `uyrSim.ts`-ийн толгой тайлбар ба доорх ⚠️ тэмдэглэгээнүүд.
 */

import { fillSinks, flowAccum, streamMask } from '@/lib/uyrHydro';
import type { FloodMeta } from '@/lib/uyr';

/* ══════════════════════ Төрөл ══════════════════════ */

/**
 * ЗАГВАРЧЛАХ ТАЛБАЙ — хэрэглэгчийн зурсан полигон (Web Mercator цагирагууд).
 * ⚠️ Байвал ЗАГВАРЧЛАЛЫН ДОМЭЙН нь ЭНЭ (`uyrSim.ts` §SimArea-ийн тайлбар).
 */
export type SimArea = number[][][];

/* ⚠️ 2026-09-29 (аудит 10): `totalMin` — явцыг `minute / totalMin`-ээр бодно */
export type SimProgress = { step: number; total: number; minute: number; totalMin: number };

/** Цөмд хэрэгтэй DSM-ийн хэсэг (`uyrSim.ts` §Dsm-тэй нийцтэй) */
export type SimDsm = {
  meta: {
    source: string;
    grid: number;
    cellM: number;
    extent: { xmin: number; ymin: number; xmax: number; ymax: number };
    meshCells?: number;
  };
  z: Float32Array;
  valid: Uint8Array;
  mesh: Uint8Array;
};

/** Загварчлалын ОРОЛТ — ажилтан руу `postMessage`-ээр (structured clone) явна */
export type SimInput = {
  dsm: SimDsm;
  /** Голын полигоны цагирагууд (WM) — татагдаагүй бол `null` (шатаалтгүй) */
  river: SimArea | null;
  /** 1 цагийн хур тунадас (мм/ц) — `FLOOD_LEVELS[level].rain` */
  rain: number;
  /** Хэрэглэгчийн зурсан талбай — `null` бол бүх тор */
  area: SimArea | null;
};

/** Загварчлалын ГАРАЛТ — бүх массив нь transferable */
export type SimOutput = {
  meta: FloodMeta;
  buf: ArrayBuffer;
  extra: {
    terrainZ: Float32Array;
    bedZ: Float32Array;
    maxDepth: Float32Array;
    maxSpeed: Float32Array;
    arrivalS: Float32Array;
    accHa: Float32Array;
    catchHa: Float32Array;
    channelMask: Uint8Array;
  };
};

/**
 * ЦӨМИЙН АЛДАА — бичвэр нь КОД (`code`) + аргумент; дуудагч `tr()`-ээр орчуулна.
 * ⚠️ Ажилтнаас `postMessage`-ээр ирэхэд классын хэлбэр алдагддаг тул `code`,
 *    `arg` хоёрыг тусад нь дамжуулна (`uyrSim.worker.ts`).
 */
export class SimError extends Error {
  code: 'small';
  arg: number;
  constructor(code: 'small', arg: number) {
    super(`flood-sim:${code}:${arg}`);
    this.code = code;
    this.arg = arg;
  }
}

/** Цуцлалтын алдаа — дуудагч үүнийг алдаа гэж ҮЗҮҮЛЭХГҮЙ */
export const abortError = (): Error => {
  const err = new Error('simulateFlood cancelled');
  err.name = 'AbortError';
  return err;
};

/* ══════════════════════ Тохиргоо ══════════════════════ */
/* ⚠️ Утга бүрийн үндэслэл `uyrSim.ts`-д байсан ⚠️ тайлбартайгаа ХАМТ энд зөөгдөв. */

/** Тооцооны тор (192² ≈ 11 м) — CFL-ийн улмаас нүд жижгэрэх тусам зардал хоёр талаараа өснө */
const SIM = 192;
/** Маннинг — суваг (гөлгөр) ба үерийн талбай (хот/ургамал) */
const MANNING_CHANNEL = 0.035;
const MANNING_PLAIN = 0.065;
/** Суваг гэж үзэх доод хураах талбай (га) — ArcGIS `DeriveStreamAsRaster` */
const STREAM_HA = 2;
/** Хонхор дүүргэх дээд гүн (м) — ArcGIS `Fill`-ийн `z_limit` */
const FILL_LIMIT_M = 0.5;
/** Голдрил шатаах гүн (м) — «stream burning» */
const RIVER_BURN_M = 2.5;
const G = 9.81;
/** Урсгалын гүн үүнээс нимгэн бол урсгал тооцохгүй (тоон шуугиан) */
const H_MIN = 0.005;
/** CFL-ийн нөөц — 1-д ойртуулбал схем задарна */
const CFL = 0.6;
/** Алхмын дээд тоо — хөтөч гацахаас хамгаална */
const MAX_STEPS = 9000;
/** Загварчлалын хугацаа (мин) — БҮХ түвшинд ИЖИЛ (эрчмийн дараалал урвуу гарахгүй) */
export const SIM_MIN = 60;
/** Гидрограф — оргилд хүрэх хугацаа (нийтийн хувиар), хурц байдал, суурь урсац */
const HYDRO_PEAK_F = 0.3;
const HYDRO_SHARP = 3.2;
const HYDRO_BASE_F = 0.08;
/** Рациональ арга: сав газар (км²), урсацын коэффициент, домэйны бороо, талбайн бууралт */
const CATCHMENT_KM2 = 50;
const RUNOFF_C = 0.4;
const RAIN_C = 0.6;
const AREAL_RED = 0.7;
/** Алхмын доод урт (сек) — CFL нь ЭЗЭН; энэ нь зөвхөн мөнхийн давталтаас хамгаална */
const DT_MIN = 0.2;
/** Урсгалын дээд хурд (м/с) — тоон хамгаалалт */
const V_MAX = 8;
/** Гаралтын зүсмэл (UI-ийн цаг хугацааны гүйгчтэй ижил) */
export const SLICES = 24;
/** Хуримтлалын шинэчлэлтийн давтамж (алхмаар) */
const ACC_EVERY = 5;
/** Явц мэдээлэх / цуцлалт шалгах / (үндсэн урсгалд) амьсгал авах давтамж */
const YIELD_EVERY = 60;

/** Оргил урсац (м³/с) 1 цагийн хур тунадаснаас (мм/ц) — рациональ арга */
export function peakInflow(rainMmH: number): number {
  return 0.278 * RUNOFF_C * rainMmH * CATCHMENT_KM2 * AREAL_RED;
}

/**
 * ГИДРОГРАФИЙН урсац (м³/с) хугацаанд `t` (сек).
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ОРГИЛ НЬ ЯГ `peak`. Урьд нь
 *    `peak · (BASE + гамма)` байсан тул `t = tp` үед гамма = 1 болж оргил нь
 *    `1.08 · peak` гардаг байв — UI «97.3 м³/с оргил урсацаар бодов» гэж бичих
 *    атлаа загварт 105 м³/с цутгадаг байлаа. Одоо гамма хэсгийг `(1 − BASE)`-ээр
 *    жинлэв: эхлэл/төгсгөлд суурь урсац (`BASE·peak`), оргилд ЯГ `peak`.
 */
export function hydroQ(peak: number, t: number, totalS: number): number {
  const tp = totalS * HYDRO_PEAK_F;
  const r = Math.max(1e-6, t / tp);
  const a = HYDRO_SHARP;
  return peak * (HYDRO_BASE_F + (1 - HYDRO_BASE_F) * Math.pow(r, a) * Math.exp(a * (1 - r)));
}

/**
 * Цэг полигон дотор уу — тэгш/сондгой (even-odd) туяаны арга.
 * ⚠️ Цагираг БҮРИЙГ нэг дор тоолно: нүх нь өөрөө домэйноос ХАСАГДАНА.
 */
export function inRings(rings: SimArea, x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0];
      const yi = r[i][1];
      const xj = r[j][0];
      const yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * ГОЛЫН ОРОЛТЫН НҮДНҮҮД — голын урсац судалгааны талбайд ХААНААС орж ирэх вэ.
 * ⚠️ Дүрэм ба 2026-09-30-ны засварын түүх: `uyrSim.ts` §pickInlets-ийн тайлбар
 *    (функц нь өөрчлөгдөөгүй, зөвхөн энэ файл руу зөөгдөв).
 */
export function pickInlets(
  N: number,
  rainDom: Uint8Array,
  zfAll: Float32Array,
  accAll: Float32Array,
  riverCell: Uint8Array | null,
  valid: Uint8Array,
): number[] {
  const P = N * N;
  const INLET_R = 4;
  let nearRiver: Uint8Array | null = null;
  if (riverCell) {
    nearRiver = new Uint8Array(P);
    let inRain = false;
    for (let i = 0; i < P; i++) {
      if (!riverCell[i]) continue;
      if (rainDom[i]) inRain = true;
      const x0 = i % N;
      const y0 = (i / N) | 0;
      for (let yy = Math.max(0, y0 - 2); yy <= Math.min(N - 1, y0 + 2); yy++) {
        for (let xx = Math.max(0, x0 - 2); xx <= Math.min(N - 1, x0 + 2); xx++) nearRiver[yy * N + xx] = 1;
      }
    }
    /* Талбайд гол ороогүй — голын урсац энд орох зам БАЙХГҮЙ */
    if (!inRain) return [];
  }
  /* 1. Гадна нүд бүрийн D8 хүлээн авагч нь талбайн нүд бол ОРОХ хэмжээнд нэмнэ */
  const inflow = new Float64Array(P);
  const S2 = Math.SQRT2;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const j = y * N + x;
      if (rainDom[j] || !valid[j]) continue;
      let to = -1;
      let top = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dxx = -1; dxx <= 1; dxx++) {
          if (!dy && !dxx) continue;
          const k = j + dy * N + dxx;
          if (!valid[k] && !rainDom[k]) continue;
          const sl = (zfAll[j] - zfAll[k]) / (dy && dxx ? S2 : 1);
          if (sl > top) { top = sl; to = k; }
        }
      }
      if (to >= 0 && rainDom[to]) inflow[to] += accAll[j];
    }
  }
  const cand: { i: number; a: number }[] = [];
  for (let i = 0; i < P; i++) if (inflow[i] > 0) cand.push({ i, a: inflow[i] });
  const best = (pool: { i: number; a: number }[]): number => {
    let s = -1;
    let top = -Infinity;
    for (const c of pool) if (c.a > top) { top = c.a; s = c.i; }
    return s;
  };
  let seed = nearRiver ? best(cand.filter((c) => nearRiver![c.i])) : -1;
  if (seed < 0) seed = best(cand);
  if (seed < 0) return [];
  const sx = seed % N;
  const sy = (seed / N) | 0;
  return cand
    .map((c) => ({ i: c.i, d: Math.max(Math.abs((c.i % N) - sx), Math.abs(((c.i / N) | 0) - sy)) }))
    .filter((c) => c.d <= INLET_R)
    .sort((p1, p2) => p1.d - p2.d || p1.i - p2.i)
    .slice(0, 8)
    .map((c) => c.i);
}

/**
 * ГАРАХ УРСГАЛЫН ХЯЗГААР — нэг алхамд нүднээс БАЙГАА УСНААС илүү гарахгүй.
 * ⚠️ 2026-09-30-ны засварын тайлбар: `uyrSim.ts` §limitOutflow (функц өөрчлөгдөөгүй).
 */
export function limitOutflow(
  qx: Float32Array, qy: Float32Array, d: Float32Array, N: number, dt: number, dx: number,
): void {
  const k = dt / dx;
  for (let y = 0; y < N; y++) {
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const i = row + x;
      const di = d[i];
      if (di <= 0) continue;
      let o = 0;
      if (x < N - 1 && qx[i] > 0) o += qx[i];
      if (x > 0 && qx[i - 1] < 0) o -= qx[i - 1];
      if (y < N - 1 && qy[i] > 0) o += qy[i];
      if (y > 0 && qy[i - N] < 0) o -= qy[i - N];
      const out = o * k;
      if (out <= di) continue;
      const r = di / out;
      if (x < N - 1 && qx[i] > 0) qx[i] *= r;
      if (x > 0 && qx[i - 1] < 0) qx[i - 1] *= r;
      if (y < N - 1 && qy[i] > 0) qy[i] *= r;
      if (y > 0 && qy[i - N] < 0) qy[i - N] *= r;
    }
  }
}

/**
 * Ажилтны `postMessage`-ийн TRANSFER жагсаалт — ДАВХАРДАЛГҮЙ.
 * ⚠️ Зурсан талбайгүй үед `catchHa` нь `accHa`-тай ИЖИЛ массив (нэг буфер);
 *    жагсаалтад хоёр удаа орвол `DataCloneError` гарна.
 */
export function transferList(out: SimOutput): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>([out.buf]);
  for (const a of Object.values(out.extra)) set.add(a.buffer as ArrayBuffer);
  return [...set];
}

/* ══════════════════════ Үндсэн тооцоо ══════════════════════ */

/**
 * ҮЕРИЙГ БОДНО — гинжин хэлхээ нь `uyrSim.ts` §simulateFlood-ийн тайлбарт.
 *
 * @param hooks.onProgress явц (`YIELD_EVERY` алхам тутам)
 * @param hooks.shouldStop үнэн бол `AbortError`-оор шууд гарна
 * @param hooks.yieldFn    ҮНДСЭН урсгалд хөтөчид амьсгал өгөх (ажилтанд хэрэггүй)
 */
export async function runFloodSim(
  inp: SimInput,
  hooks: {
    onProgress?: (p: SimProgress) => void;
    shouldStop?: () => boolean;
    yieldFn?: () => Promise<void>;
  } = {},
): Promise<SimOutput> {
  const { dsm, river, area } = inp;

  /* ── 1. Тооцооны тор — DSM-ээс сийрэгжүүлнэ (блокийн ДУНДАЖ өндөр) ── */
  const G0 = dsm.meta.grid;
  const f = Math.max(1, Math.round(G0 / SIM));
  const N = Math.floor(G0 / f);
  const z = new Float32Array(N * N);
  /** ТООЦООНЫ ДОМЭЙН — 1 = өндөр мэдэгдэх (ус урсаж болно) */
  const dom = new Uint8Array(N * N);
  /** СУДАЛГААНЫ ТАЛБАЙ — 3D mesh байгаа нүд (бороо ЗӨВХӨН энд) */
  const meshCell = new Uint8Array(N * N);
  /** ГОЛЫН НҮД — голдрил шатаасан нүднүүд */
  const riverCell = new Uint8Array(N * N);
  let domCells = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      /* ⚠️ ДУНДАЖ, `min` БИШ — DSM аль хэдийн нүдний доод өндрөөр гарсан */
      let sum = 0;
      let ok = 0;
      let mh = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const k = (y * f + dy) * G0 + (x * f + dx);
          sum += dsm.z[k];
          ok += dsm.valid[k];
          mh += dsm.mesh[k];
        }
      }
      z[y * N + x] = sum / (f * f);
      /* ⚠️ ОЛОНХИЙН дүрэм — mesh-ийн ирмэг дээр «шүдтэй» домэйн үүсгэхгүй */
      dom[y * N + x] = ok * 2 >= f * f ? 1 : 0;
      meshCell[y * N + x] = mh * 2 >= f * f ? 1 : 0;
    }
  }
  const dx = dsm.meta.cellM * f;              // нүдний газрын хэмжээ (м)
  /* ⚠️ 2026-09-30: СИМИЙН ТОРНЫ БОДИТ ХҮРЭЭ — `N·f` багана (640 → 639) */
  const ext = (() => {
    const e = dsm.meta.extent;
    const k = (N * f) / G0;
    return { ...e, xmax: e.xmin + (e.xmax - e.xmin) * k, ymin: e.ymax - (e.ymax - e.ymin) * k };
  })();

  /** ХИЙМЭЛ ЗАХТАЙ ЭСЭХ — хэрэглэгч полигон зурсан уу (2026-09-15) */
  const masked = !!(area && area.length);
  /** ⚠️ 2026-09-30: МАСКГҮЙ домэйн — голын оролт ба ХУРААХ ТАЛБАЙН тайлбарт */
  const domAll = Uint8Array.from(dom);
  if (area && area.length) {
    const cw = (ext.xmax - ext.xmin) / N;
    const chh = (ext.ymax - ext.ymin) / N;
    for (let y = 0; y < N; y++) {
      const wy = ext.ymax - (y + 0.5) * chh;
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!dom[i]) continue;
        if (!inRings(area, ext.xmin + (x + 0.5) * cw, wy)) dom[i] = 0;
      }
    }
  }
  {
    let nd = 0;
    for (let i = 0; i < N * N; i++) nd += dom[i];
    domCells = nd;
  }
  /* ⚠️ Хэт жижиг домэйн дээр CFL, оролт, гарц бүгд утгагүй — ил уначихна */
  if (domCells < 200) throw new SimError('small', domCells);

  /* ── 1б. Гидрологийн гинж: шатаалт → Fill → FlowAccumulation ── */
  /* ⚠️ ЖИНХЭНЭ гадаргууг шатаахаас ӨМНӨ хуулна (2026-09-21) — `terrainZ` */
  const zReal = Float32Array.from(z);
  if (river) {
    const cw = (ext.xmax - ext.xmin) / N;
    const chh = (ext.ymax - ext.ymin) / N;
    for (let y = 0; y < N; y++) {
      const wy = ext.ymax - (y + 0.5) * chh;
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!inRings(river, ext.xmin + (x + 0.5) * cw, wy)) continue;
        riverCell[i] = 1;
        z[i] -= RIVER_BURN_M;
      }
    }
  }

  const zf = fillSinks(z, N, dom);
  /* ⚠️ ШИЙДЭЛД зөвхөн `FILL_LIMIT_M`-ээс гүехэн хонхрыг дүүргэнэ (бодит хонхор хэвээр) */
  const zSim = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) zSim[i] = Math.min(zf[i], z[i] + FILL_LIMIT_M);
  z.set(zSim);

  /* ⚠️ `zf` — БҮРЭН дүүргэсэн (хуримтлал битүү хонхроор тасрахгүй) */
  const accCells = flowAccum(zf, N, undefined, dom);
  const cellHa = (dx * dx) / 10000;
  const stream = streamMask(accCells, cellHa, STREAM_HA);
  /* ⚠️ БОДИТ ГОЛ нь хуримтлалын босгоос ҮЛ ХАМААРАН суваг (2026-09-15) */
  for (let i = 0; i < N * N; i++) if (riverCell[i]) stream[i] = 1;
  const n2Cell = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const n = stream[i] ? MANNING_CHANNEL : MANNING_PLAIN;
    n2Cell[i] = n * n;
  }

  /* ── Домэйны захын чөлөөт гарц (Manning-ийн нормаль гүн) ── */
  const outCoef = new Float32Array(N * N);
  {
    const S_MIN = 0.0005;
    const nbo = [-1, 1, -N, N];
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        if (!dom[i]) continue;
        let cc = 0;
        for (const dnb of nbo) {
          const j = i + dnb;
          const gridEdge = (dnb === -1 && x === 1) || (dnb === 1 && x === N - 2)
            || (dnb === -N && y === 1) || (dnb === N && y === N - 2);
          const outside = !dom[j] || gridEdge;
          if (!outside) continue;
          const k = i - dnb;
          if (k < 0 || k >= N * N || !dom[k]) continue;
          const sl = (z[k] - z[i]) / dx;
          /* ⚠️ ХИЙМЭЛ ЗАХ ДЭЭР УС ЗААВАЛ ГАРНА (2026-09-15) */
          if (sl <= 0 && !(masked && !gridEdge)) continue;
          cc += Math.sqrt(sl < S_MIN ? S_MIN : sl);
        }
        outCoef[i] = cc;
      }
    }
  }

  /* ── 2. Төлөв ── */
  const P = N * N;
  const d = new Float32Array(P);
  const qx = new Float32Array(P);
  const qy = new Float32Array(P);
  const totalS = SIM_MIN * 60;

  /* ── Хур тунадас унах талбай — ЗӨВХӨН mesh (2026-09-10) ── */
  const rainDom = new Uint8Array(P);
  let rainCells = 0;
  for (let i = 0; i < P; i++) {
    if (dom[i] && meshCell[i]) { rainDom[i] = 1; rainCells++; }
  }
  let rainOnMesh = true;
  if (rainCells < 100) {
    rainOnMesh = false;
    rainCells = 0;
    for (let i = 0; i < P; i++) {
      rainDom[i] = dom[i];
      rainCells += dom[i];
    }
  }

  /* ── Голын оролт — МАСКГҮЙ хуримтлалаар (`pickInlets`) ── */
  const zfAll = masked ? fillSinks(z, N, domAll) : zf;
  const accAll = masked ? flowAccum(zfAll, N, undefined, domAll) : accCells;
  const inlet = pickInlets(N, rainDom, zfAll, accAll, river ? riverCell : null, domAll);

  const inletArea = dx * dx * inlet.length;
  const qPeak = peakInflow(inp.rain);

  /* ── Гадаргуугийн бороо — гидрографтай ижил хэмнэл ── */
  const shapeAt = (tt: number) => hydroQ(1, tt, totalS);
  let shapeMean = 0;
  for (let k = 0; k < 240; k++) shapeMean += shapeAt(((k + 0.5) / 240) * totalS);
  shapeMean /= 240;
  const rainTotalM = (RAIN_C * inp.rain * (SIM_MIN / 60)) / 1000;
  const rainRate = (tt: number) => (rainTotalM / totalS) * (shapeAt(tt) / shapeMean);

  const out: { d: Float32Array; u: Float32Array; v: Float32Array }[] = [];
  const snapAt = Array.from({ length: SLICES }, (_, i) => ((i + 1) / SLICES) * totalS);
  let snap = 0;

  /* ── Хуримтлагдсан гаралт — дээд гүн · дээд хурд · ирэх хугацаа ── */
  const maxD = new Float32Array(P);
  const maxS = new Float32Array(P);
  const arrival = new Float32Array(P).fill(-1);
  const wetTh = 0.05;
  const drawTh = 0.02;

  let t = 0;
  let step = 0;
  const qSeries: number[] = [];

  const rainList = new Int32Array(rainCells);
  {
    let k = 0;
    for (let i = 0; i < P; i++) if (rainDom[i]) rainList[k++] = i;
  }
  const outList: number[] = [];
  for (let i = 0; i < P; i++) if (outCoef[i] > 0) outList.push(i);
  const outIdx = Int32Array.from(outList);
  const outsideIdx = Int32Array.from(
    (() => { const a: number[] = []; for (let i = 0; i < P; i++) if (!dom[i]) a.push(i); return a; })(),
  );
  const edgeIdx = (() => {
    const a: number[] = [];
    for (let x = 0; x < N; x++) { a.push(x); a.push((N - 1) * N + x); }
    for (let y = 1; y < N - 1; y++) { a.push(y * N); a.push(y * N + N - 1); }
    return Int32Array.from(a);
  })();

  let hMax = 0;
  while (t < totalS && step < MAX_STEPS) {
    const dt = Math.min(
      totalS - t,
      Math.max(DT_MIN, Math.min(6, (CFL * dx) / Math.sqrt(G * Math.max(0.02, hMax)))),
    );

    /* ── Голын оролт — гидрографаар (алхмын дунд) ── */
    if (inlet.length) {
      const q = hydroQ(qPeak, t + dt / 2, totalS);
      const add = (q / inletArea) * dt;
      for (const i of inlet) d[i] += add;
    }

    /* ── Гадаргуугийн бороо ── */
    {
      const add = rainRate(t + dt / 2) * dt;
      if (add > 0) for (let k = 0; k < rainList.length; k++) d[rainList[k]] += add;
    }

    /* ── Урсгал: x ── */
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N - 1; x++) {
        const i = y * N + x;
        const j = i + 1;
        const di = d[i];
        const dj = d[j];
        if (di === 0 && dj === 0) { qx[i] = 0; continue; }
        const wi = z[i] + di;
        const wj = z[j] + dj;
        const hf = Math.max(wi, wj) - Math.max(z[i], z[j]);
        if (hf <= H_MIN) { qx[i] = 0; continue; }
        const s = (wi - wj) / dx;
        const q0 = qx[i];
        let q = (q0 + G * hf * dt * s)
          / (1 + (G * dt * (n2Cell[i] + n2Cell[j]) * 0.5 * Math.abs(q0))
            / (hf * hf * Math.cbrt(hf)));
        const lim = hf * V_MAX;
        if (q > lim) q = lim; else if (q < -lim) q = -lim;
        const av = (q > 0 ? d[i] : d[j]) * dx / dt;
        if (q > av) q = av; else if (q < -av) q = -av;
        qx[i] = q;
      }
    }
    /* ── Урсгал: y ── */
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const j = i + N;
        const di = d[i];
        const dj = d[j];
        if (di === 0 && dj === 0) { qy[i] = 0; continue; }
        const wi = z[i] + di;
        const wj = z[j] + dj;
        const hf = Math.max(wi, wj) - Math.max(z[i], z[j]);
        if (hf <= H_MIN) { qy[i] = 0; continue; }
        const s = (wi - wj) / dx;
        const q0 = qy[i];
        let q = (q0 + G * hf * dt * s)
          / (1 + (G * dt * (n2Cell[i] + n2Cell[j]) * 0.5 * Math.abs(q0))
            / (hf * hf * Math.cbrt(hf)));
        const lim = hf * V_MAX;
        if (q > lim) q = lim; else if (q < -lim) q = -lim;
        const av = (q > 0 ? d[i] : d[j]) * dx / dt;
        if (q > av) q = av; else if (q < -av) q = -av;
        qy[i] = q;
      }
    }

    /* ⚠️ 2026-09-30: нүд бүрийн ГАРАХ нийлбэр ≤ байгаа ус */
    limitOutflow(qx, qy, d, N, dt, dx);

    /* ── Гүний шинэчлэл (дотоод хэсэг + ирмэг тусдаа) ── */
    const c = dt / dx;
    let hNext = 0;
    for (let y = 1; y < N - 1; y++) {
      const row = y * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        const nd = d[i] + (qx[i - 1] - qx[i] + qy[i - N] - qy[i]) * c;
        const v = nd > 0 ? (nd < 50 ? nd : 50) : 0;
        d[i] = v;
        if (v > hNext) hNext = v;
      }
    }
    for (let k = 0; k < edgeIdx.length; k++) {
      const i = edgeIdx[k];
      const x = i % N;
      const y = (i / N) | 0;
      let dv = 0;
      if (x > 0) dv += qx[i - 1];
      if (x < N - 1) dv -= qx[i];
      if (y > 0) dv += qy[i - N];
      if (y < N - 1) dv -= qy[i];
      const nd = d[i] + dv * c;
      const v = nd > 0 ? (nd < 50 ? nd : 50) : 0;
      d[i] = v;
      if (v > hNext) hNext = v;
    }

    /* ── Чөлөөт гарц ── */
    for (let k = 0; k < outIdx.length; k++) {
      const i = outIdx[k];
      const cc = outCoef[i];
      const h = d[i];
      if (h <= H_MIN) continue;
      const q = (h * Math.cbrt(h * h) * cc) / Math.sqrt(n2Cell[i]);
      let dd = (q * dt) / dx;
      if (dd > h * 0.5) dd = h * 0.5;
      d[i] = h - dd;
    }
    for (let x = 0; x < N; x++) { d[x] = 0; d[(N - 1) * N + x] = 0; }
    for (let y = 0; y < N; y++) { d[y * N] = 0; d[y * N + N - 1] = 0; }
    for (let k = 0; k < outsideIdx.length; k++) d[outsideIdx[k]] = 0;

    hMax = hNext;
    t += dt;
    step++;

    /* ── Хуримтлал: дээд гүн · дээд хурд · ирэх хугацаа ── */
    if (step % ACC_EVERY === 0 || t >= totalS) {
      for (let i = 0; i < P; i++) {
        const h = d[i];
        if (h < drawTh) continue;
        if (h > maxD[i]) maxD[i] = h;
        if (h >= wetTh && arrival[i] < 0) arrival[i] = t;
        const ax = ((i % N) > 0 ? qx[i - 1] : 0) + qx[i];
        const ay = (i >= N ? qy[i - N] : 0) + qy[i];
        const sp = Math.sqrt(ax * ax + ay * ay) / (2 * h);
        if (sp > maxS[i]) maxS[i] = sp > V_MAX ? V_MAX : sp;
      }
    }

    /* ── Агшин хадгалах ── */
    while (snap < SLICES && t >= snapAt[snap]) {
      const sd = new Float32Array(P);
      const su = new Float32Array(P);
      const sv = new Float32Array(P);
      for (let i = 0; i < P; i++) {
        sd[i] = d[i];
        const h = d[i] > H_MIN ? d[i] : 0;
        if (h > 0) {
          const ax = ((i % N) > 0 ? qx[i - 1] : 0) + qx[i];
          const ay = (i >= N ? qy[i - N] : 0) + qy[i];
          let vx = ax / (2 * h);
          /* ⚠️ `qy` нь УРАГШ эерэг, `v` нь ХОЙШ эерэг — тэмдэг эргэнэ */
          let vy = -ay / (2 * h);
          const sp0 = Math.sqrt(vx * vx + vy * vy);
          if (sp0 > V_MAX) { const r = V_MAX / sp0; vx *= r; vy *= r; }
          su[i] = vx;
          sv[i] = vy;
        }
      }
      out.push({ d: sd, u: su, v: sv });
      qSeries.push(Math.round(hydroQ(qPeak, t, totalS) * 10) / 10);
      snap++;
    }

    if (step % YIELD_EVERY === 0) {
      if (hooks.shouldStop?.()) throw abortError();
      hooks.onProgress?.({ step, total: MAX_STEPS, minute: t / 60, totalMin: SIM_MIN });
      if (hooks.yieldFn) await hooks.yieldFn();
    }
  }
  while (out.length < SLICES) {
    const last = out[out.length - 1];
    out.push(last ?? { d: new Float32Array(P), u: new Float32Array(P), v: new Float32Array(P) });
    qSeries.push(qSeries[qSeries.length - 1] ?? 0);
  }

  /* ── 3. Буфер болгон савлана ── */
  const stride = P * 2 * 3;
  const buf = new ArrayBuffer(stride * SLICES);
  const stats: FloodMeta['stats'] = [];
  let peak = 0;
  const everWet = new Uint8Array(P);
  for (let s = 0; s < SLICES; s++) {
    const o = s * stride;
    const dv = new Uint16Array(buf, o, P);
    const uv = new Int16Array(buf, o + P * 2, P);
    const vv = new Int16Array(buf, o + P * 4, P);
    let wet = 0;
    let pk = 0;
    let mx = 0;
    for (let i = 0; i < P; i++) {
      const dd = out[s].d[i];
      dv[i] = Math.max(0, Math.min(65535, Math.round(dd * 1000)));
      uv[i] = Math.max(-32767, Math.min(32767, Math.round(out[s].u[i] * 100)));
      vv[i] = Math.max(-32767, Math.min(32767, Math.round(out[s].v[i] * 100)));
      if (dd >= 0.05) {
        wet++;
        everWet[i] = 1;
        if (dd > pk) pk = dd;
        const su2 = out[s].u[i]; const sv2 = out[s].v[i];
        const sp = Math.sqrt(su2 * su2 + sv2 * sv2);
        if (sp > mx) mx = sp;
      }
    }
    if (pk > peak) peak = pk;
    stats.push({
      wetHa: Math.round(wet * cellHa * 100) / 100,
      peakM: Math.round(pk * 1000) / 1000,
      maxSpeed: Math.round(mx * 100) / 100,
    });
  }
  let everHa = 0;
  for (let i = 0; i < P; i++) if (everWet[i]) everHa += cellHa;

  /* ── Гүний өнгөний ханалт — нойтон нүдний 95 хувийн квантиль, [0.8, 6] м ── */
  const wetDepths: number[] = [];
  for (let i = 0; i < P; i++) if (maxD[i] >= 0.05) wetDepths.push(maxD[i]);
  wetDepths.sort((a2, b2) => a2 - b2);
  const rampMax = wetDepths.length
    ? Math.max(0.8, Math.min(6, Math.round(wetDepths[Math.floor(wetDepths.length * 0.95)] * 10) / 10))
    : 1.5;

  /* ⚠️ `times[i]` нь зүсмэлийн ТӨГСГӨЛ (`uyr.ts` §minuteAt) */
  const t0 = Date.now();
  const stepMs = (totalS * 1000) / SLICES;
  const meta: FloodMeta = {
    source: `mesh DSM · ${dsm.meta.source}`,
    width: N,
    height: N,
    slices: SLICES,
    order: ['depth', 'u', 'v'],
    scale: { depth: 1000, u: 100, v: 100 },
    units: 'meters',
    wkid: 102100,
    extent: ext,
    cellM: dx,
    srcCellM: dsm.meta.cellM,
    times: Array.from({ length: SLICES }, (_, i) =>
      new Date(t0 + (i + 1) * stepMs).toISOString()),
    wetM: 0.05,
    drawM: 0.02,
    stats,
    totalWetHa: Math.round(everHa * 100) / 100,
    peakDepthM: Math.round(peak * 1000) / 1000,
    simMin: SIM_MIN,
    /* ⚠️ 2026-09-30: голын оролтгүй бол «оролтын урсац» гэж худал тоо бичихгүй */
    peakQ: inlet.length ? Math.round(qPeak * 10) / 10 : undefined,
    hydroQ: inlet.length ? qSeries.slice(0, SLICES) : undefined,
    /* ⚠️ 2026-10-01: ОРОЛТЫН НҮДНҮҮД — газрын зурагт тэмдэглэгдэнэ (`Overlay` §inlet) */
    inlets: inlet.length ? inlet.slice() : undefined,
    manning: [MANNING_CHANNEL, MANNING_PLAIN],
    domainHa: Math.round(domCells * cellHa * 10) / 10,
    rainMmH: inp.rain,
    rampMaxM: rampMax,
    rainHa: Math.round(rainCells * cellHa * 10) / 10,
    rainOnMesh,
    meshPct: dsm.meta.meshCells
      ? Math.round((dsm.meta.meshCells * 1000) / (dsm.meta.grid * dsm.meta.grid)) / 10
      : undefined,
  };

  const accHa = new Float32Array(P);
  for (let i = 0; i < P; i++) accHa[i] = accCells[i] * cellHa;
  /**
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ХУРААХ ТАЛБАЙН ТАЙЛБАР нь МАСКГҮЙ
   *    хуримтлалаас (`accAll`). Урьд нь зурсан полигоноор маскжсан `accCells`-ээс
   *    бичигддэг байсан тул полигоны дээд урсгалын ус огт тоологдохгүй — 400 га
   *    ус цуглардаг жалга «3 га» гэж ДУТУУ хэлэгддэг байв. Урсгалын сүлжээний
   *    дэвсгэр (`accHa`) нь маскжсан хэвээр: тооцоонд орсон талбайг л зурна.
   *    ⚠️ Маскгүй хуримтлал ч ӨНДРИЙН ТОРНЫ хүрээнд л — попап «тооцооны мужид»
   *    гэж бичнэ (`uyrTailbar.ts`).
   */
  let catchHa = accHa;
  if (masked) {
    catchHa = new Float32Array(P);
    for (let i = 0; i < P; i++) catchHa[i] = accAll[i] * cellHa;
  }

  return {
    meta,
    buf,
    extra: {
      terrainZ: zReal, bedZ: z, maxDepth: maxD, maxSpeed: maxS, arrivalS: arrival,
      accHa, catchHa, channelMask: stream,
    },
  };
}
