/**
 * БҮХ `*.check.mjs` ШАЛГУУРЫГ ОЛЖ, ЗЭРЭГ АЖИЛЛУУЛНА.
 *   node tools/test-all.mjs            — нэгж шалгуурууд (npm test)
 *   node tools/test-all.mjs --live     — амьд ArcGIS/реле шаарддаг 6-г ч хамт
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
import { existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { runCheck, resolveTimeoutS } from './testRun.mjs';

const ROOTS = ['src', 'docs', 'tools'];
const LOADER = ['--experimental-transform-types', '--import', './tools/ts-alias.mjs'];

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
   CI нь орчны хувьсагчаар өгдөг тул `NEXT_PUBLIC_ARCGIS_HJ` байвал чимээгүй. */
if (!existsSync('.env') && !process.env.NEXT_PUBLIC_ARCGIS_HJ) {
  console.warn('⚠️ test-all: .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env); эс бөгөөс NEXT_PUBLIC_* шаарддаг шалгуурууд унана\n');
}
console.log(`test-all: ${files.length} шалгуур · зэрэг ${jobs} · хязгаар ${timeoutS}с${live ? ' · амьд орсон' : ''}\n`);

/* ── Ажиллуулах ── */
const run = (file) => runCheck(file, { args: LOADER, timeoutMs: timeoutS * 1000 });

const results = [];
let next = 0;
const worker = async () => {
  while (next < files.length) {
    const file = files[next++];
    const r = await run(file);
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
const total = results.reduce((s, r) => s + r.ms, 0);
console.log(
  `\ntest-all: ${results.length - failed.length}/${results.length} давлаа` +
  ` · нийт ${(total / 1000).toFixed(0)}с CPU` +
  (failed.length ? ` · УНАСАН: ${failed.map((r) => r.file).join(', ')}` : ''),
);
process.exit(failed.length ? 1 : 0);
