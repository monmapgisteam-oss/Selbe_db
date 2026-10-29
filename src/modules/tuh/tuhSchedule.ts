/**
 * ТУХ — «ХУВААРЬ»-ИЙН БӨГЛӨХ ХУУДСААС (Bagts_*) УНШИХ ЗАМ.
 */
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { agsFetch } from '@/modules/sheet/ags';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { cached } from '@/lib/live';
import { register } from '@/lib/dataBus';
import { bagtsKey } from '@/lib/services';
import { KOMISS_NO, KOMISS_WORK } from '@/lib/ulsiinKomiss';
import {
  isCommissionWork, keyedCache, mergeCommission, pickCommission,
  type CommissionCand, type CommissionPartial, type PlanLikeRow,
} from '@/lib/tuhData';

const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Нэг хуудасны «Улсын комисс» мөрийн хамгийн хожуу төлөвлөгөөт дуусгалт */
async function commissionOfSheet(pkg: Pkg): Promise<number | null> {
  const sc = await loadSchema(pkg, { synthetic: true });
  const ends = sc.end.filter((x): x is string => !!x);
  if (!ends.length || !sc.f.work) return null;
  const fill = sc.f.fillDate;
  const [j, mx] = await Promise.all([
    agsFetch(`${pkg.url}/query`, {
      where: `${sc.f.work} LIKE N'%комисс%'`,
      outFields: [sc.f.oid, sc.f.no, sc.f.work, fill, ...ends].filter(Boolean).join(','),
      orderByFields: `${sc.f.oid} DESC`,
      returnGeometry: 'false',
      f: 'json',
    }),
    fill
      ? agsFetch(`${pkg.url}/query`, {
        where: `${fill} IS NOT NULL`,
        outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'mx' }]),
        returnGeometry: 'false',
      })
      : Promise.resolve(null),
  ]);
  const feats = (j.features ?? []) as { attributes: Record<string, unknown> }[];
  const cands: CommissionCand[] = [];
  for (const f of feats) {
    const a = f.attributes;
    const work = String(a[sc.f.work] ?? '').trim();
    if (!isCommissionWork(work)) continue;
    let end: number | null = null;
    for (const e of ends) {
      const v = toMs(a[e]);
      if (v != null && (end == null || v > end)) end = v;
    }
    cands.push({
      oid: Number(a[sc.f.oid]),
      fill: fill ? toMs(a[fill]) : null,
      exact: String(a[sc.f.no] ?? '').trim() === KOMISS_NO && work.toLowerCase() === KOMISS_WORK.toLowerCase(),
      end,
    });
  }
  const latest = mx == null ? undefined : ((mx.features?.[0]?.attributes?.mx as number | null | undefined) ?? null);
  return pickCommission(cands, latest);
}

/**
 * Багц бүрийн УЛСЫН КОМИССЫН ОГНОО — `bagtsKey(Pkg.group)` → мс.
 */
export type CommissionDates = { dates: Map<string, number | null>; failed: string[]; partial: Map<string, CommissionPartial> };
export const loadCommissionDates = cached<CommissionDates>(async () => {
  const res = await Promise.all(PKGS.map(async (pkg) => {
    const key = bagtsKey(pkg.group);
    try {
      return { key, at: await commissionOfSheet(pkg), ok: true };
    } catch (e) {
      console.warn(`[selbe] ТУХ: ${pkg.key} улсын комиссын мөр уншигдсангүй`, e);
      return { key, at: null, ok: false };
    }
  }));
  return mergeCommission(res);
}, 5 * 60_000, ['BAGTS_SHEET'], (v) => v.failed.length === 0);

/** Сонгосон багцын хуваарийн хуудсууд (9F/12F) */
export const sheetsOf = (pkgKey: string): Pkg[] => PKGS.filter((p) => bagtsKey(p.group) === pkgKey);

/**
 * ХУУДАС ТУС БҮРИЙН МӨРИЙН КЭШ (2026-10-01, хэрэглэгч: бүгдийг зас).
 */
const SHEET_TTL = 5 * 60_000;
const sheetRows = keyedCache<PlanLikeRow[]>(SHEET_TTL);
register(() => sheetRows.clear(), ['BAGTS_SHEET']);

/**
 * Дэлгэрэнгүйд хэрэгтэй БАГАНУУД л — гүн/жааз (`oid`, №, ажил, `gun`, тамга) ба
 * төлөвлөгөөт огноо, гүйцэтгэл, нөөц. 2026-10-01: урьд нь `*` (~60+ багана); дутуу
 * талбар `loadRows`-д `null` болж уншигдана (`loadRows`-ийн `fields`) — энд хэрэглэдэггүй.
 */
const schedFields = (sc: Schema): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.fillDate, sc.f.asOf, sc.f.hunHuch, sc.f.mashin,
  ...sc.start, ...sc.end, ...sc.act,
].filter((x): x is string => !!x))];

async function readSheet(sheet: Pkg): Promise<PlanLikeRow[]> {
  const sc = await loadSchema(sheet, { synthetic: true });
  const r = await loadRows(sheet, sc, undefined, schedFields(sc));
  return r.rows.map((x) => ({
    work: x.work, depth: x.depth, group: x.group,
    start: x.start, end: x.end, act: x.act, hun: x.hun, mashin: x.mashin,
  }));
}

/**
 * Сонгосон багцын ХУВААРИЙН МӨРҮҮД — хуудас бүрээр.
 */
export async function loadPkgSchedule(pkgKey: string): Promise<{ sheet: Pkg; rows: PlanLikeRow[] }[]> {
  return Promise.all(sheetsOf(pkgKey).map(async (sheet) => ({
    sheet,
    rows: await sheetRows.get(sheet.key, () => readSheet(sheet)),
  })));
}
