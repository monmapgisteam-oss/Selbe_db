/**
 * БӨГЛӨХ ХУУДАСНЫ ЖААЗУУДЫГ «ТУХАЙН ӨДРИЙН АЖИЛ» БОЛГОХ — нэг удаагийн датаны хөрвүүлэлт (2026-11-04, хэрэглэгч).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/frames-per-day.mjs [--apply] [--only=b2_9f,b2_12f] [--allow-negative]
 *
 * Хийх зүйл (обьёмын баганатай 10 хуудас):
 *   1. Жааз бүрийн `*_obyem` (одоо хуримтлал) → тэр өдрийн ажил = энэ жаазны хуримтлал − өмнөх жаазны хуримтлал (мөрийн түлхүүрээр).
 *   2. Хуучин ОЛГОСОН гүйцэтгэлийн IPC (`Guitsetgel_talbe/185`, AUTO биш, `dun`-тэй) бүрт тэр огноогоор ЗОХИОСОН жааз. Суурь =
 *      багцын АНХНЫ AUTO мөрийн өдрийн хуримтлал (анхны IPC-д орсон бөглөлт); зохиосон жаазны обьём = суурийн обьём × (IPC-ийн
 *      хуримтлагдсан `dun` ÷ суурийн ₮). Суурийн өдөр хүртэлх бодит жаазуудын өдрийн ажил (1 − сүүлийн хувь)-аар багасна — ингэснээр
 *      суурийн өдрийн хуримтлал хэвээр, өмнө олгосон мөнгө давхардахгүй.
 *   3. Нэг өдрийн давхар (хуучин) жаазны обьёмыг хоослоно — `lastFrame` тэднийг тоолдоггүй, нийлбэрт давхардахгүй.
 *   4. `Guitsetgel_talbe/185`: зохиосон өдөр бүрт «Гүйцэтгэл» AUTO мөр (хуучин IPC-тэй `ipc_dugaar`-аар холбогдоно, «Олгосон»);
 *      байгаа AUTO мөрийн `guits_une`/`guits_obyem` тухайн өдрийн дүн болно. Жаазгүй (өнчин) AUTO мөр хөндөгдөхгүй.
 * `--apply`-гүй бол юу ч бичихгүй. Буцаах боломжгүй — тайлан уншаад л apply хийнэ.
 */
import { readFileSync } from 'node:fs';
import { PKGS, resolveSchema } from '@/modules/sheet/bagts.pkg';
import { lastFrame, frameRowKeys, msToDay } from '@/modules/sheet/bagtsSheet';
import { TREES } from '@/modules/sheet/bagts.trees';
import { HO_IPC, pkgKeyOf, bagtsKey } from '@/lib/services';

const APPLY = process.argv.includes('--apply');
const ALLOW_NEG = process.argv.includes('--allow-negative');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);

const env = readFileSync('E:/Selbe_db/.env.development.local', 'utf8');
const tok = (env.match(/^AGOL_SELBE_PUBLIC_KEY\s*=\s*(.+)$/m) || [])[1].trim();
const post = async (u, p) => {
  const j = await (await fetch(u, { method: 'POST', body: new URLSearchParams({ f: 'json', token: tok, ...p }) })).json();
  if (j.error) throw new Error(`${u}: ${j.error.code} ${j.error.message}`);
  return j;
};
const fetchAll = async (url, where, outFields) => {
  const out = [];
  for (let off = 0; ; ) {
    const j = await post(`${url}/query`, { where, outFields, returnGeometry: 'false', orderByFields: 'objectid ASC', resultOffset: String(off), resultRecordCount: '2000' });
    out.push(...(j.features ?? []));
    if (!j.exceededTransferLimit || !j.features?.length) break;
    off += j.features.length;
  }
  return out;
};
const write = async (url, key, items) => {
  let ok = 0;
  for (let i = 0; i < items.length; i += 500) {
    const part = items.slice(i, i + 500).map((attributes) => ({ attributes }));
    const j = await post(`${url}/applyEdits`, { [key]: JSON.stringify(part), rollbackOnFailure: 'true' });
    const res = j[key === 'adds' ? 'addResults' : 'updateResults'] ?? [];
    const bad = res.find((x) => !x.success);
    if (bad || res.length !== part.length) throw new Error(`${url} ${key}: ${bad?.error?.description ?? 'дутуу үр дүн'} (${i}/${items.length})`);
    ok += res.length;
  }
  return ok;
};
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const SYS = /^(objectid|globalid|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)$/i;

/* ── 1. Хуучин олгосон гүйцэтгэлийн IPC, багцаар ── */
const ho = (await fetchAll(HO_IPC.url, '1=1', '*')).map((f) => f.attributes);
const oldByPkg = new Map(); // bagtsKey → [{ day, cum, dun, ipcNo, code, bagts, workType }]
for (const r of ho) {
  if (String(r.murun_id ?? '').startsWith('AUTO|') || r.tulult_turul !== 'Гүйцэтгэл' || !(Number(r.dun) > 0) || !r.guilgee_ognoo) continue;
  const k = bagtsKey(r.bagts);
  const list = oldByPkg.get(k) ?? [];
  list.push({ day: String(r.guilgee_ognoo).slice(0, 10), dun: Number(r.dun), ipcNo: r.ipc_dugaar, code: r.geree_kod, bagts: r.bagts, workType: r.ajliin_turul });
  oldByPkg.set(k, list);
}
for (const list of oldByPkg.values()) { list.sort((a, b) => a.day.localeCompare(b.day)); let c = 0; for (const x of list) { c += x.dun; x.cum = c; } }
const autoRows = ho.filter((r) => String(r.murun_id ?? '').startsWith('AUTO|'));
const autoDay = (r) => String(r.murun_id).split('|')[2] ?? '';

/* ── 2. Хуудас бүрийн жаазуудыг уншина ── */
const sheets = [];
for (const p of PKGS) {
  if (ONLY.length && !ONLY.includes(p.key)) continue;
  let sc;
  try { const meta = await post(p.url, {}); sc = resolveSchema(meta.fields ?? [], p.floors == null ? { synthetic: true } : {}); } catch (e) { console.log(`${p.key}: бүдүүвч уншигдсангүй — ${String(e).slice(0, 80)}`); continue; }
  const ob = sc.obyem.filter(Boolean);
  if (!ob.length || !sc.f.fillDate) continue;
  const fd = sc.f.fillDate;
  const feats = await fetchAll(p.url, `${fd} IS NOT NULL`, '*');
  const byDay = new Map();
  for (const f of feats) { const d = msToDay(num(f.attributes[fd])); if (!d) continue; (byDay.get(d) ?? byDay.set(d, []).get(d)).push(f); }
  const expect = (TREES[p.key] ?? '').length;
  const frames = [];
  for (const d of [...byDay.keys()].sort()) {
    const all = byDay.get(d);
    const chosen = lastFrame(all, sc.f.no, expect, sc.f.work);
    const chosenSet = new Set(chosen);
    const keys = frameRowKeys(chosen, sc);
    const cum = new Map();
    chosen.forEach((f, i) => cum.set(keys[i], ob.map((c) => num(f.attributes[c]))));
    frames.push({ day: d, feats: chosen, keys, cum, dup: all.filter((f) => !chosenSet.has(f)) });
  }
  sheets.push({ p, sc, ob, fd, frames });
}

/* Жаазны ₮ ба обьёмын нийлбэр */
const frameSums = (s, fr) => fr.feats.reduce((acc, f) => {
  const a = f.attributes; const unit = num(a[s.sc.f.unit]);
  const oby = s.ob.reduce((x, c) => x + (num(a[c]) ?? 0), 0);
  return { une: acc.une + (unit == null ? 0 : oby * unit), obyem: acc.obyem + oby };
}, { une: 0, obyem: 0 });
const frameAt = (s, day) => [...s.frames].filter((f) => f.day <= day).pop() ?? null;

/* ── 3. Тооцоо ── */
const plans = []; const autoAdds = []; const autoUpd = []; const report = [];
const byGroup = new Map();
for (const s of sheets) { const g = bagtsKey(s.p.group); (byGroup.get(g) ?? byGroup.set(g, []).get(g)).push(s); }

for (const [g, group] of byGroup) {
  const old = oldByPkg.get(g) ?? [];
  const mine = autoRows.filter((r) => bagtsKey(r.bagts) === g).sort((a, b) => autoDay(a).localeCompare(autoDay(b)));
  const cumAt = (day) => group.reduce((acc, s) => { const fr = frameAt(s, day); if (!fr) return acc; const x = frameSums(s, fr); return { une: acc.une + x.une, obyem: acc.obyem + x.obyem }; }, { une: 0, obyem: 0 });
  /* Суурийн өдөр — анхны AUTO мөрийн өдөр (жаазтай), эс бөгөөс ₮-тэй анхны жааз */
  let baseDay = mine.map(autoDay).find((d) => group.some((s) => frameAt(s, d)) && cumAt(d).une > 0) ?? null;
  if (!baseDay) baseDay = [...new Set(group.flatMap((s) => s.frames.map((f) => f.day)))].sort().find((d) => cumAt(d).une > 0) ?? null;
  const U = baseDay ? cumAt(baseDay).une : 0;
  const fOf = old.map((o) => (U > 0 ? o.cum / U : NaN));
  const fLast = fOf.length ? fOf[fOf.length - 1] : 0;
  const neg = fLast > 1;
  const doFab = old.length > 0 && U > 0 && (!neg || ALLOW_NEG);
  const keep = doFab ? 1 - fLast : 1;
  report.push(`\n### ${group.map((s) => s.p.key).join(' + ')} (${group[0].p.group}) — суурь ${baseDay ?? '-'} ₮ ${fmt(U)} · хуучин IPC ${old.length} (${fmt(old[old.length - 1]?.cum ?? 0)}) · хувь ${fOf.map((f) => `${(f * 100).toFixed(2)}%`).join(' → ') || '-'}${neg ? ' ⚠ олгосон > суурийн гүйцэтгэл — зохиохгүй, хэвээр' : ''}`);

  const fabByDay = new Map(); // day → { obyem, une }
  for (const s of group) {
    const { p, sc, ob, fd, frames } = s;
    if (!frames.length) { report.push(`- ${p.key}: жаазгүй`); continue; }
    const updates = []; const adds = [];
    const base = doFab && baseDay ? frameAt(s, baseDay) : null;
    /* Зохиосон жаазууд — суурийн мөрүүдээс */
    if (base) {
      const timeOfDay = (num(base.feats[0].attributes[fd]) ?? 0) % 86_400_000;
      old.forEach((o, j) => {
        const share = fOf[j] - (j ? fOf[j - 1] : 0);
        let sumOb = 0, sumUne = 0;
        base.feats.forEach((f, i) => {
          const a = { ...f.attributes };
          for (const k of Object.keys(a)) if (SYS.test(k)) delete a[k];
          a[fd] = Date.parse(`${o.day}T00:00:00Z`) + timeOfDay;
          const vol = num(a[sc.f.vol]); const unit = num(a[sc.f.unit]);
          const cb = base.cum.get(base.keys[i]);
          let osum = null;
          ob.forEach((c, b) => {
            const c1 = cb[b];
            const v = c1 == null ? null : r6(c1 * share);
            a[c] = v;
            if (v != null) { osum = (osum ?? 0) + v; sumOb += v; if (unit != null) sumUne += v * unit; }
            const actCol = sc.act[b];
            if (actCol) {
              const a1 = num(f.attributes[actCol]);
              a[actCol] = c1 != null && vol != null && vol > 0 ? r6((c1 * fOf[j]) / vol) : a1 == null ? null : r6(a1 * fOf[j]);
            }
          });
          if (sc.f.obyemSum) a[sc.f.obyemSum] = osum == null ? null : r6(osum);
          adds.push(a);
        });
        const agg = fabByDay.get(o.day) ?? { obyem: 0, une: 0 };
        agg.obyem += sumOb; agg.une += sumUne; fabByDay.set(o.day, agg);
      });
    }
    /* Байгаа жаазууд → өдрийн ажил; суурийн өдөр хүртэлх жааз (1 − хувь)-аар */
    let changed = 0, negCells = 0;
    frames.forEach((fr, k) => {
      const prev = k ? frames[k - 1].cum : null;
      const scale = base && fr.day <= baseDay ? keep : 1;
      fr.feats.forEach((f, i) => {
        const a = f.attributes; const key = fr.keys[i];
        const cur = fr.cum.get(key); const pv = prev ? prev.get(key) : null;
        const u = { objectid: a.objectid };
        let osum = null, diff = false;
        ob.forEach((c, b) => {
          const cv = cur[b];
          let v;
          if (cv == null) v = pv?.[b] == null ? null : r6(-pv[b] * scale);
          else v = r6((cv - (pv?.[b] ?? 0)) * scale);
          if (v != null) osum = (osum ?? 0) + v;
          if (v != null && v < -1e-9) negCells += 1;
          if ((num(a[c]) ?? null) !== v) { u[c] = v; diff = true; }
        });
        if (sc.f.obyemSum) { const os = osum == null ? null : r6(osum); if ((num(a[sc.f.obyemSum]) ?? null) !== os) { u[sc.f.obyemSum] = os; diff = true; } }
        if (diff) { updates.push(u); changed += 1; }
      });
      for (const f of fr.dup) {
        const a = f.attributes; const u = { objectid: a.objectid }; let diff = false;
        for (const c of [...ob, ...(sc.f.obyemSum ? [sc.f.obyemSum] : [])]) if (a[c] != null) { u[c] = null; diff = true; }
        if (diff) updates.push(u);
      }
    });
    report.push(`- ${p.key}: жааз ${frames.length} (${frames.map((f) => `${f.day}${f.dup.length ? '+давхар' : ''}`).join(', ')}) · суурь жааз ${base ? base.day : '-'} · өөрчлөх мөр ${changed} · зохиосон мөр ${adds.length} · сөрөг нүд ${negCells}`);
    plans.push({ s, updates, adds });
  }
  /* 185: зохиосон өдрийн AUTO мөр */
  if (doFab && fabByDay.size) {
    const head = old[0];
    for (const o of old) {
      const agg = fabByDay.get(o.day) ?? { obyem: 0, une: 0 };
      const id = `AUTO|${pkgKeyOf(head.bagts)}|${o.day}`;
      if (autoRows.some((r) => r.murun_id === id)) { report.push(`- 185: ${id} аль хэдийн бий — алгасав`); continue; }
      autoAdds.push({
        murun_id: id, geree_kod: head.code, bagts: head.bagts, ajliin_turul: head.workType, tulult_turul: 'Гүйцэтгэл',
        guilgee_ognoo: o.day, on_: Number(o.day.slice(0, 4)), guits_obyem: r6(agg.obyem), guits_une: Math.round(o.dun), guits_zoruu: 0,
        ipc_dugaar: o.ipcNo, ipc_tuluv: 'Олгосон', dun: null,
      });
      report.push(`- 185 + ${id}: guits_une ${fmt(o.dun)} (IPC ${o.ipcNo ?? '-'}), ₮ тооцоо ${fmt(agg.une)}`);
    }
  }
  /* 185: байгаа AUTO мөр — тухайн өдрийн дүн */
  let prevUne = 0, prevOb = 0;
  for (const r of mine) {
    const day = autoDay(r);
    if (!day || !group.some((s) => frameAt(s, day))) { report.push(`- 185 ${r.murun_id}: жаазгүй (өнчин) — хөндөхгүй`); continue; }
    const c = cumAt(day);
    const sc = doFab && day <= baseDay ? keep : 1;
    const une = Math.round((c.une - prevUne) * sc); const oby = r6((c.obyem - prevOb) * sc);
    prevUne = c.une; prevOb = c.obyem;
    const u = { objectid: r.objectid };
    if (Math.abs((num(r.guits_une) ?? -1) - une) >= 1) u.guits_une = une;
    if (Math.abs((num(r.guits_obyem) ?? -1) - oby) >= 1e-6) u.guits_obyem = oby;
    if (Object.keys(u).length > 1) autoUpd.push(u);
    report.push(`- 185 ${r.murun_id}: guits_une ${fmt(num(r.guits_une) ?? 0)} → ${fmt(une)}`);
  }
}

console.log(report.join('\n'));
console.log(`\nНИЙТ: хуудасны мөр шинэчлэх ${plans.reduce((a, x) => a + x.updates.length, 0)} · зохиосон мөр нэмэх ${plans.reduce((a, x) => a + x.adds.length, 0)} · 185 нэмэх ${autoAdds.length} · 185 шинэчлэх ${autoUpd.length}`);
if (!APPLY) { console.log('\n--apply өгөөгүй: юу ч бичээгүй.'); process.exit(0); }

/* ── 4. Бичилт ── */
for (const { s, adds } of plans) if (adds.length) console.log(`${s.p.key}: зохиосон ${await write(s.p.url, 'adds', adds)} мөр нэмэв`);
for (const { s, updates } of plans) if (updates.length) console.log(`${s.p.key}: ${await write(s.p.url, 'updates', updates)} мөр шинэчлэв`);
if (autoAdds.length) console.log(`185: ${await write(HO_IPC.url, 'adds', autoAdds)} AUTO мөр нэмэв`);
if (autoUpd.length) console.log(`185: ${await write(HO_IPC.url, 'updates', autoUpd)} AUTO мөр шинэчлэв`);

/* ── 5. Тулгалт: жаазуудын нийлбэр = хуучин сүүлийн хуримтлал ── */
for (const { s } of plans) {
  const { p, sc, ob, fd, frames } = s;
  const feats = await fetchAll(p.url, `${fd} IS NOT NULL`, [sc.f.oid, sc.f.no, sc.f.work, fd, ...ob].join(','));
  const byDay = new Map();
  for (const f of feats) { const d = msToDay(num(f.attributes[fd])); if (d) (byDay.get(d) ?? byDay.set(d, []).get(d)).push(f); }
  const expect = (TREES[p.key] ?? '').length;
  const acc = new Map(); let worst = 0;
  for (const d of [...byDay.keys()].sort()) {
    const fr = lastFrame(byDay.get(d), sc.f.no, expect, sc.f.work); const keys = frameRowKeys(fr, sc);
    fr.forEach((f, i) => { const a = acc.get(keys[i]) ?? ob.map(() => 0); ob.forEach((c, b) => { a[b] += num(f.attributes[c]) ?? 0; }); acc.set(keys[i], a); });
  }
  const last = frames[frames.length - 1];
  for (const [k, v] of last.cum) { const a = acc.get(k) ?? ob.map(() => 0); v.forEach((x, b) => { worst = Math.max(worst, Math.abs((x ?? 0) - a[b])); }); }
  console.log(`${p.key}: тулгалт — архивын нийлбэр ба хуучин хуримтлалын хамгийн их зөрүү ${worst}`);
}
