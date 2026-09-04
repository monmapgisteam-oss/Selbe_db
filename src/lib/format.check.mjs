/**
 * МӨНГӨН ФОРМАТЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/format.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ТОВЧЛОЛ БУЦАЖ ОРЖ ИРЭХ. 2026-09-01-нд хэрэглэгч «бүх мөнгөн дүн
 *      бүтэн харагдана, мянган орангийн таслалтай» гэж шийдсэн. Урьд нь
 *      портал даяар «их наяд / тэрбум / сая» товчлолын ДОЛООН биет хуулбар
 *      тарсан байсан (`format.mnt`, `Tailan.bn`, `reportPdf.bn`,
 *      `Dashboard.tug`, `Gazar.money`, `ExecKpi.money`, `suit/format.money`).
 *      Тэдгээрийг нэгтгэсэн — энэ шалгуур нь ДАХИН САЛАХААС хамгаална.
 *   2. `0` нь `'—'` БАЙХ. «0 ₮» гэж бичвэл «огт олгоогүй» гэж ХУДАЛ
 *      уншигдана (`PkgFin`, `PkgProg`-ийн тайлбар). `num`-аас ялгаатай.
 *   3. ТАСЛАЛ. `mn-MN` локаль нь мянгатыг ЗАЙГААР тусгаарладаг — хэрэглэгч
 *      ТАСЛАЛ шаардсан тул зай гарвал унана.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { mnt, num } from './format.ts';
import { money as suitMoney } from '../modules/analysis/suit/format.ts';

/* ── 1. Хэлбэр — бүтэн, таслалтай, нэгжтэй ── */
assert.equal(mnt(2_660_000_000_000), '2,660,000,000,000 ₮', 'их дүн бүтнээр');
assert.equal(mnt(314_500_000_000), '314,500,000,000 ₮');
assert.equal(mnt(4_058_800_000), '4,058,800,000 ₮');
assert.equal(mnt(76_000), '76,000 ₮');
assert.equal(mnt(-4_100_000_000), '-4,100,000,000 ₮', 'хасах дүн ч бүтнээр');

/* ── 2. Хоосон утга — `0` нь `'—'`, `num`-аас ЯЛГААТАЙ ── */
assert.equal(mnt(0), '—', '0 ₮ гэж бичвэл «олгоогүй» гэж худал уншигдана');
assert.equal(mnt(null), '—');
assert.equal(mnt(undefined), '—');
assert.equal(mnt(NaN), '—');
assert.equal(mnt(Infinity), '—');
assert.equal(num(0), '0', 'num нь 0-г 0 гэж бичсэн ХЭВЭЭР — зөвхөн mnt ялгаатай');

/* ── 3. Таслал заавал, ЗАЙ байж БОЛОХГҮЙ ── */
for (const v of [1_234_567, 2_660_000_000_000, 999_999]) {
  const s = mnt(v);
  assert.ok(s.includes(','), `${v} → таслалтай байх ёстой: ${s}`);
  assert.ok(!/\d[\s  ]\d/.test(s), `${v} → мянгатыг ЗАЙГААР тусгаарлаж болохгүй: ${s}`);
}

/* ── 4. Анализ модуль ч ижил дүрэмтэй (зөвхөн `₮` зайгүй наана) ── */
assert.equal(suitMoney(2_660_000_000_000), '2,660,000,000,000₮');
assert.equal(suitMoney(-1_500_000), '−1,500,000₮', 'хасах нь U+2212 тэмдэгтэй');
assert.equal(suitMoney(null), '—');
assert.ok(!suitMoney(1_500_000_000).includes('тэрбум'), 'анализ модульд товчлол үлдсэн байна');

/* ── 5. ТОВЧЛОЛ БУЦАЖ ОРООГҮЙ — `src/` бүхэлдээ ── */
const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BANNED = [
  'их наяд ₮', 'их н. ₮', 'тэрбум ₮', 'тэрб. ₮', 'сая ₮',
  'тэрбум₮', 'сая₮', 'мянга₮', '(тэрбум төг)',
];
/**
 * ⚠️ ЗӨВХӨН ГҮЙЦЭТГЭГДЭХ КОД шалгагдана — ТАЙЛБАРЫГ хасна. Портал даяарх
 *    ⚠️-тайлбарууд нь өмнөх алдаа, шийдвэрийг ХУУЧИН хэлбэрээр нь иш татдаг
 *    («9.4 тэрбум ₮-ийн акт огноогүй») — тэдгээр нь баримт, формат биш.
 *    Тэднийг хоригловол төслийн санах ой устана.
 *
 * ⚠️ Үл хамаарах файлууд — эдгээрт нэгжийн үг нь КОД дотор ч ФОРМАТ БИШ:
 *   `agent/format.ts` — хуучин чат, хэрэглэгчийн бичсэн текстийг таних regex
 *   `datasets.ts`     — өгөгдлийн толь («энэ талбар төгрөгөөр хадгалагдана»)
 *   `i18n/en.ts`      — толь; `i18n-extract` өөрөө цэвэрлэдэг
 *   `agent.check.mjs` — ангилагчийн сорил (ХУУЧИН хэлбэрийг ч таних ёстой)
 *   `format.check.mjs`— энэ файл (BANNED жагсаалт өөрөө)
 */
/** Тайлбар хасах — мөрийн ба блокийн тайлбарыг хоосон болгоно (CSS-ийнх ч мөн) */
const noComments = (src) => src
  .replace(new RegExp("/\\*[^]*?\\*/", "g"), " ")
  .replace(new RegExp("(^|[^:])//[^\\n]*", "g"), "$1");
const SKIP = ['lib/agent/format.ts', 'lib/datasets.ts', 'i18n/en.ts', 'lib/agent/agent.check.mjs', 'lib/format.check.mjs'];
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|mjs|css)$/.test(name)) continue;
    const rel = relative(ROOT, p).split(sep).join('/').replace(/^src\//, '');
    if (SKIP.includes(rel)) continue;
    const src = noComments(readFileSync(p, 'utf8'));
    for (const b of BANNED) if (src.includes(b)) hits.push(`${rel} :: «${b}»`);
  }
})(join(ROOT, 'src'));
assert.deepEqual(hits, [], `Мөнгөний ТОВЧЛОЛ буцаж орсон байна:\n  ${hits.join('\n  ')}`);

console.log('format.check.mjs — БҮГД ТЭНЦЛЭЭ');
