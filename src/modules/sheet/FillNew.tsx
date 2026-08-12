'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyUpdates,
  BLD,
  computeAll,
  FLD,
  F_ACT,
  F_PLAN,
  loadRows,
  touchedIndexes,
  type B32Row,
} from "./bagts32";
import st from "./sheet.module.css";

// «Гүйцэтгэл шинэ» — Багц 3.2-ын `9F_publish` хуудас (Bagts_3_2/FeatureServer/0)
// excel-ийнхээ бүх баганаар. Дизайн нь «Гүйцэтгэл бөглөх»-тэй нэг (`.xl`
// хүснэгт, царцсан толгой, давхаргын товч, ногоон «нийтлээгүй» нүд).
//
// «Гүйцэтгэл бөглөх»-өөс ялгаатай нь: тэнд нүд бүр = тусдаа feature, энд МӨР
// бүр = нэг feature бөгөөд 12 барилга нь түүний 12 талбар. Тиймээс засвар нь
// шинэ мөр үүсгэдэггүй, зөвхөн талбар шинэчилдэг (applyEdits/updates).
//
// Харагдаж буй тоонууд нь ХАДГАЛАГДСАН утга биш, excel-ийн томъёогоор ЭНД
// бодогдсон утгууд (`bagts32.ts` → computeAll). Publish хийхэд эвдэрсэн бүлгийн
// нийлбэрүүд (#REF!) орж ирсэн тул хадгалагдсаныг шууд харуулах боломжгүй.

const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(" ");

const CALC_BG = "var(--sheet-calc)";
const CELL_BG = "var(--sheet-cell)";
const HL_BG = "var(--sheet-hl)";
const HEADER_BG = "var(--sheet-header)";

/** 0..1 → хувь. Бүлгийн нийлбэр бутархай тул аравны нэг хүртэл. */
const pc = (v: number | null, dec = 0) =>
  v == null ? "" : (v * 100).toFixed(dec).replace(/\.0+$/, "") + "%";
/** Жин: 0.0083 → «0.83%». Маш жижиг жингүүд 0% болж унтрахгүйн тулд ач холбогдол бүхий орноор. */
const wt = (v: number | null) => {
  if (v == null) return "";
  const p = v * 100;
  if (p === 0) return "0%";
  const d = Math.abs(p) >= 10 ? 1 : Math.abs(p) >= 1 ? 2 : 4;
  return p.toFixed(d).replace(/\.?0+$/, "") + "%";
};
/** Бөөрөнхийлөөгүй бүтэн хувь — tooltip-д (дээд бүлгийн өөрчлөлт жижиг байдаг). */
const full = (v: number | null) => (v == null ? undefined : (v * 100).toFixed(6) + "%");
const money = (v: number | null) =>
  v == null ? "" : Math.round(v).toLocaleString("en-US");
const qty = (v: number | null) =>
  v == null ? "" : Number(v.toFixed(3)).toLocaleString("en-US");
const dt = (ms: number | null) =>
  ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
/** `<input type="date">`-ийн утга ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд). */
const msToInput = (ms: number | null) => (ms == null ? "" : dt(ms));
const inputToMs = (s: string) => (s ? Date.parse(s + "T00:00:00Z") : null);

export default function FillNew() {
  const [rows, setRows] = useState<B32Row[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [asOfOrig, setAsOfOrig] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Нийтлээгүй засварууд, `${oid}:${barilgaIndex}` түлхүүрээр. Утга нь хувь
  // ("" = хоосон болгох). Зөвхөн «Нийтлэх» дархад үйлчилгээнд бичигдэнэ.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<{ i: number; b: number } | null>(null);
  const [val, setVal] = useState("");
  const [hover, setHover] = useState<{ i: number; b: number | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    setBusy(true);
    loadRows()
      .then(({ rows, asOf }) => {
        if (!alive) return;
        setRows(rows);
        setAsOf(asOf);
        setAsOfOrig(asOf);
        // Эхлээд ангилал хүртэл (гүн 0..2) — 1400 мөр × 60 багана нэг дор
        // зурвал хөтөч удаашрана. «Бүгд» товчоор бүрэн дэлгэнэ.
        setCollapsed(
          new Set(rows.filter((r) => r.group && r.depth === 2).map((r) => r.oid)),
        );
      })
      .catch((e) => alive && setErr(String(e.message || e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, []);

  const calc = useMemo(
    () => (asOf == null ? [] : computeAll(rows, asOf, pending)),
    [rows, asOf, pending],
  );

  // Хаагдсан бүлгийн доорх мөрүүд. Гүн буурах хүртэл нуугдана.
  const hidden = useMemo(() => {
    const h = new Array(rows.length).fill(false);
    let depth = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (depth >= 0 && r.depth > depth) {
        h[i] = true;
        continue;
      }
      depth = -1;
      if (r.group && collapsed.has(r.oid)) depth = r.depth;
    }
    return h;
  }, [rows, collapsed]);

  const toggle = (oid: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  /** n давхарга харуулна: гүн n−1 дэх бүх бүлгийг хаана. n≥5 = бүрэн дэлгэх. */
  const collapseToLayer = (n: number) =>
    setCollapsed(
      n >= 5
        ? new Set()
        : new Set(
            rows.filter((r) => r.group && r.depth === n - 1).map((r) => r.oid),
          ),
    );

  const dirtyCount =
    Object.keys(pending).length + (asOf !== asOfOrig ? 1 : 0);

  const origStr = (r: B32Row, b: number) => {
    const p = r.act[b];
    return p == null ? "" : String(Math.round(p * 1000) / 10);
  };

  const commit = (r: B32Row, b: number, raw: string) => {
    const key = `${r.oid}:${b}`;
    const t = raw.trim().replace(",", ".");
    setEdit(null);
    if (t !== "" && !Number.isFinite(Number(t))) return; // тоо биш — үл хэрэгсэнэ
    const v = t === "" ? "" : String(Math.min(100, Math.max(0, Number(t))));
    setPending((p) => {
      const n = { ...p };
      if (v === origStr(r, b)) delete n[key];
      else n[key] = v;
      return n;
    });
  };

  const publish = useCallback(async () => {
    // ⚠️ busy — Ctrl+S auto-repeat үед олон зэрэгцээ applyEdits илгээгдэхээс сэргийлнэ.
    if (busy || asOf == null || dirtyCount === 0) return;
    setBusy(true);
    setErr("");
    try {
      const editedOids = new Set(
        Object.keys(pending).map((k) => Number(k.split(":")[0])),
      );
      // ⚠️ asOf ($BH$2) БҮХ мөрийн төлөвлөгөөт хувьд нөлөөлдөг тул огноо
      // өөрчлөгдсөн бол бүх мөрийг дахин бичнэ — эс тэгвэл зөвхөн засварласан
      // салбар шинэ огноогоор, бусад мөрийн F_PLAN хуучнаар үлдэж зөрнө.
      const idx =
        asOf !== asOfOrig
          ? rows.map((_, i) => i)
          : touchedIndexes(rows, editedOids);
      const c = computeAll(rows, asOf, pending);
      const updates = idx.map((i) => {
        const a: Record<string, unknown> = { [FLD.oid]: rows[i].oid };
        for (let b = 0; b < BLD.length; b++) {
          a[F_ACT[b]] = c[i].act[b];
          a[F_PLAN[b]] = c[i].plan[b];
        }
        a[FLD.plan] = c[i].I;
        a[FLD.act] = c[i].J;
        a[FLD.ratio] = c[i].K;
        a[FLD.wE] = c[i].E; // Одоо байгаа = C × Бодит гүйцэтгэл
        return a;
      });
      // $BH$2 — төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогддог тул
      // өөрчилсөн бол хамт хадгална (эс тэгвэл үйлчилгээ өөртэйгээ зөрнө).
      if (asOf !== asOfOrig && rows.length)
        updates.push({ [FLD.oid]: rows[0].oid, [FLD.asOf]: asOf });
      await applyUpdates(updates);
      // Хадгалагдсан утгыг локал мөрүүдэд буулгаж, «нийтлээгүй» төлвийг арилгана.
      setRows((prev) =>
        prev.map((r, i) => {
          if (!idx.includes(i)) return r;
          return { ...r, act: c[i].act.slice() };
        }),
      );
      setPending({});
      setAsOfOrig(asOf);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [rows, asOf, asOfOrig, pending, dirtyCount, busy]);

  // Ctrl+S — «Гүйцэтгэл бөглөх»-тэй ижил.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        publish();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [publish]);

  /** Enter/Tab — дараагийн засварлаж болох мөр рүү (баганадаа доошоо). */
  const nextEditable = (i: number, b: number, step: number) => {
    for (let k = i + step; k >= 0 && k < rows.length; k += step)
      if (!rows[k].group && !hidden[k]) return { i: k, b };
    return null;
  };

  if (err && !rows.length)
    return (
      <div className={st.wrap}>
        <p className={st.error}>{err}</p>
      </div>
    );

  return (
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <span className={st.field}>Багц 3.2 — 9F_publish</span>
        <label className={st.field}>
          Шинэчлэгдсэн огноо{" "}
          <input
            type="date"
            className={st.select}
            value={msToInput(asOf)}
            onChange={(e) => {
              // ⚠️ Хоосон утга (огноог арилгах) → null болговол calc=[] болж бүх
              // мөр чимээгүй алга болно — тиймээс хуучин огноогоо хэвээр үлдээнэ.
              const ms = inputToMs(e.target.value);
              if (ms != null) setAsOf(ms);
            }}
            title="Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно ($BH$2)"
          />
        </label>
        <span className={st.field}>
          Давхарга
          <span className={st.layerBtns}>
            <button className={st.layerBtn} onClick={() => collapseToLayer(1)} title="Үе шат">1</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(2)} title="+ дэд үе шат">2</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(3)} title="+ ангилал">3</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(4)} title="+ бүлэг">4</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(5)} title="Бүх ажил дэлгэх">Бүгд</button>
          </span>
        </span>
        <button
          className={st.publishBtn}
          onClick={publish}
          disabled={busy || dirtyCount === 0}
          title="Өөрчилсөн нүд + дээд бүлгүүдийн нийлбэрийг хадгална (Ctrl+S)"
        >
          Нийтлэх{dirtyCount ? ` (${dirtyCount})` : ""}
        </button>
        {busy && <span className={st.muted}>ажиллаж байна…</span>}
      </div>

      <p className={st.hint}>
        Зөвхөн бодит гүйцэтгэлийн нүд (5/1–5/12) засагдана; бусад нь excel-ийн
        томъёогоор энд бодогдоно — Мөнгөн дүн = Обьём×Нэгж өртөг, Хувийн жин =
        дүн/эцгийн дүн, <b>Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл</b>,
        төлөвлөгөөт хувь = эхлэх/дуусах огноо ба шинэчлэгдсэн огноо, бүлгийн мөр
        = хүүхдийнхээ жинтэй дундаж. Нийтлэхэд засварласан мөр ба түүний дээд
        бүлгүүд шинэчлэгдэнэ.
      </p>

      {err && <p className={st.error}>{err}</p>}

      {busy && rows.length === 0 && (
        <div className={st.scroll}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={st.skeletonRow}>
              <div className={st.skeletonCell} style={{ width: 40 }} />
              <div className={st.skeletonCell} style={{ width: 280 }} />
              <div className={st.skeletonCell} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className={st.scroll}>
          <table
            className={cls("xl b32")}
            onMouseLeave={() => setHover(null)}
          >
            <thead>
              <tr>
                <th className={cls("fz c-no")}>№</th>
                <th className={cls("fz c-ajil")}>Ажил</th>
                <th className={cls("c-w")}>Хувийн жин</th>
                <th className={cls("c-w")} title="Нийт төсөлд эзлэх">Хувийн жин</th>
                <th className={cls("c-w")}>Хувийн жин- Одоо байгаа</th>
                <th className={cls("c-w")}>Обьём</th>
                <th className={cls("c-money")}>Нэгж өртөг</th>
                <th className={cls("c-money")}>Мөнгөн дүн</th>
                <th className={cls("c-calc")}>Төлөвлөгөөт гүйцэтгэл</th>
                <th className={cls("c-calc")}>Бодит гүйцэтгэл</th>
                <th className={cls("c-calc")}>Төлөвлөгөө биелэлт</th>
                {BLD.map((b) => (
                  <th key={`a${b}`} className={cls("bld")}>{b}-гүйцэтгэл</th>
                ))}
                {BLD.map((b) => (
                  <th key={`p${b}`} className={cls("bld")}>{b} барилга -төлөвлөгөөт</th>
                ))}
                {BLD.map((b) => [
                  <th key={`s${b}`} className={cls("c-date")}>{b} барилга - Эхлэх</th>,
                  <th key={`e${b}`} className={cls("c-date")}>{b} барилга - Дуусах</th>,
                ])}
                <th className={cls("c-date")}>Шинэчлэгдсэн огноо</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (hidden[i]) return null;
                const c = calc[i];
                if (!c) return null;
                const rowHl = hover?.i === i;
                const bg = rowHl ? HL_BG : r.group ? HEADER_BG : CELL_BG;
                return (
                  <tr key={r.oid} className={r.group ? st.cat : undefined}>
                    <td
                      className={cls("num fz c-no")}
                      style={{ backgroundColor: bg }}
                      onMouseEnter={() => setHover({ i, b: null })}
                    >
                      {r.no}
                    </td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{
                        paddingLeft: `${r.depth * 14 + 6}px`,
                        background: bg,
                      }}
                      title={r.work}
                      onMouseEnter={() => setHover({ i, b: null })}
                    >
                      {r.group && (
                        <span
                          className={st.caret}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.oid);
                          }}
                        >
                          {collapsed.has(r.oid) ? "▸" : "▾"}
                        </span>
                      )}
                      {r.work}
                    </td>
                    <td className={cls("right c-w")} style={{ backgroundColor: bg }} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} style={{ backgroundColor: bg }} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td
                      className={cls("right c-w")}
                      style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                      title={full(c.E)}
                    >
                      {wt(c.E)}
                    </td>
                    <td className={cls("right c-w")} style={{ backgroundColor: bg }}>{qty(r.vol)}</td>
                    <td className={cls("right c-money")} style={{ backgroundColor: bg }}>{money(r.unit)}</td>
                    <td className={cls("right c-money")} style={{ backgroundColor: bg }}>{money(c.H)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}>{pc(c.K, 1)}</td>

                    {/* Бодит гүйцэтгэл — цорын ганц засагддаг блок. */}
                    {BLD.map((b, bi) => {
                      const key = `${r.oid}:${bi}`;
                      const dirty = key in pending;
                      const colHl = hover?.b === bi;
                      const hl = rowHl || colHl;
                      if (edit && edit.i === i && edit.b === bi)
                        return (
                          <td key={`a${b}`} className={cls("num bld")} style={{ padding: 0 }}>
                            <input
                              autoFocus
                              type="text"
                              inputMode="decimal"
                              className={st.cellInput}
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              onBlur={() => commit(r, bi, val)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") return setEdit(null);
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  commit(r, bi, val);
                                  const t = nextEditable(i, bi, e.shiftKey ? -1 : 1);
                                  if (t) {
                                    setVal(
                                      pending[`${rows[t.i].oid}:${bi}`] ??
                                        origStr(rows[t.i], bi),
                                    );
                                    setEdit(t);
                                  }
                                }
                              }}
                            />
                          </td>
                        );
                      return (
                        <td
                          key={`a${b}`}
                          className={cls(
                            "num bld" +
                              (r.group ? "" : " cursor-cell") +
                              (dirty ? " dirty" : ""),
                          )}
                          style={{
                            backgroundColor: hl
                              ? HL_BG
                              : r.group
                                ? HEADER_BG
                                : CELL_BG,
                          }}
                          onMouseEnter={() => setHover({ i, b: bi })}
                          onClick={() => {
                            if (r.group) return; // бүлгийн мөр бодогдоно, гараар засагдахгүй
                            setVal(pending[key] ?? origStr(r, bi));
                            setEdit({ i, b: bi });
                          }}
                        >
                          {pc(c.act[bi], r.group ? 1 : 0)}
                        </td>
                      );
                    })}

                    {/* Барилга-төлөвлөгөөт — огноо + $BH$2-оос бодогдоно. */}
                    {BLD.map((b, bi) => (
                      <td
                        key={`p${b}`}
                        className={cls("num bld")}
                        style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                        onMouseEnter={() => setHover({ i, b: null })}
                      >
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {BLD.map((b, bi) => [
                      <td key={`s${b}`} className={cls("num c-date")} style={{ backgroundColor: bg }}>
                        {dt(c.start[bi])}
                      </td>,
                      <td key={`e${b}`} className={cls("num c-date")} style={{ backgroundColor: bg }}>
                        {dt(c.end[bi])}
                      </td>,
                    ])}
                    <td className={cls("num c-date")} style={{ backgroundColor: bg }}>
                      {i === 0 ? dt(asOf) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
