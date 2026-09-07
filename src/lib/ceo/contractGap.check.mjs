/**
 * ГЭРЭЭ vs ТӨСӨВТ ӨРТГИЙН ЗӨРҮҮ — цэвэр тооцооны шалгуур.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/contractGap.check.mjs
 *
 * ⚠️ ЛОГИК ХУУЛБАРЛААГҮЙ — жинхэнэ `computeContractGap`/`buildContractGapKpi`.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. ГЭРЭЭГҮЙ мөр 0 зөрүүтэй болох — амьд өгөгдөлд 76-ийн 43 нь гэрээгүй,
 *     тэднийг «таарсан» гэж тоолбол карт худал ногоон.
 *  2. Зөрүүний ТЭМДЭГ урвуулагдах — давсан нь эерэг байх ёстой.
 *  3. Хоосон нийлбэр 0 болох — давсан гэрээ байхгүй үед `mnt(null)` → «—».
 *  4. Төсөвгүй гэрээ «бүхэлдээ давсан» болох.
 *  5. Хувь 0–1 масштабаар өгөгдөх — `pct()` 100-аар үржүүлдэггүй.
 *  6. Хүснэгт бүрэн бус — давсан мөр БҮР нэрээрээ орно; эрэмбэ буурах.
 *  7. «гэрээлсэн X / төсөв Y» ХОЁР ӨӨР популяцийг харьцуулах — төсөв БҮХ
 *     мөрөөс (гэрээгүй 43-ыг оруулаад) бол ~1.5 их наяд хуурамч «хэмнэлт».
 *     Хоёулаа ЗӨВХӨН гэрээтэй мөрөөс; contract − budget = Σover + Σunder
 *     (+ төсөвгүй гэрээний Σ дүн).
 */

import assert from 'node:assert/strict';
import {
  CONTRACT_OVER_BAD_MNT, buildContractGapKpi, computeContractGap, contractOverLevel,
} from './contractGap.ts';
import { CASHFLOW_NEW } from '../services.ts';

const F = CASHFLOW_NEW.fields;
const row = (o) => ({
  [F.detail]: o.work ?? null, [F.project]: o.project ?? null,
  [F.pkg]: o.pkg ?? null, [F.pkg2]: o.pkg2 ?? null,
  [F.budget]: o.b ?? null, [F.contractAmount]: o.c ?? null,
  [F.contractor]: o.co ?? null, [F.contractNo]: o.no ?? null, [F.contractDate]: o.dt ?? null,
});

/* ══════ 1. Гэрээгүй / төсөвгүй мөр ══════ */
{
  const g = computeContractGap([
    row({ work: 'A', b: 100, c: null }),   // гэрээгүй
    row({ work: 'B', b: 100, c: 0 }),      // гэрээгүй (0)
    row({ work: 'C', b: 100, c: '' }),     // гэрээгүй ('')
    row({ work: 'D', b: null, c: 500 }),   // төсөвгүй — зөрүү бодогдохгүй
    row({ work: 'E', b: 0, c: 500 }),      // төсөв 0 = бөглөөгүй
  ]);
  assert.equal(g.total, 5);
  assert.equal(g.noContract, 3);
  assert.equal(g.noBudget, 2);
  assert.equal(g.rows.length, 2, 'зөвхөн гэрээтэй мөр');
  assert.ok(g.rows.every((r) => r.diff === null && r.diffPct === null), 'төсөвгүй → зөрүү null');
  assert.equal(g.over.count, 0);
  assert.equal(g.over.sum, null, 'хоосон нийлбэр null, 0 биш');
  assert.equal(g.under.sum, null);
  assert.equal(g.contractTotal, 1000);
  assert.equal(g.budgetTotal, null, 'гэрээгүй A/B/C-ийн 300 төсөв ОРОХГҮЙ; D/E төсөвгүй → null');
  const k = buildContractGapKpi(g);
  assert.equal(k.value, '—', 'давсан гэрээ алга → «—»');
  assert.equal(k.level, 'good');
  assert.ok(k.facts.some((f) => f.includes('2 ') && f.includes('төсөвт өртөггүй')), k.facts.join(' | '));
  assert.equal(k.tables[0].rows.length, 0);
  assert.equal(k.tables[1].rows.length, 2);
}

/* ══════ 2. Тэмдэг, эрэмбэ, хувь ══════ */
{
  const g = computeContractGap([
    row({ work: 'хэмнэлт', pkg: 'БАГЦ-1', b: 1000, c: 800, co: 'X ХХК', no: 'G1' }),
    row({ work: 'таарсан', pkg: 'БАГЦ-2', b: 1000, c: 1000 }),
    row({ work: 'их давсан', pkg: 'БАГЦ-3', pkg2: 'БАГЦ-3.2', b: 1000, c: 1500 }),
    row({ work: 'бага давсан', pkg: 'БАГЦ-4', b: 200, c: 250 }),
    row({ project: 'нэргүй', pkg: 'БАГЦ-5', b: null, c: 10 }),
  ]);
  assert.deepEqual(g.rows.map((r) => r.work), ['их давсан', 'бага давсан', 'таарсан', 'хэмнэлт', 'нэргүй']);
  assert.equal(g.rows[0].diff, 500, 'давсан = ЭЕРЭГ');
  assert.equal(g.rows[0].diffPct, 50, '0–100 масштаб');
  assert.equal(g.rows[0].pkg, 'БАГЦ-3.2', 'дэд багц давамгайлна');
  assert.equal(g.rows[3].diff, -200, 'хэмнэлт = СӨРӨГ');
  assert.equal(g.rows[3].diffPct, -20);
  assert.equal(g.rows[4].work, 'нэргүй', 'detail хоосон → project');
  assert.equal(g.over.count, 2);
  assert.equal(g.over.sum, 550);
  assert.equal(g.under.count, 1);
  assert.equal(g.under.sum, -200);
  assert.equal(g.contractTotal, 3560);
  assert.equal(g.budgetTotal, 3200);
  assert.equal(contractOverLevel(g), 'warn', 'давсан ч босгоос доош → шар');

  const k = buildContractGapKpi(g);
  assert.equal(k.value, '550 ₮');
  assert.equal(k.level, 'warn');
  assert.equal(k.tables.length, 2);
  assert.equal(k.tables[0].cols.length, 8);
  assert.equal(k.tables[0].rows.length, 2, 'давсан мөр БҮР');
  assert.equal(k.tables[0].rows[0][0].v, 'их давсан');
  assert.deepEqual(k.tables[0].rows[0][6], { v: 500, kind: 'mnt' });
  assert.deepEqual(k.tables[0].rows[0][7], { v: 50, kind: 'pct' });
  assert.equal(k.tables[1].rows.length, 5, 'бүх гэрээтэй мөр');
  assert.equal(k.tables[1].rows[4][6].v, null, 'бодогдоогүй зөрүү null');
  assert.equal(k.tables[1].rows[4][1].v, 'БАГЦ-5');
  assert.equal(k.issues.length, 2);
  assert.ok(k.issues.every((i) => i.tone === 'warn'));
  assert.ok(k.issues[0].text.includes('их давсан') && k.issues[0].text.includes('БАГЦ-3.2') && k.issues[0].text.includes('500 ₮'), k.issues[0].text);
  assert.ok(k.facts[0].startsWith('2 '), k.facts[0]);
  assert.ok(k.facts[1].includes('1 ') && k.facts[1].includes('200 ₮'), k.facts[1]);
  assert.ok(k.facts[2].includes('3,560 ₮') && k.facts[2].includes('3,200 ₮'), k.facts[2]);
  assert.equal(k.facts.length, 4, '«нэргүй» төсөвгүй → 4 дэх баримт');
  assert.ok(k.facts[3].includes('1 ') && k.facts[3].includes('төсөвт өртөггүй'), k.facts[3]);
  assert.equal(k.asOf, null);
  for (const t of k.tables) for (const r of t.rows) assert.equal(r.length, t.cols.length);
}

/* ══════ 2б. Нэг популяци — гэрээгүй мөрийн төсөв нийлбэрт ОРОХГҮЙ ══════ */
{
  const g = computeContractGap([
    row({ work: 'гэрээгүй том', b: 1_500_000, c: null }),   // ⚠️ энэ төсөв хаягдана
    row({ work: 'давсан', b: 1000, c: 1300 }),
    row({ work: 'хэмнэлт', b: 2000, c: 1900 }),
    row({ work: 'төсөвгүй', b: null, c: 50 }),
  ]);
  assert.equal(g.noContract, 1);
  assert.equal(g.budgetTotal, 3000, 'зөвхөн гэрээтэй мөрийн төсөв (1,500,000 орохгүй)');
  assert.equal(g.contractTotal, 3250);
  /* тааруулалт: contract − budget = Σover + Σunder + төсөвгүй гэрээний Σ дүн */
  assert.equal(g.contractTotal - g.budgetTotal, g.over.sum + g.under.sum + 50);
  const k = buildContractGapKpi(g);
  assert.ok(k.facts[2].includes('3,250 ₮') && k.facts[2].includes('3,000 ₮'), k.facts[2]);
  assert.ok(!k.facts[2].includes('1,503,000'), 'гэрээгүй төсөв баримтад орсон байна');
}

/* ══════ 3. Босго ба unknown ══════ */
{
  const g = computeContractGap([row({ work: 'A', b: 1e9, c: 1e9 + CONTRACT_OVER_BAD_MNT })]);
  assert.equal(contractOverLevel(g), 'bad', 'Σ давалт ≥ босго → улаан');
  const g2 = computeContractGap([row({ work: 'A', b: 1e9, c: 1e9 + CONTRACT_OVER_BAD_MNT - 1 })]);
  assert.equal(contractOverLevel(g2), 'warn');
  assert.equal(contractOverLevel(computeContractGap([])), 'unknown', 'мөргүй → unknown');
  assert.equal(contractOverLevel(computeContractGap([row({ b: 5, c: null })])), 'unknown', 'гэрээтэй мөргүй → unknown');
  const k = buildContractGapKpi(computeContractGap([]));
  assert.equal(k.value, '—');
  assert.equal(k.level, 'unknown');
  assert.equal(k.tables[1].rows.length, 0);
}

/* ══════ 4. Мөрийн хязгаар — тасалсан тоо ил ══════ */
{
  const many = Array.from({ length: 310 }, (_, i) => row({ work: `W${i}`, b: 100, c: 101 + i }));
  const k = buildContractGapKpi(computeContractGap(many));
  assert.equal(k.tables[0].rows.length, 301, '300 + «… бас N мөр»');
  assert.ok(String(k.tables[0].rows[300][0].v).includes('10'), 'тасалсан тоо ил');
  assert.equal(k.issues.length, 310, 'анхааруулга таслагдахгүй');
}

console.log('✅ contractGap.check: бүх шалгалт давлаа');
