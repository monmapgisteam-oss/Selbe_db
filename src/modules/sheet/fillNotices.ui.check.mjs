/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ийн жижиг UI дүрмүүд — огнооны хоног · шатны нэр гүйцэтгэгчид.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/fillNotices.ui.check.mjs
 */
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FillDatePicker } from './fill/FillDatePicker.tsx';
import { FillNotices } from './fill/notices.tsx';

/* ── Хоногийн «Тавих» — гараар бичсэн (Enter дараагүй) эхлэх огноогоор бодно ── */
{
  const row = { oid: 7, start: [Date.parse('2026-05-01T00:00:00Z')], end: [null], work: 'x' };
  const run = (kind, value, days, typed, pendDate = {}) => {
    const calls = [];
    const pick = { kind, row, b: 0, value, rect: {}, days };
    const tree = FillDatePicker({ pick, setPick: () => calls.push(['close']), busy: false, say: (m) => calls.push(['say', m]),
      setAsOf: () => {}, commitDate: (_r, _b, k, raw) => calls.push(['commit', k, raw]), pendDate });
    const p = tree.props.children.props;
    const can = p.days.canApply(typed);
    if (can) p.days.onApply(typed);
    return { can, calls };
  };
  assert.deepEqual(run('s', '2026-05-01', '30', '2026-06-01').calls,
    [['commit', 's', '2026-06-01'], ['commit', 'e', '2026-06-30'], ['close']], 'бичсэн огноо эхлэл болж, дуусах нь түүнээс');
  assert.deepEqual(run('s', '2026-05-01', '30', null).calls,
    [['commit', 's', '2026-05-01'], ['commit', 'e', '2026-05-30'], ['close']], 'бичээгүй бол нээсэн утга');
  assert.deepEqual(run('s', '2026-05-01', '30', '').calls,
    [['commit', 's', '2026-05-01'], ['commit', 'e', '2026-05-30'], ['close']], 'талбарыг хоосолсон (`parseDayInput` → "") — нээсэн утга, «цэвэрлэх» биш');
  assert.equal(run('s', '', '30', '').can, false, 'эхлэлгүй, хоосон талбар — идэвхгүй');
  assert.equal(run('s', '', '30', null).can, false, 'эхлэлгүй — идэвхгүй');
  assert.equal(run('s', '', '30', '2026-06-01').can, true, 'хоосон нүдэнд бичсэн огноотой — идэвхтэй');
  assert.deepEqual(run('e', '2026-08-01', '10', '2026-09-09').calls,
    [['commit', 'e', '2026-05-10'], ['close']], '«Дуусах» нүдэнд бичсэн огноо эхлэл БИШ — эхлэх нүднээс бодно');
  console.log('✅ хоногийн «Тавих» — гараар бичсэн эхлэх огноо');
}

/* ── Шатны нэр — гүйцэтгэгчид инженерээс дээш шат нэрээр харагдахгүй («Илгээсэн ажил» табтай нэг дүрэм) ── */
{
  const base = {
    locked: false, submitFailed: false, resend: async () => {}, resending: false, unmovedWarn: [], subReadErr: null,
    otherDaysInReview: [], otherDaysReturned: [], noEdit: false, busy: false, resumedOid: null,
    resumeReturned: async () => {}, returned: false, canAct: true, inReview: true,
  };
  const text = (o) => renderToStaticMarkup(h(FillNotices, { ...base, ...o })).replace(/<[^>]+>/g, '');
  assert.ok(text({ reviewStage: 'head' }).includes('Хэлтсийн дарга'), 'дотоод хэрэглэгчид шатны нэр');
  assert.ok(!text({ reviewStage: 'head', hideStage: true }).includes('Хэлтсийн дарга'), 'гүйцэтгэгчид дээд шатны нэр нуугдана');
  assert.ok(text({ reviewStage: 'head', hideStage: true }).includes('хяналтад байна'), 'гүйцэтгэгчид ерөнхий бичвэр');
  assert.ok(text({ reviewStage: 'engineer', hideStage: true }).includes('Хяналтын инженер'), 'инженерийн шат гүйцэтгэгчид харагдана');
  console.log('✅ шатны нэр — гүйцэтгэгчид нуугдана');
}

console.log('fillNotices.ui.check: ok');
