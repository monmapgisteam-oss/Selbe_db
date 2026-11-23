/**
 * 187-Г (нэгтгэл гүйцэтгэл) ТТБ-ИЙН БҮТЦЭЭР ДАХИН БИЧИХ (2026-11-23, хэрэглэгч) — нэг удаагийн хэрэгсэл.
 *
 * 187 нь 10-р сарын Excel-ийн бүтэцтэй үлдэж ТТБ-ийн (182) 1046 мөрөөс 20 нь л хосолж байсан. Энэ скрипт:
 *   1. ТТБ-ийг бүрэн уншина (эх унасан бол зогсоно);
 *   2. 187-ийн бүх мөрийг `Selbe_db-tezu-backups/187-*.json`-д нөөцөлнө;
 *   3. 187-ийн бүх мөрийг устгаж «0» нийт мөр ба ТТБ-ийн мөрүүдийг нэмнэ (`negtgelMirror.rebuildNegtgel`).
 * Түүнээс хойш `projectPlanSync` → `negtgelMirror.mirrorNegtgel` нь мөр нэмэх/устгахыг өөрөө хийнэ.
 *
 *     node --experimental-transform-types --import ./tools/ts-alias.mjs tools/negtgel-rebuild.mjs --dry
 *     node --experimental-transform-types --import ./tools/ts-alias.mjs tools/negtgel-rebuild.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { installTokenInjection, loadAdminTokens } from './liveFetch.mjs';

installTokenInjection(loadAdminTokens());
const DRY = process.argv.includes('--dry');
const { TUSUL_NEGTGEL } = await import('../src/lib/services/fields.ts');
const { loadProjectPlan } = await import('../src/lib/projectPlanInputs.ts');
const { negRowsFromPlan } = await import('../src/lib/negtgel.ts');
const { rebuildNegtgel } = await import('../src/lib/negtgelMirror.ts');

const post = async (u, b = {}) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', ...b }) })).json();

const plan = await loadProjectPlan();
if (plan.empty || plan.failed.length) { console.error('⛔ ТТБ бүрэн уншигдсангүй:', plan.failed.join(', ') || 'хоосон'); process.exit(1); }
const rows = negRowsFromPlan(plan);

const old = [];
for (let off = 0; ;) {
  const q = await post(`${TUSUL_NEGTGEL.url}/query`, { where: '1=1', outFields: '*', orderByFields: 'objectid ASC', resultOffset: String(off), returnGeometry: 'false' });
  if (q.error) { console.error('⛔ 187 уншигдсангүй:', q.error.message); process.exit(1); }
  old.push(...q.features.map((f) => f.attributes));
  if (!q.exceededTransferLimit) break;
  off = old.length;
}
console.log(`ТТБ ${rows.length} мөр · 187 ${old.length} мөр`);
if (DRY) { console.log('--dry: юу ч бичсэнгүй'); process.exit(0); }

mkdirSync('../Selbe_db-tezu-backups', { recursive: true });
const file = `../Selbe_db-tezu-backups/187-negtgel-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(old));
console.log('нөөц:', file);

const r = await rebuildNegtgel(plan, old.map((a) => Number(a.objectid)));
console.log(`устгасан ${r.deleted} · нэмсэн ${r.added}`);
