/**
 * БҮХ `*.check.mjs` ШАЛГУУРЫГ ОЛЖ, ЗЭРЭГ АЖИЛЛУУЛНА.
 *   node tools/test-all.mjs            — нэгж шалгуурууд (npm test)
 *   node tools/test-all.mjs --live     — амьд ArcGIS/реле шаарддаг 7-г (`LIVE`) ч хамт
 *   node tools/test-all.mjs huvaari    — нэрэнд «huvaari» орсон файлууд л
 *   node tools/test-all.mjs -j 2       — зэрэг ажиллах тоо (анхдагч 4)
 *   node tools/test-all.mjs --verbose  — давсан шалгуурын гаралтыг ч хэвлэнэ
 *   node tools/test-all.mjs --timeout 300 — нэг шалгуурын дээд хугацаа, сек
 *                                         (анхдагч 180; env TEST_TIMEOUT_S ч болно)
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ШАЛГУУР БҮР ХУГАЦААНЫ ХЯЗГААРТАЙ —
 *    гацсан нэг тест `npm test`-ийг (тэгэхээр deploy-г) үүрд түгжихгүй, «⏱ ГАЦСАН»
 *    мессежтэйгээр унасан гэж тоологдоно (`tools/testRun.mjs`).
 *
 * ⚠️ ЯАГААД (2026-09-29). `package.json`-ийн `test` нь 88 дараалсан `node …`
 *    дуудлагыг НЭГ 7,900 тэмдэгттэй мөрөнд гараар жагсаадаг байв. Шинэ
 *    `*.check.mjs` нэмэхэд тэр мөрөнд бичихээ мартвал тест ХЭЗЭЭ Ч ажиллахгүй
 *    (2026-09-25-ны аудитаар ийм файл олдсон). Мөн дараалан явдаг тул удаан.
 *    Одоо файлын систем өөрөө жагсаалт: `src/ · docs/ · tools/` доторх бүх
 *    `*.check.mjs` автоматаар орно — мартах боломжгүй.
 *
 * ⚠️ АМЬД ШАЛГУУРУУД (`LIVE`) анхдагчаар ОРОХГҮЙ — тэдгээр нь амьд ArcGIS
 *    өгөгдөл эсвэл agent-proxy реле шаарддаг (`npm run test:live`-ийн жагсаалт).
 *    Энд нэрээр нь ил жагсаасан тул ШИНЭ амьд шалгуур нэмэхдээ энд нэмнэ —
 *    эс бөгөөс тэр нь нэгж шалгуур мэт CI-д ажиллаад сүлжээгүй унана.
 *
 * ⚠️ БҮГД ИЖИЛ туг (`--experimental-transform-types --import ./tools/ts-alias.mjs`)
 *    авна. Урьд зарим нь энгийн `node` байсан (`floor`, `draft`, `dataBus` …) —
 *    loader нь `.ts` импортгүй файлд ЮУ Ч ХИЙХГҮЙ тул аюулгүй; `.env`-ийг
 *    уншдаг нь ч тэдэнд саадгүй.
 *
 * ⚠️ ЗЭРЭГ АЖИЛЛАХ ТОО 4 — `query.ts`-ийн 6 слоттой ижил шалтгаан: амьд
 *    хэсэгтэй шалгуурууд нэг дор олноор явбал ArcGIS «Too many requests».
 *
 * Гаралт: давсан файлын гаралтыг НУУНА (--verbose-гүй бол), унасан файлынхыг
 * төгсгөлд БҮТНЭЭР хэвлэнэ. Нэг ч унавал exit 1.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { runCheck, resolveTimeoutS } from './testRun.mjs';
import { loadPublicEnv, adminToken, liveStatus, liveEnvOf } from './liveEnv.mjs';

const ROOTS = ['src', 'docs', 'tools'];
/* ⚠️ 2026-10-20: `test-users.mjs` — хуучин хатуу хэрэглэгчдийг ЗӨВХӨН тестэд сэргээнэ (тэр файлын ⚠️) */
const LOADER = ['--experimental-transform-types', '--import', './tools/ts-alias.mjs', '--import', './tools/test-users.mjs'];

/** `npm run test:live`-тэй ИЖИЛ жагсаалт — амьд өгөгдөл / реле шаарддаг */
const LIVE = new Set([
  'src/lib/filters.check.mjs',
  'src/lib/blockProgress.check.mjs',
  'src/modules/monitor.check.mjs',
  'src/lib/analysis/transport.check.mjs',
  'src/lib/agent/agent.check.mjs',
  'src/lib/agent/drift.check.mjs',
  /* ⚠️ 2026-10-01: дэд бүтцийн давхаргын координатын систем · уртын талбар — зөвхөн уншдаг амьд шалгалт */
  'src/lib/butetsInfra.check.mjs',
]);

/* ⚠️ 2026-10-26: ТОКЕН БАЙВАЛ АМЬД УНШДАГ шалгуурууд (series · zovshoorol · bagts · negj · gun) анхдагч ажиллагаанд ОРНО,
   токенгүй үед өөрсдөө `SELBE_LIVE_SKIP`-ээр алгасна. Урьд тэдэнд зураглалын унтраалга (`SELBE_ENT_OFF`)-ыг асаалттай
   үлдээдэг `LIVE_OPT` жагсаалт байв — хөрвүүлэх хүснэгт хасагдсан тул хэрэггүй болж устгагдав. */

/* ── Аргументууд ── */
const argv = process.argv.slice(2);
const live = argv.includes('--live');
const verbose = argv.includes('--verbose');
let jobs = 4;
const jIdx = argv.indexOf('-j');
if (jIdx >= 0) jobs = Math.max(1, Number(argv[jIdx + 1]) || 4);
const timeoutS = resolveTimeoutS(argv, process.env);
const filters = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '-j' && argv[i - 1] !== '--timeout');

/* ── Файл олох ── */
const norm = (p) => p.split(sep).join('/');
const found = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.check.mjs')) found.push(norm(p));
  }
};
for (const r of ROOTS) walk(r);
found.sort();

const files = found
  .filter((f) => live || !LIVE.has(f))
  .filter((f) => !filters.length || filters.some((s) => f.includes(s)));

if (!files.length) {
  console.error('test-all: тохирох *.check.mjs олдсонгүй');
  process.exit(1);
}
/* ⚠️ 2026-10-09: `.env` нь git-ignored — шинэ clone/worktree дээр ~28 шалгуур учир нь ойлгомжгүй
   унадаг байв. Энд НЭГ удаа, эхэнд нь хэлнэ (`ts-alias.mjs` процесс бүрд мөн stderr-т бичнэ).
   CI нь орчны хувьсагчаар өгдөг тул `NEXT_PUBLIC_ENT_DATA` байвал чимээгүй. */
if (!existsSync('.env') && !process.env.NEXT_PUBLIC_ENT_DATA) {
  console.warn('⚠️ test-all: .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env); эс бөгөөс NEXT_PUBLIC_* шаарддаг шалгуурууд унана\n');
} else if (!process.env.NEXT_PUBLIC_ENT_DATA && existsSync('.env')
  && !/^\s*NEXT_PUBLIC_ENT_DATA\s*=\s*\S/m.test(readFileSync('.env', 'utf8'))) {
  /* ⚠️ 2026-10-11 (аудит №7): `.env.example`-ийг хуулсан ч УТГУУДЫГ бөглөөгүй (бүгд хоосон) — «.env алга»-тай
     ижил ~28 шалгуур унадаг атал дээрх анхааруулга чимээгүй байв. */
  console.error('⚠️ test-all: .env-ийн утгууд хоосон — бөглөнө үү (хоосон бол ~28 шалгуур унана)\n');
}
/* ⚠️ 2026-10-22 (аудит): АМЬД ТАНДАЛТ ЭНД НЭГ УДАА (`liveEnv.mjs`-ийн ⚠️) — урьд шалгуур БҮРИЙН процесс (`ts-alias.mjs`)
   өөрөө тандадаг тул Enterprise хүрэгдэхгүй CI-д ~220 процесс тус бүр 10–14 с сул зогсож `npm test` ~10–14 мин болдог байв.
   Үр дүнг env-ээр (`SELBE_LIVE_PROBED` · `SELBE_LIVE_TOKEN_OFF` · `SELBE_LIVE_SKIP`/`_REASON`) дамжуулна; хаяг/токен нь
   хүүхэд процессынхтой НЭГ дүрмээр (`loadPublicEnv` · `adminToken`). Эцэг аль хэдийн тандсан (`SELBE_LIVE_PROBED=1`) эсвэл
   `NEXT_PUBLIC_ENT_DATA` хоосон бол тандахгүй — хүүхэд урьдын адил шийднэ. */
let liveEnv = {};
if (process.env.SELBE_LIVE_PROBED !== '1') {
  const pub = { ...process.env };
  loadPublicEnv(pub);
  const ent = String(pub.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
  if (ent) liveEnv = liveEnvOf(await liveStatus({ ent, tok: adminToken(), warn: (m) => console.warn(m) }));
}
console.log(`test-all: ${files.length} шалгуур · зэрэг ${jobs} · хязгаар ${timeoutS}с${live ? ' · амьд орсон' : ''}\n`);

/* ── Ажиллуулах ── */
/* ⚠️ 2026-10-26: хөрвүүлэх хүснэгт (`entMap`) ба түүний нэгж тестийн унтраалга (`SELBE_ENT_OFF`) ХАСАГДСАН — хуурамч
   хүснэгт/fetch нь Enterprise-ийн БОДИТ хаяг · жижиг үсэгтэй талбараар бичигдсэн. */
const run = (file) => runCheck(file, {
  args: LOADER, timeoutMs: timeoutS * 1000,
  env: { ...process.env, ...liveEnv },
});

const results = [];
let next = 0;
const worker = async () => {
  while (next < files.length) {
    const file = files[next++];
    let r = await run(file);
    /* ⚠️ 2026-10-20: 200+ зэрэг процессын дунд Node санамсаргүй сүйрдэг (Windows exit 0xC0000409, ГАРАЛТГҮЙ, удаа бүр өөр
       файл; дангаараа үргэлж давдаг). Ийм — гаралтгүй, хугацаа хэтрээгүй — уналтыг НЭГ удаа дахин ажиллуулна; бодит
       уналт (assert/алдааны гаралттай) дахин оролдохгүй. */
    if (r.code !== 0 && !r.timedOut && !String(r.out ?? '').trim()) r = await run(file);
    results.push(r);
    const mark = r.code === 0 ? '✅' : r.timedOut ? '⏱' : '❌';
    console.log(`${mark} ${file} (${(r.ms / 1000).toFixed(1)}с)`);
    if (verbose && r.code === 0 && r.out.trim()) console.log(r.out.replace(/^/gm, '     '));
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

/* ── Дүн ── */
const failed = results.filter((r) => r.code !== 0);
/*
 * ⚠️ 2026-10-01: GitHub Actions дээр унасан шалгуур бүрийг ANNOTATION болгож гаргана.
 *    Ажлын лог зөвхөн репоны админд харагддаг тул «npm test унав» гэхээс өөр мэдээлэл
 *    олдохгүй байв (локал дээр 157/157 давж, CI дээр л унаж байсан). Annotation нь
 *    commit-ийн «checks» хэсэгт ба нийтийн API-д харагдана. Токен/нууц агуулахгүй —
 *    шалгуурын гаралтын СҮҮЛИЙН мөрүүд л (assert-ийн мессеж).
 */
const ghEsc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
for (const r of failed) {
  console.log(`\n══════════ ❌ ${r.file} (exit ${r.code}) ══════════`);
  console.log(r.out.trimEnd());
  if (process.env.GITHUB_ACTIONS === 'true') {
    const tail = r.out.trimEnd().split('\n').filter((l) => !/^\s+at /.test(l)).slice(-25).join('\n');
    console.log(`::error file=${r.file},title=${ghEsc(`test-all: ${r.file} (exit ${r.code})`)}::${ghEsc(tail.slice(-3500))}`);
  }
}
/* ⚠️ 2026-10-21 (аудит): АЛГАССАН АМЬД ШАЛГУУР — урьд CI дээр чимээгүй (⏭ мөр зөвхөн процессын логт) тул deploy ногоон
   атлаа амьд шалгуур нэг ч ажиллаагүйг хэн ч мэддэггүй байв. Одоо тоо + шалтгаан дүнд, GitHub Actions-д `::warning::`
   тэмдэглэл (нэг); алгасалтыг унал болгох бол `SELBE_LIVE_REQUIRED=1` (`ts-alias-hooks.mjs`). */
/* ⚠️ 2026-10-22 (аудит): `( … )` хэсэгтэй мөрийг ч тоолно — `gun.check.mjs` нь 1-р (сүлжээгүй) хэсгээ ажиллуулаад
   «⏭ амьд шалгуур (2–4) алгасав — …» гэж бичдэг тул урьд тоололд ОРДОГГҮЙ байв. */
const SKIP_RE = /^⏭ амьд шалгуур(?: \([^)]*\))? алгасав — (.*)$/m;
const skippedLive = results.filter((r) => SKIP_RE.test(r.out ?? ''));
if (skippedLive.length) {
  const why = SKIP_RE.exec(skippedLive[0].out)?.[1] ?? '?';
  console.log(`\n⏭ амьд шалгуур алгассан: ${skippedLive.length} (${why}) — ${skippedLive.map((r) => r.file).join(', ')}`);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=${ghEsc('Сэлбэ: амьд шалгуур алгасав')}::${ghEsc(`${skippedLive.length} амьд шалгуур ажиллаагүй — ${why}. Заавал болгох бол SELBE_LIVE_REQUIRED=1.`)}`);
  }
}
const total = results.reduce((s, r) => s + r.ms, 0);
console.log(
  `\ntest-all: ${results.length - failed.length}/${results.length} давлаа` +
  ` · нийт ${(total / 1000).toFixed(0)}с CPU` +
  (skippedLive.length ? ` · амьд алгассан ${skippedLive.length}` : '') +
  (failed.length ? ` · УНАСАН: ${failed.map((r) => r.file).join(', ')}` : ''),
);
process.exit(failed.length ? 1 : 0);
