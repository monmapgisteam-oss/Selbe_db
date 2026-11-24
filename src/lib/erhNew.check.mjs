/**
 * ШИНЭ ЭРХИЙН ДЭЛГЭЦИЙН ЦЭВЭР ЛОГИКИЙН ШАЛГУУР (2026-11-23) — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/erhNew.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. Дэлгүүрийн мөр → хүн (`rightsOf` · `buildRows`): ялгаагүй гүйцэтгэгч 0 зөрүү; ТЭЗҮ-БОНУ туг тоологдохгүй.
 *   2. Хайлт · шүүлт (нэр · албан үүрэг · багц · эрхийн шошго · зөрүүтэй · асуудалтай).
 *   3. Албан үүргийн таван бүлэг 17-г ЯГ нэг удаа; багцын «гэр бүл».
 *   4. Ноорог засах алхам бүрийн дараа `compile(ноорог)` = админы харсан эрх (`tidy`); багц нэмэхэд «хассан» ялгаа арилна.
 *   5. Бичих төлөвлөгөө — ЗӨВХӨН зөрсөн хэсэг, дараалал: аккаунт → урсгал → хуваарилалт → эрх; ТЭЗҮ-БОНУ хэвээр.
 *   6. Багцуудын өнгө: компанигүй урсгал улаан · бүхэлдээ хоосон урсгал улаан · зохиогчгүй хуваарь шар · чанарын давхар хянагч шар.
 *   7. Хэн чадах вэ · санал · хүн солих · шинэ нэр · шинээр үүсэх гацаа · албан үүргийн жагсаалт.
 *   8. Сан ЦЭВЭР — дуудлагын үед `window` · `localStorage` · `document` · `fetch` хөндөхгүй; 91 хүний хүснэгт хурдан.
 */
import assert from 'node:assert/strict';

const N = await import('@/lib/erhNew.ts');
const M = await import('@/lib/jobModel.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');
const { PLAIN_CAPS } = await import('@/lib/aclRoleCaps.ts');
const { JOB_DEFS, ALL, compile, coverage, normRights, sameRights } = M;

let passed = 0;
const ok = (name, fn) => { try { fn(); passed += 1; } catch (e) { console.error(`✗ ${name}`); throw e; } };

/* ── ЦЭВЭР: импортын ДАРАА браузерийн глобалд хүрвэл тоолно ── */
const touched = [];
for (const g of ['window', 'localStorage', 'document', 'fetch']) {
  const had = Object.getOwnPropertyDescriptor(globalThis, g);
  Object.defineProperty(globalThis, g, {
    configurable: true,
    get() { touched.push(g); return had && 'value' in had ? had.value : had?.get?.call(globalThis); },
  });
}

const B1 = PKG_GROUPS[0], B2 = PKG_GROUPS[1], B31 = 'Багц-3.1';
assert.equal(B1, 'Багц-1'); assert.equal(B2, 'Багц-2');

/** Жижиг дэлгүүр: гүйцэтгэгч · инженер (+дэд бүтэц) · батлагч · санхүү · танилцагч · админ */
const SNAP = {
  accounts: [
    { user: 'Contractor1', role: 'guitsetgegch', views: compile({ user: '', job: 'guitsetgegch', bagts: [], add: [], remove: [] }).views, docs: true },
    { user: 'eng1', role: 'injener', views: compile({ user: '', job: 'injener', bagts: [], add: [], remove: [] }).views, docs: false },
    { user: 'boss1', role: 'eronhii', views: compile({ user: '', job: 'eronhii', bagts: [], add: [], remove: [] }).views, docs: true },
    { user: 'fin1', role: 'taniltsah', views: ['gdash'], docs: false },
    { user: 'admin1', role: 'super', views: ['gdash'], docs: false },
  ],
  flow: [
    { user: 'contractor1', stage: 'company', bagts: [B1] },
    { user: 'eng1', stage: 'engineer', bagts: [B1, B2] },
    { user: 'boss1', stage: 'director', bagts: [B1] },
  ],
  acl: {
    huvaari: [{ user: 'contractor1', grants: [{ role: 'author', bagts: [B1] }] }, { user: 'boss1', grants: [{ role: 'approver', bagts: [B1, B2] }] }],
    ajil: [{ user: 'contractor1', grants: [{ role: 'editor', bagts: [B1] }] }, { user: 'eng1', grants: [{ role: 'approver', bagts: [B1, B2] }] }],
    obyem: [{ user: 'eng1', grants: [{ role: 'editor', bagts: [B1, B2] }] }, { user: 'boss1', grants: [{ role: 'approver', bagts: [B1] }] }],
    butets: [{ user: 'eng1', grants: [{ role: 'editor', bagts: ['БАГЦ51'] }] }],
  },
  caps: { fin1: ['finEdit', 'ipcApprove', 'plan'], admin1: [] },
};

const rows = N.buildRows(SNAP);
const row = (k) => rows.find((r) => r.key === k);

/* ══════════ 1. Мөр → хүн ══════════ */

ok('buildRows — гүйцэтгэгч ялгаагүй, инженер дэд бүтэц «нэмсэн», санхүү эрх «нэмсэн»', () => {
  assert.deepEqual(rows.map((r) => r.key), ['admin1', 'boss1', 'contractor1', 'eng1', 'fin1']);
  const c = row('contractor1');
  assert.equal(c.person.job, 'guitsetgegch');
  assert.deepEqual(c.person.bagts, [B1]);
  assert.equal(c.diffs, 0, 'гүйцэтгэгч зөрүүгүй (ТЭЗҮ-БОНУ туг тоологдохгүй)');
  assert.equal(c.pkgText, B1);
  const e = row('eng1');
  assert.deepEqual(e.person.bagts, [B1, B2]);
  assert.equal(e.pkgText, `${B1}, ${B2}`);
  assert.equal(e.diffs, 1);
  assert.equal(e.person.add[0].kind, 'role');
  assert.equal(e.person.add[0].sys, 'butets');
  const f = row('fin1');
  assert.equal(f.person.job, 'taniltsah');
  assert.deepEqual(normRights({ caps: SNAP.caps.fin1 }).caps, ['finEdit', 'ipcApprove'], 'хуваарилалтаас гардаг `plan` энгийн эрхэд орохгүй');
  assert.ok(f.diffs >= 2);
  assert.equal(row('admin1').jobLabel, JOB_DEFS.find((d) => d.key === 'super').label);
  for (const r of rows) assert.ok(sameRights(compile(r.person), r.rights), `${r.key}: compile(decompile) = мөр`);
});

ok('pkgShort — «A, B +n» · «Бүх багц» · «—» · дэд бүтцийн түлхүүр нэрээр', () => {
  assert.equal(N.pkgShort([B1, B2, B31, 'Багц-3.2']), `${B1}, ${B2} +2`);
  assert.equal(N.pkgShort([ALL]), 'Бүх багц');
  assert.equal(N.pkgShort([]), '—');
  assert.equal(N.pkgShort(['БАГЦ1ХОЛБОО']), 'Багц 6.1 · Холбоо');
  assert.deepEqual(N.pkgListOf({ job: 'zahiral', bagts: [] }), [ALL]);
  assert.deepEqual(N.pkgListOf({ job: 'sanhuu', bagts: [B1] }), []);
});

/* ══════════ 2. Хайлт · шүүлт ══════════ */

ok('filterRows — нэр · албан үүрэг · багц · эрхийн шошго · шүүлтүүр', () => {
  const keys = (f) => N.filterRows(rows, f).map((r) => r.key);
  assert.deepEqual(keys({ q: 'ENG' }), ['eng1']);
  assert.deepEqual(keys({ q: 'гүйцэтгэгч компани' }), ['contractor1']);
  assert.ok(keys({ q: 'хуваарь батлах' }).includes('boss1') && !keys({ q: 'хуваарь батлах' }).includes('fin1'), 'эрхийн шошгоор');
  assert.deepEqual(keys({ q: 'дэд бүтцийн засвар' }), ['eng1'], 'нэмсэн эрхийн шошгоор');
  assert.deepEqual(keys({ q: 'санхүүгийн бүртгэл' }), ['fin1']);
  assert.deepEqual(keys({ q: B2.toLowerCase() }), ['boss1', 'eng1']);
  assert.deepEqual(keys({ job: 'injener' }), ['eng1']);
  assert.deepEqual(keys({ job: N.NO_JOB }), []);
  assert.deepEqual(keys({ pkg: B2 }), ['boss1', 'eng1']);
  assert.deepEqual(keys({ pkg: B1 }), ['boss1', 'contractor1', 'eng1']);
  assert.deepEqual(keys({ diff: true }), ['boss1', 'eng1', 'fin1'], 'батлагч Багц-2-т хуваарь л батална — нэмсэн ялгаа');
  assert.deepEqual(keys({ problem: true }), rows.filter((r) => r.problems.length).map((r) => r.key));
  assert.deepEqual(keys({ q: 'eng1 хяналтын' }), ['eng1'], 'олон үг — бүгд таарах');
  assert.deepEqual(keys({ q: 'eng1 ipc' }), []);
});

/* ══════════ 3. Бүлэг ══════════ */

ok('jobGroups — 17 албан үүрэг ЯГ нэг удаа, таван бүлэг', () => {
  const g = N.jobGroups();
  assert.deepEqual(g.map((x) => x.title), ['Гүйцэтгэгч', 'Хяналт', 'Удирдлага', 'Мэргэжилтэн', 'Бусад']);
  const all = g.flatMap((x) => x.defs.map((d) => d.key));
  assert.equal(all.length, 17);
  assert.deepEqual([...all].sort(), JOB_DEFS.map((d) => d.key).sort());
  assert.deepEqual(g[4].defs.map((d) => d.key), ['taniltsah']);
});

ok('pkgFamilies — «Багц-3» гэр бүл', () => {
  assert.equal(N.pkgFamily('Багц-3.1'), 'Багц-3');
  assert.equal(N.pkgFamily('Багц-6.10'), 'Багц-6');
  assert.equal(N.pkgFamily('Багц-10'), 'Багц-10');
  const f = N.pkgFamilies(PKG_GROUPS);
  assert.deepEqual(f.find((x) => x.family === 'Багц-3').members, ['Багц-3.1', 'Багц-3.2', 'Багц-3.3']);
  assert.ok(!f.some((x) => x.family === 'Багц-1'));
  const person = N.pkgOptions('person').map((o) => o.key);
  assert.ok(person.includes('БАГЦ1ХОЛБОО') && !person.includes('БАГЦ51'), 'хосгүй дэд бүтцийн багц л түлхүүрээрээ');
  assert.equal(N.pkgOptions('habea').length, 7);
});

/* ══════════ 4. Ноорог засах ══════════ */

ok('Ноорог — албан үүрэг · багц · эрх нэмэх/хасах; `compile` үргэлж харсантай ижил', () => {
  const e = row('eng1').person;
  /* багц хасах → эрх дагана */
  let p = N.setBagts(e, [B1]);
  assert.deepEqual(compile(p).flow.bagts, [B1]);
  assert.deepEqual(compile(p).acl.butets, [{ role: 'editor', bagts: ['БАГЦ51'] }], '«нэмсэн» дэд бүтэц хэвээр');
  /* албан үүргийн эрх хасах → «хассан» ялгаа */
  const items = N.baseItems(p);
  assert.deepEqual(items.map((i) => i.id).filter((x) => !x.startsWith('view:')), ['flow', 'acl:obyem:editor', 'acl:ajil:approver']);
  p = N.dropBase(p, items.find((i) => i.id === 'acl:obyem:editor'));
  assert.equal(compile(p).acl.obyem, undefined);
  assert.equal(p.remove.filter(N.shown).length, 1, 'ТЭЗҮ-БОНУ ялгаа тоологдохгүй');
  assert.ok(!N.baseItems(p).some((i) => i.id === 'acl:obyem:editor'), 'хассан эрх «албан үүргээс» жагсаалтад үгүй');
  /* «хассан» чипийг хасвал буцна */
  p = N.dropDiff(p, 'remove', p.remove.find((d) => d.kind === 'role'));
  assert.deepEqual(compile(p).acl.obyem, [{ role: 'editor', bagts: [B1] }]);
  /* багцаас хасаад дахин нэмэхэд — «хассан» ялгаа арилж, эрх БҮРЭН */
  let q = N.dropBase(N.setBagts(e, [B1, B2]), N.baseItems(N.setBagts(e, [B1, B2])).find((i) => i.id === 'flow'));
  assert.equal(compile(q).flow, null);
  q = N.setBagts(q, [B1, B2, B31]);
  assert.deepEqual(compile(q).flow.bagts, [B31], '«хассан» шатны ялгаа шинэ багцад хамаарахгүй');
  /* эрх нэмэх */
  let r = N.addRight(e, { kind: 'cap', cap: 'zovshoorol' });
  assert.ok(compile(r).caps.includes('zovshoorol'));
  r = N.addRight(r, { kind: 'role', sys: 'huvaari', role: 'approver', bagts: [B2] });
  assert.deepEqual(compile(r).acl.huvaari, [{ role: 'approver', bagts: [B2] }]);
  r = N.dropDiff(r, 'add', r.add.find((d) => d.kind === 'cap'));
  assert.ok(!compile(r).caps.includes('zovshoorol'));
  /* албан үүрэг солих: «нэмсэн» хэвээр, багц хэвээр (багцын үүрэг) */
  const s = N.setJob(e, 'menejer');
  assert.equal(compile(s).flow.stage, 'manager');
  assert.deepEqual(compile(s).flow.bagts, [B1, B2]);
  assert.deepEqual(compile(s).acl.butets, [{ role: 'editor', bagts: ['БАГЦ51'] }]);
  /* урсгалын бус үүрэгтэй шат барьдаг хүн → шаттай үүрэг: багц нь одоогийнхоос, «нэмсэн» шат арилна (нэг шат) */
  const tani = M.decompile('t1', normRights({ role: 'taniltsah', flow: { stage: 'engineer', bagts: [B2] } }));
  assert.equal(tani.add.filter((d) => d.kind === 'stage').length, 1);
  const mgr = N.setJob(tani, 'menejer');
  assert.deepEqual(mgr.bagts, [B2], 'багц одоо барьж буйгаас');
  assert.deepEqual(compile(mgr).flow, { stage: 'manager', bagts: [B2], viewOnly: false });
  assert.deepEqual(N.blockers(mgr), []);
  assert.deepEqual(N.touchedPkgs(normRights({ acl: { huvaari: [{ role: 'author', bagts: ['*'] }] } })), [ALL]);
  const t = N.setJob(e, 'sanhuu');
  assert.deepEqual(t.bagts, []);
  assert.deepEqual(compile(t).caps, ['finEdit', 'ipcCreate', 'ipcApprove', 'cfSwitch', 'ttbSwitch'].filter((c) => compile(t).caps.includes(c)));
  assert.equal(compile(t).flow, null);
});

ok('viewChoices — урсгалтай хүнд «Хяналтын хугацаа» сонголтод алга; finRow нэмэх сонголтод алга', () => {
  const e = row('eng1').rights;
  assert.ok(N.autoHugatsaa(e));
  assert.ok(!N.viewChoices(e).includes('hyanaltHugatsaa'));
  assert.ok(N.viewChoices(row('fin1').rights).includes('hyanaltHugatsaa'));
  assert.ok(!N.viewChoices(e).includes('guitsetgel'));
  assert.ok(!N.ADDABLE_CAPS.includes('finRow'));
  assert.equal(N.ADDABLE_CAPS.length, PLAIN_CAPS.length - 1);
  assert.equal(N.roleChoices().length, 2 + 2 + 2 + 6 + 1 + 1);
});

/* ══════════ 5. Бичих төлөвлөгөө ══════════ */

ok('writePlan — зөрсөн хэсэг л, аюулгүй дараалал; ТЭЗҮ-БОНУ хэвээр', () => {
  const c = row('contractor1');
  assert.deepEqual(N.writePlan(N.wantOf(c.person, c.rights, false), c.rights, false), [], 'өөрчлөлтгүй — бичихгүй');
  /* ажил өөрчлөхөд docs (true) хадгалагдана */
  const moved = N.setJob(c.person, 'injener');
  const want = N.wantOf(moved, c.rights, false);
  assert.equal(want.docs, true, 'одоогийн ТЭЗҮ-БОНУ туг');
  const steps = N.writePlan(want, c.rights, false);
  assert.deepEqual(steps.map((x) => x.kind + (x.sys ? `:${x.sys}` : '')), ['account', 'flow', 'huvaari', 'obyem', 'ajil'].map((k) => (['account', 'flow'].includes(k) ? k : `acl:${k}`)));
  assert.equal(steps[0].role, 'injener');
  assert.deepEqual(steps[1].flow, { stage: 'engineer', bagts: [B1], viewOnly: false });
  assert.deepEqual(steps.find((x) => x.sys === 'huvaari').grants, [], 'хуваарийн зохиогч хасагдана');
  assert.ok(!N.confirmList(want, c.rights).some((ch) => ch.what.kind === 'docs'), 'баталгаажуулалтад ТЭЗҮ-БОНУ алга');
  /* санхүү: эрх л */
  const f = row('fin1');
  const fp = N.addRight(f.person, { kind: 'cap', cap: 'ipcCreate' });
  const fs = N.writePlan(N.wantOf(fp, f.rights, false), f.rights, false);
  assert.deepEqual(fs, [{ kind: 'caps', add: ['ipcCreate'], remove: [] }]);
  /* шинэ аккаунт — аккаунтын мөр ҮРГЭЛЖ эхэнд */
  const np = N.setBagts(N.setJob(N.newPerson('NewGuy'), 'guitsetgegch'), [B31]);
  const empty = normRights({});
  const ns = N.writePlan(N.wantOf(np, empty, true), empty, true);
  assert.deepEqual(ns.map((x) => x.kind), ['account', 'flow', 'acl', 'acl']);
  assert.equal(np.user, 'newguy');
  assert.deepEqual(ns[1].flow, { stage: 'company', bagts: [B31], viewOnly: false });
  assert.deepEqual(ns.slice(2).map((x) => [x.sys, x.grants]), [['huvaari', [{ role: 'author', bagts: [B31] }]], ['ajil', [{ role: 'editor', bagts: [B31] }]]]);
  assert.ok(N.stepLabel(ns[0]).length && N.stepLabel(ns[2]) === 'Хуваарь');
  /* Ерөнхий захиралд шат — хаах алдаа */
  const z = N.addRight(N.newPerson('z'), { kind: 'stage', stage: 'engineer', bagts: [B1] });
  assert.ok(N.blockers(N.setJob(z, 'zahiral')).some((x) => x.code === 'zahiralStage'), 'шат «нэмсэн» хэвээр — хадгалахыг хаана');
  assert.deepEqual(N.blockers(z), []);
});

/* ══════════ 6. Багцуудын өнгө ══════════ */

ok('pkgRows — компанигүй урсгал улаан · хоосон урсгал улаан · дутуу шар · давхар хянагч шар', () => {
  const cov = coverage(N.holdersOf(rows));
  const pr = N.pkgRows(cov);
  assert.equal(pr.length, PKG_GROUPS.length);
  const b1 = pr.find((r) => r.bagts === B1), b2 = pr.find((r) => r.bagts === B2);
  const slot = (r, id) => r.slots.find((s) => s.id === id);
  assert.equal(slot(b1, 'flow:company').tone, null);
  assert.deepEqual(slot(b1, 'flow:company').holders, ['contractor1']);
  assert.equal(slot(b1, 'flow:manager').tone, 'bad', 'хэсэгчлэн хоосон урсгал — ажил зогсоно');
  assert.equal(slot(b2, 'flow:company').tone, 'bad', 'компанигүй — улаан');
  assert.equal(slot(b2, 'huvaari:author').tone, 'warn', 'батлагчтай, зохиогчгүй — дутуу');
  assert.equal(slot(b2, 'huvaari:approver').tone, null);
  assert.equal(slot(b1, 'butets:editor').tone, null);
  const b10 = pr.find((r) => r.bagts === 'Багц-10');
  assert.equal(b10.tone, 'bad', 'урсгал бүхэлдээ хоосон — улаан (шийдвэр)');
  assert.equal(slot(b10, 'flow:company').tone, 'bad');
  assert.equal(slot(b10, 'flow:engineer').tone, 'warn');
  assert.equal(b10.issues.filter((i) => /урсгал/.test(i.text)).length, 1, 'хоосон урсгал НЭГ мөрөөр');
  assert.equal(slot(b10, 'huvaari:author').tone, null, 'хэрэглэгдээгүй систем — өнгөгүй');
  const s = N.covSummary(pr);
  assert.equal(s.bad + s.warn, pr.filter((r) => r.tone).length);
  /* давхар чанарын хянагч */
  const dup = coverage([{ user: 'q', rights: normRights({ acl: { chanar: [{ role: 'tuh', bagts: [B1] }, { role: 'tug', bagts: [B1] }] } }) },
    { user: 'w', rights: normRights({ acl: { chanar: [{ role: 'author', bagts: [B1] }] } }) }], JOB_DEFS, [B1]);
  const d1 = N.pkgRows(dup)[0];
  assert.ok(d1.issues.some((i) => i.tone === 'warn' && i.users.includes('q') && /давхар/.test(i.text)), 'нэг хүн хоёр хянагч үүрэгтэй — шар');
  assert.ok(['warn', 'bad'].includes(d1.slots.find((x) => x.id === 'chanar:tuh').tone));
  /* өөрийгөө батлах — шар зөрчил */
  const self = coverage([{ user: 'q', rights: normRights({ acl: { obyem: [{ role: 'editor', bagts: [B1] }, { role: 'approver', bagts: [B1] }] } }) }], JOB_DEFS, [B1]);
  const s1 = N.pkgRows(self)[0];
  assert.ok(s1.issues.some((i) => i.tone === 'warn' && i.users.includes('q')));
  assert.equal(s1.slots.find((x) => x.id === 'obyem:approver').tone, 'bad', 'өөрөөс өөр батлагчгүй — гацаа');
});

/* ══════════ 7. Хайлт · санал · солих · шинэ нэр · гацаа · жагсаалт ══════════ */

ok('whoCanRows — «Багц-2»-ийн хуваарь хэн батлах вэ', () => {
  assert.deepEqual(N.whoCanRows({ sys: 'huvaari', role: 'approver' }, B2, rows), ['boss1']);
  assert.deepEqual(N.whoCanRows({ stage: 'engineer' }, B2, rows), ['eng1']);
  assert.deepEqual(N.whoCanRows({ cap: 'finEdit' }, null, rows), ['fin1']);
  const ch = N.whoChoices();
  assert.equal(ch.filter((c) => c.id.startsWith('stage:')).length, STAGE_ORDER.length);
  assert.ok(ch.some((c) => c.id === 'role:huvaari:approver'));
  assert.ok(!ch.some((c) => c.id === 'cap:finRow'));
});

ok('suggestion — инженерийн эрхтэй танилцагчид «Хяналтын инженер»; админд хэзээ ч үгүй', () => {
  const inj = compile({ user: 'x', job: 'injener', bagts: [B1], add: [], remove: [] });
  const p = M.decompile('x', { ...inj, role: 'taniltsah' });
  const s = N.suggestion(p);
  assert.equal(s.def.key, 'injener');
  assert.ok(s.saves > 0);
  assert.equal(s.person.user, 'x');
  assert.ok(sameRights({ ...compile(s.person), role: 'taniltsah' }, { ...inj, role: 'taniltsah' }), 'санал эрхийг хөндөхгүй');
  assert.equal(N.suggestion(M.decompile('a', { ...inj, role: 'super' })), null);
  assert.equal(N.suggestion(row('contractor1').person), null, 'аль хэдийн тохирсон');
});

ok('copyPreview — ижил албан үүрэг · багц · ялгаа; «Нэмнэ / Хасна» жагсаалт', () => {
  const { person, changes } = N.copyPreview(row('eng1').person, 'fin1', row('fin1').rights);
  assert.equal(person.user, 'fin1');
  assert.equal(person.job, 'injener');
  assert.ok(changes.some((c) => c.op === 'add' && c.what.kind === 'stage'));
  assert.ok(changes.some((c) => c.op === 'remove' && c.what.kind === 'cap' && c.what.cap === 'finEdit'));
  assert.ok(changes.every((c) => /^(Нэмнэ|Хасна) — /.test(c.text)));
  const fresh = N.copyPreview(row('eng1').person, 'Brand.New', null);
  assert.ok(fresh.changes.length > 3 && fresh.changes.every((c) => c.op === 'add'));
});

ok('newNameError — бүтэц · давхардал · устгагдсан', () => {
  assert.equal(N.newNameError('', [], []), null);
  assert.match(N.newNameError('ab', [], []), /бүтцэд тохирохгүй/);
  assert.match(N.newNameError('ENG1', ['eng1'], []), /аль хэдийн/);
  assert.match(N.newNameError('old_one', [], ['old_one']), /устгагдсан/);
  assert.equal(N.newNameError('new.user_selbe', ['eng1'], []), null);
});

ok('newStuck — цорын ганц гүйцэтгэгчийг хасвал «ажил зогсоно» шинээр үүснэ', () => {
  const gone = N.newStuck(rows, 'contractor1', null);
  assert.ok(gone.some((t) => t.includes(B1) && /гүйцэтгэгч компани/.test(t)), gone.join(' | '));
  assert.deepEqual(N.newStuck(rows, 'contractor1', row('contractor1').rights), [], 'өөрчлөлтгүй — шинэ гацаа үгүй');
});

ok('jobInfos — шошгоор, хүний тоо', () => {
  const info = N.jobInfos(rows);
  assert.equal(info.length, 17);
  const g = info.find((i) => i.def.key === 'guitsetgegch');
  assert.equal(g.count, 1);
  assert.equal(g.stage, 'Гүйцэтгэгч компани');
  assert.deepEqual(g.roles, ['Хуваарь — Зохиогч', 'Нэмэлт ажил — Мөр нэмэгч']);
  const s = info.find((i) => i.def.key === 'sanhuu');
  assert.ok(s.caps.includes('Санхүүгийн бүртгэл — утга засах'));
  assert.ok(s.views.every((v) => !/^[a-z]/.test(v)), 'харагдац шошгоор');
});

/* ══════════ 8. Хурд · цэвэр ══════════ */

ok('91 хүний хүснэгт — хурдан', () => {
  const big = { accounts: [], flow: [], acl: { huvaari: [], ajil: [], obyem: [], chanar: [] }, caps: {} };
  for (let i = 0; i < 91; i += 1) {
    const u = `u${i}`;
    const pk = [PKG_GROUPS[i % 20], PKG_GROUPS[(i * 7) % 30]];
    big.accounts.push({ user: u, role: ['guitsetgegch', 'injener', 'menejer', 'taniltsah', 'eronhii'][i % 5], views: ['gdash'], docs: false });
    if (i % 5 !== 3) big.flow.push({ user: u, stage: ['company', 'engineer', 'manager', 'company', 'director'][i % 5], bagts: pk });
    if (i % 5 === 0) big.acl.huvaari.push({ user: u, grants: [{ role: 'author', bagts: pk }] });
    if (i % 5 === 1) big.acl.obyem.push({ user: u, grants: [{ role: 'editor', bagts: pk }] });
    if (i % 7 === 0) big.acl.chanar.push({ user: u, grants: [{ role: 'tuh', bagts: [PKG_GROUPS[i % 9]] }] });
    big.caps[u] = i % 11 === 0 ? ['zovshoorol'] : [];
  }
  const t0 = Date.now();
  const r = N.buildRows(big);
  const pr = N.pkgRows(coverage(N.holdersOf(r)));
  const ms = Date.now() - t0;
  assert.equal(r.length, 91);
  assert.equal(pr.length, PKG_GROUPS.length);
  assert.ok(ms < 4000, `хэт удаан: ${ms} мс`);
  console.log(`   91 хүн + ${pr.length} багц: ${ms} мс`);
});

assert.deepEqual([...new Set(touched)], [], `сан браузерийн глобалд хүрэв: ${touched.join(', ')}`);

console.log(`✅ erhNew: ${passed} шалгалт`);
