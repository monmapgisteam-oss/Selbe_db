/**
 * ТАЛБАРЫН ТОГТМОЛ (`F`) ↔ ENTERPRISE-ИЙН ТАЛБАРЫН ТОЛЬ (`ENT_FIELDS`) — сүлжээгүй (2026-10-26, аудит G9).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/entFields.check.mjs
 *
 * ⚠️ ЯАГААД: батлалт/ноорог/эрхийн хүснэгтийн талбарын нэрийг модуль бүр өөрийн `F` (эсвэл `createTable`-ийн
 *    `fields`)-д хатуу бичдэг. Enterprise-д эдгээр хүснэгт `entDirect`-ээр ШУУД (`entMap.data.ts` — `ENT_MAP`) ба
 *    талбарын нэр нь `ENT_FIELDS` (`tools/entMap-build.mjs`-ийн амьд `f=json` агшин) толиор хөрвөнө. Кодын талбар
 *    толинд алга бол (`F`-д нэмсэн ч Enterprise-д багана нэмээгүй, эсвэл үсгийн алдаа) Enterprise 500 «Field name does
 *    not exist» — зөвхөн амьд бичилт дээр, ихэвчлэн хэрэглэгчийн өмнө илэрдэг. Энэ шалгуур нь тэр зөрүүг `npm test`-д барина.
 * Дүрэм: хүснэгт бүрт (1) `TITLE`/давхаргын дугаар нь `ENT_MAP`-д зураглагдсан, (2) зураглагдсан давхаргад
 *    `ENT_FIELDS` бичлэг бий, (3) кодын бүх талбар тэр бичлэгийн `f`-д ЯГ (үсгийн хэлбэр ч) байна, (4) `oid` таарна.
 * ⚠️ `ficMakt` (`Selbe_Chanar_FIC_MAKT`) зураглалд БАЙХГҮЙ (тогтмол Enterprise хаягаар шууд тандана) — энд орохгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENT_MAP } from './entMap.data.ts';
/* ⚠️ Нэгтгэсэн толь (үүсгэсэн + гар `ENT_FIELDS_MANUAL`) — runtime-тай ижил эх */
import { ENT_FIELDS } from './entMap.ts';
import { F as HUVAARI_F } from '../huvaariBatlah.ts';
import { F as OBYEM_F } from '../obyemBatlah.ts';
import { F as AJIL_F } from '../ajilBatlah.ts';

const src = (f) => readFileSync(f, 'utf8');
/** `const TITLE = '…'` */
const titleOf = (f) => {
  const m = /\bconst TITLE = '([^']+)'/.exec(src(f));
  assert.ok(m, `${f}: TITLE олдсонгүй`);
  return m[1];
};
/** `createTable`-ийн `fields: [ { name: '…' } ]` — шууд мөрөөр бичсэн талбарууд */
const tableFieldsOf = (f) => [...src(f).matchAll(/\{\s*name:\s*'([^']+)',\s*type:\s*'esriFieldType/g)].map((m) => m[1]);

const ajilLayer = Number(/\bconst LAYER_ID = (\d+);/.exec(src('src/lib/ajilBatlah.ts'))?.[1]);
assert.ok(Number.isFinite(ajilLayer), 'ajilBatlah.ts: LAYER_ID олдсонгүй');

const TABLES = [
  { file: 'src/lib/huvaariBatlah.ts', key: `${titleOf('src/lib/huvaariBatlah.ts')}/0`, fields: Object.values(HUVAARI_F), oid: HUVAARI_F.oid },
  { file: 'src/lib/obyemBatlah.ts', key: `${titleOf('src/lib/obyemBatlah.ts')}/0`, fields: Object.values(OBYEM_F), oid: OBYEM_F.oid },
  { file: 'src/lib/ajilBatlah.ts', key: `${titleOf('src/lib/ajilBatlah.ts')}/${ajilLayer}`, fields: Object.values(AJIL_F), oid: AJIL_F.oid },
  { file: 'src/lib/permsRemote.ts', key: `${titleOf('src/lib/permsRemote.ts')}/0`, fields: tableFieldsOf('src/lib/permsRemote.ts'), oid: 'OBJECTID' },
  { file: 'src/lib/draftRemote.ts', key: `${titleOf('src/lib/draftRemote.ts')}/0`, fields: tableFieldsOf('src/lib/draftRemote.ts'), oid: 'OBJECTID' },
];

const errs = [];
let n = 0;
for (const t of TABLES) {
  if (t.fields.length < 4) { errs.push(`${t.file}: талбар хэт цөөн (${t.fields.length}) — уншилт эвдэрсэн үү?`); continue; }
  const to = ENT_MAP[t.key];
  if (!to) { errs.push(`${t.file}: «${t.key}» ENT_MAP-д зураглагдаагүй (entDirect → null, AGOL хайлт руу унана)`); continue; }
  const rec = ENT_FIELDS[to];
  if (!rec) { errs.push(`${t.file}: «${to}» ENT_FIELDS-д алга — tools/entMap-build.mjs-ээр шинэчил`); continue; }
  const have = new Set(rec.f);
  const lower = new Map(rec.f.map((x) => [x.toLowerCase(), x]));
  for (const f of new Set(t.fields)) {
    n += 1;
    if (have.has(f)) continue;
    const near = lower.get(f.toLowerCase());
    errs.push(`${t.file}: «${f}» → ${to}-д ${near ? `үсгийн хэлбэр өөр («${near}»)` : 'БАЙХГҮЙ'} (Enterprise 500 «Field name does not exist»)`);
  }
  if (rec.oid !== t.oid) errs.push(`${t.file}: oid «${t.oid}» ↔ ENT_FIELDS «${rec.oid}»`);
}

if (errs.length) {
  console.error(`❌ F ↔ ENT_FIELDS зөрүү (${errs.length}):\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ ${TABLES.length} хүснэгт · ${n} талбар — бүгд ENT_FIELDS-д (huvaari · obyem · ajil · perms · draft)`);
