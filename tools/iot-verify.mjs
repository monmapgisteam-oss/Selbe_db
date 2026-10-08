/**
 * IoT-ийн БҮХ ТООГ эх сурвалжаас БИЕ ДААН дахин бодож тулгана.
 * Порталын кодыг ашиглахгүй — түүхий REST асуулгаар өөрөө тоолж, дараа нь
 * `loadSensors`-ийн гаргасантай харьцуулна.
 */
import { SENSORS, loadSensors, parseTs, ubDay, outOfRange } from '../src/lib/sensors.ts';

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
      /* ⚠️ 2026-10-09: OBJECTID DESC — `received_datetime` нь String бөгөөд `dd/MM/yyyy`
         утга ч ирдэг тул мөрөөр эрэмбэлэх нь хугацааны эрэмбэ БИШ (sensors.ts-ийн
         2026-10-06-ны ⚠️). OID нь давхцалгүй тул хуудаслалт ч тогтвортой. */
      orderByFields: 'OBJECTID DESC',
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
    /* ⚠️ 2026-10-09: ТҮҮХИЙ муж (`rawValid`) нь `derive`-ээс ӨМНӨ шүүгдэнэ; физик мужаас
       (`valid`) гадуурх цэг доод/дээд/дундаж/цуваанд орохгүй ч «сүүлийн заалт»-д орно;
       «сүүлийн заалт» нь хүрээгээр огтлоогүй БҮТЭН таталтаас (2026-09-17). */
    const pts = [];
    let badAt = null;
    for (const r of rows) {
      const t = parseTs(r.received_datetime);
      if (t == null) continue;
      const v = Number(r[m.field]);
      if (!Number.isFinite(v)) continue;
      if (m.rawValid && (v < m.rawValid.min || v > m.rawValid.max)) {
        if (badAt == null || t > badAt) badAt = t;
        continue;
      }
      pts.push({ t, v: m.derive ? m.derive(v) : v });
    }
    pts.sort((a, b) => a.t - b.t);
    const inR = pts.filter((x) => x.t >= from && !outOfRange(m, x.v));
    const vals = inR.map((x) => x.v);
    const lastOk = pts.length ? pts[pts.length - 1] : null;
    const last = badAt != null && (lastOk == null || badAt > lastOk.t) ? { t: badAt, v: null } : lastOk;
    const r2 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

    chk(`${m.label} · сүүлийн утга`, r2(last?.v ?? null) === r2(series.latest),
      `эх ${r2(last?.v)} = UI ${r2(series.latest)}`);
    chk(`${m.label} · сүүлийн огноо`, last?.t === series.latestAt,
      last ? new Date(last.t).toISOString() : '—');
    /* ⚠️ 2026-10-09 (амьд шалгалт): хүрээнд ХҮЧИНТЭЙ цэг алга (хөрсний чийг/EC — бүх заалт
       мужаас гадуур) бол UI null → эх тал ч null (Math.min() = Infinity, NaN биш). */
    const mn = vals.length ? Math.min(...vals) : null;
    const mx = vals.length ? Math.max(...vals) : null;
    chk(`${m.label} · доод…дээд`,
      r2(mn) === r2(series.min) && r2(mx) === r2(series.max),
      `эх ${r2(mn)}…${r2(mx)} = UI ${r2(series.min)}…${r2(series.max)}`);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    chk(`${m.label} · дундаж`, r2(avg) === r2(series.avg), `эх ${r2(avg)} = UI ${r2(series.avg)}`);
    chk(`${m.label} · цэг ≤90`, series.points.length <= 90, `${series.points.length} цэг`);
    /* Сийрэгжүүлэлт нь ЭХЭН ба ТӨГСГӨЛИЙГ хадгалах ёстой */
    if (series.points.length) {
      chk(`${m.label} · сийрэгжүүлэлт үзүүрийг хадгалав`,
        r2(series.points[0].v) === r2(inR[0].v)
        && r2(series.points[series.points.length - 1].v) === r2(inR[inR.length - 1].v));
      /* ⚠️ 2026-10-09: босго давсан оргил сийрэгжүүлэлтэд алдагдахгүй (sensors.thin) */
      if (m.alert) {
        const peak = Math.max(...vals);
        chk(`${m.label} · босго давсан оргил цуваанд үлдэв`,
          peak < m.alert.value || series.points.some((p) => r2(p.v) === r2(peak)),
          `оргил ${r2(peak)}`);
      }
    }

    /* 3. Хогийн савны ХӨРВҮҮЛЭЛТ — түүхий мм → дүүрэлт % */
    if (m.derive) {
      /* ⚠️ 2026-10-09: OBJECTID DESC-ийн [0] нь ОРУУЛСАН дарааллаар сүүлийнх — хугацаагаар
         сүүлийнхийг `parseTs`-ээр олно; түүхий мужаас гадуур бол UI `null` (гэмтэл). */
      const newest = rows.reduce((a, r) => {
        const t = parseTs(r.received_datetime);
        return t != null && Number.isFinite(Number(r[m.field])) && (!a || t > a.t) ? { t, raw: Number(r[m.field]) } : a;
      }, null);
      const rawLast = newest?.raw;
      const rawOk = rawLast != null && !(m.rawValid && (rawLast < m.rawValid.min || rawLast > m.rawValid.max));
      const expect = rawOk ? Math.max(0, Math.min(100, ((3015 - rawLast) / 3015) * 100)) : null;
      chk(`${m.label} · хөрвүүлэлт (${rawLast}мм → %)`, r2(expect) === r2(series.latest),
        `тооцоо ${r2(expect)}% = UI ${r2(series.latest)}%`);
      chk(`${m.label} · түүхий мужаас гадуур → гэмтэл`, rawOk || series.fault === true);
      const rawMax = Math.max(...rows.map((r) => Number(r[m.field]))
        .filter((x) => Number.isFinite(x) && !(m.rawValid && (x < m.rawValid.min || x > m.rawValid.max))));
      /* ⚠️ 2026-10-09 (амьд): хоосон савны заалт 3045мм — мэдрэгч амсраас дээш тул гүнээс 30мм
         давна (derive 0%-д хавчина). Хүлцэл 5% (±150мм); 1.5× = rawValid-ийн гэмтлийн хил. */
      chk('савны гүн 3015мм — түүхий дээд утгатай нийцэх (±5%)', Math.abs(rawMax - 3015) <= 3015 * 0.05,
        `бүртгэгдсэн дээд ${rawMax}мм`);
    }

    /* 4. Хоногийн зөрүү (усны тоолуур) */
    /* ⚠️ 2026-10-09: sensors.ts-ийн 2026-09-21 / 2026-09-25 дүрмийг БИЕ ДААН давтана —
       урьд нь хуучин «хоног доторх max − min»-ээр тулгадаг байсан тул шалгалт ҮРГЭЛЖ
       зөрдөг байв. Дүрэм: хоногийн СҮҮЛИЙН заалт − ӨМНӨХ (дараалсан, УБ-ын хуанлиар)
       хоногийн СҮҮЛИЙН заалт; цоорхой хоног ба сөрөг зөрүү цэггүй; БҮТЭН цуваанаас
       бодоод дараа нь хүрээгээр огтолно. */
    if (m.dailyDiff) {
      const d = sn.series.find((x) => x.key === m.dailyDiff.key);
      const lastByDay = new Map();
      for (const r of pts) {
        const k = ubDay(r.t);
        const c = lastByDay.get(k);
        if (!c || r.t >= c.t) lastByDay.set(k, r);
      }
      const days = [...lastByDay.values()].sort((a, b) => a.t - b.t);
      const expAll = [];
      for (let i = 1; i < days.length; i++) {
        if (ubDay(days[i].t) !== ubDay(days[i - 1].t) + 1) continue;
        const v = days[i].v - days[i - 1].v;
        if (v >= 0) expAll.push({ t: days[i].t, v });
      }
      const exp = expAll.filter((x) => x.t >= from).map((x) => x.v);
      const expLast = expAll.length ? expAll[expAll.length - 1].v : null;
      chk(`${m.dailyDiff.label} · хоногийн тоо`, d && d.points.length === exp.length,
        `эх ${exp.length} хоног = UI ${d?.points.length}`);
      chk(`${m.dailyDiff.label} · сүүлийн хоногийн хэрэглээ`,
        d && r2(expLast) === r2(d.latest),
        `эх ${r2(expLast)} = UI ${r2(d?.latest)}`);
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
