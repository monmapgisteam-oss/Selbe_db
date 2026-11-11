/**
 * IoT МЭДРЭГЧ — хөрсний мэдрэгчийн гэмтэл (2026-11-06).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sensors.check.mjs
 *
 * Хамгаалж буй алдаа: гэмтсэн мэдрэгч чийг 654.36 ба температур −1 гэж зэрэг бичдэг (амьд: сүүлийн 3,000 мөрийн 1,460).
 * −1 °C нь дангаараа боломжит утга тул температурын карт, чартад бодит заалт мэт гарч байв.
 */
import assert from 'node:assert/strict';

const { SENSORS, siblingFault, summarize } = await import('@/lib/sensors.ts');

const soil = SENSORS.find((s) => s.key === 'soil');
const temp = soil.metrics.find((m) => m.key === 'temperature');
const MOIST = 'payload_decoded_data_moisture';
assert.equal(temp.faultWith?.field, MOIST, 'температур чийгтэй хамт шалгагдана');
assert.equal(siblingFault({ [MOIST]: 654.36 }, temp), true, 'чийг мужаас дээш');
assert.equal(siblingFault({ [MOIST]: -1 }, temp), true, 'чийг мужаас доош');
assert.equal(siblingFault({ [MOIST]: 21.5 }, temp), false, 'хэвийн чийг');
assert.equal(siblingFault({ [MOIST]: 100 }, temp), false, 'зааг мужид багтана');
assert.equal(siblingFault({ [MOIST]: null }, temp), false, 'чийггүй мөр — дүгнэхгүй');
assert.equal(siblingFault({}, temp), false);
assert.equal(siblingFault({ [MOIST]: 654.36 }, {}), false, '`faultWith`-гүй үзүүлэлт хөндөгдөхгүй');

/* Сүүлийн заалт мужаас гадуур (чийг 654.36) — «654.4 %r.h.» БИШ, `latest: null` (картад «—»), `fault` хэвээр (2026-11-09) */
const moist = soil.metrics.find((m) => m.key === 'moisture');
const T0 = Date.UTC(2026, 10, 9, 0, 0);
const okPts = [{ t: T0, v: 21.5 }, { t: T0 + 3_600_000, v: 22 }];
const badPts = [...okPts, { t: T0 + 7_200_000, v: 654.36 }];
const sBad = summarize(moist, badPts, badPts.length);
assert.equal(sBad.latest, null, 'гэмтэлтэй сүүлийн заалт харагдахгүй');
assert.equal(sBad.fault, true, 'гэмтэл тэмдэглэгдэнэ');
assert.equal(sBad.latestAt, T0 + 7_200_000, 'нас нь сүүлийн заалтаар');
assert.equal(sBad.max, 22, 'статистикт гэмтэлтэй утга орохгүй');
const sOk = summarize(moist, okPts, okPts.length);
assert.equal(sOk.latest, 22, 'хэвийн заалт хэвээр');
assert.equal(sOk.fault, false);

const iot = (await import('node:fs')).readFileSync(new URL('../modules/Iot.tsx', import.meta.url), 'utf8');
assert.match(iot, /has \? num\(c\.m\.latest \?\? 0, c\.m\.dp\) : '—'/, 'Iot карт `null`-ийг «—» гэж харуулна');
console.log('sensors.check: OK');
