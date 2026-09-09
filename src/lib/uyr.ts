'use client';

/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛ — ArcGIS Flood Simulation-ы ЦАГ ХУГАЦААНЫ цуваа.
 *
 * ⚠️ ЗАРЧИМ: Flood Simulation нь «нэг зураг» БИШ — ус тархах ЯВЦ. Тиймээс
 * зүсмэл бүрийн гүн ба урсгалын вектор хоёуланг нь хадгалж, хугацаагаар нь
 * гүйлгэж харуулна (NEMA ANALYSIS WEB / `nextjs_last`-ийн `FloodScene`-тэй
 * ижил зарчим).
 *
 * ⚠️ Урьд нь (2026-08-27-ны эхний хувилбар) 12 алхмын «хамгийн их гүн»-ийг л
 * авч статик полигон болгосон нь АЛДАА байв: усны давалгааны хөдөлгөөн,
 * урсгалын хурд, чиглэл бүгд алдагдаж, «загварчлал» нь ердөө нэг толбо болж
 * хувирсан.
 *
 * ⚠️ ЭНЭ НЬ АЮУЛЫН ТҮВШНЭЭС ТУСДАА. Түвшин 1/2/3 ба хохирлын тооцоо нь голын
 * ирмэгээс татсан БУФЕР зурвасаар явна (`ersdel.ts` §FLOOD_LEVELS) — тэр нь
 * давтагдах хугацааны (5/20/100 жил) хувилбар. Энэ загварчлал нь тэдгээрийн
 * ДООР урсаж, бодит усны тархалтыг харуулна.
 *
 * ФАЙЛУУД (`tools/uyr-crf.py` үүсгэнэ):
 *
 *   · `/uyr/selbe-flood.bin`         512×512 × 12 зүсмэл × 3 хувьсагч
 *                                    [зүсмэл][хувьсагч][пиксел]
 *                                    depth uint16 (мм) · u,v int16 (см/с)
 *                                    18.9 МБ (gzip 2.0 МБ)
 *   · `/uyr/selbe-flood.json`        мета + зүсмэл тус бүрийн үзүүлэлт
 *
 * ⚠️ ТООН ҮЗҮҮЛЭЛТ (талбай, дээд гүн) нь мета доторх `stats`-аас уншигдана —
 * 512-ийн тороос ДАХИН бодож БОЛОХГҮЙ. Сийрэгжүүлэхэд MAX авдаг тул нэг
 * нойтон дэд нүд бүтэн блокийг нойтон болгож, талбай 1.6 дахин хэтэрдэг
 * (хэмжив: 144 га vs бодит 91 га). Мета доторх тоо нь ЭХ 4096 тороос.
 */

import { t as tr } from '@/lib/i18nCore';

export type FloodMeta = {
  source: string;
  width: number;
  height: number;
  slices: number;
  order: string[];
  scale: { depth: number; u: number; v: number };
  units: string;
  wkid: number;
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  /** Зурагдах торын газрын нүд (м) */
  cellM: number;
  /** Эх торын газрын нүд (м) — тоон үзүүлэлт эндээс гарсан */
  srcCellM: number;
  /** Зүсмэл бүрийн хугацаа (ISO) */
  times: string[];
  /** «Нойтон» гэж тооцох доод гүн (м) — ТООЦООНД (талбай, ирэх хугацаа) */
  wetM: number;
  /**
   * ЗУРАХ доод гүн (м) — тооцооныхоос НИМГЭН.
   *
   * ⚠️ Хоёр өөр босго ЗОРИУД. Уулын энгэрээр урсах хуудас урсгал нь
   * 2–4 см байдаг (Manning-аар бодов: 500 м энгэр, 60 мм/ц → 3 см) буюу
   * «усанд автсан» гэх 5 см-ийн босгоос ДООГУУР. Нэг босго хэрэглэвэл
   * ЭНГЭРИЙН УРСАЦ ОГТ ХАРАГДАХГҮЙ — хэрэглэгч «бороо зөвхөн голын дагуу
   * орж байна» гэж уншина (2026-09-09-ны шүүмж).
   *
   * ⚠️ Гэхдээ түүнийг «үерлэсэн талбай» гэж ТООЛОХГҮЙ: 3 см ус нь эд
   * хөрөнгийн хохирол өгөхгүй. Тиймээс ЗУРАГ нь 2 см-ээс (маш тунгалаг),
   * ТОО нь 5 см-ээс эхэлнэ. Байхгүй бол `wetM` руу ухарна.
   */
  drawM?: number;
  /** Зүсмэл тус бүрийн үзүүлэлт — ЭХ нарийвчлалаас */
  stats: { wetHa: number; peakM: number; maxSpeed: number }[];
  totalWetHa: number;
  peakDepthM: number;
  /** Загварчлалын нийт хугацаа (мин) — зөвхөн вэб дээр бодогдсонд */
  simMin?: number;
  /** Оролтын оргил урсац (м³/с) */
  peakQ?: number;
  /**
   * ГИДРОГРАФ — зүсмэл бүрийн оролтын урсац (м³/с).
   * ⚠️ Энэ нь ЗАГВАРЫН ОРОЛТ, үр дүн БИШ. UI-д муруй болгож харуулснаар
   * «яагаад 18-р минутад ус хамгийн их байв» гэдэг нь тайлбарлагдана.
   */
  hydroQ?: number[];
  /** Маннингийн барзгар байдал [суваг, үерийн талбай] */
  manning?: [number, number];
  /**
   * ШИНЖИЛГЭЭНД ОРСОН талбай (га) — 3D mesh-ийн БОДИТ хүрээ.
   * ⚠️ Торны хүрээ БИШ: тор квадрат, mesh нь хазгай тууз тул булангууд
   * (~33%) нь нөхөөс бөгөөд домэйноос ХАСАГДДАГ.
   */
  domainHa?: number;
  /** Оролтын хур тунадас (мм/ц) */
  rainMmH?: number;
  /**
   * ХУР ТУНАДАС УНАХ талбай (га) — `domainHa`-аас БАГА байж болно.
   *
   * ⚠️ Хоёр өөр зүйл: `domainHa` нь ус УРСАЖ болох бүх талбай (mesh + DEM),
   * `rainHa` нь бороо УНАХ судалгааны талбай (зөвхөн 3D mesh). DEM-ийн хэсэг
   * нь зөвхөн ус ГАРАХ ба дээрээс УРСАЖ ОРОХ зам — тэнд бороо оруулбал уулын
   * цаанаас «боломжгүй» ус гарч ирнэ.
   */
  rainHa?: number;
  /** Бороо MESH-ийн талбайд орж байна уу (`false` = зурсан талбайд ухарсан) */
  rainOnMesh?: boolean;
  /**
   * ГҮНИЙ ӨНГӨ ХАНАХ утга (м) — загварчлалаас ӨӨРӨӨ гарна.
   *
   * ⚠️ Тогтмол 1.5 м байсан нь ноцтой харагдацын алдаа байв: домэйныг
   * өргөсгөж дээд гүн 8 м болоход усны 90% нь ИЖИЛ хар хөх өнгөтэй болж,
   * гүехэн ба гүн хоёр ялгагдахаа больсон (хэрэглэгчийн 2026-09-09-ны
   * зураг). Одоо нойтон нүднүүдийн 95 хувийн квантиль — зургийн ихэнх нь
   * өнгөний ХҮРЭЭНД багтана.
   */
  rampMaxM?: number;
  /**
   * Өндрийн торны хэдэн хувь нь 3D MESH-ээс гарсан бэ (үлдсэн нь SRTM DEM).
   * ⚠️ Хоёр эх сурвалжийн нарийвчлал ЭРС өөр (4 м vs 30 м) тул үр дүнг
   * уншихад заавал мэдэх ёстой: mesh-ийн хэсэгт барилга ус хааж байгаа,
   * DEM-ийн хэсэгт зөвхөн ерөнхий рельеф ажиллана.
   */
  meshPct?: number;
};

/**
 * РАСТЕРЫГ ЮУГААР БУДАХ ВЭ.
 *
 * ⚠️ ArcGIS Flood Simulation-ы гаралт нь ГУРВАН асуултад хариулдаг ба тус бүр
 * ӨӨР зураг шаарддаг:
 *   · `depth`  — «ус хэр гүн вэ»       → хөх шатлал
 *   · `speed`  — «хэр хүчтэй урсаж байна» → хөхөөс цагаан хөөс рүү
 *   · `hazard` — «хүнд аюултай юу»      → гүн × хурд, ногооноос улаан руу
 * Ганц зураг гурвуулангийнх нь оронд явж чадахгүй: 2 м гүн ЗОГСОНГИ ус ба
 * 0.4 м гүн ХУРДАН урсгал хоёр өөр аюул.
 */
export type FloodMode = 'depth' | 'speed' | 'hazard';

/**
 * АЮУЛЫН ЗЭРЭГЛЭЛ — гүн × хурд (м²/с), DEFRA/ArcGIS-ийн ангилалтай ижил.
 * ⚠️ Хүн 0.5 м гүн, 2 м/с урсгалд (=1.0) хөл дээрээ зогсож чаддаггүй.
 */
export const HAZARD_CLASS = (dv: number): { label: string; color: string } =>
  dv >= 2.0 ? { label: tr('Онц аюултай'), color: '#7f1d1d' }
    : dv >= 1.25 ? { label: tr('Аюултай'), color: '#dc2626' }
      : dv >= 0.75 ? { label: tr('Болгоомжтой'), color: '#f59e0b' }
        : { label: tr('Бага'), color: '#16a34a' };

export type FloodData = {
  meta: FloodMeta;
  /** Гүн (м) — зүсмэл `s`, торын индекс `i` */
  depth: (s: number, i: number) => number;
  /** Урсгалын зүүн-баруун бүрэлдэхүүн (м/с) */
  u: (s: number, i: number) => number;
  /** Урсгалын хойд-урд бүрэлдэхүүн (м/с) */
  v: (s: number, i: number) => number;
  /** Урсгалын хурд (м/с) */
  speed: (s: number, i: number) => number;
  /** Нэг нүдний БҮХ зүсмэл дэх гүн ба хурд — цаг хугацааны бяцхан график */
  series: (i: number) => { depth: number[]; speed: number[] };
  /** Web Mercator цэг → торын индекс. Гадна талд `null`. */
  indexAt: (x: number, y: number) => number | null;
  /**
   * НЭГ ФРЕЙМ зурна — зүсмэл `s` ба `s+1`-ийн ХООРОНД `f` (0..1) хувиар
   * шингээж, урсгалын хөдөлгөөнийг `phase` (сек) дээр тулгуурлан нэмнэ.
   * ⚠️ ДОТООД ганц canvas-ыг дахин ашиглана — фрейм тутамд шинэ canvas
   *    үүсгэвэл 30 фрейм/сек дээр хогийн цуглуулагч ажиллаж чичирнэ.
   */
  frame: (s: number, f: number, phase: number, mode?: FloodMode) => HTMLCanvasElement;
  /** Зүсмэлийн хугацаа — эхнээсээ хэдэн минут */
  minuteAt: (s: number) => number;
  /**
   * ГАЗРЫН ӨНДӨР (м, EGM2008) торны индексээр.
   *
   * ⚠️ Зөвхөн вэб дээр бодогдсон загварчлалд байна (`uyrSim.ts`) — бэлэн
   * файлаас уншсан датад БАЙХГҮЙ. Үүнийг шаарддаг зүйл (3D усны ГАДАРГУУ,
   * `uyrSurface.ts`) заавал `if (!flood.terrain) return` гэж хамгаална.
   */
  terrain?: (i: number) => number;
  /** БҮХ хугацааны дээд гүн (м) — «хамгийн муу тохиолдол» */
  maxDepth?: (i: number) => number;
  /** БҮХ хугацааны дээд хурд (м/с) */
  maxSpeed?: (i: number) => number;
  /** Ус хэдэн минутад ирсэн бэ; хэзээ ч ирээгүй бол `null` */
  arrivalMin?: (i: number) => number | null;
  /**
   * ХУРААХ ТАЛБАЙ (га) — энэ нүд рүү хэдэн га талбайн ус урсаж ирдэг вэ.
   * ⚠️ ArcGIS `FlowAccumulation`-ийн гаралт. «Яагаад энд үерлэв» гэдэгт
   * хамгийн шууд хариулдаг тоо: 40 га талбайн ус нэг жалгаар цугларвал
   * тэр жалга үерлэхээс өөр аргагүй.
   */
  accHa?: (i: number) => number;
};

const URL_BIN = '/uyr/selbe-flood.bin';
const URL_META = '/uyr/selbe-flood.json';

/**
 * ГҮНИЙ ӨНГӨНИЙ ШАТЛАЛ — цайвараас гүн хөх рүү.
 * ⚠️ NEMA-гийн `FloodScene`-ийн шатлалтай ижил: ус нь ҮРГЭЛЖ хөх өнгөтэй,
 * гүн нь ХАНАЛТААР л уншигдана. Улаан/шар нь энэ аппад ХОХИРЛЫН өнгө тул
 * усанд хэрэглэвэл хоёр өөр утга нэг өнгөнд орно.
 */
const DEPTH_STOPS: [number, number, number][] = [
  [40, 195, 255],
  [10, 140, 250],
  [10, 78, 232],
  [6, 36, 160],
];

/**
 * УРСАЦЫН СУМ — торны хэдэн нүд тутамд нэг сум вэ.
 * ⚠️ 12 нь ~110 м-т нэг сум (нүд 9 м): 512-ийн торонд дээд тал нь 42×42 =
 *    1,764 сум. Үүнээс нягт болговол сум хоорондоо нийлж «цагаан тор»
 *    болж, доорх усны гүн уншигдахаа болино.
 */
const ARROW_STEP = 12;

/**
 * Сум зурах ДООД хурд (м/с).
 * ⚠️ 0-ээс дээш бүх нүдэнд зурвал зогсонги усанд ч чиглэл «байгаа» мэт
 *    харагдана — тэр нь тоон шуугиан, бодит урсгал БИШ.
 */
const ARROW_MIN_MS = 0.12;

/**
 * СУМНЫ ХЭМЖЭЭ — нүдний алхмын харьцаагаар (2026-08-29: жижигрүүлэв).
 * ⚠️ `ARROW_MAX` нь ДЭЭД хязгаар: хурдтай урсгалд ч сум хөрш рүүгээ хүрэхгүй.
 *    1.0-д хүрвэл сумнууд нийлж, тасралтгүй тор мэт харагдана.
 */
const ARROW_BASE = 0.20;
const ARROW_MAX = 0.50;

/** ⚠️ Энэ гүнд өнгө ХАНАНА. Эх өгөгдлийн дээд гүн 2.27 м тул 1.5 м-д ханавал
 *  гүехэн (0.05–0.5 м) хэсэг нь өнгөний ихэнх хүрээг эзэлж, тархалт уншигдана. */
const SATURATE_M = 1.5;

/**
 * УРСГАЛЫН СҮЛЖЭЭНИЙ доод хураах талбай (га) — үүнээс жижиг замыг зурахгүй.
 * ⚠️ 0.5 га нь ~17 м нүдэн дээр 17 нүд: жалга орно, дээврийн ус орохгүй.
 */
const NET_MIN_HA = 0.5;
/** Сүлжээний шугам БҮРЭН тод болох хураах талбай (га) */
const NET_FULL_HA = 60;
/** Сүлжээний ДЭЭД тунгалаг байдал (0–255) — усны өнгийг дарах ёсгүй */
const NET_MAX_A = 66;

/**
 * ХУРДНЫ ШАТЛАЛ — гүн хөхөөс цагаан ХӨӨС рүү.
 * ⚠️ Гүнийхээс ЯЛГААТАЙ байх ёстой (хоёулаа хөх бол хэрэглэгч аль зургийг
 *    харж байгаагаа мэдэхгүй). Хурдан ус нь бодит амьдрал дээр цагаан хөөстэй
 *    байдаг тул төгсгөл нь цагаан — тайлбаргүй ойлгогдоно.
 */
const SPEED_STOPS: [number, number, number][] = [
  [12, 60, 140],
  [20, 130, 210],
  [110, 200, 240],
  [240, 250, 255],
];

/**
 * АЮУЛЫН ШАТЛАЛ (гүн × хурд) — ногооноос улаан руу.
 * ⚠️ Улаан нь энэ аппад ХОХИРЛЫН өнгө. Энд ч утга нь ЯГ адил — «хүнд аюултай»
 *    тул зөрчил үүсэхгүй.
 */
const HAZARD_STOPS: [number, number, number][] = [
  [22, 163, 74],
  [250, 204, 21],
  [249, 115, 22],
  [153, 27, 27],
];

const ramp = (stops: [number, number, number][], t: number): [number, number, number] => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  const f = x - k;
  const a = stops[k];
  const b = stops[k + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
};

export function depthColor(t: number): [number, number, number] {
  return ramp(DEPTH_STOPS, t);
}

/** ⚠️ Хурд энэ утганд ханана (м/с) — уулын горхины ердийн дээд урсгал */
export const SATURATE_MS = 3;
/** ⚠️ Аюулын үзүүлэлт энэ утганд ханана (м²/с) — «онц аюултай»-н босго */
export const SATURATE_HAZ = 2.5;

export const speedColor = (t: number) => ramp(SPEED_STOPS, t);
export const hazardColor = (t: number) => ramp(HAZARD_STOPS, t);

/** Урсгалын чиглэл — векторыг найман зүг рүү */
export const flowDir = (u: number, v: number): string => {
  const deg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  return [
    tr('Хойд'), tr('Зүүн хойд'), tr('Зүүн'), tr('Зүүн урд'),
    tr('Урд'), tr('Баруун урд'), tr('Баруун'), tr('Баруун хойд'),
  ][Math.round(deg / 45) % 8];
};

/** Векторын азимут (градус) — сумны эргэлтэд */
export const flowDeg = (u: number, v: number): number =>
  ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;

let cache: FloodData | null = null;
let pending: Promise<FloodData> | null = null;

/**
 * Загварчлалыг нэг удаа татаад кэшилнэ.
 *
 * ⚠️ 18.9 МБ — татахад хэдэн секунд болно. Тиймээс ЗӨВХӨН «Үер» хувилбар
 * сонгогдоход дуудагдана (`Ersdel.tsx`), хуудас нээгдэхэд БИШ.
 */
/**
 * ТҮҮХИЙ БУФЕРЭЭС `FloodData` угсарна — layout `[зүсмэл][depth,u,v][пиксел]`.
 *
 * ⚠️ ХОЁР эх сурвалж энэ функцийг ХУВААЛЦАНА: вэб дээр 3D mesh-ийн DSM дээр
 * тооцсон загварчлал (`uyrSim.ts`) ба урьд бэлтгэсэн файл. Дүрслэл, нүд
 * сонгох, цуваа — БҮГД нэг код дээр ажиллах ёстой; эс бөгөөс эх сурвалж
 * солиход зурагдац чимээгүй зөрнө.
 */
export function floodDataFromBuffer(
  meta: FloodMeta,
  buf: ArrayBuffer,
  /**
   * ⚠️ Зөвхөн ВЭБ дээр бодогдсон загварчлалд байх нэмэлт торууд
   * (`uyrSim.ts`). Бэлэн файлаас уншсан датад байхгүй тул тэдгээрийг
   * ашиглах бүх код нь `if (!…) return` гэж хамгаална.
   */
  extra?: {
    /** Газрын өндөр (м) — 3D усны гадаргуу */
    terrainZ?: Float32Array;
    /** Бүх хугацааны дээд гүн (м) */
    maxDepth?: Float32Array;
    /** Бүх хугацааны дээд хурд (м/с) */
    maxSpeed?: Float32Array;
    /** Ус ирсэн хугацаа (сек); −1 = хэзээ ч ирээгүй */
    arrivalS?: Float32Array;
    /** Хураах талбай (га) — `FlowAccumulation` */
    accHa?: Float32Array;
  },
): FloodData {
  const W = meta.width;
  const H = meta.height;
  const P = W * H;
  const SL = meta.slices;
  /** Нэг зүсмэлийн байтын урт: depth(2) + u(2) + v(2) */
  const stride = P * 2 * 3;
  if (buf.byteLength < stride * SL) {
    throw new Error(tr('Үерийн файл дутуу: {0} / {1} байт', buf.byteLength, stride * SL));
  }

  /**
   * ⚠️ ЗҮСМЭЛ БҮРД тусдаа typed array — `DataView`-ээр нэг нэгээр уншвал
   * 262,144 нүдийн canvas барихад мэдэгдэхүйц удаан. Typed array нь
   * буферийг ХУУЛАХГҮЙ, зөвхөн цонх нээнэ.
   */
  const dep: Uint16Array[] = [];
  const uu: Int16Array[] = [];
  const vv: Int16Array[] = [];
  for (let s = 0; s < SL; s++) {
    const o = s * stride;
    dep.push(new Uint16Array(buf, o, P));
    uu.push(new Int16Array(buf, o + P * 2, P));
    vv.push(new Int16Array(buf, o + P * 4, P));
  }

  const sd = meta.scale.depth;
  const su = meta.scale.u;
  const sv = meta.scale.v;
  const depth = (s: number, i: number) => dep[s][i] / sd;
  const u = (s: number, i: number) => uu[s][i] / su;
  const v = (s: number, i: number) => vv[s][i] / sv;
  const speed = (s: number, i: number) => Math.hypot(u(s, i), v(s, i));

  const e = meta.extent;
  const indexAt = (x: number, y: number): number | null => {
    const cx = Math.floor(((x - e.xmin) / (e.xmax - e.xmin)) * W);
    // ⚠️ Мөр нь ХОЙНООС УРАГШ (растерын мөр 0 = хойд зах) — canvas-тай ижил
    const cy = Math.floor(((e.ymax - y) / (e.ymax - e.ymin)) * H);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    return cy * W + cx;
  };

  /* ── Зурах ── */
  /* ⚠️ ЗУРАХ босго — тооцооныхоос нимгэн (`drawM` §тайлбар) */
  const wetRaw = (meta.drawM ?? meta.wetM) * sd;
  /**
   * ХОЁР CANVAS ЭЭЛЖЛЭН (double buffering).
   *
   * ⚠️ ГАНЦ canvas дээр зурвал УРАГДАНА: `frame()` нь `putImageData`-г
   * СИНХРОНООР гүйцэтгэдэг ч ArcGIS текстурыг өөрийн рендерийн мөчлөгт,
   * ХОЖИМ уншина. Дараагийн фрейм ижил canvas дээр бичигдвэл өмнөх
   * `ImageElement` нь ШИНЭ агуулгыг харуулж, фрейм алгасах/чичрэх үзэгдэл
   * гарна. Ээлжилснээр ArcGIS уншиж дуустал агуулга хөдөлгөөнгүй үлдэнэ.
   *
   * ⚠️ Хоёр л хангалттай: 30 фрейм/сек дээр текстур ачаалалт дараагийн
   * фрейм ирэхээс өмнө дуусдаг (512×512 RGBA = 1 МБ).
   */
  /**
   * ГӨЛГӨРЖҮҮЛЭЛТ (2026-08-29, хүсэлт).
   *
   * ⚠️ Торны нүд нь ~9 м. Түүнийг ArcGIS шууд сунгаж зурахад нүд бүр
   * ДӨРВӨЛЖИН болж, усны зах шатлан харагдана. Тиймээс торыг ЭНД
   * `SMOOTH` дахин томруулж, хөтчийн bilinear шүүлтүүрээр (`imageSmoothing`)
   * дамжуулна — зах нь үргэлжилсэн муруй болно.
   *
   * ⚠️ 2 дахин л томруулна: 4 дахин бол 2048² = 16 МБ текстур болж, 20
   * фрейм/сек дээр 320 МБ/сек GPU ачаалал үүснэ. 2× нь нүдэнд хангалттай.
   */
  const SMOOTH = 2;
  /* ⚠️ Гүний ханалт — загварчлалаас (`rampMaxM`), байхгүй бол хуучин тогтмол */
  const satM = meta.rampMaxM && meta.rampMaxM > 0.2 ? meta.rampMaxM : SATURATE_M;
  const bufs: HTMLCanvasElement[] = [];
  const ctxs: CanvasRenderingContext2D[] = [];
  const imgs: ImageData[] = [];
  /** Торны түвшний завсрын canvas — `putImageData` зөвхөн энд */
  const raws: HTMLCanvasElement[] = [];
  const rawCtxs: CanvasRenderingContext2D[] = [];
  for (let b = 0; b < 2; b++) {
    const raw = document.createElement('canvas');
    raw.width = W;
    raw.height = H;
    const rcx = raw.getContext('2d')!;
    raws.push(raw);
    rawCtxs.push(rcx);
    imgs.push(rcx.createImageData(W, H));

    const c = document.createElement('canvas');
    c.width = W * SMOOTH;
    c.height = H * SMOOTH;
    const cx2 = c.getContext('2d')!;
    /* ⚠️ Анхдагчаар `true` ч ил бичив: false болбол бүх ажил дэмий болно */
    cx2.imageSmoothingEnabled = true;
    cx2.imageSmoothingQuality = 'high';
    bufs.push(c);
    ctxs.push(cx2);
  }
  let turn = 0;

  /**
   * ӨНГӨНИЙ ХҮСНЭГТ — гүн (мм) → RGB.
   * ⚠️ Фрейм тутамд 262,144 нүдэд `depthColor()` дуудвал (интерполяцийн улмаас
   * утга бүр өөр) тооцоолол нь анимацийг гацаана. 256 шатлалт хүснэгт нь
   * нүдэнд ялгагдахгүй, харин 100 дахин хурдан.
   */
  const mkLut = (fn: (t: number) => [number, number, number]) => {
    const a = new Uint8Array(256 * 3);
    for (let q = 0; q < 256; q++) {
      const c = fn(q / 255);
      a[q * 3] = c[0];
      a[q * 3 + 1] = c[1];
      a[q * 3 + 2] = c[2];
    }
    return a;
  };
  const LUTS: Record<FloodMode, Uint8Array> = {
    depth: mkLut(depthColor),
    speed: mkLut(speedColor),
    hazard: mkLut(hazardColor),
  };
  /** Синусын хүснэгт — урсгалын долгионд (Math.sin нь фрейм тутамд хэдэн мянга) */
  const SIN_N = 4096;
  const SIN = new Float32Array(SIN_N);
  for (let q = 0; q < SIN_N; q++) SIN[q] = Math.sin((q / SIN_N) * Math.PI * 2);

  /**
   * УРСГАЛЫН ДОЛГИОН.
   *
   * Долгионы оргилууд урсгалын ЧИГЛЭЛД, хурдтай ПРОПОРЦИОНАЛЬ явна — хурдан
   * урсгал нүдэнд хурдан харагдана.
   *
   * ⚠️ ХЭТРҮҮЛЭГ ил хэлье: бодит масштабаар 2 м/с урсгал нь 79 м долгионыг
   * 40 секундэд туулах ба дэлгэц дээр бараг хөдөлгөөнгүй харагдана. Тиймээс
   * харагдацын коэффициент (`FLOW_GAIN`) хэрэглэв — ХАРЬЦАА хэвээр, зөвхөн
   * ерөнхий хэмнэл нь хурдасна. Энэ нь ХЭМЖИЛТ БИШ, зөвхөн уншигдац.
   *
   * ⚠️ ХОЁР ДАВТАМЖ нийлүүлнэ. Ганц синус нь тодорхой хэмнэлтэй «зураас» болж
   * зохиомол харагддаг; хоёр дахин урт хоёр дахь долгион нэмэхэд гадаргуу
   * жигд бус, усархаг болно.
   */
  const WAVE_CELLS = 7;                  // долгионы урт (нүдээр) ≈ 79 м
  const FLOW_GAIN = 10;                  // харагдацын хурдасгал
  const KX = SIN_N / WAVE_CELLS;         // нүд → хүснэгтийн алхам
  /** Ирмэгийн зөөлрөлт — усны зах энэ хүртэл аажим тодорно (мм) */
  const EDGE_SOFT = 60;

  const frame = (
    s: number, f: number, phase: number, mode: FloodMode = 'depth',
  ): HTMLCanvasElement => {
    const LUT = LUTS[mode] ?? LUTS.depth;
    turn = 1 - turn;
    const cv = bufs[turn];
    const ctx = ctxs[turn];
    const img = imgs[turn];
    const px = img.data;
    const s0 = Math.max(0, Math.min(SL - 1, s));
    const s1 = Math.min(SL - 1, s0 + 1);
    const w1 = s0 === s1 ? 0 : Math.max(0, Math.min(1, f));
    const w0 = 1 - w1;
    const d0 = dep[s0];
    const d1 = dep[s1];
    const ua = uu[s0];
    const ub = uu[s1];
    const va = vv[s0];
    const vb = vv[s1];

    // ⚠️ Бүх пикселийг цэвэрлэнэ — өмнөх фреймд нойтон байсан нүд хатаж болно
    px.fill(0);

    /**
     * ── УРСГАЛЫН СҮЛЖЭЭ (доод давхарга) ──
     *
     * ⚠️ Уулын энгэрийн урсгал 2–4 см байдаг тул усны өнгө бараг үл
     * мэдэгдэнэ — «ус зөвхөн хөндийд байна» гэсэн ХУДАЛ сэтгэгдэл төрүүлнэ.
     * Хураах талбайг бүдэг шугам болгож зурвал ус ХААШАА урсаж байгаа нь
     * ус нимгэн үед ч харагдана.
     *
     * ⚠️ ЗӨВХӨН `depth` горимд: хурд/аюулын зурагт өнгө нь УТГА илэрхийлдэг
     * тул доод давхарга нэмбэл шатлал бохирдоно.
     *
     * ⚠️ ЛОГАРИФМ хуваарь: хураах талбай нь 1-ээс хэдэн зуун га хүртэл
     * өөрчлөгддөг тул шугаман хуваариар голоос бусад нь бүгд үл үзэгдэнэ.
     */
    if (mode === 'depth' && accRaw) {
      for (let i = 0, n = W * H; i < n; i++) {
        const a = accRaw[i];
        if (a < NET_MIN_HA) continue;
        const t = Math.log(a / NET_MIN_HA + 1) / Math.log(NET_FULL_HA / NET_MIN_HA + 1);
        const al = (t > 1 ? 1 : t) * NET_MAX_A;
        const p2 = i * 4;
        px[p2] = 96;
        px[p2 + 1] = 148;
        px[p2 + 2] = 184;
        px[p2 + 3] = al;
      }
    }

    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        /* Хугацааны ХООРОНДЫН утга — ус аажим нэмэгдэж/татарна */
        const raw = d0[i] * w0 + d1[i] * w1;
        if (raw <= wetRaw) continue;
        const m = raw / sd;

        /**
         * Урсгалын долгион — зөвхөн хөдөлгөөнтэй усанд.
         * ⚠️ Вектор ч ХООРОНД нь шингэнэ: зөвхөн `s0`-ийн векторыг авбал
         *    зүсмэл солигдох агшинд долгионы чиглэл ҮСРЭНГҮЙ эргэж, ус
         *    «таталт» өгсөн мэт харагдана.
         */
        let shade = 1;
        const ux = (ua[i] * w0 + ub[i] * w1) / su;
        const vy = (va[i] * w0 + vb[i] * w1) / sv;
        const sp = Math.hypot(ux, vy);
        if (sp > 0.05) {
          /* ⚠️ canvas-ийн `y` УРАГШ өсдөг тул хойд бүрэлдэхүүнийг урвуулна —
             эс бөгөөс долгион урсгалын ЭСРЭГ чиглэлд явна. */
          const proj = (x * ux - y * vy) / sp;
          const base = proj * KX - phase * sp * FLOW_GAIN * KX;
          const i1 = ((base | 0) % SIN_N + SIN_N) % SIN_N;
          const i2 = (((base * 0.5 + 1150) | 0) % SIN_N + SIN_N) % SIN_N;
          shade = 1 + SIN[i1] * 0.11 + SIN[i2] * 0.06;
        }

        /**
         * ⚠️ БУДАХ УТГА нь горимоос: гүн (м) · хурд (м/с) · аюул (м²/с).
         * Тунгалаг байдал нь ҮРГЭЛЖ ГҮНЭЭС — ус нимгэн газар бүх горимд
         * бүдэг байх ёстой, эс бөгөөс 3 см усан хальс «онц аюултай» улаанаар
         * цул будагдаж, зураг худал болно.
         */
        const val = mode === 'speed' ? sp / SATURATE_MS
          : mode === 'hazard' ? (m * sp) / SATURATE_HAZ
            : m / satM;
        const q = val >= 1 ? 255 : val > 0 ? (val * 255) | 0 : 0;
        /* Тунгалаг байдлын түлхүүр — үргэлж гүнээс */
        const dq = (() => {
          const td = m / satM;
          return td >= 1 ? 255 : (td * 255) | 0;
        })();

        const p = i * 4;
        const o = q * 3;
        /**
         * ХӨӨС — хурдан ус нь агаар холилдож ЦАЙВАР болдог.
         *
         * ⚠️ ЗӨВХӨН гүний горимд. Хурдны зурагт хурд нь аль хэдийн ӨНГӨӨР
         * илэрхийлэгддэг тул дээр нь цайруулбал хоёр удаа кодлогдож,
         * шатлал уншигдахаа болино.
         *
         * ⚠️ 1.2 м/с-ээс эхэлнэ: түүнээс удаан урсгал гадаргуу дээрээ
         * хөөсгүй — цайруулбал зогсонги ус ч хөөстэй мэт харагдана.
         */
        const foam = mode === 'depth' && sp > 1.2
          ? (sp - 1.2) * 0.16 < 0.34 ? (sp - 1.2) * 0.16 : 0.34
          : 0;
        const fk = 1 - foam;
        px[p] = LUT[o] * shade * fk + 255 * foam;
        px[p + 1] = LUT[o + 1] * shade * fk + 255 * foam;
        px[p + 2] = LUT[o + 2] * shade * fk + 255 * foam;
        /**
         * Гүехэн ус нь БҮДЭГ — доорх ортофото уншигдана; гүн ус нь бараг цул.
         * ⚠️ ЗАХЫГ ЗӨӨЛРҮҮЛНЭ: босгыг давмагц бүтэн тунгалаг болговол усны
         *    ирмэг пиксел пикселээр «дэлбэрч» тархах ба хөдөлгөөн барзгар
         *    харагдана. Эхний 6 см-ийн дотор аажим тодорно.
         */
        const edge = raw < wetRaw + EDGE_SOFT ? (raw - wetRaw) / EDGE_SOFT : 1;
        px[p + 3] = (150 + ((dq * 95) >> 8)) * edge;
      }
    }
    /* Тор → завсрын canvas → ГӨЛГӨР томруулж гаралт руу */
    rawCtxs[turn].putImageData(img, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(raws[turn], 0, 0, cv.width, cv.height);

    /**
     * УРСАЦЫН ЧИГЛЭЛИЙН СУМ (2026-08-29, хүсэлт).
     *
     * ⚠️ Яагаад ЭНД (растер дээр), тусдаа `GraphicsLayer` дээр БИШ вэ:
     *   · `MediaLayer` нь 2D, 3D, BIM гуравт ижил драп болдог — вектор
     *     графикийн эргэлт (`angle`) SceneView-д найдваргүй.
     *   · Фрейм тутамд 1,000 график дахин байгуулах нь 20 фрейм/сек дээр
     *     боломжгүй; canvas дээрх зураас нь ~0.2 мс.
     *
     * ⚠️ Сум нь ГАЗРЫН нэгжтэй (растерт шингэсэн) тул ойртоход томорно.
     *    Энэ нь зориуд: урсгалын талбар бүхэлдээ ижил нягтралтай уншигдана.
     */
    /**
     * ⚠️ СУМ нь ЗӨВХӨН `speed`/`hazard` горимд (2026-09-09).
     *
     * Гүний горимд урсгалыг ТООСОНЦРЫН СУДАЛ (`uyrUrsgal.ts`) харуулдаг
     * болсон. Хоёуланг зэрэг зурвал нэг ойлголт (чиглэл) хоёр өөр
     * тэмдэглэгээгээр давхарлагдаж, ус нь цагаан тор мэт болно.
     *
     * Шинжилгээний хоёр горимд судал АСААХГҮЙ (тэнд өнгө нь хурд/аюулыг
     * заадаг тул цагаан судал утгыг дардаг) — тиймээс сум тэнд ҮЛДЭНЭ.
     */
    if (mode === 'depth') return cv;
    const AR = ARROW_STEP;
    ctx.lineWidth = Math.max(0.8, SMOOTH * 0.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = (AR >> 1); y < H; y += AR) {
      for (let x = (AR >> 1); x < W; x += AR) {
        const i = y * W + x;
        /* Хуурай ба бараг зогсонги нүдэнд сум зурахгүй — «урсгалгүй
           газар урсгал байгаа» гэсэн ХУДАЛ дүр зураг гаргана */
        if (d0[i] * w0 + d1[i] * w1 < wetRaw) continue;
        const ux = (ua[i] * w0 + ub[i] * w1) / su;
        const vy = (va[i] * w0 + vb[i] * w1) / sv;
        const sp = Math.hypot(ux, vy);
        if (sp < ARROW_MIN_MS) continue;

        /* ⚠️ canvas-ийн `y` УРАГШ өсдөг тул хойд бүрэлдэхүүнийг урвуулна */
        const nx2 = ux / sp;
        const ny2 = -vy / sp;
        const cx0 = (x + 0.5) * SMOOTH;
        const cy0 = (y + 0.5) * SMOOTH;
        /* Урт нь хурдаас — хүчтэй урсгал урт сумтай */
        const len = Math.min(AR * SMOOTH * ARROW_MAX, (AR * SMOOTH * ARROW_BASE) * (1 + sp));
        const hx = cx0 + nx2 * len * 0.5;
        const hy = cy0 + ny2 * len * 0.5;
        const tx = cx0 - nx2 * len * 0.5;
        const ty = cy0 - ny2 * len * 0.5;
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        /* Үзүүр — 30° хоёр сэглээ */
        const hd = len * 0.40;
        const a = Math.atan2(ny2, nx2);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a - 0.5), hy - hd * Math.sin(a - 0.5));
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - hd * Math.cos(a + 0.5), hy - hd * Math.sin(a + 0.5));
      }
    }
    ctx.stroke();
    return cv;
  };

  const t0 = Date.parse(meta.times[0]);
  const minuteAt = (s: number) => (Date.parse(meta.times[s]) - t0) / 60000;

  const series = (i: number) => ({
    depth: Array.from({ length: SL }, (_, s) => depth(s, i)),
    speed: Array.from({ length: SL }, (_, s) => speed(s, i)),
  });

  /**
   * УРСГАЛЫН СҮЛЖЭЭ — хураах талбай (га) торны дарааллаар.
   * ⚠️ `frame()`-д БҮДЭГ доод давхарга болж зурагдана: ус нимгэн (2–4 см)
   * үед ч «уулаас хот руу ус ЭНЭ замаар ирнэ» гэдэг байнга харагдана.
   */
  const accRaw = extra?.accHa && extra.accHa.length >= P ? extra.accHa : null;

  const grid = (a?: Float32Array) =>
    (a && a.length >= P ? (i: number) => a[i] : undefined);
  const terrain = grid(extra?.terrainZ);
  const accHa = grid(extra?.accHa);
  const maxDepth = grid(extra?.maxDepth);
  const maxSpeed = grid(extra?.maxSpeed);
  const arr = extra?.arrivalS;
  const arrivalMin = arr && arr.length >= P
    ? (i: number) => (arr[i] < 0 ? null : arr[i] / 60)
    : undefined;

  return {
    meta, depth, u, v, speed, series, indexAt, frame, minuteAt,
    terrain, maxDepth, maxSpeed, arrivalMin, accHa,
  };
}

export async function loadFloodData(): Promise<FloodData> {
  if (cache) return cache;
  pending ??= (async () => {
    const [meta, buf] = await Promise.all([
      fetch(URL_META, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${URL_META}`);
        return r.json() as Promise<FloodMeta>;
      }),
      fetch(URL_BIN, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${URL_BIN}`);
        return r.arrayBuffer();
      }),
    ]);

    cache = floodDataFromBuffer(meta, buf);
    return cache;

  })();
  return pending;
}

/** Гүнээр эрсдэлийн зэрэглэл — попап ба хүснэгтэд */
export const depthRisk = (m: number): { label: string; color: string } =>
  m > 1.0 ? { label: tr('Өндөр'), color: 'var(--bad-ink)' }
    : m > 0.5 ? { label: tr('Дунд'), color: 'var(--warn-ink)' }
      : { label: tr('Бага'), color: 'var(--good-ink)' };
