/** Коридор дагуух урьдчилсан 2D трасс; хүчин чадал, даралт, хэвгийг баталгаажуулахгүй. */
export type RoutePoint = [number, number];
export type RoutePath = number[][];
export type RouteBuilding = { id: number; rings: number[][][] };
export type RouteSegment = { id: string; path: RoutePath; lengthM: number; buildings: number[]; kind: 'corridor' | 'access' | 'tie' };
export type UtilityRoute = { building: number; path: RoutePath; segmentIds: string[]; lengthM: number };
export type RouteFailure = { building: number; reason: 'no-source' | 'no-corridor' | 'no-access' | 'disconnected' };
export type UtilityRoutingResult = { routes: UtilityRoute[]; segments: RouteSegment[]; unresolved: RouteFailure[] };

const EPS = 1e-7;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (p: number[]) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
const edgeKey = (a: number[], b: number[]) => [key(a), key(b)].sort().join('|');
const bounds = (paths: number[][][]) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const path of paths) for (const p of path) {
    box[0] = Math.min(box[0], p[0]); box[1] = Math.min(box[1], p[1]);
    box[2] = Math.max(box[2], p[0]); box[3] = Math.max(box[3], p[1]);
  }
  return box;
};

function nearest(p: number[], a: number[], b: number[]): RoutePoint {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Тэгш/сондгой дүрэм нүх, олон хэсгийг дэмжинэ; хүрээ нь дотор талд тооцогдохгүй. */
export function insideBuilding(p: number[], rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (dist(p, nearest(p, a, b)) < EPS) return false;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Хилтэй огтлолцол бүрээр хувааж шалгана; жижиг барилгыг дээжлэлтийн завсарт алдахгүй. */
export function segmentCrossesBuilding(a: number[], b: number[], rings: number[][][]): boolean {
  if (insideBuilding(a, rings) || insideBuilding(b, rings)) return true;
  const ts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1];
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = ring[j], d = ring[i], ex = d[0] - c[0], ey = d[1] - c[1];
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < EPS) continue;
    const cx = c[0] - a[0], cy = c[1] - a[1];
    const t = (cx * ey - cy * ex) / det, u = (cx * dy - cy * dx) / det;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) ts.push(Math.max(0, Math.min(1, t)));
  }
  ts.sort((x, y) => x - y);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < EPS) continue;
    const t = (ts[i] + ts[i - 1]) / 2;
    if (insideBuilding([a[0] + t * dx, a[1] + t * dy], rings)) return true;
  }
  return false;
}

class SpatialBins<T> {
  private cells = new Map<string, T[]>();
  private large: { box: number[]; value: T }[] = [];
  constructor(private size: number) {}
  insert(box: number[], value: T) {
    if (!box.every(Number.isFinite)) return;
    if ((Math.ceil((box[2] - box[0]) / this.size) + 1) * (Math.ceil((box[3] - box[1]) / this.size) + 1) > 10_000) {
      this.large.push({ box, value }); return;
    }
    for (let x = Math.floor(box[0] / this.size); x <= Math.floor(box[2] / this.size); x++) {
      for (let y = Math.floor(box[1] / this.size); y <= Math.floor(box[3] / this.size); y++) {
        const k = `${x},${y}`;
        (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(value);
      }
    }
  }
  within(box: number[]): T[] {
    const found = new Set<T>();
    for (const item of this.large) if (item.box[0] <= box[2] && item.box[2] >= box[0] && item.box[1] <= box[3] && item.box[3] >= box[1]) found.add(item.value);
    for (let x = Math.floor(box[0] / this.size); x <= Math.floor(box[2] / this.size); x++) {
      for (let y = Math.floor(box[1] / this.size); y <= Math.floor(box[3] / this.size); y++) {
        for (const value of this.cells.get(`${x},${y}`) ?? []) found.add(value);
      }
    }
    return [...found];
  }
}

class MinHeap {
  private values: { node: number; cost: number }[] = [];
  push(value: { node: number; cost: number }) {
    const a = this.values; a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= value.cost) break;
      a[i] = a[p]; i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.values, first = a[0], last = a.pop();
    if (!a.length || !last) return first;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && a[child + 1].cost < a[child].cost) child++;
      if (a[child].cost >= last.cost) break;
      a[i] = a[child]; i = child;
    }
    a[i] = last;
    return first;
  }
}

export type RoutingGraph = {
  nodes: RoutePoint[]; adjacent: { node: number; length: number }[][];
  clear: (a: number[], b: number[]) => boolean;
  nearby: (box: number[]) => number[];
  metersPerUnit: number; maxAccess: number; maxTie: number;
};

/** Давхардсан салаа/коридорыг огтлолын төгсгөлөөр хувааж, хэсэг бүрийг нэг удаа тооцно. */
function splitSharedSegments(input: RouteSegment[], scale: number) {
  const parts = input.map((segment) => ({ segment, cuts: [0, 1] }));
  const index = new SpatialBins<number>(20 / scale);
  parts.forEach(({ segment, cuts }, i) => {
    const [a, b] = segment.path, length = dist(a, b);
    for (const j of index.within(bounds([segment.path]))) {
      const other = parts[j], [c, d] = other.segment.path;
      const cross = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(cross) > EPS * length * dist(c, d)) continue;
      for (const p of [c, d]) if (dist(p, nearest(p, a, b)) < 1e-5) cuts.push(dist(a, p) / length);
      for (const p of [a, b]) if (dist(p, nearest(p, c, d)) < 1e-5) other.cuts.push(dist(c, p) / dist(c, d));
    }
    index.insert(bounds([segment.path]), i);
  });
  const segments = new Map<string, RouteSegment>(), expanded = new Map<string, string[]>();
  for (const { segment, cuts } of parts) {
    cuts.sort((a, b) => a - b);
    const [start, end] = segment.path, ids: string[] = [];
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue;
      const a = [start[0] + (end[0] - start[0]) * cuts[i - 1], start[1] + (end[1] - start[1]) * cuts[i - 1]];
      const b = [start[0] + (end[0] - start[0]) * cuts[i], start[1] + (end[1] - start[1]) * cuts[i]];
      const id = edgeKey(a, b), existing = segments.get(id);
      if (existing) {
        existing.buildings = [...new Set([...existing.buildings, ...segment.buildings])];
        if (segment.kind === 'corridor') existing.kind = 'corridor';
      } else {
        segments.set(id, { ...segment, id, path: key(a) < key(b) ? [a, b] : [b, a], lengthM: dist(a, b) * scale, buildings: [...segment.buildings] });
      }
      ids.push(id);
    }
    expanded.set(segment.id, ids);
  }
  return { segments: [...segments.values()], expanded };
}

/** Барилгаас зайлсан коридорын графыг нэг удаа үүсгээд бүх системд хэрэглэнэ. */
export function buildRoutingGraph(options: {
  corridors: RoutePath[]; buildings: RouteBuilding[]; corridorPolygons?: number[][][][];
  metersPerUnit?: number; spacingM?: number; maxAccessM?: number; maxTieM?: number;
}): RoutingGraph {
  const scale = options.metersPerUnit ?? 1;
  if (!(scale > 0)) throw new Error('metersPerUnit must be positive');
  const spacing = (options.spacingM ?? 8) / scale, snap = Math.min(spacing, 3 / scale);
  const maxAccess = (options.maxAccessM ?? 80) / scale, maxTie = (options.maxTieM ?? 60) / scale;
  const obstacles = new SpatialBins<RouteBuilding>(80 / scale);
  for (const building of options.buildings) obstacles.insert(bounds(building.rings), building);
  const clear = (a: number[], b: number[]) => !obstacles.within(bounds([[a, b]])).some((building) => segmentCrossesBuilding(a, b, building.rings));
  const polygons = options.corridorPolygons;
  const corridorIndex = new SpatialBins<number[][][]>(80 / scale);
  for (const polygon of polygons ?? []) corridorIndex.insert(bounds(polygon), polygon);
  const inCorridor = (p: number[]) => !polygons?.length || corridorIndex.within([p[0], p[1], p[0], p[1]])
    .some((polygon) => insideBuilding(p, polygon) || polygon.some((ring) => ring.some((a, i) => dist(p, nearest(p, a, ring[(i + 1) % ring.length])) < 0.01)));
  const corridorClear = (a: number[], b: number[]) => {
    if (!clear(a, b)) return false;
    const samples = Math.max(1, Math.ceil(dist(a, b) / (1 / scale)));
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      if (!inCorridor([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  };
  const nodes: RoutePoint[] = [], adjacent: { node: number; length: number }[][] = [];
  const index = new SpatialBins<number>(Math.max(snap, 1)), byKey = new Map<string, number>();
  const nodeAt = (p: number[]): number => {
    const k = key(p), hit = byKey.get(k);
    if (hit != null) return hit;
    const i = nodes.length;
    nodes.push([p[0], p[1]]); adjacent.push([]); byKey.set(k, i);
    index.insert([p[0], p[1], p[0], p[1]], i);
    return i;
  };
  const connect = (a: number, b: number) => {
    if (a === b || adjacent[a].some((edge) => edge.node === b) || !corridorClear(nodes[a], nodes[b])) return;
    const length = dist(nodes[a], nodes[b]);
    if (length < EPS) return;
    adjacent[a].push({ node: b, length }); adjacent[b].push({ node: a, length });
  };
  // Оролтын оройгүй огтлолцлыг ч зангилаа болгоно; дээжийн алхмаас холбоос хамаарахгүй.
  const raw: { a: number[]; b: number[]; cuts: number[] }[] = [];
  const edgeIndex = new SpatialBins<number>(80 / scale);
  for (const path of options.corridors) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (dist(a, b) < EPS) continue;
    const box = bounds([[a, b]]), current = { a, b, cuts: [0, 1] };
    for (const index of edgeIndex.within(box)) {
      const other = raw[index], c = other.a, d = other.b;
      const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < EPS) {
        for (const p of [c, d]) if (dist(p, nearest(p, a, b)) < EPS) current.cuts.push(dist(a, p) / dist(a, b));
        for (const p of [a, b]) if (dist(p, nearest(p, c, d)) < EPS) other.cuts.push(dist(c, p) / dist(c, d));
        continue;
      }
      const cx = c[0] - a[0], cy = c[1] - a[1], t = (cx * ey - cy * ex) / det, u = (cx * dy - cy * dx) / det;
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
        current.cuts.push(Math.max(0, Math.min(1, t))); other.cuts.push(Math.max(0, Math.min(1, u)));
      }
    }
    edgeIndex.insert(box, raw.length); raw.push(current);
  }
  for (const edge of raw) {
    const cuts = [...new Set(edge.cuts)].sort((a, b) => a - b);
    for (let cut = 1; cut < cuts.length; cut++) {
      const a = [edge.a[0] + (edge.b[0] - edge.a[0]) * cuts[cut - 1], edge.a[1] + (edge.b[1] - edge.a[1]) * cuts[cut - 1]];
      const b = [edge.a[0] + (edge.b[0] - edge.a[0]) * cuts[cut], edge.a[1] + (edge.b[1] - edge.a[1]) * cuts[cut]];
      const count = Math.max(1, Math.ceil(dist(a, b) / spacing));
      let previous: number | null = null;
      for (let j = 0; j <= count; j++) {
        const t = j / count, p: RoutePoint = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        if (!clear(p, p) || !inCorridor(p)) { previous = null; continue; }
        const current = nodeAt(p);
        if (previous != null) connect(previous, current);
        previous = current;
      }
    }
  }
  // Ойр төгсгөлүүдийг зөвхөн нийтийн коридорын дотор, барилгагүй хэсгээр холбоно.
  nodes.forEach((p, i) => {
    for (const j of index.within([p[0] - snap, p[1] - snap, p[0] + snap, p[1] + snap])) {
      if (j > i && dist(p, nodes[j]) <= snap) connect(i, j);
    }
  });
  return { nodes, adjacent, clear, nearby: (box) => index.within(box), metersPerUnit: scale, maxAccess, maxTie };
}

/** Олон эх үүсвэртэй хамгийн богино мод; дундын шугамын уртыг барилгын тоогоор үржүүлэхгүй. */
export function routeUtilityNetwork(graph: RoutingGraph, network: RoutePath[], buildings: RouteBuilding[]): UtilityRoutingResult {
  const { nodes, adjacent, metersPerUnit: scale, maxAccess, maxTie, clear } = graph;
  const routes: UtilityRoute[] = [], unresolved: RouteFailure[] = [];
  const failAll = (reason: RouteFailure['reason'], pending = buildings) => ({ routes, segments: [], unresolved: pending.map((building) => ({ building: building.id, reason })) });
  if (!network.some((path) => path.length > 1)) return failAll('no-source');
  const sources = new SpatialBins<{ a: number[]; b: number[] }>(Math.max(maxTie, 1));
  const area = bounds([nodes, ...buildings.flatMap((building) => building.rings)]);
  for (const path of network) for (let i = 1; i < path.length; i++) {
    const box = bounds([[path[i - 1], path[i]]]);
    if (box[0] > area[2] + maxTie || box[2] < area[0] - maxTie || box[1] > area[3] + maxTie || box[3] < area[1] - maxTie) continue;
    sources.insert(box, { a: path[i - 1], b: path[i] });
  }
  const pending = buildings.filter((building) => {
    const box = bounds(building.rings), tolerance = 0.02 / scale;
    const nearby = sources.within([box[0] - tolerance, box[1] - tolerance, box[2] + tolerance, box[3] + tolerance]);
    for (const source of nearby) for (const ring of building.rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      for (const [p, q] of [[a, nearest(a, source.a, source.b)], [source.a, nearest(source.a, a, b)], [source.b, nearest(source.b, a, b)]]) {
        if (dist(p, q) > tolerance || !clear(p, q)) continue;
        routes.push({ building: building.id, path: [q], segmentIds: [], lengthM: 0 });
        return false;
      }
    }
    return true;
  });
  if (!nodes.length) return failAll('no-corridor', pending);
  const costs = new Float64Array(nodes.length).fill(Infinity), parent = new Int32Array(nodes.length).fill(-1);
  const ties = new Map<number, RoutePoint>(), heap = new MinHeap();
  nodes.forEach((p, i) => {
    for (const segment of sources.within([p[0] - maxTie, p[1] - maxTie, p[0] + maxTie, p[1] + maxTie])) {
      const q = nearest(p, segment.a, segment.b), distance = dist(p, q);
      if (distance > maxTie || distance >= costs[i] || !clear(p, q)) continue;
      costs[i] = distance; ties.set(i, q);
    }
    if (Number.isFinite(costs[i])) heap.push({ node: i, cost: costs[i] });
  });
  for (let current = heap.pop(); current; current = heap.pop()) {
    if (current.cost !== costs[current.node]) continue;
    for (const edge of adjacent[current.node]) {
      const value = current.cost + edge.length;
      if (value + EPS >= costs[edge.node]) continue;
      costs[edge.node] = value; parent[edge.node] = current.node;
      heap.push({ node: edge.node, cost: value });
    }
  }
  const segments = new Map<string, RouteSegment>();
  const addSegment = (a: number[], b: number[], building: number, kind: RouteSegment['kind']): string | null => {
    if (dist(a, b) < EPS) return null;
    const id = edgeKey(a, b), previous = segments.get(id);
    if (previous) { if (!previous.buildings.includes(building)) previous.buildings.push(building); }
    else segments.set(id, { id, path: [a, b], lengthM: dist(a, b) * scale, buildings: [building], kind });
    return id;
  };
  for (const building of pending) {
    const box = bounds(building.rings), candidates = graph.nearby([box[0] - maxAccess, box[1] - maxAccess, box[2] + maxAccess, box[3] + maxAccess]);
    let chosen = -1, access: RoutePoint | null = null, best = Infinity, hasAccess = false;
    for (const i of candidates) {
      let closest: RoutePoint | null = null, gap = Infinity;
      for (const ring of building.rings) for (let k = 0; k < ring.length; k++) {
        const p = nearest(nodes[i], ring[k], ring[(k + 1) % ring.length]), d = dist(nodes[i], p);
        if (d < gap) { closest = p; gap = d; }
      }
      if (!closest || gap > maxAccess || !clear(closest, nodes[i])) continue;
      hasAccess = true;
      if (gap + costs[i] < best) { chosen = i; access = closest; best = gap + costs[i]; }
    }
    if (chosen < 0 || !access) { unresolved.push({ building: building.id, reason: hasAccess ? 'disconnected' : 'no-access' }); continue; }
    const path: RoutePath = [access], segmentIds: string[] = [];
    const push = (point: number[], kind: RouteSegment['kind']) => {
      const id = addSegment(path[path.length - 1], point, building.id, kind);
      if (id) { segmentIds.push(id); path.push(point); }
    };
    push(nodes[chosen], 'access');
    let cursor = chosen;
    while (parent[cursor] >= 0) { cursor = parent[cursor]; push(nodes[cursor], 'corridor'); }
    const tie = ties.get(cursor);
    if (tie) push(tie, 'tie');
    routes.push({ building: building.id, path, segmentIds, lengthM: best * scale });
  }
  const physical = splitSharedSegments([...segments.values()], scale);
  for (const route of routes) route.segmentIds = [...new Set(route.segmentIds.flatMap((id) => physical.expanded.get(id) ?? []))];
  return { routes, segments: physical.segments, unresolved };
}
