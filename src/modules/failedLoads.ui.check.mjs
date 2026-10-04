/**
 * УНАСАН АЧААЛАЛ ХУДАЛ 0 / «алга» болж харагдахгүй (⚠️ 2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/failedLoads.ui.check.mjs
 *
 * §1 `userError`: түүхий англи серверийн мөр → ойлгомжтой мессеж; монгол мессеж хэвээр;
 *    «Token Required · Token Required» давхардал нэг болно.
 * §2 Тайлангийн огноо: хоёр хэлэнд `YYYY-MM-DD HH:mm` (англид MM/DD биш).
 * §3 Эх кодын хамгаалалт: catch-ийн `String(e.message)` үлдээгүй · Chanar/Guitsetgel/Ersdel/
 *    Dashboard/GeneralDash-ийн тоо ба хоосон төлөв алдаанд нуугдана · анализын retry ·
 *    ачаалалтын дэлгэц алдаанд хаагдана · DatePicker `value` дагана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError, userError } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { setLocale } from '@/lib/i18nCore';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ── §1 userError ── */
{
  const perm = friendlyError(new Error('Token Required'));
  assert.equal(userError(new Error('Token Required · Token Required')), perm, 'давхардал + англи → эрхийн мессеж');
  assert.equal(userError(new TypeError('Failed to fetch')), friendlyError(new TypeError('Failed to fetch')));
  const te = new Error('aborted'); te.name = 'TimeoutError';
  assert.equal(userError(te), friendlyError(te), '`name` хадгалагдана');
  const mn = 'Энэ ажлыг өөр хэрэглэгч шийдвэрлэсэн.';
  assert.equal(userError(new Error(mn)), mn, 'монгол домэйн мессеж хэвээр');
  assert.equal(userError(mn), mn, 'мөр ч хүлээн авна');
  assert.equal(
    userError(new Error('Бичихийн өмнөх шалгалт унав: Token Required')),
    `Бичихийн өмнөх шалгалт унав: ${perm}`,
    'монгол угтвар + англи сүүл → сүүл орчуулагдана',
  );
  assert.equal(userError(new Error('А · А · Б')), 'А · Б');
  assert.ok(userError(null).length > 0);
  assert.ok(!/Token Required/.test(userError(new Error('Token Required'))));
}

/* ── §2 Огноо ── */
{
  const ms = new Date(2026, 9, 4, 14, 5).getTime();
  assert.equal(dateTime(ms), '2026-10-04 14:05');
  setLocale('en');
  assert.equal(dateTime(ms), '2026-10-04 14:05', 'англид ч ижил — MM/DD биш');
  setLocale('mn');
  assert.equal(dateTime(null), '—');
}

/* ── §3 Эх кодын хамгаалалт ── */
{
  const RAW = /String\(\(?(\w+)(?: as Error)?\)?\??\.message (?:\|\||\?\?) \1\)/;
  for (const f of [
    'components/IpcDocDialog.tsx', 'modules/AjilBatlah.tsx', 'modules/CashflowPlan.tsx', 'modules/Chanar.tsx',
    'modules/DedButets.tsx', 'modules/DedButetsBatch.tsx', 'modules/DedButetsEdit.tsx', 'modules/Finance.tsx',
    'modules/Gazar.tsx', 'modules/GazarEdit.tsx', 'modules/Guitsetgel.tsx', 'modules/Huvaari.tsx',
    'modules/HuvaariBatlah.tsx', 'modules/Qaqc.tsx', 'modules/sheet/FillNew.tsx', 'modules/ZovshoorolEdit.tsx',
  ]) assert.ok(!RAW.test(src(f)), `${f}: түүхий e.message дэлгэцэнд`);
  for (const f of ['modules/Habea.tsx', 'modules/habeaUzleg.tsx', 'components/PackLayers.tsx', 'modules/DedButets.tsx']) {
    assert.ok(!/\{0\}', (q|weekScores|totals)\.error\.message\)/.test(src(f)), `${f}: friendlyError`);
  }

  const ch = src('modules/Chanar.tsx');
  assert.match(ch, /const listFailed = loadErr \|\|/);
  assert.match(ch, /listFailed \? '—' : counts\[k\]/, 'Chanar: табын тоо');
  assert.match(ch, /listFailed \? '—' : actionable\.length/, 'Chanar: «Миний хийх (N)»');
  assert.match(ch, /heads\.length === 0 && !loading && !listFailed/, 'Chanar: хоосон төлөв');
  assert.match(ch, /\{!listFailed && \(\s*<div className=\{s\.summary\}/, 'Chanar: хураангуй');
  assert.match(ch, /setNcrFlagsErr\(nf == null\)/, 'Chanar: NCR туг унасан анхааруулга');
  assert.match(src('lib/chanarStore.ts'), /countChanarActionable\(user: string \| null \| undefined\): Promise<number \| null>[\s\S]{0,300}if \(!st\.ok\) return null;[\s\S]{0,200}catch \{\s*return null;/, 'тэмдэг: алдаанд null');

  const gs = src('modules/Guitsetgel.tsx');
  assert.match(gs, /const loadFailed = !!error && rows\.length === 0;/);
  assert.match(gs, /\{!loadFailed && <span className=\{s\.total\}>/, 'Guitsetgel: «0 ажил»');
  assert.match(gs, /\) : loadFailed \? null : \(/, 'Guitsetgel: «хүлээгдэж буй 0» · «алга»');

  const er = src('modules/Ersdel.tsx');
  assert.match(er, /q\.state === 'ready' && <span className=\{e\.panelNote\}>\{tr\('\{0\} харуул', num\(water\.length\)\)\}/);
  assert.match(er, /q\.state === 'ready' && <span className=\{e\.panelNote\}>\{tr\('\{0\} харуул', num\(air\.length\)\)\}/);

  const db = src('modules/Dashboard.tsx');
  assert.ok(!db.includes(': h.keys())'), 'Dashboard: багц унасан үед h.keys() руу чимээгүй буухгүй');
  assert.match(db, /d\.bagts\.state === 'error'/);

  const gd = src('modules/GeneralDash.tsx');
  assert.match(gd, /const builtFailed = hq\.state === 'error' \|\| \(hq\.state === 'ready' && Number\.isNaN\(hq\.data\.usableM2\)\)/);

  const su = src('modules/analysis/Suitability.tsx');
  assert.ok(!/\.catch\(\(\) => \{ \/\* тэр сүлжээ унасан/.test(su), 'Suitability: багтаамжийн алдаа чимээгүй');
  assert.match(su, /onRetry: \(\) => \{ setRoadErr\(null\); setRoadNet\(null\);/, 'Suitability: retry roadErr цэвэрлэнэ');
  assert.match(src('modules/analysis/suit/SimulationPanel.tsx'), /road\.error\}[\s\S]{0,120}road\.onRetry && /, 'SimulationPanel: замын алдаанд retry');

  const pt = src('components/Portal.tsx');
  assert.match(pt, /querySelector\('\[data-boot-fail\], \[role="alert"\]'\)/, 'Booting: алдаанд хаагдана');
  assert.match(pt, /tries > 26\) setDone\(true\)/, 'Booting: дээд хязгаар ~8с');
  assert.match(src('components/MapCanvas.tsx'), /data-boot-fail=\{!ready && initError \? '' : undefined\}/);
  assert.match(src('modules/Habea.tsx'), /hint=\{friendlyError\(q\.error\)\}/, 'ХАБЭА: шалтгаан');

  const dp = src('modules/sheet/DatePicker.tsx');
  assert.match(dp, /if \(typedOf !== value\) \{ setTypedOf\(value\); setTyped\(value\); \}/, 'DatePicker: value дагана');
  assert.match(dp, /else if \(typed\.trim\(\) === "" && arrowedRef\.current\) onPick\(ymd\(focusMs\)\);/, 'DatePicker: хоосон Enter + сум');

  assert.match(src('components/ZoneFilter.tsx'), /\{zoneLabel\(z\)\}/, 'бүсийн нэр орчуулагдана');
  assert.match(pt, /zonesLabel\(zone\.split/);
  for (const f of ['modules/Chanar.tsx', 'modules/Huvaari.tsx', 'modules/Qaqc.tsx']) {
    assert.ok(src(f).includes('<option key={g} value={g}>{tr(g)}</option>'), `${f}: багцын нэр англиар`);
  }
}

console.log('✅ Унасан ачаалал: userError · тайлангийн огноо · тоо/хоосон төлөвийн хамгаалалт · retry · ачаалалтын дэлгэц');
