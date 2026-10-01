/**
 * АГЕНТЫН `where` — ЮНИКОД ЛИТЕРАЛЫН `N'…'` УГТВАР (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/agent/where.check.mjs
 *
 * Хамгаалж буй алдаа: CLAUDE.md-ийн ArcGIS дүрэм «Юникод мөр: `N'…'` угтвар» — угтваргүй
 * кирилл харьцуулалт зарим үйлчилгээнд алдаагүйгээр 0 мөр буцаадаг. Агентын
 * `query_feature`-ийн `where`-ийг загвар өөрөө бичдэг бөгөөд зааврын жишээ угтваргүй
 * (`ZONE_ID = 'Багц-1'`) байсан → «0 барилга» гэх мэт худал тоо.
 *
 * ⚠️ Сүлжээгүй: `globalThis.fetch`-ийг орлуулж ArcGIS руу ЯВСАН биеийг шалгана.
 */
import assert from 'node:assert/strict';
import { nPrefixUnicode, runTool } from '@/lib/agent/tools';

let pass = 0;
const eq = (name, got, want) => {
  assert.equal(got, want, `✗ ${name}\n   got:  ${got}\n   want: ${want}`);
  console.log('  ✓', name);
  pass += 1;
};

console.log('\n1. nPrefixUnicode — зөвхөн угтваргүй ASCII бус литерал');
eq('кирилл → N угтвар', nPrefixUnicode("ZONE_ID = 'Багц-1'"), "ZONE_ID = N'Багц-1'");
eq('аль хэдийн N — хэвээр', nPrefixUnicode("ZONE_ID = N'Багц-1'"), "ZONE_ID = N'Багц-1'");
eq('жижиг n — хэвээр', nPrefixUnicode("ZONE_ID = n'Багц-1'"), "ZONE_ID = n'Багц-1'");
eq('латин литерал — хэвээр', nPrefixUnicode("ZONE_ID = 'B-1'"), "ZONE_ID = 'B-1'");
eq('огнооны литерал — хэвээр', nPrefixUnicode("d >= timestamp '2026-09-01 00:00:00'"), "d >= timestamp '2026-09-01 00:00:00'");
eq('IN (…) — литерал бүр', nPrefixUnicode("t IN ('Гэр','Barilga', N'Зам')"), "t IN (N'Гэр','Barilga', N'Зам')");
eq('LIKE — кирилл хэв', nPrefixUnicode("name LIKE '%Сургууль%'"), "name LIKE N'%Сургууль%'");
eq("дотоод '' хашилт литералын нэг хэсэг", nPrefixUnicode("a = 'Хан''ын' AND b = 'x'"), "a = N'Хан''ын' AND b = 'x'");
eq('хоосон литерал — хэвээр', nPrefixUnicode("a = '' OR a = 'Ү'"), "a = '' OR a = N'Ү'");
eq('мөрийн эхэнд литерал', nPrefixUnicode("'Өмнөд' = z"), "N'Өмнөд' = z");
eq('N-ээр төгссөн багана (SECTION=) — литерал нь угтвар БИШ', nPrefixUnicode("SECTION='Хойд'"), "SECTION=N'Хойд'");
eq('1=1 — хэвээр', nPrefixUnicode('1=1'), '1=1');

console.log('\n2. query_feature — ArcGIS руу ЯВСАН where угтвартай');
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init) => {
  const body = new URLSearchParams(String(init?.body ?? ''));
  sent.push({ url: String(url), where: body.get('where') });
  /* Давхаргын мета (`fieldsOf`) — талбарууд; асуулга — нэг мөр статистик */
  const json = String(url).endsWith('/query')
    ? { features: [{ attributes: { n: 3 } }] }
    : { fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }, { name: 'ZONE_ID', type: 'esriFieldTypeString' }] };
  return { ok: true, status: 200, json: async () => json };
};
try {
  const out = await runTool('query_feature', {
    id: 'zone',
    where: "ZONE_ID = 'Багц-1'",
    stats: [{ op: 'count', field: 'OBJECTID', as: 'n' }],
  }, 'all');
  assert.ok(!out.isError, `хэрэгсэл унав: ${out.text}`);
  const q = sent.find((s) => s.url.endsWith('/query'));
  assert.ok(q, 'асуулга явсангүй');
  eq('ArcGIS руу явсан where', q.where, "ZONE_ID = N'Багц-1'");
  eq('хариунд буцаасан where (загварт харагдах)', JSON.parse(out.text).where, "ZONE_ID = N'Багц-1'");
} finally {
  globalThis.fetch = realFetch;
}

console.log('\n3. zone_overview — `zoneWhere`-ийн кирилл бүс ч угтвартай явна');
sent.length = 0;
globalThis.fetch = async (url, init) => {
  const body = new URLSearchParams(String(init?.body ?? ''));
  sent.push({ url: String(url), where: body.get('where') ?? '' });
  /* тоолол — нэг мөр; бүлэглэл (датасетын багцын утгууд) — хоосон */
  const json = body.get('groupByFieldsForStatistics') ? { features: [] } : { features: [{ attributes: { n: 2, q: 1 } }] };
  return { ok: true, status: 200, json: async () => json };
};
try {
  const out = await runTool('zone_overview', { zone: 'Багц-3.2' }, 'all');
  assert.ok(!out.isError, `zone_overview унав: ${out.text}`);
  const cyr = sent.filter((s) => /[А-Яа-яӨөҮү]/.test(s.where));
  assert.ok(cyr.length > 0, 'кирилл бүсээр шүүсэн асуулга явсангүй — шалгуур хоосон');
  const bad = cyr.filter((s) => nPrefixUnicode(s.where) !== s.where);
  eq(`кирилл литерал бүгд N угтвартай (${cyr.length} асуулга)`, bad.map((s) => s.where).join(' | '), '');
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\nagent where: ${pass} шалгалт амжилттай.`);
