/**
 * ХЭЛ СОЛИХОД ГАЗРЫН ЗУРГИЙН VIEW УСТАХГҮЙ — `mapPark.ts` (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/mapPark.check.mjs
 *
 * ⚠️ Хуурамч view-ээр: хэл солих агшинд (`shouldPark`) хадгалагдаж, ижил түлхүүртэй
 *    шинэ MapCanvas түүнийг ДАХИН АВНА (шинэ view үүсэхгүй, устгагдахгүй); түлхүүр
 *    зөрвөл эсвэл хугацаанд хэн ч авахгүй бол устгана (WebGL контекст алдагдахгүй).
 *    Мөн `i18n.tsx`/`page.tsx`-ийн бүтэц: `AuthProvider` remount-ийн ГАДНА.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parkView, adoptView, dropParked, shouldPark, mapStats } from '@/components/mapPark';

const mkView = () => ({ destroyed: false, id: Math.random() });
const destroy = (v) => { v.destroyed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── shouldPark: хэлний үе өөрчлөгдсөн үед л ── */
assert.equal(shouldPark(0, 1), true, 'хэл солигдсон → хадгална');
assert.equal(shouldPark(3, 3), false, 'ердийн unmount / 2D↔3D → устгана (хуучин зан)');
console.log('✅ shouldPark: зөвхөн хэл солих remount');

/* ── Хэл солих: хадгална → ижил түлхүүрээр ДАХИН АВНА (устахгүй) ── */
{
  const s0 = { ...mapStats };
  const v = mkView();
  parkView(v, '2d|themed', destroy);
  assert.equal(v.destroyed, false);
  const got = adoptView('2d|themed');
  assert.equal(got, v, 'ижил view буцаах ёстой');
  assert.equal(v.destroyed, false, 'хэл солиход view устав');
  assert.equal(adoptView('2d|themed'), null, 'слот хоосорсон байх ёстой');
  assert.equal(mapStats.parked - s0.parked, 1);
  assert.equal(mapStats.adopted - s0.adopted, 1);
  assert.equal(mapStats.destroyed - s0.destroyed, 0, 'нэг ч view устгагдах ёсгүй');
  console.log('✅ хэл солих: view хадгалагдаж дахин авагдана — устгагдахгүй');
}

/* ── Түлхүүр зөрвөл (өөр dim / өөр Map) → хадгалсныг устгаж null ── */
{
  const v = mkView();
  parkView(v, '3d|themed', destroy);
  assert.equal(adoptView('2d|themed'), null);
  assert.equal(v.destroyed, true, 'таарахгүй view устах ёстой');
  console.log('✅ түлхүүр зөрвөл хадгалсан view устна');
}

/* ── Хоёр дахь view ирвэл өмнөх нь устна (нэг слот) ── */
{
  const a = mkView();
  const b = mkView();
  parkView(a, '2d|themed', destroy);
  parkView(b, '2d|uniform', destroy);
  assert.equal(a.destroyed, true);
  assert.equal(adoptView('2d|uniform'), b);
  console.log('✅ нэг слот: өмнөх хадгалсан view устна');
}

/* ── Хугацаанд хэн ч авахгүй бол устна ── */
{
  const v = mkView();
  parkView(v, '2d|themed', destroy, 30);
  await sleep(80);
  assert.equal(v.destroyed, true, 'хугацаа дуусахад устгаагүй — WebGL контекст алдагдана');
  assert.equal(adoptView('2d|themed'), null);
  /* Аль хэдийн устсан view-г буцаахгүй */
  const w = mkView();
  parkView(w, '2d|themed', destroy);
  w.destroyed = true;
  assert.equal(adoptView('2d|themed'), null);
  dropParked();
  console.log('✅ хугацаа дуусвал устна · устсан view буцаагдахгүй');
}

/* ── Бүтэц: AuthProvider нь remount-ийн ГАДНА, MapCanvas хадгалалтыг ашиглана ── */
{
  const i18n = readFileSync(new URL('../lib/i18n.tsx', import.meta.url), 'utf8');
  assert.ok(!/<Ctx\.Provider key=/.test(i18n), 'LocaleProvider бүх аппыг дахин key-лэж байна (нэвтрэлт дахин шалгагдана)');
  assert.match(i18n, /export function LocaleRemount/);
  assert.match(i18n, /<Fragment key=\{generation\}>/);
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<AuthProvider>\s*<LocaleRemount>\s*<Root \/>\s*<\/LocaleRemount>\s*<\/AuthProvider>/,
    'AuthProvider нь LocaleRemount-ийн ГАДНА байх ёстой');
  const mc = readFileSync(new URL('./MapCanvas.tsx', import.meta.url), 'utf8');
  assert.match(mc, /adoptView<AnyView>\(parkKey\)/, 'MapCanvas хадгалсан view-г авахгүй байна');
  assert.match(mc, /shouldPark\(mountGen, getLocaleGeneration\(\)\)/);
  assert.match(mc, /parkView\(view, parkKey, destroyDetached\)/);
  console.log('✅ бүтэц: AuthProvider remount-ийн гадна · MapCanvas хадгалах/авах холбогдсон');
}
