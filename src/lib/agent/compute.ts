'use client';

/**
 * ТООЦООЛОГДДОГ ҮЗҮҮЛЭЛТҮҮД — ArcGIS дээр БАЙХГҮЙ, кодод бодогддог тоонууд.
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
  /**
   * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ (0–100) — «Нэгтгэл гүйцэтгэл»-ийн жигнэсэн дүн (`negtgel.loadNegtgelPct`): Ерөнхий дашбоардын
   * «Гүйцэтгэлийн хувь», Тайлан ба удирдлагын тайлангийн «төслийн гүйцэтгэл»-тэй НЭГ тоо. Уншигдаагүй бол `null` (0 БИШ).
   */
  project: number | null;
  /** Багц бүр — `pkgProgressOf` (бүх блокоор, тайлангүй 0%) */
  byBagts: { bagts: string; blocks: number; reported: number; ail: number; actual: number }[];
  /** Хамгийн хоцорсон 10 блок (ТАЙЛАГНАСАН блокоос) */
  slowest: BlockRow[];
  noReport: number;
  note: string;
};

/**
 * Барилгын гүйцэтгэл — ажлын (бөглөх) хуудсаар тооцоолсон.
 */
let physWarned = false;

export async function buildingProgress(scope: AgentScope): Promise<BuildingProgress> {
  const src = resolveSource('mon:building', scope);
  if (!src) throw new Error(tr('`mon:building` давхаргад хандах эрх алга.'));

  const l = LAYER_BY_ID['mon:building'];
  const [rows, prog, uni, housing, project] = await Promise.all([
    queryFeatures(layerUrl(l), { outFields: ['bagts', 'blok', 'ail_too', 'bar_comp'] }),
    loadBlockProgress(),
    loadBlockUniverse(),
    import('@/modules/Finance')
      .then(async (F) => F.physNow(await F.loadFinData()))
      .catch((e: unknown) => {
        if (!physWarned) {
          physWarned = true;
          console.warn('[selbe] agent/compute: physNow (Finance) ачаалагдсангүй — «мэдэгдэхгүй» гэж тооцно:', e);
        }
        return null;
      }),
    import('@/lib/negtgel')
      .then((m) => m.loadNegtgelPct())
      .catch((e: unknown) => {
        console.warn('[selbe] agent/compute: нэгтгэлийн гүйцэтгэл уншигдсангүй:', e);
        return null;
      }),
  ]);

  /* давхаргын feature → айл, гүйцэтгэгч; багцын уншигдах нэр (давхардсан feature НЭГ удаа) */
  const feat = new Map<string, { ail: number; company: string }>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    const bagts = String(r.bagts ?? '');
    const k = buildingKey(bagts, String(r.blok ?? ''));
    if (bagts) nameOf.set(bagtsKey(bagts), bagts);
    if (feat.has(k)) continue;
    feat.set(k, { ail: Number(r.ail_too ?? 0), company: String(r.bar_comp ?? '') });
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
    project: project == null ? null : r1(project),
    byBagts: [...pkgProgressOf(prog, uni).entries()]
      .map(([pk, m]) => ({
        bagts: label(pk),
        blocks: m.total,
        reported: m.blocks,
        ail: blocks.filter((b) => b.bagts === label(pk)).reduce((s, b) => s + b.ail, 0),
        actual: r1(m.pct),
      }))
      .sort((a, b) => a.actual - b.actual),
    slowest: blocks
      .filter((b) => b.date !== '')
      .sort((a, b) => a.actual - b.actual)
      .slice(0, 10),
    noReport: blocks.filter((b) => b.date === '').length,
    note:
      tr('`actual` нь АЖЛЫН ХУУДСААС тооцоолсон бодит гүйцэтгэл. ') +
      tr('⚠️ `overall` (блокийн энгийн дундаж) ба `byBagts.actual`-ийн ХУВААРЬ нь бөглөх хуудасны БҮХ блок: тайлан ирээгүй блок 0% — порталын бүх дэлгэцтэй нэг дүрэм. «Төслийн нийт гүйцэтгэл» гэж асуувал `project`-ийг хэл (Ерөнхий дашбоардын «Гүйцэтгэлийн хувь», Тайлан, удирдлагын тайлантай нэг тоо); `housing` нь ЗӨВХӨН орон сууцны биет гүйцэтгэл (Дашбоардын «Биет гүйцэтгэл (багцаар)»), `overall` нь «блокийн дундаж» — гурвыг ялгаж нэрлэ. ') +
      tr('`noReport` нь тайлан ирээгүй блокийн тоо — хариултдаа дурьдвал зөрүү нь ойлгомжтой болно. ') +
      tr('Давхаргын хуучирсан `GUITS_HV` талбар 2026-08-24-нд эх өгөгдлөөс гарсан тул зөвхөн энэ нэг тоо бий.'),
  };
}

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — порталын (Газар чөлөөлөлт · Тайлан · удирдлагын тайлан) ЯГ ТЭР тоо (`land.loadLandStatus`).
 */
export async function landStatus(scope: AgentScope): Promise<{
  total: number; cleared: number; remaining: number; pct: number | null; areaM2: number;
  byStatus: { label: string; n: number; areaM2: number }[]; note: string;
}> {
  if (!resolveSource('land:left', scope)) throw new Error(tr('`land:left` давхаргад хандах эрх алга.'));
  const { loadLandStatus } = await import('@/lib/land');
  const s = await loadLandStatus();
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    total: s.total,
    cleared: s.cleared,
    remaining: s.remaining,
    pct: s.pct == null ? null : r1(s.pct),
    areaM2: Math.round(s.areaM2),
    byStatus: s.byStatus.map((b) => ({ label: b.label, n: b.n, areaM2: Math.round(b.areaM2) })),
    note: tr('`pct` = чөлөөлсөн нэгж талбар ÷ бүх нэгж талбар (ТООГООР, талбайгаар БИШ) — порталын «Газар чөлөөлөлт», Тайлантай нэг тоо. `areaM2` нь нэгж талбар бүрийн талбай (давхардалгүй) — `SUM(area_m2)`-аар бүү бод.'),
  };
}
