/**
 * Polygon → line network, independent of ArcGIS and usable in a browser worker.
 *
 * Even/odd scan conversion retains holes; Zhang–Suen thinning retains raster
 * connectivity and loops. The result is a calculated skeleton, never perimeter/2.
 * The input must contain disjoint/unioned polygon rings in a planar coordinate
 * system. Resolution and returned coordinates use that same system's units.
 * References: https://doi.org/10.1145/357994.358023
 * https://scikit-image.org/docs/stable/auto_examples/edges/plot_skeleton.html
 *
 * Raster boundaries approximate the source within the reported cell size. Exact
 * GIS callers should intersect the resulting lines with the original polygon.
 */
export type CenterlineResult = {
  paths: number[][][];
  /** Coarsest actual grid cell, including any memory-bounded adaptation. */
  resolution: number;
  complete: boolean;
  warnings: string[];
  components: number;
};
export type CenterlineOptions = { resolution: number; maxCells?: number };
type Point = number[];
type RingInfo = { ring: Point[]; area: number; xmin: number; ymin: number; xmax: number; ymax: number; parent: number; depth: number };

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pointInRing = (x: number, y: number, ring: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

function componentsOf(rings: number[][][]): RingInfo[][] {
  const infos: RingInfo[] = [];
  for (const input of rings) {
    if (input.some((p) => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error('Invalid polygon coordinate');
    const ring = input.filter((p, i) => !i || distance(p, input[i - 1]) > 0);
    if (ring.length < 3) continue;
    let area = 0, xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      area += (a[0] - ring[0][0]) * (b[1] - ring[0][1]) - (a[1] - ring[0][1]) * (b[0] - ring[0][0]);
      xmin = Math.min(xmin, b[0]); ymin = Math.min(ymin, b[1]);
      xmax = Math.max(xmax, b[0]); ymax = Math.max(ymax, b[1]);
    }
    if (Math.abs(area) > 0) infos.push({ ring, area: Math.abs(area), xmin, ymin, xmax, ymax, parent: -1, depth: 0 });
  }
  infos.sort((a, b) => b.area - a.area);
  for (let i = 0; i < infos.length; i++) {
    const child = infos[i];
    for (let j = i - 1; j >= 0; j--) {
      const outer = infos[j];
      if (outer.xmin <= child.xmin && outer.ymin <= child.ymin && outer.xmax >= child.xmax && outer.ymax >= child.ymax
        && pointInRing(child.ring[0][0], child.ring[0][1], outer.ring)) {
        child.parent = j; child.depth = outer.depth + 1; break;
      }
    }
  }
  return infos.flatMap((outer, i) => outer.depth % 2 ? [] : [[outer, ...infos.filter((r) => r.parent === i)]]);
}

/** Small spatial index keeps containment checks proportional to nearby boundary edges. */
function boundaryIndex(infos: RingInfo[], resolution: number) {
  const bounds = infos[0];
  const step = Math.max(resolution * 16, Math.max(bounds.xmax - bounds.xmin, bounds.ymax - bounds.ymin) / 64);
  const width = Math.floor((bounds.xmax - bounds.xmin) / step) + 1;
  const edges: { a: Point; b: Point }[] = [];
  const buckets = new Map<number, number[]>();
  const col = (x: number) => Math.floor((x - bounds.xmin) / step);
  const row = (y: number) => Math.floor((y - bounds.ymin) / step);
  for (const { ring } of infos) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], id = edges.length; edges.push({ a, b });
    for (let y = row(Math.min(a[1], b[1])); y <= row(Math.max(a[1], b[1])); y++) {
      for (let x = col(Math.min(a[0], b[0])); x <= col(Math.max(a[0], b[0])); x++) {
        const key = y * width + x;
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(id);
      }
    }
  }
  const inside = (x: number, y: number) => {
    if (x < bounds.xmin || y < bounds.ymin || x > bounds.xmax || y > bounds.ymax) return false;
    let on = false;
    const checked = new Set<number>();
    for (let c = Math.max(0, col(x)); c < width; c++) for (const id of buckets.get(row(y) * width + c) ?? []) {
      if (checked.has(id)) continue; checked.add(id);
      const { a, b } = edges[id];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) on = !on;
    }
    return on;
  };
  const intervals = (a: Point, b: Point): number[] => {
    const cuts = [0, 1], checked = new Set<number>();
    const dx = b[0] - a[0], dy = b[1] - a[1];
    for (let y = row(Math.min(a[1], b[1])); y <= row(Math.max(a[1], b[1])); y++) {
      for (let x = col(Math.min(a[0], b[0])); x <= col(Math.max(a[0], b[0])); x++) for (const id of buckets.get(y * width + x) ?? []) {
        if (checked.has(id)) continue; checked.add(id);
        const { a: p, b: q } = edges[id], ex = q[0] - p[0], ey = q[1] - p[1];
        const denominator = cross(dx, dy, ex, ey);
        if (Math.abs(denominator) < 1e-12) continue;
        const t = cross(p[0] - a[0], p[1] - a[1], ex, ey) / denominator;
        const u = cross(p[0] - a[0], p[1] - a[1], dx, dy) / denominator;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
      }
    }
    return [...new Set(cuts)].sort((x, y) => x - y);
  };
  return {
    intervals, inside,
    covered: (a: Point, b: Point) => {
      const cuts = intervals(a, b);
      for (let i = 1; i < cuts.length; i++) {
        const t = (cuts[i - 1] + cuts[i]) / 2;
        if (!inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
      }
      return true;
    },
  };
}

function simplify(path: Point[], tolerance: number, covered: (a: Point, b: Point) => boolean): Point[] {
  if (path.length <= 2) return path;
  const keep = new Uint8Array(path.length); keep[0] = 1; keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = path[start], b = path[end], dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy;
    let max = tolerance * tolerance, split = -1;
    for (let i = start + 1; i < end; i++) {
      const p = path[i];
      const t = d2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2)) : 0;
      const dd = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (dd > max) { max = dd; split = i; }
    }
    if (split < 0 && end - start > 1 && !covered(a, b)) split = Math.floor((start + end) / 2);
    if (split >= 0) { keep[split] = 1; stack.push([start, split], [split, end]); }
  }
  return path.filter((_, i) => keep[i]);
}

/** Extend a terminal skeleton toward the first true boundary along its local tangent. */
function extendEnd(path: Point[], rings: Point[][], resolution: number): void {
  if (path.length < 2) return;
  const p = path[0];
  let q = path[1], travelled = 0;
  for (let i = 1; i < path.length; i++) {
    travelled += distance(path[i - 1], path[i]); q = path[i];
    if (travelled >= resolution * 6) break;
  }
  const norm = distance(p, q);
  if (!norm) return;
  const dx = (p[0] - q[0]) / norm, dy = (p[1] - q[1]) / norm;
  let nearest = Infinity;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], ex = b[0] - a[0], ey = b[1] - a[1];
    const denominator = cross(dx, dy, ex, ey);
    if (Math.abs(denominator) < 1e-12) continue;
    const ax = a[0] - p[0], ay = a[1] - p[1];
    const t = cross(ax, ay, ex, ey) / denominator, u = cross(ax, ay, dx, dy) / denominator;
    if (t > resolution * 1e-6 && u >= -1e-10 && u <= 1 + 1e-10) nearest = Math.min(nearest, t);
  }
  if (Number.isFinite(nearest)) path.unshift([p[0] + dx * nearest, p[1] + dy * nearest]);
}

function skeletonComponent(infos: RingInfo[], requested: number, maxCells: number): { paths: Point[][]; resolution: number; lost: boolean } {
  const bounds = infos[0], rings = infos.map((r) => r.ring);
  const boundary = boundaryIndex(infos, requested);
  let resolution = requested;
  const dimensions = () => [Math.ceil((bounds.xmax - bounds.xmin) / resolution) + 4, Math.ceil((bounds.ymax - bounds.ymin) / resolution) + 4];
  let [width, height] = dimensions();
  while (width * height > maxCells) {
    resolution *= Math.max(1.01, Math.sqrt(width * height / maxCells));
    [width, height] = dimensions();
  }
  const xmin = bounds.xmin - 1.5 * resolution, ymin = bounds.ymin - 1.5 * resolution;
  const mask = new Uint8Array(width * height);
  const scan: number[][] = Array.from({ length: height }, () => []);
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (a[1] === b[1]) continue;
    const first = Math.max(1, Math.ceil((Math.min(a[1], b[1]) - ymin) / resolution));
    const last = Math.min(height - 2, Math.ceil((Math.max(a[1], b[1]) - ymin) / resolution) - 1);
    for (let row = first; row <= last; row++) {
      const y = ymin + row * resolution;
      scan[row].push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
  }
  const active: number[] = [];
  for (let row = 1; row < height - 1; row++) {
    const xs = scan[row].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(1, Math.ceil((xs[i] - xmin) / resolution));
      const to = Math.min(width - 2, Math.ceil((xs[i + 1] - xmin) / resolution) - 1);
      for (let col = from; col <= to; col++) { const id = row * width + col; mask[id] = 1; active.push(id); }
    }
  }
  if (!active.length) return { paths: [], resolution, lost: true };
  // p2…p9 follow the paper clockwise, starting at north.
  const removed: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let phase = 0; phase < 2; phase++) {
      removed.length = 0;
      for (const p of active) {
        const n = mask[p - width], ne = mask[p - width + 1], e = mask[p + 1], se = mask[p + width + 1];
        const s = mask[p + width], sw = mask[p + width - 1], w = mask[p - 1], nw = mask[p - width - 1];
        const count = n + ne + e + se + s + sw + w + nw;
        if (count < 2 || count > 6) continue;
        const transitions = Number(!n && ne) + Number(!ne && e) + Number(!e && se) + Number(!se && s)
          + Number(!s && sw) + Number(!sw && w) + Number(!w && nw) + Number(!nw && n);
        if (transitions !== 1) continue;
        if (phase === 0 ? (n * e * s || e * s * w) : (n * e * w || n * s * w)) continue;
        removed.push(p);
      }
      if (removed.length) {
        changed = true;
        for (const p of removed) mask[p] = 0;
        let kept = 0;
        for (const p of active) if (mask[p]) active[kept++] = p;
        active.length = kept;
      }
    }
  }
  const offsets = [-width, -width + 1, 1, width + 1, width, width - 1, -1, -width - 1];
  const neighbors = (p: number): number[] => {
    const ids: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
      if (!mask[p + offsets[i]]) continue;
      // Do not add a diagonal shortcut when a cardinal step already connects the pixels.
      if (i % 2 && (mask[p + offsets[i - 1]] || mask[p + offsets[(i + 1) % 8]])) continue;
      ids.push(p + offsets[i]);
    }
    return ids;
  };
  const nodes = new Map<number, number[]>();
  for (const p of active) nodes.set(p, neighbors(p));
  // One continuous polygon must stay one connected skeleton. Otherwise endpoint
  // extension could turn many subcell raster islands into overlapping full lines.
  const reached = new Set<number>();
  let islands = 0;
  for (const p of active) {
    if (reached.has(p)) continue;
    islands++;
    const queue = [p]; reached.add(p);
    for (let i = 0; i < queue.length; i++) for (const q of nodes.get(queue[i])!) if (!reached.has(q)) { reached.add(q); queue.push(q); }
  }
  const visited = new Set<number>();
  const edge = (a: number, b: number) => Math.min(a, b) * mask.length + Math.max(a, b);
  const paths: Point[][] = [];
  const trace = (start: number, second: number) => {
    const ids = [start];
    let previous = start, current = second;
    visited.add(edge(start, second));
    while (true) {
      ids.push(current);
      const adjacent = nodes.get(current)!;
      if (current === start || adjacent.length !== 2) break;
      const next = adjacent[0] === previous ? adjacent[1] : adjacent[0];
      if (visited.has(edge(current, next))) break;
      visited.add(edge(current, next)); previous = current; current = next;
    }
    const path = ids.map((p) => [xmin + (p % width) * resolution, ymin + Math.floor(p / width) * resolution]);
    if (islands === 1 && nodes.get(ids[0])!.length === 1) extendEnd(path, rings, resolution);
    if (islands === 1 && nodes.get(ids[ids.length - 1])!.length === 1) { path.reverse(); extendEnd(path, rings, resolution); path.reverse(); }
    const closed = ids[0] === ids[ids.length - 1];
    if (closed) {
      const middle = Math.floor(path.length / 2);
      paths.push([...simplify(path.slice(0, middle + 1), resolution * 1.25, boundary.covered), ...simplify(path.slice(middle), resolution * 1.25, boundary.covered).slice(1)]);
    } else paths.push(simplify(path, resolution * 1.25, boundary.covered));
  };
  for (const [p, adjacent] of nodes) if (adjacent.length !== 2) for (const q of adjacent) if (!visited.has(edge(p, q))) trace(p, q);
  // A closed roundabout/hole has no terminal or branch node.
  for (const [p, adjacent] of nodes) for (const q of adjacent) if (!visited.has(edge(p, q))) trace(p, q);
  let lost = !paths.length || islands !== 1 || [...nodes.values()].some((ids) => !ids.length);
  const contained: Point[][] = [];
  for (const path of paths) {
    let part: Point[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (boundary.covered(a, b)) { if (!part.length) part.push(a); part.push(b); continue; }
      // A corridor narrower than the cell can have false raster connectivity.
      // Report it, and retain only exact interior portions instead of crossing a hole.
      lost = true;
      const cuts = boundary.intervals(a, b);
      for (let j = 1; j < cuts.length; j++) {
        const t = (cuts[j - 1] + cuts[j]) / 2;
        const at = (q: number) => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
        if (boundary.inside(...at(t) as [number, number])) {
          if (!part.length) part.push(at(cuts[j - 1]));
          part.push(at(cuts[j]));
        } else { if (part.length > 1) contained.push(part); part = []; }
      }
    }
    if (part.length > 1) contained.push(part);
  }
  return { paths: contained, resolution, lost };
}

export function polygonCenterlines(rings: number[][][], options: CenterlineOptions): CenterlineResult {
  if (!Number.isFinite(options.resolution) || options.resolution <= 0) throw new Error('Centerline resolution must be positive');
  const maxCells = options.maxCells ?? 4_000_000;
  if (!Number.isFinite(maxCells) || maxCells < 64) throw new Error('Centerline grid capacity must be at least 64 cells');
  const components = componentsOf(rings);
  const result: CenterlineResult = { paths: [], resolution: components.length ? 0 : options.resolution, complete: true, warnings: [], components: components.length };
  if (!components.length && rings.length) { result.complete = false; result.warnings.push('degenerate-polygon'); }
  for (const component of components) {
    let out = skeletonComponent(component, options.resolution, maxCells);
    // Small narrow polygons must not quietly disappear between raster cell centers.
    if (out.lost && out.resolution <= options.resolution * 1.001) out = skeletonComponent(component, options.resolution / 4, maxCells);
    result.paths.push(...out.paths); result.resolution = Math.max(result.resolution, out.resolution);
    if (out.lost) { result.complete = false; result.warnings.push('unresolved-component'); }
  }
  if (result.resolution > options.resolution * 1.001) result.warnings.push('coarser-grid');
  return result;
}
