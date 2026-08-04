/**
 * OSM-ЫН БОДИТ ЗАМЫН СҮЛЖЭЭГ татаж, статик файл болгоно.
 *
 *   node tools/osm_roads.mjs   →   public/data/osm-roads.json
 *
 * ⚠️ ЯАГААД ГҮЙЛГЭЭНИЙ ҮЕД БИШ, УРЬДЧИЛАН ТАТДАГ ВЭ:
 *   · Сайт нь СТАТИК export (GitHub Pages) — сервер тал байхгүй
 *   · Overpass нь хязгаартай, удаан (хэдэн секунд) бөгөөд унаж болно
 *   · OSM өгөгдөл өдөр бүр өөрчлөгддөггүй — жилд хэдхэн удаа шинэчилбэл хангалттай
 *   Тиймээс энэ скриптийг ГАРААР ажиллуулж, гарсан файлыг repo-д хадгална.
 *
 * ⚠️ ЛИЦЕНЗ: OSM нь ODbL. Гарсан өгөгдлийг нийтэлбэл «© OpenStreetMap
 *   contributors» гэсэн эшлэл газрын зурагт ЗААВАЛ харагдана.
 */

import { writeFileSync, mkdirSync } from 'node:fs';

/** Сэлбэ дэд төвийн хүрээ (S,W,N,E) — `Selbe_road` vector tile-ийн bounds-тай ижил */
const BBOX = '47.9574,106.905,47.9777,106.931';

const OUT = 'public/data/osm-roads.json';

/**
 * МАШИН явах замын ангилал.
 * ⚠️ `path`/`footway` ЗОРИУДААР ХАСАГДСАН: тэдгээр нь гэр хорооллын явган жим
 * (энэ бүсэд 553 ширхэг) бөгөөд машины сүлжээнд оруулбал автомашин хашаа
 * дундуур явж, ачаалал худал тархана.
 */
const DRIVE = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential',
  'living_street', 'service',
]);

/**
 * Ангилал → чиглэл тус бүрийн ЭГНЭЭНИЙ таамаг.
 * ⚠️ OSM-д `lanes` шошго энэ бүсэд ЗӨВХӨН 8% замд бий тул ангиллаар таамаглана.
 * Шошготой зам дээр таамгийн оронд БОДИТ утгыг авна (доорх `lanes` талбар).
 */
const LANES_BY_CLASS = {
  motorway: 3, trunk: 3, primary: 2, secondary: 2, tertiary: 1,
  unclassified: 1, residential: 1, living_street: 1, service: 1,
};

const OVERPASS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const UA = 'Selbe-DigitalTwin/1.0 (+https://selbe.monmap.mn) road-network-extract';

/** WGS84 → Web Mercator (EPSG:3857) — `roadNet.ts`-ийн сүлжээтэй НЭГ систем */
const R = 6378137;
const toWM = (lon, lat) => [
  +(R * ((lon * Math.PI) / 180)).toFixed(1),
  +(R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))).toFixed(1),
];

const query = `[out:json][timeout:90];
way["highway"](${BBOX});
out tags geom;`;

async function overpass() {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      });
      const text = await r.text();
      if (!r.ok || !text.trim().startsWith('{')) throw new Error(`${r.status}: ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      console.warn(`  ${url} → ${e.message}`);
    }
  }
  throw lastErr;
}

/** «2», «2;3», «bus|2» зэрэг эмх замбараагүй утгаас эхний бүхэл тоог авна */
const intOf = (v) => {
  const m = String(v ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 12 ? n : null;
};

console.log(`OSM татаж байна — bbox ${BBOX}`);
const j = await overpass();
const all = j.elements ?? [];

const classes = [];
const ways = [];
let km = 0;
let tagged = 0;

for (const w of all) {
  const hw = w.tags?.highway;
  if (!DRIVE.has(hw)) continue;
  const geom = w.geometry ?? [];
  if (geom.length < 2) continue;

  let ci = classes.indexOf(hw);
  if (ci < 0) { classes.push(hw); ci = classes.length - 1; }

  // ⚠️ Хоёр чиглэлийн НИЙТ эгнээ шошиглогддог тул чиглэл тус бүрд хуваана
  const raw = intOf(w.tags.lanes);
  const oneway = w.tags.oneway === 'yes' || w.tags.oneway === '1' || w.tags.oneway === '-1';
  const perDir = raw == null ? null : Math.max(1, oneway ? raw : Math.round(raw / 2));
  if (raw != null) tagged++;

  const g = geom.map((p) => toWM(p.lon, p.lat));
  for (let i = 1; i < g.length; i++) {
    // Урт нь ХЭМЖИЛТИЙН зорилгоор — Web Mercator-ын сунадаг байдлыг арилгана
    const lat = ((geom[i].lat + geom[i - 1].lat) / 2 * Math.PI) / 180;
    km += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]) * Math.cos(lat) / 1000;
  }

  ways.push({
    c: ci,
    l: perDir,
    o: oneway ? 1 : 0,
    ...(w.tags.name ? { n: w.tags.name } : {}),
    ...(intOf(w.tags.maxspeed) ? { s: intOf(w.tags.maxspeed) } : {}),
    g,
  });
}

const out = {
  meta: {
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
    generated: new Date().toISOString().slice(0, 10),
    bbox: BBOX,
    crs: 'EPSG:3857',
    ways: ways.length,
    km: +km.toFixed(2),
    lanesTagged: tagged,
  },
  classes,
  lanesByClass: LANES_BY_CLASS,
  ways,
};

mkdirSync('public/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const size = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`\n${OUT} — ${ways.length} way · ${km.toFixed(2)} км · ${size} кБ`);
console.log(`ангилал: ${classes.map((c, i) => `${c}(${ways.filter((w) => w.c === i).length})`).join(' · ')}`);
console.log(`эгнээ шошготой: ${tagged}/${ways.length} (${Math.round((tagged / ways.length) * 100)}%) — бусад нь ангиллын таамгаар`);
console.log(`\n⚠️ Нийтлэхдээ «${out.meta.attribution}» эшлэлийг газрын зурагт харуулна.`);
