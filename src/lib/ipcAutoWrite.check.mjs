/**
 * `ipcAutoWrite.ts`-ийн ЗАН ҮЙЛИЙН шалгуур — хуурамч HO_IPC хүснэгт (REST) дээр ЖИНХЭНЭ экспортыг ажиллуулна
 * (2026-10-26, аудит T2).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/ipcAutoWrite.check.mjs
 */
import assert from 'node:assert/strict';
import { fake, addTable, assertNoUnexpected } from './arcgisFake.mjs';

const { syncIpcFromFill, refreshAutoZoruu } = await import('@/lib/ipcAutoWrite.ts');
const { HO_IPC } = await import('@/lib/services.ts');
const { register } = await import('@/lib/dataBus.ts');

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const OID = HO_IPC.oid;
const Z = 'guits_zoruu';
const UNE = 'guits_une';
const WORK = HO_IPC.kinds.work;

let drops = 0;
register(() => { drops += 1; }, ['HO_IPC']);

const T = addTable(HO_IPC.url, { oid: OID });
const row = (o) => T.insert({ [P.kind]: WORK, [P.payDate]: null, [Z]: null, [UNE]: null, ...o });
const get = (id) => T.byOid(id);
const edits = () => fake.log.filter((x) => x.via === 'rest' && x.op === 'applyEdits');

/* K1: гараар IPC-1 (100) → AUTO IPC-2 (50, une 120) → AUTO IPC-3 (10, une 40 → хуримтлал 160, зөрүү аль хэдийн 0).
   2026-11-04: AUTO мөрийн `guits_une` тухайн өдрийн ажил — зөрүү = олгосон хуримтлал − гүйцэтгэлийн хуримтлал */
const M1 = row({ [P.id]: 'ХО-0001', [C.code]: 'K1', [P.ipcNo]: 1, [P.amount]: 100 })[OID];
const ADV = row({ [P.id]: 'ХО-0002', [C.code]: 'K1', [P.kind]: HO_IPC.kinds.advance, [P.amount]: 1000 })[OID];
const A1 = row({ [P.id]: 'AUTO|БАГЦ1|2026-09-01', [C.code]: 'K1', [P.ipcNo]: 2, [P.amount]: 50, [UNE]: 120 })[OID];
const A2 = row({ [P.id]: 'AUTO|БАГЦ1|2026-09-15', [C.code]: 'K1', [P.ipcNo]: 3, [P.amount]: 10, [UNE]: 40, [Z]: 0 })[OID];
/* `dun` хоосон — «хараахан төлөгдөөгүй»: хадгалсан 5 → null (0 БИШ) */
const A4 = row({ [P.id]: 'AUTO|БАГЦ1|2026-10-01', [C.code]: 'K1', [P.ipcNo]: 4, [P.amount]: null, [UNE]: 10, [Z]: 5 })[OID];
/* Гараар оруулсан мөрийн буруу зөрүүг ХӨНДӨХГҮЙ */
const M2 = row({ [P.id]: 'ХО-0003', [C.code]: 'K1', [P.ipcNo]: 5, [P.amount]: 1, [Z]: 999 })[OID];
/* K2 */
const B1 = row({ [P.id]: 'AUTO|БАГЦ2|2026-09-01', [C.code]: 'K2', [P.ipcNo]: 1, [P.amount]: 70, [UNE]: 50 })[OID];

/* ── 1. Хоосон код — юу ч хийхгүй ── */
{
  assert.deepEqual(await refreshAutoZoruu(''), { ok: true, n: 0 });
  assert.deepEqual(await refreshAutoZoruu('   '), { ok: true, n: 0 });
  assert.equal(fake.log.length, 0, 'хоосон кодоор сүлжээ рүү хандав');
  console.log('✅ refreshAutoZoruu(\'\') — сүлжээгүй, n=0');
}

/* ── 2. Нэг гэрээ — зөвхөн AUTO, зөвхөн өөрчлөгдсөн, хуримтлалаар ── */
{
  const d0 = drops;
  const r = await refreshAutoZoruu('K1');
  assert.deepEqual(r, { ok: true, n: 2 });
  assert.equal(get(A1)[Z], 30, 'A1: (100 + 50) − 120 = 30 (урьдчилгаа ОРОХГҮЙ)');
  assert.equal(get(A4)[Z], null, 'A4: dun хоосон → null (0 БИШ)');
  assert.equal(get(A2)[Z], 0);
  assert.equal(get(M2)[Z], 999, 'гараар оруулсан мөр хөндөгдөв');
  assert.equal(get(B1)[Z], null, 'өөр гэрээний мөр хөндөгдөв');
  assert.equal(get(M1)[Z], null);
  assert.equal(get(ADV)[Z], null);
  const e = edits();
  assert.equal(e.length, 1, 'нэг applyEdits');
  const sent = JSON.parse(e[0].params.updates).map((f) => f.attributes);
  assert.deepEqual(sent.map((a) => Object.keys(a).sort()), [[OID, Z].sort(), [OID, Z].sort()], 'зөвхөн OID + зөрүү бичигдэх ёстой');
  assert.deepEqual(sent.map((a) => a[OID]).sort((x, y) => x - y), [A1, A4].sort((x, y) => x - y), 'A2 (өөрчлөгдөөгүй) дахин бичигдэв');
  assert.equal(e[0].params.rollbackOnFailure, 'true');
  assert.ok(drops > d0, 'бичсэний дараа HO_IPC кэш хүчингүй болоогүй');
  console.log('✅ K1 — A1=30, A4=null; гар мөр · K2 · өөрчлөгдөөгүй мөр хөндөгдөхгүй; кэш хүчингүй');
}

/* ── 3. Бүх гэрээ (`undefined`) ба давтан дуудлага ── */
{
  assert.deepEqual(await refreshAutoZoruu(), { ok: true, n: 1 });
  assert.equal(get(B1)[Z], 20, 'B1: 70 − 50 = 20');
  const n0 = edits().length;
  const d0 = drops;
  assert.deepEqual(await refreshAutoZoruu(), { ok: true, n: 0 });
  assert.equal(edits().length, n0, 'өөрчлөлтгүй үед applyEdits явав');
  assert.equal(drops, d0, 'бичээгүй атлаа кэш хүчингүй болгов');
  console.log('✅ бүх гэрээ — B1=20; давтахад бичилтгүй, кэш хэвээр');
}

/* ── 4. Хуудаслалт — бүх хуудсыг уншина ── */
{
  T.maxRecordCount = 2;
  const q0 = fake.count('rest', 'query');
  get(B1)[Z] = 1; // хуучирсан утга — СҮҮЛИЙН хуудсанд
  assert.deepEqual(await refreshAutoZoruu('K2'), { ok: true, n: 1 });
  assert.equal(get(B1)[Z], 20, 'сүүлийн хуудасны мөр шинэчлэгдсэнгүй (хуудаслалт тасарсан)');
  assert.equal(fake.count('rest', 'query') - q0, Math.ceil(T.rows.length / 2), 'бүх хуудас уншигдсангүй');
  T.maxRecordCount = 2000;
  console.log('✅ хуудаслалт — exceededTransferLimit-ийг дагаж бүх мөр');
}

/* ── 5. 500 мөрийн багц ── */
{
  for (let i = 0; i < 501; i += 1) row({ [P.id]: `AUTO|БАГЦ3|d${i}`, [C.code]: 'K3', [P.ipcNo]: i + 1, [P.amount]: 1, [UNE]: 0 });
  const n0 = edits().length;
  const r = await refreshAutoZoruu('K3');
  assert.deepEqual(r, { ok: true, n: 501 });
  const sent = edits().slice(n0).map((x) => JSON.parse(x.params.updates).length);
  assert.deepEqual(sent, [500, 1], '500 мөрийн багцаар хуваагдаагүй');
  console.log('✅ 501 мөр — 500 + 1 багц');
}

/* ── 6. Мөрийн алдаа (200 + success:false) — ok:false, кэш ҮРГЭЛЖ хүчингүй ── */
{
  get(A1)[Z] = 7;
  T.failWrites = true;
  const d0 = drops;
  const r = await refreshAutoZoruu('K1');
  T.failWrites = false;
  assert.equal(r.ok, false, 'татгалзсан бичилтийг амжилт гэж тоолов');
  assert.match(r.error, /татгалзав/);
  assert.equal(get(A1)[Z], 7);
  assert.ok(drops > d0, 'бичих оролдлогын дараа (амжилтгүй ч) кэш хүчингүй болох ёстой');
  console.log('✅ мөрийн алдаа — ok:false, кэш хүчингүй');
}

/* ── 7. Уншилт 200 + {error} — бичихгүй, кэш хөндөхгүй ── */
{
  T.failReads = true;
  const n0 = edits().length;
  const d0 = drops;
  const r = await refreshAutoZoruu('K1');
  T.failReads = false;
  assert.equal(r.ok, false, '200-аар ирсэн ArcGIS алдааг амжилт гэж үзэв');
  assert.equal(edits().length, n0);
  assert.equal(drops, d0, 'бичээгүй атлаа кэш хүчингүй болгов');
  console.log('✅ уншилтын алдаа — ok:false, бичилтгүй');
}

/* ── 8. `syncIpcFromFill` — сүлжээгүй хаалтууд ── */
{
  const l0 = fake.log.length;
  let r = await syncIpcFromFill('Багц 1', 'огноо биш');
  assert.equal(r.ok, false);
  assert.match(r.error, /Огноо танигдсангүй/);
  r = await syncIpcFromFill('Багц 999', '2026-10-01');
  assert.equal(r.ok, false);
  assert.match(r.error, /Багц олдсонгүй/);
  assert.equal(fake.log.length, l0, 'хаалтын замууд сүлжээ рүү хандав');
  console.log('✅ syncIpcFromFill — буруу огноо · үл мэдэгдэх багц → сүлжээгүй');
}

/* ── 9. ХОЁР ХУУДАСТАЙ БАГЦ · ӨӨР ӨДӨР (2026-11-04) — нөгөө хуудасны ӨМНӨХ өдрийн жааз дахин тоологдохгүй ──
 * Амьд: AUTO|БАГЦ1|2026-09-03 зөв 58,402,563 ₮ атал хуучин зам 8,771,170,049 (= 9F@09-03 + 12F@07-08) өгдөг байв. */
{
  const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
  const { GUITS } = await import('@/lib/services/env.ts');
  const D = (s) => Date.parse(`${s}T12:00:00Z`);
  const mk = (n, blk) => {
    const url = `${GUITS}/9${n}`;
    const ob = `F${blk}_obyem`;
    const T2 = addTable(url, { oid: 'objectid', fields: ['objectid', 'F_', 'ажил', 'gun', 'обьём', 'нэгж_өртөг', 'buglusun_ognoo', `F${blk}_гүйцэтгэл`, `F${blk}_төлөвлөгөөт`, ob] });
    PKGS.push({ key: `tst_${n}`, group: 'Багц Т', floors: 9, name: `Багц Т · ${n}`, label: `Багц Т · ${n}`, url });
    /** жааз: 2 мөр — тэр ӨДРИЙН ажил (`*_obyem`) */
    const frame = (day, v1, v2) => {
      T2.insert({ F_: '1', 'ажил': 'Шороо', gun: 0, 'обьём': 100, 'нэгж_өртөг': 10, buglusun_ognoo: D(day), [ob]: v1 });
      T2.insert({ F_: '2', 'ажил': 'Бетон', gun: 0, 'обьём': 50, 'нэгж_өртөг': 20, buglusun_ognoo: D(day), [ob]: v2 });
    };
    return { T2, frame };
  };
  const A = mk('a', '5_1');
  const B = mk('b', '6_1');
  A.frame('2026-07-08', 100, null);   // 1 000 ₮
  A.frame('2026-09-03', 5, 1);        // 50 + 20 = 70 ₮ — ЭНЭ өдрийн дүн
  B.frame('2026-07-08', 200, null);   // 4 000 ₮ — өмнөх өдөр, 09-03-нд ОРОХГҮЙ
  row({ [P.id]: 'ХО-0100', [C.pkg]: 'Багц Т', [C.code]: 'KT', [C.workType]: 'Барилга угсралт', [P.ipcNo]: 1, [P.amount]: 100 });
  const r = await syncIpcFromFill('Багц Т', '2026-09-03');
  assert.equal(r.ok, true, `бичигдэх ёстой: ${r.error ?? ''}`);
  assert.equal(r.op, 'insert');
  assert.equal(r.warn, undefined, 'нөгөө хуудас тэр өдөр жаазгүй — анхааруулгагүй (хэвийн)');
  const a = T.rows.find((x) => x[P.id] === 'AUTO|БАГЦТ|2026-09-03');
  assert.ok(a, 'AUTO мөр үүссэн');
  assert.equal(a[UNE], 70, '⚠️ зөвхөн тэр өдрийн жааз: 5×10 + 1×20 = 70 (4 070 БИШ — 12F-ийн 07-08 дахин тоологдохгүй)');
  assert.equal(a['guits_obyem'], 6);
  assert.equal(a[C.code], 'KT');
  /* Хоёр хуудас хоёулаа тэр өдөр жаазгүй — батлагдсан хуудас жаазтай байх ёстой тул ok:false (хуучин зам 07-08-ыг бичих байсан) */
  const none = await syncIpcFromFill('Багц Т', '2026-09-04');
  assert.equal(none.ok, false);
  assert.match(none.error, /жаазгүй/);
  assert.ok(!T.rows.some((x) => x[P.id] === 'AUTO|БАГЦТ|2026-09-04'), 'мөр үүсээгүй');
  /* Нөгөө хуудас ОГТ нийтлэгдээгүй — хэвээр: 0 оролцоо + анхааруулга */
  B.T2.rows.length = 0;
  A.frame('2026-09-05', 2, null);
  const unpub = await syncIpcFromFill('Багц Т', '2026-09-05');
  assert.equal(unpub.ok, true);
  assert.ok(unpub.warn && unpub.warn.includes('огт илгээгдээгүй'), 'нийтлэгдээгүй хуудасны анхааруулга хэвээр');
  assert.equal(T.rows.find((x) => x[P.id] === 'AUTO|БАГЦТ|2026-09-05')[UNE], 20);
  console.log('✅ 2 хуудас · өөр өдөр — нөгөө хуудасны өмнөх жааз дахин тоологдохгүй (70, 4 070 биш)');
}

assertNoUnexpected(assert);
console.log('✅ ipcAutoWrite: зан үйлийн шалгуур давлаа');
