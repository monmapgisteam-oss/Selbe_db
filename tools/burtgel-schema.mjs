/**
 * ГҮЙЦЭТГЭЛИЙН БҮРТГЭЛИЙН ХҮСНЭГТИЙН ТАЛБАРЫГ ЗАСАХ.
 *
 * `Selbe_guitsetgel_consolidated/FeatureServer/0` дээр:
 *   1. дутуу талбаруудыг НЭМНЭ (`addToDefinition`)
 *   2. хэрэггүй талбаруудыг ХАСНА (`deleteFromDefinition`) — `--delete` тугтай үед
 *   3. индекс нэмнэ
 *
 * ⚠️ ADMIN ТОКЕН ШААРДАНА. Мөр нэмэх/устгах нь токенгүй ажилладаг ч ТАЛБАРЫН
 *    БҮТЭЦ өөрчлөх нь `…/rest/admin/services/…` руу ханддаг бөгөөд тэнд
 *    `499 Token Required` буцаадаг.
 *
 * Токеныг ХЭЗЭЭ Ч кодод бичихгүй — `.env.development.local`-оос уншина
 * (`.gitignore`-д `.env*.local` бий тул репод орохгүй):
 *
 *     ARCGIS_ADMIN_TOKEN=xxxxxxxx
 *
 * Токен авах: ArcGIS Online → Content → тухайн Feature Layer → ... эсвэл
 * https://www.arcgis.com/sharing/rest/generateToken (username/password/referer).
 *
 * Ажиллуулах:
 *     node tools/burtgel-schema.mjs            # зөвхөн НЭМНЭ (аюулгүй)
 *     node tools/burtgel-schema.mjs --delete   # хуучин талбарыг БАС хасна
 *     node tools/burtgel-schema.mjs --dry      # юу хийхийг л хэвлэнэ
 */

import { readFileSync } from 'node:fs';

const SERVICE =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_guitsetgel_consolidated/FeatureServer';
const ADMIN = SERVICE.replace('/rest/services/', '/rest/admin/services/');

const DRY = process.argv.includes('--dry');
const DO_DELETE = process.argv.includes('--delete');

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

/* ── НЭМЭХ талбарууд ──
 * ⚠️ `ognoo` нь АГШНЫ ТЭНХЛЭГ — түүнгүйгээр түүх, график, «хэзээний өгөгдөл вэ»
 *    гэсэн бүх асуулт хариултгүй үлдэнэ. Хамгийн түрүүнд байгаа нь тийм учиртай.
 */
const ADD_FIELDS = [
  { name: 'ognoo', type: 'esriFieldTypeDate', alias: 'Бүртгэсэн огноо', nullable: true, editable: true },

  { name: 'bagts_kod', type: 'esriFieldTypeString', alias: 'Багцын код', length: 16, nullable: true, editable: true },
  { name: 'davhar', type: 'esriFieldTypeSmallInteger', alias: 'Давхар', nullable: true, editable: true },
  { name: 'blok', type: 'esriFieldTypeString', alias: 'Блок', length: 16, nullable: true, editable: true },

  { name: 'buleg', type: 'esriFieldTypeString', alias: 'Ажлын бүлэг', length: 16, nullable: true, editable: true },
  { name: 'buleg_ner', type: 'esriFieldTypeString', alias: 'Бүлгийн нэр', length: 128, nullable: true, editable: true },

  { name: 'negj_ortog', type: 'esriFieldTypeDouble', alias: 'Нэгж өртөг', nullable: true, editable: true },
  { name: 'mongon_dun', type: 'esriFieldTypeDouble', alias: 'Мөнгөн дүн', nullable: true, editable: true },
  { name: 'obyem_niit', type: 'esriFieldTypeDouble', alias: 'Нийт обьём', nullable: true, editable: true },
  { name: 'obyem', type: 'esriFieldTypeDouble', alias: 'Гүйцэтгэсэн обьём', nullable: true, editable: true },

  { name: 'tuluvluguut', type: 'esriFieldTypeDouble', alias: 'Төлөвлөгөөт гүйцэтгэл', nullable: true, editable: true },
  { name: 'biyelelt', type: 'esriFieldTypeDouble', alias: 'Төлөвлөгөө биелэлт', nullable: true, editable: true },

  { name: 'burtgel_dugaar', type: 'esriFieldTypeString', alias: 'Бүртгэлийн дугаар', length: 16, nullable: true, editable: true },
  { name: 'ilgeesen', type: 'esriFieldTypeDate', alias: 'Илгээсэн огноо', nullable: true, editable: true },
  { name: 'batalsan', type: 'esriFieldTypeDate', alias: 'Баталсан огноо', nullable: true, editable: true },
  { name: 'guitsetgegch', type: 'esriFieldTypeString', alias: 'Гүйцэтгэгч', length: 128, nullable: true, editable: true },
  { name: 'injener', type: 'esriFieldTypeString', alias: 'Хяналтын инженер', length: 128, nullable: true, editable: true },
  { name: 'bagts_menejer', type: 'esriFieldTypeString', alias: 'Багцын менежер', length: 128, nullable: true, editable: true },
  { name: 'eronhii_menejer', type: 'esriFieldTypeString', alias: 'Ерөнхий менежер', length: 128, nullable: true, editable: true },
  { name: 'tolov', type: 'esriFieldTypeString', alias: 'Төлөв', length: 32, nullable: true, editable: true },
];

/** ХАСАХ — зөвхөн `--delete` тугтай үед */
const DROP_FIELDS = ['angilal_a', 'angilal_b', 'aldaatai', 'barilga_blok'];

const INDEXES = [
  { name: 'ix_bagts_ognoo', fields: 'bagts_kod,ognoo', isUnique: false, isAscending: true, description: 'Багцын агшнууд' },
  { name: 'ix_blok', fields: 'bagts_kod,blok,ognoo', isUnique: false, isAscending: true, description: 'Блокийн гүйцэтгэл' },
  { name: 'ix_burtgel', fields: 'burtgel_dugaar', isUnique: false, isAscending: true, description: 'Хяналтын бүртгэл' },
];

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
  if (!t) {
    console.error('⛔ ARCGIS_ADMIN_TOKEN олдсонгүй.');
    console.error('   `.env.development.local`-д нэмнэ үү:  ARCGIS_ADMIN_TOKEN=…');
    process.exit(1);
  }

  /* Одоо байгаа талбарууд — давхардуулж нэмбэл алдаа өгнө */
  const meta = await (await fetch(`${SERVICE}/0?f=json&token=${t}`)).json();
  if (meta.error) {
    console.error('⛔ Үйлчилгээ уншиж чадсангүй:', meta.error.message);
    process.exit(1);
  }
  const have = new Set((meta.fields ?? []).map((f) => f.name));
  console.log(`Одоогийн талбар: ${have.size} —`, [...have].join(', '));

  const add = ADD_FIELDS.filter((f) => !have.has(f.name));
  const drop = DROP_FIELDS.filter((n) => have.has(n));

  console.log(`\nНЭМЭХ (${add.length}):`, add.map((f) => f.name).join(', ') || '—');
  if (DO_DELETE) console.log(`ХАСАХ (${drop.length}):`, drop.join(', ') || '—');
  console.log(`ИНДЕКС (${INDEXES.length}):`, INDEXES.map((i) => i.name).join(', '));

  if (DRY) {
    console.log('\n(--dry — юу ч хийсэнгүй)');
    return;
  }

  if (add.length) {
    const r = await post(`${ADMIN}/0/addToDefinition`, {
      f: 'json', token: t,
      addToDefinition: JSON.stringify({ fields: add }),
    });
    console.log('\naddToDefinition →', r.error ? `⛔ ${r.error.message}` : '✅ болов');
    if (r.error) process.exit(1);
  }

  if (DO_DELETE && drop.length) {
    const r = await post(`${ADMIN}/0/deleteFromDefinition`, {
      f: 'json', token: t,
      deleteFromDefinition: JSON.stringify({ fields: drop.map((name) => ({ name })) }),
    });
    console.log('deleteFromDefinition →', r.error ? `⛔ ${r.error.message}` : '✅ болов');
  }

  /* Индекс — талбарууд бэлэн болсны ДАРАА */
  const r = await post(`${ADMIN}/0/addToDefinition`, {
    f: 'json', token: t,
    addToDefinition: JSON.stringify({ indexes: INDEXES }),
  });
  console.log('индекс →', r.error ? `⚠️ ${r.error.message}` : '✅ болов');

  const after = await (await fetch(`${SERVICE}/0?f=json&token=${t}`)).json();
  console.log(`\nЭцсийн талбар: ${(after.fields ?? []).length}`);
  console.log((after.fields ?? []).map((f) => f.name).join(', '));
}

main().catch((e) => { console.error('⛔', e.message); process.exit(1); });
