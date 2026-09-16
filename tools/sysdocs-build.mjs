/**
 * СИСТЕМИЙН БАРИМТЫГ TS БОЛГОХ — `docs/` → `src/lib/sysDocs.ts`.
 *   node tools/sysdocs-build.mjs
 *
 * ⚠️ ЭХ СУРВАЛЖ НЬ `docs/` ХЭВЭЭР. Энэ скрипт зөвхөн хуулбарладаг тул
 * баримтыг `docs/`-д засна, порталд ГАРААР хуулахгүй. GitHub дээр `.md`
 * хэвээр уншигдана, порталд мөн адил агуулга гарна — нэг эх сурвалж.
 *
 * ⚠️ `output: 'export'` СТАТИК тул ажиллах үед файл уншиж БОЛОХГҮЙ —
 * агуулгыг бүтээх үед код дотор шингээнэ.
 *
 * ⚠️ Гаралтыг ГАРААР ЗАСАХГҮЙ. `npm run docs:build` дахин бичнэ.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'src/lib/sysDocs.ts';

/* Эрэмбэ нь файлын нэрийн угтварын дугаараар; `SYSTEM.md` нь ЭХЭНД */
const parts = readdirSync('docs/system')
  .filter((f) => f.endsWith('.md'))
  .sort();

const files = [{ id: 'index', path: 'docs/SYSTEM.md' }].concat(
  parts.map((f) => ({ id: f.replace(/\.md$/, ''), path: `docs/system/${f}` })),
);

/** Эхний `# ...` мөрөөс гарчиг */
const titleOf = (src) => {
  const m = /^#\s+(.+)$/m.exec(src);
  return m ? m[1].trim() : '(гарчиггүй)';
};

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const docs = files.map(({ id, path }) => {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return { id, title: titleOf(src), body: src };
});

const head = `/* ⚠️ АВТОМАТААР ҮҮССЭН — ГАРААР ЗАСАХГҮЙ.
 *    Эх сурвалж: docs/SYSTEM.md · docs/system/*.md
 *    Дахин бүтээх: npm run docs:build
 *
 * ⚠️ ЯАГААД КОД ДОТОР ШИНГЭСЭН БЭ: төсөл нь \`output: 'export'\` статик тул
 *    ажиллах үед файлын системээс уншиж чадахгүй. Бүтээх үед шингээнэ.
 */

export type SysDoc = { id: string; title: string; body: string };

export const SYS_DOCS: SysDoc[] = [
`;

const body = docs
  .map((d) => `  {\n    id: '${d.id}',\n    title: \`${esc(d.title)}\`,\n    body: \`${esc(d.body)}\`,\n  },`)
  .join('\n');

writeFileSync(OUT, `${head}${body}\n];\n`, 'utf8');
console.log(`sysDocs.ts — ${docs.length} файл · ${docs.reduce((a, d) => a + d.body.length, 0)} тэмдэгт`);
