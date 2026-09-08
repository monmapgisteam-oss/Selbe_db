'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

/**
 * localStorage түлхүүр — ⚠️ `themeKey.ts`-ээс (client-гүй модуль). Урьд нь ЭНД
 * зарлаад layout.tsx (сервер) импортлоход client reference proxy болж, FOUC
 * скрипт эвдэрдэг байсан (тайлбарыг `themeKey.ts`-ээс). Client талын хуучин
 * импортуудад зориулж дахин экспортолно.
 */
import { THEME_KEY } from './themeKey';
export { THEME_KEY };

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

  // Эхлэхдээ: хадгалсан сонголт → байхгүй бол системийн тохиргоо
  useEffect(() => {
    /* ⚠️ try/catch (2026-09-07): хувийн горимд `getItem` ШИДДЭГ бөгөөд
       эффект дотор шидсэн алдаа БҮХ аппыг унагана — өнгөний сонголт
       санагдахгүй нь ердөө тав тухын асуудал. */
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY) as Theme | null;
    } catch { /* хувийн горим — системийн тохиргоог дагана */ }
    setTheme(saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
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

  return (
    <Ctx.Provider
      value={{
        theme: theme ?? 'light',
        toggle: () => setTheme((t) => ((t ?? 'light') === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
