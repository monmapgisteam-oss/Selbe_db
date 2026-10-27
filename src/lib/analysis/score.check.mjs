/**
 * НОРМЫН ЗАСВАРЫН ХЯЗГААРЛАЛТ (`patchNorm`) ба онооны бичгийн өнгө (`scoreInk`).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/analysis/score.check.mjs
 *
 * ⚠️ 2026-10-09: Жингийн тохиргоонд «Нормын доод» > «Нормын дээд» гэх мэт урвуу муж
 *    оноолтыг чимээгүй эвдэж байв. Сүлжээ ХЭРЭГГҮЙ — цэвэр функц.
 */

import assert from 'node:assert/strict';
import { patchNorm, scoreIndicator, scoreInk, scoreColor } from './score.ts';

const band = { id: 'b', name: 'b', short: 'b', unit: '', norm: '', mode: 'band', weight: 10, decimals: 0, cat: 'urban',
  hardMin: 0, optMin: 10, optMax: 20, hardMax: 40 };
const higher = { ...band, id: 'h', mode: 'higher', target: 50, hardMin: 10 };
const lower = { ...band, id: 'l', mode: 'lower', best: 5, hardMax: 15 };

/* 1. band — hardMin ≤ optMin ≤ optMax ≤ hardMax */
{
  let r = patchNorm(band, 'optMin', 30);           // optMax (20)-оос их
  assert.equal(r.ind.optMin, 20); assert.equal(r.clamped, true);
  assert.equal(r.ind.optMax, 20, 'хөрш талбар хөдлөхгүй');
  r = patchNorm(band, 'optMax', 5);                // optMin (10)-оос бага
  assert.equal(r.ind.optMax, 10); assert.equal(r.clamped, true);
  r = patchNorm(band, 'hardMin', 15);              // optMin (10)-оос их
  assert.equal(r.ind.hardMin, 10);
  r = patchNorm(band, 'hardMax', 12);              // optMax (20)-оос бага
  assert.equal(r.ind.hardMax, 20);
  r = patchNorm(band, 'optMin', 12);               // хүчинтэй
  assert.equal(r.ind.optMin, 12); assert.equal(r.clamped, false);
  // хумисан норм нь оноолтыг эвдэхгүй: норм доторх утга 100
  const fixed = patchNorm(band, 'optMin', 30).ind;  // optMin = optMax = 20
  assert.equal(scoreIndicator(20, fixed), 100);
  assert.ok(scoreIndicator(15, fixed) < 100, 'нормоос доош утга 100 авахгүй');
}

/* 2. higher — hardMin ≤ target */
{
  assert.equal(patchNorm(higher, 'hardMin', 80).ind.hardMin, 50);
  assert.equal(patchNorm(higher, 'target', 3).ind.target, 10);
  assert.equal(patchNorm(higher, 'target', 60).clamped, false);
}

/* 3. lower — best ≤ hardMax */
{
  assert.equal(patchNorm(lower, 'best', 30).ind.best, 15);
  assert.equal(patchNorm(lower, 'hardMax', 1).ind.hardMax, 5);
  assert.equal(patchNorm(lower, 'hardMax', 25).clamped, false);
}

/* 4. жин ≥ 0; NaN нь өөрчлөлтгүй */
{
  assert.equal(patchNorm(band, 'weight', -3).ind.weight, 0);
  assert.equal(patchNorm(band, 'optMin', Number.NaN).ind, band);
}

/* 5. Тодорхойгүй хөрш хязгаар болохгүй */
{
  const loose = { ...band, hardMin: undefined };
  assert.equal(patchNorm(loose, 'optMin', -50).ind.optMin, -50);
}

/* 6. Бичгийн өнгө — ⚠️ 2026-10-09 (аудит №3): горимоос хамаарна (дэвсгэр нь --score-N токен).
      Цайвар: улаан (маш муу) ба бараан ногоон (маш сайн) дээр цагаан, бусад хар-хүрэн,
      өгөгдөлгүй (--ink-3 #5a6a80) дээр цагаан. Dark: бүх шат цайвар тул хар-хүрэн. */
{
  assert.notEqual(scoreColor(90), scoreInk(90));
  assert.equal(scoreInk(55), '#1a1205');
  assert.equal(scoreInk(10), '#ffffff');
  assert.equal(scoreInk(90), '#ffffff', 'цайвар «Маш сайн» #147c3b дээр хар-хүрэн 3.5:1 байсан');
  assert.equal(scoreInk(null), '#ffffff');
  assert.equal(scoreInk(10, true), '#1a1205', 'dark «Маш муу» #f87171 дээр цагаан 2.8:1 байсан');
  assert.equal(scoreInk(90, true), '#1a1205');
  assert.equal(scoreInk(null, true), '#1a1205');
  /* Газрын зургийн hex = самбарын токен (chartStyle.check токентой тулгана) */
  assert.equal(scoreColor(90), '#147c3b');
  assert.equal(scoreColor(90, true), '#34d399');
  assert.equal(scoreColor(10), '#dc2626');
  assert.equal(scoreColor(10, true), '#f87171');
  assert.equal(scoreColor(55, true), '#fbbf24');
}

/* 7. ⚠️ 2026-10-22 (аудит): хэмжсэн жингийн босго · дэлгэцийн нарийвчлал · норм хамаарахгүй төрөл */
{
  const { urbanScore, normFor, passesNorm, normGap, atPrecision } = await import('./score.ts');
  const { INDICATORS, ASSUME_MET, MIN_MEASURED_SHARE, densityNormOf } = await import('./config.ts');
  const RES = 'Орон сууцны бүс';
  /* `computeRaw`-ын адил: таамгийн үзүүлэлт норм хангасан утгатай (social 100 % · engineering 100 м) */
  const assumed = Object.fromEntries(Object.keys(ASSUME_MET).map((k) => [k, 100]));
  /* (а) Зөвхөн FAR+BCR (27/92) + таамаг → урьд 100, одоо null («coverage») */
  const thin = urbanScore({ far: 1.0, bcr: 30, ...assumed }, INDICATORS, RES);
  assert.equal(thin.score, null, 'FAR+BCR л хэмжигдсэн бүс оноогүй');
  assert.equal(thin.reason, 'coverage');
  assert.ok(Math.abs(thin.coverage - 27 / 92) < 1e-9, `хэмжсэн жин 27/92 (${thin.coverage})`);
  assert.ok(thin.coverage < MIN_MEASURED_SHARE);
  /* (б) Хагасаас дээш хэмжигдсэн — оноотой, coverage = 77/92 (таамаг хэмжсэнд орохгүй) */
  const full = urbanScore({ green: 8, density: 350, far: 1.0, bcr: 30, parking: 100, ...assumed }, INDICATORS, RES);
  assert.equal(full.score, 100);
  assert.equal(full.reason, null);
  assert.ok(Math.abs(full.coverage - 77 / 92) < 1e-9);
  /* (в) Хил дээр: density+far+bcr = 51/92 ≥ 50% → оноотой; density+bcr+parking = 42/92 → оноогүй */
  assert.notEqual(urbanScore({ density: 350, far: 1, bcr: 30, ...assumed }, INDICATORS, RES).score, null);
  assert.equal(urbanScore({ density: 350, bcr: 30, parking: 100, ...assumed }, INDICATORS, RES).score, null);
  /* (г) Юу ч алга — nodata */
  const none = urbanScore({}, INDICATORS, RES);
  assert.deepEqual([none.score, none.reason, none.coverage], [null, 'nodata', 0]);
  /* (д) Дэлгэцийн нарийвчлал: E-5 FAR 1.2017 → «1.20» ≤ 1.20 хангасан (урьд 44) */
  const far = normFor(INDICATORS.find((i) => i.id === 'far'), RES);
  assert.equal(atPrecision(1.2017, 2), 1.2);
  assert.equal(passesNorm(1.2017, far), true);
  assert.equal(normGap(1.2017, far), 0);
  assert.equal(passesNorm(1.21, far), false);
  const bcr = normFor(INDICATORS.find((i) => i.id === 'bcr'), RES);
  assert.equal(passesNorm(40.04, bcr), true, '«40.0» ≤ 40');
  assert.equal(passesNorm(40.05379, bcr), false, '«40.1» > 40 — дэлгэцэд харагдах ч зөрчил');
  /* (е) Хүснэгт 6.1-д ангилалгүй төрөл — норм хамаарахгүй (урьд орон сууцны 1.2 далд) */
  assert.equal(densityNormOf('Газар чөлөөлөлт дутуу'), null);
  assert.equal(densityNormOf('Дэд бүтэц'), null);
  assert.equal(densityNormOf('Үл мэдэгдэх төрөл'), null, 'далд нөөц алга');
  assert.equal(densityNormOf('Таун хаус').farMax, 1.2, 'таун хаус — ИЛ бүртгэлтэй');
  assert.equal(densityNormOf('Олон нийтийн бүс').farMax, 3.0);
  const naFar = normFor(INDICATORS.find((i) => i.id === 'far'), 'Газар чөлөөлөлт дутуу');
  assert.equal(naFar.na, true);
  assert.equal(passesNorm(2.4044, naFar), null, 'D-11.1 FAR 2.40 — зөрчил БИШ, дүгнэгдэхгүй');
  assert.equal(normGap(2.4044, naFar), null);
  const d11 = urbanScore({ far: 2.4044, bcr: 39.99, parking: 3.2, ...assumed }, INDICATORS, 'Газар чөлөөлөлт дутуу');
  assert.equal(d11.parts.far.score, null);
  assert.equal(d11.score, null, 'хэмжсэн жин 10/92 — оноогүй (урьд хамгийн муу бүс)');
}

console.log('score.check: OK');
