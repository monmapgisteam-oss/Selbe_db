'use client';

/**
 * ТӨСЛИЙН НЭГДСЭН АМЬД ҮЗҮҮЛЭЛТҮҮД — илтгэлээс бэхлэгдсэн ◆ тоонуудын оронд.
 *
 * 2026-08-13: хэрэглэгчийн шийдвэрээр `brief.ts`-ийн бүх ХАТУУ тоо устаж,
 * дашбоард/тайлан/нүүр бүгд ЭНЭ модулийн кэштэй амьд тооцооноос уншина.
 * Амьд эх сурвалжгүй үзүүлэлт ХАРАГДАХГҮЙ (худал тогтмол хэвлэхгүй).
 *
 * Эх сурвалжууд:
 *   · талбай      — хилийн давхарга [97] `Hec_area`
 *   · хүн ам      — барилгын давхарга [108] `Population` нийлбэр
 *                   (⚠️ `Total_population` ХОРИОТОЙ — багтаамжийн дээд тоо)
 *   · өрх/блок    — building_GOL (AIL_TOO) — `useBagtsTable` аль хэдийн амьд
 *   · нийт ХО     — INVEST хүснэгт (баталгаажсан + урьдчилсан)
 *   · нийт явц    — Төсөл_Гүйцэтгэл жигнэсэн дундаж (Σw·a ÷ Σw)
 *   · нийгмийн    — test_data сургууль/цэцэрлэг/урлан/төрийн давхаргууд
 *   · ногоон      — test_data [35] Shape__Area
 */

import { queryFeatures, queryStats, count, sum, type Row } from '@/lib/query';
import {
  BOUNDARY, BUILT_LAYER, CASHFLOW2, PROJECT_PROGRESS,
  LAYER_BY_ID, layerUrl, oidOf,
} from '@/lib/services';

/**
 * Оршин суух хүн ам — [108]-ийн `Population` талбар.
 * ⚠️ `BUILT_FIELDS.population` (`Total_population`) БИШ: тэр нь багтаамжийн
 * дээд тоо (68 мянга) бөгөөд тооцоонд ХОРИОТОЙ (TRANSPORT_ANALYSIS_HANDOFF).
 */
const POPULATION_FIELD = 'Population';

/** Кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ) */
function cached<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = fn();
      p.catch(() => { p = null; });
    }
    return p;
  };
}

/* ══════════════ Төсөв — CASHFLOW2 (Cashflow /106) ══════════════ */

export type Budget = {
  /** Урьдчилсан төсөвт өртөг (CF006) — ₮ */
  total: number;
  /** Захирамжийн нийт дүн (CF012) — ₮ */
  orderTotal: number;
  /** Гэрээ байгуулах эрх олгосон дүн (CF023) — ₮ */
  contract: number;
  /** Санхүүжилтийн эх үүсвэр — задраагүй үлдэгдэлтэй */
  sources: { key: string; label: string; value: number }[];
};

/**
 * ТӨСЛИЙН ТӨСВИЙН ЭХ = `Cashflow /106` (CASHFLOW2). «Хөрөнгө оруулалт өртөг»
 * (/249)-ЭЭС ЯЛГААТАЙ: тэр нь олон нийтийн бүсийн хувийн таамаг оруулж 4.16
 * их наяд хөөргөдөг; энэ нь захирамж/гэрээгээр баталгаажсан ТӨСЛИЙН төсөв.
 */
export const loadBudget = cached<Budget>(async () => {
  const CF = CASHFLOW2.fields;
  const stats = [
    sum(CF.budget, 'b'), sum(CF.orderTotal, 'o'), sum(CF.contractAmount, 'c'),
    ...CASHFLOW2.sources.map((s, i) => sum(s.field, `s${i}`)),
  ];
  const r = await queryStats(CASHFLOW2.url, stats);
  const total = Number(r.b ?? 0);
  const orderTotal = Number(r.o ?? 0);
  const named: { key: string; label: string; value: number }[] = CASHFLOW2.sources
    .map((s, i) => ({ key: s.field as string, label: s.label as string, value: Number(r[`s${i}`] ?? 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  // Захирамжийн дүнгээс эх үүсвэр задраагүй үлдэгдэл (зөрүү нуухгүй)
  const rest = orderTotal - named.reduce((a, x) => a + x.value, 0);
  if (rest > 0) named.push({ key: 'rest', label: 'Эх үүсвэр задраагүй', value: rest });
  return { total, orderTotal, contract: Number(r.c ?? 0), sources: named };
});

export type Headline = {
  /** Төслийн талбай, га — хилийн `Hec_area` */
  areaHa: number;
  /** Оршин суух хүн ам — барилгуудын `Population` нийлбэр */
  population: number;
  /** ТӨСЛИЙН нийт төсөвт өртөг, ₮ — Cashflow /106 (CF006) */
  investTotal: number;
  /** Гэрээгээр баталгаажсан дүн, ₮ — Cashflow /106 (CF023) */
  investConfirmed: number;
  /** Ногоон байгууламжийн талбай, га — test_data [35] */
  greenHa: number | null;
};

export const loadHeadline = cached<Headline>(async () => {
  const green = LAYER_BY_ID.nogoon;
  const [b, pop, budget, gr] = await Promise.all([
    queryFeatures(BOUNDARY.plan.url, { outFields: ['Hec_area'] }),
    queryStats(layerUrl(BUILT_LAYER), [sum(POPULATION_FIELD, 'p')]),
    loadBudget(),
    green
      ? queryStats(layerUrl(green), [sum('Shape__Area', 'a')]).catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    areaHa: Number(b[0]?.Hec_area ?? 0),
    population: Number(pop.p ?? 0),
    investTotal: budget.total,
    investConfirmed: budget.contract,
    greenHa: gr ? Number(gr.a ?? 0) / 10_000 : null,
  };
});

/* ══════════════ Төслийн жигнэсэн явц ══════════════ */

type StageAgg = { weight: number; actual: number; rows: number };
export type ProjectProgress = {
  /** Жигнэсэн гүйцэтгэл — БОДИТ жингийн нийлбэрт нормчилсон (%) */
  actual: number;
  /** Хүснэгтэд бүртгэгдсэн нийт жин (%) — 100 БИШ (~81.5) */
  coverage: number;
  byStage: Record<string, StageAgg>;
};

/**
 * ⚠️ Жигнэсэн дүнг `Σ(жин × гүйц) / Σжин` гэж бодно, 100-д ХУВААХГҮЙ:
 * жингийн нийлбэр ~81.5% тул 100-д хуваавал явц чимээгүй доошилно.
 */
export const loadProjectProgress = cached<ProjectProgress>(async () => {
  const PP = PROJECT_PROGRESS.fields;
  const rows = await queryFeatures(PROJECT_PROGRESS.url, {
    outFields: [PP.stage, PP.weight, PP.actual],
    limit: 2000,
  });
  const w = (r: Row) => Number(r[PP.weight]) || 0;
  const a = (r: Row) => Number(r[PP.actual] ?? 0) || 0;

  const byStage: Record<string, StageAgg & { wa: number }> = {};
  let tw = 0;
  let twa = 0;
  for (const r of rows) {
    const k = String(r[PP.stage] ?? '').trim();
    if (!k) continue;
    const cur = byStage[k] ?? { weight: 0, actual: 0, rows: 0, wa: 0 };
    cur.weight += w(r);
    cur.wa += w(r) * a(r);
    cur.rows += 1;
    byStage[k] = cur;
    tw += w(r);
    twa += w(r) * a(r);
  }
  for (const k of Object.keys(byStage)) {
    const s = byStage[k];
    s.actual = s.weight ? s.wa / s.weight : 0;
  }
  return { actual: tw ? twa / tw : 0, coverage: tw, byStage };
});

/** Хэд хэдэн үе шатыг жингээр нь нэгтгэсэн амьд % — таарах шат алга бол null */
export const liveStage = (p: ProjectProgress | null, keys: readonly string[]): number | null => {
  if (!p || !keys.length) return null;
  let tw = 0;
  let twa = 0;
  for (const k of keys) {
    const s = p.byStage[k];
    if (!s) continue;
    tw += s.weight;
    twa += s.weight * s.actual;
  }
  return tw ? twa / tw : null;
};

/* ══════════════ Өрх · блок (building_GOL) ══════════════ */

export type HousingTotals = { blocks: number; ail: number };

/** Нүүр/тайланд хөнгөн нийлбэр — гүйцэтгэлийн хүнд join-гүйгээр */
export const loadHousing = cached<HousingTotals>(async () => {
  const { BUILDING } = await import('@/lib/services');
  const s = await queryStats(BUILDING.url, [
    count(BUILDING.oid, 'n'),
    sum(BUILDING.fields.households, 'ail'),
  ]);
  return { blocks: Number(s.n ?? 0), ail: Number(s.ail ?? 0) };
});

/* ══════════════ Нийгмийн үйлчилгээний барилга ══════════════ */

export type SocialRow = {
  key: string;
  label: string;
  /** Барилгын тоо */
  n: number;
  /** Хүчин чадал (суудал/ор) — талбар хоосон давхаргад null */
  capacity: number | null;
};
export type SocialLive = { rows: SocialRow[]; totalN: number };

/** test_data-гийн нийгмийн давхаргууд — каталогийн id-гаар (URL нь TD руу шилжсэн) */
const SOCIAL_GROUPS: { key: string; label: string; ids: string[] }[] = [
  { key: 'school', label: 'Сургууль', ids: ['pkg:230', 'pkg:228', 'pkg:232'] },
  { key: 'kinder', label: 'Цэцэрлэг', ids: ['pkg:226', 'pkg:234', 'pkg:235', 'pkg:236', 'pkg:237'] },
  { key: 'art', label: 'Хүүхдийн урлан бүтээх төв', ids: ['pkg:242'] },
  { key: 'gov', label: 'Төрийн үйлчилгээ', ids: ['pkg:243'] },
];

export const loadSocial = cached<SocialLive>(async () => {
  const rows = await Promise.all(
    SOCIAL_GROUPS.map(async (g) => {
      const per = await Promise.all(
        g.ids.map(async (id) => {
          const d = LAYER_BY_ID[id];
          if (!d) return { n: 0, cap: 0, hasCap: false };
          const s = await queryStats(layerUrl(d), [
            count(oidOf(d), 'n'),
            sum('Huchin_chadal', 'cap'),
          ]).catch(async () => {
            // Huchin_chadal байхгүй давхаргад зөвхөн тоог авна
            const c = await queryStats(layerUrl(d), [count(oidOf(d), 'n')]);
            return { ...c, cap: null } as Row;
          });
          const cap = s.cap == null ? null : Number(s.cap);
          return { n: Number(s.n ?? 0), cap: cap ?? 0, hasCap: cap != null && cap > 0 };
        }),
      );
      const n = per.reduce((s, x) => s + x.n, 0);
      const hasCap = per.some((x) => x.hasCap);
      const cap = per.reduce((s, x) => s + (x.cap ?? 0), 0);
      return { key: g.key, label: g.label, n, capacity: hasCap ? cap : null };
    }),
  );
  const kept = rows.filter((r) => r.n > 0);
  return { rows: kept, totalN: kept.reduce((s, r) => s + r.n, 0) };
});
