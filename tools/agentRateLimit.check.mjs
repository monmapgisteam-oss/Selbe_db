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
import {
  createLimiter, LIMITS, WINDOW_MS,
  createBudget, budgetFromEnv, usageTokens, budgetDay, DAILY_TOKEN_BUDGET_DEFAULT, upstreamErrorText, UPSTREAM_AUTH,
  createConcurrency, estimateInputTokens, reserveTokens, settleTokens, utf8Bytes, botCaller,
  sanitizeChat, sanitizeTools, sanitizeMessages,
} from '../agent-proxy/rateLimit.mjs';

/* ⚠️ 2026-10-09: + authFailIp (IP-ийн амжилтгүй нэвтрэлтийн таг) · concurrent (дуудагчийн зэрэг хүсэлт) · botConcurrent */
assert.deepEqual({ ...LIMITS }, { user: 40, ip: 300, authFail: 20, authFailIp: 100, concurrent: 2, botConcurrent: 6 });
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
  /* ⚠️ 2026-10-09: server.mjs нь `failKey` (TRUSTED_PROXY алга бол IP + токены хэш) — доор тусад нь */
  assert.match(src, /limiter\.full\((`authfail:\$\{ip\}`|failKey), LIMITS\.authFail\)/, `${f}: амжилтгүй нэвтрэлтийн шалгалт алга`);
  assert.match(src, /limiter\.hit\((`authfail:\$\{ip\}`|failKey), LIMITS\.authFail\)/, `${f}: амжилтгүй нэвтрэлт тоологдохгүй`);
  assert.match(src, /caller = `user:\$\{auth\.username\}`/, `${f}: хэрэглэгчээр түлхүүрлээгүй`);
  assert.match(src, /limiter\.hit\(caller, LIMITS\.user\)/, `${f}: хэрэглэгчийн хязгаар 40 биш`);
  /* амжилтгүй шалгалт ArcGIS шалгалтаас ӨМНӨ */
  const full = Math.max(src.indexOf('limiter.full(`authfail:'), src.indexOf('limiter.full(failKey'));
  const chk = src.indexOf('await checkArcGIS(');
  assert.ok(full > 0 && chk > full, `${f}: authfail шалгалт ArcGIS дуудлагаас өмнө байх ёстой`);
}
console.log('✅ server.mjs · worker.mjs: хэрэглэгч 40 · IP 300 · authfail 20 холбогдсон');

/* ── ⚠️ 2026-10-09 (аудит №6): минутын тоолол (`hit`) ЗӨВХӨН слот/төсөв авсны ДАРАА — татгалзсан 429 тоологдохгүй;
      дээд үйлчилгээний түлхүүрийн алдаа 502 `upstream_auth` (хоёр реле ижил) ── */
for (const f of ['server.mjs', 'worker.mjs']) {
  const src = readFileSync(new URL(`../agent-proxy/${f}`, import.meta.url), 'utf8');
  const full = src.indexOf('limiter.full(caller, LIMITS.user)');
  const acq = src.indexOf('inflight.acquire(caller');
  const hit = src.indexOf('limiter.hit(caller, LIMITS.user)');
  assert.ok(full > 0, `${f}: хэрэглэгчийн минутын хязгаар \`full\`-ээр шалгагдахгүй`);
  assert.ok(acq > full, `${f}: \`full\` шалгалт зэрэг хүсэлтийн слотоос ӨМНӨ байх ёстой`);
  assert.ok(hit > acq, `${f}: \`hit\` (тоолол) зэрэг хүсэлтийн слот авсны ДАРАА байх ёстой`);
  assert.match(src, /UPSTREAM_AUTH/, `${f}: дээд үйлчилгээний түлхүүрийн алдаа \`UPSTREAM_AUTH\`-аар буцахгүй`);
}
assert.deepEqual({ ...UPSTREAM_AUTH }, { error: 'Туслахын серверийн тохиргооны алдаа', code: 'upstream_auth', retryable: false });
console.log('✅ server.mjs · worker.mjs: минутын тоолол слотын дараа · upstream_auth 502');

/* ── ⚠️ 2026-10-09 (аудит №3): server.mjs — TRUSTED_PROXY алга бол authfail нь IP + ТОКЕНЫ ХЭШ ── */
{
  const src = readFileSync(new URL('../agent-proxy/server.mjs', import.meta.url), 'utf8');
  assert.match(src, /const failKey = TRUSTED_PROXY\s*\?\s*`authfail:\$\{ip\}`\s*:\s*`authfail:\$\{ip\}:\$\{tokenHash\(/,
    'server.mjs: TRUSTED_PROXY алга үед authfail токены хэшээр түлхүүрлэгдэх ёстой');
  /* ⚠️ аудит №4: verified кэш ТҮҮХИЙ токеноор түлхүүрлэхгүй */
  assert.ok(!/verified\.(get|set|delete)\(token\b/.test(src), 'server.mjs: verified кэш түүхий токеноор');
  console.log('✅ server.mjs: authfail IP+токены хэш (TRUSTED_PROXY алга) · verified кэш хэшээр');
}
{
  const src = readFileSync(new URL('../agent-proxy/worker.mjs', import.meta.url), 'utf8');
  assert.ok(!/verified\.(get|set|delete)\(token\b/.test(src), 'worker.mjs: verified кэш түүхий токеноор');
}

/* ── ⚠️ 2026-10-09 (аудит №1): өдрийн токены төсөв ── */
{
  assert.equal(DAILY_TOKEN_BUDGET_DEFAULT, 300_000);
  assert.equal(budgetFromEnv(undefined), 300_000);
  assert.equal(budgetFromEnv(''), 300_000);
  assert.equal(budgetFromEnv('abc'), 300_000);
  assert.equal(budgetFromEnv('0'), 0, '0 = унтраалттай');
  assert.equal(budgetFromEnv('5000'), 5000);
  assert.equal(usageTokens({ input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 1000 }), 260);
  assert.equal(usageTokens(null), 0);
  /* Улаанбаатарын өдөр: UTC 16:00 = УБ дараагийн өдрийн 00:00 */
  assert.equal(budgetDay(Date.UTC(2026, 9, 8, 15, 59)), '2026-10-08');
  assert.equal(budgetDay(Date.UTC(2026, 9, 8, 16, 0)), '2026-10-09');

  let bt = Date.UTC(2026, 9, 8, 3, 0);
  const b = createBudget({ now: () => bt });
  assert.equal(b.over('user:bat', 1000), false);
  b.add('user:bat', 600);
  assert.equal(b.over('user:bat', 1000), false);
  b.add('user:bat', 400);
  assert.equal(b.over('user:bat', 1000), true, 'төсөв дуусах ёстой');
  assert.equal(b.over('user:dorj', 1000), false, 'өөр хэрэглэгч нөлөөлөх ёсгүй');
  assert.equal(b.over('user:bat', 0), false, '0 = унтраалттай');
  bt += 24 * 3600 * 1000;
  assert.equal(b.over('user:bat', 1000), false, 'дараагийн өдөр тэглэгдэх ёстой');
  assert.equal(b.size(), 0, 'өдөр солигдоход Map цэвэрлэгдэнэ');
  console.log('✅ өдрийн төсөв: тоолно · хэрэглэгч тус бүр · УБ өдрөөр тэглэгдэнэ · 0 = унтраалттай');

  for (const f of ['server.mjs', 'worker.mjs']) {
    const src = readFileSync(new URL(`../agent-proxy/${f}`, import.meta.url), 'utf8');
    assert.match(src, /code: ['"]daily_budget['"]/, `${f}: төсвийн 429 алга`);
    /* ⚠️ 2026-10-09: бодит хэрэглээ `settleTokens`-оор (урьдчилсан тооцоог тааруулна) */
    assert.match(src, /settleTokens\(/, `${f}: хэрэглээ төсөвт нэмэгдэхгүй`);
    assert.match(src, /x-prompt-sig/, `${f}: PROMPT_HMAC толгой CORS/шалгалтад алга`);
    /* ⚠️ аудит №7: түүхий алдааны мессеж клиентэд очихгүй */
    assert.ok(!/error: `Биеийг уншиж чадсангүй: \$\{e\.message\}`/.test(src), `${f}: задлагчийн мессеж клиентэд`);
  }
  assert.ok(/AI үйлчилгээ/.test(upstreamErrorText(500)) && !/undefined/.test(upstreamErrorText(undefined)));
  console.log('✅ server.mjs · worker.mjs: төсөв · гарын үсгийн толгой · ерөнхий алдааны мессеж холбогдсон');
}

/* ── ⚠️ 2026-10-09 (2-р ээлж): зэрэг хүсэлтийн таг ── */
{
  const c = createConcurrency();
  const r1 = c.acquire('user:bat', LIMITS.concurrent);
  const r2 = c.acquire('user:bat', LIMITS.concurrent);
  assert.ok(r1 && r2, '2 зэрэг хүсэлт зөвшөөрөгдөх ёстой');
  assert.equal(c.acquire('user:bat', LIMITS.concurrent), null, '3 дахь нь хаагдах ёстой');
  assert.ok(c.acquire('user:dorj', LIMITS.concurrent), 'өөр хэрэглэгч нөлөөлөх ёсгүй');
  r1(); r1();
  assert.equal(c.active('user:bat'), 1, 'суллах нь давтан дуудагдахад нэг л удаа хасна');
  assert.ok(c.acquire('user:bat', LIMITS.concurrent), 'суллагдсаны дараа дахин авна');
  console.log('✅ зэрэг хүсэлт: дуудагчид 2 · суллах idempotent');
}

/* ── ⚠️ 2026-10-09: төсвийн урьдчилсан тооцоо ── */
{
  assert.equal(estimateInputTokens(1000), 500, 'байт / 2');
  assert.equal(estimateInputTokens(1000, 400), 320, 'системийн хэсэг 1/10 жинтэй: 600/2 + 400/20');
  assert.equal(estimateInputTokens(100, 999), 5, 'систем биеэс урт байж болохгүй');
  assert.equal(reserveTokens(500, 10000), 10500);
  assert.equal(settleTokens({ input_tokens: 10, output_tokens: 5 }, 999), 15, 'usage байвал бодитоор');
  assert.equal(settleTokens(undefined, 999), 999, 'usage алга → оролтын тооцоо');
  assert.equal(utf8Bytes('аб'), 4);
  const bt = Date.UTC(2026, 9, 8, 3, 0);
  const b = createBudget({ now: () => bt });
  b.add('user:bat', reserveTokens(500, 10000));
  assert.equal(b.over('user:bat', 10000), true, 'урьдчилсан тооцоо зэрэг хүсэлтэд харагдана');
  b.adjust('user:bat', 15 - 10500);
  assert.equal(b.used('user:bat'), 15, 'бодит хэрэглээгээр тааруулна');
  b.adjust('user:bat', -100000);
  assert.equal(b.used('user:bat'), 0, '0-ээс доош орохгүй');
  console.log('✅ төсөв: урьдчилан хасна · бодитоор тааруулна · usage алга бол оролтын тооцоо');
}

/* ── ⚠️ 2026-10-09: ботын дуудагч (`x-bot-user`) ── */
assert.equal(botCaller('123456'), 'bot:123456');
assert.equal(botCaller(undefined), 'bot');
assert.equal(botCaller('1; DROP'), 'bot');
assert.equal(botCaller('9'.repeat(30)), 'bot');

/* ── ⚠️ 2026-10-09: дээд үйлчилгээ рүү явах хүсэлтийн цагаан жагсаалт ── */
{
  const schema = { type: 'object', properties: { id: { type: 'string' } } };
  const t = sanitizeTools([{ name: 'query_feature', description: 'd', input_schema: schema, cache_control: { type: 'ephemeral' }, extra: 1 }]);
  assert.ok(t.ok);
  assert.deepEqual(t.tools, [{ name: 'query_feature', description: 'd', input_schema: schema }], 'зөвхөн name/description/input_schema');
  assert.equal(sanitizeTools([{ type: 'web_search_20250305', name: 'web_search' }]).ok, false, 'серверийн хэрэгсэл');
  assert.equal(sanitizeTools([{ type: 'custom', name: 'x', input_schema: schema }]).ok, false, '`type` талбар ямар ч утгатай');
  assert.equal(sanitizeTools([{ name: 'bad name', input_schema: schema }]).ok, false);
  assert.equal(sanitizeTools([{ name: 'x' }]).ok, false, 'input_schema заавал');
  assert.equal(sanitizeTools(undefined).tools, undefined);

  const good = [
    { role: 'user', content: 'Сайн уу' },
    { role: 'assistant', content: [
      { type: 'thinking', thinking: '…', signature: 'sig' },
      { type: 'text', text: 'шалгая', citations: null },
      { type: 'tool_use', id: 'tu1', name: 'query_feature', input: { id: 'et:1' } },
    ] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'data', is_error: true, cache_control: { type: 'ephemeral' } }] },
  ];
  const m = sanitizeMessages(good);
  assert.ok(m.ok, m.error);
  assert.deepEqual(m.messages[1].content[1], { type: 'text', text: 'шалгая' }, 'мэдэгдэх талбар л үлдэнэ');
  assert.deepEqual(m.messages[2].content[0], { type: 'tool_result', tool_use_id: 'tu1', content: 'data', is_error: true });
  const accepted = (content, role = 'user') => sanitizeMessages([{ role, content }]).ok;
  assert.equal(accepted([{ type: 'image', source: { type: 'url', url: 'https://x' } }]), false, 'зураг');
  assert.equal(accepted([{ type: 'document', source: {} }]), false, 'документ');
  assert.equal(accepted([{ type: 'thinking', thinking: 'x', signature: 's' }]), false, 'user-ийн thinking');
  assert.equal(accepted([{ type: 'tool_use', id: 'a', name: 'b', input: {} }]), false, 'user-ийн tool_use');
  assert.equal(accepted([{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'image', source: {} }] }]), false, 'tool_result доторх зураг');
  assert.equal(accepted([{ type: 'server_tool_use', id: 'a', name: 'web_search', input: {} }], 'assistant'), false);
  assert.equal(sanitizeMessages([{ role: 'system', content: 'x' }]).ok, false, 'role');
  assert.equal(sanitizeChat({ messages: [] }).ok, false);
  console.log('✅ хүсэлтийн шалгалт: серверийн хэрэгсэл · зураг/документ татгалзана · талбаруудыг дахин угсарна');
}

/* ── ⚠️ 2026-10-09: хоёр реле шинэ хамгаалалтуудыг хэрэглэнэ ── */
for (const f of ['server.mjs', 'worker.mjs']) {
  const src = readFileSync(new URL(`../agent-proxy/${f}`, import.meta.url), 'utf8');
  assert.match(src, /sanitizeChat\(payload/, `${f}: tools/messages шалгагдахгүй`);
  assert.ok(!/const \{ system, messages, tools \} = payload/.test(src), `${f}: түүхий tools/messages дамжуулж байна`);
  assert.match(src, /inflight\.acquire\(caller/, `${f}: зэрэг хүсэлтийн таг алга`);
  assert.match(src, /code: ['"]concurrent['"]/, `${f}: зэрэг хүсэлтийн 429 алга`);
  assert.match(src, /reserveTokens\(inputEst/, `${f}: төсөв урьдчилан хасагдахгүй`);
  assert.match(src, /botCaller\(/, `${f}: x-bot-user алга`);
  /* татгалзалт (refusal) төсөвт тоологдоно — settleTokens нь refusal шалгалтаас ӨМНӨ */
  const settle = Math.max(src.indexOf('settleTokens(response.usage'), src.indexOf('settleTokens(body?.usage'));
  const refusal = src.search(/stop_reason === ["']refusal["']/);
  assert.ok(settle > 0 && refusal > settle, `${f}: татгалзсан хариу төсөвт тоологдохгүй`);
  /* баталгаажсан токены кэш authfail шалгалтаас ӨМНӨ */
  const callIdx = src.indexOf('const cachedUser');
  const failIdx = src.indexOf('limiter.full(failKey');
  assert.ok(callIdx > 0 && failIdx > callIdx, `${f}: кэш authfail-аас өмнө шалгагдахгүй`);
  assert.match(src, /authfailip:\$\{ip\}/, `${f}: IP-ийн амжилтгүй нэвтрэлтийн таг алга`);
}
{
  const src = readFileSync(new URL('../agent-proxy/worker.mjs', import.meta.url), 'utf8');
  assert.match(src, /const failKey = `authfail:\$\{ip\}:\$\{hash\.slice\(0, 16\)\}`/, 'worker.mjs: authfail IP+токены хэшээр биш');
  assert.ok(!/await request\.text\(\)/.test(src), 'worker.mjs: биеийг бүтнээр уншиж байна (chunked хязгааргүй)');
  assert.match(src, /readBodyCapped\(request, MAX_BODY\)/, 'worker.mjs: урсгалаар тоолж уншихгүй');
}
console.log('✅ server.mjs · worker.mjs: шалгалт · зэрэг таг · урьдчилсан төсөв · татгалзалт тоологдоно · кэш эхлээд · chunked таслана');
