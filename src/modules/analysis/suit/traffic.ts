import { t as tr } from '@/lib/i18nCore';
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
 */

/**
 * ӨДРИЙН ЦАГИЙН ЭРЭЛТИЙН МУРУЙ — 24 цагийн харьцангуй жин (0..1).
 * Хоёр оргил: өглөө ~08:00 (ажилдаа), орой ~18:00 (гэртээ). Шөнө хамгийн бага.
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
  const m = wrapMin(Math.round(minute));
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
 */
export type NetEdge = Segment & {
  a: number;
  b: number;
  src: number;
  /**
   * ДАВХАРДСАН ирмэг — өөр ирмэгийн ЯГ ДЭЭР (хэдхэн метрийн зайд) хэвтэж байна.
   */
  dup?: boolean;
};

export type Network = {
  nodes: NetNode[];
  edges: NetEdge[];
  /**
   * Проекцын НЭГЖ / БОДИТ МЕТР. Геометр Web Mercator-оор ирдэг бөгөөд 48°
   * өргөрөгт масштабын коэффициент 1/cos(φ) ≈ 1.49 — өөрөөр хэлбэл «100 нэгж»
   * гэдэг нь 67 бодит метр.
   */
  unitsPerMeter: number;
  /**
   * ГЭРЛЭН ДОХИОТОЙ зангилаанууд (`nodes`-ийн индекс).
   */
  signals: Set<number>;
  /**
   * Дохиотой зангилаа → (ирмэгийн индекс → БҮЛЭГ). Ирмэг бүрийг БАЙРЛАЛААР
   * (төвөөс line-ийн дунд цэг рүү чиглэл ↔ ирмэгийн чиглэл) өөрийн замын
   * зогсолтын шугамын бүлэгт онооно (0 = codes 1,3, 1 = codes 2,4).
   */
  signalGroups: Map<number, Map<number, SignalCode>>;
  /**
   * Газрын зурагт зурах БОДИТ гэрлэн дохионы шугамууд (`gerlen_dohio`).
   */
  signalLines: SignalLine[];
  /**
   * ирмэгийн индекс → УЛААН ГЭРЛИЙН ЗОГСОЛТЫН ШУГАМУУД тэр ирмэг дээр.
   */
  stopBars: Map<number, StopBar[]>;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээ юу — ирмэг бүр зөвхөн `a→b` (шугамын дижитал дараалал =
   * газрын зураг дээрх сум) чиглэлд явагдана.
   */
  directed: boolean;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээний мухар (sink) зангилаа → ойрын ГАРЦ ирмэгүүд.
   */
  sinkExit: Map<number, number[]>;
  /**
   * Гэрлэн дохионы service УНАЖ сүлжээ ДОХИОГҮЙ угсрагдсаныг тэмдэглэнэ.
   */
  signalsFailed?: boolean;
};

/** Үзүүрийг наах хүлцэл (БОДИТ метр) — CAD-ийн хэрчмүүд яг таг таардаггүй. */
export const SNAP_TOL_M = 1.0;

/**
 * Гэрлэн дохионы цэгийг зангилаанд наах хүлцэл (БОДИТ метр).
 */
export const SIGNAL_SNAP_M = 12;

/**
 * Мухраас ойрын гарц хайх радиус (БОДИТ метр) — `Network.sinkExit`.
 * Хоёр эгнээт замын хилийн үзүүрт эсрэг урсгалын эх ~10-30 м зайд байдаг.
 */
export const SINK_JUMP_M = 60;

/**
 * Гэрлэн дохионы ЗУРААСНЫ КОД (`gerlen_dohio_code`) — эх өгөгдлийн дугаар.
 */
export type SignalCode = number;

/**
 * Газрын зурагт зурах гэрлэн дохионы approach line (бодит геометр).
 */
export type SignalLine = {
  pts: Pt[];
  code: SignalCode;
  hub?: Pt;
  /**
   * Харьяалагдах уулзварын НЭР (`uulzwar_name`).
   */
  j?: string;
};

/**
 * Ирмэг дээрх зогсолтын шугам — `gerlen_dohio` line ирмэгийг огтолсон цэг.
 *   `s`    — огтолсон байрлал ирмэгийн дагуу (ПРОЕКЦЫН нэгж, 0..length)
 *   `dir`  — аль чиглэлийн урсгалд үйлчлэх вэ (уулзварын төв РҮҮ явж буй тал)
 *   `code` — эх өгөгдлийн зураасны код (`SignalPlan`-аар ээлж рүү буулгана)
 */
export type StopBar = { s: number; dir: 1 | -1; code: SignalCode; j?: string };

/**
 * Гэрлэн дохионы тодорхойлолт — уулзварын ТӨВ (`pt`) ба approach `lines`.
 */
export type SignalDef = { pt: Pt; lines?: SignalLine[]; name?: string };

/**
 * Үүнээс богино хэрчим ИРМЭГ болохгүй (доройтсон оройнууд).
 */
const MIN_EDGE_M = 0.05;

/**
 * Шугамуудыг ГЕОМЕТРИЙН ОГТЛОЛЦОЛ дээр таслана (intersection noding).
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
          splits[segs[pi].w][segs[pi].i].push({ t: h.t, pt: h.pt });
          splits[segs[qi].w][segs[qi].i].push({ t: h.u, pt: h.pt });
        }
      }
    }
  }

  /* ── T-УУЛЗВАР: нэг шугамын ҮЗҮҮР нөгөөгийн ДУНДУУР тулсан тохиолдол ──

     ХЭМЖИЛТ (Monmap_zam_selbe, 113 шугам): 226 үзүүрийн 114 нь өөр шугам дээр
     тулсан ч уулзвар үүсээгүй байв — дийлэнх нь ЯГ 0.00 м зайтай, өөрөөр хэлбэл
     ӨГӨГДӨЛ ЗӨВ нааснаас код нь таслаагүй байсан. Хоёр тохиолдол бий:
       · 57 нь голч шугамын ХЭРЧМИЙН ДУНД тулсан → тэр цэгт таслана
       · 57 нь голч шугамын ОРОЙ дээр яг тулсан → тэр оройд таслана (`cutV`)

     ЗАСВАРЫН ДАРАА: зэрэг-1 хиймэл мухар 142 → 30 (үлдсэн 30 нь зэрэгцээ хос
     шугамын үзүүр — холбовол эсрэг эгнээ хооронд холбогдох тул ЗӨВ нь тасархай),
     чиглэлтэй хамгийн том хүчтэй холбоос 25% → 79%, чиглэлгүй холбоос 89% → 100%,
     мухраас хажуу тийш үсрэх цэг 74 → 16 болов. */
  const tol = SNAP_TOL_M * unitsPerMeter;
  /** Шугамыг тухайн ОРОЙ дээр нь таслах (T-уулзвар яг оройд тулсан үед) */
  const cutV: Set<number>[] = paths.map(() => new Set<number>());
  for (let w = 0; w < paths.length; w++) {
    const p = paths[w];
    if (p.length < 2) continue;
    for (const tip of [p[0], p[p.length - 1]]) {
      let best: { seg: number; t: number; pt: Pt; d: number; vertex: number } | null = null;
      const cx0 = Math.floor((tip[0] - tol) / cell);
      const cx1 = Math.floor((tip[0] + tol) / cell);
      const cy0 = Math.floor((tip[1] - tol) / cell);
      const cy1 = Math.floor((tip[1] + tol) / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          for (const si of grid.get(`${cx},${cy}`) ?? []) {
            const sg = segs[si];
            if (sg.w === w) continue; // өөрийнхөө хэрчим биш
            const dx = sg.b[0] - sg.a[0];
            const dy = sg.b[1] - sg.a[1];
            const L2 = dx * dx + dy * dy;
            if (L2 < 1e-12) continue;
            const raw = ((tip[0] - sg.a[0]) * dx + (tip[1] - sg.a[1]) * dy) / L2;
            const t = Math.max(0, Math.min(1, raw));
            const px = sg.a[0] + t * dx;
            const py = sg.a[1] + t * dy;
            const d = Math.hypot(tip[0] - px, tip[1] - py);
            if (d > tol) continue;
            const vertex = t <= 1e-6 ? sg.i : t >= 1 - 1e-6 ? sg.i + 1 : -1;
            if (vertex >= 0 && (vertex === 0 || vertex >= paths[sg.w].length - 1)) continue;
            if (!best || d < best.d) best = { seg: si, t, pt: [px, py], d, vertex };
          }
        }
      }
      if (!best) continue;
      if (best.vertex >= 0) cutV[segs[best.seg].w].add(best.vertex);
      else splits[segs[best.seg].w][segs[best.seg].i].push({ t: best.t, pt: best.pt });
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
      if (cutV[w].has(i + 1) && i + 1 < p.length - 1 && cur.length >= 2) {
        out.push(cur);
        cur = [p[i + 1]];
      }
    }
    if (cur.length >= 2) out.push(cur);
  }
  return out;
}

/**
 * Замын шугамын хэрчмүүдийг үзүүрээр нь наан ГРАФ болгоно.
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

  /* ── Гэрлэн дохиог УУЛЗВАРТ наах ── */
  const signals = new Set<number>();
  const signalGroups = new Map<number, Map<number, SignalCode>>();
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
      for (const ln of lines) signalLines.push({ ...ln, hub: sd.pt, j: sd.name });

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
            list.push({ s, dir, code: ln.code, j: sd.name });
          }
        }
      }
      const lineDirs = lines.map((ln) => {
        const a = ln.pts[0];
        const b = ln.pts[ln.pts.length - 1];
        const mx = (a[0] + b[0]) / 2 - sd.pt[0];
        const my = (a[1] + b[1]) / 2 - sd.pt[1];
        const L = Math.hypot(mx, my) || 1;
        return { g: ln.code, dx: mx / L, dy: my / L };
      });
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].out.length < 3) continue;
        if (Math.hypot(nodes[i].x - sd.pt[0], nodes[i].y - sd.pt[1]) > tolU) continue;
        signals.add(i);
        let m = signalGroups.get(i);
        if (!m) { m = new Map<number, SignalCode>(); signalGroups.set(i, m); }
        for (const ei of nodes[i].out) {
          const eh = outHeading(edges[ei], i);
          let bestG: SignalCode = 0;
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
 * ДАВХАРДСАН ИРМЭГҮҮДИЙГ ТЭМДЭГЛЭНЭ — өөр (урт) ирмэгийн дээр хэвтэж буй нь.
 *
 *   ЯГ ХУУЛБАР: 3↔4 = 0.0 м
 *   ТУСДАА ЭГНЭЭ: 8↔10 = 1.5 м · 9↔11 = 1.7 м · 29↔30 = 1.8 м ·
 *                     32↔33 = 1.8 м · 26↔27 = 2.3 м · 1↔2 = 3.1 м · 3↔5 = 3.8 м
 *
 * Хуучин 2.5 м нь ЖИНХЭНЭ ЭГНЭЭнүүдийг хуулбар гэж андуурч, тэдгээрийг
 * урсгалаас хаядаг байв: OBJECTID 9-ийн 782 м-ийн 407 м нь тасалдаж (274 м ба
 * 102 м-ийн урт хэсгүүд), машин цааш явж чадалгүй хажуугийн зам руу гараад
 * БУЦАЖ эргэдэг байлаа — «line 9-ийн машин line 1 руу үргэлжлэхгүй» гэсэн
 * гомдлын шалтгаан. Хэмжилт: line 9-өөс гарсан 30 машины line 1 хүрсэн нь
 * 2.5 м үед 1, 1 м үед 19 (тасалдал 407 м → 0 м).
 *
 * @returns тэмдэглэсэн ирмэгийн тоо
 */
export function markDuplicates(
  net: Network,
  { tolM = 1.0, cover = 0.85 }: { tolM?: number; cover?: number } = {},
): number {
  const upm = net.unitsPerMeter || 1;
  const tol = tolM * upm;
  // Урт ирмэгээс эхэлж шалгана — хамгийн урт нь хэзээ ч хаягдахгүй
  const order = net.edges.map((_, i) => i).sort((a, b) => net.edges[b].length - net.edges[a].length);
  const E = net.edges.length;
  const bx0 = new Float64Array(E);
  const by0 = new Float64Array(E);
  const bx1 = new Float64Array(E);
  const by1 = new Float64Array(E);
  for (let i = 0; i < E; i++) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of net.edges[i].pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    bx0[i] = x0 - tol; by0[i] = y0 - tol; bx1[i] = x1 + tol; by1[i] = y1 + tol;
  }
  /** Торны нүд — ~50 бодит метр (богино ирмэг 1–4 нүдэнд, урт нь олон нүдэнд) */
  const CELL = Math.max(tol * 4, 50 * upm);
  const cellKey = (cx: number, cy: number) => `${cx}:${cy}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < E; i++) {
    if (!Number.isFinite(bx0[i])) continue;
    for (let cx = Math.floor(bx0[i] / CELL); cx <= Math.floor(bx1[i] / CELL); cx++) {
      for (let cy = Math.floor(by0[i] / CELL); cy <= Math.floor(by1[i] / CELL); cy++) {
        const k = cellKey(cx, cy);
        const l = grid.get(k);
        if (l) l.push(i); else grid.set(k, [i]);
      }
    }
  }
  /** `order` дахь байр — нэр дэвшигчдийг хуучин дарааллаар шалгахад */
  const rank = new Int32Array(E);
  order.forEach((e, r) => { rank[e] = r; });
  const stamp = new Int32Array(E).fill(-1);
  /** A-гийн хүрээтэй давхцах ирмэгүүд — `order`-ийн дарааллаар */
  const candidates = (i: number): number[] => {
    const out: number[] = [];
    if (!Number.isFinite(bx0[i])) return out;
    for (let cx = Math.floor(bx0[i] / CELL); cx <= Math.floor(bx1[i] / CELL); cx++) {
      for (let cy = Math.floor(by0[i] / CELL); cy <= Math.floor(by1[i] / CELL); cy++) {
        for (const j of grid.get(cellKey(cx, cy)) ?? []) {
          if (stamp[j] === i) continue;
          stamp[j] = i;
          if (bx0[j] > bx1[i] || bx1[j] < bx0[i] || by0[j] > by1[i] || by1[j] < by0[i]) continue;
          out.push(j);
        }
      }
    }
    return out.sort((a, b) => rank[a] - rank[b]);
  };
  /** A-гийн оройнуудын хэдэн хувь нь B-ээс `tol` дотор байна вэ */
  const covered = (A: NetEdge, B: NetEdge): number => {
    let hit = 0;
    for (const p of A.pts) {
      let best = Infinity;
      for (let i = 1; i < B.pts.length && best > tol; i++) {
        const d = distToSeg(p, B.pts[i - 1], B.pts[i]);
        if (d < best) best = d;
      }
      if (best <= tol) hit++;
    }
    return hit / Math.max(1, A.pts.length);
  };

  let marked = 0;
  for (const i of order) {
    const A = net.edges[i];
    if (A.dup) continue;
    const am = A.pts[Math.floor(A.pts.length / 2)];
    for (const j of candidates(i)) {
      if (j === i) continue;
      const B = net.edges[j];
      if (B.dup || B.length < A.length) continue;
      // Хурдан шүүлт — дунд цэгүүд хол бол огт шалгахгүй
      const bm = B.pts[Math.floor(B.pts.length / 2)];
      if (Math.hypot(am[0] - bm[0], am[1] - bm[1]) > B.length + tol) continue;
      if (covered(A, B) >= cover) {
        A.dup = true;
        marked++;
        break;
      }
    }
  }
  return marked;
}

/**
 * Гэрлэн дохионы БҮТЭН мөчлөг (сим-секунд) — АНХДАГЧ утга.
 */
export const SIGNAL_CYCLE_S = 60;

/** ШАР гэрлийн үргэлжлэх хугацаа (сим-секунд) — ногооны ТӨГСГӨЛД асна. */
export const YELLOW_S = 3;

export type SignalPhase = 'green' | 'yellow' | 'red';

/**
 * ГЭРЛЭН ДОХИОНЫ ЗОХИЦУУЛАЛТЫН ХӨТӨЛБӨР — мөчлөгийг ЭЭЛЖҮҮДЭД хуваана.
 *
 * `stages[i]` = тухайн ээлжид НОГООН асах зурааснуудын код (`gerlen_dohio_code`).
 * Ээлж бүр мөчлөгийг ТЭНЦҮҮ хуваан авч, төгсгөлийн `yellow` секунд шар болно.
 * Ямар ч ээлжид ороогүй код бүх мөчлөгийн турш УЛААН.
 */
export type SignalPlan = {
  /** Товч танигч (UI-д товчны түлхүүр) */
  key: string;
  /** Самбарт харагдах нэр */
  label: string;
  /** Тайлбар — юуг юутай зэрэг явуулж байгаа нь */
  desc: string;
  /**
   * Ээлж бүрийн НОГООН кодууд — `byJunction`-д ороогүй уулзварт үйлчилнэ.
   * UI-ийн ээлжийн товчнууд энэ жагсаалтын УРТААР үүснэ.
   */
  stages: SignalCode[][];
  /**
   * УУЛЗВАР ТУС БҮРИЙН ээлжүүд — түлхүүр нь `uulzwar_name`.
   */
  byJunction?: Record<string, SignalCode[][]>;
  /** Бүтэн мөчлөг (сим-секунд) */
  cycle: number;
  /** Ногооны төгсгөлийн шар (сим-секунд) */
  yellow: number;
};

/**
 * БЭЛЭН ХӨТӨЛБӨРҮҮД — `gerlen_dohio` 8 кодын бүтцэд тааруулсан.
 */
export const SIGNAL_PLANS: SignalPlan[] = [
  {
    key: 'real',
    get label() { return tr('Уулзварын хуваарь'); },
    get desc() { return tr('Уулзвар бүрийн 3 ээлж. 1-р: 3·4·7·8 → 1·6 → 2·5 · 2-р: 1·2 → 3·4 → 5·6.'); },
    /*
          1-р гэрлэн дохио (4 талт, код 1-8):
            1-р ээлж: 3, 4 ба 7, 8   (Баруун ↔ Зүүн тэнхлэг)
            2-р ээлж: 1, 6
            3-р ээлж: 2, 5
          2-р гэрлэн дохио (3 салаа, код 1-6 — салаа тус бүр ээлжилнэ):
            1-р ээлж: 1, 2   (баруун-зүүн хойд салаа)
            2-р ээлж: 3, 4   (баруун салаа)
            3-р ээлж: 5, 6   (зүүн салаа) */
    stages: [[3, 4, 7, 8], [1, 6], [2, 5]],
    byJunction: {
      '1-р гэрлэн дохио': [[3, 4, 7, 8], [1, 6], [2, 5]],
      '2-р гэрлэн дохио': [[1, 2], [3, 4], [5, 6]],
    },
    cycle: 90,
    yellow: YELLOW_S,
  },
  {
    key: '2',
    get label() { return tr('2 ээлж'); },
    get desc() { return tr('Хоёр тэнхлэг ээлжилнэ — сондгой кодууд, дараа нь тэгш. Хамгийн их багтаамжтай.'); },
    stages: [[1, 3, 5, 7], [2, 4, 6, 8]],
    cycle: SIGNAL_CYCLE_S,
    yellow: YELLOW_S,
  },
  {
    key: '4',
    get label() { return tr('4 ээлж'); },
    get desc() { return tr('Чиглэл бүр дангаараа ногоон болно — эсрэг урсгалын зөрчилгүй, гэхдээ хүлээлт урт.'); },
    stages: [[1, 5], [4, 8], [3, 7], [2, 6]],
    cycle: 80,
    yellow: YELLOW_S,
  },
  {
    key: '8',
    get label() { return tr('8 ээлж'); },
    get desc() { return tr('Эгнээ бүр тусдаа — хамгийн аюулгүй, гэхдээ багтаамж эрс буурна.'); },
    stages: [[1], [5], [4], [8], [3], [7], [2], [6]],
    cycle: 120,
    yellow: 2,
  },
];

/**
 * Анхдагч ГАРААР бичсэн хөтөлбөр (2 ээлж).
 */
export const DEFAULT_SIGNAL_PLAN = SIGNAL_PLANS[0];

/* ── ЗӨРЧИЛГҮЙ ЭЭЛЖИЙГ ГЕОМЕТРЭЭС ГАРГАХ ── */

/** Хоёр өнцгийн (градус) хамгийн бага зөрүү, 0..180. */
const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * ЗУРААС БҮРИЙН УУЛЗВАР ДАХЬ БАЙРЛАЛ — уулзварын төвөөс зураас руу чиглэсэн
 * өнцөг (градус). Энэ өнцөг нь тухайн зураас АЛЬ ТАЛААС орж ирэх урсгалынх
 * болохыг заана.
 */
function signalBearings(net: Network): Map<SignalCode, number> {
  const out = new Map<SignalCode, number>();
  for (const ln of net.signalLines) {
    if (!ln.hub || ln.pts.length < 2) continue;
    const a = ln.pts[0];
    const b = ln.pts[ln.pts.length - 1];
    const mx = (a[0] + b[0]) / 2 - ln.hub[0];
    const my = (a[1] + b[1]) / 2 - ln.hub[1];
    out.set(ln.code, ((Math.atan2(my, mx) * 180) / Math.PI + 360) % 360);
  }
  return out;
}

/**
 * ЗӨРЧИЛГҮЙ ЭЭЛЖҮҮДИЙГ СҮЛЖЭЭНИЙ ГЕОМЕТРЭЭС бодно.
 *
 * ЗАРЧИМ (машин мөргөлдөхгүй байх нөхцөл): уулзварт нэг зэрэг нээгдэж болох
 * урсгалууд нь ХӨНДЛӨН гардаггүй байх ёстой.
 *   · Нэг талын зураасууд (нэг approach-ийн хоёр эгнээ) — зэрэг нээгдэнэ
 *   · ЭСРЭГ талын зураасууд (≈180°) — зэрэг нээгдэнэ (нүүр нүүрээрээ уулзах
 *     урсгал шулуун явахад огтлолцохгүй)
 *   · ХӨНДЛӨН тал (≈90°) — зэрэг нээгдэхгүй
 *
 * Ээлж бүрд «үндсэн» зураас ба түүнтэй зөрчилгүй бүх зураас ногоон болно.
 * Ижил багц давтагдвал нэгтгэнэ (нэг л удаа ээлж болно).
 */
export function compatStages(
  net: Network,
  {
    sideDeg = 18,
    oppDeg = 35,
    mode = 'split',
  }: {
    sideDeg?: number;
    oppDeg?: number;
    /**
     * ЭЭЛЖ ҮҮСГЭХ ГОРИМ:
     *   · `split`    — тал БҮР дангаараа нээгдэнэ (эсрэг тал ч зэрэг нээгдэхгүй).
     *                  Хамгаалагдсан зүүн эргэлттэй уулзварт ийм байдаг.
     *   · `opposite` — тал ба түүний ЭСРЭГ тал ХАМТ (сонгодог 2 фазын схем).
     */
    mode?: 'split' | 'opposite';
  } = {},
): SignalCode[][] {
  const bear = signalBearings(net);
  const codes = [...bear.keys()].sort(
    (a, b) => (bear.get(a) as number) - (bear.get(b) as number),
  );
  if (!codes.length) return [];

  /* ① ТАЛУУДЫГ бүлэглэнэ — нэг approach-ийн эгнээнүүд хэдхэн градусын зөрүүтэй. */
  const sides: SignalCode[][] = [];
  for (const c of codes) {
    const last = sides[sides.length - 1];
    if (last && angDiff(bear.get(last[0]) as number, bear.get(c) as number) <= sideDeg) last.push(c);
    else sides.push([c]);
  }
  // Тойрог хаагдах газар (359° ↔ 1°) эхний ба сүүлийн бүлэг нийлж болно
  if (sides.length > 1) {
    const first = sides[0];
    const last = sides[sides.length - 1];
    if (angDiff(bear.get(first[0]) as number, bear.get(last[0]) as number) <= sideDeg) {
      first.push(...last);
      sides.pop();
    }
  }

  /* ② Тал бүрийг ЭСРЭГ талтай нь (≈180°) хосолж НЭГ ээлж болгоно.
     Эсрэг тал олдохгүй бол (мухар салаа) тэр тал дангаараа ээлж авна. */
  const stages: SignalCode[][] = [];
  const seen = new Set<string>();
  for (const side of sides) {
    let stage: SignalCode[];
    if (mode === 'split') {
      stage = [...side].sort((a, b) => a - b);
    } else {
      const b0 = bear.get(side[0]) as number;
      let opp: SignalCode[] | null = null;
      let best = oppDeg;
      for (const other of sides) {
        if (other === side) continue;
        const d = Math.abs(180 - angDiff(b0, bear.get(other[0]) as number));
        if (d < best) { best = d; opp = other; }
      }
      stage = [...side, ...(opp ?? [])].sort((a, b) => a - b);
    }
    const key = stage.join(',');
    if (seen.has(key)) continue; // ижил багц давхардуулахгүй
    seen.add(key);
    stages.push(stage);
  }
  return stages;
}

/**
 * Сүлжээнээс ЗӨРЧИЛГҮЙ хөтөлбөр угсарна. Дохиогүй сүлжээнд `null`.
 */
export function compatPlan(
  net: Network,
  {
    perStage = 30,
    yellow = YELLOW_S,
    mode = 'split',
  }: { perStage?: number; yellow?: number; mode?: 'split' | 'opposite' } = {},
): SignalPlan | null {
  const stages = compatStages(net, { mode });
  if (!stages.length) return null;
  const split = mode === 'split';
  return {
    key: split ? 'auto' : 'auto2',
    label: split ? tr('Тал тус бүр') : tr('Эсрэг тал хамт'),
    desc: split
      ? tr('Уулзварын геометрээс бодсон {0} ээлж — тал бүр дангаараа ', stages.length)
        + tr('нээгдэнэ, эсрэг тал ч зэрэг ногоон болохгүй (зүүн эргэлт хамгаалагдана).')
      : tr('Уулзварын геометрээс бодсон {0} ээлж — тал ба ЭСРЭГ тал нь ', stages.length)
        + tr('хамт нээгдэнэ (сонгодог схем, багтаамж илүү).'),
    stages,
    cycle: perStage * stages.length,
    yellow,
  };
}

/**
 * Уулзварын НЭРИЙГ хэвшүүлнэ — Юникод NFC, захын зай, дотоод олон зай, том/жижиг үсэг.
 */
export const normJunction = (s: string): string =>
  s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('mn');

/** Хөтөлбөр бүрийн «уулзвар → ээлж» кэш — `signalPhase` машин бүрд, фрейм бүрд дуудагдана */
const junctionCache = new WeakMap<SignalPlan, Map<string, SignalCode[][] | null>>();

/**
 * Уулзварын ӨӨРИЙН ээлжүүд — эхлээд ЯГ нэрээр, дараа нь хэвшүүлсэн нэрээр; олдохгүй бол `null`.
 */
export function junctionStages(plan: SignalPlan, junction: string): SignalCode[][] | null {
  const by = plan.byJunction;
  if (!by) return null;
  let m = junctionCache.get(plan);
  if (!m) { m = new Map(); junctionCache.set(plan, m); }
  const hit = m.get(junction);
  if (hit !== undefined) return hit;
  let st: SignalCode[][] | null = by[junction] ?? null;
  if (!st) {
    const k = normJunction(junction);
    for (const [name, v] of Object.entries(by)) {
      if (normJunction(name) === k) { st = v; break; }
    }
  }
  m.set(junction, st);
  return st;
}

/**
 * Код аль ээлжид ЭХЛЭЭД тохиолдох вэ (олдохгүй бол −1) — зөвхөн МЭДЭЭЛЛИЙН.
 */
export function signalStage(code: SignalCode, plan: SignalPlan): number {
  for (let i = 0; i < plan.stages.length; i++) if (plan.stages[i].includes(code)) return i;
  return -1;
}


/**
 * Тухайн зураасны ФАЗ. Ээлжийн үргэлжлэх хугацаа = мөчлөг / ээлжийн тоо;
 * түүний эхний хэсэг НОГООН, сүүлийн `yellow` секунд ШАР, бусад ээлжид УЛААН.
 */
export function signalPhase(
  code: SignalCode,
  time: number,
  plan: SignalPlan = DEFAULT_SIGNAL_PLAN,
  /** Уулзварын нэр — өөрийн хуваарьтай бол түүгээр (`SignalPlan.byJunction`) */
  junction?: string,
): SignalPhase {
  const stages = (junction != null && junctionStages(plan, junction)) || plan.stages;
  const n = stages.length;
  if (n <= 0) return 'red';
  const share = plan.cycle / n;
  const t = ((time % plan.cycle) + plan.cycle) % plan.cycle;
  const stage = Math.min(n - 1, Math.floor(t / share));
  if (!stages[stage].includes(code)) return 'red';
  return t % share < Math.max(0, share - plan.yellow) ? 'green' : 'yellow';
}

/** Урсгал НЭВТРЭХ эрхтэй юу — ЗӨВХӨН ногоон (шарт ч зогсоно). */
export function signalLineGreen(
  code: SignalCode,
  time: number,
  plan: SignalPlan = DEFAULT_SIGNAL_PLAN,
  junction?: string,
): boolean {
  return signalPhase(code, time, plan, junction) === 'green';
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
   */
  tint: number;
  /**
   * ТЭЭВРИЙН ТӨРЛИЙН индекс (`VEHICLE_TYPES`) — хөнгөн авто / автобус.
   */
  vt?: number;
  /** Машины УРТ (бодит метр) — төрлөөс. Байхгүй бол `CAR_LEN`. */
  len?: number;
  /**
   * ЭРГЭЛТИЙГ ЗӨӨЛРҮҮЛЭХ өгөгдөл — сүүлд ДАВСАН уулзварын булангийн цэг
   * (`hx`,`hy`, проекцын нэгж) ба тэр үеийн ОРЖ ИРСЭН чиглэл (`hux`,`huy`,
   * нэгж вектор). `stepCars` ирмэг солиход тавьж өгнө.
   */
  hx?: number;
  hy?: number;
  hux?: number;
  huy?: number;
  /**
   * «ГАРЧ ЯВАХ» горим — эрэлт буурахад сонгогдсон машин. Замаа үргэлжлүүлж
   * яваад сүлжээний МУХАР (хилийн гарц) дээр хүрмэгц `done` болно — дэлгэцийн
   * дундаас алга болохын оронд бүсээс гарч байгаа мэт жамаараа явж одно.
   */
  leaving?: boolean;
  /** «Гарч явах» болсон сим-цаг — хэт удаж гарч чадахгүй бол бүдгэрүүлж авахад */
  leaveT?: number;
  /** Төрсөн сим-цаг — шинэ машиныг аажим ТОДРУУЛЖ оруулахад (гэнэт биш) */
  bornT?: number;
  /** Хил дээр хүрч ГАРСАН — дуудагч тал жагсаалтаас авна (устгана). */
  done?: boolean;
  /**
   * ЗУРАГДАХ байрлал/чиглэлийн ГӨЛГӨРҮҮЛСЭН төлөв — зөвхөн зуралт
   * (`TrafficOverlay`) бичиж уншина; хөдөлгүүр огт хэрэглэхгүй.
   */
  sx?: number;
  sy?: number;
  sux?: number;
  suy?: number;
  /**
   * ЗОГССОН хугацааны тоолуур (сим-секунд) — гацааны циклийг таслахад.
   */
  wait?: number;
};

/** Тэвчээр (сим-секунд) — үүнээс удаан зогссон машин гарц хайж буцна. */
export const PATIENCE_S = 25;

/** Буцаж эргэх бүс (бодит метр) — зөвхөн ирмэгийн ҮЗҮҮРТ хүлээж буй машинд. */
export const TURN_BACK_M = 10;

/**
 * ЭРГЭЛТИЙН ДЭЭД ХУРД (м/с) — U-эргэлт ба эсрэг эгнээ рүү шилжих агшинд.
 */
export const U_TURN_V = 2.5;

/**
 * ЭРГЭЛТИЙН НУМЫН УРТ (бодит метр) — уулзвар давсны дараах энэ зайд машины
 * зурагдах байрлал/чиглэл муруйгаар шилжинэ. Хотын уулзварын эргэлтийн радиус
 * ~6-10 м тул 8 м нь бодит харагдана.
 */
export const TURN_SMOOTH_M = 8;


/** Машины ойролцоо урт (м) — car-following-д «эзэлсэн зай». Төрөлгүй машины анхдагч. */
export const CAR_LEN = 5;
/** Машины эзлэх урт (м) — төрөл өгсөн бол түүнийх, эс бөгөөс `CAR_LEN`. */
export const carLen = (c: Car): number => c.len ?? CAR_LEN;
/** Зогсох үеийн бамперын хоорондох зай (м) */
export const MIN_GAP_M = 2;
/**
 * УУЛЗВАРЫН «ХАЙРЦАГ» — жинхэнэ уулзварын (degree ≥ 3) зангилаанаас энэ зайд
 * (БОДИТ метр) байгаа машин уулзварыг ЭЗЭЛСЭН гэж тооцно.
 */
export const JUNCTION_R_M = 5;

/** Жолоочийн урвалын хугацаа (с) — Krauss загварын τ */
const TAU = 1.0;
/** Хурдатгал ба удаашрал (м/с²) */
const ACC = 1.8;
const DEC = 4.5;

/** Чөлөөт урсгалын хурдны дээд хязгаар (м/с) — 50 км/ц. */
export const V_MAX = 50 / 3.6;

/* ══════════════════ Тээврийн төрөл ══════════════════ */

/**
 * ТЭЭВРИЙН ТӨРЛҮҮД — сүлжээ бүр дээр ижил холимогоор явна (харьцуулалт шударга
 * байхын тулд). Төрөл тус бүр өөр урт ба чөлөөт хурдтай.
 */
/** Зуралтын ХЭЛБЭР — `TrafficOverlay` эндээс салаална. */
export type VehicleModel = 'sedan' | 'hatch' | 'suv' | 'van' | 'pickup' | 'bus';

export type VehicleType = {
  /** Хөдөлгөөний ангилал — автобусанд тусгай дүрэм үйлчилнэ (`isBus`) */
  key: 'car' | 'bus';
  /** Дүрслэлийн загвар — хөнгөн авто хэд хэдэн биетэй */
  model: VehicleModel;
  label: string;
  /** Урт (бодит метр) — car-following ба зуралтад */
  len: number;
  /** Чөлөөт урсгалын хурдны хязгаар [min, max] (м/с) */
  vRange: [number, number];
  /** Урсгал дахь эзлэх хувь (нийлбэр = 1) */
  mix: number;
};

export const VEHICLE_TYPES: VehicleType[] = [
  { key: 'car', model: 'sedan', get label() { return tr('Седан'); }, len: 4.6, vRange: [30 / 3.6, 50 / 3.6], mix: 0.34 },
  { key: 'car', model: 'hatch', get label() { return tr('Хэтчбэк'); }, len: 4.1, vRange: [30 / 3.6, 50 / 3.6], mix: 0.26 },
  { key: 'car', model: 'suv', get label() { return tr('Жийп'); }, len: 4.8, vRange: [28 / 3.6, 48 / 3.6], mix: 0.24 },
  { key: 'car', model: 'van', get label() { return tr('Микро вэн'); }, len: 5.1, vRange: [26 / 3.6, 44 / 3.6], mix: 0.09 },
  { key: 'car', model: 'pickup', get label() { return tr('Пикап'); }, len: 5.0, vRange: [28 / 3.6, 46 / 3.6], mix: 0.04 },
  { key: 'bus', model: 'bus', get label() { return tr('Автобус'); }, len: 11.0, vRange: [25 / 3.6, 45 / 3.6], mix: 0.03 },
];

/**
 * АВТОБУС ЯВАХ ЗАМЫН доод урт (БОДИТ метр).
 */
export const BUS_MIN_EDGE_M = 40;

/** Энэ машин автобус уу (`VEHICLE_TYPES`-ийн ангиллаар). */
export const isBus = (c: Car): boolean => VEHICLE_TYPES[c.vt ?? 0]?.key === 'bus';

/** Автобус энэ ирмэгээр явж болох уу (голч зам мөн үү). */
export const busAllows = (net: Network, edge: number): boolean =>
  (net.edges[edge]?.length ?? 0) >= BUS_MIN_EDGE_M * (net.unitsPerMeter || 1);

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

/**
 * Машиныг ГАЗРЫН зурагт байрлуулах — байрлал + чиглэл (явах зүгт).
 */
export function carPose(net: Network, car: Car): { x: number; y: number; ux: number; uy: number } {
  const e = net.edges[car.e];
  const p = poseAt(e, car.s);
  let x = p.x;
  let y = p.y;
  let ux = car.dir === 1 ? p.ux : -p.ux;
  let uy = car.dir === 1 ? p.uy : -p.uy;

  if (car.hx != null && car.hy != null && car.hux != null && car.huy != null) {
    const R = Math.min(TURN_SMOOTH_M * (net.unitsPerMeter || 1), e.length);
    /** Ирмэгт ОРСОН цэгээс хойш явсан зай (проекцын нэгж) */
    const dIn = car.dir === 1 ? car.s : e.length - car.s;
    if (R > 1e-6 && dIn < R) {
      // Муруйн ТӨГСГӨЛ — ирмэгийн дагуух R зай дахь байрлал ба чиглэл
      const q = poseAt(e, car.dir === 1 ? R : e.length - R);
      const qux = car.dir === 1 ? q.ux : -q.ux;
      const quy = car.dir === 1 ? q.uy : -q.uy;
      const t = Math.max(0, Math.min(1, dIn / R));
      const t2 = t * t;
      const t3 = t2 * t;
      // Эрмитийн суурь функцууд: P(0)=булан, P'(0)=орсон чиглэл, P(1)=q, P'(1)=q'
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      x = h00 * car.hx + h10 * car.hux * R + h01 * q.x + h11 * qux * R;
      y = h00 * car.hy + h10 * car.huy * R + h01 * q.y + h11 * quy * R;
      // Чиглэл = муруйн уламжлал
      const d00 = 6 * t2 - 6 * t;
      const d10 = 3 * t2 - 4 * t + 1;
      const d01 = -6 * t2 + 6 * t;
      const d11 = 3 * t2 - 2 * t;
      const dx = d00 * car.hx + d10 * car.hux * R + d01 * q.x + d11 * qux * R;
      const dy = d00 * car.hy + d10 * car.huy * R + d01 * q.y + d11 * quy * R;
      const L = Math.hypot(dx, dy) || 1;
      ux = dx / L;
      uy = dy / L;
    }
  }
  return { x, y, ux, uy };
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
  /**
   * Тухайн машинд ЗӨВШӨӨРӨГДӨХ салаа (автобусны маршрутын хязгаарлалт).
   */
  allow?: (edge: number) => boolean,
): number | null {
  const outs = net.nodes[node]?.out ?? [];
  let total = 0;
  const ws: number[] = [];
  const cand: number[] = [];
  // Шүүлт ямар нэг салаа үлдээж байгаа эсэхийг ЭХЛЭЭД шалгана
  const useAllow = allow
    ? outs.some((i) => i !== fromEdge && (!net.directed || net.edges[i].a === node) && allow(i))
    : false;
  for (const i of outs) {
    if (i === fromEdge) continue;
    if (useAllow && allow && !allow(i)) continue;
    if (net.directed && net.edges[i].a !== node) continue;
    const h = outHeading(net.edges[i], node);
    const dot = travel[0] * h[0] + travel[1] * h[1];
    // (1+cos)/2 → шулуун=1, эгц эргэлт=0.5, буцах=0. Квадратаар нь эрчимжүүлнэ.
    const align = Math.max(0.02, ((1 + dot) / 2) ** 2);
    const w = align * Math.min(1, net.edges[i].length / (25 * (net.unitsPerMeter || 1)));
    if (w <= 0) continue;
    cand.push(i);
    ws.push(w);
    total += w;
  }
  const fresh = cand.filter((i) => !net.edges[i].dup);
  if (fresh.length && fresh.length < cand.length) {
    let t2 = 0;
    const ws2: number[] = [];
    for (let k = 0; k < cand.length; k++) {
      if (net.edges[cand[k]].dup) continue;
      ws2.push(ws[k]);
      t2 += ws[k];
    }
    if (t2 > 0) {
      let r2 = rnd() * t2;
      for (let k = 0; k < fresh.length; k++) {
        r2 -= ws2[k];
        if (r2 <= 0) return fresh[k];
      }
      return fresh[fresh.length - 1];
    }
  }
  if (!cand.length || total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < cand.length; i++) {
    r -= ws[i];
    if (r <= 0) return cand[i];
  }
  return cand[cand.length - 1];
}

/** `stepCars`-ийн НЭГ алхмын дээд урт (сим-сек) — үүнээс урт алхамд машин урдахаа нэвт гарна */
export const STEP_DT_MAX = 0.2;

/**
 * ФРЕЙМИЙН сим-хугацааг `STEP_DT_MAX`-аас хэтрэхгүй ДЭД АЛХМУУДАД хуваана.
 */
export function subSteps(dt: number, max = STEP_DT_MAX): number[] {
  if (!(dt > 0)) return [];
  const n = Math.max(1, Math.ceil(dt / max - 1e-9));
  return Array.from({ length: n }, () => dt / n);
}

/**
 * БҮХ машиныг `dt` секундээр урагшлуулна (car-following + уулзварын сонголт).
 */
export function stepCars(
  net: Network,
  cars: Car[],
  dt: number,
  rnd: () => number = Math.random,
  /** Гэрлэн дохионы сим-хугацаа (секунд). Дохиогүй сүлжээнд хэрэггүй. */
  time = 0,
  /**
   * Зохицуулалтын хөтөлбөр — аль код хэддүгээр ээлжид ногоон болох.
   */
  plan: SignalPlan = DEFAULT_SIGNAL_PLAN,
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
  /**
   * Урдах машины ИНДЕКС (эсвэл −1). Хүлээх байрлалыг тогтооход ЗААВАЛ
   * хэрэгтэй: зогсох цэгийг зөвхөн ирмэгийн хилээр бодвол жагсааны БҮХ машин
   * тэр нэг цэг рүү үсэрч, бие бие дээрээ бууна.
   */
  const leadIdx = new Array<number>(cars.length).fill(-1);
  for (const idx of lanes.values()) {
    idx.sort((p, q) => cars[p].s - cars[q].s);
    // dir=+1 бол s ӨСӨХ тийш явна → урдах нь дараагийнх; dir=−1 бол эсрэгээр
    for (let k = 0; k < idx.length; k++) {
      const me = idx[k];
      const ahead = cars[me].dir === 1 ? idx[k + 1] : idx[k - 1];
      if (ahead !== undefined) {
        gap[me] = Math.abs(cars[ahead].s - cars[me].s)
          - ((carLen(cars[me]) + carLen(cars[ahead])) / 2) * upm;
        leadV[me] = cars[ahead].v;
        leadIdx[me] = ahead;
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

  /** Эгнээний (ирмэг·чиглэл) түлхүүр. */
  const laneKey = (edge: number, dir: 1 | -1): number => edge * 2 + (dir === 1 ? 0 : 1);

  /* ── УУЛЗВАРЫН ЭЗЭМШИЛ ──
     Зангилаа бүрийг НЭГ л машин эзэлнэ: хайрцагт хамгийн ОЙР нь эзэн болно
     (тогтвортой — фрейм тутам эзэн солигдож «анивчихгүй»). Бусад нь хайрцгийн
     өмнө хүлээнэ. Уулзварт аль хэдийн ОРСОН машин хамгийн ойр байх тул эзэн
     хэвээр үлдэж, гарч дуустал бусдыг оруулахгүй — мухардал үүсэхгүй. */
  /** Тухайн машины уулзварт эзлэх радиус (бодит метр) — урт машин илүү зайтай */
  const jr = (c: Car): number => Math.max(JUNCTION_R_M, carLen(c) / 2 + 1.5);
  /** зангилаа → { машины индекс, зангилаа хүртэлх зай (м) } */
  const junction = new Map<number, { i: number; d: number }>();
  const isJunction = (n: number): boolean => (net.nodes[n]?.out.length ?? 0) >= 3;
  const claim = (n: number, i: number, d: number): void => {
    const cur = junction.get(n);
    if (!cur || d < cur.d) junction.set(n, { i, d });
  };
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const e = net.edges[c.e];
    if (!e) continue;
    const R = jr(c);
    const claimR = R * 2.5;
    // Урд талын зангилаа руу ойртсон эсвэл ард нь дөнгөж гарсан хоёуланг тооцно
    const ahead = (c.dir === 1 ? e.length - c.s : c.s) / upm;
    const behind = (c.dir === 1 ? c.s : e.length - c.s) / upm;
    const nA = c.dir === 1 ? e.b : e.a;
    const nB = c.dir === 1 ? e.a : e.b;
    if (isJunction(nA) && ahead < claimR && c.v > 0.3) claim(nA, i, ahead);
    if (behind < R && isJunction(nB)) claim(nB, i, behind);
  }
  /**
   * ХҮЛЭЭХ БАЙРЛАЛД зогсоох — хилийн зогсох цэг рүү ойртоно, ГЭХДЭЭ:
   *   · урагшлахаас өөр зүг рүү ШИЛЖИХГҮЙ (dir-ийн эсрэг гулсахгүй),
   *   · урдах машиныхаа ард ЗААВАЛ үлдэнэ.
   */
  const waitAt = (c: Car, i: number, target: number): void => {
    let t = target;
    const li = leadIdx[i];
    if (li >= 0) {
      const min = ((carLen(c) + carLen(cars[li])) / 2 + MIN_GAP_M) * upm;
      t = c.dir === 1 ? Math.min(t, cars[li].s - min) : Math.max(t, cars[li].s + min);
    }
    c.s = c.dir === 1 ? Math.max(c.s, t) : Math.min(c.s, t);
    c.v = 0;
  };

  /** Машиныг эгнээнд ОРУУЛАХАД шаардагдах чөлөө (хагас урт + бамперын зай). */
  const needOf = (c: Car): number => (carLen(c) / 2 + MIN_GAP_M) * upm;
  /**
   * Эгнээнд орсны ДАРАА үлдэх хөдөлгөөний ДЭЭД хязгаар (проекцын нэгж).
   */
  const capAfterEntry = (c: Car, clear: number | undefined): number =>
    clear === undefined ? Infinity : Math.max(0, clear - needOf(c));

  /**
   * U-ЭРГЭЛТ — ижил ирмэгийн ЭСРЭГ эгнээ рүү шилжинэ.
   */
  const uTurn = (c: Car, i: number): number | null => {
    const edge = net.edges[c.e];
    const back: 1 | -1 = c.dir === 1 ? -1 : 1;
    const key = laneKey(c.e, back);
    const clear = laneFront.get(key);
    const need = needOf(c);
    if (clear !== undefined && clear < need) {
      const short = need - clear;
      waitAt(c, i, c.dir === 1 ? edge.length - short : short);
      return null;
    }
    c.s = c.dir === 1 ? edge.length : 0;
    c.dir = back;
    c.v = Math.min(c.v, U_TURN_V);
    c.hux = undefined;
    c.huy = undefined;
    laneFront.set(key, -(carLen(c) / 2) * upm);
    return capAfterEntry(c, clear);
  };

  /* ── 2. Хурдаа тохируулж, урагшилна ── */
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.done) continue; // хилээр гарсан — устгагдахаа хүлээж буй
    // Зогссон хугацааг хуримтлуулна (хөдөлмөгц тэглэнэ) — гацааны циклийг таслахад
    if (c.v < 0.3) c.wait = (c.wait ?? 0) + dt; else c.wait = 0;
    let g = gap[i] / upm;
    let vl = leadV[i];
    // ── УЛААН ГЭРЛИЙН ЗОГСОЛТ — ЗУРААСАН ДЭЭР ──
    // `gerlen_dohio` line ирмэгийг огтолсон ЯГ ТЭР цэгт (`stopBars`) зогсоно —
    // дэлгэц дээрх улаан зураас ба зогсох байрлал үргэлж таарна. Шугамыг аль
    // хэдийн ДАВСАН машин хамаарахгүй (уулзвараа чөлөөлж гарна). Ард нь ирсэн
    // машинууд car-following-оор жагсана.
    const bars = net.stopBars.get(c.e);
    /** Урд УЛААН зогсолтын шугам бий юу — гэрлийн хүлээлт бол «гацаа» БИШ */
    let redAhead = false;
    if (bars) {
      for (const b of bars) {
        if (b.dir !== c.dir || signalLineGreen(b.code, time, plan, b.j)) continue;
        const distM = (c.dir === 1 ? b.s - c.s : c.s - b.s) / upm;
        if (distM <= 0) continue;
        if (distM < 60) redAhead = true;
        // Шугамыг «зогссон саад» гэж үзнэ: бамперын зай = төв хүртэл − хагас урт
        const sigG = distM - carLen(c) / 2;
        if (sigG < g) { g = sigG; vl = 0; }
      }
    }
    /* ── ИРМЭГИЙН ТӨГСГӨЛИЙН ЖАГСАА (кросс-ирмэг car-following) ──
       Урд зангилааны цаана орох БҮХ салааны орц дүүрсэн бол жагсааны СҮҮЛЭЭС
       (зангилааг ухарч давсан ч байж болно) зайгаа барьж УДААШИРНА. */
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

      /* ── МУХРЫН ӨМНӨ УДААШИРНА ── */

      /* ── УУЛЗВАРЫГ ӨӨР МАШИН ЭЗЭЛЖ БАЙВАЛ ХҮЛЭЭНЭ ── */
      if (isJunction(endNode)) {
        const owner = junction.get(endNode);
        if (owner && owner.i !== i) {
          const roomM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
          const jG = roomM - jr(c) - carLen(c) / 2;
          if (jG < g) { g = jG; vl = 0; }
        }
      }
    }
    /* ── ТЭВЧЭЭР ДУУССАН: ирмэгийн үзүүрт удаан гацсан машин БУЦАЖ ЭРГЭНЭ ── */
    {
      const roomEndM = (c.dir === 1 ? net.edges[c.e].length - c.s : c.s) / upm;
      if (!redAhead && (c.wait ?? 0) > PATIENCE_S && roomEndM < TURN_BACK_M) {
        const uCap = uTurn(c, i);
        if (uCap != null) { c.wait = 0; continue; } // эргэлээ — энэ фреймд зогсоно
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
      const travel = outHeading(edge, node).map((v) => -v) as Pt; // гарах ↔ ирэх
      const allow = isBus(c) ? (e2: number) => busAllows(net, e2) : undefined;
      /* ── «ГАРЧ ЯВАХ» машин хамгийн ойрын ГАРЦ РУУ чиглэнэ ──
         Санамсаргүй эргэлт сонговол гарцад торох нь удаж, гарах машид оргилын
         дараа сүлжээнд овоордог. Гарц руу ойртуулах салааг ДЕТЕРМИНИСТ сонгоно;
         олдохгүй бол ердийн сонголт руу буцна. */
      let next: number | null = null;
      if (c.leaving) {
        const dist = exitDistances(net);
        let best = Infinity;
        const ws2: { ei: number; w: number }[] = [];
        for (const ei of net.nodes[node]?.out ?? []) {
          if (ei === c.e) continue;
          if (net.directed && net.edges[ei].a !== node) continue;
          const far = net.edges[ei].a === node ? net.edges[ei].b : net.edges[ei].a;
          const w = net.edges[ei].length + dist[far];
          if (Number.isFinite(w)) ws2.push({ ei, w });
          if (w < best) best = w;
        }
        if (Number.isFinite(best)) {
          const nearBest = ws2.filter((x) => x.w <= best * 1.35 + 40 * upm);
          if (nearBest.length) next = nearBest[Math.floor(rnd() * nearBest.length) % nearBest.length].ei;
        }
      }
      if (next == null) next = pickNext(net, node, c.e, travel, rnd, allow);
      // Сонгосон салааны орц ДҮҮРСЭН бол өөр чөлөөтэй салааг (2 оролдлого) эрнэ —
      // хажуугийн чөлөөтэй зам байсаар байтал жагсаатай салаанд хүчээр зогсохгүй.
      for (let t = 0; t < 2 && next != null; t++) {
        const d0 = net.edges[next].a === node ? 1 : -1;
        const cl0 = laneFront.get(next * 2 + (d0 === 1 ? 0 : 1));
        if (cl0 === undefined || cl0 >= (carLen(c) / 2 + MIN_GAP_M) * upm) break;
        const again = pickNext(net, node, c.e, travel, rnd, allow);
        if (again != null) next = again;
      }
      if (next == null) {
        /* ── «ГАРЧ ЯВАХ» машин мухарт хүрвэл СҮЛЖЭЭНЭЭС ГАРНА ──
           Мухрын үзүүр = бүсийн хил тул үзэгчид «машин бүсээс гарлаа» гэж
           харагдана. Устгалыг дуудагч тал хийнэ. */
        if (portalNodes(net).has(node)) {
          c.s = c.dir === 1 ? edge.length : 0;
          c.v = 0;
          c.done = true;
          break;
        }
        if (net.directed) {
          const exits = net.sinkExit.get(node);
          if (exits?.length) {
            const pick = exits[Math.floor(rnd() * exits.length) % exits.length];
            const eKey = pick * 2; // гарц үргэлж dir=+1 (a→b)
            const clear = laneFront.get(eKey);
            const need = (carLen(c) / 2 + MIN_GAP_M) * upm;
            if (clear !== undefined && clear < need) {
              // Гарцын жагсааны сүүлээс зайгаа барина (давхарлахгүй)
              const short = need - clear;
              waitAt(c, i, c.dir === 1 ? edge.length - short : short);
              break;
            }
            c.e = pick;
            c.dir = 1;
            c.s = 0;
            c.v = Math.min(c.v, U_TURN_V);
            c.hux = undefined;
            c.huy = undefined;
            laneFront.set(eKey, -(carLen(c) / 2) * upm);
            move = Math.min(move, capAfterEntry(c, clear));
            // Шинэ ирмэгийн улаан шугам — үлдсэн хөдөлгөөнийг таслана
            const jBars = net.stopBars.get(c.e);
            if (jBars) {
              for (const b of jBars) {
                if (b.dir !== 1 || signalLineGreen(b.code, time, plan, b.j)) continue;
                if (b.s <= 0) continue;
                move = Math.min(move, Math.max(0, b.s - (carLen(c) / 2 + MIN_GAP_M) * upm));
              }
            }
            continue;
          }
          // Ойр гарц алга — U-эргэлт (чиглэлийн эсрэг ч ТАСРАЛТГҮЙ явах нь чухал)
          const uCap = uTurn(c, i);
          if (uCap == null) break; // эсрэг эгнээ дүүрэн — хүлээнэ
          move = Math.min(move, uCap);
          continue;
        }
        // Чиглэлгүй мухар — U-эргэлт хийж буцна
        const uCap = uTurn(c, i);
        if (uCap == null) break;
        move = Math.min(move, uCap);
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
      const need = (carLen(c) / 2 + MIN_GAP_M) * upm
        + (isJunction(node) ? jr(c) * upm : 0);
      const jOwner = isJunction(node) ? junction.get(node) : undefined;
      if ((jOwner && jOwner.i !== i) || (clear !== undefined && clear < need)) {
        const short = clear === undefined ? jr(c) * upm : need - clear;
        waitAt(c, i, c.dir === 1 ? edge.length - short : short);
        break;
      }
      c.e = next;
      c.dir = nDir;
      c.s = entryS;
      c.hx = net.nodes[node].x;
      c.hy = net.nodes[node].y;
      c.hux = travel[0];
      c.huy = travel[1];
      if (isJunction(node)) junction.set(node, { i, d: 0 });
      // Энэ машин орцыг эзэллээ — дараагийн нэвтрэгч хаагдана (ар бампер орцны цаана)
      laneFront.set(nKey, -(carLen(c) / 2) * upm);
      move = Math.min(move, capAfterEntry(c, clear));
      const nBars = net.stopBars.get(c.e);
      if (nBars) {
        for (const b of nBars) {
          if (b.dir !== c.dir || signalLineGreen(b.code, time, plan, b.j)) continue;
          const aheadU = c.dir === 1 ? b.s - c.s : c.s - b.s;
          if (aheadU <= 0) continue;
          move = Math.min(move, Math.max(0, aheadU - (carLen(c) / 2 + MIN_GAP_M) * upm));
        }
      }
    }
  }

  /* ── 3. ДАВХЦЛЫН ХАТУУ ХЯЗГААР (сүүлчийн хамгаалалт) ──
     Дээрх бүх шалгалт нь ФРЕЙМИЙН ЭХЭН дэх зайд тулгуурладаг: нэг фреймд хоёр
     машин нэг эгнээ рүү орох, дугуйлан эргэх, эсвэл дуудагч талаас машин нэмэх
     үед хос машин бие бие рүүгээ орох боломж онолын хувьд үлдэнэ. Энэ пасс нь
     эгнээ бүрийг УРДААС нь гүйж, дагагчийн бампер урдахын бамперыг ДАВААГҮЙ
     эсэхийг баталгаажуулна — давхцвал дагагчийг л ухраана (урдахыг хөдөлгөхгүй,
     эс бөгөөс хэлхээ дагуу түлхэлт тарж жагсаа мушгирна). */
  const after = new Map<number, number[]>();
  for (let i = 0; i < cars.length; i++) {
    if (cars[i].done) continue;
    const key = laneKey(cars[i].e, cars[i].dir);
    const l = after.get(key);
    if (l) l.push(i); else after.set(key, [i]);
  }
  for (const [key, idx] of after) {
    if (idx.length < 2) continue;
    idx.sort((p, q) => cars[p].s - cars[q].s);
    const fwd = key % 2 === 0; // dir=+1 бол s ӨСӨХ тийш явна → урдах нь их s-тэй
    const order = fwd ? idx.slice().reverse() : idx; // урдахаас нь ард руу
    for (let k = 1; k < order.length; k++) {
      const lead = cars[order[k - 1]];
      const me = cars[order[k]];
      const min = ((carLen(me) + carLen(lead)) / 2) * upm; // бампер хүрэх зай
      if (fwd) {
        if (lead.s - me.s < min) {
          me.s = Math.max(0, lead.s - min);
          me.v = Math.min(me.v, lead.v);
        }
      } else if (me.s - lead.s < min) {
        me.s = Math.min(net.edges[me.e].length, lead.s + min);
        me.v = Math.min(me.v, lead.v);
      }
    }
  }
}

/* ══════════════════ Эрэлт → машины тоо ══════════════════ */

/** Ирмэг бүрийн хуримтлагдсан жин — машиныг ХААНА төрүүлэхийг сонгоход. */
export type SpawnTable = { cum: number[]; total: number };

/**
 * Төрүүлэх жингийн хүснэгт: `(baseLoad + суурь) × урт`.
 * Богино хэрчимд машин ТӨРӨХГҮЙ (`minLen`), гэхдээ дамжин өнгөрч болно.
 */
export function spawnTable(net: Network, minLenM = PORTAL_MIN_EDGE_M): SpawnTable {
  const min = minLenM * (net.unitsPerMeter || 1);
  const cum: number[] = [];
  let total = 0;
  for (const e of net.edges) {
    if (e.length >= min && !e.dup) total += (e.baseLoad + 0.12) * e.length;
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
  let vt = pickVehicleType(rnd);
  if (VEHICLE_TYPES[vt].key === 'bus' && !busAllows(net, e)) {
    const carIdx = VEHICLE_TYPES.map((x, i) => (x.key === 'car' ? i : -1)).filter((i) => i >= 0);
    vt = carIdx[Math.floor(rnd() * carIdx.length) % carIdx.length];
  }
  const t = VEHICLE_TYPES[vt];
  const vmax = t.vRange[0] + rnd() * (t.vRange[1] - t.vRange[0]);
  const dir: 1 | -1 = net.directed ? 1 : rnd() < 0.5 ? 1 : -1;
  return {
    e, s: rnd() * net.edges[e].length, dir,
    v: vmax, vmax, tint: rnd(), vt, len: t.len,
  };
}

/* ══════════════════ Хилийн орц (машин «ирэх» цэгүүд) ══════════════════ */

/** Хилийн орц — мухрын үзүүрээс сүлжээ РҮҮ чиглэсэн ирмэг·чиглэл. */
export type BoundaryEntry = { e: number; dir: 1 | -1 };

/**
 * СҮЛЖЭЭНИЙ ХИЛИЙН ОРЦУУД — degree-1 (мухар) зангилааны ирмэгүүд.
 *
 * Давхардсан (`dup`) ирмэг ба чиглэлтэй сүлжээнд сумны эсрэг орцыг хасна.
 */
export function boundaryEntries(net: Network): BoundaryEntry[] {
  const out: BoundaryEntry[] = [];
  for (const n of portalNodes(net)) {
    const e = net.nodes[n].out[0];
    if (net.edges[e].dup) continue;
    const dir: 1 | -1 = net.edges[e].a === n ? 1 : -1;
    if (net.directed && dir !== 1) continue; // сумны эсрэг орж болохгүй
    out.push({ e, dir });
  }
  return out;
}

/**
 * БҮСИЙН ЗАХЫН мухрууд — хилийн орц/гарц болж чадах degree-1 зангилаанууд.
 */
/**
 * ПОРТАЛЫН ирмэгийн доод урт (бодит метр) — машин ЗӨВХӨН ≥100 м ирмэгтэй
 * захын мухраар орж гарна. Богино (<100 м) шугам дээр машин зөвхөн ДАМЖИН
 * явна: тэнд төрөхгүй, алга болохгүй — богино стубээс «пор» хийх нь эндээс
 * гардаг байсан (хэмжилт: захын мухрын 36/66 нь богино ирмэгтэй байв).
 */
export const PORTAL_MIN_EDGE_M = 100;

const boundaryNodeCache = new WeakMap<Network, Set<number>>();
export function boundaryNodes(net: Network): Set<number> {
  let bs = boundaryNodeCache.get(net);
  if (bs) return bs;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const n of net.nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  const mx = (x1 - x0) * 0.15;
  const my = (y1 - y0) * 0.15;
  const all: number[] = [];
  bs = new Set<number>();
  for (let i = 0; i < net.nodes.length; i++) {
    if (net.nodes[i].out.length !== 1) continue;
    all.push(i);
    const n = net.nodes[i];
    if (n.x < x0 + mx || n.x > x1 - mx || n.y < y0 + my || n.y > y1 - my) bs.add(i);
  }
  if (bs.size < 8) bs = new Set(all); // жижиг сүлжээнд бүх мухар хил болно
  boundaryNodeCache.set(net, bs);
  return bs;
}

/**
 * ПОРТАЛУУД — машин орж/гарж болох зангилаа: захын мухар БӨГӨӨД ирмэг нь
 * ≥`PORTAL_MIN_EDGE_M` (богино стуб биш жинхэнэ зам). Хэт цөөрвөл (<6) уртын
 * шүүлтийг сулруулна — жижиг/тестийн сүлжээ мухардахгүй.
 */
const portalNodeCache = new WeakMap<Network, Set<number>>();
export function portalNodes(net: Network): Set<number> {
  let ps = portalNodeCache.get(net);
  if (ps) return ps;
  const upm = net.unitsPerMeter || 1;
  const bn = boundaryNodes(net);
  ps = new Set<number>();
  for (const n of bn) {
    const e = net.edges[net.nodes[n].out[0]];
    if (!e.dup && e.length >= PORTAL_MIN_EDGE_M * upm) ps.add(n);
  }
  if (ps.size < 6) ps = bn; // жижиг сүлжээнд бүх захын мухар портал болно
  portalNodeCache.set(net, ps);
  return ps;
}

/** Зангилаа бүрээс хамгийн ойр ГАРЦ (портал) хүртэлх зай — сүлжээ бүрд нэг удаа. */
const exitDistCache = new WeakMap<Network, Float64Array>();

/**
 * ГАРЦ ХҮРТЭЛХ ЗАЙ — зангилаа бүрээс явах чиглэлээ дагаад хамгийн ойрын мухарт
 * (бүсийн хил) хүрэх зам (проекцын нэгж).
 */
export function exitDistances(net: Network): Float64Array {
  let d = exitDistCache.get(net);
  if (d) return d;
  d = new Float64Array(net.nodes.length).fill(Infinity);
  for (const n of portalNodes(net)) d[n] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of net.edges) {
      // Аялал a→b тул a-гаас b-ээр дамжин гарна
      if (d[e.b] + e.length < d[e.a]) { d[e.a] = d[e.b] + e.length; changed = true; }
      if (!net.directed && d[e.a] + e.length < d[e.b]) { d[e.b] = d[e.a] + e.length; changed = true; }
    }
  }
  exitDistCache.set(net, d);
  return d;
}

/**
 * Машиныг ХИЛИЙН ОРЦООР оруулна — мухрын үзүүрт, сүлжээ рүү чиглэсэн.
 * Төрөл/хурд/өнгө `spawnCar`-тай ижил дүрмээр; автобус богино орцоор орохгүй.
 */
export function spawnCarAt(net: Network, entry: BoundaryEntry, rnd: () => number = Math.random): Car {
  let vt = pickVehicleType(rnd);
  if (VEHICLE_TYPES[vt].key === 'bus' && !busAllows(net, entry.e)) {
    const carIdx = VEHICLE_TYPES.map((x, i) => (x.key === 'car' ? i : -1)).filter((i) => i >= 0);
    vt = carIdx[Math.floor(rnd() * carIdx.length) % carIdx.length];
  }
  const t = VEHICLE_TYPES[vt];
  const vmax = t.vRange[0] + rnd() * (t.vRange[1] - t.vRange[0]);
  const upm = net.unitsPerMeter || 1;
  // Үзүүрээс машины хагас уртын зайд — бие нь сүлжээн дотор багтана
  const inset = Math.min((t.len / 2 + 0.5) * upm, net.edges[entry.e].length / 2);
  const s0 = entry.dir === 1 ? inset : net.edges[entry.e].length - inset;
  return { e: entry.e, s: s0, dir: entry.dir, v: vmax * 0.6, vmax, tint: rnd(), vt, len: t.len };
}

/**
 * Тухайн эрэлтэд харгалзах ИДЭВХТЭЙ машины тоо.
 * Шөнө ч хөдөлгөөн бүрэн зогсдоггүй тул `min` шал тавина.
 */
export function targetCars(diurnal: number, max: number, min = 10): number {
  return Math.round(min + Math.max(0, max - min) * Math.max(0, Math.min(1, diurnal)));
}

/**
 * СҮЛЖЭЭНД НЭГЭН ЗЭРЭГ явж чадах машины ДЭЭД тоо — багтаамжийн таг.
 *
 * Тооцоо: (давхардаагүй нийт урт ÷ машины эзлэх зай) × чиглэлийн тоо × `util`.
 * `util = 0.5` — 24 цагийн мөчлөгөөр ХЭМЖИЖ тогтоосон дээд цэг:
 *   · Бодит (Monmap): оройд 2,048 машин · 14% хөдөлгөөнтэй / 3.3 км/ц (ХҮНД
 *     түгжрэл), шөнө 98% сэргэж 2 дахь өдөр ижил давтагдана.
 *   · Төлөвлөгөө: оройд ~4,100 · 14–17%; шөнийн сэргэлт арай сул (03:00-д 58%)
 *     ч өглөө болоход бүрэн цэвэрлэгддэг.
 * Үүнээс дээш бол шөнийн сэргэлт эвдэрч, гацаа өдөр дамждаг. Гацааны эсрэг
 * дүрмүүд (тэвчээрийн эргэлт, хайрцгийн хориг, гарцын чиглүүлэлт) энэ түвшинд
 * циклийг тайлсаар байдаг.
 */
export function carCapacity(net: Network, util = 0.5): number {
  const upm = net.unitsPerMeter || 1;
  let lenM = 0;
  for (const e of net.edges) if (!e.dup) lenM += e.length / upm;
  // Чиглэлгүй сүлжээнд ирмэг бүр 2 урсгал (тус тусын дараалал) даана
  const dirs = net.directed ? 1 : 2;
  const perCarM = CAR_LEN + MIN_GAP_M;
  return Math.max(10, Math.floor(((lenM * dirs) / perCarM) * util));
}

/**
 * БҮХ СҮЛЖЭЭНД НЭГ МАШИНЫ ТАГ — эрэлт ба сүлжээ бүрийн багтаамжийн ХАМГИЙН БАГА.
 */
export function commonCarCap(demand: number, caps: readonly number[]): number {
  let cap = Math.max(1, Math.round(demand));
  for (const c of caps) if (Number.isFinite(c) && c > 0 && c < cap) cap = c;
  return cap;
}
