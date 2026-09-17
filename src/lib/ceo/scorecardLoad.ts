/**
 * БАГЦ АЖЛЫН ОНОО — ӨГӨГДӨЛ ТАТАХ ХЭСЭГ (оноо тооцоо нь `scorecard.ts`-д).
 *
 * ⚠️ ШИНЭ АСУУЛГА БИЧИХГҮЙ — бүх эх нь порталын ОДООГИЙН кэштэй ачаалагчид:
 *      Cashflow (`loadGdashCf`, `loadContractSum`) · 05/04 (`loadFinData`,
 *      `collectPkgLags`, `pkgFinRows`, `loadBuildings`) · газар
 *      (`loadLandStatus`, `loadPkgOverlaps`) · ХАБЭА (`loadSafetyRows`,
 *      `loadWorkforceKpi`) · QAQC (`loadQaqcLoaded`) · тохиромжтой байдал
 *      (`loadAnalysisCached`).
 *    Тиймээс нүүрний оноо нь тухайн харагдацын тоотой ИЖИЛ эх сурвалжтай.
 *
 * ⚠️ ШАТЛАН АЧААЛНА. Суурь (гүйцэтгэл · санхүүжилт · ХАБЭА) хурдан; газрын
 *    огтлолцол (геометр), QAQC (10 хүснэгт), тохиромжтой байдал (орон зайн
 *    шинжилгээ) нь ХҮНД — тусдаа ачаалагч, хүснэгт эхлээд гарч тэдгээр нь
 *    ирэх тусам нүд бөглөгдөнө. Нэг нь унавал бусад бүлэг хэвээр.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { loadGdashCf, loadContractSum, CONTRACTED } from '@/lib/gdash';
import { loadLandStatus } from '@/lib/land';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import { bagtsKey, pkgKeyOf, BUILDING } from '@/lib/services';
import { loadBuildings } from '@/modules/BuildingPanel';
import { buildPacks } from '@/modules/Bagts';
import { pkgFinRows } from '@/modules/PkgFin';
import { CANCELLED_NOTE_RE } from './uncontracted';
import { collectPkgLags } from './schedule';
import { loadWorkforceKpi, type WorkforceKpi } from './workforce';
import { loadZov, summarize as summarizeZov } from '@/lib/zovshoorol';
import { loadQaqcLoaded, summarizePkg } from './qaqc';
import {
  DIMS, scorePerf, scoreFin, scoreLand, scorePlan, scorePermit, scoreHse, scoreQual, totalOf, blockZoneScores,
  type Dim, type DimScore, type WorkScore, type PlanInput, type Inspection,
} from './scorecard';

/* ══════════════ Суурь ══════════════ */

export type BaseWork = Omit<WorkScore, 'dims' | 'total'> & {
  perf: DimScore;
  fin: DimScore;
  hse: DimScore;
  permit: DimScore;
  /** Тайлангийн 6-р хэсэг — газар чөлөөлөлтийн өөрийнх нь ажил */
  isLandWork: boolean;
};

export type ScoreBase = {
  works: BaseWork[];
  /** Газрын зураглалтай багцын түлхүүрүүд (блок эсвэл дэд бүтцийн давхарга) */
  footprints: string[];
  /** Хэсэгчлэн татагдаагүй эх сурвалжууд */
  failed: string[];
};

export const loadScoreBase = cached(async (): Promise<ScoreBase> => {
  const F = await import('@/modules/Finance');
  /* ⚠️ ХАБЭА: ЗӨВХӨН ажлын байрны үзлэг (хоёр маягт). Хүн хүчний бүртгэл нь
     зөвхөн «идэвхтэй талбар уу» гэдгийг ялгана — оноонд ОРОХГҮЙ. */
  const { loadUzlegRows } = await import('@/modules/habeaUzleg');
  const [cf, contracts, fin, bld, uzV11, uzCo, zovRows, workforce] = await Promise.all([
    loadGdashCf(),
    loadContractSum(),
    F.loadFinData(),
    loadBuildings(),
    loadUzlegRows('v11').catch(() => null),
    loadUzlegRows('guitsetgegch').catch(() => null),
    /* ⚠️ `loadZov` нь үйлчилгээ холбогдоогүй үед null буцаадаг — «мэдэхгүй», 0 биш */
    loadZov().catch(() => null),
    (loadWorkforceKpi() as Promise<WorkforceKpi>).catch(() => null),
  ]);
  const failed: string[] = [];
  if (!uzV11) failed.push(tr('Ажлын байрны үзлэг V1.1'));
  if (!uzCo) failed.push(tr('Гүйцэтгэгчийн ажлын байрны үзлэг'));
  const uzFailed = !uzV11 && !uzCo;
  if (!zovRows) failed.push(tr('Зөвшөөрөл'));
  /* Зөвшөөрөл — багц бүрийн төлөвийн тоо */
  const zovByKey = new Map<string, NonNullable<Parameters<typeof scorePermit>[0]['counts']>>();
  if (zovRows) {
    const groups = new Map<string, typeof zovRows>();
    for (const z of zovRows) {
      const k = bagtsKey(z.bagts);
      if (!k) continue;
      const a = groups.get(k) ?? [];
      a.push(z);
      groups.set(k, a);
    }
    for (const [k, list] of groups) zovByKey.set(k, summarizeZov(list));
  }

  const now = Date.now();
  /* 05-ын хуваарийн хоцрогдол — `loadScheduleKpi`-тай ЯГ ижил дуудлага */
  const lags = new Map(
    collectPkgLags(fin.contracts, (r) => F.contractMonths(r, fin), F.lagOf).map((p) => [p.key, p.lag]),
  );
  /* 04-ийн олголт — `PkgFin` хуудастай ЯГ ижил (`pkgFinRows`) */
  const packs = buildPacks(bld.rows);
  const paid = new Map(pkgFinRows(packs, fin).rows.map((r) => [r.key, r.pct]));

  /* ХАБЭА — багц бүрийн ажлын байрны үзлэг (талбай → `bagtsKey`) */
  const inspections = new Map<string, Inspection[]>();
  for (const r of [...(uzV11 ?? []), ...(uzCo ?? [])]) {
    if (!r.bagtsK) continue;
    const a = inspections.get(r.bagtsK) ?? [];
    a.push({ at: r.d, conf: r.conf, major: r.major, minor: r.minor, obs: r.obs });
    inspections.set(r.bagtsK, a);
  }
  const active = new Set<string>(
    (workforce?.detail.companies ?? []).map((c) => bagtsKey(c.bagts ?? '')).filter(Boolean),
  );

  const works: BaseWork[] = cf.filter((r) => r.isWork).map((r) => {
    const key = pkgKeyOf(r.pkg2) || pkgKeyOf(r.pkg);
    const cancelled = CANCELLED_NOTE_RE.test(r.note);
    const lag = key ? lags.get(key) ?? null : null;
    const actual = lag ? lag.actual : r.progress;
    const contract = contracts.get(r.oid) ?? null;
    return {
      oid: r.oid,
      name: r.name || r.project,
      pkgLabel: r.pkg2 || r.pkg,
      key,
      type: r.type,
      cost: r.cost,
      contract: contract && contract > 0 ? contract : null,
      cancelled,
      isLandWork: r.sec === '6',
      perf: cancelled ? { score: null, facts: [] } : scorePerf({ lag, start: r.start, end: r.end, progress: r.progress, now }),
      fin: cancelled ? { score: null, facts: [] } : scoreFin({
        contracted: r.note === CONTRACTED,
        start: r.start,
        now,
        cost: r.cost,
        contract: contract && contract > 0 ? contract : null,
        paidPct: key ? paid.get(key) ?? null : null,
        actual,
      }),
      /* ⚠️ Хоёр маягт хоёулаа татагдаагүй бол «—» (мэдэхгүй) — «хүлээгдэж» БИШ */
      permit: cancelled || !key || !zovRows ? { score: null, facts: [] } : scorePermit({ counts: zovByKey.get(key) ?? null }),
      hse: cancelled || !key || uzFailed ? { score: null, facts: [] } : scoreHse({
        active: active.has(key), inspections: inspections.get(key) ?? [],
      }),
    };
  });

  return { works, footprints: packs.map((p) => p.key), failed };
}, 5 * 60_000, ['CASHFLOW_NEW', 'HO_IPC', 'BAGTS_SHEET', 'BUILDING', 'HABEA']);

/* ══════════════ Хүнд бүлгүүд ══════════════ */

export type LandExtra = { landPct: number | null; overlaps: Map<string, number> };

/** Газар чөлөөлөлт — багц бүрийн давхцсан чөлөөлөгдөөгүй нэгж талбар */
export const loadScoreLand = cached(async (): Promise<LandExtra> => {
  const [status, overlaps] = await Promise.all([loadLandStatus(), loadPkgOverlaps()]);
  const m = new Map<string, number>();
  for (const o of overlaps) {
    /* ⚠️ Татагдаагүй огтлолцол = -1 (мэдэхгүй), 0 биш */
    m.set(o.key, o.failed ? -1 : (m.get(o.key) ?? 0) + o.oids.length);
  }
  return { landPct: status.pct, overlaps: m };
}, 5 * 60_000, ['PARCEL_LEFT']);

/** Чанар — багцын бүлэг бүрийн QAQC бөглөлтийн нийлбэр */
export const loadScoreQual = cached(async (): Promise<Map<string, { total: number; empty: number; partial: number }>> => {
  const { ok, keys } = await loadQaqcLoaded();
  const m = new Map<string, { total: number; empty: number; partial: number }>();
  for (const l of ok) {
    const s = summarizePkg(l.pkg, l.rows, l.flat);
    const k = bagtsKey(keys[l.pkg.key] ?? l.pkg.label);
    const a = m.get(k) ?? { total: 0, empty: 0, partial: 0 };
    a.total += s.total;
    a.empty += s.empty;
    a.partial += s.partial;
    m.set(k, a);
  }
  return m;
}, 5 * 60_000, ['BAGTS_SHEET']);

/**
 * Ерөнхий төлөвлөгөө — блок бүрийн байрлах бүсийн тохиромжтой байдлын оноо.
 * ⚠️ `@/lib/analysis/*` ба ArcGIS SDK-г ДИНАМИКААР — нүүрийн chunk хөнгөн үлдэнэ
 *    (`suitability.ts`-ийн ижил дүрэм).
 */
export const loadScorePlan = cached(async (): Promise<Map<string, PlanInput>> => {
  const [{ loadAnalysisCached, computeRaw, defaultGreenCats }, cfg, sc, { default: Query }, query] = await Promise.all([
    import('@/lib/analysis/data'),
    import('@/lib/analysis/config'),
    import('@/lib/analysis/score'),
    import('@arcgis/core/rest/support/Query'),
    import('@arcgis/core/rest/query'),
  ]);
  const data = await loadAnalysisCached();
  computeRaw(data.zones, defaultGreenCats(), cfg.PARKING);
  const judged = cfg.INDICATORS.filter((ind) => !ind.ref && ind.weight > 0 && ind.id !== 'engineering');

  const zones = data.zones
    .filter((z) => !z.excluded && z.geometry)
    .map((z) => ({
      id: z.id,
      rings: (z.geometry?.rings ?? []) as number[][][],
      score: sc.urbanScore(z.raw, [...cfg.INDICATORS], z.type).score,
      /* ⚠️ `suitability.ts`-ийн ижил дүрэм: бүсийн төрлөөр норм, `rawActual`-аар; утгагүй нь зөрчил биш */
      failing: judged.some((ind) => sc.passesNorm(z.rawActual?.[ind.id], sc.normFor(ind, z.type)) === false),
    }));

  /* Блокийн геометр — бүсийн координатын системээр (WKID) */
  const blocks: { key: string; rings: number[][][] }[] = [];
  for (let start = 0; ; ) {
    const res = await query.executeQueryJSON(BUILDING.url, new Query({
      where: '1=1',
      outFields: [BUILDING.fields.bagts],
      returnGeometry: true,
      outSpatialReference: { wkid: cfg.WKID },
      orderByFields: [`${BUILDING.oid} ASC`],
      start,
      num: 1000,
    }));
    for (const f of res.features) {
      const g = f.geometry as { rings?: number[][][] } | null;
      if (g?.rings) blocks.push({ key: bagtsKey(f.attributes?.[BUILDING.fields.bagts]), rings: g.rings });
    }
    if (!res.exceededTransferLimit || res.features.length === 0) break;
    start += res.features.length;
  }
  return blockZoneScores(zones, blocks);
}, undefined, ['BUILDING']);

/* ══════════════ Нэгтгэл ══════════════ */

export type Extras = {
  land: LandExtra | null;
  qual: Map<string, { total: number; empty: number; partial: number }> | null;
  plan: Map<string, PlanInput> | null;
};

/**
 * Суурь + ирсэн хүнд бүлгүүд → эцсийн оноо.
 * @param loading хараахан ирээгүй бүлгүүд — тэдгээрийн оноо `null` бөгөөд
 *   нийт дунджид ОРОХГҮЙ; дэлгэц «…» гэж харуулна.
 */
export function assemble(base: ScoreBase, x: Extras): WorkScore[] {
  const foot = new Set(base.footprints);
  return base.works.map((w) => {
    const none: DimScore = { score: null, facts: [] };
    const ov = x.land && w.key ? x.land.overlaps.get(w.key) : undefined;
    const dims: Record<Dim, DimScore> = {
      perf: w.perf,
      fin: w.fin,
      land: w.cancelled || !x.land ? none : scoreLand({
        isLandWork: w.isLandWork,
        landPct: x.land.landPct,
        hasFootprint: !!w.key && foot.has(w.key),
        overlap: ov == null ? 0 : ov < 0 ? null : ov,
        overlapFailed: ov != null && ov < 0,
      }),
      plan: w.cancelled || !x.plan || !w.key ? none : scorePlan(x.plan.get(w.key) ?? { blockScores: [], failingZones: [] }),
      permit: w.permit,
      hse: w.hse,
      qual: w.cancelled || !x.qual || !w.key ? none : scoreQual({ qaqc: x.qual.get(w.key) ?? null }),
    };
    const { perf: _p, fin: _f, hse: _h, permit: _z, isLandWork: _l, ...rest } = w;
    return { ...rest, dims, total: totalOf(dims) };
  });
}

export { DIMS };
