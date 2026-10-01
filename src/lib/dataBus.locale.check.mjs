/**
 * ХЭЛ СОЛИГДОХОД КЭШ ХАЯГДАНА — `dataBus.ts` ↔ `i18nCore.setLocale` (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/dataBus.locale.check.mjs
 *
 * Хамгаалж буй алдаа: хэл солих нь хуудсыг дахин ачаалахгүй (remount) болсноос
 * хойш ОРЧУУЛСАН мөр хадгалдаг кэштэй ачаалагч (`live.loadBudget`-ийн «Эх үүсвэр
 * задраагүй», `ceo/*`-ийн KPI картууд) англи горимд ч МОНГОЛООРОО үлддэг байв —
 * нэг дэлгэцэд хоёр хэл холилдоно.
 *
 * ⚠️ ЖИНХЭНЭ модулиуд (`dataBus.ts`, `i18nCore.ts`, `live.ts`-ийн `cached`) —
 *    хуулбар логик биш, тиймээс эх код өөрчлөгдөхөд хоцрохгүй.
 */
import assert from 'node:assert/strict';
import { register, dataVersion, subscribeData } from '@/lib/dataBus';
import { setLocale, getLocale, t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name);
  pass += 1;
};

assert.equal(getLocale(), 'mn', 'Node-д анхдагч хэл mn байх ёстой');

/* ── 1. register-ийн түвшин ── */
let dropped = 0;
register(() => { dropped += 1; }, ['BUILDING']);
let notified = 0;
const off = subscribeData(() => { notified += 1; });
const v0 = dataVersion();

setLocale('en');
ok('хэл солиход бүртгэлтэй кэш хаягдана', dropped === 1, `drop ${dropped}`);
ok('автобусын хувилбар өснө (useAsync дахин татна)', dataVersion() > v0);
ok('захиалагчид мэдэгдэнэ', notified === 1, `мэдэгдэл ${notified}`);

setLocale('en');
ok('ИЖИЛ хэл дахин сонгоход юу ч хийхгүй', dropped === 1 && notified === 1);

/* ── 2. live.cached() — хэрэглэгчид харагдах шошго шинэ хэлээр ── */
setLocale('mn');
let calls = 0;
/* `loadBudget`-ийн «Төрөл тодорхойлоогүй»-тэй ижил хэв: орчуулсан шошго КЭШИЙН үр дүнд */
const load = cached(async () => { calls += 1; return { label: tr('Төрөл тодорхойлоогүй') }; }, undefined, ['CASHFLOW_NEW']);
const mn = await load();
ok('mn горимд монгол шошго', mn.label === 'Төрөл тодорхойлоогүй', mn.label);
ok('дахин дуудахад кэшээс (сүлжээгүй)', (await load()) === mn && calls === 1);

setLocale('en');
const en = await load();
ok('en руу шилжсэний дараа кэш ХУУЧИН монгол шошго буцаахгүй', en.label !== 'Төрөл тодорхойлоогүй', en.label);
ok('шинэ хэлээр дахин бодогдоно', en.label === tr('Төрөл тодорхойлоогүй') && calls === 2, `${en.label} · calls ${calls}`);

off();
setLocale('mn');
console.log(`\ndataBus.locale: ${pass} шалгалт амжилттай.`);
