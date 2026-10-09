/**
 * ГРАФИКИЙН НЭГ ЭХ — хэмжээс, тунгалаг, муруйн зам (2026-10-09).
 *
 * ⚠️ 2026-10-09 («бүх графикийн загварыг төрлөөр нь жигдлэх»): системд 14 төрлийн
 *    гараар зурсан график 4 янзын гөлгөршүүлэлт (Catmull-Rom ×3 + монотон),
 *    1.5/1.6/2/2.8px шугам, 2–12px хэвтээ багана, 0.22/0.3/0.32/0.4 бүдгэрэлттэй
 *    байв. Энэ файл нь ТОО — өнгө нь `globals.css`-ийн токен (`--chart-*`,
 *    `--gantt-*`, `--score-*`). Шинэ график зурахдаа эндээс авна; модуль бүр
 *    өөрийн `smoothPath`/`curve` хуулбар бичихгүй.
 * ⚠️ React-гүй цэвэр модуль — `chartStyle.check.mjs` node-оор шууд шалгана,
 *    PDF (`execPdf`) ч импортлож болно.
 */

/**
 * Хэмжээс ба тунгалагийн тогтмолууд.
 *
 * ⚠️ 2026-10-09: хэрэглэгчийн сонголт — хэвтээ багана НИМГЭН 2px; S-муруйд
 *    төлөвлөгөө тасархай + 0/25/50/75/100% тор. CSS талд ижил тоог
 *    (`ui.module.css`) гараар бичсэн — энд өөрчилбөл тэнд ч өөрчил.
 */
export const CHART = {
  /** Шугамын зузаан (px) — бүх шугам/талбай/S-муруй */
  stroke: 2,
  /** Цэгийн радиус (px) — диаметр 6 */
  markerR: 3,
  /** Цэгийн эргэн тойрны гадаргуун цагираг (px) — шугамтай огтлолцоход цэг ялгарна */
  ring: 2,
  /** Сонгоогүй/hover-оос гадуурх элементийн тунгалаг — БҮХ төрөлд нэг утга */
  dim: 0.35,
  /** Ганц цувааны талбайн градиент — дээд/доод тунгалаг. Олон цуваанд дүүргэлтгүй. */
  areaTop: 0.24,
  areaBottom: 0.02,
  /** Төлөвлөгөө ↔ бодит хоорондох зөрүүний дүүргэлт (ногоон/улаан) */
  gapFill: 0.12,
  /** Төлөвлөгөөний тасархай шугам (`stroke-dasharray`) */
  planDash: '5 4',
  /** S-муруйн хэвтээ тор (%) */
  grid: [0, 25, 50, 75, 100] as readonly number[],
  /** Хэвтээ баганын зузаан (px) — `Bars` */
  barH: 2,
  /** 100% давхарласан зурвасын зузаан (px) ба сегмент хоорондын зай — `Stack` */
  stackH: 8,
  stackGap: 2,
  /** Хэмжигчийн зузаан (px) — `Meter`; `wide` хувилбар нь 8 */
  meterH: 2,
  meterWideH: 8,
  /** Хэмжигчийн төлөвлөгөөний тэмдэг — зурвасаас дээш/доош сунах (px) */
  planTickOut: 4,
} as const;

/**
 * Дугуй диаграмын (Donut) 3 хэмжээ — [диаметр, цагирагийн зузаан].
 * ⚠️ 2026-10-09: урьд нь 110/120/128/132/… гэж дуудагч бүр өөрийн тоотой байв.
 */
export const DONUT_SIZES = {
  sm: [96, 14],
  md: [132, 20],
  lg: [150, 24],
} as const satisfies Record<string, readonly [number, number]>;
export type DonutSize = keyof typeof DONUT_SIZES;

/**
 * Хувийн цагирагийн (Ring) 3 хэмжээ — диаметр. Зузаан = `ringStroke(size)`.
 * ⚠️ 2026-10-09: урьд нь 86/92/104/124/132/148 ба зузаан 9/11/13/14/20 — харьцаа нь 7–15%.
 */
export const RING_SIZES = {
  sm: 88,
  md: 120,
  lg: 148,
} as const;
export type RingSize = keyof typeof RING_SIZES;

/** Цагирагийн зузаан — диаметрийн 10% (бүхэл px) */
export const ringStroke = (size: number): number => Math.max(1, Math.round(size * 0.1));

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
 *
 * ⚠️ Энгийн Catmull-Rom АШИГЛАХГҮЙ. Тэр нь цэг хооронд ХЭТРЭХ (overshoot)
 * шинжтэй: хуримтлагдсан S-муруй 96% → 98.8% гэж өгсөхөд муруй нь 100%-ийг
 * давж гараад буцдаг — «төлөвлөгөө 101% биелсэн» гэсэн ХУДАЛ уншилт төрүүлнэ.
 * Монотон арга нь өгсөх цуваанд хэзээ ч буухгүй, буух цуваанд өгсөхгүй;
 * хоёр хөрш цэгийн хоорондох муруй нь тэдний y-мужаас ГАРАХГҮЙ.
 *
 * ⚠️ 2026-10-09: `ui.tsx`-ээс ЗӨӨВ (тэнд дахин экспортлогдсон хэвээр —
 *    GeneralDash импортлодог).
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r2(pts[0].x)},${r2(pts[0].y)}`;

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
  /* ⚠️ Дотоод налуу нь хөршийн налуунуудын ЖИНТЭЙ ГАРМОНИК дундаж (Brodlie) —
     α,β ≤ 3 нөхцөлийг өөрөө хангадаг тул тусад нь хязгаарлах шаардлагагүй;
     захын налуу нь хөршийн налуутай тэнцүү (α = 1). */

  let d = `M${r2(pts[0].x)},${r2(pts[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
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
 *
 * ⚠️ `null` (эсвэл NaN координат) = ХЭМЖИГДЭЭГҮЙ → муруй тэнд ТАСАРНА
 *    (CLAUDE.md: null ≠ 0, цоорхой үлдээнэ). Гүүрээр холбохгүй, 0 гэж зурахгүй.
 * ⚠️ Ганц цэгтэй хэсэг `single: true` — дуудагч цэг (marker) зурна.
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
 *
 * ⚠️ Талбайг шугамаас ТУСАД НЬ байгуулбал хоёр муруй бага зэрэг зөрж ирмэг дээр
 *    цагаан зурвас гарна — иймд `seg.d`-г шууд үргэлжлүүлнэ.
 * ⚠️ Ганц цэгтэй хэсэгт талбай БАЙХГҮЙ ('').
 */
export function areaPath(seg: LineSeg | Pt[], baselineY: number, opts: LineOpts = {}): string {
  const s: LineSeg = Array.isArray(seg) ? (lineSegments(seg, opts)[0] ?? { d: '', pts: [], single: true, from: 0, to: 0 }) : seg;
  if (s.single || s.pts.length < 2 || !Number.isFinite(baselineY)) return '';
  const a = s.pts[0];
  const b = s.pts[s.pts.length - 1];
  return `${s.d} L${r2(b.x)},${r2(baselineY)} L${r2(a.x)},${r2(baselineY)} Z`;
}
