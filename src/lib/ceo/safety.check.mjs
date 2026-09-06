/**
 * «ХАБЭА — осол, зөрчил» CEO үзүүлэлтийн ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/safety.check.mjs
 *
 * ⚠️ ЛОГИК ХУУЛБАРЛААГҮЙ — жинхэнэ `computeSafety`-г импортлоно. Сүлжээгүй.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. ОГНООГҮЙ бүртгэл 0 (1970) болох — «сүүлийнх 20 000 хоногийн өмнө» гэсэн
 *     худал баримт, `asOf` 0 болох, «сүүлийн 30 хоногт» тоологдох.
 *  1б. `field_22` хоосон мөрийг `CreationDate`-аар огноолохгүй байх — ХАБЭА
 *     хуудас (`Habea.tsx`) ингэж огноолдог тул нэг мөр хоёр газар өөр огноо,
 *     «сүүлийн 30 хоногт» өөр тоо болно (2026-09-06-ны хяналтын олдвор).
 *  2. Хохирлын regex `execTriage.loadDamage`-аас зөрөх — нүүр самбар ба
 *     ХАБЭА хуудас өөр тоо харуулна.
 *  3. Босго: 0 → Сайн, 1–5 → Дунд, 6+ → Яаралтай; хохирол 1–2 → Дунд, 3+ → Яаралтай.
 *  4. Хүснэгт ТОО биш НЭРЭЭР: бүх бүртгэл мөр бүр гарна, шинэ нь эхэнд,
 *     огноогүй нь СҮҮЛД; баганын тоо мөр бүрд таарна.
 *  5. Анхааруулга: сүүлийн 30 хоногийнх улаан, хуучин хохирол шар, хуучин
 *     энгийн — байхгүй; нэг мөр хоёр удаа орохгүй.
 */

import assert from 'node:assert/strict';
import {
  computeSafety, aggregateSafety, toSafetyRow, damageLevel, DAMAGE_RE, RECENT_DAYS, CREATED_FIELD,
} from './safety.ts';
import { DMG_BAD_N, INCIDENT_WARN_MAX } from '../kpiLevels.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 6, 12); // 2026-09-06 12:00Z

const row = (o = {}) => ({
  oid: null, ognoo: null, company: '', bagts: '', dugaar: '', turul: '',
  medeelel: '', shaltgaanTurul: '', shaltgaan: '', argaHemjee: '', ...o,
});

/* ══════════════ 1. Хоосон / огноогүй → null, 0 биш ══════════════ */

{
  const r = computeSafety([], NOW);
  assert.equal(r.value, '0');
  assert.equal(r.level, 'good');
  assert.equal(r.asOf, null, 'мөргүй бол asOf null');
  assert.ok(!r.facts.some((f) => f.includes('хоногийн өмнө')), 'огноогүй бол «сүүлийнх» баримт байхгүй');
  assert.equal(r.tables.length, 3);
  assert.equal(r.tables[0].rows.length, 0);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.failedSources, []);
}

{
  const rows = [row({ turul: 'Зөрчил', bagts: 'Багц 1' }), row({ turul: 'Гэмтэл' })];
  const r = computeSafety(rows, NOW);
  assert.equal(r.asOf, null, 'огноогүй мөрүүд asOf-д орохгүй');
  const a = aggregateSafety(rows, NOW);
  assert.equal(a.last, null);
  assert.equal(a.daysSince, null);
  assert.equal(a.recent, 0, 'огноогүй мөр «сүүлийн 30 хоногт» тоологдохгүй');
  assert.equal(r.tables[0].rows[0][0].v, null, 'огноогүй нүд null → «—»');
  assert.equal(r.tables[0].rows[1][2].v, null, 'багцгүй нүд null, хоосон мөр биш');
  assert.deepEqual(r.issues, [], 'огноогүй энгийн бүртгэл анхааруулга биш');
}

/* ══════════════ 2. Мөр хөрвүүлэлт — null ≠ 0 ══════════════ */

{
  const r = toSafetyRow({ field_22: null, field_7: '  Зөрчил ', objectid: 7 });
  assert.equal(r.ognoo, null);
  assert.equal(r.turul, 'Зөрчил');
  assert.equal(r.oid, 7);
  assert.equal(toSafetyRow({ field_22: 0 }).ognoo, null, '0 огноо = байхгүй');
  assert.equal(toSafetyRow({ field_22: NOW }).ognoo, NOW);
  assert.equal(toSafetyRow({}).oid, null);

  // CreationDate нөөц зам — Habea.tsx normIncident-тэй ижил (`nn(a) || nn(b)`)
  assert.equal(CREATED_FIELD, 'CreationDate');
  assert.equal(toSafetyRow({ field_22: null, CreationDate: NOW - 5 * DAY }).ognoo, NOW - 5 * DAY,
    'field_22 хоосон → CreationDate');
  assert.equal(toSafetyRow({ field_22: 0, CreationDate: NOW - 5 * DAY }).ognoo, NOW - 5 * DAY,
    'field_22 = 0 → CreationDate (Habea.tsx-ийн || шиг)');
  assert.equal(toSafetyRow({ field_22: NOW - 9 * DAY, CreationDate: NOW }).ognoo, NOW - 9 * DAY,
    'field_22 байвал CreationDate-ыг ХЭРЭГЛЭХГҮЙ');
  assert.equal(toSafetyRow({ field_22: null, CreationDate: null }).ognoo, null, 'хоёулаа хоосон → null');
  assert.equal(toSafetyRow({ field_22: null, CreationDate: 0 }).ognoo, null, 'CreationDate 0 → null');

  // Ачаалагч CreationDate-ыг ЗААВАЛ татдаг — эс бөгөөс нөөц зам хоосон ирнэ
  const src = await (await import('node:fs/promises')).readFile(
    new URL('./safety.ts', import.meta.url), 'utf8',
  );
  assert.ok(src.includes("'objectid', CREATED_FIELD]"), 'outFields-д CREATED_FIELD байхгүй');

  // Нөөц огноотой мөр «сүүлийн 30 хоногт» тоологдоно — ХАБЭА хуудастай ижил
  const viaCreated = toSafetyRow({ field_22: null, CreationDate: NOW - 2 * DAY, field_7: 'Зөрчил', field_6: 'Багц 4' });
  const a = aggregateSafety([viaCreated], NOW);
  assert.equal(a.recent, 1);
  assert.equal(a.last, NOW - 2 * DAY);
  assert.equal(a.daysSince, 2);
}

/* ══════════════ 3. Хохирлын regex — execTriage-тэй ижил дүрэм ══════════════ */

assert.ok(DAMAGE_RE.test('Эд хөрөнгийн хохирол'));
assert.ok(DAMAGE_RE.test('эд хөрөнгийн ХОХИРОЛ учруулсан'));
assert.ok(!DAMAGE_RE.test('Зөрчил'));
{
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../execTriage.ts', import.meta.url), 'utf8',
  );
  assert.ok(src.includes(`/${DAMAGE_RE.source}/${DAMAGE_RE.flags}`),
    'execTriage.loadDamage-ийн regex энэ файлынхтай зөрөв');
}

/* ══════════════ 4. Босго ══════════════ */

assert.equal(damageLevel(null), 'unknown');
assert.equal(damageLevel(0), 'good');
assert.equal(damageLevel(DMG_BAD_N - 1), 'warn');
assert.equal(damageLevel(DMG_BAD_N), 'bad');

const dated = (n, daysAgo, extra = {}) => Array.from({ length: n }, (_, i) =>
  row({ ognoo: NOW - (daysAgo + i) * DAY, turul: 'Зөрчил', bagts: 'Багц 2', company: 'К', ...extra }));

assert.equal(computeSafety(dated(INCIDENT_WARN_MAX, 100), NOW).level, 'warn', '1–5 осол → Дунд');
assert.equal(computeSafety(dated(INCIDENT_WARN_MAX + 1, 100), NOW).level, 'bad', '6+ осол → Яаралтай');
assert.equal(
  computeSafety(dated(DMG_BAD_N, 100, { turul: 'Эд хөрөнгийн хохирол' }), NOW).level, 'bad',
  'хохирол ≥ DMG_BAD_N → Яаралтай, нийт тоо бага ч',
);
assert.equal(computeSafety(dated(1, 100, { turul: 'Эд хөрөнгийн хохирол' }), NOW).level, 'warn');

/* ══════════════ 5. Нэгтгэл, 30 хоногийн зааг, баримт ══════════════ */

{
  const rows = [
    row({ ognoo: NOW - 3 * DAY, turul: 'Зөрчил', bagts: 'Багц 3', company: 'А' }),
    row({ ognoo: NOW - RECENT_DAYS * DAY, turul: 'Гэмтэл', bagts: 'Багц 3', company: 'Б' }), // яг зааг → орно
    row({ ognoo: NOW - (RECENT_DAYS * DAY + 1), turul: 'Эд хөрөнгийн хохирол', bagts: 'Багц 1', company: 'В' }), // 1 мс хуучин
    row({ ognoo: NOW - 200 * DAY, turul: 'Зөрчил', bagts: '', company: '' }),
    row({ ognoo: null, turul: 'Эд хөрөнгийн хохирол', bagts: 'Багц 2', company: 'Г' }),
  ];
  const a = aggregateSafety(rows, NOW);
  assert.equal(a.total, 5);
  assert.equal(a.damage, 2);
  assert.equal(a.last, NOW - 3 * DAY);
  assert.equal(a.daysSince, 3);
  assert.equal(a.recent, 2, 'яг 30 хоногийн зааг орно, 1 мс хуучин орохгүй');
  assert.deepEqual(a.byType.map((g) => g.n), [2, 2, 1]);
  assert.equal(a.byBagts[0].name, 'Багц 3');
  assert.equal(a.byBagts.find((g) => g.name === 'Тодорхойгүй')?.n, 1, 'хоосон багц нэрлэгдсэн бүлэгт');
  assert.deepEqual(a.byCompany.map((g) => g.name).slice(0, 1).length, 1);

  const r = computeSafety(rows, NOW);
  assert.equal(r.value, '5');
  assert.equal(r.asOf, NOW - 3 * DAY);
  assert.equal(r.level, 'warn');
  assert.ok(r.facts.length <= 4, 'баримт 3–4-өөс илүүгүй');
  assert.ok(r.facts[0].startsWith('сүүлийнх 3 хоногийн өмнө ('), r.facts[0]);
  assert.ok(r.facts.includes(`сүүлийн ${RECENT_DAYS} хоногт 2`), r.facts.join(' | '));
  // ⚠️ «{0} хохирол» ба «Багц: {0}» — en.ts-ийн БАЙГАА түлхүүрүүд (safety.ts-ийн тайлбар)
  assert.ok(r.facts.includes('2 хохирол'), r.facts.join(' | '));
  assert.ok(r.facts.includes('Багц: Багц 3 — 2'), r.facts.join(' | '));
  for (const f of r.facts) assert.match(f, /\d/, `баримт тоогүй: ${f}`);

  // Хүснэгт: мөр бүр нэрээр, шинэ нь эхэнд, огноогүй нь сүүлд, багана таарна
  const [all, byType, byBagts] = r.tables;
  assert.equal(all.cols.length, 7);
  assert.equal(all.rows.length, 5, 'бүх бүртгэл — тоолуур биш, мөр бүр');
  for (const rr of all.rows) assert.equal(rr.length, all.cols.length);
  assert.equal(all.rows[0][3].v, 'А', 'хамгийн шинэ эхэнд');
  assert.equal(all.rows[4][0].v, null, 'огноогүй мөр сүүлд, огноо «—»');
  assert.equal(all.rows[4][3].v, 'Г');
  assert.equal(all.rows[3][2].v, null, 'хоосон багц → null');
  assert.equal(byType.rows.length, 3);
  assert.equal(byType.rows[0][1].kind, 'count');
  assert.equal(byBagts.rows.length, 4);
  assert.ok(byBagts.rows.some((x) => x[0].v === 'Тодорхойгүй'));

  // Анхааруулга: 2 улаан (30 хоног), 2 шар (хуучин + огноогүй хохирол), хуучин энгийн — үгүй
  assert.equal(r.issues.filter((i) => i.tone === 'bad').length, 2);
  assert.equal(r.issues.filter((i) => i.tone === 'warn').length, 2);
  assert.equal(r.issues.length, 4, 'нэг мөр нэг л удаа');
  assert.ok(r.issues[0].text.includes('Багц 3 · Зөрчил — А'), r.issues[0].text);
  assert.ok(r.issues[3].text.startsWith('— · Багц 2'), `огноогүй анхааруулга: ${r.issues[3].text}`);
}

/* ══════════════ 6. Мөрийн хязгаар ил үлдэнэ ══════════════ */

{
  const many = dated(320, 50);
  const r = computeSafety(many, NOW);
  assert.equal(r.tables[0].rows.length, 301, '300 + «… бас N мөр»');
  assert.equal(r.tables[0].rows[300][0].v, '… бас 20 мөр');
  assert.equal(r.tables[0].rows[300].length, 7, 'тасалсан мөр багана бүрэн');
}

console.log('safety.check.mjs — БҮГД ТЭНЦЛЭЭ');
