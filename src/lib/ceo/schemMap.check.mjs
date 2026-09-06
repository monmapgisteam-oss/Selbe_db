/**
 * ҮЗҮҮЛЭЛТ → СХЕМИЙН ЗАНГИЛААНЫ ЗУРАГЛАЛ — цэвэр өгөгдөл, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/schemMap.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ҮЗҮҮЛЭЛТ ЧИМЭЭГҮЙ АЛГА БОЛОХ. `registry.ts`-д шинэ карт нэмэгдээд энд
 *      зураглал нь бичигдээгүй бол схем дээр ОГТ гарахгүй, алдаа ч өгөхгүй —
 *      хамгийн муу төрлийн эвдрэл (хуучин `kpiNodes.check.mjs`-ийн үүрэг).
 *   2. БАЙХГҮЙ ЗАНГИЛАА ЗААХ. `schemFine.ts`-ээс карт устгагдвал энд заасан
 *      түлхүүр хоосон руу заана.
 *   3. Устсан үзүүлэлт зураглалд ҮЛДЭХ — хуучирсан мөр.
 *
 * ⚠️ `registry.ts`-ийг ИМПОРТЛОХГҮЙ, ТЕКСТЭЭР уншина: тэр нь 13 ачаалагчийг
 * дагуулж `@/modules/Finance` (React + CSS модуль) руу заадаг тул Node дээр
 * ачаалагдахгүй (`registry.check.mjs`-тэй ижил шалтгаан).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KPI_FINE, fineOf, kpisAt } from './schemMap.ts';
import { FINE_BY_ID, FINE_NODES } from '../schemFine.ts';

/* ── 1. Заасан зангилаа бүр СХЕМД БАЙГАА ── */
const ids = new Set(FINE_NODES.map((n) => n.id));
for (const [k, v] of Object.entries(KPI_FINE)) {
  assert.ok(ids.has(v), `«${k}» нь схемд байхгүй «${v}» зангилаа заажээ`);
}

/* ── 2. `registry.ts`-ийн БҮХ карт зураглалтай ── */
const reg = readFileSync(new URL('./registry.ts', import.meta.url), 'utf8');
const keys = [...reg.matchAll(/\{\s*key:\s*'([^']+)',\s*title:/g)].map((m) => m[1]);
assert.ok(keys.length >= 12, `карт хэт цөөн олдов (${keys.length}) — хэв шинж эвдэрсэн байж магадгүй`);
for (const k of keys) {
  assert.notEqual(fineOf(k), undefined, `«${k}» үзүүлэлт схемд байрлалгүй — зурган дээр гарахгүй`);
}

/* ── 3. Зураглалд ХУУЧИРСАН мөр байхгүй ── */
for (const k of Object.keys(KPI_FINE)) {
  assert.ok(keys.includes(k), `«${k}» нь бүртгэлд байхгүй атлаа зураглалд үлджээ`);
}

/* ── 4. `kpisAt` — дараалал ба бүлэглэл ── */
{
  const fin = kpisAt('finContract');
  assert.deepEqual(fin, ['contractGap', 'uncontracted'], 'нэг зангилаанд хоёр үзүүлэлт, бичигдсэн дараалалаар');
  assert.deepEqual(kpisAt('tailan'), [], 'үзүүлэлтгүй зангилаа хоосон массив');
  /* Зураглалын БҮХ утга `kpisAt`-аар буцаж олдоно (нэг ч алдагдахгүй) */
  const back = new Set(FINE_NODES.flatMap((n) => kpisAt(n.id)));
  assert.equal(back.size, keys.length, 'зарим үзүүлэлт `kpisAt`-аар олдохгүй байна');
}

/* ── 5. Заасан зангилаанууд нь ХАРАГДАЦТАЙ (дарж орох боломжтой) ── */
for (const [k, v] of Object.entries(KPI_FINE)) {
  assert.ok(FINE_BY_ID[v].view, `«${k}»-ийн «${v}» зангилаа харагдацгүй — «Харагдац руу орох» ажиллахгүй`);
}

console.log(`ceo/schemMap.check.mjs — БҮГД ТЭНЦЛЭЭ (${keys.length} үзүүлэлт, ${new Set(Object.values(KPI_FINE)).size} зангилаа)`);
