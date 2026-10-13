/** Бүс бүрийн дүнг эх инженерийн объектын давхардалгүй геометрээр бодно. */
export type ZoneBoundary<G> = { id: string; oid: string; label: string; geometry: G };
export type ZoneInputPiece<G> = { feature: string; type: string; layer: string; cat: string; geometry: G };
export type UniqueOverlapPiece<G> = {
  feature: string; type: string; layer: string; cats: string[]; geometry: G; lengthM: number; zone?: string;
};
export type ZoneOverlap<G> = ZoneBoundary<G> & { pieces: UniqueOverlapPiece<G>[]; lengthM: number; count: number };
export type OverlapDisplay<G> = { pieces: UniqueOverlapPiece<G>[]; zones: ZoneOverlap<G>[]; lengthM: number; count: number };
export type OverlapGeometryOps<G> = {
  union: (geometries: G[]) => Promise<G | null>;
  intersectMany: (geometries: G[], boundary: G) => Promise<(G | null)[]>;
  touches: (geometry: G, boundary: G) => boolean;
  isEmpty: (geometry: G | null) => boolean;
  lengthM: (geometry: G) => number;
};

/** Ижил урттай бүсүүдийг объектын тоо, дараа нь тогтвортой OID-оор эрэмбэлнэ. */
export const rankOverlapZones = <G>(zones: ZoneOverlap<G>[]) => [...zones].sort((a, b) =>
  b.lengthM - a.lengthM || b.count - a.count || a.oid.localeCompare(b.oid, undefined, { numeric: true }));

async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await run(items[index]); }
  }));
  return results;
}

export async function buildOverlapDisplay<G>(
  input: ZoneInputPiece<G>[], boundaries: ZoneBoundary<G>[], ops: OverlapGeometryOps<G>,
): Promise<OverlapDisplay<G>> {
  const grouped = new Map<string, ZoneInputPiece<G>[]>();
  for (const piece of input) {
    const group = grouped.get(piece.feature) ?? [];
    group.push(piece);
    grouped.set(piece.feature, group);
  }
  // Нэг эх объект олон барилга/замтай давхцсан хэсгүүдийг ЭХЛЭЭД нэгтгэнэ.
  const merged = await mapLimited([...grouped.values()], async (group): Promise<UniqueOverlapPiece<G> | null> => {
    const geometry = group.length === 1 ? group[0].geometry : await ops.union(group.map((piece) => piece.geometry));
    if (!geometry || ops.isEmpty(geometry)) return null;
    return {
      feature: group[0].feature, type: group[0].type, layer: group[0].layer,
      cats: [...new Set(group.map((piece) => piece.cat))], geometry, lengthM: ops.lengthM(geometry),
    };
  });
  const pieces = merged.filter((piece): piece is UniqueOverlapPiece<G> => piece !== null);
  const zones = await mapLimited(boundaries, async (zone): Promise<ZoneOverlap<G>> => {
    const candidates = pieces.filter((piece) => ops.touches(piece.geometry, zone.geometry));
    const intersections = candidates.length
      ? await ops.intersectMany(candidates.map((piece) => piece.geometry), zone.geometry) : [];
    const clipped = intersections.flatMap((geometry, index) => geometry && !ops.isEmpty(geometry)
      ? [{ ...candidates[index], geometry, lengthM: ops.lengthM(geometry), zone: zone.id }] : []);
    // Давхцалгүй бүс ч 0 утгатай үлдэнэ; ижил нэр/төрөлтэй бүсүүдийг нэгтгэхгүй.
    return { ...zone, pieces: clipped, lengthM: clipped.reduce((sum, piece) => sum + piece.lengthM, 0), count: clipped.length };
  });
  return { pieces, zones: rankOverlapZones(zones), lengthM: pieces.reduce((sum, piece) => sum + piece.lengthM, 0), count: pieces.length };
}

/** OID нь таних түлхүүр; нэр хоосон/давтагдсан ч бүс бүр тусдаа байна. */
export function individualZoneIdentity(attributes: Record<string, unknown>, oidField: string) {
  const valueOf = (name: string) => Object.entries(attributes).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const value = valueOf(oidField);
  if (value == null || String(value).trim() === '') throw new Error('Бүсийн OBJECTID олдсонгүй');
  const oid = String(value);
  const label = ['name', 'zone_name', 'zone_id', 'zone', 'Name_MN', 'title']
    .map(valueOf).find((item) => item != null && String(item).trim());
  return { id: `rd:2:${oid}`, oid, label: label == null ? '' : String(label).trim() };
}
