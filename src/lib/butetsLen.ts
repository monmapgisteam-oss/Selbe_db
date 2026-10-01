/**
 * ДЭД БҮТЦИЙН ГЕОМЕТРИЙН УРТ / ТАЛБАЙ — SR-ЭЭС ХАМААРУУЛЖ (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * Хэрэглээ: «Урт ← геометр» товч, шинэ объект/хэлбэр засварын дараа уртын
 * талбарыг (`Urt_m` г.м.) АВТОМАТААР бөглөх.
 *
 * ⚠️ ДҮРЭМ (`measureKind`):
 *   · ПРОЕКЦЛОГДСОН SR (UTM 48N = 32648 — инженерийн 73 давхарга, 2026-10-01-нд
 *     амьд метадатаар баталсан) → ХАВТГАЙ (planar) урт. Сервер `Shape__Length`-ийг
 *     яг ингэж (давхаргын SR-ээр) боддог тул байгаа объектод `Shape__Length` ЭХ.
 *   · WEB MERCATOR (102100/3857) эсвэл ГАЗАРЗҮЙН (4326 г.м.) → ГЕОДЕЗИЙН урт.
 *     Web Mercator-ын хавтгай урт энэ өргөрөгт (~47.9°) 1/cos φ ≈ 1.49 ДАХИН
 *     ХЭТЭРХИЙ — `Shape__Length` ч мөн ийм тул тэр үед ХЭРЭГЛЭХГҮЙ.
 * ⚠️ Зурсан (sketch) геометр нь ҮРГЭЛЖ Web Mercator тул шинэ объектын урт нь
 *    геодезийн. UTM-ийн хавтгай урттай зөрүү нь масштабын коэффициент (≈0.9996–1.0004)
 *    — 1 км-т ≤ 0.4 м, бөглөхөд ач холбогдолгүй; хадгалсны дараа `Shape__Length` ирнэ.
 * ⚠️ Геодезийн тооцоо нь WGS84 эллипсоид дээрх ОРОН НУТГИЙН ойролцоолол (хэрчим бүрийг
 *    ≤ 250 м-ээр хуваана) — инженерийн шугамын хэмжээнд алдаа < 1e-6.
 * ⚠️ REACT/СҮЛЖЭЭГҮЙ, `@arcgis/core`-гүй — `butetsLen.check.mjs` шууд импортлоно.
 */

export type SrKind = 'webmerc' | 'geographic' | 'projected' | 'unknown';

const WEB_MERC = new Set([102100, 102113, 3857, 3785, 900913]);

/** WKID-ийн төрөл. EPSG-ийн 4000–4999 нь газарзүйн (өргөрөг/уртраг) SR. */
export function srKind(wkid: number | null | undefined): SrKind {
  if (wkid == null || !Number.isFinite(wkid)) return 'unknown';
  if (WEB_MERC.has(wkid)) return 'webmerc';
  if (wkid >= 4000 && wkid < 5000) return 'geographic';
  return 'projected';
}

/**
 * Хэмжих арга — давхаргын SR-ээс. Мэдэгдэхгүй SR-д ГЕОДЕЗИЙН (аюулгүй тал:
 * хавтгай нь зөвхөн метрийн проекцод зөв).
 */
export const measureKind = (layerWkid: number | null | undefined): 'planar' | 'geodesic' =>
  (srKind(layerWkid) === 'projected' ? 'planar' : 'geodesic');

/** Геометрийн JSON-ы SR (`latestWkid` эрхэмлэнэ) */
export function geomWkid(g: unknown): number | null {
  const sr = (g as { spatialReference?: { wkid?: number; latestWkid?: number } } | null)?.spatialReference;
  const w = sr?.latestWkid ?? sr?.wkid;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

/* ── WGS84 ── */
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const RAD = Math.PI / 180;

/** Web Mercator (метр) → [уртраг, өргөрөг] градусаар (бөмбөрцөг томьёо, a = 6378137) */
const mercToLonLat = (x: number, y: number): [number, number] => [
  (x / A) / RAD,
  (2 * Math.atan(Math.exp(y / A)) - Math.PI / 2) / RAD,
];

/** Меридианы (M) ба перпендикуляр (N) муруйлтын радиус — өргөрөг φ (радиан) дээр */
const radii = (phi: number): { M: number; N: number } => {
  const s = Math.sin(phi);
  const w = 1 - E2 * s * s;
  return { M: (A * (1 - E2)) / (w * Math.sqrt(w)), N: A / Math.sqrt(w) };
};

/** Эллипсоид дээрх БОГИНО хэрчмийн урт (м) — дундаж өргөрөгийн M, N-ээр */
function geoSeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const { M, N } = radii((p1 + p2) / 2);
  const dy = (p2 - p1) * M;
  const dx = (lon2 - lon1) * RAD * N * Math.cos((p1 + p2) / 2);
  return Math.hypot(dx, dy);
}

type Pt = [number, number];
const toLonLat = (kind: SrKind) => (p: number[]): Pt =>
  (kind === 'webmerc' ? mercToLonLat(p[0], p[1]) : [p[0], p[1]]);

/** Нэг замын (path/ring) урт — SR-ийн төрлөөр */
function pathLength(path: number[][], kind: SrKind): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (kind === 'projected' || kind === 'unknown') {
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
      continue;
    }
    /* ⚠️ Урт хэрчмийг ХУВААНА (эх SR-ийн шугамаар) — нэг M/N-ээр бодох алдаа багасна */
    const pa = toLonLat(kind)(a);
    const pb = toLonLat(kind)(b);
    const rough = geoSeg(pa[0], pa[1], pb[0], pb[1]);
    const n = Math.max(1, Math.ceil(rough / 250));
    let prev = pa;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const q = toLonLat(kind)([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      s += geoSeg(prev[0], prev[1], q[0], q[1]);
      prev = q;
    }
  }
  return s;
}

/**
 * ШУГАМЫН УРТ (м) — `paths`-тай геометр. Полигонд ПЕРИМЕТР биш `null` (урт нь
 * шугамд л утгатай). SR нь геометрийн өөрийнх; байхгүй бол `fallbackWkid`.
 * @returns хэмжих боломжгүй (хоосон/танихгүй) бол `null` (0 БИШ)
 */
export function geomLengthM(g: unknown, fallbackWkid: number | null = null): number | null {
  const paths = (g as { paths?: number[][][] } | null)?.paths;
  if (!Array.isArray(paths) || !paths.length) return null;
  const kind = srKind(geomWkid(g) ?? fallbackWkid);
  let s = 0;
  let any = false;
  for (const p of paths) {
    if (!Array.isArray(p) || p.length < 2) continue;
    any = true;
    s += pathLength(p, kind);
  }
  return any ? s : null;
}

/**
 * ПОЛИГОНЫ ТАЛБАЙ (м²). Проекцолсонд хавтгай (shoelace); Web Mercator/газарзүйнд
 * ЭЛЛИПСОИДЫН СИНУСОИДАЛ (тэнцүү-талбайт) проекцоор орон нутагт — жижиг полигонд
 * алдаа < 1e-5. Цагираг бүрийн тэмдэгтэй талбайг нийлүүлж (гадна ↔ нүх) абсолют.
 */
export function geomAreaM2(g: unknown, fallbackWkid: number | null = null): number | null {
  const rings = (g as { rings?: number[][][] } | null)?.rings;
  if (!Array.isArray(rings) || !rings.length) return null;
  const kind = srKind(geomWkid(g) ?? fallbackWkid);
  let total = 0;
  let any = false;
  let phi0 = 0;
  let lon0 = 0;
  if (kind === 'webmerc' || kind === 'geographic') {
    /* Төв цэг — эхний цагирагийн дундаж */
    const pts = rings[0].map(toLonLat(kind));
    lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    phi0 = (pts.reduce((s, p) => s + p[1], 0) / pts.length) * RAD;
  }
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    any = true;
    const xy: Pt[] = kind === 'webmerc' || kind === 'geographic'
      ? ring.map(toLonLat(kind)).map(([lon, lat]) => {
        const phi = lat * RAD;
        const { M } = radii((phi + phi0) / 2);
        const { N } = radii(phi);
        /* x = Δλ·N(φ)·cos φ, y = меридианы нум φ0→φ (дундаж M-ээр) — синусоидал */
        return [(lon - lon0) * RAD * N * Math.cos(phi), (phi - phi0) * M] as Pt;
      })
      : ring.map((p) => [p[0], p[1]] as Pt);
    let a = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      a += x1 * y2 - x2 * y1;
    }
    total += a / 2;
  }
  return any ? Math.abs(total) : null;
}

/* ══════════ Уртын талбар ══════════ */

/**
 * ГАРААР БИЧИГДДЭГ УРТЫН ТАЛБАР мөн эсэх — `DedButetsEdit.LEN_FIELD` + давхаргын
 * `qty.field` (Shape__* биш). Нэгж нь нэрээс (`*_km` → км) эсвэл давхаргын `qty.unit`.
 */
export const LEN_FIELD_RE = /^(urt_m|urt_km|length_km|length_m)$/i;

export function lenFieldUnit(
  fieldName: string, qty: { field: string; unit: string } | null | undefined,
): 'm' | 'km' | null {
  const n = fieldName.toLowerCase();
  const qf = (qty?.field ?? '').toLowerCase();
  const isQty = qf !== '' && !qf.startsWith('shape__') && n === qf;
  if (!LEN_FIELD_RE.test(fieldName) && !isQty) return null;
  if (/km/i.test(fieldName)) return 'km';
  if (isQty && qty?.unit === 'км') return 'km';
  return 'm';
}

/**
 * Метрийн уртыг талбарын утга болгоно (текст — маягтын ноорог текстээр явдаг).
 * ⚠️ Бүхэл тоон талбарт (`int`) бүхэлчилнэ — эс бөгөөс `validateRow` татгалзана.
 */
export function lenFieldValue(meters: number, unit: 'm' | 'km', int = false): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  const v = unit === 'km' ? meters / 1000 : meters;
  if (int) return String(Math.round(v));
  return String(Math.round(v * (unit === 'km' ? 1000 : 100)) / (unit === 'km' ? 1000 : 100));
}
