/**
 * zoneWhere — бүсийн WHERE-ийн литерал (2026-09-30 төслийн аудит).
 * Кирилл утгад `N'…'` угтвар (ArcGIS-ийн Юникод дүрэм), латин код угтваргүй.
 */
import assert from 'node:assert/strict';
const { zoneWhere, LAYERS } = await import('@/lib/services.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

const zoned = LAYERS.find((l) => !l.noZone && !l.zoneField);
assert.ok(zoned, 'бүсээр шүүгддэг давхарга олдсонгүй');

ok('латин код угтваргүй', () => {
  const w = zoneWhere(zoned, 'A-14');
  assert.ok(w && w.includes("'A-14'") && !w.includes("N'A-14'"), w);
});
ok('кирилл утга N\'…\' угтвартай, латин нь хэвээр', () => {
  const w = zoneWhere(zoned, 'Багц-1');
  assert.ok(w && /N'Багц-1'/.test(w), w);
  assert.ok(!/(^|[^N])'Багц-1'/.test(w), `угтваргүй кирилл литерал үлдсэн: ${w}`);
});
ok('дотоод апостроф хоёрлогдоно', () => {
  const w = zoneWhere(zoned, "О'Нийл");
  assert.ok(w && w.includes("N'О''Нийл'"), w);
});
ok('noZone давхаргад null', () => {
  const nz = LAYERS.find((l) => l.noZone);
  if (nz) assert.equal(zoneWhere(nz, 'A-14'), null);
});

console.log(`zoneWhere: ${n} шалгуур ✅`);
