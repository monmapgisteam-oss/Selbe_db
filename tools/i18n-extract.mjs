/**
 * i18n ТҮЛХҮҮР ГАРГАХ / ШАЛГАХ.
 *
 * Кодоос `tr('…')` дуудалт бүрийг AST-аар олж:
 *   node tools/i18n-extract.mjs           → дутуу/илүүдэл түлхүүрийн тайлан
 *   node tools/i18n-extract.mjs --json    → дутуу түлхүүрүүдийг JSON-оор
 *   node tools/i18n-extract.mjs --prune   → en.ts-ээс ХЭРЭГГҮЙ түлхүүр цэвэрлэнэ
 *   node tools/i18n-extract.mjs --dynamic → ДИНАМИК `tr(x)` дуудалтын байршлыг жагсаана
 *
 * ⚠️ Түлхүүр нь МОНГОЛ ЭХ ТЕКСТ өөрөө. Тиймээс кодын монгол текстийг засвал
 * толины түлхүүр хоцорч, тэр мөр англи дээр орчуулагдахаа болино (унахгүй —
 * монголоор харагдана). Энэ хэрэгсэл яг тэр хоцрогсдыг олно.
 *
 * ⚠️ 2026-09-24: ДИНАМИК дуудалт (`tr(b.label)`, `tr(i.tolov)` …) AST-д
 *    олдохгүй тул тэдгээрийн утгыг `tools/i18n-keep.txt`-д бүртгэнэ — тайлан
 *    ба `--prune` хоёулаа тэр жагсаалтыг «хэрэглэгдэж буй» гэж тооцно.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const DICT_FILE = join(ROOT, 'i18n', 'en.ts');
const KEEP_FILE = join(ROOT, '..', 'tools', 'i18n-keep.txt');
const argv = process.argv.slice(2);

/** Динамик `tr(x)`-ийн утгуудын хадгалах жагсаалт — мөр бүр нэг түлхүүр, `#` тайлбар */
export function readKeep() {
  let src = '';
  try { src = readFileSync(KEEP_FILE, 'utf8'); } catch { return new Set(); }
  return new Set(src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
}

function walk(d, acc = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(p) && !/\.check\./.test(p)) acc.push(p);
  }
  return acc;
}

/**
 * Тогтмол мөрийг ЭВХЭНЭ: шууд литерал, хаалттай литерал, литералуудын '+' холбоос.
 * хувьсагч/функц бол `null` — динамик дуудалт.
 *
 * ⚠️ 2026-09-25: урьд нь ЗӨВХӨН шууд литерал танигддаг байсан тул урт мөрийг
 * `tr('… ' + '…')` гэж хуваасан түлхүүр ОГТ цуглардаггүй — en.ts-д байхгүй
 * атал «ДУТУУ 0» гэж хэвлэж, англи горимд тэр мөр монголоороо үлддэг байв
 * (`IpcTable.tsx`-ийн тэмдэглэл). JS нь `+`-ийг зүүнээс баруун тийш
 * холбодог тул мод нь зүүн тийш гүнзгийрнэ — рекурс хангалттай.
 */
function foldString(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isParenthesizedExpression(n)) return foldString(n.expression);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = foldString(n.left);
    if (l == null) return null;
    const r = foldString(n.right);
    return r == null ? null : l + r;
  }
  return null;
}

/**
 * ДИНАМИК `tr(x)` дуудалтын байршил — AST утгыг нь мэдэхгүй тул дутуу/илүүдэл
 * тайланд ОРОХГҮЙ. ⚠️ Тэдгээрийн утга `i18n-keep.txt` + `en.ts`, эсвэл
 * `enData.ts`-д бүртгэгдсэн байх ёстой — эс бөгөөс англи горимд монголоор
 * үлдэнэ. «ДУТУУ 0» нь тэднийг ХАМРАХГҮЙ гэдгийг тайланд ил бичнэ.
 */
export const dynamicCalls = [];

/** Кодод бодитоор дуудагдаж буй бүх түлхүүр → хаана хэрэглэгдэж буй */
export function collectKeys() {
  const keys = new Map();
  dynamicCalls.length = 0;
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, 'utf8');
    if (!src.includes('tr(')) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true,
      f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(ROOT, f).replace(/\\/g, '/');

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tr') {
        const a = node.arguments[0];
        const k = a ? foldString(a) : null;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        if (k != null) {
          if (!keys.has(k)) keys.set(k, []);
          keys.get(k).push(rel + ':' + (line + 1));
        } else if (a) {
          dynamicCalls.push(rel + ':' + (line + 1) + '  tr(' + a.getText(sf).slice(0, 60) + ')');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

/** en.ts-ийн толийг AST-аар уншина (import хийвэл tsc хэрэгтэй болно) */
export function readDict() {
  const src = readFileSync(DICT_FILE, 'utf8');
  const sf = ts.createSourceFile(DICT_FILE, src, ts.ScriptTarget.ESNext, true);
  const out = {};
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        if (ts.isPropertyAssignment(p) &&
            (ts.isStringLiteral(p.name) || ts.isNoSubstitutionTemplateLiteral(p.name)) &&
            (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) {
          out[p.name.text] = p.initializer.text;
        }
      }
      return; // эхний (гол) объектоор хангалттай
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const keys = collectKeys();
const dict = readDict();
const keep = readKeep();
/* ⚠️ `keep` нь толинд байгаа эсэхээс үл хамааран «хэрэглэгдэж буй» — толинд
   байхгүй бол дутуу гэж тоолохгүй (динамик утга орчуулгагүй ч унадаггүй). */
const used = (k) => keys.has(k) || keep.has(k);
/* ⚠️ Толинд байхгүй keep-мөр — сануулга л (унагахгүй): орчуулгагүй ч ажилладаг,
   гэхдээ ихэвчлэн эх текст өөрчлөгдсөний шинж. */
const keepMissing = [...keep].filter((k) => !(k in dict));
if (keepMissing.length && !argv.includes('--json')) {
  console.warn('⚠️ i18n-keep.txt-ийн ' + keepMissing.length + ' мөр толинд байхгүй:');
  keepMissing.slice(0, 15).forEach((k) => console.warn('   «' + k.slice(0, 70) + '»'));
  if (keepMissing.length > 15) console.warn('   … бас ' + (keepMissing.length - 15));
}

const missing = [...keys.keys()].filter((k) => !(k in dict));
const unused = Object.keys(dict).filter((k) => !used(k));

if (argv.includes('--json')) {
  console.log(JSON.stringify(missing, null, 1));
} else if (argv.includes('--dynamic')) {
  dynamicCalls.forEach((d) => console.log(d));
  console.log('\nДинамик tr(x) дуудалт: ' + dynamicCalls.length);
} else if (argv.includes('--prune')) {
  const kept = Object.fromEntries(Object.entries(dict).filter(([k]) => used(k)));
  const head = readFileSync(DICT_FILE, 'utf8').split('const en:')[0];
  writeFileSync(DICT_FILE,
    head + 'const en: Record<string, string> = ' + JSON.stringify(kept, null, 2) + ';\n\nexport default en;\n', 'utf8');
  console.log('Цэвэрлэв: ' + unused.length + ' хэрэггүй түлхүүр хасав, ' + Object.keys(kept).length + ' үлдэв');
} else {
  console.log('Кодод хэрэглэгдэж буй түлхүүр: ' + keys.size);
  console.log('Толинд орчуулагдсан:          ' + (keys.size - missing.length));
  console.log('ДУТУУ (англиар гарахгүй):     ' + missing.length);
  console.log('Толины ИЛҮҮДЭЛ (хоцорсон):    ' + unused.length);
  /* ⚠️ Унагахгүй — утга нь ажиллах үед л мэдэгдэнэ. Гэхдээ «ДУТУУ 0» нь эдгээрийг
     хамраагүйг ил хэлнэ (`--dynamic` жагсаана). */
  console.log('Динамик tr(x) (шалгагдаагүй): ' + dynamicCalls.length
    + ' — утгыг i18n-keep.txt + en.ts / enData.ts-д бүртгэнэ (--dynamic)');
  if (unused.length) {
    console.log('\n⚠️ Хоцорсон түлхүүрүүд — эх текст нь өөрчлөгдсөн байж магадгүй:');
    unused.slice(0, 15).forEach((k) => console.log('   «' + k.slice(0, 70) + '»'));
    if (unused.length > 15) console.log('   … бас ' + (unused.length - 15));
  }
  process.exitCode = missing.length || unused.length ? 1 : 0;
}
