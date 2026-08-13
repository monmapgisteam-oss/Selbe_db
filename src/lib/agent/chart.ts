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

/** Агентын гаргах график */
export type ChartSpec = {
  /** bar = хэвтээ (ангилал олон) · column = босоо · line = хугацааны цуваа · pie = бүтэц */
  type: 'bar' | 'column' | 'line' | 'pie';
  title?: string;
  unit?: string;
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

  const type = String(o.type ?? '').toLowerCase();
  if (!['bar', 'column', 'line', 'pie'].includes(type)) return null;

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

  // ⚠️ Нэг цэгээр график зурах утгагүй — тоог нь өгүүлбэрт бичих нь дээр
  if (data.length < 2) return null;

  return {
    type: type as ChartSpec['type'],
    title: o.title ? String(o.title).trim() : undefined,
    unit: o.unit ? String(o.unit).trim() : undefined,
    data,
  };
}
