/**
 * НЭГТГЭЛИЙН ХҮСНЭГТЭД ТУРШИЛТЫН ӨГӨГДӨЛ.
 *
 * `selbe_bagts_guitsetgel_negtgel` дээр доод графикууд ЯМАР харагдахыг
 * шалгахын тулд 7 багц × 12 сарын агшин үүсгэнэ.
 *
 * ⚠️ ТУРШИЛТЫН ӨГӨГДӨЛ. Бодит ажиллагаа эхлэхэд `--wipe`-аар БҮГДИЙГ устгаад
 *    цэвэр эхэлнэ. Тиймээс энд бодит дүнг ойролцоолохыг ЗОРИОГҮЙ — зөвхөн
 *    дүрслэл шалгах хэлбэр (S-муруй, хоцрогдол, багц хоорондын ялгаа).
 *
 * ⚠️ Токенгүй ажиллана: мөр нэмэх/устгах нь энэ үйлчилгээнд нээлттэй
 *    (талбарын БҮТЭЦ өөрчлөх нь л admin токен шаарддаг).
 *
 * Ажиллуулах:
 *     node tools/negtgel-seed.mjs           # мөр нэмнэ
 *     node tools/negtgel-seed.mjs --wipe    # БҮГДИЙГ устгаад дахин үүсгэнэ
 *     node tools/negtgel-seed.mjs --clear   # ЗӨВХӨН устгана
 */

const URL_ =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_bagts_guitsetgel_negtgel/FeatureServer/169';

const F = {
  date: 'burtgesen_ognoo',
  bagts: 'bagts_ner',
  progress: 'bagts_guitsetgel_huvi_1',
  planned: 'tolovlogoot_huvi',
  volume: 'bodit_obyom_1',
  volumePlan: 'Tolovlogoot_obyom_1',
};

const post = async (path, body) => {
  const res = await fetch(`${URL_}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...body }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || 'ArcGIS алдаа');
  return j;
};

/**
 * Багц бүрийн ЗАН ТӨЛӨВ — дүрслэл шалгахад ӨӨР ӨӨР тохиолдол хэрэгтэй:
 *   · хуваарьтаа явж буй  · бага зэрэг хоцорсон  · ноцтой хоцорсон
 *   · түрүүлсэн  · шинээр эхэлсэн
 * Бүгд ижил байвал график зөв ажиллаж байгаа эсэхийг ялгах боломжгүй.
 */
const PKGS = [
  { name: 'Багц 1',   plan: 100, real: 0.78, vol: 128_400 },  // хоцорсон
  { name: 'Багц 2',   plan: 92,  real: 0.41, vol: 96_000 },   // ноцтой хоцорсон
  { name: 'Багц 3.1', plan: 78,  real: 1.06, vol: 42_300 },   // түрүүлсэн
  { name: 'Багц 3.2', plan: 85,  real: 0.95, vol: 61_800 },   // хуваарьтаа
  { name: 'Багц 3.3', plan: 70,  real: 0.88, vol: 55_200 },   // бага зэрэг хоцорсон
  { name: 'Багц 4-1', plan: 64,  real: 0.72, vol: 74_500 },   // хоцорсон
  { name: 'Багц 4-2', plan: 45,  real: 0.9,  vol: 38_900 },   // шинээр эхэлсэн
];

/** 2025-10-аас эхлэн 12 сар — Cashflow-ийн сарын тэнхлэгтэй ИЖИЛ */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const mo = ((9 + i) % 12) + 1;
  const yr = 2025 + Math.floor((9 + i) / 12);
  return { label: `${yr}-${String(mo).padStart(2, '0')}`, ms: Date.UTC(yr, mo - 1, 28) };
});

/** S-муруй: эхэндээ удаан, дунд нь хурдан, төгсгөлд нь тэгширнэ */
const sCurve = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

async function clear() {
  const c = await post('/query', { where: '1=1', returnCountOnly: 'true' });
  if (!c.count) { console.log('Хүснэгт аль хэдийн хоосон.'); return; }
  await post('/deleteFeatures', { where: '1=1' });
  console.log(`Устгав: ${c.count} мөр`);
}

async function seed() {
  const adds = [];
  for (const p of PKGS) {
    MONTHS.forEach((m, i) => {
      const t = (i + 1) / MONTHS.length;
      const planned = p.plan * sCurve(t);
      /* Бодит нь төлөвлөгөөнөөс `real` хувиар — багц бүр өөр зан төлөвтэй */
      const progress = planned * p.real;
      adds.push({
        attributes: {
          [F.date]: m.ms,
          [F.bagts]: p.name,
          [F.progress]: Math.round(progress * 10) / 10,
          [F.planned]: Math.round(planned * 10) / 10,
          [F.volume]: Math.round(p.vol * (progress / 100)),
          [F.volumePlan]: p.vol,
        },
      });
    });
  }

  /* 500-аар хэсэглэнэ — нэг хүсэлтэд бүгдийг оруулбал сервер таслана */
  for (let i = 0; i < adds.length; i += 500) {
    const chunk = adds.slice(i, i + 500);
    const r = await post('/applyEdits', { adds: JSON.stringify(chunk) });
    const bad = (r.addResults ?? []).filter((x) => !x.success);
    if (bad.length) throw new Error(`${bad.length} мөр орсонгүй: ${bad[0].error?.description}`);
  }
  console.log(`Нэмэв: ${adds.length} мөр (${PKGS.length} багц × ${MONTHS.length} сар)`);
}

const args = process.argv.slice(2);
(async () => {
  if (args.includes('--wipe') || args.includes('--clear')) await clear();
  if (!args.includes('--clear')) await seed();

  const c = await post('/query', { where: '1=1', returnCountOnly: 'true' });
  console.log(`Одоо хүснэгтэд: ${c.count} мөр`);
})().catch((e) => { console.error('⛔', e.message); process.exit(1); });
