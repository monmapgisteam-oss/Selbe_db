/**
 * АВТОМАТ СИНК — хүний оролцоогүй (GitHub Actions `sync.yml`, 15 мин тутам; гараар ч ажиллана).
 * Хөтчийн синкүүдийг (зургийн бүртгэл → ТТБ · төлбөрийн акт ↔ ТТБ · гүйцэтгэл → ТТБ) серверт ижил кодоор, тогтсон
 * дарааллаар ажиллуулаад «олгосон дүн» IPC ба ТТБ-д тэнцэж буйг шалгана; зөрвөл нэг удаа дахин засна, засагдахгүй
 * бол алдааны кодоор гарна (workflow улаан болно).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/sync-all.mjs [--dry]
 *
 * Токен: `ARCGIS_SYNC_USER` + `ARCGIS_SYNC_PASS` (портал generateToken) эсвэл `ARCGIS_ADMIN_TOKEN`. Утгыг хэзээ ч логлохгүй.
 */
import { register } from 'node:module';
import { installTokenInjection, installWriteGuard, loadAdminTokens } from './liveFetch.mjs';

register(new URL('./node/featureLayerHook.mjs', import.meta.url).href);
process.env.NEXT_PUBLIC_AUTH_OFF = '1';
const DRY = process.argv.includes('--dry');

async function token() {
  const u = process.env.ARCGIS_SYNC_USER;
  const p = process.env.ARCGIS_SYNC_PASS;
  const portal = (process.env.NEXT_PUBLIC_ENT_PORTAL_URL || process.env.NEXT_PUBLIC_PORTAL_URL || '').replace(/\/+$/, '');
  if (u && p && portal) {
    const r = await fetch(`${portal}/sharing/rest/generateToken`, {
      method: 'POST',
      body: new URLSearchParams({ f: 'json', username: u, password: p, client: 'referer', referer: portal, expiration: '60' }),
    });
    const j = await r.json();
    if (!j.token) throw new Error(`generateToken: ${j.error?.message ?? 'токен ирсэнгүй'}`);
    return { tok: j.token, tok2: '', tok2Svc: [] };
  }
  const t = loadAdminTokens();
  if (!t.tok) throw new Error('Токен алга: ARCGIS_SYNC_USER/ARCGIS_SYNC_PASS эсвэл ARCGIS_ADMIN_TOKEN тохируулна уу');
  return t;
}

if (DRY) installWriteGuard({ stubAppTables: false });
installTokenInjection(await token());

const { CASHFLOW_NEW, HO_IPC } = await import('../src/lib/services/fields.ts');
const { applyAll } = await import('../src/lib/tableWrite.ts');
const { queryFeatures } = await import('../src/lib/query.ts');
const { computeBlockBudgets, computeHoSync, loadCfContractRows } = await import('../src/lib/hoSync/sync.ts');
const { planPaidSync } = await import('../src/lib/hoSync/compute.ts');
const { syncZuragPlan } = await import('../src/lib/zuragPlanSync.ts');
const { syncPlanProgress, planSyncWarn } = await import('../src/lib/projectPlanSync.ts');

const log = [];
const step = async (name, fn) => {
  try { const r = await fn(); log.push(`✅ ${name}: ${r}`); return true; } catch (e) { log.push(`❌ ${name}: ${e instanceof Error ? e.message : e}`); return false; }
};
const write = async (url, oid, edits) => (DRY ? 0 : (await applyAll(url, oid, edits), (edits.updates?.length ?? 0) + (edits.adds?.length ?? 0)));

/** Төлбөрийн акт ↔ ТТБ — `hoSync.runHoSync`-ийн алхмууд (хөтчийн эрхийн шалгуургүй) */
async function hoSync() {
  const blocks = await computeBlockBudgets();
  const b = blocks.length ? await write(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: blocks }) : 0;
  const p = await computeHoSync();
  const h = p.updates.length || p.adds.length ? await write(HO_IPC.url, HO_IPC.oid, { updates: p.updates, adds: p.adds }) : 0;
  const paid = await paidDiff();
  const c = paid.length ? await write(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: paid }) : 0;
  return `блок ${b} · акт ${h} (+${p.adds.length}) · олгосон ${c} · тулгагдаагүй ${p.unmatched.length}`;
}
async function paidDiff() {
  const [ho, cf] = await Promise.all([queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` }), loadCfContractRows()]);
  return planPaidSync(ho, cf).updates;
}
/** IPC-ийн нийт олгосон = ТТБ-ийн нийт олгосон (₮, 1-ээс бага зөрүүг тэнцүү гэж үзнэ) */
async function totals() {
  const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const [ho, cf] = await Promise.all([
    queryFeatures(HO_IPC.url, { outFields: [HO_IPC.payFields.amount] }),
    queryFeatures(CASHFLOW_NEW.url, { where: `${CASHFLOW_NEW.fields.ddKod} IS NOT NULL`, outFields: [CASHFLOW_NEW.fields.paid] }),
  ]);
  return { ipc: sum(ho, HO_IPC.payFields.amount), ttb: sum(cf, CASHFLOW_NEW.fields.paid) };
}

await step('Зургийн бүртгэл → ТТБ', async () => (DRY ? 'алгасав (--dry)' : `${await syncZuragPlan()} мөр`));
await step('Төлбөрийн акт ↔ ТТБ', hoSync);
await step('Гүйцэтгэл → ТТБ', async () => {
  if (DRY) return 'алгасав (--dry)';
  const r = await syncPlanProgress({ fresh: true });
  return planSyncWarn(r) ?? `${r.n ?? 0} мөр`;
});

let ok = true;
await step('Олгосон дүнгийн тэнцэл', async () => {
  let d = await paidDiff();
  let t = await totals();
  if ((d.length || Math.abs(t.ipc - t.ttb) >= 1) && !DRY) {
    await hoSync();
    d = await paidDiff();
    t = await totals();
  }
  const gap = Math.round(t.ipc - t.ttb);
  if (d.length || Math.abs(gap) >= 1) { ok = false; throw new Error(`зөрсөн мөр ${d.length} · IPC ${Math.round(t.ipc)} − ТТБ ${Math.round(t.ttb)} = ${gap}`); }
  return `тэнцүү (${Math.round(t.ipc).toLocaleString('en-US')} ₮)`;
});

console.log(log.join('\n'));
if (!ok || log.some((l) => l.startsWith('❌'))) process.exit(1);
