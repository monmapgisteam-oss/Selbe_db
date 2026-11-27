/**
 * ГҮЙЦЭТГЭГЧИЙН ҮЛ НИЙЦЛИЙН МЭДЭГДЭЛ (2026-11-21) — цэвэр дүрэм, хадгалалт, холболт. Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/habeaNotify.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. БУСДЫН БАГЦ ХАРАГДАХ. Мэдэгдэл ЗӨВХӨН «ХАБЭА — багцаар харах»-д оноогдсон багцын мөрөөр; хүрээгүй (`null`) ба
 *      хуваарилалт уншигдаагүй (`[]`) аккаунтад юу ч үгүй.
 *   2. ДУУССАН / ИРЭЭДҮЙН МӨР. Дууссан (3), огноогүй, ирээдүйн огноотой үл нийцэл мэдэгдэлд орохгүй — «Нээлттэй үл
 *      нийцэл — шатлалаар» чарттай ИЖИЛ дүрэм (`habeaStage`).
 *   3. «ШИНЭ»-ИЙН ДҮРЭМ. Хараагүй эсвэл ДАРААГИЙН шатанд орсон бол шинэ; харсан тэмдэг доошлохгүй; дууссан мөрийн
 *      тэмдэг хадгалалтаас цэвэрлэгдэнэ.
 *   4. ЦЭСНИЙ ТЭМДЭГ. «ХАБЭА» цэсэнд тоолуур бүртгэлтэй, уншсан даруйд дахин тоолох дохио ижил нэртэй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  notifyItems, isNewItem, markSeenItems, pruneSeen, readSeen, writeSeen, popupShown, setPopupShown, BADGE_REFRESH_EVENT,
} from './habeaNotify.ts';
import { ESCALATION, stageOf, ACTION_DONE } from './habeaStage.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-21T12:00:00+08:00');
const row = (oid, pkgK, daysAgo, status = 1) => ({ oid, pkgK, status, d: daysAgo == null ? null : NOW - daysAgo * DAY });

/* ── 2. Шат — 0–6 · 7–13 · 14–20 · 21+ хоног ── */
assert.equal(ESCALATION.length, 4);
assert.deepEqual([0, 6, 7, 13, 14, 20, 21, 90].map((d) => stageOf(NOW - d * DAY, NOW)), [0, 0, 1, 1, 2, 2, 3, 3]);
assert.equal(ACTION_DONE, 3);
/* 2026-11-27: Улаанбаатарын ХУАНЛИЙН өдрөөр — 7×24 цагаар биш */
{
  const at = (s) => Date.parse(`${s}+08:00`);
  assert.equal(stageOf(at('2026-11-14T23:00:00'), at('2026-11-21T08:00:00')), 1, '7 хуанлийн өдөр (6 хоног 9 цаг) — 2-р шат');
  assert.equal(stageOf(at('2026-11-15T00:30:00'), at('2026-11-21T23:59:00')), 0, '6 хуанлийн өдөр (6 хоног 23 цаг) — 1-р шат');
  assert.equal(stageOf(at('2026-11-14T00:01:00'), at('2026-11-20T23:59:00')), 0, 'UTC-ээр өөр өдөр ч UB-аар 6 өдөр');
}

/* ── 1–2. Хүрээ ба нээлттэй мөр ── */
const rows = [
  row(1, 'bagts2', 2), // 1-р шат
  row(2, 'bagts2', 10), // 2-р шат
  row(3, 'bagts2', 30), // 4-р шат
  row(4, 'bagts3', 30), // бусдын багц
  row(5, 'bagts2', 15, ACTION_DONE), // дууссан
  row(6, 'bagts2', null), // огноогүй
  row(7, 'bagts2', -2), // ирээдүй
  row(0, 'bagts2', 5), // objectid-гүй
  row(8, 'bagts2', 25, 5), // засвар шаардлагатай — гүйцэтгэгчийн хариуцлага
  row(9, 'bagts2', 25, null), // 2026-11-27: төлөвгүй — шатлалд орохгүй (тусдаа тоологдоно)
  row(10, 'bagts2', 25, 4), // 2026-11-27: «Шалгуулах» — захиалагчийн хяналт хүлээж буй, гүйцэтгэгчид ахихгүй
];
assert.deepEqual(notifyItems(rows, null, NOW), [], 'хязгааргүй аккаунт (захиалагч, админ) — мэдэгдэлгүй');
assert.deepEqual(notifyItems(rows, [], NOW), [], 'хуваарилалт уншигдаагүй — мэдэгдэлгүй (fail-closed)');
const items = notifyItems(rows, ['bagts2'], NOW);
assert.deepEqual(items.map((it) => [it.row.oid, it.stage]), [[3, 3], [8, 3], [2, 1], [1, 0]],
  'зөвхөн өөрийн багцын нээлттэй; өндөр шат эхэнд, шат дотроо хуучин нь эхэнд; Шалгуулах · төлөвгүй орохгүй');

/* ── 3. «Шинэ» ── */
let seen = {};
assert.equal(items.filter((it) => isNewItem(it, seen)).length, 4, 'анх бүгд шинэ');
seen = markSeenItems(seen, items.slice(0, 2));
assert.deepEqual(items.map((it) => isNewItem(it, seen)), [false, false, true, true]);
/* 1 долоо хоногийн дараа: #2 3-р шатанд, #1 2-р шатанд орно → дахин шинэ; харсан #3 4-р шатандаа хэвээр */
const later = notifyItems(rows, ['bagts2'], NOW + 7 * DAY);
seen = markSeenItems(seen, items); // өмнөх долоо хоногт бүгдийг харсан
assert.deepEqual(later.map((it) => [it.row.oid, it.stage, isNewItem(it, seen)]), [[3, 3, false], [8, 3, false], [2, 2, true], [1, 1, true], [7, 0, true]],
  'дараагийн шатанд орсон мөр ДАХИН шинэ; огноо нь өнгөрсөн #7 ШИНЭЭР үүссэн мэдэгдэл');
assert.equal(markSeenItems({ 3: 3 }, [{ row: { oid: 3 }, stage: 1 }])['3'], 3, 'харсан шат доошлохгүй');
assert.deepEqual(pruneSeen({ 1: 0, 99: 2 }, items), { 1: 0 }, 'нээлттэй биш болсон мөрийн тэмдэг цэвэрлэгдэнэ');

/* ── Хадгалалт — хөтөч бүрт (localStorage) · цонх сешнд нэг удаа (sessionStorage) ── */
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const events = [];
globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
writeSeen('Contractor.A', { 3: 3, 8: 2 });
assert.deepEqual(readSeen('contractor.a'), { 3: 3, 8: 2 }, 'нэр том/жижиг үсэг үл хамаарна');
assert.deepEqual(events, [BADGE_REFRESH_EVENT], 'уншсаны дараа цэсний тэмдэг дахин тоологдоно');
localStorage.setItem('selbe.habea.notify.v1.bad', '{"1":9,"2":-1,"3":"x","4":2}');
assert.deepEqual(readSeen('bad'), { 4: 2 }, 'эвдэрсэн утга хаягдана');
localStorage.setItem('selbe.habea.notify.v1.arr', '[1,2]');
assert.deepEqual(readSeen('arr'), {});
assert.deepEqual(readSeen(null), {});
assert.equal(popupShown('contractor.a'), false);
setPopupShown('Contractor.A');
assert.equal(popupShown('contractor.a'), true, 'нэвтрэх үеийн цонх сешнд нэг удаа');
assert.equal(popupShown(null), true, 'нэвтрээгүй — цонхгүй');

/* ── 4. Холболт ── */
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const nav = src('../components/navBadges.ts');
assert.match(nav, /view: 'habea', load: \(\) => probe\(import\('@\/lib\/habeaNotify'\), \['countHabeaNotify'\]\)/, '«ХАБЭА» цэсний тэмдэг');
assert.ok(nav.includes(`'${BADGE_REFRESH_EVENT}'`), 'цэсний тэмдэг уншсан дохиог сонсоно');
assert.match(nav, /habea\.subscribeHabeaAcl\(kick\)/, 'багцын хуваарилалт ирэхэд дахин тоолно');
assert.match(src('./habeaNotify.ts'), /export async function countHabeaNotify/);
const act = src('../modules/HabeaAction.tsx');
assert.ok(!/const ESCALATION = \[/.test(act) && /from '@\/lib\/habeaStage'/.test(act), 'чарт ба мэдэгдэл НЭГ шатлалын дүрмээр');
const page = src('../modules/Habea.tsx');
assert.match(page, /useHabeaNotify\(user\?\.username, habScope, tick, now\)/, 'мэдэгдэл хуудасны ХАРАХ хүрээгээр');
assert.match(page, /\{notify\.enabled && <NotifyBell /, 'хонх зөвхөн багц оноогдсон аккаунтад');
/* 2026-11-23 хяналт: цонх фокусаас үл хамааран (бүрхүүлийн төгсгөлд) — эс бөгөөс «нээгдсэн» гэж тэмдэглэгдээд харагдахгүй */
const dlgAt = page.indexOf('<NotifyDialog ');
assert.ok(dlgAt > page.indexOf("className={h.gripRow}"), 'NotifyDialog нь фокусын блокийн ГАДНА');
assert.match(page.slice(dlgAt, dlgAt + 200), /onClose=\{closeNotifyDlg\}/, 'тогтвортой onClose — фокус булаахгүй');
assert.match(src('../modules/HabeaNotify.tsx'), /useEffect\(\(\) => \{ box\.current\?\.focus\(\); \}, \[\]\);/, 'цонх фокусыг НЭГ удаа авна');

console.log('habeaNotify: OK');
