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
  reaches, downstreamCodes, hierRelated, propagate, residualDeps, rollUpGroups,
  depId, sameDep, depsInBlock,
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
/* ⚠️ 2026-09-25 аудит: `@0` нь parseDeps-д алгасагддаг — residual-д ҮЛДЭХ ёстой (устгахгүй) */
assert.deepEqual(parseDeps('7FS@0'), []);
assert.deepEqual(residualDeps('7FS@0,8FS@2'), ['7FS@0']);
console.log('✅ танигдаагүй токен хадгалалтад алдагдахгүй (residualDeps)');

/* ── ⚠️ ГАРААР ТАВЬСАН ОГНОО (2026-09-25 аудит): уялдаа + огноог зэрэг засахад
   `recalc` нь хэрэглэгчийн огноог урьдчилагчаас дахин бодож буцааж наадаггүй. ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)]),
    row(1, 2, parseDeps('1FS'), [sp(0, 4)]),
  ];
  const ch = propagate(rows, 1, new Map([[1, [sp(40, 44)]]]), [1]);
  assert.deepEqual(ch.get(1)[0], sp(40, 44), 'гараар тавьсан огноо дарагдав');
  /* Огноо хөндөөгүй (ижил муж) бол уялдаагаар бодогдоно — хуучин зан */
  const ch2 = propagate(rows, 1, new Map([[1, [sp(0, 4)]]]), [1]);
  assert.deepEqual(ch2.get(1)[0], sp(21, 25), 'хөндөөгүй огноо уялдаагаар бодогдсонгүй');
  console.log('✅ гараар тавьсан огноо уялдааны дахин бодолтоос давамгайлна');
}

/* ── БҮЛЭГ НЬ АЖЛААСАА ХАМААРНА (2026-09-06-ны эргүүлэлт) ──
   ⚠️ Урьд нь бүлгийн муж нь хүүхдийг ХАВЧДАГ хязгаар байв. Одоо эсрэгээр:
   ажил хөдлөхөд бүлэг нь MIN/MAX-аараа дагана. Энэ тест нь ЧИГЛЭЛИЙГ
   тогтоож барина — буцаавал шууд унана. ── */
{
  const rows = [
    row(0, 1, [], [sp(10, 20)], { group: true, depth: 0 }),
    row(1, 2, [], [sp(10, 20)], { group: true, depth: 1 }),
    row(2, 3, [], [sp(10, 15)], { depth: 2 }),
    row(3, 4, [], [sp(16, 20)], { depth: 2 }),
  ];
  /* ⚠️ БҮЛГИЙН ЗУРАГДАХ МУЖ нь ӨӨРИЙНХӨӨС биш ХҮҮХДҮҮДЭЭСЭЭ (2026-09-06).
     Бүлэг 0-ийн `own` нь (10,20) ч хүүхдүүд нь (10,15)+(16,20) тул ижил;
     хүүхдийг зөөвөл `effSpan` тэр даруй дагана — хадгалагдсан `own` БИШ. */
  const moved = [
    rows[0], rows[1],
    { ...rows[2], spans: [sp(1, 5)] },
    rows[3],
  ];
  assert.deepEqual(effSpan(moved, 0, 0), sp(1, 20), 'бүлэг хүүхдүүдээрээ бодогдоно');
  assert.deepEqual(effSpan(moved, 1, 0), sp(1, 20));
  /* Хүүхэд бүгд хуваарьгүй бол ӨӨРИЙНХӨӨ утга руу буцна */
  const none = [rows[0], rows[1], { ...rows[2], spans: [null] }, { ...rows[3], spans: [null] }];
  assert.deepEqual(effSpan(none, 1, 0), sp(10, 20), 'бодох зүйлгүй бол own');

  const out = rollUpGroups(rows, 1, new Map([[2, [sp(1, 5)]]]));
  assert.deepEqual(out.get(2)[0], sp(1, 5), 'ажлын муж хэвээр — хавчигдсангүй');
  assert.deepEqual(out.get(1)[0], sp(1, 20), 'дэд бүлэг хүүхдүүдээрээ сунав');
  assert.deepEqual(out.get(0)[0], sp(1, 20), 'гадаад бүлэг ч дагав');

  /* ⚠️ Хүүхэд бүгд хуваарьгүй болбол бүлгийн огноог ХЭВЭЭР үлдээнэ —
     бодох зүйл байхгүй үед гараар оруулсныг устгах нь мэдээлэл алдагдуулна. */
  const wipe = rollUpGroups(rows, 1, new Map([[2, [null]], [3, [null]]]));
  assert.equal(wipe.has(1), false, 'бодох зүйлгүй бол бүлэг хөндөгдөхгүй');
  assert.equal(wipe.has(0), false);

  assert.equal(rollUpGroups(rows, 1, new Map()).size, 0, 'өөрчлөлтгүй бол юу ч бодохгүй');
  console.log('✅ бүлгийн муж ажлаасаа дагана (rollUpGroups)');
}

/* ── БЛОК ТУС БҮРИЙН УЯЛДАА — `@N` дагавар (2026-09-24) ── */
{
  /* Бичиглэл: @N нь 1-ээс тоологдож blk 0-ээс хадгалагдана; эргэх хөрвүүлэлт */
  assert.deepEqual(parseDeps('11FS14@2'), [{ code: 11, type: 'FS', lag: 14, blk: 1 }]);
  assert.deepEqual(parseDeps('11fs @ 1, 22SS-5@3, 7FS'), [
    { code: 11, type: 'FS', lag: 0, blk: 0 },
    { code: 22, type: 'SS', lag: -5, blk: 2 },
    { code: 7, type: 'FS', lag: 0 },
  ]);
  assert.deepEqual(parseDeps('11FS@0'), [], '@0 утгагүй — токен алгасагдана, бүх блок болохгүй');
  assert.deepEqual(parseDeps('11FS@x'), [], 'эвдэрсэн дагавар');
  assert.equal(formatDeps(parseDeps('11FS14@2,22SS-5@3,7FS')), '11FS14@2,22SS-5@3,7FS', 'эргэх хөрвүүлэлт');
  assert.equal(formatDeps([{ code: 5, type: 'FS', lag: 0, blk: 0 }]), '5FS@1');
  assert.deepEqual(residualDeps('11FS@2,5FF2,xx'), ['5FF2', 'xx'], '@-тай токен танигдана, бусад нь хэвээр');

  /* Ялгах тэмдэг (код, блок) — нэг код блок бүрд + блокгүй нэг удаа */
  assert.equal(depId({ code: 11, blk: 1 }), '11@1');
  assert.equal(depId({ code: 11 }), '11@');
  assert.ok(sameDep({ code: 11, blk: 1 }, { code: 11, blk: 1 }));
  assert.ok(!sameDep({ code: 11, blk: 1 }, { code: 11 }));
  assert.ok(sameDep({ code: 11 }, { code: 11, blk: undefined }));
  const list = parseDeps('11FS@1,11FS3@2,11SS');
  const dedup = [...list.filter((d) => !sameDep(d, { code: 11, blk: 1 })), { code: 11, type: 'SS', lag: 2, blk: 1 }];
  assert.equal(formatDeps(dedup), '11FS@1,11SS,11SS2@2', 'зөвхөн (11, blk 1 = @2) солигдоно');
  assert.deepEqual(depsInBlock(list, 0).map(depId), ['11@0', '11@'], 'блок 0: өөрийнх + блокгүй');
  assert.deepEqual(depsInBlock(list, 1).map(depId), ['11@1', '11@']);
  assert.deepEqual(depsInBlock(list, 5).map(depId), ['11@']);

  /* @1 уялдаа ЗӨВХӨН блок 0-д үйлчилнэ; блокгүй нь бүх блокт */
  const rows = [
    row(0, 1, [], [sp(10, 20), sp(30, 40)]),
    row(1, 2, parseDeps('1FS@1'), [sp(0, 5), sp(0, 5)]),
    row(2, 3, parseDeps('1FS'), [sp(0, 5), sp(0, 5)]),
  ];
  const bc = codeIndex(rows);
  assert.equal(requiredStart(rows, bc, 1, 0), d(21), '@1 → блок 0-д шаардлага бий');
  assert.equal(requiredStart(rows, bc, 1, 1), null, '@1 → блок 1-д шаардлага АЛГА');
  assert.equal(requiredStart(rows, bc, 2, 0), d(21));
  assert.equal(requiredStart(rows, bc, 2, 1), d(41), 'блокгүй → бүх блокт');
  const ch = propagate(rows, 2, new Map([[0, [sp(12, 22), sp(32, 42)]]]));
  assert.deepEqual(ch.get(1), [sp(23, 28), sp(0, 5)], '@1: зөвхөн блок 0 хөдөлнө');
  assert.deepEqual(ch.get(2), [sp(23, 28), sp(43, 48)], 'блокгүй: хоёулаа хөдөлнө');
  /* Дугуй хамаарлын шалгалт блокийг үл тоно — консерватив */
  const cyc = [row(0, 1, parseDeps('2FS@2'), [sp(0, 1)]), row(1, 2, [], [sp(0, 1)])];
  assert.ok(reaches(cyc, codeIndex(cyc), 2, 1), 'аль ч блокийн уялдаа эргэлтэд тоологдоно');
  assert.ok(downstreamCodes(cyc, 2).has(1));
  console.log('✅ блок тус бүрийн уялдаа — @N дагавар, (код, блок) ялгах тэмдэг, блокоор тархалт');
}

/* ── Бүлгийн гишүүнчлэлээр дамжих дугуй хамаарал (2026-09-25 аудит) ──
   Хүүхэд нь T-ээс хамаардаг бүлэг G: T хөдлөхөд хүүхэд → бүлгийн MIN/MAX
   хөдөлнө. «G → T» уялдаа тавибал дугуй — `reaches`/`downstreamCodes` барих ёстой. */
{
  const rows = [
    row(0, 10, [], [sp(0, 5)], { group: true, depth: 0 }),
    row(1, 11, parseDeps('20FS'), [sp(6, 9)], { depth: 1 }),
    row(2, 20, [], [sp(0, 5)], { depth: 0 }),
  ];
  assert.equal(reaches(rows, codeIndex(rows), 20, 10), true, 'T → хүүхэд L → эцэг бүлэг G');
  assert.ok(downstreamCodes(rows, 20).has(10), 'бүлэг нь T-ийн доод урсгалд');
  /* Эсрэг чиглэл: бүлэг хөдлөхөд хүүхэд нь хөдөлж, хүүхдээс хамаарагч ч хөдөлнө */
  const rows2 = [
    row(0, 40, parseDeps('60FS'), [sp(10, 15)], { group: true, depth: 0 }),
    row(1, 41, [], [sp(10, 15)], { depth: 1 }),
    row(2, 60, parseDeps('41FS'), [sp(16, 20)], { depth: 0 }),
  ];
  assert.equal(reaches(rows2, codeIndex(rows2), 40, 60), true, 'G2 → хүүхэд M → P');
  console.log('✅ бүлгийн гишүүнчлэлээр дамжих дугуй хамаарал баригдана');
}

console.log('\ndeps.check: ok');
