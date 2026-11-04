/**
 * ӨГӨГДЛИЙН АУДИТ (2026-11-04) — Enterprise-ийн амьд өгөгдлийг ЗӨВХӨН УНШИЖ зөрүү олно, юу ч засахгүй.
 *   npm run audit:data -- --out=<хавтас> [--only=schema,hoSync,…] [--max-rows=50] [--strict] [--json]
 *
 * `*.check.mjs` БИШ: шалгуурын горимд аппын хүснэгтүүд (183/191/192/193/230) хаалттай, `test-all` ч авна. Токен ба бичилтийн
 * хаалтыг `liveFetch.mjs`-ээс өөрөө суулгана; бичих endpoint fetch түвшинд хаагдаж, оролдлогын тоо тайланд ордог (0 байх ёстой).
 * Дуудлагын гарц: 0 = дууссан · 1 = `--strict` ба зөрүүтэй · 2 = Enterprise/токен ашиглах боломжгүй.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveStatus } from './liveEnv.mjs';
import { installTokenInjection, installWriteGuard, loadAdminTokens, writeAttempts } from './liveFetch.mjs';
import { summarize, toJson, toMarkdown } from './audit/report.mjs';

const arg = (name, dflt = null) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

const started = Date.now();
const only = arg('only') ? new Set(String(arg('only')).split(',').map((s) => s.trim()).filter(Boolean)) : null;
const outDir = path.resolve(String(arg('out') || path.join(os.tmpdir(), 'selbe-data-audit')));
const maxRows = Number(arg('max-rows', 50)) || 50;
const log = (m) => console.log(m);

/* Нэвтрэлтийн сешнгүй Node — унших кодын «нэвтрээгүй» хаалтыг алгасна; бичилт нь fetch-ийн хаалтад баригдана */
process.env.NEXT_PUBLIC_AUTH_OFF = '1';

const ent = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
const tokens = loadAdminTokens();
if (!ent) { console.error('❌ NEXT_PUBLIC_ENT_DATA алга (.env)'); process.exit(2); }
if (!tokens.tok) { console.error('❌ ARCGIS_ADMIN_TOKEN алга (.env.development.local)'); process.exit(2); }
const st = await liveStatus({ ent, tok: tokens.tok, warn: (m) => console.warn(m) });
if (st.skip || st.tokOff) { console.error(`❌ Enterprise ашиглах боломжгүй: ${st.reason ?? 'токен хүчингүй'}`); process.exit(2); }

installWriteGuard({ stubAppTables: false });
installTokenInjection(tokens);
let reads = 0;
const inner = globalThis.fetch;
globalThis.fetch = (input, init) => { reads += 1; return inner(input, init); };

const wants = (id) => !only || only.has(id);
const result = { meta: {}, cross: [], schema: null };

if (wants('schema')) {
  log('▓ Схем…');
  const { runSchema } = await import('./audit/schema.mjs');
  result.schema = await runSchema({ log });
}

const { CROSS_ITEMS } = await import('./audit/cross.mjs');
for (const it of CROSS_ITEMS) {
  if (!wants(it.id) && !wants('cross')) continue;
  const t0 = Date.now();
  log(`▓ ${it.title}…`);
  try {
    const r = await it.run();
    result.cross.push({ id: it.id, title: it.title, ...r, n: r.rows?.length ?? 0 });
  } catch (e) {
    result.cross.push({ id: it.id, title: it.title, status: 'error', n: 0, rows: [], note: e?.message ?? String(e) });
  }
  const last = result.cross[result.cross.length - 1];
  log(`  ${last.status} · ${last.n} мөр · ${Math.round((Date.now() - t0) / 1000)} с`);
}

result.meta = { at: new Date().toISOString(), ent, durationMs: Date.now() - started, reads, writesBlocked: writeAttempts(), node: process.version };
result.summary = summarize(result);

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const jsonPath = path.join(outDir, `data-audit-${stamp}.json`);
const mdPath = path.join(outDir, `data-audit-${stamp}.md`);
writeFileSync(jsonPath, toJson(result));
if (!arg('json')) writeFileSync(mdPath, toMarkdown(result, { maxRows }));

log(`\nДүн: ${JSON.stringify(result.summary)}`);
log(`Бичих оролдлого: ${result.meta.writesBlocked} · хүсэлт: ${reads}`);
log(`JSON: ${jsonPath}`);
if (!arg('json')) log(`MD:   ${mdPath}`);

if (result.meta.writesBlocked > 0) { console.error('❌ Бичих оролдлого гарсан — хаалтад баригдсан, кодыг шалгана уу'); process.exit(1); }
process.exit(arg('strict') && (result.summary.diff > 0 || result.summary.schemaFail > 0) ? 1 : 0);
