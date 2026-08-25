/**
 * WEBMAP STYLE — эх webmap (d790321542504a54afd006e277d7a137)-ийн давхарга
 * бүрийн загвар (renderer JSON · bloom effect · opacity), үйлчилгээний URL-аар
 * түлхүүрлэгдсэн.
 *
 * ⚠️ Өгөгдөл нь bundle-д БАЙХГҮЙ — 326KB снапшотыг /webmap-style.json болгож
 *    ажиллах үед татдаг болсон (эхний ачаалал хөнгөрнө). MapCanvas газрын зураг
 *    барихаасаа ӨМНӨ loadWebmapStyle()-ыг хүлээдэг тул webmapStyleOf() нь
 *    buildLayers дотор синхрон уншигдана.
 *
 * Webmap засагдвал: node tools/webmap_style.mjs — одоо public/webmap-style.json
 * руу бичдэг.
 */

export type WebmapStyle = {
  /** drawingInfo.renderer — webmap-ийн ЯГ хэлбэрээр (Renderer.fromJSON-д) */
  renderer?: unknown;
  /** Масштабаас хамаарсан bloom — SDK-ийн layer.effect хэлбэрт хөрвүүлсэн */
  effect?: { scale: number; value: string }[];
  opacity?: number;
  /** Каталогийн swatch-д — renderer-ийн гол өнгө */
  color?: string;
};

let S: Record<string, WebmapStyle> | null = null;
let pending: Promise<void> | null = null;

/** Снапшотыг урьдчилан ачаална — Map барихаас ӨМНӨ дуудна */
export function loadWebmapStyle(): Promise<void> {
  if (S) return Promise.resolve();
  pending ??= fetch("/webmap-style.json")
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      S = (await r.json()) as Record<string, WebmapStyle>;
    })
    .catch((e) => {
      // ⚠️ Алдаанд S-ийг ХООСОН болгож кэшлэхгүй: S truthy болмогц дараагийн
      //    дуудлагууд шууд resolve болж, сесс дуустал retry огт гардаггүй байв —
      //    апп нээх агшны нэг глитч бүх давхаргыг SDK-ийн анхдагч загвараар
      //    (мэдэгдэлгүй «өнгө эвдэрсэн») үлдээдэг. pending-ийг цэвэрлэснээр
      //    дараагийн mount (MapCanvas/LayerSwatch) дээр дахин татна. Promise нь
      //    resolve хэвээр тул stylesReady гацахгүй.
      pending = null;
      console.warn('[selbe] webmap-style.json татагдсангүй — дараагийн mount дээр дахин оролдоно:', e);
    });
  return pending;
}

/** URL-ыг харьцуулахын өмнө нэг хэлбэрт (кирилл зам encode-той ч, шуудхан ч ирдэг) */
const norm = (u: string) => decodeURIComponent(u).replace(/\/+$/, "").toLowerCase();

/** Давхаргын үйлчилгээний URL → webmap-ийн загвар (ачаалагдаагүй/байхгүй бол undefined) */
export const webmapStyleOf = (url: string): WebmapStyle | undefined => S?.[norm(url)];
