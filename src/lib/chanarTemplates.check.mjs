/**
 * ЧАНАРЫН БАРИМТЫН ЗАГВАРУУДЫН ШАЛГУУР — цэвэр утга, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chanarTemplates.check.mjs
 *
 * Хамгаалж буй зүйл (2026-09-28, `docs/chanar`):
 *   1. MA 6 ангилал, шаардлагатай тоо 126.
 * ⚠️ 2026-10-21: MIR · FIC · MS загварын шалгуурууд хасагдав — тэдгээр загвар амьд импортлогчгүй
 *    үхсэн код байсан тул `chanarTemplates.ts`-ээс устгагдсан.
 */
import assert from 'node:assert/strict';
import { MA_CATEGORIES, MA_REQUIRED } from './chanarTemplates.ts';

/* ══ 1. MA ангилал ══ */
{
  assert.equal(MA_CATEGORIES.length, 6);
  assert.equal(Object.values(MA_REQUIRED).reduce((a, b) => a + b, 0), 126, 'бүртгэлийн 126 материал');
  assert.deepEqual(Object.keys(MA_REQUIRED).sort(), [...MA_CATEGORIES].sort(), 'ангилал бүрд тоо');
}

console.log('chanarTemplates.check ✓');
