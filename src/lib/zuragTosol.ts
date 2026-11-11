/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — шинэчлэх хэсгийн ЦЭВЭР логик (React-гүй, сүлжээгүй — тестлэгдэнэ).
 * Харагдац: `src/modules/ZuragTosol.tsx`. Тест: `src/lib/zuragTosol.check.mjs`.
 *
 * Хийх зүйл: `CASHFLOW_NEW`-ийн Excel мөрүүдээс (dd_kod) ТЭЗҮ ба Ажлын зураг төсөл үе шатын НАВЧ
 * мөрийн төлөвлөгөөт огноо (`guits_ehleh`/`guits_duusah`) ба явцыг (`guitsetgel_huvi`, 0–100) засна;
 * багцын зураг төслийн мөрийн доор хэрэглэгчийн нэрлэсэн АЖИЛ нэмнэ (2026-11-03, «+ Ажил нэмэх»): жин нь эцгийн
 * доорх нэмсэн ажлуудад ТЭНЦҮҮ хуваагдана (хэрэглэгч хувь эсвэл дүнгээр өөрчилж болно), төсөв нь эцгийн төсвөөс
 * хувиар оноогдоно (`PlanValues.EA`). Эцгийн утгыг `projectPlan.computePlan` бодно — энд бичихгүй.
 */
import { parseDayInput } from './dateInput';
import {
  isAddedWork, orderPlanRows, phaseKind, saneDate, type PhaseKind, type PlanNode, type PlanStoredRow, type PlanTree,
} from './projectPlan';

/* ══════════════════ Тогтмол ══════════════════ */

/** Энэ хэсгийн үе шатууд */
export const ZURAG_PHASES: readonly PhaseKind[] = ['tezu', 'zurag'];

/**
 * Нэмсэн ажлын бүлгийн түлхүүр — ижил `etseg_kod` + ижил багц (Excel-ийн `dd_kod` давхардсан үед өөр эцгийн
 * хүүхдүүдтэй холилдохгүй — 2026-11-02 «2.1.2» = Багц-2 ба «Багц-16, 17»).
 */
const bagtsKey = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z/]/g, '');
const groupOf = (r: PlanStoredRow): string => `${r.etseg_kod ?? ''}|${bagtsKey(r.bagts)}`;

/** Засах талбар → хадгалах талбарын нэр (жижиг үсэг, Enterprise). `weight` — нэмсэн ажлын жин (оролт %, хадгалах 0–1) */
export const FIELD_OF = {
  start: 'guits_ehleh',
  end: 'guits_duusah',
  pct: 'guitsetgel_huvi',
  weight: 'heseg_ezleh_huvi',
} as const;
export type FieldKey = keyof typeof FIELD_OF;

/** Мөр бүрийн засвар — ХЭРЭГЛЭГЧИЙН БИЧСЭН ТЕКСТ (задлалт хадгалахад) */
export type RowEdit = Partial<Record<FieldKey, string>>;

/**
 * МӨНГӨНИЙ мөрийн (`cashflow_id` бий) явцыг ШАТНЫ талбарт ДАВХАР бичнэ — ТЭЗҮ → `tezu`, Ажлын зураг төсөл → `ajliin_zurag_tusul`.
 */
export const STAGE_FIELD_OF: Partial<Record<PhaseKind, string>> = { tezu: 'tezu', zurag: 'ajliin_zurag_tusul' };

/** Мөрийн үе шат — өөрийн `uy_shat`, байхгүй бол эцгүүдийнхээс (`etseg_kod`) */
export function rowPhase(base: readonly PlanStoredRow[], r: PlanStoredRow): PhaseKind {
  const byKod = new Map(base.map((x) => [x.dd_kod ?? '', x] as const));
  let cur: PlanStoredRow | undefined = r;
  for (let i = 0; cur && i < 20; i += 1) {
    if (cur.uy_shat) return phaseKind(cur.uy_shat);
    cur = cur.etseg_kod ? byKod.get(cur.etseg_kod) : undefined;
  }
  return 'other';
}

/**
 * Хадгалаагүй бүх засвар: `edits` — мөрийн түлхүүрээр (`rowKey`), `adds` — шинэ ажлын мөрүүд,
 * `deletes` — устгах хадгалсан нэмсэн ажлын objectid (2026-11-02).
 */
export type Pending = { edits: Record<string, RowEdit>; adds: PlanStoredRow[]; deletes?: number[] };
export const EMPTY_PENDING: Pending = { edits: {}, adds: [], deletes: [] };

/** Үйлчилгээний талбарын нэр — дуудагч `services`-ээс өгнө (lib нь `services`-ээс хамаарахгүй) */
export type Names = { oid: string; cfId: string };

/* ══════════════════ Туслах ══════════════════ */

const DAY_RX = /^(\d{4})-(\d{2})-(\d{2})/;

/** ms → «YYYY-MM-DD» (UTC); огноогүй/буруу бол `''` */
export function dayOf(ms: number | null | undefined): string {
  const v = saneDate(ms);
  return v == null ? '' : new Date(v).toISOString().slice(0, 10);
}

/** «YYYY-MM-DD» → UTC шөнө дунд (ms) */
const msOfDay = (d: string): number => {
  const m = DAY_RX.exec(d)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/**
 * Үйлчилгээний огноо → ms. Date талбар epoch ms-ээр ирнэ; DateOnly бол «2025-09-25» мөр
 * (`fields.ts`-ийн HO) — хоёуланг хүлээнэ.
 */
export function dateIn(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && DAY_RX.test(v.trim())) return msOfDay(v.trim());
  return null;
}

const numIn = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const strIn = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : null;
};

/** Үйлчилгээний мөр (атрибут) → `PlanStoredRow` */
export function toStored(a: Record<string, unknown>, names: Names): PlanStoredRow {
  return {
    objectid: numIn(a[names.oid]),
    dd_kod: strIn(a.dd_kod),
    etseg_kod: strIn(a.etseg_kod),
    tuvshin: numIn(a.tuvshin),
    uy_shat: strIn(a.uy_shat),
    bagts: strIn(a.bagts),
    blok: strIn(a.blok),
    ajil_uilchilgee: strIn(a.ajil_uilchilgee),
    ho_dun_geree: numIn(a.ho_dun_geree),
    heseg_ezleh_huvi: numIn(a.heseg_ezleh_huvi),
    tusul_ezleh_huvi: numIn(a.tusul_ezleh_huvi),
    geree_ehleh: dateIn(a.guits_ehleh),
    geree_duusah: dateIn(a.guits_duusah),
    gazar_ehleh: dateIn(a.gazar_ehleh),
    gazar_duusah: dateIn(a.gazar_duusah),
    guits_ehleh: dateIn(a.guits_ehleh),
    guits_duusah: dateIn(a.guits_duusah),
    guitsetgel_huvi: numIn(a.guitsetgel_huvi),
    cashflow_id: numIn(a[names.cfId]),
    /* Үе шатны milestone огноо (2026-11-04, «Захирамж · Сонгон · Ашиглалт» хуудсууд) */
    geree_ognoo: dateIn(a.geree_ognoo),
    zahiramj_ognoo: dateIn(a.zahiramj_ognoo),
    zahiramj_dugaar: strIn(a.zahiramj_dugaar),
    ashiglalt_ognoo: dateIn(a.ashiglalt_ognoo),
    songon_ognoo: dateIn(a.songon_ognoo),
    /* Ихрийн «Гэрээлсэн дүн» тэмдэг — сонгон шалгаруулалтын явцын түгжээ (`projectPlan.tenderSigned`) */
    ho_dungiin_tailbar: strIn(a.ho_dungiin_tailbar),
  };
}

/* ── dd_kod-ын эрэмбэ ── */

/** Нэг хэсгийг тоогоор («10» > «9»), үлдэгдлийг мөрөөр («1#2») */
const cmpSeg = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });

/**
 * dd_kod-ын ЭРЭМБЭ — «2.10» нь «2.9»-ийн ДАРАА, эцэг хүүхдээсээ ӨМНӨ.
 */
export function cmpKod(a: string | null | undefined, b: string | null | undefined): number {
  const x = String(a ?? '').split('.');
  const y = String(b ?? '').split('.');
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const d = cmpSeg(x[i], y[i]);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * Тогтвортой эрэмбэ — ижил кодтой мөр objectid-ээр (`projectPlan.orderPlanRows`).
 */
export function sortByKod(rows: readonly PlanStoredRow[]): PlanStoredRow[] {
  return orderPlanRows(rows, cmpKod);
}

/* ══════════════════ Засвар ══════════════════ */

/**
 * Мөрийн түлхүүр — байгаа мөр `o<objectid>`, шинэ (нэмэх) мөр `n<dd_kod>`.
 */
export const rowKey = (r: PlanStoredRow): string =>
  (r.objectid != null ? `o${r.objectid}` : `n${r.dd_kod ?? ''}`);

/**
 * Талбарын хадгалсан утга → оролтын текст.
 */
export function origText(r: PlanStoredRow, f: FieldKey): string {
  if (f === 'pct') return r.guitsetgel_huvi == null ? '' : String(Math.round(r.guitsetgel_huvi * 1e6) / 1e6);
  if (f === 'weight') return r.heseg_ezleh_huvi == null ? '' : String(Math.round(r.heseg_ezleh_huvi * 1e8) / 1e6);
  return dayOf(f === 'start' ? r.guits_ehleh : r.guits_duusah);
}

type Parsed = { ok: true; v: number | null } | { ok: false };

/**
 * Огнооны оролт — `parseDayInput`-ийн олон хэлбэр; хоосон → null.
 */
export function parseDay(text: string): Parsed {
  const d = parseDayInput(text);
  if (d == null) return { ok: false };
  if (d === '') return { ok: true, v: null };
  const ms = msOfDay(d);
  return saneDate(ms) == null ? { ok: false } : { ok: true, v: ms };
}

/** Явцын оролт 0–100 (аравтын таслал «12,5» зөвшөөрнө); хоосон → null */
export function parsePct(text: string): Parsed {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, v: null };
  const x = Number(t);
  if (!Number.isFinite(x) || x < 0 || x > 100) return { ok: false };
  return { ok: true, v: x };
}

/** Жингийн оролт 0–100 (%) → хадгалах 0–1; хоосон → null */
export function parseWeight(text: string): Parsed {
  const p = parsePct(text);
  return p.ok && p.v != null ? { ok: true, v: p.v / 100 } : p;
}

const parseOf = (f: FieldKey, text: string): Parsed =>
  (f === 'pct' ? parsePct(text) : f === 'weight' ? parseWeight(text) : parseDay(text));

/**
 * ДҮН → ЖИН (%) — нэмсэн ажлын төсвийг дүнгээр бичихэд эцгийн оноосон төсвийн хувь болгоно.
 * Эцгийн төсөв алга/0 бол null (хувиар оруулна).
 */
export function pctOfAmount(amount: number, parentBudget: number | null | undefined): number | null {
  if (parentBudget == null || !Number.isFinite(parentBudget) || parentBudget <= 0 || !Number.isFinite(amount)) return null;
  return Math.round((amount / parentBudget) * 100 * 1e9) / 1e9;
}

/**
 * Засвар тавина — анхны утга руугаа БУЦВАЛ засвараас хасна (хоосон `RowEdit` үлдэхгүй).
 */
export function setEdit(p: Pending, r: PlanStoredRow, f: FieldKey, text: string): Pending {
  const k = rowKey(r);
  const cur: RowEdit = { ...(p.edits[k] ?? {}) };
  /* Жин — хадгалсан утгатай харьцуулахгүй (тэнцүү хуваалт хадгалсныг өөрчилдөг тул бичсэнийг ҮРГЭЛЖ барина);
     хоосон бол засвар биш (тэнцүү хуваасан жин хэвээр) */
  if (f === 'weight' ? !text.trim() : text === origText(r, f)) delete cur[f];
  else cur[f] = text;
  const edits = { ...p.edits };
  if (Object.keys(cur).length) edits[k] = cur;
  else delete edits[k];
  return { ...p, edits };
}

/** Оролтын текст (засвартай бол засвар, эс бөгөөс хадгалсан) */
export const textOf = (p: Pending, r: PlanStoredRow, f: FieldKey): string =>
  p.edits[rowKey(r)]?.[f] ?? origText(r, f);

/** Оролт буруу эсэх (дэлгэцийн улаан хүрээ) */
export const badText = (f: FieldKey, text: string): boolean => !parseOf(f, text).ok;

/** Засвар хэрэглэсэн мөр — буруу оролт нь ХАДГАЛСАН утгаа барина (урьдчилсан тооцоонд) */
function merged(r: PlanStoredRow, e: RowEdit | undefined): PlanStoredRow {
  if (!e) return r;
  const o: PlanStoredRow = { ...r };
  for (const f of Object.keys(e) as FieldKey[]) {
    const ps = parseOf(f, e[f]!);
    if (ps.ok && !(f === 'weight' && ps.v == null)) o[FIELD_OF[f]] = ps.v;
    /* «Гэрээ (хавсралт 5)» багана санах ойд `guits_*`-ийг дагана (2026-11-04) */
    if (ps.ok && f === 'start') o.geree_ehleh = ps.v;
    if (ps.ok && f === 'end') o.geree_duusah = ps.v;
  }
  return o;
}

/**
 * УРЬДЧИЛСАН мөрүүд — засвар + шинэ мөр, dd_kod-оор эрэмбэлсэн. `buildTree`/`computePlan`-д өгч эцгийн
 * утгыг хадгалахаас өмнө харуулна.
 */
export function effectiveRows(base: readonly PlanStoredRow[], p: Pending): PlanStoredRow[] {
  const kept = withoutDeleted(base, p);
  const sw = splitWeights(base, p);
  /* Эхлээд тэнцүү жин, дараа нь хэрэглэгчийн засвар (бичсэн жин давуу) */
  const row = (r: PlanStoredRow): PlanStoredRow => {
    const w = r.objectid != null ? sw.saved.get(r.objectid) : sw.adds.get(rowKey(r));
    return merged(w == null ? r : { ...r, heseg_ezleh_huvi: w }, p.edits[rowKey(r)]);
  };
  return sortByKod([...kept.map(row), ...p.adds.map(row)]);
}

/** Хадгалаагүй өөрчлөлттэй мөрийн тоо (засвар ∪ шинэ мөр ∪ устгал) */
export const pendingCount = (p: Pending): number =>
  new Set([...Object.keys(p.edits), ...p.adds.map(rowKey), ...(p.deletes ?? []).map((o) => `d${o}`)]).size;

/* ── Устгах · жин тэнцүү хуваах (2026-11-02, 2026-11-03) ── */

/** Устгахаар тэмдэглэснийг хассан суурь мөрүүд */
const withoutDeleted = (base: readonly PlanStoredRow[], p: Pending): PlanStoredRow[] => {
  const del = new Set(p.deletes ?? []);
  return del.size ? base.filter((r) => r.objectid == null || !del.has(r.objectid)) : [...base];
};

/**
 * ЖИН ТЭНЦҮҮ ХУВААХ — ажил нэмсэн эсвэл устгасан эцэг бүрийн доорх БҮХ нэмсэн ажил (хадгалсан + шинэ) 1/k жин авна.
 * Буцаах: хадгалсан мөрийн objectid → жин, шинэ мөрийн `rowKey` → жин. Хэрэглэгчийн бичсэн жин дараа нь давуулна.
 * (`uyShat.ts` — «Зөвшөөрөл (ТТБ)» хуудас мөн ашиглана.)
 */
export function splitWeights(base: readonly PlanStoredRow[], p: Pending): { saved: Map<number, number>; adds: Map<string, number> } {
  const del = new Set(p.deletes ?? []);
  const groups = new Set(p.adds.map(groupOf));
  for (const r of base) if (r.objectid != null && del.has(r.objectid)) groups.add(groupOf(r));
  const saved = new Map<number, number>();
  const adds = new Map<string, number>();
  for (const g of groups) {
    const kept = base.filter((r) => r.objectid != null && !del.has(r.objectid) && r.cashflow_id == null && groupOf(r) === g);
    const fresh = p.adds.filter((a) => groupOf(a) === g);
    const k = kept.length + fresh.length;
    if (!k) continue;
    for (const r of kept) saved.set(r.objectid as number, 1 / k);
    for (const a of fresh) adds.set(rowKey(a), 1 / k);
  }
  return { saved, adds };
}

/** Хадгалсан нэмсэн ажлын мөрийг устгаж болох уу — навч, мөнгөгүй, зураг төслийн үе шат */
export const canDelete = (n: PlanNode): boolean =>
  isAddedWork(n) && n.children.length === 0 && n.row?.objectid != null;

/**
 * Нэмсэн ажлуудын жингийн нийлбэр (%) — эцгийн бүх хүүхэд нэмсэн ажил бол; 100%-аас зөрвөл анхааруулна
 * (ажлуудын төсвийн нийлбэр эцгийн төсөвтэй тэнцэхгүй). Хамаарахгүй бол null.
 */
export function worksWeightSum(n: PlanNode, f: (c: PlanNode) => number | null | undefined): number | null {
  if (!n.children.length || !n.children.every(isAddedWork)) return null;
  let s = 0;
  for (const c of n.children) s += f(c) ?? 0;
  return s;
}

/** Устгах тэмдэг тавих/авах (мөрийн засвар хамт арилна) */
export function toggleDelete(p: Pending, r: PlanStoredRow): Pending {
  const oid = r.objectid;
  if (oid == null) return p;
  const cur = p.deletes ?? [];
  if (cur.includes(oid)) return { ...p, deletes: cur.filter((o) => o !== oid) };
  const edits = { ...p.edits };
  delete edits[rowKey(r)];
  return { ...p, edits, deletes: [...cur, oid] };
}

/** Шинэ мөрийг (ба түүний засварыг) буцаана — устгалын тэмдэг хэвээр */
export function dropAdd(p: Pending, r: PlanStoredRow): Pending {
  const k = rowKey(r);
  const edits = { ...p.edits };
  delete edits[k];
  return { ...p, edits, adds: p.adds.filter((x) => rowKey(x) !== k) };
}

/* ── Илгээх ачаа ── */

export type EditIssue = {
  key: string;
  code: string | null;
  name: string | null;
  /**
   * date — огноо биш (эсвэл 2000–2100-аас гадуур) · pct — 0–100 биш · order — эхлэх > дуусах ·
   * pair — хоёр огнооны зөвхөн нэг нь · missing — мөр олдсонгүй (дахин ачаалсан)
   */
  kind: 'date' | 'pct' | 'order' | 'pair' | 'missing';
};

export type EditPayload = {
  /** `applyAll`-ийн `updates` — oid + ЗӨВХӨН өөрчлөгдсөн талбар */
  updates: Record<string, unknown>[];
  /** `applyAll`-ийн `adds` — шинэ БҮТЦИЙН мөр (`cashflow_id` null) */
  adds: Record<string, unknown>[];
  /** `applyAll`-ийн `deletes` — устгах дэд шатны objectid (2026-11-02) */
  deletes: number[];
  /** Хоосон биш бол ИЛГЭЭХГҮЙ */
  issues: EditIssue[];
};

/**
 * Хадгалсан утга ба шинэ утга ижил үү — огноо UTC өдрөөр, тоо утгаар (null ≠ 0).
 */
const same = (f: FieldKey, a: number | null | undefined, b: number | null): boolean => {
  if (f === 'start' || f === 'end') return dayOf(a) === dayOf(b);
  const x = a ?? null;
  return x == null || b == null ? x === b : Math.abs(x - b) < 1e-9;
};

/**
 * ЗАСВАРЫН АЧАА угсарна.
 */
export function buildEdits(base: readonly PlanStoredRow[], p: Pending, names: Names): EditPayload {
  const updates: Record<string, unknown>[] = [];
  const adds: Record<string, unknown>[] = [];
  const issues: EditIssue[] = [];
  const byKey = new Map(base.map((r) => [rowKey(r), r] as const));
  const addKeys = new Set(p.adds.map(rowKey));

  /** Нэг мөрийн засварыг шалгаад өөрчлөгдсөн утгуудыг буцаана (алдаатай бол null) */
  const changes = (key: string, r: PlanStoredRow, e: RowEdit): Partial<Record<FieldKey, number | null>> | null => {
    const out: Partial<Record<FieldKey, number | null>> = {};
    let bad = false;
    for (const f of Object.keys(e) as FieldKey[]) {
      const ps = parseOf(f, e[f]!);
      if (!ps.ok) {
        issues.push({ key, code: r.dd_kod, name: r.ajil_uilchilgee ?? null, kind: f === 'pct' || f === 'weight' ? 'pct' : 'date' });
        bad = true;
        continue;
      }
      if (!same(f, r[FIELD_OF[f]], ps.v)) out[f] = ps.v;
    }
    if (bad) return null;
    const s = 'start' in out ? out.start ?? null : saneDate(r.guits_ehleh);
    const en = 'end' in out ? out.end ?? null : saneDate(r.guits_duusah);
    if (s != null && en != null && s > en && ('start' in out || 'end' in out)) {
      issues.push({ key, code: r.dd_kod, name: r.ajil_uilchilgee ?? null, kind: 'order' });
      return null;
    }
    if ((s == null) !== (en == null) && ('start' in out || 'end' in out)) {
      issues.push({ key, code: r.dd_kod, name: r.ajil_uilchilgee ?? null, kind: 'pair' });
      return null;
    }
    return out;
  };

  /* Устгал — зөвхөн хадгалсан мөр; алга бол «missing» */
  const deletes: number[] = [];
  for (const o of p.deletes ?? []) {
    if (base.some((r) => r.objectid === o)) deletes.push(o);
    else issues.push({ key: `d${o}`, code: null, name: null, kind: 'missing' });
  }
  const delSet = new Set(deletes);

  for (const [key, e] of Object.entries(p.edits)) {
    if (addKeys.has(key)) continue; // шинэ мөр — доор
    const r = byKey.get(key);
    if (!r || r.objectid == null) {
      issues.push({ key, code: null, name: null, kind: 'missing' });
      continue;
    }
    if (delSet.has(r.objectid)) continue; // устгах мөрийн засвар илгээхгүй
    const ch = changes(key, r, e);
    if (!ch || !Object.keys(ch).length) continue;
    const u: Record<string, unknown> = { [names.oid]: r.objectid };
    for (const f of Object.keys(ch) as FieldKey[]) u[FIELD_OF[f]] = ch[f];
    const stage = 'pct' in ch && r.cashflow_id != null ? STAGE_FIELD_OF[rowPhase(base, r)] : undefined;
    if (stage) u[stage] = ch.pct ?? null;
    updates.push(u);
  }

  /* Жин тэнцүү хуваах — ажил нэмсэн/устгасан эцгийн хадгалсан ажлууд 1/k; хэрэглэгч жинг нь бичсэн мөр — бичсэнээрээ */
  const sw = splitWeights(base, { ...p, deletes });
  for (const [oid, w] of sw.saved) {
    const r = base.find((x) => x.objectid === oid)!;
    if (p.edits[rowKey(r)]?.weight != null) continue;
    if (typeof r.heseg_ezleh_huvi === 'number' && Math.abs(r.heseg_ezleh_huvi - w) < 1e-9) continue;
    const u = updates.find((x) => x[names.oid] === oid);
    if (u) u.heseg_ezleh_huvi = w; else updates.push({ [names.oid]: oid, heseg_ezleh_huvi: w });
  }

  for (const a of p.adds) {
    const key = rowKey(a);
    const w = sw.adds.get(key);
    const r = w == null ? a : { ...a, heseg_ezleh_huvi: w };
    const ch = changes(key, r, p.edits[key] ?? {});
    if (!ch) continue;
    const m = { ...r };
    for (const f of Object.keys(ch) as FieldKey[]) m[FIELD_OF[f]] = ch[f] ?? null;
    adds.push({
      dd_kod: m.dd_kod,
      etseg_kod: m.etseg_kod ?? null,
      tuvshin: m.tuvshin ?? null,
      uy_shat: m.uy_shat ?? null,
      bagts: m.bagts ?? null,
      blok: m.blok ?? null,
      ajil_uilchilgee: m.ajil_uilchilgee ?? null,
      heseg_ezleh_huvi: m.heseg_ezleh_huvi ?? null,
      guits_ehleh: m.guits_ehleh ?? null,
      guits_duusah: m.guits_duusah ?? null,
      guitsetgel_huvi: m.guitsetgel_huvi ?? null,
      [names.cfId]: null,
    });
  }
  return { updates, adds, deletes, issues };
}

/**
 * ЗЭРЭГ ЗАСВАР ИЛРҮҮЛЭХ — хуудас нээх үеийн (`base`) утга серверийн ШИНЭ уншилттай (`fresh`) зөрвөл
 * өөр хүн тэр талбарыг зассан → дарж бичихгүй. Зөвхөн БИДНИЙ бичих гэж буй талбарыг харьцуулна.
 * Буцаах: зөрсөн мөрийн dd_kod (мөр устсан бол мөн).
 */
export function conflicts(
  base: readonly PlanStoredRow[],
  fresh: readonly PlanStoredRow[],
  updates: readonly Record<string, unknown>[],
  names: Names,
): string[] {
  const b = new Map(base.map((r) => [r.objectid, r] as const));
  const f = new Map(fresh.map((r) => [r.objectid, r] as const));
  const out: string[] = [];
  for (const u of updates) {
    const oid = u[names.oid] as number;
    const was = b.get(oid);
    const now = f.get(oid);
    if (!was || !now) { out.push(was?.dd_kod ?? String(oid)); continue; }
    for (const k of Object.keys(FIELD_OF) as FieldKey[]) {
      if (!(FIELD_OF[k] in u)) continue;
      if (!same(k, was[FIELD_OF[k]], (now[FIELD_OF[k]] ?? null) as number | null)) { out.push(was.dd_kod ?? String(oid)); break; }
    }
  }
  return out;
}

/* ══════════════════ Мод ══════════════════ */

/** Энэ хэсгийн мөр мөн үү (ТЭЗҮ · Ажлын зураг төсөл үе шатын доорх) */
export const inSection = (n: PlanNode): boolean => ZURAG_PHASES.includes(n.phase);

export { isAddedWork };

/** Засагдах мөр — НАВЧ (эцгийн утга хүүхдээс бодогддог тул засахгүй) */
export const isEditable = (n: PlanNode): boolean => inSection(n) && n.children.length === 0 && n.row != null;

/** Нэр харьцуулах түлхүүр — зай, зураас, тэмдэгтийг хаяна («А даалгавар» = «А-даалгавар») */
const nameKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^0-9a-zа-яөүё]/g, '');

/**
 * АЖИЛ НЭМЭХ боломж (2026-11-03) — Ажлын зураг төсөл үе шатын, БАГЦТАЙ, үе шатын толгой биш, өөрөө нэмсэн ажил
 * биш мөр; хүүхэдгүй эсвэл хүүхэд нь бүгд нэмсэн ажил. Бүлгийн мөрийн (хүүхэд нь багцууд) доор НЭМЭХГҮЙ.
 */
export function canAddWorkIn(n: PlanNode, phase: PhaseKind): boolean {
  if (n.phase !== phase || n.depth < 2 || !n.row || !String(n.row.bagts ?? '').trim()) return false;
  if (isAddedWork(n)) return false;
  return n.children.every(isAddedWork);
}
export const canAddWork = (n: PlanNode): boolean => canAddWorkIn(n, 'zurag');

/** Шинэ ажлын нэр буруу эсэх — хоосон · `null` = зөв, 'dup' = энэ эцгийн доор ижил нэртэй ажил бий */
export function workNameWhy(n: PlanNode, name: string): 'empty' | 'dup' | null {
  const k = nameKey(name);
  if (!k) return 'empty';
  return n.children.some((c) => nameKey(c.row?.ajil_uilchilgee) === k) ? 'dup' : null;
}

/**
 * ШИНЭ АЖЛЫН МӨР (бичихгүй — `Pending.adds`-д орно). Жинг `effectiveRows`/`buildEdits` тэнцүү хуваана.
 * Код = «<эцэг>.<n>» — модонд (засвартай мөрүүд оролцсон) АШИГЛАГДААГҮЙ дараагийн дугаар.
 */
export function workAdd(n: PlanNode, tree: PlanTree, name: string, phase: PhaseKind = 'zurag'): PlanStoredRow | null {
  if (!canAddWorkIn(n, phase) || !n.row || workNameWhy(n, name)) return null;
  const used = new Set(tree.byCode.keys());
  let k = n.children.length + 1;
  while (used.has(`${n.code}.${k}`)) k += 1;
  const phaseName = (() => { let x: PlanNode = n; while (x.parent && x.parent.row) x = x.parent; return x.row?.uy_shat ?? x.row?.ajil_uilchilgee ?? null; })();
  return {
    objectid: null,
    dd_kod: `${n.code}.${k}`,
    etseg_kod: n.code,
    tuvshin: n.row.tuvshin != null ? n.row.tuvshin + 1 : n.depth,
    uy_shat: n.row.uy_shat ?? phaseName,
    bagts: n.row.bagts ?? null,
    blok: n.row.blok ?? null,
    ajil_uilchilgee: name.trim(),
    heseg_ezleh_huvi: null,
    guits_ehleh: null,
    guits_duusah: null,
    guitsetgel_huvi: null,
    cashflow_id: null,
  };
}

/**
 * ХАРУУЛАХ Д/Д — модны байрлалаас («2.3.1»). Excel-ийн Д/Д давхардах тул dd_kod-ыг шууд харуулахгүй
 * (cf-wave2 «dd_kod … харуулахдаа модны байрлалаас үүсгэнэ»).
 */
export function displayCodes(tree: PlanTree): Map<PlanNode, string> {
  const out = new Map<PlanNode, string>();
  const go = (p: PlanNode, pre: string) => {
    p.children.forEach((c, i) => {
      const code = pre ? `${pre}.${i + 1}` : String(i + 1);
      out.set(c, code);
      go(c, code);
    });
  };
  go(tree.root, '');
  return out;
}
