/**
 * САНХҮҮГИЙН БҮРТГЭЛИЙН ЗАСВАР — нүдний утга хөрвүүлэлт.
 *   node src/modules/finEdit.check.mjs
 *
 * Хамгаалж буй алдаа: хүснэгтийн нүд нь ТЕКСТ, үйлчилгээ нь ТӨРӨЛТЭЙ. Хоёрын
 * хооронд буруу хөрвүүлбэл дашбоардын БҮХ санхүүгийн тоо чимээгүй гажина —
 * дэлгэц дээр алдаа гарахгүй, зөвхөн дүн буруу болно.
 *
 * ⚠️ 2026-09-25: логик нь `src/lib/finEdit.ts`-д (Finance.tsx түүнийг импортолно) —
 * энэ тест ТҮҮНИЙГ шууд шалгана.
 */
import assert from 'node:assert/strict';
/* ⚠️ 2026-09-25: ХУУЛБАР БИШ — эх модулийг ШУУД импортолно (`src/lib/finEdit.ts`,
   импортгүй тул цэвэр `node`-ийн төрөл хасалтаар ачаалагдана). Урьд нь энд
   `editText`/`parseCell`-ийн гар хуулбар байсан тул эх код өөрчлөгдөхөд (`DateOnly`
   салаа, орон нутгийн өдөр) тест хуучин дүрмийг «ногоон» гэж баталсаар байв. */
import { editText, parseCell, SERVER_RO, NUMERIC_TYPES } from '../lib/finEdit.ts';

assert.ok(NUMERIC_TYPES.has('esriFieldTypeDouble'), 'тоон төрлийн жагсаалт');

let ok = 0;
const check = (label, cond) => { assert.ok(cond, '✗ ' + label); ok += 1; console.log('  ✓ ' + label); };

const D = 'esriFieldTypeDouble';
const S = 'esriFieldTypeString';
const T = 'esriFieldTypeDate';

console.log('\n1. ХООСОН нүд — null, тэг БИШ');
check('хоосон мөр → null', parseCell('', D, 'x') === null);
check('зөвхөн зайтай → null', parseCell('   ', D, 'x') === null);
/* ⚠️ ЭНЭ БОЛ ХАМГИЙН ЧУХАЛ ШАЛГУУР. `''` → 0 болгож бичвэл «бөглөөгүй» мөр
   «тэг төгрөг» болж, дашбоардын дундаж ба нийлбэр чимээгүй гажина. */
check('хоосон нь 0 БОЛЖ ХӨРВӨХГҮЙ', parseCell('', D, 'x') !== 0);
check('бодит тэгийг хадгална', parseCell('0', D, 'x') === 0);

console.log('\n2. ТОО — хуулж тавьсан форматыг таана');
check('энгийн бүхэл', parseCell('42', D, 'x') === 42);
check('бутархай', parseCell('3.5', D, 'x') === 3.5);
check('мянгатын таслал', parseCell('62,791,703,684', D, 'x') === 62791703684);
check('зайтай', parseCell('1 000 000', D, 'x') === 1000000);
check('салдаггүй зай (nbsp)', parseCell('1 234', D, 'x') === 1234);
check('сөрөг', parseCell('-15.25', D, 'x') === -15.25);

console.log('\n3. БУРУУ утга — ЧИМЭЭГҮЙ 0 болгохгүй, алдаа шиднэ');
assert.throws(() => parseCell('гурав', D, 'Төсөв'), /тоо буруу/);
check('үсэг оруулбал алдаа', true);
assert.throws(() => parseCell('2026-13-45', T, 'Огноо'), /огноо/);
check('буруу огноонд алдаа', true);
/* ⚠️ 2026-09-08 (аудит): ХУАНЛИД БАЙХГҮЙ огноо. Эдгээр нь `new Date`-д NaN
   БИШ — чимээгүй дараагийн сар руу ГҮЙДЭГ тул зөвхөн NaN шалгадаг хуучин
   код барьдаггүй байв (2026-02-30 → 2026-03-02, 2026-06-31 → 2026-07-01). */
assert.throws(() => parseCell('2026-02-30', T, 'Огноо'), /огноо/);
check('2026-02-30 (хуанлид байхгүй) → алдаа', true);
assert.throws(() => parseCell('2026-06-31', T, 'Огноо'), /огноо/);
check('2026-06-31 (30 хоногтой сар) → алдаа', true);
assert.throws(() => parseCell('27.05.2026', T, 'Огноо'), /огноо/);
check('«27.05.2026» (цэгтэй бичиглэл) → алдаа', true);

console.log('\n4. ОГНОО — хоёр тал тэгш эргэнэ');
const ms = Date.UTC(2026, 4, 27);
/* ⚠️ `editText` нь ОРОН НУТГИЙН өдөр (`format.dayKey`-ийн дүрэм) — өдрийн дунд цаг
   ямар ч бүсэд тухайн өдөр хэвээр */
check('epoch → YYYY-MM-DD (орон нутгийн өдөр)', editText(new Date(2026, 4, 27, 12).getTime(), T) === '2026-05-27');
check('YYYY-MM-DD → epoch', parseCell('2026-05-27', T, 'x') === ms);
check('текст → epoch → текст эргэлт', editText(new Date(2026, 4, 27, 12).getTime(), T) === '2026-05-27'
  && parseCell('2026-05-27', T, 'x') === ms);
const DO = 'esriFieldTypeDateOnly';
check('DateOnly: мөр хэвээр буцна', parseCell('2026-05-27', DO, 'x') === '2026-05-27');
check('DateOnly: editText мөр', editText('2026-05-27', DO) === '2026-05-27');
assert.throws(() => parseCell('27.05.2026', DO, 'Огноо'), /огноо/);
check('DateOnly: «27.05.2026» → алдаа', true);
assert.throws(() => parseCell('2026-02-30', DO, 'Огноо'), /огноо/);
check('DateOnly: 2026-02-30 → алдаа', true);

console.log('\n5. ТЕКСТ — гажуудахгүй');
check('текст хэвээр', parseCell('БАГЦ-3.1', S, 'x') === 'БАГЦ-3.1');
check('таслалтай текст ТООД хөрвөхгүй', parseCell('1,2', S, 'x') === '1,2');
check('null → хоосон текст', editText(null, S) === '');

console.log('\n6. Серверийн талбар — засагдахгүй');
for (const n of ['OBJECTID', 'GlobalID', 'Shape__Area', 'CreationDate', 'Editor', 'EditDate'])
  assert.ok(SERVER_RO.test(n), '✗ ' + n);
check('серверийн 6 талбар хаагдсан', true);
for (const n of ['CF006', 'IPC35', 'bagts_ner'])
  assert.ok(!SERVER_RO.test(n), '✗ ' + n + ' буруу хаагдав');
check('өгөгдлийн талбар нээлттэй хэвээр', true);

console.log('\n✅ Санхүүгийн засварын ' + ok + ' шалгуур давлаа');
