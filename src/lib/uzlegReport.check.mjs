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

const {
  buildUzReport, buildUzXlsx, buildUzPdf, ansCls, companyShort, attUrl, reportTitle, fmtDateTime, countReportImages,
  cleanLabel, rasterTypeOf, sniffRasterType, rasterTypeOfBlob, attachmentFileName,
} = await import('@/lib/uzlegReport.ts');

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

/* ── 2026-10-09 аудит ── */
/* #9: асуулт танигдаагүй + cnt_ талбаргүй → «мэдэгдэхгүй» (null), 0 биш */
const bare = buildUzReport('X', fields.filter((f) => !f.dom || f.name === 'site' || f.name === 'company').map((f) => (f.name === 'cnt_minor' ? { ...f, name: 'zz' } : f)),
  { ...row, cnt_minor: undefined }, 10, [], (id) => `u/${id}`, { pkg: '', company: '', date: 0 });
assert.equal(bare.counts.major, null, 'асуултгүй, cnt_major-гүй — null');
assert.equal(bare.counts.minor, null);
/* #4: хавсралтын хаяг ТОКЕНГҮЙ (токен татах агшинд POST биеэр) */
assert.equal(attUrl('https://x/FeatureServer/0', 5, 7), 'https://x/FeatureServer/0/5/attachments/7');
/* #3: татагдаагүй зураг Excel-ийн тоонд ил — «0 (1 татагдсангүй)» */
{
  const xf = new TextDecoder().decode(buildUzXlsx([rep], new Map(), new Set(['u/2'])));
  assert.ok(xf.includes('0 (1 татагдсангүй)'), 'татагдаагүй тоо бичигдэнэ');
}
console.log('✅ мэдэгдэхгүй тоо null · токенгүй хавсралтын хаяг · татагдаагүй зургийн тоо');

/* ── 2026-10-09 (2-р ээлж) ── */
/* Огноо Улаанбаатарын цагаар — хөтчийн бүсээс үл хамаарна */
assert.equal(fmtDateTime(Date.parse('2026-09-28T23:30:00Z')), '2026-09-29 07:30', 'UTC 23:30 = UB дараагийн өдөр 07:30');
/* «—» (хоосон утгын орлуулга) → '' — файлын нэрийн нөөц ажиллана */
assert.equal(companyShort('—'), '');
assert.equal(reportTitle({ ...rep, company: '—', pkg: 'Багц 3.2' }).startsWith('Багц 3.2 - '), true, 'компанигүй → багц');
assert.equal(reportTitle({ ...rep, company: '—', pkg: '—' }).startsWith('Үзлэг - '), true, 'компани/багцгүй → «Үзлэг»');
/* Огноогүй тайлан — PDF гарчиг/хөлд «—» (1970-01-01 биш) */
{
  const pdf = buildUzPdf([{ ...rep, date: 0 }], new Map(), null);
  assert.ok(pdf.info.title.endsWith('— —'), 'гарчиг «—»');
  assert.ok(!JSON.stringify(pdf.footer(1)).includes('1970'), 'хөл 1970 биш');
}
/* Зургийн тоо (давхардалгүй) — «Зураггүй»/анхааруулгын суурь */
assert.equal(countReportImages([rep, rep]), 4, 'ижил тайлангийн зураг давхар тоологдохгүй');
/* Excel — байтгүй (PDF хэлбэрийн) зураг шигтгэгдэхгүй, унахгүй */
{
  const pdfOnly = new Map([['u/1', { data: 'data:image/jpeg;base64,AA==', bytes: null, w: 10, h: 10, png: false }]]);
  const xb = new TextDecoder().decode(buildUzXlsx([rep], pdfOnly));
  assert.ok(!xb.includes('xl/media/'), 'байтгүй зураг Excel-д орохгүй');
}
/* HEIC хавсралт — лавлагаанд тэмдэглэгдэнэ */
{
  const rh = buildUzReport('X', fields, row, 7, [{ id: 9, keywords: 'out_01_img', contentType: 'image/heic' }], (id) => `u/${id}`, { pkg: '', company: '', date: 0 });
  assert.equal(rh.sections[0].items[0].photos[0].heic, true);
}
console.log('✅ UB огноо · файлын нэрийн нөөц · огноогүй PDF · зургийн тоо · байтгүй зураг · HEIC');

/* ══════════ fetchAttachment — текст хавсралт ≠ ArcGIS алдаа (2026-10-09) ══════════ */
/* ⚠️ Урьд нь json/text/html БҮХ 200 хариуг алдаа гэж үзэж `.txt/.json/.html` хавсралт (Чанар)
   хэзээ ч нээгддэггүй байв. Алдаа = ЗӨВХӨН `{ error }` түлхүүртэй JSON. */
{
  const { fetchAttachment } = await import('@/lib/uzlegReport.ts');
  const realF = globalThis.fetch;
  let reply = { ct: 'text/plain', body: 'hello' };
  globalThis.fetch = async () => new Response(reply.body, { status: 200, headers: { 'content-type': reply.ct } });
  try {
    const url = 'https://example.invalid/x/FeatureServer/0/1/attachments/2';
    const t = await fetchAttachment(url);
    assert.ok(t, 'text/plain хавсралт → Blob');
    assert.equal(await t.text(), 'hello');
    reply = { ct: 'application/json', body: '{"a":1}' };
    assert.equal(await (await fetchAttachment(url)).text(), '{"a":1}', 'error-гүй JSON хавсралт → Blob');
    reply = { ct: 'text/html', body: '<p>x</p>' };
    assert.ok(await fetchAttachment(url), 'HTML хавсралт → Blob');
    reply = { ct: 'application/json', body: '{"error":{"code":400,"message":"bad"}}' };
    assert.equal(await fetchAttachment(url), null, 'ArcGIS алдаа (200 + {error}) → null');
    reply = { ct: 'image/png', body: 'PNG' };
    assert.ok(await fetchAttachment(url), 'зураг → Blob');
  } finally {
    globalThis.fetch = realF;
  }
}
console.log('✅ fetchAttachment: текст/JSON/HTML хавсралт нээгдэнэ, зөвхөн {error} JSON алдаа');
/* ⚠️ 2026-10-09 (аудит): шошгын цэвэрлэгээ — таг + HTML entity */
{
  assert.equal(cleanLabel('<b>9.</b>&nbsp;Хашаа &amp; хамгаалалт'), '9. Хашаа & хамгаалалт');
  assert.equal(cleanLabel('a &lt;b&gt; &quot;c&quot; &#39;d&#39; &#x27;e&#x27; &apos;f&apos;'), `a <b> "c" 'd' 'e' 'f'`, 'задласан &lt;b&gt; таг гэж хасагдахгүй');
  assert.equal(cleanLabel('&unknown; &#0;'), '&unknown; &#0;', 'танихгүй entity хэвээр');
}
/* ⚠️ 2026-10-09 (аудит): зөвхөн растерыг inline — svg/html татагдана */
{
  assert.equal(rasterTypeOf('image/PNG; charset=binary'), 'image/png');
  assert.equal(rasterTypeOf('image/jpg'), 'image/jpeg');
  for (const t of ['image/svg+xml', 'text/html', 'image/heic', '', null, undefined]) assert.equal(rasterTypeOf(t), null, String(t));
}
/* ⚠️ 2026-10-09 (аудит №2): төрөлгүй (octet-stream / хоосон) хариуны растерыг байтаар таних; svg/html ХЭЗЭЭ Ч растер биш */
{
  const enc = (t) => [...new TextEncoder().encode(t)];
  const bytes = (a) => new Uint8Array(a);
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
  const GIF = enc('GIF89a');
  const WEBP = [...enc('RIFF'), 0x24, 0, 0, 0, ...enc('WEBPVP8 ')];
  const BMP = [0x42, 0x4d, 0x36, 0, 0, 0];
  assert.equal(sniffRasterType(JPEG), 'image/jpeg');
  assert.equal(sniffRasterType(bytes(PNG)), 'image/png');
  assert.equal(sniffRasterType(GIF), 'image/gif');
  assert.equal(sniffRasterType(WEBP), 'image/webp');
  assert.equal(sniffRasterType(BMP), 'image/bmp');
  assert.equal(sniffRasterType([...enc('RIFF'), 0, 0, 0, 0, ...enc('WAVE')]), null, 'RIFF боловч WEBP биш (WAV)');
  for (const t of ['<svg xmlns="http://www.w3.org/2000/svg">', '<?xml version="1.0"?><svg>', '﻿<html>', '<!DOCTYPE html>', '{"error":{}}', '']) {
    assert.equal(sniffRasterType(enc(t)), null, `svg/html/json растер БИШ: ${t}`);
  }
  assert.equal(sniffRasterType([0xff, 0xd8]), null, 'богино толгой');

  /* Blob: зарласан растер → тэр; төрөлгүй → байтаар; svg/html гэж зарласан бол байтыг ҮЗЭХГҮЙ */
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(PNG)], { type: 'image/png' })), 'image/png');
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(JPEG)], { type: 'application/octet-stream' })), 'image/jpeg', 'octet-stream → байтаар');
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(PNG)])), 'image/png', 'хоосон төрөл → байтаар');
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(JPEG)], { type: 'image/svg+xml' })), null, 'svg гэж зарласан бол JPEG байттай ч БИШ');
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(PNG)], { type: 'text/html' })), null, 'html гэж зарласан бол БИШ');
  assert.equal(await rasterTypeOfBlob(new Blob([bytes(enc('<svg onload=alert(1)>'))], { type: 'application/octet-stream' })), null, 'octet-stream SVG');
  assert.equal(await rasterTypeOfBlob(new Blob([])), null, 'хоосон Blob');

  /* Татах файлын нэр — урьд нь үргэлж `attachment-<id>` (өргөтгөлгүй) */
  assert.equal(attachmentFileName(7, 'IMG_01.JPG', 'application/octet-stream'), 'IMG_01.JPG');
  assert.equal(attachmentFileName(7, 'photo', 'image/jpeg'), 'photo.jpg', 'өргөтгөлгүй нэр → төрлөөс');
  assert.equal(attachmentFileName(7, '../a/b:c?.png', ''), '_a_b_c_.png', 'зам/хориотой тэмдэгт');
  assert.equal(attachmentFileName('7', '', 'image/heic'), 'attachment-7.heic');
  assert.equal(attachmentFileName(7, null, 'application/octet-stream'), 'attachment-7.bin', 'үл мэдэгдэх → .bin');
  assert.equal(attachmentFileName(7, undefined, 'image/svg+xml'), 'attachment-7.bin', 'svg-д .svg автоматаар нэмэхгүй');
  assert.equal(attachmentFileName(7, 'x', 'text/html; charset=utf-8'), 'x', 'html-д өргөтгөл нэмэхгүй');
}
console.log('✅ cleanLabel (entity) · rasterTypeOf (svg/html inline БИШ) · sniffRasterType · attachmentFileName');
/* ── 2026-10-21 аудит: «Илгээсэн» — `inspector` домэйны НЭРЭЭР (код биш), Creator зөвхөн үзлэгчгүй мөрд ── */
{
  const fi = [...fields, F('inspector', 'Үзлэг хийсэн ажилтан', 'esriFieldTypeString', new Map([['dagiiranz', 'Б.Дагийранз ХАБЭА-н инженер']]))];
  const M = { pkg: '', company: '', date: 0 };
  const old = buildUzReport('X', fi, { ...row, inspector: 'dagiiranz', Creator: 'tumenjargal_selbe', CreationDate: Date.UTC(2026, 9, 19) }, 11, [], (id) => `u/${id}`, M);
  assert.equal(old.submitter, 'Б.Дагийранз ХАБЭА-н инженер', 'шилжүүлсэн мөр: домэйны нэр, код биш');
  assert.equal(old.submitted, row.insp_datetime, 'шилжүүлсэн мөр: үзлэгийн огноо');
  const fresh = buildUzReport('X', fi, { ...row, inspector: 'dagiiranz', Creator: 'dagiiranz_selbe', CreationDate: Date.UTC(2026, 9, 22) }, 12, [], (id) => `u/${id}`, M);
  assert.equal(fresh.submitter, 'Б.Дагийранз ХАБЭА-н инженер', 'шинэ мөр: ижил нэрлэлт');
  assert.equal(fresh.submitted, Date.UTC(2026, 9, 22), 'шинэ мөр: илгээсэн огноо Creator-ынх');
  const noInsp = buildUzReport('X', fi, { ...row, inspector: null, Creator: 'guest_user', CreationDate: Date.UTC(2026, 9, 22) }, 13, [], (id) => `u/${id}`, M);
  assert.equal(noInsp.submitter, 'guest_user', 'үзлэгчгүй мөр: Creator');
  const unknownCode = buildUzReport('X', fi, { ...row, inspector: 'newbie', CreationDate: Date.UTC(2026, 9, 22) }, 14, [], (id) => `u/${id}`, M);
  assert.equal(unknownCode.submitter, 'newbie', 'домэйнд байхгүй код хэвээр');
  console.log('✅ Илгээсэн — inspector домэйны нэрээр (2026-10-21)');
}
/* ── ⚠️ 2026-10-22 аудит: «Аюулыг илрүүлэх үзлэг» — илрүүлэлт эцгийн `uniquerowid || globalid`-д, зураг нь хүснэгтийн хавсралтаас ──
   Амьд өгөгдөл: 61/61 эцгийн `uniquerowid` NULL, 345/345 илрүүлэлтийн `parentrowid` = эцгийн `globalid` — урьд 0 илрүүлэлт. */
{
  const { groupFindings, parentKeys, guidKey } = await import('@/lib/uzlegReport.ts');
  const G1 = '2D70DC7C-7BEC-4FD6-BFD3-1BF1B1135C85';
  const G2 = 'B6D1148A-89F7-4806-B29A-02260A336CF9';
  const U3 = 'AAAA0000-1111-2222-3333-444455556666';
  assert.equal(guidKey(`{${G1.toLowerCase()}} `), G1, 'хаалт/жижиг үсэг/зай үл хамаарна');
  assert.deepEqual(parentKeys({ uniquerowid: null, globalid: `{${G1}}` }), [G1], 'uniquerowid NULL → globalid');
  assert.deepEqual(parentKeys({ uniquerowid: U3, globalid: `{${G2}}` }), [U3, G2], 'хоёулаа — uniquerowid үндсэн');
  assert.deepEqual(parentKeys({}), []);
  const parents = [
    { objectid: 1, uniquerowid: null, globalid: `{${G1}}` },
    { objectid: 2, uniquerowid: U3.toLowerCase(), globalid: `{${G2}}` },
  ];
  const rows = [
    { objectid: 10, parentrowid: `{${G1}}`, f_level: 'high', f_desc: 'Хашаагүй нүх', f_blk: '5', f_action: 'Хаасан' },
    { objectid: 11, parentrowid: `{${G1}}`, f_level: 'fixed', f_desc: 'Кабель', f_blk: 'other', f_blk_other: 'Гадна' },
    { objectid: 12, parentrowid: `{${U3}}`, f_level: 'low', f_desc: 'Тэмдэг' },
    { objectid: 13, parentrowid: `{${G2}}`, f_level: 'medium', f_desc: 'Шат' },
    { objectid: 14, parentrowid: '{FFFFFFFF-0000-0000-0000-000000000000}', f_level: 'high', f_desc: 'Өөр үзлэг' },
  ];
  const atts = new Map([
    [10, [{ id: 1, keywords: 'f_img', contentType: 'image/jpeg' }, { id: 2, keywords: 'f_img', contentType: 'image/png' }]],
    [13, [{ id: 5, keywords: 'f_img', contentType: 'image/heic' }, { id: 6, keywords: '', contentType: 'application/pdf' }]],
  ]);
  const dom = new Map([['high', 'Өндөр'], ['fixed', 'Зассан']]);
  const g = groupFindings(parents, rows, { title: 'Илрүүлсэн аюул', dom, atts, photoUrl: (oid, id) => `L/${oid}/attachments/${id}` });
  assert.deepEqual([...g.keys()].sort(), [G1, U3].sort(), 'түлхүүр = эцгийн ҮНДСЭН түлхүүр');
  const s1 = g.get(G1);
  assert.equal(s1.items.length, 2, 'globalid-ээр холбогдсон 2 илрүүлэлт (урьд 0)');
  assert.deepEqual(s1.items.map((x) => [x.code, x.ans, x.cls, x.block]), [['F1', 'Өндөр', 'major', '5'], ['F2', 'Зассан', 'conf', 'Гадна']]);
  assert.deepEqual(s1.items[0].photos, [{ url: 'L/10/attachments/1', png: false }, { url: 'L/10/attachments/2', png: true }], 'илрүүлэлтийн зураг');
  assert.deepEqual(s1.items[0].notes, ['Хаасан']);
  assert.equal(g.get(U3).items.length, 2, 'uniquerowid ба globalid хоёулаа нэг эцэгт');
  assert.deepEqual(g.get(U3).items.find((x) => x.q === 'Шат').photos, [{ url: 'L/13/attachments/5', png: false, heic: true }], 'HEIC тэмдэг; PDF хавсралт зураг биш');
  assert.ok(![...g.values()].some((s) => s.items.some((x) => x.q === 'Өөр үзлэг')), 'бусад эцгийн илрүүлэлт орохгүй');
  const bare = groupFindings(parents, rows, { title: 'T' });
  assert.deepEqual(bare.get(G1).items[0].photos, [], 'хавсралтгүй дуудлага — хоосон зураг');
  console.log('✅ аюулыг илрүүлэх үзлэг — uniquerowid || globalid · илрүүлэлтийн зураг (2026-10-22)');
}
console.log('✅ uzlegReport — бүх шалгалт давлаа');
