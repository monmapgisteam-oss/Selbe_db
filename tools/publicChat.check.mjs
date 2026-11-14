/**
 * Нийтийн чат (`/public-chat`, 2026-11-14) — нэвтрэлтгүй, өгөгдлийг сайт өөрөө илгээнэ, дотоод хэрэгсэлгүй, хатуу хязгаар.
 *   node tools/publicChat.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  publicConfig, sanitizePublic, createDayCounter, buildPublicSystem, PUBLIC_DEFAULT_ORIGINS,
  PUBLIC_MAX_MESSAGES, PUBLIC_MAX_CHARS, PUBLIC_MAX_CONTEXT, sanitizeAdmin, buildAdminSystem, ADMIN_MAX_CHARS,
} from '../agent-proxy/publicChat.mjs';

/* Тохиргоо — анхдагч 3 нийтийн сайт, цагт 10, өдөрт 300 */
const c0 = publicConfig({});
assert.deepEqual(c0.origins, ['https://selbecity.mn', 'https://sales.selbecity.mn', 'https://investment.selbecity.mn']);
assert.equal(c0.perHour, 10);
assert.equal(c0.perDay, 300);
assert.equal(c0.effort, 'low');
assert.ok(!c0.origins.includes('https://smart.selbecity.mn'), 'дотоод портал нийтийн жагсаалтад орохгүй');
const c1 = publicConfig({ PUBLIC_ORIGINS: ' https://a.mn , ', PUBLIC_PER_HOUR: '3', PUBLIC_PER_DAY: 'x' });
assert.deepEqual(c1.origins, ['https://a.mn']);
assert.equal(c1.perHour, 3);
assert.equal(c1.perDay, 300, 'буруу тоо → анхдагч');
assert.equal(PUBLIC_DEFAULT_ORIGINS.length, 3);

/* Яриа — зөвхөн текст, сүүлийнх нь асуулт */
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: ' Хэдэн айл вэ? ' }] }).messages[0].content, 'Хэдэн айл вэ?');
assert.equal(sanitizePublic({}).ok, false);
assert.equal(sanitizePublic({ messages: [{ role: 'system', content: 'x' }] }).ok, false, 'system үүрэг хориотой');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: [{ type: 'tool_result' }] }] }).ok, false, 'хэрэгслийн блок хориотой');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }).ok, false, 'сүүлийнх асуулт биш');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'x'.repeat(PUBLIC_MAX_CHARS + 1) }] }).ok, false, 'урт асуулт');
assert.equal(sanitizePublic({ messages: Array.from({ length: PUBLIC_MAX_MESSAGES + 1 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'a' })) }).ok, false, 'урт яриа');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a', tools: [1] }] }).messages[0].tools, undefined, 'илүү талбар хаягдана');

/* Сайтын өгөгдөл (`context`) — текст, хэмжээтэй; зааварт ӨГӨГДӨЛ хэсэгт орно */
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a' }], context: ' Төсөв: 10₮ ' }).context, 'Төсөв: 10₮');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a' }] }).context, '', 'өгөгдөлгүй ч болно');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a' }], context: { x: 1 } }).ok, false, 'текст биш');
assert.equal(sanitizePublic({ messages: [{ role: 'user', content: 'a' }], context: 'x'.repeat(PUBLIC_MAX_CONTEXT + 1) }).ok, false, 'хэт урт');
const sys = buildPublicSystem('Төсөв: 10₮');
assert.match(sys, /# ӨГӨГДӨЛ\n\nТөсөв: 10₮$/);
assert.match(sys, /зохиож болохгүй/);
assert.match(buildPublicSystem(''), /\(өгөгдөл ирээгүй\)/);

/* Админы AI — мэдээний ноорог: урт хүсэлт зөвшөөрнө, өгөгдөл ӨГӨГДӨЛ хэсэгт, зохиохгүй */
assert.deepEqual(publicConfig({}).admin, { perHour: 20, perDay: 100, effort: 'medium' });
assert.equal(sanitizeAdmin({ messages: [{ role: 'user', content: 'x'.repeat(3000) }], context: 'd' }).ok, true, 'нийтийн чатаас урт хүсэлт');
assert.equal(sanitizeAdmin({ messages: [{ role: 'user', content: 'x'.repeat(ADMIN_MAX_CHARS + 1) }] }).ok, false);
assert.equal(sanitizeAdmin({ messages: [{ role: 'system', content: 'x' }] }).ok, false, 'system үүрэг хориотой');
const asys = buildAdminSystem('Сургууль: 2');
assert.match(asys, /МЭДЭЭНИЙ РЕДАКТОР/);
assert.match(asys, /\[ДУТУУ: …\]/);
assert.match(asys, /# ӨГӨГДӨЛ\n\nСургууль: 2$/);

/* Өдрийн тоолуур — Улаанбаатарын өдөр солигдоход тэглэнэ */
let t = Date.UTC(2026, 10, 14, 15, 0); // УБ 23:00
const day = createDayCounter({ now: () => t });
assert.equal(day.hit(2), false); assert.equal(day.hit(2), false); assert.equal(day.hit(2), true);
t += 2 * 3600 * 1000; // УБ маргааш 01:00
assert.equal(day.hit(2), false, 'шинэ өдөр');

/* Сервер: нийтийн зам токенгүй, клиентын system/tools-ыг ашиглахгүй, дотоод хэрэгсэлгүй, хязгаартай */
const srv = readFileSync(new URL('../agent-proxy/server.mjs', import.meta.url), 'utf8');
const pub = srv.slice(srv.indexOf('async function publicChat('), srv.indexOf('* `/chat`-ийн үлдсэн хэсэг'));
assert.ok(pub.length > 500, 'publicChat олдсон');
assert.match(pub, /if \(!origin \|\| !PUB\.origins\.includes\(origin\)\)/, 'Origin заавал, нийтийн жагсаалтаар');
assert.match(pub, /tools: \[\]/, 'хэрэгсэлгүй');
assert.doesNotMatch(pub, /payload\.system|payload\.tools|x-arcgis-token/, 'клиентын заавар/хэрэгсэл/токен ашиглахгүй');
assert.match(pub, /K\.build\(clean\.context\)/, 'заавар = тогтмол дүрэм + сайтын өгөгдөл');
assert.match(srv, /sanitize: sanitizePublic, build: buildPublicSystem/, 'нийтийн чат');
assert.match(srv, /sanitize: sanitizeAdmin, build: buildAdminSystem/, 'админы AI');
assert.match(srv, /u === "\/public-chat" \? "pub" : u === "\/public-admin" \? "adm" : null/, 'хоёр нээлттэй зам');
assert.doesNotMatch(srv, /selbe_public|PUBLIC_TABLES/, 'реле нийтийн хүснэгт уншихгүй');
assert.match(pub, /pubHour\.full\(`\$\{kind\}:\$\{ip\}`, K\.perHour\)/, 'IP-ийн цагийн хязгаар (зам тус бүрд)');
assert.match(pub, /K\.day\.hit\(K\.perDay\)/, 'өдрийн нийт хязгаар (зам тус бүрд)');
assert.match(srv, /isPublicPath\(url\) && PUB\.origins\.includes\(origin\)/, 'нийтийн сайтын CORS зөвхөн /public-chat-д');
assert.ok(srv.indexOf('isPublicPath(req.url)') < srv.indexOf('!req.url?.startsWith("/chat")'), 'нийтийн зам нэвтрэлтээс ӨМНӨ салаалана');

console.log('publicChat.check: OK');
