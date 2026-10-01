/**
 * ХЯНАЛТЫН ШИЙДВЭРИЙН ТҮҮХ (ЛОГ) — `Shiidveriin_tuuh` талбарын цэвэр туслахууд.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): хяналтын мөрд шат бүр ГАНЦ нэр/шалтгааны
 *    талбартай (`hyanalt.SF`) тул нэг мөрөнд нэг шат хоёр удаа шийдвэл (А зөвшөөрөөд,
 *    дээд шат буцаасны дараа Б дахин шалгаж буцаавал) А-гийн нэр ДАРАГДДАГ байв
 *    (`Guitsetgel.overwritten`). Одоо шийдвэр БҮР `{stage, who, at, act, reason}`
 *    үйл явдлаар энэ талбарт НЭМЭГДЭНЭ — талбар үйлчилгээнд БАЙВАЛ л
 *    (`hyanalt.hasHistoryField`); байхгүй бол урьдын зан (нэр дарагдана, тэмдэглэгээ).
 *
 * ⚠️ ХЭМЖЭЭНИЙ ХЯЗГААР: талбар String(65536). Хамгийн ХУУЧИН үйл явдлаас хасна —
 *    тоогоор (`HIST_MAX_ENTRIES`) ба JSON-ы уртаар (`HIST_MAX_CHARS`, нөөцтэй).
 *    Шалтгаан `HIST_REASON_MAX` тэмдэгтээр таслагдана (бүтэн бичвэр нь шатны
 *    `…_шалтгаан` талбарт хэвээр).
 * ⚠️ Энэ файл нь ЦЭВЭР — ArcGIS, React, i18n импортлохгүй (`hyanaltHistory.check.mjs`).
 */
import type { ReviewStage } from './hyanalt';

/** Үйлдэл: ердийн шийдвэр (`apply`) ба дахин шалгалт (`recheck`) */
export type HistAct = 'approve' | 'return' | 'recheck-ok' | 'recheck-back';

export type HistEntry = {
  stage: ReviewStage;
  /** ArcGIS-д бичигдсэн дэлгэцийн нэр (шатны `who`-тэй ижил утга) */
  who: string;
  /** epoch ms — шатны `…_илгээсэн/буцаасан_огноо`-д бичигдсэнтэй ЯГ ижил `t` */
  at: number;
  act: HistAct;
  reason?: string;
};

export const HIST_MAX_ENTRIES = 60;
/** 65536-аас доош нөөцтэй — олон байтын кирилл тэмдэгт ч тоологдоно (JS урт = UTF-16 нэгж) */
export const HIST_MAX_CHARS = 60_000;
export const HIST_REASON_MAX = 1_000;

const STAGES: ReadonlySet<string> = new Set(['engineer', 'manager', 'director', 'head', 'chief']);
const ACTS: ReadonlySet<string> = new Set(['approve', 'return', 'recheck-ok', 'recheck-back']);

/**
 * Түүхий утга → үйл явдлын жагсаалт (хуучнаас шинэ рүү).
 * ⚠️ ТЭСВЭРТЭЙ: эвдэрсэн JSON эсвэл буруу элемент нь ЗӨВХӨН өөрөө хаягдана —
 *    нэг муу бичлэг бүх түүхийг устгахгүй. Хоосон/`null` → `[]`.
 */
export function parseHistory(raw: unknown): HistEntry[] {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  let arr: unknown;
  try { arr = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: HistEntry[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const at = Number(o.at);
    if (!STAGES.has(String(o.stage)) || !ACTS.has(String(o.act)) || !Number.isFinite(at)) continue;
    const e: HistEntry = { stage: o.stage as ReviewStage, who: String(o.who ?? ''), at, act: o.act as HistAct };
    if (typeof o.reason === 'string' && o.reason) e.reason = o.reason;
    out.push(e);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Шинэ үйл явдлыг НЭМЖ, хязгаарт багтаасан JSON буцаана.
 * ⚠️ Хамгийн ХУУЧИН нь эхэлж хасагдана; шинэ үйл явдал ҮРГЭЛЖ үлдэнэ.
 */
export function appendHistory(raw: unknown, e: HistEntry): string {
  const next: HistEntry = {
    stage: e.stage,
    who: String(e.who ?? '').slice(0, 256),
    at: e.at,
    act: e.act,
    ...(e.reason ? { reason: String(e.reason).slice(0, HIST_REASON_MAX) } : {}),
  };
  let list = [...parseHistory(raw), next];
  if (list.length > HIST_MAX_ENTRIES) list = list.slice(list.length - HIST_MAX_ENTRIES);
  let s = JSON.stringify(list);
  while (s.length > HIST_MAX_CHARS && list.length > 1) {
    list = list.slice(1);
    s = JSON.stringify(list);
  }
  return s;
}

/** Зөвшөөрөх төрлийн үйлдэл үү (`Step.kind === 'ok'`-д харгалзана) */
export const isApproveAct = (a: HistAct) => a === 'approve' || a === 'recheck-ok';

/**
 * ТАЛБАРААС ГАРГАСАН АЛХАМ бүрд ЛОГИЙН үйл явдлыг тулгана.
 *
 * Тулгах дүрэм: ижил шат · ижил чиглэл (зөвшөөрөх ↔ `ok`, буцаах ↔ `bad`) ·
 * агшны зөрүү `tolMs`-ээс бага (огнооны талбар ба лог нэг `t`-ээс бичигддэг тул
 * ихэвчлэн 0; ArcGIS-ийн огнооны нарийвчлалд нөөц). Хамгийн ойрыг сонгоно,
 * нэг үйл явдал нэг л алхамд.
 *
 * @returns `matched` — алхам → үйл явдал; `extra` — ямар ч алхамд тулгагдаагүй,
 *          `visible` шатных (жиш. талбар дарагдсан хуучин алхам).
 */
export function attachHistory<T extends { stage?: ReviewStage; kind: 'sent' | 'ok' | 'bad'; at: string | null }>(
  steps: T[],
  log: HistEntry[],
  visible: (s: ReviewStage) => boolean,
  tolMs = 5_000,
): { matched: Map<T, HistEntry>; extra: HistEntry[] } {
  const matched = new Map<T, HistEntry>();
  const used = new Set<HistEntry>();
  for (const st of steps) {
    if (!st.stage || st.kind === 'sent' || !st.at) continue;
    const t = Date.parse(st.at);
    if (!Number.isFinite(t)) continue;
    let best: HistEntry | undefined;
    let bestD = Infinity;
    for (const e of log) {
      if (used.has(e) || e.stage !== st.stage) continue;
      if (isApproveAct(e.act) !== (st.kind === 'ok')) continue;
      const d = Math.abs(e.at - t);
      if (d <= tolMs && d < bestD) { best = e; bestD = d; }
    }
    if (best) { matched.set(st, best); used.add(best); }
  }
  const extra = log.filter((e) => !used.has(e) && visible(e.stage));
  return { matched, extra };
}
