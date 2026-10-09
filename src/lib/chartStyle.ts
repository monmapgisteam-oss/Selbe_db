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
  /**
   * Ганц цувааны талбайн градиент — дээд/доод тунгалаг.
   * ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): 0.24→0.02 байсныг 0.32→0 — шугамын
   *    дор өтгөн, суурь дээр бүрэн уусна (лавлах «area chart»-ын хэл).
   */
  areaTop: 0.32,
  areaBottom: 0,
  /**
   * ОЛОН цувааны талбай — цуваа БҮР өөрийн тунгалаг давхаргатай (0.16 → 0).
   * ⚠️ 2026-10-09 (лавлах CRM загвар): урьд нь олон цуваанд дүүргэлтгүй байв. Бага
   *    тунгалагтай тул давхцсан хэсэг нь «давхарласан» мэт уншигдана, холилдож
   *    нэг өнгө болохгүй.
   */
  areaMultiTop: 0.16,
  /** Төлөвлөгөө ↔ бодит хоорондох зөрүүний дүүргэлт (ногоон/улаан) */
  gapFill: 0.12,
  /**
   * Төлөвлөгөөний ЦЭГЭН шугам (`stroke-dasharray`) — round cap-тай 2px шугамд
   * «1 5» нь бөөрөнхий цэгүүдийн цуваа болно.
   * ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): '5 4' тасархай → цэгэн.
   *    Шугам нь ЗААВАЛ `stroke-linecap: round` байна — эс бөгөөс 1px зураас болно.
   */
  planDash: '1 5',
  /** Шугамын зөөлөн гэрэлтэлт (drop-shadow blur, px) — `glow()` */
  glowBlur: 4,
  /**
   * HOVER/ФОКУСЫН ТЭМДЭГ — r 4.5 дүүргэлт + 2px гадаргуун цагираг + r 9 гало (25%).
   * ⚠️ 2026-10-09 (лавлах CRM загвар): шугаман графикт цэг АНХДАГЧААР НУУГДАНА —
   *    зөвхөн заасан цэг дээр гарна (ганц цэгтэй хэсэг, босго давсан цэг үргэлж харагдана).
   */
  hoverR: 4.5,
  haloR: 9,
  haloA: 0.25,
  /** Босоо баганын өргөн — слотын хувь (`Series`) ба оройн радиус (px) */
  colW: 0.45,
  colRadius: 4,
  /** Donut-ын зүсмэг хоорондын зай (px, нумын дагуу) ба дотор хувь бичих доод хязгаар */
  donutGap: 3,
  donutLabelMin: 0.08,
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
 * ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): зузаан ~15% → ~20% (14/20/24 → 19/26/30) —
 *    бөөрөнхий үзүүртэй зүсмэг ба дотор нь бичих хувь (10px) багтана.
 */
export const DONUT_SIZES = {
  sm: [96, 19],
  md: [132, 26],
  lg: [150, 30],
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

/* ══════════════════════ Лавлах CRM загвар (2026-10-09) ══════════════════════ */

/**
 * ЗӨӨЛӨН ГЭРЭЛТЭЛТ — CSS `filter` утга (шугам, цагираг, онцолсон зүсмэг).
 *
 * ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): өнгө нь ЦУВААНЫ ӨӨРИЙН токен
 *    (`var(--c2)`, `var(--chart-plan)` …) — шинэ өнгө нэмэхгүй. Хүч нь
 *    `--chart-glow` (globals.css): харанхуйд 55%, цайварт бага, хэвлэхэд 0.
 * ⚠️ `style={{ filter }}`-ээр өгнө (SVG presentation шинжид `var()` задардаггүй) —
 *    элемент нь `chartGlow` глобал класстай байх ёстой: `@media print` үүгээр унтраана.
 */
export const glow = (color: string, blur: number = CHART.glowBlur): string =>
  `drop-shadow(0 0 ${blur}px color-mix(in srgb, ${color} var(--chart-glow, 40%), transparent))`;

/** Тоог 12 оронтой нарийвчлалд буулгана — 0.1+0.2 маягийн хөвөгч хог арилна */
const clean = (v: number) => Number(v.toPrecision(12));

/**
 * «ГОЁ» ТЭНХЛЭГИЙН ХУВААРЬ — 1 · 2 · 2.5 · 5 × 10ⁿ алхамтай, [lo, hi]-г БҮРЭН хамарна.
 *
 * ⚠️ 2026-10-09 (лавлах CRM загвар): `Trend`/`Series`-д зүүн талын жижиг тэнхлэг
 *    ба хэвтээ тор нэмэгдсэн — шугам нь «68 / 100» гэх мэт санамсаргүй дээд
 *    хязгаартай байвал торны тоо «13.6 · 27.2 …» болж уншигдахгүй.
 * ⚠️ Эхний ба сүүлийн утга нь тэнхлэгийн ДООД/ДЭЭД хязгаар болно (дуудагч өгөгдлөө
 *    тэдгээрээр масштаблана) — тор ба өгөгдөл НЭГ хуваарьт.
 * ⚠️ `lo === hi` (хавтгай/хоосон цуваа) үед ч хоёроос доошгүй утга буцаана.
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
 * ЦАГИРГАН НУМЫН ЗАМ — 12 цагаас цагийн зүүний дагуу, `a0 → a1` (радиан).
 * ⚠️ 2026-10-09 (лавлах CRM загвар): Donut-ын зүсмэг нь ДҮҮРГЭЛТТЭЙ сектор биш,
 *    `stroke-linecap: round` бүхий ЗУЗААН НУМ — бөөрөнхий үзүүр + зүсмэг хоорондын зай.
 *    Бүтэн тойрог (≈2π) нэг нумаар хаагддаггүй тул хоёр хагасаар зурна.
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
