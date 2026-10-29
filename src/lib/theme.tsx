'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

/**
 * localStorage түлхүүр — `themeKey.ts`-ээс (client-гүй модуль). Урьд нь ЭНД
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
   */
  /**
   * Эхлэхдээ: хадгалсан сонголт → байхгүй/хүчингүй бол DARK.
   */
  const [theme, setTheme] = useState<Theme | null>(() => {
    if (typeof window === 'undefined') return null;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch { /* хувийн горим — DARK анхдагч */ }
    return saved === 'light' ? 'light' : 'dark';
  });

  // Уншиж дуустал DOM-д хүрэхгүй — inline скриптийн тавьсан утга хэвээр үлдэнэ
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* хувийн горим — сонголт санагдахгүй */ }
  }, [theme]);

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
