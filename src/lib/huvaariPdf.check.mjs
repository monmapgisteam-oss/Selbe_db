/**
 * ХУВААРИЙН PDF — баримтын бүтцийн шалгуур (сүлжээгүй, pdfmake-гүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariPdf.check.mjs
 *
 * Хамгаалж буй зүйл (2026-09-30):
 *   1. Хэвлэсэн огноо (footer) ОРОН НУТГИЙН өдөр — УБ-д 00:00–07:59-д «өчигдөр» биш.
 *   2. Тэнхлэгийн өдрийн дугаарууд бие биен дээгүүр бичигдэхгүй — A4 «Ирэх 3 сар»
 *      нь 7 хоногоор, A3 «Ирэх 3 сар» нь хоногоор хэвээр.
 *   3. Хуучин фонтын Є/Ї → Ө/Ү зөвхөн тэр 4 тэмдэгтэд; бусад бичвэр хөндөгдөхгүй.
 *   4. Хоосон өгөгдөл унахгүй.
 */
/* ⚠️ Цагийн бүсийг Date ашиглахаас ӨМНӨ — Node нь `TZ`-г ажиллах явцад дахин уншдаг */
process.env.TZ = 'Asia/Ulaanbaatar';
import assert from 'node:assert/strict';
const g = globalThis;
g.window = g;
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;

const { buildHuvaariDoc } = await import('./huvaariPdf.ts');

const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const task = (i, s, e, extra = {}) => ({
  des: i, no: `1.${i}`, work: `Ажил ${i}`, depth: 1, group: false, aStart: null, aEnd: null,
  bar: { start: D(s), end: D(e) }, st: 'todo', viol: false, ref: null, act: null, ...extra,
});
const grp = (s, e) => ({
  des: 100, no: '1', work: 'Бүлэг', depth: 0, group: true, aStart: null, aEnd: null,
  bar: { start: D(s), end: D(e) }, st: 'todo', viol: false, ref: null, act: null,
});
const input = (rows, now, opts) => ({
  pkg: 'Багц 1', kindLabel: 'Төлөвлөгөө', refLabel: null, block: '', from: now, to: now, now, rows, hasActual: false, opts,
});
const tables = (doc) => doc.content.filter((c) => c.table);
const titles = (doc) => doc.content.filter((c) => c.columns).map((c) => c.columns[1].text);

/* ── 1. Хэвлэсэн огноо — орон нутгийн өдөр ── */
{
  assert.equal(new Date(Date.parse('2026-10-01T23:30:00Z')).getDate(), 2, 'TZ тавигдсангүй (Asia/Ulaanbaatar)');
  const real = Date.now;
  Date.now = () => Date.parse('2026-10-01T23:30:00Z'); // УБ 2026-10-02 07:30
  try {
    const doc = buildHuvaariDoc(input([], D('2026-10-02')));
    assert.equal(doc.footer(1, 1).columns[0].text, '2026-10-02', 'хэвлэсэн өдөр UTC-ээр «өчигдөр» болов');
  } finally { Date.now = real; }
}

/* ── 2. Өдрийн дугаар давхцахгүй ── */
{
  const now = D('2026-10-01');
  const rows = [grp('2026-10-01', '2026-12-31'), task(1, '2026-10-01', '2026-10-20'), task(2, '2026-11-15', '2026-12-31')];
  /** Толгойн тоон шошгууд [x, x + өргөн] — дараагийнхтайгаа давхцах уу (цифр ~3.5pt) */
  const overlaps = (doc) => {
    let bad = 0;
    for (const t of tables(doc)) {
      const labs = t.table.body[0].at(-1).stack.slice(1)
        .filter((x) => /^\d+$/.test(x.text) && x.fontSize < 8)
        .map((x) => ({ a: x.relativePosition.x, b: x.relativePosition.x + x.text.length * 3.5 }))
        .sort((p, q) => p.a - q.a);
      for (let i = 1; i < labs.length; i++) if (labs[i].a < labs[i - 1].b) bad += 1;
    }
    return bad;
  };
  const a4 = buildHuvaariDoc(input(rows, now, { months: 3, active: false, paper: 'A4' }));
  assert.equal(overlaps(a4), 0, 'A4: өдрийн дугаарууд давхцаж байна');
  assert.ok(titles(a4).every((t) => !t.includes('хоногоор') || t.includes('7 хоногоор')), `A4 3 сар хоногоор зурагдав: ${titles(a4)}`);
  const a3 = buildHuvaariDoc(input(rows, now, { months: 3, active: false, paper: 'A3' }));
  assert.equal(overlaps(a3), 0, 'A3: өдрийн дугаарууд давхцаж байна');
  assert.ok(titles(a3).some((t) => / · хоногоор$/.test(t)), `A3 3 сар хоногоор хэвээр байх ёстой: ${titles(a3)}`);
  /* A4 богино муж (1 сар) — хоногоор хэвээр, давхцалгүй */
  const a4m1 = buildHuvaariDoc(input(rows, now, { months: 1, active: false, paper: 'A4' }));
  assert.ok(titles(a4m1).some((t) => / · хоногоор$/.test(t)), `A4 1 сар хоногоор байх ёстой: ${titles(a4m1)}`);
  assert.equal(overlaps(a4m1), 0, 'A4 1 сар: давхцал');
}

/* ── 3. Є/Ї → Ө/Ү зөвхөн тэр 4 тэмдэгт ── */
{
  const now = D('2026-10-01');
  const rows = [
    grp('2026-10-01', '2026-10-30'),
    task(1, '2026-10-01', '2026-10-10', { work: 'Хєрс ЇЕ Єндєр ї' }),
    task(2, '2026-10-05', '2026-10-12', { work: 'Бетон E-Е ё ÿ' }),
  ];
  const doc = buildHuvaariDoc(input(rows, now));
  const txt = JSON.stringify(doc.content);
  assert.ok(txt.includes('Хөрс ҮЕ Өндөр ү'), 'Є/Ї хөрвөсөнгүй');
  assert.ok(!/[єЄїЇ]/.test(txt), 'Є/Ї үлдэв');
  assert.ok(txt.includes('Бетон E-Е ё ÿ'), 'бусад тэмдэгт өөрчлөгдөв');
}

/* ── 4. Хоосон өгөгдөл ── */
{
  const doc = buildHuvaariDoc(input([], D('2026-10-01'), { months: 1, active: true, paper: 'A4' }));
  assert.ok(JSON.stringify(doc.content).includes('Хуваарьтай мөр алга.'), 'хоосон PDF-д мэдэгдэл алга');
}

console.log('✓ huvaariPdf: хэвлэсэн өдөр (УБ) · өдрийн дугаар давхцахгүй (A3/A4) · Є/Ї · хоосон');

/* ── 5. (2026-10-01, хэрэглэгч: бүгдийг зас) САНАХ ОЙ — сүлжээ ХҮСНЭГТ БҮРД НЭГ УДАА ──
 * ⚠️ PERF NOTE: урьд нь хоног/7 хоногийн шугам МӨР БҮРД давтагддаг байв — A3 «Ирэх 3 сар»
 *    1,700 мөрт ~94 шугам × 1,700 ≈ 160 мянган вектор, хөтөч ~1 GB санах ой иддэг байв.
 *    Одоо шугам хүснэгт (хуудасны хэсэг) бүрд нэг удаа → вектор шугамын тоо мөрийн тооноос
 *    ҮЛ ХАМААРАХ (≈ хуудас × тэнхлэгийн шугам). Харагдах байдал ижил: шугам эхний мөрийн
 *    дээд захаас сүүлийн мөрийн доод зах хүртэл (сөрөг y, `relativePosition`). */
{
  const now = D('2026-10-01');
  const N = 1700;
  const rows = [grp('2026-10-01', '2026-12-31')];
  for (let i = 1; i < N; i++) {
    const s = new Date(D('2026-10-01') + (i % 80) * 86_400_000).toISOString().slice(0, 10);
    const e = new Date(D('2026-10-01') + ((i % 80) + 9) * 86_400_000).toISOString().slice(0, 10);
    rows.push(task(i, s, e));
  }
  const doc = buildHuvaariDoc(input(rows, now, { months: 3, active: false, paper: 'A3' }));
  /** Бүх `canvas` вектор шугамыг (body ба толгой) тоолно */
  let lines = 0; let bodyGrid = 0;
  const walk = (n, inBody) => {
    if (Array.isArray(n)) { n.forEach((x) => walk(x, inBody)); return; }
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.canvas)) for (const v of n.canvas) if (v.type === 'line') { lines += 1; if (inBody && v.y1 === 0 && v.y2 > 10) bodyGrid += 1; }
    for (const k of ['stack', 'columns', 'content']) if (n[k]) walk(n[k], inBody);
    if (n.table) { walk(n.table.body[0], false); walk(n.table.body.slice(1), true); }
  };
  walk(doc.content, false);
  const tbl = tables(doc);
  const bodyRows = tbl.reduce((a, t) => a + t.table.body.length - 1, 0);
  assert.ok(bodyRows >= N, `мөр алдагдав: ${bodyRows} < ${N}`);
  assert.equal(bodyGrid, 0, `мөр бүрд сүлжээ давтагдсаар байна (${bodyGrid})`);
  /* Хүснэгт бүрийн толгойд нэг сүлжээ: дээд хязгаар = хүснэгт × (тэнхлэгийн хоног + өнөөдөр) × 2 (толгойн тэмдэглэгээ + бие) */
  const maxPerTable = 2 * (95 + 1);
  assert.ok(lines <= tbl.length * maxPerTable, `вектор шугам хэт олон: ${lines} > ${tbl.length} × ${maxPerTable}`);
  assert.ok(lines < N * 10, `шугам мөрийн тоотой пропорциональ хэвээр: ${lines}`);
  console.log(`  perf: ${N} мөр · ${tbl.length} хүснэгт · ${lines} вектор шугам (урьд ≈ ${N} × 94)`);
  /* Сүлжээний урт = тэр хүснэгтийн мөрийн тоо (дутуу сүүлийн хуудас хальдаггүй) */
  const UNIT = 14.5 + 0.3;
  for (const t of tbl) {
    const n = t.table.body.length - 1;
    const g = t.table.body[0].at(-1).stack.find((x) => x.canvas && x.relativePosition);
    assert.ok(g, 'хүснэгтийн толгойд сүлжээ алга');
    const len = n * UNIT - 0.3;
    assert.ok(Math.abs(g.relativePosition.y - (0.7 + len)) < 1e-9, 'сүлжээний байрлал мөрийн тоотой таарахгүй');
    assert.ok(g.canvas.every((v) => Math.abs(v.y1 + len) < 1e-9 && v.y2 === 0), 'шугамын урт мөрийн тоотой таарахгүй');
  }
  /* Үргэлжлэлийн хүснэгт шинэ хуудаснаас; хуудас бүр хуудасны багтаамжаас хэтрэхгүй */
  assert.ok(tbl.slice(1).some((t) => t.pageBreak === 'before'), 'урт бүлэг гараар хуудаслагдаагүй');
}
console.log('✓ huvaariPdf: сүлжээ хүснэгт бүрд нэг удаа (санах ой)');
