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

/* ⚠️ Org-only үйлчилгээ, токенгүй → алгасна (`tools/ts-alias.mjs`, 2026-09-17). */
if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const FAIL = [];
const WARN = [];
/** ⚠️ 2026-10-21: эрхгүй (403/499) эх сурвалж — хазайлт БИШ, ⏭ алгасна (доорх `isNoPerm`) */
const SKIP = [];
const REQ_TIMEOUT = 20000;
/** ⚠️ ArcGIS «Too many requests» өгдөг тул зэрэг хүсэлтийг хязгаарлана */
const CONCURRENCY = 6;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQ_TIMEOUT) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status });
  const body = await res.json();
  /* ⚠️ ArcGIS алдаа HTTP 200-аар ирдэг — кодыг нь хадгална (403/499 = эрхгүй) */
  if (body?.error) throw Object.assign(new Error(body.error.message ?? 'ArcGIS алдаа'), { code: body.error.code });
  return body;
}

/**
 * ⚠️ 2026-10-21: ЭРХГҮЙ ≠ ХАЗАЙЛТ. Enterprise дээр зарим үйлчилгээ (`IoT_sensor` FeatureServer/12–16,
 *    ХАБЭА-гийн Survey123) энэ шалгуурын токенд 403 «User does not have permissions» өгдөг — үйлчилгээ БАЙГАА,
 *    зөвхөн хуваалцлын тохиргоо. Урьд нь эдгээр «ХҮРЭХГҮЙ» зөрчил болж шалгуурыг байнга унагадаг байв.
 *    Одоо ⏭ алгасаж САНУУЛНА; бусад алдаа (400 Invalid URL, устсан давхарга, Token Required) хэвээр УНАНА.
 */
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

const { LAYERS, layerUrl, oidOf, TD } = await import('./../services.ts');
/* ⚠️ 2026-10-21: Enterprise-ийн зураглал ба талбарын толь — ӨӨРӨӨ дахин бичихгүй, кодын замтай ИЖИЛ функц */
const { remapUrl, entDict, entFieldName, isAgolUrl } = await import('./../services/entMap.ts');
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

/*
 * ⚠️ 2026-10-21: хаяг БҮРИЙГ `remapUrl`-аар. `DATASETS`-ийн `url` нь AGOL-ын ТҮЛХҮҮР хаяг (`services.arcgis.com/…`)
 *    хэвээр — кодын `query.run` зураглаж асуудаг ч энэ шалгуур шууд fetch хийдэг тул «Token Required» гэж
 *    худал унадаг байв. `layerUrl` аль хэдийн зураглагдсан — давхар дуудахад хэвээр.
 */
const targets = [
  ...LAYERS.map((l) => ({ id: l.id, title: l.title, url: remapUrl(layerUrl(l)), want: declaredFields(l) })),
  ...DATASETS.map((d) => ({ id: d.id, title: d.title, url: remapUrl(d.url), want: declaredDatasetFields(d) })),
];

let checked = 0;
await pool(targets, async (t) => {
  let meta;
  if (isAgolUrl(t.url)) {
    FAIL.push(`\`${t.id}\` «${t.title}» — Enterprise зураглалд АЛГА (AGOL түлхүүр хэвээр): ${t.url}`);
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
  /*
   * ⚠️ 2026-10-21: Enterprise-д талбарын нэр ЖИЖИГ үсгээр (`OBJECTID`→`objectid`, `BAGTS`→`bagts`), зарим нь
   *    НЭР СОЛИГДСОН (`EditDate`→`last_edited_date`, толины `ren`), геометрийн систем `SHAPE__Area`. Кодод AGOL-ын
   *    эх нэр үлддэг тул урьд нь том/жижиг үсгийг ялгаж жишээд OBJECTID · Shape__Area г.м. ~160 худал зөрчил
   *    гардаг байв. Одоо кодын нэрийг `entFieldName`-ээр (= `entRequestWith`-ийн хөрвүүлэлт) Enterprise нэр
   *    болгоод ЖИЖИГ үсгээр жишнэ — кодын асуулга яг энэ нэрээр явдаг тул «байгаа» нь бодит баталгаа.
   */
  const have = new Set((meta.fields ?? []).map((f) => String(f.name).toLowerCase()));
  const dict = entDict(t.url);
  if (!have.size) {
    FAIL.push(`\`${t.id}\` «${t.title}» — талбар огт ирсэнгүй (устсан эсвэл төрөл нь өөр байж магадгүй)`);
    return;
  }
  const missing = t.want.filter((f) => !have.has(entFieldName(f, dict).toLowerCase()));
  if (missing.length) {
    FAIL.push(`\`${t.id}\` «${t.title}» — кодод нэрлэсэн талбар АЛГА: ${missing.join(', ')}`);
  }
  checked++;
  if (checked % 25 === 0) console.log(`  … ${checked}/${targets.length}`);
});

/* ── 3. Үйлчилгээнд байгаа ч бүртгэлд ОРООГҮЙ давхаргууд ── */

const knownUrls = new Set(LAYERS.map((l) => remapUrl(layerUrl(l))));

/**
 * ⚠️ НЭРЭЭР Ч жишнэ. Зарим давхарга ЕТ-д хуучин хувилбараараа үлдсэн ч бүртгэл
 * түүнийг ШИНЭ тусдаа үйлчилгээнээс авдаг (жиш. «Дугуйн зам» →
 * `dugui_zam_20260731`). Зөвхөн хаягаар жиштэл тэдгээрийг «агент мэдэхгүй» гэж
 * буруу мэдээлж, шалгуур чимээ шуугиан болно.
 */
const norm = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/[^0-9a-zа-яөү]/gi, '');
const knownNames = new Set(LAYERS.map((l) => norm(l.title)));

/**
 * САНААТАЙ ОРХИГДСОН ДАВХАРГУУД — «бүртгэлд алга» гэж мэдээлэхгүй.
 *
 * ⚠️ ЭДГЭЭР НЬ ХУУЧИРСАН ХУУЛБАР, дутуу бүртгэл БИШ. `Цамхагт_кран_0813`
 *    ба `Цамхагт_кран_бүс_0813` нь `data` үйлчилгээн дэх хөлдүү хуулбарууд:
 *    2026-09-04-нд кран нь ӨӨРИЙН эх үйлчилгээ рүү шилжсэн
 *    (`Цамхагт_кран/FeatureServer/50` ба `/51`, `services.ts`-ийн
 *    `habea:crane`/`habea:buffer`).
 *
 * ⚠️ ЯАГААД БУЦААЖ НЭМЭХГҮЙ ВЭ: хуулбар дээр `Tuluv` талбар БҮХ 50 кранг
 *    «Одоо байгаа» гэж бичсэн байдаг; эх үйлчилгээнд «Одоо байгаа» 48,
 *    «Буусан» 2. Хуулбарыг бүртгэвэл буусан кран «ажиллаж байгаа» мэт
 *    уншигдаж, ХАБЭА-гийн «идэвхтэй N/N» заалт худал болно.
 *
 * ⚠️ Санамжийг ЗҮГЭЭР дуугүй болгосонгүй — ЯАГААДЫГ нь энд бичсэн нь
 *    дараагийн сесс «туслах» гэж буцааж нэмэхээс сэргийлнэ.
 */
const IGNORED = new Set([
  'Цамхагт_кран_0813',
  'Цамхагт_кран_бүс_0813',
].map(norm));

/*
 * ⚠️ 2026-08-27: урьд нь энэ хэсэг `Selbe_ET_20260721`/`_20260725` хоёрыг
 * скан хийдэг байв — тэр хоёр үйлчилгээ хаагдсан тул шалгуур бүрд хоёр
 * «уншигдсангүй» санамж гаргадаг байсан. Одоо давхаргууд бүгд НЭГТГЭСЭН
 * `data` үйлчилгээнд байдаг тул түүнийг л скан хийнэ — «үйлчилгээнд бий,
 * бүртгэлд алга» гэсэн жинхэнэ мэдээлэл эндээс гарна.
 */
/*
 * ⚠️ 2026-10-21: `TD` нь AGOL-ын ТҮЛХҮҮР (`SELBE_ALL_DATA_last_0917`, устсан → «Token Required»). Enterprise-д
 *    түүний давхаргууд НЭГ үйлчилгээ биш — `Bagts_ajluud` · `selbe_ET` · `Gazar_choloololt` … руу ТАРСАН
 *    (`ENT_MAP`-д `SELBE_ALL_DATA_last_0917/*` түлхүүр байхгүй тул `remapUrl(TD)` хэвээр AGOL хаяг буцаана,
 *    `agolLayerId` ч дугаарыг хэвээр өгнө). Тиймээс `ENT_MAP`-аас TD-ийн давхаргууд очдог Enterprise үйлчилгээ
 *    бүрийн каталогийг уншина. `Bagts_ajluud` нь SELBE_ALL_DATA + инженерийн давхаргууд (198) ӨӨР дугаартай —
 *    Enterprise давхарга бүрийг `ENT_MAP`-ийн урвуугаар AGOL түлхүүр рүү буцааж:
 *      · TD-ээс ирсэн → `<AGOL №>:<нэр>` (кодын түлхүүртэй ижил дугаар) — бүртгэлд алга бол санамж;
 *      · ӨӨР AGOL үйлчилгээнээс (инженерийн `infra:N` г.м.) → энд алгасна (тэд өөрийн бүртгэлээр дээр шалгагдсан);
 *      · ямар ч AGOL түлхүүргүй → Enterprise дээр ШИНЭ нэмэгдсэн давхарга `ent:<№>:<нэр>` — санамж.
 */
const { ENT_MAP } = await import('./../services/entMap.data.ts');
const { ENT_DATA } = await import('./../services/entMap.ts');
const tdSvc = decodeURIComponent(TD.replace(/\/FeatureServer$/i, '').split('/').pop());
/** Enterprise `<үйлчилгээ>/<№>` → AGOL `<үйлчилгээ>/<№>` */
const entToAgol = new Map(Object.entries(ENT_MAP).filter(([k]) => !k.endsWith('/*')).map(([k, v]) => [v, k]));
const entSvcs = remapUrl(TD) !== TD
  ? [remapUrl(TD).replace(/\/FeatureServer$/i, '').split('/').pop()].map(decodeURIComponent)
  : [...new Set(Object.entries(ENT_MAP)
    .filter(([k]) => k.startsWith(`${tdSvc}/`))
    .map(([, v]) => v.slice(0, v.lastIndexOf('/'))))];

for (const svc of ENT_DATA ? entSvcs : []) {
  const base = `${ENT_DATA}/${encodeURIComponent(svc)}/FeatureServer`;
  try {
    const root = await getJson(`${base}?f=json`);
    const extra = (root.layers ?? [])
      .map((x) => {
        const agol = entToAgol.get(`${svc}/${x.id}`);
        if (!agol) return { ...x, label: `ent:${x.id}` };
        if (!agol.startsWith(`${tdSvc}/`)) return null;
        return { ...x, label: agol.slice(tdSvc.length + 1) };
      })
      .filter((x) => x
        && !knownUrls.has(`${base}/${x.id}`)
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
