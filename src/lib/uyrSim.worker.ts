/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛЫН ВЭБ АЖИЛТАН (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 * ⚠️ Урьд нь загварчлал (~45,000 нүд × 1,500–3,500 алхам) хөтчийн ҮНДСЭН урсгалд
 *    явж, 60 алхам тутам `setTimeout(0)`-оор амьсгал авдаг байсан ч газрын зураг,
 *    гүйгч, товчнууд 1–3 секунд ацаглагддаг байв. Одоо тооцоо энд, тусдаа урсгалд.
 *
 * ⚠️ Зөвхөн `uyrSimCore.ts` (цэвэр тооцоо) импортлоно — `document`, ArcGIS SDK,
 *    `tr()`, токен энд БАЙХГҮЙ. DSM ба голын цагирагийг үндсэн урсгал татаж
 *    ОРОЛТООР өгнө (`uyrSim.ts` §simulateFlood).
 *
 * Протокол: оролт `SimInput` → `{type:'progress'}`* → `{type:'done', out}` (буфер
 * transfer) эсвэл `{type:'error', code, arg, message}`. Цуцлалт = `terminate()`.
 */

import { runFloodSim, SimError, transferList, type SimInput, type SimProgress } from '@/lib/uyrSimCore';

/**
 * ⚠️ `self`-ийн төрөл — tsconfig-д `webworker` lib байхгүй (DOM-тай зөрчилдөнө)
 *    тул шаардлагатай хоёр гишүүнийг л тодорхойлно.
 */
const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<SimInput>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (ev) => {
  const inp = ev.data;
  runFloodSim(inp, {
    onProgress: (p: SimProgress) => ctx.postMessage({ type: 'progress', p }),
  })
    .then((out) => ctx.postMessage({ type: 'done', out }, transferList(out)))
    .catch((e: unknown) => {
      ctx.postMessage({
        type: 'error',
        code: e instanceof SimError ? e.code : null,
        arg: e instanceof SimError ? e.arg : 0,
        message: e instanceof Error ? e.message : String(e),
      });
    });
};
