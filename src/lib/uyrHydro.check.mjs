/**
 * ГИДРОЛОГИЙН ГИНЖ — регрессийн шалгалт.
 *
 * ⚠️ Юуг барих гэсэн юм бэ:
 *   1. `fillSinks` нь хонхрыг ГАРАХ ЦЭГИЙН түвшинд хүртэл дүүргэх (дутуу ч,
 *      илүү ч биш) — дутуу дүүргэвэл ус түгжигдэнэ, илүү дүүргэвэл рельеф эвдэрнэ
 *   2. Налуу гадаргууг ӨӨРЧЛӨХГҮЙ байх
 *   3. `flowAccum` нь ДООШОО хуримтлагдах ба нийт жинг АЛДАХГҮЙ байх
 *   4. `streamMask` нь ГА-гийн босгоор ажиллах (нүдээр биш)
 */
import assert from 'node:assert/strict';
import { fillSinks, flowAccum, streamMask } from '@/lib/uyrHydro';

const N = 20;
const P = N * N;

/* ── 1. Налуу гадаргуу — өөрчлөгдөх ЁСГҮЙ ── */
const plane = new Float32Array(P);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) plane[y * N + x] = 100 - y * 0.5;
const f1 = fillSinks(plane, N);
for (let i = 0; i < P; i++) {
  assert.ok(Math.abs(f1[i] - plane[i]) < 0.01, `налуу гадаргуу өөрчлөгдлөө: ${i}`);
}

/* ── 2. Хонхор — гарах цэгийн түвшинд дүүрэх ── */
const pit = Float32Array.from(plane);
const pi = 10 * N + 10;
pit[pi] -= 3;                       // 3 м гүн нүх
const f2 = fillSinks(pit, N);
assert.ok(f2[pi] > pit[pi] + 2.5, `хонхор дүүрсэнгүй: ${f2[pi] - pit[pi]}`);
/* ⚠️ Хөршийн түвшнээс ДЭЭШ гарах ёсгүй — эс бөгөөс хиймэл дов үүснэ */
assert.ok(f2[pi] <= plane[pi] + 0.51, `хонхор ХЭТ дүүрлээ: ${f2[pi] - plane[pi]}`);

/* ── 3. Хуримтлал — доошоо өснө ── */
const acc = flowAccum(f1, N);
for (let i = 0; i < P; i++) assert.ok(acc[i] >= 1, `хуримтлал 1-ээс бага: ${acc[i]}`);
const top = acc[1 * N + 10];
const bot = acc[(N - 2) * N + 10];
assert.ok(bot > top * 3, `доошоо хуримтлагдсангүй: дээр ${top} доор ${bot}`);
assert.ok(acc[bot] !== Infinity && Number.isFinite(bot), 'хуримтлал хязгааргүй');

/* ⚠️ ЖИН ХАДГАЛАГДАХ: хамгийн нам МӨРИЙН нийлбэр нь бүх нүдний тоонд хүрнэ
   (тэр мөр нь домэйны цорын ганц гарц). Алдагдвал MFD-ийн жин буруу. */
let lastRow = 0;
for (let x = 0; x < N; x++) lastRow += acc[(N - 1) * N + x];
assert.ok(lastRow > P * 0.9, `ус алдагдлаа: ${lastRow.toFixed(0)} / ${P}`);

/* ── 4. Маск — БҮХ жин нэг нүдэнд төвлөрөхгүй (MFD нь тархаадаг) ── */
let mx = 0;
for (let i = 0; i < P; i++) mx = Math.max(mx, acc[i]);
assert.ok(mx < P * 0.6, `MFD тархаагүй — D8 шиг ажиллаж байна (дээд ${mx})`);

/* ── 5. streamMask — ГА-гийн босго ── */
const a5 = Float32Array.from([1, 10, 100, 1000]);
const m5 = streamMask(a5, 0.05, 2);          // 2 га / 0.05 га = 40 нүд
assert.deepEqual(Array.from(m5), [0, 0, 1, 1], 'сувгийн босго буруу');

/* ── 6. Маск — домэйны гадна нүд хуримтлалд ОРОХГҮЙ ── */
const dom = new Uint8Array(P).fill(1);
for (let y = 0; y < N; y++) for (let x = 0; x < 5; x++) dom[y * N + x] = 0;
const acc6 = flowAccum(f1, N, undefined, dom);
for (let y = 0; y < N; y++) {
  assert.equal(acc6[y * N + 0], 1, 'домэйны гадна нүдэд ус нэмэгдэв');
}

console.log('uyrHydro.check ✔');
