/**
 * ТАЛБАРЫН ТОГТМОЛ (`F`) ↔ ENTERPRISE-ИЙН АМЬД СХЕМ — зөвхөн уншина (2026-10-26).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/services/entFields.live.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { F as HUVAARI_F } from '../huvaariBatlah.ts';
import { F as OBYEM_F } from '../obyemBatlah.ts';
import { F as AJIL_F } from '../ajilBatlah.ts';
import { GUITS, SYS_PERMS } from './env.ts';
import { arcgisPost } from '../query.ts';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — Enterprise хүрэгдэхгүй эсвэл ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const src = (f) => readFileSync(f, 'utf8');
/** `createTable`-ийн `fields: [ { name: '…' } ]` — `entFields.check`-тэй ИЖИЛ уншилт */
const tableFieldsOf = (f) => [...src(f).matchAll(/\{\s*name:\s*'([^']+)',\s*type:\s*'esriFieldType/g)].map((m) => m[1]);

const ALLOW_MISSING = { 192: new Set(['zovshoorson_mor']) };

const TABLES = [
  { name: 'huvaari', url: `${GUITS}/192`, id: 192, fields: Object.values(HUVAARI_F) },
  { name: 'obyem', url: `${GUITS}/193`, id: 193, fields: Object.values(OBYEM_F) },
  { name: 'ajil', url: `${GUITS}/189`, id: 189, fields: Object.values(AJIL_F) },
  { name: 'perms', url: `${SYS_PERMS}/230`, id: 230, fields: tableFieldsOf('src/lib/permsRemote.ts') },
  { name: 'draft', url: `${GUITS}/191`, id: 191, fields: tableFieldsOf('src/lib/draftRemote.ts') },
];

const errs = [];
let n = 0;
for (const t of TABLES) {
  let meta;
  try { meta = await arcgisPost(t.url, {}); } catch (e) { errs.push(`${t.name} (${t.id}): мета уншигдсангүй — ${e?.message ?? e}`); continue; }
  if (meta?.error) { errs.push(`${t.name} (${t.id}): ${JSON.stringify(meta.error)}`); continue; }
  const have = new Set((meta?.fields ?? []).map((f) => String(f.name)));
  if (!have.size) { errs.push(`${t.name} (${t.id}): талбарын жагсаалт хоосон`); continue; }
  const allow = ALLOW_MISSING[t.id] ?? new Set();
  for (const f of new Set(t.fields)) {
    n += 1;
    if (have.has(f) || allow.has(f)) continue;
    errs.push(`${t.name} (${t.id}): «${f}» Enterprise-д алга — бичилт 500 «Field name does not exist»`);
  }
}

if (errs.length) {
  console.error(`❌ F ↔ Enterprise-ийн амьд схем зөрүү (${errs.length}):\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
assert.ok(n > 0);
console.log(`✅ ${TABLES.length} хүснэгт · ${n} талбар — бүгд Enterprise-ийн амьд схемд байна`);
