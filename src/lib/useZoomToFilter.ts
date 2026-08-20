'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@/components/MapCanvas';
import { ZONE_LAYER } from '@/lib/services';

/**
 * ШҮҮЛТИЙН ДАГУУ ГАЗРЫН ЗУРГИЙГ ТӨВЛӨРҮҮЛЭХ.
 *
 * ⚠️ 2026-08-20 (хэрэглэгчийн хүсэлт): «Бүх дашбоардыг шүүдэг болгоод, шүүлтийн
 * дагуу zoom to layer хийдэг болго».
 *
 * Урьд нь шүүлт нь зөвхөн ӨГӨГДЛИЙГ хумидаг байв: «Багц-3» сонгоход тоо, чарт,
 * давхаргын `definitionExpression` бүгд шүүгдэнэ ч ГАЗРЫН ЗУРАГ хөдөлдөггүй —
 * хэрэглэгч 158 га-гийн ерөнхий харагдацаас тэр багцаа НҮДЭЭР хайж, гараар
 * ойртох шаардлагатай байлаа. «Бүс» хэрэглүүрт «Төвлөрөх» товч байсан ч тэр нь
 * НЭМЭЛТ даралт, бас зөвхөн тэнд.
 *
 * Одоо шүүлт солигдох бүрд зураг өөрөө тэр объектууд руу нисэх бөгөөд шүүлт
 * цэвэрлэгдэхэд бүсийн бүтэн хүрээ рүү холдоно.
 *
 * ⚠️ ЭХНИЙ РЕНДЕРТ ХӨДӨЛГӨХГҮЙ. Харагдац нээгдэхэд зураг өөрийн эхлэлийн
 * байрлалдаа (`HOME`) байгаа бөгөөд тэр үед нисгэвэл ачаалалтын үеийн
 * «үсрэлт» болж, хэрэглэгчийн анхны чиг баримжаа алдагдана. Тиймээс анхны
 * түлхүүрийг ЗӨВХӨН тэмдэглээд өнгөрнө.
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
    if (zone) { zoomToZone(zone); return; }
    // Шүүлт цэвэрлэгдэв — төслийн бүтэн хүрээ рүү
    zoomToLayer(ZONE_LAYER.id);
  }, [zone, layerId, where, zoomToZone, zoomToWhere, zoomToLayer]);
}
