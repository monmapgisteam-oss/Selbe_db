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

console.log('\n3. Буруу оролт — БҮГД null (чат унахгүй)');
ok('эвдэрсэн JSON', parseChart('{"type":"bar",,,}') === null);
ok('хоосон мөр', parseChart('') === null);
ok('танихгүй төрөл', parseChart('{"type":"radar","data":[{"label":"a","value":1},{"label":"b","value":2}]}') === null);
ok('data массив биш', parseChart('{"type":"bar","data":"муу"}') === null);
ok('data огт байхгүй', parseChart('{"type":"pie"}') === null);
ok('массив дотор хогтой', parseChart('{"type":"bar","data":[null,5,{"label":"b","value":2},{"label":"c","value":3}]}').data.length === 2);

console.log('\n4. Telegram — графикийн JSON ГАРАХГҮЙ, тайлбар ҮЛДЭНЭ');
{
  const md = [
    'Багц 2 тэргүүлж байна.',
    '```chart',
    '{"type":"bar","data":[{"label":"Багц 2","value":24.8}]}',
    '```',
    'Багц 2 хамгийн өндөр гүйцэтгэлтэй.',
    'Эх сурвалж: `mon:building`',
  ].join('\n');
  const h = toHtml(md);
  ok('JSON гараагүй', !h.includes('"type"') && !h.includes('label'));
  ok('хашлага гараагүй', !h.includes('```'));
  ok('тайлбар үлдсэн', h.includes('Багц 2 хамгийн өндөр гүйцэтгэлтэй'));
  ok('эх сурвалж хасагдсан', !h.includes('mon:building'));
}
{
  // Хариулт таслагдаж хаалтын хашлага ирээгүй тохиолдол
  const h = toHtml(['Эхлэл.', '```chart', '{"type":"bar","data":[{"label":"a",'].join('\n'));
  ok('хаалтгүй блок бүрэн залгигдсан', !h.includes('type') && h.includes('Эхлэл'));
}

console.log(`\n✅ Графикийн блок — ${pass} шалгуур давлаа\n`);
