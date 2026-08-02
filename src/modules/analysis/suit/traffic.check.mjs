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
const MIN_EDGE_M = 0.05;
const buildNetwork = (paths, { tolM = SNAP_TOL_M, unitsPerMeter = 1 } = {}) => {
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
  return { nodes, edges, unitsPerMeter };
};
const outHeading = (edge, node) => {
  const n = edge.pts.length;
  const [p, q] = edge.a === node ? [edge.pts[0], edge.pts[1]] : [edge.pts[n - 1], edge.pts[n - 2]];
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
};

const CAR_LEN = 5;
const MIN_GAP_M = 2;
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

const stepCars = (net, cars, dt, rnd = Math.random) => {
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
        gap[me] = Math.abs(cars[ahead].s - cars[me].s) - CAR_LEN * upm;
        leadV[me] = cars[ahead].v;
      }
    }
  }
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const g = gap[i] / upm;
    let want = c.vmax;
    if (Number.isFinite(g)) {
      const vl = leadV[i];
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
      const next = pickNext(net, node, c.e, travel, rnd);
      if (next == null) {
        c.s = c.dir === 1 ? edge.length : 0;
        c.dir = c.dir === 1 ? -1 : 1;
        continue;
      }
      c.e = next;
      c.dir = net.edges[next].a === node ? 1 : -1;
      c.s = c.dir === 1 ? 0 : net.edges[next].length;
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

console.log('traffic.check: ok — diurnal, замын байрлал, сүлжээ, уулзвар, car-following, эрэлт');
