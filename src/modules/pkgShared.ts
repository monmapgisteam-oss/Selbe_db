/**
 * «Багцын гүйцэтгэл» (PkgProg) ба «Багцын санхүү» (PkgFin) хоёрын НИЙТЛЭГ
 * цэвэр логик — ГАНЦ эх сурвалж.
 *
 * ⚠️ ЯАГААД (2026-09-17-ны аудит): хоёр харагдац нэг загвараас салаалсан тул
 *    ангилал (`catOf`), блокийн өнгө (`HUE`), сарын нэгтгэл (`aggregateMonths`)
 *    хоёр файлд ЯГ ИЖИЛ хуулбарлагдсан байв (~245 мөр давхардал). Нэг талд
 *    засаад нөгөөг мартвал хоёр дэлгэц зөрж, хэрэглэгч санхүүгийн тоог
 *    гүйцэтгэл гэж уншина. Хуулбар нь дараа гарвал ЭНД нэмнэ.
 *
 * ⚠️ Зөвхөн хуучин-биш, сүлжээгүй, React-гүй логик — hook/JSX энд орохгүй.
 */
import { LAYER_BY_ID, PKG_FAMILY_BY_BAGTS, PROGRESS_LEVELS } from '@/lib/services';
import { BLOCK_LAYER, type Pack } from '@/modules/Bagts';
import type { ProgPt } from '@/modules/PkgProg';
import { planPctAt, measureDayOf, type PlanPoint } from '@/lib/planProgress';
import { dayKey, num } from '@/lib/format';

/**
 * «ГҮЙЦЭТГЭЛИЙН ЯВЦ» ГРАФИКИЙН ЦЭГҮҮД — хуваарийн төлөвлөгөө (`PlanCurve`) + БИЕТ
 * гүйцэтгэл (`FinData.phys` → `MonthPt`). PkgProg ба «ТУХ» ХОЁУЛАА энэ ГАНЦ
 * функцээр (2026-09-30) — хоёр дэлгэц нэг багцад өөр муруй харуулахгүй.
 *
 * ⚠️ Хуваарь байхгүй бол `null` — cashflow руу буцаж унахгүй (PkgProg-ийн ⚠️).
 * ⚠️ Хэмжилтгүй сар `act: null` (0 биш); `planM` нь хэмжилтийн ӨДРӨӨР завсарласан.
 */
export function progMonthsOf(
  base: readonly { label: string; phys: number | null; physAt?: string | null }[] | null,
  series: readonly PlanPoint[] | undefined,
): ProgPt[] | null {
  if (!series?.length) return null;
  const phys = new Map((base ?? []).map((m) => [m.label, m]));
  const today = dayKey(Date.now());
  return series.map((p) => {
    const m = phys.get(p.label);
    const act = m?.phys ?? null;
    return {
      label: p.label,
      plan: p.pct,
      vol: p.vol,
      act,
      /* ⚠️ 2026-10-04: хэмжилтийн өдөр — `lagOf`-тэй НЭГ дүрэм (`measureDayOf`: physAt алга бол
         одоогийн сард ӨНӨӨДӨР, сарын эцэс биш — ОГТ тайлагнаагүй багцын 0% цэг) */
      planM: act == null ? null : planPctAt(series, measureDayOf(p.label, m?.physAt, today)),
    };
  });
}

/** Блокийн давхаргын өнгө — хоёр харагдацын карт/легенд ижил өнгөтэй байна */
export const HUE = LAYER_BY_ID[BLOCK_LAYER].hue;

/**
 * БАГЦЫН АНГИЛАЛ (2026-08-21, хэрэглэгчийн хүсэлт) — жагсаалт, «Төслийн
 * төрөл» chart, «Блокийн төлөв»-ийн асуудалтай талбарын тоолол гурвуулаа
 * ЭНЭ нэг ангиллыг хэрэглэнэ. Блоктой багц = барилга угсралт; бусад нь
 * PKG_TABLE-ийн гэр бүлээс: soc = нийгмийн барилга, site = өндөржилт,
 * үлдсэн (net/pow/src/com) = дэд бүтэц.
 */
export type PackCat = 'build' | 'infra' | 'soc' | 'site';
export const catOf = (p: Pack): PackCat => {
  if (p.kind === 'build') return 'build';
  const fam = PKG_FAMILY_BY_BAGTS[p.key];
  return fam === 'soc' ? 'soc' : fam === 'site' ? 'site' : 'infra';
};

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд (`aggregateMonths`) ба биет гүйцэтгэл «ОДОО» (`physNow`).
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хэрэгжилт нь `Finance.tsx`-д ШИЛЖИВ —
 *    «Багцын мэдээлэл» (`Bagts.tsx`) ч энэ тоог харуулах болсон, харин энэ файл
 *    `Bagts`-ээс утга (`BLOCK_LAYER`) импортолдог тул `Bagts → pkgShared` нь модулийн
 *    мөчлөг үүсгэнэ. Дуудагчид (PkgProg · PkgFin · ТУХ · Дашбоард) хөндөгдөөгүй — эндээс
 *    дахин экспортлоно. Дүрмүүдийн тайлбар `Finance.aggregateMonths`-д.
 */
export { aggregateMonths, physNow } from '@/modules/Finance';

/**
 * ХУВИЙН НЭГЖИЙН ЗӨРҮҮ (pp) — «бодит − төлөвлөгөө»; сөрөг = хоцорсон («-5.0 pp»).
 *
 * ⚠️ 2026-10-06 (аудит): ижил хэмжигдэхүүнийг «Гүйцэтгэл» (PkgProg) «−5.0%» / «хоцрогдол
 *    5.0%» (`toFixed`), ТУХ «-5.0 pp» (`num`) гэж ӨӨР хэлбэрээр бичдэг байв. Хувь (%) нь
 *    «төлөвлөгөөний 5%» гэж буруу уншигдах тул нэгж нь pp; тоо нь `num()` (хэлний формат).
 *    ТУХ (`tuh/Overview.pp`) ба PkgProg ХОЁУЛАА ЭНЭ функцээр.
 * @param v бодит − төлөвлөгөө, нэгж хувь (0–100 хуваарьтай); `null` → «—» (0 биш)
 */
export const pp = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${num(v, 1)} pp`;

/** Тэмдэггүй зөрүү («5.0 pp») — «хоцрогдол / түрүүлсэн» гэсэн үгтэй хамт */
export const ppAbs = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : `${num(Math.abs(v), 1)} pp`;

/**
 * БЛОКИЙН ГҮЙЦЭТГЭЛИЙН 4 ТҮВШНИЙ ТАРХАЛТ (`PROGRESS_LEVELS`) — ГАНЦ дүрэм.
 *
 * ⚠️ 2026-10-06 (аудит): «Гүйцэтгэл»-ийн «Блокийн төлөв» (PkgProg `LevelsCard`) ба удирдлагын
 *    тайлан (`execReport.prog.levels`) хоёр өөр дүрэмтэй байв — PkgProg нь тайлагнаагүй блокийг
 *    0–25%-д тоолдог (2026-10-04, 2026-10-01-ний «тайлагнаагүй блок = 0%» шийдвэр), тайлан нь
 *    зөвхөн утгатай блокийг. Нэг 113 блок хоёр дэлгэцэд өөр тархалттай гардаг байв. Одоо хоёулаа
 *    ЭНЭ функцээр: тайлагнаагүй (`progress == null`) блок 0%-иар ТООЛОГДОНО, тоо нь `noData`-д ил.
 * ⚠️ Давхардсан полигоныг дуудагч `uniqueBlocks`-оор аль хэдийн нэгтгэсэн байх ёстой.
 * ⚠️ Муж: `min ≤ v < max` (сүүлийнх нь 101 — 100% орно); мужаас гадуурх утга ирмэгт хавчигдана.
 */
export function blockLevelCounts(blocks: readonly { progress: number | null | undefined }[]): { counts: number[]; noData: number } {
  const counts: number[] = PROGRESS_LEVELS.map(() => 0);
  let noData = 0;
  for (const b of blocks) {
    if (b.progress == null) noData += 1;
    const v = b.progress ?? 0;
    let i = PROGRESS_LEVELS.findIndex((l) => v >= l.min && v < l.max);
    if (i < 0) i = v < PROGRESS_LEVELS[0].min ? 0 : PROGRESS_LEVELS.length - 1;
    counts[i] += 1;
  }
  return { counts, noData };
}

/**
 * Дэлгэц уншигчид л харагдах (нүдэнд нуугдсан) хэв — графикийн `aria-live` уншилтад.
 * ⚠️ 2026-10-06: порталд нийтлэг `.srOnly` класс алга (харагдацууд CSS хуваалцдаггүй).
 */
export const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
