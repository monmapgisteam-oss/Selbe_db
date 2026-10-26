/**
 * TELEGRAM БОТЫН ИМПОРТ — `compute` (finance_summary · pkg_plan · building_progress) нь `@/modules/Finance`-ийг динамикаар
 * импортлодог. ⚠️ 2026-10-26 (аудит): ботын loader (UI горимгүй) `.module.css`-ийг ачаалж чадахгүй тул энэ импорт ҮРГЭЛЖ
 * «Unknown file extension ".css"» алдаагаар унаж байв (`ts-alias-hooks.mjs`-ийн CSS стуб одоо бүх горимд). Сүлжээгүй — зөвхөн импорт.
 * ⚠️ Нэр нь `*.ui.check.mjs` БИШ — UI стубгүй (ботын) горимд ажиллах ёстой.
 */
import assert from 'node:assert/strict';

const F = await import('@/modules/Finance');
for (const k of ['loadFinData', 'physNow', 'pkgMonthsMap', 'lagOf', 'physLatest', 'lagLevel']) {
  assert.equal(typeof F[k], 'function', `Finance.${k} импортлогдсонгүй`);
}
const S = await import('@/lib/agent/screenCompute');
assert.equal(typeof S.financeSummary, 'function');
assert.equal(typeof S.pkgPlan, 'function');
console.log('botImport.check: ok');
