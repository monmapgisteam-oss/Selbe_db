'use client';

/**
 * ХҮСНЭГТ РҮҮ БИЧИХ — дурын ArcGIS FeatureServer давхарга/хүснэгтэд.
 *
 * ⚠️ ЯАГААД `bagtsSheet.ts`-ийг ДАХИН АШИГЛААГҮЙ ВЭ: тэнд байгаа
 * `applyAdds`/`applyUpdates` нь `Pkg` төрлөөс (бөглөх хуудасны схем, багцын
 * бүлэг, `buglusun_ognoo` архивын логик) хамаардаг. Санхүүгийн бүртгэл нь
 * архив үүсгэдэггүй — мөрийг ШУУД засна. Хоёрыг нэг функцэд шахвал аль нэгний
 * нөхцөл нөгөөд нь чимээгүй үйлчилнэ.
 */

import { t as tr } from '@/lib/i18nCore';

/** Сервер өөрөө удирддаг талбарууд — БИЧИХГҮЙ (илгээвэл хүсэлт бүхэлдээ унана) */
const SERVER_FIELDS = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor)/i;

export type EditResult = {
  /** Амжилттай бичигдсэн мөрийн тоо (нэмсэн + зассан + устгасан) */
  n: number;
  /** Нэмсэн мөрүүдийн шинэ OBJECTID */
  oids: number[];
};

type ApplyResult = { success?: boolean; objectId?: number; error?: { description?: string } };

async function post(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, f: 'json' }),
  });
  /* ⚠️ ArcGIS алдаатай ч HTTP 200 буцаадаг — биеийг ЗААВАЛ шалгана */
  const j = (await res.json()) as Record<string, unknown>;
  const e = j.error as { message?: string } | undefined;
  if (e) throw new Error(e.message || tr('ArcGIS алдаа'));
  return j;
}

/**
 * Үр дүнгийн массивыг шалгаж, эхний бүтэлгүйг алдаа болгоно.
 *
 * ⚠️ `applyEdits` нь мөр БҮРИЙН үр дүнг тусад нь буцаадаг: бүхэл хүсэлт
 * амжилттай мэт харагдаад дотор нь `success: false` мөр байж болно.
 */
function check(list: ApplyResult[], label: string): number[] {
  const bad = list.find((r) => r.success === false);
  if (bad) throw new Error(`${label}: ${bad.error?.description || tr('амжилтгүй')}`);
  return list.map((r) => r.objectId).filter((x): x is number => typeof x === 'number');
}

/**
 * Серверийн талбаруудыг хасна.
 *
 * ⚠️ `OBJECTID`-г НЭМЭХ мөрөөс ч хасна — ArcGIS өөрөө оноодог. Мөр хуулбарлаж
 * нэмэхэд эх мөрийн OID дагалдвал хүсэлт унана. Засах мөрөнд OID-г дараа нь
 * ил буцааж тавина.
 */
const clean = (a: Record<string, unknown>): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (!SERVER_FIELDS.test(k)) o[k] = v;
  return o;
};

/**
 * НЭМЭХ · ЗАСАХ · УСТГАХ гурвыг НЭГ `applyEdits` хүсэлтээр — АТОМААР.
 *
 * ⚠️ ЯАГААД ГУРВЫГ САЛГАЖ БОЛОХГҮЙ ВЭ. Гурван тусдаа хүсэлт явуулбал
 * `rollbackOnFailure` нь тус бүрийнхээ ДОТОР л үйлчилнэ. Тэгвэл: нэмэх
 * амжилттай болоод устгах уначихвал хэрэглэгч «алдаа» гэж хараад дахин
 * дарна — нэмсэн мөрүүд нь ХОЁР ДАХЬ УДАА бичигдэж, санхүүгийн хүснэгтэд
 * ЧИМЭЭГҮЙ ДАВХАРДСАН мөр үүснэ. Нэг хүсэлтэд бол бүгд амжилттай, эсвэл
 * бүгд буцна.
 *
 * ⚠️ ХУУДАСЛАХГҮЙ. Хуваавал атомын шинж алдагдана. Энэ нь ГАРААР засварласан
 * багцад зориулагдсан (санхүүгийн хүснэгтүүд 76 ба 90 мөртэй); олон мянган мөр
 * бичих шаардлага гарвал тэр үед хуудаслах функц НЭМЖ бичнэ — одоо байхгүй
 * хэрэгцээнд зориулж таамгаар бичихгүй.
 *
 * ⚠️ `updates` бүр `oidField`-ыг АГУУЛСАН байх ёстой; зөвхөн ӨӨРЧЛӨГДСӨН
 * талбарыг оруулна (дуудагч тал шүүнэ) — бүтэн мөрийг буцааж бичвэл өөр хүн
 * зэрэг зассан баганыг дарж бичнэ.
 *
 * ⚠️ УСТГАЛЫГ БУЦААХ АРГАГҮЙ: эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул
 * устгасан мөр бүрмөсөн алга болно. Дуудагч тал баталгаажуулалт асуух ёстой.
 */
export async function applyAll(
  url: string,
  oidField: string,
  edit: {
    adds?: Record<string, unknown>[];
    updates?: Record<string, unknown>[];
    deletes?: number[];
  },
): Promise<EditResult> {
  const adds = (edit.adds ?? []).map((a) => ({ attributes: clean(a) }));
  const updates = (edit.updates ?? []).map((a) => {
    const oid = a[oidField];
    if (typeof oid !== 'number') throw new Error(tr('Мөрийн дугаар алга — засварыг илгээх боломжгүй'));
    return { attributes: { ...clean(a), [oidField]: oid } };
  });
  const deletes = edit.deletes ?? [];
  if (!adds.length && !updates.length && !deletes.length) return { n: 0, oids: [] };

  const body: Record<string, string> = { rollbackOnFailure: 'true' };
  if (adds.length) body.adds = JSON.stringify(adds);
  if (updates.length) body.updates = JSON.stringify(updates);
  if (deletes.length) body.deletes = deletes.join(',');

  const j = await post(`${url}/applyEdits`, body);
  const oids = check((j.addResults ?? []) as ApplyResult[], tr('Мөр нэмэх'));
  const nUpd = check((j.updateResults ?? []) as ApplyResult[], tr('Утга засах')).length;
  const nDel = check((j.deleteResults ?? []) as ApplyResult[], tr('Мөр устгах')).length;
  return { n: oids.length + nUpd + nDel, oids };
}
