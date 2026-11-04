/**
 * HO ← CASHFLOW холболт — цэвэр тооцоолол (сүлжээгүй, 2026-11-03).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hoSync/compute.check.mjs
 *
 * Шалгана: багцын код тохироо (нэг гэрээ олон багц → нийлбэр), үе шат (ТЭЗҮ ↔ зураг/ТЭЗҮ, бусад ↔ барилга угсралт),
 * «Гэрээлсэн дүн» л, гэрээний бүх мөрөнд давтаж бичих, зөрөөгүй талбар бичигдэхгүй, Cashflow-д байхгүй талбар хөндөгдөхгүй,
 * мөргүй гэрээ хөндөгдөхгүй.
 */
import assert from 'node:assert/strict';
import { hoPkgParts, phasesOf, hoFromCf, planHoSync, planBlockBudgets, planPaidSync } from './compute.ts';
import { buildTree } from '../projectPlan.ts';

assert.deepEqual(hoPkgParts('Багц-1'), ['1']);
assert.deepEqual(hoPkgParts('БАГЦ 1- 4'), ['1-4']);
assert.deepEqual(hoPkgParts('Багц-1-4'), ['1-4']);
assert.deepEqual(hoPkgParts('БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15'), ['10', '11', '13', '15']);
assert.deepEqual(hoPkgParts(null), []);
/* 2026-11-05: дэд багцын зураас = цэг (хуудас «Багц 4-1» ↔ Cashflow «Багц-4.1»); өсөх хос = диапазон хэвээр */
assert.deepEqual(hoPkgParts('Багц 4-1'), ['4.1']);
assert.deepEqual(hoPkgParts('Багц-4.1'), ['4.1']);
assert.deepEqual(hoPkgParts('БАГЦ 4-2, Багц-4.1'), ['4.2', '4.1']);
assert.deepEqual(hoPkgParts('БАГЦ 1-4'), ['1-4'], 'диапазон хэвээр');
assert.deepEqual(phasesOf('ТЭЗҮ,Судалгаа'), ['ТЭЗҮ', 'Ажлын зураг төсөл']);
assert.deepEqual(phasesOf('ГИШСүлжээ'), ['Барилга угсралт']);
assert.deepEqual(phasesOf('Барилга угсралт'), ['Барилга угсралт']);

const cf = (o) => ({ objectid: 0, ho_dungiin_tailbar: 'Гэрээлсэн дүн', uy_shat: 'Барилга угсралт', ...o });
const cfRows = [
  cf({ objectid: 1, bagts: 'Багц-1', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 1000, geree_dun: 900, zahiramj_unet_tsaas: 600, zahiramj_borluulalt_dun: 400, guitsetgegch: 'ХХДМГК', geree_dugaar: 'Г-1', zahiramj_ognoo: 1700000000000, zahiramj_dugaar: 'А/1' }),
  cf({ objectid: 2, bagts: 'Багц-1', uy_shat: 'Ажлын зураг төсөл', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 50, geree_dun: 50 }), // зураг — барилгын гэрээнд ОРОХГҮЙ
  cf({ objectid: 3, bagts: 'Багц-1', ho_dungiin_tailbar: 'Урьдчилсан дүн', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 70 }), // гэрээлээгүй — орохгүй
  cf({ objectid: 4, bagts: 'Багц-10', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 10, geree_dun: 10, zahiramj_unet_tsaas: 6, zahiramj_borluulalt_dun: 4, guitsetgegch: 'УСУГ' }),
  cf({ objectid: 5, bagts: 'БАГЦ-11', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 20, geree_dun: 20, zahiramj_unet_tsaas: 12, zahiramj_borluulalt_dun: 8 }),
  cf({ objectid: 6, bagts: 'Багц-8', uy_shat: 'Ажлын зураг төсөл', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 465, geree_dun: 323, zahiramj_unet_tsaas: 465, guitsetgegch: 'ЭХЭЗХ' }),
];
const ho = [
  { objectid: 11, geree_kod: 'Багц-1', bagts: 'Багц-1', ajliin_turul: 'Барилга угсралт', zahiramj1_dugaar: 'А/1', tosov_niit: 1000, gereet_tosov_niit: 880, tosov_unet_tsaas: 600, tosov_borluulalt: 380, hemnelt_hetrelt: 120, guitsetgegch: 'ХХДМГК', geree_dugaar: 'Г-1', zahiramj1_ognoo: '2023-11-14', zahiramj1_dugaar: 'А/1', gereet_unet_tsaas: 555, tosol_ner: 'Сэлбэ' },
  { objectid: 12, geree_kod: 'Багц-1', bagts: 'Багц-1', ajliin_turul: 'Барилга угсралт', tosov_niit: null, gereet_tosov_niit: null, dun: 5 },
  { objectid: 13, geree_kod: 'БАГЦ-10,11', bagts: 'БАГЦ-10,  БАГЦ-11', ajliin_turul: 'ГИШСүлжээ', zahiramj1_dugaar: 'А/1', tosov_niit: 30, gereet_tosov_niit: 30, tosov_unet_tsaas: 18, tosov_borluulalt: 12, hemnelt_hetrelt: 0, guitsetgegch: 'УСУГ' },
  { objectid: 14, geree_kod: 'Багц-8', bagts: 'Багц-8', ajliin_turul: 'ТЭЗҮ,Судалгаа', zahiramj1_dugaar: 'А/1', tosov_niit: 465, gereet_tosov_niit: 323, tosov_unet_tsaas: 465, hemnelt_hetrelt: 142, guitsetgegch: 'ЭХЭЗХ' },
  { objectid: 15, geree_kod: '', bagts: null, ajliin_turul: 'ТЭЗҮ,Судалгаа', tosov_niit: 0.5 },
  { objectid: 16, geree_kod: 'Багц-99', bagts: 'Багц-99', ajliin_turul: 'ГИШСүлжээ', tosov_niit: 1 },
];
const p = planHoSync(ho, cfRows);

assert.deepEqual(p.matched.get('Багц-1'), [1], 'барилгын гэрээ — зөвхөн барилга угсралтын «Гэрээлсэн дүн» мөр');
assert.deepEqual(p.matched.get('БАГЦ-10,11'), [4, 5], 'нэг гэрээ хоёр багц');
assert.deepEqual(p.matched.get('Багц-8'), [6], 'ТЭЗҮ гэрээ ↔ зураг төслийн мөр');
assert.deepEqual(p.unmatched, ['Багц-99'], 'мөргүй гэрээ хөндөгдөхгүй; кодгүй мөр орохгүй');

const u11 = p.updates.find((u) => u.objectid === 11);
assert.deepEqual(u11, { objectid: 11, gereet_tosov_niit: 900, tosov_borluulalt: 400, hemnelt_hetrelt: 100 }, 'зөрсөн талбар л; gereet_unet_tsaas · tosol_ner хөндөгдөхгүй');
const u12 = p.updates.find((u) => u.objectid === 12);
assert.equal(u12.tosov_niit, 1000, 'гэрээний бүх мөрөнд давтаж бичнэ');
assert.equal(u12.gereet_tosov_niit, 900);
assert.equal(u12.guitsetgegch, 'ХХДМГК');
assert.equal(u12.zahiramj1_dugaar, 'А/1');
assert.equal(u12.zahiramj1_ognoo, '2023-11-14', 'DateOnly — ms → «YYYY-MM-DD»');
assert.ok(!('dun' in u12), 'төлбөрийн талбар хөндөгдөхгүй');
/* BigInteger бүхэл; Integer 32 бит хэтэрвэл талбар хөндөгдөхгүй */
const big = hoFromCf([cf({ zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 1000.6, geree_dun: 900.4, zahiramj_niislel_tusuv: 3_800_000_000 })]);
assert.equal(big.tosov_niit, 1001);
assert.equal(big.gereet_tosov_niit, 900);
assert.equal(big.hemnelt_hetrelt, 100, 'хэмнэлт бүхэл');
assert.ok(!('tosov_niislel_tosov' in big), '3.8 тэрбум Integer-т багтахгүй → хөндөхгүй');
assert.equal(hoFromCf([cf({ zahiramj_niislel_tusuv: 533_070_000 })]).tosov_niislel_tosov, 533_070_000);
assert.equal(p.updates.find((u) => u.objectid === 13), undefined, 'нийлбэр таарч байвал бичихгүй (10+20=30 · 6+12=18 · 4+8=12)');
assert.equal(p.updates.find((u) => u.objectid === 14), undefined, 'Багц-8 таарч байна');
assert.equal(p.updates.find((u) => u.objectid === 15), undefined);
assert.equal(p.updates.find((u) => u.objectid === 16), undefined);

/* 2026-11-04: бага зөрүү алгасагдахгүй (4.9 тэрбумд 4 ₮) */
{
  const c = [cf({ objectid: 70, bagts: 'Багц-5.1', geree_dun: 4_921_479_350 })];
  const h = [{ objectid: 71, geree_kod: 'Багц-5.1', bagts: 'Багц-5.1', ajliin_turul: 'ГИШСүлжээ', gereet_tosov_niit: 4_921_479_346 }];
  assert.equal(planHoSync(h, c).updates[0].gereet_tosov_niit, 4_921_479_350, '4 ₮ зөрүү бичигдэнэ');
}
/* 2026-11-04: HO-д байхгүй гэрээ автоматаар нэмэгдэж, дараагийн удаа дахин нэмэгдэхгүй */
{
  const c = [
    cf({ objectid: 80, bagts: 'БАГЦ 1-6 БАГЦ 8-17', uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ ажил', geree_dun: 3_553_800_000, geree_dugaar: 'Н/1', guitsetgegch: 'ББСМО', zahiramj_dugaar: 'А/9', ho_dun_zahiramj: 3_800_000_000 }),
    cf({ objectid: 81, bagts: 'БАГЦ-7.1', uy_shat: 'Ажлын зураг төсөл', geree_dun: 505_000_000, geree_dugaar: 'Х/29' }),
    cf({ objectid: 82, bagts: 'БАГЦ-7.1', geree_dun: 22_868_075_730, geree_dugaar: 'A/1291' }),
    cf({ objectid: 83, bagts: 'Багц-5.3', geree_dun: 100 }),
    cf({ objectid: 84, bagts: 'Багц-5.4', geree_dun: 200 }),
    cf({ objectid: 85, bagts: 'Багц-9', geree_dun: null }), // дүнгүй — нэмэхгүй
    cf({ objectid: 86, bagts: 'Багц-12', ho_dungiin_tailbar: 'Урьдчилсан дүн', geree_dun: 5 }), // гэрээгүй
    cf({ objectid: 87, bagts: 'Багц-13', uy_shat: 'Зөвшөөрөл', geree_dun: 7 }), // таарах үе шатгүй — үүрд нэмэгдэхээс хамгаална
    cf({ objectid: 88, bagts: 'Багц-10', geree_dun: 10, geree_dugaar: 'У/1' }),
    cf({ objectid: 89, bagts: 'Багц-11', geree_dun: 20, geree_dugaar: 'У/1' }), // нэг гэрээний дугаар
  ];
  const h = [{ objectid: 90, murun_id: 'ХО-0041', geree_kod: 'БАГЦ-7.1', bagts: 'БАГЦ-7.1', ajliin_turul: 'ГИШСүлжээ', gereet_tosov_niit: 22_868_075_730, geree_dugaar: 'A/1291' }];
  const q = planHoSync(h, c);
  assert.deepEqual(q.adds.map((a) => a.geree_kod), ['БАГЦ 1-6 БАГЦ 8-17', 'БАГЦ-7.1 · Ажлын зураг төсөл', 'Багц-5.3', 'Багц-5.4', 'Багц-10, Багц-11']);
  assert.deepEqual(q.adds.map((a) => a.murun_id), ['ХО-0042', 'ХО-0043', 'ХО-0044', 'ХО-0045', 'ХО-0046'], 'давтагдашгүй дугаар');
  assert.deepEqual(q.adds.map((a) => a.ajliin_turul), ['ТЭЗҮ,Судалгаа', 'ТЭЗҮ,Судалгаа', 'ГИШСүлжээ', 'ГИШСүлжээ', 'ГИШСүлжээ']);
  const a0 = q.adds[0];
  assert.equal(a0.bagts, 'БАГЦ 1-6 БАГЦ 8-17');
  assert.equal(a0.tosol_ner, 'ТЭЗҮ ажил');
  assert.equal(a0.gereet_tosov_niit, 3_553_800_000);
  assert.equal(a0.tosov_niit, 3_800_000_000);
  assert.equal(a0.guitsetgegch, 'ББСМО');
  assert.equal(a0.geree_dugaar, 'Н/1');
  assert.ok(!('dun' in a0), 'төлбөр бичихгүй');
  assert.equal(q.adds[4].gereet_tosov_niit, 30, 'нэг дугаартай мөрүүд нэг гэрээ');
  /* Нэмсний дараа: бүгд таарч, шинэ мөр нэмэхгүй, засвар гарахгүй */
  const again = planHoSync([...h, ...q.adds.map((a, i) => ({ objectid: 100 + i, ...a }))], c);
  assert.deepEqual(again.adds, [], 'дахин нэмэгдэхгүй');
  assert.deepEqual(again.updates, [], 'нэмсэн мөр зөрүүгүй');
  assert.deepEqual(again.matched.get('БАГЦ-7.1'), [82], 'барилгын гэрээ зураг төслийн мөрийг авахгүй');
  assert.deepEqual(again.matched.get('БАГЦ-7.1 · Ажлын зураг төсөл'), [81]);
  /* Зэрэг нэмсэн давхар мөр (ижил код) — нэг гэрээнд нэгтгэгдэнэ */
  const dup = planHoSync([...h, ...q.adds.map((a, i) => ({ objectid: 100 + i, ...a })), { objectid: 200, ...q.adds[2] }], c);
  assert.deepEqual(dup.adds, [], 'давхар мөр шинэ гэрээ үүсгэхгүй');
}

/* 2026-11-04: багцын дүн өөрчлөгдөхөд блокууд хувиар дагана */
{
  const pkg = (own, a, b, c) => buildTree([
    { objectid: 1, dd_kod: '5', etseg_kod: null, tuvshin: 0, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга' },
    { objectid: 2, dd_kod: '5.1', etseg_kod: '5', tuvshin: 1, uy_shat: 'Барилга угсралт', bagts: 'Багц-1', ajil_uilchilgee: 'Багц', cashflow_id: 11, ho_dun_geree: own },
    { objectid: 3, dd_kod: '5.1.1', etseg_kod: '5.1', tuvshin: 2, uy_shat: 'Барилга угсралт', bagts: 'Багц-1', blok: '5/1', ajil_uilchilgee: '9 давхар', ho_dun_geree: a },
    { objectid: 4, dd_kod: '5.1.2', etseg_kod: '5.1', tuvshin: 2, uy_shat: 'Барилга угсралт', bagts: 'Багц-1', blok: '5/2', ajil_uilchilgee: '12 давхар', ho_dun_geree: b },
    { objectid: 5, dd_kod: '5.1.3', etseg_kod: '5.1', tuvshin: 2, uy_shat: 'Барилга угсралт', bagts: 'Бүгд', ajil_uilchilgee: 'Газар шороо', ho_dun_geree: c },
  ]);
  assert.deepEqual(planBlockBudgets(pkg(1000, 300, 600, 100)), [], 'нийлбэр таарч байвал бичихгүй');
  assert.deepEqual(planBlockBudgets(pkg(1000.4, 300, 600, 100)), [], '1 ₮ хүрэхгүй зөрүү — бичихгүй');
  const u = planBlockBudgets(pkg(2000, 300, 600, 100));
  assert.deepEqual(u.map((x) => [x.objectid, x.ho_dun_geree]), [[3, 600], [4, 1200], [5, 200]], 'харьцаа хэвээр, 2 дахин');
  const r = planBlockBudgets(pkg(1001, 333, 333, 334));
  assert.equal(r.reduce((a, x) => a + x.ho_dun_geree, 0), 1001, 'бөөрөнхийллийн дараа нийлбэр яг тэнцүү');
  const applied = pkg(1001, ...r.map((x) => x.ho_dun_geree));
  assert.deepEqual(planBlockBudgets(applied), [], 'бичсний дараа дахин бичихгүй');
  /* Дэд гэрээтэй мөр — хамаарахгүй; дэд мөр дүнгүй бол хамаарахгүй */
  const contracts = buildTree([
    { objectid: 1, dd_kod: '5', etseg_kod: null, tuvshin: 0, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга' },
    { objectid: 2, dd_kod: '5.1', etseg_kod: '5', tuvshin: 1, uy_shat: 'Барилга угсралт', cashflow_id: 11, ho_dun_geree: 500, ajil_uilchilgee: 'Гэрээ' },
    { objectid: 3, dd_kod: '5.1.1', etseg_kod: '5.1', tuvshin: 2, uy_shat: 'Барилга угсралт', cashflow_id: 12, ho_dun_geree: 100, ajil_uilchilgee: 'Дэд гэрээ' },
  ]);
  assert.deepEqual(planBlockBudgets(contracts), [], 'өөр гэрээг хөндөхгүй');
}

/* 2026-11-04: IPC-ийн `dun` гэрээний мөрийн `olgoson_dun`, `urdchilgaa_dun`-д автоматаар орно */
{
  const c = [
    cf({ objectid: 1, bagts: 'Багц-10', geree_dun: 60, geree_dugaar: 'У/1' }),
    cf({ objectid: 2, bagts: 'БАГЦ-11', geree_dun: 40, geree_dugaar: 'У/1', olgoson_dun: 7 }),
    cf({ objectid: 3, bagts: 'Багц-2', geree_dun: 500 }),
    cf({ objectid: 4, bagts: 'Багц-3', geree_dun: 80, olgoson_dun: 9, urdchilgaa_dun: 9 }), // төлбөргүй болсон
  ];
  const row = (o) => ({ geree_kod: 'У', bagts: 'Багц-10', ajliin_turul: 'ГИШСүлжээ', tulult_turul: 'Гүйцэтгэл', ...o });
  const h = [
    row({ objectid: 1, murun_id: 'ХО-1', dun: 30, tulult_turul: 'Урьдчилгаа төлбөр' }),
    row({ objectid: 2, murun_id: 'ХО-2', bagts: 'БАГЦ-11', dun: 20, tulult_turul: 'Урьдчилгаа төлбөр' }),
    row({ objectid: 3, murun_id: 'ХО-3', dun: 10 }),
    row({ objectid: 4, murun_id: 'AUTO|БАГЦ10|2026-01-01', dun: null, ipc_tuluv: 'Гүйцэтгэл' }), // олгоогүй — тоологдохгүй
    row({ objectid: 5, murun_id: 'ХО-5', geree_kod: 'Б2', bagts: 'Багц-2', ajliin_turul: 'Барилга угсралт', dun: 200, tulult_turul: 'Урьдчилгаа төлбөр' }),
    row({ objectid: 6, murun_id: 'ХО-6', geree_kod: 'Б2', bagts: 'Багц 2', ajliin_turul: 'Барилга угсралт', dun: 50 }),
    row({ objectid: 7, murun_id: 'ХО-7', dun: -10 }), // цуцлалтын сөрөг мөр
    row({ objectid: 8, murun_id: 'ХО-8', geree_kod: 'Б3', bagts: 'Багц-3', ajliin_turul: 'Барилга угсралт', dun: null }),
  ];
  const q = planPaidSync(h, c);
  assert.deepEqual(q.unassigned, []);
  const by = new Map(q.updates.map((u) => [u.objectid, u]));
  assert.deepEqual(by.get(1), { objectid: 1, olgoson_dun: 30, urdchilgaa_dun: 30 }, 'багцын мөр өөрийн багцын дүнг авна; 30 + 10 − 10');
  assert.deepEqual(by.get(2), { objectid: 2, olgoson_dun: 20, urdchilgaa_dun: 20 });
  assert.deepEqual(by.get(3), { objectid: 3, olgoson_dun: 250, urdchilgaa_dun: 200 }, 'нэг багцтай гэрээ — бичиглэл зөрсөн мөр ч орно');
  assert.deepEqual(by.get(4), { objectid: 4, olgoson_dun: null, urdchilgaa_dun: null }, 'төлбөргүй бол хоосолно');
  /* Олон багц нэг мөрөнд — гэрээний дүнгийн жингээр хуваагдана (60 : 40), төлбөр хасагдахгүй */
  const un = planPaidSync([row({ objectid: 9, murun_id: 'ХО-0044', bagts: 'Багц-10, БАГЦ-11', dun: 5 })], c.slice(0, 2));
  assert.deepEqual(un.unassigned, []);
  assert.deepEqual(un.updates.map((u) => u.olgoson_dun), [3, 2], 'дүн жингээр, нийлбэр бүтэн');
  /* Гэрээний мөр огт олдоогүй — оноогдоогүй хэвээр */
  const none = planPaidSync([row({ objectid: 9, murun_id: 'ХО-0045', geree_kod: 'Алга', bagts: 'Багц-99', dun: 5 })], c.slice(0, 2));
  assert.deepEqual(none.unassigned, ['ХО-0045']);
  /* Цуцлагдсан гэрээг AUTO мөр сэргээхгүй */
  const dead = planHoSync([
    row({ objectid: 20, murun_id: 'ХО-20', geree_kod: 'Ц', bagts: 'Багц-10', ipc_tuluv: 'Цуцлагдсан' }),
    row({ objectid: 21, murun_id: 'AUTO|БАГЦ10|2026-01-02', geree_kod: 'Ц', bagts: 'Багц-10', ipc_tuluv: 'Гүйцэтгэл' }),
  ], c.slice(0, 2));
  assert.equal(dead.matched.has('Ц'), false, 'AUTO мөртэй ч цуцлагдсан хэвээр');
  /* Дахин бичихгүй */
  const done = c.map((r) => { const u = by.get(r.objectid); return u ? { ...r, ...u } : r; });
  assert.deepEqual(planPaidSync(h, done).updates, [], 'зөрүүгүй бол бичихгүй');
  /* Багц бүрээр задарсан мөрүүд — гэрээ бүх багцаа олно */
  assert.deepEqual(planHoSync(h, c).matched.get('У'), [1, 2], 'эхний мөрөөр биш, бүх мөрийн багцаар');
}

const w = hoFromCf([cfRows[3], cfRows[4]]);
assert.equal(w.tosov_niit, 30);
assert.equal(w.guitsetgegch, 'УСУГ', 'бичвэр — эхний утгатай мөрөөс');
assert.equal(w.tosov_niislel_tosov, null, 'бичигдээгүй эх үүсвэр null (0 биш)');

console.log('hoSync.compute: ok');
