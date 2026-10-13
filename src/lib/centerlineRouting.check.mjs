import assert from 'node:assert/strict';
import { polygonCenterlines } from './polygonCenterline.ts';
import { buildRoutingGraph, routeUtilityNetwork, segmentCrossesBuilding } from './utilityRouting.ts';

// Полигон → тэнхлэг → граф → инженерийн трасс гэсэн бүтэн замыг шалгана.
const road = [[0, 0], [100, 0], [100, 10], [55, 10], [55, 65], [45, 65], [45, 10], [0, 10], [0, 0]];
const rectangle = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const footprints = [rectangle(80, 18, 8, 8), rectangle(63, 45, 8, 8)];
const source = [[-5, -5], [-5, 15]];

function scenario(scale, offset) {
  const project = (p) => [offset[0] + p[0] / scale, offset[1] + p[1] / scale];
  const ring = road.map(project);
  const buildings = footprints.map((footprint, id) => ({ id, rings: [footprint.map(project)] }));
  const centerline = polygonCenterlines([ring], { resolution: 0.5 / scale });
  assert.equal(centerline.complete, true, 'Энгийн T коридор бүрэн тэнхлэгтэй');
  const graph = buildRoutingGraph({
    corridors: centerline.paths, corridorPolygons: [[ring]], buildings,
    metersPerUnit: scale, spacingM: 4, maxAccessM: 18, maxTieM: 10,
  });
  const routed = routeUtilityNetwork(graph, [source.map(project)], buildings);
  assert.equal(routed.unresolved.length, 0, 'Хоёр салааны барилга эх үүсвэртэй холбогдоно');
  assert.equal(routed.routes.length, 2);
  assert.ok(routed.segments.some((segment) => segment.kind === 'corridor' && segment.buildings.length === 2),
    'Барилгууд дундын үндсэн шугам ашиглана');
  for (const segment of routed.segments) {
    assert.ok(segment.lengthM > 0);
    for (const building of buildings) assert.equal(segmentCrossesBuilding(segment.path[0], segment.path[1], building.rings), false,
      'Салаа, дундын шугам, эх үүсвэрийн холболт барилгын дотуур дайрахгүй');
  }
  const uniqueLength = routed.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  assert.ok(uniqueLength < routed.routes.reduce((sum, route) => sum + route.lengthM, 0), 'Дундын уртыг давхар тоолохгүй');
  for (const route of routed.routes) {
    const ids = new Set(route.segmentIds);
    const measured = routed.segments.filter((segment) => ids.has(segment.id)).reduce((sum, segment) => sum + segment.lengthM, 0);
    assert.ok(Math.abs(measured - route.lengthM) < 0.005, 'Барилгын зам нь физик хэсгүүдийн нийлбэртэй таарна');
    const end = route.path.at(-1);
    assert.ok(Math.abs(end[0] - project(source[0])[0]) < 0.001, 'Трасс эх үүсвэр дээр төгсөнө');
  }
  return uniqueLength;
}

const local = scenario(1, [0, 0]);
const projected = scenario(0.67, [11_900_000, 6_100_000]);
assert.ok(Math.abs(local - projected) < 1, 'Web Mercator координат ба газрын масштабтай үед урт тогтвортой');
console.log('✓ Полигон тэнхлэг → коридорын граф → барилгын хамтарсан трасс');
