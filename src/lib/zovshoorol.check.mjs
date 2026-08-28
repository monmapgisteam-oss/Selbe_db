import assert from 'node:assert/strict';
import { loadZov, byBagts, summarize, TOLOV, validateZov } from '@/lib/zovshoorol.ts';
const rows = await loadZov();
assert.ok(rows, 'татаж чадсангүй');
assert.ok(rows.length > 0, 'мөр алга');
console.log(`✅ ${rows.length} мөр уншигдав`);

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
console.log('\nzovshoorol: ok');

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
