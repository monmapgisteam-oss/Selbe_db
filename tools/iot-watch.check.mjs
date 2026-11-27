/**
 * IoT ХЯНАГЧ (`tools/iot-watch.mjs`) — мэдэгдлийн мөр ба төлөвийн санах ой (2026-11-27, сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/iot-watch.check.mjs
 *
 * Хамгаалж буй алдаа:
 *   1. (аудит №18) Төлөвийг Telegram руу илгээхээс ӨМНӨ бичдэг байсан — илгээлт унасан шилжилт дараагийн шалгалтад
 *      «өөрчлөлтгүй» болж, «БОСГО ДАВСАН» мэдэгдэл хэзээ ч явдаггүй байв.
 *   2. (аудит №43) Гэмтлийн мөр «—%r.h.» гэж гардаг байв — татгалзсан заалт (654.36) харагдах ёстой.
 */
import assert from 'node:assert/strict';
import { check, detail, faultRow, unsentState } from './iot-watch.mjs';

const quiet = async (fn) => {
  const { log, error } = console;
  console.log = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.log = log; console.error = error; }
};

const metric = (o) => ({ key: 'fill', label: 'Хогийн савны дүүрэлт', unit: '%', dp: 0, fault: false, faultValue: null, faultRaw: false, latest: null, trend: null, ...o });
const sensor = (series) => ({ key: 'waste', label: 'Хогийн сав', lastAt: Date.now(), series });
const ALERT = { value: 80, note: 'Сав ≥80% дүүрсэн' };

/* ── 1. Төлөв илгээлтийн ДАРАА ── */
{
  const run = async (state, series, send) => {
    const saved = [];
    const sentTo = [];
    const res = await quiet(() => check({
      load: async () => [sensor(series)],
      loadState: () => state,
      saveState: (o) => saved.push(o),
      to: ['1', '2'],
      send: async (chat, text) => { await send(chat); sentTo.push({ chat, text }); },
    }));
    return { res, saved, sentTo };
  };
  const hot = [metric({ latest: 85, alert: ALERT })];
  const down = async () => { throw new Error('fetch failed'); };

  /* ok → alert, Telegram бүх хүлээн авагчид унав: хадгалсан төлөв ӨМНӨХ (ok) хэвээр */
  const a = await run({ waste: 'ok' }, hot, down);
  assert.equal(a.res, 'failed');
  assert.deepEqual(a.saved, [{ waste: 'ok' }], 'мэдэгдээгүй шилжилт хадгалагдахгүй');
  /* дараагийн шалгалт (сэргэсэн): ижил шилжилт ДАХИН илгээгдэж, одоо л alert хадгалагдана */
  const b = await run(a.saved[0], hot, async () => {});
  assert.equal(b.res, 'sent');
  assert.equal(b.sentTo.length, 2);
  assert.match(b.sentTo[0].text, /БОСГО ДАВСАН/);
  assert.match(b.sentTo[0].text, /85%/);
  assert.deepEqual(b.saved, [{ waste: 'alert' }]);
  /* гурав дахь шалгалт: өөрчлөлтгүй — чимээгүй */
  const c = await run(b.saved[0], hot, async () => { throw new Error('илгээх ёсгүй'); });
  assert.equal(c.res, 'quiet');
  assert.deepEqual(c.saved, [{ waste: 'alert' }]);

  /* нэг хүлээн авагчид хүрсэн бол хангалттай — төлөв хадгалагдана */
  const d = await run({ waste: 'ok' }, hot, async (chat) => { if (chat === '1') throw new Error('blocked'); });
  assert.equal(d.res, 'sent');
  assert.deepEqual(d.saved, [{ waste: 'alert' }]);

  /* анхны ажиллалт (өмнөх төлөвгүй) дээр унавал түлхүүр бичигдэхгүй → дараа нь дахин мэдэгдэнэ */
  const e = await run({}, hot, down);
  assert.deepEqual(e.saved, [{}]);
  assert.deepEqual(unsentState({ a: 'ok', b: 'alert' }, { a: 'alert', b: 'alert', c: 'fault' }, ['a', 'c']), { a: 'ok', b: 'alert' },
    'өөрчлөгдөөгүй түлхүүр (b) шинэ төлөвөөрөө, өөрчлөгдсөн нь өмнөхөөрөө');
}

/* ── 2. Гэмтлийн мөрөнд татгалзсан утга ── */
{
  const soil = metric({ label: 'Хөрсний чийг', unit: '%r.h.', dp: 0, fault: true, faultValue: 654.36 });
  assert.equal(faultRow(soil), '  • Хөрсний чийг: <b>654.36%r.h.</b> — боломжгүй утга, мэдрэгчийн гэмтэл');
  assert.ok(!faultRow(soil).includes('—%'), '«—» утгын оронд гарахгүй');
  /* түүхий заалт (хөрвүүлэхээс өмнөх зай) — «%» нэгж залгахгүй */
  assert.equal(faultRow(metric({ fault: true, faultValue: 12, faultRaw: true })),
    '  • Хогийн савны дүүрэлт: <b>түүхий заалт 12</b> — боломжгүй утга, мэдрэгчийн гэмтэл');
  /* утга мэдэгдэхгүй — «—<нэгж>» хэсэг бүрмөсөн алга */
  assert.equal(faultRow(metric({ fault: true })), '  • Хогийн савны дүүрэлт — боломжгүй утга, мэдрэгчийн гэмтэл');
  assert.deepEqual(detail(sensor([soil])), [faultRow(soil)]);
}

console.log('iot-watch.check: OK');
