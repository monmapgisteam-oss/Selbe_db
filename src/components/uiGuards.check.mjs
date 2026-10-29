/**
 * ХАРАГДАЦЫН ХАМГААЛАЛТУУД — фокусын урхины овоолго · нэг удаагийн ойртолт · буферийн хуудаслалт ·
 * нэвтрэлтийн эффектийн `alive` (2026-10-21, аудит).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/components/uiGuards.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `UserAdmin`-ы window `keydown` (Tab · Esc · Ctrl+S) дээр нь нээлттэй `AuthGate`-ийн цонхны (сешн
 *      дууссан / эрх алдсан) урхитай зөрчилдөж фокусыг буцааж татаж, Esc порталыг хаадаг байв →
 *      `isTopFocusTrap(root)`-оор зөвхөн ОРОЙН урхи барина (`pushFocusTrap` овоолго, deps `[open]`).
 *   2. `PlanOverlap`/`HesegNeed`-ийн ойртолт объектын лавлагаа солигдох бүрд дахин нисдэг байв →
 *      сонголтын түлхүүрээр НЭГ удаа (`zoomedKey` / `zoomedRef`).
 *   3. `MapCanvas` «irged:reach» буфер `queryFeatures`-ийг хуудаслалгүй (2000-оос дээш объект чимээгүй дутуу).
 *   4. `AuthGate` нэвтрэлтийн эффект: `setPermsRead`/хүснэгт үүсгэлт `alive` шалгалтын ӨМНӨ явдаг байв →
 *      `initRemote`-ийн дараа шууд `alive`; super-ийн хүснэгт үүсгэлт модулийн түвшний НЭГ амлалт.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushFocusTrap, isTopFocusTrap } from '@/lib/useFocusTrap';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* 1. Урхины овоолго — зөвхөн орой нь Tab/Esc барина */
{
  const A = { id: 'A' };
  const B = { id: 'B' };
  assert.equal(isTopFocusTrap(A), true, 'овоолго хоосон → хэн ч орой');
  const unA = pushFocusTrap(A);
  assert.equal(isTopFocusTrap(A), true);
  assert.equal(isTopFocusTrap(B), false, 'бүртгэлгүй урхи орой биш');
  const unB = pushFocusTrap(B);
  assert.equal(isTopFocusTrap(A), false, 'дээр нь өөр урхи → доорх нь барихгүй');
  assert.equal(isTopFocusTrap(B), true);
  unB();
  assert.equal(isTopFocusTrap(A), true, 'дээдийг хаахад доорх сэргэнэ');
  unA();
  assert.equal(isTopFocusTrap(B), true, 'хоосон овоолго');

  const ua = strip(read('./UserAdmin.tsx'));
  assert.match(ua, /const onKey = \(e: KeyboardEvent\) => \{\s*if \(!isTopFocusTrap\(root\)\) return;/, 'UserAdmin onKey орой биш бол гарах ёстой');
  assert.match(ua, /return pushFocusTrap\(root\);\s*\}, \[open\]\);/, 'UserAdmin урхиа `[open]` deps-тэй тусдаа эффектээр бүртгэх ёстой');
  assert.match(ua, /import \{[^}]*\bisTopFocusTrap\b[^}]*\} from '@\/lib\/useFocusTrap'/, 'UserAdmin `isTopFocusTrap` импортлох ёстой');
  const ag = read('./AuthGate.tsx');
  assert.ok((ag.match(/useFocusTrap\(ref, true\);/g) ?? []).length >= 3, 'AuthGate-ийн цонхнууд урхитай (овоолгод орно)');
}
console.log('✅ фокусын урхины овоолго: зөвхөн орой барина');

/* 2. Нэг удаагийн ойртолт */
{
  const po = strip(read('./PlanOverlap.tsx'));
  assert.match(po, /const zoomedKey = useRef<string \| null>\(null\);/, 'PlanOverlap `zoomedKey` алга');
  assert.match(po, /if \(zoomedKey\.current === key\) return;/, 'PlanOverlap ижил сонголтод дахин нисэх ёсгүй');
  assert.match(po, /\{ zoomedKey\.current = null; return; \}/, 'сонголт арилахад түлхүүр цэвэрлэгдэх ёстой');
  const hn = strip(read('./HesegNeed.tsx'));
  assert.match(hn, /const zoomedRef = useRef<string \| null>\(null\);/, 'HesegNeed `zoomedRef` алга');
  assert.match(hn, /if \(zoomedRef\.current === key\) return;/);
}
console.log('✅ PlanOverlap · HesegNeed: сонголт солигдоход л ойртоно');

/* 3. Буферийн хуудаслалт */
{
  const mc = strip(read('./MapCanvas.tsx'));
  const at = mc.indexOf("const REACH_ID = 'irged:reach';");
  assert.ok(at > 0);
  const eff = mc.slice(at, mc.indexOf('geometryEngine.geodesicBuffer', at));
  assert.match(eff, /q\.orderByFields = \[`\$\{fl\.objectIdField\} ASC`\];/, 'хуудаслалт `orderByFields`-тэй байх ёстой');
  assert.match(eff, /q\.start = start;\s*q\.num = REACH_PAGE;/, '`start`/`num`-аар хуудаслах ёстой');
  assert.match(eff, /if \(res\.features\.length === 0 \|\| !res\.exceededTransferLimit\) break;\s*start \+= res\.features\.length;/, 'ирсэн мөрийн тоогоор ахиулж, `exceededTransferLimit`-ээр зогсох ёстой');
  assert.doesNotMatch(eff, /fl\.queryFeatures\(\{\s*where:/, 'хуудаслалгүй хуучин дуудлага үлдсэн');
}
console.log('✅ irged:reach буфер хуудаслалттай');

/* 4. AuthGate — alive · нэг удаагийн хүснэгт үүсгэлт */
{
  const ag = strip(read('./AuthGate.tsx'));
  assert.match(ag, /const remoteOk = await initRemote\(canCreate\);\s*if \(!alive\) return;/, '`initRemote`-ийн дараа шууд `alive`');
  assert.match(ag, /if \(!alive\) return;\s*const hard = roleForUser\(info\.username\);/, '`hard` нь хүснэгт уншигдсаны (`initRemote`) ДАРАА');
  assert.match(ag, /await ensureSuperTables\(\);\s*if \(!alive\) return;/, 'хүснэгт үүсгэлтийн дараа ч `alive`');
  assert.match(ag, /if \(!alive\) return;\s*setPermsRead\(remoteOk \|\| !!hard\);/, '`setPermsRead` нь `alive`-ийн ДАРАА');
  assert.match(ag, /let superTablesOnce: Promise<void> \| null = null;/, 'модулийн түвшний нэг амлалт алга');
  assert.match(ag, /if \(!ok\) superTablesOnce = null;/, 'унасан бол дараагийн нэвтрэлтэд дахин оролдох ёстой');
  assert.equal((ag.match(/planTableReady\(true\)/g) ?? []).length, 1, '`planTableReady(true)` зөвхөн `ensureSuperTables`-д');
  assert.equal((ag.match(/obyemTableReady\(true\)/g) ?? []).length, 1, '`obyemTableReady(true)` зөвхөн `ensureSuperTables`-д');
}
console.log('✅ AuthGate: alive шалгалт · хүснэгт үүсгэлт нэг удаа');

console.log('\nuiGuards.check: ok');
