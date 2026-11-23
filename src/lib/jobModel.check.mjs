/**
 * АЛБАН ҮҮРГИЙН ЗАГВАРЫН ШАЛГУУР (2026-11-23) — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/jobModel.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. `JOB_DEFS` — 17 албан үүрэг; одоо байгаа үүрэг өнөөдрийн загвартай ЯГ ижил; `caps` зөвхөн энгийн эрх.
 *   2. `mergeDefs` — хадгалсан өөрчлөлт, танигдахгүй түлхүүр хаягдана; тодорхойлолт АМЬД.
 *   3. `compile` / `decompile` — `compile(decompile(x)) = x` ДУРЫН бодит мөрөнд (үрээр тогтоосон 1500 санамсаргүй тохиолдол).
 *   4. Багцын гурван нэрийн орон зай: урсгал/хуваарь/… — `PKG_GROUPS`; дэд бүтэц — `bagtsKey` хос; ХАБЭА — Багц 1 … 4.2.
 *   5. Өнөөдрийн бодит хэлбэрүүд: гүйцэтгэгч · дэд бүтэц засдаг инженер · олон багцын ахлах инженер · ХАБЭА-тэй танилцагч ·
 *      шат барьдаг админ.
 *   6. `validate` · `coverage` · `whoCan` · `canDo` · `rightsDiff` · `replacePerson` · `suggestJob`.
 *   7. Сан ЦЭВЭР — дуудлагын үед `window` · `localStorage` уншихгүй.
 */
import assert from 'node:assert/strict';

const M = await import('@/lib/jobModel.ts');
const {
  JOB_DEFS, CATALOG, ALL, findDef, mergeDefs, cleanOverride, normRights, sameRights, compile, decompile, personWith,
  jobFit, suggestJob, rightsDiff, canDo, validate, coverage, whoCan, replacePerson, personCost, stageNo,
} = M;
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
const { HABEA_PKGS } = await import('@/lib/habeaAcl.ts');
const { VIEWS, bagtsKey, ROLE_ACCESS } = await import('@/lib/services.ts');
const { WORKFLOW_VIEWS, CAPS } = await import('@/lib/caps.ts');
const { PLAIN_CAPS, ROLE_CAPS, SCOPED_SYSTEMS, isDerivedCap } = await import('@/lib/aclRoleCaps.ts');
const { STAGE_ORDER, REVIEW_STAGES } = await import('@/lib/hyanalt.ts');
const { _defaultTpl, hvScopeOf, typeLabel, TYPE_ORDER } = await import('@/lib/roleTypes.ts');
const { capLabel } = await import('@/modules/capText.ts');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; void name; };

/* ── 7. ЦЭВЭР: импортын ДАРАА браузерийн глобалд хүрвэл тоолно ── */
const touched = [];
for (const g of ['window', 'localStorage', 'document', 'fetch']) {
  const had = Object.getOwnPropertyDescriptor(globalThis, g);
  Object.defineProperty(globalThis, g, {
    configurable: true,
    get() { touched.push(g); return had && 'value' in had ? had.value : had?.get?.call(globalThis); },
  });
}

/* ══════════════════════ Туслах ══════════════════════ */

const keyOf = (r) => JSON.stringify(normRights(r));
const tplViews = (role) => _defaultTpl(role).on.filter((x) => x.startsWith('view:')).map((x) => x.slice(5))
  .filter((v) => !WORKFLOW_VIEWS.includes(v));
const sorted = (a) => [...a].sort();

/* ══════════════════════ 1. JOB_DEFS ══════════════════════ */

ok('JOB_DEFS бүрэлдэхүүн', () => {
  const want = [
    ['guitsetgegch', 'company', ['huvaari.author', 'ajil.editor'], [], 'packages'],
    ['guitshabea', null, ['habea.viewer'], [], 'packages'],
    ['injener', 'engineer', ['ajil.approver', 'obyem.editor'], [], 'packages'],
    ['menejer', 'manager', [], [], 'packages'],
    ['tolovloltiin', 'planner', [], [], 'packages'],
    ['eronhii', 'director', ['huvaari.approver', 'obyem.approver'], [], 'packages'],
    ['heltsiin', 'head', [], [], 'packages'],
    ['gazriin', 'chief', [], [], 'packages'],
    ['zahiral', null, [], [], 'all'],
    ['habea', null, [], ['habeaData'], 'none'],
    ['butets', null, ['butets.editor'], [], 'packages'],
    ['zurag', null, [], ['zuragEdit'], 'none'],
    ['gazar', null, [], ['gazar'], 'none'],
    ['sanhuu', null, [], ['finEdit', 'cfSwitch', 'ipcCreate', 'ipcApprove'], 'none'],
    ['chanar', null, [], [], 'none'],
    ['taniltsah', null, [], [], 'none'],
    ['super', null, [], [], 'none'],
  ];
  assert.equal(JOB_DEFS.length, 17);
  assert.deepEqual(JOB_DEFS.map((d) => d.key), want.map((w) => w[0]), 'дараалал');
  for (const [key, stage, roles, caps, scope] of want) {
    const d = findDef(JOB_DEFS, key);
    assert.equal(d.stage, stage, `${key}.stage`);
    assert.deepEqual(d.pkgRoles.map((p) => `${p.sys}.${p.role}`), roles, `${key}.pkgRoles`);
    assert.deepEqual(d.caps, caps, `${key}.caps`);
    assert.equal(d.scope, scope, `${key}.scope`);
    assert.equal(d.label, typeLabel(key), `${key}.label`);
    assert.equal(d.admin === true, key === 'super', `${key}.admin`);
    for (const c of d.caps) assert.ok(PLAIN_CAPS.includes(c) && !isDerivedCap(c), `${key}: ${c} энгийн эрх биш`);
    for (const v of d.views) assert.ok(!WORKFLOW_VIEWS.includes(v), `${key}: урсгалын харагдац ${v}`);
    for (const p of d.pkgRoles) assert.ok(Object.hasOwn(ROLE_CAPS[p.sys], p.role), `${key}: ${p.sys}.${p.role}`);
  }
  /* Хяналтын инженерт дэд бүтэц засах эрх АНХДАГЧААР алга */
  assert.ok(!findDef(JOB_DEFS, 'injener').pkgRoles.some((p) => p.sys === 'butets'));
  /* Ерөнхий захирал — шатгүй, зөвхөн харна; админ — ажлын эрхгүй */
  assert.equal(findDef(JOB_DEFS, 'zahiral').stage, null);
  const sup = findDef(JOB_DEFS, 'super');
  assert.ok(!sup.stage && !sup.pkgRoles.length && !sup.caps.length);
});

ok('Одоо байгаа үүрэг — өнөөдрийн загвартай ЯГ ижил', () => {
  for (const key of TYPE_ORDER) {
    const d = findDef(JOB_DEFS, key);
    assert.ok(d, `${key}: тодорхойлолт алга`);
    const t = _defaultTpl(key);
    assert.deepEqual(sorted(d.views), sorted(tplViews(key)), `${key}.views`);
    assert.equal(d.docs, t.on.includes('docs'), `${key}.docs`);
    assert.equal(d.huvaariView, hvScopeOf(t.on), `${key}.huvaariView`);
    assert.equal(d.home, t.home, `${key}.home`);
  }
  /* Шинэ таван үүрэг — `ROLE_ACCESS`-ийн нарийн суурь, «Хуваарь харах» = Үгүй (ажиллах үеийн `typeHuvaariScope`-тай ижил) */
  for (const key of ['guitshabea', 'habea', 'butets', 'zurag', 'sanhuu']) {
    const d = findDef(JOB_DEFS, key);
    assert.ok(!TYPE_ORDER.includes(key), `${key}: TYPE_ORDER-т орох ёсгүй`);
    assert.deepEqual(sorted(d.views), sorted(ROLE_ACCESS[key].views.filter((v) => !WORKFLOW_VIEWS.includes(v))), `${key}.views`);
    assert.equal(d.home, ROLE_ACCESS[key].home);
    assert.equal(d.huvaariView, 'none', `${key}.huvaariView`);
  }
});

/* ══════════════════════ 2. mergeDefs ══════════════════════ */

ok('mergeDefs — өөрчлөлт, танигдахгүй түлхүүр хаягдана, суурь хөндөгдөхгүй', () => {
  const before = JSON.stringify(JOB_DEFS);
  const merged = mergeDefs(JOB_DEFS, {
    injener: {
      label: '  Хяналтын инженер (шинэ)  ',
      pkgRoles: [{ sys: 'ajil', role: 'approver' }, { sys: 'butets', role: 'editor' }, { sys: 'butets', role: 'editor' },
        { sys: 'xxx', role: 'editor' }, { sys: 'obyem', role: 'boss' }],
      caps: ['zovshoorol', 'plan', 'nope'],
      views: ['gdash', 'guitsetgel', 'nope'],
      foo: 1,
    },
    zahiral: { stage: 'chief' },
    super: { stage: 'director', caps: ['finEdit'], pkgRoles: [{ sys: 'huvaari', role: 'approver' }], views: ['gdash'] },
    nobody: { stage: 'engineer' },
    menejer: 'эвдэрсэн',
    heltsiin: { stage: 'nope', scope: 'bad', home: 'nope', huvaariView: 'x' },
  });
  assert.equal(merged.length, JOB_DEFS.length, 'танигдахгүй түлхүүр нэмэгдэхгүй');
  const inj = findDef(merged, 'injener');
  assert.equal(inj.label, 'Хяналтын инженер (шинэ)');
  assert.deepEqual(inj.pkgRoles, [{ sys: 'ajil', role: 'approver' }, { sys: 'butets', role: 'editor' }]);
  assert.deepEqual(inj.caps, ['zovshoorol'], 'хуваарилалтаас гардаг `plan` · танигдахгүй эрх хаягдана');
  assert.deepEqual(inj.views, ['gdash'], 'урсгалын харагдац · танигдахгүй хаягдана');
  assert.ok(!('foo' in inj));
  assert.equal(findDef(merged, 'zahiral').stage, null, 'Ерөнхий захиралд шат тавигдахгүй');
  const sup = findDef(merged, 'super');
  assert.ok(!sup.stage && !sup.caps.length && !sup.pkgRoles.length, 'админд ажлын эрх тавигдахгүй');
  assert.deepEqual(sup.views, ['gdash'], 'админы харагдац солигдоно');
  assert.deepEqual(findDef(merged, 'menejer'), { ...findDef(JOB_DEFS, 'menejer') });
  const hel = findDef(merged, 'heltsiin');
  assert.equal(hel.stage, 'head'); assert.equal(hel.scope, 'packages'); assert.equal(hel.home, 'gdash');
  assert.equal(JSON.stringify(JOB_DEFS), before, 'JOB_DEFS хөндөгдсөнгүй');
  merged[0].views.push('tuh');
  assert.equal(JSON.stringify(JOB_DEFS), before, 'хуулбарын жагсаалт суурьтай хуваалцагдахгүй');
  assert.deepEqual(mergeDefs(JOB_DEFS, null).map((d) => d.key), JOB_DEFS.map((d) => d.key));
  assert.deepEqual(mergeDefs(JOB_DEFS, [1, 2]).map((d) => d.label), JOB_DEFS.map((d) => d.label));
  assert.deepEqual(cleanOverride(findDef(JOB_DEFS, 'gazar'), { caps: ['butets', 'gazar'] }), { caps: ['gazar'] });
});

ok('Тодорхойлолт АМЬД — нэг өөрчлөлт тэр албан үүрэгтэй бүх хүнд', () => {
  const people = ['a', 'b'].map((u) => ({ user: u, job: 'injener', bagts: ['Багц-1'], add: [], remove: [] }));
  const merged = mergeDefs(JOB_DEFS, { injener: { pkgRoles: [{ sys: 'ajil', role: 'approver' }, { sys: 'obyem', role: 'editor' }, { sys: 'butets', role: 'editor' }] } });
  for (const p of people) {
    assert.equal(compile(p).acl.butets, undefined);
    assert.deepEqual(compile(p, merged).acl.butets, undefined, 'Багц-1-д дэд бүтцийн хос багц алга');
    const q = { ...p, bagts: ['Багц-5.1'] };
    assert.deepEqual(compile(q, merged).acl.butets, [{ role: 'editor', bagts: ['БАГЦ51'] }]);
  }
});

/* ══════════════════════ 4. Багцын нэрийн орон зай ══════════════════════ */

ok('Каталог — ХАБЭА-гийн багц `habeaAcl.HABEA_PKGS`-тэй ижил, дэд бүтэц `BUTETS_PACKS`', () => {
  assert.deepEqual([...CATALOG.habea], [...HABEA_PKGS]);
  assert.deepEqual(CATALOG.butets.map((p) => p.key), BUTETS_PACKS.map((p) => p.key));
  assert.deepEqual([...CATALOG.groups], [...PKG_GROUPS]);
});

ok('Дэд бүтцийн хос — `huvaariView.ownPkgScope`-ийн дүрэм (`bagtsKey(g)` = түлхүүр)', () => {
  const def = 'butets';
  for (const g of PKG_GROUPS) {
    const r = compile({ user: 'x', job: def, bagts: [g], add: [], remove: [] });
    const pack = BUTETS_PACKS.find((p) => p.key === bagtsKey(g));
    assert.deepEqual(r.acl.butets ?? [], pack ? [{ role: 'editor', bagts: [pack.key] }] : [], g);
  }
  /* хосгүй дэд бүтцийн багц жагсаалтад түлхүүрээрээ орж, ЗӨВХӨН дэд бүтцэд үйлчилнэ */
  const lone = BUTETS_PACKS.filter((p) => !PKG_GROUPS.some((g) => bagtsKey(g) === p.key)).map((p) => p.key);
  assert.ok(lone.includes('БАГЦ1ХОЛБОО'));
  const c = compile({ user: 'x', job: 'guitsetgegch', bagts: ['БАГЦ1ХОЛБОО', 'Багц-1'], add: [], remove: [] });
  assert.deepEqual(c.flow.bagts, ['Багц-1'], 'урсгалд хүчингүй багц тооцогдохгүй');
  const b = compile({ user: 'x', job: 'butets', bagts: ['БАГЦ1ХОЛБОО', 'Багц-5.1', 'Багц-1'], add: [], remove: [] });
  assert.deepEqual(b.acl.butets, [{ role: 'editor', bagts: ['БАГЦ51', 'БАГЦ1ХОЛБОО'].sort((x, y) => BUTETS_PACKS.findIndex((p) => p.key === x) - BUTETS_PACKS.findIndex((p) => p.key === y)) }]);
  /* ХАБЭА — Багц 5.1-ээс хойш хүчингүй */
  const h = compile({ user: 'x', job: 'guitshabea', bagts: ['Багц-1', 'Багц-5.1', 'Багц-4.2'], add: [], remove: [] });
  assert.deepEqual(h.acl.habea, [{ role: 'viewer', bagts: ['Багц-1', 'Багц-4.2'] }]);
  /* бичлэгийн зөрүү нэг болно */
  const v = compile({ user: 'x', job: 'injener', bagts: ['Багц 5.1', 'багц-5.1', ' Багц-5.1 '], add: [], remove: [] });
  assert.deepEqual(v.flow.bagts, ['Багц-5.1']);
  assert.deepEqual(normRights({ acl: { butets: [{ role: 'editor', bagts: ['Багц-5.1'] }] } }).acl.butets[0].bagts, ['БАГЦ51']);
  /* «бүх багц» бүх системд `*` */
  const all = compile({ user: 'x', job: 'guitsetgegch', bagts: ['Багц-1', '*'], add: [], remove: [] });
  assert.deepEqual(all.flow.bagts, [ALL]);
  assert.deepEqual(all.acl.huvaari, [{ role: 'author', bagts: [ALL] }]);
});

/* ══════════════════════ 5. Өнөөдрийн бодит хэлбэрүүд ══════════════════════ */

const CONTRACTOR = {
  role: 'guitsetgegch',
  views: [...tplViews('guitsetgegch'), 'guitsetgel'],
  docs: false,
  flow: { stage: 'company', bagts: ['Багц-1'] },
  acl: { huvaari: [{ role: 'author', bagts: ['Багц-1'] }], ajil: [{ role: 'editor', bagts: ['Багц-1'] }] },
  caps: ['plan', 'addRow'],
};
const ENGINEER = {
  role: 'injener',
  views: [...tplViews('injener'), 'guitsetgel'],
  docs: true,
  flow: { stage: 'engineer', bagts: ['Багц-5.1'] },
  acl: {
    ajil: [{ role: 'approver', bagts: ['Багц-5.1'] }], obyem: [{ role: 'editor', bagts: ['Багц-5.1'] }],
    butets: [{ role: 'editor', bagts: ['БАГЦ51'] }],
  },
  caps: ['ajilApprove', 'obyemEdit', 'butets'],
};
const MANAGER = {
  role: 'menejer',
  views: [...tplViews('menejer'), 'guitsetgel'],
  docs: true,
  flow: { stage: 'manager', bagts: ['Багц-3.1', 'Багц-3.2', 'Багц-3.3', 'Багц-6.1'] },
};
const TANILTSAH_HABEA = { role: 'taniltsah', views: tplViews('taniltsah'), docs: true, caps: ['habeaData'] };
const ADMIN = {
  role: 'super', views: ['gdash'], docs: false,
  flow: { stage: 'director', bagts: ['Багц-2'] },
  acl: { huvaari: [{ role: 'approver', bagts: ['Багц-2'] }] },
  caps: ['finEdit', 'planApprove'],
};

ok('Гүйцэтгэгч компани — ялгаагүй, 8 харагдацаас урсгалынх хасагдана', () => {
  assert.equal(CONTRACTOR.views.length, 8);
  const p = decompile('Contractor_1', CONTRACTOR);
  assert.deepEqual(p, { user: 'contractor_1', job: 'guitsetgegch', bagts: ['Багц-1'], add: [], remove: [] });
  assert.ok(sameRights(compile(p), CONTRACTOR));
  const r = compile(p);
  assert.equal(r.views.length, 7, '«Гүйцэтгэл» ажиллах үед томилгооноос нээгдэнэ (`permissions.workflowViewsOf`)');
  assert.deepEqual(r.caps, [], 'хуваарилалтаас гардаг эрхийг хуваарилалт өөрөө бичнэ');
  assert.equal(suggestJob(CONTRACTOR).key, 'guitsetgegch');
  assert.deepEqual(validate(p), []);
});

ok('Хяналтын инженер + дэд бүтэц засах — «нэмсэн» нэг ялгаа', () => {
  const p = decompile('eng', ENGINEER);
  assert.equal(p.job, 'injener');
  assert.deepEqual(p.bagts, ['Багц-5.1']);
  assert.deepEqual(p.remove, []);
  assert.deepEqual(p.add, [{ kind: 'role', sys: 'butets', role: 'editor', bagts: ['БАГЦ51'] }]);
  assert.ok(sameRights(compile(p), ENGINEER));
  assert.equal(suggestJob(ENGINEER).key, 'injener');
  assert.deepEqual(validate(p), []);
});

ok('Багцын ахлах инженер — олон багц', () => {
  const p = decompile('mgr', MANAGER);
  assert.deepEqual(p, { user: 'mgr', job: 'menejer', bagts: ['Багц-3.1', 'Багц-3.2', 'Багц-3.3', 'Багц-6.1'], add: [], remove: [] });
  assert.ok(sameRights(compile(p), MANAGER));
});

ok('«Мэдээлэл танилцах» + ХАБЭА-ийн бүртгэл → «ХАБЭА-ийн ажилтан» санал болгоно, үүрэг нь ХЭВЭЭР', () => {
  const p = decompile('t', TANILTSAH_HABEA);
  assert.equal(p.job, 'taniltsah', 'decompile чимээгүй ангилал солихгүй');
  assert.deepEqual(p.add, [{ kind: 'cap', cap: 'habeaData' }]);
  assert.equal(suggestJob(TANILTSAH_HABEA).key, 'habea');
  assert.equal(suggestJob(TANILTSAH_HABEA).label, 'ХАБЭА-ийн ажилтан');
  const fit = jobFit(TANILTSAH_HABEA);
  assert.equal(fit[0].work, 0);
  assert.ok(sameRights(compile(fit[0].person), { ...TANILTSAH_HABEA, role: 'habea' }), 'санал болгосон хүн бодит эрхийг ХАДГАЛНА');
});

ok('Шат барьдаг админ — ажлын эрх бүгд ИЛ «нэмсэн» ялгаа', () => {
  const p = decompile('adm', ADMIN);
  assert.equal(p.job, 'super');
  assert.deepEqual(p.bagts, []);
  assert.deepEqual(p.remove, []);
  assert.deepEqual(sorted(p.add.map((d) => d.kind)), ['cap', 'role', 'stage']);
  assert.deepEqual(p.add.find((d) => d.kind === 'stage'), { kind: 'stage', stage: 'director', bagts: ['Багц-2'] });
  assert.deepEqual(p.add.find((d) => d.kind === 'cap'), { kind: 'cap', cap: 'finEdit' }, '`planApprove` хуваарилалтаас гарна');
  assert.ok(sameRights(compile(p), ADMIN));
  assert.deepEqual(validate(p).filter((x) => x.level === 'error'), [], 'хүн бүрийн «нэмсэн» ажлын эрх админд зөвшөөрөгдөнө');
  assert.equal(suggestJob(ADMIN).key, 'eronhii', 'ажлын эрхээрээ Төлөвлөлтийн ахлах инженерт ойр');
  assert.ok(jobFit(ADMIN).some((f) => f.def.key === 'super'), 'одоо админ тул жагсаалтад орно');
  assert.ok(!jobFit(ENGINEER).some((f) => f.def.key === 'super'), 'бусдад админыг санал болгохгүй');
});

/* ══════════════════════ 3. Хоёр чиглэлийн баталгаа — санамсаргүй ══════════════════════ */

/** mulberry32 — үрээр тогтоосон */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261123);
const pick = (a) => a[Math.floor(R() * a.length)];
const chance = (p) => R() < p;
const some = (a, max) => {
  const n = Math.floor(R() * (max + 1));
  return Array.from({ length: n }, () => pick(a));
};
const ROLES = [null, ...JOB_DEFS.map((d) => d.key), 'beginner', 'tolovlolt', 'unknown_role'];
const PACK_KEYS = BUTETS_PACKS.map((p) => p.key);
/* Зарим багцад төвлөрөх — ялгаатай, давхцсан жагсаалт олон гарна */
const HOT = ['Багц-1', 'Багц-2', 'Багц-3.1', 'Багц-5.1', 'Багц-6.1', 'Багц-10', 'Багц-14'];
const NAMES = [...HOT, ...HOT, ...PKG_GROUPS, 'Багц 5.1', 'багц-1', 'Үл мэдэгдэх багц', 'БАГЦ51', 'БАГЦ1ХОЛБОО', '', '  '];
const listFor = (sys) => {
  if (chance(0.08)) return [ALL];
  const pool = sys === 'butets' ? [...PACK_KEYS, ...PACK_KEYS, 'Багц-5.1', 'БАГЦ99', 'Багц-1']
    : sys === 'habea' ? [...HABEA_PKGS, ...HABEA_PKGS, 'Багц-5.1', 'Үл мэдэгдэх багц'] : NAMES;
  const l = some(pool, 5);
  return chance(0.03) ? [...l, ' * '] : l;
};
const VIEW_KEYS = VIEWS.map((v) => v.key);
const CAP_KEYS = CAPS.map((c) => c.key);

function genRights(def) {
  /* Хагас нь албан үүргийн суурь дээр бага зэрэг өөрчилсөн, хагас нь бүрэн санамсаргүй */
  if (def && chance(0.5)) {
    const tokens = some([...HOT, 'БАГЦ1ХОЛБОО'], 4);
    const base = compile({ user: 'g', job: def.key, bagts: chance(0.1) ? [ALL] : tokens, add: [], remove: [] });
    const r = JSON.parse(JSON.stringify(base));
    if (chance(0.5)) r.views = [...r.views, ...some(VIEW_KEYS, 2)].filter(() => !chance(0.1));
    if (chance(0.3)) r.docs = !r.docs;
    if (r.flow && chance(0.3)) r.flow.bagts = [...r.flow.bagts, ...some(HOT, 2)].filter(() => !chance(0.3));
    if (r.flow && chance(0.2)) r.flow.viewOnly = true;
    if (chance(0.15)) r.flow = { stage: pick(STAGE_ORDER), bagts: listFor('flow'), viewOnly: chance(0.3) };
    for (const sys of SCOPED_SYSTEMS) {
      if (chance(0.3)) {
        r.acl[sys] = [...(r.acl[sys] ?? []), { role: pick(Object.keys(ROLE_CAPS[sys])), bagts: listFor(sys) }];
      }
      if (r.acl[sys] && chance(0.2)) r.acl[sys] = r.acl[sys].map((g) => ({ ...g, bagts: g.bagts.slice(1) }));
    }
    if (chance(0.4)) r.caps = [...r.caps, ...some(CAP_KEYS, 3)];
    if (chance(0.1)) r.role = pick(ROLES);
    return r;
  }
  const r = { role: def ? def.key : (chance(0.5) ? null : pick(ROLES)) };
  r.views = chance(0.05) ? 'all' : some(VIEW_KEYS, 12);
  r.docs = chance(0.5);
  if (chance(0.6)) r.flow = { stage: pick(STAGE_ORDER), bagts: listFor('flow'), ...(chance(0.25) ? { viewOnly: true } : {}) };
  r.acl = {};
  for (const sys of SCOPED_SYSTEMS) {
    if (!chance(0.45)) continue;
    r.acl[sys] = some(Object.keys(ROLE_CAPS[sys]), 3).map((role) => ({ role, bagts: listFor(sys) }));
  }
  r.caps = some(CAP_KEYS, 5);
  return r;
}

const CASES = 1500;
ok(`compile(decompile(x)) = x — ${CASES} тохиолдол`, () => {
  let withDiffs = 0, noJob = 0, allPkgs = 0, otherStage = 0, viewOnly = 0;
  for (let i = 0; i < CASES; i += 1) {
    const def = chance(0.85) ? pick(JOB_DEFS) : null;
    const actual = genRights(def);
    const want = keyOf(actual);
    const p = decompile(`User_${i}`, actual);
    const n = normRights(actual);
    assert.equal(p.job, n.role, `#${i}: үүрэг солигдохгүй`);
    const got = compile(p);
    assert.equal(JSON.stringify(got), want, `#${i}: ${JSON.stringify(actual)}\n→ ${JSON.stringify(p)}`);
    assert.equal(JSON.stringify(normRights(got)), JSON.stringify(got), `#${i}: compile нормчилсон гаргана`);
    /* «нэмсэн» ялгаа хуваарилалтаас гардаг эрхийг ШУУД нэмэхгүй */
    assert.ok(!p.add.some((d) => d.kind === 'cap' && isDerivedCap(d.cap)), `#${i}: derived cap`);
    /* сонгосон багцын жагсаалт санамсаргүй өөр жагсаалтаас МУУ биш */
    const [c0, c1] = personCost(p);
    for (let k = 0; k < 3; k += 1) {
      const alt = personWith(`User_${i}`, actual, p.job, chance(0.1) ? [ALL] : some([...HOT, 'БАГЦ1ХОЛБОО'], 4));
      assert.equal(JSON.stringify(compile(alt)), want, `#${i}: personWith`);
      const [a0, a1] = personCost(alt);
      assert.ok(c0 < a0 || (c0 === a0 && c1 <= a1), `#${i}: сонголт хамгийн бага биш ${JSON.stringify(p)} vs ${JSON.stringify(alt)}`);
    }
    /* албан үүрэг солиход ч бодит эрх хадгалагдана */
    if (i % 10 === 0) {
      for (const f of jobFit(actual)) {
        assert.equal(JSON.stringify(compile(f.person)), JSON.stringify(normRights({ ...actual, role: f.def.key })), `#${i}: jobFit ${f.def.key}`);
      }
    }
    if (p.add.length + p.remove.length) withDiffs += 1;
    if (!p.job) noJob += 1;
    if (JSON.stringify(n).includes('"*"')) allPkgs += 1;
    const d = findDef(JOB_DEFS, n.role);
    if (n.flow && d && d.stage && d.stage !== n.flow.stage) otherStage += 1;
    if (n.flow?.viewOnly) viewOnly += 1;
  }
  /* үүсгэгч хүссэн бүх төрлийг хамарсан эсэх */
  assert.ok(withDiffs > 300 && noJob > 20 && allPkgs > 100 && otherStage > 50 && viewOnly > 100,
    `хамрах хүрээ: ${JSON.stringify({ withDiffs, noJob, allPkgs, otherStage, viewOnly })}`);
});

ok('Ялгаатай багцын жагсаалт ба өөр шат — гараар', () => {
  const x = {
    role: 'guitsetgegch', views: [], flow: { stage: 'engineer', bagts: ['Багц-1', 'Багц-2'], viewOnly: true },
    acl: { huvaari: [{ role: 'author', bagts: ['Багц-1'] }], ajil: [{ role: 'editor', bagts: ['Багц-2', 'Багц-3.1'] }] },
  };
  const p = decompile('x', x);
  assert.ok(sameRights(compile(p), x));
  const st = p.add.find((d) => d.kind === 'stage');
  assert.deepEqual(st, { kind: 'stage', stage: 'engineer', bagts: ['Багц-1', 'Багц-2'], viewOnly: true });
  const y = { role: 'menejer', flow: { stage: 'manager', bagts: ['*'] } };
  assert.deepEqual(decompile('y', y).bagts, [ALL]);
  const z = { role: 'menejer', flow: { stage: 'manager', bagts: ['Багц-1'], viewOnly: true } };
  const pz = decompile('z', z);
  assert.deepEqual(pz.add, [{ kind: 'stage', stage: 'manager', bagts: [], viewOnly: true }], 'зөвхөн «зөвхөн харна» өөрчлөгдсөн');
  assert.ok(sameRights(compile(pz), z));
  /* албан үүрэггүй — бүгд «нэмсэн» */
  const pn = decompile('n', { role: null, caps: ['gazar'], views: ['gdash'] });
  assert.deepEqual(pn, { user: 'n', job: null, bagts: [], add: [{ kind: 'view', view: 'gdash' }, { kind: 'cap', cap: 'gazar' }], remove: [] });
});

/* ══════════════════════ rightsDiff ══════════════════════ */

ok('rightsDiff — баталгаажуулах жагсаалтын өгүүлбэр', () => {
  assert.deepEqual(rightsDiff(CONTRACTOR, CONTRACTOR), []);
  const ch = rightsDiff(CONTRACTOR, {});
  assert.ok(ch.every((c) => c.op === 'add' && c.text.startsWith('Нэмнэ — ')));
  assert.ok(ch.some((c) => c.what.kind === 'job' && c.text.includes('Гүйцэтгэгч компани')));
  assert.ok(ch.some((c) => c.what.kind === 'stage' && c.text === 'Нэмнэ — Багц-1: гүйцэтгэлийг бөглөж илгээнэ (Гүйцэтгэгч компани)'));
  assert.ok(ch.some((c) => c.what.kind === 'role' && c.text === `Нэмнэ — Багц-1: ${capLabel('plan')}`));
  assert.equal(ch.filter((c) => c.what.kind === 'view').length, 7);
  /* шат солигдоход — хасна + нэмнэ */
  const moved = rightsDiff({ ...ENGINEER, flow: { stage: 'manager', bagts: ['Багц-5.1'] } }, ENGINEER);
  assert.deepEqual(moved.map((c) => `${c.op}:${c.what.kind}`), ['remove:stage', 'add:stage']);
  assert.ok(moved[1].text.includes('2-р шатанд'));
  /* багц нэмэх — зөвхөн шинэ багц */
  const more = rightsDiff({ ...MANAGER, flow: { stage: 'manager', bagts: [...MANAGER.flow.bagts, 'Багц-10'] } }, MANAGER);
  assert.deepEqual(more.map((c) => c.text), ['Нэмнэ — Багц-10: гүйцэтгэлийг 2-р шатанд хянана (Багцын ахлах инженер)']);
  /* дэд бүтцийн багц нэрээрээ */
  const bt = rightsDiff(ENGINEER, { ...ENGINEER, acl: { ...ENGINEER.acl, butets: [] } });
  assert.deepEqual(bt.map((c) => c.text), [`Нэмнэ — Багц-5.1: ${capLabel('butets')}`]);
  const back = rightsDiff({}, ADMIN);
  assert.ok(back.every((c) => c.op === 'remove' && c.text.startsWith('Хасна — ')));
});

/* ══════════════════════ validate ══════════════════════ */

const P = (o) => ({ user: 'v', job: null, bagts: [], add: [], remove: [], ...o });
const codes = (ps) => ps.map((x) => x.code).sort();

ok('validate — дүрмийн зөрчлийг ХЭЛНЭ', () => {
  assert.deepEqual(codes(validate(P({ job: 'injener', bagts: ['Багц-1'] }))), []);
  /* нэг аккаунт = нэг шат */
  const two = validate(P({ job: 'injener', bagts: ['Багц-1'], add: [{ kind: 'stage', stage: 'manager', bagts: ['Багц-1'] }] }));
  assert.deepEqual(codes(two), ['twoStages']);
  assert.equal(two[0].level, 'error');
  /* хуучин шатыг бүрэн хассан бол зөрчил биш */
  assert.deepEqual(codes(validate(P({
    job: 'injener', bagts: ['Багц-1'],
    remove: [{ kind: 'stage', stage: 'engineer', bagts: ['Багц-1'] }], add: [{ kind: 'stage', stage: 'manager', bagts: ['Багц-1'] }],
  }))), []);
  /* Ерөнхий захирал шат барихгүй */
  assert.deepEqual(codes(validate(P({ job: 'zahiral', add: [{ kind: 'stage', stage: 'chief', bagts: ['*'] }] }))), ['zahiralStage']);
  /* хуваарилалтаас гардаг эрхийг шууд нэмэхгүй */
  assert.deepEqual(codes(validate(P({ job: 'taniltsah', add: [{ kind: 'cap', cap: 'plan' }] }))), ['derivedCap']);
  assert.deepEqual(compile(P({ job: 'taniltsah', add: [{ kind: 'cap', cap: 'plan' }] })).caps, [], 'compile чимээгүй засахгүй ч бичихгүй');
  assert.deepEqual(codes(validate(P({ job: 'taniltsah', add: [{ kind: 'cap', cap: 'nope' }] }))), ['unknownCap']);
  /* админы тодорхойлолтод ажлын эрх */
  const badDefs = JOB_DEFS.map((d) => (d.key === 'super' ? { ...d, caps: ['finEdit'] } : d));
  assert.deepEqual(codes(validate(P({ job: 'super' }), badDefs)), ['adminWork']);
  assert.deepEqual(codes(validate(P({ job: 'super' }))), []);
  /* тодорхойлолтод хуваарилалтын эрх */
  const badCap = JOB_DEFS.map((d) => (d.key === 'gazar' ? { ...d, caps: ['plan'] } : d));
  assert.deepEqual(codes(validate(P({ job: 'gazar' }), badCap)), ['derivedCap']);
  /* бусад */
  assert.deepEqual(codes(validate(P({}))), ['noJob']);
  assert.deepEqual(codes(validate(P({ job: 'beginner' }))), ['noDef']);
  assert.deepEqual(codes(validate(P({ job: 'injener' }))), ['noPackages']);
  assert.deepEqual(codes(validate(P({ job: 'gazar', bagts: ['Багц-1'] }))), ['bagtsIgnored']);
  assert.deepEqual(codes(validate(P({ job: 'injener', bagts: ['Багц-1', 'Багц-999'] }))), ['unknownPkg']);
  assert.deepEqual(codes(validate(P({ job: 'injener', bagts: ['Багц-1'], remove: [{ kind: 'cap', cap: 'gazar' }] }))), ['noopRemove']);
  assert.deepEqual(codes(validate(P({ job: 'injener', bagts: ['Багц-1'], add: [{ kind: 'role', sys: 'obyem', role: 'boss', bagts: ['*'] }] }))), ['unknownRole']);
  for (const x of validate(P({ job: 'injener', bagts: ['Багц-1'], add: [{ kind: 'stage', stage: 'manager', bagts: ['Багц-1'] }] }))) {
    assert.ok(typeof x.text === 'string' && x.text.length > 10);
  }
});

/* ══════════════════════ coverage ══════════════════════ */

const person = (user, job, bagts, o = {}) => ({ user, job, bagts, add: [], remove: [], ...o });
const FULL = (g) => [
  person('c', 'guitsetgegch', [g]), person('e', 'injener', [g]), person('m', 'menejer', [g]),
  person('pl', 'tolovloltiin', [g]), person('d', 'eronhii', [g]), person('h', 'heltsiin', [g]), person('ch', 'gazriin', [g]),
];

ok('coverage — бүрэн багц: дутуугүй, зөрчилгүй', () => {
  const [c] = coverage(FULL('Багц-1'), JOB_DEFS, ['Багц-1']);
  assert.equal(c.bagts, 'Багц-1');
  for (const st of STAGE_ORDER) assert.equal(c.flow[st].length, 1, st);
  assert.deepEqual(c.huvaari, { author: ['c'], approver: ['d'] });
  assert.deepEqual(c.obyem, { editor: ['e'], approver: ['d'] });
  assert.deepEqual(c.ajil, { editor: ['c'], approver: ['e'] });
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.conflicts, []);
});

ok('coverage — юу ГАЦААХ вэ', () => {
  /* хянах шат дутуу (зөвхөн харагч · Ерөнхий захирал тоологдохгүй) */
  const ppl = FULL('Багц-2').filter((p) => p.user !== 'pl');
  ppl.push(person('plv', 'tolovloltiin', ['Багц-2'], { add: [{ kind: 'stage', stage: 'planner', bagts: [], viewOnly: true }] }));
  ppl.push({ user: 'boss', rights: { role: 'zahiral', flow: { stage: 'planner', bagts: ['*'] } } });
  const [c] = coverage(ppl, JOB_DEFS, ['Багц 2']);
  assert.equal(c.bagts, 'Багц-2', 'нэр нормчлогдоно');
  assert.deepEqual(c.flow.planner, []);
  assert.deepEqual(c.flowViewers.planner, ['boss', 'plv']);
  assert.deepEqual(c.missing.map((x) => `${x.sys}:${x.role}:${x.level}`), ['flow:planner:stuck']);
  assert.ok(c.missing[0].text.includes('3-р шат'));
  /* хуваарийн батлагчгүй → гацна; зохиогчгүй → нөхөх */
  const noAppr = FULL('Багц-1').filter((p) => p.user !== 'd');
  noAppr.push(person('d2', 'heltsiin', [], { add: [{ kind: 'stage', stage: 'director', bagts: ['Багц-1'] }] }));
  const [n] = coverage(noAppr, JOB_DEFS, ['Багц-1']);
  assert.deepEqual(n.missing.map((x) => `${x.sys}:${x.role}:${x.level}`).sort(), ['huvaari:approver:stuck', 'obyem:approver:stuck']);
  const [a] = coverage([person('d', 'eronhii', ['Багц-1'])], JOB_DEFS, ['Багц-1']);
  assert.ok(a.missing.some((x) => x.sys === 'huvaari' && x.role === 'author' && x.level === 'gap'));
  assert.ok(a.missing.some((x) => x.sys === 'flow' && x.role === 'company' && x.level === 'stuck'));
  /* хоосон багц */
  const [e] = coverage([], JOB_DEFS, ['Багц-10']);
  assert.ok(e.missing.length && e.missing.every((x) => x.level === 'empty'));
  assert.equal(e.missing.filter((x) => x.sys === 'flow').length, 7);
  /* чанар — ирүүлэгчээс өөр хянагчгүй бол гацна */
  const [q] = coverage([person('qa', 'chanar', [], { add: [{ kind: 'role', sys: 'chanar', role: 'author', bagts: ['Багц-1'] }] })], JOB_DEFS, ['Багц-1']);
  assert.ok(q.missing.filter((x) => x.sys === 'chanar').length === 5 && q.missing.every((x) => x.sys !== 'chanar' || x.level === 'stuck'));
  assert.ok(REVIEW_STAGES.length === 6);
});

ok('coverage — ЗӨРЧИЛ', () => {
  const self = [
    person('c', 'guitsetgegch', ['Багц-1'], { add: [{ kind: 'role', sys: 'huvaari', role: 'approver', bagts: ['Багц-1'] }] }),
    person('c2', 'guitsetgegch', ['Багц-1']),
    person('e', 'injener', ['Багц-1'], { add: [{ kind: 'role', sys: 'obyem', role: 'approver', bagts: ['*'] }] }),
  ];
  const [c] = coverage(self, JOB_DEFS, ['Багц-1']);
  const k = c.conflicts.map((x) => `${x.kind}:${x.sys}:${x.roles.join('+')}:${x.users.join(',')}`).sort();
  assert.deepEqual(k, [
    'duplicate:huvaari:author:c,c2',
    'selfApprove:huvaari:author+approver:c',
    'selfApprove:obyem:editor+approver:e',
  ]);
  assert.ok(c.conflicts.find((x) => x.kind === 'duplicate').text.includes('Гүйцэтгэгч компани'));
  /* өөр батлагч байхгүй тул өөрөө батлах гацаа */
  assert.ok(c.missing.some((x) => x.sys === 'obyem' && x.role === 'approver' && x.level === 'stuck'));
  /* дэд бүтэц · ХАБЭА — хос багцаар */
  const [b] = coverage([ENGINEER].map((r) => ({ user: 'eng', rights: r })), JOB_DEFS, ['Багц-5.1', 'БАГЦ1ХОЛБОО']);
  assert.deepEqual(b.butets, { editor: ['eng'] });
  const cv = coverage([person('hs', 'guitshabea', ['Багц-1'])], JOB_DEFS, ['Багц-1', 'Багц-5.1']);
  assert.deepEqual(cv.map((x) => x.habea), [{ viewer: ['hs'] }, {}]);
});

/* ══════════════════════ whoCan · canDo · replacePerson ══════════════════════ */

ok('whoCan', () => {
  const people = [
    { user: 'Contractor', rights: CONTRACTOR }, { user: 'eng', rights: ENGINEER }, { user: 'mgr', rights: MANAGER },
    { user: 'adm', rights: ADMIN }, person('view', 'menejer', ['Багц-3.1'], { add: [{ kind: 'stage', stage: 'manager', bagts: [], viewOnly: true }] }),
    person('fin', 'sanhuu', []),
  ];
  assert.deepEqual(whoCan({ cap: 'plan', bagts: 'Багц 1' }, people), ['contractor']);
  assert.deepEqual(whoCan({ cap: 'plan', bagts: 'Багц-2' }, people), []);
  assert.deepEqual(whoCan({ cap: 'planApprove' }, people), ['adm']);
  assert.deepEqual(whoCan({ cap: 'finEdit' }, people), ['adm', 'fin']);
  assert.deepEqual(whoCan({ stage: 'manager', bagts: 'Багц-3.1' }, people), ['mgr'], 'зөвхөн харагч тоологдохгүй');
  assert.deepEqual(whoCan({ sys: 'butets', bagts: 'Багц-5.1' }, people), ['eng']);
  assert.deepEqual(whoCan({ cap: 'butets', bagts: 'БАГЦ51' }, people), ['eng']);
  assert.deepEqual(whoCan({ sys: 'huvaari', role: 'approver' }, people), ['adm']);
  assert.deepEqual(whoCan({ bagts: 'Багц-3.1' }, people), ['mgr', 'view']);
});

ok('canDo — энгийн өгүүлбэр', () => {
  const c = canDo(CONTRACTOR);
  assert.equal(c[0], 'Багц-1: гүйцэтгэлийг бөглөж илгээнэ (Гүйцэтгэгч компани)');
  assert.ok(c.includes(`Багц-1: ${capLabel('plan')}`));
  assert.ok(c.includes(`Багц-1: ${capLabel('addRow')}`));
  assert.ok(c.includes('Хуваарь харах: Өөрийн багц'));
  assert.ok(c.some((x) => x.startsWith('Харагдац: ')));
  const z = canDo({ role: 'zahiral', views: tplViews('zahiral'), docs: true });
  assert.ok(z.includes('бүх багц: гүйцэтгэлийг зөвхөн харна (Ерөнхий захирал)'));
  assert.ok(z.includes('ТЭЗҮ-БОНУ баримт үзэх'));
  const a = canDo(ADMIN);
  assert.equal(a[0], 'Хэрэглэгчийн эрх удирдах (админ самбар)');
  assert.ok(a.includes('Багц-2: гүйцэтгэлийг 4-р шатанд хянана (Төлөвлөлтийн ахлах инженер)'));
  assert.ok(a.includes(capLabel('finEdit')));
  const v = canDo({ role: 'menejer', flow: { stage: 'manager', bagts: ['*'], viewOnly: true } });
  assert.equal(v[0], 'бүх багц: гүйцэтгэлийн 2-р шатыг зөвхөн харна (Багцын ахлах инженер)');
  const e = canDo(ENGINEER);
  assert.ok(e.includes(`Багц-5.1: ${capLabel('butets')}`), 'дэд бүтцийн түлхүүр нэрээр');
  assert.equal(stageNo('company'), 0);
  assert.equal(stageNo('chief'), 6);
});

ok('replacePerson — ажил хүлээлцэх', () => {
  const from = decompile('Old_User', ENGINEER);
  const to = replacePerson(from, ' New_User ');
  assert.equal(to.user, 'new_user');
  assert.deepEqual({ ...to, user: from.user }, from);
  to.add[0].bagts.push('БАГЦ52');
  to.bagts.push('Багц-1');
  assert.deepEqual(from.add[0].bagts, ['БАГЦ51'], 'хуулбар бие даасан');
  assert.deepEqual(from.bagts, ['Багц-5.1']);
  assert.ok(sameRights(compile(replacePerson(from, 'x')), ENGINEER));
});

/* ══════════════════════ 7. ЦЭВЭР ══════════════════════ */

ok('Дуудлагын үед браузерийн глобалд хүрсэнгүй', () => {
  assert.deepEqual([...new Set(touched)], [], `хүрсэн: ${[...new Set(touched)].join(', ')}`);
});

console.log(`✓ jobModel: ${passed} бүлэг шалгуур давлаа (${CASES} санамсаргүй тохиолдол)`);
