/**
 * TELEGRAM-ИЙН ХӨРВҮҮЛЭЛТИЙН ТЕСТ.
 *
 * Ажиллуулах:  npm run test:tg
 */

import { readFileSync } from 'node:fs';
import { toHtml, stripHtml, toHtmlChunks, toHtmlBlocks, TG_CHUNK_MAX } from './telegram-format.mjs';

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

console.log('\n7. Урт хариултын хуваалт (toHtmlChunks)');
{
  const balanced = (h) => {
    for (const t of ['b', 'code', 'pre']) {
      const o = (h.match(new RegExp(`<${t}>`, 'g')) ?? []).length;
      const c = (h.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
      if (o !== c) return false;
    }
    return !/<\/?[a-z]*$/i.test(h) && !/&[a-z]*$/i.test(h);
  };
  check('богино текст нэг хэсэг, toHtml-тэй ижил', JSON.stringify(toHtmlChunks(REAL)) === JSON.stringify([toHtml(REAL)]));
  check('хоосон текст — хэсэггүй', toHtmlChunks('').length === 0);
  // 300 мөр × ~60 тэмдэгт тод/код тэмдэглэгээтэй — 3800-аас хэд дахин урт
  const long = Array.from({ length: 300 }, (_, i) => `Мөр ${i + 1}: **тод ${i}** ба \`код_${i}\` & < > текст`).join('\n');
  const ch = toHtmlChunks(long);
  check('олон хэсэг болов', ch.length > 1, `${ch.length}`);
  check('хэсэг бүр ≤ 3800', ch.every((c) => c.length <= TG_CHUNK_MAX), `${Math.max(...ch.map((c) => c.length))}`);
  check('хэсэг бүрийн таг тэнцвэртэй (хагас таг/entity-гүй)', ch.every(balanced));
  check('хэсгүүдийг залгавал toHtml-тэй ижил', ch.join('\n') === toHtml(long));
  check('мөрийн хил дээр хуваагдсан (хэсэг бүр бүтэн мөрөөр эхэлнэ)', ch.every((c) => /^Мөр \d+:/.test(c)));
  // урт хүснэгт — <pre> блок бүтэн эсвэл <pre>-ээр дахин ороосон хэсгүүдэд
  const table = ['| Нэр | Тоо |', '|---|---|', ...Array.from({ length: 400 }, (_, i) => `| Багц ${i} баримт_${i} | ${i * 7} |`)].join('\n');
  const tc = toHtmlChunks(`Толгой\n${table}\nТөгсгөл`);
  check('урт хүснэгт хэд хэдэн хэсэгт', tc.length > 1, `${tc.length}`);
  check('хүснэгтийн хэсэг бүр ≤ 3800 ба <pre> тэнцвэртэй', tc.every((c) => c.length <= TG_CHUNK_MAX && balanced(c)));
  check('хүснэгтийн мөр дундуур таслагдаагүй', tc.flatMap((c) => c.split('\n')).map((l) => l.replace(/<\/?pre>/g, '')).filter((l) => /^Багц/.test(l)).every((l) => /\d+$/.test(l)));
  // нэг ХЭТ УРТ мөр (4500 тэмдэгт, тод хэсэгтэй) — зайн дээр хуваагдаж, нээлттэй <b> хаагдаж дахин нээгдэнэ
  const words = Array.from({ length: 700 }, (_, i) => `үг${i}`).join(' ');
  const oneLine = `Эхлэл **${words}** төгсгөл`;
  const oc = toHtmlChunks(oneLine);
  check('хэт урт мөр хуваагдав', oc.length > 1, `${oc.length}`);
  check('хэсэг бүр ≤ 3800, таг тэнцвэртэй', oc.every((c) => c.length <= TG_CHUNK_MAX && balanced(c)));
  check('тод таг хаагдаж дахин нээгдэв', oc.slice(0, -1).every((c) => c.endsWith('</b>')) && oc.slice(1).every((c) => c.startsWith('<b>')));
  check('хуваахад текст алдагдаагүй', stripHtml(oc.join(' ')).replace(/\s+/g, ' ') === stripHtml(toHtml(oneLine)).replace(/\s+/g, ' '));
  check('toHtmlBlocks — мөр бүр блок, хүснэгт нэг блок', toHtmlBlocks(REAL).filter((b) => b.startsWith('<pre>')).length === 1);
}

console.log('\n8. Хатуу хайчилт — entity таслагдахгүй');
{
  /** `&` бүр бүтэн `&amp;` / `&lt;` / `&gt;`-ийн эхлэл эсэх (тагийг хасаад) */
  const entOk = (h) => {
    const t = h.replace(/<\/?(?:b|code|pre)>/g, '');
    return [...t.matchAll(/&/g)].every((m) => /^&(?:amp|lt|gt);/.test(t.slice(m.index, m.index + 5)));
  };
  const preOk = (h) => (h.match(/<pre>/g) ?? []).length === (h.match(/<\/pre>/g) ?? []).length;
  const word = `x${'&'.repeat(5000)}`;
  const wc = toHtmlChunks(word);
  check('зайгүй урт «үг» (&×5000) хуваагдав', wc.length > 1, `${wc.length}`);
  check('«үг»: хэсэг бүр ≤ 3800, entity бүтэн', wc.every((c) => c.length <= TG_CHUNK_MAX && entOk(c)),
    wc.map((c) => JSON.stringify(c.slice(-6))).join(' '));
  check('«үг»: залгахад текст ЯГ хэвээр', stripHtml(wc.join('')) === word);
  const url = `үз https://e.x/?${Array.from({ length: 900 }, (_, i) => `a${i}=1&`).join('')}`;
  const uc = toHtmlChunks(url);
  check('урт холбоос (& дунд нь): хэсэг бүр ≤ 3800, entity бүтэн', uc.length > 1 && uc.every((c) => c.length <= TG_CHUNK_MAX && entOk(c)));
  check('урт холбоос: текст алдагдаагүй', stripHtml(uc.join('')).replace(/\s+/g, '') === url.replace(/\s+/g, ''));
  const row = '&<>'.repeat(1500);
  const rc = toHtmlChunks(`| n | v |\n|---|---|\n| ${row} | 1 |`);
  check('урт хүснэгтийн мөр (&<>×1500) хуваагдав', rc.length > 1, `${rc.length}`);
  check('мөр: хэсэг бүр ≤ 3800, <pre> тэнцвэртэй, entity бүтэн', rc.every((c) => c.length <= TG_CHUNK_MAX && preOk(c) && entOk(c)),
    rc.map((c) => JSON.stringify(c.slice(-12))).join(' '));
  check('мөр: текст алдагдаагүй', stripHtml(rc.join('')).replace(/\s+/g, '') === `nv${row}1`);
}

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
