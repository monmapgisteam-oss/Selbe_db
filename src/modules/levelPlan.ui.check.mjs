/**
 * 6 ТҮВШНИЙ ХУВААРЬ — харагдацын гэрээ (сүлжээгүй, фикстурын модоор).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/levelPlan.ui.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. Импортоос өмнө (dd_kod-той мөр 0) — алдаа биш, «импортлогдоогүй» төлөв; таб зурагдахгүй.
 *   2. L1–L6 бүгд зурагдана (6 таб), L1–L3 гант (өнөөдрийн шугам, milestone), L4–L6 heatmap.
 *   3. null ≠ 0: хуваарьгүй блокийн нүд «—», ажилгүй нүд хоосон.
 *   4. Унасан эх ил харагдана (`failed`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const React = (await import('react')).default;
const { createElement: h } = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { LocaleProvider } = await import('@/lib/i18n');
const { LevelPlanBody } = await import('./LevelPlan.tsx');
const { assemblePlan, emptyPlan } = await import('@/lib/projectPlanInputs');
const { linearPlanned } = await import('@/lib/projectPlan');

const DAY = 86_400_000;
const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fx = JSON.parse(readFileSync(new URL('../lib/projectPlan.fixture.json', import.meta.url), 'utf8'));
const fromSerial = (s) => (s == null ? null : (s - 25569) * DAY);
const str = (i) => (i == null ? null : fx.strs[i]);
const stored = fx.rows.map((r) => ({
  dd_kod: r[0], etseg_kod: r[1], uy_shat: r[2], bagts: str(r[3]), blok: r[4], ajil_uilchilgee: str(r[5]),
  ho_dun_geree: r[6], heseg_ezleh_huvi: r[7], tusul_ezleh_huvi: r[8],
  geree_ehleh: fromSerial(r[9]), geree_duusah: fromSerial(r[10]),
  gazar_ehleh: fromSerial(r[11]), gazar_duusah: fromSerial(r[12]),
  guits_ehleh: fromSerial(r[13]), guits_duusah: fromSerial(r[14]),
}));
const render = (d, initial) => renderToStaticMarkup(h(LocaleProvider, null, h(LevelPlanBody, { d, initial })));

/* ── 1. Хоосон ── */
{
  const at = D('2026-10-21') + 12 * 3600_000;
  const html = render({ plan: emptyPlan(at), marks: null, at, failed: [] }, 1);
  assert.ok(html.includes('импортлогдоогүй'), 'хоосон төлөв');
  assert.ok(!html.includes('role="tablist"'), 'таб зурагдахгүй');
}

/* ── 2. Бүтэн мод: Багц-1-ийн 5/1 л хуваарьтай (2026 онд жигд) ── */
{
  const at = D('2026-10-21') + 12 * 3600_000;
  const sched = {
    has: (_p, b) => b === '5/1',
    at: (p, b, asOf) => (b === '5/1' && /1$/.test(String(p).replace(/\D/g, '')) ? linearPlanned(D('2026-01-01'), D('2026-12-31'), asOf) : null),
    prime: () => {},
    keys: () => [],
  };
  const actual = { blocks: new Map([['БАГЦ1|5/1', { overall: 40, date: '2026-10-01', phases: [] }]]), universe: new Map(), infra: new Map() };
  const plan = assemblePlan(stored, { actual, sched, land: new Map() }, at, ['schedule:b41_9f']);
  const d = { plan, marks: new Map(), at, failed: plan.failed };

  const l1 = render(d, 1);
  assert.equal((l1.match(/aria-label="L[1-6] /g) ?? []).length, 6, '6 түвшний товч');
  /* 2026-10-29: бүлгийн түвшний товч («0 1 … N», Хуваарь шиг) */
  assert.ok(l1.includes('Бүгдийг хураах — зөвхөн дээд түвшний бүлгүүд') && l1.includes('Бүх ажлын мөрийг дэлгэнэ'), 'бүлгийн түвшний товч (Хуваарь шиг 0…N)');
  assert.equal((l1.match(/role="tab"/g) ?? []).length, 0, 'дутуу tab загвар үлдээгүй');
  assert.ok(l1.includes('L1.1') && l1.includes('L1.3'), 'L1 мөрүүд');
  assert.ok(l1.includes('Өнөөдөр 2026.10.21'), 'өнөөдрийн шугамын шошго');
  assert.ok(l1.includes('Багц 4-1 · 9 давхар хуваарь'), 'унасан эх ил (нэрээр)');
  assert.ok(!l1.includes('schedule:b41_9f'), 'дотоод код дэлгэцэнд гарахгүй');

  const l2 = render(d, 2);
  assert.ok(l2.includes('Ашиглалтад оруулах') && l2.includes('Огноо алга'), 'L2 milestone, огноо алга → улаан');

  const l3 = render(d, 3);
  assert.ok(l3.includes('Барилга угсралт — нийт'), 'L3 барилгын нийт');
  assert.ok(l3.includes('Бөглөх хуудасны дэд бүлгийг ачаалж байна'), 'дэд бүлэг ачаалж байна (SSR)');

  const l4 = render(d, 4);
  assert.ok(l4.includes('Багцын нийт') && l4.includes('Өсөх дүн'), 'L4 мөрүүд');
  assert.ok(l4.includes('>26.01<'), '2026-01 багана');
  assert.ok(l4.includes('>—<'), 'хуваарьгүй блок «—» (0 БИШ)');

  const l5 = render(d, 5);
  assert.ok(l5.includes('10.19–10.25'), '7 хоног Даваагаас');
  assert.ok(l5.includes('Нийлбэр'));

  const l6 = render(d, 6);
  assert.ok(l6.includes('>10.21<') && l6.includes('>11.03<'), '14 өдөр');
}

console.log('levelPlan.ui.check ✓');
