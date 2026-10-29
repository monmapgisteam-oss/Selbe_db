'use client';

/**
 * БҮС/БАГЦЫН НЭГДСЭН ТОЙМ — БҮХ эх сурвалжийг нэг дор шүүнэ.
 */

import { count, nPrefixUnicode, queryGroup, queryStats, sqlStr, type Stat } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { PKG_BY_BAGTS, bagtsKey, zoneWhere, type LayerDef } from '@/lib/services';
import { layerTotals, qtyText, whereFor } from '@/lib/totals';
import { allowedDatasets, allowedLayers, type AgentScope } from './registry';
import type { Dataset } from './datasets';

/** Нэг эх сурвалжийн мөр */
export type OverviewRow = {
  id: string;
  title: string;
  /** Олдсон бичлэгийн тоо */
  n: number;
  /** Хэмжээ — хүн уншихад тохирсон нэгжээр («2.4 км», «1.3 га») */
  qty?: string;
  /**
   * Давхарга БҮТНЭЭРЭЭ энэ багцынх (мөрөөр шүүгээгүй).
   */
  whole?: boolean;
};

export type Overview = {
  zone: string;
  sources: OverviewRow[];
  /** Өгөгдөлгүй байсан эх сурвалжийн ТОО — жагсаалт нь контекст дүүргэнэ */
  emptyCount: number;
  /** Бүсээр шүүх боломжгүй (талбаргүй) эх сурвалжийн тоо */
  skippedCount: number;
  /**
   * Алдаа өгсөн (ArcGIS унасан) эх сурвалжийн тоо.
   */
  failedCount: number;
  note: string;
};

const MAX_SOURCES = 110;

/* ── Латин бичиглэлийг кирилл болгох ── */

/**
 * «bagts 3.2» → «Багц-3.2».
 */
export function normalizeZone(input: string): string {
  const s = String(input).trim();
  const cyr = s.match(/^\s*багц\s*[-\s]*([0-9][0-9.-]*)\s*$/i);
  if (cyr) return `Багц-${cyr[1]}`;
  // Кирилл үсэг аль хэдийн байвал хөрвүүлэх шаардлагагүй
  if (/[А-Яа-яӨөҮү]/.test(s)) return s;
  const num = s.match(/([0-9][0-9.\-]*)/)?.[1];
  if (!num) return s;
  if (/^\s*(bagts|bagc|bags|bagt|package|pkg)/i.test(s)) return `Багц-${num}`;
  if (/^\s*(bus|bvs|buus)/i.test(s)) return `Багц-${num}`;
  return s;
}

/* ── Өгөгдлийн эх сурвалжийн багцын утгыг тааруулах ── */

/**
 * Датасетын багцын баганаас тухайн бүстэй ТААРАХ утгуудыг олно.
 */
async function datasetWhere(d: Dataset, zone: string): Promise<string | null> {
  if (!d.zoneField) return null;
  const key = bagtsKey(zone);
  if (!key) return null;

  const rows = await queryGroup(d.url, d.zoneField, [count(d.oid ?? 'objectid', 'n')], d.baseWhere ?? '1=1');
  const hits = rows
    .map((r) => String(r[d.zoneField!] ?? ''))
    .filter((v) => v && bagtsKey(v) === key);

  if (!hits.length) return null;
  return `${d.zoneField} IN (${hits.map(sqlStr).join(', ')})`;
}

/* ── Нэгдсэн тойм ── */

export async function zoneOverview(input: string, scope: AgentScope): Promise<Overview> {
  const zone = normalizeZone(input);
  const layers = allowedLayers(scope);
  const datasets = allowedDatasets(scope);

  const key = bagtsKey(zone);

  const pkgIds = new Set(PKG_BY_BAGTS[key] ?? []);

  const titleRef = /\(\s*багц\s*[-\s]*([0-9][0-9.\-]*)\s*\)/i;

  // Бүсээр шүүгдэх боломжтой давхаргууд
  const filterable: { l: LayerDef; where: string; whole?: boolean }[] = [];
  let skipped = 0;
  for (const l of layers) {
    const m = l.title.match(titleRef);
    if (pkgIds.has(l.id) || (m && bagtsKey(`Багц-${m[1]}`) === key)) {
      filterable.push({ l, where: '1=1', whole: true });
      continue;
    }

    const w = zoneWhere(l, zone);
    if (w != null) { filterable.push({ l, where: nPrefixUnicode(whereFor(l, zone)) }); continue; }
    skipped++;
  }

  const capped = filterable.slice(0, MAX_SOURCES);
  const overflow = filterable.length - capped.length;

  const layerResults = await Promise.allSettled(
    capped.map(async ({ l, where, whole }) => ({ l, whole, t: await layerTotals(l, where) })),
  );

  const sources: OverviewRow[] = [];
  let empty = 0;
  let failed = 0;

  for (const r of layerResults) {
    if (r.status === 'rejected') { failed++; continue; }
    const { l, t, whole } = r.value;
    if (!t.n) { empty++; continue; }
    sources.push({
      id: l.id,
      title: l.title,
      n: t.n,
      ...(qtyText(l, t.q) ? { qty: qtyText(l, t.q)! } : {}),
      ...(whole ? { whole: true } : {}),
    });
  }

  // Өгөгдлийн эх сурвалжууд (ажлын хуудас, ХАБЭА…)
  const dsResults = await Promise.allSettled(
    datasets.map(async (d) => {
      const where = await datasetWhere(d, zone);
      if (!where) return null;
      const stats: Stat[] = [count(d.oid ?? 'objectid', 'n')];
      const row = await queryStats(d.url, stats, d.baseWhere ? `(${d.baseWhere}) AND (${where})` : where);
      return { d, n: Number(row.n ?? 0) };
    }),
  );
  for (const r of dsResults) {
    if (r.status === 'rejected') { failed++; continue; }
    if (!r.value) continue;
    if (!r.value.n) { empty++; continue; }
    sources.push({ id: r.value.d.id, title: r.value.d.title, n: r.value.n });
  }

  // Хамгийн олон объекттойг эхэнд — агент юуг түрүүлж дурдахаа мэдэхэд
  sources.sort((a, b) => b.n - a.n);

  const notes: string[] = [];
  if (overflow) notes.push(tr('⚠️ {0} эх сурвалж хязгаараас хэтэрсэн тул шалгаагүй.', overflow));
  if (failed) notes.push(tr('⚠️ {0} эх сурвалж алдаа өгсөн.', failed));
  if (sources.some((x) => x.whole)) {
    notes.push(
      tr('`whole: true` тэмдэгтэй эх сурвалж нь БҮХЭЛДЭЭ энэ багцынх — мөрөөр шүүгээгүй, ') +
        tr('давхаргын нийт дүн нь тэр багцынх.'),
    );
  }

  return {
    zone,
    sources,
    emptyCount: empty,
    skippedCount: skipped,
    failedCount: failed,
    note: notes.join(' '),
  };
}
