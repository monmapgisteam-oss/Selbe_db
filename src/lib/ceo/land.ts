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
 *
 * ⚠️ `remainingHa` нь (б)-ийн НЭРТЭЙ мөрүүдээс `area ?? areaAlt` нийлбэрээр
 *    бодогдоно. `live.ts`-ийн `loadClearance().remainingHa` нь ЗӨВХӨН `area`
 *    (`area_m2`) талбарыг нийлүүлдэг тул `areaAlt` (`Талб_1`)-д л бичигдсэн
 *    талбайг алддаг. 2026-09-06-ны амьд хэмжилтээр 143 мөр бүгд `area_m2`-тэй
 *    тул хоёр тоо одоо ТЭНЦЭНЭ; зөрвөл энэ файлынх нь бүрэн гэж ойлго.
 *    (б) унасан үед л (а)-гийн `remainingHa` руу унана.
 *
 * ⚠️ `null` ≠ 0: талбай бөглөөгүй мөр нийлбэрт ОРОХГҮЙ, бүх мөр талбайгүй бол
 *    га нь `null` («—»). Хувь нь `loadClearance`-аас 0–100 хэлбэрээр ирнэ —
 *    `pct()` 100-аар үржүүлдэггүй.
 *
 * ⚠️ Төлөв ба шалтгаан НЭГ талбар (`services.ts`-ийн `PARCEL_LEFT` тайлбар):
 *    үлдсэн мөрийн `status` утга нь ӨӨРӨӨ шалтгаан («зөвшилцөх», «маргаантай»,
 *    «татгалзсан» …). Төлөв хоосон мөр `parcelLeftWhere()`-ээр ҮЛДСЭНД тоологдох
 *    тул түүнийг «Шалтгаан бүртгэгдээгүй» гэсэн тусдаа шалтгаан болгож ИЛ харуулна.
 *
 * ⚠️ i18n (2026-09-06-ны хяналт): шошго бүрд `en.ts`-д АЛЬ ХЭДИЙН байгаа
 *    түлхүүрийг дахин ашиглана — «Шалтгаан бүртгэгдээгүй» (Dashboard),
 *    «Давхцсан үлдсэн нэгж талбар» (Bagts/PkgProg), «Кадастрын дугаар»
 *    (GazarEdit), «Талбай (м²)» (Tailan), «Чөлөөлсөн {0}», «{0} га»+«{0} үлдсэн»,
 *    «{0} давхцсан талбар». Тооны баганын гарчиг нь «Нэгж талбар» (→ Parcels)
 *    — «Талбар» ХЭРЭГЛЭХГҮЙ, en.ts-д тэр нь «Field» (маягтын талбар).
 *    Шинэ түлхүүр ЗӨВХӨН 3: «Шалтгаанаар»,
 *    «талбар чөлөөлөгдөөгүй», давхцлын анхааруулгын өгүүлбэр — тэдгээрийг
 *    `en.ts`-д нэмэх нь нэгтгэгчийн ажил (энэ файл толийг засдаггүй).
 *
 * ⚠️ `asOf` нь ҮРГЭЛЖ `null` — `PARCEL_LEFT`-д Editor Tracking асаагүй
 *    (`editFieldsInfo: null`), огнооны талбар ч байхгүй.
 */

import { t as tr } from '@/lib/i18nCore';
import { num, pct, text } from '@/lib/format';
import { queryFeatures, type Row } from '@/lib/query';
import { PARCEL_LEFT, parcelLeftWhere } from '@/lib/services';
import { cached, loadClearance, type Clearance } from '@/lib/live';
import { loadOverlaps, type Overlaps } from '@/lib/execTriage';
import { overlapLevel, pctLevel } from '@/lib/kpiLevels';
import { cell, table, worstOf, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════════ Төрөл ══════════════════ */

/** Чөлөөлөгдөөгүй нэг талбар — хүснэгтэд ГАРАХ бүх талбар */
export type LandParcel = {
  oid: number;
  parcelNo: string | null;
  owner: string | null;
  address: string | null;
  /** Төлөв=шалтгаан; хоосон бол `NO_STATUS` */
  reason: string;
  /** м² — `area`, хоосон бол `areaAlt`; хоёулаа хоосон бол `null` */
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
};

/* ══════════════════ Тогтмол ══════════════════ */

/**
 * Төлөвгүй мөрийн шалтгааны шошго — `parcelLeftWhere()`-ийн `IS NULL` салаа.
 * ⚠️ Dashboard/GeneralDash-ийн шалтгааны хоосон төлөвтэй ИЖИЛ түлхүүр —
 *    төлөв = шалтгаан тул «төлөв бөглөөгүй» ≡ «шалтгаан бүртгэгдээгүй».
 */
export const NO_STATUS = () => tr('Шалтгаан бүртгэгдээгүй');

/**
 * АНХААРУУЛГА ӨГӨХ шалтгаанууд — маргаантай / татгалзсан.
 * ⚠️ САНАЛ (2026-09-06): бусад шалтгаан («зөвшилцөх», «гэрээлсэн») нь явцын
 *    хэвийн үе шат; маргаан ба татгалзал л удирдлагын оролцоо шаарддаг.
 *    Эх өгөгдлийн үг өөрчлөгдвөл энд нэмнэ (`i` — том/жижиг үсэг хамаагүй).
 */
export const WARN_REASON = /маргаан|татгалз/iu;

/**
 * Эх сурвалжийн нэрс — `failedSources`-д гарна.
 * ⚠️ (а) унавал ХУВЬ л алдагдана (үлдсэн тоо (б)-ээс сэргэнэ) тул нэр нь
 *    «Чөлөөлөлтийн хувь»; (в)-ийн нэр нь Багц харагдацын индикаторынхтой ижил.
 */
export const SOURCE = {
  clearance: () => tr('Чөлөөлөлтийн хувь'),
  parcels: () => tr('Чөлөөлөгдөөгүй талбар'),
  overlaps: () => tr('Давхцсан үлдсэн нэгж талбар'),
} as const;

/* ══════════════════ Цэвэр тооцоо ══════════════════ */

/** ArcGIS тоо — хоосон/NaN бол `null`. ⚠️ 0-ийг `null` болгохгүй, `null`-ыг 0 болгохгүй. */
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Текст — хоосон/зай бол `null` (`Zoriulalt` нь " " гэж ирдэг) */
const strOrNull = (v: unknown): string | null => {
  const s = text(v, '');
  return s ? s : null;
};

/** `PARCEL_LEFT`-ийн түүхий мөрүүд → нэртэй талбарууд */
export function parseParcels(rows: readonly Row[]): LandParcel[] {
  const F = PARCEL_LEFT.fields;
  return rows.map((r) => {
    const area = numOrNull(r[F.area]);
    return {
      oid: Number(r[PARCEL_LEFT.oid]),
      parcelNo: strOrNull(r[F.parcelNo]),
      owner: strOrNull(r[F.owner]),
      address: strOrNull(r[F.address]),
      reason: strOrNull(r[F.status]) ?? NO_STATUS(),
      // ⚠️ `area` 0 бол 0 хэвээр (хэмжсэн тэг) — зөвхөн `null` үед `areaAlt`
      areaM2: area ?? numOrNull(r[F.areaAlt]),
      landuse: strOrNull(r[F.landuse]),
      note: strOrNull(r[F.note]),
    };
  });
}

/** Талбайтай мөрүүдийн м² нийлбэр; нэг ч талбайгүй бол `null` */
export function sumAreaM2(parcels: readonly LandParcel[]): number | null {
  let s: number | null = null;
  for (const p of parcels) {
    if (p.areaM2 == null) continue;
    s = (s ?? 0) + p.areaM2;
  }
  return s;
}

/** Шалтгаанаар бүлэглэл — тоогоор буурах, тэнцвэл га-гаар буурах */
export function byReason(parcels: readonly LandParcel[]): LandReason[] {
  const acc = new Map<string, { n: number; m2: number | null }>();
  for (const p of parcels) {
    const g = acc.get(p.reason) ?? { n: 0, m2: null };
    g.n += 1;
    if (p.areaM2 != null) g.m2 = (g.m2 ?? 0) + p.areaM2;
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
  // ⚠️ `parcels.length` нь (а) унасан үед л орлоно: хоёулаа байвал (а)-гийн
  //    тоо бүлэглэлээс, (б)-ийнх мөр татахаас гарсан тул адил байх ёстой.
  const remaining: number | null = clearance?.remaining ?? parcels?.length ?? null;
  const clearedPct: number | null = clearance?.pct ?? null;
  const m2 = parcels ? sumAreaM2(parcels) : null;
  const remainingHa: number | null = parcels
    ? (m2 == null ? null : m2 / 10_000)
    : clearance ? clearance.remainingHa : null;
  const reasons = parcels ? byReason(parcels) : [];
  const overlapTotal: number | null = overlaps ? overlaps.total : null;

  // ── Түвшин ──
  const level = worstOf([pctLevel(clearedPct), overlapLevel(overlapTotal)]);

  // ── Баримт — ЗӨВХӨН тоотой хэсэг ──
  const facts: string[] = [];
  if (clearedPct != null) facts.push(tr('Чөлөөлсөн {0}', pct(clearedPct, 1)));
  // «{0} га» + «{0} үлдсэн» — хоёулаа толинд байгаа, давхар `tr` нь орчуулагдана
  if (remainingHa != null) facts.push(tr('{0} үлдсэн', tr('{0} га', num(remainingHa, 1))));
  if (overlapTotal != null) facts.push(tr('{0} давхцсан талбар', num(overlapTotal)));
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
        cell(p.areaM2, 'count'), cell(p.landuse), cell(p.note),
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
    asOf: null,
    failedSources: [...input.failed],
  };
}

/* ══════════════════ Ачаалагч ══════════════════ */

/** Үлдсэн талбаруудыг НЭРТЭЙ нь татах (~143 мөр) */
async function fetchParcels(): Promise<LandParcel[]> {
  const F = PARCEL_LEFT.fields;
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: parcelLeftWhere(),
    outFields: [
      PARCEL_LEFT.oid, F.parcelNo, F.owner, F.address, F.status,
      F.area, F.areaAlt, F.note, F.landuse,
    ],
    // ⚠️ 2000-аас цөөн ч эрэмбэ өгнө — хуудаслалт хэзээ нэгэн цагт хэрэг болбол
    //    OID-гүй offset тогтворгүй (`query.ts`-ийн тайлбар)
    orderBy: `${PARCEL_LEFT.oid} ASC`,
  });
  return parseParcels(rows);
}

/**
 * ⚠️ `['PARCEL_LEFT']` — талбарын засвар (`parcelEdit`) `invalidate('PARCEL_LEFT')`
 *    дуудахад энэ кэш хаягдана. `loadOverlaps` нь өөрийн модулийн кэштэй
 *    (execTriage) — тэр нь зөвхөн хуудас дахин ачаалахад шинэчлэгдэнэ.
 */
export const loadLandKpi = cached<KpiResult>(async () => {
  const [c, p, o] = await Promise.allSettled([loadClearance(), fetchParcels(), loadOverlaps()]);
  const failed: string[] = [];
  if (c.status === 'rejected') failed.push(SOURCE.clearance());
  if (p.status === 'rejected') failed.push(SOURCE.parcels());
  if (o.status === 'rejected') failed.push(SOURCE.overlaps());
  return computeLand({
    clearance: c.status === 'fulfilled' ? c.value : null,
    parcels: p.status === 'fulfilled' ? p.value : null,
    overlaps: o.status === 'fulfilled' ? o.value : null,
    failed,
  });
}, 5 * 60_000, ['PARCEL_LEFT']);
