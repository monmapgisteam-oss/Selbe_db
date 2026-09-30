/**
 * UI SMOKE — `@arcgis/core/**`-ийн СТУБ УТГА (`ts-alias-hooks.mjs`, ui горим).
 *
 * `mkStub(name)` нь юу ч болж чадах Proxy: `new X()`, `X()`, `X.a.b.c`, `X.on(...)`
 * бүгд дахин стуб буцаана — ArcGIS-ийн класс, namespace хоёуланг нь орлоно.
 * Ингэснээр `useState(() => new Map())` зэрэг эхлүүлэгч Node-д унахгүй.
 *
 * ⚠️ Стуб нь React-ийн хүүхэд болж болохгүй тул `$$typeof`/`then`/`toJSON`
 *    зэрэг тусгай түлхүүрт undefined өгнө; `Symbol.toPrimitive` → нэр (лог).
 * ⚠️ Массив/тоо шаардсан газар (`.length`, `.forEach`) стуб буцаана — тэр нь
 *    зөвхөн эффект/асинхрон замд хэрэглэгддэг тул SSR render-д хүрэхгүй.
 */
const UNDEF = new Set(['then', 'toJSON', '$$typeof', '__esModule', 'nodeType', 'asymmetricMatch', 'ref', 'key']);

export function mkStub(name = 'arcgis') {
  const target = function ArcgisStub() {};
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') {
        if (k === Symbol.toPrimitive) return () => `[stub ${name}]`;
        if (k === Symbol.toStringTag) return `stub ${name}`;
        return undefined;
      }
      if (UNDEF.has(k)) return undefined;
      if (k === 'toString' || k === 'valueOf') return () => `[stub ${name}]`;
      if (k === 'destroyed') return false;
      if (k === 'length') return 0;
      if (k === 'prototype') return t.prototype;
      return mkStub(`${name}.${k}`);
    },
    set() { return true; },
    has() { return true; },
    construct() { return mkStub(`${name}#`); },
    apply() { return mkStub(`${name}()`); },
  });
}

export default mkStub('@arcgis/core');
