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
import { pkgProgressOf } from './blockProgress.ts';

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
/* ⚠️ 2026-09-30: нөөц жин = `measured` (хэмжилтийн нүд) — энд давхардалгүй тул blocks − missing-тэй тэнцүү */
assert.equal(buildProgressOf(rows).pct, housingPct(rows.map((r) => ({
  pct: r.progress, cost: 0, blocks: r.measured,
}))));
assert.deepEqual(rows.map((r) => r.measured), rows.map((r) => r.blocks - r.missing));

/* Хуучин дүрмийн тоо ГАРАХГҮЙ: бүх блокоор бол (10+30+60+80)/6 = 30 */
assert.notEqual(buildProgressOf(rows).pct, 30, '2026-08-24-ний «бүх блокоор» дүрэм буцаж ирэв');

/* Бүгд тайлангүй → null */
const none = joinBagts([row('Багц 9', '1', 1)], new Map());
assert.equal(none[0].progress, null);
assert.equal(none[0].measured, 0);
assert.equal(buildProgressOf(none, cost).pct, null, 'хэмжилтгүй үед null байх ёстой');
assert.equal(buildProgressOf([]).pct, null);

/*
 * 5 — ⚠️ 2026-09-30: ДАВХАРДСАН feature ба FOOTPRINT-ГҮЙ хэмжилт (амьд өгөгдлийн
 *     хэлбэр — `blockProgress.check`: KNOWN_DUP «БАГЦ1|29/1», «БАГЦ2|5/6»;
 *     KNOWN_ORPHAN «БАГЦ1|29/3», «БАГЦ2|5/8»). Багцын хувь нь ХЭМЖИЛТИЙН нүдний
 *     дундаж (`pkgProgressOf`) — «Гүйцэтгэл»-ийн жагсаалт (`physLatest`) ба Тайлан
 *     §3 (`loadOverall`)-тай нэг. Урьд нь feature-ээр гүйлгэж давхардсаныг 2
 *     тоолж, footprint-гүйг хаядаг байсан тул Багц 1 · 2 дэлгэц бүрд өөр % гарав.
 */
{
  const blocks2 = [
    row('Багц 1', '29/1', 10), row('Багц 1', '29/1', 10), row('Багц 1', '29/2', 10),
    /* «29/3»-ийн footprint давхаргад «Багц 2» гэж бичигдсэн (OBJECTID 99) */
    row('Багц 2', '29/3', 10), row('Багц 2', '5/1', 10),
  ];
  const prog2 = new Map([
    [buildingKey('Багц 1', '29/1'), cell(90)],
    [buildingKey('Багц 1', '29/2'), cell(30)],
    [buildingKey('Багц 1', '29/3'), cell(60)],   /* footprint-гүй хэмжилт */
    [buildingKey('Багц 2', '5/1'), cell(40)],
  ]);
  const rows2 = joinBagts(blocks2, prog2);
  const b1 = rows2.find((r) => r.label === 'Багц 1');
  const b2 = rows2.find((r) => r.label === 'Багц 2');
  const m = pkgProgressOf(prog2);
  /* (90 + 30 + 60) / 3 = 60 — хуучин feature-ийн дүрмээр (90+90+30)/3 = 70 */
  assert.equal(b1.progress, 60, 'Багц 1: давхардсан feature 2 тоологдов эсвэл footprint-гүй хэмжилт хасагдав');
  assert.equal(b1.progress, m.get(b1.key).pct, 'joinBagts ≠ pkgProgressOf');
  assert.equal(b1.measured, 3, 'хуваарь = хэмжилтийн нүд (3), feature (3 = 2+1) БИШ');
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): давхардсан «29/1» полигон НЭГ блок — блок/айл/
     цувааны түлхүүр газрын зургийн давхардлаас хамаарахгүй (урьд нь 3 блок, 30 айл). */
  assert.equal(b1.blocks, 2, 'давхардсан feature хоёр тоологдов');
  assert.equal(b1.ail, 20, 'давхардсан feature-ийн айл хоёр тоологдов');
  assert.deepEqual(b1.keys, [buildingKey('Багц 1', '29/1'), buildingKey('Багц 1', '29/2')], 'цувааны түлхүүр давхардсан');
  assert.equal(b1.missing, 0);
  /* Багц 2: зөвхөн «5/1» хэмжигдсэн (40); «29/3» feature нь Багц 2-т тайлангүй */
  assert.equal(b2.progress, 40);
  assert.equal(b2.missing, 1, '«Багц 2 · 29/3» feature-д Багц 2-ын хэмжилт алга');
  assert.equal(b2.measured, 1);
  /* Нөөц жин (ХО алга) = хэмжилтийн нүд: (3·60 + 1·40) / 4 = 55 */
  assert.equal(buildProgressOf(rows2).pct, 55, 'нөөц жин measured-аар биш байна');
  /* ХО жинтэй: 100·60 + 300·40 ÷ 400 = 45 */
  assert.equal(buildProgressOf(rows2, new Map([[b1.key, 100], [b2.key, 300]])).pct, 45);
}

console.log('execData.check.mjs — БҮГД ТЭНЦЛЭЭ');
