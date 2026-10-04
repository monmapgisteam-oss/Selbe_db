'use client';

/**
 * ТООЦООЛОГДДОГ ҮЗҮҮЛЭЛТҮҮД — ArcGIS дээр БАЙХГҮЙ, кодод бодогддог тоонууд.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: «Барилгын хяналт» дашбоардын толгойн 18.3% нь
 * `mon:building.GUITS_HV`-ийн дундаж (≈13%) БИШ. Тэр нь ажлын хуудсын үе шатуудаас
 * `blockProgress.ts`-д тооцоологддог. Агент зөвхөн ArcGIS-ээс уншвал дэлгэц дээрх
 * тоог ХЭЗЭЭ Ч давтаж чадахгүй — хэрэглэгч «буруу хариулж байна» гэж үзнэ.
 *
 * ⚠️ ТООЦООГ ДАХИН БИЧИХГҮЙ: `loadBlockProgress()`-ыг ЯГ дууддаг. Тэр нь порталын
 * `Tsogts`, `BuildingPanel` хоёрын ашигладаг ижил функц. Хуулбарлавал агентын
 * тоо дэлгэц дээрхээс зөрөх өдөр ирнэ.
 */

import { loadBlockProgress, loadBlockUniverse, latestMean, pkgProgressOf, universeKeys } from '@/lib/blockProgress';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { LAYER_BY_ID, bagtsKey, buildingKey, layerUrl } from '@/lib/services';
import { resolveSource, type AgentScope } from './registry';

export type BlockRow = {
  bagts: string;
  blok: string;
  ail: number;
  company: string;
  /** Ажлын хуудсаас тооцоолсон БОДИТ гүйцэтгэл, % (0–100); тайлангүй блок 0 */
  actual: number;
  /** Хамгийн сүүлийн мэдээний огноо — тайлангүй бол '' */
  date: string;
};

export type BuildingProgress = {
  /** Бөглөх хуудасны БҮХ блок (хуваарь) */
  blocks: number;
  ail: number;
  /**
   * Бүх блокийн ЭНГИЙН дундаж, тайлангүй блок 0% (`blockProgress.latestMean`) — Дашбоард 04-ийн
   * «Блокийн дундаж гүйцэтгэл» бөгжтэй нэг тоо.
   */
  overall: number | null;
  /**
   * ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛ — багцын ХО дүнгээр жигнэсэн (`Finance.physNow`) — дашбоардын
   * ТОЛГОЙН «Биет гүйцэтгэл (багцаар)», PkgProg, удирдлагын тайлантай нэг тоо. Санхүүгийн
   * өгөгдөл уншигдаагүй бол `null` (0 БИШ).
   */
  housing: number | null;
  /** Багц бүр — `pkgProgressOf` (бүх блокоор, тайлангүй 0%) */
  byBagts: { bagts: string; blocks: number; reported: number; ail: number; actual: number }[];
  /** Хамгийн хоцорсон 10 блок (ТАЙЛАГНАСАН блокоос) */
  slowest: BlockRow[];
  /**
   * ⚠️ ТАЙЛАН ИРЭЭГҮЙ блокийн тоо. `overall`/`byBagts` нь тэдгээрийг 0% гэж тооцдог.
   */
  noReport: number;
  note: string;
};

/**
 * Барилгын гүйцэтгэл — ажлын (бөглөх) хуудсаар тооцоолсон.
 *
 * ⚠️ 2026-10-04: ХУВААРЬ нь БӨГЛӨХ ХУУДАСНЫ блок (`loadBlockUniverse` → `universeKeys`), газрын
 *    зургийн feature БИШ. Урьд нь `mon:building`-ийн feature-ээр гүйлгэдэг тул давхардсан
 *    полигон (29/1, 5/6) хоёр тоологдож, footprint-гүй хэмжилт (29/3, 5/8) хаягддаг — агентын
 *    тоо дэлгэцээс (`pkgProgressOf`/`latestMean`/`physNow`) зөрдөг байв. Давхарга ЗӨВХӨН
 *    айл, гүйцэтгэгч, багцын уншигдах нэрэнд.
 * ⚠️ Тайлагнаагүй блок 0% (2026-10-01-ний хэрэглэгчийн шийдвэр) — бүх дэлгэцтэй нэг дүрэм.
 */
export async function buildingProgress(scope: AgentScope): Promise<BuildingProgress> {
  // ⚠️ Эрхийн шалгалт — тооцоолсон ч гэсэн эх өгөгдөл нь давхарга
  const src = resolveSource('mon:building', scope);
  if (!src) throw new Error(tr('`mon:building` давхаргад хандах эрх алга.'));

  const l = LAYER_BY_ID['mon:building'];
  const [rows, prog, uni, housing] = await Promise.all([
    queryFeatures(layerUrl(l), { outFields: ['BAGTS', 'BLOK', 'AIL_TOO', 'BAR_COMP'] }),
    loadBlockProgress(),
    loadBlockUniverse(),
    /* ⚠️ ДИНАМИК импорт — `Finance.tsx` нь React модуль (`ceo/contractGap`-ийн ⚠️).
       Унавал `null` («мэдэгдэхгүй»), бусад тоог унагахгүй. */
    import('@/modules/Finance')
      .then(async (F) => F.physNow(await F.loadFinData()))
      .catch(() => null),
  ]);

  /* давхаргын feature → айл, гүйцэтгэгч; багцын уншигдах нэр (давхардсан feature НЭГ удаа) */
  const feat = new Map<string, { ail: number; company: string }>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    const bagts = String(r.BAGTS ?? '');
    const k = buildingKey(bagts, String(r.BLOK ?? ''));
    if (bagts) nameOf.set(bagtsKey(bagts), bagts);
    if (feat.has(k)) continue;
    feat.set(k, { ail: Number(r.AIL_TOO ?? 0), company: String(r.BAR_COMP ?? '') });
  }
  const pkgOf = (key: string) => { const c = key.indexOf('|'); return c < 0 ? key : key.slice(0, c); };
  const label = (pk: string) => nameOf.get(pk) ?? pk;
  const r1 = (x: number) => Math.round(x * 10) / 10;

  const keys = universeKeys(prog, uni);
  const blocks: BlockRow[] = keys.map((key) => {
    const p = prog.get(key);
    const f = feat.get(key);
    return {
      bagts: label(pkgOf(key)),
      blok: key.slice(key.indexOf('|') + 1),
      ail: f?.ail ?? 0,
      company: f?.company ?? '',
      actual: p ? r1(p.overall) : 0,
      date: p?.date ?? '',
    };
  });
  const mean = latestMean(prog, keys);

  return {
    blocks: blocks.length,
    ail: blocks.reduce((s, b) => s + b.ail, 0),
    overall: mean.pct == null ? null : r1(mean.pct),
    housing: housing == null ? null : r1(housing),
    byBagts: [...pkgProgressOf(prog, uni).entries()]
      .map(([pk, m]) => ({
        bagts: label(pk),
        blocks: m.total,
        reported: m.blocks,
        ail: blocks.filter((b) => b.bagts === label(pk)).reduce((s, b) => s + b.ail, 0),
        actual: r1(m.pct),
      }))
      .sort((a, b) => a.actual - b.actual),
    /**
     * ⚠️ ТАЙЛАН ИРЭЭГҮЙ БЛОКИЙГ «ХОЦОРСОН» ГЭЖ НЭРЛЭХГҮЙ (2026-09-03-ны
     * аудит). Тэдгээр нь 0% гэж тоологддог тул эрэмбэлэхэд ҮРГЭЛЖ тэргүүн эгнээнд
     * гарна — хэмжигдсэнийг нь эрэмбэлж, тайлангүйг тусад нь тоолж мэдэгдэнэ.
     */
    slowest: blocks
      .filter((b) => b.date !== '')
      .sort((a, b) => a.actual - b.actual)
      .slice(0, 10),
    noReport: blocks.filter((b) => b.date === '').length,
    /* ⚠️ 2026-10-04: «зарим дэлгэц зөвхөн ТАЙЛАГНАСАН блокоор дундажладаг» гэсэн хуучин
       анхааруулга ХҮЧИНГҮЙ — бүх дэлгэц (багцын карт, тайлангийн 6.1 ч) бүх блокоор хуваадаг. */
    note:
      tr('`actual` нь АЖЛЫН ХУУДСААС тооцоолсон бодит гүйцэтгэл. ') +
      tr('⚠️ `overall` (блокийн энгийн дундаж) ба `byBagts.actual`-ийн ХУВААРЬ нь бөглөх хуудасны БҮХ блок: тайлан ирээгүй блок 0% — порталын бүх дэлгэцтэй нэг дүрэм. Дашбоардын толгойн «Биет гүйцэтгэл (багцаар)» нь `housing` (багцын ХО дүнгээр жигнэсэн) — «нийт гүйцэтгэл» гэж асуувал `housing`-ийг хэл, `overall`-ийг «блокийн дундаж» гэж нэрлэ. ') +
      tr('`noReport` нь тайлан ирээгүй блокийн тоо — хариултдаа дурьдвал зөрүү нь ойлгомжтой болно. ') +
      tr('Давхаргын хуучирсан `GUITS_HV` талбар 2026-08-24-нд эх өгөгдлөөс гарсан тул зөвхөн энэ нэг тоо бий.'),
  };
}
