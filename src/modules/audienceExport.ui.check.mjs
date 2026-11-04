/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — дэлгэцийн шалгуур (`execExport.ui.check.mjs`-ийн загвар).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/modules/audienceExport.ui.check.mjs
 *
 * Хамгаалж буй зүйл (2026-11-05, хэрэглэгч: «дэлгэцэд харуулахгүй, шууд PDF татдаг болго»):
 *   1. «Тайлан» харагдацад ГУРАВ ДАХЬ горим «Хүлээн авагчийн тайлан» (`aud`) — шинэ ViewKey/cap-гүй; `ExecReport` хөндөгдөөгүй.
 *   2. Дэлгэцэд тайлан, график, хүснэгт ХАРАГДАХГҮЙ — зөвхөн хүлээн авагч · хугацаа · «PDF татах» · «Шинэчлэх».
 *   3. Гараар оруулах талбар алга (зөвхөн огнооны сонголт); хугацааны анхдагч «Өмнөх сар».
 *   4. «PDF татах» дарахад л эх сурвалжууд ачаалагдаж, сонгосон хүлээн авагчийн тайлан бодогдож, `downloadAudiencePdf` дуудагдана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as periods from '../lib/execPeriodCalc.ts';

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const UI = strip(readFileSync(new URL('./AudienceReport.tsx', import.meta.url), 'utf8'));
const TAILAN = strip(readFileSync(new URL('./Tailan.tsx', import.meta.url), 'utf8'));

await ok('Tailan — гурав дахь горим `aud` «Хүлээн авагчийн тайлан», нэг удаа нээгдсэний дараа mount хэвээр', () => {
  assert.match(TAILAN, /\{ value: 'aud', label: tr\('Хүлээн авагчийн тайлан'\) \}/);
  assert.match(TAILAN, /type TailanMode = 'full' \| 'exec' \| 'aud';/);
  assert.match(TAILAN, /\{audSeen && <div style=\{\{ display: mode === 'aud' \? 'contents' : 'none' \}\}><AudienceReport \/><\/div>\}/);
  assert.match(TAILAN, /<div style=\{\{ display: mode === 'exec' \? 'contents' : 'none' \}\}><ExecReport \/><\/div>/, 'ExecReport хэвээр');
  assert.ok(!/ViewKey|hasCap|requireCap/.test(UI), 'шинэ эрх/харагдац хэрэггүй');
});
await ok('дэлгэц — тайлан харагдахгүй (график, хүснэгт, chartSvg алга); гараар оруулах талбар алга; анхдагч «Өмнөх сар»', () => {
  assert.ok(!/<textarea/.test(UI), 'чөлөөт текст');
  const inputs = UI.match(/<input[^>]*>/g) ?? [];
  assert.ok(inputs.length === 2 && inputs.every((s) => s.includes('type="date"')), 'зөвхөн огнооны оролт');
  assert.match(UI, /useState<ExecPeriodKey>\('prevMonth'\)/);
  assert.ok(!/chartSvg|dangerouslySetInnerHTML|<table|<svg|ReportContents|useAsync/.test(UI), 'дэлгэцэд тайлан зурагдав');
  assert.match(UI, /PERIOD_KEYS\.map\(\(k\) =>/);
  assert.match(UI, /auth\.user\?\.fullName \|\| auth\.user\?\.username/, 'хэрэглэгчийн нэр — нэвтрэлтээс');
  assert.match(UI, /const inputs = await loadAudienceInputs\(period, user, now\);\s*const report = buildReport\(aud, inputs\);\s*await downloadAudiencePdf\(report/, 'дарахад л ачаалж, бодож, татна');
});

/* ── Рендер — react-гүй, хуурамч hook-уудаар (`execExport.ui.check.mjs`) ── */
const slots = [];
let cursor = 0, effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const hooks = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { value: initial };
    return [slots[i].value, (value) => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
  },
  useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(fn); } },
};
const jsx = (type, props) => ({ type, props });
const noop = () => {};
const built = [];
const downloads = [];
const loads = [];
let failNext = false;
const mocks = {
  react: hooks,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  '@/lib/i18nCore': { t: (key, ...a) => key.replace(/\{(\d+)\}/g, (_, k) => String(a[k])) },
  '@/components/Icon': { Icon: () => null },
  '@/components/Switch': { Segmented: (p) => jsx('segmented', p) },
  '@/components/AuthGate': { useAuth: () => ({ user: { fullName: 'Тэст Хэрэглэгч', username: 'test' } }) },
  '@/lib/dataBus': { invalidateAll: noop },
  '@/lib/format': { dateTime: () => '2026-11-05 10:00' },
  '@/lib/execPeriodCalc': periods,
  '@/lib/audienceReport': {
    AUDIENCES: ['mayor', 'council', 'board'], audienceLabel: (a) => a,
    buildReport: (aud, inputs) => { const r = { audience: aud, inputs }; built.push(r); return r; },
  },
  '@/lib/audienceReportLoad': { loadAudienceInputs: async (...a) => { loads.push(a); if (failNext) throw new Error('x'); return { period: a[0], user: a[1], failed: loads.length > 1 ? ['saad'] : [] }; } },
  '@/lib/audiencePdf': { downloadAudiencePdf: async (...a) => { downloads.push(a); } },
};
const code = ts.transpileModule(readFileSync(new URL('./AudienceReport.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, console, Date, require: (id) => mocks[id] ?? (id.endsWith('.css') ? { default: {} } : {}) };
vm.runInNewContext(code, context, { filename: 'AudienceReport.tsx' });
const render = () => { cursor = 0; return context.exports.AudienceReport(); };
const nodes = (t) => (Array.isArray(t) ? t.flatMap(nodes) : !t || typeof t !== 'object' ? []
  : [t, ...nodes(typeof t.type === 'function' ? t.type(t.props) : t.props?.children)]);
const text = (node) => (Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' ? node : node?.props ? text(node.props.children) : '');
const button = (tree, label) => { const b = nodes(tree).find((x) => x.type === 'button' && text(x) === label); assert.ok(b, `товч ${label}`); return b; };

await ok('эхлээд юу ч ачаалахгүй; PDF товч идэвхтэй; дарахад ачаалж, сонгосон хүлээн авагчаар бодож, татна', async () => {
  let tree = render();
  for (const f of effects.splice(0)) f();
  tree = render();
  assert.equal(loads.length, 0, 'дарахаас өмнө сүлжээ татагдав');
  assert.ok(!nodes(tree).some((x) => x.type === 'table' || x.type === 'svg' || x.props?.dangerouslySetInnerHTML), 'дэлгэцэд тайлан зурагдав');
  assert.ok(nodes(tree).some((x) => x.type === 'segmented' && x.props.options.length === 3 && x.props.value === 'mayor'));
  const b = button(tree, 'PDF татах');
  assert.equal(b.props.disabled, false);
  await b.props.onClick();
  assert.equal(loads.length, 1);
  assert.equal(loads[0][0].key, 'prevMonth', 'анхдагч хугацаа — өмнөх сар');
  assert.equal(loads[0][1], 'Тэст Хэрэглэгч');
  assert.equal(built.length, 1);
  assert.equal(built[0].audience, 'mayor');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0][0], built[0]);
  assert.equal(downloads[0][1], '2026-11-05 10:00');
  tree = render();
  assert.ok(nodes(tree).some((x) => x.type === 'p' && text(x).startsWith('PDF үүсгэв')), 'амжилтын мэдээ');
});
await ok('хүлээн авагч, хугацаа солиод дахин дарахад тэр сонголтоор; уншигдаагүй эх мэдээнд нэрлэгдэнэ', async () => {
  nodes(render()).find((x) => x.type === 'segmented').props.onChange('board');
  button(render(), periods.periodLabel('7d')).props.onClick();
  await button(render(), 'PDF татах').props.onClick();
  assert.equal(built.at(-1).audience, 'board');
  assert.equal(loads.at(-1)[0].key, '7d');
  const tree = render();
  assert.ok(nodes(tree).some((x) => x.type === 'p' && text(x).includes('Уншигдаагүй эх сурвалж: багцын саад')), 'уншигдаагүй эхийн тайлбар');
});
await ok('ачаалалт унавал алдааны мэдээ, татахгүй', async () => {
  failNext = true;
  const before = downloads.length;
  await button(render(), 'PDF татах').props.onClick();
  assert.equal(downloads.length, before);
  const tree = render();
  assert.ok(nodes(tree).some((x) => x.type === 'p' && x.props.role === 'alert' && text(x).includes('алдаа')));
});

console.log(`\n✅ audienceReport.ui: ${n} шалгуур давлаа`);
