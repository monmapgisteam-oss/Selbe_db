// «Багц 3.2» — Bagts_3_2/FeatureServer/0 дээрх `9F_publish` хуудасны толь.
// Мөр бүр = excel-ийн нэг мөр (ObjectID = excel мөр − 1), багана бүр = excel-ийн
// нэг багана. Талбарын нэрс нь AGOL-д publish хийхэд толгойн мөрөөс автоматаар
// үүссэн тул доогуур зураасны тоо жигд БИШ (толгойд ард нь зай байсан эсэхээс
// хамаараад "барилга_" vs "барилга__") — тиймээс жагсаалтууд гараар бичигдсэн.
//
// Тооцоолол: excel дэх томъёог энд давтан бодно. Publish хийсэн утгууд нь
// зарим бүлэгт #REF!-ээс болж эвдэрсэн (жишээ нь «БАРИЛГА УГСРАЛТЫН АЖИЛ»
// мөрийн нүднүүд 4e-05), тиймээс хадгалагдсан утгыг биш, бодсоныг харуулна.

import { agsFetch, type Feature } from "./ags";
import { TREE } from "./bagts32.tree";

export const B32_BASE =
  "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Bagts_3_2/FeatureServer/0";

/** Барилга/блокийн 12 багана — excel-ийн L..W (гүйцэтгэл) толгойн нэрс. */
export const BLD = [
  "5/1", "5/2", "5/3", "5/4", "5/5", "5/6",
  "5/7", "5/8", "5/9", "5/10", "5/11", "5/12",
] as const;

/** Бодит гүйцэтгэл (excel L..W) — засварлагдах цорын ганц баганууд. */
export const F_ACT = [
  "F5_1_гүйцэтгэл", "F5_2_гүйцэтгэл", "F5_3_гүйцэтгэл", "F5_4_гүйцэтгэл",
  "F5_5_гүйцэтгэл", "F5_6_гүйцэтгэл", "F5_7_гүйцэтгэл", "F5_8_гүйцэтгэл",
  "F5_9_гүйцэтгэл", "F5_10_гүйцэтгэл", "F5_11_гүйцэтгэл", "F5_12_гүйцэтгэл",
];

/** Барилга-төлөвлөгөөт (excel X..AI) — огноо + «шинэчлэгдсэн огноо»-оос бодогдоно. */
export const F_PLAN = [
  "F5_1_барилга__төлөвлөгөөт", "F5_2_барилга_төлөвлөгөөт",
  "F5_3_барилга__төлөвлөгөөт", "F5_4_барилга_төлөвлөгөөт",
  "F5_5_барилга__төлөвлөгөөт", "F5_6_барилга__төлөвлөгөөт",
  "F5_7_барилга__төлөвлөгөөт", "F5_8_барилга__төлөвлөгөөт",
  "F5_9_барилга__төлөвлөгөөт", "F5_10_барилга__төлөвлөгөөт",
  "F5_11_барилга_төлөвлөгөөт", "F5_12_барилга_төлөвлөгөөт",
];

/** Эхлэх огноо (excel AJ, AL, AN, …). */
export const F_START = [
  "F5_1_барилга__Эхлэх", "F5_2_барилга___Эхлэх", "F5_3_барилга___Эхлэх",
  "F5_4_барилга___Эхлэх", "F5_5_барилга__Эхлэх", "F5_6_барилга___Эхлэх",
  "F5_7_барилга___Эхлэх", "F5_8_барилга___Эхлэх", "F5_9_барилга___Эхлэх",
  "F5_10_барилга___Эхлэх", "F5_11_барилга__Эхлэх", "F5_12_барилга__Эхлэх",
];

/** Дуусах огноо (excel AK, AM, AO, …). */
export const F_END = [
  "F5_1_барилга__Дуусах", "F5_2_барилга___Дуусах", "F5_3_барилга___Дуусах",
  "F5_4_барилга___Дуусах", "F5_5_барилга__Дуусах", "F5_6_барилга___Дуусах",
  "F5_7_барилга___Дуусах", "F5_8_барилга___Дуусах", "F5_9_барилга___Дуусах",
  "F5_10_барилга___Дуусах", "F5_11_барилга__Дуусах", "F5_12_барилга___Дуусах",
];

export const FLD = {
  no: "F_", // № (excel A)
  work: "Ажил", // excel B
  wC: "Хувийн_жин", // excel C — эцэгтээ эзлэх жин
  wD: "Хувийн_жин1", // excel D — нийт төсөлд эзлэх жин (H/H$11)
  wE: "Хувийн_жин__Одоо_байгаа", // excel E
  vol: "Обьём", // excel F
  unit: "Нэгж_өртөг", // excel G
  money: "Мөнгөн_дүн", // excel H
  plan: "Төлөвлөгөөт_гүйцэтгэл", // excel I
  act: "Бодит_гүйцэтгэл", // excel J
  ratio: "Төлөвлөгөө_биелэлт", // excel K
  asOf: "Шинэчлэгдсэн_огноо", // excel BH — $BH$2 нь тооцооны «өнөөдөр»
  note: "F61",
  oid: "ObjectID",
} as const;

export type B32Row = {
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  wC: number | null;
  wD: number | null;
  // ⚠ `Хувийн_жин__Одоо_байгаа` (excel E) энд БАЙХГҮЙ: тэр нь C×J-ээс бүрэн
  // бодогддог тул уншаад ч ашиглахгүй. Нийтлэхэд `FLD.wE`-рүү буцааж бичнэ.
  vol: number | null;
  unit: number | null;
  money: number | null;
  act: (number | null)[]; // хадгалагдсан 12 бодит гүйцэтгэл
  start: (number | null)[]; // ms epoch
  end: (number | null)[];
  note: string;
};

const num = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** Бүх мөрийг (1429) татна — maxRecordCount 2000 тул нэг хуудсанд багтдаг ч хуудаслая. */
export async function loadRows(): Promise<{ rows: B32Row[]; asOf: number | null }> {
  const feats: Feature[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${B32_BASE}/query`, {
      where: "1=1",
      outFields: "*",
      returnGeometry: "false",
      orderByFields: "ObjectID ASC",
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const fs = (j.features || []) as Feature[];
    feats.push(...fs);
    if (!j.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }

  // $BH$2 — excel-ийн 2-р мөрийн «Шинэчлэгдсэн огноо» нь бүх төлөвлөгөөт
  // хувийн лавлах цэг. Мөр бүрт биш, зөвхөн тэнд бичигдсэн.
  let asOf: number | null = null;
  const rows: B32Row[] = [];
  for (const f of feats) {
    const a = f.attributes;
    const oid = Number(a[FLD.oid]);
    if (asOf == null) asOf = num(a[FLD.asOf]);
    const work = String(a[FLD.work] ?? "").trim();
    const no = String(a[FLD.no] ?? "").trim();
    if (!work && !no) continue; // хуудасны сүүлийн хоосон мөрүүд
    const ch = TREE[oid - 1] ?? "0";
    const group = ch >= "A" && ch <= "E";
    rows.push({
      oid,
      no,
      work,
      depth: group ? ch.charCodeAt(0) - 65 : Number(ch),
      group,
      wC: num(a[FLD.wC]),
      wD: num(a[FLD.wD]),
      vol: num(a[FLD.vol]),
      unit: num(a[FLD.unit]),
      money: num(a[FLD.money]),
      act: F_ACT.map((k) => num(a[k])),
      start: F_START.map((k) => num(a[k])),
      end: F_END.map((k) => num(a[k])),
      note: String(a[FLD.note] ?? ""),
    });
  }
  return { rows, asOf };
}

// ── Томъёо ───────────────────────────────────────────────────────────────────

/**
 * Excel X3: `IF($BH$2<=AJ3,0,IF($BH$2>=AK3,1,($BH$2-AJ3)/(AK3-AJ3)))`
 * — эхлэх/дуусах огнооны хооронд шугаман интерполяци.
 * (Excel-ийн Z багана дээр `(AO3-AL3)` гэсэн бичлэгийн алдаа бий — 5/3 баганы
 * хуваарь буруу мөрөөс уншдаг. Энд зөв хэлбэрээр нь бодсон.)
 */
export const planAt = (
  asOf: number,
  s: number | null,
  e: number | null,
): number | null => {
  if (s == null || e == null) return null;
  if (asOf <= s) return 0;
  if (asOf >= e) return 1;
  return e === s ? 1 : (asOf - s) / (e - s);
};

export type Calc = {
  plan: (number | null)[]; // excel X..AI
  act: (number | null)[]; // excel L..W
  start: (number | null)[];
  end: (number | null)[];
  H: number | null; // Мөнгөн дүн (excel H)
  C: number | null; // Хувийн жин — эцэгтээ эзлэх (excel C)
  D: number | null; // Хувийн жин — үе шатандаа эзлэх (excel D)
  E: number | null; // Хувийн жин- Одоо байгаа (excel E)
  I: number; // Төлөвлөгөөт гүйцэтгэл
  J: number; // Бодит гүйцэтгэл
  K: number; // Төлөвлөгөө биелэлт
};

/** `AVERAGE(IF(range="",0,range))` — хоосныг 0 гэж үзэн 12-т хуваана. */
const avg12 = (v: (number | null)[]) =>
  v.reduce<number>((s, x) => s + (x ?? 0), 0) / BLD.length;

/**
 * Мөр бүрийн эцэг: өөрөөсөө бага гүнтэй хамгийн ойрын дээд мөр. Excel-ийн
 * нийлбэр томъёонуудаас гаргасан модтой яг таарахыг `bagts32.tree.ts`-д
 * шалгасан.
 */
export function childIndexes(rows: B32Row[]): number[][] {
  const kids: number[][] = rows.map(() => []);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (stack.length) kids[stack[stack.length - 1]].push(i);
    stack.push(i);
  });
  return kids;
}

/** Мөр бүрийн эцгийн индекс (эцэггүй бол −1). */
function parentIndexes(rows: B32Row[]): number[] {
  const p = new Array(rows.length).fill(-1);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (stack.length) p[i] = stack[stack.length - 1];
    stack.push(i);
  });
  return p;
}

/**
 * Хуудсыг бүхэлд нь дахин бодно — excel-ийн БҮХ томъёог давтана.
 *
 * H · Мөнгөн дүн        леаф `=F*G` (Обьём×Нэгж өртөг), бүлэг `=ΣH(хүү)`
 * C · Хувийн жин        `=H/H(эцэг)` — эцэгтээ эзлэх хувь (үндэс = 1)
 * D · Хувийн жин        `=H/H(үе шат)` — үе шатандаа эзлэх хувь
 * E · Одоо байгаа       леаф `=C*J`, бүлэг `=C*ΣE(хүү)` ← гүйцэтгэл өөрчлөгдөхөд ХӨДӨЛНӨ
 * X..AI · төлөвлөгөөт   леаф огноогоор интерполяци, бүлэг D-жинтэй дундаж
 * L..W · бодит          леаф засвар/хадгалсан, бүлэг D-жинтэй дундаж
 * AJ/AK · огноо         бүлэг MIN(эхлэх) / MAX(дуусах)
 * I / J                 `=AVERAGE(12 нүд)` (хоосон = 0)
 * K                     `=IF(I=0,0,J/I)`
 *
 * ⚠ «Бэлтгэл ажил» (A) бүлгийн хүүхдүүдэд жин огт байхгүй — excel дэх
 *   `SUMPRODUCT($C3:$C10,…)` үргэлж 0 гаргадаг. Жингийн нийлбэр 0 үед энгийн
 *   дунджаар бодов; 0 харуулснаас үнэн.
 *
 * Тооцооны дараалал чухал: H (доороос дээш) → C, D (дээрээс доош) → бодит
 * гүйцэтгэл ба J (доороос дээш) → E (C ба J-ээс хамаарна, доороос дээш).
 */
export function computeAll(
  rows: B32Row[],
  asOf: number,
  edits: Record<string, string> = {},
): Calc[] {
  const kids = childIndexes(rows);
  const par = parentIndexes(rows);
  const n = BLD.length;
  const N = rows.length;

  // ── 1. H (Мөнгөн дүн), доороос дээш ────────────────────────────────────────
  const H: (number | null)[] = new Array(N).fill(null);
  for (let i = N - 1; i >= 0; i--) {
    if (kids[i].length) {
      let s = 0,
        any = false;
      for (const k of kids[i])
        if (H[k] != null) {
          s += H[k]!;
          any = true;
        }
      H[i] = any ? s : rows[i].money;
    } else {
      const r = rows[i];
      H[i] = r.vol != null && r.unit != null ? r.vol * r.unit : r.money;
    }
  }

  // ── 2. C, D (хувийн жин), дээрээс доош ─────────────────────────────────────
  // D-ийн хуваарь нь тухайн мөрийн ҮЕ ШАТ (гүн 0 өвөг)-ийн H: excel-д `H15/$H$11`
  // буюу «БАРИЛГА УГСРАЛТЫН АЖИЛ»-ын нийт дүн.
  const C: (number | null)[] = new Array(N).fill(null);
  const D: (number | null)[] = new Array(N).fill(null);
  const rootH: (number | null)[] = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const p = par[i];
    rootH[i] = p < 0 ? H[i] : rootH[p];
    C[i] =
      p >= 0 && H[i] != null && H[p] ? H[i]! / H[p]! : p < 0 ? (rows[i].wC ?? 1) : rows[i].wC;
    D[i] = H[i] != null && rootH[i] ? H[i]! / rootH[i]! : rows[i].wD;
  }

  // ── 3. Гүйцэтгэл, төлөвлөгөө, огноо + E, доороос дээш ──────────────────────
  const out: Calc[] = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    const r = rows[i];
    const plan: (number | null)[] = new Array(n).fill(null);
    const act: (number | null)[] = new Array(n).fill(null);
    const start: (number | null)[] = new Array(n).fill(null);
    const end: (number | null)[] = new Array(n).fill(null);

    if (kids[i].length) {
      const den = kids[i].reduce((s, k) => s + (D[k] ?? 0), 0);
      for (let b = 0; b < n; b++) {
        let sp = 0,
          sa = 0,
          cnt = 0;
        for (const k of kids[i]) {
          const w = den > 0 ? (D[k] ?? 0) : 1;
          sp += w * (out[k].plan[b] ?? 0);
          sa += w * (out[k].act[b] ?? 0);
          cnt += w;
          const cs = out[k].start[b];
          const ce = out[k].end[b];
          if (cs != null && (start[b] == null || cs < start[b]!)) start[b] = cs;
          if (ce != null && (end[b] == null || ce > end[b]!)) end[b] = ce;
        }
        plan[b] = cnt > 0 ? sp / cnt : null;
        act[b] = cnt > 0 ? sa / cnt : null;
      }
    } else {
      for (let b = 0; b < n; b++) {
        start[b] = r.start[b];
        end[b] = r.end[b];
        plan[b] = planAt(asOf, r.start[b], r.end[b]);
        const e = edits[`${r.oid}:${b}`];
        act[b] =
          e === undefined
            ? r.act[b]
            : e.trim() === ""
              ? null
              : Number(e) / 100;
      }
    }

    const I = avg12(plan);
    const J = avg12(act);

    // E · Хувийн жин- Одоо байгаа. Леаф `=C*J`; бүлэг `=C*(ΣE хүүхэд)` —
    // хүүхдийн C нийлбэр 1 тул энэ нь бүлгийн хувьд ч `C*J`-тэй тэнцүү.
    let E: number | null = null;
    if (C[i] != null) {
      if (kids[i].length) {
        let s = 0,
          any = false;
        for (const k of kids[i])
          if (out[k].E != null) {
            s += out[k].E!;
            any = true;
          }
        E = any ? C[i]! * s : null;
      } else {
        E = C[i]! * J;
      }
    }

    out[i] = {
      plan,
      act,
      start,
      end,
      H: H[i],
      C: C[i],
      D: D[i],
      E,
      I,
      J,
      K: I === 0 ? 0 : J / I,
    };
  }
  return out;
}

/** Засварласан мөр + түүний бүх өвөг мөрийн индексүүд (нийтлэхэд шинэчлэгдэнэ). */
export function touchedIndexes(
  rows: B32Row[],
  editedOids: Set<number>,
): number[] {
  const hit = new Set<number>();
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (editedOids.has(r.oid)) {
      hit.add(i);
      for (const a of stack) hit.add(a);
    }
    stack.push(i);
  });
  return [...hit].sort((a, b) => a - b);
}

/** `applyEdits` — 500-аар хуваан илгээнэ. */
export async function applyUpdates(
  updates: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    try {
      const j = await agsFetch(`${B32_BASE}/applyEdits`, {
        updates: JSON.stringify(chunk.map((attributes) => ({ attributes }))),
        rollbackOnFailure: "true",
      });
      const bad = (j.updateResults || []).find(
        (r: { success?: boolean }) => r.success === false,
      );
      if (bad)
        throw new Error(
          (bad as { error?: { description?: string } }).error?.description ||
            "Шинэчлэх амжилтгүй",
        );
    } catch (e) {
      // ⚠️ rollbackOnFailure зөвхөн НЭГ chunk дотроо үйлчилнэ — өмнөх chunk-ууд
      // аль хэдийн серверт бичигдсэн тул хагас амжилтыг мессежид тодруулна.
      if (i > 0)
        throw new Error(
          `${i}/${updates.length} мөр хадгалагдав; үлдсэн нь амжилтгүй (` +
            String((e as Error).message || e) +
            ") — дахин Нийтлэх дарж гүйцээнэ үү",
        );
      throw e;
    }
  }
}
