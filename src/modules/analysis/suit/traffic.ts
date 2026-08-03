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

/** Ирмэг = хэрчим + хоёр үзүүрийн зангилаа. ХОЁР чиглэлтэй. */
export type NetEdge = Segment & { a: number; b: number };

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
};

/** Үзүүрийг наах хүлцэл (БОДИТ метр) — CAD-ийн хэрчмүүд яг таг таардаггүй. */
export const SNAP_TOL_M = 1.0;

/**
 * Үүнээс богино хэрчим ИРМЭГ болохгүй (доройтсон оройнууд).
 * ⚠️ Маш ЖИЖИГ байлгах ёстой: 0.6–1 м-ийн хэрчмүүд нь CAD дээр хоёр гудамжийг
 * ХОЛБОГЧ болдог. Тэдгээрийг хаявал сүлжээ хэсэгчилж (холбогдсон урт 55%-иас
 * 40% болж) машин жижиг халаасанд түгжигдэнэ.
 */
const MIN_EDGE_M = 0.05;

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
  { tolM = SNAP_TOL_M, unitsPerMeter = 1 }: { tolM?: number; unitsPerMeter?: number } = {},
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
  const push = (pts: Pt[]) => {
    if (pts.length < 2) return;
    // ⚠️ Доройтсон хэрчмийн үзүүрийг ч ЗААВАЛ бүртгэнэ — тэдгээр нь хөрш
    //    хэрчмүүдийн НИЙТЛЭГ зангилаа болж холболтыг барьдаг.
    const a = nid(pts[0]);
    const b = nid(pts[pts.length - 1]);
    if (a === b) return;
    const seg = makeSegment(String(edges.length), pts);
    if (seg.length < MIN_EDGE_M * unitsPerMeter) return;
    edges.push({ ...seg, a, b });
  };

  for (const pts of paths) {
    if (pts.length < 2) continue;
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= tol;
    if (closed && pts.length >= 4) {
      const mid = Math.floor(pts.length / 2);
      push(pts.slice(0, mid + 1));
      push(pts.slice(mid));
    } else {
      push(pts);
    }
  }

  for (let i = 0; i < edges.length; i++) {
    nodes[edges[i].a].out.push(i);
    nodes[edges[i].b].out.push(i);
  }
  return { nodes, edges, unitsPerMeter };
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
};

/** Машины ойролцоо урт (м) — car-following-д «эзэлсэн зай». */
export const CAR_LEN = 5;
/** Зогсох үеийн бамперын хоорондох зай (м) */
export const MIN_GAP_M = 2;
/** Жолоочийн урвалын хугацаа (с) — Krauss загварын τ */
const TAU = 1.0;
/** Хурдатгал ба удаашрал (м/с²) */
const ACC = 1.8;
const DEC = 4.5;

/** Чөлөөт урсгалын хурдны хязгаар (м/с) — 30…50 км/ц. */
export const V_MIN = 30 / 3.6;
export const V_MAX = 50 / 3.6;

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
export function stepCars(net: Network, cars: Car[], dt: number, rnd: () => number = Math.random): void {
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
        gap[me] = Math.abs(cars[ahead].s - cars[me].s) - CAR_LEN * upm;
        leadV[me] = cars[ahead].v;
      }
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
    const g = gap[i] / upm;
    let want = c.vmax;
    if (Number.isFinite(g)) {
      const vl = leadV[i];
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
      const next = pickNext(net, node, c.e, travel, rnd);
      if (next == null) {
        // Мухар — U-эргэлт хийж буцна
        c.s = c.dir === 1 ? edge.length : 0;
        c.dir = c.dir === 1 ? -1 : 1;
        continue;
      }
      c.e = next;
      c.dir = net.edges[next].a === node ? 1 : -1;
      c.s = c.dir === 1 ? 0 : net.edges[next].length;
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

/** Шинэ машин — санамсаргүй ирмэг, байрлал, чиглэл, хурд. */
export function spawnCar(net: Network, tbl: SpawnTable, rnd: () => number = Math.random): Car | null {
  const e = pickEdge(tbl, rnd);
  if (e < 0) return null;
  const vmax = V_MIN + rnd() * (V_MAX - V_MIN);
  return { e, s: rnd() * net.edges[e].length, dir: rnd() < 0.5 ? 1 : -1, v: vmax, vmax, tint: rnd() };
}

/**
 * Тухайн эрэлтэд харгалзах ИДЭВХТЭЙ машины тоо.
 * Шөнө ч хөдөлгөөн бүрэн зогсдоггүй тул `min` шал тавина.
 */
export function targetCars(diurnal: number, max: number, min = 10): number {
  return Math.round(min + Math.max(0, max - min) * Math.max(0, Math.min(1, diurnal)));
}
