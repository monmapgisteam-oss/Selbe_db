/**
 * ХЭЛ СОЛИХОД ДАХИН АЧААЛАЛГҮЙ — модулийн түвшний `tr()` ХОРИОТОЙ (2026-09-30).
 *
 * `setLocale` нь `location.reload()`-гүй ажилладаг (`LOCALE_SWITCH_RELOADS =
 * false`): store шинэчлэгдэж, `LocaleProvider` `key={generation}`-ээр аппыг
 * remount хийнэ. Гэвч МОДУЛЬ нэг л удаа ачаалагддаг тул модулийн түвшинд
 * (функцээс гадуур) дуудсан `tr('…')` нь ачаалах үеийн хэлээр ХӨЛДӨНӨ —
 * remount ч дахин үнэлэхгүй. 2026-09-30-нд ~1,540 ийм дуудалтыг
 *   · `key: tr('…')`          → `get key() { return tr('…'); }`
 *   · `key: [tr('…'), …]`     → `const lzKey = perLocale(() => […]); get key() { return lzKey(); }`
 *   · `const X = tr('…')`     → `const X = () => tr('…')` (дуудалтад `X()`)
 *   · `const X = [tr('…')]`   → `const X = perLocale(() => […])` (дуудалтад `X()`)
 * хэлбэрт шилжүүлсэн. Энэ шалгуур ШИНЭ модулийн түвшний дуудалт орж ирэхээс
 * сэргийлнэ.
 *
 * Хориотой хоёр хэлбэр (AST-аар, `tools/i18n-extract.mjs`-тэй ижил аргаар):
 *   1. Функцийн өвөггүй `tr()` — объектын талбар, массивын элемент, тогтмол.
 *   2. Модулийн түвшинд ШУУД ажилладаг callback доторх `tr()` —
 *      `X.map((r) => ({ title: tr(…) }))`, `Object.fromEntries(…tr(…))` —
 *      ачаалах үед нэг удаа ажиллаад мөн адил хөлддөг.
 * Зөвшөөрөгдсөн: getter/функц/компонент/`perLocale(() => …)` дотор.
 *
 * ⚠️ САНААТАЙ СТАТИК: мэдэгдлийн өмнөх тайлбарт `i18n-static` бичсэн бол
 *    алгасна — зөвхөн үр дүн нь хэлээс үл хамаарах тохиолдолд (жиш.
 *    `DedButets.WELL_SUFFIX`: суффикс ба давхаргын нэр нэг агшинд ижил хэлээр).
 *
 * ⚠️ `t(` нь `i18nCore`-ийн жинхэнэ нэр — импортын alias-ыг (`t as tr`)
 *    файл бүрээс уншина; `ViewPanel.tsx`-ийн `t: Totals` зэрэг өөр `t`-д
 *    хамаарахгүй.
 */
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ⚠️ 2026-09-30: өөр сешн засварлаж буй файл — 12 цэг (`label: tr(…)` → getter)
   болмогц энэ жагсаалтыг ХООСЛО. Эдгээр нь унагахгүй, сануулна. */
const PENDING = new Set([]);

function walk(d, acc = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(p) && !/\.check\./.test(p)) acc.push(p);
  }
  return acc;
}

const isFnLike = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
  || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n)
  || ts.isClassDeclaration(n) || ts.isClassExpression(n);

/** Ачаалах үед ШУУД ажилладаг callback-ийн нэрс — үүнээс гадуурх функц «хойшлогдсон» */
const EAGER = /^(map|filter|flatMap|forEach|reduce|some|every|find|findIndex|findLast|sort|toSorted|from|fromEntries|entries|values|keys)$/;

/**
 * Модулийн түвшинд үнэлэгдэх үү: функцийн өвөг байхгүй, ЭСВЭЛ өвөг бүр нь
 * модулийн түвшний `.map(…)`-маягийн дуудалтын шууд аргумент.
 */
function evaluatedAtLoad(node) {
  let p = node.parent;
  while (p) {
    if (isFnLike(p)) {
      if (!(ts.isArrowFunction(p) || ts.isFunctionExpression(p))) return false;
      const call = p.parent;
      if (!ts.isCallExpression(call) || !call.arguments.includes(p)) return false;
      const ce = call.expression;
      if (!(ts.isPropertyAccessExpression(ce) && EAGER.test(ce.name.text))) return false;
    }
    p = p.parent;
  }
  return true;
}

/** Мэдэгдлийн өмнөх тайлбарт `i18n-static` байна уу */
function staticMarked(node, sf, src) {
  let top = node;
  while (top.parent && !ts.isSourceFile(top.parent)) top = top.parent;
  const ranges = ts.getLeadingCommentRanges(src, top.getFullStart()) ?? [];
  return ranges.some((r) => src.slice(r.pos, r.end).includes('i18n-static'));
}

function trNames(sf) {
  const names = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    if (!/i18n(Core)?['"]$/.test(st.moduleSpecifier.getText(sf))) continue;
    for (const el of st.importClause.namedBindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (imported === 't' || imported === 'tr') names.add(el.name.text);
    }
  }
  return names;
}

const bad = [];
const pending = [];
let scanned = 0;
for (const f of walk(join(ROOT, 'src'))) {
  const src = readFileSync(f, 'utf8');
  if (!/\b(tr|t)\(/.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = trNames(sf);
  if (!names.size) continue;
  scanned++;
  const rel = relative(join(ROOT, 'src'), f).replace(/\\/g, '/');
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)
        && evaluatedAtLoad(node) && !staticMarked(node, sf, src)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      (PENDING.has(rel) ? pending : bad).push(`${rel}:${line + 1}  ${node.getText(sf).slice(0, 70).replace(/\s+/g, ' ')}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

console.log(`i18nLazy: ${scanned} файл шалгав · модулийн түвшний tr(): ${bad.length} · хүлээгдэж буй (PENDING): ${pending.length}`);
if (pending.length) {
  console.warn('⚠️ PENDING файлын цэгүүд (getter болгох):');
  pending.forEach((s) => console.warn('   ' + s));
}
assert.equal(bad.length, 0,
  'Модулийн түвшний tr() — хэл солиход хөлдөнө; getter / perLocale / функц болго:\n  ' + bad.join('\n  '));

/* ── Туг ба цөмийн API ── */
const core = readFileSync(join(ROOT, 'src/lib/i18nCore.ts'), 'utf8');
assert.ok(/export const LOCALE_SWITCH_RELOADS: boolean = false;/.test(core),
  'LOCALE_SWITCH_RELOADS нь false байх ёстой — модулийн түвшний tr() бүгд lazy болсон (2026-09-30)');
assert.ok(/export function perLocale</.test(core), 'perLocale helper алга');

/* ── perLocale: хэл бүрд нэг удаа, identity тогтмол ── */
{
  const { perLocale, setLocale, getLocale, t } = await import('./i18nCore.ts');
  let calls = 0;
  const arr = perLocale(() => { calls++; return [t('Хойд')]; });
  assert.equal(arr(), arr(), 'нэг хэл дотор identity тогтмол');
  assert.equal(calls, 1);
  assert.equal(getLocale(), 'mn');
  const before = arr()[0];
  setLocale('en');
  assert.equal(getLocale(), 'en', 'Node-д ч (localStorage-гүй) store солигдоно');
  const after = arr()[0];
  assert.equal(calls, 2, 'хэл солигдоход дахин бодно');
  assert.notEqual(before, after, 'en толинд «Хойд» орчуулгатай байх ёстой');
  setLocale('mn');
  assert.equal(arr()[0], before);
  assert.equal(calls, 3);
}

console.log('✓ i18nLazy: модулийн түвшний tr() 0 · LOCALE_SWITCH_RELOADS=false · perLocale хэл бүрд дахин бодно');
