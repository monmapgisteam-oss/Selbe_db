/**
 * ХУВААЛЦСАН ХУУДАСНЫ УНШИЛТ — CEO уншигчдын багана, төрлийн эрэмбэ, холболт (2026-10-21, гүйцэтгэлийн аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sheetShared.check.mjs
 *
 * Хамгаалах алдаа:
 *   1. Зөрүү (`execTriage`) эсвэл QAQC-ийн модонд (`ceo/qaqc`) хэрэгтэй багана дутвал тэр талбар `null` болж карт
 *      ЧИМЭЭГҮЙ буруу (`loadRows`: `fields`-д байхгүй багана → `null`).
 *   2. Байхгүй (`undefined`) талбар `outFields`-д орвол query бүхэлдээ унана.
 *   3. `'tree'` ⊄ `'variance'` болбол дээд зэргийн уншилт доод дуудагчид хүрэлцэхгүй — хуваалцалт алдагдана; Нүүр
 *      (`tree`) зөрүүний баганыг татвал нээлт бүрд +4.7 МБ.
 *   4. Кэшийн шийдвэр: дээд зэрэг байвал дахин татахгүй; яваагүй уншилтыг өргөжүүлнэ; явсан бол шинэ.
 *   5. Уншигчийн аль нэг нь `loadRows`-ийг дахин ШУУД дуудвал хуваалцалт алдагдана; кэш `BAGTS_SHEET`-гүй бол
 *      бөглөлтийн дараа 5 мин хуучин.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedFields, decide } from './sheetShared.ts';

const sc = {
  f: {
    oid: 'objectid', no: 'f_', work: 'Ажил', gun: 'gun', vol: 'Обьём', unit: 'нэгж_өртөг',
    asOf: 'шинэчлэгдсэн_огноо', fillDate: 'buglusun_ognoo', des: 'des_dugaar', money: 'мөнгөн_дүн', wD: 'хувийн_жин1',
  },
  obyem: ['f5_1_9obyem', null, 'f5_3_9obyem'],
};
const tree = sharedFields(sc, 'tree');
const variance = sharedFields(sc, 'variance');

/* 1. Хуучин жагсаалтууд хоёулаа багтана */
const oldVariance = [sc.f.oid, sc.f.no, sc.f.work, sc.f.vol, sc.f.unit, sc.f.asOf, sc.f.fillDate, ...sc.obyem].filter(Boolean);
const oldTree = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun];
for (const f of oldTree) assert.ok(tree.includes(f), `tree-д ${f} дутуу`);
for (const f of [...oldVariance, ...oldTree]) assert.ok(variance.includes(f), `variance-д ${f} дутуу`);
assert.deepEqual(tree, oldTree, 'tree нь ЯГ 4 багана — Нүүрэнд илүү татахгүй');
assert.equal(new Set(variance).size, variance.length, 'давхардалгүй');
assert.ok(!variance.includes(sc.f.money) && !variance.includes(sc.f.des) && !variance.includes(sc.f.wD), 'илүү багана (мөнгө · код · жин) нэмэхгүй — payload');

/* 2. Байхгүй талбар орохгүй */
assert.ok(!variance.includes(null) && !variance.includes(undefined), 'null багана орохгүй');
const noGun = sharedFields({ ...sc, f: { ...sc.f, gun: undefined } }, 'tree');
assert.ok(!noGun.includes(undefined) && !noGun.includes('gun'), '`gun`-гүй үйлчилгээнд `gun` орохгүй');
assert.deepEqual(sharedFields({ ...sc, obyem: [] }, 'variance').filter((x) => /obyem/.test(x)), [], 'блокгүй бүдүүвчид обьёмын багана байхгүй');

/* 3. tree ⊂ variance */
for (const f of tree) assert.ok(variance.includes(f), `tree ⊄ variance: ${f}`);

/* 4. Кэшийн шийдвэр */
assert.equal(decide(null, 'tree'), 'new');
assert.equal(decide({ kind: 'variance', sealed: true }, 'tree'), 'reuse', 'дээд зэрэг доод дуудагчид хүрэлцэнэ');
assert.equal(decide({ kind: 'variance', sealed: false }, 'tree'), 'reuse');
assert.equal(decide({ kind: 'tree', sealed: true }, 'tree'), 'reuse');
assert.equal(decide({ kind: 'tree', sealed: false }, 'variance'), 'upgrade', 'яваагүй уншилтыг өргөжүүлнэ');
assert.equal(decide({ kind: 'tree', sealed: true }, 'variance'), 'new', 'явсан уншилт хүрэлцэхгүй — шинэ');

/* 5. Холболт ба бүртгэл — эх кодоор */
const SRC = readFileSync('src/lib/sheetShared.ts', 'utf8');
assert.match(SRC, /register\(\(\) => \{ sheetCache\.clear\(\); \}, \['BAGTS_SHEET'\]\)/, 'кэш BAGTS_SHEET-д бүртгэлтэй');
assert.match(SRC, /fillSchema\(pkg\)/, 'бүдүүвч нь fillSchema (зөрүүний 2026-10-09-ний шийдвэр)');
assert.match(SRC, /await Promise\.resolve\(\);\s*\n\s*want\.sealed = true;/, 'битүүмжлэл нэг microtask-ийн дараа (зэрэг ирсэн уншигчийг цуглуулна)');
assert.match(readFileSync('src/lib/execTriage.ts', 'utf8'), /loadSheetShared\(pkg, 'variance'\)/, 'execTriage: variance төрөл');
/* ⚠️ 2026-10-23: QAQC хасагдсан — `ceo/qaqc.ts` (tree уншигч) устсан */
for (const f of ['src/lib/execTriage.ts']) {
  assert.doesNotMatch(readFileSync(f, 'utf8'), /[^\w.]loadRows\s*\(/, `${f}: \`loadRows\`-ийг шууд дуудахгүй`);
}
console.log('sheetShared.check: OK');
