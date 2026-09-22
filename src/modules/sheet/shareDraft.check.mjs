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
 * Эх кодыг уншиж CRLF → LF ЖИГДРҮҮЛНЭ (2026-09-22).
 *
 * ⚠️ Доорх шалгуурууд `FillNew.tsx`-ийг ТЭМДЭГТ БҮРЭЭР тулгадаг бөгөөд
 *    зарим хэв шинжид мөр таслалт (`\n`) хатуу бичигдсэн. Windows дээр git
 *    нь CRLF-ээр checkout хийдэг тул түүхийгээр уншвал тэдгээр ХЭЗЭЭ Ч
 *    таарахгүй — тест ХУДЛААР унана (кодын алдаа БИШ, орчны ялгаа).
 *    `docs.invariant.check.mjs`-ийн ижил засвар.
 */
const read = (f) => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');

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
  /* 2026-09-21: `byAt` (түлхүүр бүрд max агшин) ба `del` (tombstone) —
     FillNew.tsx-ийн дүрэмтэй ижил, доорх 11-р хэсэг ажиллуулж шалгана. */
  const byAt = new Map(older.byAt ?? []);
  for (const [k, a] of newer.byAt ?? []) if ((byAt.get(k) ?? 0) < a) byAt.set(k, a);
  const del = new Map(older.del ?? []);
  for (const [k, a] of newer.del ?? []) if ((del.get(k) ?? 0) < a) del.set(k, a);
  const now = Date.now();
  for (const [k, a] of del) {
    if (now - a > 7 * 24 * 3600 * 1000) { del.delete(k); continue; }
    /* 2026-09-21 (дахин аудит): `a:` — мөр байгаа ба нэмсэн агшин (`byAt`-ийн
       `a:` түлхүүр) tombstone-оос өмнө (эсвэл байхгүй) бол мөр + нүдийг хасна. */
    if (k.startsWith('a:')) {
      const o = Number(k.slice(2));
      if (!adds.has(o)) continue;
      const added = byAt.get(k);
      if (added != null && added > a) { del.delete(k); continue; }
      adds.delete(o);
      const pre = `${o}:`;
      for (const m of [cells, dates, by, byAt]) for (const kk of [...m.keys()]) if (kk.startsWith(pre)) m.delete(kk);
      byAt.delete(k);
      continue;
    }
    const wrote = byAt.get(k);
    if (wrote != null && wrote > a) { del.delete(k); continue; }
    cells.delete(k);
    dates.delete(k);
    by.delete(k);
    byAt.delete(k);
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
    byAt: byAt.size ? [...byAt] : undefined,
    del: del.size ? [...del] : undefined,
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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

  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
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
  const FN = read('src/modules/sheet/FillNew.tsx');
  assert.ok(/byAt\?: \[string, number\]\[\];/.test(FN), 'Draft-д `byAt` алга');
  assert.ok(/del\?: \[string, number\]\[\];/.test(FN), 'Draft-д `del` (tombstone) алга');
  /* Ctrl+S оролцогчийн түгжээг тойрохгүй */
  const pi = FN.indexOf('const publish = useCallback(async () => {');
  const pb = FN.slice(pi, FN.indexOf('setBusy(true);', pi));
  assert.ok(pb.includes('if (!canSubmitNow)'), 'publish: Ctrl+S оролцогчийн түгжээг тойрч байна');
  /* flush: алсаас нийлүүлсэн бол lastMergedRef хөдлөхгүй — tick буулгана */
  assert.ok(FN.includes('if (!remote && outDraft.t > lastMergedRef.current)'),
    'flush: нийлүүлсэн нүд дэлгэцэд буухгүй (lastMergedRef үргэлж урагшилж байна)');
  /* dropAdd нүдээ хамт хасна, tombstone тавина */
  const di = FN.indexOf('const dropAdd = (oid: number) => {');
  const db = FN.slice(di, di + 900);
  assert.ok(db.includes('setPending(strip)') && db.includes('setPendDate(strip)'), 'dropAdd: мөрийн нүд pending-д үлдэж байна');
  assert.ok(db.includes('tombstone(`a:${oid}`)'), 'dropAdd: tombstone алга');
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
console.log('✅ эх кодын гэрээ (2026-09-21) — Ctrl+S түгжээ · flush буулгалт · dropAdd · эзэмшил ×4 · идэвхгүй шүүлт · flow');

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
  const FN = read('src/modules/sheet/FillNew.tsx');
  /* #1 түр oid цагаас эхэлнэ, `nextTmpOid`-оор олгогдоно, tombstone-оос ч түлхэгдэнэ */
  assert.ok(/let tmpOid = -\(Date\.now\(\) % 1e9\) \* 100 - 1;/.test(FN), '#1: tmpOid −1-ээс эхэлж байна (хуудас бүрт давтагдана)');
  assert.ok(!FN.includes('tmpOid--,'), '#1: шууд `tmpOid--` үлдэж байна — `nextTmpOid()` хэрэглэ');
  assert.ok(FN.includes('function pushTmpOidKeys('), '#1: tombstone-ийн `a:` oid-оос түлхэх функц алга');
  assert.ok(FN.includes('pushTmpOidKeys(delRef.current.keys())'), '#1: pickDraft tombstone-оос тоолуур түлхэхгүй байна');
  /* #1 нэмсэн агшин — addRow бичнэ, dropAdd арилгана, хадгалах эффект `a:` түлхүүрээр бичнэ */
  const ai = FN.indexOf('const oid = nextTmpOid();');
  assert.ok(ai > 0 && FN.slice(ai, ai + 500).includes('touchMine(`a:${oid}`)'), '#1: addRow нэмсэн агшинг тэмдэглэхгүй байна');
  const di = FN.indexOf('const dropAdd = (oid: number) => {');
  assert.ok(FN.slice(di, di + 1200).includes('mineAtRef.current.delete(`a:${oid}`)'), '#1: dropAdd нэмсэн агшинг үлдээж байна');
  assert.ok(FN.includes('for (const a of adds) {\n      const k = `a:${a.oid}`;'), '#1: хадгалах эффект `a:` агшинг бичихгүй байна');
  /* #2 pickDraft болзолгүй тавина; хоосон нийлбэр төлөвийг хоослоно; tombstone байвал алсыг цэвэрлэхгүй */
  assert.ok(!/if \(restoredAdds\.length\) setAdds\(restoredAdds\);/.test(FN), '#2: setAdds болзолтой хэвээр');
  assert.ok(!/if \(nCells\) setPending\(next\);/.test(FN), '#2: setPending болзолтой хэвээр');
  assert.ok(!/if \(nDates\) setPendDate\(nextDates\);/.test(FN), '#2: setPendDate болзолтой хэвээр');
  const ti = FN.indexOf('if (!total) {');
  const tb = FN.slice(ti, ti + 2200);
  assert.ok(tb.includes('setPending({});') && tb.includes('setAdds([]);'), '#2: хоосон нийлбэр төлөвийг хоослохгүй байна');
  assert.ok(tb.includes('if (delRef.current.size) return;'), '#2: tombstone-той хоосон нийлбэр алсыг цэвэрлэж байна');
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
  assert.ok(FN.includes('if (sameVol) revert(key, key in pending);'), '#7: обьём');
  assert.ok(FN.includes('if (samePct) revert(key, key in pending);'), '#7: хувь');
  assert.ok(FN.includes('if (sameDate) revert(key, key in pendDate);'), '#7: огноо');
  assert.ok(FN.includes('if (same) revert(x.key, x.key in pv);'), '#7: paste');
  /* #8 буцаагдсан өмнөх өдөр мэдэгдэнэ */
  assert.ok(FN.includes('const otherDaysReturned = useMemo(() => {'), '#8: otherDaysReturned алга');
  assert.ok(FN.includes("tr('Өмнөх өдрийн илгээлт хяналтаас БУЦААГДСАН ({0}) — засвар шаардлагатай.', otherDaysReturned.join(', '))"), '#8: мэдэгдэл алга');
  /* Илгээлт tombstone-ийг тэглэнэ — эс бөгөөс хоосон зам ноорог цэвэрлэхгүй */
  const pi = FN.indexOf('const nCells = Object.keys(pend2).length');
  assert.ok(FN.slice(pi, pi + 700).includes('delRef.current = new Map();'), 'publish: delRef тэглэгдэхгүй — ноорог илгээсний дараа цэвэрлэгдэхгүй');
}
console.log('✅ эх кодын гэрээ (дахин аудит) — tmpOid · нэмсэн агшин · болзолгүй set · tombstone хадгалалт · waitingOn · хожуу давхарлалт · revert · буцаагдсан өдөр');
