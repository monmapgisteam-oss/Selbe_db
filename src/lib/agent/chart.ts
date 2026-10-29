/**
 * АГЕНТЫН ГРАФИКИЙН ТОДОРХОЙЛОЛТ — задлан шинжлэх ЦЭВЭР логик.
 */

/** Агентын гаргах графикийн төрлүүд */
export const CHART_TYPES = ['bar', 'column', 'line', 'pie', 'stack', 'gauge'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Агентын гаргах график */
export type ChartSpec = {
  /**
   * bar    — хэвтээ багана: ангилал ХАРЬЦУУЛАХ (шошго урт байхад)
   * column — босоо багана: цөөн үеийг зэрэгцүүлэх
   * line   — шугам: хугацааны цуваа
   * pie    — дугуй: бүтэц, эзлэх хувь
   * stack  — нэг эгнээнд давхарласан: нийтэд эзлэх хувь (нийлбэр = 100%)
   * gauge  — ганц хувийн заалт (0–100), жишээ нь нийт гүйцэтгэл
   */
  type: ChartType;
  title?: string;
  unit?: string;
  /** Графикийн ДООД талд гарах тайлбар — юуг харуулж байгаа, гол дүгнэлт */
  note?: string;
  data: { label: string; value: number | null }[];
};

/** Цоорхой (null) зөвшөөрөх төрлүүд — тэнхлэгтэй (ангилал/хугацаа) графикууд */
const GAP_OK: readonly ChartType[] = ['bar', 'column', 'line'];

export const MAX_POINTS = 12;

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // «1,788» ба «19.7 » зэрэг загварын түгээмэл бичиглэлийг залруулна
  const s = v.replace(/[\s,]/g, '');
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

/**
 * Агентын гаргасан бичвэрийг `ChartSpec` болгоно.
 * Хэлбэр таарахгүй бол `null` — дуудагч блокийг алгасна.
 */
export function parseChart(raw: string): ChartSpec | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;

  const type = String(o.type ?? '').toLowerCase() as ChartType;
  if (!CHART_TYPES.includes(type)) return null;

  if (!Array.isArray(o.data)) return null;
  const gaps = GAP_OK.includes(type);
  const data = o.data
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const r = d as Record<string, unknown>;
      const value = r.value == null ? null : num(r.value);
      const label = String(r.label ?? '').trim();
      if (!label) return null;
      return value != null || gaps ? { label, value } : null;
    })
    .filter((d): d is { label: string; value: number | null } => !!d)
    .slice(0, MAX_POINTS);

  const need = type === 'gauge' ? 1 : 2;
  if (data.filter((d) => d.value != null).length < need) return null;

  /**
   * Урьд нь `value <= 1` бол «загвар бутархай илгээсэн» гэж үзээд 100-аар
   * үржүүлдэг байв. Гэвч энэ төсөлд ЖИНХЭНЭ 1%-иас бага заалт бодитоор
   * тохиолддог (гүйцэтгэл 0.4%, зарим багцын хувь бүр бага) — тэдгээр нь
   * чимээгүй 40% болж, зүү нь бараг хагаст очиж ХУДАЛ уншигдана.
   * Хэмжээсийн алдаа нүдээр илэрдэггүй тул хамгийн аюултай төрөл.
   *
   * Одоо: хуваарьт багтахгүй утгыг хөрвүүлэхийн оронд ГРАФИКИЙГ
   * ТАТГАЛЗАНА — тоо нь өгүүлбэрт хэвээр гарна, зөвхөн худал зурагдахаас
   * сэргийлнэ. Зөв хуваарийг `registry.ts`-ийн зааварт ил бичсэн.
   */
  const g = data[0].value;
  if (type === 'gauge' && (g == null || g < 0 || g > 100)) return null;

  return {
    type,
    title: o.title ? String(o.title).trim() : undefined,
    unit: o.unit ? String(o.unit).trim() : undefined,
    note: o.note ? String(o.note).trim() : undefined,
    data,
  };
}
