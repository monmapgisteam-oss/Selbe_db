/**
 * АЖЛЫН ТӨЛӨВЛӨГӨӨНИЙ ЗАДЛАЛТ — ЦЭВЭР логик (JSX-гүй).
 *
 * ⚠️ ЯАГААД `AgentPlan.tsx`-ЭЭС САЛГАСАН БЭ: тэр файл CSS модуль импортолдог тул
 * Node-ийн шалгуураас шууд ачаалагдахгүй (`chart.ts`/`format.ts`/`blocks.ts`-ийн
 * ижил шалтгаан). Задлалт энд байснаар `plan.check.mjs` ЯГ ЭНЭ кодыг шалгана.
 *
 * ⚠️ Төлөвлөгөө нь загварын ЧӨЛӨӨТ текстээр ирнэ (хэрэгсэл дуудаж буй эргэлтийн
 * хамт) — хашилттай ч, хашилтгүй ч, дугаарласан ч, зураастай ч байж болно.
 * Аль ч хэлбэрийг тэвчинэ; задарч чадахгүй бол ХООСОН буцааж, карт зурагдахгүй
 * (хэрэглэгчид түүхий текст ХЭЗЭЭ Ч харагдахгүй).
 */

import { parseBlocks } from './blocks';

/** Нэг картанд багтах дээд тал — урт төлөвлөгөө чатыг дүүргэнэ */
export const MAX_STEPS = 6;

export function planSteps(raw: string): string[] {
  const blocks = parseBlocks(raw);
  const fenced = blocks.find((b) => b.kind === 'plan');
  const body = fenced && fenced.kind === 'plan' ? fenced.raw : raw;

  const list = parseBlocks(body).find((b) => b.kind === 'list');
  if (list && list.kind === 'list' && list.items.length) return list.items.slice(0, MAX_STEPS);

  return String(body)
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}
