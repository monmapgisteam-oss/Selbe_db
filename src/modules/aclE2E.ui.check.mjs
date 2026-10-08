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
 *   §E «Хэрэглэгчид» самбар (`UserAdmin`) — урсгалтай харагдац унтраалгагүй, хадгалахад бичигдэхгүй ·
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
const { UserHeadActions } = await import('@/components/UserRow.tsx');
const RT = await import('@/lib/roleTypes.ts');

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
/* ⚠️ 2026-10-01: POOL-оос гадуурх аккаунтын (хатуу аккаунт, өнчин эрх «ui_orphan_caps» г.м.) бичилтийг ч
   хүлээнэ — хүснэгтэд байгаа БҮХ нэрийг шалгана; эс бөгөөс удаан машинд (GitHub runner) бичилт
   дуусахаас өмнө шалгагдаж CI-д л унадаг байв. */
const baseName = (n) => String(n).replace(/^__[a-z]+__:/i, '');
const idle = () => settle(() => fake.inflight > 0
  || POOL.some((u) => OPS.aclPendingFor(u))
  || fake.rows.some((r) => OPS.aclPendingFor(baseName(r.username))));

/* ══════════ Аккаунтууд ба эхлэл ══════════ */
const POOL = Array.from({ length: 80 }, (_, i) => `ui_u${String(i + 1).padStart(3, '0')}`);
fake.seed(POOL.map((u) => ({ username: u, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 })));
let nextU = 0;
const mkUser = () => POOL[nextU++];
const run = async (op) => { takeConfirms(); let err = ''; const r = await OPS.runOp(op, (m) => { err = m; }); await idle(); return { ok: r, err, confirms: takeConfirms() }; };
/** `UserAdmin`-ыг зурж «Хэрэглэгчдийн эрх удирдах» хуудас руу орно */
const usersPane = async () => {
  const m = mount(React.createElement(UserAdmin, { open: true, onClose: noop }), new Set(['UserAdmin']));
  await idle(); m.render();
  findAll(m.tree, (n) => n.type === 'button' && /sideItem/.test(n.props?.className ?? ''))
    .find((x) => text(x.el).includes('Хэрэглэгчдийн эрх удирдах')).el.props.onClick({});
  m.render();
  return m;
};
const alerts = (m) => findAll(m.tree, (n) => n.props?.role === 'alert').map((x) => text(x.el));

/* ══════════ §0. Remote НЭГ Ч удаа уншигдаагүй сешн — картаас ноорог үүсэхгүй (2026-09-30) ══════════
 * ⚠️ Тэр үед жагсаалт нь зөвхөн browser-ийн кэш (шинэ browser-т хатуу суурь л) — түүн дээрх
 *    ноорог хадгалагдвал (эсвэл унасан бичилтийн retry-д) бодит мөрийг дарна
 *    (`roleTypeApply.applyType`-ийн «уншигдаагүй сешнд бичвэл бодит мөрийг дарна» дүрэм). */
{
  fake.searchDown = true;
  const m = await usersPane();
  eq(P.remoteReady(), false, '§0 remote уншигдаагүй');
  const hard = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'beginner')[0];
  const row = () => findAll(m.tree, byName('UserRow')).find((x) => x.el.props.u.username === hard).el.props;
  row().onFlipView('gdash'); m.render();
  row().onRole('taniltsah'); m.render();
  eq(row().dirty, false, '§0 уншигдаагүй сешнд ноорог үүсэхгүй');
  ok(alerts(m).includes(OPS.lockMsg()), `§0 түгжээний зурвас (${alerts(m).join(' | ')})`);
  fake.searchDown = false;
  console.log('✅ §0 remote уншигдаагүй сешн: картын засвар ноорог үүсгэхгүй, түгжээний зурвас');
}

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
  /* ⚠️ 2026-10-09 (CI-д л унасан, 1b259da): `idle()` зөвхөн POOL-ын бичилтийг хүлээдэг — удаан runner дээр
     хадгалалт (permsRemote upsert) дуусахаас өмнө `dirty` шалгагдаж байв. Доорх хатуу аккаунтын
     устгалтай ижил аргаар бичилт дуустал (ноорог арилтал) хүлээнэ. */
  await settle(() => { m.render(); return fake.inflight > 0 || rowOf().dirty; });
  await idle(); m.render();
  p = rowOf();
  eq(p.dirty, false, `${tag}: хадгалагдав`);
  await P.initRemote(false, true); await idle();
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): карт «Хадгалах» урсгалтай харагдацыг БИЧИХГҮЙ —
     харин томилгоогоор «Гүйцэтгэл» нээлттэй хэвээр (`permissions.workflowViewsOf`) */
  ok(!stored().some((v) => WORKFLOW_VIEWS.includes(v)), `${tag}: хадгалахад урсгалтай харагдац бичигдээгүй (${stored()})`);
  ok(P.resolveAccess(u).views.includes('guitsetgel'), `${tag}: томилгоогоор «Гүйцэтгэл» нээлттэй хэвээр`);
  eq(P.roleOf(u), 'chanar', `${tag}: үүрэг солигдов`);
  eq(acl(), aclBefore, `${tag}: карт хадгалахад хуваарилалт/эрх хөндөгдөөгүй`);
  ok(P.resolveAccess(u).views.includes('huvaari') && P.resolveAccess(u).views.includes('qaqc'), `${tag}: эрхээр нээгдсэн харагдац хэвээр`);
  /* устгах → «Хадгалах» (асуулт) → бүх хуваарилалт ба эрх цэвэрлэгдэнэ */
  m.render();
  rowOf().onFlipRemove(); m.render();
  takeConfirms();
  save().props.onClick({});
  /* ⚠️ 2026-10-09: `idle()` зөвхөн aclOps-ийн pending-ийг хардаг — удаан runner дээр бичилт дуусахаас өмнө шалгагдахгүйн тулд хүлээгдэж буй төлөв тогтотол хүлээнэ (§E «Хадгалах»-тай ижил). */
  await settle(() => { m.render(); return fake.inflight > 0 || acl().length > 0 || P.hasAccess(u); });
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
  /* ⚠️ 2026-10-01 (CI-д л унадаг байсан): `idle()` зөвхөн POOL-ын бичилтийг хүлээдэг — хатуу аккаунт
     POOL-д байхгүй тул удаан машинд (GitHub runner) устгал дуусахаас өмнө шалгагдаж байв. */
  save().props.onClick({});
  await settle(() => fake.inflight > 0 || OPS.aclPendingFor(hard) || !P.listRemoved().includes(hard));
  await idle(); m.render();
  ok(P.listRemoved().includes(hard), `${tag}: хатуу аккаунт «Устгагдсан»-д`);
  const back = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'reset')
    .find((x) => x.trail.includes(hard));
  ok(back, `${tag}: «Буцаах» товч`);
  setConfirmAnswer(true);
  back.el.props.onClick({});
  await settle(() => fake.inflight > 0 || OPS.aclPendingFor(hard) || P.listRemoved().includes(hard));
  await idle(); await P.initRemote(false, true); await idle();
  eq(P.hasAccess(hard), true, `${tag}: сэргээв`);
  eq(OB.obyemScope(hard, 'editor'), [], `${tag}: хуучин хуваарилалт эргэж ирэхгүй`);
  eq(CAPS.capsOf(hard), [], `${tag}: хуучин эрх эргэж ирэхгүй`);
  console.log('✅ §E самбар: урсгалтай харагдац унтраалгагүй · хадгалахад бичигдэхгүй (томилгоогоор нээлттэй) · үүрэг солих хуваарилалт хөндөөгүй · устгах бүгдийг цэвэрлэв · «Буцаах»');
}

/* ══════════ §F. «Хэрэглэгчид» самбарын засварууд (2026-09-30) ══════════ */
{
  const tag = '§F';
  const g = PKG_GROUPS[1];
  const stored = (u) => P.listUsers().find((x) => x.username === u)?.views;
  const m = await usersPane();
  const rowOf = (u) => findAll(m.tree, byName('UserRow')).find((x) => x.el.props.u.username === u)?.el.props;
  const save = () => { findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'saveBtn')[0].el.props.onClick({}); };

  /* (1) ХУУЧИН НООРОГ УРСГАЛТАЙ ХАРАГДАЦЫГ БУЦААЖ НЭЭХГҮЙ: ноорог үүссэний дараа урсгалын томилгоо
         хасагдвал «Хадгалах» нь ноорог дахь хуулбараас «Гүйцэтгэл»-ийг дахин бичдэг байв */
  const u = mkUser();
  await run(OPS.flowCellOp(u, 'engineer', g, true));
  ok(stored(u).includes('guitsetgel'), `${tag}: урсгал «Гүйцэтгэл»-ийг нээсэн`);
  m.render();
  rowOf(u).onFlipView('gdash'); m.render();
  ok(rowOf(u).dirty, `${tag}: ноорог`);
  const rm = await run(OPS.flowCellOp(u, 'engineer', g, false));
  ok(rm.ok && !stored(u).includes('guitsetgel'), `${tag}: томилгоо хасагдахад «Гүйцэтгэл» хаагдав`);
  m.render(); save();
  /* ⚠️ 2026-10-09: `idle()` зөвхөн aclOps-ийн pending-ийг хардаг — удаан runner дээр бичилт дуусахаас өмнө шалгагдахгүйн тулд хүлээгдэж буй төлөв тогтотол хүлээнэ (§E «Хадгалах»-тай ижил). */
  await settle(() => { m.render(); return fake.inflight > 0 || !!rowOf(u)?.dirty; });
  await idle(); m.render();
  await P.initRemote(false, true); await idle();
  ok(!stored(u).includes('guitsetgel'), `${tag}: хуучин ноорог «Гүйцэтгэл»-ийг БУЦААЖ нээхгүй (${stored(u)})`);
  ok(!stored(u).includes('gdash'), `${tag}: картын өөрчлөлт (gdash) хадгалагдав`);
  ok(!P.resolveAccess(u).views.includes('guitsetgel'), `${tag}: runtime-д ч хаалттай`);

  /* (2) Бөөнөөр preset — шатанд томилогдсон хүнд ХУДАЛ «Гүйцэтгэл хасагдана» асуулт гарахгүй */
  const u2 = mkUser();
  await run(OPS.flowCellOp(u2, 'engineer', g, true));
  m.render();
  rowOf(u2).onPick(true); m.render();
  const preset = (r) => findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'preset' && text(n) === RT.typeLabel(r))[0];
  takeConfirms();
  preset('injener').el.props.onClick({}); m.render();
  eq(takeConfirms(), [], `${tag}: бөөнөөр preset — худал асуулт алга`);
  ok(rowOf(u2).dirty && rowOf(u2).d.role === 'injener', `${tag}: бөөнөөр preset ноорогт`);
  save();
  await settle(() => { m.render(); return fake.inflight > 0 || !!rowOf(u2)?.dirty; });
  await idle(); m.render();
  /* ⚠️ 2026-10-01: хадгалалтад бичигдэхгүй ч томилгоогоор нээлттэй (`workflowViewsOf`) */
  ok(P.resolveAccess(u2).views.includes('guitsetgel'), `${tag}: бөөнөөр preset — томилгоогоор «Гүйцэтгэл» нээлттэй хэвээр`);

  /* (3) Хатуу super-ийг доошлуулахгүй — мөрийн сонгогч ба бөөнөөр preset */
  rowOf(SUPER).onRole('injener'); m.render();
  eq(rowOf(SUPER).dirty, false, `${tag}: хатуу super-т өөр үүрэг ноорогт орохгүй`);
  rowOf(SUPER).onPick(true); m.render();
  preset('menejer').el.props.onClick({}); m.render();
  eq(rowOf(SUPER).dirty, false, `${tag}: бөөнөөр preset хатуу super-ийг алгасна`);
  ok(alerts(m).some((a) => a.includes(SUPER)), `${tag}: алгассаныг ил хэлнэ`);

  /* (4) Ноорог үүссэний ДАРАА устгагдсан аккаунтыг «Хадгалах» АМИЛУУЛАХГҮЙ */
  const u3 = mkUser();
  rowOf(u3).onFlipView('gdash'); m.render();
  ok(rowOf(u3).dirty, `${tag}: ноорог (u3)`);
  const hard = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'tolovlolt')[0];
  rowOf(hard).onFlipView('gdash'); m.render();
  ok(await P.removeUser(u3), `${tag}: өөр админ u3-ийг устгав`);
  ok(await P.removeUser(hard), `${tag}: өөр админ хатуу аккаунтыг устгав (tombstone)`);
  await idle(); m.render();
  save();
  await settle(() => {
    m.render();
    return fake.inflight > 0 || !alerts(m).some((a) => a.includes(u3))
      || !findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'saveBtn')[0].el.props.disabled;
  });
  await idle(); m.render();
  await P.initRemote(false, true); await idle();
  eq(P.hasAccess(u3), false, `${tag}: устгагдсан панелийн аккаунт амилахгүй`);
  eq(fake.find(u3), [], `${tag}: ArcGIS-т мөр дахин үүсэхгүй`);
  ok(P.listRemoved().includes(hard) && !P.hasAccess(hard), `${tag}: tombstone хэвээр`);
  ok(alerts(m).some((a) => a.includes(u3)), `${tag}: алгассаныг ил хэлнэ`);
  eq(findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'saveBtn')[0].el.props.disabled, true, `${tag}: ноорог үлдэхгүй`);
  await P.clearOverride(hard); await idle();

  /* (5) Устгагдсан (tombstone-гүй) аккаунтын үлдсэн засах эрх нэрийг ДАХИН НЭМЭХИЙГ гацаадаг байв */
  const name = 'ui_orphan_caps';
  fake.seed([{ username: `__cap__:${name}`, views: JSON.stringify(['finRow', 'zovshoorol']) }]);
  await P.initRemote(false, true); await idle(); m.render();
  const input = findAll(m.tree, (n) => n.type === 'input' && n.props?.['aria-label'] === 'Шинэ хэрэглэгчийн нэр')[0];
  input.el.props.onChange({ target: { value: name } }); m.render();
  takeConfirms();
  findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'addBtn')[0].el.props.onClick({});
  /* ⚠️ 2026-10-01: өнчин эрхийн устгал `caps`-ийн замаар (aclOps-ийн pending-гүй) явдаг — idle()
     түүнийг хардаггүй тул удаан машинд (GitHub runner) устгал дуусахаас өмнө шалгагдаж байв. */
  await settle(() => fake.find(`__cap__:${name}`).length > 0);
  await idle(); m.render();
  const cf = takeConfirms();
  ok(cf.length === 1 && cf[0].includes(name) && cf[0].includes('Санхүү — мөр'), `${tag}: өнчин эрхийг нэрээр нь асууна (${cf.join(' | ')})`);
  eq(fake.find(`__cap__:${name}`), [], `${tag}: өнчин эрх ArcGIS-оос арилав`);
  eq(CAPS.capsOf(name), [], `${tag}: эрх хоосон`);
  ok(rowOf(name)?.d.isNew, `${tag}: шинэ аккаунт ноорогт нэмэгдэв`);
  console.log('✅ §F самбар: хуучин ноорог урсгалтай харагдацыг буцааж нээхгүй · бөөнөөр preset худал асуултгүй · super доошлохгүй · устгагдсан аккаунт амилахгүй · өнчин эрхтэй нэрийг дахин нэмнэ');
}

/* ══════════ §G. Үүргийн сонгогч — хуучин үүрэг ил, хатуу super идэвхгүй (2026-09-30) ══════════ */
{
  const tag = '§G';
  const presets = RT.TYPE_ORDER.map((r) => ({ key: r, label: RT.typeLabel(r) }));
  const props = (over) => ({
    u: { username: 'x_user', role: 'tolovlolt', views: [], docs: false, overridden: true },
    rowKey: 'x_user', d: { views: [], docs: false, role: 'tolovlolt' }, dirty: false, myName: null,
    rolePresets: presets, onRole: noop, onClear: noop, onFlipRemove: noop, superUser: false, ...over,
  });
  let m = mount(React.createElement(UserHeadActions, { p: props({}) }));
  let sel = findAll(m.tree, (n) => n.type === 'select')[0].el;
  const legacy = findAll(sel, (n) => n.type === 'option' && n.props.value === 'tolovlolt');
  ok(legacy.length === 1 && legacy[0].el.props.disabled, `${tag}: хуучин үүрэг (tolovlolt) идэвхгүй сонголтоор ил`);
  eq(text(legacy[0].el), RT.typeLabel('tolovlolt'), `${tag}: шошго`);
  eq(sel.props.value, 'tolovlolt', `${tag}: сонгогчийн утга = бодит үүрэг`);
  ok(!sel.props.disabled, `${tag}: энгийн аккаунтад идэвхтэй`);
  m = mount(React.createElement(UserHeadActions, { p: props({ superUser: true, d: { views: 'all', docs: true, role: 'super' } }) }));
  sel = findAll(m.tree, (n) => n.type === 'select')[0].el;
  ok(sel.props.disabled, `${tag}: хатуу super-т сонгогч идэвхгүй`);
  eq(findAll(sel, (n) => n.type === 'option' && n.props.disabled).length, 0, `${tag}: 10 төрөлд байгаа үүрэгт нэмэлт сонголтгүй`);
  console.log('✅ §G үүргийн сонгогч: хуучин үүрэг ил · хатуу super идэвхгүй');
}

/* ══════════ §H. Устгагдсан аккаунтын хуучин мөр — хуудсанд ✕ цэвэрлэнэ, гацааг нуухгүй (2026-09-30) ══════════ */
{
  const tag = '§H';
  const [p1, p2] = [PKG_GROUPS[6], PKG_GROUPS[7]];
  const ghost = 'ui_ghost_gone';
  const a = mkUser();
  await run(OPS.scopedCellOp('huvaari', a, 'author', p1, true));
  fake.seed([
    { username: `__huvaari__:${ghost}`, views: JSON.stringify({ roles: ['approver'], bagts: [p1, p2], grants: [{ role: 'approver', bagts: [p1, p2] }] }) },
  ]);
  await P.initRemote(false, true); await idle();
  const withGrid = (Comp) => findAll(mount(React.createElement(Comp), new Set([Comp.name, 'ScopedAclPanel'])).tree, byName('AclGrid'))[0].el.props;
  const grid = withGrid(HuvaariAcl);
  ok(grid.stuck(p1, 'approver', []), `${tag}: устгагдсан батлагч гацааг нуухгүй (батлагчийн нүд гацсан)`);
  ok(grid.rows.find((r) => r.key === p1).warn.length === 1, `${tag}: «батлагчгүй» анхааруулга`);
  ok(grid.holders(p1, 'approver').some((h) => h.user === ghost && h.gone), `${tag}: нүдэнд харагдсаар (gone)`);
  const src = OPS.liveErhSource();
  ok(src.gone.includes(ghost), `${tag}: liveErhSource.gone`);
  ok(pkgMatrix(src).find((r) => r.bagts === p1).issues.some((i) => i.key === 'huvaariNoApprover'), `${tag}: матриц/тойм ч гацааг харуулна`);
  /* ✕ — мөрийг бүхэлд нь, асуулгагүй, эрх үүсгэхгүй */
  const m = mount(React.createElement(HuvaariAcl), new Set(['HuvaariAcl', 'ScopedAclPanel', 'AclGrid', 'Chip']));
  takeConfirms();
  clickX(m, p1, 'approver', ghost);
  await idle();
  eq(takeConfirms(), [], `${tag}: устгагдсан аккаунтын ✕ асуулгагүй`);
  ok(!HV.listHuvaariAssigns().some((x) => x.user === ghost), `${tag}: мөр бүхэлдээ хасагдав (${p2} ч)`);
  eq(fake.find(`__huvaari__:${ghost}`), [], `${tag}: ArcGIS мөр алга`);
  eq(fake.find(`__cap__:${ghost}`), [], `${tag}: устгагдсан аккаунтад эрхийн мөр үүсээгүй`);
  /* Урсгал: устгагдсан аккаунт ганцаараа эзэн бол нүд гацсан */
  const fg = withGrid(GuitsetgelAcl);
  ok(fg.stuck(p1, 'engineer', [{ user: ghost, viaAll: false, gone: true, failed: false, dirty: false }]), `${tag}: урсгал — устгагдсан эзэн гацааг нуухгүй`);
  console.log('✅ §H устгагдсан аккаунт: гацааг нуухгүй (хуудас · матриц) · ✕ мөрийг бүхэлд нь цэвэрлэж эрх үүсгэхгүй');
}

/* ══════════ §I. Засварын UI (2026-10-01, «хэрэглэгч: бүгдийг зас») ══════════
 *   (1) картын урсгалтай 6 хуудас — эх сурвалж · холбоос · «Дахин олгох»
 *   (2) хуудасны «Дахин илгээх» (унасан бичилт) · устгагдсан аккаунтын «Цэвэрлэх»
 *   (3) матриц — устгагдсан · админ тэмдэг
 *   (4) шинэ аккаунт — одоогийн төрөл (`NEW_ACCOUNT_ROLE`)
 *   (5) «Эрхийн төрөл» — «шинэ хуудас — загварт тохируулаагүй» */
{
  const tag = '§I';
  const { UserWorkflow } = await import('@/components/UserWorkflow.tsx');
  const { AclRepairNote } = await import('@/modules/AclRepairNote.tsx');
  const { ErhMatrix } = await import('@/modules/ErhMatrix.tsx');
  const { ErhTypes } = await import('@/modules/ErhTypes.tsx');
  const { paneLabel } = await import('@/modules/capText.ts');
  const btn = (m, re) => findAll(m.tree, (n) => n.type === 'button' && re.test(text(n))).map((x) => x.el);
  const [p1] = [PKG_GROUPS[8]];

  /* (1) карт */
  const u = mkUser();
  await run(OPS.flowCellOp(u, 'engineer', p1, true));
  await run(OPS.scopedCellOp('huvaari', u, 'author', p1, true));
  const went = [];
  let m = mount(React.createElement(UserWorkflow, { user: u, onGo: (p) => went.push(p) }));
  const rowsTxt = findAll(m.tree, (n) => n.props?.className === 'wfRow').map((x) => text(x.el));
  eq(rowsTxt.length, WORKFLOW_VIEWS.length, `${tag}: урсгалтай ${WORKFLOW_VIEWS.length} мөр`);
  const src = btn(m, new RegExp(`${paneLabel('huvaari')} · Зохиогч · ${p1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  ok(src.length === 1, `${tag}: «Хуваарийн эрх · Зохиогч · ${p1}» эх сурвалж (${rowsTxt.join(' | ')})`);
  src[0].props.onClick({});
  eq(went, ['huvaari'], `${tag}: эх сурвалж → Хуваарийн эрх хуудас`);
  ok(btn(m, new RegExp(paneLabel('guits'))).length >= 1, `${tag}: «Гүйцэтгэл» ← урсгалын эрх`);
  eq(btn(m, /Дахин олгох/).length, 0, `${tag}: эрх бүрэн — «Дахин олгох» алга`);
  await CAPS.setCaps(u, CAPS.capsStored(u).filter((c) => c !== 'plan')); await idle();
  m = mount(React.createElement(UserWorkflow, { user: u, onGo: noop }));
  const re = btn(m, /Дахин олгох/);
  ok(re.length === 1, `${tag}: эрх алга → «Дахин олгох»`);
  ok(!P.resolveAccess(u).views.includes('huvaari'), `${tag}: эрхгүй үед «Хуваарь» хаалттай`);
  re[0].props.onClick({});
  await idle();
  ok(CAPS.capsOf(u).includes('plan') && P.resolveAccess(u).views.includes('huvaari'), `${tag}: «Дахин олгох» → эрх ба хуудас сэргэв`);

  /* (2) «Дахин илгээх» */
  const f = mkUser();
  fake.failWrites = true;
  await run(OPS.scopedCellOp('obyem', f, 'editor', p1, true));
  fake.failWrites = false;
  ok(OB.obyemFailedUsers().includes(f), `${tag}: бичилт унасан`);
  m = mount(React.createElement(AclRepairNote, { pane: 'obyem' }));
  const rb = findAll(m.tree, (n) => n.type === 'button' && text(n) === 'Дахин илгээх').map((x) => x.el);
  ok(rb.length >= 1, `${tag}: «Дахин илгээх» товч`);
  rb[0].props.onClick({});
  await settle(() => { m.render?.(); return fake.inflight > 0 || OB.obyemFailedUsers().includes(f) || fake.json('__obyem__:', f)?.grants?.length !== 1; });
  await idle();
  ok(!OB.obyemFailedUsers().includes(f) && fake.json('__obyem__:', f)?.grants?.length === 1, `${tag}: дахин илгээгдэв`);
  /* устгагдсан аккаунтын энгийн эрх — «Зөвшөөрөл» хуудсанд л харагдах ёстой */
  const ghost = 'ui_ghost_caps';
  fake.seed([{ username: `__cap__:${ghost}`, views: JSON.stringify(['zovshoorol']) }]);
  await P.initRemote(false, true); await idle();
  m = mount(React.createElement(AclRepairNote, { pane: 'zovshoorol' }));
  ok(alerts(m).some((a) => a.includes(ghost)), `${tag}: устгагдсан аккаунтын үлдэгдэл жагсаагдав`);
  btn(m, /^Цэвэрлэх$/)[0].props.onClick({});
  await settle(() => { m.render?.(); return fake.inflight > 0 || fake.find(`__cap__:${ghost}`).length > 0; });
  await idle();
  eq(fake.find(`__cap__:${ghost}`), [], `${tag}: «Цэвэрлэх» → ArcGIS-оос арилав`);

  /* (3) матриц — устгагдсан · админ */
  const g2 = 'ui_ghost_matrix';
  fake.seed([{ username: `__huvaari__:${g2}`, views: JSON.stringify({ roles: ['approver'], bagts: [p1], grants: [{ role: 'approver', bagts: [p1] }] }) }]);
  await P.initRemote(false, true); await idle();
  m = mount(React.createElement(ErhMatrix, { src: OPS.liveErhSource(), locked: false, drafts: new Map() }));
  ok(findAll(m.tree, (n) => n.type === 'span' && /aclGoneName/.test(n.props?.className ?? '') && text(n).startsWith(g2)).length >= 1,
    `${tag}: матрицад устгагдсан аккаунт тэмдэглэгдэв`);
  await run(OPS.goneCleanupOp('huvaari', ['plan', 'planApprove'], g2));

  /* (4) шинэ аккаунт — одоогийн төрөл */
  const pane = await usersPane();
  const nm = 'ui_new_default';
  findAll(pane.tree, (n) => n.type === 'input' && n.props?.['aria-label'] === 'Шинэ хэрэглэгчийн нэр')[0].el.props.onChange({ target: { value: nm } });
  pane.render();
  findAll(pane.tree, (n) => n.type === 'button' && n.props?.className === 'addBtn')[0].el.props.onClick({});
  pane.render();
  const nr = findAll(pane.tree, byName('UserRow')).find((x) => x.el.props.u.username === nm)?.el.props;
  ok(nr?.d.isNew, `${tag}: шинэ аккаунт ноорогт`);
  eq(nr.d.role, RT.NEW_ACCOUNT_ROLE, `${tag}: анхдагч төрөл = ${RT.NEW_ACCOUNT_ROLE} (хуучин tolovlolt биш)`);
  ok(Array.isArray(nr.d.views) && !nr.d.views.some((v) => WORKFLOW_VIEWS.includes(v)), `${tag}: урсгалтай харагдацгүй`);

  /* (5) «Эрхийн төрөл» — seen-гүй хадгалсан загварт «ТУХ» шинэ */
  fake.seed([{ username: '__type__:injener', views: JSON.stringify({ on: ['view:gdash'], home: 'gdash' }) }]);
  await P.initRemote(false, true); await idle();
  eq(RT.unseenViews('injener'), ['tuh'], `${tag}: хадгалсан загвар ТУХ-ыг мэдэхгүй`);
  m = mount(React.createElement(ErhTypes), new Set(['ErhTypes', 'Group']));
  const badge = btn(m, /шинэ хуудас — загварт тохируулаагүй/);
  ok(badge.length === 1, `${tag}: баганын «шинэ хуудас» тэмдэг (${badge.length})`);
  ok(findAll(m.tree, (n) => n.type === 'span' && text(n) === 'шинэ хуудас — загварт тохируулаагүй').length === 1, `${tag}: мөрийн тэмдэг`);
  badge[0].props.onClick({}); m.render();
  eq(btn(m, /шинэ хуудас — загварт тохируулаагүй/).length, 0, `${tag}: дарахад ноорогт «тохируулсан»`);
  const saveB = findAll(m.tree, (n) => n.type === 'button' && n.props?.className === 'saveBtn')[0].el;
  ok(!saveB.props.disabled, `${tag}: «Хадгалах» идэвхтэй`);
  saveB.props.onClick({});
  /* ⚠️ 2026-10-09: хамгийн эрсдэлтэй — ErhTypes «Хадгалах» нь `__type__:injener`-ийг бичнэ; seen бичигдтэл хүлээнэ */
  await settle(() => { m.render?.(); return fake.inflight > 0 || !Array.isArray(fake.json('__type__:', 'injener')?.seen) || RT.unseenViews('injener').length > 0; });
  await idle(); m.render();
  eq(RT.unseenViews('injener'), [], `${tag}: хадгалсны дараа тэмдэг арилав`);
  ok(Array.isArray(fake.json('__type__:', 'injener')?.seen), `${tag}: ArcGIS-т seen бичигдэв`);
  console.log('✅ §I засварын UI: картын урсгалтай хуудас · «Дахин олгох» · «Дахин илгээх» · устгагдсаны «Цэвэрлэх» · матрицын тэмдэг · шинэ аккаунтын төрөл · «шинэ хуудас» тэмдэг');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ aclE2E.ui: ${checks} шалгалт — бүгд давлаа`);
