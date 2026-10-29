/**
 * ӨГӨГДЛИЙН ЗУРГИЙН ШАЛГУУР — сүлжээгүй, цэвэр.
 *
 * Ажиллуулах: node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/agent/links.check.mjs
 */

import { strict as assert } from 'node:assert';
import { RECIPES, dataMapLines, recipeLines } from '@/lib/agent/links';
import { buildSystemPrompt, resolveSource } from '@/lib/agent/registry';

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, `✗ ${name}`);
  console.log('  ✓', name);
  pass++;
};

const ALL = () => true;

console.log('\n1. Жорын эх сурвалжууд бүртгэлд байгаа эсэх');
{
  const miss = [];
  for (const r of RECIPES()) {
    for (const id of r.needs) if (!resolveSource(id, 'all')) miss.push(`${r.ask} → ${id}`);
  }
  ok(`${RECIPES().length} жорын эх сурвалж бүгд бүртгэлтэй`, miss.length === 0);
  if (miss.length) console.log('   ', miss.join('\n    '));
}

console.log('\n2. Эрхээр шүүгдэх');
{
  const plan = recipeLines((id) => resolveSource(id, ['plan']) != null).join('\n');
  const fin = recipeLines((id) => resolveSource(id, ['pkgFin']) != null).join('\n');
  ok('«plan» эрхэд санхүүгийн жор ОРОХГҮЙ', !plan.includes('ds:ipc') && !plan.includes('ds:cashflow2'));
  ok('«pkgFin» эрхэд санхүүгийн жор ОРНО', fin.includes('ds:ipc') && fin.includes('ds:cashflow2'));
  const none = recipeLines(() => false);
  ok('эх сурвалжгүй үед зөвхөн эрхгүй жорууд үлдэнэ', none.length > 0 && !none.join('\n').includes('ds:'));
}

console.log('\n3. Зургийн бүтэц');
{
  const map = dataMapLines(ALL).join('\n');
  ok('гарчигууд бий', map.includes('ӨГӨГДЛИЙН ЗУРАГ') && map.includes('АЛЬ ТООГ АЛЬ ЭХЭЭС'));
  ok('түлхүүрийн дүрэм бий', map.includes('ДИАПАЗОН') && map.includes('БАРИЛГА = багц + блок'));
  ok('санхүүгийн холбоос бий', map.includes('Багц 8.2'));
  const lines = map.split('\n');
  const from = lines.findIndex((l) => l.startsWith('### ') && l.includes('урсгал'));
  const rest = lines.slice(from + 1);
  const to = rest.findIndex((l) => l.startsWith('### '));
  const flow = (to < 0 ? rest : rest.slice(0, to)).filter((l) => l.startsWith('- '));
  ok(`урсгалын мөр нэгтгэгдсэн (${flow.length} ≤ 20)`, from >= 0 && flow.length > 0 && flow.length <= 20);
  ok('нэг өгөгдлийн олон id', map.includes('`et:24`'));
}

console.log('\n4. Системийн заавар');
{
  const a = buildSystemPrompt('all');
  const b = buildSystemPrompt('all');
  ok('зураг ба жорууд зааварт орсон', a.includes('## ӨГӨГДЛИЙН ЗУРАГ') && a.includes('## ЖОРУУД'));
  ok('хоёр дуудалт ЯГ ижил (кэш эвдрэхгүй)', a === b);
  ok(`хэмжээ хязгаарт (${a.length} < 55000)`, a.length < 55000);
  const plan = buildSystemPrompt(['plan']);
  ok('эрх багатай заавар богино', plan.length < a.length);
}

console.log(`\n✅ Өгөгдлийн зураг — ${pass} шалгуур давлаа\n`);
