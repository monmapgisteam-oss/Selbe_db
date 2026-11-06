/** Тоо, нэгжийн форматлагч — портал даяар нэг дүрэм. */

import { getLocale } from '@/lib/i18nCore';

const L = 'en-US';

/**
 * Огнооны BCP-47 хэл — i18n-ийн ОДООГИЙН хэлээс (2026-09-23).
 */
export const dateLocale = (): string => (getLocale() === 'en' ? 'en-US' : 'mn-MN');

/**
 * ХАРУУЛАХ ЦАГИЙН БҮС — төслийн бүх огноо Улаанбаатарын цагаар (шүүлтүүрүүдтэй ижил), хөтчийн бүсээс хамаарахгүй.
 */
const UB_TZ = 'Asia/Ulaanbaatar';
const UB_OFFSET_MS = 8 * 3_600_000;
/** UTC аргуудаар (`getUTC*`) уншихад Улаанбаатарын ханын цаг өгөх `Date` */
const ubWall = (d: Date): Date => new Date(d.getTime() + UB_OFFSET_MS);
/** Бүсгүй огноо-цаг («2026-07-14 10:00») — хөтчийн биш, Улаанбаатарын цаг гэж уншина */
const toDate = (v: number | string): Date => {
  if (typeof v === 'number') return new Date(v);
  const s = String(v);
  return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s.replace(' ', 'T')}+08:00` : s);
};

/**
 * Огноо + цаг — тайлангийн толгойд, УЛААНБААТАРЫН цагаар `YYYY-MM-DD HH:mm`.
 */
export function dateTime(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const dt = toDate(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  const w = ubWall(dt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())} ${p(w.getUTCHours())}:${p(w.getUTCMinutes())}`;
}

const NF = new Map<number, Intl.NumberFormat>();
const nfOf = (d: number): Intl.NumberFormat => {
  let f = NF.get(d);
  if (!f) {
    f = new Intl.NumberFormat(L, { minimumFractionDigits: d, maximumFractionDigits: d });
    NF.set(d, f);
  }
  return f;
};

export const num = (v: number | null | undefined, d = 0): string =>
  v == null || !Number.isFinite(v)
    ? '—'
    : nfOf(d).format(v);

/** 13.4% */
export const pct = (v: number | null | undefined, d = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${num(v, d)}%`;

/** м² → га */
export const ha = (m2: number | null | undefined, d = 1): string =>
  m2 == null || !Number.isFinite(m2) ? '—' : num(m2 / 10_000, d);

/** метр → км */
export const km = (m: number | null | undefined, d = 1): string =>
  m == null || !Number.isFinite(m) ? '—' : num(m / 1_000, d);

/**
 * Төгрөг — ҮРГЭЛЖ БҮТЭН, мянгатын таслалтай: 2660000000000 → «2,660,000,000,000 ₮»
 */
export function mnt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  return `${num(v)} ₮`;
}

/** Огноо: ArcGIS epoch (мс), "2026-07-14" эсвэл DateOnly */
export function date(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const dt = toDate(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  const loc = dateLocale();
  const f = dfOf(loc);
  if (loc !== 'en-US' && !f.resolvedOptions().locale.startsWith('mn')) {
    const w = ubWall(dt);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${w.getUTCFullYear()}.${p(w.getUTCMonth() + 1)}.${p(w.getUTCDate())}`;
  }
  return f.format(dt);
}
const DF = new Map<string, Intl.DateTimeFormat>();
function dfOf(loc: string): Intl.DateTimeFormat {
  let f = DF.get(loc);
  if (!f) {
    f = new Intl.DateTimeFormat(loc, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: UB_TZ });
    DF.set(loc, f);
  }
  return f;
}

/**
 * ӨДРИЙН ТҮЛХҮҮР — epoch (мс) → «YYYY-MM-DD» УЛААНБААТАРЫН огноогоор.
 */
export function dayKey(ms: number): string {
  const d = ubWall(new Date(ms));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * САРЫН ТҮЛХҮҮР — «YYYY-MM» УЛААНБААТАРЫН огноогоор. Оролтгүй бол ӨНӨӨДӨР.
 */
export function monthKey(ms: number = Date.now()): string {
  const d = ubWall(new Date(ms));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

   Эдгээр нь тухайн ангилалд ГАЗРЫН ЗУРГИЙН харгалзах өнгө БАЙХГҮЙ үед —
   өөрөөр хэлбэл өнгө нь зөвхөн «аль цуваа вэ» гэдгийг заах үед — хэрэглэгдэнэ. */

/** Цайвар горимын слотууд (гадаргуу #ffffff дээр баталгаажсан) */
export const CAT_LIGHT = [
  '#17895b', '#b1582b', '#4076b9', '#598332',
  '#ab517f', '#926f00', '#8062b0', '#b84d49',
] as const;
/**
 * ХЭВЛЭЛ / PDF / ИНФОГРАФИКИЙН ӨНГӨ — `globals.css`-ийн ЦАЙВАР сэдвийн
 * (`:root, [data-theme='light']`) токены hex хуулбар.
 */
export const PRINT_COLORS = {
  /** --ink */ ink: '#142132',
  /** --ink-2 */ ink2: '#3a4a5e',
  /** --ink-3 */ ink3: '#56677c',
  /** --data (Сэлбэ логоны хөх) — ганц цувааны үндсэн өнгө */ data: '#3a5d83',
  /** --good */ good: '#2f7d55',
  /** --warn (ochre) */ warn: '#d39b35',
  /** --bad (clay) */ bad: '#d35d5d',
  /** --water — гантын «явж буй» */ water: '#3b82f6',
  /** --chart-track (paper-hi) */ track: '#e6edf5',
  /** --chart-plan (= --ink-3) */ plan: '#56677c',
  /** --chart-actual (= --data) */ actual: '#3a5d83',
} as const;

/** Харанхуй горимын слотууд (гадаргуу #102330 дээр баталгаажсан) */
export const CAT_DARK = [
  '#38c789', '#f78955', '#65adff', '#87be53',
  '#f080b8', '#d2a408', '#ba93fb', '#fb817a',
] as const;

/**
 * `i`-р слотын өнгө CSS хувьсагчаар.
 */
export const cat = (i: number): string => `var(--c${(((i % 8) + 8) % 8) + 1})`;

/** `shades(hex, n)`-ийн орлуулга — ижил төрөл, ижил урт, зөвхөн индексээр авна */
export const cats = (n: number): string[] => Array.from({ length: n }, (_, i) => cat(i));

/** CSS-гүй орчинд (SVG шинж, canvas, PDF) — горимоо ЗААВАЛ өөрөө шийднэ */
export const catHex = (i: number, dark = false): string =>
  (dark ? CAT_DARK : CAT_LIGHT)[(((i % 8) + 8) % 8)];

/**
 * «Өгөгдөлгүй / бусад / тодорхойгүй» — ӨНГӨТ цуваа БИШ, саарал бэх.
 */
export const NO_DATA = 'var(--ink-3)';

/**
 * «ОРОН СУУЦНЫ ХОРООЛОЛ» → «Орон сууцны хороолол».
 */
const ACRONYMS = new Set([
  'ТЭЗҮ', 'ГИШС', 'ХАБ', 'АТД', 'ХТП', 'РП', 'ХБГ', 'УБ', 'СБД', 'ЧД', 'IoT', 'QAQC', 'PDF',
]);

export function sentenceCase(s: string): string {
  const t = String(s ?? '').trim();
  if (!t) return t;
  const up = t.toLocaleUpperCase('mn-MN');
  /* Бүхэлдээ том үсэгтэй ЭСЭХ — үсэггүй мөрийг ч энд шүүнэ */
  if (t !== up || t === t.toLocaleLowerCase('mn-MN')) return t;
  let first = true;
  return t
    .split(/([^\p{L}\p{N}]+)/u)
    .map((tok) => {
      if (!/\p{L}/u.test(tok)) return tok;
      if (ACRONYMS.has(tok)) { first = false; return tok; }
      const low = tok.toLocaleLowerCase('mn-MN');
      if (!first) return low;
      first = false;
      return low.charAt(0).toLocaleUpperCase('mn-MN') + low.slice(1);
    })
    .join('');
}

/**
 * КИРИЛЛ ҮСГИЙН КОДЧЛОЛЫН ЗАСВАР — ЗӨВХӨН ДЭЛГЭЦЭНД (2026-10-23, UX аудит S15).
 */
const CYR_FIX: Record<string, string> = { 'є': 'ө', 'Є': 'Ө', 'ї': 'ү', 'Ї': 'Ү' };
export function fixCyr(s: string): string;
export function fixCyr(s: string | null | undefined): string | null | undefined;
export function fixCyr(s: string | null | undefined): string | null | undefined {
  return s == null ? s : String(s).replace(/[єЄїЇ]/g, (c) => CYR_FIX[c] ?? c);
}
