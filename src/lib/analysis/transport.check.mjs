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

const n = (v) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/* ── Живэ өгөгдөл татах (2000-ийн хязгаарыг offset-оор давна) ── */
async function fetchAll() {
  const out = [];
  let offset = 0;
  for (;;) {
    const q = `${URL}/query?where=1%3D1&outFields=${encodeURIComponent(`${F.purpose},${F.population},${F.capacity}`)}` +
      `&returnGeometry=false&resultOffset=${offset}&resultRecordCount=2000&f=json`;
    const r = await fetch(q);
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    const feats = j.features ?? [];
    out.push(...feats.map((f) => f.attributes));
    if (feats.length < 2000) break;
    offset += 2000;
  }
  return out;
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

console.log('\ntransport.check: ok');
