'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

// ⚠️ 2026-09-25: Provider-гүй анхдагч ч DARK — порталын анхдагч сэдэв (`THEME_INIT`).
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

/**
 * localStorage түлхүүр — ⚠️ `themeKey.ts`-ээс (client-гүй модуль). Урьд нь ЭНД
 * зарлаад layout.tsx (сервер) импортлоход client reference proxy болж, FOUC
 * скрипт эвдэрдэг байсан (тайлбарыг `themeKey.ts`-ээс). Client талын хуучин
 * импортуудад зориулж дахин экспортолно.
 */
import { THEME_KEY } from './themeKey';
export { THEME_KEY };

/** FOUC скриптийн тавьсан сэдэв — сервер/тестэд DARK (`THEME_INIT`-ийн анхдагч). */
function domTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  /**
   * `null` = хадгалсан сонголтыг хараахан уншаагүй.
   *
   * ⚠️ Анх `'light'`-ээр эхлүүлдэг байсан нь layout.tsx дахь FOUC-ийн эсрэг
   * скриптийг ДАРЖ БИЧДЭГ байв: тэр скрипт `dark` тавьсны дараа энэ эффект
   * шууд `light` болгож, дараа нь буцаад `dark` болгодог — өөрөөр хэлбэл
   * ачаалалт бүрд харанхуй→цайвар→харанхуй анивчилт өгч, localStorage-д
   * түр зуурын буруу утга бичдэг байлаа.
   */
  const [theme, setTheme] = useState<Theme | null>(null);

  /**
   * Эхлэхдээ: хадгалсан сонголт → байхгүй/хүчингүй бол DARK.
   *
   * ⚠️ 2026-09-25: layout.tsx-ийн `THEME_INIT`-тэй ЯГ ИЖИЛ дүрэм
   *    (`saved === 'light' ? 'light' : 'dark'`). Урьд нь энд хадгалалтгүй үед
   *    СИСТЕМИЙН тохиргоог (`matchMedia`) дагаж, хадгалсан утгыг ШАЛГАЛТГҮЙ
   *    тавьдаг байв: цайвар ОС-той анхны зочинд скрипт dark тавьсны дараа энэ
   *    эффект light болгож (анивчилт), localStorage-д бичдэг тул DARK анхдагч
   *    хэзээ ч ирдэггүй; хуучирсан 'auto' нь `data-theme='auto'` болж `:root`-ийн
   *    цайвар токен руу унаж, буцаж хадгалагддаг байлаа.
   */
  useEffect(() => {
    /* ⚠️ try/catch (2026-09-07): хувийн горимд `getItem` ШИДДЭГ бөгөөд
       эффект дотор шидсэн алдаа БҮХ аппыг унагана — өнгөний сонголт
       санагдахгүй нь ердөө тав тухын асуудал. */
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch { /* хувийн горим — DARK анхдагч */ }
    setTheme(saved === 'light' ? 'light' : 'dark');
  }, []);

  // Уншиж дуустал DOM-д хүрэхгүй — inline скриптийн тавьсан утга хэвээр үлдэнэ
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    /* ⚠️ try/catch (2026-09-07): бичилт шидвэл эффект унаж БҮХ апп
       эвдэрнэ. Сэдэв нь DOM дээр аль хэдийн тавигдсан тул хадгалалт
       унасан ч ЭНЭ сешнд зөв харагдана. */
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* хувийн горим — сонголт санагдахгүй */ }
  }, [theme]);

  /* ⚠️ 2026-09-25 аудит: УНШААГҮЙ ҮЕИЙН НӨӨЦ = DOM-ийн бодит сэдэв. Урьд нь
     `'light'` тул FOUC скрипт `dark` тавьсан хуудсанд эхний зурагт context
     «light» гэж хэлж, график/газрын зураг цайвар өнгөөр зурагдаад анивчдаг,
     анхны товшилт ч `light → dark` (өөрчлөлтгүй) болдог байв. `documentElement`
     -ийн `data-theme` (скриптийн тавьсан), эс бөгөөс DARK анхдагч. */
  const shown: Theme = theme ?? domTheme();
  return (
    <Ctx.Provider
      value={{
        theme: shown,
        toggle: () => setTheme((t) => ((t ?? domTheme()) === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
