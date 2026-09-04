'use client';

/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛ — КОДООР бодох хувилбар.
 *
 * ⚠️⚠️ ОДООГООР ХЭРЭГЛЭГДЭХГҮЙ (2026-08-29). `Ersdel.tsx` нь ОБЕГ-ын бэлэн
 * CRF загварчлал (`uyr.ts` → `/uyr/selbe-flood.bin`) руу БУЦСАН — захиалагчийн
 * шийдвэр. Энэ модулийг УСТГААГҮЙ: шалгагдсан, ажиллах байдалтай хэвээр.
 *
 * СЭРГЭЭХ бол `Ersdel.tsx`-д:
 *   1. `loadFloodData` → `sampleTerrain` + `simulate`
 *   2. Ачаалах эффектэд голыг (`loadRiver()`) ба түүний хүрээг дамжуулах
 *   3. Хувилбарын `Stats`-ыг `peakFlow`/`spillVolume`-ээр бодуулах
 *
 * ⚠️ Загварыг бодит өгөгдөл дээр ШАЛГАСАН (2026-08-29): эзлэхүүн зорилтод яг
 * таарч, 25/50/100 мм/ц-д 70.9 / 146.8 / 167.9 га автаж байв.
 *
 * ══════════════════ ЮУ ХИЙДЭГ, ЮУ ХИЙДЭГГҮЙ ══════════════════
 *
 * ХИЙДЭГ:
 *   1. Хур тунадас (мм/ц) → рационал аргаар оргил урсац `Q`
 *   2. Сувгийн багтаамжаас ХЭТЭРСЭН эзлэхүүнийг тооцох
 *   3. Тэр эзлэхүүнийг ГАЗРЫН ӨНДРИЙН загвар дээр «ваннын дүүрэлт»-ээр
 *      тараах — голоос ЗАЛГААТАЙ, усны түвшнээс НАМ нүд л усанд автана
 *   4. Гадаргуугийн налуугаас урсгалын чиглэл/хурд
 *
 * ⚠️ ХИЙДЭГГҮЙ: гидравлик тэгшитгэл (импульс, Saint-Venant), сувгийн
 *    дамжуулалт, хур тунадасны орон зайн жигд бус байдал. Энэ нь
 *    ТӨЛӨВЛӨЛТИЙН ТҮВШНИЙ тооцоо — «бодит загварчлалын үр дүн» ГЭЖ
 *    НЭРЛЭЖ БОЛОХГҮЙ. UI дээр тэмдэглэх үүрэг нь дуудагч талд.
 *
 * ⚠️ 3D SCENE-ИЙН MESH ДЭЭР БОДОХ БОЛОМЖГҮЙ. `IntegratedMeshLayer` нь
 *    фотограмметрийн гурвалжны сүлжээ — программаас өндөр асуух API байхгүй.
 *    Асууж болох цорын ганц гадаргуу нь `map.ground`-ийн `ElevationLayer`.
 *    Гидрологийн хувьд энэ нь ЗӨВ ч сонголт: mesh нь барилга, модны оройг
 *    агуулдаг тул усыг байхгүй хана дээр тосно.
 */

import Multipoint from '@arcgis/core/geometry/Multipoint';
import Point from '@arcgis/core/geometry/Point';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import type Polygon from '@arcgis/core/geometry/Polygon';
import type Extent from '@arcgis/core/geometry/Extent';
import { t as tr } from '@/lib/i18nCore';
import type { FloodData, FloodMeta } from '@/lib/uyr';
import { depthColor } from '@/lib/uyr';

/* ══════════════════ Усны сав, тогтмолууд ══════════════════ */

/**
 * ⚠️ ЭДГЭЭР НЬ ТААМАГ. Сэлбэ голын дээд ай савын талбай ба урсацын
 * коэффициент нь `ersdel.ts`-ийн өмнөх тодорхойлолттой ижил эх сурвалжтай:
 * хотжсон ай сав (хатуу гадаргуу давамгайлсан).
 */
const CATCH_KM2 = 48;
/** Урсацын коэффициент — хотын хатуу гадаргуу давамгайлсан ай сав */
const RUNOFF_C = 0.65;

/**
 * Сувгийн багтаамж (м³/с) — үүнээс ДООШ урсац сувгаараа өнгөрч, үер болохгүй.
 * ⚠️ Хэмжсэн утга БИШ, төлөвлөлтийн таамаг. Үүнийг өсгөвөл бүх түвшний
 *    үер багасна — загварын хамгийн мэдрэмтгий параметр.
 */
const CHANNEL_Q = 45;

/**
 * Оргил урсац сувгийн багтаамжийг ХЭТЭРЧ байх хугацаа (сек).
 *
 * ⚠️ 1 цагийн аадар борооны хувьд ай савын хариу урвал нь борооноос УРТ
 * (концентрацийн хугацаа + сувгийн дүүрэлт).
 *
 * ⚠️ 28 мин нь КАЛИБРОВК: `ersdel.ts`-д баримтжуулсан лавлагааны гүн
 *    (0.6 / 1.1 / 1.8 м) -ийг ~50–60 га автагдах талбайд сэргээх утга.
 *    Шалгав: 25 мм/ц → 0.58 м, 50 → 1.31 м (лавлагаа 0.6 / 1.1).
 *
 * ⚠️ Энэ хоёр тогтмолыг (`CHANNEL_Q`, `PEAK_S`) `ersdel.ts`-д өмнө нь
 *    бичигдсэн лавлагааны гүн (0.6 / 1.1 / 1.8 м) -ийг ойролцоогоор
 *    сэргээхээр сонгов — өөрөөр хэлбэл шинэ загвар нь хуучин баримтжуулсан
 *    хувилбаруудтай зөрчилдөхгүй.
 */
const PEAK_S = 28 * 60;

/**
 * Торны нягт — нэг талд хэдэн нүд вэ.
 *
 * ⚠️ 96 → 128: голын хүрээг 1.25 дахин тэлэхэд ~5.5 км өргөн муж гарна.
 * 96 нүд нь 57 м/нүд өгдөг байсан — Сэлбэгийн 10–20 м суваг тэр нүдэнд
 * бүрэн шингэдэг. 128 нүд нь 43 м болгож, татамын хэлбэр илүү нарийн гарна.
 *
 * ⚠️ Цаашид өсгөх нь өндрийн дуудлагыг квадратаар нэмнэ (128² = 16,384 цэг
 *    ≈ 17 дуудлага). 192 бол 37 дуудлага болж, шинжилгээ мэдэгдэхүйц удаана.
 */
const GRID = 128;

/** Нэг зүсмэлийн тоо — анимацийн алхам */
const SLICES = 12;

/**
 * Цөөрөм тархах ДЭЭД өндөр ёроолоос (м).
 * ⚠️ Хэт өндөр бол хотгор нь бүхэл хөндий болж, бага ус нимгэн тархана;
 *    хэт бага бол ус нэг нүдэнд шахагдаж утгагүй гүн гарна.
 */
const POND_MAX_M = 2.5;

/** «Нойтон» гэж тооцох доод гүн (м) */
const WET_M = 0.05;

/* ══════════════════ Гидрологи ══════════════════ */

/** Рационал арга: Q (м³/с) = 0.278 · C · i(мм/ц) · A(км²) */
export const peakFlow = (rainMmH: number) => 0.278 * RUNOFF_C * rainMmH * CATCH_KM2;

/**
 * Сувгаас ХАЛИХ эзлэхүүн (м³) — үерийн усны нийт хэмжээ.
 * ⚠️ Багтаамжаас доош урсац бол 0 — «бага бороо = үер» гэсэн худал дохио өгөхгүй.
 */
export const spillVolume = (rainMmH: number) =>
  Math.max(0, peakFlow(rainMmH) - CHANNEL_Q) * PEAK_S;

/* ══════════════════ Газрын өндөр ══════════════════ */

export type Terrain = {
  w: number;
  h: number;
  /** Өндөр (м) — мөрөөр, ХОЙНООС УРАГШ (растерын дараалал) */
  z: Float32Array;
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  wkid: number;
  /** Нэг нүдний талын урт (м) */
  cellM: number;
  /**
   * ГОЛЫН нүд (1 = голын полигон дотор).
   * ⚠️ Загварын ХАМГИЙН чухал оролт: үер ЭНДЭЭС эхэлж тархана.
   */
  river: Uint8Array;
};

/** ArcGIS-ийн өндрийн үйлчилгээ нэг дуудалтад хүлээж авах цэгийн ДЭЭД тоо */
const BATCH = 1000;

/**
 * Гадаргуу «жинхэнэ» гэж тооцох ХАМГИЙН БАГА зөрүү (м).
 * ⚠️ Сэлбэгийн хөндийд бодит зөрүү ~270 м. 5 м-ээс бага бол загварын алдаа.
 */
const MIN_RELIEF_M = 5;

/**
 * Газрын өндрийг тороор татна.
 *
 * ⚠️ Нэг том `Multipoint` илгээвэл үйлчилгээ 400 буцаана — тиймээс хэсэглэнэ.
 * ⚠️ Үр дүн нь ХЭМЖЭЭТЭЙ (9,216 цэг ≈ 10 дуудлага) тул дуудагч тал КЭШЛЭХ
 *    үүрэгтэй — түвшин солих бүрд дахин татвал шинжилгээ секунд хүлээнэ.
 */
/**
 * ГОЛЫН СУВГИЙГ DEM-Д «ШАТААХ» гүн (м) — стандарт гидрологийн урьдчилсан
 * боловсруулалт (stream burning).
 *
 * ⚠️ ЗААВАЛ ХЭРЭГТЭЙ. `Terrain3D` нь Монголд ~30 м нарийвчлалтай тул Сэлбэ
 * голын 10–20 м өргөн суваг DEM дээр ОГТ БАЙХГҮЙ — нэг нүдэнд суваг ба
 * эрэг хоёул багтаж, дунджаараа тэгширнэ. Тийм DEM дээр ваннын дүүрэлт
 * хийвэл ус голын дагуу урсахын оронд хамаагүй хотгоруудад тархана —
 * «урсац буруу гарч байна» гэдгийн ГОЛ шалтгаан.
 *
 * Сувгийг 2.5 м гүнзгийрүүлснээр ус голын дагуу залгаж, эргээс халина.
 */
const BURN_M = 2.5;

export async function sampleTerrain(
  ground: __esri.Ground,
  extent: Extent,
  river: Polygon,
): Promise<Terrain> {
  const w = GRID;
  const h = GRID;
  const dx = (extent.xmax - extent.xmin) / (w - 1);
  const dy = (extent.ymax - extent.ymin) / (h - 1);

  const pts: number[][] = [];
  for (let r = 0; r < h; r++) {
    // ⚠️ ХОЙНООС УРАГШ: растерын мөр 0 нь ХАМГИЙН ХОЙД тал
    const y = extent.ymax - r * dy;
    for (let c = 0; c < w; c++) pts.push([extent.xmin + c * dx, y]);
  }

  const z = new Float32Array(w * h);
  for (let s = 0; s < pts.length; s += BATCH) {
    const mp = new Multipoint({
      points: pts.slice(s, s + BATCH),
      spatialReference: extent.spatialReference,
    });
    /**
     * ⚠️ `demResolution` ЗААВАЛ. Анхдагч `'auto'` нь асуулгын мужийн
     * ХЭМЖЭЭГЭЭР пирамидын түвшин сонгодог — 4 км өргөн мужид тэр нь бүдүүн
     * тойм болж, БҮХ цэг ИЖИЛ өндөр (1474 м) буцаана. Тийм хавтгай гадаргуу
     * дээр ваннын дүүрэлт утгагүй: ус хаана ч тархана.
     * `finest-contiguous` нь мужийг бүхэлд нь хамарсан ХАМГИЙН НАРИЙН
     * түвшнийг сонгоно (Terrain3D-д Монголд ~10–30 м).
     */
    const res = await ground.queryElevation(mp, {
      returnSampleInfo: false,
      demResolution: 'finest-contiguous',
    });
    const got = (res.geometry as Multipoint).points;
    for (let k = 0; k < got.length; k++) z[s + k] = got[k][2] ?? 0;
  }

  /**
   * ⚠️ ГАДАРГУУГИЙН ЗӨРҮҮГ ШАЛГАНА — ЗААВАЛ.
   *
   * ArcGIS-ийн өндрийн үйлчилгээ нь ХАВТГАЙ гадаргуу буцааж болно: асуулга
   * буруу пирамидын түвшинд буувал БҮХ цэг ижил утгатай ирнэ (Terrain3D-ийн
   * REST `getSamples` нь `pixelSize` зааснаас үл хамааран 156 км тоймоос
   * уншдагийг 2026-08-29-нд хэмжив: Сэлбэ орчимд 1474 м — зөрүү 0 м, гэтэл
   * бодит рельеф нь 270 м).
   *
   * Тийм гадаргуу дээр ваннын дүүрэлт нь УТГАГҮЙ: ус хаана ч тархаж, «бүх
   * хот усанд автлаа» гэсэн ХУДАЛ хариу гарна. Чимээгүй буруу тооцоо гаргахын
   * оронд ИЛ алдаа өгнө.
   */
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < z.length; i++) { if (z[i] < zmin) zmin = z[i]; if (z[i] > zmax) zmax = z[i]; }
  if (!(zmax - zmin > MIN_RELIEF_M)) {
    throw new Error(tr(
      'Газрын өндрийн загвар хавтгай ирлээ ({0} м зөрүү) — үерийн тархалт бодох боломжгүй.',
      (zmax - zmin).toFixed(1),
    ));
  }

  /* ⚠️ Web Mercator-ийн `dx` нь ГАЗРЫН метр БИШ — өргөргөөр агшина.
     Сэлбэ ~47.95°N тул cos(φ) итгэлцүүрээр залруулна. */
  const latRad = (47.95 * Math.PI) / 180;
  const cellM = ((dx + dy) / 2) * Math.cos(latRad);

  /**
   * ГОЛЫН РАСТЕРЖУУЛАЛТ — нүд бүрийн төв голын полигон дотор уу.
   *
   * ⚠️ `contains` нь нүд тутамд дуудагдана (9,216 удаа). `geometryEngine`
   * нь синхрон бөгөөд полигоныг дотооддоо индекслэдэг тул хүлээцтэй
   * (~40 мс); `geometryEngineAsync` бол Promise-ийн 9,216 дуудлага болно.
   */
  const riverMask = new Uint8Array(w * h);
  const sr = extent.spatialReference;
  for (let r = 0, i = 0; r < h; r++) {
    const y = extent.ymax - r * dy;
    for (let c = 0; c < w; c++, i++) {
      const pt = new Point({ x: extent.xmin + c * dx, y, spatialReference: sr });
      if (geometryEngine.contains(river, pt)) riverMask[i] = 1;
    }
  }

  /**
   * ⚠️ Гол нэг ч нүдэнд таарахгүй бол (тор хэт сийрэг эсвэл муж буруу)
   * ХАМГИЙН НАМ нүднүүд рүү ухарна — эс бөгөөс үрэлгүй үлдэж, загвар
   * ЧИМЭЭГҮЙ хоосон үр дүн буцаана.
   */
  let riverCells = 0;
  for (let i = 0; i < riverMask.length; i++) riverCells += riverMask[i];
  if (riverCells < 4) {
    const idx = Array.from({ length: w * h }, (_, i) => i).sort((a, b) => z[a] - z[b]);
    for (const i of idx.slice(0, Math.max(8, Math.round(w * h * 0.02)))) riverMask[i] = 1;
  }

  /* СУВГИЙГ ШАТААНА — доорх тайлбарыг үз (`BURN_M`) */
  for (let i = 0; i < riverMask.length; i++) if (riverMask[i]) z[i] -= BURN_M;

  return {
    w, h, z, cellM, river: riverMask,
    extent: { xmin: extent.xmin, ymin: extent.ymin, xmax: extent.xmax, ymax: extent.ymax },
    wkid: extent.spatialReference?.wkid ?? 102100,
  };
}

/* ══════════════════ HAND — голоос дээш өндөр ══════════════════ */

/**
 * HAND (Height Above Nearest Drainage) — нүд бүр ХАМГИЙН ОЙРЫН голын
 * нүднээс хэдэн метр ДЭЭР байгаа вэ.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ ВЭ (2026-08-29 засвар). Урьд нь ҮНЭМЛЭХҮЙ өндрөөр
 * ваннын дүүрэлт хийдэг байв: ус мужийн ХАМГИЙН НАМ цэгийг дүүргэдэг.
 * Сэлбэгийн хөндий урагшаа Туул руу нам дор явдаг тул ус төслийн
 * талбайгаас ГАДУУР, мужийн өмнөд ирмэгт бөөгнөрч, голын татам ХУУРАЙ
 * үлддэг байлаа — зурган дээр яг тэр харагдсан.
 *
 * HAND нь энэ асуудлыг үндсээр нь арилгана: ус «далайн түвшнээс H метрт»
 * биш, «СУВГААС h метр дээш» гэж тархана. Голын урсгалын дагуу газар
 * намсахад усны гадаргуу ч дагаж намсана — бодит үерийн зан төлөв.
 *
 * ⚠️ Энгийн Дийкстра: голын БҮХ нүднээс зэрэг тархаж, нүд бүрд өөрт нь
 * хамгийн ойр (замын уртаар) голын нүдний ӨНДРИЙГ ононо.
 */
function computeHand(t: Terrain): Float32Array {
  const n = t.w * t.h;
  /** Тухайн нүдэнд хамаарах голын ёроолын өндөр */
  const base = new Float32Array(n).fill(NaN);
  /** Голоос хэдэн нүд зайтай вэ — ойрыг нь сонгоход */
  const dist = new Int32Array(n).fill(0x7fffffff);
  const q: number[] = [];
  for (let i = 0; i < n; i++) {
    if (t.river[i]) { base[i] = t.z[i]; dist[i] = 0; q.push(i); }
  }
  /* BFS — нүдний зай ижил тул энгийн дараалал хангалттай (Дийкстра хэрэггүй) */
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % t.w;
    const y = (i / t.w) | 0;
    const step = (j: number) => {
      if (dist[j] <= dist[i] + 1) return;
      dist[j] = dist[i] + 1;
      base[j] = base[i];
      q.push(j);
    };
    if (x > 0) step(i - 1);
    if (x < t.w - 1) step(i + 1);
    if (y > 0) step(i - t.w);
    if (y < t.h - 1) step(i + t.w);
  }
  const hand = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hand[i] = Number.isNaN(base[i]) ? Infinity : Math.max(0, t.z[i] - base[i]);
  }
  return hand;
}

/* ══════════════════ Татамын дүүрэлт ══════════════════ */

/**
 * Дүүрэлтийн ҮРЭЛ — ГОЛЫН нүднүүд.
 *
 * ⚠️ 2026-08-29 засвар: урьд нь «хамгийн нам 4% нүд»-ийг гол гэж ТААМАГЛАДАГ
 * байв. Тэр нь буруу: хөндийн хамгийн нам цэгүүд нь голоос гадуур (хуучин
 * татам, барилгын ухашаа, замын доогуур) ч байж болно. Одоо `sb:16` голын
 * ЖИНХЭНЭ полигоноос растержуулсан маскийг хэрэглэнэ.
 */
function seedCells(t: Terrain): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < t.river.length; i++) if (t.river[i]) out.push(i);
  /* Хамгийн нам голын нүдийг ЭХЭНД — `levelFor` эндээс эхлэн өснө */
  out.sort((a, b) => t.z[a] - t.z[b]);
  return Int32Array.from(out);
}

/**
 * Сувгаас `h` метр дээш ус — автсан нүднүүд.
 *
 * ⚠️ Шалгуур нь HAND: нүд голоос `h`-аас нам байвал автана. Залгаа шалгалт
 * ХЭВЭЭР — эс бөгөөс голоос тусгаарлагдсан хотгор (замын нөгөө тал, далан
 * цаана) ус хүрэх ЗАМГҮЙ атлаа «үерт автсан» болно.
 */
function fillAt(t: Terrain, hand: Float32Array, seeds: Int32Array, h: number, out: Uint8Array): void {
  out.fill(0);
  const { w, h: H } = t;
  const stack: number[] = [];
  for (const s0 of seeds) if (hand[s0] < h && !out[s0]) { out[s0] = 1; stack.push(s0); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    /* 4 хөрш — диагональ оруулбал ус нимгэн ханан дундуур «нэвчинэ» */
    const step = (j: number) => { if (!out[j] && hand[j] < h) { out[j] = 1; stack.push(j); } };
    if (x > 0) step(i - 1);
    if (x < w - 1) step(i + 1);
    if (y > 0) step(i - w);
    if (y < H - 1) step(i + w);
  }
}

/** Сувгаас `h` метр дээш үед хуримтлагдах эзлэхүүн (м³) */
function volumeAt(t: Terrain, hand: Float32Array, mask: Uint8Array, h: number): number {
  const a = t.cellM * t.cellM;
  let v = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && hand[i] < h) v += (h - hand[i]) * a;
  return v;
}

/**
 * Эзлэхүүнд тохирох СУВГААС ДЭЭШХ ӨНДРИЙГ (`h`) хоёр шатаар олно.
 *
 * ⚠️ ХОЁР ШАТ ЗААВАЛ. `V(h)` нь ЗАЛГАА шалгалтаас болж ШАТЛАМАЛ: ус хөндийн
 * хамгийн нам хаалтыг давмагц хөрш хотгор БҮХЭЛДЭЭ нэг дор нэмэгдэнэ.
 * Ганц шатат хайлт үсрэлтийн цэгт очоод усыг хэдэн дахин илүү тараана.
 *   ШАТ 1 — залгаа ХҮРЭЭГ тогтоож `mask`-д хөлдөөнө.
 *   ШАТ 2 — хөлдөөсөн хүрээн дээр үргэлжилсэн хайлт (эзлэхүүн ЯГ таарна).
 */
function levelFor(
  t: Terrain, hand: Float32Array, seeds: Int32Array, target: number, mask: Uint8Array,
): number {
  if (target <= 0) { mask.fill(0); return 0; }

  /* ШАТ 1 — үсрэлтийн цэг. ⚠️ 15 м нь СУВГААС дээших өндөр (үнэмлэхүй БИШ) */
  let lo = 0;
  let hi = 15;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    fillAt(t, hand, seeds, mid, mask);
    if (volumeAt(t, hand, mask, mid) < target) lo = mid; else hi = mid;
  }
  fillAt(t, hand, seeds, hi, mask); // хүрээг хөлдөөнө

  /* ШАТ 2 — хөлдөөсөн хүрээн дээр */
  let a = 0;
  let b = hi;
  for (let k = 0; k < 28; k++) {
    const mid = (a + b) / 2;
    if (volumeAt(t, hand, mask, mid) < target) a = mid; else b = mid;
  }
  return (a + b) / 2;
}
/* ══════════════════ Шууд хур тунадас ══════════════════ */

/**
 * ХОТЫН (pluvial) ҮЕР — бороо ГАЗАР ДЭЭР шууд орж хуримтлагдана.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ. HAND нь ЗӨВХӨН голоос халисан усыг тараадаг —
 * гэтэл бороо БҮХ талбайд ордог. Голоос хол хотгор, ухашаа, замын доод
 * цэгүүдэд ус тогтдогийг тэр загвар огт харуулахгүй. Улаанбаатарын аадар
 * борооны гэмтлийн ИХЭНХ нь яг тийм хотын үер — голын халилт БИШ.
 *
 * АЛГОРИТМ (D8 урсгал):
 *   1. Нүд бүр `rainM · C` метр урсац хүлээж авна
 *   2. Өндрөөр ЭРЭМБЭЛЖ, дээрээс доош: нүд бүр усаа ХАМГИЙН НАМ хөрш рүү
 *      дамжуулна
 *   3. Голын нүдэд хүрсэн ус СУВАГТ орж, домэйноос ГАРНА (тэр нь аль
 *      хэдийн `spillVolume`-д тооцогдсон — ДАВХАР тоолохгүй)
 *   4. Доош гарах замгүй нүд (хотгорын ёроол) усаа ХАДГАЛНА → тэнд цөөрөм
 *
 * ⚠️ Энэ нь SCS/Green-Ampt шингээлт, шуудууны сүлжээ, цаг хугацааны
 *    хоцрогдлыг тооцохгүй — оргил үеийн ТӨЛӨВ л гаргана.
 */
function pondFromRain(t: Terrain, hand: Float32Array, rainMmH: number): Float32Array {
  const n = t.w * t.h;
  const cellA = t.cellM * t.cellM;
  /** Нүд бүрд унасан урсац (м³) */
  const runoff = (rainMmH / 1000) * RUNOFF_C * cellA;
  const water = new Float64Array(n).fill(runoff);

  /* Өндрөөр БУУРАХ эрэмбэ — дээрээс доош нэг дамжуулалт хангалттай */
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => t.z[b] - t.z[a]);

  const sink = new Float64Array(n);
  for (const i of order) {
    if (water[i] <= 0) continue;
    /* ⚠️ Голд хүрсэн ус ГАРНА: сувгийн халилт `spillVolume`-д аль хэдийн
       тооцогдсон тул энд дахин нэмбэл ус ХОЁР УДАА тоологдоно. */
    if (t.river[i]) { water[i] = 0; continue; }
    const x = i % t.w;
    const y = (i / t.w) | 0;
    let best = -1;
    let bestZ = t.z[i];
    const look = (j: number) => { if (t.z[j] < bestZ) { bestZ = t.z[j]; best = j; } };
    if (x > 0) look(i - 1);
    if (x < t.w - 1) look(i + 1);
    if (y > 0) look(i - t.w);
    if (y < t.h - 1) look(i + t.w);
    if (best < 0) { sink[i] = water[i]; water[i] = 0; }  // хотгорын ёроол
    else { water[best] += water[i]; water[i] = 0; }
  }

  /**
   * Цөөрмийн ГҮН — хуримтлагдсан эзлэхүүнийг ёроолын эргэн тойронд тараана.
   *
   * ⚠️ Бүтэн хотгорын дүүрэлт бодохгүй (тус бүрд нь хоёртын хайлт =
   * хотгорын тоогоор давталт). Оронд нь эзлэхүүнийг ёроол ба түүний
   * ЗАЛГАА, түүнээс дээш `POND_MAX_M`-ээс нам нүднүүдэд жигд тараана —
   * нүдэнд харагдах ялгаа багатай, тооцоо нь шугаман.
   */
  const out = new Float32Array(n);
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (sink[i] <= 0) continue;
    /* Ёроолоос дээш `POND_MAX_M` хүртэлх залгаа нүднүүд */
    const cells: number[] = [];
    const st = [i];
    seen.fill(0);
    seen[i] = 1;
    while (st.length && cells.length < 400) {
      const k = st.pop()!;
      cells.push(k);
      const x = k % t.w;
      const y = (k / t.w) | 0;
      const step = (j: number) => {
        if (seen[j] || t.river[j]) return;
        if (t.z[j] - t.z[i] > POND_MAX_M) return;
        seen[j] = 1;
        st.push(j);
      };
      if (x > 0) step(k - 1);
      if (x < t.w - 1) step(k + 1);
      if (y > 0) step(k - t.w);
      if (y < t.h - 1) step(k + t.w);
    }
    const d = sink[i] / (cells.length * cellA);
    /* ⚠️ Голын татамд давхарлахгүй: тэнд HAND-ийн ус аль хэдийн бий */
    for (const k of cells) if (hand[k] > 0.5) out[k] = Math.max(out[k], d);
  }
  return out;
}

/* ══════════════════ Загварчлал → FloodData ══════════════════ */

/**
 * Хур тунадас + газрын өндөр → `FloodData`.
 *
 * ⚠️ Буцаах интерфейс нь `uyr.ts`-ийн CRF-ээс уншдагтай ЯГ ИЖИЛ. Тиймээс
 * доорх бүх шат (`Overlay`-гийн MediaLayer, анимац, гөлгөржүүлэлт, урсацын
 * сум, нүд дарж түүх харах) НЭГ Ч МӨР засалгүй ажиллана.
 */
export function simulate(t: Terrain, rainMmH: number): FloodData {
  const n = t.w * t.h;
  const seeds = seedCells(t);
  const hand = computeHand(t);
  const total = spillVolume(rainMmH);
  /* ⚠️ Голын халилтаас ТУСДАА: бороо газар дээр шууд орж хуримтлана */
  const pond = pondFromRain(t, hand, rainMmH);

  /**
   * ГИДРОГРАФ — эзлэхүүн цаг хугацаагаар хэрхэн хуримтлагдах вэ.
   * ⚠️ Шугаман БИШ: борооны эхэнд хөрс шингээж, дараа нь огцом нэмэгдэж,
   *    төгсгөлд тэгширдэг. `sin²` муруй нь тэр хэлбэрийг энгийнээр өгнө.
   */
  const depths: Float32Array[] = [];
  const mask = new Uint8Array(n);
  for (let s = 0; s < SLICES; s++) {
    const f = (s + 1) / SLICES;
    const share = Math.sin((f * Math.PI) / 2) ** 2;
    /* ⚠️ `levelFor` нь `mask`-д ЗАЛГАА хүрээг үлдээнэ — дахин `fillAt`
       дуудвал шат 2-ын үр дүнг устгаж, усыг дахин хэт тараана. */
    const h = levelFor(t, hand, seeds, total * share, mask);
    const d = new Float32Array(n);
    /**
     * ХОЁР ЭХ СУРВАЛЖИЙН ИХ нь: голын халилт (HAND) ба борооны цөөрөм.
     * ⚠️ НЭМЭХГҮЙ, ИХИЙГ нь авна — нэг нүд хоёуланд хамаарвал нэмэх нь усыг
     *    давхар тоолж, гүнийг хиймэлээр өсгөнө.
     * ⚠️ Цөөрөм нь `share` (гидрографын хувь)-аар өснө: бороо орох тусам
     *    хуримтлана, эхнээсээ бүтэн байхгүй.
     */
    for (let i = 0; i < n; i++) {
      const river = mask[i] ? Math.max(0, h - hand[i]) : 0;
      d[i] = Math.max(river, pond[i] * share);
    }
    depths.push(d);
  }

  /**
   * УРСГАЛ — ус ДООШ урсана: чиглэл нь газрын налуугийн эсрэг вектор.
   * Хурдыг Manning-ийн хялбаршуулсан хэлбэрээр: v ≈ k·√слоп·гүн^(2/3).
   */
  const us: Float32Array[] = [];
  const vs: Float32Array[] = [];
  for (const d of depths) {
    const u = new Float32Array(n);
    const v = new Float32Array(n);
    for (let y = 1; y < t.h - 1; y++) {
      for (let x = 1; x < t.w - 1; x++) {
        const i = y * t.w + x;
        if (d[i] < WET_M) continue;
        /* Усны ГАДАРГУУ (z + гүн) — жинхэнэ хөдөлгөгч хүч нь түүний налуу */
        const sr = (z: Float32Array, dd: Float32Array, k: number) => z[k] + dd[k];
        const gx = (sr(t.z, d, i + 1) - sr(t.z, d, i - 1)) / (2 * t.cellM);
        const gy = (sr(t.z, d, i + t.w) - sr(t.z, d, i - t.w)) / (2 * t.cellM);
        const slope = Math.hypot(gx, gy);
        if (slope < 1e-5) continue;
        const sp = Math.min(4, 6 * Math.sqrt(slope) * Math.pow(d[i], 2 / 3));
        /* ⚠️ ХАСАХ тэмдэг: ус налуугийн ӨӨДӨӨС биш, УРУУ урсана.
           `gy` нь МӨРИЙН дагуу (хойноос урагш) тул хойд бүрэлдэхүүн нь `-gy`. */
        u[i] = (-gx / slope) * sp;
        v[i] = (gy / slope) * sp;
      }
    }
    us.push(u);
    vs.push(v);
  }

  /* ── Мета — `uyr.ts`-ийнхтэй ижил бүтэц ── */
  const wetHa = depths.map((d) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (d[i] >= WET_M) c++;
    return (c * t.cellM * t.cellM) / 10000;
  });
  const peaks = depths.map((d) => Math.max(...d));
  const speeds = us.map((u, s) => {
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.hypot(u[i], vs[s][i]));
    return m;
  });

  const t0 = Date.now();
  const times = Array.from({ length: SLICES }, (_, s) =>
    new Date(t0 + (s * 3600_000) / SLICES).toISOString());

  const meta: FloodMeta = {
    source: tr('Кодоор бодсон — хур тунадас {0} мм/ц', String(rainMmH)),
    width: t.w,
    height: t.h,
    slices: SLICES,
    order: ['depth', 'u', 'v'],
    scale: { depth: 1, u: 1, v: 1 },
    units: 'm',
    wkid: t.wkid,
    extent: t.extent,
    cellM: t.cellM,
    srcCellM: t.cellM,
    times,
    wetM: WET_M,
    stats: depths.map((_, s) => ({ wetHa: wetHa[s], peakM: peaks[s], maxSpeed: speeds[s] })),
    totalWetHa: Math.max(...wetHa),
    peakDepthM: Math.max(...peaks),
  };

  /* ── Зурах — `uyr.ts`-ийн `frame()`-ийн хялбаршуулсан хувилбар ── */
  const bufs: HTMLCanvasElement[] = [];
  const ctxs: CanvasRenderingContext2D[] = [];
  const raws: HTMLCanvasElement[] = [];
  const rawCtxs: CanvasRenderingContext2D[] = [];
  const imgs: ImageData[] = [];
  const SMOOTH = 4; // тор сийрэг (96) тул илүү их томруулна
  for (let b = 0; b < 2; b++) {
    const raw = document.createElement('canvas');
    raw.width = t.w; raw.height = t.h;
    const rcx = raw.getContext('2d')!;
    raws.push(raw); rawCtxs.push(rcx); imgs.push(rcx.createImageData(t.w, t.h));
    const c = document.createElement('canvas');
    c.width = t.w * SMOOTH; c.height = t.h * SMOOTH;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    bufs.push(c); ctxs.push(cx);
  }
  let turn = 0;

  const at = (a: Float32Array[], s: number, i: number) => a[Math.max(0, Math.min(SLICES - 1, s))][i];

  const frame = (s: number, f: number, phase: number): HTMLCanvasElement => {
    turn ^= 1;
    const cv = bufs[turn];
    const ctx = ctxs[turn];
    const img = imgs[turn];
    const px = img.data;
    const s0 = Math.max(0, Math.min(SLICES - 1, s));
    const s1 = Math.min(SLICES - 1, s0 + 1);
    const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, f));
    const w0 = 1 - w1;
    px.fill(0);
    for (let i = 0; i < n; i++) {
      const dd = depths[s0][i] * w0 + depths[s1][i] * w1;
      if (dd < WET_M) continue;
      const q = Math.max(0, Math.min(1, dd / 1.5));
      const c = depthColor(q);
      /* Долгион — урсгалын дагуу шилжих гэрэлтэлт */
      const sp = Math.hypot(at(us, s0, i), at(vs, s0, i));
      const shade = sp > 0.05 ? 1 + Math.sin(phase * sp * 2 + i * 0.7) * 0.08 : 1;
      const p = i * 4;
      px[p] = c[0] * shade;
      px[p + 1] = c[1] * shade;
      px[p + 2] = c[2] * shade;
      px[p + 3] = 150 + q * 95;
    }
    rawCtxs[turn].putImageData(img, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(raws[turn], 0, 0, cv.width, cv.height);

    /* Урсацын чиглэлийн сум */
    const AR = 6;
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = AR >> 1; y < t.h; y += AR) {
      for (let x = AR >> 1; x < t.w; x += AR) {
        const i = y * t.w + x;
        if (depths[s0][i] * w0 + depths[s1][i] * w1 < WET_M) continue;
        const ux = at(us, s0, i);
        const vy = at(vs, s0, i);
        const sp = Math.hypot(ux, vy);
        if (sp < 0.12) continue;
        const nx = ux / sp;
        const ny = -vy / sp;
        const cx0 = (x + 0.5) * SMOOTH;
        const cy0 = (y + 0.5) * SMOOTH;
        const len = Math.min(AR * SMOOTH * 0.5, AR * SMOOTH * 0.2 * (1 + sp));
        const hx = cx0 + nx * len * 0.5;
        const hy = cy0 + ny * len * 0.5;
        ctx.moveTo(cx0 - nx * len * 0.5, cy0 - ny * len * 0.5);
        ctx.lineTo(hx, hy);
        const hd = len * 0.4;
        const a = Math.atan2(ny, nx);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a - 0.5), hy - hd * Math.sin(a - 0.5));
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a + 0.5), hy - hd * Math.sin(a + 0.5));
      }
    }
    ctx.stroke();
    return cv;
  };

  const indexAt = (x: number, y: number): number | null => {
    const e = t.extent;
    if (x < e.xmin || x > e.xmax || y < e.ymin || y > e.ymax) return null;
    const cx = Math.min(t.w - 1, Math.floor(((x - e.xmin) / (e.xmax - e.xmin)) * t.w));
    const cy = Math.min(t.h - 1, Math.floor(((e.ymax - y) / (e.ymax - e.ymin)) * t.h));
    return cy * t.w + cx;
  };

  return {
    meta,
    depth: (s, i) => at(depths, s, i),
    u: (s, i) => at(us, s, i),
    v: (s, i) => at(vs, s, i),
    speed: (s, i) => Math.hypot(at(us, s, i), at(vs, s, i)),
    series: (i) => ({
      depth: depths.map((d) => d[i]),
      speed: us.map((u, s) => Math.hypot(u[i], vs[s][i])),
    }),
    indexAt,
    frame,
    minuteAt: (s) => (s * 60) / SLICES,
  };
}
