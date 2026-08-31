/**
 * НООРОГИЙН БҮРЭН БАЙДАЛ — «Гүйцэтгэл бөглөх».
 *
 * ⚠️ Энэ шалгуур нь 2026-08-29-ны БОДИТ цоорхойг хамгаална: ноорогт зөвхөн
 * гүйцэтгэлийн нүд ба нэмсэн мөр ордог байсан тул ОГНОО, БАРИМТ БИЧИГ,
 * «Шинэчлэгдсэн огноо» гурав компьютер унтрахад чимээгүй алга болдог байв.
 *
 * ⚠️ React дэлгэцийг энд ажиллуулах боломжгүй тул ГЭРЭЭГ барина: `Draft`
 * бүтэц, хадгалах ба сэргээх талын талбарууд ТААРАХ ёстой. Нэг тал нь
 * хоцровол засвар чимээгүй алдагдана — яг тэр алдааг энэ файл барина.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
const between = (a, b, from = 0) => {
  const i = SRC.indexOf(a, from);
  assert.ok(i >= 0, `«${a}» олдсонгүй`);
  const k = SRC.indexOf(b, i + a.length);
  assert.ok(k > i, `«${a}»-ийн дараа «${b}» олдсонгүй`);
  return SRC.slice(i, k);
};

/* ── 1. Draft төрөлд бүх засварын төрөл байх ── */
const typeBlock = between('type Draft = {', 'adds?: NewRow[];');
for (const f of ['cells:', 'dates?:', 'docs?:', 'asOf?:']) {
  assert.ok(typeBlock.includes(f), `Draft-д «${f}» талбар алга`);
}
console.log('✅ Draft төрөл — cells · dates · docs · asOf · adds');

/* ── 2. ХАДГАЛАХ талд дөрвүүлэн бичигдэх ── */
const saveBlock = between('saveDraftLS(pkg.key, {', '});');
for (const [f, expr] of [['cells:', 'pending'], ['dates:', 'pendDate'], ['docs:', 'pendDoc'], ['asOf:', 'asOf'], ['adds,', 'adds']]) {
  assert.ok(saveBlock.includes(f), `хадгалалтад «${f}» алга`);
  assert.ok(saveBlock.includes(expr), `хадгалалтад «${expr}» төлөв алга`);
}
console.log('✅ хадгалалт — дөрвүүлэн төлөв ноорогт орно');

/* ── 3. ХООСОН шалгалт дөрвүүлэнгээр ──
   ⚠️ Зөвхөн `pending`-ээр шалгавал огноо/баримт засаад гүйцэтгэлийн нүд
   хөндөөгүй хэрэглэгчийн ноорог хадгалагдахын оронд УСТАНА. */
const emptyBlock = between('const asOfChanged = asOf !== asOfOrig;', 'saveDraftLS(pkg.key, {');
for (const st of ['pending', 'pendDate', 'pendDoc', 'adds', 'asOfChanged']) {
  assert.ok(emptyBlock.includes(st), `хоосон шалгалтад «${st}» алга`);
}
console.log('✅ хоосон шалгалт — дөрвүүлэнгээр');

/* ── 4. СЭРГЭЭХ талд бүх төрөл буцаж тавигдана ── */
const restore = between('const d = readDraft(pkg.key);', '} else clearDraftLS(pkg.key);');
for (const setter of ['setPending(next)', 'setPendDate(nextDates)', 'setPendDoc(nextDocs)', 'setAsOf(draftAsOf)', 'setAdds(']) {
  assert.ok(restore.includes(setter), `сэргээлтэд «${setter}» алга`);
}
console.log('✅ сэргээлт — дөрвүүлэн төлөв буцаж тавигдана');

/* ── 5. ЭРХИЙН ХААЛТ сэргээлтэд ХЭВЭЭР ──
   Эрх хооронд нь хасагдсан бол ноорог дахь өгөгдөл дэлгэцэд гарах ёсгүй. */
assert.ok(restore.includes('canPerf ? d.cells'), 'гүйцэтгэлийн нүд canPerf-гүй сэргээгдэж байна');
assert.ok(restore.includes('canPerf ? (d.dates'), 'огноо canPerf-гүй сэргээгдэж байна');
assert.ok(restore.includes('canQaqc ? (d.docs'), 'баримт canQaqc-гүй сэргээгдэж байна');
assert.ok(restore.includes('canAddRow ?'), 'нэмсэн мөр canAddRow-гүй сэргээгдэж байна');
console.log('✅ сэргээлт эрхээр хамгаалагдсан хэвээр');

/* ── 6. Хуучин/эвдэрсэн ноорог БҮХЭЛДЭЭ хаягдахгүй ── */
const readBlock = between('const readDraft =', 'const saveDraftLS =');
assert.ok(readBlock.includes('d.dates = undefined'), 'эвдэрсэн dates ноорогийг бүхэлд нь хаяж байна');
assert.ok(readBlock.includes('d.docs = undefined'), 'эвдэрсэн docs ноорогийг бүхэлд нь хаяж байна');
console.log('✅ эвдэрсэн талбар ноорогийг бүхэлд нь хаяхгүй');

/* ── 7. Автомат хадгалалт ИЛ харагдана ── */
assert.ok(SRC.includes('setSavedAt(at)'), 'хадгалсан агшин тэмдэглэгдэхгүй байна');
assert.ok(SRC.includes('ноорог хадгалагдав {0}'), 'хадгалалтын үзүүлэлт дэлгэцэд алга');
console.log('✅ автомат хадгалалт дэлгэцэд ил');

console.log('\ndraft.check: ok');
