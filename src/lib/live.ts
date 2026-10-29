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
 *                   (`Total_population` ХОРИОТОЙ — багтаамжийн дээд тоо)
 *   · өрх/блок    — building_GOL (AIL_TOO) — `useBagtsTable` аль хэдийн амьд
 *   · нийт ХО     — INVEST хүснэгт (баталгаажсан + урьдчилсан)
 *   · нийт явц    — Төсөл_Гүйцэтгэл жигнэсэн дундаж (Σw·a ÷ Σw)
 *   · нийгмийн    — test_data сургууль/цэцэрлэг/урлан/төрийн давхаргууд
 *   · ногоон      — test_data [35] Shape__Area
 */

import { queryFeatures, queryStats, queryGroup, count, sum, isRateLimit, type Row } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import {
  BOUNDARY, BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, CASHFLOW_NEW,
  LAYER_BY_ID, PARCEL_CLEARED, layerUrl, oidOf,
  CF_WORK_WHERE,
} from '@/lib/services';
import { dayKey } from '@/lib/format';
import { FIN_XL_CHART_FIELDS, finXlChartCat, finXlInTotal } from '@/lib/finExcelLayout';
import { sumBy, tally } from '@/lib/agg';
import { register, type DataKey } from '@/lib/dataBus';

/**
 * Оршин суух хүн ам — [108]-ийн `Population` талбар.
 */
export const POPULATION_FIELD = 'population';

/**
 * Кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ).
 *
 * `ttlMs` өгвөл тэр хугацааны дараа дараагийн дуудалт шинээр татна — харагдац
 * хооронд шилжихэд дахин татахгүй, гэхдээ өгөгдөл хуучрахгүй.
 */
export const SESSION_TTL_MS = 5 * 60_000;

export function cached<T>(
  fn: () => Promise<T>,
  ttlMs?: number,
  reads: readonly DataKey[] = [],
  keep?: (v: T) => boolean,
): () => Promise<T> {
  let p: Promise<T> | null = null;
  let at = 0;
  register(() => { p = null; }, reads);
  return () => {
    if (!p || (ttlMs != null && Date.now() - at > ttlMs)) {
      at = Date.now();
      const mine = fn();
      p = mine;
      mine.catch(() => { if (p === mine) p = null; });
      if (keep) void mine.then((v) => { if (!keep(v) && p === mine) p = null; }, () => {});
    }
    return p;
  };
}

/* ══════════════ Төсөв — CASHFLOW_NEW (Cashflow_0909 /0) ══════════════ */

export type Budget = {
  /** Төсөвт өртөг, ₮ — ЗӨВХӨН `finXlInTotal` хүрээ (2,493 тэрбум), 78 мөрийн нийлбэр БИШ (2026-09-21) */
  total: number;
  /** Захирамжийн нийт дүн, ₮ — `finXlInTotal` хүрээ */
  orderTotal: number;
  /** Гэрээлсэн дүн, ₮ — `finXlInTotal` ∧ `note === CONTRACTED` мөрийн `geree_dun` (2026-09-21) */
  contract: number;
  /** Санхүүжилтийн эх үүсвэр — задраагүй үлдэгдэлтэй */
  sources: { key: string; label: string; value: number }[];
  byType: { key: string; label: string; value: number; n: number }[];
  byPkg: { key: string; label: string; value: number; n: number }[];
};

/**
 * ТӨСЛИЙН ТӨСВИЙН ЭХ = `Cashflow_0909/0` (CASHFLOW_NEW). «Хөрөнгө оруулалт
 * өртөг» (/249)-ЭЭС ЯЛГААТАЙ: тэр нь олон нийтийн бүсийн хувийн таамаг оруулж
 * 4.16 их наяд хөөргөдөг; энэ нь захирамж/гэрээгээр баталгаажсан ТӨСЛИЙН төсөв.
 */
/**
 * Бүлгийн шошго. Бөглөөгүй нүд ГУРВАН хэлбэртэй: `null`, `'0'`, эсвэл
 * хоосон мөр. `tally` нь `''`/`'0'` хоёрыг «тодорхойгүй» болгодог тул энд
 * `null`-ыг `''` болгож ижил замд оруулна — эс бөгөөс төрөлгүй гэрээнүүд
 * (63 тэрбум ₮) чимээгүй алдагдана.
 */


const cfLabel = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const loadBudget = cached<Budget>(async () => {
  const CF = CASHFLOW_NEW.fields;
  const { CONTRACTED } = await import('@/lib/gdash');
  const g = await queryGroup(
    CASHFLOW_NEW.url,
    `${FIN_XL_CHART_FIELDS.join(',')},${CF.pkg2},${CF.amountNote}`,
    [
      sum(CF.budget, 'b'), sum(CF.orderTotal, 'o'), sum(CF.contractAmount, 'c'),
      count(CASHFLOW_NEW.oid, 'n'),
      ...CASHFLOW_NEW.sources.map((s, i) => sum(s.field, `s${i}`)),
    ],
    CF_WORK_WHERE,
  );

  const inTotal = g.filter(finXlInTotal);
  const sumOf = (rows: readonly Row[], f: string) => rows.reduce((a, r) => a + Number(r[f] ?? 0), 0);
  const total = sumOf(inTotal, 'b');
  const orderTotal = sumOf(inTotal, 'o');
  const contract = sumOf(inTotal.filter((r) => cfLabel(r[CF.amountNote]) === CONTRACTED), 'c');
  const named: { key: string; label: string; value: number }[] = CASHFLOW_NEW.sources
    .map((s, i) => ({ key: s.field as string, label: s.label as string, value: sumOf(inTotal, `s${i}`) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  // Захирамжийн дүнгээс эх үүсвэр задраагүй үлдэгдэл (зөрүү нуухгүй)
  const rest = orderTotal - sumBy(named, (x) => x.value);
  if (rest > 0) named.push({ key: 'rest', label: tr('Эх үүсвэр задраагүй'), value: rest });

  return {
    total,
    orderTotal,
    contract,
    sources: named,
    byType: tally(
      g,
      (row) => ({ key: finXlChartCat(row), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Төрөл тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
    byPkg: tally(
      g,
      (row) => ({ key: cfLabel(row[CF.pkg2]), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Багц тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
  };
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);

export type Headline = {
  /** Төслийн талбай, га — хилийн `Hec_area` */
  areaHa: number;
  /** Оршин суух хүн ам — барилгуудын `Population` нийлбэр */
  population: number;
  /** ТӨСЛИЙН нийт төсөвт өртөг, ₮ — `Budget.total` (`finXlInTotal` хүрээ, 2026-09-21) */
  investTotal: number;
  /** Гэрээлсэн дүн, ₮ — `Budget.contract` (зөвхөн «Гэрээлсэн дүн» мөрөөр, 2026-09-21) */
  investConfirmed: number;
  /** Ногоон байгууламжийн талбай, га — test_data [35] */
  greenHa: number | null;
  byStatus: { label: string; n: number }[];
  usableM2: number;
  partial?: boolean;
};

export const loadHeadline = cached<Headline>(async () => {
  const green = LAYER_BY_ID.nogoon;
  const [bR, builtR, budgetR, grR] = await Promise.allSettled([
    queryFeatures(BOUNDARY.plan.url, { outFields: ['hec_area'] }),
    queryGroup(layerUrl(BUILT_LAYER), BUILT_FIELDS.status, [
      count(oidOf(BUILT_LAYER), 'n'),
      sum(POPULATION_FIELD, 'p'),
      sum(BUILT_FIELDS.usable, 'u'),
    ]),
    loadBudget(),
    green
      ? queryStats(layerUrl(green), [sum('SHAPE__Area', 'a')]).catch(() => null)
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

  const order = new Map(BUILT_STATUS.map((x, i) => [x.value, i]));
  const byStatus = (built ?? [])
    .map((r) => ({
      label: String(r[BUILT_FIELDS.status] ?? '').trim() || tr('Тодорхойгүй'),
      n: Number(r.n ?? 0),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99));

  return {
    areaHa: b && b[0]?.hec_area != null ? Number(b[0].hec_area) : NaN,
    population: built ? sumBy(built, (r) => Number(r.p ?? 0)) : NaN,
    investTotal: budget ? budget.total : NaN,
    investConfirmed: budget ? budget.contract : NaN,
    greenHa: gr && gr.a != null ? Number(gr.a) / 10_000 : null,
    byStatus,
    usableM2: built ? sumBy(built, (r) => Number(r.u ?? 0)) : NaN,
    partial: !b || !built || !budget,
  };
}, SESSION_TTL_MS, ['CASHFLOW_NEW'], (h) => !h.partial);

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
 * ЮУГ: «одоо» гэсэн хатуу агшин БИШ, ӨДРИЙН ТӨГСГӨЛӨӨР таслана.
 *
 * ЯАГААД: ArcGIS-ийн огнооны талбар нь ихэвчлэн UTC шөнө дундаар (00:00Z)
 * тамгалагддаг ба хөтөч нь UTC+8 бүсэд ажилладаг. Хатуу `Date.now`-оор
 * харьцуулбал «өнөөдөр бүртгэсэн» мөр өдрийн эхний хагаст ирээдүйд тооцогдож
 * САНАМСАРГҮЙ хасагдана. Тиймээс ЛОКАЛ өдрийн төгсгөл ба UTC өдрийн төгсгөл
 * хоёрын АЛЬ ХОЖУУГ нь авна — эргэлзээтэй мөрийг хасахгүй, ҮЛДЭЭНЭ
 * (өгөгдөл нуухгүй зарчим).
 */
const futureCutMs = (): number => {
  const now = new Date();
  const local = new Date(now);
  local.setHours(23, 59, 59, 999);
  const utc = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
  );
  return Math.max(local.getTime(), utc);
};

/**
 * Дээрх заагийн `YYYY-MM-DD` хэлбэр — `PkgProgressRow.date`-тай харьцуулахад.
 */
const futureCutDay = (): string => dayKey(futureCutMs());

/**
 * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ — багц бүрийн ХАМГИЙН СҮҮЛИЙН огноотой мөр.
 */
export const loadPkgProgress = cached<PkgProgressRow[]>(async () => {
  const { BAGTS_NEGTGEL, bagtsKey } = await import('@/lib/services');
  const F = BAGTS_NEGTGEL.fields;
  const rows = await queryFeatures(BAGTS_NEGTGEL.url, {
    outFields: [BAGTS_NEGTGEL.oid, F.date, F.bagts, F.progress, F.planned, F.volume, F.volumePlan],
  });

  const nOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  const cut = futureCutMs();
  let dropped = 0;
  const out: PkgProgressRow[] = [];
  const dayIdx = new Map<string, { i: number; oid: number }>();
  for (const r of rows) {
    const raw2 = String(r[F.bagts] ?? '').trim();
    const key = bagtsKey(raw2);
    if (!key) continue;
    const ts = r[F.date];
    if (ts != null && Number(ts) > cut) { dropped += 1; continue; }
    const date = ts == null ? '' : dayKey(Number(ts));
    const row: PkgProgressRow = {
      key,
      label: raw2,
      date,
      actual: nOrNull(r[F.progress]),
      planned: nOrNull(r[F.planned]),
      volume: nOrNull(r[F.volume]),
      volumePlan: nOrNull(r[F.volumePlan]),
    };
    const oid = nOrNull(r[BAGTS_NEGTGEL.oid]) ?? -1;
    const dk = date ? `${key}|${date}` : '';
    const had = dk ? dayIdx.get(dk) : undefined;
    if (had) {
      if (oid >= had.oid) { out[had.i] = row; had.oid = oid; }
      continue;
    }
    if (dk) dayIdx.set(dk, { i: out.length, oid });
    out.push(row);
  }
  if (dropped) {
    console.warn(
      `[selbe] нэгтгэлээс ИРЭЭДҮЙН огноотой ${dropped} мөр хасагдав `
      + `(${rows.length} → ${out.length}); эх нь tools/negtgel-seed.mjs-ийн туршилтын өгөгдөл`,
    );
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key, 'mn', { numeric: true }));
}, SESSION_TTL_MS, ['BAGTS_NEGTGEL']);

/**
 * Багц бүрийн ХАМГИЙН СҮҮЛИЙН огноотой мөр — «одоогийн байдал».
 */
export const latestPkgProgress = (rows: PkgProgressRow[]): PkgProgressRow[] => {
  const cutDay = futureCutDay();
  const last = new Map<string, PkgProgressRow>();
  for (const r of rows) {
    if (r.date && r.date > cutDay) continue;
    const cur = last.get(r.key);
    if (cur && cur.date > r.date) continue;
    last.set(r.key, r);
  }
  return [...last.values()].sort((a, b) => a.key.localeCompare(b.key, 'mn', { numeric: true }));
};

/**
 * БӨГЛӨХ ХУУДСААР ХЭМЖСЭН БАГЦЫН ГҮЙЦЭТГЭЛ — `bagtsKey` → % (0–100).
 */
async function fillPkgProgressRaw(fresh: boolean): Promise<Map<string, number>> {
  const { loadPkgProgress } = await import('@/lib/blockProgress');
  const out = new Map<string, number>();
  for (const [k, v] of await loadPkgProgress(fresh)) out.set(k, v.pct);
  return out;
}

export const loadFillPkgProgress = cached<Map<string, number>>(() => fillPkgProgressRaw(false),
  SESSION_TTL_MS, ['BAGTS_SHEET']);

/**
 * КЭШГҮЙ хувилбар — ЗӨВХӨН хүснэгт рүү БИЧИХ зам (`negtgelAuto.syncNegtgel`).
 */
export const loadFillPkgProgressFresh = (): Promise<Map<string, number>> => fillPkgProgressRaw(true);


/* ══════════════ Өрх · блок (building_GOL) ══════════════ */

export type HousingTotals = { blocks: number; ail: number | null; ailPartial: boolean; ailMissing: number };

/** Нүүр/тайланд хөнгөн нийлбэр — гүйцэтгэлийн хүнд join-гүйгээр */
export const loadHousing = cached<HousingTotals>(async () => {
  const { BUILDING, buildingKey } = await import('@/lib/services');
  const F = BUILDING.fields;
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, F.bagts, F.block, F.households],
    orderBy: `${BUILDING.oid} ASC`,
  });
  const seen = new Set<string>();
  let ail = 0;
  let missing = 0;
  for (const r of rows) {
    const k = buildingKey(r[F.bagts], r[F.block]);
    if (seen.has(k)) continue;
    seen.add(k);
    const raw = r[F.households];
    const v = raw == null || raw === '' ? NaN : Number(raw);
    if (Number.isFinite(v)) ail += v; else missing += 1;
  }
  const all = seen.size > 0 && missing === seen.size;
  return { blocks: seen.size, ail: all ? null : ail, ailPartial: !all && missing > 0, ailMissing: missing };
}, SESSION_TTL_MS, ['BUILDING']);

/* ══════════════ Нийгмийн үйлчилгээний барилга ══════════════ */

export type SocialRow = {
  key: string;
  label: string;
  /** Барилгын тоо */
  n: number;
  /** Хүчин чадал (суудал/ор) — талбар хоосон давхаргад null */
  capacity: number | null;
  capPartial: boolean;
  per: { id: string; title: string; n: number; capacity: number | null }[];
};
export type SocialLive = { rows: SocialRow[]; totalN: number; loaded: string[] };

/** test_data-гийн нийгмийн давхаргууд — каталогийн id-гаар (URL нь TD руу шилжсэн) */
const SOCIAL_GROUPS: { key: string; label: string; ids: string[] }[] = [
  { key: 'school', get label() { return tr('Сургууль'); }, ids: ['pkg:230', 'pkg:228', 'pkg:232'] },
  { key: 'kinder', get label() { return tr('Цэцэрлэг'); }, ids: ['pkg:226', 'pkg:234', 'pkg:235', 'pkg:236', 'pkg:237'] },
  { key: 'art', get label() { return tr('Хүүхдийн урлан бүтээх төв'); }, ids: ['pkg:242'] },
  { key: 'gov', get label() { return tr('Төрийн үйлчилгээ'); }, ids: ['pkg:243'] },
];

/**
 * Түр зуурын алдааны мөр — `query.ts`-ийн `attemptRequest`-ийн гаргадаг
 * `HTTP 503` г.м. статус ба хугацаа хэтэрсэн мэдэгдэл (MN/EN хоёр хэлээр).
 */
const TRANSIENT_ERR = /^HTTP \d{3}$|хугацаа хэтэрлээ|timed out|failed to fetch|network/i;

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
            sum('huchin_chadal', 'cap'),
          ]).catch(async (e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            if (e instanceof TypeError || isRateLimit(msg) || TRANSIENT_ERR.test(msg)) throw e;
            // Huchin_chadal байхгүй давхаргад зөвхөн тоог авна
            const c = await queryStats(layerUrl(d), [count(oidOf(d), 'n')]);
            return { ...c, cap: null } as Row;
          });
          const cap = s.cap == null ? null : Number(s.cap);
          return { id, title, n: Number(s.n ?? 0), cap: cap ?? 0, hasCap: cap != null && Number.isFinite(cap) };
        }),
      );
      const n = sumBy(per, (x) => x.n);
      const hasCap = per.some((x) => x.hasCap);
      const cap = sumBy(per, (x) => x.cap ?? 0);
      const capPartial = hasCap && per.some((x) => x.n > 0 && !x.hasCap);
      const row: SocialRow = {
        key: g.key,
        label: g.label,
        n,
        capacity: hasCap ? cap : null,
        capPartial,
        per: per
          .map((x) => ({ id: x.id, title: x.title, n: x.n, capacity: x.hasCap ? x.cap : null }))
          .filter((x) => x.n > 0),
      };
      return { row, loaded: g.ids.some((id) => LAYER_BY_ID[id] != null) };
    }),
  );
  const kept = rows.filter((x) => x.row.n > 0).map((x) => x.row);
  return {
    rows: kept,
    totalN: kept.reduce((s, r) => s + r.n, 0),
    loaded: rows.filter((x) => x.loaded).map((x) => x.row.key),
  };
}, SESSION_TTL_MS);

/* ══════════════════ Газар чөлөөлөлт — нүүрийн KPI ══════════════════ */

export type Clearance = {
  /** Чөлөөлсөн = «Бүрэн чөлөөлсөн» */
  cleared: number;
  /** Чөлөөлөөгүй = БУСАД БҮГД (шалтгаан нь төлөвийн утга нь өөрөө) */
  remaining: number;
  /** Чөлөөлөөгүй талбайн нийлбэр (га) */
  remainingHa: number;
  total: number;
  /** Чөлөөлсөн хувь (0–100), нийт 0 бол null */
  pct: number | null;
};

/**
 * Газар чөлөөлөлтийн нэгтгэл — `PARCEL_LEFT`-ийн төлөвөөр.
 */
export const loadClearance = cached<Clearance>(async () => {
  const { loadLandStatus } = await import('@/lib/land');
  const L = await loadLandStatus();
  const remainingM2 = L.byStatus
    .filter((r) => r.label !== PARCEL_CLEARED)
    .reduce((a, r) => a + r.areaM2, 0);
  return {
    cleared: L.cleared,
    remaining: L.remaining,
    remainingHa: remainingM2 / 10_000,
    total: L.total,
    pct: L.pct,
  };
}, SESSION_TTL_MS, ['PARCEL_LEFT']);
