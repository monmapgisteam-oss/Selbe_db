/**
 * «ГЭРЭЭГҮЙ АЖИЛ» KPI — цэвэр тооцооны тест, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/uncontracted.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ДУТУУ БҮРТГЭЛ «гэрээгүй» гэж тоологдох — дүн бичсэн ч гүйцэтгэгчгүй
 *      мөр улаан тоонд орж, гэрээгүй ажлын тоо хөөрөгдөнө.
 *   2. Σ төсөв: төсөвгүй мөр 0 гэж орох, эсвэл бүгд төсөвгүй үед 0 гарах.
 *   3. Эхлэх хугацаа өнгөрсөн ажил ЭХЭНД байхгүй — CEO хамгийн хоцорсныг
 *      жагсаалтын доороос хайх.
 *   4. Түвшин: хоцорсон байхад `warn`, мөр байхгүйд `good` гарах.
 *   5. Жагсаалт ЧИМЭЭГҮЙ тасрах — 300-аас дээш мөрд тасалсан тоо ил байх ёстой.
 *   6. ХАСАГДСАН ажил (тайлбар «хийгдэхгүй» / «хөрөнгө оруулалтаас хасах» /
 *      «хөрөнгө оруулалт руу оруулахгүй») гэрээгүй/дутуу тоонд орж улаан болох,
 *      Σ төсвийг хөөрөгдөх — эсвэл эсрэгээр ЧИМЭЭГҮЙ алга болох (факт + 3-р
 *      хүснэгтэд нэрээр нь байх ёстой).
 *   7. Ганц «хасах»/«хасуулах» үг («НӨАТ хасах дүн») мөрийг хасагдсан болгож
 *      жинхэнэ гэрээгүй ажлыг n/Σ-ээс чимээгүй гаргах.
 *   8. Огноо `format.date()`-ээс ӨӨР хэлбэрээр (ISO) гарч ipc картаас зөрөх.
 */
import assert from 'node:assert/strict';
import {
  computeUncontracted, contractOf, isCancelled, isInconsistent, isUncontracted,
} from './uncontracted.ts';
import { ROW_CAP } from './kpi.ts';
import { date } from '../format.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 6);

/** CASHFLOW_NEW-ийн түүхий мөр — талбарын нэрс `services.ts`-тэй ижил */
const row = (o = {}) => ({
  OBJECTID: 1,
  ajil_tuvshin2: 'БАРИЛГА УГСРАЛТ',
  ajil_tuvshin1: 'Төсөл',
  /* ⚠️ Cashflow_0909-д багцын багана НЭГ — хуучин Bagts/Ded_bagts нэгдсэн */
  bagts: 'БАГЦ-16',
  ajil_uilchilgee: 'Ажил',
  ho_dun_geree: null,
  ho_dungiin_tailbar: null,
  ehleh_ognoo: null,
  duusah_ognoo: null,
  guitsetgegch: null,
  geree_dugaar: null,
  geree_dun: null,
  ...o,
});

/* ── 1. isUncontracted / isInconsistent ── */
{
  for (const amt of [null, '', 0, '0', -5]) {
    assert.equal(isUncontracted(row({ geree_dun: amt })), true, `дүн=${JSON.stringify(amt)}`);
    assert.equal(isUncontracted(row({ geree_dun: amt, guitsetgegch: '  ' })), true, 'зайтай гүйцэтгэгч = хоосон');
    assert.equal(isInconsistent(row({ geree_dun: amt })), false);
  }
  assert.equal(isUncontracted(row({ geree_dun: 100 })), false);
  assert.equal(isInconsistent(row({ geree_dun: 100 })), true, 'дүн бий, гүйцэтгэгч алга');
  assert.equal(isUncontracted(row({ guitsetgegch: 'ББСМО ХХК' })), false);
  assert.equal(isInconsistent(row({ guitsetgegch: 'ББСМО ХХК' })), true, 'гүйцэтгэгч бий, дүн алга');
  assert.equal(isInconsistent(row({ geree_dun: 100, guitsetgegch: 'ББСМО ХХК' })), false);
  assert.equal(isUncontracted(row({ geree_dun: 100, guitsetgegch: 'ББСМО ХХК' })), false);
}

/* ── 1б. contractOf — дэд багц давамгайлна, нэр хоосон бол төсөл ── */
{
  const c = contractOf(row({ bagts: 'БАГЦ-16.1', ajil_uilchilgee: '', ho_dun_geree: '500' }));
  assert.equal(c.pkg, 'БАГЦ-16.1');
  assert.equal(c.work, 'Төсөл');
  assert.equal(c.budget, 500);
  assert.equal(contractOf(row({ bagts: null })).pkg, '');
  assert.equal(contractOf(row()).budget, null, 'төсөвгүй → null, 0 биш');
}

/* ── 2. Бүтэн тооцоо — холимог мөрүүд ── */
const A = row({ OBJECTID: 1, ajil_uilchilgee: 'A ажил', ho_dun_geree: 100, ehleh_ognoo: NOW - 10 * DAY });
const B = row({ OBJECTID: 2, ajil_uilchilgee: 'B ажил', ho_dun_geree: 500, ehleh_ognoo: NOW + 30 * DAY });
const C = row({ OBJECTID: 3, ajil_uilchilgee: 'C ажил', ho_dun_geree: null });
const D = row({ OBJECTID: 4, ajil_uilchilgee: 'D гэрээтэй', geree_dun: 900, guitsetgegch: 'ББСМО ХХК', ho_dungiin_tailbar: 'Гэрээлсэн дүн' });
const E = row({ OBJECTID: 5, ajil_uilchilgee: 'E дүнтэй', geree_dun: 50, ho_dun_geree: 60 });
const G = row({ OBJECTID: 6, ajil_uilchilgee: 'G гүйцэтгэгчтэй', guitsetgegch: 'Х ХХК', geree_dugaar: 'ХМХ-25/1', ho_dun_geree: 70 });
const H = row({ OBJECTID: 7, ajil_uilchilgee: 'H ажил', bagts: 'БАГЦ-16.2', ho_dun_geree: 20, ehleh_ognoo: NOW - 40 * DAY, duusah_ognoo: NOW + 100 * DAY });
const I = row({ OBJECTID: 8, ajil_uilchilgee: 'I өнөөдөр', ho_dun_geree: 1, ehleh_ognoo: NOW });
{
  const k = computeUncontracted([A, B, C, D, E, G, H, I], NOW);
  assert.equal(k.value, '5', 'гэрээгүй тоо (A B C H I)');
  assert.equal(k.level, 'bad');
  assert.equal(k.asOf, null);
  assert.deepEqual(k.failedSources, []);
  assert.ok(k.facts.some((f) => f.includes('621 ₮')), `Σ төсөв: ${k.facts}`);
  assert.ok(k.facts.some((f) => f.startsWith('2 ')), `эхэлсэн 2 (A, H; I = яг одоо, өнгөрөөгүй): ${k.facts}`);
  assert.ok(k.facts.some((f) => f.includes('2 дутуу')), `дутуу 2: ${k.facts}`);
  for (const f of k.facts) assert.match(f, /\d/, `факт тоогүй: «${f}»`);

  assert.equal(k.tables.length, 2);
  const [t1, t2] = k.tables;
  assert.equal(t1.cols.length, 7);
  assert.equal(t1.rows.length, 5);
  /* Эрэмбэ: эхэлсэн нь (хамгийн эрт эхлэх ёстой байсан нь дээр), дараа нь төсвөөр буурах, төсөвгүй сүүлд */
  assert.deepEqual(t1.rows.map((r) => r[0].v), ['H ажил', 'A ажил', 'B ажил', 'I өнөөдөр', 'C ажил']);
  /* Огноо — `format.date()`-тэй ЯГ ижил текст (mn-MN, ipc карттай нэг хэлбэр), ISO биш */
  assert.deepEqual(t1.rows[0].map((c) => c.v), ['H ажил', 'БАРИЛГА УГСРАЛТ', 'БАГЦ-16.2', 20, date(NOW - 40 * DAY), date(NOW + 100 * DAY), null]);
  assert.doesNotMatch(String(t1.rows[0][4].v), /^\d{4}-\d{2}-\d{2}$/, 'ISO биш, format.date()');
  assert.equal(t1.rows[0][3].kind, 'mnt');
  assert.equal(t1.rows[4][3].v, null, 'төсөвгүй → null нүд («—»), 0 биш');
  assert.equal(t1.rows[4][4].v, null, 'огноогүй → null');

  assert.equal(t2.cols.length, 5);
  assert.deepEqual(t2.rows.map((r) => r[0].v), ['E дүнтэй', 'G гүйцэтгэгчтэй'], 'дүнтэй-гүйцэтгэгчгүй нь эхэнд');
  assert.deepEqual(t2.rows[1].map((c) => c.v), ['G гүйцэтгэгчтэй', 'БАГЦ-16', 'Х ХХК', 'ХМХ-25/1', null]);
  assert.equal(t2.rows[0][4].v, 50);

  assert.equal(k.issues.length, 2);
  assert.ok(k.issues.every((i) => i.tone === 'bad'));
  assert.ok(k.issues[0].text.startsWith('H ажил · БАГЦ-16.2 — 40 хоног'), k.issues[0].text);
  assert.ok(k.issues[1].text.startsWith('A ажил · БАГЦ-16 — 10 хоног'), k.issues[1].text);
}

/* ── 2б. isCancelled — зөвхөн амьд ажиглагдсан БҮТЭН хэллэг, том/жижиг үсэг ялгахгүй ── */
const NOTE_76 = 'Төслийн хөрөнгө оруулалт руу оруулахгүйгээр хасуулах';
{
  assert.equal(isCancelled(row()), false, 'тайлбаргүй');
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: 'Гэрээлсэн дүн' })), false);
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: 'Магадлагдсан дүн' })), false);
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: 'Төслийн хөрөнгө оруулалтаас хасах. Хийгдэхгүй болсон ажил' })), true, 'OID 7');
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: NOTE_76 })), true, 'OID 76');
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: 'ХИЙГДЭХГҮЙ' })), true, 'том үсэг');
  assert.equal(isCancelled(row({ ho_dungiin_tailbar: '  хөрөнгө   оруулалт  руу\tоруулахгүй ' })), true, 'олон зай нэг болно');
  /* Ганц үйл үг ХАНГАЛТГҮЙ — ердийн дүнгийн тайлбар хасагдсан болохгүй */
  for (const s of ['хасах', 'Дүнг хасуулах', 'НӨАТ хасах дүн', 'урьдчилгаа хасуулах', 'Хөрөнгө оруулалт']) {
    assert.equal(isCancelled(row({ ho_dungiin_tailbar: s })), false, `«${s}» хасагдсан биш`);
  }
}

/* ── 2в. Хасагдсан ажил: тоо/Σ/түвшнээс гарна, факт + 3-р хүснэгтэд ил ── */
{
  const NOTE = 'Төслийн хөрөнгө оруулалтаас хасах. Хийгдэхгүй болсон ажил';
  /* гэрээгүй + эхлэх хугацаа өнгөрсөн + том төсөв — хасагдсан тул bad болох ёсгүй */
  const X = row({ OBJECTID: 10, ajil_uilchilgee: 'X хасагдсан', ho_dun_geree: 20000, ehleh_ognoo: NOW - 5 * DAY, ho_dungiin_tailbar: NOTE });
  /* гүйцэтгэгчтэй ч дүнгүй (дутуу) + хасуулах — 2-р хүснэгтэд орох ёсгүй */
  const Y = row({ OBJECTID: 11, ajil_uilchilgee: 'Y хасуулах', ho_dun_geree: 30, guitsetgegch: 'Ү ХХК', ho_dungiin_tailbar: NOTE_76 });
  /* гэрээ бүрэн + «хийгдэхгүй» — энэ картын хамрах хүрээнд огт биш */
  const Z = row({ OBJECTID: 12, ajil_uilchilgee: 'Z гэрээтэй', geree_dun: 900, guitsetgegch: 'З ХХК', ho_dungiin_tailbar: 'хийгдэхгүй' });
  /* гэрээгүй + эхэлсэн + ганц «хасах» үгтэй тайлбар — ХАСАГДСАН БИШ, ердийн гэрээгүй хэвээр (bad) */
  const W = row({ OBJECTID: 13, ajil_uilchilgee: 'W НӨАТ', ho_dun_geree: 7, ehleh_ognoo: NOW - 3 * DAY, ho_dungiin_tailbar: 'НӨАТ хасах дүн' });

  const k = computeUncontracted([B, E, X, Y, Z], NOW);
  assert.equal(k.value, '1', 'зөвхөн B гэрээгүй');
  assert.equal(k.level, 'warn', 'X эхэлсэн ч хасагдсан → bad биш');
  assert.ok(k.facts.some((f) => f.includes('500 ₮') && !f.includes('20,500')), `Σ төсөвт X орохгүй: ${k.facts}`);
  assert.ok(k.facts.some((f) => f.startsWith('0 ')), `эхэлсэн 0: ${k.facts}`);
  assert.ok(k.facts.some((f) => f.includes('1 дутуу')), `дутуу 1 (зөвхөн E): ${k.facts}`);
  assert.ok(k.facts.some((f) => f.includes('2 хасагдсан')), `хасагдсан 2 (X, Y): ${k.facts}`);
  assert.equal(k.issues.length, 0, 'хасагдсан ажилд анхааруулга байхгүй');

  const kw = computeUncontracted([B, X, W], NOW);
  assert.equal(kw.value, '2', 'B + W гэрээгүй — «НӨАТ хасах дүн» хасагдсан биш');
  assert.equal(kw.level, 'bad', 'W эхэлсэн → bad');
  assert.ok(kw.facts.some((f) => f.includes('507 ₮')), `Σ = 500 + 7: ${kw.facts}`);
  assert.ok(kw.facts.some((f) => f.includes('1 хасагдсан')), `хасагдсан зөвхөн X: ${kw.facts}`);
  assert.deepEqual(kw.tables[0].rows.map((r) => r[0].v), ['W НӨАТ', 'B ажил']);

  assert.equal(k.tables.length, 3);
  const [t1, t2, t3] = k.tables;
  assert.deepEqual(t1.rows.map((r) => r[0].v), ['B ажил']);
  assert.deepEqual(t2.rows.map((r) => r[0].v), ['E дүнтэй'], 'Y 2-р хүснэгтэд орохгүй');
  assert.equal(t3.cols.length, 4);
  assert.deepEqual(t3.rows.map((r) => r[0].v), ['X хасагдсан', 'Y хасуулах'], 'төсвөөр буурах, Z байхгүй');
  assert.deepEqual(t3.rows[0].map((c) => c.v), ['X хасагдсан', 'БАГЦ-16', 20000, NOTE]);
  assert.equal(t3.rows[0][2].kind, 'mnt');

  /* хасагдсан байхгүй бол факт ч, хүснэгт ч нэмэгдэхгүй */
  const k0 = computeUncontracted([B, E], NOW);
  assert.ok(!k0.facts.some((f) => f.includes('хасагдсан')), `хасагдсан факт гарах ёсгүй: ${k0.facts}`);
  assert.equal(k0.tables.length, 2);
}

/* ── 3. Σ төсөв: бүгд төсөвгүй → факт байхгүй (0 ₮ гэж хэвлэхгүй) ── */
{
  const k = computeUncontracted([C, row({ OBJECTID: 9 })], NOW);
  assert.equal(k.value, '2');
  assert.equal(k.level, 'warn');
  assert.ok(!k.facts.some((f) => f.includes('төсөв')), `төсөв факт гарах ёсгүй: ${k.facts}`);
  assert.ok(k.facts.some((f) => f.startsWith('0 ')), 'эхэлсэн 0');
}

/* ── 4. Түвшин ── */
{
  assert.equal(computeUncontracted([B], NOW).level, 'warn', 'гэрээгүй ч эхлээгүй');
  assert.equal(computeUncontracted([D], NOW).level, 'good', 'бүгд гэрээтэй');
  assert.equal(computeUncontracted([D, E], NOW).level, 'good', 'дутуу бүртгэл түвшинд нөлөөлөхгүй');
  const good = computeUncontracted([D], NOW);
  assert.equal(good.value, '0');
  assert.equal(good.tables.length, 0, 'хоосон хүснэгт зурахгүй');
  assert.equal(good.issues.length, 0);

  const none = computeUncontracted([], NOW);
  assert.equal(none.level, 'unknown');
  assert.equal(none.value, '—');
  assert.deepEqual(none.facts, []);
  assert.deepEqual(none.tables, []);
}

/* ── 5. Хязгаар — тасалсан тоо ИЛ ── */
{
  const many = Array.from({ length: ROW_CAP + 25 }, (_, i) => row({ OBJECTID: i + 1, ajil_uilchilgee: `Ажил ${i}`, ho_dun_geree: i }));
  const k = computeUncontracted(many, NOW);
  assert.equal(k.value, String(ROW_CAP + 25));
  const t1 = k.tables[0];
  assert.equal(t1.rows.length, ROW_CAP + 1);
  const tail = t1.rows[ROW_CAP];
  assert.equal(tail.length, 7);
  assert.match(String(tail[0].v), /25/);
  assert.equal(t1.rows[0][0].v, `Ажил ${ROW_CAP + 24}`, 'төсвөөр буурах');
}

console.log('uncontracted.check: OK');
