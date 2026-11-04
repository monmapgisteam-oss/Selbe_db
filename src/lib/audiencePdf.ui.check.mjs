/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — PDF баримтын БҮТЦИЙН шалгуур (сүлжээгүй, pdfmake-гүй — `huvaariPdf.check.mjs`-ийн загвар).
 * `.ui.check` нэртэй — `execReport.ts`-ийн импорт `@arcgis/core`-ийн зохиомол модуль шаарддаг (`execReport.ui.check.mjs`-тэй ижил).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/audiencePdf.ui.check.mjs
 *
 * Хамгаалж буй зүйл (2026-11-05, PDF цорын ганц гарц):
 *   1. Хэсэг бүр = `svg` зангилаа (`chartSvg`, 515pt; урт багана `splitSpec`-ээр хэд хэд) + өгүүлбэрүүд; `₮` → «төг».
 *   2. Ямар ч график хуудасны агуулгын өндрөөс (746pt) халихгүй; график + өгүүлбэр `unbreakable`.
 *   3. Нүүр: хүлээн авагч · гарчиг · хугацаа · үүсгэсэн огноо · хэрэглэгч · гол тоо; гараар бөглөх зүйл, гарын үсэг алга.
 *   4. Хавсралт хүснэгт (бүтэн дүн) зөвхөн Хотын дарга ба Төлөөлөн удирдах зөвлөлд; бүлэг солигдоход шинэ хуудас.
 */
import assert from 'node:assert/strict';
import { installDom, inputsFixture } from './audienceReport.fixture.mjs';

installDom();
const { buildReport } = await import('./audienceReport.ts');
const { buildAudienceDoc, PDF_CONTENT_W, PDF_CONTENT_H } = await import('./audiencePdf.ts');
const { chartSvg, splitSpec, svgHeight } = await import('./audienceChart.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const walk = (node, fn) => {
  if (Array.isArray(node)) { node.forEach((x) => walk(x, fn)); return; }
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const k of ['stack', 'columns', 'content']) if (node[k]) walk(node[k], fn);
  if (node.table) walk(node.table.body, fn);
};
const collect = (doc, pred) => { const out = []; walk(doc.content, (x) => { if (pred(x)) out.push(x); }); return out; };

const i = inputsFixture();
const DATE = '2026-11-05 10:15';
const docs = Object.fromEntries(['mayor', 'council', 'board'].map((a) => [a, buildAudienceDoc(buildReport(a, i), DATE)]));

ok('хэсэг бүр svg (515pt) — chartSvg/splitSpec-тэй ижил, ₮ → төг, өгүүлбэр бүр орсон', () => {
  for (const a of ['mayor', 'council', 'board']) {
    const rep = buildReport(a, i);
    const svgs = collect(docs[a], (x) => typeof x.svg === 'string');
    const want = rep.sections.flatMap((s) => splitSpec(s.chart).map((sp) => chartSvg(sp, PDF_CONTENT_W).replace(/₮/g, 'төг')));
    assert.deepEqual(svgs.map((s) => s.svg), want, `${a}: svg`);
    assert.ok(svgs.every((s) => s.width === PDF_CONTENT_W));
    const js = JSON.stringify(docs[a].content);
    assert.ok(!js.includes('₮'), `${a}: ₮ үлдэв`);
    for (const s of rep.sections) {
      assert.ok(js.includes(`${s.no}. ${s.title}`.replace(/₮/g, 'төг')), `${a}: гарчиг ${s.no} алга`);
      for (const t of s.text) assert.ok(js.includes(JSON.stringify(t.replace(/₮/g, 'төг')).slice(1, -1)), `${a}: өгүүлбэр алга — ${t}`);
    }
  }
});
ok('график хуудаснаас халихгүй (≤ 746pt); график + өгүүлбэр нэг хуудсанд; 40 багцтай урт график хуваагдана', () => {
  for (const a of ['mayor', 'council', 'board']) {
    for (const s of collect(docs[a], (x) => typeof x.svg === 'string')) assert.ok(svgHeight(s.svg) + 60 < PDF_CONTENT_H, `${a}: график өндөр ${svgHeight(s.svg)}`);
    const stacks = collect(docs[a], (x) => Array.isArray(x.stack) && x.stack.some((y) => typeof y?.svg === 'string'));
    assert.ok(stacks.every((st) => st.unbreakable === (st.stack[0].text.includes('жагсаалт') || /Анхаарах|анхаарах/.test(st.stack[0].text) ? st.unbreakable : true)));
  }
  const many = inputsFixture({ x: { ...i.x, prog: { ...i.x.prog, packs: Array.from({ length: 40 }, (_, k) => ({ key: `P${k}`, name: `Багц ${k + 1}`, kind: 'infra', blocks: 0, households: 0, householdsMissing: 0, progress: k })) } } });
  const doc = buildAudienceDoc(buildReport('mayor', many), DATE);
  const cont = collect(doc, (x) => typeof x.text === 'string' && x.text.includes('(үргэлжлэл)'));
  assert.ok(cont.length >= 1, 'үргэлжлэлийн гарчиг');
  for (const s of collect(doc, (x) => typeof x.svg === 'string')) assert.ok(svgHeight(s.svg) + 60 < PDF_CONTENT_H);
});
ok('нүүр — хүлээн авагч, гарчиг, дэд гарчиг, огноо, гол тоо; гарын үсэг алга', () => {
  const c = docs.mayor.content;
  assert.equal(c[0].text, 'ХОТЫН ДАРГА');
  assert.equal(c[1].text, 'Сэлбэ ухаалаг хотын төслийн тайлан — Хотын даргад');
  assert.equal(c[2].columns[0].text, 'Хугацаа 2026-10-01 → 2026-10-31 · Үүсгэсэн 2026-11-05 · Тэст Хэрэглэгч');
  const js = JSON.stringify(c);
  assert.ok(js.includes('Автоматаар үүссэн — гараар оруулсан мэдээлэлгүй'));
  assert.ok(js.includes('"text":"31.7%","fontSize":18') && js.includes('ТӨСЛИЙН НИЙТ ЯВЦ'), 'нүүрний гол тоо');
  assert.ok(!/гарын үсэг|__________|signature/i.test(js.replace(/гарын үсэг зурсан/gi, '')), 'гараар бөглөх зүйл гарав');
  assert.equal(docs.council.content[0].text, 'ИРГЭДИЙН ТӨЛӨӨЛӨГЧДИЙН ХУРАЛ');
  assert.equal(docs.board.content[0].text, 'ТӨЛӨӨЛӨН УДИРДАХ ЗӨВЛӨЛ');
  assert.equal(docs.mayor.header(1), '');
  assert.ok(JSON.stringify(docs.mayor.header(2)).includes('ХОТЫН ДАРГА'));
  assert.ok(JSON.stringify(docs.mayor.footer(3, 9)).includes('Хуудас 3 / 9'));
  assert.ok(JSON.stringify(docs.mayor.footer(3, 9)).includes('Тэст Хэрэглэгч') && JSON.stringify(docs.mayor.footer(3, 9)).includes(DATE));
});
ok('хавсралт — бүтэн дүн, Хотын дарга ба Төлөөлөн удирдах зөвлөлд; Иргэдийн Төлөөлөгчдийн Хуралд үгүй', () => {
  const tables = (a) => collect(docs[a], (x) => x.table && x.table.headerRows === 1);
  assert.equal(tables('mayor').length, 1);
  assert.equal(tables('board').length, 1);
  assert.equal(tables('council').length, 0);
  const t = tables('mayor')[0].table;
  assert.equal(t.body[0][0].text, 'Багц');
  assert.equal(t.body[0][1].text, 'Гэрээлсэн (төг)');
  assert.equal(t.body[1][1].text, '400,000,000,000', 'хавсралтад бүтэн дүн');
  assert.equal(t.body.at(-1)[0].text, 'Нийт');
  assert.equal(t.body.at(-1)[0].bold, true);
});
ok('бүлэг солигдоход шинэ хуудас; агуулга (TOC) бүх хэсэг ба хавсралт', () => {
  const rep = buildReport('mayor', i);
  const stacks = collect(docs.mayor, (x) => Array.isArray(x.stack) && x.stack.some((y) => typeof y?.svg === 'string'));
  const breaks = stacks.filter((s) => s.pageBreak === 'before').length;
  assert.equal(breaks, new Set(rep.sections.map((s) => s.group)).size - 1);
  assert.equal(docs.mayor.pageSize, 'A4');
  assert.equal(docs.mayor.defaultStyle.font, 'Roboto');
  const toc = collect(docs.board, (x) => x.style === 'tocItem').map((x) => x.text);
  const b = buildReport('board', i);
  assert.deepEqual(toc, [...b.sections.map((s) => s.title), b.appendix.title].map((t) => t.replace(/₮/g, 'төг')));
});

console.log(`\n✅ audiencePdf: ${n} шалгуур давлаа`);
