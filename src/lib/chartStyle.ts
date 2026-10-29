/**
 * ГРАФИКИЙН НЭГ ЭХ — хэмжээс, тунгалаг, муруйн зам (2026-10-09).
 */

/**
 * Хэмжээс ба тунгалагийн тогтмолууд.
 */
export const CHART = {
  /** Шугамын зузаан (px) — бүх шугам/талбай/S-муруй */
  stroke: 2,
  /** Цэгийн радиус (px) — диаметр 5 (Environment `size-[5px]`) */
  markerR: 2.5,
  /** Цэгийн эргэн тойрны гадаргуун цагираг (px) — шугамтай огтлолцоход цэг ялгарна */
  ring: 2,
  /** Сонгоогүй/hover-оос гадуурх элементийн тунгалаг — БҮХ төрөлд нэг утга */
  dim: 0.35,
  /** Сонголтоор БҮДГЭРСЭН дүүргэлт (donut-ын зүсмэг) — Environment `PieChart`-ын .12 */
  dimFill: 0.12,
  /**
   * Ганц цувааны талбайн градиент — дээд/доод тунгалаг.
   */
  areaTop: 0.22,
  areaBottom: 0.02,
  /**
   * ОЛОН цувааны талбай — цуваа БҮР өөрийн тунгалаг давхаргатай (0.12 →.02).
   */
  areaMultiTop: 0.12,
  /** Төлөвлөгөө ↔ бодит хоорондох зөрүүний дүүргэлт (ногоон/улаан) */
  gapFill: 0.12,
  /**
   * Төлөвлөгөөний ТАСАРХАЙ шугам (`stroke-dasharray`), өнгө `--chart-plan`.
   */
  planDash: '4 4',
  /**
   * Шугамын зөөлөн гэрэлтэлт (drop-shadow blur, px) — `glow`.
   */
  glowBlur: 0,
  /**
   * HOVER/ФОКУСЫН ТЭМДЭГ — r 3.5 дүүргэлт + 2px гадаргуун цагираг.
   */
  hoverR: 3.5,
  haloR: 0,
  haloA: 0,
  /**
   * Босоо баганын өргөн — слотын хувь (`Series`), дээд хязгаар (px), оройн радиус (px), тунгалаг.
   */
  colW: 0.8,
  colMaxW: 44,
  colRadius: 5,
  colOpacity: 0.88,
  /** Өөр багана сонгогдсон үеийн баганын тунгалаг (Environment `BarChart`) */
  colDim: 0.18,
  /**
   * Donut — зүсмэг хоорондын `--surface` тусгаарлагч (px), дотоод радиусын харьцаа,
   * ба дотор хувь бичих доод хязгаар.
   */
  donutGap: 2,
  donutInner: 0.72,
  donutLabelMin: 0.08,
  /** S-муруйн хэвтээ тор (%) */
  grid: [0, 25, 50, 75, 100] as readonly number[],
  /** Хэвтээ баганын зузаан (px) — `Bars` (2026-10-23: Environment `row-chart-track` 5px) */
  barH: 5,
  /** 100% давхарласан зурвасын зузаан (px) ба сегмент хоорондын зай — `Stack`
      (2026-10-23: Environment `stacked-chart-track` 10px, 1px завсар) */
  stackH: 10,
  stackGap: 1,
  /** Хэмжигчийн зузаан (px) — `Meter`; `wide` хувилбар нь 8
      (2026-10-23: Environment `Meter` — `h-1.5` = 6px, булан 6px) */
  meterH: 6,
  meterWideH: 8,
  /** Хэмжигчийн төлөвлөгөөний тэмдэг — зурвасаас дээш/доош сунах (px) */
  planTickOut: 4,
} as const;

/**
 * Дугуй диаграмын (Donut) 3 хэмжээ — [диаметр, цагирагийн зузаан].
 */
export const DONUT_SIZES = {
  sm: [82, 10],
  md: [112, 15],
  lg: [128, 17],
} as const satisfies Record<string, readonly [number, number]>;
export type DonutSize = keyof typeof DONUT_SIZES;

/**
 * Environment `PieChart`-ын цагиргийн геометр — гадаад R = size/2 − 4, дотоод r = R − width
 * (`width` өгөөгүй бол .72R). Ring ч (ганц утгат PieChart) үүнийг хэрэглэнэ.
 */
export function donutGeom(size: number, width?: number): { c: number; R: number; r: number } {
  const c = size / 2;
  const R = Math.max(1, c - 4);
  const r = width != null && Number.isFinite(width) && width > 0 ? Math.max(0, R - width) : R * 0.72;
  return { c, R, r };
}

/**
 * Хувийн цагирагийн (Ring) 3 хэмжээ — диаметр. Зузаан = `ringStroke(size)`.
 */
export const RING_SIZES = {
  sm: 88,
  md: 120,
  lg: 148,
} as const;
export type RingSize = keyof typeof RING_SIZES;

/** Цагирагийн зузаан (бүхэл px). */
export const ringStroke = (size: number): number => {
  const { R, r } = donutGeom(size);
  return Math.max(1, Math.round(R - r));
};

/* ══════════════════════ Лавлах CRM загвар (2026-10-09) ══════════════════════ */

/**
 * ЗӨӨЛӨН ГЭРЭЛТЭЛТ — CSS `filter` утга (шугам, цагираг, онцолсон зүсмэг).
 */
export const glow = (color: string, blur: number = CHART.glowBlur): string =>
  `drop-shadow(0 0 ${blur}px color-mix(in srgb, ${color} var(--chart-glow, 40%), transparent))`;

/** Тоог 12 оронтой нарийвчлалд буулгана — 0.1+0.2 маягийн хөвөгч хог арилна */
const clean = (v: number) => Number(v.toPrecision(12));

/**
 * «ГОЁ» ТЭНХЛЭГИЙН ХУВААРЬ — 1 · 2 · 2.5 · 5 × 10ⁿ алхамтай, [lo, hi]-г БҮРЭН хамарна.
 */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  let a = Number.isFinite(lo) ? lo : 0;
  let b = Number.isFinite(hi) ? hi : 0;
  if (b < a) [a, b] = [b, a];
  if (b === a) {
    if (a === 0) b = 1;
    else if (a > 0) a = 0;
    else b = 0;
  }
  const raw = (b - a) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  /* Хамгийн НЯГТ алхам — шугамын тоо `count + 1`-ээс хэтрэхгүй (жиш. −15…28 → −20…30 ×10,
     ×20 биш: дээд хязгаар өгөгдлөөс хэт хол болж муруй шахагдана) */
  const fits = (st: number) => Math.ceil(clean(b / st)) - Math.floor(clean(a / st)) + 1 <= count + 1;
  const step = clean([1, 2, 2.5, 5, 10, 20].map((k) => k * mag).find(fits) ?? 20 * mag);
  const start = Math.floor(clean(a / step)) * step;
  const end = Math.ceil(clean(b / step)) * step;
  const out: number[] = [];
  for (let k = 0; k < 60; k += 1) {
    const v = clean(start + k * step);
    out.push(v);
    if (v >= end - step * 1e-9) break;
  }
  return out.length >= 2 ? out : [clean(start), clean(start + step)];
}

/** Тэнхлэгийн алхмын аравтын орны тоо — 0.25 → 2, 2.5 → 1, 20 → 0 */
export function stepDecimals(ticks: readonly number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!(step > 0)) return 0;
  for (let d = 0; d <= 6; d += 1) {
    if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) return d;
  }
  return 6;
}

/**
 * БҮХЭЛ ХУВИУД НИЙЛЭЭД ЯГ 100 — их үлдэгдлийн арга (largest remainder).
 */
export function roundPctsTo100(values: readonly number[], total?: number, decimals = 0): number[] {
  const k = 10 ** Math.max(0, Math.min(3, Math.floor(decimals)));
  const vals = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = total != null && Number.isFinite(total) && total > 0
    ? total
    : vals.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return vals.map(() => 0);
  const raw = vals.map((v) => (v / sum) * 100 * k);
  const base = raw.map((v) => Math.floor(v));
  let left = Math.round(raw.reduce((a, b) => a + b, 0)) - base.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - base[i], i] as const).sort((p, q) => q[0] - p[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return k === 1 ? base : base.map((v) => v / k);
}

/**
 * ЦАГИРГАН НУМЫН ЗАМ — 12 цагаас цагийн зүүний дагуу, `a0 → a1` (радиан).
 */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const pt = (a: number) => `${r2(cx + r * Math.sin(a))},${r2(cy - r * Math.cos(a))}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return `M${pt(0)} A${r},${r} 0 1 1 ${pt(Math.PI)} A${r},${r} 0 1 1 ${pt(Math.PI * 2 - 1e-4)}`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(a0)} A${r},${r} 0 ${large} 1 ${pt(a1)}`;
}

/* ══════════════════════ Муруйн зам ══════════════════════ */

export type Pt = { x: number; y: number };

/** Тасралтгүй нэг хэсэг — `null`-ээр тасарсан цэгүүдийн дараалал */
export type LineSeg = {
  /** SVG `d` — ганц цэгтэй бол тэг урттай `M x,y h0` (round linecap-аар цэг болно) */
  d: string;
  pts: Pt[];
  /** Ганц цэгтэй хэсэг — дуудагч ЦЭГ (marker) зурна, шугам/талбай зурахгүй */
  single: boolean;
  /** Эх массив дахь эхний ба сүүлийн индекс */
  from: number;
  to: number;
};

const ok = (p: Pt | null | undefined): p is Pt =>
  p != null && Number.isFinite(p.x) && Number.isFinite(p.y);

/** 0.01 нарийвчлал — `d` мөр богино, NaN/Infinity гарахгүй (оролтыг `ok` шүүсэн) */
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * ЗӨӨЛӨН МУРУЙН ЗАМ — МОНОТОН кубик (Fritsch–Carlson).
 */
export function monotonePath(pts: Pt[], from = 0, to = pts.length - 1): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r2(pts[0].x)},${r2(pts[0].y)}`;
  const a = Math.max(0, Math.min(n - 1, Math.floor(from)));
  const b = Math.max(a, Math.min(n - 1, Math.floor(to)));

  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i];
  }

  /* Цэг бүрийн налуу — хөршийн налуу ТЭМДЭГ солиход 0 (эргэлтийн цэг) */
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }

  let d = `M${r2(pts[a].x)},${r2(pts[a].y)}`;
  for (let i = a; i < b; i += 1) {
    const h = dx[i] / 3;
    d += ` C${r2(pts[i].x + h)},${r2(pts[i].y + t[i] * h)}`
      + ` ${r2(pts[i + 1].x - h)},${r2(pts[i + 1].y - t[i + 1] * h)}`
      + ` ${r2(pts[i + 1].x)},${r2(pts[i + 1].y)}`;
  }
  return d;
}

/** Хугарсан шулуун (гөлгөршүүлэлтгүй) зам */
function straightPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)},${r2(p.y)}`).join(' ');
}

export type LineOpts = {
  /** Монотон гөлгөршүүлэлт — анхдагч ТИЙМ. `false` бол хугарсан шулуун. */
  smooth?: boolean;
};

/**
 * Цэгүүдийг ТАСРАЛТГҮЙ ХЭСГҮҮДЭД хувааж, хэсэг бүрийн замыг буцаана.
 */
export function lineSegments(points: readonly (Pt | null | undefined)[], opts: LineOpts = {}): LineSeg[] {
  const smooth = opts.smooth ?? true;
  const out: LineSeg[] = [];
  let cur: Pt[] = [];
  let from = -1;
  const flush = (to: number) => {
    if (!cur.length) return;
    const single = cur.length === 1;
    const d = single
      ? `M${r2(cur[0].x)},${r2(cur[0].y)} h0`
      : smooth ? monotonePath(cur) : straightPath(cur);
    out.push({ d, pts: cur, single, from, to });
    cur = [];
  };
  points.forEach((p, i) => {
    if (!ok(p)) { flush(i - 1); return; }
    if (!cur.length) from = i;
    cur.push({ x: p.x, y: p.y });
  });
  flush(points.length - 1);
  return out;
}

/** `lineSegments`-ийн зөвхөн `d` мөрүүд — хэсэг бүрд нэг */
export function linePath(points: readonly (Pt | null | undefined)[], opts: LineOpts = {}): string[] {
  return lineSegments(points, opts).map((s) => s.d);
}

/**
 * Хэсгийн ДООРХ талбай — шугамын ЯГ ижил замыг дагаад суурь руу хаана.
 */
export function areaPath(seg: LineSeg | Pt[], baselineY: number, opts: LineOpts = {}): string {
  const s: LineSeg = Array.isArray(seg) ? (lineSegments(seg, opts)[0] ?? { d: '', pts: [], single: true, from: 0, to: 0 }) : seg;
  if (s.single || s.pts.length < 2 || !Number.isFinite(baselineY)) return '';
  const a = s.pts[0];
  const b = s.pts[s.pts.length - 1];
  return `${s.d} L${r2(b.x)},${r2(baselineY)} L${r2(a.x)},${r2(baselineY)} Z`;
}

/* ══════════════════════ Онооны 5 шат — hex ══════════════════════ */

/**
 * `--score-1..5` токены (globals.css) ЗАДАРСАН hex — горим тус бүрд. Индекс 0 = `--score-1` (муу).
 */
export const SCORE_HEX = {
  light: ['#dc2626', '#ef801b', '#facc15', '#769939', '#147c3b'],
  dark: ['#f87171', '#fba252', '#fbbf24', '#97cf7d', '#34d399'],
} as const satisfies Record<'light' | 'dark', readonly string[]>;

/** Хар-хүрэн бичиг — цайвар дэвсгэр дээр */
const INK_DARK = '#1a1205';
const INK_LIGHT = '#ffffff';

/**
 * `--score-N` ДЭВСГЭР дээрх бичгийн өнгө (эрэмбийн `.tot`, дэлгэрэнгүйн `.gauge`, hover-ийн `.st`).
 */
export const SCORE_INK = {
  light: [INK_LIGHT, INK_DARK, INK_DARK, INK_DARK, INK_LIGHT],
  dark: [INK_DARK, INK_DARK, INK_DARK, INK_DARK, INK_DARK],
} as const satisfies Record<'light' | 'dark', readonly string[]>;

/** «Өгөгдөлгүй» (`var(--ink-3)`) дэвсгэр дээрх бичиг — дээрх тайлбарыг үз */
export const SCORE_NODATA_INK = { light: INK_LIGHT, dark: INK_DARK } as const;
