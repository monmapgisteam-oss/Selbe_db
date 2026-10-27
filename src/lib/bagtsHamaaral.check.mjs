/**
 * ХУУЧИН БАГЦЫН ХАМААРАЛ — `bagtsHamaaral.ts`-ийн цэвэр логик (2026-10-04; 2026-10-22-оос ЗӨВХӨН шилжүүлэлтэд).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/bagtsHamaaral.check.mjs
 *
 * ⚠️ Гол гэрээ: эвдэрсэн бичлэг ЧИМЭЭГҮЙ хоосон болохгүй (шидэнэ) — эс бөгөөс устгалын бичилт бүх холбоог дарна.
 * ⚠️ 2026-10-22: дугуй/нэмэх логик ХАСАГДСАН — шинэ холбоо нь АЖЛЫН түвшинд (`workDeps.check.mjs`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDeps, depsJson, sameDep, HAMAARAL_KEY } from '@/lib/bagtsHamaaral.ts';

const D = (from, to) => ({ from, to });
const deps = [D('energy:БАГЦ61', 'БАГЦ1'), D('БАГЦ1', 'social:БАГЦ70')];

assert.deepEqual(parseDeps(depsJson(deps)), deps);
assert.deepEqual(parseDeps(''), []);
assert.deepEqual(parseDeps(null), []);
assert.deepEqual(parseDeps('[{"from":"A","to":"B"},{"from":"A","to":"B"},{"x":1},{"from":"","to":"C"}]'), [D('A', 'B')],
  'давхардал ба эвдэрсэн гишүүн хаягдана');
assert.throws(() => parseDeps('{"a":1}'), 'массив биш бичлэг — шидэнэ');
assert.throws(() => parseDeps('not json'), 'JSON биш — шидэнэ');
assert.ok(!HAMAARAL_KEY.includes('|'), 'draftRemote-ийн legacyLike-тэй мөргөлдөхгүй');
assert.ok(sameDep(D('A', 'B'), D('A', 'B')) && !sameDep(D('A', 'B'), D('B', 'A')));
console.log('✅ хуучин бичиглэл');

/* ⚠️ 2026-10-22: хуучин бүртгэлийн уншигч ЗӨВХӨН «Багцын хамаарал» (шилжүүлэлт); ТУХ ажлын графаас */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const tuh = strip(readFileSync('src/modules/Tuh.tsx', 'utf8'));
assert.doesNotMatch(tuh, /bagtsHamaaral/, 'ТУХ хуучин багц ↔ багц бүртгэлээс уншихгүй');
assert.match(tuh, /useAsync\(loadPkgDeps/, 'ТУХ ажлын графаас (`loadPkgDeps`)');
const view = strip(readFileSync('src/modules/BagtsHamaaral.tsx', 'utf8'));
assert.match(view, /canEdit[\s\S]{0,120}hasCap\([\s\S]{0,40}'hamaaral'/, 'засвар `hamaaral` эрхээр');
assert.doesNotMatch(view, /if\s*\(\s*!canEdit\s*\)\s*return\s*(null|<)/, 'эрхгүй хүнд хуудсыг хаахгүй («харах ≠ засах»)');
assert.match(view, /removeLegacyDeps/, 'шилжсэн хуучин хос устгагдана');
console.log('✅ уншигчид — ТУХ ажлын графаас, харагдац эрхээр засна');
