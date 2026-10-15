/**
 * «НЭГТГЭЛ ГҮЙЦЭТГЭЛ» ХҮСНЭГТ — Excel «Төсөл төлөвлөгөө биелэлт»-ийн харагдацын гэрээ (2026-10-14).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/TusulNegtgel.ui.check.mjs
 *
 * Хамгаалж буй зүйл (хэрэглэгч: «нэгтгэл гүйцэтгэл дээр харагдацыг Excel шиг болго — толгой хэсэг merge-тэй»;
 * «түвшний задаргаа Excel дээр 6, манай систем дээр 5»):
 *   1. ТОЛГОЙ 3 мөр — «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» гарчиг (бүх баганаар), бүлгийн нэгтгэсэн нүд (H4:I4 · J4:K4 · L4:M4,
 *      colspan=2), бусад багана 4–5-р мөрийг босоогоор (rowspan=2), 5-р мөрөнд 6 дэд толгой.
 *   2. Багана B…W — 22, Excel-ийн дарааллаар.
 *   3. Outline товч 6 (Excel-ийн 6 түвшин).
 *   4. «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөр царцсан (`totalRow`) ба Σ G × утга-аар бодогдсон.
 *   5. Excel-ийн томьёонд ороогүй мөрийн тайлбар (`outside`).
 */
import assert from 'node:assert/strict';

const React = (await import('react')).default;
const { createElement: h } = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { LocaleProvider } = await import('@/lib/i18n');
const { ThemeProvider } = await import('@/lib/theme');
const { Tree } = await import('./TusulNegtgel.tsx');

/* ── Жижиг мод: 2 үе шат, нэг нь 6 түвшин хүртэл ── */
const rows = [
  { oid: 1, code: '1', name: 'ТЭЗҮ', depth: 1 },
  { oid: 2, code: '1.1', name: 'ТЭЗҮ ажил', depth: 2, bagts: 'БАГЦ 1-6' },
  { oid: 3, code: '5', name: 'Барилга угсралт', depth: 1 },
  { oid: 4, code: '5.2', name: 'Барилга угсралт ажил', depth: 2 },
  { oid: 5, code: '5.2.1', name: 'Орон сууцны хороолол барилга угсралт', depth: 3 },
  { oid: 6, code: '5.2.1.1', name: 'Орон сууцны хороолол барилга угсралт', depth: 4, bagts: 'Багц-1' },
  { oid: 7, code: '5.2.1.1.1', name: '9 давхар 71 айл', depth: 5, bagts: '5/1' },
  { oid: 8, code: '5.2.1.1.1.1', name: 'Бетон цутгалт', depth: 6 },
  { oid: 9, code: '5.2.4', name: 'НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)', depth: 3 },
];
const c = (o) => ({ n: 1, inSection: null, inProject: null, planPct: null, actPct: null, share: null, perf: null, how: 'Нэгтгэл гүйцэтгэл (Excel)', ...o });
const calc = new Map([
  [1, c({ inProject: 5, planPct: 100, actPct: 100, perf: 100, planPrevWk: 100, perfWk: 100, ctStart: Date.parse('2024-04-08T00:00:00Z'), ctEnd: Date.parse('2024-09-20T00:00:00Z') })],
  [2, c({ inSection: 100, inProject: 5, actPct: 100 })],
  [3, c({ inProject: 95, planPct: 50, actPct: 20, perf: 40, planPrevWk: 40, perfWk: 50 })],
  /* ⚠️ огноо — НЭЭЛТТЭЙ үе шатанд (ТЭЗҮ анхдагчаар хураалттай, Excel-ийнх шиг) */
  [4, c({ inSection: 100, actPct: 20, exStart: '2025-08-16', actStart: '2025-09-26' })],
  [5, c({ inSection: 100, actPct: 20 })],
  [6, c({ inSection: 100, actPct: 20, auto: true, how: '01. Гүйцэтгэл — батлагдсан биет хувь (блокуудаар)' })],
  [7, c({ inSection: 100, actPct: 20 })],
  [8, c({ inSection: 100, actPct: 20 })],
  [9, c({ inSection: 7, actPct: 0, outside: true })],
]);

const html = renderToStaticMarkup(h(LocaleProvider, null, h(ThemeProvider, null, h(Tree, { rows, calc }))));

/* ── 1. Толгой ── */
const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
const trs = thead.split('<tr').slice(1);
assert.equal(trs.length, 3, 'толгой 3 мөр (гарчиг · бүлэг · дэд)');
assert.match(trs[0], /colSpan="22"[^>]*><span class="thTitleTxt">ТӨСЛИЙН ГҮЙЦЭТГЭЛ</, 'гарчиг бүх 22 баганаар, бичиг нь зүүн ирмэгтээ наалдана');
const grp = [...trs[1].matchAll(/<th[^>]*colSpan="2"[^>]*>([^<]+)</g)].map((m) => m[1]);
assert.deepEqual(grp, ['Гэрээ/Хавсралт 5', 'Гүйцэтгэгч', 'ОСНАУГ/Газар чөлөөлөлт/ хуулийн маргаан/Өндөржилт нөлөөлөл'], 'бүлгийн нэгтгэсэн 3 нүд');
const tall = [...trs[1].matchAll(/<th[^>]*rowSpan="2"/g)].length;
assert.equal(tall, 16, '22 − 6 дэд багана = 16 босоо нэгтгэсэн нүд');
const sub = [...trs[2].matchAll(/<th[^>]*>([^<]+)</g)].map((m) => m[1]);
assert.deepEqual(sub, ['Төлөвлөгөөт эхлэх', 'Төлөвлөгөөт дуусах', 'Төлөвлөгөөт эхлэх', 'Төлөвлөгөөт дуусах', 'Бодит Эхлэх', 'Бодит дуусах'], '5-р мөрийн 6 дэд толгой');
/* Excel-ийн B…W дараалал — 2-р мөрийн босоо нүд ба бүлгүүд */
const order = [...trs[1].matchAll(/<th[^>]*>([^<]+)</g)].map((m) => m[1]);
assert.deepEqual(order.slice(0, 7), ['Д/Д', 'Багцын дугаар', 'Ажлын нэр', 'Урьдчилсан төсөвт өртөг', 'Хэсэгт эзлэх', 'Төсөлд эзлэх хувь', 'Гэрээ/Хавсралт 5']);
assert.equal(order.at(-1), 'Төлөвлөгөө биелэлт Weekly', 'сүүлийн багана W');
console.log('✅ толгой: гарчиг · 3 нэгтгэсэн бүлэг · 16 босоо · 6 дэд · B…W дараалал');

/* ── 3. Outline 6 товч ── */
const lv = html.slice(html.indexOf('class="levels"'), html.indexOf('</span>', html.indexOf('class="levels"')));
assert.equal([...lv.matchAll(/<button/g)].length, 6, 'Excel-ийн 6 түвшин');
console.log('✅ outline: 6 товч');

/* ── 4. Нийт мөр ── */
const body = html.slice(html.indexOf('<tbody'));
const total = body.slice(0, body.indexOf('</tr>'));
assert.match(total, /class="stage totalRow"/, 'нийт мөр царцсан');
assert.match(total, /ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ/);
assert.match(total, />100\.0%</, 'Σ төсөлд эзлэх = 100.0 (1 орон — аудит №7)');
/* Гүйцэтгэл = 0.05 × 100 + 0.95 × 20 = 24 · төлөвлөгөө = 0.05 × 100 + 0.95 × 50 = 52.5 · биелэлт = 24 ÷ 52.5 */
assert.match(total, /24\.00%/, 'нийт гүйцэтгэл = Σ G × S');
assert.match(total, /52\.50%/, 'нийт төлөвлөгөө = Σ G × N');
assert.match(total, /45\.71%/, 'нийт биелэлт = S ÷ N');
/* Өмнөх долоо хоног = 0.05 × 100 + 0.95 × 40 = 43 · Weekly = 24 ÷ 43 */
assert.match(total, /43\.00%/, 'нийт өмнөх долоо хоногийн төлөвлөгөө = Σ G × R');
assert.match(total, /55\.81%/, 'Weekly = S ÷ R');
console.log('✅ нийт мөр: царцсан · Σ G × утга');

/* ── 5. outside тайлбар · огноо ── */
assert.match(html, /title="[^"]*Excel-ийн томьёонд эцгийнхээ нийлбэрт ороогүй мөр/, 'outside мөрийн тайлбар');
assert.match(html, />2024-04-08</, 'Гэрээ эхлэх — UTC өдөр');
assert.match(html, />2025-08-16</, 'Гүйцэтгэгч эхлэх — бичвэр');
assert.match(html, />2025-09-26</, 'Бодит эхлэх — бичвэр');
/* ТЭЗҮ анхдагчаар хураалттай — хүүхэд нь харагдахгүй (Excel-ийн хадгалсан outline); бусад нь 6-р түвшин хүртэл нээлттэй */
assert.ok(!html.includes('ТЭЗҮ ажил'), 'ТЭЗҮ хураалттай');
assert.ok(html.includes('Бетон цутгалт'), '6-р түвшний мөр харагдана');
console.log('✅ outside тайлбар · огноо');

/* ── 6. ЗАСАХ ГОРИМ (2026-10-15) — оролт нүд input, зассан нүд НОГООН, томьёот өөрчлөлт ЦЭНХЭР; товч мөрөнд ── */
{
  const edit = {
    can: (oid, k) => oid === 7 && k === 'act',
    value: () => 0.5,
    set: () => {},
    edited: (oid, k) => oid === 7 && k === 'act',
    derived: (oid, k) => oid === 6 && k === 'act',
  };
  const eh = renderToStaticMarkup(h(LocaleProvider, null, h(ThemeProvider, null,
    h(Tree, { rows, calc, edit, toolbar: h('button', { id: 'pub' }, 'Нийтлэх (1)') }))));
  const inputs = eh.match(/<input[^>]*class="edIn"[^>]*>/g) ?? [];
  assert.equal(inputs.length, 1, 'зөвхөн засагдах нүд input');
  assert.match(inputs[0], /value="50"/, 'хувь 0–100-гаар');
  assert.match(eh, /class="[^"]*edCell cellDirty"/, 'зассан нүд — НОГООН');
  assert.match(eh, /class="[^"]*num cellCalc"/, 'томьёогоор өөрчлөгдсөн — ЦЭНХЭР');
  assert.ok(eh.indexOf('id="pub"') > eh.indexOf('class="levels"') && eh.indexOf('id="pub"') < eh.indexOf('<table'), 'товч хэрэгслийн мөрөнд');
  assert.ok(!html.includes('class="edIn"'), 'засах горимгүй үед input байхгүй');
  console.log('✅ засах горим: input · ногоон · цэнхэр · товч');
}

console.log('TusulNegtgel.ui: ok');
