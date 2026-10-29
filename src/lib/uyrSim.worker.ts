/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛЫН ВЭБ АЖИЛТАН (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 * Протокол: оролт `SimInput` → `{type:'progress'}`* → `{type:'done', out}` (буфер
 * transfer) эсвэл `{type:'error', code, arg, message}`. Цуцлалт = `terminate`.
 */

import { runFloodSim, SimError, transferList, type SimInput, type SimProgress } from '@/lib/uyrSimCore';

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
