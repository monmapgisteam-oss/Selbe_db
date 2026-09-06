/**
 * «Тохиромжтой байдал» KPI-ийн цэвэр тооцооны шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/suitability.check.mjs
 *
 * ЮУГ хамгаалж байна вэ:
 *  1. execData:272-316-ийн шүүлт — `ref`, жин 0, `engineering` дүгнэгдэхгүй;
 *     `excluded` бүс зөрчилд тоологдохгүй.
 *  2. Зөрчил ХУРИМТЛАГДАНА (хамгийн муу ганц бүс биш) — бүх (бүс, үзүүлэлт)
 *     хос жагсаалтад орно, эрэмбэ нь үзүүлэлт (fails desc) → зөрүү desc.
 *  3. null ≠ 0 — утгагүй бүс дүгнэгдэхгүй, 0 утга нь бодит зөрчил.
 *  4. Түвшин: батлагдсан үзүүлэлтийн зөрчил → bad; зөвхөн `ASSUME_MET`
 *     (social) → warn; юу ч ачаалагдаагүй → unknown.
 *  5. `byType` (FAR) норм бүсийн төрлөөр — «Олон нийтийн бүс»-ийн FAR 2.5 нь
 *     зөрчил БИШ (хязгаар 3.0).
 *  6. Хүснэгтийн багана/мөр тоо, ROW_CAP таслалт ил мөртэй.
 */
import assert from 'node:assert/strict';
import { computeSuitability, buildSuitabilityKpi, judgedIndicators } from './suitability.ts';
import { ROW_CAP } from './kpi.ts';

const RES = 'Орон сууцны бүс';
const PUB = 'Олон нийтийн бүс';

/** Зохиомол бүс — `raw` нь `ASSUME_MET`-ээр дарагдсан (social=100), `rawActual` бодит */
const zone = (id, type, actual, excluded = false) => ({
  id, type, excluded,
  rawActual: excluded ? {} : { ...actual },
  raw: excluded ? {} : { ...actual, social: 100, engineering: 100 },
});

const Z = [
  zone('A-1', RES, { green: 3, density: 200, far: 1.5, bcr: 30, parking: 50, social: 40, engineering: 800, greenCap: 1, densityCap: 10 }),
  zone('A-2', PUB, { green: 2, density: 350, far: 2.5, bcr: 85, parking: 100, social: 100 }),
  zone('Багц-2.1', RES, { green: 10, density: null, far: null, bcr: null, parking: null, social: null }),
  zone('G-1', 'Ногоон байгууламж', { green: 0, density: 0, far: 5, bcr: 99, parking: 0, social: 0 }, true),
];

/* 1. Дүгнэгдэх үзүүлэлтийн шүүлт */
{
  const ids = judgedIndicators().map((i) => i.id);
  assert.deepEqual(ids, ['green', 'density', 'far', 'bcr', 'parking', 'social']);
}

/* 2. Хуримтлал ба эрэмбэ */
const c = computeSuitability(Z);
{
  const by = Object.fromEntries(c.byIndicator.map((r) => [r.id, r]));
  assert.equal(c.byIndicator[0].id, 'green', 'fails desc — ногоон эхэнд');
  assert.equal(by.green.fails, 2);
  assert.equal(by.green.scored, 3, 'Багц-2.1 ногоон 10 → дүгнэгдсэн, хангасан');
  assert.equal(by.green.worst.zone, 'A-2', 'зөрүү 4 > 3');
  assert.equal(by.green.worst.gap, 4);
  assert.equal(by.density.fails, 1);
  assert.equal(by.density.scored, 2, 'density null → дүгнэгдээгүй');
  assert.equal(by.far.fails, 1, 'A-2 FAR 2.5 ≤ 3.0 (Олон нийтийн) → зөрчил биш');
  assert.equal(by.far.worst.norm, '≤ 1.20', 'A-1-ийн ӨӨРИЙН норм (орон сууц 1.2)');
  assert.ok(Math.abs(by.far.worst.gap - 0.3) < 1e-9);
  assert.equal(by.bcr.fails, 0);
  assert.equal(by.bcr.worst, null);
  assert.equal(by.parking.fails, 1);
  assert.equal(by.social.fails, 1);
  assert.equal(by.social.assumed, true);
  assert.equal(by.green.assumed, false);
  assert.match(by.far.normLabel, /1\.20 – 3\.00/, 'byType муж');

  assert.equal(c.pairs, 6);
  assert.equal(c.zonesFailing, 2);
  assert.equal(c.indicatorsFailing, 5);
  assert.equal(c.assumedFailing, 1);
  assert.equal(c.assumedCount, 1);
  assert.equal(c.fails.length, 6);
  assert.deepEqual(c.fails.slice(0, 2).map((f) => [f.indId, f.zone]), [['green', 'A-2'], ['green', 'A-1']]);
  assert.ok(c.fails.every((f) => f.zone !== 'G-1'), 'хасагдсан бүс зөрчилд орохгүй');
  assert.ok(c.fails.every((f) => f.indId !== 'engineering'));

  assert.equal(c.scoredZones, 3, 'G-1 (raw хоосон) оноогүй');
  assert.equal(c.zones[0].zone, 'A-1', 'хамгийн муу оноо эхэнд');
  assert.equal(c.zones[0].fails, 5);
  assert.ok(c.avgScore != null && c.avgScore > 0 && c.avgScore <= 100);
}

/* 3. KpiResult угсралт */
{
  const k = buildSuitabilityKpi(c);
  assert.equal(k.value, '5');
  assert.equal(k.level, 'bad');
  assert.equal(k.facts[0], '2 бүс / 3');
  assert.equal(k.facts[1], '6 зөрчил');
  assert.ok(k.facts.some((f) => f.startsWith('дундаж оноо ')));
  assert.equal(k.facts.at(-1), '1 үзүүлэлт батлагдаагүй эх өгөгдөлтэй');
  assert.equal(k.tables.length, 3);
  assert.equal(k.tables[0].rows.length, 6, 'үзүүлэлт бүр');
  assert.equal(k.tables[1].rows.length, 6, 'зөрчил бүр');
  assert.equal(k.tables[2].rows.length, 3, 'оноотой бүс бүр (≤15)');
  for (const t of k.tables) for (const r of t.rows) assert.equal(r.length, t.cols.length);
  const bcrRow = k.tables[0].rows.find((r) => r[0].v === 'BCR');
  assert.equal(bcrRow[4].v, null, 'зөрчилгүй → хамгийн муу бүс «—»');
  assert.equal(bcrRow[2].v, 0);
  const socRow = k.tables[0].rows[k.tables[0].rows.length - 1];
  assert.equal(k.tables[0].rows.find((r) => r[7].v !== '')[7].v, 'батлагдаагүй');
  assert.ok(socRow);
  assert.equal(k.issues.length, 5);
  assert.equal(k.issues.find((i) => i.text.startsWith('Нийгмийн')).tone, 'warn');
  assert.equal(k.issues.find((i) => i.text.startsWith('Ногоон')).tone, 'bad');
  assert.match(k.issues[0].text, /2 бүс норм зөрчсөн \(хамгийн муу A-2\)/);
  assert.equal(k.asOf, null);
  assert.deepEqual(k.failedSources, []);
}

/* 4. Зөвхөн таамаг (social) зөрчил → warn; юу ч байхгүй → unknown */
{
  const only = computeSuitability([
    zone('B-1', RES, { green: 8, density: 350, far: 1.0, bcr: 30, parking: 100, social: 20 }),
  ]);
  const k = buildSuitabilityKpi(only);
  assert.equal(only.indicatorsFailing, 1);
  assert.equal(only.assumedFailing, 1);
  assert.equal(k.level, 'warn');
  assert.equal(k.value, '1');

  const none = buildSuitabilityKpi(computeSuitability([]));
  assert.equal(none.level, 'unknown');
  assert.equal(none.value, '—');
  assert.deepEqual(none.facts, []);
  assert.equal(none.tables[1].rows.length, 0);

  /* Бүх утга null — ачаалагдсан ч дүгнэх юмгүй → unknown, тэг биш */
  const blank = buildSuitabilityKpi(computeSuitability([
    zone('C-1', RES, { green: null, density: null, far: null, bcr: null, parking: null, social: null }),
  ]));
  assert.equal(blank.value, '—');
  assert.equal(blank.level, 'unknown');
}

/* 5. null ≠ 0 — 0 нь бодит зөрчил, null нь дүгнэгдэхгүй */
{
  const c0 = computeSuitability([
    zone('D-0', RES, { green: 0 }),
    zone('D-n', RES, { green: null }),
  ]);
  const g = c0.byIndicator.find((r) => r.id === 'green');
  assert.equal(g.fails, 1);
  assert.equal(g.scored, 1);
  assert.equal(g.worst.zone, 'D-0');
  assert.equal(g.worst.gap, 6);
}

/* 6. ROW_CAP таслалт — тасалсан тоо ил мөр болно */
{
  const many = Array.from({ length: ROW_CAP + 50 }, (_, i) => zone(`M-${i}`, RES, { green: 1 }));
  const k = buildSuitabilityKpi(computeSuitability(many));
  assert.equal(k.tables[1].rows.length, ROW_CAP + 1);
  assert.match(String(k.tables[1].rows.at(-1)[0].v), /50/);
  assert.equal(k.tables[2].rows.length, 15);
}

console.log('suitability.check: OK');
