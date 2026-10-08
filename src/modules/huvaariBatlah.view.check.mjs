/**
 * «ХУВААРЬ БАТЛАХ» ХАРАГДАЦ — offline эх кодын гэрээ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaariBatlah.view.check.mjs
 *
 * ⚠️ ЯАГААД ЭНЭ ТЕСТ БАЙХ ЁСТОЙ ВЭ (2026-09-16).
 *
 * Батлах дараалал нь ТӨЛӨВЛӨГДСӨН ч ХЭРЭГЖЭЭГҮЙ байсан: `loadAllPending`
 * нь хүлээгдэж буй БҮХ илгээлтийг нэг query-гээр татахаар бичигдсэн,
 * `HEAD_FIELDS` нь түүний төлөө хүнд `payload`-ыг хасдаг — ГЭВЧ бүх `src/`,
 * `tools/`-д НЭГ Ч ДУУДАГЧ БАЙГААГҮЙ. Батлагч багц бүрийг гараар нээж
 * шалгах цорын ганц замтай байсан нь энэ орхигдлын шууд үр дагавар.
 *
 * Тиймээс энэ тест нь ХОЁР зүйлийг барина:
 *   (1) тэр функц ҮНЭХЭЭР дуудагдсаныг — дахин орхигдохоос;
 *   (2) дараалал эх өгөгдөлд БИЧИХГҮЙ гэсэн цөм инвариантыг — «энд ч
 *       баталъя» гэсэн хожмын «сайжруулалт»-аас.
 *
 * ⚠️ Ажиллуулж барих боломжгүй (ArcGIS ба React шаардана) тул ЭХ КОДЫГ
 *    шууд тулгана — `aclParity.check.mjs`-ийн хэв маягаар.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CAP_HOST_VIEW, CAPS, capViewsOf } from '@/lib/caps';
import { VIEW_BY_KEY, HOME_SECTIONS } from '@/lib/services';

const read = (p) => fs.readFileSync(p, 'utf8');
/**
 * ТАЙЛБАРГҮЙ эх код.
 *
 * ⚠️ ЗААВАЛ: доорх шалгуурууд кодын бичилтийг мөрөөр хайдаг бөгөөд энэ
 *    төслийн дүрмээр зассан алдааг ⚠️ тайлбарт дурддаг. Тайлбарыг хасахгүй
 *    бол «`approve: true` энд байна» гэх мэт ХУДАЛ уналт гарна — `aclParity`
 *    бичих үед яг тэр тохиолдсон.
 */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const readCode = (p) => strip(read(p));
/**
 * ⚠️ 2026-09-30: `Huvaari.tsx` нь `src/modules/huvaari/*`-д хуваагдсан (hook · дэд бүрэлдэхүүн ·
 *    цэвэр функц). Эх кодын шалгуурууд хуваарийн БҮХ файлын нийлбэр дээр ажиллана —
 *    `Huvaari.tsx` эхэнд, дараа нь хавтасны файлууд нэрийн дарааллаар (индексийн
 *    харьцуулалт файл дотроо л утгатай).
 */
const HV_FILES = ['src/modules/Huvaari.tsx',
  ...fs.readdirSync('src/modules/huvaari').filter((f) => /\.tsx?$/.test(f)).sort().map((f) => 'src/modules/huvaari/' + f)];
const readHv = () => HV_FILES.map((p) => fs.readFileSync(p, 'utf8')).join('\n');

const VIEW = 'src/modules/HuvaariBatlah.tsx';
const V = readCode(VIEW);
const CAPS_SRC = readCode('src/lib/caps.ts');

/* ══════════ 1. `loadAllPending` ҮНЭХЭЭР дуудагдана ══════════ */
/**
 * ⚠️ Энэ функц 0 дуудагчтай шигдсэн байсан — дахин орхигдож болно.
 * ⚠️ `loadPending(` (НЭГ багцын хувилбар) энд БАЙХ ЁСГҮЙ: түүгээр бол багц
 *    тутам нэг query болж, хэдэн арван дараалсан хүсэлт явна.
 */
{
  assert.match(V, /import\s*\{[^}]*\bloadAllPending\b[^}]*\}\s*from\s*'@\/lib\/huvaariBatlah'/s,
    'HuvaariBatlah: `loadAllPending`-ийг импортлоогүй — дараалал бүх багцыг харахгүй');
  assert.ok(V.includes('loadAllPending()'),
    'HuvaariBatlah: `loadAllPending` дуудагдаагүй — функц дахин орхигдсон');
  assert.ok(!/\bloadPending\s*\(/.test(V),
    'HuvaariBatlah: `loadPending` (нэг багцын) хэрэглэсэн — багц тутам нэг query болно');
}
console.log('✅ loadAllPending — импортлогдож, дуудагдана · loadPending хэрэглээгүй');

/* ══════════ 2. ДАРААЛАЛ ЭХ ӨГӨГДӨЛД БИЧИХГҮЙ ══════════ */
/**
 * ⚠️ БҮХ ДИЗАЙНЫ ЦӨМ ИНВАРИАНТ. Батлах нь `Huvaari.tsx`-д ГУРВАН шаттай
 * гинж (`setApproving` → `useEffect` → `save()` → `applyUpdates()` →
 * `decidePlan(approve: true)`) бөгөөд «бичих зүйлгүй» ба «бичилт унасан»
 * гэсэн хоёр нарийн салаа агуулна. Хожим «энд ч баталъя, нэг товшилт
 * хэмнэнэ» гэж хуулбарлавал тэр салаанууд алдагдаж, хуваарь эх хуудсанд
 * бичигдэлгүй «батлагдсан» болох зам нээгдэнэ.
 *
 * БУЦААХ нь харин зөв: `decidePlan(approve: false)` эх өгөгдөлд юу ч
 * бичдэггүй. Энэ асимметрыг код дээр механикаар тулгана.
 */
{
  assert.ok(!V.includes('applyUpdates'),
    'HuvaariBatlah: `applyUpdates` (эх хуудсанд бичих) энд БАЙХ ЁСГҮЙ — батлах нь Huvaari дээр');
  assert.ok(!/approve:\s*true/.test(V),
    'HuvaariBatlah: `approve: true` энд БАЙХ ЁСГҮЙ — батлах логик хуулбарлагдсан');
  assert.ok(/approve:\s*false/.test(V),
    'HuvaariBatlah: буцаах (`approve: false`) алга — дараалал дээр шийдвэрлэх боломжгүй болсон');
}
console.log('✅ цөм инвариант — дараалал эх өгөгдөлд бичихгүй, зөвхөн буцаана');

/* ══════════ 3. `payload` жагсаалтад БИШ, мөр дэлгэхэд ══════════ */
/**
 * ⚠️ `payload` нь 1,048,576 тэмдэгт. `HEAD_FIELDS` түүнийг санаатай хасдаг;
 *    жагсаалтын түвшинд татвал тэр бүх зорилго үгүй болж хуудас гацна.
 */
{
  assert.ok(V.includes('loadPayload'),
    'HuvaariBatlah: `loadPayload` алга — мөр дэлгэхэд агуулга харагдахгүй');
  /* ⚠️ 2026-10-08: татах зам `ensureDetail`-д (дэлгэх · урьдчилан татах хоёулаа) — `toggle` түүнийг дуудна */
  const i = V.indexOf('const ensureDetail');
  assert.ok(i > 0, 'HuvaariBatlah: агуулга татах `ensureDetail` олдсонгүй');
  assert.ok(V.slice(i, i + 900).includes('loadPayload'),
    'HuvaariBatlah: `loadPayload` нь мөр дэлгэхэд дуудагдахгүй байна — жагсаалт хүндрэнэ');
  const t = V.indexOf('const toggle');
  assert.ok(t > 0 && V.slice(t, t + 300).includes('ensureDetail(oid)'), 'HuvaariBatlah: `toggle` агуулгыг татахгүй байна');
  /* Жагсаалтын түвшинд БҮХ мөрийн payload татагдахгүй — зөвхөн эхний 5 урьдчилан */
  assert.ok(V.includes('todo.slice(0, 5)'), 'HuvaariBatlah: урьдчилан татах эхний 5 мөрөөр хязгаарлагдаагүй');
}
console.log('✅ payload — зөвхөн мөр дэлгэхэд татагдана');

/* ══════════ 4. ӨӨРИЙГӨӨ БАТЛАХ хамгаалалт UI-д ГАРНА ══════════ */
/**
 * ⚠️ `decidePlan` нь өөрийгөө батлахыг ХОЁР давхаргад татгалздаг (дуудагчийн
 *    утга ба СЕРВЕРИЙН мөр). Домэйн дүрэм хэвээр боловч UI нь товч ДАРАХААС
 *    ӨМНӨ хэлэх ёстой — эс бөгөөс батлагч дараад алдаа хүлээж авна.
 * ⚠️ Монгол текстээр БИШ, кодын бүтцээр анкорлоно: үг сольсон нь тестийг
 *    эвдэх ёсгүй.
 */
{
  assert.ok(/const isOwn\s*=/.test(V),
    'HuvaariBatlah: `isOwn` (өөрийн илгээлт) тооцоолол алга');
  assert.ok(/me\s*===\s*x\.author/.test(V),
    'HuvaariBatlah: илгээгчийг одоогийн хэрэглэгчтэй тулгаагүй — өөрийгөө батлах зам харагдана');
  /* Өөрийн илгээлтийн хэсэгт БУЦААХ ч, БАТЛАХ ч дамжуулагдахгүй */
  const i = V.indexOf('own.map(');
  assert.ok(i > 0, 'HuvaariBatlah: өөрийн илгээлтийн хэсэг алга');
  const own = V.slice(i, i + 600);
  assert.ok(!own.includes('onReject='),
    'HuvaariBatlah: өөрийн илгээлтэд буцаах товч дамжуулагдсан');
  assert.ok(!own.includes('onApprove='),
    'HuvaariBatlah: өөрийн илгээлтэд батлах товч дамжуулагдсан');
  assert.ok(own.includes('ownWhy='),
    'HuvaariBatlah: үйлдэл хаалттай байгаагийн ИЛ шалтгаан алга — «эвдэрсэн» гэж ойлгогдоно');
}
console.log('✅ өөрийгөө батлах — тусдаа хэсэг, хоёр товч хаалттай, шалтгаан ил');

/* ══════════ 5. БУЦААХАД ШАЛТГААН ЗААВАЛ (UI-д ч) ══════════ */
/**
 * ⚠️ `decidePlan` нь шалтгаангүй буцаалтыг татгалздаг. UI нь түүнийг
 *    ТУСГАХ ёстой: шалтгаангүй буцаалт нь гүйцэтгэгчид юуг засахыг
 *    хэлэхгүй тул хоосон давталт үүсгэнэ.
 */
{
  assert.ok(/if\s*\(busy\s*\|\|\s*!why\)/.test(V),
    'HuvaariBatlah: буцаах функц шалтгааныг шалгахгүй байна');
  /* 2026-09-29: өөр батлагч түгжсэн бол (`holder`) ч хаалттай */
  assert.ok(/disabled=\{busy\s*\|\|\s*!reason\.trim\(\)\s*\|\|\s*!!holder\}/.test(V),
    'HuvaariBatlah: буцаах товч шалтгаангүйд хаагдахгүй байна');
}
console.log('✅ буцаах — шалтгаан заавал (функц ба товч хоёуланд)');

/* ══════════ 6. БҮРЭН ДАХИН УНШИНА, локал хасалт БИШ ══════════ */
/**
 * ⚠️ Өөр батлагч зуур шийдсэн байж болно (`decidePlan`-ийн хоцролын
 *    хамгаалалт). Локал мутациар дараалал хүснэгтээсээ чимээгүй зөрнө.
 */
{
  const i = V.indexOf('const reject');
  assert.ok(i > 0, 'HuvaariBatlah: `reject` олдсонгүй');
  assert.ok(V.slice(i, i + 1400).includes('reload()'),
    'HuvaariBatlah: буцаасны дараа дахин уншихгүй байна — жагсаалт хүснэгтээсээ зөрнө');
}
console.log('✅ буцаасны дараа — бүтэн дахин уншина');

/* ══════════ 7. CAP_HOST_VIEW МАССИВ · capViewsOf ХАВТГАЙРУУЛНА ══════════ */
/**
 * ⚠️ ХАМГИЙН ХОРТОЙ ЗӨРЧИЛ. `capViewsOf` нь `map` хэрэглэвэл `ViewKey[][]`
 *    буцаана; `new Set` нь массивыг СУУРИАР давхардалгүйжүүлдэг тул юу ч
 *    хасагдахгүй, улмаар `resolveAccess`-ийн `includes` ХЭЗЭЭ Ч таарахгүй
 *    болж БҮХ хүний эрхийн харагдац чимээгүй алга болно.
 * ⚠️ Нэг оролт string, нөгөө нь массив байх ХООРДМОЛ хэлбэрийг ч барина —
 *    амьд объектоор шалгана, зөвхөн эх кодоор биш.
 */
{
  assert.ok(CAPS_SRC.includes('Record<CapKey, ViewKey[]>'),
    'caps.ts: `CAP_HOST_VIEW` нь массив биш — planApprove хоёр харагдац нээж чадахгүй');
  assert.ok(/capViewsOf[\s\S]{0,200}\bflatMap\b/.test(CAPS_SRC),
    'caps.ts: `capViewsOf` нь `flatMap` хэрэглээгүй — ViewKey[][] буцаана');
  assert.ok(!/\.map\(\(c\)\s*=>\s*CAP_HOST_VIEW\[c\]\)/.test(CAPS_SRC),
    'caps.ts: `capViewsOf` дотор `map` хэвээр — эрхийн харагдац бүгд алга болно');
  for (const { key } of CAPS) {
    assert.ok(Array.isArray(CAP_HOST_VIEW[key]),
      `caps.ts: CAP_HOST_VIEW.${key} нь массив биш — хоёрдмол хэлбэр capViewsOf-ыг эвдэнэ`);
    assert.ok(CAP_HOST_VIEW[key].length > 0,
      `caps.ts: CAP_HOST_VIEW.${key} хоосон — эрх нь харагдацгүй, чимээгүй утгагүй`);
  }
  /* Хавтгай `ViewKey[]` буцаадгийг АМЬДААР батална */
  const out = capViewsOf(null);
  assert.ok(Array.isArray(out) && out.every((v) => typeof v === 'string'),
    'caps.ts: `capViewsOf` нь хавтгай ViewKey[] буцаахгүй байна');
}
console.log('✅ CAP_HOST_VIEW массив · capViewsOf хавтгайруулна');

/* ══════════ 8. `planApprove` ХОЁУЛАНГ нээнэ ══════════ */
/**
 * ⚠️ Батлах нь дараалалаас `huvaari` руу ШИЛЖДЭГ тул хоёрын аль нэгийг
 *    хаавал эрх нь ажлаа дуусгах ЗАМГҮЙ болно: дараалал нээгдээд батлах
 *    товч үхсэн байх, эсвэл дараалал огт харагдахгүй.
 * ⚠️ ДАРААЛАЛ ЧУХАЛ: [0] нь «гэр» — батлагчийн байгалийн бууж ирэх газар.
 */
{
  assert.deepEqual(CAP_HOST_VIEW.planApprove, ['huvaariBatlah', 'huvaari'],
    'caps.ts: planApprove нь дараалал БА хуваарь хоёуланг нээх ёстой (дараалалтайгаа)');
  assert.deepEqual(CAP_HOST_VIEW.plan, ['huvaari'],
    'caps.ts: `plan` (төлөвлөх) нь батлах дараалал руу орох ёсгүй');
}
console.log('✅ planApprove — дараалал БА хуваарь хоёулаа');

/* ══════════ 9. ХАРАГДАЦ БҮРЭН БҮРТГЭГДСЭН ══════════ */
/**
 * ⚠️ `services.ts` нь `VIEWS`-д ОРООГҮЙ `ViewKey` нь `VIEW_BY_KEY[key]`
 *    дээр `undefined` болж, навигацид гарахгүй, гүн холбоосоор ч нээгдэхгүй
 *    атлаа эрхийн загварт олгогдож болдог «хий түлхүүр» болсон эвдрэлийг
 *    баримтжуулсан (2026-08-27, `bagts`/`monitor`).
 * ⚠️ `HOME_SECTIONS`-д оруулаагүй бол нүүрт «Бусад хэсэг» болж унана.
 */
{
  const v = VIEW_BY_KEY.huvaariBatlah;
  assert.ok(v, 'services.ts: `huvaariBatlah` нь VIEWS-д бүртгэгдээгүй — хий түлхүүр');
  assert.equal(v.standalone, true,
    'services.ts: `huvaariBatlah` нь standalone байх ёстой — зураг/каталоггүй');
  assert.ok(HOME_SECTIONS.some((g) => g.views.includes('huvaariBatlah')),
    'services.ts: `huvaariBatlah` нь HOME_SECTIONS-д алга — нүүрт «Бусад хэсэг» болж унана');
}
console.log('✅ харагдац — VIEWS · standalone · HOME_SECTIONS');

/* ══════════ 10. БАТЛАХ ШИЛЖИЛТ — санах ойгоор, URL-аар БИШ ══════════ */
/**
 * ⚠️ `writeParams` (urlState.ts) нь ТАНИХГҮЙ түлхүүрийг хөнддөггүй тул
 *    `?approve=<oid>` нь харагдац солиход ч, F5-д ч ҮЛДЭЖ, аль хэдийн
 *    шийдвэрлэгдсэн саналын цонхыг ДАХИН нээх байлаа. `sessionStorage` ч
 *    мөн адил F5-ыг давна.
 * ⚠️ `setView`-ЭЭР шилжинэ (`Schem`-ийн дүрэм): URL-аар тойрвол өмнөх
 *    харагдацын шүүлт үлдэнэ.
 */
{
  /* ⚠️ 2026-09-30: харагдацын бүртгэл `viewRegistry.tsx`-д гарсан — батлах шилжилт тэнд */
  const P = readCode('src/components/Portal.tsx') + '\n' + readCode('src/components/viewRegistry.tsx');
  assert.ok(/const \[planJump, setPlanJump\]\s*=\s*useState/.test(P),
    'Portal: `planJump` санах ойн төлөв алга — батлах шилжилт ажиллахгүй');
  assert.ok(!/approve['"]?\s*:\s*(jump|oid|planJump)/.test(P) && !P.includes("'approve'"),
    'Portal: батлах хүсэлт URL параметрээр дамжиж байна — F5-д цонх дахин нээгдэнэ');
  assert.ok(!/sessionStorage[\s\S]{0,80}(approve|planJump)/.test(P),
    'Portal: батлах хүсэлт sessionStorage-д хадгалагдсан — F5-ыг давна');
  assert.ok(/setPlanJump\([\s\S]{0,120}setView\('huvaari'\)/.test(P),
    'Portal: `setView`-ээр шилжээгүй — өмнөх харагдацын шүүлт үлдэнэ');

  const H = strip(readHv());
  assert.ok(/jump\?:\s*\{\s*pkgKey: string; oid: number\s*\}/.test(H),
    'Huvaari: `jump` prop алга — дараалалаас шилжих зам байхгүй');
  assert.ok(H.includes('onJumpDone'),
    'Huvaari: `onJumpDone` алга — хүсэлт цэвэрлэгдэхгүй, цонх дахин нээгдэнэ');
  /* ⚠️ ХОЁР ШАТ: `pending` хүрэлцэхээс өмнө цонх нээвэл зурагдалтын
     `flowBox === 'decide' && pending` хамгаалалт юу ч зурахгүй. */
  assert.ok(/pending\?\.oid\s*===\s*jump\.oid[\s\S]{0,120}setFlowBox\('decide'\)/.test(H),
    'Huvaari: `pending` тулгалгүйгээр цонх нээж байна — товч дарсан атлаа юу ч болохгүй');
}
console.log('✅ батлах шилжилт — санах ойгоор, setView-ээр, pending тулгасны дараа');

/* ══════════ 11. БҮТЭН ДЭЛГЭЦИЙН ХЯНАЛТ (2026-09-25) ══════════ */
/**
 * Хэрэглэгч: «илгээсний дараа батлах хэсэг тухайн багцын хуваарийг бүхэлд нь,
 * Хуваарь хэсэгт харж байгаа шиг харж батална; гүйцэтгэлтэй адил алийг нь
 * зөвшөөрсөн, алийг нь зөвшөөрөөгүйг гүйцэтгэгч харна».
 *
 * ⚠️ Гурван зүйлийг механикаар барина:
 *   (1) Дараалал ӨӨРИЙН Gantt бичээгүй — `Huvaari`-г `review` горимоор ДАХИН
 *       ашиглана (батлах гинж ганцхан газар — §2-ийн цөм инвариант хэвээр).
 *   (2) «Батлах» нь БҮХ өөрчлөгдсөн мөр ногоон болтол хаалттай (`allOk`) —
 *       эс бөгөөс мөр тус бүрийн хяналт утгагүй.
 *   (3) Буцаахад зөвшөөрсөн мөрүүд `okRows`-оор ХАДГАЛАГДАНА — эс бөгөөс
 *       гүйцэтгэгч улаан/ногоон харахгүй.
 */
{
  const V = readCode(VIEW);
  assert.ok(/<Huvaari[\s\S]{0,80}review=/.test(V),
    'HuvaariBatlah: `<Huvaari review>` алга — хуваарь бүтэн дэлгэцээр харагдахгүй');
  assert.ok(!V.includes('plLanes') && !V.includes('propagate('),
    'HuvaariBatlah: өөрийн Gantt бичигдсэн — `Huvaari`-г дахин ашиглах ёстой');

  const H = strip(readHv());
  assert.ok(/review\?:\s*HuvaariReview/.test(H), 'Huvaari: `review` prop алга');
  /* Засвар хаалттай: canEdit нь review-д худал */
  assert.ok(/const canEdit = useMemo\(\s*\(\)\s*=>\s*!review\s*&&/.test(H),
    'Huvaari: хяналтын горимд засвар хаагдаагүй (`canEdit`)');
  /* Батлах товч allOk-оор хаалттай */
  const b0 = H.indexOf('{review && (');
  const bar = b0 > 0 ? H.slice(b0, H.indexOf('</header>', b0)) : '';
  assert.ok(/!allOk/.test(bar) && /decide\(true/.test(bar),
    'Huvaari: хяналтын «Батлах» нь бүх мөр ногоон болохыг шаардахгүй байна');
  assert.ok(/isOwnSubmission/.test(bar), 'Huvaari: хяналтад өөрийн илгээлтийн хамгаалалт алга');
  /* Буцаахад okRows дамжина */
  assert.ok(/decidePlan\(\{[\s\S]{0,260}okRows:\s*okList/.test(H),
    'Huvaari: буцаахад зөвшөөрсөн мөр `decidePlan`-д дамжихгүй');
  assert.ok(/const rejectReview[\s\S]{0,900}decide\(false,[\s\S]{0,80}okRows\.has/.test(H),
    'Huvaari: хяналтын буцаалт зөвшөөрсөн мөрийг дамжуулахгүй');
  /* 2026-09-29 аудит: хяналтын горимоос ГАДУУРХ «Шийдвэрлэх → Буцаах» ч тэмдэг дамжуулна */
  assert.ok(/onReject=\{\(txt\) => void decide\(false, txt, previewing \? reviewOids\.filter\(\(o\) => okRows\.has\(o\)\)/.test(H),
    'Huvaari: FlowBox-ын буцаалт урьдчилан харсан тэмдэглэгээг хаяж байна');
  /* 2026-09-29 аудит: буцаалт · илгээлт солигдох · батлалтын дараа `okRows` цэвэрлэгдэнэ */
  assert.ok((H.match(/setOkRows\(new Set\(\)\)/g) ?? []).length >= 7,
    'Huvaari: `okRows` буцаалт/илгээлт солигдолт/батлалтын дараа цэвэрлэгдэхгүй — өмнөх ногоон дараагийн илгээлтэд үлдэнэ');
  /* 2026-09-29 аудит: `refreshFlow`-ийн catch ижил багцын pending-ийг ҮЛДЭЭНЭ (fail-open биш) */
  {
    const c0 = H.indexOf('const refreshFlow = useCallback');
    const c1 = H.indexOf('useEffect(() => { void refreshFlow(); }', c0);
    const rf = H.slice(c0, c1);
    /* ⚠️ 2026-10-01: `catch (e)` — алдааг ангилж бичнэ (friendlyError) */
    const cat = rf.slice(rf.lastIndexOf('} catch'));
    assert.ok(!/setPending\(null\)/.test(cat) && /setPending\(\(p0\) => \(p0 && p0\.pkgKey === key \? p0 : null\)\)/.test(cat),
      'Huvaari.refreshFlow: сүлжээний алдаанд pending=null → түгжээ тайлагдана');
  }
  /* 2026-09-29 аудит: `previewing` нь `decidePlan` АМЖИЛТТАЙ болсны дараа л тайлагдана */
  /* ⚠️ 2026-10-01: амжилттай салаанд `partialRef` арилгах мөр нэмэгдсэн — хоёр хэлбэрийг таньна */
  assert.ok(/if \(r\.ok\) \{\s*setPreviewing\(false\); setOkRows\(new Set\(\)\);/.test(H)
    && /\} else \{\s*(?:if \(partialRef\.current === oid\) partialRef\.current = null;\s*)?setPreviewing\(false\);\s*setOkRows\(new Set\(\)\);\s*setNote\(tr\('Хуваарь батлагдаж/.test(H),
    'Huvaari: батлалт унахад previewing тайлагдаж хяналтын товчнууд идэвхгүй үлдэнэ');
  /* Гүйцэтгэгчийн тал — буцаагдсаныг ноорогт буулгаж тэмдэглэнэ */
  assert.ok(/if \(back && ap\.ok && lastDecision\.okRows\) \{\s*setBackMarks\(/.test(H),
    'Huvaari: буцаагдсан саналын улаан/ногоон тэмдэглэгээ тавигдахгүй');
  /* 2026-09-25 #2: тэмдэг `lastDecision`-оос (дахин ачаалалт/хамт ажиллагч) үүснэ */
  assert.ok(/loadPayload\(d\.oid\)[\s\S]{0,160}setBackMarks\(\{ oid: d\.oid/.test(H),
    'Huvaari: буцаасан тэмдэглэгээ зөвхөн санах ойд — дахин ачаалахад алга болно');
  /* 2026-09-25 #3: тэмдэг саналын утгатай ИЖИЛ мөрд л */
  assert.ok(/if \(backOn\) return backMarkMap\.get\(r\.oid\)/.test(H) && /if \(!samePay\(plan\[i\], i\)\) continue;/.test(H),
    'Huvaari: буцаасан тэмдэг гүйцэтгэгчийн одоогийн ноорогтой тулгагдаж байна (саналтай биш)');
  /* Хяналтын эффект preview-ийн ДАРАА (deps нь зурагдалтад уншигдана → TDZ) */
  assert.ok(H.indexOf('const reviewStarted') > H.indexOf('const preview = useCallback'),
    'Huvaari: хяналтын эффект `preview`-ээс ӨМНӨ — TDZ-ээр хуудас унана');

  const L = readCode('src/lib/huvaariBatlah.ts');
  /* Байхгүй талбарыг outFields-д нэрлэвэл БҮХ query унана */
  assert.ok(/okRowsField\(\)\)\s*\?\s*`\$\{HEAD_FIELDS\},\$\{okRowsName\}`/.test(L),
    'huvaariBatlah: `zovshoorson_mor` талбарыг байгаа эсэхийг шалгалгүй уншиж байна');
  /* Талбаргүй ЭСВЭЛ богино талбарт бичвэл `applyEdits` бүхэлдээ унаж буцааж чадахгүй */
  assert.ok(/if \(len > 0 && js\.length <= len\) attrs\[okRowsName\]/.test(L),
    'huvaariBatlah: `zovshoorson_mor`-г талбар/уртыг шалгалгүй бичиж байна — шийдвэр унана');
  /* «Алга»-г кэшлэвэл талбар нэмсний дараа ч сешн даяар алга гэж үргэлжилнэ */
  assert.ok(/if \(len > 0\) \{ okRowsLenCache = len;/.test(L),
    'huvaariBatlah: талбар «алга» гэсэн хариуг кэшилж байна');
  /* 2026-09-25 #9: «алга»-г зөвхөн богино TTL-ээр; нэрийг том/жижиг үл харгалзан уншина */
  assert.ok(/Date\.now\(\) - okRowsMissAt < OK_ROWS_MISS_TTL/.test(L) && /okRows: parseOkRows\(okRowsAttr\(a\)\)/.test(L),
    'huvaariBatlah: «талбар алга» TTL-гүй эсвэл okRows нэрийн том/жижгээр уншигдахгүй');
  /* Батлах явцад Esc хаахгүй — хагас батлалт */
  /* 2026-09-30: зурагдалтын дунд `ref.current = …` бичихээ больж `useLatest` болов — утга ижил */
  assert.ok(/escBlockRef = useLatest\(busy \|\| approving != null\)/.test(H),
    'Huvaari: батлах явцад Esc хяналтыг хаана — эх хуудас бичигдээд илгээлт pending үлдэнэ');
  /* flowReady нь pending-тэй НЭГ зурагдалтад — «аль хэдийн шийдвэрлэгдсэн» худал алдаа */
  const rf = H.slice(H.indexOf('const refreshFlow = useCallback'), H.indexOf('useEffect(() => { void refreshFlow(); }'));
  /* ⚠️ 2026-10-08: түгжээ төрөл тус бүрд — `loadPending(pkg.key, kind)` */
  assert.ok(rf.indexOf('loadPending(pkg.key, kind)') > 0 && rf.indexOf('setFlowReady(true)') > rf.indexOf('loadPending(pkg.key, kind)'),
    'Huvaari: `flowReady=true` нь `loadPending`-ээс ӨМНӨ — хяналт хүлээгдэж буйг шийдвэрлэгдсэн гэж андуурна');
}
console.log('✅ бүтэн дэлгэцийн хяналт — Huvaari дахин ашиглана · бүгд ногоон · okRows хадгална');

/* ══════════ БУЦААГДСАН САНАЛ АВТОМАТААР НООРОГТ (2026-09-29) ══════════
 * Хэрэглэгч: «хуваарь төлөвлөөд явуулаад буцаасан тохиолдолд төлөвлөсөн хуваарь алга
 * болж байна». Урьд нь зөвхөн жижиг товчоор л буцдаг байв. */
{
  const H = readHv();
  assert.ok(/void restoreWithdrawn\(true\);/.test(H), 'Huvaari: буцаагдсан саналын автомат буулгалт алга');
  const i = H.indexOf('const autoBackRef = useRef');
  const body = H.slice(i, H.indexOf('void restoreWithdrawn(true);', i));
  assert.ok(i > 0 && /dirtyN > 0/.test(body) && /!canEdit/.test(body) && /pending/.test(body),
    'Huvaari: автомат буулгалт ноорогтой/эрхгүй/хүлээгдэж буй үед хаагдаагүй');
  assert.ok(/hdReadyKey !== hdKey\(kind, pkg\.key\)/.test(body),
    'Huvaari: автомат буулгалт хуваалцсан нооргийн сэргээлтийг хүлээхгүй — хамтрагчийн ноорогтой давхарлана');
  assert.ok(/\.author[\s\S]{0,60}!== me/.test(body), 'Huvaari: автомат буулгалт зөвхөн зохиогчид биш');
  assert.ok(/backSeenGet\(pkg\.key, kind\) === d\.oid/.test(body), 'Huvaari: хаясан нооргийг нээх бүрд дахин буулгана');
  /* Санал ажлын кодоор одоогийн жааз руу зөөгдөнө */
  assert.ok(/const p = remapPayload\(p0, curRows\)\.pay;/.test(H), 'Huvaari: applyPayloadToDraft саналын oid-ыг зөөхгүй');
  assert.ok(/keys\[String\(oid\)\] = des;/.test(H), 'Huvaari: илгээлтэд мөрийн тогтвортой түлхүүр (keys) бичигдэхгүй');
}
console.log('✅ буцаагдсан санал — автоматаар ноорогт · кодоор зөөнө');

/* ══════════ 2026-09-29-ний хэрэглэгчийн 7 засвар — механик хамгаалалт ══════════ */
{
  const H = readHv();
  const V = read('src/modules/HuvaariBatlah.tsx');
  /* 1. Хүлээгдэж буй нэмэлт ажлыг засах — татахгүй, ижил илгээлтийг шинэчилнэ */
  assert.ok(/const saveAjilEdit = useCallback[\s\S]{0,700}updateAjil\(\{ oid: ajSub\.oid/.test(H),
    'Huvaari: нэмэлт ажлын засвар `updateAjil`-аар хадгалагдахгүй');
  {
    const i = H.indexOf('const editAjilHere = useCallback');
    const body = H.slice(i, H.indexOf('const saveAjilEdit = useCallback', i));
    assert.ok(i > 0 && !/withdrawAjil\(/.test(body), 'Huvaari: засахад илгээлт татагдаж байна — `pending` хэвээр байх ёстой');
  }
  assert.ok(/if \(ajSub && ajSub\.oid === ajEdit\.oid\) return;/.test(H) && /ajSubFor !== pkg\.key/.test(H),
    'Huvaari: илгээлт шийдэгдсэн үед засварын хуулбар хасагдахгүй — давхар мөр үүснэ');
  /* 2. Ерөнхий олон блок — цонх урьдчилан сонгосон нээгдэнэ */
  assert.ok(/initSel=\{gBlks\}/.test(H) && /new Set\(\[blk, \.\.\.\(initSel \?\? \[\]\)\.values\(\)\]/.test(H),
    'Huvaari: ерөнхий олон блокийн сонголт ажлын цонхонд дамжихгүй');
  /* 3. Бодит огноо сонгосон БҮХ блокт */
  assert.ok(/applyExtra\(modalRow\.oid, actBlks, actual, res\);/.test(H), 'Huvaari: бодит огноо зөвхөн идэвхтэй блокт орж байна');
  assert.ok(/const actDirty = actTouched && \[\.\.\.selB\]\.some\(/.test(H), 'Huvaari: бодит огнооны өөрчлөлт зөвхөн идэвхтэй блокоор шийдэгдэж байна');
  /* ⚠️ 2026-09-29 (аудит 10): талбарыг ХӨНДӨӨГҮЙ бол бусад сонгосон блокийн бодит огноог дарахгүй */
  assert.ok(/setActTouched\(true\)/.test(H), 'Huvaari: бодит огнооны талбарыг хөндсөн тэмдэг алга — бусад блокийн бодит огноо арчигдана');
  /* 5. Сольж харах — шийдвэр гаргаж чадах батлагчид ГАРАХГҮЙ (strict бус харалтаас батлах зам хаалттай) */
  assert.ok(/\{\(!canApprove \|\| isOwnSubmission\) && approving == null && \(\s*<span className=\{h\.tlZoom\}/.test(H),
    'Huvaari: сольж харах товч батлагчид ч гарч байна — strict бус харалтаас батлагдаж болно');
  assert.ok(/const viewSent = useCallback[\s\S]{0,900}applyPayloadToDraft\(p0, srv\.rows, false/.test(H), 'Huvaari: `viewSent` алга');
  /* 7. Буцаасан шалтгаан — «Хуваарь батлах» хуудсанд зохиогчид; хуудсанд 30 с тутам шалгана */
  assert.ok(/loadLastPerPkg\(\)/.test(V) && /x\.status === PLAN_STATUS\.returned/.test(V) && /back\.filter\(isOwn\)/.test(V),
    'HuvaariBatlah: өөрийн буцаагдсан илгээлт шалтгаантайгаа харагдахгүй');
  /* ⚠️ 2026-10-08: түгжээ төрөл тус бүрд — идэвхтэй төрлийнх л (`loadPending(key, kind)`) */
  assert.ok(/void loadPending\(key, kind\)\.then\(\(p\) => \{[\s\S]{0,400}void refreshFlow\(\);/.test(H),
    'Huvaari: хүлээгдэж буй илгээлт шийдэгдсэнийг хуудас өөрөө мэдэхгүй');
}
console.log('✅ 2026-09-29 — нэмэлт ажил засах · олон блок · бодит огноо · сольж харах · буцаасан шалтгаан');

/* ══════════ 2026-09-30: огноогүй санал «эх хуудас аль хэдийн ижил» гэж худал хэлэхгүй ══════════
 * Зөвхөн сарын обьём/уялдаа/бодит огноо засагдсан санал (`spans` хоосон) нь ХЭВИЙН —
 * «эх хуудас аль хэдийн ижил байна» гэвэл батлагч «батлах зүйлгүй» гэж ойлгоно. Тэр
 * хэллэг ЗӨВХӨН бусад өөрчлөлт огт байхгүй үед. */
{
  const V = readCode('src/modules/HuvaariBatlah.tsx');
  assert.ok(/otherN: Object\.keys\(p\.actual\)\.length \+ Object\.keys\(p\.res\)\.length \+ Object\.keys\(p\.obres \?\? \{\}\)\.length/.test(V),
    'HuvaariBatlah: бодит огноо/нөөцийн өөрчлөлт тоологдохгүй');
  assert.ok(/fig\.depsN \|\| fig\.obyemN \|\| fig\.otherN\s*\?\s*tr\('Огнооны өөрчлөлт алга'\)\s*:\s*tr\('Огнооны өөрчлөлт алга — эх хуудас аль хэдийн ижил байна\.'\)/.test(V),
    'HuvaariBatlah: сарын обьёмтой саналд «эх хуудас аль хэдийн ижил» гэж хэлж байна');
}
console.log('✅ 2026-09-30 — огноогүй санал (сарын обьём/уялдаа) «ижил» гэж худал хэлэхгүй');
