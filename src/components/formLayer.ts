/**
 * `_form` ХАРАГДАЦТАЙ ДАВХАРГА (2026-11-06) — Survey123-ийн `_form` зарим аккаунтад хаалттай (403 → `/map/login/`). Тийм
 * давхаргыг шууд ачаалбал IdentityManager нэвтрэлт шаардана, зураг хоосон үлдэнэ. Иймд ачаалахаас ӨМНӨ `fetch`-ээр шалгаж,
 * хаалттай бол эх үйлчилгээгээр ачаална (мөр, хавсралтын `formSource`-той ижил). Хоёулаа хаалттай бол зурагт гарахгүй.
 * `Query` эрхгүй хаяг (жиш. «Барилгын талбай» маягтын эх: `Create,Editing,Sync,Uploads`) хаалттайд тооцогдоно — давхарга
 * үүсгэж чадахгүй (`query-not-supported`).
 */

import { arcgisPost } from '@/lib/query';
import { formSource } from '@/lib/uzlegReport';

type FormDef = { id: string; url?: string };

/** `_form` хаяг нь нээлттэй нь батлагдсан давхаргууд */
const formOpen = new Set<string>();
const running = new Map<string, Promise<void>>();

export const isFormUrl = (url: string): boolean => formSource(url) !== url;

/** Хаяг уншигдаж, зурагт зурж болох уу. `capabilities` ирээгүй бол саад гэж үзэхгүй */
const canDraw = async (url: string): Promise<void> => {
  const j = await arcgisPost<{ capabilities?: unknown }>(url, { f: 'json' });
  if (typeof j.capabilities === 'string' && !/query/i.test(j.capabilities)) throw new Error('Query эрхгүй');
};

/** Шалгалт дуусаагүй (эсвэл хоёр хаяг хоёулаа хаалттай) `_form` давхарга — зурагт гаргахгүй */
export const formLayerPending = (d: FormDef | undefined): boolean =>
  !!d?.url && isFormUrl(d.url) && !formOpen.has(d.id);

/** Нээлттэй хаягийг тогтооно: `_form` нээлттэй бол хэвээр, эс бөгөөс `d.url`-ыг эх үйлчилгээ болгоно */
export function resolveFormLayer(
  d: FormDef,
  probe: (url: string) => Promise<unknown> = canDraw,
): Promise<void> {
  const url = d.url;
  if (!url || !formLayerPending(d)) return Promise.resolve();
  const live = running.get(d.id);
  if (live) return live;
  const src = formSource(url);
  const p = probe(url)
    .then(
      () => { formOpen.add(d.id); },
      () => probe(src).then(() => { d.url = src; }, () => { /* хоёулаа хаалттай — далд хэвээр */ }),
    )
    .finally(() => { running.delete(d.id); });
  running.set(d.id, p);
  return p;
}
