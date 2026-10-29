/**
 * СЕРВЕРИЙН ЦАГ — `serverClock.ts` (2026-10-21, аудит №2).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clockOffsetOf, clockOffsetOk, MAX_CLOCK_OFF, serverNow, largeOffsetConfirmed } from '@/lib/serverClock.ts';

/* ── Томьёо: сервер − хүсэлтийн хоёр үзүүрийн дундаж ── */
assert.equal(clockOffsetOf(1000, 0, 200), 900);
assert.equal(clockOffsetOf(0, 100, 300), -200);
assert.equal(clockOffsetOf(10, 1, 2), 9, 'бүхэл рүү тоймлоно');

/* ── 2026-10-21 (аудит №2): |зөрүү| > 15 мин хүлээн авахгүй ── */
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

/* ── 2026-10-26 (аудит): том зөрүү (7.4 ц түрүүлсэн компьютер) — хоёр богино, тохирох хэмжилтээр л ── */
{
  const h = -7.4 * 3600_000;
  assert.ok(largeOffsetConfirmed(h, 150, h + 900, 200), 'хоёр хэмжилт ≤5 с таарвал авна');
  assert.ok(!largeOffsetConfirmed(h, 150, h + 9_000, 200), '9 с зөрүүтэй бол авахгүй');
  assert.ok(!largeOffsetConfirmed(h, 3_000, h, 200), 'урт RTT-тэй хэмжилтийг авахгүй');
  assert.ok(!largeOffsetConfirmed(h, 150, Number.NaN, 200), 'хоёр дахь хэмжилт алга');
  assert.ok(!largeOffsetConfirmed(13 * 3600_000, 100, 13 * 3600_000, 100), '±12 ц-ээс гадуур');
}

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
  assert.ok(/const ent = base\.startsWith\(`\$\{ENT_HOSTED\}\/`\);/.test(meas), 'measureServerTime: Enterprise хаягийг танихгүй');
  assert.ok(/if \(!ent\) \{\s*try \{[\s\S]*?onStatisticField: 'CURRENT_TIMESTAMP'/.test(meas), 'measureServerTime: Enterprise-д outStatistics замыг алгасахгүй');
  assert.ok(/returnCountOnly: 'true'/.test(meas), 'measureServerTime: хоёртын хайлт алга');
  const sync = src.slice(src.indexOf('export async function syncServerClock('));
  assert.ok(/let off = clockOffsetOf\(m\.srv, m\.t0, m\.t1\);[\s\S]*?if \(!clockOffsetOk\(off\)\) \{[\s\S]*?largeOffsetConfirmed\(off, m\.t1 - m\.t0, off2, m2\.t1 - m2\.t0\)\) \{ warnClockOff\(off\); clockAt = m\.t1; return; \}/.test(sync), 'serverClock.syncServerClock: 15 мин хязгаар/батлалт алга');
  const hb = readFileSync('src/lib/huvaariBatlah.ts', 'utf8');
  const hsync = hb.slice(hb.indexOf('export async function syncServerClock('));
  assert.ok(/import \{ serverNow, clockOffsetOf, syncServerClock as syncClockAt \} from '\.\/serverClock';/.test(hb), 'huvaariBatlah: serverClock-оос импортлоогүй');
  assert.ok(!/let clockOff\b/.test(hb), 'huvaariBatlah: өөрийн `clockOff` төлөв үлдсэн (хоёр зөрүү)');
  assert.ok(/return syncClockAt\(u, F\.oid\);/.test(hsync), 'huvaariBatlah.syncServerClock: serverClock руу дамжуулахгүй');
  const ob = readFileSync('src/lib/obyemBatlah.ts', 'utf8');
  const oq = ob.slice(ob.indexOf('async function query('));
  assert.ok(/await syncServerClock\(url\);/.test(oq.slice(0, oq.indexOf('arcgisPost('))), 'obyemBatlah.query: серверийн цагийг синк хийхгүй');
}

console.log('serverClock.check: ok');
