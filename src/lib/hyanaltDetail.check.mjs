/**
 * ХЯНАГЧИЙН ХАРАГДАЦ = БАТЛАЛТ — хуучин илгээлтийн давтамжийг ижил дүрмээр нөхнө (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltDetail.check.mjs
 *
 * ⚠️ REGRESSION: `hyanaltStore.archiveSubmission` (батлалт) нь `rowOcc`-гүй илгээлтэд
 *    `needsFrameOcc → withFrameOcc`-оор давтамжийг СУУРЬ жаазаас нөхөж архивт бичдэг болсон
 *    атлаа хянагчийн харагдац (`hyanaltDetail.loadStaged`) ба бөглөх хуудасны тодруулга
 *    (`useFlow`) нөхдөггүй байв — хянагч ХАРААГҮЙ нүд батлагдана. Эх кодын шалгуур (сүлжээгүй).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const det = src('./hyanaltDetail.ts');
const fn = det.slice(det.indexOf('async function loadStaged('));
assert.ok(fn.length > 0, 'loadStaged олдсонгүй');
const occ = fn.indexOf('needsFrameOcc(pl, loaded.rows)');
const with_ = fn.indexOf('withFrameOcc(pl,');
const ov = fn.indexOf('overlaySubmission(loaded.rows, pl,');
assert.ok(occ > 0 && with_ > occ, 'loadStaged: needsFrameOcc → withFrameOcc алга');
assert.ok(ov > with_, 'loadStaged: overlay нь нөхсөн payload-оор (withFrameOcc-ийн ДАРАА)');
assert.ok(/unmoved: ov\.unmoved/.test(fn), 'loadStaged: `unmoved` тоог буцаана');

const store = src('./hyanaltStore.ts');
assert.ok(/needsFrameOcc\(pl, loaded\.rows\)[\s\S]{0,200}withFrameOcc\(pl, baseRows0\)/.test(store), 'батлалтын зам (лавлагаа) өөрчлөгдсөн');

const flow = src('../modules/sheet/fill/useFlow.ts');
assert.ok(/needsFrameOcc\(pl, base\.rows\)[\s\S]{0,200}withFrameOcc\(pl,/.test(flow), 'useFlow: тодруулга нөхсөн payload-оор');
assert.ok(flow.includes('overlaySubmission(base.rows, pl, sc'), 'useFlow: overlay нөхсөн `pl`-ээр');

const g = src('../modules/Guitsetgel.tsx');
assert.ok(g.includes('data.unmoved'), 'Guitsetgel: тулгагдаагүй нүдний тоог харуулна');
console.log('✅ hyanaltDetail · useFlow — батлалттай ижил withFrameOcc · unmoved харагдана');
