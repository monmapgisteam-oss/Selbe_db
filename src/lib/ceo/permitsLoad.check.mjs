/**
 * CEO «Зөвшөөрөл» — УНАЛТ КЭШЛЭГДЭХГҮЙ (2026-09-30) + CEO самбарын автобус.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/permitsLoad.check.mjs
 *
 * ⚠️ ЯАГААД. `loadZov` уналтдаа ШИДДЭГГҮЙ (`null` буцаана) тул урьд нь
 *    `computePermits(null)` (unknown карт) АМЖИЛТТАЙ амлалт болж `cached`-д 5 минут
 *    үлддэг байв: нэг 429/timeout-ын дараа сүлжээ сэргэсэн ч карт «—» хэвээр, самбарын
 *    «Дахин оролдох» зөвхөн `error` төлөвт гардаг тул сэргээх зам ч байгаагүй
 *    (`iot.loadIotKpiSafe`-ээр аль хэдийн засагдсан ижил алдаа).
 *
 * Сүлжээ ОГТ хэрэглэхгүй — `fetch` нь хуурамч (эхлээд ArcGIS-ийн 200-аар ирдэг
 * алдаа, дараа нь хэвийн хариу).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let mode = 'fail';
let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  const body = mode === 'fail'
    ? { error: { code: 400, message: 'Invalid query', details: [] } }
    : {
      features: [
        { attributes: { OBJECTID: 1, bagts: 'Багц 1', shat: 1, zovshoorol_ner: 'Барилгын зөвшөөрөл', tolov: 'Зөвшөөрсөн' } },
        { attributes: { OBJECTID: 2, bagts: 'Багц 2', shat: 1, zovshoorol_ner: 'Газрын зөвшөөрөл', tolov: 'Зөвшөөрсөн' } },
      ],
      exceededTransferLimit: false,
    };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

const { loadPermitsKpiSafe } = await import('./permits.ts');

/* 1. Үйлчилгээ унасан → unknown карт (шидэхгүй) */
const a = await loadPermitsKpiSafe();
assert.equal(a.level, 'unknown', 'уналт unknown карт болох ёстой');
assert.ok(calls > 0, 'fetch дуудагдсангүй — шалгуур утгагүй');

/* 2. Сүлжээ сэргэв → ДАРААГИЙН дуудалт ШИНЭЭР татна (unknown кэшлэгдээгүй) */
mode = 'ok';
const before = calls;
const b = await loadPermitsKpiSafe();
assert.ok(calls > before, 'уналтын дараа дахин татсангүй — unknown карт кэшлэгдсэн (5 мин «—»)');
assert.equal(b.level, 'good', `сэргэсний дараа хэвийн карт гарах ёстой (${b.level})`);
assert.equal(b.value, '0', 'шийдэгдээгүй зөвшөөрөл 0');

/* 3. Амжилттай үр дүн КЭШЛЭГДЭНЭ (дахин дуудалт сүлжээ хөндөхгүй) */
const again = calls;
await loadPermitsKpiSafe();
assert.equal(calls, again, 'амжилттай үр дүн кэшлэгдсэнгүй');

/* 4. Бүртгэл нь уналт кэшлэгдэхгүй хувилбарыг дууддаг */
const reg = readFileSync(new URL('./registry.ts', import.meta.url), 'utf8');
assert.match(reg, /key: 'permits'[^\n]*load: loadPermitsKpiSafe\b/, 'registry: permits нь loadPermitsKpiSafe-ээр ачаалагдах ёстой');

/* 5. CEO онооны самбарын дэлгэрэнгүй KPI автобусыг дагана (`CeoBoard.useKpis`-тэй ижил) —
      эс бөгөөс портал дээрх бичилтийн дараа «эх үзүүлэлтүүд» карт хуучин тоогоо барина. */
const sc = readFileSync(new URL('../../components/CeoScorecard.tsx', import.meta.url), 'utf8');
const hook = sc.slice(sc.indexOf('function useDimKpis'), sc.indexOf('export function CeoScorecard'));
assert.match(hook, /useSyncExternalStore\(subscribeData, dataVersion/, 'useDimKpis автобуст бүртгүүлээгүй');
assert.match(hook, /\}, \[dim, nonce, bus\]\);/, 'useDimKpis-ийн эффект `bus`-ыг хамааралдаа агуулаагүй');

console.log('permitsLoad.check.mjs — БҮГД ТЭНЦЛЭЭ');
