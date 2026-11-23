/**
 * ӨӨРЧЛӨЛТИЙН ТҮҮХ (2026-11-20) — мөрийн хэлбэр ба хүснэгтийн нэр (сүлжээгүй).
 */
import assert from 'node:assert/strict';
import { auditRows, tableName, logAudit } from './auditLog.ts';

assert.equal(tableName('https://x/arcgis/rest/services/Hosted/Guitsetgel_talbe/FeatureServer/182'), 'Guitsetgel_talbe/182');
assert.equal(tableName('https://x/arcgis/rest/services/Hosted/SYS_Selbe_Permissions/FeatureServer/230/'), 'SYS_Selbe_Permissions/230');

const rows = auditRows([
  { table: 'Guitsetgel_talbe/182', oid: 5, op: 'update', values: { objectid: 5, guitsetgel_huvi: 40 } },
  { table: 'Guitsetgel_talbe/185', oid: 9, op: 'delete', values: null },
  { table: 'Guitsetgel_talbe/182', oid: null, op: 'add', values: { tailbar: 'x'.repeat(5000) } },
], 'zohiogch_a', 1700000000000);
/* 2026-11-23: багана бүр нэг мөр — нэг нүдэнд нэг утга */
const H = { ognoo: 1700000000000, hereglegch: 'zohiogch_a' };
assert.equal(rows.length, 3, 'засвар 1 багана (objectid тоологдохгүй) + устгал 1 + нэмэлт 1 багана');
assert.deepEqual(rows[0].attributes, { ...H, husnegt: 'Guitsetgel_talbe/182', oid: 5, uildel: 'update', bagana: 'guitsetgel_huvi', utga: '40' });
assert.deepEqual(rows[1].attributes, { ...H, husnegt: 'Guitsetgel_talbe/185', oid: 9, uildel: 'delete', bagana: null, utga: null }, 'устгалд багана, утга алга');
assert.equal(rows[2].attributes.bagana, 'tailbar');
assert.ok(rows[2].attributes.utga.length <= 3901, 'урт утга тайрагдана');
const many = auditRows([{ table: 't/1', oid: 2, op: 'update', values: { OBJECTID: 2, a: 1, b: null, c: 'x' } }], null, 5);
assert.deepEqual(many.map((r) => [r.attributes.bagana, r.attributes.utga]), [['a', '1'], ['b', null], ['c', 'x']], '3 багана — 3 мөр');

/* Node орчинд (window алга) юу ч илгээхгүй, алдаа шидэхгүй */
assert.doesNotThrow(() => logAudit([{ table: 't', oid: 1, op: 'add', values: {} }]));

console.log('auditLog.check: ✅');
