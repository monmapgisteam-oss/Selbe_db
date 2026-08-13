/**
 * ГРАФИКИЙН БЛОКИЙН ШАЛГУУР — `parseChart` ба Telegram-ийн хасалт.
 *
 * ⚠️ Агентын гаргах JSON нь ЗАГВАРААС ирдэг тул төгс байх баталгаагүй: тоог
 * хашилтад бичих, хувийн тэмдэг залгах, нэг цэг өгөх, блокоо хаалгүй орхих
 * зэрэг бүгд бодитоор тохиолддог. Аль нь ч чатыг унагаах ЁСГҮЙ.
 *
 * Ажиллуулах: node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/chart.check.mjs
 */

import { strict as assert } from 'node:assert';
import { parseChart } from '@/lib/agent/chart';
import { toHtml } from '../../tools/telegram-format.mjs';

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, `✗ ${name}`);
  console.log('  ✓', name);
  pass++;
};

console.log('\n1. Зөв блок');
{
  const c = parseChart('{"type":"bar","title":"Гүйцэтгэл","unit":"%","data":[{"label":"Багц 1","value":19.7},{"label":"Багц 2","value":24.8}]}');
  ok('төрөл, гарчиг, нэгж уншигдав', c && c.type === 'bar' && c.title === 'Гүйцэтгэл' && c.unit === '%');
  ok('2 цэг үлдэв', c.data.length === 2 && c.data[1].value === 24.8);
}

console.log('\n2. Загварын түгээмэл САЛГАЛТ');
ok('хашилтад орсон тоо тоо болов',
  parseChart('{"type":"bar","data":[{"label":"a","value":"19.7"},{"label":"b","value":"3"}]}').data[0].value === 19.7);
ok('мянгатын таслал арилав',
  parseChart('{"type":"column","data":[{"label":"a","value":"1,788"},{"label":"b","value":2}]}').data[0].value === 1788);
ok('нэг цэгтэй график татгалзав',
  parseChart('{"type":"bar","data":[{"label":"a","value":1}]}') === null);
ok('утгагүй тоотой мөр хасагдав (үлдсэн 2)',
  parseChart('{"type":"bar","data":[{"label":"a","value":"тодорхойгүй"},{"label":"b","value":2},{"label":"c","value":3}]}').data.length === 2);
ok('шошгогүй мөр хасагдав',
  parseChart('{"type":"bar","data":[{"label":"","value":5},{"label":"b","value":2},{"label":"c","value":3}]}').data.length === 2);
ok('12-оос олон бол таслав',
  parseChart(`{"type":"bar","data":${JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({ label: `s${i}`, value: i + 1 })),
  )}}`).data.length === 12);

console.log('\n2б. Шинэ төрөл — `stack` ба `gauge`');
ok('stack уншигдав',
  parseChart('{"type":"stack","data":[{"label":"Чөлөөлсөн","value":1703},{"label":"Үлдсэн","value":171}]}').type === 'stack');
ok('gauge НЭГ цэгээр хүчинтэй',
  parseChart('{"type":"gauge","data":[{"label":"Нийт гүйцэтгэл","value":18.2}]}').data.length === 1);
ok('gauge-ийн бутархай (0.182) хувь болов',
  parseChart('{"type":"gauge","data":[{"label":"x","value":0.182}]}').data[0].value === 18.2);
ok('gauge-ийн 18.2 хэвээр (давхар үржүүлэхгүй)',
  parseChart('{"type":"gauge","data":[{"label":"x","value":18.2}]}').data[0].value === 18.2);
ok('gauge-ийн 1.0 нь 100% болов',
  parseChart('{"type":"gauge","data":[{"label":"x","value":1}]}').data[0].value === 100);
ok('bar НЭГ цэгээр ХҮЧИНГҮЙ хэвээр',
  parseChart('{"type":"bar","data":[{"label":"a","value":5}]}') === null);

console.log('\n2в. `note` — графикийн доорх тайлбар');
ok('note уншигдав',
  parseChart('{"type":"bar","note":"Багц 2 тэргүүлж байна.","data":[{"label":"a","value":1},{"label":"b","value":2}]}').note === 'Багц 2 тэргүүлж байна.');
ok('note байхгүй бол undefined',
  parseChart('{"type":"bar","data":[{"label":"a","value":1},{"label":"b","value":2}]}').note === undefined);

console.log('\n3. Буруу оролт — БҮГД null (чат унахгүй)');
ok('эвдэрсэн JSON', parseChart('{"type":"bar",,,}') === null);
ok('хоосон мөр', parseChart('') === null);
ok('танихгүй төрөл', parseChart('{"type":"radar","data":[{"label":"a","value":1},{"label":"b","value":2}]}') === null);
ok('data массив биш', parseChart('{"type":"bar","data":"муу"}') === null);
ok('data огт байхгүй', parseChart('{"type":"pie"}') === null);
ok('массив дотор хогтой', parseChart('{"type":"bar","data":[null,5,{"label":"b","value":2},{"label":"c","value":3}]}').data.length === 2);

console.log('\n4. Telegram — JSON ГАРАХГҮЙ, `note` дүгнэлт ҮЛДЭНЭ');
{
  const md = [
    'Багц 2 тэргүүлж байна.',
    '```chart',
    '{"type":"bar","note":"Багц 2 тэргүүлж, Багц 3.1 хоцорсон.","data":[{"label":"Багц 2","value":24.8},{"label":"Багц 3.1","value":0.7}]}',
    '```',
    'Эх сурвалж: `mon:building`',
  ].join('\n');
  const h = toHtml(md);
  ok('JSON гараагүй', !h.includes('"type"') && !h.includes('"label"'));
  ok('хашлага гараагүй', !h.includes('```'));
  // ⚠️ ГОЛ ШАЛГУУР: тайлбар нь JSON дотор байдаг тул блокийг бүхэлд нь
  //    хаявал Telegram хэрэглэгч шинжилгээг бүрэн алдана
  ok('`note` дүгнэлт ҮЛДСЭН', h.includes('Багц 2 тэргүүлж, Багц 3.1 хоцорсон'));
  ok('эх сурвалж хасагдсан', !h.includes('mon:building'));
}
{
  // note-гүй график — юу ч үлдэхгүй, гэхдээ бусад текст хэвээр
  const h = toHtml(['Эхлэл.', '```chart', '{"type":"bar","data":[{"label":"a","value":1}]}', '```', 'Төгсгөл.'].join('\n'));
  ok('note-гүй бол JSON гарахгүй', !h.includes('type') && !h.includes('value'));
  ok('эргэн тойрны текст хэвээр', h.includes('Эхлэл') && h.includes('Төгсгөл'));
}
{
  // Хариулт таслагдаж хаалтын хашлага ирээгүй тохиолдол
  const h = toHtml(['Эхлэл.', '```chart', '{"type":"bar","data":[{"label":"a",'].join('\n'));
  ok('хаалтгүй блок бүрэн залгигдсан', !h.includes('type') && h.includes('Эхлэл'));
}

console.log(`\n✅ Графикийн блок — ${pass} шалгуур давлаа\n`);
