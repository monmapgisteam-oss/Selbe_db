/**
 * БҮСИЙН ШҮҮЛТ — `layerWhere`-тэй харагдацад ч бүс сонгоход зураг шүүгдэнэ (2026-10-22, аудит).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/components/mapZoneFilter.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `MapCanvas`: `layerWhere` өгөгдмөгц жагсаалтад БАЙХГҮЙ (эсвэл `null`) давхарга ч бүсийн шүүлтээ алддаг байв —
 *      «Ерөнхий дашбоард» үргэлж `layerWhere` дамжуулдаг тул Багц-1 сонгоход KPI 30 барилга, зураг 368 гардаг байв.
 *   2. «Ерөнхий дашбоард»-д бүсийн ПОЛИГОН дарахад `ZONE_ID` (бүсийн давхаргад ТИЙМ ТАЛБАР БАЙХГҮЙ) уншиж юу ч
 *      болохгүй, эсвэл түүхий «E-5-1»/«Багц -1» бичиглэл тавигдаж чип (каноник) тодрохгүй байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { zoneCanon, zoneWhere, ZONE_NONE, ZONE_LAYER, ZONE_FIELDS, LAYER_BY_ID } = await import('@/lib/services.ts');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const read = (p) => strip(readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n'));

/* ── 1. MapCanvas: өөрийн WHERE-гүй давхарга бүсийн шүүлтээ хадгална ── */
{
  const mc = read('./MapCanvas.tsx');
  assert.match(mc, /const own = layerWhere\?\.\[l\.id\] \?\? null;/, '`layerWhere`-д алга/null давхарга → own = null');
  assert.match(mc, /const base = own \?\? \(zone \? zoneWhere\(d, zone\) : null\);/, 'own алга бол бүсийн шүүлт (`zoneWhere`)');
  assert.ok(!/layerWhere \? layerWhere\[l\.id\] \?\? null : undefined/.test(mc), 'хуучин «layerWhere өгөгдвөл бүсийг алгасах» зам буцав');
  /* зан төлөв — дээрх хоёр мөрийн ЯГ дүрмээр, жинхэнэ `zoneWhere`-ээр */
  const baseOf = (layerWhere, id, zone) => {
    const own = layerWhere?.[id] ?? null;
    return own ?? (zone ? zoneWhere(LAYER_BY_ID[id], zone) : null);
  };
  const B = 'et:24';
  assert.ok(LAYER_BY_ID[B], 'барилгын давхарга (et:24) бүртгэлд алга');
  const zw = zoneWhere(LAYER_BY_ID[B], 'Багц-1');
  assert.ok(zw, 'et:24 бүсээр шүүгддэг байх ёстой');
  assert.equal(baseOf({ 'land:left': null }, B, 'Багц-1'), zw, 'жагсаалтад алга давхарга — бүсээр (урьд нь шүүлтгүй)');
  assert.equal(baseOf({ [B]: null }, B, 'Багц-1'), zw, '`null` — бүсээр (урьд нь шүүлтгүй)');
  assert.equal(baseOf({ [B]: 'objectid IN (1,2)' }, B, 'Багц-1'), 'objectid IN (1,2)', 'тодорхой WHERE бүсийг ДАРНА (хуучин дүрэм)');
  assert.equal(baseOf({ [B]: '1=0' }, B, 'Багц-1'), '1=0', '«хоослох» шүүлт хэвээр');
  assert.equal(baseOf({}, B, null), null, 'бүс сонгоогүй — шүүлтгүй');
}
console.log('✅ MapCanvas: layerWhere-д алга/null давхарга бүсийн шүүлтээ хадгална');

/* ── 2. Ерөнхий дашбоард: бүсийн полигон дарахад КАНОНИК бүс ── */
{
  const gd = read('../modules/GeneralDash.tsx');
  assert.match(gd, /const raw = layerId === ZONE_LAYER\.id \? attrs\[ZONE_FIELDS\.id\] : \(attrs\[ZONE_FIELD\] \?\? attrs\[ZONE_FIELDS\.id\]\);/,
    'бүсийн давхаргаас `RefName_1` (ZONE_ID биш) уншина');
  assert.match(gd, /const zid = zoneCanon\(raw\);/, 'тавихаасаа өмнө `zoneCanon`');
  assert.match(gd, /if \(zid && zid !== zoneCanon\(ZONE_NONE\)\) setZone\(zid\);/);
  assert.ok(!/setZone\(String\(attrs\[ZONE_FIELD\]/.test(gd) && !/if \(zid && zid !== ZONE_NONE\.trim\(\)\) setZone\(zid\);/.test(gd), 'хуучин түүхий `ZONE_ID` зам буцав');
  /* бүсийн давхаргын талбар нь `RefName_1` — `ZONE_ID` биш */
  assert.equal(ZONE_FIELDS.id, 'refname_1');
  assert.equal(ZONE_LAYER.id, 'zone');
  /* түүхий бичиглэл → чипийн каноник */
  assert.equal(zoneCanon('E-5-1'), 'E-5.1');
  assert.equal(zoneCanon('Багц -1'), 'Багц-1');
  assert.equal(zoneCanon(ZONE_NONE), zoneCanon(' Бүсийн мэдээлэл байхгүй '), '«мэдээлэлгүй» нь бүс БИШ — харьцуулалт каноникоор');
}
console.log('✅ GeneralDash: бүсийн полигон → каноник бүс (чип тодорно)');
