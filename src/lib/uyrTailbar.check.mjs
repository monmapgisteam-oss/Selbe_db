/**
 * «ЯАГААД ЭНД ҮЕРЛЭВ» — регрессийн шалгалт.
 *
 * ⚠️ Юуг барих гэсэн юм бэ:
 *   1. ХОНХОР ба ӨНДӨРЛӨГ хоёрыг ялгах (рельефийн тэмдэг)
 *   2. Голын СУВГИЙГ энгийн хонхроос ялгах (хоёр талын эрэг)
 *   3. Усны зам нь урсгалын ЧИГЛЭЛД явах (дээш ↔ доош эсрэг)
 */
import assert from 'node:assert/strict';
import { whyFlood, flowPath } from '@/lib/uyrTailbar';

const W = 40;
const H = 40;
const P = W * H;
const ter = new Float32Array(P);
const dep = new Float32Array(P);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    /* Урагш налуу тал; дунд нь ХОЁР ТАЛТАЙ суваг (x = 20) */
    ter[i] = 100 - y * 0.2 + (Math.abs(x - 20) <= 1 ? -2 : 0);
    dep[i] = Math.abs(x - 20) <= 2 ? 1 : 0;
  }
}
/* Тусдаа ХОНХОР — сувгаас хол, нэг талдаа эрэггүй (бүх талаараа өндөр) */
const hole = 10 * W + 8;
ter[hole] -= 1.5;
dep[hole] = 0.5;

const fd = {
  meta: {
    width: W, height: H, slices: 1, wkid: 102100, wetM: 0.05, cellM: 10,
    extent: { xmin: 0, ymin: 0, xmax: 400, ymax: 400 },
  },
  depth: (_s, i) => dep[i],
  speed: () => 0.5,
  terrain: (i) => ter[i],
  /* Урсгал УРАГШ (v < 0) */
  u: () => 0,
  v: () => -0.8,
};

/* 1. Суваг */
const ch = whyFlood(fd, 0, 20 * W + 20);
assert.ok(ch, 'суваг дээр тайлбар гарсангүй');
assert.equal(ch.channel, true, 'сувгийг таньсангүй');
assert.ok(ch.reliefM > 0.5, `сувгийн рельеф буруу: ${ch.reliefM}`);

/* 2. Хонхор — суваг БИШ */
const hl = whyFlood(fd, 0, hole);
assert.equal(hl.channel, false, 'хонхрыг суваг гэж андуурлаа');
assert.ok(hl.reliefM > 0.3, `хонхрын рельеф буруу: ${hl.reliefM}`);

/* 3. Өндөрлөг — рельеф СӨРӨГ */
const hi = whyFlood(fd, 0, 30 * W + 5);
assert.ok(hi.reliefM < 0.3, `тэгш газарт хонхор олдов: ${hi.reliefM}`);

/* 4. Налуу — 0.2 м / 10 м = 2% */
assert.ok(Math.abs(hi.slopePct - 2) < 0.5, `налуу буруу: ${hi.slopePct}`);

/* 5. Зам — дээш ба доош ЭСРЭГ чиглэнэ */
const start = 20 * W + 20;
const up = flowPath(fd, 0, start, true);
const down = flowPath(fd, 0, start, false);
assert.ok(up.length >= 2 && down.length >= 2, 'зам гарсангүй');
/* ⚠️ Урсгал урагш тул ДООШ зам нь `y` БУУРНА (WM-д урд нь бага) */
assert.ok(down[down.length - 1][1] < down[0][1], 'доош зам буруу чиглэлд');
assert.ok(up[up.length - 1][1] > up[0][1], 'дээш зам буруу чиглэлд');

/* 6. Хуурай нүд дээр зам БАЙХГҮЙ */
assert.equal(flowPath(fd, 0, 5 * W + 35, true).length, 0, 'хуурай нүдэнд зам гарав');

/* 6б. ЗАМЫН УРТ (2026-09-30): хагас нүдний алхам ИЖИЛ нүдэнд буухыг «гогцоо» гэж
   тасалдаг байсан тул зам 2–3 цэгтэй (5–10 м) хожуул болдог байв. Шулуун урсгалд
   зам нойтон нүдээр ҮРГЭЛЖИЛНЭ — сувгийн уртын дагуу олон нүд. */
{
  const len = (p) => Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
  assert.ok(down.length > 20, `доош зам хэт богино: ${down.length} цэг`);
  assert.ok(len(down) > 100, `доош замын урт ${len(down).toFixed(1)} м`);
  assert.ok(len(up) > 100, `дээш замын урт ${len(up).toFixed(1)} м`);
  /* Налуу урсгал (u, v хоёулаа) — хагас алхам нүдний заагийг ташуу гаталдаг */
  const all = { ...fd, depth: () => 1, u: () => 0.6, v: () => -0.6 };
  const diag = flowPath(all, 0, 5 * W + 5, false);
  assert.ok(diag.length > 20 && len(diag) > 100, `ташуу зам хэт богино: ${diag.length} цэг`);
  /* Эргэлдэх урсгал — 2×2 нүдний гогцоо (зүүн дээд → зүүн, баруун дээд → урд,
     баруун доод → баруун, зүүн доод → хойд): гогцоонд орвол ТАСАРНА (MAX_STEPS хүртэл тойрохгүй) */
  const dir = new Map([
    [20 * W + 20, [1, 0]], [20 * W + 21, [0, -1]], [21 * W + 21, [-1, 0]], [21 * W + 20, [0, 1]],
  ]);
  const swirl = {
    ...fd, depth: () => 1,
    u: (_s, i) => (dir.get(i) ?? [0, 0])[0],
    v: (_s, i) => (dir.get(i) ?? [0, 0])[1],
  };
  const loop = flowPath(swirl, 0, 20 * W + 20, false);
  assert.ok(loop.length >= 4 && loop.length < 12, `гогцоо тасарсангүй: ${loop.length}`);
}

/* 7. ТООЦООНЫ голдрилын маск (`fd.channel`) геометрээс ДАВАМГАЙЛНА (2026-09-21):
   жинхэнэ DSM дээр 17 м нүдэнд гол «эрэггүй» харагддаг тул хавтгай, эрэггүй
   нүд ч маскад байвал суваг; маскад байхгүй бол суваг хэлбэртэй ч суваг БИШ. */
const flat = 30 * W + 5;
const masked = whyFlood({ ...fd, channel: (i) => i === flat }, 0, flat);
assert.equal(masked.channel, true, 'маскын голдрилыг суваг гэж танисангүй');
const unmasked = whyFlood({ ...fd, channel: () => false }, 0, 20 * W + 20);
assert.equal(unmasked.channel, false, 'маскгүй нүдийг геометрээр суваг болголоо');

/* 8. ⚠️ 2026-10-01: ХУРААХ ТАЛБАЙ нь МАСКГҮЙ хуримтлалаас (`catchHa`) — зурсан
   полигоноор маскжсан `accHa` нь дээд урсгалыг тоолохгүй ДУТУУ хэлдэг байв;
   бичвэр «тооцооны мужид … дор хаяж» гэж хязгаарыг нь хэлнэ. */
{
  const both = whyFlood({ ...fd, accHa: () => 3, catchHa: () => 420 }, 0, hole);
  assert.equal(both.accHa, 420, 'маскгүй хуримтлал давамгайлсангүй');
  assert.ok(both.reason.includes('Тооцооны мужид') && both.reason.includes('420'), both.reason);
  const onlyAcc = whyFlood({ ...fd, accHa: () => 12 }, 0, hole);
  assert.equal(onlyAcc.accHa, 12, '`catchHa` байхгүй бол `accHa` руу ухрах');
}

console.log('uyrTailbar.check ✔');
