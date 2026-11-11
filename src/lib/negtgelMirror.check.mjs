/**
 * НЭГТГЭЛИЙН ХҮСНЭГТИЙГ (187) ТОЛИЛОХ (2026-11-11) — цэвэр дүрмүүд.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/negtgelMirror.check.mjs
 *
 * Хамгаалж буй алдаа: 187 зөвхөн «Төсөл төлөвлөгөө биелэлт» уншигдаагүй үед бичигддэг байсан тул хоцордог байв. Толилохдоо
 * мөрийг objectid-аар биш код + нэрээр (давхардвал багц/дарааллаар) тааруулна; хоосноор дарж бичихгүй; хосгүй мөрийг хөндөхгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mirrorUpdates, pairRows } from './negtgelMirror.ts';

const V = { act: null, planG: null, planGch: null, planGu: null, planNw: null, planPw: null, perfG: null, perfGch: null, perfGu: null, perfWk: null };
const row = (code, name, bagts, o = {}) => ({ ...V, code, name, bagts, w: null, p: null, budget: null, ...o });
const st = (oid, code, name, bagts, o = {}) => ({ ...V, oid, code, name, bagts, depth: 2, w: null, p: null, budget: null, ...o });

/* 1. код + нэр; давхардсан түлхүүрт дараалал хадгална; код солигдсон мөр нэр + багцаар */
{
  const rows = [row('1', 'ТЭЗҮ', ''), row('5.1', 'Барилга', 'Багц-1'), row('5.1', 'Барилга', 'Багц-2'), row('2.3.5.1', 'Дэд станц', 'Багц-9')];
  const stored = [st(10, '1', 'ТЭЗҮ', ''), st(11, '5.1', 'Барилга', '5/1'), st(12, '5.1', 'Барилга', '5/1'), st(13, '2.3.3.1', 'Дэд  станц', 'БАГЦ - 9'), st(14, '9.9', 'Хосгүй', '')];
  assert.deepEqual(pairRows(rows, stored), [0, 1, 2, 3]);
  const m = mirrorUpdates(rows, stored, null, 5);
  assert.deepEqual(m.only182, []);
  assert.deepEqual(m.only187, ['9.9 · Хосгүй']);
  assert.deepEqual(m.updates, [], '187-ийн кодыг хөндөхгүй (нөөц модны таарц)');
}

/* 2. давхардсан түлхүүрт багц таарвал багцаар (дараалал биш) */
{
  const rows = [row('5', 'Ажил', 'Багц-2'), row('5', 'Ажил', 'Багц-1')];
  const stored = [st(1, '5', 'Ажил', 'БАГЦ-1'), st(2, '5', 'Ажил', 'БАГЦ-2')];
  assert.deepEqual(pairRows(rows, stored), [1, 0]);
}

/* 3. зөвхөн зөрсөн талбар; 0–100 масштаб; хоосноор дарж бичихгүй; sys талбар */
{
  const rows = [row('1', 'А', '', { act: 0.5, planG: 0.25, w: 0.1, budget: 100, exStart: '2026-01-01', ctStart: null })];
  const stored = [st(7, '1', 'А', '', { act: 0.5, planG: 0.2, perfG: 0.9, w: 0.1, budget: 100, exStart: '', exEnd: '2026-02-02', ctStart: 123, sysAct: 0.4 })];
  const m = mirrorUpdates(rows, stored, null, 9);
  assert.deepEqual(m.updates, [{ objectid: 7, pln_ct: 25, ex_start: '2026-01-01', sys_guitsetgel: 50, sys_shinechilsen: 9 }]);
}

/* 4. зөрөөгүй бол бичихгүй; нийт мөр */
{
  const rows = [row('1', 'А', '', { act: 0.5 })];
  const stored = [st(7, '1', 'А', '', { act: 0.5, sysAct: 0.5 })];
  assert.deepEqual(mirrorUpdates(rows, stored, null, 1).updates, []);
  const root = { vals: { act: 0.3 }, stored: { ...V, oid: 1, code: '0', act: 0.4 } };
  assert.deepEqual(mirrorUpdates(rows, stored, root, 1).updates, [{ objectid: 1, act_pct: 30, sys_shinechilsen: 1 }]);
}

/* 5. холболт: зөвхөн БҮРЭН уншигдсан төлөвлөгөөгөөр, шидэхгүй */
{
  const src = readFileSync(new URL('./projectPlanSync.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(!plan\.failed\.length\) await mirrorToNegtgel\(plan\);/);
  assert.match(src, /async function mirrorToNegtgel[\s\S]{0,700}catch \(err\)/);
}
console.log('negtgelMirror.check: OK');
