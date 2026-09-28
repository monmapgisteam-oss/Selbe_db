/**
 * ЧАНАРЫН БАРИМТЫН ЗАГВАРУУДЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chanarTemplates.check.mjs
 *
 * Хамгаалж буй зүйл (2026-09-28, `docs/chanar`):
 *   1. MIR 2 загвар: Багц 1 (8 мөр) · Багц 6.2 (7 мөр); FIC 3 загвар: бетон 29 (8+3+9+3+6),
 *      худаг 13, цахилгаан 10; загвар бүрд хавсралтын олонлог, худагт «Гүйцэтгэл» үгүй.
 *   2. MS ажлын төрөл 32, «шаардана» 25 — id тогтмол w01…w32; 2026-09-28 тулгалтаар
 *      «үгүй» = w04·w07·w08·w09·w10·w11·w14; 6 бүлгийн нийлбэр 25.
 *   4. MA 6 ангилал, шаардлагатай тоо 126.
 *   3. Загварын мөр `InspItem`-ийн бүх талбартай, `no` дараалсан.
 */
import assert from 'node:assert/strict';
import {
  mirTemplate, mirTemplate62, mirTemplates, ficTemplates, ficTemplateTitle, inspTemplates, inspTemplateOf, FIC_TEMPLATE_KEYS, MIR_TEMPLATE_KEYS,
  msWorkTypes, msRequiredIds, msWorkTypeName, msRequiredProgress, MS_GROUPS,
  MA_CATEGORIES, MA_REQUIRED, maCategoryLabel, isMaCategory,
} from './chanarTemplates.ts';

const checkItems = (items, name) => {
  items.forEach((it, i) => {
    assert.equal(it.no, i + 1, `${name}: no дараалсан биш (${i})`);
    assert.ok(it.text.trim(), `${name}: ${i + 1}-р мөр хоосон`);
    assert.equal(it.contractor, null); assert.equal(it.client, null); assert.equal(it.comment, '');
    assert.ok('section' in it);
  });
  assert.equal(new Set(items.map((i) => i.text)).size, items.length, `${name}: мөр давхардав`);
};

/* ══ 1. MIR ══ */
{
  const m = mirTemplate();
  assert.equal(m.length, 8, 'MIR 8 мөр');
  checkItems(m, 'MIR');
  assert.equal(m[0].text, 'Зураг төсөлтэй таарч буй эсэх');
  assert.equal(m[7].text, 'Гэмтэлгүй эсэх');
  assert.equal(inspTemplates('MIR').length, 2, '2026-09-28: MIR 2 загвар');
  assert.equal(inspTemplates('MIR')[0].items.length, 8);
  assert.deepEqual(mirTemplates().map((t) => t.key), [...MIR_TEMPLATE_KEYS]);
  const m62 = mirTemplate62();
  assert.equal(m62.length, 7, 'Багц 6.2: 7 мөр');
  checkItems(m62, 'MIR-6.2');
  assert.equal(m62[0].text, 'Гэмтэлгүй эсэх', 'өөр дараалал — гэмтэл эхэнд');
  assert.equal(m62[6].text, 'Батлагдсан материал баталгаажуулалтын дагуу эсэх', '7-р мөр MA иш');
  for (const t of mirTemplates()) { assert.deepEqual(t.attachments, ['labTest', 'qualityCert', 'photo', 'other']); assert.equal(t.hasQuantity, true); }
  assert.equal(inspTemplateOf('MIR', 'mir62').items.length, 7);
  assert.equal(inspTemplateOf('MIR', '').key, 'mir1', 'хоосон түлхүүр (хуучин мөр) → эхний загвар');
  assert.equal(inspTemplateOf('FIC', 'zoo').key, 'concrete');
}

/* ══ 2. FIC ══ */
{
  const f = ficTemplates();
  assert.equal(f.length, 3, 'FIC 3 загвар');
  assert.deepEqual(f.map((t) => t.key), [...FIC_TEMPLATE_KEYS]);
  const by = Object.fromEntries(f.map((t) => [t.key, t]));
  assert.equal(by.concrete.items.length, 29, 'бетон: 8+3+9+3 + арчилгаа 6 = 29');
  assert.equal(by.manhole.items.length, 13, 'худаг 13');
  assert.equal(by.electrical.items.length, 10, 'цахилгаан 10');
  for (const t of f) checkItems(t.items, t.key);
  assert.equal(by.concrete.title, 'Бетон цутгалтын дараах үзлэг');
  assert.equal(by.manhole.title, 'Худаг угсралт');
  assert.equal(by.electrical.title, 'Цахилгаан холбоо дохиолол');
  assert.equal(ficTemplateTitle('manhole'), 'Худаг угсралт');
  /* Бүлгүүд — маягтын гарчиг */
  const sections = [...new Set(by.concrete.items.map((i) => i.section))];
  assert.deepEqual(sections, ['ТӨМӨР БЕТОН ХИЙЦЛЭЛ', 'ХЭВ ХАШМАЛ', 'БАРИМТ БИЧИГ /далд хийцийн ажил/', 'НЭМЭЛТ АЖЛУУД', 'АРЧИЛГАА ХИЙСЭН МЭДЭЭЛЭЛ']);
  assert.equal(by.concrete.items.filter((i) => i.section === 'АРЧИЛГАА ХИЙСЭН МЭДЭЭЛЭЛ').length, 6);
  assert.equal(by.manhole.items[0].section, 'ҮЗЛЭГ БА МЕХАНИК ШАЛГАЛТ');
  assert.equal(by.electrical.items[0].section, null);
  assert.equal(by.manhole.items[12].text, 'Үйлдвэрлэгчийн мэдээлэл бүрэн');
  assert.equal(inspTemplates('FIC').length, 3);
  /* 2026-09-28: хавсралтын олонлог, худагт «Гүйцэтгэл» үгүй */
  assert.deepEqual(by.concrete.attachments, ['survey', 'cubes', 'photo', 'other']);
  assert.deepEqual(by.electrical.attachments, ['survey', 'photo', 'other'], 'цахилгаанд бетон шоо үгүй');
  assert.deepEqual(by.manhole.attachments, ['other']);
  assert.equal(by.manhole.hasQuantity, false, 'худаг FIC-д «Гүйцэтгэл» хэсэг үгүй');
  assert.equal(by.concrete.hasQuantity, true);
  /* Загвар нь дуудалт бүрд ШИНЭ объект — зохиогч засварлахад бусдад нөлөөлөхгүй */
  const a = ficTemplates()[0].items; a[0].contractor = 'OK';
  assert.equal(ficTemplates()[0].items[0].contractor, null);
}

/* ══ 3. MS ажлын төрөл ══ */
{
  const w = msWorkTypes();
  assert.equal(w.length, 32, '32 ажлын төрөл');
  assert.equal(w.filter((x) => x.required).length, 25, '⚠️ «шаардана» 25');
  assert.equal(msRequiredIds().length, 25);
  assert.deepEqual(w.map((x) => x.id), w.map((_, i) => `w${String(i + 1).padStart(2, '0')}`), 'id тогтмол');
  assert.equal(new Set(w.map((x) => x.name)).size, 32, 'нэр давхардав');
  /* «үгүй» 7 — PDF-ийн дагуу (2026-09-28 тулгалт: w06·w12·w13·w18 «шаардана» болсон) */
  const no = w.filter((x) => !x.required).map((x) => x.id);
  assert.deepEqual(no, ['w04', 'w07', 'w08', 'w09', 'w10', 'w11', 'w14']);
  for (const id of ['w06', 'w12', 'w13', 'w18']) assert.ok(w.find((x) => x.id === id).required, `${id} шаардана`);
  /* Бүлэг — 6, шаардлагатай 25-ын нийлбэр таарна */
  const byG = Object.fromEntries(MS_GROUPS.map((g) => [g, w.filter((x) => x.required && x.group === g).length]));
  assert.deepEqual(byG, { bua: 8, gadnaTsahilgaan: 4, hd: 3, has: 3, gadnaShugam: 4, uzel: 3 }, 'бүлгийн тоо');
  assert.ok(w.every((x) => MS_GROUPS.includes(x.group)), 'бүх төрөл бүлэгтэй');
  assert.equal(w[0].name, 'Газар шорооны ажил');
  assert.equal(w[31].name, 'Өндөржилтийн ажил');
  assert.equal(msWorkTypeName('w04'), 'Өрлөгийн ажил');
  assert.equal(msWorkTypeName('zoo'), 'zoo');
  assert.equal(msWorkTypeName(null), '');
  /* Хураангуй */
  const p = msRequiredProgress([
    { status: 'Батлагдсан', workType: 'w01' }, { status: 'Батлагдсан', workType: 'w01' },
    { status: 'Батлагдсан', workType: 'w04' }, { status: 'Хянагдаж байна', workType: 'w02' },
    { status: 'Батлагдсан', workType: null }, { status: 'Ноорог', workType: 'w03' },
  ], 'Батлагдсан', 'Ноорог');
  assert.equal(p.total, 25); assert.equal(p.approved, 1, 'w01 л (w04 шаардлагагүй, w02 батлагдаагүй)');
  assert.equal(p.missing.length, 24); assert.ok(p.missing.includes('w02'));
  assert.equal(p.submitted, 2, '2026-09-28: ирүүлсэн = w01 + w02 (ноорог w03 үгүй, w04 шаардлагагүй)');
  assert.deepEqual(p.byGroup.bua, { submitted: 2, approved: 1, total: 8, missing: ['w02', 'w03', 'w05', 'w06', 'w12', 'w13', 'w32'] });
  assert.equal(Object.values(p.byGroup).reduce((s, g) => s + g.total, 0), 25, 'бүлгийн нийлбэр = 25');
}

/* ══ 4. MA ангилал ══ */
{
  assert.equal(MA_CATEGORIES.length, 6);
  assert.equal(Object.values(MA_REQUIRED).reduce((a, b) => a + b, 0), 126, 'бүртгэлийн 126 материал');
  assert.equal(maCategoryLabel('hd'), 'Гадна, дотор ХД'); assert.equal(maCategoryLabel('зоо'), 'зоо');
  assert.ok(isMaCategory('uzel')); assert.ok(!isMaCategory('zoo'));
}

console.log('chanarTemplates.check ✓');
