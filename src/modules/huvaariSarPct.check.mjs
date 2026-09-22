/**
 * ХУАНЛИЙН САРЫН НҮДНИЙ ХУВЬ — offline эх кодын гэрээ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaariSarPct.check.mjs
 *
 * ⚠️ ЯАГААД ЭНЭ ТЕСТ БАЙХ ЁСТОЙ ВЭ (2026-09-22).
 *
 * Сарын толгойн нүдэнд «тэр сард төлөвлөсөн обьём нь БАГЦЫН НИЙТ обьёмын
 * хэдэн хувь» гэсэн тоо гарна. Гурван эвдрэл нь НҮДЭЭР ИЛРЭХГҮЙ:
 *
 *   (1) Бүлгийн мөрийг шүүхгүй бол — `vol` нь бүлгийн мөрд ч уншигддаг
 *       (`bagtsSheet.ts:752`) тул хүүхдүүд ДАХИН тоологдож хувь хоёр дахин
 *       хөөрөгдөнө. Тоо «үнэмшилтэй» хэвээр буруу байна.
 *   (2) `plannedVol`/`unit` руу хальтарвал — тэр хоёр нь «ЯМАР Ч ТООЦООНД
 *       ОРОХГҮЙ» гэж `bagtsSheet.ts:44-52`-д бэхлэгдсэн.
 *   (3) `.plHead`-ийн 30px өндрийг өөрчилвөл — виртуалчлалын offset
 *       (`scrollTop - PL_ROW`) ба зүүн `gSideHead`-ийн хатуу өндөр хоёр
 *       түүнээс хамаардаг тул зүүн ажлын нэр ба баруун зурвас ГУЛСАНА.
 *
 * ⚠️ Ажиллуулж барих боломжгүй (React ба ArcGIS шаардана) тул ЭХ КОДЫГ
 *    шууд тулгана — `huvaariBatlah.view.check.mjs`-ийн хэв маягаар.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
/** ТАЙЛБАРГҮЙ эх код — ⚠️ тайлбарт бичсэн нэр худал уналт үүсгэхээс. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TSX = strip(read('src/modules/Huvaari.tsx'));
const CSS = read('src/modules/huvaari.module.css');
const CSSc = strip(CSS);

let n = 0;
const ok = (m) => { n += 1; console.log('  ✓', m); };

/* ── 1. НАВЧНЫ ШҮҮЛТ — хамгийн чухал инвариант ─────────────────────── */
const mi = TSX.indexOf('const monPct = useMemo(');
assert.ok(mi > 0, 'monPct memo байх ёстой');
const mEnd = TSX.indexOf('}, [plan, n, sc, obDraft, obPlan]);', mi);
assert.ok(mEnd > mi, 'monPct-ийн deps нь [plan, n, sc, obDraft, obPlan] байх ёстой');
const BODY = TSX.slice(mi, mEnd);

assert.match(
  BODY,
  /if \(r\.group\b/,
  'monPct нь БҮЛГИЙН мөрийг шүүх ёстой — эс бөгөөс хувь хоёр дахин хөөрөгдөнө',
);
ok('monPct нь зөвхөн НАВЧ мөрөөр тоолно (r.group шүүгдсэн)');

/* Хуваарь ба хуваагч ХОЁУЛАА ижил шүүлтийн ДАРАА байх — `continue` нь
   давталтын биеийн ЭХЭНД байвал хоёуланд нэгэн зэрэг үйлчилнэ. */
const gPos = BODY.indexOf('if (r.group');
const volPos = BODY.indexOf('r.vol');
const perPos = BODY.indexOf('per.set(');
assert.ok(gPos < volPos, 'бүлгийн шүүлт нь `tot += r.vol`-ООС ӨМНӨ байх ёстой');
assert.ok(gPos < perPos, 'бүлгийн шүүлт нь `per.set`-ООС ӨМНӨ байх ёстой');
ok('шүүлт нь хуваарь БА хуваагч хоёуланд үйлчилнэ');

/* ── 1b. ХУУРАМЧ ХУВЬ ГАРГАХГҮЙ — ЗӨВХӨН БОДИТ ЗАДАРГАА ───────────── */
/**
 * ⚠️ ХАМГИЙН ЧУХАЛ ШААРДЛАГА (2026-09-22, хэрэглэгч: «сарын задаргаа
 *    байхгүй байхад хуурамч хувь битгий гаргаад бай»).
 *
 * Урьд нь задаргаагүй зурваст мөрийн обьёмыг зурвасын ХОНОГООР шугаман
 * хуваадаг байв. Тэр нь ТААМАГЛАЛ: төлөвлөгч сарын хуваарилалтыг ОГТ
 * шийдээгүй байхад «шийдсэн» юм шиг тоо гаргана. Мөн 2026-09-06-ны
 * «автомат обьём тараалт хийж болохгүй, бүгд хоосон байх ёстой» гэсэн
 * шийдвэртэй ЗӨРЧИЛДӨНӨ (`Huvaari.tsx`-ийн `setObDraft` тайлбар).
 */
for (const bad of ['spanDays(', 't += DAY', 'live.length', '/ days']) {
  assert.ok(
    !BODY.includes(bad),
    `monPct дотор \`${bad}\` БАЙХГҮЙ — шугаман хуваалт нь ХУУРАМЧ хувь гаргана`,
  );
}
ok('шугаман хуваалт АЛГА — задаргаагүй бол сарын нүд ХООСОН');

/* Тоо нь ЗӨВХӨН `obDraft`/`obPlan`-аас гарна. */
assert.ok(BODY.includes('obDraft.get('), 'ноорог задаргаа уншигдах ёстой');
assert.ok(BODY.includes('obPlan.get('), 'хадгалагдсан задаргаа уншигдах ёстой');
assert.ok(BODY.includes('if (!md || !md.size) continue;'), 'задаргаагүй блок АЛГАСАГДАХ ёстой');
ok('тоо нь ЗӨВХӨН бодит задаргаанаас (obDraft ?? obPlan)');

/* ── 1c. ХУВААГЧ — БАГЦЫН НИЙТ ОБЬЁМ ──────────────────────────────── */
/**
 * ⚠️ Хэрэглэгчийн шаардлага (2026-09-22): «тухайн сард төлөвлөсөн бүх ажил
 *    багц нийт обьём эзлэх хувь». Хуваагч нь БАГЦЫН НИЙТ обьём — задаргаа
 *    оруулсан хүрээ БИШ.
 *
 * Хамгийн чухал эвдрэл: хуваагчийг задаргаатай хүрээгээр хязгаарлавал
 * бөглөөгүй ажлууд хуваагчаас ч хасагдаж, НЭГ ажил бөглөхөд шууд 100%
 * болж, дутуу төлөвлөлт НУУГДАНА.
 *
 * ⚠️ `vol` нь БЛОК ТУС БҮРИЙН нийт обьём (цонхны `balanced(mv, r.vol)` нь
 *    НЭГ блокийн задаргаа `r.vol`-тай тэнцэхийг шаардана) тул хуваагч нь
 *    `Σ r.vol × (хуваарьтай блокийн тоо)`.
 */
const totPos = BODY.indexOf('tot += r.vol');
assert.ok(totPos > 0, '`tot += r.vol` байх ёстой');
assert.equal(BODY.split('tot +=').length - 1, 1, '`tot` нь ЗӨВХӨН НЭГ газарт нэмэгдэх ёстой');

/* `tot` нь ЗАДАРГААНЫ шалгуураас ӨМНӨ — эс бөгөөс бөглөөгүй нь хасагдана. */
const mdPos = BODY.indexOf('const md =');
assert.ok(mdPos > 0, 'задаргаа уншилт байх ёстой');
assert.ok(
  totPos < mdPos,
  '`tot` нь задаргаа уншихаас ӨМНӨ нэмэгдэх ёстой — эс бөгөөс бөглөөгүй ажил '
  + 'хуваагчаас хасагдаж, нэг ажил бөглөхөд 100% болно',
);
ok('хуваагч — БАГЦЫН нийт (задаргаагүй ажил ч орно)');

/* ⚠️ ХУВААРЬГҮЙ блок хуваагчид ОРОХГҮЙ: 22 блокоос 3-д л хуваарь байхад
   22-оор үржүүлбэл хувь 7 дахин багасч, бүрэн төлөвлөсөн багц ч 14% болно. */
assert.ok(BODY.includes('if (!r.spans[b]) continue;'), 'хуваарьгүй блок хуваагчид орохгүй');
const spPos = BODY.indexOf('if (!r.spans[b]) continue;');
assert.ok(spPos < totPos, 'зурвасын шалгуур нь `tot`-оос ӨМНӨ байх ёстой');
ok('хуваарьгүй блок хуваагчид ОРОХГҮЙ');

/* ── 2. plannedVol / unit ХЭРЭГЛЭГДЭХГҮЙ ──────────────────────────── */
for (const bad of ['plannedVol', '.unit']) {
  assert.ok(
    !BODY.includes(bad),
    `monPct дотор \`${bad}\` ХЭРЭГЛЭГДЭХГҮЙ — bagtsSheet.ts:44-52 «ямар ч тооцоонд орохгүй»`,
  );
}
ok('monPct нь plannedVol/unit-ыг хэрэглэдэггүй (мөнгөн жин ч хориотой)');

/* ── 3. null ≠ 0 — хоосон багц ба хуваарьгүй сар ОГТ зурагдахгүй ──── */
const li = TSX.indexOf('const monLab = useCallback(');
assert.ok(li > 0, 'monLab байх ёстой');
const LAB = TSX.slice(li, TSX.indexOf('}, [monPct]);', li));
assert.match(LAB, /monPct\.tot > 0/, 'tot === 0 (обьёмгүй багц) → null');
assert.match(LAB, /v > 0/, 'сарын хуваарь 0 эсвэл null → null');
assert.ok(LAB.includes('return null'), 'monLab нь null буцаах салаатай байх ёстой');
ok('null ≠ 0 — обьёмгүй багц ба хуваарьгүй сар ОГТ зурагдахгүй');

/* ⚠️ `pct()` нь 100-аар ҮРЖҮҮЛДЭГГҮЙ (оролт 0–100) — энд хэрэглэвэл
   аль хэдийн 100-аар үржүүлсэн тоог дахин форматлаж хоёрдмол болно. */
assert.ok(!LAB.includes('pct('), 'monLab нь pct() хэрэглэхгүй — өөрөө 0–100 болгоно');
ok('pct() хэрэглэгдээгүй — хувийг өөрөө бодно');

/* ── 4. ХАРАГДАЦ — сарын шошгын ДОР хоёр дахь мөр ──────────────────── */
assert.match(TSX, /h\.plMonPct/, 'сарын хувийн класс хэрэглэгдсэн байх ёстой');
assert.match(TSX, /const pc = monLab\(m\.lab\);/, 'months.map нь monLab-ыг дуудах ёстой');
assert.match(TSX, /title=\{pc\?\.tip\}/, 'бүтэн утга title-д байх ёстой (73px-д багтахгүй)');
ok('сарын нүдэнд хоёр дахь мөр + hover дээр бүтэн утга');

assert.match(CSSc, /\.plMonPct \{[^}]*display: block;/, '.plMonPct нь block — сарын шошгын ДОР шинэ мөр');
ok('.plMonPct нь display:block (шинэ мөр)');

/* ── 5. `.plHead`-ийн 30px ХӨНДӨГДӨӨГҮЙ ───────────────────────────── */
const hi = CSSc.indexOf('.plHead {');
assert.ok(hi > 0, '.plHead байх ёстой');
const HEAD = CSSc.slice(hi, CSSc.indexOf('}', hi));
assert.match(
  HEAD,
  /height: 30px;/,
  '.plHead нь 30px хэвээр — PL_ROW-той уягдсан (scrollTop - PL_ROW offset, gSideHead)',
);
ok('.plHead нь 30px хэвээр — мөрүүд гулсахгүй');

assert.match(TSX, /const PL_ROW = 30;/, 'PL_ROW = 30 нь .plHead-ийн өндөртэй таарах ёстой');
ok('PL_ROW = 30 нь .plHead-тэй таарна');

/* Хоногийн мөр (top: 18px) ХӨНДӨГДӨӨГҮЙ — сар/хувь хоёр 1–17px дотор. */
const di = CSSc.indexOf('.plDay {');
const DAY = CSSc.slice(di, CSSc.indexOf('}', di));
assert.match(DAY, /top: 18px;/, '.plDay нь 18px хэвээр — сар/хувь нь түүнээс дээш багтана');
ok('.plDay нь 18px хэвээр — гурван мөр 30px дотор эвлэнэ');

console.log(`\n✓ Хуанлийн сарын хувь — ${n} шалгуур\n`);
