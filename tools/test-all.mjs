/**
 * БҮХ `*.check.mjs` ШАЛГУУРЫГ ОЛЖ, ЗЭРЭГ АЖИЛЛУУЛНА.
 *   node tools/test-all.mjs            — нэгж шалгуурууд (npm test)
 *   node tools/test-all.mjs --live     — амьд ArcGIS/реле шаарддаг 7-г (`LIVE`) ч хамт
 *   node tools/test-all.mjs huvaari    — нэрэнд «huvaari» орсон файлууд л
 *   node tools/test-all.mjs -j 2       — зэрэг ажиллах тоо (анхдагч 4)
 *   node tools/test-all.mjs --verbose  — давсан шалгуурын гаралтыг ч хэвлэнэ
 *   node tools/test-all.mjs --timeout 300 — нэг шалгуурын дээд хугацаа, сек
 *                                         (анхдагч 180; env TEST_TIMEOUT_S ч болно)
 *   node tools/test-all.mjs --require-live — амьд шалгуур алгасагдах байвал (токен хүчингүй ·
 *                                         Enterprise хүрэгдэхгүй) УНАНА (`npm run test:strict`)
 *
 * Гаралт: давсан файлын гаралтыг НУУНА (--verbose-гүй бол), унасан файлынхыг
 * төгсгөлд БҮТНЭЭР хэвлэнэ. Нэг ч унавал exit 1.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { runCheck, resolveTimeoutS } from './testRun.mjs';
import { loadPublicEnv, adminToken, liveStatus, liveEnvOf } from './liveEnv.mjs';

const ROOTS = ['src', 'docs', 'tools'];
const LOADER = ['--experimental-transform-types', '--import', './tools/ts-alias.mjs', '--import', './tools/test-users.mjs'];

/** `npm run test:live`-тэй ИЖИЛ жагсаалт — амьд өгөгдөл / реле шаарддаг */
const LIVE = new Set([
  'src/lib/filters.check.mjs',
  'src/lib/blockProgress.check.mjs',
  'src/modules/monitor.check.mjs',
  'src/lib/analysis/transport.check.mjs',
  'src/lib/agent/agent.check.mjs',
  'src/lib/agent/drift.check.mjs',
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
const requireLive = argv.includes('--require-live') || process.env.SELBE_LIVE_REQUIRED === '1';
if (requireLive) process.env.SELBE_LIVE_REQUIRED = '1';
const filters = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '-j' && argv[i - 1] !== '--timeout');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  console.warn(`⚠️ test-all: Node ${process.versions.node} — CI ба package.json engines нь Node 22; энд давсан нь CI-д унаж болно (.nvmrc)\n`);
}

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
if (!existsSync('.env') && !process.env.NEXT_PUBLIC_ENT_DATA) {
  console.warn('⚠️ test-all: .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env); эс бөгөөс NEXT_PUBLIC_* шаарддаг шалгуурууд унана\n');
} else if (!process.env.NEXT_PUBLIC_ENT_DATA && existsSync('.env')
  && !['NEXT_PUBLIC_ENT_DATA', 'NEXT_PUBLIC_AUTH_APP_ID'].every((k) => new RegExp(`^\\s*${k}\\s*=\\s*\\S`, 'm').test(readFileSync('.env', 'utf8')))) {
  console.error('⚠️ test-all: .env-ийн утгууд хоосон — бөглөнө үү (хоосон бол ~28 шалгуур унана)\n');
}
let liveEnv = {};
if (process.env.SELBE_LIVE_PROBED !== '1') {
  const pub = { ...process.env };
  loadPublicEnv(pub);
  const ent = String(pub.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
  if (ent) liveEnv = liveEnvOf(await liveStatus({ ent, tok: adminToken(), warn: (m) => console.warn(m) }));
}
if (requireLive && liveEnv.SELBE_LIVE_SKIP === '1') {
  console.error(`⛔ test-all --require-live: амьд шалгуур алгасагдах байсан — ${liveEnv.SELBE_LIVE_SKIP_REASON || '?'}. ARCGIS_ADMIN_TOKEN-оо шинэчилнэ үү (.env.development.local).`);
  process.exit(1);
}
console.log(`test-all: ${files.length} шалгуур · зэрэг ${jobs} · хязгаар ${timeoutS}с${live ? ' · амьд орсон' : ''}\n`);

/* ── Ажиллуулах ── */
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
const ghEsc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
for (const r of failed) {
  console.log(`\n══════════ ❌ ${r.file} (exit ${r.code}) ══════════`);
  console.log(r.out.trimEnd());
  if (process.env.GITHUB_ACTIONS === 'true') {
    const tail = r.out.trimEnd().split('\n').filter((l) => !/^\s+at /.test(l)).slice(-25).join('\n');
    console.log(`::error file=${r.file},title=${ghEsc(`test-all: ${r.file} (exit ${r.code})`)}::${ghEsc(tail.slice(-3500))}`);
  }
}
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
const summary =
  `test-all: ${results.length - failed.length}/${results.length} давлаа` +
  ` · нийт ${(total / 1000).toFixed(0)}с CPU` +
  (skippedLive.length ? ` · амьд алгассан ${skippedLive.length}` : '') +
  (failed.length ? ` · УНАСАН: ${failed.map((r) => r.file).join(', ')}` : '');
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`### ${failed.length ? '❌' : '✅'} ${summary}`];
  if (skippedLive.length) {
    md.push('', `> ⚠️ **Амьд шалгуур ажиллаагүй (${skippedLive.length})** — ${SKIP_RE.exec(skippedLive[0].out)?.[1] ?? '?'}`, '');
    for (const r of skippedLive) md.push(`- ⏭ \`${r.file}\``);
  }
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`); } catch { /* хураангуй заавал биш */ }
}
process.exit(failed.length ? 1 : 0);
