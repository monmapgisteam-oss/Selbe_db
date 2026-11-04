/**
 * Полигоныг 3D-д босгох — `extrude3d.ts`.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/extrude3d.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUBE_NEAR_SCALE, flatLineRenderer, flatLineSymbol, extrudeRenderer, extrudeSymbol, pillarRenderer, pillarSymbol, tubeElevation, tubeRenderer, tubeSymbol } from './extrude3d.ts';

const rgb = (r, g, b, a) => ({ r, g, b, a });
const fill = { type: 'simple-fill', color: rgb(38, 151, 168, 0.3), outline: { color: rgb(38, 151, 168, 1) } };

const e = extrudeSymbol(fill, 5);
assert.equal(e.type, 'polygon-3d');
assert.equal(e.symbolLayers[0].size, 5, '5 м');
assert.deepEqual(e.symbolLayers[0].material.color, [38, 151, 168, 0.8], 'өнгө хэвээр, нимгэн дүүргэлт тодруулна');
const hollow = extrudeSymbol({ ...fill, color: rgb(0, 0, 0, 0), outline: { color: rgb(200, 10, 10, 1) } }, 5);
assert.deepEqual(hollow.symbolLayers[0].material.color, [200, 10, 10, 1], 'дүүргэлтгүй → хүрээний өнгө');
const ln = { type: 'cim' };
assert.equal(extrudeSymbol(ln, 5), ln, 'шугамын симбол хөндөгдөхгүй');
assert.equal(extrudeSymbol(null, 5), null);
console.log('✅ extrudeSymbol: 5 м · өнгө · шугам хөндөгдөхгүй');

const u = extrudeRenderer({ defaultSymbol: fill, uniqueValueInfos: [{ value: 'a', symbol: fill }, { value: 'b', symbol: ln }] }, 5);
assert.equal(u.defaultSymbol.type, 'polygon-3d');
assert.equal(u.uniqueValueInfos[0].symbol.type, 'polygon-3d');
assert.equal(u.uniqueValueInfos[1].symbol, ln);
assert.equal(extrudeRenderer({ symbol: fill }, 5).symbol.type, 'polygon-3d', 'simple');
assert.equal(extrudeRenderer({ classBreakInfos: [{ symbol: fill }] }, 5).classBreakInfos[0].symbol.type, 'polygon-3d', 'class-breaks');
console.log('✅ extrudeRenderer: simple · unique-value · class-breaks');

const cimLine = (dash) => ({ type: 'cim', data: { symbol: { type: 'CIMLineSymbol', symbolLayers: [
  { color: [255, 140, 0, 100], ...(dash ? { effects: [{ type: 'CIMGeometricEffectDashes' }] } : {}) }, { color: [11, 18, 32, 40] },
] } } });
const t = tubeSymbol(cimLine(false), 1);
assert.equal(t.type, 'line-3d');
assert.equal(t.symbolLayers[0].type, 'path');
assert.equal(t.symbolLayers[0].width, 1, 'голч 1 м');
assert.deepEqual(t.symbolLayers[0].material.color, [255, 140, 0, 1], 'CIM-ийн цөмийн өнгө (бараан хүрээ биш)');
assert.deepEqual(tubeSymbol({ type: 'simple-line', color: rgb(1, 2, 3, 1) }, 1).symbolLayers[0].material.color, [1, 2, 3, 1], 'simple-line');
assert.equal(tubeSymbol(fill, 1), fill, 'полигон хөндөгдөхгүй');
assert.equal(tubeRenderer({ symbol: cimLine(true) }, 1).symbol.type, 'line-3d');
assert.equal(tubeElevation(1).mode, 'relative-to-ground', 'хоолойд on-the-ground хүчингүй');
assert.equal(tubeElevation(1).offset, 0.5, 'хагас голчоор өргөнө');
console.log('✅ tubeSymbol: 1 м хоолой · өнгө · газар дээр');

assert.deepEqual(flatLineSymbol(cimLine(false), 1), { type: 'simple-line', color: [255, 140, 0, 1], style: 'solid', width: 0.75 }, 'алсын шугам 1px');
assert.equal(flatLineSymbol(cimLine(true), 1).style, 'dash', 'алсад тасархай хэвээр');
assert.equal(flatLineSymbol(fill, 1), fill, 'полигон хөндөгдөхгүй');
assert.equal(flatLineRenderer({ symbol: cimLine(false) }, 1).symbol.type, 'simple-line');
assert.ok(TUBE_NEAR_SCALE > 0);
console.log('✅ flatLineSymbol: алсад хөнгөн шугам · тасархай хэвээр');

const dot = { type: 'simple-marker', color: rgb(10, 20, 30, 0.95) };
const p = pillarSymbol(dot, 1);
assert.equal(p.type, 'point-3d');
assert.equal(p.symbolLayers[0].resource.primitive, 'cylinder');
assert.equal(p.symbolLayers[0].height, 1, '1 м');
assert.equal(p.symbolLayers[0].anchor, 'bottom', 'газар дээр зогсоно');
assert.deepEqual(p.symbolLayers[0].material.color, [10, 20, 30, 0.95], 'өнгө хэвээр');
assert.equal(pillarSymbol(fill, 1), fill, 'полигон хөндөгдөхгүй');
const pr = pillarRenderer({ symbol: dot, visualVariables: [{ type: 'size' }] }, 1);
assert.equal(pr.symbol.type, 'point-3d');
assert.equal(pr.visualVariables, null, 'масштабын хэмжээ биетийг метрээр томруулахгүй');
console.log('✅ pillarSymbol: цилиндр · өнгө · visualVariables хасагдсан');

const m = readFileSync(new URL('./MapCanvas.tsx', import.meta.url), 'utf8');
assert.match(m, /if \(!map \|\| !ready \|\| dim !== '3d' \|\| \(!extrudeM && !tubeM && !pointM\)\) return;/, 'зөвхөн 3D-д');
assert.match(readFileSync(new URL('../modules/DedButets.tsx', import.meta.url), 'utf8'), /extrudeM=\{[\d.]+\}\s+tubeM=\{[\d.]+\}/, 'дэд бүтэц: полигоны өндөр · хоолойн голч');
assert.match(m, /tubeNear \? tubeRenderer\(base, tubeM as number\) : flatLineRenderer\(base, 1\)/, 'хоолой зөвхөн ойрт');
assert.match(m, /if \(ours && cur\.key === key\) continue;/, 'өөрчлөгдөөгүй давхаргыг дахин зурахгүй');
console.log('✅ холболт: зөвхөн 3D · полигоны өндөр · хоолойн голч · хоолой зөвхөн ойрт');
