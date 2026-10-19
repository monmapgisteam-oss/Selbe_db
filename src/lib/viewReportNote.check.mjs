/**
 * «ТАЙЛАН ТАТАХ» — тайрсан/виртуал хүснэгтийн ТЭМДЭГЛЭЛ (⚠️ 2026-10-19, цэвэр).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/viewReportNote.check.mjs
 * Хамгаалах алдаа: `MAX_TABLE_ROWS`-оор тайрсан эсвэл виртуал хүснэгтийн зөвхөн дэлгэцийн мөрүүдийг авсан
 * тайлан БҮТЭН мэт харагддаг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableNote } from './viewReport.ts';

assert.equal(tableNote(10, null, false), null, 'бүтэн хүснэгт — тэмдэглэлгүй');
assert.equal(tableNote(10, 10, false), null, 'нийт = орсон — тэмдэглэлгүй');
assert.match(tableNote(40, 1400, false), /харагдаж буй мөрүүд \(40 \/ нийт 1,400\)/, 'виртуал хүснэгт');
assert.match(tableNote(1500, 2300, true), /2,300 мөрөөс эхний 1,500/, 'хязгаараар тайрсан, нийт мэдэгдэх');
assert.match(tableNote(1500, null, true), /эхний 1,500 мөр/, 'хязгаараар тайрсан, нийт мэдэгдэхгүй');
const fill = readFileSync(new URL('../modules/sheet/FillNew.tsx', import.meta.url), 'utf8');
assert.ok(fill.includes('data-rep-total={vis.length}'), 'бөглөх хуудасны виртуал хүснэгт нийт мөрөө зарлана');
/* ⚠️ 2026-10-19: `aria-rowcount` толгойг тоолдог — уншихгүй; `capped` нь хязгаараас цааш мөр үлдсэн үед л */
const vr = readFileSync(new URL('./viewReport.ts', import.meta.url), 'utf8');
assert.ok(!vr.includes("getAttribute('aria-rowcount')"), 'aria-rowcount-ыг нийт тоо гэж уншихгүй');
assert.ok(!/push\(cells\);\s*if \(rows\.length >= MAX_TABLE_ROWS\)/.test(vr), 'яг хязгаар дээр capped болохгүй (push-ийн ӨМНӨ шалгана)');
console.log('✅ viewReport — тайрсан/виртуал хүснэгтийн тэмдэглэл');
