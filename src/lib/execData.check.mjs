/**
 * БАГЦЫН МӨР (`joinBagts`) БА ОРОН СУУЦНЫ ГҮЙЦЭТГЭЛ (`buildProgressOf`) — цэвэр оролт.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/execData.check.mjs
 *
 * Хамгаалж буй алдаанууд (⚠️ 2026-09-30, хэрэглэгчийн шийдвэр — орон сууцны
 * гүйцэтгэл ХААНА Ч НЭГ томьёо):
 *   1. Багцын % БҮХ блокоор хуваагдаж тайлангүй блок 0% болох (2026-08-24-ний
 *      хуучин дүрэм). Одоо ЗӨВХӨН тайлагнасан блокийн дундаж — Bagts.buildPacks ·
 *      BuildingPanel · reportData.loadOverall (`actual`) · finPhys-тэй нэг.
 *   2. Нэг ч блок тайлагнаагүй багц 0% болох — `null` («—»), null ≠ 0.
 *   3. `buildProgressOf` нь `gdash.housingPct`-ээс ӨӨР тоо гаргах: ХО дүнгээр
 *      жигнэсэн, хэмжигдээгүй багц орохгүй; ХО огт алга бол тайлагнасан блокоор.
 *   4. `missing` (тайлан ирээгүй блок) алга болох — тоотой ХАМТ харагдах ёстой.
 */
import assert from 'node:assert/strict';
import { joinBagts, buildProgressOf } from './execData.ts';
import { housingPct } from './gdash.ts';
import { buildingKey } from './services.ts';

const row = (bagts, block, ail, comp = 'Гүйцэтгэгч') => ({ BAGTS: bagts, BLOK: block, AIL_TOO: ail, BAR_COMP: comp });
const cell = (overall) => ({ overall, date: '2026-09-01', phases: [] });

/* Багц 1: 3 блок — 2 тайлагнасан (10, 30), 1 тайлангүй.
   Багц 2: 2 блок — 2 тайлагнасан (60, 80).
   Багц 3: 1 блок — тайлангүй. */
const blocks = [
  row('Багц 1', '1', 10), row('Багц 1', '2', 20), row('Багц 1', '3', 30),
  row('Багц 2', '1', 40), row('Багц 2', '2', 50),
  row('Багц 3', '1', 5),
];
const prog = new Map([
  [buildingKey('Багц 1', '1'), cell(10)],
  [buildingKey('Багц 1', '2'), cell(30)],
  [buildingKey('Багц 2', '1'), cell(60)],
  [buildingKey('Багц 2', '2'), cell(80)],
]);

const rows = joinBagts(blocks, prog);
const by = (label) => rows.find((r) => r.label === label);

/* 1 · 2 — багцын % = тайлагнасан блокийн дундаж; тайлангүй → null */
assert.equal(by('Багц 1').progress, 20, 'Багц 1: (10+30)/2 — тайлангүй блок 0% гэж орж, 3-т хуваагдав');
assert.equal(by('Багц 1').missing, 1, 'тайлан ирээгүй блокийн тоо алга болов');
assert.equal(by('Багц 1').blocks, 3);
assert.equal(by('Багц 1').ail, 60);
assert.equal(by('Багц 2').progress, 70);
assert.equal(by('Багц 3').progress, null, 'нэг ч блок тайлагнаагүй багц 0% болов (null ≠ 0)');
assert.equal(by('Багц 3').missing, 1);

/* 3 — buildProgressOf ≡ gdash.housingPct (ХО дүнгээр) */
const cost = new Map([[by('Багц 1').key, 400], [by('Багц 2').key, 600], [by('Багц 3').key, 999]]);
const bp = buildProgressOf(rows, cost);
assert.equal(bp.pct, housingPct([
  { pct: 20, cost: 400, blocks: 2 }, { pct: 70, cost: 600, blocks: 2 }, { pct: null, cost: 999, blocks: 0 },
]), 'buildProgressOf нь gdash.housingPct-ээс өөр тоо гаргав');
assert.equal(bp.pct, 50, '400·20 + 600·70 ÷ 1000 = 50 — Багц 3 (хэмжигдээгүй) жинд орохгүй');
assert.equal(bp.blocks, 6);
assert.equal(bp.reported, 4);
assert.equal(bp.missing, 2, 'тайлангүй блок 2 (Багц 1-ийн нэг + Багц 3)');

/* ХО дүн огт алга → тайлагнасан блокийн тоогоор (2·20 + 2·70) / 4 = 45 */
assert.equal(buildProgressOf(rows).pct, 45, 'ХО-гүй үед нөөц жин = тайлагнасан блок');
assert.equal(buildProgressOf(rows).pct, housingPct(rows.map((r) => ({
  pct: r.progress, cost: 0, blocks: r.blocks - r.missing,
}))));

/* Хуучин дүрмийн тоо ГАРАХГҮЙ: бүх блокоор бол (10+30+60+80)/6 = 30 */
assert.notEqual(buildProgressOf(rows).pct, 30, '2026-08-24-ний «бүх блокоор» дүрэм буцаж ирэв');

/* Бүгд тайлангүй → null */
const none = joinBagts([row('Багц 9', '1', 1)], new Map());
assert.equal(none[0].progress, null);
assert.equal(buildProgressOf(none, cost).pct, null, 'хэмжилтгүй үед null байх ёстой');
assert.equal(buildProgressOf([]).pct, null);

console.log('execData.check.mjs — БҮГД ТЭНЦЛЭЭ');
