'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@/components/MapCanvas';
import { ZONE_LAYER, LAYER_BY_ID, zoneWhere } from '@/lib/services';

/**
 * ШҮҮЛТИЙН ДАГУУ ГАЗРЫН ЗУРГИЙГ ТӨВЛӨРҮҮЛЭХ.
 *
 * Урьд нь шүүлт нь зөвхөн ӨГӨГДЛИЙГ хумидаг байв: «Багц-3» сонгоход тоо, чарт,
 * давхаргын `definitionExpression` бүгд шүүгдэнэ ч ГАЗРЫН ЗУРАГ хөдөлдөггүй —
 * хэрэглэгч 158 га-гийн ерөнхий харагдацаас тэр багцаа НҮДЭЭР хайж, гараар
 * ойртох шаардлагатай байлаа. «Бүс» хэрэглүүрт «Төвлөрөх» товч байсан ч тэр нь
 * НЭМЭЛТ даралт, бас зөвхөн тэнд.
 *
 * Одоо шүүлт солигдох бүрд зураг өөрөө тэр объектууд руу нисэх бөгөөд шүүлт
 * цэвэрлэгдэхэд бүсийн бүтэн хүрээ рүү холдоно.
 */
export function useZoomToFilter(
  { zone, layerId, where }: {
    /** Бүсийн шүүлт (олон бүс таслалаар) — `MapTools`-ийн «Бүс» */
    zone?: string | null;
    /**
     * Чарт дарж үүссэн шүүлтийн ДАВХАРГА ба WHERE. Хоёулаа байвал бүсээс
     * ДАВАМГАЙЛНА — тэр нь илүү нарийн (жишээ нь «Багц 3.1-ийн блокууд»).
     */
    layerId?: string | null;
    where?: string | null;
  },
) {
  const { zoomToZone, zoomToWhere, zoomToLayer } = useMap();
  /** Сүүлд нисгэсэн шүүлтийн түлхүүр. `null` = хараахан эхлээгүй. */
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const key = `${zone ?? ''}|${layerId ?? ''}|${where ?? ''}`;
    // Эхний рендер — зөвхөн тэмдэглэнэ
    if (prev.current === null) { prev.current = key; return; }
    if (prev.current === key) return;
    prev.current = key;

    if (layerId && where) { zoomToWhere(layerId, where); return; }
    if (layerId) {
      const d = LAYER_BY_ID[layerId];
      const zw = zone && d ? zoneWhere(d, zone) : null;
      if (zw) zoomToWhere(layerId, zw);
      else zoomToLayer(layerId);
      return;
    }
    if (zone) { zoomToZone(zone); return; }
    // Шүүлт цэвэрлэгдэв — төслийн бүтэн хүрээ рүү
    zoomToLayer(ZONE_LAYER.id);
  }, [zone, layerId, where, zoomToZone, zoomToWhere, zoomToLayer]);
}
