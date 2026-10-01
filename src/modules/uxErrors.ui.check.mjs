/**
 * Хөтчийн аялалаар илэрсэн UX алдаанууд (⚠️ 2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/uxErrors.ui.check.mjs
 *
 * §1 Схем: бүх эх сурвалж унавал шалтгаан нь ангилагдана (эрх ≠ сүлжээ ≠ хугацаа).
 * §2 Системийн баримт: дотоод код (`__flow__`, `planApprove`) зөвхөн «Техникийн дэлгэрэнгүй»-д.
 * §3 Эрхийн төрөл: уншилт унасан бол үүрд «уншигдаж байна…» биш — алдаа + «Дахин оролдох».
 * §4 Эх кодын хамгаалалт: Huvaari/Qaqc/Gazar/Tuh/UserAdmin/HelpPanel/DedButets.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { friendlyError } from '@/components/ui';
import { schemAllFailedError } from '@/lib/schemData';
import SysDoc, { hasTech } from '@/modules/SysDoc';
import { ErhTypes } from '@/modules/ErhTypes';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ── §1 Схем ── */
{
  const perm = friendlyError(new Error('x'));
  const p499 = friendlyError(schemAllFailedError(new Error('Token Required')));
  assert.equal(p499, friendlyError(new Error('Token Required')), '499 → эрхийн мессеж');
  assert.ok(!/Сүлжээ/.test(p499), '499-ийг «сүлжээ» гэж тайлбарлахгүй');
  const p403 = friendlyError(schemAllFailedError(new Error('HTTP 403')));
  assert.equal(p403, friendlyError(new Error('HTTP 403')));
  const p498 = friendlyError(schemAllFailedError(new Error('Invalid token')));
  assert.equal(p498, friendlyError(new Error('Invalid token')), '498 → нэвтрэлтийн мессеж');
  const net = friendlyError(schemAllFailedError(new TypeError('Failed to fetch')));
  assert.equal(net, friendlyError(new TypeError('Failed to fetch')), 'сүлжээ → сүлжээ');
  const te = new Error('aborted'); te.name = 'TimeoutError';
  const toE = schemAllFailedError(te);
  assert.equal(toE.name, 'TimeoutError', '`name` хадгалагдана');
  assert.equal(friendlyError(toE), friendlyError(te), 'хугацаа → хугацаа');
  assert.notEqual(p499, net);
  assert.notEqual(perm, p499);
  /* Шалтгаангүй үед ч унахгүй */
  assert.ok(schemAllFailedError(null).message.length > 0);
  assert.ok(!src('lib/schemData.ts').includes("tr('Өгөгдөл татагдсангүй — сүлжээгээ шалгана уу')"), 'хатуу «сүлжээгээ шалгана уу» үлдэх ёсгүй');
}

/* ── §2 Системийн баримт ── */
{
  const html = renderToStaticMarkup(h(SysDoc, {}));
  const outside = html.replace(/<details[\s\S]*?<\/details>/g, '');
  for (const code of ['__flow__', 'planApprove', 'obyemApprove', '__huvaari__']) {
    assert.ok(html.includes(code), `${code} техникийн хэсэгт байх ёстой`);
    assert.ok(!outside.includes(`>${code}<`), `${code} ил харагдаж болохгүй`);
  }
  assert.match(html, /<summary>Техникийн дэлгэрэнгүй<\/summary>/);
  assert.equal(hasTech({ aliases: [], styleSrc: [] }, [{ text: 'x' }], []), false);
  assert.equal(hasTech({ aliases: [], styleSrc: [] }, [{ cap: 'plan', text: 'x' }], []), true);
}

/* ── §3 Эрхийн төрөл ── */
{
  const fail = renderToStaticMarkup(h(ErhTypes, { remote: { busy: false, retry: () => {} } }));
  assert.match(fail, /Дахин оролдох/);
  assert.match(fail, /role="alert"/);
  assert.ok(!/уншигдаж байна/.test(fail), 'уншилт дууссан бол «уншигдаж байна» биш');
  const busy = renderToStaticMarkup(h(ErhTypes, { remote: { busy: true, retry: () => {} } }));
  assert.match(busy, /уншигдаж байна/);
  assert.ok(!/Дахин оролдох/.test(busy));
}

/* ── §4 Эх кодын хамгаалалт ── */
{
  const hv = src('modules/Huvaari.tsx');
  assert.ok(!hv.includes(".catch((e) => alive && setErr(String((e as Error).message || e)))"), 'Huvaari: түүхий ачаалах алдаа');
  assert.match(hv, /setLoadErr\(e instanceof Error/);
  assert.match(hv, /\}, \[pkg, reloadN\]\);/, 'Huvaari: «Дахин оролдох» эффектийг дахин ажиллуулна');
  assert.match(hv, /flowReady === false && canEdit && !loadErr/, 'Huvaari: алдаа ГАНЦ удаа');
  assert.match(hv, /friendlyError\(\{ message: st\.detail/);

  const qa = src('modules/Qaqc.tsx');
  assert.match(qa, /setLoadErr\(e instanceof Error/);
  assert.match(qa, /retry: \(\) => \{ void load\(pkg\.key\); \}/);

  assert.match(src('modules/Gazar.tsx'), /err \? <Data q=\{q\}>/, 'Gazar: шалтгаан + дахин оролдох');
  assert.ok(!src('modules/Gazar.tsx').includes("<Empty label={tr('Алдаа гарлаа')} />"));

  const tuh = src('modules/Tuh.tsx');
  assert.match(tuh, /const retryFailed = useCallback/);
  assert.match(tuh, /onRetry=\{retryFailed\}/);
  assert.match(src('modules/tuh/Overview.tsx'), /onClick=\{onRetry\}/);

  const ua = src('components/UserAdmin.tsx');
  assert.ok(!ua.includes('20 минутын хот'), 'UserAdmin: хуучин брэнд');
  assert.match(ua, /Сэлбэ ухаалаг хот · тохиргоо/);
  assert.match(ua, /opener\?\.isConnected\) opener\.focus\(\)/, 'UserAdmin: хаахад фокус буцна');

  assert.match(src('components/HelpPanel.tsx'), /aria-haspopup="dialog"\]\[aria-expanded="true"\]/);

  const db = src('modules/DedButets.tsx');
  assert.match(db, /\|\| \(awaitDraw && pick == null\)/, 'DedButets: дуусаагүй зураалт navGuard-д');
  assert.match(db, /\}, \[pick, reshaped, awaitDraw\]\);/);
  assert.match(db, /const exitEdit = useCallback\(\(\) => \{[\s\S]{0,300}askDropAll\(/);
}

console.log('✅ UX алдаа: схемийн ангилал · SysDoc техникийн код эвхмэл · эрхийн төрөл retry · эх кодын хамгаалалт');
