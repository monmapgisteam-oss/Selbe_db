/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛИЙН ШҮҮЛТ — цэвэр логик, React-гүй.
 *
 * «Санхүүжилт» харагдацын хоёр бүртгэл (`cashflow_0813` 36 багана ·
 * `ipc_0813` 33 багана) нь урьд нь шүүлтгүй байв. Хэрэглэгчийн хүсэлт
 * (2026-09-01): багц · он · төрлөөр, мөн БАГАНА БҮРЭЭР шүүх, багцаар бүлэглэн
 * харах.
 *
 * ⚠️ Бүх мөр аль хэдийн санах ойд байдаг (209 ба 59 мөр — `loadFinRegister`)
 * тул шүүлт нь КЛИЕНТ дээр. Серверийн `where` руу шилжүүлбэл кэш
 * (`cached(…, ['CASHFLOW2'])`) шүүлт бүрд хүчингүй болж, сүлжээ дэмий эзэлнэ.
 *
 * ⚠️ React импортлохгүй — `finFilter.check.mjs` шууд Node дээр ачаална.
 */
import { t as tr } from '@/lib/i18nCore';

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
  /* ⚠️ EPOCH-ыг ЭХЭЛЖ шалгана. `1767225600000`-ийн эхний 4 орон нь «1767» —
     огнооны хэв шинжийг түрүүлж тааруулбал 1767 он гэж уншина. */
  const n = Number(s);
  if (/^\d{11,}$/.test(s) && Number.isFinite(n)) {
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return String(d.getUTCFullYear());
  }
  /* `YYYY-MM-DD`, `YYYY/MM/DD` эсвэл дан `YYYY` */
  const m = /^(\d{4})(?:[-/]|$)/.exec(s);
  return m ? m[1] : '';
};

/**
 * Үйлчилгээ бүрийн ГУРВАН нүүр.
 *
 * ⚠️ Талбарын код хоёр үйлчилгээнд ӨӨР — кодыг нэг газар (энд) бичиж,
 *    `Finance.tsx` нь зөвхөн `dataKey`-гээр сонгоно.
 *
 * ⚠️ IPC-д «Жил» ТАЛБАР БАЙХГҮЙ. `IPC09` «Хамрах хугацаа: эхлэх»-ийн жилээр
 *    гаргана — шошгыг «Он (хамрах хугацаа)» гэж ТОДОРХОЙ бичнэ, эс бөгөөс
 *    хэрэглэгч аль огнооны жил болохыг мэдэхгүй.
 */
export const FIN_FACETS: Record<'CASHFLOW2' | 'IPC_LOG', Facet[]> = {
  CASHFLOW2: [
    { key: 'pkg', label: tr('Багц'), allLabel: tr('Бүх багц'), valueOf: (r) => clean(r.CF006) },
    { key: 'year', label: tr('Он'), allLabel: tr('Бүх он'), valueOf: (r) => clean(r.CF003) },
    { key: 'type', label: tr('Үеийн төрөл'), allLabel: tr('Бүх төрөл'), valueOf: (r) => clean(r.CF002) },
  ],
  IPC_LOG: [
    { key: 'pkg', label: tr('Багц'), allLabel: tr('Бүх багц'), valueOf: (r) => clean(r.IPC03) },
    {
      key: 'year',
      label: tr('Он (хамрах хугацаа)'),
      allLabel: tr('Бүх он'),
      valueOf: (r) => yearOf(r.IPC09),
    },
    { key: 'type', label: tr('Актын төрөл'), allLabel: tr('Бүх төрөл'), valueOf: (r) => clean(r.IPC06) },
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
};

export const EMPTY_FILTER: FinFilter = { q: '', facet: { pkg: '', year: '', type: '' }, col: {} };

export const isDirty = (f: FinFilter): boolean =>
  f.q.trim() !== ''
  || (['pkg', 'year', 'type'] as FacetKey[]).some((k) => f.facet[k] !== '')
  || Object.values(f.col).some((v) => v.trim() !== '');

/* ──────────────────────── ЯЛГААТАЙ УТГУУД ──────────────────────────── */

/**
 * Багана/нүүрний ялгаатай утга — эрэмбэлсэн, давхардалгүй.
 *
 * ⚠️ Хоосон нь ТӨГСГӨЛД тусдаа хувин (`''`) болж үлдэнэ — «хоосон мөрүүдийг
 *    хараад алдаа хайх» нь энэ бүртгэлийн бодит хэрэглээ.
 * ⚠️ Чанасан утгаар бүлэглэнэ: `'Багц 4.1 '` ба `'Багц 4.1'` НЭГ утга
 *    (эх өгөгдөлд арын зайтай хувилбарууд бодитоор байгаа).
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
 *
 * ⚠️ Мянгатын таслал зөвшөөрнө (`'>1,000,000'`) — хэрэглэгч хүснэгтээс
 *    хуулж наана.
 */
export function numTest(expr: string): ((v: number) => boolean) | null {
  const s = expr.trim().replace(/,/g, '');
  if (s === '') return null;

  const range = /^(-?[\d.]+(?:e[+-]?\d+)?)\s*\.\.\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(s);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return (v) => v >= lo && v <= hi;
  }

  const cmp = /^(>=|<=|>|<|=)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(s);
  if (cmp) {
    const x = Number(cmp[2]);
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
 *
 * ⚠️ ХОЁР дүрслэлээр жишнэ: харагдах текст («4,058,800,000») БА түүхий утга
 *    («4058800000»). Хэрэглэгч хоёуланг нь бичдэг — зөвхөн нэгээр нь жишвэл
 *    «яагаад олдохгүй байна вэ» гэсэн чимээгүй бүтэлгүйтэл болно.
 */
function cellMatches(raw: unknown, shown: string, needle: string, numeric: boolean): boolean {
  const s = needle.trim();
  if (s === '') return true;

  if (numeric) {
    const t = numTest(s);
    if (t) {
      const x = Number(raw);
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
  cellText: (v: unknown, type: string) => string,
  isNumeric: (type: string) => boolean,
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
    if (!cellMatches(r[c.name], cellText(r[c.name], c.type), needle, isNumeric(c.type))) return false;
  }

  /* ── Чөлөөт хайлт — багана БҮРИЙН аль нэгэнд таарвал болно ── */
  const q = f.q.trim();
  if (q === '') return true;
  for (const c of cols) {
    const raw = r[c.name];
    /* ⚠️ Хоосон нүдийг ОГТ шалгахгүй: `''.includes(x)` нь худал эерэг өгөхгүй ч
       хоосон нүд дээр цаг дэмий үрэхээс гадна, доорх түүхий харьцуулалт нь
       `String(null)` = `'null'` болж «null» гэж хайхад таарах эрсдэлтэй. */
    if (raw == null || raw === '') continue;
    if (has(cellText(raw, c.type), q) || has(String(raw), q)) return true;
  }
  return false;
}
