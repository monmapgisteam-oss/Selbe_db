/**
 * IoT МЭДРЭГЧ — хөрсний мэдрэгчийн гэмтэл (2026-11-06).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sensors.check.mjs
 *
 * Хамгаалж буй алдаа: гэмтсэн мэдрэгч чийг 654.36 ба температур −1 гэж зэрэг бичдэг (амьд: сүүлийн 3,000 мөрийн 1,460).
 * −1 °C нь дангаараа боломжит утга тул температурын карт, чартад бодит заалт мэт гарч байв.
 */
import assert from 'node:assert/strict';

const { SENSORS, siblingFault } = await import('@/lib/sensors.ts');

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
console.log('sensors.check: OK');
