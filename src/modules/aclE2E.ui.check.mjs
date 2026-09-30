/**
 * ЭРХИЙН UI ДАВХАРГЫН E2E — ✕ / «+» / «Хадгалах» ЯГ АЛЬ op-ыг, ЯМАР багц · үүрэг ·
 * аккаунтаар дууддагийг хуурамч ArcGIS дээр шалгана (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/aclE2E.ui.check.mjs
 *
 * ⚠️ ЯАГААД (хэрэглэгч: «нэг багцаас хасахад бүх багцаас хасагдаж байна»). `aclE2E.check.mjs`
 *    op-уудыг (`aclOps`) шууд ажиллуулж ЗӨВ гэдгийг баталсан — алдаа нь UI-ийн аль ✕ аль op-ыг
 *    дууддагт байв: «Тойм → Багцаар» матрицын нүдний засварлагч (`ErhCellEditor`) «бүх багц»-тай
 *    хүнийг НЭГ нүднээс хасахад хуучин `removePkgOp` → «энэ үүргийг БҮХЭЛД НЬ хасах уу?» → БҮХ
 *    багцаас хасдаг байв. Энэ шалгуур UI бүрэлдэхүүнийг ЖИНХЭНЭЭР зурж, товчийг нь дарж,
 *    ArcGIS-ийн мөрийг шалгана.
 *
 * АРГА: DOM-гүй «мини рендерер» — React-ийн dispatcher (`H`)-ийг түр сольж функц
 *    бүрэлдэхүүнийг шууд дуудна (useState · useRef · useEffect … — төлөв нь зам бүрд
 *    хадгалагдана, эффект нь рендерийн дараа ажиллана). Элементийн `props`-оос товчны
 *    `onClick`/`onChange`-ийг олж дуудна. `*.ui.check.mjs` нэр — CSS ба `next/dynamic`
 *    стуб (`ts-alias-hooks.mjs`); `@arcgis/core`-ийн хоёр модуль → `aclE2E.fake.mjs`.
 *
 * ХЭСГҮҮД:
 *   §A `AclGrid` — нүд бүрийн чипийн ✕ ба «+» сонгогч ТЭР нүдний (мөр, багана, аккаунт)-ийг дамжуулна
 *   §B Долоон хуудас (Хуваарь · Обьём · Нэмэлт ажил · Чанарын баримт · Дэд бүтэц · QAQC · Урсгал):
 *      «бүх багц»-тай хүний бүдэг чипийн ✕ → зөвхөн тэр багц хасагдана; «+» → нэмэгдэнэ
 *   §C МАТРИЦ (`ErhCellEditor`) — 20 багана бүрд «бүх багц»-тай хүнийг нэг нүднээс ✕ → бусад үлдэнэ
 *      (МЭДЭЭЛСЭН АЛДАА — засвараас өмнө УНАДАГ)
 *   §D Гацааны анхааруулга — зохиогч=батлагч · батлагчгүй · Чанарт «нэг хүн хоёр үүрэгт» · хянагч дутуу
 *   §E «Хэрэглэгчид» самбар (`UserAdmin`) — урсгалтай харагдац унтраалгагүй, хадгалахад хэвээр ·
 *      үүрэг солих · устгах (бүх хуваарилалт + эрх цэвэрлэгдэнэ) · «Буцаах»
 */
import assert from 'node:assert/strict';
import { fake, takeConfirms, settle, setConfirmAnswer } from '../lib/aclE2E.fake.mjs';

/* `UserAdmin`-ы эффектүүд `document.body.style`-д хүрдэг */
const noop = () => {};
const elem = () => ({ style: {}, focus: noop, blur: noop, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop });
globalThis.document = { body: elem(), documentElement: elem(), activeElement: null, createElement: elem, querySelector: () => null, querySelectorAll: () => [] };

const { ROLE_BY_USER } = await import('@/lib/services.ts');
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const React = (await import('react')).default;
const INT = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
const FL = await import('@/lib/guitsetgelAcl.ts');
const QA = await import('@/lib/qaqcAcl.ts');
const HV = await import('@/lib/huvaariAcl.ts');
const OB = await import('@/lib/obyemAcl.ts');
const AJ = await import('@/lib/ajilAcl.ts');
const CH = await import('@/lib/chanarAcl.ts');
const BT = await import('@/lib/butetsAcl.ts');
const { ROLE_CAPS } = await import('@/lib/aclRoleCaps.ts');
const { MATRIX_COLS, pkgMatrix, butetsRows } = await import('@/lib/erhOverview.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');
const { WORKFLOW_VIEWS } = await import('@/lib/caps.ts');

const { AclGrid } = await import('@/modules/AclGrid.tsx');
const { HuvaariAcl } = await import('@/modules/HuvaariAcl.tsx');
const { ObyemAcl } = await import('@/modules/ObyemAcl.tsx');
const { AjilAcl } = await import('@/modules/AjilAcl.tsx');
const { ChanarAcl } = await import('@/modules/ChanarAcl.tsx');
const { DedButetsAcl } = await import('@/modules/DedButetsAcl.tsx');
const { QaqcAcl } = await import('@/modules/QaqcAcl.tsx');
const { GuitsetgelAcl } = await import('@/modules/GuitsetgelAcl.tsx');
const { ErhCellEditor } = await import('@/modules/ErhCellEditor.tsx');
const { UserAdmin } = await import('@/components/UserAdmin.tsx');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const sorted = (x) => [...x].sort();

/* ══════════ Мини рендерер ══════════ */
const REACT_FRAGMENT = Symbol.for('react.fragment');
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** Нэг бүрэлдэхүүний «инстанц» — hook-ийн слотууд, эффектүүд */
class Host {
  constructor(type) { this.type = type; this.slots = []; this.dirty = false; }
  render(props) { return renderHost(this, props); }
}

/** Нэг рендер — dispatcher-ийг түр сольж бүрэлдэхүүнийг дуудна, дараа нь эффектүүд */
function renderHost(self, props) {
  let i = 0;
  const effects = [];
  const eff = (fn, deps) => {
    const k = i++;
    const prev = self.slots[k];
    if (!prev || !deps || !same(deps, prev.deps)) effects.push({ k, fn, deps });
    else self.slots[k] = prev;
  };
  const D = {
    useState(init) {
      const k = i++;
      if (!(k in self.slots)) self.slots[k] = { v: typeof init === 'function' ? init() : init };
      const slot = self.slots[k];
      return [slot.v, (v) => { const n = typeof v === 'function' ? v(slot.v) : v; if (!Object.is(n, slot.v)) { slot.v = n; self.dirty = true; } }];
    },
    useReducer(r, arg, init) {
      const [s, set] = D.useState(() => (init ? init(arg) : arg));
      return [s, (a) => set((cur) => r(cur, a))];
    },
    useRef(init) { const k = i++; if (!(k in self.slots)) self.slots[k] = { current: init }; return self.slots[k]; },
    useEffect: eff, useLayoutEffect: eff, useInsertionEffect: eff,
    useMemo(fn, deps) {
      const k = i++;
      const prev = self.slots[k];
      if (prev && deps && same(deps, prev.deps)) return prev.v;
      const v = fn(); self.slots[k] = { v, deps }; return v;
    },
    useCallback(fn, deps) { return D.useMemo(() => fn, deps); },
    useContext(ctx) { return ctx._currentValue; },
    useSyncExternalStore(_s, get) { return get(); },
    useId() { return `:r${i++}:`; },
    useTransition() { return [false, (f) => f()]; },
    useDeferredValue(v) { return v; },
    useImperativeHandle() { i++; },
    useDebugValue() {},
    use(x) { return x?._currentValue ?? x; },
  };
  const prevH = INT.H;
  INT.H = D;
  let out;
  try { out = self.type(props); } finally { INT.H = prevH; }
  for (const e of effects) {
    const prev = self.slots[e.k];
    if (prev?.cleanup) prev.cleanup();
    const c = e.fn();
    self.slots[e.k] = { deps: e.deps, cleanup: typeof c === 'function' ? c : null };
  }
  return out;
}

/**
 * Модыг ЗУРНА: `expand`-д нэр нь орсон функц бүрэлдэхүүнийг (зам бүрд тогтмол Host-оор)
 * задлан дуудна; бусад функц элемент хэвээр (props нь уншигдана).
 */
function mount(el, expand = new Set()) {
  const hosts = new Map();
  const draw = (node, path) => {
    if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) return node.map((n, i) => draw(n, `${path}.${n?.key ?? i}`));
    const { type, props } = node;
    if (type === REACT_FRAGMENT) return { ...node, props: { ...props, children: draw(props.children, `${path}.f`) } };
    if (typeof type === 'function') {
      if (!expand.has(type.name) && path !== 'root') return node;
      const key = `${path}/${type.name}`;
      let h = hosts.get(key);
      if (!h) { h = new Host(type); hosts.set(key, h); }
      return { type: 'expanded', key: node.key, props: { of: type.name, children: draw(h.render(props), `${key}`) } };
    }
    if (props && 'children' in props) return { ...node, props: { ...props, children: draw(props.children, `${path}.${type}`) } };
    return node;
  };
  const api = {
    tree: null,
    render() {
      for (let n = 0; n < 12; n += 1) {
        for (const h of hosts.values()) h.dirty = false;
        api.tree = draw(el, 'root');
        if (![...hosts.values()].some((h) => h.dirty)) return api.tree;
      }
      return api.tree;
    },
  };
  api.render();
  return api;
}

/** Модыг дагаж, `pred`-д таарсан элементүүд (өвөг элементийн `key`-ийн замтай) */
function findAll(node, pred, trail = [], out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, trail, out)); return out; }
  const t = node.key != null ? [...trail, node.key] : trail;
  if (pred(node)) out.push({ el: node, trail: t });
  if (node.props?.children) findAll(node.props.children, pred, t, out);
  return out;
}
const byName = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const text = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node.props?.children);
};

/** Бичилт дуустал хүлээнэ (UI `void run(op)` — амлалтгүй) */
const idle = () => settle(() => fake.inflight > 0 || POOL.some((u) => OPS.aclPendingFor(u)));

/* ══════════ Аккаунтууд ба эхлэл ══════════ */
const POOL = Array.from({ length: 80 }, (_, i) => `ui_u${String(i + 1).padStart(3, '0')}`);
fake.seed(POOL.map((u) => ({ username: u, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 })));
let nextU = 0;
const mkUser = () => POOL[nextU++];
const run = async (op) => { takeConfirms(); let err = ''; const r = await OPS.runOp(op, (m) => { err = m; }); await idle(); return { ok: r, err, confirms: takeConfirms() }; };
ok(await P.initRemote(false, true), 'initRemote');
await idle();
ok(OPS.allAclReady(), 'бүх туг бэлэн');

/* ══════════ §A. AclGrid — чип бүрийн ✕ ба «+» ══════════ */
{
  const rows = [{ key: 'R1', label: 'R1' }, { key: 'R2', label: 'R2' }, { key: 'R3', label: 'R3' }];
  const cols = [{ key: 'c1', label: 'C1' }, { key: 'c2', label: 'C2' }];
  /* (мөр, багана) бүрд өөр аккаунт + мөр бүрд «бүх багц»-тай нэг бүдэг чип */
  const holders = (r, c) => [
    { user: `u_${r}_${c}`, viaAll: false, gone: false, failed: false, dirty: false },
    { user: `all_${c}`, viaAll: true, gone: false, failed: false, dirty: false },
  ];
  const calls = [];
  const props = {
    rows, cols, corner: 'Б', holders, stuck: () => false, stuckTitle: () => '',
    candidates: (r, c) => [{ value: `new_${r}_${c}`, label: 'x' }],
    onAdd: (r, c, u) => calls.push(['add', r, c, u]),
    onRemove: (r, c, h) => calls.push(['rm', r, c, h.user, h.viaAll]),
    addTitle: () => '', off: false,
  };
  const m = mount(React.createElement(AclGrid, props), new Set(['AclGrid', 'Chip']));
  /* ✕ бүр — өвөг `tr`(мөр) · `td`(багана) · чип(аккаунт)-ийн түлхүүртэй таарна */
  const xs = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'ggX');
  eq(xs.length, rows.length * cols.length * 2, '§A чип бүрд ✕');
  for (const { el, trail } of xs) {
    const [row, col, user] = trail.filter((k) => k !== null).slice(-3);
    calls.length = 0;
    el.props.onClick({});
    eq(calls, [['rm', row, col, user, user.startsWith('all_')]], `§A ✕ ${row}/${col}/${user} — ТЭР нүдний аргумент`);
  }
  /* «бүх»-ийн бүдэг чипийн ✕ нь МӨРИЙН багцыг дамжуулна (ALL_BAGTS биш) */
  ok(xs.filter((x) => x.el.props.title?.includes('бусад багцын')).length === rows.length * cols.length, '§A бүдэг чипийн tooltip «бусад багцын жагсаалт»');
  /* «+» → сонгогч → onAdd(мөр, багана, аккаунт) */
  for (const r of rows) {
    for (const c of cols) {
      const plus = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'ggAdd')
        .find((x) => x.trail.includes(r.key) && x.trail.includes(c.key));
      plus.el.props.onClick({});
      m.render();
      const sel = findAll(m.tree, (n) => n.type === 'select')[0];
      ok(sel && sel.trail.includes(r.key) && sel.trail.includes(c.key), `§A «+» ${r.key}/${c.key} — тэр нүдэнд сонгогч`);
      calls.length = 0;
      sel.el.props.onChange({ target: { value: `new_${r.key}_${c.key}` } });
      eq(calls, [['add', r.key, c.key, `new_${r.key}_${c.key}`]], `§A «+» ${r.key}/${c.key} onAdd`);
      m.render();
    }
  }
  console.log(`✅ §A AclGrid: ${xs.length} ✕ ба ${rows.length * cols.length} «+» тус бүр ӨӨРИЙН нүдний (багц, үүрэг, аккаунт)-ийг дамжуулав`);
}

/* ══════════ §B. Долоон хуудас — бүдэг «бүх» чипийн ✕ ба «+» ══════════ */
const panelGrid = (Comp) => {
  const m = mount(React.createElement(Comp), new Set([Comp.name, 'ScopedAclPanel', 'AclGrid', 'Chip']));
  return m;
};
/** Хуудасны (мөр, багана) нүдэн дэх аккаунтын ✕ */
const clickX = (m, row, col, user) => {
  const hit = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'ggX')
    .filter((x) => { const k = x.trail.filter((t) => t !== null); return k.includes(row) && k.includes(col) && k[k.length - 1] === user; });
  eq(hit.length, 1, `нүд ${row}/${col}-д «${user}» чип нэг удаа`);
  hit[0].el.props.onClick({});
};
const clickAdd = (m, row, col, user) => {
  const plus = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'ggAdd')
    .find((x) => x.trail.includes(row) && x.trail.includes(col));
  plus.el.props.onClick({});
  m.render();
  const sel = findAll(m.tree, (n) => n.type === 'select')[0];
  ok(sel.el.props.children[1].some((o) => o.props.value === user), `«+» ${row}/${col}: «${user}» санал болгогдоно`);
  sel.el.props.onChange({ target: { value: user } });
};
/** Нүдэн дэх чипүүд (задалсан `Chip`; зам нь `…/мөр/багана/аккаунт`) */
const chipsIn = (m, row, col) => findAll(m.tree, (n) => n.type === 'expanded' && n.props.of === 'Chip')
  .filter((x) => x.trail.includes(row) && x.trail.includes(col));
{
  const SC = {
    huvaari: { Comp: HuvaariAcl, list: HV.listHuvaariAssigns, universe: PKG_GROUPS },
    obyem: { Comp: ObyemAcl, list: OB.listObyemAssigns, universe: PKG_GROUPS },
    ajil: { Comp: AjilAcl, list: AJ.listAjilAssigns, universe: PKG_GROUPS },
    chanar: { Comp: ChanarAcl, list: CH.listChanarAssigns, universe: PKG_GROUPS },
    butets: { Comp: DedButetsAcl, list: BT.listButetsAssigns, universe: BUTETS_PACKS.map((p) => p.key) },
  };
  let n = 0;
  for (const [sys, d] of Object.entries(SC)) {
    for (const role of Object.keys(ROLE_CAPS[sys])) {
      const tag = `§B ${sys}.${role}`;
      const u = mkUser();
      ok((await run(OPS.setRoleAllOp(sys, u, role))).ok, `${tag}: «бүх багц»`);
      const m = panelGrid(d.Comp);
      const px = d.universe[3 % d.universe.length];
      /* бүдэг чип бүх мөрөнд */
      for (const g of d.universe) ok(chipsIn(m, g, role).length >= 1, `${tag}: ${g} мөрөнд чип`);
      takeConfirms();
      clickX(m, px, role, u);
      await idle();
      const cf = takeConfirms();
      eq(cf.length, sys === 'butets' ? 0 : 1, `${tag}: асуулт`);
      if (cf.length) ok(!/БҮХЭЛД/.test(cf[0]), `${tag}: «бүхэлд нь хасах» асуулт БИШ`);
      const got = d.list().find((a) => a.user === u)?.grants.find((g) => g.role === role)?.bagts ?? [];
      eq(sorted(got), sorted(d.universe.filter((x) => x !== px)), `${tag}: ✕ → зөвхөн ${px} хасагдана`);
      eq(sorted(fake.json(`__${sys}__:`, u).grants.find((g) => g.role === role).bagts), sorted(got), `${tag}: ArcGIS`);
      ok(CAPS.capsOf(u).includes(ROLE_CAPS[sys][role]), `${tag}: эрх хэвээр`);
      m.render();
      eq(chipsIn(m, px, role).filter((x) => x.trail.includes(u)).length, 0, `${tag}: ${px} нүднээс чип алга`);
      /* «+» → тэр багцад буцааж нэмэх */
      clickAdd(m, px, role, u);
      await idle();
      ok((d.list().find((a) => a.user === u)?.grants.find((g) => g.role === role)?.bagts ?? []).includes(px), `${tag}: «+» → ${px} нэмэгдэнэ`);
      n += 1;
    }
  }
  /* QAQC */
  {
    const tag = '§B qaqc';
    const u = mkUser();
    await QA.setQaqcAssign(u, ['*']).sync; await idle();
    const m = panelGrid(QaqcAcl);
    const px = PKG_GROUPS[3];
    takeConfirms();
    clickX(m, px, 'qaqc', u);
    await idle();
    eq(takeConfirms().length, 1, `${tag}: асуулт`);
    eq(sorted(QA.listQaqcAssigns().find((a) => a.user === u).bagts), sorted(PKG_GROUPS.filter((x) => x !== px)), `${tag}: зөвхөн ${px}`);
    ok(CAPS.capsOf(u).includes('qaqc'), `${tag}: эрх хэвээр`);
    m.render();
    clickAdd(m, px, 'qaqc', u);
    await idle();
    ok(QA.listQaqcAssigns().find((a) => a.user === u).bagts.includes(px), `${tag}: «+»`);
    n += 1;
  }
  /* Урсгал — 6 шат */
  for (const st of STAGE_ORDER) {
    const tag = `§B flow.${st}`;
    const u = mkUser();
    ok((await run(OPS.flowStageOp(u, st))).ok, `${tag}: «бүх багц»`);
    const m = panelGrid(GuitsetgelAcl);
    const px = PKG_GROUPS[3];
    takeConfirms();
    clickX(m, px, st, u);
    await idle();
    eq(takeConfirms().length, 1, `${tag}: асуулт`);
    eq(sorted(FL.bagtsFor(u, st)), sorted(PKG_GROUPS.filter((x) => x !== px)), `${tag}: зөвхөн ${px}`);
    eq(FL.stageOfUser(u), st, `${tag}: шат хэвээр`);
    m.render();
    clickAdd(m, px, st, u);
    await idle();
    ok(FL.bagtsFor(u, st).includes(px), `${tag}: «+»`);
    n += 1;
  }
  console.log(`✅ §B ${n} багана (5 систем × үүрэг · QAQC · 6 шат): «бүх»-ийн бүдэг чипийн ✕ → зөвхөн тэр багц хасагдав, эрх хэвээр; «+» → буцааж нэмэгдэв`);
}

/* ══════════ §C. МАТРИЦ — `ErhCellEditor` (МЭДЭЭЛСЭН АЛДАА) ══════════ */
{
  const cols = [...MATRIX_COLS.map((c) => ({ sys: c.sys, role: c.role, id: c.id })), { sys: 'butets', role: 'editor', id: 'butets:editor' }];
  let n = 0;
  for (const col of cols) {
    const tag = `§C ${col.id}`;
    const u = mkUser();
    const universe = col.sys === 'butets' ? BUTETS_PACKS.map((p) => p.key) : PKG_GROUPS;
    /* «бүх багц» олгох */
    if (col.sys === 'flow') ok((await run(OPS.flowStageOp(u, col.role))).ok, tag);
    else if (col.sys === 'qaqc') { await QA.setQaqcAssign(u, ['*']).sync; await idle(); }
    else ok((await run(OPS.setRoleAllOp(col.sys, u, col.role))).ok, tag);
    const px = universe[4 % universe.length];
    const src = OPS.liveErhSource();
    const owners = col.sys === 'butets'
      ? butetsRows(src, BUTETS_PACKS).find((r) => r.key === px).editors
      : pkgMatrix(src).find((r) => r.bagts === px).cells[col.id].owners;
    ok(owners.includes(u), `${tag}: «бүх багц»-тай хүн ${px} нүдэнд эзэн`);
    let pending = null;
    const m = mount(React.createElement(ErhCellEditor, {
      pkg: px, title: tag, col: { sys: col.sys, role: col.role }, owners, viewers: [],
      locked: false, busy: false, err: '', drafts: new Map(), onClose: noop,
      run: (op) => { pending = OPS.runOp(op, noop); return pending; },
    }), new Set(['ErhCellEditor']));
    const x = findAll(m.tree, (nd) => nd.type === 'div' && nd.key === `o-${u}`)[0];
    ok(x, `${tag}: мөр`);
    const btn = findAll(x.el, (nd) => nd.type === 'button')[0];
    takeConfirms();
    btn.el.props.onClick({});
    ok(pending, `${tag}: ✕ op дуудав`);
    ok(await pending, `${tag}: бичилт`);
    await idle();
    const cf = takeConfirms();
    ok(!cf.some((c) => /БҮХЭЛД/.test(c)), `${tag}: «энэ үүргийг БҮХЭЛД НЬ хасах уу» асуухгүй (асуулт: ${cf.join(' | ')})`);
    const rest = sorted(universe.filter((k) => k !== px));
    let got;
    if (col.sys === 'flow') got = FL.bagtsFor(u, col.role);
    else if (col.sys === 'qaqc') got = QA.listQaqcAssigns().find((a) => a.user === u)?.bagts;
    else got = OPS.SCOPED_SYS[col.sys].list().find((a) => a.user === u)?.grants.find((g) => g.role === col.role)?.bagts;
    eq(got && sorted(got), rest, `${tag}: матрицын ✕ → зөвхөн ${px} хасагдаж, бусад ${rest.length} багц ҮЛДЭНЭ`);
    n += 1;
  }
  console.log(`✅ §C матриц: ${n} багана бүрд «бүх багц»-тай хүнийг нэг нүднээс хасахад бусад багц үлдэв (мэдээлсэн алдаа засагдсан)`);
}

/* ══════════ §D. Гацааны анхааруулга ══════════ */
{
  const g = PKG_GROUPS[5];
  /* ⚠️ Өмнөх хэсгүүдийн «бүх багц»-тай хуваарилалт энэ багцыг хамардаг — цэвэрлэнэ */
  for (const x of HV.listHuvaariAssigns()) await HV.removeHuvaariAssign(x.user).sync;
  for (const x of CH.listChanarAssigns()) await CH.removeChanarAssign(x.user).sync;
  await idle();
  const a = mkUser();
  const b = mkUser();
  /* Хуваарь: батлагчгүй → зохиогч = цорын ганц батлагч → өөр батлагч */
  await run(OPS.scopedCellOp('huvaari', a, 'author', g, true));
  /** Хуудасны `AclGrid`-ийн props — мөрийн анхааруулга ба `stuck` */
  const withGrid = (Comp) => findAll(mount(React.createElement(Comp), new Set([Comp.name, 'ScopedAclPanel'])).tree, byName('AclGrid'))[0].el.props;
  let grid = withGrid(HuvaariAcl);
  ok(grid.stuck(g, 'approver', []), '§D батлагчгүй → батлагчийн нүд гацсан');
  ok(grid.rows.find((r) => r.key === g).warn.length === 1, '§D батлагчгүй анхааруулга');
  await run(OPS.scopedCellOp('huvaari', a, 'approver', g, true));
  grid = withGrid(HuvaariAcl);
  ok(grid.stuck(g, 'approver', []), '§D зохиогч = цорын ганц батлагч → гацаа');
  await run(OPS.scopedCellOp('huvaari', b, 'approver', g, true));
  grid = withGrid(HuvaariAcl);
  ok(!grid.stuck(g, 'approver', []) && !grid.rows.find((r) => r.key === g).warn.length, '§D өөр батлагч нэмэхэд гацаа арилна');
  /* Чанарын баримт: нэг хүн хоёр хянагч үүргийн ЦОРЫН ГАНЦ эзэн → «нэг хүн хоёр үүрэгт» */
  const au = mkUser();
  const r1 = mkUser();
  await run(OPS.scopedCellOp('chanar', au, 'author', g, true));
  grid = withGrid(ChanarAcl);
  ok(grid.rows.find((r) => r.key === g).warn.some((w) => /хянагч томилоогүй/.test(w)), '§D Чанар: хянагч дутуу');
  for (const role of CH.CHANAR_REVIEWERS) await run(OPS.scopedCellOp('chanar', r1, role, g, true));
  grid = withGrid(ChanarAcl);
  const w = grid.rows.find((r) => r.key === g).warn;
  ok(w.some((x) => /Нэг хүн хоёр үүрэгт/.test(x)), `§D Чанар: нэг хүн хоёр үүрэгт (${w.join(' | ')})`);
  ok(!w.some((x) => /хянагч томилоогүй/.test(x)), '§D Чанар: хянагч дутуу биш');
  console.log('✅ §D гацаа: батлагчгүй · зохиогч=батлагч · өөр батлагч нэмэхэд арилна · Чанар: хянагч дутуу · нэг хүн хоёр үүрэгт');
}

/* ══════════ §E. «Хэрэглэгчид» самбар — UserAdmin ══════════ */
{
  const tag = '§E';
  const u = mkUser();
  const g = PKG_GROUPS[0];
  await run(OPS.flowCellOp(u, 'engineer', g, true));
  await run(OPS.scopedCellOp('huvaari', u, 'author', g, true));
  await run(OPS.qaqcCellOp(u, g, true));
  await run(OPS.capDirectOp(u, 'zovshoorol', true));
  const acl = () => fake.rows.filter((r) => r.username.startsWith('__') && r.username.endsWith(`:${u}`))
    .map((r) => `${r.username}=${r.views}`).sort();
  const aclBefore = acl();
  const stored = () => P.listUsers().find((x) => x.username === u)?.views;
  ok(stored().includes('guitsetgel'), `${tag}: урсгал «Гүйцэтгэл»-ийг хадгалсан`);

  const m = mount(React.createElement(UserAdmin, { open: true, onClose: noop }), new Set(['UserAdmin']));
  await idle(); m.render();
  const side = () => findAll(m.tree, (n) => n.type === 'button' && /sideItem/.test(n.props?.className ?? ''));
  side().find((x) => text(x.el).includes('Хэрэглэгчдийн эрх удирдах')).el.props.onClick({});
  m.render();
  const rowOf = () => findAll(m.tree, byName('UserRow')).find((x) => x.el.props.u.username === u).el.props;
  let p = rowOf();
  /* урсгалтай харагдац картаас засагдахгүй */
  for (const v of WORKFLOW_VIEWS) { p.onFlipView(v); m.render(); }
  eq(rowOf().dirty, false, `${tag}: урсгалтай ${WORKFLOW_VIEWS.length} харагдац унтраалгагүй (ноорог үүсэхгүй)`);
  /* энгийн харагдац + үүрэг → «Хадгалах» */
  rowOf().onFlipView('gdash'); m.render();
  rowOf().onRole('chanar'); m.render();
  ok(rowOf().dirty, `${tag}: ноорог`);
  const save = () => findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'saveBtn')[0].el;
  save().props.onClick({});
  await idle(); m.render();
  p = rowOf();
  eq(p.dirty, false, `${tag}: хадгалагдав`);
  await P.initRemote(false, true); await idle();
  ok(stored().includes('guitsetgel'), `${tag}: хадгалахад «Гүйцэтгэл» (урсгалын) хэвээр`);
  eq(P.roleOf(u), 'chanar', `${tag}: үүрэг солигдов`);
  eq(acl(), aclBefore, `${tag}: карт хадгалахад хуваарилалт/эрх хөндөгдөөгүй`);
  ok(P.resolveAccess(u).views.includes('huvaari') && P.resolveAccess(u).views.includes('qaqc'), `${tag}: эрхээр нээгдсэн харагдац хэвээр`);
  /* устгах → «Хадгалах» (асуулт) → бүх хуваарилалт ба эрх цэвэрлэгдэнэ */
  m.render();
  rowOf().onFlipRemove(); m.render();
  takeConfirms();
  save().props.onClick({});
  await idle(); m.render();
  ok(takeConfirms().some((c) => /УСТГАГДАНА/.test(c)), `${tag}: устгахыг асуусан`);
  await P.initRemote(false, true); await idle();
  eq(acl(), [], `${tag}: устгасан аккаунтын ArcGIS хуваарилалт/эрхийн мөр үлдээгүй`);
  eq(P.hasAccess(u), false, `${tag}: нэвтрэхгүй`);
  /* хатуу аккаунт → tombstone → «Буцаах» */
  const hard = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'injener')[0];
  await run(OPS.scopedCellOp('obyem', hard, 'editor', g, true));
  m.render();
  findAll(m.tree, byName('UserRow')).find((x) => x.el.props.u.username === hard).el.props.onFlipRemove(); m.render();
  save().props.onClick({}); await idle(); m.render();
  ok(P.listRemoved().includes(hard), `${tag}: хатуу аккаунт «Устгагдсан»-д`);
  const back = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'reset')
    .find((x) => x.trail.includes(hard));
  ok(back, `${tag}: «Буцаах» товч`);
  setConfirmAnswer(true);
  back.el.props.onClick({});
  await idle(); await P.initRemote(false, true); await idle();
  eq(P.hasAccess(hard), true, `${tag}: сэргээв`);
  eq(OB.obyemScope(hard, 'editor'), [], `${tag}: хуучин хуваарилалт эргэж ирэхгүй`);
  eq(CAPS.capsOf(hard), [], `${tag}: хуучин эрх эргэж ирэхгүй`);
  console.log('✅ §E самбар: урсгалтай харагдац унтраалгагүй · хадгалахад хэвээр · үүрэг солих хуваарилалт хөндөөгүй · устгах бүгдийг цэвэрлэв · «Буцаах»');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ aclE2E.ui: ${checks} шалгалт — бүгд давлаа`);
