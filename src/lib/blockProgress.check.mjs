/**
 * blockProgress-ийн ТҮЛХҮҮР ЖИШИХИЙГ шалгана (амьд үйлчилгээ рүү).
 *   node src/lib/blockProgress.check.mjs
 *
 * Хамгаалж буй алдаа: блокийн нэр багц бүрд давтагддаг («5/1» долоон багцад)
 * бөгөөд багцын нэр гурван эх сурвалжид гурван янз бичигдсэн. Түлхүүр буруу
 * бол барилга өөр барилгын гүйцэтгэлийг зүүнэ.
 */
import assert from 'node:assert/strict';

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';
const SHEET = `${HJ}/Selbe_guitsetgel_consolidated/FeatureServer/0`;
const BLDG = `${HJ}/building_GOL_barigdaj_ehelsen/FeatureServer/2`;
const MASTER = `${HJ}/Tusliin_guitsetgel_master/FeatureServer/0`;

// services.ts-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const buildingKey = (b, k) => `${bagtsKey(b)}|${blockKey(k)}`;

const q = async (url, params) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ returnGeometry: 'false', f: 'json', ...params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []).map((f) => f.attributes);
};

// 1. Гурван эх сурвалжийн багцын нэр НЭГ түлхүүр рүү буулна.
assert.equal(bagtsKey('Багц 4.1'), bagtsKey('Багц 4-1'), 'давхарга ↔ хүснэгт');
assert.equal(bagtsKey('Багц 4.1'), bagtsKey('БАГЦ-4-1'), 'давхарга ↔ master');
assert.equal(bagtsKey('Багц 1'), 'БАГЦ1');
assert.equal(blockKey('5/1 барилга'), '5/1');
assert.equal(blockKey('5/1 блок'), '5/1');
// ...харин ӨӨР багц ХЭЗЭЭ Ч нийлэхгүй.
assert.notEqual(buildingKey('Багц 1', '5/1 барилга'), buildingKey('Багц 2', '5/1 барилга'));

// 2. Б. мөрөөс блокийн гүйцэтгэл — нүд бүрээр сүүлийн огноо.
const rows = await q(SHEET, {
  where: "dugaar='Б.' AND barilga_blok IS NOT NULL",
  outFields: 'bagts,ognoo,barilga_blok,guitsetgel',
  resultRecordCount: '2000',
});
const prog = new Map();
for (const r of rows) {
  if (r.guitsetgel == null || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.ognoo))) continue;
  const k = buildingKey(r.bagts, r.barilga_blok);
  const p = prog.get(k);
  if (!p || p.date < r.ognoo) prog.set(k, { overall: r.guitsetgel * 100, date: r.ognoo });
}

// Excel-ийн Б. мөр (Багц 1 · 2026-07-05) — дэлгэц дээрх утгууд.
assert.equal(Math.round(prog.get('БАГЦ1|5/1').overall), 21);
assert.equal(Math.round(prog.get('БАГЦ1|5/5').overall), 19);
assert.equal(Math.round(prog.get('БАГЦ1|5/7').overall), 0, '0% нь «мэдээлэлгүй» БИШ');
assert.equal(Math.round(prog.get('БАГЦ1|29/3').overall), 7);
// Ижил нэртэй боловч өөр багцын барилга — өөр утга (нийлээгүйн баталгаа).
assert.notEqual(prog.get('БАГЦ1|5/1').overall, prog.get('БАГЦ2|5/1').overall);

// 3. Давхаргын БҮХ барилга түлхүүрээрээ таарна (Багц 4.2-оос бусад нь).
const blds = await q(BLDG, { where: '1=1', outFields: 'BAGTS,BLOK', resultRecordCount: '2000' });
const miss = blds.filter((b) => !prog.has(buildingKey(b.BAGTS, b.BLOK)));
const missBagts = [...new Set(miss.map((m) => m.BAGTS))].sort();
console.log(`давхарга ${blds.length} барилга · таараагүй ${miss.length}:`,
  miss.map((m) => `${m.BAGTS}/${m.BLOK}`).join(', ') || '—');
// Багц 4.2 нэгтгэсэн хүснэгтэд ОГТ байхгүй; Багц 1-д давхардсан «29/1» бий.
assert.deepEqual(missBagts, ['Багц 4.2'], `гэнэтийн таарахгүй багц: ${missBagts}`);

// 4. master-ийн Багц ч мөн адил түлхүүрт буулна (самбарын задаргаа тэндээс).
const mb = await q(MASTER, {
  where: '1=1', outFields: 'Багц',
  groupByFieldsForStatistics: 'Багц',
  outStatistics: '[{"statisticType":"count","onStatisticField":"ObjectID","outStatisticFieldName":"n"}]',
});
const known = new Set(blds.map((b) => bagtsKey(b.BAGTS)));
for (const r of mb) assert.ok(known.has(bagtsKey(r['Багц'])), `master багц танигдсангүй: ${r['Багц']}`);

console.log(`ok · ${prog.size} барилгын Б. гүйцэтгэл, ${mb.length} master багц таарав`);
