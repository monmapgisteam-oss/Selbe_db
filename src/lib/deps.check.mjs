/**
 * УЯЛДАА ХОЛБООСЫН ЛОГИК — `deps.ts`.
 *
 * ⚠️ FS-ийн конвенц: муж хоёр захаа ОРУУЛДАГ тул «дуусмагц эхлэх» нь
 * `end + 1 хоног`. MPP-ийн жишээ: 18 нь 25.10.21-нд дуусаад 19 нь
 * 25.10.22-нд эхэлдэг — энэ тэстгүйгээр off-by-one нь нүдээр илрэхгүй
 * (бар зөвхөн 1px зөрнө).
 *
 * ⚠️ Гинж УРАГШАА ч татдаг (нягт гинж) — зөвхөн түлхэлтийг шалгавал
 * урд ажил урагшлахад хамаарагч нь хоцорч үлдэх алдаа нуугдана.
 */
import assert from 'node:assert/strict';
import {
  parseDeps, formatDeps, codeIndex, effSpan, requiredStart,
  reaches, downstreamCodes, hierRelated, propagate, residualDeps,
} from '@/lib/deps.ts';
import { DAY, spanDays } from '@/lib/plan.ts';

/** Өдрийн дугаар → мс (уншихад хялбар) */
const d = (n) => n * DAY;
/** Товч мөр үүсгэгч */
const row = (i, des, deps, spans, { group = false, depth = 1 } = {}) => ({
  i, oid: 100 + i, no: String(i), des, deps, work: `Ажил ${i}`, depth, group, spans,
});
const sp = (a, z) => ({ start: d(a), end: d(z) });

/* ── Бичиглэл ── */
assert.deepEqual(parseDeps('18FS3,22SS-5'), [
  { code: 18, type: 'FS', lag: 3 },
  { code: 22, type: 'SS', lag: -5 },
]);
assert.deepEqual(parseDeps(' 7 fs , 9ss2 '), [
  { code: 7, type: 'FS', lag: 0 },
  { code: 9, type: 'SS', lag: 2 },
]);
// Эвдэрсэн токен алгасагдана, бусад нь үлдэнэ
assert.deepEqual(parseDeps('xx,18FS,FS3,18FF'), [{ code: 18, type: 'FS', lag: 0 }]);
assert.deepEqual(parseDeps(''), []);
assert.deepEqual(parseDeps(null), []);
assert.equal(formatDeps(parseDeps('18FS3,22SS-5')), '18FS3,22SS-5');
assert.equal(formatDeps([{ code: 5, type: 'FS', lag: 0 }]), '5FS'); // 0 хоцролт бичигдэхгүй
console.log('✅ бичиглэл — задлах/угсрах, эвдэрсэн токен алгасна');

/* ── requiredStart: FS = дуусмагц ДАРААГИЙН өдөр ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, parseDeps('1FS'), [sp(0, 5)]),
    row(2, 3, parseDeps('1FS3'), [sp(0, 5)]),
    row(3, 4, parseDeps('1SS'), [sp(0, 5)]),
    row(4, 5, parseDeps('1SS7'), [sp(0, 5)]),
  ];
  const bc = codeIndex(rows);
  assert.equal(requiredStart(rows, bc, 1, 0), d(21), 'FS0 = дуусах + 1');
  assert.equal(requiredStart(rows, bc, 2, 0), d(24), 'FS3 = дуусах + 4');
  assert.equal(requiredStart(rows, bc, 3, 0), d(10), 'SS0 = эхлэхтэй зэрэг');
  assert.equal(requiredStart(rows, bc, 4, 0), d(17), 'SS7 = эхлэх + 7');
  console.log('✅ FS/SS + хоцролт — MPP-ийн конвенцоор');
}

/* ── Олон урьдчилагч: хамгийн ХОЖУУ шаардлага ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, [], [sp(10, 40)]),
    row(2, 3, parseDeps('1FS,2FS'), [sp(0, 5)]),
  ];
  assert.equal(requiredStart(rows, codeIndex(rows), 2, 0), d(41));
  console.log('✅ олон урьдчилагч — MAX дүрэм');
}

/* ── Гинж: түлхэх БА татах, хугацаа хадгалагдана ── */
{
  const mk = () => [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, parseDeps('1FS'), [sp(21, 30)]),
    row(2, 3, parseDeps('2FS2'), [sp(33, 40)]),
  ];
  // ТҮЛХЭХ: 1-ийг 5 хоног хойшлуулав
  let rows = mk();
  let ch = propagate(rows, 1, new Map([[0, [sp(15, 25)]]]));
  assert.deepEqual(ch.get(1)[0], sp(26, 35), 'шууд хамаарагч түлхэгдэв');
  assert.deepEqual(ch.get(2)[0], sp(38, 45), 'дам хамаарагч ч түлхэгдэв');
  assert.equal(spanDays(ch.get(2)[0]), 8, 'хугацаа хадгалагдана');
  // ТАТАХ: 1-ийг 5 хоног урагшлуулав
  rows = mk();
  ch = propagate(rows, 1, new Map([[0, [sp(5, 15)]]]));
  assert.deepEqual(ch.get(1)[0], sp(16, 25), 'урагшаа ч татагдана');
  assert.deepEqual(ch.get(2)[0], sp(28, 35));
  console.log('✅ гинж — түлхэлт ба таталт, хугацаа хадгалагдана');
}

/* ── Блок бүрдээ: урд ажил огноогүй блок ХӨНДӨГДӨХГҮЙ ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20), null]),
    row(1, 2, parseDeps('1FS'), [sp(0, 5), sp(50, 60)]),
  ];
  const ch = propagate(rows, 2, new Map([[0, [sp(12, 22), null]]]));
  const next = ch.get(1);
  assert.deepEqual(next[0], sp(23, 28), 'огноотой блок шилжив');
  assert.deepEqual(next[1], sp(50, 60), 'урд нь огноогүй блок хэвээр');
  console.log('✅ блок бүрдээ — хоосон блокийг алгасна');
}

/* ── Мужгүй хамаарагчид огноо ЗОХИОХГҮЙ ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, parseDeps('1FS'), [null]),
  ];
  const ch = propagate(rows, 1, new Map([[0, [sp(11, 21)]]]));
  assert.equal(ch.has(1), false, 'мужгүй мөрд муж үүсээгүй');
  console.log('✅ мужгүй мөрд огноо зохиохгүй');
}

/* ── Бүлэг УРЬДЧИЛАГЧ: хүүхдүүдийн MIN/MAX-аас ── */
{
  const rows = [
    row(0, 1, [], [null], { group: true, depth: 0 }),
    row(1, 2, [], [sp(10, 20)], { depth: 1 }),
    row(2, 3, [], [sp(15, 30)], { depth: 1 }),
    row(3, 4, parseDeps('1FS'), [sp(0, 5)], { depth: 0 }),
  ];
  const bc = codeIndex(rows);
  assert.deepEqual(effSpan(rows, 0, 0), sp(10, 30), 'бүлгийн үр дүнтэй муж = хүүхдүүдийн MIN/MAX');
  assert.equal(requiredStart(rows, bc, 3, 0), d(31), 'бүлгээс FS = MAX дуусах + 1');
  // хүүхэд хөдөлбөл бүлгээс хамаарагч дагана
  const ch = propagate(rows, 1, new Map([[2, [sp(15, 35)]]]));
  assert.deepEqual(ch.get(3)[0], sp(36, 41), 'бүлгийн муж сунахад хамаарагч түлхэгдэв');
  console.log('✅ бүлэг урьдчилагч — agg муж, хүүхдийн хөдөлгөөн дамжина');
}

/* ── Бүлэг ХАМААРАГЧ: доторх бүх навч жигд шилжинэ ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, parseDeps('1FS'), [null], { group: true, depth: 0 }),
    row(2, 3, [], [sp(21, 25)], { depth: 1 }),
    row(3, 4, [], [sp(24, 30)], { depth: 1 }),
  ];
  const ch = propagate(rows, 1, new Map([[0, [sp(15, 25)]]]));
  assert.deepEqual(ch.get(2)[0], sp(26, 30), 'эхний хүүхэд +5');
  assert.deepEqual(ch.get(3)[0], sp(29, 35), 'хоёр дахь хүүхэд +5 — дотоод зөрүү хадгалагдана');
  console.log('✅ бүлэг хамаарагч — хүүхдүүд жигд шилжинэ');
}

/* ── Дугуй хамаарал ── */
{
  const rows = [
    row(0, 1, parseDeps('3FS'), [sp(0, 5)]),
    row(1, 2, parseDeps('1FS'), [sp(6, 9)]),
    row(2, 3, parseDeps('2FS'), [sp(10, 15)]),
  ];
  const bc = codeIndex(rows);
  assert.equal(reaches(rows, bc, 1, 3), true, '1 → 2 → 3 дамжиж хүрнэ');
  assert.equal(reaches(rows, bc, 5, 1), false);
  assert.deepEqual([...downstreamCodes(rows, 1)].sort(), [1, 2, 3]);
  // Хадгалагдсан дугуй хамаарал ГАЦААХГҮЙ — таслагдана
  const ch = propagate(rows, 1, new Map([[0, [sp(2, 7)]]]));
  assert.ok(ch.size >= 1, 'дугуй гинж төгсөв, гацаагүй');
  console.log('✅ дугуй хамаарал — таних, гацахгүй');
}

/* ── Хамааралгүй мөр: гинж юу ч хөндөхгүй ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, [], [sp(0, 5)]),
  ];
  const ch = propagate(rows, 1, new Map([[0, [sp(12, 22)]]]));
  assert.equal(ch.size, 1, 'зөвхөн зөөсөн мөр өөрөө');
  console.log('✅ хамааралгүй мөрийг гинж хөндөхгүй');
}

/* ── ⚠️ ГИНЖИН ЭРГЭЛТ (2026-09-03-ны review): өвөг бүлгээс «хамаарвал»
   бүлгийн муж хүүхдээсээ бодогдож, шаардлага нь өөрөө өөрийгөө өсгөж
   мөрийг 10..15 → 141..146 болтол «шатаар гүйлгэдэг» байв. Одоо шатлалын
   хамаатан урьдчилагч болохгүй — requiredStart түүнийг АЛГАСНА. ── */
{
  const rows = [
    row(0, 1, [], [null], { group: true, depth: 0 }),
    row(1, 2, [], [sp(10, 20)], { depth: 1 }),
    row(2, 3, parseDeps('1FS'), [sp(10, 15)], { depth: 1 }), // өвөг бүлгээсээ!
  ];
  const bc = codeIndex(rows);
  assert.equal(hierRelated(rows, 0, 2), true, 'бүлэг 0 нь мөр 2-ын өвөг');
  assert.equal(hierRelated(rows, 1, 2), false, 'ах дүү хамаатан БИШ');
  assert.equal(requiredStart(rows, bc, 2, 0), null, 'өвгөөс ирэх шаардлага үл тоогдоно');
  const ch = propagate(rows, 1, new Map(), [2]);
  assert.equal(ch.size, 0, 'эргэлт үүсэхгүй — мөр байрандаа');
  // ах дүүг чирэхэд ч хуучин шиг 141 руу «гүйхгүй»
  const ch2 = propagate(rows, 1, new Map([[1, [sp(11, 21)]]]));
  assert.equal(ch2.has(2), false, 'өвгийн муж өөрчлөгдсөн ч удам нь хөдлөхгүй');
  console.log('✅ өвөг бүлгээс хамаарах эргэлт таслагдав');
}

/* ── ⚠️ ДЭД БҮЛГИЙН ӨӨРИЙН МУЖ (review): бүлэг хамаарагч шилжихэд дотоод
   дэд бүлгийн own муж хамт шилжинэ — эс тэгвээс own нь agg-аас давамгайлдаг
   тул түүнээс хамаарагчид хуучирсан мужаар чимээгүй зогсдог байв. ── */
{
  const rows = [
    row(0, 1, [], [sp(0, 4)], { depth: 0 }),
    row(1, 2, parseDeps('1FS'), [sp(10, 40)], { group: true, depth: 0 }),
    row(2, 3, [], [sp(10, 20)], { group: true, depth: 1 }), // дэд бүлэг, ӨӨРИЙН мужтай
    row(3, 4, [], [sp(10, 20)], { depth: 2 }),
    row(4, 5, parseDeps('3FS'), [sp(21, 25)], { depth: 0 }),
  ];
  const ch = propagate(rows, 1, new Map([[0, [sp(10, 14)]]]));
  assert.deepEqual(ch.get(1)[0], sp(15, 45), 'гадаад бүлгийн own шилжив');
  assert.deepEqual(ch.get(2)[0], sp(15, 25), 'ДЭД бүлгийн own ч шилжив');
  assert.deepEqual(ch.get(3)[0], sp(15, 25), 'навч шилжив');
  assert.deepEqual(ch.get(4)[0], sp(26, 30), 'дэд бүлгээс хамаарагч ч дагав');
  console.log('✅ дэд бүлгийн own муж шилжиж, хамаарагчид нь дагана');
}

/* ── ⚠️ ТАНИГДААГҮЙ токен (review): «5FF2» мэт гараар зассан бичиглэл
   дахин бичихэд УСТАХГҮЙ — residualDeps нь тэднийг тусад нь буцаана. ── */
assert.deepEqual(residualDeps('5FF2,7FS,junk'), ['5FF2', 'junk']);
assert.deepEqual(residualDeps('7FS'), []);
assert.deepEqual(residualDeps(null), []);
console.log('✅ танигдаагүй токен хадгалалтад алдагдахгүй (residualDeps)');

console.log('\ndeps.check: ok');
