/**
 * «ТОХИРОМЖТОЙ БАЙДАЛ» / ЗАМЫН СИМУЛЯЦЫН РЕГРЕСС (2026-09-30).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/modules/analysis/suitUi.check.mjs
 *
 * Хамгаалж буй алдаанууд (засвар бүр ` 2026-09-30`):
 *   1. «Урсгал» = Σv / (N·V_MAX) — машины чөлөөт хурд 25–50 км/ц тул ЧӨЛӨӨТ сүлжээ 78%.
 *   2. Трафикийн хураангуй (машин, хурд, урсгал) 3D/горим/сүлжээ солиход хуучнаараа «амьд».
 *   3. Гэрлэн дохио унахад дохиогүй сүлжээ сесс дуустал кэшлэгдэж, UI юу ч хэлдэггүй.
 *   4. Автобус/LRT/инженерийн эх унахад `[]` → хүртээмж «өгөгдөл алга»/хэт хол, хагас дүн кэшлэгдэнэ.
 *   5. Симуляцаас гарахад цаг 10 Гц-ээр тоолсоор бүх харагдацыг дахин зурна.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VEHICLE_TYPES, V_MAX } from './suit/traffic.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ov = read('./suit/TrafficOverlay.tsx');
const suit = read('./Suitability.tsx');
const net = read('./suit/netSources.ts');
const panel = read('./suit/SimulationPanel.tsx');
const data = read('../../lib/analysis/data.ts');

/* 1 — томьёо ба түүний үр дагавар */
assert.ok(ov.includes('for (const c of cars) { sumV += c.v; sumVmax += c.vmax; }'));
assert.ok(ov.includes('flow: cars.length && sumVmax > 0 ? Math.min(1, sumV / sumVmax) : 1,'));
{
  /* Бүх машин чөлөөт хурдаараа явбал хуучин томьёо 100%-д ХҮРДЭГГҮЙ — шинэ нь 100% */
  const cars = VEHICLE_TYPES.map((t) => {
    const v = (t.vRange[0] + t.vRange[1]) / 2;
    return { v, vmax: v };
  });
  const sumV = cars.reduce((a, c) => a + c.v, 0);
  const oldFlow = Math.min(1, sumV / cars.length / V_MAX);
  const newFlow = Math.min(1, sumV / cars.reduce((a, c) => a + c.vmax, 0));
  assert.ok(oldFlow < 0.95, `хуучин томьёо чөлөөт урсгалыг ${oldFlow} гэдэг байсан`);
  assert.equal(newFlow, 1);
}

/* 2 */
assert.ok(suit.includes("const trafficLive = roadMode && netCars && !!roadNet && dim === '2d';"));
assert.ok(suit.includes('stats: trafficLive ? trafficStats : null,'));
assert.ok(/setRoadErr\(null\);\s*(?:\/\*[^*]*\*\/\s*)?setTrafficStats\(null\);/.test(suit), 'сүлжээ солиход хураангуй тэглэнэ');

/* 3 */
assert.ok(net.includes('if (signalsFailed) { net.signalsFailed = true; cache.delete(kind); }'));
assert.ok(suit.includes('signalsFailed: !!roadNet?.signalsFailed,'));
assert.ok(panel.includes('{road.signalsFailed && ('));

/* 4 */
assert.ok(data.includes('.then((d) => { if (d.failed.length) cache = null; return d; })'));
assert.ok(!data.includes('.catch(() => [] as Feat[])'), 'чимээгүй `[]` үлдсэн');
assert.ok(suit.includes('data && data.failed.length > 0 && ('));

/* 5 */
assert.ok(suit.includes('if (!roadMode && clock.playing) clock.setPlaying(false);'));

assert.ok(suit.includes("const area = Number.isFinite(areaM2) && areaM2 > 0 ? tr('{0} м²', nf(areaM2)) : null;"));
assert.ok(suit.includes("dt(tr('Нийт талбай'), area)"));
assert.ok(!suit.includes("nf(Number(a['Барилгын_нийт_талбай_m2'] ?? 0))"), '«0 м²» бичдэг хуучин зам үлдсэн');

{
  const suitMap = read('./SuitMap.tsx');
  assert.ok(suitMap.includes('const bimLive = (map: Map): BuildingSceneLayer[] => BIM.layers.flatMap((b) => {'), '`bimLive` алга');
  assert.ok(suitMap.includes('bimLayerPeek<BuildingSceneLayer>(map, b.key)'), '`bimLive` кэшээс `peek` хийх ёстой (дахин үүсгэхгүй)');
  assert.ok(suitMap.includes('layers: () => bimLive(map), items: BIM.layers, Explorer: BuildingExplorer'), 'сонгогчид `layers` функцээр биш');
  assert.ok(suitMap.includes('all: () => bimLive(map), m: r3, archOn: false, pkg: bimPkg'), '`manageBim`-д `all` функцээр биш');
  assert.ok(!suitMap.includes('all: bimAll(map)'), 'нэг удаагийн `bimAll` массив үлдсэн');
  assert.ok(/const bimPkgKey = r3 === 'fine' \? bimPkg\.pkg : null;\s*useEffect\(\(\) => \{\s*if \(dim === 'bim' && ready\) bimWidgetRef\.current\?\.rebind\(\);\s*\}, \[dim, ready, r3, bimPkgKey\]\);/.test(suitMap),
    'багц · горим солигдоход `rebind` эффект алга');
}

/* Норм хамаарахгүй бүс: hover ба сонгогчид ✗ болж тоологдохгүй; картанд өөр төрлийн хязгаар хэвлэхгүй */
{
  const urban = read('./suit/Urban.tsx');
  const detail = read('./SuitDetail.tsx');
  assert.ok(suit.includes('if (!p || p.value == null || p.norm?.na) continue;'), 'hover: норм хамаарахгүй нь ✗ болов');
  assert.ok(urban.includes('if (!p || p.value == null || p.norm?.na) continue;'), 'сонгогч: норм хамаарахгүй нь хуваарьт орв');
  assert.ok(/eff\.na \? \(\s*<span>\{tr\('норм хамаарахгүй'\)\}<\/span>/.test(detail), 'карт: «норм хамаарахгүй» хязгааргүй');
}

/* Тайлангийн зураг: «Бодит» ба «Улаан бүсийн барилга» төлөв бүсийг алга болгохгүй */
{
  assert.ok(suit.includes("(!!shotView || (!bareReal && (!locPublicOnly || LOCATION_ZONE_TYPES.includes(r.type))))"), 'зурагт бүс алга болно');
  assert.ok(suit.includes('zoneFaint={locPublicOnly && !shotView}'), 'зурагт бүс бүдэг');
  assert.ok(suit.includes('roadTile={bareReal && !shotView}'), 'зурагт замын суурь үлдэнэ');
  assert.ok(suit.includes('layerOn={shotView && bareReal ? { ...layerOn, [BUILDING_LAYER]: true } : layerOn}'), 'зурагт барилга унтарна');
  assert.ok(suit.includes('if (locPublicOnly && !shotView) {'), 'зурагт барилга шүүгдэнэ');
}

/* Тээврийн будалт зөвхөн дулаан бодитоор зурагдаж буй үед бүдгэрнэ */
assert.ok(suit.includes("transportFaint={heatOn && !!heat?.length && dim === '2d'}"), 'дулаангүй үед будалт бүдэгрэв');

/* Жагсаалтын өнгө газрын зурагтай ижил (`SuitMap.rendererFor` нь `d.color`-оор буддаг) */
assert.ok(read('./suit/LayerCatalog.tsx').includes('<LayerSwatch d={swatchDef(l)} hue={`rgb(${l.color.join(\',\')})`} />'), 'жагсаалтын өнгө зөрнө');

/* Зогсоол · байршлын шошго тоотой таарна */
{
  const urban = read('./suit/Urban.tsx');
  assert.ok(!urban.includes("tr('Ерөнхий төлөвлөгөөнд тусгагдсан"), 'хэрэгцээтэй бүсийн дүнг төлөвлөгөөний нийт гэж нэрлэв');
  assert.ok(urban.includes("tr('Хэрэгцээтэй бүсэд төлөвлөсөн =')"), 'зогсоолын томьёоны нэр');
  assert.ok(urban.includes("tr('Оргил цагийн урсгал')") && !urban.includes("tr('Өдрийн урсгал')"), 'оргил цагийн тоог өдрийн гэж нэрлэв');
}

/* Барилгын дугаар хүсэлтэд орно: `oid` үүнээс уншигдаж, сонголт ба түлхүүрт хэрэглэгддэг */
assert.ok(read('./suit/buildings.ts').includes("outFields: ['objectid', F.purpose,"), 'objectid outFields-д алга');

console.log('suitUi.check: OK');
