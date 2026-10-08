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
 *     q(t+Δt) = ( q(t) − g·hf·Δt·S ) / ( 1 + g·Δt·n²·|q| / hf^(7/3) )
 *
 *   hf — урсгалын гүн: max(z+d) − max(z)  (усны гадаргуугаас ЁРООЛЫН өндөр)
 *   S  — усны ГАДАРГУУГИЙН налуу (z+d-ийн зөрүү / Δx)  ← «өндөржилтийн дагуу»
 *   n  — Маннингийн барзгар байдал
 *
 * ⚠️ Энэ нь ЯГ ArcGIS Pro-гийн Flood Simulation-ы зарчим: ус нь өндрийн
 * зөрүүгээр л хөдөлж, барзгар байдал түүнийг сааруулна. Гүн, ХУРД, ЧИГЛЭЛ
 * гурвуулаа шийдлээс ӨӨРӨӨ гарна — гараар зурсан буфер БИШ.
 *
 * ⚠️ Яагаад бүтэн Навье-Стоксыг биш вэ: инерцийн схем нь хотын үерийн
 * загварчлалын салбарын стандарт (LISFLOOD-FP, Bates 2010) бөгөөд хөтөч дээр
 * секундэд багтана. Бүтэн шийдэл нь сервер, GPU шаардана.
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
   * ⚠️ Байхгүй бол хуучин файл: URL хувиргалтгүй татна.
   */
  version?: string;
  /**
   * Тор нь НӨХӨӨС агуулж байна уу.
   * ⚠️ `false` (mesh + DEM нийлүүлсэн тор) бол БҮХ нүд бодит өндөртэй тул
   * нөхөөс таних алхам АЛГАСАГДАНА. `true`/байхгүй (зөвхөн mesh) бол
   * булангуудыг таньж домэйноос хасна.
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
   *
   * ⚠️ Яагаад хэрэгтэй вэ: mesh нь квадрат БИШ, ХАЗГАЙ ТУУЗ (Сэлбэ голын
   * хөндий). Тор нь квадрат тул булангууд mesh-ийн ГАДНА үлддэг ба
   * `tools/dsm-mesh.py` тэдгээрийг хөршийн дунджаар нөхдөг. Үр дүнд ~33%
   * нүд нь ЯГ ИЖИЛ өндөртэй ХИЙМЭЛ ТЭГШ ТАЛБАЙ болдог (амьдаар хэмжив:
   * 1405.2 м-т 54,654 нүд; 1345.8 м-т 31,701 нүд).
   *
   * ⚠️ Түүнийг таньж салгахгүй бол ус тэр тэгш талбай дээр гарч ирээд
   * ХЯЗГААРГҮЙ нимгэн хальс болж тархана — «үер» нь бодит бус хэлбэртэй
   * болно. Одоо тэдгээр нь ДОМЭЙНЫ ГАДНА гэж тооцогдож, ус тэнд ороход
   * СИСТЕМЭЭС ГАРНА (мэдлэгийн хил).
   */
  valid: Uint8Array;
  /**
   * MESH-ЭЭС гарсан нүд (1) эсэх — 3D mesh байхгүй газар 0 (тэнд DEM).
   *
   * ⚠️ ХОЁР ЭХ СУРВАЛЖ (`tools/dem-mesh.py`): төслийн талбайд IntegratedMesh
   * (4.2 м, барилгатай), бусад талбайд SRTM DEM (~30 м, зөвхөн рельеф).
   * Судалгааны талбай нь MESH-ийн хүрээ тул ХУР ТУНАДАС зөвхөн тэнд ордог
   * — DEM хэсэг нь зөвхөн ус ГАРАХ, эсвэл дээрээс УРСАЖ ОРОХ зам.
   */
  mesh: Uint8Array;
};

/**
 * НӨХӨӨС НҮДИЙГ ТАНИНА — захаас эхэлсэн, ЯГ ИЖИЛ утгатай холбоост муж.
 *
 * ⚠️ Тодорхой өндрийг (1405.2 …) КОДОД БИЧИХГҮЙ: mesh шинэчлэгдэхэд утга нь
 * өөрчлөгдөнө. Оронд нь БҮТЦЭЭР танина — бодит газрын гадаргуу нь хэдэн
 * зуун нүдэн дээр ЯГ ижил дециметрт тэгширдэггүй, харин нөхөөс тэгширдэг.
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
     * ⚠️ МЕТАГ КЭШЛЭХГҮЙ, ТОРЫГ ХУВИЛБАРААР КЭШЛЭНЭ.
     *
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
    /* ⚠️ 2026-09-30: статик файлд ч timeout — гацсан хүсэлт `dsmPending`-ийг мөнхөд
       барьж «шинжилгээ хийх» товч хариугүй үлддэг байв. Тор (МБ) илүү удаан: 120с. */
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
    /**
     * ⚠️ НӨХӨӨС ТАНИХ нь зөвхөн ЗӨВХӨН MESH-ийн тор дээр хэрэгтэй. Одоогийн
     * тор (`tools/dem-mesh.py`) нь mesh-ийн ГАДНАХ бүх нүдийг SRTM DEM-ээр
     * дүүргэдэг тул нөхөөс БАЙХГҮЙ — бүх тор бодит өндөртэй, бүгд домэйн.
     * Ийм тор дээр таних алгоритм ажиллуулбал тэгш дээвэр, усан сан зэрэг
     * БОДИТ тэгш мужийг андуурч хасах эрсдэлтэй.
     */
    const valid = meta.padded === false
      ? new Uint8Array(n).fill(1)
      : maskPadding(raw, meta.grid);
    /**
     * ⚠️ MESH-ийн маск нь ХОЁР ДАХЬ хавтас (1 байт/нүд, uint16-гийн ДАРАА).
     * Байхгүй бол (зөвхөн mesh-ийн хуучин файл) БҮГД mesh гэж үзнэ — тэр
     * файлын бүх нүд mesh-ээс гарсан.
     */
    const mesh = meta.srcPlane && buf.byteLength >= n * 3
      ? new Uint8Array(buf.slice(n * 2, n * 3))
      : new Uint8Array(n).fill(1);
    dsmCache = { meta, z, valid, mesh };
    return dsmCache;
  })();
  /**
   * ⚠️ УНАСАН АМЛАЛТЫГ КЭШЛЭХГҮЙ (2026-09-15). Урьд нь `dsmPending` нь
   * няцаагдсан амлалтаа хадгалдаг байсан тул сүлжээний ТҮР зуурын алдааны
   * дараа хуудсыг refresh хийхээс нааш дахин оролдлого БҮГД шууд ижил
   * алдаагаар унадаг байв («шинжилгээ хийх» товч ажиллахаа больсон мэт).
   */
  dsmPending.catch(() => { dsmPending = null; });
  return dsmPending;
}

/* ══════════════════════ Голын голдрил ══════════════════════ */

let riverPending: Promise<SimArea> | null = null;

/**
 * ГОЛЫН ПОЛИГОНЫ ЦАГИРАГУУД — Web Mercator (102100), нэг удаа татна.
 *
 * ⚠️ ArcGIS SDK-г ЭНД импортлохгүй: `uyrSim` нь цэвэр тооцооны модуль бөгөөд
 * вэб ажилтан руу зөөх боломжтой байх ёстой. `ersdelGeom.loadRiver()` нь
 * `Polygon` объект буцаадаг тул SDK чирнэ — оронд нь REST-ээс шууд цагираг.
 *
 * ⚠️ `maxAllowableOffset: 2` — `ersdelGeom`-той ИЖИЛ ерөнхийлөлт (4,376 орой
 * → 572). 16.9 м-ийн тооцооны нүдэнд 2 м-ийн зөрүү нөлөөлөхгүй.
 */
async function loadRiverRings(): Promise<SimArea> {
  riverPending ??= (async () => {
    const def = LAYER_BY_ID['sb:16'];
    if (!def) throw new Error(tr('Голын давхарга каталогт алга'));
    /* ⚠️ 2026-09-30: урьд нь GET + `cache: 'force-cache'` + токен query string-д —
       токен хөтчийн HTTP кэшийн түлхүүрт орж диск дээр үлддэг байв. Одоо
       `query.arcgisPost` (токен биеэр, 200-аар ирдэг `{error}` цөмд); кэш нь энэ
       модулийн санах ой (`riverPending`, токенгүй) — сесс дотор нэг л удаа татна. */
    /* ⚠️ 2026-10-09: `exceededTransferLimit` → OID-оор эрэмбэлж хуудаслана (`ersdel.queryRingsPaged`) */
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
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ТООЦООНЫ БИЕ `uyrSimCore.ts`-д
 *    (цэвэр, DOM/SDK/tr-гүй) зөөгдөв. Тохиргооны тогтмолууд (SIM, Маннинг,
 *    гидрограф, рациональ арга, CFL …) ба тэдгээрийн ⚠️ үндэслэл ТЭНД.
 *    Энэ файл нь: (1) DSM ба голын цагирагийг ҮНДСЭН урсгалд татна (токен,
 *    `fetch`-ийн кэш энд), (2) тооцоог ВЭБ АЖИЛТАНД (`uyrSim.worker.ts`)
 *    илгээнэ — газрын зураг, гүйгч, товч 1–3 секунд гацахаа больсон,
 *    (3) ажилтан байхгүй/унасан бол ЯГ ТЭР цөмийг үндсэн урсгалд амьсгалтайгаар
 *    ажиллуулна, (4) гаралтыг `floodDataFromBuffer`-ээр савлана (canvas →
 *    зөвхөн үндсэн урсгалд).
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
 *
 * ⚠️ `new Worker(new URL('./uyrSim.worker.ts', import.meta.url))` хэлбэрийг ЯГ
 *    ингэж бичнэ: Next-ийн (webpack/Turbopack) статик экспорт энэ ЗАГВАРЫГ таньж
 *    ажилтны багцыг тусад нь гаргадаг. Хувьсагчид хадгалсан URL-ыг танихгүй.
 * ⚠️ Node (тест), хуучин хөтөч — `Worker` байхгүй → `null`.
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
 * ⚠️ Нийт хугацаа БИШ: явцын мэдэгдэл бүр цагийг дахин эхлүүлнэ. Ердийн
 *    загварчлал 1–3 сек, явц нь алхам тутам ирдэг тул 120 сек чимээгүй
 *    байна гэдэг нь ажилтан гацсан (эсвэл хариу нь алдагдсан) гэсэн үг.
 */
const WORKER_IDLE_MS = 120_000;

/**
 * Ажилтанд ажиллуулна. Ажилтан ачаалагдаж ЧАДААГҮЙ бол (`error` үйл явдал —
 * скрипт олдсонгүй, CSP) `'fallback'` буцаана; цөмийн алдаа бол шиднэ.
 *
 * ⚠️ 2026-10-09: `messageerror` (хариуг задалж чадсангүй) ба ЧИМЭЭГҮЙ
 *    ГАЦАЛТ (`WORKER_IDLE_MS`) — хоёулаа ажилтныг зогсоож `'fallback'`.
 *    Урьд нь эдгээр үед Promise хэзээ ч шийдэгдэхгүй, UI «бодож байна»-д
 *    мөнхөд үлддэг байв.
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
    /* ⚠️ 2026-10-09: чимээгүй гацалтын хамгаалалт — мэдэгдэл бүрд дахин эхэлнэ */
    const arm = () => {
      if (watchdog != null) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (settled) return;
        finish();
        resolve('fallback');
      }, WORKER_IDLE_MS);
    };
    /* ⚠️ ЦУЦЛАЛТ — `terminate()` нь давталтыг ТЭР ДОР нь зогсооно (үндсэн урсгалын
       хувилбар шиг 60 алхам хүлээхгүй) */
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
    /* ⚠️ 2026-10-09: хариуг задалж чадаагүй — үндсэн урсгалд дахин бодно */
    w.onmessageerror = () => {
      if (settled) return;
      finish();
      resolve('fallback');
    };
    arm();
    /* ⚠️ DSM-ийн массивыг TRANSFER ХИЙХГҮЙ (хуулна) — `dsmCache`-ийг салгачихна */
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
 * ⚠️ ЯАГААД ЖИГД БОРОО БИШ ВЭ: 2026-09-07-нд бүх торонд жигд бороо буулгахад
 * «усанд автсан» нь домэйны 68% болж байв — тэр нь үер БИШ, борооны хальс.
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
  /* ⚠️ ГОЛ ТАТАГДААГҮЙ БОЛ ЗОГСОХГҮЙ — шатаалтгүйгээр үргэлжилнэ */
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
    /* ⚠️ ҮНДСЭН УРСГАЛ — 60 алхам тутам хөтөчид амьсгал өгч, цуцлалтыг шалгана */
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
