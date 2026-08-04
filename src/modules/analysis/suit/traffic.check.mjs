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
      for (const ln of lines) signalLines.push(ln);
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
            list.push({ s, dir, group: ln.group });
          }
        }
      }
      // ⚠️ БАЙРЛАЛААР: төвөөс line-ийн ДУНД ЦЭГ рүү чиглэл (line нь зогсолтын
      //    шугам — замаа хөндлөн огтолдог тул чиглэлээр нь онооход фаз урвуу байсан)
      const lineDirs = lines.map((ln) => {
        const a = ln.pts[0], b = ln.pts[ln.pts.length - 1];
        const mx = (a[0] + b[0]) / 2 - sd.pt[0], my = (a[1] + b[1]) / 2 - sd.pt[1];
        const L = Math.hypot(mx, my) || 1;
        return { g: ln.group, dx: mx / L, dy: my / L };
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
const YELLOW_S = 3;
const signalPhase = (group, time) => {
  const half = SIGNAL_CYCLE_S / 2;
  const t = ((time % SIGNAL_CYCLE_S) + SIGNAL_CYCLE_S) % SIGNAL_CYCLE_S;
  if (Math.floor(t / half) !== group) return 'red';
  return t % half < half - YELLOW_S ? 'green' : 'yellow';
};
const signalLineGreen = (group, time) => signalPhase(group, time) === 'green';
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
  const out = [];
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w]; if (p.length < 2) continue; let cur = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const sp = splits[w][i].filter((s) => s.t > 1e-6 && s.t < 1 - 1e-6).sort((a, b) => a.t - b.t);
      for (const s of sp) { cur.push(s.pt); if (cur.length >= 2) out.push(cur); cur = [s.pt]; }
      cur.push(p[i + 1]);
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
const STOP_LINE_M = 2.5;
const TAU = 1.0;
const ACC = 1.8, DEC = 4.5;
const V_MIN = 30 / 3.6, V_MAX = 50 / 3.6;

const carPose = (net, car) => {
  const p = poseAt(net.edges[car.e], car.s);
  return car.dir === 1 ? p : { x: p.x, y: p.y, ux: -p.ux, uy: -p.uy };
};

const pickNext = (net, node, fromEdge, travel, rnd = Math.random) => {
  const outs = net.nodes[node]?.out ?? [];
  let total = 0;
  const ws = [], cand = [];
  for (const i of outs) {
    if (i === fromEdge) continue;
    if (net.directed && net.edges[i].a !== node) continue;
    const h = outHeading(net.edges[i], node);
    const dot = travel[0] * h[0] + travel[1] * h[1];
    const align = Math.max(0.02, ((1 + dot) / 2) ** 2);
    const w = align * Math.min(1, net.edges[i].length / 25);
    if (w <= 0) continue;
    cand.push(i); ws.push(w); total += w;
  }
  if (!cand.length || total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
};

const stepCars = (net, cars, dt, rnd = Math.random, time = 0) => {
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
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    let g = gap[i] / upm;
    let vl = leadV[i];
    // Улаан гэрлийн зогсолт — ЗУРААСАН дээр (`stopBars`)
    const bars = net.stopBars.get(c.e);
    if (bars) {
      for (const b of bars) {
        if (b.dir !== c.dir || signalLineGreen(b.group, time)) continue;
        const distM = (c.dir === 1 ? b.s - c.s : c.s - b.s) / upm;
        if (distM <= 0) continue;
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
      let next = pickNext(net, node, c.e, travel, rnd);
      for (let t = 0; t < 2 && next != null; t++) {
        const d0 = net.edges[next].a === node ? 1 : -1;
        const cl0 = laneFront.get(next * 2 + (d0 === 1 ? 0 : 1));
        if (cl0 === undefined || cl0 >= (carLen(c) / 2 + MIN_GAP_M) * upm) break;
        const again = pickNext(net, node, c.e, travel, rnd);
        if (again != null) next = again;
      }
      if (next == null) {
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
            laneFront.set(eKey, -(carLen(c) / 2) * upm);
            const jBars = net.stopBars.get(c.e);
            if (jBars) {
              for (const b of jBars) {
                if (b.dir !== 1 || signalLineGreen(b.group, time)) continue;
                if (b.s <= 0) continue;
                move = Math.min(move, Math.max(0, b.s - (carLen(c) / 2 + MIN_GAP_M) * upm));
              }
            }
            continue;
          }
          // Ойр гарц алга — U-эргэлт (тасралтгүй)
          c.s = c.dir === 1 ? edge.length : 0;
          c.dir = c.dir === 1 ? -1 : 1;
          continue;
        }
        c.s = c.dir === 1 ? edge.length : 0;
        c.dir = c.dir === 1 ? -1 : 1;
        continue;
      }
      const nDir = net.edges[next].a === node ? 1 : -1;
      const nKey = next * 2 + (nDir === 1 ? 0 : 1);
      const entryS = nDir === 1 ? 0 : net.edges[next].length;
      const clear = laneFront.get(nKey);
      const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
      if (clear !== undefined && clear < need) {
        const short = need - clear;
        if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
        else c.s = Math.min(c.s, short);
        c.v = 0;
        break;
      }
      c.e = next;
      c.dir = nDir;
      c.s = entryS;
      laneFront.set(nKey, -(carLen(c) / 2) * upm);
      // Шинэ ирмэг дээрх улаан шугам — үлдсэн хөдөлгөөнийг таслана
      const nBars = net.stopBars.get(c.e);
      if (nBars) {
        for (const b of nBars) {
          if (b.dir !== c.dir || signalLineGreen(b.group, time)) continue;
          const aheadU = c.dir === 1 ? b.s - c.s : c.s - b.s;
          if (aheadU <= 0) continue;
          move = Math.min(move, Math.max(0, aheadU - (carLen(c) / 2 + MIN_GAP_M) * upm));
        }
      }
    }
  }
};

const spawnTable = (net, minLenM = 25) => {
  const min = minLenM * (net.unitsPerMeter || 1);
  const cum = [];
  let total = 0;
  for (const e of net.edges) {
    if (e.length >= min) total += (e.baseLoad + 0.12) * e.length;
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

// Мухар зам — U-эргэлт хийж чиглэлээ солино
{
  const stub = buildNetwork([[[0, 0], [60, 0]]]);
  const car = { e: 0, s: 59, dir: 1, v: V_MAX, vmax: V_MAX };
  for (let i = 0; i < 5; i++) stepCars(stub, [car], 0.1);
  assert.equal(car.dir, -1, 'мухар үзүүрээс буцав');
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
    { pts: [[100, 12], [100, 40]], group: 0 },   // N-S (codes 1,3)
    { pts: [[112, 0], [140, 0]], group: 1 },      // E-W (codes 2,4)
  ] }] });
  const hub = sig.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(sig.signals.has(hub), 'дохио уулзварт наагдав');
  assert.equal(sig.signalLines.length, 2, 'дохионы 2 line сүлжээнд орсон');
  assert.ok(signalLineGreen(0, 0) && !signalLineGreen(1, 0), 'phase0: бүлэг 0 (1,3) ногоон');
  assert.ok(!signalLineGreen(0, 30) && signalLineGreen(1, 30), '30 сек дараа бүлэг 1 (2,4) ногоон');

  // ШАР ФАЗ: ногооны сүүлийн 3 сек (27..30) шар — машин явахгүй, өнгө нь шар
  assert.equal(signalPhase(0, 26.9), 'green', '26.9с ногоон хэвээр');
  assert.equal(signalPhase(0, 27), 'yellow', '27с шар асав');
  assert.equal(signalPhase(0, 29.9), 'yellow', '29.9с шар хэвээр');
  assert.equal(signalPhase(0, 30), 'red', '30с улаан болов');
  assert.equal(signalPhase(1, 27), 'red', 'нөгөө бүлэг энэ үед улаан');
  assert.equal(signalPhase(1, 57), 'yellow', 'бүлэг 1-ийн шар 57..60с');
  assert.ok(!signalLineGreen(0, 28), 'шарт нэвтрэх эрхгүй (зогсоно)');

  // ГОЛ ШАЛГУУР: зам бүр өөрийн тэнхлэгийн line-тай тааруулагдав (N-S→0, E-W→1)
  const gm = sig.signalGroups.get(hub);
  assert.ok(gm && gm.size === 4, 'уулзварын 4 ирмэг бүгд бүлэгтэй');
  for (const [ei, grp] of gm) {
    const e = sig.edges[ei];
    const isNS = Math.abs(e.pts[1][0] - e.pts[0][0]) < Math.abs(e.pts[1][1] - e.pts[0][1]);
    assert.equal(grp, isNS ? 0 : 1, `ирмэг #${ei} (${isNS ? 'N-S' : 'E-W'}) зөв line-ийн бүлэгт`);
  }

  // Хол дохио (SIGNAL_SNAP_M > 12 м) наагдахгүй
  const far = buildNetwork([
    [[0, 0], [100, 0]], [[100, 0], [200, 0]], [[100, 0], [100, 100]],
  ], { signals: [{ pt: [100, 40], lines: [{ pts: [[100, 50], [100, 80]], group: 0 }] }] });
  assert.equal(far.signals.size, 0, 'хүлцлээс хол дохио наагдахгүй');

  // degree-2 (энгийн үргэлжлэл) дохио АВАХГҮЙ — зөвхөн жинхэнэ уулзвар
  const thru = buildNetwork([[[0, 0], [100, 0]], [[100, 0], [200, 0]]],
    { signals: [{ pt: [100, 1], lines: [{ pts: [[100, 5], [100, 30]], group: 0 }] }] });
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
    { pts: [rot(0, 10), rot(0, 40)], group: 0 },  // road B тэнхлэг
    { pts: [rot(10, 0), rot(40, 0)], group: 1 },  // road A тэнхлэг
  ] }] });
  const hubR = R.nodes.findIndex((n) => n.out.length === 4);
  const gmR = R.signalGroups.get(hubR);
  assert.ok(gmR && gmR.size === 4, 'эргэлттэй уулзварын 4 ирмэг бүлэгтэй');
  const dirA = rot(1, 0), dirB = rot(0, 1);
  for (const [ei, grp] of gmR) {
    const eh = outHeading(R.edges[ei], hubR);
    const alongA = Math.abs(eh[0] * dirA[0] + eh[1] * dirA[1]) > Math.abs(eh[0] * dirB[0] + eh[1] * dirB[1]);
    assert.equal(grp, alongA ? 1 : 0, 'эргэлттэй: ирмэг өөрийн параллель line-ийн бүлэгт');
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
    // E-W замын зогсолтын шугам (босоо N-S чиглэлтэй!) — бүлэг 0
    { pts: [[130, -8], [130, 8]], group: 0 },
    { pts: [[70, -8], [70, 8]], group: 0 },
    // N-S замын зогсолтын шугам (хэвтээ E-W чиглэлтэй!) — бүлэг 1
    { pts: [[92, 30], [108, 30]], group: 1 },
    { pts: [[92, -30], [108, -30]], group: 1 },
  ] }] });
  const hub2 = cx2.nodes.findIndex((n) => n.out.length === 4);
  const gm2 = cx2.signalGroups.get(hub2);
  assert.ok(gm2 && gm2.size === 4, 'зогсолтын шугамт уулзварын 4 ирмэг бүлэгтэй');
  for (const [ei, grp] of gm2) {
    const eh = outHeading(cx2.edges[ei], hub2);
    const ew = Math.abs(eh[0]) > Math.abs(eh[1]); // E-W ирмэг үү
    assert.equal(grp, ew ? 0 : 1, 'зогсолтын шугам: ирмэг ӨӨРИЙН замын шугамын бүлэгт (урвуу биш)');
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
    { pts: [[90, -8], [90, 8]], group: 1 },       // E-W баруун approach-ийн шугам (s=90)
    { pts: [[92, 30], [108, 30]], group: 0 },     // N-S хойд approach-ийн шугам
  ] }] });
  const hub = cx.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(cx.signals.has(hub), 'уулзвар дохиотой');

  // ГОЛ ШАЛГУУР: шугам ирмэгийг огтолсон газар BAR үүссэн
  const bars0 = cx.stopBars.get(0);
  assert.ok(bars0 && bars0.length === 1, 'edge0 дээр зогсолтын шугам буусан');
  assert.ok(Math.abs(bars0[0].s - 90) < 0.01, `bar s=90 (гарсан ${bars0[0].s.toFixed(1)})`);
  assert.equal(bars0[0].dir, 1, 'bar зөвхөн уулзвар РУУ явагчдад үйлчилнэ');
  assert.equal(bars0[0].group, 1, 'bar өөрийн line-ийн бүлэгтэй');

  // Бүлэг 1-ийн улаан ба ногоон агшин
  let redT = -1, greenT = -1;
  for (let t = 0; t < SIGNAL_CYCLE_S; t++) {
    if (signalLineGreen(1, t)) { if (greenT < 0) greenT = t; }
    else if (redT < 0) redT = t;
  }
  assert.ok(redT >= 0 && greenT >= 0, 'мөчлөгт улаан ба ногоон хоёул бий');

  // Улаан — машин ШУГАМАН ДЭЭР зогсоно (шугам s=90-ийг огт давахгүй)
  {
    const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
    for (let i = 0; i < 150; i++) stepCars(cx, [car], 0.1, Math.random, redT);
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
    for (let i = 0; i < 60; i++) stepCars(cx, [car], 0.1, rnd, greenT);
    assert.notEqual(car.e, 0, 'ногоонд уулзвар даван өнгөрөв');
  }

  // ШАР (бүлэг 1-ийн шар = 57с) — машин УЛААН шиг шугаман дээр зогсоно
  {
    assert.equal(signalPhase(1, 57), 'yellow', 'туршилтын агшин шар мөн');
    const car = { e: 0, s: 60, dir: 1, v: V_MAX, vmax: V_MAX };
    for (let i = 0; i < 150; i++) stepCars(cx, [car], 0.1, Math.random, 57);
    assert.equal(car.e, 0, 'шарт уулзвар давсангүй');
    assert.ok(car.s + CAR_LEN / 2 <= 90 + 0.01, `шарт шугамаас хэтрээгүй (s=${car.s.toFixed(1)})`);
    assert.ok(car.v < 0.5, 'шарт зогссон');
  }

  // Шугамыг аль хэдийн ДАВСАН машин улаан асахад уулзвар дотор ГАЦАХГҮЙ — гарна
  {
    const car = { e: 0, s: 95, dir: 1, v: V_MAX, vmax: V_MAX };
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 60; i++) stepCars(cx, [car], 0.1, rnd, redT);
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
  // ХОЁР ЭГНЭЭТ зам (эсрэг чиглэлийн хос line) — мухарт ЭСРЭГ УРСГАЛ руу шилжинэ
  //   →→→ зам: (0,0)→(200,0)   ·   ←←← зам: (200,8)→(0,8)  (8 м зайтай зэрэгцээ)
  const dual = buildNetwork([
    [[0, 0], [200, 0]],
    [[200, 8], [0, 8]],
  ], { directed: true });
  // (200,0)-ын sink-ээс (200,8)-ын гарц (edge1) олдоно (8 м < SINK_JUMP_M)
  const sinkNode = dual.nodes.findIndex((n) => Math.abs(n.x - 200) < 0.01 && Math.abs(n.y) < 0.01);
  assert.ok(dual.sinkExit.get(sinkNode)?.includes(1), 'мухраас эсрэг урсгалын эх олдов');

  const car = { e: 0, s: 195, dir: 1, v: V_MAX, vmax: V_MAX };
  let seed = 13;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 40 && car.e === 0; i++) stepCars(dual, [car], 0.1, rnd);
  assert.equal(car.e, 1, 'мухарт устахгүй — эсрэг урсгал руу U-эргэлт хийв');
  assert.equal(car.dir, 1, 'шинэ ирмэг дээр сумны дагуу (a→b) явна');
}

/* ══════════════════ Улаан гэрэлд машин ДАВХЦАХГҮЙ жагсах ══════════════════ */

{
  // Урт E-W approach бүхий дохиотой «+». Зогсолтын шугам s=290 (замыг хөндлөн),
  // бүлэг 1 → phase0-д E-W УЛААН. Жагсаа ШУГАМААС хойш давхцалгүй үүснэ.
  const q = buildNetwork([
    [[0, 0], [300, 0]], [[300, 0], [600, 0]],
    [[300, 0], [300, 100]], [[300, 0], [300, -100]],
  ], { signals: [{ pt: [300, 0], lines: [
    { pts: [[290, -8], [290, 8]], group: 1 },     // E-W шугам (s=290) → phase0-д улаан
    { pts: [[292, 30], [308, 30]], group: 0 },    // N-S шугам
  ] }] });
  const hub = q.nodes.findIndex((n) => n.out.length === 4);
  assert.ok(q.signals.has(hub), 'уулзвар дохиотой');
  assert.ok(q.stopBars.get(0)?.length === 1, 'edge0 дээр bar буусан');

  // edge0 (E-W, hub руу) дээр 4 машин ойрхон байрлуулж, УЛААНД (time=0) жагсаана
  const cars = [];
  for (let i = 0; i < 4; i++) cars.push({ e: 0, s: 250 - i * 6, dir: 1, v: V_MAX, vmax: V_MAX });
  for (let i = 0; i < 250; i++) stepCars(q, cars, 0.1, Math.random, 0);

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

console.log('traffic.check: ok — diurnal, замын байрлал, сүлжээ, уулзвар, car-following, эрэлт, дохио, чиглэл, давхцалгүй');
