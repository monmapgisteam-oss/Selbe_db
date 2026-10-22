#!/usr/bin/env node
/**
 * ENTERPRISE ЗУРАГЛАЛ ҮҮСГЭГЧ (2026-10-20) — `src/lib/services/entMap.data.ts`-ийг үүсгэнэ.
 *
 *   node tools/entMap-build.mjs --csv E:\selbe_1019\export_tailan.csv \
 *        --svc https://gis.selbecity.mn/map/rest/services/Hosted/Selbe_ET/FeatureServer [--svc …]
 *   эсвэл
 *   node tools/entMap-build.mjs --csv … --base https://gis.selbecity.mn/map/rest/services/Hosted --names Selbe_ET,Selbe_BA,…
 *   Сонголт: --token-file <зам> эсвэл орчны ARCGIS_ADMIN_TOKEN (Enterprise токен; org-only үйлчилгээ; POST БИЕЭР —
 *            URL-д хэзээ ч орохгүй, `tools/tokenInUrl.check.mjs`) · --dry (файл бичихгүй, зөвхөн тайлан) · --out <зам>
 *   ⚠️ 2026-10-21 (аудит): `--token <утга>` argv-д ИЛ (процессын жагсаалт · shell-ийн түүх) — ажиллах ч анхааруулна;
 *      давуу эрэмбэ: --token-file → ARCGIS_ADMIN_TOKEN → --token.
 *
 * Оролт 1 — ArcGIS Pro экспортын тайлан (`export_tailan.csv`, UTF-8 BOM): «Үйлчилгээ» (AGOL үйлчилгээний
 *   нэр), «Давхарга №», «Шинэ нэр» (gdb дахь нэр = Enterprise-д нийтлэгдсэн давхарга/хүснэгтийн нэр), «Төлөв».
 * Оролт 2 — Enterprise FeatureServer бүрийн мета (`f=json`): `layers[] · tables[]` → `{ id, name }`.
 * Гаралт — `<AGOL үйлчилгээ>/<№>` → `<Enterprise үйлчилгээ>/<№>`; нэг AGOL үйлчилгээний БҮХ мөр нэг
 *   Enterprise үйлчилгээнд орсон бол `<AGOL үйлчилгээ>/*` → `<Enterprise үйлчилгээ>` мөн нэмэгдэнэ
 *   (`${HJ}/QAQC/FeatureServer` маягийн үйлчилгээний түвшний хаягт, `entMap.remapWith`).
 *
 * ⚠️ Таараагүй нэр нэг ч байвал файл БИЧИХГҮЙ, exit 1 — хагас зураглал deploy хийгдвэл зарим давхарга
 *    AGOL, зарим нь Enterprise-ээс уншиж өгөгдөл зөрнө. Нэрийн таарал: NFC · trim · жижиг үсэг · зай→`_`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const multi = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const csvPath = opt('--csv') ?? 'E:\\selbe_1019\\export_tailan.csv';
/* ⚠️ 2026-10-21 (аудит): токеныг argv-д бичихгүй — файл эсвэл орчны хувьсагч; `--token` хэвээр ажиллах ч анхааруулна */
const argvToken = opt('--token') ?? '';
if (argvToken) console.warn('⚠️ --token argv-д ил (процессын жагсаалт · shell түүх) — --token-file <зам> эсвэл ARCGIS_ADMIN_TOKEN хэрэглэнэ үү');
const tokenFile = opt('--token-file');
const token = (tokenFile ? readFileSync(tokenFile, 'utf8').trim() : '') || (process.env.ARCGIS_ADMIN_TOKEN ?? '').trim() || argvToken;
const dry = args.includes('--dry');
const outPath = resolve(opt('--out') ?? 'src/lib/services/entMap.data.ts');
let svcs = multi('--svc').filter(Boolean);
/* ⚠️ 2026-10-20: талбарын толь (ENT_FIELDS) — `--fields <agol_fields.json>` (`tools/agol-fields.py`, AGOL-ын ЭХ нэрс),
   `--pair <agol_fields түлхүүр>=<Enterprise үйлчилгээ>/<№>` — экспортын тайланд ороогүй давхарга (ХАБЭА Survey123). */
const fieldsPath = opt('--fields');
const pairs = multi('--pair').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; });
if (opt('--base') && opt('--names')) {
  const base = opt('--base').replace(/\/+$/, '');
  svcs = svcs.concat(opt('--names').split(',').map((n) => n.trim()).filter(Boolean).map((n) => `${base}/${n}/FeatureServer`));
}
if (!svcs.length) {
  console.error('Enterprise үйлчилгээ өгнө үү: --svc <…/FeatureServer> (олон удаа) эсвэл --base <…/Hosted> --names a,b,c');
  process.exit(2);
}

/* ── CSV (RFC 4180: хашилт доторх таслал · мөр шилжилт · "" ) ── */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() ?? [];
  return rows.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const norm = (s) => String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, '_');
const svcNameOf = (url) => {
  const m = /\/([^/]+)\/FeatureServer\/?$/i.exec(url);
  if (!m) throw new Error(`FeatureServer хаяг биш: ${url}`);
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
};

/* ── Enterprise мета ── */
async function meta(url) {
  const body = new URLSearchParams({ f: 'json', ...(token ? { token } : {}) });
  const r = await fetch(url.replace(/\/+$/, ''), { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const j = await r.json();
  if (j?.error) throw new Error(`${url}: ${j.error.code ?? ''} ${j.error.message ?? ''}`);
  const items = [...(j.layers ?? []), ...(j.tables ?? [])];
  if (!items.length) throw new Error(`${url}: давхарга/хүснэгт алга (нийтлэгдээгүй эсвэл эрхгүй?)`);
  return items.map((x) => ({ id: Number(x.id), name: String(x.name ?? '') }));
}
/** Давхаргын мета — талбар · OID · засварын мөшгөлт (ENT_FIELDS-ийн `ren`) */
async function layerMeta(url) {
  const body = new URLSearchParams({ f: 'json', ...(token ? { token } : {}) });
  const r = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
  const j = await r.json();
  if (j?.error) throw new Error(`${url}: ${j.error.code ?? ''} ${j.error.message ?? ''}`);
  return j;
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const need = ['Үйлчилгээ', 'Давхарга №', 'Шинэ нэр'];
for (const k of need) if (!(k in (rows[0] ?? {}))) { console.error(`CSV-д «${k}» багана алга: ${csvPath}`); process.exit(2); }
console.log(`CSV: ${rows.length} мөр (${csvPath})`);

const index = new Map(); // norm(name) → { svc, id, name }
const dupNames = new Set();
for (const url of svcs) {
  const svc = svcNameOf(url);
  const items = await meta(url);
  for (const it of items) {
    const k = norm(it.name);
    if (index.has(k)) dupNames.add(it.name);
    index.set(k, { svc, id: it.id, name: it.name, url: `${url.replace(/\/+$/, '')}/${it.id}` });
  }
  console.log(`Enterprise: ${svc} — ${items.length} давхарга/хүснэгт`);
}
if (dupNames.size) {
  console.error(`❌ Enterprise-д ИЖИЛ нэртэй давхарга олон үйлчилгээнд байна (аль нь болох нь тодорхойгүй): ${[...dupNames].join(', ')}`);
  process.exit(1);
}

const map = {};
const bySvc = new Map(); // AGOL svc → Set(ent svc)
const unmatched = [];
let notOk = 0;
for (const r of rows) {
  const agolSvc = r['Үйлчилгээ'].trim();
  const n = Number(r['Давхарга №']);
  const name = r['Шинэ нэр'].trim();
  if (!agolSvc || !Number.isInteger(n) || !name) continue;
  if ((r['Төлөв'] ?? 'OK') !== 'OK') notOk++;
  const hit = index.get(norm(name));
  if (!hit) { unmatched.push(`${agolSvc}/${n} → ${name}`); continue; }
  map[`${agolSvc}/${n}`] = `${hit.svc}/${hit.id}`;
  if (!bySvc.has(agolSvc)) bySvc.set(agolSvc, new Set());
  bySvc.get(agolSvc).add(hit.svc);
}
for (const [agolSvc, set] of bySvc) if (set.size === 1) map[`${agolSvc}/*`] = [...set][0];

/* ── ENT_FIELDS: AGOL-ын эх нэрс + Enterprise-ийн ӨӨР нэртэй талбар (OID · засварын мөшгөлт) ── */
const SHAPE = /^(shape|shape__area|shape__length|shape_area|shape_length)$/i;
const fieldsOut = {};
const fieldIssues = [];
if (fieldsPath) {
  const agol = JSON.parse(readFileSync(fieldsPath, 'utf8'));
  const byName = new Map(Object.entries(agol).map(([n, r]) => [norm(n), r]));
  const targets = [];
  for (const r of rows) {
    const name = r['Шинэ нэр'].trim();
    const hit = index.get(norm(name));
    const a = byName.get(norm(name));
    if (hit && a && !a.error) targets.push({ label: name, ent: hit, a });
  }
  const entBase = svcs[0].replace(/\/[^/]+\/FeatureServer\/?$/i, '');
  for (const [k, to] of pairs) {
    const a = agol[k];
    const cut = to.lastIndexOf('/');
    const svc = to.slice(0, cut);
    const id = Number(to.slice(cut + 1));
    if (!a || a.error) { fieldIssues.push(`--pair ${k}: agol_fields-д алга`); continue; }
    targets.push({ label: k, ent: { svc, id, url: `${entBase}/${encodeURIComponent(svc)}/FeatureServer/${id}` }, a });
  }
  for (const t of targets) {
    const m = await layerMeta(t.ent.url);
    const entNames = new Set((m.fields ?? []).map((f) => String(f.name)));
    const entOid = String(m.objectIdField ?? 'objectid');
    const efi = m.editFieldsInfo ?? {};
    const trk = t.a.track ?? {};
    const trkMap = {
      creatorFieldName: efi.creatorField, createdAtFieldName: efi.creationDateField,
      editorFieldName: efi.editorField, editedAtFieldName: efi.editDateField,
    };
    const agolOid = String(t.a.oid ?? '');
    const ren = {};
    const f = [];
    const miss = [];
    for (const name of t.a.fields ?? []) {
      if (SHAPE.test(name)) continue;
      const lo = name.toLowerCase();
      let ent = null;
      if (name === agolOid) ent = entOid;
      else {
        /* Засварын мөшгөлт: AGOL `EditDate` → Enterprise-ийн АМЬД `last_edited_date` (gdb-ийн хөдөлгөөнгүй хуулбар биш) */
        const tk = Object.keys(trkMap).find((x) => trk[x] === name);
        if (tk && trkMap[tk] && entNames.has(trkMap[tk])) ent = trkMap[tk];
        /* AGOL-ын OID биш `OBJECTID` (жиш. `FID` OID-тай давхарга) — Enterprise OID-той мөргөлдөнө, алгасна */
        else if (entNames.has(lo) && lo !== entOid) ent = lo;
      }
      if (!ent) { miss.push(name); continue; }
      f.push(name);
      if (ent !== lo) ren[lo] = ent;
    }
    const key = `${t.ent.svc}/${t.ent.id}`;
    fieldsOut[key] = { oid: agolOid || entOid, f, ...(Object.keys(ren).length ? { ren } : {}) };
    if (miss.length) fieldIssues.push(`${t.label} (${key}): Enterprise-д алга — ${miss.join(', ')}`);
  }
  console.log(`Талбарын толь: ${Object.keys(fieldsOut).length} давхарга` + (fieldIssues.length ? ` · ⚠️ ${fieldIssues.length} давхаргад зарим талбар алга` : ''));
  for (const x of fieldIssues) console.log('  ⚠️', x);
}

const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
console.log(`Зураглал: ${keys.filter((k) => !k.endsWith('/*')).length} давхарга/хүснэгт · ${keys.filter((k) => k.endsWith('/*')).length} үйлчилгээ (/*)`
  + (notOk ? ` · ⚠️ тайланд OK биш ${notOk} мөр` : ''));
if (unmatched.length) {
  console.error(`❌ Enterprise-д ОЛДООГҮЙ ${unmatched.length}:\n  ${unmatched.join('\n  ')}`);
  process.exit(1);
}

const body = `/**
 * ENTERPRISE ЗУРАГЛАЛЫН ӨГӨГДӨЛ — \`tools/entMap-build.mjs\` ҮҮСГЭНЭ, ГАРААР БҮҮ ЗАС.
 *
 * Түлхүүр: \`<AGOL үйлчилгээ>/<давхарга №>\` (эсвэл \`<AGOL үйлчилгээ>/*\` — тэр үйлчилгээний
 * БҮХ давхарга нэг Enterprise үйлчилгээнд орсон бол), утга: \`<Enterprise үйлчилгээ>/<давхарга №>\`
 * (\`/*\` түлхүүрт зөвхөн Enterprise үйлчилгээний нэр).
 *
 * Үүсгэсэн: ${new Date().toISOString().slice(0, 10)} · эх: ${csvPath.replace(/\\/g, '/')} · Enterprise: ${[...new Set(svcs.map(svcNameOf))].join(', ')}
 */
export type EntFieldsRec = {
  /** AGOL-ын OID талбарын нэр (OBJECTID · FID · objectid) */
  oid: string;
  /** AGOL-ын ЭХ талбарын нэрс (том/жижиг үсэг хэвээр) */
  f: string[];
  /** AGOL нэр (жижиг үсгээр) → Enterprise-ийн ӨӨР нэртэй талбар: OID, засварын мөшгөлт */
  ren?: Record<string, string>;
};
export const ENT_MAP: Readonly<Record<string, string>> = {
${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n')}
};
export const ENT_FIELDS: Readonly<Record<string, EntFieldsRec>> = {
${Object.keys(fieldsOut).sort((a, b) => a.localeCompare(b)).map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(fieldsOut[k])},`).join('\n')}
};
`;
if (dry) { console.log(body); process.exit(0); }
writeFileSync(outPath, body, 'utf8');
console.log(`✅ ${outPath}`);
