'use client';

/**
 * ВЭБ ДЭЭРХ ҮЕРИЙН ЗАГВАРЧЛАЛ — 3D mesh-ийн DSM дээр, хөтөч дотор.
 *
 * ══════════════════ ЯАГААД ВЭБ ДЭЭР ТООЦОХ БОЛСОН БЭ ══════════════════
 *
 * Урьд нь ArcGIS Pro-гийн Flood Simulation-ы гаралтыг (CRF) бэлэн авчирдаг
 * байсан. Тэр нь МУУ DEM дээр тооцогдсон тул хаягдав (хэрэглэгчийн шийдвэр,
 * 2026-09-07). Одоо өндрийг төслийн ӨӨРИЙН 3D mesh-ээс гаргаж
 * (`tools/dsm-mesh.py` → `/uyr/selbe-dsm.bin`), усны хөдөлгөөнийг хөтөч дээр
 * шууд бодно.
 *
 * ══════════════════ ЗАГВАР ══════════════════
 *
 * LISFLOOD-FP-ийн ИНЕРЦИЙН схем (Bates нар, 2010) — гүехэн усны тэгшитгэлийн
 * хялбарчилсан хувилбар. Хоёр хөрш нүдний хооронд урсгалыг:
 *
 *     q(t+Δt) = ( q(t) − g·hf·Δt·S) / ( 1 + g·Δt·n²·|q| / hf^(7/3))
 *
 *   hf — урсгалын гүн: max(z+d) − max(z)  (усны гадаргуугаас ЁРООЛЫН өндөр)
 *   S  — усны ГАДАРГУУГИЙН налуу (z+d-ийн зөрүү / Δx)  ← «өндөржилтийн дагуу»
 *   n  — Маннингийн барзгар байдал
 */

import { t as tr } from '@/lib/i18nCore';
import { FLOOD_LEVELS, queryRingsPaged, type LevelKey } from '@/lib/ersdel';
import { floodDataFromBuffer, type FloodData } from '@/lib/uyr';
import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import {
  abortError, runFloodSim, SimError,
  type SimArea, type SimInput, type SimOutput, type SimProgress,
} from '@/lib/uyrSimCore';

/* ══════════════════════ DSM ══════════════════════ */

export type DsmMeta = {
  source: string;
  grid: number;
  wkid: number;
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  /** Нүдний газрын хэмжээ (м) */
  cellM: number;
  /** uint16 → метр: z = baseZ + raw / scale */
  baseZ: number;
  scale: number;
  zMin: number;
  zMax: number;
  nodes?: number;
  /**
   * Агуулгын хэш — торны URL-д ордог (`?v=`).
   */
  version?: string;
  /**
   * Тор нь НӨХӨӨС агуулж байна уу.
   */
  padded?: boolean;
  /** Mesh-ээс гарсан нүдний тоо (үлдсэн нь DEM) */
  meshCells?: number;
  /** Хоёр дахь хавтас — эх сурвалжийн маск (1 = mesh) байгаа эсэх */
  srcPlane?: boolean;
  /** DEM-д хийсэн босоо шилжилт (м) */
  demShiftM?: number;
};

export type Dsm = {
  meta: DsmMeta;
  z: Float32Array;
  /**
   * МЕШИЙН БОДИТ ХҮРЭЭ — 1 = 3D mesh-ээс гарсан өндөр, 0 = НӨХӨӨС.
   */
  valid: Uint8Array;
  /**
   * MESH-ЭЭС гарсан нүд (1) эсэх — 3D mesh байхгүй газар 0 (тэнд DEM).
   */
  mesh: Uint8Array;
};

/**
 * НӨХӨӨС НҮДИЙГ ТАНИНА — захаас эхэлсэн, ЯГ ИЖИЛ утгатай холбоост муж.
 *
 * @param minArea үүнээс ЖИЖИГ тэгш муж нь бодит (жишээ нь тэгш дээвэр) —
 *   таслахгүй
 */
function maskPadding(raw: Uint16Array, N: number, minArea = 400): Uint8Array {
  const valid = new Uint8Array(N * N).fill(1);
  const seen = new Uint8Array(N * N);
  const stack: number[] = [];
  const region: number[] = [];
  const border = (i: number) => {
    const x = i % N;
    const y = (i / N) | 0;
    return x === 0 || y === 0 || x === N - 1 || y === N - 1;
  };
  for (let b = 0; b < N * N; b++) {
    if (seen[b] || !border(b)) continue;
    const val = raw[b];
    stack.length = 0;
    region.length = 0;
    stack.push(b);
    seen[b] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % N;
      const y = (i / N) | 0;
      if (x > 0 && !seen[i - 1] && raw[i - 1] === val) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < N - 1 && !seen[i + 1] && raw[i + 1] === val) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !seen[i - N] && raw[i - N] === val) { seen[i - N] = 1; stack.push(i - N); }
      if (y < N - 1 && !seen[i + N] && raw[i + N] === val) { seen[i + N] = 1; stack.push(i + N); }
    }
    if (region.length >= minArea) for (const i of region) valid[i] = 0;
  }
  return valid;
}

let dsmCache: Dsm | null = null;
let dsmPending: Promise<Dsm> | null = null;

/** Өндрийн торыг нэг удаа татаад кэшилнэ */
export async function loadDsm(): Promise<Dsm> {
  if (dsmCache) return dsmCache;
  dsmPending ??= (async () => {
    /**
     * Урьд нь ХОЁУЛАА `force-cache` байсан нь ноцтой алдаа байв: тор дахин
     * үүсгэгдсэн ч (`tools/dem-mesh.py`) URL нь ижил хэвээр тул хөтөч ХУУЧИН
     * файлыг өгсөөр байдаг. 2026-09-10-нд яг ийм зүйл болов — битүү гүүрийг
     * нээсэн засвар хэрэглэгчид ХҮРЭЛГҮЙ, «гүүрээр ус нэвт урсахгүй байна»
     * гэсэн зөв гомдол гарсан.
     *
     * Одоо: мета (300 байт) нь ҮРГЭЛЖ шинэчлэгдэж, түүний доторх агуулгын
     * хэш (`version`) нь торны URL-д ордог. Өгөгдөл өөрчлөгдмөгц хаяг
     * өөрчлөгдөх тул кэш өөрөө хүчингүй болно.
     */
    const meta = await fetch('/uyr/selbe-dsm.json', { cache: 'no-cache', signal: AbortSignal.timeout(30_000) })
      .then((r) => {
        if (!r.ok) throw new Error(tr('DSM мета уншигдсангүй ({0})', r.status));
        return r.json() as Promise<DsmMeta>;
      });
    const url = meta.version
      ? `/uyr/selbe-dsm.bin?v=${meta.version}`
      : '/uyr/selbe-dsm.bin';
    const buf = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(120_000) }).then((r) => {
      if (!r.ok) throw new Error(tr('DSM тор уншигдсангүй ({0})', r.status));
      return r.arrayBuffer();
    });
    const n = meta.grid * meta.grid;
    if (buf.byteLength < n * 2) {
      throw new Error(tr('DSM тор дутуу: {0} / {1} байт', buf.byteLength, n * 2));
    }
    const raw = new Uint16Array(buf, 0, n);
    const z = new Float32Array(n);
    for (let i = 0; i < n; i++) z[i] = meta.baseZ + raw[i] / meta.scale;
    const valid = meta.padded === false
      ? new Uint8Array(n).fill(1)
      : maskPadding(raw, meta.grid);
    const mesh = meta.srcPlane && buf.byteLength >= n * 3
      ? new Uint8Array(buf.slice(n * 2, n * 3))
      : new Uint8Array(n).fill(1);
    dsmCache = { meta, z, valid, mesh };
    return dsmCache;
  })();
  dsmPending.catch(() => { dsmPending = null; });
  return dsmPending;
}

/* ══════════════════════ Голын голдрил ══════════════════════ */

let riverPending: Promise<SimArea> | null = null;

/**
 * ГОЛЫН ПОЛИГОНЫ ЦАГИРАГУУД — Web Mercator (102100), нэг удаа татна.
 */
async function loadRiverRings(): Promise<SimArea> {
  riverPending ??= (async () => {
    const def = LAYER_BY_ID['sb:16'];
    if (!def) throw new Error(tr('Голын давхарга каталогт алга'));
    const rings = await queryRingsPaged(layerUrl(def), {
      where: '1=1', outFields: '', returnGeometry: 'true', outSR: '102100',
      maxAllowableOffset: '2',
    }) as SimArea;
    if (!rings.length) throw new Error(tr('Голын давхарга хоосон байна'));
    return rings;
  })();
  riverPending.catch(() => { riverPending = null; });
  return riverPending;
}

/* ══════════════════════ Загварчлал — ажилтан эсвэл үндсэн урсгал ══════════════════════
 */

export {
  pickInlets, limitOutflow, peakInflow, hydroQ,
  type SimArea, type SimProgress,
} from '@/lib/uyrSimCore';

/** Цөмийн алдааг хэрэглэгчийн хэлээр */
function simMessage(code: string | null | undefined, arg: number, fallback: string): string {
  if (code === 'small') return tr('Зурсан талбай хэт жижиг эсвэл өндрийн торноос гадуур ({0} нүд)', arg);
  return fallback;
}

/** Ажилтны хариу */
type WorkerMsg =
  | { type: 'progress'; p: SimProgress }
  | { type: 'done'; out: SimOutput }
  | { type: 'error'; code: string | null; arg: number; message: string };

/**
 * ВЭБ АЖИЛТАН үүсгэнэ — боломжгүй бол `null` (үндсэн урсгал руу ухарна).
 */
function makeWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./uyrSim.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/**
 * Ажилтны ЧИМЭЭГҮЙ БАЙДЛЫН хязгаар (мс) — 2026-10-09.
 */
const WORKER_IDLE_MS = 120_000;

/**
 * Ажилтанд ажиллуулна. Ажилтан ачаалагдаж ЧАДААГҮЙ бол (`error` үйл явдал —
 * скрипт олдсонгүй, CSP) `'fallback'` буцаана; цөмийн алдаа бол шиднэ.
 */
function runInWorker(
  w: Worker,
  inp: SimInput,
  onProgress: ((p: SimProgress) => void) | undefined,
  signal: AbortSignal | null | undefined,
): Promise<SimOutput | 'fallback'> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      settled = true;
      if (watchdog != null) clearTimeout(watchdog);
      w.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const arm = () => {
      if (watchdog != null) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (settled) return;
        finish();
        resolve('fallback');
      }, WORKER_IDLE_MS);
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(abortError());
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort);
    w.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      const m = ev.data;
      if (settled) return;
      if (m.type === 'progress') { arm(); onProgress?.(m.p); return; }
      finish();
      if (m.type === 'done') resolve(m.out);
      else {
        const err = new Error(simMessage(m.code, m.arg, m.message));
        reject(err);
      }
    };
    w.onerror = (ev) => {
      if (settled) return;
      ev.preventDefault?.();
      finish();
      resolve('fallback');
    };
    w.onmessageerror = () => {
      if (settled) return;
      finish();
      resolve('fallback');
    };
    arm();
    w.postMessage(inp);
  });
}

/**
 * ҮЕРИЙГ БОДНО.
 *
 * ГИНЖИН ХЭЛХЭЭ (ArcGIS Flood Simulation-тай ижил дараалал):
 *
 *   1. ХУР ТУНАДАС (`rain`, мм/ц)
 *   2. → ОРГИЛ УРСАЦ  — рациональ арга (`peakInflow`)
 *   3. → ГИДРОГРАФ    — өсөлт · оргил · татралт (`hydroQ`, оргил = ЯГ `peakQ`)
 *   4. → голын оролтын нүднүүдээр торонд орно (`pickInlets`)
 *   5. → 2D инерцийн шийдэл: ус нь ЗӨВХӨН өндрийн зөрүүгээр тархана
 *   6. → гүн · хурд · чиглэл (24 агшин) + дээд гүн/хурд + ирэх хугацаа
 *
 * @param level  аюулын түвшин — `FLOOD_LEVELS`-ээс хур тунадас
 * @param onProgress явцыг мэдэгдэх (UI-ийн явцын мөр)
 * @param area   хэрэглэгчийн зурсан талбай — байвал домэйн нь ЭНЭ
 * @param signal ЦУЦЛАХ дохио (2026-09-21) — цуцлагдвал `AbortError`; дуудагч
 *   үүнийг алдаа гэж ҮЗҮҮЛЭХГҮЙ.
 */
export async function simulateFlood(
  level: LevelKey,
  onProgress?: (p: SimProgress) => void,
  area?: SimArea | null,
  signal?: AbortSignal | null,
): Promise<FloodData> {
  const dsm = await loadDsm();
  const river = await loadRiverRings().catch(() => null);
  if (signal?.aborted) throw abortError();
  const inp: SimInput = {
    dsm: { meta: dsm.meta, z: dsm.z, valid: dsm.valid, mesh: dsm.mesh },
    river,
    rain: FLOOD_LEVELS[level].rain,
    area: area ?? null,
  };

  let out: SimOutput | 'fallback' = 'fallback';
  const w = makeWorker();
  if (w) out = await runInWorker(w, inp, onProgress, signal);
  if (out === 'fallback') {
    try {
      out = await runFloodSim(inp, {
        onProgress,
        shouldStop: () => !!signal?.aborted,
        yieldFn: () => new Promise((r) => setTimeout(r, 0)),
      });
    } catch (e) {
      if (e instanceof SimError) throw new Error(simMessage(e.code, e.arg, e.message));
      throw e;
    }
  }
  return floodDataFromBuffer(out.meta, out.buf, out.extra);
}
