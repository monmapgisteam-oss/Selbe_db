/**
 * ТӨЛӨВЛӨГӨӨ ба ӨӨРӨӨ ЗАСАХ — шалгуур (сүлжээгүй, цэвэр).
 *
 * Ажиллуулах: node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/agent/plan.check.mjs
 */

import { strict as assert } from 'node:assert';
import { planSteps } from '@/lib/agent/plan';
import { parseBlocks } from '@/lib/agent/blocks';
import { nearFields } from '@/lib/agent/tools';
import { buildSystemPrompt } from '@/lib/agent/registry';
import { toHtml } from '../../../tools/telegram-format.mjs';

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, `✗ ${name}`);
  console.log('  ✓', name);
  pass++;
};

const FENCE = '```';

console.log('\n1. Төлөвлөгөөний алхмууд');
{
  const fenced = [FENCE + 'plan', '1. Барилгын тоог төлвөөр гаргах', '2. Багцаар задлах', FENCE].join('\n');
  ok('хашилттай, дугаарласан', planSteps(fenced).join('|') === 'Барилгын тоог төлвөөр гаргах|Багцаар задлах');

  const dashed = [FENCE + 'plan', '- Гэрээг шүүх', '- Олголттой тулгах', FENCE].join('\n');
  ok('хашилттай, зураастай', planSteps(dashed).length === 2);

  ok('хашилтгүй энгийн мөрүүд', planSteps('Эхлээд барилгыг шалгана\nДараа нь багцаар задална').length === 2);
  ok('хоосон бол алхамгүй', planSteps('   ').length === 0);
  ok('6 алхамаар тасална', planSteps(Array.from({ length: 12 }, (_, i) => `${i + 1}. алхам`).join('\n')).length === 6);
}

console.log('\n2. ```plan блок — хариултад орвол');
{
  const b = parseBlocks(['Эхлэл.', FENCE + 'plan', '1. Нэг', FENCE, 'Төгсгөл.'].join('\n'));
  ok('блок болж задрав', b.map((x) => x.kind).join(',') === 'para,plan,para');
  ok('хаалтгүй блок залгигдав', parseBlocks([FENCE + 'plan', '1. Нэг'].join('\n')).length === 1);
}

console.log('\n3. Telegram — төлөвлөгөө ХАСАГДАНА');
{
  const h = toHtml(['Эхлэл.', FENCE + 'plan', '1. Барилгыг шалгах', FENCE, 'Төгсгөл.'].join('\n'));
  ok('алхмууд ботод гарахгүй', !h.includes('Барилгыг шалгах'));
  ok('эргэн тойрны текст хэвээр', h.includes('Эхлэл') && h.includes('Төгсгөл'));
}

console.log('\n4. Схемд зохицох — ойролцоо талбарын нэр');
{
  const known = ['on_', 'zone_id', 'guits_dun', 'objectid', 'SHAPE__Area'];
  ok('дагаврын зөрүү (`on` → `on_`)', nearFields('on', known)[0] === 'on_');
  ok('том/жижиг үсэг', nearFields('zone_id', known)[0] === 'zone_id');
  ok('доогуур зураасны зөрүү', nearFields('guitsdun', known)[0] === 'guits_dun');
  ok('огт таарахгүй бол хоосон', nearFields('xyzxyz', known).length === 0);
  ok('дээд тал нь 3 санал', nearFields('o', ['o1', 'o2', 'o3', 'o4', 'o5']).length === 3);
}

console.log('\n5. Системийн заавар');
{
  const p = buildSystemPrompt('all');
  ok('төлөвлөгөөний дүрэм бий', p.includes('## ТӨЛӨВЛӨГӨӨ') && p.includes(FENCE + 'plan'));
  ok('өөрөө засах дүрэм бий', p.includes('## ӨӨРӨӨ ЗАСАХ') && p.includes('Ойролцоо нэр'));
}

console.log(`\n✅ Төлөвлөгөө ба өөрөө засах — ${pass} шалгуур давлаа\n`);
