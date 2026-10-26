/**
 * ТАЛБАРЫН ТОГТМОЛ (`F`) — ENTERPRISE-ИЙН БОДИТ НЭР (жижиг үсэг) · ШУУД ХАЯГ — сүлжээгүй (2026-10-26, аудит G9).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/entFields.check.mjs
 *
 * ⚠️ ЯАГААД: батлалт/ноорог/эрхийн хүснэгтийн талбарын нэрийг модуль бүр өөрийн `F` (эсвэл `createTable`-ийн
 *    `fields`)-д хатуу бичдэг. Enterprise-д талбарын нэр ЖИЖИГ ҮСЭГТЭЙ — том үсгээр явуулбал 500 «Field name does not
 *    exist» (CLAUDE.md «Enterprise»), зөвхөн амьд бичилт дээр, ихэвчлэн хэрэглэгчийн өмнө илэрдэг.
 * ⚠️ 2026-10-26 (main-тай нэгтгэл): урьд нь `entMap.data.ts`-ийн `ENT_MAP` · `ENT_FIELDS` толитой тулгадаг байв. Толь
 *    (хөрвүүлэх хүснэгт) main-д ХАСАГДСАН — код Enterprise-ийн БОДИТ хаяг/нэрээр шууд бичигдэнэ. Тиймээс сүлжээгүй
 *    шалгах үлдсэн дүрэм: (1) хүснэгтийн хаяг Enterprise үйлчилгээний суурьтай ШУУД (`${GUITS}/N` г.м.), (2) кодын бүх
 *    талбар жижиг үсэг, (3) `oid` = `objectid`. Талбар Enterprise-д БАЙГАА эсэхийг амьд `drift.check` тулгана.
 * ⚠️ `ficMakt` (`Selbe_Chanar_FIC_MAKT`) тогтмол Enterprise хаягаар шууд тандана — энд орохгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { F as HUVAARI_F } from '../huvaariBatlah.ts';
import { F as OBYEM_F } from '../obyemBatlah.ts';
import { F as AJIL_F } from '../ajilBatlah.ts';

const src = (f) => readFileSync(f, 'utf8');
/** `createTable`-ийн `fields: [ { name: '…' } ]` — шууд мөрөөр бичсэн талбарууд */
const tableFieldsOf = (f) => [...src(f).matchAll(/\{\s*name:\s*'([^']+)',\s*type:\s*'esriFieldType/g)].map((m) => m[1]);
/** `tableUrl`-ийн шууд хаяг — `${GUITS}/192` г.м. (`services/env.ts`-ийн үйлчилгээний суурь) */
const DIRECT = /\$\{(GUITS|SYS_PERMS|BAGTS_AJLUUD|SELBE_ET|HET|GAZAR_CH|HAB_KRAN|IRGED|IOT_EX)\}\/\d+/;

const TABLES = [
  { file: 'src/lib/huvaariBatlah.ts', fields: Object.values(HUVAARI_F), oid: HUVAARI_F.oid },
  { file: 'src/lib/obyemBatlah.ts', fields: Object.values(OBYEM_F), oid: OBYEM_F.oid },
  { file: 'src/lib/ajilBatlah.ts', fields: Object.values(AJIL_F), oid: AJIL_F.oid },
  { file: 'src/lib/permsRemote.ts', fields: tableFieldsOf('src/lib/permsRemote.ts'), oid: 'objectid' },
  { file: 'src/lib/draftRemote.ts', fields: tableFieldsOf('src/lib/draftRemote.ts'), oid: 'objectid' },
];

const errs = [];
let n = 0;
for (const t of TABLES) {
  if (t.fields.length < 4) { errs.push(`${t.file}: талбар хэт цөөн (${t.fields.length}) — уншилт эвдэрсэн үү?`); continue; }
  if (!DIRECT.test(src(t.file))) errs.push(`${t.file}: Enterprise-ийн шууд хаяг (\`\${GUITS}/N\` г.м.) олдсонгүй`);
  for (const f of new Set(t.fields)) {
    n += 1;
    if (f !== f.toLowerCase()) errs.push(`${t.file}: «${f}» том үсэгтэй — Enterprise-д «${f.toLowerCase()}» (500 «Field name does not exist»)`);
  }
  if (t.oid !== 'objectid') errs.push(`${t.file}: oid «${t.oid}» ↔ Enterprise «objectid»`);
}

if (errs.length) {
  console.error(`❌ F ↔ Enterprise-ийн нэр зөрүү (${errs.length}):\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
assert.ok(n > 0);
console.log(`✅ ${TABLES.length} хүснэгт · ${n} талбар — бүгд жижиг үсэг, хаяг шууд (huvaari · obyem · ajil · perms · draft)`);
