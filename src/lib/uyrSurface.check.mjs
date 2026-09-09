/**
 * УСНЫ ГАДАРГУУГИЙН ПОЛИГОН — регрессийн шалгалт.
 *
 * ⚠️ Юуг барих гэсэн юм бэ:
 *   1. Хоосон биш үр дүн (цагираг холбогдож чадаагүй бол 0 гарна)
 *   2. НҮХ хадгалагдах — дундах хуурай арал (барилга, дов) усанд дарагдахгүй
 *   3. Өндөр нь `газар + гүн` — газраас доош ч, дээш ч гарахгүй
 *   4. Налуу хөндийд ОЛОН зурвас үүсэх (нэг хавтгай толбо БИШ)
 */
import assert from 'node:assert/strict';
import { waterSurface } from '@/lib/uyrSurface';

/** 16×16 тор: хойноос урагш налуу, дунд нь ус, төвд нь хуурай арал */
const W = 16;
const H = 16;
const P = W * H;
const dep = new Float32Array(P);
const ter = new Float32Array(P);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    ter[i] = 100 - y * 0.5;                     // 0.5 м / нүд налуу
    const inBox = x >= 4 && x <= 11 && y >= 4 && y <= 11;
    const isle = x >= 7 && x <= 8 && y >= 7 && y <= 8;
    dep[i] = inBox && !isle ? 1 : 0;
  }
}
const fd = {
  meta: {
    width: W, height: H, slices: 1, wkid: 102100, wetM: 0.05,
    extent: { xmin: 0, ymin: 0, xmax: 160, ymax: 160 },
  },
  depth: (_s, i) => dep[i],
  terrain: (i) => ter[i],
  /* Урсгал — 0.5 м/с урагш (зурвасын долгионы чиглэл эндээс) */
  u: () => 0,
  v: () => -0.5,
};

const bands = waterSurface(fd, 0);
assert.ok(bands.length > 0, 'зурвас огт гарсангүй');
/* Налуу нь 8 нүдэнд 4 м — 0.35 м-ийн зурвасаар хуваахад олон зурвас гарна */
assert.ok(bands.length >= 4, `налуу дээр зурвас цөөн: ${bands.length}`);

for (const b of bands) {
  assert.ok(b.z >= 95 && b.z <= 99.5, `өндөр хүрээнээс гарлаа: ${b.z}`);
  assert.ok(Math.abs(b.depth - 1) < 1e-6, `гүн буруу: ${b.depth}`);
  /* ⚠️ Урагш урсгал (v < 0) → 180°. Векторын нийлбэрээс бодогдох ёстой. */
  assert.ok(Math.abs(b.deg - 180) < 1, `долгионы чиглэл буруу: ${b.deg}`);
  for (const r of b.rings) {
    assert.ok(r.length >= 4, 'цагираг хэт богино');
    const [x0, y0] = r[0];
    const [xn, yn] = r[r.length - 1];
    assert.ok(x0 === xn && y0 === yn, 'цагираг хаагдаагүй');
    for (const [x, y] of r) {
      assert.ok(x >= -1 && x <= 161 && y >= -1 && y <= 161, `цэг хүрээнээс гарлаа: ${x},${y}`);
    }
  }
}

/* ⚠️ НҮХ: арлыг агуулсан мөрүүдийн зурваст 2 цагираг байх ёстой. Нэг ч
   олон цагирагтай зурвас байхгүй бол нүх «уусаж», ус барилгыг хучна. */
const holed = bands.filter((b) => b.rings.length > 1);
assert.ok(holed.length > 0, 'нүх (хуурай арал) алдагдлаа');

/* Хуурай тор → хоосон */
assert.equal(
  waterSurface({ ...fd, depth: () => 0 }, 0).length, 0,
  'хуурай тор дээр зурвас гарав',
);

/* Газрын өндөргүй дата (бэлэн файл) → хоосон, унахгүй */
assert.equal(
  waterSurface({ ...fd, terrain: undefined }, 0).length, 0,
  '`terrain` байхгүй үед унах ёсгүй',
);

console.log('uyrSurface.check ✔');
