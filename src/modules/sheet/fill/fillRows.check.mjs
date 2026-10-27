/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ИЙН НООРОГ — 191-ИЙН МӨРИЙН ГОРИМ (`fillStore`, 2026-10-26) ШАЛГУУР. Сүлжээгүй — хуурамч Enterprise
 * (`draftRows.fake.mjs`), hook-ийн ЯГ нийлүүлэгч (`mergeDrafts` · `parseDraft`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/modules/sheet/fill/fillRows.check.mjs
 *
 *   1. Нэмэлт · сөрөг · хувь · '%0' · огноо ('' = цэвэрлэсэн) — эх хуудасны баганаар эргэлт, null ≠ 0.
 *   2. `expectAt` (CAS) мөрийн горимд — завсарт хамтрагч бичсэн бол ЮУ Ч бичихгүй (`conflict`), дахин уншаад хоёулаа.
 *   3. Хамтран бөглөгч — нэг мөрийн өөр бүлэг (обьём ↔ огноо) зэрэг · tombstone · илгээлтийн баримт (`rcpt`) · оролцогч
 *      («дуусгасан», буцаагдсан илгээлтийн зорилт `tgt`).
 *   4. Хуучин JSON ноорогийг анхны нээлтээр шилжүүлнэ (JSON ХӨНДӨГДӨХГҮЙ), хуучин табын дараагийн бичилт шингэнэ.
 *   5. Багана алга/хагас → JSON горим (`REMOTE_MAX`), сүлжээ → хүлээх (юу ч бичихгүй).
 */
import assert from 'node:assert/strict';
import { makeFake } from '../../../lib/draftRows.fake.mjs';
import { perfDkey } from '../../../lib/draftRows.ts';
import { rowsTestHooks, resetRowsCache, setFillFrame } from '../../../lib/draftRowsRemote.ts';
import * as st from '../../../lib/fillStore.ts';
import { mergeDrafts, parseDraft, unpackRcpt, packRcpt } from './draft.ts';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const URL = 'https://fake/ent/Guitsetgel_talbe/FeatureServer/191';
const PKG = 'b1_12f';
const NOW = Date.now();
const D = 86_400_000;
const FR = [
  { oid: 101, no: '1', work: 'Ухалт', des: 11, depth: 1, group: false },
  { oid: 102, no: '2', work: 'Дүүргэлт', des: 12, depth: 1, group: false },
  { oid: 103, no: '3', work: 'Бетон', des: 13, depth: 1, group: false },
];
const fresh = (opt) => {
  const f = makeFake(URL, opt);
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'a', reset: true, imgs: new Map() });
  setFillFrame(PKG, FR, ['5/1', '5/2']);
  return f;
};
const as = (imgs, me) => rowsTestHooks({ imgs, me });
const draft = (o) => ({ t: NOW, mode: 'inc', cells: [], dates: [], rowKeys: [], ...o });
const read = async () => {
  const r = await st.readRemoteDraft(PKG);
  assert.ok(r.ok, `уншилт: ${r.error ?? ''}`);
  return r.draft ? parseDraft(r.draft.payload, 'remote') : null;
};
const cellsOf = (d) => Object.fromEntries((d?.cells ?? []).map(([k, v]) => [k, v]));
const datesOf = (d) => Object.fromEntries((d?.dates ?? []).map(([k, v]) => [k, v]));

/* ══════════ 1. Нэмэлт · сөрөг · хувь · огноо ══════════ */
{
  const f = fresh();
  const cells = [['101:0', '15 %10'], ['101:1', '-3'], ['102:0', '%-5'], ['102:1', '%0'], ['103:0', '0'], ['103:1', '2.25']];
  const dates = [['101:0:s', '2026-10-01'], ['101:0:e', ''], ['102:0:e', '2026-11-30']];
  const byAt = [...cells, ...dates].map(([k], i) => [k, NOW + i]);
  const by = [...cells, ...dates].map(([k]) => [k, 'a']);
  const r = await st.saveRemoteDraft(PKG, NOW, JSON.stringify(draft({ cells, dates, byAt, by })), { expectAt: null });
  ok(r.ok, `бичнэ: ${r.error ?? ''}`);
  const rows = f.all().filter((a) => a.dkey === perfDkey(PKG) && a.mur_turul === 'ajil');
  const w = (k) => rows.find((a) => a.mur_key === k);
  ok(w('w:d11:0').obyem_sum === 15 && w('w:d11:0')['бодит_гүйцэтгэл'] === 0.1, '«15 %10» → obyem_sum 15, бодит_гүйцэтгэл 0.1 (0–1)');
  ok(w('w:d11:1').obyem_sum === -3, 'сөрөг нэмэлт хадгалагдана');
  ok(w('w:d12:1')['бодит_гүйцэтгэл'] === 0 && w('w:d12:1').obyem_sum == null, "'%0' → хувь 0 (null ≠ 0)");
  ok(w('w:d13:0').obyem_sum === 0 && w('w:d13:0')['бодит_гүйцэтгэл'] == null, "'0' → обьём 0");
  ok(w('w:d11:0')['төлөвлөгөөт_хуваарь__эхлэх'] === Date.UTC(2026, 9, 1), 'огноо UTC шөнө дунд');
  ok(w('w:d11:0')['төлөвлөгөөт_хуваарь__дуусах'] == null && String(w('w:d11:0').hoosolson).includes('төлөвлөгөөт_хуваарь__дуусах'), "'' огноо → жагсаалтад (ил хоосолсон)");
  ok(w('w:d11:0').des_dugaar === 11 && w('w:d11:0').f_ === '1' && w('w:d11:0')['ажил'] === 'Ухалт' && w('w:d11:0').blok === '5/1', 'эх хуудасны танихуун');
  ok(!rows.some((a) => typeof a.payload === 'string' && a.payload.length), 'нүдний мөрд JSON алга');
  const back = await read();
  eq(cellsOf(back), Object.fromEntries(cells), 'нүд ЯГ буцна');
  eq(datesOf(back), Object.fromEntries(dates), 'огноо ЯГ буцна');
  console.log('✅ 1. Нэмэлт · сөрөг · хувь · огноо — эх хуудасны баганаар');
}

/* ══════════ 2. CAS (`expectAt`) мөрийн горимд ══════════ */
{
  const f = fresh();
  const A = new Map(); const B = new Map();
  as(A, 'a');
  ok((await st.saveRemoteDraft(PKG, NOW, JSON.stringify(draft({ cells: [['101:0', '5']], byAt: [['101:0', NOW]], by: [['101:0', 'a']] })), { expectAt: null })).ok, 'A анх бичнэ');
  const atA = await st.readRemoteDraftAt(PKG);
  const dA = await read();
  as(B, 'b');
  const atB = await st.readRemoteDraftAt(PKG);
  const dB = await read();
  ok(atA === atB, 'ижил хувилбар');
  const mB = mergeDrafts(dB, draft({ cells: [['102:0', '7']], byAt: [['102:0', NOW + 10]], by: [['102:0', 'b']] }));
  ok((await st.saveRemoteDraft(PKG, NOW + 10, JSON.stringify(mB), { expectAt: atB })).ok, 'B бичнэ');
  as(A, 'a');
  const n0 = f.edits.length;
  const mA = mergeDrafts(dA, draft({ cells: [['101:0', '5'], ['103:0', '9']], byAt: [['101:0', NOW], ['103:0', NOW + 20]], by: [['101:0', 'a'], ['103:0', 'a']] }));
  const rA = await st.saveRemoteDraft(PKG, NOW + 20, JSON.stringify(mA), { expectAt: atA });
  ok(!rA.ok && rA.conflict === true, 'A-гийн хуучин хувилбартай бичилт → conflict');
  ok(f.edits.length === n0, 'conflict үед ЮУ Ч бичигдээгүй');
  const at2 = await st.readRemoteDraftAt(PKG);
  const d2 = await read();
  const m2 = mergeDrafts(d2, mA);
  ok((await st.saveRemoteDraft(PKG, NOW + 21, JSON.stringify(m2), { expectAt: at2 })).ok, 'дахин уншаад нийлүүлсэн бичилт');
  as(B, 'b');
  eq(cellsOf(await read()), { '101:0': '5', '102:0': '7', '103:0': '9' }, 'хоёр бөглөгчийн нүд хоёулаа');
  ok((await st.saveRemoteDraft(PKG, NOW + 30, JSON.stringify(m2))).ok, '`expectAt` өгөөгүй бол шалгахгүй (хуучин зан)');
  console.log('✅ 2. CAS — завсарт бичигдсэн бол conflict, юу ч бичихгүй');
}

/* ══════════ 3. Хамтран бөглөгч ══════════ */
{
  fresh();
  const A = new Map(); const B = new Map();
  as(A, 'a');
  ok((await st.saveRemoteDraft(PKG, NOW, JSON.stringify(draft({ cells: [['101:0', '5']], byAt: [['101:0', NOW]], by: [['101:0', 'a']] })))).ok, 'A обьём');
  as(B, 'b');
  const dB0 = await read();
  as(A, 'a');
  await read();
  /* A ба B НЭГ мөрийн (w:d11:0) ӨӨР бүлгийг зэрэг (нэг нь нөгөөгийнхийг уншаагүй) */
  ok((await st.saveRemoteDraft(PKG, NOW + 1, JSON.stringify(draft({ cells: [['101:0', '8']], byAt: [['101:0', NOW + 1]], by: [['101:0', 'a']] })))).ok, 'A обьёмоо засна');
  as(B, 'b');
  const mB = mergeDrafts(dB0, draft({ dates: [['101:0:s', '2026-10-05']], byAt: [['101:0:s', NOW + 2]], by: [['101:0:s', 'b']] }));
  ok((await st.saveRemoteDraft(PKG, NOW + 2, JSON.stringify(mB))).ok, 'B огноо (A-гийн шинэ обьёмыг хараагүй)');
  const dB = await read();
  ok(cellsOf(dB)['101:0'] === '8' && datesOf(dB)['101:0:s'] === '2026-10-05', 'өөр бүлэг — хоёулаа буув (обьём A-гийнх, огноо B-гийнх)');
  /* Tombstone — A нүдээ устгана, B-гийн ХУУЧИН хуулбар амилахгүй */
  as(A, 'a');
  const dA = await read();
  const delA = { ...dA, cells: dA.cells.filter(([k]) => k !== '101:0'), del: [['101:0', NOW + 5]] };
  ok((await st.saveRemoteDraft(PKG, NOW + 5, JSON.stringify(delA))).ok, 'A устгана');
  as(B, 'b');
  const dB2 = await read();
  ok(!cellsOf(dB2)['101:0'] && (dB2.del ?? []).some(([k, t]) => k === '101:0' && t === NOW + 5), 'B tombstone-ийг ЯГ агшинтай нь харна');
  const stale = mergeDrafts(dB2, draft({ cells: [['101:0', '8']], byAt: [['101:0', NOW + 1]], by: [['101:0', 'a']] }));
  ok(!cellsOf(stale)['101:0'], 'tombstone-оос эрт хуулбар амилахгүй');
  /* Илгээлтийн баримт — илгээгдсэн утгыг бусад хуулбараас хасна (ДАВХАР ТООЛОЛГҮЙ) */
  as(A, 'a');
  const dA3 = await read();
  ok((await st.saveRemoteDraft(PKG, NOW + 6, JSON.stringify(mergeDrafts(dA3, draft({ cells: [['102:0', '4']], byAt: [['102:0', NOW + 6]], by: [['102:0', 'a']] }))))).ok, 'A 102:0 = 4');
  const dA4 = await read();
  const sent = { ...dA4, cells: dA4.cells.filter(([k]) => k !== '102:0'), rcpt: packRcpt([['102:0', NOW + 7, '4', NOW + 6]]) };
  ok((await st.saveRemoteDraft(PKG, NOW + 7, JSON.stringify(sent))).ok, 'A илгээгээд баримт бичнэ');
  as(B, 'b');
  const dB3 = await read();
  ok(unpackRcpt(dB3.rcpt).some((r) => r[0] === '102:0' && r[2] === '4'), 'B баримтыг харна');
  const bLocal = draft({ cells: [['102:0', '4']], byAt: [['102:0', NOW + 6]], by: [['102:0', 'a']] });
  ok(!cellsOf(mergeDrafts(dB3, bLocal))['102:0'], 'илгээгдсэн утгатай локал хуулбар хасагдана (дахин илгээгдэхгүй)');
  /* Оролцогч — «дуусгасан» ба буцаагдсан илгээлтийн зорилт (хүн тус бүрийн мөр) */
  as(A, 'a');
  const dA5 = await read();
  ok((await st.saveRemoteDraft(PKG, NOW + 8, JSON.stringify({ ...dA5, marks: [['a', 1, 3, NOW + 8]], done: [['a', NOW + 8]], tgt: [['a', 4321, Date.UTC(2026, 9, 20), NOW + 8]] }))).ok, 'A «дуусгасан» + зорилт');
  as(B, 'b');
  const dB4 = await read();
  ok((dB4.marks ?? []).some((m) => m[0] === 'a' && m[1] === 1 && m[2] === 3), 'B: A «дуусгасан»');
  ok((dB4.tgt ?? []).some((t) => t[0] === 'a' && t[1] === 4321 && t[2] === Date.UTC(2026, 9, 20)), 'B: A-гийн буцаагдсан илгээлтийн зорилт');
  console.log('✅ 3. Хамтран бөглөгч — өөр бүлэг · tombstone · баримт · оролцогч');
}

/* ══════════ 4. Хуучин JSON ноорог → мөр ══════════ */
{
  const f = fresh();
  const legacy = draft({ t: NOW - 5 * D, cells: [['101:0', '3'], ['102:1', '%20']], dates: [['103:0:s', '2026-09-01']], byAt: [['101:0', NOW - 5 * D], ['102:1', NOW - 5 * D], ['103:0:s', NOW - 5 * D]], by: [['101:0', 'old'], ['102:1', 'old'], ['103:0:s', 'old']] });
  const raw = JSON.stringify(legacy);
  const lo = f.seed({ dkey: PKG, pkg: PKG, usr: 'old', at: legacy.t, payload: raw });
  const d = await read();
  eq(cellsOf(d), { '101:0': '3', '102:1': '%20' }, 'анхны нээлт: JSON-ы нүд');
  eq(datesOf(d), { '103:0:s': '2026-09-01' }, 'анхны нээлт: огноо');
  const hdr = f.all().find((a) => a.dkey === perfDkey(PKG) && a.mur_turul === 'tolgoi');
  ok(hdr && hdr.huuchin_at === legacy.t, 'мөр рүү шилжив — толгойн `huuchin_at` = JSON-ы `at`');
  ok(f.rows.get(lo).payload === raw, 'хуучин JSON ХӨНДӨГДӨӨГҮЙ');
  /* Хуучин таб JSON-д шинэ нүд бичнэ — шинэ уншилт шингээнэ */
  const old2 = { ...legacy, t: NOW + 100, cells: [...legacy.cells, ['103:1', '6']], byAt: [...legacy.byAt, ['103:1', NOW + 100]], by: [...legacy.by, ['103:1', 'old']] };
  f.rows.set(lo, { ...f.rows.get(lo), at: old2.t, payload: JSON.stringify(old2), last_edited_date: f.now() });
  const at0 = await st.readRemoteDraftAt(PKG);
  const d2 = await read();
  ok(cellsOf(d2)['103:1'] === '6', 'хуучин табын шинэ нүд шингэв');
  ok((await st.saveRemoteDraft(PKG, NOW + 101, JSON.stringify(d2), { expectAt: at0 })).ok, 'шингээсэн ноорог бичигдэнэ');
  const hdr2 = f.all().find((a) => a.dkey === perfDkey(PKG) && a.mur_turul === 'tolgoi');
  ok(hdr2.huuchin_at === old2.t, '`huuchin_at` урагшилна (дахин шингээхгүй)');
  ok(f.all().some((a) => a.dkey === perfDkey(PKG) && a.mur_key === 'w:d13:1' && a.obyem_sum === 6), 'шингээсэн нүд мөрөнд');
  console.log('✅ 4. Хуучин JSON → мөр (JSON хөндөгдөхгүй, хуучин таб шингэнэ)');
}

/* ══════════ 5. Fallback ══════════ */
{
  fresh({ noColumns: true });
  await st.readRemoteDraftAt('zz').catch(() => null);
  ok(st.remoteMax() === st.REMOTE_MAX, 'багана алга → JSON горим (REMOTE_MAX)');
  fresh({ partial: true });
  const ce = console.error; let logged = false; console.error = () => { logged = true; };
  try { await st.readRemoteDraftAt('zz').catch(() => null); } finally { console.error = ce; }
  ok(st.remoteMax() === st.REMOTE_MAX && logged, 'хагас багана → JSON горим + алдааны лог (холихгүй)');
  const f = fresh();
  f.metaDown = true;
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'a', reset: true, imgs: new Map() });
  setFillFrame(PKG, FR, ['5/1', '5/2']);
  ok((await st.readRemoteDraftAt(PKG)) === undefined, 'сүлжээ унасан → «шалгаж чадсангүй» (undefined)');
  const n0 = f.edits.length;
  const r = await st.saveRemoteDraft(PKG, NOW, JSON.stringify(draft({ cells: [['101:0', '1']] })));
  ok(!r.ok && f.edits.length === n0, 'хүлээх горимд юу ч бичихгүй (JSON руу нөөц бичилтгүй)');
  console.log('✅ 5. Fallback — багана алга/хагас → JSON, сүлжээ → хүлээх');
}

console.log(`fillRows.check — БҮГД ТЭНЦЛЭЭ (${checks} шалгалт)`);
