/**
 * Порталын нэгдсэн хайлт.
 *
 * Хэрэглэгч блокийн дугаар, гүйцэтгэгчийн нэр, нэгж талбарын дугаар, эзэмшигчийн
 * нэр эсвэл хаягаар хайна. Үр дүн нь ямар МОДУЛЬ, ямар ДАВХАРГАД байгааг зааж,
 * дарахад тийш нь аваачна.
 *
 * ⚠️ Хоёр давхаргыг ЗЭРЭГ асууна. Дараалуулбал 43 мянган мөртэй кадастрын
 * хариу ирэх хүртэл блокийн үр дүн ч харагдахгүй хүлээнэ.
 */

import { queryFeatures, sqlStr } from '@/lib/query';
import { BUILDING, PARCEL, type ModuleKey } from '@/lib/services';
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
  module: ModuleKey;
  /** Газрын зургийн давхаргын id — ойртоход хэрэглэнэ */
  layerId: string;
  /** Модульд орсны дараа ил байх ёстой дэд давхарга */
  sublayer: string;
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
  const P = PARCEL.fields;

  const [blocks, parcels] = await Promise.all([
    queryFeatures(BUILDING.url, {
      where: any([B.block, B.bagts, B.contractor], query),
      outFields: [BUILDING.oid, B.block, B.bagts, B.contractor, B.progress],
      limit: LIMIT,
    }).catch(() => []),
    queryFeatures(PARCEL.url, {
      where: any([P.parcelNo, P.owner, P.address, P.street], query),
      outFields: [PARCEL.oid, P.parcelNo, P.owner, P.address, P.status],
      limit: LIMIT,
    }).catch(() => []),
  ]);

  const hits: Hit[] = [];

  for (const r of blocks) {
    const oid = r[BUILDING.oid];
    if (oid == null) continue;
    hits.push({
      id: `building:${oid}`,
      title: `Блок ${text(r[B.block], '—')}`,
      sub: [text(r[B.bagts], ''), text(r[B.contractor], '')].filter(Boolean).join(' · '),
      group: 'Барилгын блок',
      module: 'building',
      layerId: 'building',
      sublayer: 'building',
      where: `${BUILDING.oid} = ${Number(oid)}`,
    });
  }

  for (const r of parcels) {
    const oid = r[PARCEL.oid];
    if (oid == null) continue;
    hits.push({
      id: `parcel:${oid}`,
      // Эзэмшигчийн нэр байвал түүгээр, эс бөгөөс талбарын дугаараар танина
      title: text(r[P.owner], '') || text(r[P.parcelNo], 'Нэгж талбар'),
      sub: [text(r[P.parcelNo], ''), text(r[P.address], '')].filter(Boolean).join(' · '),
      group: 'Үлдсэн нэгж талбар',
      module: 'land',
      layerId: 'land:parcel',
      sublayer: 'parcel',
      where: `${PARCEL.oid} = ${Number(oid)}`,
    });
  }

  return hits;
}
