/** Offline regression: actual ArcGIS geometries, independent of service credentials. */
import assert from 'node:assert/strict';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine.js';
import { measureChangeGeometry, sourceChangePieces, changeMeasurementState, compareChangeQuantity, CHANGE_ITEMS } from './hesegChange.ts';
import { polygonCenterlines } from './polygonCenterline.ts';
import { LAYER_BY_ID, layerUrl } from './services.ts';
import { PLAN2D_LAYERS } from './plan2d.ts';

const rect = (xmin, ymin, xmax, ymax, reverse = false) => {
  const ring = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax], [xmin, ymin]];
  return new Polygon({ spatialReference: { wkid: 3857 }, rings: [reverse ? ring.reverse() : ring] });
};
const close = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

// Valid counterclockwise road polygons have negative SDK signed area; never report zero.
const road = rect(0, 0, 1000, 20);
assert.ok(geometryEngine.geodesicArea(road, 'square-meters') < 0);
assert.ok(measureChangeGeometry(road, 'area') > 19_000);
close(measureChangeGeometry(road, 'area'), measureChangeGeometry(rect(0, 0, 1000, 20, true), 'area'));

// Only actual polyline geometry may enter length totals; polygon perimeter is rejected.
const line = new Polyline({ spatialReference: { wkid: 3857 }, paths: [[[0, 0], [1000, 0]]] });
close(measureChangeGeometry(line, 'len'), 1000);
assert.throws(() => measureChangeGeometry(road, 'len'), /centerline/);
assert.equal(measureChangeGeometry(line, 'area'), 0);
assert.equal(measureChangeGeometry(road, 'count'), 1);

// Both old and new road quantities must use the same boundary, preserving actual area.
const boundary = rect(0, -10, 500, 40);
const clipped = geometryEngine.intersect(road, boundary);
assert.ok(clipped);
close(measureChangeGeometry(clipped, 'area'), measureChangeGeometry(road, 'area') / 2);
const outside = geometryEngine.difference(road, boundary);
assert.ok(outside);
close(measureChangeGeometry(clipped, 'area') + measureChangeGeometry(outside, 'area'), measureChangeGeometry(road, 'area'));
const result = polygonCenterlines(road.rings, { resolution: 0.5 });
assert.equal(result.complete, true);
const centerline = new Polyline({ spatialReference: { wkid: 3857 }, paths: result.paths });
const clippedLine = geometryEngine.intersect(centerline, boundary);
const outsideLine = geometryEngine.difference(centerline, boundary);
close(measureChangeGeometry(centerline, 'len'), 1000);
close(measureChangeGeometry(clippedLine, 'len'), 500);
close(measureChangeGeometry(clippedLine, 'len') + measureChangeGeometry(outsideLine, 'len'), measureChangeGeometry(centerline, 'len'));

// Map selection uses source polygons and IDs; calculated centerlines stay statistical data.
const mapPieces = sourceChangePieces([{ layer: 'sb:2', geom: road }, { layer: 'rd:0', geom: clipped }]);
assert.deepEqual(mapPieces.map((p) => p.layer), ['sb:2', 'rd:0']);
assert.equal(mapPieces[0].geometry, road);
assert.equal(mapPieces[1].geometry, clipped);
assert.ok(mapPieces.every((p) => p.geometry.type === 'polygon'));
assert.throws(() => sourceChangePieces([{ layer: 'rd:0', geom: centerline }]), /source polygons/);
const complete = {
  old: 100, nextCmp: 130, oldComplete: true, nextComplete: true,
  oldSourceComplete: true, nextSourceComplete: true, oldMeasurementAvailable: true, nextMeasurementAvailable: true,
};
const unavailable = { delta: null, percent: null, status: 'unavailable' };
assert.deepEqual(compareChangeQuantity(complete), { delta: 30, percent: 30, status: 'complete' });
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: 80 }), { delta: -20, percent: -20, status: 'complete' });
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: 100 }), { delta: 0, percent: 0, status: 'complete' });
assert.deepEqual(compareChangeQuantity({ ...complete, old: 0 }), { delta: 130, percent: null, status: 'complete' });
assert.deepEqual(compareChangeQuantity({ ...complete, old: 0, nextCmp: 0 }), { delta: 0, percent: null, status: 'complete' });

// Both displayed measurements remain comparable even when a portion could not be calculated.
assert.deepEqual(compareChangeQuantity({ ...complete, oldComplete: false }), { delta: 30, percent: 30, status: 'partial' });
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: 80, nextComplete: false }), { delta: -20, percent: -20, status: 'partial' });
assert.deepEqual(compareChangeQuantity({ ...complete, oldComplete: false, nextComplete: false }), { delta: 30, percent: 30, status: 'partial' });
const partial = changeMeasurementState({ sourceComplete: true, calculationComplete: false, sourceCount: 5, measurementCount: 3 });
assert.deepEqual(partial, { available: true, complete: false });
assert.deepEqual(compareChangeQuantity({ ...complete, nextComplete: partial.complete, nextMeasurementAvailable: partial.available }), { delta: 30, percent: 30, status: 'partial' });

// A missing/unloaded source must never produce a -100% change from an internal numeric zero.
assert.deepEqual(compareChangeQuantity({ ...complete, old: null }), unavailable);
assert.deepEqual(compareChangeQuantity({ ...complete, oldSourceComplete: false }), unavailable);
assert.deepEqual(compareChangeQuantity({ ...complete, nextSourceComplete: false, nextCmp: 0 }), unavailable);
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: NaN }), unavailable);
assert.deepEqual(changeMeasurementState({ sourceComplete: false, calculationComplete: true, sourceCount: 0, measurementCount: 0 }), { available: false, complete: false });
assert.deepEqual(changeMeasurementState({ sourceComplete: false, calculationComplete: false, sourceCount: 5, measurementCount: 3 }), { available: false, complete: false });

// Unresolved polygons with no calculated path are unknown, not valid zero measurements.
const unresolved = changeMeasurementState({ sourceComplete: true, calculationComplete: false, sourceCount: 5, measurementCount: 0 });
assert.deepEqual(unresolved, { available: false, complete: false });
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: 0, nextComplete: unresolved.complete, nextMeasurementAvailable: unresolved.available }), unavailable);
assert.deepEqual(compareChangeQuantity({ ...complete, old: 0, oldComplete: unresolved.complete, oldMeasurementAvailable: unresolved.available }), unavailable);

// Empty data or a verified empty selected scope retain real zero, even if unrelated geometry failed.
const scopedZero = changeMeasurementState({ sourceComplete: true, calculationComplete: false, sourceCount: 0, measurementCount: 0 });
assert.deepEqual(scopedZero, { available: true, complete: true });
assert.deepEqual(compareChangeQuantity({ ...complete, nextCmp: 0, nextComplete: scopedZero.complete, nextMeasurementAvailable: scopedZero.available }), { delta: -100, percent: -100, status: 'complete' });
assert.deepEqual(changeMeasurementState({ sourceComplete: true, calculationComplete: true, sourceCount: 0, measurementCount: 0 }), { available: true, complete: true });
assert.deepEqual(changeMeasurementState({ sourceComplete: true, calculationComplete: true, sourceCount: 5, measurementCount: 0 }), { available: true, complete: true }, 'A fully calculated centerline can lie outside a scope that touches its road polygon');

// The original supplied road polygons, not unrelated traffic simulation lines, are compared.
const item = CHANGE_ITEMS.find((x) => x.key === 'road');
assert.deepEqual(item.now, ['sb:2']);
assert.deepEqual(item.next, ['rd:0']);
/* 2026-10-14: автозам БҮТНЭЭР харьцуулна; «Сэлбэ 1 хил» нь зөвхөн дотор/гадуур ЗАДАРГАА (`boundary`) */
assert.equal(item.old, 'all');
assert.equal(CHANGE_ITEMS.find((x) => x.key === 'zone').old, 'all', 'All old zones participate in both count and area comparison');

// Old green is the actual full masterplan polygon, never its clipped analysis variant or trees.
const green = CHANGE_ITEMS.find((x) => x.key === 'green');
assert.deepEqual(green.now, ['sb:1']);
assert.equal(green.old, 'all', 'Old masterplan green coverage is compared in full');
assert.equal(green.metric, 'area');
assert.ok(PLAN2D_LAYERS.some((layer) => layer.id === green.now[0] && layer.geom === 'area'));
assert.match(layerUrl(LAYER_BY_ID[green.now[0]]), /\/35$/);
assert.match(layerUrl(LAYER_BY_ID.nogoon), /\/118$/);
assert.notEqual(layerUrl(LAYER_BY_ID[green.now[0]]), layerUrl(LAYER_BY_ID.nogoon), 'The analysis copy omits green space outside the zoning');
assert.deepEqual(green.next, ['rd:6', 'rd:7', 'rd:8', 'rd:9', 'rd:12', 'rd:13']);
const oldGreen = rect(0, 0, 100, 100);
const nextGreen = rect(0, 0, 80, 100);
const oldGreenArea = measureChangeGeometry(oldGreen, green.metric);
const nextGreenArea = measureChangeGeometry(nextGreen, green.metric);
const greenChange = compareChangeQuantity({ ...complete, old: oldGreenArea, nextCmp: nextGreenArea });
assert.equal(greenChange.status, 'complete');
close(greenChange.delta, nextGreenArea - oldGreenArea);
close(greenChange.percent, -20);
const greenPieces = sourceChangePieces([{ layer: green.now[0], geom: oldGreen }, { layer: green.next[0], geom: nextGreen }]);
assert.deepEqual(greenPieces.map((piece) => piece.layer), ['sb:1', 'rd:6']);
assert.equal(greenPieces[0].geometry, oldGreen, 'The old polygon remains available for native old/new map comparison');
console.log('hesegChange: complete/partial deltas, missing-versus-zero measurements, centerline statistics, source maps, all zones and full old masterplan green comparison passed');
