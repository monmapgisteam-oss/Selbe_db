/**
 * MIR (материалын үзлэг) — цэвэр логик: Survey123 мөр → `MirRow`, хавсралтын туг, MA-гийн шат.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/mir.check.mjs
 */
import assert from 'node:assert/strict';
import { mirRowOf, mirsByMa, mirVerdictFor } from '@/lib/mir.ts';

const attrs = (o = {}) => ({
  objectid: 7, uniquerowid: 'R7', doc_no: 'NBG-SLB-MIR-0001', insp_date: 1_700_000_000_000, pkg: 'b1_9f', pkg_label: 'Багц 1 · 9 давхар',
  ma_no: 'SLB-REP-MA-P0100-0015-00', material_name: 'Арматур', verdict: 'A', x_count: 0, att_flags: 'lab cert photo', ...o,
});

/* 1. хавсралтын туг — зайгаар 3 туг; таслалаар; давхардал · хоосон хасна; «s» үсэгтэй утга бүтэн */
{
  assert.deepEqual(mirRowOf(attrs()).attFlags, ['lab', 'cert', 'photo'], '⚠️ зайгаар тусгаарласан 3 туг');
  assert.deepEqual(mirRowOf(attrs({ att_flags: 'lab,cert' })).attFlags, ['lab', 'cert'], 'Survey123 таслалаар');
  assert.deepEqual(mirRowOf(attrs({ att_flags: ' photos  photos,invoice ' })).attFlags, ['photos', 'invoice'], '«s» үсэг тасрахгүй · давхардалгүй');
  assert.deepEqual(mirRowOf(attrs({ att_flags: null })).attFlags, []);
  assert.deepEqual(mirRowOf(attrs({ att_flags: '' })).attFlags, []);
}
console.log('✅ mirRowOf — att_flags зай · таслал · давхардалгүй');

/* 2. MA-аар бүлэглэх · шатын дүн */
{
  const map = mirsByMa([mirRowOf(attrs({ objectid: 1, verdict: 'R' })), mirRowOf(attrs({ objectid: 3 })), mirRowOf(attrs({ objectid: 9, ma_no: '' }))]);
  assert.deepEqual(map.get('SLB-REP-MA-P0100-0015-00').map((r) => r.oid), [3, 1], 'сүүлийнх эхэнд');
  assert.equal(map.has(''), false, 'MA-гүй мөр бүлэгт орохгүй');
  assert.equal(mirVerdictFor(map.get('SLB-REP-MA-P0100-0015-00')), 'A', 'нэг ачаа A → шат нээгдэнэ');
  assert.equal(mirVerdictFor([mirRowOf(attrs({ verdict: 'R' }))]), 'R');
  assert.equal(mirVerdictFor([mirRowOf(attrs({ verdict: 'R' })), mirRowOf(attrs({ verdict: null }))]), null, 'шийдвэргүй ачаа → хүлээж буй');
  assert.equal(mirVerdictFor(undefined), undefined);
  assert.equal(mirVerdictFor([]), undefined);
}
console.log('✅ mirsByMa · mirVerdictFor');

/* 3. 2026-10-22 (аудит): эцгийн түлхүүр `uniquerowid || globalid`, GUID талбарын бичиглэл `{ТОМ}` */
{
  const { guidBraced } = await import('@/lib/mir.ts');
  assert.equal(guidBraced('2d70dc7c-7bec-4fd6-bfd3-1bf1b1135c85'), '{2D70DC7C-7BEC-4FD6-BFD3-1BF1B1135C85}');
  assert.equal(guidBraced(' {ABC} '), '{ABC}');
  assert.equal(guidBraced(null), '');
  assert.equal(mirRowOf(attrs({ uniquerowid: null, globalid: '{2d70dc7c-0000}' })).rowId, '{2D70DC7C-0000}', 'uniquerowid NULL → globalid');
  assert.equal(mirRowOf(attrs({ uniquerowid: 'u1', globalid: '{G}' })).rowId, '{U1}', 'uniquerowid тэргүүнд');
  assert.equal(mirRowOf(attrs({ uniquerowid: null, globalid: null })).rowId, '', 'хоёулаа хоосон');
}
console.log('✅ MIR — rowId = uniquerowid || globalid (2026-10-22)');
