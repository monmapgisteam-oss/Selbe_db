/**
 * ХАБ-ЫН БҮРТГЭЛ · ХОГ ХАЯГДАЛ — уншилт ба бичилт (хуурамч fetch, сүлжээгүй). 2026-10-09.
 * ⚠️ `.ui.` — `habeaRegisters` нь `habeaUzleg.prevWeek`-ийг (tsx, css) импортлодог тул UI горимын ачаалагч.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/habeaRegisters.ui.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Долоо хоногийн хил хөтчийн ЛОКАЛ цагаар (UB биш) — үзлэгийн KPI-аас 8 цагаар зөрнө.
 *  2. Кэш долоо хоногоор түлхүүрлэгдээгүй — Даваа дамжихад TTL дотор ӨМНӨХ долоо хоногийн тоо.
 *  3. `count` ирээгүй → 0 (`null ≠ 0`); хоосон нүд/Week → 0 нэмэгдэх.
 *  4. Хуудаслалтгүй (≤2000) уншилт — `orderByFields` + `resultOffset`.
 *  5. ХАРИУ АЛДАГДСАН нэмэлтийг сохроор дахин илгээж ДАВХАРДУУЛАХ — GlobalID / тоогоор шалгана.
 *  6. `invalidate('HABEA')` зөвхөн амжилтад — алдагдсан хариунд карт хуучин үлдэнэ.
 */
import assert from 'node:assert/strict';

const R = await import('./habeaRegisters.ts');
const { prevWeek } = await import('../modules/habeaUzleg.tsx');
const { dataVersion } = await import('./dataBus.ts');

/* ══════════ 1. UB долоо хоног ══════════ */
{
  const now = new Date(Date.parse('2026-09-14T00:30:00+08:00')); // Даваа 00:30 UB (UTC-ээр Ням)
  const w = R.lastFullWeek(now);
  assert.equal(w.start.toISOString(), new Date(Date.parse('2026-09-07T00:00:00+08:00')).toISOString(), 'эхлэл = өмнөх Даваа 00:00 UB');
  assert.equal(w.end.toISOString(), new Date(Date.parse('2026-09-14T00:00:00+08:00')).toISOString());
  assert.deepEqual(w, prevWeek(now), 'habeaUzleg.prevWeek-тэй НЭГ дүрэм');
  assert.ok(R.isWeekNo(1) && R.isWeekNo(53) && !R.isWeekNo(0) && !R.isWeekNo(54) && !R.isWeekNo(null) && !R.isWeekNo(2.5));
  assert.match(R.newGlobalId(), /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
}

/* ══════════ Хуурамч ArcGIS ══════════ */
const calls = [];
let handler = () => ({});
const realF = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const p = Object.fromEntries(u.searchParams);
  if (init?.body) Object.assign(p, Object.fromEntries(new URLSearchParams(String(init.body))));
  const path = decodeURIComponent(u.pathname);
  calls.push({ path, p });
  const body = await handler(path, p);
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
const lose = () => { throw new TypeError('fetch failed'); };

try {
  /* ══════════ 2–3. Бүртгэлийн тоо — кэш долоо хоногоор, count алга → null ══════════ */
  {
    calls.length = 0;
    handler = (path) => (path.endsWith('/35/query') ? {} : { count: 4 });
    const a = await R.loadHabeaRegisters(new Date(Date.parse('2026-09-14T10:00:00+08:00')));
    assert.equal(a.rows.find((r) => r.key === 'zaavar').week, null, 'count алга → null (0 БИШ)');
    assert.equal(a.rows.find((r) => r.key === 'sanuulah').week, 4);
    assert.equal(a.rows.find((r) => r.key === 'ayul').week, null, 'эх сурвалжгүй → null');
    assert.match(calls[0].p.where, /timestamp '2026-09-06 16:00:00'/, 'хил UB Даваа 00:00 = UTC Ням 16:00');
    const n1 = calls.length;
    await R.loadHabeaRegisters(new Date(Date.parse('2026-09-14T11:00:00+08:00')));
    assert.equal(calls.length, n1, 'ижил долоо хоног — кэшээс');
    const b = await R.loadHabeaRegisters(new Date(Date.parse('2026-09-21T09:00:00+08:00')));
    assert.ok(calls.length > n1, 'шинэ долоо хоног — TTL дотор ч ДАХИН татна');
    assert.equal(b.weekNo, 38);
  }

  /* ══════════ 3–4. Хог хаягдал — хуудаслалт, хоосон нүд/Week ══════════ */
  {
    calls.length = 0;
    handler = (path, p) => {
      if (!path.endsWith('/query')) return {};
      if (p.resultOffset === '0') {
        return {
          exceededTransferLimit: true,
          features: [
            { attributes: { FID: 1, Week: 40, Metric: 'Бетон (рейс)', Багц_1: 2, Багц_2: null } },
            { attributes: { FID: 2, Week: null, Metric: 'Бетон (рейс)', Багц_1: null, Багц_2: 0 } },
          ],
        };
      }
      return { features: [{ attributes: { FID: 3, Week: 41, Metric: 'Ахуйн хог (рейс)', Багц_1: null } }] };
    };
    const d = await R.loadHabeaWaste(new Date('2026-10-09T12:00:00+08:00'));
    assert.equal(calls.length, 2, 'хоёр хуудас');
    assert.equal(calls[0].p.orderByFields, 'FID', 'хуудаслалт OID-ээр эрэмбэлнэ');
    assert.equal(calls[1].p.resultOffset, '2');
    assert.deepEqual(d.weeks, [40, 41], 'хоосон Week → 0-р долоо хоног БИШ');
    /* ⚠️ 2026-10-09: карт ЗӨВХӨН өмнөх бүтэн долоо хоногийг (40) нийлүүлнэ */
    assert.equal(d.weekNo, 40, 'өмнөх бүтэн долоо хоног');
    const beton = d.rows.find((r) => r.metric === 'Бетон (рейс)').byPkg;
    assert.equal(beton['Багц 1'], 2, '40-р долоо хоногийн мөр');
    assert.equal('Багц 2' in beton, false, 'хоосон нүд 0 болж нэмэгдэхгүй; Week хоосон мөр орохгүй (null ≠ 0)');
    assert.equal(d.rows.find((r) => r.metric === 'Ахуйн хог (рейс)'), undefined, '41-р долоо хоног орохгүй');
  }

  /* ══════════ 5–6. Бүртгэл нэмэх — GlobalID ══════════ */
  const edits = () => calls.filter((c) => c.path.endsWith('/applyEdits'));
  {
    const gid = R.newGlobalId();
    /* амжилт — useGlobalIds + клиентийн GlobalID; дугаарыг бичихийн өмнө дахин бодно */
    calls.length = 0;
    handler = (path, p) => {
      if (path.endsWith('/applyEdits')) return { addResults: [{ success: true, objectId: 9, globalId: gid }] };
      if (p.outStatistics) return { features: [{ attributes: { m: 41 } }] };
      return { count: 0 };
    };
    let v0 = dataVersion();
    await R.addRegister(35, { Огноо: 1 }, gid, { autoSeq: 'F_' });
    const e = edits()[0];
    assert.equal(e.p.useGlobalIds, 'true');
    const att = JSON.parse(e.p.adds)[0].attributes;
    assert.equal(att.GlobalID, gid);
    assert.equal(att.F_, 42, 'санал болгосон дугаар бичихийн ӨМНӨ дахин бодогдоно');
    assert.ok(dataVersion() > v0, 'амжилтад invalidate');

    /* хариу алдагдсан → GlobalID-аар асууна; олдвол амжилт, ДАХИН ИЛГЭЭХГҮЙ */
    calls.length = 0;
    handler = (path) => (path.endsWith('/applyEdits') ? lose() : { count: 1 });
    await R.addRegister(35, { Огноо: 1 }, gid);
    assert.equal(edits().length, 1, 'нэг л илгээлт');
    const q = calls.filter((c) => c.path.endsWith('/query')).at(-1);
    assert.equal(q.p.where, `GlobalID = '${gid}'`);

    /* хариу алдагдсан, мөр олдсонгүй → тодорхойгүй (HabeaLostWrite), invalidate хийгдэнэ */
    calls.length = 0;
    handler = (path) => (path.endsWith('/applyEdits') ? lose() : { count: 0 });
    v0 = dataVersion();
    await assert.rejects(() => R.addRegister(35, { Огноо: 1 }, gid), (x) => x instanceof R.HabeaLostWrite);
    assert.ok(dataVersion() > v0, 'алдагдсан хариунд ч invalidate (finally)');

    /* дахин дарсан (retry) — мөр аль хэдийн байвал applyEdits ЯВАХГҮЙ */
    calls.length = 0;
    handler = () => ({ count: 1 });
    await R.addRegister(35, { Огноо: 1 }, gid, { retry: true });
    assert.equal(edits().length, 0, 'дахин илгээхгүй');

    /* давхар GlobalID-ийн татгалзал (хоцорч суусан анхны бичилт) → мөр байвал амжилт */
    calls.length = 0;
    handler = (path) => (path.endsWith('/applyEdits')
      ? { addResults: [{ success: false, error: { description: 'duplicate GlobalID' } }] } : { count: 1 });
    await R.addRegister(35, { Огноо: 1 }, gid, { retry: true });

    /* тодорхой татгалзал — мөр байхгүй → шалтгаантай алдаа */
    handler = (path) => (path.endsWith('/applyEdits')
      ? { addResults: [{ success: false, error: { description: 'locked' } }] } : { count: 0 });
    await assert.rejects(() => R.addRegister(35, { Огноо: 1 }, gid), /locked/);
    /* хоосон хариу — амжилт БИШ */
    handler = (path) => (path.endsWith('/applyEdits') ? {} : { count: 0 });
    await assert.rejects(() => R.addRegister(35, { Огноо: 1 }, gid));
  }

  /* ══════════ 5. Хог хаягдал нэмэх — GlobalID-гүй, тоогоор ══════════ */
  {
    const cols = { Багц_1: 3, Багц_2: null, Багц_3_1: null, Багц_3_2: null, Багц_3_3: null, Багц_4_1: null, Багц_4_2: 0 };
    await assert.rejects(() => R.addWaste(0, 'Бетон (рейс)', cols), /1–53/, 'долоо хоног 1–53');
    await assert.rejects(() => R.addWaste(54, 'Бетон (рейс)', cols));

    /* хариу алдагдсан, тоо өссөн → амжилт */
    calls.length = 0;
    let cnt = 2;
    handler = (path) => {
      if (path.endsWith('/applyEdits')) { cnt += 1; return lose(); }
      return { count: cnt };
    };
    await R.addWaste(41, 'Бетон (рейс)', cols);
    const w = calls.find((c) => c.path.endsWith('/query')).p.where;
    assert.match(w, /Week = 41 AND Metric = N'Бетон \(рейс\)' AND Багц_1 = 3 AND Багц_2 IS NULL/, 'хоосон нүд IS NULL (0 БИШ)');
    assert.match(w, /Багц_4_2 = 0/);
    const add = JSON.parse(edits()[0].p.adds)[0].attributes;
    assert.equal(add.Багц_2, null, 'хоосон нүд null бичигдэнэ');

    /* хариу алдагдсан, тоо өсөөгүй → HabeaLostWrite (before, sig) */
    handler = (path) => (path.endsWith('/applyEdits') ? lose() : { count: 5 });
    let lost;
    await assert.rejects(() => R.addWaste(41, 'Бетон (рейс)', cols), (x) => { lost = x; return x instanceof R.HabeaLostWrite; });
    assert.equal(lost.before, 5);
    assert.ok(lost.sig);

    /* ижил утгаар дахин дарсан — хоцорч суусан бол (тоо 6) applyEdits ЯВАХГҮЙ */
    calls.length = 0;
    handler = () => ({ count: 6 });
    await R.addWaste(41, 'Бетон (рейс)', cols, { before: lost.before, sig: lost.sig });
    assert.equal(edits().length, 0, 'давхардуулахгүй');
  }
} finally {
  globalThis.fetch = realF;
}

console.log('✅ habeaRegisters — UB долоо хоног · кэш · null ≠ 0 · хуудаслалт · алдагдсан хариу давхардахгүй');
