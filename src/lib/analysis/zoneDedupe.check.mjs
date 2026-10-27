/**
 * БҮСИЙН ДАВХАРДСАН КОД (2026-10-21, аудит) — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/analysis/zoneDedupe.check.mjs
 *
 * Хамгаалах алдаа: бүсийн давхаргад «X-13» ХОЁР мөртэй (objectid 12 нүхтэй 12,442 м², objectid 47 ижил гадна
 * цагираг 20,347 м²) — хоёулаа тусдаа `Zone` болбол ногооны нийлбэр давхар, бүсийн тоо 58 (57 код). Том полигон
 * үлдэнэ, байрлал нь эхний мөрийнх; кодгүй мөр хөндөгдөхгүй; давхардлыг нэрээр нь буцаана (`console.warn`).
 */
import assert from 'node:assert/strict';
import { dedupeZoneFeats } from '@/lib/analysis/data';

const F = (oid, id, area) => ({ attributes: { objectid: oid, refname_1: id, SHAPE__Area: area } });
const idOf = (a) => String(a.refname_1 ?? '').replace(/\s+/g, '');
const areaOf = (a) => Number(a.SHAPE__Area) || 0;
const oids = (r) => r.feats.map((f) => f.attributes.objectid);

/* 1. X-13: 12 (12,442) ба 47 (20,347) — том нь үлдэнэ, эхний мөрийн БАЙРЛАЛД */
const r = dedupeZoneFeats([F(1, 'A-1', 100), F(12, 'X-13', 12442), F(3, 'B-2', 50), F(47, 'X-13', 20347)], idOf, areaOf);
assert.deepEqual(oids(r), [1, 47, 3]);
assert.deepEqual(r.dups, ['X-13']);

/* 2. Давхардалгүй — өөрчлөгдөхгүй, dups хоосон */
const s = dedupeZoneFeats([F(1, 'A-1', 100), F(2, 'A-2', 10)], idOf, areaOf);
assert.deepEqual(oids(s), [1, 2]);
assert.deepEqual(s.dups, []);

/* 3. Эхнийх нь том бол эхнийх үлдэнэ; кодгүй мөрүүд нэгтгэгдэхгүй */
const t = dedupeZoneFeats([F(5, 'C-1', 300), F(6, 'C-1', 200), F(7, '', 1), F(8, '', 2)], idOf, areaOf);
assert.deepEqual(oids(t), [5, 7, 8]);
assert.deepEqual(t.dups, ['C-1']);

/* 4. Талбай тэнцүү → эхнийх (тогтвортой); гурав давхардсан → хамгийн том */
assert.deepEqual(oids(dedupeZoneFeats([F(9, 'D-1', 10), F(10, 'D-1', 10)], idOf, areaOf)), [9]);
assert.deepEqual(oids(dedupeZoneFeats([F(11, 'E-1', 5), F(12, 'E-1', 50), F(13, 'E-1', 20)], idOf, areaOf)), [12]);

/* 5. Оролтыг ӨӨРЧЛӨХГҮЙ */
const inp = [F(1, 'A-1', 1), F(2, 'A-1', 2)];
dedupeZoneFeats(inp, idOf, areaOf);
assert.equal(inp.length, 2);

/* 6. ⚠️ 2026-10-22 (аудит): X-13 — objectid 12 (нүхтэй, K-6-тэй давхцалгүй) нь 47-оос (нүхгүй, K-6-г агуулна) ДЭЭР */
{
  const { interiorRingCount, planRecordMissing } = await import('@/lib/analysis/data');
  /* ESRI: гадна цагираг цагийн зүүний дагуу (y-дээш), нүх эсрэг */
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  const hole = [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]];
  assert.equal(interiorRingCount([outer]), 0);
  assert.equal(interiorRingCount([outer, hole]), 1);
  assert.equal(interiorRingCount(null), 0);
  const G = (oid, id, area, rings) => ({ attributes: { objectid: oid, refname_1: id, SHAPE__Area: area }, rings });
  const k6 = G(30, 'K-6', 7905, [hole]);
  const x47 = G(47, 'X-13', 20347, [outer]);
  const x12 = G(12, 'X-13', 12442, [outer, hole]);
  /* Давхцал: нүхгүй хуулбар K-6-г бүтнээр агуулна (7,905 м²), нүхтэй нь 0 */
  const overlapOf = (f, others) => (others.some((o) => o.attributes.refname_1 === 'K-6') && interiorRingCount(f.rings) === 0 ? 7905 : 0);
  const holesOf = (f) => interiorRingCount(f.rings);
  for (const order of [[x12, k6, x47], [x47, k6, x12]]) {
    const r6 = dedupeZoneFeats(order, idOf, areaOf, { holesOf, overlapOf });
    assert.deepEqual(r6.feats.map((f) => f.attributes.objectid).filter((o) => o !== 30), [12], `давхцалгүй хуулбар (дараалал ${order.map((f) => f.attributes.objectid)})`);
    assert.deepEqual(r6.dups, ['X-13']);
  }
  /* Давхцлын callback-гүй ч нүхтэй нь ялна; нүх ч тэнцүү бол том нь (хуучин дүрэм) */
  assert.deepEqual(oids(dedupeZoneFeats([x47, x12], idOf, areaOf, { holesOf })), [12]);
  assert.deepEqual(oids(dedupeZoneFeats([x12, x47], idOf, areaOf)), [47], 'сонголтгүй — том нь (нийцтэй)');
  /* Бүсийн бичлэг бүхэлдээ 0 (B-2) — өгөгдөлгүй; нэг нь ч утгатай бол бичлэг бий */
  assert.equal(planRecordMissing({ zoneFar: 0, zoneBcr: 0, normParking: 0, etIl: 0, etDald: 0 }), true);
  assert.equal(planRecordMissing({ zoneFar: null, zoneBcr: null, normParking: 0, etIl: 0, etDald: 0 }), true);
  assert.equal(planRecordMissing({ zoneFar: 1.2, zoneBcr: 0, normParking: 0, etIl: 0, etDald: 0 }), false);
  assert.equal(planRecordMissing({ zoneFar: 0, zoneBcr: 0, normParking: 0, etIl: 12, etDald: 0 }), false);
}

console.log('zoneDedupe.check: OK');
