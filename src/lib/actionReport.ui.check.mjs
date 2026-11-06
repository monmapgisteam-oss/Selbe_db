/**
 * ҮЛ НИЙЦЛИЙН ТАЙЛАН — нэгтгэл (2026-11-06): нээлттэй боловч дуусах хугацаагүй мөрийг ил тоолно.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/actionReport.ui.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from './audienceReport.fixture.mjs';

installDom();
const { summarize } = await import('./actionReport.ts');

const now = Date.UTC(2026, 10, 6);
const row = (status, due) => ({ status, due, sevCode: null });
const s = summarize([row(1, null), row(1, null), row(1, now - 1), row(1, now + 1), row(null, null)], now);
assert.equal(s.open, 4);
assert.equal(s.overdue, 1, 'хугацаатай, өнгөрсөн л');
assert.equal(s.noDue, 2, 'хугацаагүй нээлттэй — хугацаа хэтэрсэн эсэх нь дүгнэгдэхгүй');
assert.equal(s.unknown, 1);

const src = readFileSync(new URL('./actionReport.ts', import.meta.url), 'utf8');
assert.match(src, /tile\('Дуусах хугацаагүй', String\(s\.noDue\)/, 'PDF-ийн нүд');
assert.match(readFileSync(new URL('../modules/ActionExport.tsx', import.meta.url), 'utf8'), /num\(sum\.noDue\)/, 'цонхны тойм');
console.log('✅ actionReport.ui.check: OK');
