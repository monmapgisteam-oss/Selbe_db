/**
 * Үзлэгийн тайлангийн загвар (`uzlegReport.buildUzReport`) ба xlsx бичигч.
 *
 * Жишээ схем нь `2026-09-29 Морин сувд.pdf`-ийн бүтцийг дуурайна: асуулт бүр
 * хариултын домэйнтэй, `<асуулт>_blk` блок, `<асуулт>_note` тэмдэглэл, хэсгийн оноо
 * `sc_<угтвар>_earned/appl`, гарын үсэг `sig_*`.
 *
 * Ажиллуулах: node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/uzlegReport.check.mjs
 */
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { buildUzReport, buildUzXlsx, ansCls, companyShort } = await import('@/lib/uzlegReport.ts');

const ANS = new Map([
  ['conf', 'Conformance / Нийцсэн'],
  ['obs', 'Observation and Fixed in the field / Ажиглалт ба талбайд зассан'],
  ['minor', 'Minor Non-Conformance / Бага зэргийн үл нийцэл'],
  ['major', 'Major Non-Conformance / Ноцтой үл нийцэл'],
  ['na', 'N/A / Хамааралгүй'],
]);
const F = (name, alias, type = 'esriFieldTypeString', dom = null) => ({ name, alias, type, dom });

const fields = [
  F('objectid', 'ObjectID', 'esriFieldTypeOID'),
  F('site', 'Төслийн талбайн нэр', 'esriFieldTypeString', new Map([['b32', 'Багц 3.2']])),
  F('company', 'Гүйцэтгэгч компани', 'esriFieldTypeString', new Map([['msk', '"Морин сувд" ХХК'], ['other', 'Бусад']])),
  F('company_other', 'Бусад компани'),
  F('insp_datetime', 'Үзлэг шалгалт хийсэн огноо', 'esriFieldTypeDate'),
  F('out_01', 'Бэлдэцийн талбайн эмх цэгц?', 'esriFieldTypeString', ANS),
  F('out_02', 'Цахилгааны утсыг хамгаалсан уу?', 'esriFieldTypeString', ANS),
  F('out_02_note', 'Тайлбар'),
  F('in_01', 'Тагтны хаалт хамгаалсан эсэх?', 'esriFieldTypeString', ANS),
  F('in_01_blk', 'Блок'),
  F('in_01_note', 'Тайлбар'),
  F('in_02', 'Гэрэлтүүлэг хангалттай юу?', 'esriFieldTypeString', ANS),
  F('sc_out_earned', 'Гадаа талбайн авсан оноо', 'esriFieldTypeDouble'),
  F('sc_out_appl', 'Гадаа талбайн боломжит оноо', 'esriFieldTypeDouble'),
  F('sc_in_earned', 'Барилгын доторх авсан оноо', 'esriFieldTypeDouble'),
  F('sc_in_appl', 'Барилгын доторх боломжит оноо', 'esriFieldTypeDouble'),
  F('sc_all_earned', 'Нийт авсан оноо', 'esriFieldTypeDouble'),
  F('sc_all_appl', 'Нийт боломжит оноо', 'esriFieldTypeDouble'),
  F('cnt_minor', 'Бага', 'esriFieldTypeInteger'),
  F('sig_client_name', 'Захиалагчийн үзлэг хийсэн ажилтан'),
];
const row = {
  objectid: 7, site: 'b32', company: 'msk', insp_datetime: Date.UTC(2026, 8, 29, 0, 50),
  out_01: 'conf', out_02: 'obs', out_02_note: 'Утсыг өлгөх',
  in_01: 'minor', in_01_blk: '5/5', in_01_note: 'Блокны өрлөгийг хийсний дараа хаалт хийх',
  in_02: 'na',
  sc_out_earned: 2, sc_out_appl: 2, sc_in_earned: 1, sc_in_appl: 2, sc_all_earned: 3, sc_all_appl: 4,
  cnt_minor: 1, sig_client_name: 'Ч.Алтаннавч',
};
const atts = [
  { id: 1, keywords: 'out_01_img', contentType: 'image/jpeg' },
  { id: 2, keywords: 'in_01_img', contentType: 'image/jpeg' },
  { id: 3, keywords: 'sig_client', contentType: 'image/png' },
  { id: 4, keywords: 'misc', contentType: 'image/jpeg' },
];

/* ── Ангилал — «Minor Non-Conformance» нийцсэн БИШ ── */
assert.equal(ansCls('minor', ANS.get('minor')), 'minor');
assert.equal(ansCls('obs', ANS.get('obs')), 'obs');
assert.equal(ansCls('na', ANS.get('na')), 'na');
assert.equal(ansCls('conf', ANS.get('conf')), 'conf');
assert.equal(ansCls('major', ANS.get('major')), 'major');
console.log('✅ хариултын ангилал');

const rep = buildUzReport('Захиалагчийн үзлэг', fields, row, 7, atts, (id) => `u/${id}`, {
  pkg: 'Багц 3.2', company: '"Морин сувд" ХХК', date: row.insp_datetime,
});
assert.equal(rep.sections.length, 2, 'хоёр хэсэг (out · in)');
assert.deepEqual(rep.sections.map((x) => x.score), [{ e: 2, a: 2 }, { e: 1, a: 2 }]);
assert.match(rep.sections[0].title, /^1\. Гадаа талбайн/);
assert.deepEqual(rep.score, { e: 3, a: 4 });
const in01 = rep.sections[1].items[0];
assert.equal(in01.cls, 'minor');
assert.equal(in01.block, '5/5');
assert.deepEqual(in01.notes, ['Блокны өрлөгийг хийсний дараа хаалт хийх']);
assert.deepEqual(in01.photos.map((p) => p.url), ['u/2']);
assert.deepEqual(rep.sections[0].items[0].photos.map((p) => p.url), ['u/1']);
assert.deepEqual(rep.extraPhotos.map((p) => p.url), ['u/4'], 'танигдаагүй зураг «Бусад»-д');
assert.equal(rep.counts.minor, 1, 'cnt_ талбараас');
assert.equal(rep.counts.conf, 1, 'cnt_conf байхгүй бол асуултаас тоолно');
assert.equal(rep.counts.na, 1);
const head = new Map(rep.header);
assert.equal(head.get('Төслийн талбайн нэр'), 'Багц 3.2', 'домэйн нэрээр');
assert.equal(head.get('Гүйцэтгэгч компани'), '"Морин сувд" ХХК');
assert.ok(!head.has('ObjectID'), 'системийн талбар толгойд орохгүй');
assert.ok(![...head.keys()].some((k) => /оноо|Бага$/.test(k)), 'оноо/тоолуур толгойд орохгүй');
assert.equal(rep.signatures.length, 2, 'нэрийн мөр + гарын үсгийн зураг');
assert.equal(rep.signatures[0].value, 'Ч.Алтаннавч');
assert.deepEqual(rep.signatures[1].photos.map((p) => p.url), ['u/3'], 'гарын үсгийн зураг нэрийн мөрийн ДАРАА');
assert.equal(rep.sections[1].items[0].code, 'in_01');
assert.deepEqual(rep.summary.map((x) => x.label).slice(0, 2), ['Гадаа талбайн авсан оноо', 'Гадаа талбайн боломжит оноо'], 'дүн — дарааллаараа');
console.log('✅ тайлангийн загвар — хэсэг, оноо, блок, тэмдэглэл, зураг, гарын үсэг');

/* «Бусад» компани → `company_other` */
const r2 = buildUzReport('X', fields, { ...row, company: 'other', company_other: 'Шинэ ХХК' }, 8, [], (id) => `u/${id}`, { pkg: '', company: '', date: 0 });
assert.equal(new Map(r2.header).get('Гүйцэтгэгч компани'), 'Шинэ ХХК');
/* Бөглөөгүй асуулт — гарахгүй, хэсэг хоосон бол хасагдана */
const r3 = buildUzReport('X', fields, { ...row, in_01: null, in_02: '' }, 9, [], (id) => `u/${id}`, { pkg: '', company: '', date: 0 });
assert.equal(r3.sections.length, 1);
console.log('✅ «Бусад» утга · бөглөөгүй асуулт');

/* ── xlsx — ZIP толгой, хоёр хуудас ── */
const x = buildUzXlsx([rep, rep]);
assert.equal(x[0], 0x50); assert.equal(x[1], 0x4b);
const txt = new TextDecoder().decode(x);
assert.ok(txt.includes('xl/worksheets/sheet3.xml'), 'Хүснэгт + 2 үзлэгийн хуудас');
assert.ok(txt.includes('ObjectID 7 (2)'), 'давхардсан хуудасны нэр');
assert.ok(txt.includes('in_01 блок'), 'Хүснэгт: асуулт бүр 4 багана');
assert.ok(txt.includes('Тагтны хаалт хамгаалсан эсэх?'));
assert.ok(txt.includes('&quot;Морин сувд&quot; ХХК'), 'XML escape');
console.log('✅ xlsx — zip, 2 хуудас, escape');

assert.equal(companyShort('"Морин сувд" ХХК'), 'Морин сувд');
console.log('✅ uzlegReport — бүх шалгалт давлаа');
