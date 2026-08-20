'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t as tr } from '@/lib/i18nCore';
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
  no: tr('№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.'),
  wC: tr('Хувийн жин: Мөнгөн дүн ÷ дээд мөрийн дүн. Автоматаар бодогдоно.'),
  wD: tr('Хувийн жин (нийт төсөлд): Мөнгөн дүн ÷ үе шатны дүн. Автоматаар бодогдоно.'),
  wE: tr('Одоо байгаа: Хувийн жин × Бодит гүйцэтгэл. Гүйцэтгэл бөглөхөд өөрөө хөдөлнө.'),
  vol: tr('Обьём нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.'),
  vol2: tr('«Объём_шинэ2» нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй. Хоосон бол тэр багцад талбар нь үүсээгүй байна.'),
  unit: tr('Нэгж өртөг нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.'),
  money: tr('Мөнгөн дүн: Обьём × Нэгж өртөг; бүлгийн мөрд дэд мөрүүдийнхээ нийлбэр.'),
  I: tr('Төлөвлөгөөт гүйцэтгэл нь блокуудын төлөвлөгөөт хувийн дундаж. Огноог засвал өөрчлөгдөнө.'),
  J: tr('Бодит гүйцэтгэл нь блокуудын бодит хувийн дундаж. Блокийн нүдийг бөглөнө үү.'),
  K: tr('Төлөвлөгөө биелэлт: Бодит ÷ Төлөвлөгөөт. Автоматаар бодогдоно.'),
  groupAct: tr('Бүлгийн мөр нь дэд мөрүүдийнхээ жинтэй дунджаар бодогдоно — доод ажлын мөр дээр бөглөнө үү.'),
  blockPlan: tr('Барилга-төлөвлөгөөт нь эхлэх/дуусах огноо ба шинэчлэгдсэн огноогоор бодогдоно — огноог нь засаарай.'),
  groupDate: tr('Энэ огноо нь доод ажлуудынхаа хамгийн эрт эхлэх / хамгийн сүүл дуусахаар бодогдож байна — доод ажлынхаа огноог засаарай.'),
  noDateField: tr('Энэ блокт огнооны багана үйлчилгээнд байхгүй тул хадгалах газаргүй.'),
  asOfRow: tr('Шинэчлэгдсэн огноо зөвхөн эхний мөрд бичигдэнэ — тэндээс эсвэл дээд талын «Огноо»-гоор солино.'),
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
  /** Нээлттэй календар: аль нүднээс, ямар утгатай, хаана байрлах вэ. */
  const [pick, setPick] = useState<{
    kind: "s" | "e" | "asOf";
    row: SheetRow;
    b: number;
    value: string;
    rect: DOMRect;
  } | null>(null);

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
        // ⚠️ Анх нээхэд БҮХ давхарга ДЭЛГЭЭСТЭЙ (хэрэглэгчийн шийдвэр,
        // 2026-08-19): урьд нь гүн 2 хүртэл эвхээстэй байсныг болив —
        // бөглөх ажлын мөрүүд шууд харагдах ёстой. Багц солиход мөн адил.
        // (1400 мөр × 60 багана зурагдана; удаан санагдвал давхаргын
        // товчнуудаар 1–4 болгож хумина.)
        setCollapsed(new Set());
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
    // Утга угаас хувиар илэрхийлэгддэг тул төгсгөлийн «%»-ийг тэвчинэ.
    const t = raw.trim().replace(",", ".").replace(/\s*%$/, "");
    setEdit(null);
    if (t !== "" && !Number.isFinite(Number(t))) {
      // Чимээгүй хаявал хэрэглэгч «бичигдлээ» гэж андуурдаг — мэдэгдэнэ.
      setErr(tr('{0} · {1}: тоон утга оруулна уу.', sc?.bld[b] ?? "", r.work));
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
        tr('{0} · {1}: өмнө нь {2}% бүртгэгдсэн — бууруулах гэж байна. Зөв үү?', sc?.bld[b] ?? "", r.work, origStr(r, b)),
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
      tr('Нийтлэгдээгүй {0} нүдний засвар олдлоо ({1}).', Object.keys(next).length, when) +
      (dropped ? tr('\n{0} нүд хуучирсан тул орхигдоно.', dropped) : "") +
      tr('\nСэргээх үү?');
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
      tr('Нийтлэгдээгүй {0} өөрчлөлт бий. Багц солих уу?\n', dirtyCount) +
        tr('(Нүдний засварууд ноорог болон хадгалагдаж, буцаж ирэхэд сэргээхийг санал болгоно.)'),
    );
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
      // ⚠️ Зэрэг засварын хамгаалалт: `rows` нь хуудсыг НЭЭХ үеийн хуулбар тул
      // түүгээр бүтэн мөр бичвэл өөр хэрэглэгчийн хооронд нийтэлсэн нүд хуучин
      // утгаар дарагдаж чимээгүй буцдаг. Тиймээс нийтлэхийн өмнө мөрүүдийг
      // ШИНЭЭР татаж, зөвхөн өөрийн pending нүдийг давхарлаад бүлгийн
      // нийлбэрүүдийг шинэ өгөгдлөөс бодно.
      const fresh = (await loadRows(pkg, sc)).rows;
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
          ? fresh.map((_, i) => i)
          : touchedIndexes(fresh, editedOids);
      const c = computeAll(fresh, nBld, asOf, pending, pendDate);
      const updates = idx.map((i) => {
        const a: Record<string, unknown> = { [sc.f.oid]: fresh[i].oid };
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
      if (asOf !== asOfOrig && fresh.length && sc.f.asOf)
        updates.push({ [sc.f.oid]: fresh[0].oid, [sc.f.asOf]: asOf });
      await applyUpdates(pkg, updates);
      // Шинэ татсан мөрүүд дээр хадгалсан утгыг буулгаж локал төлвийг солино —
      // бусдын зэрэгцээ засвар ч ингэж дэлгэцэнд шинэчлэгдэнэ.
      // (idx нь бүх мөр байж болох тул includes биш Set — O(n²) болгохгүй.)
      const idxSet = new Set(idx);
      setRows(
        fresh.map((r, i) =>
          idxSet.has(i)
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
      if (hiddenNow()) return;
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
          {tr('Багц')}{" "}
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
            {tr('Хувилбар')}{" "}
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
          {tr('Огноо')}{" "}
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
            title={tr('Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно (excel-ийн «Шинэчлэгдсэн огноо»)')}
          >
            {dateOpts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <span className={st.field}>
          {tr('Давхарга')}
          <span className={st.layerBtns}>
            <button className={st.layerBtn} onClick={() => collapseToLayer(1)} title={tr('Үе шат')}>1</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(2)} title={tr('+ дэд үе шат')}>2</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(3)} title={tr('+ ангилал')}>3</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(4)} title={tr('+ бүлэг')}>4</button>
            <button className={st.layerBtn} onClick={() => collapseToLayer(5)} title={tr('Бүх ажил дэлгэх')}>{tr('Бүгд')}</button>
          </span>
        </span>
        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title={tr('Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана')}
          >
            {tr('Өргөн сэргээх')}
          </button>
        )}
        <button
          className={st.publishBtn}
          onClick={publish}
          disabled={busy || dirtyCount === 0}
          title={tr('Өөрчилсөн нүд + дээд бүлгүүдийн нийлбэрийг хадгална (Ctrl+S)')}
        >
          {tr('Нийтлэх')}{dirtyCount ? ` (${dirtyCount})` : ""}
        </button>
        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}
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
        <p className={st.muted}>{tr('Энэ багцад мөр олдсонгүй.')}</p>
      )}
      {rows.length > 0 && sc && calc.length === 0 && (
        <p className={st.muted}>
          {tr('Тайлангийн огноо тодорхойлогдоогүй тул хүснэгт бодогдохгүй байна — Огноо сонгоно уу (жагсаалт ачаалагдаагүй бол хуудсыг дахин ачаална уу).')}
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
            {/* ТОЛГОЙ нь `*_final_system` хуудасны бүтэц: 4 мөрт бүлэглэсэн.
                Мөр ба багана нь `*_final_publish`-тэйгээ ижил тул тооцоо
                хөндөгдөхгүй — зөвхөн дүрслэл. */}
            <thead>
              <tr>
                <th rowSpan={4} className={cls("fz c-no")}>№<i {...grip("no")} /></th>
                <th rowSpan={4} className={cls("fz c-ajil")}>{tr('Ажил')}<i {...grip("ajil")} /></th>
                {/* Excel-д C1:D4 — «Хувийн жин» хоёр баганыг бүрэн хамарна.
                    ⚠️ Энд `c-w` өргөний ангилал ТАВИХГҮЙ: 72px нь хоёр баганын
                    НИЙЛБЭР болж уншигдаж, хоёуланг нь шахна. Өргөнийг мөрийн
                    нүднүүд өөрсдөө заана. */}
                <th rowSpan={4} colSpan={2} className={cls("c-wspan")}>{tr('Хувийн жин')}<i {...grip("w")} /></th>
                <th rowSpan={4} className={cls("c-now")}>{tr('Одоо байгаа хувийн жин')}<i {...grip("now")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьём')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьём шинэ')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөөт гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Бодит гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөө биелэлт')}<i {...grip("calc")} /></th>
                <th colSpan={nBld} className={cls("band")}>{tr('Ажил гүйцэтгэл (')}{nBld} {tr('барилга)')}</th>
                <th colSpan={nBld} className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл (')}{nBld} {tr('барилга)')}</th>
                <th colSpan={nBld * 2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь (')}{nBld} {tr('барилга)')}</th>
                <th rowSpan={4} className={cls("c-date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("date")} /></th>
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
                  <th key={`p${b}`} rowSpan={2} className={cls("bld")}>{b} {tr('барилга')}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} {tr('барилга')}</th>
                ))}
              </tr>
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах */}
              <tr>
                {sc.bld.map((b) => [
                  <th key={`s${b}`} className={cls("c-date")}>{tr('Эхлэх')}<i {...grip("date")} /></th>,
                  <th key={`e${b}`} className={cls("c-date")}>{tr('Дуусах')}<i {...grip("date")} /></th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (hidden[i]) return null;
                const c = calc[i];
                if (!c) return null;
                return (
                  <tr key={r.oid} className={r.group ? st.cat : undefined}>
                    <td className={cls("num fz c-no")} {...ro(RO.no)}>{r.no}</td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                      {...ro(RO.no)}
                      title={r.work}
                    >
                      {r.group && (
                        /* button — гараар (Enter/Space) эвхэж дэлгэх боломжтой;
                           globals-ийн button reset .caret-ийн хэвийг хадгална. */
                        <button
                          type="button"
                          className={st.caret}
                          aria-expanded={!collapsed.has(r.oid)}
                          aria-label={collapsed.has(r.oid) ? tr('Дэлгэх') : tr('Эвхэх')}
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
                    <td className={cls("right c-w")} {...ro(RO.wC)} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} {...ro(RO.wD)} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td className={cls("right c-w calc")} {...ro(RO.wE)} title={full(c.E)}>
                      {wt(c.E)}
                    </td>
                    <td className={cls("right c-vol")} {...ro(RO.vol)}>{qty(r.vol)}</td>
                    <td className={cls("right c-vol")} {...ro(RO.vol2)}>{qty(r.vol2)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.I)}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.J)}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.K)}>{pc(c.K, 1)}</td>

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
                            // Бүлгийн мөр бодогдоно — гараар засагдахгүй
                            if (r.group) return say(RO.groupAct);
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
                      <td
                        key={`p${b}`}
                        className={cls("num bld calc")}
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
                            title={
                              editable
                                ? tr('Дарж календараар сонгоно')
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
                        title={i === 0 ? tr('Дарж календараар сонгоно') : RO.asOfRow}
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
          <b>{tr('Энэ нүд засагдахгүй.')}</b> {notice}
        </div>
      )}
    </div>
  );
}
