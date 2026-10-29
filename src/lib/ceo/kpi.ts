/**
 * CEO-ГИЙН САМБАРЫН ҮЗҮҮЛЭЛТИЙН ГЭРЭЭ — ачаалагч бүрийн буцаах ГАНЦ хэлбэр.
 */
import { t as tr } from '@/lib/i18nCore';
import type { Level } from '@/lib/kpiLevels';
import type { Cell, DetailTable } from '@/lib/schemDetail';
import type { MetricKind } from '@/lib/schem';

export type { Cell, DetailTable, Level, MetricKind };

/** Нэр заасан анхааруулга — «Багц 3.2 · Гал түймрийн дүгнэлт — зөвшөөрөөгүй» */
export type KpiIssue = { text: string; tone: 'bad' | 'warn' };

export type KpiResult = {
  /**
   * ГОЛ ТОО — форматласан текст. Мөнгө бол `mnt()` (бүтэн, таслалтай —
   * товчлол ХОРИОТОЙ, `format.ts`-ийн тайлбар), хувь бол `pct()`, тоо бол
   * `num()`. Хэмжигдээгүй бол «—».
   */
  value: string;
  /** Гол тооны нэгж/утгыг заах 1–3 үг — «ажил хэтэрсэн», «багц хоцорсон» */
  unit: string;
  /**
   * ХОЁРДУГААР МӨР — зөвхөн БОДИТ ТОО бүхий богино хэсгүүд; самбар «·»-ээр
   * холбож зурна. Хамгийн ихдээ 3–4 хэсэг.
   */
  facts: string[];
  level: Level;
  /**
   * БҮРЭН ЖАГСААЛТУУД — асуудалтай мөр бүр НЭРТЭЙ (багц · ажил · компани …).
   * Эхний хүснэгт нь хамгийн чухал нь (самбар эхлээд түүнийг зурна).
   */
  tables: DetailTable[];
  /** Нэр заасан анхааруулгууд — хүснэгтээс гадна онцлох зүйл */
  issues: KpiIssue[];
  /** Өгөгдлийн агшин (epoch ms) — эх сурвалжид огноо байвал; үгүй бол null */
  asOf: number | null;
  /**
   * ТАТАГДААГҮЙ эх сурвалжийн нэрс. Хоосон = бүгд амжилттай.
   */
  failedSources: string[];
};

/* ══════════════ Туслахууд ══════════════ */

/** Хүснэгтийн нүд — `v === null` нь ҮРГЭЛЖ «—» */
export const cell = (v: string | number | null | undefined, kind?: MetricKind): Cell => (
  kind ? { v: v ?? null, kind } : { v: v ?? null }
);

/**
 * Жагсаалтын ДЭЭД ХЯЗГААР. `schemDetail`-ийн 40-өөс ХАМААГҮЙ их — CEO самбар
 * нь «бүгдийг харах» газар. Хязгаар нь зөвхөн хөтчийг хамгаална.
 */
export const ROW_CAP = 300;

/**
 * Мөрүүдийг таслаж, тасалсан тоог СҮҮЛИЙН МӨР болгож ил үлдээнэ.
 */
export function capRows(rows: Cell[][], cols: number, cap = ROW_CAP): Cell[][] {
  if (rows.length <= cap) return rows;
  const hidden = rows.length - cap;
  const tail: Cell[] = [cell(tr('… бас {0} мөр', hidden))];
  while (tail.length < cols) tail.push(cell(''));
  return [...rows.slice(0, cap), tail];
}

/**
 * Хүснэгт угсрах — багана/мөрийн тоо таарахыг ЭНД баталгаажуулна.
 *
 *    Асуудал: таслалт нь багцаар шүүхээс ӨМНӨ хийгддэг байв. «Хагас бүрдсэн
 *    ажлууд» гэх мэт мянган мөртэй хүснэгтэд мөрүүд багц багцаараа ДАРААЛАН
 *    нийлдэг тул эхний 300-д эхний 1–2 багц л багтаж, «Багц 4.2» сонгоход
 *    жагсаалт ХООСОН гардаг байлаа — файлын толгой дахь «БҮРЭН ЖАГСААЛТ
 *    ЗААВАЛ» гэсэн гэрээг шууд зөрчинө.
 *
 *    Шийдэл: `rows` нь урьдын адил таслагдсан (шүүлтгүй харагдац, тестүүд энэ
 *    зан төлөв дээр тулгуурладаг), харин `rowsFull` нь БҮТЭН — `filterTable`
 *    багцаар шүүхдээ түүнийг уншиж, шүүсний ДАРАА дахин таслана.
 */
export function table(title: string, cols: string[], rows: Cell[][]): DetailTable {
  for (const r of rows) {
    if (r.length !== cols.length) {
      throw new Error(`ceo table «${title}»: ${cols.length} багана, мөрөнд ${r.length} нүд`);
    }
  }
  const cut = capRows(rows, cols.length);
  return cut === rows ? { title, cols, rows } : { title, cols, rows: cut, rowsFull: rows };
}

/**
 * Хэд хэдэн үзүүлэлтийн ХАМГИЙН МУУ түвшин — картын дохио.
 */
export function worstOf(levels: readonly Level[]): Level {
  if (levels.includes('bad')) return 'bad';
  if (levels.includes('warn')) return 'warn';
  if (levels.includes('good')) return 'good';
  if (levels.includes('unknown')) return 'unknown';
  return 'neutral';
}

/**
 * Хэсэгчилсэн уналттай ачаалалтын нийтлэг хэлбэр — `Promise.allSettled`-ийн
 * үр дүнг ялгана. Унасан эхийн нэрс `failedSources` руу очно.
 */
export function settled<T>(
  results: readonly PromiseSettledResult<T>[],
  names: readonly string[],
): { ok: T[]; failed: string[] } {
  const ok: T[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else failed.push(names[i] ?? String(i));
  });
  return { ok, failed };
}

/**
 * БҮРЭН үр дүн мөн эсэх — `live.cached`-ийн `keep` (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export const kpiComplete = (k: Pick<KpiResult, 'failedSources'>): boolean => k.failedSources.length === 0;

/** Хоног — epoch ms хоёрын зөрүү, доош бүхэлчилж, сөрөг бол 0 */
export const daysBetween = (from: number, to: number): number => (
  Math.max(0, Math.floor((to - from) / 86_400_000))
);
