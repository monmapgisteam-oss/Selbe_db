import assert from 'node:assert/strict';
const g = globalThis;
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
Object.assign(g, { window: g, document: { documentElement: { lang: 'mn' }, body: {}, activeElement: null, hidden: false, ...listeners }, localStorage: store(), sessionStorage: store(), matchMedia: () => ({ matches: false, ...listeners }), confirm: () => false, ...listeners });
if (!g.navigator) g.navigator = {};

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { PlanModal } = await import('@/modules/huvaari/PlanModal');

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const row = (spans, vol = 900) => ({ i: 0, oid: 7, no: '1.1', des: 11, deps: [], work: 'Ажил', depth: 1, group: false, vol, spans, act: [null], aStart: [null], aEnd: [null], hun: null, mashin: null });
const M = (o) => new Map(Object.entries(o));

function render(r, months, extra = {}) {
  const html = renderToStaticMarkup(React.createElement(PlanModal, {
    r, par: null, blocks: ['B1'], blk: 0, takt: 0, canEdit: true, onBlk: noop, onTakt: noop, cands: [],
    hasHam: false, hasActual: false, hasRes: false, obyem: true, months, res: new Map(),
    resFields: { hun: true, mashin: true }, onClose: noop, onApply: noop, ...extra,
  }));
  const btn = /<button[^>]*class="save"[^>]*>Тавих<\/button>/.exec(html)?.[0] ?? '';
  return { html, btn, disabled: /\bdisabled=""/.test(btn), title: /title="([^"]*)"/.exec(btn)?.[1] ?? '' };
}

// 1. total 900, Oct–Dec, {10:300,11:300,12:300} → OK
let o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, false, `зөв хуваасан → Тавих идэвхтэй: ${o.btn}`);
assert.ok(o.html.includes('нийт обьёмтой тэнцэв'), 'тэнцэв гэж харагдана');
// 2. range shortened Oct–Nov, stored months include Dec → filtered 600 → disabled, "300 дутуу"
o = render(row([span('2026-10-01', '2026-11-30')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, true, 'богиносгосон муж → 600 ≠ 900 → хаалттай');
assert.ok(o.html.includes('дутуу'), 'дутуу гэж харагдана');
// 3. range extended Oct–Jan → Jan empty → disabled
o = render(row([span('2026-10-01', '2027-01-31')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, true, 'сунгасан муж → 1-р сар хоосон → хаалттай');
// 4. no volume → no month section, enabled
o = render(row([span('2026-10-01', '2026-12-31')], null), new Map());
assert.equal(o.disabled, false, 'обьёмгүй → Тавих идэвхтэй');
// 5. fractional total 900.35 split exact → OK
o = render(row([span('2026-10-01', '2026-12-31')], 900.35), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300.35 }));
assert.equal(o.disabled, false, 'бутархай нийт → яг хуваасан → идэвхтэй');
// 6. months prop has extra out-of-range month but visible sum correct → OK
o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-09': 50, '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, false, `мужаас гадуурх сар тоологдохгүй → идэвхтэй: ${o.btn}`);
// 7. geree tab (obyem=false) → no month gate
o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-10': 1 }), { obyem: false });
assert.equal(o.disabled, false, 'гэрээ таб → сарын дүрэмгүй');
// 8. no own span, parent span prefill; months empty → disabled (needs fill), but no crash
o = render(row([null]), new Map(), { par: { ...row([span('2026-10-01', '2026-12-31')]), oid: 1, group: true, depth: 0 } });
assert.equal(o.disabled, true, 'урьдчилан бөглөсөн муж, сар хоосон → хаалттай');

/* ── 2026-09-30 РЕГРЕСС: «обьём зөв хуваасан ч болохгүй» ── */
// 9. Нийлбэр ТЭНЦСЭН, нэг сар ХООСОН (10-01 → 2027-01-05 = 4 сар) → хаалттай, ГЭХДЭЭ шалтгаан нь
//    хоосон сар; «-0.00 дутуу» / «нийлбэр тэнцээгүй» гэж ХУДАЛ хэлэхгүй.
o = render(row([span('2026-10-01', '2027-01-05')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, true, 'хоосон сартай → хаалттай (дүрэм хэвээр)');
assert.ok(o.html.includes('хоосон сар: 2027-01'), `хоосон сарыг нэрлэнэ: ${o.html.slice(o.html.indexOf('Нийлбэр'), o.html.indexOf('Нийлбэр') + 300)}`);
assert.ok(!o.html.includes('дутуу') && !o.html.includes('-аар илүү'), 'тэнцсэн нийлбэрт «дутуу/илүү» гэж бичихгүй');
assert.ok(o.html.includes('нийт обьёмтой тэнцэв'), 'нийлбэр тэнцсэнийг үнэнээр хэлнэ');
assert.ok(/Хоосон сар бий/.test(o.title) && !/тэнцээгүй/.test(o.title), `товчны тайлбар жинхэнэ шалтгаан: ${o.title}`);
// 9б. Тэр сард 0 бичвэл нээгдэнэ
o = render(row([span('2026-10-01', '2027-01-05')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300, '2027-01': 0 }));
assert.equal(o.disabled, false, '0 бичсэн → идэвхтэй');
// 9в. Нийлбэр тэнцээгүй бол хуучин мессеж хэвээр
o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 200 }));
assert.ok(o.html.includes('дутуу') && /тэнцээгүй/.test(o.title), 'дутуу нийлбэр → «дутуу» + «тэнцээгүй»');
// 10. 3 оронтой x.xx5 нийт — харагдах бөөрөнхийлсөн утгаар бөглөхөд нээгдэнэ (balanced-ийн тэвчээр)
o = render(row([span('2026-10-01', '2026-10-31')], 0.125), M({ '2026-10': 0.13 }));
assert.equal(o.disabled, false, `0.125 → 0.13 идэвхтэй: ${o.btn}`);
o = render(row([span('2026-10-01', '2026-11-30')], 1234.875), M({ '2026-10': 600, '2026-11': 634.88 }));
assert.equal(o.disabled, false, '1234.875 → 600 + 634.88 идэвхтэй');
// 11. ОБЬЁМТОЙ БҮЛЭГ — сарын нүд ГАРАХГҮЙ (бүлгийн «Тавих» сарыг бичдэггүй), шалтгаан харагдана
o = render({ ...row([span('2026-10-01', '2026-12-31')]), group: true, depth: 0 }, M({}));
assert.ok(!o.html.includes('mdMonthGrid') && !o.html.includes('mdMonthIn'), 'бүлэгт сарын нүд алга');
assert.ok(o.html.includes('доторх ажил тус бүрийн цонхонд'), 'бүлэгт шалтгаан харагдана');
console.log('✓ PlanModal SSR: 11 тохиолдол');

/* ── 12. (2026-10-01, хэрэглэгч: бүгдийг зас) ТЭНЦЭЭГҮЙ БЛОКИЙН ЧИП УЛААН ──
   Асуудалтай блок шууд олдоно: идэвхгүй блок — дуудагчийн `badBlks`; идэвхтэй блок —
   цонхны одоогийн оролтоор (нийлбэр тэнцээгүй бол). Өнгө ганцаараа биш — «⚠» ба title. */
{
  const two = (spans, vol = 900) => ({ ...row(spans, vol), act: [null, null], aStart: [null, null], aEnd: [null, null] });
  const chips = (html) => [...html.matchAll(/<button[^>]*class="mdChip[^"]*"[^>]*>([^<]*)<\/button>/g)].map((m) => ({ cls: /class="([^"]*)"/.exec(m[0])[1], txt: m[1] }));
  const sp = span('2026-10-01', '2026-12-31');
  // идэвхтэй B1 тэнцсэн, B2 (идэвхгүй) дуудагчийн хэлснээр тэнцээгүй
  let h2 = render(two([sp, sp]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }), { blocks: ['B1', 'B2'], badBlks: new Set([1]) }).html;
  let c = chips(h2);
  assert.equal(c.length, 2, `2 чип: ${JSON.stringify(c)}`);
  assert.ok(!/mdChipBad/.test(c[0].cls) && c[0].txt === 'B1', 'тэнцсэн идэвхтэй блок улаан биш');
  assert.ok(/mdChipBad/.test(c[1].cls) && c[1].txt.includes('⚠') && c[1].txt.includes('B2'), `тэнцээгүй B2 улаан + ⚠: ${JSON.stringify(c[1])}`);
  assert.ok(h2.includes('сарын задаргааны нийлбэр обьёмтой тэнцэхгүй'), 'улаан чипийн тайлбар');
  // идэвхтэй блокийн ОДООГИЙН оролт тэнцээгүй → улаан (badBlks-ээс үл хамааран)
  h2 = render(two([sp, sp]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 200 }), { blocks: ['B1', 'B2'], badBlks: new Set() }).html;
  c = chips(h2);
  assert.ok(/mdChipBad/.test(c[0].cls), 'идэвхтэй блокийн тэнцээгүй нийлбэр улаан');
  assert.ok(!/mdChipBad/.test(c[1].cls), 'B2 улаан биш');
  // утга огт бичээгүй идэвхтэй блок — дуудагчийн дүгнэлтээр (хоосон = асуудалгүй)
  h2 = render(two([sp, sp]), new Map(), { blocks: ['B1', 'B2'] }).html;
  assert.ok(chips(h2).every((x) => !/mdChipBad/.test(x.cls)), 'задаргаагүй блок улаан биш');
  // бүлэгт хэзээ ч улаан биш
  h2 = render({ ...two([sp, sp]), group: true, depth: 0 }, M({ '2026-10': 1 }), { blocks: ['B1', 'B2'], badBlks: new Set() }).html;
  assert.ok(chips(h2).every((x) => !/mdChipBad/.test(x.cls)), 'бүлгийн чип улаан биш');
}
console.log('✓ PlanModal SSR: тэнцээгүй блокийн улаан чип');

/* 2026-10-04 (шүүлт): олон блокт `@N` хуулахад `Hamaaral` (255) хэтэрвэл «Тавих» хаагдана */
{
  const B = Array.from({ length: 22 }, (_, i) => `B${i + 1}`);
  const sel = new Set(Array.from({ length: 21 }, (_, i) => i)); // 22-оос 21 — блокгүй болгохгүй
  const deps = [{ code: 5, type: 'FS', lag: 13, blk: 0 }, { code: 6, type: 'SS', lag: -12, blk: 0 }, { code: 8, type: 'FS', lag: 0, blk: 0 }];
  const cands = [5, 6, 8].map((c) => ({ code: c, label: `w${c}` }));
  const base = { ...row([span('2026-10-01', '2026-12-31')], null), deps };
  let o = render(base, new Map(), { blocks: B, initSel: sel, hasHam: true, cands });
  assert.equal(o.disabled, true, `хэт урт уялдаа → Тавих хаалттай: ${o.btn}`);
  assert.ok(/талбарт багтахгүй/.test(o.title), `шалтгаан title-д: ${o.title}`);
  // цөөн блок → багтана → идэвхтэй
  o = render(base, new Map(), { blocks: B, initSel: new Set([0, 1, 2]), hasHam: true, cands });
  assert.equal(o.disabled, false, `багтах уялдаа → Тавих идэвхтэй: ${o.btn}`);
  // танигдаагүй токен (hamKeep) ч тоологдоно
  o = render(base, new Map(), { blocks: B, initSel: new Set([0, 1, 2]), hasHam: true, cands, hamKeep: ['X'.repeat(240)] });
  assert.equal(o.disabled, true, 'hamKeep + уялдаа > 255 → хаалттай');
}
console.log('✓ PlanModal SSR: Hamaaral 255 хамгаалалт');
{
  const fs = await import('node:fs');
  const SP = fs.readFileSync('src/modules/huvaari/savePrep.ts', 'utf8');
  assert.ok(/export const HAM_MAX = 255;/.test(SP), 'HAM_MAX алга');
  assert.ok(/text\.trim\(\)\.length > HAM_MAX/.test(SP) && /return \{ ok: false, stale: 0, hamLong \}/.test(SP), 'savePrep урт уялдааг татгалзахгүй');
  assert.ok(SP.indexOf('hamLong') < SP.indexOf('for (const [oid, text] of ham) {'), 'savePrep шалгалт бичилтийн бэлтгэлээс хойно');
}
console.log('✓ savePrep: урт уялдаа тайрахгүй, татгалзана');
