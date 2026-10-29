/**
 * `ipcAutoWrite.ts`-ийн ЗАН ҮЙЛИЙН шалгуур — хуурамч HO_IPC хүснэгт (REST) дээр ЖИНХЭНЭ экспортыг ажиллуулна
 * (2026-10-26, аудит T2).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/ipcAutoWrite.check.mjs
 */
import assert from 'node:assert/strict';
import { fake, addTable, assertNoUnexpected } from './arcgisFake.mjs';

const { syncIpcFromFill, refreshAutoZoruu } = await import('@/lib/ipcAutoWrite.ts');
const { HO_IPC, bagtsKey } = await import('@/lib/services.ts');
const { register } = await import('@/lib/dataBus.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');

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

/* K1: гараар IPC-1 (100) → AUTO IPC-2 (50, une 120) → AUTO IPC-3 (10, une 160, зөрүү аль хэдийн 0) */
const M1 = row({ [P.id]: 'ХО-0001', [C.code]: 'K1', [P.ipcNo]: 1, [P.amount]: 100 })[OID];
const ADV = row({ [P.id]: 'ХО-0002', [C.code]: 'K1', [P.kind]: HO_IPC.kinds.advance, [P.amount]: 1000 })[OID];
const A1 = row({ [P.id]: 'AUTO|БАГЦ1|2026-09-01', [C.code]: 'K1', [P.ipcNo]: 2, [P.amount]: 50, [UNE]: 120 })[OID];
const A2 = row({ [P.id]: 'AUTO|БАГЦ1|2026-09-15', [C.code]: 'K1', [P.ipcNo]: 3, [P.amount]: 10, [UNE]: 160, [Z]: 0 })[OID];
/* `dun` хоосон — «хараахан төлөгдөөгүй»: хадгалсан 5 → null (0 БИШ) */
const A4 = row({ [P.id]: 'AUTO|БАГЦ1|2026-10-01', [C.code]: 'K1', [P.ipcNo]: 4, [P.amount]: null, [UNE]: 170, [Z]: 5 })[OID];
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
  const groups = [...new Set(PKGS.map((p) => p.group))];
  const blockless = groups.find((g) => {
    const ps = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(g));
    return ps.length > 0 && ps.every((p) => p.floors == null);
  });
  assert.ok(blockless, 'блокгүй багц PKGS-д олдсонгүй — шалгуурыг шинэчил');
  r = await syncIpcFromFill(blockless, '2026-10-01');
  assert.deepEqual(r, { ok: true, op: 'skip', why: 'no-data' }, `блокгүй багц (${blockless}) IPC-д бичих гэж оролдов`);
  assert.equal(fake.log.length, l0, 'хаалтын замууд сүлжээ рүү хандав');
  console.log(`✅ syncIpcFromFill — буруу огноо · үл мэдэгдэх багц · блокгүй (${blockless}) → сүлжээгүй`);
}

assertNoUnexpected(assert);
console.log('✅ ipcAutoWrite: зан үйлийн шалгуур давлаа');
