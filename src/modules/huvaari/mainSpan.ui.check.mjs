/**
 * «ҮНДСЭН ХУГАЦАА» (`huvaari/MainSpan.tsx`) — цэвэр туслахууд ба эх кодын хамгаалалт. Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/modules/huvaari/mainSpan.ui.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-11-05, хэрэглэгч: «бүх багцад Үндсэн хугацаа гэдэг ажлаар багцын төсөөллийн хуваарийг түр хийнэ»):
 *   1. Бүх гэрээ (ТЭЗҮ · зураг төсөл · барилга угсралт) жагсаалтад; үе шат, дугаараар эрэмбэлэгдэнэ.
 *   2. Сарын хувийн түлхүүр: «CF:<id>»-д мөр байвал тэр; гүйцэтгэлийн хүснэгттэй багцын барилгын гэрээний хуучин (багцын)
 *      түлхүүрт мөр байвал тэр (эхний 21 гэрээ); аль нь ч үгүй бол шинээр «CF:<id>». Багцын нэр давхцсан зураг төслийн
 *      гэрээ барилгын гэрээний хувийг АВАХГҮЙ.
 *   3. Саруудын хүрээ = хадгалсан сарууд ∪ эхлэх…дуусах; гүйцэтгэлийн хувь ЭНД бөглөгдөхгүй (зөвхөн огноо + сарын хувь).
 *   4. Хадгалалт `finEdit` эрхээр; хуучин гараар сарын мөр үлдсэн гэрээнд давхар төлөвлөгөө үүсгэхгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const M = await import('@/modules/huvaari/MainSpan');
const { toPkgPct } = await import('@/lib/huvaariObyem');
const SRC = readFileSync(new URL('./MainSpan.tsx', import.meta.url), 'utf8');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

ok('addMonths · monthRange — жил давна, урвуу/буруу бол хоосон', () => {
  assert.equal(M.addMonths('2026-12', 1), '2027-01');
  assert.equal(M.addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(M.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(M.monthRange('2027-02', '2026-11'), []);
  assert.deepEqual(M.monthRange('муу', '2026-11'), []);
  assert.equal(M.monthRange('2000-01', '2099-12').length, 240, 'дээд тал 240 сар');
});

ok('pctMonths — хадгалсан сарууд ∪ Үндсэн хугацаа', () => {
  const pct = new Map([['2026-10', 30], ['2026-12', 70]]);
  assert.deepEqual(M.pctMonths(pct, '2026-11', '2027-01'), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.deepEqual(M.pctMonths(new Map(), '2026-11', '2026-12'), ['2026-11', '2026-12'], 'хувь оруулаагүй — хугацаагаар');
  assert.deepEqual(M.pctMonths(pct, null, null), ['2026-10', '2026-11', '2026-12'], 'огноогүй — хадгалсан саруудаар');
  assert.deepEqual(M.pctMonths(new Map(), null, null), [], 'юу ч үгүй — хоосон');
});

const all = toPkgPct([
  { attributes: { bagts: 'БАГЦ1', sar_txt: '2026-10', obyem: 100 } },      /* хуучин (багцын) түлхүүр — эхний 21 гэрээ */
  { attributes: { bagts: 'CF:50', sar_txt: '2026-11', obyem: 40 } },
  { attributes: { bagts: 'CF:50', sar_txt: '2026-12', obyem: 60 } },
  { attributes: { bagts: 'БАГЦ71', sar_txt: '2026-10', obyem: 100 } },
  { attributes: { bagts: 'CF:11', sar_txt: '2027-01', obyem: 5 } },
]);

ok('pctKeyFor — «CF:<id>» давамгай; хуучин багцын түлхүүр зөвхөн хүснэгттэй багцын барилгын гэрээнд', () => {
  assert.equal(M.pctKeyFor(50, 'БАГЦ8', true, all), 'CF:50');
  assert.equal(M.pctKeyFor(12, 'БАГЦ1', true, all), 'БАГЦ1', 'эхний 21 гэрээ — багцын түлхүүр хэвээр');
  assert.equal(M.pctKeyFor(11, 'БАГЦ1', true, all), 'CF:11', 'CF мөртэй бол тэр давамгай');
  assert.equal(M.pctKeyFor(4, 'БАГЦ71', false, all), 'CF:4', 'зураг төслийн гэрээ барилгын гэрээний хувийг авахгүй');
  assert.equal(M.pctKeyFor(60, 'БАГЦ191', true, all), 'CF:60', 'хувь оруулаагүй — шинээр CF');
  assert.equal(M.pctKeyFor(58, '', true, all), 'CF:58', 'багцгүй ажил');
});

ok('contractsOf — бүх гэрээ, үе шат → дугаараар; ХО дүнгүй null; эх «Хуваарь» эсэх', () => {
  const works = [
    { objectid: 9, cashflow_id: 50, bagts: 'Багц-8', uy_shat: 'Барилга угсралт', ho_dun_geree: 1000, sar_mongo_eh: 'huvaari', guits_ehleh: Date.UTC(2026, 10, 1), guits_duusah: Date.UTC(2026, 11, 31), ajil_uilchilgee: '110кв дэд станц' },
    { objectid: 3, cashflow_id: 4, bagts: 'БАГЦ-7.1', uy_shat: 'Ажлын зураг төсөл', ho_dun_geree: 0, sar_mongo_eh: null, ajil_uilchilgee: 'Зураг' },
    { objectid: 1, cashflow_id: 1, bagts: 'БАГЦ 1-6', uy_shat: 'ТЭЗҮ', ho_dun_geree: 50, ajil_uilchilgee: 'ТЭЗҮ' },
    { objectid: 7, cashflow_id: null, bagts: 'x', uy_shat: 'Барилга угсралт' },
    { objectid: 8, cashflow_id: 12, bagts: 'Багц-1', uy_shat: 'Барилга угсралт', ho_dun_geree: 300, sar_mongo_eh: 'huvaari', ajil_uilchilgee: 'Орон сууц' },
  ];
  const cs = M.contractsOf(works, all);
  assert.deepEqual(cs.map((c) => c.id), [1, 4, 12, 50], 'ТЭЗҮ → зураг төсөл → барилга угсралт; дугааргүй мөр орохгүй');
  const c50 = cs.find((c) => c.id === 50);
  assert.deepEqual([c50.key, c50.huv, c50.cost, [...c50.pct]], ['CF:50', true, 1000, [['2026-11', 40], ['2026-12', 60]]]);
  const c4 = cs.find((c) => c.id === 4);
  assert.deepEqual([c4.key, c4.huv, c4.cost, c4.pct.size, c4.start], ['CF:4', false, null, 0, null]);
  assert.equal(cs.find((c) => c.id === 12).key, 'БАГЦ1');
});

ok('эх код — огноо + сарын хувь л; гүйцэтгэлийн хувь бөглөхгүй; finEdit эрх; давхар төлөвлөгөөний хаалт', () => {
  assert.ok(!/guitsetgel_huvi|progressPct/.test(SRC), 'гүйцэтгэлийн хувь энд бөглөгдөх ёсгүй');
  assert.match(SRC, /savePkgPct\(d\.key,/, 'сарын хувь гэрээний түлхүүрээр');
  assert.match(SRC, /applyAll\(CASHFLOW_NEW\.url, CASHFLOW_NEW\.oid, \{ updates: \[\{ \[CASHFLOW_NEW\.oid\]: d\.oid, \.\.\.upd \}\] \}, \{ cap: 'finEdit' \}\)/);
  assert.match(SRC, /upd\[F\.startDate\] = startMs; upd\[F\.endDate\] = endMs;/, 'огноо — Төлөвлөгөөт хугацааны талбар');
  assert.match(SRC, /if \(pctDirty && !base\.huv\) upd\[F\.monthSource\] = SRC_HUVAARI;/, 'анх хувь оруулахад эх «Хуваарь» болно');
  assert.match(SRC, /if \(left\.length\) throw new Error\(/, 'хуучин гараар мөр үлдсэн бол хадгалахгүй');
  const inputs = SRC.match(/<input[^>]*>/g) ?? [];
  assert.ok(inputs.every((x) => /type="date"|inputMode="decimal"/.test(x)), 'чөлөөт текстийн талбар алга');
});

console.log(`\n✅ mainSpan: ${n} шалгуур давлаа`);
