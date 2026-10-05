/**
 * BIM БАРИЛГА НЭГ НЭГЭЭР — «Level» (BuildingExplorer) хэрэгслийг СОНГОСОН НЭГ
 * барилгад холбоно (2026-10-04, хэрэглэгч: «bim-ийн давхарга ажиллуулах tool бүх
 * bim зэрэг ажиллаж байна, үүнийг сайжруулж bim-ийг нэг нэгээр сонгож ажиллуулдаг
 * болго»).
 *
 *   ┌ BIM барилга ─────────────────┐
 *   │ [ Багц 3.3 · FID 10      ▾ ] │  ← багцаар бүлэглэсэн жагсаалт
 *   │ ┌ Level ┐  Disciplines …     │  ← BuildingExplorer — ЗӨВХӨН энэ барилгад
 *   └──────────────────────────────┘
 *
 * ⚠️ ЯАГААД: урьд нь виджет 58 BIM давхаргыг БҮГДИЙГ нь зэрэг авдаг тул «Select
 *    Level» нь бүх барилгыг нэг дор тасалж, нэг барилгын давхрыг харах боломжгүй
 *    байв.
 * ⚠️ БАРИЛГА СОЛИХОД өмнөхийн шүүлтийг (`activeFilterId`) АРИЛГАНА — эс бөгөөс
 *    BuildingExplorer-ийн тавьсан давхрын шүүлт хуучин барилга дээр үлдэж, тэр нь
 *    «тасархай» хэвээр харагдана.
 * ⚠️ Бусад барилга ХЭВЭЭР ил (нууцлахгүй) — шүүлт зөвхөн сонгосонд үйлчилнэ.
 * ⚠️ 3D дээр BIM барилгыг ДАРЖ ч сонгоно (`pickAt`) — жагсаалт түүнийг дагана.
 */
import type BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import type BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import type SceneView from '@arcgis/core/views/SceneView';
import { t as tr } from '@/lib/i18nCore';

export type BimItem = { key: string; title: string; pkg: string };

export type BimPicker = {
  /** Expand-ын `content` эсвэл `view.ui`-д нэмэх элемент */
  el: HTMLElement;
  /** Барилга сонгох (`null` = сонголтгүй); `fly` — тэр барилга руу ойртох эсэх */
  select: (key: string | null, fly?: boolean) => void;
  /** Газрын зураг дээр дарсан цэгт BIM барилга байвал сонгоно — сонгосон бол `true` */
  pickAt: (e: __esri.ViewClickEvent) => Promise<boolean>;
  destroy: () => void;
};

/**
 * Сешн доторх сүүлийн сонголт — 2D↔3D↔BIM солиход виджет дахин үүсдэг тул
 * буцаж ороход ижил барилга сонгогдсон хэвээр байна.
 */
let lastKey: string | null = null;

export function createBimPicker(opts: {
  view: SceneView;
  layers: BuildingSceneLayer[];
  items: readonly BimItem[];
  Explorer: typeof BuildingExplorer;
}): BimPicker {
  const { view, Explorer } = opts;
  const byKey = new Map(opts.layers.map((l) => [l.id, l]));
  /* Зөвхөн Map-д БАЙГАА давхаргатай мөрүүд */
  const items = opts.items.filter((it) => byKey.has(it.key));

  const el = document.createElement('div');
  el.className = 'esri-widget';
  el.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px 12px;min-width:270px;max-width:320px;';

  const label = document.createElement('label');
  label.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;';
  label.textContent = tr('BIM барилга');

  const sel = document.createElement('select');
  sel.style.cssText = 'font:inherit;font-weight:400;font-size:12.5px;padding:5px 6px;border-radius:4px;'
    + 'background:var(--surface-2, #1f2733);color:inherit;border:1px solid var(--line-strong, #3a4554);';
  sel.setAttribute('aria-label', tr('BIM барилга'));
  const none = document.createElement('option');
  none.value = '';
  none.textContent = tr('— барилга сонгох —');
  sel.append(none);
  /* Багцаар бүлэглэнэ — 58 барилгыг нэг урт жагсаалтаар гүйлгэхгүй */
  const groups = new Map<string, BimItem[]>();
  for (const it of items) (groups.get(it.pkg) ?? groups.set(it.pkg, []).get(it.pkg)!).push(it);
  for (const [pkg, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = tr('Багц {0}', pkg);
    for (const it of list) {
      const o = document.createElement('option');
      o.value = it.key;
      o.textContent = it.title;
      og.append(o);
    }
    sel.append(og);
  }
  label.append(sel);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11.5px;opacity:.75;line-height:1.4;';
  hint.textContent = tr('Давхар · дисциплинаар шүүхийн тулд барилгаа жагсаалтаас сонгох эсвэл 3D дээр дарна уу.');

  /* BuildingExplorer-ийн байр — сонголт солигдох бүрд шинэ виджет */
  const host = document.createElement('div');
  el.append(label, hint, host);

  let cur: { key: string; layer: BuildingSceneLayer; widget: BuildingExplorer; node: HTMLElement } | null = null;
  let disposed = false;

  const release = () => {
    if (!cur) return;
    /* ⚠️ Давхрын шүүлтийг хуучин барилгаас АРИЛГАНА (толгойн ⚠️) */
    try { cur.layer.activeFilterId = null as unknown as string; } catch { /* устсан давхарга */ }
    cur.widget.destroy();
    cur.node.remove();
    cur = null;
  };

  const select = (key: string | null, fly = true) => {
    if (disposed) return;
    if (cur?.key === key) return;
    release();
    const layer = key ? byKey.get(key) : undefined;
    sel.value = layer && key ? key : '';
    hint.style.display = layer ? 'none' : '';
    lastKey = layer && key ? key : null;
    if (!layer || !key) return;
    const node = document.createElement('div');
    host.append(node);
    const widget = new Explorer({ view, layers: [layer], container: node });
    cur = { key, layer, widget, node };
    /* Сонгосон барилга руу ойртоно — ачаалагдсаны дараа (extent бэлэн).
       ⚠️ Сешнээс СЭРГЭЭХЭД ойртохгүй (`fly=false`) — BIM руу орох бүрд камер үсрэхгүй. */
    if (fly) layer.when(() => {
      if (disposed || cur?.key !== key || view.destroyed) return;
      const target = layer.fullExtent ? layer.fullExtent.clone().expand(1.6) : layer;
      view.goTo(target, { duration: 900 }).catch(() => {});
    }).catch(() => {});
  };

  sel.addEventListener('change', () => select(sel.value || null));

  const pickAt = async (e: __esri.ViewClickEvent): Promise<boolean> => {
    if (disposed || view.destroyed) return false;
    try {
      const hit = await view.hitTest(e, { include: opts.layers });
      const r = hit.results.find((x) => x.type === 'graphic' && byKey.has(String(x.graphic?.layer?.id ?? '')));
      const raw = r && r.type === 'graphic' ? r.graphic.layer?.id : undefined;
      const id = raw == null ? '' : String(raw);
      if (!id) return false;
      select(id);
      return true;
    } catch {
      return false;
    }
  };

  if (lastKey && byKey.has(lastKey)) select(lastKey, false);

  return {
    el,
    select,
    pickAt,
    destroy: () => {
      if (disposed) return;
      release();
      disposed = true;
      el.remove();
    },
  };
}
