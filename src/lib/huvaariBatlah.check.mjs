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

const {
  PLAN_STATUS, parsePayload, parseOkRows, decidePlan, withdrawPlan, claimPlan, submitPlan, claimHolderOf, PAYLOAD_MAX,
} = await import('@/lib/huvaariBatlah.ts');

/* ── 1. Төлөвийн утгууд — өгөгдөл тул ОРЧУУЛАГДАХГҮЙ ── */
assert.equal(PLAN_STATUS.pending, 'Хүлээгдэж буй');
assert.equal(PLAN_STATUS.approved, 'Батлагдсан');
assert.equal(PLAN_STATUS.returned, 'Буцаагдсан');
/* ⚠️ 2026-09-21: зохиогч өөрөө татсан — `returned`-ээс ТУСДАА утга */
assert.equal(PLAN_STATUS.withdrawn, 'Татсан');
assert.equal(new Set(Object.values(PLAN_STATUS)).size, 4, 'төлөв давхардав');
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
/* Сарын нөөц (2026-09-24) — хуучин илгээлтэд байхгүй → {} ; байвал sanitize */
assert.deepEqual(only.obres, {}, 'obres дутуу → хоосон');
const withRes = parsePayload(JSON.stringify({
  spans: {}, obres: { '5|9F': { '2026-01': { hun: 3, mashin: 'x' }, '2026-02': 7 }, '6|9F': 'bad' },
  base: { spans: {}, obres: { '5|9F': { '2026-01': { hun: null, mashin: 1 } } } },
}));
assert.deepEqual(withRes.obres, { '5|9F': { '2026-01': { hun: 3, mashin: null } } }, 'эвдэрсэн сар/мөр хаягдана');
/* Бүхэл тоо (2026-09-24): бутархай илгээлт floor-оор */
const fracRes = parsePayload(JSON.stringify({ spans: {}, obres: { '5|9F': { '2026-01': { hun: 2.9, mashin: 1.5 } } } }));
assert.deepEqual(fracRes.obres, { '5|9F': { '2026-01': { hun: 2, mashin: 1 } } }, 'сарын нөөц floor');
assert.deepEqual(withRes.base.obres, { '5|9F': { '2026-01': { hun: null, mashin: 1 } } });
assert.equal(parsePayload(JSON.stringify({ spans: {}, base: { spans: {} } })).base.obres, undefined, 'суурьд obres сонголттой');

/* ══════════════════════════════════════════════════════════════
 * ХУВААРИЙН ТӨРӨЛ (`kind`) — 2026-09-11-ний аудитын S1
 * ══════════════════════════════════════════════════════════════
 * ⚠️ Илгээлт нь ТӨЛӨВЛӨСӨН эсвэл ГЭРЭЭНИЙ огнооны алинд хамаарахаа
 *    ӨӨРТӨӨ агуулах ЁСТОЙ. Урьд нь агуулаагүй тул батлагчийн ХАРЖ БУЙ
 *    таб бичих талбарыг дур мэдэн шийддэг байв: «Гэрээ» таб дээр байхад
 *    ТӨЛӨВЛӨГӨӨНИЙ санал `…_geree_*` талбарт бичигдэж, гэрээний лавлагаа
 *    чимээгүй эвдэрдэг (эргүүлэх аргагүй).
 */
assert.equal(p.kind, 'plan', 'kind бичигдээгүй хуучин илгээлт нь `plan`');

const ger = parsePayload(JSON.stringify({ kind: 'geree', spans: { 3: [null] } }));
assert.ok(ger, 'гэрээний илгээлт задарсангүй');
assert.equal(ger.kind, 'geree', '`geree` нь хэвээр буцна');

/* ⚠️ FAIL-CLOSED: танихгүй утга ирвэл `plan` — гэрээний талбарт БУРУУ
   бичихээс сэргийлнэ. «Танихгүй» нь «гэрээ» гэсэн үг ХЭЗЭЭ Ч биш. */
const odd = parsePayload(JSON.stringify({ kind: 'ХЗ', spans: { 3: [null] } }));
assert.equal(odd.kind, 'plan', 'танихгүй kind нь `plan` руу унана');

/* ⚠️ ХУУЧИН илгээлт (2026-09-11-ээс өмнөх) — `kind` талбар огт БАЙХГҮЙ.
   Тэр үед зөвхөн төлөвлөгөө байсан тул `plan` нь таамаг биш БАРИМТ. */
assert.equal(only.kind, 'plan', '`kind`-гүй хуучин илгээлт нь `plan`');
console.log('✅ хуваарийн төрөл — буцаж нийцтэй, fail-closed');

/* ══════════════════════════════════════════════════════════════
 * ИЛГЭЭХ ҮЕИЙН СУУРЬ (`base`) — 2026-09-21
 * ══════════════════════════════════════════════════════════════
 * ⚠️ Хуучин илгээлтэд БАЙХГҮЙ → `undefined` (бүх блок «зассан» гэж
 *    үзнэ); байвал `spans` нь мөн адил цэвэрлэгдэнэ; эвдэрсэн бол хаягдана,
 *    илгээлт өөрөө УНАХГҮЙ. */
assert.equal(p.base, undefined, 'суурьгүй илгээлт нь `base: undefined`');
const withBase = parsePayload(JSON.stringify({
  spans: { 12: [{ start: 100, end: 200 }, null] },
  base: { spans: { 12: [{ start: 50, end: 150 }, 'муу'] }, deps: { 12: null } },
}));
assert.ok(withBase.base, 'суурь задарсангүй');
assert.deepEqual(withBase.base.spans['12'], [{ start: 50, end: 150 }, null], 'суурийн эвдэрсэн блок → null (индекс гулсахгүй)');
assert.equal(withBase.base.deps['12'], null);
assert.deepEqual(withBase.base.obyem, {}, 'дутуу obyem → хоосон');
const badBase = parsePayload(JSON.stringify({ spans: { 3: [null] }, base: 'муу' }));
assert.ok(badBase, 'эвдэрсэн суурьтай илгээлт унав');
assert.equal(badBase.base, undefined, 'эвдэрсэн суурь хаягдана');
console.log('✅ илгээх үеийн суурь — сонголттой, буцаж нийцтэй');

/* ══════════════════════════════════════════════════════════════
 * БОДИТ ОГНОО (`actual`) · НӨӨЦ (`res`) — 2026-09-23
 * ══════════════════════════════════════════════════════════════
 * ⚠️ Хуучин илгээлтэд БАЙХГҮЙ → `{}` (унахгүй, «хөндөөгүй»). Байвал мөр
 *    тус бүрээр fail-closed: `start`/`end` массив биш мөр ХАЯГДАНА, тоо биш
 *    элемент `null` (индекс гулсахгүй — `map`, `filter` биш), `res`-ийн
 *    тоо биш утга `null` (0 БИШ). Суурь (`base.actual`/`base.res`) мөн адил. */
assert.deepEqual(p.actual, {}, 'actual-гүй хуучин илгээлт → {}');
assert.deepEqual(p.res, {}, 'res-гүй хуучин илгээлт → {}');
const ext = parsePayload(JSON.stringify({
  spans: {},
  actual: {
    12: { start: [100, null, 'муу'], end: [null, 200, 300] },
    13: { start: 'муу', end: [] },
    14: null,
  },
  res: { 12: { hun: 5, mashin: null }, 13: { hun: '7', mashin: -1 }, 14: 3 },
  base: { spans: {}, actual: { 12: { start: [50, null, null], end: [null, null, null] } }, res: { 12: { hun: 4, mashin: 1 } } },
}));
assert.ok(ext, 'бодит огноотой илгээлт задарсангүй');
assert.deepEqual(ext.actual['12'], { start: [100, null, null], end: [null, 200, 300] }, 'тоо биш элемент → null, индекс хэвээр');
assert.equal(ext.actual['13'], undefined, 'массив биш start → мөр хаягдана');
assert.equal(ext.actual['14'], undefined, 'null мөр хаягдана');
assert.deepEqual(ext.res['12'], { hun: 5, mashin: null });
assert.deepEqual(ext.res['13'], { hun: null, mashin: -1 }, 'мөр утга → null (сөрөг тоо нь parse-д хэвээр, UI хаана)');
assert.equal(ext.res['14'], undefined, 'объект биш → хаягдана');
assert.deepEqual(ext.base.actual['12'], { start: [50, null, null], end: [null, null, null] }, 'суурийн actual задарлаа');
assert.deepEqual(ext.base.res['12'], { hun: 4, mashin: 1 }, 'суурийн res задарлаа');
assert.equal(withBase.base.actual, undefined, 'суурьт actual байхгүй → undefined (хуучин зан үйл)');
console.log('✅ бодит огноо · нөөц — буцаж нийцтэй, fail-closed');

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
/* ⚠️ 2026-09-29: батлагчийн нэр НЭВТЭРСЭН хэрэглэгчтэй тулгагдана (`sameAsLogin`) —
   нэвтрээгүй бол «тодорхойгүй», өөр нэр бол «зөрж байна», ижил бол сүлжээ рүү. */
{
  const WHO = await import('@/lib/who.ts');
  const r0 = await decidePlan({ oid: 1, approve: true, approver: 'batlagch_b', author: 'zohiogch_a' });
  assert.equal(r0.ok, false);
  assert.match(r0.error, /тодорхойгүй/, `нэвтрээгүй батлагч: ${r0.error}`);
  WHO.setCurrentUser('ondoo_hun');
  const r1 = await decidePlan({ oid: 1, approve: true, approver: 'batlagch_b', author: 'zohiogch_a' });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /зөрж байна/, `өөр нэрээр батлах өнгөрөв: ${r1.error}`);
  const r2 = await claimPlan({ oid: 1, approver: 'batlagch_b', author: 'zohiogch_a' });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /зөрж байна/, `өөр нэрээр түгжих өнгөрөв: ${r2.error}`);
  WHO.setCurrentUser('batlagch_b');
  const noTable = await decidePlan({ oid: 1, approve: true, approver: 'batlagch_b', author: 'zohiogch_a' });
  assert.equal(noTable.ok, false);
  assert.match(noTable.error, /хүснэгт олдсонгүй/, `буруу шалтгаан: ${noTable.error}`);
  WHO.setCurrentUser(null);
}
console.log('✅ дүрэм → нэр → сүлжээ гэсэн дараалал');

/* ── 5б. ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) — дүрэм сүлжээнээс өмнө ──
 * ⚠️ `window` shim байгаа тул `requireCap('plan')` ажиллана: эрхгүй бол шидэх
 *    ёстой (консолоос дуудсан хэн ч татахгүй). Эрхтэй ч нэвтэрсэн нэрээс ӨӨР
 *    нэрээр татахыг сүлжээнээс ӨМНӨ татгалзана; хүчинтэй бол хүснэгтгүйд ЗӨВ
 *    шалтгаанаар унана. Зохиогчийн жинхэнэ шалгуур нь СЕРВЕРИЙН мөрөөр тул
 *    энд (сүлжээгүй) шалгагдахгүй. */
{
  const CAPS = await import('@/lib/caps.ts');
  const WHO = await import('@/lib/who.ts');
  CAPS._syncRemoteCaps([]);
  WHO.setCurrentUser('zohiogch_a');
  await assert.rejects(withdrawPlan({ oid: 1, me: 'zohiogch_a' }), /эрхгүй/, 'эрхгүй хүн татаж чадав');
  CAPS._syncRemoteCaps([{ user: 'zohiogch_a', caps: ['plan'] }]);
  r = await withdrawPlan({ oid: 1, me: '   ' });
  assert.equal(r.ok, false, 'нэргүй татах өнгөрөв');
  assert.match(r.error, /тодорхойгүй/, `буруу шалтгаан: ${r.error}`);
  r = await withdrawPlan({ oid: 1, me: 'batlagch_b' });
  assert.equal(r.ok, false, 'өөр нэрээр татах өнгөрөв');
  assert.match(r.error, /илгээсэн хүн өөрөө/, `буруу шалтгаан: ${r.error}`);
  r = await withdrawPlan({ oid: 1, me: 'zohiogch_a' });
  assert.equal(r.ok, false);
  assert.match(r.error, /хүснэгт олдсонгүй/, `буруу шалтгаан: ${r.error}`);
  CAPS._syncRemoteCaps([]);
  WHO.setCurrentUser(null);
}
console.log('✅ илгээлтээ татах — эрх → нэр → сүлжээ');

/* ── 6. ХООСОН `spans` нь ХҮЧИНТЭЙ агуулга ──
 * ⚠️ 2026-09-08-ны аудит: илгээснээс хойш эх хуваарь өөр замаар ижил утгад
 *    хүрвэл ялгаа үлдэхгүй — ноорог хоосон болно. Тэр нь ЭВДЭРСЭН агуулга
 *    БИШ; `parsePayload` түүнийг `null` болговол батлагч «агуулга
 *    уншигдсангүй» гэсэн ХУДАЛ алдаа хараад илгээлт мөнхөд гацна.
 *
 *    (`Huvaari.tsx` тал дээр `dirtyN === 0` үед `decidePlan` дуудагдаж,
 *     шийдвэр нь бичих зүйлгүй ч бүртгэгддэг — тэр нь UI логик тул энд
 *     шалгагдахгүй, гэхдээ ЭНЭ шалгуур түүний урьдчилсан нөхцөл.)
 */
const empty = parsePayload(JSON.stringify({ spans: {}, deps: {}, obyem: {} }));
assert.ok(empty, 'хоосон spans нь эвдэрсэн гэж татгалзав');
assert.deepEqual(empty.spans, {});
console.log('✅ хоосон агуулга хүчинтэй');

/* ── 7. ТАТАХ ДАРААЛАЛ — унш → төрөл тулга → тат → ноорог (2026-09-21) ──
 * ⚠️ `Huvaari.withdraw` нь урьд нь ЭХЛЭЭД `withdrawPlan`, ДАРАА нь
 *    `loadPayload` дууддаг байв: агуулга уншигдахгүй/төрөл зөрвөл илгээлт
 *    ТАТАГДЧИХСАН атлаа ноорог хоосон — зохиогчийн ажил хоёр талаас алга.
 *    React шаардах тул ЭХ КОДЫГ тулгана (`huvaariBatlah.view.check`-ийн хэв
 *    маяг): тайлбаргүй эх дээр `loadPayload(` < `p.kind !== kind` <
 *    `withdrawPlan(` гэсэн дараалал. */
{
  const fs = await import('node:fs');
  /* 2026-09-30: `withdraw` нь `Huvaari.tsx`-д хэвээр; хуваагдсан файлуудыг ч нийлүүлж уншина (`clearPreview` тэнд) */
  const src = ['src/modules/Huvaari.tsx', ...fs.readdirSync('src/modules/huvaari').filter((f) => /\.tsx?$/.test(f)).sort().map((f) => 'src/modules/huvaari/' + f)]
    .map((p) => fs.readFileSync(p, 'utf8')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const i = src.indexOf('const withdraw = useCallback');
  assert.ok(i > 0, 'Huvaari: `withdraw` олдсонгүй');
  const j = src.indexOf('const clearPreview', i);
  assert.ok(j > i, 'Huvaari: `withdraw`-ийн төгсгөл (`clearPreview`) олдсонгүй');
  const body = src.slice(i, j);
  const iLoad = body.indexOf('loadPayload(');
  const iKind = body.indexOf('p.kind !== kind');
  const iWd = body.indexOf('withdrawPlan(');
  const iApply = body.indexOf('applyPayloadToDraft(');
  assert.ok(iLoad > 0 && iWd > 0 && iApply > 0, 'Huvaari.withdraw: loadPayload / withdrawPlan / applyPayloadToDraft алга');
  assert.ok(iLoad < iWd, 'Huvaari.withdraw: агуулгыг уншихаас ӨМНӨ татаж байна — уншигдахгүй бол ажил алга болно');
  assert.ok(iKind > iLoad && iKind < iWd, 'Huvaari.withdraw: төрлийн тулгалт татахаас ӨМНӨ биш');
  assert.ok(iWd < iApply, 'Huvaari.withdraw: татахаас өмнө ноорогт буулгаж байна');
  /* Уншигдахгүй бол татахгүй — `if (!p)` нь `withdrawPlan`-аас өмнө */
  const iNoP = body.indexOf('if (!p)');
  assert.ok(iNoP > iLoad && iNoP < iWd, 'Huvaari.withdraw: уншигдаагүй агуулгад татах зам хаагдаагүй');
}
console.log('✅ татах дараалал — унш → төрөл → тат → ноорог');

/* ══════════ ЗӨВШӨӨРСӨН МӨР (2026-09-25) — гүйцэтгэлийн okCells загвар ══════════ */
/**
 * ⚠️ `null` ≠ `[]`: `null` = тэмдэглээгүй (талбаргүй/хуучин буцаалт) → гүйцэтгэгчид
 *    улаан/ногоон ОГТ харагдахгүй; `[]` = юу ч зөвшөөрөөгүй → бүх мөр улаан.
 *    Хольвол хуучин буцаалтын бүх мөр ХУДЛАА улаан болно.
 * ⚠️ FAIL-CLOSED: эвдэрсэн жагсаалтын ХАГАСЫГ хэрэглэвэл зарим мөр худлаа ногоон.
 */
{
  assert.equal(parseOkRows(null), null, 'null → тэмдэглээгүй');
  assert.equal(parseOkRows(''), null, 'хоосон мөр → тэмдэглээгүй');
  assert.deepEqual(parseOkRows('[]'), [], '[] → юу ч зөвшөөрөөгүй (null БИШ)');
  assert.deepEqual(parseOkRows('[12,40]'), [12, 40]);
  assert.deepEqual(parseOkRows('["12","40"]'), [12, 40], 'тоон мөр хүлээн авна');
  assert.equal(parseOkRows('[12,"x"]'), null, 'нэг эвдэрсэн элемент → бүхэлд нь null');
  assert.equal(parseOkRows('[1.5]'), null, 'бутархай oid → null');
  assert.equal(parseOkRows('{ буруу'), null, 'JSON биш → null');
  assert.equal(parseOkRows('{"a":1}'), null, 'массив биш → null');
}
console.log('✅ зөвшөөрсөн мөр — null ≠ [] · fail-closed');

/* ══════════ ТҮГЖЭЭ (claim) — сүлжээнээс ӨМНӨХ дүрэм (2026-09-29 аудит) ══════════ */
{
  const r1 = await claimPlan({ oid: 1, approver: '   ', author: 'a' });
  assert.equal(r1.ok, false, 'нэргүй түгжилт зөвшөөрөгдөв');
  const r2 = await claimPlan({ oid: 1, approver: 'Bat', author: 'bat' });
  assert.equal(r2.ok, false, 'өөрийн илгээлтээ түгжиж болж байна');
  assert.match(r2.error, /өөрөө батлах/, 'өөрийгөө түгжихэд буруу мессеж');
  /* claimHolderOf — жагсаалтын мөр: pending + approver + амьд approverAt */
  const now = 1_000_000_000;
  const base = { status: PLAN_STATUS.pending, approver: 'Dorj', approverAt: now - 60_000 };
  assert.equal(claimHolderOf(base, now), 'dorj', 'амьд түгжээ уншигдсангүй (жижиг үсгээр)');
  assert.equal(claimHolderOf({ ...base, approverAt: now - 11 * 60_000 }, now), null, 'хугацаа дууссан түгжээ амьд гэж уншигдав');
  assert.equal(claimHolderOf({ ...base, status: PLAN_STATUS.approved }, now), null, 'шийдвэрлэгдсэн мөр түгжээтэй гэж уншигдав');
  assert.equal(claimHolderOf({ ...base, approver: null }, now), null, 'түгжигчгүй мөр');
}
console.log('✅ түгжээ — нэргүй/өөрийгөө хаагдана · claimHolderOf TTL');

/* ══════════ АГУУЛГЫН ДЭЭД ХЭМЖЭЭ (2026-09-29 аудит) ══════════ */
{
  assert.equal(PAYLOAD_MAX, 1_048_576);
  const big = { spans: { 1: [{ start: 0, end: 1 }] }, deps: {}, obyem: {}, note: 'x'.repeat(PAYLOAD_MAX) };
  const r = await submitPlan({ pkgKey: 'p', pkgGroup: 'g', author: 'a', rowCount: 1, payload: big });
  assert.equal(r.ok, false, 'хэт том агуулга сүлжээнд хүрэв');
  assert.match(r.error, /хэт том/, 'уртын алдааны мессеж');
}
console.log('✅ агуулга — 1 MB-аас хэтэрвэл илгээхийн өмнө зогсоно');

console.log('\nhuvaariBatlah: ok — төлөв · агуулга fail-closed · өөрийгөө батлахгүй · шалтгаан заавал · түгжээ · урт');

/* ══════════ МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮР — `keys` + `remapPayload` (2026-09-29) ══════════
 * ⚠️ Илгээснээс хойш шинэ жааз нийтлэгдэж бүх `oid` солигдоход санал «мөр олдсонгүй»
 *    болж, буцаагдсан хуваарь ноорогт буухгүй байв. Ажлын кодоор зөөнө. */
{
  const { remapPayload } = await import('@/lib/huvaariBatlah.ts');
  const raw = JSON.stringify({
    kind: 'plan',
    spans: { 10: [{ start: 1, end: 2 }], 11: [null], 12: [{ start: 5, end: 6 }] },
    deps: { 10: '7FS' },
    obyem: { '501|9F': { '2026-01': 3 } },
    actual: { 11: { start: [1], end: [null] } },
    res: { 12: { hun: 4, mashin: null } },
    base: { spans: { 10: [null] }, deps: { 10: null }, obyem: {} },
    keys: { 10: 501, 11: 502, 12: 503, x: 9, 13: 'буруу' },
  });
  const p0 = parsePayload(raw);
  assert.deepEqual(p0.keys, { 10: 501, 11: 502, 12: 503 }, 'keys: эвдэрсэн хос хаягдаж бусад нь үлдэнэ');
  /* Хуучин илгээлт (`keys`-гүй) — талбар огт байхгүй, зөөлтгүй */
  assert.equal('keys' in parsePayload(JSON.stringify({ spans: { 7: [null] } })), false);

  /* (а) жааз солигдоогүй — юу ч хөдлөхгүй, ИЖИЛ объект */
  const same = remapPayload(p0, [{ oid: 10, des: 501 }, { oid: 11, des: 502 }, { oid: 12, des: 503 }]);
  assert.equal(same.map.size, 0); assert.equal(same.pay, p0);

  /* (б) шинэ жааз — бүх oid шинэ; кодоор зөөгдөнө, суурь ч хамт */
  const cur = [{ oid: 110, des: 501 }, { oid: 111, des: 502 }, { oid: 112, des: 503 }, { oid: 113, des: null }];
  const mv = remapPayload(p0, cur);
  assert.deepEqual([...mv.map], [[10, 110], [11, 111], [12, 112]]);
  assert.deepEqual(Object.keys(mv.pay.spans).sort(), ['110', '111', '112']);
  assert.deepEqual(mv.pay.deps, { 110: '7FS' });
  assert.deepEqual(Object.keys(mv.pay.actual), ['111']);
  assert.deepEqual(Object.keys(mv.pay.res), ['112']);
  assert.deepEqual(Object.keys(mv.pay.base.spans), ['110']);
  assert.deepEqual(mv.pay.base.deps, { 110: null });
  assert.deepEqual(mv.pay.obyem, p0.obyem, 'обьём кодоор түлхүүрлэгддэг — хөндөгдөхгүй');
  assert.deepEqual(mv.pay.keys, { 110: 501, 111: 502, 112: 503 });

  /* (в) код одоогийн жаазад ДАВХАРДСАН эсвэл алга — зөөхгүй (буруу мөрд буулгахгүй) */
  const dup = remapPayload(p0, [{ oid: 110, des: 501 }, { oid: 120, des: 501 }, { oid: 111, des: 502 }]);
  assert.deepEqual([...dup.map], [[11, 111]], 'давхардсан код 501 зөөгдөхгүй, 503 алга');
  assert.ok('10' in dup.pay.spans && '12' in dup.pay.spans && '111' in dup.pay.spans);

  /* (г) `keys`-гүй бол хэзээ ч зөөхгүй */
  const old = parsePayload(JSON.stringify({ spans: { 10: [null] } }));
  assert.equal(remapPayload(old, cur).pay, old);
}
console.log('✅ тогтвортой түлхүүр — кодоор зөөнө · давхардсан код зөөхгүй · хуучин илгээлт хэвээр');

/* ══════════ CAS ТҮГЖЭЭ — `casClaim` (2026-10-01, хэрэглэгч: бүгдийг зас) ══════════
 * ⚠️ `decidePlan` урьд нь ТҮГЖЭЭ ХООСОН үед түгжээгүйгээр шийддэг байв (⚠️ тайлбар нь
 *    «зогсоно» гэж худал хэлж байсан). Одоо: дахин унш → хоосон хэвээр бол өөр дээрээ
 *    тавь → дахин уншиж баталгаажуул; өөр хүн барьсан/ялсан бол НЭРИЙГ нь хэлнэ.
 *    Хуурамч `io` — сүлжээгүй. */
{
  const { casClaim, approveGuard } = await import('@/lib/huvaariBatlah.ts');
  const NOW = 1_000_000_000_000;
  const mk = (o) => ({ OBJECTID: 1, toloh: PLAN_STATUS.pending, batlagch: null, shiidver_ognoo: null, ...o });
  /** Хуурамч хүснэгт — `write` нь мөрийг шинэчилнэ; `race` бол бичсэний дараа өөр хүн дарна */
  const io = (row, { race = null, failWrite = false } = {}) => {
    const st = { row: { ...row }, writes: 0, reads: 0 };
    return {
      st,
      now: () => NOW,
      read: async () => { st.reads += 1; return st.row ? { ...st.row } : null; },
      write: async (at) => {
        st.writes += 1;
        if (failWrite) return false;
        st.row = { ...st.row, batlagch: 'bat', shiidver_ognoo: at };
        if (race) st.row = { ...st.row, batlagch: race, shiidver_ognoo: at + 5 };
        return true;
      },
    };
  };
  /* (а) хоосон түгжээ → авна */
  let t = io(mk({}));
  assert.deepEqual(await casClaim(t, 'bat', { requireEmpty: true }), { ok: true });
  assert.equal(t.st.writes, 1, 'хоосон түгжээг бичсэнгүй');
  assert.equal(t.st.reads, 2, 'дахин уншиж баталгаажуулсангүй');
  /* (б) өөр хүний ХҮЧИНТЭЙ түгжээ → бичихгүй, нэрээр татгалзана */
  t = io(mk({ batlagch: 'Dorj', shiidver_ognoo: NOW - 60_000 }));
  let r = await casClaim(t, 'bat', { requireEmpty: false });
  assert.equal(r.ok, false); assert.equal(r.why, 'held'); assert.equal(r.holder, 'dorj');
  assert.equal(t.st.writes, 0, 'өөр хүний түгжээг дарж бичив');
  /* (в) `requireEmpty` (батлах) — өөр хүний ХУГАЦАА ДУУССАН түгжээ ч хоосон биш */
  t = io(mk({ batlagch: 'dorj', shiidver_ognoo: NOW - 11 * 60_000 }));
  r = await casClaim(t, 'bat', { requireEmpty: true });
  assert.equal(r.why, 'expired'); assert.equal(r.holder, 'dorj'); assert.equal(t.st.writes, 0);
  /*     буцаалт (`requireEmpty: false`) нь хугацаа дууссаныг авч болно (хуучин дүрэм) */
  t = io(mk({ batlagch: 'dorj', shiidver_ognoo: NOW - 11 * 60_000 }));
  assert.deepEqual(await casClaim(t, 'bat', { requireEmpty: false }), { ok: true });
  /* (г) уралдаан — бичсэний ДАРАА өөр хүн ялсан → ялагчийн нэрээр татгалзана */
  t = io(mk({}), { race: 'Sukh' });
  r = await casClaim(t, 'bat', { requireEmpty: true });
  assert.equal(r.ok, false); assert.equal(r.why, 'lost'); assert.equal(r.holder, 'sukh');
  /* (д) шийдвэрлэгдсэн/алга/бичилт унасан */
  r = await casClaim(io(mk({ toloh: PLAN_STATUS.approved, batlagch: 'dorj' })), 'bat', { requireEmpty: true });
  assert.equal(r.why, 'decided'); assert.equal(r.holder, 'dorj');
  r = await casClaim({ read: async () => null, write: async () => true }, 'bat', { requireEmpty: true });
  assert.equal(r.why, 'gone');
  t = io(mk({}), { failWrite: true });
  r = await casClaim(t, 'bat', { requireEmpty: true });
  assert.equal(r.why, 'write');
  /* (е) өөрийн хүчинтэй түгжээ — дахин авч болно (давхар `claimPlan`) */
  t = io(mk({ batlagch: 'bat', shiidver_ognoo: NOW - 1000 }));
  assert.deepEqual(await casClaim(t, 'bat', { requireEmpty: true }), { ok: true });

  /* (ж) ЭХ КОД: `decidePlan` түгжээгүй үед (`holder !== me`) `casClaim`-аар авна, ⚠️ шинэчлэгдсэн */
  const fs = await import('node:fs');
  const SRC = fs.readFileSync('src/lib/huvaariBatlah.ts', 'utf8');
  const i = SRC.indexOf('export async function decidePlan(');
  const j = SRC.indexOf('export type ClaimFail', i);
  const body = SRC.slice(i, j);
  assert.ok(/if \(holder !== me\) \{[\s\S]{0,200}casClaim\(/.test(body), 'decidePlan: хоосон түгжээнд casClaim дуудагдахгүй байна');
  assert.ok(body.indexOf('casClaim(') < body.indexOf("updates: JSON.stringify([{ attributes: attrs }])"), 'decidePlan: шийдвэрээ түгжихээс ӨМНӨ бичиж байна');
  assert.ok(body.includes('2026-10-01') && !/хоосон \(татсан\/\s*\n?\s*\*?\s*түгжээгүй\) эсвэл өөр хүн бол зогсоно/.test(body), 'decidePlan: «зогсоно» гэсэн хуучин ⚠️ шинэчлэгдээгүй');
  assert.ok(/releasePlanClaim\(\{ oid: args\.oid, approver: me \}\)/.test(body), 'decidePlan: өөрөө авсан түгжээг бичилт унахад тайлахгүй байна');

  /* ══ ЭХ ХУУДСАНД БИЧИХИЙН ӨМНӨХ ХАМГААЛАЛТ — `approveGuard` (2026-10-01) ══ */
  const sub = (o) => ({ oid: 5, status: PLAN_STATUS.pending, approver: 'bat', approverAt: NOW - 1000, ...o });
  assert.equal(approveGuard(sub({}), 5, 'Bat', NOW), null, 'өөрийн хүчинтэй түгжээ → бичнэ');
  assert.match(approveGuard(sub({ status: PLAN_STATUS.withdrawn, approver: null }), 5, 'bat', NOW), /татсан/, 'зохиогч татсан');
  assert.match(approveGuard(sub({ status: PLAN_STATUS.returned, approver: 'dorj' }), 5, 'bat', NOW), /dorj/, 'өөр батлагч шийдсэн → нэр');
  assert.match(approveGuard(sub({ approver: 'dorj' }), 5, 'bat', NOW), /dorj.*батлаж байна/, 'өөр хүн түгжсэн');
  assert.match(approveGuard(sub({ approverAt: NOW - 11 * 60_000 }), 5, 'bat', NOW), /хугацаа дууссан/, 'түгжээ хугацаа дууссан');
  assert.match(approveGuard(null, 5, 'bat', NOW), /олдсонгүй/, 'мөр алга');
  assert.match(approveGuard(sub({ oid: 6 }), 5, 'bat', NOW), /олдсонгүй/, 'өөр илгээлт');

  /* ЭХ КОД: `Huvaari.save` батлах горимд бичихийн ӨМНӨ дахин уншиж `approveGuard`-аар зогсоно */
  const H = fs.readFileSync('src/modules/Huvaari.tsx', 'utf8');
  const si = H.indexOf('const save = useCallback(');
  /* ⚠️ 2026-10-01 (merge tezu-bonu): `if (upd.length) { await applyUpdates(...); partialRef … }` блок болсон — хоёр хэлбэрийг таньна */
  const se = H.indexOf('await applyUpdates(pkg, upd);', si);
  assert.ok(si > 0 && se > si, 'Huvaari.save олдсонгүй');
  const pre = H.slice(si, se);
  assert.ok(/if \(approvalMode\) \{\s*const head = await loadSubmissionHead\(approving\);\s*const why = approveGuard\(/.test(pre),
    'Huvaari.save: эх хуудсанд бичихийн өмнө илгээлтийн төлвийг дахин уншихгүй байна');
  assert.ok(H.indexOf('applyPlanEdits(obEdits)', si) > se, 'Huvaari.save: сарын обьём хамгаалалтаас ӨМНӨ бичигдэж байна');
}
console.log('✅ CAS түгжээ (decidePlan) · бичихийн өмнөх approveGuard');

/* ══════════ ХАГАС БИЧИЛТИЙН СЕРВЕР ТЭМДЭГ · ДАВХАРДЛЫН ЦУЦЛАЛТ (2026-10-01) ══════════
 * ⚠️ Хагас бичигдсэн батлалтын хамгаалалт урьд нь зөвхөн санах ойд (`partialRef`) ба
 *    `CLAIM_TTL`-д байсан — сэргээлт/10 минутын дараа татах, буцаах хоёулаа өнгөрдөг байв.
 * ⚠️ Давхардлын цуцлалт (устгал унасан → `withdrawn`) багцын «сүүлийн шийдвэр» болж
 *    жинхэнэ буцаалтын шалтгааныг нууж байв. */
{
  const { partialBy, PARTIAL_MARK, isDupCancel, DUP_MARK } = await import('@/lib/huvaariBatlah.ts');
  const P = PLAN_STATUS.pending;
  assert.equal(partialBy(P, `${PARTIAL_MARK}:Bat`), 'bat', 'тэмдэг → батлагчийн нэр (жижиг үсгээр)');
  assert.equal(partialBy(P, PARTIAL_MARK), '', 'нэргүй тэмдэг ч хүчинтэй');
  assert.equal(partialBy(P, null), null, 'тэмдэггүй');
  assert.equal(partialBy(P, 'жирийн шалтгаан'), null, 'жирийн текст тэмдэг биш');
  assert.equal(partialBy(P, `${PARTIAL_MARK}x`), null, 'угтвар төстэй ч тэмдэг биш');
  assert.equal(partialBy(PLAN_STATUS.approved, `${PARTIAL_MARK}:bat`), null, 'шийдвэрлэгдсэн мөрд хүчингүй');

  const w = (o) => ({ status: PLAN_STATUS.withdrawn, reason: null, approverAt: 1_000, ...o });
  assert.equal(isDupCancel(w({})), false, 'жинхэнэ татсан (approverAt-тай) — шийдвэр хэвээр');
  assert.equal(isDupCancel(w({ reason: DUP_MARK })), true, 'тэмдэгтэй цуцлалт');
  assert.equal(isDupCancel(w({ approverAt: null })), true, 'тэмдэггүй хуучин цуцлалт (approverAt алга)');
  assert.equal(isDupCancel({ status: PLAN_STATUS.returned, reason: 'x', approverAt: null }), false, 'буцаалтыг хэзээ ч хасахгүй');

  const fs = await import('node:fs');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const L = strip(fs.readFileSync('src/lib/huvaariBatlah.ts', 'utf8'));
  const part = (a, b) => { const i = L.indexOf(a); const j = L.indexOf(b, i + a.length); assert.ok(i > 0 && j > i, `${a} олдсонгүй`); return L.slice(i, j); };
  /* decidePlan: буцаалтыг тэмдгээр ТҮГЖИХЭЭС ӨМНӨ хаана */
  const dp = part('export async function decidePlan(', 'export type ClaimFail');
  assert.ok(/if \(!args\.approve\) \{\s*const pb = partialBy\(/.test(dp), 'decidePlan: буцаалтад хагас бичилтийн тэмдэг шалгагдахгүй байна');
  assert.ok(dp.indexOf('partialBy(') < dp.indexOf('casClaim('), 'decidePlan: тэмдгийн шалгалт түгжилтээс хойш');
  assert.ok(dp.includes('F.reason}'), 'decidePlan: `reason` талбарыг уншихгүй байна');
  /* withdrawPlan: тэмдэгтэй бол татахгүй — бичилтээс ӨМНӨ */
  const wp = part('export async function withdrawPlan(', 'export async function countPlanPending(');
  assert.ok(wp.indexOf('partialBy(') > 0 && wp.indexOf('partialBy(') < wp.indexOf('[F.status]: PLAN_STATUS.withdrawn'), 'withdrawPlan: хагас бичилтийн тэмдэг шалгагдахгүй байна');
  /* submitPlan: устгал унахад тэмдэглэнэ */
  const sp = part('export async function submitPlan(', 'export async function decidePlan(');
  assert.ok(/\[F\.status\]: PLAN_STATUS\.withdrawn, \[F\.reason\]: DUP_MARK/.test(sp), 'submitPlan: давхардлын цуцлалтыг DUP_MARK-аар ялгахгүй байна');
  /* loadLastPerPkg · loadHistory: цуцлалтыг хасна */
  assert.ok(part('export async function loadLastPerPkg(', 'export async function loadHistory(').includes('isDupCancel('), 'loadLastPerPkg: цуцлалтыг хасахгүй');
  assert.ok(part('export async function loadHistory(', 'export async function loadPayload(').includes('isDupCancel('), 'loadHistory: цуцлалтыг хасахгүй');

  /* Huvaari.save: тэмдэг + partialRef АНХНЫ бичилтээс ӨМНӨ; save дотор partialRef арилгахгүй */
  const H = strip(fs.readFileSync('src/modules/Huvaari.tsx', 'utf8'));
  const si = H.indexOf('const save = useCallback(');
  const se = H.indexOf('const decide = useCallback(', si);
  assert.ok(si > 0 && se > si, 'Huvaari.save / decide олдсонгүй');
  const sv = H.slice(si, se);
  const iMark = sv.indexOf('markPlanPartial(');
  const iRef = sv.indexOf('partialRef.current = approving');
  const iUpd = sv.indexOf('await applyUpdates(pkg, upd);');
  const iOb = sv.indexOf('applyPlanEdits(obEdits)');
  assert.ok(iMark > 0 && iMark < iRef && iRef < iUpd && iUpd < iOb, 'Huvaari.save: хагас бичилтийн тэмдэг анхны бичилтээс ӨМНӨ биш');
  /* ⚠️ 2026-10-01: ЗӨВХӨН нэг ч мөр бичигдээгүй (`written === 0`) үед тэмдгийг арилгаж болно */
  const svNo0 = sv.replace(/if \(await clearPlanPartial\(approving\)\) partialRef\.current = null;/, '');
  assert.ok(/written\)?\s*===\s*0 && partialRef\.current === approving/.test(sv), 'Huvaari.save: тэмдэг арилгах нь written === 0-оор хамгаалагдаагүй');
  assert.ok(!/partialRef\.current = null/.test(svNo0), 'Huvaari.save: partialRef-ийг decidePlan-аас ӨМНӨ арилгаж байна');
  /* obLost нь батлах горимын «бүгд эсвэл юу ч үгүй» шалгуурт */
  assert.ok(/approvalMode && \([^)]*obLost/.test(sv), 'Huvaari.save: батлах горимд obLost хаагдахгүй байна');
  /* decide: түгжээ тайлах нь хагас бичилтэд хамгаалагдсан */
  const dc = H.slice(se, H.indexOf('const reviewStarted', se));
  assert.ok(/const release = \(\) => \(partialRef\.current === oid0 \?/.test(dc), 'Huvaari.decide: release хагас бичилтэд хамгаалагдаагүй');
  const rel = dc.match(/void releasePlanClaim\(\{ oid: approving,[^\n]*/g) ?? [];
  assert.ok(rel.length >= 2, 'Huvaari: батлах эффектийн эрт буцалт олдсонгүй');
  for (const ln of dc.split('\n').filter((x) => x.includes('void releasePlanClaim({ oid: approving'))) {
    assert.ok(/partialRef\.current !== approving\) void releasePlanClaim/.test(ln), `Huvaari: хамгаалалтгүй тайлалт: ${ln.trim()}`);
  }
  assert.ok((dc.match(/partialRef\.current = null/g) ?? []).length >= 2, 'Huvaari: decidePlan амжилттай болоход partialRef арилахгүй');
}
console.log('✅ хагас бичилтийн сервер тэмдэг · давхардлын цуцлалт «сүүлийн шийдвэр» биш · obLost хаалт · түгжээ хадгална');
