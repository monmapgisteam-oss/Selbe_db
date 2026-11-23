/**
 * ҮЛ НИЙЦЛИЙН ТӨЛӨВ — «Гүйцэтгэгчийн үйл явц» + «Захиалагчийн шийдвэр» (2026-11-20, хэрэглэгч). Цэвэр, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/actionStatus.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ХУУЧИН ЭХ БУЦАЖ ОРОХ. Workforce-ийн `esritask_status` хоцордог (амьд 2026-11-20: 35 мөр — гүйцэтгэгч «Шалгуулах»
 *      болгосон 29 мөр тэнд «Хуваарилсан» хэвээр) тул ХАБЭА-гийн донат, газрын зураг, тайлан гурвуулаа шинэ хоёр
 *      талбараас уншина.
 *   2. ДҮРЭМ ЗӨРӨХ. Шийдвэр бөглөгдсөн бол шийдвэр, эс бөгөөс гүйцэтгэгчийн явц — `actionStatus` (TS) ба газрын зургийн
 *      Arcade (`ACTION_STATUS_ARCADE`) ижил дүрэмтэй байх ёстой.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_FIELDS, ACTION_STATUS_ARCADE, actionStatus } from './services/fields.ts';
import { LAYER_BY_ID } from './services/layers.ts';

const row = (contractor, decision) => ({ [ACTION_FIELDS.contractor]: contractor, [ACTION_FIELDS.decision]: decision });

/* Амьд өгөгдөлд байгаа 6 хослол (2026-11-20) → хүлээгдэх төлөв */
assert.equal(actionStatus(row(4, 3)), 3, 'Шалгуулах + Дууссан → Дууссан');
assert.equal(actionStatus(row(1, null)), 1, 'Хуваарилсан, шийдвэргүй → Хуваарилсан');
assert.equal(actionStatus(row(4, null)), 4, 'Шалгуулах, шийдвэргүй → Шалгуулах (esritask_status-д «Хуваарилсан» байсан)');
assert.equal(actionStatus(row(1, 5)), 5, 'Засвар шаардлагатай шийдвэр гүйцэтгэгчийн явцаас давамгайлна');
assert.equal(actionStatus(row(2, null)), 2, 'Гүйцэтгэж байна');
assert.equal(actionStatus(row(null, null)), null, 'хоёулаа хоосон → тодорхойгүй');
assert.equal(actionStatus(row('', '')), null, 'хоосон мөр → тодорхойгүй');
assert.equal(actionStatus(row(null, 3)), 3, 'зөвхөн шийдвэр');
/* Хэрэглэгч 2026-11-23: засвар шаардсан мөр (гүйцэтгэгч дахин «Шалгуулах» болгосон ч) ЗАХИАЛАГЧИЙН ШИЙДВЭРЭЭР харагдана */
assert.equal(actionStatus(row(4, 5)), 5, 'Шалгуулах + Засвар шаардлагатай → Засвар шаардлагатай (захиалагчийн шийдвэр)');
assert.equal(actionStatus({ esritask_status: 3 }), null, 'esritask_status-ийг УНШИХГҮЙ');
console.log('✅ 1. actionStatus — 6 амьд хослол');

/* Газрын зураг — Arcade-аар, ижил талбар, ижил дараалал (шийдвэр эхэнд) */
const lyr = LAYER_BY_ID['habea:action'];
assert.ok(lyr?.paint, 'habea:action давхарга paint-тай');
assert.equal(lyr.paint.expr, ACTION_STATUS_ARCADE, 'газрын зураг төлөвийг Arcade-аар тооцно');
assert.ok(ACTION_STATUS_ARCADE.indexOf(ACTION_FIELDS.decision) < ACTION_STATUS_ARCADE.indexOf(ACTION_FIELDS.contractor), 'шийдвэр эхэнд');
assert.ok(!/esritask_status/.test(ACTION_STATUS_ARCADE), 'Arcade хуучин талбар уншихгүй');
for (const k of Object.keys(lyr.paint.values)) assert.match(k, /^\d+$/, 'paint түлхүүр — Arcade-ын Text() үр дүнтэй тулгагдах кодын мөр');
console.log('✅ 2. газрын зураг — ACTION_STATUS_ARCADE');

/* Хуудас ба тайлан — хуучин талбарыг асуулгад оруулахгүй, `actionStatus`-ээр уншина */
for (const f of ['src/modules/HabeaAction.tsx', 'src/lib/actionReport.ts']) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/esritask_status/.test(src), `${f}: esritask_status кодонд үлдсэн`);
  assert.ok(/actionStatus\(r\)/.test(src), `${f}: actionStatus-ээр уншдаггүй`);
  assert.ok(src.includes('ACTION_FIELDS.contractor') && src.includes('ACTION_FIELDS.decision'), `${f}: хоёр талбарыг асуулгад оруулаагүй`);
}
console.log('✅ 3. ХАБЭА хуудас ба тайлан — шинэ эх');
console.log('actionStatus.check: OK');
