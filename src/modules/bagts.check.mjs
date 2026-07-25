/**
 * БАГЦЫН дашбоардын мөр бүтээхийг шалгана — ЖИВЭЭР (live).
 *   node src/modules/bagts.check.mjs
 *
 * Хамгаалж буй хоёр алдаа:
 *   1. № (`dugaar`) нь ДАВТАГДДАГ: excel-ийн «3.10» ArcGIS-д «3.1» болж
 *      хураагдсан тул 9 давхар блокийн «Техникийн давхар цутгалт» ба 12 давхар
 *      блокийн «10-р давхар цутгалт» хоёулаа «3.11»/«3.1». №-ээр түлхүүрлэвэл
 *      мөрүүд чимээгүй нийлж, давхрууд алга болно — түлхүүр нь АЖЛЫН НЭР.
 *   2. Багцын нэр давхарга ↔ хүснэгтэд өөр («Багц 4.1» ↔ «Багц 4-1») тул SQL-д
 *      давхаргын нэрийг шууд тавьбал хоосон гарна — `bagtsKey`-ээр холбоно.
 *
 * ⚠️ Логик нь `BuildingPanel.tsx::useBagtsWorks`-ийн хуулбар — тэндээ өөрчилвөл
 * ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

const U = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_guitsetgel_consolidated/FeatureServer/0';
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');

async function q(p) {
  const out = [];
  for (let off = 0; ; ) {
    const r = await fetch(`${U}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...p, returnGeometry: 'false', f: 'json',
        resultRecordCount: '2000', resultOffset: String(off),
      }),
    });
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    const fs = (j.features || []).map((f) => f.attributes);
    out.push(...fs);
    if (!j.exceededTransferLimit || !fs.length) break;
    off += fs.length;
  }
  return out;
}

function works(feats) {
  const batches = new Map();
  for (const a of feats) {
    const k = `${String(a.barilga_blok ?? '').trim()}|${String(a.ognoo ?? '')}`;
    const arr = batches.get(k);
    if (arr) arr.push(a); else batches.set(k, [a]);
  }
  const byWork = new Map();
  let orderOf = new Map();
  for (const arr of batches.values()) {
    const seen = [];
    for (let i = 0; i < arr.length; i += 1) {
      const a = arr[i], next = arr[i + 1];
      if (next && Number(next.tuvshin) > Number(a.tuvshin)) continue; // дэд толгойтой
      const work = String(a.ajil ?? '').trim();
      if (!work) continue;
      seen.push(work);
      const e = byWork.get(work) ?? { no: String(a.dugaar ?? '').trim(), vals: new Map() };
      const p = a.guitsetgel == null ? null : Number(a.guitsetgel) * 100;
      if (p != null) {
        const b = String(a.barilga_blok ?? '').trim();
        const prev = e.vals.get(b);
        e.vals.set(b, prev == null ? p : Math.max(prev, p));
      }
      byWork.set(work, e);
    }
    if (seen.length > orderOf.size) orderOf = new Map(seen.map((w, i) => [w, i]));
  }
  return [...byWork]
    .map(([name, e]) => {
      const vs = [...e.vals.values()];
      return {
        no: e.no, name, blocks: vs.length,
        pct: vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null,
        order: orderOf.get(name) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order);
}

const names = (await q({ where: 'bagts IS NOT NULL', outFields: 'bagts', returnDistinctValues: 'true', orderByFields: 'bagts' }))
  .map((r) => String(r.bagts ?? '').trim()).filter(Boolean);
assert.ok(names.length >= 5, `хүснэгтэд багц хэт бага: ${names.length}`);

// Давхаргын «Багц 4.1» → хүснэгтийн «Багц 4-1»
assert.ok(names.find((n) => bagtsKey(n) === bagtsKey('Багц 4.1')), 'Багц 4.1 хүснэгтэд таарсангүй');

for (const name of names) {
  const feats = await q({
    where: `bagts = '${name.replace(/'/g, "''")}' AND tuvshin <= 4 AND torol='actual'`,
    outFields: 'OBJECTID,barilga_blok,ognoo,tuvshin,dugaar,ajil,guitsetgel',
    orderByFields: 'ognoo ASC, OBJECTID ASC',
  });
  const rows = works(feats);
  assert.ok(rows.length > 10, `${name}: ажлын төрөл хэт бага (${rows.length})`);

  // 1. Нэр давхардахгүй (№ давхардсан ч мөр нийлэхгүй)
  assert.equal(new Set(rows.map((r) => r.name)).size, rows.length, `${name}: ажлын нэр давхардав`);

  // 2. Давхрын мөрүүд ЭРЭМБЭЭРЭЭ (1-р → 2-р → …): дараалал эвдвэл дашбоард уншигдахгүй
  const floors = rows.map((r) => /^(\d+)-р давх/.exec(r.name)?.[1]).filter(Boolean).map(Number);
  for (let i = 1; i < floors.length; i += 1) {
    assert.ok(floors[i] > floors[i - 1], `${name}: давхрын дараалал эвдэрсэн ${floors[i - 1]} → ${floors[i]}`);
  }

  // 3. Хувь нь 0–100
  for (const r of rows) {
    assert.ok(r.pct == null || (r.pct >= 0 && r.pct <= 100), `${name}: ${r.name} = ${r.pct}`);
  }

  console.log(`${name.padEnd(10)} · ${String(rows.length).padStart(2)} ажлын төрөл · ${floors.length} давхар · нийт бүртгэсэн блок ${Math.max(...rows.map((r) => r.blocks))}`);
}
console.log('bagts.check: ok');
