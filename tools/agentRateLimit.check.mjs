/**
 * AI релений хурдны хязгаар — хэрэглэгч 40 · IP таг 300 · амжилтгүй нэвтрэлт 20 (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/agentRateLimit.check.mjs
 *
 * ⚠️ `agent-proxy/rateLimit.mjs` — `server.mjs` ба `worker.mjs`-ийн хуваалцсан цөм.
 *    Хамгаалж буй алдаа: НЭГ IP-ийн ард (оффисын NAT) суугаа олон ажилтан нийлээд
 *    минутад 40-д баригддаг байв. Одоо хэрэглэгч тус бүр 40, IP-д 300 таг.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLimiter, LIMITS, WINDOW_MS } from '../agent-proxy/rateLimit.mjs';

assert.deepEqual({ ...LIMITS }, { user: 40, ip: 300, authFail: 20 });
assert.equal(WINDOW_MS, 60_000);

let t = 1_000_000;
const clock = () => t;

/* ── Оффис: нэг IP, 10 хэрэглэгч × 25 хүсэлт = 250 → бүгд нэвтэрнэ ── */
{
  const lim = createLimiter({ now: clock });
  let blocked = 0;
  for (let i = 0; i < 25; i++) {
    for (let u = 0; u < 10; u++) {
      if (lim.hit('ipcap:10.0.0.1', LIMITS.ip)) blocked++;
      else if (lim.hit(`user:u${u}`, LIMITS.user)) blocked++;
    }
  }
  assert.equal(blocked, 0, `оффисын хэрэглэгчид хаагдав (${blocked})`);
  console.log('✅ нэг IP-ийн ард 10 хэрэглэгч × 25 = 250 хүсэлт/мин — хаагдахгүй');
}

/* ── Нэг хэрэглэгч минутад 41 дэх хүсэлт → 429 ── */
{
  const lim = createLimiter({ now: clock });
  for (let i = 0; i < 40; i++) assert.equal(lim.hit('user:bat', LIMITS.user), false);
  assert.equal(lim.hit('user:bat', LIMITS.user), true, '41 дэх хүсэлт хаагдах ёстой');
  assert.equal(lim.hit('user:dorj', LIMITS.user), false, 'өөр хэрэглэгч нөлөөлөх ёсгүй');
  /* Цонх гулсана — минутын дараа дахин */
  t += WINDOW_MS + 1;
  assert.equal(lim.hit('user:bat', LIMITS.user), false, 'цонх гулсаагүй');
  console.log('✅ баталгаажсан хэрэглэгч бүрд минутад 40 · цонх гулсана');
}

/* ── IP таг 300 ── */
{
  const lim = createLimiter({ now: clock });
  for (let i = 0; i < 300; i++) assert.equal(lim.hit('ipcap:1.2.3.4', LIMITS.ip), false);
  assert.equal(lim.hit('ipcap:1.2.3.4', LIMITS.ip), true);
  console.log('✅ IP таг: 301 дэх хүсэлт хаагдана');
}

/* ── Амжилтгүй нэвтрэлт: 20 удаа → `full` (ArcGIS руу шалгалт явахгүй); тоолохгүй шалгалт ── */
{
  const lim = createLimiter({ now: clock });
  for (let i = 0; i < 19; i++) {
    assert.equal(lim.full('authfail:9.9.9.9', LIMITS.authFail), false);
    lim.hit('authfail:9.9.9.9', LIMITS.authFail);
  }
  assert.equal(lim.full('authfail:9.9.9.9', LIMITS.authFail), false, '19 дээр хаах ёсгүй');
  lim.hit('authfail:9.9.9.9', LIMITS.authFail);
  assert.equal(lim.full('authfail:9.9.9.9', LIMITS.authFail), true, '20 амжилтгүйн дараа хаах ёстой');
  /* `full` нь тоолохгүй — олон удаа асуухад тоо өсөхгүй */
  for (let i = 0; i < 50; i++) lim.full('authfail:8.8.8.8', LIMITS.authFail);
  assert.equal(lim.full('authfail:8.8.8.8', LIMITS.authFail), false);
  t += WINDOW_MS + 1;
  assert.equal(lim.full('authfail:9.9.9.9', LIMITS.authFail), false, 'минутын дараа сэргэх ёстой');
  console.log('✅ амжилтгүй нэвтрэлт IP-д 20 · `full` тоолохгүй · цонхны дараа сэргэнэ');
}

/* ── Хуучирсан түлхүүр цэвэрлэгдэнэ (санах ой өсөхгүй) ── */
{
  const lim = createLimiter({ now: clock });
  for (let i = 0; i < 100; i++) lim.hit(`user:x${i}`, LIMITS.user);
  assert.equal(lim.size(), 100);
  t += WINDOW_MS * 2 + 1;
  lim.hit('user:new', LIMITS.user);
  assert.equal(lim.size(), 1, 'хуучирсан түлхүүр үлдэв');
  console.log('✅ хуучирсан түлхүүр цонх тутам цэвэрлэгдэнэ');
}

/* ── server.mjs · worker.mjs хоёулаа энэ модулийг ижил дүрмээр ашиглана ── */
for (const f of ['server.mjs', 'worker.mjs']) {
  const src = readFileSync(new URL(`../agent-proxy/${f}`, import.meta.url), 'utf8');
  assert.match(src, /from ['"]\.\/rateLimit\.mjs['"]/, `${f}: rateLimit.mjs импортлоогүй`);
  assert.ok(!/function rateLimited\(/.test(src), `${f}: хуучин тоолуур үлдсэн`);
  assert.match(src, /limiter\.hit\(`ipcap:\$\{ip\}`, LIMITS\.ip\)/, `${f}: IP таг 300 биш`);
  assert.match(src, /limiter\.full\(`authfail:\$\{ip\}`, LIMITS\.authFail\)/, `${f}: амжилтгүй нэвтрэлтийн шалгалт алга`);
  assert.match(src, /limiter\.hit\(`authfail:\$\{ip\}`, LIMITS\.authFail\)/, `${f}: амжилтгүй нэвтрэлт тоологдохгүй`);
  assert.match(src, /caller = `user:\$\{auth\.username\}`/, `${f}: хэрэглэгчээр түлхүүрлээгүй`);
  assert.match(src, /limiter\.hit\(caller, LIMITS\.user\)/, `${f}: хэрэглэгчийн хязгаар 40 биш`);
  /* амжилтгүй шалгалт ArcGIS шалгалтаас ӨМНӨ */
  const full = src.indexOf('limiter.full(`authfail:');
  const chk = src.indexOf('await checkArcGIS(');
  assert.ok(full > 0 && chk > full, `${f}: authfail шалгалт ArcGIS дуудлагаас өмнө байх ёстой`);
}
console.log('✅ server.mjs · worker.mjs: хэрэглэгч 40 · IP 300 · authfail 20 холбогдсон');
