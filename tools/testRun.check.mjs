/**
 * `tools/testRun.mjs` — шалгуур бүрийн ХУГАЦААНЫ ХЯЗГААР (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/testRun.check.mjs
 *
 * ⚠️ Гацсан (үүрд ажилладаг) скрипт хязгаарт АЛАГДАЖ, «⏱ ГАЦСАН» мессежтэй
 *    унасан гэж буцах ёстой — `npm test`/deploy-г түгжихгүй. Энгийн скриптийн
 *    гаралт · exit код өөрчлөгдөөгүй.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck, resolveTimeoutS, DEFAULT_TIMEOUT_S } from './testRun.mjs';

const dir = mkdtempSync(join(tmpdir(), 'selbe-testrun-'));
try {
  const hang = join(dir, 'hang.mjs');
  writeFileSync(hang, "console.log('эхэллээ'); setInterval(() => {}, 1000);\n");
  const okF = join(dir, 'ok.mjs');
  writeFileSync(okF, "console.log('сайн');\n");
  const bad = join(dir, 'bad.mjs');
  writeFileSync(bad, 'process.exit(3);\n');

  /* ── Гацсан скрипт → хязгаарт алагдана ── */
  const t0 = Date.now();
  const r = await runCheck(hang, { timeoutMs: 600 });
  assert.equal(r.timedOut, true, 'гацсан скрипт timeout болоогүй');
  assert.equal(r.code, 1);
  assert.match(r.out, /эхэллээ/, 'алагдахаас өмнөх гаралт алдагдав');
  assert.match(r.out, /ГАЦСАН/, 'ойлгомжтой мессеж алга');
  assert.ok(Date.now() - t0 < 10_000, 'хязгаараас хэт удаан');
  console.log('✅ гацсан шалгуур → алагдаж «⏱ ГАЦСАН» мессежтэй унана');

  /* ── Энгийн скрипт · exit код хэвээр ── */
  const o = await runCheck(okF, { timeoutMs: 10_000 });
  assert.equal(o.code, 0);
  assert.equal(o.timedOut, false);
  assert.match(o.out, /сайн/);
  const b = await runCheck(bad, { timeoutMs: 10_000 });
  assert.equal(b.code, 3);
  assert.equal(b.timedOut, false);
  console.log('✅ хэвийн скрипт: гаралт · exit код өөрчлөгдөөгүй');

  /* ── Хязгаар тодорхойлох: --timeout → env → анхдагч ── */
  assert.equal(resolveTimeoutS(['--timeout', '42'], {}), 42);
  assert.equal(resolveTimeoutS([], { TEST_TIMEOUT_S: '90' }), 90);
  assert.equal(resolveTimeoutS(['--timeout', '42'], { TEST_TIMEOUT_S: '90' }), 42, '--timeout давамгайлах ёстой');
  assert.equal(resolveTimeoutS([], {}), DEFAULT_TIMEOUT_S);
  assert.equal(resolveTimeoutS(['--timeout', '0'], {}), DEFAULT_TIMEOUT_S, '0 → хязгааргүй болж болохгүй');
  assert.equal(resolveTimeoutS(['--timeout', 'abc'], {}), DEFAULT_TIMEOUT_S);
  assert.equal(DEFAULT_TIMEOUT_S, 180);
  console.log('✅ хязгаар: --timeout > TEST_TIMEOUT_S > 180с; 0/буруу → анхдагч');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
