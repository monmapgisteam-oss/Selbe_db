import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFinancePublishInputs, publishFinanceBatch, recomputeFinanceAmounts, FinancePublishConflict, FinanceDuplicateId } from './financePublish.ts';

// Pure injected reads/writes: never load credentials or call a production service.
const parent = { objectid: 1, cashflow_id: 9, ho_dun_geree: 100 };
const month = { objectid: 2, cashflow_id: 9, cashflow_start: 1, cashflow_huwi: 10, cashflow_dun: 10 };
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('  ✓', name); };

async function scenario(changes, live, opts = {}) {
  const updates = new Map(changes.map((change) => [change.objectid, { ...change }]));
  const sent = [];
  const scopes = [];
  let reads = 0;
  const read = async (scope) => {
    scopes.push(scope);
    reads++;
    if (reads === 2 && opts.beforeFinalRead) opts.beforeFinalRead(live);
    if (reads === 2 && opts.failFinalRead) throw new Error('freshness read failed');
    return structuredClone(live);
  };
  const inputs = await loadFinancePublishInputs({ updates, parents: [parent], months: [month], oidField: 'objectid', read });
  if (inputs) recomputeFinanceAmounts({ updates, parents: inputs.parents, months: inputs.months, oidField: 'objectid', deletes: opts.deletes ?? [] });
  await publishFinanceBatch(inputs, async () => {
    sent.push([...updates.values()].map((change) => ({ ...change })));
    return { n: updates.size };
  });
  return { sent, reads, scopes, updates };
}

// Exact WF04: B saved20%, A's open table still shows10%, A edits contract100 ->200.
{
  const live = { parents: [{ ...parent }], months: [{ ...month, cashflow_huwi: 20, cashflow_dun: 20 }] };
  const out = await scenario([{ objectid: 1, ho_dun_geree: 200 }], live);
  check('stale-session contract edit uses fresh20%, writes amount40', () => {
    assert.deepEqual(out.sent, [[{ objectid: 1, ho_dun_geree: 200 }, { objectid: 2, cashflow_dun: 40 }]]);
    assert.equal(out.updates.get(2).cashflow_huwi, undefined);
  });
  check('contract-only edit refreshes dependencies twice, including every month for id9', () => {
    assert.equal(out.reads, 2);
    assert.deepEqual(out.scopes[0], { parentOids: [1], monthOids: [], ids: [9] });
  });
}

{
  const live = { parents: [{ ...parent, ho_dun_geree: 200 }], months: [{ ...month }] };
  const out = await scenario([{ objectid: 2, cashflow_huwi: 30 }], live);
  check('percentage-only edit uses fresh parent contract', () => assert.equal(out.updates.get(2).cashflow_dun, 60));
}

{
  const live = { parents: [{ ...parent }], months: [{ ...month }] };
  const out = await scenario([{ objectid: 1, ho_dun_geree: 200 }, { objectid: 2, cashflow_huwi: 25 }], live);
  check('same-user pending month percentage survives parent recomputation', () => {
    assert.equal(out.updates.get(2).cashflow_huwi, 25);
    assert.equal(out.updates.get(2).cashflow_dun, 50);
  });
}

// The real write wrapper must reject every detected freshness conflict before invoking write.
async function expectNoWrite(live, changes, mutate) {
  let writes = 0;
  const updates = new Map(changes.map((change) => [change.objectid, { ...change }]));
  await assert.rejects(async () => {
    const inputs = await loadFinancePublishInputs({ updates, parents: [parent], months: [month], oidField: 'objectid', read: async () => structuredClone(live) });
    recomputeFinanceAmounts({ updates, parents: inputs.parents, months: inputs.months, oidField: 'objectid', deletes: [] });
    mutate?.(live);
    await publishFinanceBatch(inputs, async () => { writes++; });
  }, FinancePublishConflict);
  assert.equal(writes, 0);
}

await expectNoWrite(
  { parents: [{ ...parent }], months: [{ ...month, cashflow_huwi: 20, cashflow_dun: 20 }] },
  [{ objectid: 2, cashflow_huwi: 30 }],
);
check('remote edit of an explicitly edited percentage conflicts with zero writes', () => {});
await expectNoWrite(
  { parents: [{ ...parent, ho_dun_geree: 150 }], months: [{ ...month }] },
  [{ objectid: 1, ho_dun_geree: 200 }],
);
check('remote edit of an explicitly edited contract conflicts with zero writes', () => {});
await expectNoWrite(
  { parents: [{ ...parent }], months: [{ ...month }] },
  [{ objectid: 1, ho_dun_geree: 200 }],
  (live) => { live.months[0].cashflow_huwi = 20; live.months[0].cashflow_dun = 20; },
);
check('month changed during preparation conflicts at the final write wrapper with zero writes', () => {});
await expectNoWrite(
  { parents: [{ ...parent }], months: [{ ...month }] },
  [{ objectid: 1, ho_dun_geree: 200 }],
  (live) => { live.months.push({ ...month, objectid: 3 }); },
);
check('new dependent month during preparation conflicts with zero writes', () => {});
await expectNoWrite(
  { parents: [{ ...parent }], months: [{ ...month }] },
  [{ objectid: 2, cashflow_huwi: 30 }],
  (live) => { live.parents[0].ho_dun_geree = 200; },
);
check('parent changed during percentage preparation conflicts with zero writes', () => {});
await expectNoWrite(
  { parents: [], months: [{ ...month }] },
  [{ objectid: 2, cashflow_huwi: 30 }],
);
check('missing parent conflicts instead of silently clearing the monthly amount', () => {});

{
  const live = { parents: [{ ...parent }], months: [{ ...month }] };
  const out = await scenario([{ objectid: 1, ho_dun_geree: 200 }], live, { deletes: [2] });
  check('month marked for deletion is not reintroduced as an amount update', () => assert.equal(out.updates.has(2), false));
}
{
  const out = await scenario([{ objectid: 2, cashflow_huwi: null }], { parents: [{ ...parent }], months: [{ ...month }] });
  check('clearing percentage clears amount as null', () => assert.equal(out.updates.get(2).cashflow_dun, null));
}
{
  const live = { parents: [{ ...parent }], months: [{ ...month }] };
  const updates = new Map([[1, { objectid: 1, ho_dun_geree: 200 }]]);
  let reads = 0, writes = 0;
  const inputs = await loadFinancePublishInputs({ updates, parents: [parent], months: [month], oidField: 'objectid', read: async () => {
    if (++reads === 2) throw new Error('freshness read failed');
    return structuredClone(live);
  } });
  await assert.rejects(() => publishFinanceBatch(inputs, async () => { writes++; }), /freshness read failed/);
  check('failed final dependency read leaves edits unsent', () => assert.equal(writes, 0));
}
/* ── ⚠️ 2026-10-21 (аудит): `Cashflow_ID` (эцэг↔сарын холбоос) засагдахад ХУУЧИН ба ШИНЭ дугаарын сар дахин бодогдоно ── */
{
  const p1 = { objectid: 1, cashflow_id: 5, ho_dun_geree: 100 };
  const p2 = { objectid: 2, cashflow_id: 6, ho_dun_geree: 200 };
  const m5 = { objectid: 3, cashflow_id: 5, cashflow_start: 1, cashflow_huwi: 10, cashflow_dun: 10 };
  const m6 = { objectid: 4, cashflow_id: 6, cashflow_start: 1, cashflow_huwi: 10, cashflow_dun: 20 };
  const live = () => ({ parents: [{ ...p1 }, { ...p2 }], months: [{ ...m5 }, { ...m6 }] });
  const run = async (changes, lv, deletes = []) => {
    const updates = new Map(changes.map((c) => [c.objectid, { ...c }]));
    const scopes = [];
    const read = async (scope) => { scopes.push(scope); return structuredClone(lv); };
    const inputs = await loadFinancePublishInputs({ updates, parents: [p1, p2], months: [m5, m6], oidField: 'objectid', read });
    if (inputs) recomputeFinanceAmounts({ updates, parents: inputs.parents, months: inputs.months, oidField: 'objectid', deletes });
    return { updates, scopes, inputs };
  };
  {
    /* аудитын загвар: 1→6, 2→5 сэлгэлт */
    const out = await run([{ objectid: 1, cashflow_id: 6 }, { objectid: 2, cashflow_id: 5 }], live());
    check('Cashflow_ID засвар → шинэ уншилт, хуучин+шинэ дугаар хамрах хүрээнд', () => {
      assert.ok(out.inputs);
      assert.deepEqual(out.scopes[0], { parentOids: [1, 2], monthOids: [], ids: [5, 6] });
    });
    check('сэлгэхэд сар 5 → эцэг 2 (200) дүн 20, сар 6 → эцэг 1 (100) дүн 10', () => {
      assert.equal(out.updates.get(3).cashflow_dun, 20);
      assert.equal(out.updates.get(4).cashflow_dun, 10);
    });
  }
  {
    const out = await run([{ objectid: 1, cashflow_id: 9 }], live());
    check('чөлөөт дугаар руу шилжихэд хуучин дугаарын сар эцэггүй → дүн null (0 БИШ), бусад сар хөндөгдөхгүй', () => {
      assert.deepEqual(out.scopes[0].ids, [5, 9]);
      assert.equal(out.updates.get(3).cashflow_dun, null);
      assert.equal(out.updates.has(4), false);
    });
  }
  await assert.rejects(run([{ objectid: 1, cashflow_id: 6 }], live()), FinanceDuplicateId);
  check('өөр ажлын дугаар руу шилжихэд ил алдаа (давхардал) — бичилт үгүй', () => {});
  {
    const out = await run([{ objectid: 3, cashflow_id: 6 }], live());
    check('сарын мөр өөр эцэг рүү шилжихэд шинэ эцгийн дүнгээр (10% × 200 = 20)', () => {
      assert.deepEqual(out.scopes[0], { parentOids: [], monthOids: [3], ids: [5, 6] });
      assert.equal(out.updates.get(3).cashflow_dun, 20);
    });
  }
  {
    const out = await run([{ objectid: 1, cashflow_id: 6 }, { objectid: 2, cashflow_id: 5 }, { objectid: 3, cashflow_huwi: 50 }], live());
    check('сэлгэлт + хувийн засвар: сар 5 (одоо эцэг 2, 200) 50% → 100, давхар бодогдохгүй', () => {
      assert.equal(out.updates.get(3).cashflow_dun, 100);
      assert.equal(out.updates.get(4).cashflow_dun, 10);
    });
  }
  {
    const out = await run([{ objectid: 1, cashflow_id: 9 }], live(), [3]);
    check('устгагдах сар дахин бодогдохгүй', () => assert.equal(out.updates.has(3), false));
  }
  {
    const lv = live();
    lv.parents[0].cashflow_id = 7;
    await assert.rejects(run([{ objectid: 1, ho_dun_geree: 300 }], lv), FinancePublishConflict);
    check('өөр хүн дугаарыг солисон бол зөрчил (хуучин зан хэвээр)', () => {});
  }
}

{
  const source = readFileSync(new URL('../modules/Finance.tsx', import.meta.url), 'utf8');
  check('Finance publish calls the tested refresh, recomputation and final write wrapper', () => {
    assert.match(source, /financeInputs = await loadFinancePublishInputs\(/);
    assert.match(source, /recomputeFinanceAmounts\(\{\s*updates: upd, parents: publishRows, months: publishMonths/);
    assert.match(source, /await publishFinanceBatch\(financeInputs, \(\) => \{\s*addsInFlight = [^;]+;\s*return applyAll\(/);
    assert.match(source, /for \(const mr of publishMonthBy\.get\(id\)/);
  });
}
console.log(`financePublish: ${checks} checks passed; production mutations0. Final read/write is not server-atomic.`);
