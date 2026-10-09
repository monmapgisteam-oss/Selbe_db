/**
 * ӨГӨГДЛИЙН АВТОБУСЫН БҮТЦИЙН ХАМААРАЛ — статик шалгуур.
 *   node src/lib/dataBus.invariant.check.mjs
 *
 * ⚠️ ЭНЭ ШАЛГУУР ЛОГИК ДАВХАРДУУЛДАГГҮЙ. Бусад хэд хэдэн `check.mjs` нь
 * шалгах логикоо гараар хуулж авсан тул эх кодыг зассан ч ногоон үлдэж
 * чаддаг (жиш. `dataBus.check.mjs`, `finEdit.check.mjs`). Энэ файл эх кодыг
 * ӨӨРИЙГ нь уншиж БҮТЦИЙГ тулгана — хуулбар байхгүй тул хоцрох боломжгүй.
 *
 * Хамгаалж буй алдаа (2026-09-01-нд бодитоор олдсон):
 *   `hyanalt.ts` нь `applyEdits`-ээр хяналтын хүснэгтэд бичдэг атлаа
 *   `invalidate('HYANALT')` дуудахгүй байв. Хянагч ажил батлахад ArcGIS
 *   шинэчлэгддэг ч «Үйл ажиллагааны схем» ба хүлээгдлийн KPI 5 минут
 *   хүртэл ХУУЧИН тоо харуулж, шийдвэр хийгдээгүй мэт харагддаг байлаа.
 *   Дэлгэц дээр ямар ч алдаа гарахгүй тул нүдээр илрэхгүй төрлийн согог.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const BS = String.fromCharCode(92);

/* ── Эх файлуудыг цуглуулах ── */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/[.]tsx?$/.test(e)) files.push(p.split(BS).join('/'));
  }
})(ROOT);

const read = (f) => readFileSync(f, 'utf8');

/* ── 1. `DataKey` нэгдмэл төрлийг ЭХ ФАЙЛААС уншина ── */
/* ⚠️ 2026-10-09: ТАЙЛБАРЫГ ХАСААД уншина. Нэгдлийн дотор «'IPC_LOG' … ХАСАГДАВ» гэсэн
   тайлбар байдаг тул түүхий текстээс устгагдсан `IPC_LOG` ч түлхүүр мэт уншигддаг байв
   (ХАМААРАЛ 3 хуурамч ногоон); тайлбар дахь `;` нь блокийг дутуу тасалж ч болно.
   `stripNoise` (доор, hoisted) нь мөрийн литералыг хадгалж зөвхөн тайлбарыг арилгана.
   Давхардлыг `Set`-ээр арилгана. */
const busSrc = stripNoise(read('src/lib/dataBus.ts'));
const unionAt = busSrc.indexOf('export type DataKey');
assert.ok(unionAt > 0, 'DataKey нэгдэл олдсонгүй');
const unionBlock = busSrc.slice(unionAt, busSrc.indexOf(';', unionAt));
const KEYS = [...new Set([...unionBlock.matchAll(/'([A-Z_0-9]+)'/g)].map((m) => m[1]))];
assert.ok(!KEYS.includes('IPC_LOG'), 'DataKey: тайлбар дахь хасагдсан IPC_LOG түлхүүр болж уншигдав — stripNoise ажиллахгүй байна');
assert.ok(KEYS.length >= 5, 'DataKey нэгдэл уншигдсангүй');

/* ── Хаалтын балансаар дуудлагын БҮТЭН текстийг авах туслах ── */
function callText(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length && i - openIdx < 20000; i++) {
    const c = src[i];
    if (c === '(') d += 1;
    else if (c === ')') { d -= 1; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx, openIdx + 4000);
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/**
 * Тайлбар ба мөрийн литералыг ЗАЙГААР солино (мөрийн дугаар хадгалагдана).
 *
 * ⚠️ Заавал хэрэгтэй: `Dashboard.tsx:203` дээрх тайлбар дотор «cached()» гэж
 * ПРОЗООР бичигдсэн байдаг тул түүхий текстээр хайвал хуурамч эерэг өгнө.
 */
function stripNoise(src) {
  let out = '';
  let i = 0;
  const keep = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += keep(src.slice(i, stop)); i = stop; continue;
    }
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out += keep(src.slice(i, stop)); i = stop; continue;
    }
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === BS) j += 1; j += 1; }
      const stop = Math.min(j + 1, src.length);
      /* Тагийн массивыг хайхын тулд мөрийн АГУУЛГЫГ үлдээнэ — зөвхөн
         `//` `/*` тайлбарыг арилгах нь зорилго. */
      out += src.slice(i, stop); i = stop; continue;
    }
    out += c; i += 1;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ХАМААРАЛ 1 — `cached()` бүр `reads` тагаа зарлана

   Таггүй кэш нь бичилтийн дараа ХУУЧИН утгаа барина. Зөвхөн порталаас
   БИЧИГДДЭГГҮЙ хүснэгтээс уншдаг кэш үүнээс чөлөөлөгдөнө — тэдгээрийг
   доор ил жагсаав. Шинэ таггүй кэш нэмэгдвэл ЭНЭ ШАЛГУУР УНАНА.
   ══════════════════════════════════════════════════════════════════ */

/** Порталаас бичигддэггүй хүснэгтээс уншдаг тул тагийн шаардлагагүй кэшүүд. */
/* ⚠️ 2026-09-17: `gdash.loadBuildPkgs` (BUILDING) ба `gdash.loadHseNow` (HABEA) тагтай
   болсон тул эндээс хасагдав. */
const TAGGUI_ZOVSHOOROGDSON = new Map([
  ['src/lib/live.ts:loadSocial',
    'Нийгмийн дэд бүтцийн каталогийн давхаргууд — портал тэдгээрт ОГТ бичдэггүй. '
    + 'Dashboard.tsx:203-ын тайлбарын дагуу DashData-гийн ачаалагчидтай ЖИГД '
    + 'session-кэштэй байлгах нь САНААТАЙ шийдвэр.'],
  ['src/modules/Dashboard.tsx:loadSources',
    'SOURCE_FS (эх үүсвэрийн байгууламж) — порталд засах зам байхгүй.'],
  ['src/lib/irged.ts:loadGerBuilt',
    'Гэр хорооллын одоогийн барилга (Irgeded_hureh_ur_uguuj/0) — зайнаас '
    + 'тандан судалгаагаар үүссэн СУУРЬ давхарга, порталд засах зам байхгүй.'],
  /* ⚠️ 2026-09-28: `socPlannedFull` (irged.ts) дуудагчгүй үхмэл код тул устгагдав — мөр нь энд байхгүй. */
  /* ── CEO самбар (2026-09-06) ── */
  ['src/lib/ceo/iot.ts:loadIotKpi',
    'IoT мэдрэгчийн заалт — ӨӨР ArcGIS байгууллага (`sensors.ts`-ийн тайлбар), '
    + 'портал тийш ОГТ бичдэггүй, автобусын түлхүүр байхгүй. `loadSensors` '
    + 'өөрөө 5 мин TTL кэштэй тул энэ давхарга 5 мин TTL-ээр л шинэчлэгдэнэ.'],
  ['src/lib/ceo/suitability.ts:loadSuitabilityKpi',
    'Тохиромжтой байдлын шинжилгээ — бүс, барилга, ногоон байгууламжийн '
    + 'ТӨЛӨВЛӨЛТИЙН СТАТИК давхаргууд (`analysis/data.ts`), портал тэдгээрт '
    + 'бичдэггүй; `loadAnalysisCached` мөн TTL-гүй модулийн кэш тул түүнтэй '
    + 'ЖИГД сешн-кэш нь санаатай.'],
]);

const untagged = [];
const tagged = [];
for (const f of files) {
  if (f.endsWith('dataBus.ts')) continue;
  const src = stripNoise(read(f));
  /*
   * ⚠️ ЗӨВХӨН `live.ts`-ийн `cached()` энэ хамааралд орно — тэр л автобусад
   * өөрийгөө бүртгэдэг. `sensors.ts` нь ИЖИЛ НЭРТЭЙ өөрийн дотоод `cached`
   * тодорхойлсон (IoT нь өөр байгууллагад, автобусаар тархдаггүй) тул
   * түүнийг оруулбал хуурамч улаан болно.
   */
  const usesBus = f.endsWith('live.ts')
    || /import\s*\{[^}]*\bcached\b[^}]*\}\s*from\s*'[^']*live'/.test(src);
  if (!usesBus) continue;
  for (const m of src.matchAll(/[^\w.]cached\s*(?:<[^;\n]*?>)?\s*\(/g)) {
    /* `function cached(` тодорхойлолт ба `import { cached }` — дуудлага БИШ */
    const head = src.slice(Math.max(0, m.index - 40), m.index + 1);
    if (/function\s*$/.test(head.replace(/cached\s*$/, '')) || /\bimport\b[^;]*$/.test(head)) continue;
    const openIdx = src.indexOf('(', m.index);
    const text = callText(src, openIdx);
    const line = lineOf(src, m.index);
    /* Дуудлагын дотор `['KEY', …]` массив байвал тагтай */
    const hasReads = /\[\s*'[A-Z_0-9]+'(\s*,\s*'[A-Z_0-9]+')*\s*,?\s*\]/.test(text);
    /* Нэрийг дуудлагын өмнөх `const X =`-ээс авна */
    const before = src.slice(Math.max(0, m.index - 240), m.index + 1);
    const nm = [...before.matchAll(/(?:const|let)\s+(\w+)[^=\n]*=\s*[^=]*$/g)].pop();
    const name = nm ? nm[1] : `(мөр ${line})`;
    (hasReads ? tagged : untagged).push({ f, line, name, key: `${f}:${name}` });
  }
}

console.log(`cached() дуудлага: ${tagged.length + untagged.length} · тагтай ${tagged.length} · таггүй ${untagged.length}`);

const shineTagguil = untagged.filter((u) => !TAGGUI_ZOVSHOOROGDSON.has(u.key));
for (const u of shineTagguil) console.error(`  ✖ ${u.f}:${u.line}  ${u.name} — reads таг алга`);
assert.equal(
  shineTagguil.length, 0,
  'Шинэ таггүй cached() илэрлээ. Уншиж буй хүснэгтийн DataKey-г 3 дахь аргумент болгож өг; '
  + 'порталаас бичигддэггүй хүснэгт бол TAGGUI_ZOVSHOOROGDSON-д шалтгаантайгаар нэм.',
);
console.log('✅ cached() бүр тагтай (эсвэл ил зөвшөөрөгдсөн)');

/* Зөвшөөрлийн жагсаалт ХУУЧИРСАН эсэх — засагдсан зүйл жагсаалтад үлдэхгүй */
const uldegdel = [...TAGGUI_ZOVSHOOROGDSON.keys()].filter((k) => !untagged.some((u) => u.key === k));
assert.equal(
  uldegdel.length, 0,
  `TAGGUI_ZOVSHOOROGDSON хуучирсан (эдгээр аль хэдийн тагтай болсон): ${uldegdel.join(', ')}`,
);
console.log('✅ зөвшөөрлийн жагсаалт хуучраагүй');

/* ══════════════════════════════════════════════════════════════════
   ХАМААРАЛ 2 — ArcGIS руу БИЧДЭГ файл бүр кэшээ хүчингүй болгоно

   Яг энэ хамаарал зөрчигдсөнөөс `hyanalt.ts`-ийн согог үүссэн.
   ══════════════════════════════════════════════════════════════════ */

/** Бичилт нь ДУУДАГЧ талд хүчингүй болгогддог, эсвэл автобусаар тархдаггүй. */
const BICHEED_DUUDAGCH_HUCHINGUI = new Map([
  ['src/lib/tableWrite.ts',
    'Ерөнхий бичигч — аль хүснэгт болохыг мэдэхгүй. Дуудагч (Finance.tsx, parcelEdit.ts) өөрсдөө хүчингүй болгоно.'],
  ['src/lib/query.ts',
    'Хүсэлтийн ЦӨМ (`arcgisPost`) — өөрөө бичдэггүй; `applyEdits` зөвхөн «бичих endpoint-ийг '
    + 'сүлжээний алдаанд дахин илгээхгүй» дүрмийн (2026-09-30) regex-д нэрлэгдэнэ. Бичилт бүрийг '
    + 'дуудагч store өөрийн DataKey-гээр хүчингүй болгоно.'],
  ['src/lib/qaqc.ts',
    'QAQC хүснэгт нь `dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ: түүнийг зөвхөн «Гүйцэтгэл '
    + 'бөглөх» хуудас багц солих бүрд шууд уншиж (`loadQaqc`), бичсэнийхээ дараа '
    + 'өөрөө дахин татдаг. Хүчингүй болгох хуваалцсан кэш байхгүй.'],
  ['src/lib/permsRemote.ts',
    'Эрхийн хүснэгт нь `dataBus`-аар БИШ, өөрийн store-оор тархдаг (permissions.ts).'],
  ['src/lib/draftRemote.ts',
    'Нооргийн хүснэгт нь `dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ: түүнийг зөвхөн '
    + '«Гүйцэтгэл бөглөх» хуудас нээгдэх агшинд НЭГ удаа уншдаг (`loadRemoteDraft`), '
    + 'дараа нь дэлгэцийн төлөв нь эх сурвалж болно. Хүчингүй болгох кэш байхгүй.'],
  ['src/lib/submission.ts',
    'Илгээлт нь ЯГ ТЭР `Selbe_Guitsetgel_Draft` хүснэгтийн `sub|<багц>` мөрд '
    + 'бичигддэг (`draftRemote.ts`-тэй ижил хүснэгт, ижил шалтгаан): энэ хүснэгт '
    + '`dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ — бөглөх/хянах хуудас нээгдэх агшинд шууд '
    + 'уншиж (`loadActiveSubmission`/`loadSubmissionByOid`), дараа нь дэлгэцийн '
    + 'төлөв эх сурвалж болно. ⚠️ Батлагдахад архивт бичих нь ЭНД БИШ '
    + '`hyanaltStore.apply` дотор (`applyAdds`) явагддаг тул Bagts_* кэшийг '
    + 'тэр зам хүчингүй болгоно (2026-09-04, илгээлтийн завсрын хадгалалт).'],
  ['src/lib/huvaariObyem.ts',
    'Хуваарийн САРЫН задаргааны хүснэгт (`huvaari_obyem`) нь `dataBus`-ийн '
    + 'кэшид ОГТ ОРДОГГҮЙ: `loadPkgPlan` нь `cached()`-гүй, багц солих бүрд '
    + 'шууд уншдаг («Хуваарь» өөрөө; «Гүйцэтгэл бөглөх» `pkg.key` солигдоход; '
    + '`hyanaltStore` архивлах агшинд). Хүчингүй болгох хуваалцсан кэш байхгүй — '
    + '`qaqc.ts`-тэй ижил шалтгаан (2026-09-06, tezu-bonu merge).'],
  /* ⚠️ 2026-09-30: `chanarStore.ts` · `huvaariBatlah.ts` · `obyemBatlah.ts` ·
     `ajilBatlah.ts` · `qaqcDraftRemote.ts` ЭНДЭЭС ХАСАГДАВ — урсгалын хүснэгтүүд
     автобусын түлхүүртэй болж (`CHANAR_BARIMT` · `HUVAARI_BATLAH` · `OBYEM_BATLAH`
     · `AJIL_BATLAH` · `QAQC_DRAFT`), бичих зам бүр `invalidate()` дууддаг.
     ХАМААРАЛ 5 (доор) функц бүрээр нь шалгана. */
  /* ── ⚠️ 2026-10-09: ТУСЛАХ БИЧИГЧИЙН ДУУДАГЧИД (`applyAll(` · `applyUpdates(` · `applyAdds(` ·
     `addRows(`) — доорх WRITER_TOKEN-оор бичигч гэж тоологдоно. Тус бүр ЯАГААД өөрөө
     `invalidate()` дуудахгүй байж болохыг тэмдэглэв. ── */
  ['src/lib/ajilApply.ts',
    '`bagtsSheet.applyAdds`-аар бичдэг — тэр функц өөрөө `invalidate(\'BAGTS_SHEET\')` дууддаг '
    + '(bagtsSheet.ts, `added > 0 || touched > 0`).'],
  ['src/lib/ulsiinKomiss.ts',
    '`bagtsSheet.applyAdds`-аар (500-аар хувааж) бичдэг — тэр өөрөө BAGTS_SHEET-ийг хүчингүй болгоно.'],
  ['src/lib/hyanaltStore.ts',
    'Архив руу `bagtsSheet.applyAdds` (өөрөө BAGTS_SHEET хүчингүй болгоно), хяналтын хүснэгт рүү '
    + '`hyanalt.addRows` (`hyanalt.edit` нь амжилттай үед `invalidate(\'HYANALT\')`) — хоёулаа дотроо.'],
  ['src/lib/hyanaltSubmit.ts',
    '`hyanalt.addRows`-аар бичдэг — `hyanalt.edit` өөрөө `invalidate(\'HYANALT\')` дууддаг.'],
  ['src/modules/Huvaari.tsx',
    '`bagtsSheet.applyUpdates`-аар бичдэг — тэр өөрөө `written > 0` үед BAGTS_SHEET-ийг хүчингүй болгоно.'],
  ['src/modules/sheet/fill/useObyem.ts',
    '`bagtsSheet.applyUpdates`-аар бичдэг — тэр өөрөө BAGTS_SHEET-ийг хүчингүй болгоно.'],
  ['src/lib/butetsEdit.ts',
    '`tableWrite.applyAll`-аар дэд бүтцийн давхаргад бичдэг — автобусын түлхүүр байхгүй; кэшийг '
    + 'дуудагч (`DedButets` → `dropTotalsCache`) хаяна (`layerSummary.ts`-ийн зөвшөөрөлтэй ижил).'],
  ['src/lib/negtgelAuto.ts',
    '`tableWrite.applyAll`-аар TUSUL_NEGTGEL рүү бичих синк нь `loadNegtgelFull`-ийн КЭШ ХООСОН '
    + 'үед (ачаалагч дотроос) дуудагддаг; дэлгэц нь хүснэгтийн бус БОДСОН утгыг харуулдаг. '
    + 'Ачаалагч дотроос `invalidate` хийвэл дахин ачаалал → дахин синкийн давталт үүснэ.'],
  ['src/modules/ErhTypes.tsx',
    '`applyAll` нь ЛОКАЛ React үйлдэл (эрхийн загварыг хэрэглэгчдэд тараах) — ArcGIS-ийн '
    + 'туслах бичигч БИШ; эрх нь `permsRemote`-ийн өөрийн store-оор тархана.'],
  ['src/lib/ficMakt.ts',
    '2026-10-09: FIC · М-акт — Enterprise хүснэгт, `cached()`/автобусыг АШИГЛАДАГГҮЙ (уншилт бүр шууд `loadFm`); '
    + 'бичсний дараа дуудагч (`Ma.tsx` → `onChanged` → `reloadFm`) дахин уншина. Хүчингүй болгох кэш алга.'],
  /* ⚠️ 2026-10-01: `src/modules/sheet/Pivot.tsx` УСТГАГДСАН (хэрэглэгч: бүгдийг зас — Pivot ·
     Level5 · Wbs нь хаанаас ч импортлогддоггүй үхмэл хуудас байв) — эндээс хасав. */
]);

/**
 * ⚠️ 2026-10-09: `applyEdits`-ийн ГАДНА туслах бичигчийн дуудлагууд ч бичилт — урьд нь
 *    зөвхөн `applyEdits` текстийг хайдаг тул `bagtsSheet.applyUpdates` / `tableWrite.applyAll` /
 *    `hyanalt.addRows`-ийг дууддаг файл (Huvaari · useObyem · negtgelAuto …) торноос гулсдаг байв.
 *    Одоо эдгээр токены аль нэг нь байвал бичигч; `invalidate` эсвэл ил зөвшөөрөл шаардана.
 */
const WRITER_TOKEN = /(?:^|[^\w$])(?:applyAll|applyUpdates|applyAdds|addRows)\s*\(/m;
const bichigchid = [];
for (const f of files) {
  /* ⚠️ Тайлбарыг ЗААВАЛ хасна: `MapCanvas.tsx:113` ба `FillNew.tsx:43` нь
     «applyEdits» гэдгийг зөвхөн ПРОЗООР дурдсан — түүхий текстээр хайвал
     бичдэггүй файлыг бичигч гэж андуурна. */
  const src = stripNoise(read(f));
  if (!/applyEdits/.test(src) && !WRITER_TOKEN.test(src)) continue;
  bichigchid.push({ f, huchingui: /[^\w.]invalidate\s*\(/.test(src) });
}
console.log(`applyEdits / туслах бичигч хэрэглэгч файл: ${bichigchid.length}`);

const huchinguiBolgoogui = bichigchid
  .filter((b) => !b.huchingui && !BICHEED_DUUDAGCH_HUCHINGUI.has(b.f));
for (const b of huchinguiBolgoogui) console.error(`  ✖ ${b.f} — бичдэг ч invalidate() дуудахгүй`);
assert.equal(
  huchinguiBolgoogui.length, 0,
  'ArcGIS руу бичдэг файл кэшээ хүчингүй болгохгүй байна. Бичилт АМЖИЛТТАЙ болсны дараа '
  + 'тухайн хүснэгтийн DataKey-гээр `invalidate()` дууд; эсвэл дуудагч хүчингүй болгодог бол '
  + 'BICHEED_DUUDAGCH_HUCHINGUI-д шалтгаантайгаар нэм.',
);
console.log('✅ бичдэг файл бүр кэшээ хүчингүй болгоно');

/* Энэ зөвшөөрлийн жагсаалт ч хуучирч болно */
const bichUldegdel = [...BICHEED_DUUDAGCH_HUCHINGUI.keys()].filter((k) => !bichigchid.some((b) => b.f === k));
assert.equal(
  bichUldegdel.length, 0,
  `BICHEED_DUUDAGCH_HUCHINGUI хуучирсан (эдгээр applyEdits хэрэглэхээ больсон): ${bichUldegdel.join(', ')}`,
);
console.log('✅ бичигчийн зөвшөөрлийн жагсаалт хуучраагүй');

/* ══════════════════════════════════════════════════════════════════
   ХАМААРАЛ 4 — ГАРААР БИЧСЭН МОДУЛИЙН КЭШ автобусад бүртгэгдэнэ

   ⚠️ ЯАГААД НЭМЭГДСЭН (2026-09-11). ХАМААРАЛ 1 нь ЗӨВХӨН `cached()`
   дуудлагыг олдог тул `let xCache: Promise<T> | null = null` хэлбэрийн
   ГАРААР бичсэн кэш түүний торноос бүрэн гулсаж өнгөрдөг байв. Яг тийм
   гурван кэш (`execTriage.ts`-ийн `varCache` · `ovCache` · `dmgCache`)
   автобусад ОГТ бүртгэгдээгүй байсан: «Гүйцэтгэл бөглөх» дээр обьём
   засмагц `invalidate('BAGTS_SHEET')` явдаг ч CEO-гийн «Обьёмын зөрүү»
   карт сесс дуустал хуучин тоогоо барьдаг байлаа. `land.ts:62` ба
   `parcelOverlap.ts:148` нь ижил согогийг 2026-08-31-нд аль хэдийн нэг
   удаа туулсан — шалгуургүй бол гурав дахь удаагаа эргэж ирнэ.

   ДҮРЭМ: модулийн түвшний кэш хувьсагчтай файл нь `dataBus`-ийн
   `register()`-ийг ДУУДСАН байх ёстой. Тооцооны (сүлжээгүй) кэш эсвэл
   порталаас бичигддэггүй хүснэгтийн кэш бол доор ил жагсаана.
   ══════════════════════════════════════════════════════════════════ */

/** Автобусын бүртгэл ШААРДЛАГАГҮЙ гараар бичсэн кэшүүд — шалтгаантайгаар. */
const GARAAR_ZOVSHOOROGDSON = new Map([
  ['src/lib/ficMakt.ts',
    '2026-10-09: `urlCache` нь FIC · М-актын Enterprise ХҮСНЭГТИЙН ХАЯГ (нэг удаа олдож/үүсгэгдэнэ) — '
    + 'өгөгдөл БИШ; хаяг ажиллах үед солигддоггүй тул хуучрахгүй.'],
  ['src/lib/dataCatalog.ts',
    'Өгөгдлийн каталогийн СТАТИК мета мэдээлэл (зориулалт, шатлал) — сүлжээнд хандахгүй, '
    + 'кодын бүртгэлээс (LAYERS, PKGS) бүтээгдэнэ; ажиллах үед өгөгдөл өөрчлөгдөхөд хуучрахгүй.'],
  ['src/lib/analysis/data.ts',
    'Тохиромжтой байдлын шинжилгээний СТАТИК төлөвлөлтийн давхаргууд — портал '
    + 'тэдгээрт ОГТ бичдэггүй (`ceo/suitability.ts`-ийн зөвшөөрөлтэй ИЖИЛ шалтгаан).'],
  ['src/lib/ersdelGeom.ts',
    'Голын полигон — ГАЗАР ЗҮЙН тогтмол хэлбэр, ажиллах үед өөрчлөгддөггүй. '
    + 'Үерийн загварчлалын геометрийн суурь, хүснэгтийн өгөгдөл БИШ.'],
  ['src/lib/hyanalt.ts',
    '`missingCache` нь ХЯНАЛТЫН хүснэгтийн туслах жагсаалт; ЭНЭ ФАЙЛ ӨӨРӨӨ '
    + '`invalidate(\'HYANALT\')` дууддаг (мөр 305) тул бичилтийн дараа '
    + 'шинэчлэгдэх зам нь хаагдсан.'],
  ['src/lib/plan2d.ts',
    'Давхаргын 2D загварын ачаалалтын `pending` — нэг удаагийн модуль ачаалалт '
    + '(өгөгдлийн кэш БИШ), давтан дуудлагыг нэгтгэх зориулалттай.'],
  /* ⚠️ 2026-09-21: `src/lib/uyr.ts`-ийн `pending`/кэш устгагдсан (CRF-ийн хуучин `loadFloodData` хасагдав) — бүртгэл хасав. */
  ['src/lib/uyrSim.ts',
    'DSM растрын кэш — зайнаас тандсан ӨНДРИЙН загвар, порталд засах зам байхгүй.'],
  ['src/lib/webmapStyle.ts',
    'Вэб зургийн ХЭВ ЗАГВАР (symbology) — ArcGIS-ийн webmap тодорхойлолт, '
    + 'өгөгдлийн хүснэгт БИШ.'],
  ['src/lib/uzlegReport.ts',
    '`metaCache` нь ЗӨВХӨН үзлэгийн маягтын ТАЛБАРЫН жагсаалт (alias, домэйн — бүдүүвчийн '
    + 'метадата, мөр БИШ; 2026-10-06). Мөрүүд нь `habeaUzleg`-ийн автобусад бүртгэлтэй '
    + 'ачаалагчаас (`HABEA`) ирнэ; портал маягтад бичдэггүй.'],
  ['src/lib/zovshoorol.ts',
    '`oidFieldP` нь ЗӨВХӨН OID талбарын НЭРийг кэшилдэг (бүдүүвчийн метадата, '
    + 'мөр БИШ). Файл өөрөө `invalidate(\'ZOVSHOOROL\')` дууддаг (мөр 309·338).'],
  ['src/lib/huvaariObyem.ts',
    '`resFieldsCache` нь ЗӨВХӨН сарын хүснэгтийн ТАЛБАРЫН НЭРС (`hun_huch`/'
    + '`mashin_mehanizm` байгаа эсэх — бүдүүвчийн метадата, мөр БИШ; 2026-09-24). '
    + 'Мөрүүд нь `loadPkgPlan` бүрд дахин татагддаг, энд кэшлэгдэхгүй — '
    + '`zovshoorol.ts`-ийн `oidFieldP`-тэй ИЖИЛ шалтгаан.'],
  ['src/lib/parcelOverlap.ts',
    '`srCache` нь орон зайн ЛАВЛАГААНЫ WKID (үйлчилгээний тогтмол метадата). '
    + 'Энэ файлын ӨГӨГДЛИЙН кэшүүд (`geomCache`/`resultCache`) нь мөр 148-д '
    + 'ЗӨВ бүртгэгдсэн — `register` дуудлага байгаа тул шалгуур ч ногооноор өнгөрнө.'],
  ['src/modules/analysis/suit/buildings.ts',
    'Шинжилгээний барилгын цэгүүд — `analysis/data.ts`-тэй ИЖИЛ шалтгаан.'],
  ['src/modules/analysis/suit/busAccess.ts',
    'Нийтийн тээврийн буудлууд — ГАДНЫ каталог, портал бичдэггүй.'],
  ['src/modules/analysis/suit/netSources.ts',
    'Шугам сүлжээний эх (`signalCache`, `cache`) — төлөвлөлтийн статик давхаргууд.'],
  ['src/modules/Finance.tsx',
    '`planCurveCache` нь ТООЦООНЫ үр дүн (муруйн хэлбэр). Энэ файл өөрөө '
    + '`invalidate(dataKey)` дууддаг (мөр 1781) тул бичилтийн дараах зам хаалттай.'],
  ['src/lib/agent/tools.ts',
    'Агентын хэрэгслийн талбарын МЕТАДАТА (`metaCache`) — мөр БИШ, бүдүүвч; '
    + 'дээрээс нь өөрийн TTL-тэй.'],
  ['src/lib/butetsEdit.ts',
    'Давхаргын МЕТАДАТА (`metaCache`) — талбарын жагсаалт, өгөгдлийн мөр БИШ.'],
  ['src/lib/draftRemote.ts',
    'FeatureLayer ОБЬЕКТУУДЫН кэш (`layerCache`) — SDK-ийн инстанц, өгөгдөл БИШ. '
    + 'Нооргийн хүснэгт өөрөө автобусад ордоггүй (BICHEED_DUUDAGCH_HUCHINGUI-г үз).'],
  ['src/lib/totals.ts',
    'Төлөвлөгөөт нийлбэрийн кэш — эх нь `wbs.data.ts`-ийн СТАТИК мод (код дотор '
    + 'бичигдсэн тоо), ArcGIS хүснэгт БИШ.'],
  ['src/modules/Bagts.tsx',
    '`pkgTotalCache` — давхаргын ГАРЧИГ ба тоо ширхэг; эх нь каталогийн '
    + 'давхаргууд (`loadSocial`-тай ижил шалтгаан).'],
  ['src/modules/Habea.tsx',
    '`photoCache` нь ХАВСРАЛТЫН (зураг) кэш — attachment нь мөрийн атрибут БИШ. '
    + 'Энэ файлын өгөгдлийн ачаалагч (`cached(…, [\'HABEA\'])`) тагтай — мөрийн '
    + 'дугаар бичихгүй (2026-09-21): хуучирдаг.'],
  ['src/modules/habeaUzleg.tsx',
    '`domainCache` нь талбарын DOMAIN (сонголтын жагсаалт) — бүдүүвчийн '
    + 'метадата. Өгөгдлийн ачаалагчид нь (`cached`/`queryFeatures`-ийн гурав дахь '
    + 'аргумент) `[\'HABEA\']` тагтай — мөрийн дугаар бичихгүй (2026-09-21).'],
  ['src/modules/sheet/bagts.pkg.ts',
    'Багцын БҮДҮҮВЧ (`loadSchema`) — талбарын жагсаалт, мөр БИШ. Бүдүүвч нь '
    + 'үйлчилгээний бүтэц өөрчлөгдөхөд л солигдоно.'],
  ['src/components/MapCanvas.tsx',
    '`homeExtentCache` нь эхлэх ХҮРЭЭ (extent) — газрын зургийн харагдацын '
    + 'байрлал, өгөгдлийн мөр БИШ. Бүсийн давхаргын хүрээ статик тул 2D↔3D '
    + 'солих бүрд дахин татах шаардлагагүй (файлын өөрийн тайлбар).'],
  ['src/lib/guitsetgelAcl.ts',
    'Эрхийн томилгооны кэш нь `localStorage`-ийн ТУСГАЛ — эх нь ArcGIS хүснэгт '
    + 'БИШ, тархалт нь өөрийн `EVENT` (`selbe-guitsetgel-acl-change`) сувгаар '
    + 'явдаг (`permsRemote.ts`-ийн зөвшөөрөлтэй ИЖИЛ шалтгаан: эрх нь автобусаар '
    + 'БИШ өөрийн store-оор тархана).'],
  ['src/modules/sheet/bagtsSheet.ts',
    '`baseKeyCache` нь СУУРЬ ТҮЛХҮҮРИЙН жагсаалт (бүтцийн туслах). Энэ файл '
    + 'өөрөө `invalidate(\'BAGTS_SHEET\')` дууддаг (мөр 1604·1641·1694).'],
  /* ⚠️ 2026-10-09: CACHE_PATTERNS нэрээр өргөссөний дараа илэрсэн гурав — шалтгаантай зөвшөөрөл. */
  ['src/lib/hyanaltSubmit.ts',
    '`COMPANY` нь багц → гүйцэтгэгч компанийн ЛАВЛАХ (барилгын үйлчилгээ/багцын каталог) — '
    + 'портал тэр талбарт бичдэггүй, хяналтын мөр БИШ.'],
  ['src/lib/hyanaltStore.ts',
    '`badgeRows` нь цэсний тэмдгийн 60 с TTL-тэй (`at`) хөнгөн уншилт; `ROWS` ачаалагдсан бол '
    + 'түүнийг ашигладаг. HYANALT-ийн бичилт (`hyanalt.edit`) `invalidate(\'HYANALT\')` дууддаг '
    + 'ч энэ тэмдэг хамгийн ихдээ 60 с хоцорно — санаатай (тэмдэг, тоо биш).'],
  ['src/lib/negtgelAuto.ts',
    '`lastState` нь энэ хөтчийн СҮҮЛИЙН СИНКИЙН ТӨЛӨВ (UI-ийн мэдэгдэл) — өгөгдлийн кэш БИШ; '
    + 'синк бүр өөрөө дарж бичнэ.'],
  ['src/lib/layerSummary.ts',
    'Инженерийн дэд бүтцийн давхаргын хураангуй. Портал эдгээрт БИЧДЭГ ч '
    + 'автобусын түлхүүр байхгүй — хүчингүй болгох зам нь `dropTotalsCache()` '
    + '(`DedButets`-ийн бичих бүх зам дууддаг) бөгөөд файл түүнд '
    + '`subscribeTotals`-аар холбогдсон.'],
]);

/**
 * Модулийн түвшний кэш хувьсагчийг олох хэв маягууд.
 *
 * ⚠️ ЗӨВХӨН МӨРИЙН ЭХЛЭЛД (`^`): функц дотор зарлагдсан түр хувьсагч нь
 *    модулийн кэш БИШ — тэдгээрийг оруулбал шалгуур хуурамч улаанаар дүүрнэ.
 */
/* ⚠️ 2026-10-09: `COMPANY` (hyanaltSubmit) · `badgeRows` (hyanaltStore) · `lastState` (negtgelAuto) —
   нэрэнд «cache» ороогүй тул торноос гулсдаг байв; нэрээр нь нэмэв (гурвуулаа одоо
   GARAAR_ZOVSHOOROGDSON-д шалтгаантай). Шинэ ийм кэшийг энд нэрээр нь нэмнэ. */
const CACHE_PATTERNS = [
  /^let\s+(\w*[Cc]ache\w*|pending|oidFieldP|COMPANY|badgeRows|lastState)\s*(?::[^=\n]*)?=\s*null\s*;/gm,
  /^const\s+(\w*[Cc]ache\w*)\s*(?::[^=\n]*)?=\s*new\s+Map\s*[<(]/gm,
];

const garaarKesh = [];
for (const f of files) {
  if (f.endsWith('dataBus.ts')) continue;
  const src = stripNoise(read(f));
  const names = [];
  for (const re of CACHE_PATTERNS) {
    for (const m of src.matchAll(re)) names.push({ name: m[1], line: lineOf(src, m.index) });
  }
  if (!names.length) continue;
  /* `register(` дуудлага байгаа эсэх — `import { register }` нь дуудлага БИШ */
  const burtgesen = /[^\w.]register\s*\(/.test(src);
  garaarKesh.push({ f, names, burtgesen });
}
console.log(`гараар бичсэн кэштэй файл: ${garaarKesh.length}`);

const burtgeegui = garaarKesh
  .filter((c) => !c.burtgesen && !GARAAR_ZOVSHOOROGDSON.has(c.f));
for (const c of burtgeegui) {
  console.error(
    `  ✖ ${c.f} — гараар бичсэн кэш (${c.names.map((n) => `${n.name}:${n.line}`).join(', ')})`
    + ' автобусад бүртгэгдээгүй',
  );
}
assert.equal(
  burtgeegui.length, 0,
  'Гараар бичсэн модулийн кэш автобусад бүртгэгдээгүй байна. `land.ts:62`-ийн загвараар '
  + '`register(() => { cache = null; }, [\'DATA_KEY\'])` нэм — түлхүүрийг тухайн кэш ЮУНААС '
  + 'уншдагийг кодоос мөшгиж тогтоо (буруу түлхүүр нь бүртгэхгүйгээс ДОР). Сүлжээгүй '
  + 'тооцооны эсвэл порталаас бичигддэггүй эхийн кэш бол GARAAR_ZOVSHOOROGDSON-д '
  + 'шалтгаантайгаар нэм.',
);
console.log('✅ гараар бичсэн кэш бүр автобусад бүртгэгдсэн (эсвэл ил зөвшөөрөгдсөн)');

/* Энэ зөвшөөрлийн жагсаалт ч хуучирч болно */
const garaarUldegdel = [...GARAAR_ZOVSHOOROGDSON.keys()]
  .filter((k) => !garaarKesh.some((c) => c.f === k));
assert.equal(
  garaarUldegdel.length, 0,
  `GARAAR_ZOVSHOOROGDSON хуучирсан (эдгээрт гараар бичсэн кэш үлдээгүй): ${garaarUldegdel.join(', ')}`,
);
console.log('✅ гараар бичсэн кэшийн зөвшөөрлийн жагсаалт хуучраагүй');

/* ══════════════════════════════════════════════════════════════════
   ХАМААРАЛ 5 — УРСГАЛЫН STORE-ийн БИЧИХ ФУНКЦ БҮР кэшээ хүчингүй болгоно

   ⚠️ ЯАГААД НЭМЭГДСЭН (2026-09-30). ХАМААРАЛ 2 нь ФАЙЛЫН түвшинд шалгадаг:
   нэг `invalidate()` байвал бүх файл ногоон. Урсгалын store-ууд (чанар ·
   хуваарь · обьём · нэмэлт ажил · QAQC ноорог) 5–17 бичих функцтэй тул нэг
   функц хүчингүй болгохоо мартвал файлын шалгуур барихгүй — яг тэр өдрийг
   хүртэл эдгээр файл `invalidate()`-ийг ОГТ дууддаггүй байсан (цэсний тэмдэг
   3 мин хүртэл хуучин). Одоо ФУНКЦ БҮРЭЭР: `applyEdits` (REST эсвэл SDK)
   агуулсан функц бүр биедээ `invalidate('<ТҮЛХҮҮР>')` литералтай байх ёстой.

   ДҮРЭМ: доорх файл бүрийн модулийн түвшний функц (`export async function` ·
   `async function` · `function`) бүрийг хаалтын балансаар тасалж, `applyEdits`
   агуулсан бүрд тухайн файлын түлхүүрээр `invalidate(` байгааг шаардана.
   ══════════════════════════════════════════════════════════════════ */

/** Store файл → түүний хүснэгтийн DataKey (нэгдэлд байх ёстой — ХАМААРАЛ 3 барина) */
const STORE_KEYS = new Map([
  ['src/lib/chanarStore.ts', 'CHANAR_BARIMT'],
  ['src/lib/huvaariBatlah.ts', 'HUVAARI_BATLAH'],
  ['src/lib/obyemBatlah.ts', 'OBYEM_BATLAH'],
  ['src/lib/ajilBatlah.ts', 'AJIL_BATLAH'],
  ['src/lib/qaqcDraftRemote.ts', 'QAQC_DRAFT'],
]);

/**
 * Модулийн түвшний функцүүдийг {name, body, line} болгож тасална.
 * ⚠️ Биеийн `{`-г ПАРАМЕТРИЙН жагсаалтыг (хаалтын баланс) алгассаны ДАРАА, «мөрийн
 *    төгсгөлийн `{`»-ээр олно: `args: {` (параметрийн объект) ба `Promise<{ ok: … }>`
 *    (буцах төрөл) хоёулаа биеийн хаалт БИШ — эхнийх нь параметр дотор, хоёр дахь
 *    нь мөр дундаа байдаг. Эхний `{`-г авбал биеийг параметрийн объект гэж андуурч
 *    `applyEdits`-тэй функцийг олохгүй (2026-09-30-нд яг ингэж унасан).
 */
function topLevelFunctions(src) {
  const out = [];
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  for (const m of src.matchAll(re)) {
    /* параметрийн `( … )`-г хаалтын балансаар алгасна */
    let pd = 0;
    let close = -1;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      const c = src[i];
      if (c === '(') pd += 1;
      else if (c === ')') { pd -= 1; if (pd === 0) { close = i; break; } }
    }
    if (close < 0) continue;
    const bodyRe = /\{[ \t]*\r?\n/g;
    bodyRe.lastIndex = close + 1;
    const bm = bodyRe.exec(src);
    if (!bm) continue;
    const open = bm.index;
    let d = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '{') d += 1;
      else if (c === '}') { d -= 1; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    out.push({ name: m[1], body: src.slice(open, end + 1), line: lineOf(src, m.index) });
  }
  return out;
}

let storeFnTotal = 0;
const storeFnBad = [];
for (const [f, key] of STORE_KEYS) {
  assert.ok(files.includes(f), `ХАМААРАЛ 5: ${f} олдсонгүй — STORE_KEYS хуучирсан`);
  assert.ok(KEYS.includes(key), `ХАМААРАЛ 5: ${key} DataKey нэгдэлд алга`);
  const src = stripNoise(read(f));
  /* Файл өөрөө түлхүүрээ дор хаяж нэг удаа литералаар дуудна — өөр түлхүүрээр
     «хүчингүй болгосон» дүр үзүүлэхгүй */
  assert.ok(new RegExp(`[^\\w.]invalidate\\s*\\(\\s*'${key}'`).test(src), `${f}: invalidate('${key}') дуудлага алга`);
  for (const fn of topLevelFunctions(src)) {
    if (!/applyEdits/.test(fn.body)) continue;
    storeFnTotal += 1;
    if (!new RegExp(`[^\\w.]invalidate\\s*\\(\\s*'${key}'`).test(fn.body)) storeFnBad.push({ f, ...fn });
  }
}
console.log(`урсгалын store-ийн бичих функц: ${storeFnTotal} (${STORE_KEYS.size} файл)`);
for (const b of storeFnBad) console.error(`  ✖ ${b.f}:${b.line}  ${b.name}() — applyEdits бичдэг ч invalidate('${STORE_KEYS.get(b.f)}') дуудахгүй`);
assert.equal(
  storeFnBad.length, 0,
  'Урсгалын store-ийн бичих функц кэшээ хүчингүй болгохгүй байна. Бичилт АМЖИЛТТАЙ '
  + 'болсны дараа (`editOk`/`success` шалгасны ДАРАА) тухайн файлын түлхүүрээр `invalidate()` дууд.',
);
assert.ok(storeFnTotal >= 20, `ХАМААРАЛ 5 хэт цөөн функц олов (${storeFnTotal}) — таслагч эвдэрсэн үү?`);
console.log('✅ урсгалын store-ийн бичих функц бүр кэшээ хүчингүй болгоно');

/* ══════════════════════════════════════════════════════════════════
   ХАМААРАЛ 3 — `invalidate()`-д дамжуулсан түлхүүр бүр нэгдэлд байна
   (tsc үүнийг барих ёстой ч .mjs шалгуурууд нь төрлийн шалгалтаас гадуур)
   ══════════════════════════════════════════════════════════════════ */
const buhEh = files.map(read).join('\n');
const bichigdsen = new Set(
  [...buhEh.matchAll(/[^\w.]invalidate\s*\(([^)]*)\)/g)]
    .flatMap((m) => [...m[1].matchAll(/'([A-Z_0-9]+)'/g)].map((x) => x[1])),
);
const todorhoigui = [...bichigdsen].filter((k) => !KEYS.includes(k));
assert.equal(todorhoigui.length, 0, `DataKey нэгдэлд байхгүй түлхүүрээр invalidate: ${todorhoigui.join(', ')}`);
console.log(`✅ ${KEYS.length} DataKey — invalidate хэрэглээ нэгдэлтэй нийцэв`);

/* ── Мэдээлэл: хүчингүй болгогчгүй түлхүүрүүд ──
   Энэ нь АЛДАА БИШ: зарим хүснэгтэд порталаас бичих зам огт байхгүй.
   Гэвч шинэ бичих зам нэмэхэд энэ жагсаалт багасах ёстой. */
const bichigchgui = KEYS.filter((k) => !bichigdsen.has(k));
/*
 * ⚠️ Энэ жагсаалт БҮРЭН БИШ байж болно: `Finance.tsx` нь `invalidate(dataKey)`
 * гэж ХУВЬСАГЧААР дууддаг тул мөрийн литерал хайлт түүнийг олохгүй. Тиймээс
 * үүнийг шалгуур болгож ХАТУУРУУЛАХГҮЙ — зөвхөн мэдээлэл.
 */
const huvisagchaar = /[^\w.]invalidate\s*\(\s*[a-z_$][\w$.]*\s*\)/.test(buhEh);
if (bichigchgui.length) {
  console.log(
    `ℹ литералаар хүчингүй болгогддоггүй түлхүүр: ${bichigchgui.join(', ')}`
    + (huvisagchaar ? '  (зарим нь ХУВЬСАГЧААР хүчингүй болдог — жагсаалт бүрэн бус)' : ''),
  );
}

console.log('\ndataBus.invariant: ok');
