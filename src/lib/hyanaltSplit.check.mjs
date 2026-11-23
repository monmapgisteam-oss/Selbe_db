/**
 * ХЯНАЛТЫН ТҮҮХ · ЗӨВШӨӨРСӨН НҮД ТУСДАА ХҮСНЭГТЭД (2026-11-23, «нэг нүдэнд нэг утга») — цэвэр хувиргалт ба хуурамч сервертэй
 * бодит урсгал: шинэ мөр эхэлж нэмэгдээд, төлөв · заагч НЭГ нөхцөлт бичилтээр солигдоно; бичилт унавал нэмсэн мөр цэвэрлэгдэнэ.
 * Сүлжээгүй: node --experimental-transform-types src/lib/hyanaltSplit.check.mjs
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { calculateRows } from './hyanaltDecision.fake.mjs';

process.env.NEXT_PUBLIC_ENT_DATA = 'https://split.test/rest/services/Hosted';
process.env.NEXT_PUBLIC_PORTAL_URL = 'https://split.test/portal';
process.env.NEXT_PUBLIC_ALLOWED_ORG_ID = 'split-test';
process.env.NEXT_PUBLIC_AUTH_APP_ID = 'split-test';
Object.assign(process.env, {
  NEXT_PUBLIC_HABEA_LABOR_SVC: 'split_test_labor', NEXT_PUBLIC_HABEA_INCIDENT_SVC: 'split_test_incident',
  NEXT_PUBLIC_HABEA_UZLEG_V11_SVC: 'split_test_uzleg_v11', NEXT_PUBLIC_HABEA_UZLEG_G_SVC: 'split_test_uzleg_g',
});
register('../../tools/ts-alias-hooks.mjs', import.meta.url);

const { histPlan, chainList, histJson, cellPlan, cellsJson, SPLIT, HC, CC } = await import('./hyanaltSplit.ts');
const { F, HYANALT, SF, STATUS, updateDecision, queryAll, addRows, fieldMaxLen, HyanaltConflict } = await import('./hyanalt.ts');
const { toRow } = await import('./hyanaltStore.ts');
const { encodeOkCells } = await import('./hyanaltOkCells.ts');

/* ───────── 1. цэвэр хувиргалт ───────── */
let n = 0;
const mk = () => `t${(n += 1)}`;
const e1 = { stage: 'engineer', who: 'A', at: 1000, act: 'approve', u: 'a_user' };
const e2 = { stage: 'manager', who: 'B', at: 2000, act: 'return', reason: 'шалтгаан', u: 'b_user' };
const e3 = { stage: 'engineer', who: 'A', at: 3000, act: 'approve' };

/* хуучин JSON нүднээс анх шилжих — бүтэн жагсаалт шинэ гинж */
const p1 = histPlan(JSON.stringify([e1]), JSON.stringify([e1, e2]), null, 7, mk);
assert.equal(p1.rows.length, 2, 'заагчгүй (хуучин) мөр — бүх үйл явдал мөр болно');
assert.deepEqual(p1.rows.map((r) => [r[HC.idx], r[HC.token], r[HC.prev], r[HC.parent]]), [[1, 't1', null, 7], [2, 't2', 't1', 7]]);
assert.deepEqual([p1.rows[1][HC.stage], p1.rows[1][HC.act], p1.rows[1][HC.who], p1.rows[1][HC.user], p1.rows[1][HC.at], p1.rows[1][HC.reason]],
  ['manager', 'return', 'B', 'b_user', 2000, 'шалтгаан'], 'үйл явдлын утга бүр тусдаа баганад');
assert.equal(p1.token, 't2');
/* заагчтай мөрт нэг үйл явдал нэмэх — ганц мөр, өмнөх түлхүүрт залгана */
const p2 = histPlan(JSON.stringify([e1, e2]), JSON.stringify([e1, e2, e3]), 't2', 7, mk);
assert.deepEqual(p2.rows.map((r) => [r[HC.idx], r[HC.token], r[HC.prev]]), [[3, 't3', 't2']]);
assert.equal(p2.rows[0][HC.user], null, 'хэрэглэгчийн нэргүй үйл явдал — хоосон');
/* өөрчлөлтгүй — мөр нэмэхгүй, заагч хэвээр */
assert.deepEqual(histPlan(JSON.stringify([e1]), JSON.stringify([e1]), 'tx', 7, mk), { rows: [], token: 'tx' });
/* огт давхцалгүй жагсаалт — шинэ гинж (урдаасаа тайрагдсан тохиолдлыг доор 2л-д) */
const p3 = histPlan(JSON.stringify([e1, e2]), JSON.stringify([e3, { ...e3, at: 4000 }]), 't2', 7, mk);
assert.equal(p3.rows.length, 2);
assert.equal(p3.rows[0][HC.prev], null, 'шинэ гинж өмнөхөөс тасархай');
/* хоосон түүх — мөргүй, заагчгүй */
assert.deepEqual(histPlan('', '[]', null, 7, mk), { rows: [], token: null });

/* гинжийг буцааж унших — бичсэнтэй ижил жагсаалт; гинжид ороогүй (хаягдсан) мөр харагдахгүй */
const by = new Map([...p1.rows, ...p2.rows, { [HC.token]: 'orphan', [HC.prev]: 't2', [HC.stage]: 'chief', [HC.act]: 'approve', [HC.at]: 9 }]
  .map((r) => [r[HC.token], r]));
assert.deepEqual(chainList('t3', by), [e1, e2, e3]);
assert.equal(histJson('t3', by), JSON.stringify([e1, e2, e3]));
assert.equal(histJson(null, by), '');
assert.deepEqual(chainList('missing', by), [], 'олдоогүй түлхүүр — хоосон');
by.get('t1')[HC.prev] = 't3';
assert.equal(chainList('t3', by).length, 3, 'эргэлдсэн гинж төгсгөлгүй давтагдахгүй');
by.get('t1')[HC.prev] = null;

/* зөвшөөрсөн нүд: нүд бүр нэг мөр, утга бүр тусдаа баганад */
const enc = encodeOkCells(['12|ab.0|5/1', '12|ab.0|5/2', '13|cd.1|a|b', '12|ab.0|5/1']);
const c1 = cellPlan(enc, 7, mk);
assert.equal(c1.rows.length, 3, 'давхардал хасагдана');
assert.deepEqual(c1.rows.map((r) => [r[CC.parent], r[CC.row], r[CC.sid], r[CC.block], r[CC.token]]),
  [[7, 12, 'ab.0', '5/1', c1.token], [7, 12, 'ab.0', '5/2', c1.token], [7, 13, 'cd.1', 'a|b', c1.token]]);
assert.equal(cellsJson(c1.rows), enc, 'мөрүүдээс урьдын кодлол яг сэргэнэ');
assert.deepEqual(cellPlan('', 7, mk), { rows: [], token: null }, 'хоосон — мөргүй');
assert.deepEqual(cellPlan(encodeOkCells([]), 7, mk), { rows: [], token: null });
assert.equal(cellPlan('["1:5/1"]', 7, mk), null, 'хуучин хэлбэрийг задлахгүй');
assert.equal(cellsJson([]), '');

/* ───────── 2. хуурамч сервер: 183 (хяналт) · 236 (түүх) · 237 (нүд) ───────── */
const T0 = Date.UTC(2026, 10, 23, 6);
const legacyHist = JSON.stringify([{ stage: 'manager', who: 'Өмнөх', at: T0 - 1000, act: 'return', reason: 'засах', u: 'umnuh' }]);
const legacyCells = encodeOkCells(['5|aa.0|5/1', '5|aa.0|5/2']);
const original = (extra = {}) => ({
  objectid: 1, [F.id]: 'G-000001', [F.sheetOid]: null, [F.ergelt]: 1, [F.bagts]: 'Багц-1', [F.ajil]: 'Ажил', [F.company]: 'Компани',
  [F.companySent]: T0,
  ...Object.fromEntries(Object.values(SF).flatMap((f) => [[f.who, ''], [f.decision, ''], [f.reason, ''], [f.sent, null], [f.returned, null]])),
  [F.okCells]: legacyCells, [F.history]: legacyHist, [F.histToken]: null, [F.okToken]: null, [F.status]: STATUS.engineerReview, ...extra,
});
const db = { parent: [], hist: [], cells: [], seq: 100, failAdd: null, calc: 0, stale: false, lost: false };
const json = (v) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const inList = (where, field) => {
  const m = new RegExp(`^${field} IN \\((.*)\\)$`).exec(where);
  return m ? new Set(m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))) : null;
};
const child = (name, url, body) => {
  const rows = db[name];
  if (url.endsWith('/query')) {
    const where = body.get('where');
    const set = inList(where, CC.token);
    return json({ features: rows.filter((r) => where === '1=1' || (set && set.has(r[CC.token]))).map((attributes) => ({ attributes: { ...attributes } })) });
  }
  if (url.endsWith('/applyEdits')) {
    if (db.failAdd === name) return json({ addResults: [{ success: false, error: { description: 'унав' } }] });
    if (body.get('updates')) {
      for (const u of JSON.parse(body.get('updates'))) Object.assign(rows.find((r) => r.objectid === u.attributes.objectid) ?? {}, u.attributes);
      return json({ updateResults: [] });
    }
    const adds = JSON.parse(body.get('adds')).map((x) => ({ ...x.attributes, objectid: (db.seq += 1) }));
    rows.push(...adds);
    return json({ addResults: adds.map((r) => ({ success: true, objectId: r.objectid })) });
  }
  if (url.endsWith('/deleteFeatures')) {
    const ids = body.get('objectIds') ? new Set(body.get('objectIds').split(',').map(Number)) : null;
    const m = /^(\w+) = '(.*)'$/.exec(body.get('where') ?? '');
    db[name] = rows.filter((r) => !(ids ? ids.has(r.objectid) : m && r[m[1]] === m[2]));
    return json({ success: true });
  }
  throw new Error(`хүлээгээгүй хүсэлт ${url}`);
};
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = new URLSearchParams(init?.body);
  if (url.startsWith(SPLIT.histUrl)) return child('hist', url, body);
  if (url.startsWith(SPLIT.cellUrl)) return child('cells', url, body);
  if (url === HYANALT.url || url === `${HYANALT.url}/`) {
    return json({ supportsCalculate: true, fields: ['objectid', ...Object.values(F)].map((name) => ({ name, type: 'esriFieldTypeString', length: 100000 })) });
  }
  if (url === `${HYANALT.url}/query`) {
    if (body.has('outStatistics')) return json({ features: [{ attributes: { srv_now: T0 } }] });
    return json({ features: db.parent.map((r) => ({ attributes: { ...r } })), exceededTransferLimit: false });
  }
  if (url === `${HYANALT.url}/calculate`) {
    db.calc += 1;
    if (db.lost) { calculateRows(db.parent, body, () => {}); throw new TypeError('хариу алдагдсан (тест)'); } // сервер бичсэн, хариу ирээгүй
    if (db.stale) db.parent[0][F.status] = STATUS.managerReview; // өөр хүн түрүүлж шийдсэн
    return json(calculateRows(db.parent, body, () => {}));
  }
  if (url === `${HYANALT.url}/applyEdits`) {
    const adds = JSON.parse(body.get('adds')).map((x) => ({ ...x.attributes, objectid: (db.seq += 1) }));
    db.parent.push(...adds);
    return json({ addResults: adds.map((r) => ({ success: true, objectId: r.objectid })) });
  }
  throw new Error(`хүлээгээгүй хүсэлт ${url}`);
};
const load = async () => toRow((await queryAll()).find((a) => a.objectid === 1));
const reset = (extra) => { db.parent = [original(extra)]; db.hist = []; db.cells = []; db.failAdd = null; db.calc = 0; db.stale = false; db.lost = false; };

/* 2а. хуучин (заагчгүй) мөр: уншихад хуучин нүднээс; баганын уртын хязгаар хамаарахгүй */
reset();
assert.equal(await fieldMaxLen(F.okCells), null, 'зөвшөөрсөн нүд мөр болдог тул тэмдэгтийн хязгааргүй');
let row = await load();
assert.equal(row[F.history], legacyHist);
assert.equal(row[F.okCells], legacyCells);

/* 2б. анхны шийдвэр: хуучин түүх + шинэ үйл явдал мөр болно, хуучин нүд цэвэрлэгдэнэ, заагч тавигдана */
const ev = { stage: 'engineer', who: 'Инженер', at: T0, act: 'approve', u: 'injener' };
const hist2 = JSON.stringify([...JSON.parse(legacyHist), ev]);
const cells2 = encodeOkCells(['5|aa.0|5/1', '6|bb.0|5/3', '6|bb.0|5/4']);
await updateDecision(row, { objectid: 1, [F.status]: STATUS.managerReview, [F.engineer]: 'Инженер', [F.history]: hist2, [F.okCells]: cells2 });
const pr = db.parent[0];
assert.equal(pr[F.status], STATUS.managerReview);
assert.equal(pr[F.history], null, 'хуучин түүхийн нүд хоосорно');
assert.equal(pr[F.okCells], null, 'хуучин зөвшөөрсөн нүдний нүд хоосорно');
assert.ok(pr[F.histToken] && pr[F.okToken], 'заагчууд тавигдана');
assert.equal(db.hist.length, 2, 'түүх: үйл явдал бүр нэг мөр');
assert.ok(db.hist.every((r) => r[HC.parent] === 1));
assert.equal(db.cells.length, 3, 'зөвшөөрсөн нүд: нүд бүр нэг мөр');
assert.ok(db.cells.every((r) => r[CC.token] === pr[F.okToken] && r[CC.parent] === 1));
row = await load();
assert.equal(row[F.history], hist2, 'уншихад урьдын түүх яг сэргэнэ');
assert.equal(row[F.okCells], cells2, 'уншихад урьдын зөвшөөрсөн нүд яг сэргэнэ');

/* 2в. дараагийн шийдвэр: түүхэнд ганц мөр нэмэгдэнэ; нүдний хуучин багц солигдож устна */
const ev2 = { stage: 'manager', who: 'Менежер', at: T0 + 5, act: 'return', reason: 'буцаав', u: 'menejer' };
const hist3 = JSON.stringify([...JSON.parse(hist2), ev2]);
const oldCellTok = pr[F.okToken];
await updateDecision(row, { objectid: 1, [F.status]: STATUS.managerReturned, [F.history]: hist3, [F.okCells]: encodeOkCells(['9|zz.0|5/9']) });
assert.equal(db.hist.length, 3, 'нэг үйл явдал — нэг шинэ мөр');
assert.equal(db.hist[2][HC.prev], db.hist[1][HC.token], 'шинэ мөр өмнөх рүүгээ заана');
assert.deepEqual(db.cells.map((r) => r[CC.sid]), ['zz.0'], 'солигдсон хуучин багцын мөрүүд устна');
assert.notEqual(db.parent[0][F.okToken], oldCellTok);
row = await load();
assert.equal(row[F.history], hist3);

/* 2г. өөр хүн түрүүлсэн (нөхцөлт бичилт татгалзсан): шийдвэр хадгалагдахгүй, нэмсэн мөрүүд цэвэрлэгдэнэ */
const before = { hist: db.hist.length, cells: db.cells.length, tok: db.parent[0][F.histToken], ctok: db.parent[0][F.okToken] };
db.stale = true;
const ev3 = { stage: 'manager', who: 'Менежер', at: T0 + 9, act: 'approve', u: 'menejer' };
await assert.rejects(() => updateDecision(row, { objectid: 1, [F.status]: STATUS.plannerReview,
  [F.history]: JSON.stringify([...JSON.parse(hist3), ev3]), [F.okCells]: encodeOkCells(['1|q.0|5/1', '2|q.1|5/1']) }),
(e) => e instanceof HyanaltConflict);
db.stale = false;
assert.equal(db.hist.length, before.hist, 'татгалзсан шийдвэрийн түүхийн мөр үлдэхгүй');
assert.equal(db.cells.length, before.cells, 'татгалзсан шийдвэрийн нүдний мөр үлдэхгүй');
assert.equal(db.parent[0][F.histToken], before.tok, 'заагч хөдлөөгүй');
assert.equal(db.parent[0][F.okToken], before.ctok);

/* 2д. туслах мөр нэмэгдэхгүй бол шийдвэр ОГТ бичигдэхгүй (хагас хадгалалт үгүй) */
row = await load();
db.failAdd = 'cells';
const calc0 = db.calc;
await assert.rejects(() => updateDecision(row, { objectid: 1, [F.status]: STATUS.plannerReview,
  [F.history]: JSON.stringify([...JSON.parse(row[F.history]), ev3]), [F.okCells]: encodeOkCells(['1|q.0|5/1']) }), /хадгалагдсангүй/);
assert.equal(db.calc, calc0, 'нөхцөлт бичилт илгээгдээгүй');
assert.equal(db.hist.length, before.hist, 'түрүүлж нэмэгдсэн түүхийн мөр буцаагдана');
db.failAdd = null;

/* 2е. зөвшөөрсөн нүдийг хоосолбол заагч хоосорч, мөрүүд устна; төлөв өөрчлөгдөөгүй шийдвэрт түүх хөндөгдөхгүй */
row = await load();
await updateDecision(row, { objectid: 1, [F.status]: row[F.status], [F.engineer]: 'X', [F.okCells]: encodeOkCells([]) });
assert.equal(db.parent[0][F.okToken], null);
assert.equal(db.cells.length, 0);
assert.equal(db.hist.length, before.hist);

/* 2ж. шилжүүлсэн (дууссан) илгээлтийн нүдийг татахгүй — түүх хэвээр уншигдана */
reset({ [F.status]: STATUS.transferred, [F.history]: null, [F.okCells]: null, [F.histToken]: 'h1', [F.okToken]: 'c1' });
db.hist = [{ objectid: 1, [HC.parent]: 1, [HC.idx]: 1, [HC.stage]: 'engineer', [HC.act]: 'approve', [HC.who]: 'A', [HC.user]: 'a', [HC.at]: 5, [HC.reason]: null, [HC.token]: 'h1', [HC.prev]: null }];
db.cells = [{ objectid: 2, [CC.parent]: 1, [CC.row]: 5, [CC.sid]: 'aa.0', [CC.block]: '5/1', [CC.token]: 'c1' }];
row = await load();
assert.equal(row[F.okCells], '', 'дууссан илгээлтэд зөвшөөрсөн нүд ачаалахгүй');
assert.equal(row[F.history], JSON.stringify([{ stage: 'engineer', who: 'A', at: 5, act: 'approve', u: 'a' }]));

/* 2з. шинэ мөр нэмэх: мөрт заагч л бичигдэнэ, түүх тусдаа мөр болж эцгийнхээ дугаарыг авна */
reset();
const res = await addRows([{ [F.id]: 'G-000002', [F.bagts]: 'Багц-1', [F.status]: STATUS.engineerReview,
  [F.history]: JSON.stringify([{ stage: 'engineer', who: 'A', at: 7, act: 'recheck-ok', u: 'a' }]), [F.okCells]: '' }]);
const added = db.parent.find((r) => r[F.id] === 'G-000002');
assert.ok(!(F.history in added) && !(F.okCells in added), 'шинэ мөрт JSON нүд бичигдэхгүй');
assert.equal(added[F.okToken], null);
assert.equal(db.hist.length, 1);
assert.equal(db.hist[0][HC.token], added[F.histToken]);
assert.equal(db.hist[0][HC.parent], res[0].objectId, 'түүхийн мөр эцэг мөрийнхөө дугаартай');

/* 2и. ХУУЧИН КОДТОЙ ЦОНХ заагчтай мөрийн хуучин нүдэнд бичсэн: уншихад алдагдахгүй, дараагийн шийдвэр гацахгүй, бүгд мөр болно */
reset({ [F.status]: STATUS.managerReview, [F.history]: null, [F.okCells]: null, [F.histToken]: 'h1', [F.okToken]: 'c1' });
db.hist = [{ objectid: 1, [HC.parent]: 1, [HC.idx]: 1, [HC.stage]: 'engineer', [HC.act]: 'approve', [HC.who]: 'A', [HC.user]: 'a', [HC.at]: 5, [HC.reason]: null, [HC.token]: 'h1', [HC.prev]: null }];
db.cells = [{ objectid: 2, [CC.parent]: 1, [CC.row]: 5, [CC.sid]: 'aa.0', [CC.block]: '5/1', [CC.token]: 'c1' }];
const lateEv = { stage: 'manager', who: 'Хуучин цонх', at: 8, act: 'return', reason: 'x', u: 'old_tab' };
const lateCells = encodeOkCells(['7|ol.0|5/7']);
db.parent[0][F.history] = JSON.stringify([lateEv]);
db.parent[0][F.okCells] = lateCells;
db.parent[0][F.status] = STATUS.managerReturned;
row = await load();
const merged = [{ stage: 'engineer', who: 'A', at: 5, act: 'approve', u: 'a' }, lateEv];
assert.equal(row[F.history], JSON.stringify(merged), 'гинж + хуучин нүдний үйл явдал хамт уншигдана');
assert.equal(row[F.okCells], lateCells, 'сүүлд бичигдсэн (хуучин нүдний) зөвшөөрөл хүчинтэй');
const ev9 = { stage: 'engineer', who: 'A', at: 12, act: 'approve', u: 'a' };
await updateDecision(row, { objectid: 1, [F.status]: STATUS.managerReview,
  [F.history]: JSON.stringify([...merged, ev9]), [F.okCells]: encodeOkCells(['8|nw.0|5/8']) });
assert.equal(db.parent[0][F.status], STATUS.managerReview, 'шийдвэр гацалгүй хадгалагдана');
assert.equal(db.parent[0][F.history], null, 'хуучин нүд цэвэрлэгдэнэ');
assert.equal(db.parent[0][F.okCells], null);
assert.ok(!String(db.parent[0][F.histToken]).includes('|'), 'серверт цэвэр түлхүүр бичигдэнэ');
row = await load();
assert.equal(row[F.history], JSON.stringify([...merged, ev9]), 'гурван үйл явдал бүгд мөр болсон');
assert.equal(row[F.okCells], encodeOkCells(['8|nw.0|5/8']));
assert.deepEqual(db.cells.map((r) => r[CC.sid]), ['nw.0'], 'хуучин багц устсан');

/* 2к. ХАРИУ АЛДАГДСАН бичилт (сервер бичсэн, хариу ирээгүй): нэмсэн мөрийг УСТГАХГҮЙ — эцэг мөр тэднийг зааж байгаа */
reset({ [F.history]: null, [F.okCells]: null });
row = await load();
db.lost = true;
const evL = { stage: 'engineer', who: 'A', at: 20, act: 'approve', u: 'a' };
await assert.rejects(() => updateDecision(row, { objectid: 1, [F.status]: STATUS.managerReview,
  [F.history]: JSON.stringify([evL]), [F.okCells]: encodeOkCells(['3|lo.0|5/3']) }), TypeError);
db.lost = false;
assert.equal(db.parent[0][F.status], STATUS.managerReview, 'сервер дээр бичигдсэн');
row = await load();
assert.equal(row[F.history], JSON.stringify([evL]), 'хариу алдагдсан шийдвэрийн түүх хэвээр уншигдана');
assert.equal(row[F.okCells], encodeOkCells(['3|lo.0|5/3']), 'зөвшөөрсөн нүд ч хэвээр');

/* 2л. Жагсаалт урдаасаа тайрагдсан (60-ын хязгаар) ч гинж дахин бичигдэхгүй — зөвхөн шинэ үйл явдал нэмэгдэнэ */
const A = { stage: 'engineer', who: 'A', at: 1, act: 'approve' }, B = { stage: 'manager', who: 'B', at: 2, act: 'approve' };
const C = { stage: 'planner', who: 'C', at: 3, act: 'approve' }, D = { stage: 'director', who: 'D', at: 4, act: 'approve' };
const cutPlan = histPlan(JSON.stringify([A, B, C]), JSON.stringify([B, C, D]), 'tok3', 7, () => 'tok4');
assert.deepEqual(cutPlan.rows.map((r) => [r[HC.idx], r[HC.prev], r[HC.stage]]), [[4, 'tok3', 'director']], 'ганц мөр, гинжид залгагдана');
assert.equal(histPlan(JSON.stringify([A, B]), JSON.stringify([C, D]), 'tok2', 7, mk).rows[0][HC.prev], null, 'давхцалгүй — шинэ гинж');
assert.deepEqual(histPlan('', JSON.stringify([A]), 'tokX', 7, () => 'n1').rows.map((r) => r[HC.prev]), ['tokX'], 'гинж байгаа ч санах ойд хоосон — залгана');

/* 2м. Заагчтай мөрийн хуучин нүдэнд задлагдахгүй утга (`[]`) үлдсэн ч шийдвэр гацахгүй */
reset({ [F.history]: '[]', [F.okCells]: null, [F.histToken]: 'h1', [F.okToken]: null });
db.hist = [{ objectid: 1, [HC.parent]: 1, [HC.idx]: 1, [HC.stage]: 'engineer', [HC.act]: 'return', [HC.who]: 'A', [HC.user]: 'a', [HC.at]: 5, [HC.reason]: 'r', [HC.token]: 'h1', [HC.prev]: null }];
row = await load();
await updateDecision(row, { objectid: 1, [F.status]: STATUS.managerReview,
  [F.history]: JSON.stringify([...JSON.parse(row[F.history]), { stage: 'engineer', who: 'A', at: 30, act: 'approve', u: 'a' }]) });
assert.equal(db.parent[0][F.status], STATUS.managerReview);
assert.equal(db.parent[0][F.history], null);

/* 2н. Шинэ мөр: туслах мөр нэмэгдэхгүй бол эцэг мөр ОГТ нэмэгдэхгүй (түүхгүй мөр үүсэхгүй) */
reset();
db.failAdd = 'hist';
const nParent = db.parent.length;
await assert.rejects(() => addRows([{ [F.id]: 'G-000003', [F.status]: STATUS.engineerReview,
  [F.history]: JSON.stringify([{ stage: 'engineer', who: 'A', at: 7, act: 'recheck-ok', u: 'a' }]) }]), /хадгалагдсангүй/);
assert.equal(db.parent.length, nParent, 'эцэг мөр нэмэгдээгүй');
db.failAdd = null;

console.log('hyanaltSplit.check: ✅');
