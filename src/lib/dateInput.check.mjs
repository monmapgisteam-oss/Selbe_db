/* `parseDayInput` — гараар бичсэн огноо (2026-10-04, хэрэглэгч: календараас сонголгүй бичих) */
import assert from 'node:assert/strict';
import { parseDayInput } from './dateInput.ts';

const ok = {
  '2026-10-04': '2026-10-04',
  '2026.10.04': '2026-10-04',
  '2026/10/04': '2026-10-04',
  '2026 10 04': '2026-10-04',
  '20261004': '2026-10-04',
  '2026-1-5': '2026-01-05',
  '  2026-10-04  ': '2026-10-04',
  '2028-02-29': '2028-02-29',
};
for (const [i, o] of Object.entries(ok)) assert.equal(parseDayInput(i), o, i);
assert.equal(parseDayInput(''), '', 'хоосон = арилгах');
assert.equal(parseDayInput('   '), '');
/* Буруу: байхгүй өдөр гулсахгүй, өдөр эхэндээ хоёрдмол, хэт хол он */
for (const bad of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '04.10.2026', '2026-10', '0202-10-04', 'abc', '2026-10-04x', '202610041'])
  assert.equal(parseDayInput(bad), null, bad);
/* 2026-10-04 (шүүлт): DatePicker — бичих явцад бүх текст дахин СОНГОГДОХГҮЙ (эх кодын шалгуур) */
{
  const fs = await import('node:fs');
  const P = fs.readFileSync('src/modules/sheet/DatePicker.tsx', 'utf8');
  const eff = P.slice(P.indexOf('const didInit = useRef(false);'), P.indexOf('}, [pos, focusMs]);'));
  assert.ok(eff.length > 0, 'didInit эффект алга');
  /* select() зөвхөн нэг удаагийн (didInit) салбарт */
  const sel = eff.indexOf('.select()');
  assert.ok(sel > eff.indexOf('if (!didInit.current)') && sel < eff.indexOf('return;', eff.indexOf('if (!didInit.current)')),
    'select() focusMs өөрчлөгдөх бүрд дуудагдсаар');
  assert.ok(/pointer: coarse/.test(eff), 'мэдрэгч дэлгэцэнд автомат фокус хаагдаагүй');
  assert.ok(!/inputMode="numeric"/.test(P), 'iOS тоон гар — «-» «.» алга');
  assert.ok(/onChange=\{\(e\) => \{[\s\S]*?navRef\.current = false;/.test(P), 'бичихэд navRef тэглэгдэхгүй');
  assert.ok(/ArrowDown[\s\S]*?typed !== value[\s\S]*?moveFocus\(arrow\)/.test(P), 'бичих талбарын сум өдрийн хүснэгт рүү шилжихгүй');
}
console.log('dateInput.check: ok');
