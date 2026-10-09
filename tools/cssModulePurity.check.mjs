/**
 * `*.module.css` ЦЭВЭР (pure) ЭСЭХ — `next build`-ийн css-loader-тэй ИЖИЛ дүрэм.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/cssModulePurity.check.mjs
 *
 * ⚠️ 2026-10-09: ЯАГААД. 2026-10-08-нд `map.module.css`-д `:global(.mapFsHost) {…}` гэсэн
 *    ГАНЦ сонгогч орж, css-loader-ийн pure горимд «Selector ":global(.mapFsHost)" is not pure»
 *    гэж `next build` унав — deploy зогсов. tsc · eslint · npm test · `next dev` бүгд үүнийг
 *    БАРЬДАГГҮЙ (dev нь pure шалгалтгүй), харин `next build`-ийг репод ажиллуулахыг CLAUDE.md
 *    хориглодог (хэрэглэгчийн `.next`-ийг эвдэнэ). Тиймээс Next-ийн ӨӨРИЙН багцалсан
 *    `postcss-modules-local-by-default`-ийг `{ mode: 'pure' }`-ээр, дараа нь
 *    `postcss-modules-scope`-ийг ажиллуулж, build-тэй ижил алдааг ~1 секундэд барина.
 *
 * ⚠️ Дүрэм: модулийн CSS-ийн сонгогч БҮР дор хаяж нэг ЛОКАЛ класс/ID агуулна.
 *    `:root {}`, `body {}`, `:global(.x) {}` ганцаараа — хориотой. Глобал дүрэм `globals.css`
 *    руу (хангалттай тодорхой сонгогчтой, жишээ нь `.mapFsHost.mapFsHost.mapFsHost` 0,3,0).
 *
 * Унасан файл бүрийг `файл:мөр:багана — мессеж` хэлбэрээр жагсаана; файл доторх БҮХ
 * буруу блокийг (зөвхөн эхнийхийг биш) олохын тулд унасан файлыг дээд түвшний зангилаагаар
 * нь салгаж дахин шалгана.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const require = createRequire(join(ROOT, 'package.json'));
const postcss = require('postcss');
/* ⚠️ Next-ийн css-loader яг эдгээрийг ашигладаг — тусдаа хувилбар суулгахгүй (dependency нэмэхгүй). */
const localByDefault = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');

const plugins = () => [localByDefault({ mode: 'pure' }), scope({ generateScopedName: (n) => n })];

/** Нэг CSS текстийг шалгаад алдааны жагсаалт буцаана: [{ line, column, message }] */
export async function checkCss(css, from = 'inline.module.css') {
  try {
    await postcss(plugins()).process(css, { from });
    return [];
  } catch (e) {
    if (e?.name !== 'CssSyntaxError' && !/pure/i.test(String(e?.message))) throw e;
  }
  /* Унасан → дээд түвшний зангилаа бүрийг тусад нь шалгаж БҮХ буруу блокийг олно. */
  const root = postcss.parse(css, { from });
  const errs = [];
  for (const node of root.nodes) {
    if (node.type === 'comment') continue;
    /* ⚠️ Програмаар үүсгэсэн root-д `source.input` байхгүй тул scope plugin унадаг — зангилааны
       ТЕКСТИЙГ анхны мөр/баганад нь байрлуулж (урд нь хоосон мөр/зай) дахин парсална. */
    const st = node.source?.start ?? { line: 1, column: 1 };
    const one = '\n'.repeat(st.line - 1) + ' '.repeat(st.column - 1) + node.toString();
    try {
      await postcss(plugins()).process(one, { from });
    } catch (e) {
      errs.push({
        line: e.line ?? node.source?.start?.line ?? 0,
        column: e.column ?? node.source?.start?.column ?? 0,
        message: String(e.reason || e.message).split('\n')[0],
      });
    }
  }
  /* Салгахад давсан ч бүхэлдээ унасан бол (жишээ нь файлын түвшний холбоос) — ерөнхий алдаа. */
  if (!errs.length) errs.push({ line: 0, column: 0, message: 'pure шалгалт унав (блок тус бүрээр давсан)' });
  return errs;
}

/* ── 1) Сөрөг тест: шалгуур өөрөө буруу сонгогчийг БАРЬДАГ эсэх (файл үүсгэхгүй, түр мөр) ── */
{
  const bad = [
    [':global(.x) { color: red; }', 1],
    [':root { --a: 1; }', 1],
    ['body { margin: 0; }', 1],
    ['.ok { color: red; }\n\n:global(.y) .z :global(.w) {}\n:root{}', 1],
  ];
  for (const [css] of bad) {
    const errs = await checkCss(css);
    assert.ok(errs.length >= 1, `шалгуур буруу сонгогчийг барьсангүй: ${JSON.stringify(css)}`);
  }
  /* Олон буруу блоктой үед БҮГДИЙГ нь, зөв мөрийн дугаартай олно */
  const multi = await checkCss('.a { color: red; }\n:global(.x) { color: red; }\n.b {}\nbody { margin: 0; }\n');
  assert.deepEqual(multi.map((e) => e.line), [2, 4], `олон алдааны мөр буруу: ${JSON.stringify(multi)}`);

  const good = [
    '.a :global(.x) { color: red; }',
    ':global(.x) .a { color: red; }',
    '.a.b > .c:hover::before {}',
    '@media (prefers-reduced-motion: no-preference) { .a { scroll-behavior: smooth; } }',
    '@keyframes spin { from { transform: rotate(0); } to { transform: rotate(1turn); } }',
    '.a[data-open="1"] .b {}',
  ];
  for (const css of good) {
    const errs = await checkCss(css);
    assert.deepEqual(errs, [], `цэвэр сонгогчийг буруу гэж үзэв: ${JSON.stringify(css)} → ${JSON.stringify(errs)}`);
  }
  console.log('✅ сөрөг тест: :global(.x){} · :root{} · body{} барина, цэвэр сонгогчийг өнгөрөөнө');
}

/* ── 2) Бүх `src/**\/*.module.css` ── */
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.next')) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.module.css')) files.push(p);
  }
};
walk(join(ROOT, 'src'));
assert.ok(files.length > 0, 'src доторх *.module.css олдсонгүй');

const failures = [];
for (const f of files.sort()) {
  const rel = relative(ROOT, f).split(sep).join('/');
  for (const e of await checkCss(readFileSync(f, 'utf8'), f)) failures.push(`${rel}:${e.line}:${e.column} — ${e.message}`);
}
if (failures.length) {
  console.error(`❌ ${failures.length} цэвэр бус сонгогч (\`next build\` унана):\n  ${failures.join('\n  ')}`);
  console.error('   → сонгогчид локал класс нэмэх, эсвэл дүрмийг globals.css руу зөөх.');
  process.exit(1);
}
console.log(`✅ ${files.length} *.module.css бүгд pure горимд цэвэр`);

/* ── 3) ГЛОБАЛ (модуль биш) CSS-ийн СИНТАКС — 2026-10-09 ──
   ⚠️ ЯАГААД: `globals.css`-ийн тайлбарт «--c* /--good» (зайгүй) гэж бичигдсэн нь тайлбар хаагчаар ЭРТ хааж,
   үлдсэн текст CSS болж `next build` «Unknown word (102:9)»-ээр унав (графикийн жигдлэлтийн merge).
   Дээрх 2-р алхам зөвхөн `*.module.css`-ийг хардаг тул бусад CSS-ийг postcss-ээр parse хийнэ. */
{
  const neg = (() => { try { postcss.parse(':root { /* a --c*/--good нь b */ --x: 1; }'); return false; } catch { return true; } })();
  assert.ok(neg, 'сөрөг тест: тайлбар доторх «*/» алдааг барьсангүй');
  const plain = [];
  const walk2 = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.next')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk2(p);
      else if (e.name.endsWith('.css') && !e.name.endsWith('.module.css')) plain.push(p);
    }
  };
  walk2(join(ROOT, 'src'));
  const synErr = [];
  for (const f of plain.sort()) {
    try { postcss.parse(readFileSync(f, 'utf8'), { from: f }); } catch (e) {
      synErr.push(`${relative(ROOT, f).split(sep).join('/')}:${e.line ?? 0}:${e.column ?? 0} — ${String(e.reason || e.message).split('\n')[0]}`);
    }
  }
  if (synErr.length) {
    console.error(`❌ ${synErr.length} глобал CSS-ийн синтакс алдаа (\`next build\` унана):\n  ${synErr.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✅ ${plain.length} глобал *.css синтакс цэвэр`);
}
