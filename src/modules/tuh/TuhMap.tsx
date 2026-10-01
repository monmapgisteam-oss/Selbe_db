'use client';

/**
 * ТУХ — СИСТЕМИЙН ГАЗРЫН ЗУРАГ (баруун багана, байнга харагдана).
 *
 * ⚠️ ШИНЭ ЗУРАГ БИШ — «Багцын гүйцэтгэл» (`PkgProg.tsx`)-ийн ЯГ ижил жор:
 *    `MapCanvas` + `MapTools` + `LayerCatalog` + `OpacityPanel`, блокийн давхарга
 *    (`mon:building`) гүйцэтгэлээр будагдана, багц сонгоход тэр багц руу нисч
 *    (`zoomToWhere`) шүүнэ. Дэд бүтцийн багц бол ТҮҮНИЙ давхаргууд (`PKG_BY_BAGTS`).
 *
 * ⚠️ ЗУРАГ НЭГ Л УДАА mount — тойм ↔ дэлгэрэнгүй шилжихэд ДАХИН үүсэхгүй
 *    (ArcGIS view дахин үүсвэл WebGL context алдагдана, `Portal.tsx:656`).
 * ⚠️ `onPick` нь `useCallback` — inline функц `memo(MapCanvas)`-ыг эвддэг.
 * ⚠️ `layerWhere` өгмөгц бүсийн шүүлтийг ЭНД давхарга бүрд тавина (PkgProg-ийн ⚠️).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { BUILDING, PROGRESS_LEVELS, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey, zoneWhere } from '@/lib/services';
import { shade } from '@/lib/format';
import { BLOCK_LAYER, type Pack } from '@/modules/Bagts';
import { pickedBuilding } from '@/modules/BuildingPanel';
import { HUE } from '@/modules/pkgShared';
import s from '../tuh.module.css';

export type MapSel = {
  /** `bagtsKey` — хоосон бол газрын зурагт холбогдох давхаргагүй */
  pkgKey: string;
  housing: boolean;
} | null;

export function TuhMap({ dim, setDim, sel, packs, onPickPkg }: {
  dim: Dim;
  setDim: (d: Dim) => void;
  sel: MapSel;
  /** `buildPacks`-ийн үр дүн — орон сууцны блокийн шүүлт (OID) эндээс */
  packs: Pack[];
  /** Блок дээр товшиход тэр блокийн багц (`bagtsKey`); хоосон газар → `null` */
  onPickPkg: (pkgKey: string | null) => void;
}) {
  const { zoomToWhere, setHighlight } = useMap();
  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /** Сонгосон багцын газрын зургийн илэрхийлэл — давхарга + шүүлт */
  const target = useMemo(() => {
    if (!sel?.pkgKey) return null;
    if (sel.housing) {
      const pk = packs.find((p) => p.kind === 'build' && p.key === sel.pkgKey);
      return pk ? { layerIds: [BLOCK_LAYER], where: pk.where } : null;
    }
    const ids = PKG_BY_BAGTS[sel.pkgKey];
    return ids?.length ? { layerIds: ids, where: null as string | null } : null;
  }, [sel, packs]);

  /* ⚠️ Дэд бүтцийн багцад блокууд ч СУУРЬ хэвээр — шугам нь аль барилгыг
     хангаж байгааг хажууд нь харна. */
  const [visible, setVisible] = useLayerPicks(
    target && !sel?.housing ? [BLOCK_LAYER, ...target.layerIds] : [BLOCK_LAYER],
  );
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  useZoomToFilter({ zone });

  const layerWhere = useMemo<Record<string, string | null>>(() => {
    const w: Record<string, string | null> = {};
    if (zone) {
      for (const id of visible) {
        const d = LAYER_BY_ID[id];
        if (d) w[id] = zoneWhere(d, zone);
      }
    }
    /* ⚠️ Орон сууцны багц — ЗӨВХӨН тэр багцын блокууд; бусад үед бүх блок */
    w[BLOCK_LAYER] = target && sel?.housing ? target.where : (w[BLOCK_LAYER] ?? null);
    return w;
  }, [zone, visible, target, sel]);

  /* Сонгосон багц руу нисэх — дэд бүтцийн багцын `where: null` нь «давхарга бүхэлдээ».
     ⚠️ 2026-09-30: ТЭМДЭГТ МӨРӨӨР түлхүүрлэнэ — `target` нь өгөгдөл шинэчлэгдэх бүрд
     (эх сурвалж хожуу ирэх, автобусаар дахин татах) ШИНЭ объект болдог тул хэрэглэгч
     газрын зургийг томруулж/зөөсөн байхад зураг сонгосон багц руу ДАХИН үсэрдэг байв.
     Одоо зөвхөн давхарга/шүүлт өөрчлөгдөхөд л нисэнэ. */
  const zoomLayer = target?.layerIds[0] ?? '';
  const zoomWhere = target ? (target.where ?? '1=1') : '';
  useEffect(() => {
    if (zoomLayer) zoomToWhere(zoomLayer, zoomWhere);
    else zoomToWhere(BLOCK_LAYER, '1=1');
  }, [zoomLayer, zoomWhere, zoomToWhere]);

  const onMapPick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    const b = pickedBuilding(attrs, layerId);
    if (!b) { onPickPkg(null); setHighlight(null); return; }
    const oid = Number(attrs?.[BUILDING.oid]);
    if (Number.isFinite(oid)) setHighlight(`${BUILDING.oid} = ${oid}`, BLOCK_LAYER);
    onPickPkg(bagtsKey(b.bagts) || null);
  }, [onPickPkg, setHighlight]);

  return (
    <div className={s.map}>
      <MapCanvas
        dim={dim}
        visible={visible}
        opacity={opacity}
        zone={zone}
        layerWhere={layerWhere}
        onPick={onMapPick}
      />
      <MapTools
        dim={dim}
        setDim={setDim}
        layersOpen={catOpen}
        onLayers={() => setCatOpen((v) => !v)}
        opacityOpen={opOpen}
        onOpacity={() => setOpOpen((v) => !v)}
        zone={zone}
        setZone={setZone}
      />
      {catOpen && (
        <div className={s.catPanel}>
          <LayerCatalog
            view="monitor"
            totals={catTotals}
            visible={visible}
            setVisible={setVisible}
            selected={layerSel}
            onSelect={setLayerSel}
            onClose={() => setCatOpen(false)}
            zone={zone}
            embedded
          />
        </div>
      )}
      {opOpen && (
        <OpacityPanel visible={visible} opacity={opacity} setOpacity={setOpacity} onClose={() => setOpOpen(false)} />
      )}
      <div className={s.mapLegend}>
        {target && !sel?.housing
          ? target.layerIds.map((id) => (
            <span key={id} className={s.mapLegendItem}>
              <i style={{ background: LAYER_BY_ID[id]?.hue } as CSSProperties} />
              {LAYER_BY_ID[id]?.title}
            </span>
          ))
          : PROGRESS_LEVELS.map((l, i) => (
            <span key={l.key} className={s.mapLegendItem}>
              <i style={{ background: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length) } as CSSProperties} />
              {l.label} <b>{l.range}</b>
            </span>
          ))}
        {sel && !target && <span className={s.mapLegendItem}>{tr('Энэ багц газрын зурагт давхаргагүй')}</span>}
      </div>
    </div>
  );
}
