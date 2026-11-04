/**
 * HO ← CASHFLOW холболт — цэвэр тооцоолол (сүлжээгүй, 2026-11-03).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hoSync/compute.check.mjs
 *
 * Шалгана: багцын код тохироо (нэг гэрээ олон багц → нийлбэр), үе шат (ТЭЗҮ ↔ зураг/ТЭЗҮ, бусад ↔ барилга угсралт),
 * «Гэрээлсэн дүн» л, гэрээний бүх мөрөнд давтаж бичих, зөрөөгүй талбар бичигдэхгүй, Cashflow-д байхгүй талбар хөндөгдөхгүй,
 * мөргүй гэрээ хөндөгдөхгүй.
 */
import assert from 'node:assert/strict';
import { hoPkgParts, phasesOf, hoFromCf, planHoSync } from './compute.ts';

assert.deepEqual(hoPkgParts('Багц-1'), ['1']);
assert.deepEqual(hoPkgParts('БАГЦ 1- 4'), ['1-4']);
assert.deepEqual(hoPkgParts('Багц-1-4'), ['1-4']);
assert.deepEqual(hoPkgParts('БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15'), ['10', '11', '13', '15']);
assert.deepEqual(hoPkgParts(null), []);
assert.deepEqual(phasesOf('ТЭЗҮ,Судалгаа'), ['ТЭЗҮ', 'Ажлын зураг төсөл']);
assert.deepEqual(phasesOf('ГИШСүлжээ'), ['Барилга угсралт']);
assert.deepEqual(phasesOf('Барилга угсралт'), ['Барилга угсралт']);

const cf = (o) => ({ objectid: 0, ho_dungiin_tailbar: 'Гэрээлсэн дүн', uy_shat: 'Барилга угсралт', ...o });
const cfRows = [
  cf({ objectid: 1, bagts: 'Багц-1', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 1000, ho_dun_geree: 900, zahiramj_unet_tsaas: 600, zahiramj_borluulalt_dun: 400, guitsetgegch: 'ХХДМГК', geree_dugaar: 'Г-1', zahiramj_ognoo: 1700000000000, zahiramj_dugaar: 'А/1' }),
  cf({ objectid: 2, bagts: 'Багц-1', uy_shat: 'Ажлын зураг төсөл', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 50, ho_dun_geree: 50 }), // зураг — барилгын гэрээнд ОРОХГҮЙ
  cf({ objectid: 3, bagts: 'Багц-1', ho_dungiin_tailbar: 'Урьдчилсан дүн', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 70 }), // гэрээлээгүй — орохгүй
  cf({ objectid: 4, bagts: 'Багц-10', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 10, ho_dun_geree: 10, zahiramj_unet_tsaas: 6, zahiramj_borluulalt_dun: 4, guitsetgegch: 'УСУГ' }),
  cf({ objectid: 5, bagts: 'БАГЦ-11', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 20, ho_dun_geree: 20, zahiramj_unet_tsaas: 12, zahiramj_borluulalt_dun: 8 }),
  cf({ objectid: 6, bagts: 'Багц-8', uy_shat: 'Ажлын зураг төсөл', zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 465, ho_dun_geree: 323, zahiramj_unet_tsaas: 465, guitsetgegch: 'ЭХЭЗХ' }),
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
const big = hoFromCf([cf({ zahiramj_dugaar: 'А/1', ho_dun_zahiramj: 1000.6, ho_dun_geree: 900.4, zahiramj_niislel_tusuv: 3_800_000_000 })]);
assert.equal(big.tosov_niit, 1001);
assert.equal(big.gereet_tosov_niit, 900);
assert.equal(big.hemnelt_hetrelt, 100, 'хэмнэлт бүхэл');
assert.ok(!('tosov_niislel_tosov' in big), '3.8 тэрбум Integer-т багтахгүй → хөндөхгүй');
assert.equal(hoFromCf([cf({ zahiramj_niislel_tusuv: 533_070_000 })]).tosov_niislel_tosov, 533_070_000);
assert.equal(p.updates.find((u) => u.objectid === 13), undefined, 'нийлбэр таарч байвал бичихгүй (10+20=30 · 6+12=18 · 4+8=12)');
assert.equal(p.updates.find((u) => u.objectid === 14), undefined, 'Багц-8 таарч байна');
assert.equal(p.updates.find((u) => u.objectid === 15), undefined);
assert.equal(p.updates.find((u) => u.objectid === 16), undefined);

const w = hoFromCf([cfRows[3], cfRows[4]]);
assert.equal(w.tosov_niit, 30);
assert.equal(w.guitsetgegch, 'УСУГ', 'бичвэр — эхний утгатай мөрөөс');
assert.equal(w.tosov_niislel_tosov, null, 'бичигдээгүй эх үүсвэр null (0 биш)');

console.log('hoSync.compute: ok');
