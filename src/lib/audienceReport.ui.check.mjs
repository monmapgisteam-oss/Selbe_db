/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — `audienceReport.ts` (цэвэр тооцоо, сүлжээгүй). `.ui.check` нэртэй — `execReport.ts`-ийн импорт
 * (`@/modules/Finance` …) `@arcgis/core`-ийн зохиомол модуль шаарддаг (`execReport.ui.check.mjs`-тэй ижил).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/audienceReport.ui.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-11-05, хэрэглэгчийн шийдвэр):
 *   1. Гурван тайлан НЭГ оролтоос: Хотын дарга ≥ 8 бүлэг, ≥ 12 график; Иргэдийн Төлөөлөгчдийн Хурал 4–5; Төлөөлөн удирдах зөвлөл 6–7.
 *   2. Хэсэг бүр — нэг график + 2–3 өгүүлбэр; өгүүлбэр бүр тооноос; «явцгүй» хэзээ ч гарахгүй (хэмжигдээгүй = 0%).
 *   3. Өөрчлөлтийн өгүүлбэр — хугацааны өөрчлөлт байвал ОРНО, байхгүй бол ОРОХГҮЙ.
 *   4. Гараар оруулах талбар алга — зөвхөн үүсгэсэн огноо, хэрэглэгчийн нэр.
 *   5. Хүснэгт ЗӨВХӨН хавсралтад — Хотын дарга ба Төлөөлөн удирдах зөвлөлд; Иргэдийн Төлөөлөгчдийн Хуралд хавсралтгүй.
 *   6. Заавал биш эх унасан (null) → тэр хэсэг «мэдээлэлгүй», тайлан бүхэлдээ үүснэ.
 */
import assert from 'node:assert/strict';
import { installDom, inputsFixture } from './audienceReport.fixture.mjs';

installDom();
const {
  buildReport, AUDIENCES, audienceLabel, progressOf, scheduleStatus, latePacks, stalledPacks, attentionItems, reportSubtitle,
} = await import('./audienceReport.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const allText = (rep) => rep.sections.flatMap((s) => s.text).join(' ');
const groups = (rep) => new Set(rep.sections.map((s) => s.group)).size;

const i = inputsFixture();
const mayor = buildReport('mayor', i);
const council = buildReport('council', i);
const board = buildReport('board', i);

console.log('\n1. Бүтэц');
ok('хүлээн авагчийн нэр бүтэн — товчлолгүй', () => {
  assert.deepEqual(AUDIENCES, ['mayor', 'council', 'board']);
  assert.equal(audienceLabel('mayor'), 'Хотын дарга');
  assert.equal(audienceLabel('council'), 'Иргэдийн Төлөөлөгчдийн Хурал');
  assert.equal(audienceLabel('board'), 'Төлөөлөн удирдах зөвлөл');
  for (const rep of [mayor, council, board]) assert.ok(!/ИТХ|ТУЗ|ТТБ/.test(JSON.stringify(rep)), 'товчлол гарав');
});
ok('Хотын дарга — ≥ 8 бүлэг, ≥ 12 график, хавсралт', () => {
  assert.ok(groups(mayor) >= 8, `бүлэг ${groups(mayor)}`);
  const charts = mayor.sections.filter((s) => s.chart.kind !== 'list').length;
  assert.ok(charts >= 12, `график ${charts}`);
  assert.ok(mayor.appendix, 'хавсралт алга');
  assert.deepEqual(mayor.sections.map((s) => s.no), ['1', '2.1', '2.2', '2.3', '3', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2', '7.1', '7.2', '8']);
  assert.equal(mayor.appendix.no, '9');
  assert.deepEqual(mayor.sections.map((s) => s.chart.kind),
    ['kpi', 'line', 'bars', 'bars', 'bars', 'line', 'bars', 'bars', 'bars', 'stacked', 'bars', 'bars', 'line', 'list']);
});
ok('Иргэдийн Төлөөлөгчдийн Хурал — 4–5 график, хавсралтгүй', () => {
  assert.ok(council.sections.length >= 4 && council.sections.length <= 5, String(council.sections.length));
  assert.equal(council.appendix, null);
  assert.deepEqual(council.sections.map((s) => s.chart.kind), ['kpi', 'bars', 'bars', 'line', 'list']);
  assert.equal(council.sections[0].chart.items.length, 3, 'гурван KPI карт');
});
ok('Төлөөлөн удирдах зөвлөл — 6–7 график, хавсралт', () => {
  assert.ok(board.sections.length >= 6 && board.sections.length <= 7, String(board.sections.length));
  assert.ok(board.appendix);
  assert.deepEqual(board.sections.map((s) => s.chart.kind), ['kpi', 'line', 'bars', 'bars', 'bars', 'bars', 'list']);
  const fin = board.sections[1].chart;
  assert.ok(fin.series.some((s) => s.label === 'Гэрээлсэн нийт дүн' && s.dashed), 'гэрээлсэн дүнтэй харьцуулна');
  assert.ok(fin.bars && fin.bars.values.length === 5, 'сарын олголтын багана');
  assert.equal(board.sections[4].title, 'Мөнгөн урсгалын төлөв — ирэх саруудын төлөвлөсөн санхүүжилт');
});

console.log('\n2. Хэсэг бүр — график + 2–3 өгүүлбэр');
for (const [name, rep] of [['Хотын дарга', mayor], ['Иргэдийн Төлөөлөгчдийн Хурал', council], ['Төлөөлөн удирдах зөвлөл', board]]) {
  ok(`${name}: хэсэг бүр графиктай, 2–3 өгүүлбэртэй, «явцгүй» алга`, () => {
    for (const s of rep.sections) {
      assert.ok(s.chart && typeof s.chart.kind === 'string', `${s.no} график алга`);
      assert.ok(s.text.length >= 2 && s.text.length <= 3, `${s.no} өгүүлбэр ${s.text.length}`);
      for (const t of s.text) {
        assert.ok(/[.)]$/.test(t), `${s.no}: өгүүлбэр цэгээр төгсөөгүй: ${t}`);
        assert.ok(!/явцгүй/i.test(t), `${s.no}: «явцгүй» гарав`);
        assert.ok(t.length > 20, `${s.no}: хэт богино өгүүлбэр: ${t}`);
      }
      assert.ok(s.title.length > 3 && /^\d+(\.\d+)?$/.test(s.no));
    }
  });
}

console.log('\n3. Тоо нь оролттой таарна');
ok('хураангуй — төслийн нийт явц · төлөвлөгөө · барилгын явц · газар · олголт', () => {
  const s = mayor.sections[0];
  assert.equal(s.chart.items[0].value, '31.7%');
  assert.equal(s.chart.items[0].sub, 'төлөвлөгөө 45.2%');
  assert.equal(s.chart.items[1].value, '24.6%');
  assert.equal(s.chart.items[2].value, '82.4%');
  assert.equal(s.chart.items[3].value, '25.0%');
  assert.equal(s.chart.items[4].value, 'хоцрогдол 9.6 н.х');
  assert.ok(s.text[0].includes('31.7%') && s.text[0].includes('45.2%'), s.text[0]);
  assert.ok(s.text[1].includes('24.6%') && s.text[1].includes('82.4%') && s.text[1].includes('500') && s.text[1].includes('412'), s.text[1]);
});
ok('санхүү — бүтэн дүн (2026-09-01 дүрэм), сарын олголт, огноогүй төлбөр, IPC-ийн төлөв багана (хувьгүй)', () => {
  const t = mayor.sections[1].text.join(' ');
  assert.ok(t.includes('2,495,841,880,529 ₮') && t.includes('2,100,000,000,000 ₮') && t.includes('530,870,000,000 ₮') && t.includes('25.0%'), t);
  assert.ok(!/тэрбум|сая/.test(t), 'товчлол гарав');
  assert.ok(t.includes('2026-10 сард 30,870,000,000 ₮ олгосон; хуримтлагдсан олголт 530,870,000,000 ₮.'), t);
  /* хугацааны төгсгөлийн сар — тэнхлэгийн сүүлийн сар биш */
  const sep = buildReport('mayor', inputsFixture({ d: { ...i.d, period: { key: 'prevMonth', from: '2026-09-01', to: '2026-09-30' } } }));
  assert.ok(sep.sections[1].text[2].startsWith('2026-09 сард 250,000,000,000 ₮ олгосон; хуримтлагдсан олголт 500,000,000,000 ₮.'), sep.sections[1].text[2]);
  /* огноогүй төлбөр — тэнхлэгийн төгсгөлийн хуримтлал нийт олголтоос бага бол өгүүлбэрт нэрлэнэ */
  const und = buildReport('mayor', inputsFixture({ x: { ...i.x, fin: { ...i.x.fin, given: 560.87e9 } } }));
  assert.ok(und.sections[1].text[2].endsWith('хуримтлагдсан олголт 530,870,000,000 ₮; огноогүй төлбөр 30,000,000,000 ₮ графикт ороогүй (нийт олголт 560,870,000,000 ₮).'), und.sections[1].text[2]);
  const ipc = mayor.sections[2];
  assert.equal(ipc.chart.kind, 'bars', 'нэг нийлбэрийн хувь утгагүй — тусдаа багана');
  assert.deepEqual(ipc.chart.items.map((x) => x.label), ['IPC-д ороогүй гүйцэтгэл', 'IPC үүссэн', 'Гарын үсэг зурсан', 'Олгосон']);
  assert.ok(ipc.text[0].includes('12,000,000,000 ₮') && ipc.text[1].includes('13,000,000,000 ₮'), ipc.text.join(' '));
  const fp = mayor.sections[3];
  assert.deepEqual(fp.chart.items.map((b) => b.label), ['Багц 5.1', 'Багц 1', 'Багц 2'], 'олголт эхэлсэн багц хувиар буурах');
  assert.equal(fp.chart.items[0].text, '60,000,000,000 ₮ · 60.0%');
  assert.ok(fp.text[0].includes('Гэрээт 4 багцаас 3-д олголт эхэлсэн; 1 багц олголт огт аваагүй'), fp.text[0]);
  assert.ok(fp.text[1].includes('Багц 5.1 (60.0%)') && fp.text[1].includes('10%-д хүрээгүй 2 багц'), fp.text[1]);
});
ok('үе шат — модны мөрүүд + Бэлтгэл ажил ба барилга угсралт; хэмжигдээгүй = 0%', () => {
  const s = mayor.sections[4];
  assert.equal(s.chart.items.length, 9);
  const h = s.chart.items.find((b) => b.label === 'Хүлээлгэн өгөх');
  assert.equal(h.value, 0, 'null явц 0 болоогүй');
  assert.equal(h.text, '0.0% · төлөвлөгөө 0.0%');
  assert.ok(s.text[1].includes('«ТЭЗҮ» 100.0%') && s.text[1].includes('«Хүлээлгэн өгөх» 0.0%'), s.text[1]);
  assert.equal(s.text[2], 'Бэлтгэл ажил 61.0%, барилга угсралт ажил 24.6%.');
});
ok('орон сууц — хоцрогдол 5 н.х босго, хамралт; багц бүрийн хоцрогдол', () => {
  const st = scheduleStatus(i.x);
  assert.equal(st.label, 'хоцрогдол 9.6 н.х');
  assert.ok(st.sentence.includes('9.6 нэгж хувиар хоцорч байна (төлөвлөгөө 34.2%, бодит 24.6%)'), st.sentence);
  assert.equal(scheduleStatus({ ...i.x, prog: { ...i.x.prog, planCoverage: 60 } }).label, 'хамрах хүрээ 60%');
  assert.equal(scheduleStatus({ ...i.x, prog: { ...i.x.prog, planned: 25 } }).label, 'хуваарийн дагуу');
  assert.equal(scheduleStatus({ ...i.x, prog: { ...i.x.prog, planned: 20 } }).label, 'түрүүлэлт 4.6 н.х');
  assert.deepEqual(latePacks(i).map((l) => l.key), ['БАГЦ2'], 'хамралт 60% багц хоцрогдолд орохгүй');
  assert.deepEqual(stalledPacks(i.x).map((p) => p.key), ['БАГЦ3', 'БАГЦ4'], 'null явц = 0% → 5%-иас доош');
  const s = mayor.sections[6];
  const b3 = s.chart.items.find((b) => b.label === 'Багц 3');
  assert.equal(b3.value, 0); assert.equal(b3.text, '0.0%');
  const b2 = s.chart.items.find((b) => b.label === 'Багц 2');
  assert.equal(b2.mark, 30.4); assert.equal(b2.text, '18.4% · хоцрогдол 12.0 н.х');
  const b4 = s.chart.items.find((b) => b.label === 'Багц 4');
  assert.equal(b4.mark, null, 'хамралт дутуу хуваарийн төлөвлөгөө тэмдэглэгдэхгүй');
  /* Зөвхөн хуваарь нь ШАЛГАГДАХ багц дүгнэгдэнэ — бусдыг «хуваарийн дагуу» гэж ойлгуулахгүй */
  assert.ok(s.text[0].startsWith('4 багцаас хуваарь нь шалгагдах 2; үүнээс 1 нь хуваариас 5 нэгж хувиас илүү хоцорсон, 2 багцын хуваарь хангалтгүй тул дүгнэсэнгүй.'), s.text[0]);
  assert.ok(s.text[1].includes('Багц 2: төлөвлөгөө 30.4%, бодит 18.4% (12.0 нэгж хувь)'), s.text[1]);
  assert.equal(s.text[2], '2 орон сууцны багц 5%-иас доош явцтай.');
});
ok('дэд бүтэц · нийгмийн дэд бүтэц · газар · саад · эрсдэл · ажиллах хүч', () => {
  assert.ok(mayor.sections[7].text[0].includes('2 багцын дундаж явц 26.8%; 2 багц эхэлсэн'), mayor.sections[7].text[0]);
  const soc = mayor.sections[8];
  assert.ok(soc.text[0].includes('3 объектоос 1 нь эхэлсэн, 0 нь дууссан'), soc.text[0]);
  assert.equal(soc.text[1], 'Хамгийн өндөр явцтай объект «Сургууль 960 хүүхэд» 15.0%.');
  assert.equal(soc.chart.items.find((b) => b.label === 'Эмнэлэг').value, 0, 'null явц 0%');
  const zeroSoc = buildReport('mayor', inputsFixture({ niigem: [{ name: 'Эмнэлэг', pct: null, bagts: '16.3' }] })).sections[8];
  assert.equal(zeroSoc.text[1], 'Нэг ч объектын барилга угсралт эхлээгүй (явц 0%).');
  const land = mayor.sections[9];
  assert.deepEqual(land.chart.items.map((b) => b.value), [412, 60, 28]);
  assert.ok(land.text[0].includes('82.4%') && land.text[0].includes('88 үлдсэн') && land.text[1].includes('«Хэлэлцээр» (60 талбар)'), land.text.join(' '));
  const lp = mayor.sections[10];
  assert.deepEqual(lp.chart.items.map((b) => b.label), ['Багц 2', 'Багц 4'], '0 талбартай багц орохгүй');
  assert.ok(lp.text[1].includes('Багц 2 (14 талбар)'), lp.text[1]);
  const risk = mayor.sections[11];
  assert.deepEqual(risk.chart.items.map((b) => b.value), [7, 3, 1, 2, 2], 'нэгж талбарын тоо (88) — өөр масштаб, газрын хэсэгт');
  assert.ok(risk.text[1].includes('хоцорсон 1 багц, 5%-иас доош явцтай 2 багц, газрын саадтай 2 багц'), risk.text[1]);
  const wf = mayor.sections[12];
  assert.ok(wf.text[0].includes('2026-10-30: 1,311 ажилтан, 71 техник хэрэгсэл, 10,488 хүн цаг'), wf.text[0]);
  assert.equal(wf.chart.months.length, 3);
});
ok('анхаарах зүйл — дүгнэлт + хоцорсон + 5%-иас доош + зөвшөөрөл; шийдвэрийн жагсаалт зөвлөмжтэй', () => {
  const items = attentionItems(i);
  assert.ok(items.some((it) => it.text.includes('Багц 2 хуваариас 12.0 нэгж хувиар хоцорсон')), JSON.stringify(items));
  assert.ok(items.some((it) => it.text.startsWith('Багц 3 явц 0.0%')), 'null явц 0%');
  assert.ok(items.some((it) => it.text.includes('Багц 2 · 2-р шат · Барилгын ажил эхлүүлэх зөвшөөрөл — Зөвшөөрөөгүй')));
  assert.ok(items.every((it) => ['bad', 'warn', 'info'].includes(it.tone)));
  /* Багц бүр нэг л удаа; хуваарийн хамрах хүрээний дүгнэлт (4.1-д байгаа) давтагдахгүй */
  const pkHits = (name) => items.filter((it) => it.text.includes(name) && !/-р шат/.test(it.text)).length; // зөвшөөрлийн мөр тусдаа
  assert.equal(pkHits('Багц 2 '), 1, 'Багц 2 давхардсан');
  assert.equal(pkHits('Багц 3 '), 1, 'Багц 3 давхардсан');
  assert.ok(!items.some((it) => /хамарсан|хамрах хүрээ/.test(it.text)), 'хамрах хүрээний дүгнэлт давтагдав');
  const att = mayor.sections[13];
  assert.ok(att.text[0].startsWith(`${items.length} асуудал анхаарал шаардаж байна`), att.text[0]);
  const dec = board.sections[6];
  assert.ok(dec.chart.items.length >= 2 && dec.chart.items.every((it) => it.text.includes(':')), JSON.stringify(dec.chart.items));
  assert.ok(dec.chart.items.some((it) => it.text.includes('Багц 2: хоцрогдол 12.0 нэгж хувь')));
});
ok('мөнгөн урсгал — сарын мөр байвал ирэх сарууд, үгүй бол гэрээлсэн дүнгийн үлдэгдэл', () => {
  const c = board.sections[4];
  assert.deepEqual(c.chart.items.map((b) => b.label), ['2026-11', '2026-12', '2027-01']);
  assert.ok(c.text[0].includes('Ирэх 3 сард төлөвлөсөн санхүүжилт 270,000,000,000 ₮') && c.text[1].includes('2026-12 — 120,000,000,000 ₮'), c.text.join(' '));
  const b2 = buildReport('board', inputsFixture({ cashOutlook: null }));
  assert.equal(b2.sections[4].title, 'Мөнгөн урсгалын төлөв — гэрээлсэн дүнгийн үлдэгдэл');
  assert.deepEqual(b2.sections[4].chart.items.map((b) => b.value), [2.1e12, 530.87e9, 1_575_100_000_000]);
});
ok('Иргэдийн Төлөөлөгчдийн Хурал — өрх · нийгмийн дэд бүтэц · 3 тоо · хуваарь', () => {
  const soc = council.sections[1];
  assert.equal(soc.chart.items[0].label, 'Орон сууцны барилга угсралт');
  assert.ok(soc.text[0].includes('24.6%: 113 блок, 8,387 өрх'), soc.text[0]);
  const f3 = council.sections[2];
  assert.deepEqual(f3.chart.items.map((b) => b.value), [2_495_841_880_529, 2.1e12, 530.87e9]);
  assert.ok(f3.text[0].includes('84.1%'), f3.text[0]);
  assert.equal(council.sections[3].chart.series.length, 2);
});

console.log('\n4. Хугацааны өөрчлөлт — байвал орно, үгүй бол орохгүй');
ok('өөрчлөлттэй — орон сууц · олголт · ажиллах хүч · техник', () => {
  const t = allText(mayor);
  assert.ok(t.includes('Сонгосон хугацаанд (2026-10-01 → 2026-10-31) Барилгын явц 2.7 нэгж хувиар өссөн.'), t);
  assert.ok(!/өмнөх хугацаанаас/.test(t), 'хаалтан доторх огноо нь сонгосон хугацаа — «өмнөх хугацаа» гэж нэрлэхгүй');
  assert.ok(t.includes('Сонгосон хугацаанд (2026-10-01 → 2026-10-31) 30,870,000,000 ₮ олгосон, 4 төлбөр.'), t);
  assert.ok(t.includes('Ажиллаж буй хүн өмнөх бүртгэлээс (2026-09-30 → 2026-10-30) 111 хүнээр өссөн.'), t);
  assert.ok(t.includes('Техник хэрэгсэл өмнөх бүртгэлээс (2026-09-30 → 2026-10-30) 11 нэгжээр өссөн.'), t);
  assert.ok(t.includes('Сонгосон хугацаанд хамгийн их олголт Багц 1 багцад — 20,000,000,000 ₮.'), t);
  assert.equal(mayor.sections[0].chart.items[1].trend, '+2.7 н.х');
  assert.equal(mayor.sections[0].chart.items[3].trend, '+30,870,000,000 ₮');
  const neg = buildReport('mayor', inputsFixture({ d: { ...i.d, given: { ...i.d.given, delta: -5e9 } } }));
  assert.equal(neg.sections[0].chart.items[3].trend, '−5,000,000,000 ₮', 'сөрөг өөрчлөлт «+-» биш');
});
ok('өөрчлөлтгүй (null) — өгүүлбэр алга, график мэдээлэлгүй, тайлан бүтнэ', () => {
  const rep = buildReport('mayor', inputsFixture({ d: null }));
  const t = allText(rep);
  assert.ok(!/өмнөх хугацаанаас|өмнөх бүртгэлээс|Сонгосон хугацаанд/.test(t), t);
  assert.equal(rep.sections.length, 14);
  assert.equal(rep.sections[1].chart.months.length, 0);
  assert.ok(rep.sections[1].text.includes('Сарын олголтын цуваа уншигдаагүй тул график мэдээлэлгүй.'));
  assert.equal(rep.sections[0].chart.items[1].trend, null);
  const dn = { ...inputsFixture().d, housing: { prev: 24.6, now: 24.6, delta: 0, prevAt: '2026-10-05', nowAt: '2026-10-26' } };
  assert.ok(allText(buildReport('mayor', inputsFixture({ d: dn }))).includes('Сонгосон хугацаанд (2026-10-01 → 2026-10-31) Барилгын явц өөрчлөгдөөгүй.'));
  const dm = { ...inputsFixture().d, housing: { prev: 26, now: 24.6, delta: -1.4, prevAt: '2026-10-05', nowAt: '2026-10-26' } };
  assert.ok(allText(buildReport('mayor', inputsFixture({ d: dm }))).includes('1.4 нэгж хувиар буурсан.'));
});

console.log('\n5. Гараар оруулах талбар алга · хавсралт · заавал биш эх унасан');
ok('гарчиг, дэд гарчиг — үүсгэсэн огноо ба хэрэглэгчийн нэр л; гарын үсэг, чөлөөт текст алга', () => {
  assert.equal(reportSubtitle(i), 'Хугацаа 2026-10-01 → 2026-10-31 · Үүсгэсэн 2026-11-05 · Тэст Хэрэглэгч');
  assert.equal(mayor.title, 'Сэлбэ ухаалаг хотын төслийн тайлан — Хотын даргад');
  const js = JSON.stringify([mayor, council, board]);
  assert.ok(!/гарын үсэг|signature|textarea|placeholder/i.test(js.replace(/гарын үсэг зурсан/gi, '')), 'гараар бөглөх зүйл гарав');
  assert.deepEqual(Object.keys(mayor).sort(), ['appendix', 'audience', 'sections', 'subtitle', 'title']);
});
ok('хавсралт — багц бүрийн гэрээ · олголт · хувь · явц, диапазон мөр, Нийт мөр', () => {
  const a = mayor.appendix;
  assert.deepEqual(a.head, ['Багц', 'Гэрээлсэн (₮)', 'Олгосон (₮)', 'Олголт', 'Явц']);
  assert.deepEqual(a.rows[0], ['Багц 1', '400,000,000,000', '200,000,000,000', '50.0%', '32.9%']);
  assert.deepEqual(a.rows[2], ['Багц 3', '250,000,000,000', '0', '0.0%', '0.0%'], 'null явц 0%');
  assert.deepEqual(a.rows[3], ['Багц 4 (гэрээгүй)', '—', '0', '—', '3.2%']);
  assert.ok(a.rows.some((r) => r[0] === 'Багц-1-4 (хэд хэдэн багц хамарсан олголт)' && r[2] === '876,465,164'));
  assert.deepEqual(a.rows.at(-1), ['Нийт', '2,100,000,000,000', '530,870,000,000', '25.0%', '24.6%']);
  assert.deepEqual(board.appendix.rows, a.rows);
  assert.equal(board.appendix.no, '8');
  for (const s of [...mayor.sections, ...board.sections, ...council.sections]) assert.ok(!('table' in s), 'хүснэгт хэсэгт орсон');
});
ok('заавал биш эх бүгд унасан — хэсэг бүр «мэдээлэлгүй», тайлан гурвуулаа үүснэ', () => {
  const bare = inputsFixture({ d: null, project: null, phases: [], buildSub: [], ipc: null, lag: [], saad: null, hseDays: null, niigem: null, cashOutlook: null, failed: ['deltas', 'plan'] });
  for (const a of AUDIENCES) {
    const rep = buildReport(a, bare);
    for (const s of rep.sections) assert.ok(s.text.length >= 2, `${a} ${s.no}`);
  }
  const m = buildReport('mayor', bare);
  assert.ok(m.sections[2].text[0].includes('мэдээлэлгүй') && m.sections[2].chart.items.length === 0);
  assert.ok(m.sections[4].text[1].includes('мэдээлэлгүй') && m.sections[4].chart.items.length === 0);
  assert.ok(m.sections[8].text[0].includes('мэдээлэлгүй'));
  assert.ok(m.sections[10].text[0].includes('мэдээлэлгүй'));
  assert.equal(m.sections[11].chart.items[4].value, null, 'саад уншигдаагүй → null (0 биш)');
  assert.equal(m.sections[0].chart.items[0].value, '31.7%', 'төлөвлөгөөний мод алга → нэгтгэл гүйцэтгэл');
  assert.ok(!/явцгүй/.test(allText(m)));
});
ok('2026-11-06: хавсралтын мөрүүд «Нийт»-тэй тэнцэнэ — багцын мөрд ороогүй гэрээ, олголт', () => {
  const r = buildReport('mayor', inputsFixture({ x: { ...i.x, fin: { ...i.x.fin, planUnlisted: 8438911256, givenUnlisted: 5 } } })).appendix.rows;
  assert.deepEqual(r.at(-2), ['Багцын мөрд ороогүй гэрээ, олголт', '8,438,911,256', '5', '—', '—']);
  assert.ok(!mayor.appendix.rows.some((x) => x[0] === 'Багцын мөрд ороогүй гэрээ, олголт'), 'үлдэгдэлгүй бол мөр гарахгүй');
});
ok('2026-11-06: анхаарах жагсаалт — нэрс `items`-д байсан ч багц нэг л удаа, хүнд зэрэг мөрөнд шилжинэ; зөвшөөрлийн хураангуй давхардахгүй', () => {
  const pack = { key: 'БАГЦ31', name: 'Багц 3.1', kind: 'build', blocks: 11, households: 0, householdsMissing: 0, progress: 0.05 };
  const zov = { total: 4, ok: 2, wait: 2, no: 0, unknown: 0, byBagts: [], issues: [
    { bagts: 'Багц 1', ner: 'Түр цахилгаан', baiguullaga: 'УБЦТС', tolov: 'Хүлээгдэж буй', shat: 2 },
    { bagts: 'Багц 2', ner: 'Галын дүгнэлт', baiguullaga: 'ОБЕГ', tolov: 'Хүлээгдэж буй', shat: 2 },
  ] };
  const items = attentionItems(inputsFixture({ lag: [], x: { ...i.x, zov, prog: { ...i.x.prog, packs: [pack] } } }));
  const of31 = items.filter((it) => /Багц 3\.1|5%-иас доош/.test(it.text));
  assert.equal(of31.length, 1, JSON.stringify(of31));
  assert.equal(of31[0].tone, 'bad', '«5%-иас доош» дүгнэлтийн улаан зэрэг мөрөнд шилжинэ');
  assert.ok(!items.some((it) => /зөвшөөрөл хүлээгдэж байна/.test(it.text)), 'нэрлэсэн мөр байхад хураангуй гарахгүй');
  assert.equal(items.filter((it) => /УБЦТС|ОБЕГ/.test(it.text)).length, 2);
});
ok('2026-11-06: шийдвэрийн жагсаалт — зөвлөмжид нэрс дагалдана', () => {
  const pack = { key: 'БАГЦ31', name: 'Багц 3.1', kind: 'build', blocks: 11, households: 0, householdsMissing: 0, progress: 0.05 };
  const dec = buildReport('board', inputsFixture({ x: { ...i.x, prog: { ...i.x.prog, packs: [pack] } } })).sections.at(-1).chart.items;
  assert.ok(dec.some((it) => it.text.includes('Эдгээр багцын') && it.text.endsWith('(Багц 3.1)')), JSON.stringify(dec));
});
ok('2026-11-06: осол — сонгосон хугацааны мөр 7.2-т нэрээрээ, эрсдэлийн тоонд; уншигдаагүй бол ил хэлнэ', () => {
  const at = Date.UTC(2026, 9, 12, 5);
  const inc = [{ ognoo: at, bagts: 'Багц-2', turul: 'Амь нас эрсдэж болзошгүй байсан осол' }, { ognoo: Date.UTC(2020, 0, 1), bagts: 'Багц-1', turul: 'Эд хөрөнгийн хохирол' }];
  const period = { key: 'prevMonth', from: '2026-10-01', to: '2026-10-31' };
  const rep = buildReport('mayor', inputsFixture({ period, x: { ...i.x, incidents: inc } }));
  const wf = rep.sections.find((s) => s.key === 'workforce');
  assert.ok(wf.text[0].includes('1 осол, зөрчил') && wf.text[0].includes('Багц-2 · Амь нас эрсдэж болзошгүй байсан осол') && !wf.text[0].includes('Багц-1'), wf.text[0]);
  assert.ok(wf.text.length <= 3);
  assert.equal(rep.sections.find((s) => s.key === 'risk').chart.items.at(-1).value, 1);
  const none = buildReport('mayor', inputsFixture({ x: { ...i.x, incidents: null } })).sections.find((s) => s.key === 'workforce');
  assert.ok(none.text[0].includes('уншигдаагүй'), 'null ≠ 0 осол');
});
ok('2026-11-06: IPC — эхний багана нь IPC-д ороогүй гүйцэтгэл, олгосон нь урьдчилгаа/гүйцэтгэлээр; баримтгүй үед «0 ₮ хүлээж буй» гэж хэлэхгүй', () => {
  const s = buildReport('mayor', inputsFixture({ ipc: { work: 229e9, created: 0, signed: 0, paid: 530e9, advance: 314e9, perfPaid: 216e9 } })).sections.find((x) => x.key === 'ipc');
  assert.deepEqual(s.chart.items.map((b) => b.label), ['IPC-д ороогүй гүйцэтгэл', 'IPC үүссэн', 'Гарын үсэг зурсан', 'Олгосон — урьдчилгаа', 'Олгосон — гүйцэтгэлийн төлбөр']);
  assert.ok(s.text[0].includes('урьдчилгаа 314,000,000,000 ₮'), s.text[0]);
  assert.ok(!s.text.join(' ').includes('Олголт хүлээж буй'), s.text.join(' '));
  assert.ok(s.text.length <= 3);
});
ok('2026-11-06: нийгмийн объект — эхлэх хугацаа өнгөрсөн/болоогүй/огноогүй, нийт төсөвт ордоггүй дүн, ижил нэр кодоор ялгарна', () => {
  const niigem = [
    { name: '960 хүүхдийн сургууль', pct: 0, bagts: '19.1', start: Date.UTC(2026, 7, 1) },
    { name: '240 хүүхдийн цэцэрлэг', pct: 0, bagts: '20.1', start: Date.UTC(2099, 3, 1) },
    { name: '240 хүүхдийн цэцэрлэг', pct: 0, bagts: '20.2', start: null },
  ];
  const byType = [{ label: 'Нийгмийн дэд бүтэц', cost: 176063132660, contract: 0, perf: null, n: 12, contracted: 0 }];
  const s = buildReport('council', inputsFixture({ niigem, x: { ...i.x, gdash: { ...i.x.gdash, byType } } })).sections.find((x) => x.key === 'social');
  const t = s.text.join(' ');
  assert.ok(t.includes('эхлэх хугацаа өнгөрсөн 1 (960 хүүхдийн сургууль), хугацаа болоогүй 1, огноогүй 1'), t);
  assert.ok(t.includes('176,063,132,660 ₮ нь төслийн нийт төсөвт ордоггүй'), t);
  assert.ok(s.chart.items.some((b) => b.label === '240 хүүхдийн цэцэрлэг · 20.1'));
  assert.ok(s.chart.items.some((b) => b.label === '960 хүүхдийн сургууль'), 'давхардалгүй нэр кодгүй');
});
ok('2026-11-06: «Хамгийн өндөр олголт» — төсвийн багахан хэсгийн гэрээ тэргүүлэхгүй', () => {
  const rows = [
    { key: 'БАГЦ82', label: 'Багц 8.2', plan: 323040989, budget: 55.7e9, given: 323040989, pct: 100, contracted: true },
    { key: 'БАГЦ32', label: 'Багц 3.2', plan: 187.9e9, budget: 187.9e9, given: 65.6e9, pct: 34.9, contracted: true },
  ];
  const s = buildReport('mayor', inputsFixture({ x: { ...i.x, fin: { ...i.x.fin, rows } } })).sections.find((x) => x.key === 'finPacks');
  assert.ok(s.text[1].includes('Хамгийн өндөр олголттой багц Багц 3.2'), s.text[1]);
  assert.equal(s.chart.items[0].label, 'Багц 8.2', 'чарт хувиар хэвээр');
  assert.equal(s.chart.items.find((b) => b.hot).label, 'Багц 3.2');
});
ok('2026-11-06: бүх олголттой багц төсвийн багахан хэсгийн гэрээтэй — «олголт эхэлсэн багц алга» гэж худал хэлэхгүй', () => {
  const rows = [{ key: 'БАГЦ82', label: 'Багц 8.2', plan: 323040989, budget: 55.7e9, given: 323040989, pct: 100, contracted: true }];
  const s = buildReport('mayor', inputsFixture({ x: { ...i.x, fin: { ...i.x.fin, rows } } })).sections.find((x) => x.key === 'finPacks');
  assert.ok(s.text[1].includes('Хамгийн өндөр олголттой багц Багц 8.2'), s.text[1]);
  assert.equal(s.chart.items.find((b) => b.hot).label, 'Багц 8.2');
});
ok('2026-11-06: хоцорсон багцын осол анхаарах жагсаалтаас алга болохгүй', () => {
  const at = i.x.fetchedAt - 86400000;
  const pack = { key: 'БАГЦ32', name: 'Багц 3.2', kind: 'build', blocks: 12, households: 0, householdsMissing: 0, progress: 29.9 };
  const lag = [{ key: 'БАГЦ32', label: 'Багц 3.2', planned: 61.5, actual: 29.9, gap: 31.6, coverage: 100 }];
  const items = attentionItems(inputsFixture({ lag, x: { ...i.x, prog: { ...i.x.prog, packs: [pack] }, incidents: [{ ognoo: at, bagts: 'Багц 3.2', turul: 'Ноцтой осол' }] } }));
  assert.ok(items.some((it) => it.text.includes('хоцорсон') && it.text.startsWith('Багц 3.2')), JSON.stringify(items));
  assert.ok(items.some((it) => it.text.includes('Багц 3.2 · Ноцтой осол') && it.tone === 'bad'), JSON.stringify(items));
});
ok('2026-11-06: хугацаа өнгөрсөн ижил нэртэй объект бичвэрт кодоор ялгарна', () => {
  const niigem = [
    { name: '240 хүүхдийн цэцэрлэг', pct: 0, bagts: '20.1', start: Date.UTC(2026, 0, 1) },
    { name: '240 хүүхдийн цэцэрлэг', pct: 0, bagts: '20.2', start: Date.UTC(2026, 0, 1) },
  ];
  const t = buildReport('council', inputsFixture({ niigem })).sections.find((x) => x.key === 'social').text.join(' ');
  assert.ok(t.includes('(240 хүүхдийн цэцэрлэг · 20.1, 240 хүүхдийн цэцэрлэг · 20.2)'), t);
});
ok('progressOf — null/NaN → 0, тоо хэвээр', () => {
  assert.equal(progressOf(null), 0); assert.equal(progressOf(undefined), 0); assert.equal(progressOf(NaN), 0); assert.equal(progressOf(12.5), 12.5);
});

console.log(`\n✅ audienceReport: ${n} шалгуур давлаа`);
