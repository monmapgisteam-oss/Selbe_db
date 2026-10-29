/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — шинэчлэх хэсгийн ЦЭВЭР логик (React-гүй, сүлжээгүй — тестлэгдэнэ).
 * Харагдац: `src/modules/ZuragTosol.tsx`. Тест: `src/lib/zuragTosol.check.mjs`.
 *
 * Хийх зүйл: `CASHFLOW_NEW`-ийн Excel мөрүүдээс (dd_kod) ТЭЗҮ ба Ажлын зураг төсөл үе шатын НАВЧ
 * мөрийн төлөвлөгөөт огноо (`geree_ehleh`/`geree_duusah`) ба явцыг (`guitsetgel_huvi`, 0–100) засна;
 * багцын зураг төслийн мөрийн доор 4 дэд шатны (А-даалгавар · Загвар зураг · Техникийн нөхцөл ·
 * Магадлал) БҮТЦИЙН мөр нэмнэ. Эцгийн утгыг `projectPlan.computePlan` бодно — энд бичихгүй.
 */
import { parseDayInput } from './dateInput';
import { orderPlanRows, phaseKind, saneDate, type PhaseKind, type PlanNode, type PlanStoredRow, type PlanTree } from './projectPlan';

/* ══════════════════ Тогтмол ══════════════════ */

/** Энэ хэсгийн үе шатууд */
export const ZURAG_PHASES: readonly PhaseKind[] = ['tezu', 'zurag'];

/**
 * Ажлын зураг төслийн 4 ДЭД ШАТ — тохирсон тодорхойлолт (cf-spec «Бусад»).
 */
export const DESIGN_SUBSTAGES = ['А-даалгавар', 'Загвар зураг', 'Техникийн нөхцөл', 'Магадлал'] as const;

/**
 * Шинэ дэд шатны «Хэсэгт эзлэх» жин — БУТАРХАЙ 0–1 (`projectPlan.STORED_WEIGHT`).
 */
export function substageWeight(siblingF: readonly (number | null | undefined)[], newCount: number): number {
  let used = 0;
  for (const f of siblingF) if (typeof f === 'number' && Number.isFinite(f)) used += f;
  return newCount > 0 ? Math.max(0, 1 - used) / newCount : 0;
}

/**
 * Шинэ дэд шатны жин 0 эсэх — Excel-ийн ах дүүс аль хэдийн 100% (эсвэл түүнээс их) эзэлсэн тул ҮЛДЭГДЭЛ алга.
 */
export const zeroWeight = (r: Pick<PlanStoredRow, 'heseg_ezleh_huvi'>): boolean =>
  typeof r.heseg_ezleh_huvi === 'number' && r.heseg_ezleh_huvi <= 1e-9;

/**
 * Шинэ мөрүүдийн жинг ДАХИН хуваарилна — эцэг (`etseg_kod`) бүрээр, `base`-ийн байгаа ах дүүсийн F-ийг
 * хасаад үлдсэнийг шинэ мөрүүдэд жигд. Хадгалах ачаа ба урьдчилсан мод ИЖИЛ жинг ашиглана.
 */
export function weighAdds(base: readonly PlanStoredRow[], adds: readonly PlanStoredRow[]): PlanStoredRow[] {
  const byParent = new Map<string, number>();
  for (const a of adds) { const k = a.etseg_kod ?? ''; byParent.set(k, (byParent.get(k) ?? 0) + 1); }
  const w = new Map<string, number>();
  for (const [k, cnt] of byParent) {
    w.set(k, substageWeight(base.filter((r) => (r.etseg_kod ?? '') === k).map((r) => r.heseg_ezleh_huvi), cnt));
  }
  return adds.map((a) => ({ ...a, heseg_ezleh_huvi: w.get(a.etseg_kod ?? '') ?? a.heseg_ezleh_huvi ?? null }));
}

/** Засах 3 талбар → хадгалах талбарын нэр (жижиг үсэг, Enterprise) */
export const FIELD_OF = {
  start: 'geree_ehleh',
  end: 'geree_duusah',
  pct: 'guitsetgel_huvi',
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

/** Хадгалаагүй бүх засвар: `edits` — мөрийн түлхүүрээр (`rowKey`), `adds` — шинэ дэд шатны мөрүүд */
export type Pending = { edits: Record<string, RowEdit>; adds: PlanStoredRow[] };
export const EMPTY_PENDING: Pending = { edits: {}, adds: [] };

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
    geree_ehleh: dateIn(a.geree_ehleh),
    geree_duusah: dateIn(a.geree_duusah),
    gazar_ehleh: dateIn(a.gazar_ehleh),
    gazar_duusah: dateIn(a.gazar_duusah),
    guits_ehleh: dateIn(a.guits_ehleh),
    guits_duusah: dateIn(a.guits_duusah),
    guitsetgel_huvi: numIn(a.guitsetgel_huvi),
    cashflow_id: numIn(a[names.cfId]),
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
  return dayOf(f === 'start' ? r.geree_ehleh : r.geree_duusah);
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

const parseOf = (f: FieldKey, text: string): Parsed => (f === 'pct' ? parsePct(text) : parseDay(text));

/**
 * Засвар тавина — анхны утга руугаа БУЦВАЛ засвараас хасна (хоосон `RowEdit` үлдэхгүй).
 */
export function setEdit(p: Pending, r: PlanStoredRow, f: FieldKey, text: string): Pending {
  const k = rowKey(r);
  const cur: RowEdit = { ...(p.edits[k] ?? {}) };
  if (text === origText(r, f)) delete cur[f];
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
    if (ps.ok) o[FIELD_OF[f]] = ps.v;
  }
  return o;
}

/**
 * УРЬДЧИЛСАН мөрүүд — засвар + шинэ мөр, dd_kod-оор эрэмбэлсэн. `buildTree`/`computePlan`-д өгч эцгийн
 * утгыг хадгалахаас өмнө харуулна.
 */
export function effectiveRows(base: readonly PlanStoredRow[], p: Pending): PlanStoredRow[] {
  return sortByKod([
    ...base.map((r) => merged(r, p.edits[rowKey(r)])),
    ...weighAdds(base, p.adds).map((r) => merged(r, p.edits[rowKey(r)])),
  ]);
}

/** Хадгалаагүй өөрчлөлттэй мөрийн тоо (засвар ∪ шинэ мөр) */
export const pendingCount = (p: Pending): number =>
  new Set([...Object.keys(p.edits), ...p.adds.map(rowKey)]).size;

/** Шинэ мөрийг (ба түүний засварыг) буцаана */
export function dropAdd(p: Pending, r: PlanStoredRow): Pending {
  const k = rowKey(r);
  const edits = { ...p.edits };
  delete edits[k];
  return { edits, adds: p.adds.filter((x) => rowKey(x) !== k) };
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
  /** Хоосон биш бол ИЛГЭЭХГҮЙ */
  issues: EditIssue[];
};

/**
 * Хадгалсан утга ба шинэ утга ижил үү — огноо UTC өдрөөр, тоо утгаар (null ≠ 0).
 */
const same = (f: FieldKey, a: number | null | undefined, b: number | null): boolean => {
  if (f !== 'pct') return dayOf(a) === dayOf(b);
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
        issues.push({ key, code: r.dd_kod, name: r.ajil_uilchilgee ?? null, kind: f === 'pct' ? 'pct' : 'date' });
        bad = true;
        continue;
      }
      if (!same(f, r[FIELD_OF[f]], ps.v)) out[f] = ps.v;
    }
    if (bad) return null;
    const s = 'start' in out ? out.start ?? null : saneDate(r.geree_ehleh);
    const en = 'end' in out ? out.end ?? null : saneDate(r.geree_duusah);
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

  for (const [key, e] of Object.entries(p.edits)) {
    if (addKeys.has(key)) continue; // шинэ мөр — доор
    const r = byKey.get(key);
    if (!r || r.objectid == null) {
      issues.push({ key, code: null, name: null, kind: 'missing' });
      continue;
    }
    const ch = changes(key, r, e);
    if (!ch || !Object.keys(ch).length) continue;
    const u: Record<string, unknown> = { [names.oid]: r.objectid };
    for (const f of Object.keys(ch) as FieldKey[]) u[FIELD_OF[f]] = ch[f];
    const stage = 'pct' in ch && r.cashflow_id != null ? STAGE_FIELD_OF[rowPhase(base, r)] : undefined;
    if (stage) u[stage] = ch.pct ?? null;
    updates.push(u);
  }

  for (const r of weighAdds(base, p.adds)) {
    const key = rowKey(r);
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
      geree_ehleh: m.geree_ehleh ?? null,
      geree_duusah: m.geree_duusah ?? null,
      guitsetgel_huvi: m.guitsetgel_huvi ?? null,
      [names.cfId]: null,
    });
  }
  return { updates, adds, issues };
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

/** Засагдах мөр — НАВЧ (эцгийн утга хүүхдээс бодогддог тул засахгүй) */
export const isEditable = (n: PlanNode): boolean => inSection(n) && n.children.length === 0 && n.row != null;

/** Нэр харьцуулах түлхүүр — зай, зураас, тэмдэгтийг хаяна («А даалгавар» = «А-даалгавар») */
const nameKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^0-9a-zа-яөүё]/g, '');
const SUB_KEYS = DESIGN_SUBSTAGES.map(nameKey);

/** Дэд шатны мөр мөн үү (нэрээр) */
export const isSubstage = (n: PlanNode): boolean => SUB_KEYS.includes(nameKey(n.row?.ajil_uilchilgee));

/**
 * Дэд шат нэмэх боломж — Ажлын зураг төсөл үе шатын, БАГЦТАЙ, үе шатын толгой биш мөр; хүүхэдгүй эсвэл
 * хүүхэд нь бүгд дэд шат (дутууг нөхнө). Бүлгийн мөрийн (хүүхэд нь багцууд) доор НЭМЭХГҮЙ.
 */
export function substageInfo(n: PlanNode): { can: boolean; missing: string[] } {
  if (n.phase !== 'zurag' || n.depth < 2 || !n.row || !String(n.row.bagts ?? '').trim()) return { can: false, missing: [] };
  if (!n.children.every(isSubstage)) return { can: false, missing: [] };
  const have = new Set(n.children.map((c) => nameKey(c.row?.ajil_uilchilgee)));
  const missing = DESIGN_SUBSTAGES.filter((s) => !have.has(nameKey(s)));
  return { can: missing.length > 0, missing };
}

/**
 * ДУТУУ ДЭД ШАТНЫ ШИНЭ МӨРҮҮД (бичихгүй — `Pending.adds`-д орно).
 * Код = «<эцэг>.<n>» — модонд (засвартай мөрүүд оролцсон) АШИГЛАГДААГҮЙ дараагийн дугаар.
 */
export function substageAdds(n: PlanNode, tree: PlanTree): PlanStoredRow[] {
  const { can, missing } = substageInfo(n);
  if (!can || !n.row) return [];
  const used = new Set(tree.byCode.keys());
  let k = n.children.length + 1;
  const weight = substageWeight(n.children.map((c) => c.row?.heseg_ezleh_huvi), missing.length);
  const phaseName = (() => { let x: PlanNode = n; while (x.parent && x.parent.row) x = x.parent; return x.row?.uy_shat ?? x.row?.ajil_uilchilgee ?? null; })();
  return missing.map((name) => {
    while (used.has(`${n.code}.${k}`)) k += 1;
    const code = `${n.code}.${k}`;
    used.add(code);
    return {
      objectid: null,
      dd_kod: code,
      etseg_kod: n.code,
      tuvshin: n.row!.tuvshin != null ? n.row!.tuvshin + 1 : n.depth,
      uy_shat: n.row!.uy_shat ?? phaseName,
      bagts: n.row!.bagts ?? null,
      blok: n.row!.blok ?? null,
      ajil_uilchilgee: name,
      heseg_ezleh_huvi: weight,
      geree_ehleh: null,
      geree_duusah: null,
      guitsetgel_huvi: null,
      cashflow_id: null,
    };
  });
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
