import type { SheetRow, computeAll } from "../bagtsSheet";
import type { Overlay } from "../sheetFrame";
import { t as tr } from "@/lib/i18nCore";
import st from "../sheet.module.css";

export const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(" ");

export { synNoVol } from "../bagtsSheet";
/** ӨНӨӨДРИЙН бөглөх өдөр — `Date.UTC(локал он, сар, өдөр)` (`todayFillMs`). */
export const nowFillMs = () => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};
/** 0..1 → хувь. Бүлгийн нийлбэр бутархай тул аравны нэг хүртэл. */
export const pc = (v: number | null, dec = 0) =>
  v == null ? "" : (v * 100).toFixed(dec).replace(/\.0+$/, "") + "%";
/** Жин: 0.0083 → «0.83%». Маш жижиг жингүүд 0% болж унтрахгүйн тулд ач холбогдол бүхий орноор. */
export const wt = (v: number | null) => {
  if (v == null) return "";
  const p = v * 100;
  if (p === 0) return "0%";
  const d = Math.abs(p) >= 10 ? 1 : Math.abs(p) >= 1 ? 2 : 4;
  return p.toFixed(d).replace(/\.?0+$/, "") + "%";
};
/** Бөөрөнхийлөөгүй бүтэн хувь — tooltip-д (дээд бүлгийн өөрчлөлт жижиг байдаг). */
export const full = (v: number | null) => (v == null ? undefined : (v * 100).toFixed(6) + "%");
/** Оролтын талбарт тавих бичлэг — мянгатын таслалгүй, задлагдах хэлбэрээр. */
export const qtyRaw = (v: number | null | undefined) => (v == null ? "" : String(v));
export const qty = (v: number | null) =>
  v == null ? "" : Number(v.toFixed(3)).toLocaleString("en-US");
export const dt = (ms: number | null) =>
  ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
/** «YYYY-MM-DD» ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд). */
export const inputToMs = (s: string) => (s ? Date.parse(s + "T00:00:00Z") : null);

/**
 * Засагдахгүй нүд дарахад ЯАГААД гэдгийг тайлбарлах бичвэрүүд.
 * Зөвхөн «болохгүй» гэж хэлээд орхивол хэрэглэгч алдаа гэж боддог — тиймээс
 * тухайн багана ЮУНААС бодогддгийг, эсвэл ХААНА бөглөхийг заана.
 */
/**
 * «Обьём» баганын зохиомол блокийн индекс — нэг `edit` төлөвт блокийн нүд ба
 * мөрийн обьёмын нүд хоёулаа багтахын тулд. Блокийн индекс ҮРГЭЛЖ >= 0 тул
 * −1 нь давхцахгүй.
 */
/**
 * Засварлаж болох ЦОРЫН ГАНЦ багана — блокийн ОБЬЁМ.
 */
export type EditCol = "obyem";

/** Нүдний `pending` түлхүүр. */
export const cellKey = (oid: number, b: number) => `${oid}:${b}`;

/**
 * ТУЛГАГДААГҮЙ ТҮЛХҮҮРИЙГ ХҮНД УНШИГДАХААР НЭРЛЭНЭ.
 */
export const describeUnmoved = (
  keys: readonly string[],
  rowKeys: readonly [number, string][],
  bld: readonly string[],
  max = 10,
): string[] => {
  const label = new Map(rowKeys);
  const out = keys.slice(0, max).map((k) => {
    const p = k.split(":");
    const oid = Number(p[0]);
    const b = Number(p[1]);
    const blk = Number.isInteger(b) && bld[b] ? bld[b] : "—";
    const se = p[2] === "s" ? ` · ${tr('эхлэх')}` : p[2] === "e" ? ` · ${tr('дуусах')}` : "";
    return `${label.get(oid) ?? `#${oid}`} · ${blk}${se}`;
  });
  if (keys.length > out.length) out.push(`… +${keys.length - out.length}`);
  return out;
};

export const RO = {
  get no() { return tr('№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.'); },
  get wC() { return tr('Хувийн жин: Мөнгөн дүн ÷ дээд мөрийн дүн. Автоматаар бодогдоно.'); },
  get wD() { return tr('Хувийн жин (нийт төсөлд): Мөнгөн дүн ÷ үе шатны дүн. Автоматаар бодогдоно.'); },
  get wE() { return tr('Одоо байгаа: Хувийн жин × Бодит гүйцэтгэл. Гүйцэтгэл бөглөхөд өөрөө хөдөлнө.'); },
  get vol() { return tr('Обьём нь ЭХ ӨГӨГДЛИЙН тоо хэмжээ — эх хүснэгтэд оруулагдана, энэ хуудаснаас засагдахгүй (жин, мөнгөн дүн бүхэлдээ түүнээс бодогддог).'); },
  get obyemSum() { return tr('Обьёмын нийлбэр: тухайн мөрийн БҮХ блокийн бөглөсөн обьёмын нийлбэр. Илгээлт батлагдах бүрд өөрөө бодогдоно.'); },
  get plannedVol() { return tr('Инженерийн төлөвлөсөн обьём: хяналтын инженерийн зорилт. Засах эрхтэй хүн энэ баганыг засаад «Обьём батлуулах» дарна; батлагдсаны дараа л үндсэн өгөгдөлд бичигдэнэ.'); },
  get plannedVolNoField() { return tr('Энэ багцын үйлчилгээнд «Инженерийн төлөвлөсөн обьём» багана үүсээгүй тул засагдахгүй.'); },
  get plannedVolLocked() { return tr('Батлагдаагүй илгээлт хүлээгдэж байна — шийдвэрлэгдтэл энэ багана түгжээтэй.'); },
  get plannedVolGroup() { return tr('Бүлгийн мөрд төлөвлөсөн обьём бичихгүй — зөвхөн ажлын мөрд.'); },
  get plannedVolNewRow() { return tr('Шинээр нэмсэн мөр батлагдаж үндсэн өгөгдөлд орсны ДАРАА нь төлөвлөсөн обьёмыг бичнэ — одоогоор түр дугаартай тул илгээлтэд орохгүй.'); },
  get unit() { return tr('Нэгж өртөг нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.'); },
  get money() { return tr('Мөнгөн дүн: Обьём × Нэгж өртөг; бүлгийн мөрд дэд мөрүүдийнхээ нийлбэр.'); },
  get I() { return tr('Төлөвлөгөөт гүйцэтгэл нь блокуудын төлөвлөгөөт хувийн дундаж. Огноог засвал өөрчлөгдөнө.'); },
  get J() { return tr('Бодит гүйцэтгэл нь блокуудын бодит хувийн дундаж. Блокийн нүдэнд обьём бөглөнө үү.'); },
  get K() { return tr('Төлөвлөгөө биелэлт: Бодит ÷ Төлөвлөгөөт. Автоматаар бодогдоно.'); },
  get okLocked() { return tr('Хянагч энэ нүдийг ЗӨВШӨӨРСӨН (ногоон ✓) — дахин засахгүй. Зөвхөн улаан хүрээтэй нүдийг засна.'); },
  get groupAct() { return tr('Бүлгийн мөр нь дэд мөрүүдийнхээ жинтэй дунджаар бодогдоно — доод ажлын мөр дээр бөглөнө үү.'); },
  get noObyemField() { return tr('Энэ блокт обьёмын багана үйлчилгээнд үүсээгүй тул хадгалах газаргүй — админд мэдэгдэнэ үү.'); },
  get noRowVol() { return tr('Энэ мөрд «Обьём» бөглөгдөөгүй тул хувь бодогдохгүй. Обьёмын баганад мөрийн нийт тоо хэмжээг оруулмагц хувь нь өөрөө гарч эхэлнэ.'); },
  get synNoVol() { return tr('Энэ ажлын мөрд «Обьём» бөглөгдөөгүй (эсвэл 0) тул гүйцэтгэлийн хувь бодогдохгүй — бөглөх боломжгүй. Эх хүснэгтэд мөрийн Обьёмыг оруулна уу.'); },
  get synCell() { return tr('Өмнөх бөглөлтөөс хойш хийсэн обьёмоо бичнэ — «Обьёмын нийлбэр»-т нэмэгдэж, гүйцэтгэл = нийлбэр ÷ Обьём.'); },
  get pctOnlyHint() { return tr('Энэ блокт обьёмын багана байхгүй тул зөвхөн ХУВИАР бөглөнө — обьём хадгалагдахгүй.'); },
  get blockPlan() { return tr('Барилга-төлөвлөгөөт нь эхлэх/дуусах огноо ба шинэчлэгдсэн огноогоор бодогдоно — огноог нь засаарай.'); },
  get groupDate() { return tr('Энэ огноо нь доод ажлуудынхаа хамгийн эрт эхлэх / хамгийн сүүл дуусахаар бодогдож байна — доод ажлынхаа огноог засаарай.'); },
  get noDateField() { return tr('Энэ блокт огнооны багана үйлчилгээнд байхгүй тул хадгалах газаргүй.'); },
  get asOfRow() { return tr('Шинэчлэгдсэн огноо зөвхөн эхний мөрд бичигдэнэ — тэндээс эсвэл дээд талын «Огноо»-гоор солино.'); },
  get viewOnly() { return tr('Энэ хуудас зөвхөн ХАРАХ горимд нээгдсэн (хяналтын харагдац) — эндээс засвар хийгдэхгүй.'); },
  get noPerf() { return tr('Гүйцэтгэлийн обьём ба огноог зөвхөн энэ багцад томилогдсон гүйцэтгэгч бөглөнө — та зөвхөн мөр нэмэх эрхийнхээ хүрээнд засна.'); },
  get reviewerView() { return tr('Батлагчийн харагдац — хүснэгтийг зөвхөн харна, засвар хийх боломжгүй. Батлах нь «Батлах ажил» табаас.'); },
  reviewLock: (days: string) => tr('Хяналтад явж буй илгээлт ({0}) 7 шатаа бүрэн дуусаагүй байна — 7-р шат батлаж архивласны дараа шинээр бөглөж илгээнэ. Буцаасан илгээлтийг засаж дахин илгээх боломжтой.', days),
  get perfViewOnly() { return tr('Таны томилгоо «Зөвхөн харна» (хөндлөнгийн хяналт) — гүйцэтгэл бөглөх, илгээх боломжгүй.'); },
  get zahiralView() { return tr('Ерөнхий захирал гүйцэтгэлийг зөвхөн ХАРНА — бөглөх, илгээх боломжгүй.'); },
  get notEditing() { return tr('Засвар хаалттай — дээрх «Бөглөх» товчийг дарж нээнэ үү.'); },
  get busy() { return tr('Илгээлт эсвэл ачаалалт явж байна — дуусахыг хүлээгээд дахин засна уу.'); },
  get restoring() { return tr('Ноорог сэргээж байна… түр хүлээнэ үү.'); },
  get extra() { return tr('«Бусад талбар» нь үйлчилгээнд хадгалагдсан утгыг ЗӨВХӨН харуулна — энэ хуудаснаас засагдахгүй.'); },
} as const;


/*
 * ── ГҮЙЦЭТГЭЛ ОБЬЁМООР (2026-08-20, хэрэглэгчийн шийдвэр) ───────────────────
 * Урьд нь блокийн нүдэнд ХУВЬ бичдэг байсныг болив. Одоо:
 *   · нүдэнд НИЙТ хуримтлагдсан обьёмыг бичнэ,
 *   · тэр (НИЙТ) утга үйлчилгээний *_obyem талбарт бичигдэнэ,
 *   · хувь нь «хуримтлал ÷ мөрийн Обьём»-оор бодогдож хуучин талбартаа
 *     хэвээр бичигдэнэ (дашбоард, тайлан бүгд хөндөгдөхгүй).
 */
/**
 * ХЯНАЛТЫН ХАРАГДАЦ — бөглөх хуудсыг ЗАСАГДАХГҮЙ горимоор нээнэ.
 */
export type SheetView = {
  /** `PKGS`-ийн түлхүүр — аль багцын хуудас */
  pkgKey: string;
  /** Аль АГШИН (`YYYY-MM-DD`) — илгээсэн тэр өдрийн бүтэн хуулбар */
  day: string;
  /**
   * ЗАВСРЫН ИЛГЭЭЛТИЙН мөрийн OBJECTID (`Selbe_Guitsetgel_Draft` → `sub|…`).
   */
  subOid?: number;
  /** Өөрчлөгдсөн нүд: `${мөрийн индекс}:${блокийн шошго}` */
  changed?: Set<string>;
  /** Үсрэх хүсэлт — `n` солигдох бүрд шинэ хүсэлт гэж үзнэ */
  jump?: { row: number; block: string; n: number } | null;
  /** ЗӨВШӨӨРСӨН нүднүүд — `changed`-тэй ижил түлхүүр. Ногооноор тэмдэглэнэ. */
  ok?: Set<string>;
  /**
   * Өөрчлөгдсөн нүд дээр дарахад — зөвшөөрөл асаах/унтраах.
   */
  onCell?: (row: number, block: string) => string | void;
};

/**
 * ИЛГЭЭЛТИЙН НҮДНИЙ ТҮЛХҮҮРИЙГ ДЭЛГЭЦИЙН ИНДЕКС РҮҮ ХӨРВҮҮЛНЭ.
 */
export function changedKeys(base: SheetRow[], ov: Overlay, bld: string[]): Set<string> {
  const baseBy = new Map(base.map((r) => [r.oid, r] as const));
  const ovBy = new Map(ov.rows.map((r) => [r.oid, r] as const));
  const out = new Set<string>();
  for (const k of ov.cellKeys) {
    const cut = k.indexOf(':');
    if (cut <= 0) continue;
    const oid = Number(k.slice(0, cut));
    const bi = Number(k.slice(cut + 1));
    const b = bld[bi];
    if (b == null) continue;
    const to = ovBy.get(oid)?.obyem[bi] ?? null;
    const from = baseBy.get(oid)?.obyem[bi] ?? null;
    const toA = ovBy.get(oid)?.act[bi] ?? null;
    const fromA = baseBy.get(oid)?.act[bi] ?? null;
    if (from !== to || fromA !== toA) out.add(`${oid}:${b}`);
  }
  return out;
}

/**
 * БУЦААГДСАН ИЛГЭЭЛТЭД ӨӨРЧЛӨГДСӨН ОГНОО — `changedKeys`-ийн огнооны хувилбар.
 */
export function changedDateKeys(base: SheetRow[], ov: Overlay): Set<string> {
  const baseBy = new Map(base.map((r) => [r.oid, r] as const));
  const ovBy = new Map(ov.rows.map((r) => [r.oid, r] as const));
  const out = new Set<string>();
  for (const k of ov.dateKeys) {
    const parts = k.split(':');
    const oid = Number(parts[0]);
    const bi = Number(parts[1]);
    const se = parts[2];
    if (!Number.isInteger(bi) || bi < 0 || (se !== 's' && se !== 'e')) continue;
    const r = ovBy.get(oid);
    if (!r) continue;
    const b = baseBy.get(oid);
    const to = (se === 's' ? r.start[bi] : r.end[bi]) ?? null;
    const from = b ? ((se === 's' ? b.start[bi] : b.end[bi]) ?? null) : null;
    if (dt(from) !== dt(to)) out.add(k);
  }
  return out;
}

/* ── Задралын үед нэрлэсэн туслах төрлүүд (2026-09-30) — агуулга нь FillNew-ийн хуучин
   inline төрөлтэй ЯГ ижил ── */
/** Нээлттэй засварын нүд */
export type EditCell = { i: number; b: number; col: EditCol };
/** Нээлттэй календар: аль нүднээс, ямар утгатай, хаана байрлах вэ. */
export type PickState = {
  kind: "s" | "e" | "asOf";
  row: SheetRow;
  b: number;
  value: string;
  rect: DOMRect;
  /** Үргэлжлэх хоног — календарын доод мөрөнд бичсэн тоо (2026-09-17) */
  days: string;
};
/** Хөвөгч мэдэгдлийн төрөл — `useNotice` */
export type NoticeKind = 'ro' | 'ok' | 'warn';
/** Алсын хуулбарын байдал — `useDraftSync`-ийн `remoteState` */
export type RemoteState = null | { kind: 'ok'; at: number } | { kind: 'big' } | { kind: 'fail'; why: string };
/** `computeAll`-ийн үр дүн (мөр бүрийн бодогдсон утга) */
export type Calc = ReturnType<typeof computeAll>;
