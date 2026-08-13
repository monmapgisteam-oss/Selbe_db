/**
 * АГЕНТЫН ГРАФИКИЙН ТОДОРХОЙЛОЛТ — задлан шинжлэх ЦЭВЭР логик.
 *
 * ⚠️ ЯАГААД `AgentChart.tsx`-ЭЭС САЛГАСАН БЭ: тэр файл React компонент ба CSS
 * модуль импортолдог тул Node-ийн шалгуураас шууд дуудаж болохгүй. Задлан
 * шинжлэлийг энд байлгаснаар `chart.check.mjs` нь ЯГ ЭНЭ кодыг шалгана
 * (хуулбарыг биш). `format.ts` мөн ижил шалтгаанаар салгагдсан.
 *
 * ⚠️ Загварын гаргасан JSON нь ТӨГС БАЙХ БАТАЛГААГҮЙ: тоог хашилтад бичих,
 * мянгатын таслал үлдээх, нэг цэг өгөх, хогтой мөр оруулах нь бодитоор
 * тохиолддог. Функц эдгээрийг ЗАСАХ эсвэл ХАСАХ ёстой — хэзээ ч шидэхгүй.
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
  data: { label: string; value: number }[];
};

/**
 * Палитр — дашбоардын өнгөтэй нэг ая. Эхний өнгө нь порталын үндсэн хөх.
 *
 * ⚠️ ӨНГИЙГ АГЕНТ СОНГОХГҮЙ. Загвар өнгө нэрлэвэл хариулт бүрт өөр өөр,
 * заримдаа уншигдахгүй өнгө гарна. Ангиллын тоо палитраас хэтэрвэл давтана.
 */
export const PALETTE = [
  '#3387b8', '#22c55e', '#f59e0b', '#a855f7', '#ef4444',
  '#14b8a6', '#6366f1', '#ec4899', '#84cc16', '#0891b2',
];

/**
 * ⚠️ Хэт олон багана нарийн чат цонхонд шошгогүй зураас болно. 12-оор
 * тасална — заавар нь загварт «хамгийн чухал 12-ыг ав» гэж хэлдэг.
 */
export const MAX_POINTS = 12;

const num = (v: unknown): number | null => {
  // «1,788» ба «19.7 » зэрэг загварын түгээмэл бичиглэлийг залруулна
  const x = typeof v === 'string' ? Number(v.replace(/[\s,]/g, '')) : Number(v);
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
  const data = o.data
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const r = d as Record<string, unknown>;
      const value = num(r.value);
      const label = String(r.label ?? '').trim();
      return label && value != null ? { label, value } : null;
    })
    .filter((d): d is { label: string; value: number } => !!d)
    .slice(0, MAX_POINTS);

  /*
   * ⚠️ `gauge` нь ГАНЦ утгын заалт тул нэг цэгээр хангалттай — бусад төрөлд
   * нэг цэгээр график зурах утгагүй (тоог нь өгүүлбэрт бичих нь дээр).
   */
  const need = type === 'gauge' ? 1 : 2;
  if (data.length < need) return null;

  /*
   * ⚠️ `gauge` нь 0–100 хувийн хуваарьтай. Загвар заримдаа бутархай (0.182)
   * илгээдэг — тэр чигээр нь зурвал зүү бараг тэг дээр зогсоно. 0–1 хооронд
   * ирвэл хувь болгож хөрвүүлнэ. (1-ээс их бол аль хэдийн хувь.)
   */
  if (type === 'gauge' && data[0].value > 0 && data[0].value <= 1) {
    data[0] = { ...data[0], value: data[0].value * 100 };
  }

  return {
    type,
    title: o.title ? String(o.title).trim() : undefined,
    unit: o.unit ? String(o.unit).trim() : undefined,
    note: o.note ? String(o.note).trim() : undefined,
    data,
  };
}
