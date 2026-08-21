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

import { queryFeatures, queryStats, queryGroup, count, sum, type Row } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import {
  BOUNDARY, BUILT_LAYER, CASHFLOW2, PROJECT_PROGRESS,
  LAYER_BY_ID, PARCEL_LEFT, layerUrl, oidOf, bagtsKey,
} from '@/lib/services';
import { sumBy, tally } from '@/lib/agg';

/**
 * Оршин суух хүн ам — [108]-ийн `Population` талбар.
 * ⚠️ `BUILT_FIELDS.population` (`Total_population`) БИШ: тэр нь багтаамжийн
 * дээд тоо (68 мянга) бөгөөд тооцоонд ХОРИОТОЙ (TRANSPORT_ANALYSIS_HANDOFF).
 */
const POPULATION_FIELD = 'Population';

/** Кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ).
 * `ttlMs` өгвөл тэр хугацааны дараа дараагийн дуудалт шинээр татна — харагдац
 * хооронд шилжихэд дахин татахгүй, гэхдээ өгөгдөл хуучрахгүй.
 * ⚠️ export (2026-08-21 гүйцэтгэлийн аудит): Finance/Habea зэрэг view бүрийн
 * mount дээр бүтэн хүснэгтүүдээ ДАХИН татдаг байсныг энэ хэвээр кэшилнэ. */
export function cached<T>(fn: () => Promise<T>, ttlMs?: number): () => Promise<T> {
  let p: Promise<T> | null = null;
  let at = 0;
  return () => {
    if (!p || (ttlMs != null && Date.now() - at > ttlMs)) {
      at = Date.now();
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
  /**
   * ⚠️ ШИНЭ — Өмнө шилжүүлсэн мөнгөн дүн (CF028), ₮.
   * ⚠️ CF027 (`prevPct`)-ыг ХЭЗЭЭ Ч нийлбэрлэхгүй: тэр нь мөр тутмын 0–1
   *    бутархай хувь бөгөөд нийлбэрлэхэд утгагүй тоо гарна.
   */
  transferred: number;
  /** Санхүүжилтийн эх үүсвэр — задраагүй үлдэгдэлтэй */
  sources: { key: string; label: string; value: number }[];
  /** ⚠️ ШИНЭ — ажлын ТӨРӨЛ (CF002)-өөр төсөвт өртөг */
  byType: { key: string; label: string; value: number; n: number }[];
  /** ⚠️ ШИНЭ — багц (CF004)-аар. `key` нь `bagtsKey()`, `label` нь түүхий нэр. */
  byPkg: { key: string; label: string; value: number; n: number }[];
  /** ⚠️ ШИНЭ — сарын санхүүжилтийн ТӨЛӨВЛӨГӨӨ, ₮ */
  months: { label: string; amount: number }[];
};

/**
 * ТӨСЛИЙН ТӨСВИЙН ЭХ = `Cashflow /106` (CASHFLOW2). «Хөрөнгө оруулалт өртөг»
 * (/249)-ЭЭС ЯЛГААТАЙ: тэр нь олон нийтийн бүсийн хувийн таамаг оруулж 4.16
 * их наяд хөөргөдөг; энэ нь захирамж/гэрээгээр баталгаажсан ТӨСЛИЙН төсөв.
 */
/** CF002/CF004-ийн «0» нь БӨГЛӨӨГҮЙ sentinel — хоосонтой адилаар үзнэ */
const cfLabel = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const loadBudget = cached<Budget>(async () => {
  const CF = CASHFLOW2.fields;
  const stats = [
    sum(CF.budget, 'b'), sum(CF.orderTotal, 'o'), sum(CF.contractAmount, 'c'),
    sum(CF.prevAmount, 'p'),
    ...CASHFLOW2.sources.map((s, i) => sum(s.field, `s${i}`)),
    // ⚠️ ЗӨВХӨН `m.amount` — `amountCum` нь ЖИЛ БҮР ТЭГЛЭГДДЭГ (2025-12 → 2026-01)
    //    тул өссөн дүн гэж нийлбэрлэвэл хөрөөний шүд шиг график гарна.
    ...CASHFLOW2.months.map((m, i) => sum(m.amount, `m${i}`)),
  ];
  const [r, g] = await Promise.all([
    queryStats(CASHFLOW2.url, stats),
    // ⚠️ Энэ бол шинээр нэмэгдсэн ЦОРЫН ГАНЦ хүсэлт. Хоёр баганыг НЭГ groupBy-д.
    queryGroup(CASHFLOW2.url, `${CF.type},${CF.pkg2}`, [
      sum(CF.budget, 'b'), count(CASHFLOW2.oid, 'n'),
    ]),
  ]);

  const total = Number(r.b ?? 0);
  const orderTotal = Number(r.o ?? 0);
  const named: { key: string; label: string; value: number }[] = CASHFLOW2.sources
    .map((s, i) => ({ key: s.field as string, label: s.label as string, value: Number(r[`s${i}`] ?? 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  // Захирамжийн дүнгээс эх үүсвэр задраагүй үлдэгдэл (зөрүү нуухгүй)
  const rest = orderTotal - sumBy(named, (x) => x.value);
  if (rest > 0) named.push({ key: 'rest', label: tr('Эх үүсвэр задраагүй'), value: rest });

  return {
    total,
    orderTotal,
    contract: Number(r.c ?? 0),
    transferred: Number(r.p ?? 0),
    sources: named,
    // ⚠️ Мөр бүр = АЖЛЫН мөр, ГЭРЭЭ БИШ (76 мөрийн 50-д CF022 хоосон) → `n` = «ажил»
    byType: tally(
      g,
      (row) => ({ key: cfLabel(row[CF.type]), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Төрөл тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
    byPkg: tally(
      g,
      (row) => ({ key: cfLabel(row[CF.pkg2]), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Багц тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
    months: CASHFLOW2.months.map((m, i) => ({ label: m.label, amount: Number(r[`m${i}`] ?? 0) })),
  };
  // ⚠️ Хяналт: Σ byType.value === total байх ёстой.
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

/**
 * `Төсөл_Гүйцэтгэл`-ийн МӨР — задаргаа хэрэгтэй хэсгүүд өөрсдөө нэгтгэнэ.
 *
 * ⚠️ 2026-08-17: Урьд нь `loadProjectProgress` нь мөрүүдийг нэгтгээд ХАЯДАГ
 * байсан тул «Шугам сүлжээ», «Цахилгаан», «Нийгмийн дэд бүтэц» хэсгүүд өөрсдийн
 * зүсэлтээ гаргаж чаддаггүй байв. Одоо түүхий мөрийг ч буцаана — ИЖИЛ ГАНЦ
 * хүсэлт, зөвхөн `outFields` дөрвөөр нэмэгдсэн.
 */
export type ProgRow = {
  /**
   * `Төсөл` — ⚠️ НАЙДВАРГҮЙ багана: 20 мөр «Зөвшөөрөл» гэж бичигдсэн атлаа
   * «Сонгон шалгаруулалт»-д харьяалагдана. Зөвхөн НЭГТГЭХЭД хэрэглэнэ.
   */
  stage: string;
  work: string;
  no: string;
  /** `bagts_name` нормчилсон (`bagtsKey`) — 112/162 мөрд бий, эс бөгөөс '' */
  bagts: string;
  weight: number;
  actual: number;
  /** ⚠️ 162-оос 74 мөрд ХООСОН — тиймээс `null`, 0 БИШ */
  planned: number | null;
};

export type ProjectProgress = {
  /** Жигнэсэн гүйцэтгэл — БОДИТ жингийн нийлбэрт нормчилсон (%) */
  actual: number;
  /** Хүснэгтэд бүртгэгдсэн нийт жин (%) — 100 БИШ (~81.5) */
  coverage: number;
  byStage: Record<string, StageAgg>;
  /** ⚠️ ШИНЭ — түүхий мөрүүд. Хэсэг тус бүр өөрийн зүсэлтээ эндээс бодно. */
  rows: ProgRow[];
};

/**
 * ⚠️ Жигнэсэн дүнг `Σ(жин × гүйц) / Σжин` гэж бодно, 100-д ХУВААХГҮЙ:
 * жингийн нийлбэр ~81.5% тул 100-д хуваавал явц чимээгүй доошилно.
 */
export const loadProjectProgress = cached<ProjectProgress>(async () => {
  const PP = PROJECT_PROGRESS.fields;
  const raw = await queryFeatures(PROJECT_PROGRESS.url, {
    // ⚠️ ИЖИЛ ГАНЦ queryFeatures — 4 талбар нэмэгдсэн, шинэ хүсэлт ҮҮСЭХГҮЙ
    outFields: [PP.stage, PP.weight, PP.actual, PP.planned, PP.bagts, PP.work, PP.no],
    limit: 2000,
  });
  const rows: ProgRow[] = raw.map((r) => ({
    stage: String(r[PP.stage] ?? '').trim(),
    work: String(r[PP.work] ?? '').trim(),
    no: String(r[PP.no] ?? '').trim(),
    bagts: bagtsKey(r[PP.bagts]),
    weight: Number(r[PP.weight]) || 0,
    actual: Number(r[PP.actual] ?? 0) || 0,
    planned:
      r[PP.planned] == null || r[PP.planned] === '' ? null : Number(r[PP.planned]) || 0,
  }));

  const byStage: Record<string, StageAgg & { wa: number }> = {};
  let tw = 0;
  let twa = 0;
  for (const r of rows) {
    if (!r.stage) continue;
    const cur = byStage[r.stage] ?? { weight: 0, actual: 0, rows: 0, wa: 0 };
    cur.weight += r.weight;
    cur.wa += r.weight * r.actual;
    cur.rows += 1;
    byStage[r.stage] = cur;
    tw += r.weight;
    twa += r.weight * r.actual;
  }
  for (const k of Object.keys(byStage)) {
    const s = byStage[k];
    s.actual = s.weight ? s.wa / s.weight : 0;
  }
  return { actual: tw ? twa / tw : 0, coverage: tw, byStage, rows };
});

/** Жигнэсэн дүн — `Σ(жин×гүйц) ÷ Σжин`. Төлөвлөгөө нь БӨГЛӨГДСӨН мөрөөр л. */
export type Weighted = {
  weight: number;
  actual: number | null;
  /**
   * ⚠️ Зөвхөн `planned != null` мөрийн ЖИНГЭЭР — өөр хуваарьтай хоёр дүнг
   * зэрэгцүүлбэл «хоцорсон» дүгнэлт хиймлээр гарна (162-оос 74 мөр хоосон).
   */
  planned: number | null;
  /** Төлөвлөгөө бөглөгдсөн мөрийн эзлэх жин — карт дээр ил хэлэхэд */
  plannedWeight: number;
  rows: number;
};

export function weighted(rows: readonly ProgRow[]): Weighted {
  const w = sumBy(rows, (r) => r.weight);
  const wa = sumBy(rows, (r) => r.weight * r.actual);
  const withPlan = rows.filter((r) => r.planned != null);
  const pw = sumBy(withPlan, (r) => r.weight);
  const pwa = sumBy(withPlan, (r) => r.weight * (r.planned as number));
  return {
    weight: w,
    actual: w ? wa / w : null,
    planned: pw ? pwa / pw : null,
    plannedWeight: pw,
    rows: rows.length,
  };
}

/** Мөрүүдийг түлхүүрээр бүлэглэж, бүлэг тус бүрд `weighted()` бодно */
export function rollupBy(
  rows: readonly ProgRow[],
  key: (r: ProgRow) => string,
): { key: string; agg: Weighted }[] {
  const m = new Map<string, ProgRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return [...m].map(([k, rs]) => ({ key: k, agg: weighted(rs) }));
}

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
  /**
   * ⚠️ ШИНЭ — давхарга тус бүрийн задаргаа. `loadSocial` нь давхарга тутамд
   * count+sum аль хэдийн асуудаг байсан бөгөөд дүнг л ХАЯДАГ байв. Шинэ хүсэлт
   * ҮҮСЭХГҮЙ.
   */
  per: { id: string; title: string; n: number; capacity: number | null }[];
};
export type SocialLive = { rows: SocialRow[]; totalN: number };

/** test_data-гийн нийгмийн давхаргууд — каталогийн id-гаар (URL нь TD руу шилжсэн) */
const SOCIAL_GROUPS: { key: string; label: string; ids: string[] }[] = [
  { key: 'school', label: tr('Сургууль'), ids: ['pkg:230', 'pkg:228', 'pkg:232'] },
  { key: 'kinder', label: tr('Цэцэрлэг'), ids: ['pkg:226', 'pkg:234', 'pkg:235', 'pkg:236', 'pkg:237'] },
  { key: 'art', label: tr('Хүүхдийн урлан бүтээх төв'), ids: ['pkg:242'] },
  { key: 'gov', label: tr('Төрийн үйлчилгээ'), ids: ['pkg:243'] },
];

export const loadSocial = cached<SocialLive>(async () => {
  const rows = await Promise.all(
    SOCIAL_GROUPS.map(async (g) => {
      const per = await Promise.all(
        g.ids.map(async (id) => {
          const d = LAYER_BY_ID[id];
          const title = d?.title ?? id;
          if (!d) return { id, title, n: 0, cap: 0, hasCap: false };
          const s = await queryStats(layerUrl(d), [
            count(oidOf(d), 'n'),
            sum('Huchin_chadal', 'cap'),
          ]).catch(async () => {
            // Huchin_chadal байхгүй давхаргад зөвхөн тоог авна
            const c = await queryStats(layerUrl(d), [count(oidOf(d), 'n')]);
            return { ...c, cap: null } as Row;
          });
          const cap = s.cap == null ? null : Number(s.cap);
          return { id, title, n: Number(s.n ?? 0), cap: cap ?? 0, hasCap: cap != null && cap > 0 };
        }),
      );
      const n = sumBy(per, (x) => x.n);
      const hasCap = per.some((x) => x.hasCap);
      const cap = sumBy(per, (x) => x.cap ?? 0);
      return {
        key: g.key,
        label: g.label,
        n,
        capacity: hasCap ? cap : null,
        per: per
          .map((x) => ({ id: x.id, title: x.title, n: x.n, capacity: x.hasCap ? x.cap : null }))
          .filter((x) => x.n > 0),
      };
    }),
  );
  const kept = rows.filter((r) => r.n > 0);
  return { rows: kept, totalN: kept.reduce((s, r) => s + r.n, 0) };
});

/* ══════════════════ Газар чөлөөлөлт — нүүрийн KPI ══════════════════ */

export type Clearance = {
  /** Чөлөөлсөн = «Бүрэн чөлөөлсөн» + «Цэвэрлэсэн нэгж талбар» */
  cleared: number;
  /** Чөлөөлөөгүй = «Үлдсэн нэгж талбар» (барилга эхлүүлэхэд саад) */
  remaining: number;
  /** Чөлөөлөөгүй талбайн нийлбэр (га) */
  remainingHa: number;
  total: number;
  /** Чөлөөлсөн хувь (0–100), нийт 0 бол null */
  pct: number | null;
};

/**
 * Газар чөлөөлөлтийн нэгтгэл — `selbe_parcel` [94]-ийн `Tuluv` төлөвөөр.
 * «Газар чөлөөлөлт» харагдацын тооцоотой ИЖИЛ ангилал (`Gazar.tsx`):
 * чөлөөлсөн = бүрэн + цэвэрлэсэн; бусад бүх төлөв «чөлөөлөөгүй»-д ОРОХГҮЙ,
 * зөвхөн «Үлдсэн нэгж талбар» нь саадтай тул тэр нь ЧӨЛӨӨЛӨӨГҮЙ тоо.
 */
export const loadClearance = cached<Clearance>(async () => {
  const F = PARCEL_LEFT.fields;
  const rows = await queryGroup(
    PARCEL_LEFT.url, F.status,
    [count('OBJECTID', 'n'), sum(F.area, 'a')],
  );
  let cleared = 0, remaining = 0, remainingM2 = 0, total = 0;
  for (const r of rows) {
    const k = String(r[F.status] ?? '').trim();
    const n = Number(r.n ?? 0);
    total += n;
    if (k === 'Бүрэн чөлөөлсөн' || k === 'Цэвэрлэсэн нэгж талбар') cleared += n;
    else if (k === 'Үлдсэн нэгж талбар') { remaining += n; remainingM2 += Number(r.a ?? 0); }
  }
  return {
    cleared,
    remaining,
    remainingHa: remainingM2 / 10_000,
    total,
    pct: total > 0 ? (cleared / total) * 100 : null,
  };
});
