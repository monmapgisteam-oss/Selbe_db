'use client';

import { t as tr } from '@/lib/i18nCore';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { refreshEpoch, subscribeData } from '@/lib/dataBus';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import Extent from '@arcgis/core/geometry/Extent';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { useMap } from '@/components/MapCanvas';
import {
  computeOverlap, computeOverlapDisplay, onOverlapStep, overlapScopeKey, fmtLen, OVERLAP_CATS, OVERLAP_TYPES,
  type OverlapCat, type OverlapResult, type OverlapSide, type OverlapMapDisplay, type OverlapZone,
} from '@/lib/planOverlap';
import { num } from '@/lib/format';
import { userError } from '@/components/ui';
import { matchesOverlapFocus, overlapScopeFocus, type OverlapFocus } from '@/lib/planOverlapSelection';
import s from './planOverlap.module.css';

/** Инженерийн бодит давхцал; ангилал, давхарга, тусдаа бүсийн сонголтоор шүүнэ. */
export type { OverlapFocus } from '@/lib/planOverlapSelection';

/** Шинэ хэсэгчилсэн ЕТ-ийн бүх таван ангилал бүсийн нийт дүнд орно. */
export const OVERLAP_SHOWN_CATS: OverlapCat[] = OVERLAP_CATS.map((category) => category.key);

/** Зураг дээрх давхаргын id — Portal-ын swipe (зүүн/баруун) эдгээрийг таслана */
export const OVERLAP_LAYER_ID: Record<OverlapSide, string> = { now: 'overlap:now', next: 'overlap:next' };

const TYPE_BY_KEY = new Map(OVERLAP_TYPES.map((x) => [x.key, x]));
const CAT_BY_KEY = new Map(OVERLAP_CATS.map((x) => [x.key, x]));
const LINE_STYLE: Record<string, __esri.SimpleLineSymbolProperties['style']> = {
  sewer: 'dash', heat: 'short-dash', hot: 'short-dash', power: 'dash-dot', comm: 'dot', lotki: 'short-dot',
};
const zoneTitle = (zone: Pick<OverlapZone, 'label' | 'oid'>) => `${zone.label || tr('Бүс')} · #${zone.oid}`;
/** '#rrggbb' → [r, g, b] */
const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type State = { result: OverlapResult | null; step: string; error: string | null };

/**
 * HOVER ТАЙЛБАРЫГ ЗУРГИЙН ХҮРЭЭНД БАЙРШУУЛНА — курсорын баруун-доор; багтахгүй бол зүүн/дээш эргүүлнэ.
 * ⚠️ 2026-10-19 (аудит): урьд нь `e.x + 14` шууд тавьдаг тул зургийн баруун/доод ирмэгт тайлбар тасарч, хуудсанд
 *    хэвтээ гүйлгэлт үүсгэдэг байв. Агуулгыг ТАВЬСНЫ ДАРАА дуудна (хэмжээ нь хэрэгтэй). `NeedLayer` ч хэрэглэнэ.
 */
export function placeTip(tip: HTMLElement, view: __esri.MapView, x: number, y: number): void {
  const W = view.width || window.innerWidth;
  const H = view.height || window.innerHeight;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = x + 14;
  let top = y + 14;
  if (left + w > W - 4) left = Math.max(4, x - 14 - w);
  if (top + h > H - 4) top = Math.max(4, y - 14 - h);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

/** «Шинэчлэх»-ийн дараах дахин бодолтын саатал — дараалсан `invalidateAll`-ийг нэг тооцоо болгоно */
const REFRESH_DEBOUNCE_MS = 400;

/** Нэг талын давхцлыг бодно (кэштэй — `computeOverlap`) */
function useOverlap(side: OverlapSide): State {
  const [st, setSt] = useState<State & { side: OverlapSide }>({ side, result: null, step: '', error: null });
  /* ⚠️ 2026-10-19 (аудит): толгойн «Шинэчлэх» (`invalidateAll`) кэшийг хаяна (`planOverlap`) — дахин бодуулна.
     Хуучин үр дүн шинэ нь иртэл дэлгэцэд үлдэнэ. */
  /* ⚠️ 2026-10-19 (review): `dataVersion` биш `refreshEpoch` (кэш зөвхөн `invalidateAll`-д хаягдана); «Шинэчлэх»-ийн
     дараах дахин бодолтыг сааруулна (тал солих нь шууд); өмнөх үеийн хариу ба явцыг (`onOverlapStep(…, p)`) үл тооно. */
  const epoch = useSyncExternalStore(subscribeData, refreshEpoch, () => 0);
  const lastEpoch = useRef(epoch);
  useEffect(() => {
    let alive = true;
    let off = () => {};
    const delay = epoch === lastEpoch.current ? 0 : REFRESH_DEBOUNCE_MS;
    lastEpoch.current = epoch;
    const t = setTimeout(() => {
      const p = computeOverlap(side);
      /* ⚠️ 2026-10-19 (аудит): явцын захиалгыг unmount-д ЦУЦЛАНА (`onOverlapStep`-ийн ⚠️) */
      off = onOverlapStep(side, (step) => { if (alive) setSt((prev) => ({ ...prev, side, step })); }, p);
      p.then((result) => { if (alive) setSt({ side, result, step: '', error: null }); })
        .catch((e: unknown) => {
          console.error('[selbe] давхцлын тооцоо унав:', e);
          /* ⚠️ 2026-10-26 (аудит): түүхий алдаа (URL-тай «timeout 45s: https://…», англи ArcGIS мөр) — 01/03-тай ижил `userError` */
          if (alive) setSt({ side, result: null, step: '', error: userError(e) });
        });
    }, delay);
    return () => { alive = false; clearTimeout(t); off(); };
  }, [side, epoch]);
  /* ⚠️ Тал солигдсон даруйд хуучин талын үр дүнг харуулахгүй */
  return st.side === side ? st : { result: null, step: '', error: null };
}

/** Анхны эрэмбэ бүх ангиллаар; идэвхжүүлсний дараа зөвхөн сонгосон хүрээгээр. */
function useOverlapDisplay(result: OverlapResult | null, shown: OverlapCat[], selected: OverlapFocus) {
  const categories = shown.length ? shown : OVERLAP_SHOWN_CATS;
  const key = overlapScopeKey(categories, selected);
  const [state, setState] = useState<{ source: OverlapResult; key: string; data: OverlapMapDisplay | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!result) return;
    let alive = true;
    computeOverlapDisplay(result, categories, selected)
      .then((data) => { if (alive) setState({ source: result, key, data, error: null }); })
      .catch((error: unknown) => {
        console.error('[selbe] давхцлын зураглал унав:', error);
        if (alive) setState({ source: result, key, data: null, error: userError(error) });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key нь ангилал/төрөл/давхаргыг бүрэн агуулна; бүс солиход дахин бодохгүй.
  }, [result, key]);
  return state?.source === result && state?.key === key ? state : { data: null, error: null };
}

/* ═══════════════════ Газрын зураг ═══════════════════ */

/**
 * `shown` ангиллыг асаана, `selected` нарийсгана; hover зөвхөн харагдаж буй геометрийг тодруулна.
 * Давхарга эсвэл тусдаа бүс сонгоход түүний бодит огтлолцол руу ойртоно.
 */
export function PlanOverlapLayers({
  focus, shown, selected,
}: { focus: OverlapFocus; shown: OverlapCat[]; selected: OverlapFocus }) {
  const { view } = useMap();
  /* ⚠️ 2026-10-13: 02 нь ЗӨВХӨН шинэ (`next`) тал — «Шинэчлэгдсэн / Одоогийн төлөвлөлт» гэж байх
     шаардлагагүй (хэрэглэгчийн заавар); хуучин талыг тооцохгүй, зурахгүй */
  const next = useOverlap('next');
  const nextRes = next.result;
  const { data: display, error: displayError } = useOverlapDisplay(nextRes, shown, selected);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const selectedZoneId = selected?.zone;
  const selectedZone = display?.zones.find((zone) => zone.id === selectedZoneId);
  const visiblePieces = useMemo(() => !shown.length ? [] : selectedZoneId
    ? display?.zones.find((zone) => zone.id === selectedZoneId)?.pieces ?? [] : display?.pieces ?? [],
  [display, shown.length, selectedZoneId]);
  const [lineWidth, setLineWidth] = useState(1);
  useEffect(() => {
    if (!view) return;
    const handle = reactiveUtils.watch(() => view.scale, (scale) => setLineWidth(scale > 15000 ? 0.8 : scale > 6000 ? 1 : 1.3), { initial: true });
    return () => handle.remove();
  }, [view]);

  /* Нэг GraphicsLayer — swipe-д id-аараа (Portal §H02_SWIPE: баруун тал нь ЗӨВХӨН идэвхжүүлсэн давхцал) */
  const [gl, setGl] = useState<GraphicsLayer | null>(null);
  useEffect(() => {
    /* ⚠️ Зөвхөн 2D — swipe ч, энэ бүрэлдэхүүн ч 2D-д л (Portal `dim === '2d'`) */
    if (!view || view.type !== '2d') return;
    const map = view.map;
    if (!map) return;
    const l = new GraphicsLayer({ id: OVERLAP_LAYER_ID.next, listMode: 'hide' });
    map.add(l); // хамгийн ДЭЭР — физик объектын полигоны дээгүүр
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ ArcGIS давхаргыг view-д НЭМСНИЙ дараа л график/hover эффектүүд ажиллах ёстой (гаднын Map-ийн төлөв)
    setGl(l);
    return () => { map.remove(l); l.destroy(); setGl(null); };
  }, [view]);

  /* Бодит огтлолцлыг инженерийн төрлийн өнгөөр, масштабт тохирсон нарийн шугамаар зурна. */
  useEffect(() => {
    if (!gl) return;
    gl.removeAll();
    if (tipRef.current) tipRef.current.hidden = true;
    gl.addMany(visiblePieces
      .map((p) => {
        const hue = TYPE_BY_KEY.get(p.type)?.hue ?? '#64748b';
        const highlighted = matchesOverlapFocus(focus, 'next', p);
        const g = p.geometry;
        const symbol = g.type === 'polyline'
          ? new SimpleLineSymbol({ color: hue, width: lineWidth + (highlighted ? 0.35 : 0), style: LINE_STYLE[p.type] ?? 'solid', cap: 'round', join: 'round' })
          : g.type === 'polygon'
            ? new SimpleFillSymbol({ color: [...rgbOf(hue), highlighted ? 0.2 : 0.1] as never, outline: { color: hue, width: highlighted ? 0.9 : 0.55 } })
            : new SimpleMarkerSymbol({ color: hue, size: highlighted ? 5.5 : 4, outline: { color: '#ffffff', width: 0.65 } });
        return new Graphic({
          geometry: g,
          attributes: { cats: p.cats, type: p.type, layer: p.layer, len: p.lengthM },
          symbol,
        });
      }));
  }, [gl, visiblePieces, focus, lineWidth]);

  /* ДАВХАРГА сонгоход тэр давхаргын давхцал руу ОЙРТОНО (хэрэглэгч: «zoom to layer and filter») */
  const selLayer = selected?.layer ?? null;
  /* ⚠️ 2026-10-21: СОНГОЛТ солигдоход л НЭГ удаа ойртоно. `visiblePieces`/`selectedZone` нь давхцлыг дахин
     бодох бүрд (ангилал асаах/унтраах, өгөгдөл шинэчлэх) шинэ лавлагаа авдаг тул урьд нь зураг сонголт руу
     буцаж нисч, хэрэглэгчийн шилжүүлгийг (pan) дарж бичдэг байв. Өгөгдөл хараахан ирээгүй (хүрээгүй) бол
     түлхүүрийг тэмдэглэхгүй — ирмэгц нэг удаа ойртоно. Сонголт арилахад цэвэрлэж дахин сонгоход ойртоно. */
  const zoomedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!view || (!selLayer && !selected?.zone)) { zoomedKey.current = null; return; }
    const key = `${selLayer ?? ''}|${selected?.zone ?? ''}`;
    if (zoomedKey.current === key) return;
    let ext: __esri.Extent | null = !selLayer ? selectedZone?.geometry.extent?.clone() ?? null : null;
    for (const p of ext ? [] : visiblePieces) {
      const g = p.geometry;
      const e = g.extent ?? (g.type === 'point'
        ? new Extent({ xmin: g.x, ymin: g.y, xmax: g.x, ymax: g.y, spatialReference: g.spatialReference })
        : null);
      if (e) ext = ext ? ext.union(e) : e.clone();
    }
    if (ext) {
      zoomedKey.current = key;
      // Ганц худаг/богино хэсэгт ч тэг биш, уншигдах хүрээ өгнө.
      const padding = Math.max(ext.width, ext.height, 120) * 0.2;
      view.goTo(new Extent({
        xmin: ext.xmin - padding, ymin: ext.ymin - padding,
        xmax: ext.xmax + padding, ymax: ext.ymax + padding,
        spatialReference: ext.spatialReference,
      })).catch(() => {});
    }
  }, [view, visiblePieces, selLayer, selected?.zone, selectedZone]);

  /* Зөвхөн зурагдсан бодит огтлолцлын тайлбар. */
  useEffect(() => {
    if (!view || view.type !== '2d' || !gl) return;
    const mv = view as __esri.MapView;
    const tip = tipRef.current;
    let seq = 0;
    const h = mv.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      const my = ++seq;
      mv.hitTest(e, { include: [gl] }).then((r) => {
        if (my !== seq || !tip) return;
        const hit = r.results.find((x) => x.type === 'graphic') as __esri.MapViewGraphicHit | undefined;
        const g = hit?.graphic;
        if (!g) { tip.hidden = true; return; }
        const a = g.attributes as { layer: string; cats: OverlapCat[]; type: string; len: number };
        tip.hidden = false;
        tip.innerHTML = '';
        const t = document.createElement('b');
        /* Багц ажлын давхаргын нэр (02-ийн мөртэй ижил) */
        t.textContent = a.layer.replace(/_/g, ' ');
        const d = document.createElement('span');
        d.textContent = `${TYPE_BY_KEY.get(a.type)?.title() ?? a.type} · ${a.len > 0 ? fmtLen(a.len) : tr('худаг / цэг')}`;
        tip.append(t, d);
        placeTip(tip, mv, e.x, e.y);
      }).catch(() => {});
    });
    const out = mv.on('pointer-leave', () => {
      seq++;
      if (tip) tip.hidden = true;
    });
    return () => { h.remove(); out.remove(); };
  }, [view, gl]);

  const busy = (!next.result && !next.error) || (!!next.result && !display && !displayError);
  const visibleTypes = OVERLAP_TYPES.filter((type) => visiblePieces.some((piece) => piece.type === type.key));
  return (
    <>
      <div ref={tipRef} className={s.tip} hidden role="tooltip" />
      {busy && (
        <div className={s.busy} role="status" aria-live="polite">
          <span className={s.spin} aria-hidden />
          {next.step || tr('Бүс тус бүрийн давхцлыг тооцоолж байна…')}
        </div>
      )}
      {!!visibleTypes.length && <div className={s.mapLegend} aria-label={tr('Инженерийн төрөл')}>
        {visibleTypes.map((type) => <span key={type.key}><i style={{ borderColor: type.hue, borderStyle: LINE_STYLE[type.key]?.includes('dot') ? 'dotted' : LINE_STYLE[type.key] ? 'dashed' : 'solid' }} />{type.title()}</span>)}
      </div>}
    </>
  );
}

/* ═══════════════════ Самбар ═══════════════════ */

export function PlanOverlapPanel({
  side, focus, setFocus, selected, setSelected, shown, setShown,
}: {
  side: OverlapSide;
  focus: OverlapFocus; setFocus: (f: OverlapFocus) => void;
  /** ДАРЖ СОНГОСОН карт/мөр — курсор холдсон ч зураг дээр үлдэнэ; дахин дарахад цуцлагдана */
  selected: OverlapFocus; setSelected: (f: OverlapFocus) => void;
  /** Зураг дээр АСААСАН ангиллууд (чагт) — `PlanOverlapLayers`-ийн `shown` */
  shown: OverlapCat[]; setShown: (f: (s: OverlapCat[]) => OverlapCat[]) => void;
}) {
  const { result, step, error } = useOverlap(side);
  const { data: display, error: displayError } = useOverlapDisplay(result, shown, selected);
  const selectedZone = display?.zones.find((zone) => zone.id === selected?.zone);
  const stats = selected?.zone ? selectedZone : display;
  const isSel = (cat: OverlapCat, layer?: string) =>
    !!selected && selected.side === side && selected.cat === cat && selected.layer === layer;
  /* Дэлгэгдсэн ангиллууд — анхдагч нь хумигдсан (хэрэглэгч: «задарч нэмэгддэг байх») */
  const [open, setOpen] = useState<OverlapCat[]>([]);
  const flip = (xs: OverlapCat[], k: OverlapCat) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]);
  const clearCategory = () => setSelected(selected?.zone ? { side, zone: selected.zone } : null);
  const clearZone = () => {
    const scope = overlapScopeFocus(selected);
    setSelected(scope?.cat || scope?.layer || scope?.type ? scope : null);
  };
  const toggle = (cat: OverlapCat, layer?: string) => {
    if (isSel(cat, layer)) { clearCategory(); return; }
    setShown((xs) => xs.includes(cat) ? xs : [...xs, cat]);
    setOpen((xs) => xs.includes(cat) ? xs : [...xs, cat]);
    setSelected({ side, cat, layer, zone: selected?.zone });
  };
  const toggleShown = (cat: OverlapCat) => {
    setShown((xs) => flip(xs, cat));
    clearCategory();
    setFocus(null);
  };
  const selectZone = (id: string) => {
    if (selected?.zone === id) { clearZone(); return; }
    if (!shown.length) setShown(() => [...OVERLAP_SHOWN_CATS]);
    setSelected({ ...(selected ?? { side }), zone: id });
    setFocus(null);
  };

  const byCat = useMemo(() => {
    const m = new Map<OverlapCat, { total: number; count: number; rows: { type: string; layer: string; lengthM: number; count: number }[] }>();
    for (const c of OVERLAP_SHOWN_CATS) m.set(c, { total: 0, count: 0, rows: [] });
    for (const x of result?.cells ?? []) {
      const e = m.get(x.cat);
      if (!e) continue; // 02-т харагдахгүй ангилал (явган зам)
      e.total += x.lengthM;
      e.count += x.count;
      if (x.count > 0) e.rows.push({ type: x.type, layer: x.layer, lengthM: x.lengthM, count: x.count });
    }
    /* Pro скриптийн хүснэгт шиг — уртаар буурахаар (урт тэнцүү бол тоогоор) */
    for (const e of m.values()) e.rows.sort((a, b) => b.lengthM - a.lengthM || b.count - a.count);
    return m;
  }, [result]);

  const selectedTitle = selected?.layer?.replace(/_/g, ' ')
    ?? (selected?.cat ? CAT_BY_KEY.get(selected.cat)?.title() : undefined);

  return (
    <section className={s.panel} aria-label={tr('Инженерийн шугамын давхцал')}>
      {/* ⚠️ 2026-10-13: «Одоогийн / Шинэчлэгдсэн» тал солигч ХАСАГДСАН — 02 нь зөвхөн шинэ тал */}
      {error && <p className={s.err}>{tr('Давхцлыг тооцоолж чадсангүй')}: {error}</p>}
      {!error && !result && (
        <p className={s.wait}><span className={s.spin} aria-hidden />{step || tr('Давхцлыг тооцоолж байна…')}</p>
      )}

      {result && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}>
              <span className={s.kpiVal}>{stats ? fmtLen(stats.lengthM) : '…'}</span>
              <span className={s.kpiLbl}>{tr('Давхардалгүй давхцлын урт')}</span>
            </div>
            <div className={s.kpi}>
              <span className={s.kpiVal}>{stats ? num(stats.count) : '…'}</span>
              <span className={s.kpiLbl}>{tr('Инженерийн объект')}</span>
            </div>
          </div>

          {selectedTitle && (
            <div className={s.selection}>
              <span>{selectedTitle}</span>
              <button type="button" onClick={() => { clearCategory(); setFocus(null); }}>{tr('Сонголт цэвэрлэх')}</button>
            </div>
          )}
          {selectedZone && <div className={s.selection}>
            <span>{zoneTitle(selectedZone)}</span>
            <button type="button" onClick={clearZone}>{tr('Бүх бүс')}</button>
          </div>}
          {!shown.length && <p className={s.note}>{tr('Давхцлыг харахын тулд ангиллаа идэвхжүүлнэ үү.')}</p>}

          {result.failed.length > 0 && (
            <p className={s.warn}>{tr('Татагдаагүй давхарга')}: {result.failed.join(', ')}</p>
          )}

          <ul className={s.cats}>
            {OVERLAP_CATS.filter((c) => OVERLAP_SHOWN_CATS.includes(c.key)).map((c) => {
              const e = byCat.get(c.key)!;
              const catOn = !!focus && focus.side === side && focus.cat === c.key && !focus.layer;
              const isOpen = open.includes(c.key);
              return (
                <li
                  key={c.key}
                  className={`${s.cat} ${catOn ? s.on : ''} ${shown.includes(c.key) ? s.enabled : ''} ${selected?.cat === c.key ? s.sel : ''}`}
                  onMouseEnter={() => setFocus({ side, cat: c.key })}
                  onMouseLeave={() => setFocus(null)}
                >
                  <div className={s.catHead}>
                    <button
                      type="button"
                      className={s.expand}
                      aria-label={c.title()}
                      aria-expanded={isOpen}
                      aria-controls={`overlap-rows-${c.key}`}
                      onClick={() => setOpen((xs) => flip(xs, c.key))}
                    >
                      <span className={`${s.chev} ${isOpen ? s.chevOn : ''}`} aria-hidden>▸</span>
                    </button>
                    <input
                      type="checkbox"
                      className={s.catChk}
                      checked={shown.includes(c.key)}
                      aria-label={`${c.title()} · ${tr('Газрын зураг дээр харуулах')}`}
                      title={tr('Газрын зураг дээр харуулах')}
                      onChange={() => toggleShown(c.key)}
                    />
                    <button
                      type="button"
                      className={s.catSelect}
                      aria-pressed={isSel(c.key)}
                      onClick={() => toggle(c.key)}
                      onFocus={() => setFocus({ side, cat: c.key })}
                      onBlur={() => setFocus(null)}
                    >
                      <span className={s.catSwatch} style={{ background: c.hue }} aria-hidden />
                      <span className={s.catName}>{c.title()}</span>
                      {!selected?.zone && <span className={s.catVal}>
                        {e.count > 0 ? <>{fmtLen(e.total)} <small>· {num(e.count)}</small></> : tr('Давхцалгүй')}
                      </span>}
                    </button>
                  </div>
                  <ul id={`overlap-rows-${c.key}`} className={s.rows} hidden={!isOpen || !e.rows.length}>
                    {e.rows.map((r) => {
                      const ty = TYPE_BY_KEY.get(r.type);
                      const on = !!focus && focus.side === side && focus.cat === c.key && focus.layer === r.layer;
                      return (
                        <li key={r.layer}>
                          <button
                            type="button"
                            className={`${s.row} ${on ? s.on : ''} ${isSel(c.key, r.layer) ? s.sel : ''}`}
                            onMouseEnter={(ev) => { ev.stopPropagation(); setFocus({ side, cat: c.key, layer: r.layer }); }}
                            onMouseLeave={() => setFocus({ side, cat: c.key })}
                            onFocus={() => setFocus({ side, cat: c.key, layer: r.layer })}
                            onBlur={() => setFocus(null)}
                            onClick={() => toggle(c.key, r.layer)}
                            aria-pressed={isSel(c.key, r.layer)}
                            title={ty?.title()}
                          >
                            <span className={s.sysDot} style={{ background: ty?.hue }} aria-hidden />
                            {/* Багц ажлын ДАВХАРГЫН нэр (үйлчилгээнийхээрээ, «_» → зай); өнгө нь төрлийнх */}
                            <span className={s.sysName}>{r.layer.replace(/_/g, ' ')}</span>
                            {!selected?.zone && <span className={s.rowVal}>
                              {/* Урт нь ЗӨВХӨН шугамаас (цэг/талбай — зөвхөн тоонд; Pro-той ижил) */}
                              {r.lengthM > 0 ? fmtLen(r.lengthM) : '—'}
                              <small>{' · '}{num(r.count)} {tr('объект')}</small>
                            </span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          <section className={s.zoneSection} aria-label={tr('Бүс тус бүрийн давхцал')}>
            <div className={s.zoneHeading}>
              <h4>{tr('Бүс тус бүрийн давхцал')}</h4>
              <span>{display ? num(display.zones.length) : '…'} {tr('бүс')}</span>
            </div>
            <p className={s.note}>{shown.length || selectedTitle ? tr('Сонгосон ангилал, давхаргын хүрээнд') : tr('Хэсэгчилсэн ЕТ-ийн бүх ангиллаар')}</p>
            {displayError && <p className={s.err}>{tr('Бүсийн давхцлыг тооцоолж чадсангүй')}: {displayError}</p>}
            {!display && !displayError && <p className={s.wait} role="status"><span className={s.spin} aria-hidden />{tr('Бүс тус бүрийн давхцлыг тооцоолж байна…')}</p>}
            {display && <ol className={s.zoneList}>
              {display.zones.map((zone, index) => <li key={zone.id}>
                <button type="button" className={`${s.zoneRow} ${selected?.zone === zone.id ? s.zoneSelected : ''}`}
                  aria-pressed={selected?.zone === zone.id} onClick={() => selectZone(zone.id)}>
                  <span className={s.zoneRank}>{num(index + 1)}</span>
                  <span className={s.zoneName}>{zoneTitle(zone)}<span className={s.zoneBar} aria-hidden><i style={{ width: `${display.zones[0]?.lengthM ? zone.lengthM / display.zones[0].lengthM * 100 : 0}%` }} /></span></span>
                  <span className={s.zoneValue}>{fmtLen(zone.lengthM)}<small>{num(zone.count)} {tr('объект')}</small></span>
                </button>
              </li>)}
            </ol>}
          </section>
        </>
      )}
    </section>
  );
}
