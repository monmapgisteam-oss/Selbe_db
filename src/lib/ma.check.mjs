/**
 * MA (материал баталгаажуулалт) — цэвэр логик: Survey123 мөр → `MaRow`, ажлын хаалга,
 * сүүлийн хувилбар, хавсралтын мета (`keywords`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ma.check.mjs
 *
 * ⚠️ «Нэг ажил олон MA-д» — БҮГД батлагдсан байх ёстой (2026-10-09, хэрэглэгч): бетоны MA
 *    батлагдсан ч арматурынх R бол ажил хаалттай. Энэ дүрмийг тестгүй орхивол «нэг нь
 *    болсон» гэж хаалга нээгдэх алдаа чимээгүй орно.
 */
import assert from 'node:assert/strict';
import {
  rowOf, splitMulti, toVerdict, maGateOf, latestPerRespNo, formatKeywords, parseKeywords, isExpired, isApproved,
} from '@/lib/ma.ts';

const attrs = (o = {}) => ({
  objectid: 1, globalid: '{G}', pkg: 'b1_9f', pkg_label: 'Багц 1 · 9 давхар', contractor_name: 'NBG', material_name: 'Арматур',
  sub_doc_no: 'NBG-SLB-MA-0001-00', recv_date: 1_700_000_000_000, resp_no: 'SLB-REP-MA-P0100-0015-00', resp_date: 1_700_100_000_000,
  works: 'b1_9f:12  b1_9f:15 b1_9f:12', doc_items: 'scope conf', verdict: 'A', an_note: null, r_reason: null,
  appr_name: 'Д.Одгэрэл', prep_name: 'Г.Гантулга', created_date: 1, last_edited_date: 2, ...o,
});

/* 1. мөр задлах — select_multiple зайгаар, давхардал хасна; verdict хэвийн */
{
  const r = rowOf(attrs());
  assert.deepEqual(r.works, ['b1_9f:12', 'b1_9f:15']);
  assert.deepEqual(rowOf(attrs({ works: 'b1_12f:5,b1_12f:14, b1_12f:5' })).works, ['b1_12f:5', 'b1_12f:14'], 'Survey123 таслалаар');
  assert.deepEqual(r.docItems, ['scope', 'conf']);
  assert.equal(r.verdict, 'A');
  assert.equal(r.pkgLabel, 'Багц 1 · 9 давхар');
  assert.equal(rowOf(attrs({ pkg_label: null })).pkgLabel, 'b1_9f');
  assert.equal(toVerdict(' an '), 'AN');
  assert.equal(toVerdict('X'), null);
  assert.deepEqual(splitMulti(null), []);
  assert.equal(isApproved('AN'), true);
  assert.equal(isApproved('R'), false);
  assert.equal(isApproved(null), false);
}
console.log('✅ rowOf — works зайгаар · давхардалгүй · verdict · pkgLabel нөөц');

/* 2. ажлын хаалга — нэг ч MA байхгүй = none; бүгд A/AN = ok; нэг нь R/хоосон = blocked */
{
  const beton = rowOf(attrs({ objectid: 1, resp_no: 'R1', works: 'b1_9f:12 b1_9f:15', verdict: 'A' }));
  const armatur = rowOf(attrs({ objectid: 2, resp_no: 'R2', works: 'b1_9f:12', verdict: 'R' }));
  const pending = rowOf(attrs({ objectid: 3, resp_no: 'R3', works: 'b1_9f:15', verdict: null }));
  assert.equal(maGateOf('b1_9f:99', [beton, armatur]).gate, 'none');
  assert.equal(maGateOf('b1_9f:12', [beton]).gate, 'ok');
  assert.equal(maGateOf('b1_9f:12', [beton, armatur]).gate, 'blocked', 'олон MA-гийн нэг нь R → хаалттай');
  assert.equal(maGateOf('b1_9f:15', [beton, pending]).gate, 'blocked', 'шийдвэргүй MA → хаалттай');
  assert.equal(maGateOf('b1_9f:12', [beton, armatur]).mas.length, 2);
}
console.log('✅ maGateOf — none · ok · олон MA-гийн нэг нь R/хоосон = blocked');

/* 3. нэг resp_no олон удаа илгээгдвэл сүүлийнх (их oid) ялна; дугааргүй мөр бүр өөрөө */
{
  const old = rowOf(attrs({ objectid: 5, resp_no: 'R1', verdict: 'R' }));
  const nu = rowOf(attrs({ objectid: 9, resp_no: 'R1', verdict: 'A' }));
  const n1 = rowOf(attrs({ objectid: 6, resp_no: '' }));
  const n2 = rowOf(attrs({ objectid: 7, resp_no: '' }));
  const l = latestPerRespNo([old, n1, nu, n2]);
  assert.deepEqual(l.map((r) => r.oid), [9, 7, 6]);
  assert.equal(maGateOf('b1_9f:12', [old, nu]).gate, 'ok', 'хуучин R хувилбар тоологдохгүй');
}
console.log('✅ latestPerRespNo — сүүлийн хувилбар ялна · дугааргүй мөр тус бүр');

/* 4. хавсралтын мета — keywords ↔ объект; `;` `=` утгаас хасагдана; хугацаа */
{
  const k = formatKeywords({ type: 'conf', no: 'TC-26;1078896', std: 'MNS 0138:2010 = ok', valid: '2027-04-27', title: 'Керамик тоосго' });
  assert.ok(k.length <= 255);
  const m = parseKeywords(k);
  assert.equal(m.type, 'conf');
  assert.equal(m.no, 'TC-26 1078896');
  assert.equal(m.std, 'MNS 0138:2010 ok');
  assert.equal(m.valid, '2027-04-27');
  assert.equal(m.title, 'Керамик тоосго');
  assert.equal(parseKeywords('').type, 'other');
  assert.equal(parseKeywords('att_file').type, 'att_file', 'Survey123-ын өөрийн хавсралт — асуултын нэр');
  assert.equal(formatKeywords({ type: 'lab', valid: '27.04.2027' }).includes('valid='), false, 'буруу огноо хадгалахгүй');
  assert.equal(isExpired('2020-01-01', Date.UTC(2026, 9, 9)), true);
  assert.equal(isExpired('2099-01-01', Date.UTC(2026, 9, 9)), false);
  assert.equal(isExpired(undefined), false);
}
console.log('✅ хавсралтын мета — keywords урвуу · цэвэрлэлт · хугацаа');

/* 5. ШАТЛАЛЫН УЯЛДАА — хатуу дараалал; өмнөх батлагдаагүй бол дараагийнх хаалттай; IPC = 4 шат done */
{
  const { chainOf, ipcReady } = await import('@/lib/ma.ts');
  const st = (c) => c.map((x) => `${x.key}:${x.state}`).join(' ');
  assert.equal(st(chainOf(null)), 'MA:pending MIR:locked FIC:locked MAKT:locked');
  assert.equal(st(chainOf('R')), 'MA:rejected MIR:locked FIC:locked MAKT:locked');
  assert.equal(st(chainOf('A')), 'MA:done MIR:next FIC:locked MAKT:locked', 'MIR холбогдоогүй — хүлээгдэж буй');
  assert.equal(st(chainOf('AN', { MIR: 'A' })), 'MA:done MIR:done FIC:next MAKT:locked');
  assert.equal(st(chainOf('A', { MIR: 'R', FIC: 'A' })), 'MA:done MIR:rejected FIC:locked MAKT:locked', 'MIR R → FIC хаалттай (батлагдсан ч)');
  assert.equal(st(chainOf('A', { MIR: 'A', FIC: null })), 'MA:done MIR:done FIC:pending MAKT:locked');
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: 'A', MAKT: 'AN' })), true);
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: 'A' })), false, 'М-акт гараагүй → IPC олгохгүй');
}
console.log('✅ chainOf — MA → MIR → FIC → М-акт хатуу дараалал · IPC = 4 шат батлагдсан');

/* 6. MIR — мөр задлах · MA-аар бүлэглэх · MIR шат (олон ачаа: нэг A хангалттай, бүгд R = R) */
{
  const { mirRowOf, mirsByMa, mirVerdictFor } = await import('@/lib/mir.ts');
  const { chainOf } = await import('@/lib/ma.ts');
  const m = (o) => mirRowOf({ objectid: 1, uniquerowid: 'U1', doc_no: 'NBG-SLB-MIR-0020', ma_no: 'SLB-REP-MA-P1', verdict: 'A', x_count: 0,
    c1_con: 'OK', c1_cli: 'na', c2_cli: 'X', ...o });
  const r = m();
  assert.equal(r.checks.length, 8);
  assert.deepEqual(r.checks[0], ['OK', 'NA']);
  assert.deepEqual(r.checks[1], [null, 'X']);
  const a = m({ objectid: 1, verdict: 'R' });
  const b = m({ objectid: 3, verdict: 'A' });
  const c = m({ objectid: 2, ma_no: 'SLB-REP-MA-P2', verdict: 'R' });
  const map = mirsByMa([a, b, c, m({ objectid: 9, ma_no: '' })]);
  assert.deepEqual(map.get('SLB-REP-MA-P1').map((x) => x.oid), [3, 1], 'сүүлийнх эхэнд');
  assert.equal(map.has(''), false, 'MA дугааргүй MIR бүлэглэгдэхгүй');
  assert.equal(mirVerdictFor(undefined), undefined);
  assert.equal(mirVerdictFor(map.get('SLB-REP-MA-P1')), 'A', 'нэг ачаа A → шат нээгдэнэ');
  assert.equal(mirVerdictFor(map.get('SLB-REP-MA-P2')), 'R', 'бүгд R → R');
  assert.equal(chainOf('A', { MIR: mirVerdictFor(map.get('SLB-REP-MA-P2')) })[1].state, 'rejected');
  assert.equal(chainOf('A', { MIR: mirVerdictFor(map.get('SLB-REP-MA-P1')) })[2].state, 'next', 'MIR A → FIC хүлээгдэж буй');
}
console.log('✅ MIR — мөр · MA-аар бүлэглэх · олон ачааны шат');

/* 7. FIC · М-акт — мөр задлах · MA-аар бүлэглэх · шат (нэг A хангалттай · хүлээж буй = null · бүгд R = R) */
{
  const { fmRowOf, fmByMa, fmVerdictFor } = await import('@/lib/ficMakt.ts');
  const { chainOf, ipcReady } = await import('@/lib/ma.ts');
  const f = (o) => fmRowOf({ OBJECTID: 1, kind: 'FIC', ma_no: 'M1', pdf_item: 'x', status: 'pending', uploaded_by: 'a', ...o });
  assert.equal(f({ status: 'bogus' }).status, 'pending');
  assert.equal(f({ kind: 'makt' }).kind, 'MAKT');
  const map = fmByMa([f({ OBJECTID: 1, status: 'R' }), f({ OBJECTID: 4, status: 'pending' }), f({ OBJECTID: 2, kind: 'MAKT', status: 'A' }), f({ OBJECTID: 9, ma_no: '' })]);
  const e = map.get('M1');
  assert.deepEqual(e.FIC.map((x) => x.oid), [4, 1]);
  assert.equal(map.has(''), false);
  assert.equal(fmVerdictFor(undefined), undefined);
  assert.equal(fmVerdictFor(e.FIC), null, 'батлагдсан алга, хүлээж буй байна → шийдвэр хүлээж буй');
  assert.equal(fmVerdictFor([f({ status: 'R' })]), 'R');
  assert.equal(fmVerdictFor([f({ status: 'R' }), f({ status: 'AN' })]), 'A');
  /* бүх гинж: MA A → MIR A → FIC A → М-акт A = IPC */
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: fmVerdictFor([f({ status: 'A' })]), MAKT: fmVerdictFor(e.MAKT) })), true);
  assert.equal(chainOf('A', { MIR: 'R', FIC: 'A', MAKT: 'A' })[3].state, 'locked', 'MIR R → FIC/М-акт батлагдсан ч хаалттай');
}
console.log('✅ FIC · М-акт — мөр · бүлэглэх · шат · бүтэн гинж = IPC');

/* ── ⚠️ 2026-10-12 (дарааллын аудит): `decideFm` — гинжийн шат `locked` бол шийдвэр гаргахгүй (`addFm`-ийн ижил `chainOf`) ── */
{
  const { readFileSync } = await import('node:fs');
  const L = readFileSync(new URL('./ficMakt.ts', import.meta.url), 'utf8');
  const fn = L.slice(L.indexOf('export async function decideFm('));
  const chain = fn.indexOf('chainOf(ma.verdict');
  /* ⚠️ 2026-10-21: Enterprise-ийн OID жижиг үсгээр (`objectid`) — `ficMakt.ts`-ийн ⚠️ */
  const fresh = fn.indexOf("queryFm(url, `objectid = ${Number(row.oid)}`)");
  const write = fn.indexOf('await post<');
  assert.ok(chain > 0 && fresh > chain && write > fresh, 'decideFm: гинжийн шалгалт `pending` уншилт ба бичилтийн ӨМНӨ байх ёстой');
  assert.ok(/stage\.state === 'locked'\) \{\s*throw new Error/.test(fn.slice(chain, fresh)), 'decideFm: locked шатанд шиддэггүй');
  const add = L.slice(L.indexOf('export async function addFm('), L.indexOf('export async function decideFm('));
  assert.ok(/stage\.state === 'locked'/.test(add), 'addFm: locked шалгалт алга (хуучин дүрэм)');
  console.log('✅ 2026-10-12 — decideFm гинжийн locked шалгалт');
}

/* Actual FIC/М-акт module, with only its external services replaced. The fake
 * server independently evaluates WHERE and applies each calculation atomically. */
{
  const [{ readFileSync }, vm, ts, ma, mir, { PKGS }, { calculateRows, whereMatches }] = await Promise.all([
    import('node:fs'), import('node:vm'), import('typescript'), import('@/lib/ma.ts'), import('@/lib/mir.ts'),
    import('@/modules/sheet/bagts.pkg'), import('./hyanaltDecision.fake.mjs'),
  ]);
  const source = readFileSync(new URL('./ficMakt.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = 'https://fm.test/rest/services/Hosted/FIC/FeatureServer/0';
  const T0 = Date.UTC(2026, 9, 21, 6, 7, 8, 123);
  const original = (kind = 'FIC') => ({
    objectid: 1, kind, ma_no: 'M1', status: 'pending', reason: null,
    uploaded_by: 'uploader', decided_by: null, decided_at: null,
  });
  const fields = ['objectid', 'kind', 'ma_no', 'status', 'reason', 'uploaded_by', 'decided_by', 'decided_at'];
  const state = {};
  const reset = (row = original()) => Object.assign(state, {
    rows: [row], requests: [], writes: 0, fallback: 0, barrier: null,
    metadata: { supportsCalculate: true, fields: fields.map((name) => ({ name })) },
    response: undefined, failure: null, beforeCalculate: null,
  });
  const json = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  // Preserve quoted strings while converting the fake server's UTC date literals
  // to numeric epoch values. Production still sends the standard SQL timestamp.
  const sqlForFake = (sql) => sql.replace(/N?'(?:''|[^'])*'|timestamp\s+'[^']*'/gi, (token) =>
    /^timestamp/i.test(token) ? String(Date.parse(`${token.slice(token.indexOf("'") + 1, -1).replace(' ', 'T')}Z`)) : token);
  const commit = (body) => {
    const calculation = new URLSearchParams(body);
    calculation.set('where', sqlForFake(body.get('where')));
    return json(calculateRows(state.rows, calculation, () => { state.writes += 1; }));
  };
  const fetch = async (url, init) => {
    const body = new URLSearchParams(init.body);
    if (url.endsWith('/sharing/rest/search')) return json({ results: [{ title: 'Selbe_Chanar_FIC_MAKT', url: target.slice(0, -2) }] });
    if (url === target) return json(state.metadata);
    if (url === `${target}/query`) return json({ features: state.rows
      .filter((row) => whereMatches(body.get('where'), row)).map((row) => ({ attributes: { ...row } })) });
    if (url === `${target}/applyEdits`) { state.fallback += 1; throw new Error('unconditional write forbidden'); }
    assert.equal(url, `${target}/calculate`, 'only the conditional writer may mutate');
    state.requests.push(body);
    state.beforeCalculate?.();
    if (state.response !== undefined) return json(state.response);
    if (state.failure === 'before') throw new TypeError('connection lost before write');
    if (state.failure === 'after') { commit(body); throw new TypeError('committed response lost'); }
    if (state.barrier) return new Promise((resolve) => {
      state.barrier.pending.push({ body, resolve });
      if (state.barrier.pending.length === 2) state.barrier.ready();
    });
    return commit(body);
  };
  const tr = (text, ...args) => text.replace(/\{(\d+)\}/g, (_, i) => String(args[i]));
  const client = (user) => {
    const dependencies = {
      '@/lib/i18nCore': { t: tr },
      '@/lib/entDocs': { ENT_PORTAL: 'https://fm.test/portal', entSession: () => ({ token: user, user }), entStamp: async () => {}, entExactUser: async () => user },
      /* ⚠️ 2026-10-21: `ENT_DATA` хоосон — шууд хаягаар хайхгүй, хайлтаар (энэ хуурамч сервер) олно */
      '@/lib/services/entMap': { ENT_DATA: '' },
      '@/lib/ma': { ...ma, loadMa: async () => [rowOf(attrs({ resp_no: 'M1' }))] },
      '@/lib/mir': { ...mir, loadMir: async () => [{ oid: 1, maNo: 'M1', verdict: 'A' }] },
      '@/lib/chanarAcl': {}, '@/lib/who': { currentUser: () => user, requireCap: () => {} },
      '@/lib/services': { AUTH: { appId: '' } }, '@/modules/sheet/bagts.pkg': { PKGS },
      '@/modules/chanar/chanarUi': {},
    };
    const exports = {};
    vm.runInNewContext(compiled, {
      exports, require: (name) => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
      fetch, URLSearchParams, AbortSignal, Date, console,
    }, { filename: 'ficMakt.ts' });
    return exports;
  };
  const a = client('reviewer_a');
  const b = client('reviewer_b');
  for (const kind of ['FIC', 'MAKT']) {
    for (const first of ['reviewer_a', 'reviewer_b']) {
      reset(original(kind));
      // М-акт also needs an approved FIC in its existing chain preflight.
      if (kind === 'MAKT') state.rows.push({ ...original(), objectid: 2, status: 'A' });
      let ready;
      const arrived = new Promise((resolve) => { ready = resolve; });
      const barrier = { pending: [], ready }; state.barrier = barrier;
      const expected = a.fmRowOf(state.rows[0]);
      const calls = [a.decideFm(expected, 'A', 'Approval'), b.decideFm(expected, 'R', "O'Brien's return")]
        .map((p) => p.then(() => ({ ok: true }), (error) => ({ ok: false, error })));
      await Promise.race([arrived, Promise.all(calls).then(() => {
        assert.fail('both decisions finished before reaching the atomic calculation barrier');
      })]);
      assert.equal(barrier.pending.length, 2, 'both clients read pending before either UPDATE');
      const winner = barrier.pending.find((x) => x.body.get('token') === first);
      const loser = barrier.pending.find((x) => x !== winner);
      winner.resolve(commit(winner.body));
      assert.equal((await calls[first === 'reviewer_a' ? 0 : 1]).ok, true);
      const completed = structuredClone(state.rows);
      loser.resolve(commit(loser.body));
      const outcomes = await Promise.all(calls);
      assert.equal(outcomes.filter((x) => x.ok).length, 1);
      assert.match(outcomes.find((x) => !x.ok).error.message, /Төлөв өөрчлөгдсөн/);
      assert.deepEqual(state.rows, completed, 'a delayed loser cannot change the winning attribution, date or reason');
      assert.equal(state.rows[0].decided_by, first);
      assert.equal(state.rows[0].status, first === 'reviewer_a' ? 'A' : 'R');
      assert.equal(state.rows[0].reason, first === 'reviewer_a' ? 'Approval' : "O'Brien's return");
      assert.equal(state.writes, 1);
      assert.equal(state.fallback, 0);
    }
  }
  for (const metadata of [{}, { supportsCalculate: false }, { supportsCalculate: true },
    { supportsCalculate: true, fields: fields.filter((x) => x !== 'status').map((name) => ({ name })) }]) {
    reset(); state.metadata = metadata;
    const before = structuredClone(state.rows);
    await assert.rejects(a.decideFm(a.fmRowOf(state.rows[0]), 'A', ''), /дэмжигдээгүй/);
    assert.deepEqual(state.rows, before);
    assert.equal(state.requests.length, 0);
    assert.equal(state.fallback, 0);
  }
  for (const field of ['reason', 'decided_by', 'decided_at', 'kind', 'ma_no', 'uploaded_by']) {
    reset();
    state.beforeCalculate = () => { state.rows[0][field] = field === 'decided_at' ? T0 : 'concurrent'; };
    await assert.rejects(a.decideFm(a.fmRowOf(state.rows[0]), 'A', ''), /Төлөв өөрчлөгдсөн/);
    assert.equal(state.writes, 0, `guarded metadata: ${field}`);
    assert.equal(state.fallback, 0);
  }
  reset({ ...original(), reason: "O'Brien AND (status = 'A')", decided_by: 'old_reviewer', decided_at: T0 });
  await a.decideFm(a.fmRowOf(state.rows[0]), 'AN', 'With notes');
  assert.equal(state.writes, 1);
  assert.ok(state.requests[0].get('where').includes("timestamp '2026-10-21 06:07:08.123'"), 'date predicates use UTC including milliseconds');
  assert.equal(JSON.parse(state.requests[0].get('calcExpression')).find((x) => x.field === 'decided_at').value, state.rows[0].decided_at);
  for (const response of [{}, { success: false, updatedFeatureCount: 0 }, { success: false, updatedFeatureCount: 1 }, { success: true },
    { success: true, updatedFeatureCount: '1' }, { success: true, updatedFeatureCount: 2 }, { success: true, updatedFeatureCount: -1 }]) {
    reset(); state.response = response;
    await assert.rejects(a.decideFm(a.fmRowOf(state.rows[0]), 'A', ''), /үр дүн дутуу/);
    assert.equal(state.requests.length, 1, 'malformed response is not replayed');
    assert.equal(state.fallback, 0);
  }
  reset(); state.failure = 'before';
  await assert.rejects(a.decideFm(a.fmRowOf(state.rows[0]), 'A', ''));
  assert.equal(state.writes, 0);
  assert.equal(state.requests.length, 1);
  reset(); state.failure = 'after';
  const stale = a.fmRowOf(state.rows[0]);
  await assert.rejects(a.decideFm(stale, 'A', 'Committed approval'));
  assert.equal(state.writes, 1);
  assert.equal(state.requests.length, 1, 'lost write response never triggers a retry or cleanup write');
  assert.equal(state.rows[0].decided_by, 'reviewer_a');
  await assert.rejects(b.decideFm(stale, 'R', 'Late return'), /аль хэдийн шийдвэрлэгдсэн/);
  assert.equal(state.writes, 1);
  assert.equal(state.fallback, 0);
  console.log('✅ FIC · М-акт — atomic WHERE · two race orders · guarded metadata · fail-closed · lost response');
}
