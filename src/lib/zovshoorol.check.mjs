import assert from 'node:assert/strict';
import { loadZov, byBagts, summarize, TOLOV, validateZov, oidKey, oidField, F, URL as ZURL } from '@/lib/zovshoorol.ts';
const rows = await loadZov();
assert.ok(rows, 'татаж чадсангүй');
assert.ok(rows.length > 0, 'мөр алга');
console.log(`✅ ${rows.length} мөр уншигдав`);

/* ── OBJECTID ─────────────────────────────────────────────────────────────
   ⚠️ 2026-09-04: `F.oid` нь `'ObjectID'` гэж бичигдсэн байхад амьд хүснэгт
   `OBJECTID` (том үсгээр) тул БҮХ мөр `oid = 0` болж, засвар бүр ШИНЭ мөр
   нэмж, «Устгах» чимээгүй ажиллахгүй байв. Энэ шалгуур тэр ангиллын алдааг
   дахин гаргахгүй: (1) амьд мөр бүрийн oid > 0, (2) метадатагийн
   `objectIdField` кодтой таарна, (3) хайлт нь ҮСГИЙН МЭДРЭМЖГҮЙ. */
const zeroOid = rows.filter((r) => !r.oid);
assert.equal(zeroOid.length, 0,
  `${zeroOid.length}/${rows.length} мөрийн OBJECTID уншигдсангүй: ${zeroOid.map((r) => r.ner).join(', ')}`);
const oids = rows.map((r) => r.oid);
assert.equal(new Set(oids).size, oids.length, 'OBJECTID давхардав — таних чанараа алдсан');
console.log(`✅ ${rows.length}/${rows.length} мөрийн oid > 0 ба давхардалгүй (${oids.join(', ')})`);

const meta = await (await fetch(`${ZURL}?f=json`)).json();
assert.ok(!meta.error, `метадата алдаа: ${JSON.stringify(meta.error)}`);
assert.ok(/^objectid$/i.test(String(meta.objectIdField)),
  `метадатагийн objectIdField = ${meta.objectIdField}`);
assert.equal(await oidField(), meta.objectIdField,
  `oidField() нь метадататай таарахгүй байна (${await oidField()} ≠ ${meta.objectIdField})`);
assert.equal(F.oid.toLowerCase(), String(meta.objectIdField).toLowerCase(),
  `F.oid (${F.oid}) нь амьд талбар (${meta.objectIdField})-аас ЯЛГААТАЙ`);
console.log(`✅ objectIdField = ${meta.objectIdField} — код ба үйлчилгээ таарав`);

/* ⚠️ Том/жижиг үсгийн ХОЁУЛАНГ нь таних ёстой — үйлчилгээ бүр өөр бичлэгтэй. */
for (const k of ['OBJECTID', 'ObjectID', 'objectid', 'objectID'])
  assert.equal(oidKey({ [k]: 7, bagts: 'x' }), k, `oidKey нь «${k}»-г танихгүй байна`);
assert.equal(oidKey({ OBJECTID_1: 7, FID: 3 }), null, 'oidKey нь буруу талбарыг авах ёсгүй');
console.log('✅ oidKey — үсгийн 4 хувилбар таарч, ойролцоо нэрийг авахгүй');

const bad = rows.filter((r) => r.tolov === 'unknown');
assert.equal(bad.length, 0, `танихгүй төлөв: ${bad.map((b) => b.ner).join(', ')}`);
console.log('✅ бүх төлөв танигдав');

const dated = rows.filter((r) => r.ognoo != null);
assert.ok(dated.length > 0, 'нэг ч огноо уншигдсангүй — DateOnly хөрвүүлэлт ажиллаагүй');
for (const r of dated) assert.ok(Number.isFinite(r.ognoo), `огноо NaN: ${r.ner}`);
console.log(`✅ ${dated.length} огноо зөв хөрвөв`);

const d = (ms) => { const x = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${x.getUTCFullYear()}-${p(x.getUTCMonth()+1)}-${p(x.getUTCDate())}`; };
console.log('\n── ДЭЛГЭЦЭНД ЮУ ГАРАХ ──');
for (const [b, list] of byBagts(rows)) {
  const sm = summarize(list);
  console.log(`\n${b}   ${sm.ok} зөвшөөрсөн · ${sm.wait} хүлээгдэж буй · ${sm.no} зөвшөөрөөгүй${sm.alert ? '   ⚠ багц улаан' : ''}`);
  for (const z of list) {
    const i = z.tolov === TOLOV.ok ? '✓' : z.tolov === TOLOV.no ? '! анивчина' : '⏳';
    console.log(`   ${z.shat}. ${z.ner.padEnd(30)} ${i.padEnd(11)} ${z.ognoo ? d(z.ognoo) : ''}  ${z.dugaar}`);
  }
}
console.log('амьд уншилт: ok');

/* ── МАЯГТЫН ШАЛГУУР (сүлжээгүй) ── */
const all = [
  { oid: 1, bagts: 'Багц 1', shat: 1, ner: 'Барилга барих зөвшөөрөл', selbe: '', tolov: TOLOV.ok, ognoo: 0, dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '' },
];
const base = { bagts: 'Багц 1', shat: 2, ner: 'Шинэ', selbe: '', tolov: TOLOV.wait, ognoo: null, dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '' };
const has = (d, k) => Boolean(validateZov(d, all)[k]);

assert.equal(Object.keys(validateZov(base, all)).filter((k)=>validateZov(base,all)[k]).length, 0, 'хэвийн ноорог зөрчилгүй');
console.log('✅ хэвийн ноорог өнгөрнө');

assert.ok(has({ ...base, ner: '  ' }, 'ner'), 'нэргүй');
assert.ok(has({ ...base, bagts: '' }, 'bagts'), 'багцгүй');
assert.ok(has({ ...base, shat: 0 }, 'shat'), 'дараалал 0');
assert.ok(has({ ...base, shat: 1.5 }, 'shat'), 'бутархай дараалал');
console.log('✅ заавал талбарууд баригдана');

assert.ok(has({ ...base, shat: 1 }, 'shat'), 'дараалал давхардал');
assert.ok(validateZov({ ...base, shat: 1 }, all).shat.includes('Барилга барих'),
  'давхардсан зөвшөөрлийн НЭР мессежид байх ёстой');
console.log('✅ давхардлыг нэрээр нь хэлнэ');

assert.ok(has({ ...base, tolov: TOLOV.ok }, 'ognoo'), 'зөвшөөрсөн атлаа огноогүй');
assert.ok(has({ ...base, tolov: TOLOV.no }, 'ognoo'), 'зөвшөөрөөгүй атлаа огноогүй');
assert.ok(has({ ...base, ognoo: 1 }, 'ognoo'), 'хүлээгдэж буй атлаа огноотой');
console.log('✅ төлөв ба огнооны нийцэл');

assert.equal(has({ ...base, oid: 1, shat: 1 }, 'shat'), false, 'өөрийгөө давхардал гэж үзэх ёсгүй');
console.log('✅ засварлаж буй мөр өөртэйгөө зөрчилдөхгүй');

console.log('');
console.log('zovshoorol: ok');
