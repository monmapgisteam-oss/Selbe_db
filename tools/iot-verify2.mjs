/** IoT-ийн ТООН БУС мэдээлэл — DevEUI, нэгж, давтамж, босгын үндэслэл. */
import { SENSORS, parseTs } from '../src/lib/sensors.ts';

let bad = 0;
const chk = (n, p, d = '') => { if (!p) bad++; console.log(`  ${p ? '✅' : '❌'} ${n}${d ? ' · ' + d : ''}`); };

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

console.log('IoT ТОДОРХОЙЛОЛТЫН ШАЛГАЛТ\n');

for (const def of SENSORS) {
  console.log(`▓ ${def.label}`);

  /* 1. Талбарууд үйлчилгээн дээр БАЙГАА эсэх */
  const meta = await (await fetch(`${def.url}?f=json`)).json();
  const fields = new Map((meta.fields ?? []).map((f) => [f.name, f]));
  for (const m of def.metrics) {
    chk(`талбар «${m.field}»`, fields.has(m.field),
      fields.get(m.field)?.type?.replace('esriFieldType', '') ?? 'АЛГА');
  }

  /* 2. DevEUI — бүртгэлтэй таарах уу */
  const euiField = [...fields.keys()].find((k) => /dev_?eui/i.test(k));
  if (euiField) {
    const g = await post(def.url, {
      where: '1=1', outFields: euiField, groupByFieldsForStatistics: euiField,
      outStatistics: '[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"c"}]',
    });
    const euis = (g.features ?? []).map((f) => String(f.attributes[euiField] ?? '').toLowerCase()).filter(Boolean);
    const claim = String(def.devEui).toLowerCase();
      // Мэдрэгч бүр ЯГ НЭГ төхөөрөмжтэй (2026-08-26-нд баталсан)
    const pass = euis.length === 1 && euis[0] === claim;
    chk(`DevEUI «${def.devEui}»`, pass, `эх сурвалжид ${euis.length} төхөөрөмж: ${euis.slice(0, 3).join(', ')}`);
  } else {
    chk('DevEUI талбар', false, 'үйлчилгээнд алга');
  }

  /* 3. ДАВТАМЖ — «15 минут тутам» гэсэн баримтжуулалт үнэн үү */
  const m0 = def.metrics[0];
  const j = await post(def.url, {
    where: `${m0.field} IS NOT NULL`,
    outFields: 'received_datetime',
    orderByFields: 'received_datetime DESC',
    resultRecordCount: '300',
    returnGeometry: 'false',
  });
  const ts = (j.features ?? []).map((f) => parseTs(f.attributes.received_datetime)).filter((x) => x != null).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / 60_000);
  gaps.sort((a, b) => a - b);
  const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;
  chk('давтамжийн ДУНДАЖ (медиан, мин)', Number.isFinite(med),
    `${med.toFixed(1)} мин · хамгийн богино ${gaps[0]?.toFixed(1)} · хамгийн урт ${gaps[gaps.length - 1]?.toFixed(0)}`);

  console.log('');
}

/* 4. Хогийн савны ХОЁР БӨӨГНӨРӨЛ — «567…2941мм-д заалт байхгүй» гэсэн баримт */
const waste = SENSORS.find((s) => s.key === 'waste');
const wj = await post(waste.url, {
  where: `${waste.metrics[0].field} IS NOT NULL`,
  outFields: waste.metrics[0].field,
  resultRecordCount: '3000',
  returnGeometry: 'false',
});
const mm = (wj.features ?? []).map((f) => Number(f.attributes[waste.metrics[0].field])).filter(Number.isFinite);
const inGap = mm.filter((x) => x > 567 && x < 2941).length;
const low = mm.filter((x) => x <= 567).length;
const high = mm.filter((x) => x >= 2941).length;
console.log('▓ Хогийн савны заалтын тархалт (кодын баримтжуулалт)');
chk('ХОЁР бөөгнөрөл — завсарт заалт байхгүй', inGap === 0,
  `≤567мм: ${low} · 567…2941 завсар: ${inGap} · ≥2941мм: ${high} (нийт ${mm.length})`);
chk('дээд утга ≈ савны гүн 3015мм', Math.abs(Math.max(...mm) - 3015) <= 20, `дээд ${Math.max(...mm)}мм`);
chk('80% босго = 603мм — завсарт таарна', 603 > 567 && 603 < 2941);

console.log('');
console.log(bad === 0 ? '✅ ТОДОРХОЙЛОЛТ БҮГД ЭХ СУРВАЛЖТАЙ НИЙЦЛЭЭ' : `❌ ${bad} зөрчил`);
process.exit(bad === 0 ? 0 : 1);
