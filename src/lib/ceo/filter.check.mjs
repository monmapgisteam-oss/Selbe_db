/**
 * БАГЦЫН ШҮҮЛТ — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/filter.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. БИЧИГЛЭЛИЙН ЗӨРҮҮ. «Багц 4-1» ба «Багц 4.1» нь НЭГ багц — түүхий
 *      текстээр жишвэл хүснэгт чимээгүй хоосорно (`bagtsKey`-ийн шалтгаан).
 *   2. БАГЦЫН БАГАНАГҮЙ хүснэгтийг хоослох. IoT/бүс/компанийн жагсаалт нь
 *      багцад хамаардаггүй — шүүлт тэднийг хаявал «мэдээлэл алга болов».
 *   3. НЭГТГЭСЭН хүснэгтийг мөрөөр шүүх. «Багцаар» хүснэгт нь ХАРЬЦУУЛАХ
 *      зорилготой; нэг мөр болтол шүүвэл утгаа алдана.
 *   4. Сонгогчийн жагсаалтад таслалтын мөр («… бас N мөр») орох.
 */
import assert from 'node:assert/strict';
import {
  ALL_PKG, filterResult, filterTable, isPkgSummary, issueNamesPkg, pkgColOf, pkgOptions, rowInPkg, samePkg,
} from './filter.ts';

const cell = (v) => ({ v });
const T = (title, cols, rows) => ({ title, cols, rows });

/* ── Туршилтын өгөгдөл ── */
const detail = T('Хэтэрсэн ажлууд', ['Багц', '№', 'Ажил'], [
  [cell('Багц 4-1'), cell('7'), cell('Бетон цутгалт')],
  [cell('Багц 4.1'), cell('8'), cell('Хана өрлөг')],   /* ЯГ ижил багц, өөр бичиглэл */
  [cell('Багц 2'), cell('1'), cell('Суурь')],
  [cell('… бас 40 мөр'), cell(''), cell('')],
]);
const summary = T('Багцаар', ['Багц', 'Ажил', 'Зөрүү ₮'], [
  [cell('Багц 4-1'), cell(2), cell(1000)],
  [cell('Багц 2'), cell(1), cell(500)],
]);
const noPkg = T('Мэдрэгчийн төлөв', ['Мэдрэгч', 'Төлөв'], [
  [cell('Хогийн сав'), cell('ажиллаж байна')],
]);

/* ── 1. Багана таних ── */
assert.equal(pkgColOf(detail), 0);
assert.equal(pkgColOf(noPkg), -1, 'багцгүй хүснэгтэд -1');

/* ── 2. Бичиглэлийн зөрүү — `bagtsKey` ── */
assert.ok(rowInPkg(detail.rows[0], 0, 'Багц 4.1'), '«Багц 4-1» ба «Багц 4.1» НЭГ багц');
assert.ok(rowInPkg(detail.rows[1], 0, 'БАГЦ-4-1'), 'том үсэг, зураас хамаарахгүй');
assert.ok(!rowInPkg(detail.rows[2], 0, 'Багц 4.1'), 'өөр багц таарахгүй');

/* ── 2а. ДИАПАЗОН ≠ БАГЦ 14 (2026-09-21) — `bagtsKey('Багц 1-4')` = «БАГЦ14» занга ── */
{
  const range = T('Хэтэрсэн ажлууд', ['Багц', 'Ажил'], [
    [cell('Багц 1-4'), cell('ТЭЗҮ 1–4')],
    [cell('Багц 14'), cell('Дулааны суваг')],
  ]);
  assert.ok(!rowInPkg(range.rows[0], 0, 'Багц 14'), 'диапазон мөр Багц 14-т ОРОХГҮЙ');
  assert.ok(!rowInPkg(range.rows[1], 0, 'Багц 1-4'), 'Багц 14-ийн мөр диапазонд ОРОХГҮЙ');
  assert.ok(rowInPkg(range.rows[0], 0, 'БАГЦ-1-4'), 'диапазон өөртэйгөө таарна (бичиглэл хамаарахгүй)');
  assert.ok(samePkg('Багц 14', 'БАГЦ-14'));
  assert.ok(!samePkg('Багц 1-4', 'Багц 14'));
  assert.equal(filterTable(range, 'Багц 14').rows.length, 1, 'Багц 14 сонгоход зөвхөн өөрийн мөр');
  assert.equal(filterTable(range, 'Багц 1-4').rows.length, 1, 'диапазон сонгоход зөвхөн диапазон мөр');
  const rr = filterResult({
    value: '—', unit: '', facts: [], level: 'unknown', tables: [], asOf: null, failedSources: [],
    issues: [
      { text: 'Багц 1-4 · ТЭЗҮ — 5 хоног хэтэрсэн', tone: 'bad' },
      { text: 'Багц 14 · Дулааны суваг — 9 хоног хэтэрсэн', tone: 'bad' },
    ],
  }, 'Багц 14');
  assert.equal(rr.issues.length, 1, 'анхааруулга ч диапазоныг Багц 14-т оруулахгүй');
  assert.match(rr.issues[0].text, /Багц 14 ·/);
}

/* ── 3. Мөрөөр шүүх ── */
{
  const out = filterTable(detail, 'Багц 4.1');
  assert.ok(out, 'хүснэгт үлдэх ёстой');
  assert.equal(out.rows.length, 2, 'хоёр бичиглэл хоёулаа үлдэнэ');
  assert.equal(out.title, detail.title, 'гарчиг хэвээр');
  assert.equal(detail.rows.length, 4, 'эх хүснэгт ХӨНДӨГДӨХГҮЙ (шинэ объект)');
}

/* ── 4. Хоосон болвол ОГТ гарахгүй ── */
assert.equal(filterTable(detail, 'Багц 99'), null, 'таарахгүй бол null');

/* ── 5. Багцгүй хүснэгт ХЭВЭЭР ── */
assert.equal(filterTable(noPkg, 'Багц 2'), noPkg, 'багцгүй хүснэгтийг хөндөхгүй');

/* ── 6. НЭГТГЭСЭН хүснэгт — багц сонгоход НУУГДАНА ── */
assert.ok(isPkgSummary(summary), '«Багцаар» нь нэгтгэсэн хүснэгт');
assert.ok(!isPkgSummary(detail), 'мөрийн жагсаалт нэгтгэсэн БИШ');
assert.equal(filterTable(summary, 'Багц 2'), null, 'нэгтгэсэн хүснэгт багц сонгоход нуугдана');
assert.equal(filterTable(summary, ALL_PKG), summary, 'шүүлтгүй үед хэвээр');

/* ── 7. Шүүлтгүй үед юу ч өөрчлөгдөхгүй ── */
{
  const r = { value: '1', unit: 'ш', facts: [], level: 'bad', tables: [detail, summary], issues: [], asOf: null, failedSources: [] };
  assert.equal(filterResult(r, ALL_PKG), r, 'шүүлтгүй бол ЯГ тэр объект');
}

/* ── 8. `filterResult` — гол тоо ХӨНДӨГДӨХГҮЙ, анхааруулга шүүгдэнэ ── */
{
  const r = {
    value: '56,833,096,505 ₮', unit: 'зөрүү', facts: ['111 ажил хэтэрсэн'], level: 'bad',
    tables: [detail, summary, noPkg],
    issues: [
      { text: 'Багц 4-1 · Бетон цутгалт — 13,071,994,635 ₮', tone: 'bad' },
      { text: 'Багц 2 · Суурь — 1,000,000,000 ₮', tone: 'bad' },
      { text: '1 багцын хуудас уншигдсангүй — дүн дутуу', tone: 'warn' },
    ],
    asOf: null, failedSources: [],
  };
  const out = filterResult(r, 'Багц 4.1');
  assert.equal(out.value, r.value, 'ГОЛ ТОО нь төслийнх — хөндөгдөхгүй');
  assert.deepEqual(out.facts, r.facts, 'facts хөндөгдөхгүй');
  assert.equal(out.level, r.level, 'түвшин хөндөгдөхгүй');
  assert.equal(out.tables.length, 2, 'нэгтгэсэн нь хасагдаж, мөрийн + багцгүй нь үлдэнэ');
  assert.equal(out.tables[0].rows.length, 2);
  assert.equal(out.tables[1], noPkg, 'багцгүй хүснэгт хэвээр');
  assert.equal(out.issues.length, 1, 'зөвхөн тэр багцын анхааруулга');
  assert.match(out.issues[0].text, /Багц 4-1/);

  const out2 = filterResult({ ...r, issues: [{ text: 'Үйлчилгээ татагдсангүй', tone: 'warn' }] }, 'Багц 2');
  assert.equal(out2.issues.length, 1, 'багц дурдаагүй анхааруулга хасагдахгүй');

  const out3 = filterResult({
    ...r,
    tables: [],
    issues: [
      { text: 'БАГЦ-1 · Барилга — 5 хоног хэтэрсэн', tone: 'bad' },
      { text: 'БАГЦ-10 · Дулаан шугам — 45 хоног хэтэрсэн, 1,000,000 ₮', tone: 'bad' },
      { text: 'БАГЦ-16.7 · Суваг — 12 хоног хэтэрсэн', tone: 'bad' },
      { text: 'Багц 1 — төл. 40.0% / бодит 10.0% · −30.0 пп', tone: 'bad' },
    ],
  }, 'БАГЦ-1');
  assert.equal(out3.issues.length, 2, 'зөвхөн Багц 1-ийнх — Багц 10 ба 16.7 хасагдана');
  assert.ok(out3.issues.every((i) => !/БАГЦ-1[06]/.test(i.text)), 'урт дугаартай багц орохгүй');
}

/* ── 9. Сонгогчийн жагсаалт ── */
{
  const opts = pkgOptions([
    { tables: [detail, noPkg] },
    { tables: [summary] },
  ]);
  assert.deepEqual(opts, ['Багц 2', 'Багц 4-1'], 'давхардалгүй, байгалийн эрэмбээр');
  assert.ok(!opts.some((o) => o.startsWith('…')), 'таслалтын мөр багц БИШ');

  /* Байгалийн эрэмбэ — «Багц 2» нь «Багц 10»-ээс ӨМНӨ */
  const many = pkgOptions([{ tables: [T('x', ['Багц'], [[cell('Багц 10')], [cell('Багц 2')]])] }]);
  assert.deepEqual(many, ['Багц 2', 'Багц 10'], 'тоон эрэмбэ');
}

console.log('ceo/filter.check.mjs — БҮГД ТЭНЦЛЭЭ');

/* ── 10. Сонгогч — ЖИНХЭНЭ багцын нэр л орно ── */
{
  const noisy = T('x', ['Багц'], [
    [cell('Багц 3.2')],
    [cell('Багц тодорхойгүй')],   /* нэг багцыг заадаггүй */
    [cell('БҮХ БАГЦ')],
    [cell('БАГЦ 1-6')],           /* диапазон — `isPkgRange` */
    [cell('Тодорхойгүй')],
  ]);
  assert.deepEqual(pkgOptions([{ tables: [noisy] }]), ['Багц 3.2'],
    'зөвхөн нэг багцыг заасан нэр сонгогчид орно');
}

console.log('ceo/filter.check.mjs — сонгогчийн шүүлт ч ТЭНЦЛЭЭ');

/* ── 11. Багцын мөр ЗӨВХӨН нэгтгэсэн хүснэгтэд — тэр мөр ҮЛДЭНЭ («алга» гэж худал хэлэхгүй) ── */
{
  const late = T('Багц бүрээр', ['Багц', 'Сар', 'Зөрүү пп'], [[cell('Багц-3.2'), cell('2026-10'), cell(-33.9)]]);
  const noData = T('Хэмжилтгүй багц', ['Багц', 'Шалтгаан'], [[cell('Багц 6.4'), cell('хуваарь алга')]]);
  const r = { value: '1', unit: '', facts: [], level: 'bad', tables: [late, noData], issues: [], asOf: null, failedSources: [] };
  const own = filterResult(r, 'Багц-3.2');
  assert.deepEqual(own.tables.map((t) => t.title), ['Багц бүрээр'], 'нэгтгэлийн мөр үлдэв');
  assert.equal(own.tables[0].rows[0][2].v, -33.9);
  assert.deepEqual(filterResult(r, 'Багц 6.4').tables.map((t) => t.title), ['Хэмжилтгүй багц'], 'нэгтгэлд мөргүй багцад нэгтгэл гарахгүй');
  assert.deepEqual(filterResult(r, 'Багц 99').tables, [], 'аль ч хүснэгтэд мөргүй бол хоосон');
  const both = filterResult({ ...r, tables: [T('Багц бүрээр', ['Багц'], [[cell('Багц 6.4')]]), noData] }, 'Багц 6.4');
  assert.deepEqual(both.tables.map((t) => t.title), ['Хэмжилтгүй багц'], 'өөрийн мөртэй хүснэгт байвал нэгтгэл нуугдсан хэвээр');
}

/* ── 12. Давхцлын мөрийн нэр — багцын хэсгээр («Багц 6.4 · цахилгааны шугам Багц4» = Багц 6.4) ── */
{
  const ov = T('Давхцсан үлдсэн нэгж талбар', ['Багц', 'Нэгж талбар'], [
    [cell('Багц 6.4 · цахилгааны шугам Багц4'), cell(42)],
    [cell('Багц 6.4 · Холбоо'), cell(32)],
    [cell('Багц 16.1 · Өндөржилт — Багц 1'), cell(8)],
    [cell('Багц 5.1'), cell(4)],
    [cell('Багц 1'), cell(2)],
  ]);
  assert.equal(filterTable(ov, 'Багц-6.4').rows.length, 2, 'давхаргын бүх мөр');
  assert.equal(filterTable(ov, 'Багц 6.4 · Холбоо').rows.length, 2, 'сонголт нийлмэл нэртэй ч ижил');
  assert.equal(filterTable(ov, 'БАГЦ-16.1').rows.length, 1);
  assert.deepEqual(filterTable(ov, 'Багц 1').rows.map((x) => x[0].v), ['Багц 1'], '«— Багц 1» гэсэн сүүл нь Багц 1 БИШ');
  assert.equal(filterTable(ov, 'Багц 5.1').rows.length, 1, 'нэмэлтгүй нэр хэвээр');
  assert.deepEqual(pkgOptions([{ tables: [ov] }]), ['Багц 1', 'Багц 5.1', 'Багц 6.4', 'Багц 16.1'], 'сонгогчид багцын нэр л');
  assert.ok(!samePkg('Багц 1-4 · ТЭЗҮ'.split(' · ')[0], 'Багц 14'), 'диапазон хамгаалалт хэвээр');
}

/* ── 13. Багц дурдаагүй анхааруулга — төслийн нийтийнх гэж танигдана ── */
assert.equal(issueNamesPkg('татгалзсан: 22 талбар'), false);
assert.equal(issueNamesPkg('Багц 3.2 — төл. 63.8%'), true);
{
  /* «{багц}-д мөр алга» тэмдэглэл: төслийн нийтийн анхааруулга үлдсэн ч үнэн, багцаа нэрлэсэн анхааруулга үлдвэл худал */
  const base = { value: '1', unit: '', facts: [], level: 'warn', tables: [T('Хэмжилтгүй багц', ['Багц'], [[cell('Багц 1')]])], asOf: null, failedSources: [] };
  const wide = filterResult({ ...base, issues: [{ tone: 'warn', text: 'татгалзсан: 22 талбар' }] }, 'Багц 2');
  assert.deepEqual(wide.tables, []);
  assert.equal(wide.issues.length, 1);
  assert.ok(!wide.issues.some((i) => issueNamesPkg(i.text)), 'мөргүй багц — тэмдэглэл гарна');
  const named = filterResult({ ...base, issues: [{ tone: 'bad', text: 'Багц 2 — хэзээ ч бөглөөгүй' }] }, 'Багц 2');
  assert.deepEqual(named.tables, []);
  assert.ok(named.issues.some((i) => issueNamesPkg(i.text)), 'багцын асуудалтай — тэмдэглэл гарахгүй');
}

console.log('ceo/filter.check.mjs — нэгтгэл ба давхцлын мөр ТЭНЦЛЭЭ');
