/**
 * «ТОХИРОМЖТОЙ БАЙДАЛ» / ЗАМЫН СИМУЛЯЦЫН РЕГРЕСС (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/analysis/suitUi.check.mjs
 *
 * Хамгаалж буй алдаанууд (засвар бүр `⚠️ 2026-09-30`):
 *   1. «Урсгал» = Σv / (N·V_MAX) — машины чөлөөт хурд 25–50 км/ц тул ЧӨЛӨӨТ сүлжээ 78%.
 *   2. Трафикийн хураангуй (машин, хурд, урсгал) 3D/горим/сүлжээ солиход хуучнаараа «амьд».
 *   3. Гэрлэн дохио унахад дохиогүй сүлжээ сесс дуустал кэшлэгдэж, UI юу ч хэлдэггүй.
 *   4. Автобус/LRT/инженерийн эх унахад `[]` → хүртээмж «өгөгдөл алга»/хэт хол, хагас дүн кэшлэгдэнэ.
 *   5. Симуляцаас гарахад цаг 10 Гц-ээр тоолсоор бүх харагдацыг дахин зурна.
 * ⚠️ Канвас/rAF/ArcGIS тул ЭХ КОДООР шалгана; 1-ийн томьёог тооцоогоор давхар баталгаажуулна.
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
assert.ok(/setRoadErr\(null\);\s*\/\*[^*]*\*\/\s*setTrafficStats\(null\);/.test(suit), 'сүлжээ солиход хураангуй тэглэнэ');

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

console.log('suitUi.check: OK');
