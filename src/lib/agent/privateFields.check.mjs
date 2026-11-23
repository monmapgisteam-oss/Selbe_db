/**
 * AI ТУСЛАХЫН ХУВИЙН МЭДЭЭЛЛИЙН ШҮҮЛТ (2026-11-23, аудит №5/№31) — сүлжээгүй (хуурамч `fetch`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/agent/privateFields.check.mjs
 *
 * Хамгаалж буй алдаа: нэгж талбарын давхарга (`land:left`, Gazar_choloololt) иргэний регистр, утас, нэр, хаяг, нөхөх олговор,
 * чөлөөт тайлбар хадгалдаг. `describe_feature` тэдгээрийг жагсаахгүй; `query_feature` тэдгээрийг outFields · groupBy · stats ·
 * orderBy · where-д ашиглахыг татгалзана; `*` / анхдагч талбар нь зөвхөн хувийн бус талбарууд руу буулгагдана.
 * Бусад давхаргад ижил нэртэй талбар (жиш. `name`) хаалттай БИШ.
 */
import assert from 'node:assert/strict';
import { runTool } from '@/lib/agent/tools';

const FIELDS = ['objectid', 'status', 'area_m2', 'person_reg', 'utas', 'first_name', 'овог_1', 'olgovor_niit', 'тайлб', 'тайл_1', 'тайл_2', 'name'];
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const body = new URLSearchParams(String(init?.body ?? ''));
  sent.push({ url: u, outFields: body.get('outFields'), where: body.get('where') });
  const json = u.endsWith('/query')
    ? { features: [{ attributes: { objectid: 1, status: 'x', n: 1 } }] }
    : { fields: FIELDS.map((name) => ({ name, type: name === 'objectid' ? 'esriFieldTypeOID' : 'esriFieldTypeString' })) };
  return { ok: true, status: 200, json: async () => json };
};

let pass = 0;
const ok = (name, cond, detail = '') => { assert.ok(cond, `✗ ${name}${detail ? `\n   ${detail}` : ''}`); console.log('  ✓', name); pass += 1; };
const PRIV = /хувийн мэдээллийн талбар/;
const q = (input) => runTool('query_feature', { id: 'land:left', ...input }, 'all');

try {
  console.log('\n1. describe_feature — хувийн талбаргүй');
  const d = await runTool('describe_feature', { id: 'land:left' }, 'all');
  ok('хэрэгсэл амжилттай', !d.isError, d.text);
  const names = JSON.parse(d.text).fields.map((f) => f.name);
  ok('хувийн бус талбар үлдэнэ', names.includes('status') && names.includes('area_m2'), names.join(','));
  for (const f of ['person_reg', 'utas', 'first_name', 'овог_1', 'olgovor_niit', 'тайлб', 'тайл_1', 'тайл_2', 'name']) {
    ok(`«${f}» жагсаагдахгүй`, !names.includes(f));
  }

  console.log('\n2. query_feature — хувийн талбарыг нэрлэвэл татгалзана');
  const rejects = [
    ['outFields', { outFields: ['utas'] }],
    ['outFields (том үсэг)', { outFields: ['PERSON_REG'] }],
    ['groupBy', { groupBy: 'овог_1', stats: [{ op: 'count', field: 'objectid', as: 'n' }] }],
    ['stats', { stats: [{ op: 'sum', field: 'OLGOVOR_NIIT', as: 's' }] }],
    ['orderBy', { orderBy: 'olgovor_niit DESC' }],
    ['where', { where: "person_reg = 'АА00000000'" }],
    ['where (хашилттай)', { where: '"utas" IS NOT NULL' }],
    ['тайлбар (тайлб)', { outFields: ['тайлб'] }],
    ['тайлбар (тайл_1 groupBy)', { groupBy: 'тайл_1', stats: [{ op: 'count', field: 'objectid', as: 'n' }] }],
  ];
  for (const [label, input] of rejects) {
    sent.length = 0;
    const r = await q(input);
    ok(`${label} → татгалзана`, r.isError && PRIV.test(r.text), r.text);
    ok(`${label} → ArcGIS руу асуулга явахгүй`, !sent.some((s) => s.url.endsWith('/query')));
  }

  console.log('\n3. `*` ба анхдагч outFields — зөвхөн хувийн бус талбар');
  for (const [label, input] of [['*', { outFields: ['*'] }], ['анхдагч', {}]]) {
    sent.length = 0;
    const r = await q({ ...input, limit: 1 });
    ok(`${label}: амжилттай`, !r.isError, r.text);
    const sentQ = sent.find((s) => s.url.endsWith('/query'));
    const asked = String(sentQ?.outFields ?? '').split(',');
    ok(`${label}: ArcGIS руу «*» явахгүй`, !asked.includes('*'), sentQ?.outFields);
    ok(`${label}: хувийн талбар асуугдахгүй`, !asked.some((f) => ['person_reg', 'utas', 'first_name', 'овог_1', 'olgovor_niit', 'тайлб', 'тайл_1', 'тайл_2', 'name'].includes(f)), sentQ?.outFields);
    ok(`${label}: хувийн бус талбар асуугдана`, asked.includes('status'), sentQ?.outFields);
  }

  console.log('\n4. Хувийн бус талбар — хэвийн');
  const g = await q({ groupBy: 'status', stats: [{ op: 'count', field: 'objectid', as: 'n' }] });
  ok('status-аар бүлэглэх → зөвшөөрнө', !g.isError, g.text);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\nprivateFields.check: ${pass} шалгалт — бүгд давлаа`);
