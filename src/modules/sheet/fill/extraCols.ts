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
};

/**
 * Дараалал нь ХЭРЭГЛЭГЧИЙН заасан (2026-10-09) — өөрчлөхгүй.
 * ⚠️ 2026-10-08 (хэрэглэгч: «шаардлагагүй field-ийг hide хий»): 16-аас 14-ийг ХАСАВ, зөвхөн
 *    «Бодит эхэлсэн/дууссан» үлдэв. Хассан шалтгаан — дахин нэмэхээс өмнө унш:
 *    · ДАВХАРДАЛ: «Бөглөсөн огноо» = «Шинэчлэгдсэн огноо» багана (`asOf`); «Ажил гүйцэтгэл/
 *      Төлөвлөгөөт гүйцэтгэл1 (хадгалсан)» = «Бодит/Төлөвлөгөөт гүйцэтгэл» (хадгалсан түүхий утга
 *      бодогдсоноос зөрж хоёр өөр хувь харагдана); «Шатлал» = мөрийн догол; «Дэс дугаар» = №.
 *    · ХУВААРИЙН талбар (Хамаарал · Хүн хүч · Машин механизм · Гэрээний эхлэх/дуусах) — «Хуваарь»-т
 *      харагдаж, тэндээ засагдана; гүйцэтгэл бөглөхөд хэрэггүй.
 *    · СИСТЕМИЙН (Үүсгэсэн/Үүсгэгч/Засварласан/Засварлагч) — жааз бөөнөөр бичигддэг тул мөр бүрд ижил.
 *    `extraVal`-ийн бүх төрөл (`int` · `text` · `pct` · `stamp` · `user`) хэвээр — дахин нэмэхэд бэлэн.
 */
const DEFS: { key: string; kind: ExtraKind; pick: (f: Schema["f"]) => string | null | undefined; label: () => string }[] = [
  { key: "aS", kind: "day", pick: (f) => f.rowAS, label: () => tr('Бодит эхэлсэн') },
  { key: "aE", kind: "day", pick: (f) => f.rowAE, label: () => tr('Бодит дууссан') },
];

/** Энэ бүдүүвчид БАЙГАА «Бусад талбар» баганууд — дарааллаараа. */
export function extraCols(sc: Schema | null | undefined): ExtraCol[] {
  if (!sc) return [];
  const out: ExtraCol[] = [];
  for (const d of DEFS) {
    const field = d.pick(sc.f);
    if (field) out.push({ key: d.key, field, kind: d.kind, label: d.label });
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
