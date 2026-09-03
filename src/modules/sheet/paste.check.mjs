/**
 * ОЛОН НҮДНИЙ БУУЛГАЛТ — `paste.ts`.
 *
 * ⚠️ ГОЛ ЭРСДЭЛ нь ЭГНЭЭ ГУЛСАХ: бичигдэхгүй мөр (бүлэг) таарахад доорх бүх
 * утга нэг мөр дээшилбэл өгөгдөл БУРУУ ажилд бичигдэнэ. Дэлгэц дээр бүх зүйл
 * зөв мэт харагддаг тул нүдээр илрэхгүй — зөвхөн энэ тест барина.
 */
import assert from 'node:assert/strict';
import {
  parseGrid, normCell, planPaste, PASTE_MAX_CELLS,
} from '@/modules/sheet/paste.ts';

/* ── Задлалт ── */
assert.deepEqual(parseGrid('1\t2\n3\t4'), [['1', '2'], ['3', '4']]);
// ⚠️ Excel сүүлд мөрийн шилжилт нэмдэг — нэмэлт хоосон мөр үүсгэж БОЛОХГҮЙ
assert.equal(parseGrid('1\n2\n').length, 2);
assert.equal(parseGrid('1\r\n2\r\n').length, 2);
assert.equal(parseGrid('1\n2\n\n\n').length, 2);
// Дундах хоосон мөр нь БАЙРЛАЛ тул хадгалагдана
assert.equal(parseGrid('1\n\n3').length, 3);
console.log('✅ задлалт — мөр/багана, Excel-ийн сүүлийн шилжилт');

/* ── Нүдний утга ── */
assert.equal(normCell('12'), '12');
assert.equal(normCell(' 1 234,5 '), '1234.5');   // энгийн зай + таслал
assert.equal(normCell('1 234'), '1234');     // NBSP — Excel-ийн мянгат
assert.equal(normCell('1 234'), '1234');     // нарийн зай
assert.equal(normCell('45%'), '45');
assert.equal(normCell('+12'), '12');
assert.equal(normCell('-5'), '-5');               // тоо мөн — тэглэлт нь planPaste-д
assert.equal(normCell(''), null);
assert.equal(normCell('   '), null);
assert.equal(normCell('тийм'), null);
assert.equal(normCell('1,2,3'), null);
console.log('✅ нүдний утга — Excel-ийн бичиглэлүүд, тоо бишийг няцаана');

/* ── БАЙРЛАЛ: бүлгийн мөр байраа эзэлнэ ── */
{
  /* мөр 0, 3 нь бүлэг → бичигдэхгүй; бусад нь бичигдэнэ */
  const group = new Set([0, 3]);
  const canWrite = (row) => !group.has(row);
  const vis = [0, 1, 2, 3, 4];
  const { hits, skipped } = planPaste(parseGrid('10\n20\n30\n40\n50'), vis, 3, 0, 0, canWrite);
  assert.deepEqual(hits, [
    { row: 1, b: 0, v: '20' },
    { row: 2, b: 0, v: '30' },
    { row: 4, b: 0, v: '50' },
  ], 'бүлгийн мөрийн утга хаягдаж, БУСАД нь БАЙРАНДАА үлдэв');
  assert.equal(skipped, 2);
  console.log('✅ бүлгийн мөр байрлалаа эзэлж, эгнээ ГУЛСААГҮЙ');
}

/* ── Блок: мөр × багана ── */
{
  const vis = [0, 1, 2, 3, 4];
  const { hits } = planPaste(parseGrid('1\t2\t3\n4\t5\t6'), vis, 3, 1, 0, () => true);
  assert.deepEqual(hits.map((h) => [h.row, h.b, h.v]), [
    [1, 0, '1'], [1, 1, '2'], [1, 2, '3'],
    [2, 0, '4'], [2, 1, '5'], [2, 2, '6'],
  ]);
  console.log('✅ блок — мөр × багана зөв тархав');
}

/* ── Ирмэгээс хальсан хэсэг ЧИМЭЭГҮЙ бичигдэхгүй ── */
{
  const vis = [0, 1, 2];
  // Баруун тийш: 3 блоктой хүснэгтэд b=1-ээс 5 утга → 2 нь багтана
  const r = planPaste(parseGrid('1\t2\t3\t4\t5'), vis, 3, 0, 1, () => true);
  assert.deepEqual(r.hits.map((h) => [h.b, h.v]), [[1, '1'], [2, '2']]);
  assert.equal(r.skipped, 3);
  // Доош: 3 харагдах мөрд 5 мөр → 2 нь хальна
  const d = planPaste(parseGrid('1\n2\n3\n4\n5'), vis, 3, 0, 0, () => true);
  assert.equal(d.hits.length, 3);
  assert.equal(d.skipped, 2);
  console.log('✅ хүснэгтийн ирмэгээс хальсан утга алгасагдав');
}

/* ── ХООСОН нүд УСТГАХГҮЙ ── */
{
  const vis = [0, 1];
  const { hits, skipped, bad } = planPaste(parseGrid('1\t\t3'), vis, 3, 0, 0, () => true);
  assert.deepEqual(hits.map((h) => [h.b, h.v]), [[0, '1'], [2, '3']]);
  assert.equal(skipped, 1, 'хоосон нь алгасалт — устгал БИШ');
  assert.equal(bad, 0, 'хоосон нь «тоо биш» гэж тооцогдохгүй');
  console.log('✅ хоосон нүд бөглөсөн утгыг устгахгүй');
}

/* ── Тоо бишийг тусад нь тоолно ── */
{
  const vis = [0, 1];
  const { hits, bad } = planPaste(parseGrid('5\tабв'), vis, 3, 0, 0, () => true);
  assert.equal(hits.length, 1);
  assert.equal(bad, 1);
  console.log('✅ тоо бишийг тусад нь тоолов');
}

/* ── Сөрөг утга 0 болж тэгшитнэ (`commit`-тэй ижил дүрэм) ── */
{
  const { hits } = planPaste(parseGrid('-7'), [0], 1, 0, 0, () => true);
  assert.equal(hits[0].v, '0');
  console.log('✅ сөрөг утга 0 болов');
}

/* ── Талбаргүй блокийг алгасна, БАЙРЛАЛ хадгалагдана ── */
{
  const vis = [0, 1];
  // блок 1-д обьёмын талбар байхгүй гэж үзье
  const canWrite = (_row, b) => b !== 1;
  const { hits, skipped } = planPaste(parseGrid('1\t2\t3'), vis, 3, 0, 0, canWrite);
  assert.deepEqual(hits.map((h) => [h.b, h.v]), [[0, '1'], [2, '3']],
    'блок 2 нь «3»-ыг авав — «2» нь зүүн тийш ГУЛСААГҮЙ');
  assert.equal(skipped, 1);
  console.log('✅ талбаргүй блок алгасагдаж, багана гулсаагүй');
}

/* ── Асар том буулгалтын хамгаалалт ── */
{
  const big = Array.from({ length: 200 }, () => Array.from({ length: 50 }, (_, i) => String(i)).join('\t')).join('\n');
  const vis = Array.from({ length: 200 }, (_, i) => i);
  const { hits, skipped } = planPaste(parseGrid(big), vis, 50, 0, 0, () => true);
  assert.equal(hits.length + skipped, 200 * 50, 'нүд бүр тоологдов');
  assert.ok(hits.length <= PASTE_MAX_CELLS, 'дээд хязгаарт баригдав');
  assert.ok(skipped > 0, 'хэтэрсэн хэсэг чимээгүй алга болоогүй');
  console.log('✅ том буулгалт хязгаарлагдаж, хаягдсаныг тоолов');
}

console.log('\npaste.check: ok');
