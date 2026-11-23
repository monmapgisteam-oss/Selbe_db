/**
 * ХЯНАЛТЫН ЭЦСИЙН БАТЛАЛТ — 182 синк ба «харсан» тэмдэг (2026-11-24), эх кодын шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/hyanaltStore.check.mjs
 *
 *   1. Эцсийн батлалтын дараа 182 — `runPlanSync({ fresh: true, force: true })` (явж буй автомат синкийн ард гинжилнэ);
 *      `syncPlanProgress()`-ийг шууд дуудахгүй.
 *   2. `retryPendingRegistrations` — бүртгэл нөхсөний дараа мөн 182 синк.
 *   3. `SEEN_DONE.add` — шийдвэр амжилттай бичигдсэний ДАРАА (бичилт унавал бусдын батлалтыг анзаарна).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* 1 */
assert.ok(!/await syncPlanProgress\(\)/.test(src), 'syncPlanProgress шууд дуудагдав');
const apply = src.slice(src.indexOf('ЭЦСИЙН БАТАЛГАА'), src.indexOf('export async function retryPendingRegistrations'));
assert.match(apply, /runPlanSync\(\{ fresh: true, force: true \}\)/, 'эцсийн батлалт → гинжилсэн синк');

/* 2 */
const retry = src.slice(src.indexOf('export async function retryPendingRegistrations'), src.indexOf('export async function recheck'));
assert.match(retry, /repaired \+= 1;[\s\S]*if \(repaired > 0\) \{[\s\S]{0,200}runPlanSync\(\{ fresh: true, force: true \}\)/, 'нөхөлтийн дараа 182 синк');

/* 3 */
const iWrite = apply.indexOf('await updateDecision(writeBase, attrs)');
const iSeen = apply.indexOf('SEEN_DONE.add(a.oid)');
assert.ok(iWrite > 0 && iSeen > iWrite, 'эцсийн батлалт: SEEN_DONE бичилтийн дараа');
assert.equal((apply.match(/SEEN_DONE\.add\(/g) ?? []).length, 1, 'бичилтээс өмнө нэмэгдэх өөр зам алга');
const rWrite = retry.indexOf('await updateDecision(live, fix)');
const rSeen = retry.indexOf('SEEN_DONE.add(cur.__oid)');
assert.ok(rWrite > 0 && rSeen > rWrite, 'нөхөлт: SEEN_DONE бичилтийн дараа');
assert.equal((retry.match(/SEEN_DONE\.add\(/g) ?? []).length, 1);

console.log('hyanaltStore.check: OK');
