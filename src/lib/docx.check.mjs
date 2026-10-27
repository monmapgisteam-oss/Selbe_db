/**
 * .docx бичигч (`docx.ts`) — бүтцийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/docx.check.mjs
 *
 * Хамгаалж буй алдаа: Word нь XML-ийн ганц алдаатай (хаагаагүй таг, escape хийгээгүй `&`,
 * хориотой удирдлагын тэмдэгт, зурагны холбоосгүй `r:embed`) файлыг «эвдэрсэн» гэж нээдэггүй —
 * хөтөч дээр ямар ч алдаа гарахгүй тул зөвхөн хэрэглэгч файл нээхэд илэрнэ.
 */
import assert from 'node:assert/strict';
import { buildDocx } from './docx.ts';
import { crc32 } from './xlsx.ts';

/* STORE ZIP-ийг задлана (local header-ээр) */
function unzip(buf) {
  const out = new Map();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true);
    const name = new TextDecoder().decode(buf.subarray(p + 30, p + 30 + nlen));
    const data = buf.subarray(p + 30 + nlen, p + 30 + nlen + size);
    assert.equal(crc32(data), crc, `CRC ${name}`);
    out.set(name, data);
    p += 30 + nlen + size;
  }
  return out;
}

/* Таг тэнцвэр — нээсэн бүр хаагдсан, дараалал зөв */
function wellFormed(xml, name) {
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    const [, close, tag, self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), tag, `${name}: </${tag}> буруу байрлалд`);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], `${name}: хаагаагүй таг ${stack.join(',')}`);
  /* escape хийгээгүй `&` */
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(body), `${name}: escape хийгээгүй &`);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body), `${name}: удирдлагын тэмдэгт`);
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bytes = buildDocx([
  { kind: 'p', text: 'ТАЙЛАН & <тест>', bold: true, size: 30, center: true },
  { kind: 'h', level: 1, text: '1. Үндсэн үзүүлэлт' },
  { kind: 'p', text: 'мөр 1\nмөр 2\u0007' },
  { kind: 'table', head: [['Нэр', 'Утга', '']], rows: [['A & B', '1 234.5 км'], ['C', '26.3%', 'x']] },
  { kind: 'table', head: [], rows: [] },
  { kind: 'img', png, w: 800, h: 400, caption: 'График' },
  { kind: 'img', png, w: 4000, h: 300 },
]);

const files = unzip(bytes);
for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png', 'word/media/image2.png']) {
  assert.ok(files.has(n), `ZIP-д ${n} алга`);
}
const dec = (n) => new TextDecoder().decode(files.get(n));
for (const n of files.keys()) if (n.endsWith('.xml') || n.endsWith('.rels')) wellFormed(dec(n), n);

const doc = dec('word/document.xml');
const rels = dec('word/_rels/document.xml.rels');
/* `r:embed` бүр холбоостой */
for (const [, rid] of doc.matchAll(/r:embed="([^"]+)"/g)) assert.ok(rels.includes(`Id="${rid}"`), `холбоосгүй ${rid}`);
/* Хоосон хүснэгт гаргахгүй, хүснэгт 1 */
assert.equal([...doc.matchAll(/<w:tbl>/g)].length, 1);
/* Тоон нүд баруун тийш, текст нүд үгүй */
assert.ok(/<w:jc w:val="right"\/><\/w:pPr><w:r><w:rPr><w:sz w:val="18"\/><w:szCs w:val="18"\/><\/w:rPr><w:t xml:space="preserve">1 234.5 км/.test(doc));
assert.ok(doc.includes('A &amp; B'));
/* Мөр таслалт */
assert.ok(doc.includes('<w:br/><w:t xml:space="preserve">мөр 2</w:t>'));
/* Өргөн зураг хуудасны өргөнд багтана (9906 twip × 635 EMU) */
const cxs = [...doc.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => +m[1]);
assert.ok(cxs.every((cx) => cx <= 9906 * 635), `зураг хуудаснаас өргөн: ${cxs}`);
assert.ok(doc.includes('w:styleId') === false && dec('word/styles.xml').includes('w:styleId="Heading1"'));

/* ── Word-ийн жинхэнэ график (2026-10-19) — part · content type · холбоос · null цоорхой ── */
const withCharts = unzip(buildDocx([
  { kind: 'chart', spec: { type: 'doughnut', title: 'Чөлөөлсөн: 92%', cats: ['Чөлөөлсөн', 'Үлдсэн'], series: [{ name: 'A & B', values: [92, 8] }], pointColors: ['1B7F3B', 'E3E7EA'], pct: true, hideLabels: [1] } },
  { kind: 'chart', spec: { type: 'column', cats: ['1-р сар', '2-р сар', '3-р сар'], series: [{ name: 'ш', values: [3, null, 5] }] } },
  { kind: 'chart', spec: { type: 'line', cats: ['a', 'b'], series: [{ name: 'Монгол', values: [1, 2] }, { name: 'Гадаад', values: [null, 4] }] } },
  { kind: 'chart', spec: { type: 'bar', cats: ['x', 'y', 'z'], series: [{ name: '', values: [1, 2, 3] }], pointColors: ['FF0000', undefined, 'bad'] } },
  { kind: 'chart', spec: { type: 'column', cats: [], series: [] } },
]));
const cd = (n) => new TextDecoder().decode(withCharts.get(n));
for (const n of withCharts.keys()) if (n.endsWith('.xml') || n.endsWith('.rels')) wellFormed(cd(n), n);
assert.ok(withCharts.has('word/charts/chart4.xml') && !withCharts.has('word/charts/chart5.xml'), 'хоосон график алгасна');
const ct = cd('[Content_Types].xml');
const cRels = cd('word/_rels/document.xml.rels');
const cDoc = cd('word/document.xml');
for (let i = 1; i <= 4; i++) assert.ok(ct.includes(`/word/charts/chart${i}.xml`), `content type chart${i}`);
for (const [, rid] of cDoc.matchAll(/<c:chart [^>]*r:id="([^"]+)"/g)) assert.ok(cRels.includes(`Id="${rid}"`) && cRels.includes('relationships/chart'), `холбоосгүй ${rid}`);
const c1 = cd('word/charts/chart1.xml');
assert.ok(c1.includes('<c:doughnutChart>') && c1.includes('<c:showPercent val="1"/>') && c1.includes('<c:dLbl><c:idx val="1"/><c:delete val="1"/></c:dLbl>'));
assert.ok(c1.includes('A &amp; B') && c1.includes('1B7F3B'));
/* null ≠ 0 — 2-р цэг numCache-д бичигдэхгүй */
const c2 = cd('word/charts/chart2.xml');
assert.ok(c2.includes('<c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="2"><c:v>5</c:v></c:pt>'), 'null цэг цоорхой');
assert.ok(c2.includes('<c:barDir val="col"/>') && c2.includes('<c:valAx>'));
assert.ok(cd('word/charts/chart3.xml').includes('<c:legend>'), 'олон цуваанд тайлбар');
/* Буруу өнгө → палитр */
const c4 = cd('word/charts/chart4.xml');
assert.ok(c4.includes('<c:barDir val="bar"/>') && c4.includes('FF0000') && !c4.includes('val="bad"'));

console.log('docx.check: OK');
