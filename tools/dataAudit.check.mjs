/**
 * ӨГӨГДЛИЙН АУДИТЫН ЦЭВЭР ХЭСЭГ (2026-11-04) — сүлжээгүй: талбарын тулгалт · каталогийн түлхүүр · `where`-ийн талбар · кран ·
 * зорилтын бүртгэл · тайлан. Амьд ажиллуулалт нь `npm run audit:data`.
 */
import assert from 'node:assert/strict';
import { catalogKey, compareFields } from './audit/schema.mjs';
import { buildTargets, whereFields } from './audit/targets.mjs';
import { craneLinkIssues, comparePlanNegtgel, CROSS_ITEMS } from './audit/cross.mjs';
import { mdTable, summarize, toMarkdown } from './audit/report.mjs';
import { buildTree, computePlan } from '../src/lib/projectPlan.ts';
import { negRowsFromPlan } from '../src/lib/negtgel.ts';

/* compareFields: алга · том/жижиг · төрөл · кодод нэрлээгүй */
const live = [
  { name: 'objectid', type: 'esriFieldTypeOID' },
  { name: 'sar', type: 'esriFieldTypeDateOnly' },
  { name: 'shape__area', type: 'esriFieldTypeDouble' },
  { name: 'extra', type: 'esriFieldTypeString' },
];
const c = compareFields(['objectid', 'sar', 'SHAPE__Area', 'gone'], live, { sar: 'Date', objectid: ['OID', 'Integer'], gone: 'String' });
assert.deepEqual(c.missing, ['gone']);
assert.deepEqual(c.caseDiff, [{ code: 'SHAPE__Area', live: 'shape__area' }]);
assert.deepEqual(c.typeDiff, [{ field: 'sar', expected: 'Date', live: 'DateOnly' }], 'массив төрөл зөв · алга талбарын төрөл шалгагдахгүй');
assert.deepEqual(c.undeclared, ['shape__area', 'extra']);

/* каталогийн түлхүүр: кирилл · кодчилол · давхаргын дугаар · гадны хаяг */
const rest = 'https://x.mn/map/rest/services';
assert.equal(catalogKey(`${rest}/Hosted/${encodeURIComponent('Багц_1')}/SceneServer`, rest), 'hosted/багц_1/sceneserver');
assert.equal(catalogKey(`${rest}/Hosted/A/FeatureServer/3`, rest), 'hosted/a/featureserver');
assert.equal(catalogKey(`${rest}/Ortho/MapServer`, rest), 'ortho/mapserver');
assert.equal(catalogKey('https://other.mn/rest/services/A/MapServer', rest), null);

/* `where`-ийн талбар: мөрийн утгын доторх үг, түлхүүр үг орохгүй */
assert.deepEqual(whereFields("device_id IS NULL"), ['device_id']);
assert.deepEqual(whereFields("torol = 'a = b' AND tuv IN ('x') OR NOT huvi > 3").sort(), ['huvi', 'torol', 'tuv']);
assert.deepEqual(whereFields(null), []);

/* кран: бүсгүй · олон бүстэй · кранаа алдсан бүс · orig_oid хоосон бол oid-оор холбоно */
const f = { link: 'orig_oid', oid: 'objectid', bufferLink: 'orig_fid', dugaar: 'd', tuluv: 't' };
const issues = craneLinkIssues(
  [{ objectid: 1, orig_oid: 10 }, { objectid: 2, orig_oid: null }, { objectid: 3, orig_oid: 30 }, { objectid: 4, orig_oid: 40 }],
  [{ orig_fid: 10 }, { orig_fid: 2 }, { orig_fid: 40 }, { orig_fid: 40 }, { orig_fid: null }],
  f,
);
assert.deepEqual(issues.map((x) => x['төрөл']).sort(), ['orig_oid хоосон', 'бүсгүй кран', 'кранаа алдсан бүс', 'олон бүстэй кран'].sort());

/* бүртгэл: бүрэн байх ёстой гол хүснэгтүүд · давхардалгүй · хоосон хаяггүй */
const targets = buildTargets();
const ids = new Set(targets.map((t) => t.id));
assert.equal(ids.size, targets.length, 'зорилтын id давхцахгүй');
for (const id of ['cf:182', 'ho:185', 'huvaari:186', 'negtgel:187', 'negtgel:190', 'zov:181', 'hyanalt:183', 'perms:230', 'draft:191', 'gazar:152', 'kran:195', 'public:guitsetgel']) {
  assert.ok(ids.has(id), `бүртгэлд алга: ${id}`);
}
assert.ok(targets.length > 300, `зорилт цөөрөв: ${targets.length}`);
assert.ok(targets.every((t) => /^https?:\/\//.test(t.url)), 'бүх хаяг бүтэн');
assert.equal(new Set(CROSS_ITEMS.map((x) => x.id)).size, CROSS_ITEMS.length, 'тулгалтын id давхцахгүй');

/* Серверт байхгүй талбарууд амьд схем/AI бүртгэл рүү дахин орохгүй; хуучин ноорог формат тусдаа. */
for (const id of ['cf:182', 'ds:cashflow2']) {
  const target = targets.find(t => t.id === id);
  for (const field of ['bagts_74', 'urdchilgaa_batalgaa_dun', 'urdchilgaa_huvi', 'urdchilgaa_zh_zardal']) {
    assert.ok(!target.fields.includes(field), `${id}: устсан талбар ${field}`);
  }
}

/* Нөөцийн өөр хувь нь одоогийн дэлгэцийн алдаа БИШ; жин/кодын хөрвүүлэлтийн алдааг харин барина. */
const planTree = buildTree([
  { objectid: 1, dd_kod: '3', ajil_uilchilgee: 'Газар чөлөөлөлт', tusul_ezleh_huvi: 0.4, guitsetgel_huvi: 50 },
  { objectid: 2, dd_kod: '3', ajil_uilchilgee: 'Зөвшөөрөл', tusul_ezleh_huvi: 0.6, guitsetgel_huvi: 20 },
]);
const plan = { tree: planTree, result: computePlan(planTree) };
const same = negRowsFromPlan(plan);
const total = plan.result.values.get(planTree.root).S / 100;
assert.equal(comparePlanNegtgel(plan, same, total).status, 'ok');
const different = same.map(r => ({ ...r, act: 0.8 }));
const legacyDiff = comparePlanNegtgel(plan, different, 0.8);
assert.equal(legacyDiff.status, 'warn');
assert.ok(legacyDiff.rows.some(r => r['төрөл'] === 'НӨӨЦИЙН НИЙТ %'));
const badResult = { ...plan.result, values: new Map(plan.result.values) };
badResult.values.set(planTree.nodes[0], { ...badResult.values.get(planTree.nodes[0]), G: 80 });
assert.equal(comparePlanNegtgel({ ...plan, result: badResult }, same, total).status, 'diff', 'дэлгэцийн жин үндсэн нийлбэрээс зөрвөл алдаа хэвээр');

/* тайлан: мөрийн хязгаар · `|` · дүгнэлт · мэдэгдэж буйг нуухгүй */
const t = mdTable([{ a: 'x|y', b: null }, { a: 2, c: { k: 1 } }], 1);
assert.match(t, /x\\\|y/);
assert.match(t, /нийт 2 мөр/);
assert.equal(mdTable([]), '');
const result = {
  meta: { reads: 5, writesBlocked: 0 },
  cross: [{ id: 'a', title: 'А', status: 'diff', n: 1, rows: [{ төрөл: 'т', known: true }], note: 'н' }, { id: 'b', title: 'Б', status: 'ok', n: 0, rows: [] }],
  schema: {
    targets: [{ id: 'x', group: 'g', status: 'fail', missing: ['m'] }, { id: 'y', group: 'g', status: 'skip', note: 'эрхгүй' }],
    sheets: [],
    roots: [{ root: 'r', status: 'warn', total: 1, absent: [], extra: ['1:n'] }],
  },
};
assert.deepEqual(
  (({ diff, ok, schemaFail, schemaWarn, schemaSkip }) => ({ diff, ok, schemaFail, schemaWarn, schemaSkip }))(summarize(result)),
  { diff: 1, ok: 1, schemaFail: 1, schemaWarn: 1, schemaSkip: 1 },
);
const md = toMarkdown(result);
for (const needle of ['бичих оролдлого: 0', '### А', 'known', '| fail | x |', 'эрхгүй', '1:n']) assert.ok(md.includes(needle), `тайланд алга: ${needle}`);

console.log('✅ dataAudit — талбарын тулгалт · каталог · where · кран · бүртгэл · тайлан');
