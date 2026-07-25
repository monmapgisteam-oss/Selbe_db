/**
 * `zoneKey` шалгах — Хөрөнгө оруулалтын хүснэгтийн бохир бүсийн код ЕТ-ийн
 * `ZONE_ID` рүү зөв хөрвөж байгаа эсэх. Ажиллуулах:
 *
 *   node tools/check_zonekey.mjs
 *
 * ponytail: тестийн фрэймворк алга — `services.ts` нь импортгүй тул tsc-ээр
 * дангаар нь хөрвүүлээд assert хийхэд хангалттай.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'selbe-'));
execSync(`npx tsc src/lib/services.ts --outDir ${out} --module esnext --target es2022 --moduleResolution bundler`, { stdio: 'inherit' });
const { zoneKey, bagtsKey, investType, CASHFLOW, BUILDING, INVEST } = await import(join(out, 'services.js'));

const query = async (url, field) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', where: '1=1', outFields: field, returnGeometry: 'false' }),
  });
  return (await res.json()).features.map((f) => f.attributes[field]);
};

for (const [raw, want] of [
  ['А-14 ', 'A-14'],   // кирилл А + сүүлийн зай
  ['С-7.1', 'C-7.1'],  // кирилл С
  ['B-2-1', 'B-2.1'],  // дэд бүсийг зураасаар
  ['D-11-1', 'D-11.1'],
  ['E-5-1', 'E-5.1'],
  ['A-5', 'A-5'],      // аль хэдийн цэвэр — өөрчлөгдөхгүй
  ['1', '1'],          // бүс биш (инженерийн эгнээний дугаар) — ямар ч ZONE_ID-д таарахгүй
  [null, ''],
]) assert.equal(zoneKey(raw), want, `zoneKey(${JSON.stringify(raw)})`);

console.log('zoneKey OK');

/**
 * Багцын нэгтгэл ЖИВЭЭР шалгана: санхүү («Багц-4.1») ба блокийн («Багц 4.1»)
 * бичиглэл `bagtsKey`-ээр 1:1 таарах ёстой. Эх өгөгдөлд нэр өөрчлөгдвөл
 * «Багцын мэдээлэл» карт ЧИМЭЭГҮЙ хоосон мөр гаргана — тиймээс амьдаар шалгана.
 */
const fetchKeys = async (url, field) => new Set((await query(url, field)).map(bagtsKey));
const cashKeys = await fetchKeys(CASHFLOW.url, CASHFLOW.fields.zone);
const blockKeys = await fetchKeys(BUILDING.url, BUILDING.fields.bagts);
const orphans = [...cashKeys].filter((k) => !blockKeys.has(k));
assert.deepEqual(orphans, [], `санхүүгийн багц блоктой таарсангүй: ${orphans}`);
assert.equal(cashKeys.size, blockKeys.size, `багцын тоо зөрөв: ${cashKeys.size} ↔ ${blockKeys.size}`);
console.log(`bagtsKey OK — ${cashKeys.size} багц нэгдэв`);

/**
 * Хөрөнгө оруулалтын ТӨРӨЛ бүр богино нэртэй эсэх. Шинэ төрөл нэмэгдвэл диаграмд
 * бүтэн ТОМ үсэгтэй урт нэрээрээ буцаж орох тул энд барина.
 */
const types = new Set(await query(INVEST.url, INVEST.fields.type));
const unnamed = [...types].filter((t) => !investType(t));
assert.deepEqual(unnamed, [], `богино нэргүй төрөл: ${unnamed}`);
console.log(`investType OK — ${types.size} төрөл`);

/**
 * Бүсийн давхарга ↔ бусад давхаргын холбоос. Шинэ бүсийн үйлчилгээ
 * (`busiin_medeelel_final`) `RefName_1` талбартай, бичиглэл нь зөрдөг тул
 * `zoneWhere`-ийн угсарсан SQL хоёр талдаа БОДИТООР мөр буцаахыг шалгана.
 */
const { ZONE_LAYER, BUILT_LAYER, zoneCanon, zoneRefValues, zoneWhere, layerUrl, ZONE_FIELDS, zoneType } =
  await import(join(out, 'services.js'));

const zoneRows = await query(layerUrl(ZONE_LAYER), ZONE_FIELDS.id);
const builtZones = await query(layerUrl(BUILT_LAYER), 'ZONE_ID');

const zoneIds = [...new Set(zoneRows.map(zoneCanon))].filter(Boolean);
assert.ok(zoneIds.length >= 55, `бүсийн код цөөдсөн: ${zoneIds.length}`);

// Бүс бүрийн WHERE бүсийн давхаргад мөр олох ёстой
for (const id of zoneIds) {
  const w = zoneWhere(ZONE_LAYER, id);
  assert.ok(w.includes(ZONE_FIELDS.id), `буруу талбар: ${w}`);
  assert.ok(zoneRefValues(id).some((v) => zoneRows.some((r) => String(r) === v)),
    `${id}: бүсийн давхаргад таарах бичиглэл алга (${w})`);
}

// Барилгын бүсийн код бүр (мэдээлэлгүйгээс бусад) бүсийн давхаргад буух ёстой
const orphanBuilt = [...new Set(builtZones.map((z) => String(z ?? '').trim()))]
  .filter((z) => z && !z.includes('байхгүй'))
  .filter((z) => !zoneRefValues(z).some((v) => zoneRows.some((r) => String(r) === v)));
assert.deepEqual(orphanBuilt, [], `бүсэд буугаагүй барилгын код: ${orphanBuilt}`);
console.log(`zoneWhere OK — ${zoneIds.length} бүс, барилгын бүх код холбогдов`);

// Ангилал бүр каноник нэртэй эсэх — палитр ба нягтшилын норм үүн дээр тогтоно
const rawTypes = [...new Set(await query(layerUrl(ZONE_LAYER), ZONE_FIELDS.type))];
const unmapped = rawTypes.filter((t) => zoneType(t) === String(t ?? '').trim() && String(t ?? '').trim() !== '');
assert.deepEqual(unmapped, [], `каноник нэргүй ангилал: ${unmapped}`);
console.log(`zoneType OK — ${rawTypes.length} ангилал`);
