import type { NeedLink, NeedResult, NeedUnresolved } from './hesegNeed';

export const NEED_TYPES = ['sewer', 'heat', 'hot', 'water', 'power', 'comm'] as const;
export type NeedType = (typeof NEED_TYPES)[number];
export const UNASSIGNED_ZONE = '__unassigned__';

export type NeedFilter = { maxM: number; type: NeedType | null; zone: string | null; priorityOnly?: boolean };

/** Анхдагчаар бүх эерэг трасс харагдана; зай нь зөвхөн эрэмбэ/нэмэлт шүүлт. */
export function selectNeedLinks(res: NeedResult, filter: NeedFilter) {
  return res.links.filter((link) => link.lengthM > (filter.priorityOnly ? filter.maxM : 0)
    && (!filter.type || link.type === filter.type)
    && (!filter.zone || (link.zone ?? UNASSIGNED_ZONE) === filter.zone));
}

/** Нэг коридорын шугам хэдэн барилгад үйлчилсэн ч физик уртыг нэг л удаа тооцно. */
export function selectNeedSegments(res: NeedResult, links: NeedLink[], zone?: string | null) {
  const ids = new Set(links.flatMap((link) => link.segmentIds));
  return res.segments.filter((segment) => ids.has(segment.id) && (!zone || (segment.zoneLengths[zone] ?? 0) > 0))
    .map((segment) => zone ? { ...segment, lengthM: segment.zoneLengths[zone], geometry: segment.zoneGeometries[zone] } : segment);
}

/** Шийдэгдээгүй нэг барилга × системийг нэг тоолно; 0 м батлагдсан хосыг хэрэгцээнд оруулахгүй. */
export function selectNeedUnresolved(res: NeedResult, filter: Pick<NeedFilter, 'type' | 'zone'>) {
  const connected = new Set(res.links.filter((link) => link.lengthM === 0).map((link) => `${link.type}:${link.building}`));
  const selected = new Map<string, NeedUnresolved>();
  for (const item of res.unresolved) {
    const key = `${item.type}:${item.building}`;
    if (connected.has(key) || (filter.type && item.type !== filter.type) || (filter.zone && (item.zone ?? UNASSIGNED_ZONE) !== filter.zone)) continue;
    selected.set(key, item);
  }
  return [...selected.values()];
}

/** Олон төрлийн холбоос шаардсан барилга ерөнхий болон бүсийн тоонд ганц удаа орно. */
function requirementCounts(links: NeedLink[], unresolved: NeedUnresolved[]) {
  return {
    requiredBuildings: new Set([...links, ...unresolved].map((item) => item.building)).size,
    routedBuildings: new Set(links.map((link) => link.building)).size,
    unresolvedBuildings: new Set(unresolved.map((item) => item.building)).size,
    requiredConnections: new Set([...links, ...unresolved].map((item) => `${item.type}:${item.building}`)).size,
    unresolvedConnections: unresolved.length,
  };
}

export function summarizeNeed(res: NeedResult, filter: NeedFilter) {
  const selected = selectNeedLinks(res, filter);
  const zoneLinks = selectNeedLinks(res, { ...filter, type: null });
  const typeLinks = selectNeedLinks(res, { ...filter, zone: null });
  const typeSegments = selectNeedSegments(res, typeLinks);
  const selectedSegments = selectNeedSegments(res, typeLinks, filter.zone);
  const failures = selectNeedUnresolved(res, filter);
  const selectedZone = res.zones.find((zone) => zone.label === filter.zone);
  const rows = NEED_TYPES.map((type) => {
    const links = zoneLinks.filter((link) => link.type === type);
    const unresolved = selectNeedUnresolved(res, { type, zone: filter.zone });
    const counts = requirementCounts(links, unresolved);
    return {
      type,
      ...counts,
      count: counts.requiredBuildings,
      lengthM: selectNeedSegments(res, selectNeedLinks(res, { ...filter, type, zone: null }), filter.zone).reduce((sum, segment) => sum + segment.lengthM, 0),
      connectionLengthM: selectNeedSegments(res, links).reduce((sum, segment) => sum + segment.lengthM, 0),
      available: res.availableTypes.includes(type),
      unresolved: unresolved.length,
    };
  });
  const zones = res.zones.map((zone) => {
    const links = typeLinks.filter((link) => link.zone === zone.label);
    const addM = typeSegments.reduce((sum, segment) => sum + (segment.zoneLengths[zone.label] ?? 0), 0);
    const existingM = filter.type ? zone.existingByType[filter.type] ?? 0 : zone.existingM;
    const counts = requirementCounts(links, selectNeedUnresolved(res, { type: filter.type, zone: zone.label }));
    return { ...zone, ...counts, existingM, addM, totalM: existingM + addM, needBuildings: counts.requiredBuildings,
      connectionLengthM: selectNeedSegments(res, links).reduce((sum, segment) => sum + segment.lengthM, 0) };
  });
  const outsideM = typeSegments.reduce((sum, segment) => sum + (segment.zoneLengths[UNASSIGNED_ZONE] ?? 0), 0);
  const outsideUnresolved = selectNeedUnresolved(res, { type: filter.type, zone: UNASSIGNED_ZONE });
  if (res.unassignedBuildings > 0 || outsideM > 0 || outsideUnresolved.length > 0) {
    const links = typeLinks.filter((link) => link.zone == null);
    const addM = outsideM;
    const counts = requirementCounts(links, outsideUnresolved);
    zones.push({
      ...counts,
      label: UNASSIGNED_ZONE, geometry: null, existingM: 0, existingByType: {},
      buildings: res.unassignedBuildings, addM, totalM: addM,
      needBuildings: counts.requiredBuildings,
      connectionLengthM: selectNeedSegments(res, links).reduce((sum, segment) => sum + segment.lengthM, 0),
    });
  }
  // Нэмэлт физик шугамаар эрэмбэлнэ; том хуучин сүлжээ нь шинэ хэрэгцээ биш.
  zones.sort((a, b) => b.addM - a.addM || b.needBuildings - a.needBuildings || a.label.localeCompare(b.label));
  const counts = requirementCounts(selected, failures);
  return {
    rows, zones,
    ...counts,
    unserved: counts.requiredBuildings,
    buildings: filter.zone === UNASSIGNED_ZONE ? res.unassignedBuildings : selectedZone?.buildings ?? res.buildings,
    lengthM: selectedSegments.reduce((sum, segment) => sum + segment.lengthM, 0),
    connectionLengthM: selectNeedSegments(res, selected).reduce((sum, segment) => sum + segment.lengthM, 0),
    priority: new Set(selected.filter((link) => link.lengthM > filter.maxM).map((link) => link.building)).size,
    unresolved: failures,
    alreadyConnected: new Set(res.links.filter((link) => link.lengthM === 0 && (!filter.type || link.type === filter.type)
      && (!filter.zone || (link.zone ?? UNASSIGNED_ZONE) === filter.zone)).map((link) => `${link.type}:${link.building}`)).size,
  };
}
