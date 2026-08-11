/**
 * Горимын localStorage түлхүүр — `theme.tsx` (client) ба `layout.tsx` (сервер)
 * хоёул эндээс уншина.
 *
 * ⚠️ ЗААВАЛ 'use client'-ГҮЙ тусдаа файл: урьд нь `theme.tsx` ('use client')-аас
 * сервер компонент `layout.tsx` руу импортлогдоход Next нь утгыг CLIENT REFERENCE
 * proxy болгож, `THEME_INIT`-ийн `${THEME_KEY}` нь функцын эх код болон шингэж
 * inline script эвдэрдэг байв (ачаалалт бүрд «SyntaxError: missing )» + FOUC
 * хамгаалалт огт ажиллахгүй).
 */
export const THEME_KEY = 'selbe-theme';
