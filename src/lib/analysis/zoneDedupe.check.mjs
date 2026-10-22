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

const F = (oid, id, area) => ({ attributes: { OBJECTID: oid, RefName_1: id, Shape__Area: area } });
const idOf = (a) => String(a.RefName_1 ?? '').replace(/\s+/g, '');
const areaOf = (a) => Number(a.Shape__Area) || 0;
const oids = (r) => r.feats.map((f) => f.attributes.OBJECTID);

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

console.log('zoneDedupe.check: OK');
