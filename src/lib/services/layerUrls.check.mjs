/**
 * ДАВХАРГЫН ХАЯГ ХААГДСАН ҮЙЛЧИЛГЭЭ РҮҮ ЗААХГҮЙ (2026-10-09, аудит №3).
 *
 * ⚠️ ЯАГААД: `pkg.ts`-ийн `PKG_LAYERS` нь `pkg:*` мөр бүрд `url = ${ET_PKG}/n`
 *    (`Selbe_ET_20260725` — ХААГДСАН) гэж бүтээдэг бөгөөд үүнийг ЗӨВХӨН
 *    `layers.ts`-ийн TD_LAYER давталт `${TD}/…` болгож дарж бичдэг. TD_LAYER-т
 *    бүртгэлгүй ШИНЭ `pkg:*` мөр нэмбэл тэр давхарга хаагдсан үйлчилгээ рүү
 *    хандаж, зурагт ЧИМЭЭГҮЙ хоосон гарна (ArcGIS-ийн алдаа 200-аар ирдэг).
 *    `layerUrl` нь зөвхөн `url` ХООСОН үед унадаг — буруу хаягийг барьдаггүй.
 *
 * Энэ шалгуур нь `LAYERS`-ийн давхарга бүрийн ШИЙДЭГДСЭН хаяг (`layerUrl`)
 * доорх хаагдсан/устгагдсан үйлчилгээний аль нэг рүү заахгүйг баталгаажуулна.
 * ⚠️ `styleUrl`-ийг ШАЛГАХГҮЙ — тэр нь webmap-загварын хайлтын түлхүүр л
 *    (хуучин ET хаяг санаатай; `env.ts`-ийн `ET`-ийн ⚠️).
 */
import assert from 'node:assert/strict';
const { LAYERS, layerUrl, TD } = await import('@/lib/services.ts');

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
  assert.deepEqual(bad, [],
    `хаагдсан үйлчилгээ рүү заасан давхарга (TD_LAYER-т бүртгэ эсвэл бүтэн url өг):\n  ${bad.join('\n  ')}`);
});

ok('pkg:* давхарга бүр TD руу дарж бичигдсэн (TD_LAYER-т бүртгэлтэй)', () => {
  const pkg = LAYERS.filter((l) => l.id.startsWith('pkg:'));
  assert.ok(pkg.length > 0, 'pkg:* давхарга олдсонгүй — шалгуурыг шинэчил');
  const bad = pkg.filter((l) => !layerUrl(l).startsWith(`${TD}/`)).map((l) => `${l.id} → ${layerUrl(l)}`);
  assert.deepEqual(bad, [], `TD_LAYER-т бүртгэлгүй pkg:* давхарга:\n  ${bad.join('\n  ')}`);
});

console.log(`layerUrls: ${n} шалгалт ✓ (${LAYERS.length} давхарга)`);
