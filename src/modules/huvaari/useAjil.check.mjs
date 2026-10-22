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
  const i = src.indexOf(`const ${name} = useCallback(async () => {`);
  assert.ok(i >= 0, `${name} олдсонгүй`);
  const j = src.indexOf('\n  }, [', i);
  const end = src.indexOf(']);', j);
  return { body: src.slice(i, j), deps: src.slice(j, end) };
};

for (const name of ['sendAjil', 'saveAjilEdit', 'withdrawAjilHere']) {
  const { body, deps } = fn(name);
  assert.ok(/const want = pkg\.key;/.test(body), `${name}: want барьдаггүй`);
  assert.ok(/const live = \(\) => pkgKeyRef\.current === want;/.test(body), `${name}: live() алга`);
  assert.ok(/if \(!live\(\)\) return;/.test(body), `${name}: await-ийн дараа багц солигдсон эсэхийг шалгахгүй`);
  assert.ok(/if \(!r\.ok\) \{ if \(live\(\)\) setAjErr\(/.test(body), `${name}: татгалзлын алдааг өөр багцад харуулна`);
  assert.ok(/catch \(e\) \{\s*if \(live\(\)\) setAjErr\(userError\(e\)\);/.test(body), `${name}: catch-ийн алдааг өөр багцад харуулна`);
  assert.ok(/if \(!live\(\)\) return;[\s\S]*?await refreshAjil\(null\);/.test(body), `${name}: refreshAjil шалгалтын өмнө`);
  assert.ok(/pkgKeyRef/.test(deps), `${name}: deps-д pkgKeyRef алга`);
  /* LS бичилт шалгалтын ӨМНӨ — багц солигдсон ч хадгалагдана */
  assert.ok(body.indexOf('writeAdds(want') < body.indexOf('if (!live()) return;') || name === 'withdrawAjilHere', `${name}: LS бичилт шалгалтын дараа`);
}
{
  const { body } = fn('editAjilHere');
  const chk = body.indexOf('if (pkgKeyRef.current !== want) return;');
  assert.ok(chk >= 0 && chk < body.indexOf("setAjErr(tr('Илгээлтийн агуулга уншигдсангүй.'))"), 'editAjilHere: багцын шалгалт алдааны өмнө биш');
  assert.ok(/catch \(e\) \{\s*if \(pkgKeyRef\.current === want\) setAjErr\(userError\(e\)\);/.test(body), 'editAjilHere: catch-ийн алдааг өөр багцад харуулна');
}
console.log('useAjil.check: ok — багц солигдсон бол дэлгэцийн төлөв хөндөгдөхгүй ✓');
