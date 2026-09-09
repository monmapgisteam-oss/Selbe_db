/**
 * ХАРАХ ≠ ЗАСАХ — эрхийн дэд системийн БҮТЦИЙН ГЭРЭЭ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/viewEdit.check.mjs
 *
 * ⚠️ ЯАГААД ЭНЭ ТЕСТ БАЙХ ЁСТОЙ ВЭ (2026-09-09-ны шалгалт).
 *
 * Порталд ХОЁР ӨӨР асуулт бий:
 *     харагдацын эрх (`views`)  → юуг ХАРАХ вэ
 *     ACL хуваарилалт            → юуг ЗАСАХ вэ
 *
 * Газар · Санхүү · Дэд бүтэц · Зөвшөөрөл дөрөв нь үүнийг зөв салгасан:
 * `hasCap` нь ЗӨВХӨН товч идэвхжүүлэхэд хэрэглэгддэг, өгөгдөл нь бүгд
 * харагдана. Гэвч Хуваарь ба Чанар хоёр багцын СОНГОГЧИЙГ хуваарилалтаар
 * шүүдэг байсан тул:
 *
 *   · «Хуваарь» — сонгогч ХООСОН болж, доорх «Танд хуваарь засах эрх алга —
 *     ЗӨВХӨН ХАРНА» гэсэн баннер ХУДАЛ амлалт болов (харах зүйл үлдээгүй);
 *   · «Чанар»  — `canEdit`-ийн тайлбар «Эрхгүй хүн хуудсыг ХАРНА, зөвхөн
 *     засахгүй» гэж бичигдсэн атлаа хуудас БҮХЭЛДЭЭ хаагддаг байв.
 *
 * Хоёулаа 2026-09-07-ны миний засварын хажуугийн үр дагавар: хуучин
 * `bagtsScope` нь томилгоогүй хүнд `null` (=бүх багц) буцаадаг байсныг
 * fail-closed `[]` болгож зассан нь ЗӨВ, гэхдээ тэр утга нь сонгогчийг ч
 * хооссон.
 *
 * Энэ гэрээг ажиллуулж барих боломжгүй (React + ArcGIS шаардана) тул
 * `aclParity.check.mjs`-тэй ижил аргаар ЭХ КОДЫГ шууд тулгана.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(`E:/Selbe_bagtsiin-medeelel/${p}`, 'utf8');

/* Тайлбарыг арилгана — `dataBus.invariant`-ийн сургамж: `⚠️` тайлбарт
   бичигдсэн код хэлбэрийн текст ХУДАЛ таарц өгдөг. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/* ── 1. ХУВААРЬ · ЧАНАР — сонгогч нь БҮХ багцыг өгнө ── */
for (const [file, mod] of [
  ['src/modules/Huvaari.tsx', 'Хуваарь'],
  ['src/modules/Qaqc.tsx', 'Чанар'],
]) {
  const src = strip(read(file));
  assert.match(
    src, /const groupOpts = PKG_GROUPS;/,
    `${mod}: багцын сонгогч нь PKG_GROUPS байх ёстой — хуваарилалтаар ШҮҮВЭЛ`
    + ' эрхгүй хэрэглэгч хоосон дэлгэц хараад «зөвхөн харна» гэсэн амлалт худал болно',
  );
  /* Сонгогчийг дахин шүүх оролдлого — `PKG_GROUPS.filter(...)` эргэж ирвэл барина */
  assert.doesNotMatch(
    src, /groupOpts\s*=\s*useMemo\([\s\S]{0,120}PKG_GROUPS\.filter/,
    `${mod}: `,
  );
}
console.log('✅ Хуваарь · Чанар — багцын сонгогч бүх багцыг өгнө');

/* ── 2. ХҮРЭЭ нь ЗАСАХ эрхэд ХЭВЭЭР үйлчилнэ ──
   Сонгогчийг нээсэн нь хамгаалалт сулраагүйг батлах: `canEdit` (ба
   `canApprove`) тус бүр ХҮРЭЭГ шалгасан хэвээр байх ёстой. */
{
  const hv = strip(read('src/modules/Huvaari.tsx'));
  assert.match(
    hv, /const canEdit[\s\S]{0,200}huvaariScope\([\s\S]{0,60}'author'/,
    'Хуваарь: `canEdit` нь зохиогчийн хүрээг шалгахаа болив — бүх багц ЗАСАГДАХ болно',
  );
  assert.match(
    hv, /const canApprove[\s\S]{0,200}huvaariScope\([\s\S]{0,60}'approver'/,
    'Хуваарь: `canApprove` нь батлагчийн хүрээг шалгахаа болив',
  );

  const qa = strip(read('src/modules/Qaqc.tsx'));
  assert.match(
    qa, /const canEdit[\s\S]{0,260}qaqcScope\(/,
    'Чанар: `canEdit` нь багцын хүрээг шалгахаа болив — хуваарилагдаагүй багц ЗАСАГДАХ болно',
  );
  assert.match(
    qa, /const canEdit[\s\S]{0,260}pkg\.group/,
    'Чанар: `canEdit` нь ТУХАЙН багцыг шалгах ёстой (сонгогч нээлттэй болсон тул)',
  );
}
console.log('✅ хүрээ нь ЗАСАХ эрхэд хэвээр — аюулгүй байдал сулраагүй');

/* ── 3. ХУУДАС БҮХЭЛДЭЭ ХААГДАХГҮЙ ──
   «нэг ч багц хуваарилагдаагүй» гэж эрт `return` хийх зам БАЙХГҮЙ байх ёстой. */
{
  const qa = strip(read('src/modules/Qaqc.tsx'));
  assert.doesNotMatch(
    qa, /if\s*\(\s*groupOpts\.length === 0\s*\)/,
    'Чанар: `groupOpts.length === 0` гэсэн хуудас хаах зам эргэж ирэв —'
    + ' `canEdit`-ийн тайлбартай зөрчилдөнө («Эрхгүй хүн хуудсыг ХАРНА»)',
  );
}
console.log('✅ Чанар — хуудсыг бүхэлд нь хаах зам алга');

/* ── 4. ОБЬЁМ нь АНХНААСАА зөв — тэр загварыг хамгаална ── */
{
  const fn = strip(read('src/modules/sheet/FillNew.tsx'));
  for (const [role, cap] of [['editor', 'obyemEdit'], ['approver', 'obyemApprove']]) {
    assert.match(
      fn, new RegExp(`hasCap\\([\\s\\S]{0,40}'${cap}'[\\s\\S]{0,160}obyemScope\\([\\s\\S]{0,60}'${role}'`),
      `Обьём: \`${cap}\` нь эрх БА хүрээ хоёуланг шалгах ёстой`,
    );
  }
  /* Обьёмын хүрээ нь багцын СОНГОГЧИД хэзээ ч орохгүй */
  assert.doesNotMatch(
    fn, /groupOpts[\s\S]{0,80}obyemScope/,
    'Обьём: багцын сонгогчийг обьёмын хуваарилалтаар шүүх нь Хуваарь/Чанарын алдааг давтана',
  );
}
console.log('✅ Обьём — эрх ба хүрээ тусад нь, сонгогч нээлттэй');

/* ── 5. ЗӨВ ЗАГВАРЫН МОДУЛИУД — hasCap нь зөвхөн canEdit-д ── */
for (const [file, cap, mod] of [
  ['src/modules/Gazar.tsx', 'gazar', 'Газар'],
  ['src/modules/DedButets.tsx', 'butets', 'Дэд бүтэц'],
  ['src/modules/Zovshoorol.tsx', 'zovshoorol', 'Зөвшөөрөл'],
]) {
  const src = strip(read(file));
  assert.match(
    src, new RegExp(`canEdit[\\s\\S]{0,120}hasCap\\([\\s\\S]{0,40}'${cap}'`),
    `${mod}: \`hasCap\` нь \`canEdit\`-д байх ёстой`,
  );
  /* Өгөгдлийг эрхээр шүүх оролдлого */
  assert.doesNotMatch(
    src, new RegExp(`if\\s*\\(\\s*!hasCap\\([^)]*'${cap}'[^)]*\\)\\s*\\)\\s*return\\s*(null|<)`),
    `${mod}: эрхгүй хүнд хуудсыг хаах зам нэмэгдэв — «харах ≠ засах» дүрэм эвдэрнэ`,
  );
}
console.log('✅ Газар · Дэд бүтэц · Зөвшөөрөл — эрх нь зөвхөн засварыг хаана');

console.log('\nviewEdit.check: ok — харах нь бүгдэд, засах нь хуваарилалтаар');
