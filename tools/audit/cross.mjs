/**
 * ХҮСНЭГТ ХООРОНДЫН ЗӨРҮҮ (2026-11-04) — порталын цэвэр тооцоог (`plan*` · `compute*` · `diffRows`) дахин ашиглана, бичих
 * замыг (`runHoSync` · `syncNegtgel` · `writeTable` · `syncPlanProgress` · `refreshAutoZoruu`) ХЭЗЭЭ Ч дуудахгүй.
 * Зүйл бүр `{ status, rows, note }` буцаана: `diff` = зөрүү, `warn` = анхаарах, `ok` = зөрүүгүй.
 */
import { queryFeatures } from '../../src/lib/query.ts';
import {
  BAGTS_NEGTGEL, BUILDING, CASHFLOW_NEW, CF_WORK_WHERE, GAZAR_PARCEL, HABEA, HO_IPC, PARCEL_LEFT, PARCEL_STATUS_HUES,
  SELBE_PUBLIC, TUSUL_NEGTGEL, bagtsKey, buildingKey,
} from '../../src/lib/services.ts';
import { PKGS, PKG_GROUPS, fillSchema, loadSchema } from '../../src/modules/sheet/bagts.pkg.ts';
import { loadRows } from '../../src/modules/sheet/bagtsSheet.ts';
import { negRowsFromPlan, negDisplay, negtgelProjectPct } from '../../src/lib/negtgel.ts';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v) => (v == null ? '' : String(v).trim());
const round = (v, d = 4) => (v == null ? null : Number(Number(v).toFixed(d)));
const res = (rows, note, warnOnly = false) => ({
  status: rows.some((r) => !r.known) ? (warnOnly ? 'warn' : 'diff') : 'ok',
  rows,
  note,
});

/** Засварын мөр → талбар тус бүрийн «хадгалсан / бодсон» мөрүүд */
function explode(kind, updates, oidField, storedByOid, label = () => ({})) {
  return updates.flatMap((u) => {
    const oid = u[oidField];
    const cur = storedByOid.get(Number(oid)) ?? {};
    return Object.entries(u).filter(([f]) => f !== oidField).map(([field, computed]) => ({
      төрөл: kind, oid, ...label(cur), талбар: field, хадгалсан: cur[field] ?? null, бодсон: computed,
    }));
  });
}

/* ══════════════ 182 ↔ 185 ══════════════ */
async function hoSync() {
  const { loadCfContractRows, computeBlockBudgets } = await import('../../src/lib/hoSync/sync.ts');
  const { planHoSync, planPaidSync } = await import('../../src/lib/hoSync/compute.ts');
  const C = HO_IPC.contractFields;
  const ho = await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` });
  const cf = await loadCfContractRows();
  const plan = planHoSync(ho, cf);
  const paid = planPaidSync(ho, cf);
  const byHo = new Map(ho.map((r) => [Number(r[HO_IPC.oid]), r]));
  const byCf = new Map(cf.map((r) => [Number(r[CASHFLOW_NEW.oid]), r]));
  const rows = [
    ...explode('185 ← 182', plan.updates, HO_IPC.oid, byHo, (r) => ({ гэрээ: txt(r[C.code]) })),
    ...explode('182 ← 185 олгосон', paid.updates, CASHFLOW_NEW.oid, byCf, (r) => ({ гэрээ: txt(r[CASHFLOW_NEW.fields.pkg]) })),
    ...plan.adds.map((a) => ({ төрөл: '185-д алга гэрээ', гэрээ: txt(a[C.code]) || txt(a[C.pkg]), талбар: txt(a[C.contractor]) || null })),
    ...plan.unmatched.map((c) => ({ төрөл: '185-ын гэрээ 182-т таараагүй', гэрээ: c })),
    ...paid.unassigned.map((id) => ({ төрөл: '185-ын төлбөр гэрээнд оноогдоогүй', гэрээ: id })),
  ];
  const blocks = await computeBlockBudgets().catch((e) => ({ error: e?.message ?? String(e) }));
  if (Array.isArray(blocks)) for (const b of blocks) rows.push({ төрөл: '182 блокийн төсөв', oid: b[CASHFLOW_NEW.oid], талбар: Object.keys(b).filter((k) => k !== CASHFLOW_NEW.oid).join(','), бодсон: b[CASHFLOW_NEW.fields.budget] ?? null });
  return res(rows, `185: ${ho.length} мөр · 182 гэрээт ажил: ${cf.length}${blocks.error ? ` · блокийн төсөв уншигдсангүй: ${blocks.error}` : ''}`);
}

/* ══════════════ 187 ↔ хуудас/газар ══════════════ */
async function negtgel187() {
  const { computeNegAuto, loadNegRaw, loadNegSources, negDiff, negSysDiff, planNegSync } = await import('../../src/lib/negtgelAuto.ts');
  const stored = await loadNegRaw();
  const src = await loadNegSources(false);
  const calc = computeNegAuto(stored, src);
  const plan = planNegSync(stored, calc, false);
  const F = TUSUL_NEGTGEL.fields;
  const SCALE = TUSUL_NEGTGEL.scale;
  const byOid = new Map(stored.map((s) => [s.oid, s]));
  const rows = [];
  for (const u of negSysDiff(stored, calc)) {
    const s = byOid.get(u[TUSUL_NEGTGEL.oid]);
    if (F.sysAct in u) rows.push({ төрөл: 'sys_guitsetgel', oid: s.oid, код: s.code, нэр: s.name, хадгалсан: s.sysAct == null ? null : round(s.sysAct * SCALE), бодсон: round(u[F.sysAct]) });
    if (F.sysNextWk in u) rows.push({ төрөл: 'sys_next_week', oid: s.oid, код: s.code, нэр: s.name, хадгалсан: s.sysNw == null ? null : round(s.sysNw * SCALE), бодсон: round(u[F.sysNextWk]) });
  }
  for (const b of plan.blocked) rows.push({ төрөл: `хамгаалалт ±0.2 (${b.field})`, oid: b.oid, код: b.code, нэр: b.name, хадгалсан: round(b.from * SCALE), бодсон: round(b.to * SCALE) });
  const excel = negDiff(stored, calc).length;
  const total = plan.total ? `нийт ${round(plan.total.from)} → ${round(plan.total.to)}${plan.totalBlocked ? ' (хамгаалалтад баригдсан)' : ''}` : 'нийт тодорхойгүй';
  return res(rows, `${stored.length} мөр · ${total} · Excel-ийн баганууд бодолтоос зөрсөн мөр (лавлах): ${excel}`);
}

/* ══════════════ 190 ↔ хуудас ══════════════ */
const ts = (ms) => `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

async function negtgel190() {
  const { bRowOf, blendSheets, sheetObyem } = await import('../../src/lib/negtgelWrite.ts');
  const { sumObyemParts, uniqueBlockCounts } = await import('../../src/lib/blockProgress.ts');
  const F = BAGTS_NEGTGEL.fields;
  const all = await queryFeatures(BAGTS_NEGTGEL.url, { outFields: [BAGTS_NEGTGEL.oid, F.date, F.bagts, F.progress, F.planned, F.volume, F.volumePlan] });
  const now = Date.now();
  const latest = new Map();
  let future = 0;
  for (const r of all) {
    const k = bagtsKey(r[F.bagts]);
    const d = num(r[F.date]);
    if (!k || d == null) continue;
    if (d > now) { future += 1; continue; }
    const cur = latest.get(k);
    if (!cur || d > cur[F.date] || (d === cur[F.date] && r[BAGTS_NEGTGEL.oid] > cur[BAGTS_NEGTGEL.oid])) latest.set(k, r);
  }
  const rows = [];
  for (const group of PKG_GROUPS) {
    const row = latest.get(bagtsKey(group));
    const pages = PKGS.filter((p) => p.group === group);
    const parts = [];
    let newest = null;
    for (const p of pages) {
      const sc = await loadSchema(p).catch(() => null);
      if (!sc?.f.fillDate) continue;
      const fill = sc.f.fillDate;
      const top = await bRowOf(p, sc, fill, '1=1').catch(() => null);
      if (top?.at != null && (newest == null || top.at > newest)) newest = top.at;
      if (!row) continue;
      const r = await bRowOf(p, sc, fill, `${fill} <= ${ts(row[F.date])}`).catch(() => null);
      if (r && r.act != null) parts.push({ p, sc, r });
      else if (sc.act.some(Boolean)) parts.push({ p, sc, r: { act: 0, plan: r?.plan ?? null, at: r?.at ?? null } });
    }
    if (!row) {
      if (newest != null) rows.push({ төрөл: '190-д мөр алга, хуудас нийтлэгдсэн', багц: group, 'хуудасны сүүлч': new Date(newest).toISOString().slice(0, 10) });
      continue;
    }
    const day = new Date(row[F.date]).toISOString().slice(0, 10);
    const base = { багц: group, огноо: day };
    if (newest != null && newest > row[F.date] + 86400000) rows.push({ төрөл: 'хуудас 190-оос шинэ', ...base, 'хуудасны сүүлч': new Date(newest).toISOString().slice(0, 10) });
    if (!parts.length) continue;
    const pick = (f) => (parts.length === 1 ? f(parts[0].r) : blendSheets(parts.map((x) => ({ bld: x.sc.bld, v: f(x.r) }))));
    const act = pick((r) => r.act);
    const pln = pick((r) => r.plan);
    const cmp = (kind, stored, computed, tol = 0.01) => {
      if (stored == null && computed == null) return;
      if (stored != null && computed != null && Math.abs(stored - computed) <= tol) return;
      rows.push({ төрөл: kind, ...base, хадгалсан: round(stored), бодсон: round(computed) });
    };
    cmp('гүйцэтгэл %', num(row[F.progress]), act == null ? null : act * 100);
    cmp('төлөвлөгөө %', num(row[F.planned]), pln == null ? null : pln * 100);
    const weights = uniqueBlockCounts(parts.map((x) => x.sc.bld));
    const withN = parts.map((x, i) => ({ ...x, n: weights[i] }));
    const volParts = withN.some((x) => x.n > 0) ? withN.filter((x) => x.n > 0) : withN.slice(0, 1);
    const vols = await Promise.all(volParts.map((x) => sheetObyem(x.p, x.r.at).catch(() => null)));
    if (vols.every((v) => v != null)) {
      const vol = sumObyemParts(volParts.map((x, i) => ({ n: x.n, ...vols[i] })));
      cmp('бодит обьём', num(row[F.volume]), vol.volume, 0.5);
      cmp('төлөвлөгөөт обьём', num(row[F.volumePlan]), vol.volumePlan, 0.5);
    }
  }
  return res(rows, `190: ${all.length} мөр · ${latest.size}/${PKG_GROUPS.length} багцад мөртэй${future ? ` · ирээдүйн огноотой ${future} мөр хасав` : ''}`);
}

/* ══════════════ 186 ↔ хуудасны обьём ══════════════ */
async function huvaari186() {
  const { HUVAARI_OBYEM, loadPkgPlan, balanced } = await import('../../src/lib/huvaariObyem.ts');
  /* Хоосон хүснэгт «зөрүүгүй» БИШ — тулгах юм алга гэсэн үг. Алдааг ч 0 гэж уншихгүй (`countPlanRows` алдаанд null) */
  const cnt = await fetch(`${HUVAARI_OBYEM}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', where: '1=1', returnCountOnly: 'true' }),
  }).then((r) => r.json());
  if (cnt.error || cnt.count == null) throw new Error(`186 тоологдсонгүй: ${cnt.error?.message ?? 'хариу хоосон'}`);
  if (cnt.count === 0) return { status: 'warn', rows: [{ төрөл: '186 хоосон', тоо: 0 }], note: '186-д нэг ч мөр алга — сарын обьёмын төлөвлөгөө оруулаагүй, тулгах юм алга' };
  const rows = [];
  let total = 0;
  let planned = 0;
  for (const pkg of PKGS) {
    const { plan, dups } = await loadPkgPlan(pkg.key);
    for (const o of dups) rows.push({ төрөл: 'давхардсан dkey', хуудас: pkg.key, oid: o });
    if (!plan.size) continue;
    planned += 1;
    const sc = await fillSchema(pkg);
    const need = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.des, sc.f.vol, sc.f.wC].filter(Boolean);
    const { rows: sheet } = await loadRows(pkg, sc, undefined, need);
    const byDes = new Map(sheet.filter((r) => r.des != null).map((r) => [r.des, r]));
    for (const [des, byBlok] of plan) {
      const r = byDes.get(des);
      if (!r) { rows.push({ төрөл: '186-ийн ажил хуудсанд алга', хуудас: pkg.key, des }); continue; }
      for (const [blok, months] of byBlok) {
        total += 1;
        if (!sc.bld.includes(blok)) { rows.push({ төрөл: '186-ийн блок хуудсанд алга', хуудас: pkg.key, des, блок: blok, ажил: r.work }); continue; }
        if (r.vol == null) continue;
        if (!balanced(months, r.vol)) {
          const sum = [...months.values()].reduce((a, b) => a + b, 0);
          rows.push({ төрөл: 'сарын нийлбэр ≠ обьём', хуудас: pkg.key, des, блок: blok, ажил: r.work, 'Σ сар': round(sum, 2), обьём: r.vol, зөрүү: round(sum - r.vol, 2) });
        }
      }
    }
  }
  return res(rows, `төлөвлөгөөтэй хуудас: ${planned}/${PKGS.length} · шалгасан ажил×блок: ${total}`);
}

/* ══════════════ Барилга 0 ↔ хуудасны блок ══════════════ */
/* `blockProgress.check.mjs`-ийн зөвшөөрсөн жагсаалттай ИЖИЛ — энд нуухгүй, `known`-оор тэмдэглэнэ */
const KNOWN_ORPHAN = new Set(['БАГЦ2|5/8', 'БАГЦ1|29/3']);
const KNOWN_DUP = new Set(['БАГЦ1|29/1', 'БАГЦ2|5/6']);

async function blockKeys() {
  const { loadBlockProgressFresh, mapKeyIssues } = await import('../../src/lib/blockProgress.ts');
  const f = BUILDING.fields;
  const blds = await queryFeatures(BUILDING.url, { outFields: [BUILDING.oid, f.bagts, f.block] });
  const prog = await loadBlockProgressFresh();
  const issues = mapKeyIssues(blds.map((b) => buildingKey(b[f.bagts], b[f.block])), prog.keys());
  const rows = [
    ...issues.dup.map((k) => ({ төрөл: 'давхардсан БАГЦ|БЛОК', түлхүүр: k, known: KNOWN_DUP.has(k) })),
    ...issues.orphan.map((k) => ({ төрөл: 'гүйцэтгэлтэй, давхаргад алга', түлхүүр: k, known: KNOWN_ORPHAN.has(k) })),
    ...issues.relabel.map((x) => ({ төрөл: 'багцын нэр зөрсөн', түлхүүр: x.measured, давхаргад: x.feature, known: KNOWN_ORPHAN.has(x.measured) })),
  ];
  const known = rows.filter((r) => r.known).length;
  return res(rows, `давхарга: ${blds.length} барилга · хэмжилттэй: ${prog.size} блок · өмнө мэдэгдэж буй: ${known}`);
}

/* ══════════════ selbe_public ══════════════ */
async function publicTables() {
  const { computePublicTables, diffRows } = await import('../../src/lib/publicSync/sync.ts');
  const { PUBLIC_KEYS } = await import('../../src/lib/publicSync/compute.ts');
  const { tables, failed } = await computePublicTables();
  const rows = [];
  const counts = [];
  for (const [t, id] of Object.entries(SELBE_PUBLIC.tables)) {
    const wanted = tables[t];
    if (!wanted) { counts.push(`${t}: бодогдсонгүй`); continue; }
    const cur = await queryFeatures(`${SELBE_PUBLIC.url}/${id}`, { outFields: ['*'], orderBy: `${SELBE_PUBLIC.oid} ASC` });
    const byOid = new Map(cur.map((r) => [Number(r[SELBE_PUBLIC.oid]), r]));
    const d = diffRows(cur, wanted, PUBLIC_KEYS[t], false, Date.now());
    counts.push(`${t}: ${cur.length}→${wanted.length}`);
    rows.push(...explode(`${t}: зөрсөн`, d.updates, SELBE_PUBLIC.oid, byOid, (r) => ({ түлхүүр: PUBLIC_KEYS[t].map((k) => txt(r[k])).join('|') })));
    for (const a of d.adds) rows.push({ төрөл: `${t}: хүснэгтэд алга`, түлхүүр: PUBLIC_KEYS[t].map((k) => txt(a[k])).join('|') });
    for (const o of d.deletes) rows.push({ төрөл: `${t}: илүү мөр`, oid: o, түлхүүр: PUBLIC_KEYS[t].map((k) => txt(byOid.get(o)?.[k])).join('|') });
  }
  return res(rows, `${counts.join(' · ')}${failed.length ? ` · бодолт дутуу: ${failed.join('; ')}` : ''}`);
}

/* ══════════════ 182 хувь ══════════════ */
async function planPct() {
  const { loadProjectPlan } = await import('../../src/lib/projectPlanInputs.ts');
  const { planProgressUpdates } = await import('../../src/lib/projectPlanSync.ts');
  const plan = await loadProjectPlan();
  if (plan.empty) return { status: 'warn', rows: [], note: 'төлөвлөгөө хоосон' };
  if (plan.failed.length) return { status: 'warn', rows: [], note: `эх дутуу тул бодсонгүй: ${plan.failed.join(', ')}` };
  const stored = new Map((plan.stored ?? []).map((r) => [Number(r.objectid), r]));
  const rows = explode('182', planProgressUpdates(plan), CASHFLOW_NEW.oid, stored, (r) => ({ код: r.dd_kod ?? null }));
  return res(rows, `${plan.tree.nodes.length} мөр бодов`);
}

/* ══════════════ Үндсэн 182 ↔ нөөц 187 ══════════════
   Нэгтгэл/дашбоард/агент нь `loadNegtgelFull` → 182-ыг ашигладаг. 187 нь 182 унасан/хоосон үед л нөөц.
   Нөөцийн зөрүүг одоогийн дэлгэцийн алдаа гэж ангилахгүй; харин дэлгэцийн хөрвүүлэлтийг 182-тай тулгана. */
async function planVsNegtgel() {
  const { loadProjectPlan } = await import('../../src/lib/projectPlanInputs.ts');
  const { computeNegAuto, loadNegRaw, loadNegSources, projectTotal } = await import('../../src/lib/negtgelAuto.ts');
  const plan = await loadProjectPlan();
  if (plan.empty || plan.failed.length) return { status: 'warn', rows: [], note: `182-ын эх дутуу: ${plan.failed.join(', ') || 'хоосон'}` };
  const stored = await loadNegRaw();
  const calc = computeNegAuto(stored, await loadNegSources(false));
  return comparePlanNegtgel(plan, calc, projectTotal(calc));
}

/** Бодит дэлгэцийн хөрвүүлэлт ба хуучин нөөцийн ялгааг тусад нь ангилна. Сүлжээ/бичилтгүй. */
export function comparePlanNegtgel(plan, calc, tot187) {
  /* Код давхцаж болно (182-т «3» хоёр удаа) — ижил кодыг ДАРААЛЛААР нь хослуулна */
  const queue = new Map();
  for (const n of plan.tree.nodes) {
    if (!n.code) continue;
    queue.set(n.code, [...(queue.get(n.code) ?? []), n]);
  }
  const rows = [];
  let matched = 0;
  const only187 = [];
  calc.forEach((c) => {
    const n = queue.get(c.code)?.shift();
    if (!n) { only187.push(c.code); return; }
    matched += 1;
    const v = plan.result.values.get(n);
    const a = c.act == null ? null : c.act * 100;
    if (a != null && v?.S != null && Math.abs(a - v.S) > 0.01) {
      rows.push({ төрөл: 'гүйцэтгэл %', код: c.code, түвшин: c.depth, нэр: txt(c.name).slice(0, 50), '187': round(a, 2), '182': round(v.S, 2), зөрүү: round(a - v.S, 2) });
    }
    if (c.budget != null && v?.E != null && Math.abs(c.budget - v.E) > 1) {
      rows.push({ төрөл: 'төсөв ₮', код: c.code, түвшин: c.depth, нэр: txt(c.name).slice(0, 50), '187': round(c.budget, 0), '182': round(v.E, 0), зөрүү: round(c.budget - v.E, 0) });
    }
  });
  const only182 = [...queue.values()].flat().map((n) => n.code);
  for (const code of only187) rows.push({ төрөл: '187-д бий, 182-т алга', код: code });
  for (const code of only182) rows.push({ төрөл: '182-т бий, 187-д алга', код: code });
  rows.sort((x, y) => (x.түвшин ?? 99) - (y.түвшин ?? 99) || Math.abs(y.зөрүү ?? 0) - Math.abs(x.зөрүү ?? 0));
  const rootS = plan.result.values.get(plan.tree.root)?.S;
  if (tot187 != null && rootS != null && Math.abs(tot187 * 100 - rootS) > 0.01) rows.unshift({ төрөл: 'НӨӨЦИЙН НИЙТ %', код: '0', түвшин: 0, нэр: 'Төслийн нийт', '187': round(tot187 * 100, 2), '182': round(rootS, 2), зөрүү: round(tot187 * 100 - rootS, 2) });
  const display = negDisplay(negRowsFromPlan(plan));
  const current = negtgelProjectPct(display.rows, display.calc);
  const displayDiff = (rootS == null) !== (current == null)
    || (rootS != null && current != null && Math.abs(rootS - current) > 0.01);
  if (displayDiff) rows.unshift({ төрөл: '182 ↔ дэлгэцийн хөрвүүлэлт', '182': round(rootS), дэлгэц: round(current) });
  return {
    status: displayDiff ? 'diff' : rows.length ? 'warn' : 'ok', rows,
    note: `Үндсэн 182: ${round(rootS, 2)}% · нэгтгэлийн дэлгэц: ${round(current, 2)}%. 187 нь зөвхөн нөөц; доорх 182↔187 ялгаа нь хоёр идэвхтэй дэлгэцийн зөрүү БИШ. Хослосон: ${matched} · 187: ${calc.length} · 182: ${plan.tree.nodes.length}`,
  };
}

/* ══════════════ 185 guits_zoruu ══════════════ */
async function ipcZoruu() {
  const { planAutoZoruu } = await import('../../src/lib/ipcAuto.ts');
  const { unlinkedPays } = await import('../../src/lib/ipc.ts');
  const ho = await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` });
  const byOid = new Map(ho.map((r) => [Number(r[HO_IPC.oid]), r]));
  const C = HO_IPC.contractFields;
  const P = HO_IPC.payFields;
  const rows = planAutoZoruu(ho).map((x) => ({ төрөл: 'guits_zoruu', oid: x.oid, гэрээ: txt(byOid.get(x.oid)?.[C.code]), хадгалсан: x.from, бодсон: x.to }));
  for (const r of unlinkedPays(ho)) rows.push({ төрөл: 'багцад холбогдоогүй төлбөр', oid: r[HO_IPC.oid], гэрээ: txt(r[C.code]), мөр: txt(r[P.id]), багц: txt(r[C.pkg]), дүн: r[P.amount] });
  const ids = new Map();
  for (const r of ho) { const k = txt(r[P.id]); if (k) ids.set(k, (ids.get(k) ?? 0) + 1); }
  for (const [k, n] of ids) if (n > 1) rows.push({ төрөл: 'давхардсан murun_id', мөр: k, тоо: n });
  return res(rows, `185: ${ho.length} мөр`);
}

/* ══════════════ Газар 151 ↔ 152 ══════════════ */
async function land() {
  const { loadParcelAreaRows, parcelAreaOf, parcelAreasDeduped } = await import('../../src/lib/land.ts');
  const F = PARCEL_LEFT.fields;
  const left = await loadParcelAreaRows();
  const cad = await queryFeatures(GAZAR_PARCEL.url, { outFields: [GAZAR_PARCEL.fields.parcelId] });
  const cadIds = new Set(cad.map((r) => txt(r[GAZAR_PARCEL.fields.parcelId])).filter(Boolean));
  const rows = [];
  const labels = new Map();
  for (const r of left) { const s = txt(r[F.status]); labels.set(s, (labels.get(s) ?? 0) + 1); }
  for (const [s, n] of labels) if (s && !(s in PARCEL_STATUS_HUES)) rows.push({ төрөл: 'өнгөгүй төлөв', утга: s, тоо: n });
  if (labels.get('')) rows.push({ төрөл: 'төлөв хоосон', тоо: labels.get('') });
  const noArea = left.filter((r) => parcelAreaOf(r) == null);
  if (noArea.length) rows.push({ төрөл: 'талбайгүй нэгж талбар', тоо: noArea.length });
  const deduped = parcelAreasDeduped(left).filter((a) => a === 0).length;
  if (deduped) rows.push({ төрөл: 'хуваагдсан (давхар талбайг хасав)', тоо: deduped });
  const noId = left.filter((r) => !txt(r[F.parcelNo])).length;
  if (noId) rows.push({ төрөл: 'дугааргүй нэгж талбар (152)', тоо: noId });
  /* Лавлах: портал 151 ба 152-ыг `parcel_id`-аар ХОЛБОДОГГҮЙ (`GAZAR_PARCEL.fields.parcelId`-ийг код уншихгүй) — дэлгэцэд нөлөөгүй */
  const ids152 = [...new Set(left.map((r) => txt(r[F.parcelNo])).filter(Boolean))];
  const orphan = ids152.filter((id) => !cadIds.has(id));
  if (orphan.length) rows.push({ төрөл: '152-ын дугаар 151-д алга (лавлах)', тоо: orphan.length, утга: orphan.slice(0, 5).join(', ') });
  return res(rows, `152: ${left.length} (дугаар ${ids152.length}) · 151: ${cad.length} (дугаар ${cadIds.size}) · 152→151 таараагүй: ${orphan.length}`, true);
}

/* ══════════════ Кран 194 ↔ 195 ══════════════ */
export function craneLinkIssues(cranes, buffers, f) {
  const linkOf = (c) => num(c[f.link]) ?? num(c[f.oid]);
  const links = new Map();
  for (const b of buffers) { const k = num(b[f.bufferLink]); links.set(k, (links.get(k) ?? 0) + 1); }
  const craneLinks = new Set(cranes.map(linkOf));
  const rows = [];
  for (const c of cranes) {
    const k = linkOf(c);
    const base = { кран: txt(c[f.dugaar]), oid: c[f.oid], холбоос: k, төлөв: txt(c[f.tuluv]) };
    if (c[f.link] == null) rows.push({ төрөл: 'orig_oid хоосон', ...base });
    const n = links.get(k) ?? 0;
    if (n === 0) rows.push({ төрөл: 'бүсгүй кран', ...base });
    if (n > 1) rows.push({ төрөл: 'олон бүстэй кран', ...base, тоо: n });
  }
  for (const [k, n] of links) if (!craneLinks.has(k)) rows.push({ төрөл: 'кранаа алдсан бүс', холбоос: k, тоо: n });
  return rows;
}

async function crane() {
  const f = HABEA.crane.fields;
  const cranes = await queryFeatures(HABEA.crane.url, { outFields: ['*'] });
  const buffers = await queryFeatures(HABEA.crane.bufferUrl, { outFields: ['*'] });
  return res(craneLinkIssues(cranes, buffers, f), `кран: ${cranes.length} · бүс: ${buffers.length}`);
}

/* ══════════════ CEO зөрүүнүүд ══════════════ */
const flatTables = (kpi, kind) => (kpi.tables ?? []).flatMap((t) => (t.rows ?? []).map((row) => ({
  төрөл: `${kind}: ${t.title ?? ''}`.trim(),
  ...Object.fromEntries((t.cols ?? t.columns ?? []).map((c, i) => [typeof c === 'string' ? c : (c.label ?? `b${i}`), row[i]?.v ?? null])),
})));

async function ceoGaps() {
  const { loadVariance } = await import('../../src/lib/execTriage.ts');
  const { computeVariance } = await import('../../src/lib/ceo/variance.ts');
  const { computeContractGap } = await import('../../src/lib/ceo/contractGap.ts');
  const { computeUncontracted } = await import('../../src/lib/ceo/uncontracted.ts');
  const cf = await queryFeatures(CASHFLOW_NEW.url, { where: CF_WORK_WHERE, outFields: ['*'], orderBy: `${CASHFLOW_NEW.oid} ASC` });
  const v = await loadVariance();
  const vk = computeVariance(v, PKGS.length);
  const gap = computeContractGap(cf);
  const un = computeUncontracted(cf, Date.now());
  const rows = [
    ...v.all.map((w) => ({ төрөл: 'обьём хэтэрсэн', багц: w.pkg, хуудас: w.sheet, '№': w.no, ажил: w.work, обьём: round(w.vol, 2), бөглөсөн: round(w.sum, 2), хэтрэлт: round(w.over, 2), зөрүү: round(w.mnt, 0) })),
    ...gap.rows.filter((r) => r.diff != null && r.diff > 0).map((r) => ({ төрөл: 'гэрээ төсвөөс их', багц: r.pkg, ажил: r.work, гүйцэтгэгч: r.contractor, төсөв: r.budget, гэрээ: r.contract, зөрүү: r.diff })),
    ...gap.rows.filter((r) => r.contract == null).map((r) => ({ төрөл: 'гэрээтэй, дүнгүй', багц: r.pkg, ажил: r.work, гүйцэтгэгч: r.contractor })),
    ...flatTables(un, 'гэрээгүй'),
  ];
  return res(rows, `обьём: ${vk.facts?.join(', ') || v.works} · уншигдаагүй багц ${v.failedPkgs} · гэрээгүй: ${un.facts?.join(', ') ?? ''} · төсөвгүй гэрээ ${gap.noBudget ?? 0}`, true);
}

/** Дараалал: төлөвлөгөө эхэлж кэш дулаацуулна (`loadProjectPlan` хүнд) */
export const CROSS_ITEMS = [
  { id: 'planPct', title: '182 гүйцэтгэлийн % · огноо ↔ дахин бодолт', run: planPct },
  { id: 'planVsNeg', title: 'Үндсэн 182 · нэгтгэлийн дэлгэц ↔ нөөц 187', run: planVsNegtgel },
  { id: 'public', title: 'selbe_public 6 хүснэгт ↔ дахин бодолт', run: publicTables },
  { id: 'negtgel187', title: '187 төслийн нэгтгэл ↔ хуудас · газар', run: negtgel187 },
  { id: 'negtgel190', title: '190 багцын нэгтгэл ↔ хуудас', run: negtgel190 },
  { id: 'huvaari186', title: '186 сарын обьём ↔ хуудасны обьём', run: huvaari186 },
  { id: 'blockKeys', title: 'Барилга 0 ↔ хуудасны блок', run: blockKeys },
  { id: 'hoSync', title: '182 Cashflow ↔ 185 HO', run: hoSync },
  { id: 'ipcZoruu', title: '185 guits_zoruu · төлбөрийн холбоос', run: ipcZoruu },
  { id: 'ceo', title: 'Обьём хэтрэлт · гэрээ/төсөв · гэрээгүй ажил', run: ceoGaps },
  { id: 'land', title: 'Газар 152 ↔ 151 · төлөв', run: land },
  { id: 'crane', title: 'Кран 194 ↔ бүс 195', run: crane },
];
