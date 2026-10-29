import type { Schema } from "../bagts.pkg";
import { normDayMs, numLoose, type SheetRow } from "../bagtsSheet";
import { t as tr } from "@/lib/i18nCore";

/** Утгын төрөл — хэлбэржүүлэлт ба баганын өргөний ангилал (`c-xn` · `c-xt` · `c-xd` · `c-xp` · `c-xu`) */
export type ExtraKind = "int" | "text" | "day" | "stamp" | "pct" | "user";

export type ExtraCol = {
  /** React түлхүүр ба шалгуурын нэр */
  key: string;
  /** Үйлчилгээний ЯГ талбарын нэр */
  field: string;
  kind: ExtraKind;
  label: () => string;
  hint?: () => string;
  wKey: string;
  wStyle: { width: string; minWidth: string; maxWidth: string };
};

/**
 * Дараалал нь ХЭРЭГЛЭГЧИЙН заасан (2026-10-09) — өөрчлөхгүй.
 */
const DEFS: { key: string; kind: ExtraKind; pick: (f: Schema["f"]) => string | null | undefined; label: () => string; hint?: () => string }[] = [
  { key: "aS", kind: "day", pick: (f) => f.rowAS, label: () => tr('Бодит эхэлсэн') },
  { key: "aE", kind: "day", pick: (f) => f.rowAE, label: () => tr('Бодит дууссан') },
];

const SYN_HIDE = new Set(["L", "M"]);

/** Энэ бүдүүвчид БАЙГАА «Бусад талбар» баганууд — дарааллаараа. */
export function extraCols(sc: Schema | null | undefined): ExtraCol[] {
  if (!sc) return [];
  const out: ExtraCol[] = [];
  for (const d of DEFS) {
    if (sc.synthetic && SYN_HIDE.has(d.key)) continue;
    const field = d.pick(sc.f);
    if (!field) continue;
    const w = `var(--w-x-${d.key}, var(--w-${extraCls(d.kind).slice(2)}))`;
    out.push({
      key: d.key, field, kind: d.kind, label: d.label, ...(d.hint ? { hint: d.hint } : {}),
      wKey: `x-${d.key}`, wStyle: { width: w, minWidth: w, maxWidth: w },
    });
  }
  return out;
}

/** Мэдэгдэж буй мөрийн түвшний талбар — шошго · төрөл · өргөний тогтвортой түлхүүр */
const KNOWN: { key: string; kind: ExtraKind; pick: (f: Schema["f"]) => string | null | undefined; label: () => string }[] = [
  { key: "des", kind: "int", pick: (f) => f.des, label: () => tr('Дэс дугаар') },
  { key: "ham", kind: "text", pick: (f) => f.ham, label: () => tr('Хамаарал') },
  { key: "bham", kind: "text", pick: (f) => f.bham, label: () => tr('Багцын хамаарал') },
  { key: "hun", kind: "int", pick: (f) => f.hunHuch, label: () => tr('Хүн хүч') },
  { key: "mash", kind: "int", pick: (f) => f.mashin, label: () => tr('Машин механизм') },
  { key: "gS", kind: "day", pick: (f) => f.rowGS, label: () => tr('Гэрээний эхлэх') },
  { key: "gE", kind: "day", pick: (f) => f.rowGE, label: () => tr('Гэрээний дуусах') },
  { key: "aS", kind: "day", pick: (f) => f.rowAS, label: () => tr('Бодит эхэлсэн') },
  { key: "aE", kind: "day", pick: (f) => f.rowAE, label: () => tr('Бодит дууссан') },
  { key: "gun", kind: "int", pick: (f) => f.gun, label: () => tr('Гүн') },
  { key: "fill", kind: "day", pick: (f) => f.fillDate, label: () => tr('Бөглөсөн огноо') },
];
/** Үйлчилгээний нэрээр л танигдах талбарууд (`Schema.f`-д байхгүй) */
const KNOWN_RAW: Record<string, () => string> = {
  ashiglah_material_ner: () => tr('Ашиглах материал'),
};
/** ArcGIS-ийн автоматаар үүсгэдэг талбарууд — ХЭЗЭЭ Ч харуулахгүй */
const AUTO_RE = /^(objectid|fid|globalid|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date|shape|shape__area|shape__length|shape_area|shape_length)$/i;
const DATE_RE = /ognoo|огноо|ehleh|duusah|эхлэх|дуусах|date/i;
/** Өргөний түлхүүр — ASCII (CSS хувьсагчийн нэр), талбарын нэрээс тогтвортой */
const hashKey = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `r${(h >>> 0).toString(36)}`;
};
/** Бүдүүвчийн (`f`-ээс бусад) бүх мөрөн утга — блокийн талбарын нэрс (блокийн нэр г.м. илүүдэл нь хор хөнөөлгүй) */
function schemaStrings(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 4 || v == null) return;
  if (typeof v === "string") { out.add(v); return; }
  if (Array.isArray(v)) { for (const x of v) schemaStrings(x, out, depth + 1); return; }
  if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) schemaStrings(x, out, depth + 1);
}

/** БҮТЭН горимын нэмэлт баганууд — мөрийн түвшний бүх талбар (автомат · үндсэн · блокийн талбаргүй). */
export function fullExtraCols(sc: Schema | null | undefined, rows: readonly SheetRow[]): ExtraCol[] {
  if (!sc) return [];
  const f = sc.f;
  const skip = new Set<string>();
  for (const n of [f.oid, f.no, f.work, f.wC, f.wD, f.wE, f.vol, f.obyemSum, f.plannedVol, f.unit, f.money, f.plan, f.act, f.ratio, f.asOf]) {
    if (n) skip.add(n);
  }
  const rest: Record<string, unknown> = { ...(sc as unknown as Record<string, unknown>) };
  delete rest.f;
  schemaStrings(rest, skip);
  const skipLo = new Set([...skip].map((s) => s.toLowerCase()));
  /* талбарууд — мөрүүдийн `raw`-д ирсэн дарааллаар (эхэлж харсан) */
  const order: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.raw ?? {})) {
      if (seen.has(k)) continue;
      seen.add(k);
      if (AUTO_RE.test(k) || skipLo.has(k.toLowerCase())) continue;
      order.push(k);
    }
  }
  const known = new Map<string, (typeof KNOWN)[number]>();
  for (const d of KNOWN) {
    const n = d.pick(f);
    if (n) known.set(n.toLowerCase(), d);
  }
  const out: ExtraCol[] = [];
  const used = new Set<string>();
  for (const field of order) {
    const d = known.get(field.toLowerCase());
    let kind: ExtraKind;
    let key: string;
    let label: () => string;
    if (d) {
      ({ kind, key, label } = d);
    } else {
      const vals = rows.map((r) => r.raw?.[field]).filter((v) => v != null && v !== "");
      const allNum = vals.length > 0 && vals.every((v) => typeof v === "number");
      kind = allNum ? (DATE_RE.test(field) ? "day" : "int") : DATE_RE.test(field) && vals.length === 0 ? "day" : "text";
      key = hashKey(field);
      const raw = KNOWN_RAW[field.toLowerCase()];
      const plain = field.replace(/_+/g, " ").trim();
      label = raw ?? (() => plain);
    }
    if (used.has(key)) key = hashKey(`${field}#${out.length}`);
    used.add(key);
    const w = `var(--w-x-${key}, var(--w-${extraCls(kind).slice(2)}))`;
    out.push({ key, field, kind, label, wKey: `x-${key}`, wStyle: { width: w, minWidth: w, maxWidth: w } });
  }
  return out;
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** UTC өдөр (`YYYY-MM-DD`) — `fill/util.dt`-тэй ЯГ ижил (util нь CSS импортолдог тул энд давтав). */
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Нүдний бичвэр (+ tooltip).
 */
export function extraVal(col: ExtraCol, r: SheetRow): { text: string; title?: string } {
  const v = r.raw?.[col.field];
  if (v == null || v === "") return { text: "" };
  switch (col.kind) {
    case "text":
    case "user": {
      const s = String(v).trim();
      return s ? { text: s, title: s } : { text: "" };
    }
    case "int": {
      const n = numLoose(v);
      return n == null ? { text: "" } : { text: String(n) };
    }
    case "pct": {
      const n = numLoose(v);
      if (n == null) return { text: "" };
      return { text: (n * 100).toFixed(1).replace(/\.0+$/, "") + "%", title: `${n}` };
    }
    case "day": {
      const ms = normDayMs(numLoose(v));
      return ms == null ? { text: "" } : { text: day(ms) };
    }
    case "stamp": {
      const ms = numLoose(v);
      if (ms == null || !Number.isFinite(ms)) return { text: "" };
      const d = new Date(ms);
      const loc = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      return { text: loc, title: `${loc} ${p2(d.getHours())}:${p2(d.getMinutes())}` };
    }
  }
}

/** Баганын өргөний ангилал (`sheet.module.css` — `.b32 .c-x*`) */
export const extraCls = (k: ExtraKind) =>
  k === "text" ? "c-xt" : k === "user" ? "c-xu" : k === "pct" ? "c-xp" : k === "int" ? "c-xn" : "c-xd";

/* ── Харагдах эсэх — хэрэглэгч тус бүрд хөтөчид санана (анхдагч АСААЛТТАЙ) ── */
export const extraPrefKey = (user: string | null | undefined) => `selbe-fill-extra:${user ?? ""}`;
export function readExtraPref(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
export function writeExtraPref(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* хаалттай орчин — зөвхөн энэ сешнд */
  }
}
