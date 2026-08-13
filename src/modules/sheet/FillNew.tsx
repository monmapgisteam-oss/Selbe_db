'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyUpdates,
  computeAll,
  loadRows,
  touchedIndexes,
  type SheetRow,
} from "./bagtsSheet";
import {
  loadSchema,
  pkgFloors,
  PKG_GROUPS,
  PKGS,
  type Pkg,
  type Schema,
} from "./bagts.pkg";
import DatePicker from "./DatePicker";
import { seriesBands } from "./bagts.bands";
import { ACTUAL, distinct } from "./ags";
import { useColWidths } from "./colWidths";
import st from "./sheet.module.css";

// «Гүйцэтгэл шинэ» — багцуудын `*_final_publish` хуудас excel-ийнхээ бүх
// баганаар. Дизайн нь «Гүйцэтгэл бөглөх»-тэй нэг (`.xl` хүснэгт, царцсан
// толгой, давхаргын товч, ногоон «нийтлээгүй» нүд).
//
// «Гүйцэтгэл бөглөх»-өөс ялгаатай нь: тэнд нүд бүр = тусдаа feature, энд МӨР
// бүр = нэг feature бөгөөд блокууд нь түүний талбарууд. Тиймээс засвар нь шинэ
// мөр үүсгэдэггүй, зөвхөн талбар шинэчилдэг (applyEdits/updates).
//
// Багц бүрийн блокийн тоо (4…22) ба талбарын нэрс ӨӨР тул аль нь ч энд хатуу
// бичигдээгүй — `bagts.pkg.ts → loadSchema` үйлчилгээнээс нь таьж авна.
//
// Харагдаж буй тоонууд нь ХАДГАЛАГДСАН утга биш, excel-ийн томъёогоор ЭНД
// бодогдсон утгууд (`bagtsSheet.ts` → computeAll). Publish хийхэд эвдэрсэн
// бүлгийн нийлбэрүүд (#REF!) орж ирсэн тул хадгалагдсаныг харуулах боломжгүй.

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
/** «YYYY-MM-DD» ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд). */
const inputToMs = (s: string) => (s ? Date.parse(s + "T00:00:00Z") : null);

/**
 * Засагдахгүй нүд дарахад ЯАГААД гэдгийг тайлбарлах бичвэрүүд.
 * Зөвхөн «болохгүй» гэж хэлээд орхивол хэрэглэгч алдаа гэж боддог — тиймээс
 * тухайн багана ЮУНААС бодогддгийг, эсвэл ХААНА бөглөхийг заана.
 */
const RO = {
  no: "№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.",
  wC: "Хувийн жин: Мөнгөн дүн ÷ дээд мөрийн дүн. Автоматаар бодогдоно.",
  wD: "Хувийн жин (нийт төсөлд): Мөнгөн дүн ÷ үе шатны дүн. Автоматаар бодогдоно.",
  wE: "Одоо байгаа: Хувийн жин × Бодит гүйцэтгэл. Гүйцэтгэл бөглөхөд өөрөө хөдөлнө.",
  vol: "Обьём нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.",
  unit: "Нэгж өртөг нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.",
  money: "Мөнгөн дүн: Обьём × Нэгж өртөг; бүлгийн мөрд дэд мөрүүдийнхээ нийлбэр.",
  I: "Төлөвлөгөөт гүйцэтгэл нь блокуудын төлөвлөгөөт хувийн дундаж. Огноог засвал өөрчлөгдөнө.",
  J: "Бодит гүйцэтгэл нь блокуудын бодит хувийн дундаж. Блокийн нүдийг бөглөнө үү.",
  K: "Төлөвлөгөө биелэлт: Бодит ÷ Төлөвлөгөөт. Автоматаар бодогдоно.",
  groupAct: "Бүлгийн мөр нь дэд мөрүүдийнхээ жинтэй дунджаар бодогдоно — доод ажлын мөр дээр бөглөнө үү.",
  blockPlan: "Барилга-төлөвлөгөөт нь эхлэх/дуусах огноо ба шинэчлэгдсэн огноогоор бодогдоно — огноог нь засаарай.",
  groupDate: "Энэ огноо нь доод ажлуудынхаа хамгийн эрт эхлэх / хамгийн сүүл дуусахаар бодогдож байна — доод ажлынхаа огноог засаарай.",
  noDateField: "Энэ блокт огнооны багана үйлчилгээнд байхгүй тул хадгалах газаргүй.",
  asOfRow: "Шинэчлэгдсэн огноо зөвхөн эхний мөрд бичигдэнэ — тэндээс эсвэл дээд талын «Огноо»-гоор солино.",
} as const;

export default function FillNew() {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Энэ таб яг одоо нуугдсан уу (`display: none` → `offsetParent` нь null). */
  const hiddenNow = () => !wrapRef.current?.offsetParent;
  const [pkg, setPkg] = useState<Pkg>(PKGS[0]); // Багц 1 · 9F — жагсаалтын эхнийх
  const [sc, setSc] = useState<Schema | null>(null);
  /** Тайлангийн огноонууд — «Гүйцэтгэл бөглөх» табтай НЭГ эх сурвалжаас. */
  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [asOfOrig, setAsOfOrig] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Нийтлээгүй засварууд, `${oid}:${barilgaIndex}` түлхүүрээр. Утга нь хувь
  // ("" = хоосон болгох). Зөвхөн «Нийтлэх» дархад үйлчилгээнд бичигдэнэ.
  const [pending, setPending] = useState<Record<string, string>>({});
  // Огнооны нийтлээгүй засвар, `${oid}:${blok}:s|e` түлхүүрээр («s» = эхлэх,
  // «e» = дуусах). Утга нь «YYYY-MM-DD», "" = огноог арилгах.
  const [pendDate, setPendDate] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<{ i: number; b: number } | null>(null);
  const [val, setVal] = useState("");
  /** Нээлттэй календар: аль нүднээс, ямар утгатай, хаана байрлах вэ. */
  const [pick, setPick] = useState<{
    kind: "s" | "e" | "asOf";
    row: SheetRow;
    b: number;
    value: string;
    rect: DOMRect;
  } | null>(null);
  const [hover, setHover] = useState<{ i: number; b: number | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const { style: colStyle, grip, resetAll, resized } = useColWidths("fillnew");

  // Засагдахгүй нүд дарахад «яагаад» гэдгийг хэлнэ. Дараагийн товшилт бүр
  // өмнөх мэдэгдлийг солино; 4 секундын дараа өөрөө арилна.
  const [notice, setNotice] = useState("");
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (msg: string) => {
    if (noticeT.current) clearTimeout(noticeT.current);
    setNotice(msg);
    noticeT.current = setTimeout(() => setNotice(""), 4000);
  };
  useEffect(
    () => () => {
      if (noticeT.current) clearTimeout(noticeT.current);
    },
    [],
  );
  /** Засагдахгүй нүдэнд өгөх props — товшихад тайлбарыг харуулна. */
  const ro = (msg: string) => ({
    title: msg,
    onClick: () => say(msg),
  });

  // Тайлангийн огнооны жагсаалт — нэг л удаа. Алдаа гарвал чимээгүй өнгөрнө:
  // хадгалагдсан огноо нь доор ямар ч тохиолдолд сонголт болж нэмэгддэг.
  useEffect(() => {
    let alive = true;
    distinct("ognoo", ACTUAL)
      .then((d) => alive && setDates([...new Set(d.map(String).filter(Boolean))].sort()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Багц солигдох бүрд бүдүүвч + мөрүүдийг шинээр татна. Хуучин багцын
  // хариу хожуу ирээд шинийг дарж бичихээс `alive` хамгаална.
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr("");
    setRows([]);
    setSc(null);
    setPending({});
    setPendDate({});
    setEdit(null);
    loadSchema(pkg)
      .then(async (schema) => {
        const r = await loadRows(pkg, schema);
        if (!alive) return;
        setSc(schema);
        setRows(r.rows);
        setAsOf(r.asOf);
        setAsOfOrig(r.asOf);
        // Эхлээд ангилал хүртэл (гүн 0..2) — 1400 мөр × 60 багана нэг дор
        // зурвал хөтөч удаашрана. «Бүгд» товчоор бүрэн дэлгэнэ.
        setCollapsed(
          new Set(
            r.rows.filter((x) => x.group && x.depth === 2).map((x) => x.oid),
          ),
        );
      })
      .catch((e) => alive && setErr(String(e.message || e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [pkg]);

  // Үйлчилгээнд огноо огт бичигдээгүй бол `<select>` эхний мөрөө харуулах ч
  // төлөв нь `null` хэвээр үлдэж хүснэгт бүхэлдээ хоосон харагдана. Тиймээс
  // хамгийн сүүлийн тайлангийн огноогоор нөхнө (нийтлэхэд л хадгалагдана).
  useEffect(() => {
    if (asOf == null && dates.length) setAsOf(inputToMs(dates[dates.length - 1]));
  }, [asOf, dates]);

  const nBld = sc?.bld.length ?? 0;

  const calc = useMemo(
    () =>
      asOf == null || !nBld
        ? []
        : computeAll(rows, nBld, asOf, pending, pendDate),
    [rows, nBld, asOf, pending, pendDate],
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
    Object.keys(pending).length +
    Object.keys(pendDate).length +
    (asOf !== asOfOrig ? 1 : 0);

  const origStr = (r: SheetRow, b: number) => {
    const p = r.act[b];
    return p == null ? "" : String(Math.round(p * 1000) / 10);
  };

  const commit = (r: SheetRow, b: number, raw: string) => {
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

  /** Огнооны нүдний ХАДГАЛАГДСАН утга «YYYY-MM-DD» хэлбэрээр. */
  const origDay = (r: SheetRow, b: number, k: "s" | "e") =>
    dt(k === "s" ? r.start[b] : r.end[b]);

  const commitDate = (r: SheetRow, b: number, k: "s" | "e", raw: string) => {
    const key = `${r.oid}:${b}:${k}`;
    setEdit(null);
    setPendDate((p) => {
      const n = { ...p };
      // Анхны утгадаа буцсан бол «нийтлээгүй» тэмдэглэгээг арилгана.
      if (raw === origDay(r, b, k)) delete n[key];
      else n[key] = raw;
      return n;
    });
  };

  const publish = useCallback(async () => {
    // ⚠️ busy — Ctrl+S auto-repeat үед олон зэрэгцээ applyEdits илгээгдэхээс сэргийлнэ.
    if (busy || asOf == null || dirtyCount === 0 || !sc) return;
    setBusy(true);
    setErr("");
    try {
      const editedOids = new Set(
        [...Object.keys(pending), ...Object.keys(pendDate)].map((k) =>
          Number(k.split(":")[0]),
        ),
      );
      // ⚠️ asOf БҮХ мөрийн төлөвлөгөөт хувьд нөлөөлдөг тул огноо өөрчлөгдсөн
      // бол бүх мөрийг дахин бичнэ — эс тэгвэл зөвхөн засварласан салбар шинэ
      // огноогоор, бусад мөрийн төлөвлөгөөт багана хуучнаар үлдэж зөрнө.
      const idx =
        asOf !== asOfOrig
          ? rows.map((_, i) => i)
          : touchedIndexes(rows, editedOids);
      const c = computeAll(rows, nBld, asOf, pending, pendDate);
      const updates = idx.map((i) => {
        const a: Record<string, unknown> = { [sc.f.oid]: rows[i].oid };
        for (let b = 0; b < nBld; b++) {
          a[sc.act[b]] = c[i].act[b];
          a[sc.plan[b]] = c[i].plan[b];
          // Огноог мөн буцааж бичнэ: энэ мөрд бичигдсэн (`own`) утга ба
          // бүлгийн мөрийн MIN/MAX (`agg`) — хоёул excel-ийн томъёотой ижил.
          // Талбаргүй блок бий тул шалгаж байж бичнэ.
          if (sc.start[b]) a[sc.start[b]!] = c[i].start[b];
          if (sc.end[b]) a[sc.end[b]!] = c[i].end[b];
        }
        a[sc.f.plan] = c[i].I;
        a[sc.f.act] = c[i].J;
        // ⚠️ Зарим багцад «Төлөвлөгөө биелэлт» ба «Одоо байгаа» багана огт
        //    байхгүй — байхгүй талбар рүү бичвэл applyEdits бүхэлдээ унана.
        if (sc.f.ratio) a[sc.f.ratio] = c[i].K;
        if (sc.f.wE) a[sc.f.wE] = c[i].E; // Одоо байгаа = C × Бодит гүйцэтгэл
        return a;
      });
      // Шинэчлэгдсэн огноо — төлөвлөгөөт хувь бүхэлдээ үүгээр бодогддог тул
      // өөрчилсөн бол хамт хадгална (эс тэгвэл үйлчилгээ өөртэйгээ зөрнө).
      if (asOf !== asOfOrig && rows.length && sc.f.asOf)
        updates.push({ [sc.f.oid]: rows[0].oid, [sc.f.asOf]: asOf });
      await applyUpdates(pkg, updates);
      // Хадгалагдсан утгыг локал мөрүүдэд буулгаж, «нийтлээгүй» төлвийг арилгана.
      const touched = new Set(idx);
      setRows((prev) =>
        prev.map((r, i) =>
          touched.has(i)
            ? {
                ...r,
                act: c[i].act.slice(),
                start: c[i].start.slice(),
                end: c[i].end.slice(),
              }
            : r,
        ),
      );
      setPending({});
      setPendDate({});
      setAsOfOrig(asOf);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [pkg, sc, nBld, rows, asOf, asOfOrig, pending, pendDate, dirtyCount, busy]);

  // Ctrl+S — «Гүйцэтгэл бөглөх»-тэй ижил.
  // ⚠️ Табууд солигдоход САЛДАГГҮЙ, зөвхөн нуугддаг (Sheet.tsx) тул нуугдсан
  //    үед нэг Ctrl+S хоёр хуудсыг зэрэг нийтлүүлэхээс `hiddenNow` хамгаална.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hiddenNow()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        publish();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [publish]);

  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);

  /** Толгойн 2-р мөр — блокуудыг барилгын төрлөөр нь бүлэглэсэн нь. */
  const bands = useMemo(
    () => (sc ? seriesBands(pkg.key, sc.bld) : []),
    [pkg.key, sc],
  );

  // ⚠️ Үйлчилгээнд ХАДГАЛАГДСАН огноо тайлангийн жагсаалтад байхгүй байж болно
  // (жишээ нь 2026-07-05). Түүнийг сонголт болгож нэмэхгүй бол `<select>`
  // өөрөө өөр огноо руу үсэрч, төлөвлөгөөт хувь чимээгүй өөрчлөгдөнө.
  const dateOpts = useMemo(() => {
    const cur = dt(asOf);
    return [...new Set(cur ? [...dates, cur] : dates)].sort();
  }, [dates, asOf]);

  /** Enter/Tab — дараагийн засварлаж болох мөр рүү (баганадаа доошоо). */
  const nextEditable = (i: number, b: number, step: number) => {
    for (let k = i + step; k >= 0 && k < rows.length; k += step)
      if (!rows[k].group && !hidden[k]) return { i: k, b };
    return null;
  };

  // ⚠️ Алдаа гарсан ч эрт `return` хийхгүй — эс тэгвэл багц сонгогч алга болж
  // хэрэглэгч өөр багц руу шилжих аргагүй үлдэнэ.
  return (
    <div className={st.wrap} ref={wrapRef}>
      <div className={st.toolbar}>
        <label className={st.field}>
          Багц{" "}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => setPkg(pkgFloors(e.target.value)[0])}
          >
            {PKG_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        {/* Хувилбар — зөвхөн 9F ба 12F ХОЁУЛАА хуудастай багцад (1, 2, 4-2).
            Бусад багцад ганц хувилбартай тул сонгогч ч харагдахгүй.
            ⚠️ «Давхарга» товчнуудтай андуурахгүйн тулд «Давхар» гэж нэрлээгүй —
            тэр нь модны гүн, энэ нь барилгын давхрын тоо. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            Хувилбар{" "}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={(e) =>
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg)
              }
            >
              {floorOpts.map((p) => (
                <option key={p.key} value={p.key}>{p.floors}F</option>
              ))}
            </select>
          </label>
        )}
        <label className={st.field}>
          Огноо{" "}
          <select
            className={st.select}
            value={dt(asOf)}
            onChange={(e) => {
              // ⚠️ Хоосон утга → null болговол calc=[] болж бүх мөр чимээгүй
              // алга болно — тиймээс задлагдахгүй бол хуучнаа хэвээр үлдээнэ.
              const ms = inputToMs(e.target.value);
              if (ms != null) setAsOf(ms);
            }}
            title="Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно (excel-ийн «Шинэчлэгдсэн огноо»)"
          >
            {dateOpts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
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
        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title="Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана"
          >
            Өргөн сэргээх
          </button>
        )}
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

      {rows.length > 0 && sc && (
        <div className={st.scroll}>
          <table
            className={cls("xl b32")}
            style={colStyle}
            onMouseLeave={() => setHover(null)}
          >
            {/* ТОЛГОЙ нь `*_final_system` хуудасны бүтэц: 4 мөрт бүлэглэсэн.
                Мөр ба багана нь `*_final_publish`-тэйгээ ижил тул тооцоо
                хөндөгдөхгүй — зөвхөн дүрслэл. */}
            <thead>
              <tr>
                <th rowSpan={4} className={cls("fz c-no")}>№<i {...grip("no")} /></th>
                <th rowSpan={4} className={cls("fz c-ajil")}>Ажил<i {...grip("ajil")} /></th>
                {/* Excel-д C1:D4 — «Хувийн жин» хоёр баганыг бүрэн хамарна.
                    ⚠️ Энд `c-w` өргөний ангилал ТАВИХГҮЙ: 72px нь хоёр баганын
                    НИЙЛБЭР болж уншигдаж, хоёуланг нь шахна. Өргөнийг мөрийн
                    нүднүүд өөрсдөө заана. */}
                <th rowSpan={4} colSpan={2} className={cls("c-wspan")}>Хувийн жин<i {...grip("w")} /></th>
                <th rowSpan={4} className={cls("c-now")}>Одоо байгаа хувийн жин<i {...grip("now")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>Обьём<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-money")}>Нэгж өртөг<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-money")}>Мөнгөн дүн<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>Төлөвлөгөөт гүйцэтгэл<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>Бодит гүйцэтгэл<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>Төлөвлөгөө биелэлт<i {...grip("calc")} /></th>
                <th colSpan={nBld} className={cls("band")}>Ажил гүйцэтгэл ({nBld} барилга)</th>
                <th colSpan={nBld} className={cls("band")}>Төлөвлөгөөт гүйцэтгэл ({nBld} барилга)</th>
                <th colSpan={nBld * 2} className={cls("band")}>Төлөвлөгөөт хуваарь ({nBld} барилга)</th>
                <th rowSpan={4} className={cls("c-date")}>Шинэчлэгдсэн огноо<i {...grip("date")} /></th>
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар) */}
              <tr>
                {bands.map((g, gi) => (
                  <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bd${gi}`} colSpan={g.count * 2} className={cls("band2")}>{g.label}</th>
                ))}
              </tr>
              {/* 3-р мөр — блокийн код */}
              <tr>
                {sc.bld.map((b) => (
                  <th key={`a${b}`} rowSpan={2} className={cls("bld")}>{b}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`p${b}`} rowSpan={2} className={cls("bld")}>{b} барилга<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} барилга</th>
                ))}
              </tr>
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах */}
              <tr>
                {sc.bld.map((b) => [
                  <th key={`s${b}`} className={cls("c-date")}>Эхлэх<i {...grip("date")} /></th>,
                  <th key={`e${b}`} className={cls("c-date")}>Дуусах<i {...grip("date")} /></th>,
                ])}
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
                      onClick={() => say(RO.no)}
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
                      onClick={() => say(RO.no)}
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
                    <td className={cls("right c-w")} style={{ backgroundColor: bg }} title={full(c.C)} onClick={() => say(RO.wC)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} style={{ backgroundColor: bg }} title={full(c.D)} onClick={() => say(RO.wD)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td
                      className={cls("right c-now")}
                      style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                      title={full(c.E)}
                      onClick={() => say(RO.wE)}
                    >
                      {wt(c.E)}
                    </td>
                    <td className={cls("right c-vol")} style={{ backgroundColor: bg }} {...ro(RO.vol)}>{qty(r.vol)}</td>
                    <td className={cls("right c-money")} style={{ backgroundColor: bg }} {...ro(RO.unit)}>{money(r.unit)}</td>
                    <td className={cls("right c-money")} style={{ backgroundColor: bg }} {...ro(RO.money)}>{money(c.H)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }} {...ro(RO.I)}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }} {...ro(RO.J)}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc")} style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }} {...ro(RO.K)}>{pc(c.K, 1)}</td>

                    {/* Бодит гүйцэтгэл — цорын ганц засагддаг блок. */}
                    {sc.bld.map((b, bi) => {
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
                            // Бүлгийн мөр бодогдоно — гараар засагдахгүй
                            if (r.group) return say(RO.groupAct);
                            setVal(pending[key] ?? origStr(r, bi));
                            setEdit({ i, b: bi });
                          }}
                        >
                          {pc(c.act[bi], r.group ? 1 : 0)}
                        </td>
                      );
                    })}

                    {/* Барилга-төлөвлөгөөт — огноо + шинэчлэгдсэн огноогоор бодогдоно. */}
                    {sc.bld.map((b, bi) => (
                      <td
                        key={`p${b}`}
                        className={cls("num bld")}
                        style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                        onMouseEnter={() => setHover({ i, b: null })}
                        {...ro(RO.blockPlan)}
                      >
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {/* Эхлэх/Дуусах огноо — календараар засагдана (ажлын мөрд).
                        Бүлгийн мөрд дэд мөрүүдийн MIN/MAX тул зөвхөн харагдана. */}
                    {sc.bld.map((b, bi) =>
                      (["s", "e"] as const).map((k) => {
                        const key = `${r.oid}:${bi}:${k}`;
                        const fld = k === "s" ? sc.start[bi] : sc.end[bi];
                        const ms = k === "s" ? c.start[bi] : c.end[bi];
                        // ⚠️ Хаанаас ирсэн огноо вэ: `agg` = дэд мөрүүдийн
                        // MIN/MAX (бодогдоно, засагдахгүй), `own`/`none` = энэ
                        // мөрийнх (хоосон байсан ч засагдана).
                        const src = k === "s" ? c.startSrc[bi] : c.endSrc[bi];
                        // Талбар нь үйлчилгээнд байхгүй блок бий (толгой нь
                        // эвдэрсэн) — тэнд хадгалах газаргүй тул засагдахгүй.
                        const editable = src !== "agg" && !!fld;
                        return (
                          <td
                            key={`${k}${b}`}
                            className={cls(
                              "num c-date" +
                                (editable ? " cursor-cell" : "") +
                                (key in pendDate ? " dirty" : ""),
                            )}
                            style={{ backgroundColor: bg }}
                            title={
                              editable
                                ? "Дарж календараар сонгоно"
                                : src === "agg"
                                  ? RO.groupDate
                                  : RO.noDateField
                            }
                            onClick={(e) => {
                              if (!editable)
                                return say(src === "agg" ? RO.groupDate : RO.noDateField);
                              setPick({
                                kind: k,
                                row: r,
                                b: bi,
                                value: pendDate[key] ?? dt(ms),
                                rect: e.currentTarget.getBoundingClientRect(),
                              });
                            }}
                          >
                            {dt(ms)}
                          </td>
                        );
                      }),
                    )}
                    {/* Шинэчлэгдсэн огноо — зөвхөн эхний мөрд бичигддэг.
                        Хэрэгслийн мөрний сонгогчтой нэг утга. */}
                    {
                      <td
                        className={cls(
                          "num c-date" +
                            (i === 0 ? " cursor-cell" : "") +
                            (i === 0 && asOf !== asOfOrig ? " dirty" : ""),
                        )}
                        style={{ backgroundColor: bg }}
                        title={i === 0 ? "Дарж календараар сонгоно" : RO.asOfRow}
                        onClick={(e) => {
                          if (i !== 0) return say(RO.asOfRow);
                          setPick({
                            kind: "asOf",
                            row: r,
                            b: -1,
                            value: dt(asOf),
                            rect: e.currentTarget.getBoundingClientRect(),
                          });
                        }}
                      >
                        {i === 0 ? dt(asOf) : ""}
                      </td>
                    }
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Огнооны календар — нүдэнд биш, ХУУДСАН ДЭЭР хөвж гарна (fixed).
          Хүснэгтийн нүд дотор байрлуулбал `overflow: hidden`-д таслагдана. */}
      {pick && (
        <DatePicker
          value={pick.value}
          anchor={pick.rect}
          onClose={() => setPick(null)}
          onPick={(v) => {
            if (pick.kind === "asOf") {
              // ⚠️ Хоосон болговол calc=[] болж бүх мөр алга болно — тиймээс
              //    задлагдсан үед л солино.
              const ms = inputToMs(v);
              if (ms != null) setAsOf(ms);
            } else {
              commitDate(pick.row, pick.b, pick.kind, v);
            }
            setPick(null);
          }}
        />
      )}

      {notice && (
        <div className={st.notice} role="status" onClick={() => setNotice("")}>
          <b>Энэ нүд засагдахгүй.</b> {notice}
        </div>
      )}
    </div>
  );
}
