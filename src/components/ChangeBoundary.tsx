'use client';

import { useEffect } from 'react';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer';
import CIMSymbol from '@arcgis/core/symbols/CIMSymbol';
import { useMap } from '@/components/MapCanvas';

/** 01-д эх хилийг хоёр төлөвлөгөөний дээгүүр тодруулна; шинэ геометр үүсгэхгүй. */
export function ChangeBoundary() {
  const { view } = useMap();

  useEffect(() => {
    if (!view || view.destroyed || view.type !== '2d' || !view.map) return;
    const map = view.map;
    const boundary = map.findLayerById('khil1');
    if (!(boundary instanceof FeatureLayer)) return;
    const previousRenderer = boundary.renderer;
    const previousIndex = map.layers.indexOf(boundary);
    const renderer = new SimpleRenderer({
      symbol: new CIMSymbol({
        data: {
          type: 'CIMSymbolReference',
          symbol: {
            type: 'CIMPolygonSymbol',
            // Эхний зураас нь дээрээ: шар-ногоон хил, доор нь бараан хүрээлэл. Дүүргэлтгүй.
            symbolLayers: [
              { type: 'CIMSolidStroke', enable: true, width: 2, color: [204, 255, 0, 100], capStyle: 'Round', joinStyle: 'Round' },
              { type: 'CIMSolidStroke', enable: true, width: 3.8, color: [15, 23, 42, 95], capStyle: 'Round', joinStyle: 'Round' },
            ],
          },
        },
      }),
    });
    // Дахин ачаалахад khil1 шинэ инстанцаар солигдож, түр renderer нь хуулбарлагдана.
    // Анхны загвар, индексийг нэг л удаа хадгалж, дараагийн хуулбаруудыг эх загвар гэж авахгүй.
    const styled = new Set<FeatureLayer>();
    const restore = (layer: FeatureLayer) => {
      if (!layer.destroyed) layer.renderer = previousRenderer;
    };
    let updating = false;
    const apply = () => {
      if (updating || map.destroyed) return;
      updating = true;
      try {
        const current = map.findLayerById('khil1');
        for (const layer of styled) {
          if (layer !== current) { restore(layer); styled.delete(layer); }
        }
        if (!(current instanceof FeatureLayer) || current.destroyed) return;
        styled.add(current);
        if (current.renderer !== renderer) current.renderer = renderer;
        const top = map.layers.length - 1;
        // reorder өөрөө change үүсгэдэг тул байрлал өөрчлөгдсөн үед л шилжүүлнэ.
        if (map.layers.indexOf(current) !== top) map.reorder(current, top);
      } finally { updating = false; }
    };
    const changes = map.layers.on('change', apply);
    apply();

    return () => {
      changes.remove();
      // Map түр хадгалагдсан ч эх дүрслэл, дарааллыг буцааж бусад хэсэгт нөлөөлөхгүй.
      for (const layer of styled) restore(layer);
      if (!map.destroyed) {
        // Collection-ийн change ирэхээс өмнө салахад ч шинээр солигдсон хуулбарыг олно.
        const current = map.findLayerById('khil1');
        if (current instanceof FeatureLayer) {
          restore(current);
          if (previousIndex >= 0 && map.layers.includes(current)) {
            map.reorder(current, Math.min(previousIndex, map.layers.length - 1));
          }
        }
      }
    };
  }, [view]);

  return null;
}
