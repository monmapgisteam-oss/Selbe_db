/**
 * ЭРХИЙН ТӨРЛИЙН ЗАГВАР — ЗӨВХӨН ХАРАХ (2026-09-30, хэрэглэгчийн шийдвэр).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/roleTypes.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. `settingGroups()` нь ЗӨВХӨН `view:*` · `docs` · `admin` мөртэй — засах эрх
 *      (`cap:*`), чанарын үүрэг (`chanar:*`), урсгал (`flow:*`) ОРОХГҮЙ.
 *   2. Хүснэгтэд хадгалсан ХУУЧИН загварын `cap:*` · `chanar:*` · `flow:*` id
 *      `cleanTpl`-ээр чимээгүй хаягдана (fail-closed), `scope` ч хаягдана.
 *   3. `roleAccess` нь харагдац · баримт · нүүр цонх л буцаана; super үргэлж 'all'.
 *   4. `roleTypeApply` нь хуваарилалт / `__cap__:` бичих замгүй — `aclOps`,
 *      `caps.toggleCap`, `set*Assign` импортлохгүй (эх кодоор тулгана).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* `services` → `butetsPacks` зэрэг нь window/localStorage хүлээдэг — бусад шалгуурын ижил shim */
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const { settingGroups, cleanTpl, roleAccess, TYPE_ORDER, _syncRemoteTypes, tplOf } = await import('@/lib/roleTypes.ts');
const { VIEWS } = await import('@/lib/services.ts');
const { WORKFLOW_VIEWS } = await import('@/lib/caps.ts');

/* ── 1. Каталог — зөвхөн харах мөрүүд ── */
{
  const ids = settingGroups().flatMap((g) => g.rows.map((r) => r.id));
  const bad = ids.filter((id) => /^(cap|chanar|flow):/.test(id));
  assert.deepEqual(bad, [], `засах эрхийн мөр загварт буцаж ирэв: ${bad.join(', ')}`);
  /* ⚠️ 2026-09-30: урсгалтай 6 харагдац загварт ОРОХГҮЙ — урсгалын хуваарилалтаар нээгдэнэ */
  /* ⚠️ 2026-10-09: + «ma» (MA — чанарын эрхийн гэр харагдац, «chanar»-тай адил урсгалтай) */
  assert.deepEqual([...WORKFLOW_VIEWS].sort(), ['ajilBatlah', 'chanar', 'guitsetgel', 'huvaari', 'huvaariBatlah', 'ma', 'qaqc'],
    'WORKFLOW_VIEWS ≠ урсгалтай 7 харагдац');
  /* ⚠️ 2026-09-30 (merge irgediin-hurteemj): «ТУХ» нэмэгдэж 24 болсон — тоог хатуу бичихгүй.
     Шалгуурын утга: урсгалтай харагдац VIEWS-ээс ХАСАГДААГҮЙ (зөвхөн унтраалгаас шүүгдэнэ). */
  for (const k of WORKFLOW_VIEWS) assert.ok(VIEWS.some((v) => v.key === k), `VIEWS-ээс урсгалтай харагдац хасагдсан: ${k}`);
  for (const v of VIEWS) {
    if (WORKFLOW_VIEWS.includes(v.key)) assert.ok(!ids.includes(`view:${v.key}`), `view:${v.key} — урсгалтай харагдац загварт буцаж ирэв`);
    else assert.ok(ids.includes(`view:${v.key}`), `view:${v.key} каталогт алга`);
  }
  assert.ok(ids.includes('docs') && ids.includes('admin'), 'docs · admin мөр алга');
  assert.equal(ids.length, VIEWS.length - WORKFLOW_VIEWS.length + 2, 'каталог = харагдац − урсгалтай 6 + docs + admin');
  /* хадгалсан хуучин загварын урсгалтай харагдац хаягдана; roleAccess ч агуулахгүй */
  assert.ok(!cleanTpl('injener', { on: ['view:gdash', 'view:guitsetgel', 'view:huvaari'], home: 'gdash' }).on.includes('view:guitsetgel'));
  for (const r of TYPE_ORDER) {
    const a = roleAccess(r);
    if (a.views !== 'all') for (const v of a.views) assert.ok(!WORKFLOW_VIEWS.includes(v), `roleAccess(${r}) урсгалтай харагдац агуулна: ${v}`);
  }
}
console.log('✅ settingGroups — зөвхөн view:* · docs · admin');

/* ── 2. Хуучин загварын id хаягдана ── */
{
  const t = cleanTpl('injener', {
    on: ['view:gdash', 'docs', 'cap:plan', 'cap:obyemEdit', 'chanar:tuh', 'flow:act', 'flow:viewOnly', 'cap:zovshoorol', 'admin', 'view:nope'],
    home: 'gdash', scope: 'all',
  });
  assert.ok(t, 'cleanTpl null буцаав');
  assert.deepEqual(t.on, ['view:gdash', 'docs'], `хуучин id хаягдсангүй: ${t.on.join(', ')}`);
  assert.equal('scope' in t, false, 'scope талбар хаягдах ёстой');
  /* admin зөвхөн super-т */
  assert.ok(cleanTpl('super', { on: ['admin'], home: 'gdash' }).on.includes('admin'));
  /* урсгалын id байсан ч `view:guitsetgel` албадахгүй — `grantFlowAccess` өөрөө нэмдэг */
  assert.ok(!cleanTpl('guitsetgegch', { on: ['flow:act'], home: 'gdash' }).on.includes('view:guitsetgel'));
}
console.log('✅ cleanTpl — cap:* · chanar:* · flow:* · scope хаягдана');

/* ── 3. roleAccess — харагдац · баримт · нүүр цонх ── */
{
  _syncRemoteTypes([{ role: 'menejer', tpl: { on: ['view:gdash', 'view:plan', 'docs', 'cap:planApprove'], home: 'plan' } }]);
  const a = roleAccess('menejer');
  assert.deepEqual(a.views, ['gdash', 'plan']);
  assert.equal(a.docs, true);
  assert.equal(a.home, 'plan');
  assert.deepEqual(Object.keys(a).sort(), ['docs', 'home', 'views']);
  assert.equal(roleAccess('super').views, 'all', 'super үргэлж бүх харагдац');
  for (const r of TYPE_ORDER) {
    const t = tplOf(r);
    assert.ok(t.on.every((id) => /^view:|^docs$|^admin$/.test(id)), `${r}: анхдагч загварт харахаас өөр id байна`);
  }
}
console.log('✅ roleAccess — зөвхөн views · docs · home; анхдагч загвар цэвэр');

/* ── 4. roleTypeApply — хуваарилалт бичих замгүй (эх код) ── */
{
  const src = fs.readFileSync('src/lib/roleTypeApply.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  for (const banned of ['aclOps', 'toggleCap', 'setAssign', 'setQaqcAssign', 'setGrants', 'removeAssign', 'SCOPED_SETTING', 'PLAIN_SETTING', 'SUPER_CAP', 'PkgSel']) {
    assert.ok(!src.includes(banned), `roleTypeApply: «${banned}» буцаж ирэв — загвар засах эрх/хуваарилалт бичих ёсгүй`);
  }
  assert.ok(src.includes('setUser(u, { views, docs: acc.docs }, role)'), 'roleTypeApply: харагдацын бичилт setUser-ээр байх ёстой');
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): урсгалтай харагдац ЗӨВХӨН хуваарилалтаар
     (`permissions.workflowViewsOf`) — «Төрлөөр тохируулах» тэдгээрийг БИЧИХГҮЙ (2026-09-30-ны
     «хэвээр үлдээх» шийдвэрийг сольсон). */
  assert.ok(!src.includes('cur.filter((v) => WORKFLOW_VIEWS.includes(v))'), 'roleTypeApply: урсгалтай харагдацыг хадгалж үлдээх замыг буцааж нэмэв');
  assert.ok(src.includes('acc.views.filter((v) => !WORKFLOW_VIEWS.includes(v))'), 'roleTypeApply: урсгалтай харагдацыг хадгалахгүй байх ёстой');
  const ui = fs.readFileSync('src/modules/ErhTypes.tsx', 'utf8');
  assert.ok(!ui.includes('tt-scope-'), 'ErhTypes: «Багцын хамрах хүрээ» мөр буцаж ирэв');
}
console.log('✅ roleTypeApply — зөвхөн setUser; ErhTypes-д scope мөр алга');

/* ── 5. «Шинэ хуудас — загварт тохируулаагүй» (2026-10-01, «хэрэглэгч: бүгдийг зас») ──
   ⚠️ `on` нь чеклэснийг л хадгалдаг тул загвар хадгалсны ДАРАА нэмэгдсэн хуудас («ТУХ»)
      чимээгүй «хаалттай» болдог байв. `seen` (хадгалах агшны каталог) ба хуучин мөрийн
      `LEGACY_SEEN` (ТУХ-аас бусад) нь тэр хуудсыг ялгана. */
{
  const { unseenViews, tplViewKeys, saveTpl, isStoredTpl, NEW_ACCOUNT_ROLE, isTypeRole } = await import('@/lib/roleTypes.ts');
  /* cleanTpl — `seen` хадгалагдана, танигдахгүй түлхүүр хаягдана; массивгүй бол undefined (хуучин мөр) */
  const c = cleanTpl('injener', { on: ['view:gdash'], home: 'gdash', seen: ['gdash', 'nope', 'tuh'] });
  assert.deepEqual(c.seen, ['gdash', 'tuh'], `seen шүүлт: ${c.seen}`);
  assert.equal(cleanTpl('injener', { on: [], home: 'gdash' }).seen, undefined, 'seen-гүй мөр → undefined');
  /* хуучин (seen-гүй) хадгалсан загвар → ЗӨВХӨН «ТУХ» шинэ */
  _syncRemoteTypes([
    { role: 'injener', tpl: { on: ['view:gdash'], home: 'gdash' } },
    { role: 'menejer', tpl: { on: ['view:gdash'], home: 'gdash', seen: tplViewKeys().filter((k) => k !== 'plan') } },
    { role: 'eronhii', tpl: { on: ['view:gdash'], home: 'gdash', seen: tplViewKeys() } },
  ]);
  assert.ok(tplViewKeys().includes('tuh'), 'ТУХ загварын каталогт байх ёстой');
  assert.deepEqual(unseenViews('injener'), ['tuh'], `хуучин загвар — зөвхөн ТУХ шинэ: ${unseenViews('injener')}`);
  assert.deepEqual(unseenViews('menejer'), ['plan'], 'seen-д байхгүй харагдац шинэ');
  assert.deepEqual(unseenViews('eronhii'), [], 'бүгдийг мэдсэн загварт тэмдэг алга');
  assert.ok(!isStoredTpl('gazar') && unseenViews('gazar').length === 0, 'анхдагч (хадгалаагүй) загварт тэмдэг алга');
  assert.deepEqual(unseenViews('super'), [], 'super — тэмдэг алга');
  assert.deepEqual(tplOf('menejer').seen?.length, tplViewKeys().length - 1, 'tplOf seen-ийг хуулна');
  /* saveTpl — сүлжээгүй тул унана (false), гэхдээ seen-ийг ЗААВАЛ бичих ёстой — эх кодоор */
  assert.equal(await saveTpl('injener', { on: ['view:gdash'], home: 'gdash' }), false, 'сүлжээгүй — false');
  const rt = fs.readFileSync('src/lib/roleTypes.ts', 'utf8');
  assert.ok(rt.includes('const clean: TypeTpl = { ...cleaned, seen: tplViewKeys() };'), 'saveTpl: seen = одоогийн каталог');
  /* ErhTypes — баганын/мөрийн тэмдэг */
  const ui = fs.readFileSync('src/modules/ErhTypes.tsx', 'utf8');
  assert.ok(ui.includes("tr('шинэ хуудас — загварт тохируулаагүй')") && ui.includes('unseenOf(r)'), 'ErhTypes: «шинэ хуудас» тэмдэг алга');
  /* Шинэ аккаунтын анхдагч — одоогийн төрөл (хуучин tolovlolt БИШ) */
  assert.ok(isTypeRole(NEW_ACCOUNT_ROLE) && NEW_ACCOUNT_ROLE !== 'super', `NEW_ACCOUNT_ROLE төрлийн жагсаалтад байх ёстой: ${NEW_ACCOUNT_ROLE}`);
  const ua = fs.readFileSync('src/components/UserAdmin.tsx', 'utf8');
  assert.ok(ua.includes('role: NEW_ACCOUNT_ROLE, isNew: true') && !ua.includes("role: 'tolovlolt', isNew: true"), 'UserAdmin.add: шинэ аккаунт NEW_ACCOUNT_ROLE-тэй');
}
console.log('✅ шинэ хуудас — загварт тохируулаагүй (seen · LEGACY_SEEN) · шинэ аккаунтын төрөл');

console.log('roleTypes.check: ok');
