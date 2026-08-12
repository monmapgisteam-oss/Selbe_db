// Багцын `*_final_publish` хуудасны нэгдсэн толь — 10 үйлчилгээнд НЭГ код.
//
// Мөр бүр = excel-ийн нэг мөр (ObjectID = excel мөр − 1), багана бүр = excel-ийн
// нэг багана. Талбарын нэрс багц бүрд өөр (AGOL толгойн мөрөөс автоматаар
// үүсгэдэг тул доогуур зураасны тоо жигд БИШ, бичээсийн алдаа ч бий) — тиймээс
// нэрийг хатуу бичихгүй, `bagts.pkg.ts → resolveSchema` ажиллах үедээ таьна.
//
// Тооцоолол: excel дэх томъёог энд давтан бодно. Publish хийсэн утгууд нь
// зарим бүлэгт #REF!-ээс болж эвдэрсэн (жишээ нь «БАРИЛГА УГСРАЛТЫН АЖИЛ»
// мөрийн нүднүүд 4e-05), тиймээс хадгалагдсан утгыг биш, бодсоныг харуулна.

import { agsFetch, type Feature } from "./ags";
import { TREES } from "./bagts.trees";
import type { Pkg, Schema } from "./bagts.pkg";

export type SheetRow = {
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  wC: number | null;
  wD: number | null;
  // ⚠ `Хувийн жин- Одоо байгаа` (excel E) энд БАЙХГҮЙ: тэр нь C×J-ээс бүрэн
  // бодогддог тул уншаад ч ашиглахгүй. Нийтлэхэд `f.wE`-рүү буцааж бичнэ.
  vol: number | null;
  unit: number | null;
  money: number | null;
  act: (number | null)[]; // хадгалагдсан блок бүрийн бодит гүйцэтгэл
  start: (number | null)[]; // ms epoch
  end: (number | null)[];
};

const num = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** Багцын бүх мөрийг татна — maxRecordCount 2000 тул хуудаслая. */
export async function loadRows(
  pkg: Pkg,
  sc: Schema,
): Promise<{ rows: SheetRow[]; asOf: number | null }> {
  const tree = TREES[pkg.key] ?? "";
  const feats: Feature[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: "1=1",
      outFields: "*",
      returnGeometry: "false",
      orderByFields: `${sc.f.oid} ASC`,
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const fs = (j.features || []) as Feature[];
    feats.push(...fs);
    if (!j.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }

  // Excel-ийн 2-р мөрийн «Шинэчлэгдсэн огноо» ($BH$2 г.м.) нь бүх төлөвлөгөөт
  // хувийн лавлах цэг. Мөр бүрт биш, зөвхөн тэнд бичигдсэн.
  let asOf: number | null = null;
  const rows: SheetRow[] = [];
  for (const f of feats) {
    const a = f.attributes;
    const oid = Number(a[sc.f.oid]);
    if (asOf == null && sc.f.asOf) asOf = num(a[sc.f.asOf]);
    const work = String(a[sc.f.work] ?? "").trim();
    const no = String(a[sc.f.no] ?? "").trim();
    if (!work && !no) continue; // хуудасны сүүлийн хоосон мөрүүд
    const ch = tree[oid - 1] ?? "0";
    const group = ch >= "A" && ch <= "E";
    rows.push({
      oid,
      no,
      work,
      depth: group ? ch.charCodeAt(0) - 65 : Number(ch),
      group,
      wC: num(a[sc.f.wC]),
      wD: num(a[sc.f.wD]),
      vol: num(a[sc.f.vol]),
      unit: num(a[sc.f.unit]),
      money: num(a[sc.f.money]),
      act: sc.act.map((k) => num(a[k])),
      // ⚠ Огноогүй блок бий (Багц 3.1-ийн 5/2 — excel толгой нь эвдэрсэн);
      //   тэнд төлөвлөгөөт хувь бодогдохгүй, `null` хэвээр үлдэнэ.
      start: sc.start.map((k) => (k ? num(a[k]) : null)),
      end: sc.end.map((k) => (k ? num(a[k]) : null)),
    });
  }
  return { rows, asOf };
}

// ── Томъёо ───────────────────────────────────────────────────────────────────

/**
 * Excel X3: `IF($BH$2<=AJ3,0,IF($BH$2>=AK3,1,($BH$2-AJ3)/(AK3-AJ3)))`
 * — эхлэх/дуусах огнооны хооронд шугаман интерполяци.
 * (Зарим багцын excel-д `(AO3-AL3)` гэсэн бичлэгийн алдаа бий — тэр багана
 * хуваарийг буруу мөрөөс уншдаг. Энд зөв хэлбэрээр нь бодсон.)
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
  plan: (number | null)[]; // блок бүрийн төлөвлөгөөт
  act: (number | null)[]; // блок бүрийн бодит
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

/**
 * Мөр бүрийн эцэг: өөрөөсөө бага гүнтэй хамгийн ойрын дээд мөр. Excel-ийн
 * нийлбэр томъёонуудаас гаргасан модтой яг таарахыг багц бүр дээр
 * `tools/bagts-tree.mjs` шалгасан (зөрүү 0).
 */
export function childIndexes(rows: SheetRow[]): number[][] {
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
function parentIndexes(rows: SheetRow[]): number[] {
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
 * төлөвлөгөөт багана    леаф огноогоор интерполяци, бүлэг D-жинтэй дундаж
 * бодит багана          леаф засвар/хадгалсан, бүлэг D-жинтэй дундаж
 * эхлэх/дуусах          бүлэг MIN(эхлэх) / MAX(дуусах)
 * I / J                 `=AVERAGE(блокийн нүднүүд)` (хоосон = 0)
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
  rows: SheetRow[],
  nBld: number,
  asOf: number,
  edits: Record<string, string> = {},
): Calc[] {
  const kids = childIndexes(rows);
  const par = parentIndexes(rows);
  const n = nBld;
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
      p >= 0 && H[i] != null && H[p]
        ? H[i]! / H[p]!
        : p < 0
          ? (rows[i].wC ?? 1)
          : rows[i].wC;
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
          e === undefined ? r.act[b] : e.trim() === "" ? null : Number(e) / 100;
      }
    }

    // `AVERAGE(IF(range="",0,range))` — хоосныг 0 гэж үзэн блокийн тоонд хуваана.
    const avg = (v: (number | null)[]) =>
      v.reduce<number>((s, x) => s + (x ?? 0), 0) / n;
    const I = avg(plan);
    const J = avg(act);

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
  rows: SheetRow[],
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
  pkg: Pkg,
  updates: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    try {
      const j = await agsFetch(`${pkg.url}/applyEdits`, {
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
