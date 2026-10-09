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
/* ⚠️ 2026-10-09: тэнхлэгтэй төрөлд утгагүй мөр ХАЯГДАХГҮЙ — null (цоорхой) болно
   (CLAUDE.md: null ≠ 0, цоорхой үлдээнэ). Урьд нь хасагддаг байсан тул хугацааны
   цуваанд тайлангүй сар алга болж хөрш сарууд шууд холбогддог байв. */
{
  const c = parseChart('{"type":"bar","data":[{"label":"a","value":"тодорхойгүй"},{"label":"b","value":2},{"label":"c","value":3}]}');
  ok('bar: утгагүй тоотой мөр null болж ҮЛДЭВ (3 мөр)', c.data.length === 3 && c.data[0].value === null);
  const l = parseChart('{"type":"line","data":[{"label":"1-р сар","value":5},{"label":"2-р сар","value":null},{"label":"3-р сар","value":7}]}');
  ok('line: дундах null цоорхой хэвээр (0 БИШ)', l.data.length === 3 && l.data[1].value === null);
  const m = parseChart('{"type":"column","data":[{"label":"a"},{"label":"b","value":2},{"label":"c","value":3}]}');
  ok('column: value талбаргүй мөр null', m.data.length === 3 && m.data[0].value === null);
  ok('pie: null зүсмэг ХАСАГДАНА (эзлэх хувьд цоорхой утгагүй)',
    parseChart('{"type":"pie","data":[{"label":"a","value":null},{"label":"b","value":2},{"label":"c","value":3}]}').data.length === 2);
  ok('бүгд null бол татгалзана',
    parseChart('{"type":"line","data":[{"label":"a","value":null},{"label":"b","value":null},{"label":"c","value":4}]}') === null);
  ok('gauge-ийн null ТАТГАЛЗАНА',
    parseChart('{"type":"gauge","data":[{"label":"x","value":null}]}') === null);
  /* ⚠️ 2026-10-09 (аудит №3): хоосон мөр / boolean / массив → null (урьд нь 0 / 1 / 0) */
  const e = parseChart('{"type":"line","data":[{"label":"a","value":""},{"label":"b","value":true},{"label":"c","value":"  "},{"label":"d","value":[]},{"label":"e","value":4},{"label":"f","value":"0"}]}');
  ok('хоосон/тоо биш утга цоорхой (0 БИШ), "0" нь жинхэнэ 0',
    e.data.length === 6 && e.data.slice(0, 4).every((d) => d.value === null) && e.data[4].value === 4 && e.data[5].value === 0);
}
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
/* ⚠️ 2026-09-03: АВТОМАТ ×100 ХӨРВҮҮЛЭЛТ ХАСАГДСАН. Урьд нь `value <= 1`
   бол «бутархай ирлээ» гэж үзээд 100-аар үржүүлдэг байсан ч энэ төсөлд
   ЖИНХЭНЭ 1%-иас бага заалт бодитоор тохиолддог — тэдгээр нь чимээгүй
   40% болж ХУДАЛ уншигдана. Одоо хуваарьт багтахгүйг ТАТГАЛЗАНА. */
ok('gauge-ийн жинхэнэ 0.182% ХЭВЭЭР (×100 хийхгүй)',
  parseChart('{"type":"gauge","data":[{"label":"x","value":0.182}]}').data[0].value === 0.182);
ok('gauge-ийн 18.2 хэвээр',
  parseChart('{"type":"gauge","data":[{"label":"x","value":18.2}]}').data[0].value === 18.2);
ok('gauge-ийн 1.0 нь 1% хэвээр (100 болгохгүй)',
  parseChart('{"type":"gauge","data":[{"label":"x","value":1}]}').data[0].value === 1);
ok('gauge 100-аас их бол ТАТГАЛЗАНА',
  parseChart('{"type":"gauge","data":[{"label":"x","value":118}]}') === null);
ok('gauge сөрөг бол ТАТГАЛЗАНА',
  parseChart('{"type":"gauge","data":[{"label":"x","value":-3}]}') === null);
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
