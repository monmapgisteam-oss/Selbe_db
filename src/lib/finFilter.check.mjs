/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛИЙН ШҮҮЛТИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/finFilter.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. БОХИР УТГА. Эх өгөгдөлд `'Багц 4.1 '` (арын зайтай) хувилбарууд
 *      бодитоор байдаг. Чанахгүй бол нэг багц ХОЁР мөр болж жагсаалтад гарч,
 *      аль нэгийг сонгоход мөрийн ХАГАС нь алдагдана.
 *   2. `null` ≠ `''` ≠ `0`. Хоосон нүд «0» гэж шүүгдвэл «дүнгүй» ба
 *      «тэг» хоёр нэгдэж, тайлан чимээгүй худал болно.
 *   3. ХАРАГДАХ vs ТҮҮХИЙ дүрслэл. Хэрэглэгч «4,058,800,000» гэж хуулж наана,
 *      эсвэл «4058800000» гэж бичнэ — хоёулаа олдох ёстой.
 *   4. ТАЛБАРЫН КОД ЗӨРӨХ. `FIN_FACETS` дэх код нь `FIN_FIELD_LABELS`-д
 *      байхгүй бол шүүлт чимээгүй хоосорно (ямар ч алдаа гарахгүй).
 */
import assert from 'node:assert/strict';
import {
  FIN_FACETS, EMPTY_FILTER, isDirty,
  distinct, facetValues, numTest, rowMatches,
} from './finFilter.ts';
import { FIN_FIELD_LABELS } from './financeFieldLabels.ts';

/* ── Туслах: `Finance.tsx`-ийн `fmtCell`-ийн ЭНГИЙН хувилбар ──
   ⚠️ Бүтэн хуулбар БИШ — шүүлт нь форматлагчийг ГАДНААС авдаг гэдгийг
      баталгаажуулах зорилготой. Мянгатын таслал л чухал. */
const NUMERIC = new Set(['esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeOID']);
const isNumeric = (t) => NUMERIC.has(t);
const cellText = (v, t) => {
  if (v == null || v === '') return '';
  if (t === 'esriFieldTypeDateOnly') return String(v).slice(0, 10);
  if (NUMERIC.has(t)) {
    const x = Number(v);
    return Number.isFinite(x) ? x.toLocaleString('en-US') : String(v);
  }
  return String(v).trim();
};

const CF_COLS = [
  { name: 'CF002', alias: 'CF002', type: 'esriFieldTypeString' },
  { name: 'CF003', alias: 'CF003', type: 'esriFieldTypeInteger' },
  { name: 'CF006', alias: 'CF006', type: 'esriFieldTypeString' },
  { name: 'CF008', alias: 'CF008', type: 'esriFieldTypeString' },
  { name: 'CF009', alias: 'CF009', type: 'esriFieldTypeDouble' },
  { name: 'CF020', alias: 'CF020', type: 'esriFieldTypeDateOnly' },
];
const CF = FIN_FACETS.CASHFLOW2;
const f = (over = {}) => ({ ...EMPTY_FILTER, ...over, facet: { ...EMPTY_FILTER.facet, ...(over.facet ?? {}) }, col: { ...(over.col ?? {}) } });
const match = (r, flt) => rowMatches(r, CF_COLS, flt, CF, cellText, isNumeric);

const rows = [
  { OBJECTID: 1, CF002: 'ГЭРЭЭ', CF003: 2026, CF006: 'Багц 4.1', CF008: 'МКС', CF009: 4058800000, CF020: '2026-03-14' },
  { OBJECTID: 2, CF002: 'ГЭРЭЭ', CF003: 2026, CF006: 'Багц 4.1 ', CF008: 'МКС', CF009: 76000, CF020: '2026-04-01' },
  { OBJECTID: 3, CF002: 'ЗАХИРАМЖ', CF003: 2025, CF006: 'Багц 4.2', CF008: 'АНУ', CF009: null, CF020: null },
  { OBJECTID: 4, CF002: 'ГЭРЭЭ', CF003: 2025, CF006: '', CF008: '', CF009: 0, CF020: '' },
];

/* ── 1. numTest ── */
assert.equal(numTest('>1000')(1001), true);
assert.equal(numTest('>1000')(1000), false);
assert.equal(numTest('>=1000')(1000), true);
assert.equal(numTest('<200')(199), true);
assert.equal(numTest('<=0')(0), true);
assert.equal(numTest('100..200')(150), true);
assert.equal(numTest('100..200')(201), false);
assert.equal(numTest('200..100')(150), true, 'урвуу муж ч ажиллана');
assert.equal(numTest('>=5e6')(6_000_000), true);
assert.equal(numTest('>1,000,000')(2_000_000), true, 'мянгатын таслалтай оролт');
assert.equal(numTest('='.concat('76000'))(76000), true);
assert.equal(numTest('2026'), null, 'ердийн тоо нь ХАРЬЦУУЛАЛТ биш — текстээр хайна');
assert.equal(numTest('хог'), null);
assert.equal(numTest(''), null);
assert.equal(numTest('>'), null, 'дутуу илэрхийлэл');

/* ── 2. Бохир утга НЭГ болно ── */
assert.deepEqual(
  facetValues(rows, CF[0]),
  ['Багц 4.1', 'Багц 4.2', ''],
  'арын зайтай хувилбар нэгдэж, хоосон нь ТӨГСГӨЛД',
);
assert.deepEqual(facetValues(rows, CF[1]), ['2025', '2026'].sort((a, b) => a.localeCompare(b, 'mn')));
assert.equal(match(rows[1], f({ facet: { pkg: 'Багц 4.1' } })), true, "'Багц 4.1 ' нь 'Багц 4.1'-д багтана");
assert.equal(match(rows[2], f({ facet: { pkg: 'Багц 4.1' } })), false);
assert.equal(match(rows[3], f({ facet: { pkg: '' } })), true, "'' = бүгд, шүүхгүй");

/* ── 3. Харагдах ба түүхий дүрслэл хоёулаа ── */
assert.equal(match(rows[0], f({ q: '4,058,800,000' })), true, 'мянгатын таслалтайгаар');
assert.equal(match(rows[0], f({ q: '4058800000' })), true, 'түүхий тоогоор');
assert.equal(match(rows[0], f({ q: 'мкс' })), true, 'том/жижиг үсэг ялгахгүй');
assert.equal(match(rows[0], f({ q: '2026-03' })), true, 'огнооны угтвар');
assert.equal(match(rows[2], f({ q: 'мкс' })), false);

/* ── 4. Хоосон нүд «null» гэж хайхад таарахгүй ── */
assert.equal(match(rows[2], f({ q: 'null' })), false, "String(null) нь хайлтад ОРОХГҮЙ");
assert.equal(match(rows[3], f({ q: 'null' })), false);

/* ── 5. `null` ≠ `0` ── */
assert.equal(match(rows[2], f({ col: { CF009: '0' } })), false, 'null нь 0 гэж шүүгдэхгүй');
assert.equal(match(rows[3], f({ col: { CF009: '=0' } })), true, 'бодит 0 нь шүүгдэнэ');
assert.equal(match(rows[0], f({ col: { CF009: '>1e9' } })), true);
assert.equal(match(rows[1], f({ col: { CF009: '>1e9' } })), false);

/* ── 6. Багана бүрийн шүүлт нь ХОСЛОНО (БА) ── */
assert.equal(match(rows[0], f({ col: { CF002: 'ГЭРЭЭ', CF008: 'МКС' } })), true);
assert.equal(match(rows[0], f({ col: { CF002: 'ГЭРЭЭ', CF008: 'АНУ' } })), false);
assert.equal(
  match(rows[0], f({ facet: { type: 'ГЭРЭЭ' }, q: 'МКС', col: { CF009: '>1e9' } })),
  true,
  'нүүр + чөлөөт хайлт + баганын шүүлт гурвуулаа',
);

/* ── 7. isDirty ── */
assert.equal(isDirty(EMPTY_FILTER), false);
assert.equal(isDirty(f({ q: '  ' })), false, 'зөвхөн зай нь шүүлт биш');
assert.equal(isDirty(f({ q: 'а' })), true);
assert.equal(isDirty(f({ facet: { year: '2026' } })), true);
assert.equal(isDirty(f({ col: { CF009: '>1' } })), true);

/* ── 9. IPC-ийн он нь IPC09-өөс ── */
const IPC = FIN_FACETS.IPC_LOG;
const ipcRows = [
  { IPC03: 'Багц 4.1', IPC06: 'Завсрын', IPC09: '2026-01-01' },
  { IPC03: 'Багц 4.1', IPC06: 'Эцсийн', IPC09: null },
  { IPC03: 'Багц 5', IPC06: 'Завсрын', IPC09: 1_767_225_600_000 },
];
assert.equal(IPC[1].valueOf(ipcRows[0]), '2026');
assert.equal(IPC[1].valueOf(ipcRows[1]), '', 'огноогүй мөр хоосон хувинд');
assert.equal(IPC[1].valueOf(ipcRows[2]), '2026', 'epoch (мс) хэлбэр ч уншигдана');
assert.deepEqual(facetValues(ipcRows, IPC[1]), ['2026', '']);

/* ── 10. Талбарын код нь толинд БАЙГАА эсэх ── */
/* ⚠️ Оролтыг ОГНООНЫ хэлбэрээр өгнө: нүүрүүдийн зарим нь (IPC-ийн «Он») утгыг
   огнооноос ГАРГАДАГ тул 'x' гэсэн утга хоосон буцааж, шалгуур худал унана. */
const probe = Object.fromEntries(Object.keys(FIN_FIELD_LABELS).map((k) => [k, '2026-01-01']));
for (const [key, facets] of Object.entries(FIN_FACETS)) {
  for (const fc of facets) {
    assert.notEqual(fc.valueOf(probe), '', `${key}/${fc.key} — талбарын код FIN_FIELD_LABELS-д алга`);
  }
}

/* ── 11. distinct нь давхардуулахгүй ── */
assert.deepEqual(distinct([{ a: 'x' }, { a: 'x ' }, { a: 'y' }], (r) => String(r.a).trim()), ['x', 'y']);

console.log('finFilter.check.mjs — БҮГД ТЭНЦЛЭЭ');
