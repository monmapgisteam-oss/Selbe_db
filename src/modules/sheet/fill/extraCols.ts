/*
 * ⚠️ 2026-10-09 (хэрэглэгч: «table fieldудыг бүгдийг шалгаж бүх баганыг ил гарга»): «БУСАД ТАЛБАР» —
 *    бөглөх хүснэгтэд урьд нь ЗУРАГДДАГГҮЙ байсан мөрийн түвшний талбаруудыг ЗӨВХӨН УНШИХ баганаар
 *    хүснэгтийн төгсгөлд ил гаргана (`SheetHead` · `FillRows`).
 *
 * ⚠️ ЗӨВХӨН ХАРАГДАЦ: шинэ засах зам ҮГҮЙ, ямар ч тооцоо (`computeAll`) ба бичих зам (`buildFrame` ·
 *    `applyUpdates`)-д ОРОХГҮЙ. Утга нь сүүлийн жаазны ТЭР Л мөрийн `raw`-аас (`loadRows` нь `*` татдаг) —
 *    тиймээс «Ажил гүйцэтгэл» / «Төлөвлөгөөт гүйцэтгэл1» нь ХАДГАЛСАН түүхий утга (бодогдсон L/M биш).
 * ⚠️ Багана нь ТУХАЙН ҮЙЛЧИЛГЭЭНД талбар байвал л гарна (`Schema.f`-ийн нэр `null` бол алгасна).
 * ⚠️ ObjectID / GlobalID — дотоод дугаар, ЗОРИУД харуулахгүй.
 * ⚠️ `null` ≠ 0: хоосон утга хоосон нүд (0 гэж ХЭЗЭЭ Ч бичихгүй).
 * ⚠️ CSS импортгүй (цэвэр) — `blokgui.check.mjs` шууд импортлоно.
 */
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
  /** ⚠️ Функц — хэл солиход `useMemo`-д хадгалсан шошго хуучрахгүй (зурах бүрд `tr()`) */
  label: () => string;
  /** ⚠️ 2026-10-09: толгойн tooltip-ийн тайлбар (байвал талбарын нэрийн ӨМНӨ) */
  hint?: () => string;
  /**
   * ⚠️ 2026-10-09: БАГАНА ТУС БҮРИЙН өргөний түлхүүр (`useColWidths.grip` → `--w-x-<key>`).
   *    Урьд нь бариул нь ТӨРЛИЙН хувьсагч (`--w-xd` г.м.) чирдэг тул нэг огнооны баганыг
   *    өргөсгөхөд бүх 7 огнооны багана хамт өргөсдөг байв. Түлхүүр нь `key`-ээс (тогтвортой).
   */
  wKey: string;
  /**
   * ⚠️ 2026-10-09: нүд/толгойн inline өргөн — `var(--w-x-<key>, var(--w-<төрөл>))`: багана тус бүрийн
   *    хувьсагч тавигдаагүй бол ТӨРЛИЙН анхдагч (`sheet.module.css` `.b32 { --w-xn … }`, мөн хуучин
   *    хадгалсан төрлийн өргөн) хэвээр үйлчилнэ. Объект нь багана тутамд НЭГ (мөр бүрд шинээр биш).
   */
  wStyle: { width: string; minWidth: string; maxWidth: string };
};

/**
 * ⚠️ 2026-10-09: «Үүсгэсэн/Үүсгэгч/Засварласан/Засварлагч» нь архивын ЖААЗНЫ мөрийн Editor Tracking —
 *    жааз бүр шинэ мөрүүдээр бичигддэг тул энэ нь «хэн/хэзээ ЖААЗ бичсэн» (батлалт · архивлалт),
 *    тухайн ажлыг хэн бөглөснийг БИШ. Шошго нь үүнийг шууд хэлнэ.
 */
const frameHint = () => tr('Архивын жаазны мөрийг хэн/хэзээ бичсэн (Editor Tracking) — тухайн ажлыг хэн бөглөснийг БИШ.');

/** Дараалал нь ХЭРЭГЛЭГЧИЙН заасан (2026-10-09) — өөрчлөхгүй. */
const DEFS: { key: string; kind: ExtraKind; pick: (f: Schema["f"]) => string | null | undefined; label: () => string; hint?: () => string }[] = [
  { key: "des", kind: "int", pick: (f) => f.des, label: () => tr('Дэс дугаар') },
  { key: "ham", kind: "text", pick: (f) => f.ham, label: () => tr('Хамаарал') },
  { key: "gun", kind: "int", pick: (f) => f.gun, label: () => tr('Шатлал') },
  { key: "hun", kind: "int", pick: (f) => f.hunHuch, label: () => tr('Хүн хүч') },
  { key: "mashin", kind: "int", pick: (f) => f.mashin, label: () => tr('Машин механизм') },
  { key: "gS", kind: "day", pick: (f) => f.rowGS, label: () => tr('Гэрээний эхлэх') },
  { key: "gE", kind: "day", pick: (f) => f.rowGE, label: () => tr('Гэрээний дуусах') },
  { key: "aS", kind: "day", pick: (f) => f.rowAS, label: () => tr('Бодит эхэлсэн') },
  { key: "aE", kind: "day", pick: (f) => f.rowAE, label: () => tr('Бодит дууссан') },
  { key: "fill", kind: "day", pick: (f) => f.fillDate, label: () => tr('Бөглөсөн огноо') },
  { key: "L", kind: "pct", pick: (f) => f.rowAct, label: () => tr('Ажил гүйцэтгэл (хадгалсан)') },
  { key: "M", kind: "pct", pick: (f) => f.rowPlan1, label: () => tr('Төлөвлөгөөт гүйцэтгэл1 (хадгалсан)') },
  /* ⚠️ 2026-10-09: «Жааз …» — `frameHint`-ийн ⚠️ (урьд нь «Үүсгэсэн/Үүсгэгч/Засварласан/Засварлагч») */
  { key: "cre", kind: "stamp", pick: (f) => f.created, label: () => tr('Жааз бичсэн огноо'), hint: frameHint },
  { key: "creBy", kind: "user", pick: (f) => f.creator, label: () => tr('Жааз бичигч'), hint: frameHint },
  { key: "ed", kind: "stamp", pick: (f) => f.edited, label: () => tr('Жааз засварласан огноо'), hint: frameHint },
  { key: "edBy", kind: "user", pick: (f) => f.editor, label: () => tr('Жааз засварлагч'), hint: frameHint },
];

/**
 * ⚠️ 2026-10-09: синтетик (блокгүй) бүдүүвчид ХАСАГДАХ баганууд — хадгалсан L/M нь ЯГ тэр баганууд
 *    (`Ажил_гүйцэтгэл` · `Төлөвлөгөөт_гүйцэтгэл1`) үндсэн «Ажил гүйцэтгэл» / «Төлөвлөгөөт
 *    гүйцэтгэл» нүдэнд аль хэдийн харагддаг; давхардахаас гадна хэмжилтгүй мөрд Excel загварын 0-ийг
 *    «0%» гэж харуулж (null ≠ 0) бодогдсон хоосон нүдтэй зөрдөг байв.
 */
const SYN_HIDE = new Set(["L", "M"]);

/** Энэ бүдүүвчид БАЙГАА «Бусад талбар» баганууд — дарааллаараа. */
export function extraCols(sc: Schema | null | undefined): ExtraCol[] {
  if (!sc) return [];
  const out: ExtraCol[] = [];
  for (const d of DEFS) {
    if (sc.synthetic && SYN_HIDE.has(d.key)) continue;
    const field = d.pick(sc.f);
    if (!field) continue;
    /* ⚠️ 2026-10-09: багана тус бүрийн өргөн, төрлийн анхдагч руу унана (`ExtraCol.wStyle`-ийн ⚠️) */
    const w = `var(--w-x-${d.key}, var(--w-${extraCls(d.kind).slice(2)}))`;
    out.push({
      key: d.key, field, kind: d.kind, label: d.label, ...(d.hint ? { hint: d.hint } : {}),
      wKey: `x-${d.key}`, wStyle: { width: w, minWidth: w, maxWidth: w },
    });
  }
  return out;
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** UTC өдөр (`YYYY-MM-DD`) — `fill/util.dt`-тэй ЯГ ижил (util нь CSS импортолдог тул энд давтав). */
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Нүдний бичвэр (+ tooltip).
 * ⚠️ `day` — үйлчилгээний ОГНОО (UTC шөнө дунд) → `normDayMs` (`loadRows`-ийн огноотой нэг дүрэм).
 * ⚠️ `stamp` — Editor Tracking-ийн ЖИНХЭНЭ цаг (UTC) → ЛОКАЛ өдөр; бүтэн цаг tooltip-д.
 *    `normDayMs` хэрэглэхгүй: тэр нь өдөр рүү бөөрөнхийлдөг тул 12:00-аас хойшх цагийг маргааш болгоно.
 * ⚠️ `pct` — хадгалсан 0–1 бутархай (`act` дүрэм) → `(v × 100)%`, аравны нэг хүртэл.
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

/* ── Харагдах эсэх — хэрэглэгч тус бүрд хөтөчид санана (анхдагч АСААЛТТАЙ) ──
   ⚠️ localStorage хаалттай/хоосон орчинд (хувийн цонх, урьдчилсан харагдац) шиднэ — try/catch, анхдагч `true`. */
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
