'use client';

/**
 * ХӨРӨНГӨ ОРУУЛАЛТ · ӨРТӨГ — 90 мөр, төслийн бүх хөрөнгө оруулалт 9 төрлөөр.
 *
 * ⚠️ Ерөнхий дашбоард (төслийн зураг) ба «Багцын мэдээлэл» (багц бүрийн зураг)
 * ХОЁУЛАА уншдаг тул дундын болгов.
 */

import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { INVEST, zoneKey } from '@/lib/services';
import { text } from '@/lib/format';

const IV = INVEST.fields;

export type InvRow = {
  type: string; zone: string; project: string; contractor: string;
  /**
   * `bagts_name` — ТҮҮХИЙ бичиглэлээр («БАГЦ-17.1», «БАГЦ - 19.1», «БАГЦ -21»).
   * ⚠️ Зай, зураасны бохирдол нь `Selbe_ET_20260725`-ын `bagts_name`-тэй ЯГ
   * ижил тул давхаргатай холбохдоо `bagtsKey()`-ээр л жишинэ.
   */
  bagts: string;
  confirmed: number; planned: number; total: number;
  /** `INVEST.sources`-ийн дарааллаар */
  sources: number[];
};

export function useInvest(): Async<InvRow[]> {
  return useAsync(() => queryFeatures(INVEST.url, {
    outFields: [IV.type, IV.zone, IV.project, IV.contractor, IV.bagts, IV.confirmed, IV.planned,
      ...INVEST.sources.map((s) => s.field)],
  }).then((rows) => rows.map((r) => {
    const confirmed = Number(r[IV.confirmed]) || 0;
    const planned = Number(r[IV.planned]) || 0;
    return {
      type: text(r[IV.type], 'Тодорхойгүй'),
      zone: zoneKey(r[IV.zone]),
      project: text(r[IV.project]),
      contractor: text(r[IV.contractor]),
      bagts: text(r[IV.bagts], '').trim(),
      confirmed, planned, total: confirmed + planned,
      sources: INVEST.sources.map((s) => Number(r[s.field]) || 0),
    };
  })), []);
}
