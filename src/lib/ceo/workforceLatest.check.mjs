/**
 * ХАБЭА-гийн «ХАМГИЙН СҮҮЛИЙН МӨР» — огноо → EditDate → OID (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/workforceLatest.check.mjs
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): «Тайлан»-гийн ХАБЭА (`reportData.loadHabeaSummary`)
 *    ижил огноотой мөрүүдээс OID-оор л сонгодог байв — нэг өдрийн ЗАСВАРЛАСАН мөр (бага OID,
 *    шинэ EditDate) алгасагдаж, CEO самбар (`groupDays`) өөр мөр сонгож болдог. Одоо хоёулаа
 *    `latestLaborRow` (`newer`-ийн дүрэм).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestLaborRow, groupDays, EDIT_DATE_FIELD, OID_FIELD } from './workforce.ts';
import { HABEA } from '../services.ts';

const F = HABEA.labor.fields;
const day = Date.UTC(2026, 8, 20, 4);
const r = (oid, at, edited, extra = {}) => ({ [OID_FIELD]: oid, [F.ognoo]: at, [EDIT_DATE_FIELD]: edited, ...extra });

{
  /* ижил өдөр: OID 255 нь ДАРАА нь засварлагдсан (EditDate их) — тэр ялна */
  const a = r(255, day, Date.UTC(2026, 8, 22));
  const b = r(256, day, Date.UTC(2026, 8, 21));
  assert.equal(latestLaborRow([b, a]), a, 'EditDate нь OID-оос ТҮРҮҮЛНЭ');
  assert.equal(latestLaborRow([a, b]), a, 'оролтын дарааллаас хамаарахгүй');
  /* EditDate тэнцүү/алга → OID */
  const c = r(300, day, null);
  const d = r(301, day, null);
  assert.equal(latestLaborRow([d, c]), d, 'EditDate алга бол OID их нь');
  /* огноо их нь бүхнээс түрүүлнэ */
  const e = r(10, day + 86_400_000, 1);
  assert.equal(latestLaborRow([a, b, e]), e);
  /* огноогүй (дуусаагүй маягт) сонгогдохгүй */
  assert.equal(latestLaborRow([r(999, null, Date.now())]), null);
  assert.equal(latestLaborRow([]), null);
  /* CEO самбарын өдрийн сонголттой ИЖИЛ мөр */
  const days = groupDays([b, a]);
  assert.equal(days[0].oid, 255, 'groupDays ба latestLaborRow нэг мөр сонгоно');
}

/* reportData ЭНЭ туслахаар сонгодог ба EditDate-ийг татдаг (эх кодын тулгалт) */
{
  const src = readFileSync(new URL('../reportData.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('const last = latestLaborRow(labor);'), 'reportData сүүлийн мөрийг latestLaborRow-оор сонгохгүй байна');
  assert.ok(/outFields: \[[\s\S]*?EDIT_DATE_FIELD,[\s\S]*?\]/.test(src), 'reportData EditDate татахгүй байна');
}

console.log('workforceLatest.check: OK');
