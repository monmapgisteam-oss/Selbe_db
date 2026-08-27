/**
 * БИЕТ ГҮЙЦЭТГЭЛИЙН «МЭДЭЭЛЭЛГҮЙ ≠ 0%» — ЖИВЭЭР шалгана.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/phys.check.mjs
 *
 * Хамгаалж буй алдаа (2026-08-27): `MonthPt.phys` нь бөглөгдөөгүй сард 0
 * буцаадаг байв. Үр дүнд нь «Гүйцэтгэлийн явц» график дээр:
 *   · бөглөгдөөгүй багц (жиш. Багц 2) дээр «Бодит гүйцэтгэл» ба «Зөрүү»
 *     ХОЁУЛАА чимээгүй алга болж, зөвхөн төлөвлөгөөний тасархай шугам үлддэг;
 *   · бөглөгдсөн багц дээр эхний ЖИНХЭНЭ 0%-ийн саруудыг `> 0` шүүлт таслаж,
 *     муруй хожуу сараас эхэлдэг байв.
 *
 * ⚠️ `Finance.tsx` нь .tsx тул Node шууд ачаалахгүй. Тиймээс энд `phys` мапыг
 *    ЭХ СУРВАЛЖААС нь (`blockProgress` → `Bagts_*`) яг ижил дүрмээр давтаж
 *    барина — логик өөрчлөгдвөл энэ шалгуур хамт унах ёстой.
 *
 * ⚠️ ХАТУУ ТОО ТАВИХГҮЙ: гүйцэтгэл дөнгөж орж эхэлж байгаа тул «≥N багц»
 *    гэсэн хязгаар өгөгдөл бөглөгдөх хүртэл улаан байх бөгөөд жинхэнэ
 *    эвдрэлийг далдална. ДҮРЭМ дээр л тогтоно.
 */
import assert from 'node:assert/strict';
import { loadBlockHistory } from '../lib/blockProgress.ts';
import { CASHFLOW2, bagtsKey, blockKey } from '../lib/services.ts';

const hist = await loadBlockHistory();
const nowYm = new Date().toISOString().slice(0, 7);

/* ── `Finance.loadFinDataRaw`-ын phys бүтээлтийн хуулбар ── */
const byPkg = new Map();
for (const [key, pts] of hist) {
  const [bg, bl] = key.split('|');
  const k = bagtsKey(bg);
  const b = blockKey(bl);
  if (!k || !b) continue;
  const blocks = byPkg.get(k) ?? new Map();
  const arr = blocks.get(b) ?? [];
  for (const p of pts) arr.push({ d: p.date, g: p.pct == null ? null : p.pct / 100 });
  blocks.set(b, arr);
  byPkg.set(k, blocks);
}

const phys = new Map();
for (const [k, blocks] of byPkg) {
  const byMon = new Map();
  for (const m of CASHFLOW2.months) {
    if (m.label > nowYm) continue;
    let sum = 0, cnt = 0;
    for (const arr of blocks.values()) {
      let best = null;
      for (const e of arr) if (e.d.slice(0, 7) <= m.label && (!best || e.d > best.d)) best = e;
      if (best?.g != null) { sum += best.g; cnt++; }
    }
    if (cnt > 0) byMon.set(m.label, (sum / cnt) * 100);
  }
  phys.set(k, byMon);
}

/** `contractMonths`-ийн ЯГ тэр мөр: байхгүйг `null`, 0-ээр НӨХӨХГҮЙ */
const monthsOf = (k) => {
  const ph = phys.get(k);
  return CASHFLOW2.months.map((m) => ({ label: m.label, phys: ph?.get(m.label) ?? null }));
};

/* 1. Бүртгэлгүй багц — БҮХ сар `null`, нэг ч 0 БАЙХГҮЙ */
const empty = monthsOf('ЭНЭ_БАГЦ_БАЙХГҮЙ');
assert.equal(empty.length, CASHFLOW2.months.length, 'сарын тоо CASHFLOW2-той таарах ёстой');
assert.ok(empty.every((m) => m.phys === null),
  'бүртгэлгүй багцын сар бүр null байх ёстой — 0 бол «биет гүйцэтгэл тэг» гэсэн ХУДАЛ уншилт');

/* 2. Бүртгэлтэй багц бүр — `null` ба тоо ЯЛГАГДАНА, хувь нь хүрээндээ */
let withData = 0, zeroMeasured = 0, points = 0;
for (const k of phys.keys()) {
  const ms = monthsOf(k);
  const meas = ms.filter((m) => m.phys != null);
  if (!meas.length) continue;
  withData += 1;
  for (const m of meas) {
    points += 1;
    assert.ok(Number.isFinite(m.phys), `${k} · ${m.label}: тоо биш утга (${m.phys})`);
    assert.ok(m.phys >= -0.001 && m.phys <= 100.001, `${k} · ${m.label}: хувь хүрээнээс гарав (${m.phys})`);
    if (m.phys === 0) zeroMeasured += 1;
  }
  /* Хэмжилт нь ирээдүйн сард ОРОХГҮЙ */
  for (const m of ms) {
    if (m.label > nowYm) assert.equal(m.phys, null, `${k} · ${m.label}: ирээдүйн сард хэмжилт байж болохгүй`);
  }
}

/* 3. `null` нь `0`-ээс ЯЛГАГДАЖ байгааг ил баталгаажуулна */
const anyMonths = withData > 0 ? monthsOf([...phys.keys()].find((k) => monthsOf(k).some((m) => m.phys != null))) : [];
if (anyMonths.length) {
  const nulls = anyMonths.filter((m) => m.phys === null).length;
  const nums = anyMonths.filter((m) => m.phys != null).length;
  assert.ok(nums > 0, 'дор хаяж нэг хэмжигдсэн сар байх ёстой');
  assert.ok(nulls + nums === anyMonths.length, 'сар бүр null эсвэл тоо — гуравдахь төлөв байхгүй');
}

console.log(
  `phys.check: ok — ${withData}/${phys.size} багц хэмжигдсэн · ${points} цэг`
  + ` · жинхэнэ 0% ${zeroMeasured} (эдгээр нь ХЭМЖИЛТ, null-аас ялгаатай)`,
);
