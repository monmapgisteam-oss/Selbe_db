'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

/** localStorage түлхүүр — `layout.tsx`-ийн FOUC-ийн эсрэг скрипт ч энэ утгыг уншина */
export const THEME_KEY = 'selbe-theme';

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
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    setTheme(saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  // Уншиж дуустал DOM-д хүрэхгүй — inline скриптийн тавьсан утга хэвээр үлдэнэ
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
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
