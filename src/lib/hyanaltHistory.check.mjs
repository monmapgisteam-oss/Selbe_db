/**
 * ХЯНАЛТЫН ШИЙДВЭРИЙН ЛОГ (`Shiidveriin_tuuh`) — 2026-10-01 (хэрэглэгч: бүгдийг зас).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltHistory.check.mjs
 *
 * Хамгаалж буй алдаа: шат бүр ГАНЦ нэрийн талбартай тул нэг мөрөнд нэг шат хоёр удаа
 * шийдвэл (А зөвшөөрөөд → дээд шат буцааж → Б дахин шалгаж буцаавал) А-гийн нэр
 * ДАРАГДДАГ байв. Лог нь шийдвэр бүрийг хадгалж, түүх нэрийг сэргээнэ.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  appendHistory, attachHistory, parseHistory, HIST_MAX_CHARS, HIST_MAX_ENTRIES, HIST_REASON_MAX,
} from './hyanaltHistory.ts';

/* ── 1. Задлах — тэсвэртэй ── */
assert.deepEqual(parseHistory(''), []);
assert.deepEqual(parseHistory(null), []);
assert.deepEqual(parseHistory('{эвдэрсэн'), []);
assert.deepEqual(parseHistory('{"a":1}'), []);
{
  const raw = JSON.stringify([
    { stage: 'engineer', who: 'А', at: 200, act: 'approve' },
    { stage: 'нэгэ', who: 'X', at: 1, act: 'approve' },       // буруу шат — хаягдана
    { stage: 'manager', who: 'М', at: 100, act: 'return', reason: 'буруу' },
  ]);
  const l = parseHistory(raw);
  assert.equal(l.length, 2, 'буруу бичлэг л хаягдах ёстой');
  assert.deepEqual(l.map((e) => e.at), [100, 200], 'агшнаар эрэмбэлэгдэх ёстой');
}

/* ── 2. Нэмэх — хамгийн хуучнаас хасна, шинэ нь ҮРГЭЛЖ үлдэнэ ── */
{
  let raw = '';
  for (let i = 0; i < HIST_MAX_ENTRIES + 15; i += 1) {
    raw = appendHistory(raw, { stage: 'engineer', who: `u${i}`, at: 1000 + i, act: 'approve' });
  }
  const l = parseHistory(raw);
  assert.equal(l.length, HIST_MAX_ENTRIES);
  assert.equal(l[l.length - 1].who, `u${HIST_MAX_ENTRIES + 14}`, 'шинэ үйл явдал хасагдах ёсгүй');
  assert.equal(l[0].who, 'u15', 'хамгийн ХУУЧИН нь хасагдах ёстой');
  /* Уртын хязгаар — урт шалтгаантай олон үйл явдал */
  let big = '';
  const why = 'ш'.repeat(5000);
  for (let i = 0; i < 40; i += 1) big = appendHistory(big, { stage: 'manager', who: 'М', at: i, act: 'return', reason: why });
  assert.ok(big.length <= HIST_MAX_CHARS, `талбарын хязгаар хэтэрсэн (${big.length})`);
  const lb = parseHistory(big);
  assert.equal(lb[lb.length - 1].at, 39, 'хамгийн сүүлийн үйл явдал үлдэх ёстой');
  assert.ok(lb.every((e) => (e.reason ?? '').length <= HIST_REASON_MAX), 'шалтгаан таслагдах ёстой');
}

/* ── 3. Дарагдсан нэрийг сэргээх — алхам ↔ лог ── */
{
  const iso = (ms) => new Date(ms).toISOString();
  /* Нэг мөр: инженер А зөвшөөрсөн (t=1000), менежер буцаасан (2000), инженер Б дахин шалгаж
     компанид буцаасан (3000). Талбарт инженерийн нэр = «Б» (А дарагдсан). */
  const log = parseHistory(JSON.stringify([
    { stage: 'engineer', who: 'А', at: 1000, act: 'approve' },
    { stage: 'manager', who: 'М', at: 2000, act: 'return', reason: 'зөрүүтэй' },
    { stage: 'engineer', who: 'Б', at: 3000, act: 'recheck-back', reason: 'засна уу' },
  ]));
  const steps = [
    { stage: 'engineer', kind: 'ok', at: iso(1000), who: 'Инженер Б' },
    { stage: 'engineer', kind: 'bad', at: iso(3000), who: 'Инженер Б' },
    { stage: 'manager', kind: 'bad', at: iso(2000), who: 'Менежер М' },
    { kind: 'sent', at: iso(500), who: 'Компани' },
  ];
  const { matched, extra } = attachHistory(steps, log, () => true);
  assert.equal(matched.get(steps[0])?.who, 'А', 'зөвшөөрлийн алхамд А (дарагдсан нэр) сэргэх ёстой');
  assert.equal(matched.get(steps[1])?.who, 'Б');
  assert.equal(matched.get(steps[2])?.who, 'М');
  assert.equal(extra.length, 0);
  /* Компанид менежерийн үйл явдал «нэмэлт» болж ГАРАХГҮЙ */
  const onlyEng = attachHistory([steps[0]], log, (s) => s === 'engineer');
  assert.ok(onlyEng.extra.every((e) => e.stage === 'engineer'), 'компанид дээд шатны нэр задрах ёсгүй');
  /* Агшин зөрвөл (5 сек-ээс их) тулгахгүй */
  const far = attachHistory([{ stage: 'engineer', kind: 'ok', at: iso(1000 + 60_000) }], log, () => true);
  assert.equal(far.matched.size, 0);
}

/* ── 4. Эх кодын гэрээ ── */
{
  const H = fs.readFileSync('src/lib/hyanalt.ts', 'utf8');
  assert.ok(H.includes("history: 'Shiidveriin_tuuh'"), 'hyanalt: F.history талбар алга');
  assert.ok(H.includes('export async function hasHistoryField()'), 'hyanalt: талбарыг илрүүлэх функц алга');
  const S = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  assert.ok(/if \(has !== true\) return \{\};/.test(S), 'historyPatch: талбаргүй/мэдэхгүй үед бичихгүй байх ёстой');
  assert.equal((S.match(/historyPatch\(/g) ?? []).length, 4, 'apply · recheck ok · recheck back — гурван газар (+ тодорхойлолт)');
  assert.ok(S.includes('F.okCells, F.history,'), 'movedSince: логийг тулгахгүй байна — завсарт нэмсэн лог дарагдана');
  const G = fs.readFileSync('src/modules/Guitsetgel.tsx', 'utf8');
  assert.ok(G.includes('parseHistory(r[F.history])') && G.includes('attachHistory(out, log, vis)'), 'Guitsetgel: түүх логийг харуулахгүй байна');
}
console.log('✅ шийдвэрийн лог — тэсвэртэй задлал · хязгаар · дарагдсан нэр сэргэнэ · талбаргүй бол бичихгүй');
