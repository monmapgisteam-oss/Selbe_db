/**
 * JS API-ийн ШУУД ДУУДЛАГА `remapUrl`-гүй AGOL түлхүүр руу явахгүй — ХАРУУЛ (2026-10-26, аудит A9).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/entRemap.check.mjs
 *
 * ⚠️ ЯАГААД: кодын `${HJ}/…` · `${TD}/…` хаяг нь AGOL-ын ТҮЛХҮҮР (`services/agolKey.ts`) — сүлжээний хаяг БИШ.
 *    `query.ts`-ийн цөм (`query.run` · `arcgisPost`) `remapUrl`-аар Enterprise руу зураглаж, зураглалгүйд ил алдаа
 *    шиднэ. Харин JS API-ийн ШУУД дуудлага (`executeQueryJSON`/`PBF` · `esriRequest` · `new FeatureLayer({url})` г.м.)
 *    тэр цөмөөр явдаггүй — 2026-10-20-нд `analysis/data.ts`-ийн `TD/118` AGOL руу шууд явж 499 → «Тохиромжтой
 *    байдал»-д AGOL-ын «Sign in» цонх гарсан (AGOL-д нэвтэрсэн байхад л далд байв). Бүрэн шилжилт (≈83 дуудлагын
 *    цэг) өндөр эрсдэлтэй тул (verdict A9) зөвхөн ЭНЭ хаалт: шинэ шууд дуудлага нь `remapUrl(…)`/`layerUrl(…)`-аар
 *    ороосон байх ЁСТОЙ, эс бөгөөс доорх `ALLOW`-д шалтгаантайгаар бүртгэгдсэн байна.
 * Дүрэм:
 *   1. `src/**` (`.check.`-ээс бусад `.ts`/`.tsx`, ТАЙЛБАРЫГ ХАССАН) доторх дуудлага бүрийн хаягийн илэрхийлэл
 *      (`url:` шинж эсвэл функцийн 1-р аргумент) нь `remapUrl(` эсвэл `layerUrl(` агуулна — эсвэл `ALLOW`-д.
 *   2. `layerUrl` (`services/layers.ts`) өөрөө `remapUrl`-аар буцаана (эс бөгөөс дүрэм 1 утгагүй).
 *   3. `ALLOW`-ийн мөр бүр одоо ч кодод байна (хуучирсан зөвшөөрөл үлдэхгүй).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * ХЯНАСАН, `remapUrl` ШААРДЛАГАГҮЙ цэгүүд — `файл` + хаягийн илэрхийлэл (зайг шахсан). Шинэ мөр нэмэхдээ ЯАГААД
 * аюулгүйг бич: хаяг нь Enterprise (`ENT_HOSTED`) эсвэл гадны үйлчилгээнээс шууд, эсвэл дуудагч аль хэдийн зураглав.
 */
const ALLOW = [
  ['src/components/MapCanvas.tsx', 'o.url', 'ORTHO_FLIGHTS (scene.ts) — `${ENT_HOSTED}/…` Enterprise хаяг'],
  ['src/components/MapCanvas.tsx', 'IRGED_ORTHO_PRE.url', '`NEXT_PUBLIC_IRGED_ORTHO_PRE` — env-ийн БҮТЭН ImageServer хаяг'],
  ['src/components/MapCanvas.tsx', 'IRGED_ROAD.url', '`${ENT_HOSTED}/selberoad_TILE_1/VectorTileServer` — Enterprise'],
  ['src/components/MapCanvas.tsx', 'ELEVATION_URL', 'Esri World Elevation — гадны нийтийн үйлчилгээ'],
  ['src/modules/analysis/SuitMap.tsx', 'b.url', 'BIM (scene.ts) — `${ENT_HOSTED}/…/SceneServer`'],
  ['src/modules/analysis/SuitMap.tsx', 'url', '`const url = layerUrl(…)` — шууд дээрх мөрөнд зураглагдсан'],
  ['src/modules/analysis/SuitMap.tsx', 'o.url', 'IMAGERY.layers (scene.ts) — Enterprise ортофото'],
  ['src/modules/analysis/SuitMap.tsx', 'ROAD_TILE_URL', 'IRGED_ROAD.url — Enterprise VectorTileServer'],
  ['src/modules/analysis/SuitMap.tsx', 'ELEVATION_URL', 'Esri World Elevation — гадны нийтийн үйлчилгээ'],
  ['src/modules/analysis/SuitMap.tsx', 'm.url', 'SCENE.layers (scene.ts) — `${ENT_HOSTED}/Mesh_*/SceneServer`'],
  ['src/lib/draftRemote.ts', 'url', '`tableUrl()` — `entDirect` (Enterprise БҮТЭН хаяг) эсвэл порталын хайлтын item URL'],
  ['src/lib/permsRemote.ts', 'url', '`tableUrl()` — `entDirect` (Enterprise БҮТЭН хаяг) эсвэл порталын хайлтын item URL'],
];

const CTORS = ['FeatureLayer', 'SceneLayer', 'IntegratedMeshLayer', 'ImageryLayer', 'ImageryTileLayer', 'MapImageLayer',
  'TileLayer', 'VectorTileLayer', 'ElevationLayer', 'BuildingSceneLayer', 'StreamLayer', 'GeoJSONLayer', 'PointCloudLayer'];
const FNS = ['executeQueryJSON', 'executeQueryPBF', 'executeForCount', 'executeForIds', 'executeForExtent', 'esriRequest'];
const CALL = new RegExp(`\\bnew\\s+(${CTORS.join('|')})\\s*\\(|\\b(${FNS.join('|')})\\s*\\(`, 'g');
const BS = String.fromCharCode(92);

/** `//` ба `/* … *\/` тайлбарыг хасна (мөрийн литерал хадгалагдана; мөр шилжилт ҮЛДЭНЭ — мөрийн дугаар зөв) */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const e = src.indexOf('*/', i + 2);
      const j = e < 0 ? src.length : e + 2;
      out += src.slice(i, j).replace(/[^\n]/g, '');
      i = j; continue;
    }
    if (two === '//') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === BS) j += 1; j += 1; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

/** `s[from]`-оос эхлэн 0 гүнд `stop` тэмдэгтийн аль нэгэнд хүртэлх хэсэг (хаалт/литерал тооцно) */
function until(s, from, stop) {
  let d = 0;
  for (let i = from; i < s.length; i += 1) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) { if (s[j] === BS) j += 1; j += 1; }
      i = j; continue;
    }
    if (d === 0 && stop.includes(c)) return s.slice(from, i);
    if ('([{'.includes(c)) d += 1;
    else if (')]}'.includes(c)) { if (d === 0) return s.slice(from, i); d -= 1; }
  }
  return s.slice(from);
}

/** Дуудлагын хаягийн илэрхийлэл — `null` бол хаяггүй (`source:` г.м. — шалгах зүйлгүй) */
function urlExpr(s, open, isCtor) {
  const args = until(s, open + 1, ')');
  if (!isCtor) return until(args, 0, ',').trim();
  const t = args.trim();
  if (!t.startsWith('{')) return t ? until(t, 0, ',').trim() : null; // `new X(url)`-ийн хэлбэр ховор
  /* Объектын ДЭЭД түвшний шинж — `url: …` эсвэл товчлол `url` */
  const body = until(t, 1, '}');
  let d = 0;
  let start = 0;
  const props = [];
  for (let i = 0; i <= body.length; i += 1) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < body.length && body[j] !== c) { if (body[j] === BS) j += 1; j += 1; }
      i = j; continue;
    }
    if (i === body.length || (d === 0 && c === ',')) { props.push(body.slice(start, i).trim()); start = i + 1; continue; }
    if ('([{'.includes(c)) d += 1;
    else if (')]}'.includes(c)) d -= 1;
  }
  for (const p of props) {
    if (p === 'url') return 'url';
    const m = /^url\s*:\s*([\s\S]*)$/.exec(p);
    if (m) return m[1].trim();
  }
  return null;
}

const squash = (x) => x.replace(/\s+/g, '');
const SAFE = (x) => /\bremapUrl\s*\(/.test(x) || /\blayerUrl\s*\(/.test(x);

/* ── 2) layerUrl өөрөө зураглана ── */
{
  const L = stripComments(readFileSync('src/lib/services/layers.ts', 'utf8'));
  const i = L.indexOf('export const layerUrl');
  assert.ok(i >= 0, 'services/layers.ts: `export const layerUrl` олдсонгүй — хаалтын дүрэм 1 утгагүй болно');
  assert.match(until(L, L.indexOf('{', i) + 1, '}'), /\breturn\s+remapUrl\s*\(/, 'layerUrl нь `remapUrl`-аар буцаахаа больсон');
}

/* ── 1) Дуудлагын цэгүүд ── */
const sites = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.tsx?$/.test(e.name) || e.name.includes('.check.')) continue;
    const rel = p.split(sep).join('/');
    const src = stripComments(readFileSync(p, 'utf8'));
    for (const m of src.matchAll(CALL)) {
      const expr = urlExpr(src, m.index + m[0].length - 1, !!m[1]);
      if (expr == null) continue;
      const line = src.slice(0, m.index).split('\n').length;
      sites.push({ file: rel, what: m[1] ?? m[2], expr, line });
    }
  }
};
walk('src');
assert.ok(sites.length >= 15, `шууд дуудлагын цэг хэт цөөн (${sites.length}) — хайлт эвдэрсэн үү?`);

const errs = [];
const used = new Set();
for (const s of sites) {
  if (SAFE(s.expr)) continue;
  const k = ALLOW.findIndex(([f, x]) => f === s.file && squash(x) === squash(s.expr));
  if (k >= 0) { used.add(k); continue; }
  errs.push(`${s.file} (${s.line}-р мөр) · ${s.what}: «${s.expr.slice(0, 80)}» — remapUrl(…)-аар ороо эсвэл ALLOW-д шалтгаантай бүртгэ`);
}
/* ── 3) Хуучирсан зөвшөөрөл ── */
ALLOW.forEach(([f, x], k) => { if (!used.has(k)) errs.push(`ALLOW хуучирсан: ${f} «${x}» — кодод ийм шууд дуудлага алга, мөрийг хас`); });

if (errs.length) {
  console.error(`❌ JS API-ийн шууд дуудлага remapUrl-гүй (${errs.length}):\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ ${sites.length} шууд JS API дуудлага — бүгд remapUrl/layerUrl-аар эсвэл хянасан ${ALLOW.length} зөвшөөрөлд`);
