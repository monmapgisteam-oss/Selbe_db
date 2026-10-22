/**
 * КЭШ ХАЯГДАХ ЗАМУУД — 2026-10-21-ний кэшийн аудитын бүтцийн шалгуур (эх кодыг уншина, сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/cacheDrop.check.mjs
 *
 * ⚠️ ЯАГААД ТЕКСТЭЭР: эдгээр модулиуд ArcGIS SDK (`@arcgis/core`) ба React импортолдог тул Node-д ажиллуулж
 *    зан төлөвийг нь шалгах боломжгүй — `dataBus.invariant.check.mjs`-ийн адил эх кодын БҮТЦИЙГ тулгана.
 *    Тайлбарыг хасаад уншина: тайлбар дахь «subscribeTotals(» мэт дурдлага хуурамч ногоон өгөхгүй.
 *
 * Хамгаалж буй алдаанууд (аудит 2, «cache-invalidation»):
 *   1. «Дэд бүтэц»-ийн засвар (`dropTotalsCache` эрин) `planOverlap.infraCache` · `hesegNeed.needCache`-ийг хаядаггүй
 *      байв — `pkgSaad` · `parcelOverlap` · `layerSummary`-тэй ижил `subscribeTotals` шаардана.
 *   2. `analysis/data.ts`-ийн `loadAnalysisCached` автобусад бүртгэлгүй — толгойн «Шинэчлэх» хүрдэггүй байв.
 *   3. `scorecardLoad.loadScorePlan` TTL-гүй; `Dashboard.loadSources` TTL-гүй · таггүй байв.
 *   4. `hyanaltStore.badgeRows` автобусад бүртгэлгүй — хяналтын шийдвэрийн дараа цэсний тэмдэг 3 мин хуучин.
 *   5. `saveQaqc` ямар ч DataKey хүчингүй болгодоггүй; CEO QAQC ачаалагчид зөвхөн `BAGTS_SHEET` тагтай байв.
 *   6. ХАБЭА-ийн poll TTL-тэй яг тэнцүү — эхний tick бүр кэшээс буцдаг байв (`HABEA_POLL_MS` > `HABEA_TTL_MS`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* ⚠️ 2026-10-22 (аудит): ХАБЭА-ийн хугацааг ТООГООР — импортгүй модулиас (`habeaRegisters.ts` нь tsx/css татдаг тул энгийн
   шалгуурт импортлогдохгүй). Урьд `HABEA_POLL_MS = HABEA_TTL_MS + 30_000` гэсэн эх кодын мөрийг regex-ээр тулгадаг байв. */
import { HABEA_TTL_MS, HABEA_POLL_MS } from './habeaTiming.ts';

/* ⚠️ Эх файлууд CRLF — LF болгож нэгтгэнэ, эс бөгөөс мөр дамнасан regex таарахгүй */
const read = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
/** `const <name>` -ээс дараагийн `export ` хүртэлх хэсэг (эсвэл файлын төгсгөл) */
const segment = (s, name) => {
  const i = s.indexOf(`const ${name}`);
  assert.ok(i >= 0, `${name} олдсонгүй`);
  const j = s.indexOf('\nexport ', i + 10);
  return s.slice(i, j > 0 ? j : undefined);
};

/* ── 1. Дэд бүтцийн засвар → санах ойн кэш хаягдана ── */
for (const f of ['src/lib/planOverlap.ts', 'src/lib/hesegNeed.ts', 'src/lib/pkgSaad.ts', 'src/lib/parcelOverlap.ts', 'src/lib/layerSummary.ts']) {
  const s = code(f);
  assert.match(s, /import \{[^}]*\bsubscribeTotals\b[^}]*\} from '[^']*totals';/, `${f}: subscribeTotals импорт алга`);
  assert.match(s, /(?:^|[^\w.])subscribeTotals\s*\(/m, `${f}: subscribeTotals(…) дуудлага алга — «Дэд бүтэц»-ийн засварт кэш хаягдахгүй`);
}
assert.match(code('src/lib/planOverlap.ts'), /subscribeTotals\(\(\) => \{ infraCache = null; resultCache\.clear\(\);/, 'planOverlap: infraCache ба resultCache хоёулаа хаягдана');
assert.match(code('src/lib/hesegNeed.ts'), /subscribeTotals\(\(\) => \{ needCache = null; \}\)/, 'hesegNeed: needCache хаягдана');
console.log('✅ 1. planOverlap · hesegNeed — subscribeTotals');

/* ── 2. analysis/data.ts — толгойн «Шинэчлэх» ── */
assert.match(code('src/lib/analysis/data.ts'), /register\(\(\) => \{ cache = null; \}, \[\]\)/, 'analysis/data.ts: loadAnalysisCached автобусад (хоосон reads) бүртгэгдээгүй');
console.log('✅ 2. analysis/data.ts — register(…, [])');

/* ── 3. TTL ── */
{
  const sl = code('src/lib/ceo/scorecardLoad.ts');
  const m = /loadScorePlan = cached\([\s\S]*?\n\}, ([^\n]*)\);/.exec(sl);
  assert.ok(m, 'loadScorePlan = cached(…) олдсонгүй');
  assert.equal(m[1], "SESSION_TTL_MS, ['BUILDING']", 'loadScorePlan: SESSION_TTL_MS + [BUILDING]');
  const d = code('src/modules/Dashboard.tsx');
  const ls = /const loadSources = cached<Row\[\]>\(([\s\S]*?)\n\);/.exec(d);
  assert.ok(ls, 'Dashboard.loadSources олдсонгүй');
  assert.match(ls[1], /SESSION_TTL_MS,\s*\['SOURCE_FS'\],?\s*$/, 'Dashboard.loadSources: SESSION_TTL_MS + SOURCE_FS таг');
  console.log('✅ 3. loadScorePlan · Dashboard.loadSources — 5 мин TTL');
}

/* ── 4. Цэсний тэмдгийн кэш ── */
assert.match(code('src/lib/hyanaltStore.ts'), /register\(\(\) => \{ badgeRows = null; \}, \['HYANALT'\]\)/, 'hyanaltStore: badgeRows HYANALT-д бүртгэгдээгүй');
console.log('✅ 4. hyanaltStore.badgeRows — HYANALT');

/* ── 5. QAQC түлхүүр ── */
{
  const q = code('src/lib/qaqc.ts');
  const fn = /export async function saveQaqc\([\s\S]*?\n\}\n/.exec(q);
  assert.ok(fn, 'saveQaqc олдсонгүй');
  assert.match(fn[0], /finally \{\s*if \(touched\) invalidate\('QAQC'\);/, 'saveQaqc: хүснэгт өөрчлөгдсөн үед invalidate(QAQC)');
  assert.match(fn[0], /if \(isLostWrite\(e\)\) touched = true;/, 'saveQaqc: хариу алдагдсан үед ч хүчингүй болгоно');
  assert.match(fn[0], /done \+= res\.length;\s*touched = true;/, 'saveQaqc: амжилттай багцын дараа touched');
  for (const [f, name] of [['src/lib/ceo/qaqc.ts', 'loadQaqcLoaded'], ['src/lib/ceo/qaqc.ts', 'loadQaqcKpi'], ['src/lib/ceo/scorecardLoad.ts', 'loadScoreQual']]) {
    assert.ok(segment(code(f), name).includes("['QAQC', 'BAGTS_SHEET']"), `${f}: ${name} нь ['QAQC', 'BAGTS_SHEET'] тагтай байх ёстой`);
  }
  assert.match(code('src/lib/dataBus.ts'), /\|\s*'QAQC'/, "dataBus.DataKey-д 'QAQC' алга");
  console.log('✅ 5. saveQaqc → invalidate(QAQC); CEO QAQC ачаалагчид [QAQC, BAGTS_SHEET]');
}

/* ── 6. ХАБЭА poll > TTL ── */
{
  const h = code('src/modules/Habea.tsx');
  assert.match(h, /setInterval\(\(\) => \{ if \(!document\.hidden\) setTick\(\(t\) => t \+ 1\); \}, HABEA_POLL_MS\)/, 'Habea poll нь HABEA_POLL_MS-ээр');
  assert.match(h, /HABEA_TTL_MS, \['HABEA'\]\)/, 'loadHabea TTL нь HABEA_TTL_MS');
  assert.match(h, /import \{[^}]*\bHABEA_POLL_MS\b[^}]*\} from '@\/lib\/habeaRegisters';/, 'Habea.tsx нь HABEA_POLL_MS-ийг habeaRegisters-ээс');
  assert.match(code('src/lib/habeaRegisters.ts'), /import \{ HABEA_TTL_MS, HABEA_POLL_MS \} from '@\/lib\/habeaTiming';/,
    'habeaRegisters нь habeaTiming-ийн утгыг (дахин экспорт) — Habea.tsx ба энэ шалгуур НЭГ утга');
  assert.equal(HABEA_TTL_MS, 5 * 60_000, 'HABEA_TTL_MS = 5 мин');
  assert.ok(HABEA_POLL_MS > HABEA_TTL_MS, `poll (${HABEA_POLL_MS}) нь TTL (${HABEA_TTL_MS})-ээс УРТ байх ёстой — тэнцүү бол эхний tick бүр кэшээс буцна`);
  assert.ok(HABEA_POLL_MS - HABEA_TTL_MS >= 10_000, 'зөрүү ≥10 с — хүсэлтийн хугацаанаас урт');
  console.log(`✅ 6. ХАБЭА poll (${HABEA_POLL_MS / 1000} с) > TTL (${HABEA_TTL_MS / 1000} с)`);
}

console.log('cacheDrop.check: OK');
