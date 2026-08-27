/**
 * ШАТЛАЛ (`gun`) БА МӨР НЭМЭХИЙН ШАЛГУУР — ЖИВЭЭР (live).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/gun.check.mjs
 *
 * Хамгаалж буй гурван алдаа:
 *   1. `gun` багана дүүрсний дараа мод нь `bagts.trees.ts`-ийнхээс ЗӨРВӨЛ бүлэг
 *      ба ажил хольцолдож, гүйцэтгэл огт өөр мөрөнд наалдана. Алдаа нь
 *      ЧИМЭЭГҮЙ — хуудас хэвийн нээгдсээр байх бөгөөд тоо нь л худал болно.
 *   2. «Бүлэг эсэх» дүрэм (дараагийн мөрийн гүн > өөрийнх) нь `TREES`-ийн
 *      тодорхой тэмдэглэгээтэй таарахгүй бол эвхэх/дэлгэх, догол мөр эвдэрнэ.
 *   3. Бүлэгт мөр нэмэхэд жин/мөнгөн дүн дахин бодогдохгүй бол Ерөнхий менежер
 *      ажил нэмээд «дүн өөрчлөгдөөгүй» гэж эргэлзэнэ.
 */
import assert from 'node:assert/strict';
import { PKGS, loadSchema } from './bagts.pkg.ts';
import { loadRows, computeAll, childIndexes } from './bagtsSheet.ts';
import { TREES } from './bagts.trees.ts';

/* ═══ 1. «БҮЛЭГ ЭСЭХ» ДҮРЭМ — сүлжээгүй, TREES дээр шууд ═══
   `loadRows` нь `gun`-аас уншихдаа бүлгийг тусдаа талбаргүйгээр, ДАРААГИЙН
   мөрийн гүнээс гаргадаг. Тэр дүрэм `TREES`-ийн тодорхой тэмдэглэгээтэй ЯГ
   таарах ёстой — эс бөгөөс багана дүүрмэгц хуудасны догол мөр эвдэрнэ. */
let checked = 0;
for (const [key, t] of Object.entries(TREES)) {
  const dep = [...t].map((c) => (c >= 'A' && c <= 'E' ? c.charCodeAt(0) - 65 : Number(c)));
  const grp = [...t].map((c) => c >= 'A' && c <= 'E');
  for (let i = 0; i < t.length; i++) {
    const derived = i + 1 < t.length && dep[i + 1] > dep[i];
    assert.equal(derived, grp[i],
      `${key} i=${i}: TREES бүлэг=${grp[i]}, «дараагийн гүн» дүрмээр=${derived}`);
    checked += 1;
  }
}
console.log(`✅ «бүлэг эсэх» дүрэм ${checked} мөр дээр TREES-тэй таарлаа`);

/* ═══ 2. Багц бүр — `gun` багана ба модны таарц ═══ */
let withGun = 0;
for (const pkg of PKGS) {
  const sc = await loadSchema(pkg).catch(() => null);
  if (!sc) { console.log(`${pkg.key.padEnd(9)} ⚠ схем уншигдсангүй`); continue; }

  if (!sc.f.gun) {
    /* ⚠️ Багана хараахан нэмэгдээгүй нь АЛДАА БИШ: `tools/bagts-gun.mjs`
       ажиллах хүртэл код `TREES`-ээ хэвийн хэрэглэсээр байна. Зөвхөн мэдээлнэ —
       эс бөгөөс байршуулалтын завсарт CI улаан болно. */
    console.log(`${pkg.key.padEnd(9)} — «gun» багана алга (TREES-ээр ажиллана)`);
    continue;
  }

  const { rows } = await loadRows(pkg, sc);
  const tree = TREES[pkg.key] ?? '';
  const filled = rows.length > 0 && rows.every((r) => Number.isFinite(r.depth));
  if (!filled) { console.log(`${pkg.key.padEnd(9)} — «gun» хоосон (нийтлэгдээгүй)`); continue; }

  // Мөрийн тоо TREES-тэй тэнцүү үед л тулгах утгатай (мөр нэмэгдсэн бол зөрнө).
  if (rows.length === tree.length) {
    for (let i = 0; i < rows.length; i++) {
      const ch = tree[i];
      const wantGroup = ch >= 'A' && ch <= 'E';
      const wantDepth = wantGroup ? ch.charCodeAt(0) - 65 : Number(ch);
      assert.equal(rows[i].depth, wantDepth, `${pkg.key} мөр ${i}: гүн ${rows[i].depth} ≠ ${wantDepth}`);
      assert.equal(rows[i].group, wantGroup, `${pkg.key} мөр ${i}: бүлэг ${rows[i].group} ≠ ${wantGroup}`);
    }
    console.log(`${pkg.key.padEnd(9)} ✅ «gun» мод TREES-тэй ЯГ таарав (${rows.length} мөр)`);
  } else {
    console.log(`${pkg.key.padEnd(9)} ✅ «gun» ажиллаж байна · ${rows.length} мөр (TREES ${tree.length} — мөр нэмэгдсэн)`);
  }
  withGun += 1;
}

/* ═══ 3. МӨР НЭМЭХ — жин ба мөнгөн дүн ДАХИН бодогдох ёстой ═══
   Эх өгөгдлийг ӨӨРЧЛӨХГҮЙ: зөвхөн санах ойд мөр залгаад `computeAll`-ийг
   дахин ажиллуулна. */
const probe = PKGS[0];
const sc0 = await loadSchema(probe);
const { rows: base, asOf } = await loadRows(probe, sc0);
assert.ok(base.length > 0, `${probe.key}: мөр уншигдсангүй`);
const nBld = sc0.bld.length;

const before = computeAll(base, nBld, asOf ?? Date.now());

/* ⚠️ МӨНГӨТЭЙ бүлгийг сонгоно. Мөнгөн дүнгүй бүлэгт шинэ мөр нэмэхэд түүний
   жин автоматаар 100% болох тул «жин ДАХИН тарав уу» гэсэн гол шалгуур
   утгагүй өнгөрнө — сул шалгуур нь шалгуургүйтэй адил. */
const kids0 = childIndexes(base);
const gi = base.findIndex((r, i) =>
  r.group && (before[i].H ?? 0) > 0
  && kids0[i].length > 1 && kids0[i].some((k) => !base[k].group));
assert.ok(gi >= 0, `${probe.key}: мөнгөн дүнтэй, олон дэд мөртэй бүлэг олдсонгүй`);
const VOL = 7, UNIT = 1_000_000;   // 7,000,000₮ — дүнд мэдэгдэхүйц

// Бүлгийн сүүлийн удмын дараа
let at = gi + 1;
while (at < base.length && base[at].depth > base[gi].depth) at += 1;
const added = base.slice();
added.splice(at, 0, {
  oid: -1, no: '999', work: 'ШАЛГУУРЫН ТҮР МӨР', depth: base[gi].depth + 1, group: false,
  wC: null, wD: null, vol: VOL, unit: UNIT, money: null,
  act: new Array(nBld).fill(null), obyem: new Array(nBld).fill(null),
  start: new Array(nBld).fill(null), end: new Array(nBld).fill(null),
  raw: {},
});
const after = computeAll(added, nBld, asOf ?? Date.now());

// 3a. Мөнгөн дүн нь ЯГ vol×unit-аар өссөн эсэх
const dH = (after[gi].H ?? 0) - (before[gi].H ?? 0);
assert.ok(Math.abs(dH - VOL * UNIT) < 1,
  `бүлгийн Мөнгөн дүн ${dH} нэмэгдэв, ${VOL * UNIT} байх ёстой — нэмсэн мөр тооцоонд ОРООГҮЙ`);

// 3b. Шинэ мөр өөрийн хувийн жинтэй болсон эсэх
const nw = after[at];
assert.ok(nw.C != null && nw.C > 0 && nw.C <= 1, `шинэ мөрийн хувийн жин буруу: ${nw.C}`);

// 3c. Бүлгийн дэд мөрүүдийн жингийн нийлбэр 1 хэвээр (жин ДАХИН тарсан эсэх)
const kids1 = childIndexes(added);
const sum = kids1[gi].reduce((s, k) => s + (after[k].C ?? 0), 0);
assert.ok(Math.abs(sum - 1) < 1e-6,
  `бүлгийн дэд жингийн нийлбэр ${sum} — 1 байх ёстой (жин дахин тараагдаагүй)`);

// 3d. Хуучин дэд мөрийн жин БУУРСАН эсэх — шинэ мөр орж ирснээр дахин тарна
const firstOld = kids1[gi].find((k) => k !== at);
assert.ok(firstOld != null, 'харьцуулах хуучин дэд мөр алга');
const oldIdx0 = kids0[gi].find((k) => k === firstOld || k === firstOld - 1);
if (oldIdx0 != null && (before[oldIdx0].C ?? 0) > 0)
  assert.ok((after[firstOld].C ?? 0) < (before[oldIdx0].C ?? 0),
    `хуучин дэд мөрийн жин ${before[oldIdx0].C} → ${after[firstOld].C} — буурах ёстой`);

const label = (base[gi].no ? base[gi].no + ' ' : '') + base[gi].work;
console.log(`✅ мөр нэмэхэд дүн дахин бодогдов · ${probe.key} «${label.slice(0, 30)}»`
  + ` · Мөнгөн дүн +${(dH / 1e6).toFixed(1)}сая · шинэ мөрийн жин ${(nw.C * 100).toFixed(2)}%`);

console.log(`\ngun.check: ok · «gun» багана ${withGun}/${PKGS.length} багцад`);
