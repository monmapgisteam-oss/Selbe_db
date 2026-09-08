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
  /* Нийлүүлэлтийн мөчлөг ба бичиж байхад алгасах хамгаалалт */
  assert.ok(/editRef\.current \|\| document\.visibilityState === 'hidden'/.test(FN),
    'FillNew: нүд засаж байхад нийлүүлэлт алгасах хамгаалалт алга — курсор үсэрнэ');
  assert.ok(/lastMergedRef/.test(FN), 'FillNew: давхар нийлүүлэлтийн хамгаалалт алга');
  /* Хуучин мөрийг ЗӨВХӨН амжилттай бичсэний дараа устгана */
  const okBlock = FN.slice(FN.indexOf('if (r.ok) {'), FN.indexOf('if (r.ok) {') + 800);
  assert.ok(/clearLegacyDrafts/.test(okBlock),
    'FillNew: хуучин мөрийн устгалт `r.ok` салаанд байх ёстой (бичилт баталгаажсаны дараа)');
}
console.log('✅ эх кодын гэрээ — түлхүүр · шилжүүлэлт · түгжээ · мөчлөг');

console.log('\nshareDraft.check: ok');
