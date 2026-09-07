/**
 * IoT БОСГО ХЭТРЭЛТИЙН KPI-ийн ШАЛГУУР (CEO самбар).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/iot.check.mjs
 *
 * ⚠️ ЛОГИК ХУУЛБАРЛААГҮЙ — ЖИНХЭНЭ `computeIot`/`buildIotKpi`-г импортлоно.
 *    Сүлжээ ХЭРЭГГҮЙ: `SensorLive` хэлбэрийн зохиомол мөрөөр ажиллана.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. ЗААЛТГҮЙ (null) нь хэтрэлт ч биш, хэвийн ч биш — тоолуурт орохгүй,
 *     хүснэгтэд «—». Тэгээр орлуулбал «0 ≥ босго» худал ногоон болно.
 *  2. ХӨРСНИЙ ЧИЙГ урвуу чиглэлтэй: босгоос ДЭЭШ нь хэтрэлт БИШ, доош нь «хуурай».
 *  3. ХУУЧИРСНЫГ ХЭМЖИГДЭХҮҮНЭЭР шалгана: мэдрэгчийн нэг утга шинэ байхад
 *     нөгөө утгын хэтрэлт 3 хоногийн өмнөх бол улаан биш шар (`staleExceed`).
 *     ⚠️ Зохиомол нас нь `loadSensors('7d')`-ийн ХҮРЭЭНД (168ц) багтах ёстой —
 *     хүрээнээс гадуур нас нь бодит ачаалагчид ХЭЗЭЭ Ч ирдэггүй (`latest = null`
 *     болно) тул тийм fixture «боломжгүй төлөв» дээр тест давуулна.
 *  4. УНАСАН мэдрэгч `failedSources`-д нэрээр; БҮГД унавал УЛААН, гол тоо «—».
 *  5. Хүснэгт бүр асуудалтай мөр БҮРИЙГ нэрээр агуулна; багана таарна.
 *  6. `facts` нь зөвхөн тоотой богино хэсгүүд.
 *  7. `asOf` = хамгийн сүүлийн `latestAt`.
 *  8. «Дөхөж байна» нь зөвхөн мэдээлэл — түвшин/анхааруулгад ОРОХГҮЙ.
 */

import assert from 'node:assert/strict';
import {
  computeIot, buildIotKpi, iotLevel, IOT_STALE_H, IOT_ETA_NEAR_H,
} from './iot.ts';
import { RANGES } from '@/lib/sensors';

const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 6, 9, 0, 0);

/** Ачаалагчийн бодит хүрээ (цаг) — `loadIotKpi` '7d'-ээр татдаг */
const WINDOW_H = RANGES.find((r) => r.key === '7d').hours;
assert.ok(WINDOW_H > IOT_STALE_H, `хүрээ ${WINDOW_H}ц ≤ хуучирсан босго ${IOT_STALE_H}ц — «хуучирсан» хэзээ ч гарахгүй`);

/** Зохиомол хэмжигдэхүүн — `MetricSeries` хэлбэр */
function metric(key, label, unit, dp, latest, ageH, alert, extra = {}) {
  // ⚠️ Хүрээнээс гадуур нас = бодит ачаалагчид боломжгүй төлөв
  if (latest != null) assert.ok(ageH < WINDOW_H, `${label}: нас ${ageH}ц хүрээ ${WINDOW_H}ц-аас их`);
  const latestAt = latest == null ? null : NOW - ageH * H;
  return {
    key, label, field: `f_${key}`, unit, dp, note: '',
    ...(alert != null ? { alert: { value: alert, note: '' } } : {}),
    points: latest == null ? [] : [{ t: latestAt, v: latest }],
    latest, latestAt,
    min: latest, max: latest, avg: latest,
    ageHours: latest == null ? null : ageH,
    total: latest == null ? 0 : 1,
    trend: null,
    ...extra,
  };
}

/** Зохиомол мэдрэгч — `SensorLive` хэлбэр */
function sensor(key, label, series, error) {
  const lastAt = series.reduce((a, m) => (m.latestAt != null && (a == null || m.latestAt > a) ? m.latestAt : a), null);
  return {
    key, label, url: `https://x/${key}`, note: '', devEui: key, layerId: `iot:${key}`,
    metrics: series.map(({ points: _p, latest: _l, latestAt: _a, min: _mi, max: _ma, avg: _av, ageHours: _h, total: _t, trend: _tr, ...def }) => def),
    series: error ? [] : series,
    lastAt: error ? null : lastAt,
    ageHours: error || lastAt == null ? null : (NOW - lastAt) / H,
    n: error ? 0 : series.length,
    ...(error ? { error } : {}),
  };
}

/* ══════════════ 1. Хэвийн — бүгд ногоон ══════════════ */
{
  const s = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 40, 1, 80)]),
    sensor('air', 'Агаар', [
      metric('temperature', 'Темп', '°C', 1, 20, 1, 28),
      metric('humidity', 'Чийгшил', '%r.h.', 0, 50, 1, 80),
    ]),
    sensor('soil', 'Хөрс', [metric('moisture', 'Хөрсний чийг', '%r.h.', 1, 22, 1, 15)]),
  ], NOW);
  assert.equal(s.exceed.length, 0);
  assert.equal(s.dry.length, 0, 'чийг 22 ≥ 15 — хуурай БИШ');
  assert.equal(s.staleExceed.length, 0);
  assert.equal(iotLevel(s), 'good');
  const k = buildIotKpi(s, []);
  assert.equal(k.value, '0');
  assert.equal(k.level, 'good');
  assert.equal(k.tables[0].rows.length, 0, 'хэтрэлтгүй → эхний хүснэгт хоосон');
  assert.equal(k.tables[1].rows.length, 3);
  assert.equal(k.tables[2].rows.length, 4);
  assert.equal(k.asOf, NOW - 1 * H);
}

/* ══════════════ 2. Хөрсний чийг УРВУУ: дээш нь хэтрэлт биш, доош нь хуурай ══════════════ */
{
  const s = computeIot([
    sensor('soil', 'Хөрс', [
      metric('moisture', 'Хөрсний чийг', '%r.h.', 1, 40, 1, 15),
      metric('temperature', 'Хөрсний темп', '°C', 1, 27.5, 1, 25),
    ]),
  ], NOW);
  assert.equal(s.exceed.length, 1, 'зөвхөн темп хэтэрсэн — чийг 40 ≥ 15 нь хэтрэлт БИШ');
  assert.equal(s.exceed[0].metric, 'Хөрсний темп');
  assert.equal(s.dry.length, 0);

  const d = computeIot([
    sensor('soil', 'Хөрс', [metric('moisture', 'Хөрсний чийг', '%r.h.', 1, 9.5, 1, 15)]),
  ], NOW);
  assert.equal(d.exceed.length, 0);
  assert.equal(d.dry.length, 1);
  assert.equal(d.dry[0].over, 9.5 - 15);
  assert.equal(iotLevel(d), 'warn', 'хуурай → шар');
  const k = buildIotKpi(d, []);
  assert.ok(k.facts.some((f) => /хуурай.*1/.test(f)), `хуурай баримт: ${k.facts}`);
  assert.ok(k.issues.some((i) => i.tone === 'warn' && i.text.includes('Хөрсний чийг')));
  const row = k.tables[0].rows.find((r) => r[1].v === 'Хөрсний чийг');
  assert.ok(row, 'хуурай мөр эхний хүснэгтэд нэрээр');
  assert.equal(row[8].v, 'хуурай');
}

/* ══════════════ 3. Хуучирсан ХЭМЖИГДЭХҮҮНЭЭР — нэг утга шинэ, нөгөө нь хуучин ══════════════ */
{
  const s = computeIot([
    sensor('air', 'Агаар', [
      metric('temperature', 'Темп', '°C', 1, 20, 0.5, 28),                 // шинэ, хэвийн
      metric('humidity', 'Чийгшил', '%r.h.', 0, 91, IOT_STALE_H + 24, 80), // 3 хоногийн өмнөх хэтрэлт (7д хүрээнд)
    ]),
  ], NOW);
  assert.equal(s.exceed.length, 0, 'хуучирсан хэтрэлт улаан БИШ');
  assert.equal(s.staleExceed.length, 1);
  assert.equal(s.staleExceed[0].stale, true);
  assert.equal(s.stale, 1, 'хуучирсан хэмжигдэхүүн 1');
  assert.equal(s.states[0].state, 'ok', 'мэдрэгч өөрөө хуучраагүй (нэг утга нь шинэ)');
  assert.equal(iotLevel(s), 'warn');
  const k = buildIotKpi(s, []);
  assert.equal(k.value, '0');
  assert.equal(k.tables[0].rows.length, 1);
  assert.equal(k.tables[0].rows[0][8].v, 'хуучирсан');
  assert.equal(k.tables[0].rows[0][2].v, '91%r.h.', 'хуучирсан заалтын УТГА алдагдахгүй');
  assert.ok(k.tables[0].rows[0][6].v, 'хуучирсан заалтын ЦАГ алдагдахгүй');
  assert.ok(k.issues.some((i) => i.tone === 'warn' && i.text.includes('Чийгшил')));
  assert.equal(k.facts[1], '0 унасан · 0 дуугүй · 1 хуучирсан');

  // Бүх утга хуучирсан → мэдрэгч «хуучирсан»
  const a = computeIot([
    sensor('air', 'Агаар', [metric('temperature', 'Темп', '°C', 1, 20, IOT_STALE_H + 1, 28)]),
  ], NOW);
  assert.equal(a.states[0].state, 'stale');
  assert.equal(a.exceed.length, 0);
  assert.equal(iotLevel(a), 'warn');

  // Хүрээний ЗАХ — 6 хоногийн өмнөх заалт мөн хуучирсан, дуугүй биш
  const edge = computeIot([
    sensor('air', 'Агаар', [metric('temperature', 'Темп', '°C', 1, 20, WINDOW_H - 24, 28)]),
  ], NOW);
  assert.equal(edge.stale, 1);
  assert.equal(edge.silent, 0);
  assert.equal(edge.states[0].state, 'stale');
}

/* ══════════════ 4. Одоогийн хэтрэлт — улаан, эрэмбэ хувиар, нэрээр ══════════════ */
{
  const s = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 88, 2, 80)]),      // +10%
    sensor('air', 'Агаар', [metric('temperature', 'Темп', '°C', 1, 35, 1, 28)]), // +25%
    sensor('light', 'Гэрэл', [metric('illumination', 'Гэрэл', 'lux', 0, 50000, 1, null)]), // босгогүй
  ], NOW);
  assert.equal(s.exceed.length, 2);
  assert.equal(s.exceed[0].sensor, 'Агаар', 'хувиар хамгийн их нь эхэнд');
  assert.equal(s.exceed[1].sensor, 'Хог');
  assert.equal(s.sensorsExceeding, 2);
  assert.equal(iotLevel(s), 'bad');
  const k = buildIotKpi(s, []);
  assert.equal(k.value, '2');
  assert.equal(k.facts[0], '2 / 3 мэдрэгч');
  assert.equal(k.facts[1], '0 унасан · 0 дуугүй · 0 хуучирсан');
  for (const f of k.facts) assert.ok(/\d/.test(f), `баримт тоогүй: ${f}`);
  assert.equal(k.issues.filter((i) => i.tone === 'bad').length, 2);
  assert.ok(k.issues[0].text.startsWith('Агаар · Темп 35.0°C ≥ 28.0°C'), k.issues[0].text);
  const names = k.tables[0].rows.map((r) => `${r[0].v}/${r[1].v}`);
  assert.deepEqual(names, ['Агаар/Темп', 'Хог/Дүүрэлт']);
  assert.equal(k.tables[0].rows[0][4].v, '+7.0°C');
  assert.equal(k.tables[0].rows[0][8].v, 'одоогийн');
  // Босгогүй хэмжигдэхүүн: «Бүх хэмжигдэхүүн»-д босго «—»
  const light = k.tables[2].rows.find((r) => r[0].v === 'Гэрэл');
  assert.equal(light[4].v, null);
  // Мэдрэгчийн төлөв: босго давсан нь эхэнд
  assert.equal(k.tables[1].rows[0][1].v, 'босго давсан');
}

/* ══════════════ 5. Дуугүй (null) — тэг БИШ ══════════════ */
{
  const s = computeIot([
    sensor('water', 'Ус', [metric('meterReading', 'Заалт', 'м³', 2, null, 0, null)]),
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 10, 1, 80)]),
  ], NOW);
  assert.equal(s.silent, 1);
  assert.equal(s.states[0].state, 'silent');
  assert.equal(s.exceed.length, 0);
  assert.equal(s.stale, 0, 'заалтгүй нь хуучирсанд ОРОХГҮЙ');
  assert.equal(iotLevel(s), 'warn');
  const k = buildIotKpi(s, []);
  const row = k.tables[2].rows.find((r) => r[0].v === 'Ус');
  assert.equal(row[2].v, null, 'заалтгүй утга null (0 биш)');
  assert.equal(row[5].v, null);
  assert.equal(k.tables[1].rows[0][2].v, null, 'сүүлийн заалт «—»');
  assert.equal(k.asOf, NOW - 1 * H);
}

/* ══════════════ 6. Унасан — нэрээр failedSources; бүгд унавал УЛААН, гол тоо «—» ══════════════ */
{
  const s = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 10, 1, 80)], 'HTTP 500'),
    sensor('air', 'Агаар', [metric('temperature', 'Темп', '°C', 1, 20, 1, 28)]),
  ], NOW);
  assert.equal(s.down, 1);
  assert.equal(s.loaded, 1);
  assert.equal(iotLevel(s), 'bad');
  const k = buildIotKpi(s, ['Хог']);
  assert.deepEqual(k.failedSources, ['Хог']);
  assert.ok(k.issues.some((i) => i.tone === 'bad' && i.text.includes('Хог') && i.text.includes('HTTP 500')));
  assert.equal(k.tables[1].rows[0][1].v, 'унасан');
  assert.equal(k.tables[1].rows[0][3].v, 'HTTP 500');
  // Унасан мэдрэгчийн хэмжигдэхүүн «Бүх хэмжигдэхүүн»-д null-аар ҮЛДЭНЭ
  const row = k.tables[2].rows.find((r) => r[0].v === 'Хог');
  assert.ok(row, 'унасан мэдрэгч жагсаалтаас алга болохгүй');
  assert.equal(row[2].v, null);
  assert.equal(row[4].v, '80');

  // Таван сервис БҮГД унасан → даалгаврын дүрмээр «унасан → улаан»; гол тоо «—» (null ≠ 0)
  const all = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 10, 1, 80)], 'x'),
    sensor('air', 'Агаар', [metric('temperature', 'Темп', '°C', 1, 20, 1, 28)], 'y'),
  ], NOW);
  assert.equal(iotLevel(all), 'bad', 'бүгд унасан → улаан (unknown биш)');
  const ka = buildIotKpi(all, ['Хог', 'Агаар']);
  assert.equal(ka.value, '—', 'юу ч хэмжигдээгүй → «0 хэтрэлт» биш');
  assert.equal(ka.asOf, null);
  assert.equal(ka.issues.filter((i) => i.tone === 'bad').length, 2);
  assert.equal(ka.facts[1], '2 унасан · 0 дуугүй · 0 хуучирсан');

  // `loadSensors` өөрөө шидсэн (мэдрэгчийн жагсаалт ч ирээгүй) → мэдэхгүй
  const none = buildIotKpi(computeIot([], NOW), ['IoT']);
  assert.equal(none.level, 'unknown');
  assert.equal(none.value, '—');
  assert.deepEqual(none.failedSources, ['IoT']);
}

/* ══════════════ 7. Дөхөж байна — зөвхөн мэдээлэл, түвшинд НӨЛӨӨГҮЙ ══════════════ */
{
  const near = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 70, 1, 80,
      { trend: { perHour: 2, etaHours: IOT_ETA_NEAR_H - 4 } })]),
  ], NOW);
  assert.equal(near.approaching.length, 1);
  assert.equal(near.exceed.length, 0);
  assert.equal(iotLevel(near), 'good', 'дөхөж буй нь картыг шар болгохгүй');
  const k = buildIotKpi(near, []);
  assert.equal(k.level, 'good');
  assert.equal(k.tables[0].rows[0][7].v, IOT_ETA_NEAR_H - 4, 'ETA багана утгатай');
  assert.equal(k.tables[0].rows[0][8].v, 'дөхөж байна');
  assert.equal(k.issues.length, 0, 'дөхөж буй нь анхааруулга БИШ');
  assert.ok(k.facts.some((f) => f.includes('1 дөхөж байна')), `баримт: ${k.facts}`);

  const far = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 70, 1, 80,
      { trend: { perHour: 0.5, etaHours: IOT_ETA_NEAR_H + 10 } })]),
  ], NOW);
  assert.equal(far.approaching.length, 0);
  assert.equal(iotLevel(far), 'good');

  // Хуучирсан заалтын таамаг — хэрэглэхгүй
  const st = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 70, IOT_STALE_H + 1, 80,
      { trend: { perHour: 2, etaHours: 2 } })]),
  ], NOW);
  assert.equal(st.approaching.length, 0);

  // Дөхөж буй мөр нь хэтрэлт/хуучирсан/хуурай мөрийн ДАРАА
  const mix = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 70, 1, 80,
      { trend: { perHour: 2, etaHours: 5 } })]),
    sensor('soil', 'Хөрс', [metric('moisture', 'Хөрсний чийг', '%r.h.', 1, 5, 1, 15)]),
  ], NOW);
  const km = buildIotKpi(mix, []);
  assert.deepEqual(km.tables[0].rows.map((r) => r[8].v), ['хуурай', 'дөхөж байна']);
  assert.equal(km.level, 'warn', 'шар нь хуурайгаас, дөхөж буйгаас биш');
}

/* ══════════════ 8. Багана бүр таарна (table() шидэхгүй) ══════════════ */
{
  const s = computeIot([
    sensor('waste', 'Хог', [metric('fill', 'Дүүрэлт', '%', 0, 95, 1, 80)]),
    sensor('soil', 'Хөрс', [metric('moisture', 'Хөрсний чийг', '%r.h.', 1, 5, IOT_STALE_H + 5, 15)]),
    sensor('air', 'Агаар', [metric('humidity', 'Чийгшил', '%r.h.', 0, 85, IOT_STALE_H + 1, 80)]),
    sensor('light', 'Гэрэл', [], 'down'),
  ], NOW);
  const k = buildIotKpi(s, ['Гэрэл']);
  for (const t of k.tables) for (const r of t.rows) assert.equal(r.length, t.cols.length, t.title);
  assert.equal(k.tables[0].rows.length, 3, 'хэтэрсэн + хуучирсан хэтрэлт + хуурай = 3 мөр');
  assert.equal(k.tables[0].rows[0][8].v, 'одоогийн');
  assert.equal(k.tables[0].rows[1][8].v, 'хуучирсан');
  assert.equal(k.tables[0].rows[2][8].v, 'хуурай · хуучирсан');
  assert.equal(k.level, 'bad');
  assert.equal(k.facts[1], '1 унасан · 0 дуугүй · 2 хуучирсан');
}

console.log('iot.check: OK');
