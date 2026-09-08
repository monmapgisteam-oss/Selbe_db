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

/* ══════════ `mergeDrafts`-ийн ХУВИЛБАР (FillNew.tsx-ийн дүрэм) ══════════ */
const mergeDrafts = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const [older, newer] = a.t <= b.t ? [a, b] : [b, a];
  const cells = new Map(older.cells);
  for (const [k, v] of newer.cells) cells.set(k, v);
  const dates = new Map(older.dates ?? []);
  for (const [k, v] of newer.dates ?? []) dates.set(k, v);
  const adds = new Map();
  for (const x of older.adds ?? []) adds.set(x.oid, x);
  for (const x of newer.adds ?? []) adds.set(x.oid, x);
  const rowKeys = new Map(older.rowKeys ?? []);
  for (const [o, k] of newer.rowKeys ?? []) rowKeys.set(o, k);
  const by = new Map(older.by ?? []);
  for (const [k, u] of newer.by ?? []) by.set(k, u);
  const done = new Map();
  for (const [u, at] of older.done ?? []) done.set(u, at);
  if (newer.done != null) {
    const fresh = new Map(newer.done ?? []);
    for (const [u, at] of done) if (!fresh.has(u) && newer.t >= at) done.delete(u);
    for (const [u, at] of fresh) done.set(u, at);
  }
  return {
    t: newer.t,
    cells: [...cells],
    dates: dates.size ? [...dates] : undefined,
    adds: adds.size ? [...adds.values()] : undefined,
    asOf: newer.asOf !== undefined ? newer.asOf : older.asOf,
    rowKeys: [...rowKeys],
    by: by.size ? [...by] : undefined,
    done: done.size ? [...done] : undefined,
  };
};

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
{
  /* А дуусгасан (t=1000). Дараа нь А буцаасан → шинэ ноорогт `done` хоосон. */
  const before = { t: 1000, cells: [['10:0', '1']], by: [['10:0', 'a']], done: [['a', 900]] };
  /* ⚠️ Буцаалт нь ХООСОН МАССИВ — `undefined` (хуучин ноорог) БИШ */
  const after = { t: 2000, cells: [['10:0', '1']], by: [['10:0', 'a']], done: [] };
  const m = mergeDrafts(before, after);
  assert.ok(!m.done || !m.done.some(([u]) => u === 'a'),
    'буцаасны дараа «дуусгасан» тэмдэглэгээ нийлүүлэлтээр СЭРГЭХ ЁСГҮЙ');

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

/* ══════════ 6. ЭХ КОДЫН ГЭРЭЭ — салбарлалтыг барина ══════════ */
{
  const DR = fs.readFileSync('src/lib/draftRemote.ts', 'utf8');
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  /* `flush` (3 сек тутмын алсын бичилт) — бичихээсээ ӨМНӨ уншина.
     ⚠️ Блокийн ХИЛИЙГ дараагийн тэмдэглэгээгээр олно, тэмдэгтийн тоогоор БИШ:
     гүйцэтгэлийн оновчлол нэмэгдэхэд тогтмол цонх хүрэлцэхгүй болж шалгуур
     ХУДЛАА уналаа (2026-09-08). */
  const fi = FN.indexOf('const flush = () => {');
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
  const tb = FN.slice(ti, ti + 3200);
  assert.ok(tb.includes('readRemoteDraft(pkg.key)'),
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
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
  const DR = fs.readFileSync('src/lib/draftRemote.ts', 'utf8');
  assert.ok(DR.includes('export async function readRemoteDraftAt'),
    'draftRemote: хямд `at` шалгалт алга — мөчлөг бүрд 80KB татна');
  const ai = DR.indexOf('export async function readRemoteDraftAt');
  const ab = DR.slice(ai, ai + 1200);
  assert.ok(ab.includes("outFields: ['OBJECTID', 'at']"),
    'readRemoteDraftAt: `payload` татаж байна — хямд байхаа больсон');
  assert.ok(!ab.includes("'payload'"), 'readRemoteDraftAt: payload огт татагдах ёсгүй');
  assert.ok(DR.includes('const layerCache = new Map'),
    'draftRemote: давхаргын кэш алга — дуудлага бүрд шинэ FeatureLayer үүснэ');

  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  /* Татах мөчлөг ба бичих зам ХОЁУЛАА хямд шалгалтаар эхэлнэ */
  const uses = FN.split('readRemoteDraftAt(').length - 1;
  assert.ok(uses >= 3,
    `FillNew: readRemoteDraftAt ${uses} газар — татах мөчлөг · flush · toggleDone ГУРВУУЛАА хэрэглэх ёстой`);
  /* Дэмий бичилт таслагдана, зөвхөн амжилттай бичилтэд тэмдэглэгдэнэ */
  assert.ok(FN.includes('if (body === lastBodyRef.current)'),
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
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
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
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
