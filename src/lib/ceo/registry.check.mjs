/**
 * CEO САМБАРЫН БҮРТГЭЛ — бүтцийн шалгуур, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/registry.check.mjs
 *
 * ⚠️ `registry.ts`-ийг ИМПОРТЛОХГҮЙ, ТЕКСТЭЭР уншина: бүртгэл нь 13 ачаалагчийг
 * импортолдог бөгөөд тэдгээр нь `@/modules/Finance` (React + CSS модуль) руу
 * заадаг тул Node дээр ачаалагдахгүй. Бүтцийн шалгалтад текст хангалттай.
 *
 * Хамгаалж буй алдаанууд:
 *   1. ДАВХАРДСАН түлхүүр — хоёр карт нэг `key`-тэй бол React жагсаалт
 *      эвдэрч, нээх/хаах төлөв хоёуланд нь зэрэг нөлөөлнө.
 *   2. БАЙХГҮЙ харагдац — `view` нь `VIEWS`-д байхгүй бол «Харагдац руу орох»
 *      товч хоосон дэлгэц рүү хөтөлнө.
 *   3. АЧААЛАГЧ ФАЙЛ АЛГА — импортолсон `./<key>` файл байхгүй бол build унана
 *      (энэ шалгуур tsc-ээс хурдан, тайлбар нь тодорхой).
 *   4. Ачаалагчийн НЭР давхардах — хоёр карт нэг `load`-той бол нэг нь
 *      нөгөөгийнхөө тоог харуулна.
 *
 * ⚠️ Бүлгийн шалгуур ХАСАГДСАН (2026-09-06): сэдэвчилсэн бүлэг байхаа больж,
 * байрлалыг `schemMap.ts` (схемийн зангилаа) тодорхойлдог болсон. Тэр
 * зураглалыг `schemMap.check.mjs` шалгана.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync(new URL('./registry.ts', import.meta.url), 'utf8');
const services = readFileSync(new URL('../services.ts', import.meta.url), 'utf8');

/* ViewKey нэгдэл — services.ts-ээс */
const vkAt = services.indexOf('export type ViewKey');
assert.ok(vkAt > 0, 'ViewKey олдсонгүй');
const vkBlock = services.slice(vkAt, services.indexOf(';', vkAt));
const VIEW_KEYS = new Set([...vkBlock.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]));
assert.ok(VIEW_KEYS.size > 10, 'ViewKey уншигдсангүй');

/* Картууд */
const cards = [...src.matchAll(/\{\s*key:\s*'([^']+)',[^}]*?view:\s*'([^']+)',\s*load:\s*(\w+)/g)]
  .map((m) => ({ key: m[1], view: m[2], load: m[3] }));
assert.ok(cards.length >= 12, `карт хэт цөөн олдов (${cards.length}) — хэв шинж эвдэрсэн байж магадгүй`);

/* 1. давхардал */
const keys = cards.map((c) => c.key);
assert.equal(new Set(keys).size, keys.length, `давхардсан түлхүүр: ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`);

/* 2. харагдац */
for (const c of cards) assert.ok(VIEW_KEYS.has(c.view), `«${c.key}» нь байхгүй «${c.view}» харагдац заажээ`);

/* 3. ачаалагч файл ба импорт */
const imports = new Map([...src.matchAll(/import \{ (\w+) \} from '\.\/(\w+)';/g)].map((m) => [m[1], m[2]]));
for (const c of cards) {
  const file = imports.get(c.load);
  assert.ok(file, `«${c.key}»-ийн ачаалагч ${c.load} импортлогдоогүй`);
  assert.ok(existsSync(new URL(`./${file}.ts`, import.meta.url)), `«${c.key}»: src/lib/ceo/${file}.ts алга`);
}

/* 4. ачаалагчийн нэр давхардаагүй */
const loads = cards.map((c) => c.load);
assert.equal(new Set(loads).size, loads.length,
  `нэг ачаалагч хоёр картад: ${loads.filter((l, i) => loads.indexOf(l) !== i).join(', ')}`);

console.log(`ceo/registry.check.mjs — БҮГД ТЭНЦЛЭЭ (${cards.length} карт)`);
