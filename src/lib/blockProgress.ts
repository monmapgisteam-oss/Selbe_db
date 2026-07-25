/**
 * Барилгын блок бүрийн БАРИЛГА УГСРАЛТЫН АЖЛЫН гүйцэтгэл — газрын зургийн
 * өнгө, tooltip болон баруун самбарын аль алинд ижил эх сурвалж.
 *
 * ⚠️ Эх сурвалж нь shapefile-ийн `GUITS_HV` талбар БИШ (хуучирсан), навчийн
 * жигнэсэн дундаж ч БИШ. «Гүйцэтгэл бөглөх» хуудасны нэгтгэсэн хүснэгтээс
 * № баганын Б-ийн МӨРҮҮДИЙГ шууд авна:
 *   «Б.»       → нийт гүйцэтгэл (Бэлтгэл ажил ОРОХГҮЙ)
 *   «Б1»…«Б5»  → дэд үе шатууд (барилгын · халаалт · ус · цахилгаан · холбоо)
 * Эх excel өөрөө дэд үе шатын жингээр бодсон дүн тул энд дахин жигнэхгүй.
 *
 * ⚠️ `Tusliin_guitsetgel_master`-т Б-ийн мөр ОГТ БАЙХГҮЙ — тэнд зөвхөн
 * «A. Бэлтгэл ажил» ба навч ажлууд байдаг тул задаргааг тэндээс авч болохгүй.
 *
 * Нүд бүрээр ХАМГИЙН СҮҮЛИЙН огноог авна: бөглөх хуудас нь өөрчилсөн нүдээ
 * л шинэ огноогоор нэмдэг тул нэг барилгын нүднүүд өөр өөр огноотой байж болно.
 */
import { TASK_SHEET, buildingKey } from './services';

const TS = TASK_SHEET.fields;
/** Татах мөрүүд — нийт (Б.) ба таван дэд үе шат */
const NOS = [TASK_SHEET.constructionNo, ...TASK_SHEET.subPhaseNos];

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function fetchConstruction(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const fields = [TS.bagts, TS.no, TS.work, TS.date, TS.block, TS.progress].join(',');
  const inList = NOS.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  for (let off = 0; ; ) {
    const body = new URLSearchParams({
      where: `${TS.no} IN (${inList}) AND ${TS.block} IS NOT NULL`,
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

/** Дэд үе шат — «Б1 · Барилгын ажил · 24%» */
export type SubPhase = { no: string; name: string; pct: number | null };
export type BlockProgress = {
  /** «Б.» мөрийн гүйцэтгэл, 0–100 */
  overall: number;
  /** Тухайн нүдний хамгийн сүүлийн огноо */
  date: string;
  /** Б1…Б5 — № дарааллаар. Бөглөгдөөгүй бол `pct: null`. */
  phases: SubPhase[];
};
/** `${БАГЦ}|${блок}` → гүйцэтгэл. (`MapCanvas`-д ArcGIS-ийн `Map`-ыг дарсан тул alias.) */
export type BlockProgressMap = Map<string, BlockProgress>;

function compute(rows: Record<string, unknown>[]): BlockProgressMap {
  /** барилга → (№ → сүүлийн мөр) */
  const win = new Map<string, Map<string, { pct: number | null; name: string; date: string }>>();
  for (const r of rows) {
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    const no = t(r[TS.no]);
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const cells = win.get(k) ?? new Map();
    const prev = cells.get(no);
    if (prev && prev.date >= d) continue; // нүд бүрээр сүүлийн огноо ялна
    cells.set(no, {
      pct: r[TS.progress] == null ? null : Number(r[TS.progress]) * 100,
      name: t(r[TS.work]),
      date: d,
    });
    win.set(k, cells);
  }

  const out: BlockProgressMap = new Map();
  for (const [k, cells] of win) {
    const total = cells.get(TASK_SHEET.constructionNo);
    // ⚠️ Нийт гүйцэтгэл бөглөгдөөгүй барилгыг ОРУУЛАХГҮЙ — зурагт «мэдээлэлгүй»
    //    саарлаар үлдэх ёстой, 0% гэж будвал «эхлээгүй» гэсэн ХУДАЛ мэдээлэл өгнө.
    if (!total || total.pct == null) continue;
    out.set(k, {
      overall: total.pct,
      date: total.date,
      phases: TASK_SHEET.subPhaseNos.map((no) => ({
        no,
        name: cells.get(no)?.name ?? '',
        pct: cells.get(no)?.pct ?? null,
      })).filter((p) => p.name),
    });
  }
  return out;
}

let cache: Promise<BlockProgressMap> | null = null;

/** Блок бүрийн барилга угсралтын гүйцэтгэл (0–100). Нэг удаа татаж cache-лнэ. */
export function loadBlockProgress(): Promise<BlockProgressMap> {
  if (!cache) cache = fetchConstruction().then(compute).catch((e) => { cache = null; throw e; });
  return cache;
}
