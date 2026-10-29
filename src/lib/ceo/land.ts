/**
 * CEO KPI «Нэгж талбар / газар чөлөөлөлт» — ҮЛДСЭН талбарууд шалтгаанаар,
 * НЭРЭЭР нь, дээр нь багц ажилтай давхцал.
 *
 * Гурван эх сурвалж, тус бүр ТУСДАА унаж болно (`failedSources`):
 *   (а) `loadClearance` — нийт/чөлөөлсөн/үлдсэн/хувь (`PARCEL_LEFT` бүлэглэл)
 *   (б) `PARCEL_LEFT`-ийн үлдсэн мөрүүд НЭРТЭЙ (кадастр · эзэмшигч · хаяг …)
 *   (в) `loadOverlaps` — багц ажлын геометртэй давхцсан талбарууд (хүнд,
 *       модулийн түвшинд кэштэй; унавал давхцлын хүснэгт ГАРАХГҮЙ, тоо
 *       ЗОХИОХГҮЙ)
 */

import { t as tr } from '@/lib/i18nCore';
import { num, pct, text } from '@/lib/format';
import { queryFeatures, arcgisPost, type Row } from '@/lib/query';
import { trackStatOf } from '@/lib/editTrack';
import { PARCEL_LEFT, parcelLeftWhere } from '@/lib/services';
import { isClearedStatus, parcelAreaOf, landuseText, PARCEL_SHAPE_AREA } from '@/lib/land';
import { cached, loadClearance, type Clearance } from '@/lib/live';
import { loadOverlaps, type Overlaps } from '@/lib/execTriage';
import { overlapLevel, pctLevel } from '@/lib/kpiLevels';
import { cell, table, worstOf, kpiComplete, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════════ Төрөл ══════════════════ */

/** Чөлөөлөгдөөгүй нэг талбар — хүснэгтэд ГАРАХ бүх талбар */
export type LandParcel = {
  oid: number;
  parcelNo: string | null;
  owner: string | null;
  address: string | null;
  /** Төлөв=шалтгаан; хоосон бол `NO_STATUS` */
  reason: string;
  /** м² — `land.parcelAreaOf`: `area` > 0, эс бөгөөс `areaAlt` > 0, эс бөгөөс полигоны талбай; бүгд алга бол `null` */
  areaM2: number | null;
  landuse: string | null;
  note: string | null;
};

export type LandReason = {
  reason: string;
  n: number;
  /** га — талбайтай мөрүүдийн нийлбэр; нэг ч талбайгүй бол `null` */
  ha: number | null;
};

/** Цэвэр тооцооны оролт — эх бүр `null` = уншигдаагүй */
export type LandInput = {
  clearance: Clearance | null;
  parcels: LandParcel[] | null;
  overlaps: Overlaps | null;
  /** Унасан эхийн нэрс (`tr`-ээр орчуулагдсан) */
  failed: string[];
  /**
   * Өгөгдлийн агшин — чөлөөлөгдөөгүй талбаруудын хамгийн сүүлийн `EditDate` (ms).
   */
  asOf?: number | null;
};

/* ══════════════════ Тогтмол ══════════════════ */

/**
 * Төлөвгүй мөрийн шалтгааны шошго — `parcelLeftWhere`-ийн `IS NULL` салаа.
 */
export const NO_STATUS = () => tr('Шалтгаан бүртгэгдээгүй');

/**
 * АНХААРУУЛГА ӨГӨХ шалтгаанууд — маргаантай / татгалзсан.
 */
export const WARN_REASON = /маргаан|татгалз/iu;

/**
 * Эх сурвалжийн нэрс — `failedSources`-д гарна.
 */
export const SOURCE = {
  clearance: () => tr('Чөлөөлөлтийн хувь'),
  parcels: () => tr('Чөлөөлөгдөөгүй талбар'),
  overlaps: () => tr('Давхцсан үлдсэн нэгж талбар'),
} as const;

/* ══════════════════ Цэвэр тооцоо ══════════════════ */


/** Текст — хоосон/зай бол `null` (`Zoriulalt` нь " " гэж ирдэг) */
const strOrNull = (v: unknown): string | null => {
  const s = text(v, '');
  return s ? s : null;
};

/** `PARCEL_LEFT`-ийн түүхий мөрүүд → нэртэй талбарууд */
export function parseParcels(rows: readonly Row[]): LandParcel[] {
  const F = PARCEL_LEFT.fields;
  const known = [...new Set(rows.map((r) => strOrNull(r[F.landuseFull])).filter((x): x is string => !!x))];
  return rows.filter((r) => !isClearedStatus(r[F.status])).map((r) => ({
    oid: Number(r[PARCEL_LEFT.oid]),
    parcelNo: strOrNull(r[F.parcelNo]),
    owner: strOrNull(r[F.owner]),
    address: strOrNull(r[F.address]),
    reason: strOrNull(r[F.status]) ?? NO_STATUS(),
    areaM2: parcelAreaOf(r),
    landuse: landuseText(r[F.landuseFull], r[F.landuse], known),
    note: strOrNull(r[F.note]),
  }));
}

/**
 * Талбайтай мөрүүдийн м² нийлбэр; нэг ч талбайгүй бол `null`.
 */
export function sumAreaM2(parcels: readonly LandParcel[]): number | null {
  let s: number | null = null;
  const seen = new Set<string>();
  for (const p of parcels) {
    if (p.areaM2 == null) continue;
    if (p.parcelNo && p.areaM2 > 0) {
      const k = `${p.parcelNo}|${p.areaM2}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    s = (s ?? 0) + p.areaM2;
  }
  return s;
}

/** Шалтгаанаар бүлэглэл — тоогоор буурах, тэнцвэл га-гаар буурах */
export function byReason(parcels: readonly LandParcel[]): LandReason[] {
  const acc = new Map<string, { n: number; m2: number | null }>();
  const seen = new Set<string>();
  for (const p of parcels) {
    const g = acc.get(p.reason) ?? { n: 0, m2: null };
    g.n += 1;
    let dup = false;
    if (p.areaM2 != null && p.parcelNo && p.areaM2 > 0) {
      const k = `${p.parcelNo}|${p.areaM2}`;
      dup = seen.has(k);
      seen.add(k);
    }
    if (p.areaM2 != null && !dup) g.m2 = (g.m2 ?? 0) + p.areaM2;
    acc.set(p.reason, g);
  }
  return [...acc.entries()]
    .map(([reason, g]) => ({ reason, n: g.n, ha: g.m2 == null ? null : g.m2 / 10_000 }))
    .sort((a, b) => b.n - a.n || (b.ha ?? -1) - (a.ha ?? -1) || a.reason.localeCompare(b.reason));
}

/**
 * Үзүүлэлтийг угсрах — СҮЛЖЭЭГҮЙ, `land.check.mjs` шууд импортлоно.
 * @throws бүх эх унасан бол (`clearance`, `parcels`, `overlaps` гурвуулаа null)
 */
export function computeLand(input: LandInput): KpiResult {
  const { clearance, parcels, overlaps } = input;
  if (!clearance && !parcels && !overlaps) {
    throw new Error(tr('Газар чөлөөлөлтийн эх сурвалж татагдсангүй.'));
  }

  // ── Нэгтгэл ──
  const remaining: number | null = clearance?.remaining ?? parcels?.length ?? null;
  const clearedPct: number | null = clearance?.pct ?? null;
  const m2 = parcels ? sumAreaM2(parcels) : null;
  const remainingHa: number | null = parcels
    ? (m2 == null ? null : m2 / 10_000)
    : clearance ? clearance.remainingHa : null;
  const reasons = parcels ? byReason(parcels) : [];
  const ovPartial = !!overlaps?.failed;
  const overlapTotal: number | null = overlaps && !(ovPartial && overlaps.total === 0) ? overlaps.total : null;

  // ── Түвшин ──
  const lv = worstOf([pctLevel(clearedPct), overlapLevel(overlapTotal)]);
  /* Давхцал мэдэгдэхгүй үед бусад эх «сайн» байсан ч НОГООН БИШ */
  const level = ovPartial && overlapTotal == null && lv === 'good' ? 'unknown' : lv;

  // ── Баримт — ЗӨВХӨН тоотой хэсэг ──
  const facts: string[] = [];
  if (clearedPct != null) facts.push(tr('Чөлөөлсөн {0}', pct(clearedPct, 1)));
  // «{0} га» + «{0} үлдсэн» — хоёулаа толинд байгаа, давхар `tr` нь орчуулагдана
  if (remainingHa != null) facts.push(tr('{0} үлдсэн', tr('{0} га', num(remainingHa, 1))));
  if (overlapTotal != null) facts.push(`${ovPartial ? '≥ ' : ''}${tr('{0} давхцсан талбар', num(overlapTotal))}`);
  else if (ovPartial) facts.push(tr('Давхцал бүрэн тоологдсонгүй'));
  const top = reasons[0];
  if (top) facts.push(`${top.reason} ${num(top.n)}`);

  // ── Хүснэгтүүд ──
  const tables: KpiResult['tables'] = [];
  if (parcels) {
    tables.push(table(
      tr('Шалтгаанаар'),
      [tr('Шалтгаан'), tr('Нэгж талбар'), tr('га')],
      reasons.map((r) => [cell(r.reason), cell(r.n, 'count'), cell(r.ha, 'ha')]),
    ));
    // Шалтгааны эрэмбэ = дээрх хүснэгтийнх (том бүлэг эхэнд), дотроо талбай буурах
    const rank = new Map(reasons.map((r, i) => [r.reason, i]));
    const sorted = [...parcels].sort((a, b) => (
      (rank.get(a.reason) ?? 0) - (rank.get(b.reason) ?? 0)
      || (b.areaM2 ?? -1) - (a.areaM2 ?? -1)
      || a.oid - b.oid
    ));
    tables.push(table(
      tr('Чөлөөлөгдөөгүй талбар'),
      [tr('Кадастрын дугаар'), tr('Эзэмшигч'), tr('Хаяг'), tr('Шалтгаан'), tr('Талбай (м²)'), tr('Зориулалт'), tr('Тайлбар')],
      sorted.map((p) => [
        cell(p.parcelNo), cell(p.owner), cell(p.address), cell(p.reason),
        cell(p.areaM2, 'count'), cell(p.landuse == null ? null : tr(p.landuse)), cell(p.note),
      ]),
    ));
  }
  if (overlaps) {
    tables.push(table(
      tr('Давхцсан үлдсэн нэгж талбар'),
      [tr('Багц'), tr('Нэгж талбар')],
      [...overlaps.byPkg]
        .sort((a, b) => b.parcels - a.parcels)
        .map((p) => [cell(p.name), cell(p.parcels, 'count')]),
    ));
  }

  // ── Анхааруулга ──
  const issues: KpiIssue[] = [];
  if (overlapTotal != null && overlapTotal > 0) {
    issues.push({
      tone: 'bad',
      text: tr('{0} талбар багцын ажилтай давхцсан — ажил эхлэх боломжгүй', num(overlapTotal)),
    });
  }
  for (const r of reasons) {
    if (r.n > 0 && WARN_REASON.test(r.reason)) {
      issues.push({ tone: 'warn', text: `${r.reason}: ${tr('{0} талбар', num(r.n))}` });
    }
  }

  return {
    value: num(remaining),
    unit: tr('талбар чөлөөлөгдөөгүй'),
    facts,
    level,
    tables,
    issues,
    asOf: input.asOf ?? null,
    failedSources: [...input.failed],
  };
}

/* ══════════════════ Ачаалагч ══════════════════ */

/**
 * Editor Tracking-ийн ОГНООНЫ ТАЛБАР — давхаргын метадатаас (`editFieldsInfo.editDateField`).
 */
async function editDateFieldOf(url: string): Promise<{ ed: string; stat: string | null } | null> {
  try {
    const j = await arcgisPost<{ editFieldsInfo?: { editDateField?: string } | null; fields?: { name?: string }[] }>(url, { f: 'json' });
    const f = j?.editFieldsInfo?.editDateField;
    const names = (j.fields ?? []).map((x) => String(x.name));
    return f && names.includes(f) ? { ed: f, stat: trackStatOf(names, f) } : null;
  } catch {
    return null;
  }
}

/** Хамгийн сүүлийн засварын огноо (ms) — талбар алга/хоосон бол `null` */
export function lastEditOf(rows: readonly Row[], field: string | null): number | null {
  if (!field) return null;
  let m: number | null = null;
  for (const r of rows) {
    const v = Number(r[field]);
    if (r[field] != null && Number.isFinite(v) && v > 0 && (m == null || v > m)) m = v;
  }
  return m;
}

/** Үлдсэн талбаруудыг НЭРТЭЙ нь татах (~143 мөр) */
async function fetchParcels(): Promise<{ parcels: LandParcel[]; asOf: number | null }> {
  const F = PARCEL_LEFT.fields;
  const edf = await editDateFieldOf(PARCEL_LEFT.url);
  const ed = edf?.ed ?? null;
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: parcelLeftWhere(),
    outFields: [
      PARCEL_LEFT.oid, F.parcelNo, F.owner, F.address, F.status,
      F.area, F.areaAlt, F.note, F.landuse, F.landuseFull, PARCEL_SHAPE_AREA,
      ...(edf ? [edf.ed, ...(edf.stat ? [edf.stat] : [])] : []),
    ],
    orderBy: `${PARCEL_LEFT.oid} ASC`,
  });
  return { parcels: parseParcels(rows), asOf: lastEditOf(rows, ed) };
}

export const loadLandKpi = cached<KpiResult>(async () => {
  const [c, p, o] = await Promise.allSettled([loadClearance(), fetchParcels(), loadOverlaps()]);
  const failed: string[] = [];
  if (c.status === 'rejected') failed.push(SOURCE.clearance());
  if (p.status === 'rejected') failed.push(SOURCE.parcels());
  if (o.status === 'rejected') failed.push(SOURCE.overlaps());
  else if (o.value.failed) failed.push(SOURCE.overlaps());
  return computeLand({
    clearance: c.status === 'fulfilled' ? c.value : null,
    parcels: p.status === 'fulfilled' ? p.value.parcels : null,
    overlaps: o.status === 'fulfilled' ? o.value : null,
    failed,
    asOf: p.status === 'fulfilled' ? p.value.asOf : null,
  });
}, 5 * 60_000, ['PARCEL_LEFT'], kpiComplete);
