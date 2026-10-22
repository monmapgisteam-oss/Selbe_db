/**
 * НЭМЭЛТ АЖИЛ — `useAjil.ts`-ийн илгээх · засах · татах урсгал `await`-ийн ДАРАА багц солигдсон
 * эсэхийг шалгадаг (2026-10-21, аудит №1).
 *
 * ⚠️ React hook тул цэвэр функцгүй — эх кодын дүрмийг шалгана: `sendAjil` · `editAjilHere` ·
 *    `saveAjilEdit` · `withdrawAjilHere` бүр `want = pkg.key`-г барьж, хүсэлтийн дараа
 *    `pkgKeyRef.current === want` (`live()`) бол л дэлгэцийн төлөв (алдаа · мэдэгдэл · `refreshAjil`)
 *    хөндөнө; LS (`writeAdds(want, …)`) нь багц солигдсон ч бичигдэнэ (2026-09-25-ны дүрэм).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/modules/huvaari/useAjil.ts', 'utf8');
const fn = (name) => {
  /* ⚠️ 2026-10-23 (UX аудит P3): `sendAjil(note?)` параметртэй, `Promise<boolean>` буцаана — `async (` угтвараар хайна */
  const i = src.indexOf(`const ${name} = useCallback(async (`);
  assert.ok(i >= 0, `${name} олдсонгүй`);
  const j = src.indexOf('\n  }, [', i);
  const end = src.indexOf(']);', j);
  return { body: src.slice(i, j), deps: src.slice(j, end) };
};

for (const name of ['sendAjil', 'saveAjilEdit', 'withdrawAjilHere']) {
  const { body, deps } = fn(name);
  assert.ok(/const want = pkg\.key;/.test(body), `${name}: want барьдаггүй`);
  assert.ok(/const live = \(\) => pkgKeyRef\.current === want;/.test(body), `${name}: live() алга`);
  assert.ok(/if \(!live\(\)\) return(?: true)?;/.test(body), `${name}: await-ийн дараа багц солигдсон эсэхийг шалгахгүй`);
  assert.ok(/if \(!r\.ok\) \{ if \(live\(\)\) setAjErr\(/.test(body), `${name}: татгалзлын алдааг өөр багцад харуулна`);
  assert.ok(/catch \(e\) \{\s*if \(live\(\)\) setAjErr\(userError\(e\)\);/.test(body), `${name}: catch-ийн алдааг өөр багцад харуулна`);
  assert.ok(/if \(!live\(\)\) return(?: true)?;[\s\S]*?await refreshAjil\(null\);/.test(body), `${name}: refreshAjil шалгалтын өмнө`);
  assert.ok(/pkgKeyRef/.test(deps), `${name}: deps-д pkgKeyRef алга`);
  /* LS бичилт шалгалтын ӨМНӨ — багц солигдсон ч хадгалагдана */
  assert.ok(body.indexOf('writeAdds(want') < body.search(/if \(!live\(\)\) return(?: true)?;/) || name === 'withdrawAjilHere', `${name}: LS бичилт шалгалтын дараа`);
}
{
  const { body } = fn('editAjilHere');
  const chk = body.indexOf('if (pkgKeyRef.current !== want) return;');
  assert.ok(chk >= 0 && chk < body.indexOf("setAjErr(tr('Илгээлтийн агуулга уншигдсангүй.'))"), 'editAjilHere: багцын шалгалт алдааны өмнө биш');
  assert.ok(/catch \(e\) \{\s*if \(pkgKeyRef\.current === want\) setAjErr\(userError\(e\)\);/.test(body), 'editAjilHere: catch-ийн алдааг өөр багцад харуулна');
}
console.log('useAjil.check: ok — багц солигдсон бол дэлгэцийн төлөв хөндөгдөхгүй ✓');

/* ── ⚠️ 2026-10-22 (аудит №3): ЭЦЭГГҮЙ нэмэлт мөр — илгээх · засвар хадгалах ХААЛТТАЙ, жагсаалт/бүлэг сонгох буцаана ── */
{
  for (const name of ['sendAjil', 'saveAjilEdit']) {
    const { body, deps } = fn(name);
    const g = body.search(/if \(ajOrphans\.length\) \{ setAjErr\(orphanAddsMsg\(ajOrphans\.length\)\); return(?: false)?; \}/);
    assert.ok(g >= 0, `${name}: эцэггүй мөрийн хаалт алга`);
    assert.ok(g < body.indexOf('await '), `${name}: хаалт сүлжээний хүсэлтээс ӨМНӨ байх ёстой`);
    assert.ok(/ajOrphans/.test(deps), `${name}: deps-д ajOrphans алга`);
  }
  assert.ok(/const ajOrphans = useMemo\(\(\) => \(rows\.length \? missingParents\(rows, adds\) : \[\]\), \[rows, adds\]\);/.test(src), 'ajOrphans: мөр ачаалагдаагүй үед тооцохгүй');
  assert.ok(/ajOrphans, setAddParent,\n  \};/.test(src.replace(/\r\n/g, '\n')), 'hook ajOrphans · setAddParent буцаадаггүй');
  const hv = readFileSync('src/modules/Huvaari.tsx', 'utf8');
  assert.ok(/disabled=\{ajBusy \|\| ajOrphans\.length > 0\}/.test(hv), 'Huvaari: «Нэмэлт ажил батлуулах» эцэггүй мөртэй үед хаагддаггүй');
  assert.ok(/setAddParent\(a\.oid, v\)/.test(hv) && /dropAdd\(a\.oid\)/.test(hv), 'Huvaari: эцэггүй мөрийн баннерт устгах/бүлэг сонгох алга');
  console.log('useAjil.check: ok — эцэггүй нэмэлт мөр жагсаагдаж, илгээх хаалттай ✓');
}

/* ── ⚠️ 2026-10-22 (аудит №6): ТОДОРХОЙГҮЙ ТАТАЛТ — мөрүүд тэмдэглэгдэж, `refreshAjil` «Татсан» бол буулгана ── */
{
  const { body } = fn('withdrawAjilHere');
  assert.ok(/if \(!r\.ok && r\.unsure\) writeWdMark\(want, \{ oid: ajSub\.oid, adds: pl\?\.adds \?\? \[\], editing \}\);/.test(body), 'withdrawAjilHere: unsure үед мөрүүдийг тэмдэглэдэггүй');
  assert.ok(body.indexOf('writeWdMark(want') < body.indexOf('if (!r.ok) { if (live())'), 'тэмдэг `live()`-аас үл хамааран (LS) бичигдэх ёстой');
  const i = src.indexOf('const refreshAjil = useCallback(');
  const rb = src.slice(i, src.indexOf('\n  }, [', i));
  const w = rb.indexOf('const wd = readWdMark(want);');
  assert.ok(w >= 0 && w < rb.indexOf('setAjSub(sub);'), 'refreshAjil: тэмдгийг `setAjSub`-ээс ӨМНӨ шийдэх ёстой (засварын мөрүүд хасагдахгүй)');
  assert.ok(/head\?\.status === AJIL_STATUS\.withdrawn/.test(rb) && /mergeIncoming\(cur\.key === want \? cur\.list : readAdds\(want\), wd\.adds\)/.test(rb), 'refreshAjil: «Татсан» бол мөрүүдийг буулгадаггүй');
  assert.ok(/if \(wd && sub\?\.oid === wd\.oid\) writeWdMark\(want, null\);/.test(rb), 'refreshAjil: хүлээгдсэн хэвээр бол тэмдгийг арилгадаггүй');
  console.log('useAjil.check: ok — тодорхойгүй таталтын мөрүүд алдагдахгүй ✓');
}
