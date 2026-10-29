/**
 * АЖЛЫН МАТЕРИАЛ — гурван талын нийлүүлэлт (`mergeMats`), сүлжээгүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/materialAjil.check.mjs
 */
import assert from 'node:assert/strict';
import { mergeMats, parseMats, formatMats } from './materialAjil.ts';

/* 1. Сервер өөрчлөгдөөгүй → миний жагсаалт */
assert.deepEqual(mergeMats(['A'], ['A', 'B'], ['A']), ['A', 'B']);
/* 2. Бусдын НЭМСЭН нэр хадгалагдана (урьд нь дарагддаг байсан — аудитын жишээ: «Цемент» + «Арматур») */
assert.deepEqual(mergeMats([], ['Арматур'], ['Цемент']), ['Цемент', 'Арматур']);
/* 3. Бусдын ХАССАН нэр (би хөндөөгүй) дахин амилахгүй */
assert.deepEqual(mergeMats(['A', 'B'], ['A', 'B', 'C'], ['A']), ['A', 'C']);
/* 4. Миний хассан нэр хасагдана, бусдынх хэвээр */
assert.deepEqual(mergeMats(['A', 'B'], ['A'], ['A', 'B', 'D']), ['A', 'D']);
/* 5. Хоёулаа ижил нэр нэмсэн — нэг удаа */
assert.deepEqual(mergeMats([], ['X'], ['X']), ['X']);
/* 6. Хоёулаа хассан */
assert.deepEqual(mergeMats(['A'], [], []), []);
/* 7. Оролт хөндөгдөхгүй */
{
  const b = ['A']; const m = ['A', 'B']; const f = ['A', 'C'];
  mergeMats(b, m, f);
  assert.deepEqual([b, m, f], [['A'], ['A', 'B'], ['A', 'C']]);
}
/* 8. Нүдний текстээр эргэх хөрвүүлэлт — нийлүүлсэн жагсаалт `formatMats`-аар бичигдэнэ */
assert.equal(formatMats(mergeMats([], ['Арматур'], parseMats('Цемент'))), 'Цемент; Арматур');
assert.equal(formatMats(mergeMats(['Цемент'], [], parseMats('Цемент'))), null, 'хоосон → null (0 биш)');

console.log('materialAjil.check: ok — гурван талын нийлүүлэлт (бусдын нэр устахгүй)');
