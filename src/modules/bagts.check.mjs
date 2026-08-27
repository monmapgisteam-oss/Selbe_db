/**
 * БАГЦЫН дашбоардын мөр бүтээхийг шалгана — ЖИВЭЭР (live).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/bagts.check.mjs
 *
 * Хамгаалж буй хоёр алдаа:
 *   1. № (`dugaar`) нь ДАВТАГДДАГ: excel-ийн «3.10» ArcGIS-д «3.1» болж
 *      хураагдсан тул 9 давхар блокийн «Техникийн давхар цутгалт» ба 12 давхар
 *      блокийн «10-р давхар цутгалт» хоёулаа «3.11»/«3.1». №-ээр түлхүүрлэвэл
 *      мөрүүд чимээгүй нийлж, давхрууд алга болно — түлхүүр нь АЖЛЫН НЭР.
 *   2. Багцын нэр давхарга ↔ хуудсанд өөр («Багц 4.1» ↔ «Багц 4-1») тул
 *      шууд тааруулбал хоосон гарна — `bagtsKey`-ээр холбоно.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-27-нд СОЛИГДСОН): урьд нь `Selbe_guitsetgel_consolidated`
 * (499, хаагдсан). Одоо `sheetRows.ts` → `Bagts_*` бөглөх хуудсууд.
 *
 * ⚠️ Логик нь `BuildingPanel.tsx::useBagtsWorks`-ийн хуулбар — тэндээ өөрчилвөл
 * ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';
import { loadSheetRows, sheetBagtsNames } from './sheet/sheetRows.ts';

const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');

/** `useBagtsWorks`-ийн хуулбар: батч = (блок, агшин), гүн толгойг дараалллаас */
function works(rows) {
  const batches = new Map();
  for (const r of rows) {
    // ⚠️ Хуулбар (sheet+snap) түлхүүрт ЗААВАЛ орно — нэг өдөрт хоёр нийтлэлт бий
    const k = `${r.sheet}#${r.snap}|${r.block}`;
    const arr = batches.get(k);
    if (arr) arr.push(r); else batches.set(k, [r]);
  }
  for (const arr of batches.values()) arr.sort((a, b) => a.ord - b.ord);

  const byWork = new Map();
  let orderOf = new Map();
  for (const arr of batches.values()) {
    const seen = [];
    for (let i = 0; i < arr.length; i += 1) {
      const r = arr[i], next = arr[i + 1];
      if (next && Number(next.level) > Number(r.level)) continue; // дэд толгойтой
      const work = r.work.trim();
      if (!work) continue;
      seen.push(work);
      const e = byWork.get(work) ?? { no: r.no, vals: new Map() };
      const p = r.progress == null ? null : r.progress * 100;
      if (p != null) {
        const prev = e.vals.get(r.block);
        e.vals.set(r.block, prev == null ? p : Math.max(prev, p));
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

const names = sheetBagtsNames();
assert.ok(names.length >= 5, `бүртгэлд багц хэт бага: ${names.length}`);

// Давхаргын «Багц 4.1» → хуудсын «Багц 4-1»
assert.ok(names.find((n) => bagtsKey(n) === bagtsKey('Багц 4.1')), 'Багц 4.1 таарсангүй');

/*
 * ⚠️ БҮХ БАГЦАД ХАТУУ ШААРДЛАГА ТАВИХГҮЙ. Бөглөх хуудас нь НИЙТЛЭГДСЭН үедээ л
 * `buglusun_ognoo` авдаг; 2026-08-27-нд 10 хуудасны ердөө 2 нь нийтлэгдсэн.
 * «Багц бүрд >10 ажлын төрөл» гэж шаардвал өгөгдөл бөглөгдөх хүртэл тест
 * байнга улаан байж, ЖИНХЭНЭ эвдрэлийг далдална. Тиймээс: өгөгдөлтэй багцад
 * БҮТЦИЙГ хатуу шалгана, өгөгдөлгүйг нь ЗӨВХӨН мэдээлнэ.
 */
let withData = 0;
for (const name of names) {
  const rows = works(await loadSheetRows({ group: name, maxLevel: 4 }));
  if (!rows.length) { console.log(`${name.padEnd(10)} · нийтлэгдээгүй (бөглөсөн огноогүй)`); continue; }
  withData += 1;
  assert.ok(rows.length > 10, `${name}: ажлын төрөл хэт бага (${rows.length})`);

  // 1. Нэр давхардахгүй (№ давхардсан ч мөр нийлэхгүй)
  assert.equal(new Set(rows.map((r) => r.name)).size, rows.length, `${name}: ажлын нэр давхардав`);

  // 2. Давхрын мөрүүд ЭРЭМБЭЭРЭЭ (1-р → 2-р → …): дараалал эвдвэл дашбоард уншигдахгүй
  /* ⚠️ Бөглөх хуудсанд давхар нь «1F цутгалт» гэж бичигдэнэ — нэгтгэсэн
        хүснэгтийн «1-р давхар цутгалт» хэлбэр БИШ. Хоёуланг нь барина.
     ⚠️ Давхрын дугаар АНГИЛАЛ БҮРД дахин 1-ээс эхэлдэг (3.x цутгалт 1F…9F,
        дараа нь 4.x хана 1F…9F). Тиймээс НИЙТ жагсаалтаар өсөх шаардлага тавьж
        БОЛОХГҮЙ — ажлын нэрийн ДАГАВРААР (давхрын дараах текст) бүлэглээд
        бүлэг тус бүрд нь өсөхийг шалгана. */
  const floorGroups = new Map();
  for (const r of rows) {
    const m = /^(\d+)F\s+(.+)$/.exec(r.name) ?? /^(\d+)-р давх[^ ]* (.+)$/.exec(r.name);
    if (!m) continue;
    const g = floorGroups.get(m[2]) ?? [];
    g.push(Number(m[1]));
    floorGroups.set(m[2], g);
  }
  let floorRows = 0;
  for (const [suffix, fs] of floorGroups) {
    floorRows += fs.length;
    for (let i = 1; i < fs.length; i += 1) {
      assert.ok(fs[i] > fs[i - 1],
        `${name} / «${suffix}»: давхрын дараалал эвдэрсэн ${fs[i - 1]} → ${fs[i]}`);
    }
  }
  const floors = { length: floorRows };

  // 3. Хувь нь 0–100
  for (const r of rows) {
    assert.ok(r.pct == null || (r.pct >= 0 && r.pct <= 100), `${name}: ${r.name} = ${r.pct}`);
  }

  const maxBlocks = Math.max(0, ...rows.map((r) => r.blocks));
  console.log(`${name.padEnd(10)} · ${String(rows.length).padStart(3)} ажлын төрөл · ${floors.length} давхар · нийт бүртгэсэн блок ${maxBlocks}`);
}
assert.ok(withData > 0, 'нэг ч багц нийтлэгдээгүй — бөглөх хуудасны шугам тасарсан');
console.log(`bagts.check: ok · ${withData}/${names.length} багц нийтлэгдсэн`);
