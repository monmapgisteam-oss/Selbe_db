/**
 * Өгөгдөл татах, бүс тус бүрээр нэгтгэх давхарга.
 * Бүх орон зайн тооцоо UTM 48N (метр) дээр планараар хийгдэнэ.
 */
import Query from "@arcgis/core/rest/support/Query.js";
import * as query from "@arcgis/core/rest/query.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";
import { SERVICES, ENGINEERING_LAYERS, WKID, SOCIAL_FACILITIES,
         COST_LAYERS, LINE_UNIT_M, PROJECT_AREA_HA } from "./config.js";

/** Нэгтгэсэн үйлчилгээний үндэс — өртгийн давхаргыг дугаараар нь татахад */
const SERVICE_ROOT = SERVICES.zones.replace(/\/\d+$/, "");

/**
 * ZONE_ID хоосон барилгыг ойролцоох бүсэд наах дээд зай (метр).
 * Эх өгөгдлийн 19 хоосон барилгын 14 нь бүсийн дотор, үлдсэн 5 нь хамгийн ойрын
 * бүсээсээ 66–83 м зайд байрлана. 100 м-ээр авбал 368 барилга бүгд бүсэд орж,
 * нийт ашигтай талбай 1,523,834 м² болж эх өгөгдөлтэй яг тэнцэнэ.
 */
const SNAP_METERS = 100;

/** Барилгын талбарын нэр — кирилл тул тогтмолоор гаргав */
const F = {
  gfa: "Барилгын_нийт_талбай_m2",
  purpose: "Зориулалт_m",
  price: "negj_une",          // борлуулалтын нэгж үнэ, ₮/м²
};

/**
 * Давхаргын БҮХ объектыг татна.
 * Үйлчилгээний maxRecordCount (2000) дээр таслагдахаас сэргийлж хуудаслана —
 * эс тэгвээс 3200 объекттой "Гадна дулаан" мэт давхарга дутуу ирнэ.
 */
const PAGE = 2000;
async function fetchAll(url, outFields, returnGeometry = false) {
  const out = [];
  for (let start = 0; ; start += PAGE) {
    const q = new Query({
      where: "1=1",
      outFields,
      returnGeometry,
      outSpatialReference: { wkid: WKID },
      start,
      num: PAGE,
    });
    const res = await query.executeQueryJSON(url, q);
    out.push(...res.features);
    if (res.features.length < PAGE && !res.exceededTransferLimit) break;
    if (res.features.length === 0) break;
  }
  return out;
}

/** Ногоон байгууламжийн ZONE_ID_1 → бүсийн ZONE_ID тааруулах (Багц-2.1 → Багц-2) */
function resolveZoneId(rawId, zoneIdSet) {
  if (!rawId) return null;
  const id = rawId.trim();
  if (zoneIdSet.has(id)) return id;
  // "Багц-2.1" мэтийг эцэг бүс рүү нь буулгана
  const parent = id.replace(/\.\d+$/, "");
  if (zoneIdSet.has(parent)) return parent;
  return null;
}

/**
 * Бүх давхаргыг татаж, бүсийн түвшинд нэгтгэсэн массив буцаана.
 * @param {(msg:string, pct:number)=>void} onProgress
 */
export async function loadData(onProgress = () => {}) {
  onProgress("Бүсийн мэдээлэл татаж байна…", 5);
  const zoneFeatures = await fetchAll(
    SERVICES.zones,
    ["ZONE_ID", "TOROL", "Area", "Shape__Area", "FAR", "FAR_HUVI", "BCR",
     "NORM_ZOGS", "ET_IL", "ET_DALD", "ET_NIIT"],
    true
  );

  onProgress("Барилга байгууламж татаж байна…", 20);
  const buildings = await fetchAll(SERVICES.buildings, [
    "OBJECTID", "ZONE_ID", "Total_population", "Parking", "Urhiin_too", "Barilga_ty",
    F.gfa, F.purpose, F.price,
  ], true);

  // --- Барилга бүрийг бүсэд хоёр аргаар оноох ---
  //  _zidAttr    : ZONE_ID талбараар (эх өгөгдөлд 19 барилгын утга хоосон)
  //  _zidSpatial : БАЙРШЛААР (select by location) — барилгын төв цэг аль бүсийн
  //                дотор байгаагаар. Төв цэгээр авснаар барилга яг нэг бүсэд
  //                л ороод, зааг дээрх барилга давхар тоологдохгүй.
  const zoneGeoms = zoneFeatures
    .map((f) => ({ id: (f.attributes.ZONE_ID || "").trim(), geom: f.geometry }))
    .filter((z) => z.id && z.geom);

  const joinStats = { attrMissing: 0, snapped: 0, unassigned: 0, differs: 0, outside: [] };

  for (const f of buildings) {
    const a = f.attributes;
    a._zidAttr = (a.ZONE_ID || "").trim() || null;
    if (!a._zidAttr) joinStats.attrMissing++;

    const c = f.geometry?.centroid;
    let hit = c ? zoneGeoms.find((z) => geometryEngine.contains(z.geom, c)) : null;
    let nearest = null, bd = Infinity;
    if (!hit && c) {
      // Төв цэг ямар ч бүсэд орохгүй бол хамгийн ойрын бүс рүү (SNAP_METERS хүртэл)
      for (const z of zoneGeoms) {
        const d = geometryEngine.distance(z.geom, c, "meters");
        if (d < bd) { bd = d; nearest = z; }
      }
      if (bd <= SNAP_METERS) { hit = nearest; joinStats.snapped++; }
    }

    a._zidSpatial = hit ? hit.id : null;
    if (!hit) {
      joinStats.unassigned++;
      joinStats.outside.push({
        oid: a.OBJECTID,
        nearest: nearest?.id ?? null, distM: isFinite(bd) ? Math.round(bd) : null,
      });
    }
    if (a._zidAttr && a._zidSpatial && a._zidAttr !== a._zidSpatial) joinStats.differs++;
  }

  onProgress("Ногоон байгууламж татаж байна…", 35);
  const green = await fetchAll(SERVICES.green, ["ZONE_ID_1", "Layer", "Shape__Area", "Area_hec"]);

  onProgress("Нийтийн тээврийн зогсоол татаж байна…", 50);
  const [busStops, lrtStops] = await Promise.all([
    fetchAll(SERVICES.busStops, ["OBJECTID"], true).catch(() => []),
    fetchAll(SERVICES.lrtStops, ["OBJECTID"], true).catch(() => []),
  ]);

  onProgress("Алхалтын бүс татаж байна…", 62);
  const parkWalk = await fetchAll(SERVICES.parkWalk, ["OBJECTID"], true).catch(() => []);

  onProgress("Инженерийн дэд бүтэц татаж байна…", 74);
  const engResults = await Promise.all(
    ENGINEERING_LAYERS.map((l) => fetchAll(l.url, ["OBJECTID"], true).catch(() => []))
  );
  const engGeoms = engResults.flat().map((f) => f.geometry).filter(Boolean);

  onProgress("Орон зайн үзүүлэлт тооцоолж байна…", 85);

  // --- Урьдчилсан бэлтгэл: нэгтгэсэн геометрүүд ---
  const stopGeoms = [...busStops, ...lrtStops].map((f) => f.geometry).filter(Boolean);
  const parkUnion = parkWalk.length
    ? geometryEngine.union(parkWalk.map((f) => f.geometry).filter(Boolean))
    : null;
  const engUnion = engGeoms.length ? geometryEngine.union(engGeoms) : null;

  // --- Ногоон байгууламжийг бүс + ангиллаар нэгтгэх ---
  const zoneIdSet = new Set(zoneFeatures.map((f) => (f.attributes.ZONE_ID || "").trim()));
  const greenByZone = new Map(); // zoneId -> { category -> m2 }
  for (const f of green) {
    const a = f.attributes;
    const zid = resolveZoneId(a.ZONE_ID_1, zoneIdSet);
    if (!zid) continue;
    if (!greenByZone.has(zid)) greenByZone.set(zid, {});
    const bucket = greenByZone.get(zid);
    const cat = (a.Layer || "Тодорхойгүй").trim();
    bucket[cat] = (bucket[cat] || 0) + (a.Shape__Area || (a.Area_hec || 0) * 10000);
  }

  // --- Бүс бүрийн эцсийн бичлэг ---
  const zones = zoneFeatures.map((f) => {
    const a = f.attributes;
    const id = (a.ZONE_ID || "").trim();
    const geom = f.geometry;

    // ТАЛБАЙ — "Area" талбар (нэгж: ГЕКТАР). Энэ нь бүсийн албан ёсны талбай
    // бөгөөд газрын хөрөнгө оруулалт, хүн амын нягтшилд шууд ашиглагдана.
    const areaHa = a.Area > 0 ? a.Area : (a.Shape__Area || 0) / 10000;
    const areaM2 = areaHa * 10000;

    // ХҮН АМЫН НЯГТШЛЫН хуваарь — хүн ам нь бүсийн бүтэн газар нутаг дээр
    // амьдардаг тул цэвэр талбай (Area) биш полигоны талбайгаар бодно.
    const polyHa = a.Shape__Area > 0 ? a.Shape__Area / 10000 : areaHa;

    // FAR — эх өгөгдлийн "FAR" талбар 52 бүсийн 22-т нь эвдэрсэн: утга таслагдаж
    // 1.15-ын оронд 0.01, 8.43-ын оронд 0.08 гэж бичигджээ. "FAR_HUVI" (хувиар)
    // нь бүрэн бүтэн бөгөөд BAR_M2/GAZAR_M2-тай 43/52 бүст таарна. Тиймээс
    // FAR_HUVI/100-г ЗАСВАРЛАСАН утга болгон шууд ашиглана.
    // BCR нь эзлэх хэсэг (0–0.5) тул ×100 хийж хувь болгоно.
    const zoneFar = a.FAR_HUVI != null ? a.FAR_HUVI / 100 : (a.FAR ?? null);
    const zoneBcr = a.BCR != null ? a.BCR * 100 : null;

    // Нийтийн тээвэр — хамгийн ойрын зогсоол хүртэлх зай (м)
    let transit = null;
    if (geom && stopGeoms.length) {
      transit = Math.min(...stopGeoms.map((g) => geometryEngine.distance(geom, g, "meters")));
    }

    // Алхалтын бүсийн хамрах хувь
    let parkPct = null;
    if (geom && parkUnion) {
      const inter = geometryEngine.intersect(geom, parkUnion);
      const ia = inter ? Math.abs(geometryEngine.planarArea(inter, "square-meters")) : 0;
      const za = Math.abs(geometryEngine.planarArea(geom, "square-meters")) || areaM2;
      parkPct = za > 0 ? (ia / za) * 100 : null;
    }

    // Инженерийн шугам хүртэлх зай (м)
    let engDist = null;
    if (geom && engUnion) engDist = geometryEngine.distance(geom, engUnion, "meters");

    return {
      id,
      zoneId: id,
      type: a.TOROL || "—",
      geometry: geom,
      areaM2, areaHa, polyHa,
      zoneFar, zoneBcr,
      // --- Зогсоол (бүсийн давхаргаас) ---
      normParking: a.NORM_ZOGS || 0,   // эх өгөгдлийн хэрэгцээ
      etIl: a.ET_IL || 0,              // ил зогсоол
      etDald: a.ET_DALD || 0,          // далд зогсоол
      etNiit: a.ET_NIIT || 0,          // нийт = ил + далд

      // барилгаас нэгтгэсэн утгыг aggregateBuildings() бөглөнө
      ...EMPTY_AGG(),

      greenByCat: greenByZone.get(id) || {},

      // орон зайн түүхий утга (ногоон нь тохиргооноос хамаарах тул дараа бөглөнө)
      _transit: transit,
      _parkPct: parkPct,
      _engDist: engDist,
    };
  });

  // Анхны нэгтгэлт — байршлаар (select by location)
  aggregateBuildings(zones, buildings, "spatial");

  onProgress("Нийгмийн дэд бүтцийн хүртээмж тооцоолж байна…", 92);
  computeSocialAccess(zones, buildings);

  onProgress("Бэлэн", 100);

  return {
    zones,
    buildings,
    context: {
      busStops, lrtStops, parkWalk, greenFeatures: green,
      buildingCount: buildings.length,
      joinStats,
    },
  };
}

/** Барилгаас нэгтгэх талбаруудын хоосон утга */
export function EMPTY_AGG() {
  return {
    population: 0,        // нийт (оршин суугч + хүчин чадал) — лавлагаа
    residentPop: 0,       // ОРШИН СУУГЧ — нягтшил, ногоон байгууламжид ашиглана
    capacityPop: 0,       // үйлчилгээ/сургуулийн хүчин чадал
    buildingCount: 0, households: 0,
    gfaM2: 0,
    gfaResM2: 0,          // зөвхөн орон сууцны нийт талбай
    gfaSaleM2: 0,         // борлуулах боломжтой (Одоо байгаа-г хассан) талбай
    gfaResSaleM2: 0,      // үүнээс орон сууц
    salesValue: 0,        // борлуулах барилгын үнэлгээ (negj_une × талбай)
    salesValueRes: 0,     // зөвхөн орон сууцных
  };
}

/**
 * ОРШИН СУУХ зориулалт эсэх.
 *
 * Эх өгөгдлийн Total_population талбар нь орон сууцны барилгад ОРШИН СУУГЧ,
 * бусад барилгад ХҮЧИН ЧАДАЛ-ыг заана (сургууль/цэцэрлэгийн хүүхэд, үйлчлүүлэгч).
 * Баталгаа: орон сууцны 43,287 хүн / 12,381 өрх = яг 3.50 хүн/өрх, харин
 * бусад 25,039 "хүн" дээр өрх 0 бөгөөд "Сургууль 960 хүүхэд" нь 4 барилга ×
 * 960 = 3,840 гэж яг таарна.
 *
 * Тиймээс хүн амын нягтшил, нэг хүнд ногдох ногоон байгууламжийг зөвхөн
 * ОРШИН СУУГЧ-аар бодно. Эс тэгвээс нягтшил 58%-иар хөөрөгдөж, орон сууцанд
 * амьдардаг хүүхдийг сургууль дээр нь давхар тооцно.
 */
const RESIDENTIAL_RE = /орон сууц|house/i;
export const isResidential = (purpose) => RESIDENTIAL_RE.test((purpose || "").trim());

/**
 * БОРЛУУЛАХ БОЛОМЖТОЙ эсэх (Barilga_ty).
 *
 * "Одоо байгаа" барилга нь аль хэдийн зарагдсан/ашиглалтад орсон тул
 * төслийн ирээдүйн орлогод тооцохгүй. Зөвхөн "Төлөвлөсөн" ба
 * "Баригдаж байгаа" барилга борлуулалтын үнэлгээнд орно.
 *
 * Хот төлөвлөлтийн үзүүлэлт (нягтшил, хүн ам, зогсоол…) энэ шүүлтээс
 * ХАМААРАХГҮЙ — тэнд бүх барилга хэвээр тооцогдоно.
 */
const EXISTING_RE = /^одоо байгаа/i;
export const isSellable = (status) => !EXISTING_RE.test((status || "").trim());

/**
 * Барилгыг бүсээр нэгтгэнэ — ХУДАЛДААЛАХ ӨРТГИЙН СУУРЬ.
 *
 * method:
 *  "spatial" — SELECT BY LOCATION: барилгын төв цэг аль бүсийн дотор байгаагаар
 *              (анхны сонголт). Барилга бүр яг нэг бүсэд орох тул давхар
 *              тоологдохгүй бөгөөд бүсүүдийн нийлбэр эх өгөгдөлтэй тэнцэнэ.
 *  "attr"    — ZONE_ID талбараар (эх өгөгдөлд 19 барилгын утга хоосон).
 *
 * Ашигтай талбай = Барилгажсан_талбай (alias "Ашигтай талбай") талбарын нийлбэр.
 */
export function aggregateBuildings(zones, buildings, method = "spatial") {
  const key = method === "attr" ? "_zidAttr" : "_zidSpatial";

  const byZone = new Map();
  for (const f of buildings) {
    const a = f.attributes;
    const id = a[key];
    if (!id) continue;
    if (!byZone.has(id)) byZone.set(id, EMPTY_AGG());
    const b = byZone.get(id);

    const pop = a.Total_population || 0;
    const gfa = a[F.gfa] || 0;
    const res = isResidential(a[F.purpose]);
    // "Одоо байгаа" барилга аль хэдийн зарагдсан тул орлогод тооцохгүй
    const sell = isSellable(a.Barilga_ty);
    const value = sell ? gfa * (a[F.price] || 0) : 0;   // борлуулалтын үнэлгээ, ₮

    b.population    += pop;
    if (res) b.residentPop += pop;
    else b.capacityPop += pop;
    b.gfaM2         += gfa;
    if (sell) b.gfaSaleM2 += gfa;
    b.salesValue    += value;
    if (res) {
      b.gfaResM2 += gfa;
      if (sell) b.gfaResSaleM2 += gfa;
      b.salesValueRes += value;
    }
    b.households    += a.Urhiin_too || 0;
    b.buildingCount += 1;

  }

  for (const z of zones) {
    const b = byZone.get(z.id);
    Object.assign(z, EMPTY_AGG());
    if (!b) continue;
    Object.assign(z, {
      population: b.population, residentPop: b.residentPop, capacityPop: b.capacityPop,
      buildingCount: b.buildingCount, households: b.households,
      gfaM2: b.gfaM2, gfaResM2: b.gfaResM2,
      gfaSaleM2: b.gfaSaleM2, gfaResSaleM2: b.gfaResSaleM2,
      salesValue: b.salesValue, salesValueRes: b.salesValueRes,
    });
  }
  return zones;
}

/**
 * НИЙГМИЙН ДЭД БҮТЦИЙН ХҮРТЭЭМЖ — бүс бүрийн оршин суугчид сургууль,
 * цэцэрлэг, эмнэлэг, цагдаа хэр хүртээмжтэй байгааг 0..100% -иар үнэлнэ.
 *
 * Сургууль, цэцэрлэг (capacity горим) — 2SFCA (two-step floating catchment area):
 *   1) Байгууламж бүрийн суудлыг (Total_population) түүний радиус дотор
 *      амьдардаг ОРШИН СУУГЧДЫН тоонд хувааж "нэг хүнд ногдох суудал" гаргана.
 *      Ингэснээр нэг сургуулийг ойролцоох 5 бүс тус тусдаа бүтнээр нь
 *      "өөрийн" гэж тоолохгүй — эрэлтээр нь хуваарилагдана.
 *   2) Бүс бүрд радиус дотор нь байгаа бүх байгууламжийн харьцааг нэмж,
 *      нормтой (per1000) харьцуулж хувь гаргана.
 *
 * Эмнэлэг, цагдаа (distance горим) — эдгээрийн "хүчин чадал" нь харьцуулах
 * боломжтой норм байхгүй тул зайгаар: радиус дотор 100%, 2×радиусаас цааш 0%.
 *
 * Оршин суугчгүй (residentPop = 0) бүсэд утга гарахгүй — ӨГӨГДӨЛГҮЙ.
 */
export function computeSocialAccess(zones, buildings) {
  // --- Нийгмийн үйлчилгээний барилгыг зориулалтаар нь ялгах ---
  const facs = [];
  for (const f of buildings) {
    const a = f.attributes;
    const purpose = (a[F.purpose] || "").trim();
    const type = SOCIAL_FACILITIES.find((s) => s.re.test(purpose));
    const c = f.geometry?.centroid;
    if (!type || !c) continue;
    facs.push({
      type: type.key, purpose,
      capacity: a.Total_population || 0,
      // бүс бүр хүртэлх зай (метр) — доор бөглөнө
      dist: zones.map((z) => (z.geometry
        ? geometryEngine.distance(z.geometry, c, "meters") : Infinity)),
    });
  }

  const totalW = SOCIAL_FACILITIES.reduce((a, s) => a + s.weight, 0) || 1;
  const parts = {};   // key -> бүс бүрийн { cover, ... }

  for (const s of SOCIAL_FACILITIES) {
    const mine = facs.filter((f) => f.type === s.key);
    parts[s.key] = zones.map(() => ({ cover: 0, count: 0, capacity: 0, nearest: null }));

    if (s.mode === "capacity") {
      // 1-р алхам: байгууламж бүрийн "нэг оршин суугчид ногдох суудал"
      for (const f of mine) {
        const served = zones.reduce(
          (a, z, i) => a + (f.dist[i] <= s.radius ? z.residentPop : 0), 0);
        f.ratio = served > 0 ? f.capacity / served : 0;
      }
      // 2-р алхам: бүсэд ногдох суудал → нормын хувь
      zones.forEach((z, i) => {
        const near = mine.filter((f) => f.dist[i] <= s.radius);
        const seats = near.reduce((a, f) => a + f.ratio, 0) * 1000;  // 1000 хүнд
        parts[s.key][i] = {
          cover: z.residentPop > 0 ? Math.min(100, (seats / s.per1000) * 100) : null,
          count: near.length,
          capacity: near.reduce((a, f) => a + f.capacity, 0),
          seats,
          nearest: mine.length ? Math.min(...mine.map((f) => f.dist[i])) : null,
        };
      });
    } else {
      zones.forEach((z, i) => {
        const d = mine.length ? Math.min(...mine.map((f) => f.dist[i])) : null;
        let cover = 0;
        if (d !== null) {
          cover = d <= s.radius ? 100
            : d >= s.radius * 2 ? 0
            : (1 - (d - s.radius) / s.radius) * 100;
        }
        parts[s.key][i] = {
          cover, count: mine.filter((f) => f.dist[i] <= s.radius).length,
          capacity: 0, nearest: d,
        };
      });
    }
  }

  // --- Жигнэсэн нийлбэр ---
  zones.forEach((z, i) => {
    const detail = {};
    let sum = 0, wsum = 0;
    for (const s of SOCIAL_FACILITIES) {
      const p = parts[s.key][i];
      detail[s.key] = { ...p, label: s.label, radius: s.radius, weight: s.weight };
      if (p.cover !== null) { sum += p.cover * s.weight; wsum += s.weight; }
    }
    z._social = {
      parts: detail,
      // Оршин суугчгүй бүсэд сургууль/цэцэрлэгийн хэрэгцээ утгагүй тул өгөгдөлгүй
      score: z.residentPop > 0 && wsum ? sum / wsum : null,
      totalWeight: totalW,
    };
  });

  return zones;
}

/* ══════════════════ ЭДИЙН ЗАСГИЙН ШИНЖИЛГЭЭ ══════════════════ */

/**
 * ДЭД БҮТЦИЙН НИЙТ ӨРТӨГ — үйлчилгээ (давхарга) тус бүрээр.
 *
 * Геометрийн төрлөөс хамааран нэгж үнийг өөр өөрөөр нийт өртөг болгоно:
 *   цэг     — negj_une нь БҮТЭН өртөг (жишээ: нэг ДХТ = 900 сая ₮)
 *   шугам   — negj_une нь 100 м-ийн өртөг → × urt_m ÷ 100
 *   талбай  — negj_une нь 1 м²-ийн өртөг → × talbai_m2
 *
 * Геометр татахгүй (зөвхөн атрибут) тул хурдан.
 * @returns {{layers:Array, total:number, perHa:number, projectHa:number}}
 */
export async function loadCosts(onProgress = () => {}) {
  const layers = [];

  for (let i = 0; i < COST_LAYERS.length; i++) {
    const L = COST_LAYERS[i];
    onProgress(`Дэд бүтцийн өртөг: ${L.label}…`, 5 + (i / COST_LAYERS.length) * 85);

    // Талбарын нэр давхарга бүрд ижил биш тул тохиргооноос дарж бичиж болно
    const priceF = L.priceField || "negj_une";
    const qtyF = L.qtyField || (L.kind === "line" ? "urt_m" : "talbai_m2");
    const divisor = L.divisor ?? (L.kind === "line" ? LINE_UNIT_M : 1);
    const fields = L.kind === "point" ? [priceF] : [priceF, qtyF];

    let feats = [];
    try {
      feats = await fetchAll(`${SERVICE_ROOT}/${L.id}`, fields);
    } catch (e) {
      console.warn("Өртгийн давхарга татагдсангүй:", L.label, e);
    }

    let total = 0, qty = 0;
    for (const f of feats) {
      const a = f.attributes;
      const unit = a[priceF] || 0;
      if (L.kind === "point") { total += unit; qty += 1; }
      else {
        const q = a[qtyF] || 0;
        total += (unit * q) / divisor;
        qty += q;
      }
    }

    // Нэгж үнэ давхарга дотроо өөр байвал (жишээ: инженерийн бэлтгэл) дунджийг үзүүлнэ
    const prices = feats.map((f) => f.attributes[priceF] || 0);
    const uniform = prices.every((p) => p === prices[0]);

    layers.push({
      ...L,
      count: feats.length,
      unitPrice: prices[0] ?? null,
      uniformPrice: uniform,
      priceField: priceF,
      divisor,
      qty,                       // цэг: ширхэг · шугам: метр/км · талбай: м²
      qtyUnit: L.qtyUnit || (L.kind === "point" ? "ш" : L.kind === "line" ? "м" : "м²"),
      total,
    });
  }

  const total = layers.reduce((a, l) => a + l.total, 0);
  return { layers, total, projectHa: PROJECT_AREA_HA, perHa: total / PROJECT_AREA_HA };
}

/** Барилгын давамгайлах нэгж үнэ (₮/м²) — гулсуурын анхны утга болно */
export function dominantBuildingPrice(buildings) {
  const cnt = {};
  for (const f of buildings) {
    const p = f.attributes[F.price] || 0;
    if (p > 0) cnt[p] = (cnt[p] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return top ? +top[0] : 0;
}

/**
 * Бүс бүрийн эдийн засгийн үзүүлэлт.
 *  zardal  = 1 га-д ногдох төсөв × бүсийн талбай (га)
 *  orlogo  = барилгын нэгж үнэ × нийт талбай (aggregateBuildings-аас)
 *  ashig   = орлого − зардал,  costShare = зардал ÷ орлого × 100
 */
export function computeEconomics(zones, costs, opt = {}) {
  // UI-аас гараар өгсөн утга байвал өгөгдлийнхийг дарж бичнэ
  const perHa = opt.perHa ?? costs.perHa;
  const price = opt.pricePerM2 ?? null;

  for (const z of zones) {
    const cost = perHa * z.areaHa;
    const revenue = price === null ? (z.salesValue || 0) : (z.gfaSaleM2 || 0) * price;
    const revenueRes = price === null ? (z.salesValueRes || 0) : (z.gfaResSaleM2 || 0) * price;
    z.econ = {
      cost,
      revenue, revenueRes,
      profit: revenue - cost,
      profitRes: revenueRes - cost,
      // Зардлын эзлэх хувь. Орлогогүй мөртлөө зардалтай бүс нь "өгөгдөлгүй" биш,
      // ЦЭВЭР АЛДАГДАЛ тул Infinity гэж тэмдэглээд оноололд 0 болно.
      costShare: revenue > 0 ? (cost / revenue) * 100 : (cost > 0 ? Infinity : null),
      roi: revenue > 0 && cost > 0 ? (revenue - cost) / cost : null,
    };
  }
  return zones;
}

/**
 * Зогсоолын хэрэгцээг сонгосон аргаар тооцно.
 * @returns {number|null} шаардагдах зогсоолын тоо
 */
export function parkingNeedOf(z, p) {
  switch (p.source) {
    case "households":
      return z.households > 0 ? z.households * p.perHousehold : null;
    case "population":
      return z.population > 0 ? (z.population * p.per1000) / 1000 : null;
    default:
      return z.normParking > 0 ? z.normParking : null;
  }
}

/**
 * Сонгосон ногоон ангилал / зогсоолын аргаас хамааран
 * түүхий үзүүлэлтүүдийг (raw) дахин бодно.
 */
export function computeRaw(zones, activeGreenCats, parking) {
  for (const z of zones) {
    const greenM2 = Object.entries(z.greenByCat)
      .filter(([cat]) => activeGreenCats.has(cat))
      .reduce((a, [, v]) => a + v, 0);

    z.greenM2 = greenM2;

    // Зогсоол: хангамж = ET_NIIT, хэрэгцээ = сонгосон аргаар
    z.parkingSupply = z.etNiit;
    z.parkingNeed = parkingNeedOf(z, parking);
    z.parkingGap = z.parkingNeed === null ? null : z.parkingSupply - z.parkingNeed;

    z.raw = {
      // FAR, BCR — бүсийн давхаргын өөрийнх нь талбараас (барилгаас бодохгүй).
      // 0 гэдэг нь барилгажилт төлөвлөөгүй гэсэн үг тул "норм хангасан" биш,
      // ӨГӨГДӨЛГҮЙ гэж үзэн оноолтоос хасна.
      far:      z.zoneFar > 0 ? z.zoneFar : null,
      bcr:      z.zoneBcr > 0 ? z.zoneBcr : null,
      parking:  z.parkingNeed > 0 ? (z.parkingSupply / z.parkingNeed) * 100 : null,
      // Нягтшил ба ногоон байгууламж — ЗӨВХӨН оршин суугчаар (хүчин чадал орохгүй)
      green:    z.residentPop > 0 ? greenM2 / z.residentPop : null,
      density:  z.polyHa > 0 && z.residentPop > 0 ? z.residentPop / z.polyHa : null,
      transit:  z._transit,
      park:     z._parkPct,
      engineering: z._engDist,
      // Эдийн засаг — зардлын эзлэх хувь (бага нь сайн)
      econ:     z.econ?.costShare ?? null,
      // Нийгмийн дэд бүтэц — ачаалахад нэг удаа бодогдоно (computeSocialAccess)
      social:   z._social?.score ?? null,
    };
  }
  return zones;
}
