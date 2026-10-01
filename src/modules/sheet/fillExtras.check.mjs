/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ИЙН 2026-10-01-НИЙ САЙЖРУУЛАЛТ (хэрэглэгч: бүгдийг зас).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/fillExtras.check.mjs
 *
 *   1. «үлдэгдэл = Обьём − архив − хяналтад − ноорог» (`remainOf`) — null ≠ 0.
 *   2. Буулгалтын урьдчилсан харагдац — татгалзах нүд бүр (`planPaste.rejAt`) шалтгаантай.
 *   3. Буцаагдсан обьёмын илгээлт ба шалтгаан инженерт харагдана (`useObyem.pvReturned`).
 *   4. «Ноорог сэргээж байна…» түгжээ ба офлайн тэмдэг.
 *   5. Үхмэл Pivot · Level5 · Wbs хуудас устгагдсан.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { remainOf } from './fill/remain.ts';
import { parseGrid, planPaste } from './paste.ts';

/* ── 1. Үлдэгдэл ── */
assert.equal(remainOf(100, 40, 15, 5), 40, '100 − 40 − 15 − 5 = 40');
assert.equal(remainOf(null, 40, 0, 0), null, 'мөрийн Обьёмгүй бол null (0 БИШ)');
assert.equal(remainOf(0, 0, 0, 0), null, 'Обьём 0 бол бодох аргагүй');
assert.equal(remainOf(100, null, null, null), 100, 'бусад хэсэг null бол тэр хэсэг байхгүй');
assert.equal(remainOf(10, 8, 3, 0), -1, 'хэтэрсэн бол сөрөг — нуухгүй');

/* ── 2. Буулгалтын татгалзал ── */
{
  const vis = [0, 1, 2];
  /* 0-р мөр бүлэг (бичигдэхгүй), «абв» тоо биш, «-3» сөрөг, хоосон нүд татгалзал БИШ */
  const canWrite = (row) => row !== 0;
  const p = planPaste(parseGrid('1\t2\nабв\t-3\n\t4'), vis, 3, 0, 0, canWrite);
  assert.deepEqual(p.hits.map((h) => [h.row, h.b, h.v]), [[2, 1, '4']]);
  assert.deepEqual(p.rejAt.map((r) => [r.row, r.b, r.why]).sort(), [
    [0, 0, 'noWrite'], [0, 1, 'noWrite'], [1, 0, 'bad'], [1, 1, 'neg'],
  ].sort(), 'татгалзах нүд бүр байрлал ба шалтгаантай байх ёстой');
  assert.equal(p.rejAt.some((r) => r.row === 2 && r.b === 0), false, 'хоосон нүд татгалзал биш');
  const CE = fs.readFileSync('src/modules/sheet/fill/useCellEdit.ts', 'utf8');
  assert.ok(CE.includes('if (!confirmed && setPastePrev && rejAt.length > 0 && raw.length > 0)'),
    'useCellEdit: татгалзах нүдтэй буулгалт ШУУД бичигдэж байна — урьдчилан харуулах ёстой');
  assert.ok(CE.includes('if (pv.rows !== rowsAll)'), 'useCellEdit: хүснэгт солигдсоны дараа хуучин байрлалаар бичих эрсдэл');
  const FR = fs.readFileSync('src/modules/sheet/fill/FillRows.tsx', 'utf8');
  assert.ok(FR.includes('" pasteBad"') && FR.includes('" pasteOk"'), 'FillRows: урьдчилсан харагдацын тодруулга алга');
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  assert.ok(FN.includes('onClick={confirmPaste}') && FN.includes('onClick={cancelPaste}'), 'FillNew: «Бичих / Болих» алга');
}

/* ── 3. Буцаагдсан обьём ── */
{
  const O = fs.readFileSync('src/modules/sheet/fill/useObyem.ts', 'utf8');
  assert.ok(O.includes('last.status === OBYEM_STATUS.returned'), 'useObyem: сүүлийн буцаалтыг илрүүлэхгүй байна');
  assert.ok(O.includes('pvReturned.pkgKey === pkg.key'), 'useObyem: өөр багцын буцаалтын баннер наалдах эрсдэл');
  const T = fs.readFileSync('src/modules/sheet/fill/toolbar.tsx', 'utf8');
  assert.ok(T.includes('pvReturned.reason'), 'toolbar: буцаасан шалтгаан харагдахгүй байна');
}

/* ── 4. Сэргээлтийн түгжээ · офлайн ── */
{
  const D = fs.readFileSync('src/modules/sheet/fill/useDraftSync.ts', 'utf8');
  assert.ok(D.includes('const restoringUi = !noEdit && canPerf'), 'useDraftSync: сэргээлтийн түгжээ алга');
  assert.ok(D.includes("window.addEventListener('offline', off)"), 'useDraftSync: офлайн илрүүлэлт алга');
  const T = fs.readFileSync('src/modules/sheet/fill/toolbar.tsx', 'utf8');
  assert.ok(T.includes('st.restoringBadge') && T.includes('st.offlineBadge'), 'toolbar: тэмдэг алга');
}

/* ── 5. Үхмэл хуудас ── */
for (const f of ['Pivot.tsx', 'Level5.tsx', 'Wbs.tsx', 'wbs.data.ts']) {
  assert.ok(!fs.existsSync(`src/modules/sheet/${f}`), `${f} устгагдаагүй байна`);
}
console.log('✅ үлдэгдэл · буулгалтын урьдчилсан харагдац · буцаагдсан обьём · сэргээлтийн түгжээ · үхмэл хуудас устсан');
