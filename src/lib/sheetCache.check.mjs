/**
 * БӨГЛӨХ ХУУДАСНЫ ЖААЗНЫ ХӨТЧИЙН КЭШ — тандалт · таарах/зөрөх · хүчингүй болгох · IndexedDB алга (2026-10-22).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sheetCache.check.mjs
 *
 * Хамгаалах алдаа:
 *   1. Тандалтын тэмдэг өөрчлөгдсөн (мөр нэмэгдсэн · устсан · газар дээр засагдсан) атлаа хадгалсан мөр буцвал самбар
 *      ЧИМЭЭГҮЙ хуучин тоо харуулна.
 *   2. Тандалтыг ТАТЛАГЫН ДАРАА авбал хооронд орсон засвар хуучин өгөгдлийг шинэ тэмдэгтэй хадгалж мөнхөд хуучруулна.
 *   3. Кодлол объектыг ЯГ сэргээхгүй бол (түлхүүрийн дараалал · null · мөр) кэштэй ба кэшгүй зам өөр тоо өгнө.
 *   4. Аппын өөрийн бичилт (`BAGTS_SHEET`) кэшийг хаяхгүй, эсвэл «↻ Шинэчлэх» (`invalidateAll`) бүх кэшийг хаяна.
 *   5. IndexedDB алга (Node · хувийн горим) үед алдаа шидэх эсвэл илүү хүсэлт явуулах.
 *   6. Бичих (`strict`) / тодорхой агшны (`atDay`) уншилт кэшээс авах.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  probeStats, sigFrom, sameSig, frameHit, frameKey, encodeFeats, decodeFeats, persistedFrame, setFrameStore,
  FRAME_VER, MAX_AGE_MS, EDIT_DATE_FIELD,
} from './sheetCache.ts';
import { invalidate, invalidateAll } from './dataBus.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── 5. IndexedDB АЛГА (Node) → no-op: тандалтгүй, хуучин зам (ЭХЭНД — анхдагч сан энд шийдэгдэнэ) ── */
{
  let probed = 0;
  const loads = [];
  const fr = await persistedFrame('u0', ['a'], async () => { probed += 1; return null; }, async (s) => { loads.push(s); return { where: 'w', feats: [] }; });
  assert.equal(probed, 0, 'IndexedDB алга — тандалт явахгүй (илүү хүсэлтгүй)');
  assert.deepEqual(loads, [null], 'хуучин зам (`latestWhere` өөрөө max асууна)');
  assert.deepEqual(fr, { where: 'w', feats: [] });
}

/* ── 1. Тандалтын статистик — энгийн талбар, editor tracking-ийн огноо ── */
{
  const st = JSON.parse(probeStats('objectid', 'buglusun_ognoo'));
  assert.deepEqual(st.map((s) => s.outStatisticFieldName), ['n', 'lo', 'hi', 'le', 'mx']);
  assert.deepEqual(st.map((s) => s.statisticType), ['count', 'min', 'max', 'max', 'max']);
  assert.equal(st[3].onStatisticField, EDIT_DATE_FIELD);
  assert.equal(EDIT_DATE_FIELD, 'last_edited_date');
  assert.ok(st.every((s) => /^[\wЀ-ӿ]+$/.test(s.onStatisticField)), 'зөвхөн энгийн талбар — илэрхийлэл (CURRENT_TIMESTAMP) Enterprise-д 500');
  assert.equal(JSON.parse(probeStats('objectid', null)).length, 4, 'огноогүй хуудсанд mx асуухгүй');
}

/* ── 1. Тэмдэг ── */
{
  const a = { n: 1471, lo: 1, hi: 8319, le: 1792486069000, mx: 1791676800000 };
  assert.deepEqual(sigFrom(a, true), a);
  assert.equal(sigFrom(a, false).mx, null, 'огноогүй бүдүүвчид mx тооцохгүй');
  assert.equal(sigFrom(null, true), null);
  assert.equal(sigFrom({ ...a, n: null }, true), null, 'тоо алга — танихгүй');
  assert.equal(sigFrom({ ...a, n: '5' }, true), null, 'тоо биш — танихгүй');
  assert.equal(sigFrom({ ...a, le: null }, true), null, 'мөртэй атлаа засварын огноо хоосон — газар дээрх засварыг таньж чадахгүй тул кэшгүй');
  assert.deepEqual(sigFrom({ n: 0, lo: null, hi: null, le: null, mx: null }, true), { n: 0, lo: null, hi: null, le: null, mx: null }, 'хоосон хүснэгт хүчинтэй');
  for (const k of ['n', 'lo', 'hi', 'le', 'mx']) {
    assert.equal(sameSig(a, { ...a, [k]: a[k] + 1 }), false, `${k} өөрчлөгдвөл зөрнө`);
  }
  assert.equal(sameSig(a, { ...a }), true);

  const rec = { v: FRAME_VER, at: 1000, sig: a, where: 'W', enc: { keys: [], cols: [], n: 0 } };
  assert.equal(frameHit(rec, a, 1000 + 5), true);
  assert.equal(frameHit(rec, { ...a, le: a.le + 1 }, 1005), false, 'газар дээрх засвар → зөрнө');
  assert.equal(frameHit(rec, { ...a, n: a.n + 1471, hi: a.hi + 1471 }, 1005), false, 'шинэ жааз → зөрнө');
  assert.equal(frameHit({ ...rec, v: FRAME_VER + 1 }, a, 1005), false, 'хувилбар зөрвөл ашиглахгүй');
  assert.equal(frameHit(rec, a, 1000 + MAX_AGE_MS), false, 'хэт хуучин — тандалт таарсан ч дахин татна');
  assert.equal(frameHit(rec, a, 999), false, 'ирээдүйн `at` (цагийн зөрүү) — ашиглахгүй');
  assert.equal(frameHit(null, a, 1005), false);
  assert.notEqual(frameKey('u', ['a', 'b']), frameKey('u', ['b', 'a']), 'баганын дараалал түлхүүрт орно');
}

/* ── 3. Кодлол — ЯГ сэргээнэ ── */
{
  const feats = [
    { attributes: { Обьём: 12.5, objectid: 7, F_: 'Б.', Ажил: 'Барилга угсралт', gun: 0, d: null } },
    { attributes: { Обьём: null, objectid: 8, F_: '1', Ажил: '', gun: 1, d: 1790553600000 } },
  ];
  const e = encodeFeats(feats);
  assert.deepEqual(e.keys, ['Обьём', 'objectid', 'F_', 'Ажил', 'gun', 'd'], 'серверийн түлхүүрийн ДАРААЛАЛ хадгалагдана');
  const back = decodeFeats(structuredClone(e));
  assert.deepEqual(back, feats);
  for (let i = 0; i < feats.length; i += 1) {
    assert.deepEqual(Object.keys(back[i].attributes), Object.keys(feats[i].attributes), 'түлхүүрийн дараалал');
  }
  assert.notEqual(decodeFeats(e)[0], decodeFeats(e)[0], 'задлах бүрд ШИНЭ объект (дуудагчид хуваалцахгүй)');
  assert.deepEqual(decodeFeats(encodeFeats([])), []);
  assert.equal(encodeFeats([{ attributes: { a: 1 } }, { attributes: { b: 1 } }]), null, 'өөр түлхүүр — кэшлэхгүй');
  assert.equal(encodeFeats([{ attributes: { a: 1, b: 2 } }, { attributes: { b: 2, a: 1 } }]), null, 'өөр дараалал — кэшлэхгүй');
  assert.equal(encodeFeats([{ attributes: { a: { x: 1 } } }]), null, 'скаляр биш утга — кэшлэхгүй');
  assert.equal(encodeFeats([{ attributes: { a: 1 }, geometry: null }]), null, 'attributes-аас өөр түлхүүр — кэшлэхгүй');
  assert.equal(decodeFeats({ keys: ['a'], cols: [[1, 2]], n: 3 }), null, 'эвдэрсэн бичлэг — ашиглахгүй');
  assert.equal(decodeFeats(null), null);
}

/* ── 1 · 2 · 4. Амьдрал — санах ойн сан ── */
{
  const m = new Map();
  let puts = 0;
  setFrameStore({
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    put: async (k, r) => { puts += 1; m.set(k, structuredClone(r)); },
    clear: async () => { m.clear(); },
  });
  const URL = 'https://x/Hosted/Guitsetgel_talbe/FeatureServer/155';
  const FIELDS = ['objectid', 'F_', 'Ажил'];
  let server = { n: 3, lo: 1, hi: 3, le: 100, mx: 50 };
  let rows = [{ attributes: { objectid: 1, F_: 'Б.', Ажил: 'a' } }, { attributes: { objectid: 2, F_: '1', Ажил: 'b' } }];
  const events = [];
  const probe = async () => { events.push('probe'); return sigFrom(server, true); };
  const load = async (s) => { events.push(`load:${s ? s.mx : 'null'}`); return { where: `W${server.mx}`, feats: structuredClone(rows) }; };

  /* хоосон сан → тандалт ЭХЭЛЖ, дараа нь татлага (max нь тандалтаас) */
  const r1 = await persistedFrame(URL, FIELDS, probe, load);
  assert.deepEqual(events, ['probe', 'load:50'], 'тандалт татлагаас ӨМНӨ; mx дамжина');
  await tick();
  assert.equal(m.size, 1);
  assert.deepEqual(m.get(frameKey(URL, FIELDS)).sig, server, 'тандалтын (ТАТЛАГААС ӨМНӨХ) тэмдэг хадгалагдана');

  /* өөрчлөгдөөгүй → сүлжээгүй, ижил өгөгдөл */
  events.length = 0;
  const r2 = await persistedFrame(URL, FIELDS, probe, load);
  assert.deepEqual(events, ['probe'], 'таарвал татахгүй');
  assert.deepEqual(r2, r1);
  assert.notEqual(r2.feats[0], r1.feats[0]);

  /* өөр баганын жагсаалт — тусдаа бичлэг */
  events.length = 0;
  await persistedFrame(URL, ['objectid'], probe, load);
  assert.deepEqual(events, ['probe', 'load:50']);

  /* газар дээрх засвар (le) → дахин татна, шинэ өгөгдөл */
  server = { ...server, le: 101 };
  rows = [{ attributes: { objectid: 1, F_: 'Б.', Ажил: 'A2' } }, { attributes: { objectid: 2, F_: '1', Ажил: 'b' } }];
  events.length = 0;
  const r3 = await persistedFrame(URL, FIELDS, probe, load);
  assert.deepEqual(events, ['probe', 'load:50']);
  assert.equal(r3.feats[0].attributes.Ажил, 'A2');
  await tick();
  events.length = 0;
  assert.equal((await persistedFrame(URL, FIELDS, probe, load)).feats[0].attributes.Ажил, 'A2');
  assert.deepEqual(events, ['probe'], 'шинэ бичлэгээр таарна');

  /* 2. тандалт ба татлагын ХООРОНД засвар орвол — хуучин тэмдэг + шинэ өгөгдөл хадгалагдаж, дараагийнх нь дахин татна */
  server = { ...server, le: 102 };
  const sneaky = async (s) => { server = { ...server, le: 103 }; rows = [{ attributes: { objectid: 1, F_: 'Б.', Ажил: 'A4' } }]; return load(s); };
  await persistedFrame(URL, FIELDS, probe, sneaky);
  await tick();
  assert.equal(m.get(frameKey(URL, FIELDS)).sig.le, 102, 'татлагаас ӨМНӨХ тэмдэг');
  events.length = 0;
  await persistedFrame(URL, FIELDS, probe, load);
  assert.deepEqual(events, ['probe', 'load:50'], 'тэмдэг зөрсөн тул дахин татна (хуучин өгөгдөл мөнхөд үлдэхгүй)');
  await tick();

  /* 4. «↻ Шинэчлэх» (`invalidateAll`) хаяхгүй — тандалт шалгана; аппын бичилт (`BAGTS_SHEET`) хаяна */
  const n0 = m.size;
  assert.ok(n0 > 0);
  invalidateAll();
  await tick();
  assert.equal(m.size, n0, 'бүтэн шинэчлэл кэшийг хаяхгүй (таб буцах бүрд 22 МБ биш)');
  invalidate('HO_IPC');
  await tick();
  assert.equal(m.size, n0, 'хамааралгүй хүснэгт хаяхгүй');
  invalidate('BAGTS_SHEET');
  await tick();
  assert.equal(m.size, 0, 'аппын өөрийн бөглөх хуудасны бичилт кэшийг хаяна');

  /* бичилтээс ӨМНӨ эхэлсэн уншилт цэвэрлэсэн санг дахин дүүргэхгүй */
  let release;
  const slow = (s) => new Promise((res) => { release = () => res(load(s)); });
  const pending = persistedFrame(URL, FIELDS, probe, slow);
  await tick();
  invalidate('BAGTS_SHEET');
  await tick();
  release();
  await pending;
  await tick();
  assert.equal(m.size, 0, 'бичилтийн өмнөх уншилт хадгалагдахгүй');

  /* хадгалсныг бичилтийн дараа ашиглахгүй (тандалт таарсан ч) */
  await persistedFrame(URL, FIELDS, probe, load);
  await tick();
  assert.equal(m.size, 1);
  let rel2;
  const probeSlow = () => new Promise((res) => { rel2 = () => res(sigFrom(server, true)); });
  events.length = 0;
  const p2 = persistedFrame(URL, FIELDS, probeSlow, load);
  await tick();
  invalidate('BAGTS_SHEET');
  rel2();
  await p2;
  assert.deepEqual(events, ['load:50'], 'тандалтын явцад бичилт орсон — хадгалсныг ашиглахгүй, серверээс');

  /* тандалт унавал — кэшгүй хуучин зам, тэр давхаргад сешнд дахин тандахгүй */
  events.length = 0;
  const bad = async () => { events.push('probe'); throw new Error('500'); };
  await persistedFrame(`${URL}x`, FIELDS, bad, load);
  await persistedFrame(`${URL}x`, FIELDS, bad, load);
  assert.deepEqual(events, ['probe', 'load:null', 'load:null'], 'унасан тандалт нэг л удаа');

  /* баганын жагсаалтгүй (`*`) уншилт — кэшгүй */
  events.length = 0;
  await persistedFrame(URL, undefined, probe, load);
  await persistedFrame(URL, [], probe, load);
  assert.deepEqual(events, ['load:null', 'load:null']);

  /* хадгалалт унасан ч уншилт хэвийн */
  setFrameStore({ get: async () => { throw new Error('x'); }, put: async () => { throw new Error('x'); }, clear: async () => {} });
  events.length = 0;
  assert.equal((await persistedFrame(`${URL}y`, FIELDS, probe, load)).feats.length, rows.length);
  assert.deepEqual(events, ['probe', 'load:50']);
  setFrameStore(null);
  assert.ok(puts > 0);
}

/* ── 6. Холболт — эх кодоор ── */
{
  const SHEET = readFileSync('src/modules/sheet/bagtsSheet.ts', 'utf8');
  assert.ok(SHEET.includes('const persist = !!opts?.persist && !atDay && !opts?.strict && !!fields?.length;'), 'strict/atDay/`*` үед кэшгүй');
  assert.match(SHEET, /persistedFrame\(`\$\{pkg\.url\}\|\$\{tree\.length\}`, fields, \(\) => probeSheet\(pkg, sc\)/, 'түлхүүрт зураглалын урт (where-ийн шийдвэр түүнээс)');
  assert.match(SHEET, /latestWhere\(pkg, sc, tree\.length, sig \? sig\.mx : undefined\)/, 'тандалтын max нь latestWhere-ийн max-ыг орлоно');
  assert.match(SHEET, /const mx = knownMax !== undefined \? knownMax :/, '`knownMax` алга бол хуучин max асуулга');
  assert.match(SHEET, /probeStats\(sc\.f\.oid, sc\.f\.fillDate\)/);
  /* `persist`-ийг ЗӨВХӨН уншдаг самбар өгнө — бичих замд (`strict`) хэзээ ч */
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
  walk('src');
  const code = (f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const users = files.filter((f) => /loadRows\([^;]*persist: true/.test(code(f))).map((f) => f.replace(/\\/g, '/')).sort();
  /* ⚠️ 2026-10-22: `workDepsRemote` — «Багцын хамаарал»/ТУХ-ын 24 хуудасны уншилт (6 багана); бичихийн өмнөх дахин уншилт нь `strict` (кэшгүй) */
  /* ⚠️ 2026-10-26: `levelPlan` (6 түвшний хуваарь) · `projectPlanInputs` (Excel шиг хүснэгтийн P/Q/R) · `monthlyMoney` (сарын мөнгөний
     ЦУВААГ харуулах) — бүгд уншдаг; шилжүүлэлт нь хуудсанд бичдэггүй (cashflow-ийн сарын мөрийг устгана) */
  assert.deepEqual(users, ['src/lib/levelPlan.ts', 'src/lib/monthlyMoney.ts', 'src/lib/planProgress.ts', 'src/lib/projectPlanInputs.ts', 'src/lib/sheetShared.ts', 'src/lib/workDepsRemote.ts'], 'persist зөвхөн уншдаг самбаруудад');
  for (const f of users) assert.doesNotMatch(readFileSync(f, 'utf8'), /strict: true[^)]*persist|persist: true[^)]*strict/, `${f}: strict+persist хамт`);
  assert.doesNotMatch(readFileSync('src/lib/sheetCache.ts', 'utf8'), /from ['"]react['"]/, 'React импортлохгүй (Node тест)');
}

console.log('sheetCache.check: OK');
