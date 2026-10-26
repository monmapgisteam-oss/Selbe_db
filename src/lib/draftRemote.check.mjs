/**
 * `draftRemote.ts`-ийн ЗАН ҮЙЛИЙН шалгуур — хуурамч ArcGIS хүснэгт дээр ЖИНХЭНЭ экспортыг ажиллуулна (2026-10-26, аудит T2).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/draftRemote.check.mjs
 *
 * ⚠️ ЯАГААД: урьд энэ модульд зөвхөн эх текстийн (readFileSync) шалгуур байв (`sharedDraft` · `shareDraft` · `draft`
 *    check) — кодын мөр байгаа эсэхийг хардаг, ажиллахыг биш. Энд upsert · давхардал цэвэрлэх · optimistic lock
 *    (`expectAt`) · бичсэний дараах баталгаа · 200-аар ирдэг мөрийн алдаа · хуучин түлхүүрийн шилжүүлэлт · эзний шалгалт
 *    (super биш бол хүснэгт ҮҮСГЭХГҮЙ) зэргийг бодит дуудлагаар шалгана. Хүснэгт — `arcgisFake.mjs` (санах ой).
 * ⚠️ Модулийн кэш (`tableUrlCache` — зөвхөн ОЛДСОН хаяг) тул алхмуудын ДАРААЛАЛ чухал: олдоогүй/эзэн зөрсөн тохиолдлыг
 *    хүснэгт олдохоос ӨМНӨ шалгана.
 */
import assert from 'node:assert/strict';
import { fake, addTable, assertNoUnexpected } from './arcgisFake.mjs';

const D = await import('@/lib/draftRemote.ts');

const SVC = 'https://fake.arcgis.local/server/rest/services/Selbe_Guitsetgel_Draft/FeatureServer';
const URL0 = `${SVC}/0`;
const SUPER = 'tumenjargal_monmap'; // `tools/test-users.mjs` — super
const PLAIN = 'selbe_et'; //          — beginner (хүснэгт үүсгэх эрхгүй)
const T = addTable(URL0, { fields: ['OBJECTID', 'dkey', 'usr', 'pkg', 'at', 'payload'] });
const rowsOf = (k) => T.rows.filter((r) => r.dkey === k);
const lastSdk = () => fake.log.filter((x) => x.via === 'sdk').at(-1);

/* ── 1. Нэвтрээгүй — сүлжээ огт хөндөхгүй, «алдаа биш» гэж ялгана ── */
{
  fake.cred = null;
  assert.equal(await D.readRemoteDraftAt('b32'), null, 'нэвтрээгүй: at = null (undefined БИШ)');
  assert.deepEqual(await D.readRemoteDraft('b32'), { ok: true, draft: null });
  const s = await D.saveRemoteDraft('b32', 1, '{}');
  assert.equal(s.ok, false);
  assert.match(s.error, /нэвтрээгүй/);
  assert.equal(await D.clearRemoteDraft('b32'), false);
  assert.equal(fake.log.length, 0, 'нэвтрээгүй үед ArcGIS руу хүсэлт явав');
  console.log('✅ нэвтрээгүй — null / {ok:true,draft:null} / «нэвтрээгүй», сүлжээгүй');
}

/* ── 2. Хэт том ноорог — алсад ЯВАХГҮЙ (локалд үлдэнэ) ── */
{
  fake.cred = { token: 't', userId: SUPER };
  const s = await D.saveRemoteDraft('b32', 1, 'x'.repeat(D.REMOTE_MAX + 1));
  assert.equal(s.ok, false);
  assert.match(s.error, /хэт том/);
  assert.equal(fake.log.length, 0, 'хэт том ноорог сүлжээнд хүрэв');
  console.log('✅ REMOTE_MAX-аас том — сүлжээгүй татгалзав');
}

/* ── 3. Хүснэгт олдохгүй + super БИШ — үүсгэхийг оролдохгүй ── */
{
  fake.cred = { token: 't', userId: PLAIN };
  fake.searchResults = [];
  const s = await D.saveRemoteDraft('b32', 1, '{}');
  assert.equal(s.ok, false);
  assert.match(s.error, /олдсонгүй/);
  assert.equal(fake.count('search'), 1, 'хайлт нэг удаа');
  assert.ok(!fake.log.some((x) => /createService/.test(x.url)), 'super биш хэрэглэгч хүснэгт үүсгэх гэж оролдов');
  assertNoUnexpected(assert);
  console.log('✅ хүснэгтгүй + энгийн хэрэглэгч — «олдсонгүй», createService ДУУДАХГҮЙ');
}

/* ── 4. Ижил нэртэй item-ийн эзэн танигдахгүй — бичихгүй, үүсгэхгүй ── */
{
  fake.cred = { token: 't', userId: SUPER };
  fake.searchResults = [{ title: 'Selbe_Guitsetgel_Draft', url: SVC, owner: 'stranger_xx' }];
  const s = await D.saveRemoteDraft('b32', 1, '{}');
  assert.equal(s.ok, false);
  assert.match(s.error, /эзэн танигдсангүй/);
  assert.equal(T.rows.length, 0);
  assert.ok(!fake.log.some((x) => /createService/.test(x.url)), 'эзэн зөрсөн үед хүснэгт үүсгэх гэж оролдов');
  console.log('✅ эзэн танигдахгүй — бичихгүй, үүсгэхгүй');
}

/* ── 5. Хүснэгт олдов — upsert (нэмэх → шинэчлэх) ── */
fake.searchResults = [{ title: 'Selbe_Guitsetgel_Draft', url: SVC, owner: SUPER }];
{
  let s = await D.saveRemoteDraft('b32', 100, '{"a":1}');
  assert.deepEqual(s, { ok: true });
  assert.equal(rowsOf('b32').length, 1);
  const r = rowsOf('b32')[0];
  assert.deepEqual({ dkey: r.dkey, usr: r.usr, pkg: r.pkg, at: r.at, payload: r.payload },
    { dkey: 'b32', usr: SUPER, pkg: 'b32', at: 100, payload: '{"a":1}' });
  /* Хоёр дахь бичилт ИЖИЛ мөрийг шинэчилнэ */
  fake.cred = { token: 't', userId: SUPER.toUpperCase() };
  s = await D.saveRemoteDraft('b32', 200, '{"a":2}');
  assert.deepEqual(s, { ok: true });
  assert.equal(rowsOf('b32').length, 1, 'дахин бичихэд шинэ мөр нэмэгдэв');
  assert.equal(rowsOf('b32')[0].payload, '{"a":2}');
  assert.equal(rowsOf('b32')[0].usr, SUPER, '`usr` жижиг үсгээр (сүүлд бичсэн хүн)');
  console.log('✅ upsert — эхэндээ нэмнэ, дараа нь ижил мөрийг шинэчилнэ; usr жижиг үсгээр');
}

/* ── 6. Уншилт — at · payload; `readRemoteDraftAt` нь payload ТАТАХГҮЙ ── */
{
  assert.deepEqual(await D.readRemoteDraft('b32'), { ok: true, draft: { at: 200, payload: '{"a":2}' } });
  assert.deepEqual(await D.loadRemoteDraft('b32'), { at: 200, payload: '{"a":2}' });
  assert.equal(await D.readRemoteDraftAt('b32'), 200);
  assert.deepEqual(lastSdk().params.outFields, ['OBJECTID', 'at'], 'readRemoteDraftAt payload-ыг асуув (хямд шалгалт биш болсон)');
  assert.equal(await D.readRemoteDraftAt('b99'), null, 'мөргүй — null');
  console.log('✅ уншилт — бүтэн ба зөвхөн at (payload-гүй)');
}

/* ── 7. Давхардсан мөр — уншилт СҮҮЛИЙН (их OID), бичилт давхардлыг устгана ── */
{
  T.insert({ dkey: 'b32', usr: 'x', pkg: 'b32', at: 300, payload: '{"dupe":1}' });
  assert.equal(rowsOf('b32').length, 2);
  assert.deepEqual((await D.readRemoteDraft('b32')).draft, { at: 300, payload: '{"dupe":1}' }, 'давхардалд сүүлийнх ялах ёстой');
  const keep = Math.max(...rowsOf('b32').map((r) => r.OBJECTID));
  const s = await D.saveRemoteDraft('b32', 400, '{"a":4}');
  assert.deepEqual(s, { ok: true });
  assert.deepEqual(rowsOf('b32').map((r) => r.OBJECTID), [keep], 'давхардал цэвэрлэгдээгүй эсвэл буруу мөр үлдэв');
  assert.equal(rowsOf('b32')[0].payload, '{"a":4}');
  console.log('✅ давхардал — сүүлийнх уншигдана, бичихэд нэг мөр үлдэнэ');
}

/* ── 8. Optimistic lock (`expectAt`) ── */
{
  const edits0 = fake.count('sdk', 'applyEdits');
  let s = await D.saveRemoteDraft('b32', 500, '{"lost":1}', { expectAt: 123 });
  assert.equal(s.ok, false);
  assert.equal(s.conflict, true);
  assert.equal(fake.count('sdk', 'applyEdits'), edits0, 'зөрсөн expectAt-тай үед бичилт явав');
  assert.equal(rowsOf('b32')[0].payload, '{"a":4}', 'зөрчилтэй бичилт өгөгдлийг өөрчлөв');
  s = await D.saveRemoteDraft('b32', 500, '{"a":5}', { expectAt: 400 });
  assert.deepEqual(s, { ok: true });
  assert.equal(rowsOf('b32')[0].at, 500);
  /* Мөр байхгүй үед `expectAt: null` = «хоосон гэж уншсан» → нэмнэ */
  s = await D.saveRemoteDraft('b40', 10, '{}', { expectAt: null });
  assert.deepEqual(s, { ok: true });
  assert.equal(rowsOf('b40').length, 1);
  console.log('✅ expectAt — зөрвөл бичихгүй (conflict), таарвал бичнэ, мөргүйд null → нэмнэ');
}

/* ── 9. Бичсэний дараах баталгаа — завсарт өөр хүн дарж бичсэн ── */
{
  let once = true;
  fake.afterEdit = (t) => {
    if (!once || t !== T) return;
    once = false;
    const r = t.rows.find((x) => x.dkey === 'b32');
    r.at = 777; r.payload = '{"other":1}';
  };
  const s = await D.saveRemoteDraft('b32', 600, '{"mine":1}', { expectAt: 500 });
  fake.afterEdit = null;
  assert.equal(s.ok, false);
  assert.equal(s.conflict, true);
  assert.equal(s.written, true, 'бидний бичилт буусан гэдгийг дуудагчид хэлэх ёстой');
  /* Blind overwrite (`expectAt`-гүй) — дараах шалгалтгүй, хуучин зан */
  const n0 = fake.count('sdk', 'query');
  assert.deepEqual(await D.saveRemoteDraft('b32', 700, '{"a":7}'), { ok: true });
  assert.equal(fake.count('sdk', 'query') - n0, 1, 'expectAt-гүй бичилт дараах шалгалт хийв');
  console.log('✅ бичсэний дараа at зөрвөл conflict + written; blind бичилт шалгалтгүй');
}

/* ── 10. Мөрийн алдаа (200 + error) — амжилт гэж үзэхгүй ── */
{
  T.failWrites = true;
  const s = await D.saveRemoteDraft('b32', 800, '{}');
  assert.equal(s.ok, false);
  assert.match(s.error, /ArcGIS татгалзав/);
  assert.equal(await D.clearRemoteDraft('b32'), false, 'устгалтын мөрийн алдаа амжилт гэж тоологдов');
  assert.equal(rowsOf('b32').length, 1);
  T.failWrites = false;
  console.log('✅ мөрийн алдаа — save ok:false, clear false');
}

/* ── 11. Уншилт унав — «байхгүй» гэж андуурахгүй ── */
{
  T.failReads = true;
  const r = await D.readRemoteDraft('b32');
  assert.equal(r.ok, false, 'уншилтын алдааг «ноорог алга» гэж нуув');
  assert.equal(await D.readRemoteDraftAt('b32'), undefined, 'уншилт унахад undefined (null БИШ)');
  assert.equal(await D.loadRemoteDraft('b32'), null);
  assert.deepEqual(await D.readLegacyDrafts('b32'), []);
  const s = await D.saveRemoteDraft('b32', 900, '{}');
  assert.equal(s.ok, false, 'урьдчилсан уншилт унахад бичилт амжилттай гэж хэлэв');
  T.failReads = false;
  console.log('✅ уншилт унав — ok:false / undefined / null / []');
}

/* ── 12. Устгал — зөвхөн тэр түлхүүрийн БҮХ мөр ── */
{
  T.insert({ dkey: 'b32', usr: 'y', pkg: 'b32', at: 1, payload: '{}' });
  assert.equal(rowsOf('b32').length, 2);
  assert.equal(await D.clearRemoteDraft('b32'), true);
  assert.equal(rowsOf('b32').length, 0);
  assert.equal(rowsOf('b40').length, 1, 'өөр багцын ноорог устав');
  assert.equal(await D.clearRemoteDraft('b32'), true, 'мөргүй устгал — амжилт');
  console.log('✅ clearRemoteDraft — түлхүүрийн бүх мөр, бусдыг хөндөхгүй');
}

/* ── 13. Хуучин түлхүүр (`хэрэглэгч|багц`) — илгээлтийн мөрийг (`sub|` · `done|`) ОРУУЛАХГҮЙ ── */
{
  T.insert({ dkey: 'ana|b50', usr: 'Ana', pkg: 'b50', at: 11, payload: '{"l":1}' });
  T.insert({ dkey: 'bob|b50', pkg: 'b50', at: 12, payload: '{"l":2}' });
  T.insert({ dkey: 'sub|b50', pkg: 'b50', at: 13, payload: '{"sub":1}' });
  T.insert({ dkey: 'done|b50|7', pkg: 'b50', at: 14, payload: '{"done":1}' });
  T.insert({ dkey: 'ana|b500', pkg: 'b500', at: 15, payload: '{"other":1}' });
  const leg = await D.readLegacyDrafts('b50');
  assert.deepEqual(leg, [{ at: 11, payload: '{"l":1}', user: 'ana' }, { at: 12, payload: '{"l":2}', user: 'bob' }]);
  assert.equal(await D.clearLegacyDrafts('b50'), true);
  assert.deepEqual(T.rows.filter((r) => String(r.dkey).includes('b50')).map((r) => r.dkey).sort(), ['ana|b500', 'done|b50|7', 'sub|b50'],
    'clearLegacyDrafts илгээлтийн/өөр багцын мөрийг устгав');
  console.log('✅ хуучин түлхүүр — sub|/done| ба өөр багц хөндөгдөхгүй');
}

/* ── 14. Түлхүүрт хашилт — SQL escape ── */
{
  assert.deepEqual(await D.saveRemoteDraft("b'x", 5, '{"q":1}'), { ok: true });
  assert.deepEqual((await D.readRemoteDraft("b'x")).draft, { at: 5, payload: '{"q":1}' });
  assert.equal(D.sqlStr("a'b"), "'a''b'");
  console.log('✅ хашилттай түлхүүр — бичих/унших');
}

assertNoUnexpected(assert);
console.log(`✅ draftRemote: зан үйлийн шалгуур давлаа (хуурамч хүснэгтэд ${fake.count('sdk', 'applyEdits')} бичилт)`);
