/**
 * Явцын муруйн ЛОГИК ХЯЗГААР — ЖИВЭЭР (live).
 *   node src/lib/series.check.mjs
 *
 * Хамгаалж буй алдаа: барилга угсралт БУУДАГГҮЙ. Хүснэгтэд «50 → 10 → 15» гэсэн
 * бичлэг байвал (дутуу тайлан, цэвэрлэсэн нүд, бичлэгийн алдаа) муруй хиймэл
 * хонхор гаргаж, «ажил ухарсан» мэт уншигдана. `progressSeries` нь блок бүрээр
 * ӨССӨН ДҮНГ (running max) авдаг тул нэг блокийн муруй ХЭЗЭЭ Ч буурахгүй.
 *
 * ⚠️ Логик нь `blockProgress.ts`-ийн хуулбар (node TS уншихгүй) — тэндээ
 * өөрчилвөл ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

const URL_SHEET =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_guitsetgel_consolidated/FeatureServer/0';
const NO = 'Б.';

const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const key = (b, k) => `${bagtsKey(b)}|${blockKey(k)}`;

async function rows() {
  const out = [];
  for (let off = 0; ; ) {
    const res = await fetch(`${URL_SHEET}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        where: `dugaar = '${NO}' AND barilga_blok IS NOT NULL`,
        outFields: 'bagts,barilga_blok,ognoo,guitsetgel',
        returnGeometry: 'false', orderByFields: 'OBJECTID ASC',
        resultRecordCount: '2000', resultOffset: String(off), f: 'json',
      }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    const fs = (j.features || []).map((f) => f.attributes);
    out.push(...fs);
    if (!j.exceededTransferLimit || !fs.length) break;
    off += fs.length;
  }
  return out;
}

/** blockProgress.ts::history — блок → [{date, pct}] огноо ӨСӨХ дарааллаар */
function history(rs) {
  const h = new Map();
  for (const r of rs) {
    const d = String(r.ognoo ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const k = key(r.bagts, r.barilga_blok);
    const arr = h.get(k) ?? [];
    const pct = r.guitsetgel == null ? null : Number(r.guitsetgel) * 100;
    const prev = arr.find((p) => p.date === d);
    if (prev) prev.pct = pct; else arr.push({ date: d, pct });
    h.set(k, arr);
  }
  for (const arr of h.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
  return h;
}

/** blockProgress.ts::progressSeries-ийн `peak` */
const peak = (h, asOf) => {
  let v = null;
  for (const p of h) {
    if (p.date > asOf) break;
    if (p.pct != null && (v == null || p.pct > v)) v = p.pct;
  }
  return v;
};

const hist = history(await rows());
assert.ok(hist.size > 50, `блокийн түүх хэт бага: ${hist.size}`);

let dirty = 0, cleared = 0;
for (const [k, h] of hist) {
  const dates = h.map((p) => p.date);

  // 1. Түүхий бичлэгт бууралт БАЙДАГ — энэ шалгуурын шалтгаан
  let prev = null;
  for (const p of h) {
    if (p.pct == null) { cleared += 1; continue; }
    if (prev != null && p.pct < prev - 0.001) { dirty += 1; break; }
    prev = p.pct;
  }

  // 2. Муруй нь ХЭЗЭЭ Ч буурахгүй
  let last = null;
  for (const d of dates) {
    const v = peak(h, d);
    if (v == null) continue;
    assert.ok(last == null || v >= last - 0.001, `${k}: ${last} → ${v} (${d}) буурав`);
    last = v;
  }
}

// 3. НЭГТГЭСЭН муруй ч буурахгүй — хуваарь нь ТОГТМОЛ (блокийн тоо), бөглөгдөөгүй = 0%
const keys = [...hist.keys()];
const dates = [...new Set([...hist.values()].flatMap((h) => h.map((p) => p.date)))].sort();
let prevAvg = null;
const curve = [];
for (const d of dates) {
  let sum = 0;
  for (const k of keys) { const v = peak(hist.get(k), d); if (v != null) sum += v; }
  const avg = sum / keys.length;
  assert.ok(prevAvg == null || avg >= prevAvg - 0.001, `нэгтгэл ${prevAvg} → ${avg} (${d}) буурав`);
  prevAvg = avg;
  curve.push(`${d} ${avg.toFixed(1)}%`);
}

console.log(`OK · ${hist.size} блок · түүхий бууралттай ${dirty} · хоосон нүд ${cleared}`);
console.log(curve.join(' · '));
