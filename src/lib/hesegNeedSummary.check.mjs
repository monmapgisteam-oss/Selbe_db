import assert from 'node:assert/strict';
import { selectNeedLinks, selectNeedSegments, selectNeedUnresolved, summarizeNeed, UNASSIGNED_ZONE } from './hesegNeedSummary.ts';

const segment = (id, type, lengthM, zoneLengths) => ({ id, type, lengthM, zoneLengths, zoneGeometries: Object.fromEntries(Object.keys(zoneLengths).map((zone) => [zone, { zone }])), geometry: {} });
const res = {
  buildings: 4, unassignedBuildings: 1, availableTypes: ['water', 'heat'], unresolved: [],
  links: [
    { type: 'water', building: 0, zone: 'A', lengthM: 100, segmentIds: ['shared', 'a'] },
    { type: 'heat', building: 0, zone: 'A', lengthM: 200, segmentIds: ['heat'] },
    { type: 'water', building: 1, zone: 'A', lengthM: 30, segmentIds: ['shared'] },
    { type: 'water', building: 2, zone: 'B', lengthM: 500, segmentIds: ['b'] },
    { type: 'water', building: 3, zone: null, lengthM: 40, segmentIds: ['outside'] },
  ],
  segments: [segment('shared', 'water', 30, { A: 30 }), segment('a', 'water', 70, { A: 50, C: 20 }),
    segment('heat', 'heat', 200, { A: 200 }), segment('b', 'water', 500, { B: 500 }), segment('outside', 'water', 40, { [UNASSIGNED_ZONE]: 40 })],
  zones: [
    { label: 'A', existingM: 1000, existingByType: { water: 400, heat: 600 }, buildings: 2, geometry: null },
    { label: 'B', existingM: 20, existingByType: { water: 20 }, buildings: 1, geometry: null },
    { label: 'C', existingM: 0, existingByType: {}, buildings: 0, geometry: null },
  ],
};
const all = { maxM: 30, type: null, zone: null, priorityOnly: false };
assert.equal(selectNeedLinks(res, all).length, 5, 'анхдагчаар богино холболтыг нуухгүй');
assert.equal(selectNeedLinks(res, { ...all, priorityOnly: true }).length, 4, 'сонголттой үед босгоос урт холболтыг шүүнэ');
const summary = summarizeNeed(res, all);
assert.equal(summary.unserved, 4, 'хоёр системтэй барилгыг нэг тоолно');
assert.equal(summary.lengthM, 840, 'дундын хэсгийг давхар нэмэхгүй');
assert.equal(summary.zones[0].label, 'B', 'одоо байгаа том сүлжээ биш шинэ физик уртаар эрэмбэлнэ');
assert.equal(summary.rows.find((row) => row.type === 'power').available, false);

const combined = { ...all, type: 'water', zone: 'A' };
assert.deepEqual(selectNeedLinks(res, combined).map((link) => link.building), [0, 1]);
const filtered = summarizeNeed(res, combined);
assert.equal(filtered.unserved, 2);
assert.equal(filtered.buildings, 2);
assert.equal(filtered.lengthM, 80, 'KPI бүсээр тайрсан физик урттай ижил');
assert.equal(filtered.zones.find((zone) => zone.label === 'A').existingM, 400);
assert.equal(filtered.zones.find((zone) => zone.label === 'A').totalM, 480);
assert.equal(filtered.rows.find((row) => row.type === 'water').lengthM, 80);

// Барилгагүй дамжин өнгөрөх бүсийн шугам зураг, KPI, жагсаалтад нэг ижил харагдана.
const transit = summarizeNeed(res, { ...all, zone: 'C' });
assert.equal(transit.unserved, 0);
assert.equal(transit.lengthM, 20);
const transitSegments = selectNeedSegments(res, selectNeedLinks(res, all), 'C');
assert.equal(transitSegments.length, 1);
assert.equal(transitSegments[0].lengthM, 20);
assert.deepEqual(transitSegments[0].geometry, { zone: 'C' });

const unknown = summarizeNeed(res, { ...all, zone: UNASSIGNED_ZONE });
assert.equal(unknown.buildings, 1);
assert.equal(unknown.lengthM, 40);
assert.ok(summarizeNeed({ ...res, unassignedBuildings: 0 }, all).zones.some((zone) => zone.label === UNASSIGNED_ZONE), 'барилгагүй ч бүсээс гадуур физик шугамын мөр байна');
assert.equal(selectNeedLinks(res, { ...all, maxM: 500 }).length, 5, 'зай өөрчлөхөд анхдагч бүх трасс хэвээр');
assert.equal(selectNeedLinks(res, { ...all, maxM: 500, priorityOnly: true }).length, 0);

// Шийдэгдээгүй шаардлагыг хасахгүй; олон системтэй барилгыг нийтэд нэг удаа тоолно.
{
  const withUnknown = {
    ...res,
    buildings: 7,
    links: [...res.links,
      { type: 'water', building: 5, zone: 'A', lengthM: 0, segmentIds: [] },
      { type: 'heat', building: 6, zone: 'B', lengthM: 0, segmentIds: [] },
      { type: 'heat', building: 6, zone: 'B', lengthM: 0, segmentIds: [] },
    ],
    unresolved: [
      { type: 'power', building: 0, zone: 'A', reason: 'no-source' },
      { type: 'water', building: 4, zone: 'A', reason: 'disconnected' },
      { type: 'heat', building: 4, zone: 'A', reason: 'no-access' },
      { type: 'water', building: 4, zone: 'A', reason: 'disconnected' },
      { type: 'water', building: 5, zone: 'A', reason: 'no-source' },
    ],
  };
  const overall = summarizeNeed(withUnknown, all);
  assert.equal(overall.requiredBuildings, 5, '0 м холбоостой хоёр барилга хэрэгцээнд орохгүй');
  assert.equal(overall.routedBuildings, 4);
  assert.equal(overall.unresolvedBuildings, 2, 'хоёр үл мэдэгдэх системтэй нэг барилга нэг тоологдоно');
  assert.equal(overall.unresolvedConnections, 3);
  assert.equal(overall.requiredConnections, 8);
  assert.equal(overall.connectionLengthM, 840, 'үл мэдэгдэх уртыг зохиож нэмэхгүй');
  assert.equal(overall.alreadyConnected, 2, '0 м давхар хосыг нэг тоолно');
  assert.equal(selectNeedUnresolved(withUnknown, all).length, 3, '0 м батлагдсан хосын хуучин алдааг хэрэгцээнд оруулахгүй');
  const zone = overall.zones.find((item) => item.label === 'A');
  assert.equal(zone.requiredBuildings, 3);
  assert.equal(zone.routedBuildings, 2);
  assert.equal(zone.unresolvedBuildings, 2);
  assert.equal(zone.connectionLengthM, 300, 'эдгээр барилгад үйлчлэх бүтэн дундын сүлжээ');
  assert.equal(zone.addM, 280, 'бүс доторх физик урт тусдаа');
  const water = overall.rows.find((row) => row.type === 'water');
  assert.equal(water.requiredBuildings, 5);
  assert.equal(water.unresolvedConnections, 1);
  const power = overall.rows.find((row) => row.type === 'power');
  assert.equal(power.requiredBuildings, 1);
  assert.equal(power.connectionLengthM, 0);
  assert.equal(power.unresolvedConnections, 1, '0 м тооцоолсон урттай ч үл мэдэгдэх шаардлага ил тод үлдэнэ');
  const prioritized = summarizeNeed(withUnknown, { ...all, priorityOnly: true, zone: 'A' });
  assert.equal(prioritized.requiredBuildings, 2, 'богино маршрутыг шүүсэн ч үл мэдэгдэх урттай хэрэгцээ үлдэнэ');
  assert.equal(prioritized.unresolvedConnections, 3);
}

// Барилгад хүрэх бүх маршрутын уртыг бүсээр тайрсан транзит урттай андуурахгүй.
assert.equal(filtered.connectionLengthM, 100);
assert.equal(filtered.lengthM, 80);
assert.equal(transit.requiredBuildings, 0);
assert.equal(transit.connectionLengthM, 0);
assert.equal(transit.lengthM, 20);
console.log('hesegNeedSummary.check: OK');
