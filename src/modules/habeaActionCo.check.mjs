/**
 * ХАБЭА «Action» — компанийн нэр/код → «Компани» шүүлтүүрийн код (`HabeaAction.CO_RE`, 2026-11-09).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaActionCo.check.mjs
 *
 * Хамгаалж буй алдаа: үзлэгийн маягтын домэйн шошго («"Смарт крафт" ХХК», «"Эм Эм Эс Инженеринг" ХХК»,
 * «Нийслэлийн ОСНААУГ») ба код (`smart_craft` · `mms` · `osnaaug`) таарахгүй тул «Компани» шүүлтүүрт 0 гарч байв.
 * TSX-ийг node ачаалж чадахгүй тул `CO_RE` массивыг эх кодоос тасдаж үнэлнэ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./HabeaAction.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const m = /const CO_RE: \[RegExp, string\]\[\] = (\[[\s\S]*?\n\]);/.exec(src);
assert.ok(m, 'CO_RE олдсонгүй');
const CO_RE = new Function(`return ${m[1]};`)();
const coSfxOf = (name) => CO_RE.find(([re]) => re.test(name))?.[1] ?? '';

/* Шинэ: маягтын шошго ба код */
for (const [name, code] of [
  ['"Смарт крафт" ХХК', 'SC'], ['smart_craft', 'SC'], ['Smart Craft LLC', 'SC'],
  ['"Эм Эм Эс Инженеринг" ХХК', 'MMSE'], ['mms', 'MMSE'], ['ММСЕ ХХК', 'MMSE'], ['MMSE', 'MMSE'],
  ['Нийслэлийн ОСНААУГ', 'OSNAAG'], ['osnaaug', 'OSNAAG'], ['ОСНААГ', 'OSNAAG'],
]) assert.equal(coSfxOf(name), code, name);

/* Хуучин таарц хэвээр */
for (const [name, code] of [
  ['"Хятадын 2 дахь металлурги груп корпорац" ХХК', 'HHDMGK'],
  ['Хятадын барилгын 6-р инженерийн товчоо', 'HBZIT'],
  ['Хятадын барилгын 5-р инженерийн товчоо', 'HBTIT'],
  ['"Морин сувд" ХХК', 'MSK'], ['"Нутгийн буян" групп', 'NBG'], ['Монкон', 'MK'], ['Професионал строй', 'P'],
]) assert.equal(coSfxOf(name), code, name);

/* `mms` нь бүтэн үгээр л — өөр нэрийн дотор санамсаргүй таарахгүй */
assert.equal(coSfxOf('commsnet'), '');
assert.equal(coSfxOf(''), '');
console.log('habeaActionCo.check: OK');
