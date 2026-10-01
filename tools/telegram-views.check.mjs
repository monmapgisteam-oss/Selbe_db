/**
 * Telegram ботын «✅ Зөвшөөрөх» эрх — `VIEWS`-ээс, санхүүгүй (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/telegram-views.check.mjs
 *
 * ⚠️ Шинэ харагдац (ТУХ г.м.) автоматаар орох ёстой; санхүү (`pkgFin` · `finance`)
 *    ба `sensitive: true` датасетийн харагдац ХЭЗЭЭ Ч орохгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { botFullViews, FINANCE_VIEWS } from './telegram-views.mjs';

const { VIEWS } = await import('../src/lib/services/views.ts');
const { DATASETS } = await import('../src/lib/agent/datasets.ts');

const keys = VIEWS.map((v) => v.key);
const full = botFullViews(keys);

/* ── Шинэ санхүүгийн бус харагдацууд орсон ── */
for (const k of ['tuh', 'gdash', 'dedButets', 'chanar', 'qaqc', 'dashboard', 'pkgProg', 'guitsetgel', 'schem']) {
  assert.ok(full.includes(k), `${k} ботын эрхэд орсонгүй`);
}
/* Санхүүгийнх хасагдсан */
for (const k of FINANCE_VIEWS) assert.ok(!full.includes(k), `${k} (санхүү) эрхэд орсон`);
/* VIEWS-ийн бусад бүх түлхүүр орсон (гараар хоцрохгүй) */
assert.equal(full.length, keys.filter((k) => !FINANCE_VIEWS.has(k)).length);
console.log(`✅ ботын эрх: ${full.length} харагдац (ТУХ ч орсон) · санхүү хасагдсан`);

/* ── Эмзэг датасетийн харагдац ХЭЗЭЭ Ч орохгүй ── */
const sensitive = DATASETS.filter((d) => d.sensitive);
assert.ok(sensitive.length > 0, 'эмзэг датасет олдсонгүй — шалгуур утгагүй болно');
for (const d of sensitive) {
  assert.ok(!full.includes(d.view), `эмзэг датасет ${d.id} (view ${d.view}) ботын эрхэд нээгдэв — FINANCE_VIEWS-д нэм`);
}
console.log(`✅ ${sensitive.length} эмзэг датасет (${sensitive.map((d) => d.id).join(', ')}) хаалттай хэвээр`);

/* ── Давхардалгүй, дараалал хэвээр ── */
assert.deepEqual(botFullViews(['a', 'pkgFin', 'b', 'a', 'finance']), ['a', 'b']);

/* ── Бот гар жагсаалт биш, энэ функцийг ашиглана ── */
const bot = readFileSync(new URL('./telegram-bot.mjs', import.meta.url), 'utf8');
assert.match(bot, /const FULL_VIEWS = botFullViews\(VIEWS\.map\(\(v\) => v\.key\)\);/);
console.log('✅ telegram-bot.mjs нь VIEWS-ээс уншина');
