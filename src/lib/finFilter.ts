/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛИЙН ШҮҮЛТ — цэвэр логик, React-гүй.
 *
 * «Санхүүжилт» харагдацын хоёр бүртгэл (`Cashflow_0909` 33 багана ·
 * `HO_guitsetgel_arcgis_csv` 36 багана) нь урьд нь шүүлтгүй байв. Хэрэглэгчийн хүсэлт
 * (2026-09-01): багц · он · төрлөөр, мөн БАГАНА БҮРЭЭР шүүх, багцаар бүлэглэн
 * харах.
 */
import { t as tr } from '@/lib/i18nCore';
import { dayKey } from '@/lib/format';

export type Row = Record<string, unknown>;
export type FieldDef = { name: string; alias: string; type: string };

/* ────────────────────────────── НҮҮРНҮҮД ───────────────────────────── */

export type FacetKey = 'pkg' | 'year' | 'type';

export type Facet = {
  key: FacetKey;
  /** Дэлгэцийн шошго — `tr()` дамжсан */
  label: string;
  /** «Бүгд» сонголтын шошго */
  allLabel: string;
  /** Утгыг мөрөөс гаргана. ЧАНАСАН мөр буцаана; хоосон бол `''` */
  valueOf: (r: Row) => string;
};

/** Түүхий утгыг харьцуулахад бэлэн болгоно — `'Багц 4.1 '` → `'Багц 4.1'` */
const clean = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Огнооны талбараас ЗӨВХӨН жил — `'2026-03-14'` → `'2026'` */
const yearOf = (v: unknown): string => {
  const s = clean(v);
  if (s === '') return '';
  const n = Number(s);
  if (/^\d{11,}$/.test(s) && Number.isFinite(n)) {
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return dayKey(n).slice(0, 4);
  }
  /* `YYYY-MM-DD`, `YYYY/MM/DD` эсвэл дан `YYYY` */
  const m = /^(\d{4})(?:[-/]|$)/.exec(s);
  return m ? m[1] : '';
};

/**
 * Үйлчилгээ бүрийн ГУРВАН нүүр.
 */
export const FIN_FACETS: Record<'CASHFLOW_NEW' | 'HO_IPC', Facet[]> = {
  CASHFLOW_NEW: [
    { key: 'pkg', get label() { return tr('Багц'); }, get allLabel() { return tr('Бүх багц'); }, valueOf: (r) => clean(r.bagts) },
    { key: 'type', get label() { return tr('Төрөл'); }, get allLabel() { return tr('Бүх төрөл'); }, valueOf: (r) => clean(r.ajil_tuvshin2) },
    {
      key: 'year',
      get label() { return tr('Захирамжийн он'); },
      get allLabel() { return tr('Бүх он'); },
      valueOf: (r) => yearOf(r.zahiramj_ognoo),
    },
  ],
  HO_IPC: [
    { key: 'pkg', get label() { return tr('Багц'); }, get allLabel() { return tr('Бүх багц'); }, valueOf: (r) => clean(r.bagts) },
    {
      key: 'year',
      get label() { return tr('Он'); },
      get allLabel() { return tr('Бүх он'); },
      valueOf: (r) => clean(r.on_),
    },
    {
      key: 'type',
      get label() { return tr('Төлбөрийн төрөл'); },
      get allLabel() { return tr('Бүх төрөл'); },
      valueOf: (r) => clean(r.tulult_turul),
    },
  ],
};

/* ────────────────────────────── ТӨЛӨВ ──────────────────────────────── */

/** Талбарын код → шүүлтийн текст. Хоосон мөр = шүүлтгүй. */
export type ColFilter = Record<string, string>;

export type FinFilter = {
  /** Бүх багана дундуур чөлөөт хайлт */
  q: string;
  /** Нүүр бүрийн сонгосон утга; `''` = бүгд */
  facet: Record<FacetKey, string>;
  col: ColFilter;
  /**
   * БАГАНЫ ТОЛГОЙН СОНГОЛТ — ArcGIS-ийн атрибут хүснэгтийн маягаар.
   *
   * Утга нь `cellText`-ийн гаралт, өөрөөр хэлбэл хэрэглэгчийн ХАРЖ БУЙ мөр
   * (түүхий утга биш) — жагсаалтад дарсан зүйл нь хүснэгтэд харагдсантайгаа
   * заавал таарна.
   */
  pick?: Record<string, string[]>;
};

export const EMPTY_FILTER: FinFilter = {
  q: '', facet: { pkg: '', year: '', type: '' }, col: {}, pick: {},
};

export const isDirty = (f: FinFilter): boolean =>
  f.q.trim() !== ''
  || (['pkg', 'year', 'type'] as FacetKey[]).some((k) => f.facet[k] !== '')
  || Object.values(f.col).some((v) => v.trim() !== '')
  || Object.values(f.pick ?? {}).some((v) => v.length > 0);

/* ──────────────────────── ЯЛГААТАЙ УТГУУД ──────────────────────────── */

/**
 * Багана/нүүрний ялгаатай утга — эрэмбэлсэн, давхардалгүй.
 */
export function distinct(rows: Row[], valueOf: (r: Row) => string): string[] {
  const set = new Set<string>();
  let blank = false;
  for (const r of rows) {
    const v = valueOf(r);
    if (v === '') blank = true; else set.add(v);
  }
  const out = [...set].sort((a, b) => a.localeCompare(b, 'mn'));
  if (blank) out.push('');
  return out;
}

export const facetValues = (rows: Row[], fc: Facet): string[] => distinct(rows, fc.valueOf);

/* ─────────────────────── ТООН ШҮҮЛТИЙН ЖИЖИГ ХЭЛ ───────────────────── */

/**
 * `'>1000'` · `'>=5e6'` · `'<200'` · `'<=0'` · `'100..200'` → предикат.
 * Танихгүй хэлбэрт `null` — дуудагч нь ТЕКСТЭЭР «агуулна» руу унана.
 */
/**
 * Нэг тооны бичлэг → тоо; танихгүй бол `NaN`.
 */
function numOf(tok: string, pct: boolean): number {
  const t = tok.replace(/[\s ]/g, '');
  if (!t.includes(',')) return Number(t);
  if (t.includes('.')) {
    if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) return Number(t.replace(/,/g, ''));
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
    return NaN;
  }
  if (/^-?\d{1,3}(,\d{3}){2,}$/.test(t)) return Number(t.replace(/,/g, ''));
  if (!/^-?\d+,\d+$/.test(t)) return NaN;
  if (!pct && /^-?[1-9]\d{0,2},\d{3}$/.test(t)) return Number(t.replace(',', ''));
  return Number(t.replace(',', '.'));
}

export function numTest(expr: string, pct = false): ((v: number) => boolean) | null {
  const s = expr.trim();
  if (s === '') return null;

  const range = /^(-?[\d.,]+(?:e[+-]?\d+)?)\s*\.\.\s*(-?[\d.,]+(?:e[+-]?\d+)?)$/i.exec(s);
  if (range) {
    const a = numOf(range[1], pct);
    const b = numOf(range[2], pct);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return (v) => v >= lo && v <= hi;
  }

  const cmp = /^(>=|<=|>|<|=)\s*(-?[\d.,]+(?:e[+-]?\d+)?)$/i.exec(s);
  if (cmp) {
    const x = numOf(cmp[2], pct);
    if (!Number.isFinite(x)) return null;
    switch (cmp[1]) {
      case '>': return (v) => v > x;
      case '>=': return (v) => v >= x;
      case '<': return (v) => v < x;
      case '<=': return (v) => v <= x;
      default: return (v) => v === x;
    }
  }
  return null;
}

/* ──────────────────────────── ТААРУУЛАЛТ ───────────────────────────── */

/** Том/жижиг үсэг ялгахгүй «агуулна» */
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());

/**
 * Нэг нүд шүүлтэнд нийцэх үү.
 */
function cellMatches(raw: unknown, shown: string, needle: string, numeric: boolean, scale = 1): boolean {
  const s = needle.trim();
  if (s === '') return true;

  if (numeric) {
    const t = numTest(s, scale !== 1);
    if (t) {
      if (raw == null || String(raw).trim() === '') return false;
      const x = scale === 1 ? Number(raw) : Number((Number(raw) * scale).toPrecision(12));
      return Number.isFinite(x) && t(x);
    }
  }
  if (has(shown, s)) return true;
  return raw != null && has(String(raw), s);
}

/**
 * Мөр шүүлтэнд нийцэх үү.
 *
 * `cellText` нь `Finance.tsx`-ийн `fmtCell`-ээс ирнэ — форматлалт НЭГ газар
 * тодорхойлогдож, шүүлт нь хэрэглэгчийн ХАРЖ БУЙ зүйлтэй тохирно.
 */
export function rowMatches(
  r: Row,
  cols: FieldDef[],
  f: FinFilter,
  facets: Facet[],
  cellText: (v: unknown, type: string, name: string) => string,
  isNumeric: (type: string) => boolean,
  /** Баганын тоон ХЭМЖЭЭС — харагдах утга = түүхий × scale (анхдагч 1); `cellMatches` */
  numScale: (name: string) => number = () => 1,
): boolean {
  /* ── Нүүрнүүд — ЧАНАСАН утгаар яг тэнцүү ── */
  for (const fc of facets) {
    const want = f.facet[fc.key];
    if (want !== '' && fc.valueOf(r) !== want) return false;
  }

  /* ── Багана бүрийн шүүлт ── */
  for (const c of cols) {
    const needle = f.col[c.name];
    if (!needle || needle.trim() === '') continue;
    if (!cellMatches(r[c.name], cellText(r[c.name], c.type, c.name), needle, isNumeric(c.type), numScale(c.name))) return false;
  }

  /* ── Толгойн сонголт — сонгосон утгуудын АЛЬ НЭГТЭЙ яг тэнцүү ── */
  const picks = f.pick;
  if (picks) {
    for (const c of cols) {
      const want = picks[c.name];
      if (!want || want.length === 0) continue;
      if (!want.includes(cellText(r[c.name], c.type, c.name))) return false;
    }
  }

  /* ── Чөлөөт хайлт — багана БҮРИЙН аль нэгэнд таарвал болно ── */
  const q = f.q.trim();
  if (q === '') return true;
  for (const c of cols) {
    const raw = r[c.name];
    if (raw == null || raw === '') continue;
    if (has(cellText(raw, c.type, c.name), q) || has(String(raw), q)) return true;
  }
  return false;
}
