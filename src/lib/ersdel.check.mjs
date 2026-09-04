/**
 * ЭРСДЭЛИЙН ЗАГВАРЫН шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ersdel.check.mjs
 *
 * ЮУГ хамгаалж байна вэ:
 *
 *  1. ДЕТЕРМИНИЗМ. Цуваа нь `Math.random()`-гүй байх ёстой — эс бөгөөс график
 *     render бүрд өөрчлөгдөж, «амьд өгөгдөл» мэт хуурамч сэтгэгдэл төрүүлнэ.
 *     Хоёр удаа дуудахад ЯГ ижил тоо гарахыг шалгана.
 *
 *  2. БОДИТ ХЯЗГААР. Утга нь хэмжигдэхүүн тус бүрийн физик боломжит хүрээнд
 *     байх ёстой (pH 6–9, PM2.5 > 0 …). Загварын томьёо эвдэрвэл (тэмдэг
 *     солигдох, нэгж андуурах) энэ шалгуур шууд барина.
 *
 *  3. ФИЗИК ХАМААРАЛ. Түвшин ↑ → урсац ↑ (рейтингийн муруй), доод урсгалд
 *     аммони ↑ (ахуйн бохирдол). Эдгээр нь загварын ГОЛ санаа — алдагдвал
 *     тоонууд «санамсаргүй» болж, мэргэжлийн нүдэнд шууд илэрнэ.
 *
 *  4. АЧИ-ийн хуваарь — EPA-ийн эвдрэлийн цэгүүд.
 *
 *  5. ТҮВШНИЙ ДАРААЛАЛ: 1 нь ХАМГИЙН ХҮНД. Хэрэв хэн нэгэн `FLOOD_LEVELS`-ийг
 *     «1 = хамгийн бага» гэж эргүүлбэл бүх UI худал болно.
 */
import assert from 'node:assert/strict';
import {
  AIR_LEVELS, DAMAGE_RATE, FLOOD_LEVELS, FLOOD_SKIP_IDS, SEVERITY,
  aqiOfPm25, buildMetrics, classOf, gradeOf, hourOf,
} from '@/lib/ersdel';

/** Жишээ харуул — жинхэнэ давхаргын координатын хүрээнд (дээд ба доод урсгал) */
const up = { oid: 12, torol: 'Усны харуул', kind: 'water', name: 'дээд', lon: 106.9161, lat: 47.9727 };
const down = { oid: 5, torol: 'Усны харуул', kind: 'water', name: 'доод', lon: 106.9217, lat: 47.9596 };
const air = { oid: 1, torol: 'Агаарын чанар', kind: 'air', name: 'агаар', lon: 106.9207, lat: 47.9718 };

const NOW = hourOf(Date.UTC(2026, 7, 25, 9));
const get = (st, key) => buildMetrics(st, NOW).find((m) => m.key === key);

/* 1. ДЕТЕРМИНИЗМ */
{
  const a = buildMetrics(down, NOW);
  const b = buildMetrics(down, NOW);
  assert.deepEqual(
    a.map((m) => m.points.map((p) => p.v)),
    b.map((m) => m.points.map((p) => p.v)),
    'цуваа детерминист байх ёстой (Math.random ашиглаж болохгүй)',
  );
  // Цаг солигдоход л өөрчлөгдөнө — минут тутмын tick цувааг хөдөлгөх ёсгүй
  assert.equal(hourOf(NOW + 59_000), NOW, 'нэг цагийн дотор «одоо» тогтвортой');
}

/* 2. БОДИТ ХЯЗГААР */
{
  const range = (st, key, lo, hi) => {
    const m = get(st, key);
    assert.ok(m, `${key} хэмжигдэхүүн олдсонгүй`);
    assert.ok(m.min >= lo && m.max <= hi,
      `${key}: ${m.min.toFixed(2)}…${m.max.toFixed(2)} нь [${lo}, ${hi}] хүрээнээс гарлаа`);
  };
  range(down, 'level', 0.2, 1.4);          // м — үерийн бус горим
  range(down, 'flow', 0.05, 12);           // м³/с
  range(down, 'ph', 6.5, 9);               // MNS 4586-ийн боломжит хүрээ
  range(down, 'do', 2, 12);                // мг/л
  range(down, 'wtemp', 5, 25);             // °C, 8-р сар
  range(down, 'nh4', 0, 2.5);              // мг/л
  range(air, 'pm25', 1, 120);              // µg/м³ — ЗУНЫ горим (өвөл нь таамаглалд)
  range(air, 'wind', 0.2, 5);              // м/с
  range(air, 'aqi', 0, 300);
  // Цувааны урт — 72 цаг
  assert.equal(get(air, 'pm25').points.length, 72, 'цуваа 72 цэгтэй');
}

/* 3. ФИЗИК ХАМААРАЛ */
{
  const lvl = get(down, 'level');
  const flow = get(down, 'flow');
  // Түвшин ХАМГИЙН ИХ байх цагт урсац ч хамгийн их (нэг рейтингийн муруй дээр)
  const iMaxL = lvl.points.reduce((b, p, i, a) => (p.v > a[b].v ? i : b), 0);
  const iMaxQ = flow.points.reduce((b, p, i, a) => (p.v > a[b].v ? i : b), 0);
  assert.equal(iMaxL, iMaxQ, 'түвшний оргил ба урсацын оргил давхцах ёстой');

  // Доод урсгалд ахуйн бохирдол ИЛҮҮ (гэр хорооллын ус нийлдэг)
  assert.ok(get(down, 'nh4').avg > get(up, 'nh4').avg * 2,
    'доод урсгалын аммони дээд урсгалынхаас мэдэгдэхүйц их байх ёстой');
  // Доод урсгалд хүчилтөрөгч БАГА
  assert.ok(get(down, 'do').avg < get(up, 'do').avg,
    'доод урсгалын уусмал хүчилтөрөгч бага байх ёстой');
}

/* 4. АЧИ — EPA-ийн эвдрэлийн цэгүүд */
{
  assert.equal(aqiOfPm25(0), 0);
  assert.equal(aqiOfPm25(9), 50);
  assert.equal(aqiOfPm25(35.4), 100);
  assert.equal(aqiOfPm25(55.4), 150);
  assert.ok(aqiOfPm25(320) > 300, 'өвлийн оргил бохирдол «маш хортой»-гоос дээш');
  // Монотон өсөх — агууламж ихсэхэд индекс буурч болохгүй
  let prev = -1;
  for (let c = 0; c <= 400; c += 5) {
    const a = aqiOfPm25(c);
    assert.ok(a >= prev, `АЧИ ${c} µg/м³ дээр буурлаа`);
    prev = a;
  }
}

/* 5. ТҮВШНИЙ ДАРААЛАЛ — 3 нь ХАМГИЙН ХҮНД
 *
 * ⚠️ 2026-08-29-нд түвшний шаталбар УРВУУЛАГДСАН (feat: түвшний шаталбар):
 * урьд нь 1 = 100 жилийн үер байсныг 1 = хөнгөн (5 жил) → 3 = хүнд (100 жил)
 * болгов — «Анхааруулах» хувилбар 100 жилийн үерээр тооцдог алдааны засвар.
 * Энэ бүлэг тэр ШИНЭ дарааллыг хамгаална: дахин урвуулбал улаан болно. */
{
  assert.ok(FLOOD_LEVELS[3].period > FLOOD_LEVELS[2].period && FLOOD_LEVELS[2].period > FLOOD_LEVELS[1].period, 'үер: 3-р түвшин ховор давтагдана');
  assert.ok(FLOOD_LEVELS[3].peak > FLOOD_LEVELS[2].peak && FLOOD_LEVELS[2].peak > FLOOD_LEVELS[1].peak);
  assert.ok(FLOOD_LEVELS[3].reach > FLOOD_LEVELS[2].reach && FLOOD_LEVELS[2].reach > FLOOD_LEVELS[1].reach);
  assert.ok(FLOOD_LEVELS[3].depth > FLOOD_LEVELS[1].depth);
  assert.ok(FLOOD_LEVELS[3].rain > FLOOD_LEVELS[1].rain);
  // Сэрэмжлүүлэх хугацаа нь ЭСРЭГ: хүнд үер хурдан ирнэ
  assert.ok(FLOOD_LEVELS[3].lead < FLOOD_LEVELS[1].lead, 'хүнд үерийн сэрэмжлүүлэх хугацаа богино');

  assert.ok(AIR_LEVELS[3].pm25 > AIR_LEVELS[2].pm25 && AIR_LEVELS[2].pm25 > AIR_LEVELS[1].pm25);
  // Инверси НАМ болох тусам бохирдол хуримтлагдана — ХҮНД (3) түвшинд хамгийн нам
  assert.ok(AIR_LEVELS[3].inversion < AIR_LEVELS[1].inversion, 'хүнд бохирдолд инверси нам');
  assert.ok(AIR_LEVELS[3].wind < AIR_LEVELS[1].wind, 'хүнд бохирдолд салхи сул');
  assert.ok(SEVERITY[3] > SEVERITY[2] && SEVERITY[2] > SEVERITY[1]);
}

/* 6. ҮНЭЛГЭЭНИЙ ЧИГЛЭЛ — `higherBetter` эргүүлж уншигдахгүй байх */
{
  const doM = get(down, 'do');
  assert.equal(gradeOf(doM, 9), 'ok', 'хүчилтөрөгч их = хэвийн');
  assert.equal(gradeOf(doM, 3), 'bad', 'хүчилтөрөгч бага = хэтэрсэн');
  const nh4 = get(down, 'nh4');
  assert.equal(gradeOf(nh4, 0.1), 'ok');
  assert.equal(gradeOf(nh4, 1.5), 'bad');
}

/* 7. ХОХИРЛЫН АНГИЛАЛ — нэгж үнэ объектын төрөлд тохирч байх
 *
 * ⚠️ Энэ бүлэг нь 2026-08-27-ны БОДИТ алдааг хамгаална: нэгж үнэ зөвхөн
 * геометрийн төрлөөр (талбай/шугам/цэг) тодорхойлогддог байсан тул 1-р
 * түвшний үерийн зурваст орох 2,018 модонд «худаг, тулгуур»-ын 3.4 сая ₮
 * тавигдаж, дан модны хохирол 6.9 ТЭРБУМ ₮ гарч байлаа. */
{
  assert.equal(classOf('et:24', 'area'), 'building', 'Барилга → building');
  assert.equal(classOf('sb:4', 'area'), 'building');
  assert.equal(classOf('et:27', 'area'), 'paved', 'Явган зам → хатуу хучилт');
  assert.equal(classOf('nogoon', 'area'), 'green');
  assert.equal(classOf('sb:0', 'point'), 'tree', 'Мод → модны нэгж үнэ');
  assert.equal(classOf('tgl', 'point'), 'amenity');
  assert.equal(classOf('et:12', 'line'), 'bridge');
  // Тодорхойлогдоогүй — геометрээр
  assert.equal(classOf('огт байхгүй', 'area'), 'paved');
  assert.equal(classOf('огт байхгүй', 'line'), 'pipe');
  assert.equal(classOf('огт байхгүй', 'point'), 'point');

  // Модны нэгж үнэ нь худгийнхаас МЭДЭГДЭХҮЙЦ хямд байх ёстой (алдааны гол цэг)
  assert.ok(DAMAGE_RATE.tree.rate * 10 < DAMAGE_RATE.point.rate,
    'модны нэгж үнэ худаг/тулгуурынхаас дор хаяж 10 дахин хямд');
  // Барилга > хатуу хучилт > ногоон
  assert.ok(DAMAGE_RATE.building.rate > DAMAGE_RATE.paved.rate);
  assert.ok(DAMAGE_RATE.paved.rate > DAMAGE_RATE.green.rate);
  // Нэгжийн төрөл нь ангилалдаа тохирно
  assert.equal(DAMAGE_RATE.building.per, 'm2');
  assert.equal(DAMAGE_RATE.pipe.per, 'm');
  assert.equal(DAMAGE_RATE.tree.per, 'ea');

  // Гол нь үерийн ХОХИРОГЧ биш (зурвас нь голоос үүсдэг)
  assert.ok(FLOOD_SKIP_IDS.has('sb:16'), 'гол үерийн тооцооноос хасагдана');
}

console.log('ersdel.check: OK');
