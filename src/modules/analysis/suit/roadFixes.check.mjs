/**
 * ЗАМЫН СИМУЛЯЦ / ТЭЭВРИЙН ЗАСВАРУУД — 2026-10-01, «хэрэглэгч: бүгдийг зас».
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/analysis/suit/roadFixes.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. `markDuplicates` орон зайн тортой — үр дүн хуучин O(E²) аргатай ЯГ ИЖИЛ.
 *   2. Уулзварын нэрийг хэвшүүлж тааруулна (захын зай, том/жижиг үсэг, давхар зай).
 *   3. Фреймийн сим-хугацаа 0.2 сек-ийн дэд алхмуудад хуваагдана (×60 хурд).
 *   4. Бүх сүлжээнд НЭГ машины таг (`commonCarCap`).
 *   5. Замын эрэлт ДАВХАРДСАН ирмэгт хуваагдахгүй.
 *   6. UI холболт (эх кодоор): дэд алхам, нийтлэг таг, эрэлт→таг/дохио, сүлжээ
 *      сонгогч тээврийн самбарт, оргил цагийн товч, далд табд зогсох, эрэлтийн олонлог.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIGNAL_PLANS, STEP_DT_MAX, buildNetwork, carCapacity, commonCarCap, distToSeg,
  junctionStages, markDuplicates, normJunction, signalPhase, subSteps,
} from './traffic.ts';
import { assignRoadDemand } from './roadDemand.ts';

/* ══════ 1. markDuplicates — тор ба бүдүүлэг арга ИЖИЛ ══════ */

/** Хуучин O(E²) хэрэгжүүлэлт — ЛАВЛАГАА (2026-10-01-ээс өмнөх код) */
function bruteMark(net, tolM = 1.0, cover = 0.85) {
  const upm = net.unitsPerMeter || 1;
  const tol = tolM * upm;
  const order = net.edges.map((_, i) => i).sort((a, b) => net.edges[b].length - net.edges[a].length);
  const covered = (A, B) => {
    let hit = 0;
    for (const p of A.pts) {
      let best = Infinity;
      for (let i = 1; i < B.pts.length && best > tol; i++) {
        const d = distToSeg(p, B.pts[i - 1], B.pts[i]);
        if (d < best) best = d;
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
}

{
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 6; trial++) {
    const paths = [];
    for (let k = 0; k < 140; k++) {
      const x = rnd() * 1500;
      const y = rnd() * 1500;
      const n = 2 + Math.floor(rnd() * 3);
      const p = [[x, y]];
      for (let v = 1; v < n; v++) p.push([p[v - 1][0] + (rnd() - 0.5) * 160, p[v - 1][1] + (rnd() - 0.5) * 160]);
      paths.push(p);
    }
    /* Хуулбарууд — 0…1.4 м шилжсэн (зарим нь хүлцлээс гадна), зарим нь хэсэгчилсэн */
    for (let k = 0; k < 60; k++) {
      const src = paths[Math.floor(rnd() * 140)];
      const off = rnd() * 1.4;
      const part = rnd() < 0.3 ? src.slice(0, 2) : src;
      paths.push(part.map(([x, y]) => [x + off, y]));
    }
    const a = buildNetwork(paths);
    const b = buildNetwork(paths);
    const na = markDuplicates(a);
    const nb = bruteMark(b);
    assert.equal(na, nb, `тэмдэглэсэн тоо зөрөв (${na} ≠ ${nb})`);
    assert.deepEqual(a.edges.map((e) => !!e.dup), b.edges.map((e) => !!e.dup), 'dup тэмдэг зөрөв');
    assert.ok(na > 0, 'хуулбар олдсонгүй — тест сул');
  }
}

/* ══════ 2. Уулзварын нэрийн хэвшүүлэлт ══════ */
{
  const real = SIGNAL_PLANS.find((p) => p.key === 'real');
  assert.equal(normJunction('  1-Р  ГЭРЛЭН дохио '), normJunction('1-р гэрлэн дохио'));
  assert.deepEqual(junctionStages(real, '1-р гэрлэн дохио'), [[3, 4, 7, 8], [1, 6], [2, 5]]);
  assert.deepEqual(junctionStages(real, '2-р гэрлэн дохио '), [[1, 2], [3, 4], [5, 6]], 'захын зай');
  assert.deepEqual(junctionStages(real, '2-Р ГЭРЛЭН  ДОХИО'), [[1, 2], [3, 4], [5, 6]], 'том үсэг, давхар зай');
  assert.equal(junctionStages(real, 'байхгүй уулзвар'), null);
  /* `signalPhase` ч хэвшүүлсэн нэрээр уулзварын хуваарийг авна: 2-р уулзварт
     код 3 нь 2-р ээлжинд ногоон (фоллбэк `stages`-д 1-р ээлжинд) */
  const share = real.cycle / 3;
  const t2 = share + 1;
  assert.equal(signalPhase(3, t2, real, ' 2-р гэрлэн дохио'), 'green');
  assert.equal(signalPhase(3, 1, real, ' 2-р гэрлэн дохио'), 'red');
}

/* ══════ 3. Дэд алхам ══════ */
{
  assert.equal(STEP_DT_MAX, 0.2);
  const s = subSteps(0.208);
  assert.equal(s.length, 2);
  assert.ok(s.every((h) => h <= STEP_DT_MAX + 1e-12));
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 0.208) < 1e-12);
  assert.deepEqual(subSteps(0.2), [0.2], 'яг хязгаар — нэг алхам');
  assert.deepEqual(subSteps(0.05), [0.05]);
  assert.deepEqual(subSteps(0), []);
  assert.deepEqual(subSteps(-1), []);
}

/* ══════ 4. Нийтлэг машины таг ══════ */
{
  assert.equal(commonCarCap(5355, [2048, 4100]), 2048, 'хамгийн бага багтаамж');
  assert.equal(commonCarCap(1500, [2048, 4100]), 1500, 'эрэлт багтаамжаас бага');
  assert.equal(commonCarCap(1500, []), 1500, 'багтаамж мэдэгдэхгүй — эрэлт');
  assert.equal(commonCarCap(0.2, [10]), 1, 'доод хязгаар 1');
  /* Хоёр сүлжээ ИЖИЛ таг авна — сүлжээ бүрийн `carCapacity` хамаагүй */
  const small = buildNetwork([[[0, 0], [300, 0]]]);
  const big = buildNetwork([[[0, 0], [3000, 0]]]);
  const cap = commonCarCap(5000, [carCapacity(small), carCapacity(big)]);
  assert.equal(cap, carCapacity(small));
}

/* ══════ 5. Эрэлт давхардсан ирмэгт хуваагдахгүй ══════ */
{
  const net = buildNetwork([
    [[0, 0], [200, 0]],
    [[0, 0.3], [200, 0.3]], // хуулбар
  ]);
  markDuplicates(net);
  const dupIdx = net.edges.findIndex((e) => e.dup);
  assert.ok(dupIdx >= 0, 'хуулбар тэмдэглэгдсэнгүй');
  const b = { oid: 1, purpose: '', cat: 'residential', population: 100, capacity: 0, trips: 50, vehTrips: 20, x: 100, y: 5, rings: [], zone: null, block: null };
  const d = assignRoadDemand(net, [b]);
  assert.equal(d.edgeDemand[dupIdx], 0, 'хуулбар ирмэг эрэлт авлаа');
  assert.ok(Math.abs(d.assigned - 20) < 1e-9, 'эрэлт бүтнээрээ хуваарилагдсангүй');
}

/* ══════ 6. UI холболт (эх кодоор) ══════ */
{
  const here = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const ov = here('./TrafficOverlay.tsx');
  assert.ok(ov.includes('for (const h of subSteps(dtSim))'), 'дэд алхам');
  assert.ok(!ov.includes('const capNet = carCapacity(net)') && !/maxCars, capNet\)/.test(ov), 'сүлжээ бүрийн таг үлдэв');
  const suit = here('../Suitability.tsx');
  assert.ok(suit.includes('peakVehicles(rows)'), 'эрэлт assignLoads-тэй ижил олонлог');
  assert.ok(suit.includes('maxCars: carCap'), 'нийтлэг таг');
  assert.ok(suit.includes('net={netSel}'), 'тээврийн самбарт сүлжээ сонгогч');
  assert.ok(suit.includes('indicators={indicators}'), 'эрэмбийн CSV-д үзүүлэлтүүд');
  const panel = here('./SimulationPanel.tsx');
  assert.ok(panel.includes("tr('Машин: эрэлт {0} → таг {1}'"));
  assert.ok(panel.includes("tr('Гэрлэн дохио: {0} уулзвар ачаалагдсан'"));
  const tp = here('./TransportPanel.tsx');
  assert.ok(tp.includes('<NetSelector net={net} />'));
  const tl = here('./Timeline.tsx');
  assert.ok(tl.includes('min: 8 * 60') && tl.includes('min: 18 * 60'), 'оргил цагийн товч');
  assert.ok(tl.includes("addEventListener('visibilitychange'"), 'далд табд зогсох');
}

console.log('roadFixes.check: OK');
