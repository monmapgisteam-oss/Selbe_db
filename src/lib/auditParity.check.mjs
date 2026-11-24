/**
 * 2026-11-24 (аудит) — НЭГ ЭХ, НЭГ ДҮРЭМ: эх кодын шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/auditParity.check.mjs
 *
 *   1. Зөвшөөрөл — ТУХ (`tuh/extra`) ба хугацааны өөрчлөлт (`execPeriod`) ТТБ-ийн мөр + бүртгэлээс (`loadPermitRows`), удирдлагын
 *      тайлан ба CEO самбартай нэг; зөвхөн бүртгэл (`loadZov`) биш.
 *   2. Удирдлагын тайлангийн кэш — `loadProjectPlan` зургийн бүртгэлийг уншдаг тул ZURAG_BURTGEL-ийн бичилтээр шинэчлэгдэнэ.
 *   3. CEO багц ажлын оноо — нийт/бүлгийн хавтан, «N багц ажил», хүснэгт НЭГ олонлогоос (газар чөлөөлөлтийн мөр бүгдэд).
 *   4. AI туслахын хувь — 2 орон бутархай (нэг аравт биш).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

ok('зөвшөөрөл — loadPermitRows (tuh/extra · execPeriod)', () => {
  for (const f of ['../modules/tuh/extra.ts', './execPeriod.ts']) {
    const s = src(f);
    assert.match(s, /loadPermitRows\(\)/, `${f}: loadPermitRows алга`);
    assert.doesNotMatch(s, /\bloadZov\(\)/, `${f}: зөвхөн бүртгэлээс уншсаар`);
  }
});

ok('удирдлагын тайлангийн кэш — ZURAG_BURTGEL', () => {
  const s = src('./execReport.ts');
  const m = s.match(/export const loadExecReport = cached\([\s\S]*?\[([^\]]*)\]\);/);
  assert.ok(m, 'loadExecReport-ийн кэш олдсонгүй');
  assert.ok(m[1].includes("'ZURAG_BURTGEL'"), m[1]);
});

ok('CEO оноо — хавтан, тоо, хүснэгт нэг олонлог', () => {
  const s = src('../components/CeoScorecard.tsx');
  assert.doesNotMatch(s, /allWorks\.filter\(\(w\) => !w\.isLandWork\)/, 'тоо/хүснэгтээс газрын мөр хасагдсан хэвээр');
  assert.match(s, /const project = useMemo\(\(\) => \(works \? projectDims\(works\) : null\), \[works\]\);/);
  assert.match(s, /const groups = useMemo\(\(\) => \(works \? groupByType\(works\) : \[\]\), \[works\]\);/);
  assert.match(s, /tr\('\{0\} багц ажил', num\(works\.filter\(\(w\) => !w\.cancelled\)\.length\)\)/);
});

ok('AI туслах — хувь 2 орон бутархай', () => {
  const c = src('./agent/compute.ts');
  const sc = src('./agent/screenCompute.ts');
  for (const [f, s] of [['compute.ts', c], ['screenCompute.ts', sc]]) {
    assert.doesNotMatch(s, /Math\.round\([^)]*\* 10\) \/ 10/, `${f}: нэг аравтаар тоймлосон хэвээр`);
  }
  assert.match(sc, /Math\.round\(sh\.pct \* 100\) \/ 100/);
  assert.doesNotMatch(sc, /нэг аравтаар/, 'заавар нэг аравт хэвээр');
});

ok('ТТБ-ийн 4 унтраалга — тусдаа эрх (ttbSwitch), хуучнаараа finEdit-д ч', () => {
  const pe = src('./planEdit.ts');
  for (const fn of ['saveInTotal', 'saveInPhase', 'saveInMoney', 'saveInTime']) {
    const i = pe.indexOf(`export function ${fn}(`);
    const body = pe.slice(i, pe.indexOf('\n}\n', i));
    assert.match(body, /switchCap\(\)/, `${fn}: switchCap биш`);
  }
  assert.match(pe, /hasCap\(user, 'ttbSwitch'\) \|\| hasCap\(user, 'finEdit'\)/, 'finEdit-тэй хүн унтраалгаа алдахгүй');
  const fin = src('../modules/Finance.tsx');
  assert.match(fin, /disabled=\{!canSwitch \|\| inh/, 'унтраалга canSwitch-ээр');
  assert.match(fin, /canSwitch=\{canSw\}/, 'ProjectPlanView-д canSwitch дамжина');
  assert.match(src('./caps.ts'), /ttbSwitch: \['finance'\]/, 'ttbSwitch «Төсөл төлөвлөгөө биелэлт»-ийг нээнэ');
});

ok('нэвтрэхэд кэшийн санамж — сешнд нэг удаа, ганц «OK» товч', () => {
  const root = src('../components/Root.tsx');
  assert.match(root, /sessionStorage\.getItem\(KEY\) === '1'/, 'сешнд нэг удаа');
  assert.match(root, /Ctrl \+ Shift \+ R/, 'Ctrl + Shift + R заавар');
  assert.match(root, /alert: true/, 'ганц товчтой мэдэгдэл');
  assert.match(src('../components/ConfirmHost.tsx'), /\{!req\.opts\.alert && \(/, '«Болих» товч мэдэгдэлд нуугдана');
});

console.log(`\n✅ auditParity: ${n} шалгуур давлаа`);
