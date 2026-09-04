/**
 * ИЛГЭЭЛТИЙН ЗАВСРЫН ХАДГАЛАЛТЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/submission.check.mjs
 *
 * ⚠️ ArcGIS-д хандах функцуудыг (`load*`, `saveSubmission`, `closeSubmission`)
 *    ЭНД ДУУДАХГҮЙ — сүлжээ. Зөвхөн `parseSubmission`/`mergeSubmission`.
 *
 * Хамгаалж буй алдаанууд:
 *   1. ЭВДЭРСЭН ИЛГЭЭЛТ БҮХЭЛДЭЭ УСТАХ. Хүснэгт нь org доторх хэн ч засаж
 *      болох тул нэг талбарын алдаа бусад засварыг устгах ёсгүй — эвдэрсэн
 *      ХЭСГИЙГ л хаяна (FillNew.parseDraft-тай ижил ёс).
 *   2. ДАВХАРДСАН/ЭЕРЭГ ТҮР ObjectID. Хоёр нэмсэн мөр нэг `${oid}:${b}` нүдийг
 *      хуваалцвал нэгд нь бичсэн обьём нөгөөд нь ч орно; эерэг oid серверийн
 *      мөртэй мөргөлдөнө.
 *   3. `null ≠ 0`. `asOf`/`base` мэдээлэлгүй бол `null` хэвээр, 0 болохгүй.
 *   4. ДАХИН ИЛГЭЭХЭД ХУУЧИН НҮД АЛГА БОЛОХ. Хуримтлагдсан илгээлт: шинэ diff
 *      хуучныг ДАРАХГҮЙ, нэгтгэнэ; ижил түлхүүрт шинэ нь ялна.
 *   5. `v` ХУВИЛБАРГҮЙ payload ӨӨР ХЭЛБЭРЭЭР УНШИГДАХ. Ноорогийн (`Draft`)
 *      payload ижил хүснэгтэд байдаг — `v !== 1` бол илгээлт БИШ.
 */
import assert from 'node:assert/strict';
import { parseSubmission, mergeSubmission, saveSubmission, SUBMISSION_MAX } from './submission.ts';

const FILL = Date.UTC(2026, 8, 4);
const add = (oid, extra = {}) => ({
  oid, parentNo: '1', parentWork: 'Хашаа', parentIdx: 3, no: '1.1', work: 'Шинэ ажил', vol: 10, unit: null, ...extra,
});
const valid = () => ({
  v: 1,
  pkgKey: 'b1_9f',
  user: 'Comp_A',
  at: 1000,
  fillMs: FILL,
  base: 999,
  asOf: null,
  cells: [['12:0', '5'], ['12:1', '']],
  dates: [['12:0:s', '2026-09-01'], ['12:0:e', '']],
  adds: [add(-1)],
  rowKeys: [[12, '1 ¦ Хашаа']],
});

assert.equal(SUBMISSION_MAX, 80_000);

/* ── 1. хүчинтэй payload — бүх талбар хэвээр, user жижиг үсгээр ── */
{
  const p = parseSubmission(JSON.stringify(valid()));
  assert.ok(p, 'хүчинтэй илгээлт задарсангүй');
  assert.equal(p.v, 1);
  assert.equal(p.pkgKey, 'b1_9f');
  assert.equal(p.user, 'comp_a', 'хэрэглэгч жижиг үсгээр байх ёстой');
  assert.equal(p.at, 1000);
  assert.equal(p.fillMs, FILL);
  assert.equal(p.base, 999);
  assert.equal(p.asOf, null, 'asOf null → null (0 биш)');
  assert.deepEqual(p.cells, [['12:0', '5'], ['12:1', '']]);
  assert.deepEqual(p.dates, [['12:0:s', '2026-09-01'], ['12:0:e', '']]);
  assert.deepEqual(p.adds, [add(-1)]);
  assert.deepEqual(p.rowKeys, [[12, '1 ¦ Хашаа']]);
  assert.equal('archiveOid' in p, false, 'батлагдаагүй илгээлтэд archiveOid байх ёсгүй');
  assert.equal('approvedAt' in p, false);
}

/* ── 2. `v` буруу → null (ноорогийн payload ижил хүснэгтэд байдаг!) ── */
{
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), v: 2 })), null, 'v:2 задарч болохгүй');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), v: '1' })), null, "v:'1' задарч болохгүй");
  const noV = valid(); delete noV.v;
  assert.equal(parseSubmission(JSON.stringify(noV)), null, 'v байхгүй бол null');
  /* Ноорогийн (Draft) хэлбэр — t/cells — илгээлт БИШ */
  assert.equal(parseSubmission(JSON.stringify({ t: Date.now(), cells: [['1:0', '2']] })), null);
}

/* ── 3. cells массив биш → null; мөн чанарын талбар дутуу → null ── */
{
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), cells: {} })), null, 'cells объект');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), cells: 'x' })), null, 'cells мөр');
  const noCells = valid(); delete noCells.cells;
  assert.equal(parseSubmission(JSON.stringify(noCells)), null, 'cells байхгүй');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), pkgKey: '' })), null, 'pkgKey хоосон');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), pkgKey: 7 })), null, 'pkgKey тоо');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), at: 'x' })), null, 'at мөр');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), fillMs: null })), null, 'fillMs null');
  assert.equal(parseSubmission('{bad json'), null, 'эвдэрсэн JSON');
  assert.equal(parseSubmission('null'), null);
  assert.equal(parseSubmission('[]'), null, 'массив нь илгээлт биш');
  assert.equal(parseSubmission('"str"'), null);
}

/* ── 4. adds: эерэг oid, бүхэл биш, давхардсан → ТЭР БИЧЛЭГ л хаягдана ── */
{
  const p = parseSubmission(JSON.stringify({
    ...valid(),
    adds: [
      add(-1),
      add(5),          // эерэг — серверийн дугаартай мөргөлдөнө
      add(0),          // тэг — эерэг гэж үзнэ
      add(-2.5),       // бүхэл биш
      add('-3'),       // мөр хэлбэртэй сөрөг бүхэл — Number() → -3, хүлээн авна
      add(-1, { work: 'Давхардсан' }),  // давхардсан — ЭХНИЙХ үлдэнэ
      null,            // хэлбэргүй
      'x',
      add(-4, { vol: 'abc', unit: 2, parentIdx: 1.5 }),  // vol тоо биш → null; parentIdx бүхэл биш → -1
    ],
  }));
  assert.ok(p, 'adds-ийн зөрчил бүтэн илгээлтийг унагаав');
  assert.deepEqual(p.adds.map((a) => a.oid), [-1, -3, -4], 'эерэг/бүхэл биш/давхардсан oid хаягдаагүй');
  assert.equal(p.adds[0].work, 'Шинэ ажил', 'давхардсан oid-д эхнийх нь үлдэх ёстой');
  assert.equal(p.adds[1].oid, -3);
  assert.equal(typeof p.adds[1].oid, 'number');
  assert.equal(p.adds[2].vol, null, 'vol тоо биш → null (0 биш)');
  assert.equal(p.adds[2].unit, 2);
  assert.equal(p.adds[2].parentIdx, -1);
  assert.deepEqual(p.cells, valid().cells, 'adds-ийн алдаа cells-д хүрэв');
}

/* ── 5. Сонголттой массивууд эвдэрвэл → хоосон; бичлэг эвдэрвэл → тэр бичлэг ── */
{
  const p = parseSubmission(JSON.stringify({
    ...valid(),
    dates: { '1': 2 },
    adds: 'x',
    rowKeys: 42,
    cells: [['1:0', '2'], ['bad'], [3, '4'], ['5:0', 6], null, ['7:1', '8']],
  }));
  assert.ok(p, 'сонголттой талбарын алдаа бүтэн илгээлтийг унагаав');
  assert.deepEqual(p.dates, []);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.rowKeys, []);
  assert.deepEqual(p.cells, [['1:0', '2'], ['7:1', '8']], 'хэлбэргүй нүд хаягдаагүй');
  const q = parseSubmission(JSON.stringify({
    ...valid(),
    rowKeys: [[12, 'ok'], ['12', 'мөр oid'], [1.5, 'бутархай'], [13], null, [14, 15]],
    dates: [['1:0:s', '2026-01-01'], ['1:0:e', null], 'x'],
  }));
  assert.deepEqual(q.rowKeys, [[12, 'ok']]);
  assert.deepEqual(q.dates, [['1:0:s', '2026-01-01']]);
}

/* ── 6. null ≠ 0: asOf/base тоо биш → null; 0 бол 0 хэвээр ── */
{
  const p = parseSubmission(JSON.stringify({ ...valid(), asOf: 'x', base: undefined }));
  assert.equal(p.asOf, null);
  assert.equal(p.base, null);
  const q = parseSubmission(JSON.stringify({ ...valid(), asOf: 0, base: 0 }));
  assert.equal(q.asOf, 0, 'тодорхой 0-ийг null болгож болохгүй');
  assert.equal(q.base, 0);
  const r = parseSubmission(JSON.stringify({ ...valid(), asOf: 1700000000000 }));
  assert.equal(r.asOf, 1700000000000);
  const noUser = valid(); delete noUser.user;
  assert.equal(parseSubmission(JSON.stringify(noUser)).user, '', 'user байхгүй → хоосон мөр');
}

/* ── 7. Батлагдсан илгээлт: archiveOid/approvedAt хүчинтэй бол хэвээр, эвдэрсэн бол хаягдана ── */
{
  const p = parseSubmission(JSON.stringify({ ...valid(), archiveOid: 4321, approvedAt: 2000 }));
  assert.equal(p.archiveOid, 4321);
  assert.equal(p.approvedAt, 2000);
  const q = parseSubmission(JSON.stringify({ ...valid(), archiveOid: 'x', approvedAt: 'y' }));
  assert.ok(q);
  assert.equal('archiveOid' in q, false);
  assert.equal('approvedAt' in q, false);
  const r = parseSubmission(JSON.stringify({ ...valid(), archiveOid: -1 }));
  assert.equal('archiveOid' in r, false, 'сөрөг archiveOid хүчингүй');
}

/* ── 8. Оролтоос давсан талбар гарахгүй (хүснэгтийн мөр цэвэр) ── */
{
  const p = parseSubmission(JSON.stringify({ ...valid(), junk: 1, docs: [1, 2] }));
  assert.equal('junk' in p, false);
  assert.equal('docs' in p, false);
}

/* ═══════════════ mergeSubmission ═══════════════ */

const nextOf = (over = {}) => {
  const n = valid(); delete n.v;
  return { ...n, ...over };
};

/* ── 9. prev null → шинэ хэвээр + v:1 ── */
{
  const n = nextOf({ at: 5000, user: 'comp_b' });
  const m = mergeSubmission(null, n);
  assert.equal(m.v, 1);
  assert.equal(m.pkgKey, 'b1_9f');
  assert.equal(m.user, 'comp_b');
  assert.equal(m.at, 5000);
  assert.equal(m.fillMs, FILL);
  assert.equal(m.base, 999);
  assert.equal(m.asOf, null);
  assert.deepEqual(m.cells, n.cells);
  assert.deepEqual(m.dates, n.dates);
  assert.deepEqual(m.adds, n.adds);
  assert.deepEqual(m.rowKeys, n.rowKeys);
  assert.equal('archiveOid' in m, false);
  /* Оролт хувирахгүй */
  assert.notEqual(m.cells, n.cells, 'массив хуваалцагдав');
  assert.notEqual(m.adds[0], n.adds[0], 'мөр объект хуваалцагдав');
}

/* ── 10. cells/dates: ижил түлхүүрт ШИНЭ ялна, хуучин нүд АЛГА БОЛОХГҮЙ ── */
{
  const prev = parseSubmission(JSON.stringify({
    ...valid(),
    cells: [['12:0', '5'], ['12:1', '7'], ['13:0', '1']],
    dates: [['12:0:s', '2026-09-01'], ['13:0:e', '2026-09-09']],
  }));
  const next = nextOf({
    cells: [['12:1', '9'], ['14:2', '3']],
    dates: [['12:0:s', ''], ['14:0:s', '2026-10-01']],
  });
  const m = mergeSubmission(prev, next);
  assert.deepEqual(new Map(m.cells), new Map([['12:0', '5'], ['12:1', '9'], ['13:0', '1'], ['14:2', '3']]),
    'хуучин нүд алга болов эсвэл шинэ нь дараагүй');
  assert.deepEqual(new Map(m.dates), new Map([['12:0:s', ''], ['13:0:e', '2026-09-09'], ['14:0:s', '2026-10-01']]));
  assert.equal(m.cells.length, 4, 'түлхүүр давхардав');
  /* prev өөрчлөгдөөгүй */
  assert.equal(prev.cells.length, 3);
  assert.equal(prev.cells[1][1], '7');
}

/* ── 11. adds: oid-оор нэгтгэнэ — шинэ нь дарна (хуучин байрлалд), шинэ oid нэмэгдэнэ ── */
{
  const prev = parseSubmission(JSON.stringify({
    ...valid(),
    adds: [add(-1, { work: 'Хуучин 1' }), add(-2, { work: 'Хуучин 2' })],
  }));
  const next = nextOf({ adds: [add(-3, { work: 'Шинэ 3' }), add(-1, { work: 'Шинэ 1', vol: 99 })] });
  const m = mergeSubmission(prev, next);
  assert.deepEqual(m.adds.map((a) => a.oid), [-1, -2, -3], 'дараалал: хуучин байрлал хэвээр, шинэ нь ард');
  assert.equal(m.adds[0].work, 'Шинэ 1', 'ижил oid-д шинэ нь ялах ёстой');
  assert.equal(m.adds[0].vol, 99);
  assert.equal(m.adds[1].work, 'Хуучин 2', 'хуучин мөр алга болов');
  assert.equal(m.adds[2].work, 'Шинэ 3');
  assert.equal(prev.adds[0].work, 'Хуучин 1', 'prev хувирав');
}

/* ── 12. rowKeys: oid-оор нэгтгэнэ ── */
{
  const prev = parseSubmission(JSON.stringify({ ...valid(), rowKeys: [[12, 'a'], [13, 'b']] }));
  const m = mergeSubmission(prev, nextOf({ rowKeys: [[13, 'B'], [14, 'c']] }));
  assert.deepEqual(new Map(m.rowKeys), new Map([[12, 'a'], [13, 'B'], [14, 'c']]));
  assert.equal(m.rowKeys.length, 3);
}

/* ── 13. asOf/base: шинэ ?? хуучин ?? null — 0 ч утга (null биш) ── */
{
  const prev = parseSubmission(JSON.stringify({ ...valid(), asOf: 500, base: 400 }));
  assert.equal(mergeSubmission(prev, nextOf({ asOf: null, base: null })).asOf, 500, 'шинэ null → хуучин үлдэнэ');
  assert.equal(mergeSubmission(prev, nextOf({ asOf: null, base: null })).base, 400);
  assert.equal(mergeSubmission(prev, nextOf({ asOf: 700 })).asOf, 700, 'шинэ байвал ялна');
  assert.equal(mergeSubmission(prev, nextOf({ asOf: 0 })).asOf, 0, '0 нь утга — хуучныг авахгүй');
  const none = parseSubmission(JSON.stringify({ ...valid(), asOf: null, base: null }));
  assert.equal(mergeSubmission(none, nextOf({ asOf: null })).asOf, null, 'хоёулаа null → null (0 БИШ)');
  assert.equal(mergeSubmission(null, nextOf({ asOf: null })).asOf, null);
}

/* ── 14. user/at/fillMs/pkgKey — шинэ ── */
{
  const prev = parseSubmission(JSON.stringify({ ...valid(), user: 'old', at: 1, fillMs: Date.UTC(2026, 0, 1) }));
  const m = mergeSubmission(prev, nextOf({ user: 'new', at: 2, fillMs: FILL }));
  assert.equal(m.user, 'new');
  assert.equal(m.at, 2);
  assert.equal(m.fillMs, FILL);
}

/* ── 15. archiveOid/approvedAt хуучнаас УЛАМЖЛАГДАХГҮЙ — нэгтгэсэн илгээлт идэвхтэй ── */
{
  const prev = parseSubmission(JSON.stringify({ ...valid(), archiveOid: 4321, approvedAt: 2000 }));
  const m = mergeSubmission(prev, nextOf());
  assert.equal('archiveOid' in m, false, 'батлагдсан тэмдэг шинэ илгээлтэд орж ирэв');
  assert.equal('approvedAt' in m, false);
}

/* ── 16. Хоосон next → хуучин бүхэлдээ үлдэнэ ── */
{
  const prev = parseSubmission(JSON.stringify(valid()));
  const m = mergeSubmission(prev, nextOf({ cells: [], dates: [], adds: [], rowKeys: [], asOf: null, base: null }));
  assert.deepEqual(m.cells, prev.cells);
  assert.deepEqual(m.dates, prev.dates);
  assert.deepEqual(m.adds, prev.adds);
  assert.deepEqual(m.rowKeys, prev.rowKeys);
  assert.equal(m.base, 999);
}

/* ── 17. Тойрог: merge → JSON → parse ижил ── */
{
  const prev = parseSubmission(JSON.stringify(valid()));
  const m = mergeSubmission(prev, nextOf({ cells: [['20:0', '1']], adds: [add(-9)], asOf: 123 }));
  const back = parseSubmission(JSON.stringify(m));
  assert.deepEqual(back, m, 'нэгтгэсэн payload задлахад өөрчлөгдөв');
  assert.ok(JSON.stringify(m).length < SUBMISSION_MAX);
}

/* ── 18. ХЭТ ТОМ ИЛГЭЭЛТИЙН ЗААВАР ҮНЭН БАЙХ ──
 *
 * ⚠️ `saveSubmission` нь хэмжээ ба багцын түлхүүрийг СҮЛЖЭЭНЭЭС ӨМНӨ шалгаж
 *    буцдаг тул эдгээр хоёр зам нь цэвэр функцтэй ижил (ArcGIS руу хандахгүй).
 * ⚠️ 2026-09-04-ний аудит: «хэсэгчлэн илгээнэ үү» гэсэн заавар ХУДАЛ байв —
 *    `mergeSubmission` дараагийн илгээлтийг өмнөхтэй нь ХУРИМТЛУУЛДАГ тул
 *    хагаслах нь хэмжээг огт бууруулахгүй, хэрэглэгч гарцгүй давталтад ордог.
 */
{
  const big = { ...valid(), cells: [] };
  for (let i = 0; i < 6000; i += 1) big.cells.push([`${1000 + i}:0`, '1234.5678']);
  const raw = JSON.stringify(big);
  assert.ok(raw.length > SUBMISSION_MAX, 'туршилтын payload хязгаараас давсангүй');
  const r = await saveSubmission('b1_9f', big);
  assert.equal(r.ok, false, 'хэт том илгээлт ЯВАХ ЁСГҮЙ');
  assert.ok(!/хэсэгчлэн илгээнэ үү/.test(r.error), 'ХУДАЛ заавар («хэсэгчлэн илгээнэ үү») буцаж ирэв');
  assert.ok(/ТУСЛАХГҮЙ/.test(r.error), 'хэсэгчлэх нь тусахгүйг ил хэлээгүй');
  assert.ok(/батлуул/.test(r.error), 'жинхэнэ гарц (батлуулах) заагаагүй');
}

/* ── 19. Багцын түлхүүр зөрвөл БИЧИХГҮЙ (сүлжээнээс өмнөх зам) ── */
{
  const r = await saveSubmission('b2_9f', parseSubmission(JSON.stringify(valid())));
  assert.equal(r.ok, false, 'өөр багцын diff энэ түлхүүрт бичигдэх гэж байв');
  assert.ok(/b1_9f/.test(r.error) && /b2_9f/.test(r.error));
}

console.log('submission.check ✓');
