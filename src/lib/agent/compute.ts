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

import { loadBlockProgress } from '@/lib/blockProgress';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { LAYER_BY_ID, buildingKey, layerUrl } from '@/lib/services';
import { resolveSource, type AgentScope } from './registry';

export type BlockRow = {
  bagts: string;
  blok: string;
  ail: number;
  company: string;
  /** Ажлын хуудсаас тооцоолсон БОДИТ гүйцэтгэл, % (0–100) */
  actual: number;
  /** Хамгийн сүүлийн мэдээний огноо */
  date: string;
};

export type BuildingProgress = {
  blocks: number;
  ail: number;
  /** Бүх блокийн дундаж БОДИТ гүйцэтгэл — дашбоардын толгойн тоо */
  overall: number;
  byBagts: { bagts: string; blocks: number; ail: number; actual: number }[];
  /** Хамгийн хоцорсон 10 блок */
  slowest: BlockRow[];
  /**
   * ⚠️ ТАЙЛАН ИРЭЭГҮЙ блокийн тоо. `overall` нь тэдгээрийг 0% гэж тооцдог
   * тул хариултад дурдвал порталын өөр тоотой зөрөх шалтгаан ойлгомжтой болно.
   */
  noReport: number;
  note: string;
};

/**
 * Барилгын гүйцэтгэл — ажлын хуудсаар тооцоолсон.
 *
 * ⚠️ ХУВААРЬ нь БҮХ 113 блок. Бөглөгдөөгүй блокийг 0% гэж тооцно — тайлан
 * ирээгүй барилга тэр үед үнэхээр 0% байсан. Зөвхөн бөглөгдсөнөөр дундажлавал
 * шинэ багц нэмэгдэх бүрд нийт хувь БУУЖ, «ажил ухарсан» мэт харагдана.
 */
export async function buildingProgress(scope: AgentScope): Promise<BuildingProgress> {
  // ⚠️ Эрхийн шалгалт — тооцоолсон ч гэсэн эх өгөгдөл нь давхарга
  const src = resolveSource('mon:building', scope);
  if (!src) throw new Error(tr('`mon:building` давхаргад хандах эрх алга.'));

  const l = LAYER_BY_ID['mon:building'];
  const [rows, prog] = await Promise.all([
    queryFeatures(layerUrl(l), { outFields: ['BAGTS', 'BLOK', 'AIL_TOO', 'BAR_COMP'] }),
    loadBlockProgress(),
  ]);

  const blocks: BlockRow[] = rows.map((r) => {
    const bagts = String(r.BAGTS ?? '');
    const blok = String(r.BLOK ?? '');
    const p = prog.get(buildingKey(bagts, blok));
    return {
      bagts,
      blok,
      ail: Number(r.AIL_TOO ?? 0),
      company: String(r.BAR_COMP ?? ''),
      actual: p ? Math.round(p.overall * 10) / 10 : 0,
      date: p?.date ?? '',
    };
  });

  const byBagtsMap = new Map<string, BlockRow[]>();
  for (const b of blocks) (byBagtsMap.get(b.bagts) ?? byBagtsMap.set(b.bagts, []).get(b.bagts)!).push(b);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;

  return {
    blocks: blocks.length,
    ail: blocks.reduce((s, b) => s + b.ail, 0),
    overall: r1(avg(blocks.map((b) => b.actual))),
    byBagts: [...byBagtsMap.entries()]
      .map(([bagts, v]) => ({
        bagts,
        blocks: v.length,
        ail: v.reduce((s, b) => s + b.ail, 0),
        actual: r1(avg(v.map((b) => b.actual))),
      }))
      .sort((a, b) => a.actual - b.actual),
    /**
     * ⚠️ ТАЙЛАН ИРЭЭГҮЙ БЛОКИЙГ «ХОЦОРСОН» ГЭЖ НЭРЛЭХГҮЙ (2026-09-03-ны
     * аудит). Дээрх дүрмээр бөглөгдөөгүй блок 0% гэж тоологддог тул
     * эрэмбэлэхэд тэдгээр ҮРГЭЛЖ тэргүүн эгнээнд гарч, «хамгийн хоцорсон
     * 10 блок» гэж загварт очдог байв — үнэндээ тэдгээр нь ХЭМЖИГДЭЭГҮЙ
     * (`date` хоосон). Одоо хэмжигдсэнийг нь эрэмбэлж, тайлангүйг тусад нь
     * тоолж мэдэгдэнэ.
     */
    slowest: blocks
      .filter((b) => b.date !== '')
      .sort((a, b) => a.actual - b.actual)
      .slice(0, 10),
    noReport: blocks.filter((b) => b.date === '').length,
    note:
      tr('`actual` нь АЖЛЫН ХУУДСААС тооцоолсон бодит гүйцэтгэл. ') +
      tr('⚠️ `overall` ба `byBagts.actual`-ийн ХУВААРЬ нь БҮХ блок: тайлан ирээгүй блок 0% гэж ордог. Порталын зарим дэлгэц (багцын карт, тайлангийн 6.1) зөвхөн ТАЙЛАГНАСАН блокоор дундажладаг тул тэр тоо ЭНЭНЭЭС ӨНДӨР байж болно — «дашбоардын тоо энэ» гэж бүү батал, аль хуваариар бодогдсоныг ил хэл. ') +
      tr('`noReport` нь тайлан ирээгүй блокийн тоо — хариултдаа дурьдвал зөрүү нь ойлгомжтой болно. ') +
      tr('Давхаргын хуучирсан `GUITS_HV` талбар 2026-08-24-нд эх өгөгдлөөс гарсан тул зөвхөн энэ нэг тоо бий.'),
  };
}
