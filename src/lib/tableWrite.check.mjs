/**
 * ХҮСНЭГТ РҮҮ БИЧИХ (`tableWrite.applyAll`) — ЗАН ТӨЛВИЙН ШАЛГУУР, хиймэл `fetch`-тэй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/tableWrite.check.mjs
 *
 * ⚠️ 2026-10-09: ЖИНХЭНЭ модуль (`tableWrite.ts` → `query.arcgisPost`) — хуулбар логик биш.
 *    Сүлжээ огт хэрэглэхгүй: `globalThis.fetch`-ийг түр сольж, явсан биеийг барина.
 *
 * Хамгаалж буй алдаа:
 *   1. «Хадгалагдлаа» гэж ХУДЛАА хэлэх — ArcGIS мөр бүрийн үр дүнг тусад нь буцаадаг;
 *      HTTP 200 дотор `success:false` мөр, эсвэл ДУТУУ/хоосон массив ирж болно.
 *   2. Тоолуур буруу — `n` нь нэмсэн + зассан + устгасан, `oids` нь ЗӨВХӨН нэмсэн.
 *   3. Серверийн талбар (`OBJECTID` · `GlobalID` · `Shape__*`) нэмэх мөрөөр явж хүсэлт бүхэлдээ унах.
 *   4. `geometry` АТРИБУТ болж явах (ArcGIS татгалзана).
 *   5. Атомын бус илгээлт — гурван төрөл НЭГ `applyEdits`, `rollbackOnFailure=true`.
 *   6. 200-аар ирдэг `{error}` биеийг амжилт гэж үзэх (CLAUDE.md «ArcGIS REST занга»).
 */
import assert from 'node:assert/strict';
import { applyAll } from '@/lib/tableWrite';

const URL0 = 'https://example.invalid/arcgis/rest/services/Fin/FeatureServer/3';

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name);
  pass += 1;
};

/** `fetch`-ийг түр сольж `fn`-ийг ажиллуулна; явсан хүсэлтүүдийг буцаана */
const realFetch = globalThis.fetch;
async function withFetch(reply, fn) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? '')) });
    return { ok: true, status: 200, json: async () => structuredClone(reply) };
  };
  try {
    return { sent, out: await fn() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('\n1. Хоосон засвар — сүлжээнд залгахгүй');
{
  const { sent, out } = await withFetch({}, () => applyAll(URL0, 'OBJECTID', {}));
  ok('{ n: 0, oids: [] }', out.n === 0 && out.oids.length === 0);
  ok('хүсэлт явсангүй', sent.length === 0);
}

console.log('\n2. Нэмэх · засах · устгах — НЭГ хүсэлт, тоолуур зөв');
{
  const GEOM = { x: 1, y: 2, spatialReference: { wkid: 102100 } };
  const { sent, out } = await withFetch(
    {
      addResults: [{ success: true, objectId: 101 }, { success: true, objectId: 102 }],
      updateResults: [{ success: true, objectId: 7 }],
      deleteResults: [{ success: true, objectId: 9 }, { success: true, objectId: 10 }],
    },
    () => applyAll(URL0, 'OBJECTID', {
      adds: [
        { OBJECTID: 55, GlobalID: '{x}', Shape__Area: 3, ner: 'А', dun: 10, geometry: GEOM },
        { ner: 'Б', dun: 20 },
      ],
      updates: [{ OBJECTID: 7, dun: 30, EditDate: 123 }],
      deletes: [9, 10],
    }),
  );
  ok('нэг л хүсэлт (атом)', sent.length === 1, `${sent.length}`);
  const b = sent[0].body;
  ok('`/applyEdits` руу', sent[0].url.endsWith('/applyEdits'), sent[0].url);
  ok('rollbackOnFailure=true', b.get('rollbackOnFailure') === 'true');
  const adds = JSON.parse(b.get('adds'));
  ok('нэмэх мөрөөс серверийн талбар хасагдав', !('OBJECTID' in adds[0].attributes)
    && !('GlobalID' in adds[0].attributes) && !('Shape__Area' in adds[0].attributes));
  ok('геометр АТРИБУТ биш, тусдаа түлхүүр', adds[0].geometry?.spatialReference?.wkid === 102100
    && !('geometry' in adds[0].attributes));
  ok('геометргүй мөрөнд `geometry` түлхүүр алга', !('geometry' in adds[1]));
  const upd = JSON.parse(b.get('updates'));
  ok('засах мөр OID-оо хадгална, серверийн EditDate хасагдав',
    upd[0].attributes.OBJECTID === 7 && upd[0].attributes.dun === 30 && !('EditDate' in upd[0].attributes));
  ok('устгах нь таслалаар', b.get('deletes') === '9,10');
  ok('n = 2 нэмсэн + 1 зассан + 2 устгасан = 5', out.n === 5, `${out.n}`);
  ok('oids = ЗӨВХӨН нэмсэн мөрүүд', out.oids.join(',') === '101,102', out.oids.join(','));
}

console.log('\n3. `success:false` мөр — HTTP 200 байсан ч АЛДАА');
{
  await assert.rejects(
    () => withFetch(
      { updateResults: [{ success: true, objectId: 1 }, { success: false, error: { description: 'Field dun invalid' } }] },
      () => applyAll(URL0, 'OBJECTID', { updates: [{ OBJECTID: 1, dun: 1 }, { OBJECTID: 2, dun: 2 }] }),
    ),
    /Field dun invalid/,
  );
  ok('засах мөрийн бүтэлгүйтэл серверийн тайлбартайгаа шидэгдэнэ', true);
  await assert.rejects(
    () => withFetch(
      { addResults: [{ success: false }] },
      () => applyAll(URL0, 'OBJECTID', { adds: [{ ner: 'А' }] }),
    ),
  );
  ok('тайлбаргүй `success:false` ч шидэгдэнэ', true);
}

console.log('\n4. Дутуу/хоосон хариу — «бичигдээгүй» гэж үзнэ');
{
  await assert.rejects(
    () => withFetch(
      { addResults: [{ success: true, objectId: 1 }] },
      () => applyAll(URL0, 'OBJECTID', { adds: [{ ner: 'А' }, { ner: 'Б' }] }),
    ),
    /1\/2/,
  );
  ok('2 мөр илгээгээд 1 хариу → алдаа (1/2)', true);
  await assert.rejects(
    () => withFetch({}, () => applyAll(URL0, 'OBJECTID', { deletes: [5] })),
    /0\/1/,
  );
  ok('хоосон бие (`deleteResults` алга) → алдаа (0/1)', true);
}

console.log('\n5. 200-аар ирдэг `{error}` бие — амжилт БИШ');
{
  await assert.rejects(
    () => withFetch(
      { error: { code: 400, message: 'Unable to complete operation.' } },
      () => applyAll(URL0, 'OBJECTID', { adds: [{ ner: 'А' }] }),
    ),
  );
  ok('`{ error }` нь шидэгдэнэ', true);
}

console.log('\n6. OID-гүй засах мөр — сүлжээнд залгахаас ӨМНӨ татгалзана');
{
  let sentN = -1;
  await assert.rejects(async () => {
    const r = await withFetch({}, () => applyAll(URL0, 'OBJECTID', { updates: [{ dun: 1 }] }));
    sentN = r.sent.length;
  });
  ok('шидэв, хүсэлт явсангүй', sentN === -1);
}

console.log(`\n✅ tableWrite.applyAll — ${pass} шалгуур давлаа`);
