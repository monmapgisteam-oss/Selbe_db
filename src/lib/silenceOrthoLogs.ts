/**
 * UBHUB ортофотогийн console-алдааг ЧИМЭЭГҮЙ болгох (side-effect модуль).
 *
 * `log.interceptors` эдгээр алдааг барьдаггүй тул console түвшинд шүүв.
 */
if (typeof window !== 'undefined') {
  const g = globalThis as unknown as { __selbeOrthoErrFilter?: boolean };
  if (!g.__selbeOrthoErrFilter) {
    g.__selbeOrthoErrFilter = true;
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const s = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      if (
        /\[esri\.(layers\.ImageryLayer|views\.support\.LayerViewManager)\]/.test(s) &&
        /['" :]imagery/i.test(s)
      ) {
        return; // UBHUB ортофотогийн load/layerview-алдаа — чимээгүй
      }
      if (/\[esri\.views\.3d\b/.test(s) && /unsupported in 3D/i.test(s)) {
        return;
      }
      orig(...(args as []));
    };
  }
}

export {};
