/** Actual decision flow against an atomic, independently evaluated fake SQL server.
 * Offline: node --experimental-transform-types src/lib/hyanaltDecision.check.mjs */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calculateRows, whereMatches } from './hyanaltDecision.fake.mjs';

const mode = process.argv.find((a) => a.startsWith('--case='))?.slice(7) ?? 'main';
const enterprise = mode === 'enterprise';
process.env.SELBE_ENT_OFF = enterprise ? '0' : '1';
process.env.NEXT_PUBLIC_ENT_DATA = 'https://decision.test/rest/services/Hosted';
process.env.NEXT_PUBLIC_PORTAL_URL = 'https://decision.test/portal';
process.env.NEXT_PUBLIC_ALLOWED_ORG_ID = 'decision-test';
process.env.NEXT_PUBLIC_AUTH_APP_ID = 'decision-test';
Object.assign(process.env, {
  NEXT_PUBLIC_HABEA_LABOR_SVC: 'decision_test_labor',
  NEXT_PUBLIC_HABEA_INCIDENT_SVC: 'decision_test_incident',
  NEXT_PUBLIC_HABEA_UZLEG_V11_SVC: 'decision_test_uzleg_v11',
  NEXT_PUBLIC_HABEA_UZLEG_G_SVC: 'decision_test_uzleg_g',
});
register('../../tools/ts-alias-hooks.mjs', import.meta.url);

const { F, HYANALT, SF, STATUS, DECISION, updateDecision, HyanaltConflict, HyanaltError } = await import('./hyanalt.ts');
const { apply, recheck, toRow } = await import('./hyanaltStore.ts');
const T0 = Date.UTC(2026, 9, 21, 6);
const priorHistory = JSON.stringify([{ stage: 'manager', who: "O'Brien", at: T0 - 1000,
  act: 'return', reason: "Check AND (slot = 'x')", u: 'prior_reviewer' }]);
const original = () => ({
  OBJECTID: 1, [F.id]: 'G-000001', [F.sheetOid]: null, [F.ergelt]: 1, [F.bagts]: 'Audit package',
  [F.ajil]: 'Audit work', [F.company]: 'Company', [F.companySent]: T0,
  ...Object.fromEntries(Object.values(SF).flatMap((f) => [[f.who, ''], [f.decision, ''], [f.reason, ''], [f.sent, null], [f.returned, null]])),
  [F.okCells]: '', [F.history]: priorHistory, [F.status]: STATUS.engineerReview,
});
const wireName = (s) => enterprise ? s.toLowerCase() : s;
const wire = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [wireName(k), v]));
const target = enterprise ? `${process.env.NEXT_PUBLIC_ENT_DATA}/Guitsetgel_talbe/FeatureServer/183` : HYANALT.url;
const state = { rows: [], requests: [], fallback: 0, writes: 0, race: null, failure: null, reply: undefined, unexpected: [] };
const reset = (row = original()) => {
  state.rows = [wire(row)]; state.requests = []; state.fallback = 0; state.writes = 0;
  state.race = null; state.failure = null; state.reply = undefined;
};
const json = (v) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = new URLSearchParams(init?.body);
  if (url === target || url === `${target}/`) {
    if (mode === 'metadata-error') return json({ error: { code: 403, message: 'metadata denied' } });
    if (mode === 'metadata-malformed') return json({ supportsCalculate: true });
    return json({ supportsCalculate: mode !== 'unsupported', fields: ['OBJECTID', ...Object.values(F)].map((name) => ({
      name: wireName(name), type: 'esriFieldTypeString', length: 10000,
    })) });
  }
  if (url === `${target}/query`) {
    if (body.has('outStatistics')) return json({ features: [{ attributes: { srv_now: T0 } }] });
    if (body.get('returnCountOnly') === 'true') return json({ count: state.rows.length });
    return json({ features: state.rows.map((r) => ({ attributes: { ...r } })), exceededTransferLimit: false });
  }
  if (url === `${target}/calculate`) {
    state.requests.push(body);
    if (state.failure === 'error') return json({ error: { code: 403, message: 'calculate denied' } });
    if (state.failure === 'cancel') throw new DOMException('calculation cancelled', 'AbortError');
    if (state.failure === 'transport') throw new TypeError('calculation connection lost');
    if (state.reply !== undefined) return json(state.reply);
    const commit = (p) => {
      const result = calculateRows(state.rows, p, () => { state.writes += 1; });
      return json(result);
    };
    if (state.race) return new Promise((resolve) => {
      const race = state.race;
      race.pending.push({ body, resolve });
      if (race.pending.length === 2) {
        const decision = (p) => JSON.parse(p.body.get('calcExpression')).find((x) => x.field === wireName(F.engineerDecision))?.value;
        race.pending.sort((a, b) => Number(decision(a) !== race.first) - Number(decision(b) !== race.first));
        // Both clients finished all read checks before either atomic UPDATE executes.
        for (const request of race.pending) request.resolve(commit(request.body));
      }
    });
    return commit(body);
  }
  if (url === `${target}/applyEdits`) state.fallback += 1;
  state.unexpected.push(url);
  throw new Error('Unexpected endpoint in offline decision regression');
};
const patch = (extra = {}) => ({ OBJECTID: 1, [F.status]: STATUS.managerReview, [F.engineer]: 'New reviewer', ...extra });
const snapshot = () => JSON.stringify(state.rows);
const unchangedRejection = async (fn, matcher) => {
  const before = snapshot();
  await assert.rejects(fn, matcher);
  assert.equal(snapshot(), before, 'rejection must leave row data unchanged');
  assert.equal(state.fallback, 0, 'a rejected conditional write must never fall back to applyEdits');
};

try {
  reset();
  if (['unsupported', 'metadata-error', 'metadata-malformed'].includes(mode)) {
    await unchangedRejection(() => updateDecision(toRow(original()), patch()), HyanaltError);
    assert.equal(state.requests.length, 0, 'unsupported or unknown capability cannot submit a calculation');
    console.log(`✅ hyanaltDecision: ${mode} rejects without a write`);
  } else if (enterprise) {
    const row = original();
    row[F.engineer] = "O'Brien AND Төлөв";
    row[F.engineerReason] = "Quote ' OR OBJECTID = 2";
    reset(row);
    const history = JSON.stringify([{ stage: 'engineer', who: "Reviewer's Төлөв", act: 'approve', at: T0 }]);
    const value = "Төлөв AND (OBJECTID = 2), Reviewer's choice";
    await updateDecision(toRow(row), patch({ [F.engineerReason]: value, [F.history]: history }));
    const req = state.requests[0];
    assert.match(req.get('where'), /^objectid = 1 AND /);
    assert.match(req.get('where'), /shiidveriin_tuuh = N'/);
    const expression = JSON.parse(req.get('calcExpression'));
    assert.ok(expression.every((c) => c.field === c.field.toLowerCase()), 'calculation targets use Enterprise field names');
    assert.equal(expression.find((c) => c.field === 'shiidveriin_tuuh').value, history, 'JSON values retain original field-like text');
    assert.equal(state.rows[0][F.engineerReason.toLowerCase()], value, 'SQL/JSON string values stay intact during Enterprise translation');
    assert.equal(state.writes, 1);
    assert.equal(state.fallback, 0);
    console.log('✅ hyanaltDecision: actual Enterprise URL, metadata, SQL guard and calculation field translation');
  } else {
    // Interpreter sanity: precedence and escaped text are evaluated independently.
    assert.equal(whereMatches("OBJECTID = 1 AND (x IS NULL OR x = '') AND who = N'O''Brien AND (x = 2)'",
      { OBJECTID: 1, x: null, who: "O'Brien AND (x = 2)" }), true);
    assert.equal(whereMatches("OBJECTID = 2 AND (x IS NULL OR x = '')", { OBJECTID: 1, x: '' }), false);
    assert.throws(() => whereMatches('OBJECTID = 1; DROP TABLE X', { OBJECTID: 1 }));

    for (const first of [DECISION.approve, DECISION.return]) {
      reset();
      const race = { first, pending: [] }; state.race = race;
      const results = await Promise.all([
        apply({ oid: 1, stage: 'engineer', decision: DECISION.approve, who: 'Reviewer A', me: 'audit_a', bypass: true }),
        apply({ oid: 1, stage: 'engineer', decision: DECISION.return, reason: "Needs O'Brien's correction", who: 'Reviewer B', me: 'audit_b', bypass: true }),
      ]);
      assert.equal(race.pending.length, 2, 'both clients must reach the calculate barrier');
      assert.equal(results.filter((r) => r.ok).length, 1, 'one concurrent decision wins');
      assert.match(results.find((r) => !r.ok).error, /Төлөв өөрчлөгдсөн/, 'loser receives a visible conflict');
      assert.equal(state.writes, 1, 'server applies only one conditional update');
      assert.equal(state.fallback, 0);
      const stored = state.rows[0];
      assert.equal(stored[F.engineerDecision], first);
      assert.equal(stored[F.engineer], first === DECISION.approve ? 'Reviewer A' : 'Reviewer B');
      assert.equal(stored[F.status], first === DECISION.approve ? STATUS.managerReview : STATUS.engineerReturned);
      const log = JSON.parse(stored[F.history]);
      assert.equal(log.length, 2, 'existing history plus only the winning decision');
      assert.deepEqual(log[0], JSON.parse(priorHistory)[0]);
      assert.equal(log[1].who, stored[F.engineer]);
      assert.equal(log[1].act, first === DECISION.approve ? 'approve' : 'return');
      assert.equal(log[1].u, first === DECISION.approve ? 'audit_a' : 'audit_b');
      if (first === DECISION.return) {
        assert.equal(stored[F.engineerReason], "Needs O'Brien's correction");
        assert.equal(log[1].reason, stored[F.engineerReason]);
      } else assert.equal(stored[F.engineerReason], '', 'losing return reason cannot leak into approval');
    }

    // Changing any guarded value after the client's read must invalidate that read.
    const guards = [F.status, F.history, F.okCells, F.bagts,
      ...Object.values(SF).flatMap((f) => [f.who, f.decision, f.reason])];
    for (const field of guards) {
      const row = original(); reset(row);
      state.rows[0][field] = `${row[field] ?? ''} concurrent '${field}'`;
      await unchangedRejection(() => updateDecision(toRow(row), patch()), HyanaltConflict);
      assert.equal(state.requests.length, 1, `guard checked atomically: ${field}`);
    }
    for (const field of [F.sheetOid, F.ergelt]) {
      const row = original(); reset(row);
      state.rows[0][field] = (row[field] ?? 0) + 1;
      await unchangedRejection(() => updateDecision(toRow(row), patch()), HyanaltConflict);
    }
    reset();
    state.rows.push({ ...wire(original()), OBJECTID: 2 });
    await updateDecision(toRow(original()), patch());
    assert.equal(state.rows[1][F.status], STATUS.engineerReview, 'OID guard protects a sibling with identical decision values');
    assert.equal(state.writes, 1);
    await unchangedRejection(() => updateDecision(toRow(original()), patch()), HyanaltConflict);

    reset();
    const quoted = original();
    quoted[F.engineer] = "D'Angelo AND (Төлөв = 'wrong')";
    quoted[F.engineerReason] = "second '' quote";
    reset(quoted);
    await updateDecision(toRow(quoted), patch({ [F.engineerReason]: null, [F.engineerSent]: T0 }));
    assert.equal(state.rows[0][F.engineerReason], null);
    assert.equal(state.rows[0][F.engineerSent], T0);
    assert.ok(state.requests[0].get('where').includes("D''Angelo AND (Төлөв = ''wrong'')"));

    for (const invalid of [{}, { success: false, updatedFeatureCount: 1 }, { success: true },
      { success: true, updatedFeatureCount: '1' }, { success: true, updatedFeatureCount: -1 },
      { success: true, updatedFeatureCount: 2 }, { success: true, updatedFeatureCount: 0.5 }]) {
      reset(); state.reply = invalid;
      await unchangedRejection(() => updateDecision(toRow(original()), patch()), (e) => e instanceof HyanaltError && !(e instanceof HyanaltConflict));
      assert.equal(state.requests.length, 1, 'malformed write result is never replayed');
    }
    for (const failure of ['error', 'cancel', 'transport']) {
      reset(); state.failure = failure;
      await unchangedRejection(() => updateDecision(toRow(original()), patch()), /calculate denied|calculation cancelled|calculation connection lost/);
      assert.equal(state.requests.length, 1, 'failed/cancelled conditional write is never replayed');
    }
    for (const invalid of [patch({ OBJECTID: 2 }), { OBJECTID: 1 }, patch({ Unknown: 'x' }),
      patch({ [F.engineer]: {} }), patch({ [F.engineer]: undefined }), patch({ [F.engineerSent]: Number.NaN })]) {
      reset();
      await unchangedRejection(() => updateDecision(toRow(original()), invalid), HyanaltError);
      assert.equal(state.requests.length, 0, 'invalid scalar patch is rejected locally');
    }
    reset();
    const rejected = await apply({ oid: 1, stage: 'engineer', decision: DECISION.return, reason: '', who: 'Reviewer B', bypass: true });
    assert.equal(rejected.ok, false);
    assert.equal(state.requests.length, 0, 'return without a reason cannot write');

    // Recheck-back reaches the same conditional writer after all preflight reads.
    const returned = original(); returned[F.status] = STATUS.managerReturned;
    reset(returned);
    state.failure = 'error';
    const failedBack = await recheck(1, 'back', 'Correction needed', 'Reviewer B', 'engineer', undefined, true);
    assert.equal(failedBack.ok, false);
    assert.equal(state.requests.length, 1);
    assert.equal(state.rows[0][F.status], STATUS.managerReturned);
    assert.equal(state.fallback, 0);

    for (const childMode of ['unsupported', 'metadata-error', 'metadata-malformed', 'enterprise']) {
      const child = spawnSync(process.execPath, ['--experimental-transform-types', fileURLToPath(import.meta.url), `--case=${childMode}`],
        { encoding: 'utf8', timeout: 20000, windowsHide: true });
      assert.equal(child.status, 0, `${childMode}: ${child.stdout}\n${child.stderr}`);
    }
    console.log('✅ hyanaltDecision: two-client approve/return race · all 18 old-value guards · SQL quoting · no fallback · errors/cancel · malformed results · Enterprise');
  }
  assert.deepEqual(state.unexpected, [], 'every request stayed inside the offline fixture');
} finally {
  globalThis.fetch = realFetch;
}
