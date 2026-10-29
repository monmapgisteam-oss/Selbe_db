/**
 * САНХҮҮГИЙН БҮРТГЭЛИЙН ЗАСВАР — нүдний утга хөрвүүлэлт.
 *   node src/modules/finEdit.check.mjs
 *
 * Хамгаалж буй алдаа: хүснэгтийн нүд нь ТЕКСТ, үйлчилгээ нь ТӨРӨЛТЭЙ. Хоёрын
 * хооронд буруу хөрвүүлбэл дашбоардын БҮХ санхүүгийн тоо чимээгүй гажина —
 * дэлгэц дээр алдаа гарахгүй, зөвхөн дүн буруу болно.
 */
import assert from 'node:assert/strict';
import { editText, parseCell, SERVER_RO, NUMERIC_TYPES, awaitingReload, upgradeFinanceDraft, parseFinanceShare } from '../lib/finEdit.ts';

assert.ok(NUMERIC_TYPES.has('esriFieldTypeDouble'), 'тоон төрлийн жагсаалт');

let ok = 0;
const check = (label, cond) => { assert.ok(cond, '✗ ' + label); ok += 1; console.log('  ✓ ' + label); };

const D = 'esriFieldTypeDouble';
const S = 'esriFieldTypeString';
const T = 'esriFieldTypeDate';

console.log('\n1. ХООСОН нүд — null, тэг БИШ');
check('хоосон мөр → null', parseCell('', D, 'x') === null);
check('зөвхөн зайтай → null', parseCell('   ', D, 'x') === null);
check('хоосон нь 0 БОЛЖ ХӨРВӨХГҮЙ', parseCell('', D, 'x') !== 0);
check('бодит тэгийг хадгална', parseCell('0', D, 'x') === 0);

console.log('\n2. ТОО — хуулж тавьсан форматыг таана');
check('энгийн бүхэл', parseCell('42', D, 'x') === 42);
check('бутархай', parseCell('3.5', D, 'x') === 3.5);
check('мянгатын таслал', parseCell('62,791,703,684', D, 'x') === 62791703684);
check('зайтай', parseCell('1 000 000', D, 'x') === 1000000);
check('салдаггүй зай (nbsp)', parseCell('1 234', D, 'x') === 1234);
check('сөрөг', parseCell('-15.25', D, 'x') === -15.25);
check('аравтын таслал «12,5» → 12.5', parseCell('12,5', D, 'x') === 12.5);
check('аравтын таслал «12,50» → 12.5', parseCell('12,50', D, 'x') === 12.5);
check('сөрөг аравтын таслал «-3,25» → -3.25', parseCell('-3,25', D, 'x') === -3.25);
assert.throws(() => parseCell('1,234', D, 'x'), /тодорхойгүй/);
check('«1,234» → тодорхойгүй таслалын алдаа (таамаглахгүй)', true);
check('«0,125» → 0.125 (125 БИШ)', parseCell('0,125', D, 'x') === 0.125);
check('«1,234,567» → 1234567', parseCell('1,234,567', D, 'x') === 1234567);
check('«1.234,5» → 1234.5', parseCell('1.234,5', D, 'x') === 1234.5);
check('мянгат + бутархай «1,234.5» → 1234.5', parseCell('1,234.5', D, 'x') === 1234.5);
check('«1234,5678» → 1234.5678 (мянгат байж чадахгүй)', parseCell('1234,5678', D, 'x') === 1234.5678);
assert.throws(() => parseCell('1,2,3', D, 'x'), /тоо буруу/);
check('«1,2,3» → алдаа', true);
check('хувь «8,333» → 8.333 (мянгат БИШ)', parseCell('8,333', D, 'x', undefined, true) === 8.333);
check('хувь «12,5» → 12.5', parseCell('12,5', D, 'x', undefined, true) === 12.5);
check('хувь «0,125» → 0.125', parseCell('0,125', D, 'x', undefined, true) === 0.125);
assert.throws(() => parseCell('-0,125', D, 'x', undefined, true), /0–100/);
assert.throws(() => parseCell('100.5', D, 'x', undefined, true), /0–100/);
check('хувь сөрөг / 100-аас их → алдаа', true);
check('хувь 0 ба 100 зөвшөөрөгдөнө', parseCell('0', D, 'x', undefined, true) === 0 && parseCell('100', D, 'x', undefined, true) === 100);
check('хувь «8.333» → 8.333', parseCell('8.333', D, 'x', undefined, true) === 8.333);
assert.throws(() => parseCell('8,333', D, 'x'), /тодорхойгүй/);
check('хувь БИШ талбарт «8,333» → тодорхойгүй (2026-10-05; урьд нь 8333)', true);

console.log('\n3. БУРУУ утга — ЧИМЭЭГҮЙ 0 болгохгүй, алдаа шиднэ');
assert.throws(() => parseCell('гурав', D, 'Төсөв'), /тоо буруу/);
check('үсэг оруулбал алдаа', true);
assert.throws(() => parseCell('2026-13-45', T, 'Огноо'), /огноо/);
check('буруу огноонд алдаа', true);
assert.throws(() => parseCell('2026-02-30', T, 'Огноо'), /огноо/);
check('2026-02-30 (хуанлид байхгүй) → алдаа', true);
assert.throws(() => parseCell('2026-06-31', T, 'Огноо'), /огноо/);
check('2026-06-31 (30 хоногтой сар) → алдаа', true);
assert.throws(() => parseCell('27.05.2026', T, 'Огноо'), /огноо/);
check('«27.05.2026» (цэгтэй бичиглэл) → алдаа', true);

console.log('\n4. ОГНОО — хоёр тал тэгш эргэнэ');
const ms = Date.UTC(2026, 4, 27);
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
for (const n of ['objectid', 'globalid', 'SHAPE__Area', 'created_date', 'last_edited_user', 'last_edited_date'])
  assert.ok(SERVER_RO.test(n), '✗ ' + n);
check('серверийн 6 талбар хаагдсан', true);
for (const n of ['CF006', 'IPC35', 'bagts_ner'])
  assert.ok(!SERVER_RO.test(n), '✗ ' + n + ' буруу хаагдав');
check('өгөгдлийн талбар нээлттэй хэвээр', true);

console.log('\nX. ⚠️ 2026-10-01: нийтлэлийн дараах дахин ачаалалт дуустал ДАХИН нийтлэхгүй');
{
  const rowsA = [{ objectid: 1 }];
  const rowsB = [{ objectid: 1 }];
  check('нийтлээгүй үед хаалтгүй', awaitingReload(null, rowsA) === false);
  check('нийтэлсний дараа ижил (хуучин) rows — хаалттай', awaitingReload(rowsA, rowsA) === true);
  check('шинэ rows ирмэгц нээгдэнэ (агуулга ижил ч лавлагаа өөр)', awaitingReload(rowsA, rowsB) === false);
}

console.log('\nXI. Хуучин санхүүгийн ноорог — хувийн нэгжийг алдагдалгүй сэргээнэ');
{
  const share = 'zahiramj_unet_tsaas_huvi';
  const key = `7:${share}`;
  const legacy = { pend: { [key]: '0.09', '7:ho_dun_geree': '1234' }, adds: [{ [share]: '0.09', name: 'old' }], at: 123 };
  const before = JSON.stringify(legacy);
  const migrated = upgradeFinanceDraft(legacy, share);
  check('хуучин pend 0.09 → 9', migrated.v === 3 && migrated.pend[key] === '9');
  check('хуучин adds 0.09 → 9', migrated.adds[0][share] === '9');
  check('сэргээгдсэн pend дахин нийтлэхэд 0.09 хэвээр', parseFinanceShare(migrated.pend[key], D, share) === 0.09);
  check('сэргээгдсэн adds дахин нийтлэхэд 0.09 хэвээр', parseFinanceShare(migrated.adds[0][share], D, share) === 0.09);
  check('бусад талбар/агшин ба эх ноорог өөрчлөгдөөгүй', migrated.pend['7:ho_dun_geree'] === '1234'
    && migrated.adds[0].name === 'old' && migrated.at === 123 && JSON.stringify(legacy) === before);
  check('v3 ноорог дахин үржигдэхгүй', upgradeFinanceDraft(migrated, share) === migrated);
  const current = { v: 2, pend: { [key]: '9' }, adds: [], at: 0 };
  check('v2 хувийн 9 хэвээр (v3 болно, дахин үржихгүй)', upgradeFinanceDraft(current, share).pend[key] === '9' && upgradeFinanceDraft(current, share).v === 3);
  const future = { ...current, v: 4 };
  check('танихгүй хувилбарыг сэргээхгүй, эх утгыг хадгална', upgradeFinanceDraft(future, share) === null && future.pend[key] === '9');
  for (const [text, expected] of [['0,09', '9'], ['0,125', '12.5'], ['0.07', '7'], ['', ''], ['   ', '   '], ['0', '0']]) {
    const draft = upgradeFinanceDraft({ pend: { [key]: text }, adds: [{ [share]: text }], at: 0 }, share);
    check(`хуучин тоон дүрэм/хоосон: «${text}»`, draft.pend[key] === expected && draft.adds[0][share] === expected);
    check(`nullable/хувийн нийтлэл: «${text}»`, parseFinanceShare(draft.pend[key], D, share) === parseCell(text, D, share));
  }
  for (const text of ['bad', '1,250']) {
    const draft = upgradeFinanceDraft({ pend: { [key]: text }, adds: [{ [share]: text }], at: 0 }, share);
    check(`буруу/тодорхойгүй текст хэвээр: «${text}»`, draft.pend[key] === text && draft.adds[0][share] === text
      && draft.legacyShareInvalid.includes(text));
    assert.throws(() => parseFinanceShare(text, D, share, draft.legacyShareInvalid));
    const restored = upgradeFinanceDraft(JSON.parse(JSON.stringify(draft)), share);
    assert.throws(() => parseFinanceShare(restored.adds[0][share], D, share, restored.legacyShareInvalid));
    check(`v2-оор дахин сэргээсэн ч хуучин алдаа хаалттай: «${text}»`, true);
    check(`зассан ил тод текст нийтлэгдэнэ: «${text}»`, parseFinanceShare('1.25', D, share, restored.legacyShareInvalid) === 0.0125);
  }
  const overflow = upgradeFinanceDraft({ pend: { [key]: '1e308' }, adds: [], at: 0 }, share);
  check('×100 overflow эх текстийг Infinity болгож алдахгүй', overflow.pend[key] === '1e308');
  assert.throws(() => parseFinanceShare(overflow.pend[key], D, share, overflow.legacyShareInvalid), /0–100/);

  const adv = 'urdchilgaa_huvi';
  const FR = [share, adv];
  const v2 = { v: 2, pend: { [key]: '9', [`7:${adv}`]: '0.2', '7:ho_dun_geree': '5' }, adds: [{ [share]: '9', [adv]: '0.164' }], at: 5, legacyShareInvalid: ['bad'] };
  const v3 = upgradeFinanceDraft(v2, share, FR);
  check('v2 → v3: urdchilgaa_huvi 0.2 → 20, хувь 9 ХЭВЭЭР (дахин үржихгүй), бусад талбар хэвээр',
    v3.v === 3 && v3.pend[`7:${adv}`] === '20' && v3.pend[key] === '9' && v3.pend['7:ho_dun_geree'] === '5');
  check('v2 → v3: adds 0.164 → 16.4, хувь 9 хэвээр, хуучин алдааны тэмдэг хадгалагдана',
    v3.adds[0][adv] === '16.4' && v3.adds[0][share] === '9' && v3.legacyShareInvalid.includes('bad'));
  check('v3 ноорог дахин үржигдэхгүй', upgradeFinanceDraft(v3, share, FR) === v3);
  const v0 = upgradeFinanceDraft({ pend: { [key]: '0.09', [`7:${adv}`]: '0,2' }, adds: [], at: 0 }, share, FR);
  check('хувилбаргүй ноорог: хувь 0.09 → 9, urdchilgaa_huvi «0,2» → 20', v0.v === 3 && v0.pend[key] === '9' && v0.pend[`7:${adv}`] === '20');
  check('сэргээгдсэн urdchilgaa_huvi 20 дахин нийтлэхэд 0.2 (÷100)', parseFinanceShare(v3.pend[`7:${adv}`], D, adv) === 0.2);
  check('fractionFields-гүй дуудлага хувийг л үржүүлнэ', upgradeFinanceDraft({ pend: { [`7:${adv}`]: '0.2' }, adds: [], at: 0 }, share).pend[`7:${adv}`] === '0.2');
}

console.log('\n✅ Санхүүгийн засварын ' + ok + ' шалгуур давлаа');
