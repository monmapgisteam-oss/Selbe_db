/**
 * ТЭЭВЭР-ИДЭВХИЙН ТООЦООЛОЛ — ЖИВЭЭР шалгана.
 *   node src/lib/analysis/transport.check.mjs
 *
 * Газрын зураг дээрх `barilga` (et:24)-ийг татаж, барилга бүрийг 7 ангилалд
 * хуваан, өглөөний оргил цагийн хүн-зорчилт ба тээврийн хуваарийг тооцно.
 *
 * ⚠️ Логик нь `transport.ts`-ийн ХУУЛБАР (node TS уншихгүй) — тэндээ өөрчилвөл
 * ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

const URL =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_ET_20260721/FeatureServer/24';
/** «Замын тэнхлэг» — `roadNet.ts`-ийн эх сурвалж (et:5) */
const ROAD_URL =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_ET_20260721/FeatureServer/5';
/** «Автобус_буудал» — `busAccess.ts`-ийн эх сурвалж (et:2) */
const BUS_URL =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_ET_20260721/FeatureServer/2';

/* ── transport.ts-ийн хуулбар логик ── */
const F = { purpose: 'Зориулалт_m', population: 'Population', capacity: 'Huchin_chadal' };

const CATS = ['residential', 'school', 'kindergarten', 'hospital', 'office', 'service', 'other'];
const CAT_LABEL = {
  residential: 'Орон сууц', school: 'Сургууль', kindergarten: 'Цэцэрлэг',
  hospital: 'Эмнэлэг', office: 'Оффис', service: 'Худалдаа, үйлчилгээ', other: 'Бусад',
};

function classify(purpose) {
  const s = String(purpose ?? '').toLowerCase().trim();
  if (!s) return 'other';
  if (/орон сууц|house/.test(s)) return 'residential';
  if (/сургууль/.test(s)) return 'school';
  if (/цэцэрлэг/.test(s)) return 'kindergarten';
  if (/эмнэлэг/.test(s)) return 'hospital';
  if (/оффис|цагдаа|холбоо мэдээ|төрийн/.test(s)) return 'office';
  if (/худалдаа|үйлчилгээ|зах|спорт|ахмад|хүүхэд|үзвэр/.test(s)) return 'service';
  return 'other';
}

const TRIP_COEF = {
  residential: 0.35, school: 0.90 * 0.75, kindergarten: 0.90 * 0.80,
  hospital: 0.75 * 0.30, office: 0.80 * 0.60, service: 0.65 * 0.45, other: 0,
};
const buildingTrips = (cat, pop, cap) =>
  (cat === 'residential' ? Math.max(0, pop) : Math.max(0, cap)) * TRIP_COEF[cat];

const MODE_SPLIT = { car: 0.35, transit: 0.40, walk: 0.20, bike: 0.05 };
const CAR_OCCUPANCY = 1.4;

const vehicleTrips = (personTrips) => (personTrips * MODE_SPLIT.car) / CAR_OCCUPANCY;

/* ── Замын эрэлт (`roadDemand.ts`-ийн хуулбар) ── */
const ROAD_MAX_DIST_M = 150;
const ROAD_WEIGHTS = [0.5, 0.3, 0.2];
/** Web Mercator нэгж / бодит метр Сэлбэгийн өргөрөгт (`roadNet.WM_UNITS_PER_M`) */
const WM_UNITS_PER_M = 1 / Math.cos((47.9674 * Math.PI) / 180);

const n = (v) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/* ── Живэ өгөгдөл татах (2000-ийн хязгаарыг offset-оор давна) ── */
async function fetchAll() {
  const out = [];
  let offset = 0;
  for (;;) {
    // ⚠️ Полигоны оронд ТӨВ ЦЭГ (`returnCentroid`) — замд хуваарилахад л хэрэгтэй.
    //    Web Mercator (3857)-оор авна: замын геометртэй нэг систем.
    const q = `${URL}/query?where=1%3D1&outFields=${encodeURIComponent(`${F.purpose},${F.population},${F.capacity}`)}` +
      `&returnGeometry=false&returnCentroid=true&outSR=3857&resultOffset=${offset}&resultRecordCount=2000&f=json`;
    const r = await fetch(q);
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    const feats = j.features ?? [];
    // Төв цэгийг атрибутын хажууд `__x/__y`-ээр авч явна (доорх код `a[F...]` уншина)
    out.push(...feats.map((f) => ({
      ...f.attributes,
      __x: f.centroid?.x ?? null,
      __y: f.centroid?.y ?? null,
    })));
    if (feats.length < 2000) break;
    offset += 2000;
  }
  return out;
}

/**
 * «Замын тэнхлэг» (et:5)-ийг Web Mercator шугам болгож татна.
 * ⚠️ `roadNet.ts`-ийн адил UTM хайрцгаар шүүнэ — CAD-ийн эх цэг рүү унасан
 * гажсан хэрчмүүд шүүгдэхгүй бол «хамгийн ойрын зам» худал болно.
 */
async function fetchRoads() {
  const geometry = JSON.stringify({
    xmin: 641000, ymin: 5312000, xmax: 645000, ymax: 5317000,
    spatialReference: { wkid: 32648 },
  });
  const out = [];
  let offset = 0;
  for (;;) {
    const q = `${ROAD_URL}/query?where=1%3D1&geometry=${encodeURIComponent(geometry)}` +
      '&geometryType=esriGeometryEnvelope&inSR=32648&spatialRel=esriSpatialRelIntersects' +
      '&outFields=&returnGeometry=true&outSR=3857&maxAllowableOffset=1.5&geometryPrecision=1' +
      `&resultOffset=${offset}&resultRecordCount=2000&f=json`;
    const j = await fetch(q).then((x) => x.json());
    if (j.error) throw new Error(JSON.stringify(j.error));
    const feats = j.features ?? [];
    for (const f of feats) {
      for (const path of f.geometry?.paths ?? []) if (path.length >= 2) out.push(path);
    }
    if (feats.length < 2000) break;
    offset += 2000;
  }
  return out;
}

/** Автобусны буудлууд — Web Mercator цэг (`busAccess.loadBusStops`-ийн хуулбар) */
async function fetchStops() {
  const q = `${BUS_URL}/query?where=1%3D1&outFields=OBJECTID&returnGeometry=true&outSR=3857&resultRecordCount=2000&f=json`;
  const j = await fetch(q).then((x) => x.json());
  if (j.error) throw new Error(JSON.stringify(j.error));
  return (j.features ?? [])
    .map((f) => f.geometry)
    .filter((g) => g && Number.isFinite(g.x) && Number.isFinite(g.y));
}

/* ── Автобусны хүртээмж (`busAccess.ts`-ийн хуулбар) ── */
const BUS_GOOD_M = 400;
const BUS_OK_M = 800;
const busBand = (d) => (d <= BUS_GOOD_M ? 'good' : d <= BUS_OK_M ? 'ok' : 'poor');

/* ── Цэг ↔ шугамын зай (`traffic.distToSeg` / `distToPath`-ийн хуулбар) ── */
function distToSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distToPath(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSeg(p, pts[i - 1], pts[i]);
    if (d < best) best = d;
  }
  return best;
}

/* ── Тооцоо ── */
const rows = await fetchAll();
assert.ok(rows.length > 0, 'барилга татагдсангүй');

const agg = Object.fromEntries(CATS.map((c) => [c, { count: 0, pop: 0, cap: 0, trips: 0 }]));
let totalTrips = 0;
const unknown = new Set();

for (const a of rows) {
  const cat = classify(a[F.purpose]);
  const pop = n(a[F.population]);
  const cap = n(a[F.capacity]);
  const t = buildingTrips(cat, pop, cap);
  const g = agg[cat];
  g.count++; g.pop += pop; g.cap += cap; g.trips += t;
  totalTrips += t;
  if (cat === 'other' && String(a[F.purpose] ?? '').trim()) unknown.add(String(a[F.purpose]).trim());
}

/* ── Тайлан ── */
console.log(`transport.check: ${rows.length} барилга · нийт хүн-зорчилт ${Math.round(totalTrips).toLocaleString('en-US')}/оргил цаг\n`);
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

/* ══════════════════ Phase 2 — замын эрэлт ══════════════════ */

/**
 * ⚠️ Энд замын нэгж нь ЭХ ДАВХАРГЫН ШУГАМ (et:5-ийн path); аппад бол
 * `buildNetwork`-ийн ИРМЭГ. Хоёулаа CAD-ийн ижил хэрчмүүдээс гардаг тул эрэлтийн
 * хуваарилалт ойролцоо — энэ шалгалт нь ТОМЬЁОГ (жингийн нормчилол, зайн босго,
 * нийлбэрийн хадгалалт) баталгаажуулна, аппын ирмэгийн индексийг БИШ.
 */
const roads = await fetchRoads();
assert.ok(roads.length > 0, 'замын шугам татагдсангүй');

const maxDist = ROAD_MAX_DIST_M * WM_UNITS_PER_M;
const demand = new Float64Array(roads.length);
let assignedVeh = 0;
let linkedB = 0;
const unlinked = [];
const noCentroid = [];
const distsM = [];

for (const a of rows) {
  const cat = classify(a[F.purpose]);
  const veh = vehicleTrips(buildingTrips(cat, n(a[F.population]), n(a[F.capacity])));
  if (a.__x == null || a.__y == null) { noCentroid.push(a); continue; }
  const p = [a.__x, a.__y];

  // Хамгийн ойрын 3 (өсөх дараалал)
  const best = [];
  for (let i = 0; i < roads.length; i++) {
    const d = distToPath(p, roads[i]);
    if (d > maxDist) continue;
    if (best.length === 3 && d >= best[2].d) continue;
    let j = best.length;
    while (j > 0 && best[j - 1].d > d) j--;
    best.splice(j, 0, { i, d });
    if (best.length > 3) best.pop();
  }

  if (!best.length) { if (veh > 0) unlinked.push(a); continue; }
  linkedB++;
  distsM.push(best[0].d / WM_UNITS_PER_M);
  if (veh <= 0) continue;

  // ⚠️ Жинг НОРМЧИЛНО — 3-аас цөөн зам олдвол зорчилт «алга болохгүй»
  const wSum = best.reduce((s, _, i) => s + ROAD_WEIGHTS[i], 0);
  for (let i = 0; i < best.length; i++) {
    const share = (veh * ROAD_WEIGHTS[i]) / wSum;
    demand[best[i].i] += share;
    assignedVeh += share;
  }
}

const totalVeh = vehicleTrips(totalTrips);
const unlinkedVeh = unlinked.reduce(
  (s, a) => s + vehicleTrips(buildingTrips(classify(a[F.purpose]), n(a[F.population]), n(a[F.capacity]))),
  0,
);
let maxDemand = 0;
let loadedRoads = 0;
for (const v of demand) { if (v > maxDemand) maxDemand = v; if (v > 0) loadedRoads++; }
const median = distsM.length ? distsM.slice().sort((x, y) => x - y)[Math.floor(distsM.length / 2)] : 0;

console.log('\nЗамын эрэлт (Phase 2):');
console.log(`  Замын шугам           ${roads.length.toLocaleString('en-US')} (эрэлт орсон нь ${loadedRoads.toLocaleString('en-US')})`);
console.log(`  Замд холбогдсон       ${linkedB} / ${rows.length} барилга`);
console.log(`  Холбогдоогүй (зорчилттой) ${unlinked.length} барилга · ${Math.round(unlinkedVeh).toLocaleString('en-US')} машин`);
console.log(`  Хуваарилагдсан        ${Math.round(assignedVeh).toLocaleString('en-US')} / ${Math.round(totalVeh).toLocaleString('en-US')} машин`);
console.log(`  Ойрын зам хүртэл      медиан ${Math.round(median)} м · дээд ${Math.round(Math.max(...distsM))} м`);
console.log(`  Хамгийн ачаалалтай зам ${Math.round(maxDemand).toLocaleString('en-US')} машин/ц`);

/* ── Батламжууд ── */
assert.equal(noCentroid.length, 0, 'төв цэггүй барилга байна');
// НИЙЛБЭР ХАДГАЛАГДАНА: хуваарилагдсан + холбогдоогүй = нийт машин-зорчилт
assert.ok(
  Math.abs(assignedVeh + unlinkedVeh - totalVeh) < 1,
  `машин-зорчилт алдагдсан: ${assignedVeh.toFixed(2)} + ${unlinkedVeh.toFixed(2)} ≠ ${totalVeh.toFixed(2)}`,
);
assert.ok(maxDemand > 0, 'ямар ч замд эрэлт оногдоогүй');
assert.ok(Math.max(...distsM) <= ROAD_MAX_DIST_M + 1e-6, 'зайн босго зөрчигдсөн');
assert.ok(Math.abs(ROAD_WEIGHTS.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'замын жин 1.0 болохгүй байна');

if (unlinked.length) {
  console.log(`\n⚠️ ${ROAD_MAX_DIST_M} м дотор зам олдоогүй, зорчилт үүсгэдэг барилга (${unlinked.length}):`);
  for (const a of unlinked.slice(0, 12)) {
    console.log(`   - ${String(a[F.purpose] ?? '—')} · ${CAT_LABEL[classify(a[F.purpose])]}`);
  }
  if (unlinked.length > 12) console.log(`   … нийт ${unlinked.length}`);
}

/* ══════════════════ Phase 3 — автобусны хүртээмж ══════════════════ */

const stops = await fetchStops();
assert.ok(stops.length > 0, 'автобусны буудал татагдсангүй');

const stopDemand = new Float64Array(stops.length);
const popByBand = { good: 0, ok: 0, poor: 0 };
const bldByBand = { good: 0, ok: 0, poor: 0 };
let resPop = 0;

for (const a of rows) {
  if (a.__x == null || a.__y == null) continue;
  const cat = classify(a[F.purpose]);
  const pop = n(a[F.population]);
  const trips = buildingTrips(cat, pop, n(a[F.capacity]));

  let bestI = -1;
  let bestD = Infinity;
  for (let s = 0; s < stops.length; s++) {
    const d = Math.hypot(a.__x - stops[s].x, a.__y - stops[s].y);
    if (d < bestD) { bestD = d; bestI = s; }
  }
  const distM = bestD / WM_UNITS_PER_M;
  const band = busBand(distM);
  bldByBand[band]++;
  // ⚠️ ЗӨВХӨН орон сууц — багтаамжийг хүн ам гэж тоолохгүй
  if (cat === 'residential') { popByBand[band] += pop; resPop += pop; }
  stopDemand[bestI] += trips * MODE_SPLIT.transit;
}

let maxStop = 0;
for (const v of stopDemand) if (v > maxStop) maxStop = v;
const pct = (v) => (resPop > 0 ? Math.round((v / resPop) * 100) : 0);

console.log('\nАвтобусны хүртээмж (Phase 3):');
console.log(`  Буудал                ${stops.length}`);
console.log(`  ≤${BUS_GOOD_M} м (сайн)        ${String(popByBand.good).padStart(6)} хүн (${pct(popByBand.good)}%) · ${bldByBand.good} барилга`);
console.log(`  ${BUS_GOOD_M}–${BUS_OK_M} м (боломжийн) ${String(popByBand.ok).padStart(6)} хүн (${pct(popByBand.ok)}%) · ${bldByBand.ok} барилга`);
console.log(`  >${BUS_OK_M} м (дутмаг)      ${String(popByBand.poor).padStart(6)} хүн (${pct(popByBand.poor)}%) · ${bldByBand.poor} барилга`);
console.log(`  Хамгийн ачаалалтай буудал ${Math.round(maxStop).toLocaleString('en-US')} зорчигч/ц`);

/* ── Батламжууд ── */
// Зурвасын хүн ам нийлээд ОРОН СУУЦНЫ нийт хүн амыг өгнө (давхардал/алдагдалгүй)
assert.equal(
  popByBand.good + popByBand.ok + popByBand.poor,
  agg.residential.pop,
  'зурвасын хүн амын нийлбэр орон сууцны хүн амтай таарахгүй',
);
assert.equal(bldByBand.good + bldByBand.ok + bldByBand.poor, rows.length, 'барилга зурваст бүрэн хуваарилагдаагүй');
// Буудлын эрэлтийн нийлбэр = нийт зорчилт × нийтийн тээврийн хувь
const stopSum = stopDemand.reduce((a, b) => a + b, 0);
assert.ok(
  Math.abs(stopSum - totalTrips * MODE_SPLIT.transit) < 1,
  `буудлын эрэлт алдагдсан: ${stopSum.toFixed(2)} ≠ ${(totalTrips * MODE_SPLIT.transit).toFixed(2)}`,
);

console.log('\ntransport.check: ok');
