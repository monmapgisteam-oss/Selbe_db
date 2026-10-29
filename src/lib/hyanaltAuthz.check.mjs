/**
 * ХЯНАЛТЫН ЭРХИЙН ЦЭВЭР ХЭСГҮҮД — илгээгчийн дүрэм ба «хариу алдагдсан» ангилал. Сүлжээгүй, `window`-гүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/hyanaltAuthz.check.mjs
 */
import assert from 'node:assert/strict';
import { approvedStagesOf, lostWrite, selfApprovalDeny, submitterDeny } from './hyanaltStore.ts';
import { F, SF } from './hyanalt.ts';
import { HyanaltError } from './hyanalt.ts';
import { ArcGISError } from './query.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

console.log('submitterDeny (authz.submitters):');
ok('инженер илгээгчдийн дунд → татгалзана', () => {
  assert.equal(typeof submitterDeny('engineer', 'bat', ['dorj', 'bat']), 'string');
});
ok('инженер илгээгч биш → зөвшөөрнө', () => {
  assert.equal(submitterDeny('engineer', 'bat', ['dorj']), null);
});
ok('2026-10-19: инженерээс бусад шатанд ч илгээгч → татгалзана (super компани болж илгээсэн ч)', () => {
  for (const st of ['manager', 'planner', 'director', 'head', 'chief']) {
    assert.equal(typeof submitterDeny(st, 'bat', ['bat']), 'string', st);
    assert.equal(submitterDeny(st, 'bat', ['dorj']), null, st);
  }
});
ok('хуучин мөр (илгээгчгүй — undefined / []) → шалгахгүй', () => {
  assert.equal(submitterDeny('engineer', 'bat', undefined), null);
  assert.equal(submitterDeny('engineer', 'bat', []), null);
});

console.log('selfApprovalDeny (нэг тойрогт хоёр шат):');
const ev = (stage, act, u, at) => ({ stage, who: u ? u.toUpperCase() : 'X', at, act, ...(u ? { u } : {}) });
const H = (...es) => JSON.stringify(es);
ok('approvedStagesOf — зөвхөн ЗӨВШӨӨРСӨН (approve · recheck-ok), тухайн дансны, давхардалгүй', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'return', 'bat', 2), ev('engineer', 'recheck-ok', 'bat', 3),
    ev('director', 'approve', 'dorj', 4));
  assert.deepEqual(approvedStagesOf(h, 'BAT '), ['engineer']);
  assert.deepEqual(approvedStagesOf(h, 'dorj'), ['director']);
  assert.deepEqual(approvedStagesOf('эвдэрсэн', 'bat'), []);
});
ok('инженерээр баталсан данс шат шилжээд төлөвлөлтийн ахлах инженер (director) болж ДАХИН батлахгүй (аудит №5)', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'approve', 'dorj', 2));
  assert.equal(typeof selfApprovalDeny('director', 'bat', h), 'string');
  assert.match(selfApprovalDeny('director', 'bat', h), /хоёр шатанд/);
  assert.equal(selfApprovalDeny('director', 'tsetseg', h), null, 'өөр данс → чөлөөтэй');
});
ok('дараалсан шат — урьдын «өмнөх шат» мессеж', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1));
  assert.match(selfApprovalDeny('manager', 'bat', h), /Өмнөх шатыг/);
});
ok('ИЖИЛ шатыг дахин (дээд шат буцаасны дараа) батлах — хэвийн', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'return', 'dorj', 2));
  assert.equal(selfApprovalDeny('engineer', 'bat', h), null);
});
ok('цэвэр дүрэм хэнийг ч ялгахгүй — нэг дансаар дараалсан шат: 2 дахь шатнаас татгалзана (аудит №4)', () => {
  const h = H(ev('engineer', 'approve', 'boss', 1));
  for (const st of ['manager', 'planner', 'director', 'head', 'chief']) assert.equal(typeof selfApprovalDeny(st, 'boss', h), 'string', st);
  assert.equal(typeof selfApprovalDeny('engineer', 'boss', H(), undefined, ['boss']), 'string', 'илгээгч өөрөө батлах');
});
ok('буцаах чиглэл (hist undefined) — зөвхөн илгээгчийн дүрэм', () => {
  assert.equal(selfApprovalDeny('chief', 'bat', undefined), null);
});
ok('`u`-гүй лог (R5): доод шатуудын дэлгэцийн нэрээр нөөц — ӨМНӨХ ба ТҮҮНЭЭС ДООШ', () => {
  const row = { [SF.engineer.who]: 'Бат', [SF.manager.who]: 'Дорж', [F.history]: '' };
  assert.match(selfApprovalDeny('planner', 'x', '', { row, who: ' бат ' }), /хоёр шатанд/, 'инженерийн нэр');
  assert.match(selfApprovalDeny('planner', 'x', '', { row, who: 'Дорж' }), /Өмнөх шатыг/, 'менежерийн нэр');
  assert.equal(selfApprovalDeny('planner', 'x', '', { row, who: 'Цэцэг' }), null);
  /* `u`-тай зөвшөөрөл байгаа шатанд нэрээр шалгахгүй (нэр давхцах эрсдэлгүй) */
  const h = H(ev('engineer', 'approve', 'bat2', 1));
  assert.equal(selfApprovalDeny('planner', 'x', h, { row, who: 'Бат' }), null);
  const row2 = { ...row, [SF.planner.who]: 'Сараа' };
  assert.match(selfApprovalDeny('director', 'x', '', { row: row2, who: 'Сараа' }), /Өмнөх шатыг/, 'төлөвлөлтийн инженерийн нэр');
  assert.match(selfApprovalDeny('director', 'x', '', { row: row2, who: 'Дорж' }), /хоёр шатанд/, 'менежерийн нэр (доод)');
});
{
  const S = (await import('node:fs')).readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  ok('authz: super bypass → бүрэн чөлөөтэй, дараалан батална (2026-10-26)', () => {
    assert.ok(S.includes('  if (by) return null;'), 'super bypass салаа бүрэн чөлөөтэй биш');
    assert.ok(!S.includes('if (by) return AUTH.appId && u ? selfApprovalDeny('), 'super-т өөрийгөө батлах дүрэм буцаж орсон');
    assert.ok(S.includes('return selfApprovalDeny(stage, u, hist, same, submitters);'), 'энгийн хэрэглэгчийн дүрэм алга');
  });
  ok('submittersFor: super (bypass) илгээгчийг уншихгүй (2026-10-26)', () => {
    const fn = S.slice(S.indexOf('async function submittersFor('), S.indexOf('async function submittersOfRow('));
    assert.ok(!fn.includes("stage !== 'engineer'"), fn);
    assert.ok(fn.includes("if (_bypass && roleForUser(meOf(me)) === 'super') return { ok: true };"), 'super-ийн илгээгч чөлөөлөлт алга');
    assert.ok(!fn.includes('if (_bypass) return { ok: true };'), 'нүцгэн `_bypass` чөлөөлөлт — энгийн хэрэглэгч илгээгчийн шалгалтгүй үлдэнэ');
    assert.ok(fn.includes("if (typeof window === 'undefined' || !AUTH.appId || !meOf(me)) return { ok: true };"), fn);
  });
  ok('authz: «Ерөнхий захирал» шийдвэр гаргахгүй (томилгоотой байсан ч) — 2026-10-23', () => {
    const az = S.slice(S.indexOf('function authz('), S.indexOf('const SAME_ROUND_MSG'));
    assert.ok(az.includes("if (roleOf(u) === 'zahiral') return tr("), 'authz-д захиралын хориг алга');
    assert.ok(az.indexOf("roleOf(u) === 'zahiral'") < az.indexOf('stageOfUser(u) !== stage'), 'хориг томилгооны шалгалтаас ӨМНӨ байх ёстой');
  });
  ok('countReviewPending: захирал 0 · шаттай super-т хүрээ хязгааргүй (2026-10-23)', () => {
    const fn = S.slice(S.indexOf('export async function countReviewPending('), S.indexOf('const blocked = await selfBlocks(ws, me, stage);'));
    assert.ok(/if \(role === 'zahiral'\) return 0;/.test(fn), 'захиралыг батлагчаар тоолж байна');
    assert.ok(fn.includes("const sc = role === 'super' ? null : bagtsFor(me, stage);"), 'super-ийн тэмдэг зөвхөн томилсон багцыг тоолж байна (жагсаалтаас зөрнө)');
  });
  const SUB = (await import('node:fs')).readFileSync('src/lib/submission.ts', 'utf8').replace(/\r\n/g, '\n');
  ok('companyDeny · chiefDeny: «Ерөнхий захирал» илгээхгүй (томилгоотой байсан ч) — 2026-10-23', () => {
    for (const name of ['companyDeny', 'chiefDeny']) {
      const at = SUB.indexOf(`export async function ${name}(`);
      const fn = SUB.slice(at, SUB.indexOf('\n}\n', at));
      const z = fn.indexOf('if (await isZahiralUser(me)) return ZAHIRAL_DENY();');
      assert.ok(z > 0 && z < fn.indexOf('bagtsFor(me,'), `${name}: захиралын хориг томилгооны шалгалтаас ӨМНӨ алга`);
    }
  });
  ok('selfBlocks: super-т өөрийгөө батлах тэмдэггүй (2026-10-26)', () => {
    const fn = S.slice(S.indexOf('export async function selfBlocks('), S.indexOf('export async function selfBlocks(') + 700);
    assert.ok(fn.includes("if (roleForUser(me) === 'super') return out;"), 'super-т тэмдэг гарсаар');
  });
  ok('цэвэр дүрэм хэнийг ч ялгадаггүй (super-ийг `authz`-ийн bypass салаа дуудалгүй чөлөөлнө — 2026-10-26)', () => {
    const h = H(ev('engineer', 'approve', 'admin1', 1));
    assert.match(selfApprovalDeny('manager', 'admin1', h), /Өмнөх шатыг/);
    assert.equal(selfApprovalDeny('manager', 'other_admin', h), null, 'өөр super/хянагч батална');
  });
}

console.log('lostWrite:');
const URL_ = 'https://example.invalid/FeatureServer/0/applyEdits';
const wrap = (cause) => new HyanaltError('бичилт унав', cause);
ok('HyanaltError ← ArcGISError (код/статусгүй) → алдагдсан', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('JSON биш хариу', URL_))), true);
});
ok('HyanaltError ← ArcGISError HTTP 500 → алдагдсан', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 500', URL_, undefined, undefined, false, 500))), true);
});
ok('HyanaltError ← ArcGISError HTTP 400 / 403 → алдагдаагүй (тодорхой татгалзал)', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 400', URL_, undefined, undefined, false, 400))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 403', URL_, undefined, undefined, false, 403))), false);
});
ok('ArcGIS код (400 / 498) ба sessionExpired → алдагдаагүй', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('Unable', URL_, 400))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('Invalid token', URL_, 498))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('expired', URL_, undefined, undefined, true))), false);
});
ok('шалтгаангүй HyanaltError / энгийн Error → алдагдаагүй', () => {
  assert.equal(lostWrite(new HyanaltError('Талбарын жагсаалт ирсэнгүй')), false);
  assert.equal(lostWrite(new Error('x')), false);
  assert.equal(lostWrite(null), false);
});
ok('шууд TypeError (сүлжээ) ба ороосон TypeError → алдагдсан', () => {
  assert.equal(lostWrite(new TypeError('Failed to fetch')), true);
  assert.equal(lostWrite(wrap(new TypeError('Failed to fetch'))), true);
});

console.log(`hyanaltAuthz: ${n} шалгуур давлаа`);
