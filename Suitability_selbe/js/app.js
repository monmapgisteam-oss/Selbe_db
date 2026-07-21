/**
 * Сэлбэ — Suitability Modeler
 * Газрын зураг, UI хяналт, дүрслэлийг холбогч үндсэн модуль.
 */
import esriConfig from "@arcgis/core/config.js";
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import * as projection from "@arcgis/core/geometry/projection.js";
import Home from "@arcgis/core/widgets/Home.js";
import ScaleBar from "@arcgis/core/widgets/ScaleBar.js";

import { SERVICES, ENGINEERING_LAYERS, INDICATORS, GREEN_CATEGORIES, PARKING,
         SCORE_LEVELS, levelOf, DENSITY_BY_TYPE, NO_DATA_COLOR as NO_DATA,
         COST_GROUPS, ECON_SCORE, MAP_LAYERS, MAP_GROUPS, SELBE } from "./config.js";
import { loadData, loadCosts, computeRaw, computeEconomics, aggregateBuildings,
         dominantBuildingPrice } from "./data.js";
import { computeAll, scoreColor, scoreLabel, scoreIndicator, normFor, clamp } from "./score.js";

// CDN-ээс ESM ачаалж байгаа тул asset/worker замыг заавал зааж өгнө.
esriConfig.assetsPath = "https://js.arcgis.com/4.33/@arcgis/core/assets";

/* ══════════════════════════ Төлөв ══════════════════════════ */

const state = {
  indicators: INDICATORS.map((i) => ({ ...i })),   // засварлаж болох хуулбар
  parking: { ...PARKING },
  // urban = нийлмэл оноо | indicator = нэг үзүүлэлт | econ = эдийн засаг
  mode: "urban",
  activeIndicator: INDICATORS[0].id,
  costs: null,          // loadCosts()-ийн үр дүн — дэд бүтцийн өртөг
  // Эдийн засгийн гулсуур — null бол өгөгдлийн утгыг хэвээр ашиглана
  econOpt: { pricePerM2: null, perHa: null },
  basePrice: 0,         // барилгын давамгайлах ₮/м² (гулсуурын анхны утга)
  // Ногоон байгууламжид тооцох ангилал — UI-гүй, config.js-ийн default-оор тогтоно
  greenCats: new Set(GREEN_CATEGORIES.filter((c) => c.default).map((c) => c.key)),
  zones: [],
  buildings: [],
  rows: [],
  selected: null,
  filterLevel: null,    // 0..4 — оноогоор шүүх түвшин (одоогоор UI-гүй)
  // Эрэмбэд анхнаасаа зөвхөн "Муу" бүлэг нээлттэй — анхаарал шаардсан бүсийг
  // шууд харуулж, сайн үзүүлэлттэй бүсүүд жагсаалтыг дүүргэхгүй.
  rankCollapsed: new Set(SCORE_LEVELS.map((_, i) => i).filter((i) => SCORE_LEVELS[i].label !== "Муу")),
};

/** Идэвхтэй шүүлтүүрт багтаж байгаа эсэх */
function inFilter(row) {
  if (state.filterLevel === null) return true;
  return levelOf(valueOf(row)) === state.filterLevel;
}

window.__selbe = state; // консолоос загварыг шалгах

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* ══════════════════════ Форматлагчид ══════════════════════ */

const nf = (v, d = 0) =>
  v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString("mn-MN", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Үзүүлэлтийн нэгжийг зайтайгаар */
const unitOf = (ind) => (ind.unit ? " " + ind.unit : "");

/** Нэгж үнэ — товчлолгүй, бүтэн тоогоор (жишээ: 2,500,000,000 ₮) */
const unitMoney = (v) =>
  v === null || v === undefined || !isFinite(v) ? "—" : `${nf(v)} ₮`;

/** Мөнгөн дүнг уншихад ойлгомжтой нэгжээр (тэрбум / сая / мянга ₮) */
function money(v, d = 1) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}${nf(a / 1e9, d)} тэрбум₮`;
  if (a >= 1e6) return `${s}${nf(a / 1e6, d)} сая₮`;
  if (a >= 1e3) return `${s}${nf(a / 1e3, 0)} мянга₮`;
  return `${s}${nf(a, 0)}₮`;
}

/**
 * Нормын шаардлагыг нэг мөрөнд бичнэ.
 * Дагаврын эгшиг зохицол (м-ээс / хүнээс / хувиас) өөр өөр байдаг тул
 * бичгээр биш ≥ / ≤ тэмдгээр илэрхийлэв.
 */
function normText(ind) {
  if (ind.byType) {
    const vals = Object.values(DENSITY_BY_TYPE).map((v) => v[ind.byType]);
    return `бүсийн төрлөөр ≤ ${nf(Math.min(...vals), ind.decimals)} … ${nf(Math.max(...vals), ind.decimals)}${unitOf(ind)}`;
  }
  if (ind.mode === "band") {
    return `${nf(ind.optMin, ind.decimals)} – ${nf(ind.optMax, ind.decimals)}${unitOf(ind)}`;
  }
  if (ind.mode === "higher") return `≥ ${nf(ind.target, ind.decimals)}${unitOf(ind)}`;
  return `≤ ${nf(ind.best, ind.decimals)}${unitOf(ind)}`;
}

/* ══════════════════════ Газрын зураг ══════════════════════ */

let view, zoneLayer, labelLayer, buildingLayer;
const contextLayers = [];

/* ─────────────── Барилгын дүрслэл ─────────────── */

/** Барилгын кирилл талбарын нэр (hover панельд шууд уншина) */
const BF = {
  gfa: "Барилгын_нийт_талбай_m2",
  purpose: "Зориулалт_m",
};

const STATUS_COLORS = {
  "Төлөвлөсөн":      [96, 165, 250],
  "Баригдаж байгаа": [251, 146, 60],
  "Одоо байгаа":     [134, 139, 150],
};

// Дүүргэлт 70% тунгалаг (alpha 0.30) — доорх бүсийн оноо харагдана. Хүрээ хэвээр.
const BLD_ALPHA = 0.30;
const BLD_ALPHA_DIM = 0.15;   // хасагдсан / мэдээлэлгүй

// Хүрээ нь дүүргэлттэй ижил өнгөтэй, зөвхөн тод (alpha ×3) байдлаар зурагдана.
const bldFill = (c, a = BLD_ALPHA) => ({
  type: "simple-fill", color: [...c, a],
  outline: { color: [...c, Math.min(1, a * 3)], width: 0.4 },
});

/** Барилгын renderer — Barilga_ty (төлөв)-өөр өнгөлнө */
function buildingRenderer() {
  return {
    type: "unique-value", field: "Barilga_ty",
    defaultSymbol: bldFill([203, 213, 225], BLD_ALPHA_DIM), defaultLabel: "Бусад",
    uniqueValueInfos: Object.entries(STATUS_COLORS)
      .map(([value, c]) => ({ value, label: value, symbol: bldFill(c) })),
  };
}

function buildMap() {
  zoneLayer = new GraphicsLayer({ title: "Тохиромжтой байдал" });
  labelLayer = new GraphicsLayer({ title: "Шошго" });

  // Бүс ба шошго нь дотоод GraphicsLayer боловч "Давхарга" картад
  // бусадтай адил checkbox-той байна
  zoneLayer._def = { title: "Бүс — үнэлгээний өнгө", kind: "fill",
                     color: [79, 209, 197], group: "base" };
  labelLayer._def = { title: "Бүсийн нэр (шошго)", kind: "point",
                      color: [230, 237, 243], group: "base" };

  // Үйлчилгээний БҮХ давхарга (config.js → MAP_LAYERS)
  const ctxDefs = MAP_LAYERS.map((l) => ({ ...l, url: `${SELBE}/${l.id}` }));

  for (const d of ctxDefs) {
    const isBld = d.kind === "building";
    const lyr = new FeatureLayer({
      url: d.url,
      title: d.title,
      visible: d.on,
      outFields: ["*"],
      renderer: isBld ? buildingRenderer() : rendererFor(d),
      popupEnabled: false,   // popup биш — hover панель ашиглана
    });
    lyr._def = d;
    contextLayers.push(lyr);
    if (isBld) buildingLayer = lyr;
  }

  // Барилгыг бүсийн полигоны ДЭЭР зурна — эс тэгвээс бүсийн будалт дор дарагдана
  const under = contextLayers.filter((l) => l !== buildingLayer);
  const map = new Map({
    basemap: "dark-gray-vector",
    layers: [...under, zoneLayer, buildingLayer, labelLayer],
  });

  view = new MapView({
    container: "viewDiv",
    map,
    center: [106.9, 47.95],
    zoom: 14,
    constraints: { snapToZoom: false },
    padding: { left: 0, bottom: 0 },
    popup: { dockEnabled: false, autoOpenEnabled: false },
  });

  window.__view = view; // консолоос дүрслэлийг шалгах
  view.ui.move("zoom", "top-right");
  view.ui.add(new Home({ view }), "top-right");
  view.ui.add(new ScaleBar({ view, unit: "metric", style: "line" }), "bottom-right");

  view.on("click", async (e) => {
    const hit = await view.hitTest(e, { include: [zoneLayer] });
    const g = hit.results.find((r) => r.graphic?.attributes?.zoneId)?.graphic;
    select(g ? g.attributes.zoneId : null);
  });

  bindMapHover();
  return view.when();
}

/* ─────────────── Газрын зургийн hover панель ─────────────── */

/**
 * Хулганы доорх обьектын мэдээллийг хажууд нь харуулна.
 * Барилга бүсийн дээр зурагддаг тул эхлээд барилгыг, байхгүй бол бүсийг үзүүлнэ.
 * hitTest нь async тул сүүлийн хүсэлтийг л хүлээн авахаар token-оор хамгаална.
 */
function bindMapHover() {
  const tip = $("#mapTip");
  let token = 0;
  let lastKey = null;

  view.on("pointer-move", (e) => {
    const my = ++token;
    view.hitTest(e, { include: [buildingLayer, zoneLayer] }).then((hit) => {
      if (my !== token) return;   // хожуу ирсэн хуучин хариу
      const bld = hit.results.find((r) => r.graphic?.layer === buildingLayer)?.graphic;
      const zone = hit.results.find((r) => r.graphic?.attributes?.zoneId)?.graphic;

      let key = null, html = null;
      if (bld) {
        key = `b${bld.attributes.OBJECTID}`;
        if (key !== lastKey) html = buildingTipHtml(bld.attributes);
      } else if (zone) {
        const r = state.rows.find((x) => x.id === zone.attributes.zoneId);
        if (r) { key = `z${r.id}`; if (key !== lastKey) html = zoneTipHtml(r); }
      }

      if (!key) {
        tip.hidden = true; lastKey = null;
        view.container.style.cursor = "";
        return;
      }
      view.container.style.cursor = "pointer";
      if (html !== null) { tip.innerHTML = html; lastKey = key; }
      tip.hidden = false;
      placeTip(tip, e.x, e.y);
    }).catch(() => { /* view устсан үед */ });
  });

  view.on("pointer-leave", () => { tip.hidden = true; lastKey = null; });
}

/** Бүсийн hover панель — оноо, суурь тоо, норм зөрчсөн үзүүлэлтүүд */
function zoneTipHtml(r) {
  const score = valueOf(r);
  const col = scoreColor(score);

  // Норм хангалтыг тоолж, зөрчсөнийг нь жагсаана
  let pass = 0, total = 0;
  const failed = [];
  for (const ind of state.indicators) {
    const p = r.urbanParts[ind.id];
    if (!p || p.value === null || p.value === undefined) continue;
    const eff = p.norm ?? ind;
    const v = p.value;
    const ok = eff.mode === "band" ? (v >= eff.optMin && v <= eff.optMax)
      : eff.mode === "higher" ? v >= eff.target : v <= eff.best;
    total++;
    if (ok) pass++;
    else failed.push({ name: ind.short ?? ind.name, v: nf(v, ind.decimals) + (ind.unit ? " " + ind.unit : "") });
  }

  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `
    <div class="t">
      <b>${r.id}</b>
      <span class="st" style="background:${col}">${score === null ? "—" : Math.round(score)}</span>
    </div>
    <div class="sub2">${r.type} · ${nf(r.polyHa, 2)} га · ${scoreLabel(score)}</div>
    <dl>
      ${row("Оршин суугч", nf(r.residentPop))}
      ${row("Өрх", nf(r.households))}
      ${row("Барилга", nf(r.buildingCount))}
      ${row("Норм хангасан", `<b style="color:${pass === total ? "#4ade80" : "#f87171"}">${pass} / ${total}</b>`)}
    </dl>
    ${failed.length ? `<div class="fails">${failed.map((f) =>
      `<div><span>✗ ${f.name}</span><em>${f.v}</em></div>`).join("")}</div>` : ""}`;
}

/** Панелийг заагчийн хажууд, зургийн хүрээнээс гарахгүйгээр байрлуулна */
function placeTip(tip, x, y) {
  const pad = 14;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const box = $("#mapWrap").getBoundingClientRect();
  let left = x + pad, top = y + pad;
  if (left + w > box.width - 6) left = x - w - pad;    // баруун ирмэг
  if (top + h > box.height - 6) top = y - h - pad;     // доод ирмэг
  tip.style.left = `${Math.max(6, left)}px`;
  tip.style.top = `${Math.max(6, top)}px`;
}

function buildingTipHtml(a) {
  const st = (a.Barilga_ty || "").trim();
  const purpose = (a[BF.purpose] || "").trim() || "Тодорхойгүй";
  const c = STATUS_COLORS[st] || [203, 213, 225];
  const pop = a.Total_population || 0;
  const isRes = /орон сууц|house/i.test(purpose);

  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  return `
    <div class="t">
      <b>${purpose}</b>
      ${st ? `<span class="st" style="background:rgb(${c.join(",")})">${st}</span>` : ""}
    </div>
    <dl>
      ${row("Нийт талбай", nf(a[BF.gfa]) + " м²")}
      ${row("Давхар", a["Давхрын_тоо_max"] || "")}
      ${row("Өрх", a.Urhiin_too ? nf(a.Urhiin_too) : "")}
      ${row(isRes ? "Оршин суугч" : "Хүчин чадал", pop ? nf(pop) : "")}
      ${row("Зогсоол", a.Parking ? nf(a.Parking) : "")}
      ${row("Бүс", a.ZONE_ID || "—")}
    </dl>`;
}

function rendererFor(d) {
  const c = d.color;
  switch (d.kind) {
    case "line":
      // 7 polyline давхарга (автобусны чиглэл + инженерийн 6) — нарийхан зурна
      return { type: "simple", symbol: { type: "simple-line", color: [...c, 0.95], width: 0.75 } };
    case "point":
      return { type: "simple", symbol: { type: "simple-marker", style: "circle", size: 7,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: 1.2 } } };
    case "point-lg":
      return { type: "simple", symbol: { type: "simple-marker", style: "diamond", size: 12,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: 1.4 } } };
    case "hatch":
      return { type: "simple", symbol: { type: "simple-fill", style: "diagonal-cross",
        color: [...c, 0.55], outline: { color: [...c, 0.75], width: 0.8 } } };
    default:
      return { type: "simple", symbol: { type: "simple-fill", color: [...c, 0.35],
        outline: { color: [...c, 0.9], width: 0.6 } } };
  }
}

/* ══════════════════ Дүрслэл — бүсийн будалт ══════════════════ */

// Бүсийн дүүргэлтийн тунгалаг байдал — доорх суурь зураг, барилга харагдана
const ZONE_ALPHA = 0.5;
const ZONE_ALPHA_NODATA = 0.2;

/** Сонгосон бүсийн хүрээний өнгө — cyan */
const SELECT_COLOR = [34, 211, 238, 1];

/**
 * Эдийн засгийн оноо — дэд бүтцийн зардал борлуулалтын үнэлгээний хэдэн хувийг
 * эзэлж байгаагаар (бага нь сайн). 100% буюу түүнээс дээш = ашиггүй → 0 оноо.
 */
const econScore = (row) => {
  const s = row.econ?.costShare;
  if (s === Infinity) return 0;          // орлогогүй, зөвхөн зардалтай бүс
  return scoreIndicator(s ?? null, ECON_SCORE);
};

/** Зардлын эзлэх хувийг бичихэд — орлогогүй бүсийг үгээр */
const shareText = (s) =>
  s === null || s === undefined ? "—" : s === Infinity ? "орлогогүй" : nf(s, 1) + "%";

/** Одоогийн горимд харгалзах оноог буцаана */
function valueOf(row) {
  switch (state.mode) {
    case "urban":   return row.urban;
    case "econ":    return econScore(row);
    case "indicator": {
      const ind = state.indicators.find((i) => i.id === state.activeIndicator);
      return scoreIndicator(row.raw[ind.id], normFor(ind, row.type));
    }
    default: return row.urban;
  }
}

function paintMap() {
  zoneLayer.removeAll();
  labelLayer.removeAll();

  // Сонгосон бүсийг хамгийн сүүлд зурж хүрээ нь хөршүүддээ дарагдахгүй байлгана
  const ordered = [...state.rows].sort(
    (a, b) => (a.id === state.selected ? 1 : 0) - (b.id === state.selected ? 1 : 0));

  for (const r of ordered) {
    if (!r.displayGeom) continue;
    const score = valueOf(r);
    const col = scoreColor(score);
    const isSel = state.selected === r.id;
    const shown = inFilter(r);
    // "Багц" бүсүүд нь төлөвлөлтийн үндсэн нэгж тул илүү тод харагдана
    const isBagts = /багц/i.test(r.id);

    // Бүс сонгогдсон үед бусад нь бүдгэрч, сонгосон нь тод үлдэнэ
    const hasSel = state.selected !== null;
    let alpha = score === null ? ZONE_ALPHA_NODATA : ZONE_ALPHA;
    if (!shown) alpha = 0.06;
    else if (hasSel && !isSel) alpha *= 0.45;

    zoneLayer.add(new Graphic({
      geometry: r.displayGeom,
      attributes: { zoneId: r.id, score: score ?? -1 },
      symbol: {
        type: "simple-fill",
        color: hexToRgba(col, alpha),
        outline: {
          // Хүрээ нь дүүргэлттэй ижил өнгөтэй, зөвхөн бага зэрэг тод.
          // Сонгосон бүс нь cyan хүрээгээрээ ялгарна (ногоон дүүргэлт дээр ч тодорно).
          color: isSel ? SELECT_COLOR : hexToRgba(col, Math.min(1, alpha * 1.35)),
          width: isSel ? 1.6 : 0.6,
        },
      },
    }));

    if (shown) {
      // Зөвхөн бүсийн НЭР — оноо нь өнгө, эрэмбэ, дэлгэрэнгүйгээс уншигдана
      const size = isSel ? 11 : isBagts ? 9 : 7.5;
      labelLayer.add(new Graphic({
        geometry: r.displayGeom.centroid,
        symbol: {
          type: "text",
          color: isSel ? "#ffffff" : isBagts ? "#ffeeba" : "#dbe4ee",
          haloColor: isSel ? "#000000" : "#0a0e13",
          haloSize: isSel ? 2.2 : 1.1,
          text: r.id,
          font: { size, family: "Segoe UI", weight: "bold" },
        },
      }));
    }
  }
}

function hexToRgba(hex, a) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];
}

/* ══════════════════════ UI — баруун талбар ══════════════════════ */

function buildWeightUI() {
  const host = $("#weightList");
  host.innerHTML = "";

  for (const ind of state.indicators) {
    const row = el("div", "w-row");

    // 1) Нэр + жингийн хувь
    const top = el("div", "w-top");
    top.append(el("span", "nm", ind.name), el("span", "pct", ""));
    row.append(top);

    // 2) Жингийн гулсуур
    const slider = el("input", "w-slider");
    slider.type = "range"; slider.min = 0; slider.max = 40; slider.step = 1; slider.value = ind.weight;
    slider.oninput = () => { ind.weight = +slider.value; refresh(); };
    row.append(slider);

    // 3) Норм нэг мөрөнд ойлгомжтойгоор
    const normLine = el("div", "w-req");
    const setNormLine = () => { normLine.innerHTML = `<b>Норм:</b> ${normText(ind)}`; };
    setNormLine();
    row.append(normLine);

    // 4) Эх сурвалж
    row.append(el("div", "w-src", ind.norm));

    if (ind.byType) {
      // FAR / BCR — бүсийн төрөл бүрд өөр дээд хязгаартай тул хүснэгтээр үзүүлнэ
      const tbl = el("div", "w-types");
      tbl.innerHTML = Object.entries(DENSITY_BY_TYPE)
        .map(([t, v]) => `<div><span>${t}</span><b>≤ ${nf(v[ind.byType], ind.decimals)}${unitOf(ind)}</b></div>`)
        .join("");
      row.append(tbl);
    } else {
      // Босго утгыг засварлах талбарууд — гарчиг нь юу гэсэн үг болохыг тайлбарлана
      const fields = ind.mode === "band"
        ? [["optMin", "Нормын доод"], ["optMax", "Нормын дээд"],
           ["hardMin", "0 оноо (доош)"], ["hardMax", "0 оноо (дээш)"]]
        : ind.mode === "higher"
        ? [["target", "Нормын доод"], ["hardMin", "0 оноо"]]
        : [["best", "Нормын дээд"], ["hardMax", "0 оноо"]];

      const thr = el("div", "w-thr");
      for (const [key, label] of fields) {
        const wrap = el("label", null, `<span>${label}</span>`);
        const inp = el("input");
        inp.type = "number"; inp.step = "any"; inp.value = ind[key];
        inp.onchange = () => {
          const v = parseFloat(inp.value);
          if (isFinite(v)) { ind[key] = v; setNormLine(); refresh(); }
        };
        wrap.append(inp);
        thr.append(wrap);
      }
      row.append(thr);
    }

    row._ind = ind;
    row._pct = top.querySelector(".pct");
    host.append(row);
  }
  updateWeightPercents();
}

function updateWeightPercents() {
  const total = state.indicators.reduce((a, i) => a + i.weight, 0) || 1;
  document.querySelectorAll("#weightList .w-row").forEach((row) => {
    row._pct.textContent = `${((row._ind.weight / total) * 100).toFixed(0)}%`;
    row.style.opacity = row._ind.weight === 0 ? 0.45 : 1;
  });
}

const PARK_SOURCES = [
  { key: "norm",       label: "Эх өгөгдлийн норм (NORM_ZOGS)",   short: "NORM_ZOGS" },
  { key: "households", label: "Өрхийн тоогоор (өрх × коэф.)",    short: "өрхөөр" },
  { key: "population", label: "Хүн амаар (1000 хүнд ногдохоор)", short: "хүн амаар" },
];
const parkSrc = () => PARK_SOURCES.find((s) => s.key === state.parking.source);

function buildParkingUI() {
  const host = $("#parkSource");
  host.innerHTML = "";
  for (const s of PARK_SOURCES) {
    const lab = el("label", "chk");
    const inp = el("input");
    inp.type = "radio"; inp.name = "parkSrc"; inp.checked = state.parking.source === s.key;
    inp.onchange = () => { state.parking.source = s.key; syncParkingCoef(); recomputeRaw(); };
    lab.append(inp, el("span", null, s.label));
    host.append(lab);
  }

  const coef = $("#parkCoef");
  coef.oninput = () => {
    if (state.parking.source === "households") state.parking.perHousehold = +coef.value;
    else state.parking.per1000 = +coef.value;
    syncParkingCoef();
    recomputeRaw();
  };
  syncParkingCoef();
}

/** Коэффициентийн гулсуурыг сонгосон аргад тохируулна */
function syncParkingCoef() {
  const p = state.parking;
  const row = $("#parkCoefRow");
  row.hidden = p.source === "norm";
  if (row.hidden) return;

  const coef = $("#parkCoef");
  if (p.source === "households") {
    coef.min = 0.2; coef.max = 2; coef.step = 0.05; coef.value = p.perHousehold;
    $("#parkCoefLabel").textContent = "Нэг өрхөд ногдох зогсоол";
    $("#parkCoefVal").textContent = p.perHousehold.toFixed(2);
  } else {
    coef.min = 50; coef.max = 600; coef.step = 10; coef.value = p.per1000;
    $("#parkCoefLabel").textContent = "1000 хүнд ногдох зогсоол";
    $("#parkCoefVal").textContent = p.per1000;
  }
}

/** Тохиргоо өөрчлөгдөхөд барилгын нэгтгэлт + түүхий утгыг дахин бодно */
function recomputeRaw() {
  aggregateBuildings(state.zones, state.buildings);
  if (state.costs) computeEconomics(state.zones, state.costs, state.econOpt);
  computeRaw(state.zones, state.greenCats, state.parking);
  refresh();
}

/** Хэрэгцээг ямар томьёогоор бодсоныг үгээр бичнэ */
function parkingFormula(rows) {
  const p = state.parking;
  const hh = rows.reduce((a, r) => a + (r.households || 0), 0);
  const pop = rows.reduce((a, r) => a + (r.population || 0), 0);
  switch (p.source) {
    case "households":
      return `${nf(hh)} өрх × ${p.perHousehold.toFixed(2)} зогсоол = <b>${nf(hh * p.perHousehold)}</b>`;
    case "population":
      return `${nf(pop)} хүн × ${p.per1000} ÷ 1000 = <b>${nf((pop * p.per1000) / 1000)}</b>`;
    default:
      return `Эх өгөгдлийн <b>NORM_ZOGS</b> талбарын нийлбэр`;
  }
}

function renderParkingSummary(rows) {
  const supply = rows.reduce((a, r) => a + (r.parkingSupply || 0), 0);
  const need = rows.reduce((a, r) => a + (r.parkingNeed || 0), 0);
  const il = rows.reduce((a, r) => a + (r.etIl || 0), 0);
  const dald = rows.reduce((a, r) => a + (r.etDald || 0), 0);
  const gap = supply - need;

  const withNeed = rows.filter((r) => r.parkingGap !== null);
  const short = withNeed.filter((r) => r.parkingGap < 0).length;

  const pct = need > 0 ? (supply / need) * 100 : null;
  // Хангалтын өнгө нь газрын зураг, KPI-тай ижил оноолтын шатлалаас гарна
  const ind = state.indicators.find((i) => i.id === "parking");
  const col = scoreColor(scoreIndicator(pct, ind));
  const barPct = pct === null ? 0 : clamp(pct, 0, 100);

  $("#parkSummary").innerHTML = `
    <div class="park-head">
      <div class="park-pct" style="color:${col}">${pct === null ? "—" : Math.round(pct)}<i>%</i></div>
      <div class="park-head-txt">
        <b>Хэрэгцээний хангалт</b>
        <span>Байгаа <b>${nf(supply)}</b> · шаардлагатай <b>${nf(need)}</b> зогсоол</span>
      </div>
    </div>

    <div class="park-bar" title="Байгаа зогсоол нь хэрэгцээний хэдэн хувийг хангаж байна">
      <span style="width:${barPct}%;background:${col}"></span>
    </div>
    <div class="park-scale"><span>0%</span><span>Норм 100%</span></div>

    <div class="park-formula">Хэрэгцээ: ${parkingFormula(rows)}</div>

    <div class="fin-summary">
      <div><span>Байгаа — ил / далд</span><b>${nf(il)} / ${nf(dald)}</b></div>
      <div><span>${gap >= 0 ? "Илүүдэл" : "Дутагдал"}</span>
           <b class="${gap >= 0 ? "pos" : "neg"}">${gap >= 0 ? "+" : "−"}${nf(Math.abs(gap))}</b></div>
      <div><span>Дутагдалтай бүс</span>
           <b class="${short ? "neg" : "pos"}">${short} / ${withNeed.length}</b></div>
      <div><span>Хангалттай бүс</span>
           <b class="pos">${withNeed.length - short} / ${withNeed.length}</b></div>
    </div>`;
}

/* ══════════════════ Эдийн засгийн шинжилгээ ══════════════════ */

/**
 * Дэд бүтцийн нийт өртөг, 1 га-д ногдох төсөв, төслийн ашиг/алдагдал.
 * Зардал нь бүс сонголтоос үл хамаарах ТОГТМОЛ (төслийн хэмжээнд бодогдоно),
 * харин орлого нь харуулж буй бүсүүдээс хамаарна.
 */
function renderEconomics(rows) {
  const c = state.costs;
  if (!c) return;

  const revenue = rows.reduce((a, r) => a + (r.econ?.revenue || 0), 0);
  const revenueRes = rows.reduce((a, r) => a + (r.econ?.revenueRes || 0), 0);
  const zoneCost = rows.reduce((a, r) => a + (r.econ?.cost || 0), 0);
  const profit = revenue - zoneCost;
  const share = revenue > 0 ? (zoneCost / revenue) * 100 : null;
  const col = scoreColor(scoreIndicator(share, ECON_SCORE));

  $("#econSummary").innerHTML = `
    <div class="econ-head">
      <div class="econ-big">
        <span>Дэд бүтцийн нийт өртөг</span>
        <b>${money(c.total)}</b>
      </div>
      <div class="econ-big">
        <span>1 га-д ногдох төсөв</span>
        <b>${money(c.perHa)}<i> / га</i></b>
      </div>
    </div>
    <p class="muted xsmall">
      ${c.layers.length} үйлчилгээний өртгийн нийлбэрийг төслийн
      <b>${nf(c.projectHa)} га</b> талбайд хуваасан. Бүс бүрийн зардал =
      1 га-гийн төсөв × тухайн бүсийн талбай.<br>
      Орлогод <b>"Одоо байгаа"</b> барилга ороогүй — аль хэдийн борлуулагдсан.
    </p>

    <div class="fin-summary">
      <div><span>Бүсүүдэд ногдох зардал</span><b>${money(zoneCost)}</b></div>
      <div><span>Борлуулалтын үнэлгээ</span><b>${money(revenue)}</b></div>
      <div><span>${profit >= 0 ? "Ашиг" : "Алдагдал"}</span>
           <b class="${profit >= 0 ? "pos" : "neg"}">${money(profit)}</b></div>
      <div><span>Зардлын эзлэх хувь</span>
           <b style="color:${col}">${shareText(share)}</b></div>
      <div><span>Үүнээс: орон сууц</span><b>${money(revenueRes)}</b></div>
      <div><span>Ашигтай бүс</span><b class="pos">${
        rows.filter((r) => r.econ && r.econ.profit > 0).length} / ${rows.length}</b></div>
    </div>`;

  // --- Үйлчилгээ тус бүрийн өртгийн график ---
  const sorted = [...c.layers].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total || 1;
  $("#econChart").innerHTML = sorted.map((l) => {
    const g = COST_GROUPS[l.group];
    const pct = (l.total / c.total) * 100;
    return `
      <div class="econ-row" title="${l.label} — ${g.label}">
        <div class="econ-row-top">
          <i style="background:${g.color}"></i>
          <span class="nm">${l.label}</span>
          <b>${money(l.total)}</b>
          <em>${nf(pct, 1)}%</em>
        </div>
        <div class="econ-bar"><i style="width:${(l.total / max) * 100}%;background:${g.color}"></i></div>
        <div class="econ-meta">${
          l.kind === "point" ? `${nf(l.count)} ш × ${unitMoney(l.unitPrice)}`
          : !l.uniformPrice ? `${nf(l.qty, 0)} ${l.qtyUnit} · нэгж үнэ хувьсах`
          : l.kind === "line"
            ? `${nf(l.qty, l.divisor === 1 ? 2 : 0)} ${l.qtyUnit} × ${unitMoney(l.unitPrice)}/${
                l.divisor === 1 ? l.qtyUnit : l.divisor + "м"}`
          : `${nf(l.qty, 0)} м² × ${unitMoney(l.unitPrice)}/м²`}</div>
      </div>`;
  }).join("") + econGroupTotals(c);
}

/** Бүлгээр (тээвэр, дулаан, ус…) нэгтгэсэн дүн */
function econGroupTotals(c) {
  const by = {};
  for (const l of c.layers) by[l.group] = (by[l.group] || 0) + l.total;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const g = COST_GROUPS[k];
    return `<div class="econ-grp">
      <i style="background:${g.color}"></i><span>${g.label}</span>
      <b>${money(v)}</b><em>${nf((v / c.total) * 100, 1)}%</em>
    </div>`;
  }).join("");
  return `<div class="sub-label">Салбараар</div>${rows}`;
}

/**
 * Давхаргын жагсаалт — бүлгээр (тээвэр, дулаан, ус…) эрэмбэлж,
 * бүлгийн гарчгаас бүх давхаргыг нэг дор асаах/унтраах боломжтой.
 */
/* ── Эдийн засгийн гулсуур: 1 м² үнэ ба 1 га-д ногдох төсөв ── */

/** Гулсуурын одоогийн утга (сая ₮/м², тэрбум ₮/га) */
const econPrice = () => state.econOpt.pricePerM2 ?? state.basePrice;
const econPerHa = () => state.econOpt.perHa ?? (state.costs?.perHa ?? 0);

function buildEconTuneUI() {
  const price = $("#priceSlider"), perHa = $("#perHaSlider");
  const base = state.costs?.perHa ?? 0;

  // Хэмжээс: үнэ — сая ₮/м², төсөв — тэрбум ₮/га (өгөгдлийн утга дунд орох хүрээтэй)
  price.max = Math.max(10, Math.ceil((state.basePrice / 1e6) * 2));
  perHa.max = Math.max(40, Math.ceil((base / 1e9) * 1.5));

  const sync = () => {
    price.value = econPrice() / 1e6;
    perHa.value = econPerHa() / 1e9;
    $("#priceVal").textContent = `${nf(econPrice() / 1e6, 1)} сая ₮/м²`;
    $("#perHaVal").textContent = `${nf(econPerHa() / 1e9, 1)} тэрбум ₮/га`;
  };

  const apply = () => {
    state.econOpt.pricePerM2 = +price.value * 1e6;
    state.econOpt.perHa = +perHa.value * 1e9;
    computeEconomics(state.zones, state.costs, state.econOpt);
    computeRaw(state.zones, state.greenCats, state.parking);
    sync();
    refresh();
  };

  price.oninput = apply;
  perHa.oninput = apply;

  // "Бүсүүдийн ашиг / алдагдал" жагсаалтыг хураах — төлөв нь хадгалагдана
  const card = $("#econTuneCard"), toggle = $("#profitToggle");
  const PKEY = "profitChart";
  const setOff = (off) => {
    card.classList.toggle("pc-off", off);
    toggle.classList.toggle("collapsed", off);
    toggle.title = off ? "Дэлгэх" : "Хураах";
  };
  setOff(collapsedStore().has(PKEY));
  toggle.onclick = () => {
    const off = !card.classList.contains("pc-off");
    setOff(off);
    const s = collapsedStore();
    off ? s.add(PKEY) : s.delete(PKEY);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch {}
  };
  $("#econReset").onclick = () => {
    state.econOpt = { pricePerM2: null, perHa: null };
    computeEconomics(state.zones, state.costs, state.econOpt);
    computeRaw(state.zones, state.greenCats, state.parking);
    sync();
    refresh();
  };
  sync();
}

/** Гулсуурын тохиргоонд харгалзах нийт дүн */
function renderEconTune(rows) {
  const host = $("#econTuneSummary");
  if (!host || !state.costs) return;
  const cost = rows.reduce((a, r) => a + (r.econ?.cost || 0), 0);
  const rev = rows.reduce((a, r) => a + (r.econ?.revenue || 0), 0);
  const profit = rev - cost;
  const changed = state.econOpt.pricePerM2 !== null;

  host.innerHTML = `
    <div><span>Нийт зардал</span><b>${money(cost)}</b></div>
    <div><span>Нийт орлого</span><b>${money(rev)}</b></div>
    <div><span>${profit >= 0 ? "Ашиг" : "Алдагдал"}</span>
         <b class="${profit >= 0 ? "pos" : "neg"}">${money(profit)}</b></div>
    <div><span>Өгөгдлийн утга</span><b class="${changed ? "neg" : "pos"}">${
      changed ? "өөрчилсөн" : "хэвээр"}</b></div>`;
}

/**
 * Бүсүүдийн ашиг/алдагдал — зүүн талын "үйлчилгээний өртөг" графиктай ижил
 * загвартай мөрүүд: бүсийн нэр, дүн, эзлэх хувь, урттай багана.
 * Мөр дээр дарж бүсийг сонгоно.
 */
function renderProfitChart(rows) {
  const host = $("#profitChart");
  if (!host) return;
  const data = rows.filter((r) => r.econ)
    .sort((a, b) => b.econ.profit - a.econ.profit);
  if (!data.length) { host.innerHTML = ""; return; }

  const maxAbs = Math.max(...data.map((r) => Math.abs(r.econ.profit))) || 1;
  const win = data.filter((r) => r.econ.profit > 0);
  const totalWin = win.reduce((a, r) => a + r.econ.profit, 0) || 1;
  const totalLoss = data.filter((r) => r.econ.profit < 0)
    .reduce((a, r) => a + r.econ.profit, 0);

  host.innerHTML = data.map((r) => {
    const p = r.econ.profit;
    const col = p >= 0 ? "#4ade80" : "#ef4444";
    const pct = p >= 0 ? (p / totalWin) * 100 : (p / (totalLoss || 1)) * 100;
    const sel = state.selected === r.id;
    return `
      <div class="econ-row${sel ? " on" : ""}" data-zone="${r.id}" title="${r.type}">
        <div class="econ-row-top">
          <i style="background:${col}"></i>
          <span class="nm">${r.id}</span>
          <b style="color:${col}">${money(p)}</b>
          <em>${nf(pct, 1)}%</em>
        </div>
        <div class="econ-bar"><i style="width:${(Math.abs(p) / maxAbs) * 100}%;background:${col}"></i></div>
        <div class="econ-meta">${nf(r.areaHa, 2)} га · зардал ${money(r.econ.cost)} · орлого ${money(r.econ.revenue)}</div>
      </div>`;
  }).join("") + `
    <div class="pchart-lgd">
      <span><b class="pos">${win.length}</b> ашигтай</span>
      <span><b class="neg">${data.length - win.length}</b> алдагдалтай</span>
    </div>`;

  host.querySelectorAll(".econ-row[data-zone]").forEach((n) =>
    (n.onclick = () => select(n.dataset.zone, true)));
}

function buildContextUI() {
  const host = $("#contextToggles");
  host.innerHTML = "";

  // ⚠ Энэ файлд "Map" нэр ArcGIS-ийн Map классаар эзэлэгдсэн тул энгийн объект ашиглана
  const byGroup = {};
  for (const lyr of [zoneLayer, labelLayer, ...contextLayers]) {
    const g = lyr._def.group || "base";
    (byGroup[g] ||= []).push(lyr);
  }

  for (const [key, label] of Object.entries(MAP_GROUPS)) {
    const layers = byGroup[key];
    if (!layers?.length) continue;

    const head = el("div", "lyr-grp");
    const sync = () => {
      const on = layers.filter((l) => l.visible).length;
      head.innerHTML = `<span>${label}</span><b>${on}/${layers.length}</b>`;
      head.title = on ? "Бүгдийг унтраах" : "Бүгдийг асаах";
    };
    head.onclick = () => {
      const turnOn = layers.every((l) => !l.visible);
      layers.forEach((l) => (l.visible = turnOn));
      host.querySelectorAll("input[type=checkbox]").forEach((n) => {
        if (n._lyr) n.checked = n._lyr.visible;
      });
      Object.keys(byGroup).forEach((k) => host.querySelector(`[data-sync="${k}"]`)?._sync());
    };
    head.dataset.sync = key;
    head._sync = sync;
    sync();
    host.append(head);

    for (const lyr of layers) {
      const d = lyr._def;
      const lab = el("label", "chk");
      const inp = el("input");
      inp.type = "checkbox"; inp.checked = lyr.visible; inp._lyr = lyr;
      inp.onchange = () => { lyr.visible = inp.checked; sync(); };
      const mark = el("span", d.kind === "line" ? "swatch" : "dot");
      mark.style.background = `rgb(${d.color.join(",")})`;
      lab.append(inp, mark, el("span", null, d.title));
      host.append(lab);
    }
  }
}

/**
 * Үзүүлэлт сонгох жагсаалт — сонгохын зэрэгцээ дүүрэгт хэдэн бүс норм
 * хангаж байгааг нэг дор харуулна. Ингэснээр аль үзүүлэлт хамгийн
 * бэрхшээлтэй байгаа нь шууд харагдана.
 */
function buildIndicatorPicker() {
  const host = $("#indicatorList");
  const totalW = state.indicators.reduce((a, i) => a + i.weight, 0) || 1;

  host.innerHTML = state.indicators.map((ind) => {
    let pass = 0, total = 0;
    for (const r of state.rows) {
      const p = r.urbanParts[ind.id];
      if (!p || p.value === null || p.value === undefined) continue;
      total++;
      if (p.score >= 99.9) pass++;         // норм хангасан = 100 оноо
    }
    const pct = total ? (pass / total) * 100 : 0;
    const on = state.activeIndicator === ind.id;
    return `
      <div class="ind${on ? " on" : ""}" data-id="${ind.id}" title="${ind.name}">
        <span class="nm">${ind.short ?? ind.name}</span>
        <span class="wt">${((ind.weight / totalW) * 100).toFixed(0)}%</span>
        <span class="cnt">${total ? `${pass}/${total}` : "—"}</span>
        <span class="bar"><i style="width:${pct}%;background:${scoreColor(pct)}"></i></span>
      </div>`;
  }).join("");

  host.querySelectorAll(".ind[data-id]").forEach((n) => {
    n.onclick = () => { state.activeIndicator = n.dataset.id; refresh(); };
  });
}

/**
 * Зүүн талбарын картын гарчиг нь аль оноог харуулж байгааг заана.
 * Ижил карт "Хот төлөвлөлт" ба "Үзүүлэлт" горимд өөр өгөгдөл үзүүлдэг тул
 * гарчиг нь ялгарч байх ёстой.
 */
function updateCardTitles() {
  const ind = state.indicators.find((i) => i.id === state.activeIndicator);
  // Хот төлөвлөлт (нийлмэл оноо) горимд нэмэлт тодотгол хэрэггүй — гарчиг цэвэрхэн хэвээр
  const byWhat = state.mode === "econ" ? " «Ашигт байдал»"
    : state.mode === "indicator" && ind ? ` «${ind.short ?? ind.name}»` : "";
  $("#rankTitle").textContent = `Бүсийн эрэмбэ${byWhat}`;
}

/* ══════════════════════ UI — зүүн талбар ══════════════════════ */

function renderRanking() {
  const host = $("#rankList");
  host.innerHTML = "";
  // Эрэмбэ нь шүүлтүүрээс үл хамаарч бүрэн байх — шүүсэн үед зөвхөн таарсныг харуулна
  const sorted = [...state.rows].sort((a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1));
  const shown = sorted.filter(inFilter);
  $("#rankCount").textContent =
    state.filterLevel === null ? `${sorted.length} бүс` : `${shown.length} / ${sorted.length}`;

  // Түвшин бүрд хэдэн бүс байгааг урьдчилж тоолно (гарчигт харуулна)
  const perLevel = SCORE_LEVELS.map((_, i) => shown.filter((r) => levelOf(valueOf(r)) === i).length);
  const noData = shown.filter((r) => levelOf(valueOf(r)) < 0).length;

  let lastLevel = null;
  shown.forEach((r) => {
    const tot = valueOf(r);
    const lv = levelOf(tot);

    // Түвшин солигдох бүрд бүлгийн гарчиг оруулна
    if (lv !== lastLevel) {
      lastLevel = lv;
      const L = SCORE_LEVELS[lv];
      const off = state.rankCollapsed.has(lv);
      const g = el("div", "rank-grp" + (off ? " collapsed" : ""));
      g.innerHTML = `
        <i style="background:${L ? L.color : NO_DATA}"></i>
        <span>${L ? L.label : "Өгөгдөлгүй"}</span>
        <em>${L ? `${L.min}–${Math.min(100, L.max)}` : ""}</em>
        <b>${lv < 0 ? noData : perLevel[lv]}</b>
        <u>▼</u>`;
      g.title = off ? "Дэлгэх" : "Хураах";
      g.onclick = () => {
        state.rankCollapsed.has(lv) ? state.rankCollapsed.delete(lv) : state.rankCollapsed.add(lv);
        renderRanking();
      };
      host.append(g);
    }
    if (state.rankCollapsed.has(lv)) return;   // хураасан бүлгийн мөрийг зурахгүй

    const rank = sorted.indexOf(r) + 1;
    const cls = ["rank-row"];
    if (state.selected === r.id) cls.push("sel");
    if (/багц/i.test(r.id)) cls.push("bagts");
    const row = el("div", cls.join(" "));
    row.innerHTML = `
      <span class="rk">${rank}</span>
      <span class="nm">${r.id}<i>${r.type}</i></span>
      <span class="nm2">${r.raw.density === null ? "" : nf(r.raw.density, 0) + " хүн/га"}</span>`;
    const t = el("span", "tot", tot === null ? "—" : Math.round(tot));
    t.style.background = scoreColor(tot);
    row.append(t);
    row.onclick = () => select(r.id, true);
    host.append(row);
  });
}

/** Шүүлтүүр өөрчлөгдөхөд зөвхөн хамаарах хэсгийг дахин зурна */
function applyFilterUI() {
  paintMap();
  renderRanking();
}

/* ══════════════════════ Бүсийн дэлгэрэнгүй ══════════════════════ */

function select(zoneId, zoomTo = false) {
  state.selected = zoneId;
  paintMap();
  renderRanking();
  renderDetail();
  if (zoomTo && zoneId) {
    const r = state.rows.find((x) => x.id === zoneId);
    if (r?.displayGeom) view.goTo({ target: r.displayGeom, scale: 6000 }, { duration: 550 });
  }
}

/** Дэлгэрэнгүй панелийг зүүн дээд буланд буцаана */
function resetDetailPos() {
  const box = $("#detail");
  box.style.left = "14px";
  box.style.top = "14px";
}

/**
 * Панелийг толгой хэсгээс нь чирж зөөнө.
 * renderDetail() бүрд innerHTML дахин үүсдэг тул холбоосыг дахин суулгана.
 */
function bindDetailDrag(box) {
  const head = box.querySelector(".d-head");
  if (!head) return;

  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".d-close")) return;   // хаах товчийг саатуулахгүй
    e.preventDefault();
    head.setPointerCapture(e.pointerId);
    box.classList.add("dragging");

    const wrap = $("#mapWrap").getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const offX = e.clientX - b.left, offY = e.clientY - b.top;

    const onMove = (ev) => {
      const w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = `${clamp(ev.clientX - wrap.left - offX, 6, wrap.width - w - 6)}px`;
      box.style.top = `${clamp(ev.clientY - wrap.top - offY, 6, wrap.height - h - 6)}px`;
    };
    const onUp = () => {
      box.classList.remove("dragging");
      head.releasePointerCapture(e.pointerId);
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
      head.removeEventListener("pointercancel", onUp);
    };
    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
    head.addEventListener("pointercancel", onUp);
  });
}

/**
 * Бүсийн нийгмийн дэд бүтцийн задаргаа — төрөл тус бүрээр хамрах хувь,
 * ойрын байгууламж хүртэлх зай, радиус доторх тоо.
 */
function socialRows(r) {
  const s = r._social;
  if (!s) return `<p class="muted xsmall">Өгөгдөл алга</p>`;

  return Object.entries(s.parts).map(([, p]) => {
    const c = p.cover;
    const col = scoreColor(c === null ? null : clamp(c, 0, 100));
    const meta = p.seats !== undefined
      ? `${p.count} байгууламж · 1000 хүнд ${nf(p.seats, 0)} суудал`
      : `${p.count ? "үйлчлэх радиус дотор" : "радиусаас гадна"} · норм ${p.radius} м`;
    return `
      <div class="soc-row">
        <div class="soc-top">
          <span class="nm">${p.label}</span>
          <span class="d">${p.nearest === null ? "—" : nf(p.nearest, 0) + " м"}</span>
          <span class="v" style="color:${col}">${c === null ? "—" : Math.round(c) + "%"}</span>
        </div>
        <div class="m-bar"><i style="width:${c === null ? 0 : clamp(c, 0, 100)}%;background:${col}"></i></div>
        <div class="soc-meta">${meta}</div>
      </div>`;
  }).join("");
}

/** Бүсийн эдийн засгийн задаргаа — зардал, орлого, ашиг */
function econDetail(r) {
  const e = r.econ;
  const c = state.costs;
  if (!e || !c) return "";
  const ok = e.profit >= 0;
  const share = e.costShare;

  return `
    <div class="d-sect">
      <h4>Эдийн засгийн шинжилгээ</h4>
      <div class="park-formula">
        Зардал: ${money(c.perHa)}/га × <b>${nf(r.areaHa, 2)} га</b> = <b>${money(e.cost)}</b><br>
        Орлого: барилгын нэгж үнэ × <b>${nf(r.gfaSaleM2)} м²</b> = <b>${money(e.revenue)}</b>
        <span class="muted"> (борлуулах талбай — "Одоо байгаа" хасагдсан)</span>
      </div>
      <div class="d-grid" style="margin-top:8px">
        <div><span>Дэд бүтцийн зардал</span><b>${money(e.cost)}</b></div>
        <div><span>Борлуулалтын үнэлгээ</span><b>${money(e.revenue)}</b></div>
        <div><span>${ok ? "Ашиг" : "Алдагдал"}</span>
             <b class="${ok ? "pos" : "neg"}">${money(e.profit)}</b></div>
        <div><span>Зардлын эзлэх хувь</span>
             <b style="color:${scoreColor(econScore(r))}">${shareText(share)}</b></div>
        <div><span>Борлуулах талбай</span><b>${nf(r.gfaSaleM2)} м²</b>
             <span class="xsmall">нийт ${nf(r.gfaM2)} м²</span></div>
        <div><span>Орон сууц — үнэлгээ</span><b>${money(e.revenueRes)}</b></div>
      </div>
    </div>`;
}

function renderDetail() {
  const box = $("#detail");
  const r = state.rows.find((x) => x.id === state.selected);
  if (!r) { box.hidden = true; return; }
  // Хаалттай байснаа нээгдэж байвал анхны байрлал руу нь буцаана
  const reopening = box.hidden;
  box.hidden = false;
  if (reopening) resetDetailPos();

  // Толгойн оноо нь идэвхтэй горимынхыг харуулна
  const tot = valueOf(r);
  const totalW = state.indicators.reduce((a, i) => a + i.weight, 0) || 1;

  const metricRows = state.indicators.map((ind) => {
    const p = r.urbanParts[ind.id];
    const s = p?.score;
    const v = p?.value;
    // Тухайн бүсийн төрөлд хамаарах норм (FAR/BCR нь TOROL-оос хамаарна)
    const eff = p?.norm ?? ind;
    const normTxt = eff.mode === "band" ? `${nf(eff.optMin, 0)}–${nf(eff.optMax, 0)}`
      : eff.mode === "higher" ? `≥${nf(eff.target, eff.decimals)}`
      : `≤${nf(eff.best, eff.decimals)}`;
    const pass = v === null || v === undefined ? null
      : eff.mode === "band" ? (v >= eff.optMin && v <= eff.optMax)
      : eff.mode === "higher" ? v >= eff.target : v <= eff.best;
    // нормын байрлалыг зурааснаас харуулах тэмдэглэгээ
    const markPos = eff.mode === "band" ? scoreIndicator(eff.optMin, eff) : null;
    const on = state.mode === "indicator" && state.activeIndicator === ind.id;
    return `
      <div class="m-row${on ? " on" : ""}">
        <div class="m-top">
          <span class="nm">${ind.name}</span>
          <span class="v" style="color:${scoreColor(s)}">${v === null || v === undefined ? "—" : nf(v, ind.decimals)}${ind.unit ? " " + ind.unit : ""}</span>
          <span class="w">${((ind.weight / totalW) * 100).toFixed(0)}%</span>
        </div>
        <div class="m-norm">
          <span class="${pass === null ? "" : pass ? "ok" : "bad"}">${
            pass === null ? "өгөгдөлгүй" : pass ? "✓ норм" : "✗ норм"} ${normTxt}${ind.unit ? " " + ind.unit : ""}</span>
        </div>
        <div class="m-bar">
          <i style="width:${s === null || s === undefined ? 0 : s}%;background:${scoreColor(s)}"></i>
          ${markPos !== null ? `<u style="left:calc(${markPos}% - 1px)"></u>` : ""}
        </div>
      </div>`;
  }).join("");

  const U = ["urban", "indicator"];
  const sections = [
    { modes: U, html: `
      <div class="d-sect">
        <h4>Хот төлөвлөлтийн үзүүлэлт</h4>
        ${metricRows}
      </div>` },

    { modes: U, html: `
      <div class="d-sect">
        <h4>Суурь үзүүлэлт</h4>
        <div class="d-grid">
          <div><span>Оршин суугч</span><b>${nf(r.residentPop)}</b></div>
          <div><span>Үйлчилгээний хүчин чадал</span><b>${nf(r.capacityPop)}</b></div>
          <div><span>Өрхийн тоо</span><b>${nf(r.households)}</b></div>
          <div><span>Барилгын тоо</span><b>${nf(r.buildingCount)}</b></div>
          <div><span>Барилгын нийт талбай</span><b>${nf(r.gfaM2)} м²</b></div>
          <div><span>Ногоон байгууламж</span><b>${nf(r.greenM2)} м²</b></div>
        </div>
      </div>` },

    { modes: U, html: `
      <div class="d-sect">
        <h4>Зогсоол</h4>
        <div class="d-grid">
          <div><span>Ил (ET_IL)</span><b>${nf(r.etIl)}</b></div>
          <div><span>Далд (ET_DALD)</span><b>${nf(r.etDald)}</b></div>
          <div><span>Хангамж (ET_NIIT)</span><b>${nf(r.parkingSupply)}</b></div>
          <div><span>Хэрэгцээ (${parkSrc().short})</span>
            <b>${r.parkingNeed === null ? "—" : nf(r.parkingNeed, 0)}</b></div>
          <div><span>Зөрүү</span><b class="${r.parkingGap >= 0 ? "pos" : "neg"}">${
            r.parkingGap === null ? "—" : (r.parkingGap >= 0 ? "+" : "−") + nf(Math.abs(r.parkingGap), 0)}</b></div>
          <div><span>Хангалт</span><b style="color:${scoreColor(r.urbanParts.parking?.score)}">${
            r.raw.parking === null ? "—" : nf(r.raw.parking, 0) + "%"}</b></div>
        </div>
      </div>` },

    { modes: U, html: `
      <div class="d-sect">
        <h4>Нийгмийн дэд бүтэц${r.residentPop > 0 ? "" : " <i class='muted'>— оршин суугчгүй</i>"}</h4>
        ${socialRows(r)}
      </div>` },

    { modes: ["econ"], html: econDetail(r) },
  ];

  box.innerHTML = `
    <div class="d-head">
      <div class="gauge" style="background:${scoreColor(tot)}">${tot === null ? "—" : Math.round(tot)}</div>
      <div>
        <h3>${r.id}</h3>
        <p>${r.type} · ${nf(r.areaHa, 2)} га · ${scoreLabel(tot)}</p>
      </div>
      <button class="d-close" title="Хаах">×</button>
    </div>
    ${sections.filter((s) => s.modes.includes(state.mode)).map((s) => s.html).join("")}`;

  box.querySelector(".d-close").onclick = () => select(null);
  bindDetailDrag(box);
}

/* ══════════════════════ Дахин тооцоолол ══════════════════════ */

function refresh() {
  state.rows = computeAll(state.zones, state.indicators);
  updateWeightPercents();
  paintMap();
  renderRanking();
  renderParkingSummary(state.rows.filter(inFilter));
  renderEconomics(state.rows.filter(inFilter));
  renderEconTune(state.rows.filter(inFilter));
  renderProfitChart(state.rows.filter(inFilter));
  renderDetail();
  buildIndicatorPicker();   // норм хангалтын тоо state.rows-оос хамаардаг
  updateCardTitles();

  const ind = state.indicators.find((i) => i.id === state.activeIndicator);
  if (ind) {
    const totalW = state.indicators.reduce((a, i) => a + i.weight, 0) || 1;
    $("#indicatorNote").innerHTML = `
      <div class="w-req">
        <b>Норм:</b> ${normText(ind)}
        <span class="wt">жин ${((ind.weight / totalW) * 100).toFixed(0)}%</span>
      </div>
      <div class="w-src">${ind.norm}</div>`;
  } else {
    $("#indicatorNote").innerHTML = "";
  }
}

/* ══════════════════════ Эхлүүлэлт ══════════════════════ */

/**
 * Горимд хамаарах картыг л харуулна.
 * data-modes атрибутгүй карт бүх горимд харагдана.
 * "indicator" нь хот төлөвлөлтийн дэд харагдац тул urban-тай ижил картуудыг үзүүлнэ.
 */
function applyModeVisibility() {
  document.querySelectorAll("[data-modes]").forEach((n) => {
    n.hidden = !n.dataset.modes.split(/\s+/).includes(state.mode);
  });
  // Эрэмбийн дэд багануудыг CSS-ээр нуухад ашиглана
  document.body.dataset.mode = state.mode;
}

/** Горим солих — таб, шүүлтүүр, дэлгэрэнгүйг цуг шинэчилнэ */
function setMode(mode) {
  state.mode = mode;
  // Шүүлтүүр нь горимын оноонд суурилдаг тул горим солиход цуцална
  state.filterLevel = null;
  document.querySelectorAll("#modeTabs button").forEach((x) =>
    x.classList.toggle("active", x.dataset.mode === mode));
  $("#indicatorPicker").hidden = mode !== "indicator";
  applyModeVisibility();
  refresh();
}

/**
 * Хураах/дэлгэх товчийг бүх .collapsible карт дээр суулгана.
 * Хураасан төлөв localStorage-д хадгалагдах тул горим солих, хуудас
 * дахин ачаалахад ч хэрэглэгчийн сонголт хэвээр үлдэнэ.
 */
const COLLAPSE_KEY = "selbe.collapsed";

function collapsedStore() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
  catch { return new Set(); }
}

function bindCollapsibles() {
  const saved = collapsedStore();
  const hasSaved = localStorage.getItem(COLLAPSE_KEY) !== null;

  document.querySelectorAll(".card.collapsible").forEach((card) => {
    const h = card.querySelector("h2");
    const key = card.id || h.textContent.trim();
    const caret = el("span", "caret", "▼");
    h.append(caret);

    // Хадгалсан төлөв байвал HTML-ийн анхны утгыг дарна
    if (hasSaved) card.classList.toggle("collapsed", saved.has(key));

    h.onclick = (e) => {
      if (e.target.closest(".mini")) return; // Reset зэрэг товчийг саатуулахгүй
      const off = card.classList.toggle("collapsed");
      const s = collapsedStore();
      off ? s.add(key) : s.delete(key);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch {}
    };
  });
}

/* ═════════════ Багана чирж өргөсгөх ═════════════ */

const PANEL_MIN = 220, PANEL_MAX = 620;
const PANEL_DEFAULT = { "--left-w": "330px", "--right-w": "330px" };

function bindResizers() {
  const shell = $("#shell");

  // Хадгалсан өргөнийг сэргээх
  try {
    const saved = JSON.parse(localStorage.getItem("selbe.panels") || "{}");
    for (const [k, v] of Object.entries(saved)) shell.style.setProperty(k, v);
  } catch { /* хадгалсан утга гэмтсэн бол анхныг нь ашиглана */ }

  const save = () => {
    const o = {};
    for (const k of Object.keys(PANEL_DEFAULT)) {
      const v = shell.style.getPropertyValue(k);
      if (v) o[k] = v;
    }
    try { localStorage.setItem("selbe.panels", JSON.stringify(o)); } catch { /* private mode */ }
  };

  const setup = (id, cssVar, side) => {
    const bar = $(id);

    bar.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("active");
      document.body.classList.add("resizing");

      const startX = e.clientX;
      const startW = parseFloat(getComputedStyle(shell).getPropertyValue(cssVar)) ||
                     parseFloat(PANEL_DEFAULT[cssVar]);

      const onMove = (ev) => {
        // зүүн талбар: баруун тийш чирвэл өргөсөх; баруун талбар: эсрэгээр
        const dx = (ev.clientX - startX) * (side === "left" ? 1 : -1);
        const w = clamp(startW + dx, PANEL_MIN, PANEL_MAX);
        shell.style.setProperty(cssVar, `${Math.round(w)}px`);
      };
      const onUp = () => {
        bar.classList.remove("active");
        document.body.classList.remove("resizing");
        bar.releasePointerCapture(e.pointerId);
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("pointerup", onUp);
        bar.removeEventListener("pointercancel", onUp);
        save();
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerup", onUp);
      bar.addEventListener("pointercancel", onUp);
    });

    // Давхар товшиход анхны өргөнд буцаана
    bar.addEventListener("dblclick", () => {
      shell.style.setProperty(cssVar, PANEL_DEFAULT[cssVar]);
      save();
    });
  };

  setup("#resizeL", "--left-w", "left");
  setup("#resizeR", "--right-w", "right");
}

function bindGlobalUI() {
  document.querySelectorAll("#modeTabs button").forEach((b) => {
    b.onclick = () => setMode(b.dataset.mode);
  });

  $("#resetWeights").onclick = () => {
    state.indicators = INDICATORS.map((i) => ({ ...i }));
    buildWeightUI();
    buildIndicatorPicker();
    refresh();
  };

}

async function init() {
  const setProgress = (msg, pct) => {
    $("#loaderMsg").textContent = msg;
    $("#loaderFill").style.width = `${pct}%`;
  };

  await buildMap();

  const { zones, buildings, context } = await loadData(setProgress);
  state.context = context;
  state.buildings = buildings;

  // Худалдаалагдах барилгын анхны шүүлтүүрийг өгөгдлөөс байгуулна
  aggregateBuildings(zones, buildings);

  // Дэд бүтцийн өртөг — UI тохиргооноос хамаардаггүй тул нэг л удаа бодно
  state.costs = await loadCosts((m, p) => setProgress(m, 90 + p * 0.08));
  state.basePrice = dominantBuildingPrice(buildings);
  computeEconomics(zones, state.costs, state.econOpt);

  computeRaw(zones, state.greenCats, state.parking);
  state.zones = zones;

  // Дүрслэлийн геометрийг Web Mercator рүү хөрвүүлнэ (тооцоо нь UTM дээр хэвээр)
  await projection.load();
  const wm = SpatialReference.WebMercator;
  for (const z of zones) {
    z.displayGeom = z.geometry ? projection.project(z.geometry, wm) : null;
  }

  bindGlobalUI();
  applyModeVisibility();
  bindResizers();
  bindCollapsibles();
  buildWeightUI();
  buildParkingUI();
  buildEconTuneUI();
  buildContextUI();
  buildIndicatorPicker();
  refresh();

  // Судалгааны талбар руу төвлөрөх
  const extents = zones.map((z) => z.displayGeom?.extent).filter(Boolean);
  if (extents.length) {
    const union = extents.reduce((a, e) => a.union(e), extents[0].clone());
    await view.goTo(union.expand(1.12));
  }

  $("#loader").classList.add("done");
  setTimeout(() => ($("#loader").style.display = "none"), 600);
}

init().catch((err) => {
  console.error(err);
  $("#loaderMsg").textContent = `Алдаа гарлаа: ${err.message}`;
  $("#loaderMsg").style.color = "#f87171";
});
