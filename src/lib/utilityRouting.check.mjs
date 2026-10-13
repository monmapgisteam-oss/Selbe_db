import assert from 'node:assert/strict';
import { buildRoutingGraph, routeUtilityNetwork, segmentCrossesBuilding, insideBuilding } from './utilityRouting.ts';

const rect = (id, x1, y1, x2, y2) => ({ id, rings: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] });
const lengthFor = (result, ids) => {
  const selected = new Set(result.routes.filter((route) => ids.includes(route.building)).flatMap((route) => route.segmentIds));
  return result.segments.filter((segment) => selected.has(segment.id)).reduce((sum, segment) => sum + segment.lengthM, 0);
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

// Давхардсан хоёр эх үүсвэрийн холбоос 34 м биш, нийт 24 м физик шугам болно.
{
  const buildings = [rect(1, 9, 2, 11, 3), rect(2, 19, 2, 21, 3)];
  const graph = buildRoutingGraph({ corridors: [[[10, 0], [20, 0]]], buildings, spacingM: 10, maxAccessM: 3, maxTieM: 60 });
  const result = routeUtilityNetwork(graph, [[[0, -1], [0, 1]]], buildings);
  assert.equal(result.routes.length, 2);
  near(lengthFor(result, [1, 2]), 24);
  near(lengthFor(result, [1]), 12);
  near(lengthFor(result, [2]), 22);
  assert.ok(result.segments.some((segment) => segment.buildings.length === 2));
}

// Анхны оройгүй огтлолцол дээжийн алхмаас үл хамааран графын зангилаа болно.
{
  const buildings = [rect(1, -1, 22, 1, 24)];
  const graph = buildRoutingGraph({ corridors: [[[-20, 0], [20, 0]], [[0, -20], [0, 20]]], buildings, spacingM: 8, maxAccessM: 3, maxTieM: 1 });
  const result = routeUtilityNetwork(graph, [[[-20, -1], [-20, 1]]], buildings);
  assert.equal(result.unresolved.length, 0);
  assert.ok(graph.nodes.some(([x, y]) => x === 0 && y === 0));
  near(result.routes[0].lengthM, 42);
}

// Барилгын дундуур шулуун явахгүй; боломжтой коридороор тойрно.
{
  const target = rect(1, 22, -1, 24, 1), barrier = rect(99, 8, -3, 12, 3);
  const graph = buildRoutingGraph({ corridors: [[[0, 0], [20, 0]], [[0, 0], [0, 8], [20, 8], [20, 0]]], buildings: [target, barrier], spacingM: 4, maxAccessM: 3, maxTieM: 1 });
  const result = routeUtilityNetwork(graph, [[[0, -1], [0, 1]]], [target]);
  assert.equal(result.unresolved.length, 0);
  assert.ok(result.routes[0].lengthM > 30);
  for (const segment of result.segments) assert.equal(segmentCrossesBuilding(...segment.path, barrier.rings), false);
}

// Тасарсан коридорт шулуун орлуулалт гаргахгүй; шалтгааныг буцаана.
{
  const buildings = [rect(1, 62, -1, 64, 1)];
  const graph = buildRoutingGraph({ corridors: [[[0, 0], [10, 0]], [[50, 0], [60, 0]]], buildings, spacingM: 5, maxAccessM: 3, maxTieM: 1 });
  const result = routeUtilityNetwork(graph, [[[0, -1], [0, 1]]], buildings);
  assert.equal(result.routes.length, 0);
  assert.deepEqual(result.unresolved, [{ building: 1, reason: 'disconnected' }]);
  assert.equal(routeUtilityNetwork(graph, [], buildings).unresolved[0].reason, 'no-source');
}

// Одоо байгаа шугамтай хүрэлцсэн барилгад 0 м; коридоргүй гэсэн хуурамч алдаа үүсгэхгүй.
{
  const buildings = [rect(1, 0, 0, 2, 2)];
  const graph = buildRoutingGraph({ corridors: [], buildings });
  const result = routeUtilityNetwork(graph, [[[0, -1], [0, 3]]], buildings);
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.routes[0].lengthM, 0);
  assert.equal(result.segments.length, 0);
}

// Алсын CAD координат орон зайн хүснэгтийг хязгааргүй тэлэхгүй.
{
  const buildings = [rect(1, 9, 2, 11, 3)];
  const graph = buildRoutingGraph({ corridors: [[[0, 0], [10, 0]]], buildings, maxAccessM: 3, maxTieM: 1 });
  const result = routeUtilityNetwork(graph, [[[1e12, 1e12], [1e12 + 1e8, 1e12 + 1e8]], [[0, -1], [0, 1]]], buildings);
  assert.equal(result.routes.length, 1);
  assert.ok(result.routes[0].lengthM < 20);
}

// Жижиг саад, нүх, хүрээ шүргэх тохиолдлыг геометрийн огтлолцлоор шалгана.
{
  const tiny = rect(1, 5, -0.001, 5.001, 0.001);
  assert.equal(segmentCrossesBuilding([0, 0], [10, 0], tiny.rings), true);
  const polygon = [...rect(1, 0, 0, 10, 10).rings, ...rect(2, 3, 3, 7, 7).rings];
  assert.equal(insideBuilding([5, 5], polygon), false);
  assert.equal(segmentCrossesBuilding([4, 5], [6, 5], polygon), false);
  assert.equal(segmentCrossesBuilding([4, 5], [12, 5], polygon), true);
  assert.equal(segmentCrossesBuilding([0, 0], [10, 0], polygon), false);
}
console.log('utilityRouting.check: OK');
