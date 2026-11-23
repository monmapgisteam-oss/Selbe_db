/**
 * ТЭЭВЭР-ИДЭВХИЙН ТООЦООЛОЛ — ЖИВЭЭР шалгана.
 *   node src/lib/analysis/transport.check.mjs
 *
 * Газрын зураг дээрх `barilga` (et:24)-ийг татаж, барилга бүрийг 7 ангилалд
 * хуваан, өглөөний оргил цагийн хүн-зорчилт ба тээврийн хуваарийг тооцно.
 *
 * 2026-11-23 (аудит №46): өмнө нь `transport.ts` · `roadDemand` · `busAccess` · `traffic`-ийн
 * ХУУЛБАР логикийг шалгадаг байв (жинхэнэ модуль эвдэрсэн ч ногоон). Одоо ЖИНХЭНЭ экспортуудыг
 * (`loadBuildings` · `loadPathsFrom` · `loadBusStops` · `assignRoadDemand` · `busAccess`) дуудна.
 */
import assert from 'node:assert/strict';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const { SELBE_ET } = await import('@/lib/services.ts');
const {
  CAT_LABEL, MODE_SPLIT, CAR_OCCUPANCY, ROAD_MAX_DIST_M, ROAD_WEIGHTS, BUS_GOOD_M, BUS_OK_M,
  TRIP_COEF, vehicleTrips, busBand, classifyBuilding, buildingTrips,
} = await import('@/lib/analysis/transport.ts');
const { loadBuildings } = await import('@/modules/analysis/suit/buildings.ts');
const { loadPathsFrom, WM_UNITS_PER_M } = await import('@/modules/analysis/suit/roadNet.ts');
const { loadBusStops, busAccess } = await import('@/modules/analysis/suit/busAccess.ts');
const { assignRoadDemand } = await import('@/modules/analysis/suit/roadDemand.ts');
const { distToPath } = await import('@/modules/analysis/suit/traffic.ts');

/** «Замын тэнхлэг» (et:5) */
const ROAD_URL = `${SELBE_ET}/102`;

const CATS = ['residential', 'school', 'kindergarten', 'hospital', 'office', 'service', 'other'];

/* ── Жинхэнэ функцийн сүлжээгүй баталгаа ── */
assert.equal(classifyBuilding('Орон сууц'), 'residential');
assert.equal(classifyBuilding('Ерөнхий боловсролын сургууль'), 'school');
assert.equal(classifyBuilding(''), 'other');
assert.equal(buildingTrips('residential', 100, 999), 100 * TRIP_COEF.residential, 'орон сууц зөвхөн хүн амаар');
assert.equal(buildingTrips('school', 999, 100), 100 * TRIP_COEF.school, 'бусад нь багтаамжаар');
assert.equal(busBand(BUS_GOOD_M), 'good');
assert.equal(busBand(BUS_OK_M), 'ok');
assert.equal(busBand(BUS_OK_M + 1), 'poor');
assert.ok(Math.abs(distToPath([0, 1], [[-1, 0], [1, 0]]) - 1) < 1e-9, 'distToPath');

/* ── Тооцоо (жинхэнэ ачаалагч) ── */
const blds = await loadBuildings();
assert.ok(blds.length > 0, 'барилга татагдсангүй');

const agg = Object.fromEntries(CATS.map((c) => [c, { count: 0, pop: 0, cap: 0, trips: 0 }]));
let totalTrips = 0;
const unknown = new Set();

for (const b of blds) {
  assert.equal(b.cat, classifyBuilding(b.purpose), `${b.oid}: ангилал зөрөв`);
  assert.ok(Math.abs(b.trips - buildingTrips(b.cat, b.population, b.capacity)) < 1e-9, `${b.oid}: зорчилт зөрөв`);
  assert.ok(Math.abs(b.vehTrips - vehicleTrips(b.trips)) < 1e-9, `${b.oid}: машин-зорчилт зөрөв`);
  const g = agg[b.cat];
  g.count++; g.pop += b.population; g.cap += b.capacity; g.trips += b.trips;
  totalTrips += b.trips;
  if (b.cat === 'other' && b.purpose) unknown.add(b.purpose);
}

/* ── Тайлан ── */
console.log(`transport.check: ${blds.length} барилга · нийт хүн-зорчилт ${Math.round(totalTrips).toLocaleString('en-US')}/оргил цаг\n`);
console.log('Ангилал            | Тоо  | Хүн ам | Багтаамж | Хүн-зорчилт');
console.log('-------------------|------|--------|----------|------------');
for (const c of CATS) {
  const g = agg[c];
  console.log(
    `${CAT_LABEL[c].padEnd(18)} | ${String(g.count).padStart(4)} | ${String(Math.round(g.pop)).padStart(6)} | ${String(Math.round(g.cap)).padStart(8)} | ${String(Math.round(g.trips)).padStart(11)}`,
  );
}

const car = totalTrips * MODE_SPLIT.car;
console.log('\nТээврийн хуваарь (өглөөний оргил):');
console.log(`  Автомашин   ${Math.round(car).toLocaleString('en-US')} хүн → ${Math.round(car / CAR_OCCUPANCY).toLocaleString('en-US')} машин`);
console.log(`  Нийтийн т.  ${Math.round(totalTrips * MODE_SPLIT.transit).toLocaleString('en-US')} хүн`);
console.log(`  Явган       ${Math.round(totalTrips * MODE_SPLIT.walk).toLocaleString('en-US')} хүн`);
console.log(`  Дугуй       ${Math.round(totalTrips * MODE_SPLIT.bike).toLocaleString('en-US')} хүн`);

/* ── Батламжууд ── */
assert.ok(Math.abs(MODE_SPLIT.car + MODE_SPLIT.transit + MODE_SPLIT.walk + MODE_SPLIT.bike - 1) < 1e-9, 'тээврийн хуваарь 1.0 болохгүй байна');
assert.ok(agg.residential.pop > 0, 'орон сууцны хүн ам 0');
assert.ok(agg.residential.trips > 0, 'орон сууцны зорчилт 0');
// Орон сууц зөвхөн Population ашиглана (Capacity нь зорчилтод орохгүй)
assert.ok(Math.abs(agg.residential.trips - agg.residential.pop * 0.35) < 1, 'орон сууцны зорчилт томьёотой таарахгүй');

if (unknown.size) {
  console.log(`\n⚠️ «Бусад»-т орсон зориулалтын утгууд (${unknown.size}):`);
  for (const u of [...unknown].sort()) console.log('   - ' + u);
}

/* ══════════════════ Phase 2 — замын эрэлт (`assignRoadDemand`) ══════════════════ */

const roads = await loadPathsFrom(ROAD_URL);
assert.ok(roads.length > 0, 'замын шугам татагдсангүй');

/* Зөвхөн `assignRoadDemand`-ын уншдаг талбарууд (`edges[].pts/dup`, `unitsPerMeter`) */
const net = { edges: roads.map((pts) => ({ pts })), unitsPerMeter: WM_UNITS_PER_M };
const rd = assignRoadDemand(net, blds);

const totalVeh = vehicleTrips(totalTrips);
const unlinkedVeh = rd.unlinked.reduce((s, i) => s + blds[i].vehTrips, 0);
const distsM = rd.links.filter(Boolean).map((l) => l.distsM[0]);
let loadedRoads = 0;
for (const v of rd.edgeDemand) if (v > 0) loadedRoads++;
const median = distsM.length ? distsM.slice().sort((x, y) => x - y)[Math.floor(distsM.length / 2)] : 0;

console.log('\nЗамын эрэлт (Phase 2):');
console.log(`  Замын шугам           ${roads.length.toLocaleString('en-US')} (эрэлт орсон нь ${loadedRoads.toLocaleString('en-US')})`);
console.log(`  Замд холбогдсон       ${distsM.length} / ${blds.length} барилга`);
console.log(`  Холбогдоогүй (зорчилттой) ${rd.unlinked.length} барилга · ${Math.round(unlinkedVeh).toLocaleString('en-US')} машин`);
console.log(`  Хуваарилагдсан        ${Math.round(rd.assigned).toLocaleString('en-US')} / ${Math.round(totalVeh).toLocaleString('en-US')} машин`);
console.log(`  Ойрын зам хүртэл      медиан ${Math.round(median)} м · дээд ${Math.round(Math.max(...distsM))} м`);
console.log(`  Хамгийн ачаалалтай зам ${Math.round(rd.max).toLocaleString('en-US')} машин/ц`);

/* ── Батламжууд ── */
// НИЙЛБЭР ХАДГАЛАГДАНА: хуваарилагдсан + холбогдоогүй = нийт машин-зорчилт
assert.ok(
  Math.abs(rd.assigned + unlinkedVeh - totalVeh) < 1,
  `машин-зорчилт алдагдсан: ${rd.assigned.toFixed(2)} + ${unlinkedVeh.toFixed(2)} ≠ ${totalVeh.toFixed(2)}`,
);
const edgeSum = rd.edgeDemand.reduce((a, b) => a + b, 0);
assert.ok(Math.abs(edgeSum - rd.assigned) < 1e-6, 'ирмэгийн эрэлтийн нийлбэр ≠ хуваарилагдсан');
assert.ok(rd.max > 0, 'ямар ч замд эрэлт оногдоогүй');
assert.ok(Math.max(...distsM) <= ROAD_MAX_DIST_M + 1e-6, 'зайн босго зөрчигдсөн');
assert.ok(rd.links.every((l) => l == null || l.edges.length <= ROAD_WEIGHTS.length), 'нэг барилга 3-аас олон замд');
assert.ok(Math.abs(ROAD_WEIGHTS.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'замын жин 1.0 болохгүй байна');

if (rd.unlinked.length) {
  console.log(`\n⚠️ ${ROAD_MAX_DIST_M} м дотор зам олдоогүй, зорчилт үүсгэдэг барилга (${rd.unlinked.length}):`);
  for (const i of rd.unlinked.slice(0, 12)) {
    console.log(`   - ${blds[i].purpose || '—'} · ${CAT_LABEL[blds[i].cat]}`);
  }
  if (rd.unlinked.length > 12) console.log(`   … нийт ${rd.unlinked.length}`);
}

/* ══════════════════ Phase 3 — автобусны хүртээмж (`busAccess`) ══════════════════ */

const stops = await loadBusStops();
assert.ok(stops.length > 0, 'автобусны буудал татагдсангүй');

const ba = busAccess(blds, stops, WM_UNITS_PER_M);
const bldByBand = { good: 0, ok: 0, poor: 0 };
for (const a of ba.access) bldByBand[a.band]++;
const resPop = agg.residential.pop;
const pct = (v) => (resPop > 0 ? Math.round((v / resPop) * 100) : 0);

console.log('\nАвтобусны хүртээмж (Phase 3):');
console.log(`  Буудал                ${stops.length}`);
console.log(`  ≤${BUS_GOOD_M} м (сайн)        ${String(ba.popByBand.good).padStart(6)} хүн (${pct(ba.popByBand.good)}%) · ${bldByBand.good} барилга`);
console.log(`  ${BUS_GOOD_M}–${BUS_OK_M} м (боломжийн) ${String(ba.popByBand.ok).padStart(6)} хүн (${pct(ba.popByBand.ok)}%) · ${bldByBand.ok} барилга`);
console.log(`  >${BUS_OK_M} м (дутмаг)      ${String(ba.popByBand.poor).padStart(6)} хүн (${pct(ba.popByBand.poor)}%) · ${bldByBand.poor} барилга`);
console.log(`  Хамгийн ачаалалтай буудал ${Math.round(ba.maxStopDemand).toLocaleString('en-US')} зорчигч/ц`);

/* ── Батламжууд ── */
// Зурвасын хүн ам нийлээд ОРОН СУУЦНЫ нийт хүн амыг өгнө (давхардал/алдагдалгүй)
assert.ok(
  Math.abs(ba.popByBand.good + ba.popByBand.ok + ba.popByBand.poor - agg.residential.pop) < 1e-6,
  'зурвасын хүн амын нийлбэр орон сууцны хүн амтай таарахгүй',
);
assert.equal(bldByBand.good + bldByBand.ok + bldByBand.poor, blds.length, 'барилга зурваст бүрэн хуваарилагдаагүй');
for (const a of ba.access) assert.equal(a.band, busBand(a.distM), 'зурвас зайтайгаа таарахгүй');
// Буудлын эрэлтийн нийлбэр = нийт зорчилт × нийтийн тээврийн хувь
const stopSum = ba.stopDemand.reduce((a, b) => a + b, 0);
assert.ok(
  Math.abs(stopSum - totalTrips * MODE_SPLIT.transit) < 1,
  `буудлын эрэлт алдагдсан: ${stopSum.toFixed(2)} ≠ ${(totalTrips * MODE_SPLIT.transit).toFixed(2)}`,
);

console.log('\ntransport.check: ok');
