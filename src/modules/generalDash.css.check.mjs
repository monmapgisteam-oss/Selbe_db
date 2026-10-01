/**
 * ЕРӨНХИЙ ДАШБООРД — НАРИЙН ДЭЛГЭЦИЙН CSS ДАРААЛАЛ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 *   node src/modules/generalDash.css.check.mjs
 *
 * Хамгаалах алдаа: `@media (max-width: 1180px)` доторх `.top` (нэг багана) дүрмийг ДАРАА нь
 * бичигдсэн суурь `.top` (ижил ялгаралт) дарж, 390px дээр зүүн багана 300px, зураг ~60px
 * болдог байв; `SplitGrip`-ийн бариулууд өрөгдсөн зураг дээгүүр саарал зураас татдаг (1024px).
 *  1. Нарийн дэлгэцийн блок нь эдгээр классын СҮҮЛИЙН суурь дүрмээс ХОЙНО.
 *  2. Блок дотор `.top` нэг багана, бариулууд нуугдсан.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./generalDash.module.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const at = css.indexOf('@media (max-width: 1180px)');
assert.ok(at >= 0, 'нарийн дэлгэцийн блок алга');
const block = css.slice(at, css.indexOf('\n}', at));

for (const cls of ['body', 'main', 'top', 'left', 'right', 'center', 'curve', 'hero', 'shell']) {
  /* мөрийн эхэнд эхэлсэн (media-гаас гадуурх) суурь дүрэм — `.top {`, `.left, .right {` г.м. */
  const re = new RegExp(`^\\.${cls}\\b[^{]*\\{`, 'gm');
  let last = -1;
  for (const m of css.matchAll(re)) last = m.index;
  assert.ok(last < at, `.${cls}-ийн суурь дүрэм нарийн дэлгэцийн блокоос ХОЙНО байна — media-г дарна`);
}
assert.match(block, /\.top\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, '.top нэг багана биш');
assert.match(block, /\.body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, '.body нэг багана биш');
assert.match(block, /\[role='separator'\][^{]*\{\s*display:\s*none/, 'чирэх бариул нуугдаагүй');
console.log('generalDash.css.check.mjs — 3 шалгалт ✓');
