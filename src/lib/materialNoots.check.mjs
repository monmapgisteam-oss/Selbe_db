/**
 * МАТЕРИАЛЫН НӨӨЦ ба АЖЛЫН МАТЕРИАЛ — цэвэр дүрмүүд (2026-10-21).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/materialNoots.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIR_ID_LEN, TOLOV, guidKey, mirIdIssue, nootsSummary, planSync, receiptsOf, statusFixes, tolovOf } from './materialNoots.ts';
import { formatMats, parseMats } from './materialAjil.ts';

const ma = (o) => ({ oid: 1, respNo: 'SLB-REP-MA-1', verdict: 'A', material: 'Арматур', works: [], ...o });
const mir = (o) => ({ oid: 1, rowId: '{AAAA-1}', maNo: 'SLB-REP-MA-1', verdict: 'A', material: 'Арматур', qty: 10, unit: 'тн', ...o });
const row = (o) => ({ oid: 1, name: 'Арматур', inQty: 10, usedQty: null, unit: 'тн', status: TOLOV.open, mirId: 'aaaa-1', ...o });

/* 1. Төлөв — ашигласан мэдэгдэхгүй (null) бол «Дуусаагүй» (null ≠ 0) */
assert.equal(tolovOf(10, null), TOLOV.open);
assert.equal(tolovOf(10, 9), TOLOV.open);
assert.equal(tolovOf(10, 10), TOLOV.done);
assert.equal(tolovOf(null, 5), TOLOV.open);
assert.equal(tolovOf(0, 0), TOLOV.open, 'ирсэн 0 бол «дууссан» биш');

/* 2. Нөөцөд орох ачаа — MA БА MIR хоёулаа батлагдсан */
assert.equal(guidKey('{AbC-1}'), 'abc-1');
assert.equal(receiptsOf([ma()], [mir()]).length, 1);
assert.equal(receiptsOf([ma({ verdict: 'R' })], [mir()]).length, 0, 'MA R');
assert.equal(receiptsOf([ma({ verdict: null })], [mir()]).length, 0, 'MA шийдвэргүй');
assert.equal(receiptsOf([ma()], [mir({ verdict: 'R' })]).length, 0, 'MIR R');
assert.equal(receiptsOf([], [mir()]).length, 0, 'MA алга');
assert.equal(receiptsOf([ma({ verdict: 'AN' })], [mir({ verdict: 'AN' })]).length, 1, 'AN = батлагдсан');
/* Хариу бичгийн СҮҮЛИЙН хувилбар хүчинтэй — дахин илгээж R болсон бол орохгүй */
assert.equal(receiptsOf([ma({ oid: 1 }), ma({ oid: 2, verdict: 'R' })], [mir()]).length, 0, 'сүүлийн MA R');
/* Нэр MA-гийн сонголтоос */
assert.equal(receiptsOf([ma({ material: 'Бетон зуурмаг' })], [mir({ material: 'x' })])[0].name, 'Бетон зуурмаг');
assert.deepEqual(receiptsOf([ma()], [mir({ rowId: '' })]), [], 'rowId-гүй MIR алгасна');

/* 3. Синкийн төлөвлөгөө — нэмэх · шинэчлэх · хасах · давхардал */
const rc = receiptsOf([ma()], [mir(), mir({ rowId: '{BBBB-2}', qty: 5 })]);
let p = planSync([], rc);
assert.equal(p.adds.length, 2);
p = planSync([row()], rc);
assert.deepEqual(p.adds.map((a) => a.mirId), ['bbbb-2']);
assert.equal(p.updates.length, 0, 'өөрчлөлтгүй');
p = planSync([row({ inQty: 8 })], rc);
assert.deepEqual(p.updates, [{ oid: 1, name: 'Арматур', qty: 10, unit: 'тн' }], 'MIR-ийн тоо засагдвал дагана');
p = planSync([row(), row({ oid: 7 })], rc);
assert.deepEqual(p.deletes, [7], 'давхардал — БАГА objectid үлдэнэ');
p = planSync([row({ mirId: 'zzzz-9', oid: 3 })], rc);
assert.deepEqual(p.deletes, [3], 'батлагдахаа больсон MIR-ийн мөр хасагдана');
p = planSync([row({ mirId: '', oid: 4 })], rc);
assert.ok(!p.deletes.includes(4), 'mir_id-гүй (гараар) мөрийг хөндөхгүй');

/* 4. Нэрээр нэгтгэл ба төлөв */
const sums = nootsSummary([row(), row({ oid: 2, inQty: 5, mirId: 'b' }), row({ oid: 3, name: 'Бетон', unit: 'м3', inQty: null, mirId: 'c' })]);
const arm = sums.find((x) => x.name === 'Арматур');
assert.equal(arm.inSum, 15);
assert.equal(arm.usedSum, null, 'ашигласан мэдэгдэхгүй — 0 биш');
assert.equal(arm.rest, null);
assert.equal(arm.n, 2);
assert.equal(sums.find((x) => x.name === 'Бетон').inSum, null, 'бүх тоо null бол нийлбэр null');
const used = [row({ usedQty: 6 }), row({ oid: 2, inQty: 5, usedQty: 9, mirId: 'b', status: TOLOV.open })];
assert.equal(nootsSummary(used)[0].status, TOLOV.done, '15 ирсэн, 15 ашигласан → дууссан');
assert.deepEqual(statusFixes(used).map((x) => x.oid), [1, 2], 'нэг материалын БҮХ мөр «Дууссан»');
assert.deepEqual(statusFixes([row()]), [], 'төлөв зөв бол бичихгүй');

/* Different units must never produce a scalar total or automatic status write. */
for (const units of [['kg', 'ton'], ['kg', '']]) {
  const mixed = [row({ unit: units[0], inQty: 100, usedQty: 200 }),
    row({ oid: 2, unit: units[1], inQty: 2, usedQty: 0, mirId: 'b' })];
  const s = nootsSummary(mixed)[0];
  assert.equal(s.inSum, null, '100 kg + 2 ton is not 102');
  assert.equal(s.usedSum, null);
  assert.equal(s.rest, null);
  assert.equal(s.status, null, 'incomparable quantities cannot establish completion');
  assert.equal(s.unitConflict, true);
  assert.deepEqual(statusFixes(mixed), [], 'do not overwrite server status from mixed units');
}
const sameUnits = nootsSummary([row({ unit: ' kg ', inQty: 100, usedQty: 50 }),
  row({ oid: 2, unit: 'KG', inQty: 2, usedQty: 1 })])[0];
assert.equal(sameUnits.unitConflict, false);
assert.equal(sameUnits.rest, 51, 'case/whitespace do not create a unit conflict');

/* 5. Ажлын материал — нэг нүдэнд олон нэр, таслалтай нэр ч эвдрэхгүй */
const comma = 'Цахилгааны самбар (айлын, давхарын, цахилгааны өрөөний)';
assert.deepEqual(parseMats(`Арматур; ${comma} ;Арматур;`), ['Арматур', comma]);
assert.equal(formatMats(['Арматур', comma]), `Арматур; ${comma}`);
assert.equal(formatMats([]), null, 'хоосон → null');
assert.deepEqual(parseMats(null), []);
assert.throws(() => formatMats(['x'.repeat(1001)]), 'урт хэтэрвэл тайрахгүй, шиднэ');

/* 6. `mir_id` талбарын шаардлага (аудит №2, 2026-10-21) — алга · богино · буруу төрөл бол шалтгаан, тохирвол null */
assert.ok(mirIdIssue([]), 'талбар алга → шалтгаан');
assert.equal(mirIdIssue([{ name: 'mir_id', type: 'esriFieldTypeString', length: 50 }]), null, 'String(50) тохирно (админ нэмсэн)');
assert.equal(mirIdIssue([{ name: 'MIR_ID', type: 'esriFieldTypeGUID', length: 38 }]), null, 'GUID тохирно, үсгийн хэмжээ хамаарахгүй');
assert.match(mirIdIssue([{ name: 'mir_id', type: 'esriFieldTypeString', length: 36 }]), /36/, 'богино String → уртыг нэрлэнэ');
assert.match(mirIdIssue([{ name: 'mir_id', type: 'esriFieldTypeInteger' }]), /Integer/, 'буруу төрөл → төрлийг нэрлэнэ');
assert.equal(`{${'a'.repeat(36).toUpperCase()}}`.length, MIR_ID_LEN, 'бичигдэх {GUID} = 38 тэмдэгт');

/* 7. Хэсэгчилсэн нийлбэр — тоо хэмжээгүй (null) ачаа 0 биш: нийлбэр мэдэгдэх утгуудынх, тоо нь тусдаа, төлөв «Дуусаагүй» */
const part = nootsSummary([row({ inQty: 10, usedQty: 10 }), row({ oid: 2, inQty: null, usedQty: null, mirId: 'b' })])[0];
assert.equal(part.inSum, 10, 'мэдэгдэх утгуудын нийлбэр');
assert.equal(part.inUnknown, 1);
assert.equal(part.usedSum, 10);
assert.equal(part.usedUnknown, 1);
assert.equal(part.rest, null, 'нийлбэр дутуу бол үлдэгдэл тодорхойгүй');
assert.equal(part.status, TOLOV.open, 'тоогүй ачаатай бол «Дууссан» гэж дүгнэхгүй');
assert.equal(tolovOf(10, 10, true), TOLOV.open);
assert.equal(nootsSummary(used)[0].inUnknown, 0, 'бүгд мэдэгдэх бол 0');
assert.deepEqual(statusFixes([row({ usedQty: 10, status: TOLOV.done }), row({ oid: 2, inQty: null, mirId: 'b', status: TOLOV.done })]).map((x) => x.oid), [1, 2],
  'буруу «Дууссан» төлөв бүх мөрөнд засагдана');

/* 8. Эх кодын дүрэм — таб солих хамгаалалт · бичилтгүй бол хүчингүй болгохгүй · эрх lib-д */
const here = fileURLToPath(new URL('.', import.meta.url));
const MA = readFileSync(`${here}/../modules/Ma.tsx`, 'utf8');
/* ⚠️ 2026-10-23 (UX аудит X1): `goTab` нь `askConfirm`-ийг хүлээдэг тул async */
assert.ok(/const goTab = (async )?\(t: 'chain' \| 'noots' \| 'ajil'\)/.test(MA) && /navDirtyLabels\(\)/.test(MA), 'Ma.tsx: таб солиход navGuard асуулт');
assert.ok(!/onClick=\{\(\) => setTab\(/.test(MA), 'Ma.tsx: табын товч setTab-ийг шууд дууддаггүй');
const LIB = readFileSync(`${here}/materialNoots.ts`, 'utf8');
assert.ok(/if \(wrote\) invalidate\('MATERIAL_NOOTS'\)/.test(LIB), 'зөвхөн бичилт оролдсон үед хүчингүй болгоно');
assert.ok(/^    requireSyncCap\(\);$/m.test(LIB), 'syncNoots эрх шалгана');
assert.ok(/if \(autoOff\) return \{ added: 0/.test(LIB), 'mir_id алга бол шидэхгүй — disabled-аар буцаана');

console.log('✅ materialNoots: бүх шалгуур давлаа');
