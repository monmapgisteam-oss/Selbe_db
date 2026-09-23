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
  const calc = computeAll(rows, 4, null, {}, {}, [], undefined);

  /* J = (0.5 + 0.8 + 0 + 1) / 4 = 0.575 — ГОЛ шалгуур: блокийн ТООНД хуваана */
  assert.equal(calc[0].J, 0.575, 'J нь блокийн ТООНД хуваагдах ёстой (хоосон = 0)');
  /* ⚠️ I нь оролтын `plan` БИШ — огноо/интерполяциас БОДОГДДОГ. Огноогүй
     бэлдэцэд 0 гарах нь зөв; энд чухал нь `null` БИШ гэдэг (блок БАЙГАА). */
  assert.notEqual(calc[0].I, null, 'блок байхад I нь `null` байх ЁСГҮЙ');
  assert.notEqual(calc[0].K, null, 'блок байхад K нь `null` байх ЁСГҮЙ');
  assert.ok(calc[0].E != null, 'E = C×J нь блоктой үед утгатай');

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

  /* (а) анхдагч — ХООСОН хэвээр (FillNew · sheetRows · planProgress · hyanalt* зам) */
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

console.log('\nblokgui.check: ok — блокгүй багц ажиллана, блоктой нь хөндөгдөөгүй');
