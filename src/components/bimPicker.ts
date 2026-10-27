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
import { bimPkgOf, getBimPkg, getRender3d, setBimPkg } from './render3d';

export type BimItem = { key: string; title: string; pkg: string };

export type BimPicker = {
  /** Expand-ын `content` эсвэл `view.ui`-д нэмэх элемент */
  el: HTMLElement;
  /** Барилга сонгох (`null` = сонголтгүй); `fly` — тэр барилга руу ойртох эсэх */
  select: (key: string | null, fly?: boolean) => void;
  /** Газрын зураг дээр дарсан цэгт BIM барилга байвал сонгоно — сонгосон бол `true` */
  pickAt: (e: __esri.ViewClickEvent) => Promise<boolean>;
  /** Багц · горим · инстанц солигдсоны дараа сонголтыг одоогийн давхаргад дахин холбоно (`rebind`-ийн ⚠️) */
  rebind: () => void;
  destroy: () => void;
};

/**
 * Сешн доторх сүүлийн сонголт — 2D↔3D↔BIM солиход виджет дахин үүсдэг тул
 * буцаж ороход ижил барилга сонгогдсон хэвээр байна.
 */
let lastKey: string | null = null;

export function createBimPicker(opts: {
  view: SceneView;
  /** ⚠️ 2026-10-19: функц өгвөл сонголт/товшилт бүрд ОДООГИЙН инстанцыг уншина (`render3d.manageBim`-ийн
      `all`-тай ижил — `bimCache` унасныг сольсны дараа устгагдсан инстанцаар BuildingExplorer үүсгэхгүй) */
  layers: BuildingSceneLayer[] | (() => BuildingSceneLayer[]);
  items: readonly BimItem[];
  Explorer: typeof BuildingExplorer;
}): BimPicker {
  const { view, Explorer } = opts;
  const src = opts.layers;
  const layersNow = (): BuildingSceneLayer[] =>
    (typeof src === 'function' ? src() : src).filter((l) => !l.destroyed);
  /** id → одоогийн (устгагдаагүй) инстанц */
  const layerOf = (key: string): BuildingSceneLayer | undefined => layersNow().find((l) => l.id === key);
  const keys = new Set(layersNow().map((l) => l.id));
  /* Зөвхөн Map-д БАЙГАА давхаргатай мөрүүд */
  const items = opts.items.filter((it) => keys.has(it.key));

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

  /** @param restore ⚠️ 2026-10-19: сешнээс СЭРГЭЭХ (виджет дахин үүсэх) — багцыг ХЭЗЭЭ Ч солихгүй */
  const select = (key: string | null, fly = true, restore = false) => {
    if (disposed) return;
    if (cur?.key === key && !cur.layer.destroyed) return;
    release();
    const layer = key ? layerOf(key) : undefined;
    sel.value = layer && key ? key : '';
    hint.style.display = layer ? 'none' : '';
    lastKey = layer && key ? key : null;
    if (!layer || !key) return;
    /* ⚠️ 2026-10-14: «Нарийн»-д зөвхөн СОНГОСОН багцын BIM Map-д байдаг (`render3d.BimPkgState`) — өөр багцын
       барилга сонговол тэр багц руу шилжинэ (эс бөгөөс сонгосон барилга харагдахгүй). Барилга руу ойртох нь
       доор (багц руу биш).
       ⚠️ 2026-10-19: СЭРГЭЭЛТЭД (`restore`) биш — урьд нь 2D↔3D↔BIM · горим солих · «Дахин оролдох» бүрд
       виджет дахин үүсэхэд `select(lastKey)` хуучин барилгын багц руу БУЦААЖ шилжүүлж, MapTools-оор
       сонгосон багцыг дардаг байв. Багц нь хэрэглэгчийн ИЛ сонголт (MapTools · жагсаалт · 3D товшилт) л. */
    const kp = bimPkgOf(key);
    if (!restore && getRender3d() === 'fine' && kp && kp !== getBimPkg().pkg) setBimPkg(kp);
    const node = document.createElement('div');
    host.append(node);
    const widget = new Explorer({ view, layers: [layer], container: node });
    cur = { key, layer, widget, node };
    /* Сонгосон барилга руу ойртоно — ачаалагдсаны дараа (extent бэлэн).
       ⚠️ Сешнээс СЭРГЭЭХЭД ойртохгүй (`fly=false`) — BIM руу орох бүрд камер үсрэхгүй. */
    /* ⚠️ 2026-10-14 (хэрэглэгч: «жагсаалтаас дурын барилга сонгоход тухайн барилга руу map zoom-ин хийдэг болго»):
       `when()` БИШ `load()` — `when()` давхаргыг ӨӨРӨӨ ачаалдаггүй тул Map-д нэмэгдээгүй («Хурдан»-ы төсвөөс гадуурх,
       «Нарийн»-д өөр багцын) барилгад хэзээ ч биелэхгүй, ойртолт чимээгүй алга болж байв. Хүрээ нь 3857 + z;
       камерын хазайлтыг хадгалж (≥45°) барилгыг дэлгэцэд багтаана. Алдааг консолд ИЛ (чимээгүй залгихгүй). */
    if (fly) void layer.load().then(() => {
      if (disposed || cur?.key !== key || view.destroyed) return;
      const ex = layer.fullExtent;
      if (!ex) { console.warn('[bim] барилгын хүрээ алга — ойртсонгүй', key); return; }
      view.goTo({ target: ex.clone().expand(1.8), tilt: Math.max(45, view.camera?.tilt ?? 60) }, { duration: 900 })
        .catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') console.warn('[bim] барилга руу ойртож чадсангүй', key, e); });
    }).catch((e: unknown) => console.warn('[bim] барилга ачаалагдсангүй', key, e));
  };

  sel.addEventListener('change', () => select(sel.value || null));

  const pickAt = async (e: __esri.ViewClickEvent): Promise<boolean> => {
    if (disposed || view.destroyed) return false;
    try {
      const hit = await view.hitTest(e, { include: layersNow() });
      const r = hit.results.find((x) => x.type === 'graphic' && keys.has(String(x.graphic?.layer?.id ?? '')));
      const raw = r && r.type === 'graphic' ? r.graphic.layer?.id : undefined;
      const id = raw == null ? '' : String(raw);
      if (!id) return false;
      select(id);
      return true;
    } catch {
      return false;
    }
  };

  /* ⚠️ 2026-10-19: «Нарийн»-д сэргээх барилга ӨӨР багцынх бол (Map-д алга) сэргээхгүй — багцыг солихгүй
     (`select`-ийн `restore` ⚠️); `lastKey` хадгалагдана — тэр багц руу буцахад дахин сэргэнэ. */
  /**
   * ДАХИН ХОЛБОХ — багц · горим · BIM инстанц («Дахин оролдох») солигдоход (MapCanvas-ийн эффект) ба үүсэх үед.
   * ⚠️ 2026-10-19 (review): «Нарийн»-д багц ХАРААХАН сонгогдоогүй (`pkg === ''`) бол СЭРГЭЭХГҮЙ — `manageBim` удахгүй
   *    өөрөө багц сонгоно (auto-pick); урьд нь энд хуучин барилгыг холбож, авто-сонголтын дараа Map-аас гарсан
   *    давхаргад BuildingExplorer үлддэг байв. Сонгосон барилга идэвхтэй багцаас гарвал виджетийг салгана
   *    (`lastKey` хадгалагдана — тэр багц руу буцахад дахин сэргэнэ); инстанц солигдсон бол шинээр холбоно.
   *    Picker-ийг дахин ҮҮСГЭХГҮЙ — Expand хаагдаж, сонголтын ойртолт (`fly`) тасрах байсан.
   */
  const rebind = () => {
    if (disposed) return;
    const key = cur?.key ?? lastKey;
    if (!key || !keys.has(key)) return;
    const kp = bimPkgOf(key);
    const pk = getBimPkg().pkg;
    if (getRender3d() === 'fine' && (!pk || (kp && kp !== pk))) {
      if (cur) {
        const keep = lastKey;
        release();
        sel.value = '';
        hint.style.display = '';
        lastKey = keep;
      }
      return;
    }
    if (cur && cur.key === key && !cur.layer.destroyed && layerOf(key) === cur.layer) return;
    release();
    select(key, false, true);
  };
  rebind();

  return {
    el,
    select,
    pickAt,
    rebind,
    destroy: () => {
      if (disposed) return;
      release();
      disposed = true;
      el.remove();
    },
  };
}
