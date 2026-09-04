/**
 * НООРОГИЙН БҮРЭН БАЙДАЛ — «Гүйцэтгэл бөглөх».
 *
 * ⚠️ Энэ шалгуур нь 2026-08-29-ны БОДИТ цоорхойг хамгаална: ноорогт зөвхөн
 * гүйцэтгэлийн нүд ба нэмсэн мөр ордог байсан тул ОГНОО ба «Шинэчлэгдсэн
 * огноо» хоёр компьютер унтрахад чимээгүй алга болдог байв.
 *
 * ⚠️ 2026-09-03: БАРИМТ БИЧИГ (`docs`) энэ ноорогоос ГАРСАН — «Чанар (QAQC)»
 * тусдаа харагдац болов (`src/modules/Qaqc.tsx`). Тэр өгөгдөл нь тусдаа
 * үйлчилгээнд байрандаа засагддаг тул энэ хуудасны нийтлэх мөчлөгт
 * харьяалагдахаа больсон. Хуучин ноорогт үлдсэн `docs` талбар нь задлах
 * шатанд ХАЯГДАХ ёстой — шалгуур түүнийг барина (доорх 6-р хэсэг).
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
for (const f of ['cells:', 'dates?:', 'asOf?:']) {
  assert.ok(typeBlock.includes(f), `Draft-д «${f}» талбар алга`);
}
console.log('✅ Draft төрөл — cells · dates · asOf · adds');

/* ── 2. ХАДГАЛАХ талд дөрвүүлэн бичигдэх ── */
const saveBlock = between('const draft: Draft = {', '};');
for (const [f, expr] of [['cells:', 'pending'], ['dates:', 'pendDate'], ['asOf:', 'asOf'], ['adds,', 'adds']]) {
  assert.ok(saveBlock.includes(f), `хадгалалтад «${f}» алга`);
  assert.ok(saveBlock.includes(expr), `хадгалалтад «${expr}» төлөв алга`);
}
console.log('✅ хадгалалт — бүх төлөв ноорогт орно');

/* ── 3. ХООСОН шалгалт дөрвүүлэнгээр ──
   ⚠️ Зөвхөн `pending`-ээр шалгавал огноо/баримт засаад гүйцэтгэлийн нүд
   хөндөөгүй хэрэглэгчийн ноорог хадгалагдахын оронд УСТАНА. */
const emptyBlock = between('const asOfChanged = asOf !== asOfOrig;', 'const draft: Draft = {');
for (const st of ['pending', 'pendDate', 'adds', 'asOfChanged']) {
  assert.ok(emptyBlock.includes(st), `хоосон шалгалтад «${st}» алга`);
}
console.log('✅ хоосон шалгалт — бүх төлөвөөр');

/* ── 4. СЭРГЭЭХ талд бүх төрөл буцаж тавигдана ──
   ⚠️ 2026-09-03: хөтчийн `confirm` нь апп доторх төвлөрсөн цонх болов
   (`RestoreModal`) тул шүүлт ба буулгалт ХОЁР блок болж салсан: эффект нь
   ноорогийг шүүж `setRestore(...)`-д хийнэ, `applyRestore` нь төлөв рүү
   буулгана. Шалгуур нь хоёуланг тусад нь барина. */
const restore = between('const pickDraft = useCallback', 'setRestore({');
const apply = between('const applyRestore = useCallback', 'setRestore(null);');
for (const setter of ['setPending(r.cells)', 'setPendDate(r.dates)', 'setAsOf(r.asOf)', 'setAdds(']) {
  assert.ok(apply.includes(setter), `сэргээлтэд «${setter}» алга`);
}
console.log('✅ сэргээлт — бүх төлөв буцаж тавигдана');

/* ── 4b. ЦОНХНЫ ГУРВАН ГАРЦ — тус бүр өөр үр дагавартай ──
   ⚠️ Хамгийн аюултай нь «дараа шийднэ»: цонх хаагдахад төлөв хоосон хэвээр
   үлддэг тул хадгалалтын эффект ноорогийг УСТГАХ гээд байдаг. `keepDraft`
   туг түүнийг барих ёстой — эс бөгөөс цонхыг хаамагц ажил алга болно. */
const dropFn = between('const dropRestore = useCallback', '}, [pkg.key]);');
assert.ok(dropFn.includes('clearDraftLS(pkg.key)'), '«Устгах» ноорогийг цэвэрлэхгүй байна');
const laterFn = between('const laterRestore = useCallback', '}, []);');
assert.ok(laterFn.includes('keepDraft.current = true'), '«Дараа шийднэ» ноорогийг хамгаалахгүй байна');
assert.ok(!laterFn.includes('clearDraftLS'), '«Дараа шийднэ» ноорогийг устгаж байна');
assert.ok(
  SRC.includes('promptedPkgRef.current === pkg.key && !keepDraft.current'),
  'автомат цэвэрлэлт `keepDraft`-ыг үл тоож байна',
);
console.log('✅ цонхны гурван гарц — сэргээх · дараа шийдэх · устгах');

/* ── 5. ЭРХИЙН ХААЛТ сэргээлтэд ХЭВЭЭР ──
   Эрх хооронд нь хасагдсан бол ноорог дахь өгөгдөл дэлгэцэд гарах ёсгүй. */
assert.ok(restore.includes('canPerf ? d.cells'), 'гүйцэтгэлийн нүд canPerf-гүй сэргээгдэж байна');
assert.ok(restore.includes('canPerf ? (d.dates'), 'огноо canPerf-гүй сэргээгдэж байна');

assert.ok(restore.includes('canAddRow ?'), 'нэмсэн мөр canAddRow-гүй сэргээгдэж байна');
console.log('✅ сэргээлт эрхээр хамгаалагдсан хэвээр');

/* ── 6. Хуучин/эвдэрсэн ноорог БҮХЭЛДЭЭ хаягдахгүй ── */
/* ⚠️ Шалгуур нь `parseDraft`-д — 2026-09-03-нд задлалт нь `readDraft`-аас
   салсан: алсын хуулбар ч ЯГ ижил шалгуураар орох ёстой тул нэг газарт. */
const readBlock = between('const parseDraft =', 'const readDraft =');
assert.ok(readBlock.includes('d.dates = undefined'), 'эвдэрсэн dates ноорогийг бүхэлд нь хаяж байна');
/* ⚠️ ХУУЧИН ноорогийн `docs` талбарыг ЗААВАЛ хаяна (2026-09-03). Түүнийг
   шалгаж унагаавал «Чанар (QAQC)» гарахаас өмнө үлдсэн ноорог бүхэлдээ
   (гүйцэтгэл, огноо, нэмсэн мөр хамт) устана. */
assert.ok(readBlock.includes('d.docs = undefined'), 'хуучин docs талбар хаягдахгүй байна');
assert.ok(!SRC.includes('pendDoc'), 'QAQC-ийн төлөв бөглөх хуудсанд үлдсэн');
assert.ok(!SRC.includes('DOC_COLS'), 'QAQC-ийн багана бөглөх хуудсанд үлдсэн');
console.log('✅ эвдэрсэн талбар ноорогийг бүхэлд нь хаяхгүй');

/* ── 6b. АЛСЫН ХУУЛБАР (өөр төхөөрөмжөөс сэргээх) ──
   ⚠️ 2026-09-03, хэрэглэгч: «өөр browser, өөр газраас орход ч draft
   хадгалагдаж байх ёстой». Локал ноорог нь ҮНДСЭН зам хэвээр; алсын хуулбар
   нь зөвхөн төхөөрөмж хооронд шилжихэд хэрэгтэй. Гурван зүйл ЗААВАЛ: */
assert.ok(
  SRC.includes("from \"@/lib/draftRemote\""),
  'алсын ноорогийн модуль холбогдоогүй',
);
/* (1) Ачаалахад локал БА алсын хоёрыг АГШНААР харьцуулж шинийг нь сонгоно —
       хуучныг нь тавибал өөр машин дээрх шинэ ажил чимээгүй дарагдана. */
const pickBlock = between('const local = readDraft(pkg.key);', 'pickDraft(d,');
assert.ok(pickBlock.includes('loadRemoteDraft(pkg.key)'), 'алсын ноорог уншигдахгүй байна');
assert.ok(pickBlock.includes('remote.t > local.t'), 'локал/алсын агшны харьцуулалт алга');
/* (2) Бичилт нь ЗАВСАРЛАГАТАЙ — нүд бүрийн товшилтод ArcGIS руу хүсэлт явбал
       бөглөлт удааширна. Хадгалалтын эффект зөвхөн дараалалд тавина. */
const persist = between('const at = Date.now();', 'remoteQueue.current = { pkg: pkg.key, draft };');
assert.ok(!persist.includes('saveRemoteDraft'), 'алсын бичилт завсарлагагүй хийгдэж байна');
assert.ok(SRC.includes('setTimeout(flush, 12_000)'), 'алсын бичилтийн завсарлага алга');
assert.ok(SRC.includes("document.addEventListener('visibilitychange'"), 'таб хаагдахад илгээхгүй байна');
/* (3) Нийтэлсэн ба «Устгах» хоёулаа АЛСЫН хуулбарыг цэвэрлэнэ — эс бөгөөс
       нийтлэгдсэн ажил өөр төхөөрөмж дээр «нийтлэгдээгүй» гэж эргэж ирнэ. */
/* ⚠️ ГУРАВ: нийтлэх/болиулах · «Устгах» товч · хоосон ноорогийн цэвэрлэгээ.
   Сүүлийнх нь 2026-09-03-нд нэмэгдсэн: зөвхөн локалыг цэвэрлэвэл алсад
   «зомби» мөр үлдэж, ачаалалт бүрд дахин шүүгдэнэ. */
assert.equal(
  (SRC.match(/clearRemoteDraft\(pkg\.key\)/g) ?? []).length, 3,
  'алсын цэвэрлэгээ гурван газарт (нийтлэх · устгах · хоосон ноорог) байх ёстой',
);
/* (4) Хэт том ноорог алсад ЯВАХГҮЙ, тэгснээ ИЛ хэлнэ */
assert.ok(SRC.includes('REMOTE_MAX'), 'алсын хэмжээний хамгаалалт алга');
assert.ok(SRC.includes('setRemoteBig(true)'), 'хэт том ноорог чимээгүй алгасагдаж байна');
console.log('✅ алсын хуулбар — агшны сонголт · завсарлага · цэвэрлэгээ · хэмжээ');

/* ── 6c. АГШИН СОЛИГДОХОД НООРОГ АМЬД ҮЛДЭНЭ ──
   ⚠️ 2026-09-03-ны аудитын хамгийн ноцтой олдвор: `applyAdds` нь хуудсыг
   бүхэлд нь ШИНЭ мөр болгож нэмдэг тул хэн нэгэн нийтэлмэгц ноорогийн БҮХ
   ObjectID хуучирна. Урьд нь тэр үед бүх түлхүүр «олдсонгүй» болж, ноорог
   ЧИМЭЭГҮЙ устдаг байв (40 нүдний ажил, мэдэгдэлгүй). */
assert.ok(saveBlock.includes('rowKeys'), 'ноорогт мөрийн танигч хадгалагдахгүй байна');
assert.ok(
  SRC.includes('rowKeys.push([r.oid, `${r.no} ¦ ${r.work}`])'),
  'мөрийн танигч (№ ¦ ажил) хэлбэрээр бичигдэхгүй байна',
);
assert.ok(restore.includes('const oidFix'), 'сэргээлтэд ObjectID зөөлт алга');
assert.ok(restore.includes('d.rowKeys'), 'зөөлт нь ноорогийн танигчийг уншихгүй байна');
assert.ok(restore.includes('fixKey'), 'зөөлт түлхүүрт хэрэглэгдэхгүй байна');
/* Чимээгүй устгал — ЗӨВХӨН ноорог үнэхээр хоосон (`!dropped`) үед */
assert.ok(
  SRC.includes('if (!dropped) {') && SRC.includes('clearDraftLS(pkg.key);'),
  'хоосон бус ноорог чимээгүй устаж байна',
);
console.log('✅ агшин солигдоход ноорог зөөгдөнө, чимээгүй устахгүй');

/* ── 6d. АЛСЫН ДАРААЛАЛ БАГЦААРАА ХААГДАНА ──
   ⚠️ Багц солиход дараалал цэвэрлэгдэхгүй бол Багц 1-ийн ноорог Багц 2-ын
   слотод бичигдэж, Багц 2-ын жинхэнэ ноорог дээрх замаар устана. */
assert.ok(
  SRC.includes('remoteQueue.current = { pkg: pkg.key, draft }'),
  'алсын дараалал багцын тамгагүй байна',
);
assert.ok(
  SRC.includes('if (q.pkg !== pkg.key) { remoteQueue.current = null; return; }'),
  'өөр багцын ноорог шалгагдалгүй бичигдэж байна',
);
const swBlock = between('loadedPkgRef.current = "";', 'setBusy(true);');
assert.ok(swBlock.includes('remoteQueue.current = null'), 'багц солиход дараалал цэвэрлэгдэхгүй');
assert.ok(swBlock.includes('keepDraft.current = false'), 'багц солиход `keepDraft` тэглэгдэхгүй');
console.log('✅ алсын дараалал ба `keepDraft` багц солиход цэвэрлэгдэнэ');

/* ── 7. Автомат хадгалалт ИЛ харагдана ── */
assert.ok(SRC.includes('setSavedAt(at)'), 'хадгалсан агшин тэмдэглэгдэхгүй байна');
assert.ok(SRC.includes('ноорог хадгалагдав {0}'), 'хадгалалтын үзүүлэлт дэлгэцэд алга');
console.log('✅ автомат хадгалалт дэлгэцэд ил');

console.log('\ndraft.check: ok');
