/**
 * ЗӨВШӨӨРӨЛ — ХООСОН ТӨЛӨВ · ТӨЛӨВИЙН ШҮҮЛТ · УДАЖ БУЙ «ХҮЛЭЭГДЭЖ БУЙ» (сүлжээгүй).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zovshoorolPending.check.mjs
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас). `zovshoorol.check.mjs` нь АМЬД
 * үйлчилгээ шаарддаг (токенгүй бол бүхэлдээ алгасагдана) тул цэвэр логикийг
 * ЭНД тусад нь — токенгүй машин дээр ч ажиллана.
 *
 * Хамгаалж буй алдаа:
 *  1. Хүлээлтийн насыг `ognoo`-оор тоолох — тэр нь ШИЙДВЭРЛЭСЭН огноо тул
 *     «Хүлээгдэж буй» мөрд хоосон; нас нь Editor Tracking-ийн `CreationDate`.
 *  2. Бүртгэгдсэн цаг мэдэгдэхгүй мөрийг «0 хоног» (= шинэ) гэж үзэх — `null`.
 *  3. Зөвшөөрөл 0 үед хуудас толгойтой хоосон үлдэх (хоосон төлөв алга байв).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TOLOV, PENDING_STALE_DAYS, pendingAgeDays, isStalePending, filterZov, summarize,
  sinceFieldsOf, sinceOf,
} from './zovshoorol.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1, 12);
const z = (o) => ({
  oid: 1, bagts: 'Багц 1', shat: 1, ner: 'x', selbe: '', tolov: TOLOV.wait, ognoo: null,
  dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '', since: null, ...o,
});

/* ══════════════ 1. Босго ══════════════ */
assert.equal(PENDING_STALE_DAYS, 30, 'анхдагч босго 30 хоног');

/* ══════════════ 2. Нас ══════════════ */
assert.equal(pendingAgeDays(z({ since: NOW - 45 * DAY }), NOW), 45);
assert.equal(pendingAgeDays(z({ since: null }), NOW), null, 'бүртгэгдсэн цаг алга → null (0 БИШ)');
assert.equal(pendingAgeDays(z({ tolov: TOLOV.ok, since: NOW - 90 * DAY }), NOW), null, 'шийдвэрлэсэн нь хүлээгдээгүй');
assert.equal(pendingAgeDays(z({ since: NOW + DAY }), NOW), 0, 'ирээдүйн тамга сөрөг нас өгөхгүй');

/* ══════════════ 3. Удаж буй эсэх ══════════════ */
assert.ok(isStalePending(z({ since: NOW - 31 * DAY }), NOW), '31 хоног → удаж буй');
assert.ok(!isStalePending(z({ since: NOW - 30 * DAY }), NOW), '30 хоног → хараахан биш («-аас ИЛҮҮ»)');
assert.ok(!isStalePending(z({ since: null }), NOW), 'нас мэдэгдэхгүй → тэмдэглэхгүй');
assert.ok(!isStalePending(z({ tolov: TOLOV.no, since: NOW - 99 * DAY }), NOW));
assert.ok(isStalePending(z({ since: NOW - 8 * DAY }), NOW, 7), 'босгыг өөрчилж болно');
console.log('✅ хүлээлтийн нас ба «удаж буй» босго');

/* ══════════════ 4. Шүүлт ══════════════ */
const rows = [
  z({ oid: 1, since: NOW - 60 * DAY }),
  z({ oid: 2, since: NOW - 5 * DAY }),
  z({ oid: 3, tolov: TOLOV.ok, ognoo: NOW }),
  z({ oid: 4, tolov: TOLOV.no, ognoo: NOW }),
  z({ oid: 5, tolov: 'unknown' }),
  z({ oid: 6, since: null }),
];
const ids = (f) => filterZov(rows, f, NOW).map((r) => r.oid);
assert.deepEqual(ids('all'), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(ids('wait'), [1, 2, 6]);
assert.deepEqual(ids('stale'), [1]);
assert.deepEqual(ids('ok'), [3]);
assert.deepEqual(ids('no'), [4]);
assert.deepEqual(ids('unknown'), [5]);
console.log('✅ төлөвийн шүүлт');

/* ══════════════ 5. Хураангуй ══════════════ */
const sm = summarize(rows, NOW);
assert.equal(sm.stale, 1);
assert.equal(sm.wait, 3, '`stale` нь `wait`-ийн дэд олонлог — давхар тоолохгүй');
assert.equal(sm.ok + sm.wait + sm.no + sm.unknown, sm.total);
assert.equal(summarize(rows).stale, 0, '`now`-гүй дуудагчид (CEO, тайлан) өөрчлөгдөхгүй');
/* ⚠️ Хүлээлт нь хэвийн явц — `alert`-ийг (улаан багц) өдөөхгүй */
assert.equal(summarize([rows[0]], NOW).alert, false);
console.log('✅ хураангуй: удаж буй тоо, alert өөрчлөгдөөгүй');

/* ══════════════ 6. Editor Tracking-ийн талбар — метадатагаас ══════════════ */
const sf = sinceFieldsOf({
  editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' },
});
assert.deepEqual(sf, { created: 'CreationDate', edited: 'EditDate' });
assert.equal(sinceFieldsOf({ editFieldsInfo: null }), null, 'тохиргоо унтраалттай → null');
assert.equal(sinceFieldsOf(null), null);
assert.equal(sinceOf({ CreationDate: 100, EditDate: 200 }, sf), 100, 'ҮҮСГЭСЭН огноо давамгайлна');
assert.equal(sinceOf({ CreationDate: null, EditDate: 200 }, sf), 200, 'үүсгэсэн алга → сүүлд зассан');
assert.equal(sinceOf({ CreationDate: null, EditDate: null }, sf), null);
assert.equal(sinceOf({ CreationDate: 0 }, sf), null, '0 тамга = огноо алга');
assert.equal(sinceOf({ CreationDate: 100 }, null), null, 'метадатагүй → null');
console.log('✅ бүртгэгдсэн цаг: CreationDate → EditDate → null');

/* ══════════════ 7. Харагдац — хоосон төлөв, шүүлт, тэмдэглэгээ (эх код) ══════════════ */
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const src = strip(fs.readFileSync('src/modules/Zovshoorol.tsx', 'utf8'));
  assert.match(src, /rows\.length === 0 \?/, 'Зөвшөөрөл: 0 мөрийн салаа алга');
  assert.match(src, /tr\('Зөвшөөрөл бүртгэгдээгүй'\)/, 'Зөвшөөрөл: хоосон төлөвийн бичвэр');
  assert.match(src, /filterZov\(rows, flt, now\)/, 'Зөвшөөрөл: төлөвийн шүүлт алга');
  assert.match(src, /isStalePending\(z, now\)/, 'Зөвшөөрөл: удаж буй тэмдэглэгээ алга');
  /* ⚠️ `Date.now()` render дотор БИШ — ачаалалтын агшинд */
  assert.doesNotMatch(src.replace(/setNow\(Date\.now\(\)\)/g, ''), /Date\.now\(\)/,
    'Зөвшөөрөл: render доторх Date.now() цэвэр бус');
  /* ⚠️ анивчих нь ЗӨВХӨН «Зөвшөөрөөгүй» */
  const css = fs.readFileSync('src/modules/zovshoorol.module.css', 'utf8');
  const stale = /\.stale\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(stale, '.stale класс алга');
  assert.doesNotMatch(stale, /animation/, 'удаж буй хүлээлт анивчих ёсгүй');
}
console.log('✅ харагдац: хоосон төлөв · шүүлт · тэмдэглэгээ');

/* ══════════════ 8. diffZov — танигдаагүй төлөв, null/'' (2026-10-09) ══════════════ */
{
  const { diffZov, F } = await import('./zovshoorol.ts');
  const row = z({ oid: 9, tolov: 'unknown', dugaar: '', selbe: '', tailbar: '' });
  const draft = (o) => ({ ...row, tolov: TOLOV.wait, ...o });
  assert.deepEqual(diffZov(row, draft({})), { [F.tolov]: TOLOV.wait },
    'танигдаагүй серверийн төлөв ЗААВАЛ бичигдэнэ (сонголт ижил мэт харагдсан ч)');
  assert.deepEqual(diffZov(row, draft({ tolov: null })), {}, 'төлөв сонгоогүй (null) бол бичихгүй');
  const known = z({ oid: 9, tolov: TOLOV.wait, dugaar: '', selbe: '' });
  assert.deepEqual(diffZov(known, { ...known }), {}, "'' ↔ '' — ялгаа алга");
  assert.deepEqual(diffZov(known, { ...known, dugaar: 'A-1' }), { [F.dugaar]: 'A-1' });
  assert.deepEqual(diffZov({ ...known, dugaar: 'A-1' }, { ...known, dugaar: '' }), { [F.dugaar]: null },
    "хоослох нь '' биш null бичнэ");
}
console.log("✅ diffZov: танигдаагүй төлөв · null/'' хэвийншүүлэлт");

/* ══════════════ 9. saveZov — хариуны боловсруулалт (хуурамч post, 2026-10-09) ══════════════ */
{
  const { saveZov, F, TOLOV: T } = await import('./zovshoorol.ts');
  const calls = [];
  let reply = {};
  let dupRows = [];
  const realF = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const p = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
    calls.push({ u, p });
    let body;
    if (u.endsWith('/applyEdits')) body = reply;
    else if (u.endsWith('/query')) body = { features: dupRows.map((a) => ({ attributes: a })) };
    else body = { objectIdField: 'OBJECTID', fields: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body), text: async () => JSON.stringify(body) };
  };
  const draft = { bagts: 'Багц 1', shat: 3, ner: 'Шинэ', selbe: '', tolov: T.wait, ognoo: null,
    dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '' };
  const edits = () => calls.filter((c) => c.u.endsWith('/applyEdits'));
  try {
    /* нэмэх — давхардалгүй → шинэ OID */
    reply = { addResults: [{ success: true, objectId: 42 }] };
    assert.equal(await saveZov(draft), 42);
    const dupQ = calls.find((c) => c.u.endsWith('/query'));
    assert.ok(dupQ, 'нэмэхийн өмнө давхардлыг серверээс асууна');
    assert.match(dupQ.p.where, new RegExp(`${F.bagts} = N'Багц 1' AND ${F.shat} = 3`));
    assert.ok(calls.indexOf(dupQ) < calls.indexOf(edits()[0]), 'асуулт бичилтээс ӨМНӨ');

    /* нэмэх — зэрэгцээ хэрэглэгч ижил дараалал эзэлсэн → бичихгүй, нэрээр нь хэлнэ */
    calls.length = 0;
    dupRows = [{ [F.ner]: 'Хуучин зөвшөөрөл' }];
    await assert.rejects(() => saveZov(draft), /Хуучин зөвшөөрөл/);
    assert.equal(edits().length, 0, 'давхардсан үед applyEdits явахгүй');
    dupRows = [];

    /* серверийн мөрийн татгалзал → шалтгаантай алдаа */
    reply = { addResults: [{ success: false, error: { description: 'locked' } }] };
    await assert.rejects(() => saveZov(draft), /locked/);
    /* хоосон хариу → амжилт БИШ */
    reply = {};
    await assert.rejects(() => saveZov(draft), (e) => e instanceof Error);
    /* 200-аар ирсэн алдаа → шидэнэ */
    reply = { error: { code: 400, message: 'bad', details: [] } };
    await assert.rejects(() => saveZov(draft));

    /* засвар — ялгаагүй бол сүлжээ хөндөхгүй */
    calls.length = 0;
    const before = { ...draft, oid: 7, since: null };
    assert.equal(await saveZov({ ...draft, oid: 7 }, before), 7);
    assert.equal(edits().length, 0, 'өөрчлөлтгүй засвар бичигдэхгүй');
    /* засвар — зөвхөн өөрчлөгдсөн талбар */
    reply = { updateResults: [{ success: true, objectId: 7 }] };
    assert.equal(await saveZov({ ...draft, oid: 7, dugaar: 'Z-9' }, before), 7);
    const ups = JSON.parse(edits()[0].p.updates);
    assert.deepEqual(ups[0].attributes, { OBJECTID: 7, [F.dugaar]: 'Z-9' });
  } finally {
    globalThis.fetch = realF;
  }
}
console.log('✅ saveZov: давхардлын урьдчилсан асуулт · мөрийн татгалзал · хоосон/200 алдаа · зөвхөн ялгаа');

console.log('\nzovshoorolPending.check: ok');
