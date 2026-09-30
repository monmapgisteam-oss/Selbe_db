/**
 * UI SMOKE — `next/dynamic`-ийн СТУБ (`ts-alias-hooks.mjs`, ui горим).
 *
 * `dynamic(loader, { loading })` нь Node-д синхрон компонент буцаана:
 *   · `preloadDynamic()`-ээс ӨМНӨ — `loading()` (байвал) эсвэл placeholder `<div>`;
 *   · дараа нь — loader-ийн шийдсэн ЖИНХЭНЭ компонент (`m.default` эсвэл
 *     `.then((m) => m.X)`-ийн шууд функц).
 *
 * ⚠️ `preloadDynamic` нь бүртгэгдсэн loader-уудыг дараалан await хийнэ; loader
 *    дотроос шинэ `dynamic()` бүртгэгдвэл (Portal → ViewPanel г.м.) давталт
 *    тэднийг ч барина (`for` нь массивын уртыг дахин уншдаг).
 * ⚠️ `ssr:false` гэсэн тохиргоог үл тоомсорлоно — smoke тест нь яг тэр
 *    «клиент дээр л зурагддаг» модулиудыг Node-д зурах зорилготой.
 */
import { createElement } from 'react';

const registry = [];

export default function dynamic(loader, opts = {}) {
  const entry = { loader, comp: null, error: null };
  registry.push(entry);
  function DynamicStub(props) {
    if (entry.comp) return createElement(entry.comp, props);
    if (typeof opts.loading === 'function') {
      return opts.loading({ isLoading: true, pastDelay: true, error: entry.error, retry: () => {} });
    }
    return createElement('div', { 'data-dynamic-stub': 'loading' });
  }
  DynamicStub.displayName = 'DynamicStub';
  return DynamicStub;
}

/** Бүх бүртгэгдсэн loader-ийг ачаална; унасан loader-ийн алдааг буцаана (шидэхгүй). */
export async function preloadDynamic() {
  const errors = [];
  for (let i = 0; i < registry.length; i++) {
    const e = registry[i];
    if (e.comp) continue;
    try {
      const m = await e.loader();
      e.comp = typeof m === 'function' ? m : (m && (m.default ?? m));
    } catch (err) {
      e.error = err;
      errors.push(err);
    }
  }
  return errors;
}

export const __registry = registry;
