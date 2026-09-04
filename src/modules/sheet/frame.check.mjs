/**
 * АРХИВЫН ЖААЗ ТАСЛАХ ДҮРЭМ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/frame.check.mjs
 *
 * ⚠️ Логик ХУУЛБАРЛААГҮЙ — `bagtsSheet.ts`-ийн ЖИНХЭНЭ `lastFrame`-ийг
 * импортолж шалгана. Тэндээ зассан зүйл энд шууд тусна.
 *
 * Хамгаалж буй алдаа (2026-09-01-нд бодитоор гарсан):
 *   `applyAdds` нь 500 мөрийн БАГЦААР бичдэг ба `rollbackOnFailure` зөвхөн нэг
 *   багц дотор үйлчилнэ. Нийтлэх дунд нь тасалдвал ДУТУУ жааз үлдэнэ. Урьд нь
 *   `lastFrame` уртыг шалгалгүй тэр дутуу жаазыг «хамгийн сүүлийн агшин» гэж
 *   буцаадаг байсан тул `Bagts_2_9f` (жаазууд [1386,1386,1386,1000]) дээр
 *   «Гүйцэтгэл бөглөх», «Хуваарь», хоцрогдлын тооцоо гурвуулаа НЭЭГДЭХЭЭ
 *   больж, алдааны бичвэр нь «шатлалын зураглал» гэж БУРУУ шалтгаан заадаг байв.
 */
import assert from 'node:assert/strict';
import { lastFrame, numLoose } from './bagtsSheet.ts';

const NO = 'dugaar';

/** №-ийн жагсаалтаас Feature массив — эхний № нь жаазны заагийг тэмдэглэнэ. */
const feats = (nos) => nos.map((n) => ({ attributes: { [NO]: n } }));

/** N мөрийн бүтэн жааз: «A» -ээр эхэлж, дараа нь b1..b(N-1) */
const frame = (n, tag) => ['A', ...Array.from({ length: n - 1 }, (_, i) => `${tag}${i + 1}`)];

const nosOf = (fs) => fs.map((f) => f.attributes[NO]);

/* ── 1. Ганц жааз — хэвээр буцаана ── */
{
  const all = feats(frame(5, 'x'));
  assert.equal(lastFrame(all, NO, 5).length, 5, 'ганц жааз бүтнээрээ');
}

/* ── 2. Хоёр БҮТЭН жааз — сүүлийнхийг авна ── */
{
  const all = feats([...frame(4, 'x'), ...frame(4, 'y')]);
  const got = lastFrame(all, NO, 4);
  assert.equal(got.length, 4, 'сүүлийн жаазын урт');
  assert.equal(got[1].attributes[NO], 'y1', 'СҮҮЛИЙН жааз сонгогдов');
}

/* ── 3. ГОЛ ТОХИОЛДОЛ: сүүлийн жааз ТАСАРСАН — өмнөх бүтнийг авна ──
   Bagts_2_9f-ийн бодит хэлбэр: [бүтэн, бүтэн, бүтэн, дутуу] */
{
  const all = feats([...frame(6, 'a'), ...frame(6, 'b'), ...frame(6, 'c'), ...frame(3, 'd')]);
  const got = lastFrame(all, NO, 6);
  assert.equal(got.length, 6, 'дутуу жаазыг алгасаж БҮТЭН жааз буцаана');
  assert.equal(got[1].attributes[NO], 'c1', 'сүүлийн БҮТЭН жааз (c) сонгогдов');
  assert.ok(!nosOf(got).includes('d1'), 'тасарсан жаазын мөр ОРООГҮЙ');
}

/* ── 4. Дараалсан ХОЁР тасалдал — хамгийн сүүлийн бүтнийг олтол ухарна ── */
{
  const all = feats([...frame(6, 'a'), ...frame(6, 'b'), ...frame(2, 'c'), ...frame(3, 'd')]);
  const got = lastFrame(all, NO, 6);
  assert.equal(got.length, 6, 'хоёр тасалдлыг давж бүтэн жааз олов');
  assert.equal(got[1].attributes[NO], 'b1', 'жааз b сонгогдов');
}

/* ── 5. МӨР НЭМЭГДСЭН жааз — уртсасныг тасарсан гэж БУРУУ бодохгүй ──
   ⚠️ Энэ бол сөрөг шалгуур: мөр нэмэх боломж нь бүтэн ажиллах ёстой. */
{
  const all = feats([...frame(6, 'a'), ...frame(8, 'b')]);
  const got = lastFrame(all, NO, 6);
  assert.equal(got.length, 8, 'нэмэгдсэн мөртэй ШИНЭ жааз хэвээр сонгогдов');
  assert.equal(got[1].attributes[NO], 'b1', 'сүүлийн (уртассан) жааз');
}

/* ── 6. Мөр нэмэгдсэний ДАРАА тасалдсан ──
   Өмнөх жааз 8 мөр, сүүлийнх 5 → тасарсан гэж үзнэ. */
{
  const all = feats([...frame(6, 'a'), ...frame(8, 'b'), ...frame(5, 'c')]);
  const got = lastFrame(all, NO, 6);
  assert.equal(got.length, 8, 'өмнөхөөсөө богино жааз хаягдав');
  assert.equal(got[1].attributes[NO], 'b1');
}

/* ── 7. Зураглалаас БОГИНО ганц давхардал — expect хамгаална ──
   Хоёр жааз хоёулаа 4 мөр ч зураглал 6 мөр хүлээж байвал сүүлийнх нь ч
   бүтэн биш. Ийм үед хамгийн эхнийх рүү ухарч, `loadRows`-ийн хатуу алдаа
   ажиллана — ЧИМЭЭГҮЙ буруу мөр буцаахаас дээр. */
{
  const all = feats([...frame(4, 'a'), ...frame(4, 'b')]);
  const got = lastFrame(all, NO, 6);
  assert.equal(got[1].attributes[NO], 'a1', 'бүтэн жааз олдоогүй тул эхнийх рүү ухарна');
}

/* ── 8. `expect` өгөөгүй (суурь агшин) — зөвхөн уртын харьцаагаар шийднэ ── */
{
  const all = feats([...frame(6, 'a'), ...frame(3, 'b')]);
  const got = lastFrame(all, NO);
  assert.equal(got.length, 6, 'expect-гүй ч тасарсан жаазыг таньна');
}

/* ── 9. Хоосон/богино оролт — унахгүй ── */
{
  assert.equal(lastFrame([], NO, 3).length, 0, 'хоосон массив');
  assert.equal(lastFrame(feats(['A']), NO, 3).length, 1, 'ганц мөр');
  assert.equal(lastFrame(feats(['', 'x']), NO, 3).length, 2, 'эхний № хоосон бол бүгдийг');
}

console.log('frame.check: ok — ганц ✓ хоёр бүтэн ✓ тасарсан ✓ давхар тасалдал ✓ '
  + 'мөр нэмэгдсэн ✓ нэмэгдээд тасарсан ✓ expect хамгаалалт ✓ суурь ✓ хязгаар ✓');

/* ── ТЕКСТЭЭР ХАДГАЛАГДСАН ТОО (2026-09-03) ──
   Багц 4.2·12F-ийн «Мөнгөн_дүн» нь String бөгөөд мянгатын таслалтай
   («13,670,427,055»). Урьд нь Number() NaN өгч, тэр багцын БҮХ 1,593 мөрд
   мөнгөн дүн null болж багана хоосон харагддаг байв. */
{
  const eq = (a, b, m) => assert.equal(a, b, `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  eq(numLoose('13,670,427,055'), 13670427055, 'мянгатын таслал');
  eq(numLoose('-58,555,780'), -58555780, 'сөрөг мянгатын таслал');
  eq(numLoose('1 234 567'), 1234567, 'зайгаар тусгаарласан');
  eq(numLoose('2,166.943'), 2166.943, 'таслал + аравтын цэг');
  eq(numLoose(42), 42, 'тоо шууд дамжина');
  eq(numLoose('42'), 42, 'энгийн тоон мөр');
  eq(numLoose(0), 0, 'тэг нь null БИШ');
  /* ⚠️ null ≠ 0 — уншигдахгүйг тэг болгож БОЛОХГҮЙ */
  eq(numLoose(null), null, 'null хэвээр');
  eq(numLoose(undefined), null, 'undefined → null');
  eq(numLoose(''), null, 'хоосон мөр → null');
  eq(numLoose('   '), null, 'зөвхөн зай → null');
  eq(numLoose('м³'), null, 'тоо биш текст → null (0 БИШ)');
  eq(numLoose('12abc'), null, 'хагас тоо → null');
  eq(numLoose('1,2,3'), 123, 'зөвхөн тоо ба таслал бол нийлүүлнэ');
  console.log('✅ текстээр хадгалагдсан тоо — мянгатын таслал уншигдана, null≠0 хэвээр');
}
