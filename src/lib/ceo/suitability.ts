/**
 * CEO САМБАР — «Тохиромжтой байдлын үнэлгээ: норм зөрчсөн бүс/үзүүлэлт».
 *
 * Эх сурвалж нь `loadAnalysisCached()` (`@/lib/analysis/data`) — бүсийн
 * давхарга + барилга + ногоон + зогсоол + дэд бүтцээс бүс бүрийн түүхий
 * үзүүлэлт (`raw`/`rawActual`). React hook (`useSuitability`) БИШ — самбар
 * нь `execData.ts:272-316`-ийн `byIndicator` давталтыг ЯГ давтана, гэхдээ
 * үзүүлэлт бүрд ХАМГИЙН МУУ ганц бүс биш, норм зөрчсөн БҮХ бүсийг хуримтлуулна
 * (`kpi.ts`: «бүрэн жагсаалт заавал»).
 *
 * ⚠️ ҮР ДҮН НЬ БҮСЭЭР (`A-14`, `Багц-2.1` …), БАГЦААР БИШ. Бүс → багцын
 *    зураглал репод байхгүй тул ЗОХИОХГҮЙ. Бүсийн id өөрөө «Багц…»-аар эхэлбэл
 *    тэр нь өөрөө багц гэж уншигдана — хүснэгтэд id-г тэр чигт нь бичнэ.
 *
 * ⚠️ `rawActual` уншина, `raw` БИШ (execData-ийн адил): `ASSUME_MET` нь `raw`-д
 *    `social`/`engineering`-ийг хүчээр «хангасан» болгодог. Оноо (`urbanScore`)
 *    харин `raw`-аар — оноололд таамаг үзүүлэлт нөлөөлөхгүй байх ёстой.
 *
 * ⚠️ `engineering` ХАСАГДСАН (хэрэглэгчийн шийдвэр 2026-08-24, execData): норм
 *    нь батлагдаагүй таамаг. `ref` (`greenCap`, `densityCap`) ба жин 0 — мөн адил.
 *
 * ⚠️ `@/lib/analysis/data` нь `@arcgis/core` (geometryEngine, rest/query)-ийг
 *    ШУУД импортолдог. Тиймээс түүнийг ЗӨВХӨН ачаалагчийн биед динамикаар
 *    импортолно — (1) нүүрийн chunk-д ArcGIS SDK ордоггүй, (2) энэ файлын цэвэр
 *    тооцоо (`computeSuitability`, `buildSuitabilityKpi`) Node-д сүлжээгүй
 *    тестлэгдэнэ (`suitability.check.mjs`).
 *
 * ⚠️ dataBus таг ХООСОН: төлөвлөлтийн давхаргууд порталаас бичигддэггүй тул
 *    хүчингүй болгох түлхүүр байхгүй. `loadAnalysisCached` өөрөө модулийн
 *    түвшинд кэштэй (хэдэн секундын тооцоо) — TTL ч хэрэггүй.
 *
 * ⚠️ i18n: `en.ts`-д БАЙГАА түлхүүрийг дахин ашиглана («Үзүүлэлт» · «Норм» ·
 *    «Утга» · «Зөрүү» · «Бүс» · «Төрөл» · «Оноо» · «дундаж оноо» ·
 *    «≤ {0} – {1}{2} (бүсийн төрлөөр)»). Энэ файл `en.ts`-ийг ӨӨРӨӨ засдаггүй —
 *    доорх 14 ШИНЭ түлхүүрийг `en.ts`-д нэмэх ёстой (эс бөгөөс
 *    `tools/i18n-extract.mjs` «дутуу» гэж унана; 2026-09-06-нд скриптээр
 *    шалгахад яг энэ 14 нь дутуу, бусад 9 нь байгаа):
 *      «Үзүүлэлт бүрээр»           → By indicator
 *      «Норм зөрчсөн бүс бүрээр»   → Zones breaching the standard
 *      «Бүсийн оноо — хамгийн муу» → Zone score — worst
 *      «Зөрчсөн бүс» → Zones breaching · «Дүгнэсэн бүс» → Zones assessed
 *      «Хамгийн муу бүс» → Worst zone · «Эх өгөгдөл» → Source data
 *      «батлагдаагүй» → unverified · «Зөрчсөн үзүүлэлт» → Indicators breached
 *      «үзүүлэлт норм зөрчсөн» → indicators breaching the standard
 *      «{0} бүс / {1}» → {0} zones / {1} · «{0} зөрчил» → {0} breaches
 *      «{0} үзүүлэлт батлагдаагүй эх өгөгдөлтэй» → {0} indicators with unverified source data
 *      «{0}: {1} бүс норм зөрчсөн (хамгийн муу {2})» → {0}: {1} zones breach the standard (worst {2})
 */
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { scoreLevel, type Level } from '@/lib/kpiLevels';
import { cached } from '@/lib/live';
import { INDICATORS, DENSITY_BY_TYPE, ASSUME_MET, PARKING, type Indicator } from '@/lib/analysis/config';
import { normFor, passesNorm, normGap, normText, urbanScore } from '@/lib/analysis/score';
import type { Zone } from '@/lib/analysis/data';
import { cell, table, worstOf, type KpiResult, type KpiIssue, type DetailTable } from './kpi';

/* ══════════════ Төрлүүд ══════════════ */

/** Тооцоонд хэрэгтэй бүсийн талбарууд — тест зохиомол бүс өгч болно */
export type SuitZoneInput = Pick<Zone, 'id' | 'type' | 'excluded' | 'raw' | 'rawActual'>;

/** Нэг (бүс, үзүүлэлт) зөрчил */
export type SuitFail = {
  zone: string;
  type: string;
  indId: string;
  short: string;
  value: number;
  /** ТУХАЙН БҮСИЙН норм — `gap` бодоход ашигласантай ижил (execData-ийн ⚠️) */
  norm: string;
  gap: number;
  assumed: boolean;
};

export type SuitIndicatorRow = {
  id: string;
  name: string;
  short: string;
  unit: string;
  decimals: number;
  fails: number;
  scored: number;
  worst: { zone: string; value: number; gap: number; norm: string } | null;
  normLabel: string;
  assumed: boolean;
};

export type SuitZoneScore = {
  zone: string;
  type: string;
  /** `urbanScore(z.raw)` — 0–100; бодогдохгүй бол null */
  score: number | null;
  /** Норм зөрчсөн үзүүлэлтийн тоо */
  fails: number;
};

export type SuitComputed = {
  /** Дүгнэсэн үзүүлэлт бүр (зөрчилгүй ч орно) — fails desc */
  byIndicator: SuitIndicatorRow[];
  /** БҮХ зөрчил — үзүүлэлтээр (fails desc), дотроо gap desc */
  fails: SuitFail[];
  /** Оноотой бүс бүр — оноо asc (хамгийн муу эхэнд) */
  zones: SuitZoneScore[];
  scoredZones: number;
  zonesFailing: number;
  pairs: number;
  indicatorsFailing: number;
  /** Зөрчилтэй үзүүлэлтээс `ASSUME_MET`-тэй нь */
  assumedFailing: number;
  /** Дүгнэсэн үзүүлэлтээс `ASSUME_MET`-тэй нь (батлагдаагүй эх өгөгдөл) */
  assumedCount: number;
  avgScore: number | null;
};

/** «Бүсийн оноо — хамгийн муу» хүснэгтийн мөрийн тоо */
export const WORST_ZONES_N = 15;

/* ══════════════ Цэвэр тооцоо ══════════════ */

/** execData-тай ИЖИЛ нормын форматлагч — норм текст хоёр газар зөрөхгүй */
const fmtNorm = (x: number, d?: number) => x.toFixed(d ?? 1);

/** Дүгнэгдэх үзүүлэлтүүд — execData:273-ийн шүүлт */
export const judgedIndicators = (indicators: readonly Indicator[] = INDICATORS): Indicator[] =>
  indicators.filter((ind) => !ind.ref && ind.weight > 0 && ind.id !== 'engineering');

export function computeSuitability(
  zones: readonly SuitZoneInput[],
  indicators: readonly Indicator[] = INDICATORS,
): SuitComputed {
  /* ⚠️ ХАСАГДСАН бүс (`excluded` — ногоон байгууламж, одоо байгаа барилга)
     зөрчилд тоологдохгүй: оноололд ч ордоггүй (execData-ийн адил). */
  const live = zones.filter((z) => !z.excluded);
  const judged = judgedIndicators(indicators);
  const failsByZone = new Map<string, number>();
  const allFails: SuitFail[] = [];

  const byIndicator: SuitIndicatorRow[] = judged.map((ind) => {
    const assumed = ind.id in ASSUME_MET;
    let fails = 0;
    let scored = 0;
    let worst: SuitIndicatorRow['worst'] = null;
    for (const z of live) {
      const eff = normFor(ind, z.type);
      const v = z.rawActual[ind.id];
      const ok = passesNorm(v, eff);
      /* ⚠️ null ≠ 0: утгагүй бүс дүгнэгдэхгүй — «хангасан» ч, «зөрчсөн» ч биш */
      if (ok == null || v == null) continue;
      scored += 1;
      if (ok) continue;
      fails += 1;
      const gap = normGap(v, eff) ?? 0;
      /* ⚠️ Нормыг `eff`-ээс ЭНД хадгална — дэлгэцийн норм = зөрүү бодсон норм */
      const norm = normText(eff, fmtNorm);
      allFails.push({ zone: z.id, type: z.type, indId: ind.id, short: ind.short, value: v, norm, gap, assumed });
      failsByZone.set(z.id, (failsByZone.get(z.id) ?? 0) + 1);
      if (!worst || gap > worst.gap) worst = { zone: z.id, value: v, gap, norm };
    }
    /* ⚠️ `byType` (FAR/BCR) — ерөнхий норм байхгүй, бүсийн төрлөөр өөр
       (`DENSITY_BY_TYPE`): мужаар бичнэ (execData:292-303). */
    const capOf = (t: 'farMax' | 'bcrMax') => Object.values(DENSITY_BY_TYPE).map((d) => d[t]);
    const normLabel = ind.byType
      ? tr('≤ {0} – {1}{2} (бүсийн төрлөөр)',
        fmtNorm(Math.min(...capOf(ind.byType)), ind.decimals),
        fmtNorm(Math.max(...capOf(ind.byType)), ind.decimals),
        ind.unit ? ` ${ind.unit}` : '')
      : normText(ind, fmtNorm);
    return {
      id: ind.id, name: ind.name, short: ind.short, unit: ind.unit ?? '', decimals: ind.decimals,
      fails, scored, worst, normLabel, assumed,
    };
  }).sort((a, b) => b.fails - a.fails);

  /* Зөрчлүүд — үзүүлэлтийн (fails desc) дарааллаар, дотроо зөрүү desc */
  const order = new Map(byIndicator.map((r, i) => [r.id, i]));
  const fails = allFails.sort((a, b) => (
    (order.get(a.indId) ?? 0) - (order.get(b.indId) ?? 0) || b.gap - a.gap || a.zone.localeCompare(b.zone)
  ));

  /* Оноо — execData:251 (`urbanScore(z.raw, INDICATORS, z.type)`), БҮХ бүсээр;
     хасагдсан бүсийн `raw` хоосон тул оноо нь null → дундажид орохгүй */
  const scoredList: SuitZoneScore[] = zones.map((z) => ({
    zone: z.id,
    type: z.type,
    score: urbanScore(z.raw, [...indicators], z.type).score,
    fails: failsByZone.get(z.id) ?? 0,
  }));
  const valid = scoredList.filter((z): z is SuitZoneScore & { score: number } => z.score != null);
  const zonesSorted = valid.sort((a, b) => a.score - b.score || b.fails - a.fails);

  const failingRows = byIndicator.filter((r) => r.fails > 0);
  return {
    byIndicator,
    fails,
    zones: zonesSorted,
    scoredZones: valid.length,
    zonesFailing: failsByZone.size,
    pairs: fails.length,
    indicatorsFailing: failingRows.length,
    assumedFailing: failingRows.filter((r) => r.assumed).length,
    assumedCount: byIndicator.filter((r) => r.assumed).length,
    /* ⚠️ null ≠ 0: оноотой бүс байхгүй бол дундаж null, 0 биш */
    avgScore: valid.length ? valid.reduce((a, z) => a + z.score, 0) / valid.length : null,
  };
}

/* ══════════════ KpiResult угсрах ══════════════ */

const withUnit = (v: number, d: number, unit: string) => `${num(v, d)}${unit ? ` ${unit}` : ''}`;

export function buildSuitabilityKpi(c: SuitComputed): KpiResult {
  const loaded = c.byIndicator.some((r) => r.scored > 0);
  const decimalsOf = new Map(c.byIndicator.map((r) => [r.id, r.decimals]));
  const unitOf = new Map(c.byIndicator.map((r) => [r.id, r.unit]));

  /* (1) Үзүүлэлт бүрээр */
  const t1 = table(
    tr('Үзүүлэлт бүрээр'),
    [tr('Үзүүлэлт'), tr('Норм'), tr('Зөрчсөн бүс'), tr('Дүгнэсэн бүс'), tr('Хамгийн муу бүс'), tr('Утга'), tr('Зөрүү'), tr('Эх өгөгдөл')],
    c.byIndicator.map((r) => [
      cell(r.short),
      cell(r.normLabel),
      cell(r.scored > 0 ? r.fails : null, 'count'),
      cell(r.scored > 0 ? r.scored : null, 'count'),
      cell(r.worst?.zone ?? null),
      cell(r.worst ? withUnit(r.worst.value, r.decimals, r.unit) : null),
      cell(r.worst ? withUnit(r.worst.gap, r.decimals, r.unit) : null),
      cell(r.assumed ? tr('батлагдаагүй') : ''),
    ]),
  );

  /* (2) Норм зөрчсөн бүс бүрээр — БҮХ зөрчил */
  const t2 = table(
    tr('Норм зөрчсөн бүс бүрээр'),
    [tr('Бүс'), tr('Төрөл'), tr('Үзүүлэлт'), tr('Утга'), tr('Норм'), tr('Зөрүү')],
    c.fails.map((f) => {
      const d = decimalsOf.get(f.indId) ?? 1;
      const u = unitOf.get(f.indId) ?? '';
      return [
        cell(f.zone),
        cell(f.type),
        cell(f.short),
        cell(withUnit(f.value, d, u)),
        cell(f.norm),
        cell(withUnit(f.gap, d, u)),
      ];
    }),
  );

  /* (3) Бүсийн оноо — хамгийн муу N */
  const t3 = table(
    tr('Бүсийн оноо — хамгийн муу'),
    [tr('Бүс'), tr('Төрөл'), tr('Оноо'), tr('Зөрчсөн үзүүлэлт')],
    c.zones.slice(0, WORST_ZONES_N).map((z) => [
      cell(z.zone),
      cell(z.type),
      cell(z.score == null ? null : Math.round(z.score), 'count'),
      cell(z.fails, 'count'),
    ]),
  );
  const tables: DetailTable[] = [t1, t2, t3];

  const issues: KpiIssue[] = c.byIndicator
    .filter((r) => r.fails > 0 && r.worst)
    .map((r) => ({
      tone: r.assumed ? 'warn' : 'bad',
      text: tr('{0}: {1} бүс норм зөрчсөн (хамгийн муу {2})', r.short, r.fails, r.worst?.zone ?? ''),
    }));

  /* ⚠️ Зөвхөн БОДИТ тоотой хэсгүүд — оноо null бол тэр хэсгийг бичихгүй */
  const facts: string[] = [];
  if (loaded) {
    facts.push(tr('{0} бүс / {1}', c.zonesFailing, c.scoredZones));
    facts.push(tr('{0} зөрчил', c.pairs));
    /* ⚠️ «дундаж оноо» нь `en.ts`-д БАЙГАА түлхүүр — «дундаж оноо {0}» гэж
       шинэ түлхүүр зохиохгүй, тоог ард нь залгана */
    if (c.avgScore != null) facts.push(`${tr('дундаж оноо')} ${num(c.avgScore, 0)}`);
    if (c.assumedCount > 0) facts.push(tr('{0} үзүүлэлт батлагдаагүй эх өгөгдөлтэй', c.assumedCount));
  }

  /* Түвшин: батлагдсан үзүүлэлтийн зөрчил → bad; зөвхөн таамаг (`ASSUME_MET`)
     үзүүлэлтийн зөрчил → warn; дээр нь дундаж онооны босго (65/45). */
  const failLevel: Level = c.indicatorsFailing === 0
    ? (loaded ? 'good' : 'unknown')
    : c.indicatorsFailing > c.assumedFailing ? 'bad' : 'warn';
  const level = loaded ? worstOf([failLevel, scoreLevel(c.avgScore)]) : 'unknown';

  return {
    value: num(loaded ? c.indicatorsFailing : null),
    unit: tr('үзүүлэлт норм зөрчсөн'),
    facts,
    level,
    tables,
    issues,
    /* Төлөвлөлтийн давхаргад огнооны талбар байхгүй */
    asOf: null,
    failedSources: [],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ Ганц эх сурвалж: `loadAnalysisCached` унавал ЮУ Ч ачаалагдаагүй тул
 *    алдааг дамжуулна (`cached` нь унасан амлалтыг кэшлэхгүй — дахин оролдоно).
 */
export const loadSuitabilityKpi = cached(async (): Promise<KpiResult> => {
  const { loadAnalysisCached, computeRaw, defaultGreenCats } = await import('@/lib/analysis/data');
  const data = await loadAnalysisCached();
  /* execData-ийн адил анхдагч ногоон ангилал + зогсоолын арга — `raw`/`rawActual`-ыг бөглөнө */
  computeRaw(data.zones, defaultGreenCats(), PARKING);
  return buildSuitabilityKpi(computeSuitability(data.zones));
}, undefined, []);
