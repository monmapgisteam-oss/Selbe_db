/**
 * TELEGRAM-ИЙН ХӨРВҮҮЛЭЛТИЙН ТЕСТ.
 *
 * ⚠️ Яагаад чухал вэ: буруу HTML илгээвэл Telegram 400 буцааж, хэрэглэгч
 * хариултаа ОГТ авахгүй. Ботыг ажиллуулахгүйгээр энд шалгана.
 *
 * Ажиллуулах:  npm run test:tg
 */

import { readFileSync } from 'node:fs';
import { toHtml, stripHtml } from './telegram-format.mjs';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`); }
};

/* ── Бодит хариулт (агентаас яг ирсэн хэлбэр) ── */

const REAL = `Барилгын төлөв 3 ангилалтай, хамгийн их нь **220** төлөвлөсөн барилга.

| Төлөв | Тоо |
|---|---|
| Төлөвлөсөн | 220 |
| Баригдаж байгаа | 113 |
| Одоо байгаа | 30 |

Нийт 363 барилга.

Эх сурвалж: \`et:24\` / \`Barilga_ty\``;

console.log('\n1. Бодит хариулт');
const html = toHtml(REAL);
check('тод үсэг <b> болов', html.includes('<b>220</b>'));
check('хүснэгт <pre> болов', html.includes('<pre>'));
check('хүснэгтийн `|` тэмдэг арилсан', !/\|/.test(html));
check('тусгаарлагч мөр (---) орсонгүй', !html.includes('---'));

const pre = html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1] ?? '';
const preLines = pre.split('\n');
check('хүснэгт 4 мөртэй (толгой + 3)', preLines.length === 4, `${preLines.length}`);
check(
  'баганууд эгнэсэн (бүх мөр ижил өргөн)',
  new Set(preLines.map((l) => l.replace(/\s+$/, '').length)).size <= preLines.length,
);
console.log('     Telegram дээр ийм харагдана:');
for (const l of preLines) console.log(`       ${l}`);

console.log('\n2. Эх сурвалжийн мөр хасагдав');
check('«Эх сурвалж:» мөр гарахгүй', !/[Ээ]х сурвалж/.test(html));
check('`et:24` хариултад үлдээгүй', !html.includes('et:24'));
check('«Source:» ч мөн хасагдана', !toHtml('Хариулт\nSource: `x`').includes('Source'));
check('дунд нь байсан ч хасна', !toHtml('a\nЭх сурвалж: b\nc').includes('сурвалж'));
check('үндсэн агуулга хэвээр', toHtml('a\nЭх сурвалж: b\nc') === 'a\nc');
check('`код` тэмдэглэгээ бусад мөрөнд ажиллана', toHtml('`x`').includes('<code>x</code>'));

console.log('\n3. HTML аюулгүй байдал');
check('`<` зайлуулагдав', toHtml('a < b').includes('a &lt; b'));
check('`&` зайлуулагдав', toHtml('a & b').includes('a &amp; b'));
check(
  'хэрэглэгчийн `<b>` таг БОЛОХГҮЙ',
  toHtml('<b>хуурамч</b>').includes('&lt;b&gt;'),
);
check('markdown-ийн `_` хэвээр (алдаа өгөхгүй)', toHtml('a_b_c').includes('a_b_c'));
check('`[` `]` хэвээр', toHtml('[1] [2]').includes('[1] [2]'));

console.log('\n4. Жагсаалт ба нөөц зам');
check('`- ` нь `• ` болов', toHtml('- нэг\n- хоёр').includes('• нэг'));
check('stripHtml таг арилгана', stripHtml('<b>тод</b> текст') === 'тод текст');
check('stripHtml зайлуулалтыг буцаана', stripHtml('a &lt; b') === 'a < b');

console.log('\n5. Хязгаарын тохиолдол');
check('хоосон текст унахгүй', toHtml('') === '');
check('хүснэгтгүй текст хэвээр', toHtml('энгийн мөр') === 'энгийн мөр');
check(
  'дутуу нүдтэй хүснэгт унахгүй',
  toHtml('| a | b |\n|---|---|\n| ганц |').includes('<pre>'),
);

/* ⚠️ 2026-10-12 (дарааллын аудит): ЦАГИЙН БҮС — бот ба реле процесс эхлэхэд `TZ`-ээ Улаанбаатар
   болгох ёстой (статик: эх кодыг уншина — ботыг ажиллуулахгүй). Мөр нь ЭХНИЙ `import`-оос ӨМНӨ. */
console.log('\n6. Цагийн бүс (TZ) — бот · реле · Claude Code горим');
for (const f of ['./telegram-bot.mjs', '../agent-proxy/server.mjs', '../agent-proxy/claudeCode.mjs']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  const tzAt = src.search(/process\.env\.TZ \|\|= ['"]Asia\/Ulaanbaatar['"]/);
  const impAt = src.search(/^import /m);
  check(`${f}: TZ ||= Asia/Ulaanbaatar байна`, tzAt >= 0);
  check(`${f}: TZ нь эхний import-оос өмнө`, tzAt >= 0 && impAt > tzAt, `tz=${tzAt} import=${impAt}`);
}
for (const f of ['../deploy/telegram-bot/selbe-bot.service', '../deploy/telegram-bot/Dockerfile']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  check(`${f}: TZ=Asia/Ulaanbaatar`, /^(Environment=|ENV )TZ=Asia\/Ulaanbaatar/m.test(src));
}

console.log(failures ? `\n❌ ${failures} шалгуур унав` : '\n✅ Telegram-ийн хөрвүүлэлт бүрэн');
process.exit(failures ? 1 : 0);
