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

/* 6. Бичгийн өнгө — цайвар түвшинд хар-хүрэн, улаан (маш муу) дээр цагаан, өгөгдөлгүйд хар-хүрэн */
{
  assert.notEqual(scoreColor(90), scoreInk(90));
  assert.equal(scoreInk(55), '#1a1205');
  assert.equal(scoreInk(10), '#ffffff');
  assert.equal(scoreInk(null), '#1a1205');
}

console.log('score.check: OK');
