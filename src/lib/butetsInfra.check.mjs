/**
 * ИНЖЕНЕРИЙН ДЭД БҮТЦИЙН ДАВХАРГЫН МЕТАДАТА — АМЬД, ЗӨВХӨН УНШИЛТ (2026-10-01).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/butetsInfra.check.mjs
 *
 * ⚠️ АМЬД шалгуур — сүлжээгүй/токенгүй (`SELBE_LIVE_SKIP`) үед ⏭ АЛГАСНА (унахгүй).
 *    Бичилт, схем, үйлчилгээний тохиргоо ОГТ хөндөхгүй — `?f=json` метадата л уншина.
 *
 * Шалгадаг зүйл (2026-10-01-ний хэрэглэгчийн «бүгдийг зас» даалгавраас):
 *  1. ДАВХАРГЫН SR. Урт/талбайг `Shape__Length`-ээс авах уу, геометрээс ГЕОДЕЗИЙН
 *     аргаар бодох уу гэдэг нь SR-ээс шалтгаална (`butetsLen.measureKind`). Өнөөдөр
 *     32648 (UTM 48N, проекцолсон) → `Shape__Length` зөв. Үйлчилгээ Web Mercator руу
 *     шилжвэл энэ шалгуур ил хэлж, код автоматаар геодезийн замд орно.
 *  2. `infra:69` «Ариутгах татуургын600 худаг» нь БОХИРЫН ХУДАГ мөн эсэх — `infra:1`
 *     (Багц 5.1 · Бохир худаг)-ын худгийн схемтэй ижил байх ёстой (`DedButets.WELL_IDS`).
 *  3. `loadLayerMeta` нь SR ба `supportsRollbackOnFailureParameter`-ийг танина.
 */
import assert from 'node:assert/strict';
import { LAYER_BY_ID, layerUrl } from './services.ts';
import { measureKind, srKind } from './butetsLen.ts';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ butetsInfra.check: амьд үйлчилгээ хүрэхгүй (SELBE_LIVE_SKIP) — алгасав');
  process.exit(0);
}

/** Метадата — ArcGIS алдааг HTTP 200-аар буцаадаг тул биеийг шалгана */
async function meta(id) {
  const body = new URLSearchParams({ f: 'json' });
  const res = await fetch(layerUrl(LAYER_BY_ID[id]), { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { net: true });
  const j = await res.json();
  if (j.error) throw Object.assign(new Error(`${j.error.code} ${j.error.message}`), { arc: j.error.code });
  return j;
}

let m1, m6, m69;
try {
  [m1, m6, m69] = await Promise.all(['infra:1', 'infra:6', 'infra:69'].map(meta));
} catch (e) {
  /* Сүлжээ/токен (498/499) — орчны асуудал, кодын биш */
  if (e.net || e.arc === 498 || e.arc === 499 || e.name === 'TimeoutError' || e instanceof TypeError) {
    console.log(`⏭ butetsInfra.check: ${e.message} — алгасав`);
    process.exit(0);
  }
  throw e;
}

/* ── 1. SR ── */
/* ⚠️ 2026-10-09: `loadLayerMeta`-тэй ижил дараалал — extent ЭХЭНД, source нөөц */
const wk = (m) => m.extent?.spatialReference?.latestWkid ?? m.extent?.spatialReference?.wkid
  ?? m.sourceSpatialReference?.latestWkid ?? m.sourceSpatialReference?.wkid;
const srs = [m1, m6, m69].map(wk);
assert.ok(srs.every((x) => typeof x === 'number'), `SR уншигдсан: ${srs}`);
assert.ok(srs.every((x) => x === srs[0]), `инженерийн давхаргууд НЭГ SR-тэй: ${srs}`);
const kind = srKind(srs[0]);
console.log(`  SR ${srs[0]} (${kind}) → урт: ${measureKind(srs[0]) === 'planar' ? 'Shape__Length (хавтгай)' : 'геометрээс ГЕОДЕЗИЙН'}`);
if (kind === 'webmerc' || kind === 'geographic') {
  console.log('  ⚠️ Web Mercator/газарзүйн SR — Shape__Length метр биш; код геодезийн замаар бодно.');
}
assert.equal(m6.geometryType, 'esriGeometryPolyline', 'infra:6 — шугам');

/* ── 2. infra:69 = бохирын худаг ── */
const MANHOLE = ['Diameter', 'Cap_Level', 'Bottom_Level', 'Cap_Count'];
const names = (m) => new Set((m.fields ?? []).map((f) => f.name));
for (const f of MANHOLE) {
  assert.ok(names(m1).has(f), `infra:1 (Бохир худаг) — ${f}`);
  assert.ok(names(m69).has(f), `infra:69 нь худгийн схемтэй байх ёстой — ${f} алга (WELL_IDS-ээс хасах хэрэгтэй болно)`);
}
assert.equal(m69.geometryType, m1.geometryType, 'infra:69 ба infra:1 ижил геометр');

/* ── 3. loadLayerMeta — SR ба атом бичилт ── */
const { loadLayerMeta } = await import('./butetsEdit.ts');
const lm = await loadLayerMeta('infra:6');
assert.equal(lm.wkid, srs[0], 'LayerMeta.wkid = давхаргын SR');
assert.equal(typeof lm.rollback, 'boolean', 'LayerMeta.rollback танигдсан');
console.log(`  infra:6 supportsRollbackOnFailureParameter: ${lm.rollback}`);

console.log('butetsInfra.check: OK');
