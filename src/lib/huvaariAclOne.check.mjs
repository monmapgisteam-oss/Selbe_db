/**
 * ХУВААРЬ — НЭГ БАГЦАД НЭГ ЗОХИОГЧ, НЭГ БАТЛАГЧ (2026-11-18, хэрэглэгч).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariAclOne.check.mjs
 */
import assert from 'node:assert/strict';
import { planRoleConflict, ALL_BAGTS } from './huvaariAcl.ts';

const A = (user, ...grants) => ({ user, grants: grants.map(([role, ...bagts]) => ({ role, bagts })) });
const others = [
  A('bat', ['author', 'Багц 1', 'Багц 2']),
  A('dorj', ['approver', 'Багц 1']),
  A('suren', ['author', 'Багц 3.1'], ['approver', 'Багц 2']),
];
const g = (role, ...bagts) => [{ role, bagts }];

assert.deepEqual(planRoleConflict(g('author', 'Багц 1'), others), { role: 'author', bagts: 'Багц 1', user: 'bat' }, 'Багц 1-д зохиогч бий');
assert.deepEqual(planRoleConflict(g('author', 'Багц 5.1', 'Багц 2'), others), { role: 'author', bagts: 'Багц 2', user: 'bat' }, 'олон багцаас давхцсан нь');
assert.equal(planRoleConflict(g('author', 'Багц 4-1'), others), null, 'зохиогчгүй багц — зөвшөөрнө');
assert.equal(planRoleConflict(g('approver', 'Багц 3.1'), others), null, 'өөр үүрэг давхцахгүй (Багц 3.1-д зохиогч л бий)');
assert.deepEqual(planRoleConflict(g('approver', 'Багц 2'), others), { role: 'approver', bagts: 'Багц 2', user: 'suren' });
/* нэг хүн нэг багцад зохиогч + батлагч хоёулаа байж болно (өөр үүрэг) */
assert.equal(planRoleConflict([{ role: 'author', bagts: ['Багц 6.1'] }, { role: 'approver', bagts: ['Багц 6.1'] }], others), null);
/* «бүх багц» нь багц бүртэй давхцана */
assert.deepEqual(planRoleConflict(g('author', ALL_BAGTS), others), { role: 'author', bagts: 'Багц 1', user: 'bat' }, 'бүх багц ↔ бусдын багц');
assert.deepEqual(planRoleConflict(g('approver', 'Багц 7.1'), [A('all', ['approver', ALL_BAGTS])]), { role: 'approver', bagts: 'Багц 7.1', user: 'all' }, 'бусад нь бүх багцтай');
assert.deepEqual(planRoleConflict(g('author', ALL_BAGTS), [A('all', ['author', ALL_BAGTS])]), { role: 'author', bagts: ALL_BAGTS, user: 'all' });
/* хоосон жагсаалт, бусад аккаунтгүй */
assert.equal(planRoleConflict(g('author', 'Багц 1'), []), null);
assert.equal(planRoleConflict([], others), null);

console.log('huvaariAclOne.check: бүгд ✅');

/* ── Жинхэнэ хадгалах зам (`setHuvaariGrants`) дүрмийг мөрдөнө ── */
{
  const H = await import('./huvaariAcl.ts');
  const a = H.setHuvaariGrants('one_rule_a', [{ role: 'author', bagts: ['Багц 1'] }], false);
  assert.equal(a.ok, true, 'эхний зохиогч томилогдоно');
  const b = H.setHuvaariGrants('one_rule_b', [{ role: 'author', bagts: ['Багц 1', 'Багц 2'] }], false);
  assert.equal(b.ok, false, 'хоёр дахь зохиогч ижил багцад томилогдохгүй');
  assert.match(b.error, /Багц 1/); assert.match(b.error, /one_rule_a/);
  assert.equal(H.listHuvaariAssigns().some((x) => x.user === 'one_rule_b'), false, 'татгалзсан хуваарилалт хадгалагдаагүй');
  assert.equal(H.setHuvaariGrants('one_rule_b', [{ role: 'approver', bagts: ['Багц 1'] }], false).ok, true, 'өөр үүрэг (батлагч) болно');
  assert.equal(H.setHuvaariGrants('one_rule_c', [{ role: 'approver', bagts: [H.ALL_BAGTS] }], false).ok, false, '«бүх багц» батлагч — Багц 1-д батлагч бий');
  /* өөрийнхөө хуваарилалтыг өөрчлөх нь зөрчил биш */
  assert.equal(H.setHuvaariGrants('one_rule_a', [{ role: 'author', bagts: ['Багц 1', 'Багц 2'] }], false).ok, true);
  console.log('huvaariAclOne.check: хадгалах зам ✅');
}
