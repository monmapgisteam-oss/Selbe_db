/**
 * ТАЛЫН БАГАНЫН БАРИУЛ — эхлэх өргөн нь хувьсагчийн БОДИТ өргөн (`clamp(...)` бичвэр биш).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/components/SplitGrip.ui.check.mjs
 *
 * Хамгаалж буй алдаа: өргөн дэлгэцэд `--side-l: clamp(272px, 16vw, 560px)` — `getPropertyValue` бичвэрээ буцаадаг тул
 * `parseFloat` NaN өгч, 307px багана эхний чирэлтэд 180px руу үсэрч, буруу өргөн хадгалагддаг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureSide } from '@/components/SplitGrip';

/* Хөтчийн хэмжилтийг загварчилна: `width:var(--x)`-ийг host-ийн бодит (тооцоолсон) өргөнөөр шийднэ */
const made = [];
globalThis.document = {
  createElement() {
    const el = {
      style: { cssText: '' },
      getBoundingClientRect() {
        const m = /width:var\((--[\w-]+)\)/.exec(el.style.cssText);
        return { width: m ? (el.host?.resolved[m[1]] ?? 0) : 0 };
      },
    };
    made.push(el);
    return el;
  },
};
const host = (resolved) => {
  const h = {
    resolved,
    kids: [],
    appendChild(el) { el.host = h; h.kids.push(el); },
    removeChild(el) { h.kids.splice(h.kids.indexOf(el), 1); },
  };
  return h;
};

const h = host({ '--side-l': 307.2, '--side-r': 326.4 });
assert.equal(measureSide(h, '--side-l'), 307, 'clamp-ийн бодит өргөн (1920px дэлгэц)');
assert.equal(measureSide(h, '--side-r'), 326);
assert.equal(h.kids.length, 0, 'түр элемент үлдэхгүй');
assert.match(made[0].style.cssText, /position:absolute/, 'түр элемент grid-ийн байрлалд нөлөөлөхгүй');
assert.match(made[0].style.cssText, /visibility:hidden/);
assert.equal(measureSide(host({ '--side-l': 0 }), '--side-l'), 180, '0px (хураасан) → доод хязгаар');

const src = readFileSync(new URL('./SplitGrip.tsx', import.meta.url), 'utf8');
assert.ok(!src.includes('parseFloat('), 'хувьсагчийн бичвэрийг задлах ёсгүй — чирэлт ба сумны товч хоёулаа measureSide-аар');
assert.equal((src.match(/measureSide\(host, varName\)/g) ?? []).length, 2, 'чирэлт ба сумны товч');

delete globalThis.document;
console.log('SplitGrip.ui.check ✓');
