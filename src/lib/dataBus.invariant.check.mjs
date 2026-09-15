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
const busSrc = read('src/lib/dataBus.ts');
const unionAt = busSrc.indexOf('export type DataKey');
assert.ok(unionAt > 0, 'DataKey нэгдэл олдсонгүй');
const unionBlock = busSrc.slice(unionAt, busSrc.indexOf(';', unionAt));
const KEYS = [...unionBlock.matchAll(/'([A-Z_0-9]+)'/g)].map((m) => m[1]);
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
  ['src/lib/irged.ts:loadSocPlanned',
    'Төлөвлөсөн нийгмийн барилгын хүчин чадал (Багц 19–21) — `loadSocial`-тай '
    + 'ЯГ ижил шалтгаан: каталогийн давхаргууд, портал тэдгээрт бичдэггүй.'],
  ['src/lib/gdash.ts:loadHseNow',
    'ХАБ-ын өдрийн маягт (Survey123) — портал тэр хүснэгт рүү ОГТ бичдэггүй, '
    + 'талбар дээрээс бөглөгддөг. Тиймээс автобусын түлхүүр байхгүй; оронд нь '
    + '5 минутын TTL тавьсан — өдөрт хэдэн удаа шинэчлэгддэг эх сурвалжид '
    + 'сешн-кэш нь хуучин тоог барих эрсдэлтэй.'],
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
  ['src/lib/qaqc.ts',
    'QAQC хүснэгт нь `dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ: түүнийг зөвхөн «Гүйцэтгэл '
    + 'бөглөх» хуудас багц солих бүрд шууд уншиж (`loadQaqc`), бичсэнийхээ дараа '
    + 'өөрөө дахин татдаг. Хүчингүй болгох хуваалцсан кэш байхгүй.'],
  ['src/lib/permsRemote.ts',
    'Эрхийн хүснэгт нь `dataBus`-аар БИШ, өөрийн store-оор тархдаг (permissions.ts).'],
  ['src/lib/qaqcDraftRemote.ts',
    'ЧАНАРЫН нооргийн хүснэгт (`Selbe_QAQC_Draft`) нь `dataBus`-ийн кэшид ОГТ '
    + 'ОРДОГГҮЙ: түүнийг зөвхөн «Чанар (QAQC)» хуудас багц солих агшинд НЭГ '
    + 'удаа уншиж (`loadQaqcDraft`), дараа нь дэлгэцийн төлөв нь эх сурвалж '
    + 'болно. Хүчингүй болгох кэш байхгүй — `draftRemote.ts`-тэй ижил шалтгаан.'],
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
  ['src/lib/huvaariBatlah.ts',
    'ХУВААРИЙН БАТЛАХ УРСГАЛЫН хүснэгт (`Selbe_Huvaari_Batlah`) нь '
    + '`dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ: «Хуваарь» хуудас багц солих бүрд '
    + 'шууд уншдаг (`loadPending`, `cached()`-гүй). Мөн ЭНЭ модуль эх '
    + 'хуудсанд ЮУ Ч бичихгүй — зөвхөн урсгалын төлөвийг хөтөлнө; батлагдсан '
    + 'хуваарийг `Bagts_*` руу бичих ажил нь `Huvaari.save` → `applyUpdates` '
    + 'дотор явагддаг тул кэшийг ТЭР зам хүчингүй болгоно (2026-09-07).'],
  ['src/lib/obyemBatlah.ts',
    'ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАТЛАХ УРСГАЛЫН хүснэгт '
    + '(`Selbe_Obyem_Batlah`) нь `dataBus`-ийн кэшид ОГТ ОРДОГГҮЙ: '
    + '«Гүйцэтгэл бөглөх» хуудас багц солих бүрд шууд уншдаг '
    + '(`loadPending`, `cached()`-гүй). Мөн ЭНЭ модуль үндсэн өгөгдөлд '
    + 'ЮУ Ч бичихгүй — зөвхөн урсгалын төлөвийг хөтөлнө; батлагдсан обьёмыг '
    + '`Bagts_*` руу бичих ажил нь `FillNew.decideObyemHere` → `applyUpdates` '
    + 'дотор явагддаг тул кэшийг ТЭР зам хүчингүй болгоно (2026-09-08). '
    + '`huvaariBatlah.ts`-тэй ЯГ ИЖИЛ шалтгаан.'],
  ['src/modules/sheet/Pivot.tsx',
    'САНААТАЙ АРХИВЛАСАН хуудас (Sheet.tsx, 2026-08-18 хэрэглэгчийн шийдвэр — '
    + 'навигациас л хасагдсан, код нь үлдээгдсэн). Хаанаас ч импортлогддоггүй, '
    + 'бичилт нь `ags.ts`-ийн `base` буюу ХААГДСАН үйлчилгээ рүү (499) заадаг.'],
]);

const bichigchid = [];
for (const f of files) {
  /* ⚠️ Тайлбарыг ЗААВАЛ хасна: `MapCanvas.tsx:113` ба `FillNew.tsx:43` нь
     «applyEdits» гэдгийг зөвхөн ПРОЗООР дурдсан — түүхий текстээр хайвал
     бичдэггүй файлыг бичигч гэж андуурна. */
  const src = stripNoise(read(f));
  if (!/applyEdits/.test(src)) continue;
  bichigchid.push({ f, huchingui: /[^\w.]invalidate\s*\(/.test(src) });
}
console.log(`applyEdits хэрэглэгч файл: ${bichigchid.length}`);

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
  ['src/lib/uyr.ts',
    'Үерийн загварчлалын `pending` — тооцооны үр дүн; эх нь DEM/DSM растр тул '
    + 'порталаас бичигддэггүй.'],
  ['src/lib/uyrSim.ts',
    'DSM растрын кэш — зайнаас тандсан ӨНДРИЙН загвар, порталд засах зам байхгүй.'],
  ['src/lib/webmapStyle.ts',
    'Вэб зургийн ХЭВ ЗАГВАР (symbology) — ArcGIS-ийн webmap тодорхойлолт, '
    + 'өгөгдлийн хүснэгт БИШ.'],
  ['src/lib/zovshoorol.ts',
    '`oidFieldP` нь ЗӨВХӨН OID талбарын НЭРийг кэшилдэг (бүдүүвчийн метадата, '
    + 'мөр БИШ). Файл өөрөө `invalidate(\'ZOVSHOOROL\')` дууддаг (мөр 309·338).'],
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
    + 'Энэ файлын өгөгдлийн ачаалагч нь мөр 71-д `[\'HABEA\']` тагтай.'],
  ['src/modules/habeaUzleg.tsx',
    '`domainCache` нь талбарын DOMAIN (сонголтын жагсаалт) — бүдүүвчийн '
    + 'метадата. Өгөгдлийн ачаалагчид нь мөр 157·162-т `[\'HABEA\']` тагтай.'],
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
]);

/**
 * Модулийн түвшний кэш хувьсагчийг олох хэв маягууд.
 *
 * ⚠️ ЗӨВХӨН МӨРИЙН ЭХЛЭЛД (`^`): функц дотор зарлагдсан түр хувьсагч нь
 *    модулийн кэш БИШ — тэдгээрийг оруулбал шалгуур хуурамч улаанаар дүүрнэ.
 */
const CACHE_PATTERNS = [
  /^let\s+(\w*[Cc]ache\w*|pending|oidFieldP)\s*(?::[^=\n]*)?=\s*null\s*;/gm,
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
