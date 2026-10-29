/**
 * БАГЦ АЖЛЫН ОНОО — ӨГӨГДӨЛ ТАТАХ ХЭСЭГ (оноо тооцоо нь `scorecard.ts`-д).
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { loadGdashCf, loadContractSum, isContracted } from '@/lib/gdash';
import { loadLandStatus } from '@/lib/land';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import { bagtsKey, pkgKeyOf } from '@/lib/services';
import { finPkgKey } from '@/lib/pkgAlias';
import { loadBuildings } from '@/modules/BuildingPanel';
import { buildPacks } from '@/modules/Bagts';
import { pkgFinRows } from '@/modules/PkgFin';
import { CANCELLED_NOTE_RE } from './uncontracted';
import { collectPkgLags, FIN_XL_BUILD_CODE, isBuildRow } from './schedule';
import { FIN_XL_LAND_CODE, FIN_XL_ROW_HIDE } from '@/lib/finExcelLayout';
import { loadWorkforceKpi, type WorkforceKpi } from './workforce';
import { loadZov, summarize as summarizeZov } from '@/lib/zovshoorol';
import {
  DIMS, scorePerf, perfNoCurve, perfNotStarted, scoreFin, scoreLand, scorePermit, scoreHse, totalOf,
  type Dim, type DimScore, type WorkScore, type Inspection,
} from './scorecard';

/* ══════════════ Суурь ══════════════ */

export type BaseWork = Omit<WorkScore, 'dims' | 'total'> & {
  perf: DimScore;
  fin: DimScore;
  hse: DimScore;
  permit: DimScore;
  /** Тайлангийн 6-р хэсэг — газар чөлөөлөлтийн өөрийнх нь ажил */
  isLandWork: boolean;
  pkgRep: boolean;
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
  const { loadUzlegRows } = await import('@/modules/habeaUzleg');
  const [cf, contracts, fin, bld, uzV11, uzCo, zovRows, workforce] = await Promise.all([
    loadGdashCf(),
    loadContractSum().catch(() => null),
    F.loadFinData().catch(() => null),
    loadBuildings().catch(() => null),
    loadUzlegRows('v11').catch(() => null),
    loadUzlegRows('guitsetgegch').catch(() => null),
    loadZov().catch(() => null),
    (loadWorkforceKpi() as Promise<WorkforceKpi>).catch(() => null),
  ]);
  const failed: string[] = [];
  if (!contracts) failed.push(tr('Гэрээний дүн'));
  if (!fin) failed.push(tr('Санхүүжилтийн гүйцэтгэл (HO_IPC)'));
  if (!bld) failed.push(tr('Барилгын бүртгэл'));
  if (!uzV11) failed.push(tr('Ажлын байрны үзлэг V1.1'));
  if (!uzCo) failed.push(tr('Гүйцэтгэгчийн ажлын байрны үзлэг'));
  const uzFailed = !uzV11 && !uzCo;
  if (!zovRows) failed.push(tr('Зөвшөөрөл'));
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
  const pkgLags = fin ? collectPkgLags(fin.contracts, (r) => F.contractMonths(r, fin), F.lagOf, isBuildRow) : [];
  const lags = new Map(pkgLags.map((p) => [p.key, p.lag]));
  const noCurve = new Set(pkgLags.filter((p) => !p.lag && p.hasPhys && F.planCurveMissing(p.curveKey)).map((p) => p.key));
  const curveFailed = !fin || noCurve.size > 0;
  const notStarted = new Set(pkgLags.filter((p) => !p.lag && p.hasPhys && !noCurve.has(p.key)).map((p) => p.key));
  /* 04-ийн олголт — `PkgFin` хуудастай ЯГ ижил (`pkgFinRows`) */
  const packs = bld ? buildPacks(bld.rows) : [];
  const paid = new Map(fin && bld ? pkgFinRows(packs, fin).rows.map((r) => [r.key, r.pct]) : []);

  /* ХАБЭА — багц бүрийн ажлын байрны үзлэг (талбай → `bagtsKey`) */
  const inspections = new Map<string, Inspection[]>();
  for (const r of [...(uzV11 ?? []), ...(uzCo ?? [])]) {
    if (!r.bagtsK) continue;
    if (r.sevKnown === false) continue;
    const a = inspections.get(r.bagtsK) ?? [];
    a.push({ at: r.d, conf: r.conf, major: r.major, minor: r.minor, obs: r.obs });
    inspections.set(r.bagtsK, a);
  }
  const active = new Set<string>(
    (workforce?.detail.companies ?? []).map((c) => bagtsKey(c.bagts ?? '')).filter(Boolean),
  );

  const scored = cf.filter((r) => (r.isWork || r.sec === FIN_XL_LAND_CODE) && !FIN_XL_ROW_HIDE.includes(r.sec));
  const pkgRep = new Map<string, { oid: number; build: boolean }>();
  for (const r of scored) {
    const k = pkgKeyOf(r.pkg2) || pkgKeyOf(r.pkg);
    if (!k || r.sec === FIN_XL_LAND_CODE || CANCELLED_NOTE_RE.test(r.note)) continue;
    const build = r.sec === FIN_XL_BUILD_CODE;
    const cur = pkgRep.get(k);
    if (!cur || (build && !cur.build)) pkgRep.set(k, { oid: r.oid, build });
  }
  const works: BaseWork[] = scored.map((r) => {
    const key = pkgKeyOf(r.pkg2) || pkgKeyOf(r.pkg);
    const cancelled = CANCELLED_NOTE_RE.test(r.note);
    const isLandWork = r.sec === FIN_XL_LAND_CODE;
    const contracted = isContracted(r);
    const lag = key && r.sec === FIN_XL_BUILD_CODE ? lags.get(key) ?? null : null;
    const lagUnknown = !!key && r.sec === FIN_XL_BUILD_CODE && !lag && (!fin || noCurve.has(key));
    const schedNotStarted = !!key && r.sec === FIN_XL_BUILD_CODE && !lag && !lagUnknown && notStarted.has(key);
    const actual = lag ? lag.actual : r.progress;
    const contract = contracts?.get(r.oid) ?? null;
    const isRep = !!key && pkgRep.get(key)?.oid === r.oid;
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
      pkgRep: isRep,
      perf: cancelled ? { score: null, facts: [] } : lagUnknown ? perfNoCurve()
        : schedNotStarted ? perfNotStarted()
          : scorePerf({ lag, start: r.start, end: r.end, progress: r.progress, now }),
      fin: cancelled || isLandWork ? { score: null, facts: [] } : scoreFin({
        contracted,
        start: r.start,
        now,
        cost: r.budgetOrder ?? 0,
        contract: contracted && contract && contract > 0 ? contract : null,
        paidPct: key && lag ? paid.get(finPkgKey(key)) ?? null : null,
        actual,
      }),
      permit: cancelled || isLandWork || !isRep || !zovRows ? { score: null, facts: [] } : scorePermit({ counts: zovByKey.get(key) ?? null }),
      hse: cancelled || isLandWork || !isRep || uzFailed ?{ score: null, facts: [] } : scoreHse({
        active: active.has(key) && !!uzV11 && !!uzCo, inspections: inspections.get(key) ?? [],
      }),
    };
  });

  if (curveFailed && fin) failed.push(tr('Хуваарийн муруй'));
  return { works, footprints: packs.map((p) => p.key), failed };
}, 5 * 60_000, ['CASHFLOW_NEW', 'HO_IPC', 'BAGTS_SHEET', 'BUILDING', 'HABEA', 'ZOVSHOOROL', 'HUVAARI_OBYEM'], (b) => b.failed.length === 0);

/* ══════════════ Хүнд бүлгүүд ══════════════ */

export type LandExtra = {
  landPct: number | null;
  overlaps: Map<string, number>;
  failed: boolean;
};

/** Газар чөлөөлөлт — багц бүрийн давхцсан чөлөөлөгдөөгүй нэгж талбар */
export const loadScoreLand = cached(async (): Promise<LandExtra> => {
  const [status, overlaps] = await Promise.all([loadLandStatus(), loadPkgOverlaps()]);
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
}, 5 * 60_000, ['PARCEL_LEFT'], (x) => !x.failed);



/* ══════════════ Нэгтгэл ══════════════ */

export type Extras = {
  land: LandExtra | null;
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
      permit: w.permit,
      hse: w.hse,
    };
    const { perf: _p, fin: _f, hse: _h, permit: _z, pkgRep: _r, ...rest } = w;
    return { ...rest, dims, total: totalOf(dims) };
  });
}

export { DIMS };
