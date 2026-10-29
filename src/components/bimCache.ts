/**
 * BIM (BuildingSceneLayer) ДАВХАРГЫН КЭШ — Map бүрд НЭГ УДАА үүсгэнэ (2026-10-04, BIM гүйцэтгэл).
 */

export type Destroyable = { destroyed: boolean; destroy: () => void; loadStatus?: string };

const cache = new WeakMap<object, Record<string, Destroyable>>();

/** `map`-ийн `key` давхаргыг кэшээс буцаана; байхгүй/устсан/ачаалал УНАСАН бол `make()`-ээр үүсгэж хадгална */
export function bimLayerFor<L extends Destroyable>(map: object, key: string, make: () => L): L {
  let rec = cache.get(map);
  if (!rec) { rec = {}; cache.set(map, rec); }
  const hit = rec[key];
  if (hit && !hit.destroyed && hit.loadStatus !== 'failed') return hit as L;
  if (hit && !hit.destroyed) {
    (map as { remove?: (l: unknown) => void }).remove?.(hit);
    hit.destroy();
  }
  const l = make();
  rec[key] = l;
  return l;
}

export function bimLayerPeek<L extends Destroyable>(map: object, key: string): L | undefined {
  const hit = cache.get(map)?.[key];
  return hit && !hit.destroyed ? hit as L : undefined;
}

/** Map бүрмөсөн устах үед — кэшлэгдсэн (Map-д БАЙХГҮЙ үед ч) давхаргуудыг устгана */
export function dropBimCache(map: object): void {
  const rec = cache.get(map);
  if (!rec) return;
  cache.delete(map);
  for (const l of Object.values(rec)) if (!l.destroyed) l.destroy();
}
