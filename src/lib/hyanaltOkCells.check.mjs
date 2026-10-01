/**
 * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮД — МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮР (2026-10-01, хэрэглэгч: бүгдийг зас — ШИЙДВЭР).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltOkCells.check.mjs
 *
 * Хамгаалж буй алдаа: зөвшөөрөл `"мөрийн индекс:блок"`-оор хадгалагддаг тул мөр нэмэгдэх
 * (нэмэлт ажил) эсвэл архивт шинэ жааз үүсэхэд индекс гулсаж ногоон тэмдэг ӨӨР нүдэнд
 * буух байв. Одоо: бичих — зөвхөн шинэ хэлбэр; унших — хоёулаа; хуучныг мөрийн дараалал
 * баттай үед л, эс бөгөөс «мэдэхгүй» → «дахин хянах».
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  encodeOkCells, hash36, okRefKey, parseOkCells, parseOkRef, resolveOk, rowSids, toOkRefs,
} from './hyanaltOkCells.ts';

/* ── 1. sid — ижил шошготой мөрүүд дарааллаар ялгагдана ── */
{
  const rows = [{ no: '1', work: 'Суурь' }, { no: '2', work: 'Хана' }, { no: '1', work: 'Суурь' }];
  const s = rowSids(rows);
  assert.equal(s[0].split('.')[0], s[2].split('.')[0], 'ижил шошго — ижил хэш');
  assert.notEqual(s[0], s[2], 'давхардсан шошго дарааллын дугаараар ялгарах ёстой');
  assert.equal(s[0].endsWith('.0') && s[2].endsWith('.1'), true);
  assert.equal(rowSids([{ no: ' 1 ', work: 'Суурь ' }])[0], s[0], 'trim хийгдсэн утгаар бодно');
  assert.equal(hash36('a'), hash36('a'));
}

/* ── 2. Кодлох/задлах ── */
{
  const k = okRefKey({ oid: 12, sid: 'abc.0', block: '5/1' });
  assert.deepEqual(parseOkRef(k), { oid: 12, sid: 'abc.0', block: '5/1' });
  assert.deepEqual(parseOkRef('12|abc.0|A|B'), { oid: 12, sid: 'abc.0', block: 'A|B' }, 'блокийн шошгонд «|» байж болно');
  assert.equal(parseOkRef('эвдэрсэн'), null);
  const enc = encodeOkCells([k, k, 'муу']);
  assert.deepEqual(JSON.parse(enc), { v: 2, c: [k] }, 'давхардал ба эвдэрсэн мөр хасагдана, ЗӨВХӨН шинэ хэлбэр');
  assert.equal(parseOkCells('').kind, 'none');
  assert.equal(parseOkCells('[]').kind, 'none');
  assert.equal(parseOkCells(enc).kind, 'v2');
  assert.equal(parseOkCells('["3:5/1"]').kind, 'legacy');
  assert.equal(parseOkCells('{эвдэрсэн').kind, 'bad');
}

/* ── 3. МӨР НЭМЭГДЭЖ ИНДЕКС ГУЛССАН ч зөв нүд ногоон ── */
{
  const before = [{ no: '1', work: 'A' }, { no: '2', work: 'B' }, { no: '3', work: 'C' }];
  const sidB = rowSids(before);
  /* Хянагч 2-р (B) мөрийг зөвшөөрөв — oid 102 */
  const rowsAt = before.map((r, i) => ({ oid: 100 + i, sid: sidB[i] }));
  const refs = toOkRefs(['1:5/1'], rowsAt);
  const raw = encodeOkCells(refs);
  /* Дараа нь A-гийн ДАРАА шинэ мөр «A2» нэмэгдэж, бүх жааз шинэ OID-тэй болов */
  const after = [{ no: '1', work: 'A' }, { no: '1а', work: 'A2' }, { no: '2', work: 'B' }, { no: '3', work: 'C' }];
  const sidA = rowSids(after);
  const rowsNow = after.map((r, i) => ({ oid: 500 + i, sid: sidA[i] }));
  const res = resolveOk(parseOkCells(raw), rowsNow, false);
  assert.deepEqual([...res.keys], ['2:5/1'], 'B мөр (одоо 2-р индекс) ногоон байх ёстой — индекс гулсахгүй');
  assert.equal(res.unknown, 0);
  /* ХУУЧИН индексийн хэлбэр ижил нөхцөлд — итгэхгүй (мэдэхгүй) */
  const leg = resolveOk(parseOkCells('["1:5/1"]'), rowsNow, false);
  assert.equal(leg.keys.size, 0, 'хуучин индексийг мөрийн дараалал баттай биш үед ХЭРЭГЛЭХГҮЙ');
  assert.equal(leg.unknown, 1, '«дахин хянах» гэж тоологдох ёстой');
  /* Мөрийн дараалал баттай (жааз хэвээр) бол хуучныг уншина */
  const legOk = resolveOk(parseOkCells('["1:5/1"]'), rowsAt, true);
  assert.deepEqual([...legOk.keys], ['1:5/1']);
  /* Эвдэрсэн JSON → мэдэхгүй, ногоон юу ч үгүй */
  assert.deepEqual(resolveOk(parseOkCells('{x'), rowsNow, true), { keys: new Set(), unknown: 1 });
  /* Мөр огт олдохгүй (устгагдсан) → мэдэхгүй */
  const gone = resolveOk(parseOkCells(encodeOkCells(['999|zz.0|5/1'])), rowsNow, false);
  assert.equal(gone.unknown, 1);
  /* OID санамсаргүй давхцсан ч sid зөрвөл sid-ээр */
  const clash = rowsNow.map((r, i) => ({ ...r, oid: i === 0 ? 102 : r.oid }));
  assert.deepEqual([...resolveOk(parseOkCells(raw), clash, false).keys], ['2:5/1']);
}

/* ── 4. Эх кодын гэрээ ── */
{
  const S = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  assert.ok(S.includes('encodeOkCells(okCells)'), 'hyanaltStore: шинэ хэлбэрээр бичихгүй байна');
  assert.ok(!S.includes('[F.okCells]: JSON.stringify(okCells)'), 'hyanaltStore: хуучин индексийн массив бичигдсээр');
  const G = fs.readFileSync('src/modules/Guitsetgel.tsx', 'utf8');
  assert.ok(G.includes('toOkRefs(okKeys, okRows)'), 'Guitsetgel: зөвшөөрлийг мөрийн түлхүүрээр бичихгүй байна');
  assert.ok(G.includes('resolveOk(parseOkCells(curOkRaw), okRows, trusted)'), 'Guitsetgel: дахин шалгалт хоёр хэлбэрийг уншихгүй');
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  assert.ok(FN.includes('resolveOk(parseOkCells(src[HF.okCells]), idxRows, trusted)'), 'FillNew: гүйцэтгэгчийн тал хоёр хэлбэрийг уншихгүй');
  assert.ok(FN.includes('backOkRes.unknown > 0'), 'FillNew: «дахин хянах» мэдэгдэл алга');
  const D = fs.readFileSync('src/lib/hyanaltDetail.ts', 'utf8');
  assert.ok((D.match(/rid: `/g) ?? []).length >= 3, 'hyanaltDetail: өөрчлөлт бүрд мөрийн танигч (rid) алга');
}
console.log('✅ зөвшөөрсөн нүд — мөрийн түлхүүрээр · индекс гулсахгүй · хуучныг баттай үед л · эс бөгөөс «дахин хянах»');
