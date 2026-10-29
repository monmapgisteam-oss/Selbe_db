/**
 * ТАЙЛАН ФАЙЛЫН ШАЛГУУР — блокийн задлалт, ```report, PDF/Word/Excel/CSV бүтээгч.
 *
 * Ажиллуулах: node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/agent/report.check.mjs
 */

import { strict as assert } from 'node:assert';
import { parseBlocks, headingOf } from '@/lib/agent/blocks';
import { parseReport, reportTables, slug } from '@/lib/agent/report';
import { buildChatPdf } from '@/lib/agent/reportPdf';
import { buildChatDocx, DOCX_MIME } from '@/lib/agent/reportDocx';
import { buildChatXlsx } from '@/lib/agent/reportXlsx';
import { colHeader, csvTable, typeTable } from '@/lib/agent/reportCells';
import { planSteps } from '@/lib/agent/plan';

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, `✗ ${name}`);
  console.log('  ✓', name);
  pass++;
};

const ANSWER = [
  'Багц 1-ийн гүйцэтгэл **19.7%** байна.',
  '',
  '**Гүйцэтгэлийн байдал**',
  '',
  '| Багц | Гүйцэтгэл | Өртөг |',
  '|---|---|---|',
  '| Багц 1 | 19.7% | 1,788 |',
  '| Багц 2 | 24.8% | 2,100 |',
  '',
  '- Эхний мөр',
  '- Хоёр дахь мөр',
  '',
  '```chart',
  '{"type":"bar","title":"Багцын гүйцэтгэл","unit":"%","note":"Багц 2 тэргүүлж байна.","data":[{"label":"Багц 1","value":19.7},{"label":"Багц 2","value":24.8}]}',
  '```',
  '',
  '```report',
  '{"title":"Багц 1 — тойм","formats":["pdf","docx","xlsx","csv"]}',
  '```',
  '',
  'Эх сурвалж: `et:24` / `GUITS_HV`',
].join('\n');

const BLOCKS = parseBlocks(ANSWER);
const DOC = {
  title: 'Багц 1 — тойм',
  date: '2026-10-15',
  blocks: BLOCKS.filter((b) => b.kind !== 'report'),
};

console.log('\n1. Блокийн задлалт');
{
  const kinds = BLOCKS.map((b) => b.kind).join(',');
  ok('дараалал зөв', kinds === 'para,para,table,list,chart,report');
  const t = BLOCKS.find((b) => b.kind === 'table');
  ok('хүснэгтийн толгой ба мөрүүд', t.head.length === 3 && t.rows.length === 2 && t.rows[1][0] === 'Багц 2');
  ok('тусгаарлагч мөр хаягдав', !t.rows.some((r) => r[0].includes('---')));
  ok('жагсаалт 2 зүйлтэй', BLOCKS.find((b) => b.kind === 'list').items.length === 2);
  ok('график задарсан', BLOCKS.find((b) => b.kind === 'chart').spec.data.length === 2);
  ok('«Эх сурвалж» мөр хаягдав', !BLOCKS.some((b) => b.kind === 'para' && b.text.includes('Эх сурвалж')));
  ok('бүтэн тод мөр = гарчиг', headingOf(BLOCKS[1]) === 'Гүйцэтгэлийн байдал');
  ok('энгийн догол мөр гарчиг БИШ', headingOf(BLOCKS[0]) === null);
}

console.log('\n2. Хазгай оролт — чат унахгүй');
{
  const b = parseBlocks(['Эхлэл.', '```report', '{"title":"Т"'].join('\n'));
  ok('хаалтгүй блок залгигдав', b.length === 2 && b[1].kind === 'report');
  ok('дан хашлага гацаахгүй', parseBlocks(['```', 'Текст'].join('\n')).length === 1);
  ok('хоосон оролт', parseBlocks('').length === 0);
  ok('эвдэрсэн JSON-той график spec null', parseBlocks('```chart\n{буруу\n```').find((x) => x.kind === 'chart').spec === null);
}

console.log('\n3. ```report задлалт');
{
  const r = parseReport('{"title":"Багц 1 — тойм","formats":["pdf","csv"]}');
  ok('гарчиг, форматууд', r.title === 'Багц 1 — тойм' && r.formats.join(',') === 'pdf,csv');
  ok('эвдэрсэн JSON → null', parseReport('{буруу') === null);
  ok('массив → null', parseReport('[1,2]') === null);
  ok('формат байхгүй бол дөрвүүлээ', parseReport('{"title":"a"}').formats.length === 4);
  ok('үл мэдэгдэх формат шүүгдэв', parseReport('{"formats":["pdf","json"]}').formats.join(',') === 'pdf');
  ok('«word»/«excel» нэрийг таньна', parseReport('{"formats":["word","excel"]}').formats.join(',') === 'docx,xlsx');
  ok('давхардал арилав', parseReport('{"formats":["pdf","pdf","doc"]}').formats.join(',') === 'pdf,docx');
  ok('гарчиггүй бол хоосон мөр (UI орлуулна)', parseReport('{"formats":["pdf"]}').title === '');
  ok('урт гарчиг богиноссон', parseReport(`{"title":"${'а'.repeat(120)}"}`).title.length === 60);
}

console.log('\n4. Хүснэгтүүд — Excel/CSV-ийн эх');
{
  const t = reportTables(DOC);
  ok('хүснэгт ба графикийн өгөгдөл хоёулаа', t.length === 2);
  ok('хүснэгтийн нэр өмнөх гарчгаас', t[0].name === 'Гүйцэтгэлийн байдал');
  ok('графикийн нэр гарчгаасаа', t[1].name === 'Багцын гүйцэтгэл');
  ok('графикийн утга мөр болов', t[1].rows[0][1] === '19.7');
  ok('хүснэгтгүй хариултад хоосон', reportTables({ title: 'a', date: 'b', blocks: parseBlocks('Зөвхөн текст.') }).length === 0);
}

console.log('\n5. PDF — баримтын тодорхойлолт');
{
  const d = buildChatPdf(DOC);
  const json = JSON.stringify(d);
  ok('A4 ба Roboto', d.pageSize === 'A4' && d.defaultStyle.font === 'Roboto');
  ok('гарчиг ба огноо толгойд', json.includes('Багц 1 — тойм') && json.includes('2026-10-15'));
  ok('хүснэгтийн мөр орсон', json.includes('Багц 2') && json.includes('24.8%'));
  ok('график canvas-аар зурагдав', json.includes('"canvas"') && json.includes('rect'));
  const money = buildChatPdf({ ...DOC, title: 'Нийт 1,000 ₮', blocks: parseBlocks('Дүн **2,660 ₮** байна.\n\n| Багц | Дүн |\n|---|---|\n| А | 5 ₮ |') });
  ok('₮ тэмдэг орлуулагдав', !JSON.stringify(money).includes('₮'));
}

console.log('\n6. Word (.docx) — OOXML');
{
  const bytes = buildChatDocx(DOC);
  const txt = Buffer.from(bytes).toString('utf8');
  ok('ZIP гарын үсэг', bytes[0] === 0x50 && bytes[1] === 0x4b);
  ok('шаардлагатай хэсгүүд', ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']
    .every((n) => txt.includes(n)));
  ok('гарчиг ба хүснэгт', txt.includes('Багц 1 — тойм') && txt.includes('<w:tbl>'));
  ok('MIME зөв', DOCX_MIME.endsWith('wordprocessingml.document'));
  const amp = Buffer.from(buildChatDocx({ ...DOC, title: 'А & Б <тест>', blocks: parseBlocks('Утга: a < b & c') })).toString('utf8');
  ok('& ба < зайлуулагдав', amp.includes('&amp;') && amp.includes('&lt;') && !amp.includes('a < b'));
}

console.log('\n7. Excel (.xlsx) — ЭХНИЙ хуудас нь ХҮСНЭГТ');
{
  const bytes = buildChatXlsx(DOC);
  const txt = Buffer.from(bytes).toString('utf8');
  const names = [...txt.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  ok('ZIP гарын үсэг', bytes[0] === 0x50 && bytes[1] === 0x4b);
  ok('гурван хуудас (2 хүснэгт + тайлбар)', (txt.match(/xl\/worksheets\/sheet\d+\.xml/g) ?? []).length >= 3);
  ok('эхний хуудас = хүснэгт', names[0] === 'Гүйцэтгэлийн байдал');
  ok('«Тайлбар» ХАМГИЙН СҮҮЛД', names[names.length - 1] === 'Тайлбар');
  ok('хувь 0–1 утгаар', txt.includes('<v>0.197</v>'));
  ok('хувийн формат', txt.includes('formatCode="0.0%"'));
  ok('тооны формат', txt.includes('formatCode="#,##0"'));
  ok('толгой хөлдүү (гарчиг+толгой)', txt.includes('ySplit="2"'));
  ok('хүснэгтгүй хариултад ч үүснэ', buildChatXlsx({ title: 'a', date: 'b', blocks: parseBlocks('Зөвхөн текст.') }).length > 0);
}

console.log('\n7a. Нүдний төрөл — текст биш ТОО');
{
  const t = typeTable(reportTables(DOC)[0]);
  ok('баганын төрөл: текст · хувь · тоо', t.cols.map((c) => c.kind).join(',') === 'text,pct,num');
  ok('«19.7%» → 0.197', t.rows[0][1] === 0.197);
  ok('«1,788» → 1788', t.rows[0][2] === 1788);
  ok('хувийн формат 0.0%', t.cols[1].numFmt === '0.0%');

  const money = typeTable({ name: 'a', head: ['Багц', 'Дүн'], rows: [['Багц 1', '2,660,000,000 ₮'], ['Багц 2', '5,000 ₮']] });
  ok('мөнгө → тоо', money.rows[0][1] === 2660000000 && money.cols[1].kind === 'money');
  ok('мөнгөний формат ба толгой', money.cols[1].numFmt === '#,##0' && colHeader(money.cols[1], true) === 'Дүн (₮)');

  const qty = typeTable({ name: 'a', head: ['Багц', 'Талбай'], rows: [['a', '1,788 м²'], ['b', '900 м²']] });
  ok('хэмжээ → тоо + нэгж формат дотор', qty.rows[0][1] === 1788 && qty.cols[1].numFmt === '#,##0 "м²"');
  ok('нэгж толгойд давхардахгүй', colHeader(qty.cols[1], true) === 'Талбай');

  const hdr = typeTable({ name: 'a', head: ['Багц', 'Гүйцэтгэл (%)'], rows: [['a', '19.7'], ['b', '24.8']] });
  ok('толгойн нэгжээр хувь болов', hdr.cols[1].kind === 'pct' && hdr.rows[0][1] === 0.197);

  const mixed = typeTable({ name: 'a', head: ['Багц', 'Утга'], rows: [['a', '19.7%'], ['b', 'мэдээлэлгүй']] });
  ok('холимог багана ТЕКСТ хэвээр', mixed.cols[1].kind === 'text' && mixed.rows[0][1] === '19.7%');

  const gap = typeTable({ name: 'a', head: ['Багц', 'Утга'], rows: [['a', ''], ['b', '5'], ['c', '7']] });
  ok('хоосон нүд null (0 БИШ)', gap.rows[0][1] === null);

  const date = typeTable({ name: 'a', head: ['Багц', 'Огноо'], rows: [['a', '2026-10-09'], ['b', '2026-09-01']] });
  ok('огноо ТЕКСТ хэвээр', date.cols[1].kind === 'text');
}

console.log('\n7b. CSV — нэгж толгойд, хувь 0–100');
{
  const c = csvTable(typeTable(reportTables(DOC)[0]));
  ok('толгойд «(%)»', c.head[1] === 'Гүйцэтгэл (%)');
  ok('хувь буцаад 19.7', c.rows[0][1] === 19.7);
  ok('тоо бүлэглэлгүй', c.rows[0][2] === 1788);
}

console.log('\n7c. Төлөвлөгөөний блок');
{
  const b = parseBlocks(['```plan', '1. Барилгыг тоолох', '2. Багцаар задлах', '```', 'Үр дүн.'].join('\n'));
  ok('```plan блок таних', b[0].kind === 'plan' && b[1].kind === 'para');
  ok('алхмууд задарсан', planSteps(b[0].raw).join('|') === 'Барилгыг тоолох|Багцаар задлах');
  ok('хашилтгүй текст ч алхам болно', planSteps('Эхлээд шалгана\nДараа нь тоолно').length === 2);
  ok('6-аас олон алхам тайрагдав', planSteps('1\n2\n3\n4\n5\n6\n7\n8').length === 6);
  ok('хоосон бол алхамгүй', planSteps('   ').length === 0);
  const doc = { title: 'a', date: 'b', blocks: parseBlocks('```plan\n1. Алхам\n```\n\n| А | Б |\n|---|---|\n| 1 | 2 |') };
  ok('тайлангийн хүснэгтэд нөлөөлөхгүй', reportTables(doc).length === 1);
}

console.log('\n8. Файлын нэрийн слаг');
{
  ok('кирилл галиглагдав', slug('Багц 1 — тойм') === 'bagts-1-toim');
  ok('хоосон бол tailan', slug('—') === 'tailan');
  ok('урт нэр таслагдав', slug('а'.repeat(100)).length <= 40);
}

console.log(`\n✅ Тайлан файл — ${pass} шалгуур давлаа\n`);
