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
import fs from 'node:fs';
import { parseSubmission, mergeSubmission, residualAfterArchive, saveSubmission, subKey, SUBMISSION_MAX, frameProbe, matchArchivedFrame } from './submission.ts';

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
  /* ⚠️ 2026-09-25: `v: 2` нь ЗӨВХӨН `mode: 'inc'`-тэй хүчинтэй — туггүй бол горим тодорхойгүй */
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), v: 2 })), null, 'v:2 (горимгүй) задарч болохгүй');
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

/* ── 11. adds: oid-оор нэгтгэнэ — ИЖИЛ мөрийг шинэ нь дарна (хуучин байрлалд),
       шинэ oid нэмэгдэнэ ──
   ⚠️ «Ижил мөр» = № · Ажлын нэр · эцэг таарсан (2026-09-08). Зөвхөн тоо
      (обьём/нэгж) зөрвөл ЯГ ТЭР мөрийн шинэчлэл гэж үзэж дарна. */
{
  const prev = parseSubmission(JSON.stringify({
    ...valid(),
    adds: [add(-1, { work: 'Хуучин 1' }), add(-2, { work: 'Хуучин 2' })],
  }));
  const next = nextOf({ adds: [add(-3, { work: 'Шинэ 3' }), add(-1, { work: 'Хуучин 1', vol: 99 })] });
  const m = mergeSubmission(prev, next);
  assert.deepEqual(m.adds.map((a) => a.oid), [-1, -2, -3], 'дараалал: хуучин байрлал хэвээр, шинэ нь ард');
  assert.equal(m.adds[0].work, 'Хуучин 1', 'ижил мөрийг шинэ нь шинэчлэх ёстой');
  assert.equal(m.adds[0].vol, 99);
  assert.equal(m.adds[1].work, 'Хуучин 2', 'хуучин мөр алга болов');
  assert.equal(m.adds[2].work, 'Шинэ 3');
  assert.equal(prev.adds[0].vol, 10, 'prev хувирав');
}

/* ── 11b. ТҮР OID МӨРГӨЛДӨХ — ХОЁУЛАА үлдэнэ, нүд нь дагаж зөөгдөнө ──
 *
 * ⚠️ 2026-09-08-ны аудитын CRITICAL олдвор: `tmpOid` нь хуудас ачаалагдах
 *    бүрд −1-ээс эхэлдэг тул өдөр 1-д мөр нэмж ИЛГЭЭЭД хуудсаа дахин нээж
 *    дахин мөр нэмэхэд шинэ мөр ДАХИН −1 авна. Урьд нь `adds.set` дардаг
 *    байсан тул өмнөх мөр (нэр, обьём, эцэг) БҮТНЭЭР алга болж, түүний
 *    `${oid}:${b}` нүднүүд ч шинэ мөрийн утгаар солигддог байв.
 */
{
  const prev = parseSubmission(JSON.stringify({
    ...valid(),
    adds: [add(-1, { no: '1.1', work: 'Хучилт А', vol: 100 })],
    cells: [['-1:0', '100']],
    rowKeys: [[-1, 'k1']],
  }));
  const next = nextOf({
    adds: [add(-1, { no: '1.2', work: 'Хучилт Б', vol: 999 })],
    cells: [['-1:0', '999']],
    rowKeys: [[-1, 'k2']],
  });
  const m = mergeSubmission(prev, next);
  assert.equal(m.adds.length, 2, 'мөргөлдсөн мөр дарагдав — өмнөх илгээлтийн ажил алга болно');
  assert.equal(m.adds[0].oid, -1);
  assert.equal(m.adds[0].work, 'Хучилт А', 'хуучин мөр хэвээр байх ёстой');
  const moved = m.adds[1];
  assert.equal(moved.work, 'Хучилт Б');
  assert.ok(moved.oid < 0 && moved.oid !== -1, 'шинэ мөр САЛАНГИД сөрөг oid авах ёстой');
  const cells = new Map(m.cells);
  assert.equal(cells.get('-1:0'), '100', 'хуучин мөрийн нүд солигдов');
  assert.equal(cells.get(`${moved.oid}:0`), '999', 'шинэ мөрийн нүд дагаж зөөгдсөнгүй');
  const rk = new Map(m.rowKeys);
  assert.equal(rk.get(-1), 'k1');
  assert.equal(rk.get(moved.oid), 'k2', 'rowKeys дагаж зөөгдсөнгүй');
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


/* ── 20. ӨДӨР БҮР ТУСДАА ТҮЛХҮҮР (2026-09-07) ──
 *
 * ⚠️ ХАМГААЛЖ БУЙ АЛДАА: өдөр бүр тусдаа илгээлт болгохын өмнө багцад ЦОРЫН
 *    ГАНЦ `sub|<pkg>` мөр байсан тул `saveSubmission` нь тэр түлхүүрт
 *    таарсан БУСАД мөрийг «давхардал» гэж үзээд `deleteFeatures`-ээр УСТГАДАГ
 *    (submission.ts). Хэрэв түлхүүрт өдөр орохгүй бол өдөр бүрийн илгээлтүүд
 *    нэг түлхүүрт цугларч, өчигдрийн ХЯНАГДАЖ БУЙ илгээлт устаж, хяналтын
 *    мөрийн `Эх_мөрийн_дугаар` өнчирнө. Тиймээс түлхүүр өдрөөр САЛАХ ёстой.
 */
{
  const d1 = Date.UTC(2026, 8, 6);
  const d2 = Date.UTC(2026, 8, 7);
  assert.notEqual(subKey('b1_9f', d1), subKey('b1_9f', d2), 'хоёр өдөр НЭГ түлхүүр өгөв');
  assert.equal(subKey('b1_9f', d1), `sub|b1_9f|${d1}`);
  /* ⚠️ Багц ч мөн салгана — `b1_9f` ба `b1_12f` нэг өдөрт зэрэг илгээгддэг. */
  assert.notEqual(subKey('b1_9f', d1), subKey('b1_12f', d1));
}

/* ── 21. ХУУЧИН (дагаваргүй) ТҮЛХҮҮР ХЭВЭЭР ҮҮСНЭ ──
 *
 * ⚠️ Үйлдвэрлэлд `sub|<pkg>` хэлбэрийн мөрүүд амьд байгаа тул тэднийг УНШИХ
 *    зам ЗААВАЛ нээлттэй үлдэнэ (`readActiveSubmission` legacy fallback,
 *    `readSubmissionByOid` нь OBJECTID-аар). `fillMs` өгөхгүй дуудвал ЯГ
 *    хуучин хэлбэрийг өгөх ёстой — эс бөгөөс fallback-ийн `where` таарахгүй.
 */
{
  assert.equal(subKey('b1_9f'), 'sub|b1_9f');
  assert.equal(subKey('b1_9f', null), 'sub|b1_9f');
  assert.equal(subKey('b1_9f', undefined), 'sub|b1_9f');
}

/* ── 22. `isSubmissionKey` — ГУРВАН ХЭЛБЭР ЗЭРЭГ ──
 *
 * ⚠️ `readRow` нь ЭНЭ шалгуураар «илгээлтийн мөр мөн үү» гэж шийддэг: буруу
 *    хариулбал (а) шинэ өдөртэй мөрийг ноорог гэж үзээд ЧИМЭЭГҮЙ `null`
 *    буцааж хянагч илгээлтээ олохгүй, эсвэл (б) ноорогийн `<user>|<pkg>`
 *    мөрийг илгээлт гэж уншаад өөр хүний ноорог хянагчид харагдана.
 * ⚠️ Функц нь модулиас ГАДАГШ гардаггүй тул `dkey`-ийн ёсыг ЭНД хэлбэрээр
 *    дахин тодорхойлж, хоёулаа `startsWith` угтварт тулгуурладгийг батална.
 */
{
  const isSub = (k) => k.startsWith('sub|') || k.startsWith('done|');
  assert.ok(isSub(subKey('b1_9f')), 'ХУУЧИН хэлбэр танигдсангүй');
  assert.ok(isSub(subKey('b1_9f', FILL)), 'ШИНЭ (өдөртэй) хэлбэр танигдсангүй');
  assert.ok(isSub(`done|b1_9f|${123}`), '`done|` танигдсангүй');
  /* Ноорогийн мөр илгээлт БИШ */
  assert.ok(!isSub('comp_a|b1_9f'), 'ноорогийн мөр илгээлт гэж танигдав');
}

/* ── 23. ӨДӨР ХООРОНД АГУУЛГА ХОЛИХГҮЙ ──
 *
 * ⚠️ ХАМГААЛЖ БУЙ АЛДАА (2026-09-07): `FillNew.publish` нь өнөөдрийн
 *    payload-ыг `mergeSubmission(mergeBase, …)`-аар нэгтгэдэг. Хэрэв
 *    `mergeBase` нь ӨӨР ӨДРИЙН илгээлт байвал өчигдрийн нүднүүд өнөөдрийн
 *    payload руу хуулагдаж, ХОЁУЛАА батлагдахад архивт ХОЁР УДАА тоологдоно.
 *    Тиймээс `publish` нь `staged.payload.fillMs === fillMs` үед Л нэгтгэнэ.
 *    Энэ тест нь тэр дүрмийг ЗАГВАРААР (нэгтгэсэн ба нэгтгээгүй хоёр зам)
 *    батална: нэгтгэхгүй бол өчигдрийн нүд ОГТ орохгүй.
 */
{
  const y = { ...valid(), fillMs: Date.UTC(2026, 8, 6), cells: [['12:0', 'ӨЧИГДӨР']], dates: [], adds: [], rowKeys: [] };
  const t = { ...valid(), fillMs: Date.UTC(2026, 8, 7), cells: [['13:0', 'ӨНӨӨДӨР']], dates: [], adds: [], rowKeys: [] };
  const yesterday = parseSubmission(JSON.stringify(y));
  assert.ok(yesterday, 'өчигдрийн payload задарсангүй');

  /* ЗӨВ зам — өдөр зөрсөн тул mergeBase = null */
  const sep = mergeSubmission(null, t);
  const sepCells = new Map(sep.cells);
  assert.equal(sepCells.get('13:0'), 'ӨНӨӨДӨР');
  assert.ok(!sepCells.has('12:0'), 'ӨӨР ӨДРИЙН нүд өнөөдрийн илгээлтэд орж ирэв');
  assert.equal(sep.fillMs, t.fillMs, 'нэгтгэсэн payload-ийн өдөр шинэ нь байх ёстой');

  /* ⚠️ БУРУУ зам — өдөр зөрсөн байхад нэгтгэвэл ЯГ ЮУ БОЛОХЫГ баримтжуулна:
     өчигдрийн нүд наалдана. Энэ нь `publish`-ийн `fillMs` тулгалт ЯАГААД
     заавал хэрэгтэйг харуулна (регресс болвол дээрх шалгуур ганцаараа
     барихгүй тул энэ мөр нь баримт болж үлдэнэ). */
  const mixed = mergeSubmission(yesterday, t);
  assert.equal(new Map(mixed.cells).get('12:0'), 'ӨЧИГДӨР');
  assert.equal(mixed.fillMs, t.fillMs, 'нэгтгэлд өдөр нь ШИНЭ payload-аас авагдах ёстой');
}

/* ── 24. НЭГ ӨДРИЙН ДОТОРХ ДАХИН ИЛГЭЭЛТ — ХУРИМТЛАЛ ХЭВЭЭР ──
 *
 * ⚠️ Хэрэглэгчийн шийдвэр 2 (2026-09-07): «төдий өдрийн илгээлтийг дахин
 *    илгээвэл ТЭР өдрийн илгээлт update хийгдэнэ — шинэ тойрог үүсгэхгүй».
 *    Өдөр нэмэгдсэн нь ЭНЭ хуучин зөв зан төлөвийг ЭВДЭЭГҮЙ байх ёстой:
 *    ижил өдөрт хуучин нүд НЭГТГЭГДЭЖ үлдэнэ, дарагдахгүй.
 */
{
  const day = Date.UTC(2026, 8, 7);
  const first = parseSubmission(JSON.stringify({ ...valid(), fillMs: day, cells: [['12:0', '5']], dates: [], adds: [], rowKeys: [] }));
  const second = { ...valid(), fillMs: day, at: 2000, cells: [['13:0', '7']], dates: [], adds: [], rowKeys: [] };
  const m = mergeSubmission(first, second);
  const c = new Map(m.cells);
  assert.equal(c.get('12:0'), '5', 'нэг өдрийн эхний илгээлтийн нүд алга болов');
  assert.equal(c.get('13:0'), '7');
  assert.equal(m.fillMs, day);
  assert.equal(m.at, 2000, '`at` нь СҮҮЛИЙН илгээлтийнх байх ёстой (expect тулгалт үүгээр явдаг)');
}

/* ── 2026-09-25. НЭМЭЛТИЙН ГОРИМ (`mode: 'inc'`, `v: 2`) ── */
{
  const incP = (cells, extra = {}) => ({ ...valid(), v: 2, mode: 'inc', adds: [], cells, dates: [], ...extra });
  /* задлал: туг хадгалагдана; туггүй нь хуучин (НИЙТ) хэвээр */
  const p = parseSubmission(JSON.stringify(incP([['12:0', '15']])));
  assert.ok(p && p.mode === 'inc' && p.v === 2, 'inc payload задарсангүй');
  const leg = parseSubmission(JSON.stringify(valid()));
  assert.equal(leg.mode, undefined, 'туггүй payload = хуучин (НИЙТ)');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), v: 1, mode: 'abs' })).mode, undefined, 'танихгүй туг = хуучин');

  /* нэгтгэл: нэг өдрийн дахин илгээлт НЭМЭЛТҮҮДИЙГ нийлүүлнэ (дарахгүй) */
  const next = (cells) => ({ ...incP(cells), at: 2000 });
  const m = mergeSubmission(p, next([['12:0', '5'], ['13:0', '%10']]));
  assert.equal(m.mode, 'inc');
  assert.equal(m.v, 2);
  assert.deepEqual(new Map(m.cells).get('12:0'), '20', 'өглөө +15, үдээс хойш +5 → +20');
  assert.deepEqual(new Map(m.cells).get('13:0'), '%10');
  const z = mergeSubmission(p, next([['12:0', '-15']]));
  assert.equal(new Map(z.cells).has('12:0'), false, 'тэг болсон нэмэлт хаягдана');

  /* горим холихгүй — хуучин (НИЙТ) дээр нэмэлт нэгтгэвэл ил алдаа */
  assert.throws(() => mergeSubmission(leg, next([['12:0', '5']])), /горим/, 'abs + inc чимээгүй холилдлоо');
  assert.throws(() => mergeSubmission(p, { ...valid(), cells: [['12:0', '5']] }), /горим/, 'inc + abs чимээгүй холилдлоо');
  /* хуучин + хуучин — хуучин дүрмээрээ (шинэ нь дарна) */
  assert.equal(new Map(mergeSubmission(leg, { ...valid(), at: 2000, cells: [['12:0', '9']] }).cells).get('12:0'), '9');

  /* ДАВХАРДАЛГҮЙ АРХИВЛАЛТ: батлах явцад дахин илгээсэн мөрөөс архивласан хэсгийг хасна */
  const archived = incP([['12:0', '15'], ['14:0', '3']], { rowKeys: [[12, '1 ¦ Хашаа'], [14, '2 ¦ Хана']] });
  const cur = mergeSubmission(archived, { ...next([['12:0', '5'], ['13:0', '2'], ['14:0', '-3']]), rowKeys: [[13, '3 ¦ Дээвэр']] });
  const rest = residualAfterArchive(cur, archived);
  assert.deepEqual(new Map(rest.cells), new Map([['12:0', '5'], ['13:0', '2'], ['14:0', '-3']]),
    'үлдэгдэл = ЗӨВХӨН шинэ нэмэлт (архивласан +15 дахин орохгүй; 14:0-ийн −3 залруулга хадгалагдана)');
  /* шинэ жааз руу зөөгдсөн дахин илгээлт — шошгоор хослуулна */
  const moved = { ...cur, cells: [['512:0', '20'], ['513:0', '2']], rowKeys: [[512, '1 ¦ Хашаа'], [513, '3 ¦ Дээвэр'], [514, '2 ¦ Хана']] };
  assert.deepEqual(new Map(residualAfterArchive(moved, archived).cells), new Map([['512:0', '5'], ['513:0', '2'], ['514:0', '-3']]));
  /* хослох аргагүй бол `null` (таамаглаж хасахгүй) */
  assert.equal(residualAfterArchive({ ...cur, rowKeys: [[900, 'өөр']] , cells: [['900:0', '1']] }, archived), null);
  assert.equal(residualAfterArchive(leg, archived), null, 'хуучин горимд хасахгүй');

  /* `residual` туг (2026-09-25 аудит): задлалд хадгалагдана, нэгтгэлд ДАМЖИХГҮЙ, бусад утга хаягдана */
  const rs = parseSubmission(JSON.stringify({ ...incP([['12:0', '5']]), residual: true }));
  assert.equal(rs.residual, true, 'residual туг задлалд алга болов');
  assert.equal(parseSubmission(JSON.stringify({ ...incP([['12:0', '5']]), residual: 'yes' })).residual, undefined, 'зөвхөн `true`');
  assert.equal(mergeSubmission(rs, next([['12:0', '1']])).residual, undefined, 'нэгтгэлд дамжихгүй (шинэ илгээлт өөрөө тойрог нээнэ)');
}

/* ── 2026-10-04 аудит. ДАВТАМЖИЙН ДУГААР (`rowOcc`, #2) · ИЛГЭЭЛТИЙН ТАНИГЧ (`nonces`, #3) ── */
{
  const incP = (cells, extra = {}) => ({ ...valid(), v: 2, mode: 'inc', adds: [], cells, dates: [], ...extra });
  /* задлал — эвдэрсэн элементийг л хаяна */
  const p = parseSubmission(JSON.stringify(incP([['12:0', '5']], {
    rowKeys: [[12, '1 ¦ Шороо']], rowOcc: [[12, 1, 2], [13, 2, 2], ['x', 0, 1], [14, -1, 3]], nonces: ['abc', 7, ''],
  })));
  assert.deepEqual(p.rowOcc, [[12, 1, 2]], 'зөвхөн хүчинтэй давтамж (k < n, бүхэл) үлдэх ёстой');
  assert.deepEqual(p.nonces, ['abc']);
  /* нэгтгэл — танигч хуримтлагдана (дараагийн илгээлт өмнөхийнхийг агуулна → хариу тасарсан ч олдоно) */
  const m = mergeSubmission(p, { ...incP([['13:0', '1']], { rowKeys: [[13, '2 ¦ Бетон']], rowOcc: [[13, 0, 1]], nonces: ['def'] }), at: 2000 });
  assert.deepEqual(m.nonces, ['abc', 'def'], 'nonce хуримтлагдах ёстой');
  assert.deepEqual(m.rowOcc, [[12, 1, 2], [13, 0, 1]]);
  assert.equal(mergeSubmission(null, incP([['1:0', '1']])).nonces, undefined, 'танигчгүй бол талбар үүсэхгүй');
  /* residual — давхардсан шошгыг давтамжаар ЯГ хослуулна; давтамжгүй, тоо зөрвөл ТААМАГЛАХГҮЙ (null) */
  const archived = incP([['106:0', '5']], { rowKeys: [[106, '1 ¦ Шороо']], rowOcc: [[106, 1, 2]] });
  const cur = incP([['203:0', '2'], ['206:0', '9']], { rowKeys: [[203, '1 ¦ Шороо'], [206, '1 ¦ Шороо']], rowOcc: [[203, 0, 2], [206, 1, 2]] });
  assert.deepEqual(new Map(residualAfterArchive(cur, archived).cells), new Map([['203:0', '2'], ['206:0', '4']]), '2-р «Шороо»-оос хасах ёстой (1-р биш)');
  const curLeg = { ...cur, rowOcc: undefined };
  const archLeg = { ...archived, rowOcc: undefined };
  assert.equal(residualAfterArchive(curLeg, archLeg), null, 'давтамжгүй сийрэг хослол — хоёрдмол тул null (дуудагч анхааруулна)');
}

/* ── 2026-10-04 дахин аудит. #1 хуучин payload-ын давтамж СУУРЬ жаазаас · #5 танигч алдагдахгүй ── */
{
  const incP = (cells, extra = {}) => ({ ...valid(), v: 2, mode: 'inc', adds: [], cells, dates: [], ...extra });
  /* #5: олон оролдлоготой өдөр (50) ч АНХНЫ танигч хадгалагдана — урьд нь 20-иор тасарч «буугаагүй» гэж
     дүгнэгдэн ДАХИН илгээгддэг байв; дээд хэмжээ (200) нь SUBMISSION_MAX-д багтана */
  let acc = mergeSubmission(null, incP([['1:0', '1']], { nonces: ['n0'] }));
  for (let i = 1; i < 50; i += 1) acc = mergeSubmission(acc, { ...incP([['1:0', '1']], { nonces: [`n${i}`] }), at: 1000 + i });
  assert.equal(acc.nonces.length, 50);
  assert.ok(acc.nonces.includes('n0'), '50 оролдлогын дараа ч эхний танигч алдагдах ёсгүй');
  assert.equal(parseSubmission(JSON.stringify(acc)).nonces.length, 50, 'задлал танигчийг таслах ёсгүй');
  for (let i = 50; i < 260; i += 1) acc = mergeSubmission(acc, { ...incP([['1:0', '1']], { nonces: [`n${i}x`.padEnd(24, 'f')] }), at: 1000 + i });
  assert.equal(acc.nonces.length, 200, 'дээд хэмжээ 200');
  assert.ok(JSON.stringify(acc).length < SUBMISSION_MAX / 10, 'танигчид илгээлтийн хэмжээг дүүргэх ёсгүй');
  /* #1: хуучин (давтамжгүй) payload нь батлах (`hyanaltStore`) ба дахин илгээх (`FillNew`) замд СУУРЬ жаазаас
     нөхөгдөнө — эх кодын гэрээ (жааз уншдаг тул нэгж шалгуур нь sheetFrame.check-д) */
  const HY = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  assert.ok(HY.includes('if (pl.base != null && needsFrameOcc(pl, loaded.rows)) {') && HY.includes('pl = withFrameOcc(pl, baseRows0);'),
    'батлалт хуучин payload-ын давтамжийг суурь жаазаас нөхөхгүй байна — мөнхөд гацна');
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  assert.ok(FN.includes('const mv = movePayload(await ensureFrameOcc(pkg, sc, staged.payload, freshRows));'), 'дахин илгээх зам суурь жаазаас нөхөхгүй');
  assert.ok(FN.includes('if (mv.lost.length && !window.confirm('), 'тулгаж чадаагүй нүдний ГАРЦ (ил баталгаажуулж хасах) алга');
  /* #5: батлагдсан (`done|`) мөрөөс ч хайна */
  const SB = fs.readFileSync('src/lib/submission.ts', 'utf8');
  assert.ok(SB.includes('export async function findNonce(') && /dkey LIKE \$\{sqlStr\(`\$\{DONE_PREFIX\}%`\)\}/.test(SB), 'танигчийг done| мөрөөс хайхгүй байна');
  assert.ok((FN.match(/await findNonce\(pkg\.key, /g) ?? []).length >= 2, 'ачаалах ба илгээх замууд findNonce ашиглах ёстой');
}

/* ── 2026-10-09 (R2): «архивлаж байна» тэмдэг — задлалт, mergeSubmission дамжуулахгүй ── */
{
  const mk = { at: 1000, startedAt: 1001, maxOid0: 500, fillMs: FILL, n: 1460 };
  const p = parseSubmission(JSON.stringify({ ...valid(), archiving: mk }));
  assert.deepEqual(p.archiving, mk, 'бүтэн тэмдэг уншигдана');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), archiving: { ...mk, n: 0 } })).archiving, undefined, 'n=0 хаягдана');
  assert.equal(parseSubmission(JSON.stringify({ ...valid(), archiving: { ...mk, maxOid0: 'x' } })).archiving, undefined, 'эвдэрсэн хаягдана');
  const m = mergeSubmission(p, { ...valid(), at: 2000, cells: [['12:0', '6']] });
  assert.equal(m.archiving, undefined, 'шинэ агуулга (шинэ at) тэмдгийг өвлөхгүй');
  const SB2 = fs.readFileSync('src/lib/submission.ts', 'utf8');
  assert.ok(SB2.includes('export async function markArchiving(') && SB2.includes('delete next.archiving;'), 'markArchiving / closeSubmission-ийн арилгалт алга');
  const HY2 = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  const iMark = HY2.indexOf('await markArchiving(staged.oid, staged.at, {');
  const iAdds = HY2.indexOf('await applyAdds(pkg, frame, written)');
  assert.ok(iMark > 0 && iAdds > iMark, 'тэмдэг applyAdds-ийн ӨМНӨ бичигдэх ёстой (R2)');
  assert.ok(HY2.includes('archiveSubmission(cur, a.subAt)'), 'apply subAt-ийг archiveSubmission руу дамжуулна (R3)');
  assert.ok(HY2.includes('unclosedSet(subOid, { at: staged.at })'), 'хаагдаагүй нэмэлтийн тэмдэг (R1)');
}

/* ── 2026-10-09 (R2-a/b/c · 7): тэмдэг нь ЭНЭ илгээлтийн жаазыг ЯГ таньна ── */
{
  const NOF = 'no';
  const OIDF = 'oid';
  /* дээж: зөвхөн өмнөхөөсөө ялгарах нүд; шинэ мөр бүхэлдээ */
  const prev = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
  const frame = [{ a: 1, b: 2 }, { a: 3, b: 9 }, { a: 5, b: null }];
  const pr = frameProbe(frame, (i) => prev[i], ['a', 'b']);
  assert.deepEqual(pr, [[1, 'b', 9], [2, 'a', 5], [2, 'b', null]], 'өөрчлөгдсөн нүд л дээж болно');
  assert.equal(frameProbe(Array.from({ length: 50 }, (_, i) => ({ a: i })), () => undefined, ['a'], 4).length, 4, 'дээд урт');

  /* архив: өөр жааз (5 мөр, ажил нэмэх) + манай жааз (3 мөр) — ≥ n биш, ЯГ n + дээж */
  const row = (oid, no, extra = {}) => ({ [OIDF]: oid, [NOF]: no, ...extra });
  const other = [row(101, 'A'), row(102, 'x'), row(103, 'y'), row(104, 'z'), row(105, 'w')];
  const ours = [row(106, 'A', { b: 2 }), row(107, 'x', { b: 9 }), row(108, 'y', { a: 5, b: null })];
  const mk = { n: 3, rootNo: 'A', probe: pr };
  assert.equal(matchArchivedFrame(other, mk, OIDF, NOF), null, 'тэр өдрийн ӨӨР (урт) жаазыг «архивлагдсан» гэж андуурахгүй');
  assert.equal(matchArchivedFrame([...other, ...ours], mk, OIDF, NOF), 106, 'манай жааз олдоно');
  const wrong = [row(106, 'A'), row(107, 'x', { b: 8 }), row(108, 'y', { a: 5, b: null })];
  assert.equal(matchArchivedFrame(wrong, mk, OIDF, NOF), null, 'урт таарсан ч утга зөрвөл — манайх биш');
  assert.equal(matchArchivedFrame([row(1, 'A'), row(2, 'x'), row(3, 'y'), row(4, 'q')], { n: 3, rootNo: 'A' }, OIDF, NOF), null, 'n-ээс урт жааз — манайх биш');
  assert.equal(matchArchivedFrame([row(1, 'A'), row(2, 'x'), row(3, 'y')], { n: 3 }, OIDF, NOF), 1, 'хуучин тэмдэг (дээжгүй) — урт + эхний №');

  /* задлал: rootNo · probe хадгалагдана, эвдэрсэн дээж хаягдана */
  const base = { at: 1000, startedAt: 1001, maxOid0: 500, fillMs: FILL, n: 3 };
  const p2 = parseSubmission(JSON.stringify({ ...valid(), archiving: { ...base, rootNo: 'A', probe: [...pr, [9, 'a', 1], ['x', 'a', 1]] } }));
  assert.deepEqual(p2.archiving, { ...base, rootNo: 'A', probe: pr }, 'дээж уншигдана, n-ээс гадуур/эвдэрсэн хаягдана');

  const SB3 = fs.readFileSync('src/lib/submission.ts', 'utf8');
  assert.ok(SB3.includes('attributes: { OBJECTID: oid, at: curAt, payload: JSON.stringify(next) }'), 'markArchiving at-ийг payload-тай нэг бичилтээр бичнэ (7)');
  assert.ok(/const res2 = await fl\.queryFeatures/.test(SB3), 'markArchiving бичсэний дараа дахин уншиж батална (7)');
  const HY3 = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  assert.ok(HY3.includes('hitOid = matchArchivedFrame(rows, am, sc.f.oid, sc.f.no);') && !HY3.includes('hit.n >= am.n'), 'дахин батлалт жаазыг ЯГ таньна (R2-c)');
  assert.ok(HY3.includes("if (!isLostWrite(e)) return { ok: false, error: why + (await clearMark()) };"), 'тодорхой татгалзалд тэмдэг арилна (R2-a)');
  assert.ok(!HY3.includes('markArchiving(staged.oid, staged.at, null).catch(() => undefined)'), 'арилгалтын үр дүнг шалгана (R2-b)');
  console.log('✅ R2-a/b/c · 7 — архивлах тэмдэг');
}

console.log('submission.check ✓');
