/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ОГНОО — цэвэр логик.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/gazarOgnoo.check.mjs
 */
import assert from 'node:assert/strict';
import { buildTree, computePlan } from './projectPlan.ts';
import { badText, buildEdits, conflicts, effectiveRows, isEditable, pendingCount, setEdit, textOf } from './gazarOgnoo.ts';

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const N = { oid: 'objectid' };
const row = (objectid, dd_kod, etseg_kod, o = {}) => ({ objectid, dd_kod, etseg_kod, ajil_uilchilgee: dd_kod, ...o });
const base = [
  row(1, '3', null, { uy_shat: 'Газар чөлөөлөлт' }),
  row(2, '3.1', '3', { bagts: 'Багц-1' }),
  row(3, '3.2', '3', { bagts: 'Багц-2', gazar_ehleh: D('2026-01-01'), gazar_duusah: D('2026-02-01') }),
  row(4, '5', null, { uy_shat: 'Барилга угсралт' }),
];

/* Засагдах мөр — зөвхөн газрын үе шатын навч */
{
  const t = buildTree(base);
  assert.equal(isEditable(t.byCode.get('3')), false, 'үе шатын толгой засагдахгүй');
  assert.equal(isEditable(t.byCode.get('3.1')), true);
  assert.equal(isEditable(t.byCode.get('5')), false, 'өөр үе шат');
}

/* Засвар — анхны утга руу буцвал хасагдана */
{
  let p = setEdit({}, base[2], 'start', '2026-01-05');
  assert.equal(pendingCount(p), 1);
  assert.equal(textOf(p, base[2], 'start'), '2026-01-05');
  p = setEdit(p, base[2], 'start', '2026-01-01');
  assert.equal(pendingCount(p), 0, 'анхны утга — засвар биш');
  assert.equal(badText('2026-13-45'), true);
  assert.equal(badText(''), false, 'хоосон зөв');
}

/* Эцэг мөр хүүхдүүдээс: хамгийн эрт эхлэх, хамгийн хожуу дуусах */
{
  const p = { ...setEdit({}, base[1], 'start', '2025-12-01'), o2: { start: '2025-12-01', end: '2026-03-01' } };
  const t = buildTree(effectiveRows(base, p));
  const r = computePlan(t, {}, D('2026-01-15'));
  assert.equal(r.get('3').J, D('2025-12-01'));
  assert.equal(r.get('3').K, D('2026-03-01'));
}

/* Ачаа */
{
  const e = buildEdits(base, { o2: { start: '2026-01-01', end: '2026-02-01' } }, N);
  assert.deepEqual(e.issues, []);
  assert.deepEqual(e.updates, [{ objectid: 2, gazar_ehleh: D('2026-01-01'), gazar_duusah: D('2026-02-01') }]);
  assert.deepEqual(buildEdits(base, { o2: { start: '2026-01-01' } }, N).issues, [{ code: '3.1', kind: 'pair' }], 'нэг огноо');
  assert.deepEqual(buildEdits(base, { o2: { start: '2026-03-01', end: '2026-02-01' } }, N).issues, [{ code: '3.1', kind: 'order' }]);
  assert.deepEqual(buildEdits(base, { o2: { start: 'abc' } }, N).issues, [{ code: '3.1', kind: 'date' }]);
  assert.deepEqual(buildEdits(base, { o99: { start: '2026-01-01' } }, N).issues, [{ code: null, kind: 'missing' }]);
  /* Хоёуланг нь цэвэрлэх — null бичнэ */
  assert.deepEqual(buildEdits(base, { o3: { start: '', end: '' } }, N).updates, [{ objectid: 3, gazar_ehleh: null, gazar_duusah: null }]);
  /* Өөрчлөгдсөн талбар л */
  assert.deepEqual(buildEdits(base, { o3: { end: '2026-02-10' } }, N).updates, [{ objectid: 3, gazar_duusah: D('2026-02-10') }]);
}

/* Зэрэг засвар */
{
  const u = [{ objectid: 3, gazar_duusah: D('2026-02-10') }];
  assert.deepEqual(conflicts(base, base, u, N), []);
  assert.deepEqual(conflicts(base, [{ ...base[2], gazar_duusah: D('2026-05-01') }], u, N), ['3.2'], 'өөр хүн зассан');
  assert.deepEqual(conflicts(base, [{ ...base[2], gazar_ehleh: D('2026-05-01') }], u, N), [], 'бичихгүй талбар хамаагүй');
  assert.deepEqual(conflicts(base, [], u, N), ['3.2'], 'мөр устсан');
}

console.log('gazarOgnoo.check: OK');
