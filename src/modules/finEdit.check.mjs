/**
 * САНХҮҮГИЙН БҮРТГЭЛИЙН ЗАСВАР — нүдний утга хөрвүүлэлт.
 *   node src/modules/finEdit.check.mjs
 *
 * Хамгаалж буй алдаа: хүснэгтийн нүд нь ТЕКСТ, үйлчилгээ нь ТӨРӨЛТЭЙ. Хоёрын
 * хооронд буруу хөрвүүлбэл дашбоардын БҮХ санхүүгийн тоо чимээгүй гажина —
 * дэлгэц дээр алдаа гарахгүй, зөвхөн дүн буруу болно.
 *
 * ⚠️ Логик нь `Finance.tsx`-ийн `editText`/`parseCell`-ийн ХУУЛБАР (node нь TSX
 * уншихгүй) — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

const NUMERIC_TYPES = new Set([
  'esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeSingle',
  'esriFieldTypeSmallInteger', 'esriFieldTypeBigInteger', 'esriFieldTypeOID',
]);

function editText(v, type) {
  if (v == null) return '';
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  return String(v);
}

function parseCell(s, type, label) {
  const v = s.trim();
  if (v === '') return null;
  if (type === 'esriFieldTypeDate') {
    const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
    if (Number.isNaN(d.getTime())) throw new Error(`«${label}» — огноо буруу: ${v}`);
    return d.getTime();
  }
  if (NUMERIC_TYPES.has(type)) {
    const x = Number(v.replace(/[\s, ]/g, ''));
    if (!Number.isFinite(x)) throw new Error(`«${label}» — тоо буруу: ${v}`);
    return x;
  }
  return v;
}

const SERVER_RO = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor)/i;

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
assert.throws(() => parseCell('2026-13-45', T, 'Огноо'), /огноо буруу/);
check('буруу огноонд алдаа', true);

console.log('\n4. ОГНОО — хоёр тал тэгш эргэнэ');
const ms = Date.UTC(2026, 4, 27);
check('epoch → YYYY-MM-DD', editText(ms, T) === '2026-05-27');
check('YYYY-MM-DD → epoch', parseCell('2026-05-27', T, 'x') === ms);
check('эргэлт тогтвортой', parseCell(editText(ms, T), T, 'x') === ms);

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
