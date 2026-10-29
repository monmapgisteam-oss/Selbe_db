/**
 * «ХУВААРЬ»-ИЙН ХУВААЛЦСАН НООРОГ — АВТОМАТ ХАДГАЛАЛТЫН ЭХ КОДЫН ШАЛГУУР (2026-10-04 аудит).
 *   node src/modules/huvaari/sharedDraft.check.mjs
 *
 * React hook (`useSharedDraft`) ба ArcGIS бичилт (`draftRemote.saveRemoteDraft`) нь сүлжээ/DOM
 * шаарддаг тул энд ЭХ КОДЫН хэв маягаар хамгаална (цэвэр логик — `huvaariDraft.check.mjs`):
 *   1. Илгээх явцад мөчлөг/бичилт зогсоно (`hdHold`); цэвэрлэлт ХЭСЭГЧИЛСЭН, read-merge-write.
 *   2. Локал хуулбар алсын уншилтаас ӨМНӨ; `flushNow` товлолтоос үл хамааран локалд бичнэ.
 *   3. «Ноорог хаях» локалд СИНХРОН; хоосон ноорог `hdClear`-ээр (cleared тамга) БИШ.
 *   4. `saveRemoteDraft` бичсэний дараа баталгаажуулна; `RemoteSave` хэлбэр хэвээр.
 *   5. Мета/tombstone HLC-ээр (`hdStamp`), `Date.now()`-ээр БИШ.
 *   6. «Хуваарь» `navGuard`-д бүртгэлтэй, `dirtyN`-ээр БИШ `hdUnsynced`-ээр.
 *   8. (2026-10-26) Алсын I/O ЗӨВХӨН хадгалалтын давхаргаар (`huvaariStore` — «ажил бүрд нэг мөр» хүснэгт эсвэл JSON);
 *      `REMOTE_MAX` зөвхөн JSON горимд; илгээлтийн OBJECTID хуулбарт; `rows-wait` давтахгүй, засвартай бол анхааруулна;
 *      алсын уншилт одоогийн жаазтай (`ctx`); хуучин 3 хүснэгтийн горим (`rows-missing`/`rows-ro`/`legacy`) үлдээгүй.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const U = fs.readFileSync('src/modules/huvaari/useSharedDraft.ts', 'utf8');
const R = fs.readFileSync('src/lib/draftRemote.ts', 'utf8');
const H = fs.readFileSync('src/modules/Huvaari.tsx', 'utf8');

/** `const name = useCallback(` … дараагийн `const ` хүртэлх бие (ойролцоо) */
const body = (src, name) => {
  const i = src.indexOf(`const ${name} = useCallback(`);
  assert.ok(i >= 0, `${name} алга`);
  const j = src.indexOf('\n  const ', i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};

/* 1. Илгээх */
{
  const fl = body(U, 'hdFlush');
  assert.ok(/if \(hdHold\.current\) \{ hdHeldAgain\.current = true; return; \}/.test(fl), 'hdFlush илгээх явцад бичсээр');
  assert.ok(/hdHold\.current \|\| draggingRef\.current/.test(U), 'мөчлөг илгээх/чирэх явцад нийлүүлсээр');
  const rc = body(U, 'hdRunClear');
  assert.ok(rc.includes('store.read(key') && rc.includes('applyClear(') && rc.includes('expectAt:'),
    'цэвэрлэлт read-merge-write (applyClear, expectAt) биш');
  assert.ok(/if \(blob && body\.length > REMOTE_MAX && mine\) \{\s*d = cleared\(remote\);\s*body = hdSerialize\(d, REMOTE_MAX\);/.test(rc),
    'хэт том үед зөвхөн алсын мөрийг цэвэрлэх нөөц зам алга');
  const cl = body(U, 'hdClear');
  assert.ok(!/saveRemoteDraft\(key, now, body\)/.test(cl), 'hdClear уншилтгүй (blind) бичсээр');
  assert.ok(cl.includes('hdPutMark(') && cl.includes('hdWriteLocal(key, hdLocal(), mark)'), 'цэвэрлэлтийн тэмдэг/локал хуулбар алга');
  const sa = H.slice(H.indexOf('const sendForApproval = useCallback('), H.indexOf('const applyPayloadToDraft'));
  assert.ok(sa.indexOf('hdSubmitBegin()') >= 0 && sa.indexOf('hdSubmitBegin()') < sa.indexOf('buildPayload()'),
    'тэмдэг buildPayload-оос ӨМНӨ авагдаагүй');
  assert.ok(/hdClearRef\.current\(hdKey\(kind, pkg\.key\), hdMark, r\.oid \?\? null\)/.test(sa), 'илгээлтийн тэмдгээр (OBJECTID-тай) цэвэрлэхгүй байна');
  assert.ok(/finally \{[\s\S]*hdSubmitEnd\(\)/.test(sa), 'hdSubmitEnd finally-д алга — мөчлөг мөнхөд зогсоно');
}
/* 2. Локал хуулбар */
{
  const fl = body(U, 'hdFlush');
  assert.ok(fl.indexOf('hdWriteLocal(key, hdLocal())') >= 0
    && fl.indexOf('hdWriteLocal(key, hdLocal())') < fl.indexOf('store.readAt(key)'), 'локал хуулбар алсын уншилтаас ӨМНӨ биш');
  const fn = U.slice(U.indexOf('const flushNow = () => {'), U.indexOf('hdFlushNowRef.current = flushNow;'));
  assert.ok(!/^\s*if \(!hdTimer\.current\) return;/m.test(fn), 'flushNow товлолтгүй үед локалд бичихгүй хэвээр');
  assert.ok(fn.includes('hdWriteLocal(key, local)') && fn.includes('hdBusy.current = true') && fn.includes('hdClearSeq.current'),
    'flushNow hdBusy/цэвэрлэлтийн үеийг хүндэтгэхгүй');
  assert.ok(/useEffect\(\(\) => \(\) => \{\s*hdFlushNowRef\.current\(\);/.test(U), 'unmount-д flushNow алга');
  assert.ok(body(U, 'hdWriteLocal').includes('hdMerge(d, prev)'), 'локал хуулбар нийлүүлэлгүй дарж бичсээр (2 таб)');
}
/* 3. Хаях / хоосон */
{
  assert.ok(!body(U, 'hdFlush').includes('hdClear('), 'энгийн хоосролт cleared тамга тавьсаар');
  const di = H.indexOf('hdDiscard();');
  assert.ok(di > 0 && di < H.indexOf('setDraft(new Map())', di), '«Ноорог хаях» Map хоослохоос өмнө hdDiscard дуудахгүй');
  assert.ok(U.includes('dropCleared(l0, clearedAt)') && !U.includes('l.t >= clearedAt'), 'cleared нүд тус бүрээр биш');
}
/* 4. draftRemote */
{
  assert.ok(R.includes('export type RemoteSave = { ok: true } | { ok: false; error: string; conflict?: boolean };'), 'RemoteSave хэлбэр өөрчлөгдсөн');
  const s0 = R.indexOf('export async function saveRemoteDraft');
  const sb = R.slice(s0, R.indexOf('export async function clearRemoteDraft'));
  const ae = sb.indexOf('fl.applyEdits(');
  const vq = sb.indexOf('fl.queryFeatures(', ae);
  assert.ok(ae > 0 && vq > ae, 'бичсэний дараах баталгаа (дахин уншилт) алга');
  assert.ok(/conflict: true, written: true/.test(sb), 'дарагдсан бичилт conflict+written буцаахгүй');
}
/* 5. HLC */
{
  assert.ok(body(U, 'hdDiff').includes('hdStamp()') && !body(U, 'hdDiff').includes('Date.now()'), 'дифф Date.now()-оор');
  assert.ok(body(U, 'hdLocal').includes('const now = hdStamp();'), 'hdLocal Date.now()-оор');
  assert.ok(body(U, 'hdApply').includes('const now = hdStamp();'), 'hdApply tombstone Date.now()-оор');
  assert.ok(!/e\.at < fresh - MARGIN/.test(U), 'бусдын нүдийг өөр машины цагаар устгасаар');
}
/* 6. navGuard */
{
  assert.ok(H.includes("import { setNavDirty } from '@/lib/navGuard';"), 'Huvaari navGuard импортлохгүй');
  assert.ok(/setNavDirty\('huvaari', \(?hdUnsynced && !previewing/.test(H), 'navGuard hdUnsynced-ээр биш');
  assert.ok(/return \(\) => setNavDirty\('huvaari', false\)/.test(H), 'unmount-д navGuard цэвэрлэхгүй');
  assert.ok(!/if \(!dirtyN \|\| previewing \|\| !canEdit\) return undefined;/.test(H), 'хуучин dirtyN beforeunload үлдсэн');
}
/* 7. 2026-10-04 шүүлт: хоосролтын хүлээлт · цэвэрлэлтийн давталт түлхүүр бүрт · err-ийн анхааруулга */
{
  const ap = body(U, 'hdApply');
  assert.ok(/hdPrev\.current = mapsToCells\(ap\.maps[\s\S]*hdExpectEmpty\.current = false;[\s\S]*setDraft\(ap\.maps\.draft\)/.test(ap),
    'hdApply hdExpectEmpty-г тэглэхгүй — хаясны дараа нийлсэн нүдтэй Map мөнхөд диффгүй');
  const fl = body(U, 'hdFlush');
  const rd = fl.indexOf('await store.read(key');
  assert.ok(rd > 0 && fl.indexOf('cs !== hdClearSeq.current', rd) > rd
    && fl.indexOf('cs !== hdClearSeq.current', rd) < fl.indexOf('hdApply(merged)'), 'hdFlush цэвэрлэлтээс өмнөх уншилтыг нийлүүлсээр');
  const tk = U.slice(U.indexOf('const tick = async () => {'), U.indexOf('const id = setInterval('));
  assert.ok(tk.includes('const cs = hdClearSeq.current;') && tk.indexOf('if (cs !== hdClearSeq.current) return;') < tk.indexOf('hdApply(merged)'),
    'мөчлөг цэвэрлэлтээс өмнөх уншилтыг нийлүүлсээр');
  const cr = body(U, 'hdClearRetry');
  assert.ok(cr.includes('hdClearTimer.current.get(key)') && cr.includes('hdClearTries.current.get(key)'),
    'цэвэрлэлтийн давталт түлхүүр бүрт биш (Map)');
  assert.ok(!/hdClearTries\.current = 0/.test(U) && !/hdClearTries\.current \+= 1/.test(U), 'хуваалцсан тоолуур үлдсэн');
  assert.ok(/hdSt\.st === 'err' && dirtyN > 0/.test(U), 'засваргүй err-д гарах анхааруулга гарсаар');
  const apT = body(U, 'hdApply');
  assert.ok(/for \(const \[k, t\] of d\.del\)[\s\S]{0,300}hdPrev\.current\.has\(k\)[\s\S]{0,200}remote\.add\(k\);\s*meta\.set\(k, \{ at: t, user: delBy \}\)/.test(apT),
    'хамтрагчийн буцаалт (tombstone) буцаалтын агшныг хүчингүй болгохгүй байна');
}
/* 8. 2026-10-26: хадгалалтын давхарга (`huvaariStore`) */
{
  assert.ok(!/\b(readRemoteDraft|readRemoteDraftAt|saveRemoteDraft)\(/.test(U), 'hook draftRemote-ийг шууд дуудсаар (хадгалалтын давхаргаар биш)');
  assert.ok(U.includes("import { blobStore, legacyPending, prepareStore, type HDStore, type HDStoreMode } from '@/lib/huvaariStore';"), 'huvaariStore импорт алга');
  const fl = body(U, 'hdFlush');
  assert.ok(fl.includes("const body = store.mode === 'blob' ? hdSerialize(local, REMOTE_MAX) : '';"), 'REMOTE_MAX мөрийн хүснэгтэд ч хэрэглэгдсээр');
  assert.ok(fl.includes('hdLastSeenAt.current = r.at ?? local.t;'), 'дифф хоосон үед серверийн агшинг авахгүй');
  assert.ok(/else if \(r\.local\) \{[\s\S]{0,200}setHdSt\(\{ st: 'local'/.test(fl), 'rows-wait горимд давталтгүй local төлөв алга');
  const cl = body(U, 'hdClear');
  assert.ok(cl.indexOf('hdStore.current.submitted(') > 0 && cl.indexOf('hdStore.current.submitted(') < cl.indexOf('hdGen.current += 1'),
    'илгээлтийн хуулбар цэвэрлэлтээс ӨМНӨ бичигдэхгүй');
  const rs = U.slice(U.indexOf('const store = await prepareStore(key, { canWrite: canEditRef.current, ctx: hdCtxRef.current });'));
  assert.ok(rs.length > 100 && rs.indexOf('hdStoreKey.current = key;') < rs.indexOf('let mk = hdReadMark(key);'), 'сэргээлт хадгалалтыг цэвэрлэлтээс ӨМНӨ бэлдэхгүй');
  assert.ok(/\(\(hdSt\.st === 'big' \|\| hdSt\.st === 'local'\) && dirtyN > 0\)/.test(U), 'local төлөвт гарах анхааруулга алга');
  assert.ok(/void planSyncSubmitted\(key, \{ known: both, ctxKind: kind, \.\.\.\(ctxOk \? \{ ctx: hdCtxRef\.current \} : \{\}\) \}\)/.test(H),
    'refreshFlow илгээлтийн хуулбарыг (сэргээгдсэн ctx-тэй) тааруулахгүй');
  assert.ok(/if \(!r\.ok && r\.conflict\) \{ if \(live\(\)\) \{ hdLastSeenAt\.current = -1;/.test(fl), 'зөрчлийн дараа толгой хөдлөөгүй үед уншилтгүй бичсээр');
  assert.ok(/legacyPending\(at0\) && hdLegacyNoted\.current !== at0/.test(U), 'хуучин табын JSON бичилтийг хэрэглэгчид хэлэхгүй (эсвэл давтана)');
  assert.ok(/if \(store\.mode === 'rows-wait'\) \{[\s\S]{0,200}prepareStore\(key/.test(U), 'түр горимыг мөчлөгт дахин шалгахгүй');
  assert.ok(!/rows-missing|rows-ro|legacyAck|store\.legacy\b|Huvaari_noorog|hn_noorog|huvaariRows/.test(U + H), 'хуучин 3 хүснэгтийн үлдэгдэл');
  assert.ok(!/\.read\(key, \{[^}]*bld:/.test(U)
    && (U.match(/\.read\(key, (\{ (full: true, )?ctx: hdCtxRef\.current \}|cur\(\) \? \{ ctx: hdCtxRef\.current \} : undefined)\)/g) ?? []).length === 4,
    'алсын уншилт одоогийн жаазгүй (кодоор тааруулахгүй)');
  const wd = H.slice(H.indexOf('const r = await withdrawPlan({ oid, me:'));
  assert.ok(wd.indexOf('await planSyncSubmitted(pkg.key, { force: true })') > 0
    && wd.indexOf('await planSyncSubmitted(pkg.key, { force: true })') < wd.indexOf('applyPayloadToDraft('), 'татахад хуулбар ноорогт буулгахаас ӨМНӨ цэвэрлэгдэхгүй');
}
console.log('✅ sharedDraft: автомат хадгалалтын эх кодын шалгуур давлаа');
