/**
 * IoT МЭДРЭГЧ — хөрсний мэдрэгчийн гэмтэл (2026-11-06).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sensors.check.mjs
 *
 * Хамгаалж буй алдаа: гэмтсэн мэдрэгч чийг 654.36 ба температур −1 гэж зэрэг бичдэг (амьд: сүүлийн 3,000 мөрийн 1,460).
 * −1 °C нь дангаараа боломжит утга тул температурын карт, чартад бодит заалт мэт гарч байв.
 */
import assert from 'node:assert/strict';

const { SENSORS, siblingFault, summarize, dailyDiffPoints, dailySeries, UB_OFFSET_MS } = await import('@/lib/sensors.ts');

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

/* 2026-11-27 (аудит №43): татгалзсан заалт `faultValue`-д үлдэнэ (мэдэгдэлд «654.36» харагдана); хэвийн үед `null` */
assert.equal(sBad.faultValue, 654.36, 'мужаас гадуурх сүүлийн заалт');
assert.equal(sBad.faultRaw, false);
assert.equal(sOk.faultValue, null);
{
  const fill = SENSORS.find((s) => s.key === 'waste').metrics.find((m) => m.key === 'fill');
  const pts = [{ t: T0, v: 40 }];
  const s = summarize(fill, pts, 1, pts, T0 + 3_600_000, false, true, { v: 12, raw: true });
  assert.deepEqual([s.latest, s.fault, s.faultValue, s.faultRaw], [null, true, 12, true], 'түүхий мужаас гадуурх заалт (12 мм)');
  const old = summarize(fill, pts, 1, pts, T0 - 3_600_000, false, true, { v: 12, raw: true });
  assert.deepEqual([old.latest, old.fault, old.faultValue], [40, false, null], 'хуучин гэмтэл — сүүлийн заалт хэвийн');
  const tS = summarize(temp, pts, 1, pts, T0 + 3_600_000, false, false, { v: -1, raw: false });
  assert.deepEqual([tS.fault, tS.faultValue, tS.faultRaw], [true, -1, false], 'хөрш талбарын гэмтэл — өөрийн заалт');
}

/* 2026-11-27 (аудит №42): усны ХОНОГИЙН хэрэглээ — дуусаагүй өнөөдрийн хоног цэг болохгүй */
{
  const H = 3_600_000;
  const ub = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - UB_OFFSET_MS;
  const pts = [
    { t: ub(2026, 11, 25, 18, 5), v: 1194 },
    { t: ub(2026, 11, 26, 6, 0), v: 1198 },
    { t: ub(2026, 11, 26, 18, 5), v: 1200 },
    { t: ub(2026, 11, 27, 0, 10), v: 1200.4 },
  ];
  const now = ub(2026, 11, 27, 0, 30);
  const d = dailyDiffPoints(pts, now);
  assert.deepEqual(d, [{ t: ub(2026, 11, 26, 18, 5), v: 6 }], 'өнөөдрийн 0.40 орохгүй — зөвхөн дууссан 11-26');
  const next = dailyDiffPoints([...pts, { t: ub(2026, 11, 27, 18, 0), v: 1203 }], now + 24 * H);
  assert.deepEqual(next.map((x) => x.v), [6, 3], 'хоног дуусмагц бүтэн хэрэглээ (3 м³) цэг болно');
  assert.deepEqual(dailyDiffPoints(pts.slice(2), now), [], 'зөвхөн өчигдөр + өнөөдөр — цэггүй (0.40 биш)');
}

/* 2026-11-27: хоногийн хэрэглээний цуваа орой «хуучирсан» болохгүй, «24 цаг» мужид өчигдрийн цэг үлдэнэ */
{
  const { computeIot } = await import('@/lib/ceo/iot.ts');
  const H = 3_600_000;
  const ub = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - UB_OFFSET_MS;
  const water = SENSORS.find((s) => s.metrics.some((m) => m.dailyDiff));
  const meter = water.metrics.find((m) => m.dailyDiff);
  const pts = [
    { t: ub(2026, 11, 25, 18, 5), v: 1194 },
    { t: ub(2026, 11, 26, 18, 5), v: 1200 },
    { t: ub(2026, 11, 27, 0, 10), v: 1200.4 },
    { t: ub(2026, 11, 27, 6, 10), v: 1201 },
    { t: ub(2026, 11, 27, 12, 10), v: 1202 },
    { t: ub(2026, 11, 27, 18, 10), v: 1203 },
  ];
  const now = ub(2026, 11, 27, 20, 0);
  const from = now - 24 * H;
  const inRange = pts.filter((x) => x.t >= from);
  const src = summarize(meter, inRange, pts.length, pts);
  const daily = dailySeries(meter, pts, from, src, now);
  assert.equal(daily.latest, 6, 'сүүлийн дууссан хоног (11-26) — 6 м³');
  assert.equal(daily.latestAt, ub(2026, 11, 27, 18, 10), 'шинэлэг байдал эх тоолуурынх');
  assert.ok((now - daily.latestAt) / H < 24, '24 цагаас шинэ');
  assert.equal(daily.points.length, 1, '«24 цаг» мужид өчигдрийн цэг үлдэнэ');
  assert.equal(daily.label, meter.dailyDiff.label, 'шошго getter хэвээр');
  const sn = { ...water, series: [src, daily], lastAt: src.latestAt, ageHours: 2, n: pts.length, stale: false };
  const sum = computeIot([sn], now);
  assert.equal(sum.stale, 0, 'хэвийн илгээж буй тоолуур хуучирсан биш');
  const empty = dailySeries(meter, pts.slice(-2), from, src, now);
  assert.deepEqual([empty.latest, empty.latestAt], [null, null], 'хоногийн цэггүй бол цаг ч үгүй (дуугүй)');
}

const iot = (await import('node:fs')).readFileSync(new URL('../modules/Iot.tsx', import.meta.url), 'utf8');
assert.match(iot, /has \? num\(c\.m\.latest \?\? 0, c\.m\.dp\) : '—'/, 'Iot карт `null`-ийг «—» гэж харуулна');
console.log('sensors.check: OK');
