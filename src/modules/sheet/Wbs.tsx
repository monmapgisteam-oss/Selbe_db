'use client';

import { useEffect, useMemo, useState } from "react";
import { WBS, type WbsRow } from "./wbs";
import { constructionByBagts } from "./ags";
import st from "./sheet.module.css";

// Construction leaves (6.2.1.x, Орон сууц барилга угсралт) → service Багц. These
// are the only WBS rows the feature service can measure — filled live from the
// phase-Б header rollup. 6.2.1.7 (Багц 4.2) has no service data → stays static.
const CON: Record<string, string> = {
  "6.2.1.1": "Багц 1",
  "6.2.1.2": "Багц 2",
  "6.2.1.3": "Багц 3.1",
  "6.2.1.4": "Багц 3.2",
  "6.2.1.5": "Багц 3.3",
  "6.2.1.6": "Багц 4-1",
};
const CON_PARENT = "6.2.1"; // recomputed from its 7 children when they go live

const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(" ");

// Percent with up to 2 decimals, trailing zeros trimmed. Tiny project-weights
// (pw ~1e-4) would round to 0% at 0 decimals, so keep 2.
// Fraction (0..1) → percent, up to 2 decimals, trailing zeros trimmed. toFixed(2)
// guarantees a decimal point so the trim only eats fractional zeros (not "100").
const pct = (v: number | null) =>
  v == null ? "" : (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%";

// A row has children when the next row sits deeper. WBS is in document order.
const hasKids = (i: number) => i + 1 < WBS.length && WBS[i + 1].depth > WBS[i].depth;

// Дүгнэлт: static project WBS rollup (Төсөл style) from `wbs.ts`. Not live —
// the design/дэд бүтэц/plan columns aren't in the feature service. Collapsible
// by dotted № prefix.
export default function Wbs() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [live, setLive] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    constructionByBagts()
      .then(setLive)
      .catch((e) => setErr(String(e)));
  }, []);

  // Effective done/biel per dd: construction leaves take the live phase-Б %,
  // their parent 6.2.1 re-rolls from the 7 children (w = Хэсэгт эзлэх хувь),
  // biel = done/plan. Everything else keeps the static Төсөл snapshot.
  const eff = useMemo(() => {
    const m = new Map<string, { done: number | null; live: boolean }>();
    for (const [dd, bg] of Object.entries(CON))
      if (live[bg] != null) m.set(dd, { done: live[bg], live: true });
    // Re-roll the construction parent from its children (live or static).
    const kids = WBS.filter((r) => r.dd.startsWith(CON_PARENT + ".") && r.depth === 3);
    let n = 0, d = 0, any = false;
    for (const k of kids) {
      const done = m.get(k.dd)?.done ?? k.done;
      const w = k.w;
      if (done == null || w == null) continue;
      n += w * done; d += w;
      if (m.get(k.dd)?.live) any = true;
    }
    if (d && any) m.set(CON_PARENT, { done: n / d, live: true });
    return m;
  }, [live]);

  const doneOf = (r: WbsRow) => eff.get(r.dd)?.done ?? r.done;
  const bielOf = (r: WbsRow) => {
    const e = eff.get(r.dd);
    if (!e) return r.biel;
    return r.plan ? (e.done ?? 0) / r.plan : r.biel;
  };

  const toggle = (dd: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(dd) ? n.delete(dd) : n.add(dd);
      return n;
    });

  // Show `n` levels (depths 0..n-1): collapse every header at depth n-1 so its
  // children hide. n>=5 = fully open (max depth is 4).
  const collapseTo = (n: number) =>
    setCollapsed(
      n >= 5
        ? new Set()
        : new Set(
            WBS.filter((r, i) => hasKids(i) && r.depth === n - 1).map((r) => r.dd),
          ),
    );

  // Hidden when any ancestor (dotted-prefix) is collapsed.
  const hidden = useMemo(() => {
    const h = new Set<string>();
    if (!collapsed.size) return h;
    for (const r of WBS)
      for (const c of collapsed)
        if (c && r.dd !== c && r.dd.startsWith(c + ".")) { h.add(r.dd); break; }
    return h;
  }, [collapsed]);

  return (
    <div className={st.wrap}>
      <span className={st.layerBtns}>
        <button className={st.layerBtn} onClick={() => collapseTo(1)} title="Үе шат">1</button>
        <button className={st.layerBtn} onClick={() => collapseTo(2)} title="+ дэд">2</button>
        <button className={st.layerBtn} onClick={() => collapseTo(3)} title="+ ангилал">3</button>
        <button className={st.layerBtn} onClick={() => collapseTo(4)} title="+ багц">4</button>
      </span>
      {err && <p className={st.errorSm}>{err}</p>}
      <div className={st.scroll}>
        <table className={cls("xl concl")}>
          <thead>
            <tr>
              <th className={cls("c-no")}>№</th>
              <th className={cls("c-ajil")}>Ажлын нэр</th>
              <th className={cls("c-jin")}>Хэсэгт</th>
              <th className={cls("c-jin")}>Төсөлд</th>
              <th className={cls("c-done")}>Төлөвлөгөө</th>
              <th className={cls("c-done")}>Гүйцэтгэл</th>
              <th className={cls("c-dutuu")}>Биелэлт</th>
            </tr>
          </thead>
          <tbody>
            {WBS.map((r: WbsRow, i) => {
              if (hidden.has(r.dd)) return null;
              const header = r.depth === 0 || hasKids(i);
              const kids = hasKids(i);
              return (
                <tr key={i} className={header ? st.cat : undefined}>
                  <td className={cls("num c-no")}>{r.dd}</td>
                  <td
                    className={cls("c-ajil")}
                    style={{ paddingLeft: `${r.depth * 16 + 6}px` }}
                  >
                    {kids && (
                      <span className={st.caret} onClick={() => toggle(r.dd)}>
                        {collapsed.has(r.dd) ? "▸" : "▾"}
                      </span>
                    )}
                    {r.name}
                  </td>
                  <td className={cls("right c-jin")}>{pct(r.w)}</td>
                  <td className={cls("right c-jin")}>{pct(r.pw)}</td>
                  <td className={cls("num c-done")}>{pct(r.plan)}</td>
                  <td className={cls("num c-done")} title={eff.get(r.dd)?.live ? "Live" : undefined}>
                    {eff.get(r.dd)?.live ? "● " : ""}{pct(doneOf(r))}
                  </td>
                  <td className={cls("num c-dutuu")}>{pct(bielOf(r))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
