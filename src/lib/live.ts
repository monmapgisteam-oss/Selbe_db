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
  BOUNDARY, BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, CASHFLOW2,
  LAYER_BY_ID, PARCEL_LEFT, layerUrl, oidOf,
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
  /**
   * ⚠️ 2026-08 аудит (олдвор #22): аль нэг эх сурвалж унавал ТУХАЙН эх
   * сурвалжийн тоон талбарууд `NaN`-аар тэмдэглэгдэнэ (`byStatus` нь `[]`).
   * `null` БИШ байх шалтгаан: төрлийг nullable болговол Dashboard зэрэг
   * хэрэглэгчдийн арифметик (`h.investTotal / 1e12` г.м.) олон газар эвдэрнэ;
   * NaN нь тэнд аяндаа тархаж, `num()`/`pct()` «—» гэж зурна, guard-уудад falsy.
   */
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
  /**
   * ⚠️ ШИНЭ (2026-08-24) — барилгын ТӨЛӨВИЙН задаргаа (`Barilga_ty`):
   * Төлөвлөсөн / Баригдаж байгаа / Одоо байгаа. `BUILT_STATUS`-ийн дарааллаар,
   * танигдаагүй утга сүүлд.
   */
  byStatus: { label: string; n: number }[];
  /**
   * ⚠️ ШИНЭ — барилгажих талбай, м² (`Барилгажсан_талбай` нийлбэр).
   * ⚠️ Энэ нь давхраар үржсэн НИЙТ шалны талбай (≈152 га), барилгын бодит ХӨЛ
   *    (геометрийн `Shape__Area`, ≈21 га) БИШ. Өртгийн загвар үүн дээр үржинэ.
   */
  usableM2: number;
};

export const loadHeadline = cached<Headline>(async () => {
  const green = LAYER_BY_ID.nogoon;
  /*
   * ⚠️ 2026-08 аудит (олдвор #22): `Promise.all` → `allSettled`. Гурван ӨӨР
   * үйлчилгээг нэгтгэдэг тул урьд нь Cashflow /106 унахад огт хамааралгүй
   * «га талбай», «хүн ам» ч хамт унаж, бараг бүх харагдацын SummaryBar
   * «Үзүүлэлт татагдсангүй» болдог байв. Одоо унасан хэсгийн талбарууд NaN
   * (дэлгэцэд «—») болж бусад нь хэвийн гарна; БҮГД унавал л throw —
   * `cached` алдааг кэшлэхгүй тул «дахин оролдох» зам хэвээр.
   */
  const [bR, builtR, budgetR, grR] = await Promise.allSettled([
    queryFeatures(BOUNDARY.plan.url, { outFields: ['Hec_area'] }),
    /*
     * ⚠️ 2026-08-24: `queryStats` → `queryGroup`. ХҮСЭЛТИЙН ТОО ӨӨРЧЛӨГДӨӨГҮЙ
     * (нэг хүсэлт хэвээр) — зөвхөн нэг асуулгаас илүү ихийг авч байна. Урьд нь
     * зөвхөн хүн амын нийлбэр ирдэг байсныг барилгын ТӨЛӨВӨӨР бүлэглэж, мөрийн
     * тоо · хүн ам · барилгажих талбай гурвыг зэрэг татав. Нийлбэрүүдийг клиент
     * талд бүлгүүдээс нэмнэ.
     *
     * ⚠️ Шинэ хүсэлт НЭМЭХГҮЙ гэдэг нь CEO_KPI_PROMPT §0-ийн хатуу шаардлага —
     * тиймээс барилгын төлөвийн задаргааг ТУСДАА асуулга болгосонгүй.
     */
    queryGroup(layerUrl(BUILT_LAYER), BUILT_FIELDS.status, [
      count(oidOf(BUILT_LAYER), 'n'),
      sum(POPULATION_FIELD, 'p'),
      sum(BUILT_FIELDS.usable, 'u'),
    ]),
    loadBudget(),
    green
      ? queryStats(layerUrl(green), [sum('Shape__Area', 'a')]).catch(() => null)
      : Promise.resolve(null),
  ]);
  /* Бүх гол эх сурвалж унасан — хэсэгчлэн үзүүлэх юм алга, алдаагаар нь
     дуудагчид (SummaryBar/ExecKpi-ийн error + retry) мэдэгдэнэ */
  if (bR.status === 'rejected' && builtR.status === 'rejected' && budgetR.status === 'rejected')
    throw bR.reason;
  const b = bR.status === 'fulfilled' ? bR.value : null;
  const built = builtR.status === 'fulfilled' ? builtR.value : null;
  const budget = budgetR.status === 'fulfilled' ? budgetR.value : null;
  const gr = grR.status === 'fulfilled' ? grR.value : null;

  /* ⚠️ Танигдаагүй/хоосон төлөв ХАЯГДАХГҮЙ — «Тодорхойгүй» болж сүүлд жагсана.
     Чимээгүй хаявал нийт барилгын тоо задаргааны нийлбэртэй зөрнө. */
  const order = new Map(BUILT_STATUS.map((x, i) => [x.value, i]));
  const byStatus = (built ?? [])
    .map((r) => ({
      label: String(r[BUILT_FIELDS.status] ?? '').trim() || tr('Тодорхойгүй'),
      n: Number(r.n ?? 0),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99));

  return {
    areaHa: b ? Number(b[0]?.Hec_area ?? 0) : NaN,
    population: built ? sumBy(built, (r) => Number(r.p ?? 0)) : NaN,
    investTotal: budget ? budget.total : NaN,
    investConfirmed: budget ? budget.contract : NaN,
    greenHa: gr ? Number(gr.a ?? 0) / 10_000 : null,
    byStatus,
    usableM2: built ? sumBy(built, (r) => Number(r.u ?? 0)) : NaN,
  };
  /* ⚠️ TTL (5 мин) — хэсэгчилсэн (NaN-тай) үр дүн session дуустал кэшлэгдэж
     «—» гацахаас сэргийлнэ: `cached` зөвхөн reject-ийг л хаядаг тул TTL-гүй
     бол түр доголдлын үлдэц хэзээ ч засрахгүй байв. */
}, 5 * 60_000);

/* ══════════════ Төслийн жигнэсэн явц ══════════════ */






/* ══════════════ Багцын гүйцэтгэлийн нэгтгэл ══════════════ */

/** Багц бүрийн СҮҮЛИЙН бүртгэл — төлөвлөгөө vs бодит */
export type PkgProgressRow = {
  /** `bagtsKey()`-ээр хэвийн болгосон түлхүүр */
  key: string;
  /** Түүхий нэр — шошгонд */
  label: string;
  /** Бүртгэсэн огноо, `YYYY-MM-DD` */
  date: string;
  /** Гүйцэтгэл, % */
  actual: number | null;
  /** Төлөвлөгөөт гүйцэтгэл, % */
  planned: number | null;
  /** Бодит эзлэхүүн */
  volume: number | null;
  /** Төлөвлөгөөт эзлэхүүн */
  volumePlan: number | null;
};

/**
 * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ — багц бүрийн ХАМГИЙН СҮҮЛИЙН огноотой мөр.
 *
 * ⚠️ Хүснэгт нь append-only: багц бүрд огноо тутам нэг мөр нэмэгддэг тул
 * сүүлийн мөр л одоогийн байдлыг заана.
 *
 * ⚠️ Хүснэгт одоогоор ХООСОН (2026-08-21) — хоосон массив буцаана, дуудагч тал
 * `Empty` харуулна. Өгөгдөл орж эхэлмэгц кодын өөрчлөлтгүй ажиллана.
 */
export const loadPkgProgress = cached<PkgProgressRow[]>(async () => {
  const { PKG_PROGRESS, bagtsKey } = await import('@/lib/services');
  const F = PKG_PROGRESS.fields;
  const rows = await queryFeatures(PKG_PROGRESS.url, {
    outFields: [F.date, F.pkg, F.actual, F.planned, F.volume, F.volumePlan],
    limit: 4000,
  });

  const nOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  /** багц → сүүлийн мөр */
  const last = new Map<string, PkgProgressRow>();
  for (const r of rows) {
    const raw2 = String(r[F.pkg] ?? '').trim();
    const key = bagtsKey(raw2);
    if (!key) continue;
    const ts = r[F.date];
    const date = ts == null ? '' : new Date(Number(ts)).toISOString().slice(0, 10);
    const cur = last.get(key);
    if (cur && cur.date > date) continue;
    last.set(key, {
      key,
      label: raw2,
      date,
      actual: nOrNull(r[F.actual]),
      planned: nOrNull(r[F.planned]),
      volume: nOrNull(r[F.volume]),
      volumePlan: nOrNull(r[F.volumePlan]),
    });
  }
  return [...last.values()].sort((a, b) => a.key.localeCompare(b.key, 'mn', { numeric: true }));
});

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
