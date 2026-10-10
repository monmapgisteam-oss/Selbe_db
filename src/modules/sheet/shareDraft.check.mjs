/**
 * ХУВААЛЦСАН НООРОГ — «нэг багц дээр хэдэн ч аккаунт зэрэг бөглөнө».
 *   node src/modules/sheet/shareDraft.check.mjs
 *
 * ⚠️ 2026-09-08, хэрэглэгчийн шийдвэр:
 *   · ноорог нь БАГЦААР хуваалцагдана (`dkey = багц`, урьд нь `хэрэглэгч|багц`)
 *   · оролцогч нь ТОМИЛОГДОХГҮЙ — нүд бөглөсөн хүн бүр автоматаар оролцогч
 *   · «Дуусгасан» = «би цаашид бөглөхгүй», ИЛГЭЭХ БИШ
 *   · «Илгээх» ⟺ ӨӨРӨӨС БУСАД бүх оролцогч дуусгасан → сүүлд үлдсэн хүн илгээнэ
 *   · оролцогчийн ТОО хаана ч хатуу бичигдээгүй: 1 ч, 5 ч ижил ажиллана
 *
 * ⚠️ ЭНЭ ФАЙЛ ЛОГИКИЙГ АЖИЛЛУУЛЖ шалгана (эх кодын мөр тулгах биш): нийлүүлэх
 * ба түгжих дүрэм нь энэ боломжийн БҮХ утга учир бөгөөс алдаа нь чимээгүй —
 * «хагас бөглөсөн ажил илгээгдсэн» гэдэг нь ажиллуулж үзэхээс өөрөөр
 * илрэхгүй. `mergeDrafts` ба түгжээний дүрмийг эндээ ХУУЛБАРЛАН барина;
 * эх кодтой салбарлавал доорх 5-р хэсгийн гэрээ шалгуур барина.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';


/**
 * ЭХ КОДЫГ УНШИХ — CRLF → LF ЖИГДРҮҮЛНЭ.
 *
 * ⚠️ Доорх шалгуурууд олон мөрт хэсгийг ЯГ ТЕКСТЭЭР (`\n`-тэй) хайдаг.
 *    Git эх файлыг LF-ээр хадгалдаг ч Windows дээр checkout хийхэд CRLF
 *    болдог тул тэдгээр хайлт бүтэлгүйтэж, тест ХУДЛААР унадаг байв
 *    (`docs/docs.invariant.check.mjs`-ийн 2026-09-16-ны ижил алдаа).
 */
const readOne = (p) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
/* ⚠️ 2026-09-30: `FillNew.tsx` задарсан (`fill/`) — хуваалцсан ноорогийн код `fill/draft.ts` ·
   `fill/useDraftSync.ts` · `fill/useCellEdit.ts`-д. `FillNew.tsx`-ийг хүсэхэд НИЙЛБЭРИЙГ буцаана
   (FillNew эхэнд, дараа нь fill/*.ts(x) нэрийн дарааллаар) — доорх «эхний тохиолдол» anchor-ууд
   (`if (r.ok) {` · `setPvPend({});`) тэр дараалалд тулгуурлана. */
const FILL_FILES = [
  'src/modules/sheet/FillNew.tsx',
  ...fs.readdirSync('src/modules/sheet/fill').filter((f) => /\.tsx?$/.test(f)).sort().map((f) => 'src/modules/sheet/fill/' + f),
];
const readSrc = (p) => (p === 'src/modules/sheet/FillNew.tsx' ? FILL_FILES.map(readOne).join('\n') : readOne(p));
/* ⚠️ 2026-09-22 merge: bagtsiin-medeelel салбар ижил засварыг `read` нэрээр хийсэн — alias. */
const read = readSrc;
/* ══════════ `mergeDrafts` — ЖИНХЭНЭ код (`fill/draft.ts`) ══════════
 * ⚠️ 2026-10-01: урьд нь энд JS ХУУЛБАР байв (тест loader-гүй ажилладаг байсан). Одоо
 *    бүх check `tools/ts-alias.mjs`-ээр ажилладаг тул ЖИНХЭНЭ функцийг шалгана — хуулбар
 *    эх кодоос салбарлах эрсдэл (2026-10-01-ний `marks` өөрчлөлт) арилна. */
import { mergeDrafts, marksOf, doneOfMarks } from './fill/draft.ts';

/** «Илгээх» нээлттэй эсэх — FillNew-ийн `waitingOn`/`canSubmitNow` дүрэм */
const waitingOn = (d, me) => {
  const parts = new Set();
  for (const [, u] of d.by ?? []) if (u) parts.add(u);
  for (const [u] of d.done ?? []) if (u) parts.add(u);
  const doneSet = new Set((d.done ?? []).map(([u]) => u));
  return [...parts].filter((u) => u !== me && !doneSet.has(u)).sort();
};
const canSubmit = (d, me) => waitingOn(d, me).length === 0;

/* ══════════ 1. ХОЁР ХҮНИЙ АЖИЛ НИЙЛНЭ — юу ч алдагдахгүй ══════════ */
{
  /* А 1-р блокт 3 нүд, Б 2-р блокт 2 нүд — огт давхцахгүй */
  const A = { t: 1000, cells: [['10:0', '5'], ['11:0', '6'], ['12:0', '7']], by: [['10:0', 'a'], ['11:0', 'a'], ['12:0', 'a']] };
  const B = { t: 2000, cells: [['10:1', '8'], ['11:1', '9']], by: [['10:1', 'b'], ['11:1', 'b']] };
  const m = mergeDrafts(A, B);
  assert.equal(m.cells.length, 5, 'А-гийн 3 + Б-гийн 2 = 5 нүд бүгд үлдэх ёстой');
  const cm = new Map(m.cells);
  assert.equal(cm.get('10:0'), '5', 'А-гийн нүд алдагдав');
  assert.equal(cm.get('11:1'), '9', 'Б-гийн нүд алдагдав');
  /* Эзэмшил нь нүд бүрдээ дагана */
  const bm = new Map(m.by);
  assert.equal(bm.get('12:0'), 'a');
  assert.equal(bm.get('10:1'), 'b');
}
console.log('✅ хоёр талын өөр нүд НИЙЛНЭ — 3+2=5, эзэмшил нь дагана');

/* ══════════ 2. НЭГ НҮДИЙГ ЗЭРЭГ — сүүлд бичсэн нь ялна ══════════ */
{
  const A = { t: 1000, cells: [['10:0', 'хуучин']], by: [['10:0', 'a']] };
  const B = { t: 2000, cells: [['10:0', 'шинэ']], by: [['10:0', 'b']] };
  const m = mergeDrafts(A, B);
  assert.equal(new Map(m.cells).get('10:0'), 'шинэ', 'сүүлд бичсэн нь ялах ёстой');
  assert.equal(new Map(m.by).get('10:0'), 'b', 'утга нь Б-гийнх бол эзэн нь ч Б байх ёстой');
  /* ⚠️ Эсрэг дараалалд ч ИЖИЛ хариу — нийлүүлэлт нь аргументийн дарааллаас
     хамаарах ЁСГҮЙ (локал↔алс аль нь ч эхэнд ирж болно) */
  const m2 = mergeDrafts(B, A);
  assert.equal(new Map(m2.cells).get('10:0'), 'шинэ');
  assert.equal(new Map(m2.by).get('10:0'), 'b');
}
console.log('✅ нэг нүдийг зэрэг — сүүлийнх ялна, дарааллаас үл хамаарна');

/* ══════════ 3. «ИЛГЭЭХ»-ИЙН ТҮГЖЭЭ — сүүлд үлдсэн хүн ══════════ */
{
  /* ── Ганцаараа: хүлээх хүнгүй → ШУУД нээлттэй (хуучин зан хэвээр) ── */
  const solo = { t: 1, cells: [['10:0', '5']], by: [['10:0', 'a']] };
  assert.equal(canSubmit(solo, 'a'), true, 'ганцаараа бөглөж байхад илгээх нээлттэй байх ёстой');

  /* ── Гурвуулаа бөглөж байна: ХЭН Ч илгээж чадахгүй ── */
  const three = {
    t: 1, cells: [['10:0', '1'], ['10:1', '2'], ['10:2', '3']],
    by: [['10:0', 'a'], ['10:1', 'b'], ['10:2', 'v']],
  };
  for (const me of ['a', 'b', 'v']) {
    assert.equal(canSubmit(three, me), false, `${me}: бусад дуусгаагүй байхад илгээх түгжээтэй байх ёстой`);
  }
  assert.deepEqual(waitingOn(three, 'a'), ['b', 'v'], 'хүлээгдэж буй хүмүүсийг нэрээр нь хэлэх ёстой');

  /* ── А дуусгасан: Б, В хоёулаа хүлээсээр (нөгөө нь үлдсэн) ── */
  const one = { ...three, done: [['a', 100]] };
  assert.equal(canSubmit(one, 'b'), false, 'В үлдсэн тул Б илгээж чадахгүй');
  assert.equal(canSubmit(one, 'v'), false, 'Б үлдсэн тул В илгээж чадахгүй');
  assert.equal(canSubmit(one, 'a'), false, 'А өөрөө дуусгасан ч Б, В үлдсэн');

  /* ── А ба Б дуусгасан: ЗӨВХӨН В илгээнэ ── */
  const two = { ...three, done: [['a', 100], ['b', 200]] };
  assert.equal(canSubmit(two, 'v'), true, 'сүүлд үлдсэн В илгээх ёстой');
  assert.equal(canSubmit(two, 'a'), false, 'А-д В үлдсэн хэвээр');
  assert.equal(canSubmit(two, 'b'), false, 'Б-д В үлдсэн хэвээр');
  /* ⚠️ В «Дуусгасан» дарах ШААРДЛАГАГҮЙ — илгээх нь өөрөө батламж */
}
console.log('✅ илгээх түгжээ — ганцаараа нээлттэй · 3 хүнтэй зөвхөн сүүлийнх');

/* ══════════ 4. ТООНООС ҮЛ ХАМААРНА — 1, 2, 5 хүн ижил дүрэм ══════════ */
{
  for (const n of [1, 2, 5, 9]) {
    const users = Array.from({ length: n }, (_, i) => `u${i}`);
    const d = {
      t: 1,
      cells: users.map((u, i) => [`10:${i}`, String(i)]),
      by: users.map((u, i) => [`10:${i}`, u]),
      /* Сүүлийнхээс бусад нь бүгд дуусгасан */
      done: users.slice(0, -1).map((u, i) => [u, 100 + i]),
    };
    const last = users[users.length - 1];
    assert.equal(canSubmit(d, last), true, `${n} хүнтэй: сүүлийнх илгээх ёстой`);
    if (n > 1) {
      assert.equal(canSubmit(d, users[0]), false, `${n} хүнтэй: эхнийх илгээж чадахгүй`);
    }
  }
}
console.log('✅ оролцогчийн ТОО хамаарахгүй — 1 · 2 · 5 · 9 хүнд ижил');

/* ══════════ 5. «ДАХИН ЗАСАХ» — буцаалт нийлүүлэлтээр эргэж СЭРГЭХГҮЙ ══════════ */
/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас — ШИЙДВЭР): буцаалт нь ИЛ ТЭМДЭГ (`marks`, төлөв 0,
   seq өсөх) — урьдын «шинэ ноорогт нэр алга = буцаасан» дүрэм хүчингүй (доорх 5c). */
{
  /* А дуусгасан (seq 1). Дараа нь А «Дахин засах» (seq 2, төлөв 0). */
  const before = { t: 1000, cells: [['10:0', '1']], by: [['10:0', 'a']], done: [['a', 900]], marks: [['a', 1, 1, 900]] };
  const after = { t: 2000, cells: [['10:0', '1']], by: [['10:0', 'a']], done: [], marks: [['a', 0, 2, 1500]] };
  for (const m of [mergeDrafts(before, after), mergeDrafts(after, before)]) {
    assert.ok(!m.done || !m.done.some(([u]) => u === 'a'),
      'буцаасны дараа «дуусгасан» тэмдэглэгээ нийлүүлэлтээр СЭРГЭХ ЁСГҮЙ');
  }

  /* ⚠️ ЭСРЭГ ТАЛ: нөгөө хүний ХУУЧИН ноорог ирэхэд шинэ тэмдэглэгээ
     арчигдах ёсгүй. Б-гийн хуучин хуулбарт `done` огт байхгүй ч А саяхан
     дуусгасан бол тэр хэвээр үлдэнэ. */
  const bOld = { t: 500, cells: [['11:0', '2']], by: [['11:0', 'b']] };
  const aNew = { t: 3000, cells: [['10:0', '1']], by: [['10:0', 'a']], done: [['a', 2900]] };
  const m2 = mergeDrafts(bOld, aNew);
  assert.ok(m2.done?.some(([u]) => u === 'a'),
    'хуучин хуулбар нийлэхэд ШИНЭ «дуусгасан» тэмдэглэгээ арчигдах ёсгүй');
}
console.log('✅ «Дахин засах» — буцаалт сэргэхгүй · хуучин хуулбар шинийг арчихгүй');

/* ══════════ 5b. НҮДНИЙ АГШИН (`byAt`) · ХООСОН `done` · rowKeys-ийн дараалал (2026-09-25) ══════════ */
{
  /* А-гийн ШИНЭ ноорогт Б-гийн өмнөх X=5 (byAt 50) хөндөгдөөгүй хуулбар байна;
     Б-гийн алсын хуулбарт ХОЖУУ засвар X=8 (byAt 100). Ноорог нь шинэ ч нүд
     нь хуучирсан тул 8 ялах ёстой, эзэн нь ч Б. */
  const remote = { t: 1000, cells: [['10:0', '8']], by: [['10:0', 'b']], byAt: [['10:0', 100]] };
  const local = { t: 2000, cells: [['10:0', '5']], by: [['10:0', 'b0']], byAt: [['10:0', 50]] };
  for (const m of [mergeDrafts(remote, local), mergeDrafts(local, remote)]) {
    assert.equal(new Map(m.cells).get('10:0'), '8', 'хожуу хөндсөн нүд (byAt) ялах ёстой');
    assert.equal(new Map(m.by).get('10:0'), 'b', 'эзэн нь ялсан утгыг дагана');
  }
  /* ИЛ буцаалт (төлөв 0) нийлүүлэлтийн дараа `done` нь `[]` — `undefined` болохгүй (2026-10-01: `marks`) */
  const before = { t: 1000, cells: [], done: [['a', 900]], marks: [['a', 1, 1, 900]] };
  const after = { t: 2000, cells: [], done: [], marks: [['a', 0, 2, 1000]] };
  assert.deepEqual(mergeDrafts(before, after).done, [], 'ИЛ буцаалт `[]` хэвээр үлдэх ёстой');
  /* rowKeys — oid өсөхөөр (хуудасны дараалал) */
  /* ⚠️ 2026-10-04 (#1 · #2): rowKeys нь ЗӨВХӨН нүд/огноонд үлдсэн oid-оор — тиймээс нүдтэй */
  const r1 = { t: 1000, cells: [['30:0', '1'], ['10:0', '1']], rowKeys: [[30, 'x'], [10, 'x']] };
  const r2 = { t: 2000, cells: [['20:0', '1']], rowKeys: [[20, 'x']] };
  assert.deepEqual(mergeDrafts(r1, r2).rowKeys.map(([o]) => o), [10, 20, 30]);
  /* нүдгүй болсон (өмнөх жаазны) танигч хаягдана — `oidFix`-ийн нэрийдлийг эзлэхгүй */
  assert.deepEqual(mergeDrafts({ ...r1, cells: [['10:0', '1']] }, r2).rowKeys.map(([o]) => o), [10, 20]);
}
console.log('✅ нүдний агшин ялна · хоосон done хадгалагдана · rowKeys хуудасны дарааллаар');

/* ══════════ 5c. А «ДУУСГАСАН» ДАРСАН, Б БИЧСЭЭР (2026-10-01, хэрэглэгч: бүгдийг зас — ШИЙДВЭР) ══════════
 * Б-гийн ноорог А-гийн тэмдгийг хараахан татаж аваагүй (`marks`-д А алга) ч ШИНЭ (t их).
 * Урьд нь нийлүүлэлт А-гийн «Дуусгасан»-ыг АРЧиж, Б-гийн «Илгээх» түгжигдсэн хэвээр байв.
 */
{
  const aDone = {
    t: 3000, mode: 'inc', cells: [['10:0', '5']], by: [['10:0', 'a']], byAt: [['10:0', 2000]],
    done: [['a', 3000]], marks: [['a', 1, 1, 3000]],
  };
  const bTyping = {
    t: 3500, mode: 'inc', cells: [['10:0', '5'], ['11:0', '7']], by: [['10:0', 'a'], ['11:0', 'b']],
    byAt: [['10:0', 2000], ['11:0', 3400]], done: [], marks: [],
  };
  for (const m of [mergeDrafts(aDone, bTyping), mergeDrafts(bTyping, aDone)]) {
    assert.ok(m.done.some(([u]) => u === 'a'), 'Б-гийн шинэ ноорог А-гийн «Дуусгасан»-ыг АРЧИХ ЁСГҮЙ');
    assert.equal(new Map(m.cells).get('11:0'), '7', 'Б-гийн бичиж буй нүд хадгалагдах ёстой');
    assert.equal(canSubmit(m, 'b'), true, 'А дуусгасан тул Б (сүүлд үлдсэн) илгээх ёстой');
    assert.equal(canSubmit(m, 'a'), false, 'Б дуусгаагүй тул А илгээж болохгүй');
  }
  /* Б бичсээр — гурав дахь тойрог (Б-гийн дараагийн бичилт ч А-г агуулаагүй) */
  const bMore = { ...bTyping, t: 4000, cells: [...bTyping.cells, ['12:0', '9']], marks: [] };
  const m3 = mergeDrafts(mergeDrafts(aDone, bTyping), bMore);
  assert.ok(m3.done.some(([u]) => u === 'a'), 'дараалсан бичилтэд ч А-гийн тэмдэг үлдэх ёстой');

  /* ЦАГИЙН ЗӨРҮҮ: А-гийн компьютер 1 цаг УРАГШ (дуусгасан), утас нь 1 цаг ХОЦОРСОН («Дахин засах»).
     seq (2 > 1) шийднэ — цаг биш. */
  const H = 3_600_000;
  const pcDone = { t: 10_000 + H, cells: [], marks: [['a', 1, 1, 10_000 + H]] };
  const phoneUndo = { t: 11_000 - H, cells: [], marks: [['a', 0, 2, 11_000 - H]] };
  for (const m of [mergeDrafts(pcDone, phoneUndo), mergeDrafts(phoneUndo, pcDone)]) {
    assert.equal(m.done.length, 0, 'цаг зөрсөн ч хожуу (seq их) «Дахин засах» ялах ёстой');
  }
  /* Хуучин клиентийн ноорог (`marks`-гүй, `done: []`) А-гийн тэмдгийг арчихгүй */
  const legacy = { t: 9_000, cells: [], done: [] };
  assert.ok(mergeDrafts(aDone, legacy).done.some(([u]) => u === 'a'), 'хуучин ноорогийн хоосон done буцаалт БИШ');
  /* Хуучин ноорогийн `done` — seq 0-ийн «дуусгасан»; ил буцаалт (seq 1) ялна */
  const legacyDone = { t: 1_000, cells: [], done: [['a', 900]] };
  const undo1 = { t: 500, cells: [], marks: [['a', 0, 1, 400]] };
  assert.equal(mergeDrafts(legacyDone, undo1).done.length, 0, 'ил буцаалт хуучин done-оос давамгайлах ёстой');
  /* `marksOf`/`doneOfMarks` — жижиг үсэг, хамгийн их seq */
  const mk = marksOf({ t: 1, cells: [], marks: [['A ', 1, 1, 5], ['a', 0, 2, 4]] });
  assert.deepEqual([...mk.values()], [['a', 0, 2, 4]]);
  assert.deepEqual(doneOfMarks(marksOf({ t: 1, cells: [], done: [['B', 7]] })), [['b', 7]]);
}
console.log('✅ «Дуусгасан» — ил тэмдэг · Б бичсээр байхад А-гийн тэмдэг арчигдахгүй · цагийн зөрүүнд seq шийднэ');

/* ══════════ 6. ЭХ КОДЫН ГЭРЭЭ — салбарлалтыг барина ══════════ */
{
  const DR = read('src/lib/draftRemote.ts');
  /* Түлхүүр нь БАГЦ — хэрэглэгчийн нэр ОРОХГҮЙ */
  assert.ok(/const keyOf = \(pkgKey: string\) => pkgKey;/.test(DR),
    'draftRemote: `keyOf` нь зөвхөн багцаар түлхүүрлэх ёстой (хуваалцсан ноорог)');
  assert.ok(!/keyOf\(auth\.user/.test(DR),
    'draftRemote: `keyOf(auth.user, …)` үлдсэн — ноорог хуваалцагдахгүй');
  /* Шилжүүлэлтийн зам байх ёстой */
  for (const fn of ['readLegacyDrafts', 'clearLegacyDrafts']) {
    assert.ok(DR.includes(`export async function ${fn}`),
      `draftRemote: ${fn} алга — хуучин ноорог чимээгүй алга болно`);
  }


  /*
   * ⚠️ READ-MERGE-WRITE — 2026-09-08-нд МЭДЭЭЛЭГДСЭН БОДИТ ЭВДРЭЛ.
   * Татах мөчлөг нь зөвхөн УНШИХ талыг нийлүүлдэг байв; бичих тал нь
   * локал ноорогийг алсад ШУУД бичдэг байсан тул А 342 нүд бөглөөд
   * Б 1 нүд бөглөхөд Б-гийнх алсыг бүхэлд нь дарж А-гийн 341 нүд УСТСАН.
   * Бичихээсээ өмнө уншиж нийлүүлэх нь энэ боломжийн БҮХ утга учир.
   */
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  /* Draft төрөлд хамтын төлөв */
  assert.ok(/by\?: \[string, string\]\[\];/.test(FN), 'Draft-д `by` (эзэмшил) алга');
  assert.ok(/done\?: \[string, number\]\[\];/.test(FN), 'Draft-д `done` (дуусгасан) алга');
  /* Түгжээний дүрэм — `waitingOn` дээр баригдана */
  assert.ok(/const canSubmitNow = waitingOn\.length === 0;/.test(FN),
    'FillNew: «Илгээх» нь `waitingOn` хоосон эсэхээр шийдэгдэх ёстой');
  /* ⚠️ Оролцогчийн ТОО хатуу бичигдэх ЁСГҮЙ — «2 хүн» гэсэн таамаг */
  assert.ok(!/participants\.size === 2|waitingOn\.length === 1/.test(FN),
    'FillNew: оролцогчийн тоо хатуу бичигдсэн — хэдэн ч аккаунт ажиллах ёстой');
  /*
   * Нийлүүлэлтийн мөчлөг ба бичиж байхад курсор хамгаалах.
   * ⚠️ 2026-09-08: хамгаалалт нь АЛГАСАХ нөхцөлөөс БУУЛГАХ салаа руу шилжсэн
   *    (12-р бүлгийг үз): бүхэл мөчлөгийг зогсоовол нөгөө талын ажил хэзээ ч
   *    ирэхгүй. Одоо уншилт үргэлж явж, зөвхөн дэлгэцэд буулгах нь хойшилно.
   */
  assert.ok(FN.includes('if (editRef.current) {'),
    'FillNew: нүд засаж байхад дэлгэцэд буулгахыг хойшлуулах хамгаалалт алга — курсор үсэрнэ');
  assert.ok(/lastMergedRef/.test(FN), 'FillNew: давхар нийлүүлэлтийн хамгаалалт алга');
  /* Хуучин мөрийг ЗӨВХӨН амжилттай бичсэний дараа устгана */
  /* ⚠️ Блокийн ТӨГСГӨЛӨӨР хайчилна, тэмдэгтийн тоогоор БИШ: гүйцэтгэлийн
     оновчлол нэмэгдэхэд тогтмол урт (800) хүрэлцэхгүй болж, шалгуур ХУДЛАА
     унасан (2026-09-08). Дараагийн салаа (`setRemoteState({ kind: 'fail'`)
     хүртэлх хэсэг нь яг тэр `r.ok` блок. */
  const okStart = FN.indexOf('if (r.ok) {');
  const okBlock = FN.slice(okStart, FN.indexOf("setRemoteState({ kind: 'fail', why: r.error })", okStart));
  assert.ok(/clearLegacyDrafts/.test(okBlock),
    'FillNew: хуучин мөрийн устгалт `r.ok` салаанд байх ёстой (бичилт баталгаажсаны дараа)');
}
console.log('✅ эх кодын гэрээ — түлхүүр · шилжүүлэлт · түгжээ · мөчлөг');

/* ══════════ 7. БИЧИХ ЗАМ НЬ НИЙЛҮҮЛДЭГ ЭСЭХ ══════════ */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  /* `flush` (3 сек тутмын алсын бичилт) — бичихээсээ ӨМНӨ уншина.
     ⚠️ Блокийн ХИЛИЙГ дараагийн тэмдэглэгээгээр олно, тэмдэгтийн тоогоор БИШ:
     гүйцэтгэлийн оновчлол нэмэгдэхэд тогтмол цонх хүрэлцэхгүй болж шалгуур
     ХУДЛАА уналаа (2026-09-08). */
  /* 2026-09-24: багц солиход хуучин түлхүүрийг ил авдаг — `flush(pkgKey?)` */
  const fi = FN.indexOf('const flush = (pkgKey?: string) => {');
  assert.ok(fi > 0, 'FillNew: flush олдсонгүй');
  const fb = FN.slice(fi, FN.indexOf('flushRef.current = flush;', fi));
  assert.ok(fb.includes('await readRemoteDraft(q.pkg)'),
    'flush: бичихээсээ өмнө алсаас УНШИХГҮЙ байна — нөгөө оролцогчийн ажил дарагдана');
  assert.ok(fb.includes('mergeDrafts(remote, q.draft)'),
    'flush: уншсаныг НИЙЛҮҮЛЭХГҮЙ байна');
  const wi = fb.indexOf('await saveRemoteDraft');
  const ri = fb.indexOf('readRemoteDraftAt(q.pkg)');
  assert.ok(ri > 0 && wi > 0 && ri < wi,
    'flush: уншилт (хямд шалгалт) нь бичилтээс ӨМНӨ байх ёстой');
  /* `toggleDone` — мөн адил */
  const ti = FN.indexOf('const toggleDone = useCallback');
  assert.ok(ti > 0, 'FillNew: toggleDone олдсонгүй');
  /* 2026-09-25: түлхүүрийг `want`-д барина (багцын хамгаалалт) — цонх нь callback-ийн төгсгөл хүртэл */
  const tb = FN.slice(ti, FN.indexOf('}, [meKey, iAmDone', ti));
  assert.ok(tb.includes('readRemoteDraft(want)') && tb.includes('const want = pkg.key'),
    'toggleDone: бичихээсээ өмнө уншихгүй — «Дуусгасан» дархад бусдын нүд устана');
  /* Багц солиход нийлүүлэлтийн агшин тэглэгдэнэ */
  const ri2 = FN.indexOf('setPvPend({});');
  assert.ok(FN.slice(Math.max(0, ri2 - 900), ri2).includes('lastMergedRef.current = 0'),
    'багц солиход lastMergedRef тэглэгдэхгүй — шинэ багцын алсын ноорог «хуучин» гэж алгасагдана');
}
console.log('✅ бичих зам НИЙЛҮҮЛНЭ — flush ба toggleDone read-merge-write');

/* ══════════ 8. ЭЗЭМШИЛ БҮРТГЭГДЭХ ЗАМУУД ══════════ */
/**
 * ⚠️ 2026-09-08-нд МЭДЭЭЛЭГДСЭН ЭВДРЭЛ: `mineRef` нь ЗӨВХӨН олон нүдний
 * (paste) зам дээр бичигддэг байсан тул нүдийг ГАРААС нэг нэгээр бөглөсөн
 * хүн `by`-д ОРОХГҮЙ. Улмаар `participants` хоосон → `waitingOn` хоосон →
 * «Илгээх» түгжээ ХЭЗЭЭ Ч ажиллахгүй, хоёулаа зэрэг илгээж чаддаг байв.
 * Түгжээ нь эзэмшлийн бүртгэлээс ХАМААРНА — хоёр зам ХОЁУЛАА бичих ёстой.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  const adds = FN.split('mineRef.current.add(').length - 1;
  assert.ok(adds >= 2,
    `FillNew: mineRef.current.add() ЯГ ${adds} газар — нэг нүдний (commit) ба олон нүдний (paste) ЗАМ ХОЁУЛАА тэмдэглэх ёстой`);
  /* Ноорог бичихдээ бусдын эзэмшлийг ч хадгална */
  assert.ok(FN.includes('byMapRef.current'),
    'FillNew: ноорог бичихэд бусдын эзэмшил (byMap) хадгалагдахгүй — оролцогч хумигдаж түгжээ нээгдэнэ');
}
console.log('✅ эзэмшил — commit ба paste хоёулаа бүртгэнэ, бусдынх хадгалагдана');

console.log('\nshareDraft.check: ok');

/* ══════════ 9. ГҮЙЦЭТГЭЛ — ХЯМД ШАЛГАЛТ ба ДЭМИЙ АЖИЛ ТАСЛАХ ══════════ */
/**
 * ⚠️ 2026-09-08 (хэрэглэгч: «шилжүүлэлт удаан байна, перформансыг мэргэжлийн
 * түвшинд сайжруул»). Хуваалцсан ноорог нь 3 секунд тутам уншиж, бичихийн
 * өмнө дахин уншдаг тул гурван зардал үүссэн байв:
 *   1. `payload` (80KB хүртэл) БҮТНЭЭР татагдана — ихэнх тойрогт юу ч
 *      өөрчлөгдөөгүй байхад ч. → `readRemoteDraftAt` нь зөвхөн `at` татна.
 *   2. `new FeatureLayer()` бүр удаа давхаргын тодорхойлолтыг дахин татна.
 *      → URL тутамд НЭГ instance кэшлэгдэнэ.
 *   3. Агуулга ижил байхад ч дахин бичигдэж, нөгөө талын хямд шалгалтыг
 *      «өөрчлөгдсөн» болгож дэмий татуулна. → биетээр тулгаж таслана.
 * Эдгээр нь бүгд ЗАН ТӨЛӨВИЙГ хөндөхгүй — зөвхөн дэмий ажлыг арилгана.
 */
{
  const DR = read('src/lib/draftRemote.ts');
  assert.ok(DR.includes('export async function readRemoteDraftAt'),
    'draftRemote: хямд `at` шалгалт алга — мөчлөг бүрд 80KB татна');
  const ai = DR.indexOf('export async function readRemoteDraftAt');
  const ab = DR.slice(ai, ai + 1200);
  assert.ok(ab.includes("outFields: ['OBJECTID', 'at']"),
    'readRemoteDraftAt: `payload` татаж байна — хямд байхаа больсон');
  assert.ok(!ab.includes("'payload'"), 'readRemoteDraftAt: payload огт татагдах ёсгүй');
  assert.ok(DR.includes('const layerCache = new Map'),
    'draftRemote: давхаргын кэш алга — дуудлага бүрд шинэ FeatureLayer үүснэ');

  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  /* Татах мөчлөг ба бичих зам ХОЁУЛАА хямд шалгалтаар эхэлнэ */
  const uses = FN.split('readRemoteDraftAt(').length - 1;
  assert.ok(uses >= 3,
    `FillNew: readRemoteDraftAt ${uses} газар — татах мөчлөг · flush · toggleDone ГУРВУУЛАА хэрэглэх ёстой`);
  /* Дэмий бичилт таслагдана, зөвхөн амжилттай бичилтэд тэмдэглэгдэнэ */
  /* 2026-09-24: багц солигдсон (`!live()`) бол `lastBodyRef` шинэ багцынх тул тулгахгүй */
  assert.ok(FN.includes('if (live() && body === lastBodyRef.current)'),
    'FillNew: агуулга ижил байхад бичилт таслагдахгүй — нөгөө талд дэмий татах гинжин урвал');
  const okIdx = FN.indexOf('lastBodyRef.current = body;');
  assert.ok(okIdx > 0 && FN.slice(okIdx - 400, okIdx).includes('if (r.ok) {'),
    'FillNew: lastBodyRef нь ЗӨВХӨН амжилттай бичилтийн дараа тэмдэглэгдэх ёстой');
  /* Багц солиход таслуур тэглэгдэнэ */
  const rst = FN.indexOf('setPvPend({});');
  assert.ok(FN.slice(Math.max(0, rst - 1200), rst).includes("lastBodyRef.current = ''"),
    'багц солиход lastBodyRef тэглэгдэхгүй — шинэ багцын бичилт санамсаргүй алгасагдана');
}
console.log('✅ гүйцэтгэл — хямд at шалгалт · давхаргын кэш · дэмий бичилт таслах');

/* ══════════ 10. ОРОЛЦОГЧИЙН ЭХ СУРВАЛЖ — 2 ЗАМ ══════════ */
/**
 * ⚠️ 2026-09-08-нд МЭДЭЭЛЭГДСЭН ЭВДРЭЛ (хоёр дахь удаа): хоёр цонхонд
 * «Илгээх» ХОЁУЛАА идэвхтэй харагдаж байв.
 *
 * ШАЛТГААН: `participants` нь ЗӨВХӨН `byMap`-аас гардаг байсан ч `byMap` нь
 * ЗӨВХӨН `pickDraft`-аас (сэргээлт · нийлүүлэлт) тавигддаг. Хэрэглэгч гараас
 * бөглөж байхад эзэмшил нь `mineRef`-д л бичигддэг тул:
 *   А бөглөнө → `mineRef` дүүрнэ, `byMap` ХООСОН → `participants` = {}
 *   → `waitingOn` = [] → түгжээ ХЭЗЭЭ Ч асахгүй.
 * Эзэмшлийн ХОЁР эх сурвалж (нийлүүлэгдсэн `byMap` + энэ сешний `mineRef`)
 * ХОЁУЛАА тооцогдох ёстой.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  const pi = FN.indexOf('const participants = useMemo');
  assert.ok(pi > 0, 'FillNew: participants олдсонгүй');
  const pb = FN.slice(pi, FN.indexOf('const waitingOn', pi));
  assert.ok(pb.includes('byMap.values()'),
    'participants: нийлүүлэгдсэн эзэмшил (byMap) тооцогдохгүй байна');
  assert.ok(pb.includes('mineRef.current.size'),
    'participants: ЭНЭ СЕШНИЙ эзэмшил (mineRef) тооцогдохгүй — гараас бөглөсөн хүн оролцогч болохгүй, түгжээ хэзээ ч асахгүй');
  assert.ok(pb.includes('doneBy'),
    'participants: «дуусгасан» тэмдэглэгээтэй хүн тооцогдохгүй байна');
  /* Нүд бөглөх бүрд дахин бодогдох ёстой (mineRef нь ref тул өөрөө өдөөхгүй) */
  const deps = FN.slice(FN.indexOf('return s;', pi), FN.indexOf('const waitingOn', pi));
  assert.ok(/\}, \[byMap, doneBy, meKey, pending, pendDate\]\)/.test(deps),
    'participants: `pending`/`pendDate` хамааралд алга — mineRef өөрчлөгдөхөд дахин бодогдохгүй');
}
console.log('✅ оролцогч — byMap (нийлүүлсэн) БА mineRef (энэ сешн) хоёулаа');

/* ══════════ 11. ӨӨРИЙН ЭЗЭМШИЛ НИЙЛҮҮЛЭЛТЭД АЛГА БОЛОХГҮЙ ══════════ */
/**
 * ⚠️ 2026-09-08-нд ХОЁР УДАА мэдээлэгдсэн эвдрэл: хоёр цонхонд «Илгээх»
 * ХОЁУЛАА идэвхтэй.
 *
 * СҮҮЛИЙН ШАЛТГААН: `pickDraft` нь `byMap`-ыг БҮХЭЛД НЬ орлуулдаг. Энэ сешнд
 * гараас бөглөсөн нүд алсад хараахан хүрээгүй бол (бичилт 3 сек хойшилдог)
 * нийлүүлэлт ирэх бүрд эзэмшил АЛГА БОЛНО → `participants`-аас өөрөө хасагдаж,
 * нөгөө талд «оролцоогүй» гэж харагдана.
 *
 * ДҮРЭМ: `mineRef` нь ЭНЭ БАГЦЫН, ЭНЭ СЕШНИЙ бодит үнэн тул алсынхаас ДЭЭГҮҮР.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  const i = FN.indexOf('const nextBy = new Map<string, string>();');
  assert.ok(i > 0, 'FillNew: pickDraft-ийн nextBy олдсонгүй');
  const b = FN.slice(i, FN.indexOf('setByMap(nextBy);', i));
  assert.ok(b.includes('mineRef.current'),
    'pickDraft: өөрийн эзэмшил (mineRef) хадгалагдахгүй — нийлүүлэлт бүрд алга болж «Илгээх» түгжээ нээгдэнэ');
  assert.ok(b.includes('nextBy.set(k, meNow)'),
    'pickDraft: өөрийн нүдийг өөрийн нэрээр дарж бичихгүй байна');
  /* Зөөлт: mineRef-ийн түлхүүр ч fixKey-ээр дагана */
  assert.ok(b.includes('moved.add(k)') && b.includes('mineRef.current = moved'),
    'pickDraft: mineRef нь ObjectID зөөлтөд дагахгүй — архивын шинэ жаазад эзэмшил тасарна');
}
console.log('✅ өөрийн эзэмшил — нийлүүлэлтэд алга болохгүй, зөөлтөд дагана');

/* ══════════ 12. ТАТАХ МӨЧЛӨГ НҮД НЭЭЛТТЭЙ БАЙХАД ЗОГСОХГҮЙ ══════════ */
/**
 * ⚠️ 2026-09-08-нд ГУРАВ ДАХЬ УДАА мэдээлэгдсэн эвдрэл: «2 талд 2 өөр нүд
 * бөглөсөн ч хоёулаа илгээх».
 *
 * ШАЛТГААН: татах мөчлөгийн алгасах нөхцөлд `editRef.current` байсан — нүд
 * НЭЭЛТТЭЙ байхад бүхэл мөчлөг алгасдаг. Бөглөгч нүд рүү орсон чигээрээ
 * бодож суувал (ЭНГИЙН зан төлөв) нөгөө талын ажил ХЭЗЭЭ Ч ирэхгүй →
 * `byMap` хоосон хэвээр → «Илгээх» хоёуланд нь нээлттэй.
 *
 * ДҮРЭМ: УНШИЛТ нь нүднээс хамаарах ёсгүй (хэнд ч саад болохгүй, хямд).
 * Зөвхөн ДЭЛГЭЦЭД БУУЛГАХ нь хойшилно — тэр нь курсор үсрэхээс хамгаална.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  const ti = FN.indexOf('const tick = async () => {');
  assert.ok(ti > 0, 'FillNew: татах мөчлөгийн tick олдсонгүй');
  const tb = FN.slice(ti, FN.indexOf('timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);', ti + 900));
  /* Алгасах нөхцөлд `editRef` БАЙХ ЁСГҮЙ */
  const skip = tb.slice(tb.indexOf('if (document.visibilityState'), tb.indexOf('const at = await'));
  assert.ok(!skip.includes('editRef'),
    'татах мөчлөг: нүд нээлттэй байхад БҮХЭЛ мөчлөг алгасаж байна — нөгөө талын ажил хэзээ ч ирэхгүй');
  assert.ok(skip.includes('remoteQueue.current'),
    'татах мөчлөг: өөрийн бичилттэй уралдахаас хамгаалалт алга');
  /* Буулгалтын талд `editRef` ЗААВАЛ байх */
  const apply = FN.slice(FN.indexOf('if (remote && remote.t > lastMergedRef.current) {', ti));
  assert.ok(apply.slice(0, 900).includes('if (editRef.current) {'),
    'татах мөчлөг: нүд нээлттэй байхад дэлгэцэд буулгаж байна — курсор үсэрнэ');
  /* Хойшлуулахдаа `lastMergedRef`-ийг хөдөлгөх ЁСГҮЙ (дараа дахин буух ёстой) */
  const guard = apply.slice(apply.indexOf('if (editRef.current) {'), apply.indexOf('lastMergedRef.current = remote.t;'));
  assert.ok(!guard.includes('lastMergedRef.current ='),
    'татах мөчлөг: хойшлуулахдаа lastMergedRef хөдөлж байна — тэр агшин ДАХИН буухгүй, ажил алдагдана');
}
console.log('✅ татах мөчлөг — нүд нээлттэй ч ТАТНА, зөвхөн буулгалт хойшилно');

/* ══════════ 13. БУСДЫН НҮД ХҮСНЭГТ ДЭЭР ЯЛГАРНА ══════════ */
/**
 * ⚠️ 2026-09-10 (хэрэглэгч: «2 acc нэг ноорог хуваалцдаг нь санаа зовоож бн»).
 *
 * `byMap` нь нүд бүрийн эзнийг 2026-09-08-наас хойш хадгалдаг байсан ч
 * ЗӨВХӨН оролцогчийн жагсаалт ба «Илгээх» түгжээнд ашиглагдаж, ХҮСНЭГТ
 * дээр огт харагддаггүй байв. Улмаар бөглөгч нөгөөгийнхөө ажлыг өөрийнх
 * гэж андуурч дээгүүр нь бичих эрсдэлтэй — хуваалцсан ноорогийн ганц
 * үлдсэн бодит эрсдэл нь ЯГ ЭНЭ (кодын merge нь нүд тус бүрээр зөв).
 *
 * ДҮРЭМ: илгээгээгүй нүдний эзэн нь ӨӨР хүн бол ялгаатай харагдана
 * (`byOther` класс) ба эзний нэр нь `title`-д бичигдэнэ.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes('const cellBy = dirty ? byMap.get(key) : undefined;'),
    'FillNew: нүдний эзнийг byMap-аас уншихгүй байна — бусдын нүд ялгарахгүй');
  /* ⚠️ `meKey` шалгалт ЗААВАЛ: нэвтрэлт унтраалттай (хөгжүүлэлт) үед
     `meKey` хоосон болдог тул түүнгүйгээр БҮХ нүд «бусдынх» болж шарлана. */
  assert.ok(/const byOther = [^;]*!!meKey/.test(FN),
    'FillNew: byOther нь meKey-г шалгахгүй байна — нэвтрэлтгүй үед бүх нүд бусдынх болно');
  assert.ok(FN.includes("(byOther ? \" byOther\" : \"\") +"),
    'FillNew: byOther класс нүдэнд тавигдахгүй байна');
  assert.ok(FN.includes("tr('{0} бөглөсөн — хараахан илгээгээгүй.', cellBy"),
    'FillNew: эзний нэр title-д алга — өнгө ганцаараа ХЭН гэдгийг хэлэхгүй');
  const CSS = read('src/modules/sheet/sheet.module.css');
  assert.ok(/td\.dirty\.byOther/.test(CSS),
    'sheet.module.css: .byOther дүрэм алга — класс тавигдаад л зурагдахгүй');
  /* ⚠️ `dirty`-гээс ТУСДАА биш, ХАМТ: илгээгээгүй гэдэг нь адилхан үлдэнэ,
     зөвхөн хүрээний өнгө солигдоно. Тусад нь бичвэл дараалал эвдэрч,
     `dirty`-гийн ногоон хүрээ бусдын нүдийг дардаг. */
  assert.ok(CSS.indexOf('td.dirty.byOther') > CSS.indexOf('.xl td.dirty,'),
    'sheet.module.css: .byOther нь .dirty-гээс ӨМНӨ — CSS дараалалаар дарагдана');
}
console.log('✅ бусдын нүд — хүснэгт дээр ялгарна, эзний нэр title-д');

/* ══════════ 14. ХҮН ТУС БҮРИЙН НҮДНИЙ ТОО ══════════ */
/**
 * Оролцогчийн зурвас нь ХЭН гэдгийг хэлдэг ч ХИЧНЭЭН гэдгийг хэлдэггүй
 * байв. «Б энд байна» ба «Б 340 нүд бөглөчихсөн» хоёр нь илгээхийн өмнөх
 * шийдвэрт огт өөр жинтэй.
 *
 * ⚠️ Өөрийн нүд `byMap`-д ОРООГҮЙ байж болно (алсад хараахан хүрээгүй) тул
 *    `mineRef`-ээс нэмэх ёстой — эс бөгөөс өөрийн тоо ҮРГЭЛЖ 0 харагдана.
 */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  const i = FN.indexOf('const byCount = useMemo(');
  assert.ok(i > 0, 'FillNew: byCount алга — оролцогчийн нүдний тоо харагдахгүй');
  const b = FN.slice(i, i + 700);
  assert.ok(b.includes('Object.keys(pending)'),
    'byCount: pending-ээс тоолохгүй байна — илгээгдсэн нүд ч тоологдоно');
  assert.ok(b.includes('mineRef.current.has(k)'),
    'byCount: mineRef тооцоогүй — өөрийн тоо үргэлж 0 харагдана');
}
console.log('✅ оролцогч бүрийн илгээгээгүй нүдний тоо');

/* ══════════ 11. TOMBSTONE ба АГШИН — буцаалт сэргэхгүй, идэвхгүйг хасна ══════════ */
/**
 * ⚠️ 2026-09-21-ний аудит. `mergeDrafts` нь ЗӨВХӨН НЭМДЭГ тул нүд буцаах /
 * нэмэлт мөр хасах нь нөгөө талын хуучин хуулбараас дараагийн тойрогт эргэж
 * СЭРГЭДЭГ байв. Одоо `del` (tombstone, агшинтай) ба `byAt` (нүд бүрийг сүүлд
 * хөндсөн агшин) хоёроор шийднэ. Мөн `waitingOn`-ийн «3 хоног идэвхгүйг
 * хасна» тайлбар урьд нь код БИШ байсан — одоо `byAt`/`done`-оор ажиллана.
 */
{
  const T = Date.now() - 60_000; /* ⚠️ одоогийн агшинд ойр — 7 хоногийн tombstone хугацаа */
  /* (а) Б-гийн хуучин хуулбарт нүд бий; А түүнийг ХОЖУУ буцаасан → нүд алга */
  const remoteOld = { t: T + 1000, cells: [['10:0', '5']], by: [['10:0', 'b']], byAt: [['10:0', T + 1000]] };
  const localDel = { t: T + 5000, cells: [], del: [['10:0', T + 4000]] };
  const m = mergeDrafts(remoteOld, localDel);
  assert.equal(new Map(m.cells).has('10:0'), false, 'буцаасан нүд нөгөө талын хуулбараас СЭРГЭЖ байна');
  assert.ok(!m.by || !new Map(m.by).has('10:0'), 'устсан нүдний эзэн сүнс болж үлдэв');
  assert.ok(m.del?.some(([k]) => k === '10:0'), 'tombstone нийлбэрт хадгалагдах ёстой (дараагийн хуучин хуулбарт)');
  /* Аргументын дараалал хамаарахгүй */
  assert.equal(new Map(mergeDrafts(localDel, remoteOld).cells).has('10:0'), false);

  /* (б) Буцаасны ДАРАА нөгөө тал дахин бичсэн (byAt > del) → нүд ялна, tombstone хаягдана */
  const rewritten = { t: T + 9000, cells: [['10:0', '7']], by: [['10:0', 'b']], byAt: [['10:0', T + 8000]] };
  const m2 = mergeDrafts(localDel, rewritten);
  assert.equal(new Map(m2.cells).get('10:0'), '7', 'буцаалтаас ХОЖУУ бичсэн нүд ялах ёстой');
  assert.ok(!m2.del || !m2.del.some(([k]) => k === '10:0'), 'давагдсан tombstone хаягдах ёстой');

  /* (в) Хассан нэмэлт мөр (`a:${oid}`) — болзолгүй хасагдана */
  const withAdd = { t: T + 1000, cells: [['-3:0', '1']], adds: [{ oid: -3, no: '9', work: 'X' }] };
  const dropped = { t: T + 2000, cells: [], del: [['a:-3', T + 2000], ['-3:0', T + 2000]] };
  const m3 = mergeDrafts(withAdd, dropped);
  assert.ok(!m3.adds || !m3.adds.some((a) => a.oid === -3), 'хассан нэмэлт мөр нийлүүлэлтээр сэргэж байна');
  assert.equal(new Map(m3.cells).has('-3:0'), false, 'хассан мөрийн нүд үлдэж байна');

  /* (г) `byAt` — түлхүүр бүрд ХАМГИЙН ИХ агшин */
  const a1 = { t: T + 100, cells: [['1:0', 'x']], byAt: [['1:0', T + 100]] };
  const a2 = { t: T + 200, cells: [['1:0', 'y']], byAt: [['1:0', T + 50]] };
  assert.equal(new Map(mergeDrafts(a1, a2).byAt).get('1:0'), T + 100, 'byAt нь max биш');

  /* (д) Хуучин ноорог (byAt/del байхгүй) — өмнөх зан хэвээр, юу ч хасагдахгүй */
  const o1 = { t: T + 1, cells: [['1:0', 'a']] };
  const o2 = { t: T + 2, cells: [['2:0', 'b']] };
  const m5 = mergeDrafts(o1, o2);
  assert.equal(m5.cells.length, 2);
  assert.equal(m5.byAt, undefined);
  assert.equal(m5.del, undefined);
}
console.log('✅ tombstone — буцаасан нүд/мөр сэргэхгүй · хожуу бичсэн нь ялна · хуучин ноорог хэвээр');

/* ── Эх кодын гэрээ (2026-09-21) ── */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(/byAt\?: \[string, number\]\[\];/.test(FN), 'Draft-д `byAt` алга');
  assert.ok(/del\?: \[string, number\]\[\];/.test(FN), 'Draft-д `del` (tombstone) алга');
  /* Ctrl+S оролцогчийн түгжээг тойрохгүй */
  const pi = FN.indexOf('const publish = useCallback(async () => {');
  const pb = FN.slice(pi, FN.indexOf('setBusy(true);', pi));
  assert.ok(pb.includes('if (!canSubmitNow)'), 'publish: Ctrl+S оролцогчийн түгжээг тойрч байна');
  /* flush: алсаас нийлүүлсэн бол lastMergedRef хөдлөхгүй — tick буулгана */
  assert.ok(FN.includes('if (live() && !remote && outDraft.t > lastMergedRef.current)'),
    'flush: нийлүүлсэн нүд дэлгэцэд буухгүй (lastMergedRef үргэлж урагшилж байна)');
  /* 2026-09-24: мөр нэмэх/хасах (`addRow`/`dropAdd`) энд БАЙХГҮЙ — Хуваарь руу шилжсэн */
  for (const gone of ['const dropAdd', 'const addRow', 'st.addBtn', 'st.dropBtn', 'st.addForm', 'localAddOids.has']) {
    assert.ok(!FN.includes(gone), `FillNew: мөр нэмэх UI-ийн үлдэгдэл «${gone}» хэвээр байна`);
  }
  /* Эзэмшил — обьём · хувь · paste · огноо ДӨРВҮҮЛЭЭ */
  assert.ok(FN.split('mineRef.current.add(').length - 1 >= 4,
    'эзэмшил бүртгэх зам 4-өөс цөөн (обьём · хувь · paste · огноо)');
  /* waitingOn идэвхгүйг ХАСНА */
  const wi = FN.indexOf('const waitingOn = useMemo(() => {');
  assert.ok(FN.slice(wi, wi + 1800).includes('LOCAL_DRAFT_TTL_MS'), 'waitingOn: идэвхгүй шүүлт код биш, тайлбар хэвээр');
  /* flow: өнөөдрийн мөргүй бол буцаагдсан (company) мөр */
  const fi = FN.indexOf('const flow = useMemo(() => {');
  assert.ok(FN.slice(fi, fi + 4200).includes("OWNER[r[HF.status]] === 'company'"), 'flow: өмнөх өдрийн буцаагдсан мөрийг сонгохгүй');
}
console.log('✅ эх кодын гэрээ (2026-09-21) — Ctrl+S түгжээ · flush буулгалт · мөр нэмэх UI байхгүй · эзэмшил ×4 · идэвхгүй шүүлт · flow');

/* ══════════ 15. ДАХИН АУДИТ (2026-09-21) — `a:` tombstone болзолтой · хоосон ангилал буудаг · мөрийн нүд хамт хасагдана ══════════ */
/**
 * ⚠️ Өмнөх tombstone засварын цоорхойнууд:
 *   #1 түр oid хуудас ачаалах бүрт −1-ээс эхэлдэг тул `a:-1` tombstone дараа
 *      нэмсэн (мөн −1) ШИНЭ мөрийг 7 хоног чимээгүй устгадаг байв → одоо
 *      мөрийн нэмсэн агшин (`byAt`-ийн `a:` түлхүүр) tombstone-оос ХОЖУУ бол
 *      мөр ялна; эхлэл нь цагаас (`nextTmpOid`).
 *   #2 `pickDraft` хоосон ангиллыг (`if (nCells) setPending`) тавьдаггүй тул
 *      нөгөө талын буцаалт энэ талд буудаггүй байв → болзолгүй `set`.
 *   #4 `a:` tombstone мөрийн `${oid}:*` нүд/огноо/эзэн/агшинг үлдээдэг байв.
 */
{
  const T = Date.now() - 60_000;
  /* #1 (а) Хассан агшнаас ӨМНӨ нэмсэн мөр (нэмсэн агшин бий) → хасагдана */
  const oldRow = { t: T + 1000, cells: [['-7:0', '3']], adds: [{ oid: -7, no: '1', work: 'A' }], byAt: [['a:-7', T + 500], ['-7:0', T + 900]] };
  const drop = { t: T + 2000, cells: [], del: [['a:-7', T + 1500]] };
  const m1 = mergeDrafts(oldRow, drop);
  assert.ok(!m1.adds || !m1.adds.some((a) => a.oid === -7), '#1: хассан агшнаас өмнө нэмсэн мөр сэргэж байна');
  assert.ok(m1.del?.some(([k]) => k === 'a:-7'), '#1: tombstone хадгалагдах ёстой');

  /* #1 (б) Хассан агшнаас ХОЖУУ нэмсэн (ижил дугаартай) шинэ мөр → ялна, tombstone хаягдана */
  const newRow = { t: T + 3000, cells: [['-7:0', '9']], adds: [{ oid: -7, no: '2', work: 'B' }], byAt: [['a:-7', T + 2500], ['-7:0', T + 2600]] };
  const m2 = mergeDrafts(drop, newRow);
  assert.ok(m2.adds?.some((a) => a.oid === -7 && a.work === 'B'), '#1: хассаны дараа нэмсэн шинэ мөр tombstone-д устаж байна');
  assert.equal(new Map(m2.cells).get('-7:0'), '9', '#1: шинэ мөрийн нүд алдагдав');
  assert.ok(!m2.del || !m2.del.some(([k]) => k === 'a:-7'), '#1: давагдсан `a:` tombstone хаягдах ёстой');
  /* Дарааллаас үл хамаарна */
  assert.ok(mergeDrafts(newRow, drop).adds?.some((a) => a.oid === -7));

  /* #1 (в) Нэмсэн агшин БАЙХГҮЙ (хуучин ноорог) → хасна (өмнөх зан) */
  const noAt = { t: T + 1000, cells: [], adds: [{ oid: -8, no: '1', work: 'A' }] };
  const drop8 = { t: T + 2000, cells: [], del: [['a:-8', T + 1500]] };
  assert.ok(!mergeDrafts(noAt, drop8).adds, '#1: агшингүй мөр tombstone-оор хасагдах ёстой');

  /* #1 (г) Мөр байхгүй бол tombstone хэвээр (хожуу ирэх хуучин хуулбарт) */
  const empty = { t: T + 100, cells: [] };
  assert.ok(mergeDrafts(empty, drop8).del?.some(([k]) => k === 'a:-8'), '#1: мөргүй үед tombstone алга болов');

  /* #4 Хассан мөрийн нүд · огноо · эзэн · агшин ХАМТ хасагдана */
  const rich = {
    t: T + 1000,
    cells: [['-9:0', '1'], ['-9:1', '2'], ['5:0', 'x']],
    dates: [['-9:0:s', '2026-01-01']],
    by: [['-9:0', 'a'], ['-9:1', 'a'], ['5:0', 'a']],
    byAt: [['a:-9', T + 500], ['-9:0', T + 600], ['-9:1', T + 600], ['5:0', T + 600]],
    adds: [{ oid: -9, no: '1', work: 'A' }],
  };
  const drop9 = { t: T + 2000, cells: [], del: [['a:-9', T + 1500]] };
  const m4 = mergeDrafts(rich, drop9);
  const c4 = new Map(m4.cells);
  assert.ok(!c4.has('-9:0') && !c4.has('-9:1'), '#4: хассан мөрийн нүд үлдэж байна');
  assert.equal(c4.get('5:0'), 'x', '#4: өөр мөрийн нүд хөндөгдөв');
  assert.ok(!m4.dates || !new Map(m4.dates).has('-9:0:s'), '#4: хассан мөрийн огноо үлдэж байна');
  assert.ok(!new Map(m4.by ?? []).has('-9:0'), '#4: хассан мөрийн эзэн үлдэж байна');
  const ba4 = new Map(m4.byAt ?? []);
  assert.ok(!ba4.has('-9:0') && !ba4.has('a:-9'), '#4: хассан мөрийн агшин үлдэж байна');
  assert.equal(ba4.get('5:0'), T + 600);

  /* #2 Нөгөө тал СҮҮЛЧИЙН нүдийг буцаасан → нийлбэр хоосон ирнэ; tombstone нь хадгалагдах ёстой */
  const lastCell = { t: T + 1000, cells: [['3:0', '5']], by: [['3:0', 'a']], byAt: [['3:0', T + 1000]] };
  const revoke = { t: T + 2000, cells: [], del: [['3:0', T + 1900]] };
  const m5 = mergeDrafts(lastCell, revoke);
  assert.equal(m5.cells.length, 0, '#2: буцаасан сүүлчийн нүд нийлбэрт үлдэж байна');
  assert.ok(m5.del?.some(([k]) => k === '3:0'), '#2: хоосон нийлбэрт tombstone алга');
}
console.log('✅ дахин аудит — `a:` tombstone нэмсэн агшинтай харьцуулна · мөрийн нүд хамт хасагдана · хоосон нийлбэрт tombstone үлдэнэ');

/* ── Эх кодын гэрээ (2026-09-21, дахин аудит) ── */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  /* #1 (2026-09-24-өөс): түр oid-ийн тоолуур, нэмсэн агшин `a:`, `adds` төлөв энэ хуудсанд
     БАЙХГҮЙ — мөр нэмэх «Хуваарь» руу шилжсэн; `mergeDrafts` хуучин ноорогийн
     `a:` tombstone/`sent` дүрмээ хэвээр хэрэглэнэ (дээрх нэгж шалгуурууд). */
  for (const gone of ['let tmpOid', 'nextTmpOid()', 'pushTmpOid(', 'touchMine(`a:', 'for (const a of adds) {', 'restoredAdds', 'setAdds(', 'keepApproved(', 'mergeIncomingAdds(', 'withAdds(']) {
    assert.ok(!FN.includes(gone), `#1: мөр нэмэх кодын үлдэгдэл «${gone}» хэвээр байна`);
  }
  /* pickDraft `a:` түлхүүрийг мөр сэргээхгүй тул хаяна */
  assert.ok(FN.includes("if (k0.startsWith('a:')) continue;"), '#1: pickDraft хуучин `a:` агшинг хаяхгүй байна');
  /* #2 pickDraft болзолгүй тавина; хоосон нийлбэр төлөвийг хоослоно; tombstone байвал алсыг цэвэрлэхгүй */
  assert.ok(!/if \(nCells\) setPending\(next\);/.test(FN), '#2: setPending болзолтой хэвээр');
  assert.ok(!/if \(nDates\) setPendDate\(nextDates\);/.test(FN), '#2: setPendDate болзолтой хэвээр');
  const ti = FN.indexOf('if (!total) {');
  const tb = FN.slice(ti, ti + 3200);
  /* ⚠️ 2026-10-01: `keepTyped({})` — сэргээлтийн завсарт гараас бичсэн нүдийг л үлдээж хоослоно */
  assert.ok((tb.includes('setPending({});') && tb.includes('setPendDate({});'))
    || (tb.includes('setPending(keepTyped({}));') && tb.includes('setPendDate(keepTyped({}));')), '#2: хоосон нийлбэр төлөвийг хоослохгүй байна');
  /* 2026-10-04: илгээлтийн баримт (`rcptRef`) ч tombstone-той адил — алсыг цэвэрлэхгүй */
  /* ⚠️ 2026-10-09: `pickDraft` үр дүнгээ (`PickRes`) буцаадаг болсон — `return res;` */
  assert.ok(/if \(delRef\.current\.size \|\| rcptRef\.current\.size\) return( res)?;/.test(tb), '#2: tombstone-той хоосон нийлбэр алсыг цэвэрлэж байна');
  assert.ok(FN.includes('const liveDel: [string, number][]'), '#2: хадгалах эффектийн хоосон зам tombstone-ийг бичихгүй байна');
  assert.ok(FN.includes('for (const [k, a] of d.del ?? []) if (Number.isFinite(a) && (delRef.current.get(k) ?? 0) < a) delRef.current.set(k, a);'),
    '#2: pickDraft нийлбэрийн del-ийг delRef-д авахгүй байна');
  /* #3 waitingOn өөрийн идэвхийг тооцно */
  const wi = FN.indexOf('const waitingOn = useMemo(() => {');
  assert.ok(FN.slice(wi, wi + 3000).includes('bump(meKey, Math.max(...mineAtRef.current.values()))'), '#3: өөрийн идэвх лавлагаанд ороогүй');
  /* #5 хожуу давхарлалт унавал дахин оролдоно */
  const li = FN.indexOf('const lateOverlayRef = useRef<number>(NaN);');
  const lb = FN.slice(li, li + 3500);
  assert.ok(lb.includes('setTimeout(() => setLateRetry((n) => n + 1), REMOTE_RETRY_MS)'), '#5: уншилт унавал дахин оролдохгүй');
  assert.ok(lb.includes('lateOverlayRef.current = NaN;'), '#5: унасан ч «дууссан» тэмдэглэгээ үлдэж байна');
  /* #7 ижил утга — pending-д байгаагүй бол tombstone үгүй */
  assert.ok(FN.includes('const revert = useCallback((key: string, wasPending: boolean) => {'), '#7: revert алга');
  /* ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ: обьём/хувь нэг зам (`incN === 0` → буцаалт) */
  /* ⚠️ 2026-10-06: шалгалт `commitInner`-д шилжсэн (`commit` нь зөвхөн амжилтад засварыг хаадаг бүрхүүл) */
  const ci = FN.indexOf('const commitInner = (r: SheetRow, b: number, raw: string): boolean => {');
  const cb = FN.slice(ci, ci + 6000);
  assert.ok(cb.includes('if (incN === 0) {') && cb.includes('revert(key, key in pending);'), '#7: обьём/хувь (нэмэлт 0 = буцаалт)');
  assert.ok(FN.includes('if (sameDate) revert(key, key in pendDate);'), '#7: огноо');
  /* 2026-09-30: нөгөө горимын хэсэг үлдэх үед (`keepStr`) буцаалт биш — бичилт (`otherPart`) */
  assert.ok(FN.includes('if (same && !x.keepStr) revert(x.key, x.key in pv);'), '#7: paste');
  /* #8 буцаагдсан өмнөх өдөр мэдэгдэнэ */
  assert.ok(FN.includes('const otherDaysReturned = useMemo(() => {'), '#8: otherDaysReturned алга');
  /* 2026-09-24: өдөр бүр `{day, soid}` — сонгож дахин илгээх товчтой */
  assert.ok(FN.includes("tr('Өмнөх өдрийн илгээлт хяналтаас БУЦААГДСАН ({0}) — засвар шаардлагатай.', otherDaysReturned.map((x) => x.day).join(', '))"), '#8: мэдэгдэл алга');
  assert.ok(FN.includes('const resumeReturned = useCallback(async (soid: number) => {'), '#8: буцаагдсан илгээлтийг сонгох зам алга (2026-09-24)');
  /* Илгээлт tombstone-ийг тэглэнэ — эс бөгөөс хоосон зам ноорог цэвэрлэхгүй */
  const pi = FN.indexOf('const nCells = Object.keys(pend2).length');
  /* 2026-10-04: цонх 700 → 2000 (баримтын тайлбар нэмэгдсэн); tombstone + БАРИМТ илгээх агшнаар */
  const pb = FN.slice(pi, pi + 2000);
  assert.ok(pb.includes('delRef.current = new Map();'), 'publish: delRef тэглэгдэхгүй — ноорог илгээсний дараа цэвэрлэгдэхгүй');
  assert.ok(pb.includes('const pubAt = stamp();') && pb.includes('rcptRef.current.set(k, [k, pubAt, v, sa || pubAt]);'), 'publish: илгээлтийн баримт логик цагаар тавигдахгүй байна (#4)');
}
console.log('✅ эх кодын гэрээ (дахин аудит) — мөр нэмэх код байхгүй · болзолгүй set · tombstone хадгалалт · waitingOn · хожуу давхарлалт · revert · буцаагдсан өдөр');

/* ══════════ 16. ИЛГЭЭСЭН НЭМЭЛТ МӨР (2026-09-24) — `sent` тэмдэг нийлүүлэлтээр сэргээхгүй ══════════ */
/**
 * ⚠️ `sendAjil` мөрийг `adds`-аас tombstone-гүй хасдаг байсан тул хоёр
 *    оролцогчийн ноорогт дараагийн нийлүүлэлт нөгөө талын хуучин `adds`-ыг
 *    буцаан нэгтгэж, илгээсэн мөр «батлуулаагүй» болж дахин гардаг байв.
 */
{
  const T = Date.now() - 60_000;
  const row = { oid: -5, no: '9.9', work: 'Шинэ', vol: 1, unit: 'м' };
  /* нөгөө тал: мөр нэмсэн (агшин T+1000), нүд бичсэн */
  const other = { t: T + 1000, cells: [['-5:0', '3']], adds: [row], byAt: [['a:-5', T + 1000], ['-5:0', T + 1000]] };
  /* би: илгээсэн (T+2000) — adds хоосон, sent тэмдэгтэй */
  const mine = { t: T + 2000, cells: [], sent: [[-5, T + 2000]] };
  const m = mergeDrafts(other, mine);
  assert.ok(!(m.adds ?? []).some((a) => a.oid === -5), 'илгээсэн мөр нийлүүлэлтээр сэргэж байна');
  assert.ok(!m.cells.some(([k]) => k === '-5:0'), 'илгээсэн мөрийн нүд үлдэж байна');
  assert.ok(m.sent?.some(([o]) => o === -5), 'sent тэмдэг нийлбэрт хадгалагдах ёстой');
  /* илгээснээс ХОЙШ дахин нэмсэн (ижил oid) — мөр ялна */
  const again = { t: T + 4000, cells: [], adds: [row], byAt: [['a:-5', T + 3000]] };
  const m2 = mergeDrafts(mine, again);
  assert.ok((m2.adds ?? []).some((a) => a.oid === -5), 'илгээснээс хойш нэмсэн мөр хасагдаж байна');
  /* батлагдсан (ajilOid) мөр хөндөгдөхгүй */
  const appr = { t: T + 1000, cells: [], adds: [{ ...row, ajilOid: 7 }], byAt: [['a:-5', T + 1000]] };
  const m3 = mergeDrafts(appr, mine);
  assert.ok((m3.adds ?? []).some((a) => a.oid === -5 && a.ajilOid === 7), 'батлагдсан мөр sent-ээр хасагдаж байна');
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(/sent\?: \[number, number\]\[\];/.test(FN), 'Draft-д `sent` алга');
  /* 2026-09-24: илгээх (`sendAjil`/`sentRef`) энэ хуудсанд БАЙХГҮЙ — Хуваарь руу шилжсэн;
     `Draft.sent`/`Draft.adds` хуучин ноорогийн талбар хэвээр (тэсвэртэй уншилт), payload `adds: []`. */
  for (const gone of ['sentRef.', 'sendAjil(', 'submitAjil(', 'withdrawAjil(', 'refreshAjil(', 'const canAjilSend', 'subscribeAjilAcl(', 'ajilScope(', 'loadAjilPending(', 'setDraftReadyKey']) {
    assert.ok(!FN.includes(gone), `FillNew: нэмэлт ажлын урсгалын үлдэгдэл «${gone}» хэвээр байна`);
  }
  assert.ok(/adds\?: NewRow\[\];/.test(FN), 'Draft-д `adds?: NewRow[]` алга (тэсвэртэй уншилт)');
  assert.ok(FN.includes('adds: [],'), 'publish payload `adds: []` биш байна');
  assert.ok(FN.includes('const addOids = new Set<number>((mergeBase?.adds ?? []).map((a) => a.oid));'), 'publish: өнчин сөрөг oid-ийн шалгуур зөвхөн mergeBase-ээс байх ёстой');
  /* Батлагдсан нэмэлт мөрийн УЛААН тэмдэглэгээ хэвээр */
  assert.ok(FN.includes('loadAjilAddedKeys(pkg.key)') && FN.includes('addedKeyOf(') && FN.includes('const isNew = r.oid < 0 || addedOids.has(r.oid);'), 'батлагдсан нэмэлт мөрийн улаан тэмдэглэгээ алга');
}
console.log('✅ sent — илгээсэн нэмэлт мөр нийлүүлэлтээр сэргэхгүй · хожуу нэмсэн нь ялна · батлагдсан хөндөгдөхгүй');


/* ══════════ 2026-10-04 АУДИТ — ДАВХАР ТООЛОЛТООС ХАМГААЛАХ (#1 · #3 · #4) ══════════
 * Нэмэлтийн горимд илгээсэн нүд ДАХИН орох = албан тайланд ДАВХАР тоолол. Гурван зам:
 *   #4 илгээлтийн уралдаан (Б илгээлтийн цонхонд засварласан) · #1 жааз солигдоход хуучин oid-той
 *   хуулбар · #3 хариу тасарсан илгээлт. Бүгд `Draft.rcpt` (илгээсэн утга `sv` · түүний агшин `sa`
 *   · илгээсэн агшин `a`) ба `rcptApply`-аар шийдэгдэнэ. */
import { rcptApply, rebaseSent } from './fill/draft.ts';
{
  const T = Date.now() - 60_000;
  const A = T + 100;               // илгээсэн агшин (логик цаг)
  const rc = ['10:0', A, '5', T + 10];
  /* А илгээсний дараах ноорог: хоосон + del + баримт */
  const sentDoc = { t: T + 101, mode: 'inc', cells: [], del: [['10:0', A]], rcpt: [rc] };
  const cell = (v, w, extra = {}) => ({ t: T + 50, mode: 'inc', cells: [['10:0', v]], byAt: [['10:0', w]], ...extra });

  /* (а) #4 — Б илгээлтийн ЦОНХОНД засварласан (sa < w < a): урьд нь del-ийн агшин = sa тул 8 БҮТНЭЭРЭЭ
         үлдэж 5 + 8 = 13 болдог байв; одоо ЗӨРҮҮ 3, анхааруулгатай (`conv`) */
  for (const m of [mergeDrafts(cell('8', T + 50), sentDoc), mergeDrafts(sentDoc, cell('8', T + 50))]) {
    assert.equal(new Map(m.cells).get('10:0'), '3', 'илгээлтийн цонхонд засварласан нүд ЗӨРҮҮ болох ёстой (8 − 5)');
    assert.ok((m.conv ?? []).some(([k]) => k === '10:0'), 'зөрүү болсныг анхааруулах тэмдэг алга');
  }
  /* (б) илгээлтийн ДАРАА (w > a) гэвч баримтыг ХАРААГҮЙ (bt алга) Б-гийн засвар — мөн ЗӨРҮҮ (давхар биш) */
  assert.equal(new Map(mergeDrafts(cell('8', T + 200), sentDoc).cells).get('10:0'), '3', 'баримт хараагүй хожуу засвар бүтнээрээ үлдэж байна — давхар тоолол');
  /* (в) илгээсэн хувилбар өөрөө ба түүний ӨВӨГ (w ≤ sa) — ХАСНА (өвгийг −2 болгохгүй) */
  assert.ok(!mergeDrafts(cell('5', T + 10), sentDoc).cells.length, 'илгээсэн хувилбар сэргэж байна');
  assert.ok(!mergeDrafts(cell('3', T + 5), sentDoc).cells.length, 'илгээснээс ӨМНӨХ хувилбар зөрүү болсон — хасагдах ёстой');
  /* (г) баримтыг ХАРСНЫ ДАРАА бичсэн шинэ нэмэлт (bt ≥ a) — ХӨНДӨХГҮЙ */
  assert.equal(new Map(mergeDrafts(cell('4', T + 300, { bt: [['10:0', A]] }), sentDoc).cells).get('10:0'), '4', 'шинэ нэмэлт хөрвүүлэгдэж байна');
  /* (д) ИДЕМПОТЕНТ — хөрвүүлсэн нийлбэрийг дахин нийлүүлэхэд 3 → −2 болохгүй */
  const once = mergeDrafts(cell('8', T + 50), sentDoc);
  const twice = mergeDrafts(once, { ...sentDoc, t: T + 400 });
  assert.equal(new Map(twice.cells).get('10:0'), '3', 'хөрвүүлэлт давтагдаж байна');
  assert.equal(new Map(mergeDrafts(cell('8', T + 50), twice).cells).get('10:0'), '3', 'хуучин хуулбар дахин ирэхэд давхар хөрвүүлж байна');
  /* (е) огноо — ҮНЭМЛЭХҮЙ: илгээснээс хойшх засвар хүчинтэй утга (хөрвүүлэхгүй, хасахгүй) */
  const dDoc = { t: T + 101, mode: 'inc', cells: [], dates: [], rcpt: [['10:0:s', A, '2026-01-01', T + 10]] };
  const dCopy = { t: T + 50, mode: 'inc', cells: [], dates: [['10:0:s', '2026-01-05']], byAt: [['10:0:s', T + 50]] };
  assert.equal(new Map(mergeDrafts(dCopy, dDoc).dates).get('10:0:s'), '2026-01-05');
  /* (ё) хуучин (`rcpt`-гүй) клиентийн ердийн `del` дүрэм баримттай түлхүүрт ДАВХАР хэрэгжихгүй */
  assert.equal(new Map(mergeDrafts(cell('8', T + 50), sentDoc).cells).get('10:0'), '3', 'del дүрэм баримтыг дарж нүдийг устгав');
  /* rcptApply — цэвэр дүрэм */
  assert.equal(rcptApply('8', T + 50, 0, rc, false), '3');
  assert.equal(rcptApply('%15', T + 50, 0, ['k', A, '%10', T + 10], false), '%5');
  assert.equal(rcptApply('=55', T + 50, 0, rc, false), '=55', 'хуучин НИЙТ (=) — суурьтай жишигдэх тул хэвээр');
}
console.log('✅ #4 илгээлтийн баримт — уралдааны засвар ЗӨРҮҮ, өвөг хасагдана, шинэ нэмэлт хөндөгдөхгүй, идемпотент');

/* ── #1 — ЖААЗ СОЛИГДОХОД ХУУЧИН oid-той хуулбар ДАВХАР сэргэхгүй ── */
{
  const T = Date.now() - 60_000;
  /* өөр төхөөрөмж/алсад ХУУЧИН жаазны түлхүүрээр (103) үлдсэн хуулбар */
  const oldCopy = { t: T + 10, mode: 'inc', cells: [['103:0', '5']], byAt: [['103:0', T + 10]], rowKeys: [[103, '1 ¦ Шороо']], rowOcc: [[103, 0, 2]] };
  /* `pickDraft` 103 → 203 зөөж, хуучин түлхүүрт логик цагийн tombstone тавьсан */
  const moved = { t: T + 30, mode: 'inc', cells: [['203:0', '5']], byAt: [['203:0', T + 10]], del: [['103:0', T + 20]], rowKeys: [[203, '1 ¦ Шороо']], rowOcc: [[203, 0, 2]] };
  for (const m of [mergeDrafts(oldCopy, moved), mergeDrafts(moved, oldCopy)]) {
    const c = new Map(m.cells);
    assert.ok(!c.has('103:0'), 'хуучин oid-той хуулбар нийлүүлэлтэд ҮЛДЭЖ байна — дахин зөөгдөж давхар тоологдоно');
    assert.equal(c.get('203:0'), '5');
    assert.deepEqual(m.rowKeys.map(([o]) => o), [203], 'нүдгүй болсон хуучин танигч хаягдах ёстой');
  }
  /* хуучин жааз дээр tombstone-оос ХОЖУУ бичсэн хуулбар ялна (дахин зөөгдөнө — алдагдахгүй) */
  assert.ok(new Map(mergeDrafts({ ...oldCopy, byAt: [['103:0', T + 25]] }, moved).cells).has('103:0'), 'хожуу бичсэн хуучин жаазны хуулбар устав');
  /* илгээсний дараа: шинэ ба ХУУЧИН түлхүүрийн баримт — 3 хоногийн локал хуулбар (103) ч сэргэхгүй */
  const A = T + 100;
  const afterSend = { t: T + 101, mode: 'inc', cells: [], del: [['203:0', A], ['103:0', A]], rcpt: [['203:0', A, '5', T + 10], ['103:0', A, '5', T + 10]] };
  assert.ok(!mergeDrafts(oldCopy, afterSend).cells.length, 'илгээсэн мөрийн хуучин oid-той хуулбар сэргэж байна');
}
console.log('✅ #1 жааз солигдсон — хуучин түлхүүрт tombstone/баримт, танигч цэвэрлэгдэнэ');

/* ── #3 — ХАРИУ ТАСАРСАН илгээлт сервер дээр буусан бол ноорогоос ХАСНА (өөрчлөгдсөн нь ЗӨРҮҮ) ── */
{
  const cur = { '1:0': '5', '2:0': '8', '3:0': '2', '4:0:s': '2026-01-02' };
  const r = rebaseSent(cur, [['1:0', '5'], ['2:0', '5'], ['4:0:s', '2026-01-01'], ['9:0', '7']]);
  assert.deepEqual(r.next, { '2:0': '3', '3:0': '2', '4:0:s': '2026-01-02' }, 'илгээсэн нүд хасагдаж, засагдсан нь зөрүү болох ёстой');
  assert.deepEqual(r.conv, ['2:0']);
  assert.deepEqual(cur['1:0'], '5', 'оролт өөрчлөгдөх ёсгүй');
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes("(s2.payload.nonces ?? []).includes(inf.nonce)"), 'publish: өмнөх оролдлогын nonce-ийг шалгахгүй байна');
  assert.ok(FN.includes('nonces: [nonce],'), 'publish: payload-д nonce алга');
  assert.ok(FN.includes("setNavDirty('fillnew-send', true"), 'publish: илгээлт явж байхад гарахыг асуухгүй');
  assert.ok(FN.indexOf('saveInflight(pkg.key,') < FN.indexOf('sv = await saveSubmission(pkg.key, payload, expectAt);'), 'тэмдэг хадгалалтаас ӨМНӨ бичигдэх ёстой');
}
console.log('✅ #3 хариу тасарсан илгээлт — nonce-оор таньж, ноорогоос хасна (давхар илгээхгүй)');

/* ══════════ 2026-10-04 ДАХИН АУДИТ — #2 хэмжээ · #3 хуучин локал · #4 хүн бүрийн зорилт · #6 ижил утга · #7 тэмдэглэсэн ══════════ */
import { packRcpt, unpackRcpt, compactDraft, holdStaleLocal, parseDraft, readDraft, rcptSilentDrop } from './fill/draft.ts';
/* ── #2 — 1,500 нүдний илгээлтийн дараах ноорог REMOTE_MAX-д багтана (урьд нь баримт + del, жааз солигдсон бол ×2) ── */
{
  const REMOTE_MAX = Number((readSrc('src/lib/draftRemote.ts').match(/export const REMOTE_MAX = ([0-9_]+);/) ?? [])[1]?.replace(/_/g, ''));
  assert.equal(REMOTE_MAX, 80_000);
  const T = Date.now() - 60_000;
  const A = T + 100;
  const flat = [];
  const del = [];
  for (let i = 0; i < 300; i += 1) {
    for (let b = 0; b < 5; b += 1) {
      const v = `${10 + ((i * 7 + b) % 90)}.5`;
      const sa = A - 1 - (i * 1000 + b);
      /* жааз солигдсон: хуудасны (100000+) ба шинэ (200000+) түлхүүр хоёулаа */
      for (const o of [100000 + i, 200000 + i]) { flat.push([`${o}:${b}`, A, v, sa]); del.push([`${o}:${b}`, A]); }
    }
  }
  const tomb = { t: A + 1, mode: 'inc', cells: [], dates: [], rowKeys: [], del, rcpt: flat, marks: [] };
  const naive = JSON.stringify(tomb).length;
  assert.ok(naive > REMOTE_MAX, `хуучин хэлбэр (${naive}) REMOTE_MAX-аас хэтэрдэг байсан — тест хүчинтэй`);
  const c = compactDraft(tomb, { max: REMOTE_MAX, minOid: 200000, now: A + 10 });
  const size = JSON.stringify(c).length;
  assert.ok(size < REMOTE_MAX * 0.55, `1,500 нүдний илгээлтийн дараах ноорог ${size} тэмдэгт — REMOTE_MAX-аас хол бага байх ёстой`);
  /* АЛДАГДАЛГҮЙ — 3,000 баримт бүгд буцаж задарна */
  const back = new Map(unpackRcpt(c.rcpt).map((r) => [r[0], r]));
  assert.equal(back.size, 3000, 'шахалтад баримт алдагдав');
  assert.deepEqual(back.get('100007:3'), flat.find((r) => r[0] === '100007:3'));
  assert.deepEqual(back.get('200007:3'), flat.find((r) => r[0] === '200007:3'), 'нэрлэлт (alias) түлхүүр алдагдав');
  /* баримтаар дарагдсан del том үед хаягдана — баримт өөрөө tombstone болж ажиллана */
  assert.ok((c.del ?? []).length < 300, 'том илгээлтийн дараа давхар del (3,000) хаягдах ёстой — зөвхөн зай байгаа хэрээр (REMOTE_MAX-ын тал) шилжилтэд үлдэнэ');
  const r7 = back.get('100007:3');
  const stale = { t: T + 50, mode: 'inc', cells: [['100007:3', r7[2]]], byAt: [['100007:3', r7[3]]] };
  assert.ok(!mergeDrafts(stale, c).cells.length, 'del-гүй ч баримт илгээсэн хуулбарыг хасах ёстой (давхар тоолохгүй)');
  /* жижиг илгээлт — хуучин клиентийн шилжилтийн del үлдэнэ */
  const small = compactDraft({ ...tomb, del: del.slice(0, 20), rcpt: flat.slice(0, 20) }, { max: REMOTE_MAX, now: A + 10 });
  assert.equal((small.del ?? []).length, 20, 'зай байхад хуучин клиентийн del үлдэх ёстой');
  /* хуучин жаазны баримт 1 хоногийн дараа хаягдана, шинэ жаазных үлдэнэ */
  const later = unpackRcpt(compactDraft(tomb, { max: REMOTE_MAX, minOid: 200000, now: A + 25 * 3600 * 1000 }).rcpt);
  assert.ok(later.length === 1500 && later.every((r) => Number(r[0].split(':')[0]) >= 200000), 'хуучин жаазны баримт хуучирсангүй');
  /* хавтгай (хуучин) ба шахсан хэлбэр хоёулаа уншигдана, нийлүүлэлт шахсан хэлбэр гаргана */
  assert.equal(unpackRcpt(parseDraft(JSON.stringify(c), 'remote').rcpt).length, 3000);
  assert.equal(unpackRcpt(packRcpt(flat)).length, 3000);
  assert.ok(typeof mergeDrafts(stale, c).rcpt[0][0] === 'number', 'нийлүүлэлт шахсан хэлбэрээр бичих ёстой');
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes('compactDraft(mergeDrafts(remote, q.draft) ?? q.draft'), 'flush алсад бичихийн өмнө шахахгүй байна');
}
console.log('✅ #2 шахалт — 1,500 нүдний илгээлт REMOTE_MAX-д багтана, алдагдалгүй, del нь баримтаар орлогдоно');

/* ── #3 — 7 хоногоос хуучин, алсад хуулагдаагүй локал нүд автоматаар СЭРГЭХГҮЙ (баримт хуучирсан байж болно) ── */
{
  const now = Date.now();
  const day = 86_400_000;
  const old = { t: now - 9 * day, mode: 'inc', cells: [['5:0', '3'], ['6:0', '2']], byAt: [['5:0', now - 9 * day], ['6:0', now - 2 * day]] };
  const h = holdStaleLocal(old, now);
  assert.deepEqual(h.hold.map(([k, , f]) => [k, f]), [['5:0', 1]], '7 хоногоос хуучин нүд л АЛБАДАН тэмдэглэгдэнэ');
  const m = mergeDrafts(h, { t: now, mode: 'inc', cells: [] });
  assert.ok(m.hold.some(([k, , f]) => k === '5:0' && f === 1), 'тэмдэг нийлүүлэлтэд хадгалагдах ёстой (бусад клиент ч сэргээхгүй)');
  const edited = mergeDrafts(h, { t: now + 1, mode: 'inc', cells: [['5:0', '4']], byAt: [['5:0', now + 1]] });
  assert.ok(!(edited.hold ?? []).some(([k]) => k === '5:0'), 'тэмдэглэснээс хойшх шинэ засвар тэмдгийг арилгах ёстой');
  /* readDraft: 3 хоногоос хуучин локал зөвхөн «хуулагдаагүй» үед уншигдана — тэгэхдээ тэмдэглэгдэнэ */
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  store.set('selbe-fillnew-draft:pk', JSON.stringify(old));
  assert.equal(readDraft('pk'), null, '«хуулагдаагүй» тэмдэггүй хуучин локал хаягдана (хуучин зан)');
  store.set('selbe-fillnew-draft:pk', JSON.stringify(old));
  store.set('selbe-fillnew-unsynced:pk', String(old.t));
  const rd = readDraft('pk');
  assert.ok(rd && rd.hold.some(([k, , f]) => k === '5:0' && f === 1), 'чөлөөлөгдсөн хуучин локалын 9 хоногийн нүд тэмдэглэгдэх ёстой');
  assert.ok(!rd.hold.some(([k]) => k === '6:0'), '2 хоногийн нүд тэмдэглэгдэх ёсгүй');
  delete globalThis.localStorage;
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes("if (forced(key0)) { holdIt(key0, vRaw, 'old'); continue; }"), 'pickDraft албадан тэмдэгтэй нүдийг сэргээж байна');
}
console.log('✅ #3 хуучин «хуулагдаагүй» локал — 7 хоногоос хуучин нүд тэмдэглэгдэж, автоматаар сэргэхгүй');

/* ── #4 — буцаагдсан тойргийн зорилт ХҮН ТУС БҮРЭЭР: нэг хүнийх бусдын «Илгээх»-ийг түгжихгүй ── */
{
  const a = { t: 100, mode: 'inc', cells: [], tgt: [['a', 55, 1000, 10]] };
  const b = { t: 200, mode: 'inc', cells: [], tgt: [['b', 0, 0, 20]] };
  const m = mergeDrafts(a, b);
  assert.deepEqual(new Map(m.tgt.map((e) => [e[0], e[1]])), new Map([['a', 55], ['b', 0]]), 'шинэ тал нөгөө хүний зорилтыг дарж болохгүй');
  /* нэг хүнийх — ноорогийн t биш, бичлэгийн агшин их нь ялна */
  const m2 = mergeDrafts({ t: 300, mode: 'inc', cells: [], tgt: [['a', 0, 0, 5]] }, a);
  assert.equal(m2.tgt.find((e) => e[0] === 'a')[1], 55);
  /* хуучин ганц `[oid, fillMs]` хэлбэр хаягдана (хэнийх нь тодорхойгүй) */
  assert.deepEqual(parseDraft(JSON.stringify({ t: 1, mode: 'inc', cells: [], tgt: [55, 1000] }), 'remote').tgt, []);
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes('const mine = meNow ? tgtsRef.current.get(meNow) : undefined;'), 'түгжээ ӨӨРИЙН бичлэгээс биш');
  assert.ok(FN.includes('tgtsRef.current.set(me, [me, want[0], want[1], stamp()]);'), 'хадгалалт зөвхөн өөрийн зорилтыг бичих ёстой');
  assert.ok(!/const tgtW = draftTgtRef\.current \?\? curTgt/.test(FN), 'хуучин «хадгалалт бүрд ганц зорилт» зам буцаж орсон');
}
console.log('✅ #4 зорилт хүн тус бүрээр — нэг хүний буцаагдсан тойрог бусдыг түгжихгүй');

/* ── #6 — илгээсэн утгатай ИЖИЛ, баримт хараагүй хожуу бичилт хасагдана, гэвч ИЛ анхааруулна ── */
{
  const T = Date.now() - 60_000;
  const A = T + 100;
  const rc = ['10:0', A, '5', T + 10];
  assert.ok(rcptSilentDrop('5', T + 50, 0, rc));
  assert.ok(!rcptSilentDrop('5', T + 5, 0, rc), 'илгээсэн хувилбар/өвөг — анхааруулахгүй');
  assert.ok(!rcptSilentDrop('5', T + 50, A, rc), 'баримт харсан бичилт — хамаарахгүй');
  assert.ok(!rcptSilentDrop('8', T + 50, 0, rc), 'өөр утга — зөрүү (тусдаа зам)');
  const m = mergeDrafts({ t: T + 50, mode: 'inc', cells: [['10:0', '5']], byAt: [['10:0', T + 50]] }, { t: T + 101, mode: 'inc', cells: [], rcpt: [rc] });
  assert.ok(!m.cells.length, 'ижил утга — зөрүү 0 тул хасагдана (дүрэм хэвээр)');
  assert.ok((m.conv ?? []).some(([k, a]) => k === '10:0' && a === A), 'ИЛ анхааруулах тэмдэг (conv) алга — чимээгүй хасагдаж байна');
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  assert.ok(FN.includes('if (rc && rcptSilentDrop(v, w, bt0, rc)) rcDrop.push('), 'pickDraft (зөөсөн түлхүүр) ижил утгын хасалтыг анхааруулахгүй байна');
}
console.log('✅ #6 ижил утгын хасалт — дүрэм хэвээр, ил анхааруулна');

/* ── #7 — тэмдэглэсэн нүд хугацаатай, ноорогт ТОГТВОРТОЙ, зөвхөн тэднийг хаях товчтой ── */
{
  const FN = readSrc('src/modules/sheet/FillNew.tsx');
  /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ('tgt') нүд л хугацаагүй */
  assert.ok(FN.includes("if (why !== 'tgt' && holdNow - since > DEL_TTL_MS) { heldExpired.push(k); return; }"), 'тэмдэглэсэн нүд хугацаагүй');
  assert.ok(FN.includes('const dropHeld = useCallback(() => {') && FN.includes('onClick={dropHeld}'), '«Тэмдэглэсэн нүдийг хаях» товч алга');
  assert.ok(FN.includes('&& !heldRef.current.size'), 'тэмдэглэсэн нүд хадгалах эффектэд агуулга гэж тооцогдохгүй байна');
  /* нийлүүлэлт: нүд алга бол тэмдэг арилна */
  const m = mergeDrafts({ t: 1, mode: 'inc', cells: [['1:0', '2']], hold: [['1:0', 5, 0], ['9:0', 5, 0]] }, { t: 2, mode: 'inc', cells: [] });
  assert.deepEqual(m.hold.map(([k]) => k), ['1:0'], 'нүдгүй тэмдэг үлдэх ёсгүй');
}
console.log('✅ #7 тэмдэглэсэн нүд — хугацаатай · ноорогт бичигдэнэ · хаях товч');

/* ══════════ 2026-10-09 — ХОЁР ХҮН НЭГ БАГЦЫГ ЗЭРЭГ БӨГЛӨХ (хоёр клиентийн симуляц, ЖИНХЭНЭ `mergeDrafts`) ══════════
 * А ба Б нэг алсын ноорогтой (`remote`); клиент бүр локал ноорог + мэдэх баримт (`rcptRef`) + сүүлд хөндсөн агшинтай.
 * Татах мөчлөг = `mergeDrafts(локал, алс)`. LWW дүрэм ӨӨРЧЛӨГДӨӨГҮЙ — шинэ туслахууд зөвхөн таньж ил хэлнэ. */
import { newReceipts, claimMine, editStamp, lostMine } from './fill/draft.ts';
{
  const T = Date.now() - 60_000;
  const X = '100:0';
  const Y = '101:0';
  /* ── Fix 1: А илгээсэн баримт Б-гийн татах мөчлөгт ШИНЭ гэж танигдана (нэг удаа) ── */
  {
    /* Б-гийн дэлгэц: А-гийн X=5 (татсан) + өөрийн Y=7 */
    const bLocal = { t: T + 40, mode: 'inc', cells: [[X, '5'], [Y, '7']], by: [[X, 'a'], [Y, 'b']], byAt: [[X, T + 10], [Y, T + 40]] };
    const bKnown = new Map();
    /* А бүгдийг (X ба Б-гийн Y) илгээв — tombstone + баримт */
    const pubAt = T + 50;
    const aTomb = { t: pubAt, mode: 'inc', cells: [], del: [[X, pubAt], [Y, pubAt]], rcpt: [[X, pubAt, '5', T + 10], [Y, pubAt, '7', T + 40]] };
    const remote = mergeDrafts(bLocal, aTomb);
    const merged = mergeDrafts(bLocal, remote);
    assert.equal(merged.cells.length, 0, 'илгээгдсэн нүд Б-гийн ноорогт үлдсэн — давхар тоологдоно');
    const fresh = newReceipts(bKnown, merged);
    assert.equal(fresh.length, 2, 'Б шинэ баримтыг танихгүй — staged/давхарлалт дахин уншигдахгүй (тоо хуучин нийт рүү үсэрнэ)');
    for (const r of fresh) bKnown.set(r[0], r);
    assert.equal(newReceipts(bKnown, mergeDrafts(merged, remote)).length, 0, 'ижил баримт дахин «шинэ» болж байна — мэдэгдэл давтагдана');
    /* Б баримтыг харсны ДАРАА шинээр бичсэн нэмэлт — хасагдахгүй (bt ≥ a), шинэ баримт биш */
    const bNext = { t: T + 90, mode: 'inc', cells: [[Y, '3']], by: [[Y, 'b']], byAt: [[Y, T + 90]], bt: [[Y, pubAt]] };
    const m2 = mergeDrafts(merged, bNext);
    assert.deepEqual(m2.cells, [[Y, '3']], 'баримтыг харсны дараах шинэ нэмэлт хасагдсан');
    assert.equal(newReceipts(bKnown, m2).length, 0);
  }
  /* ── Fix 4: эзэмшил — өөр хүн ХОЖУУ дарж бичсэн нүдийг «минийх» гэж тамгалахгүй ── */
  {
    const bLocal = { t: T + 10, mode: 'inc', cells: [[X, '5']], by: [[X, 'b']], byAt: [[X, T + 10]] };
    const aLater = { t: T + 20, mode: 'inc', cells: [[X, '8']], by: [[X, 'a']], byAt: [[X, T + 20]] };
    const m = mergeDrafts(bLocal, aLater);
    const at = new Map(m.byAt).get(X);
    const by = new Map(m.by).get(X);
    assert.equal(by, 'a');
    assert.equal(claimMine(T + 10, at, by, 'b'), false, 'А-гийн хожуу бичилтийг Б «минийх» гэж тамгалж байна — тайлбар/waitingOn худал');
    assert.equal(claimMine(T + 30, at, by, 'b'), true, 'Б дахин (хожуу) бичсэн бол минийх');
    assert.equal(claimMine(T + 10, at, 'b', 'b'), true, 'өөрийн өөр төхөөрөмж');
    assert.equal(claimMine(T + 10, undefined, undefined, 'b'), true, 'агшингүй (хуучин) ноорог — урьдын адил');
  }
  /* ── Fix 5: өөрийн нүдийг өөр хүн өөрчилсөн/буцаасныг таньна; илгээлт (баримт) — тусдаа ── */
  {
    const base = { me: 'b', mineAt: T + 10, rcptA: undefined, del: undefined };
    assert.equal(lostMine({ ...base, prev: '5', next: '8', at: T + 20, by: 'a' }), 'over');
    assert.equal(lostMine({ ...base, prev: '5', next: '5', at: T + 20, by: 'a' }), null, 'утга ижил — хэлэх зүйлгүй');
    assert.equal(lostMine({ ...base, prev: '5', next: '8', at: T + 5, by: 'a' }), null, 'миний бичилт хожуу');
    /* А буцаасан (tombstone) — жинхэнэ нийлүүлэлтээр */
    const bLocal = { t: T + 10, mode: 'inc', cells: [[X, '5']], by: [[X, 'b']], byAt: [[X, T + 10]] };
    const aDel = { t: T + 30, mode: 'inc', cells: [], del: [[X, T + 30]] };
    const m = mergeDrafts(bLocal, aDel);
    assert.equal(m.cells.length, 0);
    assert.equal(lostMine({ ...base, prev: '5', next: undefined, at: undefined, by: undefined, del: new Map(m.del).get(X) }), 'del');
    /* Өөрийн буцаалт (mineAt = өөрийн del) — хэлэхгүй */
    assert.equal(lostMine({ ...base, mineAt: T + 30, prev: '5', next: undefined, at: undefined, by: undefined, del: T + 30 }), null);
    /* Илгээлт (баримт ≥ del) — «{0} илгээв» замаар, энд биш */
    assert.equal(lostMine({ ...base, prev: '5', next: undefined, at: undefined, by: undefined, del: T + 30, rcptA: T + 30 }), null);
  }
  /* ── Fix 6: HLC — А-гийн (цаг нь түрүүлсэн) tombstone-ийг ХАРСАН Б дахин бичвэл Б ялна ── */
  {
    const aClear = { t: T + 1000, mode: 'inc', cells: [], del: [[X, T + 1000]] };
    /* Б-гийн цаг хоцорсон: локал цаг T+995 */
    const naive = { t: T + 995, mode: 'inc', cells: [[X, '8']], by: [[X, 'b']], byAt: [[X, T + 995]] };
    assert.equal(mergeDrafts(naive, aClear).cells.length, 0, '(хяналт) HLC-гүй бол Б-гийн шинэ бичилт хасагддаг');
    const st = editStamp(T + 995, T + 1000);
    assert.ok(st > T + 1000, 'editStamp харсан агшнаас хожуу биш');
    const hlc = { ...naive, t: st, byAt: [[X, st]] };
    assert.deepEqual(mergeDrafts(hlc, aClear).cells, [[X, '8']], 'HLC: Б-гийн шинэ бичилт А-гийн хуучин tombstone-д ялагдсан');
    assert.deepEqual(mergeDrafts(aClear, hlc).cells, [[X, '8']], 'дараалал хамаарахгүй');
    assert.equal(editStamp(T + 2000, T + 1000), T + 2000, 'локал цаг түрүүлсэн бол хэвээр');
    assert.equal(editStamp(T + 5, undefined), T + 5);
  }
  /* ── Эх кодын гэрээ: publish эхэнд алсыг уншина · татах мөчлөг `poll` · `touchMine` HLC · сэргээлтийн мэдэгдэл салаа ── */
  {
    const FN = readSrc('src/modules/sheet/FillNew.tsx');
    const pb = FN.slice(FN.indexOf('const publish = useCallback'));
    assert.ok(pb.indexOf('await pullNow(pkg.key)') > 0 && pb.indexOf('await pullNow(pkg.key)') < pb.indexOf('await loadRows(pkg, sc)'),
      'publish: алсын ноорогийг илгээхийн өмнө дахин уншихгүй байна (fix 2)');
    assert.ok(FN.includes("pickDraftRef.current(merged, 'remote', { poll: true })"), 'татах мөчлөг `poll` тэмдэггүй — «Ноорог сэргээв» давтагдана (fix 3)');
    assert.ok(FN.includes('mineAtRef.current.set(key, stampKey(key));'), 'touchMine HLC-гүй (fix 6)');
    assert.ok(FN.includes('if (!claimMine(mineAt, at, u, meNow)) continue;'), 'pickDraft эзэмшлийг агшингүй тамгалж байна (fix 4)');
    assert.ok(FN.includes('cbRef.current.onReceipts?.('), 'шинэ баримт FillNew-д мэдэгдэхгүй (fix 1)');
    assert.ok(FN.includes('useSyncRef(refreshStagedRef,'), 'FillNew шинэ баримтаар илгээлтийг дахин уншихгүй (fix 1)');
    assert.ok(!/if \(!warns\.length\) say\(dropped/.test(FN), '«Ноорог сэргээв» `say`-аар (давтагдаж чухал мэдэгдлийг дарна) (fix 3)');
  }
}
console.log('✅ 2026-10-09 хоёр клиент — шинэ баримт · эзэмшил · өөрийн нүд өөрчлөгдсөн · HLC · эх кодын гэрээ');

/* ══════════ 2026-10-09 (аудит №3, HIGH) — БУЦААГДСАН ИЛГЭЭЛТИЙН ЗАСВАРТ ЗӨВХӨН ТЭР ИЛГЭЭЛТИЙН НҮД (`offTarget`) ══════════
 * Хориг идэвхтэй үед D2-ыг сонгоход өнөөдрийн (зорилтгүй) эсвэл хамтран бөглөгчийн нүд тэр засварт нийлж, D2-ын
 * `fillMs`-ээр илгээгддэг байв. Нүдний эзний зорилт (`Draft.tgt`) одоогийн засвартай таарахгүй бол ГАДУУРХ. */
import { offTarget } from './fill/draft.ts';
{
  const D2 = 501;
  const D3 = 777;
  const tg = new Map([
    ['b', ['b', 0, 0, 10]],          // Б — зорилтоо цэвэрлэсэн (өнөөдөр)
    ['c', ['c', D2, 1000, 20]],      // В — D2-ын засвар
    ['d', ['d', D3, 2000, 30]],      // Г — өөр өдрийн засвар
  ]);
  /* өнөөдрийн шинэ бөглөлт (зорилт 0) — шүүлтгүй */
  assert.equal(offTarget(0, 'b', 'a', tg), false);
  assert.equal(offTarget(0, 'd', 'a', tg), false);
  assert.equal(offTarget(0, undefined, 'a', tg), false);
  /* D2-ын засвар: Б (өнөөдөр) · Г (D3) · эзэнгүй — ГАДУУРХ; В (D2) — дотор */
  assert.equal(offTarget(D2, 'b', 'a', tg), true, 'өнөөдрийн (зорилт цэвэрлэсэн) хамтран бөглөгчийн нүд засварт нийлж байна');
  assert.equal(offTarget(D2, 'd', 'a', tg), true, 'өөр өдрийн засварын нүд D2-т нийлж байна');
  assert.equal(offTarget(D2, undefined, 'a', tg), true, 'эзэнгүй (хуучин) нүд засварт нийлж байна');
  assert.equal(offTarget(D2, 'x', 'a', tg), true, 'зорилтгүй хамтран бөглөгчийн нүд засварт нийлж байна');
  assert.equal(offTarget(D2, 'c', 'a', tg), false, 'тэр засварын нүд хойшлогдож байна');
  /* өөрийн нүд: зорилтгүй бол хадгалах эффектийн `want` (одоогийн) — дотор; өөр зорилттой бол гадуур */
  assert.equal(offTarget(D2, 'a', 'a', tg), false, 'өөрийн шинэ нүд засварт орохгүй байна');
  assert.equal(offTarget(D2, 'd', 'd', tg), true, 'өөрийн өөр өдрийн засвар D2-т нийлж байна');
}
console.log('✅ аудит №3 — буцаалтын засварт зөвхөн тэр илгээлтийн нүд (зорилтгүй · өөр өдөр · эзэнгүй — гадуур)');

/* ══════════ 2026-10-09 (аудит №6) — СЕРВЕРИЙН ИЛГЭЭЛТЭЭС ГАРГАСАН БАРИМТ (`subReceipts`): ил хасалт · харсан агшин ══════════
 * Баримт `[k, at, '', at]` нь илгээлтээс ӨМНӨХ хуулбарыг зөрүү бодолгүй хасдаг — урьд нь ⚠️ «ил, засагдана» гэдэг ч
 * код ЧИМЭЭГҮЙ байв; мөн `at` өөр машины цаг тул энэ табын дараагийн засвар `w ≤ at` болж дахин хасагдах эрсдэлтэй. */
/* (`useDraftSync.ts`-ийг import хийх боломжгүй — `./util` → `sheet.module.css`; `subReceipts`-ийн гаргадаг баримтын
   хэлбэрийг (`[k, at, '', at]`) `rcptApply`-аар, кодыг эх кодын гэрээгээр шалгана.) */
{
  const AT = Date.now() - 1000;
  const sub = ['1:0', AT, '', AT];
  assert.equal(rcptApply('8', AT - 1, 0, sub, false), null, 'илгээлтээс өмнөх хуулбар хасагдах ёстой');
  assert.equal(rcptApply('8', AT + 1, 0, sub, false), '8', 'илгээлтээс хойших хуулбар хэвээр (зөрүү бодохгүй)');
  assert.equal(rcptApply('8', AT - 1, AT, sub, false), '8', 'баримтыг харсан (`bt ≥ a`) хуулбар хөндөгдөхгүй');
  /* Эх кодын гэрээ */
  const DS = readOne('src/modules/sheet/fill/useDraftSync.ts');
  assert.ok(/out\.push\(\[k, p\.at, '', p\.at\]\);/.test(DS) && DS.includes('if (c && c[1] >= p.at) continue;'), 'subReceipts: баримтын хэлбэр / жинхэнэ хожуу баримтыг дарахгүй дүрэм өөрчлөгдөв');
  assert.ok(DS.includes("if (rc && rc[2] === '') rcSub.push("), 'серверийн баримтаар хасагдсан нүд тусад нь тоологдохгүй');
  assert.ok(/for \(const id of rcSub\) if \(!seen\(id\)\) nSub \+= 1;/.test(DS) && DS.includes('if (nSub) {'), 'серверийн баримтын хасалт `warns`-д ил биш');
  assert.ok(/const noteSubReceipts = useCallback[\s\S]*?seenAtRef\.current\.set\(rc\[0\], rc\[1\]\)/.test(DS), '`noteSubReceipts` харсан агшныг (`seenAtRef`) тэмдэглэхгүй');
  const FNo = readOne('src/modules/sheet/FillNew.tsx');
  assert.ok(!/\bsubReceipts\(/.test(FNo) && (FNo.match(/noteSubReceipts\(/g) ?? []).length >= 2, 'FillNew серверийн баримтыг `noteSubReceipts`-ээр биш шууд `subReceipts`-ээр тавьж байна');
}
console.log('✅ аудит №6 — серверийн илгээлтийн баримт: ил хасалт · харсан агшин');
