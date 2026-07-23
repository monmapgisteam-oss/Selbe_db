'use client';

import { useEffect, useMemo, useState } from "react";
import {
  applySections,
  distinct,
  isHeaderAttrs,
  qesc,
  queryAll,
  type Feature,
} from "./ags";
import st from "./sheet.module.css";

// Join space-separated table token names to their CSS-module class names.
const cls = (names: string) =>
  names
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => st[n] || n)
    .join(" ");

// Дүгнэлт: the workbook's first-sheet conclusion, live from ArcGIS. Every job in
// sheet order (by feature order), category-header rows rolled up from their
// leaves, and a weighted grand total.
//
//   leaf Гүйцэтгэл  = mean of the job's building cells (blanks = 0)
//   header Гүйцэтгэл= Σ(Нийт_жин×leaf) / Σ(Нийт_жин) over the section's leaves
//   Нийт дүн        = same, over all non-Бэлтгэл leaves in the Багц
//
// Бэлтгэл ажил is shown but excluded from the grand total (its Нийт_жин is stored
// unscaled and its intended global weight is #REF! in the source). Planned/future
// rows were removed from the layer, so this is completion of entered scope.

const F = {
  bagts: "Багц",
  work: "Ажил",
  level: "Түвшин",
  weight: "Хувийн_жин",
  totw: "Нийт_жин",
  bld: "Барилга_Блок",
  pct: "Гүйцэтгэл____",
  ognoo: "Огноо",
  ver: "Хувилбар", // applySections batches on it
  sec: "Ангилал__Б_", // section identity, stamped by applySections
  oid: "ObjectID",
} as const;

const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));
const pctStr = (v: number | null) =>
  v == null ? "" : Math.round(v * 100) + "%";

type Job = {
  work: string;
  level: number;
  weight: number | null; // Хувийн_жин (local), 1 on header rows
  tw: number; // Нийт_жин (global weight)
  isHeader: boolean;
  done: number | null; // completion (leaf mean, or section rollup for headers)
};

// Ordered job list for one Багц. Groups building cells per (level|work), keeps
// first-seen order, computes each leaf's mean completion, then rolls headers up
// from the leaves that follow them (until the next header).
export function buildJobs(feats: Feature[]): { jobs: Job[]; grand: number } {
  // Section-aware identity: job names repeat across floor sections, so the key
  // must include the section (Ангилал__Б_, stamped by applySections) or
  // distinct floor rows silently merge and their weight is lost.
  applySections(feats); // idempotent; feats arrive Огноо ASC, ObjectID ASC
  // Latest value per (section|level|work|bld) cell.
  const win = new Map<string, Feature>();
  const blds = new Set<string>();
  for (const f of feats) {
    const a = f.attributes;
    const b = s(a[F.bld]);
    if (b) blds.add(b);
    win.set(`${s(a[F.sec])}|${s(a[F.level])}|${s(a[F.work])}|${b}`, f);
  }
  const nb = blds.size || 1;

  // Group into jobs, preserving first-seen order (= sheet order of the first
  // uploaded building's batch).
  const order: string[] = [];
  const map = new Map<
    string,
    {
      work: string;
      level: number;
      weight: number | null;
      tw: number;
      sum: number;
      isHeader: boolean;
    }
  >();
  for (const f of win.values()) {
    const a = f.attributes;
    const key = `${s(a[F.sec])}|${s(a[F.level])}|${s(a[F.work])}`;
    let j = map.get(key);
    if (!j) {
      j = {
        work: s(a[F.work]),
        level: Number(a[F.level]) || 0,
        weight: num(a[F.weight]),
        tw: num(a[F.totw]) ?? 0,
        sum: 0,
        isHeader: isHeaderAttrs(a),
      };
      map.set(key, j);
      order.push(key);
    }
    if (s(a[F.bld])) j.sum += num(a[F.pct]) ?? 0;
  }

  const jobs: Job[] = order.map((key) => {
    const j = map.get(key)!;
    return {
      work: j.work,
      level: j.level,
      weight: j.weight,
      tw: j.tw,
      isHeader: j.isHeader,
      done: j.isHeader ? null : j.sum / nb, // leaf mean; headers filled below
    };
  });

  // Roll each header up from the leaves that follow it (until the next header).
  // Also compute the grand total over all non-Бэлтгэл leaves.
  let gNum = 0,
    gDen = 0;
  for (let i = 0; i < jobs.length; i++) {
    if (!jobs[i].isHeader) continue;
    let sNum = 0,
      sDen = 0;
    for (let k = i + 1; k < jobs.length && !jobs[k].isHeader; k++) {
      const leaf = jobs[k];
      sNum += leaf.tw * (leaf.done ?? 0);
      sDen += leaf.tw;
      // Бэлтгэл leaves carry unscaled weight (Нийт_жин == Хувийн_жин): skip total.
      if (!(leaf.weight != null && Math.abs(leaf.tw - leaf.weight) < 1e-9)) {
        gNum += leaf.tw * (leaf.done ?? 0);
        gDen += leaf.tw;
      }
    }
    jobs[i].done = sDen ? sNum / sDen : null;
  }
  return { jobs, grand: gDen ? gNum / gDen : 0 };
}

export default function Conclusion() {
  const [bagtsList, setBagtsList] = useState<string[]>([]);
  const [bagts, setBagts] = useState("");
  const [feats, setFeats] = useState<Feature[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    distinct(F.bagts)
      .then((v) => {
        const list = (v as string[]).filter(Boolean).sort();
        setBagtsList(list);
        setBagts((b) => b || list[0] || "");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!bagts) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const fs = await queryAll(`${F.bagts}='${qesc(bagts)}'`, {
          outFields: Object.values(F).join(","),
          orderByFields: `${F.ognoo} ASC, ${F.oid} ASC`,
        });
        if (!cancelled) setFeats(fs);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bagts]);

  const { jobs, grand } = useMemo(() => buildJobs(feats), [feats]);

  let n = 0;
  return (
    <div className={st.wrap}>
      <label className={st.field}>
        Багц{" "}
        <select
          className={st.select}
          value={bagts}
          onChange={(e) => setBagts(e.target.value)}
        >
          {bagtsList.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>

      <p className={st.info}>
        Оруулсан ажлын жигнэсэн гүйцэтгэл. Бүлгийн мөр = Σ(Нийт_жин×Гүйцэтгэл) /
        Σ(Нийт_жин). Бэлтгэл ажлыг нийт дүнд оруулаагүй. Төлөвлөсөн ирээдүйн
        мөрүүд устгагдсан тул оруулсан ажлын хэмжээгээр тооцно.
      </p>

      {err && <p className={st.error}>{err}</p>}
      {busy && <p className={st.muted}>ачаалж байна…</p>}

      {jobs.length > 0 && (
        <div className={st.scroll}>
          <table className={cls("xl concl")}>
            <thead>
              <tr>
                <th className={cls("c-no")}>№</th>
                <th className={cls("c-ajil")}>Ажил</th>
                <th className={cls("c-jin")}>Жин</th>
                <th className={cls("c-done")}>Гүйцэтгэл</th>
                <th className={cls("c-dutuu")}>Дутуу</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, i) => {
                if (!j.isHeader) n++;
                const work = j.isHeader
                  ? j.work.replace(/^[A-Za-zА-Яа-яӨөҮү]\.\s*/, "")
                  : j.work;
                return (
                  <tr key={i} className={j.isHeader ? st.cat : undefined}>
                    <td className={cls("num c-no")}>{j.isHeader ? "" : n}</td>
                    <td
                      className={cls("c-ajil")}
                      style={{ paddingLeft: `${(j.isHeader ? 1 : 2) * 16 + 6}px` }}
                    >
                      {work}
                    </td>
                    <td className={cls("right c-jin")}>
                      {j.tw ? j.tw.toFixed(4) : ""}
                    </td>
                    <td className={cls("num c-done")}>{pctStr(j.done)}</td>
                    <td className={cls("num c-dutuu")}>
                      {j.done == null ? "" : pctStr(1 - j.done)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--sheet-header)", fontWeight: 700 }}>
                <td className={cls("c-no")} />
                <td className={cls("c-ajil")} style={{ paddingLeft: 6 }}>
                  Нийт дүн (Бэлтгэлгүй)
                </td>
                <td className={cls("c-jin")} />
                <td className={cls("num c-done")}>{pctStr(grand)}</td>
                <td className={cls("num c-dutuu")}>{pctStr(1 - grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
