/**
 * БАГЦЫН НЭРИЙН ХУВИЛБАР (2026-11-19, аудит) — томилгоо/илгээлт «Багц-1» · «Багц-4.1», код «Багц 1» · «Багц 4-1».
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/scopedAclAlias.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inScope } from './scopedAcl.ts';

assert.equal(inScope(null, 'Багц-1'), true, 'хязгааргүй');
assert.equal(inScope([], 'Багц 1'), false);
assert.equal(inScope(['Багц 4-1'], 'Багц-4.1'), true, 'зураас/цэг');
assert.equal(inScope(['Багц 1'], 'Багц-1'), true);
assert.equal(inScope(['Багц 1'], 'Багц 12'), false, 'өөр багц');
assert.equal(inScope(['Багц 1'], null), false);

for (const f of ['huvaariAcl.ts', 'obyemAcl.ts', 'ajilAcl.ts', 'habeaAcl.ts']) {
  const s = readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  assert.ok(s.includes('aliases: () => PKG_GROUPS'), f + ': багцын нэрийн хувилбаргүй');
}
for (const f of ['huvaariBatlah.ts', 'obyemBatlah.ts']) {
  const s = readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  assert.ok(!/sc\.includes\(/.test(s), f + ': хүрээг `inScope`-оор (бичлэгээс үл хамааран) шалгах ёстой');
}
const src = readFileSync(new URL('./scopedAcl.ts', import.meta.url), 'utf8');
assert.ok(/canon\.get\(bagtsKey\(b\)\)/.test(src), 'scope нь томилсон нэрийг кодын нэрээр буцаана');
console.log('scopedAclAlias.check: OK');
