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
  ['src/lib/gdash.ts:loadHseNow',
    'ХАБ-ын өдрийн маягт (Survey123) — портал тэр хүснэгт рүү ОГТ бичдэггүй, '
    + 'талбар дээрээс бөглөгддөг. Тиймээс автобусын түлхүүр байхгүй; оронд нь '
    + '5 минутын TTL тавьсан — өдөрт хэдэн удаа шинэчлэгддэг эх сурвалжид '
    + 'сешн-кэш нь хуучин тоог барих эрсдэлтэй.'],
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
