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
import { collectPkgLags, FIN_XL_BUILD_CODE, isBuildRow } from './schedule';
import { FIN_XL_LAND_CODE } from '@/lib/finExcelLayout';
import { loadWorkforceKpi, type WorkforceKpi } from './workforce';
import { loadZov, summarize as summarizeZov } from '@/lib/zovshoorol';
import { loadQaqcLoaded, summarizePkg } from './qaqc';
import { PKGS } from '@/modules/sheet/bagts.pkg';
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
  /* ⚠️ 2026-09-25: хүн хүчний бүртгэл унавал «идэвхтэй талбар» ялгагдахгүй —
     үзлэггүй багц бүр «оноогүй» болно. Урьд нь чимээгүй `null` байсан тул
     «Татагдсангүй» мөрөнд ч гардаггүй байв. */
  if (!workforce) failed.push(tr('ХАБЭА хүн хүчний бүртгэл'));
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
    collectPkgLags(fin.contracts, (r) => F.contractMonths(r, fin), F.lagOf, isBuildRow).map((p) => [p.key, p.lag]),
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

  /**
   * ⚠️ ГАЗАР ЧӨЛӨӨЛӨЛТИЙН МӨР (6-р хэсэг, `FIN_XL_LAND_CODE`) ТУСАД НЬ (2026-09-21).
   * `isWork` нь 6-р хэсгийг хасдаг («78 биш 74» — нөхөн олговор нь гүйцэтгэгчтэй
   * байгуулах ажил биш) тул урьд нь `cf.filter(isWork)`-оос ГАЗРЫН мөр огт
   * ирэхгүй, `isLandWork` ҮРГЭЛЖ false, `scoreLand`-ын газар чөлөөлөлтийн салаа
   * ба `loadLandStatus().pct` хэзээ ч гардаггүй байв. Одоо газрын мөр оноонд
   * ОРНО (газар чөлөөлөлтийн явцаар), бондын хүү (7) хэвээр орохгүй.
   * ⚠️ 2026-09-21 (дахин аудит): газрын мөр «Багц ажил» БИШ тул жагсаалт, тоолол
   *    («Нийт 74 багц ажил»), `statusCounts`-д ОРОХГҮЙ — `WorkScore.isLandWork`
   *    тэмдэгтэй, `CeoScorecard` хасна. Түүнд ЗӨВХӨН `land` (газар чөлөөлөлтийн
   *    салаа) ба `perf` бодогдоно; `fin`·`permit`·`hse`·`qual`·`plan` = null.
   */
  const scored = cf.filter((r) => r.isWork || r.sec === FIN_XL_LAND_CODE);
  const works: BaseWork[] = scored.map((r) => {
    const key = pkgKeyOf(r.pkg2) || pkgKeyOf(r.pkg);
    const cancelled = CANCELLED_NOTE_RE.test(r.note);
    const isLandWork = r.sec === FIN_XL_LAND_CODE;
    /* ⚠️ 2026-09-21: ГЭРЭЭТЭЙ = ЗӨВХӨН `note === CONTRACTED` (порталын нэг дүрэм).
       `geree_dun` гэрээгүй мөрд ч бөглөгдсөн байдаг тул `contract > 0`-ийг гэрээ
       гэж тооцохгүй; гэрээгүй мөрд `contract: null` → дэлгэцэд «гэрээгүй»,
       `scoreFin` төсөвтэй харьцуулахгүй. */
    const contracted = r.note === CONTRACTED;
    /* ⚠️ 2026-09-21: багцын ХУВААРИЙН ХОЦРОГДОЛ (блокийн биет хэмжилт) ЗӨВХӨН
       БАРИЛГА УГСРАЛТЫН мөрд (`sec === '2'`). Урьд нь нэг багцын түлхүүрт
       байгаа ТЭЗҮ, зураг төслийн мөрд ч угсралтын хоцрогдол хуулагдаж, зураг
       төслийн гэрээ «хуваариас 30 пп хоцорсон» гэж улаан гардаг байв. Бусад
       мөр `lag = null` → `scorePerf` өөрийнх нь огноо/гүйцэтгэлээр (0 БИШ). */
    const lag = key && r.sec === FIN_XL_BUILD_CODE ? lags.get(key) ?? null : null;
    const actual = lag ? lag.actual : r.progress;
    const contract = contracts.get(r.oid) ?? null;
    return {
      oid: r.oid,
      name: r.name || r.project,
      pkgLabel: r.pkg2 || r.pkg,
      key,
      type: r.type,
      cost: r.cost,
      contract: contracted && contract && contract > 0 ? contract : null,
      cancelled,
      isLandWork,
      perf: cancelled ? { score: null, facts: [] } : scorePerf({ lag, start: r.start, end: r.end, progress: r.progress, now }),
      /* ⚠️ Газрын мөр гэрээ байгуулах ажил БИШ — санхүүжилтийн «гэрээгүй» оноо
         хамаарахгүй (null, 0 биш); оноо нь `scoreLand`-ын газрын салаанд. */
      fin: cancelled || isLandWork ? { score: null, facts: [] } : scoreFin({
        /* ⚠️ 2026-09-21: `scoreFin` ЗӨВХӨН `contracted`-оор шийднэ (`contract > 0` биш) */
        contracted,
        start: r.start,
        now,
        cost: r.cost,
        contract: contracted && contract && contract > 0 ? contract : null,
        /* ⚠️ 2026-09-25: ОЛГОЛТ vs БИЕТ — ЗӨВХӨН ИЖИЛ ХҮРЭЭТЭЙ үед. `paid` нь
           БАГЦЫН нийт олголт ÷ багцын нийт гэрээ (`pkgFinRows`); `lag`-гүй мөрийн
           `actual` нь тухайн ГЭРЭЭНИЙ өөрийн явц. Урьд нь хоёрыг харьцуулж, 100%
           дууссан ТЭЗҮ/зураг төслийн гэрээ (багц 20% олгогдсон) «олголт 80 нэгж
           хувиар хоцорсон» гэж 0 оноо, улаан асуудал авдаг байв. Одоо багцын
           түвшний биет хэмжилт (`lag` — барилга угсралтын мөр) байгаа үед л
           харьцуулна; бусад мөрд энэ хэсэг оноонд ОРОХГҮЙ (null, 0 биш). */
        paidPct: key && lag ? paid.get(key) ?? null : null,
        actual,
      }),
      /* ⚠️ Хоёр маягт хоёулаа татагдаагүй бол «—» (мэдэхгүй) — «хүлээгдэж» БИШ.
         ⚠️ 2026-09-21: газрын мөрд зөвшөөрөл/ХАБЭА оноо АВАХГҮЙ (багц ажил биш). */
      permit: cancelled || isLandWork || !key || !zovRows ? { score: null, facts: [] } : scorePermit({ counts: zovByKey.get(key) ?? null }),
      hse: cancelled || isLandWork || !key || uzFailed ? { score: null, facts: [] } : scoreHse({
        active: active.has(key), inspections: inspections.get(key) ?? [],
      }),
    };
  });

  return { works, footprints: packs.map((p) => p.key), failed };
  /* ⚠️ 2026-09-25: `ZOVSHOOROL` нэмэв — зөвшөөрлийн оноо `loadZov()`-оос. Тэр
     нь зөвхөн ӨӨРИЙН кэшээ хаядаг тул энэ суурь 5 мин хүртэл хуучин
     зөвшөөрлийн төлөв барьдаг байв (ачаалагчийн уншдаг бүх тагийг нэгтгэх дүрэм). */
}, 5 * 60_000, ['CASHFLOW_NEW', 'HO_IPC', 'BAGTS_SHEET', 'BUILDING', 'HABEA', 'ZOVSHOOROL']);

/* ══════════════ Хүнд бүлгүүд ══════════════ */

export type LandExtra = {
  landPct: number | null;
  overlaps: Map<string, number>;
  /** ⚠️ 2026-09-25: аль нэг багцын огтлолцол татагдаагүй — дэлгэц «Татагдсангүй»-д нэмж болно */
  failed: boolean;
};

/** Газар чөлөөлөлт — багц бүрийн давхцсан чөлөөлөгдөөгүй нэгж талбар */
export const loadScoreLand = cached(async (): Promise<LandExtra> => {
  const [status, overlaps] = await Promise.all([loadLandStatus(), loadPkgOverlaps()]);
  /* ⚠️ 2026-09-25: ДАРААЛЛААС ХАМААРАХГҮЙ ба ДАВХАРДАЛГҮЙ. Урьд нь `-1`-ийг
     шууд Map-д бичдэг тул унасан мөрийн ДАРАА амжилттай мөр ирвэл `-1 + n`
     болж «мэдэхгүй» алга болдог; нэг түлхүүрт хэд хэдэн мөр (барилга + дэд
     бүтэц) ижил нэгж талбартай давхцвал давхар тоологддог байв. Одоо түлхүүр
     бүрд OID-ийн Set, унасан түлхүүр тусдаа — унасан бол `-1` (мэдэхгүй). */
  const ids = new Map<string, Set<number>>();
  const bad = new Set<string>();
  for (const o of overlaps) {
    if (o.failed) { bad.add(o.key); continue; }
    const s = ids.get(o.key) ?? new Set<number>();
    for (const id of o.oids) s.add(id);
    ids.set(o.key, s);
  }
  const m = new Map<string, number>();
  for (const [k, s] of ids) m.set(k, s.size);
  for (const k of bad) m.set(k, -1);
  return { landPct: status.pct, overlaps: m, failed: bad.size > 0 };
}, 5 * 60_000, ['PARCEL_LEFT']);

export type QualExtra = Map<string, { total: number; empty: number; partial: number }> & {
  /** ⚠️ 2026-09-25: уншигдаагүй хуудсууд (`Pkg.label`) — дэлгэц «Татагдсангүй»-д нэмж болно */
  failed: string[];
};

/**
 * Чанар — багцын бүлэг бүрийн QAQC бөглөлтийн нийлбэр.
 * ⚠️ 2026-09-25: (1) `flat` (мод холбогдоогүй) хуудас НИЙЛБЭРТ ОРОХГҮЙ —
 *    `computeQaqc`-ийн `counted` дүрэмтэй ижил; бүлгийн мөрүүд навчтай
 *    холилдож тоо хөөрөгддөг байв. (2) Хуудас нь УНШИГДААГҮЙ бүлэг Map-д
 *    ОРОХГҮЙ (оноо «мэдэхгүй») — урьд нь үлдсэн хуудсаар ХАГАС нийлбэр гарч
 *    бүрэн мэт оноо авдаг байв; уналт `failed`-ээр ил.
 */
export const loadScoreQual = cached(async (): Promise<QualExtra> => {
  const { ok, failed, keys } = await loadQaqcLoaded();
  const failedGroups = new Set(failed.map((label) => {
    const p = PKGS.find((x) => x.label === label);
    return bagtsKey(p ? keys[p.key] ?? p.group : label);
  }));
  const m = new Map<string, { total: number; empty: number; partial: number }>();
  for (const l of ok) {
    if (l.flat) continue;
    const s = summarizePkg(l.pkg, l.rows, l.flat);
    const k = bagtsKey(keys[l.pkg.key] ?? l.pkg.label);
    const a = m.get(k) ?? { total: 0, empty: 0, partial: 0 };
    a.total += s.total;
    a.empty += s.empty;
    a.partial += s.partial;
    m.set(k, a);
  }
  for (const k of failedGroups) m.delete(k);
  return Object.assign(m, { failed: [...failed] });
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
  /* ⚠️ 2026-09-25: «Тохиромжтой байдал» хуудасны АНХДАГЧ оноололтой ижил —
     идэвхжүүлж болох хасагдсан ангиллууд (`ACTIVATABLE_ZONE_TYPES`: нийгмийн
     дэд бүтцийн бүс, газар чөлөөлөлт дутуу) оноололд ОРНО (`Suitability.tsx`
     `scoreOn`-ийн анхны утга). Урьд нь `scoreTypes`-гүй дуудаж тэдгээрийг
     хасдаг тул хуудас ба оноо өөр бүсийн олонлогоос бодогдож байв. */
  computeRaw(data.zones, defaultGreenCats(), cfg.PARKING, new Set(cfg.ACTIVATABLE_ZONE_TYPES));
  const judged = cfg.INDICATORS.filter((ind) => !ind.ref && ind.weight > 0 && ind.id !== 'engineering');

  const zones = data.zones
    .filter((z) => (!z.excluded || cfg.ACTIVATABLE_ZONE_TYPES.has(z.type)) && z.geometry)
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
      /* ⚠️ 2026-09-21: газрын мөрд ерөнхий төлөвлөгөө/чанарын оноо АВАХГҮЙ (багц ажил биш) */
      plan: w.cancelled || w.isLandWork || !x.plan || !w.key ? none : scorePlan(x.plan.get(w.key) ?? { blockScores: [], failingZones: [] }),
      permit: w.permit,
      hse: w.hse,
      qual: w.cancelled || w.isLandWork || !x.qual || !w.key ? none : scoreQual({ qaqc: x.qual.get(w.key) ?? null }),
    };
    /* ⚠️ `isLandWork` `WorkScore`-д ҮЛДЭНЭ — `CeoScorecard` жагсаалт/тоололоос хасахад хэрэгтэй */
    const { perf: _p, fin: _f, hse: _h, permit: _z, ...rest } = w;
    return { ...rest, dims, total: totalOf(dims) };
  });
}

export { DIMS };
