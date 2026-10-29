/**
 * СААД — БАГЦААР: багц бүр дээр давхцаж буй ҮЛДСЭН нэгж талбар.
 *
 * React ОРООГҮЙ — цэвэр өгөгдлийн давхарга.
 */
import { queryFeatures } from '@/lib/query';
import { BUILDING, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey } from '@/lib/services';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { register } from '@/lib/dataBus';
import { subscribeTotals } from '@/lib/totals';
import { commonName } from '@/lib/butetsPacks';
import { text } from '@/lib/format';


/** Чартын нэг мөр: багц, түүний давхаргууд, давхцсан талбарын OID-ууд */
export type PkgOverlap = {
  key: string;
  name: string;
  layerIds: string[];
  /** Барилгын багцад блокийн OID шүүлт; дэд бүтцийн багцад `null` */
  where: string | null;
  oids: number[];
  failed: boolean;
};

/** Барилгын блокийн давхарга — багц бүрийн блокууд эндээс */
const BLOCK_LAYER = 'mon:building';
/**
 * БАГЦУУДЫН ХӨНГӨН БҮРТГЭЛ — нэр, давхарга, шүүлт. ГҮЙЦЭТГЭЛГҮЙ.
 */
let ovCache: Promise<PkgOverlap[]> | null = null;
register(() => { ovCache = null; }, ['PARCEL_LEFT']);
subscribeTotals(() => { ovCache = null; });
export function loadPkgOverlaps(): Promise<PkgOverlap[]> {
  if (ovCache) return ovCache;
  const run = loadPkgOverlapsRaw();
  ovCache = run;
  run.then(
    (r) => { if (ovCache === run && r.some((x) => x.failed)) ovCache = null; },
    () => { if (ovCache === run) ovCache = null; },
  );
  return run;
}

async function loadPkgOverlapsRaw(): Promise<PkgOverlap[]> {
  const F = BUILDING.fields;
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, F.bagts],
    orderBy: `${BUILDING.oid} ASC`,
  });

  /* Барилгын багц — блокуудыг багцаар нь бүлэглэж OID шүүлт болгоно */
  const byName = new Map<string, number[]>();
  for (const r of rows) {
    const name = text(r[F.bagts], '').trim();
    const oid = Number(r[BUILDING.oid]);
    if (!name || !Number.isFinite(oid)) continue;
    const a = byName.get(name);
    if (a) a.push(oid); else byName.set(name, [oid]);
  }
  const build: Omit<PkgOverlap, 'oids' | 'failed'>[] = [...byName].map(([name, oids]) => ({
    key: bagtsKey(name),
    name,
    layerIds: [BLOCK_LAYER],
    where: `${BUILDING.oid} IN (${oids.join(',')})`,
  }));

  /* Дэд бүтцийн багц — давхаргын гарчгуудын НИЙТЛЭГ хэсгийг нэр болгоно */
  const infra: Omit<PkgOverlap, 'oids' | 'failed'>[] = Object.entries(PKG_BY_BAGTS).map(([key, ids]) => ({
    key,
    name: ids.length ? commonName(ids.map((id) => LAYER_BY_ID[id]?.title ?? id)) : key,
    layerIds: ids,
    where: null,
  }));

  const all = [...build, ...infra];
  const res = await Promise.allSettled(
    all.map((pk) => overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where })))),
  );
  return all
    .map((pk, i) => {
      const r = res[i];
      return r.status === 'fulfilled'
        ? { ...pk, oids: r.value.oids, failed: (r.value.failed?.length ?? 0) > 0 }
        : { ...pk, oids: [] as number[], failed: true };
    })
    .filter((x) => x.oids.length > 0 || x.failed)
    .sort((a, b) => b.oids.length - a.oids.length
      || a.name.localeCompare(b.name, 'mn', { numeric: true }));
}
