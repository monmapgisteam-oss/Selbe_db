/** PNG/SVG layout regression: long data, complete findings, nulls and signed payments. */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
const elem = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c, querySelector: () => null, querySelectorAll: () => [], ...listeners });
Object.assign(globalThis, {
  window: globalThis, document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], ...listeners },
  localStorage: store(), sessionStorage: store(), matchMedia: () => ({ matches: false, addListener: noop, removeListener: noop, ...listeners }),
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }), history: { pushState: noop, replaceState: noop, back: noop, state: null }, ...listeners,
});
globalThis.fetch = () => Promise.reject(new Error('Offline layout test'));
const { buildInfographic, infographicSize, toSvg, toPng, money } = await import('./execInfographic.ts');
const { computeExecDeltas } = await import('./execPeriodCalc.ts');
const { PRINT_COLORS } = await import('./format.ts');
const { PARCEL_CLEARED } = await import('./services.ts');
const { loadLocaleDict, setLocale } = await import('./i18nCore.ts');
const packs = Array.from({ length: 7 }, (_, i) => ({ key: `b${i}`, name: `Багц ${i + 1}`, kind: 'build', blocks: 16, households: 1100, householdsMissing: 0, progress: i ? 12 + i * 9 : null }));
const report = {
  gdash: {
    budget: 2987654321000, contract: 2456987654000, progress: 38.9, progressPlan: 71.9, progressSrc: 'negtgel', packages: 74, types: 7, landPct: 86.2,
    land: { total: 2380, cleared: 2052, remaining: 328, areaM2: 1894052, byStatus: [{ label: PARCEL_CLEARED, n: 2052, areaM2: 1500000 }, { label: 'Чөлөөлөөгүй', n: 328, areaM2: 394052 }], reasons: [{ label: 'Нөхөх олговрын хэлэлцээр хийгдэж байгаа', n: 120 }, { label: 'Өмчлөл болон эзэмшлийн маргаантай', n: 98 }, { label: 'Бусад', n: 110 }] },
    hse: { date: '2026-10-27', workers: 1284, equipment: 156, manHours: 10272 },
    byType: ['Орон сууцны барилга угсралт', 'Инженерийн дэд бүтэц', 'Авто зам', 'Ногоон байгууламж'].map((label, i) => ({ label, cost: 800123456789 / (i + 1), contract: 600123456789 / (i + 1), perf: i ? 20 + i * 7 : null, n: 10, contracted: 8 })), bySource: [],
  },
  prog: { blocks: 112, households: 7700, householdsMissing: 0, noData: 16, asOf: '2026-10-27', actual: 36.8, actualLag: 36.8, planned: 52.1, gap: 15.3, planCoverage: 100, planFailed: 0, planExcluded: [], packs, levels: [{ label: 'Эхлээгүй', range: '0%', n: 16, color: PRINT_COLORS.ink3 }, { label: 'Хийгдэж буй', range: '1–99%', n: 96, color: PRINT_COLORS.data }] },
  fin: { planTotal: 2456987654000, given: 530876543210, givenContracted: 524908765432, givenOther: 5967777778, share: 21.4, remain: 1932078888568, rows: packs.map((p, i) => ({ key: p.key, label: p.name, plan: 300000000000, budget: 350000000000, given: 20000000000 + i * 5000000000, pct: (20000000000 + i * 5000000000) / 3000000000, contracted: true })) },
  zov: { total: 68, ok: 52, wait: 12, no: 4, unknown: 0, byBagts: packs.map((p) => ({ bagts: p.name, total: 10, ok: 7, wait: 2, no: 1, unknown: 0 })), issues: [{ bagts: 'Багц 2', ner: 'Барилга угсралтын ажлыг эхлүүлэх зөвшөөрөл', baiguullaga: 'Нийслэлийн хот байгуулалт, хөгжлийн газар', tolov: 'Хүлээгдэж буй', shat: 1 }, { bagts: 'Багц 5', ner: 'Техникийн нөхцөл', baiguullaga: 'Улаанбаатар дулааны сүлжээ', tolov: 'Зөвшөөрөөгүй', shat: 2 }] }, fetchedAt: 0,
};
const period = { key: '30d', from: '2026-09-28', to: '2026-10-28' };
const deltas = computeExecDeltas({ housing: [{ at: '2026-09-27', v: 30 }, { at: '2026-10-27', v: 36.8 }], packs: packs.map((p) => ({ key: p.key, label: p.name, points: [{ at: '2026-09-27', v: p.progress == null ? null : p.progress - 5 }, { at: '2026-10-27', v: p.progress }] })), pays: [{ key: 'b1', at: new Date('2026-10-14T12:00:00').getTime(), amount: 20123456789 }], givenTotal: report.fin.given, days: [{ key: '2026-09-27', workers: 1200, technik: 140 }, { key: '2026-10-27', workers: 1284, technik: 156 }], zov: [] }, period);
deltas.series = { months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], housingPlan: [null, null, null, null, 40, 52.1], housingActual: [null, null, null, null, 30, 36.8], packs: packs.map((p) => ({ key: p.key, label: p.name, kind: 'build', values: [null, null, null, null, p.progress == null ? null : p.progress - 5, p.progress] })), paidMonthly: [0, 34567890123, -1234567890, 41234567890, 33123456789, 20123456789], paidCum: [], paidPct: [] };
const findings = ['Багц 2: барилга угсралтын зөвшөөрөл хүлээгдэж байна. Хариуцсан байгууллагатай шийдвэрлэх хугацааг тохирох шаардлагатай.', 'Орон сууцны барилга угсралт төлөвлөгөөнөөс 15.3 нэгж хувиар хоцорч байна.', 'Газар чөлөөлөлтийн үлдсэн 328 нэгж талбарын асуудлыг багцын ажлын хуваарьтай уялдуулан шийдвэрлэх.'];
const ops = buildInfographic(report, '2026.10.28 14:30', findings, null, deltas);
function bounds(list) {
  const { width, height } = infographicSize(list);
  for (const o of list) {
    const vals = Object.values(o).filter((v) => typeof v === 'number');
    assert.ok(vals.every(Number.isFinite), JSON.stringify(o));
    if (o.k === 'rect') assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= width + 0.01 && o.y + o.h <= height + 0.01 && o.w >= 0 && o.h >= 0, JSON.stringify(o));
    if (o.k === 'text') assert.ok(o.x >= 0 && o.x <= width && o.y >= o.size && o.y <= height, JSON.stringify(o));
  }
  assert.ok(toSvg(list).includes(`height="${height}"`));
}
bounds(ops);
assert.equal(money(null), '—');
assert.equal(money(0), '0 ₮');
assert.ok(ops.some((o) => o.k === 'text' && o.s === money(-1234567890)), 'refund amount must be visible');
assert.ok(ops.some((o) => o.k === 'text' && o.s === '—'), 'missing measurements remain missing');
const text = (list) => list.filter((o) => o.k === 'text').map((o) => o.s).join(' ').replace(/\s+/g, ' ');
assert.ok(text(ops).includes(findings[0]));
const summary = Array.from({ length: 35 }, (_, i) => `${i + 1}. ${findings[i % findings.length]}`).join('\n');
const long = buildInfographic(report, '2026.10.28', [], summary, deltas);
bounds(long);
assert.ok(infographicSize(long).height > infographicSize(ops).height, 'long summary must grow page');
assert.ok(text(long).includes(`35. ${findings[1]}`), 'last summary paragraph must survive');
const empty = structuredClone(report);
empty.gdash.hse = null; empty.gdash.byType = []; empty.gdash.land.byStatus = []; empty.gdash.land.reasons = [];
empty.fin.given = null; empty.fin.share = null; empty.fin.rows = []; empty.prog.packs = []; empty.prog.levels = []; empty.zov = null;
bounds(buildInfographic(empty, '2026.10.28', [], null));
const large = structuredClone(report);
large.prog.packs[0].name = 'Маш урт нэр бүхий орон сууцны барилга угсралтын багцын нэр '.repeat(3);
large.zov.issues = Array.from({ length: 12 }, () => ({ ...large.zov.issues[0], ner: large.prog.packs[0].name }));
large.gdash.byType = Array.from({ length: 9 }, () => ({ ...large.gdash.byType[0], label: large.prog.packs[0].name }));
bounds(buildInfographic(large, '2026.10.28', findings, null, deltas));
// Canvas dimensions follow the very same page extent, including tall output.
const canvas = { width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, p) => p === 'roundRect' ? undefined : noop, set: () => true }), toDataURL: () => 'data:image/png;base64,ok' };
document.createElement = () => canvas;
assert.equal(toPng(long, 2), 'data:image/png;base64,ok');
assert.equal(canvas.width, 2480);
assert.equal(canvas.height, infographicSize(long).height * 2);
await loadLocaleDict('en'); setLocale('en');
const english = buildInfographic(report, '2026.10.28', findings, null, deltas);
bounds(english);
if (process.env.INFO_PREVIEW_DIR) {
  const dir = process.env.INFO_PREVIEW_DIR; mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preview.svg'), toSvg(ops));
  writeFileSync(join(dir, 'english.svg'), toSvg(english));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  // Actual production Canvas renderer, executed in the browser visual check.
  writeFileSync(join(dir, 'preview.html'), `<body style="margin:0;background:#f4f6f9"><script>const INFO_W=1240,INFO_H=1754,FONT="'Segoe UI', 'Noto Sans', Arial, sans-serif",tr=s=>s;${infographicSize.toString()};${toPng.toString()};const ops=${JSON.stringify(ops)};const result=toPng(ops,2);document.body.innerHTML='<img style="width:620px" src="'+result+'">';window.png=result;</script>`);
}
console.log(`execInfographic: bounds, long text, currencies, refunds, empty data, SVG/Canvas dimensions and English passed (${infographicSize(ops).width}×${infographicSize(ops).height})`);
process.exit(0);
