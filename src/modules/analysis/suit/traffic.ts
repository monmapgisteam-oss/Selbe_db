/**
 * ТРАФИКИЙН ХӨДӨЛГҮҮР — 24 цагийн урсгалын МИКРОСИМУЛЯЦ (SUMO-ийн зарчмаар).
 *
 * Гурван давхарга:
 *   1. СҮЛЖЭЭ  — замын шугамын хэрчмүүдийг үзүүрээр нь наан (`buildNetwork`)
 *                зангилаа ↔ ирмэгийн граф болгоно. Ирмэг бүр хоёр чиглэлтэй.
 *   2. ЭРЭЛТ   — өдрийн цагийн муруй (`DIURNAL`) идэвхтэй машины ТООГ тогтооно;
 *                машин хаана төрөхийг ирмэгийн `baseLoad` (ойрх бүсийн аялал
 *                үүсгэлт) жинлэнэ.
 *   3. АГЕНТ   — машин бүр урдахаа дагаж (car-following) хурдаа тохируулна,
 *                уулзвар дээр ШУЛУУН явахыг илүүд үзэж эргэлтээ сонгоно
 *                (`pickNext`). Түгжрэл нь дүрмээр биш, НЯГТРАЛААС өөрөө үүснэ.
 *
 * ⚠️ Энэ файл нь ЦЭВЭР математик — ArcGIS-ээс хараат бус, `traffic.check.mjs`-ээр
 * шалгагдана. Газрын зурган дээрх зуралт (`TrafficOverlay`) энэ функцуудыг дуудаж
 * зөвхөн БАЙРЛАЛЫГ зурна; сүлжээг татаж, `baseLoad` онооход `roadNet.ts` хариуцна.
 */

/**
 * ӨДРИЙН ЦАГИЙН ЭРЭЛТИЙН МУРУЙ — 24 цагийн харьцангуй жин (0..1).
 * Хоёр оргил: өглөө ~08:00 (ажилдаа), орой ~18:00 (гэртээ). Шөнө хамгийн бага.
 * ⚠️ Энэ бол ТААМАГ хэлбэр — бодит тоолуурын өгөгдөл ирвэл солино.
 */
export const DIURNAL: number[] = [
  0.05, 0.03, 0.02, 0.02, 0.04, 0.12, // 00–05
  0.35, 0.75, 1.00, 0.80, 0.55, 0.50, // 06–11
  0.55, 0.55, 0.50, 0.55, 0.70, 0.95, // 12–17
  1.00, 0.80, 0.55, 0.35, 0.20, 0.10, // 18–23
];

/** Хоногийн минут (0..1440) — хугацааг тойрог болгож нормчилно. */
export const wrapMin = (minute: number): number => ((minute % 1440) + 1440) % 1440;

/** Өгсөн минут дахь эрэлтийн үржүүлэгч — цаг хооронд шугаман интерполяци. */
export function diurnalAt(minute: number): number {
  const h = wrapMin(minute) / 60;
  const i = Math.floor(h) % 24;
  const j = (i + 1) % 24;
  const f = h - Math.floor(h);
  return DIURNAL[i] + (DIURNAL[j] - DIURNAL[i]) * f;
}

/** Минут → «ЦЦ:ММ». */
export function clockText(minute: number): string {
  const m = Math.round(wrapMin(minute));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/* ══════════════════ Замын шугам дагуух байрлал ══════════════════ */

export type Pt = [number, number];

/** Замын хэрчим — проекцлосон CRS дэх оройнууд ба урьдчилан бодсон урт. */
export type Segment = {
  id: string;
  /** Оройнууд [x, y] (проекцлосон, жиш. Web Mercator) */
  pts: Pt[];
  /** Орой бүр дэх хуримтлагдсан урт (`cum[0] = 0`) */
  cum: number[];
  /** Нийт урт (проекцын нэгжээр) */
  length: number;
  /** Эрэлтийн жин 0..1 — ойролцоох бүсийн аялал үүсгэлтээс (`roadNet.ts` ононо) */
  baseLoad: number;
};

/** Оройнуудаас хуримтлагдсан урт ба нийт уртыг бодно. */
export function measurePath(pts: Pt[]): { cum: number[]; length: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { cum, length: cum[cum.length - 1] ?? 0 };
}

/**
 * Цэгээс ХЭРЧИМ (a→b) хүртэлх хамгийн богино зай.
 * ⚠️ Хязгаарлагдмал хэрчим — тусгал нь гадуур унавал үзүүрт таслана (`t`-г 0..1),
 * эс бөгөөс шугамын үргэлжлэл рүү «уяж» худал ойр зай өгнө.
 */
export function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Цэгээс ОЛОН ОРОЙТ шугам хүртэлх хамгийн богино зай (хэрчим бүрийн минимум). */
export function distToPath(p: Pt, pts: Pt[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSeg(p, pts[i - 1], pts[i]);
    if (d < best) best = d;
  }
  return best;
}

/** Оройнуудаас `Segment` бүтээнэ (id ба baseLoad-ыг өгнө). */
export function makeSegment(id: string, pts: Pt[], baseLoad = 0): Segment {
  const { cum, length } = measurePath(pts);
  return { id, pts, cum, length, baseLoad };
}

/**
 * Хэрчмийн дагуух t (0..1) фракц дахь [x, y] байрлал.
 * ⚠️ Хоосон/ганц оройтой/тэг урттай хэрчимд эхний оройг буцаана.
 */
export function posAt(seg: Segment, t: number): Pt {
  if (seg.pts.length === 0) return [0, 0];
  if (seg.pts.length === 1 || seg.length === 0) return seg.pts[0];
  const d = Math.max(0, Math.min(1, t)) * seg.length;
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < d) i++;
  const a = seg.pts[i - 1];
  const b = seg.pts[i];
  const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
  const f = (d - seg.cum[i - 1]) / segLen;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/**
 * Хэрчмийн дагуух `d` МЕТР дэх байрлал БА нэгж чиглэлийн вектор.
 * Машиныг зурахад аль аль нь хэрэгтэй (эргэлтийг чиглэлээр нь харуулна).
 */
export function poseAt(seg: Segment, d: number): { x: number; y: number; ux: number; uy: number } {
  if (seg.pts.length < 2 || seg.length === 0) {
    const p = seg.pts[0] ?? [0, 0];
    return { x: p[0], y: p[1], ux: 1, uy: 0 };
  }
  const dd = Math.max(0, Math.min(seg.length, d));
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < dd) i++;
  const a = seg.pts[i - 1];
  const b = seg.pts[i];
  const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
  const f = (dd - seg.cum[i - 1]) / segLen;
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    ux: (b[0] - a[0]) / segLen,
    uy: (b[1] - a[1]) / segLen,
  };
}

/* ══════════════════ Замын сүлжээ (граф) ══════════════════ */

/** Уулзвар — байрлал ба түүнд ирсэн ирмэгийн индексүүд. */
export type NetNode = { x: number; y: number; out: number[] };

/**
 * Ирмэг = хэрчим + хоёр үзүүрийн зангилаа. ХОЁР чиглэлтэй.
 *
 * ⚠️ `src` нь ОРОЛТЫН зам (`paths`)-ын индекс. Граф байгуулахдаа нэг зам хэд
 * хэдэн ирмэг болж хуваагдаж, зарим нь хаягддаг тул ирмэгийн индексээр эх
 * замын АТРИБУТ (OSM-ийн ангилал, эгнээ) руу буцаж очих ГАНЦ зам нь энэ.
 */
export type NetEdge = Segment & { a: number; b: number; src: number };

export type Network = {
  nodes: NetNode[];
  edges: NetEdge[];
  /**
   * Проекцын НЭГЖ / БОДИТ МЕТР. Геометр Web Mercator-оор ирдэг бөгөөд 48°
   * өргөрөгт масштабын коэффициент 1/cos(φ) ≈ 1.49 — өөрөөр хэлбэл «100 нэгж»
   * гэдэг нь 67 бодит метр.
   *
   * ⚠️ Хөдөлгүүрийн БҮХ тогтмол (машины урт, хурд, аюулгүй зай, наах хүлцэл)
   * БОДИТ метрээр бичигдсэн тул `edge.length` зэрэг проекцын нэгжтэй харьцахдаа
   * ЗААВАЛ энэ коэффициентээр хөрвүүлнэ. Үүнийг мартвал машин 1.49 дахин удаан
   * явж, тайлант хурд нь худал болно.
   */
  unitsPerMeter: number;
  /**
   * ГЭРЛЭН ДОХИОТОЙ зангилаанууд (`nodes`-ийн индекс).
   *
   * ⚠️ Эх сурвалж ЗӨВХӨН бодит `gerlen_dohio` service (`loadRealSignalsCached`).
   * Уулзварын төвийг ойрын зангилаанд наана. Хоосон Set бол дохиогүй сүлжээ
   * (машин уулзвар дээр зогсохгүй дамжина).
   */
  signals: Set<number>;
  /**
   * Дохиотой зангилаа → (ирмэгийн индекс → БҮЛЭГ). Ирмэг бүрийг БАЙРЛАЛААР
   * (төвөөс line-ийн дунд цэг рүү чиглэл ↔ ирмэгийн чиглэл) өөрийн замын
   * зогсолтын шугамын бүлэгт онооно (0 = codes 1,3, 1 = codes 2,4).
   *
   * ⚠️ МЭДЭЭЛЛИЙН зориулалттай (оношилгоо/тест): машины ЗОГСОЛТ `stopBars`-т
   * суурилдаг — зангилаагаар биш, зураасан дээр.
   */
  signalGroups: Map<number, Map<number, SignalGroup>>;
  /**
   * Газрын зурагт зурах БОДИТ гэрлэн дохионы шугамууд (`gerlen_dohio`).
   * ⚠️ Зөвхөн сүлжээнд НААЛДСАН уулзварынх — зуралт ба машины зан нэг мөчлөгтэй.
   */
  signalLines: SignalLine[];
  /**
   * ирмэгийн индекс → УЛААН ГЭРЛИЙН ЗОГСОЛТЫН ШУГАМУУД тэр ирмэг дээр.
   *
   * ⚠️ ХӨДӨЛГҮҮРИЙН ЗОГСОЛТ ЭНД СУУРИЛНА (зангилаан дээр БИШ): `gerlen_dohio`
   * line ирмэгийг ХААНА огтолж байна, машин улаанд ЯГ ТЭНД тулж зогсоно —
   * дэлгэцэн дээрх улаан зураас ба зогсох байрлал үргэлж таарна. Зангилаагаар
   * зогсоовол зураас (уулзвараас ~30-60 м) давагдаж харагддаг байсан.
   */
  stopBars: Map<number, StopBar[]>;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээ юу — ирмэг бүр зөвхөн `a→b` (шугамын дижитал дараалал =
   * газрын зураг дээрх сум) чиглэлд явагдана.
   *
   * ⚠️ Бодит замын line (`Monmap_zam`) сумтай тул машин ЗӨВХӨН тэр зүг явна;
   * уулзварт зөвхөн `a===node` ирмэг рүү эргэнэ. Мухарт (sink) машин УСТАХГҮЙ —
   * `sinkExit`-ээр ойрын гарц руу шилжиж ТАСРАЛТГҮЙ явна. `et:5` мэт CAD
   * чиглэлгүй тул `false`.
   */
  directed: boolean;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээний мухар (sink) зангилаа → ойрын ГАРЦ ирмэгүүд.
   *
   * ⚠️ Машин ТАСРАЛТГҮЙ явахын үндэс: чиглэлтэй сүлжээнд мухарт хүрсэн машиныг
   * устгавал «гэнэт алга болоод хожим өөр газар гарч ирдэг» байсан. Оронд нь
   * ойрын (`SINK_JUMP_M` дотор) гарцтай зангилааны ирмэг рүү шилжинэ — хоёр
   * эгнээт замын хил дээр энэ нь ЭСРЭГ УРСГАЛЫН эх тул U-эргэлт шиг харагдана.
   * Ойр гарц байхгүй бол `stepCars` U-эргэлт хийлгэнэ (чиглэлийн эсрэг ч явна —
   * тасралтгүй байх нь чиглэлээс чухал).
   */
  sinkExit: Map<number, number[]>;
};

/** Үзүүрийг наах хүлцэл (БОДИТ метр) — CAD-ийн хэрчмүүд яг таг таардаггүй. */
export const SNAP_TOL_M = 1.0;

/**
 * Гэрлэн дохионы цэгийг зангилаанд наах хүлцэл (БОДИТ метр).
 * ⚠️ Наах хүлцлээс (`SNAP_TOL_M`) ХАМААГҮЙ том: OSM-ийн дохионы цэг уулзварын
 * ЯГ төвд биш, ойролцоо (зогсолтын шугам дээр) тавигддаг. Мөн бодит замын
 * геометр ба OSM-ийн зөрүү ~хэдэн метр байж болно.
 */
export const SIGNAL_SNAP_M = 12;

/**
 * Мухраас ойрын гарц хайх радиус (БОДИТ метр) — `Network.sinkExit`.
 * Хоёр эгнээт замын хилийн үзүүрт эсрэг урсгалын эх ~10-30 м зайд байдаг.
 */
export const SINK_JUMP_M = 60;

/**
 * Гэрлэн дохионы БҮЛЭГ: 0 = codes 1,3 (нэг тэнхлэг), 1 = codes 2,4 (нөгөө).
 * Мөчлөгийн phase-тэй тэнцэх үед НОГООН (`signalLineGreen`).
 */
export type SignalGroup = 0 | 1;

/** Газрын зурагт зурах гэрлэн дохионы approach line (бодит геометр). */
export type SignalLine = { pts: Pt[]; group: SignalGroup };

/**
 * Ирмэг дээрх зогсолтын шугам — `gerlen_dohio` line ирмэгийг огтолсон цэг.
 *   `s`     — огтолсон байрлал ирмэгийн дагуу (ПРОЕКЦЫН нэгж, 0..length)
 *   `dir`   — аль чиглэлийн урсгалд үйлчлэх вэ (уулзварын төв РҮҮ явж буй тал)
 *   `group` — фазын бүлэг (`signalLineGreen`-д өгнө)
 */
export type StopBar = { s: number; dir: 1 | -1; group: SignalGroup };

/**
 * Гэрлэн дохионы тодорхойлолт — уулзварын ТӨВ (`pt`) ба approach `lines`.
 * ⚠️ `pt` нь дохиог замын зангилаанд наахад, `lines` нь зурахад ба уулзварын
 * ирмэгүүдийг бүлэгт хуваарилахад (`gerlen_dohio` дата).
 */
export type SignalDef = { pt: Pt; lines?: SignalLine[] };

/**
 * Үүнээс богино хэрчим ИРМЭГ болохгүй (доройтсон оройнууд).
 * ⚠️ Маш ЖИЖИГ байлгах ёстой: 0.6–1 м-ийн хэрчмүүд нь CAD дээр хоёр гудамжийг
 * ХОЛБОГЧ болдог. Тэдгээрийг хаявал сүлжээ хэсэгчилж (холбогдсон урт 55%-иас
 * 40% болж) машин жижиг халаасанд түгжигдэнэ.
 */
const MIN_EDGE_M = 0.05;

/**
 * Шугамуудыг ГЕОМЕТРИЙН ОГТЛОЛЦОЛ дээр таслана (intersection noding).
 *
 * ⚠️ ЯАГААД ЗААВАЛ: зарим замын өгөгдөлд (жиш. `Monmap_zam` бодит зам) нэг урт
 * шугам хажуугийн замуудыг ДУНД оройгоо ХУВААЛЦАЛГҮЙГЭЭР гаталж өнгөрдөг. Тэр
 * үед `buildNetwork` (зөвхөн ҮЗҮҮР наадаг) сүлжээг бутаргана — хэмжилтээр 113
 * шугам 96 салангид хэсэг болж, хамгийн том нь ердөө 12.6% байв. Огтлолцол дээр
 * тасалснаар нэг холбогдсон хэсэг 94.5% болж өссөн.
 *
 * ⚠️ `et:5` мэтийн CAD өгөгдөлд ХЭРЭГЛЭХГҮЙ: тэнд шугам аль хэдийн уулзвар бүрд
 * тасарсан (24 мянган богино хэрчим) тул энэ нь илүүц бөгөөд удаан. Зөвхөн
 * тасраагүй урт шугамтай эх сурвалжид (`netSources`-ийн `nodeIntersections`).
 *
 * Тор (grid)-оор зөвхөн ойрхон хэрчмүүдийг шалгана — O(n²)-ээс сэргийлнэ.
 */
export function nodeByIntersection(
  paths: Pt[][],
  { unitsPerMeter = 1, cellM = 60 }: { unitsPerMeter?: number; cellM?: number } = {},
): Pt[][] {
  const cell = cellM * unitsPerMeter;
  /** Хэрчим бүрийн дагуух таслах цэгүүд [{t, pt}] — эх шугам·сегментээр */
  const splits: { t: number; pt: Pt }[][][] = paths.map((p) =>
    Array.from({ length: Math.max(0, p.length - 1) }, () => []),
  );

  /** Бүх сегмент + торны индекс */
  const segs: { w: number; i: number; a: Pt; b: Pt }[] = [];
  const grid = new Map<string, number[]>();
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w];
    for (let i = 0; i < p.length - 1; i++) {
      const idx = segs.length;
      segs.push({ w, i, a: p[i], b: p[i + 1] });
      const x0 = Math.min(p[i][0], p[i + 1][0]);
      const x1 = Math.max(p[i][0], p[i + 1][0]);
      const y0 = Math.min(p[i][1], p[i + 1][1]);
      const y1 = Math.max(p[i][1], p[i + 1][1]);
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
        for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
          const k = `${cx},${cy}`;
          const list = grid.get(k);
          if (list) list.push(idx); else grid.set(k, [idx]);
        }
      }
    }
  }

  /** Хоёр сегментийн ДОТООД огтлолцол (үзүүр таарах нь тооцохгүй). */
  const isect = (A: Pt, B: Pt, C: Pt, D: Pt): { t: number; u: number; pt: Pt } | null => {
    const rx = B[0] - A[0], ry = B[1] - A[1];
    const sx = D[0] - C[0], sy = D[1] - C[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null; // параллель
    const t = ((C[0] - A[0]) * sy - (C[1] - A[1]) * sx) / den;
    const u = ((C[0] - A[0]) * ry - (C[1] - A[1]) * rx) / den;
    if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
    return { t, u, pt: [A[0] + t * rx, A[1] + t * ry] };
  };

  const seen = new Set<number>();
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const pi = list[x], qi = list[y];
        if (segs[pi].w === segs[qi].w) continue; // нэг замын өөрийн нугалаа биш
        const key = pi < qi ? pi * segs.length + qi : qi * segs.length + pi;
        if (seen.has(key)) continue;
        seen.add(key);
        const h = isect(segs[pi].a, segs[pi].b, segs[qi].a, segs[qi].b);
        if (h) {
          // ⚠️ ХОЁУЛАНД нь ИЖИЛ цэг (`h.pt`) → таслахад үзүүр давхацна → `buildNetwork` нэг зангилаа болгоно
          splits[segs[pi].w][segs[pi].i].push({ t: h.t, pt: h.pt });
          splits[segs[qi].w][segs[qi].i].push({ t: h.u, pt: h.pt });
        }
      }
    }
  }

  const out: Pt[][] = [];
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w];
    if (p.length < 2) continue;
    let cur: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const sp = splits[w][i]
        .filter((s) => s.t > 1e-6 && s.t < 1 - 1e-6)
        .sort((a, b) => a.t - b.t);
      for (const s of sp) {
        cur.push(s.pt);
        if (cur.length >= 2) out.push(cur);
        cur = [s.pt];
      }
      cur.push(p[i + 1]);
    }
    if (cur.length >= 2) out.push(cur);
  }
  return out;
}

/**
 * Замын шугамын хэрчмүүдийг үзүүрээр нь наан ГРАФ болгоно.
 *
 * ⚠️ Эх өгөгдөл нь CAD-аас гаралтай тул НЭГ гудамж олон арван хэрчим болж
 * хуваагдсан байдаг. Тэдгээрийг нэгтгэхгүй: degree-2 зангилаа дээр машин зүгээр
 * л дараагийн ирмэг рүү үргэлжилнэ (`pickNext` шулуун чиглэлийг сонгоно) тул
 * үр дүн ижил, код нь энгийн.
 *
 * ⚠️ ХААЛТТАЙ гогцоо (тойрог уулзвар) — эхлэл ба төгсгөл нь нэг зангилаа болох
 * тул дундуур нь ХОЁР ирмэг болгож хуваана; эс бөгөөс граф руу орж чадахгүй.
 */
export function buildNetwork(
  paths: Pt[][],
  {
    tolM = SNAP_TOL_M,
    unitsPerMeter = 1,
    signals: signalDefs,
    directed = false,
  }: {
    tolM?: number;
    unitsPerMeter?: number;
    /** Гэрлэн дохио (ижил CRS) — ойрын уулзварт наана, `green0` фазыг тогтооно */
    signals?: SignalDef[];
    /** Ирмэгийг зөвхөн `a→b` явдаг ЧИГЛЭЛТЭЙ болгох (шугамын сум) */
    directed?: boolean;
  } = {},
): Network {
  const tol = tolM * unitsPerMeter;
  const nodes: NetNode[] = [];
  /** Торны нүд → тэнд бүртгэгдсэн зангилааны индексүүд */
  const grid = new Map<string, number[]>();

  /**
   * Цэгийг ойрын зангилаанд наана; байхгүй бол шинээр үүсгэнэ.
   *
   * ⚠️ Нүдний ТҮЛХҮҮРЭЭР шууд харьцуулж БОЛОХГҮЙ (`round(x/tol)`): нүдний зааг
   * дээр таарсан 2 см зөрүүтэй хоёр цэг өөр түлхүүр авч, уулзвар салдаг.
   * Тиймээс 3×3 хөршийг гүйж БОДИТ зайгаар шалгана — энэ засвараар холбогдсон
   * сүлжээний урт 22%-иас 55% болж өссөн.
   */
  const nid = (p: Pt): number => {
    const cx = Math.floor(p[0] / tol);
    const cy = Math.floor(p[1] / tol);
    let best = -1;
    let bestD = tol;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(nodes[i].x - p[0], nodes[i].y - p[1]);
          if (d <= bestD) { bestD = d; best = i; }
        }
      }
    }
    if (best >= 0) return best;
    const i = nodes.length;
    nodes.push({ x: p[0], y: p[1], out: [] });
    const k = `${cx},${cy}`;
    const cell = grid.get(k);
    if (cell) cell.push(i); else grid.set(k, [i]);
    return i;
  };

  const edges: NetEdge[] = [];
  const push = (pts: Pt[], src: number) => {
    if (pts.length < 2) return;
    // ⚠️ Доройтсон хэрчмийн үзүүрийг ч ЗААВАЛ бүртгэнэ — тэдгээр нь хөрш
    //    хэрчмүүдийн НИЙТЛЭГ зангилаа болж холболтыг барьдаг.
    const a = nid(pts[0]);
    const b = nid(pts[pts.length - 1]);
    if (a === b) return;
    const seg = makeSegment(String(edges.length), pts);
    if (seg.length < MIN_EDGE_M * unitsPerMeter) return;
    edges.push({ ...seg, a, b, src });
  };

  for (let i = 0; i < paths.length; i++) {
    const pts = paths[i];
    if (pts.length < 2) continue;
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= tol;
    if (closed && pts.length >= 4) {
      const mid = Math.floor(pts.length / 2);
      push(pts.slice(0, mid + 1), i);
      push(pts.slice(mid), i);
    } else {
      push(pts, i);
    }
  }

  for (let i = 0; i < edges.length; i++) {
    nodes[edges[i].a].out.push(i);
    nodes[edges[i].b].out.push(i);
  }

  /* ── Гэрлэн дохиог УУЛЗВАРТ наах ──
     ⚠️ Зөвхөн ЖИНХЭНЭ уулзварт (degree ≥ 3): degree-2 зангилаа нь нэг гудамжны
     дундах хуваалт тул тэнд дохио утгагүй. Дохио цэг тус бүрийг ойрын ийм
     уулзварт (`SIGNAL_SNAP_M` дотор) наана; дохио цөөн (≤хэдэн арав) тул шугаман
     хайлт хангалттай. */
  const signals = new Set<number>();
  const signalGroups = new Map<number, Map<number, SignalGroup>>();
  const signalLines: SignalLine[] = [];
  const stopBars = new Map<number, StopBar[]>();

  /** Хоёр хэрчмийн огтлолцол — `t` нь A→B дээрх фракц (үзүүрийг оруулна). */
  const segX = (A: Pt, B: Pt, C: Pt, D: Pt): { t: number } | null => {
    const rx = B[0] - A[0], ry = B[1] - A[1];
    const sx = D[0] - C[0], sy = D[1] - C[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null; // параллель (шугам замын ДАГУУ биш байх ёстой)
    const t = ((C[0] - A[0]) * sy - (C[1] - A[1]) * sx) / den;
    const u = ((C[0] - A[0]) * ry - (C[1] - A[1]) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t } : null;
  };

  if (signalDefs?.length) {
    const tolU = SIGNAL_SNAP_M * unitsPerMeter;
    for (const sd of signalDefs) {
      const lines = sd.lines ?? [];
      if (!lines.length) continue;
      for (const ln of lines) signalLines.push(ln);

      /* ── Зогсолтын ШУГАМЫГ ирмэг дээр буулгах ──
         Line замаа ХӨНДЛӨН огтолдог тул centerline ирмэгтэй огтолцоно. Шугамыг
         30% сунгана — замын тэнхлэг шугамын яг үзүүрт таарахгүй байж болно.
         Үйлчлэх чиглэл = уулзварын төв (`sd.pt`) РҮҮ явж буй урсгал: гарч буй
         урсгал өөрийн шугамыг АРААСАА давсан тул түүнд хамаагүй. */
      for (const ln of lines) {
        const A = ln.pts[0];
        const B = ln.pts[ln.pts.length - 1];
        const ex = (B[0] - A[0]) * 0.3;
        const ey = (B[1] - A[1]) * 0.3;
        const A2: Pt = [A[0] - ex, A[1] - ey];
        const B2: Pt = [B[0] + ex, B[1] + ey];
        for (let ei = 0; ei < edges.length; ei++) {
          const e = edges[ei];
          for (let i = 1; i < e.pts.length; i++) {
            const P = e.pts[i - 1];
            const Q = e.pts[i];
            const h = segX(P, Q, A2, B2);
            if (!h) continue;
            const segLen = e.cum[i] - e.cum[i - 1] || 1;
            const s = e.cum[i - 1] + h.t * segLen;
            const hx = P[0] + (Q[0] - P[0]) * h.t;
            const hy = P[1] + (Q[1] - P[1]) * h.t;
            const dir: 1 | -1 =
              ((Q[0] - P[0]) * (sd.pt[0] - hx) + (Q[1] - P[1]) * (sd.pt[1] - hy)) > 0 ? 1 : -1;
            let list = stopBars.get(ei);
            if (!list) { list = []; stopBars.set(ei, list); }
            list.push({ s, dir, group: ln.group });
          }
        }
      }
      // ⚠️ `gerlen_dohio`-гийн line нь ЗОГСОЛТЫН ШУГАМ — замаа ХӨНДЛӨН огтолно
      //    (замтайгаа ПЕРПЕНДИКУЛЯР). Тиймээс ирмэгийг line-ийн ЧИГЛЭЛЭЭР
      //    («хамгийн параллель») онооход ХӨНДЛӨН замын бүлэг таарч, фаз УРВУУ
      //    болдог байсан (улаанд машин давхидаг алдаа). Оронд нь БАЙРЛАЛААР:
      //    төвөөс line-ийн ДУНД ЦЭГ рүү чиглэл нь тухайн замын тэнхлэг —
      //    ирмэгийн чиглэлтэй хамгийн сайн таарах line-ийн бүлгийг авна.
      const lineDirs = lines.map((ln) => {
        const a = ln.pts[0];
        const b = ln.pts[ln.pts.length - 1];
        const mx = (a[0] + b[0]) / 2 - sd.pt[0];
        const my = (a[1] + b[1]) / 2 - sd.pt[1];
        const L = Math.hypot(mx, my) || 1;
        return { g: ln.group, dx: mx / L, dy: my / L };
      });
      // ⚠️ Уулзварын ойролцоох БҮХ жинхэнэ уулзвар (degree≥3) — noding хуваасан
      //    кластер уулзварыг бүхэлд нь хаана. Тус бүрийн ирмэгийг хамгийн
      //    параллель line-ийн бүлэгт хуваарилна (эргэлтээс үл хамаарна).
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].out.length < 3) continue;
        if (Math.hypot(nodes[i].x - sd.pt[0], nodes[i].y - sd.pt[1]) > tolU) continue;
        signals.add(i);
        let m = signalGroups.get(i);
        if (!m) { m = new Map<number, SignalGroup>(); signalGroups.set(i, m); }
        for (const ei of nodes[i].out) {
          const eh = outHeading(edges[ei], i);
          let bestG: SignalGroup = 0;
          let bestDot = -1;
          for (const ld of lineDirs) {
            const dot = Math.abs(eh[0] * ld.dx + eh[1] * ld.dy);
            if (dot > bestDot) { bestDot = dot; bestG = ld.g; }
          }
          m.set(ei, bestG);
        }
      }
    }
  }

  /* ── Мухрын гарц (зөвхөн чиглэлтэй сүлжээнд) ──
     Sink = гарах (`a===node`) ирмэггүй зангилаа. Ойрын гарцтай зангилааны
     ирмэгүүдийг бүртгэнэ — машин тасралтгүй үргэлжлэх «U-эргэлтийн» зам. */
  const sinkExit = new Map<number, number[]>();
  if (directed) {
    const legalOut = nodes.map((n, i) => n.out.filter((ei) => edges[ei].a === i));
    const R = SINK_JUMP_M * unitsPerMeter;
    for (let i = 0; i < nodes.length; i++) {
      if (legalOut[i].length || !nodes[i].out.length) continue;
      let best = -1;
      let bestD = R;
      for (let j = 0; j < nodes.length; j++) {
        if (!legalOut[j].length) continue;
        const d = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
        if (d <= bestD) { bestD = d; best = j; }
      }
      if (best >= 0) sinkExit.set(i, legalOut[best]);
    }
  }

  return { nodes, edges, unitsPerMeter, signals, signalGroups, signalLines, stopBars, sinkExit, directed };
}

/**
 * Гэрлэн дохионы БҮТЭН мөчлөг (сим-секунд). Хагас нь нэг бүлгийн ногоон.
 * ⚠️ Бодит дохио 30 сек тутам сольдог (`gerlen_dohio`) тул хагас = 30, бүтэн = 60.
 * `stepCars`/зуралтад өгөх `time` нь машины хөдөлгөөнтэй ижил масштабтай сим-хугацаа.
 */
export const SIGNAL_CYCLE_S = 60;

/** ШАР гэрлийн үргэлжлэх хугацаа (сим-секунд) — ногооны ТӨГСГӨЛД асна. */
export const YELLOW_S = 3;

export type SignalPhase = 'green' | 'yellow' | 'red';

/**
 * Бүлгийн гэрлийн ФАЗ. Идэвхтэй хагас (30 сек) = эхний 27 сек НОГООН + сүүлийн
 * 3 сек ШАР (`YELLOW_S`); идэвхгүй хагас = УЛААН.
 *
 * ⚠️ ШАРААР МАШИН ЯВАХГҮЙ: зогсолтын шугам шарт ч үйлчилнэ (`signalLineGreen`
 * зөвхөн ногоонд true). Шугам аль хэдийн ДАВСАН машин уулзвараа чөлөөлж гарна —
 * бодит жолооч шиг. Зам (машины зогсолт) БА line (өнгө) ХОЁУЛ энэ функцээс
 * гардаг тул зурааны өнгө ↔ машины зан ҮРГЭЛЖ таарна.
 */
export function signalPhase(group: SignalGroup, time: number): SignalPhase {
  const half = SIGNAL_CYCLE_S / 2;
  const t = ((time % SIGNAL_CYCLE_S) + SIGNAL_CYCLE_S) % SIGNAL_CYCLE_S;
  if (Math.floor(t / half) !== group) return 'red';
  return t % half < half - YELLOW_S ? 'green' : 'yellow';
}

/** Урсгал НЭВТРЭХ эрхтэй юу — ЗӨВХӨН ногоон (шарт ч зогсоно). */
export function signalLineGreen(group: SignalGroup, time: number): boolean {
  return signalPhase(group, time) === 'green';
}

/** Зангилаанаас ГАРАХ чиглэлийн нэгж вектор (тухайн ирмэг дагуу). */
export function outHeading(edge: NetEdge, node: number): Pt {
  const n = edge.pts.length;
  const [p, q] = edge.a === node ? [edge.pts[0], edge.pts[1]] : [edge.pts[n - 1], edge.pts[n - 2]];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
}


/* ══════════════════ Машин агент ══════════════════ */

export type Car = {
  /** Одоо явж буй ирмэгийн индекс */
  e: number;
  /** Ирмэг дээрх зай (м), чиглэлээс үл хамааран 0..length */
  s: number;
  /** +1 = a→b, −1 = b→a */
  dir: 1 | -1;
  /** Одоогийн хурд (м/с) */
  v: number;
  /** Чөлөөт урсгалын хурд (м/с) — машин бүрд бага зэрэг өөр */
  vmax: number;
  /**
   * ДҮРСЛЭЛИЙН тогтмол үр (0..1) — биеийн өнгө сонгоход.
   * ⚠️ Хөдөлгүүр үүнийг УНШИХГҮЙ; агент төрөхөд нэг л удаа оноогдоно. Машин
   * бүр өөрийн өнгөтэй байснаар урсгал жинхэнэ трафик шиг харагдана — хэрэв
   * фрейм тутам санамсаргүй сонговол өнгө нь анивчина.
   */
  tint: number;
  /**
   * ТЭЭВРИЙН ТӨРЛИЙН индекс (`VEHICLE_TYPES`) — хөнгөн авто / автобус / ачаа.
   * ⚠️ Заавал биш (`?`): хуучин код ба тестийн машин үүнгүй байж болно — тэр үед
   * анхдагч урт (`CAR_LEN`) ба зуралт хэрэглэгдэнэ.
   */
  vt?: number;
  /** Машины УРТ (бодит метр) — төрлөөс. Байхгүй бол `CAR_LEN`. */
  len?: number;
};

/** Машины ойролцоо урт (м) — car-following-д «эзэлсэн зай». Төрөлгүй машины анхдагч. */
export const CAR_LEN = 5;
/** Машины эзлэх урт (м) — төрөл өгсөн бол түүнийх, эс бөгөөс `CAR_LEN`. */
export const carLen = (c: Car): number => c.len ?? CAR_LEN;
/** Зогсох үеийн бамперын хоорондох зай (м) */
export const MIN_GAP_M = 2;
/**
 * ЗОГСОЛТЫН ШУГАМ — улаан гэрэлд машины УРД тал уулзвараас хэдэн метр өмнө
 * зогсох (машины хагас уртаас гадна). ⚠️ Уулзварын төв дээр биш ингэж зогсоосноор
 * эсрэг талын approach-ийн машинтай давхцахгүй, жагсаа зам дагуу тарж жагсна.
 */
export const STOP_LINE_M = 2.5;
/** Жолоочийн урвалын хугацаа (с) — Krauss загварын τ */
const TAU = 1.0;
/** Хурдатгал ба удаашрал (м/с²) */
const ACC = 1.8;
const DEC = 4.5;

/** Чөлөөт урсгалын хурдны хязгаар (м/с) — 30…50 км/ц. */
export const V_MIN = 30 / 3.6;
export const V_MAX = 50 / 3.6;

/* ══════════════════ Тээврийн төрөл ══════════════════ */

/**
 * ТЭЭВРИЙН ТӨРЛҮҮД — сүлжээ бүр дээр ижил холимогоор явна (харьцуулалт шударга
 * байхын тулд). Төрөл тус бүр өөр урт ба чөлөөт хурдтай.
 *
 * ⚠️ `mix` нийлбэр = 1.0. Хэрэглэгч тодорхой тоо/харьцаа өгвөл энэ утгуудыг
 * дарж болно — хөдөлгүүр зөвхөн `len`/`vRange`-ийг л уншина.
 * ⚠️ `vRange` нь БОДИТ м/с (км/ц ÷ 3.6). Ачаа/автобус нь хөнгөн автоос удаан.
 */
export type VehicleType = {
  key: 'car' | 'bus' | 'truck';
  label: string;
  /** Урт (бодит метр) — car-following ба зуралтад */
  len: number;
  /** Чөлөөт урсгалын хурдны хязгаар [min, max] (м/с) */
  vRange: [number, number];
  /** Урсгал дахь эзлэх хувь (нийлбэр = 1) */
  mix: number;
};

export const VEHICLE_TYPES: VehicleType[] = [
  { key: 'car', label: 'Хөнгөн авто', len: 4.5, vRange: [30 / 3.6, 50 / 3.6], mix: 0.78 },
  { key: 'truck', label: 'Ачааны', len: 8.0, vRange: [20 / 3.6, 38 / 3.6], mix: 0.14 },
  { key: 'bus', label: 'Автобус', len: 11.0, vRange: [25 / 3.6, 45 / 3.6], mix: 0.08 },
];

/** Холимог жингээр тээврийн төрлийн индекс сонгоно. */
export function pickVehicleType(rnd: () => number = Math.random): number {
  const total = VEHICLE_TYPES.reduce((a, t) => a + t.mix, 0) || 1;
  let r = rnd() * total;
  for (let i = 0; i < VEHICLE_TYPES.length; i++) {
    r -= VEHICLE_TYPES[i].mix;
    if (r <= 0) return i;
  }
  return 0;
}

/** Машиныг ГАЗРЫН зурагт байрлуулах — байрлал + чиглэл (явах зүгт). */
export function carPose(net: Network, car: Car): { x: number; y: number; ux: number; uy: number } {
  const p = poseAt(net.edges[car.e], car.s);
  return car.dir === 1 ? p : { x: p.x, y: p.y, ux: -p.ux, uy: -p.uy };
}

/**
 * Уулзвар дээр ДАРААГИЙН ирмэгийг сонгоно.
 *
 * Жин = чиглэлийн тохироо (шулуун явахыг илүүд үзнэ) × ирмэгийн уртын коэф.
 * Сүүлийнх нь CAD-ийн богино хог хэрчим (зогсоолын хашлага, шат) руу машин
 * оруулахгүй байхад чухал. Бусад гарц огт байхгүй бол U-эргэлт хийнэ (`null`).
 */
export function pickNext(
  net: Network,
  node: number,
  fromEdge: number,
  travel: Pt,
  rnd: () => number = Math.random,
): number | null {
  const outs = net.nodes[node]?.out ?? [];
  let total = 0;
  const ws: number[] = [];
  const cand: number[] = [];
  for (const i of outs) {
    if (i === fromEdge) continue;
    // ⚠️ ЧИГЛЭЛТЭЙ сүлжээнд зөвхөн ЭНЭ зангилаанаас ГАРАХ (a===node) ирмэг рүү —
    //    сумны эсрэг явахгүй. `a!==node` бол тэр ирмэг рүү орох боломжгүй.
    if (net.directed && net.edges[i].a !== node) continue;
    const h = outHeading(net.edges[i], node);
    const dot = travel[0] * h[0] + travel[1] * h[1];
    // (1+cos)/2 → шулуун=1, эгц эргэлт=0.5, буцах=0. Квадратаар нь эрчимжүүлнэ.
    const align = Math.max(0.02, ((1 + dot) / 2) ** 2);
    const w = align * Math.min(1, net.edges[i].length / 25);
    if (w <= 0) continue;
    cand.push(i);
    ws.push(w);
    total += w;
  }
  if (!cand.length || total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < cand.length; i++) {
    r -= ws[i];
    if (r <= 0) return cand[i];
  }
  return cand[cand.length - 1];
}

/**
 * БҮХ машиныг `dt` секундээр урагшлуулна (car-following + уулзварын сонголт).
 *
 * ⚠️ `dt`-г 0.2 сек-ээс дээш өгвөл машин урдахаа «нэвт өнгөрөх» магадлалтай тул
 * дуудагч тал ФРЕЙМИЙН dt-г таслах ёстой (`TrafficOverlay` тэгдэг).
 */
export function stepCars(
  net: Network,
  cars: Car[],
  dt: number,
  rnd: () => number = Math.random,
  /** Гэрлэн дохионы сим-хугацаа (секунд). Дохиогүй сүлжээнд хэрэггүй. */
  time = 0,
): void {
  if (dt <= 0 || !cars.length) return;

  /* ── 1. Урд машиныг олох: (ирмэг, чиглэл) тус бүрээр эрэмбэлнэ ── */
  const lanes = new Map<number, number[]>();
  for (let i = 0; i < cars.length; i++) {
    const key = cars[i].e * 2 + (cars[i].dir === 1 ? 0 : 1);
    const l = lanes.get(key);
    if (l) l.push(i); else lanes.set(key, [i]);
  }
  /** Проекцын нэгж ↔ бодит метрийн коэффициент (`Network.unitsPerMeter`) */
  const upm = net.unitsPerMeter || 1;
  /** i дэх машины урдахтайгаа бамперын зай (ПРОЕКЦЫН нэгж); урдгүй бол Infinity */
  const gap = new Array<number>(cars.length).fill(Infinity);
  /** Урдах машины хурд (м/с) — Krauss-ийн аюулгүй хурдад хэрэгтэй */
  const leadV = new Array<number>(cars.length).fill(0);
  for (const idx of lanes.values()) {
    idx.sort((p, q) => cars[p].s - cars[q].s);
    // dir=+1 бол s ӨСӨХ тийш явна → урдах нь дараагийнх; dir=−1 бол эсрэгээр
    for (let k = 0; k < idx.length; k++) {
      const me = idx[k];
      const ahead = cars[me].dir === 1 ? idx[k + 1] : idx[k - 1];
      if (ahead !== undefined) {
        // ⚠️ ХОЁУЛАНГИЙН хагас уртын нийлбэрээр зай хасна (бампер-бампер): төв
        //    хоорондын зайнаас урдахын хагас + минийхийн хагас. Зөвхөн урдахын
        //    уртаар хасвал УРТ дагагч (автобус) богино урдахтайгаа давхцана.
        gap[me] = Math.abs(cars[ahead].s - cars[me].s)
          - ((carLen(cars[me]) + carLen(cars[ahead])) / 2) * upm;
        leadV[me] = cars[ahead].v;
      }
    }
  }

  /**
   * Ирмэг·чиглэл бүрийн ОРЦ-оос хамгийн ойрхон машины АР БАМПЕР хүртэлх зай
   * (проекцын нэгж) — өөр ирмэгээс орох машиныг ХААХАД (merge). Урдах машины
   * УРТЫГ (хагасаар) тооцно — автобус/ачаа урт тул илүү зай эзэлнэ. Машин орох
   * тусам шинэчлэгдэж, нэг фрейм дэх дараагийн нэвтрэгч хаагдана.
   */
  const laneFront = new Map<number, number>();
  for (const [key, idx] of lanes) {
    if (key % 2 === 0) {
      const f = cars[idx[0]]; // dir+1, орц s=0, хамгийн бага s
      laneFront.set(key, f.s - (carLen(f) / 2) * upm);
    } else {
      const f = cars[idx[idx.length - 1]]; // dir−1, орц s=length, хамгийн их s
      laneFront.set(key, net.edges[f.e].length - (f.s + (carLen(f) / 2) * upm));
    }
  }

  /* ── 2. Хурдаа тохируулж, урагшилна ──
     ⚠️ «Зай багасах тусам хурдаа шугаманаар бууруул» гэсэн энгийн дүрэм ХҮРЭЛЦЭХГҮЙ:
     тэр нь зогсох замыг тооцдоггүй тул дискрет алхамд машин урдахаа НЭВТ өнгөрдөг
     (`traffic.check.mjs` үүнийг барьдаг). Krauss-ийн АЮУЛГҮЙ ХУРД нь урдах машин
     гэнэт тоормослох хамгийн муу тохиолдолд ч мөргөлдөхгүй хурдыг өгнө. */
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    // ⚠️ Зайг БОДИТ МЕТР болгож хөрвүүлнэ — доорх томьёо бүхэлдээ метрийн систем
    let g = gap[i] / upm;
    let vl = leadV[i];
    // ── УЛААН ГЭРЛИЙН ЗОГСОЛТ — ЗУРААСАН ДЭЭР ──
    // `gerlen_dohio` line ирмэгийг огтолсон ЯГ ТЭР цэгт (`stopBars`) зогсоно —
    // дэлгэц дээрх улаан зураас ба зогсох байрлал үргэлж таарна. Шугамыг аль
    // хэдийн ДАВСАН машин хамаарахгүй (уулзвараа чөлөөлж гарна). Ард нь ирсэн
    // машинууд car-following-оор жагсана.
    const bars = net.stopBars.get(c.e);
    if (bars) {
      for (const b of bars) {
        if (b.dir !== c.dir || signalLineGreen(b.group, time)) continue;
        const distM = (c.dir === 1 ? b.s - c.s : c.s - b.s) / upm;
        if (distM <= 0) continue;
        // Шугамыг «зогссон саад» гэж үзнэ: бамперын зай = төв хүртэл − хагас урт
        const sigG = distM - carLen(c) / 2;
        if (sigG < g) { g = sigG; vl = 0; }
      }
    }
    /* ── ИРМЭГИЙН ТӨГСГӨЛИЙН ЖАГСАА (кросс-ирмэг car-following) ──
       Урд зангилааны цаана орох БҮХ салааны орц дүүрсэн бол жагсааны СҮҮЛЭЭС
       (зангилааг ухарч давсан ч байж болно) зайгаа барьж УДААШИРНА.
       ⚠️ Үгүй бол машин зангилаа хүртэл чөлөөтэй мөлхөж очоод (same-edge
       leader байхгүй) хаагдсан орцны өмнө зогсохдоо жагсааны сүүл дээр
       ДАВХАРДАГ байсан — hop үеийн шалгалт нэг л агшинд ажилладаг бол энэ нь
       ФРЕЙМ БҮРД саад болж жигд тоормослуулна. */
    {
      const endNode = c.dir === 1 ? net.edges[c.e].b : net.edges[c.e].a;
      const outs = net.nodes[endNode]?.out ?? [];
      let bestClear = -Infinity;
      let anyCand = false;
      for (const ei of outs) {
        if (ei === c.e) continue;
        if (net.directed && net.edges[ei].a !== endNode) continue;
        anyCand = true;
        const eDir = net.edges[ei].a === endNode ? 1 : -1;
        const cl = laneFront.get(ei * 2 + (eDir === 1 ? 0 : 1));
        if (cl === undefined) { bestClear = Infinity; break; } // чөлөөтэй салаа бий
        if (cl > bestClear) bestClear = cl;
      }
      if (anyCand && Number.isFinite(bestClear)) {
        const roomM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
        const qG = roomM + bestClear / upm - carLen(c) / 2;
        if (qG < g) { g = qG; vl = 0; }
      }
    }
    let want = c.vmax;
    if (Number.isFinite(g)) {
      const free = Math.max(0, g - MIN_GAP_M);
      const vSafe = vl + (free - vl * TAU) / (TAU + (c.v + vl) / (2 * DEC));
      want = Math.min(c.vmax, Math.max(0, vSafe));
    }
    // Хурдсах нь хязгаартай; удаашрах нь ШУУД (аюулгүй хурд заавал биелнэ)
    c.v = Math.max(0, Math.min(want, c.v + ACC * dt));

    // Метр → проекцын нэгж (`s` нь проекцын нэгжээр хэмжигдэнэ)
    let move = c.v * dt * upm;
    // Хатуу хамгаалалт — фреймийн эхэнд байсан зайнаас цааш ямар ч тохиолдолд орохгүй
    if (Number.isFinite(g)) move = Math.min(move, Math.max(0, (g - MIN_GAP_M) * upm));
    // Нэг фреймд хэдэн ч ирмэг дамжиж болно — гэхдээ хязгаартай (хамгаалалт)
    for (let hop = 0; hop < 6 && move > 0; hop++) {
      const edge = net.edges[c.e];
      const room = c.dir === 1 ? edge.length - c.s : c.s;
      if (move <= room) {
        c.s += c.dir * move;
        break;
      }
      move -= room;
      const node = c.dir === 1 ? edge.b : edge.a;
      // ⚠️ Зангилаан дээрх улаан-зогсолт ЗОРИУДААР БАЙХГҮЙ: зогсолт `stopBars`-т
      //    (зураасан дээр) хийгддэг. Ногоонд шугам давсан машин гэрэл солигдсон ч
      //    уулзвараа ЧӨЛӨӨЛЖ гарна — бодит жолооч шиг (уулзвар дунд гацахгүй).
      const travel = outHeading(edge, node).map((v) => -v) as Pt; // гарах ↔ ирэх
      let next = pickNext(net, node, c.e, travel, rnd);
      // Сонгосон салааны орц ДҮҮРСЭН бол өөр чөлөөтэй салааг (2 оролдлого) эрнэ —
      // хажуугийн чөлөөтэй зам байсаар байтал жагсаатай салаанд хүчээр зогсохгүй.
      for (let t = 0; t < 2 && next != null; t++) {
        const d0 = net.edges[next].a === node ? 1 : -1;
        const cl0 = laneFront.get(next * 2 + (d0 === 1 ? 0 : 1));
        if (cl0 === undefined || cl0 >= (carLen(c) / 2 + MIN_GAP_M) * upm) break;
        const again = pickNext(net, node, c.e, travel, rnd);
        if (again != null) next = again;
      }
      if (next == null) {
        if (net.directed) {
          // ⚠️ ЧИГЛЭЛТЭЙ мухар (sink) — машин УСТАХГҮЙ, ТАСРАЛТГҮЙ үргэлжилнэ:
          //    ойрын гарц (`sinkExit`, хоёр эгнээт замд эсрэг урсгалын эх) руу
          //    шилжинэ. Орц нь дүүрэн бол мухар дээрээ хүлээнэ (алга болохгүй).
          const exits = net.sinkExit.get(node);
          if (exits?.length) {
            const pick = exits[Math.floor(rnd() * exits.length) % exits.length];
            const eKey = pick * 2; // гарц үргэлж dir=+1 (a→b)
            const clear = laneFront.get(eKey);
            const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
            if (clear !== undefined && clear < need) {
              // Гарцын жагсааны сүүлээс зайгаа барина (давхарлахгүй)
              const short = need - clear;
              if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
              else c.s = Math.min(c.s, short);
              c.v = 0;
              break;
            }
            c.e = pick;
            c.dir = 1;
            c.s = 0;
            laneFront.set(eKey, -(carLen(c) / 2) * upm);
            // Шинэ ирмэгийн улаан шугам — үлдсэн хөдөлгөөнийг таслана
            const jBars = net.stopBars.get(c.e);
            if (jBars) {
              for (const b of jBars) {
                if (b.dir !== 1 || signalLineGreen(b.group, time)) continue;
                if (b.s <= 0) continue;
                move = Math.min(move, Math.max(0, b.s - (carLen(c) / 2 + MIN_GAP_M) * upm));
              }
            }
            continue;
          }
          // Ойр гарц алга — U-эргэлт (чиглэлийн эсрэг ч ТАСРАЛТГҮЙ явах нь чухал)
          c.s = c.dir === 1 ? edge.length : 0;
          c.dir = c.dir === 1 ? -1 : 1;
          continue;
        }
        // Чиглэлгүй мухар — U-эргэлт хийж буцна
        c.s = c.dir === 1 ? edge.length : 0;
        c.dir = c.dir === 1 ? -1 : 1;
        continue;
      }
      // ── НЭВТРЭЛТ ХААХ (merge) ──
      // Дараагийн ирмэгийн ОРЦ дүүрсэн бол уулзварт хүлээнэ — өөр ирмэгээс орж
      // ирсэн машин ХӨДӨЛГӨӨНГҮЙ жагсаа дээр ДЭЭРЭЭС нь буухгүй (давхцахгүй).
      const nDir = net.edges[next].a === node ? 1 : -1;
      const nKey = next * 2 + (nDir === 1 ? 0 : 1);
      const entryS = nDir === 1 ? 0 : net.edges[next].length;
      // Орцоос урдах машины ар бампер хүртэлх зай < надад хэрэгтэй зай бол ХҮЛЭЭНЭ
      const clear = laneFront.get(nKey);
      const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
      if (clear !== undefined && clear < need) {
        // ⚠️ ЗАНГИЛААН ДЭЭР БИШ — жагсааны СҮҮЛЭЭС зайгаа барьж зогсоно: урд
        //    ирмэгийн жагсаа зангилааг ДАВАН сунаж ирсэн бол (clear < 0)
        //    зангилаанаас (need − clear) ухарч зогсоно — эс бөгөөс жагсааны
        //    сүүлчийн машинтай ДАВХАРЛАНА. Урагшлахгүй, ухрахгүй — зөвхөн
        //    зөвшөөрөгдсөн хэмжээнд ойртоно.
        const short = need - clear;
        if (c.dir === 1) c.s = Math.max(c.s, edge.length - short);
        else c.s = Math.min(c.s, short);
        c.v = 0;
        break;
      }
      c.e = next;
      c.dir = nDir;
      c.s = entryS;
      // Энэ машин орцыг эзэллээ — дараагийн нэвтрэгч хаагдана (ар бампер орцны цаана)
      laneFront.set(nKey, -(carLen(c) / 2) * upm);
      // ⚠️ ШИНЭ ирмэг дээрх УЛААН зогсолтын шугам — нэг фреймд шугам «нэвт үсрэхээс»
      //    хамгаална: үлдсэн хөдөлгөөнийг шугаманд тултал таслана (дараагийн
      //    фреймүүдэд энгийн зогсолтын логик авна).
      const nBars = net.stopBars.get(c.e);
      if (nBars) {
        for (const b of nBars) {
          if (b.dir !== c.dir || signalLineGreen(b.group, time)) continue;
          const aheadU = c.dir === 1 ? b.s - c.s : c.s - b.s;
          if (aheadU <= 0) continue;
          move = Math.min(move, Math.max(0, aheadU - (carLen(c) / 2 + MIN_GAP_M) * upm));
        }
      }
    }
  }
}

/* ══════════════════ Эрэлт → машины тоо ══════════════════ */

/** Ирмэг бүрийн хуримтлагдсан жин — машиныг ХААНА төрүүлэхийг сонгоход. */
export type SpawnTable = { cum: number[]; total: number };

/**
 * Төрүүлэх жингийн хүснэгт: `(baseLoad + суурь) × урт`.
 * Богино хог хэрчимд машин ТӨРӨХГҮЙ (`minLen`), гэхдээ дамжин өнгөрч болно.
 */
export function spawnTable(net: Network, minLenM = 25): SpawnTable {
  const min = minLenM * (net.unitsPerMeter || 1);
  const cum: number[] = [];
  let total = 0;
  for (const e of net.edges) {
    if (e.length >= min) total += (e.baseLoad + 0.12) * e.length;
    cum.push(total);
  }
  return { cum, total };
}

/** Жинлэсэн санамсаргүй сонголтоор ирмэгийн индекс. Хоосон сүлжээнд −1. */
export function pickEdge(tbl: SpawnTable, rnd: () => number = Math.random): number {
  if (tbl.total <= 0) return -1;
  const r = rnd() * tbl.total;
  let lo = 0;
  let hi = tbl.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tbl.cum[mid] < r) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Шинэ машин — санамсаргүй ирмэг, байрлал, чиглэл, ТӨРӨЛ (хурд/урт төрлөөс). */
export function spawnCar(net: Network, tbl: SpawnTable, rnd: () => number = Math.random): Car | null {
  const e = pickEdge(tbl, rnd);
  if (e < 0) return null;
  const vt = pickVehicleType(rnd);
  const t = VEHICLE_TYPES[vt];
  const vmax = t.vRange[0] + rnd() * (t.vRange[1] - t.vRange[0]);
  // ⚠️ ЧИГЛЭЛТЭЙ сүлжээнд машин ЗӨВХӨН `a→b` (dir=+1) явна — сумны дагуу
  const dir: 1 | -1 = net.directed ? 1 : rnd() < 0.5 ? 1 : -1;
  return {
    e, s: rnd() * net.edges[e].length, dir,
    v: vmax, vmax, tint: rnd(), vt, len: t.len,
  };
}

/**
 * Тухайн эрэлтэд харгалзах ИДЭВХТЭЙ машины тоо.
 * Шөнө ч хөдөлгөөн бүрэн зогсдоггүй тул `min` шал тавина.
 */
export function targetCars(diurnal: number, max: number, min = 10): number {
  return Math.round(min + Math.max(0, max - min) * Math.max(0, Math.min(1, diurnal)));
}
