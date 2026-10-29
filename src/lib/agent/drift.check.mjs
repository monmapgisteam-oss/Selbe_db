/**
 * ХАЗАЙЛТЫН ШАЛГУУР (drift check) — «агент төслийн хамт хөгжинө» гэдгийн БАТАЛГАА.
 *
 * Юу шалгах вэ:
 *   1. Бүртгэлд байгаа эх сурвалж бүр ҮЙЛЧИЛГЭЭН ДЭЭР БАЙГАА эсэх
 *   2. Кодод нэрлэсэн талбар бүр (хэмжээ, өртөг, ангилал, бүс, тайлбар) БОДИТООР байгаа эсэх
 *   3. Үйлчилгээнд ШИНЭ давхарга нэмэгдсэн ч бүртгэлд ороогүй эсэх (мэдээлэл)
 *
 * 1–2 нь УНАНА (алдаа). 3 нь зөвхөн САНУУЛГА — шинэ давхаргыг нэмэх эсэх нь
 * хүний шийдвэр, гэхдээ «мэдээгүй өнгөрөх» боломжгүй болно.
 *
 * Ажиллуулах:  npm run test:drift
 */

import { setTimeout as sleep } from 'node:timers/promises';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const FAIL = [];
const WARN = [];
const SKIP = [];
const REQ_TIMEOUT = 20000;
const CONCURRENCY = 6;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQ_TIMEOUT) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status });
  const body = await res.json();
  if (body?.error) throw Object.assign(new Error(body.error.message ?? 'ArcGIS алдаа'), { code: body.error.code });
  return body;
}

const isNoPerm = (e) => e?.code === 403 || e?.code === 499
  || /does not have permissions/i.test(e?.message ?? '');

/** Дараалалтай зэрэгцээ гүйцэтгэл */
async function pool(items, worker) {
  const out = [];
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return out;
}

const { LAYERS, layerUrl, oidOf, ENT_HOSTED } = await import('./../services.ts');
const { DATASETS } = await import('./datasets.ts');
const { AGENT_NOTES } = await import('./notes.ts');

/* ── Кодод нэрлэсэн талбаруудыг цуглуулах ── */

function declaredFields(l) {
  const f = new Set([oidOf(l)]);
  if (l.qty?.field) f.add(l.qty.field);
  if (l.paint?.field) f.add(l.paint.field);
  if (l.breaks?.field) f.add(l.breaks.field);
  if (l.zoneField) f.add(l.zoneField);
  for (const x of l.facets ?? []) f.add(x.field);
  for (const k of Object.keys(AGENT_NOTES[l.id]?.fields ?? {})) f.add(k);
  if (!l.noZone && !l.zoneField) f.add('zone_id');
  return [...f];
}

const declaredDatasetFields = (d) => [...new Set([d.oid ?? 'objectid', ...Object.keys(d.fields ?? {})])];

/* ── 1–2. Эх сурвалж бүрийг шалгах ── */

console.log(`Шалгаж байна: ${LAYERS.length} давхарга + ${DATASETS.length} өгөгдлийн эх сурвалж…\n`);

const targets = [
  ...LAYERS.map((l) => ({ id: l.id, title: l.title, url: layerUrl(l), want: declaredFields(l) })),
  ...DATASETS.map((d) => ({ id: d.id, title: d.title, url: d.url, want: declaredDatasetFields(d) })),
];

let checked = 0;
await pool(targets, async (t) => {
  let meta;
  if (/\/FeatureServer\//.test(t.url) && !t.url.startsWith(`${ENT_HOSTED}/`)) {
    FAIL.push(`\`${t.id}\` «${t.title}» — Enterprise-ээс гадуурх хаяг: ${t.url}`);
    return;
  }
  try {
    meta = await getJson(`${t.url}?f=json`);
  } catch (e) {
    if (isNoPerm(e)) {
      SKIP.push(`\`${t.id}\` «${t.title}» — эрхгүй (${e.code ?? '?'}): ${t.url}`);
      return;
    }
    FAIL.push(`\`${t.id}\` «${t.title}» — үйлчилгээнд ХҮРЭХГҮЙ: ${e.message}\n      ${t.url}`);
    return;
  }
  const have = new Set((meta.fields ?? []).map((f) => String(f.name)));
  if (!have.size) {
    FAIL.push(`\`${t.id}\` «${t.title}» — талбар огт ирсэнгүй (устсан эсвэл төрөл нь өөр байж магадгүй)`);
    return;
  }
  const missing = t.want.filter((f) => !have.has(f));
  if (missing.length) {
    FAIL.push(`\`${t.id}\` «${t.title}» — кодод нэрлэсэн талбар АЛГА: ${missing.join(', ')}`);
  }
  checked++;
  if (checked % 25 === 0) console.log(`  … ${checked}/${targets.length}`);
});

/* ── 3. Үйлчилгээнд байгаа ч бүртгэлд ОРООГҮЙ давхаргууд ── */

const knownUrls = new Set(LAYERS.map((l) => layerUrl(l)));

const norm = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/[^0-9a-zа-яөү]/gi, '');
const knownNames = new Set(LAYERS.map((l) => norm(l.title)));

/**
 * САНААТАЙ ОРХИГДСОН ДАВХАРГУУД — «бүртгэлд алга» гэж мэдээлэхгүй.
 */
const IGNORED = new Set([
  'Цамхагт_кран_0813',
  'Цамхагт_кран_бүс_0813',
].map(norm));

const entSvcs = [...new Set(LAYERS.map((l) => layerUrl(l))
  .filter((u) => u.startsWith(`${ENT_HOSTED}/`) && /\/FeatureServer\/\d+$/.test(u))
  .map((u) => decodeURIComponent(u.slice(ENT_HOSTED.length + 1).replace(/\/FeatureServer\/\d+$/, ''))))];

for (const svc of entSvcs) {
  const base = `${ENT_HOSTED}/${encodeURIComponent(svc)}/FeatureServer`;
  try {
    const root = await getJson(`${base}?f=json`);
    const extra = (root.layers ?? [])
      .map((x) => ({ ...x, label: `ent:${x.id}` }))
      .filter((x) => !knownUrls.has(`${base}/${x.id}`)
        && !knownNames.has(norm(x.name))
        && !IGNORED.has(norm(x.name)))
      .map((x) => `${x.label}:${x.name}`);
    if (extra.length) {
      WARN.push(
        `${svc} — үйлчилгээнд бий, бүртгэлд АЛГА (${extra.length}): ` +
          extra.slice(0, 12).join(' · ') +
          (extra.length > 12 ? ` … +${extra.length - 12}` : ''),
      );
    }
  } catch (e) {
    WARN.push(`Үйлчилгээний жагсаалт уншигдсангүй: ${base} (${e.message})`);
  }
  await sleep(150);
}

/* ── Дүн ── */

console.log();
if (SKIP.length) {
  console.log(`⏭  АЛГАСАВ — эрхгүй (403/499), хазайлт шалгагдсангүй (${SKIP.length}):`);
  for (const w of SKIP) console.log(`   ${w}`);
  console.log();
}
if (WARN.length) {
  console.log('⚠️  САНУУЛГА — агент эдгээрийг МЭДЭХГҮЙ (нэмэх эсэх нь таны шийдвэр):');
  for (const w of WARN) console.log(`   ${w}`);
  console.log();
}
if (FAIL.length) {
  console.error('❌ ХАЗАЙЛТ — код ба үйлчилгээ ЗӨРЖ БАЙНА:');
  for (const f of FAIL) console.error(`   ${f}`);
  console.error(`\n❌ ${FAIL.length} зөрчил. \`services.ts\` эсвэл \`datasets.ts\`-ыг үйлчилгээтэй тааруулна уу.`);
  process.exit(1);
}

console.log(`✅ Хазайлт алга — ${targets.length - SKIP.length}/${targets.length} эх сурвалж (${SKIP.length} эрхгүй ⏭), кодод нэрлэсэн бүх талбар үйлчилгээн дээр байна.`);
