'use client';

/**
 * ХҮСНЭГТ РҮҮ БИЧИХ — дурын ArcGIS FeatureServer давхарга/хүснэгтэд.
 */

import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/query';
import { requireCap } from './who';
import type { CapKey } from './caps';

/** Сервер өөрөө удирддаг талбарууд — БИЧИХГҮЙ (илгээвэл хүсэлт бүхэлдээ унана) */
const SERVER_FIELDS = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)/i;

export type EditResult = {
  /** Амжилттай бичигдсэн мөрийн тоо (нэмсэн + зассан + устгасан) */
  n: number;
  /** Нэмсэн мөрүүдийн шинэ OBJECTID */
  oids: number[];
};

type ApplyResult = { success?: boolean; objectId?: number; error?: { description?: string } };

const post = (url: string, body: Record<string, string>) => arcgisPost(url, body);

/**
 * Үр дүнгийн массивыг шалгаж, эхний бүтэлгүйг алдаа болгоно.
 */
function check(list: ApplyResult[], label: string, expected: number): number[] {
  if (list.length !== expected)
    throw new Error(`${label}: ${tr('сервер {0}/{1} мөрийн хариу буцаав — бичигдээгүй гэж үзнэ', list.length, expected)}`);
  const bad = list.find((r) => r.success === false);
  if (bad) throw new Error(`${label}: ${bad.error?.description || tr('амжилтгүй')}`);
  return list.map((r) => r.objectId).filter((x): x is number => typeof x === 'number');
}

/**
 * Серверийн талбаруудыг хасна.
 */
const clean = (a: Record<string, unknown>): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (!SERVER_FIELDS.test(k)) o[k] = v;
  return o;
};

/**
 * НЭМЭХ · ЗАСАХ · УСТГАХ гурвыг НЭГ `applyEdits` хүсэлтээр — АТОМААР.
 */
export async function applyAll(
  url: string,
  oidField: string,
  edit: {
      /**
     * Нэмэх мөрүүд. Талбарууд нь атрибут; ТУСГАЙЛСАН `geometry` түлхүүр нь
     * атрибут БИШ, объектын геометр гэж тайлагдана.
     */
  adds?: Record<string, unknown>[];
    /**
     * Засах мөрүүд. `oidField` ЗААВАЛ агуулна; зөвхөн ӨӨРЧЛӨГДСӨН талбарыг
     * оруулна. `adds`-тай ижлээр `geometry` түлхүүр нь атрибут БИШ.
     */
    updates?: Record<string, unknown>[];
    deletes?: number[];
  },
  opts?: { cap?: CapKey },
): Promise<EditResult> {
  const adds = (edit.adds ?? []).map((a) => {
    const { geometry, ...attrs } = a;
    return geometry == null
      ? { attributes: clean(attrs) }
      : { attributes: clean(attrs), geometry };
  });
  const updates = (edit.updates ?? []).map((a) => {
    const { geometry, ...rest } = a;
    const oid = rest[oidField];
    if (typeof oid !== 'number') throw new Error(tr('Мөрийн дугаар алга — засварыг илгээх боломжгүй'));
    const f: Record<string, unknown> = { attributes: { ...clean(rest), [oidField]: oid } };
    if (geometry != null) f.geometry = geometry;
    return f;
  });
  const deletes = edit.deletes ?? [];
  if (!adds.length && !updates.length && !deletes.length) return { n: 0, oids: [] };

  const body: Record<string, string> = { rollbackOnFailure: 'true' };
  if (adds.length) body.adds = JSON.stringify(adds);
  if (updates.length) body.updates = JSON.stringify(updates);
  if (deletes.length) body.deletes = deletes.join(',');

  if (opts?.cap) requireCap(opts.cap);
  const j = await post(`${url}/applyEdits`, body);
  const oids = check((j.addResults ?? []) as ApplyResult[], tr('Мөр нэмэх'), adds.length);
  const nUpd = check((j.updateResults ?? []) as ApplyResult[], tr('Утга засах'), updates.length).length;
  const nDel = check((j.deleteResults ?? []) as ApplyResult[], tr('Мөр устгах'), deletes.length).length;
  return { n: oids.length + nUpd + nDel, oids };
}
