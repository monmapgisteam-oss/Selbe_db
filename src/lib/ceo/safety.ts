/**
 * CEO ҮЗҮҮЛЭЛТ — «ХАБЭА: осол, зөрчил».
 *
 * Эх сурвалж: Survey123 ослын бүртгэл (`HABEA.incident`) — ~17 мөрийн жижиг
 * хүснэгт, нэг асуулгаар бүтнээрээ ирнэ.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { queryFeatures, type Row } from '@/lib/query';
import { loadCodedMaps, codedName, type CodedMaps } from '@/lib/codedDomain';
import { HABEA } from '@/lib/services';
import { date, num } from '@/lib/format';
import { DMG_BAD_N, incidentLevel, type Level } from '@/lib/kpiLevels';
import { cell, daysBetween, table, worstOf, type Cell, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════ Тогтмол ══════════════ */

/**
 * Хохирлын төрлийн шүүлт — `execTriage.loadDamage`-ийн regex-тэй ИЖИЛ байх ёстой.
 */
export const DAMAGE_RE = /хохирол/i;

/**
 * «Сүүлийн үеийн» осол гэж тооцох цонх, хоног.
 */
export const RECENT_DAYS = 30;

/**
 * Хохирлын түвшин — `execTriage.DMG_BAD_N`-ийн тайлбарын дагуу:
 * 0 → Сайн; 1–2 → Дунд; ≥3 → Яаралтай.
 */
export const damageLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : n < DMG_BAD_N ? 'warn' : 'bad';

/* ══════════════ Мөр ══════════════ */

/** Ослын нэг бүртгэл — эх талбаруудыг нэрлэсэн, текстийг цэвэрлэсэн */
export type SafetyRow = {
  oid: number | null;
  /**
   * Огноо, epoch ms — ЗӨВХӨН `field_22` (2026-10-09: `CreationDate` нөөц хасагдсан); хоосон/0
   * бол null (ХЭЗЭЭ Ч 0 биш)
   */
  ognoo: number | null;
  company: string;
  bagts: string;
  dugaar: string;
  turul: string;
  medeelel: string;
  shaltgaanTurul: string;
  shaltgaan: string;
  argaHemjee: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** ArcGIS огноо → epoch ms; тоо биш/хоосон/0 бол null */
const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
};

/**
 * ХООСОН НООРОГ — Survey123-д эхлүүлээд бөглөөгүй ослын маягт: ТӨРӨЛ (`field_7`),
 * БАГЦ (`field_6`), ОГНОО (`field_22`) ГУРВУУЛАА хоосон.
 */
export function isBlankIncident(r: Row): boolean {
  const I = HABEA.incident.fields;
  const blankStr = (v: unknown) => v == null || String(v).trim() === '';
  return blankStr(r[I.turul]) && blankStr(r[I.bagts]) && toMs(r[I.ognoo]) == null;
}

/**
 * Эх мөрийг `SafetyRow` болгоно — талбарын нэрс `HABEA.incident.fields`-ээс.
 */
export function toSafetyRow(r: Row, dom: CodedMaps = {}): SafetyRow {
  const I = HABEA.incident.fields;
  const oidRaw = r.objectid ?? null;
  const oid = oidRaw == null ? null : Number(oidRaw);
  return {
    oid: oid != null && Number.isFinite(oid) ? oid : null,
    ognoo: toMs(r[I.ognoo]),
    company: codedName(dom[I.company], r[I.company]),
    bagts: str(r[I.bagts]),
    dugaar: str(r[I.dugaar]),
    turul: codedName(dom[I.turul], r[I.turul]),
    medeelel: str(r[I.medeelel]),
    shaltgaanTurul: codedName(dom[I.shaltgaanTurul], r[I.shaltgaanTurul]),
    shaltgaan: str(r[I.shaltgaan]),
    argaHemjee: str(r[I.argaHemjee]),
  };
}

/* ══════════════ Тооцоо ══════════════ */

export type SafetyAgg = {
  total: number;
  damage: number;
  /** Хамгийн сүүлийн бүртгэлийн огноо (ms) — огноотой мөр байхгүй бол null */
  last: number | null;
  /** `last`-аас хойших хоног — `last` null бол null */
  daysSince: number | null;
  /** Сүүлийн `RECENT_DAYS` хоногт бүртгэгдсэн тоо */
  recent: number;
  /** Сүүлийн `RECENT_DAYS` хоногт бүртгэгдсэн ХОХИРОЛ (2026-10-21) — түвшинд энэ, `damage` нь бүх хугацааных */
  damageRecent: number;
  byType: { name: string; n: number }[];
  byBagts: { name: string; n: number }[];
  byCompany: { name: string; n: number }[];
};

/** Нэрээр тоолж, буурах эрэмбээр — хоосон нэр `Тодорхойгүй` бүлэгт */
function tally(rows: readonly SafetyRow[], pick: (r: SafetyRow) => string): { name: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r) || tr('Тодорхойгүй');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** Шинэ нь эхэнд; огноогүй мөр ХАМГИЙН СҮҮЛД (0 гэж тооцохгүй) */
export const newestFirst = (a: SafetyRow, b: SafetyRow): number => {
  if (a.ognoo == null && b.ognoo == null) return 0;
  if (a.ognoo == null) return 1;
  if (b.ognoo == null) return -1;
  return b.ognoo - a.ognoo;
};

export const isDamage = (r: SafetyRow): boolean => DAMAGE_RE.test(r.turul);

export function aggregateSafety(rows: readonly SafetyRow[], now: number): SafetyAgg {
  const dated = rows.map((r) => r.ognoo).filter((x): x is number => x != null && x <= now);
  const last = dated.length ? Math.max(...dated) : null;
  const since = now - RECENT_DAYS * 86_400_000;
  const recentRows = rows.filter((r) => r.ognoo != null && r.ognoo >= since && r.ognoo <= now);
  return {
    total: rows.length,
    damage: rows.filter(isDamage).length,
    last,
    daysSince: last == null ? null : daysBetween(last, now),
    recent: recentRows.length,
    damageRecent: recentRows.filter(isDamage).length,
    byType: tally(rows, (r) => r.turul),
    byBagts: tally(rows, (r) => r.bagts),
    byCompany: tally(rows, (r) => r.company),
  };
}

/** «2026-08-14 · Багц 3 · Гэмтэл — Компани» */
const issueText = (r: SafetyRow): string => {
  const head = [r.ognoo == null ? '—' : date(r.ognoo), r.bagts, r.turul].filter(Boolean).join(' · ');
  return r.company ? `${head} — ${r.company}` : head;
};

/**
 * ЦЭВЭР тооцоо — мөрүүд + «одоо» → картын бүтэн үр дүн.
 * `failedSources` нь хоосон: ганц эх сурвалжтай тул унавал ачаалагч өөрөө шиднэ.
 */
export function computeSafety(rowsIn: readonly SafetyRow[], now: number): KpiResult {
  const rows = [...rowsIn].sort(newestFirst);
  const agg = aggregateSafety(rows, now);
  const since = now - RECENT_DAYS * 86_400_000;

  /* ── Баримт: зөвхөн тоо бүхий богино хэсгүүд ── */
  const facts: string[] = [];
  if (agg.last != null && agg.daysSince != null) {
    facts.push(tr('сүүлийнх {0} хоногийн өмнө ({1})', agg.daysSince, date(agg.last)));
  }
  facts.push(tr('нийт {0}', num(agg.total)));
  facts.push(tr('{0} хохирол', agg.damage));
  const topBagts = agg.byBagts[0];
  if (topBagts) facts.push(tr('Багц: {0}', `${topBagts.name} — ${topBagts.n}`));

  /* ── Түвшин ── */
  const level = worstOf([incidentLevel(agg.recent), damageLevel(agg.damageRecent)]);

  /* ── Хүснэгтүүд: бүх бүртгэл нэрээр нь, дараа нь төрөл/багцын задаргаа ── */
  const all: Cell[][] = rows.map((r) => [
    cell(r.ognoo == null ? null : date(r.ognoo)),
    cell(r.turul || null),
    cell(r.bagts || null),
    cell(r.company || null),
    cell(r.medeelel || null),
    cell(r.shaltgaan || r.shaltgaanTurul || null),
    cell(r.argaHemjee || null),
  ]);
  const tables = [
    table(
      tr('Бүх бүртгэл'),
      [tr('Огноо'), tr('Төрөл'), tr('Багц'), tr('Компани'), tr('Мэдээлэл'), tr('Шалтгаан'), tr('Арга хэмжээ')],
      all,
    ),
    table(tr('Төрлөөр'), [tr('Төрөл'), tr('Тоо')], agg.byType.map((g) => [cell(g.name), cell(g.n, 'count')])),
    table(tr('Багцаар'), [tr('Багц'), tr('Тоо')], agg.byBagts.map((g) => [cell(g.name), cell(g.n, 'count')])),
  ];

  /* ── Анхааруулга: сүүлийн 30 хоногийнх улаан; түүнээс хуучин хохирол шар ── */
  const issues: KpiIssue[] = [];
  for (const r of rows) {
    const recent = r.ognoo != null && r.ognoo >= since && r.ognoo <= now;
    if (recent) issues.push({ text: issueText(r), tone: 'bad' });
    else if (isDamage(r)) issues.push({ text: issueText(r), tone: 'warn' });
  }

  return {
    value: num(agg.recent),
    unit: tr('осол, зөрчил — сүүлийн {0} хоногт', RECENT_DAYS),
    facts,
    level,
    tables,
    issues,
    asOf: agg.last,
    failedSources: [],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

export const loadSafetyRows = cached(async (): Promise<SafetyRow[]> => {
  const I = HABEA.incident.fields;
  const [raw, dom] = await Promise.all([
    queryFeatures(HABEA.incident.url, {
      outFields: [...Object.values(I), 'objectid'],
      orderBy: `${I.ognoo} DESC, objectid DESC`,
    }),
    loadCodedMaps(HABEA.incident.url, [I.turul, I.shaltgaanTurul, I.company]),
  ]);
  return raw.filter((r) => !isBlankIncident(r)).map((r) => toSafetyRow(r, dom));
}, 5 * 60_000, ['HABEA']);

export const loadSafetyKpi = cached(async (): Promise<KpiResult> => (
  computeSafety(await loadSafetyRows(), Date.now())
), 5 * 60_000, ['HABEA']);
