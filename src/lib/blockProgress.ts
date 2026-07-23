/**
 * Барилгын блок бүрийн НИЙТ ГҮЙЦЭТГЭЛ (%), «Гүйцэтгэл бөглөх» хуудасны as-of
 * логикоор — газрын зураг дээр блокуудыг гүйцэтгэлээр өнгөлөхөд ашиглана.
 *
 * ⚠️ Эх сурвалж нь shapefile-ийн `GUITS_HV` талбар БИШ (тэр нь хуучирсан, нэг
 * блокт олон зөрүүтэй утгатай). Оронд нь `Tusliin_guitsetgel_master` (нээлттэй)
 * хүснэгтээс бүх түүхийг татаж, ажил бүрээр хамгийн сүүлийн утгыг (Огноо→OID)
 * аваад навч ажлыг (Түвшин 3) жингээр жигнэнэ — `BuildingPanel.useTaskPerf`-тэй
 * ЯГ адил тооцоо, зөвхөн блок болгоноор нэг дор.
 *
 * ~40k мөрийг НЭГ УДАА татаад cache-лнэ (≈7с). Тиймээс `loadBlockProgress`-ыг
 * олон газраас дуудсан ч ганц хүсэлт л явна.
 */
import { TASK_PERF } from './services';

const TP = TASK_PERF.fields;
const OID = TASK_PERF.oid;

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
/** «5/1 барилга» / «5/1 блок» → «5/1» (shapefile-ийн BLOK-той тааруулах) */
const normBlock = (b: unknown) => t(b).trim().split(/\s+/)[0];

/** Толгой (header) ажил уу? Навч = Түвшин 3 + бутархай жин (isHeaderAttrs-тэй адил) */
const isHdr = (r: Record<string, unknown>) => {
  const w = r[TP.weight] == null ? null : Number(r[TP.weight]);
  return Number(r[TP.level]) !== 3 || (w != null && Math.abs(w - 1) < 1e-6);
};

async function fetchAll(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const fields = [OID, TP.block, TP.date, TP.version, TP.level, TP.catA, TP.task, TP.weight, TP.progress].join(',');
  for (let off = 0; ; ) {
    const body = new URLSearchParams({
      where: '1=1', outFields: fields, returnGeometry: 'false',
      resultRecordCount: '2000', resultOffset: String(off), f: 'json',
    });
    const res = await fetch(`${TASK_PERF.url}/query`, {
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

export type BlockProgress = { overall: number; leaves: number };
/** Блок → гүйцэтгэл. (`MapCanvas`-д ArcGIS-ийн `Map` нэрийг дарсан тул alias.) */
export type BlockProgressMap = Map<string, BlockProgress>;

function compute(rows: Record<string, unknown>[]): Map<string, BlockProgress> {
  const byBlk = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    if (!isValidDate(t(r[TP.date]))) continue;
    const b = normBlock(r[TP.block]);
    if (!/^\d+\/\d+$/.test(b)) continue; // бохир мөр (жиш. «Гүйцэтгэл»)-ийг хас
    const arr = byBlk.get(b);
    if (arr) arr.push(r); else byBlk.set(b, [r]);
  }
  const result = new Map<string, BlockProgress>();
  for (const [blk, rs] of byBlk) {
    // Upload багц (Огноо|Хувилбар|түүхий блок) бүрд OID дарааллаар section стамп
    const batches = new Map<string, Record<string, unknown>[]>();
    for (const r of rs) {
      const k = `${t(r[TP.date])}|${t(r[TP.version])}|${t(r[TP.block])}`;
      const arr = batches.get(k);
      if (arr) arr.push(r); else batches.set(k, [r]);
    }
    const secOf = new WeakMap<object, string>();
    for (const b of batches.values()) {
      b.sort((x, y) => Number(x[OID]) - Number(y[OID]));
      let sec = '';
      for (const r of b) {
        if (isHdr(r)) sec = t(r[TP.task]);
        secOf.set(r, isHdr(r) ? t(r[TP.task]) : sec);
      }
    }
    // As-of сүүлийн утга ажил бүрээр
    rs.sort((a, b) => {
      const da = t(a[TP.date]), db = t(b[TP.date]);
      if (da !== db) return da < db ? -1 : 1;
      return Number(a[OID]) - Number(b[OID]);
    });
    const win = new Map<string, Record<string, unknown>>();
    for (const r of rs) win.set(`${t(r[TP.level])}|${t(r[TP.catA])}|${secOf.get(r) ?? ''}|${t(r[TP.task])}`, r);
    let twp = 0, tw = 0, leaves = 0;
    for (const r of win.values()) {
      if (Number(r[TP.level]) === 3 && !isHdr(r)) {
        const w = Number(r[TP.weight]) || 0;
        const p = Number(r[TP.progress]) || 0;
        twp += w * p; tw += w; leaves += 1;
      }
    }
    result.set(blk, { overall: tw ? (twp / tw) * 100 : 0, leaves });
  }
  return result;
}

let cache: Promise<Map<string, BlockProgress>> | null = null;

/** Блок бүрийн нийт гүйцэтгэл (0–100). Нэг удаа татаж cache-лнэ. */
export function loadBlockProgress(): Promise<Map<string, BlockProgress>> {
  if (!cache) cache = fetchAll().then(compute).catch((e) => { cache = null; throw e; });
  return cache;
}
