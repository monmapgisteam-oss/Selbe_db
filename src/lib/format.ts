import { t as tr } from '@/lib/i18nCore';
/** Тоо, нэгжийн форматлагч — портал даяар нэг дүрэм. */

const L = 'en-US';

export const num = (v: number | null | undefined, d = 0): string =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(L, { minimumFractionDigits: d, maximumFractionDigits: d });

/** 13.4% */
export const pct = (v: number | null | undefined, d = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${num(v, d)}%`;

/** м² → га */
export const ha = (m2: number | null | undefined, d = 1): string =>
  m2 == null || !Number.isFinite(m2) ? '—' : num(m2 / 10_000, d);

/** метр → км */
export const km = (m: number | null | undefined, d = 1): string =>
  m == null || !Number.isFinite(m) ? '—' : num(m / 1_000, d);

/** Төгрөг — том дүнг богиносгоно. 1,270,669,647,005 → «1.27 их наяд ₮» */
export function mnt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return tr('{0} их наяд ₮', num(v / 1e12, 2));
  if (a >= 1e9) return tr('{0} тэрбум ₮', num(v / 1e9, 1));
  if (a >= 1e6) return tr('{0} сая ₮', num(v / 1e6, 1));
  return `${num(v)} ₮`;
}

/**
 * Богино төгрөг — хүснэгтэд: 448.7 тэрбум ₮ (нэгжээ ҮРГЭЛЖ дагуулна).
 * ⚠️ `mnt`-тэй ижил дүрэм тул давхардуулахгүй, alias болгов — нэг эх кодоос
 *    хоёулаа өөрчлөгдөнө (өмнө нь хоёр биет хуулбар чимээгүй салах эрсдэлтэй байв).
 */
export const mntShort = mnt;

/**
 * Мөнгөн дүн — ХАМГИЙН товч нэгжтэй: «448.7 тэрб. ₮». KPI-ийн нарийхан нүдэнд
 * «тэрбум» гэж бүтнээр бичихэд шошго хоёр мөр болж эвдэрдэг тул товчлов
 * (2026-08-21, хэрэглэгчийн хүсэлт). `mnt`-тэй ИЖИЛ босго — зөвхөн нэгжийн үг өөр.
 */
export function mntAbbr(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return tr('{0} их н. ₮', num(v / 1e12, 2));
  if (a >= 1e9) return tr('{0} тэрб. ₮', num(v / 1e9, 1));
  if (a >= 1e6) return tr('{0} сая ₮', num(v / 1e6, 1));
  return `${num(v)} ₮`;
}

/** Огноо: ArcGIS epoch (мс), "2026-07-14" эсвэл DateOnly */
export function date(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const dt = typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** ArcGIS-ийн хоосон утга: null, "" эсвэл зөвхөн зай */
export const blank = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '');

/** Текст утгыг цэвэрлэх — хоосон бол өгсөн орлуулагч */
export const text = (v: unknown, fallback = '—'): string =>
  blank(v) ? fallback : String(v).trim();

/* ── Монохром палитр ── */

/**
 * НЭГ өнгийг цайруулж дараалсан сүүдэр гаргана — олон ялгаатай (солонгон) өнгө
 * биш, НЭГ өнгөний уусгалт (хэрэглэгчийн хүсэлт). `i=0` хамгийн тод (суурь өнгө),
 * цааш нь цагаан руу цайрна. Портал даяар нэг дүрэм: диаграмын зэргэлдээ зүсмэг/
 * баганыг ялгах хэрэгцээ л өнгө шаардаж байгаа болохоос ангилал бүр өөр «утгатай»
 * биш — тиймээс нэг өнгийн шат хамгийн зөв.
 */
/** Суурь өнгийг `t` (0=тод суурь, 1=цагаан) хэмжээгээр цайруулна */
function lighten(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const k = Math.max(0, Math.min(1, t));
  const mix = (ch: number) => Math.round(ch + (255 - ch) * k);
  const hx = (ch: number) => mix(ch).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

/* ── HSL хөрвүүлэлт — өнгөний ДУГУЙ (hue) дээр эргүүлж ялгах ── */

/**
 * Энэ нь hex мөн үү (#rrggbb)?
 *
 * ⚠️ 2026-08-17 нэмэв. Төсөлд одоо `var(--c1)`, `var(--ink-3)` зэрэг CSS
 * ХУВЬСАГЧ өнгө орж ирсэн (горим дагадаг болгохын тулд). `shade`/`tint` нь
 * hex дээр тоон үйлдэл хийдэг тул тэдэнд хувьсагч дамжвал `parseInt` NaN
 * буцааж, `#NaNNaNNaN` гэсэн ХҮЧИНГҮЙ өнгө үүсгэн тэмдэг нь огт зурагдахгүй
 * болно. Иймд hex биш бол өөрчлөлтгүй БУЦААНА — уусгах боломжгүй ч зурагдана.
 */
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let hue = 0;
  if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  return [hue * 360, s, l];
}

function hslToHex(hue: number, s: number, l: number): string {
  const H = ((hue % 360) + 360) % 360 / 360;
  const S = Math.max(0, Math.min(1, s));
  const L = Math.max(0, Math.min(1, l));
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const conv = (t: number) => {
    let x = t;
    if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(conv(H + 1 / 3))}${to(conv(H))}${to(conv(H - 1 / 3))}`;
}

/**
 * `i`-р зэрэглэлийн өнгө — НЭГ өнгөний ГЭР БҮЛД, гэвч зүсмэг бүр ТОД ЯЛГААТАЙ.
 *
 * ⚠️ Урьд нь зөвхөн цагаан руу цайруулдаг байсан тул зэргэлдээ зүсмэгүүд бараг
 * ижил өнгөтэй, ялангуяа пайн диаграм дээр (50% тунгалаг) нүдээр ялгагдахгүй
 * байв. Одоо `i=0` нь суурь өнгө ХЭВЭЭР (газрын зураг/баганатай тааруулна),
 * дараагийн зүсмэг бүр өнгөний дугуй дээр ЭРГЭЖ (hue-shift) + гэрэлтэнэ —
 * тиймээс солонго биш, нэг гэр бүлийн боловч тодорхой ялгаатай.
 */
export const shade = (hex: string, i: number, n: number): string => {
  if (n <= 1 || i <= 0 || !isHex(hex)) return hex;
  const [h, s, l] = hexToHsl(hex);
  const t = i / (n - 1); // 0..1
  // Эргэлтийн алхам — цөөн зүсмэгт том (тод ялгаа), олонд нийт ~120° дотор
  const step = Math.min(26, 120 / (n - 1));
  const hue = h + i * step;
  const light = Math.min(0.82, l + t * 0.26);
  const sat = Math.max(0.35, s * (1 - t * 0.18));
  return hslToHex(hue, sat, light);
};

/** Нэг өнгөнөөс `n` ширхэг сүүдрийн массив — тогтмол уртын палитр хэрэгтэй үед */
export const shades = (hex: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => shade(hex, i, n));

/**
 * УТГА суурьтай сүүдэр — `frac` (0..1) их бол ТОД (суурь өнгө), бага бол цайвар.
 * Гүйцэтгэлийн % зэрэг тасралтгүй хэмжигдэхүүнийг нэг өнгөний heatmap болгоно
 * (улаан→ногоон солонго биш) — өндөр нь тод, бага нь бүдэг.
 */
export const tint = (hex: string, frac: number): string =>
  isHex(hex) ? lighten(hex, (1 - Math.max(0, Math.min(1, frac))) * 0.72) : hex;

/* ── Зэрэглэлийн палитр («Сэлбэ» хуваарь) ──────────────────────────────────
   Бүрэн тайлбар, баталгаажуулалтын үр дүн, хоёр хязгаар нь `globals.css`-д —
   энд зөвхөн ХАНДАЛТ.

   ⚠️ `shade`/`shades`/`tint` нь ХЭВЭЭР. Тэднийг сольж болохгүй: `ViewPanel`,
   `Bagts`, `BuildingPanel`, `Tsogts` нь ГАЗРЫН ЗУРГИЙН давхаргын өнгөнөөс
   (`LayerDef.hue`) санаатайгаар үрждэг — ингэснээр пайн зүсмэг нь газрын зураг
   дээрх олон өнцөгттэйгээ ИЖИЛ өнгөтэй байдаг. Тэднийг слот руу шилжүүлбэл
   диаграм нь газрын зурагтайгаа зөрнө.

   Эдгээр нь тухайн ангилалд ГАЗРЫН ЗУРГИЙН харгалзах өнгө БАЙХГҮЙ үед —
   өөрөөр хэлбэл өнгө нь зөвхөн «аль цуваа вэ» гэдгийг заах үед — хэрэглэгдэнэ. */

/** Цайвар горимын слотууд (гадаргуу #ffffff дээр баталгаажсан) */
export const CAT_LIGHT = [
  '#0b8ba0', '#e2683a', '#3b5fd9', '#3f9142',
  '#e07ba8', '#d69b1a', '#8a3fd0', '#d8413f',
] as const;
/** Харанхуй горимын слотууд (гадаргуу #102330 дээр баталгаажсан) */
export const CAT_DARK = [
  '#17a2b8', '#d96a35', '#6f86ee', '#3fae52',
  '#d9689a', '#b8861c', '#a86ee0', '#ec5f5d',
] as const;

/**
 * `i`-р слотын өнгө CSS хувьсагчаар.
 *
 * ⚠️ Яагаад hex биш `var(--cN)`: ингэснээр НЭГ утга хоёр горимд ӨӨРӨӨ тохирно
 * — горим солиход диаграм дахин будагдана, JS-д горим мэдэх шаардлагагүй.
 * ⚠️ Зөвхөн CSS контекстэд ажиллана (`style`, `background`, `--tone`). SVG-ийн
 * presentation ШИНЖ (`fill=`, `stroke=`) дотор `var()` задардаггүй — тийм
 * газарт `catHex()` эсвэл `style={{ fill: … }}` хэрэглэнэ.
 */
export const cat = (i: number): string => `var(--c${(((i % 8) + 8) % 8) + 1})`;

/** `shades(hex, n)`-ийн орлуулга — ижил төрөл, ижил урт, зөвхөн индексээр авна */
export const cats = (n: number): string[] => Array.from({ length: n }, (_, i) => cat(i));

/** CSS-гүй орчинд (SVG шинж, canvas, PDF) — горимоо ЗААВАЛ өөрөө шийднэ */
export const catHex = (i: number, dark = false): string =>
  (dark ? CAT_DARK : CAT_LIGHT)[(((i % 8) + 8) % 8)];

/**
 * «Өгөгдөлгүй / бусад / тодорхойгүй» — ӨНГӨТ цуваа БИШ, саарал бэх.
 *
 * ⚠️ Зэрэглэлийн слот АШИГЛАХГҮЙ: өгөгдөл байхгүй нь ангилал биш. Урьд нь
 * `#94a3b8` тогтмол hex байсан тул харанхуй горимд бүдгэрч, зарим үед жинхэнэ
 * ангиллын өнгөтэй андуурагддаг байв.
 */
export const NO_DATA = 'var(--ink-3)';
