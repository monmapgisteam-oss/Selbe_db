/**
 * ХУВААРИЙН БАТЛАХ УРСГАЛЫН ШАЛГУУР — offline (ArcGIS-гүй орчинд ажиллана).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariBatlah.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-09-07, хэрэглэгчийн шийдвэрээр нэмэгдсэн урсгал):
 *   1. ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ. Шалгуур нь UI-д БИШ, өгөгдлийн давхаргад
 *      байх ёстой: `plan` ба `planApprove` хоёуланг нэг хүнд олговол товч нь
 *      идэвхтэй болох тул ганц хамгаалалт нь `decidePlan` дотор.
 *   2. Буцаахад ШАЛТГААН ЗААВАЛ — шалтгаангүй буцаалт нь гүйцэтгэгчид юуг
 *      засахыг хэлэхгүй тул хоосон давталт үүсгэнэ.
 *   3. Агуулга эвдэрсэн бол `null` — хагас задарсан ноорог хэрэглэвэл огноо
 *      ЧИМЭЭГҮЙ устана.
 *
 * ⚠️ Сүлжээ шаардсан замуудыг (илгээх, жагсаах) ЭНД шалгахгүй: `tableUrl` нь
 *    ArcGIS token шаарддаг. Энд зөвхөн СҮЛЖЭЭНЭЭС ӨМНӨ ажилладаг дүрмүүд.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — 'use client' модулиудад ── */
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const { PLAN_STATUS, parsePayload, decidePlan } = await import('@/lib/huvaariBatlah.ts');

/* ── 1. Төлөвийн утгууд — өгөгдөл тул ОРЧУУЛАГДАХГҮЙ ── */
assert.equal(PLAN_STATUS.pending, 'Хүлээгдэж буй');
assert.equal(PLAN_STATUS.approved, 'Батлагдсан');
assert.equal(PLAN_STATUS.returned, 'Буцаагдсан');
assert.equal(new Set(Object.values(PLAN_STATUS)).size, 3, 'төлөв давхардав');
console.log('✅ төлөв');

/* ── 2. АГУУЛГА ЗАДЛАХ ── */
const good = JSON.stringify({
  spans: { 12: [{ start: 100, end: 200 }, null] },
  deps: { 12: '18FS3' },
  obyem: { '5|9F': { '2026-01': 12.5 } },
});
const p = parsePayload(good);
assert.ok(p, 'бүтэн агуулга задарсангүй');
assert.deepEqual(p.spans['12'], [{ start: 100, end: 200 }, null]);
assert.equal(p.deps['12'], '18FS3');
assert.equal(p.obyem['5|9F']['2026-01'], 12.5);

/* Дутуу хэсгүүд нь ХООСОН болно — унахгүй (уялдаа/обьёмгүй илгээлт хэвийн) */
const only = parsePayload(JSON.stringify({ spans: { 7: [null] } }));
assert.ok(only, 'зөвхөн огноотой илгээлт задарсангүй');
assert.deepEqual(only.deps, {});
assert.deepEqual(only.obyem, {});

/* ⚠️ ЭВДЭРСЭН бол `null` — таамаглахгүй */
assert.equal(parsePayload(''), null, 'хоосон мөр');
assert.equal(parsePayload('{ буруу'), null, 'JSON биш');
assert.equal(parsePayload('null'), null, 'null');
assert.equal(parsePayload('[]'), null, 'массив — объект байх ёстой');
assert.equal(parsePayload('{"deps":{}}'), null, '`spans` байхгүй бол татгалзана');
console.log('✅ агуулга задлах · fail-closed');

/* ══════════════════════════════════════════════════════════════
 * 3. ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ — ЭНЭ ФАЙЛЫН ГОЛ ШАЛГУУР
 * ══════════════════════════════════════════════════════════════
 * ⚠️ Сүлжээнд ХҮРЭХЭЭС ӨМНӨ татгалзах ёстой. Хэрэв энэ шалгуур
 *    `tableUrl`-ийн ДАРАА байрлавал ArcGIS-гүй орчинд «хүснэгт олдсонгүй»
 *    гэж буруу шалтгаан буцааж, дүрэм нь чимээгүй алга болно.
 */
let r = await decidePlan({
  oid: 1, approve: true, approver: 'zohiogch_a', author: 'zohiogch_a',
});
assert.equal(r.ok, false, 'зохиогч өөрийгөө баталлаа');
assert.match(r.error, /өөрөө батлах боломжгүй/, `буруу шалтгаан: ${r.error}`);

/* Том/жижиг үсэг, зайгаар тойрч болохгүй */
r = await decidePlan({
  oid: 1, approve: true, approver: '  ZOHIOGCH_A  ', author: 'zohiogch_a',
});
assert.equal(r.ok, false, 'үсгийн хэлбэрээр тойров');

/* Буцаахад ч мөн адил */
r = await decidePlan({
  oid: 1, approve: false, approver: 'zohiogch_a', author: 'zohiogch_a', reason: 'болохгүй',
});
assert.equal(r.ok, false, 'зохиогч өөрийнхөө илгээлтийг буцаалаа');
console.log('✅ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ');

/* ── 4. БУЦААХАД ШАЛТГААН ЗААВАЛ ── */
r = await decidePlan({ oid: 1, approve: false, approver: 'batlagch_b', author: 'zohiogch_a' });
assert.equal(r.ok, false, 'шалтгаангүй буцаалт өнгөрөв');
assert.match(r.error, /шалтгааныг бичнэ/, `буруу шалтгаан: ${r.error}`);

r = await decidePlan({
  oid: 1, approve: false, approver: 'batlagch_b', author: 'zohiogch_a', reason: '   ',
});
assert.equal(r.ok, false, 'зөвхөн зайнаас бүрдсэн шалтгаан өнгөрөв');
console.log('✅ буцаахад шалтгаан заавал');

/* ── 5. ДҮРМҮҮД СҮЛЖЭЭНЭЭС ӨМНӨ шалгагдана ──
 * ⚠️ ArcGIS-гүй энэ орчинд `tableUrl` нь `null` буцаадаг. Хэрэв аль нэг
 *    дүрэм түүний ДАРАА байрлавал «хүснэгт олдсонгүй» гэсэн БУРУУ шалтгаан
 *    гарч, дүрэм нь чимээгүй алга болно. Дээрх 3 ба 4-р бүлэг яг үүнийг
 *    барьсан (анх зохиогчийн шалгуур `tableUrl`-ийн дараа байсан).
 *
 *    Харин ХҮЧИНТЭЙ шийдвэр нь хүснэгтгүйд ЗӨВ шалтгаанаар унана.
 */
const noTable = await decidePlan({
  oid: 1, approve: true, approver: 'batlagch_b', author: 'zohiogch_a',
});
assert.equal(noTable.ok, false);
assert.match(noTable.error, /хүснэгт олдсонгүй/, `буруу шалтгаан: ${noTable.error}`);
console.log('✅ дүрэм → сүлжээ гэсэн дараалал');

console.log('\nhuvaariBatlah: ok — төлөв · агуулга fail-closed · өөрийгөө батлахгүй · шалтгаан заавал');
