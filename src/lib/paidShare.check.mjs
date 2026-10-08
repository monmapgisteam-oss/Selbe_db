/**
 * «ОЛГОСОН ÷ ГЭРЭЭЛСЭН ДҮН» — ПОРТАЛЫН НЭГ ТОДОРХОЙЛОЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/paidShare.check.mjs
 *
 * Хамгаалах алдаа: «IPC» хуудас · ТУХ 26.47% (HO-ийн гэрээт дүн), Тайлан · удирдлагын
 * тайлан · CEO карт 26.01% (Cashflow-ийн гэрээлсэн дүн) — нэг үзүүлэлт, хоёр тоо.
 *  1. `paidShareOf` — тоологч = гэрээлсэн багцын олголт, хуваарь = Cashflow CONTRACTED ∧ inTotal.
 *  2. Ижил оролтод бүх дуудагч (CEO карт · «IPC» толгой · томьёо) ЯГ нэг утга.
 *  3. Дуудагч файлууд томьёогоо ДАХИН бичээгүй — `paidShare`-ээс импортолно.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paidShareOf, paidPctOf, PAID_SHARE_CONTRACTED } from './paidShare.ts';
import { ipcHeadShare, ipcTotals, contractBlocks } from './ipcTable.ts';
import { groupHo } from './ipc.ts';
import { computeIpc } from './ceo/ipc.ts';
import { pct } from './format.ts';
import { CONTRACTED } from './gdash.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const near = (a, b, msg) => assert.ok(a != null && b != null && Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≉ ${b}`);

/* ── Хуурамч өгөгдөл ──
   Cashflow: Багц 1 (гэрээлсэн 800), Багц 2 (гэрээлсэн 1200), Багц 3 (гэрээгүй — төсөв л),
             5-р хэсгийн мөр (inTotal-аас ГАДУУР, гэрээлсэн 999 — хуваарьт орохгүй).
   HO: Багц-1 200 + 100, Багц-2 300, Багц-3 50 (гэрээгүй багц), «Багц-1-4» 40 (диапазон),
       `dun` хоосон мөр (алгасна). HO-ийн гэрээт дүн (gereet_tosov_niit) нь Cashflow-оос ӨӨР. */
const CF = (o) => ({
  OBJECTID: o.oid, bagts: o.pkg, bagts2: o.pkg2 ?? null, bagts_tuvshin1: o.sec ?? '2',
  ho_dungiin_tailbar: o.note ?? '', geree_dun: o.contract ?? null, ho_dun_geree: o.cost ?? null,
});
const cf = [
  CF({ oid: 1, pkg: 'БАГЦ-1', note: CONTRACTED, contract: 800 }),
  CF({ oid: 2, pkg: 'БАГЦ-2', note: CONTRACTED, contract: 1200 }),
  CF({ oid: 3, pkg: 'БАГЦ-3', note: 'Урьдчилсан тооцоо', contract: 500, cost: 600 }),
  CF({ oid: 4, pkg: 'БАГЦ-9', note: CONTRACTED, contract: 999, sec: '5' }),
];
const HO = (o) => ({
  OBJECTID: o.oid, geree_kod: o.code, bagts: o.pkg, dun: o.dun, ipc_dugaar: o.no ?? null,
  tulult_turul: 'Гүйцэтгэл', gereet_tosov_niit: o.ct ?? null, tosov_niit: null, guilgee_ognoo: null,
});
const ho = [
  HO({ oid: 1, code: 'Багц-1', pkg: 'Багц-1', dun: 200, no: 1, ct: 780 }),
  HO({ oid: 2, code: 'Багц-1', pkg: 'Багц-1', dun: 100, no: 2, ct: 780 }),
  HO({ oid: 3, code: 'Багц-2', pkg: 'Багц-2', dun: 300, no: 1, ct: 1190 }),
  HO({ oid: 4, code: 'Багц-3', pkg: 'Багц-3', dun: 50, no: 1, ct: null }),
  HO({ oid: 5, code: 'Багц-1-4', pkg: 'Багц-1-4', dun: 40, no: 1, ct: null }),
  HO({ oid: 6, code: 'Багц-2', pkg: 'Багц-2', dun: null, no: 2, ct: 1190 }),
];

console.log('\n1. paidShareOf — Тайлан/CEO-гийн тодорхойлолт');
const s = paidShareOf(cf, ho);
ok('хуваарь = Cashflow CONTRACTED ∧ inTotal (800 + 1200); 5-р хэсэг ба гэрээгүй мөр орохгүй', () => {
  assert.equal(s.contract, 2000);
});
ok('тоологч = гэрээлсэн багцын олголт (200 + 100 + 300); гэрээгүй/диапазон → paidOther', () => {
  assert.equal(s.paid, 690, 'БҮХ олголт (хоосон dun алгасна — null ≠ 0)');
  assert.equal(s.paidContracted, 600);
  assert.equal(s.paidOther, 90);
  near(s.pct, 30);
});
ok('gdash.CONTRACTED-тай ижил тэмдэгт', () => assert.equal(PAID_SHARE_CONTRACTED, CONTRACTED));
ok('null ≠ 0: хуваарь 0 / тоологч уншигдаагүй / HO мөргүй → null', () => {
  assert.equal(paidPctOf(10, 0), null);
  assert.equal(paidPctOf(null, 100), null);
  assert.equal(paidShareOf(cf, []).pct, null);
  assert.equal(paidShareOf([], ho).pct, null);
});

ok('2026-10-09: холбоостой багц (HO «Багц-8.1» → «Багц 8», HO «Багц-7» ↔ Cashflow «БАГЦ-7.1») гэрээлсэнд тоологдоно', () => {
  const cfA = [
    CF({ oid: 11, pkg: 'Багц 8', note: CONTRACTED, contract: 400 }),
    CF({ oid: 12, pkg: 'БАГЦ-7.1', note: CONTRACTED, contract: 600 }),
  ];
  const hoA = [
    HO({ oid: 11, code: 'Багц-8.1', pkg: 'Багц-8.1', dun: 32 }),
    HO({ oid: 12, code: 'Багц-7', pkg: 'Багц-7', dun: 187 }),
    HO({ oid: 13, code: 'Багц-1-4', pkg: 'Багц-1-4', dun: 5 }),
  ];
  const a = paidShareOf(cfA, hoA);
  assert.equal(a.paidContracted, 219, 'холбоостой олголт paidOther-д хаягдахгүй');
  assert.equal(a.paidOther, 5, 'зөвхөн диапазон мөр гадуур');
});

console.log('\n2. Ижил оролт → бүх дуудагч ЯГ нэг утга');
const ref = { contract: s.contract, paidContracted: s.paidContracted };
ok('Тайлан (buildFindings.paidRate) / удирдлагын тайлан (fin.share) — paidPctOf(finance)', () => {
  /* reportData.finance = { contractAmount: share.contract, paidContracted: share.paidContracted } */
  near(paidPctOf(s.paidContracted, s.contract), s.pct);
});
ok('CEO IPC карт — «гэрээнд эзлэх» нь ижил хувь', () => {
  const k = computeIpc(ho, Date.now(), ref);
  assert.ok(k.facts.includes(`гэрээнд эзлэх ${pct(s.pct)}`), k.facts.join(' | '));
});
ok('«IPC» хуудасны толгой — Cashflow-ийн хувь, HO-ийн гэрээт дүнгийнх БИШ', () => {
  const t = ipcTotals(contractBlocks(groupHo(ho)));
  const h = ipcHeadShare(t, { contract: s.contract, pct: s.pct, paidOther: s.paidOther });
  assert.equal(h.src, 'cashflow');
  near(h.pct, s.pct);
  assert.equal(h.other, 90, 'хувьд ороогүй олголт тусад нь');
  assert.notEqual(t.paidPct, h.pct, 'HO-ийн хувь (урьдын 26.47%-ийн хэлбэр) өөр байх ёстой — тест утга учиртай');
});
ok('«IPC» — loadFinance уналтад HO-ийн хувь «HO хүснэгтээр» нөөц', () => {
  const t = ipcTotals(contractBlocks(groupHo(ho)));
  const h = ipcHeadShare(t, null);
  assert.equal(h.src, 'ho');
  assert.equal(h.pct, t.paidPct);
});

console.log('\n3. Дуудагчид томьёогоо давтаагүй');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
for (const [file, names] of [
  ['./reportData.ts', ['paidShareOf', 'paidPctOf']],
  ['./execReport.ts', ['paidPctOf']],
  ['./ceo/ipc.ts', ['paidPctOf']],
  ['../modules/IpcTable.tsx', ['paidPctOf', 'ipcHeadShare']],
  ['../modules/tuh/model.ts', ['paidShareOf']],
]) {
  ok(`${file} → @/lib/paidShare`, () => {
    const src = read(file);
    assert.ok(src.includes("from '@/lib/paidShare'"), 'импорт алга');
    for (const nm of names) assert.ok(src.includes(`${nm}(`), `${nm} дуудагдаагүй`);
    assert.ok(!/paidContracted\s*\/\s*\w/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'гараар бичсэн «paidContracted / …» томьёо');
  });
}

console.log(`\n${n} шалгалт ✓`);
