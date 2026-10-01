/**
 * ДАХИН ШАЛГАЛТ (`hyanaltStore.recheck`) — УРАЛДААН ба БИЧИЛТИЙН ДАРААХ АЧААЛАЛТ.
 * Хуурамч ArcGIS (`fetch`), амьд сүлжээ рүү НЭГ Ч хүсэлт явахгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltRecheck.check.mjs
 *
 * Хамгаалж буй алдаанууд (2026-09-30):
 *   1. ⚠️ «ok» (дээш илгээх) зам бичихийн өмнө ДАХИН ШАЛГАДАГГҮЙ байв
 *      (`movedSince` зөвхөн «back» ба `apply`-д). Нэг шатанд хоёр данс томилогдсон
 *      үед нөгөө нь хооронд нь «back» хийвэл ergelt+1 мөр нэмэгдэж, гүйцэтгэгчид
 *      очсон буцаалт чимээгүй дарагдана; хоёулаа «ok» бол ижил тойрогтой ХОЁР мөр.
 *   2. ⚠️ Бичилт БҮТСЭНИЙ дараах `refresh()` унавал `{ok:false}` буцдаг байв —
 *      хянагч улаан алдаа хараад дахин дарж STALE авна (`apply`-ийн 2026-09-29-ний
 *      засвартай ижил).
 */
import assert from 'node:assert/strict';
import { F, HYANALT, STATUS, DECISION } from './hyanalt.ts';
import { recheck } from './hyanaltStore.ts';

/* ══════════ Хуурамч хяналтын хүснэгт ══════════ */
const T0 = Date.UTC(2026, 8, 20, 2, 0, 0);
const st = {
  rows: [],
  next: 100,
  queries: 0,
  adds: [],
  updates: [],
  /** n-р `/query`-ийн ӨМНӨ дуудагдана — «нөгөө данс» энд бичнэ */
  onQuery: null,
  /** Бичилтийн дараах уншилт 200 + error буцаана */
  failAfterWrite: false,
  wrote: false,
  unexpected: [],
};
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body ?? ''));
  if (!url.startsWith(HYANALT.url)) { st.unexpected.push(url); throw new TypeError('сүлжээ хаалттай (тест)'); }
  const path = url.slice(HYANALT.url.length);
  /* ⚠️ 2026-10-01: давхаргын МЕТАДАТА (`serviceFieldNames`) — шийдвэрийн лог талбар
     (`Shiidveriin_tuuh`) БАЙГАА үйлчилгээ гэж үзнэ (`hasHistoryField`). */
  if (path === '' || path === '/') {
    return json({ fields: Object.values(F).map((name) => ({ name })) });
  }
  if (path === '/query') {
    st.queries += 1;
    st.onQuery?.(st.queries);
    if (st.failAfterWrite && st.wrote) return json({ error: { code: 400, message: 'Unable to complete operation.' } });
    return json({ features: st.rows.map((a) => ({ attributes: { ...a } })), exceededTransferLimit: false });
  }
  if (path === '/applyEdits') {
    st.wrote = true;
    if (body.has('adds')) {
      const arr = JSON.parse(body.get('adds'));
      const res = arr.map((f) => {
        const oid = st.next++;
        st.rows.push({ ...f.attributes, OBJECTID: oid });
        st.adds.push(f.attributes);
        return { objectId: oid, success: true };
      });
      return json({ addResults: res });
    }
    if (body.has('updates')) {
      const arr = JSON.parse(body.get('updates'));
      const res = arr.map((f) => {
        const r = st.rows.find((x) => x.OBJECTID === f.attributes.OBJECTID);
        if (r) Object.assign(r, f.attributes);
        st.updates.push(f.attributes);
        return { objectId: f.attributes.OBJECTID, success: !!r };
      });
      return json({ updateResults: res });
    }
  }
  st.unexpected.push(url);
  throw new TypeError('танигдахгүй хүсэлт (тест)');
};

/** «Менежер буцаасан» мөр — инженер дахин шалгах ёстой */
const returnedRow = () => ({
  OBJECTID: 1,
  [F.id]: 'G-000001',
  [F.sheetOid]: 500,
  [F.ergelt]: 1,
  [F.bagts]: 'Багц 1',
  [F.ajil]: 'Гүйцэтгэл · 2026.09.20 · Багц 1 · 9 давхар',
  [F.company]: 'Компани',
  [F.companySent]: T0,
  [F.engineer]: 'Инженер А',
  [F.engineerDecision]: DECISION.approve,
  [F.engineerReason]: '',
  [F.engineerReturned]: null,
  [F.engineerSent]: T0 + 3_600_000,
  [F.manager]: 'Менежер',
  [F.managerDecision]: DECISION.return,
  [F.managerReason]: 'обьём зөрүүтэй',
  [F.managerReturned]: T0 + 7_200_000,
  [F.managerSent]: null,
  [F.okCells]: '',
  [F.status]: STATUS.managerReturned,
});
const reset = () => {
  st.rows = [returnedRow()];
  st.next = 100;
  st.queries = 0;
  st.adds = [];
  st.updates = [];
  st.onQuery = null;
  st.failAfterWrite = false;
  st.wrote = false;
};
/* ⚠️ `bypass: true` — эрхийн шалгуур (`authz`) энэ шалгуурын сэдэв биш */
const ok = (who) => recheck(1, 'ok', '', who, 'engineer', undefined, true);
const back = (who, why) => recheck(1, 'back', why, who, 'engineer', undefined, true);

let n = 0;
const check = (c, m) => { assert.ok(c, m); n += 1; };

/* ── 1. «ok» — хооронд нь нөгөө данс «back» хийсэн: мөр НЭМЭХГҮЙ ── */
reset();
st.onQuery = (q) => {
  if (q !== 2) return;
  Object.assign(st.rows[0], {
    [F.engineer]: 'Инженер Б',
    [F.engineerDecision]: DECISION.return,
    [F.engineerReason]: 'дахин хэмжинэ',
    [F.engineerReturned]: T0 + 9_000_000,
    [F.status]: STATUS.engineerReturned,
  });
};
{
  const r = await ok('Инженер В');
  check(r.ok === false, '1: нөгөө дансны буцаалтын дараа «ok» ЗОГСОХ ёстой');
  check(st.adds.length === 0, `1: шинэ тойргийн мөр НЭМЭГДЭХ ЁСГҮЙ (нэмэгдсэн: ${st.adds.length})`);
  check(st.rows[0][F.status] === STATUS.engineerReturned, '1: гүйцэтгэгчид очсон буцаалт хэвээр');
}

/* ── 2. «ok» — хооронд нь нөгөө данс «ok» хийсэн: ХОЁР ДАХЬ мөр үүсгэхгүй ── */
reset();
st.onQuery = (q) => {
  if (q !== 2) return;
  st.rows.push({
    ...returnedRow(),
    OBJECTID: 2,
    [F.id]: 'G-000002',
    [F.ergelt]: 2,
    [F.engineer]: 'Инженер Б',
    [F.managerDecision]: '',
    [F.managerReason]: '',
    [F.managerReturned]: null,
    [F.status]: STATUS.managerReview,
  });
};
{
  const r = await ok('Инженер В');
  check(r.ok === false, '2: ижил тойрог аль хэдийн үүссэн — ЗОГСОХ ёстой');
  check(st.adds.length === 0, `2: ижил ergelt-тэй ХОЁР дахь мөр үүсэх ёсгүй (нэмэгдсэн: ${st.adds.length})`);
  check(st.rows.filter((x) => x[F.ergelt] === 2).length === 1, '2: тойрог 2 ганцхан мөртэй');
}

/* ── 3. «ok» — хэвийн: нэг мөр, дээд шат руу; дараах уншилт унасан ч АМЖИЛТ ── */
reset();
st.failAfterWrite = true;
{
  const r = await ok('Инженер В');
  check(r.ok === true, `3: мөр үүссэн тул амжилт (алдаа: ${r.error ?? ''})`);
  check(st.adds.length === 1, '3: яг нэг шинэ мөр');
  const a = st.adds[0];
  check(a[F.ergelt] === 2, '3: ergelt + 1');
  check(a[F.status] === STATUS.managerReview, '3: менежерт буцаж очно');
  check(a[F.engineer] === 'Инженер В' && a[F.engineerDecision] === DECISION.approve, '3: дахин шалгагчийн нэр · зөвшөөрөл');
  check(a[F.companySent] === T0, '3: компанийн илгээсэн огноо ХЭВЭЭР (компани дахин илгээгээгүй)');
  check(a[F.managerDecision] === '' && a[F.managerReturned] === null, '3: дээд шат хоосноос эхэлнэ');
  check(a[F.id] === 'G-000002', '3: дугаар — хамгийн их + 1');
}

/* ── 4. «back» — хэвийн: мөр засагдана; дараах уншилт унасан ч АМЖИЛТ ── */
reset();
st.failAfterWrite = true;
{
  const r = await back('Инженер В', 'хэмжилт дутуу');
  check(r.ok === true, `4: буцаалт суусан тул амжилт (алдаа: ${r.error ?? ''})`);
  check(st.updates.length === 1, '4: яг нэг шинэчлэлт');
  check(st.rows[0][F.status] === STATUS.engineerReturned, '4: гүйцэтгэгч рүү буцав');
  check(st.rows[0][F.engineerReason] === 'хэмжилт дутуу', '4: шалтгаан бичигдэв');
  check(st.adds.length === 0, '4: шинэ мөр үүсэхгүй');
  /* ⚠️ 2026-10-01: ШИЙДВЭРИЙН ЛОГ — нэр дарагдсан ч лог нь «В»-гийн буцаалтыг хадгална */
  const log = JSON.parse(String(st.rows[0][F.history] ?? '[]'));
  check(log.length === 1 && log[0].stage === 'engineer' && log[0].who === 'Инженер В' && log[0].act === 'recheck-back'
    && log[0].reason === 'хэмжилт дутуу', `4: лог үйл явдал нэмэгдэх ёстой (${JSON.stringify(log)})`);
}

/* ── 4b. «ok» — шинэ тойргийн лог ЭНЭ дахин шалгалтаас эхэлнэ (2026-10-01) ── */
reset();
{
  const r = await ok('Инженер Г');
  check(r.ok === true, '4b: амжилт');
  const log = JSON.parse(String(st.adds[0]?.[F.history] ?? '[]'));
  check(log.length === 1 && log[0].who === 'Инженер Г' && log[0].act === 'recheck-ok', `4b: шинэ мөрийн лог (${JSON.stringify(log)})`);
}

/* ── 5. «back» — хооронд нь нөгөө данс «ok» хийсэн: дарж бичихгүй (урьдын хамгаалалт) ── */
reset();
st.onQuery = (q) => {
  if (q !== 2) return;
  st.rows.push({ ...returnedRow(), OBJECTID: 2, [F.id]: 'G-000002', [F.ergelt]: 2, [F.status]: STATUS.managerReview });
};
{
  const r = await back('Инженер В', 'хэмжилт дутуу');
  check(r.ok === false, '5: шинэ тойрог үүссэн тул буцаалт ЗОГСОНО');
  check(st.updates.length === 0, '5: хуучин мөр засагдахгүй');
}

assert.deepEqual(st.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ hyanaltRecheck: ${n} шалгалт — бүгд давлаа`);
