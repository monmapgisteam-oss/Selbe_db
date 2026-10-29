'use client';

/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛ — хөтөч дээр бодогдсон (`uyrSim.ts`) ЦАГ ХУГАЦААНЫ цуваа:
 * зүсмэл бүрийн гүн · урсгалын вектор, зураг (растер), нүд сонгох, цуваа.
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
  /** «Нойтон» гэж тооцох доод гүн (м) — ТООЦООНД (талбай, ирэх хугацаа) */
  wetM: number;
  /**
   * ЗУРАХ доод гүн (м) — тооцооныхоос НИМГЭН.
   */
  drawM?: number;
  /** Зүсмэл тус бүрийн үзүүлэлт — ЭХ нарийвчлалаас */
  stats: { wetHa: number; peakM: number; maxSpeed: number }[];
  totalWetHa: number;
  peakDepthM: number;
  /** Загварчлалын нийт хугацаа (мин) — зөвхөн вэб дээр бодогдсонд */
  simMin?: number;
  /**
   * БОДИТООР бодогдсон хугацаа (мин) — 2026-10-09.
   */
  simulatedMin?: number;
  /** Алхмын хязгаарт хүрч `simMin`-ээс өмнө зогссон (2026-10-09) */
  truncated?: boolean;
  /** Бодитоор бодогдсон зүсмэлийн тоо — үлдсэн нь давталт (2026-10-09) */
  simulatedSlices?: number;
  /** Оролтын оргил урсац (м³/с) */
  peakQ?: number;
  /**
   * ГИДРОГРАФ — зүсмэл бүрийн оролтын урсац (м³/с).
   */
  hydroQ?: number[];
  /**
   * ГОЛЫН ОРОЛТЫН НҮДНҮҮД (торны индекс) — гидрограф ЭНДЭЭС торонд цутгана.
   */
  inlets?: number[];
  /** Маннингийн барзгар байдал [суваг, үерийн талбай] */
  manning?: [number, number];
  /**
   * ШИНЖИЛГЭЭНД ОРСОН талбай (га) — 3D mesh-ийн БОДИТ хүрээ.
   */
  domainHa?: number;
  /** Оролтын хур тунадас (мм/ц) */
  rainMmH?: number;
  /**
   * ХУР ТУНАДАС УНАХ талбай (га) — `domainHa`-аас БАГА байж болно.
   */
  rainHa?: number;
  /** Бороо MESH-ийн талбайд орж байна уу (`false` = зурсан талбайд ухарсан) */
  rainOnMesh?: boolean;
  /**
   * ГҮНИЙ ӨНГӨ ХАНАХ утга (м) — загварчлалаас ӨӨРӨӨ гарна.
   */
  rampMaxM?: number;
  /**
   * Өндрийн торны хэдэн хувь нь 3D MESH-ээс гарсан бэ (үлдсэн нь SRTM DEM).
   */
  meshPct?: number;
};

/**
 * РАСТЕРЫГ ЮУГААР БУДАХ ВЭ.
 */
export type FloodMode = 'depth' | 'speed' | 'hazard' | 'arrival';

/**
 * АЮУЛЫН ЗЭРЭГЛЭЛ — DEFRA FD2321 (Flood Risks to People, 2006) «hazard rating».
 *
 *     HR = d × (v + 0.5) + DF
 *     DF = 0    (d ≤ 0.25 м) · 0.5 (0.25 < d ≤ 0.75 м) · 1.0 (d > 0.75 м)
 */
/** Хог хаягдлын коэффициент (FD2321) — гүнээс */
export const debrisFactor = (d: number): number => (d > 0.75 ? 1 : d > 0.25 ? 0.5 : 0);
/** Аюулын үнэлгээ HR (FD2321) — гүн `d` (м), хурд `v` (м/с). Хуурай бол 0. */
export const hazardRating = (d: number, v: number): number =>
  (d > 0 ? d * (Math.max(0, v) + 0.5) + debrisFactor(d) : 0);
/** «Онц аюултай» ангиллын доод босго (HR) — ангилал, өнгөний ханалт, тайлбар НЭГ тоо */
export const HAZARD_EXTREME = 2.0;
/** Ангиллын доод босгууд (HR) — `HAZARD_CLASS`, `HAZARD_LEGEND`, растерын LUT НЭГ эх */
const HAZARD_BOUNDS = [0.75, 1.25, HAZARD_EXTREME] as const;
/** Ангиллын өнгө (бага → онц) — хуучин дөрвөн ангиллын өнгө хэвээр */
const HAZARD_HEX = ['#16a34a', '#f59e0b', '#dc2626', '#7f1d1d'] as const;
/** Ангиллын нэр — функц: модуль ачаалахад `tr` дуудахгүй (i18nLazy) */
const hazardLabels = () => [tr('Бага'), tr('Дунд'), tr('Өндөр'), tr('Онц аюултай')];
/** HR → ангиллын дугаар (0..3) */
export const hazardLevel = (hr: number): number =>
  hr >= HAZARD_BOUNDS[2] ? 3 : hr >= HAZARD_BOUNDS[1] ? 2 : hr >= HAZARD_BOUNDS[0] ? 1 : 0;
export const HAZARD_CLASS = (hr: number): { label: string; color: string } => {
  const k = hazardLevel(hr);
  return { label: hazardLabels()[k], color: HAZARD_HEX[k] };
};
/**
 * ЛЕГЕНДИЙН дөрвөн ангилал — нэр · өнгө · HR-ийн муж.
 */
export const HAZARD_LEGEND = (): { label: string; color: string; range: string }[] => {
  const L = hazardLabels();
  const [a, b, c] = HAZARD_BOUNDS;
  return [
    { label: L[0], color: HAZARD_HEX[0], range: `< ${a}` },
    { label: L[1], color: HAZARD_HEX[1], range: `${a}–${b}` },
    { label: L[2], color: HAZARD_HEX[2], range: `${b}–${c}` },
    { label: L[3], color: HAZARD_HEX[3], range: `≥ ${c}` },
  ];
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
   */
  frame: (s: number, f: number, phase: number, mode?: FloodMode) => HTMLCanvasElement;
  /** Зүсмэлийн хугацаа — эхнээсээ хэдэн минут */
  minuteAt: (s: number) => number;
  /**
   * ГАЗРЫН ӨНДӨР (м, EGM2008) торны индексээр.
   */
  terrain?: (i: number) => number;
  /**
   * ТООЦООНЫ ЁРООЛ (м) — голдрил шатааж, гүехэн хонхрыг дүүргэсэн гадаргуу
   * (`uyrSim.ts` §RIVER_BURN_M, §FILL_LIMIT_M). Гүн `depth` нь ЭНЭ ёроолоос
   * хэмжигддэг тул усны гадаргуугийн өндөр = `bed + depth`.
   */
  bed?: (i: number) => number;
  /** БҮХ хугацааны дээд гүн (м) — «хамгийн муу тохиолдол» */
  maxDepth?: (i: number) => number;
  /** БҮХ хугацааны дээд хурд (м/с) */
  maxSpeed?: (i: number) => number;
  /** Ус хэдэн минутад ирсэн бэ; хэзээ ч ирээгүй бол `null` */
  arrivalMin?: (i: number) => number | null;
  /**
   * ХУРААХ ТАЛБАЙ (га) — энэ нүд рүү хэдэн га талбайн ус урсаж ирдэг вэ.
   */
  accHa?: (i: number) => number;
  /**
   * ХУРААХ ТАЛБАЙ (га) — МАСКГҮЙ (зурсан полигоны гаднах дээд урсгалтай).
   */
  catchHa?: (i: number) => number;
  /**
   * ГОЛДРИЛ уу — тооцооны сувгийн сүлжээ (`uyrSim.ts` §streamMask ∪ шатаасан
   * голын нүд). `true` = ус энд байх нь хэвийн.
   */
  channel?: (i: number) => boolean;
  /**
   * ТООЦООНЫ МУЖИД байна уу — 2026-10-09.
   */
  inDomain?: (i: number) => boolean;
};

/**
 * ГҮНИЙ ӨНГӨНИЙ ШАТЛАЛ — цайвараас гүн хөх рүү.
 */
const DEPTH_STOPS: [number, number, number][] = [
  [40, 195, 255],
  [10, 140, 250],
  [10, 78, 232],
  [6, 36, 160],
];

/**
 * УРСАЦЫН СУМ — торны хэдэн нүд тутамд нэг сум вэ.
 */
const ARROW_STEP = 12;

/**
 * Сум зурах ДООД хурд (м/с).
 */
const ARROW_MIN_MS = 0.12;

/**
 * СУМНЫ ХЭМЖЭЭ — нүдний алхмын харьцаагаар (2026-08-29: жижигрүүлэв).
 */
const ARROW_BASE = 0.20;
const ARROW_MAX = 0.50;

const SATURATE_M = 1.5;

/**
 * УРСГАЛЫН СҮЛЖЭЭНИЙ доод хураах талбай (га) — үүнээс жижиг замыг зурахгүй.
 */
const NET_MIN_HA = 0.5;
/** Сүлжээний шугам БҮРЭН тод болох хураах талбай (га) */
const NET_FULL_HA = 60;
/** Сүлжээний ДЭЭД тунгалаг байдал (0–255) — усны өнгийг дарах ёсгүй */
const NET_MAX_A = 66;

/**
 * ХУРДНЫ ШАТЛАЛ — гүн хөхөөс цагаан ХӨӨС рүү.
 */
const SPEED_STOPS: [number, number, number][] = [
  [12, 60, 140],
  [20, 130, 210],
  [110, 200, 240],
  [240, 250, 255],
];

/**
 * ИРЭХ ХУГАЦААНЫ ШАТЛАЛ — эрт (хар ягаан) → оройтсон (цайвар шар).
 */
const ARRIVAL_STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [253, 231, 37],
];

const ramp = (stops: [number, number, number][], t: number): [number, number, number] => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  const f = x - k;
  const a = stops[k];
  const b = stops[k + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
};

export function depthColor(t: number): [number, number, number] {
  return ramp(DEPTH_STOPS, t);
}

export const SATURATE_MS = 3;
export const SATURATE_HAZ = HAZARD_EXTREME;

export const speedColor = (t: number) => ramp(SPEED_STOPS, t);
/**
 * АЮУЛЫН ӨНГӨ — `t = HR / SATURATE_HAZ` (0..1).
 */
export const hazardColor = (t: number): [number, number, number] => {
  const h = HAZARD_HEX[hazardLevel(Math.max(0, t) * SATURATE_HAZ)];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};
/** Ирэх хугацааны өнгө — `t = минут / симийн нийт минут` (0 = эрт) */
export const arrivalColor = (t: number) => ramp(ARRIVAL_STOPS, t);

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

/**
 * ТҮҮХИЙ БУФЕРЭЭС `FloodData` угсарна — layout `[зүсмэл][depth,u,v][пиксел]`.
 */
export function floodDataFromBuffer(
  meta: FloodMeta,
  buf: ArrayBuffer,
  extra?: {
    /** Газрын ЖИНХЭНЭ өндөр (м, DSM) — рельеф, налуу (`uyrTailbar.ts`) */
    terrainZ?: Float32Array;
    /** Тооцооны ёроол (м) — шатааж дүүргэсэн; усны гадаргуу = `bedZ + гүн` */
    bedZ?: Float32Array;
    /** Бүх хугацааны дээд гүн (м) */
    maxDepth?: Float32Array;
    /** Бүх хугацааны дээд хурд (м/с) */
    maxSpeed?: Float32Array;
    /** Ус ирсэн хугацаа (сек); −1 = хэзээ ч ирээгүй */
    arrivalS?: Float32Array;
    /** Хураах талбай (га) — `FlowAccumulation` */
    accHa?: Float32Array;
    /** Хураах талбай (га) — МАСКГҮЙ, попапын тайлбарт (2026-10-01) */
    catchHa?: Float32Array;
    /** Голдрилын маск (1 = суваг) — `streamMask` ∪ шатаасан гол (2026-09-21) */
    channelMask?: Uint8Array;
    /** Тооцооны муж (1 = бодогдсон) — 2026-10-09 */
    domMask?: Uint8Array;
  },
): FloodData {
  const W = meta.width;
  const H = meta.height;
  const P = W * H;
  const SL = meta.slices;
  /** Нэг зүсмэлийн байтын урт: depth(2) + u(2) + v(2) */
  const stride = P * 2 * 3;
  if (buf.byteLength < stride * SL) {
    throw new Error(tr('Үерийн файл дутуу: {0} / {1} байт', buf.byteLength, stride * SL));
  }

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
    const cy = Math.floor(((e.ymax - y) / (e.ymax - e.ymin)) * H);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    return cy * W + cx;
  };

  /* ── Зурах ── */
  const wetRaw = (meta.drawM ?? meta.wetM) * sd;
  /**
   * ХОЁР CANVAS ЭЭЛЖЛЭН (double buffering).
   */
  /**
   * ГӨЛГӨРЖҮҮЛЭЛТ (2026-08-29, хүсэлт).
   */
  const SMOOTH = 2;
  const satM = meta.rampMaxM && meta.rampMaxM > 0.2 ? meta.rampMaxM : SATURATE_M;
  const bufs: HTMLCanvasElement[] = [];
  const ctxs: CanvasRenderingContext2D[] = [];
  const imgs: ImageData[] = [];
  /** Торны түвшний завсрын canvas — `putImageData` зөвхөн энд */
  const raws: HTMLCanvasElement[] = [];
  const rawCtxs: CanvasRenderingContext2D[] = [];
  for (let b = 0; b < 2; b++) {
    const raw = document.createElement('canvas');
    raw.width = W;
    raw.height = H;
    const rcx = raw.getContext('2d')!;
    raws.push(raw);
    rawCtxs.push(rcx);
    imgs.push(rcx.createImageData(W, H));

    const c = document.createElement('canvas');
    c.width = W * SMOOTH;
    c.height = H * SMOOTH;
    const cx2 = c.getContext('2d')!;
    cx2.imageSmoothingEnabled = true;
    cx2.imageSmoothingQuality = 'high';
    bufs.push(c);
    ctxs.push(cx2);
  }
  let turn = 0;

  /**
   * ӨНГӨНИЙ ХҮСНЭГТ — гүн (мм) → RGB.
   */
  const mkLut = (fn: (t: number) => [number, number, number]) => {
    const a = new Uint8Array(256 * 3);
    for (let q = 0; q < 256; q++) {
      const c = fn(q / 255);
      a[q * 3] = c[0];
      a[q * 3 + 1] = c[1];
      a[q * 3 + 2] = c[2];
    }
    return a;
  };
  const LUTS: Record<Exclude<FloodMode, 'hazard'>, Uint8Array> = {
    depth: mkLut(depthColor),
    speed: mkLut(speedColor),
    arrival: mkLut(arrivalColor),
  };
  /**
   * АЮУЛЫН ДӨРВӨН АНГИЛЛЫН RGB — растер нь HR-ийг ШУУД ангилна (2026-10-01).
   */
  const HAZ_RGB = HAZARD_HEX.map((h) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ]);
  /** Ус ирсэн хугацаа (сек), −1 = хэзээ ч — `arrival` горимд */
  const arrS = extra?.arrivalS && extra.arrivalS.length >= P ? extra.arrivalS : null;
  /** Симийн нийт хугацаа (сек) — ирэх хугацааны өнгөний хуваарь */
  const simS = (meta.simMin ?? 60) * 60;
  /** Синусын хүснэгт — урсгалын долгионд (Math.sin нь фрейм тутамд хэдэн мянга) */
  const SIN_N = 4096;
  const SIN = new Float32Array(SIN_N);
  for (let q = 0; q < SIN_N; q++) SIN[q] = Math.sin((q / SIN_N) * Math.PI * 2);

  /**
   * УРСГАЛЫН ДОЛГИОН.
   *
   * Долгионы оргилууд урсгалын ЧИГЛЭЛД, хурдтай ПРОПОРЦИОНАЛЬ явна — хурдан
   * урсгал нүдэнд хурдан харагдана.
   */
  const WAVE_CELLS = 7;                  // долгионы урт (нүдээр) ≈ 79 м
  const FLOW_GAIN = 10;                  // харагдацын хурдасгал
  const KX = SIN_N / WAVE_CELLS;         // нүд → хүснэгтийн алхам
  /** Ирмэгийн зөөлрөлт — усны зах энэ хүртэл аажим тодорно (мм) */
  const EDGE_SOFT = 60;

  const frame = (
    s: number, f: number, phase: number, mode0: FloodMode = 'depth',
  ): HTMLCanvasElement => {
    const mode: FloodMode = mode0 === 'arrival' && !arrS ? 'depth' : mode0;
    /* `hazard` нь LUT ашигладаггүй (`HAZ_RGB`) — гүнийхийг орлуулга болгоно */
    const LUT = (mode === 'hazard' ? null : LUTS[mode]) ?? LUTS.depth;
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

    /**
     * ГҮЙЦЭТГЭЛ: гүний горимд цэвэрлэхийн ОРОНД урьдчилан бэлдсэн УРСГАЛЫН
     * СҮЛЖЭЭГ хуулна (`netPx`). Хоёулаа нэг үйлдэл; сүлжээ нь доод давхарга
     * болж, дээр нь ус зурагдана.
     */
    if (mode === 'depth' && netPx) px.set(netPx);
    else px.fill(0);

    /**
     * ── УС ИРЭХ ХУГАЦАА (2026-10-01, «хэрэглэгч: бүгдийг зас») ──
     *
     * Одоогийн агшин ХҮРТЭЛ ус хүрсэн нүд бүрийг ИРСЭН минутаар нь будна — тоглуулахад
     * «изохрон» ургаж, ус хаанаас хаашаа ямар хурдаар тархсан нь харагдана.
     */
    if (mode === 'arrival' && arrS) {
      const tNow = ((s0 + 1 + w1 * (s1 - s0)) * simS) / SL;
      for (let i = 0; i < P; i++) {
        const a = arrS[i];
        if (a < 0 || a > tNow) continue;
        const q = a >= simS ? 255 : ((a / simS) * 255) | 0;
        const p = i * 4;
        const o = q * 3;
        px[p] = LUT[o];
        px[p + 1] = LUT[o + 1];
        px[p + 2] = LUT[o + 2];
        px[p + 3] = 205;
      }
      rawCtxs[turn].putImageData(img, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(raws[turn], 0, 0, cv.width, cv.height);
      return cv;
    }

    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        /* Хугацааны ХООРОНДЫН утга — ус аажим нэмэгдэж/татарна */
        const raw = d0[i] * w0 + d1[i] * w1;
        if (raw <= wetRaw) continue;
        const m = raw / sd;

        /**
         * Урсгалын долгион — зөвхөн хөдөлгөөнтэй усанд.
         */
        let shade = 1;
        const ux = (ua[i] * w0 + ub[i] * w1) / su;
        const vy = (va[i] * w0 + vb[i] * w1) / sv;
        const sp = Math.sqrt(ux * ux + vy * vy);
        if (sp > 0.05) {
          const proj = (x * ux - y * vy) / sp;
          /**
           * Урьд нь `phase * sp * …` байсан нь фазыг «өнгөрсөн БҮХ хугацаа ×
           * ОДООГИЙН хурд» гэж боддог тул хурд фрейм хооронд бага зэрэг
           * өөрчлөгдөхөд фаз нь `Δsp · t` -ээр үсэрдэг: 20 секундын дараа
           * 0.05 м/с-ийн өөрчлөлт хэдэн бүтэн долгионы шилжилт өгч, ус
           * чичирч, заримдаа ухарч харагдана (хэрэглэгчийн «анимаци
           * үсэрдэг» шүүмж). Фазын хурд нь тогтмол болсноор долгион
           * ЖИГД урсана; хурдны мэдээллийг судал (`uyrUrsgal`) хэлнэ.
           */
          const base = proj * KX - phase * FLOW_GAIN * KX;
          const i1 = ((base | 0) % SIN_N + SIN_N) % SIN_N;
          const i2 = (((base * 0.5 + 1150) | 0) % SIN_N + SIN_N) % SIN_N;
          shade = 1 + SIN[i1] * 0.11 + SIN[i2] * 0.06;
        }

        let cr: number;
        let cg: number;
        let cb: number;
        if (mode === 'hazard') {
          const c3 = HAZ_RGB[hazardLevel(hazardRating(m, sp))];
          cr = c3[0];
          cg = c3[1];
          cb = c3[2];
        } else {
          const val = mode === 'speed' ? sp / SATURATE_MS : m / satM;
          const q = val >= 1 ? 255 : val > 0 ? (val * 255) | 0 : 0;
          const o = q * 3;
          cr = LUT[o];
          cg = LUT[o + 1];
          cb = LUT[o + 2];
        }
        /* Тунгалаг байдлын түлхүүр — үргэлж гүнээс */
        const dq = (() => {
          const td = m / satM;
          return td >= 1 ? 255 : (td * 255) | 0;
        })();

        const p = i * 4;
        /**
         * ХӨӨС — хурдан ус нь агаар холилдож ЦАЙВАР болдог.
         */
        const foam = mode === 'depth' && sp > 1.2
          ? (sp - 1.2) * 0.16 < 0.34 ? (sp - 1.2) * 0.16 : 0.34
          : 0;
        const fk = 1 - foam;
        px[p] = cr * shade * fk + 255 * foam;
        px[p + 1] = cg * shade * fk + 255 * foam;
        px[p + 2] = cb * shade * fk + 255 * foam;
        /**
         * Гүехэн ус нь БҮДЭГ — доорх ортофото уншигдана; гүн ус нь бараг цул.
         */
        const edge = raw < wetRaw + EDGE_SOFT ? (raw - wetRaw) / EDGE_SOFT : 1;
        px[p + 3] = (150 + ((dq * 95) >> 8)) * edge;
      }
    }
    /* Тор → завсрын canvas → ГӨЛГӨР томруулж гаралт руу */
    rawCtxs[turn].putImageData(img, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(raws[turn], 0, 0, cv.width, cv.height);

    /**
     * УРСАЦЫН ЧИГЛЭЛИЙН СУМ (2026-08-29, хүсэлт).
     */
    /**
     * Гүний горимд урсгалыг ТООСОНЦРЫН СУДАЛ (`uyrUrsgal.ts`) харуулдаг
     * болсон. Хоёуланг зэрэг зурвал нэг ойлголт (чиглэл) хоёр өөр
     * тэмдэглэгээгээр давхарлагдаж, ус нь цагаан тор мэт болно.
     *
     * Шинжилгээний хоёр горимд судал АСААХГҮЙ (тэнд өнгө нь хурд/аюулыг
     * заадаг тул цагаан судал утгыг дардаг) — тиймээс сум тэнд ҮЛДЭНЭ.
     */
    if (mode === 'depth') return cv;
    const AR = ARROW_STEP;
    ctx.lineWidth = Math.max(0.8, SMOOTH * 0.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = (AR >> 1); y < H; y += AR) {
      for (let x = (AR >> 1); x < W; x += AR) {
        const i = y * W + x;
        /* Хуурай ба бараг зогсонги нүдэнд сум зурахгүй — «урсгалгүй
           газар урсгал байгаа» гэсэн ХУДАЛ дүр зураг гаргана */
        if (d0[i] * w0 + d1[i] * w1 < wetRaw) continue;
        const ux = (ua[i] * w0 + ub[i] * w1) / su;
        const vy = (va[i] * w0 + vb[i] * w1) / sv;
        const sp = Math.hypot(ux, vy);
        if (sp < ARROW_MIN_MS) continue;

        const nx2 = ux / sp;
        const ny2 = -vy / sp;
        const cx0 = (x + 0.5) * SMOOTH;
        const cy0 = (y + 0.5) * SMOOTH;
        /* Урт нь хурдаас — хүчтэй урсгал урт сумтай */
        const len = Math.min(AR * SMOOTH * ARROW_MAX, (AR * SMOOTH * ARROW_BASE) * (1 + sp));
        const hx = cx0 + nx2 * len * 0.5;
        const hy = cy0 + ny2 * len * 0.5;
        const tx = cx0 - nx2 * len * 0.5;
        const ty = cy0 - ny2 * len * 0.5;
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        /* Үзүүр — 30° хоёр сэглээ */
        const hd = len * 0.40;
        const a = Math.atan2(ny2, nx2);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a - 0.5), hy - hd * Math.sin(a - 0.5));
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a + 0.5), hy - hd * Math.sin(a + 0.5));
      }
    }
    ctx.stroke();
    return cv;
  };

  /**
   * ЗҮСМЭЛИЙН МИНУТ — симийн эхнээс.
   *
   * Одоо: `simMin` байвал `(s+1)·simMin/slices` (ЯГ `snapAt`-ын дүрэм);
   * байхгүй бол `times`-ийн алхмыг нэмж ижил утга гаргана.
   */
  const t0 = Date.parse(meta.times[0]);
  const stepMin = SL > 1 ? (Date.parse(meta.times[1]) - t0) / 60000 : 0;
  const minuteAt = (s: number) => (meta.simMin != null
    ? ((s + 1) * meta.simMin) / SL
    : (Date.parse(meta.times[s]) - t0) / 60000 + stepMin);

  const series = (i: number) => ({
    depth: Array.from({ length: SL }, (_, s) => depth(s, i)),
    speed: Array.from({ length: SL }, (_, s) => speed(s, i)),
  });

  /**
   * УРСГАЛЫН СҮЛЖЭЭ — хураах талбай (га) торны дарааллаар.
   */
  const accRaw = extra?.accHa && extra.accHa.length >= P ? extra.accHa : null;

  /**
   * УРСГАЛЫН СҮЛЖЭЭ — RGBA болгож НЭГ УДАА бэлдэнэ.
   */
  const netPx = accRaw ? (() => {
    const a = new Uint8ClampedArray(P * 4);
    const denom = Math.log(NET_FULL_HA / NET_MIN_HA + 1);
    for (let i = 0; i < P; i++) {
      const v = accRaw[i];
      if (v < NET_MIN_HA) continue;
      let t = Math.log(v / NET_MIN_HA + 1) / denom;
      if (t > 1) t = 1;
      const p2 = i * 4;
      a[p2] = 96;
      a[p2 + 1] = 148;
      a[p2 + 2] = 184;
      a[p2 + 3] = t * NET_MAX_A;
    }
    return a;
  })() : null;

  const grid = (a?: Float32Array) =>
    (a && a.length >= P ? (i: number) => a[i] : undefined);
  const terrain = grid(extra?.terrainZ);
  const bed = grid(extra?.bedZ);
  const accHa = grid(extra?.accHa);
  const catchHa = grid(extra?.catchHa);
  const maxDepth = grid(extra?.maxDepth);
  const maxSpeed = grid(extra?.maxSpeed);
  const arr = extra?.arrivalS;
  const arrivalMin = arr && arr.length >= P
    ? (i: number) => (arr[i] < 0 ? null : arr[i] / 60)
    : undefined;
  const chm = extra?.channelMask;
  const channel = chm && chm.length >= P ? (i: number) => chm[i] === 1 : undefined;
  const dmk = extra?.domMask;
  const inDomain = dmk && dmk.length >= P ? (i: number) => dmk[i] === 1 : undefined;

  return {
    meta, depth, u, v, speed, series, indexAt, frame, minuteAt,
    terrain, bed, maxDepth, maxSpeed, arrivalMin, accHa, catchHa, channel, inDomain,
  };
}


/** Гүнээр эрсдэлийн зэрэглэл — попап ба хүснэгтэд */
export const depthRisk = (m: number): { label: string; color: string } =>
  m > 1.0 ? { label: tr('Өндөр'), color: 'var(--bad-ink)' }
    : m > 0.5 ? { label: tr('Дунд'), color: 'var(--warn-ink)' }
      : { label: tr('Бага'), color: 'var(--good-ink)' };
