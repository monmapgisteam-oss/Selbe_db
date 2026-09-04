/**
 * ХАЗАЙЛТЫН ШАЛГУУР (drift check) — «агент төслийн хамт хөгжинө» гэдгийн БАТАЛГАА.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: агентын бүртгэл `services.ts`-ээс гардаг ч ТЭР нь
 * ArcGIS үйлчилгээг дүрсэлсэн ГАРААР бичсэн тодорхойлолт. Хэрэв үйлчилгээн дээр
 * давхарга хасагдвал / талбар нэр солигдвол `services.ts` хуучирч, агент
 * БАЙХГҮЙ зүйлийн тухай итгэлтэй ярьж эхэлнэ. Энэ шалгуур яг тэр мөчид барина.
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

const FAIL = [];
const WARN = [];
const REQ_TIMEOUT = 20000;
/** ⚠️ ArcGIS «Too many requests» өгдөг тул зэрэг хүсэлтийг хязгаарлана */
const CONCURRENCY = 6;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQ_TIMEOUT) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(body.error.message ?? 'ArcGIS алдаа');
  return body;
}

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

const { LAYERS, layerUrl, oidOf, TD } = await import('./../services.ts');
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
  // ⚠️ ZONE_ID нь `noZone` тэмдэглэгээгүй БҮХ давхаргад байх ёстой гэж код үздэг
  if (!l.noZone && !l.zoneField) f.add('ZONE_ID');
  return [...f];
}

const declaredDatasetFields = (d) => [...new Set([d.oid ?? 'OBJECTID', ...Object.keys(d.fields ?? {})])];

/* ── 1–2. Эх сурвалж бүрийг шалгах ── */

console.log(`Шалгаж байна: ${LAYERS.length} давхарга + ${DATASETS.length} өгөгдлийн эх сурвалж…\n`);

const targets = [
  ...LAYERS.map((l) => ({ id: l.id, title: l.title, url: layerUrl(l), want: declaredFields(l) })),
  ...DATASETS.map((d) => ({ id: d.id, title: d.title, url: d.url, want: declaredDatasetFields(d) })),
];

let checked = 0;
await pool(targets, async (t) => {
  let meta;
  try {
    meta = await getJson(`${t.url}?f=json`);
  } catch (e) {
    FAIL.push(`\`${t.id}\` «${t.title}» — үйлчилгээнд ХҮРЭХГҮЙ: ${e.message}\n      ${t.url}`);
    return;
  }
  const have = new Set((meta.fields ?? []).map((f) => f.name));
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

/**
 * ⚠️ НЭРЭЭР Ч жишнэ. Зарим давхарга ЕТ-д хуучин хувилбараараа үлдсэн ч бүртгэл
 * түүнийг ШИНЭ тусдаа үйлчилгээнээс авдаг (жиш. «Дугуйн зам» →
 * `dugui_zam_20260731`). Зөвхөн хаягаар жиштэл тэдгээрийг «агент мэдэхгүй» гэж
 * буруу мэдээлж, шалгуур чимээ шуугиан болно.
 */
const norm = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/[^0-9a-zа-яөү]/gi, '');
const knownNames = new Set(LAYERS.map((l) => norm(l.title)));

/*
 * ⚠️ 2026-08-27: урьд нь энэ хэсэг `Selbe_ET_20260721`/`_20260725` хоёрыг
 * скан хийдэг байв — тэр хоёр үйлчилгээ хаагдсан тул шалгуур бүрд хоёр
 * «уншигдсангүй» санамж гаргадаг байсан. Одоо давхаргууд бүгд НЭГТГЭСЭН
 * `data` үйлчилгээнд байдаг тул түүнийг л скан хийнэ — «үйлчилгээнд бий,
 * бүртгэлд алга» гэсэн жинхэнэ мэдээлэл эндээс гарна.
 */
for (const base of [TD]) {
  try {
    const root = await getJson(`${base}?f=json`);
    const extra = (root.layers ?? [])
      .filter((x) => !knownUrls.has(`${base}/${x.id}`) && !knownNames.has(norm(x.name)))
      .map((x) => `${x.id}:${x.name}`);
    if (extra.length) {
      WARN.push(
        `${base.split('/').slice(-2, -1)[0]} — үйлчилгээнд бий, бүртгэлд АЛГА (${extra.length}): ` +
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

console.log(`✅ Хазайлт алга — ${targets.length} эх сурвалж, кодод нэрлэсэн бүх талбар үйлчилгээн дээр байна.`);
