/**
 * СЕРВЕРИЙН ЦАГ — `serverClock.ts` (2026-10-21, аудит №2).
 *
 * ⚠️ Сүлжээгүй: цэвэр томьёонууд (`clockOffsetOf` · `clockOffsetOk`) ба эх кодын дүрэм —
 *    Enterprise хаягт `outStatistics` max(CURRENT_TIMESTAMP)-ийг оролддоггүй (тэнд үргэлж 500),
 *    хоёр `syncServerClock` (энд ба `huvaariBatlah`) 15 мин-ээс их зөрүүг хүлээн авдаггүй.
 *    Хэмжилт өөрөө (`measureServerTime`) `query.arcgisPost`-оор явдаг тул амьд шалгуурт.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clockOffsetOf, clockOffsetOk, MAX_CLOCK_OFF, serverNow } from '@/lib/serverClock.ts';

/* ── Томьёо: сервер − хүсэлтийн хоёр үзүүрийн дундаж ── */
assert.equal(clockOffsetOf(1000, 0, 200), 900);
assert.equal(clockOffsetOf(0, 100, 300), -200);
assert.equal(clockOffsetOf(10, 1, 2), 9, 'бүхэл рүү тоймлоно');

/* ── ⚠️ 2026-10-21 (аудит №2): |зөрүү| > 15 мин хүлээн авахгүй ── */
assert.equal(MAX_CLOCK_OFF, 15 * 60_000);
assert.ok(clockOffsetOk(0));
assert.ok(clockOffsetOk(28_834), '~29 с (Enterprise-д хэмжсэн бодит зөрүү) хүлээн авна');
assert.ok(clockOffsetOk(MAX_CLOCK_OFF), 'яг 15 мин хүлээн авна');
assert.ok(clockOffsetOk(-MAX_CLOCK_OFF));
assert.ok(!clockOffsetOk(MAX_CLOCK_OFF + 1), '15 мин + 1 мс хүлээн авахгүй');
assert.ok(!clockOffsetOk(-MAX_CLOCK_OFF - 1));
assert.ok(!clockOffsetOk(8 * 3600_000), 'цагийн бүсийн зөрүү (8 ц) хүлээн авахгүй');
assert.ok(!clockOffsetOk(Number.NaN));
assert.ok(!clockOffsetOk(Number.POSITIVE_INFINITY));

/* ── Синк хийгдээгүй (Node) — `serverNow` = `Date.now()` ── */
{
  const a = Date.now();
  const s = serverNow();
  assert.ok(Math.abs(s - a) < 1000, 'синкгүй үед хөтчийн цаг');
}

/* ── Эх кодын дүрэм ── */
{
  const src = readFileSync('src/lib/serverClock.ts', 'utf8');
  const meas = src.slice(src.indexOf('export async function measureServerTime('), src.indexOf('export async function syncServerClock('));
  /* ⚠️ 2026-10-26: хаяг ҮРГЭЛЖ Enterprise-ийн бодит хаяг (хуучин `entMap.remapUrl` хасагдсан) */
  assert.ok(/const ent = base\.startsWith\(`\$\{ENT_HOSTED\}\/`\);/.test(meas), 'measureServerTime: Enterprise хаягийг танихгүй');
  assert.ok(/if \(!ent\) \{\s*try \{[\s\S]*?onStatisticField: 'CURRENT_TIMESTAMP'/.test(meas), 'measureServerTime: Enterprise-д outStatistics замыг алгасахгүй');
  assert.ok(/returnCountOnly: 'true'/.test(meas), 'measureServerTime: хоёртын хайлт алга');
  const sync = src.slice(src.indexOf('export async function syncServerClock('));
  assert.ok(/const off = clockOffsetOf\(m\.srv, m\.t0, m\.t1\);\s*(\/\*[\s\S]*?\*\/\s*)?if \(!clockOffsetOk\(off\)\) \{ warnClockOff\(off\); clockAt = m\.t1; return; \}/.test(sync), 'serverClock.syncServerClock: 15 мин хязгаар алга');
  const hb = readFileSync('src/lib/huvaariBatlah.ts', 'utf8');
  const hsync = hb.slice(hb.indexOf('export async function syncServerClock('));
  assert.ok(/if \(!clockOffsetOk\(off\)\) \{ warnClockOff\(off\); clockAt = m\.t1; return; \}/.test(hsync), 'huvaariBatlah.syncServerClock: 15 мин хязгаар алга');
  assert.ok(/measureServerTime, clockOffsetOk, warnClockOff \} = await import\('\.\/serverClock'\)/.test(hsync), 'huvaariBatlah: serverClock-ийн нэг дүрмээр биш');
}

console.log('serverClock.check: ok');
