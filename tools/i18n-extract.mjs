/**
 * i18n ТҮЛХҮҮР ГАРГАХ / ШАЛГАХ.
 *
 * Кодоос `tr('…')` дуудалт бүрийг AST-аар олж:
 *   node tools/i18n-extract.mjs           → дутуу/илүүдэл түлхүүрийн тайлан
 *   node tools/i18n-extract.mjs --json    → дутуу түлхүүрүүдийг JSON-оор
 *   node tools/i18n-extract.mjs --prune   → en.ts-ээс ХЭРЭГГҮЙ түлхүүр цэвэрлэнэ
 *
 * ⚠️ Түлхүүр нь МОНГОЛ ЭХ ТЕКСТ өөрөө. Тиймээс кодын монгол текстийг засвал
 * толины түлхүүр хоцорч, тэр мөр англи дээр орчуулагдахаа болино (унахгүй —
 * монголоор харагдана). Энэ хэрэгсэл яг тэр хоцрогсдыг олно.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const DICT_FILE = join(ROOT, 'i18n', 'en.ts');
const argv = process.argv.slice(2);

function walk(d, acc = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(p) && !/\.check\./.test(p)) acc.push(p);
  }
  return acc;
}

/** Кодод бодитоор дуудагдаж буй бүх түлхүүр → хаана хэрэглэгдэж буй */
export function collectKeys() {
  const keys = new Map();
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, 'utf8');
    if (!src.includes('tr(')) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true,
      f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(ROOT, f).replace(/\\/g, '/');

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tr') {
        const a = node.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          if (!keys.has(a.text)) keys.set(a.text, []);
          keys.get(a.text).push(rel + ':' + (line + 1));
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

const missing = [...keys.keys()].filter((k) => !(k in dict));
const unused = Object.keys(dict).filter((k) => !keys.has(k));

if (argv.includes('--json')) {
  console.log(JSON.stringify(missing, null, 1));
} else if (argv.includes('--prune')) {
  const kept = Object.fromEntries(Object.entries(dict).filter(([k]) => keys.has(k)));
  const head = readFileSync(DICT_FILE, 'utf8').split('const en:')[0];
  writeFileSync(DICT_FILE,
    head + 'const en: Record<string, string> = ' + JSON.stringify(kept, null, 2) + ';\n\nexport default en;\n', 'utf8');
  console.log('Цэвэрлэв: ' + unused.length + ' хэрэггүй түлхүүр хасав, ' + Object.keys(kept).length + ' үлдэв');
} else {
  console.log('Кодод хэрэглэгдэж буй түлхүүр: ' + keys.size);
  console.log('Толинд орчуулагдсан:          ' + (keys.size - missing.length));
  console.log('ДУТУУ (англиар гарахгүй):     ' + missing.length);
  console.log('Толины ИЛҮҮДЭЛ (хоцорсон):    ' + unused.length);
  if (unused.length) {
    console.log('\n⚠️ Хоцорсон түлхүүрүүд — эх текст нь өөрчлөгдсөн байж магадгүй:');
    unused.slice(0, 15).forEach((k) => console.log('   «' + k.slice(0, 70) + '»'));
    if (unused.length > 15) console.log('   … бас ' + (unused.length - 15));
  }
  process.exitCode = missing.length || unused.length ? 1 : 0;
}
