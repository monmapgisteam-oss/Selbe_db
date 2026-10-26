/**
 * ДАВХАРГЫН ХАЯГ — Enterprise-ийн БОДИТ хаяг, хаагдсан үйлчилгээ рүү ЗААХГҮЙ (2026-10-09, аудит №3; 2026-10-26 шинэчлэв).
 *
 * ⚠️ 2026-10-26 (хэрэглэгч: «хөрвүүлэх хүснэгт огт ашиглахгүй, бодит датаг шууд ашиглана»): AGOL түлхүүр → Enterprise
 *    хаягийн зураглал (`entMap`) ба `TD_LAYER`/`styleUrl` ХАСАГДСАН. Давхарга бүр `url`-даа Enterprise-ийн
 *    `${ENT_HOSTED}/<үйлчилгээ>/FeatureServer/<№>` бодит хаягийг агуулна; webmap-загварын снапшот
 *    (`public/webmap-style.json`) давхаргын ID-аар түлхүүрлэгдсэн.
 *
 * Энэ шалгуур:
 *   · `LAYERS`-ийн давхарга бүр хаягтай (`layerUrl` шиддэггүй);
 *   · ФИЧЕР давхарга бүр Enterprise-ийн hosted суурь дор (AGOL/хаагдсан үйлчилгээ рүү заахгүй);
 *   · `pkg:*` · `infra:*` давхарга `Bagts_ajluud` үйлчилгээнд;
 *   · webmap-загварын снапшотын түлхүүр бүр бодит давхаргын ID (үхмэл түлхүүргүй).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { LAYERS, layerUrl, ENT_HOSTED, BAGTS_AJLUUD } = await import('@/lib/services.ts');

/** Хаагдсан (499/400) эсвэл устгагдсан үйлчилгээнүүд — шинээр хаагдвал ЭНД нэм */
const DEAD = [
  'Selbe_ET_20260721',
  'Selbe_ET_20260725',
  'Selbe_guitsetgel_consolidated',
  'Бусад_мэдээлэл_20260724',
  'dugui_zam_20260731',
  'busiin_medeelel_final',
  'Tuluvlult_talbai',
  'Selbe_barilga_last',
  'SELBE_ALL_DATA_last_0917',
  'A', // ⚠️ 2026-10-09 (аудит №6): CLAUDE.md-ийн 9 дэх устгагдсан үйлчилгээ
];

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

assert.ok(Array.isArray(LAYERS) && LAYERS.length > 50, `LAYERS хэт цөөн (${LAYERS?.length})`);

/* Хаягийг кодлогдсон (%D0…) ба кодлогдоогүй хэлбэрээр хоёуланг нь жишнэ */
const norm = (u) => {
  try { return decodeURIComponent(u); } catch { return u; }
};

ok('LAYERS-ийн бүх давхарга хаягтай (layerUrl шиддэггүй)', () => {
  const bad = [];
  for (const l of LAYERS) {
    try { layerUrl(l); } catch (e) { bad.push(`${l.id}: ${e.message}`); }
  }
  assert.deepEqual(bad, [], `хаяггүй давхарга:\n  ${bad.join('\n  ')}`);
});

ok('ямар ч давхарга хаагдсан үйлчилгээ рүү заахгүй', () => {
  const bad = [];
  for (const l of LAYERS) {
    const u = norm(layerUrl(l));
    const hit = DEAD.find((d) => u.includes(`/${d}/`));
    if (hit) bad.push(`${l.id} → ${u}`);
  }
  assert.deepEqual(bad, [], `хаагдсан үйлчилгээ рүү заасан давхарга:\n  ${bad.join('\n  ')}`);
});

ok('фичер давхарга бүр Enterprise-ийн hosted суурь дор (AGOL хаяг БАЙХГҮЙ)', () => {
  const bad = LAYERS.map((l) => layerUrl(l))
    .filter((u) => /\/FeatureServer\//.test(u) && !u.startsWith(`${ENT_HOSTED}/`));
  assert.deepEqual(bad, [], `Enterprise-ээс гадуурх хаяг:\n  ${bad.join('\n  ')}`);
});

ok('pkg:* · infra:* давхарга бүр Bagts_ajluud үйлчилгээнд', () => {
  const pkg = LAYERS.filter((l) => l.id.startsWith('pkg:') || l.id.startsWith('infra:'));
  assert.ok(pkg.length > 90, `pkg/infra давхарга хэт цөөн (${pkg.length}) — шалгуурыг шинэчил`);
  const bad = pkg.filter((l) => !/^\/\d+$/.test(layerUrl(l).slice(BAGTS_AJLUUD.length)) || !layerUrl(l).startsWith(BAGTS_AJLUUD))
    .map((l) => `${l.id} → ${layerUrl(l)}`);
  assert.deepEqual(bad, [], `Bagts_ajluud-д биш pkg/infra:\n  ${bad.join('\n  ')}`);
  const seen = new Map();
  for (const l of pkg) {
    const u = layerUrl(l);
    if (seen.has(u)) assert.fail(`${l.id} ба ${seen.get(u)} НЭГ давхарга руу заасан: ${u}`);
    seen.set(u, l.id);
  }
});

ok('webmap-загварын снапшотын түлхүүр бүр бодит давхаргын ID', () => {
  const snap = JSON.parse(readFileSync('public/webmap-style.json', 'utf8'));
  const ids = new Set(LAYERS.map((l) => l.id));
  const keys = Object.keys(snap);
  assert.ok(keys.length > 20, `снапшот хэт цөөн (${keys.length})`);
  const bad = keys.filter((k) => !ids.has(k));
  assert.deepEqual(bad, [], `давхаргагүй (үхмэл) загварын түлхүүр:\n  ${bad.join('\n  ')}`);
});

console.log(`layerUrls: ${n} шалгалт ✓ (${LAYERS.length} давхарга)`);
