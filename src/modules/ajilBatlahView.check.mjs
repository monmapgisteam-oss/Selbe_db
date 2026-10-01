/**
 * «НЭМЭЛТ АЖИЛ БАТЛАХ» ХАРАГДАЦ — батлагчид харагдах тоо (эх кодын шалгуур, offline).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/ajilBatlahView.check.mjs
 *
 * Хамгаалж буй алдаа (2026-09-30): нэмэлт мөрийн обьём ба нэгжийн үнийг `num(v)`
 *   (анхдагч 0 бутархай орон)-оор харуулдаг тул 0.4 м³ → «0», 142.96 → «143» гэж
 *   батлагчид БУРУУ тоо харагдаж, тэр тоогоор батлах шийдвэр гардаг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AjilBatlah.tsx', import.meta.url), 'utf8');

assert.ok(!/num\(a\.vol\)/.test(SRC), '⚠️ обьёмыг 0 оронтой `num`-ээр харуулахгүй');
assert.ok(!/num\(a\.unit\)/.test(SRC), '⚠️ нэгжийн үнийг 0 оронтой `num`-ээр харуулахгүй');
assert.ok(/num3\(a\.vol\)/.test(SRC) && /num3\(a\.unit\)/.test(SRC), 'обьём · нэгжийн үнэ `num3`-аар');

/* `num3`-ын томъёо — бөглөх хуудасны `qty`-тэй ижил (≤3 орон, илүү тэггүй) */
const m = /const num3 = \(v: number\): string => \((.+)\);/.exec(SRC);
assert.ok(m, '`num3` тодорхойлолт олдсонгүй');
assert.ok(m[1].includes("Number(v.toFixed(3)).toLocaleString('en-US')"), '`num3` нь 3 орон хүртэл хадгална');
const num3 = (v) => (Number.isFinite(v) ? Number(v.toFixed(3)).toLocaleString('en-US') : '—');
assert.equal(num3(0.4), '0.4');
assert.equal(num3(142.96), '142.96');
assert.equal(num3(1234.5), '1,234.5');
assert.equal(num3(0.12345), '0.123');

console.log('✅ ajilBatlahView: обьём · нэгжийн үнэ бутархайгаа хадгална');
