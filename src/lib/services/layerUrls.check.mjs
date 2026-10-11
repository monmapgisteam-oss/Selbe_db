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
 * ⚠️ `styleUrl`-ийг ХААГДСАН үйлчилгээний жагсаалтаар ШАЛГАХГҮЙ — тэр нь webmap-загварын хайлтын
 *    түлхүүр л (хуучин ET хаяг санаатай; `env.ts`-ийн `ET`-ийн ⚠️). Харин 2026-10-11 (аудит №7)-оос
 *    `styleUrl` бүр `public/webmap-style.json` снапшотод (эсвэл `plan2d`-ийн өөрийн/alias загварт)
 *    ОЛДОХЫГ батална — олдохгүй түлхүүр нь үхмэл тохиргоо (`layers.ts` §NO_WEBMAP_STYLE).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { LAYERS, layerUrl, TD } = await import('@/lib/services.ts');
const { PLAN2D_LAYERS, PLAN2D_ALIASED } = await import('@/lib/plan2d.ts');

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
  assert.deepEqual(bad, [],
    `хаагдсан үйлчилгээ рүү заасан давхарга (TD_LAYER-т бүртгэ эсвэл бүтэн url өг):\n  ${bad.join('\n  ')}`);
});

ok('pkg:* давхарга бүр TD руу дарж бичигдсэн (TD_LAYER-т бүртгэлтэй)', () => {
  const pkg = LAYERS.filter((l) => l.id.startsWith('pkg:'));
  assert.ok(pkg.length > 0, 'pkg:* давхарга олдсонгүй — шалгуурыг шинэчил');
  const bad = pkg.filter((l) => !layerUrl(l).startsWith(`${TD}/`)).map((l) => `${l.id} → ${layerUrl(l)}`);
  assert.deepEqual(bad, [], `TD_LAYER-т бүртгэлгүй pkg:* давхарга:\n  ${bad.join('\n  ')}`);
});

/* ⚠️ 2026-10-11 (аудит №7): `webmapStyle.ts`-ийн `norm`-тай ИЖИЛ хэлбэржүүлэлт (decode + төгсгөлийн `/` + жижиг үсэг) */
const styleKey = (u) => { try { return decodeURIComponent(u).replace(/\/+$/, '').toLowerCase(); } catch { return u.toLowerCase(); } };
ok('styleUrl бүр webmap снапшотод (эсвэл plan2d загварт) олдоно', () => {
  const snap = JSON.parse(readFileSync('public/webmap-style.json', 'utf8'));
  const keys = new Set(Object.keys(snap).map(styleKey));
  const plan2d = JSON.parse(readFileSync('public/plan2d-style.json', 'utf8'));
  /* `sb:*` ба alias-тай давхарга (`et:24`→`sb:4`, `dugui`→`sb:15` …) MapCanvas-д `plan2dStyleOf`-оор зурагдана */
  const viaPlan2d = (id) => (plan2d[id] != null && PLAN2D_LAYERS.some((p) => p.id === id)) || PLAN2D_ALIASED.has(id);
  const withStyle = LAYERS.filter((l) => l.styleUrl);
  assert.ok(withStyle.length > 20, `styleUrl-тэй давхарга хэт цөөн (${withStyle.length})`);
  const bad = withStyle
    .filter((l) => !keys.has(styleKey(l.styleUrl)) && !viaPlan2d(l.id))
    .map((l) => `${l.id} → ${norm(l.styleUrl)}`);
  assert.deepEqual(bad, [], `снапшотод түлхүүргүй styleUrl (layers.ts §NO_WEBMAP_STYLE-д нэм эсвэл снапшотыг шинэчил):\n  ${bad.join('\n  ')}`);
});

console.log(`layerUrls: ${n} шалгалт ✓ (${LAYERS.length} давхарга)`);
