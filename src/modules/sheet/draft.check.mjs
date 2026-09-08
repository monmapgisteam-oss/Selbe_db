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
   ⚠️ Зөвхөн `pending`-ээр шалгавал огноо засаад гүйцэтгэлийн нүд
   хөндөөгүй хэрэглэгчийн ноорог хадгалагдахын оронд УСТАНА. */
const emptyBlock = between('const asOfChanged = asOf !== asOfOrig;', 'const draft: Draft = {');
for (const st of ['pending', 'pendDate', 'adds', 'asOfChanged']) {
  assert.ok(emptyBlock.includes(st), `хоосон шалгалтад «${st}» алга`);
}
console.log('✅ хоосон шалгалт — бүх төлөвөөр');

/* ── 4. НООРОГ ШУУД БУУНА — цонх асуухгүй ──
   ⚠️ ТҮҮХ: хөтчийн `confirm` (–2026-09-03) → апп доторх цонх `RestoreModal`
   (2026-09-03) → ЦОНХГҮЙ, шууд буулгана (2026-09-06, хэрэглэгчийн заавар:
   «ноорогийг сэргээхийг асуухгүй шууд гарч ирдэг байя, өнгөөр ялгаж хараад
   засна»). Цонх нь ажил алдахаас хамгаалах зорилготой байсан ч бөглөгч өдөрт
   олон удаа багц сольдог бөгөөд тэр бүрд ижил асуултад «Сэргээх» дарах нь
   дэмий алхам болж байв.
   ⚠️ АЮУЛГҮЙ БОЛГОСОН нь: сэргээсэн нүд бүр НОГООН (`dirty`) гарах ба
   хэрэгслийн мөрөнд тоологдоно; хэрэггүй бол «ноорог устгах» товч. */
const restore = between('const pickDraft = useCallback', 'const from = source ===');
for (const setter of ['setPending(next)', 'setPendDate(nextDates)', 'setAsOf(draftAsOf)', 'setAdds(restoredAdds)']) {
  assert.ok(restore.includes(setter), `шууд буулгалтад «${setter}» алга`);
}
/* Юу сэргэснийг ИЛ хэлнэ — чимээгүй бууж болохгүй */
assert.ok(restore.includes('say('), 'ноорог сэргэснийг хэрэглэгчид хэлэхгүй байна');
/* Цонхны үлдэгдэл БАЙХГҮЙ байх ёстой */
for (const gone of ['RestoreModal', 'setRestore', 'applyRestore', 'laterRestore', 'dropRestore']) {
  assert.ok(!SRC.includes(gone), `сэргээх цонхны үлдэгдэл «${gone}» хэвээр байна`);
}
console.log('✅ ноорог шууд буудаг — цонх асуухгүй, юу сэргэснийг хэлнэ');

/* ── 4b. «НООРОГ УСТГАХ» — болих ЦОРЫН ГАНЦ зам ──
   ⚠️ Цонх хасагдсанаар түүний «Устгах» гарц ч алга болсон. Энэ товчгүй бол
   хэрэглэгч 40 нүдийг ГАРААР цэвэрлэх шаардлагатай болно. Локал БА алсын
   хуулбар ХОЁУЛАА устах ёстой — эс бөгөөс дараагийн ачаалалтад буцаж ирнэ. */
const dropFn = between('const dropDraft = useCallback', '}, [pkg.key, asOfOrig]);');
assert.ok(dropFn.includes('clearDraftLS(pkg.key)'), 'ноорог устгахад локал хуулбар үлдэж байна');
assert.ok(dropFn.includes('clearRemoteDraft(pkg.key)'), 'ноорог устгахад АЛСЫН хуулбар үлдэж байна');
for (const st of ['setPending({})', 'setPendDate({})', 'setAdds([])']) {
  assert.ok(dropFn.includes(st), `ноорог устгахад «${st}» алга`);
}
assert.ok(
  SRC.includes('promptedPkgRef.current === pkg.key && !keepDraft.current && !restoring.current'),
  'автомат цэвэрлэлт `keepDraft`/`restoring`-ийг үл тоож байна',
);
console.log('✅ «ноорог устгах» — локал ба алсын хуулбар хоёулаа цэвэрлэгдэнэ');

/* ── 4c. НООРОГ АЛДАГДАХ ГУРВАН ЗАМ ХААГДСАН (2026-09-08) ──
   Хэрэглэгч: «draft алдагдаж байна, зарим үед хадгалагдахгүй, дараа орход
   харагдахгүй байна» → «ямар ч тохиолдолд алдагдалгүй болго». */

/* (а) УРАЛДААН: мөр ачаалагдмагц сэргээх эффект (async алсын уншилт) ба
   хадгалах эффект (sync) нэг commit-д ажиллана. Хадгалах нь `pending` хоосон
   тул «нийтэлсэн» гэж дүгнэж локал+алсын хуулбарыг УСТГАДАГ байв — алсын
   уншилт дуусахаас ӨМНӨ. `restoring` туг сэргээлт дуустал тэр замыг хаана. */
const restoreEff = between('promptedPkgRef.current = pkg.key;', 'pickDraft(merged,');
assert.ok(restoreEff.includes('restoring.current = true'), 'сэргээлтийн эхэнд `restoring` асахгүй байна');
assert.ok(restoreEff.includes('restoring.current = false'), 'сэргээлтийн төгсгөлд `restoring` унтрахгүй байна');
/* Тасалдсан (`!alive`) үед ч буцаах ёстой — эс бөгөөс дараагийн багц мөнхөд
   хаалттай. Мөн `promptedPkgRef`-ийг хоослох — энэ багц руу эргэж ирэхэд
   сэргээлт ДАХИН явах ёстой. */
const aborted = between('if (!alive) {', '}', SRC.indexOf('const rr = await readRemoteDraft'));
assert.ok(aborted.includes('restoring.current = false'), 'тасалдсан сэргээлт `restoring`-ийг буцаахгүй');
assert.ok(aborted.includes("promptedPkgRef.current = ''"), 'тасалдсан сэргээлт дахин оролдох замыг нээхгүй');

/* (б) UNMOUNT: `Guitsetgel` таб ба Portal харагдац солиход компонент unmount
   болно — `visibilitychange`/`pagehide` асдаггүй тул дараалалд байгаа ноорог
   алсад очилгүй хаягддаг байв. Тусдаа `[]` эффектийн cleanup илгээнэ. */
assert.ok(SRC.includes('useEffect(() => () => { flushRef.current(); }, []);'), 'unmount дээр алсын дараалал илгээгдэхгүй');
assert.ok(SRC.includes('flushRef.current = flush;'), '`flush` ref-д хадгалагдахгүй — unmount эффект хуучин хаалт барина');

/* (в) АЛСЫН УНШИЛТ УНАСАН: `promptedPkgRef`-ийг хоослоод л орхивол эффектийн
   хамаарал хөдлөхгүй тул F5 хүртэл дахин оролдохгүй. `remoteRetry` цохилт. */
assert.ok(SRC.includes('setRemoteRetry((n) => n + 1)'), 'алсын уншилт унахад дахин оролдох цохилт алга');
assert.ok(/asOfOrig, noEdit, remoteRetry\]\);/.test(SRC), '`remoteRetry` сэргээх эффектийн хамааралд алга');
console.log('✅ ноорог алдагдах 3 зам хаагдсан — уралдаан · unmount · дахин оролдох');

/* (г) ТАБ ХААХ / REFRESH — ХАДГАЛАГДАЖ АМЖААГҮЙ үед л зогсооно (2026-09-08,
   хэрэглэгч). Илгээгээгүй нүд биш — АЛСАД амжаагүй / унасан / обьёмын ноорог.
   Мөн цонх гарахаас ӨМНӨ `flush` — хэрэглэгч цонх уншиж байх зуур явж амжина. */
{
  /* ⚠️ Anchor-ыг НЭГ мөрт барина — файл CRLF тул `\n`-тэй хайлт таардаггүй */
  const unload = between('const pendingRemote = remoteQueue.current', '}, [remoteTick, remoteState, pvDirty, pkg.key]);');
  assert.ok(unload.includes("remoteState?.kind === 'fail'"), 'unload хамгаалалт унасан бичилтийг тоохгүй');
  assert.ok(unload.includes('remoteQueue.current != null'), 'unload хамгаалалт хүлээгдэж буй дарааллыг тоохгүй');
  assert.ok(unload.includes('pvDirty'), 'unload хамгаалалт обьёмын ноорогийг тоохгүй — тэр ноорогт орддоггүй');
  assert.ok(unload.includes('flushRef.current();'), 'unload дээр ArcGIS руу шууд илгээхгүй — цонхны хугацаа дэмий');
  assert.ok(!unload.includes('if (!unsavedCount) return;'), 'unload хуучин (илгээгээгүй нүд) нөхцөлд буцав');
}
console.log('✅ таб хаах/refresh — хадгалагдаж амжаагүй үед л зогсооно, өмнө нь илгээнэ');

/* ── 4d. mergeDrafts — нэгж шалгуур (кодыг тусгаарлан ажиллуулна) ── */
{
  const src = between('const mergeDrafts = (a: Draft | null, b: Draft | null): Draft | null => {', '\n};');
  /* TS-ийн төрлийн тэмдэглэгээг хасаад JS болгоно */
  const js = (src + '\n}')
    .replace(': Draft | null', '').replace(': Draft | null', '').replace(': Draft | null', '')
    .replace(/new Map<[^>]*>/g, 'new Map');
  const mergeDrafts = new Function('return ' + js.replace('const mergeDrafts = ', ''))();
  const L = { t: 100, cells: [['1:0', '10'], ['2:0', '20']], dates: [['1:0:s', '2026-01-01']], adds: [{ oid: -1, no: '1', work: 'A' }], rowKeys: [[1, '1 ¦ x'], [2, '2 ¦ y']] };
  const R = { t: 200, cells: [['2:0', '25'], ['3:0', '30']], dates: [['3:0:e', '2026-02-02']], adds: [{ oid: -2, no: '2', work: 'B' }], rowKeys: [[3, '3 ¦ z']], asOf: 5 };
  const m = mergeDrafts(L, R);
  assert.equal(m.t, 200, 'нийлбэрийн агшин = шинэ тал');
  const cells = new Map(m.cells);
  assert.equal(cells.get('1:0'), '10', 'зөвхөн локалд байсан нүд хаягдав');
  assert.equal(cells.get('2:0'), '25', 'давхцсан нүдэнд шинэ тал ялахгүй байна');
  assert.equal(cells.get('3:0'), '30', 'зөвхөн алсад байсан нүд хаягдав');
  assert.equal(new Map(m.dates).size, 2, 'огноо нийлүүлэгдэхгүй');
  assert.deepEqual(m.adds.map((a) => a.oid).sort((x, y) => x - y), [-2, -1], 'нэмсэн мөр нийлүүлэгдэхгүй');
  assert.equal(new Map(m.rowKeys).size, 3, 'rowKeys нэгдэл биш — зөөлт нэг талыг алдана');
  assert.equal(m.asOf, 5, 'asOf шинэ талынх биш');
  /* Урвуу дараалалд ч ижил үр дүн — `t`-ээр эрэмбэлдэг тул */
  const m2 = mergeDrafts(R, L);
  assert.equal(new Map(m2.cells).get('2:0'), '25', 'аргументын дараалал үр дүнг өөрчилж байна');
  assert.equal(mergeDrafts(null, R), R, 'нэг тал null бол нөгөөг шууд буцаах ёстой');
  assert.equal(mergeDrafts(L, null), L, 'нэг тал null бол нөгөөг шууд буцаах ёстой');
  assert.equal(mergeDrafts(null, null), null);
}
console.log('✅ mergeDrafts — нүд бүрд шинэ утга, нэг талын нүд хэвээр');

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
/* (1) Ачаалахад локал БА алсын хоёрыг НИЙЛҮҮЛНЭ (2026-09-08; урьд нь агшнаар
       шинийг нь сонгодог байсан — хуучин талын ажил бүхэлдээ хаягддаг). */
const pickBlock = between('const local = readDraft(pkg.key);', 'pickDraft(merged,');
/* ⚠️ 2026-09-07: `loadRemoteDraft` → `readRemoteDraft`. Хуучин хос нь «ноорог
   БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг ижил `null` болгодог тул сүлжээний түр
   саат нь бөглөсөн ажлыг АЛГА БОЛСОН мэт харуулдаг байв. */
assert.ok(pickBlock.includes('readRemoteDraft(pkg.key)'), 'алсын ноорог уншигдахгүй байна');
/* ⚠️ 2026-09-08: НИЙЛҮҮЛНЭ, сонгохгүй. `remote.t > local.t`-ээр нэгийг л
   авдаг байсан тул хоёр төхөөрөмж дээр өөр өөр нүд бөглөсөн бол хуучин талын
   ажил БҮХЭЛДЭЭ хаягддаг байв. Одоо нүд бүрд шинэ утга, зөвхөн нэг талд
   байгаа нүд хэвээр. */
assert.ok(pickBlock.includes('mergeDrafts(local, remote)'), 'локал/алсын ноорог нийлүүлэгдэхгүй байна');
assert.ok(!pickBlock.includes('remote.t > local.t'), '«шинийг сонго» зам буцаж орсон — нийлүүлэх ёстой');
/* ⚠️ УНШИЛТ УНАСНЫГ ЯЛГАНА: чимээгүй `null` болговол хэрэглэгч хоосон хуудас
   хараад ажлаа алдсан гэж дүгнэнэ. Мөн `promptedPkgRef`-ийг БУЦААЖ хоослох
   ёстой — эс бөгөөс тэр сешнд ДАХИН оролдох зам хаагдаж, зөвхөн F5 аврана. */
assert.ok(pickBlock.includes('!rr.ok'), 'алсын уншилтын алдаа ялгагдахгүй байна');
assert.ok(
  pickBlock.includes("promptedPkgRef.current = ''"),
  'уншилт унахад дахин оролдох зам нээгдэхгүй байна',
);
/* (2) Бичилт нь ЗАВСАРЛАГАТАЙ — нүд бүрийн товшилтод ArcGIS руу хүсэлт явбал
       бөглөлт удааширна. Хадгалалтын эффект зөвхөн дараалалд тавина. */
const persist = between('const at = Date.now();', 'remoteQueue.current = { pkg: pkg.key, draft };');
assert.ok(!persist.includes('saveRemoteDraft'), 'алсын бичилт завсарлагагүй хийгдэж байна');
/* ⚠️ 2026-09-08: хэрэглэгч «локал 0 сек, ArcGIS БҮГД 3 сек». Тоо нь ГАНЦ
   тогтмолд — хэрэглээнд шууд тоо бичвэл дараагийн өөрчлөлт нэгийг нь орхино.
   Cap ба retry нь debounce-оос БОГИНО байж болохгүй (тэгвэл debounce утгагүй). */
assert.ok(SRC.includes('setTimeout(flush, REMOTE_DEBOUNCE_MS)'), 'алсын бичилтийн завсарлага тогтмолоор биш');
{
  const n = (s) => Number((SRC.match(new RegExp('const ' + s + ' = ([0-9_]+);')) ?? [])[1]?.replace(/_/g, ''));
  const deb = n('REMOTE_DEBOUNCE_MS'), cap = n('REMOTE_CAP_MS'), retry = n('REMOTE_RETRY_MS');
  assert.equal(deb, 3000, 'ArcGIS завсарлага 3 сек биш');
  assert.equal(cap, 3000, 'ArcGIS дээд хүлээлт 3 сек биш');
  assert.equal(retry, 3000, 'ArcGIS retry 3 сек биш');
  assert.ok(cap >= deb, 'дээд хүлээлт завсарлагаас богино — debounce утгагүй');
  assert.ok(retry >= deb, 'retry завсарлагаас богино');
  /* `setTimeout(flush, 0)` нь «дээд хүлээлт дууссан — шууд» зам, тоо биш */
  assert.ok(!/setTimeout\(flush, [1-9]/.test(SRC), 'flush-д шууд тоо бичигдсэн — тогтмолыг тойрсон');
}
assert.ok(SRC.includes("window.addEventListener('pagehide'"), 'pagehide алга — iOS/bfcache-д сүүлийн ажил алдагдана');
/* ⚠️ ДЭЭД ХҮЛЭЭЛТ: 12 сек нь ЗӨВХӨН debounce тул тасралтгүй бөглөж байгаа
   хүний ажил алсад ХЭЗЭЭ Ч хуулагдахгүй байв. 60 сек тутам заавал илгээнэ. */
assert.ok(SRC.includes('lastRemoteRef'), 'алсын бичилтийн ДЭЭД хүлээлт алга');
/* ⚠️ ИЛГЭЭЛТИЙН уншилт ч алдааг ЯЛГАНА (2026-09-07, CRITICAL): чимээгүй
   `null` болговол буцаагдсан ажил «бүх нүд 0%» болж харагдана. */
/* ⚠️ ТАЙЛБАР ДОТОРХ дурдлагыг тоолохгүй (2026-09-07): `irgediin-hurteemj`
   merge хийхэд алдааны түүхийг тайлбарласан мөрүүд орж ирсэн. ЖИНХЭНЭ
   дуудлага нь `await` эсвэл `=`-ийн ард ирдэг. */
const CODE_ONLY = SRC
  .split('\n')
  .filter((l) => !/^\s*[*]/.test(l) && !/^\s*\/[*]/.test(l) && !/^\s*\/\//.test(l))
  .join('\n');
assert.ok(
  !/(?:await|=)\s*loadActiveSubmission\(/.test(CODE_ONLY),
  'илгээлтийн уншилт алдааг залгисаар байна',
);
assert.ok(SRC.includes('setSubReadErr('), 'илгээлтийн уншилтын алдаа хэрэглэгчид харагдахгүй байна');
assert.ok(SRC.includes("document.addEventListener('visibilitychange'"), 'таб хаагдахад илгээхгүй байна');
/* (3) Нийтэлсэн ба «Устгах» хоёулаа АЛСЫН хуулбарыг цэвэрлэнэ — эс бөгөөс
       нийтлэгдсэн ажил өөр төхөөрөмж дээр «нийтлэгдээгүй» гэж эргэж ирнэ. */
/* ⚠️ ДӨРӨВ: нийтлэх/болиулах · «Устгах» товч · хоосон ноорог · ХҮЧИНГҮЙ
   ноорог. Гурав дахь нь 2026-09-03-нд нэмэгдсэн (зөвхөн локалыг цэвэрлэвэл
   алсад «зомби» мөр үлдэж, ачаалалт бүрд дахин шүүгдэнэ); дөрөв дэх нь мөн
   тэр өдөр — TTL дууссан, эвдэрсэн, эсвэл ШИНЭ ЭХЛЭЛЭЭС ӨМНӨХ ноорог
   (`DRAFT_FRESH_START`) алсад үлдвэл өөр төхөөрөмж дээр буцаж гарна. */
assert.equal(
  (SRC.match(/clearRemoteDraft\(pkg\.key\)/g) ?? []).length, 4,
  'алсын цэвэрлэгээ дөрвөн газарт (нийтлэх · устгах · хоосон · хүчингүй) байх ёстой',
);
/* ── ШИНЭ ЭХЛЭЛ (2026-09-03) ──
   Хэрэглэгчийн заавар: «гүйцэтгэлийн бүртгэл шинээр эхэлнэ — ноорогийг
   цэвэрлэ». Цэвэрлэлт нь ноорог
   тархсан (хөтөч + ArcGIS) тул ЗӨВХӨН кодоор хийгдэнэ. */
assert.ok(SRC.includes('DRAFT_FRESH_START'), 'шинэ эхлэлийн тогтмол алга');
assert.ok(
  SRC.includes('if (d.t < DRAFT_FRESH_START) return null;'),
  'шинэ эхлэлээс өмнөх ноорог бүхэлдээ хүчингүй болох ёстой',
);
/* (4) Алсын хуулбарын БАЙДАЛ ил байх — хэт том, унасан, амжилттай гурвуулаа.
   ⚠️ 2026-09-06: `remoteBig` (boolean) нь ЗӨВХӨН хэмжээг хэлдэг байсныг
   `remoteState` болгов. Сүлжээ/токен/хүснэгтийн уналт үед дэлгэц «ноорог
   хадгалагдав» гэж ХЭВЭЭР баталдаг тул бөглөгч алсад хуулагдсан гэж итгээд
   өөр компьютер дээр хоосон хуудас олдог байв. */
assert.ok(SRC.includes('REMOTE_MAX'), 'алсын хэмжээний хамгаалалт алга');
assert.ok(SRC.includes("setRemoteState({ kind: 'big' })"), 'хэт том ноорог чимээгүй алгасагдаж байна');
/* ⚠️ 2026-09-08: `{ kind: 'fail' }` → `{ kind: 'fail', why }`. Долоон өөр
   шалтгаан ганц «хуулагдсангүй» болж гардаг байсан тул хэрэглэгч сүлжээ гэж
   бодоод хүлээдэг байв — харин хүснэгт үүсээгүй, эзэн зөрсөн зэрэг ХҮЛЭЭГЭЭД
   засрахгүй шалтгаан байж болно. Мөн унасан ноорог дарааллаас хасагдаж
   дараагийн засвар хүртэл дахин оролддоггүй байсныг 30 секундын retry-гээр
   засав. */
assert.ok(SRC.includes("{ kind: 'fail', why: r.error }"), 'алсын хуулбар унасны ШАЛТГААН дэлгэцэд хүрэхгүй байна');
assert.ok(SRC.includes('if (!remoteQueue.current) remoteQueue.current = q;'), 'унасан ноорог дарааллаас бүрмөсөн хасагдаж байна — retry алга');
const DR = fs.readFileSync('src/lib/draftRemote.ts', 'utf8');
assert.ok(DR.includes('export type RemoteSave = { ok: true } | { ok: false; error: string };'), 'saveRemoteDraft шалтгаан ялгадаггүй (boolean хэвээр)');
{
  /* Зөвхөн `saveRemoteDraft`-ийн БИЕ — дараагийн `clearRemoteDraft` нь boolean
     хэвээр (зөв: устгалт унавал шалтгаан хэрэглэгчид хамаагүй). */
  const s0 = DR.indexOf('export async function saveRemoteDraft');
  const s1 = DR.indexOf('export async function clearRemoteDraft', s0);
  const body = DR.slice(s0, s1);
  assert.ok(!/catch \{\s*return false;\s*\}/.test(body), 'saveRemoteDraft алдааг залгисаар байна');
  assert.ok(body.includes("console.error('[selbe] ноорог алсад хадгалагдсангүй:'"), 'алсын уналт консолд бичигдэхгүй — засварлагч шалтгаан харахгүй');
}
assert.ok(SRC.includes("kind: 'ok'"), 'алсын хуулбар амжилттай болсныг харуулахгүй байна');
/* ⚠️ Үр дүнг ХАЯХГҮЙ: `void saveRemoteDraft(` нь амжилтгүйг чимээгүй залгина */
assert.ok(
  !/void saveRemoteDraft\([^)]*\);/.test(SRC),
  'saveRemoteDraft-ийн үр дүн хаягдаж байна — уналт ил гарахгүй',
);

/* (4b) ДЭЭД ХҮЛЭЭЛТ — debounce дангаараа бол тасралтгүй бөглөж байхад
   алсын хуулбар ХЭЗЭЭ Ч бичигддэггүй байв (2026-09-06). */
assert.ok(SRC.includes('since >= REMOTE_CAP_MS'), 'алсын бичилтэд дээд хүлээлт алга');
assert.ok(SRC.includes("'pagehide'"), 'pagehide дээр илгээхгүй байна');

/* (4c) НООРОГИЙН ХУГАЦАА — ажлын долоо хоногт таарах ёстой.
   ⚠️ 3 хоног байхад баасны ноорог мягмарт хоёр талдаа чимээгүй устдаг байв. */
assert.ok(
  /DRAFT_TTL_MS = 14 \* 24 \* 3600 \* 1000/.test(SRC),
  'ноорогийн хугацаа 14 хоног байх ёстой (баасан→мягмар алдагдахгүй)',
);
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

/* ── 8. «НИЙТЛЭХ» = ИЛГЭЭХ, АРХИВТ БИЧИХГҮЙ (2026-09-04) ──
   ⚠️ Хэрэглэгчийн шаардлага: «ноорог ҮНДСЭН ДАТАНД хадгалагдаж болохгүй; бүх
   шалгалт дуусаж 4 шат дамжсаны дараа л дата хүснэгт буюу үндсэн сервис рүү
   орно». Урьд нь «Нийтлэх» нь `computeAll`-оор бүтэн жааз угсарч `Bagts_*`
   архивт ШУУД нэмдэг байсан тул хяналтын 4 шат нь аль хэдийн бичигдсэн
   өгөгдлийг хойноос нь баталдаг ёсорхуу зам байлаа.

   Гурван зүйл ЗААВАЛ:
   (1) архивт мөр нэмэх дуудалт энэ файлд ОГТ байхгүй — жааз бүтээх нь одоо
       `sheetFrame.buildFrame` + `hyanaltStore.apply`-ийн ажил;
   (2) илгээлт нь завсрын хадгалалтад бичигдэнэ;
   (3) хянагчийн гар дээр байхад дахин илгээх нь ХААЛТТАЙ (`inReview`) — эс
       бөгөөс хянагчийн харж буй агуулга доор нь чимээгүй солигдоно. */
assert.ok(
  !/applyAdds\(/.test(SRC),
  '«Нийтлэх» нь үндсэн өгөгдөлд (архивт) шууд бичиж байна',
);
assert.ok(SRC.includes('saveSubmission('), 'илгээлт завсрын хадгалалтад бичигдэхгүй байна');
assert.ok(SRC.includes('inReview'), 'хяналтад байхад илгээх хориг алга');
console.log('✅ «Нийтлэх» = илгээх — архивт бичихгүй, хяналтад байхад хаалттай');

console.log('\ndraft.check: ok');

/* ── 9. ЧАНАРЫН ХЭСЭГ (Inspection Test Plan) БУЦАЖ ОРООГҮЙ ──
   ⚠️ 2026-09-03, хэрэглэгчийн шийдвэр: чанартай холбоотой бүхнийг системээс
   хасаж, талбаруудыг нь ArcGIS-ээс өөрөө устгана. Хагас сэргээлт (жишээ нь
   зөвхөн ноорогт `docs` буцаах) нь БАЙХГҮЙ талбар руу бичих оролдлого болж
   багц бүхэлдээ унагаана. */
for (const gone of ['DOC_COLS', 'DOC_BAND', 'DOC_GROUPS', 'pendDoc', 'editDoc', 'canQaqc', 'commitDoc']) {
  assert.ok(!SRC.includes(gone), `чанарын үлдэгдэл: ${gone}`);
}
console.log('✅ чанарын хэсэг бүрэн хасагдсан хэвээр');

/* ── 10. ИЛГЭЭЛТИЙН УРСГАЛЫН ДӨРВӨН ГЭРЭЭ (2026-09-04-ний аудит) ──
   Дөрвүүлээ нэг мөрөөр эвдэрдэг, ямар ч алдаа гарахгүй чимээгүй зам тул
   эх кодын түвшинд барина.

   (1) СУУРИЙН ТУЛГАЛТ: `saveSubmission`-д `expect` (optimistic concurrency)
       ГУРАВ ДАХЬ аргумент дамжина. Дамжуулаагүй үед хоёр таб/хоёр хэрэглэгч
       нэг `sub|` мөрийг дарж бичиж, нэгнийх нь нүднүүд ул мөргүй устана.
   (2) АЛДААГ ЯЛГАДАГ УНШИЛТ: бичих шийдвэр гаргах өмнөх шалгалт нь
       `readActiveSubmission` (алдааг `null` болгодоггүй) байх ёстой — эс
       бөгөөс уншилт унасан агшинд «идэвхтэй илгээлт алга» гэж дүгнэж, өөр
       хэрэглэгчийн хянагдаж буй илгээлтийг бүтнээр дарна.
   (3) ХУУДСЫГ ЯЛГАХ: `submitForReview` рүү хуудсын нэр (`pkg.label`) явна.
       Багц 1 · 2 · 4-2 нь 9F/12F хоёр хуудастай тул нэрээ хэлэхгүй бол
       нэг хуудасны илгээлт нөгөөгийнхөө «Нийтлэх»-ийг хааж, хянагчид
       хоёул нэг ажил болж нийлнэ.
   (4) ТУЛГАГДААГҮЙ НҮД ИЛ: `overlaySubmission`-ийн `unmoved` нь дэлгэцэд
       гарах ёстой — эс бөгөөс илгээсэн нүд чимээгүй алга болж, зөвхөн
       ерөнхий менежерийн батлах алхам дээр багц бүхэлдээ гацна. */
assert.ok(
  /saveSubmission\(\s*pkg\.key,\s*payload,/.test(SRC),
  'saveSubmission-д суурийн тулгалт (expect) дамжихгүй байна',
);
assert.ok(SRC.includes('readActiveSubmission('), 'бичихийн өмнөх уншилт алдааг ялгадаггүй хувилбар байна');
const subCalls = SRC.match(/submitForReview\([^)]*\)/g) ?? [];
assert.ok(subCalls.length >= 2, 'submitForReview-ийн дуудалт олдсонгүй');
for (const c of subCalls) {
  assert.ok(c.includes('pkg.label'), `submitForReview-д хуудсын нэр алга: ${c}`);
}
assert.ok(SRC.includes('ov.unmoved') || SRC.includes('unmovedWarn'), 'тулгагдаагүй нүд дэлгэцэд гарахгүй байна');
assert.ok(/setUnmovedWarn\(/.test(SRC), 'unmoved анхааруулга төлөвт буудаггүй');
console.log('✅ илгээлтийн урсгал — суурийн тулгалт · алдаа ялгах уншилт · хуудасны нэр · тулгагдаагүй нүд');

/* ── 11. ӨНЧИН ИЛГЭЭЛТ ХУУДАС ДАХИН НЭЭХЭД Ч ОЛДОНО ──
   ⚠️ «хадгалагдсан ч хяналтад бүртгэгдээгүй» анхааруулга нь урьд нь ЗӨВХӨН
   энэ сешний төлөвөөс уншигддаг байсан тул хуудсыг хааж нээхэд алга болж,
   `sub|` мөр нь хэн ч харахгүй үүрд үлддэг байв. Одоо ӨГӨГДЛӨӨС таньдаг. */
assert.ok(SRC.includes('registeredRef'), 'дөнгөж бүртгэгдсэн илгээлтийн хамгаалалт алга');
assert.ok(
  /hyRows\.some\(\(r\) => r\[HF\.sheetOid\] === staged\.oid\)/.test(SRC),
  'өнчин илгээлтийг өгөгдлөөс таних шалгуур алга',
);
console.log('✅ өнчин илгээлт хуудас дахин нээхэд ч илэрнэ');
