/**
 * «ТАЙЛАН ТАТАХ» — тайрсан/виртуал хүснэгтийн ТЭМДЭГЛЭЛ (2026-10-19, цэвэр).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/viewReportNote.check.mjs
 * Хамгаалах алдаа: `MAX_TABLE_ROWS`-оор тайрсан эсвэл виртуал хүснэгтийн зөвхөн дэлгэцийн мөрүүдийг авсан
 * тайлан БҮТЭН мэт харагддаг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableNote } from './viewReport.ts';

assert.equal(tableNote(10, null, false), null, 'бүтэн хүснэгт — тэмдэглэлгүй');
assert.equal(tableNote(10, 10, false), null, 'нийт = орсон — тэмдэглэлгүй');
assert.match(tableNote(40, 1400, false), /харагдаж буй мөрүүд \(40 \/ нийт 1,400\)/, 'виртуал хүснэгт');
assert.match(tableNote(1500, 2300, true), /2,300 мөрөөс эхний 1,500/, 'хязгаараар тайрсан, нийт мэдэгдэх');
assert.match(tableNote(1500, null, true), /эхний 1,500 мөр/, 'хязгаараар тайрсан, нийт мэдэгдэхгүй');
const fill = readFileSync(new URL('../modules/sheet/FillNew.tsx', import.meta.url), 'utf8');
assert.ok(fill.includes('data-rep-total={vis.length}'), 'бөглөх хуудасны виртуал хүснэгт нийт мөрөө зарлана');
const vr = readFileSync(new URL('./viewReport.ts', import.meta.url), 'utf8');
assert.ok(!vr.includes("getAttribute('aria-rowcount')"), 'aria-rowcount-ыг нийт тоо гэж уншихгүй');
assert.ok(!/push\(cells\);\s*if \(rows\.length >= MAX_TABLE_ROWS\)/.test(vr), 'яг хязгаар дээр capped болохгүй (push-ийн ӨМНӨ шалгана)');
console.log('✅ viewReport — тайрсан/виртуал хүснэгтийн тэмдэглэл');

{
  globalThis.getComputedStyle = () => ({ display: 'block' });
  const mk = (tag, attrs = {}, kids = [], text = '') => {
    const el = {
      tagName: tag.toUpperCase(), attrs, children: kids, parentElement: null, innerText: text,
      getAttribute: (k) => (k in attrs ? String(attrs[k]) : null), hasAttribute: (k) => k in attrs,
      checkVisibility: () => true, getClientRects: () => [1],
      closest: (sel) => (/data-rep-skip|data-report-skip/.test(sel) ? null : null),
      querySelectorAll: (sel) => {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); walk(c); } };
        walk(el);
        return out;
      },
    };
    for (const k of kids) k.parentElement = el;
    return el;
  };
  /* Сонгогчийн жижиг тайлбарлагч — зөвхөн `[a="v"]` / `[a]` хослол, таслалаар */
  const matches = (n, sel) => sel.split(',').some((one) => {
    const t = one.trim();
    if (!t.startsWith('[')) return n.tagName === t.toUpperCase();
    return [...t.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, a, v]) => (v === undefined ? n.hasAttribute(a) : n.getAttribute(a) === v));
  });
  const radio = (label, on) => mk('button', { role: 'radio', 'aria-checked': on ? 'true' : 'false' }, [], label);
  const seg = (name, opts, sel) => mk('span', { role: 'radiogroup', 'aria-label': name }, opts.map((o) => radio(o, o === sel)));
  const root = mk('div', {}, [
    seg('Бүлэг', ['Бүгд', 'Сүлжээ', 'Барилга'], 'Сүлжээ'),
    seg('Горим', ['График', 'Хүснэгт'], 'Хүснэгт'),
    seg('Төрөл', ['Бүгд 12', 'Журам 4', 'Заавар 8'], 'Бүгд 12'),
  ]);
  const { readFilters } = await import('./viewReport.ts');
  assert.deepEqual(readFilters([root]), ['Бүлэг: Сүлжээ'], 'Segmented шүүлт (≥3 сонголт); 2 сонголттой горим ба «Бүгд» шүүлт биш');
  console.log('✅ viewReport — Segmented (role=radio) шүүлт тайланд');
}
