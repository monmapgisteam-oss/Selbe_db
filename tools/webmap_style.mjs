/**
 * WEBMAP → ПОРТАЛЫН ЗАГВАРЫН СНАПШОТ ҮҮСГЭГЧ.
 *   node tools/webmap_style.mjs            — анхдагч webmap (доорх ITEM)
 *   node tools/webmap_style.mjs <itemId>   — өөр webmap-аас
 *
 * ArcGIS Online webmap-ийн давхарга бүрийн ЗАГВАРЫГ (drawingInfo.renderer,
 * bloom effect, opacity) татаж, `src/lib/webmapStyle.ts` руу ҮЙЛЧИЛГЭЭНИЙ
 * URL-аар түлхүүрлэн бичнэ. Портал газрын зурагтаа энэ снапшотыг давхаргын
 * URL-аар нь тааруулж `Renderer.fromJSON()`-д шууд өгдөг тул симболын орчуулга
 * огт хийгдэхгүй — webmap дээр харагдаж буйтай 100% ижил зурагдана.
 *
 * ⚠️ ҮЙЛЧИЛГЭЭНД ХҮРЭХГҮЙ: зөвхөн ЗАГВАР хуулна. Давхаргын жагсаалт, эх
 * үйлчилгээ, шүүлт бүгд порталын `services.ts`-ийн мэдэлд хэвээр.
 *
 * ⚠️ Webmap-ийг хэрэглэгч идэвхтэй засдаг — загвар нь өөрчлөгдвөл энэ скриптийг
 * ДАХИН АЖИЛЛУУЛААД generated файлыг commit хийнэ (гараар засварлахгүй).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Эх webmap — «Сэлбэ ерөнхий төлөвлөгөө» (single palette, кодод «B» гэдэг) */
const ITEM = process.argv[2] || "d790321542504a54afd006e277d7a137";

/**
 * Өөр үйлчилгээн дэх ИЖИЛ агуулгатай давхаргын загварыг төслийн давхаргад
 * буулгах alias. Бүс: webmap нь хуучин `busiin_medeelel_final`-ийг заадаг ч
 * талбар нь (`Angilal`) ЕТ-ийн `BUS_LAST` (ET/28)-тай яг ижил тул renderer
 * шууд зохино.
 */
const ALIAS = [
  [
    "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/busiin_medeelel_final/featureserver/0",
    "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/28",
  ],
];

const norm = (u) => decodeURIComponent(u).replace(/\/+$/, "").toLowerCase();

/** Webmap-ийн scale-тэй bloom effect → SDK-ийн ойлгох мөр хэлбэр */
function toEffect(eff) {
  if (!Array.isArray(eff)) return undefined;
  const out = [];
  for (const stop of eff) {
    const fns = Array.isArray(stop.value) ? stop.value : [];
    const parts = fns
      .filter((f) => f.type === "bloom")
      .map((f) => `bloom(${f.strength}, ${f.radius}px, ${f.threshold})`);
    if (parts.length) out.push({ scale: stop.scale, value: parts.join(" ") });
  }
  return out.length ? out : undefined;
}

/** Renderer JSON доторх ЭХНИЙ өнгө — каталогийн swatch-д (esri 0–255 / CIM 0–100) */
function firstColor(o) {
  if (!o || typeof o !== "object") return null;
  if (
    Array.isArray(o.color) &&
    o.color.length >= 3 &&
    o.color.slice(0, 3).every((n) => typeof n === "number")
  )
    return o.color;
  for (const v of Object.values(o)) {
    if (typeof v === "object") {
      const c = firstColor(v);
      if (c) return c;
    }
  }
  return null;
}
const hex = (c) =>
  "#" + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");

const res = await fetch(
  `https://www.arcgis.com/sharing/rest/content/items/${ITEM}/data?f=json`,
);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const map = await res.json();
if (map.error) throw new Error(JSON.stringify(map.error));

const S = {};
let matched = 0;

/** Бүлгийн opacity хүүхдэд үржиж буудаг тул дагуулж явна */
function walk(layers, groupOpacity = 1) {
  for (const l of layers ?? []) {
    const op = groupOpacity * (typeof l.opacity === "number" ? l.opacity : 1);
    if (l.layers) {
      walk(l.layers, op);
      continue;
    }
    if (!l.url || l.layerType !== "ArcGISFeatureLayer") continue;
    const renderer = l.layerDefinition?.drawingInfo?.renderer;
    const effect = toEffect(l.effect);
    if (!renderer && !effect && op === 1) continue;

    const entry = {};
    if (renderer) {
      entry.renderer = renderer;
      const c = firstColor(renderer);
      if (c) entry.color = hex(c);
    }
    if (effect) entry.effect = effect;
    if (op !== 1) entry.opacity = Math.round(op * 1000) / 1000;
    S[norm(l.url)] = entry;
    matched++;
  }
}
walk(map.operationalLayers);

for (const [from, to] of ALIAS) if (S[from]) S[to] = S[from];

/**
 * ⚠️ 2026-08-05: bundle хөнгөлөх зорилгоор снапшотыг src/lib/webmapStyle.ts-д
 *    БИШ, public/webmap-style.json руу бичдэг болов — апп ажиллах үедээ fetch
 *    хийж татна (src/lib/webmapStyle.ts нь одоо slim loader, ГАРААР засварлана).
 */
const out = JSON.stringify(S);
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "webmap-style.json");
writeFileSync(dest, out, "utf-8");
console.log(`OK: ${matched} давхаргын загвар → public/webmap-style.json (${(out.length / 1024).toFixed(0)} KB)`);
