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
 * БҮХЭЛ ХУВИУД НИЙЛЭЭД ЯГ 100 — их үлдэгдлийн арга (largest remainder).
 *
 * ⚠️ 2026-10-09 (аудит №6): Donut-ын тайлбарт л байсан аргыг НЭГ туслах болгов — Stack-ийн
 *    `share`, Donut-ын aria тойм, CEO scorecard-ын төлөвийн хувь хэсэг БҮРИЙГ тусад нь
 *    `toFixed(0)`/`num()` тойруулж «33+33+33 = 99%», «17+17+67 = 101%» гаргадаг байв.
 *    · `total` өгвөл түүгээр хуваана — хэсгүүд бүхлийг бүрхээгүй бол нийлбэр < 100 хэвээр
 *      (хиймлээр 100 болгохгүй); өгөөгүй бол утгуудын нийлбэр.
 *    · сөрөг/NaN утга 0; нийлбэр 0 бол бүгд 0.
 *    · утга > 0 атал бүхэл нь 0 бол дуудагч «<1%» бичнэ (Donut/Stack-ийн урьдын дүрэм).
 */
export function roundPctsTo100(values: readonly number[], total?: number): number[] {
  const vals = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = total != null && Number.isFinite(total) && total > 0
    ? total
    : vals.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return vals.map(() => 0);
  const raw = vals.map((v) => (v / sum) * 100);
  const base = raw.map((v) => Math.floor(v));
  let left = Math.round(raw.reduce((a, b) => a + b, 0)) - base.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - base[i], i] as const).sort((p, q) => q[0] - p[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
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
 * ⚠️ 2026-10-09 (аудит №3): `from`/`to` — БҮТЭН цувааны налуугаар бодсон муруйн ЗӨВХӨН
 *    [from, to] хэсэг. Хэсгийг `slice`-лаад дахин бодвол захын налуу өөрчлөгдөж (хөрш цэг
 *    алга) муруй бүтэн шугамаасаа ЗӨРНӨ — PkgProg-ийн зөрүүний талбайн дээд ирмэг
 *    төлөвлөгөөний шугамаас салж байв. Анхдагч нь бүтэн муж (хуучин зан).
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
  /* ⚠️ Дотоод налуу нь хөршийн налуунуудын ЖИНТЭЙ ГАРМОНИК дундаж (Brodlie) —
     α,β ≤ 3 нөхцөлийг өөрөө хангадаг тул тусад нь хязгаарлах шаардлагагүй;
     захын налуу нь хөршийн налуутай тэнцүү (α = 1). */

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

/* ══════════════════════ Онооны 5 шат — hex ══════════════════════ */

/**
 * `--score-1..5` токены (globals.css) ЗАДАРСАН hex — горим тус бүрд. Индекс 0 = `--score-1` (муу).
 *
 * ⚠️ 2026-10-09 (аудит №3): газрын зураг (ArcGIS символ) `var()`/`color-mix()` задалдаггүй тул
 *    hex хэрэгтэй. Урьд нь газрын зураг/hover нь `SCORE_LEVELS.color` (хуучин #16a34a/#a3d84a/…)
 *    -аар, эрэмбийн тэмдэг/хэмжүүр/радар нь `--score-N` токеноор будагдаж ХОЁР ӨӨР өнгө
 *    харуулдаг байв (цайвар «Маш муу»: зураг #b91c1c ↔ самбар #dc2626; dark-д бүр өөр).
 *    Одоо газрын зураг ЭНЭ хүснэгтээс горимоор нь авна; токентой ТЭНЦҮҮ эсэхийг
 *    `chartStyle.check.mjs` globals.css-ийг задлан `color-mix(in oklab)`-ийг өөрөө бодож
 *    (±2/255) шалгана — токен солибол ЭНДЭЭ солихгүй бол тест унана.
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
 *
 * ⚠️ 2026-10-09 (аудит №3): урьд нь `SCORE_LEVELS.ink` нь ХУУЧИН hex-д тааруулсан, горимгүй
 *    байсан тул токен дэвсгэр дээр цайвар «Маш сайн» (#147c3b + хар-хүрэн) 3.5:1, dark
 *    «Маш муу» (#f87171 + цагаан) 2.8:1 болж WCAG AA (4.5:1) унав. Одоо горим × шат бүрд
 *    БОДИТ токен дэвсгэр дээр сонгосон (WCAG 2 харьцаа):
 *      light — 1 #dc2626 цагаан 4.83 · 2 #ef801b хар-хүрэн 6.86 · 3 #facc15 хар-хүрэн 12.11 ·
 *              4 #769939 хар-хүрэн 5.64 · 5 #147c3b цагаан 5.28
 *      dark  — 1 #f87171 хар-хүрэн 6.70 · 2 #fba252 9.17 · 3 #fbbf24 11.11 · 4 #97cf7d 10.19 ·
 *              5 #34d399 9.64
 *      өгөгдөлгүй (`var(--ink-3)`) — light #5a6a80 цагаан 5.51 · dark #94a3b8 хар-хүрэн 7.23
 *    `chartStyle.check.mjs` харьцаа ≥ 4.5 гэдгийг бүгдэд нь бодож шалгана.
 */
export const SCORE_INK = {
  light: [INK_LIGHT, INK_DARK, INK_DARK, INK_DARK, INK_LIGHT],
  dark: [INK_DARK, INK_DARK, INK_DARK, INK_DARK, INK_DARK],
} as const satisfies Record<'light' | 'dark', readonly string[]>;

/** «Өгөгдөлгүй» (`var(--ink-3)`) дэвсгэр дээрх бичиг — дээрх тайлбарыг үз */
export const SCORE_NODATA_INK = { light: INK_LIGHT, dark: INK_DARK } as const;
