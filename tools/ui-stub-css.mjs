/**
 * UI SMOKE — `*.css` / `*.module.css` импортын СТУБ (`ts-alias-hooks.mjs`, ui горим).
 *
 * `import s from './x.module.css'` → `s.foo === 'foo'`: класс нэр нь өөрөө буцна,
 * тул markup-д уншигдахуйц класс гарна (`class="card"`). Хажуугийн импорт
 * (`import './globals.css'`) юу ч хийхгүй.
 *
 * ⚠️ `then`/`default`/`__esModule` зэрэг тусгай нэрэнд undefined — Proxy-г
 *    amлалт/модуль мэт андуурахаас.
 */
const SPECIAL = new Set(['then', 'default', '__esModule', 'toJSON', 'constructor', 'prototype']);

const cssProxy = new Proxy(Object.create(null), {
  get: (_, k) => (typeof k === 'string' && !SPECIAL.has(k) ? k : undefined),
  has: (_, k) => typeof k === 'string' && !SPECIAL.has(k),
});

export default cssProxy;
