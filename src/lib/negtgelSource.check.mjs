/** Үндсэн 182 → нөөц 187 → сэргэлт: бодит loader/cache, хуурамч өгөгдлийн эхүүд; сүлжээ/бичилтгүй. */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { buildTree, computePlan } from './projectPlan.ts';

const tree = buildTree([
  { objectid: 1, dd_kod: '3', ajil_uilchilgee: 'Газар чөлөөлөлт', uy_shat: 'Газар чөлөөлөлт', tusul_ezleh_huvi: 0.4, guitsetgel_huvi: 50 },
  { objectid: 2, dd_kod: '3', ajil_uilchilgee: 'Зөвшөөрөл', uy_shat: 'Зөвшөөрөл', tusul_ezleh_huvi: 0.6, guitsetgel_huvi: 20 },
]);
const plan = { empty: false, failed: [], tree, result: computePlan(tree) };
const state = globalThis.__negtgelSourceTest = {
  mode: 'ok', planCalls: 0, syncCalls: 0, plan, partial: [], sourceError: false,
  legacy: [{ oid: 7, code: '1', name: 'ТЭЗҮ', bagts: '', depth: 1, p: 1, w: 1, act: 0.8, budget: 1 }],
};
const moduleUrl = s => `data:text/javascript,${encodeURIComponent(s)}`;
const planStub = moduleUrl(`export async function loadProjectPlan() {
  const s = globalThis.__negtgelSourceTest; s.planCalls++;
  if (s.mode === 'fail') throw new Error('primary unavailable');
  return s.mode === 'empty' ? { empty: true } : s.plan;
}`);
const legacyStub = moduleUrl(`
  export class NegSourceError extends Error { constructor(failed) { super('legacy unavailable'); this.failed = failed; } }
  export async function loadNegRaw() { return globalThis.__negtgelSourceTest.legacy; }
  export async function loadNegSources() {
    const s = globalThis.__negtgelSourceTest;
    if (s.sourceError) throw new NegSourceError(['legacy input']);
    return { partial: s.partial };
  }
  export const computeNegAuto = rows => rows;
  export const negTreeSource = () => 'excel';
  export const syncNegtgel = () => { globalThis.__negtgelSourceTest.syncCalls++; return Promise.resolve({kind:'off'}); };
`);
register(moduleUrl(`export async function resolve(spec, ctx, next) {
  if (ctx.parentURL && new URL(ctx.parentURL).pathname.endsWith('/negtgel.ts')) {
    if (spec === '@/lib/projectPlanInputs') return {url:${JSON.stringify(planStub)},shortCircuit:true};
    if (spec === '@/lib/negtgelAuto') return {url:${JSON.stringify(legacyStub)},shortCircuit:true};
  }
  return next(spec, ctx);
}`));
const { loadNegtgelFull, dropNegtgelFull, negtgelProjectPct, negtgelComplete } = await import('./negtgel.ts');
const primary = await loadNegtgelFull();
assert.equal(primary.source, 'plan');
assert.equal(negtgelProjectPct(primary.rows, primary.calc), plan.result.values.get(tree.root).S, 'давхардсан кодтой ч дэлгэц үндсэн тооцоотой таарна');
assert.equal(state.syncCalls, 0, 'үндсэн эх бэлэн үед нөөц хүснэгт синк хийхгүй');
await loadNegtgelFull();
assert.equal(state.planCalls, 1, 'бүрэн үндсэн үр дүн кэшлэгдэнэ');

for (const mode of ['fail', 'empty']) {
  dropNegtgelFull(); state.mode = mode;
  const fallback = await loadNegtgelFull();
  assert.equal(fallback.source, 'negtgel');
  assert.equal(negtgelProjectPct(fallback.rows, fallback.calc), 80, 'нөөц үр дүн хэвээр харагдана');
  assert.ok(fallback.failed.includes('Төсөл төлөвлөгөө биелэлт'), 'үндсэн эх алга гэдгийг UI-д мэдэгдэнэ');
  assert.equal(negtgelComplete(fallback), false, 'нөөц бүрэн байсан ч үндсэн эх унасан');
  const before = state.planCalls;
  state.mode = 'ok';
  const recovered = await loadNegtgelFull();
  assert.equal(state.planCalls, before + 1, 'нөөц үр дүн 5 минут кэшлэгдэж үндсэн эхийн сэргэлтийг хаахгүй');
  assert.equal(recovered.source, 'plan');
  assert.deepEqual(recovered.failed, []);
}
dropNegtgelFull(); state.mode = 'fail'; state.partial = ['partial input'];
assert.deepEqual((await loadNegtgelFull()).failed, ['Төсөл төлөвлөгөө биелэлт', 'partial input']);
state.sourceError = true;
const unavailable = await loadNegtgelFull();
assert.equal(unavailable.live, false);
assert.deepEqual(unavailable.failed, ['Төсөл төлөвлөгөө биелэлт', 'legacy input']);
delete globalThis.__negtgelSourceTest;
console.log('✅ negtgelSource — үндсэн эх · нөөцийн мэдэгдэл · кэшгүй сэргэлт · давхардсан код');
