/**
 * БЛОКГҮЙ БАГЦЫН ГЭРЭЭ (2026-09-16).
 *
 * ⚠️ ЯАГААД ЭНЭ ШАЛГУУР БАЙХ ЁСТОЙ ВЭ. 2026-09-16-нд нэмэгдсэн 8 багц
 * (5.1 · 5.2 · 5.3 · 5.4 · 6.1 · 6.2 · 6.4 · 10) нь БАРИЛГА БИШ тул
 * блокоор задардаггүй — `resolveSchema` нь `bld`/`act`/`plan`/`obyem`/
 * `start`/`end` БҮГДИЙГ хоосон массив болгож буцаана.
 *
 * Гүн шалгалтаар ХОЁР чимээгүй эвдрэл илэрсэн:
 *
 *   1. `FillNew.tsx`-д `!nBld ? [] : computeAll(...)` гэсэн товчлол байв.
 *      `calc` хоосон массив болж, `vis` нь `calc[i]`-ээр шүүдэг тул БҮХ
 *      мөр хасагдаж, хуудас ТАЙЛБАРГҮЙ цагаан харагддаг байлаа. Хэрэглэгч
 *      «хүснэгт эвдэрсэн» гэж уншина. Амьдаар: Багц 5.1-ийн 331 мөр,
 *      Багц 10-ын 850 мөрийн НЭГ Ч зурагдахгүй.
 *
 *   2. `avg` нь `n = 0` үед `0/0 = NaN` буцаана. `pct()` нь NaN-г «—» гэж
 *      зурдаг тул дэлгэцэнд буруу ТОО гарахгүй ч, `NaN` нь I · J · E · K
 *      дамжин нэгтгэл, S-муруй, CEO самбар руу тархаж хаана ч баригдахгүй
 *      өнгөрнө. Амьдаар: Багц 5.1-д 1,324 · Багц 10-д 3,400 NaN.
 *
 * ⚠️ БЛОКТОЙ 10 БАГЦАД НӨЛӨӨЛӨХГҮЙ гэдгийг мөн ЭНД бэхэлнэ — `n > 0` үед
 * зан төлөв ЯГ ХЭВЭЭР байх ёстой.
 *
 * ⚠️ Сүлжээгүй, цэвэр функцээр: `computeAll` нь мөрийн массив + блокийн тоо
 * хоёроос л хамаардаг тул амьд ArcGIS хэрэггүй.
 */
import assert from 'node:assert/strict';
import { computeAll } from './bagtsSheet.ts';

/**
 * Нэг `SheetRow` бүтээх.
 * ⚠️ Талбарын нэр нь БОДИТ бүтцийнх: `depth`/`group` (`gun` биш);
 *    `unit` нь «Объём_шинэ2» — ямар ч томьёонд ОРОХГҮЙ; мөнгө нь `money`.
 */
const mkRow = (o = {}) => ({
  oid: 1,
  no: '1',
  des: null,
  ham: null,
  work: 'ажил',
  depth: 1,
  group: false,
  wC: null,
  wD: null,
  vol: null,
  plannedVol: null,
  unit: null,
  money: null,
  act: [],
  obyem: [],
  plan: [],
  start: [],
  end: [],
  gStart: [],
  gEnd: [],
  aStart: [],
  aEnd: [],
  hun: null,
  mashin: null,
  raw: {},
  ...o,
});

/* ══════════ 1. БЛОКГҮЙ (n = 0) — унахгүй, NaN гаргахгүй ══════════ */
{
  const rows = [
    /* ⚠️ ШАТЛАЛТАЙ: depth 0 = бүлэг (`group: true`), depth 1 = навч.
       Навчийн H нь `money`-оос, бүлгийнх нь хүүхдүүдийн НИЙЛБЭРЭЭС. */
    mkRow({ oid: 1, no: 'Б', work: 'БАГЦ 5.1 ГАДНА ДУЛААН', depth: 0, group: true }),
    mkRow({ oid: 2, no: '1', work: 'ТӨЛӨВЛӨЖ БУЙ ШУГАМ', depth: 1, vol: 25, money: 300000 }),
    mkRow({ oid: 3, no: '2', work: 'ХУДАГ', depth: 1, vol: 4, money: 3200000 }),
  ];

  let calc;
  assert.doesNotThrow(() => { calc = computeAll(rows, 0, null, {}, {}, [], undefined); },
    'computeAll нь блокгүй (n=0) үед УНАСАН');

  assert.equal(calc.length, rows.length,
    'блокгүй үед мөр бүрд элемент буцаах ёстой — эс бөгөөс `vis` нь БҮХ мөрийг нуух');

  /* ⚠️ `vis` нь `calc[i]`-ээр шүүдэг: элемент бүр ҮНЭН утга байх ЁСТОЙ */
  for (let i = 0; i < rows.length; i += 1) {
    assert.ok(calc[i], `calc[${i}] нь falsy — тэр мөр хуудсанд ОГТ зурагдахгүй`);
  }

  /* NaN/Infinity нэг ч байх ёсгүй — тэдгээр нь чимээгүй тархана */
  for (let i = 0; i < calc.length; i += 1) {
    for (const [k, v] of Object.entries(calc[i])) {
      if (typeof v === 'number') {
        assert.ok(Number.isFinite(v), `calc[${i}].${k} = ${v} — NaN/Infinity тархана`);
      } else if (Array.isArray(v)) {
        for (const x of v) {
          if (typeof x === 'number') {
            assert.ok(Number.isFinite(x), `calc[${i}].${k}[] = ${x} — NaN/Infinity`);
          }
        }
      }
    }
  }

  /* Блокоос ҮЛ ХАМААРАХ баганууд ХЭВИЙН бодогдох ёстой */
  assert.equal(calc[1].H, 300000, 'H (мөнгөн дүн) нь блокоос үл хамаарна');
  assert.equal(calc[0].H, 300000 + 3200000, 'бүлгийн H = хүүхдүүдийн нийлбэр — блокоос үл хамаарна');
  assert.ok(calc[0].C != null, 'C (хувийн жин) нь блокгүй үед ч бодогдох ёстой');
  assert.ok(calc[0].D != null, 'D (үе шатандаа эзлэх) нь блокгүй үед ч бодогдох ёстой');

  /* Блокоос бодогддог нь МЭДЭЭЛЭЛГҮЙ (`null`) — 0 БИШ */
  assert.equal(calc[0].I, null, 'I нь блокгүй үед `null` байх ёстой (0 биш)');
  assert.equal(calc[0].J, null, 'J нь блокгүй үед `null` байх ёстой (0 биш)');
  assert.equal(calc[0].K, null, 'K нь блокгүй үед `null` байх ёстой (0 биш)');
  assert.equal(calc[1].E, null, 'E = C×J тул J байхгүй бол E ч `null`');
}
console.log('✅ блокгүй (n=0) — унахгүй · NaN алга · мөр бүр зурагдана · H·C·D хэвийн');

/* ══════════ 2. БЛОКТОЙ (n > 0) — зан төлөв ӨӨРЧЛӨГДӨӨГҮЙ ══════════ */
{
  /**
   * ⚠️ Энэ бүлэг нь «блокгүйг зассан нь блоктойг эвдээгүй» гэдгийг барина.
   *    `avg` нь `n > 0` үед ЯГ хуучин томьёогоороо ажиллах ёстой:
   *    хоосныг 0 гэж үзэн блокийн ТООНД хуваана (`AVERAGE(IF(range="",0,range))`).
   */
  const rows = [mkRow({
    oid: 1, no: '1', work: 'ажил', depth: 1, vol: 10, money: 10000,
    act: [0.5, 0.8, null, 1],
    plan: [1, 1, 1, 1],
    obyem: [5, 8, null, 10],
    start: [null, null, null, null],
    end: [null, null, null, null],
  })];
  /* ⚠️ 2026-10-08: `asOf` ТАВЬСАН — I/K-ийн «блок байхад null биш» дүрэм нь ЗӨВХӨН лавлах
     огноотой хуудсанд (Excel `IF(range="",0,…)`: огноогүй блок = 0). `asOf == null` бол
     I/K `null` — доорх §2б. */
  const asOf = Date.parse('2026-01-01T00:00:00Z');
  const calc = computeAll(rows, 4, asOf, {}, {}, [], undefined);

  /* J = (0.5 + 0.8 + 0 + 1) / 4 = 0.575 — ГОЛ шалгуур: блокийн ТООНД хуваана */
  assert.equal(calc[0].J, 0.575, 'J нь блокийн ТООНД хуваагдах ёстой (хоосон = 0)');
  /* ⚠️ I нь оролтын `plan` БИШ — огноо/интерполяциас БОДОГДДОГ. `asOf` БАЙХАД огноогүй
     бэлдэцэд 0 гарах нь зөв (Excel хоосон = 0); энд чухал нь `null` БИШ гэдэг (блок БАЙГАА). */
  assert.equal(calc[0].I, 0, 'asOf байхад огноогүй блокийн I = 0 (Excel хоосон = 0)');
  assert.notEqual(calc[0].I, null, 'блок байхад (asOf-той) I нь `null` байх ЁСГҮЙ');
  assert.notEqual(calc[0].K, null, 'блок байхад (asOf-той) K нь `null` байх ЁСГҮЙ');
  assert.ok(calc[0].E != null, 'E = C×J нь блоктой үед утгатай');

  /* ── 2б. `asOf == null` → I · K · бүлгийн plan `null` (0 БИШ) — 2026-10-08 ──
     Лавлах огноо ОГТ тохируулаагүй хуудсанд төлөвлөгөөт хувь «мэдээлэлгүй»; урьд нь
     `avg` null-уудыг 0 гэж нэгтгээд I = 0 → K = 0 архивлагдаж байв (`hyanaltStore` ⚠️). */
  const noAsOf = computeAll([
    mkRow({ oid: 10, no: '1', work: 'бүлэг', depth: 0, group: true, act: [null, null], plan: [null, null], obyem: [null, null], start: [null, null], end: [null, null] }),
    mkRow({ oid: 11, no: '1.1', depth: 1, vol: 10, money: 1000, act: [0.5, 1], plan: [null, null], obyem: [5, 10],
      start: [Date.parse('2026-01-01T00:00:00Z'), null], end: [Date.parse('2026-02-01T00:00:00Z'), null] }),
  ], 2, null, {}, {}, [], undefined);
  assert.equal(noAsOf[1].I, null, 'asOf алга → навчны I = null (0 биш)');
  assert.equal(noAsOf[1].K, null, 'asOf алга → K = null');
  assert.equal(noAsOf[1].J, 0.75, 'J огнооноос хамаарахгүй — хэвээр');
  assert.deepEqual(noAsOf[1].plan, [null, null], 'огноотой блок ч asOf-гүй бол null');
  assert.deepEqual(noAsOf[0].plan, [null, null], 'бүлгийн plan null (sp=0 → 0% БИШ)');
  assert.equal(noAsOf[0].I, null, 'бүлгийн I null');
  assert.equal(noAsOf[0].K, null, 'бүлгийн K null');
  /* Ижил мөрүүд `asOf`-той бол тоо гарна — засвар зөвхөн asOf-гүй замд */
  const withAsOf = computeAll([
    mkRow({ oid: 10, no: '1', work: 'бүлэг', depth: 0, group: true, act: [null, null], plan: [null, null], obyem: [null, null], start: [null, null], end: [null, null] }),
    mkRow({ oid: 11, no: '1.1', depth: 1, vol: 10, money: 1000, act: [0.5, 1], plan: [null, null], obyem: [5, 10],
      start: [Date.parse('2026-01-01T00:00:00Z'), null], end: [Date.parse('2026-02-01T00:00:00Z'), null] }),
  ], 2, Date.parse('2026-01-16T00:00:00Z'), {}, {}, [], undefined);
  assert.ok(withAsOf[1].plan[0] > 0 && withAsOf[1].plan[0] < 1, 'asOf-той бол огноотой блок интерполяцилагдана');
  assert.equal(withAsOf[1].plan[1], null, 'огноогүй блок null хэвээр');
  assert.ok(withAsOf[1].I > 0, 'I = avg (огноогүй блок 0 гэж) > 0');
  assert.equal(withAsOf[0].plan[0], withAsOf[1].plan[0], 'бүлгийн plan — ганц хүүхдийнх');
  assert.equal(withAsOf[0].plan[1], 0, 'asOf-той бүлэгт огноогүй блок 0 (Excel дүрэм хэвээр, planCurve-тэй нэг)');

  /* Бүх блок хоосон → J = 0 (`null` БИШ: блок БАЙГАА, зүгээр бөглөөгүй) */
  const empty = computeAll(
    [mkRow({ act: [null, null], plan: [null, null], obyem: [null, null], start: [null, null], end: [null, null] })],
    2, null, {}, {}, [], undefined,
  );
  assert.equal(empty[0].J, 0,
    'блок БАЙГАА атлаа бүгд хоосон бол J = 0 — `null` нь ЗӨВХӨН блок огт байхгүй үед');
}
console.log('✅ блоктой (n>0) — J·I·K томьёо ХЭВЭЭР, блокгүйн засвар нөлөөлөөгүй');

/* ══════════ 3. n = 0 ба n > 0 хоёрын ЗААГ ══════════ */
{
  /* ⚠️ `n = 1` нь хамгийн эмзэг зааг — `null` руу унах ёсгүй */
  const one = computeAll(
    [mkRow({ act: [0.25], plan: [1], obyem: [2.5], start: [null], end: [null] })],
    1, null, {}, {}, [], undefined,
  );
  assert.equal(one[0].J, 0.25, 'n=1 үед J нь тэр ганц блокийн утга');
  assert.notEqual(one[0].J, null, 'n=1 нь `null` руу унах ЁСГҮЙ — зөвхөн n=0');
}
console.log('✅ зааг — n=1 нь утгатай, зөвхөн n=0 нь `null`');

/* ══════════ 4. СИНТЕТИК НЭГ БЛОК — `resolveSchema(fields, { synthetic })` (2026-09-23) ══════════
 * ⚠️ Блокгүй 8 багцад мөрийн түвшний огноо (`Төлөвлөгөөт_хуваарь__Эхлэх/Дуусах`
 *    · `geree_*` · `bodit_*`) «Хуваарь»-д харагдахын тулд ЗӨВХӨН опт-ин үед нэг
 *    блок болж ордог. Гурван гэрээ: (а) анхдагч дуудалт ХЭВЭЭР хоосон;
 *    (б) опт-ин үед нэрүүд яг мөрийн баганад буудаг (`applyUpdates`-ийн бичих
 *    нэр); (в) блоктой багцад опт-ин ч ЮУ Ч өөрчлөхгүй. Хиймэл талбарын
 *    жагсаалт — амьд `Bagts_5_1`-ийн 2026-09-23-ны бүтцээс. */
{
  const { resolveSchema, SYNTHETIC_BLOCK } = await import('./bagts.pkg.ts');
  const F = (name, type) => ({ name, type });
  const blokgui = [
    F('ObjectID', 'esriFieldTypeOID'), F('F_', 'esriFieldTypeString'), F('Ажил', 'esriFieldTypeString'),
    F('Хувийн_жин', 'esriFieldTypeDouble'), F('Обьём', 'esriFieldTypeDouble'),
    F('Нэгж_өртөг', 'esriFieldTypeDouble'), F('Мөнгөн_дүн', 'esriFieldTypeDouble'),
    F('Төлөвлөгөөт_гүйцэтгэл', 'esriFieldTypeDouble'), F('Төлөвлөгөөт_гүйцэтгэл1', 'esriFieldTypeDouble'),
    F('Ажил_гүйцэтгэл', 'esriFieldTypeDouble'),
    F('Төлөвлөгөөт_хуваарь__Эхлэх', 'esriFieldTypeDate'), F('Төлөвлөгөөт_хуваарь__Дуусах', 'esriFieldTypeDate'),
    F('geree_ehleh', 'esriFieldTypeDate'), F('geree_duusah', 'esriFieldTypeDate'),
    F('bodit_ehleh', 'esriFieldTypeDate'), F('bodit_duusah', 'esriFieldTypeDate'),
    F('Инженерийн_төлөвлөсөн_обьём', 'esriFieldTypeDouble'),
    F('hun_huch', 'esriFieldTypeInteger'), F('mashin_mehanizm', 'esriFieldTypeInteger'),
    F('gun', 'esriFieldTypeSmallInteger'), F('des_dugaar', 'esriFieldTypeInteger'), F('hamaaral', 'esriFieldTypeString'),
    F('buglusun_ognoo', 'esriFieldTypeDate'), F('Шинэчлэгдсэн_огноо', 'esriFieldTypeDate'),
  ];

  /* (а) анхдагч — ХООСОН хэвээр (sheetRows · planProgress · negtgel · ipc зам).
     ⚠️ 2026-10-09: FillNew · hyanalt* · ajilApply · ulsiinKomiss нь `fillSchema` (§5) */
  const plain = resolveSchema(blokgui);
  assert.equal(plain.synthetic, false, 'анхдагч дуудалтад synthetic = false');
  assert.equal(plain.bld.length, 0, 'анхдагч дуудалтад блок ХООСОН — FillNew блокийн багана зурах ёсгүй');
  assert.equal(plain.start.length, 0);
  assert.equal(plain.aStart.length, 0);
  assert.equal(plain.f.plannedVol, 'Инженерийн_төлөвлөсөн_обьём');
  assert.equal(plain.f.hunHuch, 'hun_huch');

  /* (б) опт-ин — нэг блок, мөрийн баганын ЯГ нэр */
  const syn = resolveSchema(blokgui, { synthetic: true });
  assert.equal(syn.synthetic, true);
  assert.deepEqual(syn.bld, [SYNTHETIC_BLOCK], 'синтетик блок ганц');
  assert.deepEqual(syn.start, ['Төлөвлөгөөт_хуваарь__Эхлэх']);
  assert.deepEqual(syn.end, ['Төлөвлөгөөт_хуваарь__Дуусах']);
  assert.deepEqual(syn.gStart, ['geree_ehleh']);
  assert.deepEqual(syn.gEnd, ['geree_duusah']);
  assert.deepEqual(syn.aStart, ['bodit_ehleh']);
  assert.deepEqual(syn.aEnd, ['bodit_duusah']);
  assert.deepEqual(syn.act, ['Ажил_гүйцэтгэл'], 'бодит гүйцэтгэл — мөрийн НЭГ багана');
  assert.deepEqual(syn.plan, ['Төлөвлөгөөт_гүйцэтгэл'], 'төлөвлөгөөт — `…1` биш эхнийх');
  assert.deepEqual(syn.obyem, [null], 'блокийн обьёмын багана АЛГА — `null`');
  assert.equal(syn.f.plannedVol, 'Инженерийн_төлөвлөсөн_обьём', 'мөрийн plannedVol хөндөгдөөгүй');
  /* Огнооны багана нэг ч байхгүй бол синтетик үүсгэхгүй */
  const noDates = resolveSchema(blokgui.filter((x) => x.type !== 'esriFieldTypeDate' || /ognoo|огноо/i.test(x.name)), { synthetic: true });
  assert.equal(noDates.synthetic, false, 'огнооны баганагүй бол синтетик ҮГҮЙ');
  assert.equal(noDates.bld.length, 0);

  /* (в) блоктой багц — опт-ин ч ЮУ Ч өөрчлөхгүй */
  const bloktoi = [
    ...blokgui.filter((x) => !/^(geree|bodit)_|хуваарь/.test(x.name)),
    F('F5_1_гүйцэтгэл', 'esriFieldTypeDouble'), F('F5_1_төлөвлөгөөт', 'esriFieldTypeDouble'),
    F('F5_1_obyem', 'esriFieldTypeDouble'),
    F('F5_1_барилга_Эхлэх', 'esriFieldTypeDate'), F('F5_1_барилга_Дуусах', 'esriFieldTypeDate'),
    F('F5_1_geree_ehleh', 'esriFieldTypeDate'), F('F5_1_geree_duusah', 'esriFieldTypeDate'),
    F('F5_1_bodit_ehleh', 'esriFieldTypeDate'), F('F5_1_bodit_duusah', 'esriFieldTypeDate'),
    F('F5_2_гүйцэтгэл', 'esriFieldTypeDouble'), F('F5_2_төлөвлөгөөт', 'esriFieldTypeDouble'),
    F('geree_ehleh', 'esriFieldTypeDate'), F('geree_duusah', 'esriFieldTypeDate'),
  ];
  const a = resolveSchema(bloktoi);
  const b = resolveSchema(bloktoi, { synthetic: true });
  assert.equal(b.synthetic, false, 'блоктой багцад synthetic хэзээ ч true биш');
  assert.deepEqual(a, b, 'блоктой багцад опт-ин нь бүдүүвчийг ӨӨРЧЛӨХГҮЙ');
  assert.deepEqual(a.bld, ['5/1', '5/2']);
  assert.deepEqual(a.gStart, ['F5_1_geree_ehleh', null], 'мөрийн geree_ehleh блокт наалдахгүй');
}
console.log('✅ синтетик блок — анхдагч хоосон · опт-ин мөрийн нэрээр · блоктойд нөлөөгүй');

/* ══════════ 5. БӨГЛӨХ БҮДҮҮВЧ — `fillSchema` / `{ fill: true }` (2026-10-09) ══════════
 * ⚠️ 2026-10-09: блокгүй 8 багц бөглөгддөг болов — синтетик НЭГ блокийн оролт нь барилгын
 *    блоктой ижил ОБЬЁМЫН НЭМЭЛТ (`incCell`), хуримтлал нь `obyem_sum`, гүйцэтгэл нь
 *    `Ажил_гүйцэтгэл` = obyem_sum ÷ Обьём. Excel-ийн (`Багц_6_1_final.xlsx` · `*_publish`)
 *    томъёо: навч E = C×J, J = L, I = M; бүлэг L/M = SUMPRODUCT(C, хүүхэд), E = C×ΣE;
 *    K = IF(I=0,0,J/I). Энэ хэсэг нь (а) талбарын зураглал, (б) жижиг мод дээрх roll-up,
 *    (в) нэмэлт/түгжээ, (г) архивын жааз (`buildFrame`) ба илгээлтийн давхарлалт
 *    (`overlaySubmission`), (д) блоктой багц ХӨНДӨГДӨӨГҮЙ гэдгийг барина. Сүлжээгүй. */
{
  const { resolveSchema, SYNTHETIC_BLOCK } = await import('./bagts.pkg.ts');
  const { planAt, synNoVol } = await import('./bagtsSheet.ts');
  const { buildFrame, overlaySubmission } = await import('./sheetFrame.ts');
  const F = (name, type = 'esriFieldTypeDouble') => ({ name, type });
  /* Амьд `Bagts_6_1`-ийн мөрийн баганууд (Excel `6_1_final_publish`-ийн C…P + латин) */
  const fields6 = [
    F('ObjectID', 'esriFieldTypeOID'), F('F_', 'esriFieldTypeString'), F('Ажил', 'esriFieldTypeString'),
    F('Хувийн_жин'), F('Хувийн_жин1'), F('Хувийн_жин__Одоо_байгаа'), F('Обьём'), F('Нэгж_өртөг'), F('Мөнгөн_дүн'),
    F('Төлөвлөгөөт_гүйцэтгэл'), F('Бодит_гүйцэтгэл'), F('Төлөвлөгөө_биелэлт'), F('Ажил_гүйцэтгэл'),
    F('Төлөвлөгөөт_гүйцэтгэл1'),
    F('Төлөвлөгөөт_хуваарь__Эхлэх', 'esriFieldTypeDate'), F('Төлөвлөгөөт_хуваарь__Дуусах', 'esriFieldTypeDate'),
    F('Шинэчлэгдсэн_огноо', 'esriFieldTypeDate'), F('buglusun_ognoo', 'esriFieldTypeDate'),
    F('Des_dugaar', 'esriFieldTypeInteger'), F('Hamaaral', 'esriFieldTypeString'), F('Инженерийн_төлөвлөсөн_обьём'),
    F('gun', 'esriFieldTypeSmallInteger'), F('hun_huch', 'esriFieldTypeInteger'), F('mashin_mehanizm', 'esriFieldTypeInteger'),
    F('geree_ehleh', 'esriFieldTypeDate'), F('geree_duusah', 'esriFieldTypeDate'),
    F('bodit_ehleh', 'esriFieldTypeDate'), F('bodit_duusah', 'esriFieldTypeDate'), F('obyem_sum'),
  ];

  /* (а) ЗУРАГЛАЛ */
  const sc = resolveSchema(fields6, { fill: true });
  assert.equal(sc.synthetic, true, 'fill → синтетик блок');
  assert.deepEqual(sc.bld, [SYNTHETIC_BLOCK]);
  assert.deepEqual(sc.obyem, ['obyem_sum'], 'синтетик блокийн обьём = obyem_sum (мөрийн хуримтлал)');
  assert.deepEqual(sc.act, ['Ажил_гүйцэтгэл'], 'синтетик блокийн гүйцэтгэл = Ажил_гүйцэтгэл (Excel L)');
  assert.deepEqual(sc.plan, ['Төлөвлөгөөт_гүйцэтгэл1'], 'синтетик блокийн төлөвлөгөө = Excel M');
  assert.deepEqual(sc.start, ['Төлөвлөгөөт_хуваарь__Эхлэх']);
  assert.deepEqual(sc.end, ['Төлөвлөгөөт_хуваарь__Дуусах']);
  assert.equal(sc.f.obyemSum, 'obyem_sum');
  assert.equal(sc.f.act, 'Бодит_гүйцэтгэл', 'J нь тусдаа багана хэвээр');
  assert.equal(sc.f.plan, 'Төлөвлөгөөт_гүйцэтгэл', 'I нь тусдаа багана хэвээр');
  assert.equal(sc.f.wE, 'Хувийн_жин__Одоо_байгаа');
  assert.equal(sc.f.ratio, 'Төлөвлөгөө_биелэлт');
  /* «Хуваарь»-ийн `synthetic` ӨӨРЧЛӨГДӨӨГҮЙ */
  const hv = resolveSchema(fields6, { synthetic: true });
  assert.deepEqual(hv.obyem, [null], '«Хуваарь»-ийн синтетик бүдүүвч обьём бичихгүй хэвээр');
  assert.deepEqual(hv.plan, ['Төлөвлөгөөт_гүйцэтгэл'], '«Хуваарь»-ийн plan хэвээр I');
  /* Огнооны багана алга ч гүйцэтгэл/обьёмын багана байвал fill-д блок үүснэ */
  const noDates6 = resolveSchema(fields6.filter((x) => x.type !== 'esriFieldTypeDate' || /ognoo|огноо/i.test(x.name)), { fill: true });
  assert.equal(noDates6.synthetic, true, 'fill: огноогүй ч Ажил_гүйцэтгэл/obyem_sum байвал блок');
  assert.deepEqual(noDates6.start, [null]);
  /* `Төлөвлөгөөт_гүйцэтгэл1` алга → хуучин I руу унана */
  const noM = resolveSchema(fields6.filter((x) => x.name !== 'Төлөвлөгөөт_гүйцэтгэл1'), { fill: true });
  assert.deepEqual(noM.plan, ['Төлөвлөгөөт_гүйцэтгэл']);

  /* (б) ROLL-UP — Б (үндэс) › Б1 (бүлэг) › A·B·C, Б › D */
  const d = (s) => Date.parse(`${s}T00:00:00Z`);
  const asOf = d('2026-01-06');
  const R = (o) => mkRow({ act: [null], obyem: [null], start: [null], end: [null], gStart: [null], gEnd: [null], aStart: [null], aEnd: [null], ...o });
  const rows = [
    R({ oid: 1, no: 'Б', work: 'БАГЦ 6.1', depth: 0, group: true }),
    R({ oid: 2, no: 'Б1', work: 'РП-ЫН БАРИЛГА', depth: 1, group: true }),
    /* A: хэмжигдсэн 25/100 */
    R({ oid: 3, no: '1', work: 'A', depth: 2, vol: 100, unit: 10, obyem: [25], start: [d('2026-01-01')], end: [d('2026-01-11')] }),
    /* B: хэмжигдээгүй */
    R({ oid: 4, no: '2', work: 'B', depth: 2, vol: 50, unit: 20, start: [d('2026-01-01')], end: [d('2026-01-03')] }),
    /* C: Обьёмгүй (мөнгөн дүнгээр жинтэй) — түгжээтэй, act null */
    R({ oid: 5, no: '3', work: 'C', depth: 2, vol: null, unit: null, money: 500 }),
    /* D: 15/10 = 150% — нүд үнэн (1.5), нэгтгэлд 1 */
    R({ oid: 6, no: '1', work: 'D', depth: 1, vol: 10, unit: 100, obyem: [15], start: [d('2026-01-10')], end: [d('2026-01-20')] }),
  ];
  const hasOb = sc.obyem.map(Boolean);
  const c = computeAll(rows, 1, asOf, {}, {}, hasOb, undefined, 'inc', sc.synthetic);
  const near = (x, y, m) => assert.ok(x != null && Math.abs(x - y) < 1e-12, `${m}: ${x} ≠ ${y}`);
  /* H / C */
  assert.equal(c[1].H, 2500); assert.equal(c[0].H, 3500);
  near(c[2].C, 0.4, 'C(A)'); near(c[4].C, 0.2, 'C(C)'); near(c[1].C, 2500 / 3500, 'C(Б1)');
  /* Навч: act = obyem_sum ÷ Обьём */
  near(c[2].act[0], 0.25, 'A act = 25/100');
  assert.equal(c[2].obyemSum, 25, 'obyemSum = синтетик блокийн обьём');
  assert.equal(c[3].act[0], null, 'B хэмжигдээгүй → null (0 БИШ)');
  assert.equal(c[3].J, null); assert.equal(c[3].E, null);
  assert.equal(c[4].act[0], null, 'C Обьёмгүй → null');
  near(c[5].act[0], 1.5, 'D нүд нь түүхий 150%'); assert.equal(c[5].actAgg[0], 1, 'D нэгтгэлд 1-ээр таслагдана');
  assert.equal(c[5].actOver[0], true);
  /* J = L (таслагдсан), I = M, E = C×J, K = J/I */
  near(c[2].J, 0.25, 'J(A) = L');
  near(c[2].E, 0.4 * 0.25, 'E(A) = C×J');
  near(c[2].plan[0], planAt(asOf, d('2026-01-01'), d('2026-01-11')), 'M(A) хуваарийн огноогоор');
  near(c[2].I, c[2].plan[0], 'I(A) = M');
  near(c[2].K, c[2].J / c[2].I, 'K(A) = J/I');
  /* Бүлэг Б1: L = SUMPRODUCT(C, L) = 0.4·0.25 + 0.4·0 + 0.2·0 */
  near(c[1].act[0], 0.1, 'Б1 L = SUMPRODUCT(C, L)');
  near(c[1].J, 0.1, 'Б1 J = L');
  near(c[1].plan[0], 0.4 * c[2].plan[0] + 0.4 * c[3].plan[0] + 0.2 * 0, 'Б1 M = SUMPRODUCT(C, M)');
  near(c[1].E, (2500 / 3500) * (0.4 * 0.25), 'Б1 E = C × ΣE');
  /* Үндэс Б: L = C(Б1)·L(Б1) + C(D)·min(L(D),1) */
  near(c[0].act[0], (2500 / 3500) * 0.1 + (1000 / 3500) * 1, 'Б L = SUMPRODUCT(C, L) (хүүхэд ≤ 1)');
  near(c[0].J, c[0].act[0], 'Б J = L');
  near(c[0].I, c[0].plan[0], 'Б I = M');
  near(c[0].K, c[0].J / c[0].I, 'Б K = J/I');
  near(c[0].E, 1 * (c[1].E + c[5].E), 'Б E = C × ΣE');
  /* Юу ч хэмжигдээгүй мод → бүлэг/үндэс null */
  const none = computeAll(rows.map((r) => ({ ...r, obyem: [null] })), 1, asOf, {}, {}, hasOb, undefined, 'inc', sc.synthetic);
  assert.equal(none[0].act[0], null, 'хэмжилтгүй бол Б-ийн L null (0 БИШ)');
  assert.equal(none[0].J, null); assert.equal(none[0].E, null); assert.equal(none[0].K, null);
  assert.equal(none[1].J, null, 'Б1 J null');
  assert.notEqual(none[0].I, null, 'төлөвлөгөө (I) нь хэмжилтээс үл хамаарна');
  /* `synthetic` туггүй (барилгын дүрэм) — хоосон блок = 0 хэвээр (§2-ийн «J = 0») */
  const bld1 = computeAll(rows, 1, asOf, {}, {}, hasOb, undefined, 'inc');
  assert.equal(bld1[3].J, 0, 'туггүй бол J = AVERAGE(IF(…="",0,…)) = 0 — барилгын зан төлөв ХӨНДӨГДӨӨГҮЙ');

  /* (в) НЭМЭЛТ ба ТҮГЖЭЭ */
  const inc = computeAll(rows, 1, asOf, { '3:0': '10', '6:0': '-15' }, {}, hasOb, undefined, 'inc', sc.synthetic);
  assert.equal(inc[2].obyem[0], 35, 'A: 25 + 10 = 35 (нэмэлт obyem_sum дээр)');
  near(inc[2].act[0], 0.35, 'A act = 35/100');
  assert.equal(inc[5].obyem[0], 0, 'D: 15 − 15 = 0 (залруулга)');
  assert.equal(inc[5].act[0], 0, 'D: 0/10 = 0 — хэмжсэн тэг');
  assert.equal(synNoVol(sc, rows[4]), true, 'Обьёмгүй мөр (C) — нүд түгжээтэй');
  assert.equal(synNoVol(sc, { ...rows[4], vol: 0 }), true, 'Обьём 0 — түгжээтэй');
  assert.equal(synNoVol(sc, { ...rows[4], vol: -3 }), true, 'сөрөг Обьём — түгжээтэй');
  assert.equal(synNoVol(sc, rows[2]), false, 'Обьёмтой мөр — нээлттэй');
  assert.equal(synNoVol(sc, rows[1]), false, 'бүлэг — synNoVol биш (groupAct шалтгаантай)');
  assert.equal(synNoVol(resolveSchema(fields6), rows[4]), false, 'синтетикгүй бүдүүвчид хэзээ ч түгжихгүй');
  /* Түгжигдсэн мөрөнд ямар нэг байдлаар нэмэлт орсон ч хувь бодогдохгүй (null ≠ 0) */
  const leak = computeAll(rows, 1, asOf, { '5:0': '7' }, {}, hasOb, undefined, 'inc', sc.synthetic);
  assert.equal(leak[4].act[0], null, 'Обьёмгүй мөрийн act null хэвээр');

  /* (г) АРХИВЫН ЖААЗ — синтетик блокийн баганууд */
  const fillMs = d('2026-01-06');
  const fr = buildFrame(rows, sc, 1, asOf, hasOb, fillMs);
  assert.equal(fr[2]['Ажил_гүйцэтгэл'], 0.25, 'Ажил_гүйцэтгэл = L');
  assert.equal(fr[2]['obyem_sum'], 25, 'obyem_sum = хуримтлал');
  near(fr[2]['Бодит_гүйцэтгэл'], 0.25, 'Бодит_гүйцэтгэл = J');
  near(fr[2]['Хувийн_жин__Одоо_байгаа'], 0.1, 'E = C×J');
  near(fr[2]['Төлөвлөгөөт_гүйцэтгэл1'], c[2].plan[0], 'Төлөвлөгөөт_гүйцэтгэл1 = M');
  near(fr[2]['Төлөвлөгөөт_гүйцэтгэл'], c[2].I, 'Төлөвлөгөөт_гүйцэтгэл = I');
  assert.equal(fr[5]['Ажил_гүйцэтгэл'], 1, 'архивт таслагдсан (actAgg) — 150% биш');
  assert.equal(fr[5]['obyem_sum'], 15, 'обьём түүхийгээр — түүхий харьцаа сэргээгдэнэ');
  assert.equal(fr[3]['Ажил_гүйцэтгэл'], null, 'хэмжигдээгүй мөр null');
  assert.equal(fr[3]['obyem_sum'], null, 'хэмжигдээгүй мөрийн obyem_sum null (0 БИШ)');
  assert.equal(fr[3]['Бодит_гүйцэтгэл'], null);
  assert.equal(fr[1]['obyem_sum'], null, 'бүлгийн obyem_sum null (нэгж зөрдөг)');
  near(fr[0]['Ажил_гүйцэтгэл'], c[0].act[0], 'Б-ийн L');
  near(fr[0]['Бодит_гүйцэтгэл'], c[0].J, 'Б-ийн J — нэгтгэл (negtgelWrite) үүнийг уншина');
  assert.equal(fr[0]['buglusun_ognoo'], fillMs);
  /* (г2) ИЛГЭЭЛТ — `${oid}:0` нүд мөрөнд буух ёстой (unmoved БИШ) */
  const ov = overlaySubmission(rows, { pkgKey: 'b61', cells: [['3:0', '10']], dates: [], rowKeys: [], mode: 'inc' }, sc, 1);
  assert.equal(ov.unmoved, 0, 'синтетик блокийн нүд unmoved болохгүй');
  assert.deepEqual(ov.cellKeys, ['3:0']);
  assert.equal(ov.rows[2].obyem[0], 35, 'батлахад архивын СҮҮЛИЙН обьём дээр нэмэгдэнэ');
  near(ov.rows[2].act[0], 0.35, 'act = 35/100');
  /* n = 0 (хуучин анхдагч) бүдүүвчээр давхарлавал нүд хаягдана — бүдүүвч НЭГ байх ёстойн шалтгаан */
  const ov0 = overlaySubmission(rows.map((r) => ({ ...r, act: [], obyem: [], start: [], end: [], gStart: [], gEnd: [], aStart: [], aEnd: [] })),
    { pkgKey: 'b61', cells: [['3:0', '10']], dates: [], rowKeys: [], mode: 'inc' }, resolveSchema(fields6), 0);
  assert.equal(ov0.unmoved, 1, 'анхдагч (n = 0) бүдүүвчээр синтетик нүд unmoved — бөглөх/архивлах бүдүүвч зөрвөл батлалт зогсоно');

  /* (д) БЛОКТОЙ багц — fill нь бүдүүвчийг ӨӨРЧЛӨХГҮЙ */
  const bloktoi6 = [
    ...fields6.filter((x) => !/^(geree|bodit)_|хуваарь/.test(x.name)),
    F('F5_1_гүйцэтгэл'), F('F5_1_төлөвлөгөөт'), F('F5_1_obyem'),
    F('F5_1_барилга_Эхлэх', 'esriFieldTypeDate'), F('F5_1_барилга_Дуусах', 'esriFieldTypeDate'),
  ];
  assert.deepEqual(resolveSchema(bloktoi6, { fill: true }), resolveSchema(bloktoi6), 'блоктой багцад fill = анхдагч');
  assert.deepEqual(resolveSchema(bloktoi6, { fill: true }).obyem, ['F5_1_obyem']);
}
console.log('✅ бөглөх бүдүүвч (fill) — obyem→obyem_sum · act→Ажил_гүйцэтгэл · Excel roll-up · түгжээ · жааз · илгээлт · блоктойд нөлөөгүй');

/* ══════════ 6. «БУСАД ТАЛБАР» (2026-10-09) — мөрийн түвшний бүх талбар ил ══════════
 * ⚠️ Хэрэглэгч: «table fieldудыг бүгдийг шалгаж бүх баганыг ил гарга». Бөглөх хүснэгтэд урьд нь
 *    зурагддаггүй талбарууд (`Des_dugaar` · `Hamaaral` · `gun` · `hun_huch` · `mashin_mehanizm` ·
 *    `geree_*` · `bodit_*` · `buglusun_ognoo` · хадгалсан L/M · Editor Tracking) ЗӨВХӨН УНШИХ баганаар.
 *    Гэрээ: (а) `Schema.f` мөрийн түвшний ЯГ нэрийг олно, барилгын блокийн `F…_geree_*`-д ТААРАХГҮЙ;
 *    (б) талбаргүй үйлчилгээнд багана гарахгүй; (в) утга `raw`-аас, null ≠ 0, хувь 0–1. */
{
  const { resolveSchema } = await import('./bagts.pkg.ts');
  const { extraCols, extraVal, readExtraPref, writeExtraPref, extraPrefKey } = await import('./fill/extraCols.ts');
  const F = (name, type = 'esriFieldTypeDouble') => ({ name, type });
  const base = [F('ObjectID', 'esriFieldTypeOID'), F('GlobalID', 'esriFieldTypeGlobalID'), F('F_', 'esriFieldTypeString'),
    F('Ажил', 'esriFieldTypeString'), F('Обьём'), F('Мөнгөн_дүн')];
  const blokgui6 = [...base, F('des_dugaar', 'esriFieldTypeInteger'), F('hamaaral', 'esriFieldTypeString'),
    F('gun', 'esriFieldTypeSmallInteger'), F('hun_huch', 'esriFieldTypeInteger'), F('mashin_mehanizm', 'esriFieldTypeInteger'),
    F('geree_ehleh', 'esriFieldTypeDate'), F('geree_duusah', 'esriFieldTypeDate'), F('bodit_ehleh', 'esriFieldTypeDate'),
    F('bodit_duusah', 'esriFieldTypeDate'), F('buglusun_ognoo', 'esriFieldTypeDate'), F('Ажил_гүйцэтгэл'),
    F('Төлөвлөгөөт_гүйцэтгэл1'), F('CreationDate', 'esriFieldTypeDate'), F('Creator', 'esriFieldTypeString'),
    F('EditDate', 'esriFieldTypeDate'), F('Editor', 'esriFieldTypeString')];
  const sc = resolveSchema(blokgui6, { fill: true });
  assert.equal(sc.f.rowAct, 'Ажил_гүйцэтгэл');
  assert.equal(sc.f.rowPlan1, 'Төлөвлөгөөт_гүйцэтгэл1');
  assert.deepEqual([sc.f.rowGS, sc.f.rowGE, sc.f.rowAS, sc.f.rowAE], ['geree_ehleh', 'geree_duusah', 'bodit_ehleh', 'bodit_duusah']);
  assert.deepEqual([sc.f.created, sc.f.creator, sc.f.edited, sc.f.editor], ['CreationDate', 'Creator', 'EditDate', 'Editor']);
  const cols = extraCols(sc);
  assert.deepEqual(cols.map((c) => c.field), ['des_dugaar', 'hamaaral', 'gun', 'hun_huch', 'mashin_mehanizm', 'geree_ehleh',
    'geree_duusah', 'bodit_ehleh', 'bodit_duusah', 'buglusun_ognoo', 'Ажил_гүйцэтгэл', 'Төлөвлөгөөт_гүйцэтгэл1',
    'CreationDate', 'Creator', 'EditDate', 'Editor'], 'заасан дараалал, ObjectID/GlobalID-гүй');
  assert.ok(cols.every((c) => typeof c.label() === 'string' && c.label().length > 0), 'шошго бүр tr()-ээр');

  /* (а)(б) барилгын: блокийн нэр ТААРАХГҮЙ, мөрийн түвшний талбаргүй бол багана алга */
  const bld = resolveSchema([...base, F('F5_1_гүйцэтгэл'), F('F5_1_obyem'), F('F5_1_geree_ehleh', 'esriFieldTypeDate'),
    F('F5_1_bodit_ehleh', 'esriFieldTypeDate'), F('F5_1_барилга_Эхлэх', 'esriFieldTypeDate')], { fill: true });
  assert.deepEqual([bld.f.rowAct, bld.f.rowGS, bld.f.rowAS, bld.f.created], [null, null, null, null], 'блокийн F…_* мөрийн түвшинд ТААРАХГҮЙ');
  assert.deepEqual(extraCols(bld), [], 'талбаргүй үйлчилгээ — «Бусад талбар» хоосон (товч ч гарахгүй)');
  assert.deepEqual(extraCols(null), []);

  /* (в) утга — `raw`-аас, null ≠ 0 */
  const col = (k) => cols.find((c) => c.key === k);
  const r = (raw) => ({ raw });
  assert.deepEqual(extraVal(col('hun'), r({ hun_huch: 0 })), { text: '0' }, 'хэмжсэн тэг «0»');
  assert.deepEqual(extraVal(col('hun'), r({ hun_huch: null })), { text: '' }, 'null хоосон (0 БИШ)');
  assert.deepEqual(extraVal(col('hun'), r({})), { text: '' }, 'талбар ирээгүй — хоосон');
  assert.equal(extraVal(col('des'), r({ des_dugaar: '1,234' })).text, '1234', 'мөрөн тоо (numLoose)');
  assert.equal(extraVal(col('L'), r({ 'Ажил_гүйцэтгэл': 0.253 })).text, '25.3%', 'хадгалсан L 0–1 → %');
  assert.equal(extraVal(col('M'), r({ 'Төлөвлөгөөт_гүйцэтгэл1': 1 })).text, '100%');
  assert.equal(extraVal(col('M'), r({ 'Төлөвлөгөөт_гүйцэтгэл1': 0 })).text, '0%', 'хадгалсан 0 — «0%» (null биш)');
  assert.equal(extraVal(col('L'), r({ 'Ажил_гүйцэтгэл': null })).text, '', 'L null — хоосон');
  assert.equal(extraVal(col('gS'), r({ geree_ehleh: Date.UTC(2026, 2, 1) })).text, '2026-03-01');
  assert.equal(extraVal(col('fill'), r({ buglusun_ognoo: Date.UTC(2026, 9, 7, 16) })).text, '2026-10-08', 'локал шөнө дунд (UTC+8) → тэр өдөр (normDayMs)');
  assert.deepEqual(extraVal(col('ham'), r({ hamaaral: '  18FS3,22SS-5 ' })), { text: '18FS3,22SS-5', title: '18FS3,22SS-5' });
  assert.equal(extraVal(col('edBy'), r({ Editor: 'tumenjargal.g' })).text, 'tumenjargal.g');
  const st = extraVal(col('cre'), r({ CreationDate: Date.UTC(2026, 9, 8, 3, 7) }));
  assert.match(st.text, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(st.title, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'бүтэн цаг tooltip-д');

  /* Сонголт — localStorage алга/шидэх үед анхдагч АСААЛТТАЙ, унахгүй */
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.equal(readExtraPref(extraPrefKey('a')), true, 'хаалттай localStorage — анхдагч true');
  writeExtraPref(extraPrefKey('a'), false); // шидэхгүй
  const m = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } });
  writeExtraPref(extraPrefKey('a'), false);
  assert.equal(readExtraPref(extraPrefKey('a')), false, 'хэрэглэгч А нуусан');
  assert.equal(readExtraPref(extraPrefKey('b')), true, 'хэрэглэгч Б — өөрийн (анхдагч) сонголт');
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
}
console.log('✅ «Бусад талбар» — мөрийн түвшний бүх талбар · блокийн нэр таарахгүй · null ≠ 0 · хувь 0–1 · сонголт хэрэглэгч тус бүрд');

console.log('\nblokgui.check: ok — блокгүй багц ажиллана, блоктой нь хөндөгдөөгүй');
