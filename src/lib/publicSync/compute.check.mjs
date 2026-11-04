/**
 * НИЙТИЙН ВЭБИЙН ХҮСНЭГТҮҮД — цэвэр тооцоолол ба тулгалт (сүлжээгүй, 2026-11-03).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/publicSync/compute.check.mjs
 *
 * Шалгана:
 *   §1 `pubPkgCode` — «Багц -1» · «Багц 4-1» · «БАГЦ-7.1» нэг хэлбэрт
 *   §2 `guitsetgelRows` — 00 төсөл · 06 барилга угсралт · багц · блок (айл/давхар) · инженерийн бүлэг; хэмжилтгүй = 0
 *   §3 `sanhuuRows` — E, 4 эх үүсвэр, олгосон, хувь = олгосон ÷ E
 *   §4 `hunHuchRows` — компани бүр + нийт; багцгүй компанийн холбоос
 *   §5 `niigemRows` · `ehUusverRows` — нэрнээс төрөл/хүчин чадал/төлөв; үл үзэгдэх тэмдэгт
 *   §6 `gazarRows` · `diffRows` — зөрсөн мөр л бичигдэнэ, stamp зөвхөн өөрчлөлттэй мөрд, илүү мөр устгана
 */
import assert from 'node:assert/strict';
import {
  pubPkgCode, guitsetgelRows, sanhuuRows, hunHuchRows, niigemRows, ehUusverRows, gazarRows, PUB_TOTAL, PUB_BUILD,
} from './compute.ts';
import { diffRows } from './sync.ts';
import { assemblePlan } from '@/lib/projectPlanInputs';

let n = 0;
const check = (name, fn) => { fn(); n += 1; void name; };
const D = (y, m, d) => Date.UTC(y, m - 1, d);

/* ══════════ §1 ══════════ */
check('pubPkgCode', () => {
  assert.equal(pubPkgCode('Багц -1'), '1');
  assert.equal(pubPkgCode('Багц 4-1'), '4.1');
  assert.equal(pubPkgCode('БАГЦ-7.1'), '7.1');
  assert.equal(pubPkgCode('БАГЦ - 19.1'), '19.1');
  assert.equal(pubPkgCode(' Багц 3.2​'), '3.2');
  assert.equal(pubPkgCode(null), '');
});

/* ══════════ §2 ══════════ */
const rows = [
  { dd_kod: '1', etseg_kod: null, uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ', tusul_ezleh_huvi: 0.1, ho_dun_geree: 100,
    zahiramj_niislel_tusuv: 100 },
  { dd_kod: '5', etseg_kod: null, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт', tusul_ezleh_huvi: 0.9 },
  { dd_kod: '5.2', etseg_kod: '5', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт ажил', heseg_ezleh_huvi: 1 },
  { dd_kod: '5.2.1', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Орон сууцны хороолол барилга угсралт', heseg_ezleh_huvi: 0.6 },
  { dd_kod: '5.2.1.1', etseg_kod: '5.2.1', uy_shat: 'Барилга угсралт', bagts: 'Багц-1', ajil_uilchilgee: 'Орон сууцны хороолол барилга угсралт',
    heseg_ezleh_huvi: 1, ho_dun_geree: 1000, zahiramj_unet_tsaas: 600, zahiramj_borluulalt_dun: 400,
    geree_ehleh: D(2025, 6, 1), geree_duusah: D(2028, 1, 1) },
  { dd_kod: '5.2.1.1.1', etseg_kod: '5.2.1.1', uy_shat: 'Барилга угсралт', bagts: 'Багц-1', blok: '5/1', ajil_uilchilgee: '5/1 барилга', heseg_ezleh_huvi: 0.5 },
  { dd_kod: '5.2.1.1.2', etseg_kod: '5.2.1.1', uy_shat: 'Барилга угсралт', bagts: 'Багц-1', blok: '5/2', ajil_uilchilgee: '5/2 барилга', heseg_ezleh_huvi: 0.5 },
  { dd_kod: '5.2.3', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ', heseg_ezleh_huvi: 0.3 },
  { dd_kod: '5.2.3.1', etseg_kod: '5.2.3', uy_shat: 'Барилга угсралт', bagts: 'Багц-5.1', ajil_uilchilgee: 'Гадна дулаан',
    heseg_ezleh_huvi: 1, ho_dun_geree: 50, zahiramj_unet_tsaas: 30, zahiramj_borluulalt_dun: 20, geree_ehleh: D(2025, 6, 1), geree_duusah: D(2026, 6, 1) },
  { dd_kod: '5.2.4', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)', heseg_ezleh_huvi: 0.1 },
  { dd_kod: '5.2.4.1', etseg_kod: '5.2.4', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ - 19.1', ajil_uilchilgee: '960 хүүхдийн сургууль',
    heseg_ezleh_huvi: 0.5, ho_dun_geree: 20, guitsetgel_huvi: 12.5, geree_ehleh: D(2026, 1, 1), geree_duusah: D(2027, 1, 1) },
  { dd_kod: '5.2.4.2', etseg_kod: '5.2.4', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ - 20.6', ajil_uilchilgee: 'Цагдаагийн байр', heseg_ezleh_huvi: 0.5, ho_dun_geree: 7 },
];
const blocks = new Map([
  ['БАГЦ1|5/1', { overall: 40, date: '2026-10-01', phases: [] }],
]);
const universe = new Map([['БАГЦ1', ['БАГЦ1|5/1', 'БАГЦ1|5/2']]]);
const plan = assemblePlan(rows, { actual: { blocks, universe, infra: new Map([['БАГЦ51', { pct: 36, blocks: 1, total: 1 }]]) }, sched: null, land: new Map() }, D(2026, 11, 3));

const g = guitsetgelRows(plan, {
  buildings: new Map([['БАГЦ1|5/1', { ail: 71, davhar: 9 }], ['БАГЦ1|5/2', { ail: 117, davhar: 12 }]]),
  contractors: new Map([['БАГЦ1', 'ХХДМГК ХХК'], ['БАГЦ51', 'ОСНААУГ']]),
  groups: new Map([['5.1', [{ no: '2', name: 'Дулааны шугам', pct: 45.5, start: D(2025, 7, 1), end: D(2026, 3, 1) }, { no: '220', name: 'Дулаан механик', pct: null, start: null, end: null }]]]),
});
const byKod = new Map(g.map((r) => [r.kod, r]));

check('guitsetgel — мөрүүд, түвшин, эцэг', () => {
  assert.deepEqual(g.map((r) => r.kod), [PUB_TOTAL, PUB_BUILD, '1', '1-5/1', '1-5/2', '5.1', '5.1-G2', '5.1-G220', '19.1', '20.6'], 'дараалал');
  assert.equal(byKod.get(PUB_TOTAL).tuvshin, 'tosol');
  assert.equal(byKod.get(PUB_BUILD).tuvshin, 'shat');
  assert.equal(byKod.get(PUB_BUILD).etseg_kod, PUB_TOTAL);
  assert.equal(byKod.get('1').tuvshin, 'bagts');
  assert.equal(byKod.get('1').etseg_kod, PUB_BUILD);
  assert.equal(byKod.get('1-5/1').tuvshin, 'blok');
  assert.equal(byKod.get('1-5/1').etseg_kod, '1');
  assert.equal(byKod.get('5.1-G2').tuvshin, 'buleg');
  assert.equal(byKod.get('5.1-G2').etseg_kod, '5.1');
});
check('guitsetgel — явц: блок хэмжилт, хэмжилтгүй = 0, багц = блокуудын дундаж, инженерийн багц = pkgActual', () => {
  assert.equal(byKod.get('1-5/1').guitsetgel_huvi, 40);
  assert.equal(byKod.get('1-5/2').guitsetgel_huvi, 0, 'хэмжилтгүй блок 0 (null биш)');
  assert.equal(byKod.get('1').guitsetgel_huvi, 20, 'багц = 0.5×40 + 0.5×0');
  assert.equal(byKod.get('5.1').guitsetgel_huvi, 36);
  assert.equal(byKod.get('5.1-G2').guitsetgel_huvi, 45.5);
  assert.equal(byKod.get('5.1-G220').guitsetgel_huvi, 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  assert.equal(byKod.get(PUB_BUILD).guitsetgel_huvi, r2(plan.result.values.get(plan.tree.root.children[1]).S), 'барилга угсралт = тэр үе шатны S (2 орон)');
  assert.equal(byKod.get(PUB_TOTAL).guitsetgel_huvi, r2(plan.result.values.get(plan.tree.root).S), 'төслийн нийт = үндэс мөрийн S (2 орон)');
});
check('guitsetgel — гүйцэтгэгч, огноо, айл, давхар', () => {
  assert.equal(byKod.get('1').guitsetgegch_ner, 'ХХДМГК ХХК');
  assert.equal(byKod.get('1-5/1').guitsetgegch_ner, null, 'блок мөрөнд гүйцэтгэгч бичихгүй');
  assert.equal(byKod.get('1').ehleh_ognoo, D(2025, 6, 1));
  assert.equal(byKod.get('1').duusah_ognoo, D(2028, 1, 1));
  assert.equal(byKod.get('1-5/1').ail_too, 71);
  assert.equal(byKod.get('1-5/1').davhar, 9);
  assert.equal(byKod.get('1').ail_too, 188, 'багц = блокуудын айлын нийлбэр');
  assert.equal(byKod.get(PUB_TOTAL).ail_too, 188);
  assert.equal(byKod.get('5.1').ail_too, null, 'инженерийн багцад айл байхгүй');
  assert.equal(byKod.get('5.1-G2').ehleh_ognoo, D(2025, 7, 1));
  assert.equal(byKod.get('19.1').tuvshin, 'bagts', 'нийгмийн байгууламж багцын мөр хэвээр');
  for (const r of g) assert.ok(!('tolov' in r), 'tolov талбар байхгүй (хэрэглэгчийн шийдвэр)');
});

/* 2026-11-04: диапазон мөр багц биш; «Багц-16»-ийн дэд багц (16.1 … 17.7) эцгийн доор; «Нийгмийн дэд бүтэц» зураг төслийн
   хэсэг (2.4) барилгын (5.2.4) өмнө байдаг — явц барилгынхаас */
const rows2 = [
  { dd_kod: '2', etseg_kod: null, uy_shat: 'Зураг төсөл', ajil_uilchilgee: 'Зураг төсөл', tusul_ezleh_huvi: 0.05 },
  { dd_kod: '2.4', etseg_kod: '2', uy_shat: 'Зураг төсөл', ajil_uilchilgee: 'НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)', heseg_ezleh_huvi: 1 },
  { dd_kod: '2.4.1', etseg_kod: '2.4', uy_shat: 'Зураг төсөл', bagts: 'БАГЦ - 19.1', ajil_uilchilgee: '960 хүүхдийн сургууль', heseg_ezleh_huvi: 1, guitsetgel_huvi: 100 },
  ...rows,
  { dd_kod: '5.2.1.8', etseg_kod: '5.2.1', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ 1- 4', ajil_uilchilgee: 'Суурийн холболтын ажил', heseg_ezleh_huvi: 0.1, ho_dun_geree: 80 },
  { dd_kod: '5.2.2', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', bagts: 'Багц-16', ajil_uilchilgee: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ', heseg_ezleh_huvi: 0.2 },
  { dd_kod: '5.2.2.1', etseg_kod: '5.2.2', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ-16.1', ajil_uilchilgee: 'Өндөржилтийн ажил БАГЦ 1', heseg_ezleh_huvi: 0.5, ho_dun_geree: 9, guitsetgel_huvi: 30,
    geree_ehleh: D(2026, 4, 1), geree_duusah: D(2027, 4, 1) },
  { dd_kod: '5.2.2.2', etseg_kod: '5.2.2', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ-17.1', ajil_uilchilgee: 'Гадна тохижилтийн ажил БАГЦ 1', heseg_ezleh_huvi: 0.5, ho_dun_geree: 7 },
  { dd_kod: '5.2.3.1.9', etseg_kod: '5.2.3', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ-6.1, 6.2', ajil_uilchilgee: 'Төгөл дэд станц өргөтгөх', heseg_ezleh_huvi: 0.1, ho_dun_geree: 4 },
];
const plan2 = assemblePlan(rows2, { actual: { blocks, universe, infra: new Map() }, sched: null, land: new Map() }, D(2026, 11, 3));
const g2 = guitsetgelRows(plan2, { buildings: new Map(), contractors: new Map([['БАГЦ161', 'Смарткрафт']]), groups: new Map() });
const byKod2 = new Map(g2.map((r) => [r.kod, r]));
check('guitsetgel — диапазон мөр багц биш («1.4», «6.1,6.2» код гарахгүй)', () => {
  assert.ok(!byKod2.has('1.4'), '«БАГЦ 1- 4» → «1.4» код нийтлэгдэв');
  assert.ok(!byKod2.has('6.1,6.2'), '«БАГЦ-6.1, 6.2» → «6.1,6.2» код нийтлэгдэв');
  assert.ok(!g2.some((r) => /,|^1\.4$/.test(String(r.kod))), 'диапазон код алга');
  assert.equal(byKod2.get('1').tuvshin, 'bagts', 'энгийн багц хэвээр');
});
check('guitsetgel — дэд багц 16.1/17.1 нь «16»-ийн доор, багц түвшин, өөрийн гүйцэтгэгч/явц/огноо', () => {
  assert.equal(byKod2.get('16').tuvshin, 'bagts');
  assert.equal(byKod2.get('16').etseg_kod, PUB_BUILD);
  const s = byKod2.get('16.1');
  assert.ok(s, '16.1 мөр нийтлэгдэх ёстой');
  assert.equal(s.etseg_kod, '16');
  assert.equal(s.tuvshin, 'bagts');
  assert.equal(s.guitsetgegch_ner, 'Смарткрафт');
  assert.equal(s.guitsetgel_huvi, 30);
  assert.equal(s.ehleh_ognoo, D(2026, 4, 1));
  assert.equal(byKod2.get('17.1').etseg_kod, '16', '17.x ч «Багц-16»-ийн хүүхэд (модны бүтэц)');
  assert.equal(byKod2.get('17.1').guitsetgel_huvi, 0, 'хэмжилтгүй 0');
  const i16 = g2.findIndex((r) => r.kod === '16');
  assert.ok(g2.findIndex((r) => r.kod === '16.1') === i16 + 1 && g2.findIndex((r) => r.kod === '17.1') === i16 + 2, 'эцгийн шууд дараа');
  assert.equal(g2.filter((r) => r.tuvshin === 'bagts').length, 7, '1 · 5.1 · 16 · 16.1 · 17.1 · 19.1 · 20.6');
});

/* ══════════ §3 ══════════ */
/* 2026-11-04: олгосон дүн `olgoson_dun`-ийн нийлбэрээс (IPC-ийн `dun`-ийг hoSync бичдэг) */
const planPaid = assemblePlan(rows.map((r) => (r.dd_kod === '5.2.1.1' ? { ...r, olgoson_dun: 400 } : r)), { actual: { blocks: null, universe: null, infra: null }, sched: null, land: new Map() }, D(2026, 7, 2));
check('sanhuu — E, эх үүсвэр, олгосон, хувь', () => {
  const [s] = sanhuuRows(planPaid);
  const E = plan.result.values.get(plan.tree.root).E;
  assert.equal(s.niit_tosov_dun, E);
  assert.equal(E, 1150, 'E = 100 + 1000 + 50 — «Нийслэл төсөв» хэсэг (20 + 7) эцгийн нийлбэрт орохгүй (Excel E718)');
  /* эх үүсвэр — «Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөр (мөрүүдийн амьд нийлбэр) */
  assert.equal(s.tosov_unet_tsaas, 630);
  assert.equal(s.tosov_tosliin_orlogo, 420);
  assert.equal(s.tosov_niislel_tosov, 100);
  assert.equal(s.tosov_nzd_nuuts, null, 'бичигдээгүй эх үүсвэр null');
  assert.equal(s.olgoson_sanhuujilt_dun, 400, 'урьдчилгаа + гүйцэтгэл');
  assert.equal(s.olgoson_huvi, Math.round((400 / 1150) * 1000) / 10);
  assert.ok(!('geree_dun' in s), 'гэрээний дүн өгөхгүй');
});

/* ══════════ §4 ══════════ */
check('hunHuch — компани + нийт, багцын холбоос', () => {
  const day = {
    key: '2026-11-03', at: D(2026, 11, 3), oid: 1, rowsInDay: 1,
    header: { workers: 300, manHours: 2400, technik: 12 },
    comp: {
      HHDMGK: { workers: 200, technik: 5, mongol: 150, gadaad: 50, bagts: 'Багц -1' },
      SC: { workers: 30, technik: 2, mongol: 30, gadaad: 0, bagts: null },
      CHHO: { workers: 4, technik: 0, mongol: null, gadaad: null, bagts: null },
    },
    workers: 234, technik: 7,
  };
  const companies = [
    { sfx: 'HHDMGK', label: 'ХХДМГК ХХК', bagts: 'Багц -1' },
    { sfx: 'SC', label: 'Smart craft', bagts: null },
    { sfx: 'CHHO', label: 'ЧХО', bagts: null },
    { sfx: 'NONE', label: 'байхгүй', bagts: null },
  ];
  const r = hunHuchRows(day, companies);
  assert.equal(r.length, 4, '3 компани + нийт (өдөрт байхгүй компани орохгүй)');
  assert.equal(r[0].bagts_kod, '1');
  assert.equal(r[0].niit_ajiltan_too, 200);
  assert.equal(r[1].bagts_kod, '6.1+6.7', 'маягтад багцгүй — гэрээний холбоос');
  assert.equal(r[2].bagts_kod, null, 'ЧХО багцгүй');
  const t = r[3];
  assert.equal(t.bagts_kod, PUB_TOTAL);
  assert.equal(t.niit_ajiltan_too, 234);
  assert.equal(t.mongol_ajiltan_too, 180);
  assert.equal(t.gadaad_ajiltan_too, 50);
  assert.equal(t.hun_tsag, 2400);
  assert.equal(r[0].hun_tsag, null, 'хүн-цаг зөвхөн нийт мөрд');
  assert.deepEqual(hunHuchRows(null, companies), []);
});

/* ══════════ §5 ══════════ */
check('niigem — төрөл, хүчин чадал, явц, огноо', () => {
  const r = niigemRows(plan);
  assert.equal(r.length, 2);
  assert.equal(r[0].bagts_kod, '19.1');
  assert.equal(r[0].turul, 'сургууль');
  assert.equal(r[0].huchin_chadal, 960);
  assert.equal(r[0].guitsetgel_huvi, 12.5, 'гараар бичсэн guitsetgel_huvi');
  assert.equal(r[0].ehleh_ognoo, D(2026, 1, 1));
  assert.equal(r[1].turul, 'цагдаа');
  assert.equal(r[1].huchin_chadal, null);
  assert.equal(r[1].guitsetgel_huvi, 0, 'хэмжилтгүй 0');
});
check('niigem — ижил нэртэй зураг төслийн хэсэг (2.4) өмнө байсан ч барилгын (5.2.4) явц', () => {
  const first = plan2.tree.nodes.find((n) => /нийгмийн дэд бүтэц/i.test(String(n.row?.ajil_uilchilgee ?? '')) && n.children.length > 0);
  assert.equal(first.phase, 'zurag', 'модонд зураг төслийн хэсэг эхэнд (амьд: 2.4 → 5.2.4)');
  assert.equal(plan2.result.values.get(first.children[0]).S, 100, 'зураг төслийн 19.1 = 100%');
  const r = niigemRows(plan2);
  assert.equal(r.length, 2);
  assert.equal(r[0].bagts_kod, '19.1');
  assert.equal(r[0].guitsetgel_huvi, 12.5, 'барилгын явц (зураг төслийн 100 биш)');
  assert.equal(r[1].guitsetgel_huvi, 0);
});
check('ehUusver — текстээс тоо, төлөв, нэгж', () => {
  const r = ehUusverRows([
    { torol: 'Усан хангамжийн эх үүсвэр', 'нэр': 'Хайлаастын  2000м3 усан сан​', 'хангах_хувь': '80%​', 'нийт_чадал': '6322.4​' },
    { torol: 'Дулааны эх үүсвэр', 'нэр': 'Одоо байгаа Сэлбэ дулааны станц', 'хангах_хувь': '22.8%​', 'нийт_чадал': '21​' },
    { torol: 'Цахилгааны эх үүсвэр', 'нэр': 'Шинээр төлөвлөж буй  110/35/10 дэд станц​', 'хангах_хувь': '62%', 'нийт_чадал': '28.32' },
    { torol: 'Дулааны эх үүсвэр', 'нэр': '' },
  ]);
  assert.equal(r.length, 3, 'нэргүй мөр орохгүй');
  assert.deepEqual(r[0], { turul: 'ус', ner: 'Хайлаастын 2000м3 усан сан', tolov: null, niit_chadal: 6322.4, negj: 'м³/хоног', hangah_huvi: 80 });
  assert.equal(r[1].tolov, 'одоо байгаа');
  assert.equal(r[1].negj, 'МВт');
  assert.equal(r[1].hangah_huvi, 22.8);
  assert.equal(r[2].tolov, 'шинээр барих');
  assert.equal(r[2].turul, 'цахилгаан');
});

/* ══════════ §6 ══════════ */
check('gazar — төсөл + багц, хувь', () => {
  const r = gazarRows(
    { total: 2088, areaM2: 0, cleared: 1945, cleaned: 0, remaining: 143, resolved: 1945, pct: 93.2, byStatus: [], reasons: [] },
    new Map([['БАГЦ1', { total: 400, cleared: 300 }], ['БАГЦ99', { total: 1, cleared: 0 }], ['БАГЦ12', { total: 0, cleared: 0 }]]),
    (k) => (k === 'БАГЦ1' ? '1' : k === 'БАГЦ12' ? '12' : ''),
  );
  assert.equal(r.length, 3, 'кодгүй түлхүүр орохгүй');
  assert.deepEqual(r[0], { bagts_kod: PUB_TOTAL, niit_negj_talbar_too: 2088, choloolson_too: 1945, choloolson_huvi: 93.2 });
  assert.deepEqual(r[1], { bagts_kod: '1', niit_negj_talbar_too: 400, choloolson_too: 300, choloolson_huvi: 75 });
  /* 2026-11-04: нэгж талбаргүй багц = чөлөөлөх газаргүй → 100% (ТТБ `EMPTY_AREA_PCT`-тэй нэг) */
  assert.deepEqual(r[2], { bagts_kod: '12', niit_negj_talbar_too: 0, choloolson_too: 0, choloolson_huvi: 100 });
});
check('diffRows — зөрсөн мөр л, stamp өөрчлөлттэй мөрд, илүү мөр устгана, түлхүүргүй нэг мөр', () => {
  const now = D(2026, 11, 3);
  const cur = [
    { objectid: 1, kod: '00', ner: 'Төслийн нийт', guitsetgel_huvi: 18.6, ail_too: null, shinechilsen_ognoo: 1 },
    { objectid: 2, kod: '1', ner: 'Багц-1', guitsetgel_huvi: 20, ail_too: 1788, shinechilsen_ognoo: 1 },
    { objectid: 3, kod: 'old', ner: 'хуучин', guitsetgel_huvi: 0, ail_too: null, shinechilsen_ognoo: 1 },
  ];
  const want = [
    { kod: '00', ner: 'Төслийн нийт', guitsetgel_huvi: 18.6, ail_too: null },
    { kod: '1', ner: 'Багц-1', guitsetgel_huvi: 21.5, ail_too: 1788 },
    { kod: '2', ner: 'Багц-2', guitsetgel_huvi: 0, ail_too: 2030 },
  ];
  const d = diffRows(cur, want, ['kod'], true, now);
  assert.deepEqual(d.updates, [{ objectid: 2, guitsetgel_huvi: 21.5, shinechilsen_ognoo: now }], 'өөрчлөгдсөн талбар + stamp л');
  assert.deepEqual(d.adds, [{ kod: '2', ner: 'Багц-2', guitsetgel_huvi: 0, ail_too: 2030, shinechilsen_ognoo: now }]);
  assert.deepEqual(d.deletes, [3]);
  const d2 = diffRows(cur.slice(0, 2), want.slice(0, 2), ['kod'], true, now);
  assert.equal(d2.updates.length, 1, 'ижил мөр (00) stamp-гүй, бичигдэхгүй');
  /* sanhuu — түлхүүргүй: эхний мөрийг засна, илүү мөрийг устгана; stamp-гүй хүснэгт (hunHuch) */
  const s = diffRows([{ objectid: 7, a: 1 }, { objectid: 8, a: 1 }], [{ a: 2 }], [], false, now);
  assert.deepEqual(s.updates, [{ objectid: 7, a: 2 }]);
  assert.deepEqual(s.deletes, [8]);
  assert.deepEqual(diffRows([], [{ a: 1 }], [], false, now).adds, [{ a: 1 }]);
  /* тоо ↔ мөр, null ↔ '' ижил */
  const e = diffRows([{ objectid: 1, kod: '1', v: '40', w: '' }], [{ kod: '1', v: 40, w: null }], ['kod'], false, now);
  assert.equal(e.updates.length, 0);
});

console.log(`publicSync.compute: ${n} шалгуур давлаа`);
