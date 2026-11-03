/**
 * БАГЦЫН ЯВЦ — ЖИНЛЭСЭН ДУНДАЖ (`pkgProgressOf` + Excel F жин, 2026-11-03). Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/pkgProgressWeights.check.mjs
 *
 * Хамгаалах алдаа: ТТБ (Excel F жин) ба самбар (энгийн дундаж) зөрдөг байсан — Багц 1: 32.99 ↔ 32.92.
 *   1. Жинтэй: Σ w·S ÷ Σ w — 9 давхар 4.458, 12 давхар 5.813 (бодит Excel).
 *   2. Тайлагнаагүй блок 0% боловч жин нь хуваарьт ОРНО.
 *   3. Жингүй блок — мэдэгдэж буй жингийн дундаж; жин огт байхгүй (null / хоосон) — энгийн дундаж (урьдын зан).
 *   4. `blocks`/`total` тоо өөрчлөгдөхгүй.
 */
import assert from 'node:assert/strict';
import { pkgProgressOf } from './blockProgress.ts';

const cell = (overall) => ({ overall, date: '2026-11-03', phases: [] });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

const pm = new Map([
  ['БАГЦ1|5/1', cell(40)], ['БАГЦ1|5/2', cell(20)], ['БАГЦ1|29/1', cell(60)],
  ['БАГЦ2|5/1', cell(50)],
]);
const uni = new Map([['БАГЦ1', ['БАГЦ1|5/1', 'БАГЦ1|5/2', 'БАГЦ1|29/1', 'БАГЦ1|29/2']], ['БАГЦ2', ['БАГЦ2|5/1', 'БАГЦ2|5/2']]]);

/* 1–2. жинтэй: 9 давхар 1, 12 давхар 1.5; 29/2 тайлагнаагүй → 0 × 1.5 */
const w = new Map([['БАГЦ1|5/1', 1], ['БАГЦ1|5/2', 1], ['БАГЦ1|29/1', 1.5], ['БАГЦ1|29/2', 1.5]]);
const m = pkgProgressOf(pm, uni, w);
near(m.get('БАГЦ1').pct, (40 * 1 + 20 * 1 + 60 * 1.5 + 0 * 1.5) / 5, 'жинлэсэн дундаж');
assert.equal(m.get('БАГЦ1').blocks, 3);
assert.equal(m.get('БАГЦ1').total, 4);

/* 3. жингүй багц (БАГЦ2 жин алга) → энгийн дундаж; null жин → бүгд энгийн */
near(m.get('БАГЦ2').pct, 50 / 2, 'жингүй багц энгийн дундаж');
const plain = pkgProgressOf(pm, uni, null);
near(plain.get('БАГЦ1').pct, (40 + 20 + 60 + 0) / 4, 'жин null — энгийн дундаж (урьдын зан)');
near(pkgProgressOf(pm, uni, new Map()).get('БАГЦ1').pct, 30, 'хоосон жин — энгийн дундаж');

/* 3б. зарим блок жингүй → мэдэгдэж буй жингийн дундаж */
const w2 = new Map([['БАГЦ1|5/1', 2], ['БАГЦ1|29/1', 4]]); // 5/2, 29/2 жингүй → 3
near(pkgProgressOf(pm, uni, w2).get('БАГЦ1').pct, (40 * 2 + 20 * 3 + 60 * 4 + 0 * 3) / 12, 'жингүй блок дундаж жинтэй');

/* Бодит Excel: Багц 1 — 12 блок × 4.458 + 8 блок × 5.813 */
const S9 = [39.17, 39.58, 39.58, 39.17, 29.49, 30.39, 12.52, 12.52, 40.60, 40.60, 33.39, 33.39];
const S12 = [31.15, 31.15, 24.38, 30.30, 41.01, 40.64, 33.88, 35.52];
const pm1 = new Map(), w1 = new Map(), keys = [];
S9.forEach((s, i) => { const k = `БАГЦ1|5/${i + 1}`; pm1.set(k, cell(s)); w1.set(k, 4.458); keys.push(k); });
S12.forEach((s, i) => { const k = `БАГЦ1|29/${i + 1}`; pm1.set(k, cell(s)); w1.set(k, 5.813); keys.push(k); });
const r1 = pkgProgressOf(pm1, new Map([['БАГЦ1', keys]]), w1).get('БАГЦ1').pct;
const expect = (S9.reduce((a, s) => a + s * 4.458, 0) + S12.reduce((a, s) => a + s * 5.813, 0)) / (12 * 4.458 + 8 * 5.813);
near(r1, expect, 'Багц 1 Excel жин');
assert.ok(Math.abs(r1 - 32.985) < 0.01, `Багц 1 ≈ 32.985 (ТТБ), биш ${r1}`);
assert.ok(Math.abs(pkgProgressOf(pm1, new Map([['БАГЦ1', keys]]), null).get('БАГЦ1').pct - 32.922) < 0.01, 'энгийн дундаж 32.922 (хуучин самбар)');

console.log('pkgProgressWeights.check: ok');
