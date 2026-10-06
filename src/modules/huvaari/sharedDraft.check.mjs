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
  assert.ok(rc.includes('readRemoteDraft(key)') && rc.includes('applyClear(') && rc.includes('expectAt:'),
    'цэвэрлэлт read-merge-write (applyClear, expectAt) биш');
  const cl = body(U, 'hdClear');
  assert.ok(!/saveRemoteDraft\(key, now, body\)/.test(cl), 'hdClear уншилтгүй (blind) бичсээр');
  assert.ok(cl.includes('hdPutMark(') && cl.includes('hdWriteLocal(key, hdLocal(), mark)'), 'цэвэрлэлтийн тэмдэг/локал хуулбар алга');
  const sa = H.slice(H.indexOf('const sendForApproval = useCallback('), H.indexOf('const applyPayloadToDraft'));
  assert.ok(sa.indexOf('hdSubmitBegin()') >= 0 && sa.indexOf('hdSubmitBegin()') < sa.indexOf('buildPayload()'),
    'тэмдэг buildPayload-оос ӨМНӨ авагдаагүй');
  assert.ok(/hdClearRef\.current\(hdKey\(kind, pkg\.key\), hdMark\)/.test(sa), 'илгээлтийн тэмдгээр цэвэрлэхгүй байна');
  assert.ok(/finally \{[\s\S]*hdSubmitEnd\(\)/.test(sa), 'hdSubmitEnd finally-д алга — мөчлөг мөнхөд зогсоно');
}
/* 2. Локал хуулбар */
{
  const fl = body(U, 'hdFlush');
  assert.ok(fl.indexOf('hdWriteLocal(key, hdLocal())') >= 0
    && fl.indexOf('hdWriteLocal(key, hdLocal())') < fl.indexOf('readRemoteDraftAt(key)'), 'локал хуулбар алсын уншилтаас ӨМНӨ биш');
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
  /* ⚠️ 2026-10-06: батлагчийн тэмдэглэгээ (`hasOkMarks`) ч хамгаалагдана — `(…) || hasOkMarks` */
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
  const rd = fl.indexOf('await readRemoteDraft(key)');
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
}
console.log('✅ sharedDraft: автомат хадгалалтын эх кодын шалгуур давлаа');
