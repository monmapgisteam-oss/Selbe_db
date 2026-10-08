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
 *
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): 1 ба 2 БУЦСАН — хуваарь нь бөглөх хуудасны
 *    БҮХ блок (`universe`), тайлагнаагүй блок 0%; нэг ч блок тайлагнаагүй багц 0%
 *    (`null` нь зөвхөн хуваарьгүй — бөглөх хуудас уншигдаагүй багц). 3-ын «хэмжигдээгүй
 *    багц орохгүй» ч мөн адил: тайлагнаагүй багц 0%-иар жинд орно; ХО огт алга бол
 *    нөөц жин нь багцын бүх блок (`total`). Доорх хүлээгдэж буй утгууд шинэ дүрмээр.
 */
import assert from 'node:assert/strict';
import { joinBagts, buildProgressOf, ailTotal } from './execData.ts';
import { housingPct } from './gdash.ts';
import { buildingKey } from './services.ts';
import { pkgProgressOf } from './blockProgress.ts';

const row = (bagts, block, ail, comp = 'Гүйцэтгэгч') => ({ BAGTS: bagts, BLOK: block, AIL_TOO: ail, BAR_COMP: comp });
const cell = (overall) => ({ overall, date: '2026-09-01', phases: [] });
/** Бөглөх хуудасны блокийн хуваарь — `blockProgress.BlockUniverse` (`bagtsKey` → `buildingKey`[]) */
const uniOf = (obj) => new Map(Object.entries(obj).map(([g, bs]) => [
  buildingKey(g, '').split('|')[0], bs.map((b) => buildingKey(g, b)),
]));
const near = (a, b, msg) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${msg ?? ''} (${a} ≠ ${b})`);

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
const uni = uniOf({ 'Багц 1': ['1', '2', '3'], 'Багц 2': ['1', '2'], 'Багц 3': ['1'] });

const rows = joinBagts(blocks, prog, uni);
const by = (label) => rows.find((r) => r.label === label);

/* 1 · 2 — ⚠️ 2026-10-01: багцын % = БҮХ блокийн дундаж (тайлангүй 0%); огт тайлагнаагүй → 0 */
near(by('Багц 1').progress, 40 / 3, 'Багц 1: (10+30+0)/3 — тайлангүй блок хуваарьт орох ёстой (урьд нь /2 = 20)');
assert.equal(by('Багц 1').missing, 1, 'тайлан ирээгүй блокийн тоо алга болов');
assert.equal(by('Багц 1').blocks, 3);
assert.equal(by('Багц 1').ail, 60);
assert.equal(by('Багц 2').progress, 70);
assert.equal(by('Багц 3').progress, 0, '⚠️ 2026-10-01: нэг ч блок тайлагнаагүй багц 0% (урьд нь null)');
assert.equal(by('Багц 3').missing, 1);

/* 3 — buildProgressOf ≡ gdash.housingPct (ХО дүнгээр) */
const cost = new Map([[by('Багц 1').key, 400], [by('Багц 2').key, 600], [by('Багц 3').key, 999]]);
const bp = buildProgressOf(rows, cost);
assert.equal(bp.pct, housingPct([
  { pct: by('Багц 1').progress, cost: 400, blocks: 3 }, { pct: 70, cost: 600, blocks: 2 }, { pct: 0, cost: 999, blocks: 1 },
]), 'buildProgressOf нь gdash.housingPct-ээс өөр тоо гаргав');
/* ⚠️ 2026-10-01: Багц 3 (тайлагнаагүй) 0%-иар жинд ОРНО — урьд нь хасагдаж 50 гардаг байв */
near(bp.pct, (400 * 40 / 3 + 600 * 70) / 1999, '400·13.3 + 600·70 + 999·0 ÷ 1999');
assert.equal(bp.blocks, 6);
assert.equal(bp.reported, 4);
assert.equal(bp.missing, 2, 'тайлангүй блок 2 (Багц 1-ийн нэг + Багц 3)');

/* ХО дүн огт алга → блокийн хуваариар (3·13.3 + 2·70 + 1·0) / 6 = 30.
   ⚠️ 2026-10-01: нөөц жин = `total` (бүх блок) — урьд нь `measured` (45 гардаг байв).
   Энэ нь бүх блокийн энгийн дундаж (10+30+60+80)/6 = 30-тай ЯГ тэнцүү — хэрэглэгчийн шийдвэр
   (урьдын «30 гарах ёсгүй» шалгуур ХҮЧИНГҮЙ). */
near(buildProgressOf(rows).pct, 30, 'ХО-гүй үед нөөц жин = багцын бүх блок');
assert.equal(buildProgressOf(rows).pct, housingPct(rows.map((r) => ({
  pct: r.progress, cost: 0, blocks: r.total,
}))));
assert.deepEqual(rows.map((r) => r.measured), [2, 2, 0]);
assert.deepEqual(rows.map((r) => r.total), [3, 2, 1]);

/* Огт тайлагнаагүй, хуваарьтай багц → 0% (⚠️ 2026-10-01; урьд нь null) */
const none = joinBagts([row('Багц 9', '1', 1)], new Map(), uniOf({ 'Багц 9': ['1'] }));
assert.equal(none[0].progress, 0);
assert.equal(none[0].measured, 0);
assert.equal(none[0].missing, 1);
assert.equal(buildProgressOf(none, cost).pct, 0, 'тайлагнаагүй багц 0% (ХО жингүй бол блокоор)');
/* Хуваарьгүй (бөглөх хуудас уншигдаагүй) багц → null, 0 БИШ */
const lost = joinBagts([row('Багц 9', '1', 1)], new Map(), new Map());
assert.equal(lost[0].progress, null, 'хуваарьгүй багц 0% болов — ачаалалтын алдаа 0 гэж харагдана');
assert.equal(buildProgressOf(lost, cost).pct, null, 'хэмжилт ба хуваарьгүй үед null байх ёстой');
assert.equal(buildProgressOf([]).pct, null);

/* ⚠️ 2026-10-01 РЕГРЕСС: 4 блоктой багцын зөвхөн A нь 100% → 25% (100% БИШ) */
{
  const r4 = joinBagts(
    [row('Багц 4', 'A', 1), row('Багц 4', 'B', 1), row('Багц 4', 'C', 1), row('Багц 4', 'D', 1)],
    new Map([[buildingKey('Багц 4', 'A'), cell(100)]]),
    uniOf({ 'Багц 4': ['A', 'B', 'C', 'D'] }),
  );
  assert.equal(r4[0].progress, 25, '4 блокийн 1 нь 100% → 25%');
  assert.equal(r4[0].missing, 3);
  assert.equal(buildProgressOf(r4).pct, 25);
}

/*
 * 5 — ⚠️ 2026-09-30: ДАВХАРДСАН feature ба FOOTPRINT-ГҮЙ хэмжилт (амьд өгөгдлийн
 *     хэлбэр — `blockProgress.check`: KNOWN_DUP «БАГЦ1|29/1», «БАГЦ2|5/6»;
 *     KNOWN_ORPHAN «БАГЦ1|29/3», «БАГЦ2|5/8»). Багцын хувь нь ХЭМЖИЛТИЙН нүдний
 *     дундаж (`pkgProgressOf`) — «Гүйцэтгэл»-ийн жагсаалт (`physLatest`) ба Тайлан
 *     §3 (`loadOverall`)-тай нэг. Урьд нь feature-ээр гүйлгэж давхардсаныг 2
 *     тоолж, footprint-гүйг хаядаг байсан тул Багц 1 · 2 дэлгэц бүрд өөр % гарав.
 *     ⚠️ 2026-10-01: хуваарь нь БӨГЛӨХ ХУУДАСНЫ блок — газрын зургийн feature БИШ.
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
  const uni2 = uniOf({ 'Багц 1': ['29/1', '29/2', '29/3'], 'Багц 2': ['5/1', '5/2'] });
  const rows2 = joinBagts(blocks2, prog2, uni2);
  const b1 = rows2.find((r) => r.label === 'Багц 1');
  const b2 = rows2.find((r) => r.label === 'Багц 2');
  const m = pkgProgressOf(prog2, uni2);
  /* (90 + 30 + 60) / 3 = 60 — хуучин feature-ийн дүрмээр (90+90+30)/3 = 70 */
  assert.equal(b1.progress, 60, 'Багц 1: давхардсан feature 2 тоологдов эсвэл footprint-гүй хэмжилт хасагдав');
  assert.equal(b1.progress, m.get(b1.key).pct, 'joinBagts ≠ pkgProgressOf');
  assert.equal(b1.measured, 3, 'хэмжилтийн нүд (3), feature (3 = 2+1) БИШ');
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): давхардсан «29/1» полигон НЭГ блок — блок/айл
     газрын зургийн давхардлаас хамаарахгүй (урьд нь 3 блок, 30 айл). */
  /* ⚠️ 2026-10-04: блокийн тоо = бөглөх хуудасны хуваарь (29/1 · 29/2 · 29/3 = 3) — feature
     (давхардлыг хаясан 2) БИШ; footprint-гүй 29/3 тоологдоно. */
  assert.equal(b1.blocks, 3, 'блокийн тоо бөглөх хуудасны хуваариас биш');
  assert.equal(b1.blocks, b1.total, 'blocks ≠ total (хоёр ертөнц холилдов)');
  assert.equal(b1.ail, 20, 'давхардсан feature-ийн айл хоёр тоологдов');
  /* ⚠️ 2026-10-01: цувааны түлхүүр = бөглөх хуудасны хуваарь (footprint-гүй 29/3 ОРНО) */
  assert.deepEqual(b1.keys, ['29/1', '29/2', '29/3'].map((b) => buildingKey('Багц 1', b)), 'цувааны түлхүүр хуваариас биш');
  assert.equal(b1.missing, 0);
  /* Багц 2: хуваарь 5/1, 5/2 — зөвхөн «5/1» хэмжигдсэн → (40 + 0) / 2 = 20.
     ⚠️ 2026-10-01: урьд нь 40 (хэмжигдсэн блок л); «29/3» feature (буруу багцын нэр) хуваарьт орохгүй */
  assert.equal(b2.progress, 20);
  assert.equal(b2.missing, 1, '«Багц 2 · 5/2» тайлангүй');
  assert.equal(b2.measured, 1);
  assert.equal(b2.total, 2);
  /* Нөөц жин (ХО алга) = хуваарь: (3·60 + 2·20) / 5 = 44 (урьд нь measured-аар 55) */
  assert.equal(buildProgressOf(rows2).pct, 44, 'нөөц жин total-аар биш байна');
  /* ХО жинтэй: 100·60 + 300·20 ÷ 400 = 30 (урьд нь 45) */
  assert.equal(buildProgressOf(rows2, new Map([[b1.key, 100], [b2.key, 300]])).pct, 30);
}

/* ⚠️ 2026-10-09: хоосон `AIL_TOO` нь 0 өрх БИШ — `ailMissing`, нийт нь `ailTotal` (null ≠ 0) */
{
  const u = uniOf({ 'Багц 1': ['1', '2'], 'Багц 2': ['1'] });
  const rs = joinBagts([row('Багц 1', '1', 10), row('Багц 1', '2', null), row('Багц 2', '1', '')], new Map(), u);
  const b1 = rs.find((x) => x.label === 'Багц 1');
  assert.equal(b1.ail, 10);
  assert.equal(b1.ailMissing, 1, 'хоосон AIL_TOO тоологдсонгүй');
  const t = ailTotal(rs);
  assert.equal(t.ail, 10);
  assert.equal(t.partial, true, 'дутуу өрхийн нийлбэр «бүрэн» гэж гарав');
  const none = ailTotal(joinBagts([row('Багц 1', '1', null)], new Map(), uniOf({ 'Багц 1': ['1'] })));
  assert.equal(none.ail, null, 'бүх AIL_TOO хоосон — 0 биш null');
  assert.equal(ailTotal(rows).partial, false);
  assert.equal(ailTotal(rows).ail, 155);
}

console.log('execData.check.mjs — БҮГД ТЭНЦЛЭЭ');
