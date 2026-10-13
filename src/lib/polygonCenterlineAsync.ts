import { polygonCenterlines, type CenterlineOptions, type CenterlineResult } from './polygonCenterline';

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, { resolve: (result: CenterlineResult) => void; reject: (error: Error) => void }>();

/** Том замын тэнхлэг тооцоход газрын зургийг гацаахгүй — тусдаа worker ашиглана. */
export async function polygonCenterlinesAsync(rings: number[][][], options: CenterlineOptions): Promise<CenterlineResult> {
  if (typeof Worker === 'undefined') return polygonCenterlines(rings, options);
  if (!worker) {
    worker = new Worker(new URL('./polygonCenterline.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: CenterlineResult; error?: string }>) => {
      const { id, result, error } = event.data;
      const job = pending.get(id); pending.delete(id);
      if (error || !result) job?.reject(new Error(error ?? 'Centerline worker returned no result'));
      else job?.resolve(result);
      if (!pending.size) { worker?.terminate(); worker = null; }
    };
    worker.onerror = () => {
      for (const job of pending.values()) job.reject(new Error('Centerline worker failed'));
      pending.clear(); worker?.terminate(); worker = null;
    };
  }
  const id = ++sequence;
  return new Promise<CenterlineResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { worker!.postMessage({ id, rings, options }); }
    catch (error) { pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
  });
}
