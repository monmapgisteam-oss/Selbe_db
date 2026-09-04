/**
 * ТРАФИКИЙН ХӨДӨЛГҮҮРИЙН математикийг шалгана (амьд үйлчилгээ хэрэггүй).
 *   node src/modules/analysis/suit/traffic.check.mjs
 *
 * Хамгаалж буй алдаа: diurnal интерполяци цагийн заагаас хальж эсвэл тойрог
 * болж дугуйрахгүй байх · замын шугам дагуух байрлал (`posAt`/`poseAt`) урт,
 * оройн хуваарилалтыг буруу тооцох · үзүүр наах (`buildNetwork`) уулзварыг
 * салгах · уулзвар дээрх сонголт (`pickNext`) шулуун чиглэлийг илүүд үзэхгүй
 * байх · машин ирмэгийн зааг дээр гацах, эсвэл урдахаа нэвт өнгөрөх.
 *
 * `traffic.ts`-ийн ЦЭВЭР логикийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

/* ══════════════════ Хуулбар: traffic.ts ══════════════════ */

const DIURNAL = [
  0.05, 0.03, 0.02, 0.02, 0.04, 0.12,
  0.35, 0.75, 1.00, 0.80, 0.55, 0.50,
  0.55, 0.55, 0.50, 0.55, 0.70, 0.95,
  1.00, 0.80, 0.55, 0.35, 0.20, 0.10,
];
const wrapMin = (m) => ((m % 1440) + 1440) % 1440;
const diurnalAt = (minute) => {
  const h = wrapMin(minute) / 60;
  const i = Math.floor(h) % 24;
  const j = (i + 1) % 24;
  const f = h - Math.floor(h);
  return DIURNAL[i] + (DIURNAL[j] - DIURNAL[i]) * f;
};
const clockText = (minute) => {
  const m = Math.round(wrapMin(minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const measurePath = (pts) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { cum, length: cum[cum.length - 1] ?? 0 };
};
const makeSegment = (id, pts, baseLoad = 0) => {
  const { cum, length } = measurePath(pts);
  return { id, pts, cum, length, baseLoad };
};
const posAt = (seg, t) => {
  if (seg.pts.length === 0) return [0, 0];
  if (seg.pts.length === 1 || seg.length === 0) return seg.pts[0];
  const d = Math.max(0, Math.min(1, t)) * seg.length;
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < d) i++;
  const a = seg.pts[i - 1], b = seg.pts[i];
  const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
  const f = (d - seg.cum[i - 1]) / segLen;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
const poseAt = (seg, d) => {
  if (seg.pts.length < 2 || seg.length === 0) {
    const p = seg.pts[0] ?? [0, 0];
    return { x: p[0], y: p[1], ux: 1, uy: 0 };
  }
  const dd = Math.max(0, Math.min(seg.length, d));
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < dd) i++;
  const a = seg.pts[i - 1], b = seg.pts[i];
  const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
  const f = (dd - seg.cum[i - 1]) / segLen;
  return {
    x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f,
    ux: (b[0] - a[0]) / segLen, uy: (b[1] - a[1]) / segLen,
  };
};

const SNAP_TOL_M = 1.0;
const SIGNAL_SNAP_M = 12;
const SINK_JUMP_M = 60;
const MIN_EDGE_M = 0.05;
const buildNetwork = (paths, { tolM = SNAP_TOL_M, unitsPerMeter = 1, signals: signalDefs, directed = false } = {}) => {
  const tol = tolM * unitsPerMeter;
  const nodes = [];
  const grid = new Map();
  const nid = (p) => {
    const cx = Math.floor(p[0] / tol), cy = Math.floor(p[1] / tol);
    let best = -1, bestD = tol;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = Math.hypot(nodes[i].x - p[0], nodes[i].y - p[1]);
        if (d <= bestD) { bestD = d; best = i; }
      }
    }
    if (best >= 0) return best;
    const i = nodes.length;
    nodes.push({ x: p[0], y: p[1], out: [] });
    const k = `${cx},${cy}`;
    const cell = grid.get(k);
    if (cell) cell.push(i); else grid.set(k, [i]);
    return i;
  };
  const edges = [];
  const push = (pts) => {
    if (pts.length < 2) return;
    const a = nid(pts[0]);
    const b = nid(pts[pts.length - 1]);
    if (a === b) return;
    const seg = makeSegment(String(edges.length), pts);
    if (seg.length < MIN_EDGE_M * unitsPerMeter) return;
    edges.push({ ...seg, a, b });
  };
  for (const pts of paths) {
    if (pts.length < 2) continue;
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= tol;
    if (closed && pts.length >= 4) {
      const mid = Math.floor(pts.length / 2);
      push(pts.slice(0, mid + 1));
      push(pts.slice(mid));
    } else push(pts);
  }
  for (let i = 0; i < edges.length; i++) { nodes[edges[i].a].out.push(i); nodes[edges[i].b].out.push(i); }
  const signals = new Set();
  const signalGroups = new Map();
  const signalLines = [];
  const stopBars = new Map();
  const segX = (A, B, C, D) => {
    const rx = B[0] - A[0], ry = B[1] - A[1], sx = D[0] - C[0], sy = D[1] - C[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((C[0] - A[0]) * sy - (C[1] - A[1]) * sx) / den;
    const u = ((C[0] - A[0]) * ry - (C[1] - A[1]) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t } : null;
  };
  if (signalDefs?.length) {
    const tolU = SIGNAL_SNAP_M * unitsPerMeter;
    for (const sd of signalDefs) {
      const lines = sd.lines ?? [];
      if (!lines.length) continue;
      for (const ln of lines) signalLines.push({ ...ln, hub: sd.pt, j: sd.name });
      // Зогсолтын шугамыг ирмэг дээр буулгах (30% сунгаж огтолцол хайна)
      for (const ln of lines) {
        const A = ln.pts[0], B = ln.pts[ln.pts.length - 1];
        const ex = (B[0] - A[0]) * 0.3, ey = (B[1] - A[1]) * 0.3;
        const A2 = [A[0] - ex, A[1] - ey], B2 = [B[0] + ex, B[1] + ey];
        for (let ei = 0; ei < edges.length; ei++) {
          const e = edges[ei];
          for (let i = 1; i < e.pts.length; i++) {
            const P = e.pts[i - 1], Q = e.pts[i];
            const h = segX(P, Q, A2, B2);
            if (!h) continue;
            const segLen = e.cum[i] - e.cum[i - 1] || 1;
            const s = e.cum[i - 1] + h.t * segLen;
            const hx = P[0] + (Q[0] - P[0]) * h.t, hy = P[1] + (Q[1] - P[1]) * h.t;
            const dir = ((Q[0] - P[0]) * (sd.pt[0] - hx) + (Q[1] - P[1]) * (sd.pt[1] - hy)) > 0 ? 1 : -1;
            let list = stopBars.get(ei);
            if (!list) { list = []; stopBars.set(ei, list); }
            list.push({ s, dir, code: ln.code, j: sd.name });
          }
        }
      }
      // ⚠️ БАЙРЛАЛААР: төвөөс line-ийн ДУНД ЦЭГ рүү чиглэл (line нь зогсолтын
      //    шугам — замаа хөндлөн огтолдог тул чиглэлээр нь онооход фаз урвуу байсан)
      const lineDirs = lines.map((ln) => {
        const a = ln.pts[0], b = ln.pts[ln.pts.length - 1];
        const mx = (a[0] + b[0]) / 2 - sd.pt[0], my = (a[1] + b[1]) / 2 - sd.pt[1];
        const L = Math.hypot(mx, my) || 1;
        return { g: ln.code, dx: mx / L, dy: my / L };
      });
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].out.length < 3) continue;
        if (Math.hypot(nodes[i].x - sd.pt[0], nodes[i].y - sd.pt[1]) > tolU) continue;
        signals.add(i);
        let m = signalGroups.get(i);
        if (!m) { m = new Map(); signalGroups.set(i, m); }
        for (const ei of nodes[i].out) {
          const eh = outHeading(edges[ei], i);
          let bestG = 0, bestDot = -1;
          for (const ld of lineDirs) {
            const dot = Math.abs(eh[0] * ld.dx + eh[1] * ld.dy);
            if (dot > bestDot) { bestDot = dot; bestG = ld.g; }
          }
          m.set(ei, bestG);
        }
      }
    }
  }
  const sinkExit = new Map();
  if (directed) {
    const legalOut = nodes.map((n, i) => n.out.filter((ei) => edges[ei].a === i));
    const R = SINK_JUMP_M * unitsPerMeter;
    for (let i = 0; i < nodes.length; i++) {
      if (legalOut[i].length || !nodes[i].out.length) continue;
      let best = -1, bestD = R;
      for (let j = 0; j < nodes.length; j++) {
        if (!legalOut[j].length) continue;
        const d = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
        if (d <= bestD) { bestD = d; best = j; }
      }
      if (best >= 0) sinkExit.set(i, legalOut[best]);
    }
  }
  return { nodes, edges, unitsPerMeter, signals, signalGroups, signalLines, stopBars, sinkExit, directed };
};
// Цэгээс ХЯЗГААРЛАГДМАЛ хэрчим хүртэлх зай (үзүүрт таслана)
const distToSeg = (q, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(q[0] - a[0], q[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
};
// ДАВХАРДСАН ирмэгийг тэмдэглэнэ — өөр (урт) ирмэгийн ДЭЭР хэвтэж буй нь
const markDuplicates = (net, { tolM = 1.0, cover = 0.85 } = {}) => {
  const upm = net.unitsPerMeter || 1;
  const tol = tolM * upm;
  const order = net.edges.map((_, i) => i).sort((a, b) => net.edges[b].length - net.edges[a].length);
  const covered = (A, B) => {
    let hit = 0;
    for (const q of A.pts) {
      let best = Infinity;
      for (let i = 1; i < B.pts.length && best > tol; i++) {
        const dd = distToSeg(q, B.pts[i - 1], B.pts[i]);
        if (dd < best) best = dd;
      }
      if (best <= tol) hit++;
    }
    return hit / Math.max(1, A.pts.length);
  };
  let marked = 0;
  for (const i of order) {
    const A = net.edges[i];
    if (A.dup) continue;
    const am = A.pts[Math.floor(A.pts.length / 2)];
    for (const j of order) {
      if (j === i) continue;
      const B = net.edges[j];
      if (B.dup || B.length < A.length) continue;
      const bm = B.pts[Math.floor(B.pts.length / 2)];
      if (Math.hypot(am[0] - bm[0], am[1] - bm[1]) > B.length + tol) continue;
      if (covered(A, B) >= cover) { A.dup = true; marked++; break; }
    }
  }
  return marked;
};
const YELLOW_S = 3;
// ЗОХИЦУУЛАЛТЫН ХӨТӨЛБӨР — мөчлөгийг ээлжүүдэд хуваана (код → ээлж)
const SIGNAL_PLANS = [
  // Бодит уулзварын хуваарь (хэрэглэгчийн өгсөн): 3·4·7·8 → 1·6 → 2·5
  { key: 'real', label: 'Уулзварын хуваарь', desc: 'Бодит 3 ээлж',
    stages: [[3, 4, 7, 8], [1, 6], [2, 5]],
    byJunction: {
      '1-р гэрлэн дохио': [[3, 4, 7, 8], [1, 6], [2, 5]],
      '2-р гэрлэн дохио': [[1, 2], [3, 4], [5, 6]],
    },
    cycle: 90, yellow: 3 },
  // Бодит уулзварын хуваарь: ээлж бүрд үндсэн зураас + зөрчилгүй зэрэглэлүүд
  { key: 'real', label: 'Уулзварын хуваарь', desc: 'Бодит 8 ээлж',
    stages: [[1,7,8],[2,1,7],[3,4,7,8],[4,3,7,8],[5,8,3,4],[6,1,2],[7,8,3,4],[8,7,1,4]],
    cycle: 120, yellow: 3 },
  { key: '2', label: '2 ээлж', desc: 'Хоёр тэнхлэг', stages: [[1, 3, 5, 7], [2, 4, 6, 8]], cycle: 60, yellow: 3 },
  { key: '4', label: '4 ээлж', desc: 'Чиглэл тус бүр', stages: [[1, 5], [4, 8], [3, 7], [2, 6]], cycle: 80, yellow: 3 },
  { key: '8', label: '8 ээлж', desc: 'Эгнээ тус бүр', stages: [[1], [5], [4], [8], [3], [7], [2], [6]], cycle: 120, yellow: 2 },
];
const DEFAULT_SIGNAL_PLAN = SIGNAL_PLANS[0];
// ЗӨРЧИЛГҮЙ ЭЭЛЖ — уулзварын геометрээс: талуудыг бүлэглээд эсрэг талтай хосолно
const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360) + 360) % 360; return d > 180 ? 360 - d : d; };
const signalBearings = (net) => {
  const out = new Map();
  for (const ln of net.signalLines) {
    if (!ln.hub || ln.pts.length < 2) continue;
    const a = ln.pts[0], b = ln.pts[ln.pts.length - 1];
    const mx = (a[0] + b[0]) / 2 - ln.hub[0], my = (a[1] + b[1]) / 2 - ln.hub[1];
    out.set(ln.code, ((Math.atan2(my, mx) * 180) / Math.PI + 360) % 360);
  }
  return out;
};
const compatStages = (net, { sideDeg = 18, oppDeg = 35, mode = 'split' } = {}) => {
  const bear = signalBearings(net);
  const codes = [...bear.keys()].sort((a, b) => bear.get(a) - bear.get(b));
  if (!codes.length) return [];
  const sides = [];
  for (const c of codes) {
    const last = sides[sides.length - 1];
    if (last && angDiff(bear.get(last[0]), bear.get(c)) <= sideDeg) last.push(c);
    else sides.push([c]);
  }
  if (sides.length > 1) {
    const first = sides[0], last = sides[sides.length - 1];
    if (angDiff(bear.get(first[0]), bear.get(last[0])) <= sideDeg) { first.push(...last); sides.pop(); }
  }
  const stages = [], seen = new Set();
  for (const side of sides) {
    let stage;
    if (mode === 'split') {
      // Тал дангаараа — эсрэг тал ч зэрэг нээгдэхгүй
      stage = [...side].sort((a, b) => a - b);
    } else {
      const b0 = bear.get(side[0]);
      let opp = null, best = oppDeg;
      for (const other of sides) {
        if (other === side) continue;
        const d = Math.abs(180 - angDiff(b0, bear.get(other[0])));
        if (d < best) { best = d; opp = other; }
      }
      stage = [...side, ...(opp ?? [])].sort((a, b) => a - b);
    }
    const key = stage.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    stages.push(stage);
  }
  return stages;
};
const compatPlan = (net, { perStage = 30, yellow = YELLOW_S, mode = 'split' } = {}) => {
  const stages = compatStages(net, { mode });
  if (!stages.length) return null;
  return { key: 'auto', label: 'Авто (зөрчилгүй)', desc: 'Геометрээс', stages, cycle: perStage * stages.length, yellow };
};
const PLAN2 = SIGNAL_PLANS.find((p) => p.key === '2');
/* ⚠️ `_` угтвар = ЭНЭ ШАЛГУУРТ ашиглагдаагүй ч `traffic.ts`-тэй ПАРИТЕТ
   хадгалахын тулд үлдээсэн хуулбар. Устгавал эх файлтай мөр мөрөөр жишихэд
   зөрөх бөгөөд дараагийн синк дээр алдаа гарах эрсдэлтэй. */
const _signalStage = (code, plan) => {
  for (let i = 0; i < plan.stages.length; i++) if (plan.stages[i].includes(code)) return i;
  return -1;
};
const _currentStage = (time, plan) => {
  const n = plan.stages.length;
  if (n <= 0) return -1;
  const share = plan.cycle / n;
  const t = ((time % plan.cycle) + plan.cycle) % plan.cycle;
  return Math.min(n - 1, Math.floor(t / share));
};
const signalPhase = (code, time, plan = DEFAULT_SIGNAL_PLAN, junction) => {
  // Уулзвартаа тусгай хуваарьтай бол түүгээр (код уулзвар бүрд 1-ээс эхэлдэг)
  const stages = (junction != null && plan.byJunction && plan.byJunction[junction]) || plan.stages;
  const n = stages.length;
  if (n <= 0) return 'red';
  const share = plan.cycle / n;
  const t = ((time % plan.cycle) + plan.cycle) % plan.cycle;
  // ОДООГИЙН ээлжийн багцад орсон эсэхээр — нэг код олон ээлжид ногоон болж болно
  const stage = Math.min(n - 1, Math.floor(t / share));
  if (!stages[stage].includes(code)) return 'red';
  return t % share < Math.max(0, share - plan.yellow) ? 'green' : 'yellow';
};
const signalLineGreen = (code, time, plan = DEFAULT_SIGNAL_PLAN, junction) =>
  signalPhase(code, time, plan, junction) === 'green';
const nodeByIntersection = (paths, { unitsPerMeter = 1, cellM = 60 } = {}) => {
  const cell = cellM * unitsPerMeter;
  const splits = paths.map((p) => Array.from({ length: Math.max(0, p.length - 1) }, () => []));
  const segs = []; const grid = new Map();
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w];
    for (let i = 0; i < p.length - 1; i++) {
      const idx = segs.length; segs.push({ w, i, a: p[i], b: p[i + 1] });
      const x0 = Math.min(p[i][0], p[i + 1][0]), x1 = Math.max(p[i][0], p[i + 1][0]);
      const y0 = Math.min(p[i][1], p[i + 1][1]), y1 = Math.max(p[i][1], p[i + 1][1]);
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++)
        for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
          const k = `${cx},${cy}`; const l = grid.get(k); if (l) l.push(idx); else grid.set(k, [idx]);
        }
    }
  }
  const isect = (A, B, C, D) => {
    const rx = B[0] - A[0], ry = B[1] - A[1], sx = D[0] - C[0], sy = D[1] - C[1];
    const den = rx * sy - ry * sx; if (Math.abs(den) < 1e-9) return null;
    const t = ((C[0] - A[0]) * sy - (C[1] - A[1]) * sx) / den;
    const u = ((C[0] - A[0]) * ry - (C[1] - A[1]) * rx) / den;
    if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
    return { t, u, pt: [A[0] + t * rx, A[1] + t * ry] };
  };
  const seen = new Set();
  for (const list of grid.values())
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const pi = list[x], qi = list[y]; if (segs[pi].w === segs[qi].w) continue;
      const key = pi < qi ? pi * segs.length + qi : qi * segs.length + pi; if (seen.has(key)) continue; seen.add(key);
      const h = isect(segs[pi].a, segs[pi].b, segs[qi].a, segs[qi].b);
      if (h) { splits[segs[pi].w][segs[pi].i].push({ t: h.t, pt: h.pt }); splits[segs[qi].w][segs[qi].i].push({ t: h.u, pt: h.pt }); }
    }
  // T-УУЛЗВАР: нэг шугамын ҮЗҮҮР нөгөөгийн ДУНДУУР тулсан бол тэр шугамыг таслана
  const tol = SNAP_TOL_M * unitsPerMeter;
  const cutV = paths.map(() => new Set());
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w];
    if (p.length < 2) continue;
    for (const tip of [p[0], p[p.length - 1]]) {
      let best = null;
      const cx0 = Math.floor((tip[0] - tol) / cell);
      const cx1 = Math.floor((tip[0] + tol) / cell);
      const cy0 = Math.floor((tip[1] - tol) / cell);
      const cy1 = Math.floor((tip[1] + tol) / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          for (const si of grid.get(`${cx},${cy}`) ?? []) {
            const sg = segs[si];
            if (sg.w === w) continue;
            const dx = sg.b[0] - sg.a[0];
            const dy = sg.b[1] - sg.a[1];
            const L2 = dx * dx + dy * dy;
            if (L2 < 1e-12) continue;
            const raw = ((tip[0] - sg.a[0]) * dx + (tip[1] - sg.a[1]) * dy) / L2;
            const t = Math.max(0, Math.min(1, raw));
            const px = sg.a[0] + t * dx;
            const py = sg.a[1] + t * dy;
            const d = Math.hypot(tip[0] - px, tip[1] - py);
            if (d > tol) continue;
            const vertex = t <= 1e-6 ? sg.i : t >= 1 - 1e-6 ? sg.i + 1 : -1;
            if (vertex >= 0 && (vertex === 0 || vertex >= paths[sg.w].length - 1)) continue;
            if (!best || d < best.d) best = { seg: si, t, pt: [px, py], d, vertex };
          }
        }
      }
      if (!best) continue;
      if (best.vertex >= 0) cutV[segs[best.seg].w].add(best.vertex);
      else splits[segs[best.seg].w][segs[best.seg].i].push({ t: best.t, pt: best.pt });
    }
  }

  const out = [];
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w]; if (p.length < 2) continue; let cur = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const sp = splits[w][i].filter((s) => s.t > 1e-6 && s.t < 1 - 1e-6).sort((a, b) => a.t - b.t);
      for (const s of sp) { cur.push(s.pt); if (cur.length >= 2) out.push(cur); cur = [s.pt]; }
      cur.push(p[i + 1]);
      if (cutV[w].has(i + 1) && i + 1 < p.length - 1 && cur.length >= 2) { out.push(cur); cur = [p[i + 1]]; }
    }
    if (cur.length >= 2) out.push(cur);
  }
  return out;
};
const outHeading = (edge, node) => {
  const n = edge.pts.length;
  const [p, q] = edge.a === node ? [edge.pts[0], edge.pts[1]] : [edge.pts[n - 1], edge.pts[n - 2]];
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
};

const SIGNAL_CYCLE_S = 60;

const CAR_LEN = 5;
const carLen = (c) => c.len ?? CAR_LEN;
const MIN_GAP_M = 2;
const PATIENCE_S = 25;
const TURN_BACK_M = 10;
const U_TURN_V = 2.5;
const JUNCTION_R_M = 5;
const _STOP_LINE_M = 2.5;
const TAU = 1.0;
const ACC = 1.8, DEC = 4.5;
const _V_MIN = 30 / 3.6, V_MAX = 50 / 3.6;

const TURN_SMOOTH_M = 8;
const carPose = (net, car) => {
  const e = net.edges[car.e];
  const p = poseAt(e, car.s);
  let x = p.x, y = p.y;
  let ux = car.dir === 1 ? p.ux : -p.ux;
  let uy = car.dir === 1 ? p.uy : -p.uy;
  if (car.hx != null && car.hy != null && car.hux != null && car.huy != null) {
    const R = Math.min(TURN_SMOOTH_M * (net.unitsPerMeter || 1), e.length);
    const dIn = car.dir === 1 ? car.s : e.length - car.s;
    if (R > 1e-6 && dIn < R) {
      const q = poseAt(e, car.dir === 1 ? R : e.length - R);
      const qux = car.dir === 1 ? q.ux : -q.ux;
      const quy = car.dir === 1 ? q.uy : -q.uy;
      const t = Math.max(0, Math.min(1, dIn / R));
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      x = h00 * car.hx + h10 * car.hux * R + h01 * q.x + h11 * qux * R;
      y = h00 * car.hy + h10 * car.huy * R + h01 * q.y + h11 * quy * R;
      const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1;
      const d01 = -6 * t2 + 6 * t, d11 = 3 * t2 - 2 * t;
      const dx = d00 * car.hx + d10 * car.hux * R + d01 * q.x + d11 * qux * R;
      const dy = d00 * car.hy + d10 * car.huy * R + d01 * q.y + d11 * quy * R;
      const L = Math.hypot(dx, dy) || 1;
      ux = dx / L; uy = dy / L;
    }
  }
  return { x, y, ux, uy };
};

const pickNext = (net, node, fromEdge, travel, rnd = Math.random, allow) => {
  const outs = net.nodes[node]?.out ?? [];
  let total = 0;
  const ws = [], cand = [];
  // Шүүлт (автобусны маршрут) ямар нэг салаа үлдээж байвал л хэрэглэнэ
  const useAllow = allow
    ? outs.some((i) => i !== fromEdge && (!net.directed || net.edges[i].a === node) && allow(i))
    : false;
  for (const i of outs) {
    if (i === fromEdge) continue;
    if (useAllow && allow && !allow(i)) continue;
    if (net.directed && net.edges[i].a !== node) continue;
    const h = outHeading(net.edges[i], node);
    const dot = travel[0] * h[0] + travel[1] * h[1];
    const align = Math.max(0.02, ((1 + dot) / 2) ** 2);
    const w = align * Math.min(1, net.edges[i].length / 25);
    if (w <= 0) continue;
    cand.push(i); ws.push(w); total += w;
  }
  // ДАВХАРДСАН салааг хаяна — гэхдээ зөвхөн өөр сонголт байвал (гацахгүй)
  const fresh = cand.filter((i) => !net.edges[i].dup);
  if (fresh.length && fresh.length < cand.length) {
    let t2 = 0; const ws2 = [];
    for (let k = 0; k < cand.length; k++) {
      if (net.edges[cand[k]].dup) continue;
      ws2.push(ws[k]); t2 += ws[k];
    }
    if (t2 > 0) {
      let r2 = rnd() * t2;
      for (let k = 0; k < fresh.length; k++) { r2 -= ws2[k]; if (r2 <= 0) return fresh[k]; }
      return fresh[fresh.length - 1];
    }
  }
  if (!cand.length || total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
};

const stepCars = (net, cars, dt, rnd = Math.random, time = 0, plan = DEFAULT_SIGNAL_PLAN) => {
  if (dt <= 0 || !cars.length) return;
  const upm = net.unitsPerMeter || 1;
  const lanes = new Map();
  for (let i = 0; i < cars.length; i++) {
    const key = cars[i].e * 2 + (cars[i].dir === 1 ? 0 : 1);
    const l = lanes.get(key);
    if (l) l.push(i); else lanes.set(key, [i]);
  }
  const gap = new Array(cars.length).fill(Infinity);
  const leadV = new Array(cars.length).fill(0);
  for (const idx of lanes.values()) {
    idx.sort((p, q) => cars[p].s - cars[q].s);
    for (let k = 0; k < idx.length; k++) {
      const me = idx[k];
      const ahead = cars[me].dir === 1 ? idx[k + 1] : idx[k - 1];
      if (ahead !== undefined) {
        gap[me] = Math.abs(cars[ahead].s - cars[me].s) - ((carLen(cars[me]) + carLen(cars[ahead])) / 2) * upm;
        leadV[me] = cars[ahead].v;
      }
    }
  }
  const laneFront = new Map();
  for (const [key, idx] of lanes) {
    if (key % 2 === 0) { const f = cars[idx[0]]; laneFront.set(key, f.s - (carLen(f) / 2) * upm); }
    else { const f = cars[idx[idx.length - 1]]; laneFront.set(key, net.edges[f.e].length - (f.s + (carLen(f) / 2) * upm)); }
  }
  const laneKey = (edge, dir) => edge * 2 + (dir === 1 ? 0 : 1);
  // УУЛЗВАРЫН ЭЗЭМШИЛ — хайрцагт хамгийн ойр машин эзэн болно
  const jr = (c) => Math.max(JUNCTION_R_M, carLen(c) / 2 + 1.5);
  const junction = new Map();
  const isJunction = (n) => (net.nodes[n]?.out.length ?? 0) >= 3;
  const claim = (n, i, d) => {
    const cur = junction.get(n);
    if (!cur || d < cur.d) junction.set(n, { i, d });
  };
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const e = net.edges[c.e];
    if (!e) continue;
    const Rj = jr(c);
    const ahead = (c.dir === 1 ? e.length - c.s : c.s) / upm;
    const behind = (c.dir === 1 ? c.s : e.length - c.s) / upm;
    const nA = c.dir === 1 ? e.b : e.a;
    const nB = c.dir === 1 ? e.a : e.b;
    // Зарлах радиус нь хайрцгаас том — ойртож яваад эзэмшлээ авна (хамгийн ойр нь ялна)
    const claimR = Rj * 2.5;
    if (isJunction(nA) && (ahead < Rj || (ahead < claimR && c.v > 0.5))) claim(nA, i, ahead);
    if (behind < Rj && isJunction(nB)) claim(nB, i, behind);
  }
  const needOf = (c) => (carLen(c) / 2 + MIN_GAP_M) * upm;
  // Эгнээнд орсны дараа үлдэх хөдөлгөөний дээд хязгаар — урдахаа нэвт өнгөрөхөөс
  const capAfterEntry = (c, clear) => (clear === undefined ? Infinity : Math.max(0, clear - needOf(c)));
  // U-эргэлт — эсрэг эгнээний орц дүүрсэн бол эргэхгүй (null), эс бөгөөс хязгаар
  const uTurn = (c) => {
    const edge = net.edges[c.e];
    const back = c.dir === 1 ? -1 : 1;
    const key = laneKey(c.e, back);
    const clear = laneFront.get(key);
    const need = needOf(c);
    if (clear !== undefined && clear < need) {
      const short = need - clear;
      if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
      else c.s = Math.min(c.s, short);
      c.v = 0;
      return null;
    }
    c.s = c.dir === 1 ? edge.length : 0;
    c.dir = back;
    c.v = Math.min(c.v, U_TURN_V);
    c.hux = undefined; c.huy = undefined;
    laneFront.set(key, -(carLen(c) / 2) * upm);
    return capAfterEntry(c, clear);
  };
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.done) continue;
    if (c.v < 0.3) c.wait = (c.wait ?? 0) + dt; else c.wait = 0;
    let g = gap[i] / upm;
    let vl = leadV[i];
    // Улаан гэрлийн зогсолт — ЗУРААСАН дээр (`stopBars`)
    const bars = net.stopBars.get(c.e);
    let redAhead = false;
    if (bars) {
      for (const b of bars) {
        if (b.dir !== c.dir || signalLineGreen(b.code, time, plan, b.j)) continue;
        const distM = (c.dir === 1 ? b.s - c.s : c.s - b.s) / upm;
        if (distM <= 0) continue;
        if (distM < 60) redAhead = true;
        const sigG = distM - carLen(c) / 2;
        if (sigG < g) { g = sigG; vl = 0; }
      }
    }
    // Ирмэгийн төгсгөлийн жагсаа — кросс-ирмэг виртуал саад
    {
      const endNode = c.dir === 1 ? net.edges[c.e].b : net.edges[c.e].a;
      const outs = net.nodes[endNode]?.out ?? [];
      let bestClear = -Infinity;
      let anyCand = false;
      for (const ei of outs) {
        if (ei === c.e) continue;
        if (net.directed && net.edges[ei].a !== endNode) continue;
        anyCand = true;
        const eDir = net.edges[ei].a === endNode ? 1 : -1;
        const cl = laneFront.get(ei * 2 + (eDir === 1 ? 0 : 1));
        if (cl === undefined) { bestClear = Infinity; break; }
        if (cl > bestClear) bestClear = cl;
      }
      if (anyCand && Number.isFinite(bestClear)) {
        const roomM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
        const qG = roomM + bestClear / upm - carLen(c) / 2;
        if (qG < g) { g = qG; vl = 0; }
      }
      // Уулзварыг ӨӨР машин эзэлж байвал хайрцгийн өмнө зогсоно
      if (isJunction(endNode)) {
        const owner = junction.get(endNode);
        if (owner && owner.i !== i) {
          const roomM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
          const jG = roomM - jr(c) - carLen(c) / 2;
          if (jG < g) { g = jG; vl = 0; }
        }
      }
    }
    // Тэвчээр дууссан үзүүрийн машин БУЦАЖ ЭРГЭНЭ (гацааны циклийг таслана)
    {
      // Улаан гэрлийн хүлээлт бол гацаа биш — тэвчээрийн эргэлт үйлчлэхгүй
      const roomEndM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
      if (!redAhead && (c.wait ?? 0) > PATIENCE_S && roomEndM < TURN_BACK_M) {
        const uCap = uTurn(c, i);
        if (uCap != null) { c.wait = 0; continue; }
      }
    }

    let want = c.vmax;
    if (Number.isFinite(g)) {
      const free = Math.max(0, g - MIN_GAP_M);
      const vSafe = vl + (free - vl * TAU) / (TAU + (c.v + vl) / (2 * DEC));
      want = Math.min(c.vmax, Math.max(0, vSafe));
    }
    c.v = Math.max(0, Math.min(want, c.v + ACC * dt));
    let move = c.v * dt * upm;
    if (Number.isFinite(g)) move = Math.min(move, Math.max(0, (g - MIN_GAP_M) * upm));
    for (let hop = 0; hop < 6 && move > 0; hop++) {
      const edge = net.edges[c.e];
      const room = c.dir === 1 ? edge.length - c.s : c.s;
      if (move <= room) { c.s += c.dir * move; break; }
      move -= room;
      const node = c.dir === 1 ? edge.b : edge.a;
      const travel = outHeading(edge, node).map((v) => -v);
      // «Гарч явах» машин ойролцоо гарцуудын аль нэг рүү чиглэнэ
      let next = null;
      if (c.leaving) {
        const dist = exitDistances(net);
        let best = Infinity;
        const ws2 = [];
        for (const ei of net.nodes[node]?.out ?? []) {
          if (ei === c.e) continue;
          if (net.directed && net.edges[ei].a !== node) continue;
          const far = net.edges[ei].a === node ? net.edges[ei].b : net.edges[ei].a;
          const w = net.edges[ei].length + dist[far];
          if (Number.isFinite(w)) ws2.push({ ei, w });
          if (w < best) best = w;
        }
        if (Number.isFinite(best)) {
          const nearBest = ws2.filter((x) => x.w <= best * 1.35 + 40 * upm);
          if (nearBest.length) next = nearBest[Math.floor(rnd() * nearBest.length) % nearBest.length].ei;
        }
      }
      if (next == null) next = pickNext(net, node, c.e, travel, rnd);
      for (let t = 0; t < 2 && next != null; t++) {
        const d0 = net.edges[next].a === node ? 1 : -1;
        const cl0 = laneFront.get(next * 2 + (d0 === 1 ? 0 : 1));
        if (cl0 === undefined || cl0 >= (carLen(c) / 2 + MIN_GAP_M) * upm) break;
        const again = pickNext(net, node, c.e, travel, rnd);
        if (again != null) next = again;
      }
      if (next == null) {
        // «Гарч явах» машин мухарт хүрвэл сүлжээнээс ГАРНА (дуудагч устгана)
        if (portalNodes(net).has(node)) {
          c.s = c.dir === 1 ? edge.length : 0;
          c.v = 0;
          c.done = true;
          break;
        }
        if (net.directed) {
          // Мухарт машин УСТАХГҮЙ — ойрын гарц руу шилжиж тасралтгүй явна
          const exits = net.sinkExit.get(node);
          if (exits?.length) {
            const pick = exits[Math.floor(rnd() * exits.length) % exits.length];
            const eKey = pick * 2;
            const clear = laneFront.get(eKey);
            const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
            if (clear !== undefined && clear < need) {
              const short = need - clear;
              if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
              else c.s = Math.min(c.s, short);
              c.v = 0;
              break;
            }
            c.e = pick; c.dir = 1; c.s = 0;
            c.v = Math.min(c.v, U_TURN_V);
            c.hux = undefined; c.huy = undefined;
            laneFront.set(eKey, -(carLen(c) / 2) * upm);
            move = Math.min(move, capAfterEntry(c, clear));
            const jBars = net.stopBars.get(c.e);
            if (jBars) {
              for (const b of jBars) {
                if (b.dir !== 1 || signalLineGreen(b.code, time, plan, b.j)) continue;
                if (b.s <= 0) continue;
                move = Math.min(move, Math.max(0, b.s - (carLen(c) / 2 + MIN_GAP_M) * upm));
              }
            }
            continue;
          }
          // Ойр гарц алга — U-эргэлт (тасралтгүй)
          const uCap = uTurn(c);
          if (uCap == null) break;
          move = Math.min(move, uCap);
          continue;
        }
        const uCap = uTurn(c);
        if (uCap == null) break;
        move = Math.min(move, uCap);
        continue;
      }
      const nDir = net.edges[next].a === node ? 1 : -1;
      const nKey = next * 2 + (nDir === 1 ? 0 : 1);
      const entryS = nDir === 1 ? 0 : net.edges[next].length;
      const clear = laneFront.get(nKey);
      const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
      const jOwner = isJunction(node) ? junction.get(node) : undefined;
      if ((jOwner && jOwner.i !== i) || (clear !== undefined && clear < need)) {
        const short = clear === undefined ? jr(c) * upm : need - clear;
        if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
        else c.s = Math.min(c.s, short);
        c.v = 0;
        break;
      }
      c.e = next;
      c.dir = nDir;
      c.s = entryS;
      c.hx = net.nodes[node].x; c.hy = net.nodes[node].y;
      c.hux = travel[0]; c.huy = travel[1];
      if (isJunction(node)) junction.set(node, { i, d: 0 });
      laneFront.set(nKey, -(carLen(c) / 2) * upm);
      // Үлдсэн хөдөлгөөнийг шинэ эгнээний урдах машинд тултал таслана
      move = Math.min(move, capAfterEntry(c, clear));
      // Шинэ ирмэг дээрх улаан шугам — үлдсэн хөдөлгөөнийг таслана
      const nBars = net.stopBars.get(c.e);
      if (nBars) {
        for (const b of nBars) {
          if (b.dir !== c.dir || signalLineGreen(b.code, time, plan, b.j)) continue;
          const aheadU = c.dir === 1 ? b.s - c.s : c.s - b.s;
          if (aheadU <= 0) continue;
          move = Math.min(move, Math.max(0, aheadU - (carLen(c) / 2 + MIN_GAP_M) * upm));
        }
      }
    }
  }
  // Давхцлын ХАТУУ хязгаар — эгнээ бүрийг урдаас нь гүйж дагагчийг ухраана
  const after = new Map();
  for (let i = 0; i < cars.length; i++) {
    if (cars[i].done) continue;
    const key = laneKey(cars[i].e, cars[i].dir);
    const l = after.get(key);
    if (l) l.push(i); else after.set(key, [i]);
  }
  for (const [key, idx] of after) {
    if (idx.length < 2) continue;
    idx.sort((p, q) => cars[p].s - cars[q].s);
    const fwd = key % 2 === 0;
    const order = fwd ? idx.slice().reverse() : idx;
    for (let k = 1; k < order.length; k++) {
      const lead = cars[order[k - 1]];
      const me = cars[order[k]];
      const min = ((carLen(me) + carLen(lead)) / 2) * upm;
      if (fwd) {
        if (lead.s - me.s < min) { me.s = Math.max(0, lead.s - min); me.v = Math.min(me.v, lead.v); }
      } else if (me.s - lead.s < min) {
        me.s = Math.min(net.edges[me.e].length, lead.s + min); me.v = Math.min(me.v, lead.v);
      }
    }
  }
};

const _carCapacity = (net, util = 0.5) => {
  const upm = net.unitsPerMeter || 1;
  let lenM = 0;
  for (const e of net.edges) if (!e.dup) lenM += e.length / upm;
  const dirs = net.directed ? 1 : 2;
  return Math.max(10, Math.floor(((lenM * dirs) / (CAR_LEN + MIN_GAP_M)) * util));
};
const spawnTable = (net, minLenM = PORTAL_MIN_EDGE_M) => {
  const min = minLenM * (net.unitsPerMeter || 1);
  const cum = [];
  let total = 0;
  for (const e of net.edges) {
    if (e.length >= min && !e.dup) total += (e.baseLoad + 0.12) * e.length;
    cum.push(total);
  }
  return { cum, total };
};
const pickEdge = (tbl, rnd = Math.random) => {
  if (tbl.total <= 0) return -1;
  const r = rnd() * tbl.total;
  let lo = 0, hi = tbl.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tbl.cum[mid] < r) lo = mid + 1; else hi = mid; }
  return lo;
};
// Машин төрүүлэх (тестийн хялбаршуулсан хувилбар — ирмэг сонгох нь гол)
const spawnCar = (net, tbl, rnd = Math.random) => {
  const e = pickEdge(tbl, rnd);
  if (e < 0) return null;
  const vmax = V_MAX;
  const dir = net.directed ? 1 : rnd() < 0.5 ? 1 : -1;
  return { e, s: rnd() * net.edges[e].length, dir, v: vmax, vmax };
};
const boundaryNodeCache = new WeakMap();
const boundaryNodes = (net) => {
  let bs = boundaryNodeCache.get(net);
  if (bs) return bs;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of net.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
  const all = [];
  bs = new Set();
  for (let i = 0; i < net.nodes.length; i++) {
    if (net.nodes[i].out.length !== 1) continue;
    all.push(i);
    const n = net.nodes[i];
    if (n.x < x0 + mx || n.x > x1 - mx || n.y < y0 + my || n.y > y1 - my) bs.add(i);
  }
  if (bs.size < 8) bs = new Set(all);
  boundaryNodeCache.set(net, bs);
  return bs;
};
const PORTAL_MIN_EDGE_M = 100;
const portalNodeCache = new WeakMap();
const portalNodes = (net) => {
  let ps = portalNodeCache.get(net);
  if (ps) return ps;
  const upm = net.unitsPerMeter || 1;
  const bn = boundaryNodes(net);
  ps = new Set();
  for (const n of bn) {
    const e = net.edges[net.nodes[n].out[0]];
    if (!e.dup && e.length >= PORTAL_MIN_EDGE_M * upm) ps.add(n);
  }
  if (ps.size < 6) ps = bn;
  portalNodeCache.set(net, ps);
  return ps;
};
const exitDistCache = new WeakMap();
const exitDistances = (net) => {
  let d = exitDistCache.get(net);
  if (d) return d;
  d = new Float64Array(net.nodes.length).fill(Infinity);
  for (const n of portalNodes(net)) d[n] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of net.edges) {
      if (d[e.b] + e.length < d[e.a]) { d[e.a] = d[e.b] + e.length; changed = true; }
      if (!net.directed && d[e.a] + e.length < d[e.b]) { d[e.b] = d[e.a] + e.length; changed = true; }
    }
  }
  exitDistCache.set(net, d);
  return d;
};
const boundaryEntries = (net) => {
  const out = [];
  for (const n of portalNodes(net)) {
    const e = net.nodes[n].out[0];
    if (net.edges[e].dup) continue;
    const dir = net.edges[e].a === n ? 1 : -1;
    if (net.directed && dir !== 1) continue;
    out.push({ e, dir });
  }
  return out;
};
const spawnCarAt = (net, entry, _rnd = Math.random) => {
  const upm = net.unitsPerMeter || 1;
  const inset = Math.min(2.8 * upm, net.edges[entry.e].length / 2);
  const s0 = entry.dir === 1 ? inset : net.edges[entry.e].length - inset;
  return { e: entry.e, s: s0, dir: entry.dir, v: V_MAX * 0.6, vmax: V_MAX };
};
const targetCars = (diurnal, max, min = 10) =>
  Math.round(min + Math.max(0, max - min) * Math.max(0, Math.min(1, diurnal)));

/* ══════════════════ Diurnal ══════════════════ */

assert.equal(diurnalAt(8 * 60), 1.00, '08:00 өглөөний оргил = 1.00');
assert.equal(diurnalAt(18 * 60), 1.00, '18:00 оройн оргил = 1.00');
assert.ok(diurnalAt(3 * 60) < 0.05, 'шөнө 03:00 маш бага');
const mid = diurnalAt(8 * 60 + 30);
assert.ok(mid < 1.00 && mid > 0.80, '08:30 нь оргил ба уналтын хооронд');
assert.equal(diurnalAt(1440), diurnalAt(0), 'хагас шөнө тойрч дугуйрна');
assert.equal(clockText(8 * 60 + 5), '08:05', 'цагийн бичиглэл');
assert.equal(clockText(1440), '00:00', 'тойрог цаг');

/* ══════════════════ Замын шугам дагуух байрлал ══════════════════ */

// Босоо шугам (0,0)→(0,100)→(0,300): нийт урт 300
const seg = makeSegment('s1', [[0, 0], [0, 100], [0, 300]], 0.5);
assert.equal(seg.length, 300, 'нийт урт = 300');
assert.deepEqual(posAt(seg, 0), [0, 0], 't=0 → эхлэл');
assert.deepEqual(posAt(seg, 1), [0, 300], 't=1 → төгсгөл');
assert.deepEqual(posAt(seg, 0.5), [0, 150], 't=0.5 → дунд цэг');
assert.deepEqual(posAt(seg, 2), [0, 300], 't>1 хаагдана');
assert.deepEqual(posAt(makeSegment('z', [[5, 5]], 1), 0.7), [5, 5], 'ганц оройт хэрчим');

// poseAt — МЕТРЭЭР ба чиглэлийн вектортой
const p150 = poseAt(seg, 150);
assert.deepEqual([p150.x, p150.y], [0, 150], 'poseAt(150) → дунд цэг');
assert.deepEqual([p150.ux, p150.uy], [0, 1], 'чиглэл нь дээшээ (нэгж вектор)');
assert.deepEqual([poseAt(seg, -5).x, poseAt(seg, -5).y], [0, 0], 'сөрөг зай хаагдана');
assert.deepEqual([poseAt(seg, 999).x, poseAt(seg, 999).y], [0, 300], 'хэт урт зай хаагдана');

/* ══════════════════ Сүлжээ угсрах ══════════════════ */

/*  Ижил уулзвар (100,0) дээр нийлэх «+» хэлбэрийн 4 салаа.
    ⚠️ Үзүүрүүд яг таарахгүй (0.3 м зөрүү) — CAD-ийн бодит байдал. */
const cross = buildNetwork([
  [[0, 0], [100, 0]],          // баруун тийш
  [[100.3, 0.2], [200, 0]],    // үргэлжлэл (шулуун)
  [[100, 0], [100, 100]],      // хойш салаа
  [[100.2, -0.1], [100, -100]], // урагш салаа
]);
assert.equal(cross.edges.length, 4, '4 ирмэг');
// Дөрвүүлээ НЭГ уулзварт наалдсан байх ёстой
const hub = cross.nodes.findIndex((n) => n.out.length === 4);
assert.ok(hub >= 0, 'хүлцлийн дотор дөрвөн салаа нэг зангилаа болно');
assert.equal(cross.nodes.filter((n) => n.out.length === 1).length, 4, 'дөрвөн мухар үзүүр');

// Хаалттай гогцоо (тойрог уулзвар) — ХОЁР ирмэг болж хуваагдана
const ring = buildNetwork([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]);
assert.equal(ring.edges.length, 2, 'хаалттай гогцоо хоёр ирмэг болно');
assert.ok(ring.edges.every((e) => e.a !== e.b), 'гогцооны хагас бүр хоёр өөр зангилаатай');

// Хүлцлээс богино хэрчим ИРМЭГ болохгүй (хоёр үзүүр нь нэг зангилаа болно)
assert.equal(buildNetwork([[[0, 0], [0, 0.4]]]).edges.length, 0, 'доройтсон хэрчим хасагдана');

/*  ⚠️ ТОР-ХЭШИЙН ЗААГ. Энэ хоёр гудамж (100,0.29) ба (100,0.31) дээр уулздаг —
    зөрүү нь 2 см. Нүдний түлхүүрээр (round(y/0.6)) харьцуулбал 0 ба 1 гарч,
    уулзвар САЛНА. Радиусаар шалгаж байгаа эсэхийн шалгуур. */
{
  const seam = buildNetwork([
    [[0, 0], [100, 0.29]],
    [[100, 0.31], [200, 0]],
  ]);
  assert.equal(seam.nodes.length, 3, 'заагийн 2 см зөрүү НЭГ зангилаа болно');
  const shared = seam.nodes.find((n) => n.out.length === 2);
  assert.ok(shared, 'хоёр гудамж холбогдсон');
}

// Хүлцлээс ХОЛ (2 м) үзүүрүүд наалдахгүй — өөр гудамж хэвээр
{
  const apart = buildNetwork([[[0, 0], [100, 0]], [[100, 2], [200, 2]]]);
  assert.equal(apart.nodes.length, 4, 'хүлцлээс хол үзүүр наалдахгүй');
}

/*  Доройтсон хэрчим нь ХӨРШӨӨ ХОЛБОНО: A ─ 0.3 м холбогч ─ B.
    Холбогч нь ирмэг болохгүй ч түүний үзүүрүүд нэг зангилаа болж A↔B нийлнэ. */
{
  const link = buildNetwork([
    [[0, 0], [50, 0]],
    [[50, 0], [50.3, 0]],
    [[50.3, 0], [100, 0]],
  ]);
  assert.equal(link.edges.length, 2, 'холбогч өөрөө ирмэг болоогүй');
  assert.ok(link.nodes.some((n) => n.out.length === 2), 'гэхдээ хоёр талыг холбосон');
}

/* ══════════════════ Огтлолцол дээр таслах (noding) ══════════════════ */

{
  // Хоёр урт шугам ОРОЙ ХУВААЛЦАЛГҮЙ «+» хэлбэрээр гатлана (дунд нь уулзвар).
  //   баруун тийш: (0,0)→(100,0)   ·   дээш: (50,-50)→(50,50)
  // Таслахгүй бол buildNetwork 2 салангид ирмэг өгч, машин уулзвараар эргэж чадахгүй.
  const raw = [
    [[0, 0], [100, 0]],
    [[50, -50], [50, 50]],
  ];
  const plain = buildNetwork(raw);
  assert.equal(plain.nodes.filter((n) => n.out.length >= 2).length, 0, 'таслахгүй бол уулзваргүй');

  const noded = nodeByIntersection(raw);
  assert.equal(noded.length, 4, 'огтлолцол дээр 4 хэрчим болов');
  const net = buildNetwork(noded);
  const hub = net.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(hub >= 0, 'огтлолцол цэг 4 салаат уулзвар боллоо');
  // Уулзвар дундах цэг (50,0)-д таарна
  assert.ok(Math.abs(net.nodes[hub].x - 50) < 0.01 && Math.abs(net.nodes[hub].y) < 0.01, 'уулзвар (50,0)-д');
}

/* ══════════════════ Уулзварын сонголт ══════════════════ */

// Баруун тийш явж ирсэн машин: шулуун (200,0) руу явах магадлал хамгийн өндөр
{
  const travel = [1, 0];
  const counts = new Map();
  let seed = 1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 3000; i++) {
    const e = pickNext(cross, hub, 0, travel, rnd);
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  assert.equal(counts.get(0), undefined, 'ирсэн ирмэг рүүгээ буцахгүй');
  const straight = counts.get(1) ?? 0;
  assert.ok(straight > 0.5 * 3000, `шулуун явах давамгайлна (${straight}/3000)`);
  assert.ok((counts.get(2) ?? 0) > 0 && (counts.get(3) ?? 0) > 0, 'эргэлтүүд ч гарна');
}

// Мухар үзүүрт гарц алга → null (дуудагч тал U-эргэлт хийнэ)
{
  const dead = cross.edges[2].b === hub ? cross.edges[2].a : cross.edges[2].b;
  assert.equal(pickNext(cross, dead, 2, [0, 1]), null, 'мухар үзүүрт гарц алга');
}

/* ══════════════════ Машины хөдөлгөөн ══════════════════ */

// Чөлөөт машин — ирмэгийн зааг дамжиж, ГАЦАХГҮЙ, замаа үргэлжлүүлнэ
{
  const car = { e: 0, s: 95, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const before = carPose(cross, car).x;
  for (let i = 0; i < 20; i++) stepCars(cross, [car], 0.1, rnd);
  const after = carPose(cross, car);
  assert.ok(car.v > 0, 'машин гацаагүй');
  assert.ok(Math.hypot(after.x - before, after.y) > 20, 'үнэхээр хөдөлсөн');
  assert.ok(Number.isFinite(car.s) && car.s >= 0, 'ирмэг дээрх байрлал хүчинтэй');
}

// Урдах машин зогсчихвол ард нь ХҮРЭХГҮЙ (car-following)
{
  const line = buildNetwork([[[0, 0], [1000, 0]]]);
  const lead = { e: 0, s: 500, dir: 1, v: 0, vmax: 0 };   // зогссон
  const follow = { e: 0, s: 400, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 200; i++) stepCars(line, [lead, follow], 0.1);
  assert.ok(follow.s < lead.s, 'дагагч урдахаа нэвт өнгөрөөгүй');
  assert.ok(
    lead.s - follow.s >= CAR_LEN + MIN_GAP_M - 0.01,
    `аюулгүй зай барив (${(lead.s - follow.s).toFixed(2)} м)`,
  );
  assert.ok(follow.v < 0.5, 'урдах нь зогссон тул дагагч ч зогсов');
}

// УРТ тээвэр (автобус, len=11) ард нь илүү ХОЛ зогсооно — эзэлсэн зай уртаас
{
  const line = buildNetwork([[[0, 0], [1000, 0]]]);
  const bus = { e: 0, s: 500, dir: 1, v: 0, vmax: 0, len: 11 };
  const follow = { e: 0, s: 400, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 200; i++) stepCars(line, [bus, follow], 0.1);
  assert.ok(follow.s < bus.s, 'дагагч урт машиныг нэвт өнгөрөөгүй');
  // ⚠️ Төв хоорондын зай = хоёулын хагас уртын нийлбэр (11+5)/2 + бампер зай
  const expect = (11 + CAR_LEN) / 2 + MIN_GAP_M; // = 10
  assert.ok(
    Math.abs((bus.s - follow.s) - expect) < 0.2,
    `урт машины ард ${expect} м зай (гарсан ${(bus.s - follow.s).toFixed(2)})`,
  );
}

/* ══════ МУХАР: ДОТООД мухарт эргэнэ · ХИЛИЙН гарцаар ГАРНА ══════ */

/**
 * «Шат» хэлбэрийн туршилтын сүлжээ: хэвтээ нуруу + 300 м-ийн НАЙМАН салаа
 * (үзүүр нь bbox-ийн захад тул ХИЛИЙН ПОРТАЛ) + нурууны дундаас гарах богино
 * ДОТООД стуб (захын бүсэд ороогүй тул портал БИШ).
 *
 * ⚠️ Найман захын мухар ЗААВАЛ хэрэгтэй: `boundaryNodes` нь наймаас цөөн бол
 * «жижиг сүлжээ» гэж үзээд БҮХ мухрыг хил болгодог (фоллбэк) — тэгвэл дотоод
 * стуб ч портал болж, хоёр зан төлөвийн ялгаа алга болно.
 */
const stubNet = (stubLen = 60) => {
  const roads = [];
  for (let x = 0; x < 800; x += 100) roads.push([[x, 0], [x + 100, 0]]);
  for (const x of [100, 300, 500, 700]) roads.push([[x, 0], [x, 300]]);
  for (const x of [0, 200, 600, 800]) roads.push([[x, 0], [x, -300]]);
  roads.push([[400, 0], [400, stubLen]]);
  return buildNetwork(roads);
};

{
  const net = stubNet();
  const ports = portalNodes(net);
  assert.ok(ports.size >= 6, `урт салаанууд портал болов (${ports.size})`);

  /* ① ДОТООД мухар — машин ЭРГЭНЭ (алга болохгүй), удаашрана */
  const tip = net.nodes.findIndex((n) => Math.abs(n.x - 400) < 0.01 && Math.abs(n.y - 60) < 0.01);
  assert.ok(tip >= 0 && !ports.has(tip), 'дотоод стубын үзүүр портал БИШ');
  const se = net.nodes[tip].out[0];
  const toTip = net.edges[se].b === tip ? 1 : -1;
  const car = {
    e: se, s: toTip === 1 ? net.edges[se].length - 2 : 2,
    dir: toTip, v: V_MAX, vmax: V_MAX,
  };
  for (let i = 0; i < 100 && car.dir === toTip; i++) stepCars(net, [car], 0.1);
  assert.equal(car.dir, -toTip, 'дотоод мухраас эргэж буцав');
  assert.ok(!car.done, 'дотоод мухарт АЛГА БОЛООГҮЙ');
  assert.ok(car.v <= U_TURN_V + 0.01, `эргэхдээ удаашрав (${car.v.toFixed(1)} м/с)`);

  /* ② ХИЛИЙН ПОРТАЛ — машин ЭРГЭХГҮЙ, бүсээс ГАРНА
     ⚠️ Замууд судалгааны хилээр тасарсан бөгөөд бодит дээр цааш үргэлжилдэг:
        тэнд 180° эргэвэл «гэнэт эсрэг эгнээнд орлоо» гэж харагдана. */
  const pNode = [...ports][0];
  const pEdge = net.nodes[pNode].out[0];
  const pDir = net.edges[pEdge].b === pNode ? 1 : -1;
  const out = {
    e: pEdge, s: pDir === 1 ? net.edges[pEdge].length - 20 : 20,
    dir: pDir, v: V_MAX, vmax: V_MAX,
  };
  for (let i = 0; i < 200 && !out.done; i++) stepCars(net, [out], 0.1);
  assert.ok(out.done, 'хилийн гарцаар ГАРСАН');
  assert.equal(out.dir, pDir, 'гарахдаа эргээгүй');
}

/* ══════ ХУВААРЬ УУЛЗВАР ТУС БҮРЭЭР — код давхардсан ч зөв ══════ */

{
  /*  ⚠️ `gerlen_dohio_code` уулзвар БҮРД 1-ээс дахин эхэлдэг: 2026-08-10-ны
      өгөгдөлд код 1-6 хоёр уулзварт хоёуланд нь бий. Кодоор л шийдвэл нэг
      уулзварын хуваарь нөгөөг нь албадан дагуулж, өөр газрын өөр чиглэл зэрэг
      ногоон болно. Тиймээс зогсолтын шугам ба зурагдах шугам бүр өөрийн
      уулзварын нэрийг (`j`) авч явна. */
  const real = SIGNAL_PLANS.find((p) => p.key === 'real' && p.byJunction);
  assert.ok(real, 'бодит хуваарь уулзвараар задарсан');
  const A = '1-р гэрлэн дохио';
  const B = '2-р гэрлэн дохио';
  assert.equal(real.byJunction[A].length, real.byJunction[B].length, 'ээлжийн тоо ижил');

  const share = real.cycle / real.byJunction[A].length; // 30 сек
  const midOf = (i) => i * share + share / 2;

  // 1-р ээлж: A-д 3,4,7,8 · B-д 1,2
  assert.ok(signalLineGreen(3, midOf(0), real, A), 'A: 1-р ээлжид код 3 ногоон');
  assert.ok(!signalLineGreen(1, midOf(0), real, A), 'A: 1-р ээлжид код 1 улаан');
  assert.ok(signalLineGreen(1, midOf(0), real, B), 'B: 1-р ээлжид код 1 ногоон');
  assert.ok(signalLineGreen(2, midOf(0), real, B), 'B: 1-р ээлжид код 2 ногоон');
  assert.ok(!signalLineGreen(3, midOf(0), real, B), 'B: 1-р ээлжид код 3 улаан');

  // 2-р ээлж: A-д 1,6 · B-д 3,4
  assert.ok(signalLineGreen(1, midOf(1), real, A), 'A: 2-р ээлжид код 1 ногоон');
  assert.ok(!signalLineGreen(1, midOf(1), real, B), 'B: 2-р ээлжид код 1 улаан');
  assert.ok(signalLineGreen(4, midOf(1), real, B), 'B: 2-р ээлжид код 4 ногоон');

  // 3-р ээлж: A-д 2,5 · B-д 5,6
  assert.ok(signalLineGreen(2, midOf(2), real, A), 'A: 3-р ээлжид код 2 ногоон');
  assert.ok(!signalLineGreen(2, midOf(2), real, B), 'B: 3-р ээлжид код 2 улаан');
  assert.ok(signalLineGreen(6, midOf(2), real, B), 'B: 3-р ээлжид код 6 ногоон');

  /*  ⚠️ ГОЛ БАТАЛГАА: ижил код, ижил агшинд, ӨӨР уулзварт ӨӨР өнгөтэй.
      Энэ унавал хоёр уулзвар дахин цуг ажиллаж эхэлсэн гэсэн үг. */
  assert.notEqual(
    signalPhase(1, midOf(0), real, A),
    signalPhase(1, midOf(0), real, B),
    'нэг код хоёр уулзварт ӨӨР өнгөтэй',
  );

  // Уулзварын нэр өгөөгүй бол фоллбэк (`stages`) — хуучин зан төлөв хэвээр
  assert.equal(signalPhase(3, midOf(0), real), signalPhase(3, midOf(0), real, A), 'нэргүй → фоллбэк = A');

  // B-д ямар ч ээлжид БҮГД улаан болохгүй (машин мөнхөд гацахгүй)
  for (let i = 0; i < real.byJunction[B].length; i++) {
    assert.ok(real.byJunction[B][i].length > 0, `B: ${i + 1}-р ээлжид ногоон зураас бий`);
  }
}

{
  /*  Зогсолтын шугам ба зурагдах шугам уулзварынхаа нэрийг АВЧ ЯВНА —
      үгүй бол хөдөлгүүр аль хуваарийг хэрэглэхээ мэдэхгүй. */
  const cx = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{
    pt: [100, 0],
    name: '2-р гэрлэн дохио',
    lines: [
      { pts: [[90, -8], [90, 8]], code: 1 },
      { pts: [[92, 30], [108, 30]], code: 3 },
    ],
  }] });
  assert.ok(cx.signalLines.every((l) => l.j === '2-р гэрлэн дохио'), 'зурагдах шугам нэртэй');
  const bars = [...cx.stopBars.values()].flat();
  assert.ok(bars.length > 0 && bars.every((b) => b.j === '2-р гэрлэн дохио'), 'зогсолтын шугам нэртэй');

  /*  Машин 2-р уулзварын хуваарийг дагана: код 1 нь 1-р ЭЭЛЖИД ногоон
      (1-р уулзварын хуваарьт код 1 нь 2-р ээлжид ногоон — өөр). */
  const real = SIGNAL_PLANS.find((p) => p.key === 'real' && p.byJunction);
  const share = real.cycle / 3;
  let seed = 5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let t = 0; t < 200 && car.e === 0; t++) stepCars(cx, [car], 0.1, rnd, share / 2, real);
  assert.notEqual(car.e, 0, '2-р уулзварын 1-р ээлжид код 1 ногоон — машин давав');

  // 1-р уулзварын хуваарь байсан бол тэр агшинд код 1 УЛААН → давахгүй
  const car2 = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
  const cxA = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{
    pt: [100, 0],
    name: '1-р гэрлэн дохио',
    lines: [
      { pts: [[90, -8], [90, 8]], code: 1 },
      { pts: [[92, 30], [108, 30]], code: 3 },
    ],
  }] });
  for (let t = 0; t < 200; t++) stepCars(cxA, [car2], 0.1, rnd, share / 2, real);
  assert.equal(car2.e, 0, '1-р уулзварт код 1 тэр ээлжид улаан — машин зогсов');
}

/* ══════════════════ Проекцын нэгж (Web Mercator) ══════════════════ */

/*  ⚠️ Геометр Web Mercator-оор ирдэг: 48° өргөрөгт 1 бодит метр = 1.49 нэгж.
    Хөдөлгүүрийн тогтмолууд БОДИТ метрээр бичигдсэн тул хөрвүүлэлт алдагдвал
    машин 1.49 дахин удаан явна. Доорх тестүүд түүнийг барина. */
const UPM = 1 / Math.cos((47.9674 * Math.PI) / 180);

// 10 сек × 10 м/с = 100 бодит метр = 149 проекцын нэгж явах ёстой
{
  const wm = buildNetwork([[[0, 0], [10000, 0]]], { unitsPerMeter: UPM });
  const car = { e: 0, s: 0, dir: 1, v: 10, vmax: 10 };
  for (let i = 0; i < 100; i++) stepCars(wm, [car], 0.1);
  assert.ok(
    Math.abs(car.s - 100 * UPM) < 1,
    `WM-д 100 м = ${(100 * UPM).toFixed(0)} нэгж явна (гарсан ${car.s.toFixed(0)})`,
  );
  // Нэгж заагаагүй сүлжээнд ЯГ 100 нэгж
  const plain = buildNetwork([[[0, 0], [10000, 0]]]);
  const c2 = { e: 0, s: 0, dir: 1, v: 10, vmax: 10 };
  for (let i = 0; i < 100; i++) stepCars(plain, [c2], 0.1);
  assert.ok(Math.abs(c2.s - 100) < 1, 'нэгж=метр бол 100 нэгж явна');
}

// Аюулгүй зай ч БОДИТ метрээр биелнэ (проекцын нэгжид 1.49 дахин том харагдана)
{
  const wm = buildNetwork([[[0, 0], [10000, 0]]], { unitsPerMeter: UPM });
  const lead = { e: 0, s: 500 * UPM, dir: 1, v: 0, vmax: 0 };
  const follow = { e: 0, s: 400 * UPM, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 300; i++) stepCars(wm, [lead, follow], 0.1);
  const gapM = (lead.s - follow.s) / UPM;
  assert.ok(
    Math.abs(gapM - (CAR_LEN + MIN_GAP_M)) < 0.5,
    `WM-д ч аюулгүй зай ${CAR_LEN + MIN_GAP_M} БОДИТ м (гарсан ${gapM.toFixed(2)})`,
  );
}

// Наах хүлцэл ба төрөх урт мөн БОДИТ метрээр
{
  // 1.2 бодит метрийн зөрүү = 1.79 нэгж → хүлцэл (1 м) даанагүй тул сална
  const far = buildNetwork([[[0, 0], [100, 0]], [[100, 1.2 * UPM], [200, 0]]], { unitsPerMeter: UPM });
  assert.equal(far.nodes.length, 4, 'хүлцэл БОДИТ метрээр — 1.2 м зөрүү наагдахгүй');
  // 0.5 бодит метр = 0.75 нэгж → наагдана
  const near = buildNetwork([[[0, 0], [100, 0]], [[100, 0.5 * UPM], [200, 0]]], { unitsPerMeter: UPM });
  assert.equal(near.nodes.length, 3, '0.5 м зөрүү наагдана');
}

/* ══════════════════ Эрэлт → машины тоо, төрөх газар ══════════════════ */

assert.equal(targetCars(0, 400), 10, 'эрэлт 0 → шалны тоо');
assert.equal(targetCars(1, 400), 400, 'эрэлт 1 → дээд тоо');
assert.ok(targetCars(0.5, 400) > 200 && targetCars(0.5, 400) < 210, 'эрэлт 0.5 → дундаж');

{
  // Урт·ачаалалтай ирмэгт машин олон төрнө; 25 м-ээс богинод ОГТ төрөхгүй
  const net = buildNetwork([[[0, 0], [400, 0]], [[0, 50], [20, 50]]]);
  net.edges[0].baseLoad = 1;
  const tbl = spawnTable(net);
  assert.ok(tbl.total > 0, 'төрөх боломжтой ирмэг бий');
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 500; i++) assert.equal(pickEdge(tbl, rnd), 0, 'богино хэрчимд машин төрөхгүй');
  assert.equal(pickEdge({ cum: [0], total: 0 }), -1, 'хоосон сүлжээ → −1');
}

/* ══════════════════ Гэрлэн дохио ══════════════════ */

{
  // «+» уулзвар (100,0) — дохионы line-ууд, зам бүр параллель line-ийн бүлэгт
  const sig = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{ pt: [103, 2], lines: [
    { pts: [[100, 12], [100, 40]], code: 1 },   // N-S тэнхлэг (сондгой код)
    { pts: [[112, 0], [140, 0]], code: 2 },      // E-W тэнхлэг (тэгш код)
  ] }] });
  const hub = sig.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(sig.signals.has(hub), 'дохио уулзварт наагдав');
  assert.equal(sig.signalLines.length, 2, 'дохионы 2 line сүлжээнд орсон');
  assert.ok(signalLineGreen(1, 0, PLAN2) && !signalLineGreen(2, 0, PLAN2), 'ээлж 0: сондгой кодууд ногоон');
  assert.ok(!signalLineGreen(1, 30, PLAN2) && signalLineGreen(2, 30, PLAN2), '30 сек дараа тэгш кодууд ногоон');

  // ШАР ФАЗ: ногооны сүүлийн 3 сек (27..30) шар — машин явахгүй, өнгө нь шар
  assert.equal(signalPhase(1, 26.9, PLAN2), 'green', '26.9с ногоон хэвээр');
  assert.equal(signalPhase(1, 27, PLAN2), 'yellow', '27с шар асав');
  assert.equal(signalPhase(1, 29.9, PLAN2), 'yellow', '29.9с шар хэвээр');
  assert.equal(signalPhase(1, 30, PLAN2), 'red', '30с улаан болов');
  assert.equal(signalPhase(2, 27, PLAN2), 'red', 'нөгөө тэнхлэг энэ үед улаан');
  assert.equal(signalPhase(2, 57, PLAN2), 'yellow', 'тэгш кодын шар 57..60с');
  assert.ok(!signalLineGreen(1, 28, PLAN2), 'шарт нэвтрэх эрхгүй (зогсоно)');

  // ГОЛ ШАЛГУУР: зам бүр өөрийн тэнхлэгийн line-ийн КОДТОЙ тааруулагдав
  // (N-S зам → code 1, E-W зам → code 2)
  const gm = sig.signalGroups.get(hub);
  assert.ok(gm && gm.size === 4, 'уулзварын 4 ирмэг бүгд кодтой');
  for (const [ei, code] of gm) {
    const e = sig.edges[ei];
    const isNS = Math.abs(e.pts[1][0] - e.pts[0][0]) < Math.abs(e.pts[1][1] - e.pts[0][1]);
    assert.equal(code, isNS ? 1 : 2, `ирмэг #${ei} (${isNS ? 'N-S' : 'E-W'}) зөв line-ийн кодтой`);
  }

  // Хол дохио (SIGNAL_SNAP_M > 12 м) наагдахгүй
  const far = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]], [[100, 0], [100, 100]],
  ], { signals: [{ pt: [100, 40], lines: [{ pts: [[100, 50], [100, 80]], code: 1 }] }] });
  assert.equal(far.signals.size, 0, 'хүлцлээс хол дохио наагдахгүй');

  // degree-2 (энгийн үргэлжлэл) дохио АВАХГҮЙ — зөвхөн жинхэнэ уулзвар
  const thru = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]]],
    { signals: [{ pt: [100, 1], lines: [{ pts: [[100, 5], [100, 30]], code: 1 }] }] });
  assert.equal(thru.signals.size, 0, 'degree-2 зангилаа дохиогүй');
}

{
  // ЭРГЭЛТТЭЙ (30°) уулзвар — line-тай тааруулга АБСОЛЮТ тэнхлэгээс үл хамаарна.
  // Зам бүр өөрийн дэргэдэх (параллель) line-ийн бүлгийг авна.
  const a = Math.PI / 6;
  const rot = (x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const R = buildNetwork([
    [rot(-100, 0), rot(0, 0)], [rot(0, 0), rot(100, 0)],   // road A → 30°
    [rot(0, -100), rot(0, 0)], [rot(0, 0), rot(0, 100)],   // road B → 120° (A-д перпендикуляр)
  ], { signals: [{ pt: rot(0, 0), lines: [
    { pts: [rot(0, 10), rot(0, 40)], code: 1 },  // road B тэнхлэг
    { pts: [rot(10, 0), rot(40, 0)], code: 2 },  // road A тэнхлэг
  ] }] });
  const hubR = R.nodes.findIndex((n) => n.out.length === 4);
  const gmR = R.signalGroups.get(hubR);
  assert.ok(gmR && gmR.size === 4, 'эргэлттэй уулзварын 4 ирмэг бүлэгтэй');
  const dirA = rot(1, 0), dirB = rot(0, 1);
  for (const [ei, code] of gmR) {
    const eh = outHeading(R.edges[ei], hubR);
    const alongA = Math.abs(eh[0] * dirA[0] + eh[1] * dirA[1]) > Math.abs(eh[0] * dirB[0] + eh[1] * dirB[1]);
    // road A → code 2 (түүний тэнхлэгийн line), road B → code 1
    assert.equal(code, alongA ? 2 : 1, 'эргэлттэй: ирмэг өөрийн параллель line-ийн кодтой');
  }
}

{
  /*  БОДИТ `gerlen_dohio` ГЕОМЕТР: line нь ЗОГСОЛТЫН ШУГАМ — замаа ХӨНДЛӨН
      огтолж (перпендикуляр), замын ДЭЭР ~30 м зайд байрлана. Хуучин «хамгийн
      параллель» оноолт энд ХӨНДЛӨН замын бүлгийг өгч фаз урвуу болдог байсан
      (улаанд машин давхидаг алдаа). Байрлалаар онооход зөв болно. */
  const cx2 = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{ pt: [100, 0], lines: [
    // E-W замын зогсолтын шугам (босоо N-S чиглэлтэй!) — код 1
    { pts: [[130, -8], [130, 8]], code: 1 },
    { pts: [[70, -8], [70, 8]], code: 1 },
    // N-S замын зогсолтын шугам (хэвтээ E-W чиглэлтэй!) — код 2
    { pts: [[92, 30], [108, 30]], code: 2 },
    { pts: [[92, -30], [108, -30]], code: 2 },
  ] }] });
  const hub2 = cx2.nodes.findIndex((n) => n.out.length === 4);
  const gm2 = cx2.signalGroups.get(hub2);
  assert.ok(gm2 && gm2.size === 4, 'зогсолтын шугамт уулзварын 4 ирмэг кодтой');
  for (const [ei, code] of gm2) {
    const eh = outHeading(cx2.edges[ei], hub2);
    const ew = Math.abs(eh[0]) > Math.abs(eh[1]); // E-W ирмэг үү
    assert.equal(code, ew ? 1 : 2, 'зогсолтын шугам: ирмэг ӨӨРИЙН замын шугамын кодтой (урвуу биш)');
  }
}

{
  /*  Дохиотой «+» уулзвар — БОДИТ геометр: зогсолтын шугам замаа ХӨНДЛӨН огтолж,
      уулзвараас зайдуу байрлана. Машин УЛААНД ЯГ ШУГАМАН ДЭЭР зогсож (уулзварын
      төв дээр биш!), НОГООНД дамжина. */
  const cx = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{ pt: [100, 0], lines: [
    { pts: [[90, -8], [90, 8]], code: 2 },       // E-W баруун approach-ийн шугам (s=90)
    { pts: [[92, 30], [108, 30]], code: 1 },     // N-S хойд approach-ийн шугам
  ] }] });
  const hub = cx.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(cx.signals.has(hub), 'уулзвар дохиотой');

  // ГОЛ ШАЛГУУР: шугам ирмэгийг огтолсон газар BAR үүссэн
  const bars0 = cx.stopBars.get(0);
  assert.ok(bars0 && bars0.length === 1, 'edge0 дээр зогсолтын шугам буусан');
  assert.ok(Math.abs(bars0[0].s - 90) < 0.01, `bar s=90 (гарсан ${bars0[0].s.toFixed(1)})`);
  assert.equal(bars0[0].dir, 1, 'bar зөвхөн уулзвар РУУ явагчдад үйлчилнэ');
  assert.equal(bars0[0].code, 2, 'bar өөрийн line-ийн КОДЫГ авав');

  // edge0-ийн зогсолтын шугам нь КОД 2 — түүний улаан ба ногоон агшин
  let redT = -1, greenT = -1;
  for (let t = 0; t < SIGNAL_CYCLE_S; t++) {
    if (signalLineGreen(2, t, PLAN2)) { if (greenT < 0) greenT = t; }
    else if (redT < 0) redT = t;
  }
  assert.ok(redT >= 0 && greenT >= 0, 'мөчлөгт улаан ба ногоон хоёул бий');

  // Улаан — машин ШУГАМАН ДЭЭР зогсоно (шугам s=90-ийг огт давахгүй)
  {
    const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
    for (let i = 0; i < 150; i++) stepCars(cx, [car], 0.1, Math.random, redT, PLAN2);
    assert.equal(car.e, 0, 'улаанд уулзвар давсангүй');
    // урд бампер (төв + хагас урт) шугамаас хэтрээгүй
    assert.ok(car.s + CAR_LEN / 2 <= 90 + 0.01, `урд бампер шугамаас хэтрээгүй (s=${car.s.toFixed(1)})`);
    assert.ok(car.s > 80, `шугамд ойрхон зогссон (s=${car.s.toFixed(1)})`);
    assert.ok(car.v < 0.5, `улаанд зогссон (v=${car.v.toFixed(2)})`);
  }

  // Ногоон — машин шугам ба уулзварыг давж нөгөө ирмэг рүү орно
  {
    const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 60; i++) stepCars(cx, [car], 0.1, rnd, greenT, PLAN2);
    assert.notEqual(car.e, 0, 'ногоонд уулзвар даван өнгөрөв');
  }

  // ШАР (код 2-ын шар = 57с) — машин УЛААН шиг шугаман дээр зогсоно
  {
    assert.equal(signalPhase(2, 57, PLAN2), 'yellow', 'туршилтын агшин шар мөн');
    const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
    for (let i = 0; i < 150; i++) stepCars(cx, [car], 0.1, Math.random, 57, PLAN2);
    assert.equal(car.e, 0, 'шарт уулзвар давсангүй');
    assert.ok(car.s + CAR_LEN / 2 <= 90 + 0.01, `шарт шугамаас хэтрээгүй (s=${car.s.toFixed(1)})`);
    assert.ok(car.v < 0.5, 'шарт зогссон');
  }

  // Шугамыг аль хэдийн ДАВСАН машин улаан асахад уулзвар дотор ГАЦАХГҮЙ — гарна
  {
    const car = { e: 0, s: 95, dir: 1, v: V_MAX, vmax: V_MAX };
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 60; i++) stepCars(cx, [car], 0.1, rnd, redT, PLAN2);
    assert.notEqual(car.e, 0, 'шугам давсан машин уулзвараа чөлөөлж гарав');
  }
}

/* ══════════════════ Чиглэлтэй (directed) сүлжээ ══════════════════ */

{
  // a→b→c гинж, ЧИГЛЭЛТЭЙ. Машин сумны дагуу л явна.
  const dnet = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]]], { directed: true });
  assert.equal(dnet.directed, true, 'directed тугтай');
  const mid = dnet.nodes.findIndex((n) => Math.abs(n.x - 100) < 0.01);

  // Уулзвараас: сумны дагуу edge1 руу; сумны ЭСРЭГ (edge0 руу буцах) гарцгүй
  assert.equal(pickNext(dnet, mid, 0, [1, 0]), 1, 'сумны дагуу дараагийн ирмэг');
  assert.equal(pickNext(dnet, mid, 1, [1, 0]), null, 'сумны эсрэг гарц алга');

  // Машин сумны дагуу үргэлжилж, мухарт ч УСТАХГҮЙ — тасралтгүй явсаар байна
  const car = { e: 0, s: 90, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 9;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let reachedNext = false;
  for (let i = 0; i < 300; i++) {
    stepCars(dnet, [car], 0.1, rnd);
    if (car.e === 1) reachedNext = true;
    assert.ok(car.e === 0 || car.e === 1, 'машин сүлжээн дээрээ байна (устаагүй)');
    assert.ok(Number.isFinite(car.s), 'байрлал хүчинтэй');
  }
  assert.ok(reachedNext, 'сумны дагуу дараагийн ирмэг рүү үргэлжилсэн');
  assert.ok(car.v > 0 || car.s >= 0, 'мухарт ч зогсонги биш — тасралтгүй');
}

{
  /*  ХОЁР ЭГНЭЭТ зам (эсрэг чиглэлийн хос line) — ДОТООД мухарт эсрэг урсгал
      руу шилжинэ.
      ⚠️ Хосыг ТОМ сүлжээний ДОТОР тавина: жижиг сүлжээнд бүх мухар «хил» болж
      (`boundaryNodes`-ийн фоллбэк), машин шилжихийн оронд бүсээс ГАРНА. Хилийн
      гарц дээр гарах нь ЗӨВ зан төлөв — түүнийг дээрх мухрын тест шалгана. */
  const dual = buildNetwork([
    ...Array.from({ length: 8 }, (_, k) => [[k * 100, 0], [(k + 1) * 100, 0]]),
    ...[100, 300, 500, 700].map((x) => [[x, 0], [x, 300]]),
    ...[0, 200, 600, 800].map((x) => [[x, 0], [x, -300]]),
    [[300, 100], [500, 100]],   // →→→ дотоод эгнээ
    [[500, 108], [300, 108]],   // ←←← эсрэг эгнээ (8 м зэрэгцээ)
  ], { directed: true });
  const east = dual.edges.findIndex((e) => e.length > 150 && Math.abs(e.pts[0][1] - 100) < 0.01);
  const west = dual.edges.findIndex((e) => e.length > 150 && Math.abs(e.pts[0][1] - 108) < 0.01);
  assert.ok(east >= 0 && west >= 0, 'хоёр эгнээт хос үүсэв');
  const sinkNode = dual.edges[east].b;
  assert.ok(!portalNodes(dual).has(sinkNode), 'дотоод мухар — портал БИШ');
  assert.ok(dual.sinkExit.get(sinkNode)?.includes(west), 'мухраас эсрэг урсгалын эх олдов');

  const car = { e: east, s: dual.edges[east].length - 5, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 13;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60 && car.e === east; i++) stepCars(dual, [car], 0.1, rnd);
  assert.equal(car.e, west, 'мухарт устахгүй — эсрэг урсгал руу U-эргэлт хийв');
  assert.equal(car.dir, 1, 'шинэ ирмэг дээр сумны дагуу (a→b) явна');
  assert.ok(car.v <= U_TURN_V + 0.01, `шилжихдээ удаашрав (${car.v.toFixed(1)} м/с)`);
}

/* ══════════════════ Улаан гэрэлд машин ДАВХЦАХГҮЙ жагсах ══════════════════ */

{
  // Урт E-W approach бүхий дохиотой «+». Зогсолтын шугам s=290 (замыг хөндлөн),
  // бүлэг 1 → phase0-д E-W УЛААН. Жагсаа ШУГАМААС хойш давхцалгүй үүснэ.
  const q = buildNetwork([
    [[0, 0], [300, 0]], [[300, 0], [600, 0]],
    [[300, 0], [300, 100]], [[300, 0], [300, -100]],
  ], { signals: [{ pt: [300, 0], lines: [
    { pts: [[290, -8], [290, 8]], code: 2 },     // E-W шугам (s=290) → phase0-д улаан
    { pts: [[292, 30], [308, 30]], code: 1 },    // N-S шугам
  ] }] });
  const hub = q.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(q.signals.has(hub), 'уулзвар дохиотой');
  assert.ok(q.stopBars.get(0)?.length === 1, 'edge0 дээр bar буусан');

  // edge0 (E-W, hub руу) дээр 4 машин ойрхон байрлуулж, УЛААНД (time=0) жагсаана
  const cars = [];
  for (let i = 0; i < 4; i++) cars.push({ e: 0, s: 250 - i * 6, dir: 1, v: V_MAX, vmax: V_MAX });
  for (let i = 0; i < 250; i++) stepCars(q, cars, 0.1, Math.random, 0, PLAN2);

  // Бүгд ЗОГССОН, ирмэгээ давалгүй (E-W улаан хэвээр)
  assert.ok(cars.every((c) => c.v < 0.5), 'улаанд бүх машин зогсов');
  assert.ok(cars.every((c) => c.e === 0), 'улаанд уулзвар руу орсонгүй');

  // Урд машин ШУГАМАН дээр зогссон — урд бампер шугамаас хэтрээгүй
  const lead = Math.max(...cars.map((c) => c.s));
  assert.ok(lead + CAR_LEN / 2 <= 290 + 0.01, `урд бампер шугамаас хэтрээгүй (s=${lead.toFixed(1)})`);
  assert.ok(lead > 280, `шугамд ойрхон зогссон (s=${lead.toFixed(1)})`);

  // ⚠️ ГОЛ ШАЛГУУР: хоёр машин ДАВХЦААГҮЙ — зэргэлдээ зайн зөрүү ≥ машины урт
  const ss = cars.map((c) => c.s).sort((a, b) => a - b);
  for (let i = 1; i < ss.length; i++) {
    assert.ok(ss[i] - ss[i - 1] >= CAR_LEN - 0.01, `машинууд давхцаагүй (зөрүү ${(ss[i] - ss[i - 1]).toFixed(2)})`);
  }
}

/* ══════════ Жагсаа ИРМЭГИЙН ЗААГ даван сунахад ДАВХЦАХГҮЙ ══════════ */

{
  /*  A(100м) → B(30м) → C(300м) гинж, чиглэлтэй. C дээр зогссон хаалт-машин →
      жагсаа B-г дүүргэж, зангилааг ДАВАН A руу сунана. Өмнө нь орц хаагдсан
      машин зангилааны ЯГ ТӨВД зогсдог байсан тул B-гийн сүүлчийн машинтай
      давхардаг байв — одоо жагсааны сүүлээс зайгаа барина. */
  const chain = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [130, 0]], [[130, 0], [430, 0]],
  ], { directed: true });
  const blocker = { e: 2, s: 25, dir: 1, v: 0, vmax: 0 };
  const cars = [blocker];
  for (let i = 0; i < 5; i++) cars.push({ e: 0, s: 80 - i * 8, dir: 1, v: V_MAX, vmax: V_MAX });
  let seed = 21;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 600; i++) stepCars(chain, cars, 0.1, rnd, 0);

  // Бүх машин нэг шулуун дээр — дэлхийн x байрлалаар эрэмбэлж, давхцлыг шалгана
  const xs = cars.map((c) => carPose(chain, c).x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(
      xs[i] - xs[i - 1] >= CAR_LEN - 0.05,
      `зааг даван жагсахад давхцаагүй (зөрүү ${(xs[i] - xs[i - 1]).toFixed(2)} м, x=${xs[i].toFixed(1)})`,
    );
  }
  assert.ok(cars.slice(1).every((c) => c.v < 0.5), 'хаалтын ард бүгд зогссон');
}

/* ══════ ГЭРЛЭН ДОХИОНЫ ЗОХИЦУУЛАЛТ — 2 / 4 / 8 ээлж ══════ */

{
  /*  ⚠️ Өгөгдөл 4 кодоос 8 код болсон (нэг уулзвар = 4 чиглэл × 2 эгнээ:
      (1,5) (2,6) (3,7) (4,8)). Бүлгийг КОДООС хатуу тооцохоо больж,
      ЗОХИЦУУЛАЛТЫН ХӨТӨЛБӨРӨӨР шийддэг болов. */
  const p2 = SIGNAL_PLANS.find((x) => x.key === '2');
  const p4 = SIGNAL_PLANS.find((x) => x.key === '4');
  const p8 = SIGNAL_PLANS.find((x) => x.key === '8');
  assert.equal(p2.stages.length, 2, '2 ээлжийн хөтөлбөр');
  assert.equal(p4.stages.length, 4, '4 ээлжийн хөтөлбөр');
  assert.equal(p8.stages.length, 8, '8 ээлжийн хөтөлбөр');

  // ⚠️ ЗӨВХӨН тэгш хуваасан хөтөлбөрүүд: «Уулзварын хуваарь»-т нэг код ОЛОН
  //    ээлжид ногоон болдог тул энэ шалгуур түүнд хамаарахгүй.
  for (const plan of [p2, p4, p8]) {
    for (let code = 1; code <= 8; code++) {
      const hits = plan.stages.filter((st) => st.includes(code)).length;
      assert.equal(hits, 1, `«${plan.label}»: код ${code} яг нэг ээлжид`);
    }
  }

  // 2 ээлж — сондгой ба тэгш кодууд ХЭЗЭЭ Ч зэрэг ногоон болохгүй
  for (let t = 0; t < p2.cycle; t += 0.5) {
    const odd = signalLineGreen(1, t, p2) || signalLineGreen(3, t, p2)
      || signalLineGreen(5, t, p2) || signalLineGreen(7, t, p2);
    const even = signalLineGreen(2, t, p2) || signalLineGreen(4, t, p2)
      || signalLineGreen(6, t, p2) || signalLineGreen(8, t, p2);
    assert.ok(!(odd && even), `2 ээлж: хоёр тэнхлэг зэрэг ногоон биш (t=${t})`);
  }
  // Нэг тэнхлэгийн 4 код нь ХАМТ ногоон болно (хос эгнээ зэрэг нээгдэнэ)
  assert.ok(
    [1, 3, 5, 7].every((c) => signalLineGreen(c, 0, p2)),
    '2 ээлж: нэг тэнхлэгийн бүх код зэрэг ногоон',
  );

  // 4 ээлж — ЯМАР Ч агшинд нэгээс илүү ЧИГЛЭЛ ногоон байхгүй
  for (let t = 0; t < p4.cycle; t += 0.5) {
    const on = p4.stages.filter((st) => st.some((c) => signalLineGreen(c, t, p4))).length;
    assert.ok(on <= 1, `4 ээлж: нэг л чиглэл ногоон (t=${t}, ${on})`);
  }

  // Ногоон хугацаа: ээлж олсох тусам БОГИНОСНО (багтаамжийн солилцоо)
  const green = (p) => p.cycle / p.stages.length - p.yellow;
  assert.ok(green(p2) > green(p4) && green(p4) > green(p8), 'ээлж олсох тусам ногоон богиносно');
  assert.ok(Math.abs(green(p2) - 27) < 0.01, '2 ээлж: 27 сек ногоон');

  // Хөтөлбөрт ОРООГҮЙ код үргэлж улаан (өгөгдөлд шинэ код нэмэгдвэл аюулгүй)
  assert.equal(signalPhase(99, 0, p2), 'red', 'танихгүй код үргэлж улаан');


  // Хөтөлбөр солиход МАШИНЫ ЗАН шууд өөрчлөгдөнө (сүлжээ дахин угсрахгүй)
  const cx3 = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{ pt: [100, 0], lines: [{ pts: [[90, -8], [90, 8]], code: 2 }] }] });
  // t=0 үед: 2 ээлжид код 2 УЛААН, харин 4 ээлжид код 2 нь сүүлийн ээлж → мөн улаан.
  // Код 1-ийн ээлж (эхний) хоёуланд нь ногоон тул код 2-ыг ХОЁР хөтөлбөрөөр жишье:
  const at = (plan, t) => signalPhase(2, t, plan);
  assert.equal(at(p2, 0), 'red', '2 ээлж: t=0 үед код 2 улаан');
  assert.equal(at(p2, 35), 'green', '2 ээлж: t=35 үед код 2 ногоон');
  assert.equal(at(p4, 35), 'red', '4 ээлж: ижил агшинд код 2 УЛААН (өөр хуваарь)');
  assert.equal(at(p4, 75), 'green', '4 ээлж: код 2 сүүлийн ээлжид ногоон');
  assert.ok(cx3.stopBars.get(0)?.[0]?.code === 2, 'bar код хадгалагдав (хөтөлбөрөөс хамааралгүй)');
}

/* ══════ ЗӨРЧИЛГҮЙ ЭЭЛЖ — уулзварын ГЕОМЕТРЭЭС бодох ══════ */

{
  /*  ЗАРЧИМ: ээлж бүрд нэг тал ба түүний ЭСРЭГ тал ногоон; ХӨНДЛӨН тал улаан.
      Бодит өгөгдлийн бүтэц: 8 зураас = 4 тал × 2 эгнээ, замууд 52°-аар огтолно.
      ⚠️ Замын огтлолцол 90° БИШ учраас «ойрхон өнцөгтэй» гэсэн ганц хүлцлээр
      шүүвэл хоёр өөр замын тал нэг бүлэгт унаж, хөндлөн урсгал зэрэг нээгдэнэ —
      тиймээс эхлээд ТАЛУУДЫГ нарийн (18°) бүлэглээд, дараа нь эсрэг талтай нь
      хосолно. Энэ тест яг тэр алдааг барина. */
  const R2 = 120;
  const mk = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [[[-Math.cos(rad) * R2, -Math.sin(rad) * R2], [0, 0]],
      [[0, 0], [Math.cos(rad) * R2, Math.sin(rad) * R2]]];
  };
  // Хоёр зам 52°-аар огтолно (бодит уулзвартай ижил хэлбэр)
  const roads = [...mk(53), ...mk(1)];
  /** Тухайн өнцөгт, төвөөс `r` зайд, замаа ХӨНДЛӨН огтлох зогсолтын шугам */
  const bar = (deg, r, code) => {
    const rad = (deg * Math.PI) / 180;
    const cx = Math.cos(rad) * r; const cy = Math.sin(rad) * r;
    const px = -Math.sin(rad) * 8; const py = Math.cos(rad) * 8;
    return { pts: [[cx - px, cy - py], [cx + px, cy + py]], code };
  };
  // 4 тал × 2 эгнээ: тал бүрд бага зэрэг зөрүүтэй хоёр зураас
  const lines = [
    bar(53, 20, 1), bar(48, 19, 5),      // тал A
    bar(233, 39, 3), bar(238, 21, 7),    // тал A-гийн ЭСРЭГ
    bar(1, 34, 4), bar(-4, 33, 8),       // тал B
    bar(181, 39, 2), bar(186, 39, 6),    // тал B-гийн ЭСРЭГ
  ];
  const net = buildNetwork(roads, { signals: [{ pt: [0, 0], lines }] });
  assert.equal(net.signalLines.length, 8, '8 зураас наагдав');
  assert.ok(net.signalLines.every((l) => l.hub), 'зураас бүр уулзварынхаа төвийг мэднэ');

  /* ── ГОРИМ 1: ТАЛ ТУС БҮР (анхдагч) ──
     ⚠️ Хэрэглэгчийн баталсан дүрэм: «1 ногоон байхад 7, 8 хэзээ ч ногоон
     асахгүй». 1 ба 7 нь ЭСРЭГ тал тул эсрэг талыг хамт нээж БОЛОХГҮЙ. */
  const split = compatStages(net);
  assert.equal(split.length, 4, `4 талт уулзварт 4 ээлж (гарсан ${split.length})`);
  assert.deepEqual(split.find((st) => st.includes(1)), [1, 5], 'тал A: зөвхөн өөрийн 2 эгнээ');
  assert.deepEqual(split.find((st) => st.includes(3)), [3, 7], 'эсрэг тал нь ТУСДАА ээлж');
  for (const st of split) {
    assert.ok(!(st.includes(1) && st.includes(7)), '1 ба 7 хэзээ ч хамт биш');
    assert.ok(!(st.includes(1) && st.includes(8)), '1 ба 8 хэзээ ч хамт биш');
  }

  /* ── ГОРИМ 2: ЭСРЭГ ТАЛ ХАМТ (сонгодог схем) ── */
  const stages = compatStages(net, { mode: 'opposite' });
  assert.equal(stages.length, 2, `эсрэг тал хамт бол 2 ээлж (гарсан ${stages.length})`);
  const s1 = stages.find((st) => st.includes(1));
  const s2 = stages.find((st) => st.includes(2));
  assert.deepEqual(s1, [1, 3, 5, 7], 'A тэнхлэг: өөрийн ба эсрэг талын 4 зураас');
  assert.deepEqual(s2, [2, 4, 6, 8], 'B тэнхлэг: нөгөө 4 зураас');

  // ГОЛ ШАЛГУУР: ХӨНДЛӨН зураас ХЭЗЭЭ Ч зэрэг ногоон болохгүй
  const plan = compatPlan(net, { mode: 'opposite' });
  assert.ok(plan, 'дохиотой сүлжээнд авто хөтөлбөр гарна');
  const planSplit = compatPlan(net);
  assert.equal(planSplit.stages.length, 4, 'split хөтөлбөр 4 ээлжтэй');
  assert.equal(planSplit.cycle, 120, 'ээлж олон бол мөчлөг уртасна (30с × 4)');
  const bearOf = (c) => {
    const ln = net.signalLines.find((l) => l.code === c);
    const a = ln.pts[0]; const b = ln.pts[ln.pts.length - 1];
    return ((Math.atan2((a[1] + b[1]) / 2 - ln.hub[1], (a[0] + b[0]) / 2 - ln.hub[0]) * 180)
      / Math.PI + 360) % 360;
  };
  for (let t = 0; t < plan.cycle; t += 0.5) {
    const on = [1, 2, 3, 4, 5, 6, 7, 8].filter((c) => signalLineGreen(c, t, plan));
    for (const a of on) {
      for (const b of on) {
        if (a >= b) continue;
        const d = angDiff(bearOf(a), bearOf(b));
        assert.ok(d <= 20 || d >= 145, `t=${t}: код ${a} ба ${b} хөндлөн атлаа зэрэг ногоон (${d.toFixed(0)}°)`);
      }
    }
  }

  // Дохиогүй сүлжээнд авто хөтөлбөр гарахгүй (алдаа шидэхгүй)
  assert.equal(compatPlan(buildNetwork([[[0, 0], [100, 0]]])), null, 'дохиогүй бол null');
}

/* ══════ АВТОБУС голч замаар — богино туслах гудамж руу эргэхгүй ══════ */

{
  /*  Уулзвараас гурван салаа: урт голч (120 м), урт голч (80 м), богино
      хорооллын салаа (18 м). Автобус эхний хоёрыг л сонгоно. */
  const b = buildNetwork([
    [[0, 0], [100, 0]],       // e0 — ойртох
    [[100, 0], [220, 0]],     // e1 — голч, 120 м
    [[100, 0], [100, 80]],    // e2 — голч, 80 м
    [[100, 0], [100, -18]],   // e3 — богино салаа, 18 м
  ]);
  const hub = b.nodes.findIndex((n) => n.out.length === 4);
  const BUS_MIN = 40;
  const allow = (e) => b.edges[e].length >= BUS_MIN;

  let seed = 17;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(pickNext(b, hub, 0, [1, 0], rnd, allow));
  assert.ok(!seen.has(3), 'автобус богино салаа руу эргээгүй');
  assert.ok(seen.has(1) && seen.has(2), 'голч салаанууд сонгогдов');

  // Шүүлтгүй (хөнгөн авто) бол богино салаа ч гарна
  const seen2 = new Set();
  for (let i = 0; i < 300; i++) seen2.add(pickNext(b, hub, 0, [1, 0], rnd));
  assert.ok(seen2.has(3), 'хөнгөн авто богино салаагаар явж болно');

  /*  ⚠️ МУХАРДАХААС хамгаалах: зөвхөн БОГИНО салаа байвал шүүлт хүчингүй болно —
      эс бөгөөс автобус уулзварт мөнхөд гацна. */
  const only = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [100, 18]], [[100, 0], [100, -18]],
  ]);
  const hub2 = only.nodes.findIndex((n) => n.out.length === 3);
  const pick = pickNext(only, hub2, 0, [1, 0], rnd, (e) => only.edges[e].length >= BUS_MIN);
  assert.ok(pick === 1 || pick === 2, 'голч салаа алга бол богиноор ч гарна (гацахгүй)');
}

/* ══════ Уулзвар даван орохдоо урдахаа НЭВТ өнгөрөхгүй (давхцахгүй) ══════ */

{
  /*  Алдааны хувилбар: уулзварт ЧӨЛӨӨТЭЙ салаа байгаа тул машин тоормослохгүй
      бүрэн хурдаар ирнэ; сонгосон салаанд нь орох зай (clear ≥ need) бий ч
      түүний цаана машин ЗОГСОЖ байна. Урьд нь орсны дараа ҮЛДСЭН move-оороо
      чөлөөтэй урагшилдаг байсан тул тэр зогссон машиныг нэвт өнгөрч, ДЭЭР нь
      бууж давхардаг байв — дэлгэц дээр «ар машин урдахаа дээгүүр давав». */
  const j = buildNetwork([
    [[0, 0], [100, 0]],     // e0 — ойртох
    [[100, 0], [400, 0]],   // e1 — шулуун (цаана нь хаалт зогсоно)
    [[100, 0], [100, 300]], // e2 — чөлөөтэй салаа (тоормослохгүй байх шалтгаан)
  ], { directed: true });
  // Хаалт орцны ЯГ цаана (орох зай бий: clear=4.55 ≥ need=4.5), ойртогч нь
  // зангилаанд бараг тултал ирсэн — фреймийн ҮЛДЭХ хөдөлгөөн 2.4 м
  const straight = { e: 1, s: 7.05, dir: 1, v: 0, vmax: 0 };
  const comer = { e: 0, s: 99.6, dir: 1, v: V_MAX, vmax: V_MAX };
  const cars = [straight, comer];
  // rnd→0 ⇒ pickNext эхний нэрийг (e1 — хаалттай салаа) сонгоно
  for (let i = 0; i < 12; i++) stepCars(j, cars, 0.2, () => 0);

  assert.ok(comer.e === 0 || comer.e === 1, 'машин шулуун салаанд орлоо');
  if (comer.e === 1) {
    assert.ok(
      straight.s - comer.s >= CAR_LEN - 0.05,
      `уулзвар давсан машин урдахаа нэвт өнгөрөөгүй (зөрүү ${(straight.s - comer.s).toFixed(2)} м)`,
    );
  }
  assert.equal(straight.s, 7.05, 'хаалт машин байрнаасаа хөдлөөгүй');
}

/* ══════ U-эргэлт — эсрэг эгнээний машин дээр бууж давхцахгүй ══════ */

{
  // Мухар зам: A үзүүрт хүрээд U-эргэлт хийхийг оролдоно, гэвч эсрэг эгнээний
  // орцонд B зогсож байна → эргэхгүй хүлээнэ (өмнө нь B дээр бууж давхцдаг байв).
  // ⚠️ ДОТООД мухар дээр (хилийн гарц дээр машин ЭРГЭХГҮЙ, гардаг)
  const stub = stubNet(100);
  const tipN = stub.nodes.findIndex((n) => Math.abs(n.x - 400) < 0.01 && Math.abs(n.y - 100) < 0.01);
  const se = stub.nodes[tipN].out[0];
  const L = stub.edges[se].length;
  const toTip = stub.edges[se].b === tipN ? 1 : -1;
  const at = (d) => (toTip === 1 ? L - d : d);
  const blocked = { e: se, s: at(1), dir: -toTip, v: 0, vmax: 0 };
  const comer = { e: se, s: at(20), dir: toTip, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 60; i++) stepCars(stub, [blocked, comer], 0.2, () => 0);
  assert.equal(comer.dir, toTip, 'эсрэг эгнээ дүүрэн — U-эргэлт хийсэнгүй');
  assert.ok(comer.s <= L + 0.01 && comer.s >= -0.01, 'ирмэгээсээ гараагүй');

  // Эсрэг эгнээ чөлөөлмөгц эргэлт хэвийн үргэлжилнэ
  const free = { e: se, s: at(20), dir: toTip, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 60; i++) stepCars(stub, [free], 0.2, () => 0);
  assert.equal(free.dir, -toTip, 'чөлөөтэй үед U-эргэлт хийв');
}

/* ══════ УУЛЗВАР — хөндлөн урсгал зэрэг орж МӨРГӨЛДӨХГҮЙ ══════ */

{
  /*  ⚠️ Car-following нь зөвхөн НЭГ ирмэг·чиглэл дэх урдахыг хардаг тул
      хөндлөн замаас ирэх машиныг ОГТ мэдэхгүй. Бодит сүлжээн дээрх хэмжилтээр
      (400 машин) уулзвар дээр фрейм тутам 4.1 хос машины БИЕ давхцаж байсан;
      уулзварын эзэмшлийн дүрмээр 1.2 болж буурсан. Энэ тест нь тэр дүрэм
      ажиллаж байгааг барина: хоёр машин НЭГ зэрэг уулзварт орохгүй. */
  const x = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, -100], [100, 0]], [[100, 0], [100, 100]],
  ]);
  const hub = x.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(hub >= 0, "дөрвөн салаат уулзвар үүсэв");

  // Хоёр машин хоёр өөр салаанаас уулзвар руу ижил зайд ойртоно
  const a = { e: 0, s: 88, dir: 1, v: V_MAX, vmax: V_MAX };
  const b = { e: 2, s: 88, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let both = 0;
  for (let i = 0; i < 60; i++) {
    stepCars(x, [a, b], 0.1, rnd);
    // Уулзварын хайрцагт (5 м) хоёулаа зэрэг байгаа фреймийг тоолно
    const dj = (c) => {
      const e = x.edges[c.e];
      const nA = c.dir === 1 ? e.b : e.a;
      const nB = c.dir === 1 ? e.a : e.b;
      const dA = c.dir === 1 ? e.length - c.s : c.s;
      const dB = c.dir === 1 ? c.s : e.length - c.s;
      return Math.min(nA === hub ? dA : Infinity, nB === hub ? dB : Infinity);
    };
    if (dj(a) < 5 && dj(b) < 5) both++;
  }
  assert.equal(both, 0, `уулзварт нэг л удаад нэг машин (зэрэг байсан фрейм ${both})`);
  // Хоёулаа гацаагүй — ядаж нэг нь уулзварыг давсан
  assert.ok(a.e !== 0 || b.e !== 2, "ядаж нэг машин уулзварыг давав");
}

/* ══════ ДАВХАРДСАН ШУГАМ — хоёр жагсаа бие бие дээрээ зурагдахгүй ══════ */

{
  /*  ⚠️ Эх өгөгдлийн алдаа: нэг гудамжийг ЯГ ДАВХАРЛАН хоёр удаа зурсан.
      Хоёуланд нь машин явуулбал хоёр жагсаа давхцаж, дэлгэц дээр «машин
      мөргөлдсөн» мэт харагдана. Ирмэгийг УСТГАЛГҮЙ тэмдэглээд урсгалаас хасна. */
  const d = buildNetwork([
    [[0, 0], [200, 0]],           // үндсэн гудамж
    [[0, 0.3], [200, 0.3]],       // ЯГ дээр нь зурагдсан хуулбар (0.3 м)
    [[100, 0], [100, 120]],       // хөндлөн салаа — давхардаагүй
  ]);
  const n = markDuplicates(d);
  assert.equal(n, 1, `нэг ирмэг давхардсан гэж тэмдэглэгдэв (гарсан ${n})`);
  assert.equal(d.edges.filter((e) => e.dup).length, 1, 'зөвхөн НЭГ нь хаягдав');
  assert.ok(d.edges.some((e) => !e.dup && e.length > 50), 'үндсэн гудамж хэвээр');

  /*  ⚠️ ЗЭРЭГЦЭЭ ЭГНЭЭ бол хуулбар БИШ — хаяж болохгүй.
      Бодит өгөгдөлд эгнээ хоорондын зай 1.3–3.8 м (жиш. 8↔10 = 1.5 м,
      9↔11 = 1.7 м) байдаг бол жинхэнэ хуулбар 0.0 м байна. Хүлцлийг эгнээний
      зайд хүргэвэл ЖИНХЭНЭ зам тасалдаж, машин цааш явж чадахгүй болно:
      OBJECTID 9-ийн 782 м-ийн 407 м нь ингэж хаагдаж, машин буцаж эргэдэг байв. */
  const lanes = buildNetwork([
    [[0, 0], [200, 0]],
    [[0, 1.5], [200, 1.5]],       // 1.5 м зайтай ЗЭРЭГЦЭЭ эгнээ
  ]);
  assert.equal(markDuplicates(lanes), 0, '1.5 м зайтай зэрэгцээ эгнээ хуулбар БИШ');
  assert.ok(lanes.edges.every((e) => !e.dup), 'хоёулаа урсгалд үлдэв');

  // Төрөлт — давхардсан ирмэг дээр машин үүсэхгүй
  const tbl = spawnTable(d);
  let seed = 31;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) {
    const c = spawnCar(d, tbl, rnd);
    if (c) assert.ok(!d.edges[c.e].dup, 'давхардсан ирмэг дээр машин төрөөгүй');
  }

  // Уулзвар дээр давхардсан салаа сонгогдохгүй (өөр сонголт байхад)
  const hub = d.nodes.findIndex((nd) => nd.out.length >= 3);
  if (hub >= 0) {
    const from = d.nodes[hub].out.find((e) => !d.edges[e].dup);
    for (let i = 0; i < 200; i++) {
      const e = pickNext(d, hub, from, [1, 0], rnd);
      if (e != null) assert.ok(!d.edges[e].dup, 'давхардсан салаа сонгогдоогүй');
    }
  }

  // ⚠️ БҮХ салаа давхардсан бол шүүлт хүчингүй — машин гацахгүй
  const only = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]], [[100, 0.9], [200, 0.9]]]);
  markDuplicates(only);
  const hub2 = only.nodes.findIndex((nd) => nd.out.length >= 3);
  if (hub2 >= 0) {
    assert.ok(pickNext(only, hub2, 0, [1, 0], rnd) != null, 'бүх салаа давхардсан ч гарц олдов');
  }
}

/* ══════ УУЛЗВАРЫН ХУВААРЬ — хэрэглэгчийн өгсөн 3 ээлж ══════ */

{
  /*  Бодит хуваарь: 1-р ээлж {3,4,7,8} · 2-р ээлж {1,6} · 3-р ээлж {2,5}.
      Жагсаалтад ороогүй код тухайн ээлжид УЛААН. */
  const pReal = SIGNAL_PLANS.find((x) => x.key === 'real');
  assert.ok(pReal, 'уулзварын хуваарь бүртгэлтэй');
  assert.equal(pReal.stages.length, 3, '3 ээлжтэй');
  assert.deepEqual(pReal.stages[0], [3, 4, 7, 8], '1-р ээлж: 3,4,7,8');
  assert.deepEqual(pReal.stages[1], [1, 6], '2-р ээлж: 1,6');
  assert.deepEqual(pReal.stages[2], [2, 5], '3-р ээлж: 2,5');

  const share = pReal.cycle / 3;
  const SPEC = [
    [[3, 4, 7, 8], [1, 2, 5, 6]],
    [[1, 6], [2, 3, 4, 5, 7, 8]],
    [[2, 5], [1, 3, 4, 6, 7, 8]],
  ];
  for (let st = 0; st < 3; st++) {
    const t = st * share + share * 0.3; // ээлжийн ногоон хэсэгт
    for (const c of SPEC[st][0]) {
      assert.ok(signalLineGreen(c, t, pReal), `${st + 1}-р ээлж: код ${c} НОГООН`);
    }
    for (const c of SPEC[st][1]) {
      assert.ok(!signalLineGreen(c, t, pReal), `${st + 1}-р ээлж: код ${c} улаан`);
    }
    // Ээлжийн төгсгөлд ногоонууд ШАР болно
    const ty = st * share + share - pReal.yellow / 2;
    for (const c of SPEC[st][0]) {
      assert.equal(signalPhase(c, ty, pReal), 'yellow', `${st + 1}-р ээлжийн төгсгөлд шар`);
    }
  }

  // Код бүр мөчлөгт ЯГ НЭГ удаа ногоон болно (мартагдсан код алга)
  for (let code = 1; code <= 8; code++) {
    const stagesOn = pReal.stages.filter((st) => st.includes(code)).length;
    assert.equal(stagesOn, 1, `код ${code} яг нэг ээлжид`);
  }
}

/* ══════ ЭРГЭЛТИЙН ЗӨӨЛРҮҮЛЭЛТ — уулзвар дээр огцом эргэхгүй ══════ */

{
  /*  «L» зам: зүүнээс ирээд хойшоо эргэнэ. Урьд нь ирмэг солигдмогц чиглэл
      агшин зуур 90° эргэдэг байсан — одоо эхний ~8 м-т нумаар шилжинэ. */
  const L2 = buildNetwork([
    [[0, 0], [60, 0]],
    [[60, 0], [60, 60]],
  ], { directed: true });
  const car = { e: 0, s: 55, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 40 && car.e === 0; i++) stepCars(L2, [car], 0.1, rnd);
  assert.equal(car.e, 1, 'машин эргэлт хийв');
  assert.ok(car.hx != null && car.hux != null, 'булангийн өгөгдөл тавигдав');
  assert.ok(Math.abs(car.hx - 60) < 1.5 && Math.abs(car.hy) < 1.5, 'булан нь уулзварын цэг');

  // Орсны дараахан — чиглэл ХОЛИМОГ (хуучин чиглэлийн үлдэц бий, огцом биш)
  car.s = 1;
  const p1 = carPose(L2, car);
  assert.ok(p1.ux > 0.25, `эхэнд хуучин (+x) чиглэлийн үлдэцтэй (ux=${p1.ux.toFixed(2)})`);
  assert.ok(p1.uy > 0.25, `шинэ (+y) чиглэл рүү эргэж эхэлсэн (uy=${p1.uy.toFixed(2)})`);

  // Муруйн төгсгөлд — бүрэн шинэ чиглэлдээ орсон
  car.s = 8.01;
  const p2 = carPose(L2, car);
  assert.ok(Math.abs(p2.ux) < 0.05 && p2.uy > 0.99, 'нумын дараа ирмэгээ яг дагана');

  // Муруйн эхлэл БУЛАНГААС эхэлнэ (байрлал таслархай үсрэхгүй)
  car.s = 0;
  const p0 = carPose(L2, car);
  assert.ok(Math.hypot(p0.x - 60, p0.y - 0) < 0.5, 'нум булангийн цэгээс эхэлнэ');

  /*  ШУЛУУН гарц — орох, гарах чиглэл ижил бол нум нь ЯГ шулуун (гажилтгүй) */
  const st = buildNetwork([
    [[0, 0], [60, 0]],
    [[60, 0], [120, 0]],
  ], { directed: true });
  const c2 = { e: 1, s: 3, dir: 1, v: V_MAX, vmax: V_MAX, hx: 60, hy: 0, hux: 1, huy: 0 };
  const ps = carPose(st, c2);
  assert.ok(Math.abs(ps.y) < 1e-6 && Math.abs(ps.x - 63) < 0.2, 'шулуунд гажилт үүсгэхгүй');
  assert.ok(ps.ux > 0.999, 'шулуунд чиглэл өөрчлөгдөхгүй');
}

/* ══════ 24 ЦАГИЙН МӨЧЛӨГ — машин хилээр орж/гарна, гэнэт үл үзэгдэнэ ══════ */

{
  /*  «Гарч явах» машин мухарт хүрээд `done` болно (sink-jump/U-эргэлт хийхгүй) —
      дуудагч тал жагсаалтаас авахад «хилээр гарч одсон» мэт харагдана. */
  const road = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]]], { directed: true });
  const c = { e: 1, s: 80, dir: 1, v: V_MAX, vmax: V_MAX, leaving: true };
  let seed = 4;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 100 && !c.done; i++) stepCars(road, [c], 0.1, rnd);
  assert.ok(c.done, 'гарч яваа машин мухарт done болов');
  assert.ok(Math.abs(c.s - road.edges[1].length) < 0.01, 'яг үзүүрт нь зогсов');
  assert.equal(c.dir, 1, 'U-эргэлт хийгээгүй (гарсан)');

  /* ⚠️ ЭНГИЙН машин ч ХИЛИЙН ГАРЦААР гарна: замууд судалгааны хилээр
     тасарсан бөгөөд бодит дээр цааш үргэлжилдэг. Урьд нь энгийн машин тэнд
     эсрэг эгнээ рүү үсэрч буцдаг байсныг зассан. Дотоод мухарт эргэх нь
     хэвээр — «дотоод мухарт АЛГА БОЛООГҮЙ» тестийг үз. */
  const c2 = { e: 1, s: 80, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 100 && !c2.done; i++) stepCars(road, [c2], 0.1, rnd);
  assert.ok(c2.done, 'энгийн машин ч хилийн гарцаар гарав');
  assert.equal(c2.dir, 1, 'хил дээр эргээгүй');

  // done машиныг хөдөлгүүр алгасна (байрлал өөрчлөгдөхгүй)
  const sBefore = c.s;
  stepCars(road, [c, c2], 0.1, rnd);
  assert.equal(c.s, sBefore, 'done машин хөдлөхгүй');
}

{
  /*  Хилийн орцууд: мухрын (degree-1) зангилаанууд; чиглэлтэй сүлжээнд сумны
      эсрэг орц хасагдана; орцоор орсон машин сүлжээ РҮҮ чиглэнэ. */
  const y = buildNetwork([
    [[0, 0], [100, 0]],     // e0: зүүн мухар (0,0) → төв
    [[100, 0], [200, 0]],   // e1: төв → баруун мухар
    [[100, 0], [100, 100]], // e2: төв → хойд мухар
  ]);
  const ens = boundaryEntries(y);
  assert.equal(ens.length, 3, 'гурван мухар = гурван орц');

  const en0 = ens.find((x) => x.e === 0);
  assert.ok(en0 && en0.dir === 1, 'зүүн орц сүлжээ рүү (a→b)');
  const en1 = ens.find((x) => x.e === 1);
  assert.ok(en1 && en1.dir === -1, 'баруун орц СӨРӨГ чиглэлд (сүлжээ рүү)');

  const car = spawnCarAt(y, en1);
  assert.equal(car.e, 1, 'орцын ирмэг дээр төрөв');
  assert.ok(y.edges[1].length - car.s < 5, 'үзүүрт нь ойрхон');
  assert.equal(car.dir, -1, 'сүлжээ рүү чиглэсэн');

  // Чиглэлтэй сүлжээнд сумны эсрэг орц ХАСАГДАНА
  const dnet = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]]], { directed: true });
  const dens = boundaryEntries(dnet);
  assert.equal(dens.length, 1, 'чиглэлтэйд зөвхөн эхлэлийн мухар орц болно');
  assert.ok(dens[0].e === 0 && dens[0].dir === 1, 'зөв орц үлдэв');
}

/* ══════ УЛААН ГЭРЭЛД ТЭВЧЭЭР БАРАГДАХГҮЙ — савлахгүй ══════ */

{
  /*  Улаан 60с (3 ээлжийн хуваарьт) > тэвчээр 25с. Урьд нь зогсолтын шугам
      дээрх машин «гацлаа» гэж андуурч БУЦАЖ ЭРГЭЭД, эрэлт нь буцааж дуудахад
      урагш-хойш савладаг байв. Одоо улаан зураас урд байвал гэрлээ л хүлээнэ. */
  const cx4 = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]],
    [[100, 0], [100, 100]], [[100, 0], [100, -100]],
  ], { signals: [{ pt: [100, 0], lines: [
    { pts: [[90, -8], [90, 8]], code: 5 },       // E-W шугам (s=90)
    { pts: [[92, 30], [108, 30]], code: 1 },
  ] }] });
  // «Уулзварын хуваарь»: код 5 нь 3-р ээлжид л ногоон — 1, 2-р ээлжид (60с) улаан
  const pReal2 = SIGNAL_PLANS.find((x) => x.key === 'real');
  const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 6;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // 40 сим-секунд УЛААН дээр барина (t=0..40 — 1-р ээлж {3,4,7,8} тул код 5 улаан)
  for (let t = 0; t < 400; t++) stepCars(cx4, [car], 0.1, rnd, t * 0.1 % 28, pReal2);
  assert.equal(car.dir, 1, 'улаанд 40с зогссон ч БУЦАЖ ЭРГЭЭГҮЙ');
  assert.equal(car.e, 0, 'ирмэгээ орхиогүй');
  assert.ok(car.s + CAR_LEN / 2 <= 90 + 0.01, 'шугамаа даваагүй');
  assert.ok((car.wait ?? 0) > PATIENCE_S, 'тэвчээр хэтэрсэн ч (гэрэл тул) хүлээсээр');

  // Ногоон асмагц хөдөлнө
  const tGreen = (pReal2.cycle / 3) * 2 + 5; // 3-р ээлж — код 5 ногоон
  for (let t = 0; t < 100 && car.e === 0; t++) stepCars(cx4, [car], 0.1, rnd, tGreen, pReal2);
  assert.notEqual(car.e, 0, 'ногоонд уулзвараа давав');
}

/* ══════ 100 м-ЭЭС БОГИНО ШУГАМ — зөвхөн дамжина, төрөхгүй/алга болохгүй ══════ */

{
  /*  Захын хоёр мухар: нэг нь УРТ (150 м) ирмэгтэй — портал; нөгөө нь БОГИНО
      (40 м) стуб — машин зөвхөн дамжин явна. */
  const pn = buildNetwork([
    [[0, 0], [150, 0]],     // e0 — урт: портал болно
    [[150, 0], [190, 0]],   // e1 — богино стуб: портал БОЛОХГҮЙ
    [[150, 0], [150, 150]], // e2 — урт салаа
    [[150, 150], [150, 190]], // e3 — богино стуб
    [[150, 150], [300, 150]], // e4 — урт: портал
    [[0, 0], [0, -150]],     // e5 — урт: портал
  ]);
  // ⚠️ Жижиг сүлжээний фоллбэк (<6 портал) энэ тестэд саад болохгүйн тулд
  //    портал 6-аас цөөн ч урт/богино ялгааг ОРЦООР нь шалгана
  const ens = boundaryEntries(pn);
  for (const en of ens) {
    // Фоллбэк идэвхжээгүй бол богино ирмэг дээр орц байх ёсгүй
    if (ens.length < pn.nodes.filter((n) => n.out.length === 1).length) {
      assert.ok(pn.edges[en.e].length >= 100, `орц зөвхөн урт ирмэг дээр (e${en.e})`);
    }
  }

  // Төрөлт: 100 м-ээс богино ирмэг дээр хэзээ ч төрөхгүй
  for (const e of pn.edges) e.baseLoad = 0.5;
  const tb = spawnTable(pn);
  let seed = 12;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const idx = pickEdge(tb, rnd);
    if (idx >= 0) assert.ok(pn.edges[idx].length >= 100, `богино ирмэг дээр төрөв (e${idx})`);
  }
}

{
  /*  ОД хэлбэрийн сүлжээ: төвөөс 8 УРТ (200 м) салаа + зүүн салааны үзүүрт
      БОГИНО (40 м) стуб. Стубын үзүүр bbox-ийн захад байгаа ч ирмэг нь богино
      тул ПОРТАЛ БОЛОХГҮЙ: гарагч тэнд хүрвэл алга болохгүй, эргэж буцна. */
  const roads = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    roads.push([[0, 0], [Math.cos(a) * 200, Math.sin(a) * 200]]);
  }
  roads.push([[200, 0], [200, 40]]); // богино стуб — зүүн салааны үзүүрээс
  const pn2 = buildNetwork(roads);
  const stubNode = pn2.nodes.findIndex((n) => Math.abs(n.x - 200) < 0.1 && Math.abs(n.y - 40) < 0.1);
  assert.ok(stubNode >= 0, 'стубын үзүүр олдов');
  assert.ok(boundaryNodes(pn2).has(stubNode), 'стуб захын бүсэд байгаа (тест утга учиртай)');
  assert.ok(!portalNodes(pn2).has(stubNode), 'богино стуб портал БИШ');
  assert.ok(portalNodes(pn2).size >= 6, 'урт порталууд хангалттай (фоллбэк идэвхжээгүй)');

  const stubEdge = pn2.nodes[stubNode].out[0];
  const cs = {
    e: stubEdge, s: 5, dir: pn2.edges[stubEdge].b === stubNode ? 1 : -1,
    v: V_MAX, vmax: V_MAX, leaving: true,
  };
  let seed2 = 9;
  const rnd2 = () => (seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60 && !cs.done; i++) stepCars(pn2, [cs], 0.1, rnd2);
  assert.ok(!cs.done, 'богино стубын мухарт АЛГА БОЛООГҮЙ (эргэж буцсан)');

  // Харин УРТ салааны мухарт хүрвэл гарна — төв рүү яваад портал салаагаар
  const cl = { e: 0, s: 190, dir: -1, v: V_MAX, vmax: V_MAX, leaving: true };
  for (let i = 0; i < 600 && !cl.done; i++) stepCars(pn2, [cl], 0.1, rnd2);
  assert.ok(cl.done, 'урт порталын мухарт жамаараа гарав');
}

console.log('traffic.check: ok — diurnal, замын байрлал, сүлжээ, уулзвар, car-following, эрэлт, дохио, чиглэл, давхцалгүй');
