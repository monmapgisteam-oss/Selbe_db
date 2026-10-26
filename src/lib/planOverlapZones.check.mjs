import assert from 'node:assert/strict';
import { buildOverlapDisplay, individualZoneIdentity, rankOverlapZones } from './planOverlapZones.ts';
import { overlapScopeFocus, visibleOverlapItems } from './planOverlapSelection.ts';

// Нэгж урттай хэсгүүдээр давхардал, хилээр тайралт, тусдаа цэгийн тоог шалгана.
const geom = (start, end, point = false) => ({ cells: new Set(Array.from({ length: end - start }, (_, index) => start + index)), point });
const input = [
  { feature: 'infra:1:7', type: 'heat', layer: 'Heat', cat: 'build', geometry: geom(0, 10) },
  { feature: 'infra:1:7', type: 'heat', layer: 'Heat', cat: 'road', geometry: geom(5, 15) },
  { feature: 'infra:1:7', type: 'heat', layer: 'Heat', cat: 'build', geometry: geom(0, 10) },
  { feature: 'infra:2:7', type: 'water', layer: 'Water', cat: 'road', geometry: geom(10, 15) },
  { feature: 'infra:3:7', type: 'heat', layer: 'Well', cat: 'build', geometry: geom(8, 9, true) },
];
const zones = [
  { id: 'rd:2:1', oid: '1', label: 'Commercial', geometry: geom(0, 8) },
  { id: 'rd:2:2', oid: '2', label: 'Commercial', geometry: geom(8, 15) },
  { id: 'rd:2:3', oid: '3', label: '', geometry: geom(30, 40) },
];
const ops = {
  union: async (items) => ({ cells: new Set(items.flatMap((item) => [...item.cells])), point: items[0].point }),
  intersectMany: async (items, zone) => items.map((item) => ({ cells: new Set([...item.cells].filter((cell) => zone.cells.has(cell))), point: item.point })),
  touches: (item, zone) => [...item.cells].some((cell) => zone.cells.has(cell)),
  isEmpty: (item) => !item?.cells.size,
  lengthM: (item) => item.point ? 0 : item.cells.size,
};
const all = await buildOverlapDisplay(input, zones, ops);
assert.equal(all.lengthM, 20, 'Нэг эх шугамын давхардсан ангилал/полигон нэг л удаа тоологдоно');
assert.equal(all.count, 3, 'Ижил OID-той өөр эх давхаргууд тусдаа инженерийн объект');
assert.deepEqual(all.zones.map((zone) => [zone.id, zone.lengthM, zone.count]), [
  ['rd:2:2', 12, 3], ['rd:2:1', 8, 1], ['rd:2:3', 0, 0],
], 'Ижил нэртэй тусдаа бүс, хоосон бүс бүгд бодит буурах эрэмбэд үлдэнэ');
assert.deepEqual(all.zones[0].pieces[0].geometry.cells, new Set([8, 9, 10, 11, 12, 13, 14]), 'Зурагт очих геометр тухайн бүсээр бодитоор тайрагдсан');

const selected = { side: 'next', cat: 'build', layer: 'Heat', zone: 'rd:2:2' };
const filtered = visibleOverlapItems(input, 'next', ['build', 'road'], overlapScopeFocus(selected));
const scoped = await buildOverlapDisplay(filtered, zones, ops);
assert.equal(scoped.lengthM, 10, 'Давхарга ба ангиллын хамтарсан шүүлт бусад эх объектыг оруулахгүй');
assert.equal(scoped.zones.find((zone) => zone.id === 'rd:2:2').lengthM, 2);
assert.deepEqual(visibleOverlapItems(all.zones[0].pieces, 'next', ['build', 'road'], selected).map((piece) => piece.feature), ['infra:1:7']);
assert.equal(visibleOverlapItems(all.pieces, 'next', ['build', 'road'], selected).length, 0, 'Бүсээр тайраагүй геометр бүс сонголтод харагдахгүй');
const empty = await buildOverlapDisplay([], zones, ops);
assert.equal(empty.zones.length, 3);
assert.ok(empty.zones.every((zone) => zone.count === 0 && zone.lengthM === 0));
assert.deepEqual(rankOverlapZones([
  { oid: '10', lengthM: 5, count: 1 }, { oid: '3', lengthM: 5, count: 2 }, { oid: '2', lengthM: 5, count: 1 },
]).map((zone) => zone.oid), ['3', '2', '10'], 'Урт тэнцүү бол объектын тоо, дараа нь тогтвортой тоон OID-оор эрэмбэлнэ');

assert.deepEqual(individualZoneIdentity({ objectid: 8, zone: 'Commercial' }, 'objectid'), { id: 'rd:2:8', oid: '8', label: 'Commercial' });
assert.deepEqual(individualZoneIdentity({ objectid: 9 }, 'objectid'), { id: 'rd:2:9', oid: '9', label: '' });
assert.throws(() => individualZoneIdentity({ zone: 'Commercial' }, 'objectid'));
console.log('Бүсийн давхцал: давхардалгүй урт, тусдаа OID, 0 бүс, тайрсан геометр, хамтарсан шүүлт — OK');
