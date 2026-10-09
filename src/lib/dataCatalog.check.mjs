/**
 * ӨГӨГДЛИЙН КАТАЛОГИЙН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/dataCatalog.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ (2026-09-25):
 *
 *  1. ШИНЭ ДАВХАРГА КАТАЛОГООС ДУТАХ. `LAYERS`-д нэмэгдсэн давхарга каталогт
 *     ороогүй бол «Системийн баримт» нь эх сурвалжийн бүрэн жагсаалт биш болно.
 *  2. ДАВХАРДСАН id. Шатлалын холбоос (`ref`) аль мөр рүү үсрэхээ id-аар олдог.
 *  3. ҮХСЭН ХОЛБООС. `ref` нь байхгүй id руу заавал дархад юу ч болохгүй.
 *  4. ХААЛТТАЙ ҮЙЛЧИЛГЭЭ (499) тугаа алдах — CLAUDE.md-ийн «хаалттай 2
 *     үйлчилгээ»: `Selbe_guitsetgel_consolidated`, `Selbe_ET_20260721`.
 *  5. `Bagts_*` 18 хуудас ба `QAQC_TABLE` бүр мөртэй эсэх.
 */

import assert from 'node:assert/strict';
import { dataCatalog, CAT_GROUPS, CLOSED_SERVICES, searchText } from './dataCatalog.ts';
import { LAYERS, VIEWS } from './services.ts';
import { PKGS } from '../modules/sheet/bagts.pkg.ts';
import { QAQC_TABLE } from './qaqc.ts';
import { KINDS, REVIEWERS_OF, SEQUENTIAL_KINDS } from './chanarMs.ts';

const cat = dataCatalog();
assert.ok(cat.length > 50, `каталог хэт цөөн: ${cat.length}`);

/* ── 2. id давтагдашгүй ── */
const ids = cat.map((e) => e.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
assert.deepEqual(dup, [], `давхардсан id: ${dup.join(', ')}`);
const byId = new Set(ids);

/* ── 1. LAYERS бүр каталогт ── */
const covered = new Set(cat.flatMap((e) => e.aliases));
const missing = LAYERS.map((l) => l.id).filter((id) => !covered.has(id));
assert.deepEqual(missing, [], `каталогт ороогүй LAYERS id: ${missing.join(', ')}`);

/* ── 5. Bagts_* ба QAQC ── */
for (const p of PKGS) assert.ok(byId.has(`bagts:${p.key}`), `Bagts хуудас дутуу: ${p.key}`);
assert.equal(PKGS.length, 18, `Bagts_* хуудасны тоо өөрчлөгдсөн: ${PKGS.length}`);
for (const k of Object.keys(QAQC_TABLE)) assert.ok(byId.has(`qaqc:${k}`), `QAQC хүснэгт дутуу: ${k}`);

/* ── 3. шатлалын холбоос ── */
const groups = new Set(CAT_GROUPS.map((g) => g.key));
const viewKeys = new Set(VIEWS.map((v) => v.key));
for (const e of cat) {
  assert.ok(groups.has(e.group), `${e.id}: танигдаагүй бүлэг ${e.group}`);
  assert.ok(e.name && e.name.trim(), `${e.id}: нэргүй`);
  assert.ok(e.service && e.service.trim(), `${e.id}: үйлчилгээний нэргүй`);
  assert.ok(e.purpose().trim().length > 5, `${e.id}: зориулалт хоосон`);
  const chain = e.chain();
  assert.ok(chain.length >= 2, `${e.id}: шатлал 2-оос цөөн алхамтай`);
  for (const s of chain) {
    assert.ok(s.label && s.label.trim(), `${e.id}: хоосон алхам`);
    for (const part of [s, ...(s.with ?? [])]) {
      if (part.ref) {
        assert.ok(byId.has(part.ref), `${e.id}: «${part.label}» → байхгүй мөр ${part.ref}`);
        assert.notEqual(part.ref, e.id, `${e.id}: өөр рүүгээ заасан алхам`);
      }
    }
  }
  for (const v of e.views) assert.ok(viewKeys.has(v), `${e.id}: танигдаагүй харагдац ${v}`);
  assert.equal(typeof searchText(e), 'string');
}

/* ── 4. хаалттай үйлчилгээ ── */
for (const svc of CLOSED_SERVICES) {
  const hit = cat.filter((e) => e.service === svc || (e.url ?? '').includes(`/${svc}/`));
  assert.ok(hit.length > 0, `хаалттай үйлчилгээ каталогт алга: ${svc}`);
  for (const e of hit) assert.equal(e.closed, true, `${e.id}: ${svc} устгагдсан (400) тугагүй`);
}
for (const e of cat.filter((x) => x.closed)) {
  assert.ok(
    CLOSED_SERVICES.some((svc) => e.service === svc),
    `${e.id}: хаалттай гэж тэмдэглэсэн ч CLOSED_SERVICES-д байхгүй (${e.service})`,
  );
}

/* ── 6. Чанарын баримтын мөр ↔ `chanarMs` (2026-09-25, аудит 8) ──
   ⚠️ Каталогийн текст нь дүрмийн ХУУЛБАР тул төрөл/хянагч нэмэгдэхэд чимээгүй
   хуучирдаг (2026-09-28-нд 5 төрөл · «MA — Чанар · ТУГ зэрэг» гэж үлдсэн байв). */
{
  const e = cat.find((x) => x.id === 'chanar');
  assert.ok(e, 'chanar мөр алга');
  for (const k of KINDS) assert.ok(e.name.includes(k), `chanar: нэрэнд төрөл ${k} алга (KINDS=${KINDS.length})`);
  const chain = e.chain().map((s) => s.label).join(' ');
  const LABEL = { tuh: 'ТУХ', chanar: 'Чанар', habea: 'ХАБЭА', tug: 'ТУГ', cheng: 'ЧХ инженер' };
  for (const k of SEQUENTIAL_KINDS) {
    const seq = REVIEWERS_OF[k].map((r) => LABEL[r]).join(' → ');
    assert.ok(chain.includes(seq), `chanar: ${k}-ийн дараалсан хянагч «${seq}» шатлалд алга`);
  }
  for (const r of REVIEWERS_OF.NCR) assert.ok(chain.includes(LABEL[r]), `chanar: NCR-ийн хянагч ${r} шатлалд алга`);
  assert.ok(e.views.includes('qaqc'), 'chanar: QAQC харагдац уншдаг (MA · MIR · FIC сонголт)');
}

/* ── Нэг физик давхарга = нэг мөр ── */
const urls = cat.map((e) => e.url).filter(Boolean).map((u) => decodeURIComponent(u).toLowerCase().replace(/\/+$/, ''));
const dupUrl = urls.filter((x, i) => urls.indexOf(x) !== i);
assert.deepEqual(dupUrl, [], `нэг хаяг хоёр мөрөнд: ${dupUrl.join(', ')}`);

console.log(`✓ dataCatalog: ${cat.length} мөр · LAYERS ${LAYERS.length}/${LAYERS.length} · хаалттай ${cat.filter((e) => e.closed).length}`);
