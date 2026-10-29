/**
 * МИНИМАЛ XLSX БИЧИГЧИЙН ШАЛГУУР — цэвэр, сүлжээгүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/xlsx.check.mjs
 */
import assert from 'node:assert/strict';
import { buildXlsx, cellRef, colLetter, crc32, esc, sheetName, zipStore } from './xlsx.ts';

const dec = new TextDecoder();

/** STORE ZIP → { нэр → Uint8Array } (central directory-оор явж local header-ийн offset-ыг уншина) */
function unzipStore(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  /* EOCD — төгсгөлийн 22 байт (тайлбаргүй) */
  const eocd = buf.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'EOCD гарын үсэг алга');
  const n = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  assert.equal(cdOff + cdSize + 22, buf.length, 'central directory-ийн хэмжээ/offset файлын урттай таарахгүй');
  const out = new Map();
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, `central header #${i} гарын үсэг алга`);
    assert.equal(dv.getUint16(p + 10, true), 0, 'арга STORE биш');
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    /* local header */
    assert.equal(dv.getUint32(lho, true), 0x04034b50, `local header «${name}» гарын үсэг алга`);
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    assert.equal(dec.decode(buf.subarray(lho + 30, lho + 30 + lNameLen)), name, 'local/central нэр зөрөв');
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), crc, `CRC32 зөрөв: ${name}`);
    assert.equal(dv.getUint32(lho + 14, true), crc, `local CRC32 зөрөв: ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/* ── 1. Туслахууд ── */
assert.equal(colLetter(0), 'A');
assert.equal(colLetter(25), 'Z');
assert.equal(colLetter(26), 'AA');
assert.equal(colLetter(27 * 26 - 1), 'ZZ');
assert.equal(colLetter(702), 'AAA');
assert.equal(cellRef(3, 2), 'C4');
assert.equal(esc('a & b < c > "d"'), 'a &amp; b &lt; c &gt; &quot;d&quot;');
assert.equal(sheetName('Гүйцэтгэл: [Багц 1] / 9F?*'), 'Гүйцэтгэл Багц 1 9F');
assert.equal(sheetName('А'.repeat(40)).length, 31, '31 тэмдэгтээс хэтрэхгүй');
assert.equal(sheetName('  '), 'Sheet', 'хоосон нэр → Sheet');
/* CRC32 — мэдэгдэж буй утга («123456789» → CBF43926) */
assert.equal(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
console.log('✅ туслахууд — баганын үсэг · escape · хуудасны нэр · CRC32');

/* ── 2. ZIP STORE — кирилл нэр, CRC, offset ── */
{
  const z = zipStore([
    { name: 'a/б.txt', data: new TextEncoder().encode('сайн уу') },
    { name: 'x.txt', data: new Uint8Array(0) },
  ]);
  const m = unzipStore(z);
  assert.equal(m.size, 2);
  assert.equal(dec.decode(m.get('a/б.txt')), 'сайн уу', 'UTF-8 агуулга');
  assert.equal(m.get('x.txt').length, 0, 'хоосон файл');
  /* UTF-8 нэрийн туг */
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  assert.equal(dv.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 нэрийн туг (0x0800) алга');
}
console.log('✅ ZIP STORE — задарч уншигдана · CRC32 · UTF-8');

/* ── 3. Workbook — бүтэц ── */
const bytes = buildXlsx([
  {
    name: 'Гүйцэтгэл',
    rows: [
      [{ v: '№', s: { bold: true, border: true, fill: 'EEEEEE', align: 'center', valign: 'center', wrap: true } }, { v: 'Ажил & <нэр>', s: { bold: true } }, 'Хувь', 'Обьём'],
      ['1', { v: 'Б. Барилга угсралтын ажил', s: { bold: true, indent: 1 } }, { v: 0.263, s: { numFmt: '0.0%' } }, { v: 1300, s: { numFmt: '#,##0 "м³"' } }],
      ['1.1', { v: 'Бетон цутгах', s: { indent: 2 } }, null, { v: 12.5, s: { numFmt: '#,##0.00' } }],
      ['1.2', 'Хоосон', undefined, { v: null, s: { fill: 'FDE2E1' } }],
      ['1.3', 'NaN', NaN, { v: 0, s: { numFmt: '#,##0' } }],
    ],
    merges: [{ r1: 0, c1: 2, r2: 0, c2: 3 }],
    cols: [6, 40, undefined, 12],
    frozen: { rows: 1, cols: 2 },
  },
  { name: 'Гүйцэтгэл', rows: [['Мэдээлэл']] },
  { name: 'A/B:C', rows: [] },
]);
const files = unzipStore(bytes);
for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
  assert.ok(files.has(f), `${f} алга`);
}
const ct = dec.decode(files.get('[Content_Types].xml'));
assert.ok(ct.includes('/xl/worksheets/sheet3.xml'), 'Content_Types-д 3-р хуудас алга');
assert.ok(ct.includes('/xl/styles.xml'), 'Content_Types-д styles алга');
const wb = dec.decode(files.get('xl/workbook.xml'));
assert.ok(wb.includes('<sheet name="Гүйцэтгэл" sheetId="1" r:id="rId1"/>'), 'хуудасны нэр (кирилл) workbook-д алга');
assert.ok(wb.includes('name="Гүйцэтгэл (2)"'), 'давхардсан нэр дугаарлагдахгүй байна');
assert.ok(wb.includes('name="A B C"'), 'хориотой тэмдэгт цэвэрлэгдэхгүй');
const wbRels = dec.decode(files.get('xl/_rels/workbook.xml.rels'));
assert.equal((wbRels.match(/worksheets\/sheet\d\.xml/g) ?? []).length, 3);
assert.ok(wbRels.includes('Target="styles.xml"'));
console.log('✅ workbook — хэсгүүд · хуудасны нэр · давхардал');

/* ── 4. Хуудас 1 — нүд · merge · frozen · загвар ── */
const s1 = dec.decode(files.get('xl/worksheets/sheet1.xml'));
/* Элементийн дараалал (спецээр хатуу) */
const order = ['<dimension', '<sheetViews>', '<sheetFormatPr', '<cols>', '<sheetData>', '<mergeCells'];
let last = -1;
for (const tag of order) {
  const i = s1.indexOf(tag);
  assert.ok(i > last, `элементийн дараалал буруу: ${tag}`);
  last = i;
}
assert.ok(s1.includes('<dimension ref="A1:D5"/>'), `dimension буруу`);
/* Хөлдөөлт */
assert.ok(s1.includes('<pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/>'), 'хөлдөөсөн мөр/багана алга');
/* Баганын өргөн — undefined алгасна */
assert.ok(s1.includes('<col min="1" max="1" width="6" customWidth="1"/>'));
assert.ok(s1.includes('<col min="2" max="2" width="40" customWidth="1"/>'));
assert.ok(!s1.includes('min="3"'), 'undefined өргөнтэй багана бичигдэв');
assert.ok(s1.includes('<col min="4" max="4" width="12" customWidth="1"/>'));
/* Merge */
assert.ok(s1.includes('<mergeCells count="1"><mergeCell ref="C1:D1"/></mergeCells>'), 'нэгдсэн нүд буруу');
/* Мөр — inlineStr, кирилл, escape */
assert.ok(s1.includes('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">№</t></is></c>'), '№ нүд (загвартай мөр) буруу');
assert.ok(s1.includes('<t xml:space="preserve">Ажил &amp; &lt;нэр&gt;</t>'), 'XML escape алга');
assert.ok(s1.includes('<t xml:space="preserve">Б. Барилга угсралтын ажил</t>'), 'кирилл мөр');
/* Тоо */
assert.ok(/<c r="C2" s="\d+"><v>0.263<\/v><\/c>/.test(s1), 'хувийн тоо буруу');
assert.ok(/<c r="D2" s="\d+"><v>1300<\/v><\/c>/.test(s1), 'обьёмын тоо буруу');
assert.ok(/<c r="D5" s="\d+"><v>0<\/v><\/c>/.test(s1), '0 нь бичигдэх ёстой (null ≠ 0)');
/* Хоосон: null/undefined загваргүй → нүд ОГТ бичигдэхгүй; загвартай null → хоосон нүд */
assert.ok(!s1.includes('r="C3"'), 'null нүд загваргүй бол бичигдэх ёсгүй');
assert.ok(!s1.includes('r="C4"'), 'undefined нүд загваргүй бол бичигдэх ёсгүй');
assert.ok(/<c r="D4" s="\d+"\/>/.test(s1), 'загвартай хоосон нүд (fill) бичигдэх ёстой');
assert.ok(!s1.includes('r="C5"'), 'NaN нүд бичигдэх ёсгүй');
assert.ok(!/<v>NaN<\/v>/.test(s1), 'NaN утга XML-д орж болохгүй');
console.log('✅ хуудас — нүд · merge · frozen · өргөн · хоосон/NaN');

/* ── 5. styles.xml — тод · fill · хүрээ · формат · догол · зэрэгцүүлэлт ── */
const st = dec.decode(files.get('xl/styles.xml'));
assert.ok(st.includes('<numFmt numFmtId="164" formatCode="0.0%"/>'), 'хувийн формат алга');
assert.ok(st.includes('formatCode="#,##0 &quot;м³&quot;"'), 'нэгжтэй формат escape-тэй байх ёстой');
assert.ok(st.includes('formatCode="#,##0.00"'));
assert.ok(st.includes('formatCode="#,##0"/>'), '#,##0 формат алга');
assert.ok(st.includes('<font><b/><sz val="10"/><name val="Arial"/></font>'), 'тод фонт алга');
assert.ok(st.includes('<fgColor rgb="FFEEEEEE"/>'), 'fill өнгө алга');
assert.ok(st.includes('<fgColor rgb="FFFDE2E1"/>'), 'улаан fill алга');
assert.ok(st.includes('<fill><patternFill patternType="gray125"/></fill>'), 'fills[1]=gray125 (спец) алга');
assert.ok(st.includes('<border><left style="thin">'), 'нимгэн хүрээ алга');
assert.ok(st.includes('<alignment horizontal="center" vertical="center" wrapText="1"/>'), 'зэрэгцүүлэлт/нугалалт алга');
assert.ok(st.includes('indent="2"'), 'догол алга');
/* Ижил загвар нэг л удаа — толгойн 2 тод нүд ≠ 2 xf гэж бүртгэгдэхгүй; `s="1"` нь толгойн загвар */
const xfCount = Number(/<cellXfs count="(\d+)">/.exec(st)[1]);
assert.ok(xfCount >= 8 && xfCount <= 12, `cellXfs тоо гэнэтийн: ${xfCount}`);
/* Загварын индекс хуудсанд байгаа нь styles-д бий */
for (const m of s1.matchAll(/ s="(\d+)"/g)) assert.ok(Number(m[1]) < xfCount, `s=${m[1]} бүртгэлгүй`);
/* Хувь ба тоон форматын xf нь applyNumberFormat-тай */
assert.ok(/<xf numFmtId="164" [^>]*applyNumberFormat="1"/.test(st), 'applyNumberFormat алга');
console.log('✅ styles — тод · fill · хүрээ · формат · догол · зэрэгцүүлэлт');

/* ── 6. Хоосон хуудас ч хүчинтэй · хуудасгүй бол алдаа ── */
const s3 = dec.decode(files.get('xl/worksheets/sheet3.xml'));
assert.ok(s3.includes('<dimension ref="A1:A1"/>') && s3.includes('<sheetData></sheetData>'), 'хоосон хуудас');
assert.throws(() => buildXlsx([]), /хуудас алга/);
/* Загваргүй хуудас → styles.xml-д numFmts байхгүй, cellXfs=1 */
const plain = unzipStore(buildXlsx([{ name: 'P', rows: [['a', 1]] }]));
const pst = dec.decode(plain.get('xl/styles.xml'));
assert.ok(!pst.includes('<numFmts') && pst.includes('<cellXfs count="1">'), 'загваргүй хуудас илүү xf үүсгэж байна');
assert.ok(dec.decode(plain.get('xl/worksheets/sheet1.xml')).includes('<c r="B1"><v>1</v></c>'), 'загваргүй тоо s attr-гүй байх ёстой');
console.log('✅ хоосон хуудас · хуудасгүй алдаа · загваргүй гаралт');

assert.equal(esc('a\u0000b\u0008c\u000Bd\u000Ce\u001Ff￾'), 'abcdef', 'хориотой тэмдэгт хасагдана');
assert.equal(esc('t\tn\nr\r'), 't\tn\nr\r', 'таб · мөр таслал хэвээр');
const ctl = unzipStore(buildXlsx([{ name: 'C', rows: [['x\u0001y']] }]));
assert.ok(dec.decode(ctl.get('xl/worksheets/sheet1.xml')).includes('>xy</t>'), 'нүдний текстэд удирдлагын тэмдэгт үлдсэн');
console.log('✅ XML-д хориотой тэмдэгт хасагдав');
