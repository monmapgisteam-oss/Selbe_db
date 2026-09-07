/**
 * «ХҮН · ЦАГ · ТЕХНИК» KPI-ийн шалгуур.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/workforce.check.mjs
 *
 * ⚠️ ЛОГИК ХУУЛБАРЛААГҮЙ — жинхэнэ `computeWorkforce`-ыг импортлоно, сүлжээгүй.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. UTC-ээр өдөр огтлох — УБ-ын шөнийн тайлан өмнөх өдөрт унах.
 *  2. Нэг өдрийн олон мөр нийлбэрлэгдэж давхар тоологдох; ижил `Ognoo`-той
 *     (амьд өгөгдөлд бүгд 04:00Z) давхар мөрөөс ЗАСВАРЛААГҮЙ хувилбар нь
 *     серверийн тогтворгүй эрэмбээр сонгогдох (2026-08-21: oid255 247 ↔ oid256 389).
 *  3. Компанийн нийлбэр биш толгойн дүн «албан ёсны» болох.
 *  4. Тайлангүй компани «0 ажилтантай» гэж чимээгүй уншигдах.
 *  5. Мэдээлэлгүй (бүх талбар null) мөр «0» болох.
 *  6. Босго: бууралтын хувь, хуучирсан тайлан, өмнөх 0 үед хувь бодох.
 */
import assert from 'node:assert/strict';
import {
  computeWorkforce, groupDays, ubDayKey, workforceLevel,
  WORKFORCE_DROP_WARN, WORKFORCE_DROP_BAD, WORKFORCE_STALE_DAYS,
} from './workforce.ts';

const SFX = ['HHDMGK', 'HBZIT', 'HBTIT', 'MSK', 'NBG', 'MK', 'P', 'MMSE', 'SC', 'OSNAAG', 'GUBB', 'CHHO'];
const BAGTS = {
  HHDMGK: 'Багц -1', HBZIT: 'Багц -2', HBTIT: 'Багц -3.1', MSK: 'Багц -3.2',
  NBG: 'Багц -3.3', MK: 'Багц -4.1', P: 'Багц -4.2',
};

/** УБ-ын цагаар epoch ms */
const ub = (y, m, d, h = 20) => Date.UTC(y, m - 1, d, h - 8);
const DAY = 86_400_000;

/**
 * Маягтын мөр — амьд өгөгдлийн хэв маяг: `Niit_ajiltan_<SFX>` ороогүй үед ч 0.
 * `sys` = ArcGIS-ийн системийн талбар { oid, edit } — өгөөгүй бол null.
 */
function row(ognoo, comp = {}, header = {}, allNull = false, sys = {}) {
  const r = {
    objectid: sys.oid ?? null,
    EditDate: sys.edit ?? null,
    Ognoo: ognoo,
    Niit_ajiltan: header.workers ?? null,
    Hun_tsag: header.manHours ?? null,
    Niit_tehnik: header.technik ?? null,
  };
  for (const s of SFX) {
    const c = comp[s];
    r[`Niit_ajiltan_${s}`] = allNull ? null : (c?.w ?? 0);
    r[`MNG_ajiltani_too_${s}`] = c?.m ?? null;
    r[`G_ajiltanii_too_${s}`] = c?.g ?? null;
    r[`Tehnik_${s}`] = c?.t ?? null;
    if (BAGTS[s]) r[`Bagts_${s}`] = BAGTS[s];
  }
  return r;
}

/* ══════════ 1. УБ-ын хуанлийн өдөр ══════════ */
{
  // 2026-09-03 18:00 UTC = 2026-09-04 02:00 УБ
  const t = Date.UTC(2026, 8, 3, 18);
  assert.equal(new Date(t).toISOString().slice(0, 10), '2026-09-03');
  assert.equal(ubDayKey(t), '2026-09-04', 'УБ-ын шөнийн тайлан дараагийн өдөрт');
  assert.equal(ubDayKey(ub(2026, 9, 3, 0)), '2026-09-03');
  assert.equal(ubDayKey(ub(2026, 9, 3, 23)), '2026-09-03');
}

/* ══════════ 2. Хоосон → unknown ══════════ */
{
  const k = computeWorkforce([], ub(2026, 9, 4));
  assert.equal(k.level, 'unknown');
  assert.equal(k.value, '—');
  assert.equal(k.asOf, null);
  assert.deepEqual(k.tables, []);
  assert.deepEqual(k.facts, []);
  // огноогүй мөр л байвал мөн хоосон
  const k2 = computeWorkforce([row(null, { MK: { w: 5 } }), row(0, { MK: { w: 5 } })], ub(2026, 9, 4));
  assert.equal(k2.level, 'unknown');
}

/* ══════════ 3. Амьд өгөгдлийн хэв маяг — гурван өдөр ══════════ */
const D3 = ub(2026, 9, 3);
const D2 = ub(2026, 9, 2);
const D1 = ub(2026, 9, 1);
const ROWS = [
  row(D3, {
    HHDMGK: { w: 258, m: 57, g: 201, t: 10 }, HBZIT: { w: 311, g: 311, t: 21 },
    MSK: { w: 138, m: 138, t: 25 }, NBG: { w: 302, m: 302, t: 10 }, MK: { w: 463, m: 452, g: 11, t: 6 },
  }, { workers: 1480, manHours: 11776, technik: 72 }),
  row(D2, {
    HHDMGK: { w: 351, m: 141, g: 210, t: 10 }, HBZIT: { w: 307, g: 307, t: 21 },
    MSK: { w: 181, m: 181, t: 15 }, NBG: { w: 284, m: 284, t: 10 }, MK: { w: 333, m: 322, g: 11, t: 6 },
  }, { workers: 1456, manHours: 11648, technik: 62 }),
  row(D1, {
    HHDMGK: { w: 224, g: 224, t: 10 }, HBZIT: { w: 310, g: 310, t: 21 },
    MSK: { w: 184, m: 184, t: 15 }, NBG: { w: 315, m: 315, t: 10 }, MK: { w: 387, m: 376, g: 11, t: 6 },
    P: { w: 77, m: 77, t: 14 },
  }, { workers: 1497, manHours: 11976, technik: 76 }),
];
{
  const k = computeWorkforce(ROWS, ub(2026, 9, 4, 9));
  const d = k.detail;
  // Компанийн нийлбэр — толгойн 1480 БИШ
  assert.equal(d.workersLatest, 1472, 'албан ёсны тоо = Σ компани');
  assert.equal(d.headerWorkers, 1480, 'толгойн дүн тусдаа ил');
  assert.equal(k.value, '1,472');
  assert.equal(d.workersPrev, 1456);
  assert.equal(d.delta, 16);
  assert.ok(Math.abs(d.deltaPct - (16 / 1456) * 100) < 1e-9);
  assert.equal(d.technik, 72);
  assert.equal(d.manHours, 11776);
  assert.equal(k.asOf, D3);
  assert.equal(d.latestKey, '2026-09-03');
  assert.equal(d.prevKey, '2026-09-02');
  assert.equal(d.staleDays, 0);
  assert.equal(k.level, 'good');
  assert.deepEqual(k.failedSources, []);

  // Баримтууд — зөвхөн тоо
  assert.deepEqual(k.facts, [
    '+16 хүн өмнөх тайлангаас (+1.1%)',
    'техник 72',
    'хүн-цаг 11,776',
    '2026-09-03 · өмнөх 2026-09-02',
    '1 компани тайлангүй',
  ]);

  // Тайлангүй: П 09-01-нд 77 байсан, 09-02/09-03-нд 0
  assert.deepEqual(d.unreported, ['P']);
  const pRow = d.companies.find((c) => c.sfx === 'P');
  assert.equal(pRow.unreported, true);
  assert.equal(pRow.workers, 0);
  // ХБТИТ хэзээ ч тоогүй → тайлангүй БИШ, хүснэгтэд ч орохгүй
  assert.equal(d.companies.find((c) => c.sfx === 'HBTIT').unreported, false);

  // Хүснэгт 1: хамгийн их бууралт эхэнд, бүх тэг компани хасагдсан
  const t1 = k.tables[0];
  assert.equal(t1.cols.length, 8);
  const names = t1.rows.map((r) => r[0].v);
  assert.equal(t1.rows.length, 6, 'ХХДМГК · МСК · П · ХБЗИТ · НБГ · МК');
  assert.ok(names[0].startsWith('Хятадын хоёр дахь'), 'ХХДМГК −93 эхэнд');
  assert.ok(names[1].startsWith('Морин сувд'), 'МСК −43');
  assert.ok(names[2].includes('тайлангүй'), 'П 0 (тайлангүй тэмдэгтэй)');
  assert.ok(names[5].startsWith('Монкон'), 'МК +130 сүүлд');
  assert.ok(!names.some((n) => n.includes('тавдугаар')), 'ХБТИТ хасагдсан');
  assert.ok(!names.includes('MMSE'), 'MMSE хасагдсан');
  const hh = t1.rows[0];
  assert.deepEqual(hh.slice(1).map((c) => c.v), ['Багц -1', 258, 351, -93, 10, 57, 201]);
  // Гадаад хоосон → «—» (null), 0 биш
  const msk = t1.rows[1];
  assert.equal(msk[7].v, null, 'МСК гадаад null');
  assert.equal(msk[1].v, 'Багц -3.2');
  for (const r of t1.rows) assert.equal(r.length, 8);

  // Хүснэгт 2: 3 өдөр, огноо шинээс хуучин
  const t2 = k.tables[1];
  assert.deepEqual(t2.rows.map((r) => r[0].v), ['2026-09-03', '2026-09-02', '2026-09-01']);
  assert.deepEqual(t2.rows[0].map((c) => c.v), ['2026-09-03', 1472, 72, 11776]);
  assert.deepEqual(t2.rows[2].map((c) => c.v), ['2026-09-01', 1497, 76, 11976]);

  // Анхааруулга: ХХДМГК 351→258 (−26.5%), П тайлангүй; МСК −23.8% босгонд хүрэхгүй
  assert.equal(k.issues.length, 2);
  assert.equal(k.issues[0].text, 'Хятадын хоёр дахь металлурги групп корпорац ХХК — 351 → 258 хүн');
  assert.equal(k.issues[1].text, 'Професионалстрой ХХК — сүүлийн тайланд орсонгүй');
  assert.ok(k.issues.every((i) => i.tone === 'warn'));
}

/* ══════════ 4. Нэг өдрийн олон мөр — сүүлийнх нь үлдэнэ, нийлбэрлэхгүй ══════════ */
{
  const early = row(ub(2026, 9, 3, 9), { MK: { w: 100, t: 1 } }, { workers: 100 });
  const late = row(ub(2026, 9, 3, 21), { MK: { w: 120, t: 2 } }, { workers: 120 });
  const days = groupDays([early, late, row(D2, { MK: { w: 90 } })]);
  assert.equal(days.length, 2);
  assert.equal(days[0].key, '2026-09-03');
  assert.equal(days[0].rowsInDay, 2);
  assert.equal(days[0].workers, 120, 'сүүлийн мөр, 220 биш');
  assert.equal(days[0].at, ub(2026, 9, 3, 21));
  // эрэмбэ хамаарахгүй
  const days2 = groupDays([late, early]);
  assert.equal(days2[0].workers, 120);

  // ⚠️ Амьд хэв маяг: ЯГ ИЖИЛ Ognoo (04:00Z), өөр EditDate — засварласан (EditDate их)
  //    нь үлдэнэ, оролтын дараалал ХАМААРАХГҮЙ (2026-08-21: oid255 247 ↔ oid256 389)
  const day = Date.UTC(2026, 7, 21, 4);
  const first = row(day, { MK: { w: 247, t: 3 } }, { workers: 247 }, false,
    { oid: 255, edit: Date.UTC(2026, 7, 21, 2, 54) });
  const fixed = row(day, { MK: { w: 389, t: 3 } }, { workers: 389 }, false,
    { oid: 256, edit: Date.UTC(2026, 7, 21, 3, 32) });
  for (const order of [[first, fixed], [fixed, first]]) {
    const d = groupDays(order);
    assert.equal(d.length, 1);
    assert.equal(d[0].key, '2026-08-21');
    assert.equal(d[0].workers, 389, 'EditDate их = засварласан хувилбар');
    assert.equal(d[0].oid, 256);
    assert.equal(d[0].rowsInDay, 2);
  }
  // EditDate ч тэнцүү (эсвэл хоосон) → objectid их нь (дахин илгээлт)
  const a = row(day, { MK: { w: 1 } }, {}, false, { oid: 10 });
  const b = row(day, { MK: { w: 2 } }, {}, false, { oid: 11 });
  assert.equal(groupDays([b, a])[0].workers, 2);
  assert.equal(groupDays([a, b])[0].workers, 2);
  assert.equal(groupDays([a, b])[0].oid, 11);
  // Ognoo их нь EditDate/objectid-оос ДАВАМГАЙЛНА
  const older = row(ub(2026, 9, 3, 9), { MK: { w: 5 } }, {}, false, { oid: 99, edit: Date.UTC(2026, 8, 10) });
  const newest = row(ub(2026, 9, 3, 21), { MK: { w: 6 } }, {}, false, { oid: 1, edit: Date.UTC(2026, 8, 3) });
  assert.equal(groupDays([older, newest])[0].workers, 6);
  assert.equal(groupDays([newest, older])[0].workers, 6);
  // Системийн талбаргүй мөр (oid null) → oid null, эвдрэхгүй
  assert.equal(groupDays([row(D2, { MK: { w: 9 } })])[0].oid, null);
}

/* ══════════ 5. null ≠ 0 — бүх компанийн талбар хоосон мөр ══════════ */
{
  const blankRow = row(D3, {}, { workers: 900, manHours: 7200 }, true);
  const k = computeWorkforce([blankRow, ROWS[1]], ub(2026, 9, 4));
  assert.equal(k.detail.workersLatest, null, 'нэг ч талбаргүй → null');
  assert.equal(k.value, '—');
  assert.equal(k.level, 'unknown');
  assert.equal(k.detail.delta, null);
  assert.equal(k.detail.headerWorkers, 900);
  assert.equal(k.tables[1].rows[0][1].v, null, 'трендэд «—», 0 биш');
  assert.equal(k.tables[1].rows[0][3].v, 7200);
  // Хүн-цаг хоосон бол баримтад орохгүй; бүх Tehnik_ хоосон → техник null, «техник 0» БИШ
  const k2 = computeWorkforce([row(D3, { MK: { w: 10 } }), row(D2, { MK: { w: 10 } })], ub(2026, 9, 4));
  assert.ok(!k2.facts.some((f) => f.startsWith('хүн-цаг')));
  assert.equal(k2.detail.technik, null, 'бүх Tehnik_ хоосон → null');
  assert.equal(k2.detail.workersLatest, 10, 'ажилтан тусдаа тугаар — null биш');
  assert.deepEqual(k2.facts, ['0 хүн өмнөх тайлангаас (0.0%)', '2026-09-03 · өмнөх 2026-09-02']);
  assert.equal(k2.tables[1].rows[0][2].v, null, 'трендэд техник «—»');
  // Tehnik_ 0 гэж БИЧИГДСЭН бол 0 (хэмжсэн тэг) — null биш
  const k3 = computeWorkforce([row(D3, { MK: { w: 10, t: 0 } }), row(D2, { MK: { w: 10, t: 0 } })], ub(2026, 9, 4));
  assert.equal(k3.detail.technik, 0);
  assert.ok(k3.facts.includes('техник 0'));
  // Толин тусгал: зөвхөн Tehnik_ бөглөгдсөн, ажилтны талбар бүгд хоосон → ажилтан null, техник тоо
  const onlyT = row(D3, {}, {}, true);
  onlyT.Tehnik_MK = 4;
  const k4 = computeWorkforce([onlyT, ROWS[1]], ub(2026, 9, 4));
  assert.equal(k4.detail.workersLatest, null, 'ажилтны талбаргүй → null');
  assert.equal(k4.detail.technik, 4, 'техник тусдаа тугаар тоо');
  assert.equal(k4.value, '—');
  assert.equal(k4.level, 'unknown');
  assert.deepEqual(k4.tables[1].rows[0].map((c) => c.v), ['2026-09-03', null, 4, null]);
}

/* ══════════ 6. Босго ══════════ */
{
  assert.equal(WORKFORCE_DROP_WARN, -10);
  assert.equal(WORKFORCE_DROP_BAD, -25);
  assert.equal(WORKFORCE_STALE_DAYS, 3);
  assert.equal(workforceLevel(-30, 0), 'bad');
  assert.equal(workforceLevel(-25, 0), 'bad');
  assert.equal(workforceLevel(-15, 0), 'warn');
  assert.equal(workforceLevel(-10, 0), 'warn');
  assert.equal(workforceLevel(-5, 0), 'good');
  assert.equal(workforceLevel(20, 3), 'good');
  assert.equal(workforceLevel(20, 4), 'warn', 'хуучирсан тайлан → ядаж warn');
  assert.equal(workforceLevel(-30, 4), 'bad');
  assert.equal(workforceLevel(null, 0), 'good', 'өмнөх тайлангүй ч шинэ → good');
  assert.equal(workforceLevel(null, 9), 'warn');

  // Хуучирсан: одоо = сүүлийн тайлангаас 5 хоног
  const stale = computeWorkforce(ROWS, D3 + 5 * DAY);
  assert.equal(stale.detail.staleDays, 5);
  assert.equal(stale.level, 'warn');

  // Том бууралт → bad
  const drop = computeWorkforce([
    row(D3, { MK: { w: 60 } }, {}),
    row(D2, { MK: { w: 100 } }, {}),
  ], ub(2026, 9, 4));
  assert.equal(drop.detail.deltaPct, -40);
  assert.equal(drop.level, 'bad');
  assert.equal(drop.facts[0], '-40 хүн өмнөх тайлангаас (-40.0%)');
  assert.equal(drop.issues.length, 1);
  assert.equal(drop.issues[0].text, 'Монкон констракшн ХХК — 100 → 60 хүн');

  // Өмнөх 0 → хувь null, delta бий
  const fromZero = computeWorkforce([
    row(D3, { MK: { w: 30 } }),
    row(D2, {}),
  ], ub(2026, 9, 4));
  assert.equal(fromZero.detail.delta, 30);
  assert.equal(fromZero.detail.deltaPct, null);
  assert.equal(fromZero.facts[0], '+30 хүн өмнөх тайлангаас');
  assert.equal(fromZero.level, 'good');

  // Компанийн бууралт, өмнөх < 10 → дохиолохгүй
  const small = computeWorkforce([
    row(D3, { MK: { w: 2 }, NBG: { w: 100 } }),
    row(D2, { MK: { w: 8 }, NBG: { w: 100 } }),
  ], ub(2026, 9, 4));
  assert.equal(small.issues.length, 0);

  // Ганц тайлан — өмнөх байхгүй
  const single = computeWorkforce([ROWS[0]], ub(2026, 9, 4));
  assert.equal(single.detail.prevKey, null);
  assert.equal(single.detail.delta, null);
  assert.equal(single.facts[0], 'техник 72');
  assert.ok(single.facts.includes('2026-09-03'));
  assert.equal(single.level, 'good');
  assert.ok(single.tables[0].rows.every((r) => r[3].v === null), 'өмнөх «—»');
}

/* ══════════ 7. Тайлангүй цонх — 7 хоног ══════════ */
{
  // П 9 хоногийн өмнө л тоотой байсан → цонхноос гадна → тайлангүй БИШ
  const k = computeWorkforce([
    row(D3, { MK: { w: 10 } }),
    row(D2, { MK: { w: 10 } }),
    row(D3 - 9 * DAY, { MK: { w: 10 }, P: { w: 50 } }),
  ], ub(2026, 9, 4));
  assert.deepEqual(k.detail.unreported, []);
  // 6 хоногийн өмнө → цонхонд
  const k2 = computeWorkforce([
    row(D3, { MK: { w: 10 } }),
    row(D2, { MK: { w: 10 } }),
    row(D3 - 6 * DAY, { MK: { w: 10 }, P: { w: 50 } }),
  ], ub(2026, 9, 4));
  assert.deepEqual(k2.detail.unreported, ['P']);
  assert.equal(k2.facts.at(-1), '1 компани тайлангүй');
  // Трендийн цонх: 20 хоногийн өмнөх өдөр орохгүй
  const k3 = computeWorkforce([
    row(D3, { MK: { w: 10 } }),
    row(D3 - 20 * DAY, { MK: { w: 10 } }),
  ], ub(2026, 9, 4));
  assert.equal(k3.tables[1].rows.length, 1);
  assert.equal(k3.detail.days.length, 2);
}

console.log('workforce.check: OK');
