/**
 * БАГЦААР БҮТЭЦЛЭХИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/finGroup.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. МӨР АЛДАГДАХ. Бүлэглэлт нь зөвхөн ЭРЭМБЭЛНЭ — оруулсан мөрийн тоо
 *      гаралтын тоотой ЯГ тэнцүү байх ёстой. Нийлбэр/шүүлт хийвэл засвар үхнэ.
 *   2. ДИАПАЗОН МӨР БУРУУ ЭЗЭНД. `bagtsKey('БАГЦ 1-4')` = `'БАГЦ14'` нь бодит
 *      «Багц 14»-ийн ЯГ түлхүүр (services.ts-ийн `isPkgRange`).
 *   3. ДЭД БАГЦ ОВООРОХ. `pkg2` (навч) байхад `pkg`-ийг авбал «Багц 4.1» ба
 *      «Багц 4.2» нэг блок болно.
 *   4. ЭХ ДАРААЛАЛ ЭВДРЭХ. Багц доторх мөрийн дараалал ХАДГАЛАГДАХ ёстой —
 *      бүртгэл нь OID-ийн дарааллаар татагддаг бөгөөд хэрэглэгч тэр
 *      дарааллаар нь уншиж дассан.
 *   5. ОНООР ДЭД БҮЛЭГ ҮҮСЭХ. Хэрэглэгч 2026-09-01-нд «заавал он бүлэглэх
 *      шаардлагагүй» гэсэн — он нь ердийн багана хэвээр байх ёстой.
 */
import assert from 'node:assert/strict';
import { buildGroups, NO_PKG } from './finGroup.ts';
import { CASHFLOW2, IPC_LOG } from './services.ts';

const CF = CASHFLOW2.fields;
const IP = IPC_LOG.fields;

const cf = (oid, pkg, pkg2, year, o = {}) => ({
  OBJECTID: oid, [CF.pkg]: pkg, [CF.pkg2]: pkg2, [CF.year]: year, ...o,
});
const ipc = (oid, pkg, pkg2, o = {}) => ({
  OBJECTID: oid, [IP.pkg]: pkg, [IP.pkg2]: pkg2, ...o,
});
const total = (out) => out.reduce((a, p) => a + p.count, 0);

/* ── 1. Мөр АЛДАГДАХГҮЙ, дэд багц салангид, ЭХ дараалал ── */
{
  const rows = [
    cf(1, 'БАГЦ-4', 'БАГЦ-4.1', 2026),
    cf(2, 'БАГЦ-4', 'БАГЦ-4.1', 2025),
    cf(3, 'БАГЦ-4', 'БАГЦ-4.1', 2025),
    cf(4, 'БАГЦ-4', 'БАГЦ-4.2', 2025),
  ];
  const out = buildGroups(rows, 'cf');
  assert.equal(total(out), rows.length, 'мөр АЛДАГДААГҮЙ');
  assert.deepEqual(out.map((p) => p.pkg), ['БАГЦ-4.1', 'БАГЦ-4.2'], 'дэд багц салангид');
  assert.deepEqual(out[0].rows.map((r) => r.oid), [1, 2, 3],
    'багц доторх дараалал ЭХ хэвээр — оноор ЭРЭМБЭЛЭГДЭЭГҮЙ');
  assert.equal(out[0].count, 3);
}

/* ── 2. ОНООР дэд бүлэг ҮҮСГЭХГҮЙ ── */
{
  const out = buildGroups([
    cf(1, 'БАГЦ-5', '', 2026),
    cf(2, 'БАГЦ-5', '', null),
    cf(3, 'БАГЦ-5', '', 2025),
  ], 'cf');
  assert.equal(out.length, 1);
  assert.ok(!('years' in out[0]), 'оны дэд бүлэг ҮҮСЭЭГҮЙ');
  assert.deepEqual(out[0].rows.map((r) => r.oid), [1, 2, 3], 'онгүй мөр ч дараалалдаа');
  assert.equal(out[0].count, 3);
}

/* ── 3. Диапазон мөр «хуваарилагдаагүй» рүү, хамгийн сүүлд ── */
{
  const out = buildGroups([
    cf(1, 'БАГЦ 1-4', '', 2026),
    cf(2, 'БАГЦ-14', '', 2026),
  ], 'cf');
  const real = out.find((p) => p.pkg === 'БАГЦ-14');
  assert.equal(real.count, 1, 'диапазоны мөр Багц 14-т НААЛДААГҮЙ');
  assert.equal(real.rows[0].oid, 2);
  assert.equal(out[out.length - 1].key, NO_PKG, 'хуваарилагдаагүй нь хамгийн сүүлд');
}

/* ── 4. «Багц 4-1» ба «Багц 4.1» НЭГ багц; нэр нь ЭХНИЙ бичиглэл ── */
{
  const out = buildGroups([cf(1, '', 'Багц 4.1', 2026), cf(2, '', 'Багц 4-1', 2026)], 'cf');
  assert.equal(out.length, 1);
  assert.equal(out[0].pkg, 'Багц 4.1');
  assert.equal(out[0].count, 2);
}

/* ── 5. IPC — багцын талбар нь ӨӨР ── */
{
  const rows = [
    ipc(1, 'БАГЦ-4', 'БАГЦ-4.1'),
    ipc(2, 'БАГЦ-4', 'БАГЦ-4.1'),
    ipc(3, 'БАГЦ-9', ''),
  ];
  const out = buildGroups(rows, 'ipc');
  assert.equal(total(out), 3, 'акт АЛДАГДААГҮЙ');
  assert.deepEqual(out.map((p) => p.pkg), ['БАГЦ-4.1', 'БАГЦ-9']);
  assert.deepEqual(out[0].rows.map((r) => r.oid), [1, 2]);
  /* ⚠️ IPC нь Cashflow-ийн талбарыг УНШИХГҮЙ — код давхцдаггүй ч ирээдүйд
     талбар нэмэгдвэл санамсаргүй холилдохоос сэргийлнэ. */
  const wrong = buildGroups([{ OBJECTID: 9, [CF.pkg]: 'БАГЦ-4' }], 'ipc');
  assert.equal(wrong[0].key, NO_PKG);
}

/* ── 6. OID-гүй мөр (нийтлээгүй) ── */
{
  const out = buildGroups([{ [CF.pkg]: 'БАГЦ-7', [CF.year]: 2026 }], 'cf');
  assert.equal(out[0].rows[0].oid, null, 'OID байхгүй бол null — 0 БИШ');
}

/* ── 7. Хоосон оролт ── */
assert.deepEqual(buildGroups([], 'cf'), []);
assert.deepEqual(buildGroups([], 'ipc'), []);

console.log('finGroup.check.mjs — БҮГД ТЭНЦЛЭЭ');
