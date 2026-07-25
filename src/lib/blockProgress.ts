/**
 * Барилгын блок бүрийн НИЙТ ГҮЙЦЭТГЭЛ (%) — газрын зураг дээр блокуудыг
 * гүйцэтгэлээр өнгөлөх, tooltip болон баруун самбарт харуулахад ашиглана.
 *
 * ⚠️ Эх сурвалж нь shapefile-ийн `GUITS_HV` талбар БИШ (хуучирсан), навчийн
 * жигнэсэн дундаж ч БИШ. «Гүйцэтгэл бөглөх» хуудасны нэгтгэсэн хүснэгтээс
 * «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» (№ = «Б.») мөрийн тухайн барилгын нүдийг ШУУД
 * авна — эх excel өөрөө дэд-үе шатын жингээр бодсон дүн бөгөөд Бэлтгэл ажлыг
 * (№ «А.») агуулахгүй.
 *
 * Нүд бүрээр ХАМГИЙН СҮҮЛИЙН огноог авна: бөглөх хуудас нь өөрчилсөн нүдээ
 * л шинэ огноогоор нэмдэг тул нэг барилгын нүднүүд өөр өөр огноотой байж болно.
 */
import { TASK_SHEET, buildingKey } from './services';

const TS = TASK_SHEET.fields;

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function fetchConstruction(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const fields = [TS.bagts, TS.date, TS.block, TS.progress].join(',');
  for (let off = 0; ; ) {
    const body = new URLSearchParams({
      where: `${TS.no}='${TASK_SHEET.constructionNo}' AND ${TS.block} IS NOT NULL`,
      outFields: fields, returnGeometry: 'false',
      resultRecordCount: '2000', resultOffset: String(off), f: 'json',
    });
    const res = await fetch(`${TASK_SHEET.url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'ArcGIS error');
    const fs = ((j.features || []) as { attributes: Record<string, unknown> }[]).map((f) => f.attributes);
    out.push(...fs);
    if (!j.exceededTransferLimit || !fs.length) break;
    off += fs.length;
  }
  return out;
}

export type BlockProgress = { overall: number; date: string };
/** `${БАГЦ}|${блок}` → гүйцэтгэл. (`MapCanvas`-д ArcGIS-ийн `Map`-ыг дарсан тул alias.) */
export type BlockProgressMap = Map<string, BlockProgress>;

function compute(rows: Record<string, unknown>[]): BlockProgressMap {
  const out: BlockProgressMap = new Map();
  for (const r of rows) {
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    if (r[TS.progress] == null) continue; // бөглөөгүй нүд — «мэдээлэлгүй» хэвээр
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const prev = out.get(k);
    if (prev && prev.date >= d) continue; // нүд бүрээр хамгийн сүүлийн огноо ялна
    out.set(k, { overall: Number(r[TS.progress]) * 100, date: d });
  }
  return out;
}

let cache: Promise<BlockProgressMap> | null = null;

/** Блок бүрийн нийт гүйцэтгэл (0–100). Нэг удаа татаж cache-лнэ. */
export function loadBlockProgress(): Promise<BlockProgressMap> {
  if (!cache) cache = fetchConstruction().then(compute).catch((e) => { cache = null; throw e; });
  return cache;
}
