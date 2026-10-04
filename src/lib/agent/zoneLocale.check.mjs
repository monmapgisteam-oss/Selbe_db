/**
 * АГЕНТЫН БҮСИЙН НЭР — ХЭЛНЭЭС ҮЛ ХАМААРНА (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/agent/zoneLocale.check.mjs
 *
 * Хамгаалж буй алдаа: `normalizeZone` латин оролтыг «Багц-3.2» болгохдоо
 * `tr('Багц-{0}')`-ээр ОРЧУУЛДАГ байсан тул англи горимд «Package-3.2» болж,
 * `bagtsKey` нь «PACKAGE32» ≠ өгөгдлийн «БАГЦ32» — `zone_overview` чимээгүй хоосон
 * буцаж, AI туслах «мэдээлэл олдсонгүй» гэж худал хариулдаг байв.
 */
import assert from 'node:assert/strict';
import { normalizeZone } from '@/lib/agent/overview';
import { bagtsKey } from '@/lib/services';
import { setLocale, getLocale, loadLocaleDict } from '@/lib/i18nCore';

/* ⚠️ 2026-10-04: англи толь хойшлогдон ачаалагддаг (`i18nCore.loadLocaleDict`) — урьдчилан
   ачаалснаар `setLocale('en')` урьдын адил СИНХРОН солигдоно. */
await loadLocaleDict('en');

let pass = 0;
const eq = (name, got, want) => {
  assert.equal(got, want, `✗ ${name} · got ${got} · want ${want}`);
  console.log('  ✓', name);
  pass += 1;
};

for (const loc of ['mn', 'en']) {
  setLocale(loc);
  assert.equal(getLocale(), loc);
  console.log(`\n${loc} горим`);
  eq('bagts 3.2 → Багц-3.2 (өгөгдлийн утга, орчуулаагүй)', normalizeZone('bagts 3.2'), 'Багц-3.2');
  eq('bagtsKey өгөгдлийнхтэй таарна', bagtsKey(normalizeZone('bagts 3.2')), bagtsKey('БАГЦ-3.2'));
  eq('bus 1 → Багц-1', normalizeZone('bus 1'), 'Багц-1');
  eq('package 4.1 (англи хэрэглэгч) → Багц-4.1', normalizeZone('package 4.1'), 'Багц-4.1');
  eq('кирилл оролт хэвээр', normalizeZone('Багц-6.1'), 'Багц-6.1');
  eq('танихгүй латин хэвээр', normalizeZone('zone A'), 'zone A');
}
setLocale('mn');

console.log(`\nzoneLocale: ${pass} шалгалт амжилттай.`);
