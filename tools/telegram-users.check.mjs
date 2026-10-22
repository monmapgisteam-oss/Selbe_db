/**
 * TELEGRAM БОТЫН ХЭРЭГЛЭГЧИЙН ФАЙЛ — гар засвар тусна · нэгтгэж бичнэ · эвдэрсэн файлыг дарахгүй · хасах эрх (⚠️ 2026-10-22).
 *   node tools/telegram-users.check.mjs
 *
 * ⚠️ ЯАГААД (аудит): файлыг асахдаа нэг удаа уншиж, хадгалах бүрд санах ойн хуулбараар дарж бичдэг байсан тул админы гар
 *    засвар (хүн хасах) дараагийн «✅»-оор буцаж, гараар хассан хүн эрхтэй хэвээр байв; ганц админ зөвшөөрсөн хүнээ
 *    хасах замгүй байв (`/revoke` алга). Түр файл — системийн түр хавтсанд (репо хөндөгдөхгүй).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canRevoke, createUsersStore } from './telegram-users.mjs';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const quiet = { error: () => {}, warn: () => {} };

const dir = mkdtempSync(join(tmpdir(), 'tg-users-'));
const file = join(dir, 'telegram-users.json');
let tick = Date.now() / 1000;
/** Гар засвар — mtime-ыг ИЛ урагшлуулна (файлын системийн нарийвчлалаас хамаарахгүй) */
const handWrite = (text) => { writeFileSync(file, text); tick += 5; utimesSync(file, tick, tick); };
const onDisk = () => JSON.parse(readFileSync(file, 'utf8'));

try {
  /* ── 1. Файлгүй эхлэл ба нэгтгэж бичих ── */
  const s = createUsersStore(file, { log: quiet });
  eq(s.load(), {}, 'файлгүй → хоосон');
  ok(s.update((d) => { d['111'] = { views: ['plan'], name: 'Бат', at: 'x' }; }), 'эхний бичилт');
  eq(Object.keys(onDisk()), ['111'], 'файлд бичигдэв');

  /* ── 2. ГАР ЗАСВАР — ботын санах ойд шууд тусна, дараагийн бичилт дарахгүй ── */
  handWrite(JSON.stringify({ 222: { views: ['plan', 'pkgProg'], name: 'Дорж', at: 'y' } }));
  eq(s.get('111'), undefined, 'гараар хассан хүн эрхгүй болов (дахин асаалгүй)');
  eq(s.get('222')?.name, 'Дорж', 'гараар нэмсэн хүн танигдав');
  ok(s.update((d) => { d['333'] = { views: ['plan'], name: 'Сараа', at: 'z' }; }), 'зөвшөөрөл');
  eq(Object.keys(onDisk()).sort(), ['222', '333'], 'бичилт гар засварыг ДАРААГҮЙ (111 буцаж ирээгүй, 222 үлдэв)');
  ok(s.update((d) => { delete d['222']; }), 'хасалт');
  eq(Object.keys(onDisk()), ['333'], 'зөвхөн тэр ID хасагдав');

  /* ── 3. Ажиллаж байхад ЭВДЭРСЭН файл — сүүлийн зөвөөр үйлчилж, ДАРЖ БИЧИХГҮЙ; засмагц сэргэнэ ── */
  handWrite('{ "333": { "views": ["plan"] ');
  eq(s.get('333')?.name, 'Сараа', 'эвдэрсэн үед сүүлийн зөв жагсаалт');
  ok(s.broken, 'эвдэрсэн тэмдэг');
  ok(!s.update((d) => { d['444'] = { views: ['plan'], name: '', at: '' }; }), 'эвдэрсэн файлд бичихгүй (false)');
  eq(readFileSync(file, 'utf8'), '{ "333": { "views": ["plan"] ', 'эвдэрсэн файл хөндөгдөөгүй');
  handWrite(JSON.stringify({ 333: { views: ['plan'], name: 'Сараа', at: 'z' } }));
  eq(s.get('444'), undefined, 'засагдсан файлаас уншив (санах ойн зөвхөн өөрчлөлт алга)');
  ok(!s.broken && s.update((d) => { d['555'] = { views: ['plan'], name: '', at: '' }; }), 'засмагц бичилт сэргэв');
  eq(Object.keys(onDisk()).sort(), ['333', '555'], 'нэгтгэж бичив');

  /* ── 4. АСАХДАА эвдэрсэн — хоосноор (fail-closed), нөөц хуулбар, дарж бичихгүй ── */
  handWrite('not json');
  const s2 = createUsersStore(file, { log: quiet });
  eq(s2.load(), {}, 'асахдаа эвдэрсэн → хоосон');
  ok(readdirSync(dir).some((f) => f.startsWith('telegram-users.json.corrupt-')), 'нөөц хуулбар үлдэв');
  ok(!s2.update((d) => { d['666'] = { views: [], name: '', at: '' }; }), 'асахдаа эвдэрсэн файлд бичихгүй');
  eq(readFileSync(file, 'utf8'), 'not json', 'файл хэвээр');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
ok(!existsSync(dir), 'түр хавтас цэвэрлэгдэв');
console.log('✅ хэрэглэгчийн файл: гар засвар шууд · нэгтгэж бичнэ · эвдэрсэн үед дарж бичихгүй · засмагц сэргэнэ');

/* ── 5. ХАСАХ ЭРХ — «✅»-ийн хүрээний ижил дүрэм ── */
ok(canRevoke('all', ['plan', 'pkgFin']), "'all' админ хэнийг ч");
ok(canRevoke('all', 'all'), "'all' админ хуучин 'all' хэрэглэгчийг ч");
ok(canRevoke(['plan', 'pkgProg'], ['plan']), 'хязгаартай админ — өөрийн хүрээнд багтах');
ok(!canRevoke(['plan'], ['plan', 'gazar']), 'хязгаартай админ — өргөн эрхтэйг хасахгүй');
ok(!canRevoke(['plan'], 'all'), "хязгаартай админ — 'all' хэрэглэгчийг хасахгүй");
ok(!canRevoke(undefined, ['plan']), 'хүрээгүй — хэнийг ч');

/* ── 6. Ботын эх кодын гэрээ ── */
{
  const bot = readFileSync(new URL('./telegram-bot.mjs', import.meta.url), 'utf8');
  ok(!/\bsaveUsers\(|\busers\[targetId\]|const users = loadUsers\(\)/.test(bot), 'санах ойн хуулбараар бүтнээр дарж бичих зам алга');
  ok(bot.includes('usersStore.update((d) => { d[targetId] = entry; })'), 'зөвшөөрөл нэгтгэж бичнэ');
  ok(/\^\\\/revoke/.test(bot) && bot.includes('ADMINS.has(userId)') && bot.includes('revokeUser(userId,'), '/revoke зөвхөн админд');
  ok(bot.includes('if (!canRevoke(ADMINS.get(adminId), u.views))'), 'хасахад хүрээний дүрэм');
  ok(bot.includes("`  ${id}${u?.name ? ` · ${u.name}` : ''} → ${views(u?.views)}`"), '/users нэртэй');
  ok(bot.includes("callback_data: `no:${targetId}`") && bot.includes('keepRevoke'), 'зөвшөөрсний дараа «❌ Эрхийг хасах» товч үлдэнэ');
  ok(bot.includes('note = revokeUser(adminId, targetId);'), '❌ товч ба /revoke НЭГ зам');
}
console.log('✅ хасах эрх: хүрээний дүрэм · /revoke · /users нэртэй · ❌ товч үлдэнэ');
console.log(`\ntelegram-users: ok — ${checks} шалгалт`);
