'use client';

/**
 * БАТЛАГДСАН ГҮЙЦЭТГЭЛИЙГ НЭГТГЭЛД БҮРТГЭХ.
 *
 * Дөрвөн шатны хяналт (гүйцэтгэгч → инженер → багцын менежер → ерөнхий
 * менежер) БҮГД өнгөрсний ДАРАА л энэ бүртгэл үүснэ. Өөрөөр хэлбэл
 * `selbe_bagts_guitsetgel_negtgel` нь «хэн нэгний бөглөсөн зүйл» биш,
 * БАТЛАГДСАН баримт.
 *
 * ⚠️ ЗАДАРГАА ЭНД ОРОХГҮЙ. Блок, ажлын мөр, хувийн жин бүгд `Bagts_*` бөглөх
 * хуудсанд үлдэнэ; энд зөвхөн багцын НЭГДСЭН дүн. Задаргааг давхарлавал нэг
 * тоо хоёр эх сурвалжтай болж, аль нь үнэн болох нь эргэлзээтэй болно.
 *
 * ⚠️ ХУВИЙГ ЭНД ДАХИН БОДОХГҮЙ. Бөглөх хуудасны «Б.» мөр нь дэд үе шатуудаа
 * ЖИНГЭЭР нь аль хэдийн нэгтгэсэн байдаг — түүнийг шууд авна. Энд өөрсдөө
 * дундажлавал жин алдагдаж, дэлгэц дээрх тоо хоорондоо зөрнө.
 */

import { BAGTS_NEGTGEL, TASK_SHEET } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';

const F = BAGTS_NEGTGEL.fields;

/** ArcGIS алдааг HTTP 200-аар буцаадаг — биен доторх `error`-ыг ЗААВАЛ шалгана */
async function post(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...body }),
  });
  const j = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS алдаа');
  return j;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Огноог ArcGIS-ийн SQL хэлбэрт — түүхий epoch тоо энэ үйлчилгээнд унадаг */
const ts = (ms: number) =>
  `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

/**
 * Нэг багцын НЭГ АГШНЫ нэгдсэн дүнг бөглөх хуудаснаас гаргана.
 *
 * @param bagts    «Багц 4-1» — хяналтын бүртгэл дэх нэр
 * @param sheetOid Архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID (агшныг үүгээр олно)
 */
async function summaryOf(bagts: string, sheetOid: number) {
  /* Нэг багцад 9F ба 12F хоёр хуудас байж болно — эх мөр аль нь болохыг хэлнэ */
  for (const p of PKGS.filter((x) => x.group === bagts)) {
    const sc = await loadSchema(p).catch(() => null);
    if (!sc?.f.fillDate) continue;

    const head = (await post(`${p.url}/query`, {
      where: `OBJECTID = ${sheetOid}`,
      outFields: sc.f.fillDate,
      returnGeometry: 'false',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const at = head.features?.[0]?.attributes?.[sc.f.fillDate];
    if (typeof at !== 'number') continue;      // энэ хуудсанд тэр мөр алга

    /*
     * «Б.» мөр = БАРИЛГА УГСРАЛТЫН АЖИЛ — багцын нэгдсэн гүйцэтгэл. Эх excel
     * өөрөө дэд үе шатуудыг жингээр нэгтгэсэн байдаг тул ЭНЭ мөрийг шууд авна.
     */
    const cols = [sc.f.no, sc.f.act, sc.f.plan, sc.f.vol, sc.f.obyemSum]
      .filter(Boolean) as string[];
    const q = (await post(`${p.url}/query`, {
      where: `${sc.f.fillDate} = ${ts(at)} AND ${sc.f.no} = N'${TASK_SHEET.constructionNo}'`,
      outFields: [...new Set(cols)].join(','),
      returnGeometry: 'false',
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const a = q.features?.[0]?.attributes;
    if (!a) continue;

    /*
     * ⚠️ ОБЬЁМ нь багцын түвшинд ХОЛИМОГ НЭГЖТЭЙ (м³ бетон + м² хана + ш цонх).
     *    Нийлбэр нь физик утгагүй ч хэрэглэгчийн шийдвэрээр бүртгэгдэнэ —
     *    харьцуулахдаа ЗӨВХӨН өөртэйгөө (төлөвлөгөөт vs бодит) харьцуулна.
     */
    return {
      at,
      progress: num(a[sc.f.act]),
      planned: num(a[sc.f.plan]),
      volume: sc.f.obyemSum ? num(a[sc.f.obyemSum]) : null,
      volumePlan: num(a[sc.f.vol]),
    };
  }
  return null;
}

export type NegtgelResult = { ok: true } | { ok: false; error: string };

/**
 * БАТЛАГДСАН гүйцэтгэлийг нэгтгэлд нэмнэ.
 *
 * ⚠️ ДАВХАРДЛААС ХАМГААЛНА: тухайн багц·огноогоор мөр аль хэдийн байвал ШИНЭ
 *    мөр нэмэхгүй. Ерөнхий менежер хоёр удаа дарах, эсвэл сүлжээ тасарч
 *    дахин илгээгдэх нь бодит тохиолдол.
 */
export async function registerApproved(
  bagts: string,
  sheetOid: number,
): Promise<NegtgelResult> {
  try {
    const s = await summaryOf(bagts, sheetOid);
    if (!s) return { ok: false, error: 'Бөглөх хуудаснаас агшин олдсонгүй' };

    const dup = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${bagts.replace(/'/g, "''")}' AND ${F.date} = ${ts(s.at)}`,
      returnCountOnly: 'true',
    })) as { count?: number };
    if ((dup.count ?? 0) > 0) return { ok: true };   // аль хэдийн бүртгэгдсэн

    await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
      adds: JSON.stringify([{
        attributes: {
          [F.date]: s.at,
          [F.bagts]: bagts,
          [F.progress]: s.progress,
          [F.planned]: s.planned,
          [F.volume]: s.volume,
          [F.volumePlan]: s.volumePlan,
        },
      }]),
    });
    /* ⚠️ Нэгтгэлд шинэ мөр орсон тул `loadPkgProgress` хуучирлаа: 02/04
       дашбоардын төлөвлөгөө-vs-бодит цуваа шууд шинэчлэгдэнэ. */
    invalidate('BAGTS_NEGTGEL');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
