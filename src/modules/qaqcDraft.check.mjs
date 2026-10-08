/**
 * «ЧАНАР (QAQC)»-ИЙН НООРОГИЙН ШАЛГУУР — эх кодыг уншиж шалгана (offline).
 *   node src/modules/qaqcDraft.check.mjs
 *
 * ЯАГААД ЭНЭ ФАЙЛ ХЭРЭГТЭЙ ВЭ (2026-09-07-ны аудит):
 * Чанарын хуудасны ноорог нь «Гүйцэтгэл бөглөх»-ийн (`FillNew.tsx`) ХУУЛБАР
 * боловч 2026-09-06-нд тэнд хийгдсэн бат бөх байдлын засваруудыг АВААГҮЙ
 * хоцорсон байв. 127 агентын аудит зургаан зөрүүг баталсан:
 *
 *   1. ДЭЭД ХҮЛЭЭЛТ байхгүй — 12 сек нь ЗӨВХӨН debounce тул засвар бүрд
 *      тэглэгдэж, тасралтгүй бөглөж буй хүний ажил алсад ХЭЗЭЭ Ч хуулагдахгүй.
 *   2. `pagehide` байхгүй — iOS Safari / bfcache-д таб хаагдахад сүүлийн
 *      ажил алсад хүрэхгүй.
 *   3. Бичилтийн үр дүн уншигддаггүй — сүлжээгүй байхад ч «хадгалагдав» гэж
 *      ХУДАЛ баталгаа өгнө.
 *   4. Өөр багцын ноорог одоогийн слотод бичигдэх хамгаалалт байхгүй.
 *   5. Дараалал цэвэрлэгддэггүй — устгасан ноорог ArcGIS-д буцаж амилна.
 *   6. TTL 3 хоног — амралтын өдөр дамжсан ажил чимээгүй устана.
 *
 * Мөн хоёр АЛГА БОЛОХ зам:
 *   · багц A→B→A буцахад `promptedPkgRef` тэгэлдэггүйгээс ноорог УСТДАГ;
 *   · эрх түр алдагдахад (`canEdit=false`) ноорог АВТОМАТААР устдаг.
 *
 * Хэрэв хэн нэгэн эдгээрийг буцаавал доорх шалгуурууд унана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/modules/Qaqc.tsx', 'utf8');
const REMOTE = readFileSync('src/lib/qaqcDraftRemote.ts', 'utf8');

/** Хоёр тэмдэглэгээний хоорондох блок — шалгуурыг зөв хэсэгт тавихад */
const between = (a, b) => {
  const i = SRC.indexOf(a);
  const j = i < 0 ? -1 : SRC.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, `блок олдсонгүй: ${a} … ${b}`);
  return SRC.slice(i, j);
};

/* ── 1. АМЬДРАХ ХУГАЦАА ──
   ⚠️ 14 хоног — «Гүйцэтгэл бөглөх»-тэй ИЖИЛ. 3 хоног нь ажлын долоо
   хоногийн хэмнэлд таарахгүй: баасан 17:00-д хадгалсан ноорог даваа
   17:00-д дуусч, мягмар өглөө нээхэд ЛОКАЛ ба АЛСЫН хуулбар ХОЁУЛАА
   чимээгүй устдаг (`parseDraft` нь хоёуланд нь хэрэглэгддэг). */
assert.ok(
  SRC.includes('const DRAFT_TTL_MS = 14 * 24 * 3600 * 1000;'),
  'ноорогийн TTL 14 хоног байх ёстой (гүйцэтгэлийн хуудастай ижил)',
);
console.log('✅ TTL 14 хоног — амралтын өдөр дамжсан ажил үлдэнэ');

/* ── 2. АЛСЫН БИЧИЛТИЙН БАТ БӨХ БАЙДАЛ ── */
assert.ok(
  SRC.includes('setTimeout(flush, 12_000)'),
  'алсын бичилтийн завсарлага (12 сек) алга',
);
/* ⚠️ ДЭЭД ХҮЛЭЭЛТ: тоолуур засвар бүрд дахин эхэлдэг тул 12 секундэд нэг нүд
   бөглөж 40 минут ажилласан хүний ажил алсад ХЭЗЭЭ Ч хуулагдахгүй байв. */
assert.ok(SRC.includes('lastRemoteRef'), 'алсын бичилтийн ДЭЭД хүлээлт (60 сек) алга');
assert.ok(SRC.includes('60_000'), 'дээд хүлээлтийн хугацаа тодорхойлогдоогүй');
/* ⚠️ `pagehide` нь iOS Safari ба bfcache-д `visibilitychange`-ээс ИЛҮҮ
   найдвартай — таб хаагдах цорын ганц дохио байх тохиолдол бий. */
assert.ok(
  SRC.includes("window.addEventListener('pagehide'"),
  'pagehide алга — iOS/bfcache дээр сүүлийн ажил алдагдана',
);
assert.ok(
  SRC.includes("document.addEventListener('visibilitychange'"),
  'таб нуугдахад илгээхгүй байна',
);
console.log('✅ завсарлага · дээд хүлээлт · pagehide');

/* ── 3. БИЧИЛТИЙН ҮР ДҮН УНШИГДАНА ──
   ⚠️ Урьд нь `void saveQaqcDraft(...)` гэж үр дүнг ХАЯДАГ байсан тул сүлжээгүй,
   токен дууссан — аль ч тохиолдолд дэлгэц «ноорог хадгалагдав» гэж ХЭВЭЭР
   гарч, бөглөгч алсад хуулагдсан гэж итгээд өөр компьютер дээр хоосон хуудас
   хүлээж авдаг байв. */
const flush = between('const flush = () => {', 'const t = setTimeout(flush, 12_000);');
/* ⚠️ 2026-10-01: үр дүн нь 'ok' | 'big' | 'fail' — хэмжээг нэгтгэлийн ДАРАА `saveQaqcDraft` шалгана */
assert.ok(
  flush.includes('saveQaqcDraft(q.pkg, q.draft).then((res) =>') && flush.includes('setRemoteState('),
  'алсын бичилтийн үр дүн уншигдахгүй байна — «хадгалагдав» нь ХУДАЛ баталгаа болно',
);
assert.ok(flush.includes("res === 'big' ? { kind: 'big' }"), '⚠️ хэт том ноорог ил хэлэгдэх ёстой');
assert.ok(
  SRC.includes("{ kind: 'fail' }") && SRC.includes("{ kind: 'ok', at:"),
  'алсын байдлын ok/fail төлөв алга',
);
/* ⚠️ Хэрэглэгчид ХАРАГДАХ ёстой — төлөв зөвхөн санах ойд байвал утгагүй. */
assert.ok(
  SRC.includes("remoteState?.kind === 'fail'") && SRC.includes("remoteState?.kind === 'ok'"),
  'алсын байдал дэлгэцэд гарахгүй байна',
);
console.log('✅ алсын байдал ҮНЭН — ok/fail хэрэглэгчид харагдана');

/* ── 4. ӨӨР БАГЦЫН НООРОГ БИЧИГДЭХГҮЙ ──
   ⚠️ Дараалалд үлдсэн хуучин багцын ноорогийг одоогийн багцын слотод бичих нь
   өгөгдөл СОЛИХ алдаа. */
assert.ok(
  flush.includes('q.pkg !== pkg.key'),
  'өөр багцын ноорог одоогийн слотод бичигдэхээс хамгаалагдаагүй',
);
/* ⚠️ Дараалал ЦЭВЭРЛЭГДЭНЭ — эс бөгөөс нэг ноорог дахин дахин илгээгдэж,
   устгасны дараа ч ArcGIS-д буцаж амилна (зомби). */
assert.ok(
  flush.includes('remoteQueue.current = null'),
  'flush дараа дараалал цэвэрлэгдэхгүй — устгасан ноорог амилна',
);
console.log('✅ багцын хамгаалалт · дараалал цэвэрлэгдэнэ');

/* ── 5. БАГЦ СОЛИХОД НООРОГ УСТАХГҮЙ ──
   ⚠️ `promptedPkgRef` нь сешн дуустал тэгэлддэггүй байсан тул багц A→B→A
   буцахад: (1) сэргээх эффект ДАХИН ажиллахгүй, (2) хадгалах эффектийн `pend`
   хоосон салаа нь `promptedPkgRef.current === pkg.key` шалгуурыг давж
   A-гийн ноорогийг ЛОКАЛ ба АЛСАД ХОЁУЛАНГ нь УСТГАДАГ байв. Багц солих цонх
   нь эсрэгээр «Ноорог үлдэх» гэж амладаг тул тэр заалт ХУДАЛ байлаа. */
const swap = between('setPend({});', 'void load(pkg.key);');
assert.ok(
  swap.includes("promptedPkgRef.current = ''"),
  'багц солиход сэргээх шат дахин нээгдэхгүй — A→B→A буцахад ноорог устана',
);
/* ⚠️ Алсын байдал ч БАГЦАД харьяалагдана: үлдээвэл өмнөх багцын «ArcGIS 14:20»
   ногоон заалт ШИНЭ багц дээр наалдаж ХУДАЛ баталгаа болно. */
assert.ok(swap.includes('setRemoteState(null)'), 'багц солиход алсын байдал тэглэгдэхгүй');
console.log('✅ багц солиход ноорог үлдэнэ, байдал тэглэгдэнэ');

/* ── 6. ЭРХГҮЙ ҮЕД НООРОГ УСТГАХГҮЙ ──
   ⚠️ Сэргээх давталт `canEdit ? pick.d.cells : []` гэж явдаг тул эрх түр
   алдагдсан (эсвэл `caps`/`acl` хараахан ачаалагдаагүй) агшинд `cells` ХООСОН,
   `dropped` ч 0 болж, цэвэрлэх салаа ноорогийг бүрмөсөн устгадаг байв —
   сүлжээний саат ч хангалттай. */
assert.ok(
  /* ⚠️ 2026-09-17: буцахаас ӨМНӨ `promptedPkgRef`-ийг тэглэж, эрх ирэхэд сэргээлт ДАХИН ажиллана */
  SRC.includes("if (!canEdit) { promptedPkgRef.current = ''; return; }"),
  'эрх түр алдагдахад ноорог устгагдана — хамгаалалт алга',
);
console.log('✅ эрхгүй үед ноорог устахгүй');

/* ── 7. УНШИЛТЫН АЛДАА ЯЛГАГДАНА ──
   ⚠️ «Ноорог БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг `null`-аар нэгтгэвэл
   сүлжээний түр саат нь бөглөсөн ажлыг АЛГА БОЛСОН мэт харуулна. Мөн
   `promptedPkgRef`-ийг БУЦААЖ хоослох ёстой — эс бөгөөс тэр сешнд ДАХИН
   оролдох зам хаагдаж, зөвхөн хуудсыг бүтнээр дахин ачаалж (F5) байж сэргэнэ. */
assert.ok(REMOTE.includes('export async function readQaqcDraft'), 'алдааг ялгадаг уншигч алга');
assert.ok(REMOTE.includes('export type QaqcRemoteDraftRead'), 'уншилтын үр дүнгийн төрөл алга');
/* 2026-10-01: төгсгөлийн тэмдэг `if (!pick) return;` — `restoreDoneRef` хасагдсан (9-р хэсэг) */
const restore = between('const local = readDraft(dk(user?.username, key));', 'if (!pick) return;');
assert.ok(restore.includes('readQaqcDraft(key)'), 'сэргээх зам алдааг ялгадаггүй');
assert.ok(restore.includes('!rr.ok'), 'уншилтын алдаа шалгагдахгүй байна');
assert.ok(
  restore.includes("promptedPkgRef.current = ''"),
  'уншилт унахад дахин оролдох зам нээгдэхгүй байна',
);
/* ⚠️ Локал ба алсын аль нь ШИНЭ болохыг агшнаар шийднэ — хуучныг тавибал
   өөр машин дээрх шинэ ажил чимээгүй дарагдана.
   ⚠️ 2026-10-01: ноорог БҮХЛЭЭР биш, НҮД БҮРЭЭР (`lib/qaqcDraft.ts`, тусдаа шалгуур
   `src/lib/qaqcDraft.check.mjs`) — ерөнхий `t`-ийн харьцуулалт буцаж ирэх ёсгүй. */
assert.ok(restore.includes('const pick = mergeDraft(local, remD);'), 'локал/алсын нүд бүрийн нэгтгэл алга');
assert.ok(SRC.includes('const mergeDraft = mergeQaqcDrafts;'), 'нэгтгэл нь qaqcDraft.ts-ийн нүд бүрийн дүрэм байх ёстой');
assert.ok(!/remD\.t\s*>=?\s*local\.t/.test(SRC), 'ноорог бүхлээр «шинэ нь ялна» буцаж ирэв');
console.log('✅ уншилтын алдаа ялгагдана, дахин оролдоно');

/* ── 8. ГҮЙЦЭТГЭЛИЙН НООРОГТОЙ ХОЛИЛДОХГҮЙ ──
   ⚠️ Хоёр хуудас ТУСДАА хадгалалттай: локал угтвар ба ArcGIS item хоёул өөр.
   Нэгтгэвэл нэг хуудасны ачаалал нөгөөгийнхөө уншилтыг удаашруулж, түлхүүр
   зөрвөл бие биенийхээ ноорогийг чимээгүй дарна. */
assert.ok(SRC.includes("'selbe-qaqc-draft:'"), 'чанарын локал угтвар өөрчлөгдсөн');
assert.ok(!SRC.includes("'selbe-fillnew-draft:'"), 'гүйцэтгэлийн угтвар чанарын хуудсанд орсон');
assert.ok(REMOTE.includes("const TITLE = 'Selbe_QAQC_Draft';"), 'чанарын ArcGIS item өөрчлөгдсөн');
console.log('✅ гүйцэтгэлийн ноорогтой тусгаарлагдсан хэвээр');

/* ── 9. АРИЛГАСАН НҮД «ХАДГАЛААГҮЙ НООРОГ» БОЛЖ БУЦАХГҮЙ ──
   ⚠️ 2026-09-30-ны хувилбар нь хоосон `pend` дээр ноорогийг УСТГАДАГ байв.
   ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): УСТГАЛ БИШ — БУЛШ. Устгал нь «арилгасан»
   гэсэн мэдээллийг үлдээдэггүй тул өөр төхөөрөмжийн хуучин ноорог тэр нүдийг
   буцааж амилуулдаг. Одоо: (а) хадгалах эффект `pend`-ийн шилжилтээс булш
   тооцно; (б) «ноорог устгах» ба «Хадгалах» нь бүх нүдийг ШУУД булшилж ArcGIS-д
   НЭГТГЭЖ бичнэ; (в) хуудас нь ArcGIS-ийн ноорогийг БҮРЭН устгахаа больсон;
   (г) сэргээлтийн дараа ArcGIS-д дутуу (зөвхөн локалд байсан) булш/нүд илгээгдэнэ. */
{
  const eff = between('АРИЛГАЛТ = БУЛШ, УСТГАЛ БИШ', 'АЛСЫН ХУУЛБАР (2026-09-07');
  assert.ok(eff.includes('applyPendDiff(draftStRef.current, prevPendRef.current, pend, stamp)'), '⚠️ (а) эффект pend-ийн шилжилтээс булш тооцох ёстой');
  assert.ok(eff.includes('prevPendRef.current = pend'), '⚠️ (а) харсан pend тэмдэглэгдэх ёстой');
  assert.ok(eff.includes('persistLocal(pkg.key, rows)'), '⚠️ (а) локалд НЭГТГЭЖ бичих ёстой');
  assert.ok(!eff.includes('clearDraftLS(dk('), '⚠️ (а) хоосон pend дээр локал ноорог УСТГАГДАХ ёсгүй');
  const drop = between('const dropDraft = useCallback(', '/* ══════════════ ХАДГАЛАХ');
  assert.ok(drop.includes('retirePend(key, pend, rows)') && drop.includes('saveQaqcDraft(key, doc)'), '⚠️ (б) «ноорог устгах» булшилж бичих ёстой');
  const sv = between('const save = useCallback(', '/* Ctrl+S');
  /* ⚠️ 2026-10-09: `keep` — зөрчилтэй (бичигдээгүй) нүд булшлагдахгүй (13-р хэсэг) */
  assert.ok(sv.includes('retirePend(pkg.key, pend, rows, keep)') && sv.includes('await saveQaqcDraft(pkg.key, doc)'), '⚠️ (б) «Хадгалах» хадгалсан нүдийг булшлах ёстой');
  assert.ok(sv.indexOf('retirePend(') < sv.indexOf('await load(pkg.key)'), '⚠️ (б) булш нь дахин ачаалахаас ӨМНӨ (load нь loadedPkgRef-ийг хоосолдог)');
  assert.ok(!/clearQaqcDraft\(/.test(SRC), '⚠️ (в) хуудас ArcGIS-ийн ноорогийг бүрэн устгах ёсгүй (булшгүй устгал = буцаж амилалт)');
  const swap = between('setPend({});', 'void load(pkg.key);');
  assert.ok(swap.includes('prevPendRef.current = {}'), '⚠️ багц солиход pend-ийн тэглэлт «бүгдийг арилгасан» гэж булшлагдах ёсгүй');
  const rs = between('НООРОГ — СЭРГЭЭХ', 'ОЛОН НҮДЭНД БУУЛГАХ');
  assert.ok(rs.includes('adoptQaqcDraft(pick, draftStRef.current, fits, stamp, saved)'), '⚠️ сэргээлт табын төлөвт хүлээн авах ёстой (серверт байгаа утга `saved`-аар булшлагдана)');
  assert.ok(rs.includes('!draftIncludes(remD, stored)'), '⚠️ (г) ArcGIS-д дутуу булш/нүд илгээгдэх ёстой');
  assert.ok(rs.indexOf("if (!canEdit) { promptedPkgRef.current = ''; return; }") < rs.indexOf('adoptQaqcDraft('), '⚠️ эрхгүй үед булш/хүлээн авалт хийгдэх ёсгүй');
  assert.ok(rs.includes('clockRef.current = Math.max(clockRef.current, pick.t)'), '⚠️ Лампорт — харсан агшнаас хойш л шинэ агшин');
  /* fail/big заалт зөвхөн хадгалаагүй засвартай үед */
  assert.ok(SRC.includes("remoteState?.kind === 'fail' && dirtyCount > 0"), '⚠️ хоосон хуудсан дээр «ArcGIS-д хуулагдсангүй» гэх ёсгүй');
}
console.log('✅ арилгасан нүд ноорог болж буцахгүй');

/* ── 10. ⚠️ 2026-09-30: ХАДГАЛАХ ЯВЦАД ЗАСВАР ХААЛТТАЙ ──
   `save` дуусахдаа `setPend({})` хийдэг тул тэр хооронд бичсэн нүд (ноорогтой нь) арилдаг байв. */
{
  /* ⚠️ 2026-10-06: товшилт ба Enter/F2 нэг `openCell`-ийг дууддаг болсон */
  const click = between('const openCell = () => {', 'setEditCell(ekey);');
  assert.ok(click.includes('if (busy) return say(RO_BUSY())'), '⚠️ хадгалах явцад нүд нээгдэх ёсгүй');
  const paste = between('const pasteBlock', 'planQaqcPaste(');
  assert.ok(paste.includes('if (busy) { say(RO_BUSY()); return true; }'), '⚠️ хадгалах явцад буулгах ёсгүй');
  /* Зай — хадгалагдсан утгыг зайгүйгээр жишнэ (нээгээд хаахад «өөрчлөгдсөн» болохгүй) */
  const commit = between('const commit = (oid: number, di: number, raw: string) => {', 'setPend((p) => {');
  assert.ok(commit.includes("(row?.docs[di] ?? '').trim()"), '⚠️ commit: хадгалагдсан утгыг trim хийж жишнэ');
  /* «Зөвхөн бөглөөгүй N / M» — M нь ажлын мөр */
  assert.ok(SRC.includes('{emptyCount.toLocaleString()} / {leafCount.toLocaleString()}'), '⚠️ хуваагч нь ажлын мөрийн тоо');
}
console.log('✅ хадгалах явцад засвар хаалттай · зай · тоолол');

/* ── 11. ⚠️ 2026-10-01: «ХАДГАЛАХ»-ЫН ДАРАА ГҮЙЛГЭЛТ ҮСРЭХГҮЙ ──
   `load` нь `setRows([])` хийдэг тул гүйлгэх хайрцаг DOM-оос хасагдаж, шинэ хайрцаг
   `scrollTop = 0`-ээр үүсдэг байв. Дахин ачаалахын ӨМНӨ байрлалыг тэмдэглэж, мөр
   ирэхэд layout эффектэд (будахаас өмнө) сэргээнэ. */
{
  const sv = between('const save = useCallback(', '/* Ctrl+S');
  const loads = [...sv.matchAll(/await load\(pkg\.key\);/g)].map((m) => m.index);
  assert.equal(loads.length, 2, 'save доторх хоёр дахин ачаалалт (амжилт · алдаа)');
  for (const at of loads) {
    const before = sv.slice(Math.max(0, at - 120), at);
    assert.ok(before.includes('keepScroll(pkg.key);'), '⚠️ дахин ачаалахын ӨМНӨ гүйлгэлтийн байрлал тэмдэглэгдэх ёстой');
  }
  const keep = between('const keepScroll = useCallback(', '/* ══════════════ БАТЛАГДСАН');
  assert.ok(keep.includes('el.scrollTop') && keep.includes('el.scrollLeft'), 'хоёр тэнхлэгийн байрлал тэмдэглэгдэх ёстой');
  assert.ok(/useLayoutEffect\(\(\) => \{[\s\S]{0,400}el\.scrollTop = k\.top;[\s\S]{0,60}el\.scrollLeft = k\.left;[\s\S]{0,40}recalcWin\(\);/.test(keep),
    '⚠️ мөр ирэхэд (layout эффект) байрлал сэргэж, виртуал цонх дахин бодогдох ёстой');
  assert.ok(keep.includes('k.pkg !== pkg.key'), 'өөр багцад байрлал сэргээгдэх ёсгүй');
}
console.log('✅ хадгалсны дараа гүйлгэлтийн байрлал хадгалагдана');

/* ── 12. ⚠️ 2026-10-01: ArcGIS руу бичих нь НЭГТГЭЛ — ДАРАЛТ БИШ ── */
{
  const w = REMOTE.slice(REMOTE.indexOf('async function writeQaqcDraft('), REMOTE.indexOf('async function learnClockOffset('));
  assert.ok(w.length > 0, 'writeQaqcDraft алга');
  assert.ok(w.indexOf('mergeQaqcDrafts(') > 0 && w.indexOf('mergeQaqcDrafts(') < w.indexOf('fl.applyEdits('), '⚠️ бичихээс ӨМНӨ ArcGIS дээрхтэй нэгтгэх ёстой');
  assert.ok(w.includes("outFields: ['OBJECTID', 'payload']"), '⚠️ нэгтгэхийн тулд одоогийн payload уншигдах ёстой');
  assert.ok(w.includes('serializeQaqcDraft(merged, { now, maxLen: QAQC_REMOTE_MAX })'), '⚠️ хэмжээ нэгтгэлийн ДАРАА шалгагдана (хуучин булш эхэлж хаягдана)');
  assert.ok(REMOTE.includes('return serial(() => writeQaqcDraft(pkgKey, draft));'), '⚠️ энэ табын бичилтүүд дараалан явах ёстой');
  assert.ok(REMOTE.includes('editFieldsInfo?.editDateField'), '⚠️ Editor Tracking байвал серверийн цагаар засна (feature-detect)');
}
console.log('✅ ArcGIS руу нэгтгэж бичнэ · дараалал · серверийн цаг');

/* ── 13. ⚠️ 2026-10-09: ЗЭРЭГ ЗАСВАР · БУЛШНЫ ДАХИН ДАРААЛАЛ · ДАХИН ОРОЛДЛОГО ── */
{
  const sv = between('const save = useCallback(', '/* Ctrl+S');
  /* (1A) бичихийн ӨМНӨ серверийн одоогийн утгыг уншиж, зөрчилтэй нүдийг бичихгүй */
  assert.ok(sv.indexOf('fetchQaqcDocs(') > 0 && sv.indexOf('fetchQaqcDocs(') < sv.indexOf('saveQaqc(pkg.key'), '⚠️ хадгалахаас ӨМНӨ одоогийн утга дахин уншигдах ёстой');
  assert.ok(sv.includes('qaqcConflicts(pend,') && sv.includes('setPend(keep)'), '⚠️ зөрчилтэй нүд pend-д үлдэх ёстой');
  assert.ok(!sv.includes('setPend({})'), '⚠️ хадгалсны дараа зөрчилтэй нүд арчигдах ёсгүй');
  /* (5) талбарын урт — сүлжээнээс ӨМНӨ */
  assert.ok(sv.indexOf('qaqcTooLong(') >= 0 && sv.indexOf('qaqcTooLong(') < sv.indexOf('setBusy(true)'), '⚠️ уртын шалгалт сүлжээнээс өмнө');
  assert.ok(!SRC.includes('maxLength={4000}'), '⚠️ дурын 4000 хязгаар буцаж ирэв');
  /* (2) булшны бичилт унавал дахин дараалалд */
  assert.ok(/if \(res !== 'ok'\) requeueRemote\(pkg\.key, doc\)/.test(sv), '⚠️ «Хадгалах»-ын булш унавал дараалалд буцах ёстой');
  const drop = between('const dropDraft = useCallback(', '/* ══════════════ ХАДГАЛАХ');
  assert.ok(/if \(res !== 'ok'\) requeueRemote\(key, doc\)/.test(drop), '⚠️ «ноорог устгах»-ын булш унавал дараалалд буцах ёстой');
  /* (3) «алсыг уншиж чадаагүй» салаа дахин оролдлого армлана */
  const fl = between('const flush = () => {', 'const t = setTimeout(flush, 12_000);');
  const nv = fl.slice(fl.indexOf('if (remoteVerifiedRef.current !== q.pkg) {'), fl.indexOf('remoteQueue.current = null;\n      lastRemoteRef'));
  assert.ok(nv.includes('armRemoteRetry()'), '⚠️ уншиж чадаагүй салаа дахин оролдлого армлах ёстой');
  /* (4) багц солиход дараалалд үлдсэнийг ЭХЛЭЭД илгээнэ */
  const sw = SRC.slice(SRC.indexOf('flushRef.current?.();'), SRC.indexOf('remoteQueue.current = null;\n    /* ⚠️ АЛСЫН БАЙДАЛ'));
  assert.ok(sw.length > 0 && sw.includes('setPend({});'), '⚠️ багц солих эффект дарааллыг хаяхаас ӨМНӨ flush хийх ёстой');
  /* (6) нэрийн автомат бөглөлт зөвхөн өөрчлөгдсөн дугаарт */
  const cm = between('const commit = (oid: number, di: number, raw: string) => {', 'setPend((p) => {');
  assert.ok(cm.includes('const hit = v !== cur ? approvedHit(di, v) : null;'), '⚠️ өөрчлөгдөөгүй дугаарт нэр автоматаар бөглөгдөх ёсгүй');
  /* (7) батлагдсан жагсаалт багц солих · CHANAR_BARIMT хүчингүйдэлд дахин татагдана */
  assert.ok(SRC.includes("register(() => { for (const fn of approvedStaleSubs) fn(); }, ['CHANAR_BARIMT']);"), '⚠️ CHANAR_BARIMT хүчингүйдэл сонсогдох ёстой');
  assert.ok(SRC.includes('const apKey = `${pkg.group}|${apGen}`;'), '⚠️ батлагдсан жагсаалт багцаар дахин татагдах ёстой');
}
console.log('✅ зэрэг засвар · булшны дахин дараалал · дахин оролдлого · урт · батлагдсан жагсаалт');

console.log('\nqaqcDraft.check: ok');
