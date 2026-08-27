/**
 * БӨГЛӨХ ХУУДСУУДАД «ШАТЛАЛ» (`gun`) БАГАНА НЭМЭХ.
 *
 * ⚠️ ЯАГААД: мөрийн шатлал (бүлэг ↔ ажил) нь одоо `src/modules/sheet/bagts.trees.ts`
 * дахь ТОГТМОЛ тэмдэгтийн мөрөөс гардаг бөгөөд тэмдэгт бүр нэг мөрд БАЙРЛАЛААР
 * харгалзана. Тиймээс хуудсанд мөр нэмэх боломжгүй — нэмэнгүүт мөрийн тоо
 * зураглалын урттай зөрж, `loadRows` алдаа шидэн хуудас бүхэлдээ нээгдэхээ болино.
 *
 * Энэ багана нэмэгдсэнээр шатлал КОДООС ӨГӨГДӨЛ рүү шилжинэ: мөр бүр өөрийн
 * гүнээ авч явах тул хэдэн ч мөр нэмэгдсэн хуудас зөв уншигдана.
 *
 * ⚠️ ADMIN ТОКЕН ШААРДАНА. Мөр нэмэх/засах нь токенгүй ажилладаг ч ТАЛБАРЫН
 *    БҮТЭЦ өөрчлөх нь `…/rest/admin/services/…` руу ханддаг бөгөөд тэнд
 *    `499 Token Required` буцаадаг.
 *
 * Токеныг ХЭЗЭЭ Ч кодод бичихгүй — `.env.development.local`-оос уншина
 * (`.gitignore`-д `.env*.local` бий тул репод орохгүй):
 *
 *     ARCGIS_ADMIN_TOKEN=xxxxxxxx
 *
 * Токен авах: https://www.arcgis.com/sharing/rest/generateToken
 *
 * ⚠️ Токен өгөх боломжгүй бол AGOL-ийн UI-аас (Data → Fields → Add) 10 давхаргад
 *    гараар ч нэмж болно — код хоёуланг нь ижил хүлээж авна.
 *
 * Ажиллуулах:
 *     node tools/bagts-gun.mjs --dry   # юу хийхийг л хэвлэнэ
 *     node tools/bagts-gun.mjs         # багана нэмнэ
 */

import { readFileSync } from 'node:fs';

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';

/**
 * ⚠️ Жагсаалт нь `src/modules/sheet/bagts.pkg.ts`-ийн `PKGS`-тэй ЯГ таарна.
 *    Тэнд шинэ багц нэмэгдвэл ЭНДЭЭ Ч нэмнэ — эс бөгөөс шинэ хуудас баганагүй
 *    үлдэж, тэр багц дээр мөр нэмэх боломжгүй хэвээр байна.
 */
const SHEETS = [
  'Bagts_1_9f', 'Bagts_1_12f',
  'Bagts_2_9f', 'Bagts_2_12f',
  'Bagts_3_1_9f', 'Bagts_3_2_9f', 'Bagts_3_3_9f',
  'Bagts_4_1_9f',
  'Bagts_4_2_9f', 'Bagts_4_2_12f',
];

/**
 * ⚠️ `SmallInteger` — гүн нь 0–4 (`bagts.trees.ts`-ийн «A».."E" / «0».."4»).
 *    `nullable` ЗААВАЛ: багана нэмэгдэх агшинд бүх хуучин мөр хоосон байх бөгөөд
 *    код нь тэр үед `TREES`-рүү нөөцлөн буцдаг.
 */
const GUN = {
  name: 'gun',
  type: 'esriFieldTypeSmallInteger',
  alias: 'Шатлал',
  nullable: true,
  editable: true,
};

const DRY = process.argv.includes('--dry');

/* ── Токен ── */
function token() {
  if (process.env.ARCGIS_ADMIN_TOKEN) return process.env.ARCGIS_ADMIN_TOKEN;
  for (const f of ['.env.development.local', '.env.local', '.env']) {
    try {
      const m = readFileSync(f, 'utf8').match(/^ARCGIS_ADMIN_TOKEN\s*=\s*(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* файл алга — дараагийнхыг үзнэ */ }
  }
  return null;
}

const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  return res.json();
};

async function main() {
  const t = token();
  // ⚠️ `--dry` нь ЗӨВХӨН уншина — токенгүйгээр ч төлөвийг харуулах ёстой,
  //    эс бөгөөс «юу болох вэ» гэдгийг урьдчилж мэдэх боломжгүй болно.
  if (!t && !DRY) {
    console.error('⛔ ARCGIS_ADMIN_TOKEN олдсонгүй.');
    console.error('   `.env.development.local`-д нэмнэ үү:  ARCGIS_ADMIN_TOKEN=…');
    console.error('   Эсвэл AGOL-ийн UI-аас 10 давхаргад гараар `gun` талбар нэмнэ үү.');
    process.exit(1);
  }

  let already = 0, added = 0, failed = 0;

  for (const name of SHEETS) {
    const service = `${HJ}/${name}/FeatureServer`;
    const admin = service.replace('/rest/services/', '/rest/admin/services/');
    const q = t ? `&token=${t}` : '';

    const meta = await (await fetch(`${service}/0?f=json${q}`)).json();
    if (meta.error) {
      console.log(`${name.padEnd(15)} ⛔ уншигдсангүй: ${meta.error.message}`);
      failed += 1;
      continue;
    }
    const have = (meta.fields ?? []).some((f) => f.name === GUN.name);
    if (have) {
      console.log(`${name.padEnd(15)} ✅ «${GUN.name}» аль хэдийн бий`);
      already += 1;
      continue;
    }
    if (DRY) {
      console.log(`${name.padEnd(15)} + «${GUN.name}» нэмэгдэнэ (${(meta.fields ?? []).length} → ${(meta.fields ?? []).length + 1})`);
      added += 1;
      continue;
    }

    const r = await post(`${admin}/0/addToDefinition`, {
      f: 'json',
      token: t,
      addToDefinition: JSON.stringify({ fields: [GUN] }),
    });
    if (r.error) {
      console.log(`${name.padEnd(15)} ⛔ ${r.error.message}`);
      failed += 1;
    } else {
      console.log(`${name.padEnd(15)} ✅ «${GUN.name}» нэмэгдэв`);
      added += 1;
    }
  }

  console.log(`\n${DRY ? '(--dry — юу ч хийсэнгүй) ' : ''}`
    + `бэлэн ${already} · ${DRY ? 'нэмэгдэх' : 'нэмэгдсэн'} ${added} · алдаа ${failed}`);
  if (!DRY && added) {
    console.log('\n⚠️ ДАРААГИЙН АЛХАМ: багана хоосон байна. «Гүйцэтгэл бөглөх» дээр');
    console.log('   багц бүрийг НЭГ УДАА нийтлэхэд мөр бүр өөрийн шатлалаа бичнэ');
    console.log('   (`FillNew.publish` → `gun`). Түүнээс өмнө код `bagts.trees.ts`-ээ');
    console.log('   хэвийн ашигласаар байх тул юу ч эвдрэхгүй.');
  }
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('⛔', e.message); process.exit(1); });
