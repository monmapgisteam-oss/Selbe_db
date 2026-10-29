/**
 * ИЛГЭЭЛТИЙН ЖААЗЫН ЦЭВЭР ФУНКЦУУД (2026-09-04).
 *
 * `FillNew.publish` урьд нь «Нийтлэх» дармагц архивын бүтэн жаазыг өөрөө
 * угсарч `Bagts_*` (ҮНДСЭН ДАТА) руу бичдэг байв. Шинэ урсгалд ноорог →
 * ИЛГЭЭЛТ (`Selbe_Guitsetgel_Draft`, `sub|<pkgKey>`) → 4 шатны хяналт → зөвхөн
 * төлөвлөлтийн ахлах инженер БАТЛАХАД л архивт жааз нэмэгдэнэ. Тиймээс жааз угсрах,
 * ObjectID шилжүүлэх, нэмсэн мөр оруулах логик нь React-ээс САЛЖ, энд
 * ЦЭВЭР функц болж, гурван газраас (FillNew · hyanaltStore.apply ·
 * hyanaltDetail) НЭГ эх сурвалжаар дуудагдана.
 */
import { cellObyem, cellPct, computeAll, dayToMs, fmtInc, incCell, parseInc, synNoVol, type SheetRow } from "./bagtsSheet";
import type { Schema } from "./bagts.pkg";
import type { NewRow, SubmissionPayload } from "@/lib/submission";
import { t as tr } from "@/lib/i18nCore";

/** Нэмсэн мөрийн төрөл — ЦОРЫН ГАНЦ эх сурвалж нь `submission.ts`. */
export type { NewRow } from "@/lib/submission";

/** ЭЦГИЙН ШУУД ДОРХ байрлал — шинэ мөр эхэнд (2026-09-22). */
export const firstSlot = (_list: SheetRow[], p: number): number => p + 1;

/**
 * Нэмсэн мөрийн ЭЦЭГ БҮЛГИЙН индекс — нэр БА байрлал ХОЁУЛАНГААР; `-1` = алга.
 *
 * Тиймээс нэрээр таарах БҮХ нэрийдлийг цуглуулж, дарсан байрлалд
 * ХАМГИЙН ОЙРХОНЫГ нь сонгоно — хоёр эрсдэлийг зэрэг барина.
 * (`insertAdds` ба `overlaySubmission`-ийн давхардал шалгалт хоёулаа
 * ЭНЭ НЭГ дүрмээр эцгийг олно — өөр өөр дүрмээр олбол нэг нь оруулж,
 * нөгөө нь алгасахгүй болж зөрнө.)
 */
const parentOf = (list: SheetRow[], a: NewRow): number => {
  const cands: number[] = [];
  const pNo = String(a.parentNo ?? "").trim();
  const pWork = String(a.parentWork ?? "").trim();
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (r.group && String(r.no ?? "").trim() === pNo && String(r.work ?? "").trim() === pWork) cands.push(i);
  }
  if (!cands.length) return -1;                // эцэг алга
  let p = cands[0];
  for (const i of cands) {
    if (Math.abs(i - a.parentIdx) < Math.abs(p - a.parentIdx)) p = i;
  }
  return p;
};

/**
 * Нэмсэн мөрүүдийг жагсаалтад ОРУУЛСАН хувилбар (`FillNew.withAdds`-ийн
 * ЯГ ХУУЛБАР — төлөвийн оронд параметр).
 */
/**
 * ҮНДСЭН ТҮВШНИЙ НАВЧ МӨРИЙГ ТӨГСГӨЛД ЗАЛГАНА — «Улсын комисс» (2026-09-28).
 */
export function appendRootLeaf(
  base: SheetRow[],
  row: { oid: number; no: string; work: string; ham?: string | null },
  sc: Schema,
  nBld: number,
): SheetRow[] {
  const raw: Record<string, unknown> = { [sc.f.no]: row.no, [sc.f.work]: row.work, [sc.f.vol]: null, [sc.f.unit]: null };
  if (sc.f.wC) raw[sc.f.wC] = 0;
  if (sc.f.wD) raw[sc.f.wD] = 0;
  return [...base, {
    oid: row.oid,
    no: row.no,
    des: null,
    ham: row.ham ?? null,
    work: row.work,
    depth: 0,
    group: false,
    wC: 0,
    wD: 0,
    vol: null,
    plannedVol: null,
    unit: null,
    money: null,
    act: new Array(nBld).fill(null),
    obyem: new Array(nBld).fill(null),
    start: new Array(nBld).fill(null),
    end: new Array(nBld).fill(null),
    gStart: new Array(nBld).fill(null),
    gEnd: new Array(nBld).fill(null),
    aStart: new Array(nBld).fill(null),
    aEnd: new Array(nBld).fill(null),
    hun: null,
    mashin: null,
    raw,
  }];
}

export function insertAdds(
  base: SheetRow[],
  adds: NewRow[],
  sc: Schema,
  nBld: number,
): SheetRow[] {
  if (!adds.length || !sc) return base;
  const out = base.slice();
  const placed = new Map<number, number>();
  for (const a of adds) {
    /*
     * ЭЦЭГ БҮЛГИЙГ ОЛОХ — нэр БА байрлал ХОЁУЛАНГААР (`parentOf`, тайлбар
     * нь тэнд).
     */
    const p = parentOf(out, a);
    if (p < 0) continue;                       // эцэг алга — мөрийг алгасна
    const parent = out[p];
    let at = firstSlot(out, p);
    /* Энэ дуудлагад ИЖИЛ эцэгт оруулсан мөрүүдийг алгасна (дээрх). */
    while (at < out.length && placed.get(out[at].oid) === parent.oid) at += 1;
    placed.set(a.oid, parent.oid);
    out.splice(at, 0, {
      oid: a.oid,
      no: a.no,
      des: null,
      ham: null,
      work: a.work,
      depth: parent.depth + 1,
      group: false,
      wC: null,
      wD: null,
      vol: a.vol,
      plannedVol: null,
      unit: a.unit,
      money: null,
      act: new Array(nBld).fill(null),
      obyem: new Array(nBld).fill(null),
      start: new Array(nBld).fill(null),
      end: new Array(nBld).fill(null),
      gStart: new Array(nBld).fill(null),
      gEnd: new Array(nBld).fill(null),
      aStart: new Array(nBld).fill(null),
      aEnd: new Array(nBld).fill(null),
      hun: null,
      mashin: null,
      /* Үйлчилгээнд бичигдэх ЦОРЫН ГАНЦ талбарууд — үлдсэнийг нийтлэх
         үед `computeAll`-ийн үр дүнгээр бөглөнө. */
      raw: {
        [sc.f.no]: a.no,
        [sc.f.work]: a.work,
        [sc.f.vol]: a.vol,
        [sc.f.unit]: a.unit,
      },
    });
  }
  return out;
}

/** Мөрийн ТАНИГЧ — ноорог/илгээлтийн `rowKeys` ба `buildOidMap` хоёулаа ЭНЭ хэлбэрээр. */
export const rowKeyOf = (r: Pick<SheetRow, "no" | "work">): string => `${r.no} ¦ ${r.work}`;

/**
 * ObjectID ШИЛЖИЛТИЙН ЗУРАГЛАЛ — хуучин oid → шинэ жаазны oid
 * (`FillNew.publish`-ийн `oidMap` логик).
 *
 * Тиймээс түлхүүрүүдийг (№ + Ажлын нэр)-ээр шинэ мөрөнд ЗӨӨНӨ; хос нь
 * давхардвал ДАРААЛЛААР нь хуваарилна (нэг нэрийдэл нэг л удаа).
 */
export function buildOidMap(
  rowKeys: [number, string][],
  freshRows: SheetRow[],
  rowOcc?: readonly RowOcc[],
): Map<number, number> {
  return mapOldOids(rowKeys, freshRows, rowOcc).map;
}

/**
 * МӨРИЙН ДАВТАМЖИЙН ДУГААР — `[oid, k, n]` (2026-10-04 аудит, #2).
 *   · `k` — ижил «№ ¦ Ажлын нэр» шошготой мөрүүдийн дотор ХУУДАСНЫ дарааллаарх
 *     дугаар (0-ээс), ХУУДАСНЫ БҮХ (эерэг oid-той) мөрөөр тоолсон;
 *   · `n` — тэр шошготой мөрийн НИЙТ тоо (бичих агшинд).
 */
export type RowOcc = [number, number, number];

/** `rows`-ийн (сонгосон `oids`-ийн, өгөөгүй бол бүгдийн) давтамжийн дугаар — дээрх */
export function rowOccOf(
  rows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
  oids?: Iterable<number>,
): RowOcc[] {
  const want = oids ? new Set(oids) : null;
  const cnt = new Map<string, number>();
  const hit: [number, string, number][] = [];
  for (const r of rows) {
    if (!(r.oid >= 0)) continue;
    const k = rowKeyOf(r);
    const i = cnt.get(k) ?? 0;
    cnt.set(k, i + 1);
    if (!want || want.has(r.oid)) hit.push([r.oid, k, i]);
  }
  return hit.map(([o, k, i]): RowOcc => [o, i, cnt.get(k) ?? 0]);
}

/**
 * ХУУЧИН oid → ШИНЭ жаазны oid, ХОЁРДМОЛ утгатайг ТУСАД НЬ (2026-10-04 аудит, #2).
 *
 * Шошго бүрээр:
 *   1) `rowOcc` бүхий түлхүүр — `n` нь шинэ жаазны тоотой ТЭНЦҮҮ бол `k` дахь
 *      нэрийдэлд яг буулгана; `n` зөрвөл → `ambiguous` (мөр нэмэгдсэн/хасагдсан —
 *      `k` гулссан байж болно, ТААМАГЛАХГҮЙ);
 *   2) `rowOcc`-гүй (хуучин) түлхүүр — нэрийдэл ГАНЦ бөгөөд түлхүүр ганц бол тэр;
 *      хуучин түлхүүрийн тоо = нэрийдлийн тоо (бүх тохиолдол жагсаалтад — жиш.
 *      хуудасны бүтэн жагсаалт) бол oid-ын (= хуудасны) дарааллаар; ЭС БӨГӨӨС
 *      `ambiguous` — урьд нь энд `shift` хамгийн эхний нэрийдлийг өгч ӨӨР мөрөнд
 *      буулгадаг байв (`buildOidMap`).
 *   Шошго шинэ жаазад огт байхгүй → аль алинд нь орохгүй (`moveKeys` `unmoved`).
 */
export function mapOldOids(
  rowKeys: readonly [number, string][],
  freshRows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
  rowOcc?: readonly RowOcc[],
  sameFrame = true,
): { map: Map<number, number>; ambiguous: number[] } {
  const map = new Map<number, number>();
  const ambiguous: number[] = [];
  if (!rowKeys.length || !freshRows.length) return { map, ambiguous };
  /* Нэрийдлүүд — хуудасны дарааллаар (`freshRows` өөрөө тэр дараалалтай). */
  const free = new Map<string, number[]>();
  for (const r of freshRows) {
    if (!(r.oid >= 0)) continue;
    const k = rowKeyOf(r);
    const l = free.get(k);
    if (l) l.push(r.oid);
    else free.set(k, [r.oid]);
  }
  const occ = new Map<number, [number, number]>();
  for (const e of rowOcc ?? []) {
    if (Array.isArray(e) && Number.isInteger(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) && e[1] >= 0 && e[2] > e[1]) {
      occ.set(e[0], [e[1], e[2]]);
    }
  }
  /* Шошго → хуучин oid-ууд (давхардалгүй, oid өсөхөөр = хуудасны дараалал, 2026-09-25) */
  const byLabel = new Map<string, number[]>();
  const seen = new Set<number>();
  for (const [oid, key] of [...rowKeys].sort((a, b) => a[0] - b[0])) {
    if (!(oid >= 0) || seen.has(oid)) continue;
    seen.add(oid);
    const l = byLabel.get(key);
    if (l) l.push(oid);
    else byLabel.set(key, [oid]);
  }
  for (const [label, olds] of byLabel) {
    const cand = free.get(label);
    if (!cand?.length) continue;      // олдохгүй → `moveKeys` `unmoved`-д тоолно
    const legacy: number[] = [];
    for (const o of olds) {
      const x = occ.get(o);
      if (!x) { legacy.push(o); continue; }
      if (x[1] === cand.length && x[0] < cand.length) map.set(o, cand[x[0]]);
      else ambiguous.push(o);
    }
    if (!legacy.length) continue;
    if (legacy.length === cand.length && (sameFrame || cand.length === 1)) legacy.forEach((o, i) => map.set(o, cand[i]));
    else ambiguous.push(...legacy);
  }
  return { map, ambiguous };
}

/**
 * ХУУЧИН (`rowOcc`-гүй) ИЛГЭЭЛТИЙН ДАВТАМЖИЙГ ӨӨРИЙН СУУРЬ ЖААЗААС НӨХНӨ (2026-10-04 дахин аудит, #1, HIGH).
 */
export function withFrameOcc<P extends { rowKeys: [number, string][]; rowOcc?: RowOcc[] }>(
  p: P,
  frameRows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
): P {
  const have = new Set((p.rowOcc ?? []).map((e) => e[0]));
  const label = new Map<number, string>();
  for (const [o, k] of p.rowKeys ?? []) if (o >= 0 && !have.has(o)) label.set(o, k);
  if (!label.size) return p;
  const want: number[] = [];
  for (const r of frameRows) if (label.get(r.oid) === rowKeyOf(r)) want.push(r.oid);
  if (!want.length) return p;
  const add = rowOccOf(frameRows, want);
  return { ...p, rowOcc: [...(p.rowOcc ?? []), ...add].sort((a, b) => a[0] - b[0]) };
}
/**
 * Суурь жаазаас нөхөх ШААРДЛАГАТАЙ юу — `rowKeys`-ийн эерэг oid `curRows`-д БАЙХГҮЙ (зөөх ёстой)
 * бөгөөд түүнд `rowOcc` алга (`withFrameOcc`). Хямд — дуудагч зөвхөн тэгвэл жааз уншина.
 */
export function needsFrameOcc(
  p: { rowKeys?: [number, string][]; rowOcc?: RowOcc[] },
  curRows: readonly Pick<SheetRow, "oid">[],
): boolean {
  const cur = new Set(curRows.map((r) => r.oid));
  const have = new Set((p.rowOcc ?? []).map((e) => e[0]));
  return (p.rowKeys ?? []).some(([o]) => o >= 0 && !cur.has(o) && !have.has(o));
}

/**
 * Түлхүүрүүдийг (`${oid}:…`) шинэ oid руу ЗӨӨНӨ (`publish`-ийн moveKey/moveAll).
 *
 * - map хоосон → бүх түлхүүр хэвээр (зөөлт хэрэггүй).
 * - сөрөг oid → хэвээр: нэмсэн мөр (ТҮР дугаар) `insertAdds`-аар шинэ жаазанд
 *   дахин ордог тул түүний түлхүүр хэвээр хүчинтэй.
 * - map-д олдохгүй → `unmoved`-д. Дуудагч `unmoved.length > 0` үед ЗОГСОНО —
 *   чимээгүй амжилт заахгүй (дээрх).
 */
export function moveKeys(
  map: Map<number, number>,
  src: Record<string, string>,
): { out: Record<string, string>; unmoved: string[] } {
  const out: Record<string, string> = {};
  const unmoved: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    const at = k.indexOf(":");
    const oid = at < 0 ? NaN : Number(k.slice(0, at));
    if (!map.size || !Number.isFinite(oid) || oid < 0) {
      out[k] = v;
      continue;
    }
    const to = map.get(oid);
    if (to == null) {
      unmoved.push(k);
      continue;
    }
    out[`${to}${k.slice(at)}`] = v;
  }
  return { out, unmoved };
}

export type Overlay = {
  /** Суурь мөрүүдийн ХУУЛБАР (+ нэмсэн мөр) дээр илгээлтийн утга бичигдсэн */
  rows: SheetRow[];
  /** Илгээлтийн «Шинэчлэгдсэн огноо» — өөрчлөөгүй бол `null`. */
  asOf: number | null;
  /** Мөрөнд БУУСАН нүдний түлхүүрүүд (`${oid}:${b}`, oid = `rows`-ийнх) */
  cellKeys: string[];
  /** Мөрөнд БУУСАН огнооны түлхүүрүүд (`${oid}:${b}:s|e`) */
  dateKeys: string[];
  /** Мөрөнд тулгаж ЧАДААГҮЙ түлхүүрийн тоо — >0 бол батлах ХОРИОТОЙ */
  unmoved: number;
  /**
   * Тулгагдаагүй ЯГ ТЭР түлхүүрүүд (`${oid}:${b}` / `${oid}:${b}:s|e`).
   */
  unmovedKeys: string[];
  remapped: boolean;
  negative: number;
  negKeys: string[];
  negInc: Record<string, string>;
};

/**
 * СӨРӨГ НҮДИЙГ ХҮНД ОЛДОХООР НЭРЛЭНЭ (2026-10-22, хэрэглэгч: «хэддүгээр мөр вэ» — «1 нүд» гэх нь хаана гэдгийг хэлдэггүй;
 * мөрийн № давтагддаг тул эцэг бүлгүүдийн №-ээр замыг өгнө): `Б → Б18 → 10 → 2 «Ажил» −0.0017` (+ блок, олон блоктой бол).
 * `rows` — давхарласан мөрүүд (`Overlay.rows`, түлхүүрийн oid эндээс).
 */
export function describeNegCells(
  keys: readonly string[],
  rows: readonly SheetRow[],
  bld: readonly string[],
  inc: Readonly<Record<string, string>> = {},
  max = 10,
): string[] {
  const idx = new Map(rows.map((r, i) => [r.oid, i] as const));
  const out = keys.slice(0, max).map((k) => {
    const at = k.indexOf(':');
    const i = idx.get(Number(k.slice(0, at)));
    const b = Number(k.slice(at + 1));
    if (i == null) return k;
    const path: string[] = [];
    let d = rows[i].depth;
    for (let j = i - 1; j >= 0 && d > 0; j--) {
      if (rows[j].depth < d) { if (String(rows[j].no ?? '').trim()) path.unshift(String(rows[j].no).trim()); d = rows[j].depth; }
    }
    path.push(String(rows[i].no ?? '').trim() || '—');
    const blk = bld.length > 1 && bld[b] ? ` · ${bld[b]}` : '';
    const v = inc[k] != null ? ` ${String(inc[k]).trim().replace(/^-/, '−')}` : '';
    return `${path.join(' → ')} «${String(rows[i].work ?? '').trim()}»${blk}${v}`;
  });
  if (keys.length > out.length) out.push(`… +${keys.length - out.length}`);
  return out;
}

const NEG_EPS = 1e-9;

/**
 * ДАВХАРЛАСАН МӨРИЙН НҮД НИЙТ СӨРӨГ ҮҮ (2026-10-22, аудит).
 * `overlaySubmission` зөвхөн `incCell.neg` нүдэнд ЖИНХЭНЭ (сөрөг) нийт буулгадаг, бусад нь ≥ 0-оор хаагдсан тул мөрийн
 * утгаас шууд таньна — хянагчийн (`hyanaltDetail` → `Change.neg`) ба гүйцэтгэгчийн (`FillNew.backOkRes` · `FillRows`) хоёр
 * тал НЭГ дүрмээр. Түр (нэмсэн) мөрийн alias-тай түлхүүрт ч ажиллана (`negKeys` нь ЭХ түлхүүртэй).
 */
export function negTotalAt(r: Pick<SheetRow, "obyem" | "act">, b: number): boolean {
  return (r.obyem[b] ?? 0) < -NEG_EPS || (r.act[b] ?? 0) < -NEG_EPS;
}

/**
 * НИЙТИЙГ 0 БОЛГОХ УТГА — гүйцэтгэгч тэр нүдэнд ЯГ юу бичих вэ (2026-10-22, аудит).
 */
export function negFixText(excl: number, pct = false): string {
  const need = -excl;
  if (Math.abs(need) <= NEG_EPS) return "";
  return pct ? `${fmtInc({ n: need * 100, p: 0 })}%` : fmtInc({ n: need, p: 0 });
}

/**
 * ДАВХАРЛАСАН МӨРИЙН СӨРӨГ НҮДЭНД бичих утга (`negFixText`) — `r` нь ноорогийн нэмэлт ОРСОН нийттэй (`overlaySubmission`-ийн
 * илгээх/илгээсэн payload), `draft` нь тэр нүдний ноорог (байхгүй бол — дахин илгээх, буцаагдсан нүд). 2026-10-22 (аудит).
 * `null` — ерөнхий текст: хувийн хэсэг сөрөг (обьёмын замгүй `%`), обьёмын талбаргүй блок, Хувь горимд мөрийн Обьём алга
 * (`useCellEdit.commit` тэр нүдэнд обьёмыг илэрхийлж чадахгүй).
 */
export function negFixOf(
  r: Pick<SheetRow, "obyem" | "act" | "vol">,
  b: number,
  hasField: boolean,
  draft?: string,
  mode: "obyem" | "pct" = "obyem",
): string | null {
  const vol = r.vol != null && r.vol > 0 ? r.vol : null;
  const volPath = hasField && vol != null;
  if (!volPath && (r.act[b] ?? 0) < -NEG_EPS) return null;
  const raw = r.obyem[b];
  if (!hasField || raw == null || !(raw < -NEG_EPS)) return null;
  if (mode === "pct" && !volPath) return null;
  const d = parseInc(draft);
  const dv = d ? d.n + (volPath ? d.p * (vol as number) : 0) : 0;
  const excl = raw - dv;
  return mode === "pct" ? negFixText(excl / (vol as number), true) : negFixText(excl);
}

/**
 * СӨРӨГ НҮД БҮРИЙГ НЭРЛЭЭД ЯГ ЮУ БИЧИХИЙГ ХЭЛНЭ (2026-10-22, аудит) — `FillNew.publish` ба `resendAsIs`-ийн хориг.
 * `«{нэр}: энэ нүдэнд «0.0017» гэж бичнэ үү»` · `«{нэр}: энэ нүдийг хоосон болгоно уу»` · хувийн хэсэгт ерөнхий текст.
 * `draft` — ноорогийн нэмэлт `negKeys`-ийн түлхүүрээр (`publish`-ийн `pend2`); `mode` — хуудасны бөглөх горим.
 */
export function describeNegFixes(
  ov: Pick<Overlay, "negKeys" | "rows" | "negInc">,
  sc: Pick<Schema, "bld" | "obyem">,
  draft: Readonly<Record<string, string>> = {},
  mode: "obyem" | "pct" = "obyem",
  max = 10,
): string[] {
  const idx = new Map(ov.rows.map((r, i) => [r.oid, i] as const));
  const names = describeNegCells(ov.negKeys, ov.rows, sc.bld, ov.negInc, max);
  const named = Math.min(max, ov.negKeys.length);
  return names.map((name, j) => {
    /* «… +N» мөр — түлхүүргүй */
    if (j >= named) return name;
    const k = ov.negKeys[j];
    const at = k.indexOf(":");
    const i = idx.get(Number(k.slice(0, at)));
    const b = Number(k.slice(at + 1));
    const fix = i == null ? null : negFixOf(ov.rows[i], b, !!sc.obyem[b], draft[k], mode);
    return fix == null
      ? tr('{0}: хасалтаа нийт 0-ээс доош орохгүй болтол багасгана уу', name)
      : fix === ""
        ? tr('{0}: энэ нүдийг хоосон болгоно уу', name)
        : tr('{0}: энэ нүдэнд «{1}» гэж бичнэ үү', name, fix);
  });
}

/**
 * АРХИВЫН «ШИНЭЧЛЭГДСЭН ОГНОО» — ХОЖУУ НЬ (2026-10-22, аудит). Өдөр бүр тусдаа илгээлттэй тул ХУУЧИН өдрийн илгээлт
 * хожуу батлагдвал (10-12-ныхын дараа 10-10-ных) архивын огноо УХАРЧ, БҮХ мөрийн төлөвлөгөөт хувь буцаж бодогддог байв.
 * Архивлалт (`hyanaltStore.archiveSubmission`) ба хянагчийн харагдац (`hyanaltDetail.loadStaged`) НЭГ дүрмээр.
 * `sub` — илгээлтийн `asOf` (`null` = огноог хөндөөгүй), `cur` — архивын сүүлийн жаазных.
 */
export function laterAsOf(sub: number | null | undefined, cur: number | null | undefined): number | null {
  if (sub == null) return cur ?? null;
  if (cur == null) return sub;
  return Math.max(sub, cur);
}

/**
 * ИЛГЭЭЛТИЙГ СУУРЬ ЖААЗ ДЭЭР ДАВХАРЛАНА — компанийн хуудас, хянагчийн
 * харагдац, төлөвлөлтийн ахлах инженерийн батлалт гурвуулаа ЭНЭ функцээр ижил мөр
 * авна.
 *
 * 1) `rows`-д `sub.rowKeys`-ийн oid-ууд байхгүй бол (архивт хооронд нь шинэ
 *    жааз нэмэгдсэн) `buildOidMap` → cells/dates-ийг зөөнө; зөөгдөөгүйг
 *    `unmoved`-д тоолно.
 * 2) `insertAdds` — гэхдээ эцгийн бүлэг дотор (№ + Ажлын нэр) ижил мөр аль
 *    хэдийн БАЙГАА add-ыг АЛГАСНА (доорх).
 * 3) ХУУЛБАР мөрүүдэд утга бичнэ — `rows` mutate ХИЙГДЭХГҮЙ.
 *    cells → `obyem[b]` нь `cellObyem`-ийн ДҮРМЭЭР ("" → null; тоо биш →
 *    хэвээр; сөрөг → 0); dates → `start/end[b]` нь `dayToMs`-ийн дүрмээр
 *    ("" → null).
 * 4) `cellKeys`/`dateKeys` = мөрөнд буусан түлхүүрүүд; `asOf = sub.asOf ?? null`.
 */
export function overlaySubmission(
  rows: SheetRow[],
  sub: SubmissionPayload,
  sc: Schema,
  nBld: number,
): Overlay {
  /* ── 1. ObjectID шилжилт ── */
  const baseOids = new Set(rows.map((r) => r.oid));
  const rowKeys = sub.rowKeys ?? [];
  const needMap = rowKeys.some(([oid]) => oid >= 0 && !baseOids.has(oid));
  const map = needMap ? buildOidMap(rowKeys, rows, sub.rowOcc) : new Map<number, number>();
  const mc = moveKeys(map, Object.fromEntries(sub.cells ?? []));
  const md = moveKeys(map, Object.fromEntries(sub.dates ?? []));
  const unmovedKeys: string[] = [...mc.unmoved, ...md.unmoved];
  const negKeys: string[] = [];
  const negInc: Record<string, string> = {};

  /* ── 2. Нэмсэн мөр — давхардлыг алгасна ── */
  const alias = new Map<number, number>();
  const kept: NewRow[] = [];
  for (const a of sub.adds ?? []) {
    const p = parentOf(rows, a);
    let dup = -1;
    if (p >= 0) {
      const d = rows[p].depth;
      for (let i = p + 1; i < rows.length && rows[i].depth > d; i += 1) {
        const r = rows[i];
        if (!r.group && r.no === a.no && r.work === a.work) {
          dup = i;
          break;
        }
      }
    }
    if (dup >= 0) alias.set(a.oid, rows[dup].oid);
    else kept.push(a);
  }
  const withAdds = insertAdds(rows, kept, sc, nBld);

  /* ── 3. Хуулбар мөрүүдэд бичнэ ── */
  const out: SheetRow[] = withAdds.map((r) => ({
    ...r,
    obyem: r.obyem.slice(),
    act: r.act.slice(),
    start: r.start.slice(),
    end: r.end.slice(),
    gStart: r.gStart.slice(),
    gEnd: r.gEnd.slice(),
    aStart: r.aStart.slice(),
    aEnd: r.aEnd.slice(),
  }));
  const idx = new Map<number, number>();
  out.forEach((r, i) => idx.set(r.oid, i));

  /** Түлхүүрийн oid → мөрийн индекс; alias-тай түр oid-г архивын мөр рүү. */
  const rowOf = (oidRaw: number): number | undefined => {
    const oid = alias.get(oidRaw) ?? oidRaw;
    return idx.get(oid);
  };
  const withOid = (k: string, at: number, oid: number) => `${oid}${k.slice(at)}`;

  const cellKeys: string[] = [];
  for (const [k, v] of Object.entries(mc.out)) {
    const at = k.indexOf(":");
    const b = Number(k.slice(at + 1));
    const i = at < 0 ? null : rowOf(Number(k.slice(0, at)));
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld) {
      unmovedKeys.push(k);
      continue;
    }
    const r = out[i];
    const key = withOid(k, at, r.oid);
    if (sub.mode === "inc") {
      if (synNoVol(sc, r)) continue;
      const res = incCell(r, b, v, !!sc.obyem[b]);
      if (!res) {
        if (v.trim() !== "" && parseInc(v) == null) unmovedKeys.push(k);
        continue;
      }
      if (res.neg) negKeys.push(k);
      if (res.neg) negInc[k] = v;
      r.obyem[b] = res.neg && res.raw ? res.raw.obyem : res.obyem;
      r.act[b] = res.neg && res.raw ? res.raw.act : res.act;
      cellKeys.push(key);
      continue;
    }
    // `cellObyem`-ийн ДҮРЭМ ЯГ өөрөө — нэг мөрийн засвар мэт дамжуулна.
    r.obyem[b] = cellObyem(r, b, { [key]: v });
    if (v.trim() === "") r.act[b] = null;
    else {
      const p = cellPct(r, b, { [key]: v });
      if (p != null) r.act[b] = p;
    }
    cellKeys.push(key);
  }

  const dateKeys: string[] = [];
  for (const [k, v] of Object.entries(md.out)) {
    const at = k.indexOf(":");
    const rest = k.slice(at + 1).split(":");
    const b = Number(rest[0]);
    const se = rest[1];
    const i = rowOf(Number(k.slice(0, at)));
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld || (se !== "s" && se !== "e")) {
      unmovedKeys.push(k);
      continue;
    }
    const r = out[i];
    // `pickDate`-ийн дүрэм: засвар байвал `dayToMs` ("" → null).
    if (se === "s") r.start[b] = dayToMs(v);
    else r.end[b] = dayToMs(v);
    dateKeys.push(withOid(k, at, r.oid));
  }

  return {
    rows: out,
    asOf: sub.asOf ?? null,
    cellKeys,
    dateKeys,
    unmoved: unmovedKeys.length,
    unmovedKeys,
    remapped: needMap,
    negative: negKeys.length,
    negKeys,
    negInc,
  };
}

/**
 * ИЛГЭЭЛТИЙН СУУРЬ ЖААЗНААС ХОЙШ АРХИВТ ӨӨРЧЛӨГДСӨН НҮДНҮҮД — илгээлтийн
 * ЭХ түлхүүрээр (`${oid}:${b}` · `${oid}:${b}:s|e`).
 */
export function staleSubmissionKeys(
  baseRows: SheetRow[],
  latestRows: SheetRow[],
  sub: Pick<SubmissionPayload, "cells" | "dates" | "rowKeys"> & { mode?: SubmissionPayload["mode"]; rowOcc?: SubmissionPayload["rowOcc"] },
  nBld: number,
): string[] {
  const incCells = sub.mode === "inc";
  const rowKeys = sub.rowKeys ?? [];
  const locate = (rows: SheetRow[]) => {
    const oids = new Set(rows.map((r) => r.oid));
    const need = rowKeys.some(([o]) => o >= 0 && !oids.has(o));
    const map = need ? buildOidMap(rowKeys, rows, sub.rowOcc) : new Map<number, number>();
    const byOid = new Map<number, SheetRow>();
    rows.forEach((r) => byOid.set(r.oid, r));
    return (oid: number): SheetRow | undefined => {
      if (!map.size) return byOid.get(oid);
      const to = map.get(oid);
      return to == null ? undefined : byOid.get(to);
    };
  };
  const inBase = locate(baseRows);
  const inLatest = locate(latestRows);
  const same = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? (a == null) === (b == null) : Math.abs(a - b) <= 1e-9;
  const out: string[] = [];
  const pair = (k: string): [SheetRow, SheetRow, string[]] | null => {
    const at = k.indexOf(":");
    if (at < 0) return null;
    const oid = Number(k.slice(0, at));
    if (!Number.isFinite(oid) || oid < 0) return null;
    const rest = k.slice(at + 1).split(":");
    const b = Number(rest[0]);
    if (!Number.isInteger(b) || b < 0 || b >= nBld) return null;
    const x = inBase(oid);
    const y = inLatest(oid);
    return x && y ? [x, y, rest] : null;
  };
  for (const [k] of incCells ? [] : sub.cells ?? []) {
    const p = pair(k);
    if (!p) continue;
    const [x, y, rest] = p;
    const b = Number(rest[0]);
    if (!same(x.obyem[b], y.obyem[b]) || !same(x.act[b], y.act[b])) out.push(k);
  }
  for (const [k] of sub.dates ?? []) {
    const p = pair(k);
    if (!p) continue;
    const [x, y, rest] = p;
    const b = Number(rest[0]);
    const se = rest[1];
    if (se === "s" ? !same(x.start[b], y.start[b]) : se === "e" ? !same(x.end[b], y.end[b]) : false) out.push(k);
  }
  return out;
}

/**
 * АРХИВЫН ЖААЗ УГСРАНА — мөр бүрийн `attributes` (`FillNew.publish`-ийн
 * `adds` угсралтын ЯГ ХУУЛБАР). Үйлчилгээ рүү бичихгүй — `applyAdds`-д өгөх
 * бэлэн мөрүүдийг л буцаана.
 *
 * `rows` нь аль хэдийн нэмсэн мөртэй (`insertAdds`/`overlaySubmission`)
 * байна; `pending`/`pendDate` нь мөр дээр хараахан буугаагүй засвар (FillNew-
 * ийн хуучин зам) — overlay хийсэн бол хоосон.
 */
export function buildFrame(
  rows: SheetRow[],
  sc: Schema,
  nBld: number,
  /**
   * «Шинэчлэгдсэн огноо». `null` = хуудсанд огноо ОГТ тохируулаагүй
   * (2026-09-06) — тэр үед төлөвлөгөөт хувь `null` болж бичигдэх ба
   * `sc.f.asOf` талбарт мөн `null` очно. ӨӨР БАГЦЫН огноогоор
   * ОРЛУУЛАХГҮЙ: хэрэглэгчийн шууд заавар («огноо тохируулаагүй бол хоосон
   * өгөгдлөөсөө ажиллах ёстой»).
   */
  asOf: number | null,
  hasObyem: readonly boolean[],
  fillMs: number,
  pending: Record<string, string> = {},
  pendDate: Record<string, string> = {},
  /**
   * Хуваарийн САРЫН задаргаанаас гарах төлөвлөгөөт хувь — `computeAll`-д
   * шууд дамжина.
   */
  planPct?: (row: SheetRow, b: number) => number | null | undefined,
): Record<string, unknown>[] {
  if (!sc.f.fillDate)
    throw new Error(
      tr('Энэ хуудсанд бөглөсөн огнооны багана алга — архив үүсгэх боломжгүй тул илгээлтийг зогсоов. Админд мэдэгдэнэ үү.'),
    );
  const c = computeAll(rows, nBld, asOf, pending, pendDate, hasObyem, planPct, "abs", sc.synthetic);

  /*
   * АЖЛЫН КОД (`Des_dugaar`) — ЗӨВХӨН ДУТУУ мөрд олгоно.
   */
  let nextDes = 0;
  if (sc.f.des) {
    for (const r of rows) if (r.des != null && r.des > nextDes) nextDes = r.des;
  }

  return rows.map((r, i) => {
    // Мэддэггүй багана ч хуулбарт үлдэхийн тулд БҮХ талбараас эхэлнэ.
    const a: Record<string, unknown> = { ...r.raw };
    for (let b = 0; b < nBld; b++) {
      /*
       * `act[b]` нь обьём ÷ мөрийн Обьём — хуваарь буруу эсвэл хуримтлалыг
       * хэт өндөр бичсэн үед 1-ээс давна (амьд жишээ: Багц 2-ын «1F цутгалт»
       * 1.2456 = 124.56%). Тэр нүд бөглөх ХУУДСАНД түүхийгээрээ, шар тугтай
       * харагдах ёстой (`actOver`) — хүн засах ёстой алдаа тул нуухгүй.
       */
      a[sc.act[b]] = c[i].actAgg[b];
      a[sc.plan[b]] = c[i].plan[b];
      // Хуримтлагдсан обьём — хувийн ЭХ СУРВАЛЖ. Талбаргүй блок бий тул
      // шалгаж байж бичнэ; бүлгийн мөрд хоосон (нэгж нь зөрдөг).
      if (sc.obyem[b]) a[sc.obyem[b]!] = c[i].obyem[b];
      if (sc.start[b]) a[sc.start[b]!] = c[i].startSrc[b] === "agg" ? null : c[i].start[b];
      if (sc.end[b]) a[sc.end[b]!] = c[i].endSrc[b] === "agg" ? null : c[i].end[b];
      /*
       * БОДИТ огноо (2026-09-23) — мөртэйгөө ХЭВЭЭР явна, бодогдохгүй.
       * `raw`-д байгаа тул ихэнхдээ дамжчихдаг; ил бичих шалтгаан нь
       * `Hamaaral`-тай ижил: шинэ мөрд `raw` дутуу тул талбар жаазанд
       * ЗААВАЛ байх ёстой — эс бөгөөс «Хуваарь» тэр мөрөнд бодит огноо
       * бичсэний дараа дараагийн жаазанд алга болно.
       */
      if (sc.aStart[b]) a[sc.aStart[b]!] = r.aStart[b];
      if (sc.aEnd[b]) a[sc.aEnd[b]!] = r.aEnd[b];
    }
    /* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — дээрх -тэй ижил: хэвээр дамжина. */
    if (sc.f.hunHuch) a[sc.f.hunHuch] = r.hun;
    if (sc.f.mashin) a[sc.f.mashin] = r.mashin;
    // ОБЬЁМЫН НИЙЛБЭР — талбар байвал л бичнэ (шинэ багана, 10/10 багцад бий)
    if (sc.f.obyemSum && !sc.obyem.includes(sc.f.obyemSum)) a[sc.f.obyemSum] = c[i].obyemSum;
    /*
     * МӨНГӨН ДҮН (excel H) — ДЭЛГЭЦ ДЭЭР БОДОГДДОГ УТГЫГ АРХИВТ Ч БИЧНЭ.
     */
    if (sc.f.money && c[i].H != null) a[sc.f.money] = c[i].H;
    /*
     * ХУВИЙН ЖИН — ҮЕ ШАТАНДАА ЭЗЛЭХ (excel D). `wC`-тэй ЯГ ИЖИЛ ёс:
     * ЗӨВХӨН ХООСОН үед бөглөнө (доорх `wC` тайлбарыг үз — бодсоноо
     * дарж бичвэл нөөц зам өөрийнхөө бодолтоор аажим гажина). Шинэ мөрд энэ
     * нь жинхэнэ нөхөлт: `insertAdds` нь `raw`-д зөвхөн (№, ажил, обьём,
     * нэгж өртөг) өгдөг тул жин нь хоосон үлддэг байв.
     */
    if (sc.f.wD && a[sc.f.wD] == null && c[i].D != null) a[sc.f.wD] = c[i].D;
    /*
     * УЯЛДАА (`Hamaaral`) — мөртэйгөө хамт явна. `raw`-д байгаа тул ихэнхдээ
     * дамжчихдаг; шинэ мөрд `raw` дутуу тул ил бичнэ (одоогоор `null`, гэхдээ
     * талбар нь жаазанд ЗААВАЛ байх ёстой — эс бөгөөс «Хуваарь» тэр мөрөнд
     * уялдаа хадгалахад дараагийн жаазанд алга болно).
     */
    if (sc.f.ham) a[sc.f.ham] = r.ham;
    /* АЖЛЫН КОД — зөвхөн дутуу мөрд (дээрх). */
    if (sc.f.des) a[sc.f.des] = r.des != null ? r.des : (nextDes += 1);
    a[sc.f.plan] = c[i].I;
    a[sc.f.act] = c[i].J;
    if (sc.f.ratio) a[sc.f.ratio] = c[i].K;
    if (sc.f.wE) a[sc.f.wE] = c[i].E; // Одоо байгаа = C × Бодит гүйцэтгэл
    /*
     * ШАТЛАЛ — мөр БҮРД өөрийн гүнийг нь бичнэ.
     */
    if (sc.f.gun) a[sc.f.gun] = r.depth;
    /*
     * ХУВИЙН ЖИН — ЗӨВХӨН ХООСОН үед бөглөнө.
     */
    if (sc.f.wC && a[sc.f.wC] == null && c[i].C != null) a[sc.f.wC] = c[i].C;
    // Шинэчлэгдсэн огноо — excel-ийн лавлах нүд, зөвхөн 1-р мөрд.
    if (sc.f.asOf) a[sc.f.asOf] = i === 0 ? asOf : null;
    // АРХИВЫН ТҮЛХҮҮР — мөр БҮРД.
    if (sc.f.fillDate) a[sc.f.fillDate] = fillMs;
    return a;
  });
}

/**
 * АРХИВТ БИЧИХИЙН ӨМНӨХ СҮҮЛЧИЙН ХААЛГА — жаазны урт лавлахтайгаа таарах ёстой.
 *
 * @param got    угсарсан жаазны мөрийн тоо
 * @param expect хүлээгдэх тоо (`loadRows(...).frameLen` + шинээр оруулсан мөр)
 * @param label  багцын нэр — алдааны бичвэрт
 */
export function assertFrameLength(got: number, expect: number, label: string): void {
  if (expect <= 0 || got === expect) return;
  throw new Error(
    tr(
      '«{0}»: архивт бичих жааз {1} мөр боловч лавлах {2} мөр байна — зөрүүтэй жааз бичвэл энэ багцын хуудас дараагийн ачаалалтад бүрмөсөн хаагдана. Архивт ЮУ Ч бичсэнгүй.',
      label,
      String(got),
      String(expect),
    ),
  );
}
