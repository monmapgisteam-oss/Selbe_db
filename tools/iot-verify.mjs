/**
 * IoT-ийн БҮХ ТООГ эх сурвалжаас БИЕ ДААН дахин бодож тулгана.
 * Порталын кодыг ашиглахгүй — түүхий REST асуулгаар өөрөө тоолж, дараа нь
 * `loadSensors`-ийн гаргасантай харьцуулна.
 */
import { SENSORS, loadSensors, parseTs } from '../src/lib/sensors.ts';

const ok = (b) => (b ? '✅' : '❌');
let bad = 0;
const chk = (name, pass, detail = '') => {
  if (!pass) bad++;
  console.log(`  ${ok(pass)} ${name}${detail ? ' · ' + detail : ''}`);
};

async function post(url, params) {
  const r = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, f: 'json' }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

/** Түүхий бүх мөрийг хуудаслаж татна (задарсан утгатай нь) */
async function rawRows(url, field) {
  const out = [];
  for (let off = 0; ; off += 2000) {
    const j = await post(url, {
      where: `${field} IS NOT NULL`,
      outFields: `received_datetime,${field}`,
      orderByFields: 'received_datetime DESC',
      resultOffset: String(off),
      resultRecordCount: '2000',
      returnGeometry: 'false',
    });
    const fs = (j.features ?? []).map((f) => f.attributes);
    out.push(...fs);
    if (!j.exceededTransferLimit || !fs.length || out.length > 12000) break;
  }
  return out;
}

const RANGE_H = 24 * 7;   // «7 хоног» — порталын анхдагч
const from = Date.now() - RANGE_H * 3_600_000;

console.log('IoT ӨГӨГДЛИЙН ҮНЭН ЗӨВИЙН ШАЛГАЛТ · хүрээ: 7 хоног\n');
const live = await loadSensors('7d');

for (const def of SENSORS) {
  const sn = live.find((x) => x.key === def.key);
  console.log(`▓ ${def.label}  (${def.key})`);
  if (!sn || sn.error) { chk('үйлчилгээ', false, sn?.error ?? 'алга'); continue; }

  for (const m of def.metrics) {
    const series = sn.series.find((x) => x.key === m.key);
    if (!series) { chk(`${m.label} — цуваа`, false, 'алга'); continue; }

    /* 1. НИЙТ заалт — тусдаа count асуулгаар */
    const cj = await post(def.url, { where: `${m.field} IS NOT NULL`, returnCountOnly: 'true' });
    chk(`${m.label} · нийт заалт`, cj.count === series.total, `эх ${cj.count} = UI ${series.total}`);

    /* 2. Түүхий мөрөөс хүрээн дэх утгуудыг ӨӨРӨӨ бодно */
    const rows = await rawRows(def.url, m.field);
    const pts = [];
    for (const r of rows) {
      const t = parseTs(r.received_datetime);
      if (t == null) continue;
      const v = Number(r[m.field]);
      if (!Number.isFinite(v)) continue;
      pts.push({ t, v: m.derive ? m.derive(v) : v });
    }
    pts.sort((a, b) => a.t - b.t);
    const inR = pts.filter((x) => x.t >= from);
    const vals = inR.map((x) => x.v);
    const last = inR.length ? inR[inR.length - 1] : null;
    const r2 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

    chk(`${m.label} · сүүлийн утга`, r2(last?.v) === r2(series.latest),
      `эх ${r2(last?.v)} = UI ${r2(series.latest)}`);
    chk(`${m.label} · сүүлийн огноо`, last?.t === series.latestAt,
      last ? new Date(last.t).toISOString() : '—');
    chk(`${m.label} · доод…дээд`,
      r2(Math.min(...vals)) === r2(series.min) && r2(Math.max(...vals)) === r2(series.max),
      `эх ${r2(Math.min(...vals))}…${r2(Math.max(...vals))} = UI ${r2(series.min)}…${r2(series.max)}`);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    chk(`${m.label} · дундаж`, r2(avg) === r2(series.avg), `эх ${r2(avg)} = UI ${r2(series.avg)}`);
    chk(`${m.label} · цэг ≤90`, series.points.length <= 90, `${series.points.length} цэг`);
    /* Сийрэгжүүлэлт нь ЭХЭН ба ТӨГСГӨЛИЙГ хадгалах ёстой */
    if (series.points.length) {
      chk(`${m.label} · сийрэгжүүлэлт үзүүрийг хадгалав`,
        r2(series.points[0].v) === r2(inR[0].v)
        && r2(series.points[series.points.length - 1].v) === r2(last.v));
    }

    /* 3. Хогийн савны ХӨРВҮҮЛЭЛТ — түүхий мм → дүүрэлт % */
    if (m.derive) {
      const rawLast = Number(rows[0][m.field]);   // DESC тул [0] = хамгийн сүүл
      const expect = Math.max(0, Math.min(100, ((3015 - rawLast) / 3015) * 100));
      chk(`${m.label} · хөрвүүлэлт (${rawLast}мм → %)`, r2(expect) === r2(series.latest),
        `тооцоо ${r2(expect)}% = UI ${r2(series.latest)}%`);
      const rawMax = Math.max(...rows.map((r) => Number(r[m.field])).filter(Number.isFinite));
      chk('савны гүн 3015мм — түүхий дээд утгатай нийцэх', Math.abs(rawMax - 3015) <= 20,
        `бүртгэгдсэн дээд ${rawMax}мм`);
    }

    /* 4. Хоногийн зөрүү (усны тоолуур) */
    if (m.dailyDiff) {
      const d = sn.series.find((x) => x.key === m.dailyDiff.key);
      const byDay = new Map();
      for (const r of inR) {
        const dd = new Date(r.t);
        const k = `${dd.getFullYear()}-${dd.getMonth()}-${dd.getDate()}`;
        const c = byDay.get(k);
        if (!c) byDay.set(k, { min: r.v, max: r.v }); else { c.min = Math.min(c.min, r.v); c.max = Math.max(c.max, r.v); }
      }
      const exp = [...byDay.values()].map((x) => Math.max(0, x.max - x.min));
      chk(`${m.dailyDiff.label} · хоногийн тоо`, d && d.points.length === exp.length,
        `эх ${exp.length} хоног = UI ${d?.points.length}`);
      chk(`${m.dailyDiff.label} · сүүлийн хоногийн хэрэглээ`,
        d && r2(exp[exp.length - 1]) === r2(d.latest),
        `эх ${r2(exp[exp.length - 1])} = UI ${r2(d?.latest)}`);
    }

    /* 5. Босго — баримтжуулсантай нийцэх */
    const hasAlert = !!m.alert;
    chk(`${m.label} · босго ${hasAlert ? m.alert.value + m.unit : '(оноогоогүй)'}`,
      series.alert?.value === m.alert?.value);

    /* 6. Таамаг — ЗӨВХӨН forecast тугтайд */
    chk(`${m.label} · хандлага ${m.forecast ? 'бодогдоно' : 'бодогдохгүй'}`,
      m.forecast ? series.trend != null : series.trend == null);
  }
  console.log('');
}

console.log(bad === 0 ? '✅ БҮХ ТОО ЭХ СУРВАЛЖТАЙ ТААРЛАА' : `❌ ${bad} зөрчил`);
process.exit(bad === 0 ? 0 : 1);
