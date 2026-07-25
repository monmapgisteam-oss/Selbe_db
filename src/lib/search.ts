/**
 * Порталын нэгдсэн хайлт.
 *
 * Хэрэглэгч блокийн дугаар, гүйцэтгэгчийн нэр, бүсийн дугаар, багц эсвэл
 * барилгын зориулалтаар хайна. Үр дүн нь ямар ХАРАГДАЦ, ямар ДАВХАРГАД байгааг
 * зааж, дарахад тийш нь аваачна.
 *
 * ⚠️ Гурван давхаргыг ЗЭРЭГ асууна. Дараалуулбал хамгийн удаан хариу ирэх
 * хүртэл бусад үр дүн ч харагдахгүй хүлээнэ.
 *
 * ⚠️ Хайлт нь нэг давхарга бүтэлгүйтвэл БҮХЭЛДЭЭ унахгүй (`catch(() => [])`) —
 * ганц FeatureServer түр саатсанаас болж хайлт ажиллахгүй болох нь буруу.
 */

import { queryFeatures, sqlStr } from '@/lib/query';
import {
  BUILDING, ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER, BUILT_FIELDS, layerUrl, oidOf, zoneType, zoneCanon,
  type ViewKey,
} from '@/lib/services';
import { text } from '@/lib/format';

export type Hit = {
  /** Давхардлаас сэргийлэх түлхүүр */
  id: string;
  /** Үр дүнгийн үндсэн мөр — «Блок 5/12» */
  title: string;
  /** Хоёрдогч мөр — «Багц 3 · МСМ ХХК» */
  sub: string;
  /** Аль бүлэгт харагдах */
  group: string;
  /** Аль харагдац руу шилжих */
  view: ViewKey;
  /** Газрын зургийн давхаргын id — ойртоход ба ил болгоход хэрэглэнэ */
  layerId: string;
  /** Тухайн НЭГ объектыг сонгох SQL */
  where: string;
};

/**
 * LIKE-ийн хайлтын хэв.
 *
 * ⚠️ `%` ба `_` нь LIKE-ийн орлуулагч тул хэрэглэгчийн бичсэн тэмдэгт нь
 * орлуулагч болж хувирна. Эдгээр FeatureServer `ESCAPE` заалтыг дэмждэггүйг
 * шалгасан (`services.ts`-ийн `surveyBlock` тайлбарыг үз) тул escape хийж
 * чадахгүй. Хайлтын хувьд энэ нь зөвхөн үр дүнг ӨРГӨЖҮҮЛНЭ — «5_1» гэж хайхад
 * «5/1» ч олдоно — тул хор хөнөөлгүй бөгөөд бүр тустай.
 */
const like = (field: string, q: string) => `UPPER(${field}) LIKE ${sqlStr(`%${q.toUpperCase()}%`)}`;

const any = (fields: string[], q: string) => `(${fields.map((f) => like(f, q)).join(' OR ')})`;

/** Хайлт эхлэх хамгийн богино урт — 1 тэмдэгтээр хайвал бараг бүх мөр буцна */
export const MIN_QUERY = 2;

/** Давхарга тус бүрээс авах дээд хэмжээ — жагсаалт уншигдахуйц байх ёстой */
const LIMIT = 8;

export async function search(q: string): Promise<Hit[]> {
  const query = q.trim();
  if (query.length < MIN_QUERY) return [];

  const B = BUILDING.fields;
  const Z = ZONE_FIELDS;
  const T = BUILT_FIELDS;

  const zoneUrl = layerUrl(ZONE_LAYER);
  const builtUrl = layerUrl(BUILT_LAYER);

  const [blocks, zones, built] = await Promise.all([
    queryFeatures(BUILDING.url, {
      where: any([B.block, B.bagts, B.contractor], query),
      outFields: [BUILDING.oid, B.block, B.bagts, B.contractor],
      limit: LIMIT,
    }).catch(() => []),
    queryFeatures(zoneUrl, {
      // ⚠️ Багц ба гүйцэтгэгчээр хайхаа БОЛЬСОН: шинэ бүсийн давхаргад тэр хоёр
      //    талбар байхгүй. Бүсийг код, ангилал, зориулалтаар нь олно.
      where: any([Z.id, Z.type, Z.purpose], query),
      outFields: [oidOf(ZONE_LAYER), Z.id, Z.type, Z.purpose],
      limit: LIMIT,
    }).catch(() => []),
    queryFeatures(builtUrl, {
      where: any([T.block, T.company, T.purpose], query),
      outFields: [oidOf(BUILT_LAYER), T.block, T.company, T.purpose],
      limit: LIMIT,
    }).catch(() => []),
  ]);

  const hits: Hit[] = [];

  for (const r of blocks) {
    const oid = r[BUILDING.oid];
    if (oid == null) continue;
    hits.push({
      id: `mon:building:${oid}`,
      title: `Блок ${text(r[B.block], '—')}`,
      sub: [text(r[B.bagts], ''), text(r[B.contractor], '')].filter(Boolean).join(' · '),
      group: 'Барилгын блок (гүйцэтгэл)',
      view: 'monitor',
      layerId: 'mon:building',
      where: `${BUILDING.oid} = ${Number(oid)}`,
    });
  }

  for (const r of zones) {
    // ⚠️ Давхарга бүрийн OID талбар өөр нэртэй (бүс `FID`) — `oidOf` уншина
    const oid = r[oidOf(ZONE_LAYER)];
    if (oid == null) continue;
    hits.push({
      // Бүсийн дугаараар танина — хэрэглэгчийн мэддэг ганц тодорхойлогч
      title: `Бүс ${zoneCanon(r[Z.id]) || '—'}`,
      id: `zone:${oid}`,
      sub: [zoneType(r[Z.type]), text(r[Z.purpose], '')].filter(Boolean).join(' · '),
      group: 'Хот төлөвлөлтийн бүс',
      view: 'plan',
      layerId: ZONE_LAYER.id,
      where: `${oidOf(ZONE_LAYER)} = ${Number(oid)}`,
    });
  }

  for (const r of built) {
    const oid = r[oidOf(BUILT_LAYER)];
    if (oid == null) continue;
    hits.push({
      title: text(r[T.block], '') || text(r[T.purpose], 'Барилга'),
      id: `built:${oid}`,
      sub: [text(r[T.purpose], ''), text(r[T.company], '')].filter(Boolean).join(' · '),
      group: 'Барилга (төлөвлөлт)',
      view: 'plan',
      layerId: BUILT_LAYER.id,
      where: `${oidOf(BUILT_LAYER)} = ${Number(oid)}`,
    });
  }

  return hits;
}
