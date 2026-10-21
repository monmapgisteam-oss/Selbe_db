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

/*
 * ⚠️ 2026-09-09: `Cashflow_0904` хаягдаж, `Cashflow_0909` (`Cashflow_final`)
 * орлосон — талбарын нэр БҮГД өөрчлөгдсөн. Нүүрнүүд нь: багц (`bagts`),
 * төрөл (`ajil_tuvshin2`), захирамжийн он (`zahiramj_ognoo`-оос).
 */
const CF_COLS = [
  { name: 'ajil_tuvshin2', alias: 'Төрөл', type: 'esriFieldTypeString' },
  { name: 'bagts', alias: 'Багц', type: 'esriFieldTypeString' },
  { name: 'guitsetgegch', alias: 'Гүйцэтгэгч', type: 'esriFieldTypeString' },
  { name: 'ho_dun_geree', alias: 'Төсөвт өртөг', type: 'esriFieldTypeDouble' },
  { name: 'zahiramj_ognoo', alias: 'Захирамжийн огноо', type: 'esriFieldTypeDateOnly' },
];
const CF = FIN_FACETS.CASHFLOW_NEW;
const f = (over = {}) => ({ ...EMPTY_FILTER, ...over, facet: { ...EMPTY_FILTER.facet, ...(over.facet ?? {}) }, col: { ...(over.col ?? {}) } });
const match = (r, flt) => rowMatches(r, CF_COLS, flt, CF, cellText, isNumeric);

const rows = [
  { OBJECTID: 1, ajil_tuvshin2: 'ГЭРЭЭ', bagts: 'Багц 4.1', guitsetgegch: 'МКС', ho_dun_geree: 4058800000, zahiramj_ognoo: '2026-03-14' },
  { OBJECTID: 2, ajil_tuvshin2: 'ГЭРЭЭ', bagts: 'Багц 4.1 ', guitsetgegch: 'МКС', ho_dun_geree: 76000, zahiramj_ognoo: '2026-04-01' },
  { OBJECTID: 3, ajil_tuvshin2: 'ЗАХИРАМЖ', bagts: 'Багц 4.2', guitsetgegch: 'АНУ', ho_dun_geree: null, zahiramj_ognoo: '2025-08-02' },
  { OBJECTID: 4, ajil_tuvshin2: 'ГЭРЭЭ', bagts: '', guitsetgegch: '', ho_dun_geree: 0, zahiramj_ognoo: '' },
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
assert.deepEqual(facetValues(rows, CF[1]), ['ГЭРЭЭ', 'ЗАХИРАМЖ'], 'нүүр 2 нь ТӨРӨЛ');
assert.deepEqual(facetValues(rows, CF[2]), ['2025', '2026', ''], 'нүүр 3 нь захирамжийн ОН');
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
assert.equal(match(rows[2], f({ col: { ho_dun_geree: '0' } })), false, 'null нь 0 гэж шүүгдэхгүй');
assert.equal(match(rows[3], f({ col: { ho_dun_geree: '=0' } })), true, 'бодит 0 нь шүүгдэнэ');
assert.equal(match(rows[0], f({ col: { ho_dun_geree: '>1e9' } })), true);
assert.equal(match(rows[1], f({ col: { ho_dun_geree: '>1e9' } })), false);
/* ⚠️ 2026-09-25: ХАРЬЦУУЛАЛТЫН зам ч хоосон нүдийг 0 гэж үзэхгүй (`Number(null)` = 0) */
assert.equal(match(rows[2], f({ col: { ho_dun_geree: '=0' } })), false, 'null нь =0-д таарахгүй');
assert.equal(match(rows[2], f({ col: { ho_dun_geree: '<=0' } })), false, 'null нь <=0-д таарахгүй');
assert.equal(match(rows[2], f({ col: { ho_dun_geree: '<1,000,000,000' } })), false, 'null нь <1e9-д таарахгүй');
assert.equal(match(rows[2], f({ col: { ho_dun_geree: '0..5e9' } })), false, 'null нь мужид таарахгүй');
assert.equal(match({ ...rows[2], ho_dun_geree: '' }, f({ col: { ho_dun_geree: '=0' } })), false, "'' нь =0-д таарахгүй");
assert.equal(match(rows[3], f({ col: { ho_dun_geree: '0..5e9' } })), true, 'бодит 0 мужид таарна');

/* ── 6. Багана бүрийн шүүлт нь ХОСЛОНО (БА) ── */
assert.equal(match(rows[0], f({ col: { ajil_tuvshin2: 'ГЭРЭЭ', guitsetgegch: 'МКС' } })), true);
assert.equal(match(rows[0], f({ col: { ajil_tuvshin2: 'ГЭРЭЭ', guitsetgegch: 'АНУ' } })), false);
assert.equal(
  match(rows[0], f({ facet: { type: 'ГЭРЭЭ' }, q: 'МКС', col: { ho_dun_geree: '>1e9' } })),
  true,
  'нүүр + чөлөөт хайлт + баганын шүүлт гурвуулаа',
);

/* ── 7. isDirty ── */
assert.equal(isDirty(EMPTY_FILTER), false);
assert.equal(isDirty(f({ q: '  ' })), false, 'зөвхөн зай нь шүүлт биш');
assert.equal(isDirty(f({ q: 'а' })), true);
assert.equal(isDirty(f({ facet: { year: '2026' } })), true);
assert.equal(isDirty(f({ col: { ho_dun_geree: '>1' } })), true);

/* ── 9. HO-гийн он нь ЖИНХЭНЭ `on_` талбараас ── */
/*
 * ⚠️ 2026-09-09: `IPC_LOG` (`ipc_0813/172`, ТЕСТ өгөгдөл) хаягдаж `HO_IPC`
 * орлов. Хуучинд он гэсэн талбар БАЙХГҮЙ байсан тул `IPC09` (хамрах хугацаа)
 * -ийн жилээр гаргадаг байв; шинэд `on_` (Integer 2025/2026) БИЙ.
 *
 * ⚠️ ЭНЭ ШАЛГУУРЫН ГОЛ ЗОРИЛГО: `on_` нь `yearOf()`-ЫГ ХЭРЭГЛЭХГҮЙ
 * гэдгийг бэхжүүлэх. `yearOf` нь epoch мс ба `YYYY-MM-DD` хэлбэрт
 * зориулагдсан; дан `2025` дээр САНАМСАРГҮЙ ажиллах ч тэр нь эмзэг
 * тохиолдол. Хэн нэг нь «нэгдмэл болгоё» гэж `yearOf` руу шилжүүлбэл
 * доорх `2025` тоон утгын шалгуур сануулга өгнө.
 */
const HO = FIN_FACETS.HO_IPC;
const hoRows = [
  { bagts: 'Багц-4.1', tulult_turul: 'Гүйцэтгэл', on_: 2026 },
  { bagts: 'Багц-4.1', tulult_turul: null, on_: null },
  { bagts: 'Багц-5', tulult_turul: 'Урьдчилгаа төлбөр', on_: 2025 },
];
assert.equal(HO[1].valueOf(hoRows[0]), '2026', 'Integer он → мөр');
assert.equal(HO[1].valueOf(hoRows[1]), '', 'онгүй мөр хоосон хувинд');
assert.equal(HO[1].valueOf(hoRows[2]), '2025');
assert.deepEqual(facetValues(hoRows, HO[1]), ['2025', '2026', ''],
  'хоосон нь ТӨГСГӨЛД тусдаа хувинд');
/* ⚠️ Төлбөрийн төрөл 2/45 мөрд ХООСОН — чимээгүй хаягдахгүй, хоосон хувинд */
assert.equal(HO[2].valueOf(hoRows[1]), '', 'төрөлгүй мөр хоосон хувинд');
assert.deepEqual(facetValues(hoRows, HO[2]), ['Гүйцэтгэл', 'Урьдчилгаа төлбөр', '']);
assert.equal(HO[0].valueOf(hoRows[0]), 'Багц-4.1', 'багц нь `bagts` талбараас');

/* ── 10. Талбарын код нь толинд БАЙГАА эсэх ── */
/* ⚠️ Оролтыг ОГНООНЫ хэлбэрээр өгнө: нүүрүүдийн зарим нь утгыг огнооноос
   ГАРГАДАГ тул 'x' гэсэн утга хоосон буцааж, шалгуур худал унана.

   ⚠️ 2026-09-09: `HO_IPC` нүүрнүүд ЭНД ОРООГҮЙ. `financeFieldLabels.ts` нь
   `IPC0xx` кодын толь хэвээр байгаа (тэр файлыг шинэчлэх нь энэ алхмын
   хамрах хүрээнээс ГАДУУР) тул HO-гийн `bagts`/`on_`/`tulult_turul` гурав
   тэнд БАЙХГҮЙ. Толь HO-гоор нөхөгдмөгц доорх шүүлтийг ХАСАЖ бүх нүүрийг
   эргүүлж хамруулна — эс бөгөөс шүүлтийн жагсаалт чимээгүй хоосорно. */
const probe = Object.fromEntries(Object.keys(FIN_FIELD_LABELS).map((k) => [k, '2026-01-01']));
for (const [key, facets] of Object.entries(FIN_FACETS)) {
  if (key === 'HO_IPC') continue;
  for (const fc of facets) {
    assert.notEqual(fc.valueOf(probe), '', `${key}/${fc.key} — талбарын код FIN_FIELD_LABELS-д алга`);
  }
}

/* ── 11. distinct нь давхардуулахгүй ── */
assert.deepEqual(distinct([{ a: 'x' }, { a: 'x ' }, { a: 'y' }], (r) => String(r.a).trim()), ['x', 'y']);

/* ── 12. 2026-10-11 (аудит №7): баганын НЭР `cellText`-д дамжина; тоон шүүлт ХАРАГДАХ хэмжээсээр (×100) ── */
{
  const SHARE_COLS = [{ name: 'zahiramj_unet_tsaas_huvi', alias: 'Үнэт цаас %', type: 'esriFieldTypeDouble' }];
  const seen = [];
  const named = (v, t, n) => { seen.push(n); return n === 'zahiramj_unet_tsaas_huvi' && v != null ? `${(Number(v) * 100).toFixed(1)}%` : cellText(v, t); };
  const scale = (n) => (n === 'zahiramj_unet_tsaas_huvi' ? 100 : 1);
  const r = { OBJECTID: 9, zahiramj_unet_tsaas_huvi: 0.09 };
  assert.equal(rowMatches(r, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '>5' } }), [], named, isNumeric, scale), true, '0.09 → 9% > 5');
  assert.equal(rowMatches(r, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '>50' } }), [], named, isNumeric, scale), false);
  assert.equal(rowMatches(r, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '9.0%' } }), [], named, isNumeric, scale), true, 'харагдах текстээр');
  assert.ok(seen.includes('zahiramj_unet_tsaas_huvi'), 'cellText баганын нэр авна');
  assert.equal(rowMatches(r, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '>5' } }), [], named, isNumeric), false, 'хэмжээсгүй бол түүхий 0.09 (хуучин зан)');
  /* ⚠️ 2026-10-21: 0.07 × 100 = 7.000000000000001 — тайрсны дараа `=7` таарна */
  const r7 = { OBJECTID: 10, zahiramj_unet_tsaas_huvi: 0.07 };
  assert.equal(rowMatches(r7, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '=7' } }), [], named, isNumeric, scale), true, '0.07 → =7');
  assert.equal(rowMatches(r7, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '<=7' } }), [], named, isNumeric, scale), true);
  assert.equal(rowMatches({ OBJECTID: 11, zahiramj_unet_tsaas_huvi: 0.125 }, SHARE_COLS, f({ col: { zahiramj_unet_tsaas_huvi: '=12,5' } }), [], named, isNumeric, scale), true, 'хувьд нэг таслал аравтын');
}

/* ── 13. 2026-10-21: таслал `finEdit.parseCell`-тэй НЭГ дүрмээр ── */
assert.equal(numTest('=12,5')(12.5), true, '«12,5» → 12.5 (урьд нь 125)');
assert.equal(numTest('=12,5')(125), false);
assert.equal(numTest('>1,234.5')(1235), true, 'мянгат + аравтын цэг');
assert.equal(numTest('=1.234,5')(1234.5), true, 'цэг мянгат, таслал аравтын');
assert.equal(numTest('>1,000')(1001), true, 'тодорхойгүй «1,000» — мөнгөн шүүлтэд мянгат (хуучин зан)');
assert.equal(numTest('=1,250', true)(1.25), true, 'хувьд нэг таслал аравтын');
assert.equal(numTest('0,5..1,5')(1), true, 'муж аравтын таслалтай');
assert.equal(numTest('>1,2,3'), null, 'буруу таслал — текстээр хайна');

console.log('finFilter.check.mjs — БҮГД ТЭНЦЛЭЭ');
