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

// ── Нийтлээгүй засварын НООРОГ (localStorage) ──
// «Гүйцэтгэл бөглөх» (Pivot)-ын хамгаалалттай ижил зорилго: таб санамсаргүй
// хаагдах / сүлжээ тасрахад бөглөсөн нүд алдагдахаас сэргийлнэ. Слот нь БАГЦ
// бүрд ТУСДАА (Pivot-ын ганц слотын хөндлөн-багц алдагдлыг давтахгүй); нүдний
// түлхүүр `${oid}:${b}` — oid нь үйлчилгээний ObjectID тул дараагийн
// ачаалалтад тогтвортой. Огнооны (asOf) өөрчлөлт ноорогт ХАДГАЛАГДАХГҮЙ.
type Draft = { t: number; cells: [string, string][] };
const DRAFT_PREFIX = "selbe-fillnew-draft:";
const DRAFT_TTL_MS = 3 * 24 * 3600 * 1000;
const readDraft = (pkgKey: string): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + pkgKey);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.t || !Array.isArray(d.cells) || Date.now() - d.t > DRAFT_TTL_MS)
      return null;
    return d;
  } catch {
    return null;
  }
};
const saveDraftLS = (pkgKey: string, d: Draft) => {
  try {
    localStorage.setItem(DRAFT_PREFIX + pkgKey, JSON.stringify(d));
  } catch {
    /* дүүрсэн/private горим — зөвхөн энэ сешнд үйлчилнэ */
  }
};
const clearDraftLS = (pkgKey: string) => {
  try {
    localStorage.removeItem(DRAFT_PREFIX + pkgKey);
  } catch {
    /* байхгүй */
  }
};

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

export default function FillNew() {
  const [pkg, setPkg] = useState<Pkg>(PKGS[5]); // Багц 3.2 — анх бэлэн болсон нь
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
  const [edit, setEdit] = useState<{ i: number; b: number } | null>(null);
  const [val, setVal] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const { style: colStyle, grip, resetAll, resized } = useColWidths("fillnew");

  // ── Crosshair — React state БИШ ──
  // Урьд нь нүд бүрийн mouseenter hover state солиж «Бүгд» горимд ~80k нүдийг
  // бүхэлд нь дахин зурж заагч гацдаг байв. Одоо мөрийг CSS :hover, баганыг
  // `data-bi` нүдэн дээгүүр O(1)-ээр зөөдөг overlay (.colHl) гүйцэтгэнэ.
  const colHlRef = useRef<HTMLDivElement | null>(null);
  const colHlBi = useRef<string | null>(null);
  const moveColHl = (e: React.MouseEvent<HTMLTableElement>) => {
    const hl = colHlRef.current;
    if (!hl) return;
    const td = (e.target as HTMLElement).closest?.(
      "td[data-bi]",
    ) as HTMLElement | null;
    const bi = td?.dataset.bi ?? null;
    if (bi === colHlBi.current) return;
    colHlBi.current = bi;
    if (!td || bi == null) {
      hl.style.display = "none";
      return;
    }
    hl.style.display = "block";
    hl.style.left = `${td.offsetLeft}px`;
    hl.style.width = `${td.offsetWidth}px`;
  };
  const hideColHl = () => {
    colHlBi.current = null;
    if (colHlRef.current) colHlRef.current.style.display = "none";
  };

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
    () => (asOf == null || !nBld ? [] : computeAll(rows, nBld, asOf, pending)),
    [rows, nBld, asOf, pending],
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

  const origStr = (r: SheetRow, b: number) => {
    const p = r.act[b];
    return p == null ? "" : String(Math.round(p * 1000) / 10);
  };

  const commit = (r: SheetRow, b: number, raw: string) => {
    const key = `${r.oid}:${b}`;
    // Утга угаас хувиар илэрхийлэгддэг тул төгсгөлийн «%»-ийг тэвчинэ.
    const t = raw.trim().replace(",", ".").replace(/\s*%$/, "");
    setEdit(null);
    if (t !== "" && !Number.isFinite(Number(t))) {
      // Чимээгүй хаявал хэрэглэгч «бичигдлээ» гэж андуурдаг — мэдэгдэнэ.
      setErr(`${sc?.bld[b] ?? ""} · ${r.work}: тоон утга оруулна уу.`);
      return;
    }
    const v = t === "" ? "" : String(Math.min(100, Math.max(0, Number(t))));
    // ⚠️ Гүйцэтгэл БУУРАХГҮЙ (floor.check.mjs-ийн дүрэмтэй ижил: хоосон болгох
    // хамаарахгүй, хязгаар нь ХАДГАЛАГДСАН утга). Pivot шиг хатуу хориглодоггүй
    // нь санаатай — энд мөрөө шууд (in-place) засдаг тул буруу ӨНДӨР утгыг
    // засах цорын ганц зам нь яг энэ; андуурлаас баталгаажуулалт хамгаална.
    const floor = r.act[b];
    if (
      v !== "" &&
      floor != null &&
      Number(v) < Math.round(floor * 1000) / 10 &&
      !window.confirm(
        `${sc?.bld[b] ?? ""} · ${r.work}: өмнө нь ${origStr(r, b)}% бүртгэгдсэн — бууруулах гэж байна. Зөв үү?`,
      )
    )
      return;
    setErr("");
    setPending((p) => {
      const n = { ...p };
      if (v === origStr(r, b)) delete n[key];
      else n[key] = v;
      return n;
    });
  };

  // ── Нооргийн сэргээлт — багц ачаалагдмагц НЭГ удаа санал болгоно ──
  const promptedPkgRef = useRef("");
  useEffect(() => {
    if (busy || !rows.length || !sc) return;
    if (promptedPkgRef.current === pkg.key) return;
    // Сэргээх шат өнгөрснийг ноорог байсан эсэхээс үл хамааран тэмдэглэнэ.
    promptedPkgRef.current = pkg.key;
    const d = readDraft(pkg.key);
    if (!d) return;
    const byOid = new Map(rows.map((r, i) => [r.oid, i] as const));
    const next: Record<string, string> = {};
    let dropped = 0;
    for (const [key, v] of d.cells) {
      const oid = Number(key.split(":")[0]);
      const b = Number(key.slice(key.indexOf(":") + 1));
      const i = byOid.get(oid);
      const r = i == null ? undefined : rows[i];
      // Мөр алга болсон, бүлгийн мөр, блок хасагдсан, эсвэл аль хэдийн ижил
      // утгатай (хооронд нь нийтлэгдсэн) бол — хаяна.
      if (
        !r ||
        r.group ||
        !Number.isInteger(b) ||
        b < 0 ||
        b >= nBld ||
        v === origStr(r, b)
      ) {
        dropped++;
        continue;
      }
      next[key] = v;
    }
    if (!Object.keys(next).length) {
      clearDraftLS(pkg.key);
      return;
    }
    const when = new Date(d.t).toLocaleString("mn-MN");
    const msg =
      `Нийтлэгдээгүй ${Object.keys(next).length} нүдний засвар олдлоо (${when}).` +
      (dropped ? `\n${dropped} нүд хуучирсан тул орхигдоно.` : "") +
      "\nСэргээх үү?";
    if (window.confirm(msg)) setPending(next);
    else clearDraftLS(pkg.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, rows, sc, nBld, pkg.key]);

  // Ноорог хадгалах — pending өөрчлөгдөх бүрд. Хоосон болоход (нийтэлсэн /
  // болиулсан) устгана, гэхдээ зөвхөн сэргээх шат ӨНГӨРСӨН багцынхыг: багц
  // солих үеийн setPending({}) шинэ багцын хуучин ноорогийг дарж болохгүй.
  useEffect(() => {
    if (!Object.keys(pending).length) {
      if (promptedPkgRef.current === pkg.key) clearDraftLS(pkg.key);
      return;
    }
    saveDraftLS(pkg.key, { t: Date.now(), cells: Object.entries(pending) });
  }, [pending, pkg.key]);

  // Таб хаах/refresh — нийтлээгүй засвартай үед хөтөч анхааруулна.
  useEffect(() => {
    if (!dirtyCount) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome legacy — returnValue заавал онооно
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyCount]);

  /** Багц/хувилбар солихын өмнө нийтлээгүй засварыг баталгаажуулна. */
  const confirmSwitch = () =>
    dirtyCount === 0 ||
    window.confirm(
      `Нийтлэгдээгүй ${dirtyCount} өөрчлөлт бий. Багц солих уу?\n` +
        "(Нүдний засварууд ноорог болон хадгалагдаж, буцаж ирэхэд сэргээхийг санал болгоно.)",
    );

  const publish = useCallback(async () => {
    // ⚠️ busy — Ctrl+S auto-repeat үед олон зэрэгцээ applyEdits илгээгдэхээс сэргийлнэ.
    if (busy || asOf == null || dirtyCount === 0 || !sc) return;
    setBusy(true);
    setErr("");
    try {
      // ⚠️ Зэрэг засварын хамгаалалт: `rows` нь хуудсыг НЭЭХ үеийн хуулбар тул
      // түүгээр бүтэн мөр бичвэл өөр хэрэглэгчийн хооронд нийтэлсэн нүд хуучин
      // утгаар дарагдаж чимээгүй буцдаг. Тиймээс нийтлэхийн өмнө мөрүүдийг
      // ШИНЭЭР татаж, зөвхөн өөрийн pending нүдийг давхарлаад бүлгийн
      // нийлбэрүүдийг шинэ өгөгдлөөс бодно.
      const fresh = (await loadRows(pkg, sc)).rows;
      const editedOids = new Set(
        Object.keys(pending).map((k) => Number(k.split(":")[0])),
      );
      // ⚠️ asOf ($BH$2) БҮХ мөрийн төлөвлөгөөт хувьд нөлөөлдөг тул огноо
      // өөрчлөгдсөн бол бүх мөрийг дахин бичнэ — эс тэгвэл зөвхөн засварласан
      // салбар шинэ огноогоор, бусад мөрийн F_PLAN хуучнаар үлдэж зөрнө.
      const idx =
        asOf !== asOfOrig
          ? fresh.map((_, i) => i)
          : touchedIndexes(fresh, editedOids);
      const c = computeAll(fresh, nBld, asOf, pending);
      const updates = idx.map((i) => {
        const a: Record<string, unknown> = { [sc.f.oid]: fresh[i].oid };
        for (let b = 0; b < nBld; b++) {
          a[sc.act[b]] = c[i].act[b];
          a[sc.plan[b]] = c[i].plan[b];
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
      if (asOf !== asOfOrig && fresh.length && sc.f.asOf)
        updates.push({ [sc.f.oid]: fresh[0].oid, [sc.f.asOf]: asOf });
      await applyUpdates(pkg, updates);
      // Шинэ татсан мөрүүд дээр хадгалсан утгыг буулгаж локал төлвийг солино —
      // бусдын зэрэгцээ засвар ч ингэж дэлгэцэнд шинэчлэгдэнэ.
      // (idx нь бүх мөр байж болох тул includes биш Set — O(n²) болгохгүй.)
      const idxSet = new Set(idx);
      setRows(
        fresh.map((r, i) =>
          idxSet.has(i) ? { ...r, act: c[i].act.slice() } : r,
        ),
      );
      setPending({});
      setAsOfOrig(asOf);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [pkg, sc, nBld, asOf, asOfOrig, pending, dirtyCount, busy]);

  // Ctrl+S — «Гүйцэтгэл бөглөх»-тэй ижил.
  // ⚠️ Нээлттэй нүдний бичиж буй утгыг ЭХЛЭЖ commit хийнэ — эс тэгвэл хуучин
  // pending-ээр нийтлээд, оролтын утга дараа нь blur дээр эргэж dirty болж
  // хэрэглэгч «хадгалагдсан» гэж андуурдаг байв. commit нь state-д дараагийн
  // render дээр л тусах тул нийтлэлийг дарааллуулж эффектээр гүйцээнэ.
  const [publishQueued, setPublishQueued] = useState(false);
  const flushEditRef = useRef<() => void>(() => {});
  flushEditRef.current = () => {
    if (edit && rows[edit.i]) commit(rows[edit.i], edit.b, val);
  };
  useEffect(() => {
    if (!publishQueued || edit) return;
    setPublishQueued(false);
    publish();
  }, [publishQueued, edit, publish]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushEditRef.current();
        setPublishQueued(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);

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
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <label className={st.field}>
          Багц{" "}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => {
              if (!confirmSwitch()) return;
              setPkg(pkgFloors(e.target.value)[0]);
            }}
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
              onChange={(e) => {
                if (!confirmSwitch()) return;
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg);
              }}
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
            disabled={busy}
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

      {/* Хоосон үр дүнг тайлбаргүй орхивол хэрэглэгч юу болсныг мэдэхгүй гацдаг. */}
      {!busy && !err && sc && rows.length === 0 && (
        <p className={st.muted}>Энэ багцад мөр олдсонгүй.</p>
      )}
      {rows.length > 0 && sc && calc.length === 0 && (
        <p className={st.muted}>
          Тайлангийн огноо тодорхойлогдоогүй тул хүснэгт бодогдохгүй байна —
          Огноо сонгоно уу (жагсаалт ачаалагдаагүй бол хуудсыг дахин ачаална уу).
        </p>
      )}

      {rows.length > 0 && sc && calc.length > 0 && (
        <div className={st.scroll}>
          <div className={st.tableWrap}>
          <div ref={colHlRef} className={st.colHl} aria-hidden="true" />
          <table
            className={cls("xl b32")}
            style={colStyle}
            onMouseOver={moveColHl}
            onMouseLeave={hideColHl}
          >
            <thead>
              <tr>
                <th scope="col" className={cls("fz c-no")}>№<i {...grip("no")} /></th>
                <th scope="col" className={cls("fz c-ajil")}>Ажил<i {...grip("ajil")} /></th>
                <th scope="col" className={cls("c-w")}>Хувийн жин<i {...grip("w")} /></th>
                <th scope="col" className={cls("c-w")} title="Нийт төсөлд эзлэх">Хувийн жин<i {...grip("w")} /></th>
                <th scope="col" className={cls("c-w")}>Хувийн жин- Одоо байгаа<i {...grip("w")} /></th>
                <th scope="col" className={cls("c-vol")}>Обьём<i {...grip("vol")} /></th>
                <th scope="col" className={cls("c-money")}>Нэгж өртөг<i {...grip("money")} /></th>
                <th scope="col" className={cls("c-money")}>Мөнгөн дүн<i {...grip("money")} /></th>
                <th scope="col" className={cls("c-calc")}>Төлөвлөгөөт гүйцэтгэл<i {...grip("calc")} /></th>
                <th scope="col" className={cls("c-calc")}>Бодит гүйцэтгэл<i {...grip("calc")} /></th>
                <th scope="col" className={cls("c-calc")}>Төлөвлөгөө биелэлт<i {...grip("calc")} /></th>
                {sc.bld.map((b) => (
                  <th scope="col" key={`a${b}`} className={cls("bld")}>{b}-гүйцэтгэл<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th scope="col" key={`p${b}`} className={cls("bld")}>{b} барилга -төлөвлөгөөт<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => [
                  <th scope="col" key={`s${b}`} className={cls("c-date")}>{b} барилга - Эхлэх<i {...grip("date")} /></th>,
                  <th scope="col" key={`e${b}`} className={cls("c-date")}>{b} барилга - Дуусах<i {...grip("date")} /></th>,
                ])}
                <th scope="col" className={cls("c-date")}>Шинэчлэгдсэн огноо<i {...grip("date")} /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (hidden[i]) return null;
                const c = calc[i];
                if (!c) return null;
                return (
                  <tr key={r.oid} className={r.group ? st.cat : undefined}>
                    <td className={cls("num fz c-no")}>{r.no}</td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                      title={r.work}
                    >
                      {r.group && (
                        /* button — гараар (Enter/Space) эвхэж дэлгэх боломжтой;
                           globals-ийн button reset .caret-ийн хэвийг хадгална. */
                        <button
                          type="button"
                          className={st.caret}
                          aria-expanded={!collapsed.has(r.oid)}
                          aria-label={collapsed.has(r.oid) ? "Дэлгэх" : "Эвхэх"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.oid);
                          }}
                        >
                          {collapsed.has(r.oid) ? "▸" : "▾"}
                        </button>
                      )}
                      {r.work}
                    </td>
                    <td className={cls("right c-w")} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td className={cls("right c-w calc")} title={full(c.E)}>
                      {wt(c.E)}
                    </td>
                    <td className={cls("right c-vol")}>{qty(r.vol)}</td>
                    <td className={cls("right c-money")}>{money(r.unit)}</td>
                    <td className={cls("right c-money")}>{money(c.H)}</td>
                    <td className={cls("num c-calc calc")}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc calc")}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc calc")}>{pc(c.K, 1)}</td>

                    {/* Бодит гүйцэтгэл — цорын ганц засагддаг блок. */}
                    {sc.bld.map((b, bi) => {
                      const key = `${r.oid}:${bi}`;
                      const dirty = key in pending;
                      if (edit && edit.i === i && edit.b === bi)
                        return (
                          <td key={`a${b}`} data-bi={bi} className={cls("num bld")} style={{ padding: 0 }}>
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
                          data-bi={bi}
                          className={cls(
                            "num bld" +
                              (r.group ? "" : " cursor-cell") +
                              (dirty ? " dirty" : ""),
                          )}
                          // ⚠️ Гар хандалт: Tab-аар очиж Enter/F2-оор нээнэ —
                          // хулганагүй хэрэглэгч огт орж чаддаггүй байв.
                          tabIndex={r.group ? undefined : 0}
                          onClick={() => {
                            if (r.group) return; // бүлгийн мөр бодогдоно, гараар засагдахгүй
                            setVal(pending[key] ?? origStr(r, bi));
                            setEdit({ i, b: bi });
                          }}
                          onKeyDown={
                            r.group
                              ? undefined
                              : (e) => {
                                  if (e.key === "Enter" || e.key === "F2") {
                                    e.preventDefault();
                                    setVal(pending[key] ?? origStr(r, bi));
                                    setEdit({ i, b: bi });
                                  }
                                }
                          }
                        >
                          {/* Аравны нэг — редакторын нарийвчлалтай ижил, эс
                              тэгвэл 60.5 нүд «61%» харагдаж худал мэт байв. */}
                          {pc(c.act[bi], 1)}
                        </td>
                      );
                    })}

                    {/* Барилга-төлөвлөгөөт — огноо + шинэчлэгдсэн огноогоор бодогдоно. */}
                    {sc.bld.map((b, bi) => (
                      <td key={`p${b}`} className={cls("num bld calc")}>
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {sc.bld.map((b, bi) => [
                      <td key={`s${b}`} className={cls("num c-date")}>
                        {dt(c.start[bi])}
                      </td>,
                      <td key={`e${b}`} className={cls("num c-date")}>
                        {dt(c.end[bi])}
                      </td>,
                    ])}
                    <td className={cls("num c-date")}>
                      {i === 0 ? dt(asOf) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
