/**
 * CEO-ГИЙН САМБАРЫН ҮЗҮҮЛЭЛТИЙН ГЭРЭЭ — ачаалагч бүрийн буцаах ГАНЦ хэлбэр.
 *
 * ⚠️ 2026-09-06, хэрэглэгчийн шийдвэр: нүүрийн самбар нь схем-зангилаа биш,
 * CEO-гийн өөрөө нэрлэсэн 14 үзүүлэлт (обьёмын зөрүү, IPC, газар чөлөөлөлт,
 * хяналтын хоцролт, QAQC, ХАБЭА, хүн·техник, зөвшөөрөл, тохиромжтой байдал,
 * IoT …). Хуучин `HomeBoard`/`execMetrics`/`kpiNodes` бүрмөсөн хасагдав.
 *
 * ⚠️ ЯАГААД ГАНЦ ХЭЛБЭР ВЭ. Үзүүлэлт бүр ӨӨР эх сурвалж, өөр нэгжтэй
 * (₮ · хоног · талбар · бүс · хэмжигдэхүүн). Самбар нь тэдгээрийг НЭГ ИЖИЛ
 * картаар зурах ёстой — эс бөгөөс 13 карт 13 өөр загвартай болж «ойлгомжгүй»
 * гэсэн анхны гомдол буцаж ирнэ. Тиймээс ачаалагч нь ТООЦООГ хийж, самбар
 * нь ЗӨВХӨН ДҮРСЭЛНЭ; хоёрын завсар нь энэ файл.
 *
 * ⚠️ ТАЙЛБАР ПРОЗО ХОРИОТОЙ (хэрэглэгч: «тайлбар биш бодит үзүүлэлт гарахад
 * л болно»). `facts` нь ЗӨВХӨН тоо бүхий богино хэсгүүд — «43 ажил»,
 * «2 багц уншигдаагүй». Өгүүлбэр, «яагаад» тайлбар — байхгүй.
 *
 * ⚠️ БҮРЭН ЖАГСААЛТ ЗААВАЛ (хэрэглэгч: «энэ цонхноос бүрэн асуудалтай бүх
 * зүйлээ харж чаддаг байх ёстой»). `tables` нь асуудалтай мөр БҮРИЙГ НЭРЭЭР
 * нь агуулна — тоолуур хангалтгүй. Таслах бол `capRows` — тасалсан тоог
 * мөр болгож ИЛ үлдээнэ, чимээгүй хаяхгүй.
 *
 * ⚠️ `null` ≠ 0 (төслийн үндсэн дүрэм): хэмжигдээгүй утгыг `cell(null)`
 * өгнө → «—». Тэгээр орлуулбал «тэг үзүүлэлт» гэж худал уншигдана.
 *
 * ⚠️ `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ — `kind: 'pct'` нүдэнд 0–100 утга өгнө.
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
   * ⚠️ Хэсэгчилсэн уналтыг НУУХГҮЙ: 10 багцын 2 нь уншигдаагүй бол доорх тоо
   *    дутуу суурин дээр бодогдсон — хэрэглэгч үүнийг мэдэх ёстой.
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
 * ⚠️ `cols` тоогоор хоосон нүд нэмнэ — багана зөрвөл хүснэгт эвдэрнэ.
 */
export function capRows(rows: Cell[][], cols: number, cap = ROW_CAP): Cell[][] {
  if (rows.length <= cap) return rows;
  const hidden = rows.length - cap;
  const tail: Cell[] = [cell(tr('… бас {0} мөр', hidden))];
  while (tail.length < cols) tail.push(cell(''));
  return [...rows.slice(0, cap), tail];
}

/** Хүснэгт угсрах — багана/мөрийн тоо таарахыг ЭНД баталгаажуулна */
export function table(title: string, cols: string[], rows: Cell[][]): DetailTable {
  for (const r of rows) {
    if (r.length !== cols.length) {
      throw new Error(`ceo table «${title}»: ${cols.length} багана, мөрөнд ${r.length} нүд`);
    }
  }
  return { title, cols, rows: capRows(rows, cols.length) };
}

/**
 * Хэд хэдэн үзүүлэлтийн ХАМГИЙН МУУ түвшин — картын дохио.
 * ⚠️ `loading`/`unknown`/`neutral` нь дохио БИШ: «хараахан мэдэхгүй»-г
 *    улаан/шар болгож болохгүй. Дохио огт байхгүй бол `neutral`.
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

/** Хоног — epoch ms хоёрын зөрүү, доош бүхэлчилж, сөрөг бол 0 */
export const daysBetween = (from: number, to: number): number => (
  Math.max(0, Math.floor((to - from) / 86_400_000))
);
