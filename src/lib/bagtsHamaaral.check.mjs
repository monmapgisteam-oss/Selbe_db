/**
 * БАГЦЫН ХАМААРАЛ — `bagtsHamaaral.ts`-ийн цэвэр логик (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/bagtsHamaaral.check.mjs
 *
 * ⚠️ Гол гэрээ: дугуй хамаарал, өөртөө холбох, давхардал ХОРИОТОЙ; эвдэрсэн бичлэг
 *    ЧИМЭЭГҮЙ хоосон болохгүй (шидэнэ) — эс бөгөөс дараагийн бичилт бүх холбоог дарна.
 */
import assert from 'node:assert/strict';
import {
  parseDeps, depsJson, reaches, linkError, upstreamOf, downstreamOf, chainOf, applyChange, HAMAARAL_KEY,
  sameDeps,
} from '@/lib/bagtsHamaaral.ts';

const D = (from, to) => ({ from, to });
const deps = [D('energy:БАГЦ61', 'БАГЦ1'), D('БАГЦ1', 'social:БАГЦ70'), D('heat:БАГЦ50', 'БАГЦ1')];

/* ── Бичиглэл ── */
assert.deepEqual(parseDeps(depsJson(deps)), deps);
assert.deepEqual(parseDeps(''), []);
assert.deepEqual(parseDeps(null), []);
assert.deepEqual(parseDeps('[{"from":"A","to":"B"},{"from":"A","to":"B"},{"x":1},{"from":"","to":"C"}]'), [D('A', 'B')],
  'давхардал ба эвдэрсэн гишүүн хаягдана');
assert.throws(() => parseDeps('{"a":1}'), 'массив биш бичлэг — шидэнэ');
assert.throws(() => parseDeps('not json'), 'JSON биш — шидэнэ');
assert.ok(!HAMAARAL_KEY.includes('|'), 'draftRemote-ийн legacyLike-тэй мөргөлдөхгүй');
console.log('✅ бичиглэл');

/* ── Чиглэл ── */
assert.deepEqual(upstreamOf(deps, 'БАГЦ1').sort(), ['energy:БАГЦ61', 'heat:БАГЦ50'].sort());
assert.deepEqual(downstreamOf(deps, 'БАГЦ1'), ['social:БАГЦ70']);
assert.ok(reaches(deps, 'energy:БАГЦ61', 'social:БАГЦ70'));
assert.ok(!reaches(deps, 'social:БАГЦ70', 'energy:БАГЦ61'));
assert.deepEqual([...chainOf(deps, 'energy:БАГЦ61')].sort(), ['energy:БАГЦ61', 'БАГЦ1', 'social:БАГЦ70'].sort(),
  'гинж: зөвхөн дамжуулан холбогдсон — хажуугийн heat:БАГЦ50 ОРОХГҮЙ');
console.log('✅ урд · ард · гинж');

/* ── Хориг ── */
assert.ok(linkError(deps, 'A', 'A'), 'өөртөө');
assert.ok(linkError(deps, 'energy:БАГЦ61', 'БАГЦ1'), 'давхардал');
assert.ok(linkError(deps, 'social:БАГЦ70', 'energy:БАГЦ61'), 'дугуй (3 алхам)');
assert.ok(linkError(deps, 'БАГЦ1', 'energy:БАГЦ61'), 'дугуй (шууд эсрэг)');
assert.equal(linkError(deps, 'heat:БАГЦ50', 'social:БАГЦ70'), null, 'товчлол холбоо — дугуй биш');
console.log('✅ өөртөө · давхардал · дугуй');

/* ── Өөрчлөлт ── */
assert.deepEqual(applyChange(deps, { op: 'add', dep: D('X', 'Y') }), [...deps, D('X', 'Y')]);
assert.equal(typeof applyChange(deps, { op: 'add', dep: D('БАГЦ1', 'energy:БАГЦ61') }), 'string', 'дугуй нэмэлт — шалтгаан');
assert.deepEqual(applyChange(deps, { op: 'remove', dep: D('БАГЦ1', 'social:БАГЦ70') }), [deps[0], deps[2]]);
assert.deepEqual(applyChange(deps, { op: 'remove', dep: D('Q', 'W') }), deps, 'байхгүйг устгах — өөрчлөлтгүй');
/* 2026-10-09: `saveChange` өөрчлөлтгүй үед бичихгүй — `sameDeps` шалгуур */
assert.ok(sameDeps(applyChange(deps, { op: 'remove', dep: D('Q', 'W') }), deps), 'байхгүйг устгах = ижил');
assert.ok(sameDeps([deps[1], deps[0], deps[2]], deps), 'дараалал хамаагүй');
assert.ok(!sameDeps(applyChange(deps, { op: 'remove', dep: deps[1] }), deps), 'жинхэнэ устгал = өөр');
console.log('✅ нэмэх · устгах');
