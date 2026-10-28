/** Хугацааны өөрчлөлт — батлагдсан түүхээс дэлгэцийн зөрүү хүртэл, сүлжээгүй. */
import assert from 'node:assert/strict';
import { execProgressPoints } from './execPeriodProgress.ts';
import { computeExecDeltas, seriesDelta } from './execPeriodCalc.ts';
import { buildPhys } from './finPhys.ts';

const hist = new Map([['БАГЦ1|A', [
  { date: '2026-09-30', pct: 10 }, { date: '2026-10-20', pct: 25 },
  { date: '2026-10-27', pct: 30 }, { date: '2026-10-30', pct: 90 },
]]]);
const universe = new Map([['БАГЦ1', ['БАГЦ1|A']]]);
const points = execProgressPoints(hist, universe, new Map([['БАГЦ1', 100]]), '2026-10-28');
const input = { housing: points.housing, packs: [{ key: 'БАГЦ1', label: 'Багц 1', points: points.packs.get('БАГЦ1') }],
  pays: [], givenTotal: 0, days: [], zov: null };
const d = computeExecDeltas(input, { key: '7d', from: '2026-10-21', to: '2026-10-28' });
assert.equal(d.housing.prev, 25);
assert.equal(d.housing.now, 30);
assert.equal(d.housing.delta, 5, '+20 биш: 10/20-ны хэмжилт сарын эцсийн цэгт алга болохгүй');
assert.equal(d.packs[0].delta, 5);
assert.equal(points.housing.length, 3, 'ирээдүйн хэмжилт орохгүй');
const middle = computeExecDeltas(input, { key: 'custom', from: '2026-10-01', to: '2026-10-22' });
assert.equal(middle.housing.now, 25, 'сарын дундах төгсгөлийн огноог хүндэтгэнэ');
assert.equal(middle.housing.delta, 15);
assert.equal(seriesDelta(points.housing, '2026-10-21', '2026-10-26').delta, null, 'шинэ хэмжилтгүй');

const h2 = new Map([
  ...hist,
  ['БАГЦ2|B', [{ date: '2026-10-19', pct: 80 }]],
  ['БАГЦ51|X', [{ date: '2026-10-27', pct: 100 }]],
]);
const u2 = new Map([
  ['БАГЦ1', ['БАГЦ1|A', 'БАГЦ1|UNREPORTED']],
  ['БАГЦ2', ['БАГЦ2|B']], ['БАГЦ3.1', ['БАГЦ31|C']], ['БАГЦ51', ['БАГЦ51|X']],
]);
const weighted = execProgressPoints(h2, u2,
  new Map([['БАГЦ1', 100], ['БАГЦ2', 300], ['БАГЦ31', 100], ['БАГЦ51', 9999]]), '2026-10-28');
assert.equal(weighted.packs.get('БАГЦ1').at(-1).v, 15, 'тайлагнаагүй блок хуваарьт орно');
assert.equal(weighted.housing.at(-1).v, (15 * 100 + 80 * 300) / 500,
  'ХО жин; тайлагнаагүй орон сууц 0%; дэд бүтэц орон сууцны нийтэд орохгүй');
assert.equal(weighted.packs.get('БАГЦ51').at(-1).v, 100, 'блокгүй багц өөрийн цуваатай');

const alias = execProgressPoints(new Map([['БАГЦ71|X', [{ date: '2026-10-20', pct: 20 }]]]), new Map(), new Map(), '2026-10-28');
assert.deepEqual(alias.packs.get('БАГЦ7'), alias.packs.get('БАГЦ71'));
assert.deepEqual(alias.housing, [], 'зөвхөн дэд бүтэцтэй бол орон сууцны хэмжилт үгүй');
assert.deepEqual(execProgressPoints(new Map(), universe, new Map(), '2026-10-28').housing, []);

const clean = new Map([['БАГЦ1|A', [{ date: '2026-10-19', pct: 50 }, { date: '2026-10-20', pct: null }, { date: '2026-10-27', pct: 20 }]],
  ['БАГЦ1|B', [{ date: '2026-10-19', pct: 10 }]]]);
const cleared = execProgressPoints(clean, new Map(), new Map(), '2026-10-28');
assert.equal(cleared.packs.get('БАГЦ1').find((p) => p.at === '2026-10-20').v, 5, 'цэвэрлэсэн нүдэнд өмнөх хувь нөхөхгүй');
assert.equal(cleared.housing.at(-1).v, 15, 'ХО байхгүй үед блокийн жин');

const allCleared = new Map([
  ['БАГЦ1|A', [{ date: '2026-10-19', pct: 50 }, { date: '2026-10-20', pct: null }]],
  ['БАГЦ2|B', [{ date: '2026-10-21', pct: 20 }]],
]);
const reset = execProgressPoints(allCleared, new Map(), new Map([['БАГЦ1', 100], ['БАГЦ2', 100]]), '2026-10-28');
assert.deepEqual(reset.packs.get('БАГЦ1').at(-1), { at: '2026-10-20', v: 0 });
assert.equal(reset.housing.at(-1).v, 10, 'cleared package must not carry 50% into a later aggregate (35%)');
assert.equal(seriesDelta(reset.packs.get('БАГЦ1'), '2026-10-20', '2026-10-28').delta, -50);
const noMeasurement = new Map([['БАГЦ1|A', [{ date: '2026-10-19', pct: null }, { date: '2026-10-30', pct: 50 }]]]);
assert.deepEqual(execProgressPoints(noMeasurement, new Map(), new Map(), '2026-10-28').housing, [], 'null before the first measurement is not a reset');

const monthly = buildPhys(hist, ['2026-09', '2026-10'], '2026-10', universe);
assert.deepEqual([...monthly.phys.get('БАГЦ1')], [['2026-09', 10], ['2026-10', 90]], 'анхдагч сарын тооцоо хэвээр');

console.log('✅ execPeriodProgress: өдрийн хил, жин, блокгүй багц, alias, null, сарын хэвээр байдал');
