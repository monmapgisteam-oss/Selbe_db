import { polygonCenterlines, type CenterlineOptions } from './polygonCenterline';

self.onmessage = (event: MessageEvent<{ id: number; rings: number[][][]; options: CenterlineOptions }>) => {
  const { id, rings, options } = event.data;
  try { self.postMessage({ id, result: polygonCenterlines(rings, options) }); }
  catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
