/**
 * СИСТЕМИЙН БАРИМТЫН БҮТЦИЙН ХАМААРАЛ — статик шалгуур.
 *   node docs/docs.invariant.check.mjs
 *
 * ⚠️ ЭНЭ ШАЛГУУР ТООГ ГАРААР БИЧДЭГГҮЙ. `dataBus.invariant.check.mjs`-ийн
 * зарчмыг дагана: эх кодыг ӨӨРИЙГ нь уншиж, баримтыг уншиж, ХОЁРЫГ тулгана.
 * Хуулбар байхгүй тул хоцрох боломжгүй.
 *
 * ⚠️ ЗӨВХӨН БҮТЭЦ. Тайлбарын үг бүрийг шалгах гэвэл хөгжүүлэгч баримтыг
 * сайжруулах бүрд тест унана → тест идэвхгүй болно → шалгуур ҮХНЭ. Тиймээс
 * энд зөвхөн ЖАГСААЛТ, ТОО, ХОЛБООС шалгагдана.
 *
 * Хамгаалж буй алдаа:
 *   1. Шинэ харагдац нэмэгдээд баримтад ОРООГҮЙ үлдэх (хамгийн түгээмэл).
 *   2. Харагдац хасагдсан ч баримтад үлдэх — уншигч байхгүй зүйл хайна.
 *   3. Өгөгдлийн түлхүүр нэмэгдэж/хасагдаж баримттай зөрөх.
 *   4. Удирдлагын үзүүлэлтийн тоо зөрөх.
 *   5. Диаграм жижиг алхмуудаар томорч уншигдахаа болих.
 *   6. Файлын нэр солигдоход дотоод холбоос чимээгүй эвдрэх.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BS = String.fromCharCode(92);
const norm = (p) => p.split(BS).join('/');
const read = (p) => readFileSync(p, 'utf8');

let bad = 0;
const ok = (b) => (b ? '✅' : '❌');
const chk = (name, pass, detail = '') => {
  if (!pass) bad += 1;
  console.log(`  ${ok(pass)} ${name}${detail ? ' · ' + detail : ''}`);
};

/* ═══════════ Ш1 · 19 ХАРАГДАЦ — хоёр талдаа ═══════════
 *
 * ⚠️ `services.ts`-ийн `VIEWS` массиваас `key: "..."` мөрүүдийг гаргана.
 *    Кодын дарааллаас хамаарахгүй — олонлогоор тулгана.
 * ⚠️ Баримтаас нэрийг БИШ, ТООГ шалгана: гарчгууд нь монгол орчуулгатай тул
 *    түлхүүрээр хайх боломжгүй. Оронд нь `services.ts`-ийн `title`-г авч,
 *    баримтад тэр гарчиг байгаа эсэхийг хайна.
 */
const SERVICES = read('src/lib/services.ts');
const VIEW_BLOCK = SERVICES.slice(SERVICES.indexOf('export const VIEWS'));

/* `key: "gdash",` ба түүний дараах `title: tr('...')` хосыг цуглуулна */
const views = [];
{
  const re = /key:\s*"([A-Za-z0-9]+)"[\s\S]{0,400}?title:\s*tr\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(VIEW_BLOCK)) !== null) views.push({ key: m[1], title: m[2] });
}

const DOC04 = read('docs/system/04-haragdac.md');

/* ⚠️ ЗӨВХӨН §1 ХҮСНЭГТЭЭС хайна, бүтэн файлаас БИШ. Бүтэн файлаас хайвал
 *    §3-ын товч тайлбарт гарчиг давтагддаг тул §1-ийн мөрийг устгасан ч
 *    шалгуур ногоон үлдэнэ — яг тэр алдааг 2026-09-16-нд туршилтаар илрүүлэв. */
const T_START = DOC04.indexOf('## 1. Бүгд нэг хүснэгтэд');
const T_END = DOC04.indexOf('## 2. Зургаан гол харагдац');
const TABLE1 = T_START >= 0 && T_END > T_START ? DOC04.slice(T_START, T_END) : '';

console.log('\nШ1 · Харагдацууд');
chk('VIEWS олдсон', views.length > 0, `${views.length} ширхэг`);
chk('§1 хүснэгт олдсон', TABLE1.length > 0);

const missing = views.filter((v) => !TABLE1.includes(v.title));
chk(
  'Бүх харагдац баримтад бий',
  missing.length === 0,
  missing.length ? 'ДУТУУ: ' + missing.map((v) => v.title).join(' · ') : `${views.length}/${views.length}`,
);

/* Эсрэг чиглэл: баримтын §1 хүснэгтийн мөрийн тоо ≥ харагдацын тоо.
 * ⚠️ ЯГ ТЭНЦҮҮ гэж шалгахгүй — хүснэгтэд толгой ба зураас мөр багтана. */
const tblRows = (DOC04.match(/^\| \*\*[^|]+\*\* \|/gm) ?? []).length;
chk(
  '§1 хүснэгт бүх харагдацыг хамарсан',
  tblRows >= views.length,
  `${tblRows} мөр ↔ ${views.length} харагдац`,
);

/* ═══════════ Ш2 · ӨГӨГДЛИЙН ТҮЛХҮҮР ═══════════
 *
 * ⚠️ `DataKey` нэгдлийн гишүүдийг `dataBus.ts`-ээс шууд уншина.
 */
const BUS = read('src/lib/dataBus.ts');
const keyBlock = BUS.slice(BUS.indexOf('export type DataKey'), BUS.indexOf("'SURVEY'") + 10);
const keys = [...keyBlock.matchAll(/\|\s*'([A-Z_]+)'/g)].map((m) => m[1]);

const DOC03 = read('docs/system/03-ogogdliin-zam.md');

console.log('\nШ2 · Өгөгдлийн түлхүүр');
chk('DataKey олдсон', keys.length > 0, `${keys.length} ширхэг`);

const keyMiss = keys.filter((k) => !DOC03.includes(k));
chk(
  'Бүх түлхүүр баримтад бий',
  keyMiss.length === 0,
  keyMiss.length ? 'ДУТУУ: ' + keyMiss.join(' · ') : `${keys.length}/${keys.length}`,
);

/* ═══════════ Ш3 · БАРИМТАД ДУРДСАН ЭХ СУРВАЛЖ БОДИТОЙ ЭСЭХ ═══════════
 *
 * ⚠️ ЗӨВХӨН НЭГ ЧИГЛЭЛД. `services.ts`-д 60+ экспорт байдаг бөгөөд бүгдийг
 *    баримтлах нь зорилго БИШ. Энд «баримтад БАЙГАА нэр код дотор бодитоор
 *    байна уу» гэдгийг л шалгана — «хуучин нэр үлдсэн» алдааг барина,
 *    харин шинэ туслах экспорт нэмэхэд тест УНАХГҮЙ.
 * ⚠️ Бүх эх сурвалж `services.ts`-д зарлагддаггүй: `PKGS` нь бөглөх хуудасны
 *    модульд, `HUVAARI_OBYEM` нь өөрийн модульд байна. Тиймээс `src/` доторх
 *    БҮХ эх файлаас хайна.
 */
const DOC02 = read('docs/system/02-ogogdliin-esurvalj.md');
const cited = [...DOC02.matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)].map((m) => m[1]);
const uniqCited = [...new Set(cited)];
/* Баримтын өөрийн нэр томьёо — кодын экспорт биш */
const DOC_ONLY = new Set(['ZONE_ID']);

const srcFiles = [];
(function walkSrc(dir) {
  for (const e of readdirSync(dir)) {
    const p = norm(join(dir, e));
    if (statSync(p).isDirectory()) walkSrc(p);
    else if (/[.]tsx?$/.test(e)) srcFiles.push(p);
  }
})('src');
const SRC_ALL = srcFiles.map(read).join('\n');

const ghost = uniqCited.filter((n) => !DOC_ONLY.has(n) && !SRC_ALL.includes(n));

console.log('\nШ3 · Эх сурвалжийн нэр');
chk(
  'Баримтад дурдсан нэр бүгд кодод бий',
  ghost.length === 0,
  ghost.length ? 'ОЛДООГҮЙ: ' + ghost.join(' · ') : `${uniqCited.length} нэр шалгав`,
);

/* ═══════════ Ш4 · УДИРДЛАГЫН ҮЗҮҮЛЭЛТИЙН ТОО ═══════════ */
const REG = read('src/lib/ceo/registry.ts');
const kpiBlock = REG.slice(REG.indexOf('CEO_KPIS'));
const kpiCount = (kpiBlock.match(/^\s*\{\s*key:\s*'/gm) ?? []).length;

/* Баримтын §4.3 хүснэгтийн дугаарласан мөр */
const kpiRows = (DOC03.match(/^\| \d+ \| /gm) ?? []).length;

console.log('\nШ4 · Удирдлагын үзүүлэлт');
chk('Бүртгэл олдсон', kpiCount > 0, `${kpiCount} үзүүлэлт`);
chk('Баримтын хүснэгт тохирч байна', kpiRows === kpiCount, `${kpiRows} мөр ↔ ${kpiCount} үзүүлэлт`);

/* ═══════════ Ш5 · ДИАГРАМЫН ХЭМЖЭЭ ═══════════
 *
 * ⚠️ Хэмжээ бол баримтын ЧАНАР. «Зүгээр л нэг зангилаа нэмье» гэсэн олон
 *    жижиг алхмаар диаграм 40 зангилаа болж, уншигдахаа болино.
 * ⚠️ `sequenceDiagram` нь өөр бичиглэлтэй тул `participant` мөрөөр тоолно.
 */
const MAX_NODES = 18;
const docFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = norm(join(dir, e));
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.md')) docFiles.push(p);
  }
})('docs');

console.log('\nШ5 · Диаграмын хэмжээ');
let diagrams = 0;
let tooBig = [];
for (const f of docFiles) {
  const src = read(f);
  const blocks = [...src.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks) {
    diagrams += 1;
    let n;
    if (/^\s*sequenceDiagram/m.test(b)) {
      n = (b.match(/^\s*participant /gm) ?? []).length;
    } else {
      /* Зангилааны тодорхойлолт: `ID[...]`, `ID(...)`, `ID{...}`, `ID[(...)]` */
      const ids = new Set(
        [...b.matchAll(/(?:^|\s|-->|---|\.->|\|)\s*([A-Za-z][A-Za-z0-9]*)\s*[[({]/g)].map((m) => m[1]),
      );
      n = ids.size;
    }
    if (n > MAX_NODES) tooBig.push(`${f} (${n})`);
  }
}
chk('Диаграм олдсон', diagrams > 0, `${diagrams} ширхэг`);
chk(
  `Бүгд ${MAX_NODES} зангилаанаас бага`,
  tooBig.length === 0,
  tooBig.length ? 'ХЭТЭРСЭН: ' + tooBig.join(' · ') : '',
);

/* ═══════════ Ш6 · ДОТООД ХОЛБООС ═══════════
 *
 * ⚠️ Кодын файл нэр солигдоход л энэ унана — тэр яг бидний хүсэж буй дохио.
 * ⚠️ Anchor (`#хэсэг`) хэсгийг таслаад зөвхөн файлын замыг шалгана.
 */
console.log('\nШ6 · Дотоод холбоос');
const broken = [];
for (const f of docFiles) {
  const dir = f.slice(0, f.lastIndexOf('/'));
  for (const m of read(f).matchAll(/]\(([^)#][^)]*)\)/g)) {
    const raw = m[1].split('#')[0];
    if (!raw || /^https?:/.test(raw)) continue;
    const target = norm(join(dir, raw));
    if (!existsSync(target)) broken.push(`${f} → ${raw}`);
  }
}
chk('Бүх холбоос зөв', broken.length === 0, broken.length ? 'ЭВДЭРСЭН: ' + broken.join(' · ') : '');

/* ═══════════ ДҮН ═══════════ */
console.log(
  bad === 0
    ? '\ndocs.invariant.check.mjs — БҮГД ТЭНЦЛЭЭ\n'
    : `\ndocs.invariant.check.mjs — ${bad} ШАЛГУУР УНАВ\n`,
);
assert.equal(bad, 0, 'баримт ба кодын бүтэц зөрөв');
