/**
 * БҮСИЙН ЭРЭМБЭ ба АНАЛИЗЫН ӨГӨГДЛИЙН ЗАСВАРУУД — 2026-10-01, «хэрэглэгч: бүгдийг зас».
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/analysis/suit/rankUtil.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. Ижил (бүхэлчилсэн) оноонд ИЖИЛ байр («1, 2, 2, 4»); өгөгдөлгүй бүс байргүй.
 *   2. «N/M бүс өгөгдөлтэй» тоо.
 *   3. Бүсийн CSV — байр, оноо, үзүүлэлт бүрийн ТҮҮХИЙ (`rawActual`) утга ба оноо; null хоосон.
 *   4. BCR-ийн хэмжээсийг өгөгдлөөс (хэсэг 0–1 ↔ хувь 0–100) — хоёуланг хамгаална.
 *   5. Зогсоолын «Хүн амаар» = ОРШИН СУУГЧ (`Population`), хүчин чадал орохгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { competitionRanks, countWithData, zoneCsv } from './rankUtil.ts';
import { bcrScaleOf, bcrToPct, parkingNeedOf } from '@/lib/analysis/data';

/* 1. Өрсөлдөөний эрэмбэ */
assert.deepEqual(competitionRanks([90, 72.4, 72.3, 60]), [1, 2, 2, 4], 'дэлгэцийн «72» = ижил байр');
assert.deepEqual(competitionRanks([50, null, 50, 49.6]), [1, null, 1, 1], '49.6 → «50»; null байргүй');
assert.deepEqual(competitionRanks([]), []);
assert.deepEqual(competitionRanks([null, NaN]), [null, null]);

/* 2–3. Тоо ба CSV */
{
  const ind = { id: 'density', short: 'Нягтшил', unit: 'хүн/га', decimals: 0 };
  const ind2 = { id: 'green', short: 'Ногоон', unit: 'м²/хүн', decimals: 1 };
  const row = (id, urban, dens, densActual) => ({
    id, type: 'Орон сууц', urban, residentPop: 1000, households: 300, areaHa: 2.345,
    raw: { density: dens, green: null }, rawActual: { density: densActual, green: null },
    parts: { density: { value: dens, score: urban, weight: 1 }, green: { value: null, score: null, weight: 1 } },
  });
  const rows = [row('A-1', 72.4, 400, 410), row('B-2', null, null, null), row('C-3', 72.3, 300, 300)];
  assert.equal(countWithData(rows, 'urban', ind), 2);
  const csv = zoneCsv(rows, 'urban', ind, [ind, ind2]).split('\r\n');
  assert.equal(csv.length, 4, 'толгой + 3 бүс');
  assert.ok(csv[0].includes('Нягтшил (хүн/га)') && csv[0].includes('Нягтшил оноо'), csv[0]);
  /* Эрэмбээр: A-1 (байр 1), C-3 (байр 1 — ижил «72»), B-2 (байргүй) */
  assert.ok(csv[1].startsWith('1,A-1,'), csv[1]);
  assert.ok(csv[2].startsWith('1,C-3,'), csv[2]);
  assert.ok(csv[3].startsWith(',B-2,'), `өгөгдөлгүй бүс байргүй: ${csv[3]}`);
  /* ТҮҮХИЙ утга `rawActual`-аас (410), `raw` (400) биш */
  assert.ok(csv[1].includes(',410,'), csv[1]);
  /* null үзүүлэлт — хоосон нүд (0 БИШ) */
  assert.ok(csv[1].endsWith(',,'), csv[1]);
}

/* 4. BCR хэмжээс */
{
  assert.equal(bcrScaleOf([0.4, 0.11, 0.5, null, '']), true, 'хэсэг (0–1)');
  assert.equal(bcrScaleOf([40, 11, 50, 100]), false, 'хувь (0–100)');
  assert.equal(bcrScaleOf([0.4, 0.3, 40]), true, 'медиан — нэг хувиар бичигдсэн бичлэг шийдэхгүй');
  assert.equal(bcrScaleOf([]), true, 'утгагүй — хуучин таамаг');
  assert.equal(bcrToPct(0.4, true), 40);
  assert.equal(bcrToPct(40, true), 40, 'холимог: хувиар ирсэн утга дахин ×100 БИШ');
  assert.equal(bcrToPct(40, false), 40);
  assert.equal(bcrToPct(0.8, false), 0.8, 'хувийн горимд хөндөхгүй');
}

/* 5. Зогсоол — оршин суугчаар */
{
  const z = { population: 1600, residentPop: 1000, capacityPop: 600, households: 300, normParking: 0 };
  const need = parkingNeedOf(z, { source: 'population', per1000: 250, perHousehold: 1 });
  assert.equal(need, 250, `оршин суугч 1000 × 250 ÷ 1000 (гарсан ${need})`);
  assert.equal(parkingNeedOf({ ...z, residentPop: 0 }, { source: 'population', per1000: 250, perHousehold: 1 }), null,
    'оршин суугчгүй — null (0 БИШ)');
  const urban = readFileSync(new URL('./Urban.tsx', import.meta.url), 'utf8');
  assert.ok(urban.includes('a + r.residentPop, 0)'), 'томьёоны мөр оршин суугчаар');
}

/* UI: Ranking — байр, тоо, CSV */
{
  const rk = readFileSync(new URL('./Ranking.tsx', import.meta.url), 'utf8');
  assert.ok(rk.includes('{ranks[i] ?? \'—\'}'), 'мөрийн дугаар биш байр');
  assert.ok(rk.includes("tr('{0}/{1} бүс өгөгдөлтэй'"));
  assert.ok(rk.includes('zoneCsv(rows, mode, ind, indicators)'));
}

console.log('rankUtil.check: OK');
