'use client';

import { useEffect, useMemo, useState } from "react";
import { LEVEL5, distinct, level5Rows, type Feature } from "./ags";
import st from "./sheet.module.css";

const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(" ");

// Хоцролтын төрөл — эх файлын кодчлол (`aldaatai` талбарт хадгалагдсан).
const LATE: Record<string, string> = {
  "1": "Шийдэл/Захиалагч",
  "2": "Гүйцэтгэгч",
  "3": "Газар чөлөөлөлт",
  "4": "Хуулийн асуудал",
};

const s = (v: unknown) => (v == null ? "" : String(v));
const pct = (v: number | null) =>
  v == null ? "" : (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
const int = (n: number) => n.toLocaleString("mn-MN");

type Agg = {
  key: string;
  name: string;
  w: number;          // Σ АХЗ
  wd: number;         // Σ АХЗ × гүйцэтгэл
  n: number;          // ажилбарын тоо
  late: Record<string, number>;
  id: string;         // Activity ID (зөвхөн навч, Багц 1-д л бүрэн)
  kids?: Agg[];
};

const blank = (key: string, name: string): Agg =>
  ({ key, name, w: 0, wd: 0, n: 0, late: {}, id: "", kids: [] });

function add(a: Agg, w: number, done: number, code: string) {
  a.w += w;
  a.wd += w * done;
  a.n += 1;
  if (code) a.late[code] = (a.late[code] || 0) + 1;
}

/**
 * Ажлын дэд бүлэг → 2-р дэд бүлэг → ажилбар гурван шатлалт нийлбэр.
 * Ажилбар мөр бүр блок тус бүрд давтагддаг тул «Бүгд» үед нэг ажилбарын бүх
 * блокийн мөр НЭГ мөрд нэгдэж, жин нь тэдгээрийн нийлбэр болно.
 */
function build(rows: Feature[]): Agg[] {
  const top: Agg[] = [];
  // Түлхүүр → зангилаа хайлт (жагсаалт дотор шугаман хайвал 16 мянган мөр ×
  // хэдэн зуун ажилбар болно). Жагсаалт нь эх дарааллаа хадгална.
  const seen = new Map<string, Agg>();
  const node = (key: string, name: string, into: Agg[]): Agg => {
    let a = seen.get(key);
    if (!a) {
      seen.set(key, (a = blank(key, name)));
      into.push(a);
    }
    return a;
  };
  for (const f of rows) {
    const a = f.attributes;
    const w = Number(a.niit_jin) || 0;
    const done = Number(a.guitsetgel) || 0;
    const code = s(a.aldaatai);
    const k1 = s(a.angilal_a) || "—";
    const k2 = s(a.angilal_b) || "—";
    const k3 = s(a.ajil);

    const lvl1 = node(k1, k1, top);
    const lvl2 = node(`${k1}|${k2}`, k2, lvl1.kids!);
    const leaf = node(`${k1}|${k2}|${k3}`, k3, lvl2.kids!);
    if (leaf.kids) {
      leaf.kids = undefined;
      leaf.id = s(a.dugaar);
    }
    add(lvl1, w, done, code);
    add(lvl2, w, done, code);
    add(leaf, w, done, code);
  }
  return top;
}

const lateSum = (m: Record<string, number>) =>
  Object.values(m).reduce((x, y) => x + y, 0);
const lateTitle = (m: Record<string, number>) =>
  Object.entries(m)
    .sort()
    .map(([c, n]) => `${LATE[c] || c}: ${int(n)}`)
    .join("\n");

/**
 * «Түвшин 5» — Primavera-гийн ажилбарын түвшний гүйцэтгэл (`torol='level5'`,
 * огноо 2026-06-30). Гүйцэтгэл нь АХЗ (`niit_jin`, багц бүрд нийлбэр нь 1)
 * жингээр жигнэгдэнэ; хоцролтын шалтгааныг `aldaatai` кодоос уншина.
 *
 * ⚠️ Энэ хуудас ЗАСВАРГҮЙ. Ажилбарын мөрүүд «Гүйцэтгэл бөглөх»-ийн WBS мөртэй
 * огт өөр мөчлөгтэй (нэг удаагийн экспорт) тул тэнд ХАМААРУУЛАХГҮЙ.
 */
export default function Level5() {
  const [bagtsList, setBagtsList] = useState<string[]>([]);
  const [bagts, setBagts] = useState("");
  const [blok, setBlok] = useState("");
  const [rows, setRows] = useState<Feature[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    distinct("bagts", LEVEL5)
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
    setBusy(true);
    setErr("");
    setOpen(new Set());
    level5Rows(bagts)
      .then((fs) => {
        if (cancelled) return;
        setRows(fs);
        setBlok("");
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [bagts]);

  const bloks = useMemo(() => {
    const set = new Set<string>();
    for (const f of rows) set.add(s(f.attributes.barilga_blok));
    return [...set].sort((a, b) => {
      const [ax, ay] = a.split("/");
      const [bx, by] = b.split("/");
      return ax === bx ? parseInt(ay) - parseInt(by) : ax.localeCompare(bx);
    });
  }, [rows]);

  const tree = useMemo(
    () => build(blok ? rows.filter((f) => f.attributes.barilga_blok === blok) : rows),
    [rows, blok],
  );

  const total = useMemo(() => {
    const t = blank("", "");
    for (const a of tree) {
      t.w += a.w;
      t.wd += a.wd;
      t.n += a.n;
      for (const [c, n] of Object.entries(a.late)) t.late[c] = (t.late[c] || 0) + n;
    }
    return t;
  }, [tree]);

  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  // Дэлгэсэн зангилаануудыг л мөр болгон дэлгэнэ (гүн: 0 бүлэг, 1 дэд, 2 ажилбар).
  const visible = useMemo(() => {
    const out: { a: Agg; depth: number }[] = [];
    const walk = (list: Agg[], depth: number) => {
      for (const a of list) {
        out.push({ a, depth });
        if (a.kids && open.has(a.key)) walk(a.kids, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree, open]);

  return (
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <label className={st.field}>
          Багц
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
        <label className={st.field}>
          Блок
          <select
            className={st.select}
            value={blok}
            onChange={(e) => setBlok(e.target.value)}
          >
            <option value="">Бүгд ({bloks.length})</option>
            {bloks.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <button
          className={st.layerBtn}
          onClick={() => setOpen(new Set(tree.map((a) => a.key)))}
        >
          Дэлгэх
        </button>
        <button className={st.layerBtn} onClick={() => setOpen(new Set())}>
          Хумих
        </button>
        {busy && <span className={st.muted}>Ачаалж байна…</span>}
      </div>

      {err && <p className={st.errorSm}>{err}</p>}

      <p className={st.info}>
        Жигнэсэн гүйцэтгэл <b>{pct(total.w ? total.wd / total.w : null)}</b> ·{" "}
        {int(total.n)} ажилбар · хоцролттой {int(lateSum(total.late))}
        {Object.entries(total.late)
          .sort()
          .map(([c, n]) => ` · ${LATE[c] || c} ${int(n)}`)}
        . Ач холбогдлын зэргээр (АХЗ) жигнэв; эх өгөгдөл 2026-06-30-ны
        ажилбарын түвшний экспорт — засварлах боломжгүй.
      </p>

      <div className={st.scroll}>
        <table className={cls("xl concl")}>
          <thead>
            <tr>
              <th className={cls("c-no")}>Activity ID</th>
              <th className={cls("c-ajil")}>Ажил</th>
              <th className={cls("c-jin")}>АХЗ</th>
              <th className={cls("c-done")}>Гүйцэтгэл</th>
              <th className={cls("c-jin")}>Ажилбар</th>
              <th className={cls("c-dutuu")}>Хоцролт</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ a, depth }) => {
              const late = lateSum(a.late);
              return (
                <tr key={a.key} className={depth < 2 ? st.cat : undefined}>
                  <td className={cls("num c-no")}>{a.id}</td>
                  <td
                    className={cls("c-ajil")}
                    style={{ paddingLeft: `${depth * 16 + 6}px` }}
                  >
                    {a.kids && (
                      <span className={st.caret} onClick={() => toggle(a.key)}>
                        {open.has(a.key) ? "▾" : "▸"}
                      </span>
                    )}
                    {a.name}
                  </td>
                  <td className={cls("right c-jin")}>
                    {pct(total.w ? a.w / total.w : null)}
                  </td>
                  <td className={cls("num c-done")}>{pct(a.w ? a.wd / a.w : null)}</td>
                  <td className={cls("right c-jin")}>{int(a.n)}</td>
                  <td className={cls("num c-dutuu")} title={lateTitle(a.late)}>
                    {late ? int(late) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
